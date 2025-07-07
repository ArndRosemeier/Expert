import { OpenRouterClient } from './OpenRouterClient';
import { OrchestratorPrompts, defaultPrompts } from './PromptManager';
import { CreatorPayload, EditorPayload, QualityCriterion } from './types';
import { EventEmitter } from './EventEmitter';
import * as state from './state';
import { promptExpansionService } from './services/PromptExpansionService.js';
import { PromptContextBuilder } from './services/PromptContextBuilder.js';
import { formatCriteriaAsJson } from './ProjectUtils';

export interface LoopInput {
    prompt: string;
    criteria: QualityCriterion[];
    maxIterations: number;
    initialContent?: string;
    response: string;
    isLeafNode?: boolean; // Determines whether to use 'prose' or 'creator' model
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
    // Enhanced messaging fields
    modelName?: string;
    isFirstCreation?: boolean;
    isRevision?: boolean;
    isRejected?: boolean;
    contentType?: 'prose' | 'outline';
    isCompletion?: boolean;
    allCriteriaSatisfied?: boolean;
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

// New interface to track each iteration's performance
interface IterationResult {
    iteration: number;
    response: string;
    ratings: Rating[];
    failureScore: number;
    allGoalsMet: boolean;
}

type OrchestratorEvents = {
    'started': [input: LoopInput];
    'iteration-started': [iteration: number, maxIterations: number];
    'phase-started': [phase: 'create' | 'rate' | 'edit', iteration: number];
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
    private language: string = 'English'; // Default language

    constructor(client: OpenRouterClient, prompts?: OrchestratorPrompts) {
        super();
        this.client = client;
        this.prompts = prompts || { ...defaultPrompts };
    }

    /**
     * Set the language for content generation
     */
    public setLanguage(language: string): void {
        this.language = language;
    }

    /**
     * Get friendly model name for display in progress messages
     */
    private async getModelNameForPurpose(purpose: string): Promise<string> {
        try {
            const modelSelector = state.getModelSelector();
            if (!modelSelector) {
                return purpose.charAt(0).toUpperCase() + purpose.slice(1); // Fallback to purpose name
            }
            
            const selectedModels = modelSelector.getSelectedModels();
            const modelId = selectedModels[purpose];
            
            if (!modelId) {
                return purpose.charAt(0).toUpperCase() + purpose.slice(1); // Fallback to purpose name
            }
            
            // Try to get friendly name from available models
            try {
                const allModels = await this.client.fetchModels();
                const modelInfo = allModels.find(m => m.id === modelId);
                if (modelInfo && modelInfo.name) {
                    return modelInfo.name;
                }
            } catch (error) {
                console.warn('Failed to fetch models for name lookup:', error);
            }
            
            // Fallback: extract name from model ID
            const parts = modelId.split('/');
            const modelName = parts[parts.length - 1] || modelId;
            return modelName.charAt(0).toUpperCase() + modelName.slice(1).replace(/-/g, ' ');
            
        } catch (error) {
            console.warn('Failed to get model name for purpose:', purpose, error);
            return purpose.charAt(0).toUpperCase() + purpose.slice(1); // Fallback to purpose name
        }
    }

    public requestStop() {
        console.log('🛑 LoopOrchestrator: Stop requested');
        this.stopRequested = true;
        
        // Abort in parallel for faster response
        const abortPromises = [];
        
        if (this.abortController) {
            console.log('🛑 LoopOrchestrator: Aborting internal controller');
            abortPromises.push(Promise.resolve().then(() => this.abortController?.abort()));
        }
        
        // Also abort any ongoing API requests in the client
        console.log('🛑 LoopOrchestrator: Aborting OpenRouter client operations');
        abortPromises.push(Promise.resolve().then(() => this.client.abort()));
        
        // Execute all aborts in parallel for faster response
        Promise.all(abortPromises).then(() => {
            console.log('🛑 LoopOrchestrator: All abort operations completed');
        }).catch(error => {
            console.warn('🛑 LoopOrchestrator: Error during abort operations:', error);
        });
        
        // Emit abort event immediately for UI feedback
        this.emit('aborted', 'Generation aborted by user request');
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
        let creatorIteration = 1; // Track which creator iteration we're on
        const totalStepsInIteration = 3; // 1. Creator, 2. Rater, 3. Editor

        // Track iteration results for best attempt selection
        const iterationResults: IterationResult[] = [];

        // Determine which model to use based on node type
        const generationModel = input.isLeafNode ? 'prose' : 'creator';
        const contentType = input.isLeafNode ? 'prose' : 'outline';

        try {
            
            // Get model names for progress messaging
            const creatorModelName = await this.getModelNameForPurpose(generationModel);
            const raterModelName = await this.getModelNameForPurpose('rater');
            const editorModelName = await this.getModelNameForPurpose('editor');
            
            // Determine the initial prompt and response
            let initialPrompt: string;
            if (input.initialContent) {
                currentResponse = input.initialContent;
                // The "initial prompt" for a refinement is the refinement instruction itself.
                initialPrompt = input.prompt; 
                
                // Emit iteration started BEFORE processing the initial content
                this.emit('iteration-started', creatorIteration, maxIterations);
                
                // Emit phase started for the initial creation
                this.emit('phase-started', 'create', creatorIteration);
                
                // We don't need to call the LLM for the first response, but we record it in history.
                const initialCreatorPayload: CreatorPayload = { prompt: initialPrompt, response: currentResponse };
                history.push({ iteration: creatorIteration, type: 'creator', payload: initialCreatorPayload });

                this.emit('progress', { 
                    type: 'creator', 
                    payload: initialCreatorPayload, 
                    iteration: creatorIteration, 
                    maxIterations: maxIterations, 
                    step: 1, 
                    totalStepsInIteration,
                    modelName: creatorModelName,
                    isFirstCreation: true,
                    isRevision: false,
                    contentType: contentType
                });
            } else {
                // For generation from scratch, we build the initial prompt from the template.
                const context = PromptContextBuilder.fromLegacyParams(
                    { getLanguage: () => this.language, getCriteria: () => [] } as any,
                    {
                        prompt: input.prompt,
                        criteria: formatCriteriaAsJson(input.criteria),
                        language: this.language
                    }
                );
                initialPrompt = promptExpansionService.expandPrompt(this.prompts.content_generation_initial, context);
                
                if (this.stopRequested) {
                    aborted = true;
                    throw new Error('Generation aborted by user');
                }

                // Emit iteration started BEFORE the creator starts
                this.emit('iteration-started', creatorIteration, maxIterations);
                
                // Emit phase started for the initial creation
                this.emit('phase-started', 'create', creatorIteration);

                // Emit progress BEFORE starting the API call to show model working state
                this.emit('progress', { 
                    type: 'creator', 
                    payload: { prompt: initialPrompt, response: `${creatorModelName} is working...` }, 
                    iteration: creatorIteration, 
                    maxIterations: maxIterations, 
                    step: 1, 
                    totalStepsInIteration,
                    modelName: creatorModelName,
                    isFirstCreation: true,
                    isRevision: false,
                    contentType: contentType
                });

                try {
                    currentResponse = await this.client.chat(generationModel, initialPrompt, undefined, this.abortController.signal);
                } catch (e: any) {
                    if (e.message === 'Request was aborted' || this.stopRequested) {
                        console.log('🛑 LoopOrchestrator: Initial generation aborted');
                        aborted = true;
                        throw new Error('Generation aborted by user');
                    }
                    throw new Error(`The AI ${creatorModelName} failed to respond. Please check your API key and network connection.`);
                }
                const creatorPayload: CreatorPayload = { prompt: initialPrompt, response: currentResponse };
                history.push({ iteration: creatorIteration, type: 'creator', payload: creatorPayload });

                // Emit progress AFTER getting the response to show final result
                this.emit('progress', { 
                    type: 'creator', 
                    payload: creatorPayload, 
                    iteration: creatorIteration, 
                    maxIterations: maxIterations, 
                    step: 1, 
                    totalStepsInIteration,
                    modelName: creatorModelName,
                    isFirstCreation: true,
                    isRevision: false,
                    contentType: contentType
                });
            }

            for (let i = 1; i <= maxIterations; i++) {
                this.currentIteration = i;
                
                if (this.stopRequested) {
                    console.log(`🛑 LoopOrchestrator: Iteration ${i} aborted by user`);
                    aborted = true;
                    break;
                }

                // Emit systematic phase start event for rating
                this.emit('phase-started', 'rate', i);

                this.emit('progress', { 
                    type: 'rater', 
                    payload: { criterion: 'Starting evaluation...', rating: { criterion: '', score: 0, justification: '', goal: 0}}, 
                    iteration: i, 
                    maxIterations, 
                    step: 2, 
                    totalStepsInIteration,
                    modelName: raterModelName,
                    contentType: contentType
                });

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
                            console.log(`🛑 LoopOrchestrator: Rating aborted during attempt ${attempt + 1}`);
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
                    this.emit('progress', { 
                        type: 'rater', 
                        payload: ratingPayload, 
                        iteration: i, 
                        maxIterations, 
                        step: 2, 
                        totalStepsInIteration,
                        modelName: raterModelName,
                        contentType: contentType
                    });

                    const originalCriterion = criteria.find(c => c.name === rating.criterion);
                    if (originalCriterion && rating.score < originalCriterion.goal) {
                        allGoalsMet = false;
                        goalResults.push(`${rating.criterion}: ${rating.score}/${originalCriterion.goal} (FAILED)`);
                    } else if (originalCriterion) {
                        goalResults.push(`${rating.criterion}: ${rating.score}/${originalCriterion.goal} (PASSED)`);
                    }
                }

                if (aborted) break;

                // Store this iteration's result for best attempt selection
                const failureScore = this.calculateFailureScore(ratingsFromAI);
                const iterationResult: IterationResult = {
                    iteration: i,
                    response: currentResponse,
                    ratings: ratingsFromAI,
                    failureScore: failureScore,
                    allGoalsMet: allGoalsMet
                };
                iterationResults.push(iterationResult);

                if (!allGoalsMet && i < maxIterations) {
                    // Emit systematic phase start event for editing
                    this.emit('phase-started', 'edit', i);
                    
                    // 2. If not success, call Editor
                    const failedRatings = ratingsFromAI.filter(r => r.score < r.goal);
                    const editorPrompt = this.createEditorPrompt(currentResponse, failedRatings);
                    let editorAdvice: string;
                    
                    try {
                        editorAdvice = await this.client.chat('editor', editorPrompt, undefined, this.abortController.signal);
                    } catch(e: any) {
                        if (e.message === 'Request was aborted' || this.stopRequested) {
                            console.log('🛑 LoopOrchestrator: Editor aborted');
                            aborted = true;
                            break;
                        }
                        throw new Error("The AI Editor failed to provide feedback.");
                    }
                    
                    const editorPayload: EditorPayload = { prompt: editorPrompt, advice: editorAdvice };
                    history.push({ iteration: i, type: 'editor', payload: editorPayload });

                    this.emit('progress', { 
                        type: 'editor', 
                        payload: editorPayload, 
                        iteration: i, 
                        maxIterations, 
                        step: 3, 
                        totalStepsInIteration,
                        modelName: editorModelName,
                        isRejected: true,
                        contentType: contentType
                    });

                    if (this.stopRequested) {
                        aborted = true;
                        break;
                    }

                    // 3. Call the appropriate model again to get the improved response
                    // Increment creator iteration counter and emit iteration started before creator revision
                    creatorIteration++;
                    this.emit('iteration-started', creatorIteration, maxIterations);
                    
                    // Emit systematic phase start event for creation
                    this.emit('phase-started', 'create', creatorIteration);
                    
                    const creatorPrompt = this.createCreatorPrompt(prompt, criteria, history);
                    
                    // Emit progress BEFORE starting the API call to show model working state
                    this.emit('progress', { 
                        type: 'creator', 
                        payload: { prompt: creatorPrompt, response: `${creatorModelName} is working on revision...` }, 
                        iteration: creatorIteration, 
                        maxIterations, 
                        step: 1, 
                        totalStepsInIteration,
                        modelName: creatorModelName,
                        isFirstCreation: false,
                        isRevision: true,
                        contentType: contentType
                    });
                    
                    try {
                        currentResponse = await this.client.chat(generationModel, creatorPrompt, undefined, this.abortController.signal);
                    } catch (e: any) {
                        if (e.message === 'Request was aborted' || this.stopRequested) {
                            console.log('🛑 LoopOrchestrator: Creator revision aborted');
                            aborted = true;
                            break;
                        }
                        throw new Error(`The AI ${creatorModelName} failed to respond during revision. Please check your API key and network connection.`);
                    }
                    const creatorPayload: CreatorPayload = { prompt: creatorPrompt, response: currentResponse };
                    history.push({ iteration: creatorIteration, type: 'creator', payload: creatorPayload });
                    
                    // Emit progress AFTER getting the response to show final result
                    this.emit('progress', { 
                        type: 'creator', 
                        payload: creatorPayload, 
                        iteration: creatorIteration, 
                        maxIterations, 
                        step: 1, 
                        totalStepsInIteration,
                        modelName: creatorModelName,
                        isFirstCreation: false,
                        isRevision: true,
                        contentType: contentType
                    });

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

        // Select the best iteration based on failure score
        let finalResponse = currentResponse;
        let finalSuccess = success;
        
        if (!aborted && iterationResults.length > 0) {
            const bestIteration = this.selectBestIteration(iterationResults);
            finalResponse = bestIteration.response;
            finalSuccess = bestIteration.allGoalsMet;
        }

        // Emit final completion message
        if (!aborted) {
            const completionMessage = finalSuccess 
                ? `Done! All criteria satisfied.`
                : `Done! Not all criteria satisfied, best version selected.`;
            
            this.emit('progress', {
                type: 'creator',
                payload: { prompt: '', response: completionMessage },
                iteration: this.currentIteration,
                maxIterations: input.maxIterations,
                step: 3,
                totalStepsInIteration: 3,
                modelName: '',
                isFirstCreation: false,
                isRevision: false,
                contentType: contentType,
                isCompletion: true,
                allCriteriaSatisfied: finalSuccess
            });
        }

        return {
            finalResponse: finalResponse,
            history,
            iterations: history.filter(h => h.type === 'creator').length,
            success: finalSuccess,
            aborted
        };
    }



    private createCreatorPrompt(originalPrompt: string, criteria: QualityCriterion[], history?: LoopHistoryItem[]): string {
        const criteriaJson = formatCriteriaAsJson(criteria);

        if (!history) {
            const context = PromptContextBuilder.fromLegacyParams(
                { getLanguage: () => this.language, getCriteria: () => [] } as any,
                {
                    prompt: originalPrompt,
                    criteria: criteriaJson,
                    language: this.language
                }
            );
            return promptExpansionService.expandPrompt(this.prompts.content_generation_initial, context);
        }
        
        const lastEditorAdviceItem = history.filter(h => h.type === 'editor').pop();
        const lastCreatorResponseItem = history.filter(h => h.type === 'creator').pop();
        
        const lastEditorAdvice = (lastEditorAdviceItem?.payload as EditorPayload)?.advice || 'No advice was given.';
        const lastResponse = (lastCreatorResponseItem?.payload as CreatorPayload)?.response;

        const context = PromptContextBuilder.fromLegacyParams(
            { getLanguage: () => this.language, getCriteria: () => [] } as any,
            {
                prompt: originalPrompt,
                lastResponse: lastResponse || '',
                editorAdvice: lastEditorAdvice,
                criteria: criteriaJson,
                language: this.language
            }
        );
        return promptExpansionService.expandPrompt(this.prompts.content_generation_iterative, context);
    }

    private createAllCriteriaRaterPrompt(prompt: string, response: string, criteria: QualityCriterion[]): string {
        const criteriaJson = formatCriteriaAsJson(criteria);
        
        const context = PromptContextBuilder.fromLegacyParams(
            { getLanguage: () => this.language, getCriteria: () => [] } as any,
            {
                originalPrompt: prompt,
                response: response,
                criteria: criteriaJson,
                language: this.language
            }
        );
        return promptExpansionService.expandPrompt(this.prompts.rater, context);
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
        const context = PromptContextBuilder.fromLegacyParams(
            { getLanguage: () => this.language, getCriteria: () => [] } as any,
            {
                response: response,
                ratings: JSON.stringify(ratings, null, 2),
                language: this.language
            }
        );
        return promptExpansionService.expandPrompt(this.prompts.editor, context);
    }

    /**
     * Calculates the failure score for a set of ratings.
     * Failure score = sum of (goal - score) for all criteria that didn't meet their goal.
     * Criteria that met their goal contribute 0 to the failure score.
     */
    private calculateFailureScore(ratings: Rating[]): number {
        let failureScore = 0;
        for (const rating of ratings) {
            if (rating.score < rating.goal) {
                failureScore += (rating.goal - rating.score);
            }
        }
        return failureScore;
    }

    /**
     * Selects the best iteration result based on the lowest failure score.
     * If multiple iterations have the same failure score, selects the most recent one.
     */
    private selectBestIteration(iterationResults: IterationResult[]): IterationResult {
        if (iterationResults.length === 0) {
            throw new Error('No iteration results to select from');
        }

        let bestResult = iterationResults[0]!;
        for (let i = 1; i < iterationResults.length; i++) {
            const result = iterationResults[i]!;
            // Select if failure score is lower, or if same failure score but more recent iteration
            if (result.failureScore < bestResult.failureScore || 
                (result.failureScore === bestResult.failureScore && result.iteration > bestResult.iteration)) {
                bestResult = result;
            }
        }
        return bestResult;
    }

} 