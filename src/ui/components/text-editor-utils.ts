import { UniversalTextEditor, UniversalTextEditorOptions, TextEditorEventHandlers } from './UniversalTextEditor';

/**
 * Utility functions for working with Universal Text Editor
 */

/**
 * Create a Universal Text Editor with default settings that match common textarea usage
 */
export function createTextEditor(
    container: HTMLElement,
    options: Partial<UniversalTextEditorOptions> = {},
    handlers: TextEditorEventHandlers = {}
): UniversalTextEditor {
    const defaultOptions: UniversalTextEditorOptions = {
        mode: 'simple',
        autoResize: true,
        className: 'large-textarea', // Common class in the codebase
        rows: 5,
        ...options
    };
    
    return new UniversalTextEditor(container, defaultOptions, handlers);
}

/**
 * Replace an existing textarea with a Universal Text Editor
 * Preserves all the textarea's current properties and event listeners
 */
export function replaceTextareaWithUniversalEditor(
    textarea: HTMLTextAreaElement,
    mode: 'simple' | 'enhanced' = 'simple'
): UniversalTextEditor {
    // Extract current textarea properties
    const options: UniversalTextEditorOptions = {
        mode,
        placeholder: textarea.placeholder,
        rows: textarea.rows || 5,
        className: textarea.className,
        autoResize: true,
        disabled: textarea.disabled,
        readonly: textarea.readOnly
    };
    
    // Get current value
    const currentValue = textarea.value;
    
    // Create container
    const container = document.createElement('div');
    
    // Insert container before textarea
    textarea.parentNode?.insertBefore(container, textarea);
    
    // Create Universal Text Editor
    const universalEditor = new UniversalTextEditor(container, options);
    
    // Set the current value
    universalEditor.setText(currentValue);
    
    // Remove original textarea
    textarea.remove();
    
    return universalEditor;
}

/**
 * Create a drop-in replacement function for document.createElement('textarea')
 */
export function createUniversalTextarea(
    container: HTMLElement,
    initialMode: 'simple' | 'enhanced' = 'simple'
): UniversalTextEditor {
    return new UniversalTextEditor(container, { 
        mode: initialMode,
        autoResize: true,
        className: 'large-textarea'
    });
}

/**
 * Helper to add a mode switcher button to a Universal Text Editor
 */
export function addModeSwitcher(
    editor: UniversalTextEditor,
    container: HTMLElement,
    position: 'top' | 'bottom' = 'top'
): HTMLButtonElement {
    const switchButton = document.createElement('button');
    switchButton.textContent = editor.isEnhanced() ? '📝 Switch to Simple' : '🤖 Switch to Enhanced';
    switchButton.className = 'button button-secondary button-sm';
    switchButton.style.marginBottom = position === 'top' ? '0.5rem' : '0';
    switchButton.style.marginTop = position === 'bottom' ? '0.5rem' : '0';
    
    switchButton.addEventListener('click', () => {
        const newMode = editor.isEnhanced() ? 'simple' : 'enhanced';
        editor.switchMode(newMode);
        switchButton.textContent = editor.isEnhanced() ? '📝 Switch to Simple' : '🤖 Switch to Enhanced';
    });
    
    // Add mode switch callback to update button text
    editor.updateHandlers({
        onModeSwitch: (mode) => {
            switchButton.textContent = mode === 'enhanced' ? '📝 Switch to Simple' : '🤖 Switch to Enhanced';
        }
    });
    
    if (position === 'top') {
        container.insertBefore(switchButton, container.firstChild);
    } else {
        container.appendChild(switchButton);
    }
    
    return switchButton;
}

/**
 * Migrate all textareas in a container to Universal Text Editors
 */
export function migrateTextareasInContainer(
    container: HTMLElement,
    defaultMode: 'simple' | 'enhanced' = 'simple',
    addSwitchers: boolean = false
): UniversalTextEditor[] {
    const textareas = Array.from(container.querySelectorAll('textarea'));
    const editors: UniversalTextEditor[] = [];
    
    textareas.forEach(textarea => {
        // Create wrapper for the editor and potentially the switcher
        const wrapper = document.createElement('div');
        wrapper.className = 'universal-editor-wrapper';
        
        // Insert wrapper before textarea
        textarea.parentNode?.insertBefore(wrapper, textarea);
        
        // Replace textarea with Universal Editor
        const editor = replaceTextareaWithUniversalEditor(textarea, defaultMode);
        
        // Move the editor container into the wrapper
        const editorContainer = editor.getHTMLElement().parentElement!;
        wrapper.appendChild(editorContainer);
        
        if (addSwitchers) {
            addModeSwitcher(editor, wrapper, 'top');
        }
        
        editors.push(editor);
    });
    
    return editors;
} 