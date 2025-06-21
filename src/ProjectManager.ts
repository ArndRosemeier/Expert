import { DocumentNode } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { LoopOrchestrator, LoopInput, QualityCriterion } from './LoopOrchestrator';
import { EventEmitter } from './EventEmitter';
import { SettingsManager, SettingsProfile } from './SettingsManager';
import { OpenRouterClient } from './OpenRouterClient';

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
    private openRouterClient: OpenRouterClient;

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

        // The root node is always level 0 and has the first name from the hierarchy
        const rootNodeTitle = this.template.hierarchyLevels[0] || 'Root';
        this.rootNode = new DocumentNode(0, rootNodeTitle, null, this.template.hierarchyLevels);
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
        const newNode = new DocumentNode(newLevel, title, parentId, parentNode.template);
        
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
     * Gathers rich, hierarchical context for a specific node to guide content generation.
     * Traverses up the tree, collecting summaries of preceding "uncles" and "cousins",
     * then collects summaries of preceding siblings.
     * @param nodeId The ID of the node to compile context for.
     * @returns A string containing the contextual information.
     */
    private compileNodeContext(nodeId: string): string {
        const targetNode = this.findNodeById(nodeId);
        if (!targetNode) return '';
    
        const contextParts: string[] = [];
        let currentNode = targetNode;
    
        // 1. Add context from preceding siblings
        if (currentNode.parentId) {
            const parent = this.findNodeById(currentNode.parentId);
            if (parent) {
                const siblingIndex = parent.children.findIndex(child => child.id === currentNode.id);
                for (let i = 0; i < siblingIndex; i++) {
                    const sibling = parent.children[i];
                    if (sibling.summary) {
                        contextParts.unshift(`Summary of sibling "${sibling.title}":\n${sibling.summary}`);
                    }
                }
            }
        }
    
        // 2. Traverse up the tree, gathering context from "uncles"
        while (currentNode.parentId) {
            const parent = this.findNodeById(currentNode.parentId);
            if (!parent || !parent.parentId) break; // Stop if we are at the root's child
    
            const grandparent = this.findNodeById(parent.parentId);
            if (!grandparent) break;
    
            const parentIndex = grandparent.children.findIndex(child => child.id === parent.id);
            for (let i = 0; i < parentIndex; i++) {
                const uncle = grandparent.children[i];
                if (uncle.summary) {
                    contextParts.unshift(`Summary of sibling "${uncle.title}":\n${uncle.summary}`);
                }
            }
            currentNode = parent;
        }
        
        return contextParts.join('\n\n---\n\n');
    }

    private getNodePath(nodeId: string): string {
        let path = [];
        let currentNode = this.findNodeById(nodeId);
        while(currentNode) {
            const levelName = currentNode.template[currentNode.level] || `Level ${currentNode.level}`;
            path.unshift(`${levelName}: ${currentNode.title}`);
            currentNode = currentNode.parentId ? this.findNodeById(currentNode.parentId) : null;
        }
        return path.join(' => ');
    }

    public async expandNode(nodeId: string): Promise<void> {
        const node = this.findNodeById(nodeId);
        if (!node || node.isLeaf) {
            this.emit('error', 'Cannot expand a leaf node or a non-existent node.');
            return;
        }

        const context = this.compileNodeContext(nodeId);
        const path = this.getNodePath(nodeId);
        
        const prompts = this.settingsManager.getPrompts();
        const systemPrompt = prompts.expand_system;
        const userPromptTemplate = prompts.expand_user;

        const userPrompt = userPromptTemplate
            .replace('{{path}}', path)
            .replace('{{context}}', context)
            .replace('{{child_level_name}}', node.childLevelName || '');

        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
        
        node.generationPrompt = fullPrompt;

        try {
            const response = await this.openRouterClient.chat('creator', fullPrompt);
            const titles = JSON.parse(response);

            if (!Array.isArray(titles)) {
                throw new Error("LLM did not return a valid JSON array.");
            }

            titles.forEach(title => {
                if(typeof title === 'string') {
                    this.addNode(title, nodeId);
                }
            });
            
            this.saveToLocalStorage();
            this.emit('nodeGenerationComplete', { nodeId, success: true, node });

        } catch(error) {
            console.error("Failed to expand node:", error);
            this.emit('nodeGenerationComplete', { nodeId, success: false, error, node });
        }
    }

    public async generateNodeContent(nodeId: string): Promise<void> {
        const node = this.findNodeById(nodeId);
        if (!node) {
            this.emit('error', `Node with ID "${nodeId}" not found.`);
            return;
        }

        const profile = this.settingsManager.getProfile(node.settingsProfileName) || this.settingsManager.getLastUsedProfile();
        if (!profile) {
            this.emit('error', `Could not find a settings profile named "${node.settingsProfileName}" or a default profile.`);
            return;
        }
        
        const path = this.getNodePath(nodeId);
        const context = this.compileNodeContext(nodeId);

        const prompts = this.settingsManager.getPrompts();
        const systemPromptTemplate = prompts.content_generation_initial;
        const userPromptTemplate = prompts.content_generation_user;

        const userPrompt = userPromptTemplate
            .replace('{{path}}', path)
            .replace('{{context}}', context)
            .replace('{{title}}', node.title);

        // The 'prompt' for the initial generation is the fully-formed user prompt
        const systemPrompt = systemPromptTemplate
            .replace('{{prompt}}', userPrompt)
            .replace('{{criteria}}', profile.criteria.map(c => c.name).join(', '));
        
        // The full prompt sent to the loop doesn't need the system prompt, as the loop constructs it.
        // We just need to send the user's core request.
        const loopInput: LoopInput = {
            prompt: userPrompt,
            criteria: profile.criteria,
            maxIterations: profile.maxIterations,
        };

        // Store the full prompt for debugging/transparency
        node.generationPrompt = `${systemPrompt}\n\n${userPrompt}`;
        
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

            // Summarize the new content
            node.summary = await this.summarizeContent(node.content);

            this.saveToLocalStorage();
            this.emit('nodeGenerationComplete', { nodeId, success: true, node });
        } catch (error) {
            this.emit('nodeGenerationComplete', { nodeId, success: false, error, node });
        } finally {
            this.loopOrchestrator.off('progress', progressListener);
        }
    }

    private async summarizeContent(content: string): Promise<string> {
        console.log("Summarizing content...");
        const prompts = this.settingsManager.getPrompts();
        const systemPrompt = prompts.summarize_system;
        const fullPrompt = systemPrompt.replace('{{content}}', content);
        try {
            const summary = await this.openRouterClient.chat('editor', fullPrompt);
            console.log("Summarization complete.");
            return summary;
        } catch (error) {
            console.error("Summarization failed:", error);
            return `Error: Could not summarize content.`; // Return a non-empty error string
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
     * Saves the project's current state to localStorage.
     */
    public saveToLocalStorage(): void {
        try {
            const json = this.save();
            localStorage.setItem('expert_app_current_project', json);
        } catch (error) {
            console.error("Failed to save project to localStorage:", error);
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
        
        // Overwrite the plain properties from the saved data
        Object.assign(node, {
            id: plainNode.id,
            content: plainNode.content || '',
            summary: plainNode.summary || '',
            generationPrompt: plainNode.generationPrompt || null,
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