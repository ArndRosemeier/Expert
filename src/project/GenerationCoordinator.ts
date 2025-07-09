
import { EventEmitter } from '../EventEmitter';

// Button labels - centralized for consistency (shared with project-ui.ts)
const BUTTON_LABELS = {
    GENERATE: 'Generate',
    GENERATE_ALL: 'Generate All Children'
} as const;

export interface GenerationOperation {
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


    constructor(_eventEmitter: EventEmitter<any>) {
        // eventEmitter parameter accepted but not stored as it's not currently used
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
    public completeOperation(operationId: string, success: boolean, error?: any): void {
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
        const generateBtn = document.getElementById('node-generate-btn') as HTMLButtonElement;
        const generateAllBtn = document.getElementById('node-generate-all-btn') as HTMLButtonElement;
            
            console.log('🔘 Generation UI update - Generate button exists:', !!generateBtn);
            console.log('🔘 Generation UI update - Generate All button exists:', !!generateAllBtn);
        
        if (generateBtn) {
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
        }
        
        if (generateAllBtn) {
            generateAllBtn.disabled = true;
            if (operation.type === 'bulk-children') {
                // Use safe button update to prevent listener loss
                void import('../ui/event-manager').then(({ eventManager }) => {
                    eventManager.updateButtonContent('node-generate-all-btn', 
                        '<span class="spinner" style="width: 12px; height: 12px; border-width: 2px; margin-right: 8px;"></span>...',
                        { disabled: true, className: 'button' }
                    );
                }).catch(console.error);
            }
            } else if (operation.type === 'bulk-children') {
                console.warn('⚠️ Generate All Children button not found during bulk generation start!');
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
        } else if (operation.type === 'child-content') {
            // For child content, show detailed progress bars immediately
            this.updateProgressUI({
                operations: { message: `Generating content for child node...`, current: 0, total: 1 },
                iterations: { message: 'Iteration: 0 / 1', current: 0, total: 1 },
                stages: { message: 'Stage: Initializing...', current: 0, total: 3 },
                detail: 'Preparing to generate content...'
            });
        }

        // Global abort button is now always visible
    }

    /**
     * Update UI when operation completes.
     */
    private updateUIForOperationComplete(_operation: GenerationOperation, success: boolean, error?: any): void {
        // Only clean up UI if no other operations are running
        if (!this.hasActiveOperations()) {
            // Add a small delay to ensure UI has been re-rendered if renderNodeDetails() was called
            setTimeout(() => {
                // Get fresh references to buttons after potential UI re-render
            const generateBtn = document.getElementById('node-generate-btn') as HTMLButtonElement;
            const generateAllBtn = document.getElementById('node-generate-all-btn') as HTMLButtonElement;
                
                console.log('✅ Generation complete - Generate button exists:', !!generateBtn);
                console.log('✅ Generation complete - Generate All button exists:', !!generateAllBtn);
            
            if (generateBtn) {
                generateBtn.disabled = false;
                // Use safe button update to prevent listener loss
                void import('../ui/event-manager').then(({ eventManager }) => {
                    eventManager.updateButtonContent('node-generate-btn', 
                        BUTTON_LABELS.GENERATE,
                        { disabled: false, className: 'button button-primary' }
                    );
                }).catch(console.error);
            }
            
            if (generateAllBtn) {
                generateAllBtn.disabled = false;
                // Use safe button update to prevent listener loss
                void import('../ui/event-manager').then(({ eventManager }) => {
                    eventManager.updateButtonContent('node-generate-all-btn', 
                        BUTTON_LABELS.GENERATE_ALL,
                        { disabled: false, className: 'button' }
                    );
                }).catch(console.error);
                } else {
                    console.warn('⚠️ Generate All Children button not found during cleanup!');
            }
            }, 50); // Small delay to ensure DOM has been updated

            // Clear progress and overlays
            this.updateProgressUI();
            this.hideGenerationOverlay();

            // Handle errors - ALWAYS show them for debugging
            if (!success && error) {
                console.error('Generation operation failed:', error);
                console.error('Full error details:', error);
                alert(`Generation failed: ${error.message || error}`);
            }
        }
    }

    /**
     * Helper methods for UI updates - these call existing functions
     */
    private updateProgressUI(data?: any): void {
        if (typeof (window as any).updateProgressUI === 'function') {
            (window as any).updateProgressUI(data);
        }
    }

    private showGenerationOverlay(): void {
        if (typeof (window as any).showGenerationOverlay === 'function') {
            (window as any).showGenerationOverlay();
        }
    }

    private hideGenerationOverlay(): void {
        if (typeof (window as any).hideGenerationOverlay === 'function') {
            (window as any).hideGenerationOverlay();
        }
    }

    // Global abort button is now always visible - no show/hide methods needed
} 