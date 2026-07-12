import { DocumentNode, ContentVersion } from '../DocumentNode';
import { TreeService } from './TreeService';
import { ContextService } from './ContextService';
import { PromptService } from './PromptService';

import { LoopOrchestrator, LoopInput, LoopFailedEdit } from '../LoopOrchestrator';
import { SettingsManager } from '../SettingsManager';
import { OpenRouterClient } from '../OpenRouterClient';
import { EventEmitter } from '../EventEmitter';
import { PromptContextBuilder } from '../services/PromptContextBuilder';
import { createPromptExpansionService } from '../services/PromptExpansionService';
import { CoherenceService } from '../ui/modals/services/CoherenceService';
import { GenerationErrorService } from '../ui/modals/services/GenerationErrorService';
import { GenerationCoordinator } from './GenerationCoordinator';
import { QualityCriterion, CreatorPayload, LLMCriterion } from '../types';
import { LoopProgress } from '../LoopOrchestrator';
import { Rating } from '../types/RatingTypes';
import { TaskModelService } from '../services/TaskModelService';
import { DEBUG_STATELESS_GENERATION } from '../constants';
import { findProjectByRootNode } from '../state';
import { parseContentSections } from '../ContextFormat';
import { pageActivityService } from '../lifecycle/PageActivityService';

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
 * Frozen settings captured at generation start to ensure consistent behavior
 */
export interface FrozenSettings {
    /** Coherence analysis prompt template */
    coherenceAnalysisPrompt: string;
    /** Fix contradiction prompt template */
    fixContradictionPrompt: string;
    /** Language setting for prompt filling */
    language: string;
    /** Task model configurations */
    taskModelConfigs: {
        coherence_analysis: { outline: string; prose: string };
        fix_contradiction: { outline: string; prose: string };
        // context_adjustment removed - traditional context system removed
        text_polishing: { outline: string; prose: string };
    };
}

/**
 * Configuration for generation levels
 */
export interface GenerationLevels {
    /** Deepest level for which children are created */
    draftLevel: number;
    /** Which levels get content generated (must be ≤ draftLevel) */
    contentLevel: number;
    /** Which levels get coherence checking (must be < draftLevel) */
    coherenceLevel: number;
    /** Autofix severity threshold (-1 = disabled, 1-10 = threshold) */
    autofixSeverity: number;
    /** Whether to use deterministic child creation for outline nodes */
    deterministicChildCreation?: boolean;
    // pruneScope completely removed - was only needed for traditional context adjustment
    /** Frozen settings captured at generation start */
    frozenSettings: FrozenSettings;
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
    // Static registry for managing multiple concurrent instances
    private static activeInstances: Set<UnifiedGenerationService> = new Set();

    /** Prefix marking auto-generated todos about unapplied generation edits. */
    private static readonly EDITOR_FAILURE_TODO_MARKER = '[auto: editor edit not applied]';
    
    private instanceId: string = crypto.randomUUID();
    private deps: UnifiedGenerationDependencies;
    private abortRequested: boolean = false;
    private coherenceService: CoherenceService;
    private taskModelService: TaskModelService;
    private currentOperationProgress: { current: number; total: number; message: string } | null = null;
    private currentIterationProgress: { current: number; total: number; message: string } | null = null;
    private currentStageProgress: { current: number; total: number; message: string } | null = null;
    private currentNodeId: string | null = null;
    private currentOperationType: 'content' | 'draft' | 'coherence' | null = null; // 'context' removed - traditional context system removed
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
    // Limit readiness checks to subtree when starting below root
    private scopeRootNode: DocumentNode | null = null;

    constructor(dependencies: UnifiedGenerationDependencies) {
        this.deps = dependencies;
        this.coherenceService = new CoherenceService(dependencies.openRouterClient, dependencies.settingsManager);
        this.taskModelService = new TaskModelService(dependencies.settingsManager);
    }

    /**
     * Static methods for managing active instances
     */
    public static getActiveInstances(): UnifiedGenerationService[] {
        return Array.from(this.activeInstances);
    }

    public static hasActiveInstances(): boolean {
        return this.activeInstances.size > 0;
    }

    public static abortAllInstances(): void {
        console.log(`🛑 Aborting all ${this.activeInstances.size} active UnifiedGenerationService instances`);

        // Also log to UI logger if available
        void import('../utils/UILogger').then(({ uiLogger }) => {
            uiLogger.warn(`Aborting ${this.activeInstances.size} active generation instance${this.activeInstances.size !== 1 ? 's' : ''}`);
        }).catch(() => {
            // UI logger not available, that's ok
        });

        // Request cooperative abort on all instances and their running loops/clients
        for (const instance of this.activeInstances) {
            try {
                instance.requestAbort();
                // Proactively stop any running orchestrator loops
                instance.deps.loopOrchestrator.requestStop();
                // Abort any ongoing OpenRouter requests without tearing down the client
                instance.deps.openRouterClient.abort();
            } catch (error) {
                console.warn('Abort propagation error on instance', instance, error);
            }
        }
    }

    public static getGenerationSummary(): {
        activeCount: number;
        operations: Array<{
            instanceId: string;
            currentOperation: string | null;
            currentNodeId: string | null;
        }>;
    } {
        return {
            activeCount: this.activeInstances.size,
            operations: Array.from(this.activeInstances).map(instance => ({
                instanceId: instance.instanceId,
                currentOperation: instance.currentOperationType,
                currentNodeId: instance.currentNodeId
            }))
        };
    }

    /**
     * Instance methods for abort management
     */
    public requestAbort(): void {
        console.log(`🛑 Abort requested for UnifiedGenerationService instance ${this.instanceId}`);
        this.abortRequested = true;
    }

    public isAbortRequested(): boolean {
        return this.abortRequested;
    }

    /**
     * Main entry point for unified generation using stateless target-state approach
     */
    public async generateWithLevels(startNodeId: string, inputLevels: Omit<GenerationLevels, 'frozenSettings'>): Promise<void> {
        // Capture frozen settings at generation start for consistent behavior using centralized utility
        const { CoherenceUtils } = await import('../ui/utils/CoherenceUtils');
        const frozenSettings: FrozenSettings = CoherenceUtils.prepareFrozenSettings(this.deps.settingsManager);
        
        // Create complete levels object with frozen settings
        const levels: GenerationLevels = {
            ...inputLevels,
            frozenSettings
        };
        
        // Clear any previous state
        this.accumulatedContradictions = {
            hasContradictions: false,
            contradictions: [],
            analyzedNodes: [],
            totalAnalyzed: 0
        };
        
        // Validate levels
        this.validateLevels(levels);

        // Register this instance in the active registry
        UnifiedGenerationService.activeInstances.add(this);
        this.abortRequested = false;

        // Get the starting node
        const startNode = this.deps.treeService.findNodeById(startNodeId, this.deps.rootNode);
        if (!startNode) {
            throw new Error(`Node not found: ${startNodeId}`);
        }
        // Set scope root so sibling readiness checks are limited to this subtree
        this.scopeRootNode = startNode;
        
        // Log generation start to UI logger if available
        void import('../utils/UILogger').then(({ uiLogger }) => {
            uiLogger.info(`Starting unified generation for node: ${startNode.title}`, `Instance: ${this.instanceId}`);
        }).catch(() => {
            // UI logger not available, that's ok
        });

        // Register operation with coordinator for UI management
        const operationId = this.deps.generationCoordinator.startOperation('single-content', startNodeId);
        if (!operationId) {
            throw new Error('Failed to start generation operation - another operation is already running');
        }

        // Keep the display awake and let the app detect background/frozen state
        // for the duration of this (potentially very long) generation run.
        const activeWork = pageActivityService.beginActiveWork('unified-generation');

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
            // Release the wake lock / active-work reference for this run.
            activeWork.end();
            // Always cleanup this instance from active registry
            UnifiedGenerationService.activeInstances.delete(this);
            // Clear scope after run
            this.scopeRootNode = null;
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
        if (levels.coherenceLevel > levels.draftLevel && levels.draftLevel !== -1) {
            throw new Error('Coherence level cannot be higher than draft level');
        }
    }

    /**
     * Process nodes using stateless target-state approach
     */
    private async processWithTargetStates(startNodeId: string, levels: GenerationLevels): Promise<void> {
        const startNode = this.deps.treeService.findNodeById(startNodeId, this.deps.rootNode);
        if (!startNode) throw new Error(`Start node not found: ${startNodeId}`);

        // Calculate maximum level we might work on based on generation parameters
        const maxGenerationLevel = Math.max(levels.draftLevel, levels.contentLevel, levels.coherenceLevel);
        
        // Keep looping until no more work can be done or abort is requested
        let workDone = true;
        let iterationCount = 0;
        while (workDone && !this.abortRequested) {
            workDone = false;
            iterationCount++;
            
            if (DEBUG_STATELESS_GENERATION) {
                console.log(`\n🔄 STATELESS DEBUG: === ITERATION ${iterationCount} ===`);
            }
            
            // Collect starting node and ALL its descendants in breadth-first order
            const allNodes = this.collectAllDescendants(startNodeId);
            
            if (DEBUG_STATELESS_GENERATION) {
                console.log(`📊 STATELESS DEBUG: Found ${allNodes.length} nodes in tree:`);
                allNodes.forEach(node => {
                    console.log(`   - "${node.title}" (level ${node.level}, children: ${node.children.length})`);
                });
            }
            
            // Find the actual maximum level that exists in the tree
            const actualMaxLevel = Math.max(maxGenerationLevel, ...allNodes.map(node => node.level));
            
            // Calculate target states for each level, including all existing levels
            const targetStates = this.calculateTargetStates(levels, startNode.level, actualMaxLevel);
            
            // Find the first node that needs work and do exactly one operation
            // This ensures completely stateless behavior - no temporal coupling
            if (DEBUG_STATELESS_GENERATION) {
                console.log(`🔍 STATELESS DEBUG: Scanning nodes for work...`);
            }
            
            for (const node of allNodes) {
                const targetState = targetStates[node.level];
                if (!targetState) {
                    throw new Error(`No target state found for node "${node.title}" at level ${node.level}. Available levels: ${Object.keys(targetStates).join(', ')}`);
                }

                // Determine what work is needed for this node
                // const currentState = this.getNodeCurrentState(node);
                const workNeeded = this.getWorkNeeded(node, targetState);

                // Do ONLY the first type of work needed, then exit and reassess
                
                // Priority 1: Context pruning
                if (workNeeded.contextPruning) {
                    if (DEBUG_STATELESS_GENERATION) {
                        console.log(`✅ STATELESS DEBUG: Performing context pruning on "${node.title}"`);
                    }
                    this.handleContextPruning(node.id);
                    workDone = true;
                    break; // Exit immediately - fresh assessment next iteration
                }
                
                // Priority 2: Content generation
                if (workNeeded.contentGeneration) {
                    if (DEBUG_STATELESS_GENERATION) {
                        console.log(`✅ STATELESS DEBUG: Performing content generation on "${node.title}"`);
                    }
                    await this.handleContentGeneration(node.id, levels);
                    workDone = true;
                    break; // Exit immediately - fresh assessment next iteration
                }
                
                // Priority 3: Coherence check (only for last child of parent)
                if (workNeeded.coherenceCheck) {
                    const isLastChild = this.isLastChild(node);
                    if (isLastChild && node.parentId) {
                        // Check if ALL siblings need coherence check and are ready for it
                        const shouldTriggerCoherence = this.shouldTriggerCoherenceCheck(node, targetState);
                        if (shouldTriggerCoherence) {
                            if (DEBUG_STATELESS_GENERATION) {
                                console.log(`✅ STATELESS DEBUG: Performing coherence check on "${node.title}" (last child, all siblings ready)`);
                            }
                            await this.handleCoherenceCheck(node.parentId, levels);
                            workDone = true;
                            break; // Exit immediately - fresh assessment next iteration
                        } else if (DEBUG_STATELESS_GENERATION) {
                            console.log(`⏳ STATELESS DEBUG: "${node.title}" is last child but not all siblings ready for coherence check`);
                        }
                    } else if (DEBUG_STATELESS_GENERATION) {
                        if (!isLastChild) {
                            console.log(`⏳ STATELESS DEBUG: "${node.title}" needs coherence check but is not last child of parent`);
                        } else {
                            console.log(`⏳ STATELESS DEBUG: "${node.title}" needs coherence check but has no parent`);
                        }
                    }
                }
                
                // Priority 3.5: Last child sibling coherence check (regardless of own coherence status)
                // This ensures that last children always verify ALL sibling coherence before expansion
                if (!workNeeded.coherenceCheck && targetState.needsCoherenceCheck) {
                    const isLastChild = this.isLastChild(node);
                    if (isLastChild && node.parentId) {
                        // Even if this last child doesn't need coherence, check if ANY sibling does
                        const shouldTriggerCoherence = this.shouldTriggerCoherenceCheck(node, targetState);
                        if (shouldTriggerCoherence) {
                            if (DEBUG_STATELESS_GENERATION) {
                                console.log(`✅ STATELESS DEBUG: Last child "${node.title}" triggering coherence check for siblings (even though self is coherent)`);
                            }
                            await this.handleCoherenceCheck(node.parentId, levels);
                            workDone = true;
                            break; // Exit immediately - fresh assessment next iteration
                        } else if (DEBUG_STATELESS_GENERATION) {
                            console.log(`✅ STATELESS DEBUG: Last child "${node.title}" verified all siblings are coherent`);
                        }
                    }
                }
                
                // Priority 4: Sections-based repair (deterministic fill-in for existing children)
                // If node has deterministic sections and already has some children, fill only the missing ones
                if (targetState.canExpand && node.children.length > 0) {
                    const sections = this.parseContentSections(node.content);
                    if (sections.length > 0) {
                        const existingTitles = new Set(node.children.map(c => c.title));
                        const hasMissing = sections.some(s => !existingTitles.has(s.title));
                        if (hasMissing) {
                            const result = await this.fillMissingChildrenFromSections(node.id, sections);
                            if (result.childrenCreated) {
                                workDone = true;
                                break; // Exit immediately - fresh assessment next iteration
                            }
                        }
                    }
                }

                // Priority 5: Expansion
                if (workNeeded.expansion) {
                    if (DEBUG_STATELESS_GENERATION) {
                        console.log(`🔍 STATELESS DEBUG: Checking if "${node.title}" can expand...`);
                    }
                    const canExpand = this.canNodeExpand(node, targetState);
                    if (canExpand) {
                        if (DEBUG_STATELESS_GENERATION) {
                            console.log(`✅ STATELESS DEBUG: Performing expansion on "${node.title}"`);
                        }
                        const expansionResult = await this.handleDraftCreation(node.id);
                        if (expansionResult.childrenCreated) {
                            workDone = true;
                            break; // Exit immediately - fresh assessment next iteration
                        }
                                    } else if (DEBUG_STATELESS_GENERATION) {
                    console.log(`❌ STATELESS DEBUG: "${node.title}" cannot expand (siblings not ready)`);
                }
                }
            }
            
            if (DEBUG_STATELESS_GENERATION) {
                if (!workDone) {
                    console.log(`🏁 STATELESS DEBUG: No work found in iteration ${iterationCount}. Generation complete.`);
                }
            }
        }
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`🎉 STATELESS DEBUG: Generation finished after ${iterationCount} iterations.`);
        }
        
        // Log graceful exit if aborted
        if (this.abortRequested) {
            console.log(`🛑 Generation gracefully aborted for UnifiedGenerationService instance ${this.instanceId}`);
        } else if (!workDone) {
            // Generation stopped without doing work - check if expansion is blocked by coherence requirements
            this.checkForBlockedExpansion(startNodeId, levels);
        }
    }

    /**
     * Calculate target states for each level based on generation parameters
     * For levels beyond generation parameters, create "do nothing" target states
     */
    private calculateTargetStates(levels: GenerationLevels, minLevel: number, maxLevel: number): TargetState[] {
        const targetStates: TargetState[] = [];
        
        // Calculate the maximum level that should receive any work based on generation parameters
        const maxGenerationLevel = Math.max(levels.draftLevel, levels.contentLevel, levels.coherenceLevel);
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`🎯 STATELESS DEBUG: calculateTargetStates called`);
            console.log(`   Generation levels: draft=${levels.draftLevel}, content=${levels.contentLevel}, coherence=${levels.coherenceLevel}`);
            console.log(`   Processing levels: ${minLevel} to ${maxLevel} (maxGenerationLevel=${maxGenerationLevel})`);
        }
        
        for (let level = minLevel; level <= maxLevel; level++) {
            if (level <= maxGenerationLevel) {
                // Within generation parameters - apply normal rules
                // UI shows child level but stores parent level, so add 1 to check if this level should be analyzed.
                // Coherence (and its intentional layer/sibling coupling) is only
                // meaningful when an autofix is configured. With autofix off (-1)
                // a coherence check cannot change anything, so it must not be
                // required nor block expansion / drilling deeper.
                const autofixConfigured = levels.autofixSeverity !== -1;
                const needsCoherenceCheck = autofixConfigured && (levels.coherenceLevel + 1) >= level && level > 0;
                
                targetStates[level] = {
                    level,
                    needsContextPruning: false, // Context pruning removed - using conditional context system
                    needsContent: levels.contentLevel >= level,
                    needsCoherenceCheck: needsCoherenceCheck, // Coherence checks parent-child relationship, so skip root level
                    canExpand: level < levels.draftLevel
                };
                
                if (DEBUG_STATELESS_GENERATION) {
                    const state = targetStates[level];
                    console.log(`   Level ${level}: contextPruning=${state!.needsContextPruning}, content=${state!.needsContent}, coherence=${state!.needsCoherenceCheck}, canExpand=${state!.canExpand}`);
                }
                

            } else {
                // Beyond generation parameters - create "do nothing" target state
                // This allows existing nodes at deeper levels to be processed without errors
                targetStates[level] = {
                    level,
                    needsContextPruning: false,
                    needsContent: false,
                    needsCoherenceCheck: false,
                    canExpand: false // Don't expand beyond what user requested
                };
                
                if (DEBUG_STATELESS_GENERATION) {
                    console.log(`   Level ${level}: (beyond generation params) all=false`);
                }
            }
        }
        
        return targetStates;
    }

    /**
     * Get the current state of a node
     */
    private getNodeCurrentState(node: DocumentNode): CurrentState {
        const masterVersion = node.getMasterVersion();
        
        const state = {
            hasContextPruning: false, // Context pruning removed with traditional context
            hasContent: this.nodeHasContent(node),
            hasCoherenceCheck: node.isConsistentToParent(),
            hasChildren: node.children.length > 0
        };
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`🔍 STATELESS DEBUG: Current state of "${node.title}" (level ${node.level}):`);
            console.log(`   contextPruning=${state.hasContextPruning}, content=${state.hasContent}, coherence=${state.hasCoherenceCheck}, children=${state.hasChildren} (count: ${node.children.length})`);
            console.log(`   nodeState=${node.getState()}, tags=${Array.from(masterVersion?.tags ?? []).join(',')}`);
        }
        
        return state;
    }

    /**
     * Determine what work is needed for a node to reach its target state
     */
    private getWorkNeeded(node: DocumentNode, targetState: TargetState): WorkNeeded {
        const currentState = this.getNodeCurrentState(node);
        
        // Only the last child of a parent can trigger coherence checks for all siblings
        // Non-last children should not show coherenceCheck=true even if they need it
        const needsCoherenceCheck = targetState.needsCoherenceCheck && !currentState.hasCoherenceCheck;
        const canTriggerCoherence = needsCoherenceCheck && this.isLastChild(node);
        
        const workNeeded = {
            contextPruning: targetState.needsContextPruning && !currentState.hasContextPruning,
            contentGeneration: targetState.needsContent && !currentState.hasContent,
            coherenceCheck: canTriggerCoherence, // Only last child can trigger coherence
            expansion: targetState.canExpand && !currentState.hasChildren
        };
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`⚡ STATELESS DEBUG: Work needed for "${node.title}" (level ${node.level}):`);
            console.log(`   Target state: contextPruning=${targetState.needsContextPruning}, content=${targetState.needsContent}, coherence=${targetState.needsCoherenceCheck}, canExpand=${targetState.canExpand}`);
            console.log(`   Current state: contextPruning=${currentState.hasContextPruning}, content=${currentState.hasContent}, coherence=${currentState.hasCoherenceCheck}, children=${currentState.hasChildren}`);
            console.log(`   Work needed: contextPruning=${workNeeded.contextPruning}, contentGeneration=${workNeeded.contentGeneration}, coherenceCheck=${workNeeded.coherenceCheck}, expansion=${workNeeded.expansion}`);
            
            // Extra details for coherence check logic
            if (needsCoherenceCheck) {
                const isLast = this.isLastChild(node);
                console.log(`   Coherence analysis: needsCoherence=${needsCoherenceCheck}, isLastChild=${isLast}, canTriggerCoherence=${canTriggerCoherence}`);
            }
            
            // Extra details for content generation since that's the user's issue
            if (targetState.needsContent) {
                const reason = currentState.hasContent ? "already has content" : "needs content generation";
                console.log(`   Content analysis: ${reason} (nodeHasContent=${currentState.hasContent})`);
            }
        }
        
        return workNeeded;
    }

    /**
     * Check if generation stopped due to expansion being blocked by coherence requirements
     */
    private checkForBlockedExpansion(startNodeId: string, levels: GenerationLevels): void {
        const allNodes = this.collectAllDescendants(startNodeId);
        const targetStates = this.calculateTargetStates(levels, 0, Math.max(...allNodes.map(n => n.level)));
        
        // Look for nodes that want to expand but are blocked by sibling requirements
        for (const node of allNodes) {
            const targetState = targetStates[node.level];
            if (!targetState?.canExpand) continue;
            
            const currentState = this.getNodeCurrentState(node);
            if (currentState.hasChildren) continue; // Already has children
            
            // Check if this node wants to expand but can't due to siblings
            const canExpand = this.canNodeExpand(node, targetState);
            if (!canExpand) {
                // Found a node that wants to expand but is blocked - show feedback
                this.showExpansionBlockedFeedback(node, targetState);
                return; // Only show one alert to avoid spam
            }
        }
    }

    /**
     * Show user feedback when expansion is blocked due to sibling requirements
     */
    private showExpansionBlockedFeedback(node: DocumentNode, targetState: TargetState): void {
        if (!node.parentId) return;
        
        const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
        if (!parentNode?.children || parentNode.children.length === 0) return;
        
        // Get sibling states to provide specific feedback
        const siblingStates = parentNode.children.map(sibling => {
            const siblingCurrentState = this.getNodeCurrentState(sibling);
            const siblingWorkNeeded = this.getWorkNeeded(sibling, targetState);
            
            const isReady = (!targetState.needsContextPruning || siblingCurrentState.hasContextPruning) && 
                           (!targetState.needsContent || siblingCurrentState.hasContent) && 
                           (!targetState.needsCoherenceCheck || siblingCurrentState.hasCoherenceCheck);
            
            return {
                name: sibling.title,
                isReady,
                needsContent: siblingWorkNeeded.contentGeneration,
                needsCoherence: targetState.needsCoherenceCheck && !siblingCurrentState.hasCoherenceCheck
            };
        });
        
        const notReadySiblings = siblingStates.filter(s => !s.isReady);
        
        if (notReadySiblings.length === 0) return; // Shouldn't happen, but safety check
        
        // Build user-friendly message
        let message = `Cannot expand "${node.title}" because sibling nodes need to be completed first:\n\n`;
        
        notReadySiblings.forEach(sibling => {
            const requirements = [];
            if (sibling.needsContent) requirements.push('content generation');
            if (sibling.needsCoherence) requirements.push('coherence check');
            
            message += `• "${sibling.name}" needs: ${requirements.join(', ')}\n`;
        });
        
        message += '\nOptions to proceed:\n';
        message += '1. Complete the required steps for these nodes first, OR\n';
        message += '2. Lower the coherence level in generation settings to skip coherence requirements';
        
        // Show alert to user
        alert(message);
    }

    /**
     * Check if a node can expand (all siblings at target state)
     * Recalculates current descendants to avoid race conditions from stale data
     */
    private canNodeExpand(node: DocumentNode, targetState: TargetState): boolean {
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`🎛️  STATELESS DEBUG: canNodeExpand check for "${node.title}" (level ${node.level})`);
        }
        
        if (!targetState.canExpand) {
            if (DEBUG_STATELESS_GENERATION) {
                console.log(`   ❌ Target state does not allow expansion (canExpand=false)`);
            }
            return false;
        }
        if (node.children.length > 0) {
            if (DEBUG_STATELESS_GENERATION) {
                console.log(`   ❌ Node already has ${node.children.length} children`);
            }
            return false;
        }
        
        // Get all siblings at the same level using centralized level collection, limited to scope root
        const scopeRoot = this.scopeRootNode ?? this.deps.rootNode;
        const siblings = this.deps.treeService.getNodesAtTemplateLevel(scopeRoot, node.level);
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`   📋 Found ${siblings.length} siblings at level ${node.level} within scope "${scopeRoot.title}":`);
            siblings.forEach(sibling => {
                console.log(`      - "${sibling.title}"`);
            });
        }
        
        // Check if all siblings have reached their target state
        // IMPORTANT: Check actual state vs target, not work capability
        const siblingStates: Array<{name: string, isReady: boolean, workNeeded: WorkNeeded}> = [];
        const allSiblingsReady = siblings.every(sibling => {
            const siblingCurrentState = this.getNodeCurrentState(sibling);
            const siblingWorkNeeded = this.getWorkNeeded(sibling, targetState);
            
            // A sibling is ready if it has ACTUALLY achieved the target state
            // Not just if it can trigger work (coherenceCheck=false for non-last children)
            const isReady = (!targetState.needsContextPruning || siblingCurrentState.hasContextPruning) && 
                           (!targetState.needsContent || siblingCurrentState.hasContent) && 
                           (!targetState.needsCoherenceCheck || siblingCurrentState.hasCoherenceCheck);
            
            siblingStates.push({
                name: sibling.title,
                isReady,
                workNeeded: siblingWorkNeeded
            });
            
            return isReady;
        });
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`   🔍 Sibling readiness check:`);
            siblingStates.forEach(state => {
                const workTypes = [];
                if (state.workNeeded.contextPruning) workTypes.push('contextPruning');
                if (state.workNeeded.contentGeneration) workTypes.push('contentGeneration');
                if (state.workNeeded.coherenceCheck) workTypes.push('coherenceCheck');
                const workStr = workTypes.length > 0 ? `needs: [${workTypes.join(', ')}]` : 'ready';
                
                console.log(`      "${state.name}": ${state.isReady ? '✅' : '❌'} ${workStr}`);
            });
            console.log(`   Result: ${allSiblingsReady ? '✅ All siblings ready - can expand' : '❌ Some siblings not ready - cannot expand'}`);
        }
        
        return allSiblingsReady;
    }

    /**
     * Check if a node is the last child of its parent (for coherence check trigger)
     * This checks the actual tree structure, not the generation scope
     */
    private isLastChild(node: DocumentNode): boolean {
        if (!node.parentId) return false;
        
        const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
        if (!parentNode) {
            if (DEBUG_STATELESS_GENERATION) {
                console.log(`❌ STATELESS DEBUG: Parent node not found for isLastChild check: ${node.parentId}`);
            }
            return false;
        }
        
        const allChildren = parentNode.children;
        const isLast = allChildren.length > 0 && allChildren[allChildren.length - 1]?.id === node.id;
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`🔍 STATELESS DEBUG: isLastChild check for "${node.title}"`);
            console.log(`   Parent: "${parentNode.title}", All children: ${allChildren.map(c => c.title).join(', ')}`);
            console.log(`   Result: ${isLast ? '✅ Is last child' : '❌ Not last child'}`);
        }
        
        return isLast;
    }

    /**
     * Check if coherence check should be triggered for a parent
     * This checks if all siblings need coherence and if any are missing the consistent_to_parent tag
     */
    private shouldTriggerCoherenceCheck(lastChild: DocumentNode, targetState: TargetState): boolean {
        if (!lastChild.parentId) return false;
        
        const parentNode = this.deps.treeService.findNodeById(lastChild.parentId, this.deps.rootNode);
        if (!parentNode) return false;
        
        const allChildren = parentNode.children;
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`🔍 STATELESS DEBUG: shouldTriggerCoherenceCheck for parent "${parentNode.title}"`);
            console.log(`   All children: ${allChildren.map(c => c.title).join(', ')}`);
        }
        
        // Check each child: does it need coherence check and is it missing the tag?
        let needsCoherenceCheck = false;
        
        for (const child of allChildren) {
            // Check if this child should have coherence according to target state
            const childTargetState = targetState; // All siblings have same target state
            if (childTargetState.needsCoherenceCheck) {
                const hasCoherenceTag = child.isConsistentToParent();
                
                if (DEBUG_STATELESS_GENERATION) {
                    console.log(`   Child "${child.title}": needsCoherence=${childTargetState.needsCoherenceCheck}, hasTag=${hasCoherenceTag}`);
                }
                
                if (!hasCoherenceTag) {
                    needsCoherenceCheck = true;
                }
            }
        }
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`   Result: ${needsCoherenceCheck ? '✅ Coherence check needed' : '❌ All children already have coherence tag'}`);
        }
        
        return needsCoherenceCheck;
    }



    /**
     * Check if node has meaningful content
     */
    private nodeHasContent(node: DocumentNode): boolean {
        const hasContent = node.getState() === 'Final';
        
        if (DEBUG_STATELESS_GENERATION) {
            console.log(`📝 STATELESS DEBUG: nodeHasContent check for "${node.title}": ${hasContent} (state="${node.getState()}")`);
        }
        
        return hasContent;
    }

    /**
     * Handle context pruning for a node
     */
    private handleContextPruning(nodeId: string): void {
        // Check for abort at start of operation
        if (this.abortRequested) {
            console.log(`🛑 Context pruning aborted for node: ${nodeId}`);
            return;
        }

        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) throw new Error(`Node not found for context pruning: ${nodeId}`);

        // Skip auto-pruning for project root nodes (no inherited context to clean)
        if (node.level === 0 || !node.parentId) {
            return;
        }

        // Context adjustment removed with traditional context system
        // Skip context adjustment entirely
        return;
    }




    /**
     * Handle content generation for a node
     */
    private async handleContentGeneration(nodeId: string, levels: GenerationLevels): Promise<void> {
        // Check for abort at start of operation
        if (this.abortRequested) {
            console.log(`🛑 Content generation aborted for node: ${nodeId}`);
            return;
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
            const loopInput = this.buildLoopInput(node, levels);

            // Run the content generation loop
            await this.runContentLoop(nodeId, loopInput);

            // Content generation completed (logging reduced to minimize noise)
            
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
        if (this.abortRequested) {
            console.log(`🛑 Draft creation aborted for node: ${nodeId}`);
            return { childIds: [], childrenCreated: false };
        }

        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) throw new Error(`Node not found for draft creation: ${nodeId}`);

        // Parse content sections once
        const sections = this.parseContentSections(node.content);

        // If node already has children and sections exist, fill only missing ones deterministically
        if (node.children.length > 0) {
            if (sections.length > 0) {
                return await this.fillMissingChildrenFromSections(nodeId, sections);
            }
            return { childIds: node.children.map(child => child.id), childrenCreated: false };
        }

        // If no children and sections exist, create all children from sections deterministically
        if (sections.length > 0) {
            return await this.createChildrenFromSections(nodeId, sections);
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
            // Conditional inclusion of parent content for child generation from outline
            let includeParentContent = false;
            const parentForDraft = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
            if (parentForDraft) {
                const sections = this.parseContentSections(parentForDraft.content || '');
                includeParentContent = sections.length === 0;
            }
            const context = this.deps.contextService.compileNodeContext(nodeId, this.deps.rootNode, includeParentContent);

            const prompt = this.deps.promptService.fillGenerationPrompt(
                prompts.create_children_from_outline_user,
                node,
                context,
                this.deps.treeService.getNodePath(nodeId, this.deps.rootNode),
                undefined,
                this.getProjectLanguageForNode() ?? null
            );

            // Apply remaining placeholder replacements using centralized service
            const promptContext = PromptContextBuilder.forAnalysis(this.deps.settingsManager, {
                outlineContent: node.content
            });
            const expansionService = createPromptExpansionService(this.deps.settingsManager);
            const projectLanguage = this.getProjectLanguageForNode();
            const finalPrompt = expansionService.expandPrompt(prompt, promptContext, projectLanguage);

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
            const creatorModel = currentProfile?.selectedModels['creator'];
            const childIds: string[] = [];

            nodeItems.forEach((item) => {
                const newNode = this.deps.treeService.addNode(item.title, nodeId, this.deps.rootNode, creatorModel);
                childIds.push(newNode.id);
                
                // Set the content description as initial content if provided
                if (item.description.trim()) {
                    // Fix metadata type
                    const metadata: { [key: string]: unknown } = {};
                    if (creatorModel) {
                        metadata['creatorModel'] = creatorModel;
                    }
                    
                    const draftVersionId = newNode.addVersion(['generated', 'draft'], {
                        content: `Draft: ${item.description}`,
                        title: newNode.title
                    }, metadata);
                    
                    // Promote the draft version to master (keeping the draft tag)
                    if (draftVersionId) {
                        newNode.promoteToMaster(draftVersionId, ['draft']);
                    }
                    
                    // Note: Context is now handled automatically in TreeService.addNode with selective copying
                    // No need for manual context setting here as it was redundant
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
            
            // Children created (logging reduced to minimize noise)
            
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
        if (this.abortRequested) {
            console.log(`🛑 Coherence check aborted for parent: ${parentId}`);
            return;
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
            // Retry up to 3 times if the AI returns a malformed/empty response
            let result: CoherenceResult | null = null;
            let lastError: unknown = null;
            const maxAttempts = 3;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    result = await this.coherenceService.analyzeCoherenceWithAutofix(
                        parentNode,
                        levels.autofixSeverity,
                        levels.frozenSettings, // Use frozen settings for consistent behavior
                        true, // isAutomaticMode = true (triggered by generation)
                        this.deps.rootNode.id, // projectId
                        // Add progress callback for contradiction fixing
                        (progressMessage: string, current?: number, total?: number) => {
                            // Update stage progress to show autofix progress
                            this.currentStageProgress = {
                                current: current ?? 2,
                                total: total ?? 2,
                                message: progressMessage
                            };
                            this.emitUnifiedProgress();
                        }
                    );
                    break; // success
                } catch (error) {
                    lastError = error;
                    const msg = error instanceof Error ? error.message : String(error);
                    const isCongestion = error instanceof Error && error.name === 'ProviderCongestionError';
                    const isRetryable = isCongestion || /malformed|Failed to parse analysis results|Empty response|Provider error from/i.test(msg);
                    if (!isRetryable || attempt === maxAttempts) {
                        // Non-retryable error or out of attempts
                        throw error;
                    }
                    // Update stage to reflect retry
                    this.currentStageProgress = {
                        current: 1,
                        total: levels.autofixSeverity !== -1 ? 2 : 1,
                        message: `${isCongestion ? 'Provider congestion' : 'Malformed coherence response'}, retrying (${attempt + 1}/${maxAttempts})...`
                    };
                    this.emitUnifiedProgress();
                }
            }
            // Type guard: result must be non-null here due to throw on final failure
            if (!result) {
                throw lastError instanceof Error ? lastError : new Error('Coherence analysis failed with unknown error');
            }
            
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
                // Path 1: No contradictions found - tag analyzed children as consistent immediately
                this.accumulatedContradictions.analyzedNodes.push(parentNode);
                this.accumulatedContradictions.totalAnalyzed++;
                await this.tagSpecificChildrenAsConsistent(parentNode, result.childNodeIds);
            } else {
                // Contradictions found
                if (levels.autofixSeverity !== -1) {
                    // Path 2: Autofix enabled - contradictions were handled automatically
                    // Tag analyzed children as consistent since autofix resolved issues or recorded them
                    this.accumulatedContradictions.analyzedNodes.push(parentNode);
                    this.accumulatedContradictions.totalAnalyzed++;
                    await this.tagSpecificChildrenAsConsistent(parentNode, result.childNodeIds);
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
                    
                    // After modal closes (regardless of what user did), tag analyzed children as consistent
                    // This prevents the infinite loop - the user has seen the contradictions
                    this.accumulatedContradictions.analyzedNodes.push(parentNode);
                    this.accumulatedContradictions.totalAnalyzed++;
                    await this.tagSpecificChildrenAsConsistent(parentNode, result.childNodeIds);
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
                    parentNodeId: this.accumulatedContradictions.analyzedNodes[0]?.id ?? '',
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
            
            // Do NOT tag nodes on error - if coherence check failed, we don't know if they're consistent
            // Nodes will remain untagged and can be checked again later
            console.log(`⚠️ Coherence check failed due to error - nodes remain untagged for future analysis`);
        }
    }

    

    /**
     * Tag only a specific set of children (by IDs) as consistent to parent
     */
    private async tagSpecificChildrenAsConsistent(parentNode: DocumentNode, childIds: string[]): Promise<void> {
        const idSet = new Set(childIds);
        let taggedCount = 0;
        for (const childNode of parentNode.children) {
            if (!idSet.has(childNode.id)) continue;
            const masterVersion = childNode.getMasterVersion();
            if (masterVersion) {
                masterVersion.tags.add('consistent_to_parent');
                masterVersion.timestamp = new Date();
                taggedCount++;
            } else {
                console.warn(`⚠️ No master version found for child node "${childNode.title}"`);
            }
        }
        console.log(`✅ Tagged ${taggedCount} children as consistent to parent "${parentNode.title}"`);
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
        
        // Context adjustment removed - traditional context system removed
        
        // For content generation operations without loop phase info, select appropriate model based on node type
        if (this.currentOperationType === 'content' && this.currentNodeId) {
            const node = this.deps.treeService.findNodeById(this.currentNodeId, this.deps.rootNode);
        if (node) {
                const profile = this.deps.settingsManager.getLastUsedProfile();
                const modelKey = node.isLeaf ? 'prose' : 'creator';
                const modelName = profile?.selectedModels[modelKey];
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
        // Starting content generation (logging reduced to minimize noise)
        
        // Start a new generation session
        node.startGenerationSession(loopInput.prompt);
        let currentIterationContent: string | null = null;
        let currentIterationRatings: Rating[] = [];
        let currentIterationNumber = 0;
        
        // Subscribe to progress updates from the orchestrator - capture content and ratings
        const onProgress = (progress: LoopProgress) => {
            if (this.abortRequested) {
                return;
            }
            
            // Track content from creation phase
            if (progress.phase === 'create') {
                const payload = progress.payload as CreatorPayload;
                if (!payload.response.includes('is working')) {
                    currentIterationContent = payload.response;
                    currentIterationNumber = progress.iteration;
                }
            }
            
            // Track ratings from rating phase and store complete iteration
            if (progress.phase === 'rate' && progress.ratings && progress.ratings.length > 0) {
                currentIterationRatings = progress.ratings;
                
                // If we have both content and ratings, store the iteration
                if (currentIterationContent && currentIterationNumber > 0) {
                    try {
                        node.addGenerationIteration(currentIterationNumber, currentIterationContent, currentIterationRatings);
                        // Iteration stored (logging reduced to minimize noise)
                    } catch (error) {
                        console.warn(`Failed to store iteration ${currentIterationNumber} for "${node.title}":`, error);
                    }
                }
            }
        };

        // Fix unused parameter
        const onAborted = (): void => {
            // Generation aborted - no additional action needed
        };

        // Set up direct forwarding of LoopOrchestrator events to UI (no processing)
        const forwardProgress = (progress: LoopProgress) => {
            this.deps.eventEmitter.emit('loop-progress', { nodeId, progress });
        };
        const forwardStarted = (input: LoopInput) => {
            this.deps.eventEmitter.emit('loop-started', { nodeId, input });
        };
        const forwardPhaseStarted = (phase: 'create' | 'rate' | 'edit', iteration: number) => {
            this.deps.eventEmitter.emit('loop-phase-started', { nodeId, phase, iteration });
        };
        const forwardIterationStarted = (iteration: number, maxIterations: number) => {
            this.deps.eventEmitter.emit('loop-iteration-started', { nodeId, iteration, maxIterations });
        };
        const forwardAborted = () => {
            this.deps.eventEmitter.emit('loop-aborted', { nodeId });
        };

        // Set up LoopOrchestrator event handlers
        this.deps.loopOrchestrator.on('progress', onProgress); // For content tracking
        this.deps.loopOrchestrator.on('progress', forwardProgress); // For UI
        this.deps.loopOrchestrator.on('started', forwardStarted);
        this.deps.loopOrchestrator.on('phase-started', forwardPhaseStarted);
        this.deps.loopOrchestrator.on('iteration-started', forwardIterationStarted);
        this.deps.loopOrchestrator.on('aborted', onAborted); // For content tracking
        this.deps.loopOrchestrator.on('aborted', forwardAborted); // For UI

        try {
            // Run the loop orchestrator
            const result = await this.deps.loopOrchestrator.runLoop(loopInput);

            // Handle completion - properly end session and create versions like the old GenerationService
            if (result.finalResponse) {
                const profile = this.deps.settingsManager.getLastUsedProfile();
                // Select appropriate model based on node type - leaf nodes use 'prose', non-leaf use 'creator'
                const modelKey = node.isLeaf ? 'prose' : 'creator';
                const modelName = profile?.selectedModels[modelKey];
                
                // End the generation session with the final result
                node.endGenerationSession(result.success, result.finalResponse);

                // Friendly model-name tag (e.g. "GPT 5.5", "Claude Opus 4.8")
                // attached to each generated version so users can see which
                // model produced the text. The orchestrator already resolved
                // the display name, so we just strip the provider prefix.
                const modelTag = this.formatModelTag(result.generationModelName);
                
                // Create generation versions from the completed session iterations
                const latestSession = node.getLatestGenerationSession();
                if (latestSession && latestSession.iterations.length > 0) {
                    latestSession.iterations.forEach((iteration) => {
                        node.setContentFromGeneration(iteration.content, modelName, iteration.iteration, modelTag);
                    });
                }
                
                // CRITICAL: Find the generated version with final content and promote it to master
                // This preserves the original draft version as sacred
                const finalVersion = node.getAllVersions().find((v: ContentVersion) => 
                    v.content === result.finalResponse && v.tags.has('generated')
                );
                
                if (finalVersion) {
                    // Promote the generated version to master with generatedWinner tag
                    node.promoteToMaster(finalVersion.id, ['generatedWinner']);
                } else {
                    // Fallback: create a new version for the final content and promote it
                    const fallbackTags = ['generated', 'finalResult'];
                    if (modelTag) {
                        fallbackTags.push(modelTag);
                    }
                    const newVersionId = node.addVersion(fallbackTags, {
                        content: result.finalResponse
                    });
                    if (newVersionId) {
                        node.promoteToMaster(newVersionId, ['generatedWinner']);
                    } else {
                        throw new Error('Failed to create new version for final content');
                    }
                }
                
                // Surface targeted edits the editor could not apply as a node todo,
                // so the failure is visible on the node (tree warning icon + tooltip),
                // not just in logs. A legitimate full-body replace is not a failure
                // and is therefore not recorded here.
                this.applyFailedEditTodos(node, result.failedEdits);

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
                // If an abort was requested, treat this as a graceful stop, not an error
                if (this.abortRequested) {
                    console.log(`🛑 Content generation aborted for: "${node.title}" (no content generated due to abort)`);
                    // Inform UI to refresh state without error signaling
                    this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'content-generation-aborted' });
                    return;
                }
                console.log(`❌ Content generation failed for: "${node.title}" (no content generated)`);
                // Still update tree even on failure to show any partial progress
                console.log(`📢 EMITTING tree-update-needed event for node ${nodeId}: content-generation-failed`);
                this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'content-generation-failed' });
                // Note: Individual content generation does not emit completion events
                // The error will be caught and handled by the main unified generation process.
                // Surface the underlying reason (e.g. the OpenRouter/model error) that
                // the loop captured, so the failure is never reported without a cause.
                const reason = result.error ?? 'the model returned no content';
                throw new Error(`Content generation failed for node "${node.title}": ${reason}`);
            }
        } catch (error) {
            // If we were aborted, suppress error UI and exit quietly
            if (this.abortRequested) {
                console.log(`🛑 Suppressing content generation error for "${node.title}" due to abort.`);
                return;
            }
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showContentGenerationError(
                error as Error, 
                node.title, 
                'Content Loop'
            );
            
            // End the generation session with failure if it's still active
            if (node.currentGenerationSession) {
                node.endGenerationSession(false, '');
            }
            
            // Note: Individual content generation does not emit completion events
            // Re-throw the error to be handled by the main unified generation process
            throw error;
        } finally {
            // Clean up LoopOrchestrator event handlers
            this.deps.loopOrchestrator.off('progress', onProgress);
            this.deps.loopOrchestrator.off('progress', forwardProgress);
            this.deps.loopOrchestrator.off('started', forwardStarted);
            this.deps.loopOrchestrator.off('phase-started', forwardPhaseStarted);
            this.deps.loopOrchestrator.off('iteration-started', forwardIterationStarted);
            this.deps.loopOrchestrator.off('aborted', onAborted);
            this.deps.loopOrchestrator.off('aborted', forwardAborted);
            
            // Note: Individual content generation does not manage isGenerating flag
            // Only the main unified generation process manages this flag
        }
    }

    /**
     * Record (or clear) a node todo describing targeted edits the generation
     * editor could not apply. The todo is marked with a fixed prefix so that
     * reruns replace the previous one instead of stacking duplicates. When there
     * are no failed edits, any prior auto-todo is simply cleared.
     * @param node The node that was generated.
     * @param failedEdits Targeted edits the editor could not apply this run.
     */
    private applyFailedEditTodos(node: DocumentNode, failedEdits: LoopFailedEdit[]): void {
        // Clear previous auto-generated edit-failure todos so reruns don't stack.
        const stale = node.todos.filter(t =>
            t.completed !== true && t.description.startsWith(UnifiedGenerationService.EDITOR_FAILURE_TODO_MARKER)
        );
        for (const todo of stale) {
            node.removeTodo(todo.id);
        }

        if (failedEdits.length === 0) {
            return;
        }

        const details = failedEdits
            .map(edit => {
                const target = edit.search.length > 60 ? `${edit.search.substring(0, 60)}…` : edit.search;
                return `"${target}" — ${edit.reason}`;
            })
            .join('; ');
        const count = failedEdits.length;
        const noun = count === 1 ? 'change' : 'changes';
        node.addTodo(
            `${UnifiedGenerationService.EDITOR_FAILURE_TODO_MARKER} The generation editor could not apply ${count} ${noun}; the text may not fully meet its goals. Details: ${details}`
        );
    }

    /**
     * Turns a model display name into a concise tag for version labelling.
     * The orchestrator returns catalog names like "OpenAI: GPT-5.5" or
     * "Anthropic: Claude Opus 4.8"; we strip the leading "Provider: " prefix so
     * the tag reads as the bare model name (e.g. "GPT-5.5", "Claude Opus 4.8").
     * @param displayName Friendly model name resolved by the loop orchestrator.
     * @returns The cleaned model tag, or an empty string when no name is known.
     */
    private formatModelTag(displayName: string): string {
        const trimmed = displayName.trim();
        if (trimmed === '') {
            return '';
        }
        const separatorIndex = trimmed.indexOf(': ');
        if (separatorIndex !== -1) {
            return trimmed.slice(separatorIndex + 2).trim();
        }
        return trimmed;
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
     * Abort current generation (legacy method, use requestAbort() instead)
     */
    public abortCurrentGeneration(): void {
        this.requestAbort();
        
        // Also request stop from loop orchestrator for any legacy content loops
        this.deps.loopOrchestrator.requestStop();
    }





    /**
     * Extract settings override from node context (now from conditional context)
     */
    private extractSettingsOverride(node: DocumentNode): string | null {
        // Check conditional context items for settings overrides
        const root = this.deps.rootNode;
        const conditionalContext = node.assembleApplicableConditionalContext(root);
        const match = conditionalContext.match(/\[settings:([^\]]+)\]/);
        return match ? match[1] ?? null : null;
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
                    title: String(item.title ?? '').trim(),
                    description: String(item.description ?? '').trim()
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
                        title: String(item.title ?? '').trim(),
                        description: String(item.description ?? '').trim()
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
    private buildLoopInput(node: DocumentNode, levels: GenerationLevels): LoopInput {
        // CRITICAL: Get project language dynamically at generation time to prevent race conditions
        const capturedLanguage = this.getProjectLanguageForNode() ?? this.deps.settingsManager.getLanguage();
        
        // Check for settings override from parent node
        const settingsOverride = this.extractSettingsOverride(node);
        const originalProfileName = settingsOverride ? this.deps.settingsManager.getLastUsedProfileName() ?? null : null;
        
        if (settingsOverride) {
            const overrideProfile = this.deps.settingsManager.getProfile(settingsOverride);
            if (overrideProfile) {
                console.log(`🔧 Using settings override "${settingsOverride}" for node "${node.title}"`);
                void this.deps.settingsManager.setLastUsedProfile(settingsOverride);
            }
        }

        const profile = this.deps.settingsManager.getLastUsedProfile();
        
        if (!profile?.criteria || profile.criteria.length === 0) {
            throw new Error(`Cannot generate content for node "${node.title}". The active profile is missing or has no criteria.`);
        }

        // Get the raw prompt from the node
        const rawPrompt = node.generationPrompt ?? this.deps.promptService.getRawGenerationPrompt(node, levels.deterministicChildCreation);

        // Fill the placeholders.
        //
        // ANTI-FORESHADOWING POLICY (core, fragile — see Stateless_Generation_Logic_Documentation.md).
        // This flag decides whether a node is allowed to see its parent's FULL outline, which
        // describes all of its siblings, i.e. the future. We deliberately keep that future
        // knowledge OUT in the default flow:
        // - Parent outlined into ===sections=== (the default, deterministic child creation):
        //     parentHasSections = true  -> includeParentContent = FALSE. The child only sees its
        //     own section (as its draft) plus the previous node. No future knowledge.
        // - Parent outlined free-form (no sections): includeParentContent = TRUE. The child gets
        //     the whole parent outline and therefore knows later siblings in draft form.
        // Full future knowledge made the model foreshadow/plant hints toward later siblings and
        // produced worse prose; removing it (with predetermined sections supplying a self-contained
        // brief per child) produced better results at lower token cost. Do NOT make this
        // unconditional — that re-enables foreshadowing for the default path.
        let includeParentContent = false;
        if (node.parentId) {
            const parentNode = this.deps.treeService.findNodeById(node.parentId, this.deps.rootNode);
            if (parentNode?.content.trim()) {
                const parentSections = this.parseContentSections(parentNode.content);
                const parentHasSections = parentSections.length > 0;
                includeParentContent = !parentHasSections;
            }
        }
        const context = this.deps.contextService.compileNodeContext(node.id, this.deps.rootNode, includeParentContent);
        const path = this.deps.treeService.getNodePath(node.id, this.deps.rootNode);
        const filledPrompt = this.deps.promptService.fillGenerationPrompt(
            rawPrompt,
            node,
            context,
            path,
            undefined,
            capturedLanguage || null
        );
        
        // Filter criteria appropriately - use template-based leaf detection, not children count
        const isLeafNode = node.isLeaf;
        const filteredCriteria = this.filterCriteriaForNodeType(profile.criteria, isLeafNode);

        // Per-node binary verifiable constraints sourced from conditional context
        // items prefixed with "=>". Scope/leaf gating already happened in the
        // context layer, so these are appended after filterCriteriaForNodeType.
        const constraintTexts = node.getApplicableConstraints(this.deps.rootNode);
        const constraintCriteria: LLMCriterion[] = constraintTexts.map((text, i) => ({
            kind: 'llm',
            name: `Constraint ${i + 1}`,
            description: text,
            goal: 1,
            binary: true,
            outline: true,
            leaf: true,
        }));
        const criteria = [...filteredCriteria, ...constraintCriteria];

        // Create loop input
        const loopInput: LoopInput = {
            prompt: filledPrompt,
            criteria: criteria,
            maxIterations: profile.maxIterations || 3,
            response: '', // Initial response is empty
            isLeafNode: isLeafNode,
            language: capturedLanguage // Captured language prevents race conditions during generation
        };

        // Restore original profile if we used an override
        if (settingsOverride && originalProfileName) {
            void this.deps.settingsManager.setLastUsedProfile(originalProfileName);
        }

        return loopInput;
    }

    /**
     * Parse content sections that follow ===<title>=== format
     * Returns array of sections with title and content
     */
    private parseContentSections(content: string): Array<{title: string, content: string}> {
        // Single shared implementation lives in ContextFormat so the editor's
        // prospective-children list and deterministic child creation never drift.
        return parseContentSections(content);
    }

    /**
     * Create children from parsed content sections
     * Similar to LLM generation but uses algorithmic parsing
     */
    private async createChildrenFromSections(nodeId: string, sections: Array<{title: string, content: string}>): Promise<{ childIds: string[]; childrenCreated: boolean }> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) throw new Error(`Node not found for section-based creation: ${nodeId}`);

        try {
            // Set isGenerating flag and update tree to show spinner
            node.isGenerating = true;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'draft-creation-started' });
            
            // Emit start progress
            this.currentOperationProgress = {
                current: 1,
                total: 3,
                message: `Creating children from sections for "${node.title}"`
            };
            this.currentNodeId = nodeId;
            this.currentOperationType = 'draft';
            this.emitUnifiedProgress();

            // Update progress mid-way
            this.currentOperationProgress = {
                current: 2,
                total: 3,
                message: `Processing ${sections.length} sections for "${node.title}"`
            };
            this.emitUnifiedProgress();

            const childIds: string[] = [];

            sections.forEach((section) => {
                const created = this.createChildFromSection(nodeId, section.title, section.content);
                childIds.push(created.id);
            });

            await this.deps.saveToStorage();
            
            // Emit completion progress
            this.currentOperationProgress = {
                current: 3,
                total: 3,
                message: `Created ${childIds.length} children from sections for "${node.title}"`
            };
            this.emitUnifiedProgress();
            
            console.log(`✅ Created ${childIds.length} children from sections for "${node.title}"`);
            
            // Update tree immediately after children are created
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'children-created' });
            
            return { childIds, childrenCreated: true };
            
        } catch (error) {
            // Show error through the error service (includes console logging)
            await GenerationErrorService.getInstance().showContentGenerationError(
                error as Error, 
                node.title, 
                'Section-based Creation'
            );
            
            throw error;
        } finally {
            // Clear isGenerating flag and update tree to hide spinner
            node.isGenerating = false;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'draft-creation-completed' });
        }
    }

    /**
     * Fills in only missing children based on deterministic sections
     */
    private async fillMissingChildrenFromSections(nodeId: string, sections: Array<{ title: string; content: string }>): Promise<{ childIds: string[]; childrenCreated: boolean }> {
        const node = this.deps.treeService.findNodeById(nodeId, this.deps.rootNode);
        if (!node) throw new Error(`Node not found for section-based fill: ${nodeId}`);

        const existingByTitle = new Map<string, number>();
        node.children.forEach((child, idx) => existingByTitle.set(child.title, idx));

        const missingIndices: number[] = [];
        sections.forEach((section, idx) => {
            if (!existingByTitle.has(section.title)) {
                missingIndices.push(idx);
            }
        });

        if (missingIndices.length === 0) {
            return { childIds: node.children.map(c => c.id), childrenCreated: false };
        }

        node.isGenerating = true;
        this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'draft-creation-started' });

        this.currentOperationProgress = {
            current: 1,
            total: 2,
            message: `Creating ${missingIndices.length} missing section child(ren) for "${node.title}"`
        };
        this.currentNodeId = nodeId;
        this.currentOperationType = 'draft';
        this.emitUnifiedProgress();

        const createdChildIds: string[] = [];

        try {
            for (const sectionIndex of missingIndices) {
                const section = sections[sectionIndex]!;
                const created = this.createChildFromSection(nodeId, section.title, section.content);
                createdChildIds.push(created.id);

                const currentIdx = node.children.findIndex(c => c.id === created.id);
                if (currentIdx === -1) {
                    throw new Error('Newly created child not found among parent children');
                }
                const targetIdx = sectionIndex;
                if (currentIdx !== targetIdx) {
                    const movedNode = node.children.splice(currentIdx, 1)[0]!;
                    node.children.splice(Math.min(targetIdx, node.children.length), 0, movedNode);
                }
            }

            await this.deps.saveToStorage();

            this.currentOperationProgress = {
                current: 2,
                total: 2,
                message: `Created ${createdChildIds.length} missing section child(ren) for "${node.title}"`
            };
            this.emitUnifiedProgress();

            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'children-created' });

            return { childIds: node.children.map(c => c.id), childrenCreated: true };
        } finally {
            node.isGenerating = false;
            this.deps.eventEmitter.emit('tree-update-needed', { nodeId, reason: 'draft-creation-completed' });
        }
    }

    /**
     * Create a single child node from a section using the same logic as bulk creation
     */
    private createChildFromSection(parentId: string, title: string, content: string) {
        const currentProfile = this.deps.settingsManager.getLastUsedProfile();
        const creatorModel = currentProfile?.selectedModels['creator'];

        const newNode = this.deps.treeService.addNode(title, parentId, this.deps.rootNode, creatorModel);

        if (content.trim()) {
            const metadata: { [key: string]: unknown } = {};
            if (creatorModel) {
                metadata['creatorModel'] = creatorModel;
            }

            // Anti-foreshadowing: the child's draft is ONLY its own section of the parent
            // outline, never the whole parent outline. This is what lets the child be
            // generated without seeing later siblings. Do not widen this to the full outline.
            const draftVersionId = newNode.addVersion(['generated', 'draft'], {
                content: `Draft: ${content}`,
                title: newNode.title
            }, metadata);

            if (draftVersionId) {
                newNode.promoteToMaster(draftVersionId, ['draft']);
            }
        }

        return newNode;
    }

    /**
     * Get the language of the project that owns this generation's root node
     */
    private getProjectLanguageForNode(): string | null {
        const project = findProjectByRootNode(this.deps.rootNode);
        return project ? project.getLanguage() : null;
    }
} 