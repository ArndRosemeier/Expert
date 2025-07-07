export interface CoherenceContradiction {
    fact_in_outline: string;
    fact_in_expansion: string;
    justification: string;
    child_index: number;
    offending_child_title: string; // Populated from child_index during analysis
    offending_child_id: string; // Populated from child_index during analysis
}

export interface CoherenceAnalysisResult {
    contradictions: CoherenceContradiction[];
    hasContradictions: boolean;
    analysisTimestamp: Date;
    parentNodeId: string;
    childNodeIds: string[];
}

export interface CoherenceAnalysisRequest {
    parentContent: string;
    parentContext: string;
    childrenContent: string;
    parentNodeTitle: string;
    childNodeTitles: string[];
    childNodes: Array<{
        id: string;
        title: string;
        content: string;
        isLeaf: boolean;
    }>;
} 