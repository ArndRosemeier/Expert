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

/**
 * Type guard to check if an object is a valid Rating
 */
export function isRating(obj: any): obj is Rating {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        typeof obj.criterion === 'string' &&
        typeof obj.goal === 'number' &&
        typeof obj.actual === 'number' &&
        typeof obj.passed === 'boolean' &&
        (obj.justification === undefined || typeof obj.justification === 'string') &&
        (obj.description === undefined || typeof obj.description === 'string')
    );
}

/**
 * Helper function to create a Rating with automatic passed calculation
 */
export function createRating(
    criterion: string,
    goal: number,
    actual: number,
    justification?: string,
    description?: string
): Rating {
    const rating: Rating = {
        criterion,
        goal,
        actual,
        passed: actual >= goal
    };
    
    if (justification !== undefined) {
        rating.justification = justification;
    }
    
    if (description !== undefined) {
        rating.description = description;
    }
    
    return rating;
}

/**
 * Helper function to validate an array of ratings
 */
export function validateRatings(ratings: any[]): Rating[] {
    const validRatings: Rating[] = [];
    
    for (const rating of ratings) {
        if (isRating(rating)) {
            validRatings.push(rating);
        } else {
            throw new Error(`Invalid rating object: ${JSON.stringify(rating)}`);
        }
    }
    
    return validRatings;
} 