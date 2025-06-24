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
}

interface GenerationProgress {
    nodeId: string;
    message: string;
    current: number;
    total: number;
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
    private cleanupGenerationState(nodeId: string, node: DocumentNode, isChildGeneration: boolean = false): void {
        // Clear node-level state first
        node.isGenerating = false;
        
        // Clear service-level state for single node operations
        if (!isChildGeneration) {
            this.deps.generationController.clearGenerationContext();
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
            response: '' // Initial response is empty
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
        if (profile && profile.selectedModels) {
            this.deps.openRouterClient.setSelectedModels(profile.selectedModels);
        } else {
            // This case should be prevented by the check in generateNodeContent, but as a safeguard:
            const errorMessage = `Could not find a valid active profile with models for node ${node.title}. Cannot run content loop.`;
            this.deps.eventEmitter.emit('error', errorMessage);
            console.error(errorMessage);
            return;
        }

        node.isGenerating = true;
        this.deps.eventEmitter.emit('nodeGenerationStarted', { nodeId, node }); // Update UI to show spinner
        
        // Emit high-level progress for single node generation (not during bulk operations)
        if (!isChildGeneration) {
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: `Generating content for "${node.title}"...`, current: 0, total: 1 });
        }
        
        // Start a new generation session
        const sessionId = node.startGenerationSession(loopInput.prompt);
        let currentIterationContent: string | null = null;
        let currentIterationRatings: Rating[] = [];
        
        // Subscribe to progress updates from the orchestrator
        const onProgress = (progress: LoopProgress) => {
            // Check for abort before processing progress
            if (this.abortRequested) {
                return;
            }
            
            if (progress.type === 'creator') {
                const payload = progress.payload as CreatorPayload;
                currentIterationContent = payload.response;
                
                // Live-update the content text area as the creator works, but only if not in bulk mode
                // During bulk operations, we don't want to interfere with the selected node's display
                if (!this.isGeneratingAllChildren) {
                    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
                    if (contentTextArea && document.activeElement !== contentTextArea) {
                        contentTextArea.value = payload.response;
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
        const onAborted = (message: string) => {
            console.log(`Generation aborted for node ${nodeId}: ${message}`);
        };
        
        this.deps.loopOrchestrator.on('progress', onProgress);
        this.deps.loopOrchestrator.on('aborted', onAborted);

        try {
            const result = await this.deps.loopOrchestrator.runLoop(loopInput);
            
            if (result.aborted || this.abortRequested) {
                // Handle aborted generation
                node.endGenerationSession(false, currentIterationContent || '');
                if (currentIterationContent) {
                    node.setContentFromGeneration(currentIterationContent);
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
                node.setContentFromGeneration(result.finalResponse);
                node.generationHistory = result.history;
                
                // Cleanup state before emitting events
                this.cleanupGenerationState(nodeId, node, isChildGeneration);
                
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
            
            if (error.message === 'Generation aborted by user' || this.abortRequested) {
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
            this.deps.loopOrchestrator.off('progress', onProgress);
            this.deps.loopOrchestrator.off('aborted', onAborted);
            
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
        if (!node || !node.content) {
            this.deps.eventEmitter.emit('error', `Cannot create children for node ${nodeId}: No content found.`);
            return;
        }

        this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'Reading outline and generating titles...', current: 0, total: 1 });

        // Clear existing children to allow for regeneration
        node.children = [];

        const prompts = this.deps.settingsManager.getPrompts();
        const context = this.deps.contextService.compileNodeContext(nodeId, this.deps.rootNode);
        const childLevelName = node.childLevelName || 'item';

        const prompt = prompts.create_children_from_outline_user
            .replace('{{outline_content}}', node.content)
            .replace('{{child_level_name}}', childLevelName)
            .replace('{{context}}', context)
            .replace('{{count}}', String(node.generationChildrenCount));

        // Debug logging to see the actual prompt sent to LLM
        console.log('=== CREATE CHILDREN FROM OUTLINE PROMPT DEBUG (createChildrenFromOutline method) ===');
        console.log('Node:', node.title, '(level', node.level, ')');
        console.log('Template:', node.template);
        console.log('Child level name:', childLevelName);
        console.log('Generation count:', node.generationChildrenCount);
        console.log('Prompt sent to LLM:');
        console.log('---START PROMPT---');
        console.log(prompt);
        console.log('---END PROMPT---');

        try {
            // Using the 'creator' model as it's for generating new content/structure
            const response = await this.deps.openRouterClient.chat('creator', prompt);
            const titles = this.parseBulletedList(response);

            if (titles.length === 0) {
                this.deps.eventEmitter.emit('error', `The AI did not return a valid list of titles from the outline.`);
                return;
            }

            titles.forEach(title => {
                if (typeof title === 'string') {
                    this.deps.treeService.addNode(title, nodeId, this.deps.rootNode);
                }
            });

            await this.deps.saveToStorage();
            // This event is listened to by the UI to trigger a full re-render.
            this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: true, node: node });
        } catch(error) {
            console.error('Failed to create children from outline via LLM:', error);
            this.deps.eventEmitter.emit('error', 'The AI failed to process the outline. Please try again.');
        }
    }

    /**
     * Creates children from outline (if needed) and optionally generates content for all children.
     * This combines the functionality of createChildrenFromOutline and generateAllChildrenContent.
     * @param nodeId The ID of the parent node.
     * @param includeContent Whether to generate content for the children (default: true).
     * @param recursive Whether to recursively generate children down to max expand level (default: false).
     */
    public async generateAllChildrenContent(nodeId: string, includeContent: boolean = true, recursive: boolean = false): Promise<void> {
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

        // Only check for content if we need to create children from outline (children.length === 0)
        // For nodes that already have children, we should skip this check
        if (node.children.length === 0 && (!node.content || node.content.trim() === '')) {
            if (includeContent) {
                // Auto-generate content for the parent node first
                this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: `Generating content for "${node.title}" first...`, current: 0, total: 1 });
                
                try {
                    await this.generateNodeContent(nodeId, node.generationChildrenCount, false);
                    
                    // Refresh node reference after content generation
                    const updatedNode = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
                    if (!updatedNode || !updatedNode.content || updatedNode.content.trim() === '') {
                        this.deps.eventEmitter.emit('error', `Failed to generate content for "${node.title}". Cannot proceed with creating children.`);
                        return;
                    }
                    // Update node reference for subsequent operations
                    node = updatedNode;
                } catch (error: any) {
                    if (error.message === 'Generation aborted by user') {
                        // This was aborted at the single generation level, just return
                        return;
                    }
                    this.deps.eventEmitter.emit('error', `Failed to generate content for "${node.title}": ${error.message}`);
                    return;
                }
            } else {
                this.deps.eventEmitter.emit('error', `Cannot generate children for node "${node.title}": No content found. Please write or generate content for this node first, or enable "Include content" to auto-generate it.`);
                return;
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
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'Reading outline and generating child titles...', current: 0, total: 1 });

            const prompts = this.deps.settingsManager.getPrompts();
            const context = this.deps.contextService.compileNodeContext(nodeId, this.deps.rootNode);
            const childLevelName = node.childLevelName || 'item';

            const prompt = prompts.create_children_from_outline_user
                .replace('{{outline_content}}', node.content)
                .replace('{{child_level_name}}', childLevelName)
                .replace('{{context}}', context)
                .replace('{{count}}', String(node.generationChildrenCount));

            // Debug logging to see the actual prompt sent to LLM
            console.log('=== CREATE CHILDREN FROM OUTLINE PROMPT DEBUG ===');
            console.log('Node:', node.title, '(level', node.level, ')');
            console.log('Template:', node.template);
            console.log('Child level name:', childLevelName);
            console.log('Generation count:', node.generationChildrenCount);
            console.log('Prompt sent to LLM:');
            console.log('---START PROMPT---');
            console.log(prompt);
            console.log('---END PROMPT---');

            try {
                // Using the 'creator' model as it's for generating new content/structure
                const response = await this.deps.openRouterClient.chat('creator', prompt);
                const titles = this.parseBulletedList(response);

                if (titles.length === 0) {
                    this.deps.eventEmitter.emit('error', `The AI did not return a valid list of titles from the outline.`);
                    this.isGeneratingAllChildren = false;
                    return;
                }

                titles.forEach(title => {
                    if (typeof title === 'string') {
                        this.deps.treeService.addNode(title, nodeId, this.deps.rootNode);
                    }
                });

                await this.deps.saveToStorage();
            } catch(error) {
                console.error('Failed to create children from outline via LLM:', error);
                this.deps.eventEmitter.emit('error', 'The AI failed to process the outline. Please try again.');
                this.isGeneratingAllChildren = false;
                return;
            }
        } else {
            this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: 'Child nodes already exist, skipping creation', current: 1, total: 1 });
        }

        // Step 2: Generate content for all children (if requested)
        if (includeContent) {
            const children = node.children;
            // Filter to only children that don't have content yet
            const childrenNeedingContent = children.filter(child => !child.content || child.content.trim() === '');
            const total = childrenNeedingContent.length;

            if (total > 0) {
                for (let i = 0; i < total; i++) {
                    const child = childrenNeedingContent[i];
                    
                    // Check for abort before processing each child
                    if (this.abortRequested) {
                        break;
                    }
                    
                    this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: `Generating content for: ${child.title}`, current: i + 1, total });
                    
                    try {
                        // Use the child's own generation count setting
                        await this.generateNodeContent(child.id, child.generationChildrenCount, true);
                        
                        // Check for abort after generation
                        if (this.abortRequested) {
                            break;
                        }
                        
                        // Automatic summarization disabled since we now use direct content for context
                        // await this.summarizeNodeContent(child.id, true); // Pass flag to suppress progress clearing
                    } catch (error: any) {
                        if (error.message === 'Generation aborted by user' || this.abortRequested) {
                            break;
                        }
                        console.error(`Failed to generate content for child ${child.title}:`, error);
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
                
                // Check for abort before recursive processing
                if (this.abortRequested) {
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
                    // Pass includeContent and recursive flags down
                    await this.generateAllChildrenContent(child.id, includeContent, recursive);
                } catch (error: any) {
                    if (error.message === 'Generation aborted by user' || this.abortRequested) {
                        break;
                    }
                    console.error(`Failed to recursively generate children for ${child.title}:`, error);
                    // Continue with next child
                }
            }
        }

        // Only handle completion/cleanup for top-level call
        if (this.deps.generationController.getCurrentGenerationInfo()?.type === 'bulk') {
            try {
                if (this.abortRequested) {
                    this.deps.eventEmitter.emit('nodeGenerationAborted', { nodeId, node });
                } else {
                    // Clear progress bars and emit completion event
                    this.deps.eventEmitter.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
                    this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: true, node });
                    
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
        const systemPrompt = prompts.summarize_system.replace('{{content}}', node.content);

        try {
            node.isGenerating = true;
            if (!suppressProgressClearing) {
                this.deps.eventEmitter.emit('nodeGenerationStarted', { nodeId, node });
            }

            if (this.abortRequested) {
                throw new Error('Generation aborted by user');
            }

            const abortSignal = this.deps.generationController.getCurrentGenerationInfo()?.canAbort ? 
                new AbortController().signal : undefined;
            const summary = await this.deps.openRouterClient.chat('editor', systemPrompt, abortSignal);
            
            if (this.abortRequested) {
                throw new Error('Generation aborted by user');
            }

            node.context = summary;
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
            
            if (error.message === 'Request was aborted' || error.message === 'Generation aborted by user' || this.abortRequested) {
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
     * Parses a bulleted list from text.
     */
    private parseBulletedList(text: string): string[] {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('*') || line.startsWith('-'))
            .map(line => line.substring(1).trim())
            .filter(line => line.length > 0);
    }
} 