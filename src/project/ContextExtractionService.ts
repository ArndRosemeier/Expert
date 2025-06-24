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
        // Get the context extraction prompt template from settings
        const activeProfile = this.settingsManager.getLastUsedProfile();
        const promptTemplate = activeProfile?.contextExtractionPrompt || 
            `You are an expert at analyzing text and extracting specific information. Your task is to analyze the following content and extract information about: {{extraction_request}}

Please provide a clear, organized list or summary of the requested information. Be thorough but concise, and focus only on the specific type of information requested.

Content to analyze from "{{node_title}}":
---
{{content}}
---

Please extract and list all instances of: {{extraction_request}}

Format your response as a clear, organized summary that would be useful for reference.`;

        // Replace placeholders in the template
        return promptTemplate
            .replace(/\{\{extraction_request\}\}/g, extractionPrompt)
            .replace(/\{\{node_title\}\}/g, nodeTitle)
            .replace(/\{\{content\}\}/g, content);
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
} 