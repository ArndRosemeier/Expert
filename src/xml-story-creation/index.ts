/**
 * XML Story Creation System
 *
 * Main entry point for the XML-enabled collaborative story creation feature.
 * This module provides a complete system for parsing AI responses with embedded
 * XML tags, managing story elements on a visual whiteboard, and handling
 * bidirectional collaboration between humans and AI.
 */
// Core Types
export type { XMLStoryEvent } from "./types/XMLStoryTypes";
import { createXMLStoryService } from './services/XMLStoryService';
import { createXMLStoryParser } from './parser/XMLStoryParser';

/**
 * Create a complete XML Story Creation system instance
 * 
 * This is a convenience function that creates and configures all the necessary
 * components for the XML story creation system.
 */
export function createXMLStorySystem(config?: Partial<import('./types/XMLStoryTypes').XMLStoryConfig>) {
    const service = createXMLStoryService(config);
    const parser = createXMLStoryParser();
    
    return {
        service,
        parser,
        
        // Convenience methods
        processAIResponse: (response: string) => service.processAIResponse(response),
        handleHumanEdit: (elementId: string, value: string) => 
            service.handleHumanEdit(elementId, value),
        clearHighlights: () => service.clearAIHighlights(),
        getWhiteboardState: () => service.getWhiteboardState(),
        getPendingEdits: () => service.getPendingHumanEdits(),
        
        // Event handling
        addEventListener: (callback: import('./services/XMLStoryService').XMLStoryEventCallback) => 
            service.addEventListener(callback),
        removeEventListener: (callback: import('./services/XMLStoryService').XMLStoryEventCallback) => 
            service.removeEventListener(callback),
        
        // State management
        exportState: () => service.exportState(),
        importState: (state: Record<string, unknown>) => service.importState(state),
        reset: () => service.reset()
    };
}

/**
 * Default XML tag examples for documentation and testing
 */
export const XML_TAG_EXAMPLES = {
    outline: `<outline id="discovery" description="Elara discovers her brother's journal with cryptic map references" />`,
    context: `<context id="elara" description="Elara: A skilled cartographer seeking her missing brother" />`,
    refresh: `</refresh>`,
    edit: `<edit id="elara">Updated character description</edit>`,
    delete: `<delete id="discovery" />`
};

/**
 * Validation utilities
 */
export const XMLStoryValidation = {
    /**
     * Validate that a string contains valid XML story tags
     */
    validateXMLTags: (text: string): { isValid: boolean; errors: string[] } => {
        const errors: string[] = [];
        
        // Check for basic XML structure
        const xmlTagRegex = /<(\/?)(outline|context|refresh|edit|delete|rename)(\s+[^>]*)?>/g;
        const matches = text.match(xmlTagRegex);
        
        if (!matches) {
            return { isValid: true, errors: [] }; // No XML tags is valid
        }
        
        // Basic validation - could be expanded
        matches.forEach(match => {
            if (!match.includes('="') && !match.includes("='") && !match.includes('/>') && !match.includes('</')) {
                errors.push(`Malformed XML tag: ${match}`);
            }
        });
        
        return {
            isValid: errors.length === 0,
            errors
        };
    },
    
    /**
     * Extract all XML tags from text for preview
     */
    extractTags: (text: string): string[] => {
        const xmlTagRegex = /<(?:outline|context|refresh|edit|delete|rename)(?:\s+[^>]*)?(?:\/>|>[^<]*<\/(?:outline|context|refresh|edit|delete|rename)>)/g;
        return text.match(xmlTagRegex) || [];
    }
};

 