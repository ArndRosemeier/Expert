import { OpenRouterClient } from './OpenRouterClient';
import { type OrchestratorPrompts, defaultPrompts } from './PromptManager';

export interface QualityCriterion {
    name: string;
    goal: number;
}

export interface LoopInput {
    prompt: string;
    criteria: QualityCriterion[];
    maxIterations: number;
}

export interface Rating {
    criterion: string;
    goal: number;
    score: number;
    justification: string;
}

export interface CreatorPayload {
    prompt: string;
    response: string;
}

export interface RatingPayload {
    ratings: Rating[];
}

export interface EditorPayload {
    prompt: string;
    advice: string;
}

export type ProgressUpdate = {
    iteration: number;
    maxIterations: number;
    step: number;
    totalStepsInIteration: number;
} & (
    | { type: 'creator', payload: CreatorPayload }
    | { type: 'rating', payload: RatingPayload }
    | { type: 'editor', payload: EditorPayload }
);

export interface LoopHistoryItem {
    iteration: number;
    type: ProgressUpdate['type'];
    payload: ProgressUpdate['payload'];
}

export interface LoopResult {
    finalResponse: string;
    history: LoopHistoryItem[];
    iterations: number;
    success: boolean;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export class LoopOrchestrator {
    private client: OpenRouterClient;
    private prompts: OrchestratorPrompts;
    private stopRequested = false;

    constructor(client: OpenRouterClient, prompts?: OrchestratorPrompts) {
        this.client = client;
        this.prompts = prompts || { ...defaultPrompts };
    }

    public requestStop() {
        this.stopRequested = true;
    }

    public async runLoop(input: LoopInput, onProgress?: ProgressCallback): Promise<LoopResult> {
        this.stopRequested = false; // Reset flag at the start of a run
        const { prompt, criteria, maxIterations } = input;
        const history: LoopHistoryItem[] = [];
        let currentResponse = '';
        let success = false;
        const totalStepsInIteration = 3; // 1. Creator, 2. Rater, 3. Editor

        for (let i = 0; i < maxIterations; i++) {
            if (this.stopRequested) break;
            
            // 1. Call Creator
            const creatorPrompt = this.createCreatorPrompt(prompt, criteria, i > 0 ? history : undefined);
            currentResponse = await this.client.chat('creator', creatorPrompt);
            const creatorPayload: CreatorPayload = { prompt: creatorPrompt, response: currentResponse };
            history.push({ iteration: i + 1, type: 'creator', payload: creatorPayload });
            onProgress?.({ type: 'creator', payload: creatorPayload, iteration: i + 1, maxIterations, step: 1, totalStepsInIteration });

            if (this.stopRequested) break;

            // 2. Call Rater for each criterion
            const ratingsFromAI: Rating[] = [];
            let allGoalsMet = true;
            for (const criterion of criteria) {
                if (this.stopRequested) break;
                const ratingPrompt = this.createRatingPrompt(currentResponse, criterion, prompt);
                const ratingResponse = await this.client.chat('rating', ratingPrompt);
                const parsedRating = this.parseRatingResponse(ratingResponse, criterion);
                ratingsFromAI.push(parsedRating);

                if (parsedRating.score < criterion.goal) {
                    allGoalsMet = false;
                }
            }
            if (this.stopRequested) break;
            
            // Sanitize payload for UI to ensure goal is always correct
            const uiRatings = ratingsFromAI.map((r, i) => ({
                criterion: criteria[i].name,
                goal: criteria[i].goal,
                score: r.score,
                justification: r.justification,
            }));

            const ratingPayload: RatingPayload = { ratings: uiRatings };
            history.push({ iteration: i + 1, type: 'rating', payload: ratingPayload });
            onProgress?.({ type: 'rating', payload: ratingPayload, iteration: i + 1, maxIterations, step: 2, totalStepsInIteration });
            
            // 3. Check for success
            if (allGoalsMet) {
                success = true;
                break;
            }

            if (this.stopRequested) break;

            // 4. If not success, call Editor
            const failedRatings = ratingsFromAI.filter(r => r.score < r.goal);
            const editorPrompt = this.createEditorPrompt(currentResponse, failedRatings);
            const editorAdvice = await this.client.chat('editor', editorPrompt);
            const editorPayload: EditorPayload = { prompt: editorPrompt, advice: editorAdvice };
            history.push({ iteration: i + 1, type: 'editor', payload: editorPayload });
            onProgress?.({ type: 'editor', payload: editorPayload, iteration: i + 1, maxIterations, step: 3, totalStepsInIteration });
        }

        return {
            finalResponse: currentResponse,
            history,
            iterations: history.filter(h => h.type === 'creator').length,
            success,
        };
    }

    private createCreatorPrompt(originalPrompt: string, criteria: QualityCriterion[], history?: LoopHistoryItem[]): string {
        // Helper to get the short name of a criterion
        const getShortCriterionName = (fullName: string): string => {
            const stopIndex = fullName.indexOf('.');
            return stopIndex > 0 ? fullName.substring(0, stopIndex) : fullName;
        };

        const criteriaList = criteria.map(c => getShortCriterionName(c.name)).join('\\n- ');

        if (!history) {
            return this.prompts.creator_initial
                .replace('{{prompt}}', originalPrompt)
                .replace('{{criteria}}', criteriaList);
        }
        
        const lastEditorAdviceItem = history.filter(h => h.type === 'editor').pop();
        const lastCreatorResponseItem = history.filter(h => h.type === 'creator').pop();
        
        const lastEditorAdvice = (lastEditorAdviceItem?.payload as EditorPayload)?.advice || 'No advice was given.';
        const lastResponse = (lastCreatorResponseItem?.payload as CreatorPayload)?.response;

        return this.prompts.creator
            .replace('{{prompt}}', originalPrompt)
            .replace('{{lastResponse}}', lastResponse || '')
            .replace('{{editorAdvice}}', lastEditorAdvice)
            .replace('{{criteria}}', criteriaList);
    }

    private createRatingPrompt(response: string, criterion: QualityCriterion, originalPrompt: string): string {
        return this.prompts.rater
            .replace('{{originalPrompt}}', originalPrompt)
            .replace('{{response}}', response)
            .replace('{{criterion}}', criterion.name)
            .replace('{{goal}}', String(criterion.goal));
    }

    private parseRatingResponse(response: string, criterion: QualityCriterion): Rating {
        let score = 1;
        let justification = `Could not parse rater response. Raw response: \n---\n${response}`;

        try {
            // First, try to find a JSON block within ```json ... ```
            let jsonString: string | null = null;
            const jsonBlockMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
            
            if (jsonBlockMatch && jsonBlockMatch[1]) {
                jsonString = jsonBlockMatch[1];
            } else {
                // If not in a block, find the first '{' and last '}'
                const startIndex = response.indexOf('{');
                const endIndex = response.lastIndexOf('}');
                if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                    jsonString = response.substring(startIndex, endIndex + 1);
                }
            }
            
            if (jsonString) {
                const parsed = JSON.parse(jsonString);
                if (typeof parsed.score === 'number') {
                    score = parsed.score;
                }
                if (typeof parsed.justification === 'string') {
                    justification = parsed.justification;
                }
            }
        } catch (error) {
            console.warn('Could not parse rating response as JSON, using fallback.', { response, error });
        }
        
        // Create a new, clean object to guarantee the structure.
        return {
            criterion: criterion.name,
            goal: criterion.goal,
            score: score,
            justification: justification,
        };
    }

    private createEditorPrompt(response: string, ratings: Rating[]): string {
        return this.prompts.editor
            .replace('{{response}}', response)
            .replace('{{ratings}}', JSON.stringify(ratings, null, 2));
    }
} 