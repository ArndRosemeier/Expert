/**
 * Migration Selection Modal - Allows users to choose which settings to migrate during version updates
 */

import { BaseModal } from './core/BaseModal';
import { SettingsManager } from '../../SettingsManager';
import { ModelSelector } from '../../ModelSelector';
import { ModalConfig } from './types/ModalTypes';
import { createElement } from './core/modal-utils';
import { SettingsService } from './services/SettingsService';

// NEW: Import our duplication-eliminating utilities
import { 
    createButton, 
    createButtonContainer, 
    ButtonStateManager 
} from '../utils/DOMUtils';

import { 
    executeWithErrorHandling 
} from '../utils/ServiceUtils';

// Simplified types for migration to avoid complex TypeScript issues for now
export interface SimpleMigrationAnalysis {
    profileName: string;
    savedVersion: string | undefined;
    currentVersion: string;
    hasChanges: boolean;
}

export interface MigrationSelectionModalConfig extends ModalConfig {
    settingsManager: SettingsManager;
    modelSelector?: ModelSelector;
    analysis: SimpleMigrationAnalysis;
    onMigrationComplete?: () => void;
}

export class MigrationSelectionModal extends BaseModal {
    private settingsManager: SettingsManager;
    private modelSelector: ModelSelector | undefined;
    private analysis: SimpleMigrationAnalysis;
    private buttonStateManager = new ButtonStateManager();
    private onMigrationComplete: (() => void) | undefined;

    constructor(config: MigrationSelectionModalConfig) {
        super({
            ...config,
            title: 'Migrate Settings to New Version',
            id: 'migration-selection-modal',
            closable: true
        });

        this.settingsManager = config.settingsManager;
        this.modelSelector = config.modelSelector;
        this.analysis = config.analysis;
        this.onMigrationComplete = config.onMigrationComplete;
    }

    public render(): HTMLElement {
        const content = this.renderContent();
        this.addStyles(content);
        return content;
    }

    protected renderContent(): HTMLElement {
        const content = createElement('div', {
            classes: ['migration-selection-content']
        });

        const header = this.createHeader();
        const body = this.createBody();
        const footer = this.createFooter();

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);

        return content;
    }

    /**
     * Creates the modal header
     */
    private createHeader(): HTMLElement {
        const header = createElement('div', {
            classes: ['modal-header']
        });

        const title = createElement('h2', {
            content: 'Settings Migration Required',
            classes: ['modal-title']
        });

        const subtitle = createElement('p', {
            content: `Migrate settings from version ${this.analysis.savedVersion || 'unknown'} to ${this.analysis.currentVersion}`,
            classes: ['modal-subtitle']
        });

        header.appendChild(title);
        header.appendChild(subtitle);

        return header;
    }

    /**
     * Creates the modal body
     */
    private createBody(): HTMLElement {
        const body = createElement('div', {
            classes: ['modal-body']
        });

        // Info section
        const infoSection = createElement('div', {
            classes: ['info-section']
        });

        const message = createElement('p', {
            content: 'Your settings need to be updated for the new version. You can choose to:',
            classes: ['info-message']
        });

        const optionsList = createElement('ul', {
            classes: ['options-list']
        });

        const smartMigrateOption = createElement('li', {
            content: 'Smart Migration: Preserve your custom changes while updating system defaults'
        });

        const resetOption = createElement('li', {
            content: 'Reset to Defaults: Start fresh with the latest default settings'
        });

        optionsList.appendChild(smartMigrateOption);
        optionsList.appendChild(resetOption);

        const preserveNote = createElement('p', {
            content: '✅ Your API keys and model selections will be preserved in both cases.',
            classes: ['preserve-note']
        });

        infoSection.appendChild(message);
        infoSection.appendChild(optionsList);
        infoSection.appendChild(preserveNote);

        body.appendChild(infoSection);

        return body;
    }

    /**
     * Creates the modal footer with action buttons
     */
    private createFooter(): HTMLElement {
        const footer = createElement('div', {
            classes: ['modal-footer']
        });

        const buttonContainer = createElement('div', {
            classes: ['button-container']
        });

        const resetButton = createElement('button', {
            content: 'Reset to Defaults',
            classes: ['reset-button', 'secondary']
        });

        const migrateButton = createElement('button', {
            content: 'Smart Migration',
            classes: ['migrate-button', 'primary']
        });

        resetButton.addEventListener('click', () => {
            this.handleReset();
        });

        migrateButton.addEventListener('click', () => {
            this.handleSmartMigration();
        });

        buttonContainer.appendChild(migrateButton);
        buttonContainer.appendChild(resetButton);
        footer.appendChild(buttonContainer);

        return footer;
    }

    /**
     * Handle reset to defaults action
     */
    private async handleReset(): Promise<void> {
        try {
            // Show loading state using utility
            const resetButton = document.querySelector('#migration-selection-modal .reset-button') as HTMLButtonElement;
            if (resetButton) {
                this.buttonStateManager.setLoading(resetButton, 'Resetting...');
            }

            // Prepare model selections to preserve
            let preserveModels: { selectedModels?: Record<string, string>; webSearchEnabled?: Record<string, boolean> } | undefined;
            
            if (this.modelSelector) {
                const selectedModels = this.modelSelector.getSelectedModels();
                const webSearchEnabled = this.modelSelector.getWebSearchEnabled();
                
                if (Object.keys(selectedModels).length > 0) {
                    preserveModels = {
                        selectedModels,
                        webSearchEnabled
                    };
                    console.log('🔧 Preserving model selections during migration reset:', selectedModels);
                }
            }

            // Reset settings with preserved models
            await this.settingsManager.resetToDefaults(preserveModels);

            // Clear version mismatch flag
            this.settingsManager.clearVersionMismatchFlag();

            // Close modal first
            await this.close();

            // Call completion callback after modal is closed
            if (this.onMigrationComplete) {
                this.onMigrationComplete();
            }

        } catch (error) {
            console.error('Failed to reset settings:', error);
            alert('Failed to reset settings. Please try again or contact support.');
            
            // Re-enable button using utility
            const resetButton = document.querySelector('#migration-selection-modal .reset-button') as HTMLButtonElement;
            if (resetButton) {
                this.buttonStateManager.clearLoading(resetButton);
            }
        }
    }

    /**
     * Handle smart migration action
     */
    private async handleSmartMigration(): Promise<void> {
        try {
            // Show loading state using utility
            const migrateButton = document.querySelector('#migration-selection-modal .migrate-button') as HTMLButtonElement;
            if (migrateButton) {
                this.buttonStateManager.setLoading(migrateButton, 'Migrating...');
            }

            // Create SettingsService instance - use a default ModelSelector if none provided
            if (!this.modelSelector) {
                throw new Error('ModelSelector is required for smart migration');
            }
            const settingsService = new SettingsService(this.settingsManager, this.modelSelector);
            
            // Analyze migration requirements
            const migrationAnalysis = settingsService.analyzeMigration(this.analysis.profileName);
            if (!migrationAnalysis) {
                throw new Error('Failed to analyze migration requirements');
            }

            // Prepare model selections to preserve
            let preserveModels: { selectedModels?: Record<string, string>; webSearchEnabled?: Record<string, boolean> } | undefined;
            
            if (this.modelSelector) {
                const selectedModels = this.modelSelector.getSelectedModels();
                const webSearchEnabled = this.modelSelector.getWebSearchEnabled();
                
                if (Object.keys(selectedModels).length > 0) {
                    preserveModels = {
                        selectedModels,
                        webSearchEnabled
                    };
                    console.log('🔧 Preserving model selections during smart migration:', selectedModels);
                }
            }

            // Get all profiles that need migration
            const versionMismatchInfo = this.settingsManager.getVersionMismatchInfo();
            console.log('🔄 Found', versionMismatchInfo.length, 'profiles needing migration:', versionMismatchInfo.map(p => p.profileName));

            // Apply smart migration to all profiles with version mismatches
            let allSuccessful = true;
            for (const profileInfo of versionMismatchInfo) {
                console.log('🔄 Migrating profile:', profileInfo.profileName);
                
                const profileAnalysis = settingsService.analyzeMigration(profileInfo.profileName);
                if (!profileAnalysis) {
                    console.warn('⚠️ Could not analyze profile for migration:', profileInfo.profileName);
                    continue;
                }

                const profileSuccess = await settingsService.applyMigration(
                    profileInfo.profileName,
                    profileAnalysis,
                    // Only preserve models for the primary profile
                    profileInfo.profileName === this.analysis.profileName ? preserveModels : undefined
                );

                if (!profileSuccess) {
                    console.error('❌ Failed to migrate profile:', profileInfo.profileName);
                    allSuccessful = false;
                } else {
                    console.log('✅ Successfully migrated profile:', profileInfo.profileName);
                }
            }

            if (!allSuccessful) {
                throw new Error('Some profiles failed to migrate');
            }

            console.log('✅ All profiles migrated successfully');
            
            // Clear version mismatch flag
            this.settingsManager.clearVersionMismatchFlag();
            console.log('✅ Version mismatch flag cleared');

            // Show success message
            alert('Smart migration completed successfully! Your custom settings have been preserved while system defaults have been updated.');

            // Close modal first
            await this.close();

            // Call completion callback after modal is closed
            if (this.onMigrationComplete) {
                this.onMigrationComplete();
            }

        } catch (error) {
            console.error('Failed to perform smart migration:', error);
            alert('Smart migration failed: ' + (error instanceof Error ? error.message : 'Unknown error') + '\n\nPlease try "Reset to Defaults" instead.');
            
            // Re-enable button
            const migrateButton = document.querySelector('#migration-selection-modal .migrate-button') as HTMLButtonElement;
            if (migrateButton) {
                migrateButton.disabled = false;
                migrateButton.textContent = 'Smart Migration';
            }
        }
    }

    /**
     * Add custom styles for the modal
     */
    private addStyles(container: HTMLElement): void {
        const style = createElement('style', {
            content: `
                .migration-selection-modal-container {
                    max-width: 600px;
                    width: 90vw;
                }

                .migration-selection-content {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .modal-subtitle {
                    color: #666;
                    font-size: 14px;
                    margin: 5px 0 0 0;
                }

                .info-section {
                    background: #f0f8ff;
                    padding: 20px;
                    border-radius: 8px;
                    border-left: 4px solid #2196F3;
                }

                .info-message {
                    margin: 0 0 15px 0;
                    color: #1976D2;
                    font-size: 16px;
                }

                .options-list {
                    margin: 15px 0;
                    padding-left: 20px;
                }

                .options-list li {
                    margin: 8px 0;
                    color: #333;
                    line-height: 1.4;
                }

                .preserve-note {
                    margin: 15px 0 0 0;
                    color: #2e7d32;
                    font-weight: 500;
                    padding: 10px;
                    background: #e8f5e8;
                    border-radius: 4px;
                }

                .button-container {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }

                .migrate-button {
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                }

                .migrate-button:hover:not(:disabled) {
                    background: #1976D2;
                }

                .migrate-button:disabled {
                    background: #bbbbbb;
                    cursor: not-allowed;
                    opacity: 0.6;
                }

                .reset-button {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 12px 24px;
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

                @media (max-width: 600px) {
                    .button-container {
                        flex-direction: column;
                    }
                    
                    .migrate-button, .reset-button {
                        width: 100%;
                    }
                }
            `
        });

        container.appendChild(style);
    }
} 