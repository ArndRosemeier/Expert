/**
 * Version Mismatch Modal - Warns user about outdated settings and offers to reset to defaults
 */

import { BaseModal } from './core/BaseModal';
import { SettingsManager } from '../../SettingsManager';
import { ModelSelector } from '../../ModelSelector';
import { VersionService } from '../../VersionService';
import { ModalConfig } from './types/ModalTypes';
import { createElement } from './core/modal-utils';

// NEW: Import our duplication-eliminating utilities
import { 
    createButton, 
    createButtonContainer, 
    createList, 
    createWarning,
    ButtonStateManager 
} from '../utils/DOMUtils';

import { 
    executeWithErrorHandling 
} from '../utils/ServiceUtils';

interface VersionMismatchModalConfig extends ModalConfig {
    settingsManager: SettingsManager;
    modelSelector?: ModelSelector;
    onResetComplete?: () => void;
}


export class VersionMismatchModal extends BaseModal {
    private settingsManager: SettingsManager;
    private modelSelector: ModelSelector | undefined;
    private onResetComplete: (() => void) | undefined;
    private mismatches: Array<{ profileName: string; profileVersion: string | undefined; currentVersion: string }> = [];
    private buttonStateManager = new ButtonStateManager();

    constructor(config: VersionMismatchModalConfig) {
        super({
            ...config,
            title: 'Settings Update Required',
            id: 'version-mismatch-modal',
            closable: true
        });

        this.settingsManager = config.settingsManager;
        this.modelSelector = config.modelSelector;
        this.onResetComplete = config.onResetComplete || undefined;
        this.mismatches = this.settingsManager.getVersionMismatchInfo();
    }

    /**
     * Implements IModal render method
     */
    public render(): HTMLElement {
        return this.renderContent();
    }

    /**
     * Renders the modal content
     */
    protected renderContent(): HTMLElement {
        const container = createElement('div', {
            classes: ['version-mismatch-modal-container']
        });

        // Add styles
        this.addStyles(container);

        // Create modal structure
        const header = this.createHeader();
        const body = this.createBody();
        const footer = this.createFooter();

        container.appendChild(header);
        container.appendChild(body);
        container.appendChild(footer);

        return container;
    }

    /**
     * Creates the modal header - REFACTORED using DOMUtils
     */
    private createHeader(): HTMLElement {
        const header = createElement('div', {
            classes: ['modal-header']
        });

        const title = createElement('h2', {
            content: '⚠️ Settings Update Required'
        });

        const closeButton = createButton('×', {
            classes: ['close-button'],
            onClick: () => this.handleClose()
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        return header;
    }

    /**
     * Creates the modal body
     */
    private createBody(): HTMLElement {
        const body = createElement('div', {
            classes: ['modal-body']
        });

        // Version info section
        const versionInfo = createElement('div', {
            classes: ['version-info-section']
        });

        const currentVersionLabel = createElement('p', {
            content: `Current Application Version: ${VersionService.getFullVersion()}`,
            classes: ['current-version']
        });

        versionInfo.appendChild(currentVersionLabel);

        // Mismatch explanation
        const explanation = createElement('div', {
            classes: ['explanation']
        });

        const mainMessage = createElement('p', {
            content: 'Your saved settings were created with an older version of the application. This may cause compatibility issues with new features and updated prompts.',
            classes: ['main-message']
        });

        explanation.appendChild(mainMessage);

        // Mismatch details - REFACTORED using DOMUtils
        if (this.mismatches.length > 0) {
            const detailsTitle = createElement('h4', {
                content: 'Profile Version Details:'
            });

            const mismatchItems = this.mismatches.map(mismatch => 
                `Profile "${mismatch.profileName}": ${mismatch.profileVersion || 'No version info'} → ${mismatch.currentVersion}`
            );
            
            const detailsList = createList({
                items: mismatchItems,
                classes: ['mismatch-details']
            });

            explanation.appendChild(detailsTitle);
            explanation.appendChild(detailsList);
        }

        // Recommendations
        const recommendations = createElement('div', {
            classes: ['recommendations']
        });

        const recommendTitle = createElement('h4', {
            content: 'Recommended Action:'
        });

        const recommendText = createElement('p', {
            content: 'We recommend resetting your settings to defaults to ensure you have the latest prompts, quality criteria, and feature configurations. This will:'
        });

        const benefits = [
            'Update all prompts to the latest versions',
            'Reset quality criteria to current best practices',
            'Ensure compatibility with new features',
            'Remove potential conflicts from old settings'
        ];

        const benefitsList = createList({
            items: benefits,
            classes: ['benefits-list']
        });

        const warningText = createWarning(
            'Note: This will reset all your custom settings, including any modified prompts and criteria. Your API keys and model selections will be preserved.',
            'warning'
        );

        recommendations.appendChild(recommendTitle);
        recommendations.appendChild(recommendText);
        recommendations.appendChild(benefitsList);
        recommendations.appendChild(warningText);

        body.appendChild(versionInfo);
        body.appendChild(explanation);
        body.appendChild(recommendations);

        return body;
    }

    /**
     * Creates the modal footer with action buttons - REFACTORED using DOMUtils
     */
    private createFooter(): HTMLElement {
        const footer = createElement('div', {
            classes: ['modal-footer']
        });

        const resetButton = createButton('Reset to Defaults (Recommended)', {
            classes: ['reset-button', 'primary'],
            type: 'primary',
            onClick: () => this.handleReset()
        });

        const continueButton = createButton('Continue with Current Settings', {
            classes: ['continue-button', 'secondary'],
            type: 'secondary',
            onClick: () => this.handleContinue()
        });

        const buttonContainer = createButtonContainer([resetButton, continueButton]);
        footer.appendChild(buttonContainer);

        return footer;
    }

    /**
     * Handle reset to defaults action - REFACTORED using ServiceUtils
     */
    private async handleReset(): Promise<void> {
        const resetButton = document.querySelector('#version-mismatch-modal .reset-button') as HTMLButtonElement;
        if (!resetButton) return;

        // Show loading state
        this.buttonStateManager.setLoading(resetButton, 'Resetting...');

        const result = await executeWithErrorHandling(
            async () => {
                // Prepare model selections to preserve
                let preserveModels: { selectedModels?: Record<string, string>; webSearchEnabled?: Record<string, boolean> } | undefined;
                
                if (this.modelSelector) {
                    const selectedModels = this.modelSelector.getSelectedModels();
                    const webSearchEnabled = this.modelSelector.getWebSearchEnabled();
                    
                    // Only preserve if we have actual model selections
                    if (Object.keys(selectedModels).length > 0) {
                        preserveModels = {
                            selectedModels,
                            webSearchEnabled
                        };
                        console.log('🔧 Preserving model selections during reset:', selectedModels);
                    }
                }

                // Reset settings with preserved models
                await this.settingsManager.resetToDefaults(preserveModels);

                // Clear version mismatch flag
                this.settingsManager.clearVersionMismatchFlag();

                return { success: true, message: 'Settings reset successfully' };
            },
            'Failed to reset settings. Please try again or contact support.'
        );

        // Clear loading state
        this.buttonStateManager.clearLoading(resetButton);

        if (result.success) {
            // Emit event
            this.emit('resetAccepted', undefined);

            // Call completion callback
            if (this.onResetComplete) {
                this.onResetComplete();
            }

            // Close modal
            void this.close();
        }
    }

    /**
     * Handle continue with current settings
     */
    private handleContinue(): void {
        // Clear version mismatch flag so it doesn't show again this session
        this.settingsManager.clearVersionMismatchFlag();

        // Emit event
        this.emit('resetDeclined', undefined);

        // Close modal
        void this.close();
    }

    /**
     * Handle modal close
     */
    private handleClose(): void {
        this.emit('closed', undefined);
        void this.close();
    }

    /**
     * Simple emit method for compatibility
     */
    private emit(eventName: string, data?: any): void {
        // Silent event emitter stub
        console.log(`VersionMismatchModal event: ${eventName}`, data);
    }

    /**
     * Add custom styles for the modal
     */
    private addStyles(container: HTMLElement): void {
        const style = createElement('style', {
            content: `
                .version-mismatch-modal-container {
                    max-width: 600px;
                    width: 90vw;
                }

                .version-info-section {
                    background: #f0f8ff;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border-left: 4px solid #2196F3;
                }

                .current-version {
                    font-weight: bold;
                    color: #1976D2;
                    margin: 0;
                }

                .explanation {
                    margin-bottom: 20px;
                }

                .main-message {
                    font-size: 16px;
                    line-height: 1.5;
                    color: #333;
                }

                .mismatch-details {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 4px;
                    padding: 10px 15px;
                    margin: 10px 0;
                }

                .mismatch-details li {
                    font-family: monospace;
                    font-size: 14px;
                    color: #856404;
                }

                .recommendations {
                    background: #d4edda;
                    padding: 15px;
                    border-radius: 8px;
                    border-left: 4px solid #28a745;
                }

                .benefits-list {
                    margin: 10px 0;
                }

                .benefits-list li {
                    margin: 5px 0;
                    color: #155724;
                }

                .warning-text {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 4px;
                    padding: 10px;
                    margin-top: 15px;
                    font-size: 14px;
                    color: #856404;
                }

                .button-container {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    flex-wrap: wrap;
                }

                .reset-button {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                }

                .reset-button:hover {
                    background: #218838;
                }

                .reset-button:disabled {
                    background: #6c757d;
                    cursor: not-allowed;
                }

                .continue-button {
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }

                .continue-button:hover {
                    background: #5a6268;
                }

                @media (max-width: 600px) {
                    .button-container {
                        flex-direction: column;
                    }
                    
                    .reset-button, .continue-button {
                        width: 100%;
                    }
                }
            `
        });

        container.appendChild(style);
    }
} 