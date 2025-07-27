import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode, TodoItem } from '../../../DocumentNode';

export interface FixedChildResult {
    originalContent: string;
    fixedContent: string;
    problemsSolved: string[];
    explanation: string;
}

export class LogicChildFixerService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
    }

    public async generateFixedChild(nodeToFix: DocumentNode, truthNode: DocumentNode, todos: TodoItem[]): Promise<FixedChildResult> {
        console.log(`🎯 Generating fixed child for node: ${nodeToFix.title} based on truth node: ${truthNode.title}`);

        const originalContent = nodeToFix.content || '';
        
        // Build the prompt using prompt manager
        const prompt = this.buildChildFixingPrompt(nodeToFix, truthNode, originalContent, todos);
        
        // Get AI response using creator model
        const response = await this.openRouterClient.chat('logic_child_fix', prompt);
        
        // Parse the AI response
        const result = this.parseChildFixResponse(response, originalContent);
        
        console.log(`✅ Generated fixed child content (${result.fixedContent.length} chars)`);
        
        return result;
    }

    private buildChildFixingPrompt(nodeToFix: DocumentNode, truthNode: DocumentNode, currentContent: string, todos: TodoItem[]): string {
        const language = this.settingsManager.getLanguage();
        
        // Format todo items
        const formattedProblems = todos.map((todo, index) => {
            return `${index + 1}. ${todo.description}`;
        }).join('\n');

        // Get context for better understanding
        const context = this.getNodeContext(nodeToFix);
        
        // Get the logic_child_fix prompt from settings
        const prompts = this.settingsManager.getPrompts();
        let promptTemplate = prompts.logic_child_fix;
        
        // Replace placeholders
        promptTemplate = promptTemplate
            .replace(/\{\{node_title\}\}/g, nodeToFix.title)
            .replace(/\{\{node_level\}\}/g, nodeToFix.level.toString())
            .replace(/\{\{context\}\}/g, context)
            .replace(/\{\{truth_node_title\}\}/g, truthNode.title)
            .replace(/\{\{truth_node_content\}\}/g, truthNode.content || 'No content')
            .replace(/\{\{current_content\}\}/g, currentContent)
            .replace(/\{\{formatted_problems\}\}/g, formattedProblems)
            .replace(/\{\{language\}\}/g, language);

        return promptTemplate;
    }

    private getNodeContext(node: DocumentNode): string {
        // Get parent context if available
        const parentContext = node.context || '';
        return parentContext || 'No additional context available.';
    }

    private parseChildFixResponse(response: string, originalContent: string): FixedChildResult {
        try {
            // Try to parse as JSON
            const cleanResponse = response.trim();
            let jsonStart = cleanResponse.indexOf('{');
            let jsonEnd = cleanResponse.lastIndexOf('}');
            
            if (jsonStart === -1 || jsonEnd === -1) {
                console.warn('⚠️ No JSON found in response, treating as plain text');
                return {
                    originalContent,
                    fixedContent: response.trim(),
                    problemsSolved: ['Applied general improvements'],
                    explanation: 'Content was improved based on truth node alignment.'
                };
            }
            
            const jsonString = cleanResponse.substring(jsonStart, jsonEnd + 1);
            const parsed = JSON.parse(jsonString);
            
            if (!parsed.fixedContent) {
                console.warn('⚠️ No fixedContent in parsed response');
                return {
                    originalContent,
                    fixedContent: response.trim(),
                    problemsSolved: ['Applied general improvements'],
                    explanation: 'Content was improved based on truth node alignment.'
                };
            }
            
            return {
                originalContent,
                fixedContent: parsed.fixedContent.trim(),
                problemsSolved: parsed.problemsSolved || ['Applied improvements'],
                explanation: parsed.explanation || 'Content was adjusted to align with the truth node.'
            };
            
        } catch (error) {
            console.error('❌ Failed to parse child fix response as JSON:', error);
            console.log('Raw response:', response);
            
            return {
                originalContent,
                fixedContent: response.trim(),
                problemsSolved: ['Applied general improvements'],
                explanation: 'Content was improved based on truth node alignment.'
            };
        }
    }
} 