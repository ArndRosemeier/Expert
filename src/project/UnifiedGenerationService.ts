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
import { createPromptExpansionService } from '../services/PromptExpansionService';
import { CoherenceService } from '../ui/modals/services/CoherenceService';
import { GenerationErrorService } from '../ui/modals/services/GenerationErrorService';
import { GenerationCoordinator } from './GenerationCoordinator';
import { QualityCriterion, CreatorPayload } from '../types';
import { LoopProgress, RaterProgressPayload, Rating } from '../LoopOrchestrator';
import { TaskModelService } from '../services/TaskModelService';

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
    /** Autofix severity threshold (-1 = disabled, 1-10 = threshold) */
    autofixSeverity: number;
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
    private taskModelService: TaskModelService;
    private currentOperationProgress: { current: number; total: number; message: string } | null = null;
    private currentIterationProgress: { current: number; total: number; message: string } | null = null;
    private currentStageProgress: { current: number; total: number; message: string } | null = null;
    private currentNodeId: string | null = null;
    private currentOperationType: 'content' | 'draft' | 'context' | 'coherence' | null = null;
    // Add contradiction collection system
    private accumulatedContradictions: {
        hasContradictions: boolean;
        contradictions: any[];
        analyzedNodes: DocumentNode[];
        totalAnalyzed: number;
    } = {
        hasContradictions: false,
        contradictions: [],
        analyzedNodes: [],
        totalAnalyzed: 0
    };
    
    // Track which parents have already been coherence-analyzed to prevent duplicates


    constructor(dependencies: UnifiedGenerationDependencies) {
        this.deps = dependencies;
        this.coherenceService = new CoherenceService(dependencies.openRouterClient, dependencies.settingsManager);
        this.taskModelService = new TaskModelService(dependencies.settingsManager);
    }

    /**
     * Main entry point for unified generation
     */
    public async generateWithLevels(startNodeId: string, levels: GenerationLevels): Promise<void> {
        // Clear any previous accumulated contradictions and analyzed parents
        this.accumulatedContradictions = {
            hasContradictions: false,
            contradictions: [],
            analyzedNodes: [],
            totalAnalyzed: 0
        };
        
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
                    isLastChild: false // Will be updated by updateIsLastChildFlags
                });
            });



            // Process work queue
            await this.processWorkQueue(workQueue, levels);

            // After generation completes, check for collected contradictions
            // This may show a modal requiring user interaction
            await this.showCollectedContradictions();
            
            // Tree updates now happen after each individual node completion
            // Complete operation with coordinator for UI cleanup AFTER coherence interaction is done
            this.deps.generationCoordinator.completeOperation(operationId, true);
        } catch (error) {
            console.error('Unified generation failed:', error);
            
            // Complete operation with coordinator for UI cleanup
            this.deps.generationCoordinator.completeOperation(operationId, false, error);
            
            throw error;
        } finally {
            // Always cleanup generation context
            this.deps.generationController.clearGenerationContext();
            // Clear accumulated contradictions and analyzed parents
            this.accumulatedContradictions = {
                hasContradictions: false,
                contradictions: [],
                analyzedNodes: [],
                totalAnalyzed: 0
            };
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
     * Process the work queue using simple breadth-first traversal with two-pass system
     * Pass 1: Fix content, context, coherence (canExpand = false)
     * Pass 2: Create children from finalized content (canExpand = true)
     */
    private async processWorkQueue(workQueue: WorkItem[], levels: GenerationLevels): Promise<void> {
        // Group work items by level for breadth-first processing
        const workItemsByLevel = new Map<number, WorkItem[]>();
        
        // Initial grouping
        workQueue.forEach(item => {
            const levelItems = workItemsByLevel.get(item.level) || [];
            levelItems.push(item);
            workItemsByLevel.set(item.level, levelItems);
        });

        let totalProcessed = 0;
        let totalItems = workQueue.length;
        let processedLevels = new Set<number>();

        // Continue processing until no new levels are added
        while (true) {
            // Check for abort at the start of each main loop iteration
            if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
                throw new Error('Generation was aborted by user');
            }

            // Get levels that haven't been processed yet, sorted by level
            const unprocessedLevels = Array.from(workItemsByLevel.keys())
                .filter(level => !processedLevels.has(level))
                .sort((a, b) => a - b);

            if (unprocessedLevels.length === 0) {
                break;
            }

            // Process the next level
            const level = unprocessedLevels[0]!;
            const levelItems = workItemsByLevel.get(level) || [];
            
            if (levelItems.length === 0) {
                processedLevels.add(level);
                continue;
            }

            // Show any accumulated contradictions from the previous level before proceeding
            if (processedLevels.size > 0) {
                const previousLevel = Math.max(...Array.from(processedLevels));
                if (level > previousLevel) {
                    await this.showAccumulatedContradictionsForLevelTransition(previousLevel, level);
                }
            }

            // Two-pass processing for each level
            // Pass 1: Process level with canExpand = false (no draft creation)
            let newWorkItems = await this.processLevelSimple(levelItems, levels, totalProcessed, totalItems, false);
            
            // Pass 2: Go back to start of level with canExpand = true (allow draft creation)
            const expansionWorkItems = await this.processLevelSimple(levelItems, levels, totalProcessed, totalItems, true);
            
            // Combine work items from both passes
            newWorkItems.push(...expansionWorkItems);
            
            // Add any new work items (children) to the appropriate level groups
            newWorkItems.forEach((item: WorkItem) => {
                const levelItems = workItemsByLevel.get(item.level) || [];
                levelItems.push(item);
                workItemsByLevel.set(item.level, levelItems);
            });

            // Mark this level as processed
            processedLevels.add(level);
            totalProcessed += levelItems.length;
            
            // Update total items count if new items were added
            if (newWorkItems.length > 0) {
                totalItems += newWorkItems.length;
            }
        }
    }

    /**
     * Process all nodes at a given level simply - each node decides what to do based on its state
     */
    private async processLevelSimple(levelItems: WorkItem[], levels: GenerationLevels, baseProgress: number, totalItems: number, canExpand: boolean = false): Promise<WorkItem[]> {
        const newWorkItems: WorkItem[] = [];
        
        for (let i = 0; i < levelItems.length; i++) {
            if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
                throw new Error('Generation was aborted by user');
            }

            const item = levelItems[i];
            if (!item) continue;
            
            const node = this.deps.treeService.findNodeById(item.nodeId, this.deps.rootNode);
            if (!node) continue;

            this.updateTopLevelProgress(baseProgress + i + 1, totalItems, node);

            // Each node decides what to do based on its current state
            const nodeWorkItems = await this.processNodeBasedOnState(node, levels, canExpand);
            newWorkItems.push(...nodeWorkItems);
        }

        return newWorkItems;
    }



    /**
     * Process a single node based on its current state
     */
    private async processNodeBasedOnState(node: DocumentNode, levels: GenerationLevels, canExpand: boolean = false): Promise<WorkItem[]> {
        const newWorkItems: WorkItem[] = [];

        // 1. Context pruning (if needed and not already done) - only during finalization pass
        if (!canExpand && this.needsContextPruning(node, levels)) {
            this.setCurrentWorkingNode(node.id);
            await this.handleContextPruning(node.id);
            this.clearCurrentWorkingNode(node.id);
        }

        // 2. Content generation (if needed and not already done) - only during finalization pass
        if (!canExpand && this.needsContentGeneration(node, levels)) {
            this.setCurrentWorkingNode(node.id);
            await this.handleContentGeneration(node.id);
            this.clearCurrentWorkingNode(node.id);
        }

        // 3. Draft creation (if needed, not already done, AND canExpand is true)
        if (canExpand && this.needsDraftCreation(node, levels)) {
            this.setCurrentWorkingNode(node.id);
            const draftResult = await this.handleDraftCreation(node.id);
            this.clearCurrentWorkingNode(node.id);
            
            // Add newly created children to work queue
            if (draftResult.childrenCreated) {
                const maxWorkLevel = Math.max(levels.draftLevel, levels.contentLevel, levels.contextPruneLevel, levels.coherenceLevel);
                
                // Create work items for children
                for (const childId of draftResult.childIds) {
                    const child = this.deps.treeService.findNodeById(childId, this.deps.rootNode);
                    if (child && child.level <= maxWorkLevel) {
                        newWorkItems.push({
                            nodeId: childId,
                            level: child.level,
                            parentId: node.id,
                            isLastChild: false // No longer used, kept for interface compatibility
                        });
                    }
                }
            }
        }

        // 4. Coherence checking (if this is the last child of a parent that needs checking) - only during finalization pass
        if (!canExpand && this.needsCoherenceCheck(node, levels)) {
            if (node.parentId) {
                const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
                if (parentNode) {
                    await this.handleCoherenceCheck(node.parentId, levels);
                }
            }
        }

        return newWorkItems;
    }

    /**
     * Check if node needs context pruning
     */
    private needsContextPruning(node: DocumentNode, levels: GenerationLevels): boolean {
        if (levels.contextPruneLevel < node.level) return false;
        if (node.level === 0 || !node.parentId) return false; // Skip root nodes
        return !this.isMasterContextAlreadyAdjusted(node);
    }

    /**
     * Check if node needs content generation  
     */
    private needsContentGeneration(node: DocumentNode, levels: GenerationLevels): boolean {
        if (levels.contentLevel < node.level) return false;
        return this.shouldGenerateContent(node);
    }

    /**
     * Check if node needs draft creation
     */
    private needsDraftCreation(node: DocumentNode, levels: GenerationLevels): boolean {
        if (node.level >= levels.draftLevel) return false;
        return node.children.length === 0; // Only create if no children exist
    }

    /**
     * Check if coherence check is needed (when this is the last child of a parent)
     */
    private needsCoherenceCheck(node: DocumentNode, levels: GenerationLevels): boolean {
        if (levels.coherenceLevel === -1) return false;
        if (!node.parentId) return false;
        
        const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
        if (!parentNode) return false;
        
        // Only check if coherence level covers the parent's level
        if (levels.coherenceLevel < parentNode.level) return false;
        
        // New approach: Check if ALL children have "consistent_to_parent" tag
        // If even one child doesn't have this tag, we need to check coherence
        const allChildrenConsistent = parentNode.children.every(child => {
            const masterVersion = child.getMasterVersion();
            return masterVersion && masterVersion.tags.has('consistent_to_parent');
        });
        
        // If all children are already consistent, no need to check
        if (allChildrenConsistent) {
            return false;
        }
        
        // Check if all siblings are "done" (have content or are drafts)
        const allSiblingsReady = parentNode.children.every(child => {
            const childContent = child.content && child.content.trim().length > 0;
            return childContent;
        });
        
        // Only trigger if this is actually the last child in the tree structure
        const isLastChildInTree = parentNode.children.length > 0 && 
                                 parentNode.children[parentNode.children.length - 1]?.id === node.id;
        
        return allSiblingsReady && isLastChildInTree;
    }





    /**
     * Handle context pruning for a node
     */
    private async handleContextPruning(nodeId: string): Promise<void> {
        // Check for abort at start of operation
        if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
            throw new Error('Generation was aborted by user');
        }

        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) return;

        // Skip auto-pruning for project root nodes (no inherited context to clean)
        if (node.level === 0 || !node.parentId) {
            return;
        }

        // Check if context has already been AI-adjusted (skip if so)
        if (this.isMasterContextAlreadyAdjusted(node)) {
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
            this.currentOperationType = 'context';
            this.emitUnifiedProgress();
            
            // Import the ContextAdjusterModal and run in automatic mode
            const { ContextAdjusterModal } = await import('../ui/modals/ContextAdjusterModal');
            const contextAdjuster = new ContextAdjusterModal();
            
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
        } catch (error) {
            // Check if this is an abort error - if so, propagate it immediately
            if (error instanceof Error && (
                error.message.includes('aborted by user') || 
                error.message.includes('Request was aborted') ||
                error.name === 'AbortError'
            )) {
                throw error; // Propagate abort errors
            }
            
            // For other errors, log but continue with generation
            console.error('Auto-prune context failed:', error);
            // Continue with generation even if auto-prune fails
        }
    }

    /**
     * Handle content generation for a node
     */
    private async handleContentGeneration(nodeId: string): Promise<void> {
        // Check for abort at start of operation
        if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
            console.log('🛑 UnifiedGenerationService: Abort detected in handleContentGeneration');
            throw new Error('Generation was aborted by user');
        }

        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) return;

        // Set operation type for progress tracking
        this.currentOperationType = 'content';
        this.currentNodeId = nodeId;
        
        // Only generate content if needed
        if (!this.shouldGenerateContent(node)) {
            console.log(`⏭️ Skipping content generation for "${node.title}" - node state: ${node.getState()}`);
            return;
        }

        try {
            // Update progress to show we're working on this node
            this.currentOperationProgress = {
                current: 1,
                total: 1,
                message: `Generating content for "${node.title}"`
            };
            this.emitUnifiedProgress();

            // Build loop input
            const loopInput = this.buildLoopInput(node);

            // Run the content generation loop
            await this.runContentLoop(nodeId, loopInput);

            console.log(`✅ Content generation completed for "${node.title}"`);
            
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showAIError(
                error as Error,
                {
                    title: 'Content Generation Failed',
                    operation: `Content generation for "${node.title}"`,
                    purpose: 'Content Generation'
                }
            );
            
            // Let the error propagate to be handled by the caller
            throw error;
        } finally {
            // Clear operation type after content generation
            this.currentOperationType = null;
            this.emitUnifiedProgress();
        }
    }

    /**
     * Handle draft creation (children) for a node
     * Returns object with childIds and whether children were actually created
     */
    private async handleDraftCreation(nodeId: string): Promise<{ childIds: string[]; childrenCreated: boolean }> {
        // Check for abort at start of operation
        if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
            console.log('🛑 UnifiedGenerationService: Abort detected in handleDraftCreation');
            throw new Error('Generation was aborted by user');
        }

        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) return { childIds: [], childrenCreated: false };

        // Check if node already has children
        if (node.children.length > 0) {
            console.log(`⏭️ Skipping draft creation for "${node.title}" - already has children`);
            return { childIds: node.children.map(child => child.id), childrenCreated: false };
        }

        try {
            // Emit start progress
            this.currentOperationProgress = {
                current: 1,
                total: 3,
                message: `Generating children for "${node.title}"`
            };
            this.currentNodeId = nodeId;
            this.currentOperationType = 'draft';
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
            const expansionService = createPromptExpansionService(this.deps.settingsManager);
            const finalPrompt = expansionService.expandPrompt(prompt, promptContext);

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
                return { childIds: [], childrenCreated: false };
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
            
            return { childIds, childrenCreated: true };
            
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
     * Handle coherence check for a parent node
     * Always accumulate contradictions for level-transition display
     */
    private async handleCoherenceCheck(parentId: string, levels: GenerationLevels): Promise<void> {
        // Check for abort at start of operation
        if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
            console.log('🛑 UnifiedGenerationService: Abort detected in handleCoherenceCheck');
            throw new Error('Generation was aborted by user');
        }

        const parentNode = this.deps.treeService.findNodeById(parentId, this.deps.rootNode);
        if (!parentNode) return;

        try {
            // Check if node is eligible for coherence analysis
            if (!this.coherenceService.isNodeEligible(parentNode)) {
                return;
            }

            // Set operation type for progress tracking
            this.currentOperationType = 'coherence';
            this.currentNodeId = parentId;
            this.emitUnifiedProgress();

            // Emit coherence analysis started event
            this.deps.eventEmitter.emit('coherenceAnalysisStarted', { nodeId: parentId, node: parentNode });

            // Update progress for coherence analysis phase
            this.currentStageProgress = {
                current: 1,
                total: levels.autofixSeverity !== -1 ? 2 : 1, // 2 stages if autofix enabled, 1 if not
                message: 'Analyzing coherence...'
            };
            this.emitUnifiedProgress();

            // Use autofix-enabled analysis if autofix severity is set
            const result = await this.coherenceService.analyzeCoherenceWithAutofix(
                parentNode,
                levels.autofixSeverity,
                true, // isAutomaticMode = true (triggered by generation)
                this.deps.rootNode.id // projectId
            );
            
            // Update progress after analysis/fixing is complete
            if (levels.autofixSeverity !== -1 && result.hasContradictions) {
                this.currentStageProgress = {
                    current: 2,
                    total: 2,
                    message: 'Coherence analysis and autofix completed'
                };
            } else {
                this.currentStageProgress = {
                    current: 1,
                    total: 1,
                    message: 'Coherence analysis completed'
                };
            }
            this.emitUnifiedProgress();
            
            // Emit coherence analysis complete event
            this.deps.eventEmitter.emit('coherenceAnalysisComplete', { 
                nodeId: parentId, 
                node: parentNode, 
                hasContradictions: result.hasContradictions, 
                contradictionCount: result.contradictions.length 
            });
            
            if (!result.hasContradictions) {
                // Track nodes that were analyzed (even if no contradictions found)
                this.accumulatedContradictions.analyzedNodes.push(parentNode);
                this.accumulatedContradictions.totalAnalyzed++;
                
                // Immediately tag children as consistent since no contradictions were found
                this.tagChildrenAsConsistent(parentNode);
            } else {
                // When autofix is enabled, never accumulate contradictions - handle them all automatically
                if (levels.autofixSeverity !== -1) {
                    // Track nodes that were analyzed but don't accumulate contradictions
                    this.accumulatedContradictions.analyzedNodes.push(parentNode);
                    this.accumulatedContradictions.totalAnalyzed++;
                    
                    // Tag children as consistent since autofix handled all contradictions
                    this.tagChildrenAsConsistent(parentNode);
                } else {
                    // Only when autofix is disabled do we accumulate contradictions for modal display
                    // Merge new contradictions into accumulated result with parent node context
                    const contradictionsWithContext = result.contradictions.map((contradiction: any) => ({
                        ...contradiction,
                        parentNodeTitle: parentNode.title,
                        parentNodeId: parentNode.id
                    }));
                    
                    this.accumulatedContradictions.contradictions.push(...contradictionsWithContext);
                    this.accumulatedContradictions.analyzedNodes.push(parentNode);
                    this.accumulatedContradictions.totalAnalyzed++;
                    this.accumulatedContradictions.hasContradictions = true;
                }
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
        } finally {
            // Clear operation type and stage progress after coherence check
            this.currentOperationType = null;
            this.currentStageProgress = null;
            this.emitUnifiedProgress();
        }
    }

    /**
     * Show accumulated contradictions when transitioning between levels
     */
    private async showAccumulatedContradictionsForLevelTransition(fromLevel: number, toLevel: number): Promise<void> {
        if (!this.accumulatedContradictions.hasContradictions) {
            return;
        }

        try {
            // Create a comprehensive analysis result with all accumulated contradictions
            const representativeNode = this.accumulatedContradictions.analyzedNodes[0];
            const comprehensiveResult = {
                hasContradictions: true,
                contradictions: this.accumulatedContradictions.contradictions,
                analyzedNodes: this.accumulatedContradictions.analyzedNodes,
                totalAnalyzed: this.accumulatedContradictions.totalAnalyzed,
                analysisTimestamp: new Date(),
                parentNodeId: representativeNode?.id || '',
                childNodeIds: this.accumulatedContradictions.analyzedNodes.map(node => node.id)
            };
            
            // Show one comprehensive modal - use the first analyzed node as the "parent" for modal purposes
            if (representativeNode) {
                // Import and create the coherence modal
                const { CoherenceModal } = await import('../ui/modals/CoherenceModal');
                const coherenceModal = new CoherenceModal(this.deps.rootNode); // Pass the generation project
                
                // Open modal in loading state first
                await coherenceModal.openInLoadingState(representativeNode);
                
                // Update with results
                coherenceModal.updateWithResults(comprehensiveResult);
                
                // Wait for the modal to be closed by the user
                await this.waitForModalClose(coherenceModal);
            }
            
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showAIError(
                error as Error,
                {
                    title: 'Level Transition Coherence Modal Error',
                    operation: `Showing accumulated contradictions for level transition (${fromLevel} → ${toLevel})`,
                    purpose: 'Coherence Analysis'
                }
            );
        }
        
        // Clear accumulated contradictions after showing them
        this.accumulatedContradictions = {
            hasContradictions: false,
            contradictions: [],
            analyzedNodes: [],
            totalAnalyzed: 0
        };
    }

    /**
     * Show coherence modal and wait for user to close it
     */
    private async showCoherenceModalAndWait(parentNode: DocumentNode, result: any): Promise<void> {
        try {
            // Import and create the coherence modal
            const { CoherenceModal } = await import('../ui/modals/CoherenceModal');
            const coherenceModal = new CoherenceModal(this.deps.rootNode); // Pass the generation project
            
            // Open modal in loading state first
            await coherenceModal.openInLoadingState(parentNode);
            
            // Update with results
            coherenceModal.updateWithResults(result);
            
            // Wait for the modal to be closed by the user
            // The modal's close() method is called when user clicks close, backdrop, or escape
            // We need to wait for it to actually close
            await this.waitForModalClose(coherenceModal);
            
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showAIError(
                error as Error,
                {
                    title: 'Coherence Modal Error',
                    operation: `Opening coherence modal for "${parentNode.title}"`,
                    purpose: 'Coherence Analysis'
                }
            );
        }
    }

    /**
     * Wait for modal to be closed by the user
     */
    private async waitForModalClose(modal: any): Promise<void> {
        return new Promise<void>((resolve) => {
            // Set up an interval to check if the modal is closed
            const checkClosed = setInterval(() => {
                if (!modal.isOpen()) {
                    clearInterval(checkClosed);
                    resolve();
                }
            }, 100);
            
            // Also set up a maximum timeout to prevent infinite waiting
            setTimeout(() => {
                clearInterval(checkClosed);
                resolve();
            }, 5 * 60 * 1000); // 5 minutes max wait time
        });
    }

    /**
     * Show all accumulated contradictions in one comprehensive modal
     * This is only called at the end if there are remaining contradictions that weren't shown during level transitions
     */
    private async showCollectedContradictions(): Promise<void> {
        if (!this.accumulatedContradictions.hasContradictions) {
            console.log('📋 No remaining contradictions found at end of generation');
            return;
        }

        console.log(`📋 Showing remaining accumulated contradictions: ${this.accumulatedContradictions.contradictions.length} total issues from ${this.accumulatedContradictions.totalAnalyzed} nodes`);

        try {
            const totalContradictions = this.accumulatedContradictions.contradictions.length;
            
            const nodeList = this.accumulatedContradictions.analyzedNodes.map((node, index) => 
                `${index + 1}. ${node.title}`
            ).join('\n');
            
            // Show summary first
            const proceedWithFixes = confirm(`⚠️ Remaining Coherence Issues\n\nFound ${totalContradictions} remaining contradictions across ${this.accumulatedContradictions.totalAnalyzed} node(s):\n\n${nodeList}\n\nWould you like to review and fix these remaining issues now?\n\n(Click OK to open comprehensive coherence modal, or Cancel to skip fixes)`);
            
            if (proceedWithFixes) {
                console.log(`📋 User chose to fix contradictions - showing comprehensive modal with ${totalContradictions} issues`);
                
                // Create a comprehensive analysis result with all accumulated contradictions
                const comprehensiveResult = {
                    hasContradictions: true,
                    contradictions: this.accumulatedContradictions.contradictions,
                    analyzedNodes: this.accumulatedContradictions.analyzedNodes,
                    totalAnalyzed: this.accumulatedContradictions.totalAnalyzed,
                    analysisTimestamp: new Date(), // Add timestamp for modal rendering
                    childNodeIds: this.accumulatedContradictions.analyzedNodes.map(node => node.id) // Add child node IDs
                };
                
                // Show one comprehensive modal - use the first analyzed node as the "parent" for modal purposes
                const representativeNode = this.accumulatedContradictions.analyzedNodes[0];
                if (representativeNode) {
                    console.log(`🔍 Showing comprehensive coherence modal with ${totalContradictions} contradictions from ${this.accumulatedContradictions.totalAnalyzed} nodes`);
                    
                    // Show modal and wait for user to close it
                    await this.showCoherenceModalAndWait(representativeNode, comprehensiveResult);
                    
                    console.log(`✅ Comprehensive coherence modal closed - user reviewed ${totalContradictions} contradictions`);
                }
                
                console.log(`✅ Comprehensive coherence modal completed - user reviewed all accumulated issues`);
            } else {
                console.log(`⏭️ User chose to skip fixing contradictions - leaving nodes untagged for future review`);
                
                // Don't tag nodes as consistent if user chose to skip fixing issues
                // They can manually access coherence analysis later via node actions menu
            }
            
            console.log(`📋 Batch coherence processing completed for ${totalContradictions} contradictions from ${this.accumulatedContradictions.totalAnalyzed} nodes`);
            
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showAIError(
                error as Error,
                {
                    title: 'Coherence Modal Error',
                    operation: 'Opening comprehensive coherence modal',
                    purpose: 'Coherence Analysis'
                }
            );
            
            // On error, still tag nodes to prevent them from being stuck in inconsistent state
            this.tagAnalyzedSubnodesAsConsistent();
        }
    }

    /**
     * Tag children of a single parent node as consistent to parent
     */
    private tagChildrenAsConsistent(parentNode: DocumentNode): void {
        console.log(`🏷️ Tagging children of "${parentNode.title}" as consistent to parent (immediate after coherence check)`);
        
        let taggedCount = 0;
        
        // Tag all children's master versions
        for (const childNode of parentNode.children) {
            const masterVersion = childNode.getMasterVersion();
            if (masterVersion) {
                // Add the consistent_to_parent tag
                masterVersion.tags.add('consistent_to_parent');
                masterVersion.timestamp = new Date(); // Update timestamp
                taggedCount++;
            } else {
                console.warn(`⚠️ No master version found for child node "${childNode.title}"`);
            }
        }
        
        console.log(`✅ Tagged ${taggedCount} children as consistent to parent: "${parentNode.title}"`);
        
        // Save the project after tagging
        this.saveProjectAfterBatchTagging();
    }

    /**
     * Tag all analyzed nodes' subnodes as consistent to parent
     */
    private tagAnalyzedSubnodesAsConsistent(): void {
        console.log(`🏷️ Tagging subnodes from accumulated coherence analysis as consistent to parent`);
        
        let totalTaggedCount = 0;
        
        for (const parentNode of this.accumulatedContradictions.analyzedNodes) {
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
        if (this.currentOperationType === 'coherence' && this.currentNodeId) {
            // For coherence analysis, use TaskModelService to get the correct model
            const node = this.deps.treeService.findNodeById(this.currentNodeId, this.deps.rootNode);
            if (node) {
                const isLeafNode = !node.children || node.children.length === 0;
                const modelPurpose = this.taskModelService.getModelPurposeForTask('coherence_analysis', isLeafNode);
                const modelName = this.taskModelService.getCurrentModelName(modelPurpose);
                return this.formatModelName(modelName);
            }
        }
        
        if (this.currentOperationType === 'context' && this.currentNodeId) {
            // For context adjustment, use TaskModelService to get the correct model
            const node = this.deps.treeService.findNodeById(this.currentNodeId, this.deps.rootNode);
            if (node) {
                const isLeafNode = !node.children || node.children.length === 0;
                const modelPurpose = this.taskModelService.getModelPurposeForTask('context_adjustment', isLeafNode);
                const modelName = this.taskModelService.getCurrentModelName(modelPurpose);
                return this.formatModelName(modelName);
            }
        }
        
        // For content generation operations, select appropriate model based on node type
        if (this.currentOperationType === 'content' && this.currentNodeId) {
            const node = this.deps.treeService.findNodeById(this.currentNodeId, this.deps.rootNode);
            if (node) {
                const profile = this.deps.settingsManager.getLastUsedProfile();
                const modelKey = node.isLeaf ? 'prose' : 'creator';
                const modelName = profile?.selectedModels?.[modelKey];
                if (modelName) {
                    return this.formatModelName(modelName);
                }
            }
        }
        
        // For other operations, use the creator model (default behavior)
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
                // Select appropriate model based on node type - leaf nodes use 'prose', non-leaf use 'creator'
                const modelKey = node.isLeaf ? 'prose' : 'creator';
                const modelName = profile?.selectedModels?.[modelKey];
                
                // End the generation session with the final result
                node.endGenerationSession(result.success, result.finalResponse);
                
                // Create generation versions from the completed session iterations
                const latestSession = node.getLatestGenerationSession();
                if (latestSession && latestSession.iterations.length > 0) {
                    latestSession.iterations.forEach((iteration) => {
                        node.setContentFromGeneration(iteration.content, modelName, iteration.iteration);
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
                    // Content generation completed successfully
                } else {
                    // Content generation completed with best iteration
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
        console.log('🛑 UnifiedGenerationService: Abort requested');
        this.abortRequested = true;
        
        // Request stop from both the loop orchestrator and the generation controller
        this.deps.loopOrchestrator.requestStop();
        this.deps.generationController.abortCurrentGeneration(this.deps.rootNode);
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
            return false;
        }

        // Check if ANY AI-adjusted version has the same context as the master
        // If so, the master context is effectively already adjusted
        for (const adjustedVersion of adjustedVersions) {
            if (adjustedVersion.context === masterContext) {
                return true;
            }
        }

        // Master context differs from all AI-adjusted versions, needs adjustment
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
        const filtered = criteria.filter(criterion => {
            // If both outline and leaf are undefined, include by default (legacy criteria)
            if (criterion.outline === undefined && criterion.leaf === undefined) {
                return true;
            }
            
            // For leaf nodes, include criteria where leaf is true
            if (isLeafNode) {
                return criterion.leaf === true;
            }
            
            // For outline/branch nodes, include criteria where outline is true
            return criterion.outline === true;
        });
        
        return filtered;
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

    /**
     * Build loop input for content generation
     */
    private buildLoopInput(node: DocumentNode): LoopInput {
        // Check for settings override from parent node
        const settingsOverride = this.extractSettingsOverride(node);
        const originalProfileName = settingsOverride ? this.deps.settingsManager.getLastUsedProfileName() || null : null;
        
        if (settingsOverride) {
            const overrideProfile = this.deps.settingsManager.getProfile(settingsOverride!);
            if (overrideProfile) {
                console.log(`🔧 Using settings override "${settingsOverride}" for node "${node.title}"`);
                this.deps.settingsManager.setLastUsedProfile(settingsOverride!);
            }
        }

        const profile = this.deps.settingsManager.getLastUsedProfile();
        
        if (!profile || !profile.criteria || profile.criteria.length === 0) {
            throw new Error(`Cannot generate content for node "${node.title}". The active profile is missing or has no criteria.`);
        }

        // Get the raw prompt from the node
        const rawPrompt = node.generationPrompt || this.deps.promptService.getRawGenerationPrompt(node);

        // Fill the placeholders
        const context = this.deps.contextService.compileNodeContext(node.id, this.deps.rootNode);
        const path = this.deps.treeService.getNodePath(node.id, this.deps.rootNode);
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

        // Restore original profile if we used an override
        if (settingsOverride && originalProfileName) {
            this.deps.settingsManager.setLastUsedProfile(originalProfileName!);
        }

        return loopInput;
    }
} 