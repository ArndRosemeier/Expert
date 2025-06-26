import { getElementById, modalContainer, modalContent, testModalContainer, testModalContent, newProjectModalContainer, newProjectModalContent } from './dom-elements';
import { ProjectManager } from '../ProjectManager';
import { ProjectTemplate } from '../ProjectTemplate';
import * as state from '../state';

import { SettingsProfile, DEFAULT_CRITERIA, SettingsManager } from '../SettingsManager';
import { QualityCriterion } from '../types';
import { OrchestratorPrompts, defaultPrompts } from '../PromptManager';
import { DocumentNode } from '../DocumentNode';
import { AILogService } from '../AILogService';
import { refreshGlobalProfileSelector } from './project-ui';

// --- Generic Modal Functions ---
// TODO: Migrate to new modal system
// These functions are maintained for backward compatibility during migration

import { openGenericModal as newOpenGenericModal, closeGenericModal as newCloseGenericModal, ExportModal } from './modals/index';
import { escapeHtml, escapeHtmlAttribute } from './modals/core/modal-utils';

export function openGenericModal(content: string, onOpen?: () => void) {
    console.log('🔍 openGenericModal called with content length:', content.length);
    
    // Use new modal system
    try {
        newOpenGenericModal(content, onOpen);
        console.log('✅ Using new modal system');
        return;
    } catch (error) {
        console.warn('⚠️ New modal system failed, falling back to legacy:', error);
    }
    
    // Fallback to legacy implementation
    // Try to get fresh references to modal elements
    let container = document.getElementById('modal-container') as HTMLElement;
    let contentDiv = document.getElementById('modal-content') as HTMLElement;
    
    console.log('🔍 Fresh container lookup:', !!container);
    console.log('🔍 Fresh content lookup:', !!contentDiv);
    
    if (container && contentDiv) {
        console.log('✅ Setting modal content and showing...');
        contentDiv.innerHTML = content;
        container.style.display = 'flex';
        console.log('✅ Modal display set to flex');
        if (onOpen) {
            console.log('🎯 Calling onOpen callback...');
            onOpen();
        }
    } else {
        console.error('❌ Modal container or content not found even with fresh lookup!');
        
        // Fallback: create modal dynamically
        console.log('🔧 Creating modal container dynamically...');
        container = document.createElement('div');
        container.id = 'dynamic-modal-container';
        container.className = 'modal-container';
        container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 15000;';
        
        contentDiv = document.createElement('div');
        contentDiv.className = 'modal-content';
        contentDiv.style.cssText = 'background-color: white; padding: 2.5rem; border-radius: 12px; max-width: 80vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);';
        contentDiv.innerHTML = content;
        
        container.appendChild(contentDiv);
        document.body.appendChild(container);
        
        console.log('✅ Dynamic modal created and shown');
        if (onOpen) {
            console.log('🎯 Calling onOpen callback...');
            onOpen();
        }
    }
}

export function closeGenericModal() {
    // Try new modal system first
    try {
        newCloseGenericModal();
        console.log('✅ Using new modal system for close');
        return;
    } catch (error) {
        console.warn('⚠️ New modal system close failed, using legacy:', error);
    }
    
    // Fallback to legacy implementation
    // Try original modal first
    let container = document.getElementById('modal-container') as HTMLElement;
    let contentDiv = document.getElementById('modal-content') as HTMLElement;
    
    if (container && contentDiv) {
        container.style.display = 'none';
        contentDiv.innerHTML = ''; // Clear content on close
        console.log('✅ Original modal closed');
        return;
    }
    
    // Try dynamic modal
    const dynamicContainer = document.getElementById('dynamic-modal-container');
    if (dynamicContainer) {
        dynamicContainer.remove();
        console.log('✅ Dynamic modal removed');
        return;
    }
    
    console.warn('⚠️ No modal found to close');
}


// --- Public Functions ---
// openModal and closeModal functions removed - functionality moved to new modal system
// If you get errors about missing openModal/closeModal, update the calling code to use:
// - SettingsModal from src/ui/modals/SettingsModal.ts
// - ModalFactory.createSettingsModal() for easy access

export function openTestModal(content: string) {
    if (testModalContainer && testModalContent) {
        testModalContent.innerHTML = content;
        testModalContainer.style.display = 'flex';
    }
}

export function closeTestModal() {
    if (testModalContainer) {
        testModalContainer.style.display = 'none';
    }
}

export function openNewProjectModal(onCreate: (title: string, template: ProjectTemplate) => void) {
    renderNewProjectModal(onCreate);
    if (newProjectModalContainer) {
        newProjectModalContainer.style.display = 'flex';
    }
}

export function closeNewProjectModal() {
    if (newProjectModalContainer) {
        newProjectModalContainer.style.display = 'none';
    }
}

export function openExportModal(projectManager: ProjectManager, node: DocumentNode) {
    // Use the new ExportModal implementation via ModalFactory
    import('./modals/ModalFactory').then(async ({ ModalFactory }) => {
        try {
            const settingsManager = state.getSettingsManager();
            const modelSelector = state.getModelSelector();
            
            if (!settingsManager || !modelSelector) {
                throw new Error('Required dependencies not available');
            }
            
            const modalFactory = new ModalFactory({
                settingsManager,
                modelSelector,
                projectManager: projectManager
            });
            
            const exportModal = await modalFactory.createExportModal(node);
            // Modal opens automatically by default
            
        } catch (error) {
            console.error('Failed to open export modal:', error);
            alert('Failed to open export dialog. Please try again.');
        }
    }).catch(error => {
        console.error('Failed to load export modal:', error);
        alert('Failed to load export modal. Please try again.');
    });
}

// renderExportModal function removed - replaced by ExportModal.ts
// This 166-line function was completely duplicating ExportModal functionality

// Export functionality moved to ExportService - keeping minimal stub to prevent breaking legacy export modal
function performExport(_projectManager: ProjectManager, node: DocumentNode, scope: string, format: string) {
    alert('Export functionality moved to new modal system. Please use the new Export modal.');
}

// --- Private Functions ---

function renderNewProjectModal(onCreate: (title: string, template: ProjectTemplate) => void) {
    const templateManager = state.getTemplateManager();
    if (!templateManager) {
        // This case should ideally not happen if initialization is correct.
        newProjectModalContent.innerHTML = `<p>Error: Template Manager not found.</p>`;
        return;
    }
    const templateNames = templateManager.getTemplateNames();
    const optionsHtml = templateNames.map(name => `<option value="${name}">${name}</option>`).join('');

    newProjectModalContent.innerHTML = `
        <h2>Create New Project</h2>
        <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="project-title-input">Project Title</label>
            <input type="text" id="project-title-input" placeholder="e.g., 'My Sci-Fi Epic'">
        </div>
        <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="project-template-select">Project Template</label>
            <select id="project-template-select">
                ${optionsHtml}
            </select>
        </div>
        <div class="button-group" style="display: flex; justify-content: flex-end; gap: 1rem;">
            <button id="cancel-create-project-btn" class="button button-secondary">Cancel</button>
            <button id="confirm-create-project-btn" class="button button-primary">Create</button>
        </div>
    `;

    getElementById('confirm-create-project-btn').addEventListener('click', () => {
        const title = getElementById<HTMLInputElement>('project-title-input').value;
        const templateName = getElementById<HTMLSelectElement>('project-template-select').value;
        const template = templateManager.getTemplate(templateName);

        if (!title.trim() || !template) {
            alert('Project Title and a valid template are required.');
            return;
        }
        
        onCreate(title, template);
    });

    getElementById('cancel-create-project-btn').addEventListener('click', closeNewProjectModal);
}

// CRITERIA MANAGEMENT FUNCTIONS REMOVED - MOVED TO CriteriaEditor
// All criteria functions moved to src/ui/modals/components/CriteriaEditor.ts
function autoResizeTextarea(this: HTMLTextAreaElement) {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
}

function createCriterionElement(_criterion: QualityCriterion): HTMLDivElement {
    const div = document.createElement('div');
    div.innerHTML = '<p style="color: #888;">Criteria editing moved to new Settings modal</p>';
    return div;
}

function getCriteriaFromUI(_container: HTMLElement): QualityCriterion[] {
    return []; // Return empty array since functionality moved to new modal
}

function renderCriteria(container: HTMLElement, _criteria: QualityCriterion[]) {
    container.innerHTML = '<p style="color: #888;">Criteria management moved to new Settings modal</p>';
}

function isCriteriaArray(_data: any): _data is QualityCriterion[] {
    return false; // Stub - functionality moved to CriteriaEditor
}

function migrateCriteriaFormat(criteria: any[]): QualityCriterion[] {
    return criteria as QualityCriterion[]; // Stub - functionality moved to CriteriaEditor
}

async function handleCopyCriteria(_container: HTMLElement) {
    alert('Criteria management moved to new Settings modal');
}

async function handlePasteCriteria(_container: HTMLElement) {
    alert('Criteria management moved to new Settings modal');
}

export function openExtractContextModal(projectManager: ProjectManager, node: DocumentNode) {
    const content = `
        <style>
            .modal-content { max-width: 700px; }
            .extract-section { margin-bottom: 1.5rem; }
            .extract-section label { display: block; font-weight: bold; margin-bottom: 0.5rem; }
            .extract-section input, .extract-section select, .extract-section textarea { 
                width: 100%; 
                padding: 0.75rem; 
                border: 1px solid var(--border-color); 
                border-radius: 8px;
                box-sizing: border-box;
            }
            .extract-section textarea { 
                resize: vertical; 
                min-height: 120px; 
                font-family: inherit; 
            }
            .depth-controls { display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; }
            .depth-controls label { margin: 0; font-weight: normal; font-size: 0.9rem; }
            .depth-controls input { width: 80px; }
            .preview-section { 
                background-color: #f8f9fa; 
                border: 1px solid #e9ecef; 
                border-radius: 8px; 
                padding: 1rem; 
                margin-top: 1rem;
            }
            .button-row { display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem; }
            .button { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; }
            .button-primary { background-color: #007bff; color: white; }
            .button-secondary { background-color: #6c757d; color: white; }
            .button:disabled { opacity: 0.6; cursor: not-allowed; }
        </style>
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 1rem;">
            <h2 style="margin: 0;">Extract Context</h2>
            <button id="close-extract-modal-btn" style="background: #ef4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
        
        <div class="extract-section">
            <label for="extract-prompt">What to extract:</label>
            <input type="text" id="extract-prompt" placeholder="e.g., characters, places, themes, plot points, conflicts..." />
            <small style="color: #6c757d; font-size: 0.9rem; margin-top: 0.25rem; display: block;">
                Describe what specific information you want to extract from the content.
            </small>
        </div>
        
        <div class="extract-section">
            <label for="extract-depth">Analysis Depth:</label>
            <select id="extract-depth">
                <option value="0">This node only</option>
                <option value="1">Include direct children</option>
                <option value="2">Include grandchildren (2 levels)</option>
                <option value="3">Include 3 levels deep</option>
                <option value="4">Include 4 levels deep</option>
                <option value="5">Include 5 levels deep</option>
            </select>
            <small style="color: #6c757d; font-size: 0.9rem; margin-top: 0.25rem; display: block;">
                Choose how deep in the hierarchy to analyze content.
            </small>
        </div>
        
        <div class="extract-section">
            <button id="preview-btn" class="button button-secondary" style="width: auto;">Preview Content Scope</button>
            <div id="preview-container" class="preview-section" style="display: none;">
                <h4 style="margin: 0 0 0.5rem 0;">Content Analysis Preview:</h4>
                <div id="preview-content" style="font-size: 0.9rem; color: #495057; white-space: pre-line;"></div>
            </div>
        </div>
        
        <div class="button-row">
            <button id="cancel-extract-btn" class="button button-secondary">Cancel</button>
            <button id="extract-btn" class="button button-primary">Extract Context</button>
        </div>
        
        <div id="result-section" class="extract-section" style="display: none;">
            <label for="extract-result">Extracted Information:</label>
            <textarea id="extract-result" readonly></textarea>
            <div style="margin-top: 0.5rem;">
                <button id="copy-result-btn" class="button button-secondary">Copy to Clipboard</button>
                <button id="add-to-context-btn" class="button button-primary">Add to Node Context</button>
            </div>
        </div>
    `;
    
    openGenericModal(content, () => setupExtractContextModal(projectManager, node));
}

function setupExtractContextModal(projectManager: ProjectManager, node: DocumentNode) {
    const extractPrompt = getElementById<HTMLInputElement>('extract-prompt');
    const extractDepth = getElementById<HTMLSelectElement>('extract-depth');
    const previewBtn = getElementById<HTMLButtonElement>('preview-btn');
    const previewContainer = getElementById('preview-container');
    const previewContent = getElementById('preview-content');
    const extractBtn = getElementById<HTMLButtonElement>('extract-btn');
    const cancelBtn = getElementById<HTMLButtonElement>('cancel-extract-btn');
    const closeBtn = getElementById<HTMLButtonElement>('close-extract-modal-btn');
    const resultSection = getElementById('result-section');
    const extractResult = getElementById<HTMLTextAreaElement>('extract-result');
    const copyResultBtn = getElementById<HTMLButtonElement>('copy-result-btn');
    const addToContextBtn = getElementById<HTMLButtonElement>('add-to-context-btn');
    
    // Set focus to the extract prompt input
    extractPrompt.focus();
    
    // Preview functionality
    previewBtn.addEventListener('click', () => {
        const depth = parseInt(extractDepth.value);
        const contextService = projectManager.getContextExtractionService();
        const preview = contextService.getContentPreview(node, depth);
        
        previewContent.textContent = preview.summary;
        previewContainer.style.display = 'block';
    });
    
    // Extract functionality
    extractBtn.addEventListener('click', async () => {
        const prompt = extractPrompt.value.trim();
        const depth = parseInt(extractDepth.value);
        
        if (!prompt) {
            alert('Please enter what you want to extract.');
            extractPrompt.focus();
            return;
        }
        
        const contextService = projectManager.getContextExtractionService();
        const validation = contextService.validateExtractionParameters(node, prompt, depth);
        
        if (validation.errors.length > 0) {
            alert('Validation errors:\n\n' + validation.errors.join('\n'));
            return;
        }
        
        // Show warnings and ask for confirmation
        if (validation.warnings.length > 0) {
            const warningMessage = 'Warnings:\n\n' + validation.warnings.join('\n') + '\n\nDo you want to proceed anyway?';
            if (!confirm(warningMessage)) {
                return;
            }
        }
        
        // Disable controls during extraction
        extractBtn.disabled = true;
        extractBtn.textContent = 'Extracting...';
        extractPrompt.disabled = true;
        extractDepth.disabled = true;
        previewBtn.disabled = true;
        
        try {
            const result = await contextService.extractContext(node, prompt, depth);
            
            // Show result
            extractResult.value = result;
            resultSection.style.display = 'block';
            
            // Re-enable controls
            extractBtn.disabled = false;
            extractBtn.textContent = 'Extract Again';
            extractPrompt.disabled = false;
            extractDepth.disabled = false;
            previewBtn.disabled = false;
            
        } catch (error: any) {
            alert('Error during extraction:\n\n' + error.message);
            
            // Re-enable controls
            extractBtn.disabled = false;
            extractBtn.textContent = 'Extract Context';
            extractPrompt.disabled = false;
            extractDepth.disabled = false;
            previewBtn.disabled = false;
        }
    });
    
    // Copy result to clipboard
    copyResultBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(extractResult.value);
            copyResultBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyResultBtn.textContent = 'Copy to Clipboard';
            }, 2000);
        } catch (error) {
            alert('Failed to copy to clipboard');
        }
    });
    
    // Add result to node context
    addToContextBtn.addEventListener('click', () => {
        const currentContext = node.context || '';
        const newContext = currentContext + (currentContext ? '\n\n' : '') + extractResult.value;
        node.context = newContext;
        
        // Update the context textarea in the UI immediately
        const contextTextarea = document.getElementById('node-context') as HTMLTextAreaElement;
        if (contextTextarea) {
            contextTextarea.value = newContext;
        }
        
        // Save project and refresh UI
        projectManager.saveToStorage();
        
        addToContextBtn.textContent = 'Added!';
        setTimeout(() => {
            addToContextBtn.textContent = 'Add to Node Context';
        }, 2000);
        
        // Close modal after a brief delay
        setTimeout(() => {
            closeGenericModal();
        }, 1000);
    });
    
    // Cancel and close handlers
    cancelBtn.addEventListener('click', closeGenericModal);
    closeBtn.addEventListener('click', closeGenericModal);
    
    // Enter key in prompt field triggers extract
    extractPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !extractBtn.disabled) {
            extractBtn.click();
        }
    });
}

/**
 * Opens the AI Log Viewer modal
 */
export function openAILogModal() {
    renderAILogModal();
    if (modalContainer) {
        modalContainer.style.display = 'flex';
    }
}

function renderAILogModal() {
    if (!modalContent) return;

    modalContent.innerHTML = `
        <style>
            .ai-log-modal {
                width: 95vw;
                max-width: 1200px;
                height: 85vh;
                display: flex;
                flex-direction: column;
            }
            .ai-log-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1.5rem 2rem;
                border-bottom: 1px solid #e5e7eb;
                background-color: #f9fafb;
            }
            .ai-log-title {
                font-size: 1.5rem;
                font-weight: 600;
                color: #1f2937;
                margin: 0;
            }
            .ai-log-controls {
                display: flex;
                gap: 0.75rem;
            }
            .ai-log-body {
                flex-grow: 1;
                padding: 1.5rem 2rem;
                overflow-y: auto;
            }
            .ai-log-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 0.875rem;
                background-color: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
            }
            .ai-log-table th {
                background-color: #f3f4f6;
                color: #374151;
                font-weight: 600;
                padding: 0.75rem;
                text-align: left;
                border-bottom: 1px solid #e5e7eb;
                white-space: nowrap;
            }
            .ai-log-table td {
                padding: 0.75rem;
                border-bottom: 1px solid #f3f4f6;
                vertical-align: top;
            }
            .ai-log-table tr:hover {
                background-color: #f9fafb;
            }
            .log-timestamp {
                width: 150px;
                white-space: nowrap;
                color: #6b7280;
            }
            .log-purpose {
                width: 120px;
                font-weight: 500;
                color: #3b82f6;
            }
            .log-model {
                width: 150px;
                color: #6b7280;
                font-family: monospace;
                font-size: 0.8rem;
            }
            .log-duration {
                width: 80px;
                text-align: right;
                color: #6b7280;
            }
            .log-prompt {
                max-width: 300px;
                word-wrap: break-word;
                position: relative;
            }
            .log-response {
                max-width: 300px;
                word-wrap: break-word;
                position: relative;
            }
            .log-text {
                max-height: 100px;
                overflow: hidden;
                text-overflow: ellipsis;
                display: -webkit-box;
                -webkit-line-clamp: 4;
                -webkit-box-orient: vertical;
                cursor: pointer;
                color: #374151;
                transition: background-color 0.2s;
            }
            .log-text:hover {
                background-color: #f3f4f6;
                border-radius: 4px;
            }
            .log-text.expanded {
                max-height: none;
                -webkit-line-clamp: none;
            }
            .log-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background-color: rgba(0, 0, 0, 0.75);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 20000;
            }
            .log-overlay-content {
                width: 95vw;
                max-width: 1200px;
                height: 85vh;
                background-color: white;
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            }
            .log-overlay-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1.5rem 2rem;
                border-bottom: 1px solid #e5e7eb;
                background-color: #f9fafb;
                border-radius: 12px 12px 0 0;
            }
            .log-overlay-title {
                font-size: 1.25rem;
                font-weight: 600;
                color: #1f2937;
                margin: 0;
            }
            .log-overlay-close {
                background: #ef4444;
                color: white;
                border: none;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                cursor: pointer;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.2s;
            }
            .log-overlay-close:hover {
                background-color: #dc2626;
            }
            .log-overlay-body {
                flex: 1;
                padding: 1.5rem 2rem;
                overflow-y: auto;
            }
            .log-overlay-text {
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
            }
            .empty-state {
                text-align: center;
                padding: 3rem 2rem;
                color: #6b7280;
            }
            .empty-state h3 {
                margin: 0 0 0.5rem 0;
                color: #374151;
            }
            .loading-state {
                text-align: center;
                padding: 3rem 2rem;
                color: #6b7280;
            }
            .error-response {
                color: #ef4444;
                font-style: italic;
            }
            .btn {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .btn-danger {
                background-color: #ef4444;
                color: white;
            }
            .btn-danger:hover {
                background-color: #dc2626;
            }
            .btn-secondary {
                background-color: #6b7280;
                color: white;
            }
            .btn-secondary:hover {
                background-color: #4b5563;
            }
        </style>
        <div class="ai-log-modal">
            <div class="ai-log-header">
                <h2 class="ai-log-title">AI Request Log</h2>
                <div class="ai-log-controls">
                    <button id="clear-log-btn" class="btn btn-danger">Clear Log</button>
                    <button id="close-log-modal-btn" class="btn btn-secondary">Close</button>
                </div>
            </div>
            <div class="ai-log-body">
                <div id="log-loading" class="loading-state">
                    <p>Loading AI logs...</p>
                </div>
                <div id="log-content" style="display: none;"></div>
            </div>
        </div>
    `;

    setupAILogModal();
}

async function setupAILogModal() {
    const loadingDiv = document.getElementById('log-loading')!;
    const contentDiv = document.getElementById('log-content')!;
    const clearBtn = document.getElementById('clear-log-btn')!;
    const closeBtn = document.getElementById('close-log-modal-btn')!;

    closeBtn.addEventListener('click', closeGenericModal);

    clearBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all AI logs? This action cannot be undone.')) {
            try {
                const aiLogService = AILogService.getInstance();
                await aiLogService.clearAllLogs();
                await loadLogs(); // Reload logs after clearing
            } catch (error) {
                console.error('Failed to clear AI logs:', error);
                alert('Failed to clear logs. Please try again.');
            }
        }
    });

    const loadLogs = async () => {
        try {
            loadingDiv.style.display = 'block';
            contentDiv.style.display = 'none';

            const aiLogService = AILogService.getInstance();
            const logs = await aiLogService.getAllLogs();

            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';

            if (logs.length === 0) {
                contentDiv.innerHTML = `
                    <div class="empty-state">
                        <h3>No AI logs found</h3>
                        <p>Enable AI logging in settings to start collecting request logs.</p>
                    </div>
                `;
                return;
            }

            const tableHTML = `
                <table class="ai-log-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Purpose</th>
                            <th>Model</th>
                            <th>Duration</th>
                            <th>Prompt</th>
                            <th>Response</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map(log => `
                            <tr>
                                <td class="log-timestamp">${formatTimestamp(log.timestamp)}</td>
                                <td class="log-purpose">${escapeHtml(log.purpose)}</td>
                                <td class="log-model">${escapeHtml(log.model)}</td>
                                <td class="log-duration">${log.requestDuration}ms</td>
                                <td class="log-prompt">
                                    <div class="log-text" data-full-content="${escapeHtmlAttribute(log.prompt)}" data-type="prompt">
                                        ${escapeHtml(truncateText(log.prompt, 200))}
                                    </div>
                                </td>
                                <td class="log-response">
                                    <div class="log-text ${log.response.startsWith('ERROR:') ? 'error-response' : ''}" data-full-content="${escapeHtmlAttribute(log.response)}" data-type="response">
                                        ${escapeHtml(truncateText(log.response, 200))}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            contentDiv.innerHTML = tableHTML;

            // Add click and double-click functionality
            const logTexts = contentDiv.querySelectorAll('.log-text');
            logTexts.forEach(element => {
                // Single click for expand/collapse
                element.addEventListener('click', function(this: HTMLElement) {
                    this.classList.toggle('expanded');
                });

                // Double click for overlay
                element.addEventListener('dblclick', function(this: HTMLElement, e: Event) {
                    e.stopPropagation();
                    e.preventDefault();
                    const fullContent = this.getAttribute('data-full-content') || '';
                    const contentType = this.getAttribute('data-type') || 'content';
                    showLogOverlay(fullContent, contentType);
                });
            });

        } catch (error) {
            console.error('Failed to load AI logs:', error);
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
            contentDiv.innerHTML = `
                <div class="empty-state">
                    <h3>Error loading logs</h3>
                    <p>Failed to load AI logs. Please try again.</p>
                </div>
            `;
        }
    };

    await loadLogs();
}

function showLogOverlay(content: string, contentType: string): void {
    // Define close function first
    const closeLogOverlay = () => {
        const existingOverlay = document.querySelector('.log-overlay');
        if (existingOverlay) {
            (existingOverlay as any).cleanup?.();
            existingOverlay.remove();
        }
        delete (window as any).closeLogOverlay;
    };

    // Make close function globally available
    (window as any).closeLogOverlay = closeLogOverlay;

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'log-overlay';
    
    const capitalizedType = contentType.charAt(0).toUpperCase() + contentType.slice(1);
    
    overlay.innerHTML = `
        <div class="log-overlay-content">
            <div class="log-overlay-header">
                <h3 class="log-overlay-title">${capitalizedType} Content</h3>
                <button class="log-overlay-close" onclick="closeLogOverlay()">&times;</button>
            </div>
            <div class="log-overlay-body">
                <div class="log-overlay-text">${content}</div>
            </div>
        </div>
    `;

    // Close on background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeLogOverlay();
        }
    });

    // Close on Escape key
    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeLogOverlay();
        }
    };
    
    document.addEventListener('keydown', handleKeydown);
    
    // Store cleanup function on the overlay element for later use
    (overlay as any).cleanup = () => {
        document.removeEventListener('keydown', handleKeydown);
    };

    document.body.appendChild(overlay);
}

function formatTimestamp(timestamp: Date): string {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}