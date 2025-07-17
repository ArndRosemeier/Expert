export interface ContextRating {
    item_number: number;
    relevancy_rating: number; // 1-10, where 10 is most relevant
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