/**
 * Shared utility functions for modal operations
 */

/**
 * Converts plain text content to HTML by escaping special characters and converting line breaks
 */
export function formatContentAsHtml(content: string): string {
    return escapeHtml(content).replace(/\n/g, '<br>');
}

/**
 * Escapes HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escapes text for safe use in HTML attributes
 */
export function escapeHtmlAttribute(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Sanitizes a filename by replacing invalid characters with underscores
 */
export function sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}

/**
 * Formats a timestamp for display
 */
export function formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return timestamp.toLocaleDateString();
}

/**
 * Truncates text to a specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;

    // Reserve space for ellipsis
    const limit = Math.max(0, maxLength - 3);
    const slice = text.substring(0, limit);

    // Find last word boundary within the slice
    const lastSpace = slice.lastIndexOf(' ');
    const cutIndex = lastSpace > 0 ? lastSpace : limit;

    return slice.substring(0, cutIndex).replace(/[\s\.,;:!\-]+$/,'') + '...';
}

/**
 * Auto-resizes a textarea to fit its content
 */
export function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

/**
 * Creates a DOM element with specified tag, classes, and content
 */
export function createElement<T extends keyof HTMLElementTagNameMap>(
    tag: T,
    options: {
        classes?: string[];
        attributes?: Record<string, string>;
        content?: string;
        innerHTML?: string;
    } = {}
): HTMLElementTagNameMap[T] {
    const element = document.createElement(tag);
    
    if (options.classes) {
        element.classList.add(...options.classes);
    }
    
    if (options.attributes) {
        Object.entries(options.attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
    }
    
    if (options.content) {
        element.textContent = options.content;
    }
    
    if (options.innerHTML) {
        element.innerHTML = options.innerHTML;
    }
    
    return element;
}

/**
 * Adds event listener with cleanup tracking
 */
export function addEventListenerWithCleanup(
    element: Element,
    event: string,
    handler: EventListener,
    cleanupArray: (() => void)[]
): void {
    element.addEventListener(event, handler);
    cleanupArray.push(() => { element.removeEventListener(event, handler); });
}

/**
 * Attaches standard close handlers to a modal overlay.
 * Handles both escape key press and clicking outside the modal.
 * Returns a cleanup function to remove all event listeners.
 * 
 * @param modalOverlay - The overlay element that serves as the modal backdrop
 * @param onClose - Callback function to execute when modal should close
 * @returns Cleanup function to remove event listeners
 * 
 * @example
 * ```typescript
 * const cleanup = attachModalCloseHandlers(modalOverlay, () => {
 *   document.body.removeChild(modalOverlay);
 * });
 * 
 * // Later, if needed:
 * cleanup();
 * ```
 */
export function attachModalCloseHandlers(
    modalOverlay: HTMLElement,
    onClose: () => void
): () => void {
    const clickHandler = (e: MouseEvent): void => {
        if (e.target === modalOverlay) {
            onClose();
        }
    };
    
    const escapeHandler = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            onClose();
            cleanup();
        }
    };
    
    modalOverlay.addEventListener('click', clickHandler);
    document.addEventListener('keydown', escapeHandler);
    
    const cleanup = (): void => {
        modalOverlay.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', escapeHandler);
    };
    
    return cleanup;
}

/**
 * Common modal styling constants
 */
export const MODAL_STYLES = {
    overlay: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 15000;
    `,
    content: `
        background-color: white;
        padding: 2.5rem;
        border-radius: 12px;
        max-width: 80vw;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
    `,
    button: `
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    `,
    primaryButton: `
        background-color: var(--primary-500);
        color: white;
    `,
    secondaryButton: `
        background-color: var(--secondary-600);
        color: white;
    `,
    outlineButton: `
        border: 1px solid #d1d5db;
        background: transparent;
        color: #6b7280;
    `
} as const; 
/**
 * Render the "previous instructions" history list shared by the idea-board
 * TransformModal and the TextTransformModal.
 *
 * Both modals carried a byte-identical private `renderHistoryItems()`. The only
 * difference between them was *whose* history was rendered, so that becomes a
 * parameter (owner dedup rule: almost-duplicate -> parameterize, do not fork).
 *
 * @param history Instructions, oldest first. Rendered newest first.
 */
export function renderHistoryItems(history: string[]): string {
    if (history.length === 0) {
        return '<div class="history-empty">No previous instructions</div>';
    }

    return history
        .slice() // Create a copy
        .reverse() // Show most recent first
        .map((instruction, index) => `
        <div class="history-item" data-instruction="${escapeHtmlAttribute(instruction)}" title="Click to use this instruction">
          <div class="history-item-content">
            ${escapeHtml(instruction)}
          </div>
          <button class="history-item-delete" data-delete-index="${history.length - 1 - index}" title="Remove this instruction">
            ×
          </button>
        </div>
      `)
        .join('');
}
