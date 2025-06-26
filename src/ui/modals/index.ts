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
    registry.closeAll().catch(error => {
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