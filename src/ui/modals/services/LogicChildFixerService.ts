import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode, TodoItem } from '../../../DocumentNode';
import { BaseLogicFixerService } from './BaseLogicFixerService';

export interface FixedChildResult {
    originalContent: string;
    fixedContent: string;
    problemsSolved: string[];
    explanation: string;
}

export class LogicChildFixerService extends BaseLogicFixerService {
    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        super(openRouterClient, settingsManager);
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
        const language = this.getLanguage();
        const formattedProblems = this.formatTodoItems(todos);
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

    private parseChildFixResponse(response: string, originalContent: string): FixedChildResult {
        const parsed = this.extractJsonFromResponse(response);
        this.validateFixedContentField(parsed);
        
        return {
            originalContent,
            fixedContent: (parsed['fixedContent'] as string).trim(),
            problemsSolved: parsed['problemsSolved'] as string[],
            explanation: parsed['explanation'] as string
        };
    }
} 