import { DocumentNode } from '../../DocumentNode';
import { getAllDescendants } from '../../ProjectUtils';
import { findProjectByNode } from '../../state';

/**
 * Reusable UI element for selecting nodes in a tree structure.
 * Usage:
 *   const tree = new SelectableNodeTree(rootNode, containerElement);
 *   tree.render();
 *   const selected = tree.getSelectedNodes();
 */
export class SelectableNodeTree {
    private rootNode: DocumentNode;
    private container: HTMLElement;
    private checkboxMap: Map<string, HTMLInputElement> = new Map();
    private nodeMap: Map<string, DocumentNode> = new Map();
    private collapsedNodeIds: Set<string> = new Set();

    /**
     * @param rootNode The root DocumentNode for the tree
     * @param container The container element to render into
     */
    constructor(rootNode: DocumentNode, container: HTMLElement) {
        this.rootNode = rootNode;
        this.container = container;
    }

    /**
     * Render the tree view and toggle buttons.
     */
    render() {
        this.checkboxMap.clear();
        this.nodeMap.clear();
        this.container.innerHTML = '';

        // Pre-populate nodeMap with all descendants for efficient lookups
        const allNodes = getAllDescendants(this.rootNode);
        allNodes.forEach(node => {
            this.nodeMap.set(node.id, node);
        });

        // Render the tree
        const treeRoot = document.createElement('div');
        treeRoot.className = 'selectable-node-tree-root';
        this.renderNode(this.rootNode, treeRoot);
        this.container.appendChild(treeRoot);
    }

    private renderNode(node: DocumentNode, parentEl: HTMLElement) {
        const indent = node.level * 20;
        const hasChildren = node.children.length > 0;
        const isCollapsed = this.collapsedNodeIds.has(node.id);

        const row = document.createElement('div');
        row.className = 'selectable-tree-item';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.paddingLeft = `${indent}px`;
        row.style.position = 'relative';
        row.style.userSelect = 'none';
        row.style.fontSize = '1em';
        row.style.lineHeight = '1.7em';

        // Collapse/expand chevron
        if (hasChildren) {
            const chevron = document.createElement('span');
            chevron.textContent = isCollapsed ? '▶' : '▼';
            chevron.style.display = 'inline-block';
            chevron.style.width = '1.2em';
            chevron.style.height = '1.2em';
            chevron.style.marginRight = '0.2em';
            chevron.style.cursor = 'pointer';
            chevron.style.transition = 'color 0.15s';
            chevron.style.color = '#6b7280';
            chevron.addEventListener('mouseenter', () => chevron.style.color = '#2563eb');
            chevron.addEventListener('mouseleave', () => chevron.style.color = '#6b7280');
            chevron.title = isCollapsed ? 'Expand' : 'Collapse';
            chevron.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isCollapsed) {
                    this.collapsedNodeIds.delete(node.id);
                } else {
                    this.collapsedNodeIds.add(node.id);
                }
                this.render();
            });
            // Double-click: collapse/expand all nodes at this level
            chevron.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                // Determine if we want to collapse or expand: if any at this level are expanded, collapse all; else expand all
                // Get project root to use centralized level collection
        const projectManager = findProjectByNode(node);
        if (!projectManager) return;
        const allNodesAtLevel = projectManager.getTreeService().getNodesAtTemplateLevel(projectManager.rootNode, node.level);
        const nodesAtLevel = allNodesAtLevel.filter(n => n.children.length > 0);
                const anyExpanded = nodesAtLevel.some(n => !this.collapsedNodeIds.has(n.id));
                this.toggleCollapseAtLevel(node.level, anyExpanded); // collapse if any expanded, else expand all
                this.render();
            });
            row.appendChild(chevron);
        } else {
            // For alignment, add a spacer
            const spacer = document.createElement('span');
            spacer.style.display = 'inline-block';
            spacer.style.width = '1.2em';
            spacer.style.marginRight = '0.2em';
            row.appendChild(spacer);
        }

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset['nodeId'] = node.id;
        this.checkboxMap.set(node.id, checkbox);
        // Note: nodeMap is already populated in render() using getAllDescendants

        // Single click: toggle only this node
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        // Double click: toggle this node and all descendants
        checkbox.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const checked = !checkbox.checked;
            this.setCheckedRecursive(node, checked);
        });

        // Node title
        const title = document.createElement('span');
        title.textContent = node.title;
        title.style.marginLeft = '0.5em';

        row.appendChild(checkbox);
        row.appendChild(title);
        parentEl.appendChild(row);

        // Children (only if not collapsed)
        if (hasChildren && !isCollapsed) {
            node.children.forEach(child => this.renderNode(child, parentEl));
        }
    }

    private setCheckedRecursive(node: DocumentNode, checked: boolean) {
        // Get all descendants of this node using the centralized function
        const descendants = getAllDescendants(node);
        
        // Set checkbox state for all descendants
        descendants.forEach(descendant => {
            const cb = this.checkboxMap.get(descendant.id);
            if (cb) cb.checked = checked;
        });
    }

    public toggleAllAtLevel(level: number) {
        // Find all nodes at this level
        this.nodeMap.forEach((node, id) => {
            if (node.level === level) {
                const cb = this.checkboxMap.get(id);
                if (cb) cb.checked = !cb.checked;
            }
        });
    }

    /**
     * Highlights a node by id (adds 'tree-batch-active' class to its row if visible and not collapsed)
     */
    public highlightNode(nodeId: string) {
        // Remove previous highlights
        const prev = this.container.querySelector('.tree-batch-active');
        if (prev) prev.classList.remove('tree-batch-active');
        // Find the row for this node
        const rows = this.container.querySelectorAll('.selectable-tree-item');
        for (const row of Array.from(rows)) {
            const cb = row.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
            if (cb && cb.dataset['nodeId'] === nodeId) {
                row.classList.add('tree-batch-active');
                break;
            }
        }
    }

    /**
     * Returns all selected nodes (whose checkboxes are checked).
     */
    getSelectedNodes(): DocumentNode[] {
        const selected: DocumentNode[] = [];
        this.checkboxMap.forEach((cb, id) => {
            if (cb.checked) {
                const node = this.nodeMap.get(id);
                if (node) selected.push(node);
            }
        });
        return selected;
    }

    /**
     * Collapse or expand all nodes at a given level.
     * @param level The hierarchy level
     * @param collapse If true, collapse all; if false, expand all
     */
    public toggleCollapseAtLevel(level: number, collapse: boolean) {
        this.nodeMap.forEach((node, id) => {
            if (node.level === level && node.children.length > 0) {
                if (collapse) {
                    this.collapsedNodeIds.add(id);
                } else {
                    this.collapsedNodeIds.delete(id);
                }
            }
        });
    }

    /**
     * Select all nodes in the tree.
     */
    public selectAll() {
        this.setCheckedRecursive(this.rootNode, true);
    }

    /**
     * Deselect all nodes in the tree.
     */
    public deselectAll() {
        this.setCheckedRecursive(this.rootNode, false);
    }
} 