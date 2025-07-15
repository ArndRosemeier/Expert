import JSZip from 'jszip';
import { DocumentNode } from '../../../DocumentNode';
import { FileDownloadService } from '../../../utils/FileDownloadService';

export interface SimpleEpubSection {
    title: string;
    content: string;
    filename: string;
}

export class SimpleEpubGenerator {
    /**
     * Generate EPUB from sections using minimal structure
     */
    static async generateEpub(
        bookTitle: string,
        sections: SimpleEpubSection[]
    ): Promise<void> {
        const zip = new JSZip();
        
        // 1. Add mimetype (first file, no compression)
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        
        // 2. Add container.xml
        const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`;
        zip.file('META-INF/container.xml', containerXml);
        
        // 3. Add package.opf
        const packageOpf = this.generatePackageOpf(bookTitle, sections);
        zip.file('OEBPS/content.opf', packageOpf);
        
        // 4. Add navigation document (nav.xhtml)
        const navXhtml = this.generateNavXhtml(bookTitle, sections);
        zip.file('OEBPS/nav.xhtml', navXhtml);
        
        // 5. Add CSS
        const styles = this.generateStyles();
        zip.file('OEBPS/styles.css', styles);
        
        // 6. Add HTML chapters
        sections.forEach(section => {
            const html = this.generateChapterHtml(section);
            zip.file(`OEBPS/${section.filename}`, html);
        });
        
        // 7. Generate and download
        const content = await zip.generateAsync({ type: 'blob' });
        const filename = `${bookTitle.replace(/[^a-zA-Z0-9]/g, '_')}.epub`;
        
        await FileDownloadService.downloadBlob(content, {
            filename: filename,
            mimeType: 'application/epub+zip',
            description: 'EPUB E-Book'
        });
    }
    
    private static generatePackageOpf(bookTitle: string, sections: SimpleEpubSection[]): string {
        const currentDate = new Date().toISOString().split('T')[0];
        const bookId = `book-${Date.now()}`;
        
        const manifestItems = sections.map(section => 
            `        <item id="${section.filename.replace('.xhtml', '')}" href="${section.filename}" media-type="application/xhtml+xml"/>`
        ).join('\n');
        
        const spineItems = sections.map(section => 
            `        <itemref idref="${section.filename.replace('.xhtml', '')}"/>`
        ).join('\n');
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="bookid">${bookId}</dc:identifier>
        <dc:title>${this.escapeXml(bookTitle)}</dc:title>
        <dc:creator>Expert Application</dc:creator>
        <dc:language>en</dc:language>
        <dc:date>${currentDate}</dc:date>
        <meta property="dcterms:modified">${new Date().toISOString()}</meta>
    </metadata>
    <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="css" href="styles.css" media-type="text/css"/>
${manifestItems}
    </manifest>
    <spine>
${spineItems}
    </spine>
</package>`;
    }
    
    private static generateNavXhtml(bookTitle: string, sections: SimpleEpubSection[]): string {
        const navItems = sections.map(section => 
            `            <li><a href="${section.filename}">${this.escapeXml(section.title)}</a></li>`
        ).join('\n');
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
    <title>Table of Contents</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
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
    }
    
    private static generateChapterHtml(section: SimpleEpubSection): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${this.escapeXml(section.title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
    <h1>${this.escapeXml(section.title)}</h1>
    ${section.content}
</body>
</html>`;
    }
    
    private static generateStyles(): string {
        return `body {
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
    }
    
    private static escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
} 