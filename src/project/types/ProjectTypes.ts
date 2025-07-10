import { DocumentNode } from '../../DocumentNode';
import { LoopOrchestrator, LoopProgress } from '../../LoopOrchestrator';
import { SettingsManager } from '../../SettingsManager';
import { OpenRouterClient } from '../../OpenRouterClient';

export interface ProjectDependencies {
    loopOrchestrator: LoopOrchestrator;
    settingsManager: SettingsManager;
    openRouterClient: OpenRouterClient;
}

export interface GenerationOptions {
    includeContent: boolean;
    recursive: boolean;
}

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

export interface LoadResult {
    projects: ProjectRecord[] | any[]; // ProjectRecord[] from storage, ProjectManager[] after processing
    activeProjectId: string | null;
}

export interface ProjectRecord {
    id: string;
    title: string;
    templateName: string;
    createdAt: Date;
    lastModified: Date;
    data: string; // serialized project data
}

export type ProjectManagerEvents = {
    'project-loaded': [];
    'node-selected': [node: DocumentNode | null];
    'nodeGenerationStarted': [e: { nodeId: string, node: DocumentNode }];
    'nodeGenerationComplete': [e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }];
    'nodeGenerationAborted': [e: { nodeId: string, node: DocumentNode }];
    'loop-progress': [e: { nodeId: string, progress: LoopProgress }];
    'high-level-progress': [e: { nodeId: string, message: string, current: number, total: number }];
    'unified-progress': [e: { nodeId: string; operations?: { message: string; current: number; total: number }; iterations?: { message: string; current: number; total: number }; stages?: { message: string; current: number; total: number }; detail?: string }];
    'tree-update-needed': [e: { nodeId: string; reason: string }];
    'coherenceAnalysisStarted': [e: { nodeId: string, node: DocumentNode }];
    'coherenceAnalysisComplete': [e: { nodeId: string, node: DocumentNode, hasContradictions: boolean, contradictionCount: number }];
    'nodePromptGenerated': [e: { nodeId:string, prompt: string, isPromptGenerating: boolean }];
    'nodeSummaryGenerated': [e: { nodeId: string, summary: string }];
    'error': [message: string];
};

export type GenerationEvents = {
    'generationStarted': [e: { nodeId: string, node: DocumentNode }];
    'generationComplete': [e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }];
    'generationAborted': [e: { nodeId: string, node: DocumentNode }];
    'progress': [e: { nodeId: string, progress: LoopProgress }];
    'high-level-progress': [e: { nodeId: string, message: string, current: number, total: number }];
    'error': [message: string];
}; 