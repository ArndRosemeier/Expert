/**
 * Core type definitions for the XML Story Creation System
 * 
 * This module defines all the fundamental data structures used throughout
 * the XML-enabled collaborative story creation feature.
 */

// ============================================================================
// CORE STORY ELEMENT TYPES
// ============================================================================

export type StoryElementType = 'outline' | 'context';

export interface StoryElement {
    id: string;                      // User-defined ID for referencing in chat (e.g., "elara", "opening_scene", "1")
    type: StoryElementType;          // Type of story element
    description: string;             // Full content including name/title and details
    timestamp: Date;                 // When created
    sourceText: string;              // Original XML tag that created this element
    lastModified: Date;              // When last modified (by AI or human)
    
    // Human editing tracking
    isHumanEdited: boolean;          // Track human modifications
    editHistory: EditRecord[];       // Track all changes
    lastEditTimestamp?: Date;        // When last edited by human
    
    // AI highlighting system
    isNewFromAI: boolean;            // True if created by AI in latest response
    isUpdatedByAI: boolean;          // True if modified by AI in latest response
    highlightUntilNext: boolean;     // Visual highlight until next user interaction
}

export interface EditRecord {
    timestamp: Date;
    type: 'ai_edit' | 'human_edit' | 'creation';
    changes: {
        description?: { from: string, to: string };
    };
}

// ============================================================================
// XML PARSING TYPES
// ============================================================================

export interface ParsedResponse {
    cleanedText: string;             // Natural language with XML removed
    extractedElements: StoryElement[]; // New/updated story elements
    systemCommands: SystemCommand[];  // System commands like </refresh>
    errors: ParseError[];            // Any parsing errors encountered
}

export interface SystemCommand {
    type: 'refresh' | 'edit' | 'delete' | 'rename' | 'outline_replace' | 'append' | 'replace_command';
    parameters?: Record<string, string>;
    content?: string; // For commands like outline_replace that have content between tags
    searchText?: string; // For replace_command: what to search for
    replaceText?: string; // For replace_command: what to replace with
    timestamp: Date;
}

export interface ParseError {
    type: 'malformed_xml' | 'invalid_structure' | 'missing_required_field';
    message: string;
    sourceText: string;
    line?: number;
}

// ============================================================================
// HUMAN EDITING TYPES
// ============================================================================

export interface HumanEdit {
    elementId: string;
    elementType: StoryElementType;
    field: 'description';
    oldValue: string;
    newValue: string;
    timestamp: Date;
    acknowledged: boolean;           // Whether AI has been notified
}

export interface EditableFieldState {
    isEditing: boolean;
    originalValue: string;
    currentValue: string;
    hasUnsavedChanges: boolean;
    validationError?: string;
}

// ============================================================================
// HIGHLIGHTING SYSTEM TYPES
// ============================================================================

export type HighlightType = 'human_edit' | 'ai_new' | 'ai_update';

export interface ElementHighlight {
    elementId: string;
    type: HighlightType;
    timestamp: Date;
    clearOnNextInteraction: boolean;
}

export interface HighlightState {
    activeHighlights: Map<string, ElementHighlight>; // elementId -> highlight
    pendingClear: string[];          // IDs to clear on next user interaction
}

// ============================================================================
// WHITEBOARD STATE TYPES
// ============================================================================

export interface WhiteboardState {
    elements: Map<string, StoryElement>;     // elementId -> element
    elementsByType: Map<StoryElementType, string[]>; // type -> element IDs
    highlights: HighlightState;
    pendingHumanEdits: HumanEdit[];          // Edits waiting to be sent to AI
    searchFilter: string;
    typeFilters: Set<StoryElementType>;      // Which types to show
    collapsedSections: Set<StoryElementType>; // Which sections are collapsed
}

// ============================================================================
// CONTEXT REFRESH TYPES
// ============================================================================

export interface WhiteboardContext {
    elements: StoryElement[];
    pendingHumanEdits: HumanEdit[];
    totalElementCount: number;
    elementCounts: Record<StoryElementType, number>;
    lastUpdated: Date;
}

export interface ContextRefreshOptions {
    includeEditHistory: boolean;
    maxElementsPerType: number;
    prioritizeRecent: boolean;
    includeHumanEditSummary: boolean;
}

// ============================================================================
// AI FEEDBACK TYPES
// ============================================================================

export interface AIFeedbackMessage {
    type: 'human_edits' | 'whiteboard_state' | 'system_notification';
    content: string;
    timestamp: Date;
    editsIncluded: HumanEdit[];      // Which edits this message covers
}

export interface HumanEditSummary {
    totalEdits: number;
    editsByType: Record<StoryElementType, number>;
    recentEdits: HumanEdit[];        // Most recent edits to highlight
    formattedMessage: string;        // Ready-to-inject message for AI
}

// ============================================================================
// XML TAG DEFINITIONS
// ============================================================================

export interface XMLTagDefinition {
    tagName: string;
    elementType: StoryElementType;
    requiredAttributes: string[];
    optionalAttributes: string[];
    allowsContent: boolean;          // Whether tag can have content between open/close
    isSelfClosing: boolean;          // Whether tag is self-closing
}

export const XML_TAG_DEFINITIONS: XMLTagDefinition[] = [
    {
        tagName: 'outline',
        elementType: 'outline',
        requiredAttributes: ['id', 'description'],
        optionalAttributes: ['before', 'after', 'position'],
        allowsContent: false,
        isSelfClosing: true
    },
    {
        tagName: 'context',
        elementType: 'context',
        requiredAttributes: ['id', 'description'],
        optionalAttributes: ['position'],
        allowsContent: false,
        isSelfClosing: true
    }
];

// ============================================================================
// ADVANCED EDITING COMMANDS (Phase 2)
// ============================================================================

export interface AIEditCommand {
    command: 'edit' | 'delete' | 'rename';
    targetId: string;
    newValue?: string;
    field?: 'name' | 'description';
    timestamp: Date;
}

export interface RelationshipElement {
    id: string;
    type: 'family' | 'location' | 'conflict' | 'alliance' | 'possession';
    fromElementId: string;
    toElementId: string;
    description: string;
    timestamp: Date;
}

// ============================================================================
// EVENT TYPES FOR COMPONENT COMMUNICATION
// ============================================================================

export interface XMLStoryEvent {
    type: 'element_created' | 'element_updated' | 'element_deleted' | 
          'human_edit' | 'highlight_applied' | 'highlight_cleared' |
          'context_refresh_requested' | 'ai_feedback_generated' | 'command_failed' |
          'outline_append_requested' | 'outline_replace_requested';
    payload: Record<string, unknown>;
    timestamp: Date;
}

export interface ElementCreatedEvent extends XMLStoryEvent {
    type: 'element_created';
    payload: {
        element: StoryElement;
        source: 'ai' | 'human';
    };
}

export interface ElementUpdatedEvent extends XMLStoryEvent {
    type: 'element_updated';
    payload: {
        elementId: string;
        field: 'name' | 'description';
        oldValue: string;
        newValue: string;
        source: 'ai' | 'human';
    };
}

export interface HumanEditEvent extends XMLStoryEvent {
    type: 'human_edit';
    payload: {
        edit: HumanEdit;
        element: StoryElement;
    };
}

export interface CommandFailedEvent extends XMLStoryEvent {
    type: 'command_failed';
    payload: {
        command: SystemCommand;
        error: string;
    };
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface XMLStoryConfig {
    // UI Configuration
    maxElementsPerSection: number;
    autoSaveDelay: number;           // Milliseconds before auto-saving edits
    highlightDuration: number;       // How long to show highlights
    
    // Parser Configuration
    allowPartialXML: boolean;        // Whether to parse incomplete XML
    strictValidation: boolean;       // Whether to enforce strict XML validation
    maxElementsPerResponse: number;  // Limit elements from single AI response
    
    // Context Management
    maxContextElements: number;      // Max elements to include in context refresh
    prioritizeRecentEdits: boolean;  // Whether to prioritize recent human edits
    includeEditHistory: boolean;     // Whether to include edit history in context
    
    // Feedback Configuration
    batchEditNotifications: boolean; // Whether to batch multiple edit notifications
    editBatchTimeout: number;        // Milliseconds to wait before sending batched edits
}

export const DEFAULT_XML_STORY_CONFIG: XMLStoryConfig = {
    maxElementsPerSection: 20,
    autoSaveDelay: 2000,
    highlightDuration: 20000,  // 20 seconds for updated outline parts
    allowPartialXML: true,
    strictValidation: false,
    maxElementsPerResponse: 10,
    maxContextElements: 50,
    prioritizeRecentEdits: true,
    includeEditHistory: false,
    batchEditNotifications: true,
    editBatchTimeout: 3000
};

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type ElementID = string;
export type ElementTypeFilter = Set<StoryElementType>;
export type ElementMap = Map<ElementID, StoryElement>;
export type HighlightMap = Map<ElementID, ElementHighlight>;

// Type guards for runtime type checking
export function isStoryElement(obj: unknown): obj is StoryElement {
    return obj !== null && 
           typeof obj === 'object' &&
           'id' in obj &&
           'type' in obj &&
           'description' in obj &&
           'timestamp' in obj &&
           typeof (obj as StoryElement).id === 'string' &&
           typeof (obj as StoryElement).type === 'string' &&
           typeof (obj as StoryElement).description === 'string' &&
           (obj as StoryElement).timestamp instanceof Date;
}

export function isHumanEdit(obj: unknown): obj is HumanEdit {
    return obj !== null &&
           typeof obj === 'object' &&
           'elementId' in obj &&
           'field' in obj &&
           'oldValue' in obj &&
           'newValue' in obj &&
           'timestamp' in obj &&
           typeof (obj as HumanEdit).elementId === 'string' &&
           typeof (obj as HumanEdit).field === 'string' &&
           typeof (obj as HumanEdit).oldValue === 'string' &&
           typeof (obj as HumanEdit).newValue === 'string' &&
           (obj as HumanEdit).timestamp instanceof Date;
}

export function isSystemCommand(obj: unknown): obj is SystemCommand {
    return obj !== null &&
           typeof obj === 'object' &&
           'type' in obj &&
           'timestamp' in obj &&
           typeof (obj as SystemCommand).type === 'string' &&
           (obj as SystemCommand).timestamp instanceof Date;
} 