import { BaseModal } from '../../ui/modals/core/BaseModal';
import { ModalConfig, ModalHooks } from '../../ui/modals/types/ModalTypes';
import { createElement } from '../../ui/modals/core/modal-utils';
import { DocumentNode } from '../../DocumentNode';
import * as state from '../../state';

export interface NodeSearchResult {
  node: DocumentNode;
  path: string;
  preview: string;
}

export interface NodeSearchModalConfig extends ModalConfig {
  onNodeSelected?: (node: DocumentNode) => void;
  searchScope?: 'current-project' | 'all-projects';
}

export class NodeSearchModal extends BaseModal {
  private searchInput: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private onNodeSelected: ((node: DocumentNode) => void) | undefined;
  private allNodes: { node: DocumentNode; projectTitle: string; projectId: string }[] = [];
  private searchScope: 'current-project' | 'all-projects';

  constructor(config: NodeSearchModalConfig, hooks: ModalHooks = {}) {
    const searchScope = config.searchScope ?? 'current-project';
    const title = searchScope === 'all-projects' 
      ? '🔍 Select Node Content (All Projects)'
      : '🔍 Select Node Content';
      
    super({
      title,
      closable: true,
      backdrop: true,
      width: '600px',
      height: '500px',
      ...config,
      id: config.id || 'node-search-modal'
    }, hooks);
    
    this.onNodeSelected = config.onNodeSelected;
    this.searchScope = searchScope;
  }

  /**
   * Initialize node data from the active project or all projects
   */
  private initializeNodes(): void {
    this.allNodes = [];

    if (this.searchScope === 'all-projects') {
      // Search across all projects
      const allProjects = state.getProjects();
      if (allProjects.length === 0) {
        console.warn('No projects available');
        return;
      }

      for (const project of allProjects) {
        this.collectNodes(project.rootNode, '', project.projectTitle, project.rootNode.id);
      }
    } else {
      // Search within current project only
      const activeProject = state.getActiveProject();
      if (!activeProject) {
        console.error('No active project available');
        return;
      }

      this.collectNodes(activeProject.rootNode, '', activeProject.projectTitle, activeProject.rootNode.id);
    }
  }

  /**
   * Recursively collect all nodes with their paths and project info
   */
  private collectNodes(node: DocumentNode, parentPath: string, projectTitle: string, projectId: string): void {
    const currentPath = parentPath ? `${parentPath} > ${node.title}` : node.title;
    
    // Add the current node if it has content
    if (node.content.trim()) {
      this.allNodes.push({
        node,
        projectTitle,
        projectId
      });
    }

    // Recursively add children
    for (const child of node.children) {
      this.collectNodes(child, currentPath, projectTitle, projectId);
    }
  }

  /**
   * Render the modal content
   */
  public render(): HTMLElement {
    const container = createElement('div', {
      classes: ['node-search-container'],
      attributes: {
        style: `
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 0;
        `
      }
    });

    // Search input
    const searchSection = createElement('div', {
      classes: ['search-section'],
      attributes: {
        style: `
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        `
      }
    });

    this.searchInput = createElement('input', {
      attributes: {
        type: 'text',
        placeholder: 'Search nodes by title or content...',
        style: `
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        `
      }
    });

    // Focus and border effects
    this.searchInput.addEventListener('focus', () => {
      this.searchInput!.style.borderColor = '#3b82f6';
    });
    this.searchInput.addEventListener('blur', () => {
      this.searchInput!.style.borderColor = '#d1d5db';
    });

    // Search on input
    this.searchInput.addEventListener('input', () => {
      this.performSearch();
    });

    searchSection.appendChild(this.searchInput);
    container.appendChild(searchSection);

    // Results area
    const resultsArea = createElement('div', {
      classes: ['results-area'],
      attributes: {
        style: `
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        `
      }
    });

    // Search results section
    const searchResultsSection = createElement('div', {
      classes: ['search-results-section']
    });

    const searchResultsTitle = createElement('h3', {
      content: '🔍 Search Results',
      attributes: {
        style: `
          margin: 0 0 0.75rem 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        `
      }
    });

    this.resultsContainer = createElement('div', {
      classes: ['results-container']
    });

    searchResultsSection.appendChild(searchResultsTitle);
    searchResultsSection.appendChild(this.resultsContainer);
    resultsArea.appendChild(searchResultsSection);

    container.appendChild(resultsArea);

    return container;
  }

  /**
   * Perform search based on input
   */
  private performSearch(): void {
    if (!this.searchInput || !this.resultsContainer) return;

    const query = this.searchInput.value.trim().toLowerCase();
    this.resultsContainer.innerHTML = '';

    if (!query) {
      const emptyMessage = createElement('div', {
        content: 'Type to search for nodes...',
        attributes: {
          style: `
            color: #6b7280;
            font-style: italic;
            padding: 0.5rem 0;
          `
        }
      });
      this.resultsContainer.appendChild(emptyMessage);
      return;
    }

    // Filter nodes based on title and content
    const matchingNodes = this.allNodes.filter(nodeData => 
      nodeData.node.title.toLowerCase().includes(query) || 
      nodeData.node.content.toLowerCase().includes(query)
    );

    if (matchingNodes.length === 0) {
      const noResults = createElement('div', {
        content: 'No matching nodes found',
        attributes: {
          style: `
            color: #6b7280;
            font-style: italic;
            padding: 0.5rem 0;
          `
        }
      });
      this.resultsContainer.appendChild(noResults);
      return;
    }

    // Show results (limit to first 20 for performance)
    const limitedResults = matchingNodes.slice(0, 20);
    for (const nodeData of limitedResults) {
      const nodeItem = this.createNodeItem(nodeData);
      this.resultsContainer.appendChild(nodeItem);
    }

    if (matchingNodes.length > 20) {
      const moreResults = createElement('div', {
        content: `... and ${matchingNodes.length - 20} more results`,
        attributes: {
          style: `
            color: #6b7280;
            font-size: 12px;
            padding: 0.5rem 0;
            text-align: center;
          `
        }
      });
      this.resultsContainer.appendChild(moreResults);
    }
  }

  /**
   * Create a clickable node item
   */
  private createNodeItem(nodeData: { node: DocumentNode; projectTitle: string; projectId: string }): HTMLElement {
    const { node, projectTitle } = nodeData;
    const path = this.getNodePath(node, projectTitle);
    const preview = this.getNodePreview(node.content);

    const item = createElement('div', {
      classes: ['node-item'],
      attributes: {
        style: `
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        `
      }
    });

    // Hover effects
    item.addEventListener('mouseenter', () => {
      item.style.borderColor = '#3b82f6';
      item.style.backgroundColor = '#eff6ff';
    });

    item.addEventListener('mouseleave', () => {
      item.style.borderColor = '#e5e7eb';
      item.style.backgroundColor = 'white';
    });

    // Click handler
    item.addEventListener('click', () => {
      this.selectNode(node);
    });

    const title = createElement('div', {
      content: node.title,
      attributes: {
        style: `
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.25rem;
        `
      }
    });

    const pathElement = createElement('div', {
      content: path,
      attributes: {
        style: `
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 0.5rem;
        `
      }
    });

    const previewElement = createElement('div', {
      content: preview,
      attributes: {
        style: `
          font-size: 13px;
          color: #4b5563;
          line-height: 1.4;
        `
      }
    });

    item.appendChild(title);
    item.appendChild(pathElement);
    item.appendChild(previewElement);

    return item;
  }

  /**
   * Get the path to a node
   */
  private getNodePath(targetNode: DocumentNode, projectTitle: string): string {
    if (this.searchScope === 'all-projects') {
      // For all-projects search, include project name in path
      const allProjects = state.getProjects();
      for (const project of allProjects) {
        if (project.projectTitle === projectTitle) {
          const path: string[] = [];
          
          const findPath = (node: DocumentNode, currentPath: string[]): boolean => {
            if (node === targetNode) {
              path.push(...currentPath, node.title);
              return true;
            }

            for (const child of node.children) {
              if (findPath(child, [...currentPath, node.title])) {
                return true;
              }
            }

            return false;
          };

          findPath(project.rootNode, []);
          const nodePath = path.slice(1).join(' > ') || targetNode.title; // Skip root node
          return `${projectTitle} > ${nodePath}`;
        }
      }
      return `${projectTitle} > ${targetNode.title}`;
    } else {
      // For current-project search, use existing logic without project name
      const activeProject = state.getActiveProject();
      if (!activeProject) return 'Unknown';

      const path: string[] = [];
      
      const findPath = (node: DocumentNode, currentPath: string[]): boolean => {
        if (node === targetNode) {
          path.push(...currentPath, node.title);
          return true;
        }

        for (const child of node.children) {
          if (findPath(child, [...currentPath, node.title])) {
            return true;
          }
        }

        return false;
      };

      findPath(activeProject.rootNode, []);
      return path.slice(1).join(' > ') || targetNode.title; // Skip root node
    }
  }

  /**
   * Get a preview of node content
   */
  private getNodePreview(content: string): string {
    const cleaned = content.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 100) return cleaned;
    return cleaned.substring(0, 100) + '...';
  }

  /**
   * Handle node selection
   */
  private selectNode(node: DocumentNode): void {
    if (this.onNodeSelected) {
      this.onNodeSelected(node);
    }
    void this.close();
  }

  /**
   * Override the open method to initialize nodes
   */
  public override async open(): Promise<void> {
    this.initializeNodes();
    await super.open();
    
    // Focus the search input after opening
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.focus();
      }
    }, 100);
  }
} 