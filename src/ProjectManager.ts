import { DocumentNode } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { LoopOrchestrator, LoopInput, QualityCriterion } from './LoopOrchestrator';
import { EventEmitter } from './EventEmitter';
import { SettingsManager, SettingsProfile } from './SettingsManager';

type ProjectManagerEvents = {
    'error': [message: string];
    'nodeGenerationProgress': [payload: { nodeId: string, content: string }];
    'nodeGenerationComplete': [payload: { nodeId: string, success: boolean, node?: DocumentNode, error?: any }];
};

export class ProjectManager extends EventEmitter<ProjectManagerEvents> {
    projectTitle: string;
    template: ProjectTemplate;
    rootNode: DocumentNode;
    private loopOrchestrator: LoopOrchestrator;
    private settingsManager: SettingsManager;

    constructor(
        projectTitle: string, 
        template: ProjectTemplate, 
        loopOrchestrator: LoopOrchestrator,
        settingsManager: SettingsManager
    ) {
        super();
        this.projectTitle = projectTitle;
        this.template = template;
        this.loopOrchestrator = loopOrchestrator;
        this.settingsManager = settingsManager;

        // The root node is always level 0 and has the first name from the hierarchy
        const rootNodeTitle = template.hierarchyLevels[0] || 'Root';
        this.rootNode = new DocumentNode(0, rootNodeTitle);
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
    public addNode(title: string, parentId: string): DocumentNode {
        const parentNode = this.findNodeById(parentId);
        if (!parentNode) {
            throw new Error(`Parent node with ID "${parentId}" not found.`);
        }

        const newLevel = parentNode.level + 1;
        const newNode = new DocumentNode(newLevel, title, parentId);
        
        parentNode.children.push(newNode);
        
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
     * Gathers context for a specific node to guide content generation.
     * @param nodeId The ID of the node to compile context for.
     * @returns A string containing the contextual information.
     */
    private compileNodeContext(nodeId: string): string {
        const node = this.findNodeById(nodeId);
        if (!node) {
            return '';
        }

        const contextParts: string[] = [`Project: ${this.projectTitle}`];
        
        // Traverse up to the root to build the path
        let current: DocumentNode | null = node;
        const path: string[] = [];
        while (current) {
            const levelName = this.template.hierarchyLevels[current.level] || `Level ${current.level}`;
            path.unshift(`${levelName}: ${current.title}`);
            current = current.parentId ? this.findNodeById(current.parentId) : null;
        }

        return [...contextParts, ...path].join('\\n');
    }

    public async generateNodeContent(nodeId: string, prompt: string): Promise<void> {
        const node = this.findNodeById(nodeId);
        if (!node) {
            this.emit('error', `Node with ID "${nodeId}" not found.`);
            return;
        }

        // Get the generation profile for the node
        const profile = this.settingsManager.getProfile(node.settingsProfileName) || this.settingsManager.getLastUsedProfile();
        if (!profile) {
            this.emit('error', `Could not find a settings profile named "${node.settingsProfileName}" or a default profile.`);
            return;
        }

        node.prompt = prompt;

        const context = this.compileNodeContext(nodeId);
        const fullPrompt = `${context}\\n\\n${prompt}`;

        const loopInput: LoopInput = {
            prompt: fullPrompt,
            criteria: profile.criteria,
            maxIterations: profile.maxIterations,
        };
        
        // Use a temporary listener for this specific job
        const progressListener = (update: any) => {
            if (update.type === 'creator') {
                node.content = update.payload.response;
                this.emit('nodeGenerationProgress', { nodeId, content: node.content });
            }
        };
        
        this.loopOrchestrator.on('progress', progressListener);
        
        try {
            const result = await this.loopOrchestrator.runLoop(loopInput);
            node.content = result.finalResponse;
            node.generationHistory = result.history;
            this.emit('nodeGenerationComplete', { nodeId, success: true, node });
        } catch (error) {
            this.emit('nodeGenerationComplete', { nodeId, success: false, error });
        } finally {
            // Clean up the listener after the job is done
            this.loopOrchestrator.off('progress', progressListener);
        }
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
     * Creates a ProjectManager instance from a JSON string.
     * @param json The JSON string representing a saved project.
     * @returns A new instance of ProjectManager.
     */
    public static load(json: string, loopOrchestrator: LoopOrchestrator, settingsManager: SettingsManager): ProjectManager {
        const plainObject = JSON.parse(json);
        
        // Re-create the template instance
        const template = new ProjectTemplate(
            plainObject.template.name,
            plainObject.template.hierarchyLevels,
            plainObject.template.scaffoldingDocuments
        );
        
        // Create the project manager instance
        const project = new ProjectManager(plainObject.projectTitle, template, loopOrchestrator, settingsManager);
        
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
        const node = new DocumentNode(plainNode.level, plainNode.title, plainNode.parentId);
        
        // Overwrite the plain properties from the saved data
        Object.assign(node, {
            id: plainNode.id,
            content: plainNode.content || '',
            summary: plainNode.summary || '',
            inheritedContext: plainNode.inheritedContext || '',
            prompt: plainNode.prompt || '',
            generationHistory: plainNode.generationHistory || [],
            settingsProfileName: plainNode.settingsProfileName || 'default',
            children: [], // Reset children, as they will be rehydrated recursively
        });

        // Recursively rehydrate and add children
        if (plainNode.children && plainNode.children.length > 0) {
            node.children = plainNode.children.map((child: any) => this.rehydrateNode(child));
        }

        return node;
    }
} 