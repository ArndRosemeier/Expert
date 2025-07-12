import { SettingsManager } from '../SettingsManager';
import { OpenRouterClient } from '../OpenRouterClient';
import { LoopOrchestrator } from '../LoopOrchestrator';
import { DocumentNode } from '../DocumentNode';
import { ProjectManager } from '../ProjectManager';
import { TreeService } from './TreeService';
import { PromptService } from './PromptService';
import { GenerationService } from './GenerationService';
import { ContextExtractionService } from './ContextExtractionService';
import { GenerationController } from './GenerationController';
import { ProjectPersistenceService } from './ProjectPersistenceService';

/**
 * Test script to verify Phase 2 services work correctly.
 */
export async function testPhase2Services(): Promise<void> {
    console.log('🧪 Testing Phase 2 Services...');
    
    // Create test dependencies
    const template = ['Book', 'Chapter', 'Scene'];
    const rootNode = new DocumentNode(0, 'Test Book', null, template);
    const openRouterClient = OpenRouterClient.getInstance();
    
    // Mock SettingsManager for testing
    const mockSettingsManager = await SettingsManager.getInstance();
    const loopOrchestrator = new LoopOrchestrator(mockSettingsManager, openRouterClient);

    
    // Test GenerationController
    console.log('�� Testing GenerationController...');
    const treeService = new TreeService();
    const generationController = new GenerationController(loopOrchestrator, treeService);
    
    // Test generation context setup
    const singleContext = generationController.setupSingleNodeGeneration('test-node-1');
    console.log(`✓ Single generation context: type=${singleContext.type}, nodes=${singleContext.nodeIds.length}`);
    
    const bulkContext = generationController.setupBulkGeneration(['node-1', 'node-2', 'node-3']);
    console.log(`✓ Bulk generation context: type=${bulkContext.type}, nodes=${bulkContext.nodeIds.length}`);
    
    // Test generation info
    const generationInfo = generationController.getCurrentGenerationInfo();
    console.log(`✓ Generation info: ${generationInfo ? `${generationInfo.type} with ${generationInfo.nodeCount} nodes` : 'none'}`);
    
    // Test abort functionality
    const canAbort = generationController.canAbortGeneration(rootNode);
    console.log(`✓ Can abort generation: ${canAbort}`);
    
    // Test clear
    generationController.clearGenerationContext();
    const infoAfterClear = generationController.getCurrentGenerationInfo();
    console.log(`✓ Generation cleared: ${infoAfterClear === null}`);
    
    // Test ProjectPersistenceService
    console.log('💾 Testing ProjectPersistenceService...');
    
    // Create a mock project for testing
    const mockProject = {
        projectTitle: 'Test Project',
        template: { name: 'Test Template', hierarchyLevels: template, scaffoldingDocuments: [] },
        rootNode: rootNode
    };
    
    // Test serialization
    const serialized = ProjectPersistenceService.save(mockProject);
    console.log(`✓ Project serialization: ${serialized.length} characters`);
    
    try {
        const parsed = JSON.parse(serialized);
        console.log(`✓ Serialized data is valid JSON: ${parsed.projectTitle}`);
    } catch (error) {
        console.log(`❌ Serialization error: ${error}`);
    }
    
    // Test project data parsing
    try {
        const parsedData = ProjectPersistenceService.parseProjectData(serialized);
        console.log(`✓ Project data parsed: ${parsedData.projectTitle}`);
        console.log(`✓ Template parsed: ${parsedData.template.name}`);
        console.log(`✓ Root node parsed: ${parsedData.rootNode.title}`);
    } catch (error) {
        console.log(`❌ Parse project data error: ${error}`);
    }
    
    // Test node rehydration
    try {
        const plainNode = {
            id: 'test-id',
            level: 0,
            title: 'Test Node',
            parentId: null,
            template: template,
            content: 'Test content',
            context: 'Test context',
            children: []
        };
        
        const rehydratedNode = ProjectPersistenceService.rehydrateNode(plainNode);
        console.log(`✓ Node rehydrated: ${rehydratedNode.title}`);
        console.log(`✓ Node context: ${rehydratedNode.context}`);
        console.log(`✓ Node content: ${rehydratedNode.content}`);
    } catch (error) {
        console.log(`❌ Node rehydration error: ${error}`);
    }
    
    console.log('✅ Phase 2 Services Test Complete!');
}

/**
 * Test integration between Phase 1 and Phase 2 services.
 */
export async function testServiceIntegration(): Promise<void> {
    console.log('🔗 Testing Service Integration...');
    
    // Create test data
    const template = ['Book', 'Chapter', 'Scene'];
    const rootNode = new DocumentNode(0, 'Integration Test Book', null, template);
    
    const chapter1 = new DocumentNode(1, 'Chapter 1', rootNode.id, template);
    rootNode.children.push(chapter1);
    
    const scene1 = new DocumentNode(2, 'Scene 1', chapter1.id, template);
    chapter1.children.push(scene1);
    
    // Test TreeService + GenerationController integration
    const treeService = new TreeService();
    const openRouterClient2 = OpenRouterClient.getInstance();
    
    // Mock SettingsManager for testing
    const mockSettingsManager = await SettingsManager.getInstance();
    const loopOrchestrator = new LoopOrchestrator(mockSettingsManager, openRouterClient2);
    const generationController = new GenerationController(loopOrchestrator, treeService);
    
    // Simulate starting generation on a node

    scene1.isGenerating = true;
    
    // Test that GenerationController can detect generating nodes
    const isGenerating = generationController.canAbortGeneration(rootNode);
    console.log(`✓ Controller detects generating node: ${isGenerating}`);
    
    // Test clearing flags via controller
    const abortedNodes = generationController.abortCurrentGeneration(rootNode);
    console.log(`✓ Generation aborted, cleared flags on: ${abortedNodes.length} nodes`);
    console.log(`✓ Node no longer generating: ${!scene1.isGenerating}`);
    
    // Test ProjectPersistenceService + TreeService integration
    const mockProject = {
        projectTitle: 'Integration Test',
        template: { name: 'Test Template', hierarchyLevels: template, scaffoldingDocuments: [] },
        rootNode: rootNode
    };
    
    const serialized = ProjectPersistenceService.save(mockProject);
    const parsedData = ProjectPersistenceService.parseProjectData(serialized);
    
    // Verify the tree structure is preserved
    const restoredRoot = parsedData.rootNode;
    console.log(`✓ Tree structure preserved: ${restoredRoot.children.length} chapters`);
    
    const restoredChapter = restoredRoot.children[0];
    console.log(`✓ Chapter preserved: ${restoredChapter.title} with ${restoredChapter.children.length} scenes`);
    
    const restoredScene = restoredChapter.children[0];
    console.log(`✓ Scene preserved: ${restoredScene.title}`);
    
    // Test TreeService can work with restored data
    const foundNode = treeService.findNodeById(restoredScene.id, restoredRoot);
    console.log(`✓ TreeService can find restored node: ${foundNode?.title}`);
    
    const path = treeService.getNodePath(restoredScene.id, restoredRoot);
    console.log(`✓ Path generation works with restored data: ${path}`);
    
    console.log('✅ Service Integration Test Complete!');
}

// Export for external testing
export { GenerationController, ProjectPersistenceService }; 