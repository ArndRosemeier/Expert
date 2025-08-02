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
     * Extract system commands like </refresh> and </outline_replace>
     */
    private extractSystemCommands(text: string): SystemCommand[] {
        const commands: SystemCommand[] = [];
        
        // Handle outline_replace commands (with content between tags)
        const outlineReplaceRegex = /<\/outline_replace>\s*([\s\S]*?)\s*<\/outline_replace>/gi;
        let outlineMatch;
        while ((outlineMatch = outlineReplaceRegex.exec(text)) !== null) {
            const content = outlineMatch[1] || '';
            commands.push({
                type: 'outline_replace',
                content: content.trim(),
                timestamp: new Date()
            });
        }
        
        // Handle edit commands with content between tags (new improved syntax)
        const editCommandRegex = /<\/edit\s+([^>]*?)>\s*([\s\S]*?)\s*<\/edit>/gi;
        let editMatch;
        while ((editMatch = editCommandRegex.exec(text)) !== null) {
            const parametersText = editMatch[1] || '';
            const content = editMatch[2] || '';
            
            const command: SystemCommand = {
                type: 'edit',
                content: content.trim(),
                timestamp: new Date()
            };
            
            // Parse parameters (like id="element_id")
            if (parametersText.trim()) {
                command.parameters = this.parseCommandParameters(parametersText);
            }
            
            commands.push(command);
        }
        
        // Handle append commands
        const appendCommandRegex = /<append>\s*([\s\S]*?)\s*<\/append>/gi;
        let appendMatch;
        while ((appendMatch = appendCommandRegex.exec(text)) !== null) {
            const content = appendMatch[1] || '';
            
            commands.push({
                type: 'append',
                content: content.trim(),
                timestamp: new Date()
            });
        }
        
        // Handle replace_command with search/replace structure
        const replaceCommandRegex = /<replace_command>\s*<search>\s*([\s\S]*?)\s*<\/search>\s*<replace>\s*([\s\S]*?)\s*<\/replace>\s*<\/replace_command>/gi;
        let replaceMatch;
        while ((replaceMatch = replaceCommandRegex.exec(text)) !== null) {
            const searchText = replaceMatch[1] || '';
            const replaceText = replaceMatch[2] || '';
            
            commands.push({
                type: 'replace_command',
                searchText: searchText.trim(),
                replaceText: replaceText.trim(),
                timestamp: new Date()
            });
        }
        
        // Handle other system commands (self-closing) - excluding edit which is now handled above
        const systemCommandRegex = /<\/(refresh|delete|rename)(?:\s+([^>]*))?\s*>/gi;
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

        // Find all XML-like tags in the text (both self-closing and with content)
        const xmlTagRegex = /<(outline|context)(\s[^>]*?)?\s*\/?>/gi;
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

        // Highlight executed system commands instead of removing them from cleaned text
        cleanedText = cleanedText.replace(/<\/(refresh|delete|rename)(?:\s+[^>]*)?\s*>/gi, (match) => {
            return `<span class="xml-command-highlight" title="Executed command">${this.escapeHtml(match)}</span>`;
        });
        
        // Highlight outline_replace tags and their content in cleaned text
        cleanedText = cleanedText.replace(/<\/outline_replace>\s*([\s\S]*?)\s*<\/outline_replace>/gi, (_match, content) => {
            const escapedContent = this.escapeHtml(content.trim());
            return `<div class="xml-command-highlight outline-replace-command" title="Outline replacement executed">
                <strong>&lt;/outline_replace&gt;</strong>
                <div class="command-content">${escapedContent}</div>
                <strong>&lt;/outline_replace&gt;</strong>
            </div>`;
        });
        
        // Highlight edit tags and their content in cleaned text (new syntax)
        cleanedText = cleanedText.replace(/<\/edit\s+([^>]*?)>\s*([\s\S]*?)\s*<\/edit>/gi, (_match, params, content) => {
            const escapedParams = this.escapeHtml(params);
            const escapedContent = this.escapeHtml(content.trim());
            return `<div class="xml-command-highlight edit-command" title="Edit command executed">
                <strong>&lt;/edit ${escapedParams}&gt;</strong>
                <div class="command-content">${escapedContent}</div>
                <strong>&lt;/edit&gt;</strong>
            </div>`;
        });
        
        // Highlight append tags and their content in cleaned text
        cleanedText = cleanedText.replace(/<append>\s*([\s\S]*?)\s*<\/append>/gi, (_match, content) => {
            const escapedContent = this.escapeHtml(content.trim());
            return `<div class="xml-command-highlight append-command" title="Append command executed">
                <strong>&lt;append&gt;</strong>
                <div class="command-content">${escapedContent}</div>
                <strong>&lt;/append&gt;</strong>
            </div>`;
        });
        
        // Highlight replace_command tags and their content in cleaned text
        cleanedText = cleanedText.replace(/<replace_command>\s*<search>\s*([\s\S]*?)\s*<\/search>\s*<replace>\s*([\s\S]*?)\s*<\/replace>\s*<\/replace_command>/gi, (_match, searchText, replaceText) => {
            const escapedSearch = this.escapeHtml(searchText.trim());
            const escapedReplace = this.escapeHtml(replaceText.trim());
            return `<div class="xml-command-highlight replace-command" title="Replace command executed">
                <strong>&lt;replace_command&gt;</strong>
                <div class="command-content">
                    <div><strong>&lt;search&gt;</strong> ${escapedSearch} <strong>&lt;/search&gt;</strong></div>
                    <div><strong>&lt;replace&gt;</strong> ${escapedReplace} <strong>&lt;/replace&gt;</strong></div>
                </div>
                <strong>&lt;/replace_command&gt;</strong>
            </div>`;
        });
        
        // Highlight context tags with content in cleaned text (new closing tag syntax)
        cleanedText = cleanedText.replace(/<(outline|context)\s+([^>]*?)>\s*([\s\S]*?)\s*<\/\1>/gi, (_match, tagName, params, content) => {
            const escapedParams = this.escapeHtml(params);
            const escapedContent = this.escapeHtml(content.trim());
            return `<div class="xml-command-highlight context-command" title="${tagName} element created">
                <strong>&lt;${tagName} ${escapedParams}&gt;</strong>
                <div class="command-content">${escapedContent}</div>
                <strong>&lt;/${tagName}&gt;</strong>
            </div>`;
        });

        console.log(`📊 Extraction complete: ${elements.length} elements, ${errors.length} errors`);
        
        return { elements, errors, cleanedText: cleanedText.trim() };
    }
    
    /**
     * Escape HTML characters to prevent XSS and display issues
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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