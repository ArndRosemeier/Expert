import { DocumentNode } from '../DocumentNode';
import { LoopOrchestrator, LoopInput, LoopProgress, Rating, RaterProgressPayload } from '../LoopOrchestrator';
import { SettingsManager } from '../SettingsManager';
import { OpenRouterClient } from '../OpenRouterClient';
import { CreatorPayload, QualityCriterion } from '../types';
import { EventEmitter } from '../EventEmitter';
import { TreeService } from './TreeService';
import { ContextService } from './ContextService';
import { PromptService } from './PromptService';
import { GenerationController } from './GenerationController';
import { promptExpansionService } from '../services/PromptExpansionService';
import { PromptContextBuilder } from '../services/PromptContextBuilder';

interface GenerationDependencies {
    treeService: TreeService;
    contextService: ContextService;
    promptService: PromptService;
    generationController: GenerationController;
    loopOrchestrator: LoopOrchestrator;
    settingsManager: SettingsManager;
    openRouterClient: OpenRouterClient;
    eventEmitter: EventEmitter<any>;
    saveToStorage: () => Promise<void>;
    rootNode: DocumentNode;
    getGenerationCoordinator?: () => any; // Optional for coordinator access
}

export class GenerationService {
    private deps: GenerationDependencies;
    private isGeneratingAllChildren: boolean = false;
    private abortRequested: boolean = false;

    constructor(dependencies: GenerationDependencies) {
        this.deps = dependencies;
    }

    /**
     * Centralized cleanup method that handles all state clearing in the correct order.
     * This ensures UI consistency by clearing all state before emitting any events.
     */
    private cleanupGenerationState(_nodeId: string, node: DocumentNode, isChildGeneration: boolean = false): void {
        // Clear node-level state first
        node.isGenerating = false;
        
        // Clear service-level state for single node operations
        if (!isChildGeneration) {
            this.deps.generationController.clearGenerationContext();
        }
    }

    /**
     * Checks if generation should be aborted by consulting both local and controller state.
     */
    private isAbortRequested(): boolean {
        return this.abortRequested || this.deps.generationController.isAbortRequested();
    }

    /**
     * Rates existing content for a node without generating new content.
     * Creates a generation session with the ratings and marks the current content as chosen.
     * @param nodeId The ID of the node to rate.
     */
    public async rateNodeContent(nodeId: string): Promise<void> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) { 
            throw new Error(`Node not found: ${nodeId}`); 
        }

        if (!node.content || node.content.trim() === '') {
            throw new Error(`Node "${node.title}" has no content to rate`);
        }

        // Check if already generating
        if (this.deps.generationController.canAbortGeneration(this.deps.rootNode)) {
            throw new Error('Another generation operation is already in progress. Please abort it first or wait for completion.');
        }

        const profile = this.deps.settingsManager.getLastUsedProfile();
        
        if (!profile || !profile.criteria || profile.criteria.length === 0) {
            throw new Error(`Cannot rate content for node "${node.title}" (ID: ${nodeId}). The active profile is either missing, has no criteria defined, or could not be loaded.`);
        }

        // Set up generation context
        this.abortRequested = false;
        this.deps.generationController.setupSingleNodeGeneration(nodeId);
        
        // Get the raw prompt from the node for context
        const rawPrompt = node.generationPrompt || this.deps.promptService.getRawGenerationPrompt(node);
        const context = this.deps.contextService.compileNodeContext(nodeId, this.deps.rootNode);
        const path = this.deps.treeService.getNodePath(nodeId, this.deps.rootNode);
        const filledPrompt = this.deps.promptService.fillGenerationPrompt(rawPrompt, node, context, path);

        const filteredCriteria = this.filterCriteriaForNodeType(profile.criteria, node.isLeaf);

        try {
            node.isGenerating = true;
            this.deps.eventEmitter.emit('nodeGenerationStarted', { nodeId, node });
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: `Rating content for "${node.title}"...`, current: 0, total: 1 });

            // Set language for the orchestrator before using it
            this.deps.loopOrchestrator.setLanguage(this.deps.settingsManager.getLanguage());
            
            // Use the loop orchestrator's rateContent method
            const ratings = await this.deps.loopOrchestrator.rateContent(filledPrompt, node.content, filteredCriteria);

            // Create a generation session with the rating results
            node.startGenerationSession(filledPrompt);
            node.addGenerationIteration(1, node.content, ratings);
            node.endGenerationSession(true, node.content);

            // Save to storage
            await this.deps.saveToStorage();

            // Clear progress and emit completion
            this.cleanupGenerationState(nodeId, node, false);
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 1, total: 1 });
            this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: true, node });

        } catch (error) {
            this.cleanupGenerationState(nodeId, node, false);
            this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: false, error, node });
            throw error;
        }
    }

    /**
     * Generates content for a single node using the Loop Orchestrator.
     * @param nodeId The ID of the node to generate content for.
     * @param count The number of options to generate (default: 5).
     * @param isChildGeneration Whether this is part of a bulk generation operation.
     */
    public async generateNodeContent(nodeId: string, count: number = 5, isChildGeneration: boolean = false): Promise<void> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) { 
            throw new Error(`Node not found: ${nodeId}`); 
        }

        // Check if already generating (but allow during bulk operations)
        if (!isChildGeneration && this.deps.generationController.canAbortGeneration(this.deps.rootNode)) {
            throw new Error('Another generation operation is already in progress. Please abort it first or wait for completion.');
        }

        // Set up generation context only if not part of bulk operation
        if (!isChildGeneration) {
            this.abortRequested = false;
            this.deps.generationController.setupSingleNodeGeneration(nodeId);
        }

        // Check for settings override from parent node
        const settingsOverride = this.extractSettingsOverride(node);
        const originalProfileName = settingsOverride ? this.deps.settingsManager.getLastUsedProfileName() : null;
        
        if (settingsOverride) {
            const overrideProfile = this.deps.settingsManager.getProfile(settingsOverride);
            if (overrideProfile) {
                console.log(`🔧 Using settings override "${settingsOverride}" for node "${node.title}"`);
                await this.deps.settingsManager.setLastUsedProfile(settingsOverride);
            } else {
                console.warn(`⚠️ Settings override "${settingsOverride}" not found for node "${node.title}". Using current settings.`);
            }
        }

        const profile = this.deps.settingsManager.getLastUsedProfile();
        
        // Fail loudly if the node is in an invalid state for generation.
        if (!profile || !profile.criteria || profile.criteria.length === 0) {
            this.deps.generationController.clearGenerationContext();
            throw new Error(`Cannot generate content for node "${node.title}" (ID: ${nodeId}). The active profile is either missing, has no criteria defined, or could not be loaded.`);
        }

        // Get the raw prompt from the node, or get the default raw prompt if it's not set.
        const rawPrompt = node.generationPrompt || this.deps.promptService.getRawGenerationPrompt(node);

        // Fill the placeholders just-in-time for generation.
        // When generating children as part of a larger job, the count is not used.
        const context = this.deps.contextService.compileNodeContext(nodeId, this.deps.rootNode);
        const path = this.deps.treeService.getNodePath(nodeId, this.deps.rootNode);
        const filledPrompt = this.deps.promptService.fillGenerationPrompt(rawPrompt, node, context, path, isChildGeneration ? undefined : count);

        const loopInput: LoopInput = {
            prompt: filledPrompt,
            criteria: this.filterCriteriaForNodeType(profile.criteria, node.isLeaf),
            maxIterations: profile.maxIterations,
            response: '', // Initial response is empty
            isLeafNode: node.isLeaf
        };

        const contextNodeId = isChildGeneration ? node.parentId : nodeId;
        try {
            await this.runContentLoop(nodeId, loopInput, contextNodeId || undefined, isChildGeneration);
        } catch (error) {
            // Only clear context if this was a single generation (not part of bulk)
            if (!isChildGeneration) {
                this.deps.generationController.clearGenerationContext();
            }
            throw error;
        } finally {
            // Always restore original settings if we had an override
            if (settingsOverride && originalProfileName) {
                console.log(`🔄 Restoring original settings profile "${originalProfileName}" after generation`);
                await this.deps.settingsManager.setLastUsedProfile(originalProfileName);
            }
        }
    }

    /**
     * Runs the main content generation loop for a node.
     */
    private async runContentLoop(nodeId: string, loopInput: LoopInput, contextNodeId?: string, isChildGeneration: boolean = false): Promise<void> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) {
            console.error(`Node not found in runContentLoop: ${nodeId}`);
            return;
        }

        const profile = this.deps.settingsManager.getLastUsedProfile();
        if (!profile || !profile.selectedModels) {
            // This case should be prevented by the check in generateNodeContent, but as a safeguard:
            const errorMessage = `Could not find a valid active profile with models for node ${node.title}. Cannot run content loop.`;
            this.deps.eventEmitter.emit('error', errorMessage);
            console.error(errorMessage);
            return;
        }
        
        // Note: OpenRouterClient is now a singleton that dynamically fetches 
        // model configuration from ModelSelector, so no need to set models here

        node.isGenerating = true;
        console.log(`🚀 Starting generation for: "${node.title}" (${nodeId})`);
        this.deps.eventEmitter.emit('nodeGenerationStarted', { nodeId, node }); // Update UI to show spinner
        
        // Emit high-level progress for single node generation (not during bulk operations)
        if (!isChildGeneration) {
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: `Generating content for "${node.title}"...`, current: 0, total: 1 });
        }
        
        // Start a new generation session
        node.startGenerationSession(loopInput.prompt);
        let currentIterationContent: string | null = null;
        let currentIterationRatings: Rating[] = [];
        
        // Subscribe to progress updates from the orchestrator
        const onProgress = (progress: LoopProgress) => {
            // Check for abort before processing progress
            if (this.isAbortRequested()) {
                return;
            }
            
            if (progress.type === 'creator') {
                const payload = progress.payload as CreatorPayload;
                
                // Handle status messages vs actual content differently
                if (payload.response.includes('is working')) {
                    // Show status messages in the dedicated status area
                    if (!this.isGeneratingAllChildren) {
                        const statusElement = document.getElementById('generation-status');
                        if (statusElement) {
                            statusElement.textContent = payload.response;
                            statusElement.style.display = 'block';
                        }
                    }
                } else {
                    // Only store actual content, not temporary "working" messages
                    currentIterationContent = payload.response;
                    
                    // Live-update the content text area as the creator works, but only if not in bulk mode
                    // During bulk operations, we don't want to interfere with the selected node's display
                    if (!this.isGeneratingAllChildren) {
                        const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
                        if (contentTextArea && document.activeElement !== contentTextArea) {
                            contentTextArea.value = payload.response;
                        }
                    }
                }
            } else if (progress.type === 'rater') {
                const payload = progress.payload as RaterProgressPayload;
                if (payload.rating && payload.rating.criterion) {
                    // Collect ratings for this iteration
                    const existingRatingIndex = currentIterationRatings.findIndex(
                        r => r.criterion === payload.rating.criterion
                    );
                    if (existingRatingIndex >= 0) {
                        currentIterationRatings[existingRatingIndex] = payload.rating;
                    } else {
                        currentIterationRatings.push(payload.rating);
                    }
                    
                    // If we have all ratings for this iteration, save it
                    if (currentIterationRatings.length === loopInput.criteria.length && currentIterationContent) {
                        node.addGenerationIteration(
                            progress.iteration, 
                            currentIterationContent, 
                            [...currentIterationRatings]
                        );
                        // Reset for next iteration
                        currentIterationRatings = [];
                    }
                }
            }
            
            // When running a loop on a child node as part of "Generate All",
            // we want to emit the progress under the parent's ID so the UI can display it.
            this.deps.eventEmitter.emit('loop-progress', { nodeId: contextNodeId || nodeId, progress });
        };

        // Handle abort events from orchestrator
        const onAborted = (_message: string) => {
            // Generation aborted - no logging needed as UI handles this
        };

        // Handle started event from orchestrator to show immediate progress UI
        const onStarted = (input: LoopInput) => {
            // Emit immediate progress to show UI in zero state
            this.deps.eventEmitter.emit('loop-progress', { 
                nodeId: contextNodeId || nodeId, 
                progress: {
                    type: 'creator',
                    payload: { prompt: 'Initializing generation...', response: '' },
                    iteration: 0,
                    maxIterations: input.maxIterations,
                    step: 0,
                    totalStepsInIteration: 3
                }
            });
        };

        // Handle iteration started event
        const onIterationStarted = (iteration: number, maxIterations: number) => {
            this.deps.eventEmitter.emit('loop-progress', { 
                nodeId: contextNodeId || nodeId, 
                progress: {
                    type: 'creator',
                    payload: { prompt: `Starting iteration ${iteration}...`, response: '' },
                    iteration: iteration,
                    maxIterations: maxIterations,
                    step: 0,
                    totalStepsInIteration: 3
                }
            });
        };

        // Handle phase started event
        const onPhaseStarted = (phase: 'create' | 'rate' | 'edit', iteration: number) => {
            // Skip editor phase - LoopOrchestrator now handles enhanced editor progress with model names
            if (phase === 'edit') {
                return;
            }
            
            const phaseMessages = {
                create: 'Creating content...',
                rate: 'Evaluating content...'
            };
            const phaseSteps = {
                create: 1,
                rate: 2
            };
            
            this.deps.eventEmitter.emit('loop-progress', { 
                nodeId: contextNodeId || nodeId, 
                progress: {
                    type: phase === 'create' ? 'creator' : 'rater',
                    payload: phase === 'create' 
                        ? { prompt: phaseMessages[phase], response: '' }
                        : { criterion: phaseMessages[phase], rating: { criterion: '', score: 0, justification: '', goal: 0} },
                    iteration: iteration,
                    maxIterations: loopInput.maxIterations,
                    step: phaseSteps[phase],
                    totalStepsInIteration: 3
                }
            });
        };
        
        // Set language for the orchestrator before using it
        this.deps.loopOrchestrator.setLanguage(this.deps.settingsManager.getLanguage());
        
        this.deps.loopOrchestrator.on('started', onStarted);
        this.deps.loopOrchestrator.on('iteration-started', onIterationStarted);
        this.deps.loopOrchestrator.on('phase-started', onPhaseStarted);
        this.deps.loopOrchestrator.on('progress', onProgress);
        this.deps.loopOrchestrator.on('aborted', onAborted);

        try {
            const result = await this.deps.loopOrchestrator.runLoop(loopInput);
            
            if (result.aborted || this.isAbortRequested()) {
                // Handle aborted generation
                node.endGenerationSession(false, currentIterationContent || '');
                if (currentIterationContent) {
                    const modelKey = node.isLeaf ? 'prose' : 'creator';
                    const modelName = profile.selectedModels?.[modelKey];
                    node.setContentFromGeneration(currentIterationContent, modelName);
                    
                    // Set context for generated content - copy parent context directly (1:1)
                    if (node.parentId) {
                        const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
                        if (parentNode && parentNode.context) {
                            node.setContext(parentNode.context, 'generated');
                        }
                    }
                }
                
                // Cleanup state before emitting events
                this.cleanupGenerationState(nodeId, node, isChildGeneration);
                
                this.deps.eventEmitter.emit('nodeGenerationAborted', { nodeId, node });
                
                // Clear high-level progress for single node generation on abort (not during bulk operations)
                if (!isChildGeneration) {
                    this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
                }
            } else {
                // Handle successful completion
                node.endGenerationSession(result.success, result.finalResponse);
                const modelKey = node.isLeaf ? 'prose' : 'creator';
                const modelName = profile.selectedModels?.[modelKey];
                
                // Create generation versions from the completed session iterations
                const latestSession = node.getLatestGenerationSession();
                if (latestSession && latestSession.iterations.length > 0) {
                    latestSession.iterations.forEach((iteration) => {
                        node.setContentFromGeneration(iteration.content, modelName, iteration.iteration);
                    });
                    
                    // Set context for all generated content - copy parent context directly (1:1)
                    if (node.parentId) {
                        const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
                        if (parentNode && parentNode.context) {
                            node.setContext(parentNode.context, 'generated');
                        }
                    }
                }
                
                // Promote the final result to master and mark as winner
                // Use the tracked final iteration number to find the exact version
                const completedSession = node.getLatestGenerationSession();
                if (!completedSession) {
                    throw new Error('No generation session found after completion');
                }
                
                const finalIterationNumber = completedSession.finalIterationNumber;
                const generationVersion = node.getAllVersions().find(v => 
                    v.tags.has('generated') && v.tags.has(`iteration${finalIterationNumber}`)
                );
                
                if (!generationVersion) {
                    throw new Error(`No version found for final iteration ${finalIterationNumber}. This indicates a critical bug in version tracking.`);
                }
                
                node.promoteToMaster(generationVersion.id, ['generatedWinner']);
                node.generationHistory = result.history;
                
                // Cleanup state before emitting events
                this.cleanupGenerationState(nodeId, node, isChildGeneration);
                
                console.log(`✅ Node generation completed: "${node.title}" (${nodeId}) - Content length: ${node.content?.length || 0} characters`);
                this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: true, node });

                // Clear high-level progress for single node generation (not during bulk operations)
                if (!isChildGeneration) {
                    this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 1, total: 1 });
                }

                // Automatic summarization disabled since we now use direct content for context
                // Summaries can still be generated manually via the UI if needed for export/review
                // if (!this.isGeneratingAllChildren && !this.abortRequested) {
                //     await this.summarizeNodeContent(nodeId);
                // }
            }

        } catch (error: any) {
            console.error(`Error running content loop for node ${nodeId}:`, error);
            
            // End the generation session with failure
            if (node.currentGenerationSession) {
                node.endGenerationSession(false, currentIterationContent || '');
            }
            
            // Cleanup state before emitting events
            this.cleanupGenerationState(nodeId, node, isChildGeneration);
            
            if (error.message === 'Generation aborted by user' || this.isAbortRequested()) {
                this.deps.eventEmitter.emit('nodeGenerationAborted', { nodeId, node });
            } else {
                const errorMessage = error.message || "An unexpected error occurred during content generation.";
                this.deps.eventEmitter.emit('error', errorMessage);
                this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: false, error, node });
            }
            
            // Clear high-level progress for single node generation on error (not during bulk operations)
            if (!isChildGeneration) {
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
            }
        } finally {
            this.deps.loopOrchestrator.off('started', onStarted);
            this.deps.loopOrchestrator.off('iteration-started', onIterationStarted);
            this.deps.loopOrchestrator.off('phase-started', onPhaseStarted);
            this.deps.loopOrchestrator.off('progress', onProgress);
            this.deps.loopOrchestrator.off('aborted', onAborted);
            
            // Clear generation status display
            if (!isChildGeneration) {
                const statusElement = document.getElementById('generation-status');
                if (statusElement) {
                    statusElement.style.display = 'none';
                    statusElement.textContent = '';
                }
            }
            
            // Ensure high-level progress is always cleared for single node generation
            if (!isChildGeneration) {
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
                // clearGenerationContext is now called before events are emitted
            }
            
            await this.deps.saveToStorage();
        }
    }

    /**
     * Parses the content of a node (expected to be a bulleted list)
     * and creates child nodes for each item.
     * @param nodeId The ID of the parent node containing the outline.
     */
    public async createChildrenFromOutline(nodeId: string): Promise<void> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node || !node.content || node.content.trim() === '') {
            this.deps.eventEmitter.emit('error', `Cannot create children for node ${nodeId}: No content found.`);
            return;
        }

        // Check for settings override from the parent node's own context
        const settingsOverride = this.extractSettingsOverrideFromNode(node);
        const originalProfileName = settingsOverride ? this.deps.settingsManager.getLastUsedProfileName() : null;
        
        if (settingsOverride) {
            const overrideProfile = this.deps.settingsManager.getProfile(settingsOverride);
            if (overrideProfile) {
                console.log(`🔧 Using settings override "${settingsOverride}" for creating children of "${node.title}"`);
                await this.deps.settingsManager.setLastUsedProfile(settingsOverride);
            } else {
                console.warn(`⚠️ Settings override "${settingsOverride}" not found for creating children of "${node.title}". Using current settings.`);
            }
        }

        // Set generating flag and emit generation started event
        node.isGenerating = true;
        this.deps.eventEmitter.emit('nodeGenerationStarted', { nodeId, node });
        this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'Reading outline and generating titles...', current: 0, total: 1 });

        // Clear existing children to allow for regeneration
        node.children = [];

        const prompts = this.deps.settingsManager.getPrompts();
        const context = this.deps.contextService.compileNodeContext(nodeId, this.deps.rootNode);

        const prompt = this.deps.promptService.fillGenerationPrompt(
            prompts.create_children_from_outline_user,
            node,
            context,
            this.deps.treeService.getNodePath(nodeId, this.deps.rootNode)
        );

        // Apply remaining placeholder replacements using centralized service
        const promptContext = PromptContextBuilder.forAnalysis(this.deps.settingsManager, {
            outlineContent: node.content
        });
        const finalPrompt = promptExpansionService.expandPrompt(prompt, promptContext);

        // Prompt prepared for LLM

        try {
            // Using the 'creator' model as it's for generating new content/structure
            const response = await this.deps.openRouterClient.chat('creator', finalPrompt);
            const nodeItems = this.parseChildrenFromJSON(response);

            if (nodeItems.length === 0) {
                // Clear generating flag before emitting error
                node.isGenerating = false;
                const errorMsg = `The AI did not return a valid list of titles from the outline.\n\nAI Response:\n"${response}"`;
                this.deps.eventEmitter.emit('error', errorMsg);
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
                return;
            }

            // Get the creator model name for tracking
            const currentProfile = this.deps.settingsManager.getLastUsedProfile();
            const creatorModel = currentProfile?.selectedModels?.['creator'];

            nodeItems.forEach(item => {
                const newNode = this.deps.treeService.addNode(item.title, nodeId, this.deps.rootNode, creatorModel);
                
                // Set the content description as initial content if provided
                if (item.description && item.description.trim()) {
                    // Create a draft version and promote it to master with draft tag
                    const metadata: { [key: string]: any } = {};
                    if (creatorModel) {
                        metadata['creatorModel'] = creatorModel;
                    }
                    
                    const draftVersionId = newNode.addVersion(['generated', 'draft'], {
                        content: `Draft: ${item.description}`,
                        title: newNode.title,
                        context: newNode.context
                    }, metadata);
                    
                    // Promote the draft version to master (keeping the draft tag)
                    if (draftVersionId) {
                        newNode.promoteToMaster(draftVersionId, ['draft']);
                    }
                    
                    // Set context for generated child content
                    if (newNode.parentId) {
                        const parent = this.deps.treeService.findNodeById(newNode.parentId, this.deps.rootNode);
                        const parentContext = parent?.context || '';
                        if (parentContext) {
                            newNode.setContext(parentContext, 'generated');
                        }
                    }
                }
            });

            await this.deps.saveToStorage();
            
            // Clear generating flag and emit completion event
            node.isGenerating = false;
            this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: true, node: node });
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 1, total: 1 });
        } catch(error) {
            console.error('Failed to create children from outline via LLM:', error);
            
            // Clear generating flag before emitting error
            node.isGenerating = false;
            this.deps.eventEmitter.emit('error', 'The AI failed to process the outline. Please try again.');
            this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: false, error, node: node });
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
        } finally {
            // Always restore original settings if we had an override
            if (settingsOverride && originalProfileName) {
                console.log(`🔄 Restoring original settings profile "${originalProfileName}" after creating children`);
                await this.deps.settingsManager.setLastUsedProfile(originalProfileName);
            }
        }
    }

    /**
     * Creates children from outline (if needed) and optionally generates content for all children.
     * This combines the functionality of createChildrenFromOutline and generateAllChildrenContent.
     * @param nodeId The ID of the parent node.
     * @param includeContent Whether to generate content for the children (default: true).
     * @param recursive Whether to recursively generate children down to max expand level (default: false).
     */
    public async generateAllChildrenContent(nodeId: string, includeContent: boolean = true, recursive: boolean = false, autoprune: boolean = false): Promise<void> {
        let node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) {
            this.deps.eventEmitter.emit('error', `Could not find node with ID ${nodeId} to generate children content for.`);
            return;
        }

        // Check for existing generation FIRST, before any operations
        // Allow recursive calls if we're already in a bulk operation
        if (this.deps.generationController.canAbortGeneration(this.deps.rootNode) && !this.isGeneratingAllChildren) {
            throw new Error('Another generation operation is already in progress. Please abort it first or wait for completion.');
        }

        // Step 0: Auto-prune context if requested (before any child generation)
        if (autoprune) {
            // Skip auto-pruning for project root nodes (no inherited context to clean)
            if (node.level === 0 || !node.parentId) {
                console.log(`⏭️ Skipping auto-prune for "${node.title}" - project root node`);
            } else {
                // Check if context has already been AI-adjusted (skip if so)
                const masterVersion = node.getMasterVersion();
                const alreadyAdjusted = masterVersion && masterVersion.tags.has('context_ai_adjusted');
                
                if (alreadyAdjusted) {
                    console.log(`⏭️ Skipping auto-prune for "${node.title}" - already AI-adjusted`);
                } else {
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'Auto-pruning context...', current: 0, total: 1 });
                
                try {
                    // Import the ContextAdjusterModal and run in automatic mode
                    const { ContextAdjusterModal } = await import('../ui/modals/ContextAdjusterModal');
                    const contextAdjuster = new ContextAdjusterModal();
                    
                    const contextChanged = await contextAdjuster.runAutomaticMode(node);
                    
                    if (contextChanged) {
                        // Refresh node reference after context changes
                        const updatedNode = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
                        if (updatedNode) {
                            node = updatedNode;
                        }
                        console.log(`🔧 Auto-pruned context for "${node.title}"`);
                    } else {
                        console.log(`✅ No context issues found for "${node.title}"`);
                    }
                } catch (error) {
                    console.error('Auto-prune context failed:', error);
                    this.deps.eventEmitter.emit('error', `Auto-prune context failed for "${node.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
                    // Continue with generation even if auto-prune fails
                }
                }
            }
        }

        // Only check for content if we need to create children from outline (children.length === 0)
        // For nodes that already have children, we should skip this check
        if (node.children.length === 0 && node.getState() === 'Empty') {
            if (includeContent) {
                // Auto-generate content for the parent node first
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: `Generating content for "${node.title}" first...`, current: 0, total: 1 });
                
                try {
                    await this.generateNodeContent(nodeId, node.getTemplateChildrenCount() ?? 5, false);
                    
                    // Refresh node reference after content generation
                    const updatedNode = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
                    if (!updatedNode || !updatedNode.content || updatedNode.content.trim() === '') {
                        this.deps.eventEmitter.emit('error', `Failed to generate content for "${node.title}". Cannot proceed with creating children.`);
                        // Clean up generation state before throwing
                        if (this.isGeneratingAllChildren) {
                            this.isGeneratingAllChildren = false;
                            this.deps.generationController.clearGenerationContext();
                        }
                        throw new Error(`Failed to generate content for "${node.title}". Cannot proceed with creating children.`);
                    }
                    // Update node reference for subsequent operations
                    node = updatedNode;
                } catch (error: any) {
                    if (error.message === 'Generation aborted by user') {
                        // This was aborted at the single generation level, just return
                        return;
                    }
                    this.deps.eventEmitter.emit('error', `Failed to generate content for "${node.title}": ${error.message}`);
                    // Clean up generation state before throwing
                    if (this.isGeneratingAllChildren) {
                        this.isGeneratingAllChildren = false;
                        this.deps.generationController.clearGenerationContext();
                    }
                    throw new Error(`Failed to generate content for "${node.title}": ${error.message}`);
                }
            } else {
                this.deps.eventEmitter.emit('error', `Cannot generate children for node "${node.title}": No content found. Please write or generate content for this node first, or enable "Include content" to auto-generate it.`);
                // Clean up generation state before throwing
                if (this.isGeneratingAllChildren) {
                    this.isGeneratingAllChildren = false;
                    this.deps.generationController.clearGenerationContext();
                }
                throw new Error(`Cannot generate children for node "${node.title}": No content found. Please write or generate content for this node first, or enable "Include content" to auto-generate it.`);
            }
        }

        // Set up bulk generation context only for top-level call
        if (!this.isGeneratingAllChildren) {
            this.abortRequested = false;
            this.isGeneratingAllChildren = true;
            
            // Collect all nodes that will be processed for abort tracking
            const collectChildNodes = (node: DocumentNode): DocumentNode[] => {
                const nodes: DocumentNode[] = [];
                for (const child of node.children) {
                    nodes.push(child);
                    if (recursive) {
                        nodes.push(...collectChildNodes(child));
                    }
                }
                return nodes;
            };
            
            const nodesToProcess = collectChildNodes(node);
            this.deps.generationController.setupBulkGeneration(nodesToProcess.map(n => n.id));
        }

        // Step 1: Create children from outline if they don't exist
        if (node.children.length === 0) {
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'Reading outline and generating child titles and drafts...', current: 0, total: 1 });
            
            // Use the dedicated createChildrenFromOutline method instead of duplicating logic
            await this.createChildrenFromOutline(nodeId);
        } else {
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'Child nodes already exist, skipping creation', current: 1, total: 1 });
        }

        // Step 2: Generate content for all children (if requested)
        if (includeContent) {
            const children = node.children;
            // Filter to only children that need content (Empty or Draft, but not Final)
            const childrenNeedingContent = children.filter(child => child.getState() !== 'Final');
            const total = childrenNeedingContent.length;

            if (total > 0) {
                for (let i = 0; i < total; i++) {
                    const child = childrenNeedingContent[i];
                    
                    if (!child) {
                        console.warn(`Child at index ${i} is undefined, skipping`);
                        continue;
                    }
                    
                    // Check for abort before processing each child
                    if (this.isAbortRequested()) {
                        break;
                    }
                    
                    // Starting content generation for child
                    this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: `Generating content for: ${child.title}`, current: i + 1, total });
                    
                    try {
                        // Use coordinator for child content generation if available
                        const coordinator = this.deps.getGenerationCoordinator?.();
                        let childOperationId: string | null = null;
                        
                        if (coordinator) {
                            childOperationId = coordinator.startOperation('child-content', child.id, [child.id]);
                            if (!childOperationId) {
                                console.warn(`Skipping child "${child.title}" - conflicts with existing operation`);
                                continue;
                            }
                        }
                        
                        try {
                            // Use the child's own generation count setting
                            await this.generateNodeContent(child.id, child.getTemplateChildrenCount() ?? 5, true);
                            
                            // Verify content was actually generated
                            const updatedChild = this.deps.treeService.findNodeById(child.id, this.deps.rootNode);
                            if (updatedChild && updatedChild.content && updatedChild.content.trim() !== '') {
                                // Content generation completed
                            } else {
                                console.error(`✗ Content generation failed for "${child.title}": No content found after generation`);
                            }
                            
                            // Complete the child operation successfully
                            if (coordinator && childOperationId) {
                                coordinator.completeOperation(childOperationId, true);
                            }
                        } catch (error) {
                            // Complete the child operation with failure
                            if (coordinator && childOperationId) {
                                coordinator.completeOperation(childOperationId, false, error);
                            }
                            throw error;
                        }
                        
                        // Check for abort after generation
                        if (this.isAbortRequested()) {
                            break;
                        }
                        
                        // Automatic summarization disabled since we now use direct content for context
                        // await this.summarizeNodeContent(child.id, true); // Pass flag to suppress progress clearing
                    } catch (error: any) {
                        if (error.message === 'Generation aborted by user' || this.isAbortRequested()) {
                            // Content generation aborted
                            break;
                        }
                        console.error(`Failed to generate content for child "${child.title}" (${child.id}):`, error);
                        this.deps.eventEmitter.emit('error', `Failed to generate content for "${child.title}": ${error.message}`);
                        // Continue with next child instead of failing completely
                    }
                }
            } else {
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'All children already have content', current: 1, total: 1 });
            }
        }

        // Step 3: If recursive is enabled, recursively generate children for each child node
        if (recursive) {
            const children = node.children;
            const maxExpandLevel = node.template.length - 1; // Max level based on hierarchy
            // Filter to only children that can be expanded (within hierarchy limit)
            // Don't require content here - the generateAllChildrenContent call will handle content logic
            const childrenToExpand = children.filter(child => 
                child.level < maxExpandLevel
            );
            
            for (let i = 0; i < childrenToExpand.length; i++) {
                const child = childrenToExpand[i];
                
                if (!child) {
                    console.warn(`Child to expand at index ${i} is undefined, skipping`);
                    continue;
                }
                
                // Check for abort before recursive processing
                if (this.isAbortRequested()) {
                    break;
                }
                
                this.deps.eventEmitter.emit('high-level-progress', { 
                    nodeId, 
                    message: `Recursively generating children for: ${child.title}`, 
                    current: i + 1, 
                    total: childrenToExpand.length 
                });
                
                try {
                    // Recursively call generateAllChildrenContent on each child
                    // Pass includeContent, recursive, and autoprune flags down
                    await this.generateAllChildrenContent(child.id, includeContent, recursive, autoprune);
                } catch (error: any) {
                    if (error.message === 'Generation aborted by user' || this.isAbortRequested()) {
                        break;
                    }
                    console.error(`Failed to recursively generate children for ${child.title}:`, error);
                    // Continue with next child
                }
            }
        }

        // Only handle completion/cleanup for top-level call
        // Check if this is the top-level bulk operation before clearing context
        const isTopLevelBulkOperation = this.isGeneratingAllChildren && 
                                       this.deps.generationController.getCurrentGenerationInfo()?.type === 'bulk';
        
        if (isTopLevelBulkOperation) {
            try {
                if (this.isAbortRequested()) {
                    this.deps.eventEmitter.emit('nodeGenerationAborted', { nodeId, node });
                } else {
                    // Clear progress bars and emit the dedicated bulk completion event
                    this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
                    
                    // Emit the dedicated bulk generation complete event
                    this.deps.eventEmitter.emit('bulkGenerationComplete', { 
                        nodeId, 
                        node,
                        operation: 'children-generation',
                        options: {
                            includeContent,
                            recursive
                        },
                        success: true
                    });
                    
                    // Small delay to ensure all async operations complete, then trigger UI cleanup
                    setTimeout(() => {
                        this.deps.eventEmitter.emit('project-loaded');
                    }, 100);
                }
            } finally {
                this.isGeneratingAllChildren = false; // Reset flag
                this.deps.generationController.clearGenerationContext();
            }
        }
        
        // Error detection: If we're still marked as generating children but not in a bulk context,
        // this indicates a state inconsistency. Clean up the state instead of throwing an error.
        if (this.isGeneratingAllChildren && !this.deps.generationController.getCurrentGenerationInfo()) {
            console.warn(`State inconsistency detected - cleaning up: isGeneratingAllChildren=true but no generation context exists.`);
            console.warn('Debug info:', {
                nodeId,
                isGeneratingAllChildren: this.isGeneratingAllChildren,
                generationInfo: this.deps.generationController.getCurrentGenerationInfo(),
                abortRequested: this.isAbortRequested()
            });
            // Clean up the inconsistent state instead of crashing
            this.isGeneratingAllChildren = false;
            this.abortRequested = false;
        }
    }

    /**
     * Generates a summary for a given node's content using an LLM call.
     * @param nodeId The ID of the node to summarize.
     * @param suppressProgressClearing Optional flag to suppress progress clearing (used during bulk operations).
     */
    public async summarizeNodeContent(nodeId: string, suppressProgressClearing: boolean = false): Promise<void> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) {
            this.deps.eventEmitter.emit('error', `Could not find node with ID ${nodeId} to summarize.`);
            return;
        }

        if (!node.content || node.content.trim() === '') {
            this.deps.eventEmitter.emit('error', 'There is no content to summarize. Please generate or write content first.');
            return;
        }

        // Check if already generating (unless this is a bulk operation)
        if (!suppressProgressClearing && this.deps.generationController.canAbortGeneration(this.deps.rootNode)) {
            throw new Error('Another generation operation is already in progress. Please abort it first or wait for completion.');
        }

        // Set up generation context for non-bulk operations
        if (!suppressProgressClearing) {
            this.abortRequested = false;
            this.deps.generationController.setupSingleNodeGeneration(nodeId);
        }

        // Only emit progress events if not suppressed (not during bulk operations)
        if (!suppressProgressClearing) {
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'Summarizing content...', current: 0, total: 1 });
        }

        const prompts = this.deps.settingsManager.getPrompts();
        const promptContext = PromptContextBuilder.forNode(node, this.deps.settingsManager);
        const systemPrompt = promptExpansionService.expandPrompt(prompts.summarize_system, promptContext);

        try {
            node.isGenerating = true;
            if (!suppressProgressClearing) {
                this.deps.eventEmitter.emit('nodeGenerationStarted', { nodeId, node });
            }

            if (this.isAbortRequested()) {
                throw new Error('Generation aborted by user');
            }

            const abortSignal = this.deps.generationController.getCurrentGenerationInfo()?.canAbort ? 
                new AbortController().signal : undefined;
            const summary = await this.deps.openRouterClient.chat('editor', systemPrompt, undefined, abortSignal);
            
            if (this.isAbortRequested()) {
                throw new Error('Generation aborted by user');
            }

            // Use version management system to update context
            node.setContext(summary, 'master');
            this.deps.eventEmitter.emit('nodeSummaryGenerated', { nodeId, summary });
            await this.deps.saveToStorage();

            // Cleanup state before emitting events (treat suppressProgressClearing as isChildGeneration)
            this.cleanupGenerationState(nodeId, node, suppressProgressClearing);
            
            if (!suppressProgressClearing) {
                this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: true, node });
            }

            // Only clear the progress bar if not suppressed (not during bulk operations)
            if (!suppressProgressClearing) {
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
            }
        } catch(error: any) {
            console.error(`Failed to summarize node ${nodeId}:`, error);
            
            // Cleanup state before emitting events (treat suppressProgressClearing as isChildGeneration)
            this.cleanupGenerationState(nodeId, node, suppressProgressClearing);
            
            if (error.message === 'Request was aborted' || error.message === 'Generation aborted by user' || this.isAbortRequested()) {
                if (!suppressProgressClearing) {
                    this.deps.eventEmitter.emit('nodeGenerationAborted', { nodeId, node });
                }
            } else {
                this.deps.eventEmitter.emit('error', `An error occurred while summarizing. Please check the console for details.`);
                if (!suppressProgressClearing) {
                    this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: false, error, node });
                }
            }

            // Only clear the progress bar if not suppressed (not during bulk operations)
            if (!suppressProgressClearing) {
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
            }
        } finally {
            // clearGenerationContext is now called before events are emitted
        }
    }

    /**
     * Requests abortion of the current generation operation.
     */
    public abortCurrentGeneration(): void {
        this.abortRequested = true;
        this.deps.generationController.abortCurrentGeneration(this.deps.rootNode);
    }

    /**
     * Checks if a generation operation can be aborted.
     */
    public canAbortGeneration(): boolean {
        return this.deps.generationController.canAbortGeneration(this.deps.rootNode);
    }

    /**
     * Gets information about the current generation operation.
     */
    public getCurrentGenerationInfo(): { type: string; nodeCount: number; canAbort: boolean } | null {
        return this.deps.generationController.getCurrentGenerationInfo();
    }

    /**
     * Extracts settings override from parent node's context.
     * Looks for "settingsoverride: <profilename>" in the parent's context.
     */
    /**
     * Extracts settings override from the parent node's context.
     * Used when generating content for an existing node - the override instruction
     * comes from the parent node that contains the target node.
     */
    private extractSettingsOverride(node: DocumentNode): string | null {
        if (!node.parentId) {
            return null; // No parent, no override
        }
        
        const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
        if (!parentNode || !parentNode.context) {
            return null; // Parent has no context
        }
        
        const contextLines = parentNode.context.split('\n');
        for (const line of contextLines) {
            const trimmedLine = line.trim();
            const match = trimmedLine.match(/^settingsoverride:\s*(.+)$/i);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return null; // No settings override found
    }

    /**
     * Extracts settings override from the node's own context.
     * Used when creating children for a node - the override instruction
     * comes from the node itself that will become the parent of new children.
     */
    private extractSettingsOverrideFromNode(node: DocumentNode): string | null {
        if (!node.context) {
            return null; // No context
        }
        
        const contextLines = node.context.split('\n');
        for (const line of contextLines) {
            const trimmedLine = line.trim();
            const match = trimmedLine.match(/^settingsoverride:\s*(.+)$/i);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return null; // No settings override found
    }

    /**
     * Filters criteria based on whether the node is a leaf node.
     */
    private filterCriteriaForNodeType(criteria: QualityCriterion[], isLeafNode: boolean): QualityCriterion[] {
        return criteria.filter(criterion => {
            // If both outline and leaf are undefined or both are true, include the criterion
            if (criterion.outline === undefined && criterion.leaf === undefined) {
                return true; // Legacy criteria - apply to all
            }
            
            // For leaf nodes, include criteria where leaf is true
            if (isLeafNode) {
                return criterion.leaf === true;
            }
            
            // For outline/branch nodes, include criteria where outline is true
            return criterion.outline === true;
        });
    }

    /**
     * Parses a JSON array from text containing child node information.
     * Returns array of objects with title and content description.
     */
    private parseChildrenFromJSON(text: string): Array<{title: string, description: string}> {
        // Clean the text - remove any leading/trailing whitespace and non-JSON content
        const cleanedText = text.trim();
        
        // Try to find JSON array in the response (in case there's extra text)
        let jsonText = cleanedText;
        const arrayStart = cleanedText.indexOf('[');
        const arrayEnd = cleanedText.lastIndexOf(']');
        
        if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
            jsonText = cleanedText.substring(arrayStart, arrayEnd + 1);
        }
        
        // Parse the JSON - let errors bubble up
        const parsed = JSON.parse(jsonText);
        
        // Validate that it's an array
        if (!Array.isArray(parsed)) {
            throw new Error(`Expected JSON array but got ${typeof parsed}. Response: ${text}`);
        }
        
        // Validate and map each item
        return parsed
            .map((item, index) => {
                if (typeof item !== 'object' || item === null) {
                    console.warn(`Item ${index} is not an object, skipping`);
                    return null;
                }
                
                const title = typeof item.title === 'string' ? item.title.trim() : '';
                const description = typeof item.description === 'string' ? item.description.trim() : '';
                
                if (!title) {
                    console.warn(`Item ${index} has no valid title, skipping`);
                    return null;
                }
                
                return { title, description };
            })
            .filter((item): item is {title: string, description: string} => item !== null);
    }

    /**
     * Parses a bulleted list from text with the new format "Title: X, Content: Y".
     * Returns array of objects with title and content description.
     * This is kept as a fallback for when JSON parsing fails.
     */
    private parseEnhancedBulletedList(text: string): Array<{title: string, description: string}> {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('*') || line.startsWith('-'))
            .map(line => {
                const content = line.substring(1).trim();
                
                // Check for new format: "Title: X, Content: Y"
                const titleMatch = content.match(/^Title:\s*([^,]+),\s*Content:\s*(.*)$/i);
                if (titleMatch && titleMatch[1] && titleMatch[2]) {
                    return {
                        title: titleMatch[1].trim(),
                        description: titleMatch[2].trim()
                    };
                }
                
                // Fallback to old format (just the title)
                return {
                    title: content,
                    description: ''
                };
            })
            .filter(item => item.title.length > 0);
    }
} 