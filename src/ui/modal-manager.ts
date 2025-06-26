import { getElementById, modalContainer, modalContent, testModalContainer, testModalContent, newProjectModalContainer, newProjectModalContent } from './dom-elements';
import { ProjectManager } from '../ProjectManager';
import { ProjectTemplate } from '../ProjectTemplate';
import * as state from '../state';

import { SettingsProfile, DEFAULT_CRITERIA, SettingsManager } from '../SettingsManager';
import { QualityCriterion, AILogEntry } from '../types';
import { OrchestratorPrompts, defaultPrompts } from '../PromptManager';
import { DocumentNode } from '../DocumentNode';
import { AILogService } from '../AILogService';
import { refreshGlobalProfileSelector } from './project-ui';

// --- Generic Modal Functions ---
// TODO: Migrate to new modal system
// These functions are maintained for backward compatibility during migration

import { openGenericModal as newOpenGenericModal, closeGenericModal as newCloseGenericModal } from './modals/index';

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

function performExport(_projectManager: ProjectManager, node: DocumentNode, scope: string, format: string) {
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
        context: node.context,
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
        context: node.context,
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

    if (node.context && node.context.trim()) {
        html += `
        <div class="summary">${formatContentAsHtml(node.context)}</div>`;
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

    if (node.context && node.context.trim()) {
        markdown += `*${node.context}*\n\n`;
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

    if (node.context && node.context.trim()) {
        text += `${indent}Context: ${node.context}\n`;
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

function escapeHtmlAttribute(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function sanitizeFilename(filename: string): string {
    // Replace invalid filename characters with underscores
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}

// Simplified PromptManager for auto-save settings modal
class PromptManagerAutoSave {
    private prompts: OrchestratorPrompts;
    private onChange: () => void;
    private root: HTMLElement;
    private settingsManager: SettingsManager;

    constructor(root: HTMLElement, onChange: () => void, settingsManager: SettingsManager) {
        this.root = root;
        this.onChange = onChange;
        this.settingsManager = settingsManager;
        this.prompts = this.settingsManager.getPrompts();
        this.render();
    }

    private async saveToStorage() {
        await this.settingsManager.savePrompts(this.prompts);
        this.onChange();
    }

    private revertToDefaults() {
        if (confirm('Are you sure you want to revert all prompts to their default values? Any unsaved changes will be lost.')) {
            this.prompts = { ...defaultPrompts };
            this.render();
            this.saveToStorage();
        }
    }

    render() {
        this.root.innerHTML = `
            <style>
                .prompt-editor { margin-bottom: 1.5rem; }
                .prompt-editor label { font-weight: 500; display: block; margin-bottom: 0.5rem; }
                .prompt-editor textarea { 
                    width: 100%; 
                    min-height: 150px; 
                    font-family: monospace;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    resize: vertical;
                    line-height: 1.4;
                }
                .placeholders { 
                    font-size: 0.8rem; 
                    font-style: italic; 
                    margin-bottom: 0.5rem; 
                    color: #6b7280; 
                }
                .placeholders code { 
                    background-color: #f3f4f6; 
                    padding: 2px 4px; 
                    border-radius: 3px; 
                    font-family: monospace;
                }
                .prompt-description { 
                    font-size: 0.875rem; 
                    margin-bottom: 0.75rem; 
                    color: #4b5563; 
                    line-height: 1.5;
                }
                .prompt-actions {
                    margin-top: 1.5rem;
                    padding-top: 1rem;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    gap: 0.75rem;
                }
                .btn-outline {
                    padding: 0.5rem 1rem;
                    border: 1px solid #d1d5db;
                    background: transparent;
                    color: #6b7280;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-outline:hover {
                    background-color: #f3f4f6;
                    color: #374151;
                }
            </style>
            <p style="color: #6b7280; font-size: 0.875rem; margin-bottom: 1rem;">Configure the templates used by AI agents. Changes are saved automatically.</p>
        `;

        const placeholders: Record<keyof OrchestratorPrompts, string[]> = {
            content_generation_initial: ['prompt', 'criteria'],
            content_generation_iterative: ['prompt', 'lastResponse', 'editorAdvice', 'criteria'],
            rater: ['originalPrompt', 'response', 'criteria'],
            editor: ['response', 'ratings'],
            summarize_system: ['content'],
            expand_list_user: ['path', 'context', 'child_level_name', 'count', 'parent_content', 'content'],
            content_generation_user: ['path', 'context', 'title', 'content', 'draftorfresh'],
            branch_content_generation_user: ['path', 'context', 'title', 'child_level_name', 'count', 'content', 'draftorfresh'],
            create_children_from_outline_user: ['outline_content', 'child_level_name', 'context', 'content'],
            prompt_for_child_generation_prompt: ['parent_content', 'context', 'child_title', 'content'],
            context_synthesis_user: ['parent_context', 'node_content'],
            context_extraction_user: ['extraction_request', 'node_title', 'content'],
            expand_text_user: ['content', 'path', 'context', 'title'],
        };

        const promptDescriptions: Partial<Record<keyof OrchestratorPrompts, string>> = {
            content_generation_initial: "Main system prompt for the iterative generation loop.",
            content_generation_iterative: "System prompt for subsequent iterations with feedback.",
            content_generation_user: "Template for generating content in leaf nodes.",
            branch_content_generation_user: "Template for generating content in branch nodes.",
            rater: "System prompt for the AI that scores generated content.",
            editor: "System prompt for the AI that provides improvement feedback.",
            summarize_system: "System prompt for summarizing generated content.",
            expand_list_user: "Prompt for generating bulleted lists of child titles.",
            create_children_from_outline_user: "Reads free-form text and generates structured child titles.",
            prompt_for_child_generation_prompt: "Creates generation prompts for new child nodes.",
            context_synthesis_user: "Combines parent context with node content to create focused context for child generation.",
            context_extraction_user: "Analyzes node content to extract specific information (characters, places, themes, etc.).",
            expand_text_user: "Simple prompt for expanding text with more detail."
        };

        Object.keys(this.prompts).forEach(key => {
            const k = key as keyof OrchestratorPrompts;
            const editorDiv = document.createElement('div');
            editorDiv.className = 'prompt-editor';
            
            const label = document.createElement('label');
            label.textContent = `${k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;

            editorDiv.appendChild(label);

            const description = promptDescriptions[k];
            if (description) {
                const descriptionEl = document.createElement('p');
                descriptionEl.className = 'prompt-description';
                descriptionEl.textContent = description;
                editorDiv.appendChild(descriptionEl);
            }

            const availablePlaceholders = placeholders[k];
            if (availablePlaceholders && availablePlaceholders.length > 0) {
                const placeholderText = document.createElement('div');
                placeholderText.className = 'placeholders';
                placeholderText.innerHTML = `Available placeholders: ${availablePlaceholders.map(p => `<code>{{${p}}}</code>`).join(', ')}`;
                editorDiv.appendChild(placeholderText);
            }
            
            const textarea = document.createElement('textarea');
            textarea.value = this.prompts[k];
            textarea.addEventListener('input', () => {
                this.prompts[k] = textarea.value;
                this.onChange();
            });

            editorDiv.appendChild(textarea);
            this.root.appendChild(editorDiv);
        });

        // Add reset to defaults button
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'prompt-actions';
        
        const resetButton = document.createElement('button');
        resetButton.className = 'btn-outline';
        resetButton.textContent = 'Reset All Prompts to Defaults';
        resetButton.addEventListener('click', () => {
            this.revertToDefaults();
        });
        
        actionsDiv.appendChild(resetButton);
        this.root.appendChild(actionsDiv);
    }
}

export function renderSettingsModal() {
    const modelSelector = state.getModelSelector();
    if (!modalContent || !modelSelector) return;

    modalContent.innerHTML = `
        <style>
            .modal-content {
                width: 80vw;
                max-width: 1200px;
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }
            .modal-header {
                padding: 1.5rem 2rem 1rem 2rem;
                border-bottom: 1px solid #e5e7eb;
                flex-shrink: 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .modal-body {
                padding: 1.5rem 2rem;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
                overflow-y: auto;
                flex: 1;
            }
            .modal-footer {
                padding: 1rem 2rem 1.5rem 2rem;
                border-top: 1px solid #e5e7eb;
                flex-shrink: 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 1rem;
            }
            .footer-left {
                display: flex;
                align-items: center;
                gap: 1rem;
                font-size: 0.875rem;
                color: #6b7280;
            }
            .footer-right {
                display: flex;
                gap: 0.75rem;
            }
            .unsaved-indicator {
                display: none;
                color: #f59e0b;
                font-weight: 500;
            }
            .unsaved-indicator.visible {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .unsaved-indicator::before {
                content: "●";
                font-size: 1.2em;
            }
            .settings-section {
                background-color: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 1.5rem;
            }
            .settings-section h3, .settings-section h4 {
                margin-top: 0;
                margin-bottom: 1rem;
                color: #111827;
            }
            .profile-bar {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                margin-bottom: 1rem;
            }
            .profile-bar select,
            .profile-bar input[type="text"] {
                flex-grow: 1;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                line-height: 1.5;
                box-sizing: border-box;
            }
            .profile-actions {
                display: flex;
                gap: 0.5rem;
                flex-wrap: wrap;
            }
            .profile-actions button {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 6px;
                font-size: 0.875rem;
                cursor: pointer;
                transition: all 0.2s;
            }
            .btn-primary { background-color: #4f46e5; color: white; }
            .btn-primary:hover { background-color: #4338ca; }
            .btn-secondary { background-color: #6b7280; color: white; }
            .btn-secondary:hover { background-color: #4b5563; }
            .btn-danger { background-color: #ef4444; color: white; }
            .btn-danger:hover { background-color: #dc2626; }
            .btn-outline { background-color: transparent; color: #6b7280; border: 1px solid #d1d5db; }
            .btn-outline:hover { background-color: #f3f4f6; color: #374151; }
            
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
                display: none;
                resize: vertical;
                min-height: 80px;
            }
            .criteria-actions { 
                display: flex; 
                gap: 0.75rem; 
                margin-top: 1.5rem; 
            }
            .current-profile-info {
                padding: 0.75rem 1rem;
                background-color: #eff6ff;
                border: 1px solid #bfdbfe;
                border-radius: 8px;
                font-size: 0.875rem;
                color: #1e40af;
                margin-bottom: 1rem;
            }
        </style>
        <div class="modal-header">
            <h2 style="margin: 0; font-size: 1.5rem; font-weight: 600;">Settings</h2>
            <button id="close-settings-modal-btn" style="background: #ef4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
        <div class="modal-body">
            <div id="settings-profile-container" class="settings-section">
                <h3>Profile Management</h3>
                <div class="current-profile-info">
                    <strong>Active Profile:</strong> <span id="current-profile-name">Loading...</span>
                    <div style="margin-top: 0.25rem; font-size: 0.8em; opacity: 0.8;">Changes are automatically saved to this profile</div>
                </div>
                <div class="profile-bar">
                    <select id="modal-profile-select" title="Select profile"></select>
                    <input type="text" id="modal-new-profile-name" placeholder="New profile name...">
                    <button id="modal-create-profile-btn" title="Create new profile" style="background: #10b981; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">+</button>
                </div>
                <div class="profile-actions">
                    <button id="modal-delete-profile-btn" class="btn-danger">Delete Profile</button>
                    <button id="modal-reset-defaults-btn" class="btn-secondary">Reset Prompts and Criteria to Default</button>
                    <div style="margin-left: auto; display: flex; gap: 0.5rem;">
                        <button id="modal-export-profile-btn" class="btn-outline">Export</button>
                        <button id="modal-import-profile-btn" class="btn-outline">Import</button>
                    </div>
                    <input type="file" id="modal-import-file-input" accept=".json" style="display: none;">
                </div>
            </div>
            
            <div id="settings-models-container" class="settings-section">
                <h3>Models</h3>
                <!-- ModelSelector will be rendered here -->
            </div>
            
            <div id="settings-prompts-container" class="settings-section">
                <h3>Generation Prompts</h3>
                <!-- PromptManager will be rendered here -->
            </div>
            
            <div id="settings-ai-logging-container" class="settings-section">
                <h3>AI Request Logging</h3>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer;">
                        <input type="checkbox" id="ai-logging-checkbox" style="width: 18px; height: 18px;">
                        <span style="font-weight: 500;">Enable AI Request Logging</span>
                    </label>
                    <p style="margin: 0; font-size: 0.875rem; color: #6b7280;">
                        When enabled, all AI requests and responses will be logged for debugging and analysis. 
                        This can help troubleshoot generation issues and analyze AI behavior.
                    </p>
                    <div style="display: flex; gap: 0.75rem;">
                        <button id="view-ai-logs-btn" class="btn-outline">View AI Logs</button>
                    </div>
                </div>
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
                <div id="modal-criteria-list"></div>
                <div style="margin-top: 1.5rem;">
                    <label for="modal-max-iterations" style="font-weight: 500;">Max Iterations:</label>
                    <input type="number" id="modal-max-iterations" min="1" max="20" value="5" style="margin-left: 0.5rem; max-width: 100px; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px;">
                </div>
                <div class="criteria-actions">
                    <button id="modal-add-criterion-btn" class="btn-outline">Add Criterion</button>
                    <button id="modal-default-criteria-btn" class="btn-outline">Reset to Defaults</button>
                    <button id="modal-copy-criteria-btn" class="btn-outline">Copy</button>
                    <button id="modal-paste-criteria-btn" class="btn-outline">Paste</button>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <div class="footer-left">
                <div id="unsaved-indicator" class="unsaved-indicator">Unsaved changes</div>
                <div id="save-status" style="color: #10b981; display: none;">All changes saved</div>
            </div>
            <div class="footer-right">
                <button id="cancel-settings-btn" style="background: #6b7280; color: white; border: none; border-radius: 8px; padding: 0.75rem 1.5rem; cursor: pointer; font-size: 0.875rem; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#4b5563'" onmouseout="this.style.backgroundColor='#6b7280'">Cancel</button>
                <button id="apply-settings-btn" style="background: #4f46e5; color: white; border: none; border-radius: 8px; padding: 0.75rem 1.5rem; cursor: pointer; font-size: 0.875rem; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#4338ca'" onmouseout="this.style.backgroundColor='#4f46e5'">Apply & Close</button>
            </div>
        </div>
    `;

    // --- Initialize Components ---
    let hasUnsavedChanges = false;
    let saveTimeout: number | null = null;
    
    const updateUnsavedIndicator = (show: boolean) => {
        hasUnsavedChanges = show;
        const indicator = getElementById('unsaved-indicator');
        const saveStatus = getElementById('save-status');
        
        if (show) {
            indicator.classList.add('visible');
            saveStatus.style.display = 'none';
        } else {
            indicator.classList.remove('visible');
            saveStatus.style.display = 'block';
            setTimeout(() => {
                saveStatus.style.display = 'none';
            }, 2000);
        }
    };

    const autoSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        updateUnsavedIndicator(true);
        
        saveTimeout = window.setTimeout(async () => {
            await saveCurrentSettingsToProfile();
            updateUnsavedIndicator(false);
        }, 1000); // Auto-save after 1 second of inactivity
    };

    const saveCurrentSettingsToProfile = async () => {
        const settingsManagerInstance = state.getSettingsManager();
        if (!settingsManagerInstance || !modelSelector) return;

        const activeProfileName = settingsManagerInstance.getLastUsedProfileName();
        if (!activeProfileName) return;

        // Get all current values from UI
        const modalMaxIterations = getElementById('modal-max-iterations') as HTMLInputElement;
        const modalCriteriaList = getElementById('modal-criteria-list');

        const currentSettings: SettingsProfile = {
            selectedModels: modelSelector.getSelectedModels(),
            criteria: getCriteriaFromUI(modalCriteriaList),
            maxIterations: parseInt(modalMaxIterations.value, 10),
            prompt: '', // Legacy field - unused but required by interface
            contextExtractionPrompt: '' // Legacy field - now part of prompts system
        };

        await settingsManagerInstance.saveProfile(activeProfileName, currentSettings);
    };

    // Model Selector
    const modelsContainer = getElementById('settings-models-container');
    modelSelector.render(modelsContainer);
    
    // Add auto-save for model changes by monitoring the container
    modelsContainer.addEventListener('change', autoSave);
    modelsContainer.addEventListener('input', autoSave);

    // Prompt Manager (modified to work with auto-save)
    const promptsContainer = getElementById('settings-prompts-container');
    const settingsManager = state.getSettingsManager();
    if (settingsManager) {
        // Create a custom prompt manager without save buttons
        new PromptManagerAutoSave(promptsContainer, autoSave, settingsManager);
    }

    // Wire up auto-save for all form elements
    const modalCriteriaList = getElementById('modal-criteria-list');
    const modalMaxIterations = getElementById('modal-max-iterations') as HTMLInputElement;
    
    modalMaxIterations.addEventListener('input', autoSave);
    modalCriteriaList.addEventListener('input', autoSave);
    modalCriteriaList.addEventListener('change', autoSave);

    // --- Profile Management ---
    const settingsManagerInstance = state.getSettingsManager();
    const profileSelect = getElementById('modal-profile-select') as HTMLSelectElement;
    const newProfileNameInput = getElementById('modal-new-profile-name') as HTMLInputElement;
    const currentProfileName = getElementById('current-profile-name');

    const populateProfileSelector = () => {
        if (!settingsManagerInstance) return;
        const profiles = settingsManagerInstance.getProfileNames();
        const lastUsed = settingsManagerInstance.getLastUsedProfileName();
        profileSelect.innerHTML = profiles.map(p => `<option value="${p}" ${p === lastUsed ? 'selected' : ''}>${p}</option>`).join('');
        if (currentProfileName && lastUsed) {
            currentProfileName.textContent = lastUsed;
        }
    };

    const applyProfileToUI = (profile: SettingsProfile | null) => {
        if (!profile || !modelSelector) return;
        
        // Clear any pending auto-save to prevent race conditions
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        
        // Apply models
        if (profile.selectedModels) modelSelector.setSelectedModels(profile.selectedModels);
        
        // Apply criteria and iterations
        renderCriteria(modalCriteriaList, profile.criteria);
        modalMaxIterations.value = String(profile.maxIterations);
        
        // Context extraction prompt is now handled by the prompts system

        // Update current profile display
        populateProfileSelector();
        updateUnsavedIndicator(false);
    };

    // Immediately load profile when selection changes
    profileSelect.addEventListener('change', () => {
        if (!settingsManagerInstance) return;
        const profileName = profileSelect.value;
        const profile = settingsManagerInstance.getProfile(profileName);
        applyProfileToUI(profile || null);
        settingsManagerInstance.setLastUsedProfile(profileName);
        
        // Refresh the global profile selector in the main UI
        refreshGlobalProfileSelector();
    });

    getElementById('modal-create-profile-btn').addEventListener('click', () => {
        if (!settingsManagerInstance || !modelSelector) return;
        const profileName = newProfileNameInput.value.trim();
        if (!profileName) {
            alert('Please enter a name for the new profile.');
            return;
        }

        // Check if profile already exists
        if (settingsManagerInstance.getProfile(profileName)) {
            alert(`A profile named "${profileName}" already exists.`);
            return;
        }

        // Get current settings to copy
        const currentSettings: SettingsProfile = {
            selectedModels: modelSelector.getSelectedModels(),
            criteria: getCriteriaFromUI(modalCriteriaList),
            maxIterations: parseInt(modalMaxIterations.value, 10),
            prompt: '', // Legacy field - unused but required by interface
            contextExtractionPrompt: '' // Legacy field - now part of prompts system
        };

        // Save the new profile
        settingsManagerInstance.saveProfile(profileName, currentSettings);
        settingsManagerInstance.setLastUsedProfile(profileName);
        
        // Clear the input field
        newProfileNameInput.value = '';
        
        // Update the profile selector and select the new profile
        populateProfileSelector();
        profileSelect.value = profileName;
        
        // Refresh the global profile selector in the main UI
        refreshGlobalProfileSelector();
        
        alert(`Profile "${profileName}" created and activated.`);
    });

    // Allow pressing Enter in the new profile name input to create the profile
    newProfileNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            getElementById('modal-create-profile-btn').click();
        }
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
            
            // Refresh the global profile selector in the main UI
            refreshGlobalProfileSelector();
            
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
                
                // Refresh the global profile selector in the main UI
                refreshGlobalProfileSelector();
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

    // Reset Prompts and Criteria to Default
    getElementById('modal-reset-defaults-btn').addEventListener('click', () => {
        // Trigger the existing criteria reset button
        const criteriaResetBtn = document.getElementById('modal-default-criteria-btn');
        if (criteriaResetBtn) {
            criteriaResetBtn.click();
        }
        
        // Trigger the existing prompts reset button (it's created dynamically, so find it by text)
        const promptsContainer = getElementById('settings-prompts-container');
        if (promptsContainer) {
            const promptResetBtn = promptsContainer.querySelector('button') as HTMLButtonElement;
            if (promptResetBtn && promptResetBtn.textContent?.includes('Reset All Prompts')) {
                promptResetBtn.click();
            }
        }
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
        autoSave();
    });
    getElementById('modal-default-criteria-btn').addEventListener('click', () => {
        if (confirm("This will replace your current criteria list with the application defaults. Are you sure?")) {
            renderCriteria(modalCriteriaList, DEFAULT_CRITERIA);
            autoSave();
        }
    });
    getElementById('modal-copy-criteria-btn').addEventListener('click', () => handleCopyCriteria(modalCriteriaList));
    getElementById('modal-paste-criteria-btn').addEventListener('click', async () => {
        await handlePasteCriteria(modalCriteriaList);
        autoSave();
    });
    modalCriteriaList.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('remove-criterion-btn')) {
            (e.target as HTMLElement).closest('.criterion')?.remove();
            autoSave();
        }
    });

    // --- AI Logging Event Handlers ---
    const aiLoggingCheckbox = getElementById('ai-logging-checkbox') as HTMLInputElement;
    const viewLogsBtn = getElementById('view-ai-logs-btn');

    // Initialize AI logging checkbox state
    if (settingsManagerInstance) {
        aiLoggingCheckbox.checked = settingsManagerInstance.isAILoggingEnabled();
    }

    // Handle AI logging checkbox changes
    aiLoggingCheckbox.addEventListener('change', async () => {
        if (settingsManagerInstance) {
            await settingsManagerInstance.setAILoggingEnabled(aiLoggingCheckbox.checked);
        }
    });

    // Handle view logs button click
    viewLogsBtn.addEventListener('click', () => {
        // Close the settings modal first
        closeModal();
        // Open the AI log modal
        openAILogModal();
    });

    // Footer button handlers
    getElementById('cancel-settings-btn').addEventListener('click', () => {
        if (hasUnsavedChanges) {
            if (confirm('You have unsaved changes. Are you sure you want to cancel?')) {
                closeModal();
            }
        } else {
            closeModal();
        }
    });

    getElementById('apply-settings-btn').addEventListener('click', async () => {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        await saveCurrentSettingsToProfile();
        updateUnsavedIndicator(false);
        closeModal();
    });

    getElementById('close-settings-modal-btn').addEventListener('click', () => {
        if (hasUnsavedChanges) {
            if (confirm('You have unsaved changes. Are you sure you want to close?')) {
                closeModal();
            }
        } else {
            closeModal();
        }
    });
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

    closeBtn.addEventListener('click', closeModal);

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