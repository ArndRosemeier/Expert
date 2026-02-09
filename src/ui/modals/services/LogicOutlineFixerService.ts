import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode, TodoItem } from '../../../DocumentNode';
import { BaseLogicFixerService } from './BaseLogicFixerService';

export interface FixedOutlineResult {
    originalContent: string;
    fixedContent: string;
    problemsSolved: string[];
    explanation: string;
}

export class LogicOutlineFixerService extends BaseLogicFixerService {
    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        super(openRouterClient, settingsManager);
    }

    public async generateFixedOutline(node: DocumentNode, todos: TodoItem[]): Promise<FixedOutlineResult> {
        console.log(`🔧 Generating fixed outline for node: ${node.title}`);


        const originalContent = node.content || '';
        
        // Build the prompt using prompt manager
        const prompt = this.buildFixingPrompt(node, originalContent, todos);
        
        // Get AI response using creator model
        const response = await this.openRouterClient.chat('creator', prompt);
        
        // Parse the AI response
        const result = this.parseFixResponse(response, originalContent);
        
        console.log(`✅ Generated fixed outline (${result.fixedContent.length} chars)`);
        
        return result;
    }

    private buildFixingPrompt(node: DocumentNode, currentContent: string, todos: TodoItem[]): string {
        const language = this.getLanguage();
        const formattedProblems = this.formatTodoItems(todos);
        const context = this.getNodeContext(node);
        
        // Get the prompt template from prompt manager
        const prompts = this.settingsManager.getPrompts();
        const promptTemplate = prompts.logic_outline_fix;

        // Replace placeholders
        return promptTemplate
            .replace(/\{\{node_title\}\}/g, node.title)
            .replace(/\{\{node_level\}\}/g, node.level.toString())
            .replace(/\{\{context\}\}/g, context)
            .replace(/\{\{current_content\}\}/g, currentContent)
            .replace(/\{\{formatted_problems\}\}/g, formattedProblems)
            .replace(/\{\{language\}\}/g, language);
    }

    protected override getNodeContext(node: DocumentNode): string {
        const contextParts: string[] = [];
        
        // Add parent context if available
        let currentNode: DocumentNode | undefined = node;
        const pathParts: string[] = [];
        
        while (currentNode && currentNode.parentId) {
            const parent = this.findParentNode(currentNode);
            if (parent) {
                pathParts.unshift(parent.title);
                if (parent.content && parent.content.trim()) {
                    contextParts.unshift(`${parent.title}: ${parent.content.substring(0, 200)}${parent.content.length > 200 ? '...' : ''}`);
                }
            }
            currentNode = parent;
        }

        const pathContext = pathParts.length > 0 ? `Story path: ${pathParts.join(' > ')} > ${node.title}` : '';
        const contentContext = contextParts.length > 0 ? contextParts.join('\n\n') : 'No parent context available.';

        return `${pathContext}\n\n${contentContext}`;
    }

    private findParentNode(_node: DocumentNode): DocumentNode | undefined {
        // This is a simplified implementation - in a real app we'd need access to the tree structure
        // For now, we'll return undefined and rely on the content being self-contained
        return undefined;
    }

    private parseFixResponse(response: string, originalContent: string): FixedOutlineResult {
        try {
            const parsed = this.extractJsonFromResponse(response);
            this.validateFixedContentField(parsed);
            
            return {
                originalContent,
                fixedContent: (parsed['fixedContent'] as string).trim(),
                problemsSolved: Array.isArray(parsed['problemsSolved']) ? parsed['problemsSolved'] : [],
                explanation: (parsed['explanation'] as string) || 'Fixed outline to address logic inconsistencies.'
            };
            
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            console.log('Raw response:', response);
            
            // Fallback: treat the entire response as the fixed content
            return {
                originalContent,
                fixedContent: response.trim(),
                problemsSolved: ['General logic improvements'],
                explanation: 'Applied general logic improvements to the outline.'
            };
        }
    }
} 