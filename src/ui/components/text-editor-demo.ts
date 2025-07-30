import { UniversalTextEditor } from './UniversalTextEditor';
import { createTextEditor, addModeSwitcher, replaceTextareaWithUniversalEditor } from './text-editor-utils';

/**
 * Demonstration of Universal Text Editor usage patterns
 * This file shows various ways to integrate the Universal Text Editor
 */

/**
 * Example 1: Replace existing textarea creation in modals
 * BEFORE: const textarea = createElement('textarea', { ... });
 * AFTER: Use this pattern
 */
export function createModalTextEditor(container: HTMLElement): UniversalTextEditor {
    return createTextEditor(container, {
        mode: 'simple',
        className: 'large-textarea',
        rows: 5,
        autoResize: true,
        placeholder: 'Enter your text here...'
    }, {
        onTextChange: (text) => console.log('Text changed:', text.length, 'characters'),
        onFocus: () => console.log('Editor focused'),
        onBlur: () => console.log('Editor blurred')
    });
}

/**
 * Example 2: Migration pattern for existing project-ui.ts textareas
 * This shows how to replace the textarea in renderNodeDetails()
 */
export function createNodeContentEditor(container: HTMLElement, initialContent: string = ''): UniversalTextEditor {
    const editor = createTextEditor(container, {
        mode: 'simple', // Start simple, allow upgrade
        className: 'large-textarea',
        rows: 15,
        placeholder: 'Node content will be generated or can be written here...'
    }, {
        onTextChange: () => {
            // This would integrate with your existing node update logic
            console.log('Node content updated');
        },
        onBlur: async () => {
            // This would trigger save - same pattern as existing blur handlers
            console.log('Saving node content...');
        }
    });
    
    editor.setText(initialContent);
    
    // Add mode switcher for enhanced features
    addModeSwitcher(editor, container, 'top');
    
    return editor;
}

/**
 * Example 3: Enhanced mode with AI features
 * This shows how to use the enhanced mode for AI-powered editing
 */
export function createAIEnabledEditor(container: HTMLElement): UniversalTextEditor {
    const editor = createTextEditor(container, {
        mode: 'enhanced', // Start in enhanced mode
        className: 'large-textarea',
        rows: 10
    }, {
        onTextChange: () => {
            console.log('AI-enhanced editor content changed');
        },
        onModeSwitch: (mode) => {
            console.log('Switched to', mode, 'mode');
        }
    });
    
    // Configure AI features
    editor.setSelectionMode('sentences');
    
    // Example: Add a highlight after AI processes text
    setTimeout(() => {
        editor.addHighlight('ai-suggestion', 0, 20, 'highlight-ai-replacement');
    }, 1000);
    
    return editor;
}

/**
 * Example 4: Batch migration of existing textareas
 * This shows how to upgrade an entire modal or UI section
 */
export function upgradeExistingTextareas(containerSelector: string): void {
    const container = document.querySelector(containerSelector) as HTMLElement;
    if (!container) return;
    
    const textareas = Array.from(container.querySelectorAll('textarea'));
    
    textareas.forEach(textarea => {
        // Preserve existing functionality (could be used for conditional logic)
        
        // Replace with Universal Editor
        const editor = replaceTextareaWithUniversalEditor(textarea, 'simple');
        
        // Add enhancement button if this is a content textarea
        if (textarea.id.includes('content') || textarea.classList.contains('large-textarea')) {
            const wrapper = editor.getHTMLElement().parentElement!;
            addModeSwitcher(editor, wrapper, 'top');
        }
        
        console.log('Upgraded textarea', textarea.id || textarea.className);
    });
}

/**
 * Example 5: Integration with existing autoResizeTextarea utility
 * This shows backward compatibility
 */
export function createCompatibleEditor(container: HTMLElement): UniversalTextEditor {
    const editor = createTextEditor(container, {
        mode: 'simple',
        autoResize: true // This internally uses your existing autoResizeTextarea function
    });
    
    // You can still call autoResizeTextarea on the underlying textarea if needed
    const textarea = editor.getTextArea();
    if (textarea) {
        // This would work with your existing utility
        // autoResizeTextarea(textarea);
    }
    
    return editor;
}

/**
 * Example 6: Progressive enhancement pattern
 * Start simple, add features based on user interaction
 */
export function createProgressiveEditor(container: HTMLElement): UniversalTextEditor {
    let hasUserInteracted = false;
    
    const editor = createTextEditor(container, {
        mode: 'simple',
        placeholder: 'Start typing... (Enhanced features available)'
    }, {
        onTextChange: (text) => {
            if (!hasUserInteracted && text.length > 50) {
                hasUserInteracted = true;
                showEnhancementPrompt(editor, container);
            }
        }
    });
    
    return editor;
}

function showEnhancementPrompt(editor: UniversalTextEditor, container: HTMLElement): void {
    const prompt = document.createElement('div');
    prompt.className = 'enhancement-prompt';
    prompt.innerHTML = `
        <div style="background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; padding: 8px; margin-top: 4px;">
            <span>💡 Want AI-powered editing features? </span>
            <button class="button button-primary button-sm" id="enable-ai">Enable Enhanced Mode</button>
            <button class="button button-secondary button-sm" id="dismiss-prompt">Maybe Later</button>
        </div>
    `;
    
    container.appendChild(prompt);
    
    const enableButton = prompt.querySelector('#enable-ai') as HTMLButtonElement;
    const dismissButton = prompt.querySelector('#dismiss-prompt') as HTMLButtonElement;
    
    enableButton.addEventListener('click', () => {
        editor.switchMode('enhanced');
        addModeSwitcher(editor, container, 'top');
        prompt.remove();
    });
    
    dismissButton.addEventListener('click', () => {
        prompt.remove();
    });
}

/**
 * Example 7: Integration with existing event patterns
 * This shows how to maintain compatibility with existing blur-to-save patterns
 */
export function createEventCompatibleEditor(container: HTMLElement, nodeId: string): UniversalTextEditor {
    const editor = createTextEditor(container, {
        mode: 'simple',
        className: 'large-textarea'
    }, {
        onBlur: async () => {
            // This mimics the existing pattern in project-ui.ts
            try {
                console.log('Saving node', nodeId);
                // await saveNodeContent(nodeId, editor.value);
                // await renderNodeDetails(); // Refresh UI
            } catch (error) {
                console.error('Failed to save node content:', error);
            }
        },
        onTextChange: () => {
            // Debounced auto-save could go here
            console.log('Content changed for node', nodeId);
        }
    });
    
    return editor;
} 