import { DocumentNode } from '../DocumentNode';
import { TreeService } from './TreeService';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';

/**
 * ContextService handles all context building and hierarchical inheritance.
 * Compiles rich contextual information for node generation by combining
 * ancestral context, sibling context, and parent content.
 */
export class ContextService {
    
    constructor(
        private treeService: TreeService,
        private openRouterClient?: OpenRouterClient,
        private settingsManager?: SettingsManager
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

        // 2. Add the immediate parent's context if it exists
        if (parent.context && parent.context.trim()) {
            const parentLevelName = parent.template[parent.level] || `Level ${parent.level}`;
            contextParts.push(`PARENT CONTEXT (${parentLevelName}: "${parent.title}"):\n---\n${parent.context}\n---`);
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
     * Validates that a node has sufficient context for generation.
     * @param nodeId The ID of the node to validate.
     * @param rootNode The root node of the tree.
     * @returns true if node has sufficient context, false otherwise.
     */
    public hasMinimalContext(nodeId: string, rootNode: DocumentNode): boolean {
        const context = this.compileNodeContext(nodeId, rootNode);
        return context.trim().length > 0;
    }

    /**
     * Synthesizes context by combining parent context with node content.
     * This distills the parent context to only what's relevant while incorporating
     * new concepts introduced in the node's content.
     * @param nodeId The ID of the node to synthesize context for.
     * @param rootNode The root node of the tree.
     * @returns The synthesized context string, or null if synthesis failed.
     */
    public async synthesizeContext(nodeId: string, rootNode: DocumentNode): Promise<string | null> {
        if (!this.openRouterClient || !this.settingsManager) {
            console.warn('ContextService: OpenRouterClient or SettingsManager not available for context synthesis');
            return null;
        }

        const node = this.treeService.findNodeById(nodeId, rootNode);
        if (!node) {
            console.error(`ContextService: Node ${nodeId} not found`);
            return null;
        }

        // Get parent context - use only the parent's own context field, not compiled context
        let parentContext = '';
        if (node.parentId) {
            const parent = this.treeService.findNodeById(node.parentId, rootNode);
            if (parent && parent.context) {
                parentContext = parent.context;
            }
        }

        // Node's content is required for synthesis
        if (!node.content || node.content.trim() === '') {
            console.warn(`ContextService: Node ${nodeId} has no content for synthesis`);
            return null;
        }

        try {
            const prompts = this.settingsManager.getPrompts();
            const prompt = prompts.context_synthesis_user
                .replace(/{{parent_context}}/g, parentContext || 'No parent context available.')
                .replace(/{{node_content}}/g, node.content);

            // Use the editor model for context synthesis as it's good at distilling and combining information
            const synthesizedContext = await this.openRouterClient.chat('editor', prompt);
            
            if (synthesizedContext && synthesizedContext.trim() !== '') {
                return synthesizedContext.trim();
            } else {
                console.warn(`ContextService: Empty response from context synthesis for node ${nodeId}`);
                return null;
            }
        } catch (error) {
            console.error(`ContextService: Failed to synthesize context for node ${nodeId}:`, error);
            return null;
        }
    }
} 