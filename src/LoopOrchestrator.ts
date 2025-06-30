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
    aborted: boolean;
}

type OrchestratorEvents = {
    'started': [input: LoopInput];
    'progress': [progress: LoopProgress];
    'error': [message: string];
    'aborted': [message: string];
};

export class LoopOrchestrator extends EventEmitter<OrchestratorEvents> {
    private client: OpenRouterClient;
    private prompts: OrchestratorPrompts;
    private stopRequested = false;
    private abortController: AbortController | null = null;
    private currentIteration = 0;
    private isRunning = false;

    constructor(client: OpenRouterClient, prompts?: OrchestratorPrompts) {
        super();
        this.client = client;
        this.prompts = prompts || { ...defaultPrompts };
    }

    public requestStop() {
        this.stopRequested = true;
        if (this.abortController) {
            this.abortController.abort();
        }
        // Also abort any ongoing API requests in the client
        this.client.abort();
    }

    public isLoopRunning(): boolean {
        return this.isRunning;
    }

    public getCurrentIteration(): number {
        return this.currentIteration;
    }

    /**
     * Rates existing content without generating new content or looping.
     * This is a standalone rating function that doesn't modify the content.
     */
    public async rateContent(prompt: string, content: string, criteria: QualityCriterion[]): Promise<Rating[]> {
        if (!content || content.trim() === '') {
            throw new Error('No content provided for rating');
        }

        if (!criteria || criteria.length === 0) {
            throw new Error('No criteria provided for rating');
        }

        this.abortController = new AbortController();
        const maxRetries = 3;
        let ratingsFromAI: Rating[] | null = null;
        let lastRatingResponse = '';

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (this.stopRequested) {
                throw new Error('Rating aborted by user');
            }

            const raterPrompt = this.createAllCriteriaRaterPrompt(prompt, content, criteria);
            try {
                lastRatingResponse = await this.client.chat('rater', raterPrompt, undefined, this.abortController.signal);
                ratingsFromAI = this.parseAllRatings(lastRatingResponse, criteria);

                if (ratingsFromAI) {
                    break; // Success
                }
                console.warn(`Rater response parsing failed on attempt ${attempt + 1}. Retrying...`);

            } catch(e: any) {
                if (e.message === 'Request was aborted' || this.stopRequested) {
                    throw new Error('Rating aborted by user');
                }
                console.warn(`Rater API call failed on attempt ${attempt + 1}. Retrying...`, e);
            }
        }

        if (!ratingsFromAI) {
            throw new Error(`The AI Rater failed to provide a valid response after ${maxRetries} retries.\n\nLast AI Response:\n"${lastRatingResponse}"`);
        }

        this.abortController = null;
        return ratingsFromAI;
    }

    public async runLoop(input: LoopInput): Promise<LoopResult> {
        this.stopRequested = false; // Reset flag at the start of a run
        this.abortController = new AbortController();
        this.isRunning = true;
        this.currentIteration = 0;
        
        // Emit started event immediately for UI to show initial state
        this.emit('started', input);
        
        const { prompt, criteria, maxIterations } = input;
        const history: LoopHistoryItem[] = [];
        let currentResponse = '';
        let success = false;
        let aborted = false;
        const totalStepsInIteration = 3; // 1. Creator, 2. Rater, 3. Editor

        try {
            // Determine the initial prompt and response
            let initialPrompt: string;
            if (input.initialContent) {
                currentResponse = input.initialContent;
                // The "initial prompt" for a refinement is the refinement instruction itself.
                initialPrompt = input.prompt; 
                // We don't need to call the LLM for the first response, but we record it in history.
                const initialCreatorPayload: CreatorPayload = { prompt: initialPrompt, response: currentResponse };
                history.push({ iteration: 0, type: 'creator', payload: initialCreatorPayload });

                this.emit('progress', { type: 'creator', payload: initialCreatorPayload, iteration: 0, maxIterations: maxIterations, step: 1, totalStepsInIteration });
            } else {
                // For generation from scratch, we build the initial prompt from the template.
                initialPrompt = this.prompts.content_generation_initial
                    .replace(/{{prompt}}/g, input.prompt)
                    .replace(/{{criteria}}/g, this.formatCriteriaAsJson(input.criteria));
                
                if (this.stopRequested) {
                    aborted = true;
                    throw new Error('Generation aborted by user');
                }

                // Emit progress BEFORE starting the API call to show "Creator working..." state
                this.emit('progress', { 
                    type: 'creator', 
                    payload: { prompt: initialPrompt, response: 'Creator is working...' }, 
                    iteration: 0, 
                    maxIterations: maxIterations, 
                    step: 1, 
                    totalStepsInIteration 
                });

                try {
                    currentResponse = await this.client.chat('creator', initialPrompt, undefined, this.abortController.signal);
                } catch (e: any) {
                    if (e.message === 'Request was aborted' || this.stopRequested) {
                        aborted = true;
                        throw new Error('Generation aborted by user');
                    }
                    throw new Error("The AI Creator failed to respond. Please check your API key and network connection.");
                }
                const creatorPayload: CreatorPayload = { prompt: initialPrompt, response: currentResponse };
                history.push({ iteration: 0, type: 'creator', payload: creatorPayload });

                // Emit progress AFTER getting the response to show final result
                this.emit('progress', { type: 'creator', payload: creatorPayload, iteration: 0, maxIterations: maxIterations, step: 1, totalStepsInIteration });
            }

            for (let i = 1; i <= maxIterations; i++) {
                this.currentIteration = i;
                
                if (this.stopRequested) {
                    aborted = true;
                    break;
                }

                this.emit('progress', { type: 'rater', payload: { criterion: 'Starting evaluation...', rating: { criterion: '', score: 0, justification: '', goal: 0}}, iteration: i, maxIterations, step: 2, totalStepsInIteration });

                let ratingsFromAI: Rating[] | null = null;
                let lastRatingResponse = '';
                const maxRetries = 3;

                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    if (this.stopRequested) {
                        aborted = true;
                        break;
                    }

                    const raterPrompt = this.createAllCriteriaRaterPrompt(prompt, currentResponse, criteria);
                    try {
                        lastRatingResponse = await this.client.chat('rater', raterPrompt, undefined, this.abortController.signal);
                        ratingsFromAI = this.parseAllRatings(lastRatingResponse, criteria);

                        if (ratingsFromAI) {
                            break; // Success
                        }
                        console.warn(`Rater response parsing failed on attempt ${attempt + 1}. Retrying...`);

                    } catch(e: any) {
                        if (e.message === 'Request was aborted' || this.stopRequested) {
                            aborted = true;
                            break;
                        }
                        console.warn(`Rater API call failed on attempt ${attempt + 1}. Retrying...`, e);
                    }
                }

                if (aborted) break;

                if (!ratingsFromAI) {
                    throw new Error(`The AI Rater failed to provide a valid response after ${maxRetries} retries.\n\nLast AI Response:\n"${lastRatingResponse}"`);
                }

                let allGoalsMet = true;
                const goalResults: string[] = [];
                for (const rating of ratingsFromAI) {
                    if (this.stopRequested) {
                        aborted = true;
                        break;
                    }

                    const ratingPayload: RaterProgressPayload = { criterion: rating.criterion, rating: rating };
                    this.emit('progress', { type: 'rater', payload: ratingPayload, iteration: i, maxIterations, step: 2, totalStepsInIteration });

                    const originalCriterion = criteria.find(c => c.name === rating.criterion);
                    if (originalCriterion && rating.score < originalCriterion.goal) {
                        allGoalsMet = false;
                        goalResults.push(`${rating.criterion}: ${rating.score}/${originalCriterion.goal} (FAILED)`);
                    } else if (originalCriterion) {
                        goalResults.push(`${rating.criterion}: ${rating.score}/${originalCriterion.goal} (PASSED)`);
                    }
                }

                if (aborted) break;

                if (!allGoalsMet && i < maxIterations) {
                    // 2. If not success, call Editor
                    const failedRatings = ratingsFromAI.filter(r => r.score < r.goal);
                    const editorPrompt = this.createEditorPrompt(currentResponse, failedRatings);
                    let editorAdvice: string;
                    
                    try {
                        editorAdvice = await this.client.chat('editor', editorPrompt, undefined, this.abortController.signal);
                    } catch(e: any) {
                        if (e.message === 'Request was aborted' || this.stopRequested) {
                            aborted = true;
                            break;
                        }
                        throw new Error("The AI Editor failed to provide feedback.");
                    }
                    
                    const editorPayload: EditorPayload = { prompt: editorPrompt, advice: editorAdvice };
                    history.push({ iteration: i, type: 'editor', payload: editorPayload });

                    this.emit('progress', { type: 'editor', payload: editorPayload, iteration: i, maxIterations, step: 3, totalStepsInIteration });

                    if (this.stopRequested) {
                        aborted = true;
                        break;
                    }

                    // 3. Call creator again to get the improved response
                    const creatorPrompt = this.createCreatorPrompt(prompt, criteria, history);
                    
                    // Emit progress BEFORE starting the API call to show "Creator working..." state
                    this.emit('progress', { 
                        type: 'creator', 
                        payload: { prompt: creatorPrompt, response: 'Creator is working on revision...' }, 
                        iteration: i, 
                        maxIterations, 
                        step: 1, 
                        totalStepsInIteration 
                    });
                    
                    try {
                        currentResponse = await this.client.chat('creator', creatorPrompt, undefined, this.abortController.signal);
                    } catch (e: any) {
                        if (e.message === 'Request was aborted' || this.stopRequested) {
                            aborted = true;
                            break;
                        }
                        throw new Error("The AI Creator failed to respond during revision. Please check your API key and network connection.");
                    }
                    const creatorPayload: CreatorPayload = { prompt: creatorPrompt, response: currentResponse };
                    history.push({ iteration: i, type: 'creator', payload: creatorPayload });
                    
                    // Emit progress AFTER getting the response to show final result
                    this.emit('progress', { type: 'creator', payload: creatorPayload, iteration: i, maxIterations, step: 1, totalStepsInIteration });

                } else {
                    // If goals are met or it's the last iteration, break the loop.
                    success = allGoalsMet;
                    break;
                }
            }

        } catch (error: any) {
            if (error.message === 'Generation aborted by user' || this.stopRequested) {
                aborted = true;
                this.emit('aborted', 'Generation was aborted by user');
            } else {
                throw error;
            }
        } finally {
            this.isRunning = false;
            this.abortController = null;
            this.currentIteration = 0;
        }

        return {
            finalResponse: currentResponse,
            history,
            iterations: history.filter(h => h.type === 'creator').length,
            success,
            aborted
        };
    }

    /**
     * Formats criteria as JSON for consistent presentation to AI models
     */
    private formatCriteriaAsJson(criteria: QualityCriterion[]): string {
        const formattedCriteria = criteria.map(c => {
            // Extract just the name part (before any period) for cleaner display
            const shortName = c.name.indexOf('.') > 0 ? c.name.substring(0, c.name.indexOf('.')) : c.name;
            return {
                name: shortName,
                description: c.description || shortName
            };
        });
        
        return JSON.stringify(formattedCriteria, null, 2);
    }

    private createCreatorPrompt(originalPrompt: string, criteria: QualityCriterion[], history?: LoopHistoryItem[]): string {
        const criteriaJson = this.formatCriteriaAsJson(criteria);

        if (!history) {
            return this.prompts.content_generation_initial
                .replace(/{{prompt}}/g, originalPrompt)
                .replace(/{{criteria}}/g, criteriaJson);
        }
        
        const lastEditorAdviceItem = history.filter(h => h.type === 'editor').pop();
        const lastCreatorResponseItem = history.filter(h => h.type === 'creator').pop();
        
        const lastEditorAdvice = (lastEditorAdviceItem?.payload as EditorPayload)?.advice || 'No advice was given.';
        const lastResponse = (lastCreatorResponseItem?.payload as CreatorPayload)?.response;

        return this.prompts.content_generation_iterative
            .replace(/{{prompt}}/g, originalPrompt)
            .replace(/{{lastResponse}}/g, lastResponse || '')
            .replace(/{{editorAdvice}}/g, lastEditorAdvice)
            .replace(/{{criteria}}/g, criteriaJson);
    }

    private createAllCriteriaRaterPrompt(prompt: string, response: string, criteria: QualityCriterion[]): string {
        const criteriaJson = this.formatCriteriaAsJson(criteria);
        
        return this.prompts.rater
            .replace(/{{originalPrompt}}/g, prompt)
            .replace(/{{response}}/g, response)
            .replace(/{{criteria}}/g, criteriaJson);
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
            .replace(/{{response}}/g, response)
            .replace(/{{ratings}}/g, JSON.stringify(ratings, null, 2));
    }

} 