/**
 * XML Story Creation System
 * 
 * Main entry point for the XML-enabled collaborative story creation feature.
 * This module provides a complete system for parsing AI responses with embedded
 * XML tags, managing story elements on a visual whiteboard, and handling
 * bidirectional collaboration between humans and AI.
 */

// Core Types
export type {
    StoryElement,
    StoryElementType,
    ParsedResponse,
    SystemCommand,
    ParseError,
    HumanEdit,
    EditableFieldState,
    HighlightType,
    ElementHighlight,
    HighlightState,
    WhiteboardState,
    WhiteboardContext,
    ContextRefreshOptions,
    AIFeedbackMessage,
    HumanEditSummary,
    XMLTagDefinition,
    AIEditCommand,
    RelationshipElement,
    XMLStoryEvent,
    ElementCreatedEvent,
    ElementUpdatedEvent,
    HumanEditEvent,
    XMLStoryConfig,
    ElementID,
    ElementTypeFilter,
    ElementMap,
    HighlightMap,
    EditRecord
} from './types/XMLStoryTypes';

// Constants and Configurations
export {
    XML_TAG_DEFINITIONS,
    DEFAULT_XML_STORY_CONFIG,
    isStoryElement,
    isHumanEdit,
    isSystemCommand
} from './types/XMLStoryTypes';

// Core Services
export { XMLStoryService, createXMLStoryService } from './services/XMLStoryService';
export type { XMLStoryEventCallback } from './services/XMLStoryService';
import { createXMLStoryService } from './services/XMLStoryService';

export { ElementIDGenerator, createIDGenerator, generateElementId } from './services/ElementIDGenerator';


// Parser
export { XMLStoryParser, createXMLStoryParser } from './parser/XMLStoryParser';
import { createXMLStoryParser } from './parser/XMLStoryParser';

// Re-export commonly used types for convenience
export type XMLStoryServiceType = import('./services/XMLStoryService').XMLStoryService;
export type XMLStoryParserType = import('./parser/XMLStoryParser').XMLStoryParser;
export type ElementIDGeneratorType = import('./services/ElementIDGenerator').ElementIDGenerator;

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

/**
 * Helper function to create example story elements for testing/demo
 */
export function createExampleStoryElements(): import('./types/XMLStoryTypes').StoryElement[] {
    const now = new Date();
    
    return [
        {
            id: 'discovery',
            type: 'outline',
            description: 'Elara discovers her brother\'s journal with cryptic map references',
            timestamp: now,
            sourceText: XML_TAG_EXAMPLES.outline,
            lastModified: now,
            position: 1,
            isHumanEdited: false,
            editHistory: [],
            isNewFromAI: true,
            isUpdatedByAI: false,
            highlightUntilNext: true
        },
        {
            id: 'elara',
            type: 'context',
            description: 'Elara: A skilled cartographer seeking her missing brother',
            timestamp: now,
            sourceText: XML_TAG_EXAMPLES.context,
            lastModified: now,
            isHumanEdited: false,
            editHistory: [],
            isNewFromAI: true,
            isUpdatedByAI: false,
            highlightUntilNext: true
        },
        {
            id: 'neo_venice',
            type: 'context',
            description: 'Neo-Venice: A cyberpunk city built on the ruins of Venice',
            timestamp: now,
            sourceText: `<context id="neo_venice" description="Neo-Venice: A cyberpunk city built on the ruins of Venice" />`,
            lastModified: now,
            isHumanEdited: false,
            editHistory: [],
            isNewFromAI: true,
            isUpdatedByAI: false,
            highlightUntilNext: true
        }
    ];
}

/**
 * Version information
 */
export const XML_STORY_VERSION = {
    major: 1,
    minor: 0,
    patch: 0,
    name: 'Collaborative Canvas'
};

// Default export for convenience
export default {
    createXMLStorySystem,
    XML_TAG_EXAMPLES,
    XMLStoryValidation,
    createExampleStoryElements,
    XML_STORY_VERSION
}; 