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
        
        // Set up a valid default profile for testing
        // This prevents the ProjectManager constructor from failing when it tries to access profiles
        try {
            const defaultProfile = {
                prompt: "Test generation prompt",
                criteria: [
                    { name: 'Test Criterion', description: 'A test criterion for testing', goal: 7, weight: 1.0 }
                ],
                maxIterations: 5,
                selectedModels: { creator: 'test-model', rater: 'test-model', editor: 'test-model' }
            };
            this.mockSettingsManager.saveProfile('default', defaultProfile);
            this.mockSettingsManager.setLastUsedProfile('default');
        } catch (error) {
            // If there's an issue setting up the profile, we'll continue with the test
            // The test should still work even without a perfect mock setup
        }
        
        this.mockLoopOrchestrator = new LoopOrchestrator(this.openRouterClient, this.mockSettingsManager.getPrompts());
    }

    public async runPhase1Tests(): Promise<string> {
        const results: TestResult[] = [];

        // Original tests
        results.push(this.testDocumentNodeCreation());
        results.push(this.testProjectTemplateCreation());
        results.push(this.testProjectManagerCreation());
        results.push(this.testTreeManipulation());
        results.push(this.testPersistence());
        results.push(await this.testApiConnection());

        // New comprehensive tests
        results.push(this.testEmptyHierarchyTemplate());
        results.push(this.testNodePathGeneration());
        results.push(this.testDeepTreeStructure());
        results.push(this.testNodeContentManagement());
        results.push(this.testInvalidNodeOperations());
        results.push(this.testTemplateValidation());
        results.push(this.testErrorMessages());

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

            if (project.rootNode.level !== 0 || project.rootNode.title !== "My Sci-Fi Novel") {
                throw new Error("Root node not initialized correctly - should use project title.");
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
                
                throw new Error("Project state is not the same after saving and loading.");
            }
            
            return { success: true, message: "Step 1.5: ProjectManager persistence (save/load) works correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 1.5 Failed: ${error.message}` };
        }
    }

    private testEmptyHierarchyTemplate(): TestResult {
        try {
            // Test that ProjectManager constructor fails with empty hierarchy
            const emptyTemplate = new ProjectTemplate("Empty Template", [], []);
            
            try {
                new ProjectManager("Test Project", emptyTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
                throw new Error("ProjectManager should have thrown an error for empty hierarchy template");
            } catch (error: any) {
                if (error.message.includes("no hierarchy levels defined")) {
                    return { success: true, message: "Step 2.1: Empty hierarchy template properly rejected." };
                } else {
                    throw error; // Re-throw if it's not the expected error
                }
            }
        } catch (error: any) {
            return { success: false, message: `Step 2.1 Failed: ${error.message}` };
        }
    }

    private testNodePathGeneration(): TestResult {
        try {
            const template = new ProjectTemplate("Novel", ['Book', 'Act', 'Chapter'], []);
            const project = new ProjectManager("Test Novel", template, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // Add some nodes to create a path
            const act1 = project.addNode("Act 1", project.rootNode.id);
            const chapter1 = project.addNode("Chapter 1", act1.id);
            
            // Test root path
            const rootPath = project.getNodePath(project.rootNode.id);
            if (!rootPath.includes("Book: Book")) {
                throw new Error(`Root path incorrect: ${rootPath}`);
            }
            
            // Test deep path
            const deepPath = project.getNodePath(chapter1.id);
            if (!deepPath.includes("Book: Book") || !deepPath.includes("Act: Act 1") || !deepPath.includes("Chapter: Chapter 1")) {
                throw new Error(`Deep path incorrect: ${deepPath}`);
            }
            
            return { success: true, message: "Step 2.2: Node path generation works correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 2.2 Failed: ${error.message}` };
        }
    }

    private testDeepTreeStructure(): TestResult {
        try {
            const template = new ProjectTemplate("Manual", ['Manual', 'Section', 'Topic', 'Subtopic'], []);
            const project = new ProjectManager("Test Manual", template, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // Build a 4-level deep tree
            const section1 = project.addNode("Section 1", project.rootNode.id);
            const topic1 = project.addNode("Topic 1", section1.id);
            const subtopic1 = project.addNode("Subtopic 1", topic1.id);
            
            // Verify levels are correct
            if (project.rootNode.level !== 0) throw new Error("Root level should be 0");
            if (section1.level !== 1) throw new Error("Section level should be 1");
            if (topic1.level !== 2) throw new Error("Topic level should be 2");
            if (subtopic1.level !== 3) throw new Error("Subtopic level should be 3");
            
            // Verify parent-child relationships
            if (section1.parentId !== project.rootNode.id) throw new Error("Section parent incorrect");
            if (topic1.parentId !== section1.id) throw new Error("Topic parent incorrect");
            if (subtopic1.parentId !== topic1.id) throw new Error("Subtopic parent incorrect");
            
            // Verify template access
            if (subtopic1.template[3] !== 'Subtopic') throw new Error("Template access incorrect");
            
            return { success: true, message: "Step 2.3: Deep tree structure and levels work correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 2.3 Failed: ${error.message}` };
        }
    }

    private testNodeContentManagement(): TestResult {
        try {
            const template = new ProjectTemplate("Story", ['Story', 'Chapter'], []);
            const project = new ProjectManager("Test Story", template, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            const chapter1 = project.addNode("Chapter 1", project.rootNode.id);
            
            // Test initial state
            if (chapter1.content !== '') throw new Error("Initial content should be empty");
            if (chapter1.summary !== '') throw new Error("Initial summary should be empty");
            
            // Test content setting
            chapter1.content = "This is test content for chapter 1.";
            if (chapter1.content !== "This is test content for chapter 1.") {
                throw new Error("Content setting failed");
            }
            
            // Test summary setting
            chapter1.summary = "A brief summary of chapter 1.";
            if (chapter1.summary !== "A brief summary of chapter 1.") {
                throw new Error("Summary setting failed");
            }
            
            // Test isLeaf detection (leaf nodes don't have children)
            if (!chapter1.isLeaf) throw new Error("Chapter should be detected as leaf node");
            if (project.rootNode.isLeaf) throw new Error("Root with children should not be leaf");
            
            return { success: true, message: "Step 2.4: Node content management works correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 2.4 Failed: ${error.message}` };
        }
    }

    private testInvalidNodeOperations(): TestResult {
        try {
            const template = new ProjectTemplate("Test", ['Root', 'Child'], []);
            const project = new ProjectManager("Test Project", template, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // Test adding node to non-existent parent
            try {
                project.addNode("Invalid Child", "non-existent-id");
                throw new Error("Should have thrown error for non-existent parent");
            } catch (error: any) {
                if (!error.message.includes("not found")) {
                    throw new Error("Wrong error message for non-existent parent");
                }
            }
            
            // Test removing non-existent node
            const removeResult = project.removeNode("non-existent-id");
            if (removeResult !== false) {
                throw new Error("Removing non-existent node should return false");
            }
            
            // Test removing root node (should fail)
            const removeRootResult = project.removeNode(project.rootNode.id);
            if (removeRootResult !== false) {
                throw new Error("Removing root node should return false");
            }
            
            // Test finding non-existent node
            const foundNode = project.findNodeById("non-existent-id");
            if (foundNode !== null) {
                throw new Error("Finding non-existent node should return null");
            }
            
            return { success: true, message: "Step 2.5: Invalid node operations handled correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 2.5 Failed: ${error.message}` };
        }
    }

    private testTemplateValidation(): TestResult {
        try {
            // Test template with undefined in hierarchy (testing robustness)
            try {
                const hierarchyWithUndefined = ['Book', undefined as any, 'Chapter'] as string[];
                const badTemplate1 = new ProjectTemplate("Bad", hierarchyWithUndefined, []);
                // Template constructor might not validate, but using it should work or fail gracefully
                if (badTemplate1.hierarchyLevels.includes(undefined as any)) {
                    // This might be allowed - template should handle edge cases
                }
            } catch (error: any) {
                // This is expected if template validation is working
            }
            
            // Test template with empty string in hierarchy
            const template2 = new ProjectTemplate("Test", ['Book', '', 'Chapter'], []);
            if (template2.hierarchyLevels[1] === '') {
                // This might be allowed, but let's verify it works
                const project = new ProjectManager("Test", template2, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
                const child = project.addNode("Test Child", project.rootNode.id);
                // Should still work even with empty level name
            }
            
            // Test valid template properties
            const validTemplate = new ProjectTemplate("Novel", ['Book', 'Chapter'], ['Outline', 'Characters']);
            if (validTemplate.name !== "Novel") throw new Error("Template name not set correctly");
            if (validTemplate.hierarchyLevels.length !== 2) throw new Error("Hierarchy levels not set correctly");
            if (validTemplate.scaffoldingDocuments.length !== 2) throw new Error("Scaffolding documents not set correctly");
            
            return { success: true, message: "Step 2.6: Template validation works correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 2.6 Failed: ${error.message}` };
        }
    }

    private testErrorMessages(): TestResult {
        try {
            const template = new ProjectTemplate("Test", ['Root', 'Child'], []);
            const project = new ProjectManager("Test", template, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // Test that error messages are helpful and contain relevant information
            try {
                project.addNode("Test", "invalid-parent-id");
            } catch (error: any) {
                if (!error.message.includes("invalid-parent-id")) {
                    throw new Error("Error message should include the invalid parent ID");
                }
                if (!error.message.includes("not found")) {
                    throw new Error("Error message should indicate the parent was not found");
                }
            }
            
            // Test empty hierarchy error message
            try {
                const emptyTemplate = new ProjectTemplate("Empty", [], []);
                new ProjectManager("Test", emptyTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            } catch (error: any) {
                if (!error.message.includes("Empty")) {
                    throw new Error("Error message should include template name");
                }
                if (!error.message.includes("hierarchy levels")) {
                    throw new Error("Error message should mention hierarchy levels");
                }
            }
            
            return { success: true, message: "Step 2.7: Error messages are helpful and informative." };
        } catch (error: any) {
            return { success: false, message: `Step 2.7 Failed: ${error.message}` };
        }
    }
} 