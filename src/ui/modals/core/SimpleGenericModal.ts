/**
 * Simplified GenericModal that extends SimpleModal
 * This provides the same API as the old GenericModal but uses the simplified system
 */

import { SimpleModal } from './SimpleModal';
import { ModalConfig, ModalHooks, GenericModalContent, ModalAction } from '../types/ModalTypes';
import { createElement } from './modal-utils';

export class SimpleGenericModal extends SimpleModal {
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
            const actionsContainer = createElement('div', {
                classes: ['modal-actions'],
                attributes: {
                    style: `
                        display: flex;
                        gap: 0.75rem;
                        justify-content: flex-end;
                        margin-top: 1.5rem;
                    `
                }
            });

            this.content.actions.forEach((action: ModalAction) => {
                const button = createElement('button', {
                    content: action.label,
                    attributes: {
                        type: 'button',
                        style: this.getButtonStyle(action.type ?? 'secondary')
                    }
                });

                button.addEventListener('click', async () => {
                    try {
                        await action.handler();
                        // Auto-close the modal after successful action
                        // Unless the action threw a special error to keep it open
                        void this.close();
                    } catch (error: any) {
                        // Special case: allow actions to prevent modal from closing
                        if (error?.message === '__KEEP_MODAL_OPEN__') {
                            return; // Don't close the modal
                        }
                        console.error('Error in modal action:', error);
                        // Still close the modal on errors (unless specifically prevented)
                        void this.close();
                    }
                });

                actionsContainer.appendChild(button);
            });

            container.appendChild(actionsContainer);
        }

        return container;
    }

    /**
     * Gets the CSS style for a button type
     */
    private getButtonStyle(type: string): string {
        const baseStyle = `
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid;
        `;

        switch (type) {
            case 'primary':
                return baseStyle + `
                    background-color: #3b82f6;
                    color: white;
                    border-color: #3b82f6;
                `;
            case 'danger':
                return baseStyle + `
                    background-color: #ef4444;
                    color: white;
                    border-color: #ef4444;
                `;
            case 'outline':
                return baseStyle + `
                    background-color: transparent;
                    color: #3b82f6;
                    border-color: #3b82f6;
                `;
            default: // secondary
                return baseStyle + `
                    background-color: #f3f4f6;
                    color: #374151;
                    border-color: #d1d5db;
                `;
        }
    }
}
