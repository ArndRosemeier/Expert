import { DocumentNode } from '../DocumentNode';
import { findProjectByNode } from '../state';

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
     * Gets children of a node sorted by timestamp for deterministic ordering.
     * @param node The parent node.
     * @returns Array of children sorted by timestamp (oldest first).
     */
    public getSortedChildren(node: DocumentNode): DocumentNode[] {
        return [...node.children].sort((a, b) => {
            const aMasterVersion = a.getMasterVersion()!;
            const bMasterVersion = b.getMasterVersion()!;
            
            return aMasterVersion.timestamp.getTime() - bMasterVersion.timestamp.getTime();
        });
    }

    /**
     * Adds a new node to the document tree under a specified parent.
     * @param title The title of the new node.
     * @param parentId The ID of the parent node (null for root operations).
     * @param rootNode The root node of the tree.
     * @param creatorModel Optional model name that created this node.
     * @param childIndex Optional child index for selective context copying (1-based, used when creating multiple children)
     * @returns The newly created DocumentNode.
     */
    public addNode(title: string, parentId: string | null, rootNode: DocumentNode, creatorModel?: string, childIndex?: number): DocumentNode {
        const parent = parentId ? this.findNodeById(parentId, rootNode) : rootNode;
        if (!parent) {
            throw new Error(`Parent node with ID "${parentId}" not found.`);
        }

        const newLevel = parent.level + 1;
        const newNode = new DocumentNode(newLevel, title, parent.id, parent.template);
        
        // Inherit context from parent with selective copying
        if (parent.context) {
            const processedContext = this.processSelectiveContext(parent.context, childIndex);
            newNode.setContext(processedContext, 'inherited');
        }
        
        if (creatorModel) {
            // Set creator model in the master version's metadata
            const masterVersion = newNode.getMasterVersion();
            if (masterVersion) {
                masterVersion.metadata = masterVersion.metadata || {};
                masterVersion.metadata['creatorModel'] = creatorModel;
            }
        }
        
        parent.children.push(newNode);
        
        return newNode;
    }

    /**
     * Process context with selective copying based on number ranges
     * @param context The parent context to process
     * @param childIndex The 1-based index of the child being created (optional)
     * @returns Processed context with selective items based on child index
     */
    private processSelectiveContext(context: string, childIndex?: number): string {
        if (!context || !childIndex) {
            // If no child index provided, return original context (backwards compatibility)
            return context;
        }

        // Split context into paragraphs (context items)
        const contextItems = context.split('\n\n').filter(item => item.trim());
        const processedItems: string[] = [];

        for (const item of contextItems) {
            const processedItem = this.processContextItem(item.trim(), childIndex);
            if (processedItem !== null) {
                processedItems.push(processedItem);
            }
        }

        return processedItems.join('\n\n');
    }

    /**
     * Process a single context item for selective copying
     * @param item The context item to process
     * @param childIndex The 1-based index of the child being created
     * @returns Processed item string, or null if item should be excluded
     */
    private processContextItem(item: string, childIndex: number): string | null {
        // Must start with a star to be considered for selective copying
        if (!item.startsWith('*')) {
            return item;
        }

        // After the initial '*', extract a prefix made of digits, commas, dashes, plus and spaces
        // Example accepted prefixes: "2-5", "1,3,5", "1, 3, 5", "10", "2 - 20", "2+"
        const afterStar = item.slice(1);
        let endIndex = 0;
        while (endIndex < afterStar.length) {
            const ch = afterStar.charAt(endIndex);
            if (!/[0-9,\-\+\s]/.test(ch)) break;
            endIndex++;
        }

        const rawRange = afterStar.slice(0, endIndex).trim() || '';

        // If there was no valid range immediately after '*', treat as normal context item
        if (!rawRange || !/^[0-9,\-\+\s]+$/.test(rawRange)) {
            return item;
        }

        // The remaining part is the content; optionally skip a separator like ':', '-', '–', '—' and following spaces/newlines
        let content = afterStar.slice(endIndex);
        content = content.replace(/^\s*[:\-–—]?\s*/, '');

        // Parse the number range and check if child index matches
        if (this.isIndexInRange(childIndex, rawRange)) {
            // Child index matches, include item but replace pattern with just '*'
            return `*${content}`;
        }
        
        // Child index doesn't match, exclude item
        return null;
    }

    /**
     * Check if a child index falls within a number range specification
     * @param childIndex The 1-based child index to check
     * @param rangeString The range specification (e.g., "1,3,5" or "2-5" or "3")
     * @returns True if index is in range, false otherwise
     */
    private isIndexInRange(childIndex: number, rangeString: string): boolean {
        // Handle open-ended start: "N+" means N to infinity
        const plusMatch = rangeString.match(/^(\d+)\s*\+$/);
        if (plusMatch) {
            const start = parseInt(plusMatch[1]!, 10);
            if (!isNaN(start)) {
                return childIndex >= start;
            }
        }

        // Handle comma-separated list (e.g., "1,3,5" or "1, 3, 5")
        if (rangeString.includes(',')) {
            const numbers = rangeString.split(',')
                .map(n => parseInt(n.trim(), 10))
                .filter(n => !isNaN(n));
            return numbers.includes(childIndex);
        }

        // Handle range (e.g., "2-5")
        if (rangeString.includes('-')) {
            const parts = rangeString.split('-').map(n => parseInt(n.trim(), 10));
            if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
                const start = parts[0];
                const end = parts[1];
                if (!isNaN(start) && !isNaN(end)) {
                    return childIndex >= start && childIndex <= end;
                }
            }
        }

        // Handle single number (e.g., "3")
        const singleNumber = parseInt(rangeString.trim(), 10);
        if (!isNaN(singleNumber)) {
            return childIndex === singleNumber;
        }

        // If parsing fails, include by default (safe fallback)
        return true;
    }

    /**
     * Test function for selective context logic (development/debugging only)
     * This function can be used to verify the selective context copying works correctly
     */
    public testSelectiveContext(context: string, childIndex: number): string {
        return this.processSelectiveContext(context, childIndex);
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
            const rawLevelName = (currentNode.template[currentNode.level] || `Level ${currentNode.level}`).trim();
            
            // Extract just the base name (remove numbers)
            // Pattern: "Part 3" -> "Part", "Chapter 10" -> "Chapter"
            const match = rawLevelName.match(/^(\w+)(?:\s+\d+)?$/);
            const levelName = (match && match[1] ? match[1] : rawLevelName).trim();
            
            // Trim both level name and node title to remove any leading/trailing whitespace
            const cleanTitle = currentNode.title.trim();
            path.unshift(`${levelName}: ${cleanTitle}`);
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
     * CENTRALIZED LEVEL-BASED NODE COLLECTION
     * Gets all nodes at a specific template level within a given scope.
     * This is the single function that handles all level-based node collection needs:
     * - Absolute level: getNodesAtTemplateLevel(projectRoot, 2) → all level 2 nodes
     * - Relative level: getNodesAtTemplateLevel(node, node.level + 2) → nodes 2 levels below
     * - Siblings: getNodesAtTemplateLevel(projectRoot, node.level) → all nodes at same level
     * 
     * @param scopeRoot The root node defining the search scope (project root or any subtree)
     * @param absoluteLevel The absolute template level to find (0 = project root, 1 = first level, etc.)
     * @returns Array of DocumentNodes at the specified absolute level within the scope
     */
    public getNodesAtTemplateLevel(scopeRoot: DocumentNode, absoluteLevel: number): DocumentNode[] {
        const nodesAtLevel: DocumentNode[] = [];
        
        this.traverseNodes(scopeRoot, (node) => {
            if (node.level === absoluteLevel) {
                nodesAtLevel.push(node);
            }
        });
        
        return nodesAtLevel;
    }

    /**
     * Gets the previous node at the same template level as the given node.
     * Uses the established getNodesAtTemplateLevel function to find all siblings.
     * @param node The reference node
     * @returns The previous node at the same level, or null if node is first or not found
     */
    public getPreviousNode(node: DocumentNode): DocumentNode | null {
        // Find the project that contains this node
        const projectManager = findProjectByNode(node);
        if (!projectManager) {
            return null;
        }

        // Get all nodes at the same level using the centralized function
        const siblingsAtLevel = this.getNodesAtTemplateLevel(projectManager.rootNode, node.level);
        
        // Find the index of the current node
        const currentIndex = siblingsAtLevel.findIndex(sibling => sibling.id === node.id);
        
        // Return previous node, or null if at beginning or not found
        if (currentIndex <= 0) {
            return null;
        }
        
        return siblingsAtLevel[currentIndex - 1] || null;
    }

    /**
     * Gets the next node at the same template level as the given node.
     * Uses the established getNodesAtTemplateLevel function to find all siblings.
     * @param node The reference node
     * @returns The next node at the same level, or null if node is last or not found
     */
    public getNextNode(node: DocumentNode): DocumentNode | null {
        // Find the project that contains this node
        const projectManager = findProjectByNode(node);
        if (!projectManager) {
            return null;
        }

        // Get all nodes at the same level using the centralized function
        const siblingsAtLevel = this.getNodesAtTemplateLevel(projectManager.rootNode, node.level);
        
        // Find the index of the current node
        const currentIndex = siblingsAtLevel.findIndex(sibling => sibling.id === node.id);
        
        // Return next node, or null if at end or not found
        if (currentIndex === -1 || currentIndex >= siblingsAtLevel.length - 1) {
            return null;
        }
        
        return siblingsAtLevel[currentIndex + 1] || null;
    }

// REMOVED: getNodesAtLevel - replaced with getNodesAtTemplateLevel

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