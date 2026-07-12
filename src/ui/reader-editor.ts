import { ReaderGUI } from './reader-gui';
import { ProjectManager } from '../ProjectManager';
import { ReaderEditManager } from './reader-edit-manager';
import { TextEditorWithHighlighting } from './text-editor-with-highlighting';
import { 
    EditState, 
    EditContext,
    TextSelection,
    ReaderEditAction
} from '../types/ReaderEditingTypes';

export interface ReaderNodeEditor {
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
    private nodeEditors: Map<string, ReaderNodeEditor> = new Map();
    private currentActiveEditor: ReaderNodeEditor | null = null;
    private configLoadedPromise!: Promise<void>;
    private activeActionsCount: number = 0; // Track number of active AI actions
    
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
     * Iterate all per-node text editors (used by ReaderGUI search/replace).
     */
    public forEachReaderNodeEditor(fn: (editor: ReaderNodeEditor, nodeId: string) => void): void {
        this.nodeEditors.forEach(fn);
    }

    /**
     * Get a single node editor by node id.
     */
    public getReaderNodeEditor(nodeId: string): ReaderNodeEditor | undefined {
        return this.nodeEditors.get(nodeId);
    }

    /**
     * List all node ids that currently have editors mounted.
     */
    public getReaderNodeEditorIds(): string[] {
        return Array.from(this.nodeEditors.keys());
    }

    /**
     * Get current text selection from active editor
     */
    public getCurrentSelection(): TextSelection | null {
        if (!this.currentActiveEditor?.editor) {
            return null;
        }

        const selection = this.currentActiveEditor.editor.getSelection();
        if (!selection?.text) return null;

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
            // No edit context available for action execution
            return;
        }

        try {
            // Show loading state
            this.showActionLoadingState(actionId);
            
            // UPDATE: Save current editor content to node before executing AI action
            // This ensures {{content}} placeholder uses the latest edited content
            const currentContent = this.currentActiveEditor.editor.getText();
            const { findNodeGlobally } = await import('../state');
            const nodeLookup = findNodeGlobally(this.currentActiveEditor.nodeId);
                if (nodeLookup) {
                    nodeLookup.node.setContent(currentContent, 'Edited');
                }
            
            // Get smart word-boundary selection if user has text selected
            let processedContext = context;
            if (context.selection?.text) {
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
            // Handle cancellation gracefully without error message
            if (error instanceof Error && error.message === 'ACTION_CANCELED') {
                // Action was canceled by user
                // Clear any preview highlights that might be showing
                if (this.currentActiveEditor.editor.hasPreviewHighlight()) {
                    this.currentActiveEditor.editor.clearAllHighlights();
                }
                return; // Exit gracefully without applying any changes
            }
            
            console.error('Failed to execute action:', error);
            alert(`Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            this.hideActionLoadingState(actionId);
        }
    }

    /**
     * Apply AI result to the current node with highlighting
     */
    private applyAIResult(editor: ReaderNodeEditor, context: EditContext, result: string): void {
        const selection = context.selection;

        if (selection?.text) {
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



        // Content will be copied back when reader closes
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
            const content = preservedContent?.get(nodeId) ?? node.content;
            this.createReaderNodeEditor(nodeId, htmlElement, content, preservedContent?.has(nodeId) ?? false);
        });
    }

    /**
     * Create a single node editor
     */
    private createReaderNodeEditor(nodeId: string, element: HTMLElement, content: string, isRestoredContent: boolean = false): void {
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
        const editor: ReaderNodeEditor = {
            nodeId,
            element,
            editor: textEditor,
            originalContent: isRestoredContent ? content : (content || ''),
            isDirty: false
        };
        
        this.nodeEditors.set(nodeId, editor);
        this.editState.editableNodes.set(nodeId, element);
        
        // Set up event handlers
        textEditor.onTextChange(() => {
            // Do absolutely nothing during text changes
        });
        
        textEditor.onFocus(() => {
            this.handleEditorFocus(editor);
        });
        
        textEditor.onBlur(() => {
            this.handleEditorBlur();
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
    private handleEditorFocus(editor: ReaderNodeEditor): void {
        this.currentActiveEditor = editor;
        
        // Do minimal work on focus to avoid interference
    }

    /**
     * Handle editor blur
     */
    private handleEditorBlur(): void {
        // No saving on blur - just mark as dirty for tracking
        // All content will be copied back when reader closes
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

        // Ctrl+S or Cmd+S: Manual save (just show feedback, actual save happens on close)
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            // Save requested - content will be saved when reader closes
            return;
        }
    }

    /**
     * Show loading state for an action button
     */
    private showActionLoadingState(actionId: string): void {
        this.activeActionsCount++;
        // AI action started
        
        const button = document.querySelector(`[data-action-id="${actionId}"]`) as HTMLButtonElement;
        button.disabled = true;
        button.textContent = '⏳ Processing...';
    }

    /**
     * Hide loading state for an action button
     */
    private hideActionLoadingState(actionId: string): void {
        this.activeActionsCount = Math.max(0, this.activeActionsCount - 1);
        // AI action completed
        
        const button = document.querySelector(`[data-action-id="${actionId}"]`) as HTMLButtonElement;
        button.disabled = false;
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.textContent = originalText;
        }
    }

    /**
     * Check if any AI actions are currently in progress
     */
    public isAIActionInProgress(): boolean {
        return this.activeActionsCount > 0;
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
    public async updateAction(id: string, updates: Partial<ReaderEditAction>): Promise<boolean> {
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
    public async addAction(action: Omit<ReaderEditAction, 'id'>): Promise<string> {
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
            // Content will be copied back when reader closes
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
        editModeBtn.style.display = 'none';
    }

    /**
     * Cleanup resources - robustly copy ALL content back to nodes
     */
    public async destroy(): Promise<void> {
        // Reader closing - copying all content back to nodes
        
        // Robustly copy ALL current content from ALL editors back to their nodes
        // This catches changes from any source: user typing, AI actions, etc.
        const { findNodeGlobally } = await import('../state');
        this.nodeEditors.forEach((editor, nodeId) => {
            const currentContent = editor.editor.getText();
            const result = findNodeGlobally(nodeId);
            
            if (result) {
                // Always update node content with current editor content using version management
                // regardless of dirty state or how the content got there, mark as Edited
                result.node.setContent(currentContent, 'Edited');
                // Copied content from reader to node
            } else {
                // Node not found for editor
            }
        });
        
        // Save the entire project to storage after updating all nodes
        if (this.nodeEditors.size > 0) {
            await this.projectManager.saveToStorage();
            // All reader content saved to storage
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
            }
        });
    }
} 