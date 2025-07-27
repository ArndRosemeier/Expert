import { DocumentNode } from '../../../DocumentNode';
import { ProjectManager } from '../../../ProjectManager';
import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { ContextService } from '../../../project/ContextService';
import { TreeService } from '../../../project/TreeService';

export interface NodeSuggestion {
    title: string;
    draft: string;
}

export interface NodeCreationConfig {
    parentNodeId: string;
    title: string;
    draft?: string;
    updateParent?: boolean;
}

export interface INodeCreationService {
    generateSuggestions(parentNode: DocumentNode, count?: number, userDirection?: string): Promise<NodeSuggestion[]>;
    createNode(config: NodeCreationConfig): Promise<DocumentNode>;
}

export class NodeCreationService implements INodeCreationService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;
    private contextService: ContextService;
    private treeService: TreeService;
    private projectManager: ProjectManager;

    constructor(
        openRouterClient: OpenRouterClient,
        settingsManager: SettingsManager,
        contextService: ContextService,
        treeService: TreeService,
        projectManager: ProjectManager
    ) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
        this.contextService = contextService;
        this.treeService = treeService;
        this.projectManager = projectManager;
    }

    /**
     * Generate AI-powered child node suggestions
     */
    public async generateSuggestions(parentNode: DocumentNode, count: number = 5, userDirection?: string): Promise<NodeSuggestion[]> {
        const profile = this.settingsManager.getLastUsedProfile();
        if (!profile) {
            throw new Error('No active profile found for AI generation');
        }

        // Get context for the parent node
        const context = this.contextService.compileNodeContext(parentNode.id, this.projectManager.rootNode);
        
        // Get the child suggestions prompt
        const prompts = this.settingsManager.getPrompts();
        const promptTemplate = prompts.child_node_suggestions;
        
        // Build user direction section
        const userDirectionSection = userDirection?.trim() ? 
            `User Direction: Please consider the following direction when generating suggestions:\n---\n${userDirection.trim()}\n---\n` : 
            '';
        
        // Fill the prompt template
        const filledPrompt = promptTemplate
            .replace(/\{\{parent_title\}\}/g, parentNode.title)
            .replace(/\{\{parent_content\}\}/g, parentNode.content || '')
            .replace(/\{\{context\}\}/g, context || '')
            .replace(/\{\{user_direction_section\}\}/g, userDirectionSection)
            .replace(/\{\{count\}\}/g, count.toString())
            .replace(/\{\{language\}\}/g, this.settingsManager.getLanguage());

        try {
            // Get the creator model from the profile's selected models
            const creatorModel = profile.selectedModels?.['creator'];
            if (!creatorModel) {
                throw new Error('No creator model configured in the active profile');
            }

            // Use the creator model directly via chat method
            const response = await this.openRouterClient.chat('creator', filledPrompt);

            // Parse the JSON response
            const suggestions = this.parseJsonResponse(response);
            
            // Validate and return suggestions
            return this.validateSuggestions(suggestions, count);
        } catch (error) {
            console.error('Failed to generate child node suggestions:', error);
            throw new Error('Failed to generate AI suggestions. Please try again or use manual input.');
        }
    }



    /**
     * Create a new child node with optional content and parent updates
     */
    public async createNode(config: NodeCreationConfig): Promise<DocumentNode> {
        const { parentNodeId, title, draft, updateParent = true } = config;
        
        // Get parent node
        const parentNode = this.treeService.findNodeById(parentNodeId, this.projectManager.rootNode);
        if (!parentNode) {
            throw new Error(`Parent node not found: ${parentNodeId}`);
        }

        // Create the child node (context is automatically inherited in TreeService.addNode)
        const childNode = this.projectManager.addNode(title, parentNodeId);
        
        // Set initial content if provided (with Draft prefix)
        if (draft) {
            const draftContent = `Draft: ${draft}`;
            // If draft was AI-generated, track the creator model
            const profile = this.settingsManager.getLastUsedProfile();
            const creatorModel = profile?.selectedModels?.['creator'];
            
            // Create a separate draft version instead of updating master
            const metadata: { [key: string]: any } = {};
            if (creatorModel) {
                metadata['creatorModel'] = creatorModel;
            }
            
            childNode.addVersion(['draft'], {
                content: draftContent,
                title: childNode.title,
                context: childNode.context
            }, metadata);
        }

        // Update parent content if requested
        if (updateParent && parentNode.content) {
            let updatedParentContent = parentNode.content;
            
            if (draft) {
                // Simply append the draft content as a new paragraph
                updatedParentContent = parentNode.content.trim() + '\n\n' + draft.trim();
            } else {
                // If no draft, just append a simple reference to the new child
                updatedParentContent = parentNode.content.trim() + '\n\n' + `The next section, "${title}", will be developed further.`;
            }
            
            // Use version management system to update parent content
            parentNode.setContent(updatedParentContent, 'master');
        }

        // Save the project
        await this.projectManager.saveToStorage();

        return childNode;
    }

    /**
     * Parse JSON response from AI
     */
    private parseJsonResponse(content: string): any[] {
        try {
            // Try to find JSON array in the response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            // If no array found, try parsing the entire content
            return JSON.parse(content);
        } catch (error) {
            throw new Error('Invalid JSON response from AI model');
        }
    }

    /**
     * Validate AI suggestions
     */
    private validateSuggestions(suggestions: any[], expectedCount: number): NodeSuggestion[] {
        if (!Array.isArray(suggestions)) {
            throw new Error('AI response is not an array');
        }

        const validSuggestions: NodeSuggestion[] = [];
        
        for (const suggestion of suggestions) {
            if (suggestion && 
                typeof suggestion.title === 'string' && 
                typeof suggestion.draft === 'string' &&
                suggestion.title.trim() !== '' &&
                suggestion.draft.trim() !== '') {
                
                validSuggestions.push({
                    title: suggestion.title.trim(),
                    draft: suggestion.draft.trim()
                });
            }
        }

        if (validSuggestions.length === 0) {
            throw new Error('No valid suggestions received from AI');
        }

        // Ensure we have the expected count (pad with variations if needed)
        while (validSuggestions.length < expectedCount && validSuggestions.length > 0) {
            const baseIndex = validSuggestions.length % validSuggestions.length;
            const base = validSuggestions[baseIndex];
            if (base) {
                validSuggestions.push({
                    title: `${base.title} (Alternative)`,
                    draft: base.draft
                });
            } else {
                break; // Safety check to prevent infinite loop
            }
        }

        return validSuggestions.slice(0, expectedCount);
    }
} 