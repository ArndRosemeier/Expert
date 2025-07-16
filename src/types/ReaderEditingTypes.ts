import { DocumentNode } from '../DocumentNode';

export interface ReaderEditAction {
    id: string;
    title: string;              // Button label (e.g., "More details")
    prompt: string;             // Template with placeholders
    model: 'creator' | 'editor' | 'rater' | 'prose';
    enabled: boolean;
    order: number;              // For button ordering
    description?: string;       // Optional description for config UI
}

export interface EditActionConfig {
    actions: ReaderEditAction[];
    version: number;
}

export interface TextSelection {
    text: string;
    startOffset: number;
    endOffset: number;
    nodeId: string;
    element: HTMLElement;
}

export interface EditContext {
    selection: TextSelection | null;
    cursorPosition: number | null;
    nodeId: string;
    node: DocumentNode;
}

export interface EditState {
    isEditMode: boolean;
    isDirty: boolean;
    lastSaved: Date | null;
    editableNodes: Map<string, HTMLElement>;
}


 