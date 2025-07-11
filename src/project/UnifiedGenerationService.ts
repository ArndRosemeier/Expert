import { DocumentNode } from '../DocumentNode';
import { TreeService } from './TreeService';
import { ContextService } from './ContextService';
import { PromptService } from './PromptService';
import { GenerationController } from './GenerationController';
import { LoopOrchestrator, LoopInput } from '../LoopOrchestrator';
import { SettingsManager } from '../SettingsManager';
import { OpenRouterClient } from '../OpenRouterClient';
import { EventEmitter } from '../EventEmitter';
import { PromptContextBuilder } from '../services/PromptContextBuilder';
import { promptExpansionService } from '../services/PromptExpansionService';
import { CoherenceService } from '../ui/modals/services/CoherenceService';
import { GenerationErrorService } from '../ui/modals/services/GenerationErrorService';
import { GenerationCoordinator } from './GenerationCoordinator';
import { QualityCriterion, CreatorPayload } from '../types';
import { LoopProgress, RaterProgressPayload, Rating } from '../LoopOrchestrator';

/**
 * Configuration for generation levels
 */
export interface GenerationLevels {
    /** Deepest level for which children are created */
    draftLevel: number;
    /** Which levels get content generated (must be ≤ draftLevel) */
    contentLevel: number;
    /** Which levels get context auto-pruned */
    contextPruneLevel: number;
    /** Which levels get coherence checking (must be < draftLevel) */
    coherenceLevel: number;
}

/**
 * Work item for the generation queue
 */
export interface WorkItem {
    nodeId: string;
    level: number;
    parentId?: string | null;
    isLastChild?: boolean;
}

/**
 * Unified progress event that combines all three progress layers
 */
export interface UnifiedProgressEvent {
    nodeId: string;
    operations?: {
        message: string;
        current: number;
        total: number;
    };
    iterations?: {
        message: string;
        current: number;
        total: number;
    };
    stages?: {
        message: string;
        current: number;
        total: number;
    };
    detail?: string;
    model?: string; // Current model being used (e.g., "Grok 4", "GPT-4")
}

/**
 * Dependencies for unified generation service
 */
export interface UnifiedGenerationDependencies {
    treeService: TreeService;
    contextService: ContextService;
    promptService: PromptService;
    generationController: GenerationController;
    generationCoordinator: GenerationCoordinator;
    loopOrchestrator: LoopOrchestrator;
    settingsManager: SettingsManager;
    openRouterClient: OpenRouterClient;
    eventEmitter: EventEmitter<any>;
    saveToStorage: () => Promise<void>;
    rootNode: DocumentNode;
}

/**
 * Unified generation service that processes all generation using a level-based work queue
 */
export class UnifiedGenerationService {
    private deps: UnifiedGenerationDependencies;
    private abortRequested: boolean = false;
    private coherenceService: CoherenceService;
    private currentOperationProgress: { current: number; total: number; message: string } | null = null;
    private currentIterationProgress: { current: number; total: number; message: string } | null = null;
    private currentStageProgress: { current: number; total: number; message: string } | null = null;
    private currentNodeId: string | null = null;
    // Add contradiction collection system
    private collectedContradictions: Array<{
        parentNode: DocumentNode;
        analysisResult: any; // Will import proper type later
    }> = [];

    constructor(dependencies: UnifiedGenerationDependencies) {
        this.deps = dependencies;
        this.coherenceService = new CoherenceService(dependencies.openRouterClient, dependencies.settingsManager);
    }

    /**
     * Main entry point for unified generation
     */
    public async generateWithLevels(startNodeId: string, levels: GenerationLevels): Promise<void> {
        // Clear any previous collected contradictions
        this.collectedContradictions = [];
        
        // Validate levels
        this.validateLevels(levels);

        // Check if another generation is already running
        if (this.deps.generationController.canAbortGeneration(this.deps.rootNode)) {
            throw new Error('Another generation operation is already in progress. Please abort it first or wait for completion.');
        }

        // Setup generation context
        this.abortRequested = false;
        this.deps.generationController.setupSingleNodeGeneration(startNodeId);

        // Get the starting node and set up generation state
        const startNode = this.deps.treeService.findNodeById(startNodeId, this.deps.rootNode);
        if (!startNode) {
            throw new Error(`Node not found: ${startNodeId}`);
        }

        // Register operation with coordinator for UI management
        const operationId = this.deps.generationCoordinator.startOperation('single-content', startNodeId);
        if (!operationId) {
            throw new Error('Failed to start generation operation - another operation is already running');
        }

        // Don't set spinner on initial node - let individual work items handle it
        console.log(`🚀 UnifiedGenerationService: Starting generation for "${startNode.title}" (${startNodeId})`);

        try {
            // Initialize work queue with all nodes that might need work (KISS principle)
            const workQueue: WorkItem[] = [];

            // Collect all nodes from starting node down to the deepest level we might work on
            const maxLevel = Math.max(levels.draftLevel, levels.contentLevel, levels.contextPruneLevel, levels.coherenceLevel);
            const allNodes = this.collectNodesInLevelRange(startNodeId, startNode.level, maxLevel);
            
            // Add all collected nodes to work queue - let the workers decide if they need to do anything
            allNodes.forEach((node: DocumentNode) => {
                workQueue.push({
                    nodeId: node.id,
                    level: node.level,
                    parentId: node.parentId,
                    isLastChild: false // Will be updated during processing
                });
            });

            console.log(`📋 Added ${workQueue.length} nodes to work queue (levels ${startNode.level}-${maxLevel})`);

            // Process work queue
            await this.processWorkQueue(workQueue, levels);

            // Tree updates now happen after each individual node completion
            // Complete operation with coordinator for UI cleanup
            this.deps.generationCoordinator.completeOperation(operationId, true);
            
            // Emit generation complete event for success
            console.log(`✅ UnifiedGenerationService: Generation completed successfully for "${startNode.title}" (${startNodeId})`);

            console.log('🎉 Unified generation completed successfully');
            
            // After generation completes, check for collected contradictions
            await this.showCollectedContradictions();
        } catch (error) {
            console.error('Unified generation failed:', error);
            
            // Complete operation with coordinator for UI cleanup
            this.deps.generationCoordinator.completeOperation(operationId, false, error);
            
            throw error;
        } finally {
            // Always cleanup generation context
            this.deps.generationController.clearGenerationContext();
            // Clear collected contradictions
            this.collectedContradictions = [];
        }
    }

    /**
     * Validate level configuration
     */
    private validateLevels(levels: GenerationLevels): void {
        if (levels.contentLevel > levels.draftLevel) {
            throw new Error('Content level cannot be higher than draft level');
        }
        if (levels.coherenceLevel >= levels.draftLevel) {
            throw new Error('Coherence level must be less than draft level');
        }
    }

    /**
     * Process the work queue using breadth-first traversal
     */
    private async processWorkQueue(workQueue: WorkItem[], levels: GenerationLevels): Promise<void> {
        let position = 0;

        while (position < workQueue.length) {
            // Check for abort request
            if (this.abortRequested) {
                throw new Error('Generation was aborted by user');
            }

            const currentItem = workQueue[position];
            if (!currentItem) {
                position++;
                continue;
            }

            const currentNode = this.deps.treeService.findNodeById(currentItem.nodeId, this.deps.rootNode);
            
            if (!currentNode) {
                console.error(`Node not found: ${currentItem.nodeId}`);
                position++;
                continue;
            }

            // Update top-level progress
            this.updateTopLevelProgress(position + 1, workQueue.length, currentNode);

            // Process current work item
            const newWorkItems = await this.processWorkItem(currentItem, levels);

            // Add new work items to END of queue (breadth-first)
            workQueue.push(...newWorkItems);

            position++;
        }
    }

    /**
     * Process a single work item
     */
    private async processWorkItem(item: WorkItem, levels: GenerationLevels): Promise<WorkItem[]> {
        const node = this.deps.treeService.findNodeById(item.nodeId, this.deps.rootNode);
        if (!node) {
            console.error(`Node not found: ${item.nodeId}`);
            return [];
        }

        const newWorkItems: WorkItem[] = [];

        try {
            // Determine if this node will actually need work
            const willDoWork = 
                (levels.contextPruneLevel >= node.level) ||
                (levels.contentLevel >= node.level && this.shouldGenerateContent(node)) ||
                (node.level < levels.draftLevel);

            // Move spinner to current node if it will do work
            if (willDoWork) {
                this.setCurrentWorkingNode(item.nodeId);
            }

            // 1. Context Pruning
            if (levels.contextPruneLevel >= node.level) {
                await this.handleContextPruning(item.nodeId);
            }

            // 2. Content Generation
            if (levels.contentLevel >= node.level && this.shouldGenerateContent(node)) {
                await this.handleContentGeneration(item.nodeId);
            }

            // 3. Draft Creation (Children)
            if (node.level < levels.draftLevel) {
                const childIds = await this.handleDraftCreation(item.nodeId);
                
                // Add any newly created children to work queue if they might need work
                // Check against ALL level settings to see if children could need any type of work
                const maxWorkLevel = Math.max(levels.draftLevel, levels.contentLevel, levels.contextPruneLevel, levels.coherenceLevel);
                
                for (let i = 0; i < childIds.length; i++) {
                    const childId = childIds[i]!; // Non-null assertion: guaranteed to be within bounds
                    const child = this.deps.treeService.findNodeById(childId, this.deps.rootNode);
                    if (child && child.level <= maxWorkLevel) {
                        newWorkItems.push({
                            nodeId: childId,
                            level: child.level,
                            parentId: item.nodeId,
                            isLastChild: i === childIds.length - 1
                        });
                    }
                }
            }

            // 4. Coherence Check (if this was the last child and coherence is enabled)
            if (item.isLastChild && item.parentId && levels.coherenceLevel !== -1) {
                const parentNode = this.deps.treeService.findNodeById(item.parentId, this.deps.rootNode);
                if (parentNode && levels.coherenceLevel >= parentNode.level) {
                    await this.handleCoherenceCheck(item.parentId!);
                }
            }

            // Clear spinner from current node if it did work
            if (willDoWork) {
                this.clearCurrentWorkingNode(item.nodeId);
            }

        } catch (error) {
            // Show error through the error service (includes console logging)
            const node = this.deps.treeService.findNodeById(item.nodeId, this.deps.rootNode);
            const nodeTitle = node?.title || 'Unknown Node';
            await GenerationErrorService.getInstance().showContentGenerationError(
                error as Error, 
                nodeTitle, 
                'Node Processing'
            );
            
            // Make sure to clear spinner even on error
            this.clearCurrentWorkingNode(item.nodeId);
            // Continue with next item rather than stopping entire generation
        }

        return newWorkItems;
    }

    /**
     * Handle context pruning for a node
     */
    private async handleContextPruning(nodeId: string): Promise<void> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) return;

        // Skip auto-pruning for project root nodes (no inherited context to clean)
        if (node.level === 0 || !node.parentId) {
            console.log(`⏭️ Skipping auto-prune for "${node.title}" - project root node`);
            return;
        }

        // Check if context has already been AI-adjusted (skip if so)
        if (this.isMasterContextAlreadyAdjusted(node)) {
            console.log(`⏭️ Skipping auto-prune for "${node.title}" - master context already AI-adjusted`);
            return;
        }

        try {
            // Emit start progress
            this.currentOperationProgress = {
                current: 1,
                total: 3,
                message: `Auto-pruning context for "${node.title}"`
            };
            this.currentNodeId = nodeId;
            this.emitUnifiedProgress();
            
            // Import the ContextAdjusterModal and run in automatic mode
            const { ContextAdjusterModal } = await import('../ui/modals/ContextAdjusterModal');
            const contextAdjuster = new ContextAdjusterModal();
            
            console.log(`🔧 Auto-pruning context for "${node.title}"`);
            
            // Update progress mid-way
            this.currentOperationProgress = {
                current: 2,
                total: 3,
                message: `Analyzing context for "${node.title}"`
            };
            this.emitUnifiedProgress();
            
            const contextChanged = await contextAdjuster.runAutomaticMode(node);
            
            // Emit completion progress
            this.currentOperationProgress = {
                current: 3,
                total: 3,
                message: contextChanged ? `Auto-pruned context for "${node.title}"` : `No context issues found for "${node.title}"`
            };
            this.emitUnifiedProgress();
            
            if (contextChanged) {
                console.log(`🔧 Auto-pruned context for "${node.title}"`);
            } else {
                console.log(`✅ No context issues found for "${node.title}"`);
            }
        } catch (error) {
            console.error('Auto-prune context failed:', error);
            // Continue with generation even if auto-prune fails
        }
    }

    /**
     * Handle content generation for a node
     */
    private async handleContentGeneration(nodeId: string): Promise<void> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) return;

        // Check for settings override from parent node
        const settingsOverride = this.extractSettingsOverride(node);
        const originalProfileName = settingsOverride ? this.deps.settingsManager.getLastUsedProfileName() || null : null;
        
        if (settingsOverride) {
            const overrideProfile = this.deps.settingsManager.getProfile(settingsOverride!);
            if (overrideProfile) {
                console.log(`🔧 Using settings override "${settingsOverride}" for node "${node.title}"`);
                await this.deps.settingsManager.setLastUsedProfile(settingsOverride!);
            }
        }

        try {
            const profile = this.deps.settingsManager.getLastUsedProfile();
            
            if (!profile || !profile.criteria || profile.criteria.length === 0) {
                throw new Error(`Cannot generate content for node "${node.title}". The active profile is missing or has no criteria.`);
            }

            // Get the raw prompt from the node
            const rawPrompt = node.generationPrompt || this.deps.promptService.getRawGenerationPrompt(node);

            // Fill the placeholders
            const context = this.deps.contextService.compileNodeContext(nodeId, this.deps.rootNode);
            const path = this.deps.treeService.getNodePath(nodeId, this.deps.rootNode);
            const filledPrompt = this.deps.promptService.fillGenerationPrompt(rawPrompt, node, context, path);
            
            // Filter criteria appropriately - use template-based leaf detection, not children count
            const isLeafNode = node.isLeaf;
            const filteredCriteria = this.filterCriteriaForNodeType(profile.criteria, isLeafNode);
            
            // Create loop input
            const loopInput: LoopInput = {
                prompt: filledPrompt,
                criteria: filteredCriteria,
                maxIterations: profile.maxIterations || 3,
                response: '', // Initial response is empty
                isLeafNode: isLeafNode
            };

            // Run the content generation loop
            await this.runContentLoop(nodeId, loopInput);
            
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showContentGenerationError(
                error as Error, 
                node.title, 
                'Content Generation'
            );
            
            throw error;
        } finally {
            // Restore original profile if we used an override
            if (settingsOverride && originalProfileName) {
                await this.deps.settingsManager.setLastUsedProfile(originalProfileName!);
            }
        }
    }

    /**
     * Handle draft creation (children) for a node
     */
    private async handleDraftCreation(nodeId: string): Promise<string[]> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) return [];

        // Check if node already has children
        if (node.children.length > 0) {
            console.log(`⏭️ Skipping draft creation for "${node.title}" - already has children`);
            return node.children.map(child => child.id);
        }

        try {
            // Emit start progress
            this.currentOperationProgress = {
                current: 1,
                total: 3,
                message: `Generating children for "${node.title}"`
            };
            this.currentNodeId = nodeId;
            this.emitUnifiedProgress();

            // Get the outline prompt template
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

            // Update progress mid-way
            this.currentOperationProgress = {
                current: 2,
                total: 3,
                message: `AI generating children for "${node.title}"`
            };
            this.emitUnifiedProgress();

            // Generate children using AI
            const response = await this.deps.openRouterClient.chat('creator', finalPrompt);
            const nodeItems = this.parseChildrenFromJSON(response);

            if (nodeItems.length === 0) {
                console.warn(`No children generated for "${node.title}"`);
                return [];
            }

            // Get the creator model name for tracking
            const currentProfile = this.deps.settingsManager.getLastUsedProfile();
            const creatorModel = currentProfile?.selectedModels?.['creator'];
            const childIds: string[] = [];

            nodeItems.forEach(item => {
                const newNode = this.deps.treeService.addNode(item.title, nodeId, this.deps.rootNode, creatorModel);
                childIds.push(newNode.id);
                
                // Set the content description as initial content if provided
                if (item.description && item.description.trim()) {
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
            
            // Emit completion progress
            this.currentOperationProgress = {
                current: 3,
                total: 3,
                message: `Created ${childIds.length} children for "${node.title}"`
            };
            this.emitUnifiedProgress();
            
            console.log(`✅ Created ${childIds.length} children for "${node.title}"`);
            
            // Update tree immediately after children are created
            console.log(`📢 EMITTING tree-update-needed event for node ${nodeId}: children-created`);
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'children-created' });
            
            return childIds;
            
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showContentGenerationError(
                error as Error, 
                node.title, 
                'Draft Creation'
            );
            
            throw error;
        }
    }

    /**
     * Handle coherence check for a parent node - collect contradictions instead of showing immediately
     */
    private async handleCoherenceCheck(parentId: string): Promise<void> {
        const parentNode = this.deps.treeService.findNodeById(parentId, this.deps.rootNode);
        if (!parentNode) return;

        try {
            // Check if node is eligible for coherence analysis
            if (!this.coherenceService.isNodeEligible(parentNode)) {
                const reason = this.coherenceService.getIneligibilityReason(parentNode);
                console.log(`⏭️ Skipping coherence check for "${parentNode.title}" - ${reason}`);
                return;
            }

            // Emit coherence analysis started event
            console.log(`🔍 Starting coherence analysis for "${parentNode.title}"`);
            this.deps.eventEmitter.emit('coherenceAnalysisStarted', { nodeId: parentId, node: parentNode });

            const result = await this.coherenceService.analyzeCoherence(parentNode);
            
            // Emit coherence analysis complete event
            this.deps.eventEmitter.emit('coherenceAnalysisComplete', { 
                nodeId: parentId, 
                node: parentNode, 
                hasContradictions: result.hasContradictions, 
                contradictionCount: result.contradictions.length 
            });
            
            if (!result.hasContradictions) {
                console.log(`✅ Coherence check passed for "${parentNode.title}" (no contradictions found)`);
            } else {
                console.log(`⚠️ Coherence issues found for "${parentNode.title}" (${result.contradictions.length} contradictions) - collecting for batch display`);
                
                // Collect contradictions instead of showing immediately
                this.collectedContradictions.push({
                    parentNode: parentNode,
                    analysisResult: result
                });
                
                console.log(`📋 Collected contradictions for "${parentNode.title}" - total collected: ${this.collectedContradictions.length}`);
            }
            
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showAIError(
                error as Error,
                {
                    title: 'Coherence Check Failed',
                    operation: `Coherence check for "${parentNode.title}"`,
                    purpose: 'Coherence Analysis'
                }
            );
            
            // Continue with generation even if coherence check fails
        }
    }

    /**
     * Show all collected contradictions in a single modal at the end of generation
     */
    private async showCollectedContradictions(): Promise<void> {
        if (this.collectedContradictions.length === 0) {
            console.log('📋 No contradictions found during generation');
            return;
        }

        console.log(`📋 Showing collected contradictions: ${this.collectedContradictions.length} nodes with issues`);

        try {
            // Show a simple alert for now summarizing all contradictions
            // TODO: Create a proper batch modal that can handle multiple nodes at once
            
            const totalContradictions = this.collectedContradictions.reduce((sum, item) => 
                sum + item.analysisResult.contradictions.length, 0);
            
            const nodeList = this.collectedContradictions.map(item => 
                `• ${item.parentNode.title} (${item.analysisResult.contradictions.length} issues)`
            ).join('\n');
            
            alert(`⚠️ Coherence Analysis Results\n\nFound contradictions in ${this.collectedContradictions.length} node(s):\n\n${nodeList}\n\nTotal contradictions: ${totalContradictions}\n\nDetailed analysis can be accessed individually through the node actions menu.`);
            
            console.log(`📋 Showed batch coherence summary for ${this.collectedContradictions.length} nodes with ${totalContradictions} total contradictions`);
            
            // Tag all analyzed nodes' subnodes as consistent to parent after showing summary
            this.tagAnalyzedSubnodesAsConsistent();
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showAIError(
                error as Error,
                {
                    title: 'Coherence Modal Error',
                    operation: 'Opening batch coherence modal',
                    purpose: 'Coherence Analysis'
                }
            );
        }
    }

    /**
     * Tag all analyzed nodes' subnodes as consistent to parent
     */
    private tagAnalyzedSubnodesAsConsistent(): void {
        console.log(`🏷️ Tagging subnodes from batch coherence analysis as consistent to parent`);
        
        let totalTaggedCount = 0;
        
        for (const collected of this.collectedContradictions) {
            const parentNode = collected.parentNode;
            console.log(`🏷️ Tagging subnodes of "${parentNode.title}" as consistent to parent`);
            
            let nodeTaggedCount = 0;
            
            // Tag all children's master versions
            for (const childNode of parentNode.children) {
                const masterVersion = childNode.getMasterVersion();
                if (masterVersion) {
                    // Add the consistent_to_parent tag
                    masterVersion.tags.add('consistent_to_parent');
                    masterVersion.timestamp = new Date(); // Update timestamp
                    nodeTaggedCount++;
                    totalTaggedCount++;
                    console.log(`🏷️ Tagged "${childNode.title}" master version as consistent_to_parent`);
                } else {
                    console.warn(`⚠️ No master version found for child node "${childNode.title}"`);
                }
            }
            
            console.log(`✅ Tagged ${nodeTaggedCount} subnodes as consistent to parent: "${parentNode.title}"`);
        }
        
        console.log(`✅ Batch tagging completed: ${totalTaggedCount} total subnodes tagged as consistent`);
        
        // Save the project after tagging
        this.saveProjectAfterBatchTagging();
    }

    /**
     * Save project after batch tagging subnodes
     */
    private async saveProjectAfterBatchTagging(): Promise<void> {
        try {
            await this.deps.saveToStorage();
            console.log('✅ Project saved after batch tagging subnodes as consistent');
        } catch (error) {
            console.warn('⚠️ Failed to save project after batch tagging subnodes:', error);
            // Don't fail the operation if save fails
        }
    }

    /**
     * Set the current working node and move the spinner to it
     */
    private setCurrentWorkingNode(nodeId: string): void {
        // Clear spinner from previous node if any
        if (this.currentNodeId) {
            this.clearCurrentWorkingNode(this.currentNodeId);
        }

        // Set spinner on new node
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (node) {
            node.isGenerating = true;
            this.currentNodeId = nodeId;
            this.deps.eventEmitter.emit('nodeGenerationStarted', { nodeId, node });
        }
    }

    /**
     * Clear the current working node and remove the spinner from it
     */
    private clearCurrentWorkingNode(nodeId: string): void {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (node) {
            node.isGenerating = false;
            this.deps.eventEmitter.emit('nodeGenerationComplete', { nodeId, success: true, node });
        }
        
        // Clear current node if it matches
        if (this.currentNodeId === nodeId) {
            this.currentNodeId = null;
        }
    }

    private updateTopLevelProgress(position: number, total: number, currentNode: DocumentNode): void {
        this.currentOperationProgress = {
            current: position,
            total: total,
            message: `Processing: ${currentNode.title} (${position}/${total})`
        };
        this.currentNodeId = currentNode.id;
        this.emitUnifiedProgress();
    }

    /**
     * Get current model information for progress display
     */
    private getCurrentModelInfo(): string | undefined {
        const profile = this.deps.settingsManager.getLastUsedProfile();
        if (!profile?.selectedModels?.['creator']) return undefined;
        
        return this.formatModelName(profile.selectedModels['creator']);
    }

    /**
     * Format model name for user display (e.g., "x-ai/grok-4" -> "Grok 4")
     */
    private formatModelName(modelId: string): string {
        // Map of model patterns to friendly names
        const modelMap: { [key: string]: string } = {
            'x-ai/grok-4': 'Grok 4',
            'x-ai/grok-2': 'Grok 2',
            'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
            'anthropic/claude-3-opus': 'Claude 3 Opus',
            'anthropic/claude-3-sonnet': 'Claude 3 Sonnet',
            'anthropic/claude-3-haiku': 'Claude 3 Haiku',
            'openai/gpt-4o': 'GPT-4o',
            'openai/gpt-4': 'GPT-4',
            'openai/gpt-4-turbo': 'GPT-4 Turbo',
            'openai/gpt-3.5-turbo': 'GPT-3.5 Turbo',
            'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
            'google/gemini-pro': 'Gemini Pro',
            'meta-llama/llama-3.1-405b-instruct': 'Llama 3.1 405B',
            'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1 70B',
            'meta-llama/llama-3.1-8b-instruct': 'Llama 3.1 8B'
        };

        // Check for exact match first
        if (modelMap[modelId]) {
            return modelMap[modelId];
        }

        // Extract readable name from model ID if no exact match
        let name = modelId.replace(/^[^/]+\//, ''); // Remove provider prefix
        name = name.replace(/-instruct$/, ''); // Remove -instruct suffix
        name = name.replace(/-/g, ' '); // Replace hyphens with spaces
        
        // Capitalize words
        return name.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }

    /**
     * Emit unified progress event that combines all three layers
     */
    private emitUnifiedProgress(): void {
        if (!this.currentNodeId) return;

        const unifiedProgress: UnifiedProgressEvent = {
            nodeId: this.currentNodeId,
        };

        if (this.currentOperationProgress) {
            unifiedProgress.operations = this.currentOperationProgress;
        }

        if (this.currentIterationProgress) {
            unifiedProgress.iterations = this.currentIterationProgress;
        }

        if (this.currentStageProgress) {
            unifiedProgress.stages = this.currentStageProgress;
        }

        // Add current model information
        const modelInfo = this.getCurrentModelInfo();
        if (modelInfo) {
            unifiedProgress.model = modelInfo;
        }

        this.deps.eventEmitter.emit('unified-progress', unifiedProgress);
    }

    /**
     * Determine if content should be generated for a node
     */
    private shouldGenerateContent(node: DocumentNode): boolean {
        // Skip if node already has final content
        return node.getState() !== 'Final';
    }

    /**
     * Run the content generation loop for a node (copied from GenerationService)
     */
    private async runContentLoop(nodeId: string, loopInput: LoopInput): Promise<void> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) {
            console.error(`Node not found in runContentLoop: ${nodeId}`);
            return;
        }

        // Note: Individual content generation does not emit generation events
        // Only the main unified generation process emits those events
        console.log(`🚀 Starting content generation for: "${node.title}" (${nodeId})`);
        
        // Start a new generation session
        node.startGenerationSession(loopInput.prompt);
        let currentIterationContent: string | null = null;
        let currentIterationRatings: Rating[] = [];
        
        // Subscribe to progress updates from the orchestrator
        const onProgress = (progress: LoopProgress) => {
            if (this.abortRequested) {
                return;
            }
            
            // Update unified progress tracking
            this.currentNodeId = nodeId;
            this.currentIterationProgress = {
                current: progress.iteration,
                total: progress.maxIterations,
                message: `Iteration ${progress.iteration} of ${progress.maxIterations}`
            };
            this.currentStageProgress = {
                current: progress.step,
                total: progress.totalStepsInIteration,
                message: `${progress.type} phase`
            };
            this.emitUnifiedProgress();
            
            if (progress.type === 'creator') {
                const payload = progress.payload as CreatorPayload;
                if (!payload.response.includes('is working')) {
                    currentIterationContent = payload.response;
                }
            } else if (progress.type === 'rater') {
                const payload = progress.payload as RaterProgressPayload;
                if (payload.rating && payload.rating.criterion) {
                    const existingRatingIndex = currentIterationRatings.findIndex(
                        r => r.criterion === payload.rating.criterion
                    );
                    if (existingRatingIndex >= 0) {
                        currentIterationRatings[existingRatingIndex] = payload.rating;
                    } else {
                        currentIterationRatings.push(payload.rating);
                    }
                    
                    if (currentIterationRatings.length === loopInput.criteria.length && currentIterationContent) {
                        node.addGenerationIteration(
                            progress.iteration, 
                            currentIterationContent, 
                            [...currentIterationRatings]
                        );
                        currentIterationRatings = [];
                    }
                }
            }
        };

        const onAborted = (_message: string) => {
            // Generation aborted - no additional action needed
        };

        const onStarted = (input: LoopInput) => {
            this.deps.eventEmitter.emit('loop-progress', { 
                nodeId, 
                progress: {
                    type: 'creator',
                    payload: { prompt: 'Initializing generation...', response: '' } as CreatorPayload,
                    iteration: 0,
                    maxIterations: input.maxIterations,
                    step: 0,
                    totalStepsInIteration: 3
                } as LoopProgress
            });
        };

        const onIterationStarted = (iteration: number, maxIterations: number) => {
            this.deps.eventEmitter.emit('loop-progress', { 
                nodeId, 
                progress: {
                    type: 'creator',
                    payload: { prompt: `Starting iteration ${iteration}...`, response: '' } as CreatorPayload,
                    iteration,
                    maxIterations,
                    step: 0,
                    totalStepsInIteration: 3
                } as LoopProgress
            });
        };

        const onPhaseStarted = (phase: 'create' | 'rate' | 'edit', iteration: number) => {
            const stepMap = { create: 1, rate: 2, edit: 3 };
            this.deps.eventEmitter.emit('loop-progress', { 
                nodeId, 
                progress: {
                    type: 'creator',
                    payload: { prompt: `${phase} phase...`, response: '' } as CreatorPayload,
                    iteration,
                    maxIterations: loopInput.maxIterations,
                    step: stepMap[phase],
                    totalStepsInIteration: 3
                } as LoopProgress
            });
        };

        // Set up LoopOrchestrator event handlers
        this.deps.loopOrchestrator.on('progress', onProgress);
        this.deps.loopOrchestrator.on('aborted', onAborted);
        this.deps.loopOrchestrator.on('started', onStarted);
        this.deps.loopOrchestrator.on('iteration-started', onIterationStarted);
        this.deps.loopOrchestrator.on('phase-started', onPhaseStarted);

        try {
            // Run the loop orchestrator
            const result = await this.deps.loopOrchestrator.runLoop(loopInput);

            // Handle completion - properly end session and create versions like the old GenerationService
            if (result.finalResponse) {
                const profile = this.deps.settingsManager.getLastUsedProfile();
                const creatorModel = profile?.selectedModels?.['creator'];
                
                // End the generation session with the final result
                node.endGenerationSession(result.success, result.finalResponse);
                
                // Create generation versions from the completed session iterations
                const latestSession = node.getLatestGenerationSession();
                if (latestSession && latestSession.iterations.length > 0) {
                    latestSession.iterations.forEach((iteration) => {
                        node.setContentFromGeneration(iteration.content, creatorModel, iteration.iteration);
                    });
                }
                
                // Promote the final result to master and mark as winner
                const completedSession = node.getLatestGenerationSession();
                if (completedSession) {
                    const finalIterationNumber = completedSession.finalIterationNumber;
                    const generationVersion = node.getAllVersions().find(v => 
                        v.tags.has('generated') && v.tags.has(`iteration${finalIterationNumber}`)
                    );
                    
                    if (generationVersion) {
                        node.promoteToMaster(generationVersion.id, ['generatedWinner']);
                    } else {
                        console.warn(`No version found for final iteration ${finalIterationNumber} for node ${node.title}`);
                    }
                }
                
                await this.deps.saveToStorage();
                
                // Log success or partial success
                if (result.success) {
                    console.log(`✅ Content generation completed for: "${node.title}" (all criteria met)`);
                } else {
                    console.log(`⚠️ Content generation completed for: "${node.title}" (best iteration selected)`);
                }
                
                // Update tree after each node completion so user sees progress
                console.log(`📢 EMITTING tree-update-needed event for node ${nodeId}: content-generated`);
                this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'content-generated' });
                // Note: Individual content generation does not emit completion events
                // Only the main unified generation process emits those events
            } else {
                console.log(`❌ Content generation failed for: "${node.title}" (no content generated)`);
                // Still update tree even on failure to show any partial progress
                console.log(`📢 EMITTING tree-update-needed event for node ${nodeId}: content-generation-failed`);
                this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'content-generation-failed' });
                // Note: Individual content generation does not emit completion events
                // The error will be caught and handled by the main unified generation process
                throw new Error(`Content generation failed for node: ${node.title}`);
            }
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showContentGenerationError(
                error as Error, 
                node.title, 
                'Content Loop'
            );
            
            // End the generation session with failure if it's still active
            if (node.currentGenerationSession) {
                node.endGenerationSession(false, currentIterationContent || '');
            }
            
            // Note: Individual content generation does not emit completion events
            // Re-throw the error to be handled by the main unified generation process
            throw error;
        } finally {
            // Clean up LoopOrchestrator event handlers
            this.deps.loopOrchestrator.off('progress', onProgress);
            this.deps.loopOrchestrator.off('aborted', onAborted);
            this.deps.loopOrchestrator.off('started', onStarted);
            this.deps.loopOrchestrator.off('iteration-started', onIterationStarted);
            this.deps.loopOrchestrator.off('phase-started', onPhaseStarted);
            
            // Note: Individual content generation does not manage isGenerating flag
            // Only the main unified generation process manages this flag
        }
    }

    /**
     * Collect all nodes within a level range starting from a specific node
     * Uses breadth-first traversal to ensure proper ordering
     */
    private collectNodesInLevelRange(startNodeId: string, minLevel: number, maxLevel: number): DocumentNode[] {
        const result: DocumentNode[] = [];
        const queue: DocumentNode[] = [];
        const visited = new Set<string>();
        
        // Start with the starting node
        const startNode = this.deps.treeService.findNodeById(startNodeId, this.deps.rootNode);
        if (!startNode) return result;
        
        queue.push(startNode);
        visited.add(startNode.id);
        
        while (queue.length > 0) {
            const currentNode = queue.shift()!;
            
            // Add current node if it's within the level range
            if (currentNode.level >= minLevel && currentNode.level <= maxLevel) {
                result.push(currentNode);
            }
            
            // Add children to queue if they could be within range
            if (currentNode.level < maxLevel) {
                currentNode.children.forEach(child => {
                    if (!visited.has(child.id)) {
                        queue.push(child);
                        visited.add(child.id);
                    }
                });
            }
        }
        
        return result;
    }

    /**
     * Abort current generation
     */
    public abortCurrentGeneration(): void {
        this.abortRequested = true;
        this.deps.loopOrchestrator.requestStop();
    }



    /**
     * Check if the master context has already been AI-adjusted
     */
    private isMasterContextAlreadyAdjusted(node: DocumentNode): boolean {
        const masterVersion = node.getMasterVersion();
        if (!masterVersion) {
            return false; // No master version means no context to check
        }

        // Primary check: if master version has the context_ai_adjusted tag, skip analysis
        if (masterVersion.tags.has('context_ai_adjusted')) {
            console.log(`🔍 Master version already has context_ai_adjusted tag, skipping analysis for "${node.title}"`);
            return true;
        }

        // Fallback check: if tag is missing, check if master context matches any previously AI-adjusted versions
        // This handles cases where context was adjusted in a draft version that later became master
        const masterContext = masterVersion.context;
        
        // Find all versions that have been context AI-adjusted
        const adjustedVersions = node.getAllVersions().filter(version => 
            version.tags.has('context_ai_adjusted')
        );

        // If no versions have been AI-adjusted, then master context needs adjustment
        if (adjustedVersions.length === 0) {
            console.log(`🔍 Master version has no context_ai_adjusted tag and no previously adjusted versions found, analysis needed for "${node.title}"`);
            return false;
        }

        // Check if ANY AI-adjusted version has the same context as the master
        // If so, the master context is effectively already adjusted
        for (const adjustedVersion of adjustedVersions) {
            if (adjustedVersion.context === masterContext) {
                console.log(`🔍 Master context matches AI-adjusted version (${adjustedVersion.id.substring(0, 8)}...), skipping analysis for "${node.title}"`);
                return true;
            }
        }

        // Master context differs from all AI-adjusted versions, needs adjustment
        console.log(`🔍 Master context differs from all ${adjustedVersions.length} AI-adjusted version(s), analysis needed for "${node.title}"`);
        return false;
    }

    /**
     * Extract settings override from node context (copied from GenerationService)
     */
    private extractSettingsOverride(node: DocumentNode): string | null {
        const context = node.context || '';
        const match = context.match(/\[settings:([^\]]+)\]/);
        return match ? match[1] || null : null;
    }



    /**
     * Filter criteria for node type (copied from GenerationService)
     */
    private filterCriteriaForNodeType(criteria: QualityCriterion[], isLeafNode: boolean): QualityCriterion[] {
        return criteria.filter(criterion => {
            if (criterion.leaf === undefined) {
                return true;
            }
            return criterion.leaf === isLeafNode;
        });
    }

    /**
     * Parse children from JSON response (copied from GenerationService)
     */
    private parseChildrenFromJSON(text: string): Array<{title: string, description: string}> {
        // Remove any surrounding backticks/code blocks
        let cleanText = text.replace(/^```(?:json)?\n?/gm, '').replace(/\n?```$/gm, '');
        
        try {
            const parsed = JSON.parse(cleanText);
            
            if (Array.isArray(parsed)) {
                return parsed.map(item => ({
                    title: String(item.title || '').trim(),
                    description: String(item.description || '').trim()
                })).filter(item => item.title);
            }
            
            return [];
        } catch (error) {
            // If JSON parsing fails, try to fix common issues with newlines in strings
            console.warn('Initial JSON parse failed, attempting to fix newlines...');
            
            try {
                // Simple approach: replace literal newlines within quoted strings with spaces
                // Match patterns like: "text\nmore text" and replace \n with space
                let fixedText = cleanText.replace(/"([^"]*\n[^"]*)"?/g, (_match, content) => {
                    const fixedContent = content.replace(/\n\s*/g, ' ');
                    return `"${fixedContent}"`;
                });
                
                const parsed = JSON.parse(fixedText);
                
                if (Array.isArray(parsed)) {
                    return parsed.map(item => ({
                        title: String(item.title || '').trim(),
                        description: String(item.description || '').trim()
                    })).filter(item => item.title);
                }
                
                return [];
            } catch (secondError) {
                console.error('Failed to parse children JSON even after cleanup:', secondError);
                console.error('Raw text:', text);
                console.error('Cleaned text:', cleanText);
                return [];
            }
        }
    }
} 