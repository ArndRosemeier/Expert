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
export { showGenericModal, GenericModal } from './GenericModal';
export { AILogModal } from './AILogModal';
export { AddChildNodeModal } from './AddChildNodeModal';
// ContextInfoModal removed - using conditional context system
// Version-mismatch/migration modals removed - settings are self-healed on load
export { NewProjectModal } from './NewProjectModal';
export type { NewProjectModalConfig } from './NewProjectModal';
export { showViewTemplateModal } from './ViewTemplateModal';
export { CoherenceModal } from './CoherenceModal';
export { GenerationLevelsHelpModal } from './GenerationLevelsHelpModal';
// ContextAdjusterModal removed - using conditional context system
export { PolisherModal } from './PolisherModal';
export { NodeInspectorModal } from './NodeInspectorModal';
export { TagManagerModal } from './TagManagerModal';
export { GenerationErrorModal, type ErrorDetails } from './GenerationErrorModal';
export { ManualModal } from './ManualModal';
export { RedundancyDetectorModal } from './RedundancyDetectorModal';
export { LogicErrorDetectorModal } from './LogicErrorDetectorModal';
export { LogicOutlineFixerModal } from './LogicOutlineFixerModal';
export { ConditionalContextModal } from './ConditionalContextModal';

// Modal components and services
export * from './components/CriteriaEditor';
export * from './components/ProfileSelector';
export * from './services/ExportService';
export * from './services/NodeCreationService';
export * from './services/PromptManagementService';
export * from './services/SettingsService';
export * from './services/ProjectGenerationService';
export * from './services/CoherenceService';
// ContextAdjusterService export removed - service deleted
export * from './services/GenerationErrorService';

// Types
export * from './types/ModalTypes';
export * from '../../types/CoherenceTypes';
export * from '../../types/ContextAdjusterTypes';

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
    showGenericModal(content, {}, onOpen ? { onOpen } : {});
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
export async function alert(message: string, title?: string): Promise<void> {
    return new Promise((resolve) => {
        showAlert(message, title, resolve);
    });
}

/**
 * Shows a confirmation dialog (enhanced version)
 */
export async function confirm(message: string, title?: string): Promise<boolean> {
    return new Promise((resolve) => {
        showConfirm(
            message, 
            title,
            () => { resolve(true); },
            () => { resolve(false); }
        );
    });
}

// Test functions removed - modal system is production ready 