/**
 * Simplified modal base class that follows the principle:
 * Create → Use → Close → Gone forever (no traces left)
 * 
 * This is the new modal system that eliminates the complexity of
 * the registry-based approach while maintaining backward compatibility.
 */

import { IModal, ModalConfig, ModalHooks } from '../types/ModalTypes';
import { createElement, addEventListenerWithCleanup, MODAL_STYLES } from './modal-utils';

export abstract class SimpleModal implements IModal {
    public readonly id: string;
    public readonly config: ModalConfig;
    protected hooks: ModalHooks;
    protected element: HTMLElement | null = null;
    protected cleanupHandlers: (() => void)[] = [];
    private isDestroyed = false;

    constructor(config: ModalConfig, hooks: ModalHooks = {}) {
        this.id = config.id;
        this.config = { 
            closable: true, 
            backdrop: true, 
            ...config 
        };
        this.hooks = hooks;
    }

    /**
     * Opens the modal
     */
    public async open(): Promise<void> {
        if (this.isDestroyed || this.element) {
            return; // Already open or destroyed
        }

        try {
            // Create and show modal
            await this.createModal();
            
            // Call lifecycle hook AFTER DOM is ready
            await this.hooks.onOpen?.();
            
        } catch (error) {
            // Clean up on error
            this.destroy();
            throw error;
        }
    }

    /**
     * Closes the modal and destroys it completely
     */
    public async close(): Promise<void> {
        if (this.isDestroyed || !this.element) {
            return; // Already closed/destroyed
        }

        try {
            // Call lifecycle hook
            await this.hooks.onClose?.();
        } catch (error) {
            console.warn('Error in modal onClose hook:', error);
        }

        // Animate out and destroy
        this.animateOutAndDestroy();
    }

    /**
     * Renders the modal content - must be implemented by subclasses
     */
    public abstract render(): HTMLElement;

    /**
     * Destroys the modal completely - no traces left
     */
    public destroy(): void {
        if (this.isDestroyed) return;
        
        this.isDestroyed = true;
        
        // Clean up ALL event handlers
        this.cleanupHandlers.forEach(handler => { handler(); });
        this.cleanupHandlers = [];
        
        // Remove from DOM
        if (this.element?.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        
        // Clear all references
        this.element = null;
        
        // Modal is now completely gone - no traces left anywhere
    }

    /**
     * Handles modal actions
     */
    protected async handleAction(action: string, data?: any): Promise<void> {
        try {
            await this.hooks.onAction?.(action, data);
        } catch (error) {
            console.warn('Error in modal action handler:', error);
        }
    }

    /**
     * Creates the modal overlay and content
     */
    protected async createModal(): Promise<void> {
        if (this.element || this.isDestroyed) {
            return; // Already created or destroyed
        }

        // Create overlay
        this.element = createElement('div', {
            classes: ['modal-overlay'],
            attributes: { 
                'data-modal-id': this.id,
                'style': MODAL_STYLES.overlay
            }
        });

        // Create content container
        const contentContainer = createElement('div', {
            classes: ['modal-content'],
            attributes: { 
                'style': this.buildContentStyle()
            }
        });

        // Render content
        const content = this.render();
        contentContainer.appendChild(content);

        // Add close button if closable
        if (this.config.closable) {
            this.addCloseButton(contentContainer);
        }

        this.element.appendChild(contentContainer);

        // Set up event handlers
        this.setupEventHandlers();

        // Add to DOM
        document.body.appendChild(this.element);

        // Animate in
        requestAnimationFrame(() => {
            if (this.element && !this.isDestroyed) {
                this.element.style.opacity = '1';
            }
        });
    }

    /**
     * Animates out and destroys the modal
     */
    private animateOutAndDestroy(): void {
        if (!this.element || this.isDestroyed) {
            return;
        }

        // Animate out
        this.element.style.opacity = '0';
        
        // Destroy after animation
        setTimeout(() => {
            this.destroy();
        }, 150); // Shorter than before for snappier UX
    }

    /**
     * Sets up event handlers for the modal
     */
    protected setupEventHandlers(): void {
        if (!this.element || this.isDestroyed) return;

        // Backdrop click to close
        if (this.config.backdrop && this.config.closable) {
            addEventListenerWithCleanup(
                this.element,
                'click',
                (e) => {
                    if (e.target === this.element) {
                        void this.close();
                    }
                },
                this.cleanupHandlers
            );
        }

        // Escape key to close
        if (this.config.closable) {
            const escapeHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape' && !this.isDestroyed) {
                    void this.close();
                }
            };
            
            document.addEventListener('keydown', escapeHandler);
            this.cleanupHandlers.push(() => {
                document.removeEventListener('keydown', escapeHandler);
            });
        }
    }

    /**
     * Adds a close button to the modal
     */
    protected addCloseButton(container: HTMLElement): void {
        const closeButton = createElement('button', {
            classes: ['modal-close'],
            attributes: {
                'type': 'button',
                'aria-label': 'Close modal',
                'style': `
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #6b7280;
                    width: 2rem;
                    height: 2rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 0.375rem;
                    transition: background-color 0.2s;
                `
            },
            content: '×'
        });

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.backgroundColor = '#f3f4f6';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.backgroundColor = 'transparent';
        });

        addEventListenerWithCleanup(
            closeButton,
            'click',
            () => void this.close(),
            this.cleanupHandlers
        );

        container.style.position = 'relative';
        container.appendChild(closeButton);
    }

    /**
     * Builds the CSS style for modal content
     */
    protected buildContentStyle(): string {
        let style = MODAL_STYLES.content;
        
        if (this.config.width) {
            style += `width: ${this.config.width};`;
        }
        if (this.config.height) {
            style += `height: ${this.config.height};`;
        }
        if (this.config.maxWidth) {
            style += `max-width: ${this.config.maxWidth};`;
        }
        if (this.config.maxHeight) {
            style += `max-height: ${this.config.maxHeight};`;
        }

        return style;
    }

    // Backward compatibility methods (no-op implementations)
    public getState(): any {
        return {
            isOpen: Boolean(this.element) && !this.isDestroyed,
            isOpening: false,
            isClosing: false
        };
    }

    public isOpen(): boolean {
        return Boolean(this.element) && !this.isDestroyed;
    }
}
