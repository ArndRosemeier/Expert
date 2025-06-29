import { ContextExtractionService } from './ContextExtractionService';
import { DocumentNode } from '../DocumentNode';
import { TreeService } from './TreeService';
import { SettingsManager } from '../SettingsManager';

/**
 * Test the ContextExtractionService functionality
 */
export async function testContextExtraction(): Promise<void> {
    console.log('🧪 Testing Context Extraction...');

    // Create mock dependencies
    const treeService = new TreeService();
    const settingsManager = new SettingsManager();
    
    // Create a mock OpenRouterClient for testing
    const mockOpenRouterClient = {
        chat: async (purpose: string, prompt: string): Promise<string> => {
            // Mock response for context extraction
            return `Characters: Alice (protagonist), Bob (mentor), Charlie (villain)
Places: Castle Blackrock, The Whispering Woods, Village of Millhaven
Themes: Courage, sacrifice, redemption
Key Events: The awakening ceremony, The battle at dawn, The final confrontation`;
        }
    } as any;

    const contextExtractionService = new ContextExtractionService(mockOpenRouterClient, settingsManager);

    // Create a test node with content
    const testNode = new DocumentNode(
        0, 
        'Chapter 1: The Journey Begins', 
        null, 
        ['Book', 'Chapter', 'Section']
    );
    testNode.content = `
Alice stood at the gates of Castle Blackrock, her heart pounding with anticipation. 
The ancient stones seemed to whisper secrets of the past, and she could feel the weight 
of destiny upon her shoulders. Bob, her mentor, had warned her about the dangers that 
lay ahead, but she knew that facing Charlie, the dark sorcerer, was her true calling.

The village of Millhaven seemed like a distant memory now, and the safety of home 
felt like a luxury she could no longer afford. The awakening ceremony had changed 
everything, imbuing her with powers she was still learning to control. 

As she stepped through the gates into the Whispering Woods, Alice knew that this 
journey would test not only her courage but also her willingness to sacrifice 
everything for the greater good. The themes of redemption and justice burned bright 
in her heart as she moved deeper into the forest, ready to face whatever challenges 
awaited her.
    `;

    try {
        console.log('📝 Testing character extraction...');
        const characterResult = await contextExtractionService.extractContext(
            testNode, 
            'characters and their roles'
        );
        
        console.log('✓ Character extraction result:');
        console.log(characterResult);
        
        console.log('📝 Testing location extraction...');
        const locationResult = await contextExtractionService.extractContext(
            testNode, 
            'places and locations mentioned'
        );
        
        console.log('✓ Location extraction result:');
        console.log(locationResult);
        
        console.log('📝 Testing theme extraction...');
        const themeResult = await contextExtractionService.extractContext(
            testNode, 
            'themes and concepts'
        );
        
        console.log('✓ Theme extraction result:');
        console.log(themeResult);
        
        console.log('✅ Context extraction tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Context extraction test failed:', error);
        throw error;
    }
}

/**
 * Run all context-related tests
 */
export async function runAllContextTests(): Promise<void> {
    console.log('🚀 Running all context tests...');
    
    try {
        await testContextExtraction();
        console.log('🎉 All context tests passed!');
    } catch (error) {
        console.error('💥 Context tests failed:', error);
        throw error;
    }
} 