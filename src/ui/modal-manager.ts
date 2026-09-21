import { getElementById, modalContainer, modalContent, testModalContainer, testModalContent, newProjectModalContainer, newProjectModalContent } from './dom-elements';
import { ProjectManager } from '../ProjectManager';
import { ProjectTemplate } from '../ProjectTemplate';
import * as state from '../state';

import { DocumentNode } from '../DocumentNode';
import { AILogService } from '../AILogService';
import { createPromptExpansionService } from '../services/PromptExpansionService.js';
import { PromptContextBuilder } from '../services/PromptContextBuilder.js';

// --- Generic Modal Functions ---
// TODO: Migrate to new modal system
// These functions are maintained for backward compatibility during migration

import { openGenericModal as newOpenGenericModal, closeGenericModal as newCloseGenericModal } from './modals/index';
import { escapeHtml, escapeHtmlAttribute } from './modals/core/modal-utils';

interface ImportFileTemplateObject {
    name: string;
    hierarchyLevels: string[];
}

interface ProjectImportFileData {
    title: string;
    template?: ImportFileTemplateObject | string[];
    children?: ProjectImportFileData[];
}

type ImportProjectCallback = (title: string, template: ProjectTemplate, importData: ProjectImportFileData) => void;

export function openGenericModal(content: string, onOpen?: () => void) {
        newOpenGenericModal(content, onOpen);
}

export function closeGenericModal() {
    newCloseGenericModal();
}


// --- Public Functions ---
// openModal and closeModal functions removed - functionality moved to new modal system
// If you get errors about missing openModal/closeModal, update the calling code to use:
// - SettingsModal from src/ui/modals/SettingsModal.ts
// - ModalFactory.createSettingsModal() for easy access

export function openTestModal(content: string) {
    const container = testModalContainer();
    const content_elem = testModalContent();
    content_elem.innerHTML = content;
    container.style.display = 'flex';
}

export function closeTestModal() {
    const container = testModalContainer();
    container.style.display = 'none';
}

export function openNewProjectModal(onCreate: (title: string, template: ProjectTemplate) => void) {
    renderNewProjectModal(onCreate);
    const container = newProjectModalContainer();
    container.style.display = 'flex';
}

export function closeNewProjectModal() {
    const container = newProjectModalContainer();
    container.style.display = 'none';
}

export function openImportProjectModal(onImport: ImportProjectCallback) {
    console.log('📋 Opening Import Project modal...');
    const content = `
        <h2>Import Project from File</h2>
        <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="import-file-input">Select Import File</label>
            <input type="file" id="import-file-input" accept=".json,.txt,.pdf" style="width: 100%; padding: 0.75rem; border: 1px solid var(--secondary-300); /* Updated from legacy --border-color */ border-radius: 8px;">
                            <small style="color: var(--secondary-500); margin-top: 0.25rem; display: block;">
                Choose a JSON file exported from Expert, a text file, or a PDF file to analyze and import
            </small>
        </div>
        <div id="import-preview" style="display: none; margin-bottom: 1.5rem;">
            <label>Preview:</label>
            <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 1rem; margin-top: 0.5rem;">
                <div><strong>Project Title:</strong> <span id="preview-title"></span></div>
                <div><strong>Template:</strong> <span id="preview-template"></span></div>
                <div><strong>Content Depth:</strong> <span id="preview-depth"></span> levels</div>
            </div>
        </div>
        <div class="button-row" style="display: flex; justify-content: flex-end; gap: 1rem;">
            <button id="cancel-import-project-btn" class="button button-secondary">Cancel</button>
            <button id="confirm-import-project-btn" class="button button-primary" disabled>Import Project</button>
        </div>
    `;
    
    console.log('📋 Using new modal system directly...');
    try {
        // Use the new modal system directly, same as openExtractContextModal
        newOpenGenericModal(content, () => { setupImportProjectModal(onImport); });
        console.log('📋 New modal system call completed');
    } catch (error) {
        console.error('❌ Error opening import modal:', error);
    }
}

function calculateImportDepth(data: ProjectImportFileData): number {
    if (!data.children || !Array.isArray(data.children) || data.children.length === 0) {
        return 0; // No children = 0 additional depth
    }
    
    let maxChildDepth = 0;
    for (const child of data.children) {
        const childDepth = calculateImportDepth(child);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    
    return 1 + maxChildDepth; // 1 for this level + max child depth
}

function setupImportProjectModal(onImport: ImportProjectCallback) {
    console.log('🔧 Setting up import project modal...');
    const fileInput = getElementById<HTMLInputElement>('import-file-input');
    const preview = getElementById('import-preview');
    const previewTitle = getElementById('preview-title');
    const previewTemplate = getElementById('preview-template');
    const previewDepth = getElementById('preview-depth');
    const confirmBtn = getElementById<HTMLButtonElement>('confirm-import-project-btn');
    const cancelBtn = getElementById<HTMLButtonElement>('cancel-import-project-btn');
    
    let importData: ProjectImportFileData | null = null;
    let detectedTemplate: ProjectTemplate | null = null;
    
    fileInput.addEventListener('change', (e) => {
        if (!(e.target instanceof HTMLInputElement)) {
            throw new Error('Import file input event target is not an HTMLInputElement');
        }
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const fileContent = event.target?.result;
                if (typeof fileContent !== 'string') {
                    throw new Error('Failed to read import file content');
                }
                const parsed: unknown = JSON.parse(fileContent);
                if (typeof parsed !== 'object' || parsed === null || !('title' in parsed) || typeof parsed.title !== 'string') {
                    throw new Error('Invalid import file: Missing required fields');
                }
                const data = parsed as ProjectImportFileData;
                
                // Extract template - first try from project level, then from root node, then from child nodes
                let templateData: ImportFileTemplateObject | undefined =
                    data.template !== undefined && !Array.isArray(data.template)
                        ? data.template
                        : undefined;
                
                if (!templateData?.name || templateData.hierarchyLevels.length === 0) {
                    // Check if root node has template as array (node export format)
                    if (data.template && Array.isArray(data.template)) {
                        templateData = {
                            name: `Imported Template (${data.title})`,
                            hierarchyLevels: data.template,
                        };
                    } else if (data.children && data.children.length > 0) {
                        // Try to extract template from first child that has one
                        let foundTemplate: string[] | null = null;
                        for (const child of data.children) {
                            if (child.template && Array.isArray(child.template)) {
                                foundTemplate = child.template;
                                break;
                            }
                        }
                        
                        if (foundTemplate) {
                            templateData = {
                                name: `Imported Template (${data.title})`,
                                hierarchyLevels: foundTemplate,
                            };
                        } else {
                            throw new Error('Invalid import file: Missing or incomplete template information');
                        }
                    } else {
                        throw new Error('Invalid import file: Missing or incomplete template information');
                    }
                }
                
                // Create template from extracted data
                const bestTemplate = new ProjectTemplate(
                    templateData.name,
                    templateData.hierarchyLevels
                );
                
                // Calculate depth for display purposes
                const depth = calculateImportDepth(data);
                
                // Store data and update preview
                importData = data;
                detectedTemplate = bestTemplate;
                
                previewTitle.textContent = data.title;
                previewTemplate.textContent = bestTemplate.name;
                previewDepth.textContent = depth.toString();
                
                preview.style.display = 'block';
                confirmBtn.disabled = false;
                
            } catch (error) {
                console.error('Import failed:', error);
                alert('Import failed: ' + (error instanceof Error ? error.message : 'Invalid JSON file'));
                preview.style.display = 'none';
                confirmBtn.disabled = true;
                importData = null;
                detectedTemplate = null;
            }
        };
        
        reader.onerror = () => {
            alert('Failed to read file. Please try again.');
        };
        
        reader.readAsText(file);
    });
    
    confirmBtn.addEventListener('click', () => {
        if (importData && detectedTemplate) {
            onImport(importData.title, detectedTemplate, importData);
            closeGenericModal();
        }
    });
    
    cancelBtn.addEventListener('click', closeGenericModal);
}

export function openExportModal(projectManager: ProjectManager, node: DocumentNode) {
    // Use the new ExportModal implementation via ModalFactory
    void import('./modals/ModalFactory').then(async ({ ModalFactory }) => {
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
            
            await modalFactory.createExportModal(node);
            // Modal opens automatically by default
            
        } catch {
            alert('Failed to open export dialog. Please try again.');
        }
    }).catch(() => {
        alert('Failed to load export modal. Please try again.');
    });
}

// renderExportModal function removed - replaced by ExportModal.ts
// This 166-line function was completely duplicating ExportModal functionality

// Export functionality moved to ExportService and new modal system

// --- Private Functions ---

function renderNewProjectModal(onCreate: (title: string, template: ProjectTemplate) => void) {
    const templateManager = state.getTemplateManager();
    const contentElement = newProjectModalContent();
    if (!templateManager) {
        // This case should ideally not happen if initialization is correct.
        contentElement.innerHTML = `<p>Error: Template Manager not found.</p>`;
        return;
    }
    const templateNames = templateManager.getTemplateNames();
    const optionsHtml = templateNames.map(name => `<option value="${name}">${name}</option>`).join('');

    contentElement.innerHTML = `
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
        <div class="button-row" style="display: flex; justify-content: flex-end; gap: 1rem;">
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

export function openExtractContextModal(projectManager: ProjectManager, node: DocumentNode) {
    // Import the new modal system dynamically
    void import('./modals/index').then(({ showGenericModal }) => {
        const modal = showGenericModal(
            {
                content: `
                    <style>
                        .modal-content { max-width: 700px; }
                        .extract-section { margin-bottom: 1.5rem; }
                        .extract-section label { display: block; font-weight: bold; margin-bottom: 0.5rem; }
                        .extract-section input, .extract-section select, .extract-section textarea { 
                            width: 100%; 
                            padding: 0.75rem; 
                            border: 1px solid var(--secondary-300); /* Updated from legacy --border-color */ 
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
                        .button-primary { background-color: var(--primary-500); color: white; }
                        .button-secondary { background-color: var(--secondary-600); color: white; }
                        .button:disabled { opacity: 0.6; cursor: not-allowed; }
                    </style>
                    
                    <div class="extract-section">
                        <label for="extract-prompt">What to extract:</label>
                        <input type="text" id="extract-prompt" placeholder="e.g., characters, places, themes, plot points, conflicts..." />
                        <small style="color: var(--secondary-500); font-size: 0.9rem; margin-top: 0.25rem; display: block;">
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
                        <small style="color: var(--secondary-500); font-size: 0.9rem; margin-top: 0.25rem; display: block;">
                            Choose how deep in the hierarchy to analyze content.
                        </small>
                    </div>
                    
                    <div class="extract-section">
                        <button id="preview-btn" class="button button-secondary">👁️ Preview Content Scope</button>
                        <div id="preview-container" class="preview-section" style="display: none;">
                            <h4 style="margin: 0 0 0.5rem 0;">Content Analysis Preview:</h4>
                            <div id="preview-content" style="font-size: 0.9rem; color: #495057; white-space: pre-line;"></div>
                        </div>
                    </div>
                    
                    <div id="loading-section" class="extract-section" style="display: none;">
                        <div style="text-align: center; padding: 2rem;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>
                            <div style="font-weight: bold; margin-bottom: 0.5rem;">Extracting Context...</div>
                            <div style="color: var(--secondary-500); font-size: 0.9rem;">This may take a moment depending on content size</div>
                        </div>
                    </div>
                    
                    <div id="result-section" class="extract-section" style="display: none;">
                        <label for="extract-result">Extracted Information:</label>
                        <textarea id="extract-result" readonly></textarea>
                        <div style="margin-top: 0.5rem;">
                                                <button id="copy-result-btn" class="button button-secondary">📋 Copy to Clipboard</button>
                    <button id="add-to-context-btn" class="button button-primary">➕ Add to Node Context</button>
                        </div>
                    </div>
                `,
                actions: [
                    {
                        id: 'cancel',
                        label: 'Cancel',
                        type: 'secondary',
                        handler: async () => {
                            await modal.close();
                        }
                    },
                    {
                        id: 'extract',
                        label: 'Extract Context',
                        type: 'primary',
                        handler: async () => {
                            const extractPrompt = getElementById<HTMLInputElement>('extract-prompt');
                            const extractDepth = getElementById<HTMLSelectElement>('extract-depth');
                            
                            const prompt = extractPrompt.value.trim();
                            const depth = parseInt(extractDepth.value || '0');
                            
                            if (!prompt) {
                                alert('Please enter what you want to extract.');
                                extractPrompt.focus();
                                throw new Error('Missing prompt'); // Prevent modal from closing
                            }
                            
                            const contextService = projectManager.getContextExtractionService();
                            const validation = contextService.validateExtractionParameters(node, prompt, depth);
                            
                            if (validation.errors.length > 0) {
                                alert('Validation errors:\n\n' + validation.errors.join('\n'));
                                throw new Error('Validation failed'); // Prevent modal from closing
                            }
                            
                            // Show warnings and ask for confirmation
                            if (validation.warnings.length > 0) {
                                const warningMessage = 'Warnings:\n\n' + validation.warnings.join('\n') + '\n\nDo you want to proceed anyway?';
                                if (!confirm(warningMessage)) {
                                    throw new Error('User cancelled'); // Prevent modal from closing
                                }
                            }
                            
                            // Show loading indicators
                            const extractBtnElement = document.querySelector('[data-action-id="extract"]');
                            if (!(extractBtnElement instanceof HTMLButtonElement)) {
                                throw new Error('Extract action button not found');
                            }
                            const extractBtn = extractBtnElement;
                            const loadingSection = getElementById('loading-section');
                            const resultSection = getElementById('result-section');
                            const originalText = extractBtn.textContent;
                            
                            extractBtn.disabled = true;
                            extractBtn.textContent = '⏳ Extracting...';
                            
                            // Show loading section, hide result section
                            loadingSection.style.display = 'block';
                            resultSection.style.display = 'none';
                            
                            try {
                                const result = await contextService.extractContext(node, prompt, depth);
                                
                                // Hide loading section and show result
                                loadingSection.style.display = 'none';
                                
                                const extractResult = getElementById<HTMLTextAreaElement>('extract-result');
                                extractResult.value = result;
                                resultSection.style.display = 'block';
                                
                                // Re-enable button with new text
                                extractBtn.disabled = false;
                                extractBtn.textContent = '🔄 Extract Again';
                                
                                // Prevent modal from closing by throwing a specific error that gets caught silently
                                throw new Error('__KEEP_MODAL_OPEN__');
                                
                            } catch (error: unknown) {
                                // Hide loading section and re-enable button on error
                                loadingSection.style.display = 'none';
                                extractBtn.disabled = false;
                                extractBtn.textContent = originalText;
                                
                                if (error instanceof Error && error.message === '__KEEP_MODAL_OPEN__') {
                                    throw error; // Keep modal open without logging error
                                }
                                const message = error instanceof Error ? error.message : String(error);
                                alert('Error during extraction:\n\n' + message);
                                throw error; // Prevent modal from closing on error
                            }
                        }
                    }
                ]
            },
            {
                title: 'Extract Context',
                maxWidth: '700px'
            },
            {
                onOpen: () => {
                    setupExtractContextModal(projectManager, node);
                },
                onClose: () => {
                    // Clean up any event listeners if needed
                }
            }
        );
    });
}

function setupExtractContextModal(projectManager: ProjectManager, node: DocumentNode) {
    const extractPrompt = getElementById<HTMLInputElement>('extract-prompt');
    const extractDepth = getElementById<HTMLSelectElement>('extract-depth');
    const previewBtn = getElementById<HTMLButtonElement>('preview-btn');
    const previewContainer = getElementById('preview-container');
    const previewContent = getElementById('preview-content');

    const extractResult = getElementById<HTMLTextAreaElement>('extract-result');
    const copyResultBtn = getElementById<HTMLButtonElement>('copy-result-btn');
    const addToContextBtn = getElementById<HTMLButtonElement>('add-to-context-btn');
    
    // Set focus to the extract prompt input
    extractPrompt.focus();
    
    // Preview functionality
    previewBtn.addEventListener('click', () => {
        const depth = parseInt(extractDepth.value || '0');
        const contextService = projectManager.getContextExtractionService();
        const preview = contextService.getContentPreview(node, depth);
        
        previewContent.textContent = preview.summary;
        previewContainer.style.display = 'block';
    });
    
    // Copy result to clipboard
    copyResultBtn.addEventListener('click', () => {
        void (async () => {
            try {
                await navigator.clipboard.writeText(extractResult.value);
                copyResultBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyResultBtn.textContent = 'Copy to Clipboard';
                }, 2000);
            } catch {
                alert('Failed to copy to clipboard');
            }
        })();
    });
    
    // Add result to node context
    addToContextBtn.addEventListener('click', () => {
        // Traditional context extraction and editing removed - using conditional context system
        
        // Save project and refresh UI
        void projectManager.saveToStorage();
        
        addToContextBtn.textContent = 'Added!';
        setTimeout(() => {
            addToContextBtn.textContent = 'Add to Node Context';
        }, 1000);
        
        // Close modal handled by base modal now
    });
    
    // Enter key in prompt field triggers extract action
    extractPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // Find and click the extract button (now in modal actions)
            const extractActionElement = document.querySelector('[data-action-id="extract"]');
            if (extractActionElement instanceof HTMLButtonElement) {
                extractActionElement.click();
            }
        }
    });
}

/**
 * Opens the AI Log Viewer modal
 */
export function openAILogModal() {
    renderAILogModal();
    const container = modalContainer();
    container.style.display = 'flex';
}

function renderAILogModal() {
    const content = modalContent();
    content.innerHTML = `
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
                color: var(--primary-500);
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
                background: var(--danger-500);
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
                background-color: var(--danger-600);
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
                color: var(--danger-500);
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
                background-color: var(--danger-500);
                color: white;
            }
            .btn-danger:hover {
                background-color: var(--danger-600);
            }
            .btn-secondary {
                background-color: var(--secondary-600);
                color: white;
            }
            .btn-secondary:hover {
                background-color: var(--secondary-700);
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

    void setupAILogModal();
}

async function setupAILogModal() {
    const loadingDiv = getElementById('log-loading');
    const contentDiv = getElementById('log-content');
    const clearBtn = getElementById<HTMLButtonElement>('clear-log-btn');
    const closeBtn = getElementById<HTMLButtonElement>('close-log-modal-btn');

    closeBtn.addEventListener('click', closeGenericModal);

    clearBtn.addEventListener('click', () => {
        void (async () => {
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
        })();
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
                    const fullContent = this.getAttribute('data-full-content') ?? '';
                    const contentType = this.getAttribute('data-type') ?? 'content';
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
    const existingOverlay = document.querySelector('.log-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'log-overlay';
    
    const capitalizedType = contentType.charAt(0).toUpperCase() + contentType.slice(1);
    
    overlay.innerHTML = `
        <div class="log-overlay-content">
            <div class="log-overlay-header">
                <h3 class="log-overlay-title">${capitalizedType} Content</h3>
                <button class="log-overlay-close">&times;</button>
            </div>
            <div class="log-overlay-body">
                <div class="log-overlay-text">${content}</div>
            </div>
        </div>
    `;

    const closeButton = overlay.querySelector('.log-overlay-close');
    if (!(closeButton instanceof HTMLButtonElement)) {
        throw new Error('Log overlay close button not found');
    }

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeLogOverlay();
        }
    };

    const closeLogOverlay = () => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
    };

    closeButton.addEventListener('click', closeLogOverlay);

    // Close on background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeLogOverlay();
        }
    });

    document.addEventListener('keydown', handleKeydown);

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

export function openNodeChatModal(projectManager: ProjectManager, node: DocumentNode) {
    const modalContentHtml = `
            <style>
                .modal-content { max-width: 800px; }
                .chat-section { margin-bottom: 1.5rem; }
                .chat-section label { display: block; font-weight: bold; margin-bottom: 0.5rem; }
                .chat-section select, .chat-section textarea { 
                    width: 100%; 
                    padding: 0.75rem; 
                    border: 1px solid var(--secondary-300); /* Updated from legacy --border-color */ 
                    border-radius: 8px;
                    box-sizing: border-box;
                }
                .preview-section { 
                    background-color: #f8f9fa; 
                    border: 1px solid #e9ecef; 
                    border-radius: 8px; 
                    padding: 1rem; 
                    margin-top: 1rem;
                }
                .button { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; }
                .button-primary { background-color: var(--primary-500); color: white; }
                .button-secondary { background-color: var(--secondary-600); color: white; }
                .button:disabled { opacity: 0.6; cursor: not-allowed; }
            </style>
            <div class="modal-header" style="margin-bottom: 1.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 1rem;">
                <h2 style="margin: 0;">Chat with Node</h2>
            </div>
            
            <div class="chat-section">
                <label for="chat-depth">Scope Depth:</label>
                <select id="chat-depth">
                    <option value="0">This node only</option>
                    <option value="1">Include direct children</option>
                    <option value="2">Include grandchildren (2 levels)</option>
                    <option value="3">Include 3 levels deep</option>
                    <option value="4">Include 4 levels deep</option>
                    <option value="5">Include 5 levels deep</option>
                </select>
                <small style="color: var(--secondary-500); font-size: 0.9rem; margin-top: 0.25rem; display: block;">
                    Choose how deep in the hierarchy to include in the chat context.
                </small>
            </div>
            
            <div class="chat-section">
                <button id="preview-content-btn" class="button button-secondary">📊 Preview Content Size</button>
                <div id="content-preview-container" class="preview-section" style="display: none;">
                    <h4 style="margin: 0 0 0.5rem 0;">Content Size Analysis:</h4>
                    <div id="content-preview-content" style="font-size: 0.9rem; color: #495057; white-space: pre-line;"></div>
                </div>
            </div>
            
            <div class="modal-footer" style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; display: flex; gap: 1rem; justify-content: flex-end;">
                <button id="cancel-btn" class="button button-secondary">Cancel</button>
                <button id="start-chat-btn" class="button button-primary">Start Chat</button>
            </div>
        `;
    
    // DON'T use showGenericModal to avoid triggering modal system's closeAll()
    // which would close XMLStoryModal and trigger unsaved changes warning
    
    // Create custom overlay instead
    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.5); z-index: 1000;
        display: flex; align-items: center; justify-content: center;
    `;
    
    const modalDiv = document.createElement('div');
    modalDiv.style.cssText = `
        background: white; border-radius: 12px; max-width: 600px; width: 90%;
        max-height: 80vh; overflow-y: auto; padding: 2rem;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;
    modalDiv.innerHTML = modalContentHtml;
    modalOverlay.appendChild(modalDiv);
    document.body.appendChild(modalOverlay);
    
    const closeModal = () => {
        if (document.body.contains(modalOverlay)) {
            document.body.removeChild(modalOverlay);
        }
    };
    
    const chatDepth = getElementById<HTMLSelectElement>('chat-depth');
    chatDepth.focus();
    
    const previewContentBtn = getElementById<HTMLButtonElement>('preview-content-btn');
    const contentPreviewContainer = getElementById('content-preview-container');
    const contentPreviewContent = getElementById('content-preview-content');

    previewContentBtn.addEventListener('click', () => {
        try {
            const depth = parseInt(chatDepth.value);
            const contextService = projectManager.getContextExtractionService();
            const preview = contextService.getChatContentPreview(node, depth);
            
            contentPreviewContent.textContent = preview.summary;
            contentPreviewContainer.style.display = 'block';
        } catch (error: unknown) {
            console.error('Error in content preview:', error);
            const message = error instanceof Error ? error.message : String(error);
            alert('Error generating content preview: ' + message);
        }
    });
    
    const cancelBtn = getElementById<HTMLButtonElement>('cancel-btn');
    const startChatBtn = getElementById<HTMLButtonElement>('start-chat-btn');
    
    cancelBtn.addEventListener('click', closeModal);
    
    startChatBtn.addEventListener('click', () => {
        void (async () => {
            const depth = parseInt(chatDepth.value);
            try {
                const contextService = projectManager.getContextExtractionService();
                
                // Validate chat context parameters and show warnings if needed
                const validation = contextService.validateChatContextParameters(node, depth);
                
                if (validation.errors.length > 0) {
                    alert('Validation errors:\n\n' + validation.errors.join('\n'));
                    return;
                }
                
                // Show warnings and ask for confirmation
                if (validation.warnings.length > 0) {
                    const warningMessage = 'Content Size Warnings:\n\n' + validation.warnings.join('\n') + '\n\nDo you want to proceed anyway?\n\nNote: Large contexts may result in higher costs and slower responses.';
                    if (!confirm(warningMessage)) {
                        return;
                    }
                }
                
                // Create the tree data structure (string representation for prompt)
                const treeData = contextService.createNodeTreeData(node, projectManager.rootNode, depth);
                
                // Create depth-limited node structure for roleplay functionality
                const depthLimitedNode = contextService.createDepthLimitedNodeStructure(node, depth);
                
                // Get the node chat system prompt
                const prompts = projectManager.getSettingsManager().getPrompts();
                const promptContext = PromptContextBuilder.forUI(projectManager.getSettingsManager(), {
                    nodeData: treeData
                });
                // Create chat system prompt
                const activeProject = state.getActiveProject();
                if (!activeProject) {
                    throw new Error('No active project for chat');
                }
                const settingsManager = activeProject.getSettingsManager();
                const expansionService = createPromptExpansionService(settingsManager);
                const systemPrompt = expansionService.expandPrompt(prompts.node_chat_system, promptContext);
                
                closeModal();
                await openNodeChatInterface(projectManager, systemPrompt, node.title, depthLimitedNode);
                
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                alert('Error preparing chat:\n\n' + message);
            }
        })();
    });
    
    // ESC key and click outside to close
    const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
}



async function openNodeChatInterface(_projectManager: ProjectManager, systemPrompt: string, nodeTitle: string, node: DocumentNode): Promise<void> {
    try {
        // Import necessary modules
        const { ChatInterface } = await import('./chat-interface');
        const { OpenRouterClient } = await import('../OpenRouterClient');
        const stateModule = await import('../state');
        
        // Get required services using the correct exports
        const settingsManager = stateModule.getSettingsManager();
        const modelSelector = stateModule.getModelSelector();
        
        if (!settingsManager || !modelSelector) {
            alert('Settings or model selector not available.');
            return;
        }
        
        // Get OpenRouter API key from model selector
        const apiKey = modelSelector.getApiKey();
        if (!apiKey) {
            alert('OpenRouter API key not configured. Please set it in the settings first.');
            return;
        }

        // Get selected models from model selector
        if (!modelSelector.areAllModelsSelected()) {
            alert('Please configure all required models in the settings first.');
            return;
        }

        // Create OpenRouter client with the configured models
        const openRouterClient = OpenRouterClient.getInstance();
        openRouterClient.setSettingsManager(settingsManager);
        
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        const modalContainer = document.createElement('div');
        modalContainer.style.cssText = `
            width: 90%;
            height: 90%;
            max-width: 90vw;
            max-height: 90vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;
        
        modalOverlay.appendChild(modalContainer);
        document.body.appendChild(modalOverlay);
        
        // Create chat interface with custom system prompt, title, and node structure
        const chatInterface = new ChatInterface(openRouterClient, settingsManager, systemPrompt, nodeTitle, node);
        await chatInterface.initialize(modalContainer);
        
        // Close modal functionality
        const closeModal = () => {
            document.body.removeChild(modalOverlay);
        };
        
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
        
        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        });
        
    } catch (error) {
        console.error('Error opening chat interface:', error);
        alert('Failed to open chat interface. Please try again.');
    }
}