import { DocumentNode } from '../DocumentNode';
import { TreeService } from './TreeService';

/**
 * ContextService handles simple context inheritance.
 * Contexts are now simply copied from parent to child nodes.
 */
export class ContextService {
    
    constructor(
        private treeService: TreeService
    ) {}



    /**
     * Gathers context for a specific node to guide content generation.
     * This method compiles only the immediate parent's content and context, plus sibling information.
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

        // 1. Add the current node's own context if it exists
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

        // 2. Add the parent's content (the outline). This is the most critical structural context.
        if (parent.content) {
            const parentLevelName = parent.template[parent.level] || `Level ${parent.level}`;
            contextParts.push(`STRUCTURAL CONTEXT FROM PARENT (${parentLevelName}: "${parent.title}"):\n---\n${parent.content}\n---`);
        }

        // 3. Add the list of all sibling titles to give a sense of scope.
        if (parent.children.length > 1) {
            const nodeLevelName = targetNode.template[targetNode.level] || `Level ${targetNode.level}`;
            const siblingTitles = parent.children.map(child => `- ${child.title} ${child.id === nodeId ? '(This node)' : ''}`).join('\n');
            contextParts.push(`SIBLING SCOPE (${nodeLevelName} nodes at this level):\n${siblingTitles}`);
        }

        // 4. Add full content of preceding siblings that have already been generated.
        const precedingSiblingContent = this.buildPrecedingSiblingContext(targetNode, parent);
        if (precedingSiblingContent) {
            contextParts.push(precedingSiblingContent);
        }

        return contextParts.join('\n\n====================\n\n');
    }

    /**
     * Collects context from the immediate parent only.
     * Used for UI context summaries to show inheritance information.
     * @param targetNode The node to collect parent context for.
     * @param rootNode The root node of the tree.
     * @returns Array with parent context string (empty if no parent or parent has no context).
     */
    public collectParentContextForSummary(targetNode: DocumentNode, rootNode: DocumentNode): string[] {
        const contextChain: string[] = [];
        
        if (!targetNode.parentId) {
            return contextChain;
        }
        
        const parent = this.treeService.findNodeById(targetNode.parentId, rootNode);
        if (parent && parent.context && parent.context.trim()) {
            const levelName = parent.template[parent.level] || `Level ${parent.level}`;
            contextChain.push(`PARENT (${levelName}: "${parent.title}"):\n---\n${parent.context}\n---`);
        }

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
                if (sibling && sibling.content) {
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

        // Parent context
        const parentContext = this.collectParentContextForSummary(node, rootNode);
        if (parentContext.length > 0) {
            contextInfo.push(`Inherited from parent`);
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
     * Checks if a node has minimal context available for generation.
     * @param nodeId The ID of the node to check.
     * @param rootNode The root node of the tree.
     * @returns True if the node has some context available.
     */
    public hasMinimalContext(nodeId: string, rootNode: DocumentNode): boolean {
        const context = this.compileNodeContext(nodeId, rootNode);
        return context.trim().length > 0;
    }
} 