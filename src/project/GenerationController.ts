import { DocumentNode } from '../DocumentNode';
import { LoopOrchestrator } from '../LoopOrchestrator';
import { GenerationContext, GenerationInfo } from './types/ProjectTypes';
import { TreeService } from './TreeService';

/**
 * GenerationController manages all generation state and control operations.
 * Handles starting, stopping, and tracking content generation processes.
 */
export class GenerationController {
    private currentGenerationContext: GenerationContext | null = null;
    private abortRequested: boolean = false;
    private isGeneratingAllChildren: boolean = false;

    constructor(
        private loopOrchestrator: LoopOrchestrator,
        private treeService: TreeService
    ) {}

    /**
     * Starts a new generation operation.
     */
    public startGeneration(context: GenerationContext): void {
        this.currentGenerationContext = context;
        this.abortRequested = false;
        
        if (context.type === 'bulk') {
            this.isGeneratingAllChildren = true;
        }
    }

    /**
     * Aborts the current generation operation.
     */
    public abortCurrentGeneration(rootNode: DocumentNode): string[] {
        console.log('🛑 GenerationController: Starting abort process');
        this.abortRequested = true;
        
        // Get the list of aborted node IDs before clearing context
        const abortedNodeIds = this.currentGenerationContext?.nodeIds || [];
        console.log('🛑 GenerationController: Aborting nodes:', abortedNodeIds);
        
        // Execute abort operations in parallel for faster response
        const abortOperations = [];
        
        if (this.currentGenerationContext) {
            console.log('🛑 GenerationController: Aborting generation context controller');
            abortOperations.push(
                Promise.resolve().then(() => this.currentGenerationContext?.abortController.abort())
            );
        }
        
        // Abort the loop orchestrator (this will also abort OpenRouter operations)
        console.log('🛑 GenerationController: Requesting LoopOrchestrator stop');
        abortOperations.push(
            Promise.resolve().then(() => { this.loopOrchestrator.requestStop(); })
        );
        
        // Mark all generating nodes as no longer generating (immediate UI feedback)
        console.log('🛑 GenerationController: Clearing generating flags');
        this.treeService.clearAllGeneratingFlags(rootNode);
        
        // Execute all abort operations in parallel
        Promise.all(abortOperations).then(() => {
            console.log('🛑 GenerationController: All abort operations completed');
        }).catch(error => {
            console.warn('🛑 GenerationController: Error during abort operations:', error);
        });
        
        // Clear generation context immediately for UI feedback
        this.currentGenerationContext = null;
        this.isGeneratingAllChildren = false;
        
        console.log('🛑 GenerationController: Abort process completed, returning aborted node IDs:', abortedNodeIds);
        return abortedNodeIds;
    }

    /**
     * Checks if any generation is currently running and can be aborted.
     */
    public canAbortGeneration(rootNode: DocumentNode): boolean {
        return this.currentGenerationContext !== null || this.treeService.isAnyNodeGenerating(rootNode);
    }

    /**
     * Gets information about the current generation for UI display.
     */
    public getCurrentGenerationInfo(): GenerationInfo | null {
        if (!this.currentGenerationContext) {
            return null;
        }
        
        return {
            type: this.currentGenerationContext.type,
            nodeCount: this.currentGenerationContext.nodeIds.length,
            canAbort: true
        };
    }

    /**
     * Checks if the generation was aborted.
     */
    public isAbortRequested(): boolean {
        return this.abortRequested;
    }

    /**
     * Checks if bulk generation is running.
     */
    public isBulkGenerationActive(): boolean {
        return this.isGeneratingAllChildren;
    }

    /**
     * Gets the current generation context.
     */
    public getCurrentContext(): GenerationContext | null {
        return this.currentGenerationContext;
    }

    /**
     * Clears the current generation context.
     */
    public clearGenerationContext(): void {
        this.currentGenerationContext = null;
        this.isGeneratingAllChildren = false;
        this.abortRequested = false;
    }

    /**
     * Sets up generation context for single node.
     */
    public setupSingleNodeGeneration(nodeId: string): GenerationContext {
        const context: GenerationContext = {
            type: 'single',
            nodeIds: [nodeId],
            abortController: new AbortController()
        };
        
        this.startGeneration(context);
        return context;
    }

    /**
     * Sets up generation context for bulk operation.
     */
    public setupBulkGeneration(nodeIds: string[]): GenerationContext {
        const context: GenerationContext = {
            type: 'bulk',
            nodeIds: nodeIds,
            abortController: new AbortController()
        };
        
        this.startGeneration(context);
        return context;
    }

    /**
     * Validates that generation can proceed.
     */
    public validateGenerationCanProceed(isChildGeneration: boolean, rootNode: DocumentNode): void {
        if (!isChildGeneration && this.canAbortGeneration(rootNode)) {
            throw new Error('Another generation operation is already in progress. Please abort it first or wait for completion.');
        }
    }
} 