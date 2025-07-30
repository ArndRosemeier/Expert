import { 
  openTextTransformModal, 
  transformSelectedText, 
  transformTextWithContext, 
  quickFormatTransform,
  openTextTransformModalWithCallback 
} from './TextTransformUtils';

/**
 * Demo functions showing how to use the Text Transform Modal
 * 
 * You can call these functions from the browser console to test:
 * - window.demoBasicTransform()
 * - window.demoWithContext()
 * - window.demoQuickFormat()
 * - window.demoWithCallback()
 */

// Basic text transformation
function demoBasicTransform() {
  const sampleText = "This is a simple sentence that needs improvement.";
  openTextTransformModal(
    sampleText, 
    undefined, 
    undefined, 
    "Make this more professional and engaging"
  );
}

// Transformation with context
function demoWithContext() {
  const sampleText = "Our sales increased by 15% this quarter.";
  const context = "This is for a quarterly business report presentation to executives.";
  transformTextWithContext(sampleText, context);
}

// Quick format transformations
function demoQuickFormat() {
  const sampleText = "First item. Second item. Third item. Fourth item.";
  
  // Try different formats
  quickFormatTransform(sampleText, 'bullet-points');
}

// Using callback for custom handling
function demoWithCallback() {
  const sampleText = "Hello world, this is a test message.";
  
  openTextTransformModalWithCallback(sampleText, (transformedText: string) => {
    // Custom handling of the result
    // You could replace text in an editor, save to storage, etc.
    alert(`Transformation complete!\n\nOriginal: ${sampleText}\n\nTransformed: ${transformedText}`);
  });
}

// Integration example for Universal Text Editor
function demoUniversalTextEditorIntegration() {
  // Example of how you might integrate this with the Universal Text Editor
  // (This would be called from within the UniversalTextEditor when user selects text)
  
  const selectedText = "Some selected text from the editor";
  
  transformSelectedText(selectedText);
}

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).demoBasicTransform = demoBasicTransform;
  (window as any).demoWithContext = demoWithContext;
  (window as any).demoQuickFormat = demoQuickFormat;
  (window as any).demoWithCallback = demoWithCallback;
  (window as any).demoUniversalTextEditorIntegration = demoUniversalTextEditorIntegration;
  (window as any).demoGlobalAIUndo = demoGlobalAIUndo;
}

// Global AI undo testing function
function demoGlobalAIUndo() {
    try {
        // Test the global AI undo functionality
        // Instructions:
        // 1. Open Node Inspector and edit some content
        // 2. Select text and do an AI transformation (¶ or § buttons)  
        // 3. Watch for animated spinner overlay left of highlighted text during AI processing
        // 4. Notice editor automatically gets focus after AI transformation completes
        // 5. Press Ctrl+Z → Should undo to pre-AI state
        // 6. Press Ctrl+Z again → Should REDO back to AI-transformed state (automatic toggle)
        // 7. Keep pressing Ctrl+Z → Toggles between original and AI-transformed text forever
        // 8. Close and reopen the modal → AI undo/redo still works, auto-focus too
        // 9. Switch to different nodes → Only latest AI transformation is undoable/redoable
        
    } catch (error) {
        console.error('Error testing AI undo:', error);
    }
}

export {
  demoBasicTransform,
  demoWithContext,
  demoQuickFormat,
  demoWithCallback,
  demoUniversalTextEditorIntegration,
  demoGlobalAIUndo
}; 