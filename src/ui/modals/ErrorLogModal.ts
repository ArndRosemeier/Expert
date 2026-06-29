/**
 * Error Log Modal - Displays captured runtime errors and lets the user
 * export them as JSON or clear the log.
 */

import { BaseModal } from './core/BaseModal';
import { ModalConfig, ModalHooks } from './types/ModalTypes';
import { createElement } from './core/modal-utils';
import { ErrorLogService } from '../../ErrorLogService';
import { ErrorLogEntry } from '../../types';

export type ErrorLogModalConfig = ModalConfig;

export class ErrorLogModal extends BaseModal {
    private errorLogService: ErrorLogService;
    private loadingDiv: HTMLElement | null = null;
    private contentDiv: HTMLElement | null = null;

    constructor(config: ErrorLogModalConfig = { id: 'error-log-modal' }, hooks: ModalHooks = {}) {
        super({
            ...config,
            title: 'Error Log',
            maxWidth: '1200px',
            width: '95vw',
            maxHeight: '90vh'
        }, {
            ...hooks,
            onOpen: async () => {
                await hooks.onOpen?.();
                await this.loadLogs();
            }
        });

        this.errorLogService = ErrorLogService.getInstance();
    }

    public render(): HTMLElement {
        const container = createElement('div', {
            classes: ['error-log-modal-container'],
            attributes: {
                style: 'display: flex; flex-direction: column; height: 85vh; min-height: 600px;'
            }
        });

        container.appendChild(this.createHeader());
        container.appendChild(this.createBody());

        return container;
    }

    private createHeader(): HTMLElement {
        const header = createElement('div', {
            classes: ['error-log-header'],
            attributes: {
                style: `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 0;
                    border-bottom: 1px solid #e5e7eb;
                    margin-bottom: 1.5rem;
                `
            }
        });

        const title = createElement('h2', {
            content: 'Error Log',
            attributes: { style: 'margin: 0; font-size: 1.5rem; font-weight: 600; color: #1f2937;' }
        });

        const controls = createElement('div', {
            classes: ['error-log-controls'],
            attributes: { style: 'display: flex; gap: 0.75rem;' }
        });

        const exportButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Export JSON',
            attributes: {
                style: `
                    padding: 0.5rem 1rem;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    background-color: #f9fafb;
                    color: #374151;
                `
            }
        });
        exportButton.addEventListener('click', () => {
            void this.exportLogs();
        });

        const clearButton = createElement('button', {
            classes: ['btn-danger'],
            content: 'Clear Log',
            attributes: {
                style: `
                    padding: 0.5rem 1rem;
                    border: none;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    background-color: #ef4444;
                    color: white;
                `
            }
        });
        clearButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the error log? This action cannot be undone.')) {
                void (async () => {
                    await this.errorLogService.clearAllLogs();
                    await this.loadLogs();
                })();
            }
        });

        controls.appendChild(exportButton);
        controls.appendChild(clearButton);
        header.appendChild(title);
        header.appendChild(controls);

        return header;
    }

    private createBody(): HTMLElement {
        const body = createElement('div', {
            classes: ['error-log-body'],
            attributes: { style: 'flex: 1; overflow-y: auto; min-height: 0;' }
        });

        this.loadingDiv = createElement('div', {
            classes: ['loading-state'],
            attributes: { style: 'text-align: center; padding: 3rem 2rem; color: #6b7280;' },
            content: '<p>Loading error log...</p>'
        });

        this.contentDiv = createElement('div', {
            attributes: { style: 'display: none;' }
        });

        body.appendChild(this.loadingDiv);
        body.appendChild(this.contentDiv);

        return body;
    }

    private async loadLogs(): Promise<void> {
        if (!this.loadingDiv || !this.contentDiv) {
            console.error('Error log modal elements not initialized');
            return;
        }

        this.loadingDiv.style.display = 'block';
        this.contentDiv.style.display = 'none';

        const logs = await this.errorLogService.getAllLogs();

        this.loadingDiv.style.display = 'none';
        this.contentDiv.style.display = 'block';

        if (logs.length === 0) {
            this.contentDiv.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 3rem 2rem; color: #6b7280;">
                    <h3 style="margin: 0 0 0.5rem 0; color: #374151;">No errors logged</h3>
                    <p>Captured runtime errors will appear here.</p>
                </div>
            `;
            return;
        }

        this.renderLogsTable(this.contentDiv, logs);
    }

    private renderLogsTable(container: HTMLElement, logs: ErrorLogEntry[]): void {
        const headerCell = 'background-color: #f3f4f6; color: #374151; font-weight: 600; padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap;';
        const bodyCell = 'padding: 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top;';

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem; background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr>
                        <th style="${headerCell}">Timestamp</th>
                        <th style="${headerCell}">Source</th>
                        <th style="${headerCell}">Message</th>
                        <th style="${headerCell}">Details</th>
                        <th style="${headerCell}">Stack</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => `
                        <tr>
                            <td style="${bodyCell} width: 150px; white-space: nowrap; color: #6b7280;">${this.formatTimestamp(log.timestamp)}</td>
                            <td style="${bodyCell} width: 140px; font-weight: 500; color: #b45309; font-family: monospace; font-size: 0.8rem;">${this.escapeHtml(log.source)}</td>
                            <td style="${bodyCell} max-width: 360px; word-wrap: break-word; color: #b91c1c;">${this.escapeHtml(log.message)}</td>
                            <td style="${bodyCell} max-width: 220px; word-wrap: break-word; color: #6b7280; font-family: monospace; font-size: 0.8rem;">${this.escapeHtml(log.details ?? '')}</td>
                            <td style="${bodyCell} max-width: 360px;">
                                ${log.stack ? `<pre style="margin: 0; max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 0.75rem; color: #374151;">${this.escapeHtml(log.stack)}</pre>` : '<span style="color: #9ca3af;">—</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Serialize all entries to a downloadable JSON file.
     */
    private async exportLogs(): Promise<void> {
        const logs = await this.errorLogService.getAllLogs();
        const json = JSON.stringify(logs, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `error-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }

    private formatTimestamp(timestamp: Date): string {
        return new Date(timestamp).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

/**
 * Convenience function to open the Error Log modal.
 */
export function openErrorLogModal(): void {
    const modal = new ErrorLogModal();
    void modal.open().catch(error => {
        console.error('Failed to open Error Log modal:', error);
    });
}
