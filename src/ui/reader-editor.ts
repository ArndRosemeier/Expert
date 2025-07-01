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
 * ReaderEditor using TextEditorWithHighlighting for rich text editing with highlighting support.
 */
export class ReaderEditor {
    private readerGUI: ReaderGUI;
    private projectManager: ProjectManager;
    private editManager: ReaderEditManager;
    private editState: EditState;
    private nodeEditors: Map<string, NodeEditor> = new Map();
    private currentActiveEditor: NodeEditor | null = null;
    private configLoadedPromise!: Promise<void>;
    
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
        
        // Initialize asynchronously - don't await here to avoid blocking constructor
        this.configLoadedPromise = this.editManager.initialize().then(() => {
            // Update action buttons after config is loaded
            this.readerGUI.updateActionButtons();
        });
    }

    /**
     * Initialize the always-on editing interface
     */
    public async initialize(preservedContent?: Map<string, string>): Promise<void> {
        // Wait for config to be loaded first
        await this.configLoadedPromise;
        
        // If we have preserved content, we're doing a rebuild - clear existing editors first
        if (preservedContent && preservedContent.size > 0) {
            this.removeEditorOverlays();
        }
        
        this.createEditorOverlays(preservedContent);
        this.setupEventListeners();
        this.updateEditModeUI();
        
        // Update action buttons now that config is loaded
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
     * Execute an AI-powered edit action with smart selection and preview highlighting
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
            
            // Get smart word-boundary selection if user has text selected
            let processedContext = context;
            if (context.selection && context.selection.text) {
                const smartBounds = this.currentActiveEditor.editor.expandToWordBoundaries(
                    context.selection.startOffset,
                    context.selection.endOffset
                );
                
                // Show preview highlight of what will actually be processed
                this.currentActiveEditor.editor.addPreviewHighlight(smartBounds.startPos, smartBounds.endPos);
                
                // Update context with smart selection
                const smartText = this.currentActiveEditor.editor.getText().substring(smartBounds.startPos, smartBounds.endPos);
                processedContext = {
                    ...context,
                    selection: {
                        ...context.selection,
                        text: smartText,
                        startOffset: smartBounds.startPos,
                        endOffset: smartBounds.endPos
                    }
                };
                

            }
            
            // Execute the action with processed context
            const result = await this.editManager.executeAction(actionId, processedContext);
            
            // Apply the result with highlighting
            this.applyAIResult(this.currentActiveEditor, processedContext, result);
            
        } catch (error) {
            console.error('Failed to execute action:', error);
            alert(`Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            this.hideActionLoadingState(actionId);
        }
    }

    /**
     * Apply AI result to the current node with highlighting
     */
    private applyAIResult(editor: NodeEditor, context: EditContext, result: string): void {
        const selection = context.selection;

        if (selection && selection.text) {
            // Check if we have a preview highlight to convert
            if (editor.editor.hasPreviewHighlight()) {
                // Convert preview to result highlight
                editor.editor.convertPreviewToResult(result);
            } else {
                // Fallback: direct replacement with highlighting
                editor.editor.replaceTextWithHighlight(
                    selection.startOffset,
                    selection.endOffset,
                    result,
                    'highlight-ai-replacement'
                );
            }
        } else {
            // Insert at cursor position with highlighting
            const currentSelection = editor.editor.getSelection();
            const cursorPos = currentSelection ? currentSelection.startPos : 0;
            
            editor.editor.replaceTextWithHighlight(
                cursorPos,
                cursorPos,
                result,
                'highlight-ai-replacement'
            );
        }



        // Mark as dirty and auto-save
        this.markDirty(editor);
    }

    /**
     * Create editor overlays for all nodes
     */
    private createEditorOverlays(preservedContent?: Map<string, string>): void {
        const container = this.readerGUI.getContainer();
        const nodeElements = container.querySelectorAll('.node-content[data-node-id]');
        
        nodeElements.forEach((element: Element) => {
            const htmlElement = element as HTMLElement;
            const nodeId = htmlElement.getAttribute('data-node-id');
            if (!nodeId) return;

            const node = this.projectManager.findNodeById(nodeId);
            if (!node) return;

            // Use preserved content if available, otherwise use node content
            const content = preservedContent?.get(nodeId) ?? node.content ?? '';
            this.createNodeEditor(nodeId, htmlElement, content, preservedContent?.has(nodeId) ?? false);
        });
    }

    /**
     * Create a single node editor
     */
    private createNodeEditor(nodeId: string, element: HTMLElement, content: string, isRestoredContent: boolean = false): void {
        // Check if editor already exists for this node
        if (this.nodeEditors.has(nodeId)) {
            return;
        }
        
        // Clear existing content and create editor container
        element.innerHTML = '';
        element.style.position = 'relative';
        element.style.minHeight = '80px';
        
        // Create the highlighting editor
        const textEditor = new TextEditorWithHighlighting(element);
        textEditor.setText(content);
        
        // Create editor record
        const editor: NodeEditor = {
            nodeId,
            element,
            editor: textEditor,
            originalContent: isRestoredContent ? content : (content || ''),
            isDirty: false
        };
        
        this.nodeEditors.set(nodeId, editor);
        this.editState.editableNodes.set(nodeId, element);
        
        // Set up event handlers
        textEditor.onTextChange((_text) => {
            this.markDirty(editor);
            // Update undo button state when text changes (to check if undo is still valid)
            (this.readerGUI as any).updateUndoButtonState();
        });
        
        textEditor.onFocus(() => {
            this.handleEditorFocus(editor);
        });
        
        textEditor.onBlur(() => {
            this.handleEditorBlur(editor);
        });
        

    }

    /**
     * Remove all editor overlays
     */
    private removeEditorOverlays(): void {
        this.nodeEditors.forEach((editor) => {
            editor.editor.destroy();
            
            // Reset content element styles
            editor.element.style.position = '';
            editor.element.style.minHeight = '';
        });
        
        this.nodeEditors.clear();
        this.editState.editableNodes.clear();
        this.currentActiveEditor = null;
    }

    /**
     * Handle editor focus
     */
    private handleEditorFocus(editor: NodeEditor): void {
        this.currentActiveEditor = editor;
        
        // Update action buttons availability
        this.readerGUI.updateActionButtons();
        
        // Update undo button state (cast to access the private method)
        (this.readerGUI as any).updateUndoButtonState();
    }

    /**
     * Handle editor blur
     */
    private handleEditorBlur(editor: NodeEditor): void {
        // Save immediately when user stops editing (blur)
        if (editor.isDirty) {
            this.saveNodeChanges(editor).catch(console.error);
        }
    }

    /**
     * Mark an editor as dirty
     */
    private markDirty(editor: NodeEditor): void {
        editor.isDirty = true;
        this.editState.isDirty = true;
        // Don't auto-save on every keystroke - only save on blur and close
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
        node.content = editor.editor.getText();
        editor.originalContent = editor.editor.getText();
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
        // Only handle shortcuts when focused on editor
        if (!this.currentActiveEditor) return;

        // Ctrl+S or Cmd+S: Save current editor
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            if (this.currentActiveEditor.isDirty) {
                this.saveNodeChanges(this.currentActiveEditor).catch(console.error);
            }
            return;
        }
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
     * Get all actions (for configuration UI)
     */
    public getAllActions() {
        return this.editManager.getAllActions();
    }

    /**
     * Update an existing action
     */
    public async updateAction(id: string, updates: any): Promise<boolean> {
        return this.editManager.updateAction(id, updates);
    }

    /**
     * Delete an action
     */
    public async deleteAction(id: string): Promise<boolean> {
        return this.editManager.deleteAction(id);
    }

    /**
     * Add a new action
     */
    public async addAction(action: any): Promise<string> {
        return this.editManager.addAction(action);
    }

    /**
     * Reset actions to defaults
     */
    public async resetToDefaults(): Promise<void> {
        return this.editManager.resetToDefaults();
    }

    /**
     * Set the selection mode for all editors
     */
    public setSelectionMode(mode: 'words' | 'sentences' | 'paragraphs'): void {
        this.nodeEditors.forEach(editor => {
            editor.editor.setSelectionMode(mode);
        });
    }

    /**
     * Get the current selection mode (from the active editor or default)
     */
    public getCurrentSelectionMode(): 'words' | 'sentences' | 'paragraphs' {
        if (this.currentActiveEditor) {
            return this.currentActiveEditor.editor.getSelectionMode();
        }
        return 'sentences'; // Default
    }

    /**
     * Check if undo is available for the current active editor
     */
    public canUndo(): boolean {
        if (!this.currentActiveEditor) return false;
        return this.currentActiveEditor.editor.canUndo();
    }

    /**
     * Undo the last AI replacement in the current active editor
     */
    public undoLastReplacement(): boolean {
        if (!this.currentActiveEditor) return false;
        
        const success = this.currentActiveEditor.editor.undoLastReplacement();
        if (success) {
            // Mark as dirty and save immediately after undo
            this.markDirty(this.currentActiveEditor);
            this.saveNodeChanges(this.currentActiveEditor).catch(console.error);
        }
        return success;
    }

    /**
     * Called when the DOM is recreated (e.g., on rerender)
     * DISABLED: With HTML highlighting, DOM recreation is no longer needed
     */
    public onDOMRecreated(): void {

        
        // DISABLED: With HTML-based highlighting that persists in the DOM,
        // we no longer need to recreate editor overlays when DOM changes.
        // The highlighting spans survive DOM recreation automatically.
        return;
        
        // Legacy code (commented out):
        // this.removeEditorOverlays();
        // this.createEditorOverlays();
        // this.updateEditModeUI();
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
    public async destroy(): Promise<void> {
        // Save all pending changes before destroying editors
        if (this.editState.isDirty) {
            console.log('💾 Reader closing - saving pending changes...');
            await this.saveAllChanges();
        }
        
        this.removeEventListeners();
        this.removeEditorOverlays();
    }

    /**
     * Preserve current content from all editors before a DOM rebuild
     */
    public preserveAllContent(): Map<string, string> {
        const preservedContent = new Map<string, string>();
        this.nodeEditors.forEach((editor, nodeId) => {
            const currentContent = editor.editor.getText();
            preservedContent.set(nodeId, currentContent);
        });
        return preservedContent;
    }

    /**
     * Restore preserved content to editors after a DOM rebuild
     * @deprecated Use initialize(preservedContent) instead for better timing
     */
    public restoreAllContent(preservedContent: Map<string, string>): void {
        preservedContent.forEach((content, nodeId) => {
            const editor = this.nodeEditors.get(nodeId);
            if (editor) {
                editor.editor.setText(content);
                editor.originalContent = content;
                editor.isDirty = false;
            }
        });
    }
} 