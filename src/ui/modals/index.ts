/**
 * Modal system barrel exports
 */

// Core infrastructure
export * from './core/BaseModal';
export * from './core/ModalRegistry';
export * from './core/modal-utils';

// Modal implementations (explicit exports to avoid conflicts)
export { SettingsModal } from './SettingsModal';
export { ExportModal } from './ExportModal';
export { showGenericModal, showAlert, showConfirm, GenericModal } from './GenericModal';
export { AILogModal } from './AILogModal';
export { AddChildNodeModal } from './AddChildNodeModal';
export { KeyValidationModal } from './KeyValidationModal';
export { VersionMismatchModal } from './VersionMismatchModal';
export { ContextInfoModal } from './ContextInfoModal';
export { MigrationSelectionModal } from './MigrationSelectionModal';
export { NewProjectModal } from './NewProjectModal';
export { showViewTemplateModal } from './ViewTemplateModal';
export { CoherenceModal } from './CoherenceModal';
export { PolisherModal } from './PolisherModal';
export { NodeInspectorModal } from './NodeInspectorModal';
export { NodeInspectorModalV2 } from './NodeInspectorModalV2';

// Modal components and services
export * from './components/CriteriaEditor';
export * from './components/ProfileSelector';
export * from './services/ExportService';
export * from './services/NodeCreationService';
export * from './services/PromptManagementService';
export * from './services/SettingsService';
export * from './services/ProjectGenerationService';
export * from './services/CoherenceService';

// Types
export * from './types/ModalTypes';
export * from './types/ExportTypes';
export * from '../../types/CoherenceTypes';

// Factory
export * from './ModalFactory';

// Import functions for legacy compatibility
import { showGenericModal, showAlert, showConfirm } from './GenericModal';
import { getModalRegistry } from './core/ModalRegistry';

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
    const hooks = onOpen ? { onOpen } : {};
    showGenericModal(content, {}, hooks);
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