/**
 * Modal system barrel exports
 */

// Core infrastructure
export * from './core/BaseModal';
export * from './core/ModalRegistry';
export * from './core/modal-utils';

// Modal implementations
export * from './SettingsModal';
export * from './ExportModal';
export * from './GenericModal';
export * from './AILogModal';
export * from './AddChildNodeModal';
export * from './KeyValidationModal';
export * from './VersionMismatchModal';
export * from './ContextInfoModal';
export * from './MigrationSelectionModal';

// Modal components and services
export * from './components/CriteriaEditor';
export * from './components/ProfileSelector';
export * from './services/ExportService';
export * from './services/NodeCreationService';
export * from './services/PromptManagementService';
export * from './services/SettingsService';

// Types
export * from './types/ModalTypes';
export * from './types/ExportTypes';

// Factory
export * from './ModalFactory';

/**
 * Additional Phase 2 type exports
 */
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