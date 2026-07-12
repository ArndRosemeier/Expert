import JSZip from 'jszip';
import { DocumentNode } from '../../../DocumentNode';
import { ExportConfig, ExportScope } from '../types/ExportTypes';
import { ProjectManager } from '../../../ProjectManager';

/** One spine document (a navigable chapter) in the generated EPUB. */
interface EpubChapter {
    id: string;
    title: string;
    /** Pre-formatted XHTML body (paragraphs already escaped). */
    body: string;
    /** Source node, used to build the nested table of contents. Null for placeholders. */
    node: DocumentNode | null;
}

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
        console.log('[WorkingEpubGenerator] Content length:', node.content.length);
        
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

    private hasText(node: DocumentNode): boolean {
        return node.content.trim() !== '';
    }

    /**
     * Build the list of EPUB chapters (each becomes its own spine document, so
     * e-readers show real, navigable chapters). A chapter is the lowest
     * structural node (a node that has leaf children, e.g. a "Chapter"); its leaf
     * children (the scenes) flow together inside it, so it reads like a novel.
     * Pure grouping levels (e.g. "Part") become headings in the table of contents
     * but are not their own body documents. Outline text on structural nodes is
     * intentionally excluded - only the leaves' prose is emitted.
     */
    private buildChapters(root: DocumentNode, scope: ExportScope): EpubChapter[] {
        const chapters: EpubChapter[] = [];

        if (scope === ExportScope.Single) {
            if (this.hasText(root)) {
                chapters.push({ id: 'chapter0', title: root.title, body: this.extractContentFromNode(root), node: root });
            }
            return chapters;
        }

        this.collectChapters(root, chapters);

        // Shallow tree (e.g. Book -> Scene): the only structural node is the root,
        // which would collapse the whole book into one chapter again. Split each
        // leaf into its own chapter instead.
        if (chapters.length === 1 && chapters[0]?.node) {
            const source = chapters[0].node;
            const leaves = source.children.filter(c => c.isLeaf && this.hasText(c));
            if (leaves.length > 1) {
                chapters.length = 0;
                leaves.forEach((leaf, index) => {
                    chapters.push({ id: `chapter${index}`, title: leaf.title, body: this.extractContentFromNode(leaf), node: leaf });
                });
            }
        }

        // The exported node is itself a lone leaf with prose: emit it directly.
        if (chapters.length === 0 && this.hasText(root)) {
            chapters.push({ id: 'chapter0', title: root.title, body: this.extractContentFromNode(root), node: root });
        }

        return chapters;
    }

    /** Depth-first: emit a chapter for every node that has leaf children. */
    private collectChapters(node: DocumentNode, chapters: EpubChapter[]): void {
        const leafChildren = node.children.filter(c => c.isLeaf && this.hasText(c));
        if (leafChildren.length > 0) {
            const id = `chapter${chapters.length}`;
            chapters.push({ id, title: node.title, body: this.chapterBodyFromLeaves(leafChildren), node });
        }
        for (const child of node.children) {
            if (!child.isLeaf) {
                this.collectChapters(child, chapters);
            }
        }
    }

    /** Concatenate the scenes' prose with a subtle scene break between them. */
    private chapterBodyFromLeaves(leaves: DocumentNode[]): string {
        return leaves
            .map(leaf => this.extractContentFromNode(leaf))
            .join('\n    <p class="scene-break">* * *</p>\n    ');
    }

    async generate(node: DocumentNode, config: ExportConfig, projectManager?: ProjectManager): Promise<Blob> {
        void projectManager;
        console.log('[WorkingEpubGenerator] Starting EPUB generation for:', node.title);
        console.log('[WorkingEpubGenerator] Scope:', config.scope);

        const chapters = this.buildChapters(node, config.scope);
        console.log('[WorkingEpubGenerator] Built', chapters.length, 'chapter(s)');

        // If nothing was found, create a minimal placeholder so the file is valid.
        if (chapters.length === 0) {
            chapters.push({
                id: 'chapter0',
                title: 'No Content Available',
                body: '<p>No content was found for the selected scope. Please check that your nodes contain content.</p>',
                node: null
            });
        }

        // Add required files to ZIP
        this.addMimeType();
        this.addContainerXml();
        this.addPackageOpf(node.title, chapters, config.author ?? 'Expert Application');
        this.addNavXhtml(node, chapters);
        this.addStyles();
        this.addChapterFiles(chapters);

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

    private addPackageOpf(bookTitle: string, chapters: EpubChapter[], author: string = 'Expert Application'): void {
        // One manifest item and one spine entry per chapter, so e-readers render
        // each chapter as its own navigable page.
        const manifestItems = chapters
            .map(c => `        <item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`)
            .join('\n');
        const spineItems = chapters
            .map(c => `        <itemref idref="${c.id}"/>`)
            .join('\n');

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

    private addNavXhtml(root: DocumentNode, chapters: EpubChapter[]): void {
        // Build a (possibly nested) table of contents that mirrors the structural
        // hierarchy: grouping levels (e.g. "Part") become headers containing their
        // chapters. Falls back to a flat list when the structure does not map.
        const idByNodeId = new Map<string, string>();
        for (const chapter of chapters) {
            if (chapter.node) {
                idByNodeId.set(chapter.node.id, chapter.id);
            }
        }

        let navItems: string;
        if (idByNodeId.has(root.id)) {
            navItems = this.navForNode(root, idByNodeId, 4);
        } else {
            navItems = root.children
                .filter(c => !c.isLeaf)
                .map(c => this.navForNode(c, idByNodeId, 4))
                .join('');
        }

        if (navItems.trim().length === 0) {
            navItems = chapters
                .map(c => `                <li><a href="${c.id}.xhtml">${this.escapeHtml(c.title)}</a></li>`)
                .join('\n');
        }

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

    /**
     * Render one TOC entry for a node. Chapter nodes become links to their spine
     * document; pure grouping nodes become a label wrapping their nested entries.
     * Returns an empty string for grouping nodes that contain no chapters.
     */
    private navForNode(node: DocumentNode, idByNodeId: Map<string, string>, indent: number): string {
        const pad = ' '.repeat(indent * 4);
        const nested = node.children
            .filter(c => !c.isLeaf)
            .map(c => this.navForNode(c, idByNodeId, indent + 1))
            .join('');

        const chapterId = idByNodeId.get(node.id);
        if (chapterId) {
            const inner = nested ? `\n${pad}    <ol>\n${nested}${pad}    </ol>\n${pad}` : '';
            return `${pad}<li><a href="${chapterId}.xhtml">${this.escapeHtml(node.title)}</a>${inner}</li>\n`;
        }

        if (nested.length === 0) {
            return '';
        }
        return `${pad}<li><span>${this.escapeHtml(node.title)}</span>\n${pad}    <ol>\n${nested}${pad}    </ol>\n${pad}</li>\n`;
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

.scene-break {
    text-align: center;
    margin: 1.5em 0;
    letter-spacing: 0.5em;
    color: #7f8c8d;
}

.node-section {
    margin-bottom: 3em;
    padding-bottom: 2em;
    border-bottom: 1px solid #e0e0e0;
}

.node-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
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

    private addChapterFiles(chapters: EpubChapter[]): void {
        // One XHTML document per chapter, each its own spine entry, so e-readers
        // page-break between chapters and show them in the navigation.
        for (const chapter of chapters) {
            const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${this.escapeHtml(chapter.title)}</title>
    <link rel="stylesheet" href="styles.css"/>
</head>
<body>
    <h1>${this.escapeHtml(chapter.title)}</h1>
    <div class="content">
    ${chapter.body}
    </div>
</body>
</html>`;
            this.zip.file(`OEBPS/${chapter.id}.xhtml`, chapterHtml);
        }
    }


} 