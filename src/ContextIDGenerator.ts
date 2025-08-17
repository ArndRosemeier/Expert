/**
 * Context ID Generator
 * 
 * Centralized service for generating simplified context IDs in the format: id_1, id_2, etc.
 * Ensures uniqueness by scanning the entire project tree and using the first available number.
 */

import { DocumentNode } from './DocumentNode';

export class ContextIDGenerator {
    private static instance: ContextIDGenerator | null = null;
    
    /**
     * Get singleton instance
     */
    public static getInstance(): ContextIDGenerator {
        if (!this.instance) {
            this.instance = new ContextIDGenerator();
        }
        return this.instance;
    }
    
    private constructor() {
        // Private constructor for singleton
    }
    
    /**
     * Generate a new context ID by scanning the project tree for existing IDs
     * and using the first available number.
     * 
     * @param rootNode The root node of the project tree
     * @returns A new context ID in format "id_N"
     */
    public generateNewContextID(rootNode: DocumentNode): string {
        const usedIds = this.scanProjectTreeForIds(rootNode);
        const usedNumbers = this.extractNumbersFromIds(usedIds);
        const nextNumber = this.findFirstAvailableNumber(usedNumbers);
        return `id_${nextNumber}`;
    }
    
    /**
     * Scan the entire project tree and collect all IDs
     * 
     * @param rootNode The root node to start scanning from
     * @returns Set of all IDs found in the project tree
     */
    public scanProjectTreeForIds(rootNode: DocumentNode): Set<string> {
        const allIds = new Set<string>();
        
        // Helper function to recursively collect IDs
        const collectIds = (node: DocumentNode): void => {
            // Add the node's ID
            allIds.add(node.id);
            
            // Add version IDs
            const versions = (node as any).versions || [];
            versions.forEach((version: any) => {
                if (version.id) {
                    allIds.add(version.id);
                }
            });
            
            // Add conditional context item IDs
            const conditionalItems = (node as any).conditionalContextItems || [];
            conditionalItems.forEach((item: any) => {
                if (item.id) {
                    allIds.add(item.id);
                }
            });
            
            // Add generation session IDs
            if (node.generationSessions) {
                node.generationSessions.forEach((session: any) => {
                    if (session.sessionId) {
                        allIds.add(session.sessionId);
                    }
                });
            }
            
            // Add todo item IDs
            if (node.todos) {
                node.todos.forEach((todo: any) => {
                    if (todo.id) {
                        allIds.add(todo.id);
                    }
                });
            }
            
            // Recursively process children
            node.children.forEach(child => collectIds(child));
        };
        
        collectIds(rootNode);
        return allIds;
    }
    
    /**
     * Extract numbers from IDs that follow the "id_N" pattern
     * 
     * @param ids Set of all IDs
     * @returns Array of numbers from IDs that match the pattern
     */
    private extractNumbersFromIds(ids: Set<string>): number[] {
        const numbers: number[] = [];
        const idPattern = /^id_(\d+)$/;
        
        for (const id of ids) {
            const match = id.match(idPattern);
            if (match && match[1]) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) {
                    numbers.push(num);
                }
            }
        }
        
        return numbers.sort((a, b) => a - b);
    }
    
    /**
     * Find the first available number (starting from 1)
     * 
     * @param usedNumbers Sorted array of used numbers
     * @returns The first available number
     */
    private findFirstAvailableNumber(usedNumbers: number[]): number {
        if (usedNumbers.length === 0) {
            return 1;
        }
        
        // Find the first gap or use the next number after the highest
        for (let i = 1; i <= usedNumbers.length + 1; i++) {
            if (!usedNumbers.includes(i)) {
                return i;
            }
        }
        
        // This should never be reached, but return next number as fallback
        return Math.max(...usedNumbers) + 1;
    }
    
    /**
     * Normalize an existing ID to the new format.
     * If the ID already follows the pattern, return it as-is.
     * Otherwise, generate a new ID.
     * 
     * @param currentId The current ID to normalize
     * @param rootNode The root node for scanning existing IDs
     * @returns Normalized ID in "id_N" format
     */
    public normalizeContextID(currentId: string, rootNode: DocumentNode): string {
        const idPattern = /^id_(\d+)$/;
        
        // If already in correct format, return as-is
        if (idPattern.test(currentId)) {
            return currentId;
        }
        
        // Otherwise, generate a new ID
        return this.generateNewContextID(rootNode);
    }
    
    /**
     * Convert a project tree to use normalized context IDs.
     * This is used during project loading to ensure all IDs follow the new format.
     * 
     * @param rootNode The root node of the project to normalize
     * @returns Map of old IDs to new IDs for reference tracking
     */
    public normalizeProjectTreeIds(rootNode: DocumentNode): Map<string, string> {
        const idMapping = new Map<string, string>();
        
        // First pass: collect all nodes and create ID mapping
        const allNodes: DocumentNode[] = [];
        const collectNodes = (node: DocumentNode): void => {
            allNodes.push(node);
            node.children.forEach(child => collectNodes(child));
        };
        collectNodes(rootNode);
        
        // Create ID mappings for nodes that need normalization
        for (const node of allNodes) {
            let normalizedId: string;
            
            // Root node always gets id_1 if it needs normalization
            if (node === rootNode && !node.id.match(/^id_(\d+)$/)) {
                normalizedId = 'id_1';
            } else {
                normalizedId = this.normalizeContextID(node.id, rootNode);
            }
            
            if (normalizedId !== node.id) {
                idMapping.set(node.id, normalizedId);
            }
        }
        
        // Second pass: apply the new IDs
        for (const node of allNodes) {
            if (idMapping.has(node.id)) {
                node.id = idMapping.get(node.id)!;
            }
            
            // Update parentId references
            if (node.parentId && idMapping.has(node.parentId)) {
                node.parentId = idMapping.get(node.parentId)!;
            }
            
            // Update version IDs (but keep them as UUIDs since they're not context IDs)
            // Only update if they were accidentally using the old context ID format
            
            // Update conditional context item IDs
            const conditionalItems = (node as any).conditionalContextItems || [];
            conditionalItems.forEach((item: any) => {
                if (item.id && idMapping.has(item.id)) {
                    item.id = idMapping.get(item.id)!;
                }
            });
            
            // Update generation session IDs (keep as UUIDs)
            // Update todo item IDs (keep as UUIDs)
        }
        
        return idMapping;
    }
}

/**
 * Global convenience function to generate new context IDs
 * 
 * @param rootNode The root node of the project
 * @returns A new context ID
 */
export function generateNewContextID(rootNode: DocumentNode): string {
    return ContextIDGenerator.getInstance().generateNewContextID(rootNode);
}
