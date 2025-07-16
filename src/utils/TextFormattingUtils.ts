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
 * Format plain text content for HTML display while preserving paragraph breaks
 * Converts double line breaks to proper paragraph separation
 * @param content - The plain text content to format
 * @returns HTML-formatted content with proper paragraph preservation
 */
export function formatContentForDisplay(content: string): string {
    if (!content || !content.trim()) {
        return '';
    }

    // Split by double newlines (paragraph breaks) and filter out empty strings
    const paragraphs = content
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
    
    // If only one paragraph, wrap in div to preserve line breaks within
    if (paragraphs.length === 1) {
        return `<div style="white-space: pre-wrap;">${escapeHtml(paragraphs[0]!)}</div>`;
    }
    
    // Multiple paragraphs - wrap each in proper paragraph tags
    return paragraphs
        .map(p => `<p style="margin-bottom: 1em; line-height: 1.5;">${escapeHtml(p)}</p>`)
        .join('');
}

/**
 * Format content for EPUB/export while preserving paragraphs
 * @param content - The plain text content to format
 * @returns HTML content formatted for export
 */
export function formatContentForExport(content: string): string {
    if (!content || !content.trim()) {
        return '';
    }

    const paragraphs = content
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
    
    return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');
}

/**
 * Format content for plain text display while preserving structure
 * Uses CSS white-space: pre-wrap for natural paragraph preservation
 * @param content - The plain text content to format
 * @returns Content ready for display with CSS white-space: pre-wrap
 */
export function formatContentForPreWrap(content: string): string {
    if (!content || !content.trim()) {
        return '';
    }
    
    // Trim leading/trailing whitespace and escape HTML
    return escapeHtml(content.trim());
}

/**
 * Get the appropriate CSS class for content display containers
 */
export function getContentDisplayClass(): string {
    return 'formatted-content-display';
}

/**
 * Get the CSS styles for content display containers
 */
export function getContentDisplayStyles(): string {
    return `
        .formatted-content-display {
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
        }
        
        .formatted-content-display p {
            margin-bottom: 1em;
        }
        
        .formatted-content-display p:last-child {
            margin-bottom: 0;
        }
    `;
} 