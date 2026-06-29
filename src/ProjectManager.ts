import { DocumentNode } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { LoopOrchestrator, LoopProgress, LoopInput } from './LoopOrchestrator';
import { EventEmitter } from './EventEmitter';
import { SettingsManager } from './SettingsManager';
import { OpenRouterClient } from './OpenRouterClient';
import { AssertFlatTemplateCopy } from './ProjectUtils';
import { ContextIDGenerator } from './ContextIDGenerator';



import * as state from './state';
import { 
    TreeService, 
    ContextService, 
    PromptService, 
    GenerationController, 
    ContextExtractionService
} from './project';
import { GenerationCoordinator } from './project/GenerationCoordinator';
import { STORAGE_KEYS } from './constants';

// NEW: Import our persistence utilities to eliminate duplication
import { 
    StorageOperations,
    getStorageServices 
} from './ui/utils/PersistenceUtils';


type ProjectManagerEvents = {
    'project-loaded': [];
    'node-selected': [node: DocumentNode | null];
    'nodeGenerationStarted': [e: { nodeId: string, node: DocumentNode }];
    'nodeGenerationComplete': [e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }];
    'bulkGenerationComplete': [e: { nodeId: string; node: DocumentNode; operation: string; options: any; success: boolean }];
    'nodeGenerationAborted': [e: { nodeId: string, node: DocumentNode }];
    'loop-progress': [e: { nodeId: string, progress: LoopProgress }];
    'loop-started': [e: { nodeId: string, input: LoopInput }];
    'loop-phase-started': [e: { nodeId: string, phase: 'create' | 'rate' | 'edit', iteration: number }];
    'loop-iteration-started': [e: { nodeId: string, iteration: number, maxIterations: number }];
    'loop-aborted': [e: { nodeId: string }];
    'high-level-progress': [e: { nodeId: string, message: string, current: number, total: number }];
    'unified-progress': [e: { nodeId: string; operations?: { message: string; current: number; total: number }; iterations?: { message: string; current: number; total: number }; stages?: { message: string; current: number; total: number }; detail?: string }];
    'tree-update-needed': [e: { nodeId: string; reason: string }];
    'coherenceAnalysisStarted': [e: { nodeId: string, node: DocumentNode }];
    'coherenceAnalysisComplete': [e: { nodeId: string, node: DocumentNode, hasContradictions: boolean, contradictionCount: number }];
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

    private static readonly ACTIVE_PROJECT_STORAGE_KEY = STORAGE_KEYS.ACTIVE_PROJECT;

    template: ProjectTemplate;
    rootNode!: DocumentNode;
    language: string | null = null; // Project-specific language setting

    /**
     * The project's name is always its root node's live title. There is no
     * separate stored copy, so renaming the root node renames the project with
     * no risk of the two drifting out of sync.
     */
    get projectTitle(): string {
        return this.rootNode.title;
    }
    private loopOrchestrator: LoopOrchestrator;
    private settingsManager: SettingsManager;
    private openRouterClient: OpenRouterClient;
    private selectedNodeId: string | null = null;
    // Legacy generation state removed - managed by GenerationService
    public _listenersSetup: boolean = false;

    
    // Extracted services
    private treeService: TreeService;
    private contextService: ContextService;
    private promptService: PromptService;
    private generationController: GenerationController;

    private contextExtractionService: ContextExtractionService;
    
    // Generation coordination
    private generationCoordinator: GenerationCoordinator;
    

    
    // Service accessors for UI

    public getTreeService(): TreeService { return this.treeService; }
    public getContextService(): ContextService { return this.contextService; }
    public getPromptService(): PromptService { return this.promptService; }
    public getGenerationController(): GenerationController { return this.generationController; }
    public getContextExtractionService(): ContextExtractionService { return this.contextExtractionService; }
    public getGenerationCoordinator(): GenerationCoordinator { return this.generationCoordinator; }
    public getSettingsManager(): SettingsManager { return this.settingsManager; }

    // Language management
    public getLanguage(): string | null { return this.language; }
    public setLanguage(language: string | null): void { this.language = language; }


    constructor(
        projectTitle: string, 
        template: ProjectTemplate, 
        loopOrchestrator: LoopOrchestrator,
        settingsManager: SettingsManager,
        openRouterClient: OpenRouterClient
    ) {
        super();
        this.template = template;
        this.loopOrchestrator = loopOrchestrator;
        this.settingsManager = settingsManager;
        this.openRouterClient = openRouterClient;

        // The root node's title should be the project title.
        if (!this.template.hierarchyLevels || this.template.hierarchyLevels.length === 0) {
            throw new Error(`Invalid template: "${this.template.name}" has no hierarchy levels defined.`);
        }
        
        // Create a deep copy of the hierarchy levels for the root node
        // This allows project-wide template modifications while child nodes share the reference
        const rootNodeTemplate = [...this.template.hierarchyLevels];
        // Copy the per-layer length hints aligned to the hierarchy. Children
        // inherit this (TreeService.addNode) / share it (AssertFlatTemplateCopy).
        // ProjectTemplate always provides layerLengths (its constructor aligns it
        // to the hierarchy and defaults missing entries to null).
        const templateLayerLengths = this.template.layerLengths;
        const rootNodeLayerLengths = rootNodeTemplate.map((_, i) => templateLayerLengths[i] ?? null);
        this.rootNode = new DocumentNode(0, projectTitle, null, rootNodeTemplate, '', rootNodeLayerLengths);
        
        // Root node keeps its UUID as the project identifier - only child nodes get normalized IDs

        // Initialize extracted services
        this.treeService = new TreeService();
        this.contextService = new ContextService(this.treeService);
        this.promptService = new PromptService(this.settingsManager);
        this.generationController = new GenerationController(this.loopOrchestrator, this.treeService);
        this.contextExtractionService = new ContextExtractionService(this.openRouterClient, this.settingsManager);
        
        // Initialize generation coordinator
        this.generationCoordinator = new GenerationCoordinator(this);
        


        // Ensure we have a valid profile set globally, but preserve user's choice
        // Wait for SettingsManager to be fully initialized before validating profiles
        void this.settingsManager.waitForInitialization().then(() => {
            const currentProfile = this.settingsManager.getLastUsedProfileName();
            const currentProfileData = currentProfile ? this.settingsManager.getProfile(currentProfile) : null;
            
            // Only change the profile if the current one is invalid
            if (!currentProfileData?.criteria || currentProfileData.criteria.length === 0) {
                const availableProfiles = this.settingsManager.getProfileNames();
                const firstValidProfile = availableProfiles.find(name => {
                    const p = this.settingsManager.getProfile(name);
                    return p?.criteria && p.criteria.length > 0;
                });
                
                if (firstValidProfile) {
                    void this.settingsManager.setLastUsedProfile(firstValidProfile);
                }
                // If no valid profile exists, the error will be caught during generation
            }
        });
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
     * @param creatorModel Optional model name that created this node.
     * @param childIndex Optional child index for selective context copying (1-based, used when creating multiple children)
     * @returns The newly created DocumentNode.
     */
    public addNode(title: string, parentId: string | null = null, creatorModel?: string, childIndex?: number): DocumentNode {
        // Delegate to TreeService
        return this.treeService.addNode(title, parentId, this.rootNode, creatorModel, childIndex);
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
    // Legacy context compilation methods removed - now handled by ContextService

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
                hierarchyLevels: this.template.hierarchyLevels
            },
            rootNode: this.rootNode,
            selectedNodeId: this.selectedNodeId,
            language: this.language
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
    /**
     * Clears all projects from storage - REFACTORED using PersistenceUtils
     */
    public async clearAllProjectsFromStorage(): Promise<void> {
        await StorageOperations.clearProjects(async (services) => {
            // Clear all projects from IndexedDB
            await services.indexedDB!.clear('projects');
            
            // Clear active project references
            await services.storage.delete(ProjectManager.ACTIVE_PROJECT_STORAGE_KEY);
        });
    }

    /**
     * Saves all projects and active project ID to storage.
     */
    private async saveAllProjectsToStorage(): Promise<void> {
        const projects = state.getProjects();
        const activeProject = state.getActiveProject();
        
        await StorageOperations.saveProjects(async (services) => {
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
                await services.indexedDB!.set('projects', project.rootNode.id, projectRecord);
            }
            
            // Save active project ID
            if (activeProject) {
                await services.storage.set(ProjectManager.ACTIVE_PROJECT_STORAGE_KEY, activeProject.rootNode.id);
            }
        });
    }

    /**
     * Loads all projects from IndexedDB storage - REFACTORED using PersistenceUtils
     */
    public static async loadAllProjectsFromStorage(
        loopOrchestrator: LoopOrchestrator,
        settingsManager: SettingsManager,
        openRouterClient: OpenRouterClient
    ): Promise<{ projects: ProjectManager[], activeProjectId: string | null }> {
        try {
            const services = await getStorageServices(true);
            
            // Load from IndexedDB
            const projectRecords = await services.indexedDB!.getAll<ProjectRecord>('projects');
            const activeProjectId = await services.storage.get<string>(ProjectManager.ACTIVE_PROJECT_STORAGE_KEY);
        
            if (projectRecords && Object.keys(projectRecords).length > 0) {
                const projects = Object.values(projectRecords).map((record: ProjectRecord) => 
                    ProjectManager.load(record.data, loopOrchestrator, settingsManager, openRouterClient)
                );
                
                // Context IDs are normalized in memory during project loading
                // Project IDs (root node IDs) remain unchanged, so activeProjectId is still valid
                
                return { projects, activeProjectId: activeProjectId ?? null };
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
            plainObject.template.hierarchyLevels
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
        
        // Normalize conditional context item IDs to use the new format (IN MEMORY ONLY)
        ContextIDGenerator.getInstance().normalizeConditionalContextIds(project.rootNode);
        
        // The rootNode is now properly set - no need to recreate GenerationService
        
        // Restore selectedNodeId if it was saved
        if (plainObject.selectedNodeId) {
            project.selectedNodeId = plainObject.selectedNodeId;
        }
        
        // Restore language if it was saved, default to English if not
        if (plainObject.language) {
            project.language = plainObject.language;
        } else {
            // Default to English for projects that don't have a language set
            project.language = 'English';
            console.log(`🌐 Project "${plainObject.projectTitle}" loaded without language, defaulting to English`);
        }
        
        // Ensure all nodes share the same template reference
        AssertFlatTemplateCopy(project);
        
        return project;
    }

    /**
     * Recursively reconstructs DocumentNode instances from plain objects.
     * @param plainNode The plain object representation of a node.
     * @param rootTemplate Optional root template reference for child nodes to share.
     * @returns A DocumentNode instance.
     */
    private static rehydrateNode(plainNode: any, rootTemplate?: string[]): DocumentNode {
        // For root node (level 0), create a deep copy of the template
        // For child nodes, share the root template reference
        let nodeTemplate: string[];
        if (plainNode.level === 0) {
            // Root node gets a deep copy
            nodeTemplate = [...(plainNode.template ?? [])];
        } else {
            // Child nodes share the root template reference
            nodeTemplate = (rootTemplate ?? plainNode.template) ?? [];
        }
        
        // Update the node data with the correct template before conversion
        const nodeDataWithTemplate = {
            ...plainNode,
            template: nodeTemplate
        };
        
        // Use DocumentNode.fromJSON for comprehensive version handling
        const node = DocumentNode.fromJSON(nodeDataWithTemplate);
        
        // Recursively rehydrate and add children, passing the root template for sharing
        if (plainNode.children && plainNode.children.length > 0) {
            const templateToShare = plainNode.level === 0 ? nodeTemplate : rootTemplate;
            node.children = plainNode.children.map((child: any) => this.rehydrateNode(child, templateToShare));
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
        // Use the generation coordinator for centralized state
        return this.generationCoordinator.hasActiveOperations();
    }
} 