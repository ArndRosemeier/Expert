/**
 * XML Story Creation System Demo
 * 
 * This demo script shows how to use the XML story creation system
 * and can be used for testing the core functionality.
 */

import { 
    createXMLStorySystem, 
    XML_TAG_EXAMPLES,
    XMLStoryValidation
} from './index';
import type { StoryElement, StoryElementType } from './types/XMLStoryTypes';

/**
 * Demo function to test the XML story creation system
 */
export async function runXMLStoryDemo(): Promise<void> {
    console.log('🎭 Starting XML Story Creation System Demo...\n');
    
    // Create the system
    const storySystem = createXMLStorySystem({
        maxElementsPerSection: 10,
        autoSaveDelay: 1000,
        batchEditNotifications: true
    });
    
    // Add event listener to track changes
    storySystem.addEventListener((event) => {
        console.log(`📢 Event: ${event.type}`, event.payload);
    });
    
    console.log('✅ XML Story System created\n');
    
    // Test 1: Parse AI response with XML tags
    console.log('🧪 Test 1: Parsing AI response with XML tags');
    const aiResponse = `Let me tell you about our main character. 
    
    <context id="elara" description="Elara: A skilled cartographer seeking her missing brother" />
    
    She lives in a fascinating city. <context id="neo_venice" description="Neo-Venice: A cyberpunk city built on the ruins of Venice, with digital canals and AR overlays" />
    
    The story begins when <outline id="discovery" description="Elara discovers her brother's journal with cryptic map references" />
    
    This sets up our main narrative. <context id="aesthetic" description="Story Setting: The story has a steampunk aesthetic with magical elements woven throughout" />
    
    That's the foundation of our tale.`;
    
    const parseResult = await storySystem.processAIResponse(aiResponse);
    
    console.log('📄 Cleaned text:', parseResult.cleanedText);
    console.log('🎯 Extracted elements:', parseResult.extractedElements.length);
    console.log('⚙️ System commands:', parseResult.systemCommands.length);
    console.log('❌ Errors:', parseResult.errors.length);
    
    // Show current state
    const state = storySystem.getWhiteboardState();
    console.log('📊 Total elements in whiteboard:', state.elements.size);
    console.log('');
    
    // Test 2: Human edits
    console.log('🧪 Test 2: Testing human edits');
    
    const elements = Array.from(state.elements.values()) as StoryElement[];
    if (elements.length > 0) {
        // Look for a context element (any context item)
        const contextElement = elements.find((e: StoryElement) => e.type === 'context');
        if (contextElement) {
            console.log('✏️ Making human edit to context element:', contextElement.id);
            await storySystem.handleHumanEdit(
                contextElement.id, 
                'Elara: A skilled but anxious cartographer with trust issues, seeking her missing brother'
            );
            
            const pendingEdits = storySystem.getPendingEdits();
            console.log('📝 Pending edits:', pendingEdits.length);
        }
    }
    console.log('');
    
    // Test 3: AI response that updates existing elements
    console.log('🧪 Test 3: AI response updating existing elements');
    
    const updateResponse = `Actually, let me clarify some details about our characters.
    
    <context id="elara" description="Elara: A highly skilled cartographer and former naval officer, searching for her missing brother who disappeared while exploring ancient ruins" />
    
    And I should mention another character: <context id="marcus" description="Marcus: A mysterious merchant with knowledge of ancient maps and hidden agendas" />
    
    </refresh>`;
    
    const updateResult = await storySystem.processAIResponse(updateResponse);
    console.log('📄 Updated elements:', updateResult.extractedElements.length);
    console.log('🔄 System commands found:', updateResult.systemCommands.length);
    
    const updatedState = storySystem.getWhiteboardState();
    console.log('📊 Total elements after update:', updatedState.elements.size);
    console.log('');
    
    // Test 4: Highlight clearing
    console.log('🧪 Test 4: Testing highlight clearing');
    
    // Check highlights before clearing
    let highlightCount = 0;
    for (const element of updatedState.elements.values()) {
        if (element.highlightUntilNext) {
            highlightCount++;
        }
    }
    console.log('💡 Elements with highlights before clearing:', highlightCount);
    
    // Clear highlights (simulates user sending next message)
    storySystem.clearHighlights();
    
    const clearedState = storySystem.getWhiteboardState();
    let clearedHighlightCount = 0;
    for (const element of clearedState.elements.values()) {
        if (element.highlightUntilNext) {
            clearedHighlightCount++;
        }
    }
    console.log('💡 Elements with highlights after clearing:', clearedHighlightCount);
    console.log('');
    
    // Test 5: State export/import
    console.log('🧪 Test 5: Testing state export/import');
    
    const exportedState = storySystem.exportState();
    console.log('💾 Exported state size:', JSON.stringify(exportedState).length + ' characters');
    
    // Reset and import
    storySystem.reset();
    console.log('🔄 System reset - elements count:', storySystem.getWhiteboardState().elements.size);
    
    storySystem.importState(exportedState);
    console.log('📥 State imported - elements count:', storySystem.getWhiteboardState().elements.size);
    console.log('');
    
    // Test 6: XML validation
    console.log('🧪 Test 6: Testing XML validation');
    
    const validXML = `<character name="Test" description="Valid character" />`;
    const invalidXML = `<character name="Test" description="Missing closing quote />`;
    
    const validResult = XMLStoryValidation.validateXMLTags(validXML);
    const invalidResult = XMLStoryValidation.validateXMLTags(invalidXML);
    
    console.log('✅ Valid XML result:', validResult);
    console.log('❌ Invalid XML result:', invalidResult);
    console.log('');
    
    // Test 7: Show all available XML tag examples
    console.log('🧪 Test 7: Available XML tag examples');
    Object.entries(XML_TAG_EXAMPLES).forEach(([type, example]) => {
        console.log(`${type}: ${example}`);
    });
    console.log('');
    
    // Final state summary
    console.log('📋 Final Demo Summary:');
    const finalState = storySystem.getWhiteboardState();
    const elementCounts = Array.from(finalState.elementsByType.entries()) as [StoryElementType, string[]][];
    
    elementCounts.forEach((entry: [StoryElementType, string[]]) => {
        const [type, elementIds] = entry;
        console.log(`  ${type}: ${elementIds.length} elements`);
    });
    
    console.log('\n🎉 XML Story Creation System Demo completed successfully!');
}

/**
 * Test error handling
 */
export async function testErrorHandling(): Promise<void> {
    console.log('🧪 Testing error handling...\n');
    
    const storySystem = createXMLStorySystem();
    
    // Test malformed XML
    const malformedXML = `This has <character name="incomplete tag`;
    
    try {
        const result = await storySystem.processAIResponse(malformedXML);
        console.log('📄 Malformed XML result:', {
            cleanedText: result.cleanedText,
            elementsExtracted: result.extractedElements.length,
            errorsFound: result.errors.length
        });
        
        if (result.errors.length > 0) {
            console.log('❌ Errors found:', result.errors);
        }
    } catch (error) {
        console.error('💥 Error processing malformed XML:', error);
    }
    
    // Test invalid element ID
    try {
        await storySystem.handleHumanEdit('invalid_id', 'test content');
    } catch (error) {
        console.log('✅ Correctly caught invalid element ID error:', (error as Error).message);
    }
    
    console.log('\n✅ Error handling tests completed');
}

/**
 * Performance test with many elements
 */
export async function performanceTest(): Promise<void> {
    console.log('⚡ Running performance test...\n');
    
    const storySystem = createXMLStorySystem({
        maxElementsPerSection: 100
    });
    
    const startTime = performance.now();
    
    // Create a large AI response with many elements
    let largeResponse = 'Creating many story elements:\n\n';
    
    for (let i = 1; i <= 50; i++) {
        largeResponse += `<context id="char${i}" description="Character${i}: Test character number ${i}" />\n`;
        largeResponse += `<context id="loc${i}" description="Location${i}: Test location number ${i}" />\n`;
    }
    
    const parseResult = await storySystem.processAIResponse(largeResponse);
    const endTime = performance.now();
    
    console.log(`📊 Performance Results:`);
    console.log(`  - Elements processed: ${parseResult.extractedElements.length}`);
    console.log(`  - Processing time: ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`  - Elements per second: ${(parseResult.extractedElements.length / ((endTime - startTime) / 1000)).toFixed(0)}`);
    
    const state = storySystem.getWhiteboardState();
    console.log(`  - Total elements in state: ${state.elements.size}`);
    
    console.log('\n⚡ Performance test completed');
}

// Export demo functions for use in browser console or testing
export const XMLStoryDemo = {
    runXMLStoryDemo,
    testErrorHandling,
    performanceTest,
    
    // Quick test function
    quickTest: async () => {
        const system = createXMLStorySystem();
        const response = `<context id="testchar" description="TestChar: A test character" />`;
        const result = await system.processAIResponse(response);
        console.log('Quick test result:', result);
        return result;
    }
};

// If running in a Node.js environment, you can run the demo directly
if (typeof window === 'undefined' && typeof process !== 'undefined') {
    // Running in Node.js
    runXMLStoryDemo()
        .then(() => testErrorHandling())
        .then(() => performanceTest())
        .catch(console.error);
} 