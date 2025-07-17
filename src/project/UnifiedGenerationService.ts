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
 * STATELESS TARGET-STATE-BASED GENERATION STRATEGY
 * ================================================
 * 
 * This service uses a completely stateless approach where each node has a "target state"
 * determined by the generation parameters. The system processes nodes until they reach
 * their target state, then allows expansion when all siblings are ready.
 * 
 * TARGET STATE CALCULATION:
 * - Each level has a target state based on generation parameters
 * - If node.level <= contentLevel: target includes "needs_content"
 * - If node.level <= contextPruneLevel: target includes "needs_context_pruning"
 * - If node.level <= coherenceLevel: target includes "needs_coherence_check"
 * - If node.level < draftLevel: target includes "can_expand"
 * 
 * PROCESSING RULES:
 * 1. All nodes at the same level have the same target state
 * 2. A node can only expand if ALL nodes at its level have reached their target state
 * 3. Work is done in this order: context pruning → content generation → coherence check → expansion
 * 4. The system loops until no more work can be done
 * 
 * EXPANSION LOGIC:
 * - A node can expand only if:
 *   a) It's below the draft level (can_expand in target state)
 *   b) All siblings at its level have reached their target state
 *   c) It has no children yet
 * 
 * LOOP STRUCTURE:
 * 1. Collect all nodes in the affected range
 * 2. Calculate target states for each level
 * 3. Keep looping until no work is done in a pass:
 *    - For each node, compare current state vs target state
 *    - Do needed work (context pruning, content generation, coherence check)
 *    - Check if node can expand and expand if ready
 * 4. Repeat until max expansion level is reached
 * 
 * BENEFITS:
 * - Completely stateless - no canExpand flags or similar state tracking
 * - Clear separation of concerns - each node knows its target and current state
 * - Prevents premature expansion - ensures all prep work is done first
 * - Naturally handles context analysis before expansion
 */

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
    /** Context rating threshold (-1 = use old analysis method, 1-10 = rating threshold) */
    contextRatingThreshold: number;
}

/**
 * Target state for a node at a specific level
 */
export interface TargetState {
    level: number;
    needsContextPruning: boolean;
    needsContent: boolean;
    needsCoherenceCheck: boolean;
    canExpand: boolean;
}

/**
 * Current state of a node
 */
export interface CurrentState {
    hasContextPruning: boolean;
    hasContent: boolean;
    hasCoherenceCheck: boolean;
    hasChildren: boolean;
}

/**
 * Work needed for a node
 */
export interface WorkNeeded {
    contextPruning: boolean;
    contentGeneration: boolean;
    coherenceCheck: boolean;
    expansion: boolean;
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

// Define proper types for contradictions and modals
interface Contradiction {
    fact_in_outline: string;
    fact_in_expansion: string;
    justification: string;
    offending_child_title: string;
    severity: number;
    parentNodeTitle?: string;
    parentNodeId?: string;
}

interface ModalLike {
    isOpen(): boolean;
    close(): void;
}

interface CoherenceResult {
    hasContradictions: boolean;
    contradictions: Contradiction[];
    analysisTimestamp: Date;
    parentNodeId: string;
    childNodeIds: string[];
    analyzedNodes?: DocumentNode[];
    totalAnalyzed?: number;
}

export interface UnifiedGenerationDependencies {
    treeService: TreeService;
    contextService: ContextService;
    promptService: PromptService;
    generationController: GenerationController;
    generationCoordinator: GenerationCoordinator;
    loopOrchestrator: LoopOrchestrator;
    settingsManager: SettingsManager;
    openRouterClient: OpenRouterClient;
    eventEmitter: EventEmitter<Record<string, unknown[]>>;
    saveToStorage: () => Promise<void>;
    rootNode: DocumentNode;
}

/**
 * Unified generation service that processes all generation using a stateless target-state approach
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
        contradictions: Contradiction[];
        analyzedNodes: DocumentNode[];
        totalAnalyzed: number;
    } = {
        hasContradictions: false,
        contradictions: [],
        analyzedNodes: [],
        totalAnalyzed: 0
    };

    constructor(dependencies: UnifiedGenerationDependencies) {
        this.deps = dependencies;
        this.coherenceService = new CoherenceService(dependencies.openRouterClient, dependencies.settingsManager);
        this.taskModelService = new TaskModelService(dependencies.settingsManager);
    }

    /**
     * Main entry point for unified generation using stateless target-state approach
     */
    public async generateWithLevels(startNodeId: string, levels: GenerationLevels): Promise<void> {
        // Clear any previous state
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

        // Get the starting node
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
            // Process using stateless target-state approach
            await this.processWithTargetStates(startNodeId, levels);

            // After generation completes, check for collected contradictions
            await this.showCollectedContradictions();
            
            // Complete operation with coordinator for UI cleanup
            this.deps.generationCoordinator.completeOperation(operationId, true);
        } catch (error) {
            console.error('Unified generation failed:', error);
            
            // Complete operation with coordinator for UI cleanup
            this.deps.generationCoordinator.completeOperation(operationId, false, error);
            
            throw error;
        } finally {
            // Always cleanup generation context
            this.deps.generationController.clearGenerationContext();
            // Clear accumulated contradictions
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
        if (levels.coherenceLevel >= levels.draftLevel && levels.draftLevel !== -1) {
            throw new Error('Coherence level must be less than draft level');
        }
    }

    /**
     * Process nodes using stateless target-state approach
     */
    private async processWithTargetStates(startNodeId: string, levels: GenerationLevels): Promise<void> {
        const startNode = this.deps.treeService.findNodeById(startNodeId, this.deps.rootNode);
        if (!startNode) throw new Error(`Start node not found: ${startNodeId}`);

        // Calculate maximum level we might work on
        const maxLevel = Math.max(levels.draftLevel, levels.contentLevel, levels.contextPruneLevel, levels.coherenceLevel);
        
        // Keep looping until no more work can be done
        let workDone = true;
        while (workDone) {
            // Check for abort
            if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
                throw new Error('Generation was aborted by user');
            }

            workDone = false;
            
            // Collect starting node and ALL its descendants in breadth-first order
            const allNodes = this.collectAllDescendants(startNodeId);
            
            // Calculate target states for each level
            const targetStates = this.calculateTargetStates(levels, startNode.level, maxLevel);
            
            // Process each node
            for (const node of allNodes) {
                const targetState = targetStates[node.level];
                if (!targetState) {
                    throw new Error(`No target state found for node "${node.title}" at level ${node.level}. Available levels: ${Object.keys(targetStates).join(', ')}`);
                }

                // Determine what work is needed for this node
                const currentState = this.getNodeCurrentState(node);
                const workNeeded = this.getWorkNeeded(node, targetState);

                
                // Do context pruning if needed
                if (workNeeded.contextPruning) {
                    await this.handleContextPruning(node.id, levels.contextRatingThreshold);
                    workDone = true;
                }
                
                // Do content generation if needed
                if (workNeeded.contentGeneration) {
                    await this.handleContentGeneration(node.id);
                    workDone = true;
                }
                
                // Do coherence check if needed (only for last sibling)
                if (workNeeded.coherenceCheck) {
                    if (this.isLastSibling(node)) {
                        if (node.parentId) {
                            await this.handleCoherenceCheck(node.parentId, levels);
                            workDone = true;
                        }
                    }
                }
                
                // Check if node can expand
                if (workNeeded.expansion) {
                    const canExpand = this.canNodeExpand(node, targetState, startNodeId);
                    if (canExpand) {
                        const expansionResult = await this.handleDraftCreation(node.id);
                        if (expansionResult.childrenCreated) {
                            workDone = true;
                        }
                    }
                }
            }
            
        }
    }

    /**
     * Calculate target states for each level based on generation parameters
     */
    private calculateTargetStates(levels: GenerationLevels, minLevel: number, maxLevel: number): TargetState[] {
        const targetStates: TargetState[] = [];
        
        for (let level = minLevel; level <= maxLevel; level++) {
            // UI shows child level but stores parent level, so add 1 to check if this level should be analyzed
            const needsCoherenceCheck = (levels.coherenceLevel + 1) >= level && level > 0;
            
            targetStates[level] = {
                level,
                needsContextPruning: levels.contextPruneLevel >= level && level > 0, // Skip root level
                needsContent: levels.contentLevel >= level,
                needsCoherenceCheck: needsCoherenceCheck, // Coherence checks parent-child relationship, so skip root level
                canExpand: level < levels.draftLevel
            };
        }
        
        return targetStates;
    }

    /**
     * Get the current state of a node
     */
    private getNodeCurrentState(node: DocumentNode): CurrentState {
        const masterVersion = node.getMasterVersion();
        
        return {
            hasContextPruning: node.ContextIsAdjusted(),
            hasContent: this.nodeHasContent(node),
            hasCoherenceCheck: masterVersion?.tags.has('consistent_to_parent') || false,
            hasChildren: node.children.length > 0
        };
    }

    /**
     * Determine what work is needed for a node to reach its target state
     */
    private getWorkNeeded(node: DocumentNode, targetState: TargetState): WorkNeeded {
        const currentState = this.getNodeCurrentState(node);
        
        return {
            contextPruning: targetState.needsContextPruning && !currentState.hasContextPruning,
            contentGeneration: targetState.needsContent && !currentState.hasContent,
            coherenceCheck: targetState.needsCoherenceCheck && !currentState.hasCoherenceCheck,
            expansion: targetState.canExpand && !currentState.hasChildren
        };
    }

    /**
     * Check if a node can expand (all siblings at target state)
     * Recalculates current descendants to avoid race conditions from stale data
     */
    private canNodeExpand(node: DocumentNode, targetState: TargetState, startNodeId: string): boolean {
        if (!targetState.canExpand) {
            return false;
        }
        if (node.children.length > 0) {
            return false;
        }
        
        // CRITICAL: Recalculate current descendants to get fresh node collection
        // This prevents race conditions when nodes create children during the same iteration
        const currentAllNodes = this.collectAllDescendants(startNodeId);
        
        // Get all siblings at the same level from the CURRENT tree state
        const siblings = currentAllNodes.filter(n => n.level === node.level);
        
        // Check if all siblings have reached their target state
        const allSiblingsReady = siblings.every(sibling => {
            const siblingWorkNeeded = this.getWorkNeeded(sibling, targetState);
            const isReady = !siblingWorkNeeded.contextPruning && 
                           !siblingWorkNeeded.contentGeneration && 
                           !siblingWorkNeeded.coherenceCheck;
            return isReady;
        });
        return allSiblingsReady;
    }

    /**
     * Check if a node is the last sibling (for coherence check trigger)
     */
    private isLastSibling(node: DocumentNode): boolean {
        if (!node.parentId) return false;
        
        const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
        if (!parentNode) throw new Error(`Parent node not found for isLastSibling check: ${node.parentId}`);
        
        const siblings = parentNode.children;
        return siblings.length > 0 && siblings[siblings.length - 1]?.id === node.id;
    }

    /**
     * Check if node has meaningful content
     */
    private nodeHasContent(node: DocumentNode): boolean {
        return node.getState() === 'Final';
    }

    /**
     * Handle context pruning for a node
     */
    private async handleContextPruning(nodeId: string, contextRatingThreshold: number = -1): Promise<void> {
        // Check for abort at start of operation
        if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
            throw new Error('Generation was aborted by user');
        }

        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) throw new Error(`Node not found for context pruning: ${nodeId}`);

        // Skip auto-pruning for project root nodes (no inherited context to clean)
        if (node.level === 0 || !node.parentId) {
            return;
        }

        // Check if context has already been AI-adjusted (skip if so)
        if (node.ContextIsAdjusted()) {
            return;
        }

        try {
            // Set isGenerating flag and update tree to show spinner
            node.isGenerating = true;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'context-pruning-started' });
            
            // Emit start progress
            this.currentOperationProgress = {
                current: 1,
                total: 3,
                message: `Auto-pruning context for "${node.title}"`
            };
            this.currentNodeId = nodeId;
            this.currentOperationType = 'context';
            this.emitUnifiedProgress();
            
            let contextChanged = false;
            
            // Choose between rating-based or issue-based context pruning
            if (contextRatingThreshold >= 1 && contextRatingThreshold <= 10) {
                // Use new context rating service
                console.log(`🎯 Using context rating mode with threshold ${contextRatingThreshold} for "${node.title}"`);
                
                // Update progress
                this.currentOperationProgress = {
                    current: 2,
                    total: 3,
                    message: `Rating context relevancy for "${node.title}"`
                };
                this.emitUnifiedProgress();
                
                contextChanged = await this.runContextRatingMode(node, contextRatingThreshold);
            } else {
                // Use legacy context adjustment service (issue-based)
                console.log(`🔧 Using legacy context analysis mode for "${node.title}"`);
                
                // Update progress
                this.currentOperationProgress = {
                    current: 2,
                    total: 3,
                    message: `Analyzing context for "${node.title}"`
                };
                this.emitUnifiedProgress();
                
                // Import the ContextAdjusterModal and run in automatic mode
                const { ContextAdjusterModal } = await import('../ui/modals/ContextAdjusterModal');
                const contextAdjuster = new ContextAdjusterModal();
                contextChanged = await contextAdjuster.runAutomaticMode(node);
            }
            
            // Emit completion progress
            this.currentOperationProgress = {
                current: 3,
                total: 3,
                message: contextChanged ? `Auto-pruned context for "${node.title}"` : `No context issues found for "${node.title}"`
            };
            this.emitUnifiedProgress();
        } finally {
            // Clear isGenerating flag and update tree to hide spinner
            node.isGenerating = false;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'context-pruning-completed' });
            
            // Clear operation type after context pruning
            this.currentOperationType = null;
            this.emitUnifiedProgress();
        }
    }

    /**
     * Run context rating mode - rate context items and remove those below threshold
     */
    private async runContextRatingMode(node: DocumentNode, threshold: number): Promise<boolean> {
        const { getContextItems } = await import('../ContextFormat');
        const { ContextRatingService } = await import('../ui/modals/services/ContextRatingService');
        
        // Create context rating service
        const contextRatingService = new ContextRatingService(
            this.deps.openRouterClient,
            this.deps.settingsManager
        );
        
        // Create a minimal ProjectManager interface for the rating service
        const projectManagerInterface = {
            findNodeById: (id: string) => this.deps.treeService.findNodeById(id, this.deps.rootNode)
        };
        
        // Analyze context using rating service
        const ratingResult = await contextRatingService.rateContext(node, projectManagerInterface as any);
        
        if (ratingResult.ratings.length === 0) {
            // No ratings (probably all protected items), mark as adjusted and return
            const nodeContext = node.context || '';
            node.setContextWithTags(nodeContext, ['context_ai_adjusted']);
            await this.deps.saveToStorage();
            console.log(`✅ No context items to rate for "${node.title}" - tagged as context_ai_adjusted`);
            return false;
        }
        
        // Get original context items
        const nodeContext = node.context || '';
        const originalContextItems = getContextItems(nodeContext);
        
        // Filter items based on rating threshold (keep items with rating >= threshold)
        const itemsToKeep: string[] = [];
        const itemsRemoved: string[] = [];
        
        ratingResult.ratings.forEach(rating => {
            const itemIndex = rating.item_number - 1; // Convert to 0-based index
            if (itemIndex >= 0 && itemIndex < originalContextItems.length) {
                const item = originalContextItems[itemIndex];
                if (item) { // Guard against undefined
                    if (rating.relevancy_rating >= threshold) {
                        itemsToKeep.push(item);
                    } else {
                        itemsRemoved.push(item);
                        console.log(`🗑️ Removing context item (rating ${rating.relevancy_rating}/${threshold}): "${item.substring(0, 50)}..."`);
                    }
                }
            }
        });
        
        // Add back any protected items (starting with "*") that weren't rated
        originalContextItems.forEach((item) => {
            if (item && item.trim().startsWith('*')) {
                // Protected item - always keep
                if (!itemsToKeep.includes(item)) {
                    itemsToKeep.push(item);
                    console.log(`🔒 Keeping protected context item: "${item.substring(0, 50)}..."`);
                }
            }
        });
        
        // Build new context from kept items
        const newContext = itemsToKeep.join('\n\n');
        const contextChanged = newContext !== nodeContext;
        
        if (contextChanged) {
            // Update context with AI adjustment tag
            node.setContextWithTags(newContext, ['context_ai_adjusted']);
            await this.deps.saveToStorage();
            
            console.log(`✅ Context rating completed for "${node.title}": kept ${itemsToKeep.length}, removed ${itemsRemoved.length} items (threshold: ${threshold})`);
        } else {
            // No changes but still tag as processed
            node.setContextWithTags(nodeContext, ['context_ai_adjusted']);
            await this.deps.saveToStorage();
            
            console.log(`✅ Context rating completed for "${node.title}": no items removed (threshold: ${threshold})`);
        }
        
        return contextChanged;
    }

    /**
     * Handle content generation for a node
     */
    private async handleContentGeneration(nodeId: string): Promise<void> {
        // Check for abort at start of operation
        if (this.abortRequested || this.deps.generationController.isAbortRequested()) {
            throw new Error('Generation was aborted by user');
        }

        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) throw new Error(`Node not found for content generation: ${nodeId}`);

        // Set operation type for progress tracking
        this.currentOperationType = 'content';
        this.currentNodeId = nodeId;
        
        // Only generate content if needed
        if (!this.shouldGenerateContent(node)) {
            console.log(`⏭️ Skipping content generation for "${node.title}" - node state: ${node.getState()}`);
            return;
        }

        try {
            // Set isGenerating flag and update tree to show spinner
            node.isGenerating = true;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'generation-started' });
            
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
            // Clear isGenerating flag and update tree to hide spinner
            node.isGenerating = false;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'generation-completed' });
            
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
            throw new Error('Generation was aborted by user');
        }

        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) throw new Error(`Node not found for draft creation: ${nodeId}`);

        // Check if node already has children
        if (node.children.length > 0) {
            console.log(`⏭️ Skipping draft creation for "${node.title}" - already has children`);
            return { childIds: node.children.map(child => child.id), childrenCreated: false };
        }

        try {
            // Set isGenerating flag and update tree to show spinner
            node.isGenerating = true;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'draft-creation-started' });
            
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
            const creatorModel = currentProfile && currentProfile.selectedModels && currentProfile.selectedModels['creator'];
            const childIds: string[] = [];

            nodeItems.forEach(item => {
                const newNode = this.deps.treeService.addNode(item.title, nodeId, this.deps.rootNode, creatorModel);
                childIds.push(newNode.id);
                
                // Set the content description as initial content if provided
                if (item.description && item.description.trim()) {
                    // Fix metadata type
                    const metadata: { [key: string]: unknown } = {};
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
                        if (parent && parent.context) {
                            newNode.setContext(parent.context, 'generated');
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
        } finally {
            // Clear isGenerating flag and update tree to hide spinner
            node.isGenerating = false;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'draft-creation-completed' });
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
        if (!parentNode) throw new Error(`Parent node not found for coherence check: ${parentId}`);

        try {
            // Check if node is eligible for coherence analysis
            if (!this.coherenceService.isNodeEligible(parentNode)) {
                return;
            }

            // Set isGenerating flag and update tree to show spinner
            parentNode.isGenerating = true;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId: parentId, reason: 'coherence-check-started' });

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
                // Path 1: No contradictions found - tag children as consistent immediately
                this.accumulatedContradictions.analyzedNodes.push(parentNode);
                this.accumulatedContradictions.totalAnalyzed++;
                await this.tagChildrenAsConsistent(parentNode);
            } else {
                // Contradictions found
                if (levels.autofixSeverity !== -1) {
                    // Path 2: Autofix enabled - contradictions were handled automatically
                    // Tag children as consistent since autofix resolved all contradictions
                    this.accumulatedContradictions.analyzedNodes.push(parentNode);
                    this.accumulatedContradictions.totalAnalyzed++;
                    await this.tagChildrenAsConsistent(parentNode);
                } else {
                    // Path 3: Autofix disabled - show modal immediately, then tag as consistent
                    console.log(`🔍 Showing coherence modal for "${parentNode.title}" with ${result.contradictions.length} contradictions`);
                    
                    // Create a comprehensive result for the modal
                    const modalResult: CoherenceResult = {
                        hasContradictions: true,
                        contradictions: result.contradictions,
                        analysisTimestamp: new Date(),
                        parentNodeId: parentNode.id,
                        childNodeIds: parentNode.children.map(child => child.id)
                    };
                    
                    // Show the modal and wait for user to close it
                    await this.showCoherenceModalAndWait(parentNode, modalResult);
                    
                    // After modal closes (regardless of what user did), tag children as consistent
                    // This prevents the infinite loop - the user has seen the contradictions
                    this.accumulatedContradictions.analyzedNodes.push(parentNode);
                    this.accumulatedContradictions.totalAnalyzed++;
                    await this.tagChildrenAsConsistent(parentNode);
                }
            }
            
        } finally {
            // Clear isGenerating flag and update tree to hide spinner
            parentNode.isGenerating = false;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId: parentId, reason: 'coherence-check-completed' });
            
            // Clear operation type and stage progress after coherence check
            this.currentOperationType = null;
            this.currentStageProgress = null;
            this.emitUnifiedProgress();
        }
    }



    /**
     * Show coherence modal and wait for user to close it
     */
    private async showCoherenceModalAndWait(parentNode: DocumentNode, result: CoherenceResult): Promise<void> {
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
        
        // Note: Error handling is done at the higher level in handleCoherenceCheck
        // to prevent duplicate error dialogs from cascading errors
    }

    /**
     * Wait for modal to be closed by the user
     */
    private async waitForModalClose(modal: ModalLike): Promise<void> {
        return new Promise<void>((resolve) => {
            // Check if modal is already closed
            if (!modal.isOpen()) {
                console.log('🔍 Modal already closed, resolving immediately');
                resolve();
                return;
            }

            console.log('🔍 Waiting for coherence modal to be closed by user...');
            
            let resolved = false;
            const resolveOnce = () => {
                if (!resolved) {
                    resolved = true;
                    console.log('✅ Coherence modal closed, continuing generation');
                    resolve();
                }
            };

            // Set up an interval to check if the modal is closed
            const checkClosed = setInterval(() => {
                try {
                    if (!modal.isOpen()) {
                        clearInterval(checkClosed);
                        resolveOnce();
                    }
                } catch (error) {
                    // If modal checking fails, assume it's closed
                    console.warn('⚠️ Error checking modal state, assuming closed:', error);
                    clearInterval(checkClosed);
                    resolveOnce();
                }
            }, 100);
            
            // Also set up a maximum timeout to prevent infinite waiting
            const timeout = setTimeout(() => {
                console.warn('⚠️ Modal wait timeout reached, continuing generation');
                clearInterval(checkClosed);
                resolveOnce();
            }, 5 * 60 * 1000); // 5 minutes max wait time
            
            // Clean up timeout if resolved early
            const originalResolve = resolve;
            resolve = () => {
                clearTimeout(timeout);
                originalResolve();
            };
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
                const comprehensiveResult: CoherenceResult = {
                    hasContradictions: true,
                    contradictions: this.accumulatedContradictions.contradictions,
                    analysisTimestamp: new Date(), // Add timestamp for modal rendering
                    parentNodeId: this.accumulatedContradictions.analyzedNodes[0]?.id || '',
                    childNodeIds: this.accumulatedContradictions.analyzedNodes.flatMap(node => node.children.map(child => child.id)),
                    analyzedNodes: this.accumulatedContradictions.analyzedNodes,
                    totalAnalyzed: this.accumulatedContradictions.totalAnalyzed
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
            await this.tagAnalyzedSubnodesAsConsistent();
        }
    }

    /**
     * Tag children of a single parent node as consistent to parent
     */
    private async tagChildrenAsConsistent(parentNode: DocumentNode): Promise<void> {
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
        

        
        // Save the project after tagging
        await this.saveProjectAfterBatchTagging();
    }

    /**
     * Tag all analyzed nodes' subnodes as consistent to parent
     */
    private async tagAnalyzedSubnodesAsConsistent(): Promise<void> {
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
            

        }
        
        console.log(`✅ Batch tagging completed: ${totalTaggedCount} total subnodes tagged as consistent`);
        
        // Save the project after tagging
        await this.saveProjectAfterBatchTagging();
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
     * Get current model information for progress display
     */
    private getCurrentModelInfo(): string | undefined {
                if (this.currentOperationType === 'coherence' && this.currentNodeId) {
            // For coherence analysis, use TaskModelService to get the correct model
            const node = this.deps.treeService.findNodeById(this.currentNodeId, this.deps.rootNode);
            if (node) {
                const isLeafNode = node.isLeaf;
                const modelPurpose = this.taskModelService.getModelPurposeForTask('coherence_analysis', isLeafNode);
                const modelName = this.taskModelService.getCurrentModelName(modelPurpose);
                return this.formatModelName(modelName);
            }
        }
        
        if (this.currentOperationType === 'context' && this.currentNodeId) {
            // For context adjustment, use TaskModelService to get the correct model
            const node = this.deps.treeService.findNodeById(this.currentNodeId, this.deps.rootNode);
        if (node) {
                const isLeafNode = node.isLeaf;
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
                const modelName = profile && profile.selectedModels && profile.selectedModels[modelKey];
                if (modelName) {
                    return this.formatModelName(modelName);
                }
            }
        }
        
        // For other operations, use the creator model (default behavior)
        const profile = this.deps.settingsManager.getLastUsedProfile();
        if (!profile) {
            throw new Error('No profile available - settings not properly configured');
        }
        if (!profile.selectedModels) {
            throw new Error('Profile has no selected models - model configuration corrupted');
        }
        if (!profile.selectedModels['creator']) {
            throw new Error('No creator model selected - model configuration incomplete');
        }
        
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
        if (!node) throw new Error(`Node not found in runContentLoop: ${nodeId}`);

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

        // Fix unused parameter
        const onAborted = (): void => {
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
     * Collect starting node and ALL its descendants in breadth-first order
     */
    private collectAllDescendants(startNodeId: string): DocumentNode[] {
        const result: DocumentNode[] = [];
        const queue: DocumentNode[] = [];
        const visited = new Set<string>();
        
        // Start with the starting node
        const startNode = this.deps.treeService.findNodeById(startNodeId, this.deps.rootNode);
        if (!startNode) throw new Error(`Start node not found for collection: ${startNodeId}`);
        
        queue.push(startNode);
        visited.add(startNode.id);
        
        while (queue.length > 0) {
            const currentNode = queue.shift()!;
            
            // Add current node unconditionally
                result.push(currentNode);
            
            // Add all children to queue in their natural array order (creation order)
            // This ensures stable ordering that doesn't change based on operations
            const sortedChildren = [...currentNode.children];
            
            sortedChildren.forEach(child => {
                if (!visited.has(child.id)) {
                    queue.push(child);
                    visited.add(child.id);
                }
            });
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
        const cleanText = text.replace(/^```(?:json)?\n?/gm, '').replace(/\n?```$/gm, '');
        
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
            console.warn('Initial JSON parse failed, attempting to fix newlines...', error);
            
            try {
                // Simple approach: replace literal newlines within quoted strings with spaces
                // Match patterns like: "text\nmore text" and replace \n with space
                const fixedText = cleanText.replace(/"([^"]*\n[^"]*)"?/g, (_match, content) => {
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
            const overrideProfile = this.deps.settingsManager.getProfile(settingsOverride);
            if (overrideProfile) {
                console.log(`🔧 Using settings override "${settingsOverride}" for node "${node.title}"`);
                void this.deps.settingsManager.setLastUsedProfile(settingsOverride);
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
            void this.deps.settingsManager.setLastUsedProfile(originalProfileName);
        }

        return loopInput;
    }
} 