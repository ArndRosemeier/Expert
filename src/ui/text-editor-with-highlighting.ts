// Import CSS for highlighting styles
import './text-editor-highlighting.css';

/**
 * A text editor component that supports both editing and highlighting of text ranges.
 * Uses contenteditable internally but provides a clean interface that only deals with plain text.
 */
export type SelectionMode = 'words' | 'sentences' | 'paragraphs';

export interface UndoState {
    startPos: number;
    endPos: number;
    originalText: string;
    replacedText: string;
    nodeId?: string;
}

export class TextEditorWithHighlighting {
    private container: HTMLElement;
    private editableDiv!: HTMLDivElement;
    private highlights: Map<string, {startPos: number, endPos: number, className: string}> = new Map();
    private plainTextContent: string = '';  // Track plain text separately from HTML
    private selectionMode: SelectionMode = 'sentences';  // Default to sentence boundaries
    private changeCallback?: (text: string) => void;
    private focusCallback?: () => void;
    private blurCallback?: () => void;
    private lastReplacement: UndoState | null = null;
    private highlightTimeouts: Map<string, number> = new Map();

    constructor(container: HTMLElement) {
        this.container = container;
        this.createEditor();
        this.setupEventListeners();
        this.plainTextContent = '';  // Initialize with empty text
    }

    /**
     * Create the contenteditable div editor
     */
    private createEditor(): void {
        this.editableDiv = document.createElement('div');
        this.editableDiv.contentEditable = 'true';
        this.editableDiv.className = 'text-editor-with-highlighting';
        
        // Style to look like a textarea
        this.editableDiv.style.cssText = `
            width: 100%;
            min-height: 80px;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            white-space: pre-wrap;
            word-wrap: break-word;
            outline: none;
            background: transparent;
            overflow-y: auto;
            resize: vertical;
        `;

        this.container.appendChild(this.editableDiv);
    }

    /**
     * Setup event listeners for the editor
     */
    private setupEventListeners(): void {
        this.editableDiv.addEventListener('input', () => {
            // Update our plain text tracking when user edits manually
            this.plainTextContent = this.editableDiv.textContent || '';
            // Clear all highlights when user edits manually - BUT ONLY IF THERE ARE HIGHLIGHTS
            if (this.highlights.size > 0) {
                this.clearAllHighlights();
            }
            // Note: We don't clear undo state here - let canUndo() check if replacement text is still intact
            if (this.changeCallback) {
                this.changeCallback(this.getText());
            }
        });

        this.editableDiv.addEventListener('focus', () => {
            if (this.focusCallback) {
                this.focusCallback();
            }
        });

        this.editableDiv.addEventListener('blur', () => {
            if (this.blurCallback) {
                this.blurCallback();
            }
        });

        // Prevent pasting HTML - only allow plain text
        this.editableDiv.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData?.getData('text/plain') || '';
            document.execCommand('insertText', false, text);
        });
    }

    /**
     * Get the plain text content
     */
    public getText(): string {
        return this.plainTextContent;
    }

    /**
     * Set the plain text content (removes all highlights)
     */
    public setText(text: string): void {
        this.plainTextContent = text;
        this.editableDiv.textContent = text;
        this.highlights.clear();
    }

    /**
     * Add a highlight to a specific text range
     */
    public addHighlight(id: string, startPos: number, endPos: number, className: string = 'highlight-ai-replacement'): void {
        const text = this.getText();
        if (startPos < 0 || endPos > text.length || startPos >= endPos) {
            console.warn('Invalid highlight range:', {startPos, endPos, textLength: text.length});
            return;
        }

        // Clear any existing timeout for this highlight
        const existingTimeout = this.highlightTimeouts.get(id);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        // Store highlight info
        this.highlights.set(id, {startPos, endPos, className});

        // Apply the highlight
        this.renderWithHighlights();

        // Schedule automatic removal for AI result highlights after 5 seconds
        if (className.includes('highlight-ai-replacement') || className.includes('ai-result')) {
            const timeoutId = setTimeout(() => {
                this.removeHighlight(id);
                this.highlightTimeouts.delete(id);
            }, 5000);
            this.highlightTimeouts.set(id, timeoutId);
        }
    }

    /**
     * Remove a specific highlight
     */
    public removeHighlight(id: string): void {
        // Clear any pending timeout for this highlight
        const timeoutId = this.highlightTimeouts.get(id);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.highlightTimeouts.delete(id);
        }

        this.highlights.delete(id);
        this.renderWithHighlights();
    }

    /**
     * Clear all highlights
     */
    public clearAllHighlights(): void {
        // Clear all pending timeouts
        this.highlightTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.highlightTimeouts.clear();

        this.highlights.clear();
        this.renderWithHighlights();
    }

    /**
     * Expand selection to sensible boundaries based on current selection mode
     */
    public expandToWordBoundaries(startPos: number, endPos: number): {startPos: number, endPos: number} {
        if (this.selectionMode === 'sentences') {
            return this.expandToSentenceBoundaries(startPos, endPos);
        } else if (this.selectionMode === 'paragraphs') {
            return this.expandToParagraphBoundaries(startPos, endPos);
        } else {
            return this.expandToWordBoundariesOnly(startPos, endPos);
        }
    }

    /**
     * Expand selection to word boundaries with smart punctuation handling
     */
    private expandToWordBoundariesOnly(startPos: number, endPos: number): {startPos: number, endPos: number} {
        const text = this.getText();
        let newStartPos = startPos;
        let newEndPos = endPos;

        // Expand start position to word boundary
        while (newStartPos > 0) {
            const char = text[newStartPos - 1];
            // Stop at whitespace or sentence-ending punctuation
            if (/\s/.test(char) || /[.!?]/.test(char)) {
                break;
            }
            // Continue through word characters, hyphens, apostrophes
            if (/[\w'-]/.test(char)) {
                newStartPos--;
            } else {
                break;
            }
        }

        // Expand end position to word boundary
        while (newEndPos < text.length) {
            const char = text[newEndPos];
            // Stop at whitespace or sentence-ending punctuation
            if (/\s/.test(char) || /[.!?]/.test(char)) {
                break;
            }
            // Continue through word characters, hyphens, apostrophes
            if (/[\w'-]/.test(char)) {
                newEndPos++;
            } else {
                break;
            }
        }

        // Trim any leading/trailing whitespace from the final selection
        while (newStartPos < newEndPos && /\s/.test(text[newStartPos])) {
            newStartPos++;
        }
        while (newEndPos > newStartPos && /\s/.test(text[newEndPos - 1])) {
            newEndPos--;
        }

        return {startPos: newStartPos, endPos: newEndPos};
    }

    /**
     * Expand selection to sentence boundaries
     */
    private expandToSentenceBoundaries(startPos: number, endPos: number): {startPos: number, endPos: number} {
        const text = this.getText();
        let newStartPos = startPos;
        let newEndPos = endPos;

        // Expand start position to sentence beginning
        while (newStartPos > 0) {
            const char = text[newStartPos - 1];
            // Stop at sentence-ending punctuation followed by whitespace/newline
            if (/[.!?]/.test(char)) {
                // Check if followed by whitespace or end of text
                if (newStartPos === text.length || /\s/.test(text[newStartPos])) {
                    break;
                }
            }
            newStartPos--;
        }

        // Expand end position to sentence end
        while (newEndPos < text.length) {
            const char = text[newEndPos];
            // Stop after sentence-ending punctuation
            if (/[.!?]/.test(char)) {
                newEndPos++; // Include the punctuation
                break;
            }
            newEndPos++;
        }

        // Trim leading whitespace but keep trailing punctuation
        while (newStartPos < newEndPos && /\s/.test(text[newStartPos])) {
            newStartPos++;
        }

        return {startPos: newStartPos, endPos: newEndPos};
    }

    /**
     * Expand selection to paragraph boundaries
     */
    private expandToParagraphBoundaries(startPos: number, endPos: number): {startPos: number, endPos: number} {
        const text = this.getText();
        let newStartPos = startPos;
        let newEndPos = endPos;

        // Expand start position to paragraph beginning
        while (newStartPos > 0) {
            const char = text[newStartPos - 1];
            // Stop at double newline (paragraph break) or start of text
            if (char === '\n') {
                // Check if it's a double newline (paragraph break)
                if (newStartPos > 1 && text[newStartPos - 2] === '\n') {
                    break;
                }
                // Single newline - check if this starts a new paragraph (empty line before)
                if (newStartPos === 1 || text[newStartPos - 2] === '\n') {
                    break;
                }
            }
            newStartPos--;
        }

        // Expand end position to paragraph end
        while (newEndPos < text.length) {
            const char = text[newEndPos];
            // Stop at double newline (paragraph break)
            if (char === '\n') {
                // Check if next character is also newline (paragraph break)
                if (newEndPos + 1 < text.length && text[newEndPos + 1] === '\n') {
                    break;
                }
                // Single newline - check if this ends the paragraph (empty line after)
                if (newEndPos + 1 === text.length || text[newEndPos + 1] === '\n') {
                    newEndPos++; // Include the newline
                    break;
                }
            }
            newEndPos++;
        }

        // Trim leading and trailing whitespace within the paragraph
        while (newStartPos < newEndPos && /\s/.test(text[newStartPos])) {
            newStartPos++;
        }
        while (newEndPos > newStartPos && /\s/.test(text[newEndPos - 1])) {
            newEndPos--;
        }

        return {startPos: newStartPos, endPos: newEndPos};
    }

    /**
     * Add a preview highlight to show what will be processed by AI
     */
    public addPreviewHighlight(startPos: number, endPos: number): void {
        // Clear any existing highlights and add preview
        this.clearAllHighlights();
        this.addHighlight('preview', startPos, endPos, 'highlight-ai-preview');
    }

    /**
     * Check if a preview highlight exists
     */
    public hasPreviewHighlight(): boolean {
        return this.highlights.has('preview');
    }

    /**
     * Set the AI capture selection mode
     */
    public setSelectionMode(mode: SelectionMode): void {
        this.selectionMode = mode;
    }

    /**
     * Get the current AI capture selection mode
     */
    public getSelectionMode(): SelectionMode {
        return this.selectionMode;
    }

    /**
     * Convert preview highlight to result highlight after AI completion
     */
    public convertPreviewToResult(newText: string): void {
        const previewHighlight = this.highlights.get('preview');
        if (!previewHighlight) return;

        const startPos = previewHighlight.startPos;
        const endPos = previewHighlight.endPos;
        
        // Replace text and add result highlight
        this.replaceTextWithHighlight(startPos, endPos, newText, 'ai-result');
    }



    /**
     * Replace text at a specific range and highlight the replacement
     */
    public replaceTextWithHighlight(startPos: number, endPos: number, newText: string, highlightId: string = 'ai-replacement'): void {
        const currentText = this.getText();
        const beforeText = currentText.substring(0, startPos);
        const afterText = currentText.substring(endPos);
        const originalText = currentText.substring(startPos, endPos);
        
        // Store undo state before making the change
        this.lastReplacement = {
            startPos,
            endPos,
            originalText,
            replacedText: newText
        };
        
        const newFullText = beforeText + newText + afterText;
        const newEndPos = startPos + newText.length;
        
        // Set the new text (this clears all existing highlights)
        this.setText(newFullText);
        
        // Add single highlight for the replaced text
        this.addHighlight(highlightId, startPos, newEndPos);
        
        // No need to set selection - HTML highlighting provides visual feedback
    }

    /**
     * Check if undo is possible for the last replacement
     */
    public canUndo(): boolean {
        if (!this.lastReplacement) return false;
        
        const currentText = this.getText();
        const { startPos, replacedText } = this.lastReplacement;
        const newEndPos = startPos + replacedText.length;
        
        // Check if the replacement text is still at the expected position
        if (newEndPos > currentText.length) return false;
        
        const currentTextAtPosition = currentText.substring(startPos, newEndPos);
        return currentTextAtPosition === replacedText;
    }

    /**
     * Undo the last replacement
     */
    public undoLastReplacement(): boolean {
        if (!this.canUndo() || !this.lastReplacement) return false;
        
        const { startPos, originalText, replacedText } = this.lastReplacement;
        const newEndPos = startPos + replacedText.length;
        
        // Replace the AI text back with the original text
        const currentText = this.getText();
        const beforeText = currentText.substring(0, startPos);
        const afterText = currentText.substring(newEndPos);
        const restoredText = beforeText + originalText + afterText;
        
        // Clear undo state before setting text to avoid creating new undo state
        this.lastReplacement = null;
        
        // Set the restored text and clear highlights
        this.setText(restoredText);
        
        return true;
    }

    /**
     * Clear undo state (manual override - normally undo checks position automatically)
     */
    public clearUndo(): void {
        this.lastReplacement = null;
    }

    /**
     * Get undo state for external access
     */
    public getUndoState(): UndoState | null {
        return this.lastReplacement;
    }

    /**
     * Set text selection
     */
    public setSelection(startPos: number, endPos: number): void {
        const range = document.createRange();
        const selection = window.getSelection();
        
        if (!selection) return;

        // Find the text node and position within it
        const textNode = this.editableDiv.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

        try {
            range.setStart(textNode, startPos);
            range.setEnd(textNode, endPos);
            selection.removeAllRanges();
            selection.addRange(range);
        } catch (error) {
            console.warn('Failed to set selection:', error);
        }
    }

    /**
     * Get current selection
     */
    public getSelection(): {startPos: number, endPos: number, text: string} | null {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        const text = this.getText();
        
        // Calculate positions relative to the full text
        const startPos = this.getTextOffset(range.startContainer, range.startOffset);
        const endPos = this.getTextOffset(range.endContainer, range.endOffset);
        
        if (startPos === -1 || endPos === -1) return null;

        return {
            startPos,
            endPos,
            text: text.substring(startPos, endPos)
        };
    }

    /**
     * Focus the editor
     */
    public focus(): void {
        this.editableDiv.focus();
    }

    /**
     * Set event callbacks
     */
    public onTextChange(callback: (text: string) => void): void {
        this.changeCallback = callback;
    }

    public onFocus(callback: () => void): void {
        this.focusCallback = callback;
    }

    public onBlur(callback: () => void): void {
        this.blurCallback = callback;
    }

    /**
     * Re-render the content with highlights applied
     */
    private renderWithHighlights(): void {
        const text = this.plainTextContent;
        
        if (this.highlights.size === 0) {
            // No highlights - just plain text
            this.editableDiv.textContent = text;
            return;
        }

        // Sort highlights by start position
        const sortedHighlights = Array.from(this.highlights.entries())
            .sort(([, a], [, b]) => a.startPos - b.startPos);

        let html = '';
        let lastPos = 0;

        for (const [id, highlight] of sortedHighlights) {
            // Add text before highlight
            if (highlight.startPos > lastPos) {
                html += this.escapeHtml(text.substring(lastPos, highlight.startPos));
            }

            // Add highlighted text
            const highlightedText = text.substring(highlight.startPos, highlight.endPos);
            html += `<span class="${highlight.className}" data-highlight-id="${id}">${this.escapeHtml(highlightedText)}</span>`;
            
            lastPos = highlight.endPos;
        }

        // Add remaining text after last highlight
        if (lastPos < text.length) {
            html += this.escapeHtml(text.substring(lastPos));
        }

        this.editableDiv.innerHTML = html;
    }

    /**
     * Get text offset from a DOM node and offset
     */
    private getTextOffset(node: Node, offset: number): number {
        const walker = document.createTreeWalker(
            this.editableDiv,
            NodeFilter.SHOW_TEXT,
            null
        );

        let totalOffset = 0;
        let currentNode;

        while (currentNode = walker.nextNode()) {
            if (currentNode === node) {
                return totalOffset + offset;
            }
            totalOffset += currentNode.textContent?.length || 0;
        }

        return -1;
    }

    /**
     * Escape HTML characters
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Destroy the editor and clean up
     */
    public destroy(): void {
        // Clear all pending highlight timeouts
        this.highlightTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.highlightTimeouts.clear();
        
        this.editableDiv.remove();
        this.highlights.clear();
    }
} 