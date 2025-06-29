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
- **Functions**:
  - `addChild(child)` - Add child node
  - `removeChild(childId)` - Remove child node
  - `getPath()` - Get node path
  - `isLeaf()` - Check if node is leaf

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
  - `runLoop(input)` - Run generation loop
  - `generateContent(prompt, criteria)` - Generate content
  - `rateContent(content, criteria)` - Rate generated content
  - `editContent(content, ratings)` - Get editing suggestions

### Generation Services
- **File**: `src/project/GenerationService.ts`
- **Class**: `GenerationService`
- **Functions**:
  - `generateForNode(node, options)` - Generate content for node
  - `expandNode(node, count)` - Generate child nodes
  - `createChildrenFromOutline(node, outline)` - Create children from outline

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

### Centralized Type Definitions
All modal-related interfaces are now centralized in `src/ui/modals/types/ModalTypes.ts` to prevent duplication bugs.

### Consolidated Placeholders
Prompt placeholders are now centrally defined in `src/PromptManager.ts` and imported where needed.

### Single Source of Truth
- ✅ No duplicate interface definitions
- ✅ Centralized type management
- ✅ Consistent imports across the codebase 

### Storage Architecture
- ✅ Full IndexedDB migration completed
- ✅ No automatic localStorage usage in main application
- ⚠️ **localStorage only with explicit user authorization**
- ✅ All persistent data uses `StorageService` → IndexedDB 

### Simplified Context System (Latest)
- ✅ **Removed complex context synthesis** - No more LLM-based context distillation
- ✅ **Removed `<persist>` tag mechanics** - No more special tag handling
- ✅ **Simple parent-to-child copying** - Context is now directly inherited
- ✅ **Cleaner generation process** - No post-generation context synthesis
- ✅ **Reduced dependencies** - ContextService no longer needs OpenRouterClient

### Add Child Node Architecture ✨ **NEW**
- ✅ **Modal-Service Pattern** - UI modals delegate business logic to dedicated services
- ✅ **AI-Powered Node Creation** - NodeCreationService handles AI suggestion generation
- ✅ **Draft Content Convention** - "Draft: " prefix signals content needs expansion
- ✅ **Automatic UI Refresh** - Modal Factory callbacks automatically refresh project tree
- ✅ **Dual Mode Interface** - Single modal supports both AI and manual node creation
- ✅ **Parent Content Updates** - Optional AI-powered parent content updates when adding children

### Key Architectural Patterns Established
- 🏗️ **Modal Factory with Callbacks** - `onAction` callbacks enable automatic UI refresh
- 🏗️ **Service Layer Pattern** - Business logic separated from UI in dedicated service classes
- 🏗️ **Content State Conventions** - Standardized patterns for content state signaling
- 🏗️ **Dynamic Import Pattern** - Modal Factory uses dynamic imports to avoid circular dependencies 