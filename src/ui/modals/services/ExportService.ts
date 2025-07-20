/**
 * Service for handling document export functionality
 */

import { DocumentNode } from '../../../DocumentNode';
import { ProjectManager } from '../../../ProjectManager';
import { IExportService, ExportConfig, ExportResult, NodeExportData, ExportScope, ExportFormat } from '../types/ExportTypes';
import { sanitizeFilename, escapeHtml, formatContentAsHtml } from '../core/modal-utils';
import { FileDownloadService, FileDownloadResult } from '../../../utils/FileDownloadService';

import { WorkingEpubGenerator } from './WorkingEpubGenerator';

/**
 * Interface for hierarchical TOC structure
 */
interface TocNode {
    title: string;
    href: string;
    level: number;
    children: TocNode[];
}

/**
 * Interface for hierarchical content structure
 */
interface ContentNode {
    title: string;
    titleId: string;
    level: number;
    content: string;
    children: ContentNode[];
    isLeaf: boolean;
}


export class ExportService implements IExportService {
    
    /**
     * Main export function that handles all export types
     */
    public async export(node: DocumentNode, config: ExportConfig, projectManager?: ProjectManager): Promise<ExportResult> {
        let content: string | Blob;
        let filename: string;
        let mimeType: string;

        if (config.format === ExportFormat.Reimport) {
            // Export for reimport - JSON format with full node data
            content = this.exportNodeForReimport(node);
            filename = config.filename || `${sanitizeFilename(node.title)}_export.json`;
            mimeType = 'application/json';
        } else if (config.format === ExportFormat.EPUB) {
            // Export as EPUB - binary format
            content = await this.generateEpubContent(node, config, projectManager);
            filename = config.filename || `${sanitizeFilename(node.title)}.epub`;
            mimeType = 'application/epub+zip';
        } else {
            // Export for reading - formatted content
            content = this.exportNodeContent(node, config.scope, config.format, config, projectManager);
            const extension = this.getFileExtension(config.format);
            filename = config.filename || `${sanitizeFilename(node.title)}.${extension}`;
            mimeType = this.getMimeType(config.format);
        }

        return {
            content,
            filename,
            mimeType
        };
    }



    /**
     * Generates EPUB content using WorkingEpubGenerator
     */
    private async generateEpubContent(node: DocumentNode, config: ExportConfig, projectManager?: ProjectManager): Promise<Blob> {
        const generator = new WorkingEpubGenerator();
        return await generator.generate(node, config, projectManager);
    }


    









    /**
     * Generates content in the specified format for multiple nodes
     */
    public generateContent(nodes: DocumentNode[], format: ExportFormat, title?: string, config?: ExportConfig, projectManager?: ProjectManager): string {
        switch (format) {
            case ExportFormat.HTML:
                return this.generateHtmlContent(nodes, title || 'Export', config, projectManager);
            case ExportFormat.Markdown:
                return this.generateMarkdownContent(nodes, title || 'Export', config, projectManager);
            case ExportFormat.Plain:
                return this.generatePlainTextContent(nodes, title || 'Export', config, projectManager);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Downloads the export result as a file
     */
    public async downloadFile(result: ExportResult): Promise<FileDownloadResult> {
        const downloadResult = await FileDownloadService.downloadExportResult(
            result.content,
            result.filename,
            result.mimeType,
            this.getFileDescription(result.filename)
        );
        
        // Handle file selector failures with detailed error messages
        if (!downloadResult.success && downloadResult.error) {
            console.error('Export download failed:', downloadResult.error);
            // Error will be handled by calling code
        }
        
        // Warn if fallback was used
        if (downloadResult.success && downloadResult.method === 'download') {
            console.warn('⚠️ File selector not available, file saved to Downloads folder');
        }
        
        return downloadResult;
    }

    /**
     * Gets a user-friendly description for the file based on its extension
     */
    private getFileDescription(filename: string): string {
        const extension = filename.split('.').pop()?.toLowerCase() || '';
        switch (extension) {
            case 'html':
                return 'HTML Document Export';
            case 'md':
                return 'Markdown Document Export';
            case 'txt':
                return 'Plain Text Export';
            case 'json':
                return 'JSON Data Export';
            case 'epub':
                return 'EPUB eBook Export';
            default:
                return 'Document Export';
        }
    }

    /**
     * Performs the complete export process: generate content and download
     */
    public async performExport(
        projectManager: ProjectManager, 
        node: DocumentNode, 
        scope: string, 
        format: string, 
        hierarchyTitles?: { [level: number]: boolean }, 
        includeHtmlToc?: boolean,
        author?: string
    ): Promise<void> {
        const config: ExportConfig = {
            scope: scope as ExportScope,
            format: format as ExportFormat
        };

        if (hierarchyTitles) {
            config.hierarchyTitles = hierarchyTitles;
        }
        if (includeHtmlToc !== undefined) {
            config.includeHtmlToc = includeHtmlToc;
        }
        if (author !== undefined) {
            config.author = author;
        }

        const result = await this.export(node, config, projectManager);
        const downloadResult = await this.downloadFile(result);
        
        // Handle different download results
        if (downloadResult.success && !downloadResult.cancelled) {
            // Success - show appropriate message based on method used
            if (downloadResult.method === 'save-as') {
                alert(`Successfully exported "${node.title}" using file selector`);
            } else {
                // Direct download fallback - inform user but don't make it seem like an error
                alert(`Successfully exported "${node.title}" to Downloads folder\n\n💡 For better file location control, consider using Chrome or Edge which support file selectors.`);
            }
        } else if (downloadResult.cancelled) {
            // User cancelled - no error message needed
            console.log('Export cancelled by user');
        } else {
            // Export failed - show detailed error
            const errorMessage = downloadResult.error || 'Unknown error occurred';
            alert(`Export failed: ${errorMessage}\n\nPlease try again or check browser compatibility.`);
            throw new Error(`Export failed: ${errorMessage}`);
        }
    }

    /**
     * Exports node data for reimport purposes
     */
    private exportNodeForReimport(node: DocumentNode): string {
        const exportObject: any = {
            title: node.title,
            content: node.content,
            context: node.context ?? undefined,
            generationPrompt: node.generationPrompt ?? undefined,
            level: node.level,
            template: node.template,  // Include template in root node for reimport
            children: node.children.map(child => this.exportNodeForReimportRecursive(child)),
            // Generation metadata for root node
            creatorModel: node.creatorModel ?? undefined,
            generationHistory: (node.generationHistory && node.generationHistory.length > 0) ? node.generationHistory : undefined,
            generationSessions: (node.generationSessions && node.generationSessions.length > 0) ? node.generationSessions : undefined
        };

        // Enhanced: Export complete version and tagging system for root node
        const allVersions = node.getAllVersions();
        if (allVersions && allVersions.length > 0) {
            exportObject.versions = allVersions.map(version => {
                const exportVersion: any = {
                    id: version.id,
                    content: version.content,
                    title: version.title,
                    context: version.context,
                    tags: Array.from(version.tags), // Convert Set to Array for JSON
                    timestamp: version.timestamp.toISOString() // Convert Date to ISO string
                };
                
                // Only add optional properties if they exist
                if (version.ratings && version.ratings.length > 0) {
                    exportVersion.ratings = [...version.ratings];
                }
                if (version.creatorModel) {
                    exportVersion.creatorModel = version.creatorModel;
                }
                if (version.metadata && Object.keys(version.metadata).length > 0) {
                    exportVersion.metadata = { ...version.metadata };
                }
                
                return exportVersion;
            });
        }

        // Export UI state for root node
        exportObject.collapsed = node.collapsed;
        
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
        
        // Add generation metadata
        if (node.creatorModel) {
            data.creatorModel = node.creatorModel;
        }
        if (node.generationHistory && node.generationHistory.length > 0) {
            data.generationHistory = node.generationHistory;
        }
        if (node.generationSessions && node.generationSessions.length > 0) {
            data.generationSessions = node.generationSessions;
        }

        // Enhanced: Export complete version and tagging system
        const allVersions = node.getAllVersions();
        if (allVersions && allVersions.length > 0) {
            data.versions = allVersions.map(version => {
                const exportVersion: any = {
                    id: version.id,
                    content: version.content,
                    title: version.title,
                    context: version.context,
                    tags: Array.from(version.tags), // Convert Set to Array for JSON
                    timestamp: version.timestamp.toISOString() // Convert Date to ISO string
                };
                
                // Only add optional properties if they exist
                if (version.ratings && version.ratings.length > 0) {
                    exportVersion.ratings = [...version.ratings];
                }
                if (version.creatorModel) {
                    exportVersion.creatorModel = version.creatorModel;
                }
                if (version.metadata && Object.keys(version.metadata).length > 0) {
                    exportVersion.metadata = { ...version.metadata };
                }
                
                return exportVersion;
            });
        }

        // Export UI state
        data.collapsed = node.collapsed;

        return data;
    }

    /**
     * Exports node content based on scope and format
     */
    private exportNodeContent(node: DocumentNode, scope: ExportScope, format: ExportFormat, config?: ExportConfig, projectManager?: ProjectManager): string {
        if (scope === ExportScope.Leaves) {
            return this.exportLowestLayer(node, format, config, projectManager);
        } else {
            return this.exportAllLayers(node, format, config, projectManager);
        }
    }

    /**
     * Exports only the leaf nodes (lowest layer)
     */
    private exportLowestLayer(node: DocumentNode, format: ExportFormat, config?: ExportConfig, projectManager?: ProjectManager): string {
        const leafNodes = this.findLeafNodes(node);
        
        switch (format) {
            case ExportFormat.HTML:
                return this.generateHtmlContent(leafNodes, node.title, config, projectManager);
            case ExportFormat.Markdown:
                return this.generateMarkdownContent(leafNodes, node.title, config, projectManager);
            case ExportFormat.Plain:
                return this.generatePlainTextContent(leafNodes, node.title, config, projectManager);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Exports all layers in hierarchy
     */
    private exportAllLayers(node: DocumentNode, format: ExportFormat, config?: ExportConfig, projectManager?: ProjectManager): string {
        switch (format) {
            case ExportFormat.HTML:
                return this.generateHtmlHierarchy(node, 1, config, projectManager);
            case ExportFormat.Markdown:
                return this.generateMarkdownHierarchy(node, 1, config, projectManager);
            case ExportFormat.Plain:
                return this.generatePlainTextHierarchy(node, 0, config, projectManager);
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
    private generateHtmlContent(nodes: DocumentNode[], title: string, config?: ExportConfig, projectManager?: ProjectManager): string {
        const includeToc = config?.includeHtmlToc || false;
        
        let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: Georgia, serif; line-height: 1.6; margin: 0; padding: 0; }
        .container { display: ${includeToc ? 'flex' : 'block'}; width: 100%; min-height: 100vh; }
        .toc { ${includeToc ? 'width: 25%; background-color: #f8f9fa; border-right: 1px solid #dee2e6; padding: 1rem; box-sizing: border-box; position: fixed; height: 100vh; overflow-y: auto;' : 'display: none;'} }
        .content-area { ${includeToc ? 'width: 75%; margin-left: 25%; padding: 2rem; box-sizing: border-box;' : 'width: 100%; padding: 2rem; box-sizing: border-box;'} }
        .toc h3 { margin-top: 0; color: #495057; font-size: 1.1rem; border-bottom: 1px solid #dee2e6; padding-bottom: 0.5rem; }
        .toc ul { list-style: none; padding-left: 0; }
        .toc li { margin: 0.25rem 0; }
        .toc a { text-decoration: none; color: #007bff; display: block; padding: 0.25rem 0.5rem; border-radius: 4px; transition: background-color 0.2s; }
        .toc a:hover { background-color: #e9ecef; }
        .toc .level-1 { padding-left: 0; }
        .toc .level-2 { padding-left: 1rem; }
        .toc .level-3 { padding-left: 2rem; }
        .toc .level-4 { padding-left: 3rem; }
        .toc .level-5 { padding-left: 4rem; }
        .toc .level-6 { padding-left: 5rem; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }
        h2, h3, h4, h5, h6 { color: #34495e; margin-top: 2rem; }
        .content { margin-bottom: 2rem; }
        .meta { font-size: 0.9rem; color: #6c757d; margin-bottom: 0.5rem; }
        .hierarchy-group { margin-bottom: 3rem; }
        .node-content { margin-bottom: 1.5rem; }
    </style>
</head>
<body>
    <div class="container">`;

        // Generate TOC if enabled
        if (includeToc) {
            const tocContent = this.generateTocForLeafNodes(nodes, config, projectManager);
                html += `
        <div class="toc">
            <h3>Table of Contents</h3>
            ${tocContent}
    </div>`;
        }

        html += `
        <div class="content-area">
            <h1>${title}</h1>`;

        // Group nodes by hierarchy and generate content with hierarchy titles
        const groupedContent = this.groupLeafNodesWithHierarchy(nodes, config, projectManager);
        html += groupedContent.html;

        html += `
        </div>
    </div>
</body>
</html>`;
        return html;
    }

    /**
     * Generates HTML hierarchy for a node tree
     */
    private generateHtmlHierarchy(node: DocumentNode, level: number = 1, config?: ExportConfig, _projectManager?: ProjectManager): string {
        if (level === 1) {
            const includeToc = config?.includeHtmlToc || false;
            
            let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(node.title)} - Complete Hierarchy</title>
    <style>
        body { font-family: Georgia, serif; line-height: 1.6; margin: 0; padding: 0; }
        .container { display: ${includeToc ? 'flex' : 'block'}; width: 100%; min-height: 100vh; }
        .toc { ${includeToc ? 'width: 25%; background-color: #f8f9fa; border-right: 1px solid #dee2e6; padding: 1rem; box-sizing: border-box; position: fixed; height: 100vh; overflow-y: auto;' : 'display: none;'} }
        .content-area { ${includeToc ? 'width: 75%; margin-left: 25%; padding: 2rem; box-sizing: border-box;' : 'max-width: 800px; margin: 0 auto; padding: 2rem;'} }
        .toc h3 { margin-top: 0; color: #495057; font-size: 1.1rem; border-bottom: 1px solid #dee2e6; padding-bottom: 0.5rem; }
        .toc ul { list-style: none; padding-left: 0; }
        .toc li { margin: 0.25rem 0; }
        .toc a { text-decoration: none; color: #007bff; display: block; padding: 0.25rem 0.5rem; border-radius: 4px; transition: background-color 0.2s; }
        .toc a:hover { background-color: #e9ecef; }
        .toc .level-1 { padding-left: 0; }
        .toc .level-2 { padding-left: 1rem; }
        .toc .level-3 { padding-left: 2rem; }
        .toc .level-4 { padding-left: 3rem; }
        .toc .level-5 { padding-left: 4rem; }
        .toc .level-6 { padding-left: 5rem; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }
        h2, h3, h4, h5, h6 { color: #34495e; margin-top: 2rem; }
        .content { margin-bottom: 1.5rem; }
        .summary { margin-bottom: 1rem; font-style: italic; }
        .level-node { margin-bottom: 1.5rem; }
    </style>
</head>
<body>
    <div class="container">`;

            if (includeToc) {
                html += `
        <div class="toc">
            <h3>Table of Contents</h3>
            ${this.generateTocHtml(node, 1, config)}
        </div>`;
            }

            html += `
        <div class="content-area">`;
            
            html += this.generateHtmlHierarchyRecursive(node, level, config);
            html += `
        </div>
    </div>
</body>
</html>`;
            return html;
        } else {
            return this.generateHtmlHierarchyRecursive(node, level, config);
        }
    }

    /**
     * Recursively generates HTML hierarchy
     */
    private generateHtmlHierarchyRecursive(node: DocumentNode, level: number, config?: ExportConfig): string {
        const headingTag = `h${Math.min(level + 1, 6)}`;
        let html = `
    <div class="level-node">`;
        
        // Check if titles should be included for this level
        const includeTitle = this.shouldIncludeTitle(level, config);
        
        if (includeTitle) {
            const nodeId = this.generateNodeId(node, level);
            html += `
        <${headingTag} id="${nodeId}">${escapeHtml(node.title)}</${headingTag}>`;
        }

        if (node.context && node.context.trim()) {
            html += `
        <div class="summary">${formatContentAsHtml(node.context)}</div>`;
        }

        if (node.content && node.content.trim()) {
            html += `
        <div class="content">${formatContentAsHtml(node.content)}</div>`;
        }

        for (const child of node.children) {
            html += this.generateHtmlHierarchyRecursive(child, level + 1, config);
        }

        html += `
    </div>`;
        return html;
    }

    /**
     * Generates HTML table of contents
     */
    private generateTocHtml(node: DocumentNode, level: number = 1, config?: ExportConfig): string {
        let toc = '';
        
        // Check if titles should be included for this level
        const includeTitle = this.shouldIncludeTitle(level - 1, config); // level is 1-based here, convert to 0-based
        
        if (includeTitle) {
            const nodeId = this.generateNodeId(node, level);
            const indent = level > 6 ? 6 : level;
            toc += `<li class="level-${indent}"><a href="#${nodeId}">${escapeHtml(node.title)}</a></li>\n`;
        }
        
        // Add children to TOC
        for (const child of node.children) {
            toc += this.generateTocHtml(child, level + 1, config);
        }
        
        if (level === 1) {
            return `<ul>\n${toc}</ul>`;
        }
        
        return toc;
    }

    /**
     * Generates a unique ID for a node
     */
    private generateNodeId(node: DocumentNode, level: number): string {
        return `node-${level}-${node.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
    }

    /**
     * Generates TOC specifically for leaf node exports
     */
    private generateTocForLeafNodes(nodes: DocumentNode[], config?: ExportConfig, projectManager?: ProjectManager): string {
        let toc = '<ul>\n';
        
        // Build a hierarchical structure to avoid duplicate parent entries
        const tocStructure = this.buildHierarchicalTocStructure(nodes, config, projectManager);
        toc += this.renderTocStructure(tocStructure, 0);
        
        toc += '</ul>';
        return toc;
    }

    /**
     * Builds a hierarchical TOC structure to avoid duplicate parent entries
     */
    private buildHierarchicalTocStructure(nodes: DocumentNode[], config?: ExportConfig, projectManager?: ProjectManager): TocNode[] {
        const tocNodes: TocNode[] = [];
        const nodeMap = new Map<string, TocNode>();

        // Group nodes by their parent hierarchy
        const groupedNodes = this.groupNodesByParent(nodes, projectManager);
        
        for (const [parentPath, nodeGroup] of groupedNodes) {
            // Process each level of the hierarchy
            let currentLevel = tocNodes;
            let currentKey = '';
            
            // Add parent hierarchy levels
            parentPath.forEach((title, level) => {
                const includeTitle = this.shouldIncludeTitle(level, config);
                
                if (includeTitle) {
                    currentKey += `${level}:${title}|`;
                    
                    // Check if this node already exists at this level
                    let existingNode = nodeMap.get(currentKey);
                    
                    if (!existingNode) {
                        // Create new parent node
                        const titleId = this.generateHierarchyTitleId(title, level);
                        const indent = level > 6 ? 6 : level + 1;
                        
                        existingNode = {
                            title,
                            href: `#${titleId}`,
                            level: indent,
                            children: []
                        };
                        
                        currentLevel.push(existingNode);
                        nodeMap.set(currentKey, existingNode);
                    }
                    
                    currentLevel = existingNode.children;
                }
            });
            
            // Add leaf nodes to the current level
            for (const node of nodeGroup) {
                if (node.content && node.content.trim()) {
                    const includeNodeTitle = this.shouldIncludeTitle(node.level, config);
                    
                    if (includeNodeTitle) {
                        const nodeId = this.generateNodeId(node, node.level);
                        const indent = node.level > 6 ? 6 : node.level + 1;
                        
                        const leafKey = `${currentKey}leaf:${node.title}`;
                        
                        if (!nodeMap.has(leafKey)) {
                            const leafNode: TocNode = {
                                title: node.title,
                                href: `#${nodeId}`,
                                level: indent,
                                children: []
                            };
                            
                            currentLevel.push(leafNode);
                            nodeMap.set(leafKey, leafNode);
                        }
                    }
                }
            }
        }
        
        return tocNodes;
    }

    /**
     * Renders the hierarchical TOC structure to HTML
     */
    private renderTocStructure(tocNodes: TocNode[], baseLevel: number): string {
        let html = '';
        
        for (const node of tocNodes) {
            html += `<li class="level-${node.level}"><a href="${node.href}">${escapeHtml(node.title)}</a>`;
            
            if (node.children.length > 0) {
                html += '\n<ul>\n';
                html += this.renderTocStructure(node.children, baseLevel + 1);
                html += '</ul>\n';
            }
            
            html += '</li>\n';
        }
        
        return html;
    }

    /**
     * Generates a unique ID for hierarchy titles
     */
    private generateHierarchyTitleId(title: string, level: number): string {
        return `hierarchy-${level}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
    }

    /**
     * Determines whether a title should be included based on the hierarchy configuration
     */
    private shouldIncludeTitle(level: number, config?: ExportConfig): boolean {
        if (!config?.hierarchyTitles) {
            console.log(`shouldIncludeTitle(${level}): No config, returning true`);
            return true; // If no config, include all titles
        }
        
        // If the level is explicitly set in the config, use that value
        if (level in config.hierarchyTitles) {
            const result = config.hierarchyTitles[level] === true;
            console.log(`shouldIncludeTitle(${level}): Found in config, value=${config.hierarchyTitles[level]}, returning ${result}`);
            return result;
        }
        
        // If level is not in config, default to true
        console.log(`shouldIncludeTitle(${level}): Not in config, returning true`);
        return true;
    }

    /**
     * Groups leaf nodes with their hierarchy titles for export
     */
    private groupLeafNodesWithHierarchy(nodes: DocumentNode[], config?: ExportConfig, projectManager?: ProjectManager): { html: string; markdown: string; plain: string } {
        console.log('groupLeafNodesWithHierarchy called with config:', config?.hierarchyTitles);
        console.log('Nodes to process:', nodes.map(n => ({ title: n.title, level: n.level, template: n.template })));
        
        // Build hierarchical content structure to avoid duplicate parent headers
        const contentStructure = this.buildHierarchicalContentStructure(nodes, config, projectManager);
        return this.renderContentStructure(contentStructure, config);
    }

    /**
     * Builds a hierarchical content structure to avoid duplicate parent headers
     */
    private buildHierarchicalContentStructure(nodes: DocumentNode[], config?: ExportConfig, projectManager?: ProjectManager): ContentNode[] {
        const contentNodes: ContentNode[] = [];
        const nodeMap = new Map<string, ContentNode>();

        // Group nodes by their parent hierarchy
        const groupedNodes = this.groupNodesByParent(nodes, projectManager);
        
        for (const [parentPath, nodeGroup] of groupedNodes) {
            // Process each level of the hierarchy
            let currentLevel = contentNodes;
            let currentKey = '';
            
            // Add parent hierarchy levels
            parentPath.forEach((title, level) => {
                const includeTitle = this.shouldIncludeTitle(level, config);
                
                if (includeTitle) {
                    currentKey += `${level}:${title}|`;
                    
                    // Check if this node already exists at this level
                    let existingNode = nodeMap.get(currentKey);
                    
                    if (!existingNode) {
                        // Create new parent node
                        const titleId = this.generateHierarchyTitleId(title, level);
                        
                        existingNode = {
                            title,
                            titleId,
                            level,
                            content: '',
                            children: [],
                            isLeaf: false
                        };
                        
                        currentLevel.push(existingNode);
                        nodeMap.set(currentKey, existingNode);
                    }
                    
                    currentLevel = existingNode.children;
                }
            });
            
            // Add leaf nodes to the current level
            for (const node of nodeGroup) {
                if (node.content && node.content.trim()) {
                    const includeNodeTitle = this.shouldIncludeTitle(node.level, config);
                    
                    if (includeNodeTitle) {
                        const nodeId = this.generateNodeId(node, node.level);
                        
                        const leafKey = `${currentKey}leaf:${node.title}`;
                        
                        if (!nodeMap.has(leafKey)) {
                            const leafNode: ContentNode = {
                                title: node.title,
                                titleId: nodeId,
                                level: node.level,
                                content: node.content,
                                children: [],
                                isLeaf: true
                            };
                            
                            currentLevel.push(leafNode);
                            nodeMap.set(leafKey, leafNode);
                        }
                    } else {
                        // If title not included, just add content without title
                        const contentKey = `${currentKey}content:${node.id}`;
                        
                        if (!nodeMap.has(contentKey)) {
                            const contentNode: ContentNode = {
                                title: '',
                                titleId: '',
                                level: node.level,
                                content: node.content,
                                children: [],
                                isLeaf: true
                            };
                            
                            currentLevel.push(contentNode);
                            nodeMap.set(contentKey, contentNode);
                        }
                    }
                }
            }
        }
        
        return contentNodes;
    }

    /**
     * Renders the hierarchical content structure to different formats
     */
    private renderContentStructure(contentNodes: ContentNode[], config?: ExportConfig): { html: string; markdown: string; plain: string } {
        let html = '';
        let markdown = '';
        let plain = '';
        
        for (const node of contentNodes) {
            const renderedContent = this.renderContentNode(node, config);
            html += renderedContent.html;
            markdown += renderedContent.markdown;
            plain += renderedContent.plain;
        }
        
        return { html, markdown, plain };
    }

    /**
     * Renders a single content node and its children
     */
    private renderContentNode(node: ContentNode, config?: ExportConfig): { html: string; markdown: string; plain: string } {
        let html = '';
        let markdown = '';
        let plain = '';
        
        // Smart title handling: detect if this is an empty parent container
        const isEmptyParent = !node.content?.trim() && node.children.length > 0;
        const shouldMergeTitle = isEmptyParent && node.children.length === 1;
        
        if (shouldMergeTitle) {
            // Merge parent and child titles for cleaner output
            const child = node.children[0];
            if (!child) {
                throw new Error('Child node not found despite length check');
            }
            const mergedTitle = `${node.title} - ${child.title}`;
            
            // Render merged title at the child's level
            if (child.title) {
                // HTML
                const headingTag = `h${Math.min(child.level + 2, 6)}`;
                html += `
    <${headingTag} id="${child.titleId}">${escapeHtml(mergedTitle)}</${headingTag}>`;
                
                // Markdown
                const headingPrefix = '#'.repeat(Math.min(child.level + 2, 6));
                markdown += `${headingPrefix} ${mergedTitle}\n\n`;
                
                // Plain text
                const indent = '  '.repeat(child.level);
                plain += `${indent}${mergedTitle}\n`;
            }
            
            // Render child content
            if (child.content && child.content.trim()) {
                // HTML
                html += `
    <div class="node-content">
        <div class="content">
            ${formatContentAsHtml(child.content)}
        </div>
    </div>`;
                
                // Markdown
                markdown += `${child.content}\n\n`;
                
                // Plain text
                plain += '\n'; // Add spacing after title
                const contentLines = child.content.split('\n');
                for (const line of contentLines) {
                    plain += line ? `  ${line}\n` : '\n';
                }
                plain += '\n';
            }
            
            // Render child's children if any
            for (const grandchild of child.children) {
                const grandchildContent = this.renderContentNode(grandchild, config);
                html += grandchildContent.html;
                markdown += grandchildContent.markdown;
                plain += grandchildContent.plain;
            }
            
        } else if (isEmptyParent) {
            // Empty parent with multiple children - skip parent title, render children normally
            for (const child of node.children) {
                const childContent = this.renderContentNode(child, config);
                html += childContent.html;
                markdown += childContent.markdown;
                plain += childContent.plain;
            }
            
        } else {
            // Normal rendering for nodes with content or leaf nodes
            
            // Render the node title if it exists
            if (node.title) {
                // HTML
                const headingTag = `h${Math.min(node.level + 2, 6)}`;
                html += `
    <${headingTag} id="${node.titleId}">${escapeHtml(node.title)}</${headingTag}>`;
                
                // Markdown
                const headingPrefix = '#'.repeat(Math.min(node.level + 2, 6));
                markdown += `${headingPrefix} ${node.title}\n\n`;
                
                // Plain text
                const indent = '  '.repeat(node.level);
                plain += `${indent}${node.title}\n`;
            }
            
            // Render the node content if it exists
            if (node.content && node.content.trim()) {
                // HTML
                html += `
    <div class="node-content">
        <div class="content">
            ${formatContentAsHtml(node.content)}
        </div>
    </div>`;
                
                // Markdown
                markdown += `${node.content}\n\n`;
                
                // Plain text
                if (node.title) {
                    plain += '\n'; // Add spacing after title
                }
                const contentLines = node.content.split('\n');
                for (const line of contentLines) {
                    plain += line ? `  ${line}\n` : '\n';
                }
                plain += '\n';
            }
            
            // Render children
            for (const child of node.children) {
                const childContent = this.renderContentNode(child, config);
                html += childContent.html;
                markdown += childContent.markdown;
                plain += childContent.plain;
            }
        }
        
        return { html, markdown, plain };
    }

    /**
     * Groups nodes by their parent hierarchy path
     */
    private groupNodesByParent(nodes: DocumentNode[], projectManager?: ProjectManager): Map<string[], DocumentNode[]> {
        const groups = new Map<string[], DocumentNode[]>();

        for (const node of nodes) {
            const parentPath = this.getNodeParentPath(node, projectManager);
            const pathKey = parentPath.join('|'); // Use string key for Map
            
            // Find existing group with same path
            let existingGroup: DocumentNode[] | undefined;
            let existingKey: string[] | undefined;
            
            for (const [key, group] of groups) {
                if (key.join('|') === pathKey) {
                    existingGroup = group;
                    existingKey = key;
                    break;
                }
            }
            
            if (existingGroup && existingKey) {
                existingGroup.push(node);
            } else {
                groups.set(parentPath, [node]);
            }
        }
        
        return groups;
    }

    /**
     * Gets the parent hierarchy path for a node by traversing up the actual parent chain
     */
    private getNodeParentPath(node: DocumentNode, projectManager?: ProjectManager): string[] {
        const path: string[] = [];
        
        if (projectManager) {
            // Traverse up the parent chain to get actual parent titles
            let currentNodeId = node.parentId;
            while (currentNodeId) {
                const currentNode = projectManager.findNodeById(currentNodeId);
                if (currentNode && currentNode.parentId !== null) { // Don't include root node
                    // Insert at the beginning to maintain correct hierarchy order (root -> leaf)
                    path.unshift(currentNode.title);
                    currentNodeId = currentNode.parentId;
                } else {
                    break;
                }
            }
        } else {
            // Fallback to the old method if no project manager available
            if (node.template && node.level > 0) {
                for (let i = 0; i < node.level; i++) {
                    const templateLevel = node.template[i];
                    if (templateLevel) {
                        // Create a generic parent title based on template level
                        const levelName = templateLevel.replace(/\s+\d+$/, ''); // Remove numbers
                        path.push(`${levelName} 1`); // Use consistent numbering for grouped export
                    }
                }
            }
        }
        
        console.log(`getNodeParentPath for ${node.title} (level ${node.level}):`, path);
        return path;
    }

    // generateHierarchyTitles method removed - no longer used

    /**
     * Generates Markdown content for a list of nodes
     */
    private generateMarkdownContent(nodes: DocumentNode[], title: string, config?: ExportConfig, projectManager?: ProjectManager): string {
        let markdown = `# ${title}\n\n`;

        // Group nodes by hierarchy and generate content with hierarchy titles
        const groupedContent = this.groupLeafNodesWithHierarchy(nodes, config, projectManager);
        markdown += groupedContent.markdown;

        return markdown;
    }

    /**
     * Generates Markdown hierarchy for a node tree
     */
    private generateMarkdownHierarchy(node: DocumentNode, level: number = 1, config?: ExportConfig, projectManager?: ProjectManager): string {
        let markdown = '';
        
        // Check if titles should be included for this level
        const includeTitle = this.shouldIncludeTitle(level - 1, config); // level is 1-based here, convert to 0-based
        
        if (includeTitle) {
        const headingPrefix = '#'.repeat(level);
            markdown += `${headingPrefix} ${node.title}\n\n`;
        }

        if (node.context && node.context.trim()) {
            markdown += `*${node.context}*\n\n`;
        }

        if (node.content && node.content.trim()) {
            markdown += `${node.content}\n\n`;
        }

        for (const child of node.children) {
            markdown += this.generateMarkdownHierarchy(child, level + 1, config, projectManager);
        }

        return markdown;
    }

    /**
     * Generates plain text content for a list of nodes
     */
    private generatePlainTextContent(nodes: DocumentNode[], title: string, config?: ExportConfig, projectManager?: ProjectManager): string {
        const titleLine = title.toUpperCase();
        let text = `${titleLine}\n${'='.repeat(titleLine.length)}\n\n`;

        // Group nodes by hierarchy and generate content with hierarchy titles
        const groupedContent = this.groupLeafNodesWithHierarchy(nodes, config, projectManager);
        text += groupedContent.plain;

        return text;
    }

    /**
     * Generates plain text hierarchy for a node tree
     */
    private generatePlainTextHierarchy(node: DocumentNode, level: number = 0, config?: ExportConfig, projectManager?: ProjectManager): string {
        const indent = '  '.repeat(level);
        let text = '';
        
        // Check if titles should be included for this level
        const includeTitle = this.shouldIncludeTitle(level, config);
        
        if (includeTitle) {
            text += `${indent}${node.title}\n`;
        }

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
            text += this.generatePlainTextHierarchy(child, level + 1, config, projectManager);
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
            case ExportFormat.EPUB:
                return 'epub';
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
            case ExportFormat.EPUB:
                return 'application/epub+zip';
            case ExportFormat.Reimport:
                return 'application/json';
            default:
                return 'text/plain';
        }
    }
} 