/**
 * Service for handling document export functionality
 */

import { DocumentNode } from '../../../DocumentNode';
import { ProjectManager } from '../../../ProjectManager';
import { IExportService, ExportConfig, ExportResult, NodeExportData, ExportScope, ExportFormat } from '../types/ExportTypes';
import { sanitizeFilename, escapeHtml, formatContentAsHtml } from '../core/modal-utils';

export class ExportService implements IExportService {
    
    /**
     * Main export function that handles all export types
     */
    public async export(node: DocumentNode, config: ExportConfig): Promise<ExportResult> {
        let content: string;
        let filename: string;
        let mimeType: string;

        if (config.format === ExportFormat.Reimport) {
            // Export for reimport - JSON format with full node data
            content = this.exportNodeForReimport(node);
            filename = config.filename || `${sanitizeFilename(node.title)}_export.json`;
            mimeType = 'application/json';
        } else {
            // Export for reading - formatted content
            content = this.exportNodeContent(node, config.scope, config.format);
            const extension = this.getFileExtension(config.format);
            filename = config.filename || `${sanitizeFilename(node.title)}_${config.scope}.${extension}`;
            mimeType = this.getMimeType(config.format);
        }

        return {
            content,
            filename,
            mimeType
        };
    }

    /**
     * Generates content in the specified format for multiple nodes
     */
    public generateContent(nodes: DocumentNode[], format: ExportFormat, title?: string): string {
        switch (format) {
            case ExportFormat.HTML:
                return this.generateHtmlContent(nodes, title || 'Export');
            case ExportFormat.Markdown:
                return this.generateMarkdownContent(nodes);
            case ExportFormat.Plain:
                return this.generatePlainTextContent(nodes);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Downloads the export result as a file
     */
    public downloadFile(result: ExportResult): void {
        const blob = new Blob([result.content], { type: result.mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Performs the complete export process: generate content and download
     */
    public async performExport(projectManager: ProjectManager, node: DocumentNode, scope: string, format: string): Promise<void> {
        const config: ExportConfig = {
            scope: scope as ExportScope,
            format: format as ExportFormat
        };

        const result = await this.export(node, config);
        this.downloadFile(result);
        
        // Show success message
        alert(`Successfully exported "${node.title}" as ${result.filename}`);
    }

    /**
     * Exports node data for reimport purposes
     */
    private exportNodeForReimport(node: DocumentNode): string {
        const exportObject = {
            title: node.title,
            content: node.content,
            context: node.context ?? undefined,
            generationPrompt: node.generationPrompt ?? undefined,
            level: node.level,
            template: node.template,  // Include template in root node for reimport
            children: node.children.map(child => this.exportNodeForReimportRecursive(child))
        };
        
        return JSON.stringify(exportObject, null, 2);
    }

    /**
     * Recursively exports node data for reimport
     */
    private exportNodeForReimportRecursive(node: DocumentNode): NodeExportData {
        const data: NodeExportData = {
            id: node.id,
            title: node.title,
            content: node.content,
            level: node.level,
            template: node.template,
            children: node.children.map(child => this.exportNodeForReimportRecursive(child))
        };

        // Conditionally add optional properties if they have values
        if (node.context) {
            data.context = node.context;
        }
        if (node.generationPrompt) {
            data.generationPrompt = node.generationPrompt;
        }
        const templateCount = node.getTemplateChildrenCount();
        if (templateCount !== null) {
            data.generationChildrenCount = templateCount;
        }
        if (node.childLevelName) {
            data.childLevelName = node.childLevelName;
        }

        return data;
    }

    /**
     * Exports node content based on scope and format
     */
    private exportNodeContent(node: DocumentNode, scope: ExportScope, format: ExportFormat): string {
        if (scope === ExportScope.Leaves) {
            return this.exportLowestLayer(node, format);
        } else {
            return this.exportAllLayers(node, format);
        }
    }

    /**
     * Exports only the leaf nodes (lowest layer)
     */
    private exportLowestLayer(node: DocumentNode, format: ExportFormat): string {
        const leafNodes = this.findLeafNodes(node);
        
        switch (format) {
            case ExportFormat.HTML:
                return this.generateHtmlContent(leafNodes, 'Lowest Layer Content');
            case ExportFormat.Markdown:
                return this.generateMarkdownContent(leafNodes);
            case ExportFormat.Plain:
                return this.generatePlainTextContent(leafNodes);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Exports all layers in hierarchy
     */
    private exportAllLayers(node: DocumentNode, format: ExportFormat): string {
        switch (format) {
            case ExportFormat.HTML:
                return this.generateHtmlHierarchy(node);
            case ExportFormat.Markdown:
                return this.generateMarkdownHierarchy(node);
            case ExportFormat.Plain:
                return this.generatePlainTextHierarchy(node);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Finds all leaf nodes in a tree
     */
    private findLeafNodes(node: DocumentNode): DocumentNode[] {
        if (node.children.length === 0) {
            return [node];
        }
        
        const leafNodes: DocumentNode[] = [];
        for (const child of node.children) {
            leafNodes.push(...this.findLeafNodes(child));
        }
        return leafNodes;
    }

    /**
     * Generates HTML content for a list of nodes
     */
    private generateHtmlContent(nodes: DocumentNode[], title: string): string {
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

    /**
     * Generates HTML hierarchy for a node tree
     */
    private generateHtmlHierarchy(node: DocumentNode, level: number = 1): string {
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
            
            html += this.generateHtmlHierarchyRecursive(node, level);
            html += `
</body>
</html>`;
            return html;
        } else {
            return this.generateHtmlHierarchyRecursive(node, level);
        }
    }

    /**
     * Recursively generates HTML hierarchy
     */
    private generateHtmlHierarchyRecursive(node: DocumentNode, level: number): string {
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
            html += this.generateHtmlHierarchyRecursive(child, level + 1);
        }

        html += `
    </div>`;
        return html;
    }

    /**
     * Generates Markdown content for a list of nodes
     */
    private generateMarkdownContent(nodes: DocumentNode[]): string {
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

    /**
     * Generates Markdown hierarchy for a node tree
     */
    private generateMarkdownHierarchy(node: DocumentNode, level: number = 1): string {
        const headingPrefix = '#'.repeat(level);
        let markdown = `${headingPrefix} ${node.title}\n\n`;

        if (node.context && node.context.trim()) {
            markdown += `*${node.context}*\n\n`;
        }

        if (node.content && node.content.trim()) {
            markdown += `${node.content}\n\n`;
        }

        for (const child of node.children) {
            markdown += this.generateMarkdownHierarchy(child, level + 1);
        }

        return markdown;
    }

    /**
     * Generates plain text content for a list of nodes
     */
    private generatePlainTextContent(nodes: DocumentNode[]): string {
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

    /**
     * Generates plain text hierarchy for a node tree
     */
    private generatePlainTextHierarchy(node: DocumentNode, level: number = 0): string {
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
            text += this.generatePlainTextHierarchy(child, level + 1);
        }

        return text;
    }

    /**
     * Gets the file extension for a format
     */
    private getFileExtension(format: ExportFormat): string {
        switch (format) {
            case ExportFormat.HTML:
                return 'html';
            case ExportFormat.Markdown:
                return 'md';
            case ExportFormat.Plain:
                return 'txt';
            case ExportFormat.Reimport:
                return 'json';
            default:
                return 'txt';
        }
    }

    /**
     * Gets the MIME type for a format
     */
    private getMimeType(format: ExportFormat): string {
        switch (format) {
            case ExportFormat.HTML:
                return 'text/html';
            case ExportFormat.Markdown:
                return 'text/markdown';
            case ExportFormat.Plain:
                return 'text/plain';
            case ExportFormat.Reimport:
                return 'application/json';
            default:
                return 'text/plain';
        }
    }
} 