/**
 * Project Generation Service
 * 
 * Handles AI-powered project creation from natural language descriptions
 * Phase 1: Basic structure and interfaces ✅ COMPLETE
 * Phase 2: Full AI implementation ✅ COMPLETE
 */

import { ProjectTemplate } from '../../../ProjectTemplate';
import { OpenRouterClient } from '../../../OpenRouterClient';
import { AIProjectGenerator, AIGenerationResponse } from '../../../project/AIProjectGenerator';
import { SettingsManager } from '../../../SettingsManager';

export interface ProjectGenerationRequest {
    description: string;
    options: {
        includeCharacters: boolean;
        includeStyleGuide: boolean;
    };
}

// AIGenerationResponse is now imported from AIProjectGenerator

export interface ProjectGenerationResult {
    title: string;
    template: ProjectTemplate;
    content: string;     // Project concept/structure
    context: string;     // Consolidated contextual information
    metadata: {
        generatedAt: Date;
        description: string;
        options: ProjectGenerationRequest['options'];
        projectType: string;
    };
}

export interface GenerationProgress {
    stage: string;
    progress: number; // 0-100
    message: string;
}

export type ProgressCallback = (progress: GenerationProgress) => void;

/**
 * Template Layer Information
 */
export interface TemplateLayerInfo {
    name: string;
    isFixed: boolean;
    count?: number;
}

/**
 * Project Generation Service
 * 
 * Phase 1: Basic structure with mock generation ✅ COMPLETE
 * Phase 2: Full AI implementation ✅ COMPLETE
 */
export class ProjectGenerationService {
    private aiGenerator: AIProjectGenerator;
    private isGenerating: boolean = false;

    constructor(client?: OpenRouterClient, settingsManager?: SettingsManager) {
        this.aiGenerator = new AIProjectGenerator(client, settingsManager);
    }

    /**
     * Generate a project from natural language description
     * 
     * Phase 2: Full AI implementation with fallback to mock
     */
    public async generateProject(
        request: ProjectGenerationRequest,
        onProgress?: ProgressCallback
    ): Promise<ProjectGenerationResult> {
        if (this.isGenerating) {
            throw new Error('Generation already in progress');
        }

        this.isGenerating = true;

        try {
            // Only real AI generation - no fallbacks
            return await this.realGenerateProject(request, onProgress);
            
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Real AI project generation (Phase 2)
     */
    private async realGenerateProject(
        request: ProjectGenerationRequest,
        onProgress?: ProgressCallback
    ): Promise<ProjectGenerationResult> {
        const stages = [
            { stage: 'analysis', message: 'Analyzing project requirements with AI...', progress: 20 },
            { stage: 'generation', message: 'Generating project structure with AI...', progress: 60 },
            { stage: 'validation', message: 'Validating generated structure...', progress: 80 },
            { stage: 'finalization', message: 'Finalizing project...', progress: 100 }
        ];

        // Progress tracking
        for (let i = 0; i < 2; i++) {
            const stage = stages[i];
            if (stage && onProgress) {
                onProgress(stage);
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        try {
            // Convert request to AI generator format - concepts are always detailed now
            const aiOptions = { detailedOutline: true };
            
            // Generate with AI
            const aiResponse = await this.aiGenerator.generateProjectStructure(
                request.description, 
                aiOptions
            );

            // Continue progress
            const stage2 = stages[2];
            if (stage2 && onProgress) {
                onProgress(stage2);
            }
            await new Promise(resolve => setTimeout(resolve, 200));

            // Generate project title
            const projectTitle = this.generateProjectTitleFromAI(aiResponse);

            // Final progress
            const stage3 = stages[3];
            if (stage3 && onProgress) {
                onProgress(stage3);
            }

            return {
                title: projectTitle,
                template: new ProjectTemplate(
                    aiResponse.Template.name,
                    aiResponse.Template.hierarchyLevels,
                    aiResponse.Template.scaffoldingDocuments
                ),
                content: aiResponse.Content,
                context: aiResponse.Context,
                metadata: {
                    generatedAt: new Date(),
                    description: request.description,
                    options: request.options,
                    projectType: this.inferProjectTypeFromAI(aiResponse)
                }
            };

        } catch (error) {
            console.error('❌ AI generation failed:', error); 
            throw error; // Don't fall back - let the error propagate
        }
    }

    /**
     * Generate project title from AI response
     */
    private generateProjectTitleFromAI(aiResponse: AIGenerationResponse): string {
        // Use the title from the AI response if available
        const title = aiResponse.Title;
        if (title && title.trim().length > 0) {
            console.log('✅ Using extracted title from AI response:', title);
            return title.trim();
        }
        
        console.log('⚠️ No title found in AI response, falling back to content extraction');
        // Try to extract a title from the AI response content
        const lines = aiResponse.Content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('Based on') && !trimmed.startsWith('This project')) {
                // Use first meaningful line as title, but clean it up
                return trimmed.replace(/^#+\s*/, '').replace(/[:\-\*]/g, '').trim().substring(0, 100);
            }
        }
        
        // Fallback to template name
        console.log('⚠️ No title found in content, using template name');
        return aiResponse.Template.name || 'AI Generated Project';
    }

    /**
     * Infer project type from AI response
     */
    private inferProjectTypeFromAI(aiResponse: AIGenerationResponse): string {
        const templateName = aiResponse.Template.name.toLowerCase();
        
        if (templateName.includes('novel') || templateName.includes('story') || templateName.includes('narrative')) return 'narrative';
        if (templateName.includes('business') || templateName.includes('plan')) return 'business';
        if (templateName.includes('research') || templateName.includes('study')) return 'research';
        if (templateName.includes('course') || templateName.includes('lesson')) return 'course';
        if (templateName.includes('documentation') || templateName.includes('technical')) return 'documentation';
        if (templateName.includes('cookbook') || templateName.includes('recipe')) return 'cookbook';
        
        return 'generic';
    }

    /**
     * Check if generation is currently in progress
     */
    public isGeneratingProject(): boolean {
        return this.isGenerating;
    }

    /**
     * Parse template layer to determine if it's fixed or flexible
     */
    public parseTemplateLayer(layer: string): TemplateLayerInfo {
        const match = layer.match(/^(.+?)\s+(\d+)$/);
        if (match && match[1] !== undefined && match[2] !== undefined) {
            return { 
                name: match[1], 
                isFixed: true, 
                count: parseInt(match[2]) 
            };
        }
        return { name: layer, isFixed: false };
    }

    // mockGenerateProject method removed - no longer used

    // generateMockAIResponse method removed - no longer used

    // generateMockContent method removed - no longer used

    // generateMockContext method removed - no longer used

    // generateStyleGuideSection method removed - no longer used

    // generateCharactersSection method removed - no longer used

    // generateProjectSpecificContext method removed - no longer used

    // inferProjectType method removed - no longer used

    // generateProjectTitle method removed - no longer used

    /**
     * Validate generation request
     */
    public validateRequest(request: ProjectGenerationRequest): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        if (!request.description || request.description.trim().length < 10) {
            errors.push('Description must be at least 10 characters long');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
} 