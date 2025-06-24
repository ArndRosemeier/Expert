import { DocumentNode } from '../DocumentNode';
import { TreeService } from './TreeService';

/**
 * ContextService handles all context building and hierarchical inheritance.
 * Compiles rich contextual information for node generation by combining
 * ancestral context, sibling context, and parent content.
 */
export class ContextService {
    
    constructor(private treeService: TreeService) {}

    /**
     * Gathers rich, hierarchical context for a specific node to guide content generation.
     * This method compiles the direct parent's content and full content of preceding siblings.
     * Modern LLMs have large context windows, so we use direct content for maximum precision.
     * @param nodeId The ID of the node to compile context for.
     * @param rootNode The root node of the tree.
     * @returns A string containing the contextual information.
     */
    public compileNodeContext(nodeId: string, rootNode: DocumentNode): string {
        const targetNode = this.treeService.findNodeById(nodeId, rootNode);

        if (!targetNode) {
            return '';
        }

        const contextParts: string[] = [];

        // 1. Add inherited context from all ancestors (root to immediate parent)
        const ancestralContext = this.collectAncestralContext(targetNode, rootNode);
        if (ancestralContext.length > 0) {
            contextParts.push("ANCESTRAL CONTEXT (inherited from hierarchy):");
            contextParts.push(ancestralContext.join('\n\n'));
        }

        // 2. Add the current node's own context if it exists
        if (targetNode.context && targetNode.context.trim()) {
            const nodeLevelName = targetNode.template[targetNode.level] || `Level ${targetNode.level}`;
            contextParts.push(`CURRENT NODE CONTEXT (${nodeLevelName}: "${targetNode.title}"):\n---\n${targetNode.context}\n---`);
        }

        // Only continue with parent/sibling context if node has a parent
        if (!targetNode.parentId) {
            return contextParts.join('\n\n====================\n\n');
        }

        const parent = this.treeService.findNodeById(targetNode.parentId, rootNode);
        if (!parent) {
            return contextParts.join('\n\n====================\n\n');
        }

        // 3. Add the parent's content (the outline). This is the most critical structural context.
        if (parent.content) {
            const parentLevelName = parent.template[parent.level] || `Level ${parent.level}`;
            contextParts.push(`STRUCTURAL CONTEXT FROM PARENT (${parentLevelName}: "${parent.title}"):\n---\n${parent.content}\n---`);
        }

        // 4. Add the list of all sibling titles to give a sense of scope.
        if (parent.children.length > 1) {
            const nodeLevelName = targetNode.template[targetNode.level] || `Level ${targetNode.level}`;
            const siblingTitles = parent.children.map(child => `- ${child.title} ${child.id === nodeId ? '(This node)' : ''}`).join('\n');
            contextParts.push(`SIBLING SCOPE (${nodeLevelName} nodes at this level):\n${siblingTitles}`);
        }

        // 5. Add full content of preceding siblings that have already been generated.
        const precedingSiblingContent = this.buildPrecedingSiblingContext(targetNode, parent);
        if (precedingSiblingContent) {
            contextParts.push(precedingSiblingContent);
        }

        return contextParts.join('\n\n====================\n\n');
    }

    /**
     * Collects context from all ancestors of a node, from root down to immediate parent.
     * This creates an inheritance chain where child nodes benefit from all ancestral context.
     * @param targetNode The node to collect ancestral context for.
     * @param rootNode The root node of the tree.
     * @returns Array of context strings from ancestors.
     */
    public collectAncestralContext(targetNode: DocumentNode, rootNode: DocumentNode): string[] {
        const contextChain: string[] = [];
        
        // Build the path from root to parent (excluding the target node itself)
        const ancestorPath: DocumentNode[] = [];
        let currentNode = targetNode.parentId ? this.treeService.findNodeById(targetNode.parentId, rootNode) : null;
        
        // Walk up to build the ancestor chain
        while (currentNode) {
            ancestorPath.unshift(currentNode); // Add to front to get root-to-parent order
            currentNode = currentNode.parentId ? this.treeService.findNodeById(currentNode.parentId, rootNode) : null;
        }

        // Process each ancestor's context
        ancestorPath.forEach((ancestor, index) => {
            if (ancestor.context && ancestor.context.trim()) {
                const levelName = ancestor.template[ancestor.level] || `Level ${ancestor.level}`;
                const depth = index === 0 ? 'ROOT' : `LEVEL ${index}`;
                contextChain.push(`${depth} (${levelName}: "${ancestor.title}"):\n---\n${ancestor.context}\n---`);
            }
        });

        return contextChain;
    }

    /**
     * Builds context from sibling nodes that appear before the target node.
     * @param targetNode The node to build sibling context for.
     * @param rootNode The root node of the tree.
     * @returns Formatted sibling context string or empty string.
     */
    public buildSiblingContext(targetNode: DocumentNode, rootNode: DocumentNode): string {
        if (!targetNode.parentId) {
            return '';
        }

        const parent = this.treeService.findNodeById(targetNode.parentId, rootNode);
        if (!parent) {
            return '';
        }

        return this.buildPrecedingSiblingContext(targetNode, parent);
    }

    /**
     * Builds context from the parent node's content.
     * @param targetNode The node to build parent context for.
     * @param rootNode The root node of the tree.
     * @returns Formatted parent context string or empty string.
     */
    public buildParentContext(targetNode: DocumentNode, rootNode: DocumentNode): string {
        if (!targetNode.parentId) {
            return '';
        }

        const parent = this.treeService.findNodeById(targetNode.parentId, rootNode);
        if (!parent || !parent.content) {
            return '';
        }

        const parentLevelName = parent.template[parent.level] || `Level ${parent.level}`;
        return `STRUCTURAL CONTEXT FROM PARENT (${parentLevelName}: "${parent.title}"):\n---\n${parent.content}\n---`;
    }

    /**
     * Builds content from preceding siblings that have already been generated.
     * @param targetNode The target node.
     * @param parent The parent node containing siblings.
     * @returns Formatted preceding sibling content or empty string.
     */
    private buildPrecedingSiblingContext(targetNode: DocumentNode, parent: DocumentNode): string {
        const precedingSiblingContent: string[] = [];
        const siblingIndex = parent.children.findIndex(child => child.id === targetNode.id);

        if (siblingIndex > 0) {
            precedingSiblingContent.push("CONTENT FROM PRECEDING SIBLINGS:");
            for (let i = 0; i < siblingIndex; i++) {
                const sibling = parent.children[i];
                if (sibling.content) {
                    precedingSiblingContent.push(`Content for "${sibling.title}":\n---\n${sibling.content}\n---`);
                }
            }
        }
        
        // Return only if there's more than just the header
        return precedingSiblingContent.length > 1 ? precedingSiblingContent.join('\n\n') : '';
    }

    /**
     * Gets context summary for a node (for UI display).
     * @param nodeId The ID of the node.
     * @param rootNode The root node of the tree.
     * @returns Brief context summary.
     */
    public getContextSummary(nodeId: string, rootNode: DocumentNode): string {
        const node = this.treeService.findNodeById(nodeId, rootNode);
        if (!node) {
            return 'Node not found';
        }

        const contextInfo: string[] = [];
        
        // Own context
        if (node.context && node.context.trim()) {
            contextInfo.push(`Own context: ${node.context.length} chars`);
        }

        // Ancestral context
        const ancestralContext = this.collectAncestralContext(node, rootNode);
        if (ancestralContext.length > 0) {
            contextInfo.push(`Inherited from ${ancestralContext.length} ancestors`);
        }

        // Parent context
        if (node.parentId) {
            const parent = this.treeService.findNodeById(node.parentId, rootNode);
            if (parent && parent.content) {
                contextInfo.push(`Parent content: ${parent.content.length} chars`);
            }
        }

        return contextInfo.length > 0 ? contextInfo.join(', ') : 'No context available';
    }

    /**
     * Validates that a node has sufficient context for generation.
     * @param nodeId The ID of the node to validate.
     * @param rootNode The root node of the tree.
     * @returns true if node has sufficient context, false otherwise.
     */
    public hasMinimalContext(nodeId: string, rootNode: DocumentNode): boolean {
        const context = this.compileNodeContext(nodeId, rootNode);
        return context.trim().length > 0;
    }
} 