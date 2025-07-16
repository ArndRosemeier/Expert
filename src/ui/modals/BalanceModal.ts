/**
 * Modal for displaying OpenRouter account balance information
 */

import { BaseModal } from './core/BaseModal';
import { ModalConfig, ModalHooks } from './types/ModalTypes';
import { createElement } from './core/modal-utils';

interface BalanceData {
    message: string;
    isError?: boolean;
}

class BalanceModal extends BaseModal {
    private balanceData: BalanceData;

    constructor(config: ModalConfig & { balanceData: BalanceData }, hooks: ModalHooks = {}) {
        super(config, hooks);
        this.balanceData = config.balanceData;
    }

    /**
     * Renders the modal content
     */
    public render(): HTMLElement {
        const container = createElement('div', {
            classes: ['balance-modal-container'],
            attributes: {
                style: `
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 600px;
                    width: 100%;
                `
            }
        });

        // Add title
        const title = createElement('h2', {
            classes: ['modal-title'],
            content: this.balanceData.isError ? '❌ Balance Check Failed' : '💰 OpenRouter Account Balance',
            attributes: {
                style: `
                    margin: 0 0 1.5rem 0;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: ${this.balanceData.isError ? '#dc2626' : '#1f2937'};
                `
            }
        });
        container.appendChild(title);

        // Add content area
        const contentDiv = createElement('div', {
            classes: ['balance-content'],
            attributes: {
                style: `
                    background: ${this.balanceData.isError ? '#fef2f2' : '#f9fafb'};
                    padding: 1.5rem;
                    border-radius: 0.5rem;
                    border: 1px solid ${this.balanceData.isError ? '#fecaca' : '#e5e7eb'};
                    margin-bottom: 1.5rem;
                    white-space: pre-line;
                    line-height: 1.6;
                    color: #374151;
                    font-size: 0.95rem;
                    max-height: 400px;
                    overflow-y: auto;
                `
            }
        });

        // Add the balance message
        contentDiv.textContent = this.balanceData.message;
        container.appendChild(contentDiv);

        // Add close button
        const closeButton = createElement('button', {
            classes: ['balance-close-btn'],
            content: 'Close',
            attributes: {
                style: `
                    width: 100%;
                    padding: 0.75rem 1.5rem;
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 0.5rem;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                `
            }
        });

        closeButton.addEventListener('click', () => {
            void this.close();
        });

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.background = '#2563eb';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.background = '#3b82f6';
        });

        container.appendChild(closeButton);

        return container;
    }

    /**
     * Updates the balance data and re-renders if open
     */
    public updateBalanceData(balanceData: BalanceData): void {
        this.balanceData = balanceData;
        
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
}

/**
 * Convenience function to show balance modal
 */
export function showBalanceModal(balanceData: BalanceData): BalanceModal {
    const modalConfig: ModalConfig & { balanceData: BalanceData } = {
        id: `balance-modal-${Date.now()}`,
        title: balanceData.isError ? 'Balance Check Failed' : 'Account Balance',
        maxWidth: '600px',
        maxHeight: '80vh',
        closable: true,
        backdrop: true,
        balanceData
    };

    const modal = new BalanceModal(modalConfig);
    void modal.open();
    return modal;
} 