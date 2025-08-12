/**
 * Unified Rating interface for all rating operations across the system.
 * This replaces the multiple Rating interfaces that were previously scattered
 * across different files, ensuring type safety and consistency.
 */
export interface Rating {
    /** The criterion being rated */
    criterion: string;
    
    /** The target goal score (minimum acceptable score) */
    goal: number;
    
    /** The actual achieved score */
    actual: number;
    
    /** Whether the rating passed (actual >= goal) */
    passed: boolean;
    
    /** Optional justification/explanation for the rating */
    justification?: string;
    
    /** Optional additional description */
    description?: string;
}

 