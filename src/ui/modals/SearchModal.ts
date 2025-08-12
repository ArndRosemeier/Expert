/**
 * Search Modal for hierarchical content search and replace
 * 
 * Features:
 * - Search through current node and all subnodes
 * - Version-aware search (master only or all versions)
 * - Wildcard pattern support (? and *)
 * - Click on result to open NodeInspector
 * - Global replace functionality
 * - Maintains state when returning from NodeInspector
 */

import { BaseModal } from './core/BaseModal';
import { SearchService, type SearchOptions, type SearchResult, type ReplaceOptions, type ReplaceResult } from './services/SearchService';
import type { DocumentNode } from '../../DocumentNode';
// NodeInspectorModal imported dynamically when needed

// ============================================================================
// SEARCH MODAL CLASS
// ============================================================================

export class SearchModal extends BaseModal {
    private rootNode: DocumentNode | null = null;
    private currentResults: SearchResult[] = [];
    private searchInput: HTMLInputElement | null = null;
    private replaceInput: HTMLInputElement | null = null;
    private resultsContainer: HTMLElement | null = null;
    private statusElement: HTMLElement | null = null;
    
    // Pagination
    private currentPage: number = 1;
    private resultsPerPage: number = 100;
    private totalPages: number = 1;
    
    // Options
    private includeAllVersions: boolean = true;
    private caseSensitive: boolean = false;
    private searchInContent: boolean = true;
    private searchInContext: boolean = true;
    private searchInConditional: boolean = false;

    constructor() {
        super({
            id: 'search-modal',
            closable: true,
            backdrop: true,
            width: '70vw',
            height: '80vh',
            maxWidth: '900px',
            maxHeight: '700px',
        });
    }

    /**
     * Open the search modal for a specific node
     */
    public openForNode(node: DocumentNode): void {
        this.rootNode = node;
        void this.open();
    }

    public render(): HTMLElement {
        const nodePath = this.rootNode ? this.getNodePath(this.rootNode) : 'Unknown Node';
        
        const container = document.createElement('div');
        container.className = 'search-modal-container';
        container.innerHTML = `
            <div class="search-modal-header">
                <h2>🔍 Search in "${this.rootNode?.title || 'Unknown'}"</h2>
                <div class="search-scope">Scope: ${nodePath}</div>
            </div>

            <div class="search-controls">
                <!-- Search Input -->
                <div class="search-input-group">
                    <input 
                        type="text" 
                        id="search-input" 
                        placeholder="Enter search pattern (* and ? wildcards supported)"
                        class="search-input"
                    >
                    <button id="search-btn" class="search-button">Search</button>
                </div>

                <!-- Replace Input -->
                <div class="replace-input-group">
                    <input 
                        type="text" 
                        id="replace-input" 
                        placeholder="Replace with..."
                        class="replace-input"
                    >
                    <button id="replace-all-btn" class="replace-button" disabled>Replace All</button>
                </div>

                <!-- Options -->
                <div class="search-options">
                    <label class="checkbox-label">
                        <input type="checkbox" id="include-all-versions" checked> Include all versions
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="case-sensitive"> Case sensitive
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="search-content" checked> Search in content
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="search-context" checked> Search in context
                    </label>
                    <label class="checkbox-label" title="Search only this node's conditional context items (not inherited, not recursive)">
                        <input type="checkbox" id="search-conditional"> Search in conditional context (this node only)
                    </label>
                </div>

                <!-- Status -->
                <div id="search-status" class="search-status"></div>
            </div>

                            <!-- Results -->
                <div class="search-results-container">
                    <div id="search-results" class="search-results">
                        <div class="no-results">Enter a search pattern and click Search to find matches.</div>
                    </div>
                    
                    <!-- Pagination -->
                    <div id="pagination-container" class="pagination-container" style="display: none;">
                        <div class="pagination-info">
                            <span id="pagination-info-text"></span>
                        </div>
                        <div class="pagination-controls">
                            <button id="prev-page-btn" class="pagination-btn">← Previous</button>
                            <span id="page-info"></span>
                            <button id="next-page-btn" class="pagination-btn">Next →</button>
                        </div>
                    </div>
                </div>
        `;
        
        // Inject styles
        this.injectStyles();
        
        // Setup event listeners after render
        setTimeout(() => {
            this.setupEventListeners(container);
            // Focus the search input for immediate typing
            this.focusSearchInput();
        }, 0);
        
        return container;
    }

    private setupEventListeners(container: HTMLElement): void {
        // Cache elements
        this.searchInput = container.querySelector('#search-input') as HTMLInputElement;
        this.replaceInput = container.querySelector('#replace-input') as HTMLInputElement;
        this.resultsContainer = container.querySelector('#search-results') as HTMLElement;
        this.statusElement = container.querySelector('#search-status') as HTMLElement;

        // Search button
        const searchBtn = container.querySelector('#search-btn') as HTMLButtonElement;
        searchBtn.addEventListener('click', () => this.performSearch());

        // Replace button
        const replaceBtn = container.querySelector('#replace-all-btn') as HTMLButtonElement;
        replaceBtn.addEventListener('click', () => this.performReplace());

        // Enter key in search input
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Option checkboxes
        const includeAllVersionsCheckbox = container.querySelector('#include-all-versions') as HTMLInputElement;
        const caseSensitiveCheckbox = container.querySelector('#case-sensitive') as HTMLInputElement;
        const searchContentCheckbox = container.querySelector('#search-content') as HTMLInputElement;
        const searchContextCheckbox = container.querySelector('#search-context') as HTMLInputElement;
        const searchConditionalCheckbox = container.querySelector('#search-conditional') as HTMLInputElement;

        includeAllVersionsCheckbox.addEventListener('change', (e) => {
            this.includeAllVersions = (e.target as HTMLInputElement).checked;
        });

        caseSensitiveCheckbox.addEventListener('change', (e) => {
            this.caseSensitive = (e.target as HTMLInputElement).checked;
        });

        searchContentCheckbox.addEventListener('change', (e) => {
            this.searchInContent = (e.target as HTMLInputElement).checked;
            this.updateReplaceButtonState();
        });

        searchContextCheckbox.addEventListener('change', (e) => {
            this.searchInContext = (e.target as HTMLInputElement).checked;
            this.updateReplaceButtonState();
        });

        searchConditionalCheckbox.addEventListener('change', (e) => {
            this.searchInConditional = (e.target as HTMLInputElement).checked;
            // Replace button state unaffected by conditional context (replace does not operate on conditional items)
        });

        // Enter key in replace input
        this.replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.performReplace();
            }
        });

        // Pagination buttons
        const prevPageBtn = container.querySelector('#prev-page-btn') as HTMLButtonElement;
        const nextPageBtn = container.querySelector('#next-page-btn') as HTMLButtonElement;

        prevPageBtn.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderResults();
            }
        });

        nextPageBtn.addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.renderResults();
            }
        });
    }

    /**
     * Perform the search
     */
    private performSearch(): void {
        const searchPattern: string = this.searchInput!.value.trim();

        const options: SearchOptions = {
            includeAllVersions: this.includeAllVersions,
            caseSensitive: this.caseSensitive,
            searchInContent: this.searchInContent,
            searchInContext: this.searchInContext,
            searchInConditionalContext: this.searchInConditional
        };

        this.showStatus('Searching...');
        this.currentResults = SearchService.searchInHierarchy(this.rootNode!, searchPattern, options);
        
        // Reset pagination
        this.currentPage = 1;
        this.totalPages = Math.max(1, Math.ceil(this.currentResults.length / this.resultsPerPage));
        
        this.renderResults();
        this.updateReplaceButtonState();
        this.updatePaginationUI();
    }

    /**
     * Perform global replace
     */
    private performReplace(): void {
        const searchPattern: string = this.searchInput!.value.trim();
        const replaceText: string = this.replaceInput!.value;

        const confirmed = confirm(
            `This will replace all occurrences of "${searchPattern}" with "${replaceText}" in the current node and all subnodes.\n\n` +
            `Search scope: ${this.searchInContent ? 'Content' : ''}${this.searchInContent && this.searchInContext ? ' + ' : ''}${this.searchInContext ? 'Context' : ''}\n` +
            `Versions: ${this.includeAllVersions ? 'All versions' : 'Master only'}\n\n` +
            `This action cannot be undone. Continue?`
        );

        if (!confirmed) {
            return;
        }

        const options: ReplaceOptions = {
            includeAllVersions: this.includeAllVersions,
            caseSensitive: this.caseSensitive,
            searchInContent: this.searchInContent,
            searchInContext: this.searchInContext,
            replaceText: replaceText
        };

        this.showStatus('Replacing...');
        const result: ReplaceResult = SearchService.replaceInHierarchy(this.rootNode!, searchPattern, options);
        
        this.showStatus(`Replaced ${result.totalReplacements} occurrences in ${result.nodeResults.length} nodes.`);
        
        // Trigger comprehensive UI update since content has changed
        if (result.totalReplacements > 0) {
            // Save changes to storage
            void this.saveChangesToStorage();
            
            // Trigger full UI redraw for current node details
            void this.triggerUIRedraw();
            
            // Emit tree update event for tree view refresh
            document.dispatchEvent(new CustomEvent('tree-update-needed', {
                detail: { reason: 'search-replace', replacements: result.totalReplacements }
            }));
        }
        
        // Refresh search results to show updated content
        this.performSearch();
    }

    /**
     * Render search results
     */
    private renderResults(): void {

        if (this.currentResults.length === 0) {
            this.resultsContainer!.innerHTML = '<div class="no-results">No matches found.</div>';
            this.showStatus('No matches found');
            return;
        }

        // Calculate pagination
        const startIndex: number = (this.currentPage - 1) * this.resultsPerPage;
        const endIndex: number = Math.min(startIndex + this.resultsPerPage, this.currentResults.length);
        const pageResults: SearchResult[] = this.currentResults.slice(startIndex, endIndex);

        // Group paginated results by node
        const resultsByNode = new Map<DocumentNode, SearchResult[]>();
        for (const result of pageResults) {
            if (!resultsByNode.has(result.node)) {
                resultsByNode.set(result.node, []);
            }
            resultsByNode.get(result.node)!.push(result);
        }

        let html = '';
        for (const [node, nodeResults] of resultsByNode) {
            const nodePath = this.getNodePath(node);
            html += `
                <div class="result-node">
                    <div class="result-node-header">
                        <strong>${this.escapeHtml(node.title || 'Untitled')}</strong>
                        <span class="result-node-path">${this.escapeHtml(nodePath)}</span>
                        <span class="result-count">${nodeResults.length} match${nodeResults.length === 1 ? '' : 'es'}</span>
                    </div>
                    <div class="result-paragraphs">
            `;

            for (const result of nodeResults) {
                const highlightedParagraph = this.highlightMatch(result.paragraph, result.matchStart, result.matchLength);
                const versionInfo = result.contentType === 'conditional'
                    ? 'Conditional (this node)'
                    : (result.version.tags.has('master') ? 'Master' : Array.from(result.version.tags).join(', '));
                
                html += `
                    <div class="result-paragraph" data-node-id="${node.id}" data-version-id="${result.version.id}">
                        <div class="result-meta">
                            <span class="result-content-type">${result.contentType}</span>
                            <span class="result-version">${versionInfo}</span>
                        </div>
                        <div class="result-text">${highlightedParagraph}</div>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        this.resultsContainer!.innerHTML = html;
        
        // Calculate total unique nodes for status
        const totalNodes = new Set(this.currentResults.map(r => r.node)).size;
        this.showStatus(`Found ${this.currentResults.length} matches in ${totalNodes} nodes (showing ${startIndex + 1}-${endIndex})`);

        // Add click handlers for result paragraphs
        this.resultsContainer!.querySelectorAll('.result-paragraph').forEach(element => {
            element.addEventListener('click', (e) => {
                const nodeId: string | undefined = (e.currentTarget as HTMLElement).dataset['nodeId'];
                this.openNodeInspector(nodeId!);
            });
        });
    }

    /**
     * Open NodeInspector for a specific node
     */
    private async openNodeInspector(nodeId: string): Promise<void> {
        // Find the node in the hierarchy
        const targetNode = this.findNodeById(this.rootNode!, nodeId);
        if (!targetNode) {
            console.error('Node not found for inspector:', nodeId);
            return;
        }

        try {
            const { NodeInspectorModal } = await import('./NodeInspectorModal');
            const modal = new NodeInspectorModal();
            modal.openWithNode(targetNode);
        } catch (error) {
            console.error('Failed to open node inspector:', error);
            alert('Failed to open node inspector. Please try again.');
        }
    }

    /**
     * Find node by ID in hierarchy
     */
    private findNodeById(node: DocumentNode, targetId: string): DocumentNode | null {
        if (node.id === targetId) {
            return node;
        }

        if (node.children) {
            for (const child of node.children) {
                const found = this.findNodeById(child, targetId);
                if (found) {
                    return found;
                }
            }
        }

        return null;
    }

    /**
     * Highlight match in paragraph
     */
    private highlightMatch(paragraph: string, matchStart: number, matchLength: number): string {
        const before = this.escapeHtml(paragraph.substring(0, matchStart));
        const match = this.escapeHtml(paragraph.substring(matchStart, matchStart + matchLength));
        const after = this.escapeHtml(paragraph.substring(matchStart + matchLength));
        
        return `${before}<mark class="search-highlight">${match}</mark>${after}`;
    }

    /**
     * Get readable path for a node
     */
    private getNodePath(node: DocumentNode): string {
        const path: string[] = [];
        let current: DocumentNode | null = node;
        
        // Build path by walking up through parent IDs
        while (current && current.parentId) {
            const parent: DocumentNode | null = this.findNodeById(this.rootNode!, current.parentId);
            if (parent) {
                path.unshift(parent.title || 'Untitled');
                current = parent;
            } else {
                break;
            }
        }
        
        return path.length > 0 ? path.join(' > ') : 'Root';
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show status message
     */
    private showStatus(message: string): void {
        this.statusElement!.textContent = message;
    }

    /**
     * Update replace button state
     */
    private updateReplaceButtonState(): void {
        const replaceBtn = document.querySelector('#replace-all-btn') as HTMLButtonElement;
        const hasSearchPattern: string = this.searchInput!.value.trim();
        const hasTargetContent: boolean = this.searchInContent || this.searchInContext;
        replaceBtn.disabled = !hasSearchPattern || !hasTargetContent;
    }

    /**
     * Focus the search input for immediate typing
     */
    private focusSearchInput(): void {
        if (this.searchInput) {
            this.searchInput.focus();
            // Select all text if there's any (useful for quick replacement)
            this.searchInput.select();
        }
    }

    /**
     * Update pagination UI
     */
    private updatePaginationUI(): void {
        const paginationContainer = document.querySelector('#pagination-container') as HTMLElement;
        const paginationInfoText = document.querySelector('#pagination-info-text') as HTMLElement;
        const pageInfo = document.querySelector('#page-info') as HTMLElement;
        const prevBtn = document.querySelector('#prev-page-btn') as HTMLButtonElement;
        const nextBtn = document.querySelector('#next-page-btn') as HTMLButtonElement;

        if (this.currentResults.length <= this.resultsPerPage) {
            // Hide pagination if all results fit on one page
            paginationContainer.style.display = 'none';
        } else {
            // Show and update pagination
            paginationContainer.style.display = 'flex';
            
            const startIndex: number = (this.currentPage - 1) * this.resultsPerPage + 1;
            const endIndex: number = Math.min(this.currentPage * this.resultsPerPage, this.currentResults.length);
            
            paginationInfoText.textContent = `Showing ${startIndex}-${endIndex} of ${this.currentResults.length} matches`;
            pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
            
            prevBtn.disabled = this.currentPage <= 1;
            nextBtn.disabled = this.currentPage >= this.totalPages;
        }
    }

    /**
     * Save changes to storage after replace operations
     */
    private async saveChangesToStorage(): Promise<void> {
        // Import and get the active project manager
        const { getActiveProject } = await import('../../state');
        const activeProject = getActiveProject();
        
        // Save the project to storage
        await activeProject!.saveToStorage();
    }

    /**
     * Trigger full UI redraw to reflect content changes
     */
    private async triggerUIRedraw(): Promise<void> {
        // Import the renderNodeDetails function to trigger UI redraw
        const { renderNodeDetails } = await import('../project-ui');
        
        // Trigger full node details redraw
        await renderNodeDetails();
    }

    private injectStyles(): void {
        const styles = `
            .search-modal-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .search-modal-header {
                padding: 1rem;
                border-bottom: 1px solid #e2e8f0;
                background: #f8fafc;
            }

            .search-modal-header h2 {
                margin: 0 0 0.5rem 0;
                color: #1e293b;
                font-size: 1.25rem;
            }

            .search-scope {
                color: #64748b;
                font-size: 0.875rem;
            }

            .search-controls {
                padding: 1rem;
                background: #ffffff;
                border-bottom: 1px solid #e2e8f0;
            }

            .search-input-group, .replace-input-group {
                display: flex;
                gap: 0.5rem;
                margin-bottom: 0.75rem;
            }

            .search-input, .replace-input {
                flex: 1;
                padding: 0.5rem;
                border: 1px solid #d1d5db;
                border-radius: 0.375rem;
                font-size: 0.875rem;
            }

            .search-input:focus, .replace-input:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .search-button, .replace-button {
                padding: 0.5rem 1rem;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 0.375rem;
                font-size: 0.875rem;
                cursor: pointer;
                white-space: nowrap;
            }

            .search-button:hover, .replace-button:hover:not(:disabled) {
                background: #2563eb;
            }

            .replace-button:disabled {
                background: #9ca3af;
                cursor: not-allowed;
            }

            .search-options {
                display: flex;
                gap: 1rem;
                flex-wrap: wrap;
                margin-bottom: 0.75rem;
            }

            .checkbox-label {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 0.875rem;
                color: #374151;
                cursor: pointer;
            }

            .search-status {
                font-size: 0.875rem;
                color: #6b7280;
                min-height: 1.25rem;
            }

            .search-results-container {
                flex: 1;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }

            .search-results {
                flex: 1;
                overflow-y: auto;
                padding: 1rem;
            }

            .no-results {
                text-align: center;
                color: #6b7280;
                font-style: italic;
                padding: 2rem;
            }

            .result-node {
                margin-bottom: 1.5rem;
                border: 1px solid #e5e7eb;
                border-radius: 0.5rem;
                overflow: hidden;
            }

            .result-node-header {
                background: #f9fafb;
                padding: 0.75rem 1rem;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .result-node-path {
                color: #6b7280;
                font-size: 0.875rem;
                flex: 1;
            }

            .result-count {
                background: #dbeafe;
                color: #1e40af;
                padding: 0.25rem 0.5rem;
                border-radius: 0.25rem;
                font-size: 0.75rem;
                font-weight: 500;
            }

            .result-paragraphs {
                background: white;
            }

            .result-paragraph {
                padding: 0.75rem 1rem;
                border-bottom: 1px solid #f3f4f6;
                cursor: pointer;
                transition: background-color 0.2s;
            }

            .result-paragraph:hover {
                background: #f8fafc;
            }

            .result-paragraph:last-child {
                border-bottom: none;
            }

            .result-meta {
                display: flex;
                gap: 0.75rem;
                margin-bottom: 0.5rem;
                font-size: 0.75rem;
            }

            .result-content-type {
                background: #e0f2fe;
                color: #0277bd;
                padding: 0.125rem 0.375rem;
                border-radius: 0.25rem;
                text-transform: capitalize;
            }

            .result-version {
                background: #f3e8ff;
                color: #7c3aed;
                padding: 0.125rem 0.375rem;
                border-radius: 0.25rem;
            }

            .result-text {
                font-size: 0.875rem;
                line-height: 1.5;
                color: #374151;
            }

            .search-highlight {
                background: #fef3c7;
                color: #92400e;
                padding: 0.125rem 0.25rem;
                border-radius: 0.25rem;
                font-weight: 500;
            }

            .pagination-container {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem;
                border-top: 1px solid #e5e7eb;
                background: #f9fafb;
                gap: 1rem;
            }

            .pagination-info {
                color: #6b7280;
                font-size: 0.875rem;
            }

            .pagination-controls {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .pagination-btn {
                padding: 0.5rem 1rem;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 0.375rem;
                font-size: 0.875rem;
                cursor: pointer;
                transition: background-color 0.2s;
            }

            .pagination-btn:hover:not(:disabled) {
                background: #2563eb;
            }

            .pagination-btn:disabled {
                background: #9ca3af;
                cursor: not-allowed;
            }

            #page-info {
                color: #374151;
                font-size: 0.875rem;
                font-weight: 500;
                min-width: 120px;
                text-align: center;
            }
        `;

        // Add styles to head if not already added
        if (!document.querySelector('#search-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'search-modal-styles';
            style.textContent = styles;
            document.head.appendChild(style);
        }
    }
}
