/**
 * Modal Factory - Centralized modal creation and management
 */

import { SettingsModal, SettingsModalConfig } from './SettingsModal';
import { ExportModal, ExportModalConfig } from './ExportModal';
import { GenericModal } from './GenericModal';
import { getModalRegistry } from './core/ModalRegistry';
import { IModal } from './types/ModalTypes';
import { SettingsManager } from '../../SettingsManager';
import { ModelSelector } from '../../ModelSelector';
import { ProjectManager } from '../../ProjectManager';
import { DocumentNode } from '../../DocumentNode';

export interface ModalFactoryDependencies {
    settingsManager: SettingsManager;
    modelSelector: ModelSelector;
    projectManager?: ProjectManager;
    refreshGlobalProfileSelector?: () => void;
}

export interface ModalOptions {
    autoOpen?: boolean;
    replaceExisting?: boolean;
}

export class ModalFactory {
    private dependencies: ModalFactoryDependencies;
    private registry = getModalRegistry();

    constructor(dependencies: ModalFactoryDependencies) {
        this.dependencies = dependencies;
    }

    /**
     * Sets up automatic cleanup for a modal when it's closed or destroyed
     */
    private setupModalCleanup<T extends IModal>(modal: T): T {
        // Store original close method
        const originalClose = modal.close.bind(modal);
        
        // Override close method to include cleanup
        modal.close = async () => {
            await originalClose();
            // Unregister from registry after closing
            this.registry.unregister(modal.id);
        };
        
        return modal;
    }

    /**
     * Creates and optionally opens a Settings modal
     */
    public createSettingsModal(options: ModalOptions = {}): SettingsModal {
        const { autoOpen = true, replaceExisting = true } = options;

        // Close existing settings modal if requested
        if (replaceExisting) {
            const existing = this.registry.get('settings-modal');
            if (existing) {
                void existing.close();
            }
        }

        const config: SettingsModalConfig = {
            id: 'settings-modal',
            settingsManager: this.dependencies.settingsManager,
            modelSelector: this.dependencies.modelSelector,
            refreshGlobalProfileSelector: this.dependencies.refreshGlobalProfileSelector
        };

        const modal = new SettingsModal(config);
        this.registry.register(modal);

        // Set up automatic cleanup
        this.setupModalCleanup(modal);

        if (autoOpen) {
            void modal.open();
        }

        return modal;
    }

    /**
     * Creates and optionally opens an Export modal
     */
    public async createExportModal(node: DocumentNode, options: ModalOptions = {}): Promise<ExportModal> {
        const { autoOpen = true, replaceExisting = true } = options;

        if (!this.dependencies.projectManager) {
            throw new Error('ProjectManager is required for ExportModal');
        }

        // Close existing export modal if requested
        if (replaceExisting) {
            const existing = this.registry.get('export-modal');
            if (existing) {
                void existing.close();
            }
        }

        const config: ExportModalConfig = {
            id: 'export-modal',
            projectManager: this.dependencies.projectManager,
            node
        };

        const modal = new ExportModal(config);
        this.registry.register(modal);

        // Set up automatic cleanup
        this.setupModalCleanup(modal);

        if (autoOpen) {
            void modal.open();
        }

        return modal;
    }

    /**
     * Creates a generic content modal
     */
    public createGenericModal(
        content: string | { content: string; actions?: any[] },
        title?: string,
        options: ModalOptions = {}
    ): GenericModal {
        const { autoOpen = true, replaceExisting = false } = options;

        // Generate unique ID for generic modals
        const id = `generic-modal-${Date.now()}`;

        // Close existing generic modal if requested
        if (replaceExisting) {
            const existingIds = this.registry.getOpenModals()
                .filter(id => id.startsWith('generic-modal-'));
            existingIds.forEach(id => {
                const modal = this.registry.get(id);
                if (modal) void modal.close();
            });
        }

        const modal = new GenericModal({
            id,
            title,
            content: typeof content === 'string' ? { content } : content
        });

        this.registry.register(modal);

        // Set up automatic cleanup
        this.setupModalCleanup(modal);

        if (autoOpen) {
            void modal.open();
        }

        return modal;
    }

    /**
     * Shows an alert dialog
     */
    public alert(message: string, title: string = 'Alert'): Promise<void> {
        return new Promise((resolve) => {
            const modal = this.createGenericModal(
                {
                    content: `<p>${message}</p>`,
                    actions: [
                        {
                            id: 'ok',
                            label: 'OK',
                            type: 'primary',
                            handler: async () => {
                                await modal.close();
                                resolve();
                            }
                        }
                    ]
                },
                title,
                { replaceExisting: false }
            );
        });
    }

    /**
     * Shows a confirmation dialog
     */
    public confirm(
        message: string, 
        title: string = 'Confirm',
        confirmLabel: string = 'Confirm',
        cancelLabel: string = 'Cancel'
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = this.createGenericModal(
                {
                    content: `<p>${message}</p>`,
                    actions: [
                        {
                            id: 'cancel',
                            label: cancelLabel,
                            type: 'secondary',
                            handler: async () => {
                                await modal.close();
                                resolve(false);
                            }
                        },
                        {
                            id: 'confirm',
                            label: confirmLabel,
                            type: 'primary',
                            handler: async () => {
                                await modal.close();
                                resolve(true);
                            }
                        }
                    ]
                },
                title,
                { replaceExisting: false }
            );
        });
    }

    /**
     * Shows a prompt dialog for user input
     */
    public prompt(
        message: string,
        defaultValue: string = '',
        title: string = 'Input Required'
    ): Promise<string | null> {
        return new Promise((resolve) => {
            const inputId = `prompt-input-${Date.now()}`;
            
            const modal = this.createGenericModal(
                {
                    content: `
                        <p>${message}</p>
                        <input type="text" id="${inputId}" value="${defaultValue}" 
                               style="width: 100%; padding: 0.5rem; margin-top: 1rem; border: 1px solid #d1d5db; border-radius: 4px;">
                    `,
                    actions: [
                        {
                            id: 'cancel',
                            label: 'Cancel',
                            type: 'secondary',
                            handler: async () => {
                                await modal.close();
                                resolve(null);
                            }
                        },
                        {
                            id: 'ok',
                            label: 'OK',
                            type: 'primary',
                            handler: async () => {
                                const input = document.getElementById(inputId) as HTMLInputElement;
                                const value = input ? input.value : '';
                                await modal.close();
                                resolve(value);
                            }
                        }
                    ]
                },
                title,
                { replaceExisting: false }
            );

            // Focus the input after modal opens
            // Note: GenericModal doesn't support events yet, so we'll use a timeout
            setTimeout(() => {
                const input = document.getElementById(inputId) as HTMLInputElement;
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);
        });
    }

    /**
     * Closes all open modals
     */
    public async closeAll(): Promise<void> {
        await this.registry.closeAll();
    }

    /**
     * Gets a modal by ID
     */
    public getModal(id: string) {
        return this.registry.get(id);
    }

    /**
     * Gets all active modal IDs
     */
    public getActiveModalIds(): string[] {
        return this.registry.getOpenModals();
    }

    /**
     * Updates the factory dependencies
     */
    public updateDependencies(dependencies: Partial<ModalFactoryDependencies>): void {
        this.dependencies = { ...this.dependencies, ...dependencies };
    }
}

/**
 * Creates a modal factory instance with the provided dependencies
 */
export function createModalFactory(dependencies: ModalFactoryDependencies): ModalFactory {
    return new ModalFactory(dependencies);
}

// Convenience functions for backward compatibility
let defaultFactory: ModalFactory | null = null;

/**
 * Sets the default modal factory instance
 */
export function setDefaultModalFactory(factory: ModalFactory): void {
    defaultFactory = factory;
}

/**
 * Gets the default modal factory instance
 */
export function getDefaultModalFactory(): ModalFactory {
    if (!defaultFactory) {
        throw new Error('Default modal factory not set. Call setDefaultModalFactory() first.');
    }
    return defaultFactory;
}

/**
 * Convenience function to open settings modal using default factory
 */
export function openSettingsModal(): SettingsModal {
    return getDefaultModalFactory().createSettingsModal();
}

/**
 * Convenience function to open export modal using default factory
 */
export function openExportModal(node: DocumentNode): Promise<ExportModal> {
    return getDefaultModalFactory().createExportModal(node);
}

/**
 * Convenience function to show alert using default factory
 */
export function showAlert(message: string, title?: string): Promise<void> {
    return getDefaultModalFactory().alert(message, title);
}

/**
 * Convenience function to show confirmation using default factory
 */
export function showConfirm(message: string, title?: string): Promise<boolean> {
    return getDefaultModalFactory().confirm(message, title);
}

/**
 * Convenience function to show prompt using default factory
 */
export function showPrompt(message: string, defaultValue?: string, title?: string): Promise<string | null> {
    return getDefaultModalFactory().prompt(message, defaultValue, title);
} 