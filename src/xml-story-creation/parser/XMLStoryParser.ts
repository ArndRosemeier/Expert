/**
 * XML Story Parser
 * 
 * Parses AI responses to extract XML story elements, system commands,
 * and handles highlighting for new/updated elements.
 */

import type {
    StoryElement,
    StoryElementType,
    ParsedResponse,
    SystemCommand,
    ParseError,
    ElementID
} from '../types/XMLStoryTypes';
import { XML_TAG_DEFINITIONS } from '../types/XMLStoryTypes';


/**
 * Main XML parser for story creation system
 */
export class XMLStoryParser {
    private existingElements: Map<ElementID, StoryElement> = new Map();
    
    constructor() {
    }
    
    /**
     * Parse an AI response to extract XML elements and system commands
     */
    public parseResponse(
        aiResponse: string, 
        existingElements?: Map<ElementID, StoryElement>
    ): ParsedResponse {
        if (existingElements) {
            this.existingElements = existingElements;
        }
        
        const result: ParsedResponse = {
            cleanedText: '',
            extractedElements: [],
            systemCommands: [],
            errors: []
        };
        
        // First, clear previous AI highlights
        this.clearPreviousAIHighlights();
        
        // Extract system commands first
        result.systemCommands = this.extractSystemCommands(aiResponse);
        
        // Extract story elements
        const { elements, errors, cleanedText } = this.extractStoryElements(aiResponse, existingElements || new Map());
        result.extractedElements = elements;
        result.errors = errors;
        result.cleanedText = cleanedText;
        
        // Mark new elements and updates for highlighting
        this.markElementsForHighlighting(result.extractedElements);
        
        return result;
    }
    
    /**
     * Extract system commands like </refresh>
     */
    private extractSystemCommands(text: string): SystemCommand[] {
        const commands: SystemCommand[] = [];
        const systemCommandRegex = /<\/(refresh|edit|delete|rename)(?:\s+([^>]*))?\s*>/gi;
        
        let match;
        while ((match = systemCommandRegex.exec(text)) !== null) {
            if (!match[1]) continue;
            
            const commandType = match[1].toLowerCase() as SystemCommand['type'];
            const parametersText = match[2] ?? '';
            
            const command: SystemCommand = {
                type: commandType,
                timestamp: new Date()
            };
            
            // Parse parameters if present
            if (parametersText.trim()) {
                command.parameters = this.parseCommandParameters(parametersText);
            }
            
            commands.push(command);
        }
        
        return commands;
    }
    
    /**
     * Extract story elements from XML tags using browser's native DOMParser
     */
    private extractStoryElements(text: string, existingElements: Map<string, StoryElement>): {
        elements: StoryElement[],
        errors: ParseError[],
        cleanedText: string
    } {
        const elements: StoryElement[] = [];
        const errors: ParseError[] = [];
        let cleanedText = text;

        // Find all XML-like tags in the text
        const xmlTagRegex = /<(outline|context)(\s[^>]*?)?\s*\/?>/gi;
        const matches = Array.from(text.matchAll(xmlTagRegex));

        console.log(`🔍 Found ${matches.length} XML tags to parse:`, matches.map(m => m[0]));

        for (const match of matches) {
            const fullMatch = match[0];
            if (!match[1]) continue;
            const tagName = match[1].toLowerCase();

            try {
                // Create a valid XML document for parsing
                const xmlString = `<root>${fullMatch}</root>`;
                const parser = new DOMParser();
                const doc = parser.parseFromString(xmlString, 'text/xml');
                
                // Check for parsing errors
                const parserError = doc.querySelector('parsererror');
                if (parserError) {
                    throw new Error(`XML parsing error: ${parserError.textContent}`);
                }

                const xmlElement = doc.querySelector(tagName);
                if (!xmlElement) {
                    throw new Error(`Failed to find ${tagName} element`);
                }

                // Extract attributes using proper DOM methods
                const attributes: Record<string, string> = {};
                for (const attr of Array.from(xmlElement.attributes)) {
                    attributes[attr.name] = attr.value;
                }

                console.log(`✅ Parsed ${tagName} with attributes:`, attributes);

                // Find tag definition
                const tagDef = XML_TAG_DEFINITIONS.find(def => def.tagName === tagName);
                if (!tagDef) {
                    throw new Error(`Unknown tag type: ${tagName}`);
                }

                // Validate required attributes
                for (const required of tagDef.requiredAttributes) {
                    if (!attributes[required]) {
                        throw new Error(`Missing required attribute: ${required} in ${tagName} tag`);
                    }
                }

                // Create story element
                const element = this.createElementFromAttributes(
                    tagDef.elementType,
                    attributes,
                    fullMatch,
                    existingElements
                );

                if (element) {
                    elements.push(element);
                    console.log(`🎯 Created element:`, element.id, element.description);
                }

                // Remove the tag from cleaned text
                cleanedText = cleanedText.replace(fullMatch, '');

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                errors.push({
                    type: 'malformed_xml',
                    message: `Invalid ${tagName} tag: ${errorMsg}`,
                    sourceText: fullMatch
                });
                console.error(`❌ XML parsing error for "${fullMatch}":`, errorMsg);
            }
        }

        // Remove any remaining system commands from cleaned text
        cleanedText = cleanedText.replace(/<\/(refresh|edit|delete|rename)(?:\s+[^>]*)?\s*>/gi, '');

        console.log(`📊 Extraction complete: ${elements.length} elements, ${errors.length} errors`);
        
        return { elements, errors, cleanedText: cleanedText.trim() };
    }
    
    /**
     * Parse XML attributes from attribute string
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars

    
    /**
     * Create story element from attributes (for self-closing tags)
     */
    private createElementFromAttributes(
        type: StoryElementType,
        attributes: Record<string, string>,
        sourceText: string,
        existingElements: Map<string, StoryElement>
    ): (StoryElement & { insertPosition?: number }) | null {
        // Validate required attributes
        const tagDef = XML_TAG_DEFINITIONS.find(def => def.elementType === type);
        if (tagDef === undefined) {
            throw new Error(`No tag definition found for type: ${type}`);
        }
        
        for (const required of tagDef.requiredAttributes) {
            if (!attributes[required]) {
                throw new Error(`Missing required attribute: ${required}`);
            }
        }
        
        // Check if this is an update to existing element
        const id = attributes['id'];
        const existingElement = id ? existingElements.get(id) : null;
        
        if (existingElement) {
            // Update existing element
            return this.updateExistingElement(existingElement, attributes, sourceText);
        } else {
            // Create new element
            return this.createNewElement(type, attributes, sourceText, existingElements);
        }
    }
    
    /**
     * Create story element from content (for content tags)
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars

    
    /**
     * Create a new story element
     */
    private createNewElement(
        type: StoryElementType,
        attributes: Record<string, string>,
        sourceText: string,
        _existingElements: Map<string, StoryElement>
    ): StoryElement & { insertPosition?: number } {
        const id = attributes['id'];
        const description = attributes['description'];
        
        if (!id) {
            throw new Error('ID is required for all story elements');
        }
        if (!description) {
            throw new Error('Description is required for all story elements');
        }

        const now = new Date();
        const element: StoryElement & { insertPosition?: number } = {
            id: id,
            type,
            description: description,
            timestamp: now,
            lastModified: now,
            sourceText,
            isHumanEdited: false,
            editHistory: [],
            isNewFromAI: true,
            isUpdatedByAI: false,
            highlightUntilNext: true
        };

        // Parse position attribute if provided
        const positionStr = attributes['position'];
        if (positionStr) {
            const position = parseInt(positionStr, 10);
            if (!isNaN(position) && position > 0) {
                element.insertPosition = position;
                console.log(`🎯 Element ${id} will be inserted at position ${position}`);
            } else {
                console.warn(`⚠️ Invalid position attribute "${positionStr}" for element ${id}, ignoring`);
            }
        }
        
        // Add creation record to edit history
        element.editHistory.push({
            timestamp: now,
            type: 'creation',
            changes: {
                description: { from: '', to: description }
            }
        });
        
        return element;
    }
    
    /**
     * Update an existing story element
     */
    private updateExistingElement(
        existingElement: StoryElement,
        attributes: Record<string, string>,
        sourceText: string
    ): StoryElement {
        const updatedElement: StoryElement = { ...existingElement };
        let hasChanges = false;
        
        // Check for description changes
        const newDescription = attributes['description'];
        if (newDescription && newDescription !== existingElement.description) {
            updatedElement.editHistory.push({
                timestamp: new Date(),
                type: 'ai_edit',
                changes: {
                    description: { from: existingElement.description, to: newDescription }
                }
            });
            updatedElement.description = newDescription;
            hasChanges = true;
        }
        
        // Note: Position is now determined by order in the list
        
        if (hasChanges) {
            updatedElement.isUpdatedByAI = true;
            updatedElement.isNewFromAI = false;
            updatedElement.highlightUntilNext = true;
            updatedElement.sourceText = sourceText;
            
            // Clear human edit flag since AI has now addressed the element
            updatedElement.isHumanEdited = false;
        }
        
        return updatedElement;
    }
    

    
    /**
     * Clear previous AI highlights
     */
    private clearPreviousAIHighlights(): void {
        for (const element of this.existingElements.values()) {
            element.isNewFromAI = false;
            element.isUpdatedByAI = false;
            element.highlightUntilNext = false;
        }
    }
    
    /**
     * Mark elements for highlighting
     */
    private markElementsForHighlighting(elements: StoryElement[]): void {
        elements.forEach(element => {
            element.highlightUntilNext = true;
        });
    }
    
    /**
     * Parse command parameters
     */
    private parseCommandParameters(parametersText: string): Record<string, string> {
        const parameters: Record<string, string> = {};
        
        // Simple key=value parsing
        const paramRegex = /(\w+)=["']([^"']*?)["']/g;
        let match;
        
        while ((match = paramRegex.exec(parametersText)) !== null) {
            if (match[1] && match[2] !== undefined) {
                parameters[match[1]] = match[2];
            }
        }
        
        return parameters;
    }
    

    
    /**
     * Get parsing statistics
     */
    public getParsingStats(): {
        totalElementsParsed: number;
        elementsByType: Record<StoryElementType, number>;
        errorsEncountered: number;
        lastParseTime: Date | null;
    } {
        // This would be implemented to track parsing statistics
        return {
            totalElementsParsed: 0,
            elementsByType: {} as Record<StoryElementType, number>,
            errorsEncountered: 0,
            lastParseTime: null
        };
    }
}

/**
 * Utility function to create a parser instance
 */
export function createXMLStoryParser(): XMLStoryParser {
    return new XMLStoryParser();
} 