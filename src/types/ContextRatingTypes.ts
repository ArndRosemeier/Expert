export interface ContextRating {
    item_number: number;
    should_keep: boolean; // true to keep, false to remove
}

export interface ContextRatingResult {
    ratings: ContextRating[];
    analysisTimestamp: Date;
    nodeId: string;
    originalContext: string;
    contextMismatch?: boolean;
}

export interface ContextRatingRequest {
    nodeContent: string;
    parentContext: string;
    nodeTitle: string;
    nodeId: string;
} 