import { DocumentNode } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { LoopOrchestrator, LoopInput, LoopProgress, Rating, RaterProgressPayload } from './LoopOrchestrator';
import { EventEmitter } from './EventEmitter';
import { SettingsManager, SettingsProfile } from './SettingsManager';
import { OpenRouterClient } from './OpenRouterClient';
import { QualityCriterion, CreatorPayload } from './types';
import * as state from './state';

type ProjectManagerEvents = {
    'project-loaded': [];
    'node-selected': [node: DocumentNode | null];
    'nodeGenerationComplete': [e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }];
    'loop-progress': [e: { nodeId: string, progress: LoopProgress }];
    'high-level-progress': [e: { nodeId: string, message: string, current: number, total: number }];
    'nodePromptGenerated': [e: { nodeId:string, prompt: string, isPromptGenerating: boolean }];
    'nodeSummaryGenerated': [e: { nodeId: string, summary: string }];
    'error': [message: string];
};

export class ProjectManager extends EventEmitter<ProjectManagerEvents> {
    private static readonly LOCAL_STORAGE_KEY = 'expert_app_current_project';
    private static readonly MULTI_PROJECT_STORAGE_KEY = 'expert_app_projects';
    private static readonly ACTIVE_PROJECT_STORAGE_KEY = 'expert_app_active_project';

    projectTitle: string;
    template: ProjectTemplate;
    rootNode!: DocumentNode;
    private loopOrchestrator: LoopOrchestrator;
    private settingsManager: SettingsManager;
    private openRouterClient: OpenRouterClient;
    private selectedNodeId: string | null = null;
    private isGeneratingAllChildren = false;
    public _listenersSetup: boolean = false;

    constructor(
        projectTitle: string, 
        template: ProjectTemplate, 
        loopOrchestrator: LoopOrchestrator,
        settingsManager: SettingsManager,
        openRouterClient: OpenRouterClient
    ) {
        super();
        this.projectTitle = projectTitle;
        this.template = template;
        this.loopOrchestrator = loopOrchestrator;
        this.settingsManager = settingsManager;
        this.openRouterClient = openRouterClient;

        // The root node's title should be the project title.
        this.rootNode = new DocumentNode(0, this.projectTitle, null, this.template.hierarchyLevels);

        // Ensure we have a valid default profile set globally
        const defaultProfile = this.settingsManager.getProfile('default');
        if (defaultProfile && defaultProfile.criteria && defaultProfile.criteria.length > 0) {
            this.settingsManager.setLastUsedProfile('default');
        } else {
            const availableProfiles = this.settingsManager.getProfileNames();
            const firstValidProfile = availableProfiles.find(name => {
                const p = this.settingsManager.getProfile(name);
                return p && p.criteria && p.criteria.length > 0;
            });
            
            if (firstValidProfile) {
                this.settingsManager.setLastUsedProfile(firstValidProfile);
            }
            // If no valid profile exists, the error will be caught during generation
        }
    }

    /**
     * Finds a node in the document tree by its ID, starting from a given node.
     * @param id The ID of the node to find.
     * @param startNode The node to start the search from. Defaults to the project's root node.
     * @returns The found DocumentNode, or null if not found.
     */
    public findNodeById(id: string, startNode: DocumentNode = this.rootNode): DocumentNode | null {
        if (startNode.id === id) {
            return startNode;
        }

        for (const child of startNode.children) {
            const found = this.findNodeById(id, child);
            if (found) {
                return found;
            }
        }

        return null;
    }

    /**
     * Adds a new node to the document tree under a specified parent.
     * @param title The title of the new node.
     * @param parentId The ID of the parent node.
     * @returns The newly created DocumentNode.
     */
    public addNode(title: string, parentId: string | null = null): DocumentNode {
        const parent = parentId ? this.findNodeById(parentId) : this.rootNode;
        if (!parent) {
            throw new Error(`Parent node with ID "${parentId}" not found.`);
        }

        const newLevel = parent.level + 1;
        const newNode = new DocumentNode(newLevel, title, parent.id, parent.template);
        
        parent.children.push(newNode);
        
        return newNode;
    }

    /**
     * Removes a node (and all its descendants) from the tree.
     * @param id The ID of the node to remove.
     * @returns True if the node was found and removed, otherwise false.
     */
    public removeNode(id: string): boolean {
        const nodeToRemove = this.findNodeById(id);
        if (!nodeToRemove || !nodeToRemove.parentId) {
            // Cannot remove the root node or a node without a parent
            return false;
        }

        const parentNode = this.findNodeById(nodeToRemove.parentId);
        if (!parentNode) {
            return false; // Should not happen if parentId is valid
        }

        const index = parentNode.children.findIndex(child => child.id === id);
        if (index > -1) {
            parentNode.children.splice(index, 1);
            return true;
        }

        return false;
    }

    /**
     * Gathers rich, hierarchical context for a specific node to guide content generation.
     * This method compiles the direct parent's content and summaries of preceding siblings.
     * @param nodeId The ID of the node to compile context for.
     * @returns A string containing the contextual information.
     */
    private compileNodeContext(nodeId: string): string {
        const targetNode = this.findNodeById(nodeId);

        // A node's context is primarily defined by its parent and preceding siblings.
        if (!targetNode || !targetNode.parentId) {
            return '';
        }

        const parent = this.findNodeById(targetNode.parentId);
        if (!parent) {
            return '';
        }

        const contextParts: string[] = [];

        // 1. Add the parent's content (the outline). This is the most critical context.
        if (parent.content) {
            const parentLevelName = parent.template[parent.level] || `Level ${parent.level}`;
            contextParts.push(`CONTEXT FROM PARENT (${parentLevelName}: "${parent.title}"):\n---\n${parent.content}\n---`);
        }

        // 2. Add the list of all sibling titles to give a sense of scope.
        if (parent.children.length > 1) {
            const nodeLevelName = targetNode.template[targetNode.level] || `Level ${targetNode.level}`;
            const siblingTitles = parent.children.map(child => `- ${child.title} ${child.id === nodeId ? '(This node)' : ''}`).join('\n');
            contextParts.push(`The following "${nodeLevelName}" nodes exist at this level:\n${siblingTitles}`);
        }

        // 3. Add summaries of preceding siblings that have already been generated.
        const precedingSiblingSummaries: string[] = [];
        const siblingIndex = parent.children.findIndex(child => child.id === targetNode.id);

        if (siblingIndex > 0) {
            precedingSiblingSummaries.push("SUMMARIES OF PRECEDING SIBLINGS:");
            for (let i = 0; i < siblingIndex; i++) {
                const sibling = parent.children[i];
                if (sibling.summary) {
                    precedingSiblingSummaries.push(`Summary for "${sibling.title}":\n${sibling.summary}`);
                }
            }
        }
        
        if (precedingSiblingSummaries.length > 1) { // more than just the header
             contextParts.push(precedingSiblingSummaries.join('\n\n'));
        }

        return contextParts.join('\n\n====================\n\n');
    }

    public getNodePath(nodeId: string): string {
        let path = [];
        let currentNode = this.findNodeById(nodeId);
        while(currentNode) {
            const levelName = currentNode.template[currentNode.level] || `Level ${currentNode.level}`;
            path.unshift(`${levelName}: ${currentNode.title}`);
            currentNode = currentNode.parentId ? this.findNodeById(currentNode.parentId) : null;
        }
        return path.join(' => ');
    }

    /**
     * Gets the raw, unprocessed generation prompt for a node, which includes placeholders.
     * @param node The node for which to get the prompt template.
     * @returns The raw prompt template string.
     */
    public getRawGenerationPrompt(node: DocumentNode): string {
        const prompts = this.settingsManager.getPrompts();
        return node.isLeaf ? prompts.content_generation_user : prompts.branch_content_generation_user;
    }

    /**
     * Fills a raw prompt template with the specific details of a node (context, path, etc.).
     * @param promptTemplate The raw string template with placeholders.
     * @param node The node providing the data.
     * @param count Optional count for list generation.
     * @returns The final, filled prompt ready for an LLM.
     */
    private fillGenerationPrompt(promptTemplate: string, node: DocumentNode, count?: number): string {
        const path = this.getNodePath(node.id);
        const context = this.compileNodeContext(node.id);

        let filledPrompt = promptTemplate
            .replace(/\{\{path\}\}/g, path)
            .replace(/\{\{context\}\}/g, context)
            .replace(/\{\{title\}\}/g, node.title)
            .replace(/\{\{child_level_name\}\}/g, node.childLevelName || '');
        
        if (!node.isLeaf && count) {
            filledPrompt = filledPrompt.replace(/\{\{count\}\}/g, String(count));
        }

        return filledPrompt;
    }

    public async generateNodeContent(nodeId: string, count: number = 5, isChildGeneration: boolean = false): Promise<void> {
        const node = this.findNodeById(nodeId);
        if (!node) { throw new Error(`Node not found: ${nodeId}`); }

        const profile = this.settingsManager.getLastUsedProfile();
        
        // Fail loudly if the node is in an invalid state for generation.
        if (!profile || !profile.criteria || profile.criteria.length === 0) {
            throw new Error(`Cannot generate content for node "${node.title}" (ID: ${nodeId}). The active profile is either missing, has no criteria defined, or could not be loaded.`);
        }

        // Get the raw prompt from the node, or get the default raw prompt if it's not set.
        const rawPrompt = node.generationPrompt || this.getRawGenerationPrompt(node);

        // Fill the placeholders just-in-time for generation.
        // When generating children as part of a larger job, the count is not used.
        const filledPrompt = this.fillGenerationPrompt(rawPrompt, node, isChildGeneration ? undefined : count);

        const loopInput: LoopInput = {
            prompt: filledPrompt,
            criteria: profile.criteria,
            maxIterations: profile.maxIterations,
            response: '' // Initial response is empty
        };

        const contextNodeId = isChildGeneration ? node.parentId : nodeId;
        await this.runContentLoop(nodeId, loopInput, contextNodeId || undefined);
    }

    private async runContentLoop(nodeId: string, loopInput: LoopInput, contextNodeId?: string): Promise<void> {
        const node = this.findNodeById(nodeId);
        if (!node) {
            console.error(`Node not found in runContentLoop: ${nodeId}`);
            return;
        }

        const profile = this.settingsManager.getLastUsedProfile();
        if (profile && profile.selectedModels) {
            this.openRouterClient.setSelectedModels(profile.selectedModels);
        } else {
            // This case should be prevented by the check in generateNodeContent, but as a safeguard:
            const errorMessage = `Could not find a valid active profile with models for node ${node.title}. Cannot run content loop.`;
            this.emit('error', errorMessage);
            console.error(errorMessage);
            return;
        }

        node.isGenerating = true;
        this.emit('nodeGenerationComplete', { nodeId, success: false, node: node }); // Update UI to show spinner
        
        // Start a new generation session
        const sessionId = node.startGenerationSession(loopInput.prompt);
        let currentIterationContent: string | null = null;
        let currentIterationRatings: Rating[] = [];
        
        // Subscribe to progress updates from the orchestrator
        const onProgress = (progress: LoopProgress) => {
            
            if (progress.type === 'creator') {
                const payload = progress.payload as CreatorPayload;
                currentIterationContent = payload.response;
                
                // Live-update the content text area as the creator works, but only if not in bulk mode
                // During bulk operations, we don't want to interfere with the selected node's display
                if (!this.isGeneratingAllChildren) {
                    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
                    if (contentTextArea && document.activeElement !== contentTextArea) {
                        contentTextArea.value = payload.response;
                    }
                }
            } else if (progress.type === 'rater') {
                const payload = progress.payload as RaterProgressPayload;
                if (payload.rating && payload.rating.criterion) {
                    // Collect ratings for this iteration
                    const existingRatingIndex = currentIterationRatings.findIndex(
                        r => r.criterion === payload.rating.criterion
                    );
                    if (existingRatingIndex >= 0) {
                        currentIterationRatings[existingRatingIndex] = payload.rating;
                    } else {
                        currentIterationRatings.push(payload.rating);
                    }
                    
                    // If we have all ratings for this iteration, save it
                    if (currentIterationRatings.length === loopInput.criteria.length && currentIterationContent) {
                        node.addGenerationIteration(
                            progress.iteration, 
                            currentIterationContent, 
                            [...currentIterationRatings]
                        );
                        // Reset for next iteration
                        currentIterationRatings = [];
                    }
                }
            }
            
            // When running a loop on a child node as part of "Generate All",
            // we want to emit the progress under the parent's ID so the UI can display it.
            this.emit('loop-progress', { nodeId: contextNodeId || nodeId, progress });
        };
        this.loopOrchestrator.on('progress', onProgress);

        try {
            const result = await this.loopOrchestrator.runLoop(loopInput);
            
            // End the generation session
            node.endGenerationSession(result.success, result.finalResponse);
            
            // Set the final content using the special method that doesn't clear generation history
            node.setContentFromGeneration(result.finalResponse);
            node.generationHistory = result.history;

            this.emit('nodeGenerationComplete', { nodeId, success: true, node });

            // Automatically summarize the content after generating it, but skip if we're in bulk mode
            // (bulk operations handle summarization explicitly with proper progress suppression)
            if (!this.isGeneratingAllChildren) {
                await this.summarizeNodeContent(nodeId);
            }

        } catch (error: any) {
            console.error(`Error running content loop for node ${nodeId}:`, error);
            const errorMessage = error.message || "An unexpected error occurred during content generation.";
            
            // End the generation session with failure
            if (node.currentGenerationSession) {
                node.endGenerationSession(false, currentIterationContent || '');
            }
            
            this.emit('error', errorMessage);
            this.emit('nodeGenerationComplete', { nodeId, success: false, error, node });
        } finally {
            node.isGenerating = false;
            this.loopOrchestrator.off('progress', onProgress);
            this.saveToLocalStorage();
        }
    }

    /**
     * Parses the content of a node (expected to be a bulleted list)
     * and creates child nodes for each item.
     * @param nodeId The ID of the parent node containing the outline.
     */
    public async createChildrenFromOutline(nodeId: string): Promise<void> {
        const node = this.findNodeById(nodeId);
        if (!node || !node.content) {
            this.emit('error', `Cannot create children for node ${nodeId}: No content found.`);
            return;
        }

        this.emit('high-level-progress', { nodeId, message: 'Reading outline and generating titles...', current: 0, total: 1 });

        // Clear existing children to allow for regeneration
        node.children = [];

        const prompts = this.settingsManager.getPrompts();
        const context = this.compileNodeContext(nodeId);
        const childLevelName = node.childLevelName || 'item';

        const prompt = prompts.create_children_from_outline_user
            .replace('{{outline_content}}', node.content)
            .replace('{{child_level_name}}', childLevelName)
            .replace('{{context}}', context);

        try {
            // Using the 'creator' model as it's for generating new content/structure
            const response = await this.openRouterClient.chat('creator', prompt);
            const titles = this.parseBulletedList(response);

            if (titles.length === 0) {
                this.emit('error', `The AI did not return a valid list of titles from the outline.`);
                return;
            }

            titles.forEach(title => {
                if (typeof title === 'string') {
                    this.addNode(title, nodeId);
                }
            });

            this.saveToLocalStorage();
            // This event is listened to by the UI to trigger a full re-render.
            this.emit('nodeGenerationComplete', { nodeId, success: true, node: node });
        } catch(error) {
            console.error('Failed to create children from outline via LLM:', error);
            this.emit('error', 'The AI failed to process the outline. Please try again.');
        }
    }

    /**
     * Creates children from outline (if needed) and generates content for all children.
     * This combines the functionality of createChildrenFromOutline and generateAllChildrenContent.
     * @param nodeId The ID of the parent node.
     */
    public async generateAllChildrenContent(nodeId: string): Promise<void> {
        const node = this.findNodeById(nodeId);
        if (!node) {
            this.emit('error', `Could not find node with ID ${nodeId} to generate children content for.`);
            return;
        }

        if (!node.content || node.content.trim() === '') {
            this.emit('error', `Cannot generate children for node "${node.title}": No content found. Please write or generate content for this node first.`);
            return;
        }

        this.isGeneratingAllChildren = true; // Flag to prevent progress clearing

        // Step 1: Create children from outline if they don't exist
        if (node.children.length === 0) {
            this.emit('high-level-progress', { nodeId, message: 'Reading outline and generating titles...', current: 0, total: 1 });

            const prompts = this.settingsManager.getPrompts();
            const context = this.compileNodeContext(nodeId);
            const childLevelName = node.childLevelName || 'item';

            const prompt = prompts.create_children_from_outline_user
                .replace('{{outline_content}}', node.content)
                .replace('{{child_level_name}}', childLevelName)
                .replace('{{context}}', context);

            try {
                // Using the 'creator' model as it's for generating new content/structure
                const response = await this.openRouterClient.chat('creator', prompt);
                const titles = this.parseBulletedList(response);

                if (titles.length === 0) {
                    this.emit('error', `The AI did not return a valid list of titles from the outline.`);
                    this.isGeneratingAllChildren = false;
                    return;
                }

                titles.forEach(title => {
                    if (typeof title === 'string') {
                        this.addNode(title, nodeId);
                    }
                });

                this.saveToLocalStorage();
            } catch(error) {
                console.error('Failed to create children from outline via LLM:', error);
                this.emit('error', 'The AI failed to process the outline. Please try again.');
                this.isGeneratingAllChildren = false;
                return;
            }
        }

        // Step 2: Generate content for all children
        const children = node.children;
        const total = children.length;

        for (let i = 0; i < total; i++) {
            const child = children[i];
            this.emit('high-level-progress', { nodeId, message: `Generating content for: ${child.title}`, current: i + 1, total });
            
            // No need to pass count here, as these should be leaf or sub-branch nodes
            // where the content is prose or a more detailed outline.
            await this.generateNodeContent(child.id, 5, true);
            await this.summarizeNodeContent(child.id, true); // Pass flag to suppress progress clearing
        }

        this.isGeneratingAllChildren = false; // Reset flag
        
        // Clear progress bars and emit completion event
        this.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
        this.emit('nodeGenerationComplete', { nodeId, success: true, node });
        
        // Small delay to ensure all async operations complete, then trigger UI cleanup
        setTimeout(() => {
            this.emit('project-loaded');
        }, 100);
        

    }
    
    /**
     * Generates a summary for a given node's content using an LLM call.
     * @param nodeId The ID of the node to summarize.
     * @param suppressProgressClearing Optional flag to suppress progress clearing (used during bulk operations).
     */
    public async summarizeNodeContent(nodeId: string, suppressProgressClearing: boolean = false): Promise<void> {
        const node = this.findNodeById(nodeId);
        if (!node) {
            this.emit('error', `Could not find node with ID ${nodeId} to summarize.`);
            return;
        }

        if (!node.content || node.content.trim() === '') {
            this.emit('error', 'There is no content to summarize. Please generate or write content first.');
            return;
        }

        // Only emit progress events if not suppressed (not during bulk operations)
        if (!suppressProgressClearing) {
            this.emit('high-level-progress', { nodeId, message: 'Summarizing content...', current: 0, total: 1 });
        }

        const prompts = this.settingsManager.getPrompts();
        const systemPrompt = prompts.summarize_system.replace('{{content}}', node.content);

        try {
            const summary = await this.openRouterClient.chat('editor', systemPrompt);
            node.summary = summary;
            this.emit('nodeSummaryGenerated', { nodeId, summary });
            this.saveToLocalStorage();
            // Only clear the progress bar if not suppressed (not during bulk operations)
            if (!suppressProgressClearing) {
                this.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
            }
        } catch(error) {
            console.error(`Failed to summarize node ${nodeId}:`, error);
            this.emit('error', `An error occurred while summarizing. Please check the console for details.`);
            // Only clear the progress bar if not suppressed (not during bulk operations)
            if (!suppressProgressClearing) {
                this.emit('high-level-progress', { nodeId, message: '', current: 0, total: 1 });
            }
        }
    }

    private parseBulletedList(text: string): string[] {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('*') || line.startsWith('-'))
            .map(line => line.substring(1).trim())
            .filter(line => line.length > 0);
    }

    /**
     * Serializes the entire project state to a JSON string.
     * @returns A JSON string representing the project.
     */
    public save(): string {
        // A custom replacer can be used if we need to handle complex objects,
        // but for now, the default serialization should be sufficient.
        return JSON.stringify(this, null, 2);
    }

    /**
     * Saves the project's current state to localStorage.
     */
    public saveToLocalStorage(): void {
        try {
            this.saveAllProjectsToLocalStorage();
        } catch (error) {
            console.error("Failed to save project to localStorage:", error);
            this.emit('error', `Failed to save project to your browser's local storage. Some changes may not be persisted.`);
        }
    }

    /**
     * Saves all projects and active project ID to localStorage.
     */
    private saveAllProjectsToLocalStorage(): void {
        const projects = state.getProjects();
        const activeProject = state.getActiveProject();
        
        const projectsData = projects.map((project: ProjectManager) => project.save());
        localStorage.setItem(ProjectManager.MULTI_PROJECT_STORAGE_KEY, JSON.stringify(projectsData));
        
        if (activeProject) {
            localStorage.setItem(ProjectManager.ACTIVE_PROJECT_STORAGE_KEY, activeProject.rootNode.id);
        }
        
        // Keep legacy storage for backward compatibility
        if (activeProject) {
            localStorage.setItem(ProjectManager.LOCAL_STORAGE_KEY, activeProject.save());
        }
    }

    /**
     * Loads all projects from localStorage.
     */
    public static loadAllProjectsFromLocalStorage(
        loopOrchestrator: LoopOrchestrator,
        settingsManager: SettingsManager,
        openRouterClient: OpenRouterClient
    ): { projects: ProjectManager[], activeProjectId: string | null } {
        try {
            // Try new multi-project storage first
            const projectsJson = localStorage.getItem(ProjectManager.MULTI_PROJECT_STORAGE_KEY);
            const activeProjectId = localStorage.getItem(ProjectManager.ACTIVE_PROJECT_STORAGE_KEY);
            
            if (projectsJson) {
                const projectsData = JSON.parse(projectsJson);
                const projects = projectsData.map((data: string) => 
                    ProjectManager.load(data, loopOrchestrator, settingsManager, openRouterClient)
                );
                return { projects, activeProjectId };
            }
            
            // Fall back to legacy single project storage
            const legacyProjectJson = localStorage.getItem(ProjectManager.LOCAL_STORAGE_KEY);
            if (legacyProjectJson) {
                const project = ProjectManager.load(legacyProjectJson, loopOrchestrator, settingsManager, openRouterClient);
                return { projects: [project], activeProjectId: project.rootNode.id };
            }
            
            return { projects: [], activeProjectId: null };
        } catch (error) {
            console.error("Failed to load projects from localStorage:", error);
            return { projects: [], activeProjectId: null };
        }
    }

    /**
     * Creates a ProjectManager instance from a JSON string.
     * @param json The JSON string representing a saved project.
     * @returns A new instance of ProjectManager.
     */
    public static load(
        json: string, 
        loopOrchestrator: LoopOrchestrator, 
        settingsManager: SettingsManager,
        openRouterClient: OpenRouterClient
    ): ProjectManager {
        const plainObject = JSON.parse(json);
        
        // Re-create the template instance
        const template = new ProjectTemplate(
            plainObject.template.name,
            plainObject.template.hierarchyLevels,
            plainObject.template.scaffoldingDocuments
        );
        
        // Create the project manager instance
        const project = new ProjectManager(
            plainObject.projectTitle, 
            template, 
            loopOrchestrator, 
            settingsManager, 
            openRouterClient
        );
        
        // The rootNode is created in the constructor, but we need to overwrite it
        // with the hydrated version of our saved node tree.
        project.rootNode = this.rehydrateNode(plainObject.rootNode);
        
        return project;
    }

    /**
     * Recursively reconstructs DocumentNode instances from plain objects.
     * @param plainNode The plain object representation of a node.
     * @returns A DocumentNode instance.
     */
    private static rehydrateNode(plainNode: any): DocumentNode {
        // Create a new node instance to get access to class methods
        const node = new DocumentNode(plainNode.level, plainNode.title, plainNode.parentId, plainNode.template);
        
        // We assign to _content directly to avoid clearing the summary on load,
        // as we assume the saved state is consistent.
        node['_content'] = plainNode.content || '';

        // Overwrite the other plain properties from the saved data
        Object.assign(node, {
            id: plainNode.id,
            summary: plainNode.summary || '',
            generationPrompt: plainNode.generationPrompt || null,
            generationHistory: plainNode.generationHistory || [],
            generationSessions: plainNode.generationSessions || [],
            children: [], // Reset children, as they will be rehydrated recursively
        });

        // Recursively rehydrate and add children
        if (plainNode.children && plainNode.children.length > 0) {
            node.children = plainNode.children.map((child: any) => this.rehydrateNode(child));
        }

        return node;
    }

    public selectNode(nodeId: string | null) {
        this.selectedNodeId = nodeId;
        const node = nodeId ? this.findNodeById(nodeId) : null;
        this.emit('node-selected', node);
    }

    /**
     * Checks if any node in the project is currently generating content.
     * This is used to prevent concurrent operations that could cause conflicts.
     * @returns true if any node is currently generating, false otherwise
     */
    public isAnyNodeGenerating(): boolean {
        const checkNode = (node: DocumentNode): boolean => {
            if (node.isGenerating) return true;
            return node.children.some(child => checkNode(child));
        };
        
        return checkNode(this.rootNode);
    }
} 