/**
 * Search Service for recursive node content and context search
 * 
 * Features:
 * - Recursive search through node hierarchy
 * - Version-aware search (master only or all versions)
 * - Wildcard pattern support (? and *)
 * - Word-based search with paragraph context
 * - Global replace functionality
 */

import type { DocumentNode, ContentVersion } from '../../../DocumentNode';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchOptions {
    /** Include all versions or only master versions */
    includeAllVersions: boolean;
    /** Case sensitive search */
    caseSensitive: boolean;
    /** Search in content */
    searchInContent: boolean;
    /** Search in context */
    searchInContext: boolean;
    /** Search in conditional context (only on the triggering/root node) */
    searchInConditionalContext?: boolean;
}

export interface SearchResult {
    /** Node where the match was found */
    node: DocumentNode;
    /** Version where the match was found */
    version: ContentVersion;
    /** Type of content where match was found */
    contentType: 'content' | 'context' | 'conditional';
    /** The paragraph containing the match */
    paragraph: string;
    /** Position of the match within the paragraph */
    matchStart: number;
    /** Length of the matched text */
    matchLength: number;
    /** Zero-based paragraph index in the content */
    paragraphIndex: number;
}

export interface ReplaceOptions extends SearchOptions {
    /** Text to replace matches with */
    replaceText: string;
}

export interface ReplaceResult {
    /** Number of replacements made */
    totalReplacements: number;
    /** Results per node */
    nodeResults: Array<{
        node: DocumentNode;
        version: ContentVersion;
        contentType: 'content' | 'context' | 'conditional';
        replacements: number;
    }>;
}

// ============================================================================
// SEARCH SERVICE
// ============================================================================

export class SearchService {
    
    /**
     * Search for text patterns in a node hierarchy
     */
    public static searchInHierarchy(
        rootNode: DocumentNode,
        searchPattern: string,
        options: SearchOptions
    ): SearchResult[] {
        const results: SearchResult[] = [];
        
        // Convert wildcard pattern to regex - assume pattern is valid
        const regex: RegExp = this.createWildcardRegex(searchPattern, options.caseSensitive);
        
        // Recursively search through all nodes - assume functions exist and work
        this.searchNodeRecursive(rootNode, regex, options, results);
        
        return results;
    }
    
    /**
     * Replace text patterns in a node hierarchy
     */
    public static replaceInHierarchy(
        rootNode: DocumentNode,
        searchPattern: string,
        options: ReplaceOptions
    ): ReplaceResult {
        const result: ReplaceResult = {
            totalReplacements: 0,
            nodeResults: []
        };
        
        // Convert wildcard pattern to regex with global flag - assume pattern is valid
        const regex: RegExp = this.createWildcardRegex(searchPattern, options.caseSensitive, true);
        
        // Recursively replace in all nodes - assume functions exist and work
        this.replaceNodeRecursive(rootNode, regex, options, result);
        
        return result;
    }
    
    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================
    
    /**
     * Convert wildcard pattern to regex
     */
    private static createWildcardRegex(pattern: string, caseSensitive: boolean, global: boolean = false): RegExp {
        // Escape special regex characters except * and ?
        let escaped: string = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        
        // Convert wildcards to regex equivalents
        escaped = escaped.replace(/\*/g, '\\S*');  // * matches any non-whitespace characters
        escaped = escaped.replace(/\?/g, '\\S');   // ? matches any single non-whitespace character
        
        // Create word boundary regex for word-based search
        const wordPattern: string = `\\b${escaped}\\b`;
        
        const flags: string = `${caseSensitive ? '' : 'i'}${global ? 'g' : ''}`;
        return new RegExp(wordPattern, flags);
    }
    
    /**
     * Recursively search through a node and its children
     */
    private static searchNodeRecursive(
        node: DocumentNode,
        regex: RegExp,
        options: SearchOptions,
        results: SearchResult[]
    ): void {
        // Get versions to search - NO defensive programming, assume functions exist and work
        const versions: ContentVersion[] = options.includeAllVersions 
            ? node.getAllVersions()
            : [node.getMasterVersion()!];
        
        // Search in each version - NO defensive checks, assume content exists
        for (const version of versions) {
            // Search in content
            if (options.searchInContent) {
                this.searchInText(node, version, 'content', version.content, regex, results);
            }
            
            // Search in context
            if (options.searchInContext) {
                // Context search removed - using conditional context system
            }
        }
        
        // Search in conditional context items
        if (options.searchInConditionalContext) {
            this.searchConditionalContextItems(node, regex, results);
        }
        
        // Recursively search children - NO defensive check, assume children exist if node has them
        for (const child of node.children) {
            this.searchNodeRecursive(child, regex, options, results);
        }
    }
    
    /**
     * Search for matches in a text string and extract paragraph context
     */
    private static searchInText(
        node: DocumentNode,
        version: ContentVersion,
        contentType: 'content' | 'context',
        text: string,
        regex: RegExp,
        results: SearchResult[]
    ): void {
        // Split text into paragraphs - NO defensive filtering, let errors be loud
        const paragraphs: string[] = text.split(/\n\s*\n/).map(p => p.trim());
        
        for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
            const paragraph: string = paragraphs[paragraphIndex]!;
            
            // Reset regex lastIndex
            regex.lastIndex = 0;
            
            let match: RegExpExecArray | null;
            while ((match = regex.exec(paragraph)) !== null) {
                results.push({
                    node,
                    version,
                    contentType,
                    paragraph,
                    matchStart: match.index,
                    matchLength: match[0].length,
                    paragraphIndex
                });
                
                // Handle zero-width matches
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }
                
                // Break for non-global regex
                if (!regex.global) {
                    break;
                }
            }
        }
    }
    
    /**
     * Recursively replace text in a node and its children
     */
    private static replaceNodeRecursive(
        node: DocumentNode,
        regex: RegExp,
        options: ReplaceOptions,
        result: ReplaceResult
    ): void {
        // Get versions to search - NO defensive programming
        const versions: ContentVersion[] = options.includeAllVersions 
            ? node.getAllVersions()
            : [node.getMasterVersion()!];
        
        // Replace in each version - NO defensive checks
        for (const version of versions) {
            let nodeReplacements: number = 0;
            
            // Replace in content
            if (options.searchInContent) {
                const beforeContent: string = version.content;
                version.content = version.content.replace(regex, options.replaceText);
                const contentReplacements: number = (beforeContent.match(regex) || []).length;
                nodeReplacements += contentReplacements;
            }
            
            // Replace in context
            if (options.searchInContext) {
                // Context replacement removed - using conditional context system
                const contextReplacements: number = 0;
                nodeReplacements += contextReplacements;
            }
            
            // Replace in conditional context items (for any node at or below triggering node)
            if (options.searchInConditionalContext) {
                const conditionalReplacements = this.replaceConditionalContextItems(node, regex, options.replaceText);
                if (conditionalReplacements > 0) {
                    result.nodeResults.push({
                        node: node,
                        version,
                        contentType: 'conditional',
                        replacements: conditionalReplacements
                    });
                    result.totalReplacements += conditionalReplacements;
                }
            }
            
            // Record replacements for this version
            if (nodeReplacements > 0) {
                // Update version timestamp
                version.timestamp = new Date();
                
                result.nodeResults.push({
                    node,
                    version,
                    contentType: 'content', // This is simplified - we could track separately
                    replacements: nodeReplacements
                });
                
                result.totalReplacements += nodeReplacements;
            }
        }
        
        // Recursively replace in children - NO defensive check
        for (const child of node.children) {
            this.replaceNodeRecursive(child, regex, options, result);
        }
    }

    /**
     * Search conditional context items of any node
     */
    private static searchConditionalContextItems(
        node: DocumentNode,
        regex: RegExp,
        results: SearchResult[]
    ): void {
        // Use master version as placeholder for version linkage in results
        const master = node.getMasterVersion()!;
        const items = node.getConditionalContextItems();
        for (let index = 0; index < items.length; index++) {
            const item = items[index]!;
            const text = item.text || '';
            regex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(text)) !== null) {
                results.push({
                    node: node,
                    version: master,
                    contentType: 'conditional',
                    paragraph: text,
                    matchStart: match.index,
                    matchLength: match[0].length,
                    paragraphIndex: index
                });
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }
                if (!regex.global) break;
            }
        }
    }

    /**
     * Replace text in conditional context items of any node
     */
    private static replaceConditionalContextItems(
        node: DocumentNode,
        regex: RegExp,
        replaceText: string
    ): number {
        let totalReplacements = 0;
        const items = node.getConditionalContextItems();
        
        console.log(`🔍 Replacing in conditional context: node="${node.title}", items=${items.length}, regex=${regex}`);
        
        for (let index = 0; index < items.length; index++) {
            const item = items[index]!;
            const originalText = item.text || '';
            
            // Count matches before replacement
            const matches = originalText.match(regex) || [];
            const replacements = matches.length;
            
            console.log(`📝 Item ${index}: "${originalText.substring(0, 50)}..." → ${replacements} matches`);
            
            if (replacements > 0) {
                // Perform replacement
                const newText = originalText.replace(regex, replaceText);
                
                console.log(`✏️ Replacing: "${originalText}" → "${newText}"`);
                
                // Update the conditional context item
                node.updateConditionalContextItem(item.id, { text: newText });
                
                console.log(`✅ Updated item ${item.id} with new text: "${newText}"`);
                
                totalReplacements += replacements;
            }
        }
        
        console.log(`🎯 Total replacements in conditional context: ${totalReplacements}`);
        return totalReplacements;
    }
}
