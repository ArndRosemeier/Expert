import { BaseModal } from './core/BaseModal';
import { ModalConfig, ModalHooks } from './types/ModalTypes';
import { createElement } from './core/modal-utils';

export class ManualModal extends BaseModal {
    private manualContent: string = '';
    private searchQuery: string = '';

    constructor(config: ModalConfig = { id: 'manual-modal' }, hooks: ModalHooks = {}) {
        super({
            ...config,
            title: 'Expert System - User Manual',
            maxWidth: '95vw',
            maxHeight: '95vh',
            width: '1400px',
            height: '900px'
        }, {
            ...hooks,
            onOpen: async () => {
                await hooks.onOpen?.();
                await this.loadManual();
                this.setupManualEvents();
            }
        });
    }

    public render(): HTMLElement {
        const container = createElement('div', {
            classes: ['manual-modal-container']
        });
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = this.getModalStyles();
        container.appendChild(style);
        
        // Add the main content structure
        container.innerHTML += this.getManualHTML();
        
        // Make methods available globally for button clicks
        (window as any).manualModal = this;
        
        return container;
    }

    private getModalStyles(): string {
        return `
            .manual-container {
                display: grid;
                grid-template-columns: 300px 1fr;
                gap: 1.5rem;
                height: 100%;
                overflow: hidden;
            }
            
            .manual-header {
                grid-column: 1 / -1;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem 0;
                border-bottom: 1px solid var(--border-color, #e2e8f0);
                margin-bottom: 1rem;
            }
            
            .manual-search-container {
                position: relative;
                flex-grow: 1;
                max-width: 400px;
            }
            
            .manual-search-input {
                width: 100%;
                padding: 0.5rem 0.75rem;
                border: 1px solid var(--border-color, #d1d5db);
                border-radius: 6px;
                font-size: 0.875rem;
                background: var(--input-bg, #fff);
            }
            
            .manual-search-input:focus {
                outline: none;
                border-color: var(--primary-color, #3b82f6);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            .manual-controls {
                display: flex;
                gap: 0.5rem;
                align-items: center;
            }
            
            .manual-btn {
                padding: 0.5rem 0.75rem;
                border: 1px solid var(--border-color, #d1d5db);
                border-radius: 6px;
                background: var(--input-bg, #fff);
                cursor: pointer;
                font-size: 0.875rem;
                transition: all 0.2s ease;
            }
            
            .manual-btn:hover {
                background: var(--bg-subtle, #f9fafb);
                border-color: var(--secondary-color, #6b7280);
            }
            
            .manual-sidebar {
                background: var(--bg-subtle, #f8fafc);
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 8px;
                padding: 1rem;
                overflow-y: auto;
                height: calc(100% - 80px);
            }
            
            .manual-sidebar h3 {
                font-size: 1rem;
                font-weight: 600;
                margin: 0 0 0.75rem 0;
                color: var(--text-primary, #1e293b);
            }
            
            .manual-toc {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            
            .manual-toc li {
                margin-bottom: 0.25rem;
            }
            
            .manual-toc a {
                color: var(--text-secondary, #64748b);
                text-decoration: none;
                display: block;
                padding: 0.375rem 0.5rem;
                border-radius: 4px;
                font-size: 0.875rem;
                transition: all 0.2s ease;
                border-left: 3px solid transparent;
            }
            
            .manual-toc a:hover {
                background: var(--input-bg, #fff);
                color: var(--primary-color, #3b82f6);
                border-left-color: var(--primary-color, #3b82f6);
            }
            
            .manual-toc a.active {
                background: var(--primary-color, #3b82f6);
                color: white;
                border-left-color: var(--primary-color, #3b82f6);
            }
            
            .manual-toc .toc-h2 {
                padding-left: 0.5rem;
            }
            
            .manual-toc .toc-h3 {
                padding-left: 1rem;
                font-size: 0.8rem;
            }
            
            .manual-content {
                background: var(--input-bg, #fff);
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 8px;
                padding: 2rem;
                overflow-y: auto;
                height: calc(100% - 80px);
            }
            
            .manual-content h1 {
                font-size: 2rem;
                font-weight: 700;
                margin-bottom: 1.5rem;
                color: var(--text-primary, #1e293b);
                border-bottom: 2px solid var(--border-color, #e2e8f0);
                padding-bottom: 1rem;
            }
            
            .manual-content h2 {
                font-size: 1.5rem;
                font-weight: 600;
                margin: 2rem 0 1rem 0;
                color: var(--text-primary, #1e293b);
                border-left: 4px solid var(--primary-color, #3b82f6);
                padding-left: 1rem;
            }
            
            .manual-content h3 {
                font-size: 1.25rem;
                font-weight: 600;
                margin: 1.5rem 0 0.75rem 0;
                color: var(--text-primary, #1e293b);
            }
            
            .manual-content h4 {
                font-size: 1.125rem;
                font-weight: 600;
                margin: 1.25rem 0 0.5rem 0;
                color: var(--text-primary, #1e293b);
            }
            
            .manual-content p {
                margin-bottom: 1rem;
                line-height: 1.7;
                color: var(--text-primary, #1e293b);
            }
            
            .manual-content ul, .manual-content ol {
                margin-bottom: 1rem;
                padding-left: 1.5rem;
            }
            
            .manual-content li {
                margin-bottom: 0.5rem;
                line-height: 1.6;
            }
            
            .manual-content code {
                background: var(--bg-subtle, #f8fafc);
                padding: 0.125rem 0.375rem;
                border-radius: 4px;
                font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
                font-size: 0.875rem;
                color: var(--primary-color, #3b82f6);
                border: 1px solid var(--border-color, #e2e8f0);
            }
            
            .manual-content pre {
                background: var(--bg-subtle, #f8fafc);
                padding: 1rem;
                border-radius: 6px;
                margin: 1rem 0;
                overflow-x: auto;
                border: 1px solid var(--border-color, #e2e8f0);
            }
            
            .manual-content pre code {
                background: none;
                padding: 0;
                border: none;
                color: var(--text-primary, #1e293b);
            }
            
            .manual-content blockquote {
                border-left: 4px solid var(--primary-color, #3b82f6);
                padding: 1rem 1.5rem;
                margin: 1rem 0;
                background: var(--bg-subtle, #f8fafc);
                font-style: italic;
                color: var(--text-secondary, #64748b);
            }
            
            .manual-content table {
                width: 100%;
                border-collapse: collapse;
                margin: 1rem 0;
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 6px;
                overflow: hidden;
            }
            
            .manual-content th, .manual-content td {
                padding: 0.75rem 1rem;
                text-align: left;
                border-bottom: 1px solid var(--border-color, #e2e8f0);
            }
            
            .manual-content th {
                background: var(--bg-subtle, #f8fafc);
                font-weight: 600;
                color: var(--text-primary, #1e293b);
            }
            
            .manual-content tr:hover {
                background: rgba(59, 130, 246, 0.05);
            }
            
            .manual-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 200px;
                font-size: 1rem;
                color: var(--text-secondary, #64748b);
            }
            
            .manual-error {
                background: #fef2f2;
                border: 1px solid #fecaca;
                color: #dc2626;
                padding: 1rem;
                border-radius: 6px;
                margin: 1rem 0;
            }
            
            .manual-search-highlight {
                background: #fef08a;
                padding: 1px 2px;
                border-radius: 2px;
            }
            
            .app-feature-link {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                color: var(--primary-color, #3b82f6);
                text-decoration: none;
                font-weight: 500;
                padding: 0.25rem 0.5rem;
                border-radius: 4px;
                border: 1px solid var(--primary-color, #3b82f6);
                background: rgba(59, 130, 246, 0.05);
                transition: all 0.2s ease;
            }
            
            .app-feature-link:hover {
                background: rgba(59, 130, 246, 0.1);
                transform: translateY(-1px);
            }
            
            @media (max-width: 768px) {
                .manual-container {
                    grid-template-columns: 1fr;
                    gap: 1rem;
                }
                
                .manual-sidebar {
                    height: auto;
                    max-height: 200px;
                }
                
                .manual-content {
                    height: auto;
                    min-height: 400px;
                }
                
                .manual-header {
                    flex-direction: column;
                    gap: 1rem;
                }
                
                .manual-search-container {
                    max-width: none;
                    width: 100%;
                }
            }
        `;
    }

    private getManualHTML(): string {
        return `
            <div class="manual-container">
                <div class="manual-header">
                    <div class="manual-search-container">
                        <input type="text" class="manual-search-input" placeholder="Search manual..." id="manualSearchInput">
                    </div>
                    <div class="manual-controls">
                        <button class="manual-btn" onclick="window.manualModal.toggleSidebar()">📑 TOC</button>
                        <button class="manual-btn" onclick="window.manualModal.printManual()">🖨️ Print</button>
                        <button class="manual-btn" onclick="window.manualModal.openInNewWindow()">🔗 Open in Window</button>
                    </div>
                </div>
                
                <aside class="manual-sidebar" id="manualSidebar">
                    <h3>Table of Contents</h3>
                    <ul class="manual-toc" id="manualTableOfContents">
                        <li><div class="manual-loading">Loading...</div></li>
                    </ul>
                </aside>
                
                <main class="manual-content" id="manualContent">
                    <div class="manual-loading">Loading manual...</div>
                </main>
            </div>
        `;
    }

    private setupManualEvents(): void {
        // Setup search functionality
        setTimeout(() => {
            const searchInput = document.getElementById('manualSearchInput') as HTMLInputElement;
            if (searchInput) {
                let searchTimeout: NodeJS.Timeout;
                searchInput.addEventListener('input', (e) => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => {
                        this.performSearch((e.target as HTMLInputElement).value);
                    }, 300);
                });
            }
            
            // Setup keyboard shortcuts
            document.addEventListener('keydown', this.handleKeyDown.bind(this));
        }, 100);
    }

    private async loadManual(): Promise<void> {
        try {
            const response = await fetch('./public/Expert-User-Manual.md');
            if (!response.ok) {
                throw new Error(`Failed to load manual: ${response.status}`);
            }
            
            const markdown = await response.text();
            this.manualContent = markdown;
            
            // Convert markdown to HTML using simple parser
            let html = this.parseMarkdown(markdown);
            
            // Add app feature links where appropriate
            html = this.addAppFeatureLinks(html);
            
            // Display content
            const contentElement = document.getElementById('manualContent');
            if (contentElement) {
                contentElement.innerHTML = html;
            }
            
            // Generate table of contents
            this.generateTableOfContents();
            
            console.log('Manual loaded successfully in modal');
        } catch (error) {
            console.error('Error loading manual:', error);
            const contentElement = document.getElementById('manualContent');
            if (contentElement) {
                contentElement.innerHTML = 
                    `<div class="manual-error">Failed to load manual: ${(error as Error).message}</div>`;
            }
        }
    }

    private parseMarkdown(markdown: string): string {
        let html = markdown;
        
        // Headers
        html = html.replace(/^# (.+)$/gm, '<h1 id="manual-section-$1">$1</h1>');
        html = html.replace(/^## (.+)$/gm, '<h2 id="manual-section-$1">$1</h2>');
        html = html.replace(/^### (.+)$/gm, '<h3 id="manual-section-$1">$1</h3>');
        html = html.replace(/^#### (.+)$/gm, '<h4 id="manual-section-$1">$1</h4>');
        
        // Bold and italic
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Code blocks
        html = html.replace(/```[\s\S]*?```/g, (match) => {
            const code = match.slice(3, -3).trim();
            return `<pre><code>${this.escapeHtml(code)}</code></pre>`;
        });
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        // Lists
        html = html.replace(/^[-*+] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Numbered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, (match) => {
            if (match.includes('<ul>')) return match;
            return `<ol>${match}</ol>`;
        });
        
        // Paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = `<p>${html}</p>`;
        
        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p>(<h[1-6])/g, '$1');
        html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
        html = html.replace(/<p>(<ul>|<ol>|<pre>)/g, '$1');
        html = html.replace(/(<\/ul>|<\/ol>|<\/pre>)<\/p>/g, '$1');
        
        return html;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private addAppFeatureLinks(html: string): string {
        // Add interactive links for app features mentioned in the manual
        const featureMap: Record<string, () => void> = {
            'Settings Modal': () => this.openAppFeature('settings'),
            'New Project': () => this.openAppFeature('newProject'),
            'Import Project': () => this.openAppFeature('importProject'),
            'Manage Templates': () => this.openAppFeature('manageTemplates'),
            'Comprehensive Export': () => this.openAppFeature('comprehensiveExport'),
        };

        let processedHtml = html;
        
        for (const featureName of Object.keys(featureMap)) {
            const regex = new RegExp(`\\b${featureName}\\b`, 'g');
            processedHtml = processedHtml.replace(regex, 
                `<a href="#" class="app-feature-link" onclick="window.manualModal.openAppFeature('${featureName.toLowerCase().replace(/\s+/g, '')}'); return false;">
                    ${featureName} <span style="font-size: 0.8em;">↗</span>
                </a>`
            );
        }
        
        return processedHtml;
    }

    public async openAppFeature(feature: string): Promise<void> {
        try {
            switch (feature) {
                case 'settings':
                case 'settingsmodal':
                    const { openSettingsModal } = await import('./ModalFactory');
                    openSettingsModal();
                    this.close();
                    break;
                case 'newproject':
                    document.getElementById('newProjectBtn')?.click();
                    this.close();
                    break;
                case 'importproject':
                    document.getElementById('importProjectBtn')?.click();
                    this.close();
                    break;
                case 'managetemplates':
                    document.getElementById('manageTemplatesBtn')?.click();
                    this.close();
                    break;
                case 'comprehensiveexport':
                    document.getElementById('comprehensiveExportBtn')?.click();
                    this.close();
                    break;
                default:
                    console.log(`Unknown feature: ${feature}`);
            }
        } catch (error) {
            console.error(`Failed to open app feature ${feature}:`, error);
        }
    }

    private generateTableOfContents(): void {
        const headings = document.querySelectorAll('#manualContent h1, #manualContent h2, #manualContent h3');
        const toc = document.getElementById('manualTableOfContents');
        if (!toc) return;
        
        toc.innerHTML = '';

        headings.forEach((heading, index) => {
            const level = heading.tagName.toLowerCase();
            const text = heading.textContent;
            const id = heading.id || `manual-heading-${index}`;
            
            if (!heading.id) {
                heading.id = id;
            }

            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#${id}`;
            a.textContent = text || '';
            a.className = `toc-${level}`;
            a.onclick = (e) => {
                e.preventDefault();
                const targetElement = document.getElementById(id);
                if (targetElement) {
                    targetElement.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                    this.updateActiveSection(id);
                }
            };
            
            li.appendChild(a);
            toc.appendChild(li);
        });
    }

    private updateActiveSection(activeId: string): void {
        document.querySelectorAll('.manual-toc a').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`.manual-toc a[href="#${activeId}"]`)?.classList.add('active');
    }

    private performSearch(query: string): void {
        this.searchQuery = query.toLowerCase();
        const content = document.getElementById('manualContent');
        if (!content) return;
        
        if (!query) {
            // Clear highlights - reload content
            this.loadManual();
            return;
        }

        // Parse markdown and highlight search terms
        let html = this.parseMarkdown(this.manualContent);
        html = this.addAppFeatureLinks(html);
        
        // Simple text highlighting
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        html = html.replace(regex, '<span class="manual-search-highlight">$1</span>');
        
        content.innerHTML = html;
        this.generateTableOfContents();

        // Scroll to first match
        const firstMatch = content.querySelector('.manual-search-highlight');
        if (firstMatch) {
            firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (!this.isOpen()) return;
        
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'f':
                    e.preventDefault();
                    const searchInput = document.getElementById('manualSearchInput') as HTMLInputElement;
                    if (searchInput) {
                        searchInput.focus();
                    }
                    break;
                case 'p':
                    e.preventDefault();
                    this.printManual();
                    break;
            }
        }
        
        if (e.key === 'Escape' && e.target !== document.querySelector('.manual-search-input')) {
            // Only close on escape if not typing in search
            this.close();
        }
    }

    public toggleSidebar(): void {
        const sidebar = document.getElementById('manualSidebar');
        if (sidebar) {
            sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
        }
    }

    public printManual(): void {
        const content = document.getElementById('manualContent');
        if (content) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>Expert System - User Manual</title>
                            <style>
                                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; margin: 40px; }
                                h1, h2, h3, h4 { color: #1e293b; }
                                h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; }
                                h2 { border-left: 4px solid #3b82f6; padding-left: 1rem; }
                                code { background: #f8fafc; padding: 2px 4px; border-radius: 4px; }
                                pre { background: #f8fafc; padding: 1rem; border-radius: 6px; }
                                table { border-collapse: collapse; width: 100%; }
                                th, td { border: 1px solid #e2e8f0; padding: 8px 12px; }
                                th { background: #f8fafc; }
                                .manual-search-highlight { background: none; }
                                .app-feature-link { color: #3b82f6; text-decoration: underline; }
                            </style>
                        </head>
                        <body>${content.innerHTML}</body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.print();
            }
        }
    }

    public openInNewWindow(): void {
        window.open('./public/manual.html', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    }

    protected override cleanup(): void {
        super.cleanup();
        // Remove global reference
        if ((window as any).manualModal === this) {
            delete (window as any).manualModal;
        }
        
        // Remove keyboard listener
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    public static async open(): Promise<ManualModal> {
        const modal = new ManualModal();
        await modal.open();
        return modal;
    }
} 