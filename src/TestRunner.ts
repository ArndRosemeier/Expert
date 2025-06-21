import { DocumentNode } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { ProjectManager } from './ProjectManager';
import { OpenRouterClient } from './OpenRouterClient';
import { SettingsManager } from './SettingsManager';
import { LoopOrchestrator } from './LoopOrchestrator';

// Define a simple structure for a test result
export interface TestResult {
    success: boolean;
    message: string;
}

export class TestRunner {
    private openRouterClient: OpenRouterClient;
    private mockSettingsManager: SettingsManager;
    private mockLoopOrchestrator: LoopOrchestrator;

    constructor(openRouterClient: OpenRouterClient) {
        this.openRouterClient = openRouterClient;
        // Create mock instances for dependencies that are not under test
        this.mockSettingsManager = new SettingsManager();
        this.mockLoopOrchestrator = new LoopOrchestrator(this.openRouterClient, this.mockSettingsManager.getPrompts());
    }

    public async runPhase1Tests(): Promise<string> {
        const results: TestResult[] = [];

        results.push(this.testDocumentNodeCreation());
        results.push(this.testProjectTemplateCreation());
        results.push(this.testProjectManagerCreation());
        results.push(this.testTreeManipulation());
        results.push(this.testPersistence());
        results.push(await this.testApiConnection());

        // Future tests for Phase 1 will be added here...

        return this.formatResultsAsHtml(results);
    }

    private formatResultsAsHtml(results: TestResult[]): string {
        let html = '<h2>Test Results</h2>';
        html += '<ul style="list-style-type: none; padding: 0;">';
        results.forEach(result => {
            const status = result.success 
                ? '<span style="color: green; font-weight: bold;">✔ SUCCESS</span>' 
                : '<span style="color: red; font-weight: bold;">✖ FAILED</span>';
            html += `<li style="margin-bottom: 0.75rem; border-bottom: 1px solid #eee; padding-bottom: 0.75rem;">${status}: ${result.message}</li>`;
        });
        html += '</ul>';
        return html;
    }

    private async testApiConnection(): Promise<TestResult> {
        // The client is constructed with an API key, so we access it directly.
        // There's no public getter, so this is a "white-box" test.
        if (!this.openRouterClient['apiKey']) {
            return { success: false, message: "API Test Aborted: OpenRouterClient was not initialized with an API key." };
        }
        try {
            const models = await this.openRouterClient.fetchModels();
            if (models.length > 0) {
                return { success: true, message: `API Connection Test: Successfully fetched ${models.length} models from OpenRouter.` };
            } else {
                return { success: false, message: "API Connection Test: Fetched 0 models. Check API key and network." };
            }
        } catch (error: any) {
            return { success: false, message: `API Connection Test Failed: ${error.message}` };
        }
    }

    private testDocumentNodeCreation(): TestResult {
        try {
            const book = new DocumentNode(0, "My Awesome Book", null, ['Book', 'Chapter']);
            if (!book.id || book.level !== 0 || book.title !== "My Awesome Book") {
                throw new Error("Node properties are not set correctly in the constructor.");
            }

            const act1 = new DocumentNode(1, "Act 1: The Beginning", book.id);
            if (act1.parentId !== book.id) {
                throw new Error("Parent ID is not set correctly.");
            }
            
            book.children.push(act1);
            if (book.children.length !== 1 || book.children[0] !== act1) {
                throw new Error("Child node was not added correctly.");
            }

            return { success: true, message: "Step 1.1: DocumentNode class created and linked successfully." };
        } catch (error: any) {
            return { success: false, message: `Step 1.1 Failed: ${error.message}` };
        }
    }

    private testProjectTemplateCreation(): TestResult {
        try {
            const novelTemplate = new ProjectTemplate(
                "Standard Novel",
                ['Book', 'Act', 'Chapter'],
                ['Main Outline', 'Character Bios']
            );

            if (novelTemplate.name !== "Standard Novel" || novelTemplate.hierarchyLevels.length !== 3) {
                throw new Error("Novel template properties not set correctly.");
            }

            const manualTemplate = new ProjectTemplate(
                "Technical Manual",
                ['Manual', 'Section', 'Topic'],
                ['Glossary']
            );

            if (manualTemplate.name !== "Technical Manual" || manualTemplate.scaffoldingDocuments.length !== 1) {
                throw new Error("Manual template properties not set correctly.");
            }

            return { success: true, message: "Step 1.2: ProjectTemplate class created successfully." };
        } catch (error: any) {
            return { success: false, message: `Step 1.2 Failed: ${error.message}` };
        }
    }

    private testProjectManagerCreation(): TestResult {
        try {
            const novelTemplate = new ProjectTemplate(
                "Standard Novel",
                ['Book', 'Act', 'Chapter'],
                ['Main Outline', 'Character Bios']
            );
            const project = new ProjectManager("My Sci-Fi Novel", novelTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);

            if (project.projectTitle !== "My Sci-Fi Novel") {
                throw new Error("Project title not set correctly.");
            }

            if (project.rootNode.level !== 0 || project.rootNode.title !== "Book") {
                throw new Error("Root node not initialized correctly from the template.");
            }

            const foundNode = project.findNodeById(project.rootNode.id);
            if (foundNode !== project.rootNode) {
                throw new Error("findNodeById failed to find the root node.");
            }

            const notFoundNode = project.findNodeById("non-existent-id");
            if (notFoundNode !== null) {
                throw new Error("findNodeById returned a node for a non-existent ID.");
            }

            return { success: true, message: "Step 1.3: ProjectManager class created and findNodeById works." };
        } catch (error: any) {
            return { success: false, message: `Step 1.3 Failed: ${error.message}` };
        }
    }

    private testTreeManipulation(): TestResult {
        try {
            const novelTemplate = new ProjectTemplate("Novel", ['Book', 'Act', 'Chapter'], []);
            const project = new ProjectManager("Test Project", novelTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // Add nodes
            const act1 = project.addNode("Act 1", project.rootNode.id);
            if (project.rootNode.children[0] !== act1) {
                throw new Error("addNode failed to add a child to the root.");
            }

            const chapter1 = project.addNode("Chapter 1", act1.id);
            if (act1.children[0] !== chapter1) {
                throw new Error("addNode failed to add a grandchild.");
            }

            // Verify structure
            if (chapter1.level !== 2 || chapter1.parentId !== act1.id) {
                throw new Error("Grandchild node has incorrect properties.");
            }

            // Remove node
            const removed = project.removeNode(chapter1.id);
            if (!removed || act1.children.length !== 0) {
                throw new Error("removeNode failed to remove a child node.");
            }
            
            const removeRootAttempt = project.removeNode(project.rootNode.id);
            if (removeRootAttempt) {
                throw new Error("Should not be able to remove the root node.");
            }

            return { success: true, message: "Step 1.4: Tree manipulation (add/remove) works correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 1.4 Failed: ${error.message}` };
        }
    }

    private testPersistence(): TestResult {
        try {
            const template = new ProjectTemplate('Novel', ['Part', 'Chapter', 'Scene'], []);
            const project = new ProjectManager('My Novel', template, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            project.addNode('Chapter 1', project.rootNode.id);
            
            const json = project.save();
            const loadedProject = ProjectManager.load(json, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);

            // Basic property checks
            if (project.projectTitle !== loadedProject.projectTitle) {
                throw new Error("projectTitle mismatch");
            }

            // Check template integrity
            if (project.template.name !== loadedProject.template.name) {
                throw new Error("template.name mismatch");
            }
            
            // Recursively check if nodes are instances of DocumentNode
            const checkNodeType = (node: DocumentNode): boolean => {
                if (!(node instanceof DocumentNode)) {
                    console.error("Node is not an instance of DocumentNode", node);
                    return false;
                }
                for (const child of node.children) {
                    if (!checkNodeType(child)) return false;
                }
                return true;
            };

            if (!checkNodeType(loadedProject.rootNode)) {
                throw new Error("Node rehydration failed; object is not an instance of DocumentNode.");
            }

            // Compare the saved and re-loaded/re-saved objects
            const reSavedJson = loadedProject.save();
            const originalObject = JSON.parse(json);
            const loadedObject = JSON.parse(reSavedJson);

            if (JSON.stringify(originalObject) !== JSON.stringify(loadedObject)) {
                console.error("Re-saved JSON does not match original.");
                console.log("Original:", JSON.stringify(originalObject, null, 2));
                console.log("Loaded:", JSON.stringify(loadedObject, null, 2));
                throw new Error("Project state is not the same after saving and loading.");
            }
            
            return { success: true, message: "Step 1.5: ProjectManager persistence (save/load) works correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 1.5 Failed: ${error.message}` };
        }
    }
} 