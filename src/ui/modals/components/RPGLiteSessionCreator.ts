/**
 * RPGLite Session Creator Component
 * 
 * Allows creating story outlines from existing RPGLite sessions
 * by selecting a session and template, then using AI to convert
 * the conversation into a structured outline.
 */

import { ProjectTemplate } from '../../../ProjectTemplate';
import { TemplateSelector } from '../../components/TemplateSelector';
import { StorageService } from '../../../StorageService';
import { SessionToOutlineService, ConversionProgress } from '../services/SessionToOutlineService';
import type { RPGLiteSession } from '../../../rpg-lite/types/RPGLiteTypes';
import * as state from '../../../state';

export interface RPGLiteSessionCreatorConfig {
    onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => void;
}

export class RPGLiteSessionCreator {
    private config: RPGLiteSessionCreatorConfig;
    private container: HTMLElement | null = null;
    private cleanupHandlers: (() => void)[] = [];
    private sessions: RPGLiteSession[] = [];
    private selectedSessionId: string | null = null;
    private templateSelector: TemplateSelector | null = null;
    private selectedTemplate: ProjectTemplate | null = null;
    private isConverting = false;

    constructor(config: RPGLiteSessionCreatorConfig) {
        this.config = config;
    }

    public async render(): Promise<string> {
        // Load sessions
        const storage = await StorageService.getInstance();
        this.sessions = await storage.listRPGLiteSessions<RPGLiteSession>();
        this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);

        if (this.sessions.length === 0) {
            return `
                <div class="rpglite-session-creator">
                    <div class="no-sessions-message">
                        <p>No RPGLite sessions found. Create a session in RPGLite first.</p>
                    </div>
                </div>
            `;
        }

        const sessionsHtml = this.sessions.map((session, index) => {
            const lastUpdated = this.formatRelativeTime(session.updatedAt);
            const messageCount = session.conversation.length;
            
            return `
                <div class="session-card" data-session-id="${session.id}">
                    <input type="radio" 
                           name="rpglite-session" 
                           id="session-${session.id}" 
                           value="${session.id}"
                           ${index === 0 ? 'checked' : ''}>
                    <label for="session-${session.id}" class="session-label">
                        <div class="session-title">${this.escapeHtml(session.title)}</div>
                        <div class="session-meta">
                            <span class="session-updated">${lastUpdated}</span>
                            <span class="session-messages">${messageCount} messages</span>
                        </div>
                    </label>
                </div>
            `;
        }).join('');

        // Pre-select first session
        if (this.sessions.length > 0 && this.sessions[0]) {
            this.selectedSessionId = this.sessions[0].id;
        }

        return `
            <div class="rpglite-session-creator">
                <div class="form-group template-section" style="margin-bottom: 1.5rem;">
                    <div id="rpglite-template-selector"></div>
                </div>

                <div class="form-group sessions-section" style="margin-bottom: 1.5rem;">
                    <label class="section-label">Select RPGLite Session</label>
                    <div class="sessions-list">
                        ${sessionsHtml}
                    </div>
                </div>

                <div class="progress-container" id="rpglite-progress-container" style="display: none; margin-bottom: 1.5rem;">
                    <div class="progress-message" id="rpglite-progress-message">Preparing...</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" id="rpglite-progress-bar" style="width: 0%"></div>
                    </div>
                </div>

                <div class="button-row" style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem;">
                    <button id="rpglite-cancel-btn" class="button button-secondary">Cancel</button>
                    <button id="rpglite-create-btn" class="button button-primary">Create Outline from Session</button>
                </div>

                <style>
                    .rpglite-session-creator {
                        padding: 1rem;
                        max-width: 90%;
                        margin: 0 auto;
                    }

                    .no-sessions-message {
                        text-align: center;
                        padding: 2rem;
                        color: #666;
                    }

                    .template-section {
                        background: #f8f9fa;
                        padding: 1rem;
                        border-radius: 8px;
                        border: 1px solid #e9ecef;
                    }

                    .section-label {
                        display: block;
                        font-weight: 600;
                        margin-bottom: 0.75rem;
                        color: #333;
                    }

                    .sessions-list {
                        max-height: 400px;
                        overflow-y: auto;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        padding: 0.5rem;
                        background: #fff;
                    }

                    .session-card {
                        display: flex;
                        align-items: center;
                        padding: 0.75rem;
                        margin-bottom: 0.5rem;
                        border: 1px solid #e9ecef;
                        border-radius: 6px;
                        transition: all 0.2s ease;
                    }

                    .session-card:hover {
                        background: #f8f9fa;
                        border-color: #007bff;
                        cursor: pointer;
                    }

                    .session-card input[type="radio"] {
                        margin-right: 0.75rem;
                        cursor: pointer;
                    }

                    .session-card input[type="radio"]:checked + .session-label {
                        color: #007bff;
                    }

                    .session-label {
                        flex: 1;
                        cursor: pointer;
                        margin: 0;
                    }

                    .session-title {
                        font-weight: 600;
                        margin-bottom: 0.25rem;
                        font-size: 1rem;
                    }

                    .session-meta {
                        display: flex;
                        gap: 1rem;
                        font-size: 0.85rem;
                        color: #666;
                    }

                    .progress-container {
                        text-align: center;
                        padding: 1rem;
                        background: #f8f9fa;
                        border-radius: 8px;
                    }

                    .progress-message {
                        margin-bottom: 0.5rem;
                        color: #333;
                        font-weight: 500;
                    }

                    .progress-bar-container {
                        width: 100%;
                        height: 8px;
                        background: #e9ecef;
                        border-radius: 4px;
                        overflow: hidden;
                    }

                    .progress-bar {
                        height: 100%;
                        background: linear-gradient(90deg, #007bff, #0056b3);
                        transition: width 0.3s ease;
                    }
                </style>
            </div>
        `;
    }

    public setupEventListeners(container: HTMLElement): void {
        this.container = container;

        // Initialize template selector
        this.initializeTemplateSelector();

        // Session selection
        const radioButtons = container.querySelectorAll('input[name="rpglite-session"]');
        radioButtons.forEach(radio => {
            const changeHandler = (e: Event) => {
                const target = e.target as HTMLInputElement;
                this.selectedSessionId = target.value;
            };
            radio.addEventListener('change', changeHandler);
            this.cleanupHandlers.push(() => { radio.removeEventListener('change', changeHandler); });
        });

        // Create button
        const createBtn = container.querySelector('#rpglite-create-btn') as HTMLButtonElement;
        const createHandler = () => { void this.handleCreate(); };
        createBtn.addEventListener('click', createHandler);
        this.cleanupHandlers.push(() => { createBtn.removeEventListener('click', createHandler); });

        // Cancel button
        const cancelBtn = container.querySelector('#rpglite-cancel-btn') as HTMLButtonElement;
        const cancelHandler = () => { this.handleCancel(); };
        cancelBtn.addEventListener('click', cancelHandler);
        this.cleanupHandlers.push(() => { cancelBtn.removeEventListener('click', cancelHandler); });
    }

    private initializeTemplateSelector(): void {
        this.templateSelector = new TemplateSelector({
            containerId: 'rpglite-template-selector',
            label: 'Project Template',
            helpText: 'Choose a template for the outline structure',
            showManagement: false,
            onSelectionChange: (template) => {
                this.selectedTemplate = template;
            }
        });

        this.templateSelector.render();

        // Get initial selection
        const templateManager = state.getTemplateManager();
        const templateNames = templateManager?.getTemplateNames() ?? [];
        const defaultTemplate = templateNames.includes('Short Story') ? 'Short Story' : templateNames[0];
        if (defaultTemplate) {
            this.selectedTemplate = templateManager?.getTemplate(defaultTemplate) ?? null;
        }
    }

    private async handleCreate(): Promise<void> {
        if (!this.container || this.isConverting) return;

        // Validate selection
        if (!this.selectedSessionId) {
            alert('Please select a session.');
            return;
        }

        if (!this.selectedTemplate) {
            alert('Please select a template.');
            return;
        }

        // Load the full session
        const storage = await StorageService.getInstance();
        const session = await storage.loadRPGLiteSession<RPGLiteSession>(this.selectedSessionId);

        if (!session) {
            alert('Failed to load session.');
            return;
        }

        // Show progress UI
        this.isConverting = true;
        this.showProgress(true);
        this.setButtonsEnabled(false);

        try {
            // Convert session to outline
            const service = new SessionToOutlineService();
            const result = await service.convertSessionToOutline(
                session,
                (progress) => { this.updateProgress(progress); }
            );

            // Create AI data object similar to other outline creators
            const aiData = {
                content: result.content,
                context: result.context,
                isAIGenerated: true,
                projectType: 'rpg-session'
            };

            // Call onCreate callback
            this.config.onCreate(result.title, this.selectedTemplate, aiData);

        } catch (error) {
            console.error('Failed to convert session to outline:', error);
            alert(`Failed to convert session to outline: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.showProgress(false);
            this.setButtonsEnabled(true);
            this.isConverting = false;
        }
    }

    private handleCancel(): void {
        const event = new CustomEvent('rpglite-cancel');
        this.container?.dispatchEvent(event);
    }

    private showProgress(show: boolean): void {
        if (!this.container) return;
        const progressContainer = this.container.querySelector('#rpglite-progress-container') as HTMLElement;
        progressContainer.style.display = show ? 'block' : 'none';
    }

    private updateProgress(progress: ConversionProgress): void {
        if (!this.container) return;

        const messageEl = this.container.querySelector('#rpglite-progress-message') as HTMLElement;
        const barEl = this.container.querySelector('#rpglite-progress-bar') as HTMLElement;

        messageEl.textContent = progress.message;

        if (progress.progress !== undefined) {
            barEl.style.width = `${progress.progress}%`;
        }
    }

    private setButtonsEnabled(enabled: boolean): void {
        if (!this.container) return;

        const createBtn = this.container.querySelector('#rpglite-create-btn') as HTMLButtonElement;
        const cancelBtn = this.container.querySelector('#rpglite-cancel-btn') as HTMLButtonElement;

        createBtn.disabled = !enabled;
        cancelBtn.disabled = !enabled;
    }

    private formatRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days} day${days === 1 ? '' : 's'} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        } else {
            return 'Just now';
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    public cleanup(): void {
        this.cleanupHandlers.forEach(cleanup => { cleanup(); });
        this.cleanupHandlers = [];
        this.templateSelector?.cleanup();
        this.templateSelector = null;
        this.container = null;
    }
}
