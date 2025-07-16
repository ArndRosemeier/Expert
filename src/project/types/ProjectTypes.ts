


export interface GenerationContext {
    type: 'single' | 'summary' | 'bulk';
    nodeIds: string[];
    abortController: AbortController;
}

export interface GenerationInfo {
    type: string;
    nodeCount: number;
    canAbort: boolean;
}




 