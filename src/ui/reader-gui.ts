import { ProjectManager } from '../ProjectManager';
import { DocumentNode } from '../DocumentNode';
import { ReaderEditor } from './reader-editor';
import { ReaderEditAction } from '../types/ReaderEditingTypes';
import { openGenericModal, closeGenericModal } from './modal-manager';

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
    fontSize: number;
    lineHeight: number;
    maxWidth: number;
    theme: 'light' | 'dark' | 'sepia';
    separatorStyle: 'minimal' | 'standard' | 'bold';
}



/**
 * Main Reader GUI class - provides a clean reading interface for hierarchical content
 */
export class ReaderGUI {
    public projectManager: ProjectManager;
    private container: HTMLElement;
    private contentNodes: ContentNode[] = [];
    private clickMappings: ClickMapping[] = [];
    private config: ReaderConfig;
    private onNavigateToNode?: (nodeId: string) => void;
    private isListeningForUpdates: boolean = false;
    private isSettingsPanelOpen: boolean = false;
    private readerEditor: ReaderEditor;
    private hasBeenRendered: boolean = false; // Track if this instance has been rendered
    
    // Bound method references for proper event listener removal
    private boundHandleClick: (event: MouseEvent) => void;
    private boundHandleDoubleClick: (event: MouseEvent) => void;
    // Bound method references for project manager event listeners
    private boundHandleNodeGenerationComplete: (e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }) => void;
    private boundHandleNodeSummaryGenerated: (e: { nodeId: string, summary: string }) => void;
    private boundHandleProjectUpdate: () => void;

    constructor(projectManager: ProjectManager, container: HTMLElement, onNavigateToNode?: (nodeId: string) => void) {
        this.projectManager = projectManager;
        this.container = container;
        this.onNavigateToNode = onNavigateToNode;
        
        // Bind event handler methods
        this.boundHandleClick = this.handleClick.bind(this);
        this.boundHandleDoubleClick = this.handleDoubleClick.bind(this);
        // Bind project manager event handlers
        this.boundHandleNodeGenerationComplete = this.handleNodeGenerationComplete.bind(this);
        this.boundHandleNodeSummaryGenerated = this.handleNodeSummaryGenerated.bind(this);
        this.boundHandleProjectUpdate = this.handleProjectUpdate.bind(this);
        
        // Initialize reader editor
        this.readerEditor = new ReaderEditor(this, projectManager);
        
        // Default configuration
        this.config = {
            showTOC: true,
            showAllLevels: false,
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
        
        // Initialize the editor after DOM is ready (async)
        this.readerEditor.initialize();
        
        // Mark this instance as having been rendered
        this.hasBeenRendered = true;
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
        
        // Reader editor state is maintained through always-edit mode
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
     * Handle TOC navigation with intelligent targeting
     */
    private handleTOCNavigation(nodeId: string): void {
        // If showAllLevels is true, navigate directly to the clicked node
        if (this.config.showAllLevels) {
            this.scrollToNode(nodeId);
            return;
        }

        // If showAllLevels is false, check if the clicked node is displayed in content
        const isNodeInContent = this.contentNodes.some(node => node.id === nodeId);
        
        if (isNodeInContent) {
            // Node is displayed in content, navigate directly
            this.scrollToNode(nodeId);
        } else {
            // Node is not displayed (parent node), find the first displayable descendant
            const targetNodeId = this.findFirstDisplayableDescendant(nodeId);
            if (targetNodeId) {
                this.scrollToNode(targetNodeId);
            }
        }
    }

    /**
     * Find the first displayable descendant of a node (when hierarchy levels are hidden)
     */
    private findFirstDisplayableDescendant(nodeId: string): string | null {
        const node = this.projectManager.findNodeById(nodeId);
        if (!node) return null;

        // Check if this node itself would be displayed
        if (this.isDeepestAvailableContent(node)) {
            return node.id;
        }

        // Otherwise, check children in order
        for (const child of node.children) {
            const descendant = this.findFirstDisplayableDescendant(child.id);
            if (descendant) {
                return descendant;
            }
        }

        return null;
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
                    content: '', // Always empty - content handled by textareas only
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
                        <button id="reader-actions-config" class="control-btn">🔧 Configure Actions</button>
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
                    <div id="reader-action-buttons" class="reader-action-buttons" style="display: none;">
                        <div class="action-buttons-header">AI Actions</div>
                        <div id="action-buttons-container" class="action-buttons-container">
                            <!-- Action buttons will be dynamically inserted here -->
                        </div>
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
        // Always show all hierarchy levels in TOC, regardless of showAllLevels setting
        const tocNodes = this.analyzeTOCContent();
        
        let tocHTML = `
            <h3>Table of Contents</h3>
            <ul class="toc-list">
        `;

        tocNodes.forEach(node => {
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
     * Analyze project content specifically for TOC - always shows all hierarchy levels
     */
    private analyzeTOCContent(): ContentNode[] {
        const nodes: ContentNode[] = [];
        let position = 0;

        const processNode = (node: DocumentNode): void => {
            // For TOC, always include all nodes with content or leaf nodes
            const hasContent = !!(node.content && node.content.trim());
            const isLeaf = node.children.length === 0;
            
            if (hasContent || isLeaf) {
                const wordCount = this.calculateWordCount(node.content);
                const readingTime = Math.ceil(wordCount / 200);

                nodes.push({
                    id: node.id,
                    title: node.title,
                    content: '',
                    level: node.level,
                    isLeaf: isLeaf,
                    hasContent: hasContent,
                    position: position++,
                    wordCount,
                    estimatedReadingTime: readingTime
                });
            }

            // Always process children for complete TOC hierarchy
            node.children.forEach(child => processNode(child));
        };

        processNode(this.projectManager.rootNode);
        return nodes;
    }

    /**
     * Generate the main content area
     */
    private generateContent(): string {
        let contentHTML = `<div class="reader-content reader-content-minimal">`;

        this.contentNodes.forEach((node) => {
            // Add the node content
            contentHTML += this.generateNodeHTML(node);
        });

        contentHTML += '</div>';
        return contentHTML;
    }

    /**
     * Generate HTML for a single content node
     */
    private generateNodeHTML(node: ContentNode): string {
        // Calculate depth from leaf for hierarchy coloring
        const depthFromLeaf = this.calculateDepthFromLeaf(node);
        
        // Always use minimal mode - small title, no meta info, continuous reading
        let html = `
            <div class="reader-node reader-node-minimal" id="node-${node.id}" data-node-id="${node.id}" data-level="${node.level}" data-depth-from-leaf="${depthFromLeaf}">
                <div class="node-minimal-title">${node.title}</div>
        `;

        if (node.hasContent) {
            html += `
                <div class="node-content node-content-minimal" data-node-id="${node.id}">
                    <!-- Content will be rendered by editor textareas -->
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    /**
     * Calculate depth from leaf for a content node (for hierarchy coloring)
     * Based on template structure, not actual tree structure
     */
    private calculateDepthFromLeaf(contentNode: ContentNode): number {
        const documentNode = this.projectManager.findNodeById(contentNode.id);
        if (!documentNode) return 0;
        
        return this.getDepthFromTemplateLeaf(documentNode);
    }

    /**
     * Calculate how many levels this node is above the template's deepest level
     * Uses the template's hierarchy levels, not the actual tree structure
     */
    private getDepthFromTemplateLeaf(node: DocumentNode): number {
        const template = this.projectManager.template;
        const maxTemplateLevel = template.hierarchyLevels.length - 1; // 0-indexed
        const nodeLevel = node.level;
        
        // Calculate depth from template's deepest level
        // If a node is at level 0 and template has 4 levels (0,1,2,3), depth is 3
        // If a node is at level 2 and template has 4 levels (0,1,2,3), depth is 1
        // If a node is at level 3 and template has 4 levels (0,1,2,3), depth is 0
        return Math.max(0, maxTemplateLevel - nodeLevel);
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
     * Refresh CSS styles (used when settings change)
     */
    private refreshStyles(): void {
        // Remove existing styles
        const existingStyles = document.getElementById('reader-styles');
        if (existingStyles) {
            existingStyles.remove();
        }

        // Re-apply styles with current configuration
        this.applyStyles();
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
                margin: 0;
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

            /* Hierarchy background colors based on depth from leaf when showing all levels */
            ${this.config.showAllLevels ? `
            /* Leafs (deepest content) - White background */
            .reader-node[data-depth-from-leaf="0"] {
                background-color: #ffffff;
                border-left: 4px solid #e5e7eb;
            }
            /* 1 level above leafs - Light green */
            .reader-node[data-depth-from-leaf="1"] {
                background-color: #f0fdf4;
                border-left: 4px solid #22c55e;
            }
            /* 2 levels above leafs - Light blue */
            .reader-node[data-depth-from-leaf="2"] {
                background-color: #eff6ff;
                border-left: 4px solid #3b82f6;
            }
            /* 3 levels above leafs - Light red */
            .reader-node[data-depth-from-leaf="3"] {
                background-color: #fef2f2;
                border-left: 4px solid #ef4444;
            }
            /* 4 levels above leafs - Light gray */
            .reader-node[data-depth-from-leaf="4"] {
                background-color: #f9fafb;
                border-left: 4px solid #9ca3af;
            }
            /* 5+ levels above leafs - Darker gray */
            .reader-node[data-depth-from-leaf="5"], 
            .reader-node[data-depth-from-leaf="6"], 
            .reader-node[data-depth-from-leaf="7"], 
            .reader-node[data-depth-from-leaf="8"], 
            .reader-node[data-depth-from-leaf="9"] {
                background-color: #f3f4f6;
                border-left: 4px solid #6b7280;
            }
            ` : ''}

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
                    max-width: none;
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

            /* Hierarchy background colors override for minimal mode when showing all levels */
            ${this.config.showAllLevels ? `
            /* Leafs (deepest content) - White background */
            .reader-node-minimal[data-depth-from-leaf="0"] {
                background-color: #ffffff !important;
                border-left: 4px solid #e5e7eb !important;
                padding: 0.75rem !important;
                border-radius: 4px !important;
                margin-bottom: 1rem !important;
            }
            /* 1 level above leafs - Light green */
            .reader-node-minimal[data-depth-from-leaf="1"] {
                background-color: #f0fdf4 !important;
                border-left: 4px solid #22c55e !important;
                padding: 0.75rem !important;
                border-radius: 4px !important;
                margin-bottom: 1rem !important;
            }
            /* 2 levels above leafs - Light blue */
            .reader-node-minimal[data-depth-from-leaf="2"] {
                background-color: #eff6ff !important;
                border-left: 4px solid #3b82f6 !important;
                padding: 0.75rem !important;
                border-radius: 4px !important;
                margin-bottom: 1rem !important;
            }
            /* 3 levels above leafs - Light red */
            .reader-node-minimal[data-depth-from-leaf="3"] {
                background-color: #fef2f2 !important;
                border-left: 4px solid #ef4444 !important;
                padding: 0.75rem !important;
                border-radius: 4px !important;
                margin-bottom: 1rem !important;
            }
            /* 4 levels above leafs - Light gray */
            .reader-node-minimal[data-depth-from-leaf="4"] {
                background-color: #f9fafb !important;
                border-left: 4px solid #9ca3af !important;
                padding: 0.75rem !important;
                border-radius: 4px !important;
                margin-bottom: 1rem !important;
            }
            /* 5+ levels above leafs - Darker gray */
            .reader-node-minimal[data-depth-from-leaf="5"], 
            .reader-node-minimal[data-depth-from-leaf="6"], 
            .reader-node-minimal[data-depth-from-leaf="7"], 
            .reader-node-minimal[data-depth-from-leaf="8"], 
            .reader-node-minimal[data-depth-from-leaf="9"] {
                background-color: #f3f4f6 !important;
                border-left: 4px solid #6b7280 !important;
                padding: 0.75rem !important;
                border-radius: 4px !important;
                margin-bottom: 1rem !important;
            }
            ` : ''}

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

            /* Legacy edit mode styles removed - always-edit mode now */

            /* Reader Action Buttons */
            .reader-action-buttons {
                position: fixed;
                right: 20px;
                top: 50%;
                transform: translateY(-50%);
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                padding: 12px;
                min-width: 160px;
                max-width: 200px;
                z-index: 10001;
            }

            .action-buttons-header {
                font-weight: 600;
                color: #374151;
                margin-bottom: 8px;
                font-size: 0.9rem;
                text-align: center;
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 8px;
            }

            .action-buttons-container {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .selection-mode-toggle {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem;
                background-color: #f8f9fa;
                border-radius: 4px;
                font-size: 0.875rem;
                width: 100%;
                box-sizing: border-box;
                margin-bottom: 0.25rem;
            }

            .selection-mode-label {
                font-weight: 500;
                color: #374151;
                flex-shrink: 0;
            }

            .selection-mode-select {
                padding: 0.25rem 0.5rem;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 0.875rem;
                background: white;
                flex: 1;
            }

            .action-buttons-separator {
                width: 100%;
                height: 1px;
                background-color: #e5e7eb;
                margin: 0.25rem 0;
            }

            .reader-action-btn {
                padding: 8px 12px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.85rem;
                color: #475569;
                transition: all 0.2s ease;
                text-align: left;
            }

            .reader-action-btn:hover {
                background: #e2e8f0;
                border-color: #cbd5e1;
                color: #334155;
            }

            .reader-action-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .reader-action-btn.processing {
                background: #dbeafe;
                border-color: #93c5fd;
                color: #1e40af;
            }

            .reader-undo-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                background: #f1f5f9;
                color: #94a3b8;
            }

            .reader-undo-btn:not(:disabled):hover {
                background: #fef3c7;
                border-color: #f59e0b;
                color: #d97706;
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
            void this.close();
        } else if (target.id === 'reader-actions-config') {
            this.openActionsConfigModal();
        } else if (target.classList.contains('reader-action-btn')) {
            const actionId = target.getAttribute('data-action-id');
            if (actionId === 'undo') {
                // Handle undo button
                const success = this.readerEditor.undoLastReplacement();
                if (success) {
                    // Update undo button state after successful undo
                    this.updateUndoButtonState();
                }
            } else if (actionId) {
                // Handle regular AI action buttons
                void this.readerEditor.executeAction(actionId).then(() => {
                    // Update undo button state after AI action completes
                    this.updateUndoButtonState();
                });
            }
        } else if (target.id === 'reader-toc-btn') {
            this.toggleTOC();
        } else if (target.id === 'reader-settings-btn') {
            this.toggleSettings();
        } else if (target.classList.contains('toc-link')) {
            event.preventDefault();
            const nodeId = target.dataset.nodeId;
            if (nodeId) {
                this.handleTOCNavigation(nodeId);
            }
        } else if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('#node-')) {
            // Handle TOC anchor links
            event.preventDefault();
            const nodeId = target.getAttribute('href')?.substring('#node-'.length);
            if (nodeId) {
                this.handleTOCNavigation(nodeId);
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
                
                // Re-analyze content with new setting
                this.contentNodes = this.analyzeProjectContent();
                
                // Update the content area in always-edit mode
                const contentArea = this.container.querySelector('.reader-content-area');
                if (contentArea) {
                    // Destroy existing editors before regenerating content
                    this.readerEditor.destroy();
                    
                    // Regenerate content HTML
                    contentArea.innerHTML = this.generateContent();
                    
                    // Recreate text editors for the new content
                    this.readerEditor.initialize();
                    
                    // Update TOC if visible
                    if (this.config.showTOC) {
                        const tocElement = this.container.querySelector('.reader-toc');
                        if (tocElement) {
                            tocElement.innerHTML = this.generateTOCContent();
                        }
                    }
                }
                
                // Refresh styles to apply/remove hierarchy level backgrounds
                this.refreshStyles();
                
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
            fontSize: 16,
            lineHeight: 1.6,
            maxWidth: 800,
            theme: 'light',
            separatorStyle: 'standard'
        };
        // this.render(); // DISABLED in always-edit mode to prevent textarea duplication
        this.applySettings(); // Apply the settings without re-rendering DOM
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
        
        // Show/hide the TOC without full re-render (preserves editor state)
        const tocElement = this.container.querySelector('.reader-toc') as HTMLElement;
        if (tocElement) {
            tocElement.style.display = this.config.showTOC ? 'block' : 'none';
        }
        
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
                        <input type="range" id="reader-max-width" min="600" max="3200" step="50" value="${this.config.maxWidth}">
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
     * Open the actions configuration modal
     */
    private openActionsConfigModal(): void {
        try {
            // Import the new modal system dynamically
            void import('./modals/index').then(({ showGenericModal }) => {
                // Store state for the modal - these will be shared with event listeners
                let selectedActionId: string | null = null;
                let unsavedChanges = false;
                
                const modal = showGenericModal(
                    {
                        content: this.renderActionsConfigModalContent(),
                        actions: [
                            {
                                id: 'reset',
                                label: 'Reset to Defaults',
                                type: 'secondary',
                                handler: async () => {
                                    if (confirm('Reset all actions to defaults? This will remove any custom actions.')) {
                                        await this.readerEditor.resetToDefaults();
                                        this.refreshActionsList();
                                        this.clearActionEditor();
                                        selectedActionId = null;
                                        unsavedChanges = false;
                                        alert('Actions reset to defaults successfully!');
                                    }
                                }
                            },
                            {
                                id: 'cancel',
                                label: 'Cancel',
                                type: 'secondary',
                                handler: async () => {
                                    if (unsavedChanges && !confirm('You have unsaved changes. Cancel without saving?')) {
                                        throw new Error('Cancel prevented'); // Prevent modal from closing
                                    }
                                    void modal.close();
                                }
                            },
                            {
                                id: 'save',
                                label: 'Save Changes',
                                type: 'primary',
                                handler: async () => {
                                    // Get the current action ID from the form
                                    const form = document.getElementById('action-editor-form') as HTMLFormElement;
                                    const currentActionId = form?.getAttribute('data-action-id');
                                    if (currentActionId) {
                                        await this.saveCurrentAction(currentActionId);
                                    }
                                    this.updateActionButtons();
                                    unsavedChanges = false;
                                    alert('All changes saved successfully!');
                                    void modal.close();
                                }
                            }
                        ]
                    },
                    {
                        title: '🔧 Configure AI Actions',
                        maxWidth: '1200px',
                        width: '90vw'
                    },
                    {
                        onOpen: () => {
                            this.setupActionsConfigEventListeners(selectedActionId, unsavedChanges, (newSelectedId) => {
                                selectedActionId = newSelectedId;
                            }, (newUnsavedState) => {
                                unsavedChanges = newUnsavedState;
                            });
                        },
                        onClose: () => {
                            // Clean up any event listeners if needed
                        }
                    }
                );
            });
        } catch (error) {
            console.error('Failed to open actions config modal:', error);
        }
    }

    /**
     * Render the actions configuration modal content
     */
    private renderActionsConfigModalContent(): string {
        return this.renderActionsConfigModalBody();
    }

    /**
     * Render the actions configuration modal body (without header and buttons)
     */
    private renderActionsConfigModalBody(): string {
        const actions = this.readerEditor.getAllActions();

        return `
            <style>
                .actions-config-modal {
                    width: 90vw;
                    max-width: 1200px;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                }
                .actions-config-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem 2rem;
                    border-bottom: 1px solid #e5e7eb;
                    background-color: #f9fafb;
                }
                .actions-config-body {
                    flex: 1;
                    padding: 2rem;
                    display: flex;
                    gap: 2rem;
                }
                .actions-list {
                    flex: 1;
                    min-width: 300px;
                }
                .action-item {
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    margin-bottom: 1rem;
                    background-color: white;
                    transition: all 0.2s;
                }
                .action-item:hover {
                    border-color: #3b82f6;
                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
                }
                .action-item.selected {
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                .action-header {
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #f3f4f6;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                }
                .action-title {
                    font-weight: 600;
                    color: #1f2937;
                    margin: 0;
                }
                .action-meta {
                    display: flex;
                    gap: 0.5rem;
                    align-items: center;
                    font-size: 0.875rem;
                    color: #6b7280;
                }
                .action-toggle {
                    position: relative;
                    width: 44px;
                    height: 24px;
                    background-color: #d1d5db;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                .action-toggle.enabled {
                    background-color: #3b82f6;
                }
                .action-toggle::after {
                    content: '';
                    position: absolute;
                    top: 2px;
                    left: 2px;
                    width: 20px;
                    height: 20px;
                    background-color: white;
                    border-radius: 50%;
                    transition: transform 0.2s;
                }
                .action-toggle.enabled::after {
                    transform: translateX(20px);
                }
                .editor-panel {
                    flex: 2;
                    min-width: 500px;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    background-color: white;
                    height: fit-content;
                }
                .editor-header {
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #f3f4f6;
                    background-color: #f9fafb;
                    border-radius: 12px 12px 0 0;
                }
                .editor-content {
                    padding: 1.5rem;
                }
                .field-group {
                    margin-bottom: 1.5rem;
                }
                .field-label {
                    display: block;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 0.5rem;
                    font-size: 0.875rem;
                }
                .field-input {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    transition: border-color 0.2s;
                }
                .field-input:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                .field-textarea {
                    min-height: 200px;
                    resize: vertical;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                    font-size: 0.8rem;
                    line-height: 1.5;
                }
                .field-select {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    background-color: white;
                    font-size: 0.875rem;
                }
                .placeholders-help {
                    background-color: #eff6ff;
                    border: 1px solid #bfdbfe;
                    border-radius: 8px;
                    padding: 1rem;
                    margin-top: 1rem;
                }
                .placeholders-title {
                    font-weight: 600;
                    color: #1e40af;
                    margin-bottom: 0.5rem;
                    font-size: 0.875rem;
                }
                .placeholders-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 0.5rem;
                }
                .placeholder-item {
                    background-color: #dbeafe;
                    color: #1e40af;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                    font-size: 0.75rem;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                .placeholder-item:hover {
                    background-color: #bfdbfe;
                }
                .action-buttons {
                    display: flex;
                    gap: 0.75rem;
                    justify-content: flex-end;
                    padding: 1.5rem 2rem;
                    border-top: 1px solid #e5e7eb;
                    background-color: #f9fafb;
                }
                .btn {
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
                .btn-primary:hover {
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
                .btn-danger {
                    background-color: #ef4444;
                    color: white;
                }
                .btn-danger:hover {
                    background-color: #dc2626;
                }
                .btn-success {
                    background-color: #10b981;
                    color: white;
                }
                .btn-success:hover {
                    background-color: #059669;
                }
                .no-selection {
                    text-align: center;
                    color: #6b7280;
                    padding: 2rem;
                    font-style: italic;
                }
                .field-description {
                    font-size: 0.75rem;
                    color: #6b7280;
                    margin-top: 0.25rem;
                }
                .order-controls {
                    display: flex;
                    gap: 0.5rem;
                    margin-left: auto;
                }
                .order-btn {
                    width: 24px;
                    height: 24px;
                    border: 1px solid #d1d5db;
                    background-color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    color: #6b7280;
                }
                .order-btn:hover {
                    background-color: #f3f4f6;
                    border-color: #9ca3af;
                }
            </style>
            <div class="actions-config-modal">
                <div class="actions-config-body">
                    <div class="actions-list">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h3 style="margin: 0; color: #374151;">Actions</h3>
                            <button id="add-new-action" class="btn btn-success" style="padding: 0.5rem 1rem; font-size: 0.8rem;">+ Add New</button>
                        </div>
                        <div id="actions-list-container">
                            ${actions.map(action => this.renderActionListItem(action)).join('')}
                        </div>
                    </div>
                    <div class="editor-panel">
                        <div class="editor-header">
                            <h3 style="margin: 0; color: #374151;">Edit Action</h3>
                        </div>
                        <div class="editor-content">
                            <div id="editor-content-area">
                                <div class="no-selection">
                                    Select an action to edit its configuration
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render a single action item in the list
     */
    private renderActionListItem(action: ReaderEditAction): string {
        return `
            <div class="action-item" data-action-id="${action.id}">
                <div class="action-header" onclick="selectAction('${action.id}')">
                    <div>
                        <h4 class="action-title">${action.title}</h4>
                        <div class="action-meta">
                            <span>Model: ${action.model}</span>
                            <span>•</span>
                            <span>Order: ${action.order}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div class="order-controls">
                            <button class="order-btn" onclick="moveActionUp('${action.id}')" title="Move up">↑</button>
                            <button class="order-btn" onclick="moveActionDown('${action.id}')" title="Move down">↓</button>
                        </div>
                        <div class="action-toggle ${action.enabled ? 'enabled' : ''}" 
                             onclick="toggleAction('${action.id}')" 
                             data-enabled="${action.enabled}"></div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render the action editor form
     */
    private renderActionEditor(action: ReaderEditAction): string {
        const availablePlaceholders = [
            '{{selected}}', '{{content}}', '{{title}}', '{{node_path}}', 
            '{{project_title}}', '{{level}}', '{{children_count}}', 
            '{{context}}', '{{word_count}}', '{{input "Title"}}'
        ];

        return `
            <form id="action-editor-form" data-action-id="${action.id}">
                <div class="field-group">
                    <label class="field-label" for="action-title">Action Title</label>
                    <input type="text" id="action-title" class="field-input" value="${action.title}" required>
                    <div class="field-description">The text that appears on the action button</div>
                </div>
                
                <div class="field-group">
                    <label class="field-label" for="action-description">Description</label>
                    <input type="text" id="action-description" class="field-input" value="${action.description || ''}" placeholder="Optional description for this action">
                    <div class="field-description">Help text that appears when hovering over the button</div>
                </div>
                
                <div class="field-group">
                    <label class="field-label" for="action-model">AI Model</label>
                    <select id="action-model" class="field-select">
                        <option value="creator" ${action.model === 'creator' ? 'selected' : ''}>Creator (Creative, detailed responses)</option>
                        <option value="editor" ${action.model === 'editor' ? 'selected' : ''}>Editor (Precise, concise editing)</option>
                        <option value="rater" ${action.model === 'rater' ? 'selected' : ''}>Rater (Analysis and evaluation)</option>
                    </select>
                    <div class="field-description">Choose the AI model that best fits this action's purpose</div>
                </div>
                
                <div class="field-group">
                    <label class="field-label" for="action-order">Display Order</label>
                    <input type="number" id="action-order" class="field-input" value="${action.order}" min="1" required>
                    <div class="field-description">Controls the order of action buttons (1 = first)</div>
                </div>
                
                <div class="field-group">
                    <label class="field-label" for="action-prompt">Prompt Template</label>
                    <textarea id="action-prompt" class="field-input field-textarea" required>${action.prompt}</textarea>
                    <div class="field-description">Use placeholders like {{selected}} to insert dynamic content</div>
                    
                    <div class="placeholders-help">
                        <div class="placeholders-title">Available Placeholders (click to insert):</div>
                        <div class="placeholders-grid">
                            ${availablePlaceholders.map(placeholder => 
                                `<span class="placeholder-item" onclick="insertPlaceholder('${placeholder}')">${placeholder}</span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 0.75rem; margin-top: 2rem;">
                    <button type="button" id="delete-action" class="btn btn-danger" ${action.id.startsWith('custom-') ? '' : 'disabled title="Default actions cannot be deleted"'}>Delete Action</button>
                </div>
            </form>
        `;
    }

    /**
     * Setup event listeners for the actions configuration modal
     */
    private setupActionsConfigEventListeners(
        selectedActionId: string | null,
        unsavedChanges: boolean,
        setSelectedActionId: (id: string | null) => void,
        setUnsavedChanges: (state: boolean) => void
    ): void {
        // Global functions for onclick handlers
        (window as any).selectAction = (actionId: string) => {
            if (unsavedChanges && !confirm('You have unsaved changes. Continue without saving?')) {
                return;
            }
            setSelectedActionId(actionId);
            this.selectActionInModal(actionId);
            setUnsavedChanges(false);
        };

        (window as any).toggleAction = async (actionId: string) => {
            await this.readerEditor.updateAction(actionId, { 
                enabled: !this.readerEditor.getAllActions().find(a => a.id === actionId)?.enabled 
            });
            this.refreshActionsList();
            setUnsavedChanges(true);
        };

        (window as any).moveActionUp = async (actionId: string) => {
            await this.moveAction(actionId, -1);
            this.refreshActionsList();
            setUnsavedChanges(true);
        };

        (window as any).moveActionDown = async (actionId: string) => {
            await this.moveAction(actionId, 1);
            this.refreshActionsList();
            setUnsavedChanges(true);
        };

        (window as any).insertPlaceholder = (placeholder: string) => {
            const textarea = document.getElementById('action-prompt') as HTMLTextAreaElement;
            if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const text = textarea.value;
                textarea.value = text.substring(0, start) + placeholder + text.substring(end);
                textarea.focus();
                textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
                setUnsavedChanges(true);
            }
        };

        // Close button - removed, now handled by base modal

        // Add new action
        const addBtn = document.getElementById('add-new-action');
        addBtn?.addEventListener('click', async () => {
            await this.addNewAction();
            this.refreshActionsList();
            setUnsavedChanges(true);
        });

        // Form change detection
        document.addEventListener('input', (e) => {
            if ((e.target as HTMLElement).closest('#action-editor-form')) {
                setUnsavedChanges(true);
            }
        });

        // Save current action - need to get current selected action ID dynamically
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            
            if (target.id === 'save-current-action') {
                // Get the action ID from the form data attribute
                const form = document.getElementById('action-editor-form') as HTMLFormElement;
                const currentActionId = form?.getAttribute('data-action-id');
                if (currentActionId) {
                    void this.saveCurrentAction(currentActionId).then(() => {
                        setUnsavedChanges(false);
                    });
                }
            }
            
            if (target.id === 'delete-action') {
                // Get the action ID from the form data attribute
                const form = document.getElementById('action-editor-form') as HTMLFormElement;
                const currentActionId = form?.getAttribute('data-action-id');
                if (currentActionId) {
                    if (confirm('Are you sure you want to delete this action?')) {
                        void this.readerEditor.deleteAction(currentActionId).then(() => {
                            this.refreshActionsList();
                            setSelectedActionId(null);
                            this.clearActionEditor();
                            setUnsavedChanges(true);
                        });
                    }
                }
            }
        });

        // Reset, Save, and Cancel buttons - now handled by modal actions
    }

    /**
     * Select an action in the modal and show its editor
     */
    private selectActionInModal(actionId: string): void {
        // Update visual selection
        const items = document.querySelectorAll('.action-item');
        items.forEach(item => item.classList.remove('selected'));
        
        const selectedItem = document.querySelector(`[data-action-id="${actionId}"]`);
        selectedItem?.classList.add('selected');

        // Load action into editor
        const action = this.readerEditor.getAllActions().find(a => a.id === actionId);
        if (action) {
            const editorArea = document.getElementById('editor-content-area');
            if (editorArea) {
                editorArea.innerHTML = this.renderActionEditor(action);
            }
        }
    }

    /**
     * Refresh the actions list in the modal
     */
    private refreshActionsList(): void {
        const container = document.getElementById('actions-list-container');
        if (container) {
            const actions = this.readerEditor.getAllActions();
            container.innerHTML = actions.map(action => this.renderActionListItem(action)).join('');
        }
    }

    /**
     * Clear the action editor panel
     */
    private clearActionEditor(): void {
        const editorArea = document.getElementById('editor-content-area');
        if (editorArea) {
            editorArea.innerHTML = `
                <div class="no-selection">
                    Select an action to edit its configuration
                </div>
            `;
        }
    }

    /**
     * Save the current action being edited
     */
    private async saveCurrentAction(actionId: string): Promise<void> {
        const form = document.getElementById('action-editor-form') as HTMLFormElement;
        if (!form) return;

        const updates = {
            title: (document.getElementById('action-title') as HTMLInputElement).value,
            description: (document.getElementById('action-description') as HTMLInputElement).value,
            model: (document.getElementById('action-model') as HTMLSelectElement).value as 'creator' | 'editor' | 'rater',
            order: parseInt((document.getElementById('action-order') as HTMLInputElement).value),
            prompt: (document.getElementById('action-prompt') as HTMLTextAreaElement).value
        };

        await this.readerEditor.updateAction(actionId, updates);
        this.refreshActionsList();
    }

    /**
     * Add a new custom action
     */
    private async addNewAction(): Promise<void> {
        const newAction = {
            title: 'New Action',
            prompt: 'Please modify the following text:\n\n{{selected}}\n\nModified text:',
            model: 'editor' as const,
            enabled: true,
            order: this.readerEditor.getAllActions().length + 1,
            description: 'Custom action'
        };

        const actionId = await this.readerEditor.addAction(newAction);
        
        // Auto-select the new action
        setTimeout(() => {
            (window as any).selectAction(actionId);
        }, 100);
    }

    /**
     * Move an action up or down in order
     */
    private async moveAction(actionId: string, direction: number): Promise<void> {
        const actions = this.readerEditor.getAllActions();
        const action = actions.find(a => a.id === actionId);
        if (!action) return;

        const newOrder = action.order + direction;
        if (newOrder < 1 || newOrder > actions.length) return;

        // Find action at target position and swap
        const targetAction = actions.find(a => a.order === newOrder);
        if (targetAction) {
            await this.readerEditor.updateAction(targetAction.id, { order: action.order });
        }
        
        await this.readerEditor.updateAction(actionId, { order: newOrder });
    }



    /**
     * Update action buttons based on current edit state and selection
     */
    public updateActionButtons(): void {
        const actionButtonsContainer = this.container.querySelector('#reader-action-buttons') as HTMLElement;
        const container = this.container.querySelector('#action-buttons-container') as HTMLElement;
        
        if (!actionButtonsContainer || !container) return;

        // Get available actions
        const actions = this.readerEditor.getEnabledActions();
        
        // Clear existing buttons
        container.innerHTML = '';

        // Add selection mode toggle at the top
        const selectionModeDiv = document.createElement('div');
        selectionModeDiv.className = 'selection-mode-toggle';
        selectionModeDiv.innerHTML = `
            <label class="selection-mode-label">AI Capture:</label>
            <select id="selection-mode-select" class="selection-mode-select">
                <option value="words">Words</option>
                <option value="sentences" selected>Sentences</option>
                <option value="paragraphs">Paragraphs</option>
            </select>
        `;
        container.appendChild(selectionModeDiv);

        // Add separator
        const separator = document.createElement('div');
        separator.className = 'action-buttons-separator';
        container.appendChild(separator);
        
        // Add Undo button as the first action button
        const undoButton = document.createElement('button');
        undoButton.className = 'reader-action-btn reader-undo-btn';
        undoButton.textContent = '↶ Undo';
        undoButton.setAttribute('data-action-id', 'undo');
        undoButton.setAttribute('data-original-text', '↶ Undo');
        undoButton.title = 'Undo the last AI replacement';
        undoButton.disabled = true; // Start disabled
        container.appendChild(undoButton);
        
        // Create buttons for each action
        actions.forEach(action => {
            const button = document.createElement('button');
            button.className = 'reader-action-btn';
            button.textContent = action.title;
            button.setAttribute('data-action-id', action.id);
            button.setAttribute('data-original-text', action.title);
            button.title = action.description || action.title;
            
            container.appendChild(button);
        });

        // Set up selection mode toggle event listener
        this.setupSelectionModeToggle();

        // Update undo button state
        this.updateUndoButtonState();

        // Always show the action buttons panel since we're always editable
        actionButtonsContainer.style.display = 'block';
    }

    /**
     * Set up the selection mode toggle event listener
     */
    private setupSelectionModeToggle(): void {
        const select = this.container.querySelector('#selection-mode-select') as HTMLSelectElement;
        if (!select) return;

        // Set current value
        const currentMode = this.readerEditor.getCurrentSelectionMode();
        select.value = currentMode;

        // Add event listener for changes
        select.addEventListener('change', () => {
            const newMode = select.value as 'words' | 'sentences' | 'paragraphs';
            this.readerEditor.setSelectionMode(newMode);

        });
    }

    /**
     * Update the undo button state based on whether undo is available
     */
    private updateUndoButtonState(): void {
        const undoButton = this.container.querySelector('[data-action-id="undo"]') as HTMLButtonElement;
        if (!undoButton) return;

        const canUndo = this.readerEditor.canUndo();
        undoButton.disabled = !canUndo;
        
        // Visual feedback for disabled state
        if (canUndo) {
            undoButton.style.opacity = '1';
            undoButton.style.cursor = 'pointer';
        } else {
            undoButton.style.opacity = '0.5';
            undoButton.style.cursor = 'not-allowed';
        }
    }

    /**
     * Hide action buttons
     */
    public hideActionButtons(): void {
        const actionButtonsContainer = this.container.querySelector('#reader-action-buttons') as HTMLElement;
        if (actionButtonsContainer) {
            actionButtonsContainer.style.display = 'none';
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
        
        // Reset render flag
        this.hasBeenRendered = false;
        
        // Clear global instance
        if (globalReaderInstance === this) {
            globalReaderInstance = null;
        }
    }

    /**
     * Show the reader interface
     */
    public async show(): Promise<void> {
        this.container.style.display = 'block';
        await this.loadReaderConfig();
        
        // Only render if this instance has never been rendered before
        if (!this.hasBeenRendered) {
            this.render(); // Only render once per instance
        }
        
        this.applySettings();
        this.startListeningForUpdates();
    }

    /**
     * Hide the reader interface
     */
    public hide(): void {
        this.container.style.display = 'none';
        this.stopListeningForUpdates();
        
        // Cleanup reader editor
        if (this.readerEditor) {
            this.readerEditor.destroy();
        }
    }

    /**
     * Get the reader container element for internal use
     */
    public getContainer(): HTMLElement {
        return this.container;
    }

    /**
     * Start listening for project updates to refresh reader content
     */
    private startListeningForUpdates(): void {
        if (this.isListeningForUpdates) return;
        
        this.isListeningForUpdates = true;
        
        // Listen for node generation completion to update reader content
        this.projectManager.on('nodeGenerationComplete', this.boundHandleNodeGenerationComplete);
        
        // Listen for summary generation
        this.projectManager.on('nodeSummaryGenerated', this.boundHandleNodeSummaryGenerated);
        
        // Listen for overall project structure changes only
        this.projectManager.on('project-loaded', this.boundHandleProjectUpdate);
    }

    /**
     * Stop listening for project updates
     */
    private stopListeningForUpdates(): void {
        if (!this.isListeningForUpdates) return;
        
        this.isListeningForUpdates = false;
        
        // Remove event listeners (matching what we actually listen for)
        this.projectManager.off('nodeGenerationComplete', this.boundHandleNodeGenerationComplete);
        this.projectManager.off('nodeSummaryGenerated', this.boundHandleNodeSummaryGenerated);
        this.projectManager.off('project-loaded', this.boundHandleProjectUpdate);
    }



    /**
     * Handle node generation completion - update reader content without breaking editor
     */
    private handleNodeGenerationComplete(e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }): void {
        if (e.success) {
            console.log(`📖 Reader auto-updating content for: "${e.node.title}" (${e.nodeId})`);
            
            // Check if this is a new node that wasn't in the reader when it was built
            const existingContentNode = this.contentNodes.find(cn => cn.id === e.nodeId);
            if (!existingContentNode) {
                console.log(`🆕 New node detected: "${e.node.title}" - rebuilding reader content`);
                this.refreshReaderForNewNodes();
                return;
            }
            
            // Update the reader content for this specific node
            this.updateNodeContentInReader(e.nodeId, e.node.content);
        } else {
            console.log(`❌ Node generation failed for: "${e.node.title}" (${e.nodeId}) - Reader not updated`);
        }
    }

    /**
     * Handle node summary generation - update reader content without breaking editor
     */
    private handleNodeSummaryGenerated(e: { nodeId: string, summary: string }): void {
        // Summary updates don't affect reader content directly since we show content, not summaries
        // But we could update any summary displays if needed in the future
    }

    /**
     * Update content for a specific node in the reader without breaking the editor
     */
    private updateNodeContentInReader(nodeId: string, newContent: string): void {
        // Access the ReaderEditor to update the content directly
        if (this.readerEditor) {
            const nodeEditor = (this.readerEditor as any).nodeEditors?.get(nodeId);
            if (nodeEditor) {
                // Only update if not currently being edited by the user
                const editorElement = nodeEditor.element.querySelector('.text-editor-with-highlighting') as HTMLElement;
                if (editorElement && document.activeElement !== editorElement) {
                    // Update the TextEditorWithHighlighting content
                    nodeEditor.editor.setText(newContent);
                    // Update the original content so it doesn't appear as dirty
                    nodeEditor.originalContent = newContent;
                    nodeEditor.isDirty = false;
                    
                    // Update the word count in contentNodes and refresh TOC
                    this.updateNodeWordCount(nodeId, newContent);
                    
                    console.log(`📝 Reader content updated successfully for node: ${nodeId}`);
                } else {
                    console.log(`⏭️ Reader update skipped - node ${nodeId} is currently being edited by user`);
                }
            } else {
                console.log(`⚠️ Reader update failed - no editor found for node: ${nodeId}`);
                // Debug: Let's see what editors are actually available
                const availableEditors = (this.readerEditor as any).nodeEditors ? 
                    Array.from((this.readerEditor as any).nodeEditors.keys()) : [];
                console.log(`🔍 Available editors in reader:`, availableEditors);
            }
        } else {
            console.log(`⚠️ Reader update failed - ReaderEditor not initialized`);
        }
    }

    /**
     * Update word count for a specific node and refresh TOC if visible
     */
    private updateNodeWordCount(nodeId: string, newContent: string): void {
        // Find and update the contentNode
        const contentNode = this.contentNodes.find(node => node.id === nodeId);
        if (contentNode) {
            const newWordCount = this.calculateWordCount(newContent);
            contentNode.wordCount = newWordCount;
            contentNode.estimatedReadingTime = Math.ceil(newWordCount / 200);
            contentNode.hasContent = !!(newContent && newContent.trim());
            
            // Refresh TOC if it's visible
            if (this.config.showTOC) {
                this.refreshTOC();
            }
            
            console.log(`📊 Updated word count for "${contentNode.title}": ${newWordCount} words`);
        }
    }

    /**
     * Refresh just the TOC content without rebuilding the entire reader
     */
    private refreshTOC(): void {
        const tocElement = this.container.querySelector('.reader-toc');
        if (tocElement) {
            tocElement.innerHTML = this.generateTOCContent();
            console.log(`🔄 TOC refreshed with updated word counts`);
        }
    }

    /**
     * Refresh the reader when new nodes are detected (e.g., after child node generation)
     */
    private refreshReaderForNewNodes(): void {
        // Preserve content from existing editors before destroying them
        let preservedContent = new Map<string, string>();
        if (this.readerEditor) {
            preservedContent = this.readerEditor.preserveAllContent();
        }
        
        // Re-analyze the project content to pick up new nodes
        this.contentNodes = this.analyzeProjectContent();
        
        // Rebuild the content area and TOC
        const contentArea = this.container.querySelector('.reader-content-area');
        if (contentArea) {
            contentArea.innerHTML = this.generateContent();
        }
        
        // Refresh TOC if visible
        if (this.config.showTOC) {
            this.refreshTOC();
    }

        // Rebuild click mappings
        this.buildClickMappings();
        
        // Reinitialize the editor with preserved content
        if (this.readerEditor) {
            this.readerEditor.initialize(preservedContent);
        }
    }

    /**
     * Handle overall project updates
     */
    private handleProjectUpdate(): void {
        console.log(`📋 Project structure changed - checking for new nodes`);
        
        // Check if there are new nodes that need to be added to the reader
        const currentNodeIds = new Set(this.contentNodes.map(cn => cn.id));
        const newContentNodes = this.analyzeProjectContent();
        const newNodeIds = new Set(newContentNodes.map(cn => cn.id));
        
        // Check if there are actually new nodes
        const hasNewNodes = newContentNodes.some(cn => !currentNodeIds.has(cn.id));
        const hasRemovedNodes = this.contentNodes.some(cn => !newNodeIds.has(cn.id));
        
        if (hasNewNodes || hasRemovedNodes) {
            console.log(`🔄 Project structure changed: ${newContentNodes.length} total nodes (was ${this.contentNodes.length})`);
            this.refreshReaderForNewNodes();
        } else {
            console.log(`✅ No structural changes detected`);
        }
    }

    /**
     * Preserve the current reading position before updating content
     */
    private preserveReadingPosition(): void {
        // Content state is managed by individual text editors in always-edit mode
        // No position preservation needed
    }



    /**
     * Refresh content while preserving reading position
     */
    private refreshContent(): void {
        // In always-edit mode, content is managed entirely by individual text editors
        // No full DOM refreshes needed - updates happen through ReaderEditor
        return;
    }




}

// Global reader instance to prevent recreating the reader
let globalReaderInstance: ReaderGUI | null = null;

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

    // Check if we need to create a new reader instance or update the existing one
    if (!globalReaderInstance || globalReaderInstance.projectManager !== projectManager) {
        // Clean up existing instance if it exists
        if (globalReaderInstance) {
            globalReaderInstance.hide();
            globalReaderInstance = null;
        }
        
        // Create new reader instance for the new project
        globalReaderInstance = new ReaderGUI(projectManager, readerContainer, onNavigateToNode);
    }
    
    await globalReaderInstance.show();
    return globalReaderInstance;
} 