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

        const originalContent = nodeToFix.content;
        
        // Build the prompt using prompt manager
        const prompt = this.buildChildFixingPrompt(nodeToFix, truthNode, originalContent, todos);
        
        // Get AI response using creator model
        const response = await this.openRouterClient.chat('creator', prompt);
        
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
        const promptTemplate = prompts.logic_child_fix;
        
        // Replace placeholders
        return promptTemplate
            .replace(/\{\{node_title\}\}/g, nodeToFix.title)
            .replace(/\{\{node_level\}\}/g, nodeToFix.level.toString())
            .replace(/\{\{context\}\}/g, context)
            .replace(/\{\{truth_node_title\}\}/g, truthNode.title)
            .replace(/\{\{truth_node_content\}\}/g, truthNode.content)
            .replace(/\{\{current_content\}\}/g, currentContent)
            .replace(/\{\{formatted_problems\}\}/g, formattedProblems)
            .replace(/\{\{language\}\}/g, language);
    }

    private getNodeContext(_node: DocumentNode): string {
        return ''; // Traditional context removed - using conditional context system
    }

    private parseChildFixResponse(response: string, originalContent: string): FixedChildResult {
        const cleanResponse = response.trim();
        const jsonStart = cleanResponse.indexOf('{');
        const jsonEnd = cleanResponse.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error(`Invalid response format: No JSON found in AI response. Response: ${response.substring(0, 100)}...`);
        }
        
        const jsonString = cleanResponse.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonString);
        
        if (!parsed.fixedContent) {
            throw new Error(`Invalid response format: Missing fixedContent field in AI response: ${JSON.stringify(parsed)}`);
        }
        
        return {
            originalContent,
            fixedContent: parsed.fixedContent.trim(),
            problemsSolved: parsed.problemsSolved,
            explanation: parsed.explanation
        };
    }
} 