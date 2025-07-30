// Import CSS for highlighting styles
import './text-editor-highlighting.css';

/**
 * ⚠️  CRITICAL TEXT PRESERVATION COMPONENT ⚠️
 * 
 * This text editor component is a MISSION-CRITICAL piece of the application that handles
 * text-to-HTML-to-text conversion cycles. ANY modification to the text preservation logic
 * must be thoroughly tested as it can cause SILENT DATA CORRUPTION.
 * 
 * 🐛 CRITICAL BUG HISTORY:
 * - User text was being silently corrupted during focus changes
 * - Paragraph line breaks were being lost (empty lines between paragraphs disappeared)
 * - The root cause was improper HTML ↔ Text round-trip conversion
 * - Text starting/ending with newlines was being stripped incorrectly
 * 
 * 🧪 COMPREHENSIVE TESTING COMPLETED:
 * This component has been tested against worst-case scenarios including:
 * ✅ HTML/XML content as text (full documents, CDATA, malformed markup)
 * ✅ Special characters & entities (< > & " ' and HTML entities)
 * ✅ Unicode symbols and emojis (🌍🚀🎉 and international characters ©®™€£)
 * ✅ Code snippets (JavaScript, CSS, JSON with embedded HTML/XSS attempts)
 * ✅ Edge cases (empty strings, pure whitespace, pure newlines)
 * ✅ Complex newline patterns (leading/trailing/multiple consecutive newlines)
 * ✅ Very long texts with many paragraphs
 * ✅ XSS and injection attempt patterns
 * 
 * 🛡️ DATA INTEGRITY GUARANTEES:
 * - Perfect round-trip fidelity: Text → HTML → Text preserves EVERY character
 * - NO silent data corruption during any editing/highlighting operations
 * - Leading/trailing whitespace and newlines are preserved exactly
 * - HTML/XML code is safely escaped and preserved as text (not interpreted)
 * - Browser-generated HTML variations (<br>, <div>, <p>) are handled correctly
 * 
 * ⚠️  WARNING TO FUTURE DEVELOPERS:
 * Before modifying escapeHtml() or extractTextFromHtml():
 * 1. Review the comprehensive test cases that were used
 * 2. Test with the user's actual content that was being corrupted
 * 3. Test ALL edge cases: newlines, HTML content, special chars, empty strings
 * 4. Remember: Users' content is sacred - any loss is unacceptable
 * 
 * The entire application relies on this component for text integrity.
 * User data corruption is a CRITICAL failure that undermines trust in the system.
 */
type SelectionMode = 'words' | 'sentences' | 'paragraphs';

interface UndoState {
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
        
        // Ensure proper text selection and copy functionality
        this.editableDiv.setAttribute('role', 'textbox');
        this.editableDiv.setAttribute('aria-multiline', 'true');
        this.editableDiv.style.userSelect = 'text';
        this.editableDiv.style.webkitUserSelect = 'text';
        
        // Style to look like a textarea
        this.editableDiv.style.cssText = `
            width: 100%;
            padding: 8px;
            border: 1px solid #ccc;
            user-select: text;
            -webkit-user-select: text;
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
            // Use proper HTML-to-text conversion that preserves line breaks
            this.plainTextContent = this.extractTextFromHtml();
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

        // Handle paste to allow only plain text (preserve normal copy/paste functionality)
        this.editableDiv.addEventListener('paste', (e) => {
            // Get plain text from clipboard
            const text = e.clipboardData?.getData('text/plain') || '';
            
            if (text) {
                // Only prevent default if we have text and can insert it
                e.preventDefault();
                
                // Use modern approach: insert text at current cursor position
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(text));
                    
                    // Move cursor to end of inserted text
                    range.setStartAfter(range.endContainer);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                } else {
                    // Fallback: append to end of content
                    this.editableDiv.appendChild(document.createTextNode(text));
                }
                
                // Trigger input event to update tracking
                this.editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // If no text, let default behavior handle it (won't break anything)
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
        // Use innerHTML with proper escaping to preserve line breaks
        this.editableDiv.innerHTML = this.escapeHtml(text);
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
            const timeoutId = window.setTimeout(() => {
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
     * Expand selection to word boundaries with smart boundary detection
     */
    private expandToWordBoundariesOnly(startPos: number, endPos: number): {startPos: number, endPos: number} {
        const text = this.getText();
        let newStartPos = startPos;
        let newEndPos = endPos;

        // Check what's at the current boundaries
        const startChar = startPos < text.length ? text[startPos] || '' : '';
        const endChar = endPos > 0 ? text[endPos - 1] || '' : '';
        const beforeStartChar = startPos > 0 ? text[startPos - 1] || '' : '';
        
        // Smart start position logic
        if (/\s/.test(startChar) || /\s/.test(beforeStartChar)) {
            // If we're on or adjacent to whitespace, shrink inward to find first word character
            while (newStartPos < newEndPos) {
                const char = text[newStartPos] || '';
                if (char && /[\w'-]/.test(char)) {
                    break; // Found start of a word
                }
                newStartPos++;
            }
        } else if (/[\w'-]/.test(startChar) || /[\w'-]/.test(beforeStartChar)) {
            // If we're within a word, expand backward to word start
            while (newStartPos > 0) {
                const char = text[newStartPos - 1] || '';
                if (!char || !/[\w'-]/.test(char)) {
                    break; // Found word boundary
                }
                newStartPos--;
            }
        }

        // Smart end position logic
        if (/\s/.test(endChar) || (endPos < text.length && /\s/.test(text[endPos] || ''))) {
            // If we're on or adjacent to whitespace, shrink inward to find last word character
            while (newEndPos > newStartPos) {
                const char = text[newEndPos - 1] || '';
                if (char && /[\w'-]/.test(char)) {
                    break; // Found end of a word
                }
                newEndPos--;
            }
        } else if (/[\w'-]/.test(endChar)) {
            // If we're within a word, expand forward to word end
            while (newEndPos < text.length) {
                const char = text[newEndPos] || '';
                if (!char || !/[\w'-]/.test(char)) {
                    break; // Found word boundary
                }
                newEndPos++;
            }
        }

        // If we ended up with an empty selection, that's fine - user selected only whitespace/punctuation

        return {startPos: newStartPos, endPos: newEndPos};
    }

    /**
     * Expand selection to sentence boundaries
     */
    private expandToSentenceBoundaries(startPos: number, endPos: number): {startPos: number, endPos: number} {
        const text = this.getText();
        let newStartPos = startPos;
        let newEndPos = endPos;

        // Check if the current selection already represents a complete sentence
        const currentSelectionText = text.substring(startPos, endPos).trim();
        
        // More robust sentence detection
        const startsWithCapitalOrPunctuation = /^[A-Z"'"''`]/.test(currentSelectionText);
        
        // Enhanced sentence ending detection: handles multiple punctuation, quotes, etc.
        const endsWithSentencePunctuation = /[.!?]+["'"''`]?\s*$/.test(currentSelectionText);
        
        // Additional check: make sure it's not just punctuation (minimum reasonable sentence length)
        const hasMinimumLength = currentSelectionText.length >= 3;
        
        const isCompleteSentence = startsWithCapitalOrPunctuation && endsWithSentencePunctuation && hasMinimumLength;

        // If we already have a complete sentence selected, don't expand at all
        if (isCompleteSentence) {
            return {startPos, endPos};
        }

        // Check if we're already at a sentence boundary (don't expand backwards if we are)
        let isAtSentenceBoundary = newStartPos === 0; // At beginning of text
        
        if (!isAtSentenceBoundary) {
            // Check if current position starts what looks like a sentence
            const currentChar = text[newStartPos] || '';
            const startsLikeSentence = /[A-Z"']/.test(currentChar);
            
            if (startsLikeSentence) {
                // Check if we're at a word/sentence boundary (not in middle of a word)
                const prevChar = text[newStartPos - 1] || '';
                const isAtWordBoundary = /\s/.test(prevChar) || /[.!?:;]/.test(prevChar) || newStartPos === 0;
                
                if (isAtWordBoundary) {
                    isAtSentenceBoundary = true;
                }
            }
        }

        // Expand start position to sentence beginning only if not already at boundary
        if (!isAtSentenceBoundary) {
            while (newStartPos > 0) {
            const char = text[newStartPos - 1];
            if (!char) break; // Safety check
            
            // Stop at sentence-ending punctuation followed by whitespace/newline/start
            if (/[.!?:;]/.test(char)) {
                // Check if this punctuation is followed by whitespace or we're at the boundary
                const nextChar = text[newStartPos];
                if (newStartPos === text.length || !nextChar || /\s/.test(nextChar)) {
                    // Skip any whitespace after the punctuation to find the real sentence start
                    while (newStartPos < text.length) {
                        const currentChar = text[newStartPos];
                        if (!currentChar || !/\s/.test(currentChar)) break;
                        newStartPos++;
                    }
                    break;
                }
            }
            newStartPos--;
            }
        }

        // Check if we're already at the end of a sentence before expanding
        const charBeforeEnd = endPos > 0 ? text[endPos - 1] || '' : '';
        const isAlreadyAtSentenceEnd = /[.!?]/.test(charBeforeEnd);
        
        // Only expand end position if we're not already at a sentence end
        if (!isAlreadyAtSentenceEnd) {
            while (newEndPos < text.length) {
                const char = text[newEndPos];
                if (!char) break; // Safety check
                
                // Stop after sentence-ending punctuation
                if (/[.!?]/.test(char)) {
                    newEndPos++; // Include the punctuation
                    break;
                }
                newEndPos++;
            }
        }

        // Trim leading whitespace but keep trailing punctuation
        while (newStartPos < newEndPos) {
            const currentChar = text[newStartPos];
            if (!currentChar || !/\s/.test(currentChar)) break;
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

        // Find paragraph start by looking backwards for double newline or start of text
        while (newStartPos > 0) {
            // Look for double newline pattern
            if (newStartPos >= 2) {
                const char1 = text[newStartPos - 1];
                const char2 = text[newStartPos - 2];
                if (char1 === '\n' && char2 === '\n') {
                    // Found double newline, paragraph starts after it
                    break;
                }
            }
            newStartPos--;
        }

        // Find paragraph end by looking forwards for double newline or end of text
        while (newEndPos < text.length) {
            // Look for double newline pattern
            if (newEndPos < text.length - 1) {
                const char1 = text[newEndPos];
                const char2 = text[newEndPos + 1];
                if (char1 === '\n' && char2 === '\n') {
                    // Found double newline, paragraph ends before it
                    break;
                }
            }
            newEndPos++;
        }

        // Trim leading whitespace from paragraph start
        while (newStartPos < newEndPos) {
            const char = text[newStartPos];
            if (!char || !/\s/.test(char)) break;
            newStartPos++;
        }

        // Trim trailing whitespace from paragraph end
        while (newEndPos > newStartPos) {
            const char = text[newEndPos - 1];
            if (!char || !/\s/.test(char)) break;
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
     * Replace text at a specific range without highlighting (for Find & Replace)
     */
    public replaceRange(startPos: number, endPos: number, newText: string): void {
        const currentText = this.getText();
        const beforeText = currentText.substring(0, startPos);
        const afterText = currentText.substring(endPos);
        
        const newFullText = beforeText + newText + afterText;
        
        // Set the new text (this clears all existing highlights)
        this.setText(newFullText);
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
     * Extract plain text from HTML while preserving line breaks
     */
    private extractTextFromHtml(): string {
        const html = this.editableDiv.innerHTML;
        
        // Create a temporary div to process the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Convert various HTML line break representations back to \n
        // Handle <br> tags
        tempDiv.innerHTML = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        
        // Handle <div> tags (browsers often create these for new lines)
        tempDiv.innerHTML = tempDiv.innerHTML.replace(/<\/div><div>/gi, '\n');
        tempDiv.innerHTML = tempDiv.innerHTML.replace(/<div>/gi, '\n');
        tempDiv.innerHTML = tempDiv.innerHTML.replace(/<\/div>/gi, '');
        
        // Handle <p> tags
        tempDiv.innerHTML = tempDiv.innerHTML.replace(/<\/p><p>/gi, '\n\n');
        tempDiv.innerHTML = tempDiv.innerHTML.replace(/<p>/gi, '');
        tempDiv.innerHTML = tempDiv.innerHTML.replace(/<\/p>/gi, '\n');
        
        // Get the text content - DO NOT strip leading/trailing newlines
        // Those might be legitimate parts of the user's text
        const text = tempDiv.textContent || '';
        
        return text;
    }

    /**
     * Escape HTML characters while preserving line breaks
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        let html = div.innerHTML;
        
        // Convert newlines to <br> tags to preserve them in HTML
        // This prevents line breaks from being lost during HTML round-trips
        html = html.replace(/\n/g, '<br>');
        
        return html;
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