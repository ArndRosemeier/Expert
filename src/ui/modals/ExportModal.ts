/**
 * Export Modal - Modal for exporting node content in various formats
 */

import { BaseModal } from './core/BaseModal';
import { ExportService } from './services/ExportService';
import { ExportScope, ExportFormat, HierarchyTitleConfig } from './types/ExportTypes';
import { DocumentNode } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';
import { ModalConfig } from './types/ModalTypes';
import { createElement } from './core/modal-utils';

export interface ExportModalConfig extends ModalConfig {
    projectManager: ProjectManager;
    node: DocumentNode;
}

export interface ExportModalEvents {
    exported: { filename: string; scope: ExportScope; format: ExportFormat };
    cancelled: void;
}

export class ExportModal extends BaseModal {
    private projectManager: ProjectManager;
    private node: DocumentNode;
    private exportService: ExportService;
    
    // UI Elements
    private scopeSelect?: HTMLSelectElement;
    private formatSelect?: HTMLSelectElement;
    private exportButton?: HTMLButtonElement;
    private nodeInfoDisplay?: HTMLElement;
    private hierarchyTitleCheckboxes: { [level: number]: HTMLInputElement } = {};
    private htmlTocCheckbox?: HTMLInputElement;
    private hierarchyTitleContainer?: HTMLElement;

    constructor(config: ExportModalConfig) {
        super({
            ...config,
            title: '📤 Export Content',
            id: 'export-modal'
        });

        this.projectManager = config.projectManager;
        this.node = config.node;
        this.exportService = new ExportService();
    }

    /**
     * Gets the hierarchy levels from the node's template
     */
    private getHierarchyLevels(): string[] {
        const template = this.node.template || [];
        console.log('Node template:', template, 'Node level:', this.node.level);
        return template;
    }

    /**
     * Gets the default hierarchy title configuration
     * All levels enabled except the leaf level
     */
    private getDefaultHierarchyTitleConfig(): HierarchyTitleConfig {
        const hierarchyLevels = this.getHierarchyLevels();
        const config: HierarchyTitleConfig = {};
        
        hierarchyLevels.forEach((_levelName, index) => {
            // All levels enabled by default except the last one (leaf level)
            config[index] = index < hierarchyLevels.length - 1;
        });
        
        console.log('Default hierarchy config for template', hierarchyLevels, ':', config);
        return config;
    }

    /**
     * Implements IModal render method
     */
    public render(): HTMLElement {
        return this.renderContent();
    }

    /**
     * Renders the modal content
     */
    protected renderContent(): HTMLElement {
        const container = createElement('div', {
            classes: ['export-modal-container']
        });

        this.addStyles(container);

        const header = this.createHeader();
        const body = this.createBody();
        const footer = this.createFooter();

        container.appendChild(header);
        container.appendChild(body);
        container.appendChild(footer);

        return container;
    }

    /**
     * Creates the modal header (without custom close button - BaseModal handles that)
     */
    private createHeader(): HTMLElement {
        const header = createElement('div', {
            classes: ['modal-header']
        });

        const title = createElement('h2', {
            content: '📤 Export Content'
        });

        header.appendChild(title);

        return header;
    }

    /**
     * Creates the modal body
     */
    private createBody(): HTMLElement {
        const body = createElement('div', {
            classes: ['modal-body']
        });

        const exportSection = this.createExportSection();
        const hierarchySection = this.createHierarchyTitleSection();
        const formatOptionsSection = this.createFormatOptionsSection();
        const nodeInfoSection = this.createNodeInfoSection();

        body.appendChild(exportSection);
        body.appendChild(hierarchySection);
        body.appendChild(formatOptionsSection);
        body.appendChild(nodeInfoSection);

        return body;
    }

    /**
     * Creates the export options section
     */
    private createExportSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['export-section']
        });

        const title = createElement('h3', {
            content: 'Export Options'
        });

        const scopeOption = this.createScopeOption();
        const formatOption = this.createFormatOption();

        section.appendChild(title);
        section.appendChild(scopeOption);
        section.appendChild(formatOption);

        return section;
    }

    /**
     * Creates the hierarchy title controls section
     */
    private createHierarchyTitleSection(): HTMLElement {
        this.hierarchyTitleContainer = createElement('div', {
            classes: ['hierarchy-title-section', 'export-section']
        });

        const title = createElement('h3', {
            content: 'Hierarchy Title Controls'
        });

        const description = createElement('p', {
            content: 'Choose whether to include titles for each hierarchy level. Unchecked levels will have no separation (just newlines).',
            classes: ['section-description']
        });

        this.hierarchyTitleContainer.appendChild(title);
        this.hierarchyTitleContainer.appendChild(description);

        const hierarchyLevels = this.getHierarchyLevels();
        const defaultConfig = this.getDefaultHierarchyTitleConfig();

        hierarchyLevels.forEach((levelName, index) => {
            const checkboxOption = this.createHierarchyTitleCheckbox(index, levelName, defaultConfig[index] || false);
            this.hierarchyTitleContainer!.appendChild(checkboxOption);
        });

        this.updateHierarchyTitleVisibility();

        return this.hierarchyTitleContainer;
    }

    /**
     * Creates a hierarchy title checkbox for a specific level
     */
    private createHierarchyTitleCheckbox(level: number, levelName: string, defaultChecked: boolean): HTMLElement {
        const option = createElement('div', {
            classes: ['hierarchy-title-option']
        });

        const checkbox = createElement('input', {
            attributes: { 
                type: 'checkbox',
                id: `hierarchy-title-${level}`
            }
        }) as HTMLInputElement;
        
        if (defaultChecked) {
            checkbox.checked = true;
        }

        const label = createElement('label', {
            content: `Include "${levelName}" titles`,
            attributes: { for: `hierarchy-title-${level}` }
        });

        this.hierarchyTitleCheckboxes[level] = checkbox;

        option.appendChild(checkbox);
        option.appendChild(label);

        return option;
    }

    /**
     * Creates the format-specific options section
     */
    private createFormatOptionsSection(): HTMLElement {
        const section = createElement('div', {
            classes: ['format-options-section', 'export-section']
        });

        const title = createElement('h3', {
            content: 'Format Options'
        });

        section.appendChild(title);

        // HTML TOC option
        const htmlTocOption = this.createHtmlTocOption();
        section.appendChild(htmlTocOption);

        this.updateFormatOptionsVisibility();

        return section;
    }

    /**
     * Creates the HTML TOC option
     */
    private createHtmlTocOption(): HTMLElement {
        const option = createElement('div', {
            classes: ['html-toc-option']
        });

        this.htmlTocCheckbox = createElement('input', {
            attributes: { 
                type: 'checkbox',
                id: 'html-toc-checkbox'
            }
        }) as HTMLInputElement;
        
        // Default enabled
        this.htmlTocCheckbox.checked = true;

        const label = createElement('label', {
            content: 'Include Table of Contents (rendered to the left of text)',
            attributes: { for: 'html-toc-checkbox' }
        });

        option.appendChild(this.htmlTocCheckbox);
        option.appendChild(label);

        return option;
    }

    /**
     * Creates the scope selection option
     */
    private createScopeOption(): HTMLElement {
        const option = createElement('div', {
            classes: ['export-option']
        });

        const label = createElement('label', {
            content: 'Scope:',
            attributes: { for: 'export-scope-select' }
        });

        this.scopeSelect = createElement('select', {
            attributes: { id: 'export-scope-select' }
        }) as HTMLSelectElement;

        // Add scope options
        const scopeOptions = [
            { value: 'leafOnly', label: 'Lowest hierarchy layer (deepest content)' },
            { value: 'hierarchical', label: 'All layers (complete hierarchy)' },
            { value: 'reimport', label: 'For reimport (JSON format)' }
        ];

        scopeOptions.forEach(scopeOption => {
            const optionElement = createElement('option', {
                attributes: { value: scopeOption.value },
                content: scopeOption.label
            });
            this.scopeSelect!.appendChild(optionElement);
        });

        this.scopeSelect.addEventListener('change', () => {
            this.updateFormatState();
            this.updateHierarchyTitleVisibility();
        });

        // Initialize format state after DOM setup
        void void setTimeout(() => this.updateFormatState(), 0);

        option.appendChild(label);
        option.appendChild(this.scopeSelect);

        return option;
    }

    /**
     * Creates the format selection option
     */
    private createFormatOption(): HTMLElement {
        const option = createElement('div', {
            classes: ['export-option']
        });

        const label = createElement('label', {
            content: 'Format:',
            attributes: { for: 'export-format-select' }
        });

        this.formatSelect = createElement('select', {
            attributes: { id: 'export-format-select' }
        }) as HTMLSelectElement;

        // Add format options
        const formatOptions = [
            { value: 'html', label: 'HTML' },
            { value: 'plain', label: 'Plain Text' },
            { value: 'markdown', label: 'Markdown' }
        ];

        formatOptions.forEach(formatOption => {
            const optionElement = createElement('option', {
                attributes: { value: formatOption.value },
                content: formatOption.label
            });
            this.formatSelect!.appendChild(optionElement);
        });

        this.formatSelect.addEventListener('change', () => {
            this.updateFormatOptionsVisibility();
        });

        option.appendChild(label);
        option.appendChild(this.formatSelect);

        return option;
    }

    /**
     * Creates the node information section
     */
    private createNodeInfoSection(): HTMLElement {
        this.nodeInfoDisplay = createElement('div', {
            classes: ['node-info']
        });

        this.updateNodeInfo();

        return this.nodeInfoDisplay;
    }

    /**
     * Updates the node information display
     */
    private updateNodeInfo(): void {
        if (!this.nodeInfoDisplay) return;

        const nodePath = this.getNodePath();
        const childrenCount = this.node.children.length;

        this.nodeInfoDisplay.innerHTML = `
            <div class="node-info-content">
                <strong>Node:</strong> ${this.node.title}<br>
                <strong>Path:</strong> ${nodePath}<br>
                <strong>Children:</strong> ${childrenCount} direct child nodes
            </div>
        `;
    }

    /**
     * Gets the node path for display
     */
    private getNodePath(): string {
        try {
            // Try to use ProjectManager's method if available
            if (this.projectManager && typeof this.projectManager.getNodePath === 'function') {
                return this.projectManager.getNodePath(this.node.id);
            }
            
            // Fallback to building path from node hierarchy
            return this.buildNodePath(this.node);
        } catch (error) {
            console.warn('Failed to get node path:', error);
            return this.node.title;
        }
    }

    /**
     * Builds node path from hierarchy
     */
    private buildNodePath(node: DocumentNode): string {
        const parts: string[] = [];
        const current: DocumentNode | null = node;
        
        while (current) {
            parts.unshift(current.title);
            // Note: DocumentNode doesn't have parent navigation built-in
            // This is a simplified path building
            break; // For now, just show the current node
        }
        
        return parts.join(' > ');
    }

    /**
     * Updates the visibility of hierarchy title controls based on scope selection
     */
    private updateHierarchyTitleVisibility(): void {
        if (!this.hierarchyTitleContainer || !this.scopeSelect) return;
        
        // Show hierarchy controls for both hierarchical and leaf exports
        const showHierarchyControls = this.scopeSelect.value === 'hierarchical' || this.scopeSelect.value === 'leafOnly';
        this.hierarchyTitleContainer.style.display = showHierarchyControls ? 'block' : 'none';
        
        // Update the description based on scope
        const description = this.hierarchyTitleContainer.querySelector('.section-description') as HTMLElement;
        if (description) {
            if (this.scopeSelect.value === 'leafOnly') {
                description.textContent = 'Choose whether to include parent hierarchy titles above leaf content (e.g., chapter titles above scenes).';
            } else {
                description.textContent = 'Choose whether to include titles for each hierarchy level. Unchecked levels will have no separation (just newlines).';
            }
        }
    }

    /**
     * Updates the visibility of format-specific options based on format selection
     */
    private updateFormatOptionsVisibility(): void {
        if (!this.formatSelect) return;
        
        // Find the format options section
        const formatOptionsSection = document.querySelector('.format-options-section') as HTMLElement;
        if (!formatOptionsSection) return;
        
        // Show HTML TOC option only for HTML format
        const isHtml = this.formatSelect.value === 'html';
        const htmlTocOption = formatOptionsSection.querySelector('.html-toc-option') as HTMLElement;
        if (htmlTocOption) {
            htmlTocOption.style.display = isHtml ? 'block' : 'none';
        }
    }

    /**
     * Creates the modal footer
     */
    private createFooter(): HTMLElement {
        const footer = createElement('div', {
            classes: ['modal-footer']
        });

        const cancelButton = createElement('button', {
            classes: ['btn-secondary'],
            content: 'Cancel'
        });

        const clipboardButton = createElement('button', {
            classes: ['btn-secondary'],
            content: '📋 Copy to Clipboard'
        }) as HTMLButtonElement;

        this.exportButton = createElement('button', {
            classes: ['btn-primary'],
            content: '💾 Export File'
        }) as HTMLButtonElement;

        cancelButton.addEventListener('click', () => {
            void this.close();
        });

        clipboardButton.addEventListener('click', () => {
            void this.handleClipboardExport();
        });

        this.exportButton.addEventListener('click', () => {
            void this.handleExport();
        });

        footer.appendChild(cancelButton);
        footer.appendChild(clipboardButton);
        footer.appendChild(this.exportButton);

        return footer;
    }

    /**
     * Updates the format select state based on scope selection
     */
    private updateFormatState(): void {
        if (!this.scopeSelect || !this.formatSelect) return;

        const isReimport = this.scopeSelect.value === 'reimport';
        this.formatSelect.disabled = isReimport;
        
        if (isReimport) {
            this.formatSelect.value = 'html'; // Default value when disabled
        }
    }

    /**
     * Handles the clipboard export action
     */
    private async handleClipboardExport(): Promise<void> {
        if (!this.scopeSelect || !this.formatSelect) return;

        let scope: string;
        let format: string;

        // Handle reimport case specially
        if (this.scopeSelect.value === 'reimport') {
            scope = 'single'; // Scope doesn't matter for reimport, but we need a valid value
            format = 'reimport'; // This maps to ExportFormat.Reimport
        } else {
            // Map UI scope values to ExportService values
            switch (this.scopeSelect.value) {
                case 'leafOnly':
                    scope = 'leaves';
                    break;
                case 'hierarchical':
                    scope = 'hierarchy';
                    break;
                default:
                    scope = 'single';
            }
            format = this.formatSelect.value;
        }

        try {
            // Collect hierarchy title configuration
            const hierarchyTitles: { [level: number]: boolean } = {};
            Object.keys(this.hierarchyTitleCheckboxes).forEach(levelStr => {
                const level = parseInt(levelStr);
                const checkbox = this.hierarchyTitleCheckboxes[level];
                if (checkbox) {
                    hierarchyTitles[level] = checkbox.checked;
                }
            });
            
            console.log('Collected hierarchy titles config for clipboard export:', hierarchyTitles);

            // Generate the content using the export service
            const result = await this.exportService.export(this.node, {
                scope: scope as any,
                format: format as any,
                hierarchyTitles,
                includeHtmlToc: this.htmlTocCheckbox ? this.htmlTocCheckbox.checked : false
            });

            // Copy to clipboard
            await navigator.clipboard.writeText(result.content);
            
            // Show success message and close
            alert(`Content successfully copied to clipboard!`);
            void this.close();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            alert(`Failed to copy to clipboard: ${errorMessage}`);
        }
    }

    /**
     * Handles the export action
     */
    private async handleExport(): Promise<void> {
        if (!this.scopeSelect || !this.formatSelect || !this.exportButton) return;

        let scope: string;
        let format: string;

        // Handle reimport case specially
        if (this.scopeSelect.value === 'reimport') {
            scope = 'single'; // Scope doesn't matter for reimport, but we need a valid value
            format = 'reimport'; // This maps to ExportFormat.Reimport
        } else {
            // Map UI scope values to ExportService values
            switch (this.scopeSelect.value) {
                case 'leafOnly':
                    scope = 'leaves';
                    break;
                case 'hierarchical':
                    scope = 'hierarchy';
                    break;
                default:
                    scope = 'single';
            }
            format = this.formatSelect.value;
        }

        // Disable button during export
        this.exportButton.disabled = true;
        this.exportButton.textContent = 'Exporting...';

        try {
            // Collect hierarchy title configuration
            const hierarchyTitles: { [level: number]: boolean } = {};
            Object.keys(this.hierarchyTitleCheckboxes).forEach(levelStr => {
                const level = parseInt(levelStr);
                const checkbox = this.hierarchyTitleCheckboxes[level];
                if (checkbox) {
                    hierarchyTitles[level] = checkbox.checked;
                }
            });
            
            console.log('Collected hierarchy titles config for file export:', hierarchyTitles);

            // Use the performExport method which handles the complete export process
            await this.exportService.performExport(
                this.projectManager,
                this.node,
                scope,
                format,
                hierarchyTitles,
                this.htmlTocCheckbox ? this.htmlTocCheckbox.checked : false
            );

            void this.close();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            alert(`Export failed: ${errorMessage}`);
            
            // Re-enable button
            this.exportButton.disabled = false;
            this.exportButton.textContent = 'Export';
        }
    }

    // handleCancel method removed - no longer used

    /**
     * Adds styles for the export modal
     */
    private addStyles(container: HTMLElement): void {
        const style = createElement('style', {
            innerHTML: `
                .export-modal-container {
                    width: 60vw;
                    max-width: 800px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                
                .export-modal-container .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem 2rem 1rem;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .export-modal-container .modal-header h2 {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 600;
                    color: #111827;
                }
                
                .export-modal-container .close-button {
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
                
                .export-modal-container .close-button:hover {
                    background-color: #dc2626;
                }
                
                .export-modal-container .modal-body {
                    padding: 1.5rem 2rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                
                .export-modal-container .modal-footer {
                    display: flex;
                    gap: 0.75rem;
                    justify-content: flex-end;
                    padding: 1rem 2rem 1.5rem;
                    border-top: 1px solid #e5e7eb;
                }
                
                .export-modal-container .export-section {
                    background-color: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 1.5rem;
                }
                
                .export-modal-container .export-section h3 {
                    margin-top: 0;
                    margin-bottom: 1rem;
                    color: #1f2937;
                    font-size: 1.125rem;
                    font-weight: 600;
                }
                
                .export-modal-container .export-option {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-bottom: 1rem;
                }
                
                .export-modal-container .export-option:last-child {
                    margin-bottom: 0;
                }
                
                .export-modal-container .export-option label {
                    font-weight: 500;
                    color: #374151;
                    cursor: pointer;
                    user-select: none;
                    min-width: 80px;
                    flex-shrink: 0;
                }
                
                .export-modal-container .export-option select {
                    flex-grow: 1;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    background-color: white;
                    font-size: 0.875rem;
                    cursor: pointer;
                }
                
                .export-modal-container .export-option select:disabled {
                    background-color: #f3f4f6;
                    color: #6b7280;
                    cursor: not-allowed;
                }
                
                .export-modal-container .export-option select:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .export-modal-container .node-info {
                    padding: 1rem;
                    background-color: #eff6ff;
                    border: 1px solid #bfdbfe;
                    border-radius: 8px;
                }
                
                .export-modal-container .node-info-content {
                    font-size: 0.875rem;
                    color: #1e40af;
                    line-height: 1.5;
                }
                
                .btn-primary,
                .btn-secondary {
                    padding: 0.75rem 1.5rem;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-primary {
                    background-color: #3b82f6;
                    color: white;
                }
                
                .btn-primary:hover:not(:disabled) {
                    background-color: #2563eb;
                }
                
                .btn-primary:disabled {
                    background-color: #9ca3af;
                    cursor: not-allowed;
                }
                
                .btn-secondary {
                    background-color: #6b7280;
                    color: white;
                }
                
                .btn-secondary:hover {
                    background-color: #4b5563;
                }
                
                .hierarchy-title-section {
                    background-color: #f0f9ff;
                    border: 1px solid #bfdbfe;
                }
                
                .hierarchy-title-option {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                }
                
                .hierarchy-title-option:last-child {
                    margin-bottom: 0;
                }
                
                .hierarchy-title-option input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                }
                
                .hierarchy-title-option label {
                    cursor: pointer;
                    font-weight: 500;
                    color: #1e40af;
                    margin: 0;
                }
                
                .format-options-section {
                    background-color: #f0fdf4;
                    border: 1px solid #bbf7d0;
                }
                
                .html-toc-option {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                
                .html-toc-option input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                }
                
                .html-toc-option label {
                    cursor: pointer;
                    font-weight: 500;
                    color: #15803d;
                    margin: 0;
                }
                
                .section-description {
                    font-size: 0.875rem;
                    color: #6b7280;
                    margin-bottom: 1rem;
                    line-height: 1.4;
                }
            `
        });

        container.appendChild(style);
    }
} 