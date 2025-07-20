import JSZip from 'jszip';
import { DocumentNode } from '../../../DocumentNode';
import { ExportConfig, ExportScope } from '../types/ExportTypes';
import { ProjectManager } from '../../../ProjectManager';

export class WorkingEpubGenerator {
    private zip: JSZip;
    private uuid: string;
    private timestamp: string;

    constructor() {
        this.zip = new JSZip();
        this.uuid = this.generateUUID();
        this.timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }



    private extractContentFromNode(node: DocumentNode): string {
        console.log('[WorkingEpubGenerator] Extracting content from node:', node.title);
        console.log('[WorkingEpubGenerator] Raw node content:', node.content);
        console.log('[WorkingEpubGenerator] Content length:', node.content?.length || 0);
        
        if (!node.content || node.content.trim() === '') {
            console.log('[WorkingEpubGenerator] No content found, using placeholder');
            return '<p>No content available</p>';
        }

        // Clean up content and convert to proper paragraph format
        let content = node.content.trim();
        console.log('[WorkingEpubGenerator] Trimmed content:', content);
        
        // Remove any existing HTML tags except for basic formatting
        content = content.replace(/<\/?(?:div|span|br)[^>]*>/gi, '');
        console.log('[WorkingEpubGenerator] After HTML cleanup:', content);
        
        // TEMPORARY: Use simple paragraph formatting like HelloWorldEpubGenerator
        const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
        const simpleFormatted = paragraphs.map(p => `<p>${this.escapeHtml(p)}</p>`).join('\n    ');
        console.log('[WorkingEpubGenerator] Simple formatted content:', simpleFormatted);
        
        return simpleFormatted;
    }

    private collectAllNodes(node: DocumentNode): DocumentNode[] {
        const nodes = [node];
        if (node.children) {
            for (const child of node.children) {
                nodes.push(...this.collectAllNodes(child));
            }
        }
        return nodes;
    }

    /**
     * Find all leaf nodes (nodes with no children) in the tree
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

    async generate(node: DocumentNode, config: ExportConfig, _projectManager?: ProjectManager): Promise<Blob> {
        console.log('[WorkingEpubGenerator] Starting EPUB generation for:', node.title);
        console.log('[WorkingEpubGenerator] Scope:', config.scope);
        
        // Collect nodes to export based on scope
        let nodesToExport: DocumentNode[];
        switch (config.scope) {
            case ExportScope.Single:
                nodesToExport = [node];
                console.log('[WorkingEpubGenerator] Single node export');
                break;
            case ExportScope.Leaves:
                nodesToExport = this.findLeafNodes(node);
                console.log('[WorkingEpubGenerator] Leaf nodes export:', nodesToExport.length, 'leaf nodes found');
                break;
            case ExportScope.Hierarchy:
            default:
                nodesToExport = this.collectAllNodes(node);
                console.log('[WorkingEpubGenerator] Hierarchical export:', nodesToExport.length, 'total nodes found');
                break;
        }
        
        // Filter nodes with actual content
        const contentNodes = nodesToExport.filter(n => n.content && n.content.trim() !== '');
        console.log('[WorkingEpubGenerator] Found', contentNodes.length, 'nodes with content from', nodesToExport.length, 'total nodes');
        
        // Debug: Log details about each content node
        contentNodes.forEach((node, index) => {
            console.log(`[WorkingEpubGenerator] Content node ${index + 1}:`, node.title, 'content length:', node.content?.length || 0);
        });
        
        // If no content nodes found, create a minimal placeholder
        if (contentNodes.length === 0) {
            console.log('[WorkingEpubGenerator] No content nodes found, creating placeholder');
            const placeholderNode = {
                title: 'No Content Available',
                content: 'No content was found for the selected scope. Please check that your nodes contain content.'
            } as DocumentNode;
            contentNodes.push(placeholderNode);
        }
        
        // Add required files to ZIP
        this.addMimeType();
        this.addContainerXml();
        this.addPackageOpf(node.title, contentNodes, config.author || 'Expert Application');
        this.addNavXhtml(node.title, contentNodes);
        this.addStyles();
        
        // Add chapters
        contentNodes.forEach((contentNode, index) => {
            this.addChapter(contentNode, index + 1);
        });
        
        // Generate and return blob
        const blob = await this.zip.generateAsync({ type: 'blob' });
        console.log('[WorkingEpubGenerator] EPUB generation complete, size:', blob.size);
        return blob;
    }

    private addMimeType(): void {
        this.zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    }

    private addContainerXml(): void {
        const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`;
        this.zip.file('META-INF/container.xml', containerXml);
    }

    private addPackageOpf(bookTitle: string, contentNodes: DocumentNode[], author: string = 'Expert Application'): void {
        const manifestItems = contentNodes.map((_node, index) => 
            `        <item id="chapter${index + 1}" href="chapter${index + 1}.xhtml" media-type="application/xhtml+xml"/>`
        ).join('\n');
        
        const spineItems = contentNodes.map((_node, index) => 
            `        <itemref idref="chapter${index + 1}"/>`
        ).join('\n');

        const packageOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="BookId">${this.uuid}</dc:identifier>
        <dc:title>${this.escapeXml(bookTitle)}</dc:title>
        <dc:creator>${this.escapeXml(author)}</dc:creator>
        <dc:language>en</dc:language>
        <dc:date>${this.timestamp}</dc:date>
        <meta property="dcterms:modified">${this.timestamp}</meta>
    </metadata>
    <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="stylesheet" href="styles.css" media-type="text/css"/>
${manifestItems}
    </manifest>
    <spine>
${spineItems}
    </spine>
</package>`;
        this.zip.file('OEBPS/content.opf', packageOpf);
    }

    private addNavXhtml(_bookTitle: string, contentNodes: DocumentNode[]): void {
        const navItems = contentNodes.map((node, index) => 
            `                <li><a href="chapter${index + 1}.xhtml">${this.escapeHtml(node.title)}</a></li>`
        ).join('\n');

        const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
    <title>Navigation</title>
    <link rel="stylesheet" href="styles.css"/>
</head>
<body>
    <nav epub:type="toc" id="toc">
        <h1>Table of Contents</h1>
        <ol>
${navItems}
        </ol>
    </nav>
</body>
</html>`;
        this.zip.file('OEBPS/nav.xhtml', navXhtml);
    }

    private addStyles(): void {
        const styles = `
body {
    font-family: Georgia, serif;
    font-size: 0.84em;
    line-height: 1.6;
    margin: 0;
    padding: 2em;
    max-width: 40em;
    margin-left: auto;
    margin-right: auto;
}

h1, h2, h3, h4, h5, h6 {
    color: #2c3e50;
    margin-top: 2em;
    margin-bottom: 1em;
}

h1 {
    font-size: 1.4em;
    border-bottom: 2px solid #3498db;
    padding-bottom: 0.5em;
}

p {
    margin-bottom: 1.5em;
    text-align: justify;
}

nav ol {
    list-style-type: none;
    padding-left: 0;
}

nav li {
    margin-bottom: 0.5em;
}

nav a {
    color: #3498db;
    text-decoration: none;
}

nav a:hover {
    text-decoration: underline;
}
`;
        this.zip.file('OEBPS/styles.css', styles);
    }

    private addChapter(node: DocumentNode, chapterNumber: number): void {
        const content = this.extractContentFromNode(node);
        
        const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${this.escapeHtml(node.title)}</title>
    <link rel="stylesheet" href="styles.css"/>
</head>
<body>
    <h1>${this.escapeHtml(node.title)}</h1>
    <div class="content">
        ${content}
    </div>
</body>
</html>`;
        this.zip.file(`OEBPS/chapter${chapterNumber}.xhtml`, chapterHtml);
    }
} 