/**
 * BaseModal reimplemented using SimpleModal under the hood
 * This maintains 100% backward compatibility while getting the benefits of the simplified system
 */

import { SimpleModal } from './SimpleModal';
import { IModal, ModalConfig, ModalHooks, ModalState } from '../types/ModalTypes';

export abstract class BaseModal extends SimpleModal implements IModal {
    protected state: ModalState;

    constructor(config: ModalConfig, hooks: ModalHooks = {}) {
        super(config, hooks);
        
        // Initialize state for backward compatibility
        this.state = {
            isOpen: false,
            isOpening: false,
            isClosing: false
        };
    }

    /**
     * Override open to update state for backward compatibility
     */
    public override async open(): Promise<void> {
        if (this.state.isOpen || this.state.isOpening) {
            return;
        }

        this.state.isOpening = true;
        
        try {
            await super.open();
            this.state.isOpen = true;
            this.state.isOpening = false;
        } catch (error) {
            this.state.isOpening = false;
            throw error;
        }
    }

    /**
     * Override close to update state for backward compatibility
     */
    public override async close(): Promise<void> {
        if (!this.state.isOpen || this.state.isClosing) {
            return;
        }

        this.state.isClosing = true;

        try {
            await super.close();
            this.state.isOpen = false;
            this.state.isClosing = false;
        } catch (error) {
            this.state.isClosing = false;
            throw error;
        }
    }

    /**
     * Gets the current state of the modal (backward compatibility)
     */
    public override getState(): ModalState {
        return { ...this.state };
    }

    /**
     * Checks if the modal is currently open (backward compatibility)
     */
    public override isOpen(): boolean {
        return this.state.isOpen;
    }

    /**
     * Destroy method for backward compatibility
     */
    public override destroy(): void {
        // Call cleanup if implemented
        this.cleanup();
        
        // SimpleModal handles destruction automatically on close
        // But we need to update state for compatibility
        this.state = {
            isOpen: false,
            isOpening: false,
            isClosing: false
        };
        
        // Call parent destroy
        super.destroy();
    }

    /**
     * Cleanup method for subclasses to override (backward compatibility)
     */
    protected cleanup(): void {
        // Default implementation - does nothing
        // Subclasses can override this for custom cleanup
    }
}