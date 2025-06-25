# Reader Editing System Implementation Plan

## Overview
This plan outlines the implementation of a new editing system within the reader view that provides both simple text editing and AI-powered content transformations. The system will respect node boundaries and provide rich placeholder support for AI editing actions.

## Features Summary
1. **Simple Text Editing**: Make text editable while respecting node boundaries
2. **AI-Powered Editing**: Rich prompt-based editing with placeholder support
3. **Configuration UI**: Modal interface for managing editing actions
4. **Action Buttons**: Dynamic buttons in reader view for quick AI edits

## File Structure

### New Files to Create
```
src/ui/
├── reader-editor.ts              # Main editing functionality for reader
├── reader-actions-config.ts      # Configuration modal for editing actions
└── reader-edit-manager.ts        # Manages edit state and operations

src/types/
└── ReaderEditingTypes.ts         # Type definitions for editing system

data/
└── default-reader-actions.json   # Default editing actions configuration
```

### Files to Modify
```
src/ui/reader-gui.ts              # Add editing functionality integration
src/project/PromptService.ts      # Add fillEditingPrompt method
```

## Data Structures

### ReaderEditingTypes.ts
```typescript
export interface ReaderEditAction {
    id: string;
    title: string;              // Button label (e.g., "More details")
    prompt: string;             // Template with placeholders
    model: 'creator' | 'editor' | 'rater';
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
```

## Available Placeholders
Based on the existing system, we'll support these placeholders in editing actions:

### Standard Placeholders (from existing generation system)
- `{{path}}` - The hierarchical path from root to this node
- `{{context}}` - Compiled contextual information from ancestors, siblings, and parent
- `{{title}}` - The title of the current node
- `{{content}}` - The current content of the node (if any)
- `{{child_level_name}}` - The name of the child level (for branch nodes)
- `{{count}}` - The number of items to generate (for list generation)
- `{{draftorfresh}}` - Instructions for handling existing content

### New Placeholder for Editing
- `{{selected}}` - The currently selected text (empty if no selection)

## Implementation Phases

### Phase 1: Basic Text Editing
**Goal**: Make reader content editable while respecting node boundaries

#### 1.1 ReaderEditor Class (`src/ui/reader-editor.ts`)
```typescript
export class ReaderEditor {
    private readerGUI: ReaderGUI;
    private projectManager: ProjectManager;
    private isEditMode: boolean = false;
    private editableNodes: Map<string, HTMLElement> = new Map();
    
    // Enable/disable edit mode
    public toggleEditMode(): void
    
    // Make specific node content editable
    private makeNodeEditable(nodeId: string): void
    
    // Save changes back to node
    private saveNodeChanges(nodeId: string, newContent: string): void
    
    // Handle text selection and cursor tracking
    private trackSelection(): TextSelection | null
    
    // Validate edits respect node boundaries
    private validateEdit(nodeId: string, newContent: string): boolean
}
```

#### 1.2 Reader GUI Integration
- Add "Edit Mode" toggle button to reader toolbar
- Modify `generateNodeHTML()` to add contenteditable attributes when in edit mode
- Add visual indicators for editable sections
- Implement auto-save functionality

### Phase 2: AI Editing Actions System
**Goal**: Create the prompt-based AI editing system

#### 2.1 EditManager Class (`src/ui/reader-edit-manager.ts`)
```typescript
export class ReaderEditManager {
    private projectManager: ProjectManager;
    private actions: ReaderEditAction[] = [];
    private currentContext: EditContext | null = null;
    
    // Load/save action configurations
    public async loadActions(): Promise<void>
    public async saveActions(): Promise<void>
    
    // Execute an editing action
    public async executeAction(actionId: string, context: EditContext): Promise<void>
    
    // Get available actions for current context
    public getAvailableActions(): ReaderEditAction[]
    
    // Fill prompt template with context
    private fillActionPrompt(action: ReaderEditAction, context: EditContext): string
}
```

#### 2.2 PromptService Extension
Add method to handle editing prompts:
```typescript
public fillEditingPrompt(
    promptTemplate: string,
    node: DocumentNode,
    context: string,
    path: string,
    selectedText: string = ''
): string {
    // Similar to fillGenerationPrompt but includes {{selected}} placeholder
    return promptTemplate
        .replace(/\{\{selected\}\}/g, selectedText)
        .replace(/\{\{path\}\}/g, path)
        .replace(/\{\{context\}\}/g, context)
        // ... other existing placeholders
}
```

#### 2.3 Default Actions Configuration
Create `data/default-reader-actions.json`:
```json
{
    "version": 1,
    "actions": [
        {
            "id": "more-details",
            "title": "More Details",
            "prompt": "Expand the following text with more details while maintaining the same style and tone:\n\n{{selected}}\n\nContext: {{context}}\nNode: {{title}}",
            "model": "creator",
            "enabled": true,
            "order": 1,
            "description": "Adds more detail to selected text"
        },
        {
            "id": "simplify",
            "title": "Simplify",
            "prompt": "Rewrite the following text to be simpler and clearer:\n\n{{selected}}\n\nMake it easier to understand while preserving the key information.",
            "model": "editor",
            "enabled": true,
            "order": 2,
            "description": "Simplifies complex text"
        },
        {
            "id": "professional-tone",
            "title": "Professional Tone",
            "prompt": "Rewrite the following text in a professional tone:\n\n{{selected}}\n\nMaintain all key information but adjust the style to be more formal and professional.",
            "model": "editor",
            "enabled": true,
            "order": 3,
            "description": "Makes text more professional"
        }
    ]
}
```

### Phase 3: Configuration UI
**Goal**: Modal interface for managing editing actions

#### 3.1 ActionsConfig Class (`src/ui/reader-actions-config.ts`)
```typescript
export class ReaderActionsConfig {
    private container: HTMLElement;
    private actions: ReaderEditAction[] = [];
    private editManager: ReaderEditManager;
    
    // Render configuration modal
    public render(): void
    
    // Add new action
    private addAction(): void
    
    // Edit existing action
    private editAction(actionId: string): void
    
    // Delete action
    private deleteAction(actionId: string): void
    
    // Validate action configuration
    private validateAction(action: ReaderEditAction): string[]
    
    // Show placeholder help
    private showPlaceholderHelp(): void
    
    // Preview action prompt
    private previewAction(action: ReaderEditAction): void
}
```

#### 3.2 Modal Structure
```html
<div class="reader-actions-config-modal">
    <div class="modal-header">
        <h2>Configure Reader Actions</h2>
        <button class="close-btn">×</button>
    </div>
    
    <div class="modal-body">
        <div class="actions-list">
            <!-- List of existing actions with edit/delete buttons -->
        </div>
        
        <div class="action-editor">
            <div class="form-group">
                <label>Title</label>
                <input type="text" placeholder="Button label (e.g., More Details)">
            </div>
            
            <div class="form-group">
                <label>Model</label>
                <select>
                    <option value="creator">Creator</option>
                    <option value="editor">Editor</option>
                    <option value="rater">Rater</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Prompt Template</label>
                <textarea placeholder="Enter prompt with placeholders..."></textarea>
                <div class="placeholders-help">
                    <small>Available placeholders: {{selected}}, {{title}}, {{context}}, {{path}}, {{content}}</small>
                </div>
            </div>
            
            <div class="form-actions">
                <button class="btn-save">Save Action</button>
                <button class="btn-preview">Preview Prompt</button>
                <button class="btn-cancel">Cancel</button>
            </div>
        </div>
    </div>
</div>
```

### Phase 4: Reader UI Integration
**Goal**: Integrate editing system into reader view

#### 4.1 Reader Toolbar Enhancement
Add buttons to reader toolbar:
- "Edit Mode" toggle
- "Configure Actions" button (opens modal)
- Action buttons (dynamically generated based on configuration)

#### 4.2 Action Buttons Layout
```html
<div class="reader-toolbar">
    <button id="reader-edit-mode" class="btn-toggle">Edit Mode</button>
    <button id="reader-configure-actions" class="btn-secondary">Configure Actions</button>
    
    <div class="reader-actions" id="reader-action-buttons">
        <!-- Dynamically generated action buttons -->
        <button class="reader-action-btn" data-action-id="more-details">More Details</button>
        <button class="reader-action-btn" data-action-id="simplify">Simplify</button>
        <!-- ... more actions ... -->
    </div>
</div>
```

#### 4.3 Text Selection Handling
- Track text selection across node boundaries (but prevent cross-node operations)
- Show/hide action buttons based on selection state
- Handle cursor position tracking for insertion operations

## Technical Considerations

### 1. Node Boundary Enforcement
- Use data attributes to track node ownership: `data-node-id="node-123"`
- Validate that selections don't span multiple nodes
- Prevent edits that would break node structure

### 2. State Management
- Track edit history for undo/redo functionality
- Auto-save changes to prevent data loss
- Sync with project storage system

### 3. Performance
- Debounce text change events to avoid excessive saves
- Lazy load action configurations
- Cache compiled contexts to avoid recomputation

### 4. Error Handling
- Validate prompts before execution
- Handle API failures gracefully
- Provide user feedback for all operations

### 5. Accessibility
- Maintain keyboard navigation
- Screen reader compatibility
- Focus management in modal dialogs

## Implementation Priority

1. **High Priority**: Basic text editing (Phase 1)
2. **High Priority**: Core AI editing system (Phase 2)
3. **Medium Priority**: Configuration UI (Phase 3)
4. **Medium Priority**: UI integration and polish (Phase 4)

## Integration Points

### With Existing Systems
- **PromptService**: Extend for editing prompt templates
- **ProjectManager**: Use existing save/load infrastructure
- **SettingsManager**: Store action configurations
- **EventEmitter**: Emit events for edit operations
- **OpenRouterClient**: Execute AI editing requests

### Storage
- Use existing StorageService for action configurations
- Store editing actions in `expert_app_reader_actions` key
- Maintain backward compatibility with existing reader settings

## Testing Strategy

### Unit Tests
- Test placeholder replacement logic
- Validate node boundary enforcement
- Test action configuration persistence

### Integration Tests
- Test full editing workflow
- Verify AI API integration
- Test modal functionality

### User Acceptance Tests
- Verify intuitive editing experience
- Test action configuration workflow
- Validate performance with large documents

## Future Enhancements

### Potential Phase 5+ Features
- **Batch Operations**: Apply actions to multiple selections
- **Custom Placeholders**: User-defined placeholder system
- **Action Macros**: Chain multiple actions together
- **Export/Import**: Share action configurations
- **Collaborative Editing**: Real-time multi-user editing
- **Version History**: Track and revert content changes
- **Smart Suggestions**: Context-aware action recommendations

## Migration Strategy

### Backward Compatibility
- Existing reader functionality remains unchanged
- Editing features are opt-in (edit mode toggle)
- Default actions are provided but can be customized
- No breaking changes to existing APIs

### Rollout Plan
1. Deploy with editing disabled by default
2. Enable for testing with limited user group
3. Full rollout with default actions enabled
4. Gather feedback and iterate on action library

This plan provides a comprehensive roadmap for implementing a sophisticated editing system that enhances the reader experience while maintaining the existing functionality and respecting the application's architecture. 