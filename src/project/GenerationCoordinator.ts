import type { ProgressUIData } from '../ui/types/ProjectUiTypes';

// Button labels - centralized for consistency (shared with project-ui.ts)
const BUTTON_LABELS = {
    GENERATE: 'Generate'
} as const;

interface GenerationOperation {
    id: string;
    type: 'single-content' | 'bulk-children' | 'child-content';
    primaryNodeId: string;
    involvedNodeIds: Set<string>;
    startTime: number;
    isComplete: boolean;
}

/**
 * Lightweight generation coordinator that provides centralized state management
 * and UI updates for all generation operations without replacing existing logic.
 */
export class GenerationCoordinator {
    private operations = new Map<string, GenerationOperation>();
    private operationCounter = 1;

    // When true, the blocking failure alert is suppressed. Used by the long-run
    // auto-retry loop so unattended retries are not blocked by a native alert().
    private suppressFailureAlert = false;

    constructor() {
    }

    /** Suppress/restore the blocking failure alert (used during long-run auto-retry). */
    public setSuppressFailureAlert(suppress: boolean): void {
        this.suppressFailureAlert = suppress;
    }

    /**
     * Start a new generation operation and return its ID.
     * Handles UI state updates and conflict checking.
     */
    public startOperation(
        type: GenerationOperation['type'], 
        primaryNodeId: string, 
        involvedNodeIds: string[] = [primaryNodeId]
    ): string | null {
        // Check for conflicts
        if (this.hasConflictingOperation(primaryNodeId, involvedNodeIds)) {
            return null;
        }

        const operationId = `gen-${this.operationCounter++}`;
        const operation: GenerationOperation = {
            id: operationId,
            type,
            primaryNodeId,
            involvedNodeIds: new Set(involvedNodeIds),
            startTime: Date.now(),
            isComplete: false
        };

        this.operations.set(operationId, operation);
        
        // Disable UI buttons immediately
        this.updateUIForOperationStart(operation);
        
        return operationId;
    }

    /**
     * Mark an operation as complete and handle cleanup.
     */
    public completeOperation(operationId: string, success: boolean, error?: unknown): void {
        const operation = this.operations.get(operationId);
        if (!operation) return;

        operation.isComplete = true;
        this.operations.delete(operationId);

        // Handle UI updates
        this.updateUIForOperationComplete(operation, success, error);
    }

    /**
     * Check if there are any active operations.
     */
    public hasActiveOperations(): boolean {
        return this.operations.size > 0;
    }

    /**
     * Check if a specific node is involved in any operation.
     */
    public isNodeGenerating(nodeId: string): boolean {
        for (const operation of this.operations.values()) {
            if (operation.involvedNodeIds.has(nodeId)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get all active operations.
     */
    public getActiveOperations(): GenerationOperation[] {
        return Array.from(this.operations.values());
    }

    /**
     * Abort all operations.
     */
    public abortAllOperations(): void {
        const operationIds = Array.from(this.operations.keys());
        for (const operationId of operationIds) {
            this.completeOperation(operationId, false, new Error('Operation aborted'));
        }
    }

    /**
     * Check for conflicting operations.
     */
    private hasConflictingOperation(primaryNodeId: string, involvedNodeIds: string[]): boolean {
        for (const operation of this.operations.values()) {
            // Single content operations conflict with any operation on the same node
            if (operation.involvedNodeIds.has(primaryNodeId)) {
                return true;
            }
            
            // Bulk operations conflict with any overlapping nodes
            for (const nodeId of involvedNodeIds) {
                if (operation.involvedNodeIds.has(nodeId)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Update UI when operation starts.
     */
    private updateUIForOperationStart(operation: GenerationOperation): void {
        // Add a small delay to ensure UI has been re-rendered after renderNodeDetails() call
        setTimeout(() => {
            // Get fresh references to buttons after potential UI re-render
            const generateBtn = document.getElementById('node-generate-btn');
            if (!(generateBtn instanceof HTMLButtonElement)) {
                console.log('🔘 Generation UI update - Generate button not found');
                return;
            }

            console.log('🔘 Generation UI update - Generate button exists: true');
            generateBtn.disabled = true;
            if (operation.type === 'single-content') {
                // Use safe button update to prevent listener loss
                void import('../ui/event-manager').then(({ eventManager }) => {
                    eventManager.updateButtonContent('node-generate-btn', 
                        '<span class="spinner" style="width: 12px; height: 12px; border-width: 2px; margin-right: 8px;"></span>...',
                        { disabled: true, className: 'button button-primary' }
                    );
                }).catch(console.error);
            }
        }, 50); // Small delay to ensure DOM has been updated

        // Show progress UI based on operation type
        if (operation.type === 'single-content') {
            this.showGenerationOverlay();
            this.updateProgressUI({
                operations: { message: 'Preparing content generation...', current: 0, total: 1 }
            });
        } else if (operation.type === 'bulk-children') {
            this.updateProgressUI({
                operations: { message: 'Preparing to generate children...', current: 0, total: 1 }
            });
        } else {
            // For child content, only update iteration/stage progress
            // Don't override operations progress if there's a bulk operation running
            const hasBulkOperation = Array.from(this.operations.values()).some(op => op.type === 'bulk-children');
            
            if (hasBulkOperation) {
                // During bulk operations, only update iteration/stage progress
                this.updateProgressUI({
                    iterations: { message: 'Iteration: 0 / 1', current: 0, total: 1 },
                    stages: { message: 'Stage: Initializing...', current: 0, total: 3 },
                    detail: 'Preparing to generate content...'
                });
            } else {
                // For standalone child content generation, show full progress
                this.updateProgressUI({
                    operations: { message: `Generating content for child node...`, current: 0, total: 1 },
                    iterations: { message: 'Iteration: 0 / 1', current: 0, total: 1 },
                    stages: { message: 'Stage: Initializing...', current: 0, total: 3 },
                    detail: 'Preparing to generate content...'
                });
            }
        }

        // Global abort button is now always visible
    }

    /**
     * Update UI when operation completes.
     */
    private updateUIForOperationComplete(_operation: GenerationOperation, success: boolean, error?: unknown): void {
        // Only clean up UI if no other operations are running
        if (!this.hasActiveOperations()) {
            // Add a small delay to ensure UI has been re-rendered if renderNodeDetails() was called
            setTimeout(() => {
                // Get fresh references to buttons after potential UI re-render
                const generateBtn = document.getElementById('node-generate-btn');
                if (!(generateBtn instanceof HTMLButtonElement)) {
                    console.log('✅ Generation complete - Generate button not found');
                    return;
                }

                console.log('✅ Generation complete - Generate button exists: true');
                generateBtn.disabled = false;
                // Restore the depth-aware idle label set by renderNodeDetails (e.g.
                // "Generate down to Scene"); fall back to the plain label if unset.
                const idleLabel = generateBtn.dataset['idleLabel'] ?? BUTTON_LABELS.GENERATE;
                // Use safe button update to prevent listener loss
                void import('../ui/event-manager').then(({ eventManager }) => {
                    eventManager.updateButtonContent('node-generate-btn', 
                        idleLabel,
                        { disabled: false, className: 'button button-primary' }
                    );
                }).catch(console.error);
            }, 50); // Small delay to ensure DOM has been updated

            // Clear progress and overlays
            this.clearProgressUI();
            this.hideGenerationOverlay();

            // Handle errors - ALWAYS show them for debugging
            if (!success && error) {
                console.error('Generation operation failed:', error);
                console.error('Full error details:', error);
                if (!this.suppressFailureAlert) {
                    const message = error instanceof Error ? error.message : String(error);
                    alert(`Generation failed: ${message}`);
                }
            }
        }
    }

    /**
     * Helper methods for UI updates - these call existing functions
     */
    private updateProgressUI(data: ProgressUIData): void {
        window.updateProgressUI!(data);
    }

    private clearProgressUI(): void {
        window.clearProgressUI!();
    }

    private showGenerationOverlay(): void {
        window.showGenerationOverlay!();
    }

    private hideGenerationOverlay(): void {
        window.hideGenerationOverlay!();
    }

    // Global abort button is now always visible - no show/hide methods needed
} 