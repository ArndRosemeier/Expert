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
        
        // Extract system commands first (this also creates markers in the text)
        const { commands, textWithMarkers } = this.extractSystemCommands(aiResponse);
        result.systemCommands = commands;

        
        // Extract story elements (use the text with markers to preserve command positions)
        const { elements, errors, cleanedText } = this.extractStoryElements(textWithMarkers, existingElements || new Map());
        result.extractedElements = elements;
        result.errors = errors;
        result.cleanedText = cleanedText;
        
        // Convert newly created/updated elements into synthetic system commands for chat echo
        // so ALL executed actions are visible in the chat as XML.
        elements.forEach(el => {
            if (el.type === 'context') {
                // Determine if element is new or updated relative to existingElements
                const previous = existingElements?.get(el.id);
                if (!previous) {
                    // New context element → echo as a context XML command
                    const syntheticEdit: SystemCommand = {
                        type: 'edit',
                        parameters: { id: el.id },
                        content: el.description,
                        timestamp: new Date()
                    };
                    // Leave no marker so it displays in insertion order near where the model placed it (subsequent display layer will render in-stream)
                    commands.push(syntheticEdit);
                } else if (previous && previous.description !== el.description) {
                    // Updated context element → echo as edit
                    const syntheticEdit: SystemCommand = {
                        type: 'edit',
                        parameters: { id: el.id },
                        content: el.description,
                        timestamp: new Date()
                    };
                    commands.push(syntheticEdit);
                }
            }
        });
        
        // Mark new elements and updates for highlighting
        this.markElementsForHighlighting(result.extractedElements);
        
        return result;
    }
    
    /**
     * Extract system commands like </refresh> and </outline_replace>
     * Also replaces them with markers for in-place highlighting
     */
    private extractSystemCommands(text: string): { commands: SystemCommand[], textWithMarkers: string } {
        const commands: SystemCommand[] = [];
        let textWithMarkers = text;
        let markerIndex = 0;
        
        // Handle outline_replace commands (with content between tags)
        const outlineReplaceRegex = /<\/outline_replace>\s*([\s\S]*?)\s*<\/outline_replace>/gi;
        let outlineMatch;
        while ((outlineMatch = outlineReplaceRegex.exec(textWithMarkers)) !== null) {
            const content = outlineMatch[1] || '';
            const markerId = `__XML_CMD_${markerIndex++}__`;
            
            commands.push({
                type: 'outline_replace',
                content: content.trim(),
                timestamp: new Date(),
                markerId
            });
            
            // Replace the command with a marker
            textWithMarkers = textWithMarkers.replace(outlineMatch[0], markerId);
        }
        
        // Handle edit commands with content between tags (support both </edit ...> and <edit ...>)
        const editOpenTagRegex = /<edit\s+([^>]*?)>\s*([\s\S]*?)\s*<\/edit>/gi;
        textWithMarkers = textWithMarkers.replace(editOpenTagRegex, (_match, parametersText, content) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            
            const command: SystemCommand = {
                type: 'edit',
                content: content.trim(),
                timestamp: new Date(),
                markerId
            };
            
            // Parse parameters (like id="element_id")
            if (parametersText.trim()) {
                command.parameters = this.parseCommandParameters(parametersText);
            }
            
            commands.push(command);
            return markerId;
        });
        // Handle closing-form edits: </edit ...>CONTENT</edit>
        const editCommandRegex = /<\/edit\s+([^>]*?)>\s*([\s\S]*?)\s*<\/edit>/gi;
        textWithMarkers = textWithMarkers.replace(editCommandRegex, (_match, parametersText, content) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            
            const command: SystemCommand = {
                type: 'edit',
                content: content.trim(),
                timestamp: new Date(),
                markerId
            };
            
            if (parametersText.trim()) {
                command.parameters = this.parseCommandParameters(parametersText);
            }
            
            commands.push(command);
            return markerId;
        });

        // Enforce correct edit syntax only: require paired closing tag in either form above
        
        // Handle append commands
        const appendCommandRegex = /<append>\s*([\s\S]*?)\s*<\/append>/gi;
        textWithMarkers = textWithMarkers.replace(appendCommandRegex, (_match, content) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            
            commands.push({
                type: 'append',
                content: content.trim(),
                timestamp: new Date(),
                markerId
            });
            
            return markerId;
        });
        

        
        // Handle simple closing-form commands (refresh, delete, rename)
        const simpleCommandRegex = /<\/(refresh|delete|rename)(?:\s+[^>]*)?\s*>/gi;
        textWithMarkers = textWithMarkers.replace(simpleCommandRegex, (_match, commandType) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            
            commands.push({
                type: commandType as 'refresh' | 'delete' | 'rename',
                timestamp: new Date(),
                markerId
            });
            
            return markerId;
        });

        // Enforce correct simple command syntax only
        // Self-closing variants allowed: <refresh/> <delete id="..."/> <rename id="..."/>
        const selfClosingCmdRegex = /<(refresh|delete|rename)(\s+[^>]*?)?\s*\/>/gi;
        textWithMarkers = textWithMarkers.replace(selfClosingCmdRegex, (_match, commandType, parametersText) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            const command: SystemCommand = {
                type: (commandType as string).toLowerCase() as SystemCommand['type'],
                timestamp: new Date(),
                markerId
            };
            const paramsText = (parametersText || '').toString();
            if (paramsText.trim()) {
                command.parameters = this.parseCommandParameters(paramsText);
            }
            commands.push(command);
            return markerId;
        });

        // Paired form for delete only: <delete id="..."></delete>
        const deletePairedRegex = /<delete\s+([^>]*?)>\s*<\/delete>/gi;
        textWithMarkers = textWithMarkers.replace(deletePairedRegex, (_match, parametersText) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            const command: SystemCommand = {
                type: 'delete',
                timestamp: new Date(),
                markerId
            };
            if ((parametersText || '').trim()) {
                command.parameters = this.parseCommandParameters(parametersText);
            }
            commands.push(command);
            return markerId;
        });

        // Handle replace_command 
        const replaceCommandRegex = /<replace_command>\s*<search>\s*([\s\S]*?)\s*<\/search>\s*<replace>\s*([\s\S]*?)\s*<\/replace>\s*<\/replace_command>/gi;
        textWithMarkers = textWithMarkers.replace(replaceCommandRegex, (_match, searchText, replaceText) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            
            commands.push({
                type: 'replace_command',
                searchText: searchText.trim(),
                replaceText: replaceText.trim(),
                timestamp: new Date(),
                markerId
            });
            
            return markerId;
        });

        // Handle replace_section command
        const replaceSectionRegex = /<replace_section\s+section="([^"]+)"\s*>\s*([\s\S]*?)\s*<\/replace_section>/gi;
        textWithMarkers = textWithMarkers.replace(replaceSectionRegex, (_match, sectionTitle, content) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            
            commands.push({
                type: 'replace_section',
                sectionTitle: sectionTitle.trim(),
                content: content.trim(),
                timestamp: new Date(),
                markerId
            });
            
            return markerId;
        });

        // Handle remove_section command
        const removeSectionRegex = /<remove_section\s+section="([^"]+)"\s*\/?>/gi;
        textWithMarkers = textWithMarkers.replace(removeSectionRegex, (_match, sectionTitle) => {
            const markerId = `__XML_CMD_${markerIndex++}__`;
            
            commands.push({
                type: 'remove_section',
                sectionTitle: sectionTitle.trim(),
                timestamp: new Date(),
                markerId
            });
            
            return markerId;
        });

        // Legacy change_context_scope removed
        // Handle context add/edit/remove (self-closing) with optional keyword
        const contextAddRegex = /<context\s+([^>]*?)\s*\/>/gi;
        textWithMarkers = textWithMarkers.replace(contextAddRegex, (_match, parametersText) => {
            const params = this.parseCommandParameters(parametersText || '');
            const markerId = `__XML_CMD_${markerIndex++}__`;
            if (params['id'] && (params['text'] || params['description'])) {
                // Treat as edit by id
                const text = (params['text'] || params['description'] || '').toString();
                const trigger = (params['trigger'] || params['keyword'] || '').toString();
                commands.push({ type: 'context_edit', parameters: { id: params['id'], text, trigger }, timestamp: new Date(), markerId });
            } else if (params['text'] || params['description']) {
                // Add without explicit id (id will be client-assigned)
                const text = (params['text'] || params['description'] || '').toString();
                const trigger = (params['trigger'] || params['keyword'] || '').toString();
                commands.push({ type: 'context_add', parameters: { text, trigger }, timestamp: new Date(), markerId });
            } else if (params['id'] && params['remove'] === 'true') {
                commands.push({ type: 'context_remove', parameters: { id: params['id'] }, timestamp: new Date(), markerId });
            }
            return markerId;
        });

        // Ignore any stray legacy tags if encountered (no-op)

        return { commands, textWithMarkers };
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

        // Find all XML-like tags in the text (both self-closing and with content)
        // FIXED: Self-closing regex now requires "/" before ">" to avoid matching opening tags of content tags
        const xmlTagRegex = /<(outline|context)(\s[^>]*?)?\s*\/>/gi;
        const xmlContentTagRegex = /<(outline|context)(\s[^>]*?)>\s*([\s\S]*?)\s*<\/\1>/gi;
        
        const selfClosingMatches = Array.from(text.matchAll(xmlTagRegex));
        const contentMatches = Array.from(text.matchAll(xmlContentTagRegex));
        
        // Process both types of matches
        const matches = [...selfClosingMatches, ...contentMatches];

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

                // For new closing tag syntax, get description from text content instead of attribute
                const textContent = xmlElement.textContent?.trim();
                if (textContent && !attributes['description']) {
                    attributes['description'] = textContent;
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
                
                // Check for common quote mismatch errors
                let helpfulMsg = errorMsg;
                if (fullMatch.includes('"') && fullMatch.includes("'") && fullMatch.includes('description=')) {
                    helpfulMsg = `${errorMsg}. HINT: Check for mismatched quotes in description attribute - use only double quotes (") for XML attributes, never mix with single quotes (').`;
                }
                
                errors.push({
                    type: 'malformed_xml',
                    message: `Invalid ${tagName} tag: ${helpfulMsg}`,
                    sourceText: fullMatch
                });
                console.error(`❌ XML parsing error for "${fullMatch}":`, helpfulMsg);
            }
        }

        // Remove remaining XML commands from text but keep our markers
        // Preserve context/outline tags exactly at their positions by replacing with markers for chat echo
        const elementTagRegex = /<(outline|context)(\s[^>]*?)?\s*(?:\/>|>\s*[\s\S]*?<\/\1>)/gi;
        cleanedText = cleanedText.replace(elementTagRegex, _m => '');

        console.log(`📊 Extraction complete: ${elements.length} elements, ${errors.length} errors`);
        
        return { 
            elements, 
            errors, 
            cleanedText: cleanedText.trim()
        };
    }
    


    /**
     * Remove non-system XML commands (like context/outline tags) but keep system command markers
     */
    // Removed legacy cleanup; element tags are now handled inline for marker positioning


    
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