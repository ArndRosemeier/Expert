import { DocumentNode } from '../DocumentNode';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';

/**
 * ContextExtractionService handles extracting specific types of information
 * from document nodes and their hierarchies using AI analysis.
 */
export class ContextExtractionService {
    
    constructor(
        private openRouterClient: OpenRouterClient,
        private settingsManager: SettingsManager
    ) {}

    /**
     * Extracts specific context information from a node and its descendants.
     * @param node The root node to extract from
     * @param extractionPrompt What to extract (e.g., "characters", "places", "themes")
     * @param depth How deep to traverse (0=only this node, 1=include children, 2=include grandchildren, etc.)
     * @returns Extracted context information
     */
    public async extractContext(
        node: DocumentNode, 
        extractionPrompt: string, 
        depth: number = 0
    ): Promise<string> {
        // Collect content from the node hierarchy based on depth
        const contentToAnalyze = this.collectContentAtDepth(node, depth);
        
        if (!contentToAnalyze.trim()) {
            throw new Error('No content found to extract from at the specified depth.');
        }

        // Create the extraction prompt
        const fullPrompt = this.createExtractionPrompt(extractionPrompt, contentToAnalyze, node.title);
        
        // Use the OpenRouter client to perform the extraction
        const result = await this.openRouterClient.chat('editor', fullPrompt);

        return result.trim();
    }

    /**
     * Collects content from a node and its descendants up to the specified depth.
     * @param node The root node to collect from
     * @param depth Maximum depth to traverse
     * @param currentDepth Current traversal depth (used internally)
     * @returns Combined content string
     */
    private collectContentAtDepth(node: DocumentNode, depth: number, currentDepth: number = 0): string {
        const contentParts: string[] = [];
        
        // Always include the current node's content if it exists
        if (node.content && node.content.trim()) {
            const levelName = node.template[node.level] || `Level ${node.level}`;
            contentParts.push(`${levelName}: "${node.title}"\n---\n${node.content}\n---\n`);
        }

        // If we haven't reached the depth limit, include children
        if (currentDepth < depth && node.children.length > 0) {
            for (const child of node.children) {
                const childContent = this.collectContentAtDepth(child, depth, currentDepth + 1);
                if (childContent.trim()) {
                    contentParts.push(childContent);
                }
            }
        }

        return contentParts.join('\n');
    }

    /**
     * Creates the AI prompt for context extraction.
     * @param extractionPrompt What the user wants to extract
     * @param content The content to analyze
     * @param nodeTitle The title of the root node for context
     * @returns Formatted extraction prompt
     */
    private createExtractionPrompt(extractionPrompt: string, content: string, nodeTitle: string): string {
        // Get the context extraction prompt template from prompts system
        const prompts = this.settingsManager.getPrompts();
        const promptTemplate = prompts.context_extraction_user;

        // Replace placeholders in the template
        return promptTemplate
            .replace(/\{\{extraction_request\}\}/g, extractionPrompt)
            .replace(/\{\{node_title\}\}/g, nodeTitle)
            .replace(/\{\{content\}\}/g, content)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());
    }

    /**
     * Gets a preview of what content would be analyzed for extraction.
     * @param node The root node
     * @param depth The depth to traverse
     * @returns Summary of what content would be included
     */
    public getContentPreview(node: DocumentNode, depth: number = 0): { nodeCount: number, contentLength: number, summary: string } {
        const nodes = this.collectNodesAtDepth(node, depth);
        const nodesWithContent = nodes.filter(n => n.content && n.content.trim());
        const totalContentLength = nodesWithContent.reduce((sum, n) => sum + (n.content?.length || 0), 0);
        
        let summary = `Analysis would include:\n`;
        summary += `- ${nodesWithContent.length} nodes with content\n`;
        summary += `- Total content length: ${totalContentLength} characters\n`;
        summary += `- Depth: ${depth} levels\n\n`;
        
        if (nodesWithContent.length > 0) {
            summary += `Nodes to be analyzed:\n`;
            nodesWithContent.forEach(n => {
                const levelName = n.template[n.level] || `Level ${n.level}`;
                summary += `- ${levelName}: "${n.title}" (${n.content?.length || 0} chars)\n`;
            });
        } else {
            summary += `No nodes with content found at depth ${depth}.`;
        }
        
        return {
            nodeCount: nodesWithContent.length,
            contentLength: totalContentLength,
            summary
        };
    }

    /**
     * Collects all nodes at the specified depth.
     * @param node The root node
     * @param depth Maximum depth to traverse
     * @param currentDepth Current traversal depth
     * @returns Array of nodes within the depth range
     */
    private collectNodesAtDepth(node: DocumentNode, depth: number, currentDepth: number = 0): DocumentNode[] {
        const nodes: DocumentNode[] = [node];
        
        if (currentDepth < depth && node.children.length > 0) {
            for (const child of node.children) {
                nodes.push(...this.collectNodesAtDepth(child, depth, currentDepth + 1));
            }
        }
        
        return nodes;
    }

    /**
     * Validates extraction parameters.
     * @param node The node to extract from
     * @param extractionPrompt The extraction prompt
     * @param depth The depth parameter
     * @returns Object with separate arrays for errors and warnings
     */
    public validateExtractionParameters(node: DocumentNode, extractionPrompt: string, depth: number): { errors: string[], warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!extractionPrompt || extractionPrompt.trim().length === 0) {
            errors.push('Extraction prompt cannot be empty');
        }
        
        if (depth < 0) {
            errors.push('Depth cannot be negative');
        }
        
        if (depth > 10) {
            errors.push('Depth cannot exceed 10 levels (performance limitation)');
        }
        
        const preview = this.getContentPreview(node, depth);
        if (preview.nodeCount === 0) {
            errors.push('No content found to extract from at the specified depth');
        }
        
        if (preview.contentLength > 50000) {
            warnings.push(`Large content size (${preview.contentLength.toLocaleString()} characters). This may exceed some model context limits. Consider reducing depth if you encounter errors.`);
        }
        
        if (preview.contentLength > 200000) {
            warnings.push('Very large content size may cause performance issues or timeouts.');
        }
        
        return { errors, warnings };
    }

    /**
     * Creates a structured representation of the node tree for chat context.
     * @param node The root node to create tree data for
     * @param rootNode The project root node for full hierarchy access
     * @param depth How deep to traverse
     * @returns Formatted tree data string for chat context
     */
    public createNodeTreeData(node: DocumentNode, _rootNode: DocumentNode, depth: number): string {
        const nodeData = this.collectTreeDataAtDepth(node, depth, 0, '', true);
        
        // Format the tree data for the chat prompt
        let treeData = `Node Hierarchy (${depth + 1} levels deep):\n\n`;
        treeData += nodeData;
        
        return treeData;
    }

    /**
     * Collects tree data (title, content, structure) at the specified depth.
     * @param node The root node
     * @param depth Maximum depth to traverse
     * @param currentDepth Current traversal depth
     * @param prefix Indentation prefix for tree structure
     * @param isRootNode Whether this is the root node that started the chat
     * @returns Formatted tree structure
     */
    private collectTreeDataAtDepth(node: DocumentNode, depth: number, currentDepth: number = 0, prefix: string = '', isRootNode: boolean = true): string {
        const parts: string[] = [];
        
        // Add current node information
        const levelName = node.template[node.level] || `Level ${node.level}`;
        let nodeInfo = `${prefix}${levelName}: "${node.title}"`;
        
        // For the root node (the one chat started with), include the full context if available
        if (isRootNode && currentDepth === 0) {
            if (node.context && node.context.trim()) {
                nodeInfo += `\n${prefix}  Context: ${node.context}`;
            }
            
            if (node.content && node.content.trim()) {
                nodeInfo += `\n${prefix}  Content: ${node.content}`;
            } else if (!node.context || !node.context.trim()) {
                nodeInfo += `\n${prefix}  [No content or context]`;
            }
        } else {
            // For child nodes, include full content
            if (node.content && node.content.trim()) {
                nodeInfo += `\n${prefix}  Content: ${node.content}`;
            } else {
                nodeInfo += `\n${prefix}  [No content]`;
            }
        }
        
        parts.push(nodeInfo);
        
        // If we haven't reached the depth limit, include children
        if (currentDepth < depth && node.children.length > 0) {
            for (const child of node.children) {
                const childData = this.collectTreeDataAtDepth(child, depth, currentDepth + 1, prefix + '  ', false);
                parts.push(childData);
            }
        }
        
        return parts.join('\n');
    }

    /**
     * Gets a preview of what tree structure would be included in the chat.
     * @param node The root node
     * @param depth The depth to traverse
     * @returns Preview summary for UI display
     */
    public getChatTreePreview(node: DocumentNode, depth: number): { nodeCount: number, summary: string } {
        const nodes = this.collectNodesAtDepth(node, depth);
        const nodesWithContent = nodes.filter(n => n.content && n.content.trim());
        
        let summary = `Tree Structure Preview:\n\n`;
        summary += `Starting from: "${node.title}"\n`;
        summary += `Depth: ${depth} levels\n`;
        summary += `Total nodes: ${nodes.length}\n`;
        summary += `Nodes with content: ${nodesWithContent.length}\n\n`;
        
        // Show a simplified tree structure
        summary += this.createSimpleTreePreview(node, depth);
        
        return {
            nodeCount: nodes.length,
            summary
        };
    }

    /**
     * Gets a content length preview for chat context including estimated size.
     * @param node The root node
     * @param depth The depth to traverse
     * @returns Content length analysis for chat context
     */
    public getChatContentPreview(node: DocumentNode, depth: number): { nodeCount: number, contentLength: number, summary: string } {
        const nodes = this.collectNodesAtDepth(node, depth);
        
        // Calculate total content length including root node's context and content
        let totalContentLength = 0;
        
        // For root node, include both context and content
        if (node.context && node.context.trim()) {
            totalContentLength += node.context.length;
        }
        if (node.content && node.content.trim()) {
            totalContentLength += node.content.length;
        }
        
        // For child nodes, include only content
        const childNodes = nodes.slice(1); // Skip root node as we already counted it
        const childNodesWithContent = childNodes.filter(n => n.content && n.content.trim());
        totalContentLength += childNodesWithContent.reduce((sum, n) => sum + (n.content?.length || 0), 0);
        
        // Total nodes with content (including root if it has context or content)
        const rootHasContent = (node.context && node.context.trim()) || (node.content && node.content.trim());
        const totalNodesWithContent = (rootHasContent ? 1 : 0) + childNodesWithContent.length;
        
        let summary = `Chat Context Analysis:\n\n`;
        summary += `Starting from: "${node.title}"\n`;
        summary += `Depth: ${depth} levels\n`;
        summary += `Total nodes: ${nodes.length}\n`;
        summary += `Nodes with content/context: ${totalNodesWithContent}\n`;
        summary += `Total content length: ${totalContentLength.toLocaleString()} characters\n\n`;
        
        // Break down content by type
        if (rootHasContent) {
            summary += `Root node "${node.title}":\n`;
            if (node.context && node.context.trim()) {
                summary += `- Context: ${node.context.length.toLocaleString()} chars\n`;
            }
            if (node.content && node.content.trim()) {
                summary += `- Content: ${node.content.length.toLocaleString()} chars\n`;
            }
            summary += `\n`;
        }
        
        if (childNodesWithContent.length > 0) {
            summary += `Child nodes content:\n`;
            childNodesWithContent.forEach(n => {
                const levelName = n.template[n.level] || `Level ${n.level}`;
                summary += `- ${levelName}: "${n.title}" (${n.content?.length?.toLocaleString() || 0} chars)\n`;
            });
        }
        
        return {
            nodeCount: totalNodesWithContent,
            contentLength: totalContentLength,
            summary
        };
    }

    /**
     * Validates chat context parameters for length and provides warnings.
     * @param node The root node
     * @param depth The depth parameter
     * @returns Object with separate arrays for errors and warnings
     */
    public validateChatContextParameters(node: DocumentNode, depth: number): { errors: string[], warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (depth < 0) {
            errors.push('Depth cannot be negative');
        }
        
        if (depth > 10) {
            errors.push('Depth cannot exceed 10 levels (performance limitation)');
        }
        
        const preview = this.getChatContentPreview(node, depth);
        if (preview.nodeCount === 0) {
            warnings.push('No content or context found at the specified depth. The chat will have minimal context.');
        }
        
        if (preview.contentLength > 50000) {
            warnings.push(`Large content size (${preview.contentLength.toLocaleString()} characters). This may exceed some model context limits and could result in higher costs. Consider reducing depth if you encounter errors.`);
        }
        
        if (preview.contentLength > 100000) {
            warnings.push('Very large content size may cause performance issues, longer response times, or significantly higher costs.');
        }
        
        if (preview.contentLength > 200000) {
            warnings.push('Extremely large content size. Many models have context limits around 200K tokens (~800K characters). This request may fail or be very expensive.');
        }
        
        return { errors, warnings };
    }

    /**
     * Creates a simple tree preview for UI display.
     * @param node The root node
     * @param depth Maximum depth
     * @param currentDepth Current depth
     * @param prefix Indentation prefix
     * @returns Simple tree structure preview
     */
    private createSimpleTreePreview(node: DocumentNode, depth: number, currentDepth: number = 0, prefix: string = ''): string {
        const parts: string[] = [];
        
        // Add current node
        const hasContent = node.content && node.content.trim();
        const levelName = node.template[node.level] || `Level ${node.level}`;
        parts.push(`${prefix}${levelName}: "${node.title}" ${hasContent ? '✓' : '○'}`);
        
        // Add children if within depth
        if (currentDepth < depth && node.children.length > 0) {
            for (const child of node.children) {
                const childPreview = this.createSimpleTreePreview(child, depth, currentDepth + 1, prefix + '  ');
                parts.push(childPreview);
            }
        }
        
        return parts.join('\n');
    }

    /**
     * Creates a depth-limited clone of the DocumentNode structure for chat context.
     * This ensures roleplay and other features only see nodes within the selected depth.
     * @param node The root node to clone
     * @param depth Maximum depth to include
     * @param currentDepth Current traversal depth
     * @returns A new DocumentNode with only children up to the specified depth
     */
    public createDepthLimitedNodeStructure(node: DocumentNode, depth: number, currentDepth: number = 0): DocumentNode {
        // Create a new node with the same properties but empty children array
        const clonedNode = new DocumentNode(node.level, node.title, node.parentId, node.template);
        
        // Copy all properties
        clonedNode.setContent(node.content, 'master');
        clonedNode.setContext(node.context, 'master');
        clonedNode.generationPrompt = node.generationPrompt;
        clonedNode.isPromptGenerating = node.isPromptGenerating;
        clonedNode.collapsed = node.collapsed;
        clonedNode.generationHistory = [...node.generationHistory];
        clonedNode.isGenerating = node.isGenerating;
        clonedNode.generationSessions = node.generationSessions.map(session => ({...session}));
        
        // Copy creator model metadata if it exists
        if (node.creatorModel) {
            const masterVersion = clonedNode.getMasterVersion();
            if (masterVersion) {
                masterVersion.metadata = masterVersion.metadata || {};
                masterVersion.metadata['creatorModel'] = node.creatorModel;
            }
        }
        
        // Only include children if we haven't reached the depth limit
        if (currentDepth < depth && node.children.length > 0) {
            clonedNode.children = node.children.map(child => 
                this.createDepthLimitedNodeStructure(child, depth, currentDepth + 1)
            );
            
            // Update parent IDs for the cloned children
            clonedNode.children.forEach(child => {
                child.parentId = clonedNode.id;
            });
        }
        
        return clonedNode;
    }
} 