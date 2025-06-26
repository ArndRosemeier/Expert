/**
 * Abstract base class for all modals
 */

import { IModal, ModalConfig, ModalHooks, ModalState } from '../types/ModalTypes';
import { createElement, addEventListenerWithCleanup, MODAL_STYLES } from './modal-utils';

export abstract class BaseModal implements IModal {
    public readonly id: string;
    public readonly config: ModalConfig;
    protected hooks: ModalHooks;
    protected state: ModalState;
    protected element: HTMLElement | null = null;
    protected cleanupHandlers: (() => void)[] = [];

    constructor(config: ModalConfig, hooks: ModalHooks = {}) {
        this.id = config.id;
        this.config = { 
            closable: true, 
            backdrop: true, 
            ...config 
        };
        this.hooks = hooks;
        this.state = {
            isOpen: false,
            isOpening: false,
            isClosing: false
        };
    }

    /**
     * Opens the modal
     */
    public async open(): Promise<void> {
        if (this.state.isOpen || this.state.isOpening) {
            return;
        }

        this.state.isOpening = true;
        
        try {
            // Call lifecycle hook
            await this.hooks.onOpen?.();
            
            // Create and show modal
            await this.createModal();
            this.state.isOpen = true;
            this.state.isOpening = false;
            
        } catch (error) {
            this.state.isOpening = false;
            throw error;
        }
    }

    /**
     * Closes the modal
     */
    public async close(): Promise<void> {
        if (!this.state.isOpen || this.state.isClosing) {
            return;
        }

        this.state.isClosing = true;

        try {
            // Call lifecycle hook
            await this.hooks.onClose?.();
            
            // Remove modal from DOM
            this.destroyModal();
            this.state.isOpen = false;
            this.state.isClosing = false;
            
        } catch (error) {
            this.state.isClosing = false;
            throw error;
        }
    }

    /**
     * Renders the modal content - must be implemented by subclasses
     */
    public abstract render(): HTMLElement;

    /**
     * Destroys the modal and cleans up resources
     */
    public destroy(): void {
        this.cleanup();
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
    }

    /**
     * Handles modal actions
     */
    protected async handleAction(action: string, data?: any): Promise<void> {
        await this.hooks.onAction?.(action, data);
    }

    /**
     * Creates the modal overlay and content
     */
    protected async createModal(): Promise<void> {
        if (this.element) {
            return; // Already created
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
            if (this.element) {
                this.element.style.opacity = '1';
            }
        });
    }

    /**
     * Removes the modal from DOM
     */
    protected destroyModal(): void {
        if (!this.element) {
            return;
        }

        // Animate out
        this.element.style.opacity = '0';
        
        setTimeout(() => {
            this.cleanup();
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
            this.element = null;
        }, 200); // Match CSS transition time
    }

    /**
     * Sets up event handlers for the modal
     */
    protected setupEventHandlers(): void {
        if (!this.element) return;

        // Backdrop click to close
        if (this.config.backdrop && this.config.closable) {
            addEventListenerWithCleanup(
                this.element,
                'click',
                (e) => {
                    if (e.target === this.element) {
                        this.close();
                    }
                },
                this.cleanupHandlers
            );
        }

        // Escape key to close
        if (this.config.closable) {
            const escapeHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    this.close();
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
            () => this.close(),
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

    /**
     * Cleans up event handlers and resources
     */
    protected cleanup(): void {
        this.cleanupHandlers.forEach(cleanup => cleanup());
        this.cleanupHandlers = [];
    }

    /**
     * Gets the current state of the modal
     */
    public getState(): ModalState {
        return { ...this.state };
    }

    /**
     * Checks if the modal is currently open
     */
    public isOpen(): boolean {
        return this.state.isOpen;
    }
} 