/**
 * Centralized text formatting utilities for preserving paragraphs and formatting across the application
 */

/**
 * Escape HTML characters in text
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}



/**
 * Format content for plain text display while preserving structure
 * Uses CSS white-space: pre-wrap for natural paragraph preservation
 * @param content - The plain text content to format
 * @returns Content ready for display with CSS white-space: pre-wrap
 */
export function formatContentForPreWrap(content: string): string {
    if (!content?.trim()) {
        return '';
    }
    
    // Trim leading/trailing whitespace and escape HTML
    return escapeHtml(content.trim());
}


 