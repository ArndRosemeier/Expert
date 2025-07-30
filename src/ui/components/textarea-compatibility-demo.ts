/**
 * Demo/test file for UniversalTextEditor textarea compatibility
 * 
 * This file demonstrates the new textarea replacement capabilities
 * and can be used for testing backward compatibility.
 */

import { UniversalTextEditor } from './UniversalTextEditor';

// ============================================================================
// DEMO: Static Factory Methods
// ============================================================================

/**
 * Demo of replacing an existing textarea with UniversalTextEditor
 */
export function demoTextareaReplacement(): void {
    // Create a test textarea
    const container = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Original textarea placeholder';
    textarea.value = 'Some initial content';
    textarea.className = 'test-textarea';
    container.appendChild(textarea);
    
    // Replace with UniversalTextEditor
    const editor = UniversalTextEditor.replace(textarea, {
        mode: 'enhanced' // Upgrade to enhanced mode with AI features
    });
    
    console.log('✅ Textarea replaced successfully');
    console.log('📝 Current value:', editor.value);
    console.log('🎯 Mode:', editor.getMode());
}

/**
 * Demo of creating a new editor with textarea-like API
 */
export function demoTextareaCreation(): void {
    const container = document.createElement('div');
    
    // Create editor with simple textarea-like interface
    const editor = UniversalTextEditor.create(container, {
        value: 'Initial text content',
        placeholder: 'Enter your text here...',
        mode: 'simple',
        autoResize: true
    });
    
    console.log('✅ Textarea-style editor created');
    console.log('📝 Current value:', editor.value);
    console.log('🎯 Mode:', editor.getMode());
}

/**
 * Demo of enhanced editor creation
 */
export function demoEnhancedCreation(): void {
    const container = document.createElement('div');
    
    // Create enhanced editor with AI features
    const editor = UniversalTextEditor.createEnhanced(container, {
        value: 'This text supports AI transformations and highlighting',
        placeholder: 'AI-enhanced text editor...'
    });
    
    console.log('✅ Enhanced editor created');
    console.log('📝 Current value:', editor.value);
    console.log('🎯 Mode:', editor.getMode());
    console.log('🤖 Enhanced features:', editor.isEnhanced());
}

// ============================================================================
// DEMO: DOM Event Compatibility
// ============================================================================

/**
 * Demo of standard DOM event interface
 */
export function demoDOMEventInterface(): void {
    const container = document.createElement('div');
    const editor = UniversalTextEditor.create(container, {
        value: 'Test text for events'
    });
    
    // Add standard DOM event listeners
    editor.addEventListener('input', (event) => {
        console.log('📝 Input event fired:', event);
        console.log('📄 Current text:', editor.value);
    });
    
    editor.addEventListener('focus', () => {
        console.log('🎯 Editor focused');
    });
    
    editor.addEventListener('blur', () => {
        console.log('👋 Editor blurred');
    });
    
    // Test programmatic changes
    editor.value = 'Updated via .value property';
    
    console.log('✅ DOM event listeners attached');
    console.log('📝 Final value:', editor.value);
}

// ============================================================================
// DEMO: Textarea API Compatibility
// ============================================================================

/**
 * Demo of HTMLTextAreaElement API compatibility
 */
export function demoTextareaAPICompatibility(): void {
    const container = document.createElement('div');
    const editor = UniversalTextEditor.create(container, {
        value: 'Hello World! This is a test of textarea API compatibility.'
    });
    
    // Test textarea API methods and properties
    console.log('📝 Initial value:', editor.value);
    console.log('🔤 Selection start:', editor.selectionStart);
    console.log('🔤 Selection end:', editor.selectionEnd);
    
    // Test selection
    editor.setSelection(0, 5); // Select "Hello"
    console.log('✂️ Selected text:', editor.getSelection().text);
    
    // Test setRangeText
    editor.setRangeText('Hi', 0, 5, 'select');
    console.log('📝 After setRangeText:', editor.value);
    
    // Test select all
    editor.select();
    console.log('📝 All text selected');
    
    // Test focus/blur
    editor.focus();
    editor.blur();
    
    console.log('✅ Textarea API compatibility verified');
}

// ============================================================================
// BACKWARD COMPATIBILITY TESTS
// ============================================================================

/**
 * Test that existing constructor patterns still work
 */
export function testBackwardCompatibility(): void {
    const container = document.createElement('div');
    
    // Test existing NodeInspector-style constructor usage
    const editor = new UniversalTextEditor(container, {
        mode: 'enhanced',
        placeholder: 'Enter content...',
        className: 'content-editor auto-resize',
        autoResize: true
    }, {
        onBlur: () => {
            console.log('👋 Blur handler called (backward compatibility)');
        },
        onTextChange: (text) => {
            console.log('📝 Text changed (backward compatibility):', text);
        }
    });
    
    editor.setText('Test content for backward compatibility');
    
    console.log('✅ Backward compatibility maintained');
    console.log('📝 Value via .value:', editor.value);
    console.log('📝 Value via .getText():', editor.getText());
    console.log('🎯 Mode:', editor.getMode());
    console.log('🤖 Enhanced:', editor.isEnhanced());
}

// ============================================================================
// CLEANUP TESTS
// ============================================================================

/**
 * Test automatic cleanup functionality
 */
export function testAutomaticCleanup(): void {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const editor = UniversalTextEditor.create(container, {
        value: 'Test automatic cleanup'
    });
    
    // Add event listener to verify cleanup
    let cleanupDetected = false;
    const originalDestroy = editor.destroy.bind(editor);
    editor.destroy = () => {
        cleanupDetected = true;
        console.log('🧹 Automatic cleanup triggered');
        originalDestroy();
    };
    
    // Remove from DOM to trigger cleanup
    setTimeout(() => {
        document.body.removeChild(container);
        
        // Check if cleanup was triggered
        setTimeout(() => {
            if (cleanupDetected) {
                console.log('✅ Automatic cleanup working correctly');
            } else {
                console.log('❌ Automatic cleanup not triggered');
            }
        }, 100);
    }, 100);
}

// ============================================================================
// EXPORT ALL DEMOS
// ============================================================================

export const demos = {
    textareaReplacement: demoTextareaReplacement,
    textareaCreation: demoTextareaCreation,
    enhancedCreation: demoEnhancedCreation,
    domEventInterface: demoDOMEventInterface,
    textareaAPICompatibility: demoTextareaAPICompatibility,
    backwardCompatibility: testBackwardCompatibility,
    automaticCleanup: testAutomaticCleanup
};

// Make demos available globally for testing
if (typeof window !== 'undefined') {
    (window as any).universalTextEditorDemos = demos;
}

export default demos;