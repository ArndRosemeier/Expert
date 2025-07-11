export interface CoherenceContradiction {
    fact_in_outline: string;
    fact_in_expansion: string;
    justification: string;
    offending_child_title: string;
    offending_child_id?: string; // Will be populated during analysis
    parentNodeTitle?: string; // Added for comprehensive multi-node analysis
    parentNodeId?: string; // Added for comprehensive multi-node analysis
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