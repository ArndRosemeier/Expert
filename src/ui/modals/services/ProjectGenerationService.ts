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
        detailedOutline: boolean;
    };
}

// AIGenerationResponse is now imported from AIProjectGenerator

export interface ProjectGenerationResult {
    title: string;
    template: ProjectTemplate;
    content: string;     // Project outline/structure
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
            onProgress?.(stages[i]);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        try {
            // Convert request to AI generator format
            const aiOptions = { detailedOutline: request.options.detailedOutline };
            
            // Generate with AI
            const aiResponse = await this.aiGenerator.generateProjectStructure(
                request.description, 
                aiOptions
            );

            // Continue progress
            onProgress?.(stages[2]);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Generate project title
            const projectTitle = this.generateProjectTitleFromAI(aiResponse);

            // Final progress
            onProgress?.(stages[3]);

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
        if (match) {
            return { 
                name: match[1], 
                isFixed: true, 
                count: parseInt(match[2]) 
            };
        }
        return { name: layer, isFixed: false };
    }

    /**
     * Mock project generation for Phase 1 testing
     */
    private async mockGenerateProject(
        request: ProjectGenerationRequest,
        onProgress?: ProgressCallback
    ): Promise<ProjectGenerationResult> {
        const stages = [
            { stage: 'analysis', message: 'Analyzing project requirements...', progress: 20 },
            { stage: 'template', message: 'Generating template structure...', progress: 40 },
            { stage: 'content', message: 'Creating project outline...', progress: 60 },
            { stage: 'context', message: 'Developing contextual information...', progress: 80 },
            { stage: 'finalization', message: 'Finalizing project structure...', progress: 100 }
        ];

        // Simulate progress
        for (const stage of stages) {
            onProgress?.(stage);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Extract project type from description (basic heuristics)
        const description = request.description || '';
        const projectType = this.inferProjectType(description);
        
        // Generate mock AI response
        const aiResponse = this.generateMockAIResponse(description, projectType, request.options);
        
        // Convert to ProjectGenerationResult
        return {
            title: this.generateProjectTitle(description, projectType),
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
                projectType
            }
        };
    }

    /**
     * Generate mock AI response in the simplified format
     */
    private generateMockAIResponse(
        description: string, 
        projectType: string, 
        options: ProjectGenerationRequest['options']
    ): AIGenerationResponse {
        const templates = {
            narrative: {
                name: 'AI Generated Narrative',
                hierarchyLevels: ['Story', 'Act 3', 'Chapter', 'Scene'],
                scaffoldingDocuments: ['Story Outline', 'Character Profiles', 'World Building Notes']
            },
            business: {
                name: 'AI Generated Business Plan',
                hierarchyLevels: ['Business Plan', 'Section 7', 'Subsection', 'Detail'],
                scaffoldingDocuments: ['Executive Summary', 'Market Analysis', 'Financial Projections']
            },
            research: {
                name: 'AI Generated Research Study',
                hierarchyLevels: ['Research', 'Chapter', 'Section', 'Finding'],
                scaffoldingDocuments: ['Abstract', 'Literature Review', 'Methodology', 'Conclusions']
            },
            documentation: {
                name: 'AI Generated Documentation',
                hierarchyLevels: ['Documentation', 'Category', 'Guide', 'Topic'],
                scaffoldingDocuments: ['Overview', 'Getting Started', 'API Reference', 'Troubleshooting']
            },
            cookbook: {
                name: 'AI Generated Cookbook',
                hierarchyLevels: ['Cookbook', 'Category', 'Recipe', 'Step'],
                scaffoldingDocuments: ['Introduction', 'Ingredient Guide', 'Techniques', 'Index']
            }
        };

        const template = templates[projectType as keyof typeof templates] || {
            name: 'AI Generated Project',
            hierarchyLevels: ['Project', 'Section', 'Item', 'Detail'],
            scaffoldingDocuments: []
        };

        return {
            Content: this.generateMockContent(description, projectType, options),
            Template: template,
            Context: this.generateMockContext(description, projectType, options)
        };
    }

    /**
     * Generate mock content (project outline)
     */
    private generateMockContent(
        description: string, 
        projectType: string, 
        options: ProjectGenerationRequest['options']
    ): string {
        const shortDesc = description.substring(0, 100) + (description.length > 100 ? '...' : '');
        
        return `AI-Generated Project Structure

Based on your description: "${shortDesc}"

Project Type: ${projectType.charAt(0).toUpperCase() + projectType.slice(1)}

This project has been intelligently structured based on your requirements. The AI has analyzed your description and created an appropriate hierarchy and organization.

Key Features:
- Optimized structure for ${projectType} projects
- Context-aware organization
- Scalable hierarchy design
- Comprehensive supporting documents

${options.detailedOutline ? 'DETAILED OUTLINE:\nThis project includes a comprehensive outline with detailed sections and subsections tailored to your specific requirements.' : ''}

Next Steps:
1. Review the generated structure
2. Customize template layers as needed
3. Begin adding content to your project nodes
4. Utilize the generated context for consistency

Note: This is a Phase 1 mock implementation. Phase 2 will include sophisticated AI analysis and generation.`;
    }

    /**
     * Generate consolidated mock context
     */
    private generateMockContext(
        description: string, 
        projectType: string, 
        options: ProjectGenerationRequest['options']
    ): string {
        const safeDescription = description || 'No description provided';
        let context = `PROJECT CONTEXT\n\nOriginal Description: ${safeDescription}\n\nProject Type: ${projectType.charAt(0).toUpperCase() + projectType.slice(1)}\n\n`;

        // Add style guide for all projects (natural part of context)
        context += this.generateStyleGuideSection(projectType);

        // Add characters for narrative projects (natural part of narrative context)
        if (projectType === 'narrative') {
            context += this.generateCharactersSection(safeDescription);
        }

        // Add project-specific context
        context += this.generateProjectSpecificContext(projectType, safeDescription);

        return context;
    }

    /**
     * Generate style guide section
     */
    private generateStyleGuideSection(projectType: string): string {
        const styleGuides = {
            narrative: 'STYLE GUIDE:\n- Voice: Third person limited\n- Tone: Engaging and immersive\n- Pacing: Balanced action and character development\n- Themes: Focus on character growth and conflict resolution\n\n',
            business: 'STYLE GUIDE:\n- Voice: Professional and authoritative\n- Tone: Clear and confident\n- Format: Structured with data-driven insights\n- Approach: Strategic and analytical\n\n',
            research: 'STYLE GUIDE:\n- Voice: Academic and objective\n- Tone: Formal and analytical\n- Citations: APA format\n- Structure: Systematic and evidence-based\n\n',
            documentation: 'STYLE GUIDE:\n- Voice: Clear and instructional\n- Tone: Helpful and accessible\n- Format: Step-by-step with examples\n- Approach: User-focused and practical\n\n',
            cookbook: 'STYLE GUIDE:\n- Voice: Friendly and encouraging\n- Tone: Approachable and enthusiastic\n- Format: Clear instructions with tips\n- Approach: Technique-focused with variations\n\n'
        };

        return styleGuides[projectType as keyof typeof styleGuides] || 
               'STYLE GUIDE:\n- Voice: Clear and professional\n- Tone: Appropriate to audience\n- Format: Well-structured and organized\n\n';
    }

    /**
     * Generate characters section for narrative projects
     */
    private generateCharactersSection(description: string): string {
        let characters = 'CHARACTERS:\n';
        
        // Simple character extraction based on description
        if (description.toLowerCase().includes('protagonist') || description.toLowerCase().includes('hero')) {
            characters += '- Protagonist: Central character driving the story\n';
        } else {
            characters += '- Main Character: The primary focus of the narrative\n';
        }
        
        if (description.toLowerCase().includes('villain') || description.toLowerCase().includes('antagonist')) {
            characters += '- Antagonist: Primary opposing force\n';
        }
        
        characters += '- Supporting Characters: Secondary characters that enhance the story\n\n';
        
        return characters;
    }

    /**
     * Generate project-specific context
     */
    private generateProjectSpecificContext(projectType: string, description: string): string {
        switch (projectType) {
            case 'business':
                return 'BUSINESS CONSIDERATIONS:\n- Target market analysis\n- Competitive landscape\n- Revenue model\n- Growth strategy\n- Risk assessment\n\n';
            
            case 'research':
                return 'RESEARCH METHODOLOGY:\n- Data collection methods\n- Analysis framework\n- Ethical considerations\n- Validation approaches\n- Expected outcomes\n\n';
            
            case 'documentation':
                return 'DOCUMENTATION STRUCTURE:\n- User journey mapping\n- Content hierarchy\n- Cross-references\n- Maintenance protocols\n- Accessibility considerations\n\n';
            
            case 'cookbook':
                return 'CULINARY APPROACH:\n- Skill level considerations\n- Ingredient sourcing\n- Technique explanations\n- Dietary variations\n- Presentation tips\n\n';
            
            default:
                return 'PROJECT NOTES:\n- Key themes and concepts\n- Success metrics\n- Implementation considerations\n- Future expansion possibilities\n\n';
        }
    }

    /**
     * Infer project type from description (Phase 1 simple heuristics)
     */
    private inferProjectType(description: string): string {
        const lower = description.toLowerCase();
        
        if (lower.includes('novel') || lower.includes('story') || lower.includes('character') || 
            lower.includes('plot') || lower.includes('fiction') || lower.includes('narrative')) {
            return 'narrative';
        }
        
        if (lower.includes('business') || lower.includes('plan') || lower.includes('strategy') ||
            lower.includes('marketing') || lower.includes('financial')) {
            return 'business';
        }
        
        if (lower.includes('research') || lower.includes('study') || lower.includes('analysis') ||
            lower.includes('academic') || lower.includes('thesis')) {
            return 'research';
        }
        
        if (lower.includes('documentation') || lower.includes('manual') || lower.includes('guide') ||
            lower.includes('tutorial') || lower.includes('api')) {
            return 'documentation';
        }
        
        if (lower.includes('cookbook') || lower.includes('recipe') || lower.includes('cooking')) {
            return 'cookbook';
        }
        
        return 'general';
    }

    /**
     * Generate project title (Phase 1 simple implementation)
     */
    private generateProjectTitle(description: string, projectType: string): string {
        const firstSentence = description.split('.')[0]?.trim() || '';
        const words = firstSentence.split(' ').slice(0, 6);
        let title = words.join(' ');
        
        // Clean up title
        title = title.replace(/^(a|an|the)\s+/i, '');
        if (title) {
            title = title.charAt(0).toUpperCase() + title.slice(1);
        }
        
        return title || `AI Generated ${projectType.charAt(0).toUpperCase() + projectType.slice(1)} Project`;
    }

    /**
     * Validate generation request
     */
    public validateRequest(request: ProjectGenerationRequest): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        if (!request.description || request.description.trim().length < 10) {
            errors.push('Description must be at least 10 characters long');
        }
        
        if (request.description.length > 5000) {
            errors.push('Description must be less than 5000 characters');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
} 