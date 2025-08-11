/**
 * Generic modal for displaying simple content with optional actions
 * Now uses the simplified modal system for better lifecycle management
 */

import { SimpleGenericModal } from './core/SimpleGenericModal';
import { ModalConfig, ModalHooks, GenericModalContent } from './types/ModalTypes';

// Export SimpleGenericModal as GenericModal for backward compatibility
export class GenericModal extends SimpleGenericModal {
    // This class now inherits all functionality from SimpleGenericModal
    // which uses the simplified modal system with auto-cleanup
    
    /**
     * Updates the modal content (keeping this method for backward compatibility)
     */
    public updateContent(content: GenericModalContent): void {
        // For simplicity, we'll recreate the modal with new content
        // This is cleaner than trying to update DOM in place
        if (this.isOpen()) {
            const wasOpen = true;
            void this.close().then(() => {
                if (wasOpen) {
                    // Create new modal with updated content
                    const newConfig = { ...this.config, content };
                    const newModal = new GenericModal(newConfig, this.hooks);
                    void newModal.open();
                }
            });
        }
    }
}

/**
 * Convenience function to create and show a generic modal
 */
export function showGenericModal(
    content: string | GenericModalContent, 
    config: Partial<ModalConfig> = {},
    hooks: ModalHooks = {}
): GenericModal {
    const modalContent: GenericModalContent = typeof content === 'string' 
        ? { content } 
        : content;

    const modalConfig: ModalConfig & { content: GenericModalContent } = {
        id: config.id ?? `generic-modal-${Date.now()}`,
        maxWidth: config.maxWidth ?? '80vw',
        maxHeight: config.maxHeight ?? '90vh',
        closable: config.closable ?? true,
        backdrop: config.backdrop ?? true,
        content: modalContent,
        // Only include optional props when defined to satisfy exactOptionalPropertyTypes
        ...(config.title !== undefined ? { title: config.title } : {}),
        ...(config.width !== undefined ? { width: config.width } : {}),
        ...(config.height !== undefined ? { height: config.height } : {})
    };

    // Use the simplified modal system - no registry needed!
    const modal = new GenericModal(modalConfig, hooks);
    
    // Auto-open the modal
    void modal.open().catch(error => {
        console.error('❌ Failed to open modal:', error);
        // Don't re-throw to avoid uncaught promise rejection
    });

    return modal;
}

/**
 * Convenience function to show a simple alert-style modal
 */
export function showAlert(
    message: string, 
    title?: string,
    onClose?: () => void
): GenericModal {
    return showGenericModal(
        {
            content: message,
            actions: [
                {
                    id: 'ok',
                    label: 'OK',
                    type: 'primary',
                    handler: async () => {
                        // Modal will close automatically when the action completes
                        onClose?.();
                    }
                }
            ]
        },
        { 
            title: title || 'Alert',
            maxWidth: '400px'
        }
    );
}

/**
 * Convenience function to show a confirmation modal
 */
export function showConfirm(
    message: string,
    title?: string,
    onConfirm?: () => void,
    onCancel?: () => void
): GenericModal {
    return showGenericModal(
        {
            content: message,
            actions: [
                {
                    id: 'cancel',
                    label: 'Cancel',
                    type: 'outline',
                    handler: async () => {
                        onCancel?.();
                    }
                },
                {
                    id: 'confirm',
                    label: 'Confirm',
                    type: 'primary',
                    handler: async () => {
                        onConfirm?.();
                    }
                }
            ]
        },
        { 
            title: title || 'Confirm',
            maxWidth: '400px'
        }
    );
}