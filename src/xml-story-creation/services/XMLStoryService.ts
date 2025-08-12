/**
 * XML Story Service
 * 
 * Main orchestrator service for the XML story creation system.
 * Coordinates parsing, state management, highlighting, and human edit tracking.
 */

import type {
    StoryElement,
    StoryElementType,
    WhiteboardState,
    HumanEdit,
    ParsedResponse,
    XMLStoryEvent,
    ElementCreatedEvent,
    ElementUpdatedEvent,
    HumanEditEvent,
    XMLStoryConfig,
    ElementID,
    SystemCommand
} from '../types/XMLStoryTypes';
import { DEFAULT_XML_STORY_CONFIG } from '../types/XMLStoryTypes';
import { XMLStoryParser } from '../parser/XMLStoryParser';
import { ElementIDGenerator } from './ElementIDGenerator';

/**
 * Event callback type for component communication
 */
export type XMLStoryEventCallback = (event: XMLStoryEvent) => void;

/**
 * Main service class for XML story creation system
 * 
 * ARCHITECTURE OVERVIEW:
 * - This service manages CONTEXT ITEMS (characters, locations, etc.) as XML elements
 * - OUTLINE CONTENT is stored as plain text in XMLStoryModal.outlineHistory, NOT here!
 * - Commands like 'edit', 'delete' work on context elements (handled here)
 * - Commands like 'append', 'replace_command', 'outline_replace' work on outline text (handled in modal)
 * - Communication: Service emits events → Modal handles outline operations
 */
export class XMLStoryService {
    private parser: XMLStoryParser;
    private idGenerator: ElementIDGenerator;
    private state: WhiteboardState;
    private config: XMLStoryConfig;
    private eventListeners: XMLStoryEventCallback[] = [];
    private pendingEditBatch: HumanEdit[] = [];
    private editBatchTimeout: number | null = null;
    
    constructor(config?: Partial<XMLStoryConfig>) {
        this.parser = new XMLStoryParser();
        this.idGenerator = ElementIDGenerator.getInstance();
        this.config = { ...DEFAULT_XML_STORY_CONFIG, ...config };
        
        // Initialize empty state
        this.state = {
            elements: new Map(),
            elementsByType: new Map(),
            highlights: {
                activeHighlights: new Map(),
                pendingClear: []
            },
            pendingHumanEdits: [],
            searchFilter: '',
            typeFilters: new Set(['outline', 'context']),
            collapsedSections: new Set()
        };
        
        // Initialize type maps
        this.initializeTypeMaps();
    }
    
    // ========================================================================
    // PUBLIC API - CORE FUNCTIONALITY
    // ========================================================================
    
    /**
     * Process an AI response to extract story elements
     */
    public async processAIResponse(aiResponse: string): Promise<ParsedResponse> {
        try {
            // Log raw AI response for debugging

            
            // Parse the response
            const parseResult = this.parser.parseResponse(aiResponse, this.state.elements);
            
            // Process extracted elements
            for (const element of parseResult.extractedElements) {
                await this.addOrUpdateElement(element, 'ai');
            }
            
            // Handle system commands
            for (const command of parseResult.systemCommands) {
                await this.handleSystemCommand(command);
            }
            
            // Clear pending human edits that have been addressed
            this.clearAddressedHumanEdits(parseResult.extractedElements);
            
            // Emit processing complete event
            this.emitEvent({
                type: 'context_refresh_requested',
                payload: { parseResult },
                timestamp: new Date()
            });
            
            return parseResult;
            
        } catch (error) {
            console.error('Error processing AI response:', error);
            throw error;
        }
    }
    
    /**
     * Delete an element from the whiteboard
     */
    public async deleteElement(elementId: string): Promise<void> {
        const element = this.state.elements.get(elementId);
        if (!element) {
            throw new Error(`Element with id ${elementId} not found`);
        }
        
        // Remove from main elements map
        this.state.elements.delete(elementId);
        
        // Remove from type mapping
        const typeElements = this.state.elementsByType.get(element.type);
        if (typeElements) {
            const index = typeElements.indexOf(elementId);
            if (index !== -1) {
                typeElements.splice(index, 1);
            }
        }
        
        // Emit delete event
        this.emitEvent({
            type: 'element_deleted',
            payload: { 
                elementId, 
                elementType: element.type
            },
            timestamp: new Date()
        });
    }
    
    /**
     * Handle human edit to an element
     */
    public async handleHumanEdit(
        elementId: ElementID,
        newValue: string
    ): Promise<void> {
        const element = this.state.elements.get(elementId);
        if (!element) {
            throw new Error(`Element not found: ${elementId}`);
        }
        
        const oldValue = element.description;
        
        // Don't process if value hasn't actually changed
        if (oldValue === newValue) {
            return;
        }
        
        // Create human edit record
        const humanEdit: HumanEdit = {
            elementId,
            elementType: element.type,
            field: 'description',
            oldValue,
            newValue,
            timestamp: new Date(),
            acknowledged: false
        };
        
        // Update the element
        const updatedElement: StoryElement = { ...element };
        updatedElement.description = newValue;
        
        // Add to edit history
        updatedElement.editHistory.push({
            timestamp: new Date(),
            type: 'human_edit',
            changes: { description: { from: oldValue, to: newValue } }
        });
        
        updatedElement.isHumanEdited = true;
        updatedElement.lastEditTimestamp = new Date();
        
        // Clear AI highlights since human has now edited
        updatedElement.isNewFromAI = false;
        updatedElement.isUpdatedByAI = false;
        
        // Update state
        this.state.elements.set(elementId, updatedElement);
        
        // Add to pending human edits for AI feedback
        if (this.config.batchEditNotifications) {
            this.addToPendingEditBatch(humanEdit);
        } else {
            this.state.pendingHumanEdits.push(humanEdit);
        }
        
        // Emit human edit event
        this.emitEvent({
            type: 'human_edit',
            payload: { edit: humanEdit, element: updatedElement },
            timestamp: new Date()
        } as HumanEditEvent);
    }
    
    /**
     * Clear AI highlights when user interacts (sends next message)
     */
    public clearAIHighlights(): void {
        let clearedAny = false;
        
        for (const [elementId, element] of this.state.elements.entries()) {
            if (element.highlightUntilNext) {
                const updatedElement = { ...element };
                updatedElement.isNewFromAI = false;
                updatedElement.isUpdatedByAI = false;
                updatedElement.highlightUntilNext = false;
                
                this.state.elements.set(elementId, updatedElement);
                clearedAny = true;
            }
        }
        
        // Clear highlight state
        this.state.highlights.activeHighlights.clear();
        this.state.highlights.pendingClear = [];
        
        if (clearedAny) {
            this.emitEvent({
                type: 'highlight_cleared',
                payload: { reason: 'user_interaction' },
                timestamp: new Date()
            });
        }
    }
    
    /**
     * Add a new empty element that can be edited manually
     */
    public async addNewEmptyElement(type: StoryElementType): Promise<void> {
        // Generate a unique ID for the new element
        const id = this.idGenerator.generateId(type);
        
        // Create the new empty element
        const newElement: StoryElement = {
            id,
            type,
            description: '', // Empty description for manual editing
            timestamp: new Date(),
            sourceText: `<${type} id="${id}" description="" />`, // Generate synthetic source
            lastModified: new Date(),
            isHumanEdited: false,
            editHistory: [{
                timestamp: new Date(),
                type: 'creation',
                changes: {}
            }],
            isNewFromAI: false,
            isUpdatedByAI: false,
            highlightUntilNext: false
        };
        
        // Add the element via the existing method (will trigger events)
        await this.addOrUpdateElement(newElement, 'human');
    }
    
    /**
     * Get current whiteboard state
     */
    public getWhiteboardState(): WhiteboardState {
        return { ...this.state };
    }
    
    /**
     * Get elements for context refresh
     */
    public getElementsForContext(): StoryElement[] {
        const elements: StoryElement[] = [];
        
        // Get elements in their natural list order (as stored in elementsByType arrays)
        for (const [_type, elementIds] of this.state.elementsByType) {
            for (const elementId of elementIds) {
                const element = this.state.elements.get(elementId);
                if (element) {
                    elements.push(element);
                }
            }
        }
        
        // No artificial limit - let LLM capabilities determine the real limit
        return elements;
    }
    
    /**
     * Get pending human edits for AI feedback
     */
    public getPendingHumanEdits(): HumanEdit[] {
        return [...this.state.pendingHumanEdits];
    }
    
    /**
     * Mark human edits as acknowledged by AI
     */
    public markHumanEditsAcknowledged(edits: HumanEdit[]): void {
        edits.forEach(edit => {
            edit.acknowledged = true;
        });
        
        // Remove acknowledged edits from pending list
        this.state.pendingHumanEdits = this.state.pendingHumanEdits.filter(
            edit => !edit.acknowledged
        );
    }
    
    // ========================================================================
    // SEARCH AND FILTERING
    // ========================================================================
    
    /**
     * Set search filter
     */
    public setSearchFilter(filter: string): void {
        this.state.searchFilter = filter.toLowerCase();
    }
    
    /**
     * Toggle type filter
     */
    public toggleTypeFilter(type: StoryElementType): void {
        if (this.state.typeFilters.has(type)) {
            this.state.typeFilters.delete(type);
        } else {
            this.state.typeFilters.add(type);
        }
    }
    
    /**
     * Toggle section collapse state
     */
    public toggleSectionCollapse(type: StoryElementType): void {
        if (this.state.collapsedSections.has(type)) {
            this.state.collapsedSections.delete(type);
        } else {
            this.state.collapsedSections.add(type);
        }
    }
    
    /**
     * Get filtered elements for display
     */
    public getFilteredElements(): Map<StoryElementType, StoryElement[]> {
        const filtered = new Map<StoryElementType, StoryElement[]>();
        
        for (const type of this.state.typeFilters) {
            const elementIds = this.state.elementsByType.get(type);
            if (!elementIds) {
                throw new Error(`Invalid element type: ${type}`);
            }
            const elements = elementIds
                .map(id => this.state.elements.get(id))
                .filter((element): element is StoryElement => {
                    if (!element) return false;
                    
                    // Apply search filter
                    if (this.state.searchFilter) {
                        const searchText = element.description.toLowerCase();
                        return searchText.includes(this.state.searchFilter);
                    }
                    
                    return true;
                })
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            
            if (elements.length > 0) {
                filtered.set(type, elements.slice(0, this.config.maxElementsPerSection));
            }
        }
        
        return filtered;
    }
    
    // ========================================================================
    // EVENT SYSTEM
    // ========================================================================
    
    /**
     * Add event listener
     */
    public addEventListener(callback: XMLStoryEventCallback): void {
        this.eventListeners.push(callback);
    }
    
    /**
     * Remove event listener
     */
    public removeEventListener(callback: XMLStoryEventCallback): void {
        const index = this.eventListeners.indexOf(callback);
        if (index > -1) {
            this.eventListeners.splice(index, 1);
        }
    }
    


    /**
     * Emit event to all listeners
     */
    public emitEvent(event: XMLStoryEvent): void {
        this.eventListeners.forEach(callback => {
            callback(event);
        });
    }
    
    // ========================================================================
    // PRIVATE HELPER METHODS
    // ========================================================================
    
    /**
     * Initialize type maps
     */
    private initializeTypeMaps(): void {
        const types: StoryElementType[] = ['outline', 'context'];
        types.forEach(type => {
            this.state.elementsByType.set(type, []);
        });
    }
    
    /**
     * Add or update an element in the state
     */
    private async addOrUpdateElement(element: StoryElement & { insertPosition?: number }, source: 'ai' | 'human'): Promise<void> {
        const existingElement = this.state.elements.get(element.id);
        
        if (existingElement) {
            // Update existing element
            this.state.elements.set(element.id, element);
            
            this.emitEvent({
                type: 'element_updated',
                payload: {
                    elementId: element.id,
                    field: 'description', // Simplified for now
                    oldValue: existingElement.description,
                    newValue: element.description,
                    source
                },
                timestamp: new Date()
            } as ElementUpdatedEvent);
        } else {
            // Add new element
            this.state.elements.set(element.id, element);
            
            // Add to type mapping with position handling
            const typeList = this.state.elementsByType.get(element.type);
        if (!typeList) {
            throw new Error(`Invalid element type: ${element.type}`);
        }
            
            // Handle position-based insertion
            if (element.insertPosition !== undefined) {
                const position = element.insertPosition;
                // Convert 1-indexed position to 0-indexed array index
                const insertIndex = Math.max(0, Math.min(position - 1, typeList.length));
                typeList.splice(insertIndex, 0, element.id);

            } else {
                // Default behavior: add to end
                typeList.push(element.id);

            }
            this.state.elementsByType.set(element.type, typeList);
            
            this.emitEvent({
                type: 'element_created',
                payload: { element, source },
                timestamp: new Date()
            } as ElementCreatedEvent);
        }
        
        // Handle highlighting
        if (element.highlightUntilNext) {
            this.state.highlights.activeHighlights.set(element.id, {
                elementId: element.id,
                type: element.isNewFromAI ? 'ai_new' : 'ai_update',
                timestamp: new Date(),
                clearOnNextInteraction: true
            });
        }
    }
    
    /**
     * Handle system commands from AI
     */
    private async handleSystemCommand(command: SystemCommand): Promise<void> {
        switch (command.type) {
            case 'refresh':
                this.emitEvent({
                    type: 'context_refresh_requested',
                    payload: { command },
                    timestamp: new Date()
                });
                break;
                
            case 'edit':
                this.handleEditCommand(command);
                (command as any).executedRaw = command.rawXml || '';
                break;
                
            case 'delete':
                this.handleDeleteCommand(command);
                (command as any).executedRaw = command.rawXml || '';
                break;
                
            case 'append':
                // IMPORTANT: Outline content is stored as TEXT in XMLStoryModal.outlineHistory,
                // NOT as XML elements in this service! We emit an event for the modal to handle.
                // This is different from context items which ARE stored as elements here.
                this.emitEvent({
                    type: 'outline_append_requested',
                    payload: { command },
                    timestamp: new Date()
                });
                break;
                
            case 'replace_command':
                // IMPORTANT: Outline content is stored as TEXT in XMLStoryModal.outlineHistory,
                // NOT as XML elements in this service! We emit an event for the modal to handle.
                // This is different from context items which ARE stored as elements here.
                this.emitEvent({
                    type: 'outline_replace_requested',
                    payload: { command },
                    timestamp: new Date()
                });
                break;
                
            case 'replace_section':
                // IMPORTANT: Outline content is stored as TEXT in XMLStoryModal.outlineHistory,
                // NOT as XML elements in this service! We emit an event for the modal to handle.
                this.emitEvent({
                    type: 'section_replace_requested',
                    payload: { command },
                    timestamp: new Date()
                });
                break;
                
            case 'remove_section':
                // IMPORTANT: Outline content is stored as TEXT in XMLStoryModal.outlineHistory,
                // NOT as XML elements in this service! We emit an event for the modal to handle.
                this.emitEvent({
                    type: 'section_remove_requested',
                    payload: { command },
                    timestamp: new Date()
                });
                break;

            // 'change_context_scope' removed (legacy). Ignore if encountered.
                
            default:
                console.warn('Unknown system command:', command.type);
        }
    }

    // Removed reconstruction; we store rawXml directly from parser

    // Legacy handler removed: change_context_scope
    
    /**
     * Handle AI edit commands (supports both old attribute-based and new content-based syntax)
     */
    private handleEditCommand(command: SystemCommand): void {
        if (!command.parameters) return;
        
        const elementId = command.parameters['id'];
        
        // Support both old and new syntax:
        // Old: </edit id="element_id" description="New description">
        // New: </edit id="element_id">New description content</edit>
        const newDescription = command.content || command.parameters['description'];
        
        if (!elementId) {
            console.warn('Edit command missing required id parameter');
            return;
        }
        
        if (!newDescription) {
            console.warn('Edit command missing description content');
            return;
        }
        
        const element = this.getElement(elementId);
        if (!element) {
            console.warn(`Element with id ${elementId} not found for edit command`);
            return;
        }
        
        // Store original values for history
        const oldDescription = element.description;
        
        // Update element properties with new content
        element.description = newDescription;
        
        // Mark as updated by AI
        element.isUpdatedByAI = true;
        element.highlightUntilNext = true;
        element.lastModified = new Date();
        
        // Add to edit history
        element.editHistory.push({
            timestamp: new Date(),
            type: 'ai_edit',
            changes: {
                description: { from: oldDescription, to: newDescription }
            }
        });
        
        this.emitEvent({
            type: 'element_updated',
            payload: { element, command },
            timestamp: new Date()
        });
    }
    
    /**
     * Handle AI delete commands
     */
    private handleDeleteCommand(command: SystemCommand): void {
        if (!command.parameters) return;
        
        const elementId = command.parameters['id'];
        if (!elementId) {
            console.warn('Delete command missing required id parameter');
            return;
        }
        
        const element = this.getElement(elementId);
        if (!element) {
            console.warn(`Element with id ${elementId} not found for delete command`);
            return;
        }
        
        // Remove from state maps
        this.state.elements.delete(elementId);
        
        // Remove from type-based map
        const typeElements = this.state.elementsByType.get(element.type);
        if (typeElements) {
            const index = typeElements.findIndex((id: string) => id === elementId);
            if (index !== -1) {
                typeElements.splice(index, 1);
            }
        }
        
        this.emitEvent({
            type: 'element_deleted',
            payload: { element, command },
            timestamp: new Date()
        });
    }
    


    
    /**
     * Add human edit to pending batch
     */
    private addToPendingEditBatch(edit: HumanEdit): void {
        this.pendingEditBatch.push(edit);
        
        // Clear existing timeout
        if (this.editBatchTimeout) {
            clearTimeout(this.editBatchTimeout);
        }
        
        // Set new timeout to flush batch
        this.editBatchTimeout = window.setTimeout(() => {
            this.flushEditBatch();
        }, this.config.editBatchTimeout);
    }
    
    /**
     * Flush pending edit batch to main pending list
     */
    private flushEditBatch(): void {
        if (this.pendingEditBatch.length > 0) {
            this.state.pendingHumanEdits.push(...this.pendingEditBatch);
            this.pendingEditBatch = [];
            
            this.emitEvent({
                type: 'ai_feedback_generated',
                payload: { batchFlushed: true },
                timestamp: new Date()
            });
        }
        
        this.editBatchTimeout = null;
    }
    
    /**
     * Clear human edits that have been addressed by AI
     */
    private clearAddressedHumanEdits(newElements: StoryElement[]): void {
        for (const element of newElements) {
            if (element.isUpdatedByAI) {
                // Remove any pending human edits for this element
                this.state.pendingHumanEdits = this.state.pendingHumanEdits.filter(
                    edit => edit.elementId !== element.id
                );
            }
        }
    }
    
    // ========================================================================
    // UTILITY METHODS
    // ========================================================================
    
    /**
     * Get element by ID
     */
    public getElement(elementId: ElementID): StoryElement | undefined {
        return this.state.elements.get(elementId);
    }
    
    /**
     * Get elements by type
     */
    public getElementsByType(type: StoryElementType): StoryElement[] {
        const elementIds = this.state.elementsByType.get(type);
        if (!elementIds) {
            throw new Error(`Invalid element type: ${type}`);
        }
        return elementIds
            .map(id => this.state.elements.get(id))
            .filter((element): element is StoryElement => element !== undefined);
    }
    
    /**
     * Get total element count
     */
    public getTotalElementCount(): number {
        return this.state.elements.size;
    }
    
    /**
     * Get element counts by type
     */
    public getElementCountsByType(): Record<StoryElementType, number> {
        const counts: Record<StoryElementType, number> = {
            outline: 0,
            context: 0
        };
        
        for (const [type, elementIds] of this.state.elementsByType.entries()) {
            counts[type] = elementIds.length;
        }
        
        return counts;
    }
    
    /**
     * Export whiteboard state for persistence
     */
    public exportState(): Record<string, unknown> {
        return {
            elements: Array.from(this.state.elements.entries()),
            elementsByType: Array.from(this.state.elementsByType.entries()),
            pendingHumanEdits: this.state.pendingHumanEdits,
            searchFilter: this.state.searchFilter,
            typeFilters: Array.from(this.state.typeFilters),
            collapsedSections: Array.from(this.state.collapsedSections),
            exportTimestamp: new Date()
        };
    }
    
    /**
     * Import whiteboard state from persistence
     */
    public importState(exportedState: Record<string, unknown>): void {
        // Import elements - expect proper structure
        if (!Array.isArray(exportedState['elements'])) {
            throw new Error('Invalid export format: elements must be an array');
        }
        if (!Array.isArray(exportedState['elementsByType'])) {
            throw new Error('Invalid export format: elementsByType must be an array');
        }
        
        this.state.elements = new Map(exportedState['elements'] as [string, StoryElement][]);
        this.state.elementsByType = new Map(exportedState['elementsByType'] as [StoryElementType, string[]][]);
        
        // Register existing IDs with the generator
        const existingIds = Array.from(this.state.elements.keys());
        this.idGenerator.registerExistingIds(existingIds);
        
        // Import other state - require proper types
        if (!Array.isArray(exportedState['pendingHumanEdits'])) {
            throw new Error('Invalid export format: pendingHumanEdits must be an array');
        }
        if (typeof exportedState['searchFilter'] !== 'string') {
            throw new Error('Invalid export format: searchFilter must be a string');
        }
        if (!Array.isArray(exportedState['typeFilters'])) {
            throw new Error('Invalid export format: typeFilters must be an array');
        }
        if (!Array.isArray(exportedState['collapsedSections'])) {
            throw new Error('Invalid export format: collapsedSections must be an array');
        }
        
        this.state.pendingHumanEdits = exportedState['pendingHumanEdits'] as HumanEdit[];
        this.state.searchFilter = exportedState['searchFilter'] as string;
        this.state.typeFilters = new Set(exportedState['typeFilters'] as StoryElementType[]);
        this.state.collapsedSections = new Set(exportedState['collapsedSections'] as StoryElementType[]);
        
        // Reset highlights
        this.state.highlights = {
            activeHighlights: new Map(),
            pendingClear: []
        };
    }
    
    /**
     * Reset the service to initial state
     */
    public reset(): void {
        this.state = {
            elements: new Map(),
            elementsByType: new Map(),
            highlights: {
                activeHighlights: new Map(),
                pendingClear: []
            },
            pendingHumanEdits: [],
            searchFilter: '',
            typeFilters: new Set(['outline', 'context']),
            collapsedSections: new Set()
        };
        
        this.initializeTypeMaps();
        this.idGenerator.reset();
        this.pendingEditBatch = [];
        
        if (this.editBatchTimeout) {
            clearTimeout(this.editBatchTimeout);
            this.editBatchTimeout = null;
        }
    }
}

/**
 * Create a new XML Story Service instance
 */
export function createXMLStoryService(config?: Partial<XMLStoryConfig>): XMLStoryService {
    return new XMLStoryService(config);
} 