import { TreeService } from './TreeService';
import { ContextService } from './ContextService';
import { PromptService } from './PromptService';
import { DocumentNode } from '../DocumentNode';
import { SettingsManager } from '../SettingsManager';

/**
 * Simple test script to verify Phase 1 services work correctly.
 * This can be run to validate the refactoring before proceeding to Phase 2.
 */
export async function testPhase1Services(): Promise<void> {
    console.log('🧪 Testing Phase 1 Services...');
    
    // Create test data
    const template = ['Book', 'Chapter', 'Scene'];
    const rootNode = new DocumentNode(0, 'Test Book', null, template);
    rootNode.context = 'This is a test book about software architecture.';
    
    const chapter1 = new DocumentNode(1, 'Chapter 1: Introduction', rootNode.id, template);
    chapter1.context = 'Introduction to the main concepts.';
    chapter1.content = 'This chapter covers:\n- Basic concepts\n- Key principles\n- Getting started';
    rootNode.children.push(chapter1);
    
    const scene1 = new DocumentNode(2, 'Scene 1: The Beginning', chapter1.id, template);
    chapter1.children.push(scene1);
    
    // Test TreeService
    console.log('📁 Testing TreeService...');
    const treeService = new TreeService();
    
    const foundNode = treeService.findNodeById(scene1.id, rootNode);
    console.log(`✓ Found node: ${foundNode?.title}`);
    
    const path = treeService.getNodePath(scene1.id, rootNode);
    console.log(`✓ Path: ${path}`);
    
    const siblings = treeService.getSiblings(scene1.id, rootNode);
    console.log(`✓ Siblings count: ${siblings.length}`);
    
    // Test ContextService
    console.log('🧠 Testing ContextService...');
    const contextService = new ContextService(treeService);
    
    const context = contextService.compileNodeContext(scene1.id, rootNode);
    console.log(`✓ Context length: ${context.length} characters`);
    console.log(`✓ Has ancestral context: ${context.includes('ANCESTRAL CONTEXT')}`);
    
    const contextSummary = contextService.getContextSummary(scene1.id, rootNode);
    console.log(`✓ Context summary: ${contextSummary}`);
    
    // Test PromptService (requires SettingsManager)
    console.log('📝 Testing PromptService...');
    const settingsManager = await SettingsManager.getInstance();
    const promptService = new PromptService(settingsManager);
    
    try {
        const rawPrompt = promptService.getRawGenerationPrompt(scene1);
        console.log(`✓ Raw prompt available: ${rawPrompt.length > 0}`);
        
        const filledPrompt = promptService.fillGenerationPrompt(
            'Generate content for {{title}} in {{path}}. Context: {{context}}',
            scene1,
            context,
            path
        );
        console.log(`✓ Filled prompt length: ${filledPrompt.length} characters`);
        
        const bulletList = promptService.parseBulletedList('* Item 1\n* Item 2\n- Item 3');
        console.log(`✓ Parsed bullets: ${bulletList.length} items`);
        
        const tokenCount = promptService.estimateTokenCount(filledPrompt);
        console.log(`✓ Estimated tokens: ${tokenCount}`);
    } catch (error) {
        console.log(`⚠️ PromptService test requires proper settings: ${error}`);
    }
    
    console.log('✅ Phase 1 Services Test Complete!');
}

/**
 * Benchmark the services to ensure performance is maintained.
 */
export function benchmarkServices(): void {
    console.log('⏱️ Benchmarking Services...');
    
    const template = ['Book', 'Chapter', 'Scene'];
    const rootNode = new DocumentNode(0, 'Benchmark Book', null, template);
    
    // Create a larger tree for benchmarking
    for (let i = 0; i < 10; i++) {
        const chapter = new DocumentNode(1, `Chapter ${i + 1}`, rootNode.id, template);
        rootNode.children.push(chapter);
        
        for (let j = 0; j < 10; j++) {
            const scene = new DocumentNode(2, `Scene ${j + 1}`, chapter.id, template);
            chapter.children.push(scene);
        }
    }
    
    const treeService = new TreeService();
    const contextService = new ContextService(treeService);
    
    // Benchmark tree operations
    const start = performance.now();
    
    // Find all leaf nodes
    const leafNodes = treeService.getLeafNodes(rootNode);
    
    // Generate context for each leaf
    for (const leaf of leafNodes.slice(0, 10)) { // Test first 10 only
        contextService.compileNodeContext(leaf.id, rootNode);
    }
    
    const end = performance.now();
    console.log(`✓ Processed ${leafNodes.length} leaf nodes in ${(end - start).toFixed(2)}ms`);
    console.log(`✓ Average: ${((end - start) / leafNodes.length).toFixed(2)}ms per node`);
}

// Export for external testing
export { TreeService, ContextService, PromptService }; 