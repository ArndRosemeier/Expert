/**
 * Modal system barrel exports
 */

// Core infrastructure
export { BaseModal } from './core/BaseModal';
export { ModalRegistry, getModalRegistry } from './core/ModalRegistry';
export * from './core/modal-utils';

// Types
export * from './types/ModalTypes';
export type { 
    ExportConfig, 
    ExportResult, 
    NodeExportData, 
    ExportGenerationOptions,
    IExportService 
} from './types/ExportTypes';
export { ExportScope, ExportFormat } from './types/ExportTypes';

// Services
export { ExportService } from './services/ExportService';

// Modal implementations
export { GenericModal, showGenericModal, showAlert, showConfirm } from './GenericModal';

// Convenience functions for backward compatibility
import { showGenericModal, showAlert, showConfirm } from './GenericModal';
import { getModalRegistry } from './core/ModalRegistry';

// Phase 2: Service Layer and Components
export { PromptManagementService } from './services/PromptManagementService';
export { SettingsService } from './services/SettingsService';
export { CriteriaEditor } from './components/CriteriaEditor';
export { ProfileSelector } from './components/ProfileSelector';

// Additional Phase 2 type exports
export type { 
    PromptManagementConfig, 
    PromptChangeEvent,
    CriteriaChangeEvent,
    ProfileSelectionEvent,
    ProfileActionEvent,
    SettingsChangeEvent,
    IPromptManagementService,
    ISettingsService,
    ICriteriaEditor,
    IProfileSelector,
    ModalFactoryConfig,
    ModalComponentConfig
} from './types/ModalTypes';

// Phase 3: Complete Modal Implementations
export { SettingsModal } from './SettingsModal';
export { ExportModal } from './ExportModal';
export { AILogModal, openAILogModal } from './AILogModal';
export { ContextInfoModal } from './ContextInfoModal';
export { AddChildNodeModal } from './AddChildNodeModal';
export { 
    ModalFactory, 
    createModalFactory,
    setDefaultModalFactory,
    getDefaultModalFactory,
    openSettingsModal,
    openExportModal,
    showAlert as factoryAlert,
    showConfirm as factoryConfirm,
    showPrompt
} from './ModalFactory';

/**
 * Legacy compatibility functions
 */

/**
 * Opens a generic modal with content (backward compatibility)
 */
export function openGenericModal(content: string, onOpen?: () => void): void {
    showGenericModal(content, {}, { onOpen });
}

/**
 * Closes all open modals (backward compatibility)
 */
export function closeGenericModal(): void {
    const registry = getModalRegistry();
    void registry.closeAll().catch(error => {
        console.error('Failed to close modals:', error);
    });
}

/**
 * Shows an alert dialog (enhanced version)
 */
export function alert(message: string, title?: string): Promise<void> {
    return new Promise((resolve) => {
        showAlert(message, title, resolve);
    });
}

/**
 * Shows a confirmation dialog (enhanced version)
 */
export function confirm(message: string, title?: string): Promise<boolean> {
    return new Promise((resolve) => {
        showConfirm(
            message, 
            title,
            () => resolve(true),
            () => resolve(false)
        );
    });
}

// Test functions removed - modal system is production ready 