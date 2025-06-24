import { getElementById, modalContainer, modalContent, testModalContainer, testModalContent, newProjectModalContainer, newProjectModalContent } from './dom-elements';
import { ProjectManager } from '../ProjectManager';
import { ProjectTemplate } from '../ProjectTemplate';
import * as state from '../state';
import { ModelSelector } from '../ModelSelector';
import { SettingsProfile, DEFAULT_CRITERIA } from '../SettingsManager';
import { QualityCriterion } from '../types';
import { PromptManager } from '../PromptManager';
import { DocumentNode } from '../DocumentNode';

// --- Generic Modal Functions ---
export function openGenericModal(content: string, onOpen?: () => void) {
    if (modalContainer && modalContent) {
        modalContent.innerHTML = content;
        modalContainer.style.display = 'flex';
        if (onOpen) {
            onOpen();
        }
    }
}

export function closeGenericModal() {
    if (modalContainer && modalContent) {
        modalContainer.style.display = 'none';
        modalContent.innerHTML = ''; // Clear content on close
    }
}


// --- Public Functions ---
export function openModal() {
    if (modalContainer) {
        renderSettingsModal();
        modalContainer.style.display = 'flex';
    }
}

export function closeModal() {
    if (modalContainer) {
        modalContainer.style.display = 'none';
    }
}

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
    renderExportModal(projectManager, node);
    if (modalContainer) {
        modalContainer.style.display = 'flex';
    }
}

function renderExportModal(projectManager: ProjectManager, node: DocumentNode) {
    if (!modalContent) return;

    modalContent.innerHTML = `
        <style>
            .modal-content {
                width: 60vw;
                max-width: 800px;
            }
            .modal-body {
                padding: 1.5rem 2rem;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }
            .export-section {
                background-color: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 1.5rem;
            }
            .export-option {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                margin-bottom: 1rem;
            }
            .export-option:last-child {
                margin-bottom: 0;
            }
            .export-option label {
                font-weight: 500;
                color: #374151;
                cursor: pointer;
                user-select: none;
                min-width: 120px;
            }
            .export-option select {
                flex-grow: 1;
                padding: 0.75rem;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                background-color: white;
                font-size: 0.875rem;
            }
            .export-option select:disabled {
                background-color: #f3f4f6;
                color: #6b7280;
                cursor: not-allowed;
            }
            .export-actions {
                display: flex;
                gap: 0.75rem;
                justify-content: flex-end;
                margin-top: 1.5rem;
            }
            .export-actions button {
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 8px;
                font-size: 0.875rem;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .export-btn {
                background-color: #3b82f6;
                color: white;
            }
            .export-btn:hover {
                background-color: #2563eb;
            }
            .export-btn:disabled {
                background-color: #9ca3af;
                cursor: not-allowed;
            }
            .cancel-btn {
                background-color: #6b7280;
                color: white;
            }
            .cancel-btn:hover {
                background-color: #4b5563;
            }
        </style>
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 1rem;">
            <h2 style="margin: 0;">📤 Export Content</h2>
            <button id="close-export-modal-btn" style="background: #ef4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
        <div class="modal-body">
            <div class="export-section">
                <h3 style="margin-top: 0; margin-bottom: 1rem; color: #1f2937;">Export Options</h3>
                
                <div class="export-option">
                    <label for="export-scope-select">Scope:</label>
                    <select id="export-scope-select">
                        <option value="lowest">Lowest hierarchy layer (deepest content)</option>
                        <option value="all">All layers (complete hierarchy)</option>
                        <option value="reimport">For reimport (JSON format)</option>
                    </select>
                </div>
                
                <div class="export-option">
                    <label for="export-format-select">Format:</label>
                    <select id="export-format-select">
                        <option value="html">HTML</option>
                        <option value="plaintext">Plain Text</option>
                        <option value="markdown">Markdown</option>
                    </select>
                </div>
                
                <div style="margin-top: 1rem; padding: 1rem; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
                    <div style="font-size: 0.875rem; color: #1e40af;">
                        <strong>Node:</strong> ${node.title}<br>
                        <strong>Path:</strong> ${projectManager.getNodePath(node.id)}<br>
                        <strong>Children:</strong> ${node.children.length} direct child nodes
                    </div>
                </div>
            </div>
            
            <div class="export-actions">
                <button id="export-cancel-btn" class="cancel-btn">Cancel</button>
                <button id="export-execute-btn" class="export-btn">Export</button>
            </div>
        </div>
    `;

    // Wire up event handlers
    const scopeSelect = getElementById('export-scope-select') as HTMLSelectElement;
    const formatSelect = getElementById('export-format-select') as HTMLSelectElement;
    const exportBtn = getElementById('export-execute-btn') as HTMLButtonElement;
    const cancelBtn = getElementById('export-cancel-btn') as HTMLButtonElement;
    const closeBtn = getElementById('close-export-modal-btn') as HTMLButtonElement;

    // Handle scope change - disable format when scope is for reimport
    const updateFormatState = () => {
        const isReimport = scopeSelect.value === 'reimport';
        formatSelect.disabled = isReimport;
        if (isReimport) {
            formatSelect.value = 'html'; // Default value when disabled
        }
    };

    scopeSelect.addEventListener('change', updateFormatState);
    updateFormatState(); // Initial state

    // Handle export button
    exportBtn.addEventListener('click', () => {
        const scope = scopeSelect.value;
        const format = formatSelect.value;
        
        try {
            performExport(projectManager, node, scope, format);
            closeGenericModal();
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    });

    // Handle cancel and close buttons
    const closeModal = () => closeGenericModal();
    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
}

function performExport(projectManager: ProjectManager, node: DocumentNode, scope: string, format: string) {
    let exportData: any;
    let filename: string;
    let mimeType: string;

    if (scope === 'reimport') {
        // Export for reimport - JSON format with full node data
        exportData = exportNodeForReimport(node);
        filename = `${sanitizeFilename(node.title)}_export.json`;
        mimeType = 'application/json';
    } else {
        // Export for reading - formatted content
        const content = exportNodeContent(node, scope, format);
        exportData = content;
        const extension = format === 'html' ? 'html' : format === 'markdown' ? 'md' : 'txt';
        filename = `${sanitizeFilename(node.title)}_${scope}.${extension}`;
        mimeType = format === 'html' ? 'text/html' : 'text/plain';
    }

    // Create blob and download
    const blob = new Blob([exportData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Show success message
    alert(`Successfully exported "${node.title}" as ${filename}`);
}

function exportNodeForReimport(node: DocumentNode): string {
    // Create a clean export object without circular references and internal data
    const exportObject = {
        title: node.title,
        content: node.content,
        summary: node.summary,
        generationPrompt: node.generationPrompt,
        level: node.level,
        children: node.children.map(child => exportNodeForReimportRecursive(child))
    };
    
    return JSON.stringify(exportObject, null, 2);
}

function exportNodeForReimportRecursive(node: DocumentNode): any {
    return {
        title: node.title,
        content: node.content,
        summary: node.summary,
        generationPrompt: node.generationPrompt,
        level: node.level,
        children: node.children.map(child => exportNodeForReimportRecursive(child))
    };
}

function exportNodeContent(node: DocumentNode, scope: string, format: string): string {
    if (scope === 'lowest') {
        return exportLowestLayer(node, format);
    } else {
        return exportAllLayers(node, format);
    }
}

function exportLowestLayer(node: DocumentNode, format: string): string {
    const leafNodes = findLeafNodes(node);
    
    if (format === 'html') {
        return generateHtmlContent(leafNodes, 'Lowest Layer Content');
    } else if (format === 'markdown') {
        return generateMarkdownContent(leafNodes);
    } else {
        return generatePlainTextContent(leafNodes);
    }
}

function exportAllLayers(node: DocumentNode, format: string): string {
    if (format === 'html') {
        return generateHtmlHierarchy(node);
    } else if (format === 'markdown') {
        return generateMarkdownHierarchy(node);
    } else {
        return generatePlainTextHierarchy(node);
    }
}

function findLeafNodes(node: DocumentNode): DocumentNode[] {
    if (node.children.length === 0) {
        return [node];
    }
    
    const leafNodes: DocumentNode[] = [];
    for (const child of node.children) {
        leafNodes.push(...findLeafNodes(child));
    }
    return leafNodes;
}

function generateHtmlContent(nodes: DocumentNode[], title: string): string {
    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: Georgia, serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }
        h2 { color: #34495e; margin-top: 2rem; }
        .content { margin-bottom: 2rem; padding: 1rem; background-color: #f8f9fa; border-left: 4px solid #007bff; }
        .meta { font-size: 0.9rem; color: #6c757d; margin-bottom: 0.5rem; }
    </style>
</head>
<body>
    <h1>${title}</h1>`;

    for (const node of nodes) {
        if (node.content && node.content.trim()) {
            html += `
    <h2>${escapeHtml(node.title)}</h2>
    <div class="content">
        <div class="meta">Level: ${node.level}</div>
        ${formatContentAsHtml(node.content)}
    </div>`;
        }
    }

    html += `
</body>
</html>`;
    return html;
}

function generateHtmlHierarchy(node: DocumentNode, level: number = 1): string {
    if (level === 1) {
        let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(node.title)} - Complete Hierarchy</title>
    <style>
        body { font-family: Georgia, serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }
        h2, h3, h4, h5, h6 { color: #34495e; margin-top: 2rem; }
        .content { margin-bottom: 1.5rem; padding: 1rem; background-color: #f8f9fa; border-left: 4px solid #007bff; }
        .summary { margin-bottom: 1rem; padding: 0.75rem; background-color: #e7f3ff; border-left: 4px solid #0056b3; font-style: italic; }
        .level-${level} { margin-left: ${(level - 1) * 1.5}rem; }
    </style>
</head>
<body>`;
        
        html += generateHtmlHierarchyRecursive(node, level);
        html += `
</body>
</html>`;
        return html;
    } else {
        return generateHtmlHierarchyRecursive(node, level);
    }
}

function generateHtmlHierarchyRecursive(node: DocumentNode, level: number): string {
    const headingTag = `h${Math.min(level + 1, 6)}`;
    let html = `
    <div class="level-${level}">
        <${headingTag}>${escapeHtml(node.title)}</${headingTag}>`;

    if (node.summary && node.summary.trim()) {
        html += `
        <div class="summary">${formatContentAsHtml(node.summary)}</div>`;
    }

    if (node.content && node.content.trim()) {
        html += `
        <div class="content">${formatContentAsHtml(node.content)}</div>`;
    }

    for (const child of node.children) {
        html += generateHtmlHierarchyRecursive(child, level + 1);
    }

    html += `
    </div>`;
    return html;
}

function generateMarkdownContent(nodes: DocumentNode[]): string {
    let markdown = `# Lowest Layer Content\n\n`;

    for (const node of nodes) {
        if (node.content && node.content.trim()) {
            markdown += `## ${node.title}\n\n`;
            markdown += `*Level: ${node.level}*\n\n`;
            markdown += `${node.content}\n\n`;
            markdown += `---\n\n`;
        }
    }

    return markdown;
}

function generateMarkdownHierarchy(node: DocumentNode, level: number = 1): string {
    const headingPrefix = '#'.repeat(level);
    let markdown = `${headingPrefix} ${node.title}\n\n`;

    if (node.summary && node.summary.trim()) {
        markdown += `*${node.summary}*\n\n`;
    }

    if (node.content && node.content.trim()) {
        markdown += `${node.content}\n\n`;
    }

    for (const child of node.children) {
        markdown += generateMarkdownHierarchy(child, level + 1);
    }

    return markdown;
}

function generatePlainTextContent(nodes: DocumentNode[]): string {
    let text = `LOWEST LAYER CONTENT\n${'='.repeat(20)}\n\n`;

    for (const node of nodes) {
        if (node.content && node.content.trim()) {
            text += `${node.title.toUpperCase()}\n`;
            text += `${'-'.repeat(node.title.length)}\n`;
            text += `Level: ${node.level}\n\n`;
            text += `${node.content}\n\n`;
            text += `${'~'.repeat(50)}\n\n`;
        }
    }

    return text;
}

function generatePlainTextHierarchy(node: DocumentNode, level: number = 0): string {
    const indent = '  '.repeat(level);
    let text = `${indent}${node.title}\n`;

    if (node.summary && node.summary.trim()) {
        text += `${indent}Summary: ${node.summary}\n`;
    }

    if (node.content && node.content.trim()) {
        const contentLines = node.content.split('\n');
        for (const line of contentLines) {
            text += `${indent}  ${line}\n`;
        }
    }

    text += '\n';

    for (const child of node.children) {
        text += generatePlainTextHierarchy(child, level + 1);
    }

    return text;
}

function formatContentAsHtml(content: string): string {
    // Convert line breaks to HTML and escape special characters
    return escapeHtml(content).replace(/\n/g, '<br>');
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeFilename(filename: string): string {
    // Replace invalid filename characters with underscores
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}

export function renderSettingsModal() {
    const modelSelector = state.getModelSelector();
    if (!modalContent || !modelSelector) return;

    modalContent.innerHTML = `
        <style>
            .modal-content {
                width: 80vw;
                max-width: 1200px;
            }
            .modal-body {
                padding: 1.5rem 2rem;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }
            .settings-section {
                background-color: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 1.5rem;
            }
            .settings-bar {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }
            .settings-bar select,
            .settings-bar input[type="text"] {
                flex-grow: 1;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                line-height: 1.5;
                box-sizing: border-box;
            }
            .settings-bar button {
                padding: 0.75rem 1rem;
                border: none;
                border-radius: 8px;
                background-color: var(--button-bg);
                color: var(--button-text);
                cursor: pointer;
            }
            .settings-bar button:hover {
                background-color: var(--button-bg-hover);
            }
            .settings-bar .button-secondary {
                background-color: #6b7280;
                color: white;
            }
            .settings-bar .button-secondary:hover {
                background-color: #4b5563;
            }
            .settings-bar .button-danger {
                background-color: #ef4444;
                color: white;
            }
            .settings-bar .button-danger:hover {
                background-color: #dc2626;
            }
            #modal-criteria-list {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            .criterion {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }
            .criterion .criterion-text-display,
            .criterion textarea {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                line-height: 1.5;
                box-sizing: border-box;
            }
            .criterion .criterion-text-display {
                cursor: pointer;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .criterion .criterion-text-display:hover {
                background-color: #e9ecef;
            }
            .criterion input[type="number"] {
                width: 65px;
                flex-shrink: 0;
            }
            .criterion input[type="checkbox"] {
                width: 18px;
                height: 18px;
                flex-shrink: 0;
                cursor: pointer;
            }
            .criterion .outline-checkbox {
                accent-color: #3b82f6;
            }
            .criterion .leaf-checkbox {
                accent-color: #10b981;
            }
            .criterion textarea {
                display: none; /* Hidden by default */
                resize: vertical;
                min-height: 80px;
            }
            .criteria-actions { 
                display: flex; 
                gap: 0.75rem; 
                margin-top: 1.5rem; 
            }
        </style>
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 1rem;">
            <h2 style="margin: 0;">Generation Settings</h2>
            <button id="close-settings-modal-btn" style="background: #ef4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
        <div class="modal-body">
            <div id="settings-profile-container" class="settings-section">
                <div class="settings-bar">
                    <select id="modal-profile-select"></select>
                    <button id="modal-load-profile-btn">Load</button>
                    <input type="text" id="modal-new-profile-name" placeholder="New Profile Name...">
                    <button id="modal-save-profile-btn">Save</button>
                    <button id="modal-delete-profile-btn" class="button-danger">Delete</button>
                </div>
                <div class="settings-bar" style="margin-top: 0.5rem; border-top: 1px solid #e5e7eb; padding-top: 0.5rem;">
                    <button id="modal-export-profile-btn" class="button-secondary">Export Profile</button>
                    <button id="modal-import-profile-btn" class="button-secondary">Import Profile</button>
                    <input type="file" id="modal-import-file-input" accept=".json" style="display: none;">
                </div>
            </div>
            <div id="settings-models-container" class="settings-section">
                <h3>Models</h3>
                <!-- ModelSelector will be rendered here -->
            </div>
            <div id="settings-prompts-container" class="settings-section">
                <h3>Prompts</h3>
                <!-- PromptManager will be rendered here -->
            </div>
            <div id="settings-criteria-container" class="settings-section">
                <h3>Quality Criteria</h3>
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; font-size: 0.9rem; color: #6b7280;">
                    <span style="flex-grow: 1;">Criterion</span>
                    <span style="width: 65px; text-align: center;">Goal</span>
                    <span style="width: 18px; text-align: center; color: #3b82f6;" title="Use for outline/branch nodes">O</span>
                    <span style="width: 18px; text-align: center; color: #10b981;" title="Use for leaf nodes">L</span>
                    <span style="width: 24px;"></span>
                </div>
                <div id="modal-criteria-list" style="flex-grow: 1; display: flex; flex-direction: column; gap: 0.75rem;"></div>
                <div style="margin-top: 1.5rem;">
                    <label for="modal-max-iterations">Max Iterations:</label>
                    <input type="number" id="modal-max-iterations" min="1" max="20" value="5" style="max-width: 100px;">
                </div>
                <div class="criteria-actions">
                    <button id="modal-add-criterion-btn" class="button button-secondary">Add</button>
                    <button id="modal-default-criteria-btn" class="button button-secondary">Defaults</button>
                    <button id="modal-copy-criteria-btn" class="button button-secondary">Copy</button>
                    <button id="modal-paste-criteria-btn" class="button button-secondary">Paste</button>
                </div>
            </div>
        </div>
    `;

    // --- Render and Wire-Up Components ---

    // Model Selector
    const modelsContainer = getElementById('settings-models-container');
    modelSelector.render(modelsContainer);

    // Prompt Manager
    const promptsContainer = getElementById('settings-prompts-container');
    const settingsManager = state.getSettingsManager();
    if (settingsManager) {
        const promptManager = new PromptManager(promptsContainer, (prompts) => {
            // Just save the prompts. The orchestrator will be re-created with new prompts
            // the next time the models are selected, or on the next app load.
            state.setOrchestratorPrompts(prompts);
        }, settingsManager);
    }

    // Criteria Editor
    const modalCriteriaList = getElementById('modal-criteria-list');
    const modalMaxIterations = getElementById('modal-max-iterations') as HTMLInputElement;
    const modalDefaultCriteriaBtn = getElementById('modal-default-criteria-btn');

    // --- Profile Management ---
    const settingsManagerInstance = state.getSettingsManager();
    const profileSelect = getElementById('modal-profile-select') as HTMLSelectElement;
    const newProfileNameInput = getElementById('modal-new-profile-name') as HTMLInputElement;

    const populateProfileSelector = () => {
        if (!settingsManagerInstance) return;
        const profiles = settingsManagerInstance.getProfileNames();
        const lastUsed = settingsManagerInstance.getLastUsedProfileName();
        profileSelect.innerHTML = profiles.map(p => `<option value="${p}" ${p === lastUsed ? 'selected' : ''}>${p}</option>`).join('');
    };

    const applyProfileToUI = (profile: SettingsProfile | null) => {
        if (!profile || !modelSelector) return;
        
        // Apply models
        if (profile.selectedModels) modelSelector.setSelectedModels(profile.selectedModels);
        
        // Apply criteria and iterations
        renderCriteria(modalCriteriaList, profile.criteria);
        modalMaxIterations.value = String(profile.maxIterations);

        // Note: Prompts are handled by the PromptManager instance which is aware of the SettingsManager
        // Re-rendering or a more direct update might be needed if prompts are to be swapped dynamically.
        // For now, we assume the PromptManager reflects the correct state or is re-initialized.
    };

    getElementById('modal-load-profile-btn').addEventListener('click', () => {
        if (!settingsManagerInstance) return;
        const profileName = profileSelect.value;
        const profile = settingsManagerInstance.getProfile(profileName);
        applyProfileToUI(profile || null);
        settingsManagerInstance.setLastUsedProfile(profileName);
        alert(`Profile "${profileName}" loaded.`);
    });

    getElementById('modal-save-profile-btn').addEventListener('click', () => {
        if (!settingsManagerInstance || !modelSelector) return;
        let profileName = newProfileNameInput.value.trim();
        if (!profileName) {
            profileName = profileSelect.value;
        }
        if (!profileName) {
            alert('Please enter a name for the new profile or select an existing one to overwrite.');
            return;
        }

        const currentSettings: SettingsProfile = {
            selectedModels: modelSelector.getSelectedModels(),
            criteria: getCriteriaFromUI(modalCriteriaList),
            maxIterations: parseInt(modalMaxIterations.value, 10),
            prompt: '' // Prompt is managed separately, but the property is required.
        };

        settingsManagerInstance.saveProfile(profileName, currentSettings);
        settingsManagerInstance.setLastUsedProfile(profileName);
        newProfileNameInput.value = '';
        populateProfileSelector();
        profileSelect.value = profileName;
        alert(`Profile "${profileName}" saved.`);
    });

    getElementById('modal-delete-profile-btn').addEventListener('click', () => {
        const profileName = profileSelect.value;
        if (!settingsManagerInstance || !profileName) return;

        if (confirm(`Are you sure you want to delete the profile "${profileName}"?`)) {
            settingsManagerInstance.deleteProfile(profileName);
            populateProfileSelector();
            // Load the default profile after deleting
            const defaultProfile = settingsManagerInstance.getProfile('default');
            applyProfileToUI(defaultProfile || null);
            alert(`Profile "${profileName}" deleted.`);
        }
    });

    // Export Profile functionality
    getElementById('modal-export-profile-btn').addEventListener('click', () => {
        if (!settingsManagerInstance) return;
        const profileName = profileSelect.value;
        if (!profileName) {
            alert('Please select a profile to export.');
            return;
        }
        
        try {
            settingsManagerInstance.downloadProfileExport(profileName);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export profile. Please try again.');
        }
    });

    // Import Profile functionality
    const fileInput = getElementById('modal-import-file-input') as HTMLInputElement;
    
    getElementById('modal-import-profile-btn').addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file || !settingsManagerInstance) return;

        try {
            const result = await settingsManagerInstance.importProfileFromFile(
                file,
                async (profileName: string) => {
                    return confirm(`Profile "${profileName}" already exists. Do you want to overwrite it?\n\nNote: Your existing OpenRouter API key will be preserved.`);
                }
            );

            if (result.success) {
                alert(result.message);
                populateProfileSelector();
                // Refresh the UI to show the imported profile
                const lastUsedProfile = settingsManagerInstance.getLastUsedProfile();
                applyProfileToUI(lastUsedProfile || null);
            } else {
                alert(`Import failed: ${result.message}`);
            }
        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import profile. Please check the file format and try again.');
        }

        // Clear the file input for future use
        fileInput.value = '';
    });


    // Initial Population
    populateProfileSelector();
    const lastUsedProfile = settingsManagerInstance?.getLastUsedProfile();
    applyProfileToUI(lastUsedProfile || null);


    // --- Old Criteria Editor Wiring ---
    getElementById('modal-add-criterion-btn').addEventListener('click', () => {
        const newCriterion: QualityCriterion = {
            name: "New Criterion...",
            goal: 8,
            description: "",
            outline: true,
            leaf: true
        };
        const newItem = createCriterionElement(newCriterion);
        modalCriteriaList.appendChild(newItem);
        
        const textarea = newItem.querySelector('textarea');
        if (textarea) {
            textarea.style.display = 'block';
            textarea.focus();
            autoResizeTextarea.call(textarea);
            const textDisplay = newItem.querySelector('.criterion-text-display');
            if(textDisplay) (textDisplay as HTMLElement).style.display = 'none';
        }
    });
    getElementById('modal-default-criteria-btn').addEventListener('click', () => {
        if (confirm("This will replace your current criteria list with the application defaults. Are you sure?")) {
            renderCriteria(modalCriteriaList, DEFAULT_CRITERIA);
        }
    });
    getElementById('modal-copy-criteria-btn').addEventListener('click', () => handleCopyCriteria(modalCriteriaList));
    getElementById('modal-paste-criteria-btn').addEventListener('click', () => handlePasteCriteria(modalCriteriaList));
    modalCriteriaList.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('remove-criterion-btn')) {
            (e.target as HTMLElement).closest('.criterion')?.remove();
        }
    });

    getElementById('close-settings-modal-btn').addEventListener('click', closeModal);
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

function autoResizeTextarea(this: HTMLTextAreaElement) {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
}

function createCriterionElement(criterion: QualityCriterion): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'criterion';

    // Combine name and description for full text editing
    const fullText = criterion.description 
        ? `${criterion.name}. ${criterion.description}`
        : criterion.name;

    const textarea = document.createElement('textarea');
    textarea.placeholder = "e.g., 'Clarity and conciseness'";
    textarea.value = fullText;
    textarea.addEventListener('input', autoResizeTextarea);
    textarea.addEventListener('focus', function() { this.selectionStart = this.selectionEnd = this.value.length; });

    const goalInput = document.createElement('input');
    goalInput.type = 'number';
    goalInput.min = '1';
    goalInput.max = '10';
    goalInput.value = criterion.goal.toString();
    goalInput.title = 'Goal (1-10)';



    // Create checkboxes for outline and leaf
    const outlineCheckbox = document.createElement('input');
    outlineCheckbox.type = 'checkbox';
    outlineCheckbox.className = 'outline-checkbox';
    outlineCheckbox.checked = criterion.outline !== false; // Default to true if undefined
    outlineCheckbox.title = 'Use for outline/branch nodes';

    const leafCheckbox = document.createElement('input');
    leafCheckbox.type = 'checkbox';
    leafCheckbox.className = 'leaf-checkbox';
    leafCheckbox.checked = criterion.leaf !== false; // Default to true if undefined
    leafCheckbox.title = 'Use for leaf nodes';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-criterion-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove criterion';

    const textDisplay = document.createElement('div');
    textDisplay.className = 'criterion-text-display';

    const textareaContainer = document.createElement('div');
    textareaContainer.style.flexGrow = '1';
    textareaContainer.style.position = 'relative';

    // Store the full text in a data attribute to ensure we never lose it
    div.setAttribute('data-full-text', fullText);

    const updateDisplay = (text: string) => {
        textDisplay.textContent = text.split('.')[0] + (text.includes('.') && text.split('.')[0] !== text ? '.' : '');
    };
    
    updateDisplay(fullText);
    textarea.value = fullText;
    textarea.style.display = 'none';

    textDisplay.addEventListener('click', () => {
        // When editing starts, ensure textarea has the full text (name + description)
        const storedFullText = div.getAttribute('data-full-text') || fullText;
        textarea.value = storedFullText;
        textDisplay.style.display = 'none';
        textarea.style.display = 'block';
        textarea.focus();
        autoResizeTextarea.call(textarea);
    });

    textarea.addEventListener('blur', () => {
        // When editing ends, store the full text and update display
        div.setAttribute('data-full-text', textarea.value);
        textarea.style.display = 'none';
        textDisplay.style.display = 'block';
        updateDisplay(textarea.value);
    });
    
    textareaContainer.appendChild(textDisplay);
    textareaContainer.appendChild(textarea);
    
    div.appendChild(textareaContainer);
    div.appendChild(goalInput);
    div.appendChild(outlineCheckbox);
    div.appendChild(leafCheckbox);
    div.appendChild(removeBtn);

    return div;
}

function getCriteriaFromUI(container: HTMLElement): QualityCriterion[] {
    const criteria: QualityCriterion[] = [];
    const criterionElements = container.querySelectorAll('.criterion');
    criterionElements.forEach(el => {
        const div = el as HTMLElement;
        const textarea = el.querySelector<HTMLTextAreaElement>('textarea');
        const goalInput = el.querySelector<HTMLInputElement>('input[type="number"]');
        const outlineCheckbox = el.querySelector<HTMLInputElement>('.outline-checkbox');
        const leafCheckbox = el.querySelector<HTMLInputElement>('.leaf-checkbox');
        
        if (textarea && goalInput && outlineCheckbox && leafCheckbox) {
            // Use the full text from data attribute, fall back to textarea value
            const fullText = div.getAttribute('data-full-text') || textarea.value;
            const goal = parseInt(goalInput.value, 10);
            const outline = outlineCheckbox.checked;
            const leaf = leafCheckbox.checked;
            
            if (fullText && !isNaN(goal)) {
                // Parse the full text to extract name and description
                const firstDotIndex = fullText.indexOf('.');
                let name: string;
                let description: string | undefined;
                
                if (firstDotIndex !== -1 && firstDotIndex < fullText.length - 1) {
                    // Has description after first period
                    name = fullText.substring(0, firstDotIndex);
                    description = fullText.substring(firstDotIndex + 1).trim();
                } else {
                    // No description, just the name
                    name = fullText;
                    description = undefined;
                }
                
                const criterion: QualityCriterion = { name, goal, outline, leaf };
                if (description) {
                    criterion.description = description;
                }
                criteria.push(criterion);
            }
        }
    });
    return criteria;
}

function isCriteriaArray(data: any): data is QualityCriterion[] {
    return Array.isArray(data) && data.every(item =>
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'goal' in item &&
        typeof item.name === 'string' &&
        typeof item.goal === 'number' &&
        // Optional properties - if present, must be boolean
        (item.outline === undefined || typeof item.outline === 'boolean') &&
        (item.leaf === undefined || typeof item.leaf === 'boolean') &&
        (item.description === undefined || typeof item.description === 'string')
    );
}

function migrateCriteriaFormat(criteria: any[]): QualityCriterion[] {
    return criteria.map(criterion => {
        // Remove weight property if it exists and add outline/leaf defaults if missing
        const migrated: QualityCriterion = {
            name: criterion.name,
            goal: criterion.goal,
            outline: criterion.outline !== undefined ? criterion.outline : true,
            leaf: criterion.leaf !== undefined ? criterion.leaf : true
        };
        
        if (criterion.description) {
            migrated.description = criterion.description;
        }
        
        return migrated;
    });
}

function renderCriteria(container: HTMLElement, criteria: QualityCriterion[]) {
    container.innerHTML = '';
    // Migrate criteria format to ensure compatibility
    const migratedCriteria = migrateCriteriaFormat(criteria);
    migratedCriteria.forEach(c => {
        const criterionElement = createCriterionElement(c);
        container.appendChild(criterionElement);
        const textarea = criterionElement.querySelector('textarea');
        if (textarea) {
            autoResizeTextarea.call(textarea);
        }
    });
}

async function handleCopyCriteria(container: HTMLElement) {
    const criteria = getCriteriaFromUI(container);
    if (criteria.length > 0) {
        try {
            await navigator.clipboard.writeText(JSON.stringify(criteria, null, 2));
            alert('Criteria copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy criteria: ', err);
            alert('Failed to copy criteria. See console for details.');
        }
    } else {
        alert('No criteria to copy.');
    }
}

async function handlePasteCriteria(container: HTMLElement) {
    try {
        const text = await navigator.clipboard.readText();
        const parsed = JSON.parse(text);
        if (isCriteriaArray(parsed)) {
            if (confirm('Are you sure you want to replace your current criteria with the content from your clipboard?')) {
                renderCriteria(container, parsed);
            }
        } else {
            alert('Clipboard content is not valid criteria data.');
        }
    } catch (err) {
        console.error('Failed to paste criteria: ', err);
        alert('Failed to read from clipboard or parse data. See console for details.');
    }
} 