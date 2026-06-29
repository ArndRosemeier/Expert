/**
 * Smart Content Parser
 * 
 * Detects and parses section-based responses from LLMs with multiple fallback strategies.
 * Provides enhanced debugging and validation for AI-generated content.
 */

export interface ParsedContent {
    hasStructuredData: boolean;
    content: string;
    context: string;
    metadata: Record<string, any>;
    template?: {
        name: string;
        hierarchyLevels: string[];
    };
}

// New interface for section-based structure
export interface AIProjectSections {
    title: string;
    template?: {
        name: string;
        hierarchy: string;
    };
    context: string;
    concept: string;
}

// Legacy interface for backward compatibility
export interface AIProjectStructure {
    Content: string;
    Template: {
        name: string;
        hierarchyLevels: string[];
    };
    Context: string;
}

export class SmartContentParser {
    // Debug logging disabled - kept for compatibility
    private static debugEnabled: boolean = false;

    /**
     * Parse generation response with enhanced strategies
     */
    static parseGenerationResponse(response: string, expectedType: 'project' | 'content' = 'content'): ParsedContent {
        if (!response || response.trim().length === 0) {
            return this.createEmptyParsedContent('Empty or null response received');
        }

        this.debug('=== SMART CONTENT PARSER ===');
        this.debug('Raw response length:', response.length);
        this.debug('Response preview:', response.substring(0, 200) + '...');

        try {
            // First try to parse section-based format
            const sectionData = this.extractSections(response);
            
            if (sectionData) {
                this.debug('Successfully extracted sections:', Object.keys(sectionData));
                
                if (expectedType === 'project') {
                    const result = this.parseProjectSections(sectionData, response);
                    this.debug('parseProjectSections returned:', {
                        hasStructuredData: result.hasStructuredData,
                        parseMethod: result.metadata['parseMethod'],
                        hasTemplate: Boolean(result.template)
                    });
                    return result;
                } else {
                    return this.parseContentSections(sectionData, response);
                }
            } else {
                this.debug('❌ extractSections returned null - trying JSON fallback');
            }

            // Fallback to JSON parsing for backward compatibility
            const jsonData = this.extractJson(response);
            
            if (jsonData) {
                this.debug('Successfully extracted JSON with keys:', Object.keys(jsonData));
                
                if (expectedType === 'project') {
                    const result = this.parseProjectStructure(jsonData, response);
                    this.debug('parseProjectStructure returned:', {
                        hasStructuredData: result.hasStructuredData,
                        parseMethod: result.metadata['parseMethod'],
                        hasTemplate: Boolean(result.template)
                    });
                    return result;
                } else {
                    return this.parseContentStructure(jsonData, response);
                }
            } else {
                this.debug('❌ extractJson returned null - no valid JSON found');
            }
        } catch (error) {
            this.debug('Parsing failed:', error);
        }
        
        // Fallback to raw response
        this.debug('No structured data found, using raw response');
        return this.createRawParsedContent(response);
    }

    /**
     * Extract sections from response text
     */
    private static extractSections(text: string): AIProjectSections | null {
        this.debug('Trying section extraction...');

        const sections: Partial<AIProjectSections> = {};
        
        // Regular expressions for each section
        const sectionPatterns = {
            title: /Section:\s*Title\s*\n([\s\S]*?)(?=\nSection:|$)/i,
            template: /Section:\s*Template\s*\n([\s\S]*?)(?=\nSection:|$)/i,
            context: /Section:\s*Context\s*\n([\s\S]*?)(?=\nSection:|$)/i,
            concept: /Section:\s*Concept\s*\n([\s\S]*?)(?=\nSection:|$)/i
        };

        // Extract each section
        for (const [key, pattern] of Object.entries(sectionPatterns)) {
            const match = text.match(pattern);
            if (match?.[1]) {
                const content = match[1].trim();
                
                if (key === 'template') {
                    // Parse template section
                    const templateData = this.parseTemplateSection(content);
                    if (templateData) {
                        sections.template = templateData;
                    }
                } else {
                    (sections as any)[key] = content;
                }
                
                this.debug(`✅ Extracted ${key} section (${content.length} chars)`);
            } else {
                this.debug(`❌ No ${key} section found`);
            }
        }

        // Require at least title and concept for a valid response
        if (sections.title && sections.concept) {
            this.debug('✅ Valid section structure found');
            return sections as AIProjectSections;
        }

        this.debug('❌ Invalid section structure - missing required sections');
        return null;
    }

    /**
     * Parse template section content
     */
    private static parseTemplateSection(content: string): { name: string; hierarchy: string } | null {
        const nameMatch = content.match(/Template\s*Name:\s*(.+?)(?=\n|$)/i);
        const hierarchyMatch = content.match(/Hierarchy:\s*(.+?)(?=\n|$)/i);

        if (nameMatch?.[1] && hierarchyMatch?.[1]) {
            return {
                name: nameMatch[1].trim(),
                hierarchy: hierarchyMatch[1].trim()
            };
        }

        return null;
    }

    /**
     * Parse project structure from sections
     */
    private static parseProjectSections(sectionData: AIProjectSections, originalResponse: string): ParsedContent {
        if (this.isValidProjectSections(sectionData) && sectionData.template) {
            const templateData = sectionData.template;
            
            // Convert hierarchy string to array
            const hierarchyLevels = templateData.hierarchy
                ? templateData.hierarchy.split('|').map(level => level.trim())
                : [];

            const template = {
                name: templateData.name,
                hierarchyLevels
            };

            return {
                hasStructuredData: true,
                content: sectionData.concept,
                context: sectionData.context || '',
                template,
                metadata: {
                    parseMethod: 'structured_sections',
                    originalLength: originalResponse.length,
                    title: sectionData.title,
                    sectionCount: Object.keys(sectionData).length
                }
            };
        }

        return this.createRawParsedContent(originalResponse);
    }

    /**
     * Parse content structure from sections
     */
    private static parseContentSections(sectionData: AIProjectSections, originalResponse: string): ParsedContent {
        return {
            hasStructuredData: true,
            content: sectionData.concept || sectionData.title || originalResponse,
            context: sectionData.context || '',
            metadata: {
                parseMethod: 'content_sections',
                originalLength: originalResponse.length,
                sectionCount: Object.keys(sectionData).length
            }
        };
    }

    /**
     * Validate if sections have valid project structure
     */
    private static isValidProjectSections(sections: AIProjectSections): boolean {
        this.debug('🔍 Validating project sections:');
        this.debug('  - title exists:', Boolean(sections.title));
        this.debug('  - concept exists:', Boolean(sections.concept));
        this.debug('  - template exists:', Boolean(sections.template));
        this.debug('  - template.name exists:', Boolean(sections.template?.name));
        this.debug('  - template.hierarchy exists:', Boolean(sections.template?.hierarchy));
        
        const isValid = Boolean(sections.title && 
                          sections.concept && 
                          sections.template?.name &&
                          sections.template.hierarchy);
        
        this.debug('  - Overall valid:', isValid);
        return isValid;
    }



    /**
     * Parse project structure from JSON
     */
    private static parseProjectStructure(jsonData: any, originalResponse: string): ParsedContent {
        // Check for our expected project structure
        if (this.isValidProjectStructure(jsonData)) {
            // Convert Context to string if it's an object
            let contextString = '';
            if (typeof jsonData.Context === 'string') {
                contextString = jsonData.Context;
            } else if (typeof jsonData.Context === 'object') {
                // Convert object to readable string format
                contextString = this.convertContextObjectToString(jsonData.Context);
                this.debug('✅ Converted Context object to string, length:', contextString.length);
            }

            return {
                hasStructuredData: true,
                content: jsonData.Content || originalResponse,
                context: contextString,
                template: jsonData.Template,
                metadata: {
                    parseMethod: 'structured_project',
                    originalLength: originalResponse.length,
                    contextType: typeof jsonData.Context
                }
            };
        }

        // Try alternative structures
        if (jsonData.content || jsonData.template || jsonData.context) {
            let contextString = '';
            const contextData = jsonData.context || jsonData.Context;
            if (typeof contextData === 'string') {
                contextString = contextData;
            } else if (typeof contextData === 'object') {
                contextString = this.convertContextObjectToString(contextData);
            }

            return {
                hasStructuredData: true,
                content: jsonData.content || jsonData.Content || originalResponse,
                context: contextString,
                template: jsonData.template || jsonData.Template,
                metadata: {
                    parseMethod: 'alternative_project',
                    originalLength: originalResponse.length,
                    contextType: typeof contextData
                }
            };
        }

        return this.createRawParsedContent(originalResponse);
    }

    /**
     * Parse content structure from JSON (for regular content generation)
     */
    private static parseContentStructure(jsonData: any, originalResponse: string): ParsedContent {
        return {
            hasStructuredData: true,
            content: jsonData.content || jsonData.text || jsonData.Content || originalResponse,
            context: jsonData.context || jsonData.Context || '',
            metadata: {
                parseMethod: 'content_structure',
                originalLength: originalResponse.length,
                ...jsonData
            }
        };
    }

    /**
     * Extract JSON from text using multiple strategies
     */
    private static extractJson(text: string): any | null {
        this.debug('Trying JSON extraction strategies...');

        const strategies = [
            // Strategy 1: Look for ```json blocks - more greedy matching
            {
                name: 'json_code_block',
                pattern: /```json\s*(\{[\s\S]*\})\s*```/i
            },
            // Strategy 2: Look for ```JSON blocks (uppercase) - more greedy matching
            {
                name: 'JSON_code_block',
                pattern: /```JSON\s*(\{[\s\S]*\})\s*```/i
            },
            // Strategy 3: Look for our specific project structure - more greedy
            {
                name: 'project_structure',
                pattern: /(\{[\s\S]*?"Content"[\s\S]*?"Template"[\s\S]*?"Context"[\s\S]*\})/i
            },
            // Strategy 4: Look for any JSON with "content" field - more greedy
            {
                name: 'content_json',
                pattern: /(\{[\s\S]*?"content"[\s\S]*\})/i
            },
            // Strategy 5: Look for balanced braces with better nesting support
            {
                name: 'balanced_braces',
                pattern: /(\{(?:[^{}]|{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*})*\})/
            },
            // Strategy 6: Simple greedy match from first { to last }
            {
                name: 'greedy_braces',
                pattern: /(\{[\s\S]*\})/
            }
        ];

        for (const strategy of strategies) {
            this.debug(`Trying strategy: ${strategy.name}`);
            
            const match = text.match(strategy.pattern);
            if (match?.[1]) {
                const result = this.tryParseJson(match[1], strategy.name);
                if (result) {
                    this.debug(`🎯 Strategy "${strategy.name}" returned result:`, Object.keys(result));
                    return result;
                }
            }
        }

        return null;
    }

    /**
     * Try to parse JSON with error handling and repair attempts
     */
    private static tryParseJson(jsonString: string, strategyName: string): any | null {
        try {
            const parsed = JSON.parse(jsonString);
            this.debug(`✅ Strategy "${strategyName}" succeeded`);
            this.debug(`   Parsed object keys:`, Object.keys(parsed));
            this.debug(`   Content type:`, typeof parsed.Content, parsed.Content ? `(${parsed.Content.length} chars)` : '');
            this.debug(`   Template exists:`, Boolean(parsed.Template));
            this.debug(`   Context type:`, typeof parsed.Context);
            return parsed;
        } catch (e) {
            this.debug(`❌ Strategy "${strategyName}" failed:`, (e as Error).message);
            
            // Try to repair the JSON and parse again
            this.debug(`🔧 Attempting JSON repair for strategy "${strategyName}"`);
            try {
                const repaired = this.repairJson(jsonString);
                const parsed = JSON.parse(repaired);
                this.debug(`✅ Strategy "${strategyName}" succeeded after repair`);
                this.debug(`   Repaired object keys:`, Object.keys(parsed));
                return parsed;
            } catch (repairError) {
                this.debug(`❌ Strategy "${strategyName}" failed even after repair:`, (repairError as Error).message);
                return null;
            }
        }
    }

    /**
     * Validate if object has valid project structure
     */
    private static isValidProjectStructure(obj: any): obj is AIProjectStructure {
        this.debug('🔍 Validating project structure:');
        this.debug('  - obj exists:', Boolean(obj));
        this.debug('  - Content type:', typeof obj?.Content);
        this.debug('  - Template exists:', Boolean(obj?.Template));
        this.debug('  - Template.name type:', typeof obj?.Template?.name);
        this.debug('  - Template.hierarchyLevels is array:', Array.isArray(obj?.Template?.hierarchyLevels));
        this.debug('  - Context type:', typeof obj?.Context);
        
        const isValid = obj && 
               typeof obj.Content === 'string' &&
               obj.Template &&
               typeof obj.Template.name === 'string' &&
               Array.isArray(obj.Template.hierarchyLevels) &&
               (typeof obj.Context === 'string' || typeof obj.Context === 'object');
        
        this.debug('  - Overall valid:', isValid);
        return isValid;
    }

    /**
     * Create parsed content from raw text
     */
    private static createRawParsedContent(text: string): ParsedContent {
        return {
            hasStructuredData: false,
            content: text,
            context: '',
            metadata: {
                parseMethod: 'raw_text',
                originalLength: text.length
            }
        };
    }

    /**
     * Create empty parsed content with error message
     */
    private static createEmptyParsedContent(reason: string): ParsedContent {
        return {
            hasStructuredData: false,
            content: `No content generated. Reason: ${reason}`,
            context: '',
            metadata: {
                parseMethod: 'empty',
                error: reason
            }
        };
    }

    /**
     * Enhanced debugging for development
     */
    private static debug(...args: any[]): void {
        if (this.debugEnabled) {
            console.log('[SmartContentParser]', ...args);
        }
    }

    /**
     * Enable/disable debug logging
     */
    static setDebugMode(enabled: boolean): void {
        this.debugEnabled = enabled;
    }

    /**
     * Convert Context object to readable string format
     */
    private static convertContextObjectToString(contextObj: any): string {
        if (!contextObj || typeof contextObj !== 'object') {
            return '';
        }

        let result = '';

        // Handle different context object structures
        for (const [key, value] of Object.entries(contextObj)) {
            if (key === 'Protagonist' && typeof value === 'object') {
                const protag = value as any;
                result += `PROTAGONIST:\n`;
                if (protag.Name) result += `Name: ${protag.Name}\n`;
                if (protag.Description) result += `Description: ${protag.Description}\n\n`;
            }
            else if (key === 'SupportingCharacters' && Array.isArray(value)) {
                result += `SUPPORTING CHARACTERS:\n`;
                for (const char of value) {
                    if (typeof char === 'object' && char.Name && char.Role) {
                        result += `• ${char.Name}: ${char.Role}\n`;
                    }
                }
                result += '\n';
            }
            else if (key === 'WorldBuilding' && typeof value === 'object') {
                result += `WORLD BUILDING:\n`;
                const worldData = value as any;
                if (worldData.CoreConcept) {
                    result += `Core Concept: ${worldData.CoreConcept}\n`;
                }
                if (worldData.KeySettings && typeof worldData.KeySettings === 'object') {
                    result += `Key Settings:\n`;
                    for (const [settingName, settingDesc] of Object.entries(worldData.KeySettings)) {
                        result += `• ${settingName}: ${settingDesc}\n`;
                    }
                }
                result += '\n';
            }
            else if (key === 'Themes' && Array.isArray(value)) {
                result += `THEMES:\n`;
                for (const theme of value) {
                    result += `• ${theme}\n`;
                }
                result += '\n';
            }
            else if (key === 'StyleGuide' && typeof value === 'object') {
                result += `STYLE GUIDE:\n`;
                const styleData = value as any;
                for (const [styleProp, styleValue] of Object.entries(styleData)) {
                    result += `${styleProp}: ${styleValue}\n`;
                }
                result += '\n';
            }
            else {
                // Generic handling for any other structure
                if (typeof value === 'string') {
                    result += `${key.toUpperCase()}:\n${value}\n\n`;
                } else if (Array.isArray(value)) {
                    result += `${key.toUpperCase()}:\n`;
                    for (const item of value) {
                        result += `• ${item}\n`;
                    }
                    result += '\n';
                } else if (typeof value === 'object') {
                    result += `${key.toUpperCase()}:\n${JSON.stringify(value, null, 2)}\n\n`;
                }
            }
        }

        return result.trim();
    }

    /**
     * Analyze response to provide insights for prompt improvement
     */
    static analyzeResponse(response: string): {
        hasJson: boolean;
        jsonBlocks: number;
        probableStructure: string;
        suggestions: string[];
    } {
        const analysis = {
            hasJson: false,
            jsonBlocks: 0,
            probableStructure: 'plain_text',
            suggestions: [] as string[]
        };

        // Check for section-based structure first (our primary format)
        const hasSectionTitle = /Section:\s*Title/i.test(response);
        const hasSectionConcept = /Section:\s*Concept/i.test(response);
        const hasSectionTemplate = /Section:\s*Template/i.test(response);
        const hasSectionContext = /Section:\s*Context/i.test(response);

        if (hasSectionTitle || hasSectionConcept || hasSectionTemplate || hasSectionContext) {
            analysis.probableStructure = 'section_based';
            
            // Check for missing required sections
            if (!hasSectionTitle) {
                analysis.suggestions.push('Missing "Section: Title" - required for project generation');
            }
            if (!hasSectionConcept) {
                analysis.suggestions.push('Missing "Section: Concept" - required for project generation');
            }
            if (!hasSectionTemplate) {
                analysis.suggestions.push('Missing "Section: Template" - recommended for structured projects');
            }
            
            return analysis;
        }

        // Fallback: Check for JSON structure (legacy format)
        const jsonBlockPattern = /```json[\s\S]*?```/gi;
        const jsonMatches = response.match(jsonBlockPattern);
        analysis.jsonBlocks = jsonMatches ? jsonMatches.length : 0;

        // Check for brace pairs
        const openBraces = (response.match(/\{/g) || []).length;
        const closeBraces = (response.match(/\}/g) || []).length;
        
        if (openBraces > 0 && closeBraces > 0) {
            analysis.hasJson = true;
            analysis.probableStructure = openBraces === closeBraces ? 'balanced_json' : 'unbalanced_json';
        }

        // Generate suggestions
        if (analysis.jsonBlocks === 0 && analysis.hasJson) {
            analysis.suggestions.push('Response contains JSON but not in code blocks - add ```json wrapper');
        }
        
        if (analysis.probableStructure === 'unbalanced_json') {
            analysis.suggestions.push('JSON appears to have unmatched braces - check syntax');
        }

        if (!analysis.hasJson && analysis.probableStructure === 'plain_text') {
            analysis.suggestions.push('No structured format detected - ensure response uses section format (Section: Title, Section: Concept, etc.) or JSON fallback');
        }

        return analysis;
    }

    /**
     * Attempt to repair common JSON issues
     */
    static repairJson(text: string): string {
        if (!text) return text;
        
        let repaired = text;
        this.debug('🔧 Starting JSON repair on text of length:', text.length);

        try {
            // Strategy 1: Replace literal newlines and control characters with proper JSON escapes
            repaired = text.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
            
            // Strategy 2: Fix common JSON issues
            // Fix trailing commas in objects
            repaired = repaired.replace(/,(\s*})/g, '$1');
            // Fix trailing commas in arrays
            repaired = repaired.replace(/,(\s*])/g, '$1');
            // Fix missing quotes on property names
            repaired = repaired.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_\s]*)\s*:/g, '$1"$2":');
            // Fix multiple consecutive commas
            repaired = repaired.replace(/,+/g, ',');

            this.debug('✅ JSON repair completed. Original length:', text.length, 'Repaired length:', repaired.length);
            
            // Test if the repaired JSON is valid
            try {
                JSON.parse(repaired);
                this.debug('✅ Repaired JSON is valid');
            } catch (testError) {
                this.debug('⚠️ Repaired JSON still has issues:', (testError as Error).message);
                // Show a sample around the error position if available
                const match = (testError as Error).message.match(/position (\d+)/);
                if (match?.[1]) {
                    const pos = parseInt(match[1]);
                    const start = Math.max(0, pos - 50);
                    const end = Math.min(repaired.length, pos + 50);
                    this.debug('Error context:', repaired.substring(start, end));
                }
            }
            
        } catch (error) {
            this.debug('❌ JSON repair failed:', error);
            return text; // Return original if repair fails
        }
        
        return repaired;
    }
} 