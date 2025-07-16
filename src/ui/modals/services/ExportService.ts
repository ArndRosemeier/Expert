/**
 * Service for handling document export functionality
 */

import { DocumentNode } from '../../../DocumentNode';
import { ProjectManager } from '../../../ProjectManager';
import { IExportService, ExportConfig, ExportResult, NodeExportData, ExportScope, ExportFormat } from '../types/ExportTypes';
import { sanitizeFilename, escapeHtml, formatContentAsHtml } from '../core/modal-utils';
import { FileDownloadService, FileDownloadResult } from '../../../utils/FileDownloadService';
import JSZip from 'jszip';
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

/**
 * Interface for EPUB chapter data
 */
interface EpubChapter {
    title: string;
    content: string;
    filename: string;
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
            filename = config.filename || `${sanitizeFilename(node.title)}_${config.scope}.epub`;
            mimeType = 'application/epub+zip';
        } else {
            // Export for reading - formatted content
            content = this.exportNodeContent(node, config.scope, config.format, config, projectManager);
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
     * Generates EPUB content using WorkingEpubGenerator
     */
    private async generateEpubContent(node: DocumentNode, config: ExportConfig, projectManager?: ProjectManager): Promise<Blob> {
        const generator = new WorkingEpubGenerator();
        return await generator.generate(node, config, projectManager);
    }


    

    
    private generateSimpleStyles(): string {
        console.log('[EPUB STYLES] Generating CSS styles...');
        
        const styles = `body {
    font-family: serif;
    line-height: 1.6;
    margin: 1em;
    max-width: 40em;
}

h1 {
    font-size: 1.5em;
    margin-bottom: 1em;
}

h2 {
    font-size: 1.3em;
    margin-bottom: 0.8em;
}

h3 {
    font-size: 1.1em;
    margin-bottom: 0.6em;
}

p {
    margin-bottom: 1em;
}

nav ol {
    list-style-type: none;
    padding-left: 0;
}

nav li {
    margin-bottom: 0.5em;
}

nav a {
    text-decoration: none;
    color: #333;
}

nav a:hover {
    text-decoration: underline;
}`;
        
        console.log('[EPUB STYLES] CSS styles generated successfully, length:', styles.length);
        return styles;
    }



    /**
     * Gets a smart title for a node, considering if its parent is an empty container
     */
    private getSmartTitleForNode(node: DocumentNode, projectManager?: ProjectManager): string {
        if (!projectManager || !node.parentId) {
            return node.title;
        }
        
        const parent = projectManager.findNodeById(node.parentId);
        if (!parent) {
            return node.title;
        }
        
        // Check if parent is an empty container (no content, only children)
        const isParentEmpty = !parent.content?.trim() && parent.children.length > 0;
        
        // Check if this node is the only child or the first child of an empty parent
        const firstChild = parent.children[0];
        const isFirstChild = firstChild && firstChild.id === node.id;
        
        if (isParentEmpty && isFirstChild) {
            // Merge parent and child titles for cleaner output
            return `${parent.title} - ${node.title}`;
        }
        
        return node.title;
    }

    /**
     * Collect chapters for EPUB based on scope - reuses HTML export logic
     */
    private collectEpubChapters(node: DocumentNode, config: ExportConfig, projectManager?: ProjectManager): EpubChapter[] {
        const chapters: EpubChapter[] = [];
        
        if (config.scope === ExportScope.Single) {
            // Single node export
            const htmlContent = this.generateHtmlHierarchy(node, 1, config, projectManager);
            const bodyContent = this.extractBodyContent(htmlContent);
            chapters.push({
                title: node.title,
                content: bodyContent,
                filename: 'chapter1.html'
            });
        } else if (config.scope === ExportScope.Hierarchy) {
            // Hierarchical export - use the same logic as HTML export
            const htmlContent = this.generateHtmlHierarchy(node, 1, config, projectManager);
            const bodyContent = this.extractBodyContent(htmlContent);
            chapters.push({
                title: node.title,
                content: bodyContent,
                filename: 'chapter1.html'
            });
        } else if (config.scope === ExportScope.Leaves) {
            // Leaf nodes export - use the same logic as HTML export
            const leafNodes = this.findLeafNodes(node);
            const htmlContent = this.generateHtmlContent(leafNodes, node.title, config, projectManager);
            const bodyContent = this.extractBodyContent(htmlContent);
            chapters.push({
                title: node.title,
                content: bodyContent,
                filename: 'chapter1.html'
            });
        }
        
        return chapters;
    }

    /**
     * Extracts body content from full HTML document for EPUB
     */
    private extractBodyContent(htmlContent: string): string {
        console.log('�� extractBodyContent called with HTML length:', htmlContent.length);
        console.log('🔍 First 500 chars:', htmlContent.substring(0, 500));
        
        // Find the content-area div
        const contentAreaMatch = htmlContent.match(/<div class="content-area">([\s\S]*?)<\/div>\s*<\/div>\s*<\/body>/);
        if (contentAreaMatch && contentAreaMatch[1]) {
            console.log('✅ Content-area match found, length:', contentAreaMatch[1].length);
            let extracted = contentAreaMatch[1].trim();
            
            // Clean up the content for EPUB compatibility
            extracted = this.cleanContentForEpub(extracted);
            
            console.log('🔍 Cleaned content first 500 chars:', extracted.substring(0, 500));
            console.log('🔍 Cleaned content last 500 chars:', extracted.substring(extracted.length - 500));
            return extracted;
        }
        
        // Fallback: try to extract body content
        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/);
        if (bodyMatch && bodyMatch[1]) {
            console.log('✅ Body match found, length:', bodyMatch[1].length);
            let extracted = bodyMatch[1].trim();
            
            // Clean up the content for EPUB compatibility
            extracted = this.cleanContentForEpub(extracted);
            
            console.log('🔍 Body cleaned first 500 chars:', extracted.substring(0, 500));
            return extracted;
        }
        
        // If no match found, return the content as-is
        console.log('⚠️ No match found, returning original content');
        return htmlContent;
    }

    /**
     * Clean content for EPUB compatibility by removing wrapper divs and unnecessary elements
     */
    private cleanContentForEpub(content: string): string {
        // Remove outer wrapper divs but keep the essential content structure
        let cleaned = content;
        
        // Remove node-content wrapper divs
        cleaned = cleaned.replace(/<div class="node-content">\s*<div class="content">/g, '');
        cleaned = cleaned.replace(/<\/div>\s*<\/div>/g, '');
        
        // Remove metadata divs
        cleaned = cleaned.replace(/<div class="metadata">[\s\S]*?<\/div>/g, '');
        
        // Remove empty divs
        cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/g, '');
        
        // Remove standalone div tags without content
        cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/g, '');
        
        // Convert multiple line breaks to paragraph breaks, but do this more carefully
        // First, normalize line breaks
        cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Replace double line breaks with paragraph markers
        cleaned = cleaned.replace(/\n\s*\n/g, '\n\n[PARAGRAPH_BREAK]\n\n');
        
        // Replace single <br> tags with line breaks
        cleaned = cleaned.replace(/<br\s*\/?>/g, '\n');
        
        // Replace double <br> patterns with paragraph breaks
        cleaned = cleaned.replace(/\n\s*\n/g, '\n\n[PARAGRAPH_BREAK]\n\n');
        
        // Split content into paragraphs and wrap each in proper <p> tags
        const paragraphs = cleaned.split('[PARAGRAPH_BREAK]')
            .map(p => p.trim())
            .filter(p => p.length > 0);
        
        // Wrap each paragraph in <p> tags, but preserve existing headings
        const wrappedParagraphs = paragraphs.map(para => {
            // If paragraph already starts with HTML tag, keep it as is
            if (para.match(/^\s*<[h1-6]|^\s*<div|^\s*<p/)) {
                return para;
            }
            // Otherwise wrap in <p> tags
            return `<p>${para}</p>`;
        });
        
        return wrappedParagraphs.join('\n\n');
    }

    /**
     * Escape text for XML context
     */
    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Generate content.opf file
     */
    private generateContentOpf(rootNode: DocumentNode, chapters: EpubChapter[], epubUuid: string): string {
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:identifier id="bookid" opf:scheme="uuid">${this.escapeXml(epubUuid)}</dc:identifier>
        <dc:title>${this.escapeXml(rootNode.title)}</dc:title>
        <dc:creator opf:role="aut">Expert Application</dc:creator>
        <dc:publisher>Expert Application</dc:publisher>
        <dc:description>Generated from Expert Application</dc:description>
        <dc:date>${currentDate}</dc:date>
        <dc:language>en</dc:language>
        <dc:rights>All rights reserved</dc:rights>
        <meta name="cover" content="cover-image"/>
    </metadata>
    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="styles" href="styles.css" media-type="text/css"/>
        ${chapters.map((chapter, index) => {
            const filename = chapter.filename || `chapter${index + 1}.html`;
            return `<item id="chapter${index + 1}" href="${this.escapeXml(filename)}" media-type="application/xhtml+xml"/>`;
        }).join('\n        ')}
    </manifest>
    <spine toc="ncx">
        ${chapters.map((chapter, index) => 
            `<itemref idref="chapter${index + 1}"/>`
        ).join('\n        ')}
    </spine>
</package>`;
    }

    /**
     * Generate toc.ncx file
     */
    private generateTocNcx(rootNode: DocumentNode, chapters: EpubChapter[], epubUuid: string): string {
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
    <head>
        <meta name="dtb:uid" content="${epubUuid}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle>
        <text>${this.escapeXml(rootNode.title)}</text>
    </docTitle>
    <navMap>
        ${chapters.map((chapter, index) => {
            const filename = chapter.filename || `chapter${index + 1}.html`;
            return `<navPoint id="chapter${index + 1}" playOrder="${index + 1}">
            <navLabel>
                <text>${this.escapeXml(chapter.title)}</text>
            </navLabel>
            <content src="${filename}"/>
        </navPoint>`;
        }).join('\n        ')}
    </navMap>
</ncx>`;
    }

    /**
     * Generate CSS for EPUB
     */
    private generateEpubCss(): string {
        return `body {
    font-family: Georgia, serif;
    line-height: 1.6;
    margin: 0;
    padding: 1em;
    max-width: 100%;
}

.chapter {
    margin-bottom: 2rem;
}

h1, h2, h3, h4, h5, h6 {
    color: #2c3e50;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
}

h1 {
    font-size: 2em;
    border-bottom: 2px solid #3498db;
    padding-bottom: 0.5rem;
    color: #2c3e50;
}

h2 {
    font-size: 1.5em;
    border-bottom: 1px solid #666;
    padding-bottom: 0.2em;
    color: #34495e;
    margin-top: 2rem;
}

h3, h4, h5, h6 {
    color: #34495e;
    margin-top: 2rem;
}

p {
    margin-bottom: 1rem;
    text-align: justify;
}

.content {
    margin-bottom: 2rem;
}

.metadata {
    font-size: 0.9rem;
    color: #6c757d;
    margin-bottom: 1rem;
}

ul, ol {
    margin-bottom: 1em;
    padding-left: 2em;
}

li {
    margin-bottom: 0.5em;
}

blockquote {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #3498db;
    background-color: #f8f9fa;
    font-style: italic;
}

code {
    background-color: #f8f9fa;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
}

pre {
    background-color: #f8f9fa;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    margin-bottom: 1em;
}

.context {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #f8f9fa;
    border-radius: 4px;
}

.context h3 {
    margin-top: 0;
    color: #495057;
}

table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 1em;
}

th, td {
    border: 1px solid #ddd;
    padding: 0.5em;
    text-align: left;
}

th {
    background-color: #f2f2f2;
}`;
    }

    /**
     * Generate HTML for a single chapter
     */
    private generateChapterHtml(chapter: EpubChapter): string {
        console.log('🔍 generateChapterHtml called for:', chapter.title);
        console.log('🔍 Chapter content length:', chapter.content.length);
        console.log('🔍 Chapter content first 500 chars:', chapter.content.substring(0, 500));
        
        const html = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${this.escapeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
    ${chapter.content}
</body>
</html>`;
        
        console.log('🔍 Final chapter HTML length:', html.length);
        return html;
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
        includeHtmlToc?: boolean
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