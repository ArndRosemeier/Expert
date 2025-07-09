export interface ContextIssue {
    problematic_context_item: string;
    reason_for_problem: string;
    justification: string;
    severity: 'high' | 'medium' | 'low';
}

export interface ContextAnalysisResult {
    issues: ContextIssue[];
    hasIssues: boolean;
    analysisTimestamp: Date;
    nodeId: string;
    originalContext: string;
}

export interface ContextAnalysisRequest {
    nodeContent: string;
    parentContext: string;
    nodeTitle: string;
    nodeId: string;
} 