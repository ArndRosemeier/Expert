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
     * Uses the new navigation approach with previous/next nodes instead of all siblings.
     * @param nodeId The ID of the node to compile context for.
     * @param rootNode The root node of the tree.
     * @param includeParentContent Whether to include parent's structural content (default: false)
     * @returns A string containing the contextual information.
     */
    public compileNodeContext(nodeId: string, rootNode: DocumentNode, includeParentContent: boolean = false): string {
        const targetNode = this.treeService.findNodeById(nodeId, rootNode);

        if (!targetNode) {
            return '';
        }

        const contextParts: string[] = [];

        // 0. Add matching conditional context items for this node and its ancestors
        try {
            const conditional = targetNode.assembleConditionalContext(targetNode, rootNode);
            if (conditional && conditional.trim()) {
                contextParts.push(`CONDITIONAL CONTEXT (matching items):\n---\n${conditional}\n---`);
            }
        } catch (e) {
            // Fail loudly to surface errors instead of silently ignoring
            throw e;
        }

        // Traditional context removed - conditional context is handled elsewhere

        // 2. Optionally add the parent's content (structural outline)
        if (includeParentContent && targetNode.parentId) {
            const parent = this.treeService.findNodeById(targetNode.parentId, rootNode);
            if (parent && parent.content) {
                const parentLevelName = parent.template[parent.level] || `Level ${parent.level}`;
                contextParts.push(`STRUCTURAL CONTEXT FROM PARENT (${parentLevelName}: "${parent.title}"):\n---\n${parent.content}\n---`);
            }
        }

        // 3. Add content from adjacent nodes at the same template level
        const previousNode = this.treeService.getPreviousNode(targetNode);
        if (previousNode && previousNode.content && previousNode.content.trim()) {
            const nodeLevelName = targetNode.template[targetNode.level] || `Level ${targetNode.level}`;
            contextParts.push(`PREVIOUS ${nodeLevelName.toUpperCase()} CONTENT ("${previousNode.title}"):\n---\n${previousNode.content}\n---`);
        }

        const nextNode = this.treeService.getNextNode(targetNode);
        if (nextNode && nextNode.content && nextNode.content.trim()) {
            const nodeLevelName = targetNode.template[targetNode.level] || `Level ${targetNode.level}`;
            contextParts.push(`NEXT ${nodeLevelName.toUpperCase()} CONTENT ("${nextNode.title}"):\n---\n${nextNode.content}\n---`);
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
    public collectParentContextForSummary(targetNode: DocumentNode, _rootNode: DocumentNode): string[] {
        const contextChain: string[] = [];
        
        if (!targetNode.parentId) {
            return contextChain;
        }
        
        // Traditional parent context removed - conditional context is handled elsewhere
        return contextChain;
    }

    // REMOVED: buildSiblingContext, buildParentContext, buildPrecedingSiblingContext
    // These methods are replaced by the new getPreviousNode/getNextNode approach in compileNodeContext

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
        
        // Traditional context removed - using conditional context system

        // Traditional parent context removed

        // Adjacent node context (new approach)
        const previousNode = this.treeService.getPreviousNode(node);
        if (previousNode && previousNode.content && previousNode.content.trim()) {
            contextInfo.push(`Previous node: ${previousNode.content.length} chars`);
        }
        
        const nextNode = this.treeService.getNextNode(node);
        if (nextNode && nextNode.content && nextNode.content.trim()) {
            contextInfo.push(`Next node: ${nextNode.content.length} chars`);
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