import { TextEditorWithHighlighting } from '../text-editor-with-highlighting';
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
        this.enhancedEditor = new TextEditorWithHighlighting(editorContainer);
        
        // Apply configuration
        this.enhancedEditor.setText(this.currentValue);
        
        // Add to container first
        this.container.appendChild(editorContainer);
        
        // Apply styling to match textarea
        const editorDiv = editorContainer.querySelector('.text-editor-with-highlighting') as HTMLElement;
        if (this.options.className) {
            editorDiv.className += ' ' + this.options.className;
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
        
        // Add undo functionality (Ctrl+Z)
        this.simpleEditor.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 'z') {
                event.preventDefault();
                this.undoToInitialState();
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
        
        // Add undo functionality (Ctrl+Z) to the enhanced editor
        const editorDiv = this.container.querySelector('.text-editor-with-highlighting') as HTMLElement;
        if (editorDiv) {
            editorDiv.addEventListener('keydown', (event) => {
                if (event.ctrlKey && event.key === 'z') {
                    event.preventDefault();
                    this.undoToInitialState();
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
        sentenceBtn.title = 'Highlight sentence';
        
        const paragraphBtn = document.createElement('button');
        paragraphBtn.className = 'overlay-btn paragraph-btn';
        paragraphBtn.innerHTML = '§'; // Section symbol for paragraphs
        paragraphBtn.title = 'Highlight paragraph';

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
        console.log('🔄 showSpinnerOverlay called with regions:', regions);
        if (regions.length === 0 || !regions[0]) {
            console.log('❌ No valid regions for spinner');
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
        console.log('📍 Found editorDiv:', !!editorDiv);
        if (!editorDiv) {
            console.log('❌ No editor div found for spinner positioning');
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
            console.log('📐 Target text rect:', rect);
            
            // Position spinner relative to modal or viewport
            const modalOverlay = this.container.closest('.modal-overlay') as HTMLElement;
            console.log('📦 Found modal overlay:', !!modalOverlay);
            if (modalOverlay) {
                // Position relative to modal overlay
                const modalRect = modalOverlay.getBoundingClientRect();
                this.spinnerOverlay.style.cssText = `
                    position: absolute;
                    left: ${rect.left - modalRect.left - 50}px;
                    top: ${rect.top - modalRect.top}px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 40px;
                    background: rgba(255, 255, 255, 0.95);
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    backdrop-filter: blur(4px);
                    pointer-events: auto;
                    z-index: 2;
                `;
                modalOverlay.appendChild(this.spinnerOverlay);
                console.log('✅ Spinner added to modal overlay');
            } else {
                // Fallback to fixed positioning
                this.spinnerOverlay.style.cssText = `
                    position: fixed;
                    left: ${rect.left - 50}px;
                    top: ${rect.top}px;
                    z-index: 15002;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 40px;
                    background: rgba(255, 255, 255, 0.95);
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    backdrop-filter: blur(4px);
                    pointer-events: auto;
                `;
                document.body.appendChild(this.spinnerOverlay);
                console.log('✅ Spinner added to document body');
            }

            // Add spinner animation
            spinner.style.cssText = `
                font-size: 20px;
                animation: spin 1s linear infinite;
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
        } else {
            console.log('❌ Could not find target text node for spinner positioning');
        }
    }

    /**
     * Hide AI processing spinner overlay
     */
    private hideSpinnerOverlay(): void {
        if (this.spinnerOverlay) {
            console.log('🚫 Hiding spinner overlay');
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
                // Only remove highlights if transformation was NOT requested (user canceled)
                this.hideSpinnerOverlay();
                if (!transformationRequested) {
                    this.removeHighlightsIfNotTransformed(highlightIds);
                }
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
                user_instruction: request.transformInstruction
            }
        };
        
        // Expand the transform_system prompt with placeholders
        const prompt = expansionService.expandPrompt(prompts.transform_system, promptContext);

        // Use OpenRouterClient to get content
        const client = OpenRouterClient.getInstance();
        client.setSettingsManager(settingsManager);
        const generatedContent = await client.chat('editor', prompt);

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

        // Add temporary highlights for 5 seconds
        const tempHighlightIds: string[] = [];
        newRegions.forEach((region, index) => {
            const tempId = `temp-transform-highlight-${Date.now()}-${index}`;
            this.enhancedEditor.addHighlight(tempId, region.start, region.end, 'highlight-ai-replacement');
            tempHighlightIds.push(tempId);
        });

        // Remove temporary highlights after 5 seconds
        setTimeout(() => {
            tempHighlightIds.forEach(id => {
                this.enhancedEditor.removeHighlight(id);
            });
        }, 5000);
        
        // Trigger text change handler if available
        if (this.handlers.onTextChange) {
            this.handlers.onTextChange(newText);
        }
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
        this.container.innerHTML = '';
    }
} 