export interface ContextIssue {
    item_number: number;
    problematic_context_item: string;
    reason_for_problem: string;
    justification: string;
    severity: number; // 1-10, where 10 is most severe
}

export interface ContextSortingResult {
    sorted_items: number[];
    recommended_cutoff: number;
    cutoff_reasoning: string;
}

export interface ContextAnalysisResult {
    // Legacy format for backward compatibility
    issues: ContextIssue[];
    hasIssues: boolean;
    analysisTimestamp: Date;
    nodeId: string;
    originalContext: string;
    contextMismatch?: boolean;
    
    // New sorting format
    sortingResult?: ContextSortingResult;
    isSortingMode?: boolean;
}

export interface ContextAnalysisRequest {
    nodeContent: string;
    parentContext: string;
    nodeTitle: string;
    nodeId: string;
} 