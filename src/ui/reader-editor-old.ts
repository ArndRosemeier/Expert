import { ReaderGUI } from './reader-gui';
import { ProjectManager } from '../ProjectManager';
import { ReaderEditManager } from './reader-edit-manager';
import { TextEditorWithHighlighting } from './text-editor-with-highlighting';
import { 
    EditState, 
    EditContext,
    TextSelection
} from '../types/ReaderEditingTypes';

interface NodeEditor {
    nodeId: string;
    element: HTMLElement;
    editor: TextEditorWithHighlighting;
    originalContent: string;
    isDirty: boolean;
}

/**
 * Simplified ReaderEditor using textarea overlays instead of contentEditable.
 * This approach eliminates complex text manipulation issues by using native form controls.
 */
export class ReaderEditor {
    private readerGUI: ReaderGUI;
    private projectManager: ProjectManager;
    private editManager: ReaderEditManager;
    private editState: EditState;
    private nodeEditors: Map<string, NodeEditor> = new Map();
    private currentActiveEditor: NodeEditor | null = null;
    private autoSaveTimer: number | null = null;
    
    // AI replacement highlighting state - persists across redraws
    private aiReplacementHighlight: {
        nodeId: string;
        startPos: number;
        endPos: number;
    } | null = null;
    
    // Flag to prevent clearing selection during our own operations
    private isApplyingAISelection: boolean = false;
    
    // Bound method references for proper event listener removal
    private boundHandleKeyDown: (event: KeyboardEvent) => void;

    constructor(readerGUI: ReaderGUI, projectManager: ProjectManager) {
        this.readerGUI = readerGUI;
        this.projectManager = projectManager;
        this.editManager = new ReaderEditManager(projectManager);
        
        // Bind event handler methods
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        
        // Initialize state - always in edit mode now
        this.editState = {
            isEditMode: true,
            isDirty: false,
            lastSaved: null,
            editableNodes: new Map()
        };
        
        this.editManager.initialize();
    }

    /**
     * Initialize the always-on editing interface
     */
    public initialize(): void {
        this.createTextareaOverlays();
        this.setupEventListeners();
        this.updateEditModeUI();
        this.readerGUI.updateActionButtons();

    }

    /**
     * Get current edit state
     */
    public getEditState(): EditState {
        return { ...this.editState };
    }

    /**
     * Get current text selection from active editor
     */
    public getCurrentSelection(): TextSelection | null {
        if (!this.currentActiveEditor || !this.currentActiveEditor.editor) {
            return null;
        }

        const selection = this.currentActiveEditor.editor.getSelection();
        if (!selection || !selection.text) return null;

        return {
            text: selection.text,
            startOffset: selection.startPos,
            endOffset: selection.endPos,
            nodeId: this.currentActiveEditor.nodeId,
            element: this.currentActiveEditor.element
        };
    }

    /**
     * Get current edit context for AI actions
     */
    public getCurrentEditContext(): EditContext | null {
        if (!this.currentActiveEditor) return null;

        const node = this.projectManager.findNodeById(this.currentActiveEditor.nodeId);
        if (!node) return null;

        const selection = this.getCurrentSelection();
        const cursorPosition = selection ? selection.startOffset : 0;

        return {
            selection,
            cursorPosition,
            nodeId: this.currentActiveEditor.nodeId,
            node: node
        };
    }

    /**
     * Execute an AI-powered edit action
     */
    public async executeAction(actionId: string): Promise<void> {
        const context = this.getCurrentEditContext();
        if (!context || !this.currentActiveEditor) {
            console.warn('No edit context available for action execution');
            return;
        }

        try {
            // Show loading state
            this.showActionLoadingState(actionId);
            
            // Execute the action
            const result = await this.editManager.executeAction(actionId, context);
            
            // Apply the result to the textarea
            this.applyAIResult(this.currentActiveEditor, context, result);
            
        } catch (error) {
            console.error('Failed to execute action:', error);
            alert(`Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            this.hideActionLoadingState(actionId);
        }
    }

    /**
     * Apply AI result to the current node
     */
    private applyAIResult(editor: NodeEditor, context: EditContext, result: string): void {
        const selection = context.selection;
        let selectionStart: number;
        let selectionEnd: number;

        if (selection && selection.text) {
            // Replace selected text
            selectionStart = selection.startOffset;
            selectionEnd = selection.startOffset + result.length;
            
            // Use the new editor's built-in replace and highlight method
            editor.editor.replaceTextWithHighlight(
                selection.startOffset,
                selection.endOffset,
                result,
                'ai-replacement'
            );
        } else {
            // Insert at cursor position - get current selection from editor
            const currentSelection = editor.editor.getSelection();
            const cursorPos = currentSelection ? currentSelection.startPos : 0;
            
            selectionStart = cursorPos;
            selectionEnd = cursorPos + result.length;
            
            // Use the new editor's built-in replace and highlight method
            editor.editor.replaceTextWithHighlight(
                cursorPos,
                cursorPos,
                result,
                'ai-replacement'
            );
        }

        console.log('✅ Applied AI result with highlighting:', {
            nodeId: editor.nodeId,
            startPos: selectionStart,
            endPos: selectionEnd,
            result: result.substring(0, 50) + '...'
        });

        // Mark as dirty and auto-save
        this.markDirty(editor);
    }

    /**
     * Apply stored AI replacement selection if it exists
     */
    private applyStoredSelection(): void {
        console.log('🔄 applyStoredSelection called, stored highlight:', this.aiReplacementHighlight);
        
        if (!this.aiReplacementHighlight) {
            console.log('❌ No stored highlight to apply');
            return;
        }

        const editor = this.nodeEditors.get(this.aiReplacementHighlight.nodeId);
        if (!editor || !editor.textarea) {
            console.log('❌ Editor or textarea not found for nodeId:', this.aiReplacementHighlight.nodeId);
            return;
        }

        console.log('✅ Found editor and textarea, applying selection:', {
            nodeId: this.aiReplacementHighlight.nodeId,
            startPos: this.aiReplacementHighlight.startPos,
            endPos: this.aiReplacementHighlight.endPos,
            textLength: editor.textarea.value.length,
            textPreview: editor.textarea.value.substring(0, 100) + '...'
        });

        // Focus the textarea first to make selection visible
        editor.textarea.focus();
        
        // Apply the selection to highlight the replaced text
        editor.textarea.setSelectionRange(
            this.aiReplacementHighlight.startPos,
            this.aiReplacementHighlight.endPos
        );
        
        // Log the actual selection after setting it
        console.log('📍 Selection applied, actual selection:', {
            selectionStart: editor.textarea.selectionStart,
            selectionEnd: editor.textarea.selectionEnd,
            selectedText: editor.textarea.value.substring(editor.textarea.selectionStart, editor.textarea.selectionEnd)
        });
    }

    /**
     * Clear stored AI replacement selection (called on manual user interaction)
     */
    private clearStoredSelection(): void {
        // Don't clear if we're currently applying AI selection
        if (this.isApplyingAISelection) {
            console.log('🛡️ Prevented clearing selection during AI operation');
            return;
        }
        
        console.log('🗑️ Clearing stored selection due to user interaction');
        console.log('📍 Call stack:', new Error().stack);
        this.aiReplacementHighlight = null;
    }

    /**
     * Create textarea overlays for all content nodes
     */
    private createTextareaOverlays(): void {
        const container = this.readerGUI.getContainer();
        const nodeElements = container.querySelectorAll('.node-content[data-node-id]');
        
        nodeElements.forEach((element: Element) => {
            const htmlElement = element as HTMLElement;
            const nodeId = htmlElement.getAttribute('data-node-id');
            if (!nodeId) return;

            const node = this.projectManager.findNodeById(nodeId);
            if (!node) return;

            this.createNodeEditor(nodeId, htmlElement, node.content || '');
        });
    }

    /**
     * Create a single node editor
     */
    private createNodeEditor(nodeId: string, element: HTMLElement, content: string): void {
        // Check if textarea already exists for this node
        if (this.nodeEditors.has(nodeId)) {
            return;
        }
        
        // Check if element already has a textarea
        const existingTextarea = element.querySelector('.reader-editor-textarea');
        if (existingTextarea) {
            return;
        }
        
        // Create textarea overlay
        const textarea = document.createElement('textarea');
        textarea.className = 'reader-editor-textarea';
        textarea.value = content;
        textarea.setAttribute('data-node-id', nodeId);
        
        // Insert textarea as child of the content element for proper positioning
        element.appendChild(textarea);
        
        // Calculate proper height BEFORE making it absolute positioned
        const calculatedHeight = this.calculateAndSetProperHeight(textarea, element);
        
        // Style the textarea to overlay the content (after height is calculated)
        this.styleTextareaOverlay(textarea, element, calculatedHeight);
        
        // Hide original content children but keep the element visible for the textarea
        this.hideContentChildren(element);
        
        // Create editor record
        const editor: NodeEditor = {
            nodeId,
            element,
            textarea,
            originalContent: content,
            isDirty: false
        };
        
        this.nodeEditors.set(nodeId, editor);
        this.editState.editableNodes.set(nodeId, textarea);
        
        // Add event listeners
        textarea.addEventListener('focus', () => this.handleTextareaFocus(editor));
        textarea.addEventListener('input', () => this.markDirty(editor));
        textarea.addEventListener('blur', () => this.handleTextareaBlur(editor));
        
        // Clear AI selection on manual user interaction
        textarea.addEventListener('click', () => this.clearStoredSelection());
        textarea.addEventListener('keydown', (e) => {
            // Only clear on actual editing keys, not navigation keys
            if (!e.ctrlKey && !e.metaKey && e.key.length === 1) {
                this.clearStoredSelection();
            }
        });
    }

    /**
     * Calculate and set proper height for textarea based on content
     */
    private calculateAndSetProperHeight(textarea: HTMLTextAreaElement, contentElement: HTMLElement): number {
        const computedStyle = window.getComputedStyle(contentElement);
        
        // Create a temporary clone for measurement
        const clone = textarea.cloneNode(true) as HTMLTextAreaElement;
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.height = 'auto';
        clone.style.minHeight = '0';
        clone.style.maxHeight = 'none';
        clone.style.overflow = 'hidden';
        
        // Apply the same styling as the target
        clone.style.fontSize = computedStyle.fontSize;
        clone.style.fontFamily = computedStyle.fontFamily;
        clone.style.lineHeight = computedStyle.lineHeight;
        clone.style.padding = computedStyle.padding;
        clone.style.width = `${contentElement.offsetWidth}px`;
        clone.style.border = 'none';
        clone.style.boxSizing = 'border-box';
        clone.style.whiteSpace = 'pre-wrap';
        clone.style.wordWrap = 'break-word';
        
        // Insert clone, measure, then remove
        document.body.appendChild(clone);
        const scrollHeight = clone.scrollHeight;
        document.body.removeChild(clone);
        
        // Calculate proper height
        const minHeight = 80;
        const neededHeight = Math.max(minHeight, scrollHeight + 16);
        
        // Apply styling to actual textarea
        textarea.style.fontSize = computedStyle.fontSize;
        textarea.style.fontFamily = computedStyle.fontFamily;
        textarea.style.lineHeight = computedStyle.lineHeight;
        textarea.style.padding = computedStyle.padding;
        textarea.style.width = `${contentElement.offsetWidth}px`;
        textarea.style.border = 'none';
        textarea.style.boxSizing = 'border-box';
        textarea.style.whiteSpace = 'pre-wrap';
        textarea.style.wordWrap = 'break-word';
        textarea.style.setProperty('height', `${neededHeight}px`, 'important');
        
        return neededHeight;
    }

    /**
     * Style textarea to overlay the content element
     */
    private styleTextareaOverlay(textarea: HTMLTextAreaElement, contentElement: HTMLElement, textareaHeight: number): void {
        const computedStyle = window.getComputedStyle(contentElement);
        
        // Make the content element itself relative for positioning
        contentElement.style.position = 'relative';
        contentElement.style.overflow = 'visible';
        contentElement.style.height = `${textareaHeight}px`; // Force height to accommodate textarea exactly
        contentElement.style.minHeight = `${textareaHeight}px`;
        
        // Apply overlay positioning to fill the content element exactly
        textarea.style.position = 'absolute';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.style.margin = '0';
        textarea.style.padding = computedStyle.padding;
        textarea.style.borderRadius = '0';
        textarea.style.backgroundColor = 'transparent';
        textarea.style.resize = 'vertical';
        textarea.style.zIndex = '10';
        textarea.style.overflow = 'auto';
        textarea.style.border = 'none';
        textarea.style.boxSizing = 'border-box';
        
        // Add input listener for auto-resize
        textarea.addEventListener('input', () => this.autoResizeTextarea(textarea));
    }

    /**
     * Hide original content children to prevent overlap with textarea
     */
    private hideContentChildren(contentElement: HTMLElement): void {
        const nodeId = contentElement.getAttribute('data-node-id');
        const children = Array.from(contentElement.children);
        
        children.forEach((child: Element) => {
            const htmlChild = child as HTMLElement;
            if (!htmlChild.classList.contains('reader-editor-textarea')) {
                htmlChild.style.display = 'none';
                htmlChild.style.visibility = 'hidden';
                htmlChild.style.opacity = '0';
            }
        });
    }

    /**
     * Show original content children (when textarea is removed)
     */
    private showContentChildren(contentElement: HTMLElement): void {
        const children = Array.from(contentElement.children);
        
        children.forEach((child: Element) => {
            const htmlChild = child as HTMLElement;
            if (!htmlChild.classList.contains('reader-editor-textarea')) {
                htmlChild.style.display = '';
                htmlChild.style.visibility = '';
                htmlChild.style.opacity = '';
            }
        });
    }

    /**
     * Auto-resize textarea to fit content
     */
    private autoResizeTextarea(textarea: HTMLTextAreaElement): void {
        const nodeId = textarea.getAttribute('data-node-id');
        const contentElement = textarea.parentElement;
        if (!contentElement || !nodeId) return;

        // Store current page scroll position to prevent unwanted scrolling
        const currentScrollX = window.scrollX;
        const currentScrollY = window.scrollY;
        
        // Store current selection to preserve it during resize
        const selectionStart = textarea.selectionStart;
        const selectionEnd = textarea.selectionEnd;
        
        // Calculate new height based on content
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const minHeight = 80;
        const newHeight = Math.max(minHeight, scrollHeight + 8);
        
        // Apply the height
        textarea.style.height = `${newHeight}px`;
        
        // Update parent container height to accommodate textarea
        if (contentElement && newHeight > contentElement.offsetHeight) {
            contentElement.style.height = `${newHeight}px`;
            contentElement.style.minHeight = `${newHeight}px`;
        }
        
        // No scrolling needed since we size to fit all content
        textarea.style.overflow = 'hidden';
        
        // Restore selection if it was valid
        if (selectionStart !== selectionEnd && selectionStart >= 0 && selectionEnd <= textarea.value.length) {
            textarea.setSelectionRange(selectionStart, selectionEnd);
        }
        
        // Restore page scroll position to prevent unwanted scrolling
        window.scrollTo(currentScrollX, currentScrollY);
    }

    /**
     * Remove all textarea overlays
     */
    private removeTextareaOverlays(): void {
        this.nodeEditors.forEach((editor) => {
            // Remove textarea
            editor.textarea.remove();
            
            // Show original content children
            this.showContentChildren(editor.element);
            
            // Reset content element styles
            editor.element.style.position = '';
            editor.element.style.overflow = '';
            editor.element.style.height = '';
            editor.element.style.minHeight = '';
        });
        
        this.nodeEditors.clear();
        this.editState.editableNodes.clear();
        this.currentActiveEditor = null;
    }

    /**
     * Handle textarea focus
     */
    private handleTextareaFocus(editor: NodeEditor): void {
        this.currentActiveEditor = editor;
        
        // Update action buttons availability
        this.readerGUI.updateActionButtons();
    }

    /**
     * Handle textarea blur
     */
    private handleTextareaBlur(editor: NodeEditor): void {
        // Auto-save on blur if dirty
        if (editor.isDirty) {
            this.scheduleAutoSave();
        }
    }

    /**
     * Mark an editor as dirty
     */
    private markDirty(editor: NodeEditor): void {
        editor.isDirty = true;
        this.editState.isDirty = true;
        this.scheduleAutoSave();
    }

    /**
     * Schedule auto-save with debouncing
     */
    private scheduleAutoSave(): void {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        this.autoSaveTimer = setTimeout(() => {
            this.saveAllChanges();
        }, 2000);
    }

    /**
     * Save all pending changes
     */
    private async saveAllChanges(): Promise<void> {
        if (!this.editState.isDirty) return;

        const savePromises: Promise<void>[] = [];
        
        this.nodeEditors.forEach((editor) => {
            if (editor.isDirty) {
                savePromises.push(this.saveNodeChanges(editor));
            }
        });
        
        await Promise.all(savePromises);
        
        this.editState.isDirty = false;
        this.editState.lastSaved = new Date();
    }

    /**
     * Save changes for a specific node
     */
    private async saveNodeChanges(editor: NodeEditor): Promise<void> {
        const node = this.projectManager.findNodeById(editor.nodeId);
        if (!node) {
            console.error('Node not found for saving:', editor.nodeId);
            return;
        }
        
        // Update node content
        node.content = editor.textarea.value;
        editor.originalContent = editor.textarea.value;
        editor.isDirty = false;
        
        // Save to storage WITHOUT triggering events that refresh the DOM
        await this.projectManager.saveToStorage();
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        document.addEventListener('keydown', this.boundHandleKeyDown);
    }

    /**
     * Remove event listeners
     */
    private removeEventListeners(): void {
        document.removeEventListener('keydown', this.boundHandleKeyDown);
    }

    /**
     * Handle keyboard shortcuts
     */
    private handleKeyDown(event: KeyboardEvent): void {
        // Only handle shortcuts when focused on textarea
        if (!this.currentActiveEditor) return;

        // Ctrl+S or Cmd+S: Save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            this.saveAllChanges();
            return;
        }
        
        // Note: Ctrl+Z undo is handled natively by the textarea
    }

    /**
     * Show loading state for an action button
     */
    private showActionLoadingState(actionId: string): void {
        const button = document.querySelector(`[data-action-id="${actionId}"]`) as HTMLButtonElement;
        if (button) {
            button.disabled = true;
            button.textContent = '⏳ Processing...';
        }
    }

    /**
     * Hide loading state for an action button
     */
    private hideActionLoadingState(actionId: string): void {
        const button = document.querySelector(`[data-action-id="${actionId}"]`) as HTMLButtonElement;
        if (button) {
            button.disabled = false;
            const originalText = button.getAttribute('data-original-text');
            if (originalText) {
                button.textContent = originalText;
            }
        }
    }

    /**
     * Get enabled edit actions for UI display
     */
    public getEnabledActions() {
        return this.editManager.getEnabledActions();
    }

    /**
     * Called when the DOM is recreated (e.g., on rerender)
     */
    public onDOMRecreated(): void {
        console.log('🔄 DOM RECREATED - onDOMRecreated called');
        console.log('🔍 Current stored highlight before recreation:', this.aiReplacementHighlight);
        
        // Protect from clearing during DOM recreation
        const wasProtected = this.isApplyingAISelection;
        this.isApplyingAISelection = true;
        
        // DOM was recreated - need to restore textarea overlays
        this.removeTextareaOverlays();
        this.createTextareaOverlays();
        this.updateEditModeUI();
        
        console.log('⏰ Scheduling applyStoredSelection in 100ms...');
        // Reapply any stored AI replacement selection after DOM recreation
        setTimeout(() => {
            this.applyStoredSelection();
            // Only clear protection if we set it (don't interfere with ongoing AI operations)
            if (!wasProtected) {
                this.isApplyingAISelection = false;
                console.log('🏁 DOM recreation protection cleared');
            }
        }, 100);
    }

    /**
     * Update UI to reflect always-edit state
     */
    private updateEditModeUI(): void {
        const container = this.readerGUI.getContainer();
        
        // Always add the edit mode class since we're always editable
        container.classList.add('reader-edit-mode');
        
        // Hide the edit mode button since it's no longer needed
        const editModeBtn = container.querySelector('#reader-edit-mode') as HTMLButtonElement;
        if (editModeBtn) {
            editModeBtn.style.display = 'none';
        }
    }

    /**
     * Cleanup resources
     */
    public destroy(): void {
        this.removeEventListeners();
        this.removeTextareaOverlays();
        
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
    }
} 