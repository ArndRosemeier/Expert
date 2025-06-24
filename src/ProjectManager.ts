import { DocumentNode } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { LoopOrchestrator, LoopInput, LoopProgress, Rating, RaterProgressPayload } from './LoopOrchestrator';
import { EventEmitter } from './EventEmitter';
import { SettingsManager, SettingsProfile } from './SettingsManager';
import { OpenRouterClient } from './OpenRouterClient';
import { QualityCriterion, CreatorPayload } from './types';
import { StorageService, IStorageService } from './StorageService';
import { IndexedDBService } from './IndexedDBService';
import * as state from './state';
import { 
    GenerationService, 
    TreeService, 
    ContextService, 
    PromptService, 
    GenerationController, 
    ProjectPersistenceService 
} from './project';

type ProjectManagerEvents = {
    'project-loaded': [];
    'node-selected': [node: DocumentNode | null];
    'nodeGenerationStarted': [e: { nodeId: string, node: DocumentNode }];
    'nodeGenerationComplete': [e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }];
    'nodeGenerationAborted': [e: { nodeId: string, node: DocumentNode }];
    'loop-progress': [e: { nodeId: string, progress: LoopProgress }];
    'high-level-progress': [e: { nodeId: string, message: string, current: number, total: number }];
    'nodePromptGenerated': [e: { nodeId:string, prompt: string, isPromptGenerating: boolean }];
    'nodeSummaryGenerated': [e: { nodeId: string, summary: string }];
    'error': [message: string];
};

interface ProjectRecord {
    id: string;
    title: string;
    templateName: string;
    createdAt: Date;
    lastModified: Date;
    data: string; // serialized project data
}

export class ProjectManager extends EventEmitter<ProjectManagerEvents> {
    private static readonly MULTI_PROJECT_STORAGE_KEY = 'expert_app_projects';
    private static readonly ACTIVE_PROJECT_STORAGE_KEY = 'expert_app_active_project';

    projectTitle: string;
    template: ProjectTemplate;
    rootNode!: DocumentNode;
    private loopOrchestrator: LoopOrchestrator;
    private settingsManager: SettingsManager;
    private openRouterClient: OpenRouterClient;
    private selectedNodeId: string | null = null;
    // Legacy generation state removed - managed by GenerationService
    public _listenersSetup: boolean = false;
    private static storageService: Promise<IStorageService> | null = null;
    
    // Extracted services
    private treeService: TreeService;
    private contextService: ContextService;
    private promptService: PromptService;
    private generationController: GenerationController;
    private generationService: GenerationService;
    
    // Service accessors for UI
    public getGenerationService(): GenerationService { return this.generationService; }
    public getTreeService(): TreeService { return this.treeService; }
    public getContextService(): ContextService { return this.contextService; }
    public getPromptService(): PromptService { return this.promptService; }
    public getGenerationController(): GenerationController { return this.generationController; }

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
        if (!this.template.hierarchyLevels || this.template.hierarchyLevels.length === 0) {
            throw new Error(`Invalid template: "${this.template.name}" has no hierarchy levels defined.`);
        }
        this.rootNode = new DocumentNode(0, this.projectTitle, null, this.template.hierarchyLevels);

        // Initialize extracted services
        this.treeService = new TreeService();
        this.contextService = new ContextService(this.treeService);
        this.promptService = new PromptService(this.settingsManager);
        this.generationController = new GenerationController(this.loopOrchestrator, this.treeService);
        
        // Initialize GenerationService with all dependencies
        this.generationService = new GenerationService({
            treeService: this.treeService,
            contextService: this.contextService,
            promptService: this.promptService,
            generationController: this.generationController,
            loopOrchestrator: this.loopOrchestrator,
            settingsManager: this.settingsManager,
            openRouterClient: this.openRouterClient,
            eventEmitter: this,
            saveToStorage: () => this.saveToStorage(),
            rootNode: this.rootNode
        });

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
     * Gets the storage service instance
     */
    private static async getStorageService(): Promise<IStorageService> {
        if (!ProjectManager.storageService) {
            ProjectManager.storageService = StorageService.getInstance();
        }
        return ProjectManager.storageService;
    }

    /**
     * Gets the IndexedDB service if using IndexedDB, null otherwise
     */
    private static async getIndexedDBService(): Promise<IndexedDBService | null> {
        const storage = await ProjectManager.getStorageService();
        if (storage.isIndexedDB()) {
            // Access the IndexedDB service from the storage instance
            const service = await StorageService.getInstance();
            if (service.isIndexedDB()) {
                // Return the IndexedDB service for direct project operations
                return (service as any).indexedDBService;
            }
        }
        return null;
    }

    /**
     * Finds a node in the document tree by its ID, starting from a given node.
     * @param id The ID of the node to find.
     * @param startNode The node to start the search from. Defaults to the project's root node.
     * @returns The found DocumentNode, or null if not found.
     */
    public findNodeById(id: string, startNode: DocumentNode = this.rootNode): DocumentNode | null {
        // Delegate to TreeService
        return this.treeService.findNodeById(id, startNode);
    }

    /**
     * Adds a new node to the document tree under a specified parent.
     * @param title The title of the new node.
     * @param parentId The ID of the parent node.
     * @returns The newly created DocumentNode.
     */
    public addNode(title: string, parentId: string | null = null): DocumentNode {
        // Delegate to TreeService
        return this.treeService.addNode(title, parentId, this.rootNode);
    }

    /**
     * Removes a node (and all its descendants) from the tree.
     * @param id The ID of the node to remove.
     * @returns True if the node was found and removed, otherwise false.
     */
    public removeNode(id: string): boolean {
        // Delegate to TreeService
        return this.treeService.removeNode(id, this.rootNode);
    }

    /**
     * Gathers rich, hierarchical context for a specific node to guide content generation.
     * This method compiles the direct parent's content and full content of preceding siblings.
     * Modern LLMs have large context windows, so we use direct content for maximum precision.
     * @param nodeId The ID of the node to compile context for.
     * @returns A string containing the contextual information.
     */
    private compileNodeContext(nodeId: string): string {
        const targetNode = this.findNodeById(nodeId);

        if (!targetNode) {
            return '';
        }

        const contextParts: string[] = [];

        // 1. Add inherited context from all ancestors (root to immediate parent)
        const ancestralContext = this.collectAncestralContext(targetNode);
        if (ancestralContext.length > 0) {
            contextParts.push("ANCESTRAL CONTEXT (inherited from hierarchy):");
            contextParts.push(ancestralContext.join('\n\n'));
        }

        // 2. Add the current node's own context if it exists
        if (targetNode.context && targetNode.context.trim()) {
            const nodeLevelName = targetNode.template[targetNode.level] || `Level ${targetNode.level}`;
            contextParts.push(`CURRENT NODE CONTEXT (${nodeLevelName}: "${targetNode.title}"):\n---\n${targetNode.context}\n---`);
        }

        // Only continue with parent/sibling context if node has a parent
        if (!targetNode.parentId) {
            return contextParts.join('\n\n====================\n\n');
        }

        const parent = this.findNodeById(targetNode.parentId);
        if (!parent) {
            return contextParts.join('\n\n====================\n\n');
        }

        // 3. Add the parent's content (the outline). This is the most critical structural context.
        if (parent.content) {
            const parentLevelName = parent.template[parent.level] || `Level ${parent.level}`;
            contextParts.push(`STRUCTURAL CONTEXT FROM PARENT (${parentLevelName}: "${parent.title}"):\n---\n${parent.content}\n---`);
        }

        // 4. Add the list of all sibling titles to give a sense of scope.
        if (parent.children.length > 1) {
            const nodeLevelName = targetNode.template[targetNode.level] || `Level ${targetNode.level}`;
            const siblingTitles = parent.children.map(child => `- ${child.title} ${child.id === nodeId ? '(This node)' : ''}`).join('\n');
            contextParts.push(`SIBLING SCOPE (${nodeLevelName} nodes at this level):\n${siblingTitles}`);
        }

        // 5. Add full content of preceding siblings that have already been generated.
        const precedingSiblingContent: string[] = [];
        const siblingIndex = parent.children.findIndex(child => child.id === targetNode.id);

        if (siblingIndex > 0) {
            precedingSiblingContent.push("CONTENT FROM PRECEDING SIBLINGS:");
            for (let i = 0; i < siblingIndex; i++) {
                const sibling = parent.children[i];
                if (sibling.content) {
                    precedingSiblingContent.push(`Content for "${sibling.title}":\n---\n${sibling.content}\n---`);
                }
            }
        }
        
        if (precedingSiblingContent.length > 1) { // more than just the header
             contextParts.push(precedingSiblingContent.join('\n\n'));
        }

        return contextParts.join('\n\n====================\n\n');
    }

    /**
     * Collects context from all ancestors of a node, from root down to immediate parent.
     * This creates an inheritance chain where child nodes benefit from all ancestral context.
     */
    private collectAncestralContext(targetNode: DocumentNode): string[] {
        const contextChain: string[] = [];
        
        // Build the path from root to parent (excluding the target node itself)
        const ancestorPath: DocumentNode[] = [];
        let currentNode = targetNode.parentId ? this.findNodeById(targetNode.parentId) : null;
        
        // Walk up to build the ancestor chain
        while (currentNode) {
            ancestorPath.unshift(currentNode); // Add to front to get root-to-parent order
            currentNode = currentNode.parentId ? this.findNodeById(currentNode.parentId) : null;
        }

        // Process each ancestor's context
        ancestorPath.forEach((ancestor, index) => {
            if (ancestor.context && ancestor.context.trim()) {
                const levelName = ancestor.template[ancestor.level] || `Level ${ancestor.level}`;
                const depth = index === 0 ? 'ROOT' : `LEVEL ${index}`;
                contextChain.push(`${depth} (${levelName}: "${ancestor.title}"):\n---\n${ancestor.context}\n---`);
            }
        });

        return contextChain;
    }

    public getNodePath(nodeId: string): string {
        // Delegate to TreeService
        return this.treeService.getNodePath(nodeId, this.rootNode);
    }

    /**
     * Gets the raw, unprocessed generation prompt for a node, which includes placeholders.
     * @param node The node for which to get the prompt template.
     * @returns The raw prompt template string.
     */
    public getRawGenerationPrompt(node: DocumentNode): string {
        const prompts = this.settingsManager.getPrompts();
        
        // Special handling for root node (text expansion)
        if (!node.parentId) {
            return prompts.expand_text_user;
        }
        
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
            .replace(/\{\{child_level_name\}\}/g, node.childLevelName || '')
            .replace(/\{\{content\}\}/g, node.content || '');
        
        // Special handling for root node prompts (no additional placeholders needed)
        if (!node.parentId) {
            // Root nodes use the expand_text_user prompt which is now user-customizable
        }
        
        if (!node.isLeaf && count) {
            filledPrompt = filledPrompt.replace(/\{\{count\}\}/g, String(count));
        }

        return filledPrompt;
    }

    // Method removed - use GenerationService directly

    // Method removed - use GenerationService directly

    // Method removed - use GenerationService directly

    private clearAllGeneratingFlags(): void {
        const clearNode = (node: DocumentNode): void => {
            node.isGenerating = false;
            node.children.forEach(child => clearNode(child));
        };
        clearNode(this.rootNode);
    }

    // filterCriteriaForNodeType method removed - available in GenerationService

    // Method removed - use GenerationService directly

    // Legacy runContentLoop method removed - functionality moved to GenerationService

    // Method removed - use GenerationService directly

    // Method removed - use GenerationService directly
    
    // Method removed - use GenerationService directly

    // parseBulletedList method removed - available in GenerationService

    /**
     * Serializes the project state to a JSON string.
     * Only serializes the persistent data, not the services or dependencies.
     * @returns A JSON string representing the project.
     */
    public save(): string {
        // Create a plain object with only the serializable properties
        const serializableData = {
            projectTitle: this.projectTitle,
            template: {
                name: this.template.name,
                hierarchyLevels: this.template.hierarchyLevels,
                scaffoldingDocuments: this.template.scaffoldingDocuments
            },
            rootNode: this.rootNode,
            selectedNodeId: this.selectedNodeId
        };
        
        return JSON.stringify(serializableData, null, 2);
    }

    /**
     * Saves the project's current state to storage.
     */
    public async saveToStorage(): Promise<void> {
        try {
            await this.saveAllProjectsToStorage();
        } catch (error) {
            console.error("Failed to save project to storage:", error);
            this.emit('error', `Failed to save project to storage. Some changes may not be persisted.`);
        }
    }

    /**
     * Clears all projects from storage.
     */
    public async clearAllProjectsFromStorage(): Promise<void> {
        try {
            const storage = await ProjectManager.getStorageService();
            const indexedDB = await ProjectManager.getIndexedDBService();
            
            if (indexedDB) {
                // Clear all projects from IndexedDB
                await indexedDB.clear('projects');
            } else {
                // This should never happen with IndexedDB-only storage
                throw new Error('IndexedDB service is not available but was expected');
            }
            
            // Clear active project references
            await storage.delete(ProjectManager.ACTIVE_PROJECT_STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear projects from storage:', error);
            throw error;
        }
    }

    /**
     * Saves all projects and active project ID to storage.
     */
    private async saveAllProjectsToStorage(): Promise<void> {
        const projects = state.getProjects();
        const activeProject = state.getActiveProject();
        
        try {
            const storage = await ProjectManager.getStorageService();
            const indexedDB = await ProjectManager.getIndexedDBService();
            
            if (indexedDB) {
                // Use IndexedDB for efficient project storage
                for (const project of projects) {
                    const projectRecord: ProjectRecord = {
                        id: project.rootNode.id,
                        title: project.projectTitle,
                        templateName: project.template.name,
                        createdAt: new Date(), // Could store actual creation date
                        lastModified: new Date(),
                        data: project.save()
                    };
                    await indexedDB.set('projects', project.rootNode.id, projectRecord);
        }
            } else {
                // This should never happen with IndexedDB-only storage
                throw new Error('IndexedDB service is not available but was expected');
            }
            
            // Save active project ID
        if (activeProject) {
                await storage.set(ProjectManager.ACTIVE_PROJECT_STORAGE_KEY, activeProject.rootNode.id);
            }
        } catch (error) {
            console.error('Failed to save projects to storage:', error);
            throw error;
        }
    }

    /**
     * Loads all projects from IndexedDB storage.
     */
    public static async loadAllProjectsFromStorage(
        loopOrchestrator: LoopOrchestrator,
        settingsManager: SettingsManager,
        openRouterClient: OpenRouterClient
    ): Promise<{ projects: ProjectManager[], activeProjectId: string | null }> {
        try {
            const storage = await ProjectManager.getStorageService();
            const indexedDB = await ProjectManager.getIndexedDBService();
            
            if (indexedDB) {
                // Load from IndexedDB
                const projectRecords = await indexedDB.getAll<ProjectRecord>('projects');
                const activeProjectId = await storage.get<string>(ProjectManager.ACTIVE_PROJECT_STORAGE_KEY);
            
                if (projectRecords && Object.keys(projectRecords).length > 0) {
                    const projects = Object.values(projectRecords).map((record: ProjectRecord) => 
                        ProjectManager.load(record.data, loopOrchestrator, settingsManager, openRouterClient)
                );
                    return { projects, activeProjectId: activeProjectId || null };
                }
            } else {
                // This should never happen with IndexedDB-only storage
                throw new Error('IndexedDB service is not available but was expected');
            }
            
            return { projects: [], activeProjectId: null };
        } catch (error) {
            console.error("Failed to load projects from storage:", error);
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
        
        // Update the GenerationService with the new rootNode reference
        project.generationService = new GenerationService({
            treeService: project.treeService,
            contextService: project.contextService,
            promptService: project.promptService,
            generationController: project.generationController,
            loopOrchestrator: project.loopOrchestrator,
            settingsManager: project.settingsManager,
            openRouterClient: project.openRouterClient,
            eventEmitter: project,
            saveToStorage: () => project.saveToStorage(),
            rootNode: project.rootNode // Use the updated rootNode
        });
        
        // Restore selectedNodeId if it was saved
        if (plainObject.selectedNodeId) {
            project.selectedNodeId = plainObject.selectedNodeId;
        }
        
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
            context: plainNode.context || plainNode.summary || '', // Handle legacy summary field
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
        // Delegate to TreeService
        return this.treeService.isAnyNodeGenerating(this.rootNode);
    }
} 