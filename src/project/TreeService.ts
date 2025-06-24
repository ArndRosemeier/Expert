import { DocumentNode } from '../DocumentNode';

/**
 * TreeService handles all document tree operations and navigation.
 * Provides pure functions for tree manipulation, searching, and traversal.
 */
export class TreeService {
    
    /**
     * Finds a node in the document tree by its ID, starting from a given node.
     * @param id The ID of the node to find.
     * @param startNode The node to start the search from.
     * @returns The found DocumentNode, or null if not found.
     */
    public findNodeById(id: string, startNode: DocumentNode): DocumentNode | null {
        if (startNode.id === id) {
            return startNode;
        }

        for (const child of startNode.children) {
            const found = this.findNodeById(id, child);
            if (found) {
                return found;
            }
        }

        return null;
    }

    /**
     * Adds a new node to the document tree under a specified parent.
     * @param title The title of the new node.
     * @param parentId The ID of the parent node (null for root operations).
     * @param rootNode The root node of the tree.
     * @returns The newly created DocumentNode.
     */
    public addNode(title: string, parentId: string | null, rootNode: DocumentNode): DocumentNode {
        const parent = parentId ? this.findNodeById(parentId, rootNode) : rootNode;
        if (!parent) {
            throw new Error(`Parent node with ID "${parentId}" not found.`);
        }

        const newLevel = parent.level + 1;
        const newNode = new DocumentNode(newLevel, title, parent.id, parent.template);
        
        parent.children.push(newNode);
        
        return newNode;
    }

    /**
     * Removes a node (and all its descendants) from the tree.
     * @param id The ID of the node to remove.
     * @param rootNode The root node of the tree.
     * @returns True if the node was found and removed, otherwise false.
     */
    public removeNode(id: string, rootNode: DocumentNode): boolean {
        const nodeToRemove = this.findNodeById(id, rootNode);
        if (!nodeToRemove || !nodeToRemove.parentId) {
            // Cannot remove the root node or a node without a parent
            return false;
        }

        const parentNode = this.findNodeById(nodeToRemove.parentId, rootNode);
        if (!parentNode) {
            return false; // Should not happen if parentId is valid
        }

        const index = parentNode.children.findIndex(child => child.id === id);
        if (index > -1) {
            parentNode.children.splice(index, 1);
            return true;
        }

        return false;
    }

    /**
     * Gets the hierarchical path of a node from root to the specified node.
     * @param nodeId The ID of the node to get the path for.
     * @param rootNode The root node of the tree.
     * @returns A formatted string representing the path.
     */
    public getNodePath(nodeId: string, rootNode: DocumentNode): string {
        const path: string[] = [];
        let currentNode = this.findNodeById(nodeId, rootNode);
        
        while (currentNode) {
            const levelName = currentNode.template[currentNode.level] || `Level ${currentNode.level}`;
            path.unshift(`${levelName}: ${currentNode.title}`);
            currentNode = currentNode.parentId ? this.findNodeById(currentNode.parentId, rootNode) : null;
        }
        
        return path.join(' => ');
    }

    /**
     * Traverses all nodes in the tree and executes a callback for each.
     * @param rootNode The root node to start traversal from.
     * @param callback The function to execute for each node.
     */
    public traverseNodes(rootNode: DocumentNode, callback: (node: DocumentNode) => void): void {
        callback(rootNode);
        for (const child of rootNode.children) {
            this.traverseNodes(child, callback);
        }
    }

    /**
     * Finds the parent node of a given node.
     * @param nodeId The ID of the node to find the parent for.
     * @param rootNode The root node of the tree.
     * @returns The parent DocumentNode, or null if not found or is root.
     */
    public findParentNode(nodeId: string, rootNode: DocumentNode): DocumentNode | null {
        const node = this.findNodeById(nodeId, rootNode);
        if (!node || !node.parentId) {
            return null;
        }
        return this.findNodeById(node.parentId, rootNode);
    }

    /**
     * Gets the depth (level) of a node in the tree.
     * @param nodeId The ID of the node.
     * @param rootNode The root node of the tree.
     * @returns The depth of the node, or -1 if not found.
     */
    public getNodeDepth(nodeId: string, rootNode: DocumentNode): number {
        const node = this.findNodeById(nodeId, rootNode);
        return node ? node.level : -1;
    }

    /**
     * Gets all sibling nodes of a given node.
     * @param nodeId The ID of the node to get siblings for.
     * @param rootNode The root node of the tree.
     * @returns Array of sibling DocumentNodes (excluding the node itself).
     */
    public getSiblings(nodeId: string, rootNode: DocumentNode): DocumentNode[] {
        const node = this.findNodeById(nodeId, rootNode);
        if (!node || !node.parentId) {
            return []; // Root node has no siblings
        }

        const parent = this.findNodeById(node.parentId, rootNode);
        if (!parent) {
            return [];
        }

        return parent.children.filter(child => child.id !== nodeId);
    }

    /**
     * Checks if any node in the tree is currently generating content.
     * @param rootNode The root node to start checking from.
     * @returns true if any node is currently generating, false otherwise.
     */
    public isAnyNodeGenerating(rootNode: DocumentNode): boolean {
        const checkNode = (node: DocumentNode): boolean => {
            if (node.isGenerating) return true;
            return node.children.some(child => checkNode(child));
        };
        
        return checkNode(rootNode);
    }

    /**
     * Clears the generating flag from all nodes in the tree.
     * @param rootNode The root node to start clearing from.
     */
    public clearAllGeneratingFlags(rootNode: DocumentNode): void {
        const clearNode = (node: DocumentNode): void => {
            node.isGenerating = false;
            node.children.forEach(child => clearNode(child));
        };
        clearNode(rootNode);
    }

    /**
     * Gets all nodes at a specific level in the tree.
     * @param level The level to get nodes from.
     * @param rootNode The root node of the tree.
     * @returns Array of DocumentNodes at the specified level.
     */
    public getNodesAtLevel(level: number, rootNode: DocumentNode): DocumentNode[] {
        const nodesAtLevel: DocumentNode[] = [];
        
        this.traverseNodes(rootNode, (node) => {
            if (node.level === level) {
                nodesAtLevel.push(node);
            }
        });
        
        return nodesAtLevel;
    }

    /**
     * Gets all leaf nodes (nodes with no children) in the tree.
     * @param rootNode The root node to search from.
     * @returns Array of leaf DocumentNodes.
     */
    public getLeafNodes(rootNode: DocumentNode): DocumentNode[] {
        const leafNodes: DocumentNode[] = [];
        
        this.traverseNodes(rootNode, (node) => {
            if (node.children.length === 0) {
                leafNodes.push(node);
            }
        });
        
        return leafNodes;
    }
} 