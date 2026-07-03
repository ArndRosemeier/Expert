/**
 * Shared prompt modal for naming an explicit snapshot version.
 *
 * Used by both the node chat editor (XMLStoryModal) and the node inspector so
 * that "save as a new version" behaves identically in both places. Resolves to
 * the chosen name, or null if the user cancels / dismisses the modal.
 */

import { showGenericModal } from './GenericModal';
import type { GenericModalContent } from './types/ModalTypes';

/**
 * Escapes a string for safe use inside a double-quoted HTML attribute.
 */
function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Opens a small modal asking the user to name a new version.
 * @param defaultName Pre-filled, pre-selected sensible default name.
 * @returns The trimmed name to use, or null if cancelled/dismissed. An empty
 *          submission falls back to the provided default name.
 */
export async function promptForVersionName(defaultName: string): Promise<string | null> {
    return await new Promise<string | null>((resolve) => {
        let settled = false;
        const inputId = `version-name-input-${Date.now()}`;

        const finish = (value: string | null): void => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const readValue = (): string => {
            const input = document.getElementById(inputId) as HTMLInputElement | null;
            if (!input) {
                throw new Error('VersionNameModal: name input element not found.');
            }
            const trimmed = input.value.trim();
            return trimmed.length > 0 ? trimmed : defaultName;
        };

        const content: GenericModalContent = {
            content: `
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <label for="${inputId}" style="font-size: 0.9rem; color: #374151;">Version name</label>
                    <input id="${inputId}" type="text" value="${escapeAttribute(defaultName)}"
                        style="padding: 0.5rem 0.75rem; border: 1.5px solid #d1d5db; border-radius: 0.5rem; font-size: 0.95rem; background: #fff;" />
                </div>
            `,
            actions: [
                {
                    id: 'cancel',
                    label: 'Cancel',
                    type: 'outline',
                    handler: () => { finish(null); }
                },
                {
                    id: 'save',
                    label: 'Save version',
                    type: 'primary',
                    handler: () => { finish(readValue()); }
                }
            ]
        };

        const modal = showGenericModal(
            content,
            { title: 'Save as new version', maxWidth: '420px' },
            // Dismissing via backdrop or the close button resolves as a cancel.
            { onClose: () => { finish(null); } }
        );

        // Focus + select the default so the user can immediately overtype, and
        // allow Enter to confirm.
        setTimeout(() => {
            const input = document.getElementById(inputId) as HTMLInputElement | null;
            if (!input) return;
            input.focus();
            input.select();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    finish(readValue());
                    void modal.close();
                }
            });
        }, 50);
    });
}
