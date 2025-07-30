/**
 * Element ID Generator Service
 * 
 * Generates unique IDs for story elements with type-based prefixes
 * and handles ID collision detection and resolution.
 */

import type { StoryElementType, ElementID } from '../types/XMLStoryTypes';

/**
 * Service for generating unique IDs for story elements
 */
export class ElementIDGenerator {
    private static instance: ElementIDGenerator | null = null;
    
    // Type prefix mappings
    private readonly typePrefixes: Record<StoryElementType, string> = {
        'outline': 'o_',
        'context': 'c_'
    };
    
    // Counters for each type
    private readonly typeCounters: Map<StoryElementType, number> = new Map();
    
    // Set of existing IDs to prevent collisions
    private readonly existingIds: Set<ElementID> = new Set();
    
    private constructor() {
        // Initialize counters
        Object.keys(this.typePrefixes).forEach(type => {
            this.typeCounters.set(type as StoryElementType, 1);
        });
    }
    
    /**
     * Get singleton instance
     */
    public static getInstance(): ElementIDGenerator {
        if (!ElementIDGenerator.instance) {
            ElementIDGenerator.instance = new ElementIDGenerator();
        }
        return ElementIDGenerator.instance;
    }
    
    /**
     * Generate a unique ID for a story element
     */
    public generateId(type: StoryElementType): ElementID {
        const prefix = this.typePrefixes[type];
        let counter = this.typeCounters.get(type);
        if (counter === undefined) {
            counter = 1;
            this.typeCounters.set(type, counter);
        }
        let candidateId: ElementID;
        
        // Find next available ID
        do {
            candidateId = `${prefix}${counter.toString().padStart(3, '0')}`;
            counter++;
        } while (this.existingIds.has(candidateId));
        
        // Update counter and register ID
        this.typeCounters.set(type, counter);
        this.existingIds.add(candidateId);
        
        return candidateId;
    }
    
    /**
     * Register an existing ID to prevent collisions
     * Useful when loading saved whiteboards
     */
    public registerExistingId(id: ElementID): void {
        this.existingIds.add(id);
        
        // Update counter if necessary
        const type = this.getTypeFromId(id);
        if (type) {
            const numericPart = this.extractNumericPart(id);
            if (numericPart !== null) {
                const currentCounter = this.typeCounters.get(type);
            if (currentCounter === undefined) {
                throw new Error(`Type counter not initialized for type: ${type}`);
            }
                if (numericPart >= currentCounter) {
                    this.typeCounters.set(type, numericPart + 1);
                }
            }
        }
    }
    
    /**
     * Register multiple existing IDs
     */
    public registerExistingIds(ids: ElementID[]): void {
        ids.forEach(id => this.registerExistingId(id));
    }
    
    /**
     * Check if an ID is already in use
     */
    public isIdInUse(id: ElementID): boolean {
        return this.existingIds.has(id);
    }
    
    /**
     * Remove an ID from the registry (when element is deleted)
     */
    public releaseId(id: ElementID): void {
        this.existingIds.delete(id);
    }
    
    /**
     * Get the element type from an ID
     */
    public getTypeFromId(id: ElementID): StoryElementType | null {
        for (const [type, prefix] of Object.entries(this.typePrefixes)) {
            if (id.startsWith(prefix)) {
                return type as StoryElementType;
            }
        }
        return null;
    }
    
    /**
     * Validate that an ID follows the expected format
     */
    public isValidId(id: ElementID): boolean {
        const type = this.getTypeFromId(id);
        if (!type) return false;
        
        const prefix = this.typePrefixes[type];
        const numericPart = id.substring(prefix.length);
        
        // Check if numeric part is valid (3 digits)
        return /^\d{3}$/.test(numericPart);
    }
    
    /**
     * Extract the numeric part from an ID
     */
    private extractNumericPart(id: ElementID): number | null {
        const type = this.getTypeFromId(id);
        if (type === null) {
            throw new Error('Type cannot be null');
        }
        
        const prefix = this.typePrefixes[type];
        const numericPart = id.substring(prefix.length);
        const parsed = parseInt(numericPart, 10);
        
        return isNaN(parsed) ? null : parsed;
    }
    
    /**
     * Get current counter value for a type
     */
    public getCurrentCounter(type: StoryElementType): number {
        const counter = this.typeCounters.get(type);
        if (counter === undefined) {
            throw new Error(`Type counter not found for type: ${type}`);
        }
        return counter;
    }
    
    /**
     * Get statistics about registered IDs
     */
    public getStats(): {
        totalIds: number;
        countsByType: Record<StoryElementType, number>;
        nextCounters: Record<StoryElementType, number>;
    } {
        const countsByType: Record<StoryElementType, number> = {
            outline: 0,
            context: 0
        };
        const nextCounters: Record<StoryElementType, number> = {
            outline: 0,
            context: 0
        };
        
        // Count existing IDs by type
        Object.keys(this.typePrefixes).forEach(type => {
            const elementType = type as StoryElementType;
            countsByType[elementType] = 0;
            const currentCounter = this.typeCounters.get(elementType);
            if (currentCounter === undefined) {
                throw new Error(`Type counter not initialized for type: ${elementType}`);
            }
            nextCounters[elementType] = currentCounter;
        });
        
        this.existingIds.forEach(id => {
            const type = this.getTypeFromId(id);
            if (type) {
                countsByType[type]++;
            }
        });
        
        return {
            totalIds: this.existingIds.size,
            countsByType,
            nextCounters
        };
    }
    
    /**
     * Reset the generator (useful for testing)
     */
    public reset(): void {
        this.existingIds.clear();
        Object.keys(this.typePrefixes).forEach(type => {
            this.typeCounters.set(type as StoryElementType, 1);
        });
    }
    
    /**
     * Get human-readable description of an ID
     */
    public getIdDescription(id: ElementID): string {
        const type = this.getTypeFromId(id);
        if (!type) return `Invalid ID: ${id}`;
        
        const numericPart = this.extractNumericPart(id);
        if (numericPart === null) {
            throw new Error(`Malformed ID: ${id}`);
        }
        
        const typeNames: Record<StoryElementType, string> = {
            'outline': 'Outline',
            'context': 'Context'
        };
        
        return `${typeNames[type]} #${numericPart}`;
    }
    
    /**
     * Generate multiple IDs at once
     */
    public generateMultipleIds(counts: Partial<Record<StoryElementType, number>>): Record<StoryElementType, ElementID[]> {
        const result: Record<StoryElementType, ElementID[]> = {
            outline: [],
            context: []
        };
        
        Object.entries(counts).forEach(([type, count]) => {
            const elementType = type as StoryElementType;
            const ids: ElementID[] = [];
            
            for (let i = 0; i < count; i++) {
                ids.push(this.generateId(elementType));
            }
            
            result[elementType] = ids;
        });
        
        return result;
    }
}

/**
 * Utility function to get a new ID generator instance
 * (for testing or when you need a fresh instance)
 */
export function createIDGenerator(): ElementIDGenerator {
    return ElementIDGenerator.getInstance();
}

/**
 * Utility function to generate a quick ID for a type
 */
export function generateElementId(type: StoryElementType): ElementID {
    return ElementIDGenerator.getInstance().generateId(type);
} 