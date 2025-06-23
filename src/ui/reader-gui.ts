import { ProjectManager } from '../ProjectManager';
import { DocumentNode } from '../DocumentNode';
import { getElementById } from './dom-elements';
import { StorageService } from '../StorageService';

// Storage key for reader configuration
const READER_CONFIG_KEY = 'expert_app_reader_config';

// Content node interface for reader display
interface ContentNode {
    id: string;
    title: string;
    content: string;
    level: number;
    isLeaf: boolean;
    hasContent: boolean;
    position: number;
    wordCount: number;
    estimatedReadingTime: number;
}

// Click mapping for navigation
interface ClickMapping {
    nodeId: string;
    element: HTMLElement;
    startOffset: number;
    endOffset: number;
}

// Reader configuration
interface ReaderConfig {
    showTOC: boolean;
    showAllLevels: boolean;
    showMetaInfo: boolean;
    fontSize: number;
    lineHeight: number;
    maxWidth: number;
    theme: 'light' | 'dark' | 'sepia';
    separatorStyle: 'minimal' | 'standard' | 'bold';
}

// Hierarchy color system (6 levels)
const HIERARCHY_COLORS = [
    '#ffffff',  // Level 0: Pure white
    '#fafafa',  // Level 1: Very light gray
    '#f5f5f5',  // Level 2: Light gray
    '#f0f0f0',  // Level 3: Medium light gray
    '#ebebeb',  // Level 4: Slightly darker
    '#e6e6e6'   // Level 5+: Darkest in series
];

// Typography scale configuration
const TYPOGRAPHY_SCALE = [
    { fontSize: '2.5rem', fontWeight: '700', marginTop: '0', marginBottom: '2rem' },      // Level 0
    { fontSize: '2rem', fontWeight: '600', marginTop: '3rem', marginBottom: '1.5rem' },   // Level 1
    { fontSize: '1.75rem', fontWeight: '600', marginTop: '2.5rem', marginBottom: '1.25rem' }, // Level 2
    { fontSize: '1.5rem', fontWeight: '500', marginTop: '2rem', marginBottom: '1rem' },   // Level 3
    { fontSize: '1.25rem', fontWeight: '500', marginTop: '1.5rem', marginBottom: '0.75rem' }, // Level 4
    { fontSize: '1.1rem', fontWeight: '400', marginTop: '1rem', marginBottom: '0.5rem' }  // Level 5+
];

/**
 * Main Reader GUI class - provides a clean reading interface for hierarchical content
 */
export class ReaderGUI {
    private projectManager: ProjectManager;
    private container: HTMLElement;
    private contentNodes: ContentNode[] = [];
    private clickMappings: ClickMapping[] = [];
    private config: ReaderConfig;
    private onNavigateToNode?: (nodeId: string) => void;
    private isListeningForUpdates: boolean = false;
    private lastScrollPosition: number = 0;
    private lastFocusedNodeId: string | null = null;
    private isSettingsPanelOpen: boolean = false;
    
    // Bound method references for proper event listener removal
    private boundHandleClick: (event: MouseEvent) => void;
    private boundHandleDoubleClick: (event: MouseEvent) => void;

    constructor(projectManager: ProjectManager, container: HTMLElement, onNavigateToNode?: (nodeId: string) => void) {
        this.projectManager = projectManager;
        this.container = container;
        this.onNavigateToNode = onNavigateToNode;
        
        // Bind event handler methods
        this.boundHandleClick = this.handleClick.bind(this);
        this.boundHandleDoubleClick = this.handleDoubleClick.bind(this);
        
        // Default configuration
        this.config = {
            showTOC: true,
            showAllLevels: false,
            showMetaInfo: false,
            fontSize: 16,
            lineHeight: 1.6,
            maxWidth: 800,
            theme: 'light',
            separatorStyle: 'standard'
        };

        this.setupEventListeners();
        this.loadReaderConfig();
    }

    /**
     * Render the complete reader interface
     */
    public render(): void {
        this.contentNodes = this.analyzeProjectContent();
        this.container.innerHTML = this.generateReaderHTML();
        this.applyStyles();
        this.buildClickMappings();
        this.setupAllEventListeners();
    }

    /**
     * Setup all event listeners in one centralized place
     */
    private setupAllEventListeners(): void {
        // Setup main event listeners (these are always needed)
        this.setupEventListeners();
        
        // Setup settings panel event listeners if panel is open
        if (this.isSettingsPanelOpen) {
            this.restoreSettingsPanel();
        }
    }

    /**
     * Restore settings panel to open state and setup its event listeners
     */
    private restoreSettingsPanel(): void {
        const panel = this.container.querySelector('#reader-settings-panel') as HTMLElement;
        if (panel) {
            panel.style.display = 'block';
            this.setupSettingsEventListeners();
        }
    }

    /**
     * Refresh the reader content
     */
    public refresh(): void {
        this.render();
    }

    /**
     * Load reader configuration from storage
     */
    private async loadReaderConfig(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            const savedConfig = await storage.get<ReaderConfig>(READER_CONFIG_KEY);
            
            if (savedConfig) {
                // Merge saved config with defaults to handle any missing properties
                this.config = {
                    ...this.config,
                    ...savedConfig
                };
            }
        } catch (error) {
            console.warn('Failed to load reader configuration:', error);
            // Continue with default config if loading fails
        }
    }

    /**
     * Save reader configuration to storage
     */
    private async saveReaderConfig(): Promise<void> {
        try {
            const storage = await StorageService.getInstance();
            await storage.set(READER_CONFIG_KEY, this.config);
        } catch (error) {
            console.warn('Failed to save reader configuration:', error);
            // Continue without saving if storage fails
        }
    }

    /**
     * Scroll to a specific node in the reader
     */
    public scrollToNode(nodeId: string): void {
        const element = this.container.querySelector(`#node-${nodeId}`) as HTMLElement;
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Add a brief highlight effect to show which section was navigated to
            element.style.transition = 'box-shadow 0.3s ease';
            element.style.boxShadow = '0 0 20px rgba(66, 153, 225, 0.6)';
            setTimeout(() => {
                element.style.boxShadow = '';
            }, 1500);
        }
    }

    /**
     * Analyze project content and determine what to display
     */
    private analyzeProjectContent(): ContentNode[] {
        const nodes: ContentNode[] = [];
        let position = 0;

        const processNode = (node: DocumentNode): void => {
            // Determine if this node should be displayed
            const shouldDisplay = this.shouldDisplayNode(node);
            
            if (shouldDisplay) {
                const wordCount = this.calculateWordCount(node.content);
                const readingTime = Math.ceil(wordCount / 200); // Assume 200 WPM reading speed

                nodes.push({
                    id: node.id,
                    title: node.title,
                    content: node.content,
                    level: node.level,
                    isLeaf: node.children.length === 0,
                    hasContent: !!(node.content && node.content.trim()),
                    position: position++,
                    wordCount,
                    estimatedReadingTime: readingTime
                });
            }

            // Process children if this node shouldn't be displayed or if we want to go deeper
            if (!shouldDisplay || this.shouldProcessChildren(node)) {
                node.children.forEach(child => processNode(child));
            }
        };

        processNode(this.projectManager.rootNode);
        return nodes;
    }

    /**
     * Determine if a node should be displayed in the reader
     */
    private shouldDisplayNode(node: DocumentNode): boolean {
        if (this.config.showAllLevels) {
            // Show all levels mode: show nodes with content or leaf nodes without content
            if (node.content && node.content.trim()) {
                return true;
            }
            // For nodes without content, show if they have no children (leaf nodes)
            return node.children.length === 0;
        } else {
            // Deepest content mode: only show if this is the deepest available content
            return this.isDeepestAvailableContent(node);
        }
    }

    /**
     * Determine if we should process children of a node
     */
    private shouldProcessChildren(node: DocumentNode): boolean {
        if (this.config.showAllLevels) {
            // Show all levels: always process children to show complete hierarchy
            return node.children.length > 0;
        } else {
            // Deepest content mode: only process children if current node doesn't have content
            // or if children might have deeper content
            return node.children.length > 0 && (!node.content || !node.content.trim() || this.hasDeepContentInChildren(node));
        }
    }

    /**
     * Check if this node represents the deepest available content in its branch
     */
    private isDeepestAvailableContent(node: DocumentNode): boolean {
        // If node has content and no children with content, it's the deepest
        if (node.content && node.content.trim()) {
            const hasChildrenWithContent = node.children.some(child => this.hasAnyContentInSubtree(child));
            return !hasChildrenWithContent;
        }
        
        // If node has no content but no children, it's a leaf (show as placeholder)
        return node.children.length === 0;
    }

    /**
     * Check if node or any of its descendants have content
     */
    private hasAnyContentInSubtree(node: DocumentNode): boolean {
        if (node.content && node.content.trim()) {
            return true;
        }
        return node.children.some(child => this.hasAnyContentInSubtree(child));
    }

    /**
     * Check if any children have deeper content that should be shown instead
     */
    private hasDeepContentInChildren(node: DocumentNode): boolean {
        return node.children.some(child => this.hasAnyContentInSubtree(child));
    }

    /**
     * Calculate word count for content
     */
    private calculateWordCount(content: string): number {
        if (!content || !content.trim()) return 0;
        return content.trim().split(/\s+/).length;
    }

    /**
     * Get the full path to a node for display
     */
    private getNodePath(nodeId: string): string {
        return this.projectManager.getNodePath(nodeId);
    }

    /**
     * Generate the complete HTML for the reader
     */
    private generateReaderHTML(): string {
        if (this.contentNodes.length === 0) {
            return `
                <div class="reader-container">
                    <div class="reader-header">
                        <h1>Reader View</h1>
                        <button id="close-reader-btn" class="close-btn">&times;</button>
                    </div>
                    <div class="reader-content">
                        <div class="no-content">
                            <h2>No Content Available</h2>
                            <p>This project doesn't have any readable content yet. Add some content to nodes and try again.</p>
                        </div>
                    </div>
                </div>
            `;
        }

        let html = `
            <div class="reader-container">
                <div class="reader-header">
                    <h1>${this.projectManager.projectTitle} - Reader View</h1>
                    <div class="reader-controls">
                        <button id="reader-toc-btn" class="control-btn">📋 TOC</button>
                        <button id="reader-settings-btn" class="control-btn">⚙️ Settings</button>
                        <button id="close-reader-btn" class="close-btn">&times;</button>
                    </div>
                </div>
                <div class="reader-body">
                    ${this.config.showTOC ? this.generateTOC() : ''}
                    <div class="reader-content-area">
                        ${this.generateContent()}
                    </div>
                    ${this.generateSettingsPanel()}
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Generate table of contents
     */
    private generateTOC(): string {
        return `
            <div class="reader-toc">
                ${this.generateTOCContent()}
            </div>
        `;
    }

    /**
     * Generate table of contents content (without wrapper div)
     */
    private generateTOCContent(): string {
        let tocHTML = `
            <h3>Table of Contents</h3>
            <ul class="toc-list">
        `;

        this.contentNodes.forEach(node => {
            const indent = node.level * 20;
            tocHTML += `
                <li class="toc-item" style="margin-left: ${indent}px;">
                    <a href="#node-${node.id}" class="toc-link" data-node-id="${node.id}">
                        ${node.title}
                    </a>
                    <span class="toc-info">${node.wordCount} words</span>
                </li>
            `;
        });

        tocHTML += `
            </ul>
        `;

        return tocHTML;
    }

    /**
     * Generate the main content area
     */
    private generateContent(): string {
        let contentHTML = `<div class="reader-content ${this.config.showMetaInfo ? 'reader-content-with-meta' : 'reader-content-minimal'}">`;
        let lastLevel = -1;

        this.contentNodes.forEach((node, index) => {
            // Add separator if needed (only in meta info mode)
            if (index > 0 && this.config.showMetaInfo) {
                contentHTML += this.generateSeparator(lastLevel, node.level);
            }

            // Add the node content
            contentHTML += this.generateNodeHTML(node);
            lastLevel = node.level;
        });

        contentHTML += '</div>';
        return contentHTML;
    }

    /**
     * Generate HTML for a single content node
     */
    private generateNodeHTML(node: ContentNode): string {
        const levelClass = Math.min(node.level, 5); // Cap at level 5
        const backgroundColor = HIERARCHY_COLORS[levelClass];
        
        if (this.config.showMetaInfo) {
            // Full meta info mode - show everything with node path
            const typography = TYPOGRAPHY_SCALE[levelClass];
            const nodePath = this.getNodePath(node.id);

            let html = `
                <div class="reader-node reader-node-with-meta" id="node-${node.id}" data-node-id="${node.id}" data-level="${node.level}" style="background-color: ${backgroundColor};">
                    <div class="node-header">
                        <div class="node-title-row">
                            <h${Math.min(node.level + 1, 6)} class="node-title" style="
                                font-size: ${typography.fontSize};
                                font-weight: ${typography.fontWeight};
                                margin-top: ${typography.marginTop};
                                margin-bottom: ${typography.marginBottom};
                            ">
                                ${node.title}
                            </h${Math.min(node.level + 1, 6)}>
                            <div class="node-path">${nodePath}</div>
                        </div>
                        <div class="node-meta">
                            <span class="word-count">${node.wordCount} words</span>
                            <span class="reading-time">${node.estimatedReadingTime} min read</span>
                            <span class="level-indicator">Level ${node.level}</span>
                        </div>
                    </div>
            `;

            if (node.hasContent) {
                html += `
                    <div class="node-content" data-node-id="${node.id}">
                        ${this.formatContent(node.content)}
                    </div>
                `;
            }

            html += '</div>';
            return html;
        } else {
            // Minimal mode - small title, no meta info, continuous reading
            let html = `
                <div class="reader-node reader-node-minimal" id="node-${node.id}" data-node-id="${node.id}" data-level="${node.level}">
                    <div class="node-minimal-title">${node.title}</div>
            `;

            if (node.hasContent) {
                html += `
                    <div class="node-content node-content-minimal" data-node-id="${node.id}">
                        ${this.formatContent(node.content)}
                    </div>
                `;
            }

            html += '</div>';
            return html;
        }
    }

    /**
     * Format content for display (convert line breaks, etc.)
     */
    private formatContent(content: string): string {
        if (!content) return '';
        
        // Simple formatting: convert line breaks to paragraphs
        return content
            .split('\n\n')
            .map(paragraph => paragraph.trim())
            .filter(paragraph => paragraph.length > 0)
            .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
            .join('');
    }

    /**
     * Generate separator between content sections
     */
    private generateSeparator(fromLevel: number, toLevel: number): string {
        let separatorClass = 'section';
        
        if (Math.abs(fromLevel - toLevel) > 1) {
            separatorClass = 'major';
        } else if (fromLevel !== toLevel) {
            separatorClass = 'minor';
        }

        return `<div class="reader-separator ${separatorClass}" data-from-level="${fromLevel}" data-to-level="${toLevel}"></div>`;
    }

    /**
     * Apply CSS styles to the reader
     */
    private applyStyles(): void {
        // Check if styles are already injected
        if (document.getElementById('reader-styles')) return;

        const styleElement = document.createElement('style');
        styleElement.id = 'reader-styles';
        styleElement.textContent = this.generateCSS();
        document.head.appendChild(styleElement);
    }

    /**
     * Generate CSS for the reader interface
     */
    private generateCSS(): string {
        return `
            .reader-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: white;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                font-family: Georgia, 'Times New Roman', serif;
            }

            .reader-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem 2rem;
                border-bottom: 1px solid #e5e7eb;
                background: #fafafa;
                flex-shrink: 0;
            }

            .reader-header h1 {
                margin: 0;
                font-size: 1.5rem;
                color: #374151;
            }

            .reader-controls {
                display: flex;
                gap: 1rem;
                align-items: center;
            }

            .control-btn {
                padding: 0.5rem 1rem;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                background: white;
                cursor: pointer;
                font-size: 0.9rem;
            }

            .control-btn:hover {
                background: #f3f4f6;
            }

            .close-btn {
                width: 32px;
                height: 32px;
                border: none;
                border-radius: 50%;
                background: #ef4444;
                color: white;
                cursor: pointer;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .close-btn:hover {
                background: #dc2626;
            }

            .reader-body {
                display: flex;
                flex: 1;
                overflow: hidden;
            }

            .reader-toc {
                width: 300px;
                border-right: 1px solid #e5e7eb;
                background: #f9fafb;
                padding: 1.5rem;
                overflow-y: auto;
                flex-shrink: 0;
            }

            .reader-toc h3 {
                margin: 0 0 1rem 0;
                font-size: 1.1rem;
                color: #374151;
            }

            .toc-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }

            .toc-item {
                margin-bottom: 0.5rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .toc-link {
                color: #4338ca;
                text-decoration: none;
                font-size: 0.9rem;
                flex: 1;
            }

            .toc-link:hover {
                text-decoration: underline;
            }

            .toc-info {
                font-size: 0.75rem;
                color: #6b7280;
                margin-left: 0.5rem;
            }

            .reader-content-area {
                flex: 1;
                overflow-y: auto;
                padding: 0;
            }

            .reader-content {
                max-width: ${this.config.maxWidth}px;
                margin: 0 auto;
                padding: 2rem;
                line-height: ${this.config.lineHeight};
                font-size: ${this.config.fontSize}px;
            }

            .reader-node {
                margin-bottom: 2rem;
                padding: 2rem;
                border-radius: 8px;
                transition: background-color 0.2s ease;
                cursor: text;
            }

            .reader-node:hover {
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            .node-header {
                margin-bottom: 1.5rem;
            }

            .node-title {
                color: #1f2937;
                line-height: 1.2;
            }

            .node-meta {
                display: flex;
                gap: 1rem;
                margin-top: 0.5rem;
                font-size: 0.8rem;
                color: #6b7280;
            }

            .node-content {
                color: #374151;
                line-height: inherit;
            }

            .node-content p {
                margin-bottom: 1rem;
                text-align: justify;
            }

            .node-content p:last-child {
                margin-bottom: 0;
            }

            .reader-separator.major {
                border-top: 3px solid #d1d5db;
                margin: 4rem 0;
                position: relative;
            }

            .reader-separator.minor {
                border-top: 1px solid #e5e7eb;
                margin: 2rem 0;
            }

            .reader-separator.section {
                margin: 1.5rem 0;
                height: 1px;
                background: transparent;
            }

            .no-content {
                text-align: center;
                padding: 4rem 2rem;
                color: #6b7280;
            }

            .no-content h2 {
                color: #374151;
                margin-bottom: 1rem;
            }

            /* Responsive design */
            @media (max-width: 768px) {
                .reader-toc {
                    display: none;
                }
                
                .reader-header {
                    padding: 1rem;
                }
                
                .reader-header h1 {
                    font-size: 1.2rem;
                }
                
                .reader-content {
                    padding: 1rem;
                    max-width: 100%;
                }
                
                .reader-controls {
                    gap: 0.5rem;
                }
                
                .control-btn {
                    padding: 0.4rem 0.8rem;
                    font-size: 0.8rem;
                }
            }

            /* Settings Panel */
            .reader-settings-panel {
                position: fixed;
                top: 0;
                right: 0;
                width: 350px;
                height: 100vh;
                background: white;
                border-left: 1px solid #e5e7eb;
                box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
                z-index: 10001;
                overflow-y: auto;
            }

            .settings-panel-content {
                padding: 2rem;
            }

            .settings-panel-content h3 {
                margin: 0 0 1.5rem 0;
                color: #374151;
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 0.5rem;
            }

            .settings-group {
                margin-bottom: 1.5rem;
            }

            .settings-group label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 500;
                color: #4b5563;
            }

            .settings-group input[type="range"] {
                width: 100%;
                margin-bottom: 0.5rem;
            }

            .settings-group select {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                background: white;
            }

            .setting-value {
                font-size: 0.9rem;
                color: #6b7280;
                font-weight: 500;
            }

            .settings-buttons {
                display: flex;
                gap: 1rem;
                margin-top: 2rem;
                padding-top: 1rem;
                border-top: 1px solid #e5e7eb;
            }

            .settings-buttons button {
                flex: 1;
                padding: 0.75rem;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                background: white;
                cursor: pointer;
                font-size: 0.9rem;
            }

            .settings-buttons button:hover {
                background: #f3f4f6;
            }

            #reader-settings-reset {
                background: #ef4444 !important;
                color: white !important;
                border-color: #ef4444 !important;
            }

            #reader-settings-reset:hover {
                background: #dc2626 !important;
            }

            /* Theme styles */
            .reader-theme-dark {
                background: #1f2937;
                color: #f9fafb;
            }

            .reader-theme-dark .reader-header {
                background: #111827;
                border-color: #374151;
                color: #f9fafb;
            }

            .reader-theme-dark .reader-header h1 {
                color: #f9fafb;
            }

            .reader-theme-dark .reader-toc {
                background: #111827;
                border-color: #374151;
                color: #f9fafb;
            }

            .reader-theme-dark .reader-toc h3 {
                color: #f9fafb;
            }

            .reader-theme-dark .toc-link {
                color: #60a5fa;
            }

            .reader-theme-dark .toc-link:hover {
                color: #93c5fd;
            }

            .reader-theme-dark .toc-info {
                color: #9ca3af;
            }

            .reader-theme-dark .reader-node {
                background: #374151 !important;
                color: #f9fafb;
            }

            .reader-theme-dark .node-title {
                color: #f9fafb !important;
            }

            .reader-theme-dark .node-meta {
                color: #9ca3af !important;
            }

            .reader-theme-dark .node-content {
                color: #e5e7eb !important;
            }

            .reader-theme-dark .reader-separator.major {
                border-color: #4b5563;
            }

            .reader-theme-dark .reader-separator.minor {
                border-color: #374151;
            }

            .reader-theme-dark .no-content {
                color: #9ca3af;
            }

            .reader-theme-dark .no-content h2 {
                color: #f9fafb;
            }

            .reader-theme-sepia {
                background: #f7f3e9;
                color: #5c4b37;
            }

            .reader-theme-sepia .reader-header {
                background: #f0e6d2;
                border-color: #d6c7a1;
            }

            .reader-theme-sepia .reader-toc {
                background: #f0e6d2;
                border-color: #d6c7a1;
            }

            .reader-theme-sepia .reader-node {
                background: #faf6ec !important;
                color: #5c4b37;
            }

            /* Dark theme settings panel */
            .reader-theme-dark .reader-settings-panel {
                background: #1f2937;
                border-color: #374151;
                color: #f9fafb;
            }

            .reader-theme-dark .settings-panel-content h3 {
                color: #f9fafb;
                border-color: #374151;
            }

            .reader-theme-dark .settings-group label {
                color: #e5e7eb;
            }

            .reader-theme-dark .settings-group select {
                background: #374151;
                border-color: #4b5563;
                color: #f9fafb;
            }

            .reader-theme-dark .setting-value {
                color: #9ca3af;
            }

            .reader-theme-dark .settings-buttons {
                border-color: #374151;
            }

            .reader-theme-dark .settings-buttons button {
                background: #374151;
                border-color: #4b5563;
                color: #f9fafb;
            }

            .reader-theme-dark .settings-buttons button:hover {
                background: #4b5563;
            }

            /* Minimal mode styles */
            .reader-content-minimal {
                padding: 1rem 2rem;
            }

            .reader-node-minimal {
                margin-bottom: 1.5rem;
                padding: 0;
                background: transparent !important;
                border-radius: 0;
                transition: none;
            }

            .reader-node-minimal:last-child {
                margin-bottom: 0;
            }

            .reader-node-minimal:hover {
                box-shadow: none;
            }

            .node-minimal-title {
                font-size: 0.7rem;
                color: #6b7280;
                margin-bottom: 0;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .node-content-minimal {
                color: #374151;
                line-height: inherit;
                margin-bottom: 0;
            }



            .node-content-minimal p {
                margin-top: 0;
                margin-bottom: 1rem;
                text-align: justify;
            }

            .node-content-minimal p:first-child {
                margin-top: 0;
            }

            .node-content-minimal p:last-child {
                margin-bottom: 0;
            }

            /* Full meta mode styles */
            .reader-content-with-meta {
                padding: 2rem;
            }

            .reader-node-with-meta {
                margin-bottom: 2rem;
                padding: 2rem;
            }

            .node-title-row {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 0.5rem;
            }

            .node-path {
                font-size: 0.75rem;
                color: #6b7280;
                font-weight: normal;
                margin-left: 1rem;
                flex-shrink: 0;
                font-style: italic;
            }

            /* Print styles */
            @media print {
                .reader-header,
                .reader-toc,
                .reader-settings-panel {
                    display: none !important;
                }
                
                .reader-container {
                    position: static;
                    width: auto;
                    height: auto;
                }
                
                .reader-body {
                    display: block;
                }
                
                .reader-content-area {
                    overflow: visible;
                }
                
                .reader-node {
                    page-break-inside: avoid;
                    margin-bottom: 1rem;
                    padding: 1rem;
                }
                
                .reader-separator.major {
                    page-break-after: always;
                }

                .node-minimal-title {
                    font-size: 0.6rem;
                }

                .reader-content-minimal {
                    padding: 0.5rem;
                }
            }
        `;
    }

    /**
     * Set up event listeners for the reader interface
     */
    private setupEventListeners(): void {
        // Remove existing event listeners to prevent duplicates
        this.container.removeEventListener('dblclick', this.boundHandleDoubleClick);
        this.container.removeEventListener('click', this.boundHandleClick);
        
        // Add fresh event listeners using bound methods for proper removal
        this.container.addEventListener('dblclick', this.boundHandleDoubleClick);
        this.container.addEventListener('click', this.boundHandleClick);
    }

    /**
     * Handle double-click events for navigation
     */
    private handleDoubleClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        const nodeElement = target.closest('[data-node-id]') as HTMLElement;
        
        if (nodeElement && this.onNavigateToNode) {
            const nodeId = nodeElement.dataset.nodeId;
            if (nodeId) {
                this.onNavigateToNode(nodeId);
            }
        }
    }

    /**
     * Handle click events (for TOC and controls)
     */
    private handleClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        
        if (target.id === 'close-reader-btn') {
            this.close();
        } else if (target.id === 'reader-toc-btn') {
            this.toggleTOC();
        } else if (target.id === 'reader-settings-btn') {
            this.toggleSettings();
        } else if (target.classList.contains('toc-link')) {
            event.preventDefault();
            const nodeId = target.dataset.nodeId;
            if (nodeId) {
                this.scrollToNode(nodeId);
            }
        } else if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('#node-')) {
            // Handle TOC anchor links
            event.preventDefault();
            const nodeId = target.getAttribute('href')?.substring('#node-'.length);
            if (nodeId) {
                this.scrollToNode(nodeId);
            }
        } else if (target.id === 'reader-settings-close') {
            this.toggleSettings();
        } else if (target.id === 'reader-settings-reset') {
            this.resetSettings();
        }
    }

    /**
     * Setup event listeners for the settings panel
     */
    private setupSettingsEventListeners(): void {
        const panel = this.container.querySelector('#reader-settings-panel');
        if (!panel) return;

        // Font size slider
        const fontSizeSlider = panel.querySelector('#reader-font-size') as HTMLInputElement;
        if (fontSizeSlider) {
            fontSizeSlider.addEventListener('input', (e) => {
                const value = parseInt((e.target as HTMLInputElement).value);
                this.config.fontSize = value;
                this.updateFontSizeDisplay(value);
                this.applySettings();
            });
        }

        // Line height slider
        const lineHeightSlider = panel.querySelector('#reader-line-height') as HTMLInputElement;
        if (lineHeightSlider) {
            lineHeightSlider.addEventListener('input', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value);
                this.config.lineHeight = value;
                this.updateLineHeightDisplay(value);
                this.applySettings();
            });
        }

        // Max width slider
        const maxWidthSlider = panel.querySelector('#reader-max-width') as HTMLInputElement;
        if (maxWidthSlider) {
            maxWidthSlider.addEventListener('input', (e) => {
                const value = parseInt((e.target as HTMLInputElement).value);
                this.config.maxWidth = value;
                this.updateMaxWidthDisplay(value);
                this.applySettings();
            });
        }

        // Theme selector
        const themeSelect = panel.querySelector('#reader-theme') as HTMLSelectElement;
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                this.config.theme = (e.target as HTMLSelectElement).value as 'light' | 'dark' | 'sepia';
                this.applySettings();
            });
        }

        // Separator style selector
        const separatorSelect = panel.querySelector('#reader-separator-style') as HTMLSelectElement;
        if (separatorSelect) {
            separatorSelect.addEventListener('change', (e) => {
                this.config.separatorStyle = (e.target as HTMLSelectElement).value as 'minimal' | 'standard' | 'bold';
                this.applySettings();
            });
        }

        // Show all levels checkbox
        const showAllLevelsCheckbox = panel.querySelector('#reader-show-all-levels') as HTMLInputElement;
        if (showAllLevelsCheckbox) {
            showAllLevelsCheckbox.addEventListener('change', (e) => {
                this.config.showAllLevels = (e.target as HTMLInputElement).checked;
                this.render(); // Re-render content with new display logic
                this.saveReaderConfig();
            });
        }

        // Show meta info checkbox
        const showMetaInfoCheckbox = panel.querySelector('#reader-show-meta-info') as HTMLInputElement;
        if (showMetaInfoCheckbox) {
            showMetaInfoCheckbox.addEventListener('change', (e) => {
                this.config.showMetaInfo = (e.target as HTMLInputElement).checked;
                this.render(); // Re-render content with new display logic
                this.saveReaderConfig();
            });
        }
    }

    /**
     * Update font size display
     */
    private updateFontSizeDisplay(value: number): void {
        const display = this.container.querySelector('#reader-font-size + .setting-value');
        if (display) {
            display.textContent = `${value}px`;
        }
    }

    /**
     * Update line height display
     */
    private updateLineHeightDisplay(value: number): void {
        const display = this.container.querySelector('#reader-line-height + .setting-value');
        if (display) {
            display.textContent = value.toString();
        }
    }

    /**
     * Update max width display
     */
    private updateMaxWidthDisplay(value: number): void {
        const display = this.container.querySelector('#reader-max-width + .setting-value');
        if (display) {
            display.textContent = `${value}px`;
        }
    }

    /**
     * Apply current settings to the reader interface
     */
    private applySettings(): void {
        const content = this.container.querySelector('.reader-content') as HTMLElement;
        if (content) {
            content.style.fontSize = `${this.config.fontSize}px`;
            content.style.lineHeight = this.config.lineHeight.toString();
            content.style.maxWidth = `${this.config.maxWidth}px`;
        }

        // Apply theme
        this.container.className = `reader-container reader-theme-${this.config.theme}`;
        
        // Save configuration to storage
        this.saveReaderConfig();
    }

    /**
     * Reset settings to defaults
     */
    private resetSettings(): void {
        this.config = {
            showTOC: true,
            showAllLevels: false,
            showMetaInfo: false,
            fontSize: 16,
            lineHeight: 1.6,
            maxWidth: 800,
            theme: 'light',
            separatorStyle: 'standard'
        };
        this.render();
    }

    /**
     * Build click mappings for precise navigation
     */
    private buildClickMappings(): void {
        this.clickMappings = [];
        const nodeElements = this.container.querySelectorAll('[data-node-id]');
        
        nodeElements.forEach(element => {
            const nodeId = (element as HTMLElement).dataset.nodeId;
            if (nodeId) {
                this.clickMappings.push({
                    nodeId,
                    element: element as HTMLElement,
                    startOffset: 0, // Will be calculated when needed
                    endOffset: 0    // Will be calculated when needed
                });
            }
        });
    }

    /**
     * Toggle table of contents visibility
     */
    private toggleTOC(): void {
        this.config.showTOC = !this.config.showTOC;
        this.render();
        this.saveReaderConfig();
    }

    /**
     * Generate the settings panel HTML
     */
    private generateSettingsPanel(): string {
        return `
            <div id="reader-settings-panel" class="reader-settings-panel" style="display: none;">
                <div class="settings-panel-content">
                    <h3>Reader Settings</h3>
                    
                    <div class="settings-group">
                        <label for="reader-font-size">Font Size:</label>
                        <input type="range" id="reader-font-size" min="12" max="24" step="1" value="${this.config.fontSize}">
                        <span class="setting-value">${this.config.fontSize}px</span>
                    </div>
                    
                    <div class="settings-group">
                        <label for="reader-line-height">Line Height:</label>
                        <input type="range" id="reader-line-height" min="1.2" max="2.0" step="0.1" value="${this.config.lineHeight}">
                        <span class="setting-value">${this.config.lineHeight}</span>
                    </div>
                    
                    <div class="settings-group">
                        <label for="reader-max-width">Content Width:</label>
                        <input type="range" id="reader-max-width" min="600" max="1200" step="50" value="${this.config.maxWidth}">
                        <span class="setting-value">${this.config.maxWidth}px</span>
                    </div>
                    
                    <div class="settings-group">
                        <label for="reader-theme">Theme:</label>
                        <select id="reader-theme" value="${this.config.theme}">
                            <option value="light" ${this.config.theme === 'light' ? 'selected' : ''}>Light</option>
                            <option value="dark" ${this.config.theme === 'dark' ? 'selected' : ''}>Dark</option>
                            <option value="sepia" ${this.config.theme === 'sepia' ? 'selected' : ''}>Sepia</option>
                        </select>
                    </div>
                    
                    <div class="settings-group">
                        <label for="reader-separator-style">Separator Style:</label>
                        <select id="reader-separator-style" value="${this.config.separatorStyle}">
                            <option value="minimal" ${this.config.separatorStyle === 'minimal' ? 'selected' : ''}>Minimal</option>
                            <option value="standard" ${this.config.separatorStyle === 'standard' ? 'selected' : ''}>Standard</option>
                            <option value="bold" ${this.config.separatorStyle === 'bold' ? 'selected' : ''}>Bold</option>
                        </select>
                    </div>
                    
                    <div class="settings-group">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" id="reader-show-all-levels" ${this.config.showAllLevels ? 'checked' : ''}>
                            Show all hierarchy levels
                        </label>
                        <div style="font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem;">
                            When unchecked, shows only the deepest available content
                        </div>
                    </div>
                    
                    <div class="settings-group">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" id="reader-show-meta-info" ${this.config.showMetaInfo ? 'checked' : ''}>
                            Show meta information
                        </label>
                        <div style="font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem;">
                            When unchecked, shows minimal title and continuous reading layout
                        </div>
                    </div>
                    
                    <div class="settings-buttons">
                        <button id="reader-settings-reset">Reset to Defaults</button>
                        <button id="reader-settings-close">Close</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Toggle settings panel visibility
     */
    private toggleSettings(): void {
        const panel = this.container.querySelector('#reader-settings-panel') as HTMLElement;
        if (panel) {
            const isVisible = panel.style.display !== 'none';
            this.isSettingsPanelOpen = !isVisible;
            panel.style.display = isVisible ? 'none' : 'block';
            
            if (this.isSettingsPanelOpen) {
                // Setup event listeners for the settings panel when opened
                this.setupSettingsEventListeners();
            }
        }
    }

    /**
     * Close the reader interface
     */
    private close(): void {
        // Stop listening for updates
        this.stopListeningForUpdates();
        
        // Reset settings panel state
        this.isSettingsPanelOpen = false;
        
        // Remove styles
        const styleElement = document.getElementById('reader-styles');
        if (styleElement) {
            styleElement.remove();
        }
        
        // Clear container
        this.container.innerHTML = '';
        this.container.style.display = 'none';
    }

    /**
     * Show the reader interface
     */
    public async show(): Promise<void> {
        this.container.style.display = 'block';
        await this.loadReaderConfig();
        this.render();
        this.applySettings();
        this.startListeningForUpdates();
    }

    /**
     * Hide the reader interface
     */
    public hide(): void {
        this.container.style.display = 'none';
        this.stopListeningForUpdates();
    }

    /**
     * Start listening for project updates to refresh reader content
     */
    private startListeningForUpdates(): void {
        if (this.isListeningForUpdates) return;
        
        this.isListeningForUpdates = true;
        
        // Listen for node generation completion
        this.projectManager.on('nodeGenerationComplete', this.handleNodeUpdate.bind(this));
        
        // Listen for summary generation
        this.projectManager.on('nodeSummaryGenerated', this.handleNodeUpdate.bind(this));
        
        // Listen for overall project structure changes
        this.projectManager.on('project-loaded', this.handleProjectUpdate.bind(this));
    }

    /**
     * Stop listening for project updates
     */
    private stopListeningForUpdates(): void {
        if (!this.isListeningForUpdates) return;
        
        this.isListeningForUpdates = false;
        
        // Remove event listeners
        this.projectManager.off('nodeGenerationComplete', this.handleNodeUpdate.bind(this));
        this.projectManager.off('nodeSummaryGenerated', this.handleNodeUpdate.bind(this));
        this.projectManager.off('project-loaded', this.handleProjectUpdate.bind(this));
    }

    /**
     * Handle individual node updates
     */
    private handleNodeUpdate(event: any): void {
        // Preserve current reading position
        this.preserveReadingPosition();
        
        // Update the content
        this.refreshContent();
    }

    /**
     * Handle overall project updates
     */
    private handleProjectUpdate(): void {
        // Preserve current reading position
        this.preserveReadingPosition();
        
        // Update the content
        this.refreshContent();
    }

    /**
     * Preserve the current reading position before updating content
     */
    private preserveReadingPosition(): void {
        const contentArea = this.container.querySelector('.reader-content-area') as HTMLElement;
        if (contentArea) {
            this.lastScrollPosition = contentArea.scrollTop;
            
            // Find the node currently in view
            const nodeElements = contentArea.querySelectorAll('.reader-node');
            const viewportTop = contentArea.scrollTop;
            const viewportHeight = contentArea.clientHeight;
            const viewportCenter = viewportTop + (viewportHeight / 2);
            
            for (let i = 0; i < nodeElements.length; i++) {
                const element = nodeElements[i] as HTMLElement;
                const rect = element.getBoundingClientRect();
                const elementTop = rect.top + viewportTop - contentArea.getBoundingClientRect().top;
                const elementBottom = elementTop + rect.height;
                
                if (elementTop <= viewportCenter && elementBottom >= viewportCenter) {
                    this.lastFocusedNodeId = element.dataset.nodeId || null;
                    break;
                }
            }
        }
    }

    /**
     * Restore the reading position after content update
     */
    private restoreReadingPosition(): void {
        const contentArea = this.container.querySelector('.reader-content-area') as HTMLElement;
        if (!contentArea) return;
        
        // Try to restore position based on the focused node
        if (this.lastFocusedNodeId) {
            const nodeElement = contentArea.querySelector(`#node-${this.lastFocusedNodeId}`) as HTMLElement;
            if (nodeElement) {
                nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }
        
        // Fallback to scroll position
        if (this.lastScrollPosition > 0) {
            contentArea.scrollTop = this.lastScrollPosition;
        }
    }

    /**
     * Refresh content while preserving reading position
     */
    private refreshContent(): void {
        // Re-analyze content
        const newContentNodes = this.analyzeProjectContent();
        
        // Check if content actually changed
        if (this.hasContentChanged(newContentNodes)) {
            this.contentNodes = newContentNodes;
            
            // Show update notification
            this.showUpdateNotification();
            
            // Update TOC if it's visible
            if (this.config.showTOC) {
                const tocElement = this.container.querySelector('.reader-toc');
                if (tocElement) {
                    tocElement.innerHTML = this.generateTOCContent();
                }
            }
            
            // Update content area
            const contentArea = this.container.querySelector('.reader-content-area');
            if (contentArea) {
                contentArea.innerHTML = this.generateContent();
                this.buildClickMappings();
                
                // Restore reading position after a short delay
                setTimeout(() => {
                    this.restoreReadingPosition();
                }, 100);
            }
        }
    }

    /**
     * Check if content has actually changed to avoid unnecessary updates
     */
    private hasContentChanged(newContentNodes: ContentNode[]): boolean {
        if (newContentNodes.length !== this.contentNodes.length) {
            return true;
        }
        
        for (let i = 0; i < newContentNodes.length; i++) {
            const newNode = newContentNodes[i];
            const oldNode = this.contentNodes[i];
            
            if (newNode.id !== oldNode.id || 
                newNode.content !== oldNode.content || 
                newNode.title !== oldNode.title ||
                newNode.hasContent !== oldNode.hasContent) {
                return true;
            }
        }
        
                 return false;
    }

    /**
     * Show a brief notification that content has been updated
     */
    private showUpdateNotification(): void {
        // Remove existing notification if present
        const existingNotification = this.container.querySelector('.reader-update-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'reader-update-notification';
        notification.textContent = 'Content updated';
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-size: 0.9rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10002;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;

        // Add to container
        this.container.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);

        // Remove after 2 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 2000);
    }
}

/**
 * Utility function to create and show a reader for a project
 */
export async function openReaderView(projectManager: ProjectManager, onNavigateToNode?: (nodeId: string) => void): Promise<ReaderGUI> {
    // Create a container for the reader
    let readerContainer = document.getElementById('reader-container') as HTMLElement;
    if (!readerContainer) {
        readerContainer = document.createElement('div');
        readerContainer.id = 'reader-container';
        document.body.appendChild(readerContainer);
    }

    const reader = new ReaderGUI(projectManager, readerContainer, onNavigateToNode);
    await reader.show();
    return reader;
} 