/**
 * AI Log Modal - Shows AI conversation logs in a modern modal
 */

import { BaseModal } from './core/BaseModal';
import { ModalConfig, ModalHooks } from './types/ModalTypes';
import { createElement, truncateText as truncateTextGlobal } from './core/modal-utils';
import { AILogService } from '../../AILogService';

export interface AILogModalConfig extends ModalConfig {
    // No additional config needed for now
}

export class AILogModal extends BaseModal {
    private aiLogService: AILogService;
    private loadingDiv: HTMLElement | null = null;
    private contentDiv: HTMLElement | null = null;

    constructor(config: AILogModalConfig = { id: 'ai-log-modal' }, hooks: ModalHooks = {}) {
        super({
            ...config,
            title: 'AI Request Log',
            maxWidth: '1200px',
            width: '95vw',
            maxHeight: '90vh'
        }, {
            ...hooks,
            onOpen: async () => {
                await hooks.onOpen?.();
                // Load logs after modal is in DOM
                await this.loadLogs();
            }
        });
        
        this.aiLogService = AILogService.getInstance();
    }

    /**
     * Renders the modal content
     */
    public render(): HTMLElement {
        const container = createElement('div', {
            classes: ['ai-log-modal-container'],
            attributes: {
                style: `
                    display: flex;
                    flex-direction: column;
                    height: 85vh;
                    min-height: 600px;
                `
            }
        });

        // Create header
        const header = this.createHeader();
        container.appendChild(header);

        // Create body
        const body = this.createBody();
        container.appendChild(body);

        return container;
    }

    /**
     * Creates the modal header with controls
     */
    private createHeader(): HTMLElement {
        const header = createElement('div', {
            classes: ['ai-log-header'],
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
            content: 'AI Request Log',
            attributes: {
                style: `
                    margin: 0;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #1f2937;
                `
            }
        });

        const controls = createElement('div', {
            classes: ['ai-log-controls'],
            attributes: {
                style: `
                    display: flex;
                    gap: 0.75rem;
                `
            }
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
                    transition: background-color 0.2s;
                `
            }
        });

        clearButton.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all AI logs? This action cannot be undone.')) {
                try {
                    await this.aiLogService.clearAllLogs();
                    await this.loadLogs(); // Reload logs after clearing
                } catch (error) {
                    console.error('Failed to clear AI logs:', error);
                    alert('Failed to clear logs. Please try again.');
                }
            }
        });

        clearButton.addEventListener('mouseenter', () => {
            clearButton.style.backgroundColor = '#dc2626';
        });

        clearButton.addEventListener('mouseleave', () => {
            clearButton.style.backgroundColor = '#ef4444';
        });

        controls.appendChild(clearButton);
        header.appendChild(title);
        header.appendChild(controls);

        return header;
    }

    /**
     * Creates the modal body
     */
    private createBody(): HTMLElement {
        const body = createElement('div', {
            classes: ['ai-log-body'],
            attributes: {
                style: `
                    flex: 1;
                    overflow-y: auto;
                    min-height: 0;
                `
            }
        });

        // Loading state
        this.loadingDiv = createElement('div', {
            classes: ['loading-state'],
            attributes: {
                id: 'log-loading',
                style: `
                    text-align: center;
                    padding: 3rem 2rem;
                    color: #6b7280;
                `
            },
            content: '<p>Loading AI logs...</p>'
        });

        // Content div
        this.contentDiv = createElement('div', {
            attributes: {
                id: 'log-content',
                style: 'display: none;'
            }
        });

        body.appendChild(this.loadingDiv);
        body.appendChild(this.contentDiv);

        return body;
    }

    /**
     * Loads and displays AI logs
     */
    private async loadLogs(): Promise<void> {
        if (!this.loadingDiv || !this.contentDiv) {
            console.error('Modal elements not initialized');
            return;
        }

        try {
            this.loadingDiv.style.display = 'block';
            this.contentDiv.style.display = 'none';

            console.log('Loading AI logs...');
            const logs = await this.aiLogService.getAllLogs();
            console.log('Loaded logs:', logs.length, 'entries');

            this.loadingDiv.style.display = 'none';
            this.contentDiv.style.display = 'block';

            if (logs.length === 0) {
                this.contentDiv.innerHTML = `
                    <div class="empty-state" style="text-align: center; padding: 3rem 2rem; color: #6b7280;">
                        <h3 style="margin: 0 0 0.5rem 0; color: #374151;">No AI logs found</h3>
                        <p>Enable AI logging in settings to start collecting request logs.</p>
                    </div>
                `;
                return;
            }

            this.renderLogsTable(this.contentDiv, logs);

        } catch (error) {
            console.error('Failed to load AI logs:', error);
            this.loadingDiv.style.display = 'none';
            this.contentDiv.style.display = 'block';
            this.contentDiv.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 3rem 2rem; color: #6b7280;">
                    <h3 style="margin: 0 0 0.5rem 0; color: #374151;">Error loading logs</h3>
                    <p>Failed to load AI logs. Please try again. Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
                </div>
            `;
        }
    }

    /**
     * Renders the logs table
     */
    private renderLogsTable(container: HTMLElement, logs: any[]): void {
        const tableHTML = `
            <table class="ai-log-table" style="
                width: 100%;
                border-collapse: collapse;
                font-size: 0.875rem;
                background-color: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
            ">
                <thead>
                    <tr>
                        <th style="background-color: #f3f4f6; color: #374151; font-weight: 600; padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Timestamp</th>
                        <th style="background-color: #f3f4f6; color: #374151; font-weight: 600; padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Purpose</th>
                        <th style="background-color: #f3f4f6; color: #374151; font-weight: 600; padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Model</th>
                        <th style="background-color: #f3f4f6; color: #374151; font-weight: 600; padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Duration</th>
                        <th style="background-color: #f3f4f6; color: #374151; font-weight: 600; padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Prompt</th>
                        <th style="background-color: #f3f4f6; color: #374151; font-weight: 600; padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Response</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => `
                        <tr style="transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='white'">
                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; width: 150px; white-space: nowrap; color: #6b7280;">${this.formatTimestamp(log.timestamp)}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; width: 120px; font-weight: 500; color: #3b82f6;">${this.escapeHtml(log.purpose)}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; width: 150px; color: #6b7280; font-family: monospace; font-size: 0.8rem;">${this.escapeHtml(log.model)}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; width: 80px; text-align: right; color: #6b7280;">${log.requestDuration}ms</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; max-width: 300px; word-wrap: break-word; position: relative;">
                                <div class="log-text" data-full-content="${this.escapeHtmlAttribute(log.prompt)}" data-type="prompt" style="
                                    max-height: 100px;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    display: -webkit-box;
                                    -webkit-line-clamp: 4;
                                    -webkit-box-orient: vertical;
                                    cursor: pointer;
                                    color: #374151;
                                    transition: background-color 0.2s;
                                " onmouseover="this.style.backgroundColor='#f3f4f6'; this.style.borderRadius='4px'" onmouseout="this.style.backgroundColor='transparent'">
                                    ${this.formatXMLContent(this.truncateText(log.prompt, 200))}
                                </div>
                            </td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; max-width: 300px; word-wrap: break-word; position: relative;">
                                <div class="log-text ${log.response.startsWith('ERROR:') ? 'error-response' : ''}" data-full-content="${this.escapeHtmlAttribute(log.response)}" data-type="response" style="
                                    max-height: 100px;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    display: -webkit-box;
                                    -webkit-line-clamp: 4;
                                    -webkit-box-orient: vertical;
                                    cursor: pointer;
                                    color: ${log.response.startsWith('ERROR:') ? '#ef4444' : '#374151'};
                                    font-style: ${log.response.startsWith('ERROR:') ? 'italic' : 'normal'};
                                    transition: background-color 0.2s;
                                " onmouseover="this.style.backgroundColor='#f3f4f6'; this.style.borderRadius='4px'" onmouseout="this.style.backgroundColor='transparent'">
                                    ${this.formatXMLContent(this.truncateText(log.response, 200))}
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = tableHTML;
        this.setupLogTextHandlers(container);
    }

    /**
     * Sets up click handlers for log text elements
     */
    private setupLogTextHandlers(container: HTMLElement): void {
        const logTexts = container.querySelectorAll('.log-text');
        logTexts.forEach(element => {
            // Single click for expand/collapse
            element.addEventListener('click', function(this: HTMLElement) {
                this.classList.toggle('expanded');
                if (this.classList.contains('expanded')) {
                    this.style.maxHeight = 'none';
                    this.style.webkitLineClamp = 'none';
                } else {
                    this.style.maxHeight = '100px';
                    this.style.webkitLineClamp = '4';
                }
            });

            // Double click for overlay
            element.addEventListener('dblclick', (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                const fullContent = (e.currentTarget as HTMLElement).getAttribute('data-full-content') || '';
                const contentType = (e.currentTarget as HTMLElement).getAttribute('data-type') || 'content';
                this.showFormattedLogOverlay(fullContent, contentType);
            });
        });
    }

    /**
     * Helper methods
     */
    private formatTimestamp(timestamp: Date): string {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    private truncateText(text: string, maxLength: number): string {
        return truncateTextGlobal(text, maxLength);
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private escapeHtmlAttribute(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Format text with XML syntax highlighting while keeping it safe
     */
    private formatXMLContent(text: string): string {
        // First escape for safety
        let escaped = this.escapeHtml(text);
        
        // Then add XML syntax highlighting
        // Highlight XML tags
        escaped = escaped.replace(
            /&lt;(\/?)(character|location|item|plot_point|context|refresh|edit|delete|rename)([^&]*?)&gt;/g,
            (_match, slash, tagName, attributes) => {
                const color = this.getXMLTagColor(tagName);
                return `<span style="color: ${color}; font-weight: 600;">&lt;${slash}${tagName}${attributes}&gt;</span>`;
            }
        );
        
        // Highlight XML attributes
        escaped = escaped.replace(
            /(\w+)=(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,
            '<span style="color: #059669;">$1</span>=<span style="color: #dc2626;">$2</span>'
        );
        
        return escaped;
    }

    /**
     * Get color for XML tag types
     */
    private getXMLTagColor(tagName: string): string {
        switch (tagName) {
            case 'character': return '#8b5cf6'; // purple
            case 'location': return '#06b6d4';  // cyan
            case 'item': return '#f59e0b';      // amber
            case 'plot_point': return '#10b981'; // emerald
            case 'context': return '#6366f1';   // indigo
            case 'refresh':
            case 'edit':
            case 'delete':
            case 'rename': return '#ef4444';    // red
            default: return '#6b7280';          // gray
        }
    }

    /**
     * Show formatted log overlay with XML syntax highlighting
     */
    private showFormattedLogOverlay(content: string, contentType: string): void {
        // Close any existing overlay
        const existingOverlay = document.querySelector('.log-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const overlay = createElement('div', {
            classes: ['log-overlay'],
            attributes: {
                style: `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background-color: rgba(0, 0, 0, 0.75);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 30000;
                `
            }
        });

        const capitalizedType = contentType.charAt(0).toUpperCase() + contentType.slice(1);
        const formattedContent = this.formatXMLContent(content);
        
        overlay.innerHTML = `
            <div class="log-overlay-content" style="
                width: 95vw;
                max-width: 1200px;
                height: 85vh;
                background-color: white;
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            ">
                <div class="log-overlay-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem 2rem;
                    border-bottom: 1px solid #e5e7eb;
                    background-color: #f9fafb;
                    border-radius: 12px 12px 0 0;
                ">
                    <h3 style="
                        font-size: 1.25rem;
                        font-weight: 600;
                        color: #1f2937;
                        margin: 0;
                    ">AI Log - ${capitalizedType}</h3>
                    <button class="log-overlay-close" style="
                        background-color: #ef4444;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        width: 32px;
                        height: 32px;
                        cursor: pointer;
                        font-size: 1.2rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: background-color 0.2s;
                    ">&times;</button>
                </div>
                <div class="log-overlay-body" style="
                    flex: 1;
                    padding: 1.5rem 2rem;
                    overflow-y: auto;
                ">
                    <div class="log-overlay-text" style="
                        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                        font-size: 0.9rem;
                        line-height: 1.6;
                        color: #374151;
                        white-space: pre-wrap;
                        word-break: break-word;
                        background-color: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 1.5rem;
                    ">${formattedContent}</div>
                </div>
            </div>
        `;

        // Close on background click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // Close button handler
        const closeButton = overlay.querySelector('.log-overlay-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => { overlay.remove(); });
            
            closeButton.addEventListener('mouseenter', () => {
                (closeButton as HTMLElement).style.backgroundColor = '#dc2626';
            });
            
            closeButton.addEventListener('mouseleave', () => {
                (closeButton as HTMLElement).style.backgroundColor = '#ef4444';
            });
        }

        // Close on Escape key
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        
        document.addEventListener('keydown', handleKeydown);

        document.body.appendChild(overlay);
    }
}



/**
 * Convenience function to open the AI Log modal
 */
export function openAILogModal(): void {
    const modal = new AILogModal();
    void modal.open().catch(error => {
        console.error('❌ Failed to open AI Log modal:', error);
    });
} 