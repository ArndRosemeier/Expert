/**
 * AI Project Generator
 * 
 * Core AI logic for generating project structures from natural language descriptions.
 * Uses the existing OpenRouterClient to communicate with language models.
 */

import { OpenRouterClient } from '../OpenRouterClient';
import { SmartContentParser, ParsedContent } from './SmartContentParser';
import { SettingsManager } from '../SettingsManager';
import { QualityCriterion } from '../types';
import { formatCriteriaAsJson } from '../ProjectUtils';

export interface AIGenerationResponse {
    Title?: string;   // Extracted project title from AI response
    Content: string;  // Project concept and structure
    Template: {
        name: string;
        hierarchyLevels: string[];
    };
    Context: string;  // Consolidated context: characters, style guides, themes, etc. (converted from object if needed)
}

export class AIProjectGenerator {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;

    constructor(client?: OpenRouterClient, settingsManager?: SettingsManager) {
        this.openRouterClient = client ?? OpenRouterClient.getInstance();
        this.settingsManager = settingsManager!; // Will be provided by ProjectGenerationService
    }

    /**
     * Generate a complete project structure from natural language description
     */
    public async generateProjectStructure(
        description: string
    ): Promise<AIGenerationResponse> {
        const prompt = this.buildProjectGenerationPrompt(description);
        
        try {
            // Use the creator model for project generation
            const response = await this.openRouterClient.chat(
                'creator', 
                prompt,
                undefined, // auto-generate operation ID
                undefined  // no external abort signal
            );

            // Log the complete AI response for debugging
            console.log('🤖 COMPLETE AI RESPONSE:');
            console.log('=====================================');
            console.log(response);
            console.log('=====================================');
            
            // Parse the AI response using SmartContentParser
            const parsedContent = SmartContentParser.parseGenerationResponse(response, 'project');
            
            // Convert to AIGenerationResponse format
            const parsedResponse = this.convertParsedContentToAIResponse(parsedContent, response);
            
            // Validate the parsed response
            this.validateGenerationResponse(parsedResponse);
            
            return parsedResponse;
            
        } catch (error) {
            console.error('AI project generation failed:', error);
            throw new Error(`Project generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Build the sophisticated prompt for project generation using PromptManager
     */
    private buildProjectGenerationPrompt(description: string): string {
        const prompts = this.settingsManager.getPrompts();
        const promptTemplate = prompts.ai_project_generation;
        
        // Get quality criteria from current profile
        const profile = this.settingsManager.getLastUsedProfile();
        const allCriteria = profile?.criteria ?? [];
        
        // Filter criteria for outline/structure generation (not leaf content)
        const criteria = this.filterCriteriaForOutlineGeneration(allCriteria);
        
        // Format criteria as JSON (same as LoopOrchestrator)
        const criteriaJson = formatCriteriaAsJson(criteria);
        
        // Replace placeholders
        return promptTemplate
            .replace(/\{\{description\}\}/g, description)
            .replace(/\{\{criteria\}\}/g, criteriaJson)
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());
    }

    /**
     * Filters criteria for outline/structure generation (AI project generation).
     * This is similar to the PromptService filtering but specifically for outline nodes.
     * @param criteria The full list of criteria from the profile
     * @returns Filtered criteria appropriate for outline/structure generation
     */
    private filterCriteriaForOutlineGeneration(criteria: QualityCriterion[]): QualityCriterion[] {
        return criteria.filter(criterion => {
            // If both outline and leaf are undefined, include the criterion (legacy criteria)
            if (criterion.outline === undefined && criterion.leaf === undefined) {
                return true; // Legacy criteria - apply to all
            }
            
            // For outline/structure generation, include criteria where outline is true
            return criterion.outline === true;
        });
    }





    /**
     * Convert ParsedContent from SmartContentParser to AIGenerationResponse
     */
    private convertParsedContentToAIResponse(parsedContent: ParsedContent, originalResponse: string): AIGenerationResponse {
        if (parsedContent.hasStructuredData && parsedContent.template) {
            // Use structured data
            console.log('✅ Successfully parsed AI response with method:', parsedContent.metadata['parseMethod']);
            console.log('✅ Extracted title:', parsedContent.metadata['title']);
            const titleMeta = parsedContent.metadata['title'];
            const title = typeof titleMeta === 'string' ? titleMeta : undefined;
            const response: AIGenerationResponse = {
                Content: parsedContent.content,
                Template: parsedContent.template,
                Context: parsedContent.context
            };
            if (title !== undefined) {
                response.Title = title;
            }
            return response;
        } else {
            // Log the complete AI response for debugging
            console.error('❌ AI PROJECT GENERATION FAILED - FULL RESPONSE:');
            console.error('=====================================');
            console.error(originalResponse);
            console.error('=====================================');
            console.error('Parse method:', parsedContent.metadata['parseMethod']);
            console.error('Metadata:', parsedContent.metadata);
            
            // Analyze the response to provide better error information
            const analysis = SmartContentParser.analyzeResponse(originalResponse);
            console.error('Response analysis:', analysis);
            
            throw new Error(`Failed to parse AI response into valid project structure. ${analysis.suggestions.join('. ')}. Response had ${analysis.jsonBlocks} JSON blocks and structure: ${analysis.probableStructure}. See console for the complete AI response.`);
        }
    }

    // Fallback logic removed - we now fail fast with clear error messages instead of creating broken projects

    /**
     * Validate the generated response structure
     */
    private validateGenerationResponse(response: AIGenerationResponse): void {
        const errors: string[] = [];

        if (!response.Content || response.Content.trim().length === 0) {
            errors.push('Content section is missing or empty');
        }

        if (!response.Template.name) {
            errors.push('Template name is missing');
        }
        if (!Array.isArray(response.Template.hierarchyLevels) || response.Template.hierarchyLevels.length === 0) {
            errors.push('Template hierarchy levels are missing or invalid');
        }

        if (!response.Context || response.Context.trim().length === 0) {
            errors.push('Context section is missing or empty');
        }

        if (errors.length > 0) {
            throw new Error(`Invalid AI generation response: ${errors.join(', ')}`);
        }
    }

    /**
     * Check if the generator is ready to use (has valid API configuration)
     */
    public async isReady(): Promise<boolean> {
        try {
            // Check if we can get the creator model
            const models = await this.openRouterClient.fetchModels();
            return models.length > 0;
        } catch (error) {
            console.error('AI Project Generator not ready:', error);
            return false;
        }
    }
} 