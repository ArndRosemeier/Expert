import { EventEmitter } from './EventEmitter';
import { PromptContextBuilder } from './services/PromptContextBuilder.js';
import { formatCriteriaForRater } from './ProjectUtils';
import { SettingsManager } from './SettingsManager';
import { createPromptExpansionService } from './services/PromptExpansionService.js';
import { CreatorPayload, EditorPayload, QualityCriterion, MetricCriterion, isLLMCriterion } from './types';
import { OrchestratorPrompts, defaultPrompts } from './PromptManager';
import { OpenRouterClient } from './OpenRouterClient';
import { Rating } from './types/RatingTypes';
import {
    evaluateMetrics,
    formatCriteriaForCreator,
    splitCriteria
} from './quality/MetricEvaluator';
import * as state from './state';
import { XMLStoryParser } from './xml-story-creation/parser/XMLStoryParser';
import type { SystemCommand } from './xml-story-creation/types/XMLStoryTypes';
import { TargetedTextEditor } from './text-edit/TargetedTextEditor';

/** A targeted edit the editor could not apply (surfaced to the caller). */
export interface LoopFailedEdit {
    /** The search text or section the failed command targeted. */
    search: string;
    /** Why it could not be applied. */
    reason: string;
}

/** Body-edit command types the generation editor is allowed to emit. */
const SUPPORTED_EDIT_COMMANDS: ReadonlySet<SystemCommand['type']> = new Set([
    'replace_command',
    'append',
    'replace_section',
    'remove_section',
    'outline_replace'
]);

export interface LoopInput {
    prompt: string;
    criteria: QualityCriterion[];
    maxIterations: number;
    initialContent?: string;
    response: string;
    isLeafNode?: boolean; // Determines whether to use 'prose' or 'creator' model
    language?: string; // Captured language to prevent race conditions during generation
}



export interface LoopProgress {
    iteration: number;
    maxIterations: number;
    phase: 'create' | 'rate' | 'edit';
    payload?: CreatorPayload | EditorPayload | any; // Allow payload for progress updates
    ratings?: Rating[];
    failureScore?: number;
    progress?: number; // 0-100 percentage
}

export interface LoopHistoryItem {
    iteration: number;
    type: 'creator' | 'rater' | 'editor';
    payload: CreatorPayload | EditorPayload; // Fix: Replace any with proper union type
}

interface LoopResult {
    finalResponse: string;
    history: LoopHistoryItem[];
    iterations: number;
    success: boolean;
    aborted: boolean;
    /** Friendly display name of the model used to generate this content. */
    generationModelName: string;
    /** Targeted edits the editor could not apply across the whole loop. */
    failedEdits: LoopFailedEdit[];
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
    /** Max editor calls per failing rating iteration (initial try + retries). */
    private static readonly EDITOR_MAX_ATTEMPTS = 3;

    private client: OpenRouterClient;
    private prompts: OrchestratorPrompts;
    private stopRequested = false;
    private abortController: AbortController | null = null;
    private currentIteration = 0;
    private isRunning = false;
    private language: string = 'English'; // Default language
    private expansionService: ReturnType<typeof createPromptExpansionService>;

    constructor(settingsManager: SettingsManager, client: OpenRouterClient, prompts?: OrchestratorPrompts) {
        super();
        this.client = client;
        this.prompts = prompts ?? { ...defaultPrompts };
        this.expansionService = createPromptExpansionService(settingsManager);
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
                if (modelInfo?.name) {
                    return modelInfo.name;
                }
            } catch (error) {
                console.warn('Failed to fetch models for name lookup:', error);
            }
            
            // Fallback: extract name from model ID
            const parts = modelId.split('/');
            const modelName = parts[parts.length - 1] ?? modelId;
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
        abortPromises.push(Promise.resolve().then(() => { this.client.abort(); }));
        
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

        // Split criteria: LLM criteria are scored by the rater model, metric
        // criteria are evaluated locally and deterministically.
        const { llmCriteria, metricCriteria } = splitCriteria(criteria);

        // The rater is only invoked when there are LLM criteria to score.
        if (llmCriteria.length === 0) {
            ratingsFromAI = [];
        } else {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                if (this.stopRequested) {
                    throw new Error('Rating aborted by user');
                }

                const raterPrompt = this.createAllCriteriaRaterPrompt(prompt, content, llmCriteria);
                try {
                    lastRatingResponse = await this.client.chat('rater', raterPrompt, undefined, this.abortController.signal);
                    ratingsFromAI = this.parseAllRatings(lastRatingResponse, llmCriteria);

                    if (ratingsFromAI) {
                        break; // Success
                    }
                    console.warn(`Rater response parsing failed on attempt ${attempt + 1}. Retrying...`);

                } catch(e: unknown) {
                    const errorMessage = e instanceof Error ? e.message : 'Unknown error during rating';
                    console.error(`Rater API call failed on attempt ${attempt + 1}. Retrying...`, errorMessage);
                }
            }

            if (!ratingsFromAI) {
                throw new Error(`The AI Rater failed to provide a valid response after ${maxRetries} retries.\n\nLast AI Response:\n"${lastRatingResponse}"`);
            }
        }

        const metricRatings = evaluateMetrics(content, metricCriteria);

        this.abortController = null;
        return [...ratingsFromAI, ...metricRatings];
    }

    public async runLoop(input: LoopInput): Promise<LoopResult> {
        this.stopRequested = false; // Reset flag at the start of a run
        this.abortController = new AbortController();
        this.isRunning = true;
        this.currentIteration = 0;
        
        // CRITICAL: Use captured language from LoopInput to prevent race conditions
        if (input.language) {
            this.language = input.language;
            console.log(`🌐 Using captured language for generation: "${input.language}"`);
        }
        
        // Emit started event immediately for UI to show initial state
        this.emit('started', input);
        
        const { prompt, criteria, maxIterations } = input;
        // Split criteria once: the rater only scores LLM criteria; metric
        // criteria are evaluated locally. metricByName lets us resolve a metric
        // rating back to its weight when ranking failing attempts.
        const { llmCriteria, metricCriteria } = splitCriteria(criteria);
        const metricByName = new Map<string, MetricCriterion>(metricCriteria.map(m => [m.name, m]));
        const history: LoopHistoryItem[] = [];
        let currentResponse = '';
        let success = false;
        let aborted = false;
        let creatorIteration = 1; // Track which creator iteration we're on
        // const totalStepsInIteration = 3; // 1. Creator, 2. Rater, 3. Editor

        // Track iteration results for best attempt selection
        const iterationResults: IterationResult[] = [];

        // Targeted edits the editor could not apply, accumulated across iterations.
        const failedEdits: LoopFailedEdit[] = [];

        // Determine which model to use based on node type
        const generationModel = input.isLeafNode ? 'prose' : 'creator';
        // const contentType = input.isLeafNode ? 'prose' : 'outline';

        // Friendly name of the generating model, hoisted so it can be returned
        // in the LoopResult regardless of which exit path is taken.
        let generationModelName = '';

        try {
            
            // Get model names for progress messaging
            generationModelName = await this.getModelNameForPurpose(generationModel);
            const creatorModelName = generationModelName;
            // const raterModelName = await this.getModelNameForPurpose('rater');
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
                    iteration: creatorIteration, 
                    maxIterations: maxIterations, 
                    phase: 'create', 
                    payload: initialCreatorPayload, 
                    progress: 0,
                    failureScore: 0
                });
            } else {
                // For generation from scratch, we build the initial prompt from the template.
                const context = PromptContextBuilder.fromLegacyParams(
                    { getLanguage: () => this.language, getCriteria: () => [] } as any,
                    {
                        prompt: input.prompt,
                        // Include metric guidance so the creator is aware of the
                        // deterministic constraints up front, not just LLM criteria.
                        criteria: formatCriteriaForCreator(input.criteria),
                        language: this.language
                    }
                );
                initialPrompt = this.expansionService.expandPrompt(this.prompts.content_generation_initial, context, this.language);
                
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
                    iteration: creatorIteration, 
                    maxIterations: maxIterations, 
                    phase: 'create', 
                    payload: { prompt: initialPrompt, response: `${creatorModelName} is working...` }, 
                    progress: 0,
                    failureScore: 0
                });

                try {
                    currentResponse = await this.client.chat(generationModel, initialPrompt, undefined, this.abortController.signal);
                } catch (e: unknown) {
                    const errorMessage = e instanceof Error ? e.message : 'Unknown error during initial creation';
                    console.error('Creation failed:', errorMessage);
                    throw new Error(`Content generation failed: ${errorMessage}`);
                }
                const creatorPayload: CreatorPayload = { prompt: initialPrompt, response: currentResponse };
                history.push({ iteration: creatorIteration, type: 'creator', payload: creatorPayload });

                // Emit progress AFTER getting the response to show final result
                this.emit('progress', { 
                    iteration: creatorIteration, 
                    maxIterations: maxIterations, 
                    phase: 'create', 
                    payload: creatorPayload, 
                    progress: 0,
                    failureScore: 0
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
                    iteration: i, 
                    maxIterations: maxIterations, 
                    phase: 'rate', 
                    payload: { criterion: 'Starting evaluation...', rating: { criterion: 'Starting evaluation...', goal: 0, actual: 0, passed: false}}, 
                    progress: 0,
                    failureScore: 0
                });

                let ratingsFromAI: Rating[] | null = null;
                let lastRatingResponse = '';
                const maxRetries = 3;

                // The rater model is only invoked when there are LLM criteria.
                // With metric-only criteria the rater is skipped entirely.
                if (llmCriteria.length === 0) {
                    ratingsFromAI = [];
                } else {
                    for (let attempt = 0; attempt < maxRetries; attempt++) {
                        if (this.stopRequested) {
                            aborted = true;
                            break;
                        }

                        const raterPrompt = this.createAllCriteriaRaterPrompt(prompt, currentResponse, llmCriteria);
                        
                        // Add progress update to show rater is working (like creation and editing phases)
                        this.emit('progress', { 
                            iteration: i, 
                            maxIterations: maxIterations, 
                            phase: 'rate', 
                            payload: { criterion: 'AI is analyzing content...', rating: { criterion: 'AI is analyzing content...', goal: 0, actual: 0, passed: false}}, 
                            progress: 0,
                            failureScore: 0
                        });
                        
                        try {
                            lastRatingResponse = await this.client.chat('rater', raterPrompt, undefined, this.abortController.signal);
                            ratingsFromAI = this.parseAllRatings(lastRatingResponse, llmCriteria);

                            if (ratingsFromAI) {
                                break; // Success
                            }
                            console.warn(`Rater response parsing failed on attempt ${attempt + 1}. Retrying...`);

                        } catch(e: unknown) {
                            const errorMessage = e instanceof Error ? e.message : 'Unknown error during rating';
                            console.error('Rating failed:', errorMessage);
                            throw new Error(`Rating failed: ${errorMessage}`);
                        }
                    }
                }

                if (aborted) break;

                if (!ratingsFromAI) {
                    throw new Error(`The AI Rater failed to provide a valid response after ${maxRetries} retries.\n\nLast AI Response:\n"${lastRatingResponse}"`);
                }

                // Evaluate deterministic metrics locally and merge with LLM ratings.
                const metricRatings = evaluateMetrics(currentResponse, metricCriteria);
                const combinedRatings: Rating[] = [...ratingsFromAI, ...metricRatings];

                // Goal evaluation is strict: an iteration is "all goals met" only
                // when EVERY enabled criterion (LLM and metric alike) reaches its
                // goal. There is no soft exemption — if a check should not be able
                // to block, lower its goal or disable it.
                let allGoalsMet = true;
                const goalResults: string[] = [];
                for (const rating of combinedRatings) {
                    if (this.stopRequested) {
                        aborted = true;
                        break;
                    }

                    const failed = rating.actual < rating.goal;
                    if (failed) {
                        allGoalsMet = false;
                    }
                    goalResults.push(`${rating.criterion}: ${rating.actual}/${rating.goal} (${failed ? 'FAILED' : 'PASSED'})`);
                }

                if (aborted) break;

                // Emit progress with actual ratings after rating completion
                this.emit('progress', { 
                    iteration: i, 
                    maxIterations: maxIterations, 
                    phase: 'rate', 
                    payload: { ratings: combinedRatings, goalResults },
                    ratings: combinedRatings,
                    failureScore: this.calculateFailureScore(combinedRatings, metricByName),
                    progress: 0
                });

                // Store this iteration's result for best attempt selection
                const failureScore = this.calculateFailureScore(combinedRatings, metricByName);
                const iterationResult: IterationResult = {
                    iteration: i,
                    response: currentResponse,
                    ratings: combinedRatings,
                    failureScore: failureScore,
                    allGoalsMet: allGoalsMet
                };
                iterationResults.push(iterationResult);

                if (!allGoalsMet && i < maxIterations) {
                    // Emit systematic phase start event for editing
                    this.emit('phase-started', 'edit', i);

                    // The editor revises via TARGETED commands applied to the current
                    // text (no unconditional full rewrite). Misses are fed back for a
                    // bounded number of retries; edits that still cannot be applied are
                    // recorded so the caller can surface them on the node.
                    const editOutcome = await this.runEditorEdits(
                        prompt,
                        currentResponse,
                        combinedRatings,
                        criteria,
                        generationModel === 'prose',
                        i,
                        maxIterations,
                        editorModelName
                    );

                    if (this.stopRequested) {
                        aborted = true;
                        break;
                    }

                    for (const dropped of editOutcome.dropped) {
                        failedEdits.push(dropped);
                    }

                    const editorPayload: EditorPayload = { prompt: '(targeted edits)', revisedText: editOutcome.text };
                    history.push({ iteration: i, type: 'editor', payload: editorPayload });
                    this.emit('progress', {
                        iteration: i,
                        maxIterations: maxIterations,
                        phase: 'edit',
                        payload: editorPayload,
                        progress: 0,
                        failureScore: 0
                    });

                    // The edited text becomes the candidate for the next rating pass.
                    // We surface it as a new "create" iteration so the existing
                    // persistence path (which captures content from the 'create' phase)
                    // snapshots it for best-iteration selection.
                    currentResponse = editOutcome.text;
                    creatorIteration++;
                    this.emit('iteration-started', creatorIteration, maxIterations);
                    this.emit('phase-started', 'create', creatorIteration);

                    const revisedPayload: CreatorPayload = { prompt: '(targeted edits)', response: currentResponse };
                    history.push({ iteration: creatorIteration, type: 'creator', payload: revisedPayload });

                    this.emit('progress', { 
                        iteration: creatorIteration, 
                        maxIterations: maxIterations, 
                        phase: 'create', 
                        payload: revisedPayload, 
                        progress: 0,
                        failureScore: 0
                    });

                } else {
                    // If goals are met or it's the last iteration, break the loop.
                    success = allGoalsMet;
                    break;
                }
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown orchestration error';
            console.error('Loop failed:', errorMessage);
            
            this.emit('error', `Loop failed: ${errorMessage}`);
            
            return {
                finalResponse: input.response,
                history: [],
                iterations: 0,
                success: false,
                aborted: false,
                generationModelName: generationModelName,
                failedEdits: failedEdits
            };
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
                iteration: this.currentIteration,
                maxIterations: input.maxIterations,
                phase: 'create',
                payload: { prompt: '', response: completionMessage },
                progress: 0,
                failureScore: 0
            });
        }

        return {
            finalResponse: finalResponse,
            history,
            iterations: history.filter(h => h.type === 'creator').length,
            success: finalSuccess,
            aborted,
            generationModelName: generationModelName,
            failedEdits: failedEdits
        };
    }



    private createAllCriteriaRaterPrompt(prompt: string, response: string, criteria: QualityCriterion[]): string {
        const criteriaJson = formatCriteriaForRater(criteria);
        

        
        const context = PromptContextBuilder.fromLegacyParams(
            { getLanguage: () => this.language, getCriteria: () => [] } as any,
            {
                originalPrompt: prompt,
                response: response,
                criteria: criteriaJson,
                language: this.language
            }
        );
        return this.expansionService.expandPrompt(this.prompts.rater, context, this.language);
    }

    private parseAllRatings(response: string, criteria: QualityCriterion[]): Rating[] | null {
        try {
            let jsonString: string | null = null;
            const jsonBlockMatch = response.match(/```json\s*(\[[\s\S]*?\])\s*```/s);

            if (jsonBlockMatch?.[1]) {
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
                        const originalCriterion = criteriaMap.get(item.criterion);  // Fix: Use item.criterion
                        if (originalCriterion && typeof item.score === 'number' && typeof item.justification === 'string') {
                            const isBinary = isLLMCriterion(originalCriterion) && originalCriterion.binary === true;
                            // For binary constraints, store the actual constraint instruction
                            // as the criterion label rather than the opaque internal name
                            // ("Constraint 1"). The rater still echoes the internal name,
                            // which we already used (item.criterion) to resolve originalCriterion.
                            const criterionLabel = isBinary && isLLMCriterion(originalCriterion) && originalCriterion.description
                                ? originalCriterion.description
                                : item.criterion;
                            ratings.push({
                                criterion: criterionLabel,
                                goal: originalCriterion.goal,
                                actual: item.score,
                                passed: item.score >= originalCriterion.goal,
                                description: item.justification,
                                binary: isBinary
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

    private createEditorPrompt(originalPrompt: string, response: string, ratings: Rating[], criteria: QualityCriterion[], isLeafNode: boolean, priorFailures: string = ''): string {
        // The editor sees every criterion so it does not break passing ones while
        // fixing the failures. Failed criteria are clearly marked for emphasis.
        const ratingsBlock = ratings.map(r => {
            const failed = r.actual < r.goal;
            const marker = failed ? '[FAILED]' : '[ok]';
            const detail = r.description ? ` - ${r.description}` : '';
            return `${marker} ${r.criterion}: ${r.actual}/${r.goal}${detail}`;
        }).join('\n');

        // Binary constraints are stripped from the passive context, so spell out
        // their instruction here; otherwise the editor only sees the opaque name.
        const binaryConstraints = criteria.filter(c => isLLMCriterion(c) && c.binary === true);
        const constraintsBlock = binaryConstraints.length > 0
            ? `\nThese binary constraints MUST be fully satisfied (each is a hard pass/fail):\n`
                + binaryConstraints.map(c => `- ${c.name}: ${c.description ?? c.name}`).join('\n') + '\n'
            : '';

        const nodeKind = isLeafNode
            ? 'final prose for the reader (not a summary or outline)'
            : 'a structured outline (not finished prose)';

        const context = PromptContextBuilder.fromLegacyParams(
            { getLanguage: () => this.language, getCriteria: () => [] } as any,
            {
                originalPrompt: originalPrompt,
                response: response,
                ratings: ratingsBlock,
                constraints: constraintsBlock,
                nodeKind: nodeKind,
                priorFailures: priorFailures,
                language: this.language
            }
        );
        return this.expansionService.expandPrompt(this.prompts.editor, context, this.language);
    }

    /**
     * Run the editor over the current text using targeted edit commands. Applies
     * the commands the editor returns, feeds any unmatched ones back for a bounded
     * number of retries, and returns the resulting text plus the edits that could
     * not be applied within the retry budget. The editor may also choose a
     * full-body replace (outline_replace), which always applies.
     */
    private async runEditorEdits(
        originalPrompt: string,
        currentText: string,
        ratings: Rating[],
        criteria: QualityCriterion[],
        isLeafNode: boolean,
        iteration: number,
        maxIterations: number,
        editorModelName: string
    ): Promise<{ text: string; dropped: LoopFailedEdit[] }> {
        const parser = new XMLStoryParser();
        let text = currentText;
        let priorFailures = '';
        let dropped: LoopFailedEdit[] = [];

        for (let attempt = 1; attempt <= LoopOrchestrator.EDITOR_MAX_ATTEMPTS; attempt++) {
            const editorPrompt = this.createEditorPrompt(originalPrompt, text, ratings, criteria, isLeafNode, priorFailures);

            this.emit('progress', {
                iteration: iteration,
                maxIterations: maxIterations,
                phase: 'edit',
                payload: { prompt: editorPrompt, revisedText: `${editorModelName} is editing...` },
                progress: 0,
                failureScore: 0
            });

            let editorOutput: string;
            try {
                editorOutput = await this.client.chat('editor', editorPrompt, undefined, this.abortController!.signal);
            } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error during editing';
                console.error('Editing failed:', errorMessage);
                throw new Error(`Content editing failed: ${errorMessage}`);
            }

            if (this.stopRequested) {
                break;
            }

            // Context commands are out of scope for the generation editor.
            const parsed = parser.parseResponse(editorOutput, undefined, { includeContextCommands: false });
            const commands = parsed.systemCommands.filter(c => SUPPORTED_EDIT_COMMANDS.has(c.type));

            if (commands.length === 0) {
                // Editor produced no actionable commands: nothing to apply. Either it
                // judged the text fine or it replied off-spec. Stop; rating re-runs.
                dropped = [];
                break;
            }

            const { newText, results } = TargetedTextEditor.apply(text, commands);
            text = newText;

            const failures = results.filter(r => !r.ok);
            if (failures.length === 0) {
                dropped = [];
                break;
            }

            // Carry the still-failing edits forward: feed them back on the next
            // attempt, and record them as dropped if the budget runs out.
            dropped = failures.map(f => ({
                search: this.describeCommandTarget(f.command),
                reason: f.message
            }));
            priorFailures = this.formatPriorFailures(failures);
        }

        return { text, dropped };
    }

    /** Short identifier for a command's target, for failure reporting. */
    private describeCommandTarget(command: SystemCommand): string {
        if (command.type === 'replace_command') {
            return command.searchText ?? '(missing search text)';
        }
        if (command.type === 'replace_section' || command.type === 'remove_section') {
            return `section "${command.sectionTitle ?? '(missing title)'}"`;
        }
        return command.type;
    }

    /**
     * Build the feedback block injected into the next editor attempt, listing the
     * commands that could not be applied and why.
     */
    private formatPriorFailures(failures: Array<{ command: SystemCommand; message: string }>): string {
        const lines = failures
            .map(f => `- ${this.describeCommandTarget(f.command)}: ${f.message}`)
            .join('\n');
        return `Your previous edit commands below could NOT be applied and were skipped. Re-express ONLY these against the CURRENT text shown above (copy the search text verbatim and make it unique), or use <outline_replace> if a fix genuinely cannot be localized:\n${lines}`;
    }

    /**
     * Calculates the weighted failure score for a set of ratings.
     *
     * For each criterion that did not meet its goal, the gap (goal - score) is
     * multiplied by the criterion's weight (LLM criteria use weight 1). This score
     * is used ONLY to rank failing iterations when choosing the best attempt; it
     * never affects pass/fail, which is strict (every goal must be met).
     *
     * @param ratings Combined LLM + metric ratings for one iteration.
     * @param metricByName Lookup of metric criteria by name to resolve weight.
     */
    private calculateFailureScore(ratings: Rating[], metricByName: Map<string, MetricCriterion>): number {
        let failureScore = 0;
        for (const rating of ratings) {
            if (rating.actual >= rating.goal) {
                continue;
            }
            const gap = rating.goal - rating.actual;
            const metric = metricByName.get(rating.criterion);
            const weight = metric ? metric.weight : 1;
            failureScore += gap * weight;
        }
        return failureScore;
    }

    /**
     * Selects the best iteration result using a tiered comparison:
     *
     * 1. Fewest violations wins: the iteration with the smallest number of
     *    criteria below their goal. A fully passing iteration (zero violations)
     *    therefore always beats any iteration that still misses a goal.
     * 2. On an equal number of violations, the highest total score wins (the sum
     *    of every criterion's actual value). This prevents a later edit that
     *    needlessly lowered an already-passing criterion from beating an earlier
     *    iteration that scored higher overall.
     * 3. Remaining ties are broken by recency (the later iteration wins).
     */
    private selectBestIteration(iterationResults: IterationResult[]): IterationResult {
        if (iterationResults.length === 0) {
            throw new Error('No iteration results to select from');
        }

        const violationCount = (result: IterationResult): number =>
            result.ratings.filter(rating => rating.actual < rating.goal).length;

        const scoreSum = (result: IterationResult): number =>
            result.ratings.reduce((sum, rating) => sum + rating.actual, 0);

        const isBetter = (candidate: IterationResult, current: IterationResult): boolean => {
            // Tier 1: fewer unmet criteria wins.
            const candidateViolations = violationCount(candidate);
            const currentViolations = violationCount(current);
            if (candidateViolations !== currentViolations) {
                return candidateViolations < currentViolations;
            }
            // Tier 2: equal violations -> prefer the higher total score.
            const candidateScore = scoreSum(candidate);
            const currentScore = scoreSum(current);
            if (candidateScore !== currentScore) {
                return candidateScore > currentScore;
            }
            // Tier 3: tie-break on recency.
            return candidate.iteration > current.iteration;
        };

        let bestResult = iterationResults[0]!;
        for (let i = 1; i < iterationResults.length; i++) {
            const result = iterationResults[i]!;
            if (isBetter(result, bestResult)) {
                bestResult = result;
            }
        }
        return bestResult;
    }

} 