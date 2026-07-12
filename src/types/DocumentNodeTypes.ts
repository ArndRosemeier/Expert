import type { LoopHistoryItem } from '../LoopOrchestrator';
import type { EventData, CharacterData, PlaceData } from '../overview-board/types/OverviewTypes';
import type { Rating } from './RatingTypes';

export type ContentVersionMetadata = Record<string, unknown>;

export interface LastGenerationParameters {
    draftLevel: number;
    contentLevel: number;
    coherenceLevel: number;
    autofixSeverity: number;
    deterministicChildCreation?: boolean;
}

export interface SerializedGenerationIterationJSON {
    iteration: number;
    content: string;
    ratings: Rating[];
    wasChosen: boolean;
    timestamp: string | number | Date;
}

export interface SerializedGenerationSessionJSON {
    sessionId: string;
    startTime: string | number | Date;
    endTime?: string | number | Date;
    originalPrompt: string;
    iterations: SerializedGenerationIterationJSON[];
    finalIterationNumber: number;
    success: boolean;
    totalIterationsAttempted: number;
}

export interface SerializedContentVersionJSON {
    id: string;
    content: string;
    title: string;
    tags: string[] | Record<string, unknown>;
    timestamp: string | number | Date;
    ratings?: Rating[];
    creatorModel?: string;
    metadata?: ContentVersionMetadata;
    context?: string;
    label?: string;
}

export interface SerializedConditionalContextItemJSON {
    id: string;
    text: string;
    keywords?: string[];
    childScope?: unknown;
    leavesOnly?: boolean;
}

export interface SerializedTodoItemJSON {
    id: string;
    description: string;
    relatedNodes: { id: string; title: string }[];
    timestamp: string | number | Date;
    completed?: boolean;
    logicError?: {
        type: string;
        severity: number;
        justification: string;
        suggestedFix?: string;
    };
}

/** Overview cache entry while restoring from persisted JSON (dates/maps may be raw). */
export interface RestoringOverviewDataJSON {
    layerName: string;
    sourceNodes: string[];
    lastUpdated?: string | number | Date;
    events?: Map<string, EventData> | [string, EventData][] | Record<string, EventData>;
    characters?: Map<string, CharacterData> | [string, CharacterData][] | Record<string, CharacterData>;
    places?: Map<string, PlaceData> | [string, PlaceData][] | Record<string, PlaceData>;
}

export interface RestoringOverviewCacheEntryJSON {
    layerName: string;
    timestamp: string | number | Date;
    data: RestoringOverviewDataJSON;
    analyzedNodeIds: string[];
    sourceNodeId: string;
}

export interface DocumentNodeJSON {
    id: string;
    level: number;
    parentId: string | null;
    title?: string;
    template?: string[];
    layerLengths?: (number | null)[];
    collapsed?: boolean;
    generationPrompt?: string | null;
    generationHistory?: LoopHistoryItem[];
    generationSessions?: SerializedGenerationSessionJSON[];
    versions?: SerializedContentVersionJSON[];
    overviewBoardCache?: [string, unknown][];
    lastGenerationParameters?: LastGenerationParameters | null;
    todos?: SerializedTodoItemJSON[];
    notes?: string;
    conditionalContextItems?: unknown[];
    children?: DocumentNodeJSON[];
    content?: string;
    _content?: string;
    creatorModel?: string;
}

/** Imported/persisted node input where optional fields may be explicitly undefined. */
type AllowUndefined<T> = {
    [K in keyof T]: T[K] | undefined;
};

export type DocumentNodeJSONInput = AllowUndefined<Partial<DocumentNodeJSON>> & Pick<DocumentNodeJSON, 'id' | 'level' | 'parentId'>;
