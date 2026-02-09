import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode, TodoItem } from '../../../DocumentNode';

/**
 * Base service for logic fixing operations.
 * Provides shared infrastructure for child and outline fixing services.
 * Eliminates code duplication while maintaining type safety.
 */
export abstract class BaseLogicFixerService {
    protected openRouterClient: OpenRouterClient;
    protected settingsManager: SettingsManager;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
    }

    /**
     * Formats todo items into a numbered list for prompt inclusion.
     * Shared logic used by all fixer services.
     */
    protected formatTodoItems(todos: TodoItem[]): string {
        return todos.map((todo, index) => {
            return `${index + 1}. ${todo.description}`;
        }).join('\n');
    }

    /**
     * Gets the current language setting.
     * Convenience method for subclasses.
     */
    protected getLanguage(): string {
        return this.settingsManager.getLanguage();
    }

    /**
     * Parses JSON from AI response, handling common edge cases.
     * Extracts JSON content even if wrapped in markdown or other text.
     */
    protected extractJsonFromResponse(response: string): Record<string, unknown> {
        const cleanResponse = response.trim();
        
        // Try to find JSON content between curly braces
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error(`Invalid response format: No JSON found in AI response. Response: ${response.substring(0, 100)}...`);
        }
        
        const jsonString = jsonMatch[0];
        const parsed = JSON.parse(jsonString);
        
        return parsed;
    }

    /**
     * Validates that the parsed response contains required fields.
     * Throws clear error messages if validation fails.
     */
    protected validateFixedContentField(parsed: Record<string, unknown>): void {
        if (!parsed['fixedContent'] || typeof parsed['fixedContent'] !== 'string') {
            throw new Error(`Invalid response format: Missing or invalid fixedContent field in AI response: ${JSON.stringify(parsed)}`);
        }
    }

    /**
     * Gets node context for prompt building.
     * Default implementation returns empty string (no context).
     * Override in subclasses that need parent context.
     */
    protected getNodeContext(_node: DocumentNode): string {
        return '';
    }
}
