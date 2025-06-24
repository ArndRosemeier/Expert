import { ContextExtractionService } from './ContextExtractionService';
import { DocumentNode } from '../DocumentNode';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';

/**
 * Test suite for ContextExtractionService
 * This is a manual test that can be run to verify the service works correctly
 */

// Mock implementation for testing
class MockOpenRouterClient extends OpenRouterClient {
    constructor() {
        super('test-key');
    }

    async chat(purpose: string, message: string): Promise<string> {
        // Simulate AI response based on the extraction prompt
        if (message.includes('characters')) {
            return `Characters found in the content:

1. **John Smith** - Protagonist, a software engineer working on AI projects
2. **Sarah Johnson** - John's colleague and project manager
3. **Dr. Michael Chen** - Senior researcher and mentor figure
4. **Emma Wilson** - Marketing specialist who helps with product launch

These characters appear throughout the narrative and drive the main plot points.`;
        } else if (message.includes('places')) {
            return `Locations mentioned in the content:

1. **TechCorp Headquarters** - Main office building in downtown Seattle
2. **Innovation Lab** - High-tech research facility on the 15th floor
3. **Conference Room A** - Where important meetings and presentations occur
4. **Coffee Shop Downstairs** - Informal meeting place for casual discussions
5. **John's Apartment** - Personal residence where some planning occurs

These locations provide the setting for various scenes and interactions.`;
        } else {
            return `Extracted information for "${message.split('extract information about: ')[1]?.split('\n')[0] || 'unknown'}":

Based on the content analysis, here are the key elements found:
- Multiple relevant instances identified
- Context and relationships mapped
- Detailed breakdown provided
- Organized for easy reference`;
        }
    }
}

export async function testContextExtraction(): Promise<void> {
    console.log('🧪 Starting ContextExtractionService tests...\n');

    // Create test dependencies
    const mockClient = new MockOpenRouterClient();
    const settingsManager = new SettingsManager();
    const contextExtractionService = new ContextExtractionService(mockClient, settingsManager);

    // Create test document hierarchy
    const rootNode = new DocumentNode(0, 'Test Project', null, ['Book', 'Chapter', 'Scene']);
    rootNode.content = 'This is a story about John Smith, a software engineer at TechCorp. The story takes place in Seattle, with most action happening at the TechCorp Headquarters building.';

    const chapter1 = new DocumentNode(1, 'Chapter 1: The Beginning', rootNode.id, ['Book', 'Chapter', 'Scene']);
    chapter1.content = 'John Smith starts his new job at TechCorp Headquarters. He meets Sarah Johnson, his project manager, in Conference Room A. Dr. Michael Chen, the senior researcher, gives him a tour of the Innovation Lab.';
    rootNode.children.push(chapter1);

    const scene1 = new DocumentNode(2, 'Scene 1: First Day', chapter1.id, ['Book', 'Chapter', 'Scene']);
    scene1.content = 'John nervously enters the building and takes the elevator to the 15th floor. Sarah Johnson greets him with a warm smile and introduces him to the team. They head to the Coffee Shop Downstairs for an informal chat.';
    chapter1.children.push(scene1);

    const scene2 = new DocumentNode(2, 'Scene 2: The Lab Tour', chapter1.id, ['Book', 'Chapter', 'Scene']);
    scene2.content = 'Dr. Michael Chen shows John around the Innovation Lab, explaining the various AI projects. Emma Wilson from marketing joins them to discuss the upcoming product launch.';
    chapter1.children.push(scene2);

    try {
        // Test 1: Extract from root node only (depth 0)
        console.log('Test 1: Extracting characters from root node only (depth 0)');
        const result1 = await contextExtractionService.extractContext(rootNode, 'characters', 0);
        console.log('✅ Result 1:');
        console.log(result1);
        console.log('\n' + '='.repeat(60) + '\n');

        // Test 2: Extract from root + children (depth 1)
        console.log('Test 2: Extracting places from root + children (depth 1)');
        const result2 = await contextExtractionService.extractContext(rootNode, 'places', 1);
        console.log('✅ Result 2:');
        console.log(result2);
        console.log('\n' + '='.repeat(60) + '\n');

        // Test 3: Extract from full hierarchy (depth 2)
        console.log('Test 3: Extracting themes from full hierarchy (depth 2)');
        const result3 = await contextExtractionService.extractContext(rootNode, 'themes and plot points', 2);
        console.log('✅ Result 3:');
        console.log(result3);
        console.log('\n' + '='.repeat(60) + '\n');

        // Test 4: Preview functionality
        console.log('Test 4: Testing preview functionality');
        const preview0 = contextExtractionService.getContentPreview(rootNode, 0);
        const preview1 = contextExtractionService.getContentPreview(rootNode, 1);
        const preview2 = contextExtractionService.getContentPreview(rootNode, 2);

        console.log('✅ Preview depth 0:', preview0.summary);
        console.log('✅ Preview depth 1:', preview1.summary);
        console.log('✅ Preview depth 2:', preview2.summary);
        console.log('\n' + '='.repeat(60) + '\n');

        // Test 5: Validation functionality
        console.log('Test 5: Testing validation');
        const validation1 = contextExtractionService.validateExtractionParameters(rootNode, '', 0);
        const validation2 = contextExtractionService.validateExtractionParameters(rootNode, 'characters', -1);
        const validation3 = contextExtractionService.validateExtractionParameters(rootNode, 'characters', 15);

        console.log('✅ Empty prompt validation:', validation1);
        console.log('✅ Negative depth validation:', validation2);
        console.log('✅ Excessive depth validation:', validation3);

        console.log('\n🎉 All ContextExtractionService tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

// Helper function to run tests manually
export function runContextExtractionTests() {
    testContextExtraction().catch(console.error);
} 