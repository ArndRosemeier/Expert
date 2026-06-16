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
     *
     * ANTI-FORESHADOWING POLICY (core, fragile — see Stateless_Generation_Logic_Documentation.md):
     * A node is deliberately given only BACKWARD-facing knowledge:
     *   - matching conditional/keyword context for itself and its ancestors,
     *   - the PREVIOUS node at its template level (continuity from what came before), and
     *   - its parent's outline ONLY when `includeParentContent` is true.
     * The NEXT node and (in the default sectioned flow) the full parent outline are
     * intentionally withheld. Giving the model the parent's whole outline lets it see
     * sibling content that hasn't happened yet, which caused the LLM to foreshadow and
     * plant hints toward later siblings and measurably worsened output. This was removed
     * on purpose; results without future knowledge are better, and predetermined sections
     * (the default) give each child a self-contained brief so it doesn't need the future.
     * `includeParentContent` is decided by the caller (UnifiedGenerationService.buildLoopInput):
     * it is FALSE whenever the parent was outlined into `===sections===`, which is the default.
     * Do NOT make parent content unconditional and do NOT add next-node content here.
     *
     * @param nodeId The ID of the node to compile context for.
     * @param rootNode The root node of the tree.
     * @param includeParentContent Whether to include parent's structural content (default: false).
     *        Only set true for the free-form (non-sectioned) outline path, which knowingly
     *        accepts future knowledge in exchange for a more globally-aware draft.
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

		// Anti-foreshadowing: the NEXT node is intentionally NEVER added to the context.
		// A node must not know what happens after it, or the model writes hints toward
		// future siblings. This omission is deliberate — do not "fix" it by adding next-node content.

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