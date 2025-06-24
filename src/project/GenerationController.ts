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
        this.abortRequested = true;
        
        if (this.currentGenerationContext) {
            this.currentGenerationContext.abortController.abort();
        }
        
        // Abort the loop orchestrator
        this.loopOrchestrator.requestStop();
        
        // Mark all generating nodes as no longer generating
        this.treeService.clearAllGeneratingFlags(rootNode);
        
        // Get the list of aborted node IDs
        const abortedNodeIds = this.currentGenerationContext?.nodeIds || [];
        
        // Clear generation context
        this.currentGenerationContext = null;
        this.isGeneratingAllChildren = false;
        
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