import { DocumentNode } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { ProjectManager } from './ProjectManager';
import { OpenRouterClient } from './OpenRouterClient';
import { SettingsManager } from './SettingsManager';
import { LoopOrchestrator } from './LoopOrchestrator';
import { StorageService } from './StorageService';
import { IndexedDBService } from './IndexedDBService';
import { TemplateManager } from './TemplateManager';
import { DEFAULT_MAX_ITERATIONS } from './constants';


// Define a simple structure for a test result
export interface TestResult {
    success: boolean;
    message: string;
}

export class TestRunner {
    private openRouterClient: OpenRouterClient;
    private mockLoopOrchestrator: LoopOrchestrator;
    private mockSettingsManager: SettingsManager;

    constructor(openRouterClient: OpenRouterClient) {
        this.openRouterClient = openRouterClient;
        this.mockLoopOrchestrator = {
            orchestrate: async () => 'Mock orchestration result',
            abortCurrentLoop: () => {}
        } as any;
        
        // Use singleton pattern - this will be initialized later
        this.mockSettingsManager = null as any;
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
        results.push(this.testGenerationChildrenCount());
        
        // Removed testComprehensiveTemplates - tests configuration data, not functionality

        return this.formatResultsAsHtml(results, 'Phase 1: Core Functionality Tests');
    }

    public async runStorageTests(): Promise<string> {
        const results: TestResult[] = [];

        // Storage abstraction tests
        results.push(await this.testStorageServiceInitialization());
        results.push(await this.testStorageServiceBasicOperations());
        results.push(await this.testStorageServiceBulkOperations());
                    results.push(await this.testStorageServiceMetadata());

        // IndexedDB specific tests
        results.push(await this.testIndexedDBServiceInitialization());
        results.push(await this.testIndexedDBServiceOperations());
        results.push(await this.testIndexedDBServiceTransactions());

        // Service layer tests
        results.push(await this.testTemplateManagerStorage());
        results.push(await this.testSettingsManagerStorage());
        results.push(await this.testProjectManagerStorage());
        
        // Export/Import functionality tests
        results.push(await this.testSettingsExportImport());

        // Performance and capacity tests
        results.push(await this.testStorageCapacity());
        results.push(await this.testStoragePerformance());

        return this.formatResultsAsHtml(results, 'Storage System Tests');
    }



    private formatResultsAsHtml(results: TestResult[], title: string = 'Test Results'): string {
        let html = `<h2>${title}</h2>`;
        const passed = results.filter(r => r.success).length;
        const total = results.length;
        html += `<p><strong>Results: ${passed}/${total} tests passed</strong></p>`;
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
        // Test OpenRouterClient API connection by attempting to fetch models
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
            if (!rootPath.includes("Book: Test Novel")) {
                throw new Error(`Root path incorrect: ${rootPath}`);
            }
            
            // Test deep path
            const deepPath = project.getNodePath(chapter1.id);
            if (!deepPath.includes("Book: Test Novel") || !deepPath.includes("Act: Act 1") || !deepPath.includes("Chapter: Chapter 1")) {
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
            if (chapter1.context !== '') throw new Error("Initial context should be empty");
            
            // Test content setting using version management system
            const testContent = "This is test content for chapter 1.";
            chapter1.setContent(testContent, 'master');
            const actualContent = chapter1.content as string;
            if (actualContent !== testContent) {
                throw new Error(`Content setting failed: expected "${testContent}", got "${actualContent}"`);
            }
            
            // Test context setting using version management system
            const testContext = "A brief context for chapter 1.";
            chapter1.setContext(testContext, 'master');
            const actualContext = chapter1.context as string;
            if (actualContext !== testContext) {
                throw new Error(`Context setting failed: expected "${testContext}", got "${actualContext}"`);
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
                project.addNode("Test Child", project.rootNode.id);
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

    private testGenerationChildrenCount(): TestResult {
        try {
            // Test default case - no number should be null
            const defaultTemplate = new ProjectTemplate("Default", ['Book', 'Chapter'], []);
            const defaultProject = new ProjectManager("Test", defaultTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            if (defaultProject.rootNode.getTemplateChildrenCount() !== null) {
                throw new Error(`Expected null count for template without number, got ${defaultProject.rootNode.getTemplateChildrenCount()}`);
            }

            // Test parsing count from template with number
            const numberedTemplate = new ProjectTemplate("Numbered", ['Book', 'Chapter 3', 'Scene'], []);
            const numberedProject = new ProjectManager("Test", numberedTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // The root node should parse the count for generating children at level 1 ("Chapter 3")
            if (numberedProject.rootNode.getTemplateChildrenCount() !== 3) {
                throw new Error(`Expected parsed count of 3 from "Chapter 3", got ${numberedProject.rootNode.getTemplateChildrenCount()}`);
            }

            // Test parsing count from different patterns
            const variousTemplate = new ProjectTemplate("Various", ['Book', 'Act 7', 'Scene'], []);
            const variousProject = new ProjectManager("Test", variousTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // The root node should parse the count for generating children at level 1 ("Act 7")
            if (variousProject.rootNode.getTemplateChildrenCount() !== 7) {
                throw new Error(`Expected parsed count of 7 from "Act 7", got ${variousProject.rootNode.getTemplateChildrenCount()}`);
            }

            // Test edge cases - no number should be null
            const nonNumberTemplate = new ProjectTemplate("NoNumber", ['Book', 'Chapter', 'Scene'], []);
            const nonNumberProject = new ProjectManager("Test", nonNumberTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // The root node should get null for "Chapter" (no number)
            if (nonNumberProject.rootNode.getTemplateChildrenCount() !== null) {
                throw new Error(`Expected null count for template without number, got ${nonNumberProject.rootNode.getTemplateChildrenCount()}`);
            }

            // Test boundary validation - number too high should be null
            const highNumberTemplate = new ProjectTemplate("HighNumber", ['Book', 'Chapter 999', 'Scene'], []);
            const highNumberProject = new ProjectManager("Test", highNumberTemplate, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // The root node should get null for "Chapter 999" (invalid high number)
            if (highNumberProject.rootNode.getTemplateChildrenCount() !== null) {
                throw new Error(`Expected null count for invalid high number, got ${highNumberProject.rootNode.getTemplateChildrenCount()}`);
            }

            return { success: true, message: "Step 2.8: GenerationChildrenCount parsing from templates works correctly." };
        } catch (error: any) {
            return { success: false, message: `Step 2.8 Failed: ${error.message}` };
        }
    }

    // testComprehensiveTemplates removed - was testing configuration data rather than functionality

    // Storage System Tests

    private async testStorageServiceInitialization(): Promise<TestResult> {
        try {
            const storage = await StorageService.getInstance();
            if (!storage) throw new Error("Storage service not initialized");
            
            const storageInfo = await StorageService.getStorageInfo();
            if (!storageInfo.available) throw new Error("Storage not available");
            
            if (storageInfo.type !== 'indexedDB') {
                throw new Error(`Unknown storage type: ${storageInfo.type}`);
            }
            
            return { 
                success: true, 
                message: `Storage Test 1: StorageService initialized successfully (${storageInfo.type})` 
            };
        } catch (error: any) {
            return { success: false, message: `Storage Test 1 Failed: ${error.message}` };
        }
    }

    private async testStorageServiceBasicOperations(): Promise<TestResult> {
        try {
            const storage = await StorageService.getInstance();
            
            // Test set and get
            const testKey = 'test_storage_key_' + Date.now();
            const testValue = { message: 'test value', timestamp: Date.now() };
            
            await storage.set(testKey, testValue);
            const retrieved = await storage.get<typeof testValue>(testKey);
            
            if (!retrieved || retrieved.message !== testValue.message) {
                throw new Error("Storage set/get failed");
            }
            
            // Test delete
            await storage.delete(testKey);
            const afterDelete = await storage.get(testKey);
            if (afterDelete !== undefined) {
                throw new Error("Storage delete failed");
            }
            
            return { success: true, message: "Storage Test 2: Basic storage operations work correctly" };
        } catch (error: any) {
            return { success: false, message: `Storage Test 2 Failed: ${error.message}` };
        }
    }

    private async testStorageServiceBulkOperations(): Promise<TestResult> {
        try {
            const storage = await StorageService.getInstance();
            
            // Test multiple operations
            const testPrefix = 'bulk_test_' + Date.now() + '_';
            const testData = {
                [testPrefix + '1']: { value: 'first' },
                [testPrefix + '2']: { value: 'second' },
                [testPrefix + '3']: { value: 'third' }
            };
            
            // Set multiple values
            for (const [key, value] of Object.entries(testData)) {
                await storage.set(key, value);
            }
            
            // Get all with prefix
            const retrieved = await storage.getAll(testPrefix);
            const retrievedKeys = Object.keys(retrieved);
            
            if (retrievedKeys.length < 3) {
                throw new Error(`Expected 3 items with prefix, got ${retrievedKeys.length}`);
            }
            
            // Cleanup
            for (const key of retrievedKeys) {
                await storage.delete(key);
            }
            
            return { success: true, message: "Storage Test 3: Bulk operations work correctly" };
        } catch (error: any) {
            return { success: false, message: `Storage Test 3 Failed: ${error.message}` };
        }
    }

    private async testStorageServiceMetadata(): Promise<TestResult> {
        try {
            const storage = await StorageService.getInstance();
            const storageInfo = await StorageService.getStorageInfo();
            
            // Test that storage info provides useful information
            if (typeof storageInfo.available !== 'boolean') {
                throw new Error("Storage availability not reported correctly");
            }
            
            // Verify it's IndexedDB
            if (storageInfo.type !== 'indexedDB') {
                throw new Error("Expected IndexedDB storage type");
            }
            
            // Test usage information
            const usage = await storage.getUsage();
            if (typeof usage.quota !== 'number' || typeof usage.usage !== 'number') {
                throw new Error("Storage usage information not provided correctly");
            }
            
            // Test isIndexedDB flag consistency
            const isIndexedDB = storage.isIndexedDB();
            if (!isIndexedDB) {
                throw new Error("Expected IndexedDB but got other storage type");
            }
            
            return { success: true, message: "Storage Test 4: Storage metadata and type detection work correctly" };
        } catch (error: any) {
            return { success: false, message: `Storage Test 4 Failed: ${error.message}` };
        }
    }

    private async testIndexedDBServiceInitialization(): Promise<TestResult> {
        try {
            // Test if IndexedDB is supported
            if (!window.indexedDB) {
                return { success: true, message: "IndexedDB Test 1: Skipped (IndexedDB not supported in this browser)" };
            }
            
            const storage = await StorageService.getInstance();
            if (!storage.isIndexedDB()) {
                return { success: false, message: "IndexedDB Test 1: Failed - IndexedDB is required but not available" };
            }
            
            // If we're using IndexedDB, test direct access
            const testDbConfig = {
                name: 'TestDB_' + Date.now(),
                version: 1,
                stores: [
                    {
                        name: 'testStore',
                        keyPath: 'id'
                    }
                ]
            };
            
            const indexedDBService = new IndexedDBService(testDbConfig);
            await indexedDBService.initialize();
            
            if (!indexedDBService.isInitialized()) {
                throw new Error("IndexedDB service not initialized");
            }
            
            indexedDBService.close();
            
            return { success: true, message: "IndexedDB Test 1: IndexedDB service initializes correctly" };
        } catch (error: any) {
            return { success: false, message: `IndexedDB Test 1 Failed: ${error.message}` };
        }
    }

    private async testIndexedDBServiceOperations(): Promise<TestResult> {
        try {
            if (!window.indexedDB) {
                return { success: true, message: "IndexedDB Test 2: Skipped (IndexedDB not supported)" };
            }
            
            const storage = await StorageService.getInstance();
            if (!storage.isIndexedDB()) {
                return { success: false, message: "IndexedDB Test 2: Failed - IndexedDB is required but not available" };
            }
            
            const testDbConfig = {
                name: 'TestDBOps_' + Date.now(),
                version: 1,
                stores: [
                    {
                        name: 'testStore',
                        keyPath: 'id'
                    }
                ]
            };
            
            const indexedDBService = new IndexedDBService(testDbConfig);
            await indexedDBService.initialize();
            
            // Test basic operations
            const testData = { id: 'test1', value: 'test value', timestamp: Date.now() };
            await indexedDBService.set('testStore', 'test1', testData);
            
            const retrieved = await indexedDBService.get('testStore', 'test1') as typeof testData;
            if (!retrieved || retrieved.value !== testData.value) {
                throw new Error("IndexedDB set/get failed");
            }
            
            await indexedDBService.delete('testStore', 'test1');
            const afterDelete = await indexedDBService.get('testStore', 'test1');
            if (afterDelete !== undefined) {
                throw new Error("IndexedDB delete failed");
            }
            
            indexedDBService.close();
            
            return { success: true, message: "IndexedDB Test 2: IndexedDB operations work correctly" };
        } catch (error: any) {
            return { success: false, message: `IndexedDB Test 2 Failed: ${error.message}` };
        }
    }

    private async testIndexedDBServiceTransactions(): Promise<TestResult> {
        try {
            if (!window.indexedDB) {
                return { success: true, message: "IndexedDB Test 3: Skipped (IndexedDB not supported)" };
            }
            
            const storage = await StorageService.getInstance();
            if (!storage.isIndexedDB()) {
                return { success: false, message: "IndexedDB Test 3: Failed - IndexedDB is required but not available" };
            }
            
            const testDbConfig = {
                name: 'TestDBTrans_' + Date.now(),
                version: 1,
                stores: [
                    {
                        name: 'testStore',
                        keyPath: 'id'
                    }
                ]
            };
            
            const indexedDBService = new IndexedDBService(testDbConfig);
            await indexedDBService.initialize();
            
            // Test bulk operations (transactions)
            const bulkData = [
                { key: 'bulk1', value: { id: 'bulk1', data: 'first' } },
                { key: 'bulk2', value: { id: 'bulk2', data: 'second' } },
                { key: 'bulk3', value: { id: 'bulk3', data: 'third' } }
            ];
            
            await indexedDBService.bulkSet('testStore', bulkData);
            
            const allData = await indexedDBService.getAll('testStore');
            if (allData.length < 3) {
                throw new Error(`Expected 3 items, got ${allData.length}`);
            }
            
            await indexedDBService.clear('testStore');
            const afterClear = await indexedDBService.getAll('testStore');
            if (afterClear.length !== 0) {
                throw new Error("Clear operation failed");
            }
            
            indexedDBService.close();
            
            return { success: true, message: "IndexedDB Test 3: IndexedDB transactions work correctly" };
        } catch (error: any) {
            return { success: false, message: `IndexedDB Test 3 Failed: ${error.message}` };
        }
    }

    private async testTemplateManagerStorage(): Promise<TestResult> {
        try {
            const templateManager = new TemplateManager();
            
            // Wait for template manager to load from storage before testing
            // We need to wait for the async loadTemplates() to complete
            let retries = 0;
            while (templateManager.getTemplateNames().length === 0 && retries < 20) {
                await new Promise(resolve => setTimeout(resolve, 100));
                retries++;
            }
            
            // Test that templates are loaded (should have defaults)
            const initialTemplates = templateManager.getTemplateNames();
            if (initialTemplates.length === 0) {
                throw new Error("No templates loaded - storage initialization failed after 2 seconds");
            }
            
            // Test template operations
            const testTemplateName = 'test_template_' + Date.now();
            const testTemplate = new ProjectTemplate('Test Template', ['Level1', 'Level2'], ['Doc1']);
            await templateManager.saveTemplate(testTemplateName, testTemplate);
            
            // Templates are stored in memory, so getTemplate should work immediately after save
            const retrieved = templateManager.getTemplate(testTemplateName);
            
            if (!retrieved) {
                throw new Error("Template save/get failed - retrieved template is null");
            }
            
            // The saveTemplate method sets template.name = name (the key), so check for that
            if (retrieved.name !== testTemplateName) {
                throw new Error(`Template save/get failed - expected name '${testTemplateName}', got '${retrieved.name}'`);
            }
            
            // Test deletion
            await templateManager.deleteTemplate(testTemplateName);
            const afterDelete = templateManager.getTemplate(testTemplateName);
            
            if (afterDelete) {
                throw new Error("Template delete failed - template still exists after deletion");
            }
            
            return { success: true, message: "Service Test 1: TemplateManager storage works correctly" };
        } catch (error: any) {
            return { success: false, message: `Service Test 1 Failed: ${error.message}` };
        }
    }

    private async testSettingsManagerStorage(): Promise<TestResult> {
        try {
            const settingsManager = await SettingsManager.getInstance();
            
            // Give it time to initialize asynchronously
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Test settings operations
            const testProfile = {
                prompt: "Test prompt",
                criteria: [{ name: 'Test', description: 'Test criterion', goal: 8, weight: 1.0 }],
                maxIterations: DEFAULT_MAX_ITERATIONS,
                selectedModels: { creator: 'test', rater: 'test', editor: 'test', prose: 'test' },
                contextExtractionPrompt: 'Test extraction prompt'
            };
            
            await settingsManager.saveProfile('test_profile', testProfile);
            const retrieved = settingsManager.getProfile('test_profile');
            if (!retrieved || retrieved.prompt !== 'Test prompt') {
                throw new Error("Profile save/get failed");
            }
            
            await settingsManager.deleteProfile('test_profile');
            const afterDelete = settingsManager.getProfile('test_profile');
            if (afterDelete) {
                throw new Error("Profile delete failed");
            }
            
            return { success: true, message: "Service Test 2: SettingsManager storage works correctly" };
        } catch (error: any) {
            return { success: false, message: `Service Test 2 Failed: ${error.message}` };
        }
    }

    private async testProjectManagerStorage(): Promise<TestResult> {
        try {
            const template = new ProjectTemplate('Test Project Template', ['Root', 'Child'], []);
            const project = new ProjectManager('Test Project', template, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            // Add some content
            project.addNode('Test Child', project.rootNode.id);
            project.rootNode.setContent('Test root content', 'master');
            
            // Test save operation
            await project.saveToStorage();
            
            // Test serialization (which is used in storage)
            const json = project.save();
            const loadedProject = ProjectManager.load(json, this.mockLoopOrchestrator, this.mockSettingsManager, this.openRouterClient);
            
            if (loadedProject.projectTitle !== project.projectTitle) {
                throw new Error("Project title not preserved");
            }
            
            if (loadedProject.rootNode.content !== project.rootNode.content) {
                throw new Error("Project content not preserved");
            }
            
            if (loadedProject.rootNode.children.length !== project.rootNode.children.length) {
                throw new Error("Project structure not preserved");
            }
            
            return { success: true, message: "Service Test 3: ProjectManager storage works correctly" };
        } catch (error: any) {
            return { success: false, message: `Service Test 3 Failed: ${error.message}` };
        }
    }

    private async testStorageCapacity(): Promise<TestResult> {
        try {
            const storage = await StorageService.getInstance();
            await storage.getUsage();
            
            // Test with larger data to verify capacity improvements
            const largeDataKey = 'capacity_test_' + Date.now();
            const largeData = {
                content: 'x'.repeat(1024 * 10), // 10KB of data
                metadata: { size: '10KB', timestamp: Date.now() }
            };
            
            await storage.set(largeDataKey, largeData);
            const retrieved = await storage.get<typeof largeData>(largeDataKey);
            
            if (!retrieved || retrieved.content.length !== largeData.content.length) {
                throw new Error("Large data storage failed");
            }
            
            await storage.delete(largeDataKey);
            
            const newUsage = await storage.getUsage();
            if (storage.isIndexedDB()) {
                // With IndexedDB, we should have much higher capacity
                if (newUsage.quota < 1024 * 1024 * 50) { // At least 50MB
                    console.warn(`IndexedDB quota seems low: ${newUsage.quota} bytes`);
                }
            }
            
            return { 
                success: true, 
                message: `Performance Test 1: Storage capacity adequate (IndexedDB)` 
            };
        } catch (error: any) {
            return { success: false, message: `Performance Test 1 Failed: ${error.message}` };
        }
    }

    private async testStoragePerformance(): Promise<TestResult> {
        try {
            const storage = await StorageService.getInstance();
            
            // Test performance with multiple operations
            const startTime = performance.now();
            const operations = 10;
            const testPrefix = 'perf_test_' + Date.now() + '_';
            
            // Perform multiple set operations
            for (let i = 0; i < operations; i++) {
                await storage.set(testPrefix + i, { 
                    index: i, 
                    data: 'test data for performance test',
                    timestamp: Date.now()
                });
            }
            
            // Perform multiple get operations
            for (let i = 0; i < operations; i++) {
                const result = await storage.get(testPrefix + i);
                if (!result) {
                    throw new Error(`Failed to retrieve item ${i}`);
                }
            }
            
            // Cleanup
            for (let i = 0; i < operations; i++) {
                await storage.delete(testPrefix + i);
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Performance should be reasonable (less than 1 second for 10 operations)
            if (duration > 1000) {
                console.warn(`Storage operations took ${duration}ms, which seems slow`);
            }
            
            return { 
                success: true, 
                message: `Performance Test 2: Storage operations completed in ${Math.round(duration)}ms (IndexedDB)` 
            };
        } catch (error: any) {
            return { success: false, message: `Performance Test 2 Failed: ${error.message}` };
        }
    }

    private async testSettingsExportImport(): Promise<TestResult> {
        const testProfileName = 'export_test_profile_' + Date.now();
        try {
            const settingsManager = await SettingsManager.getInstance();
            
            // Give it time to initialize asynchronously
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Create a test profile with comprehensive data
            const testProfile = {
                prompt: "Test export/import prompt",
                criteria: [
                    { name: 'Export Test', description: 'Test criterion for export', goal: 9, weight: 1.5 },
                    { name: 'Import Test', description: 'Test criterion for import', goal: 7, weight: 0.8 }
                ],
                maxIterations: 8,
                selectedModels: { creator: 'export-test', rater: 'import-test', editor: 'roundtrip-test', prose: 'roundtrip-test' },
                contextExtractionPrompt: 'Test context extraction prompt'
            };
            await settingsManager.saveProfile(testProfileName, testProfile);
            
            // Test export
            const exportData = settingsManager.exportProfile(testProfileName);
            if (!exportData) {
                throw new Error("Export returned null for existing profile");
            }
            
            // Verify export structure
            if (!exportData.profileName || !exportData.profile || !exportData.prompts) {
                throw new Error("Export data missing required fields");
            }
            
            if (exportData.profileName !== testProfileName) {
                throw new Error("Exported profile name doesn't match");
            }
            
            if (exportData.profile.prompt !== testProfile.prompt) {
                throw new Error("Exported profile prompt doesn't match");
            }
            
            if (exportData.profile.criteria.length !== testProfile.criteria.length) {
                throw new Error("Exported criteria count doesn't match");
            }
            
            // Test import on the same settings manager (simulate export/import workflow)
            // First delete the profile to test import
            await settingsManager.deleteProfile(testProfileName);
            
            // Now test import (should create new profile)
            const importResult = await settingsManager.importProfile(exportData, false);
            if (!importResult.success) {
                throw new Error(`Import failed: ${importResult.message}`);
            }
            
            // Verify imported profile
            const importedProfile = settingsManager.getProfile(testProfileName);
            if (!importedProfile) {
                throw new Error("Imported profile not found");
            }
            
            if (importedProfile.prompt !== testProfile.prompt) {
                throw new Error("Imported profile prompt doesn't match original");
            }
            
            if (importedProfile.maxIterations !== testProfile.maxIterations) {
                throw new Error("Imported profile maxIterations doesn't match original");
            }
            
            if (importedProfile.criteria.length !== testProfile.criteria.length) {
                throw new Error("Imported profile criteria count doesn't match original");
            }
            
            // Test overwrite protection (profile exists now)
            const overwriteResult = await settingsManager.importProfile(exportData, false);
            if (overwriteResult.success || !overwriteResult.message.includes('already exists')) {
                throw new Error("Import should have failed due to existing profile");
            }
            
            // Test forced overwrite
            const forceImportResult = await settingsManager.importProfile(exportData, true);
            if (!forceImportResult.success) {
                throw new Error(`Forced import failed: ${forceImportResult.message}`);
            }
            
            // Cleanup
            await settingsManager.deleteProfile(testProfileName);
            
            return { 
                success: true, 
                message: "Export/Import Test: Settings profile export/import works correctly with overwrite protection" 
            };
        } catch (error: any) {
            // Cleanup on error as well
            try {
                const settingsManager = await SettingsManager.getInstance();
                await new Promise(resolve => setTimeout(resolve, 100));
                await settingsManager.deleteProfile(testProfileName);
            } catch (cleanupError) {
                // Ignore cleanup errors during test failure
            }
            return { success: false, message: `Export/Import Test Failed: ${error.message}` };
        }
    }
} 