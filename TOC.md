<!--
🚨 SOURCE OF TRUTH - FUNCTIONALITY DOCUMENTATION 🚨

This file serves as the DEFINITIVE source of truth for all functionality 
in the Expert application. 

CRITICAL: If inconsistencies are detected between this documentation and 
the actual codebase during development, updating this file must be treated 
as a PRIORITY to maintain documentation accuracy.

All developers should:
1. Reference this file first when looking for functionality
2. Update this file immediately when adding/modifying features
3. Verify this file's accuracy during code reviews
4. Report inconsistencies as high-priority issues
-->

# Expert Application - Functionality Map

This document provides a comprehensive mapping of all functionality in the Expert application, showing where each feature is implemented and which functions to use.

## 🗄️ Storage & Persistence

### IndexedDB Operations
- **File**: `src/IndexedDBService.ts`
- **Class**: `IndexedDBService`
- **Functions**:
  - `openDatabase()` - Open/create IndexedDB database
  - `put(storeName, data)` - Store data
  - `get(storeName, key)` - Retrieve data
  - `delete(storeName, key)` - Delete data
  - `clear(storeName)` - Clear entire store

### Local Storage Operations
- **File**: `src/StorageService.ts`
- **Interface**: `IStorageService`
- **Implementation**: `IndexedDBStorageService` (uses IndexedDB, not localStorage)
- **Functions**:
  - `setItem(key, value)` → `set(key, value)` - Store in IndexedDB
  - `getItem(key)` → `get(key)` - Retrieve from IndexedDB  
  - `removeItem(key)` → `delete(key)` - Remove from IndexedDB
  - `clear()` - Clear entire IndexedDB store

### ⚠️ localStorage Policy
**IMPORTANT**: localStorage should **NEVER** be used automatically in the main application. Any localStorage usage requires explicit user authorization and should be limited to:
- Diagnostic/testing purposes (`KeyStorage.testLocalStorage()`)
- Standalone pages with user consent (`public/keys.html`)
- **All persistent application data MUST use IndexedDB via `StorageService`**

### Project Persistence
- **File**: `src/project/ProjectPersistenceService.ts`
- **Class**: `ProjectPersistenceService`
- **Functions**:
  - `saveProject(project)` - Save entire project
  - `loadProject(projectId)` - Load project by ID
  - `deleteProject(projectId)` - Delete project
  - `listProjects()` - Get all saved projects
  - `exportProject(project)` - Export project data
  - `importProject(data)` - Import project data

## 📋 Project Management

### Core Project Management
- **File**: `src/ProjectManager.ts`
- **Class**: `ProjectManager`
- **Functions**:
  - `createProject(title, template)` - Create new project
  - `loadProject(data)` - Load existing project
  - `saveProject()` - Save current project
  - `addChildNode(parent, title)` - Add child node
  - `deleteNode(nodeId)` - Delete node
  - `moveNode(nodeId, newParentId)` - Move node
  - `generateContent(nodeId)` - Generate content for node

### Project Templates
- **File**: `src/TemplateManager.ts`
- **Class**: `TemplateManager`
- **Functions**:
  - `getTemplates()` - Get all templates
  - `saveTemplate(template)` - Save new template
  - `deleteTemplate(id)` - Delete template
  - `createProjectFromTemplate(template)` - Create project from template

**Template Reference Architecture** ✨ **ENHANCED**:
- **Creation**: `ProjectManager` constructor creates deep copy for root node
- **Inheritance**: Child nodes share root node's template reference
- **Modification**: Change template for entire project via root node
- **Persistence**: Template structure preserved in export/import
- **Memory**: Efficient - only root node gets copy, children share reference

**Template Data Flow**:
```typescript
// Root node gets deep copy
const rootNodeTemplate = [...this.template.hierarchyLevels];
this.rootNode = new DocumentNode(0, title, null, rootNodeTemplate);

// Child nodes share root's reference
const newChild = new DocumentNode(level, title, parentId, parent.template);
```

### Project State Management
- **File**: `src/state.ts`
- **Functions**:
  - `getActiveProject()` - Get currently active project
  - `setActiveProject(projectId)` - Set active project
  - `addProject(project)` - Add project to state
  - `removeProject(projectId)` - Remove project from state

## 📝 Document & Node Management

### Document Nodes
- **File**: `src/DocumentNode.ts`
- **Class**: `DocumentNode`
- **Properties**:
  - `id` - Unique node identifier
  - `title` - Node title
  - `content` - Node content
  - `children` - Child nodes array
  - `parent` - Parent node reference
  - `template` - Template array reference ✨ **ENHANCED**
  - `collapsed` - Tree UI collapsed state ✨ **NEW**
- **Functions**:
  - `addChild(child)` - Add child node
  - `removeChild(childId)` - Remove child node
  - `getPath()` - Get node path
  - `isLeaf()` - Check if node is leaf

**Template Reference Strategy** ✨ **NEW**:
- **Root Nodes**: Get deep copy of template array for independent modification
- **Child Nodes**: Share root node's template reference for consistency
- **Benefits**: Project-wide template changes via root node, memory efficiency

**Collapsed State Integration** ✨ **NEW**:
- **Property**: `collapsed: boolean` - Track tree UI folding state per node
- **Persistence**: Automatically included in `toJSON()` serialization
- **Benefits**: Collapsed state preserved in export/import, no race conditions

### Context Management
- **File**: `src/project/ContextService.ts`
- **Class**: `ContextService`
- **Functions**:
  - `copyParentContextToChild(childNode, rootNode)` - Copy parent context to child (simple inheritance)
  - `compileNodeContext(nodeId, rootNode)` - Compile context for generation (parent content + siblings)
  - `buildSiblingContext(targetNode, rootNode)` - Build context from sibling nodes  
  - `getContextSummary(nodeId, rootNode)` - Get context summary for UI display

### Context Extraction
- **File**: `src/project/ContextExtractionService.ts`
- **Class**: `ContextExtractionService`
- **Functions**:
  - `extractContext(node, request)` - Extract context from node
  - `parseExtractionResult(result)` - Parse extraction results

## 🎯 Content Generation

### Generation Orchestration
- **File**: `src/LoopOrchestrator.ts`
- **Class**: `LoopOrchestrator`
- **Functions**:
  - `runLoop(input)` - Run generation loop with systematic progress events ✨ **ENHANCED**
  - `rateContent(content, criteria)` - Rate generated content
  - `requestStop()` - Request loop termination
  - `isLoopRunning()` - Check if loop is running
  - `getCurrentIteration()` - Get current iteration number
  - `getModelNameForPurpose(purpose)` - Get friendly model name for specific purpose ✨ **NEW**

### Systematic Progress Events System ✨ **NEW**
- **Purpose**: Provides predictable, systematic progress tracking for content generation
- **Architecture**: Dual-tier progress system with high-level operations and iteration tracking

**Event Types**:
```typescript
type OrchestratorEvents = {
    'started': [input: LoopInput];                                    // Loop initialization
    'iteration-started': [iteration: number, maxIterations: number]; // ✨ NEW: Before each creator phase
    'phase-started': [phase: 'create' | 'rate' | 'edit', iteration: number]; // ✨ NEW: Phase boundaries
    'progress': [progress: LoopProgress];                             // Detailed progress within phases
    'error': [message: string];                                       // Error conditions
    'aborted': [message: string];                                     // User-initiated termination
};
```

**Progress Event Flow**:
```
🚀 Loop Started
├── ✅ iteration-started(1)    ← BEFORE initial creator
├── ✍️ phase-started('create') ← Creator phase begins
├── 📊 phase-started('rate')   ← Rating phase begins  
├── ✏️ phase-started('edit')   ← Editing phase begins (if needed)
├── ✅ iteration-started(2)    ← BEFORE creator revision
├── ✍️ phase-started('create') ← Creator revision begins
└── Continue until goals met or max iterations...
```

**Key Features**:
- ✅ **Predictable Timing**: `iteration-started` always fires BEFORE creator work begins
- ✅ **Phase Boundaries**: Clear signals for Create/Rate/Edit phase transitions  
- ✅ **Creator Iteration Tracking**: Separate counter tracks actual content generation iterations
- ✅ **Consistent UI Updates**: Progress bars update at logical moments, not after work completes
- ✅ **Dual Progress System**: Works with high-level bulk operations (e.g., "Generating child 3/5")
- ✅ **Enhanced Progress Messages**: Context-aware messaging with model names and content types ✨ **NEW**

**UI Integration**:
- **Operations Progress**: "Generating content for: Chapter 1" (1/5) - High-level bulk operations
- **Iterations Progress**: "Iteration 2 / 5" - Loop orchestrator iterations ✨ **ENHANCED TIMING**
- **Stages Progress**: "Stage: Rate (2/3)" - Phase within iteration
- **Detail Text**: "Claude 3 Sonnet is creating prose..." - Model-specific activity messaging ✨ **ENHANCED**

**Enhanced Progress Interface** ✨ **NEW**:
```typescript
interface LoopProgress {
    // ... existing fields ...
    modelName?: string;              // Friendly display name (e.g., "Claude 3 Sonnet")
    isFirstCreation?: boolean;       // Whether this is initial content creation
    isRevision?: boolean;            // Whether this is a revision based on recommendations
    isRejected?: boolean;            // Whether content was rejected
    contentType?: 'prose' | 'outline'; // Based on node type (leaf vs non-leaf)
    isCompletion?: boolean;          // Whether this is final completion message
    allCriteriaSatisfied?: boolean;  // Whether all criteria were met
}
```

**Enhanced Progress Messages**:
- **First Creation**: "{{ModelName}} is creating prose/outline..." (based on node type)
- **Rating**: "{{ModelName}} is rating the prose/outline..."
- **Rejection**: "prose/outline rejected! {{EditorModelName}} is generating recommendations..."
- **Revision**: "{{ModelName}} is revising prose/outline based on recommendations..."
- **Completion**: "Done! All criteria satisfied" or "Done! Not all criteria satisfied, best version selected"

### Generation Services
- **File**: `src/project/GenerationService.ts`
- **Class**: `GenerationService`
- **Functions**:
  - `generateNodeContent(nodeId, count, isChildGeneration)` - Generate content for node ✨ **ENHANCED**
  - `generateAllChildrenContent(nodeId, includeContent, recursive)` - Generate bulk child content
  - `createChildrenFromOutline(nodeId)` - Create children from outline
  - `rateNodeContent(nodeId)` - Rate existing node content
  - `summarizeNodeContent(nodeId)` - Generate node summary
  - `abortCurrentGeneration()` - Abort ongoing generation
  - `canAbortGeneration()` - Check if generation can be aborted
  - `getCurrentGenerationInfo()` - Get current generation context

**Systematic Progress Event Integration** ✨ **NEW**:
- **Event Listeners**: Handles all orchestrator events (`started`, `iteration-started`, `phase-started`, `progress`, `aborted`)
- **Event Translation**: Converts orchestrator events to UI-friendly `loop-progress` events
- **Dual Progress Support**: Integrates with both high-level and orchestrator progress systems
- **Phase-Aware Messaging**: Provides context-specific progress messages for each phase

### Generation Coordination
- **File**: `src/project/GenerationCoordinator.ts`
- **Class**: `GenerationCoordinator`
- **Functions**:
  - `coordinateGeneration(operation)` - Coordinate generation process
  - `handleGenerationError(error)` - Handle generation errors

### Generation Controller
- **File**: `src/project/GenerationController.ts`
- **Class**: `GenerationController`
- **Functions**:
  - `startGeneration(nodeId, type)` - Start generation process
  - `stopGeneration()` - Stop current generation
  - `getGenerationStatus()` - Get current status

## 🎯 Node Creation & Management ✨ **NEW SECTION**

### Node Creation Service
- **File**: `src/ui/modals/services/NodeCreationService.ts`
- **Interface**: `INodeCreationService`
- **Class**: `NodeCreationService`
- **Functions**:
  - `generateSuggestions(parentNode, count)` - Generate AI-powered child node suggestions
  - `updateParentContent(parentNode, childTitle)` - Update parent content to reference new child
  - `createNode(config)` - Create new child node with optional draft content
  - `parseJsonResponse(content)` - Parse AI JSON responses
  - `validateSuggestions(suggestions, count)` - Validate AI suggestions

**Configuration Interface**:
```typescript
interface NodeCreationConfig {
    parentNodeId: string;
    title: string;
    draft?: string;           // Optional AI-generated draft content
    updateParent?: boolean;   // Whether to update parent content
}
```

**Suggestion Interface**:
```typescript
interface NodeSuggestion {
    title: string;    // Suggested node title
    draft: string;    // AI-generated draft content
}
```

### Draft Content Convention ✨ **NEW PATTERN**
**IMPORTANT**: All AI-generated content receives a `"Draft: "` prefix to signal to the content builder that expansion is needed.

- **Pattern**: `childNode.content = \`Draft: \${aiGeneratedContent}\`;`
- **Purpose**: Content builder recognizes this pattern and knows to expand the content
- **Usage**: Applied automatically by `NodeCreationService.createNode()`

## 🤖 AI & Model Management

### OpenRouter Client
- **File**: `src/OpenRouterClient.ts`
- **Class**: `OpenRouterClient`
- **Functions**:
  - `sendMessage(messages, options)` - Send message to AI
  - `streamMessage(messages, callbacks)` - Stream AI response
  - `getModels()` - Get available models
  - `setApiKey(key)` - Set API key

### Model Selection
- **File**: `src/ModelSelector.ts`
- **Class**: `ModelSelector`
- **Functions**:
  - `getSelectedModels()` - Get selected models
  - `setSelectedModels(models)` - Set selected models
  - `getAvailableModels()` - Get all available models
  - `selectModel(modelId, role)` - Select model for role

### AI Logging
- **File**: `src/AILogService.ts`
- **Class**: `AILogService`
- **Functions**:
  - `logInteraction(interaction)` - Log AI interaction
  - `getLogEntries()` - Get all log entries
  - `searchLogs(query)` - Search log entries
  - `clearLogs()` - Clear all logs
  - `exportLogs()` - Export logs to file

## 📋 Prompt Management

### Prompt Templates
- **File**: `src/PromptManager.ts`
- **Interface**: `OrchestratorPrompts`
- **Constants**:
  - `defaultPrompts` - Default prompt templates
  - `promptPlaceholders` - Available placeholders for each prompt
- **Class**: `PromptManager` (Legacy UI - not used)

**Available Prompts**:
- `creator` - Main content generation
- `rater` - Content quality rating  
- `editor` - Content improvement suggestions
- `child_node_suggestions` - AI-powered child node title/draft generation ✨ **NEW**
- `parent_content_update` - Update parent content to reference new child ✨ **NEW**

### Prompt Service (Active)
- **File**: `src/ui/modals/services/PromptManagementService.ts`
- **Class**: `PromptManagementService`
- **Functions**:
  - `getPrompts()` - Get all prompts
  - `updatePrompt(key, value)` - Update specific prompt
  - `revertToDefaults()` - Reset to default prompts
  - `saveToStorage()` - Save prompts to storage
  - `renderEditor(container)` - Render prompt editor UI

## ⚙️ Settings & Configuration

### Settings Management
- **File**: `src/SettingsManager.ts`
- **Class**: `SettingsManager`
- **Functions**:
  - `getProfile(name)` - Get settings profile
  - `saveProfile(name, profile)` - Save settings profile
  - `deleteProfile(name)` - Delete profile
  - `getLastUsedProfile()` - Get last used profile
  - `setLastUsedProfile(name)` - Set last used profile
  - `getPrompts()` - Get prompt templates
  - `savePrompts(prompts)` - Save prompt templates

### Settings Service (UI)
- **File**: `src/ui/modals/services/SettingsService.ts`
- **Class**: `SettingsService`
- **Functions**:
  - `createProfile(name)` - Create new profile
  - `switchToProfile(name)` - Switch to profile
  - `deleteProfile(name)` - Delete profile
  - `exportProfile(name)` - Export profile
  - `importProfileFromFile(file)` - Import profile from file

## 🔐 Key Management

### Application Keys
- **File**: `src/keys/AppKeyService.ts`
- **Class**: `AppKeyService`
- **Functions**:
  - `validateKey(key)` - Validate application key
  - `storeKey(key)` - Store valid key
  - `getStoredKey()` - Get stored key
  - `clearKey()` - Clear stored key

### Key Storage
- **File**: `src/keys/AppKeyStorage.ts`
- **Class**: `AppKeyStorage`
- **Functions**:
  - `saveKey(keyData)` - Save key data
  - `loadKey()` - Load key data
  - `deleteKey()` - Delete stored key

### Key Crypto
- **File**: `src/keys/KeyCrypto.ts`
- **Functions**:
  - `encryptKey(key, password)` - Encrypt key
  - `decryptKey(encryptedKey, password)` - Decrypt key
  - `hashKey(key)` - Hash key for validation

### Key Manager
- **File**: `src/keys/KeyManager.ts`
- **Class**: `KeyManager`
- **Functions**:
  - `createKey(data)` - Create new key
  - `validateKey(key)` - Validate key
  - `importKey(data)` - Import key data

## 🎨 User Interface

### DOM Elements
- **File**: `src/ui/dom-elements.ts`
- **Functions**:
  - `mainAppContainer()` - Get main app container
  - `modalContainer()` - Get modal container
  - `settingsBtn()` - Get settings button
  - `newProjectBtn()` - Get new project button

### Project UI
- **File**: `src/ui/project-ui.ts`
- **Functions**:
  - `renderProjectTree(project)` - Render project tree
  - `renderNodeEditor(node)` - Render node editor
  - `updateNodeDisplay(node)` - Update node display
  - `showContextMenu(node, position)` - Show context menu
  - `updateProgressUI(data)` - Update multi-tier progress system ✨ **ENHANCED**
  - `showGenerationOverlay()` - Show generation overlay with spinner
  - `hideGenerationOverlay()` - Hide generation overlay
  - `setupProjectManagerListeners(manager)` - Setup systematic event listeners ✨ **ENHANCED**
  - `renderProjectUI(proj)` - Render entire project UI with event listener re-attachment ✨ **ENHANCED**
  - `renderNodeDetails()` - Render node details with event listener re-attachment ✨ **ENHANCED**
  - `renderMultiProjectTree()` - Render multi-project tree structure
  - `setupEventListeners()` - Centralized event listener setup with robustness ✨ **ENHANCED**

**Progress System Integration**:
```typescript
interface ProgressUIData {
    operations?: ProgressInfo;    // Top level: High-level operations
    iterations?: ProgressInfo;    // Middle level: LoopOrchestrator iterations ✨ NEW
    stages?: ProgressInfo;        // Bottom level: Stage within iteration  
    detail?: string;              // Detail text below progress bars
}
```

**Event Handlers** ✨ **ENHANCED**:
- `handleHighLevelProgress()` - Handles bulk operation progress (e.g., "Generating child 3/5")
- `handleLoopProgress()` - Handles systematic orchestrator progress events ✨ **NEW**
- `handleIterationStarted()` - Handles iteration boundary events ✨ **NEW** 
- `handlePhaseStarted()` - Handles phase transition events ✨ **NEW**

### Reader/Editor Interface
- **File**: `src/ui/reader-gui.ts`
- **Functions**:
  - `initializeReader()` - Initialize reader interface
  - `showNode(nodeId)` - Display specific node
  - `enterEditMode(nodeId)` - Enter edit mode
  - `exitEditMode()` - Exit edit mode

### Text Editor with Highlighting
- **File**: `src/ui/text-editor-with-highlighting.ts`
- **Class**: `TextEditorWithHighlighting`
- **Functions**:
  - `initialize(container)` - Initialize editor
  - `setContent(content)` - Set editor content
  - `getContent()` - Get editor content
  - `enableSyntaxHighlighting()` - Enable syntax highlighting

### Template Editor
- **File**: `src/ui/template-editor.ts`
- **Functions**:
  - `renderTemplateEditor()` - Render template editor
  - `saveTemplate(template)` - Save template
  - `loadTemplate(id)` - Load template

### Chat Interface
- **File**: `src/ui/chat-interface.ts`
- **Class**: `ChatInterface`
- **Functions**:
  - `initialize(container)` - Initialize chat
  - `sendMessage(message)` - Send chat message
  - `addMessage(message)` - Add message to chat
  - `clearChat()` - Clear chat history

## ✨ Professional UI Design System

### Enhanced Layout System
- **File**: `src/ui/enhanced-layout.css`
- **Purpose**: Professional design system with consistent styling
- **Features**:
  - Modern CSS custom properties (design tokens)
  - Semantic color palette with accessibility focus
  - Responsive layout system with proper spacing
  - Professional shadows and border radius scales
  - Smooth transitions and hover effects

**Design Tokens**:
```css
/* Color System */
--primary-500: #475569;    /* Professional Blue-Gray - Primary actions */
--success-500: #059669;    /* Forest Green - Positive actions */
--danger-500: #dc2626;     /* Muted Red - Destructive actions */
--warning-500: #d97706;    /* Professional Amber - Caution actions */
--secondary-*: #64748b;    /* Slate - Neutral colors */

/* Spacing Scale */
--space-1: 0.25rem;  --space-2: 0.5rem;   --space-3: 0.75rem;
--space-4: 1rem;     --space-6: 1.5rem;   --space-8: 2rem;

/* Shadows */
--shadow-sm: subtle elevation
--shadow-md: standard elevation
--shadow-lg: prominent elevation
```

### Professional Button System ✨ **NEW**
- **Integration**: Loaded via `index.html` and enhanced-layout.css
- **Coverage**: All buttons throughout the application
- **Features**:
  - Semantic variants (primary, secondary, success, danger, warning)
  - Size system (sm, default, lg)
  - Specialized types (icon, ghost, close, version-nav)
  - Interactive states (hover, active, disabled, loading)
  - Consistent animations and feedback

**Button Classes**:
```css
/* Base Classes */
.button, .btn                    /* Base button styling */

/* Semantic Variants */
.button-primary, .btn-primary    /* Main actions - indigo gradient */
.button-secondary, .btn-secondary /* Supporting actions - neutral */
.button-success, .btn-success    /* Positive actions - emerald gradient */
.button-danger, .btn-danger      /* Destructive actions - red gradient */
.button-warning, .btn-warning    /* Caution actions - amber gradient */

/* Size Variants */
.button-sm, .btn-small          /* Compact - 0.75rem font, smaller padding */
/* (default) */                 /* Standard - 0.875rem font, normal padding */
.button-lg, .btn-large          /* Prominent - 1rem font, larger padding */

/* Specialized Types */
.button-icon, .btn-icon         /* Square buttons for icons */
.button-ghost, .btn-ghost       /* Minimal buttons */
.close-btn                      /* Modal close buttons */
.info-button                    /* Circular info buttons */
.version-nav-btn                /* Navigation controls */
```

**Button States**:
- `:hover` - Elevated with subtle lift animation
- `:active` - Pressed state with immediate feedback  
- `:disabled` - Grayed out, not interactive
- `.loading` - Animated spinner, disabled interaction

### Panel System Enhancements ✨ **NEW**
- **Multi-Panel Layout**: Enhanced 3-panel design (Generation | Content | Context)
- **Color-Coded Panels**: 
  - 🔧 Generation Panel - Blue left border
  - 📝 Content Panel - Green left border  
  - 🎯 Context Panel - Orange left border
- **Improved Spacing**: Generous whitespace with proper information density
- **Professional Shadows**: Subtle depth with hover enhancements
- **Responsive Behavior**: Graceful collapse on smaller screens

### Form Control Improvements ✨ **NEW**
- **Enhanced Textareas**: Better focus states, hover effects, monospace font
- **Input Styling**: Consistent border radius, padding, and focus indicators
- **Multi-Tier Progress System**: Three-level progress visualization ✨ **ENHANCED**
  - **Operations Level**: High-level bulk operations (e.g., "Generating child 3/5")
  - **Iterations Level**: Loop orchestrator iterations (e.g., "Iteration 2/5") 
  - **Stages Level**: Phase within iteration (e.g., "Stage: Rate (2/3)")
  - **Detail Text**: Specific activity description below progress bars
- **Control Groups**: Proper spacing and visual grouping

### Tree Interface Enhancements ✨ **NEW**
- **Improved Tree Nodes**: Better hover states, selection styling
- **Consistent Spacing**: Proper padding and margin throughout tree
- **Professional Selection**: Gradient background for selected items
- **Enhanced Readability**: Better typography and color contrast

### Button Showcase & Documentation
- **File**: `src/ui/button-showcase.html`
- **Purpose**: Comprehensive demonstration of button system
- **Features**:
  - All button variants with examples
  - Interactive demonstrations (loading states, hover effects)
  - Usage guidelines and best practices
  - Color system documentation
  - Real-world examples from the Expert app

**Showcase Sections**:
- Button Variants (semantic colors)
- Size System (sm, default, lg)
- Icon Buttons (square aspect ratio)
- Ghost & Specialized Buttons
- Button States (normal, disabled, loading)
- Semantic Actions with Icons
- Color System Reference
- Usage Guidelines (Do's and Don'ts)

### Styling Conventions ✨ **ESTABLISHED**
- **No Inline Styles**: All styling uses CSS classes and design tokens
- **Semantic Naming**: Button classes reflect their purpose
- **Icon Integration**: Meaningful icons improve button recognition
- **Consistent Sizing**: Logical size hierarchy throughout the application
- **Professional Animations**: Subtle transitions enhance user experience

**Migration Completed**:
- ✅ Replaced 15+ inline style declarations with semantic CSS classes
- ✅ Added meaningful icons to all action buttons
- ✅ Established consistent color coding throughout the application
- ✅ Implemented professional hover and focus states
- ✅ Created comprehensive design system documentation

## 📋 Dropdown Components ✨ **NEW**

### Reusable Dropdown Class
- **File**: `src/ui/Dropdown.ts`
- **Class**: `Dropdown`
- **Purpose**: Generic, reusable dropdown component for creating dropdown menus attached to any trigger element

**Core Features**:
- 🎯 **Smart Positioning**: Automatically positions relative to trigger with 4 positioning modes
- 🖱️ **Robust Event Handling**: Outside clicks, inside clicks, proper cleanup
- 📱 **Responsive Behavior**: Auto-adjusts position when dropdown would go off-screen
- 🎨 **Customizable Styling**: Options for width, z-index, CSS classes
- 🔧 **Flexible Content**: Supports both HTML strings and DOM elements
- 🧹 **Memory Safe**: Proper cleanup and event listener removal

**Constructor Options**:
```typescript
interface DropdownOptions {
    minWidth?: string;          // Default: '200px'
    maxWidth?: string;          // Default: '400px'
    offset?: number;            // Default: 5px from trigger
    className?: string;         // Custom CSS classes
    closeOnInsideClick?: boolean; // Default: true
    zIndex?: number;            // Default: 1000
}

interface DropdownPosition {
    position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'; // Default: 'bottom-left'
}
```

**Public Methods**:
- `open()` - Open the dropdown
- `close()` - Close the dropdown  
- `toggle()` - Toggle open/closed state
- `updateContent(content)` - Update dropdown content dynamically
- `get opened` - Check if dropdown is currently open
- `destroy()` - Clean up and remove all event listeners

**Usage Examples**:
```typescript
// Simple dropdown
const dropdown = new Dropdown(triggerButton, '<div>Menu content</div>');
dropdown.open();

// Advanced dropdown with options
const dropdown = new Dropdown(triggerButton, menuElement, {
    minWidth: '280px',
    maxWidth: '400px',
    position: 'bottom-right',
    className: 'custom-dropdown',
    closeOnInsideClick: false
});

// Quick utility function
import { createDropdown } from './src/ui/Dropdown';
const dropdown = createDropdown(button, content, options);
```

**Positioning System**:
- `bottom-left` - Dropdown appears below trigger, left-aligned
- `bottom-right` - Dropdown appears below trigger, right-aligned  
- `top-left` - Dropdown appears above trigger, left-aligned
- `top-right` - Dropdown appears above trigger, right-aligned
- **Auto-Adjustment**: Automatically repositions if dropdown would go off-screen

**Global Styles**: 
- Automatically injects base CSS styles for consistent appearance
- Includes scrollbar styling for overflow content
- Provides foundation for custom styling via className option

### Actions Dropdown Implementation ✨ **REFACTORED**
- **File**: `src/ui/project-ui.ts`
- **Function**: `showActionsDropdown(node)`
- **Migration**: Converted from custom dropdown implementation to use reusable Dropdown class

**Improvements**:
- ✅ **Cleaner Architecture**: Built on reusable Dropdown foundation
- ✅ **Better Memory Management**: Proper instance tracking with `actionsDropdownInstance`
- ✅ **Consistent Behavior**: Same positioning and event handling as future dropdowns
- ✅ **Maintained Functionality**: All existing Actions menu features preserved
- ✅ **Separated Concerns**: Content generation via `createActionsDropdownContent()`
- ✅ **Modular Styling**: Styles via `ensureActionsDropdownStyles()`

**Features**:
- **Structure Section**: Add Child, Delete Node, Delete All Children (when applicable)
- **Data Section**: Export, Import, Chat
- **Smart Button States**: Disabled states for inappropriate actions (e.g., Add Child on leaf nodes)
- **Color-Coded Actions**: Danger (red), Warning (orange), Normal actions
- **Compact Design**: Optimized for dropdown usage with smaller padding and spacing

**Helper Functions**:
- `createActionsDropdownContent(node)` - Generate dropdown HTML content
- `ensureActionsDropdownStyles()` - Inject action-specific CSS styles
- Instance management with `actionsDropdownInstance` variable

## 📋 Modal System

### Modal Registry
- **File**: `src/ui/modals/core/ModalRegistry.ts`
- **Class**: `ModalRegistry`
- **Functions**:
  - `register(id, modal)` - Register modal
  - `unregister(id)` - Unregister modal
  - `open(id, config)` - Open modal
  - `close(id)` - Close modal
  - `closeAll()` - Close all modals

### Base Modal
- **File**: `src/ui/modals/core/BaseModal.ts`
- **Class**: `BaseModal`
- **Functions**:
  - `open()` - Open modal
  - `close()` - Close modal
  - `render()` - Render modal content
  - `destroy()` - Destroy modal

### Modal Factory
- **File**: `src/ui/modals/ModalFactory.ts`
- **Functions**:
  - `createModalFactory(deps)` - Create modal factory
  - `openSettingsModal()` - Open settings modal
  - `openExportModal(node)` - Open export modal
  - `openAddChildNodeModal(parentNode, parentId)` - Open add child node modal ✨ **NEW**
  - `showAlert(message)` - Show alert dialog
  - `showConfirm(message)` - Show confirmation dialog

### Settings Modal
- **File**: `src/ui/modals/SettingsModal.ts`
- **Class**: `SettingsModal`
- **Functions**:
  - `open(activeTab)` - Open with specific tab
  - `switchTab(tab)` - Switch to tab
  - `saveSettings()` - Save all settings

### Export Modal
- **File**: `src/ui/modals/ExportModal.ts`
- **Class**: `ExportModal`
- **Functions**:
  - `open(node)` - Open for specific node
  - `exportContent(scope, format)` - Export content
  - `copyToClipboard()` - Copy to clipboard

### AI Log Modal
- **File**: `src/ui/modals/AILogModal.ts`
- **Functions**:
  - `openAILogModal(query)` - Open AI log viewer
  - `searchLogs(query)` - Search log entries
  - `exportLogs()` - Export logs

### Context Info Modal
- **File**: `src/ui/modals/ContextInfoModal.ts`
- **Class**: `ContextInfoModal`
- **Functions**:
  - `open(node)` - Open for specific node
  - `showContext(context)` - Display context info
  - `extractContext(request)` - Extract specific context

### Key Validation Modal
- **File**: `src/ui/modals/KeyValidationModal.ts`
- **Class**: `KeyValidationModal`
- **Functions**:
  - `open()` - Open key validation
  - `validateKey(key)` - Validate entered key
  - `storeValidKey(key)` - Store valid key

### Add Child Node Modal ✨ **NEW**
- **File**: `src/ui/modals/AddChildNodeModal.ts`
- **Class**: `AddChildNodeModal`
- **Functions**:
  - `open()` - Open add child node dialog
  - `generateSuggestions()` - Generate AI-powered suggestions
  - `selectSuggestion(suggestion)` - Select AI suggestion
  - `createNode()` - Create child node with AI draft or manual input
  - `switchMode(mode)` - Switch between AI and manual modes
- **Modes**:
  - `ai` - AI-powered suggestions with draft content
  - `simple` - Manual title input only

## 🧩 Modal Components

### Criteria Editor
- **File**: `src/ui/modals/components/CriteriaEditor.ts`
- **Class**: `CriteriaEditor`
- **Functions**:
  - `getCriteria()` - Get current criteria
  - `setCriteria(criteria)` - Set criteria
  - `addCriterion()` - Add new criterion
  - `removeCriterion(index)` - Remove criterion
  - `resetToDefaults()` - Reset to defaults

### Profile Selector
- **File**: `src/ui/modals/components/ProfileSelector.ts`
- **Class**: `ProfileSelector`
- **Functions**:
  - `getSelectedProfileName()` - Get selected profile
  - `setSelectedProfile(name)` - Set selected profile
  - `refresh()` - Refresh profile list
  - `createProfile(name)` - Create new profile

## 📤 Export Services

### Export Service
- **File**: `src/ui/modals/services/ExportService.ts`
- **Class**: `ExportService`
- **Functions**:
  - `exportNode(node, scope, format)` - Export node content
  - `exportHierarchy(node)` - Export full hierarchy
  - `exportAsHTML(content)` - Export as HTML
  - `exportAsMarkdown(content)` - Export as Markdown
  - `exportForReimport(node)` - Export for reimport

## 🧪 Testing

### Test Runner
- **File**: `src/TestRunner.ts`
- **Class**: `TestRunner`
- **Functions**:
  - `runAllTests()` - Run all tests
  - `runTest(testName)` - Run specific test
  - `getTestResults()` - Get test results

### Test Files
- **Context Extraction**: `src/project/test-context-extraction.ts`
- **Phase 2 Tests**: `src/project/test-phase2.ts`
- **Phase 3 Tests**: `src/project/test-phase3.ts`
- **Service Tests**: `src/project/test-services.ts`

## 📱 Event Handling

### Event Handlers
- **File**: `src/event-handlers.ts`
- **Functions**:
  - `initializeEventHandlers()` - Initialize all handlers
  - `handleNodeClick(nodeId)` - Handle node selection
  - `handleGeneration(nodeId)` - Handle content generation
  - `handleSave()` - Handle save operations

### Event Emitter
- **File**: `src/EventEmitter.ts`
- **Class**: `EventEmitter`
- **Functions**:
  - `on(event, handler)` - Add event listener
  - `off(event, handler)` - Remove event listener
  - `emit(event, data)` - Emit event

### Event Management System ✨ **NEW - CRITICAL FIX**
- **File**: `src/ui/event-manager.ts`
- **Class**: `EventManager`
- **Problem Solved**: Eliminates event listener loss when DOM elements are replaced via `innerHTML`
- **Functions**:
  - `addDelegatedEvent(container, eventType, selector, handler)` - Add persistent event delegation
  - `addDirectEvent(element, eventType, handler, options)` - Add tracked direct listeners
  - `updateButtonContent(buttonId, content, options)` - Safely update button content without losing listeners
  - `replaceContent(container, htmlContent, options)` - Safe DOM replacement preserving event delegation
  - `cleanup()` - Clean up all tracked listeners
  - `getDebugInfo()` - Get event listener statistics

### Enhanced Event Handling
- **File**: `src/ui/project-ui-enhanced.ts`
- **Functions**:
  - `setupEnhancedEventListeners()` - Use EventManager for robust event handling
  - `updateGenerateButton(nodeId, state)` - Safe button updates during generation
  - `replaceNodeDetailsContent(htmlContent)` - Safe DOM replacement for node details
  - `cleanupEnhancedEventListeners()` - Cleanup when switching projects

**🔧 Usage Pattern for Event Listener Issues**:
```typescript
// Replace problematic direct attachment:
getElementById('some-button').addEventListener('click', handler);

// With robust event delegation:
eventManager.addDelegatedEvent('main-content', 'click', '#some-button', handler);
```

### DOM Replacement Point Management ✨ **NEW - CRITICAL FIX**
- **Problem**: Event listeners were lost when DOM elements were replaced via `innerHTML` operations
- **Solution**: Systematic identification and fixing of all DOM replacement points
- **Files**: `src/ui/project-ui.ts` (primary fixes)

**Critical DOM Replacement Points Fixed**:
- ✅ **`renderProjectUI()`** - Added `setupEventListeners()` call after DOM replacement
- ✅ **`renderNodeDetails()`** - Already had `setupEventListeners()` call after DOM replacement
- ✅ **`renderMultiProjectTree()`** - Tree navigation only, no button areas affected
- ✅ **Profile selector updates** - Only affects dropdown options, not button areas

**Event Listener Robustness Pattern**:
```typescript
// Pattern: DOM replacement followed by event listener re-attachment
function renderProjectUI(proj: ProjectManager) {
    // ... DOM replacement operations ...
    renderMultiProjectTree();
    renderNodeDetails();
    
    // Critical: Re-attach event listeners after DOM replacement
    setupEventListeners();
}
```

**Button Handler Centralization**:
```typescript
// Centralized button handlers for consistent re-attachment
const buttonHandlers: Record<string, (event: Event) => void> = {
    'node-generate-btn': handleGenerateClick,
    'default-prompt-btn': handleDefaultPromptClick,
    'actions-dropdown-btn': handleActionsClick,
    // ... all other button handlers
};
```

**Benefits**:
- 🎯 **Eliminated Event Listener Loss**: Buttons remain functional after any UI state changes
- 🎯 **Systematic Coverage**: All DOM replacement points identified and fixed
- 🎯 **Centralized Management**: Single point of control for event listener setup
- 🎯 **Robust Architecture**: Automatic re-attachment after any DOM structural changes

## 🏗️ Types & Interfaces

### Core Types
- **File**: `src/types.ts`
- **Interfaces**:
  - `CreatorPayload` - Content creation data
  - `RatingPayload` - Content rating data
  - `EditorPayload` - Content editing data
  - `QualityCriterion` - Quality criteria definition
  - `AILogEntry` - AI interaction log entry

### Project Types
- **File**: `src/project/types/ProjectTypes.ts`
- **Interfaces**:
  - `ProjectDependencies` - Project dependency injection
  - `GenerationOptions` - Content generation options
  - `GenerationContext` - Generation context data
  - `LoadResult` - Project load result

### Modal Types
- **File**: `src/ui/modals/types/ModalTypes.ts`
- **Interfaces**: All modal-related type definitions (centralized)

### Export Types
- **File**: `src/ui/modals/types/ExportTypes.ts`
- **Types**: `ExportScope`, `ExportFormat`, export-related interfaces

### Reader Types
- **File**: `src/types/ReaderEditingTypes.ts`
- **Interfaces**: Reader/editor related type definitions

## 🚀 Application Entry Points

### Main Application
- **File**: `src/main.ts`
- **Functions**:
  - `initializeApp()` - Initialize entire application
  - `loadProjects()` - Load saved projects
  - `setupUI()` - Setup user interface

### Key Management Entry
- **File**: `src/keys/keys-ui.ts`
- **Functions**:
  - `initializeKeyUI()` - Initialize key management UI
  - `handleKeyValidation()` - Handle key validation

## 📋 Usage Examples

### Creating a New Project
```typescript
import { ProjectManager } from './src/ProjectManager';
import { getActiveTemplate } from './src/TemplateManager';

const template = getActiveTemplate();
const project = new ProjectManager();
await project.createProject("My Project", template);
```

### Opening Settings Modal
```typescript
import { openSettingsModal } from './src/ui/modals';

openSettingsModal({ activeTab: 'prompts' });
```

### Generating Content
```typescript
import { getActiveProject } from './src/state';

const project = getActiveProject();
await project.generateContent(nodeId);
```

### Exporting Content
```typescript
import { ExportService } from './src/ui/modals/services/ExportService';

const exportService = new ExportService();
await exportService.exportNode(node, 'hierarchy', 'html');
```

### Adding Child Nodes ✨ **NEW**
```typescript
import { openAddChildNodeModal } from './src/ui/modals/ModalFactory';

// Open Add Child Node modal for a specific parent node
const parentNode = projectManager.findNodeById(parentNodeId);
const modal = await openAddChildNodeModal(parentNode, parentNodeId);

// Or using the Node Creation Service directly
import { NodeCreationService } from './src/ui/modals/services/NodeCreationService';

const nodeCreationService = new NodeCreationService(/* dependencies */);
const suggestions = await nodeCreationService.generateSuggestions(parentNode, 5);
const newNode = await nodeCreationService.createNode({
    parentNodeId: parentNode.id,
    title: 'New Chapter',
    draft: 'AI-generated draft content...',
    updateParent: true
});
```

---

## 🔄 Recently Refactored (Clean Architecture)

### Template Reference Strategy ✨ **NEW OPTIMIZATION** 
- **File**: `src/ProjectManager.ts` and `src/DocumentNode.ts`
- **Purpose**: Optimal balance between memory efficiency and template modification flexibility

**ROOT NODE TEMPLATE HANDLING**:
- ✅ Root nodes get **deep copy** (`[...template.hierarchyLevels]`) of template array
- ✅ Allows project-wide template modifications via root node reference
- ✅ Maintains template independence between different projects

**CHILD NODE TEMPLATE HANDLING**:
- ✅ Child nodes **share root node's template reference** (shallow copy)
- ✅ Ensures consistency: all nodes in project share same template
- ✅ Memory efficient: no unnecessary array copies for child nodes

**PERSISTENCE CONSISTENCY**:
- ✅ Updated `ProjectManager.rehydrateNode()` to maintain pattern during load
- ✅ Root node gets deep copy when loading from storage
- ✅ Child nodes share root's template reference during rehydration

**Benefits**:
- 🎯 **Project Template Control**: Modify template for entire project via root node
- 🎯 **Automatic Propagation**: Changes automatically affect all child nodes
- 🎯 **Memory Optimization**: No waste from unnecessary deep copies
- 🎯 **Export/Import Preservation**: Template structure maintained across save/load cycles
- 🎯 **Referential Integrity**: Consistent template references within projects

### Collapsed State Architecture Migration ✨ **MAJOR REFACTORING**
- **Purpose**: Move UI state into data model for better persistence and consistency

**BREAKING CHANGES**:
- ❌ Removed global `collapsedNodes` Set and related storage functions
- ✅ Added `collapsed: boolean` property to `DocumentNode` class
- ✅ Collapsed state now part of each node's serialization (`toJSON()`)
- ✅ Collapsed state automatically preserved in export/import operations
- ✅ Each project maintains its own independent collapsed state

**TECHNICAL IMPROVEMENTS**:
- ✅ No more race conditions with async global state persistence
- ✅ Collapsed state properly belongs in the data model
- ✅ Simplified UI logic - no separate state management needed
- ✅ Enhanced `buildTreeHtml()` to use `node.collapsed` directly
- ✅ Updated expand/collapse handlers to modify node properties
- ✅ Eliminated separate `saveCollapsedState()` and `loadCollapsedState()` functions

**Benefits**:
- 🎯 **Data Model Consistency**: UI state stored where it logically belongs
- 🎯 **Export/Import Preservation**: Tree folding preferences maintained across operations
- 🎯 **No Race Conditions**: Synchronous property access eliminates timing bugs
- 🎯 **Per-Project State**: Each project maintains independent tree folding
- 🎯 **Simplified Architecture**: One less global state management system

### Tree Folding Bug Resolution ✨ **FIXED**
- **Problem**: Clicking expand on second project incorrectly collapsed first project
- **Root Cause**: Race condition between async state persistence and DOM re-rendering
- **Solution**: Move collapsed state to node properties, eliminate async persistence
- **Result**: Tree folding now works correctly and consistently

### Enhanced Progress Bar Messaging System ✨ **MAJOR ENHANCEMENT**
- **Purpose**: Provide clear, context-aware progress messages during AI generation
- **Files**: `src/LoopOrchestrator.ts`, `src/project/GenerationService.ts`, `src/ui/project-ui.ts`

**Key Improvements**:
- ✅ **Model Name Resolution**: Added `getModelNameForPurpose()` for friendly model names
- ✅ **Enhanced LoopProgress Interface**: Added fields for model names, content types, completion status
- ✅ **Context-Aware Messaging**: Different messages for prose vs outline, first creation vs revision
- ✅ **Completion Messages**: Clear feedback on whether all criteria were satisfied
- ✅ **Progress Event Filtering**: Prevented duplicate editor progress events

**Message Examples**:
- "Claude 3 Sonnet is creating prose..." (first creation)
- "Claude 3 Sonnet is rating the prose..." (rating phase)
- "prose rejected! xAI: Grok 3 Mini is generating recommendations..." (rejection)
- "Claude 3 Sonnet is revising prose based on recommendations..." (revision)
- "Done! All criteria satisfied" (successful completion)

### Event Listener Robustness & DOM Replacement Management ✨ **CRITICAL FIX**
- **Purpose**: Eliminate event listener loss during DOM replacement operations
- **Files**: `src/ui/project-ui.ts` (primary fixes)

**Problem Solved**:
- ✅ **Root Cause**: `innerHTML` operations were destroying DOM elements and their event listeners
- ✅ **Systematic Fix**: Identified all DOM replacement points and added `setupEventListeners()` calls
- ✅ **Centralized Architecture**: Unified button handler management for consistent re-attachment
- ✅ **Comprehensive Coverage**: All critical DOM replacement points now trigger event listener re-attachment

**Technical Implementation**:
- ✅ **`renderProjectUI()`**: Added `setupEventListeners()` after DOM replacement
- ✅ **`renderNodeDetails()`**: Already had proper event listener re-attachment
- ✅ **Button Handler Centralization**: Unified handlers for consistent re-attachment
- ✅ **Event Listener Pattern**: Remove all → Change UI → Re-attach all

### AI Action Blocking During External Updates ✨ **CRITICAL STABILITY FIX**
- **Purpose**: Prevent external content updates from interfering with active AI actions in reader view
- **Files**: `src/ui/reader-editor.ts`, `src/ui/reader-gui.ts`

**Problem Solved**:
- ✅ **Root Cause**: Automatic content updates during AI generation were breaking active AI actions
- ✅ **External Updates**: Reader view automatically updates when new content arrives via generation
- ✅ **State Interference**: External updates could disrupt AI action state and user workflow
- ✅ **Comprehensive Blocking**: All external update vectors now check for active AI actions

**Technical Implementation**:
- ✅ **Action State Tracking**: Added `activeActionsCount` to track number of active AI actions
- ✅ **State Monitoring**: `isAIActionInProgress()` method for checking active actions
- ✅ **Loading State Integration**: Enhanced `showActionLoadingState`/`hideActionLoadingState` to manage counter
- ✅ **Update Blocking**: Added AI action checks to all external update methods

**Protected Update Methods**:
- ✅ **`handleNodeGenerationComplete()`**: Blocks automatic content updates during AI actions
- ✅ **`updateNodeContentInReader()`**: Prevents individual node content updates during AI actions
- ✅ **`refreshReaderForNewNodes()`**: Blocks reader rebuilds when AI actions are active
- ✅ **`handleProjectUpdate()`**: Prevents project structure changes during AI actions

**Benefits**:
- 🎯 **Stable AI Actions**: AI actions complete without external interference
- 🎯 **Preserved User Context**: User's editing state remains intact during AI operations
- 🎯 **Predictable Behavior**: Consistent AI action experience without unexpected interruptions
- 🎯 **Comprehensive Coverage**: All external update vectors properly protected

### Version Migration System Development

---

## 📚 Additional Documentation

- [Event Listener Solution](Event_Listener_Solution.md) - Complete guide to fixing lost event listener issues
- [Event Listener Test Instructions](Event_Listener_Test_Instructions.md) - Testing guide for the implemented EventManager fixes
- [Expert User Manual](Expert_User_Manual.md) - Complete user guide for the Expert application
- [Vision and Plan](Vision_And_Plan.md) - Strategic direction and development roadmap
- [Deployment Guide](DEPLOYMENT.md) - Instructions for deploying the application
- [Reader Editing System Plan](Reader_Editing_System_Plan.md) - Technical plan for reader interface improvements 