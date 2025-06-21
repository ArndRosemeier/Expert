import { OpenRouterClient } from './OpenRouterClient';
import { OrchestratorPrompts, defaultPrompts } from './PromptManager';
import { CreatorPayload, EditorPayload, QualityCriterion } from './types';
import { EventEmitter } from './EventEmitter';

export interface LoopInput {
    prompt: string;
    criteria: QualityCriterion[];
    maxIterations: number;
    initialContent?: string;
    response: string;
}

export interface Rating {
    criterion: string;
    score: number;
    justification: string;
    goal: number;
}

export interface RaterProgressPayload {
    criterion: string;
    rating: Rating;
}

export type LoopProgressPayload = CreatorPayload | RaterProgressPayload | EditorPayload;

export interface LoopProgress {
    type: 'creator' | 'rater' | 'editor';
    payload: LoopProgressPayload;
    iteration: number;
    maxIterations: number;
    step: number;
    totalStepsInIteration: number;
}

export interface LoopHistoryItem {
    iteration: number;
    type: 'creator' | 'rater' | 'editor';
    payload: any; // Simplified for history
}

export interface LoopResult {
    finalResponse: string;
    history: LoopHistoryItem[];
    iterations: number;
    success: boolean;
}

type OrchestratorEvents = {
    'progress': [progress: LoopProgress];
    'error': [message: string];
};

export class LoopOrchestrator extends EventEmitter<OrchestratorEvents> {
    private client: OpenRouterClient;
    private prompts: OrchestratorPrompts;
    private stopRequested = false;

    constructor(client: OpenRouterClient, prompts?: OrchestratorPrompts) {
        super();
        this.client = client;
        this.prompts = prompts || { ...defaultPrompts };
    }

    public requestStop() {
        this.stopRequested = true;
    }

    public async runLoop(input: LoopInput): Promise<LoopResult> {
        this.stopRequested = false; // Reset flag at the start of a run
        const { prompt, criteria, maxIterations } = input;
        const history: LoopHistoryItem[] = [];
        let currentResponse = '';
        let success = false;
        const totalStepsInIteration = 3; // 1. Creator, 2. Rater, 3. Editor

        // Determine the initial prompt and response
        let initialPrompt: string;
        if (input.initialContent) {
            currentResponse = input.initialContent;
            // The "initial prompt" for a refinement is the refinement instruction itself.
            initialPrompt = input.prompt; 
            // We don't need to call the LLM for the first response, but we record it in history.
            const initialCreatorPayload: CreatorPayload = { prompt: initialPrompt, response: currentResponse };
            history.push({ iteration: 0, type: 'creator', payload: initialCreatorPayload });
            this.emit('progress', { type: 'creator', payload: initialCreatorPayload, iteration: 0, maxIterations: maxIterations, step: 0, totalStepsInIteration });
        } else {
            // For generation from scratch, we build the initial prompt from the template.
            initialPrompt = this.prompts.content_generation_initial
                .replace('{{prompt}}', input.prompt)
                .replace('{{criteria}}', input.criteria.map(c => c.name).join(', '));
            
            try {
                currentResponse = await this.client.chat('creator', initialPrompt);
            } catch (e) {
                throw new Error("The AI Creator failed to respond. Please check your API key and network connection.");
            }
            const creatorPayload: CreatorPayload = { prompt: initialPrompt, response: currentResponse };
            history.push({ iteration: 0, type: 'creator', payload: creatorPayload });
            this.emit('progress', { type: 'creator', payload: creatorPayload, iteration: 0, maxIterations: maxIterations, step: 1, totalStepsInIteration });
        }

        for (let i = 1; i <= maxIterations; i++) {
            if (this.stopRequested) break;
            
            this.emit('progress', { type: 'rater', payload: { criterion: 'Starting evaluation...', rating: { criterion: '', score: 0, justification: '', goal: 0}}, iteration: i, maxIterations, step: 2, totalStepsInIteration });

            let ratingsFromAI: Rating[] | null = null;
            const maxRetries = 3;

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const raterPrompt = this.createAllCriteriaRaterPrompt(prompt, currentResponse, criteria);
                try {
                    const ratingString = await this.client.chat('rater', raterPrompt);
                    ratingsFromAI = this.parseAllRatings(ratingString, criteria);

                    if (ratingsFromAI) {
                        break; // Success
                    }
                    console.warn(`Rater response parsing failed on attempt ${attempt + 1}. Retrying...`);

                } catch(e) {
                    console.warn(`Rater API call failed on attempt ${attempt + 1}. Retrying...`, e);
                }
            }

            if (!ratingsFromAI) {
                throw new Error(`The AI Rater failed to provide a valid response after ${maxRetries} retries.`);
            }

            let allGoalsMet = true;
            for (const rating of ratingsFromAI) {
                const ratingPayload: RaterProgressPayload = { criterion: rating.criterion, rating: rating };
                this.emit('progress', { type: 'rater', payload: ratingPayload, iteration: i, maxIterations, step: 2, totalStepsInIteration });

                const originalCriterion = criteria.find(c => c.name === rating.criterion);
                if (originalCriterion && rating.score < originalCriterion.goal) {
                    allGoalsMet = false;
                }
            }
            
            if (!allGoalsMet && i < maxIterations) {
                // 2. If not success, call Editor
                const failedRatings = ratingsFromAI.filter(r => r.score < r.goal);
                const editorPrompt = this.createEditorPrompt(currentResponse, failedRatings);
                let editorAdvice: string;
                try {
                    editorAdvice = await this.client.chat('editor', editorPrompt);
                } catch(e) {
                    throw new Error("The AI Editor failed to provide feedback.");
                }
                const editorPayload: EditorPayload = { prompt: editorPrompt, advice: editorAdvice };
                history.push({ iteration: i, type: 'editor', payload: editorPayload });
                this.emit('progress', { type: 'editor', payload: editorPayload, iteration: i, maxIterations, step: 3, totalStepsInIteration });

                // 3. Call creator again to get the improved response
                const creatorPrompt = this.createCreatorPrompt(prompt, criteria, history);
                try {
                    currentResponse = await this.client.chat('creator', creatorPrompt);
                } catch (e) {
                    throw new Error("The AI Creator failed to respond during revision. Please check your API key and network connection.");
                }
                const creatorPayload: CreatorPayload = { prompt: creatorPrompt, response: currentResponse };
                history.push({ iteration: i, type: 'creator', payload: creatorPayload });
                this.emit('progress', { type: 'creator', payload: creatorPayload, iteration: i, maxIterations, step: 1, totalStepsInIteration });

            } else {
                // If goals are met or it's the last iteration, break the loop.
                success = allGoalsMet;
                break;
            }
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
            return this.prompts.content_generation_initial
                .replace('{{prompt}}', originalPrompt)
                .replace('{{criteria}}', criteriaList);
        }
        
        const lastEditorAdviceItem = history.filter(h => h.type === 'editor').pop();
        const lastCreatorResponseItem = history.filter(h => h.type === 'creator').pop();
        
        const lastEditorAdvice = (lastEditorAdviceItem?.payload as EditorPayload)?.advice || 'No advice was given.';
        const lastResponse = (lastCreatorResponseItem?.payload as CreatorPayload)?.response;

        return this.prompts.content_generation_iterative
            .replace('{{prompt}}', originalPrompt)
            .replace('{{lastResponse}}', lastResponse || '')
            .replace('{{editorAdvice}}', lastEditorAdvice)
            .replace('{{criteria}}', criteriaList);
    }

    private createAllCriteriaRaterPrompt(prompt: string, response: string, criteria: QualityCriterion[]): string {
        const criteriaObject = criteria.reduce((obj, c) => {
            obj[c.name] = c.goal;
            return obj;
        }, {} as Record<string, number>);
        
        return this.prompts.rater
            .replace('{{originalPrompt}}', prompt)
            .replace('{{response}}', response)
            .replace('{{criteria}}', JSON.stringify(criteriaObject, null, 2));
    }

    private parseAllRatings(response: string, criteria: QualityCriterion[]): Rating[] | null {
        try {
            let jsonString: string | null = null;
            const jsonBlockMatch = response.match(/```json\s*(\[[\s\S]*?\])\s*```/s);

            if (jsonBlockMatch && jsonBlockMatch[1]) {
                jsonString = jsonBlockMatch[1];
            } else {
                const startIndex = response.indexOf('[');
                const endIndex = response.lastIndexOf(']');
                if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                    jsonString = response.substring(startIndex, endIndex + 1);
                }
            }

            if (jsonString) {
                const parsed = JSON.parse(jsonString);
                
                if (Array.isArray(parsed)) {
                    const ratings: Rating[] = [];
                    const criteriaMap = new Map(criteria.map(c => [c.name, c]));

                    for (const item of parsed) {
                        const originalCriterion = criteriaMap.get(item.criterion);
                        if (originalCriterion && typeof item.score === 'number' && typeof item.justification === 'string') {
                            ratings.push({
                                criterion: item.criterion,
                                score: item.score,
                                justification: item.justification,
                                goal: originalCriterion.goal,
                            });
                        } else {
                            console.warn('Parsed rating item is invalid or does not match an original criterion.', { item });
                            return null;
                        }
                    }
                    
                    if (ratings.length === criteria.length) {
                        return ratings;
                    } else {
                        console.warn('The number of returned ratings does not match the number of original criteria.');
                        return null;
                    }
                }
            }

            console.warn('Could not parse rating response as a valid JSON array.', { response });
            return null;

        } catch (error) {
            console.warn('Could not parse rating response as JSON, exception thrown.', { response, error });
            return null;
        }
    }

    private createEditorPrompt(response: string, ratings: Rating[]): string {
        return this.prompts.editor
            .replace('{{response}}', response)
            .replace('{{ratings}}', JSON.stringify(ratings, null, 2));
    }

    public on<K extends keyof OrchestratorEvents>(event: K, listener: (...args: OrchestratorEvents[K]) => void): void {
        // ... existing code ...
    }
} 