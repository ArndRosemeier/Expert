/**
 * Generic modal for displaying simple content with optional actions
 */

import { BaseModal } from './core/BaseModal';
import { ModalConfig, ModalHooks, GenericModalContent, ModalAction } from './types/ModalTypes';
import { createElement, MODAL_STYLES } from './core/modal-utils';

export class GenericModal extends BaseModal {
    private content: GenericModalContent;

    constructor(config: ModalConfig & { content: GenericModalContent }, hooks: ModalHooks = {}) {
        super(config, hooks);
        this.content = config.content;
    }

    /**
     * Renders the modal content
     */
    public render(): HTMLElement {
        const container = createElement('div', {
            classes: ['generic-modal-container']
        });

        // Add title if provided
        if (this.config.title) {
            const title = createElement('h2', {
                classes: ['modal-title'],
                content: this.config.title,
                attributes: {
                    style: `
                        margin: 0 0 1.5rem 0;
                        font-size: 1.5rem;
                        font-weight: 600;
                        color: #1f2937;
                    `
                }
            });
            container.appendChild(title);
        }

        // Add content
        const contentDiv = createElement('div', {
            classes: ['modal-body'],
            innerHTML: this.content.content,
            attributes: {
                style: `
                    margin-bottom: 1.5rem;
                    line-height: 1.6;
                    color: #374151;
                `
            }
        });
        container.appendChild(contentDiv);

        // Add actions if provided
        if (this.content.actions && this.content.actions.length > 0) {
            const actionsContainer = this.createActionsContainer();
            container.appendChild(actionsContainer);
        }

        return container;
    }

    /**
     * Updates the modal content
     */
    public updateContent(content: GenericModalContent): void {
        this.content = content;
        
        // Re-render if modal is open
        if (this.isOpen() && this.element) {
            const contentContainer = this.element.querySelector('.modal-content');
            if (contentContainer) {
                const newContent = this.render();
                contentContainer.innerHTML = '';
                contentContainer.appendChild(newContent);
                
                // Re-add close button if needed
                if (this.config.closable) {
                    this.addCloseButton(contentContainer as HTMLElement);
                }
            }
        }
    }

    /**
     * Creates the actions container with buttons
     */
    private createActionsContainer(): HTMLElement {
        const container = createElement('div', {
            classes: ['modal-actions'],
            attributes: {
                style: `
                    display: flex;
                    gap: 0.75rem;
                    justify-content: flex-end;
                    margin-top: 1.5rem;
                    padding-top: 1rem;
                    border-top: 1px solid #e5e7eb;
                `
            }
        });

        this.content.actions?.forEach(action => {
            const button = this.createActionButton(action);
            container.appendChild(button);
        });

        return container;
    }

    /**
     * Creates an action button
     */
    private createActionButton(action: ModalAction): HTMLElement {
        const buttonStyle = this.getButtonStyle(action.type || 'secondary');
        
        const button = createElement('button', {
            classes: ['modal-action-btn', `btn-${action.type || 'secondary'}`],
            content: action.label,
            attributes: {
                'data-action-id': action.id,
                style: MODAL_STYLES.button + buttonStyle
            }
        });

        button.addEventListener('click', async () => {
            try {
                await action.handler();
                await this.handleAction(action.id);
            } catch (error: any) {
                // Special case: silent errors that are used to prevent modal from closing
                if (error?.message === '__KEEP_MODAL_OPEN__') {
                    // Do nothing - this is intentional to keep the modal open
                    return;
                }
                console.error(`Error handling action ${action.id}:`, error);
            }
        });

        // Add hover effects
        button.addEventListener('mouseenter', () => {
            button.style.opacity = '0.9';
        });

        button.addEventListener('mouseleave', () => {
            button.style.opacity = '1';
        });

        return button;
    }

    /**
     * Gets the button style based on type
     */
    private getButtonStyle(type: string): string {
        switch (type) {
            case 'primary':
                return MODAL_STYLES.primaryButton;
            case 'secondary':
                return MODAL_STYLES.secondaryButton;
            case 'outline':
                return MODAL_STYLES.outlineButton;
            case 'danger':
                return `
                    background-color: #dc2626;
                    color: white;
                `;
            default:
                return MODAL_STYLES.secondaryButton;
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
        id: config.id || `generic-modal-${Date.now()}`,
        maxWidth: config.maxWidth || '80vw',
        maxHeight: config.maxHeight || '90vh',
        closable: config.closable !== false,
        backdrop: config.backdrop !== false,
        content: modalContent,
        ...(config.title !== undefined && { title: config.title }),
        ...(config.width !== undefined && { width: config.width }),
        ...(config.height !== undefined && { height: config.height })
    };

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
                        // Modal will close automatically
                    }
                }
            ]
        },
        { 
            title: title || 'Alert',
            maxWidth: '400px'
        },
        onClose ? { onClose } : {}
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