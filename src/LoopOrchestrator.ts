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
    score: number;
    justification: string;
}

export interface LoopHistoryItem {
    iteration: number;
    type: 'creator' | 'rating' | 'editor';
    payload: any;
}

export interface LoopResult {
    finalResponse: string;
    history: LoopHistoryItem[];
    iterations: number;
    success: boolean;
}

export type ProgressCallback = (update: { type: 'creator' | 'rating' | 'editor', payload: any }) => void;

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

        for (let i = 0; i < maxIterations; i++) {
            if (this.stopRequested) break;
            
            // 1. Call Creator
            const creatorPrompt = this.createCreatorPrompt(prompt, criteria, i > 0 ? history : undefined);
            currentResponse = await this.client.chat('creator', creatorPrompt);
            const creatorPayload = { prompt: creatorPrompt, response: currentResponse };
            history.push({ iteration: i + 1, type: 'creator', payload: creatorPayload });
            onProgress?.({ type: 'creator', payload: creatorPayload });

            if (this.stopRequested) break;

            // 2. Call Rater for each criterion
            const ratings: Rating[] = [];
            let allGoalsMet = true;
            for (const criterion of criteria) {
                if (this.stopRequested) break;
                const ratingPrompt = this.createRatingPrompt(currentResponse, criterion, prompt);
                const ratingResponse = await this.client.chat('rating', ratingPrompt);
                const parsedRating = this.parseRatingResponse(ratingResponse, criterion.name);
                ratings.push(parsedRating);

                if (parsedRating.score < criterion.goal) {
                    allGoalsMet = false;
                }
            }
            if (this.stopRequested) break;
            
            history.push({ iteration: i + 1, type: 'rating', payload: { ratings } });
            onProgress?.({ type: 'rating', payload: { ratings } });
            
            // 3. Check for success
            if (allGoalsMet) {
                success = true;
                break;
            }

            if (this.stopRequested) break;

            // 4. If not success, call Editor
            const editorPrompt = this.createEditorPrompt(currentResponse, ratings);
            const editorAdvice = await this.client.chat('editor', editorPrompt);
            const editorPayload = { prompt: editorPrompt, advice: editorAdvice };
            history.push({ iteration: i + 1, type: 'editor', payload: editorPayload });
            onProgress?.({ type: 'editor', payload: editorPayload });
        }

        return {
            finalResponse: currentResponse,
            history,
            iterations: history.filter(h => h.type === 'creator').length,
            success,
        };
    }

    private createCreatorPrompt(originalPrompt: string, criteria: QualityCriterion[], history?: LoopHistoryItem[]): string {
        const criteriaList = criteria.map(c => c.name).join('\\n- ');

        if (!history) {
            return this.prompts.creator_initial
                .replace('{{prompt}}', originalPrompt)
                .replace('{{criteria}}', criteriaList);
        }
        
        const lastEditorAdvice = history.filter(h => h.type === 'editor').pop()?.payload.advice || 'No advice was given.';
        const lastResponse = history.filter(h => h.type === 'creator').pop()?.payload.response;

        return this.prompts.creator
            .replace('{{prompt}}', originalPrompt)
            .replace('{{lastResponse}}', lastResponse)
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

    private parseRatingResponse(response: string, criterionName: string): Rating {
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
                if (typeof parsed.score === 'number' && typeof parsed.justification === 'string') {
                    return { criterion: criterionName, ...parsed };
                }
            }
        } catch (error) {
            console.warn('Could not parse rating response as JSON, using fallback.', { response, error });
        }
        // Fallback if parsing fails
        return { criterion: criterionName, score: 1, justification: 'Could not parse rater response.' };
    }

    private createEditorPrompt(response: string, ratings: Rating[]): string {
        return this.prompts.editor
            .replace('{{response}}', response)
            .replace('{{ratings}}', JSON.stringify(ratings, null, 2));
    }
} 