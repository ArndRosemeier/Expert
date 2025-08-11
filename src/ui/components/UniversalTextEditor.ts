import { TextEditorWithHighlighting } from '../text-editor-with-highlighting';
import { DEFAULT_XML_STORY_CONFIG } from '../../xml-story-creation/types/XMLStoryTypes';
import { autoResizeTextarea } from '../modals/core/modal-utils';
import { TextTransformModal, TextTransformRequest } from './TextTransformModal';
import { OpenRouterClient } from '../../OpenRouterClient';
import { SettingsManager } from '../../SettingsManager';
import { createPromptExpansionService } from '../../services/PromptExpansionService';

/**
 * Global state manager for AI transformation undo functionality
 * 
 * This allows any UniversalTextEditor to undo the last AI transformation,
 * even if the editor instance has been recreated (due to rerenders, etc.)
 */
class AIUndoState {
    private static current: {
        original: string;
        changed: string;
    } | null = null;
    
    /**
     * Store an AI transformation for potential undo
     */
    static setTransformation(original: string, changed: string): void {
        this.current = { original, changed };
    }
    
    /**
     * Try to undo an AI transformation
     * @param currentText The current text in the editor
     * @returns The original text if this is an AI transformation that can be undone, null otherwise
     */
    static tryUndo(currentText: string): string | null {
        if (this.current && currentText === this.current.changed) {
            // Return the original text
            const originalText = this.current.original;
            
            // Swap original and changed for automatic redo functionality
            // This makes the next Ctrl+Z automatically redo the AI transformation
            const temp = this.current.original;
            this.current.original = this.current.changed;
            this.current.changed = temp;
            
            return originalText;
        }
        return null; // Fall back to normal undo
    }
    
    /**
     * Clear the AI undo state (for testing or explicit cleanup)
     */
    static clear(): void {
        this.current = null;
    }

    /**
     * Check if the given text should trigger auto-focus
     * Returns true if the text matches the result of a recent AI transformation
     */
    static shouldAutoFocus(currentText: string): boolean {
        return this.current !== null && currentText === this.current.changed;
    }
}

export type TextEditorMode = 'simple' | 'enhanced';

export interface UniversalTextEditorOptions {
    mode?: TextEditorMode;
    placeholder?: string;
    rows?: number;
    className?: string;
    autoResize?: boolean;
    disabled?: boolean;
    readonly?: boolean;
}

export interface TextEditorEventHandlers {
    onTextChange?: (text: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onModeSwitch?: (mode: TextEditorMode) => void;
}

// Standard DOM event types for textarea compatibility
type TextareaEventType = 'input' | 'change' | 'focus' | 'blur' | 'keydown' | 'keyup' | 'keypress' | 'select';
type EventListenerFunction = (event: Event) => void;

/**
 * Universal Text Editor - A swappable text editor component that can operate in simple or enhanced mode
 * 
 * This component provides:
 * - Drop-in replacement for HTMLTextAreaElement
 * - Mode switching between simple textarea and enhanced editor with AI features
 * - Compatible with existing utilities like autoResizeTextarea
 * - Same event interface as standard textareas
 * - Maintains styling compatibility with existing CSS classes
 */
export class UniversalTextEditor {
    private container: HTMLElement;
    private currentMode: TextEditorMode;
    private options: Required<UniversalTextEditorOptions>;
    private handlers: TextEditorEventHandlers;
    
    // Editor instances
    private simpleEditor!: HTMLTextAreaElement;
    private enhancedEditor!: TextEditorWithHighlighting;
    
    // State management
    private currentValue: string = '';
    
    // Selection overlay for enhanced mode
    private selectionOverlay: HTMLElement | null = null;
    private selectionChangeHandler!: () => void;
    private documentClickHandler!: (e: Event) => void;
    
    // AI processing spinner overlay
    private spinnerOverlay: HTMLElement | null = null;
    
    // Search and replace functionality
    private searchBar: HTMLElement | null = null;
    private searchInput: HTMLInputElement | null = null;
    private replaceInput: HTMLInputElement | null = null;
    private searchResults: { start: number; end: number; }[] = [];
    private currentSearchIndex: number = -1;
    private isSearchVisible: boolean = false;
    
    // DOM event compatibility
    private domEventListeners: Map<TextareaEventType, Set<EventListenerFunction>> = new Map();
    private mutationObserver: MutationObserver | null = null;
    
    constructor(
        container: HTMLElement, 
        options: UniversalTextEditorOptions = {},
        handlers: TextEditorEventHandlers = {}
    ) {
        this.container = container;
        this.options = {
            mode: 'simple',
            placeholder: '',
            rows: 3,
            className: '',
            autoResize: true,
            disabled: false,
            readonly: false,
            ...options
        };
        this.handlers = handlers;
        this.currentMode = this.options.mode;
        
        this.initialize();
        
        // Smart auto-focus after AI transformations
        // Wait 10ms for parent to complete DOM operations, then check if this editor
        // contains the result of a recent AI transformation and auto-focus if so
        setTimeout(() => {
            const currentText = this.getText();
            if (AIUndoState.shouldAutoFocus(currentText)) {
                this.focus();
            }
        }, 10);
        
        // Setup automatic lifecycle management
        this.setupAutomaticCleanup();
    }
    
    // ============================================================================
    // STATIC FACTORY METHODS (TEXTAREA COMPATIBILITY)
    // ============================================================================
    
    /**
     * Replace an existing textarea with a UniversalTextEditor
     * @param textarea The textarea element to replace
     * @param options Editor options
     * @returns New UniversalTextEditor instance
     */
    public static replace(
        textarea: HTMLTextAreaElement, 
        options: Partial<UniversalTextEditorOptions> = {}
    ): UniversalTextEditor {
        const container = textarea.parentElement;
        if (!container) {
            throw new Error('Textarea must have a parent element');
        }
        
        // Extract properties from existing textarea
        const extractedOptions: UniversalTextEditorOptions = {
            mode: 'simple',
            placeholder: textarea.placeholder || '',
            className: textarea.className || '',
            disabled: textarea.disabled,
            readonly: textarea.readOnly,
            autoResize: true,
            ...options
        };
        
        // Get initial value
        const initialValue = textarea.value;
        
        // Create wrapper container
        const wrapper = document.createElement('div');
        wrapper.className = 'universal-text-editor-wrapper';
        
        // Ensure wrapper has proper positioning for modal compatibility
        wrapper.style.position = 'relative';
        wrapper.style.zIndex = 'auto';
        
        // Replace textarea with wrapper
        container.replaceChild(wrapper, textarea);
        
        // Create editor
        const editor = new UniversalTextEditor(wrapper, extractedOptions);
        editor.setText(initialValue);
        
        return editor;
    }
    
    /**
     * Create a new UniversalTextEditor in a container with textarea-like API
     * @param container Container element
     * @param options Editor options and initial settings
     * @returns New UniversalTextEditor instance
     */
    public static create(
        container: HTMLElement,
        options: Partial<UniversalTextEditorOptions & { value?: string }> = {}
    ): UniversalTextEditor {
        const { value, ...editorOptions } = options;
        
        const defaultOptions: UniversalTextEditorOptions = {
            mode: 'simple',
            placeholder: '',
            className: '',
            rows: 3,
            autoResize: true,
            disabled: false,
            readonly: false,
            ...editorOptions
        };
        
        const editor = new UniversalTextEditor(container, defaultOptions);
        
        if (value !== undefined) {
            editor.setText(value);
        }
        
        return editor;
    }
    
    /**
     * Create enhanced mode editor with AI features enabled by default
     * @param container Container element  
     * @param options Editor options
     * @returns New UniversalTextEditor instance in enhanced mode
     */
    public static createEnhanced(
        container: HTMLElement,
        options: Partial<UniversalTextEditorOptions & { value?: string }> = {}
    ): UniversalTextEditor {
        return UniversalTextEditor.create(container, {
            mode: 'enhanced',
            ...options
        });
    }
    
    /**
     * Initialize the editor in the current mode
     */
    private initialize(): void {
        this.container.innerHTML = ''; // Clear container
        
        if (this.currentMode === 'simple') {
            this.initializeSimpleMode();
        } else {
            this.initializeEnhancedMode();
        }
    }
    
    /**
     * Initialize simple textarea mode
     */
    private initializeSimpleMode(): void {
        this.simpleEditor = document.createElement('textarea');
        
        // Apply configuration
        this.simpleEditor.placeholder = this.options.placeholder;
        this.simpleEditor.rows = this.options.rows;
        this.simpleEditor.disabled = this.options.disabled;
        this.simpleEditor.readOnly = this.options.readonly;
        this.simpleEditor.value = this.currentValue;
        
        // Apply CSS classes
        if (this.options.className) {
            this.simpleEditor.className = this.options.className;
        }
        
        // Set up event listeners
        this.setupSimpleEditorEvents();
        
        // Add to container
        this.container.appendChild(this.simpleEditor);
        
        // Auto-resize if enabled
        if (this.options.autoResize) {
            setTimeout(() => autoResizeTextarea(this.simpleEditor), 0);
        }
    }
    
    /**
     * Initialize enhanced editor mode
     */
    private initializeEnhancedMode(): void {
        const editorContainer = document.createElement('div');
        editorContainer.style.width = '100%';
        editorContainer.style.height = '100%';
        editorContainer.style.display = 'flex';
        editorContainer.style.flex = '1 1 auto';
        editorContainer.style.minHeight = '0';
        this.enhancedEditor = new TextEditorWithHighlighting(editorContainer);
        
        // Apply configuration
        this.enhancedEditor.setText(this.currentValue);
        
        // Add to container first
        this.container.appendChild(editorContainer);
        (this.container.style as any).display = 'flex';
        (this.container.style as any).flex = '1 1 auto';
        (this.container.style as any).minHeight = '0';
        
        // Apply styling to match textarea
        const editorDiv = editorContainer.querySelector('.text-editor-with-highlighting') as HTMLElement;
        if (this.options.className) {
            editorDiv.className += ' ' + this.options.className;
        }
        if (editorDiv) {
            editorDiv.style.width = '100%';
            editorDiv.style.height = '100%';
            editorDiv.style.flex = '1 1 auto';
            editorDiv.style.minHeight = '0';
            editorDiv.style.boxSizing = 'border-box';
        }
        
        // Set up event listeners AFTER DOM is assembled
        this.setupEnhancedEditorEvents();
        
        // Set up selection overlay
        this.setupSelectionOverlay();
    }
    
    /**
     * Set up event listeners for simple editor
     */
    private setupSimpleEditorEvents(): void {
        this.simpleEditor.addEventListener('input', () => {
            this.currentValue = this.simpleEditor.value;
            if (this.options.autoResize) {
                autoResizeTextarea(this.simpleEditor);
            }
            if (this.handlers.onTextChange) {
                this.handlers.onTextChange(this.currentValue);
            }
            // Refresh search if active to prevent stale position data
            this.refreshSearchIfActive();
        });
        
        this.simpleEditor.addEventListener('focus', () => {
            if (this.handlers.onFocus) {
                this.handlers.onFocus();
            }
        });
        
        this.simpleEditor.addEventListener('blur', () => {
            if (this.handlers.onBlur) {
                this.handlers.onBlur();
            }
        });
        
        // Add undo functionality (Ctrl+Z) and prevent browser find (Ctrl+F)
        this.simpleEditor.addEventListener('keydown', (event) => {
            // Explicitly allow common browser shortcuts to work normally
            if (event.ctrlKey || event.metaKey) {
                if (['c', 'v', 'x', 'a', 's', 'y'].includes(event.key.toLowerCase())) {
                    // Allow copy, paste, cut, select all, save, redo - let browser handle these
                    return;
                }
                
                if (event.key === 'z') {
                    event.preventDefault();
                    this.undoToInitialState();
                } else if (event.key === 'f') {
                    // Prevent browser's native find and open our custom search
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleSearch();
                }
            }
            
            // Handle F3 for find next, but only if our search is active
            if (event.key === 'F3') {
                if (this.isSearchVisible && this.searchInput && this.searchInput.value.trim()) {
                    event.preventDefault();
                    this.findNext();
                }
                // If search not active or no search term, let browser handle F3 normally
            }
        });
    }
    
    /**
     * Set up event listeners for enhanced editor
     */
    private setupEnhancedEditorEvents(): void {
        this.enhancedEditor.onTextChange((text: string) => {
            this.currentValue = text;
            if (this.handlers.onTextChange) {
                this.handlers.onTextChange(text);
            }
            // Refresh search if active to prevent stale position data
            this.refreshSearchIfActive();
        });
        
        this.enhancedEditor.onFocus(() => {
            if (this.handlers.onFocus) {
                this.handlers.onFocus();
            }
        });
        
        this.enhancedEditor.onBlur(() => {
            if (this.handlers.onBlur) {
                this.handlers.onBlur();
            }
        });
        
        // Add undo functionality (Ctrl+Z) and prevent browser find (Ctrl+F) in enhanced editor
        const editorDiv = this.container.querySelector('.text-editor-with-highlighting') as HTMLElement;
        if (editorDiv) {
            editorDiv.addEventListener('keydown', (event) => {
                // Explicitly allow common browser shortcuts to work normally
                if (event.ctrlKey || event.metaKey) {
                    if (['c', 'v', 'x', 'a', 's', 'y'].includes(event.key.toLowerCase())) {
                        // Allow copy, paste, cut, select all, save, redo - let browser handle these
                        return;
                    }
                    
                    if (event.key === 'z') {
                        event.preventDefault();
                        this.undoToInitialState();
                    } else if (event.key === 'f') {
                        // Prevent browser's native find and open our custom search
                        event.preventDefault();
                        event.stopPropagation();
                        this.toggleSearch();
                    }
                }
                
                // Handle F3 for find next, but only if our search is active
                if (event.key === 'F3') {
                    if (this.isSearchVisible && this.searchInput && this.searchInput.value.trim()) {
                        event.preventDefault();
                        this.findNext();
                    }
                    // If search not active or no search term, let browser handle F3 normally
                }
            });
        }
    }
    
    /**
     * Switch between simple and enhanced modes
     */
    public switchMode(mode: TextEditorMode): void {
        if (mode === this.currentMode) return;
        
        // Preserve current state
        const wasDisabled = this.options.disabled;
        const wasReadonly = this.options.readonly;
        
        // Clean up current mode
        this.cleanup();
        
        // Switch mode
        this.currentMode = mode;
        this.options.disabled = wasDisabled;
        this.options.readonly = wasReadonly;
        
        // Initialize new mode
        this.initialize();
        
        // Rebind DOM event listeners to new editor
        this.rebindDOMEventListeners();
        
        // Notify mode change
        if (this.handlers.onModeSwitch) {
            this.handlers.onModeSwitch(mode);
        }
    }
    
    /**
     * Clean up current editor
     */
    private cleanup(): void {
        if (this.currentMode === 'enhanced') {
            this.cleanupSelectionOverlay();
            this.hideSpinnerOverlay();
            this.enhancedEditor.destroy();
        }
        this.cleanupSearch();
    }

    /**
     * Set up selection overlay for enhanced mode
     */
    private setupSelectionOverlay(): void {
        // Create event handlers with proper binding
        this.selectionChangeHandler = () => {
            setTimeout(() => this.handleSelectionChange(), 0);
        };
        
        this.documentClickHandler = (e: Event) => {
            const target = e.target as Node;
            const editorDiv = this.container.querySelector('.text-editor-with-highlighting') as HTMLElement;
            // Hide overlay if clicking outside editor and overlay
            if (editorDiv && !editorDiv.contains(target) && !this.selectionOverlay?.contains(target)) {
                this.hideSelectionOverlay();
            }
        };

        // Add event listeners
        document.addEventListener('selectionchange', this.selectionChangeHandler);
        document.addEventListener('click', this.documentClickHandler);
    }

    /**
     * Clean up selection overlay
     */
    private cleanupSelectionOverlay(): void {
        // Remove event listeners
        if (this.selectionChangeHandler) {
            document.removeEventListener('selectionchange', this.selectionChangeHandler);
        }
        if (this.documentClickHandler) {
            document.removeEventListener('click', this.documentClickHandler);
        }
        
        // Remove overlay
        this.hideSelectionOverlay();
    }

    /**
     * Handle selection changes
     */
    private handleSelectionChange(): void {
        if (this.currentMode !== 'enhanced') return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            this.hideSelectionOverlay();
            return;
        }

        const range = selection.getRangeAt(0);
        const editorDiv = this.container.querySelector('.text-editor-with-highlighting') as HTMLElement;
        
        // Check if selection is within our editor
        if (!editorDiv || !editorDiv.contains(range.commonAncestorContainer)) {
            this.hideSelectionOverlay();
            return;
        }

        // Only show overlay for non-collapsed selections (actual text selection)
        if (range.collapsed) {
            this.hideSelectionOverlay();
            return;
        }

        // Get selection text to check if it's meaningful
        const selectedText = range.toString().trim();
        if (!selectedText) {
            this.hideSelectionOverlay();
            return;
        }

        this.showSelectionOverlay(range);
    }

    /**
     * Show selection overlay
     */
    private showSelectionOverlay(range: Range): void {
        // Remove existing overlay
        this.hideSelectionOverlay();

        // Create overlay container
        this.selectionOverlay = document.createElement('div');
        this.selectionOverlay.className = 'selection-overlay';
        
        // Create buttons
        const sentenceBtn = document.createElement('button');
        sentenceBtn.className = 'overlay-btn sentence-btn';
        sentenceBtn.innerHTML = '¶'; // Paragraph symbol for sentences
        sentenceBtn.title = 'change sentences with AI';
        
        const paragraphBtn = document.createElement('button');
        paragraphBtn.className = 'overlay-btn paragraph-btn';
        paragraphBtn.innerHTML = '§'; // Section symbol for paragraphs
        paragraphBtn.title = 'change paragraphs with AI';

        this.selectionOverlay.appendChild(sentenceBtn);
        this.selectionOverlay.appendChild(paragraphBtn);

        // Position overlay relative to modal - this automatically inherits correct z-index
        const rect = range.getBoundingClientRect();
        
        // Find the modal container to position relative to it
        const modalOverlay = this.container.closest('.modal-overlay') as HTMLElement;
        if (modalOverlay) {
            // Position relative to modal overlay
            const modalRect = modalOverlay.getBoundingClientRect();
            this.selectionOverlay.style.cssText = `
                position: absolute;
                left: ${rect.left - modalRect.left - 40}px;
                top: ${rect.top - modalRect.top}px;
                display: flex;
                flex-direction: column;
                gap: 2px;
                background: rgba(255, 255, 255, 0.95);
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                padding: 4px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(4px);
                pointer-events: auto;
                z-index: 1;
            `;
            // Append to modal overlay instead of document.body
            modalOverlay.appendChild(this.selectionOverlay);
        } else {
            // Fallback to fixed positioning if not in a modal
            this.selectionOverlay.style.cssText = `
                position: fixed;
                left: ${rect.left - 40}px;
                top: ${rect.top}px;
                z-index: 15001;
                display: flex;
                flex-direction: column;
                gap: 2px;
                background: rgba(255, 255, 255, 0.95);
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                padding: 4px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(4px);
                pointer-events: auto;
            `;
            // Add to document body as fallback
            document.body.appendChild(this.selectionOverlay);
        }

        // Add button styles
        const buttonStyle = `
            width: 24px;
            height: 24px;
            border: none;
            border-radius: 4px;
            background: #dbeafe;
            color: #1e40af;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;

        sentenceBtn.style.cssText = buttonStyle;
        paragraphBtn.style.cssText = buttonStyle;

        // Add hover effects
        [sentenceBtn, paragraphBtn].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#3b82f6';
                btn.style.color = 'white';
                btn.style.transform = 'scale(1.1)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = '#dbeafe';
                btn.style.color = '#1e40af';
                btn.style.transform = 'scale(1)';
            });
        });

        // Add click handlers
        sentenceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.highlightSelectionWithMode('sentences');
        });

        paragraphBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.highlightSelectionWithMode('paragraphs');
        });
    }

    /**
     * Hide selection overlay
     */
    private hideSelectionOverlay(): void {
        if (this.selectionOverlay) {
            // Remove from whatever parent it was added to (modal overlay or document.body)
            this.selectionOverlay.remove();
            this.selectionOverlay = null;
        }
    }

    /**
     * Show AI processing spinner overlay
     */
    private showSpinnerOverlay(regions: Array<{start: number, end: number}>): void {
        if (regions.length === 0 || !regions[0]) {
            return;
        }
        
        // Remove existing spinner
        this.hideSpinnerOverlay();

        // Create spinner overlay
        this.spinnerOverlay = document.createElement('div');
        this.spinnerOverlay.className = 'ai-spinner-overlay';
        
        // Create spinner element
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.innerHTML = '⏳'; // Using hourglass emoji as simple spinner
        spinner.title = 'AI processing...';
        
        this.spinnerOverlay.appendChild(spinner);

        // Calculate position based on first highlight region
        const editorDiv = this.container.querySelector('.text-editor-with-highlighting') as HTMLElement;
        if (!editorDiv) {
            return;
        }
        
        // Create a temporary range to get bounding rect of highlighted text
        const range = document.createRange();
        
        // Find the text node and position for the first region
        const walker = document.createTreeWalker(
            editorDiv,
            NodeFilter.SHOW_TEXT,
            null
        );
        
        let currentPos = 0;
        let targetNode: Text | null = null;
        let targetOffset = 0;
        
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            const nodeLength = node.textContent?.length || 0;
            
            if (currentPos + nodeLength >= regions[0].start) {
                targetNode = node;
                targetOffset = regions[0].start - currentPos;
                break;
            }
            currentPos += nodeLength;
        }
        
        if (targetNode && targetNode.textContent) {
            const textLength = targetNode.textContent.length;
            range.setStart(targetNode, Math.min(targetOffset, textLength));
            range.setEnd(targetNode, Math.min(targetOffset + 1, textLength));
            const rect = range.getBoundingClientRect();
            // Position spinner relative to modal or viewport
            const modalOverlay = this.container.closest('.modal-overlay') as HTMLElement;
            if (modalOverlay) {
                // Position relative to modal overlay with high z-index
                const modalRect = modalOverlay.getBoundingClientRect();
                this.spinnerOverlay.style.cssText = `
                    position: absolute;
                    left: ${rect.left - modalRect.left - 25}px;
                    top: ${rect.top - modalRect.top}px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 40px;
                    background: rgba(255, 255, 255, 0.95);
                    border: 1px solid #3b82f6;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
                    backdrop-filter: blur(4px);
                    pointer-events: auto;
                    z-index: 50000;
                    font-weight: normal;
                    color: #3b82f6;
                `;
                modalOverlay.appendChild(this.spinnerOverlay);
            } else {
                // Fallback to fixed positioning with high z-index
                this.spinnerOverlay.style.cssText = `
                    position: fixed;
                    left: ${rect.left - 25}px;
                    top: ${rect.top}px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 40px;
                    background: rgba(255, 255, 255, 0.95);
                    border: 1px solid #3b82f6;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
                    backdrop-filter: blur(4px);
                    pointer-events: auto;
                    z-index: 50000;
                    font-weight: normal;
                    color: #3b82f6;
                `;
                document.body.appendChild(this.spinnerOverlay);
            }

            // Add spinner animation and styling
            spinner.style.cssText = `
                font-size: 20px;
                animation: spin 1s linear infinite;
                font-weight: normal;
                color: #3b82f6;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
            `;
            
            // Add CSS animation if not already present
            if (!document.getElementById('spinner-animation')) {
                const style = document.createElement('style');
                style.id = 'spinner-animation';
                style.textContent = `
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }
        }
    }

    /**
     * Hide AI processing spinner overlay
     */
    private hideSpinnerOverlay(): void {
        if (this.spinnerOverlay) {
            this.spinnerOverlay.remove();
            this.spinnerOverlay = null;
        }
    }

    /**
     * Remove highlights if they still exist (transformation was cancelled)
     */
    private removeHighlightsIfNotTransformed(highlightIds: string[]): void {
        if (this.currentMode !== 'enhanced') return;
        
        // Remove each highlight if it still exists
        highlightIds.forEach(highlightId => {
            this.enhancedEditor.removeHighlight(highlightId);
        });
    }

    /**
     * Highlight selection with specific mode
     */
    private highlightSelectionWithMode(mode: 'sentences' | 'paragraphs'): void {
        const selection = this.getSelection();
        if (!selection || !selection.text.trim()) {
            this.hideSelectionOverlay();
            return;
        }

        const text = this.enhancedEditor.getText();
        const textLength = text.length;

        // Step 1: Create boolean array representing currently highlighted characters
        const currentHighlights = this.createCurrentHighlightArray(textLength);

        // Step 2: Get scope boundaries and create boolean array for new highlight
        const originalMode = this.enhancedEditor.getSelectionMode();
        this.enhancedEditor.setSelectionMode(mode);
        const expandedBounds = this.enhancedEditor.expandToWordBoundaries(selection.startPos, selection.endPos);
        this.enhancedEditor.setSelectionMode(originalMode);

        const newHighlights = this.createScopeHighlightArray(textLength, expandedBounds.startPos, expandedBounds.endPos);

        // Step 3: OR operation between arrays
        const mergedHighlights = this.mergeHighlightArrays(currentHighlights, newHighlights);

        // Step 4: Clear existing highlights and apply merged regions
        this.enhancedEditor.clearAllHighlights();
        const regions = this.discoverHighlightRegions(mergedHighlights);
        
        // Add unified highlights with single class
        const highlightIds: string[] = [];
        regions.forEach((region, index) => {
            const highlightId = `unified-highlight-${Date.now()}-${index}`;
            this.enhancedEditor.addHighlight(highlightId, region.start, region.end, 'highlight-unified');
            highlightIds.push(highlightId);
        });

        // Hide overlay
        this.hideSelectionOverlay();

        // Clear browser selection to show highlight better
        window.getSelection()?.removeAllRanges();

        // Open transform modal after highlighting is complete
        this.openTransformModalForHighlights(regions, highlightIds);
    }

    /**
     * Create boolean array representing currently highlighted characters
     */
    private createCurrentHighlightArray(textLength: number): boolean[] {
        const highlights = new Array(textLength).fill(false);
        
        // Get current highlights from the enhanced editor
        const currentHighlights = (this.enhancedEditor as any).highlights as Map<string, {startPos: number, endPos: number, className: string}>;
        
        for (const [, highlight] of currentHighlights) {
            for (let i = highlight.startPos; i < highlight.endPos; i++) {
                if (i >= 0 && i < textLength) {
                    highlights[i] = true;
                }
            }
        }
        
        return highlights;
    }

    /**
     * Create boolean array for scope-based selection
     */
    private createScopeHighlightArray(textLength: number, startPos: number, endPos: number): boolean[] {
        const highlights = new Array(textLength).fill(false);
        
        for (let i = startPos; i < endPos; i++) {
            if (i >= 0 && i < textLength) {
                highlights[i] = true;
            }
        }
        
        return highlights;
    }

    /**
     * Merge two highlight arrays with OR operation
     */
    private mergeHighlightArrays(array1: boolean[], array2: boolean[]): boolean[] {
        const merged = new Array(Math.max(array1.length, array2.length)).fill(false);
        
        for (let i = 0; i < merged.length; i++) {
            merged[i] = (array1[i] || false) || (array2[i] || false);
        }
        
        return merged;
    }

    /**
     * Discover contiguous highlight regions from boolean array
     */
    private discoverHighlightRegions(highlights: boolean[]): Array<{start: number, end: number}> {
        const regions: Array<{start: number, end: number}> = [];
        let currentStart = -1;
        
        for (let i = 0; i < highlights.length; i++) {
            if (highlights[i] && currentStart === -1) {
                // Start of new region
                currentStart = i;
            } else if (!highlights[i] && currentStart !== -1) {
                // End of current region
                regions.push({start: currentStart, end: i});
                currentStart = -1;
            }
        }
        
        // Handle case where highlight extends to end of text
        if (currentStart !== -1) {
            regions.push({start: currentStart, end: highlights.length});
        }
        
        return regions;
    }

    /**
     * Open transform modal for highlighted regions
     */
    private openTransformModalForHighlights(regions: Array<{start: number, end: number}>, highlightIds: string[]): void {
        if (regions.length === 0) return;

        const fullText = this.enhancedEditor.getText();
        
        // Get the highlighted text (combine all regions)
        const highlightedText = regions
            .map(region => fullText.substring(region.start, region.end))
            .join('\n\n'); // Join multiple regions with double newlines

        // Track whether transformation was requested (not completed)
        let transformationRequested = false;

        // Open transform modal with highlighted text and full context
        const modal = new TextTransformModal({
            id: 'universal-text-editor-transform',
            defaultText: highlightedText,
            defaultContext: fullText,
            onTransformRequested: async (request: TextTransformRequest) => {
                transformationRequested = true; // Mark as requested immediately
                try {
                    // Show spinner overlay while AI is processing
                    this.showSpinnerOverlay(regions);
                    
                    const transformedText = await this.performAITransformation(request);
                    this.handleTransformResult(transformedText, regions, highlightIds, fullText);
                } catch (error) {
                    // Hide spinner on error
                    this.hideSpinnerOverlay();
                    console.error('Failed to transform text:', error);
                    alert('Failed to transform text. Please try again.');
                }
            }
        }, {
            onClose: () => {
                // Only remove highlights and hide spinner if transformation was NOT requested (user canceled)
                if (!transformationRequested) {
                    this.hideSpinnerOverlay();
                    this.removeHighlightsIfNotTransformed(highlightIds);
                }
                // If transformation was requested, keep spinner visible until completion
                // The spinner will be hidden in handleTransformResult() or error handler
            }
        });
        
        modal.open();
    }

    /**
     * Perform real AI text transformation using the same approach as idea board
     * - Uses transform_system prompt from PromptManager
     * - Hardcoded to generate exactly 1 transformation
     * - Same PromptExpansionService and OpenRouterClient as other parts of the app
     */
    private async performAITransformation(request: TextTransformRequest): Promise<string> {
        // Get services
        const settingsManager = await SettingsManager.getInstance();
        const prompts = settingsManager.getPrompts();
        const expansionService = createPromptExpansionService(settingsManager);
        
        // Create context that matches the expected structure for transform_system prompt
        const promptContext = {
            node: {
                content: request.textToChange.trim(),
                title: 'Text to Transform',
                isLeaf: true
            },
            project: {
                language: settingsManager.getLanguage(),
                criteria: [] // Not needed for transformation
            },
            custom: {
                transform_count: '1', // Always generate exactly 1 transformation
                user_instruction: request.transformInstruction,
                transform_context: request.context && request.context.trim() ? 
                    `The text to change appears in a broader context, here it is: ${request.context.trim()}` : 
                    ''
            }
        };
        
        // Expand the transform_system prompt with placeholders
        const prompt = expansionService.expandPrompt(prompts.transform_system, promptContext);

        // Use OpenRouterClient to get content
        const client = OpenRouterClient.getInstance();
        client.setSettingsManager(settingsManager);
        
        // Use the specified model purpose or default to 'editor'
        const modelPurpose = request.modelPurpose || 'editor';
        const generatedContent = await client.chat(modelPurpose, prompt);

        // Parse the transformation from the response
        const transformedText = this.parseTransformationResult(generatedContent);
        
        if (!transformedText) {
            throw new Error('No transformation was generated by the AI');
        }
        
        return transformedText;
    }

    /**
     * Parse transformation result from AI response using the same markers as idea board
     */
    private parseTransformationResult(response: string): string | null {
        const startMarker = '=== TRANSFORMATION START ===';
        const endMarker = '=== TRANSFORMATION END ===';
        
        const startIndex = response.indexOf(startMarker);
        if (startIndex === -1) {
            console.warn('No transformation start marker found in AI response');
            return null;
        }
        
        const contentStart = startIndex + startMarker.length;
        const endIndex = response.indexOf(endMarker, contentStart);
        if (endIndex === -1) {
            console.warn('No transformation end marker found in AI response');
            return null;
        }
        
        const transformedText = response.substring(contentStart, endIndex).trim();
        return transformedText || null;
    }

    /**
     * Handle the result from text transformation
     */
    private handleTransformResult(
        transformedText: string, 
        originalRegions: Array<{start: number, end: number}>, 
        originalHighlightIds: string[],
        originalFullText: string
    ): void {
        // Hide spinner overlay first (while highlights are still visible)
        this.hideSpinnerOverlay();

        // Remove original highlights
        originalHighlightIds.forEach(id => {
            this.enhancedEditor.removeHighlight(id);
        });

        // Replace text in all regions (start from the end to maintain positions)
        const sortedRegions = [...originalRegions].sort((a, b) => b.start - a.start);
        let newText = originalFullText;
        let totalOffset = 0; // Track cumulative change in text length

        // Split transformed text back into parts if there were multiple regions
        const transformedParts = originalRegions.length > 1 
            ? transformedText.split('\n\n')
            : [transformedText];

        // Replace each region with its corresponding transformed part
        sortedRegions.forEach((region, index) => {
            const partIndex = originalRegions.length - 1 - index; // Reverse index for sorted regions
            const transformedPart = transformedParts[partIndex] || transformedText;
            
            const before = newText.substring(0, region.start);
            const after = newText.substring(region.end);
            newText = before + transformedPart + after;
            
            // Calculate the change in length for this replacement
            const lengthChange = transformedPart.length - (region.end - region.start);
            totalOffset += lengthChange;
        });

        // Update the editor with new text
        this.enhancedEditor.setText(newText);
        this.currentValue = newText;

        // Store AI transformation for global undo (survives editor recreation)
        AIUndoState.setTransformation(originalFullText, newText);

        // Calculate new positions for temporary highlighting
        const newRegions: Array<{start: number, end: number}> = [];
        let cumulativeOffset = 0;

        originalRegions.forEach((region, index) => {
            const transformedPart = transformedParts[index] || transformedText;
            const newStart = region.start + cumulativeOffset;
            const newEnd = newStart + transformedPart.length;
            
            newRegions.push({start: newStart, end: newEnd});
            
            // Update cumulative offset for next region
            const lengthChange = transformedPart.length - (region.end - region.start);
            cumulativeOffset += lengthChange;
        });

        // Add temporary highlights for AI replacement
        const tempHighlightIds: string[] = [];
        newRegions.forEach((region, index) => {
            const tempId = `temp-transform-highlight-${Date.now()}-${index}`;
            this.enhancedEditor.addHighlight(tempId, region.start, region.end, 'highlight-ai-replacement');
            tempHighlightIds.push(tempId);
        });

        // Remove temporary highlights after configured duration (20 seconds)
        setTimeout(() => {
            tempHighlightIds.forEach(id => {
                this.enhancedEditor.removeHighlight(id);
            });
        }, DEFAULT_XML_STORY_CONFIG.highlightDuration);
        
        // Trigger text change handler if available
                    if (this.handlers.onTextChange) {
                this.handlers.onTextChange(newText);
            }
            // Refresh search if active to prevent stale position data
            this.refreshSearchIfActive();
    }
    
    // ============================================================================
    // PUBLIC API - HTMLTextAreaElement compatible interface
    // ============================================================================
    
    /**
     * Get/Set text value
     */
    public get value(): string {
        return this.currentValue;
    }
    
    public set value(text: string) {
        this.setText(text);
    }
    
    /**
     * Get the current editor element for focus checking
     */
    public getElement(): HTMLElement {
        return this.currentMode === 'enhanced' ? this.enhancedEditor.getElement() : this.simpleEditor;
    }
    
    /**
     * Set text content
     */
    public setText(text: string): void {
        this.currentValue = text;
        
        if (this.currentMode === 'simple') {
            this.simpleEditor.value = text;
            if (this.options.autoResize) {
                autoResizeTextarea(this.simpleEditor);
            }
        } else {
            this.enhancedEditor.setText(text);
        }
    }
    
    /**
     * Set text content and update initial value (for when loading completely new content)
     * 
     * Use this when:
     * - Loading a new document/node content
     * - Switching to a different text entirely

    
    /**
     * AI Undo functionality (Ctrl+Z)
     * 
     * Attempts to undo the last AI transformation using global state.
     * If current text matches a recent AI transformation, toggles between original and transformed text.
     * This survives editor recreation/rerenders because AI state is global.
     */
    private undoToInitialState(): void {
        // Try AI undo (global state, survives rerenders)
        const aiUndo = AIUndoState.tryUndo(this.currentValue);
        if (aiUndo) {
            this.setText(aiUndo);
            if (this.handlers.onTextChange) {
                this.handlers.onTextChange(aiUndo);
            }
        }
        // If no AI transformation to undo, do nothing (safe behavior)
    }
    
    /**
     * Get text content
     */
    public getText(): string {
        return this.currentValue;
    }
    
    /**
     * Focus the editor
     */
    public focus(): void {
        if (this.currentMode === 'simple') {
            this.simpleEditor.focus();
        } else {
            this.enhancedEditor.focus();
        }
    }
    
    /**
     * Blur the editor
     */
    public blur(): void {
        if (this.currentMode === 'simple') {
            this.simpleEditor.blur();
        } else {
            // Enhanced editor doesn't have blur method, get active element and blur it
            (document.activeElement as HTMLElement).blur();
        }
    }
    
    /**
     * Get/Set placeholder
     */
    public get placeholder(): string {
        return this.options.placeholder;
    }
    
    public set placeholder(value: string) {
        this.options.placeholder = value;
        if (this.currentMode === 'simple') {
            this.simpleEditor.placeholder = value;
        }
        // Enhanced editor doesn't support placeholder
    }
    
    /**
     * Get/Set disabled state
     */
    public get disabled(): boolean {
        return this.options.disabled;
    }
    
    public set disabled(value: boolean) {
        this.options.disabled = value;
        if (this.currentMode === 'simple') {
            this.simpleEditor.disabled = value;
        }
        // Enhanced editor doesn't have disabled property
    }
    
    /**
     * Get/Set readonly state
     */
    public get readonly(): boolean {
        return this.options.readonly;
    }
    
    public set readonly(value: boolean) {
        this.options.readonly = value;
        if (this.currentMode === 'simple') {
            this.simpleEditor.readOnly = value;
        }
        // Enhanced editor doesn't have readonly property
    }
    
    /**
     * Get selection information
     */
    public getSelection(): {startPos: number, endPos: number, text: string} {
        if (this.currentMode === 'simple') {
            const start = this.simpleEditor.selectionStart;
            const end = this.simpleEditor.selectionEnd;
            const text = this.simpleEditor.value.substring(start, end);
            return { startPos: start, endPos: end, text };
        } else {
            return this.enhancedEditor.getSelection()!;
        }
    }
    
    /**
     * Set selection
     */
    public setSelection(start: number, end: number): void {
        if (this.currentMode === 'simple') {
            this.simpleEditor.setSelectionRange(start, end);
        } else {
            this.enhancedEditor.setSelection(start, end);
        }
    }
    
    // ============================================================================
    // ENHANCED MODE SPECIFIC FEATURES
    // ============================================================================
    
    /**
     * Check if currently in enhanced mode
     */
    public isEnhanced(): boolean {
        return this.currentMode === 'enhanced';
    }
    
    /**
     * Get current mode
     */
    public getMode(): TextEditorMode {
        return this.currentMode;
    }
    
    /**
     * Add highlight (enhanced mode only)
     */
        public addHighlight(id: string, startPos: number, endPos: number, className?: string): void {
        if (this.currentMode !== 'enhanced') {
            throw new Error('Highlights are only available in enhanced mode');
        }
        this.enhancedEditor.addHighlight(id, startPos, endPos, className);
    }
    
    /**
     * Remove highlight (enhanced mode only)
     */
    public removeHighlight(id: string): void {
        if (this.currentMode !== 'enhanced') {
            throw new Error('Highlights are only available in enhanced mode');
        }
            this.enhancedEditor.removeHighlight(id);
    }
    
    /**
     * Clear all highlights (enhanced mode only)
     */
    public clearHighlights(): void {
        if (this.currentMode !== 'enhanced') {
            throw new Error('Highlights are only available in enhanced mode');
        }
            this.enhancedEditor.clearAllHighlights();
    }
    
    /**
     * Set selection mode for enhanced editor
     */
    public setSelectionMode(mode: 'words' | 'sentences' | 'paragraphs'): void {
        if (this.currentMode !== 'enhanced') {
            throw new Error('Selection mode is only available in enhanced mode');
        }
            this.enhancedEditor.setSelectionMode(mode);
    }
    
    /**
     * Replace text with highlight (enhanced mode only)
     */
    public replaceTextWithHighlight(startPos: number, endPos: number, newText: string, highlightId?: string): void {
        if (this.currentMode !== 'enhanced') {
            throw new Error('Text replacement with highlights is only available in enhanced mode');
        }
            this.enhancedEditor.replaceTextWithHighlight(startPos, endPos, newText, highlightId);
            this.currentValue = this.enhancedEditor.getText();
    }

    /**
     * Expand selection to smart boundaries based on current selection mode (enhanced mode only)
     */
    public expandToSmartBoundaries(startPos: number, endPos: number): {startPos: number, endPos: number} {
        if (this.currentMode !== 'enhanced') {
            throw new Error('Smart boundary expansion is only available in enhanced mode');
        }
        return this.enhancedEditor.expandToWordBoundaries(startPos, endPos);
    }
    
    // ============================================================================
    // UTILITY METHODS
    // ============================================================================
    
    /**
     * Get the underlying HTML element (for compatibility with existing code)
     */
    public getHTMLElement(): HTMLElement {
        if (this.currentMode === 'simple') {
            return this.simpleEditor;
        } else {
            return this.container.querySelector('.text-editor-with-highlighting') as HTMLElement;
        }
    }
    
    /**
     * Get the textarea element (for autoResizeTextarea compatibility)
     */
    public getTextArea(): HTMLTextAreaElement {
        if (this.currentMode !== 'simple') {
            throw new Error('Textarea element is only available in simple mode');
        }
        return this.simpleEditor;
    }
    
    /**
     * Update event handlers
     */
    public updateHandlers(handlers: TextEditorEventHandlers): void {
        this.handlers = { ...this.handlers, ...handlers };
        
        // Re-setup events
        if (this.currentMode === 'simple') {
            this.setupSimpleEditorEvents();
        } else {
            this.setupEnhancedEditorEvents();
        }
    }
    
    /**
     * Update options
     */
    public updateOptions(options: Partial<UniversalTextEditorOptions>): void {
        const oldMode = this.currentMode;
        this.options = { ...this.options, ...options };
        
        if (options.mode && options.mode !== oldMode) {
            this.switchMode(options.mode);
        } else {
            // Update current editor with new options
            this.applyOptionsToCurrentEditor();
        }
    }
    
    /**
     * Apply current options to active editor
     */
    private applyOptionsToCurrentEditor(): void {
        if (this.currentMode === 'simple') {
            this.simpleEditor.placeholder = this.options.placeholder;
            this.simpleEditor.disabled = this.options.disabled;
            this.simpleEditor.readOnly = this.options.readonly;
            if (this.options.className) {
                this.simpleEditor.className = this.options.className;
            }
        }
        // Enhanced editor options would be applied here if supported
    }
    
    /**
     * Destroy the editor and clean up
     */
    public destroy(): void {
        this.cleanup();
        
        // Clean up DOM event listeners
        this.domEventListeners.clear();
        
        // Clean up mutation observer
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        
        this.container.innerHTML = '';
    }
    
    // ============================================================================
    // DOM EVENT COMPATIBILITY (TEXTAREA API)
    // ============================================================================
    
    /**
     * Add event listener (standard DOM API)
     * @param type Event type
     * @param listener Event listener function
     * @param options Event options (ignored for simplicity)
     */
    public addEventListener(
        type: TextareaEventType, 
        listener: EventListenerFunction, 
        _options?: boolean | AddEventListenerOptions
    ): void {
        if (!this.domEventListeners.has(type)) {
            this.domEventListeners.set(type, new Set());
        }
        this.domEventListeners.get(type)!.add(listener);
        
        // Forward to actual textarea/editor element
        this.addEventListenerToActiveEditor(type, listener);
    }
    
    /**
     * Remove event listener (standard DOM API)
     * @param type Event type
     * @param listener Event listener function
     * @param options Event options (ignored for simplicity)
     */
    public removeEventListener(
        type: TextareaEventType, 
        listener: EventListenerFunction, 
        _options?: boolean | EventListenerOptions
    ): void {
        const listeners = this.domEventListeners.get(type);
        if (listeners) {
            listeners.delete(listener);
            if (listeners.size === 0) {
                this.domEventListeners.delete(type);
            }
        }
        
        // Remove from actual textarea/editor element
        this.removeEventListenerFromActiveEditor(type, listener);
    }
    
    /**
     * Dispatch event (standard DOM API)
     * @param event Event to dispatch
     */
    public dispatchEvent(event: Event): boolean {
        const activeElement = this.getActiveEditorElement();
        return activeElement.dispatchEvent(event);
    }
    
    // ============================================================================
    // PRIVATE DOM EVENT HELPERS
    // ============================================================================
    
    private addEventListenerToActiveEditor(type: TextareaEventType, listener: EventListenerFunction): void {
        const activeElement = this.getActiveEditorElement();
        activeElement.addEventListener(type, listener);
    }
    
    private removeEventListenerFromActiveEditor(type: TextareaEventType, listener: EventListenerFunction): void {
        const activeElement = this.getActiveEditorElement();
        activeElement.removeEventListener(type, listener);
    }
    
    private getActiveEditorElement(): HTMLElement {
        if (this.currentMode === 'simple') {
            return this.simpleEditor;
        } else {
            // For enhanced mode, use the container's editable div
            const editableDiv = this.container.querySelector('.text-editor-with-highlighting') as HTMLElement;
            return editableDiv || this.container;
        }
    }
    
    /**
     * Re-bind DOM event listeners when switching modes
     */
    private rebindDOMEventListeners(): void {
        // Re-bind all DOM event listeners to the new active editor
        for (const [type, listeners] of this.domEventListeners) {
            for (const listener of listeners) {
                this.addEventListenerToActiveEditor(type, listener);
            }
        }
    }
    
    /**
     * Setup automatic cleanup when editor is removed from DOM
     */
    private setupAutomaticCleanup(): void {
        // Use MutationObserver to detect when container is removed from DOM
        this.mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (let i = 0; i < mutation.removedNodes.length; i++) {
                        const removedNode = mutation.removedNodes[i];
                        if (removedNode && 
                            removedNode.nodeType === Node.ELEMENT_NODE && 
                            (removedNode as Element).contains && 
                            (removedNode as Element).contains(this.container)) {
                            // Container was removed from DOM, clean up
                            this.destroy();
                            return;
                        }
                    }
                }
            }
        });
        
        // Observe changes to document body
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    // ============================================================================
    // ENHANCED TEXTAREA API COMPATIBILITY
    // ============================================================================
    
    /**
     * Get/set selectionStart (textarea API)
     */
    public get selectionStart(): number {
        const selection = this.getSelection();
        return selection.startPos;
    }
    
    public set selectionStart(value: number) {
        const selection = this.getSelection();
        this.setSelection(value, selection.endPos);
    }
    
    /**
     * Get/set selectionEnd (textarea API)
     */
    public get selectionEnd(): number {
        const selection = this.getSelection();
        return selection.endPos;
    }
    
    public set selectionEnd(value: number) {
        const selection = this.getSelection();
        this.setSelection(selection.startPos, value);
    }
    
    /**
     * Get/set selectionDirection (textarea API)
     */
    public get selectionDirection(): string {
        return 'none'; // Simplified implementation
    }
    
    public set selectionDirection(_value: string) {
        // Ignore for now - enhanced mode doesn't support direction
    }
    
    /**
     * Select text range (textarea API)
     */
    public select(): void {
        this.setSelection(0, this.currentValue.length);
        this.focus();
    }
    
    /**
     * Set range text (textarea API)
     */
    public setRangeText(
        replacement: string,
        start?: number,
        end?: number,
        selectionMode?: 'select' | 'start' | 'end' | 'preserve'
    ): void {
        const currentText = this.currentValue;
        
        if (start === undefined || end === undefined) {
            const selection = this.getSelection();
            start = start ?? selection.startPos;
            end = end ?? selection.endPos;
        }
        
        const before = currentText.substring(0, start);
        const after = currentText.substring(end);
        const newText = before + replacement + after;
        
        this.setText(newText);
        
        // Handle selection mode
        switch (selectionMode) {
            case 'select':
                this.setSelection(start, start + replacement.length);
                break;
            case 'start':
                this.setSelection(start, start);
                break;
            case 'end':
                this.setSelection(start + replacement.length, start + replacement.length);
                break;
            case 'preserve':
            default:
                // Keep current selection
                break;
        }
        
        // Fire change event
        this.fireEvent('input');
        this.fireEvent('change');
    }
    
    /**
     * Fire a DOM event (helper method)
     */
    private fireEvent(type: string): void {
        const event = new Event(type, { bubbles: true, cancelable: true });
        this.dispatchEvent(event);
    }
    
    // ============ SEARCH AND REPLACE FUNCTIONALITY ============
    
    /**
     * Toggle the search interface visibility
     */
    private toggleSearch(): void {
        if (this.isSearchVisible) {
            this.hideSearch();
        } else {
            this.showSearch();
        }
    }
    
    /**
     * Show the search interface
     */
    private showSearch(): void {
        if (!this.searchBar) {
            this.createSearchBar();
        }
        
        if (this.searchBar) {
            this.searchBar.style.display = 'flex';
            this.isSearchVisible = true;
            
            // Focus the search input
            setTimeout(() => {
                if (this.searchInput) {
                    this.searchInput.focus();
                    this.searchInput.select();
                }
            }, 10);
        }
    }
    
    /**
     * Hide the search interface
     */
    private hideSearch(): void {
        if (this.searchBar) {
            this.searchBar.style.display = 'none';
            this.isSearchVisible = false;
            this.clearSearchHighlights();
        }
        
        // Return focus to the editor
        this.focus();
    }
    
    /**
     * Create the search bar UI
     */
    private createSearchBar(): void {
        this.searchBar = document.createElement('div');
        this.searchBar.className = 'universal-text-editor-search-bar';
        this.searchBar.style.cssText = `
            display: none;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: #2a2a2a;
            border: 1px solid #555;
            border-radius: 4px;
            font-size: 12px;
            color: #fff;
            position: relative;
            z-index: 1000;
            margin-bottom: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        `;
        
        // Search input
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search...';
        this.searchInput.style.cssText = `
            flex: 1;
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background: #1a1a1a;
            color: #fff;
            font-size: 12px;
            min-width: 120px;
        `;
        
        // Replace input (always visible)
        this.replaceInput = document.createElement('input');
        this.replaceInput.type = 'text';
        this.replaceInput.placeholder = 'Replace...';
        this.replaceInput.style.cssText = `
            flex: 1;
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background: #1a1a1a;
            color: #fff;
            font-size: 12px;
            min-width: 120px;
        `;
        
        // Results count
        const resultsCount = document.createElement('span');
        resultsCount.className = 'search-results-count';
        resultsCount.style.cssText = `
            font-size: 11px;
            color: #aaa;
            white-space: nowrap;
        `;
        
        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '↑';
        prevBtn.title = 'Previous match (Shift+Enter)';
        prevBtn.style.cssText = `
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background: #333;
            color: #fff;
            cursor: pointer;
            font-size: 12px;
        `;
        
        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = '↓';
        nextBtn.title = 'Next match (Enter)';
        nextBtn.style.cssText = `
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background: #333;
            color: #fff;
            cursor: pointer;
            font-size: 12px;
        `;
        
        // Find button
        const findBtn = document.createElement('button');
        findBtn.innerHTML = 'Find';
        findBtn.title = 'Find matches';
        findBtn.style.cssText = `
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background: #2a4a5c;
            color: #fff;
            cursor: pointer;
            font-size: 11px;
        `;
        
        // Replace button
        const replaceBtn = document.createElement('button');
        replaceBtn.innerHTML = 'Replace';
        replaceBtn.title = 'Replace current match';
        replaceBtn.style.cssText = `
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background: #4a5c2a;
            color: #fff;
            cursor: pointer;
            font-size: 11px;
        `;
        
        // Replace All button
        const replaceAllBtn = document.createElement('button');
        replaceAllBtn.innerHTML = 'All';
        replaceAllBtn.title = 'Replace all matches';
        replaceAllBtn.style.cssText = `
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background: #5c4a2a;
            color: #fff;
            cursor: pointer;
            font-size: 11px;
        `;
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Close search (Escape)';
        closeBtn.style.cssText = `
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background: #5c2a2a;
            color: #fff;
            cursor: pointer;
            font-size: 12px;
            margin-left: 4px;
        `;
        
        // Assemble the search bar with new layout
        this.searchBar.appendChild(findBtn);
        this.searchBar.appendChild(this.searchInput);
        this.searchBar.appendChild(prevBtn);
        this.searchBar.appendChild(nextBtn);
        this.searchBar.appendChild(replaceBtn);
        this.searchBar.appendChild(replaceAllBtn);
        this.searchBar.appendChild(this.replaceInput);
        this.searchBar.appendChild(resultsCount);
        this.searchBar.appendChild(closeBtn);
        
        // Insert search bar at the top of the container
        this.container.insertBefore(this.searchBar, this.container.firstChild);
        
        // Add event listeners
        this.setupSearchEventListeners(resultsCount, prevBtn, nextBtn, findBtn, replaceBtn, replaceAllBtn, closeBtn);
    }
    
    /**
     * Set up event listeners for search bar elements
     */
    private setupSearchEventListeners(
        resultsCount: HTMLElement,
        prevBtn: HTMLElement,
        nextBtn: HTMLElement,
        findBtn: HTMLElement,
        replaceBtn: HTMLElement,
        replaceAllBtn: HTMLElement,
        closeBtn: HTMLElement
    ): void {
        if (!this.searchInput || !this.replaceInput) return;
        
        // Search input events - only Enter key to trigger search manually
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.performSearch();
                this.updateResultsCount(resultsCount);
                if (e.shiftKey) {
                    this.findPrevious();
                } else {
                    this.findNext();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.hideSearch();
            }
        });
        
        // Replace input events - only Escape key for consistency
        this.replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.hideSearch();
            }
        });
        
        // Button events
        prevBtn.addEventListener('click', () => this.findPrevious());
        nextBtn.addEventListener('click', () => this.findNext());
        
        findBtn.addEventListener('click', () => {
            this.performSearch();
            this.updateResultsCount(resultsCount);
            this.findNext();
        });
        
        replaceBtn.addEventListener('click', () => this.replaceCurrentMatch());
        replaceAllBtn.addEventListener('click', () => this.replaceAllMatches());
        closeBtn.addEventListener('click', () => this.hideSearch());
    }
    
    /**
     * Perform search and highlight results
     */
    private performSearch(): void {
        this.clearSearchHighlights();
        this.searchResults = [];
        this.currentSearchIndex = -1;
        
        if (!this.searchInput || !this.searchInput.value.trim()) {
            return;
        }
        
        // For enhanced mode, ensure we're working with clean text (no existing highlights)
        if (this.currentMode === 'enhanced' && this.enhancedEditor) {
            // Clear all existing highlights to ensure clean text for accurate position calculation
            this.enhancedEditor.clearAllHighlights();
            // Update current value to reflect the clean text
            this.currentValue = this.enhancedEditor.getText();
        }
        
        const searchTerm = this.searchInput.value;
        const text = this.currentValue;
        
        // Find all matches
        let index = 0;
        while (index < text.length) {
            const foundIndex = text.toLowerCase().indexOf(searchTerm.toLowerCase(), index);
            if (foundIndex === -1) break;
            
            this.searchResults.push({
                start: foundIndex,
                end: foundIndex + searchTerm.length
            });
            
            index = foundIndex + 1;
        }
        
        // Highlight all matches
        this.highlightSearchResults();
        
        // Set first match as current without focusing editor
        if (this.searchResults.length > 0) {
            this.currentSearchIndex = 0;
        }
    }
    
    /**
     * Highlight search results in the editor
     */
    private highlightSearchResults(): void {
        if (this.currentMode === 'enhanced' && this.enhancedEditor) {
            // Preserve search input focus during DOM manipulation
            const wasSearchInputFocused = document.activeElement === this.searchInput;
            const wasReplaceInputFocused = document.activeElement === this.replaceInput;
            
            // Clear existing search highlights first
            this.enhancedEditor.clearAllHighlights();
            
            // For enhanced editor, use the addHighlight method
            this.searchResults.forEach((result, index) => {
                const className = index === this.currentSearchIndex ? 'search-highlight-current' : 'search-highlight';
                this.enhancedEditor.addHighlight(
                    `search-${index}`, 
                    result.start, 
                    result.end, 
                    className
                );
            });
            
            // Restore focus to search inputs if they had it before DOM manipulation
            if (wasSearchInputFocused && this.searchInput) {
                this.searchInput.focus();
            } else if (wasReplaceInputFocused && this.replaceInput) {
                this.replaceInput.focus();
            }
            
            // Scroll current match into view (enhanced mode) - only when explicitly navigating
            if (this.currentSearchIndex >= 0 && !wasSearchInputFocused && !wasReplaceInputFocused) {
                setTimeout(() => {
                    const currentHighlight = this.container.querySelector('[data-highlight-id="search-' + this.currentSearchIndex + '"]');
                    if (currentHighlight) {
                        currentHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 10);
            }
        }
        // For simple mode, we'll use selection to highlight the current match
    }
    
    /**
     * Clear all search highlights
     */
    private clearSearchHighlights(): void {
        if (this.currentMode === 'enhanced' && this.enhancedEditor) {
            // Preserve search input focus during DOM manipulation
            const wasSearchInputFocused = document.activeElement === this.searchInput;
            const wasReplaceInputFocused = document.activeElement === this.replaceInput;
            
            this.enhancedEditor.clearAllHighlights();
            
            // Restore focus to search inputs if they had it before DOM manipulation
            if (wasSearchInputFocused && this.searchInput) {
                this.searchInput.focus();
            } else if (wasReplaceInputFocused && this.replaceInput) {
                this.replaceInput.focus();
            }
        }
    }
    
    /**
     * Find next match
     */
    private findNext(): void {
        if (this.searchResults.length === 0) return;
        
        this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResults.length;
        this.selectSearchResult(this.currentSearchIndex, true); // Focus editor when navigating
    }
    
    /**
     * Find previous match
     */
    private findPrevious(): void {
        if (this.searchResults.length === 0) return;
        
        this.currentSearchIndex = this.currentSearchIndex <= 0 
            ? this.searchResults.length - 1 
            : this.currentSearchIndex - 1;
        this.selectSearchResult(this.currentSearchIndex, true); // Focus editor when navigating
    }
    
    /**
     * Select a specific search result
     */
    private selectSearchResult(index: number, shouldFocusEditor: boolean = true): void {
        if (index < 0 || index >= this.searchResults.length) return;
        
        const result = this.searchResults[index];
        if (!result) return;
        
        // Update current index
        this.currentSearchIndex = index;
        
        // For enhanced mode, use visual highlighting instead of text selection
        // This avoids DOM position issues with contenteditable
        if (this.currentMode === 'enhanced') {
            this.highlightSearchResults();
            // Only focus the editor when explicitly requested (navigation, not typing)
            if (shouldFocusEditor) {
                this.focus();
            }
        } else {
            // For simple mode, use text selection as normal
            try {
                this.setSelection(result.start, result.end);
            } catch (error) {
                console.warn('Failed to select search result:', error);
                if (shouldFocusEditor) {
                    this.focus();
                }
            }
        }
    }
    
    /**
     * Replace the current match
     */
    private replaceCurrentMatch(): void {
        if (!this.replaceInput || this.currentSearchIndex < 0 || this.currentSearchIndex >= this.searchResults.length) {
            return;
        }
        
        const replacement = this.replaceInput.value;
        const result = this.searchResults[this.currentSearchIndex];
        if (!result) return;
        
        try {
            if (this.currentMode === 'enhanced' && this.enhancedEditor) {
                // For enhanced mode, use the editor's replace method directly
                this.enhancedEditor.clearAllHighlights();
                this.enhancedEditor.replaceRange(result.start, result.end, replacement);
                // Update our internal value
                this.currentValue = this.enhancedEditor.getText();
            } else {
                // For simple mode, use setRangeText
                this.setRangeText(replacement, result.start, result.end, 'end');
            }
            
            // Refresh the search to recalculate positions
            this.refreshSearchIfActive();
        } catch (error) {
            console.warn('Failed to replace text:', error);
            // Fallback: refresh search without replacement
            this.performSearch();
        }
    }
    
    /**
     * Replace all matches
     */
    private replaceAllMatches(): void {
        if (!this.replaceInput || this.searchResults.length === 0) {
            return;
        }
        
        const replacement = this.replaceInput.value;
        const searchTerm = this.searchInput?.value || '';
        
        try {
            if (this.currentMode === 'enhanced' && this.enhancedEditor) {
                // For enhanced mode, work directly with the editor
                this.enhancedEditor.clearAllHighlights();
                let currentText = this.enhancedEditor.getText();
                
                // Replace all occurrences
                const newText = currentText.replace(
                    new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                    replacement
                );
                
                this.enhancedEditor.setText(newText);
                this.currentValue = newText;
            } else {
                // For simple mode, use our setText method
                const newText = this.currentValue.replace(
                    new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                    replacement
                );
                
                this.setText(newText);
            }
            
            // Refresh search
            this.refreshSearchIfActive();
        } catch (error) {
            console.warn('Failed to replace all matches:', error);
            // Fallback: refresh search without replacement
            this.performSearch();
        }
    }
    
    /**
     * Update the results count display
     */
    private updateResultsCount(resultsElement: HTMLElement): void {
        if (this.searchResults.length === 0) {
            resultsElement.textContent = 'No matches';
        } else {
            resultsElement.textContent = `${this.currentSearchIndex + 1} of ${this.searchResults.length}`;
        }
    }

    /**
     * Refresh search results if search is currently active
     * This prevents stale position data when text changes
     */
    private refreshSearchIfActive(): void {
        // Only refresh if we have an active search
        if (this.searchInput && this.searchInput.value.trim() && this.searchResults.length > 0) {
            // Store current index position for restoration
            const wasAtEnd = this.currentSearchIndex >= this.searchResults.length - 1;
            
            // Re-run the search with fresh text
            this.performSearch();
            
            // Try to maintain position context:
            // If we were at the end of results, go to new end
            // Otherwise stay at current index (clamped to new results length)
            if (this.searchResults.length > 0) {
                if (wasAtEnd) {
                    this.currentSearchIndex = this.searchResults.length - 1;
                } else {
                    this.currentSearchIndex = Math.min(this.currentSearchIndex, this.searchResults.length - 1);
                    this.currentSearchIndex = Math.max(0, this.currentSearchIndex);
                }
                
                // Update highlighting without focus change
                this.selectSearchResult(this.currentSearchIndex, false);
                
                // Update results count if search bar is visible
                const resultsCount = this.container.querySelector('.search-results-count') as HTMLElement;
                if (resultsCount) {
                    this.updateResultsCount(resultsCount);
                }
            }
        }
    }
    
    /**
     * Clean up search functionality
     */
    private cleanupSearch(): void {
        this.clearSearchHighlights();
        if (this.searchBar && this.searchBar.parentNode) {
            this.searchBar.parentNode.removeChild(this.searchBar);
        }
        this.searchBar = null;
        this.searchInput = null;
        this.replaceInput = null;
        this.searchResults = [];
        this.currentSearchIndex = -1;
        this.isSearchVisible = false;
    }
} 