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
  - `initialize()` - Initialize database connection
  - `get(storeName, key)` - Retrieve data
  - `set(storeName, key, value)` - Store data
  - `delete(storeName, key)` - Delete data
  - `getAll(storeName)` - Get all data from store
  - `clear(storeName)` - Clear entire store
  - `close()` - Close database connection

### Storage Service
- **File**: `src/StorageService.ts`
- **Interface**: `IStorageService`
- **Class**: `IndexedDBStorageService`
- **Functions**:
  - `get(key)` - Retrieve data
  - `set(key, value)` - Store data
  - `delete(key)` - Remove data
  - `getAll(prefix?)` - Get all data with optional prefix filter
  - `clear()` - Clear entire storage
  - `getUsage()` - Get storage quota/usage info
  - `getIndexedDBService()` - Get underlying IndexedDB service

### localStorage Policy
- **File**: `src/LocalStorageBlocker.ts`
- **Class**: `LocalStorageBlocker`
- **Functions**:
  - `initialize(config)` - Initialize blocking system
  - `withLocalStorageAccess(operation, reason)` - Temporary access for legitimate operations
  - `isKeyAllowed(key)` - Check if key is allowed

**Legacy Cleanup**:
- **File**: `src/ui/modals/services/LocalStorageCleanupService.ts`
- **Class**: `LocalStorageCleanupService`
- **Functions**:
  - `getCleanupSummary()` - Analyze localStorage state
  - `performCleanup(dryRun)` - Remove old entries
  - `showCleanupDialog()` - Interactive cleanup UI

### Project Persistence
- **File**: `src/project/ProjectPersistenceService.ts`
- **Class**: `ProjectPersistenceService`
- **Functions**:
  - `saveProject(project)` - Save entire project
  - `loadProject(projectId)` - Load project by ID
  - `deleteProject(projectId)` - Delete project
  - `listProjects()` - Get all saved projects
  - `createBackup()` - Create project backup
  - `importProject(data)` - Import project data

## 📋 Project Management

### Core Project Management
- **File**: `src/ProjectManager.ts`
- **Class**: `ProjectManager` (extends `EventEmitter<ProjectManagerEvents>`)
- **Functions**:
  - `createProject(title, template)` - Create new project
  - `loadProject(data)` - Load existing project
  - `saveProject()` - Save current project
  - `addChildNode(parent, title)` - Add child node
  - `deleteNode(nodeId)` - Delete node
  - `moveNode(nodeId, newParentId)` - Move node
  - `generateContent(nodeId)` - Generate content for node
  - `findNodeById(nodeId)` - Find node by ID
  - `rehydrateNode(nodeData, template)` - Restore node from data
- **Events**: See `ProjectManagerEvents` type definition in same file

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
  - `content` - Node content (getter for master-tagged version)
  - `children` - Child nodes array
  - `parent` - Parent node reference
  - `template` - Template array reference
  - `collapsed` - Tree UI collapsed state
- **Functions**:
  - `addChild(child)` - Add child node
  - `removeChild(childId)` - Remove child node
  - `getPath()` - Get node path
  - `isLeaf()` - Check if node is leaf
  - `toJSON()` - Serialize node data
  - `fromJSON(data)` - Static method to restore from JSON with legacy conversion

### Tag-Based Version System
- **File**: `src/DocumentNode.ts`
- **Interface**: `ContentVersion`
- **Properties**:
  - `id` - Unique version identifier
  - `content` - Version content
  - `tags` - Set of tags for categorization
  - `timestamp` - Creation timestamp
  - `metadata` - Optional metadata (ratings, creator model, etc.)
- **Content Management Functions**:
  - `setContentWithTags(content, tags, metadata)` - Set content with explicit tags (becomes master)
  - `setMasterContentDirect(content)` - Internal use only, updates master content directly
  - `getAllVersions()` - Get all content versions
  - `getVersionsWithTag(tag)` - Get versions with specific tag
  - `getMasterVersion()` - Get the master-tagged version
  - `promoteToMaster(versionId)` - Promote version to master
  - `addTagsToVersion(versionId, tags)` - Add tags to existing version
  - `removeTagsFromVersion(versionId, tags)` - Remove tags from version

### Version Tags System
**Standard Tags**: `master`, `generated`, `iteration{N}`, `generatedWinner`, `draft`, `legacy`, `imported`, `polished`, `coherenceFix`, `ManualEdit_YYYY-MM-DD_HH-MM-SS`, `Batch_YYYY-MM-DD_HH-MM-SS`, `Restored_YYYY-MM-DD_HH-MM-SS`

### Content Assignment Safety
- **Required Methods**: Use `setContentWithTags()` or `setMasterContentDirect()` for content changes
- **Enforcement**: Direct `node.content = value` assignment causes TypeScript errors

### Context Management
- **File**: `src/project/ContextService.ts`
- **Class**: `ContextService`
- **Functions**:
  - `copyParentContextToChild(childNode, rootNode)` - Copy parent context
  - `compileNodeContext(nodeId, rootNode)` - Compile context for generation
  - `buildSiblingContext(targetNode, rootNode)` - Build context from siblings
  - `getContextSummary(nodeId, rootNode)` - Get context summary

### Context Extraction
- **File**: `src/project/ContextExtractionService.ts`
- **Class**: `ContextExtractionService`
- **Functions**:
  - `extractContext(node, request)` - Extract context from node
  - `parseExtractionResult(result)` - Parse extraction results

### Context Adjustment
- **File**: `src/ui/modals/ContextAdjusterModal.ts`
- **Class**: `ContextAdjusterModal`
- **Functions**:
  - `openInLoadingState(node)` - Open modal and start AI analysis
  - `analyzeContext(node)` - Analyze context for problematic items
  - `removeItem(itemNumber)` - Remove specific context item
  - `removeAllItems()` - Remove all problematic context items
  - `undoRemoveItem(itemNumber)` - Undo item removal
  - `applyChanges()` - Apply all changes to node and save
  - `resetChanges()` - Reset all pending changes
- **UI Integration**: Button handler `'context-adjuster-btn'` in `src/ui/project-ui.ts`

## 🎯 Content Generation

### Generation Orchestration
- **File**: `src/LoopOrchestrator.ts`
- **Class**: `LoopOrchestrator`
- **Functions**:
  - `runLoop(input)` - Run generation loop
  - `rateContent(content, criteria)` - Rate generated content
  - `requestStop()` - Request loop termination
  - `isLoopRunning()` - Check if loop is running
  - `getCurrentIteration()` - Get current iteration number
  - `getModelNameForPurpose(purpose)` - Get friendly model name

### Unified Generation Service
- **File**: `src/project/UnifiedGenerationService.ts`
- **Class**: `UnifiedGenerationService`
- **Functions**:
  - `generateWithLevels(startNodeId, levels)` - Start level-based generation
  - `abortCurrentGeneration()` - Abort ongoing generation
- **Level Configuration**:
  - `draftLevel` - Deepest level for which children are created
  - `contentLevel` - Which levels get content generated (must be ≤ draftLevel)
  - `contextPruneLevel` - Which levels get context auto-pruned
  - `coherenceLevel` - Which levels get coherence checking (must be < draftLevel)
- **Events Emitted**: `unified-progress`, `tree-update-needed`, `nodeGenerationComplete`, `nodeGenerationStarted`

### Generation Coordination
- **File**: `src/project/GenerationCoordinator.ts`
- **Class**: `GenerationCoordinator`
- **Functions**:
  - `startOperation(type, nodeId)` - Start tracked operation
  - `completeOperation(operationId, success, error)` - Complete operation
  - `isOperationRunning()` - Check if operation is running

### Generation Controller
- **File**: `src/project/GenerationController.ts`
- **Class**: `GenerationController`
- **Functions**:
  - `setupSingleNodeGeneration(nodeId)` - Setup generation context
  - `clearGenerationContext()` - Clear generation state
  - `canAbortGeneration(rootNode)` - Check if generation can be aborted

## 🎯 Node Creation & Management

### Node Creation Service
- **File**: `src/ui/modals/services/NodeCreationService.ts`
- **Class**: `NodeCreationService`
- **Functions**:
  - `generateSuggestions(parentNode, count)` - Generate AI-powered child node suggestions
  - `updateParentContent(parentNode, childTitle)` - Update parent content to reference new child
  - `createNode(config)` - Create new child node with optional draft content
  - `parseJsonResponse(content)` - Parse AI JSON responses
  - `validateSuggestions(suggestions, count)` - Validate AI suggestions

## 🤖 AI & Model Management

### OpenRouter Client
- **File**: `src/OpenRouterClient.ts`
- **Class**: `OpenRouterClient`
- **Functions**:
  - `streamingChat(purpose, messages, callbacks, operationId?, externalAbortSignal?)` - **RECOMMENDED**: Stream AI response with callbacks
  - `chat(purpose, message, operationId?, externalAbortSignal?)` - **DEPRECATED**: Legacy method, routes to streamingChat internally
  - `getModels()` - Get available models
  - `getModelConfigForPurpose(purpose)` - Get model configuration including provider
  - `fetchModelEndpoints(model)` - Get provider endpoints for model
  - `setApiKey(key)` - Set API key from UI (deprecated in singleton mode)
  - `getApiKeyFromStorage()` - Get API key from IndexedDB
  - `abortOperation(operationId)` - Abort specific operation
- **Provider Selection**: 
  - Supports OpenRouter provider routing via `provider` parameter
  - Provider selections persist per-purpose in IndexedDB
  - "Automatic" mode lets OpenRouter choose best provider
- **Progress Events**: Dispatches `ai-progress` CustomEvents with `{type, message, characters?}` data

### Model Selection
- **File**: `src/ModelSelector.ts`
- **Class**: `ModelSelector`
- **Functions**:
  - `getSelectedModels()` - Get selected models for all purposes
  - `setSelectedModels(models)` - Set selected models
  - `getAvailableModels()` - Get all available models from OpenRouter
  - `loadFromStorage()` - Load model configuration from IndexedDB
  - `saveToStorage()` - Save model configuration to IndexedDB
  - `fetchModelEndpoints(model)` - Get provider endpoints for model
  - `getProviderSlug(providerName)` - Map provider display name to API slug
- **Provider Management**:
  - Provider selections stored per-purpose (`prose`, `creator`, `editor`, `rater`)
  - Automatically fetches provider options when models selected
  - "Automatic" provider lets OpenRouter choose best option
  - Provider changes persist immediately to IndexedDB
- **Web Search Configuration**:
  - Per-purpose web search enable/disable
  - Integrates with OpenRouter's native web search capabilities

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

### Prompt Service
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

### Settings Service
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
  - `checkAppAccess()` - Check if valid key exists
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

### Key Cryptography
- **File**: `src/keys/KeyCrypto.ts`
- **Functions**:
  - `generateKeyPair()` - Generate RSA key pair
  - `encryptData(data, publicKey)` - Encrypt data
  - `decryptData(encryptedData, privateKey)` - Decrypt data

## 🎨 User Interface

### Main UI
- **File**: `src/ui/project-ui.ts`
- **Functions**:
  - `setupEventListeners()` - Setup all event listeners
  - `renderProjectUI(project)` - Render main project interface
  - `renderNodeDetails(nodeId)` - Render node details panel
  - `renderMultiProjectTree()` - Render project tree
  - `updateGenerateButton(nodeId, state)` - Update generation button state
  - `handleGenerateClick(node)` - Handle generate button clicks with level-based generation
  - `handleBulkGenerationComplete(event)` - Handle bulk generation completion
- **Button Handlers**: `buttonHandlers` object maps button IDs to event handlers

### Version Navigation UI
- **File**: `src/ui/project-ui.ts`
- **Functions**:
  - `initializeVersionNavigation(node)` - Initialize version navigation for node
  - `updateVersionNavigationUI()` - Update navigation controls and indicators
  - `updateVersionContentDisplay()` - Update content display for selected version
- **Variables**: `currentVersionIndex`, `availableVersions`

### Enhanced Event Management
- **File**: `src/ui/event-manager.ts`
- **Class**: `EventManager`
- **Functions**:
  - `addDelegatedEvent(container, eventType, selector, handler)` - Add persistent event delegation
  - `addDirectEvent(element, eventType, handler, options)` - Add tracked direct listeners
  - `updateButtonContent(buttonId, content, options)` - Safe button updates
  - `replaceContent(container, htmlContent, options)` - Safe DOM replacement
  - `cleanup()` - Clean up all tracked listeners

### Modal System
- **File**: `src/ui/modals/core/BaseModal.ts`
- **Class**: `BaseModal`
- **Functions**:
  - `open()` - Open modal
  - `close()` - Close modal
  - `render()` - Render modal content

### Modal Layout Patterns
**Key CSS patterns for modal layouts:**
```css
/* Container pattern */
.modal-container { height: 100%; display: flex; flex-direction: column; }
.modal-body { flex: 1; min-height: 0; overflow: hidden; }
.scrollable-content { flex: 1; overflow-y: auto; }
```

### Modal Registry
- **File**: `src/ui/modals/core/ModalRegistry.ts`
- **Functions**:
  - `register(modal)` - Register modal instance
  - `unregister(modalId)` - Unregister modal
  - `getModal(modalId)` - Get modal by ID
  - `closeAll()` - Close all open modals

### Modal Factory
- **File**: `src/ui/modals/ModalFactory.ts`
- **Functions**:
  - `openSettingsModal(options)` - Open settings modal
  - `openExportModal(options)` - Open export modal
  - `openAddChildNodeModal(parentNode, parentNodeId)` - Open add child modal
  - `openCoherenceModal(nodeId)` - Open coherence check modal
  - `openContextAdjusterModal(node)` - Open context adjuster modal

## 📤 Export Services

### Node Export Service
- **File**: `src/ui/modals/services/ExportService.ts`
- **Class**: `ExportService`
- **Functions**:
  - `exportNode(node, scope, format)` - Export node content
  - `exportHierarchy(node)` - Export full hierarchy
  - `exportAsHTML(content)` - Export as HTML
  - `exportAsMarkdown(content)` - Export as Markdown
  - `exportForReimport(node)` - Export for reimport

### Comprehensive Export Service
- **File**: `src/ui/modals/services/ComprehensiveExportService.ts`
- **Class**: `ComprehensiveExportService`
- **Functions**:
  - `createComprehensiveBackup()` - Export all IndexedDB data
  - `getExportSummary()` - Get summary of exportable data
  - `getIndexedDBService()` - Get direct IndexedDB access
  - `filterSensitiveData(data)` - Remove sensitive keys
  - `downloadBlob(blob, filename)` - Trigger file download

### EPUB Generation Services
- **File**: `src/ui/modals/services/SimpleEpubGenerator.ts`
- **Class**: `SimpleEpubGenerator`
- **Functions**:
  - `generateEpub(rootNode, title, author)` - Generate EPUB from node hierarchy
  - `generateChapterContent(node)` - Convert node content to EPUB format
  - `sanitizeForEpub(content)` - Clean content for EPUB standards

- **File**: `src/ui/modals/services/WorkingEpubGenerator.ts`
- **Class**: `WorkingEpubGenerator`
- **Functions**:
  - `generateEpub(rootNode, options)` - Advanced EPUB generation with full options
  - `createTableOfContents(nodes)` - Generate navigation structure
  - `processNodeHierarchy(node, level)` - Process nested node structure
  - `addMetadata(options)` - Add EPUB metadata and styling

- **File**: `src/HelloWorldEpubGenerator.ts`
- **Class**: `HelloWorldEpubGenerator`
- **Functions**:
  - `generateHelloWorldEpub()` - Generate test EPUB for validation
  - `createSimpleEpubStructure()` - Create minimal valid EPUB structure

## 🧪 Testing

### Test Runner
- **File**: `src/TestRunner.ts`
- **Class**: `TestRunner`
- **Functions**:
  - `runAllTests()` - Run all tests
  - `runTest(testName)` - Run specific test
  - `getTestResults()` - Get test results

## 📱 Event Handling

### Event Handlers
- **File**: `src/event-handlers.ts`
- **Functions**:
  - `initialize()` - Initialize all handlers
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

### AI Progress Events
- **Event**: `ai-progress` CustomEvent
- **Dispatched by**: `OpenRouterClient` during AI operations
- **Listened by**: `src/ui/project-ui.ts` for UI updates
- **Event Detail Structure**:
  - `type: 'start'` - AI generation started, `message` contains status
  - `type: 'update'` - Streaming progress update, `characters` contains current count
  - `type: 'complete'` - AI generation finished, `characters` contains final count
- **Usage Example**:
  ```javascript
  window.addEventListener('ai-progress', (event) => {
    const { type, message, characters } = event.detail;
    // Update UI based on progress type
  });
  ```

## 🏗️ Types & Interfaces

### Core Types
- **File**: `src/types.ts`
- **Interfaces**: `CreatorPayload`, `RatingPayload`, `EditorPayload`, `QualityCriterion`, `AILogEntry`

### Project Types
- **File**: `src/project/types/ProjectTypes.ts`
- **Interfaces**: `ProjectDependencies`, `GenerationOptions`, `GenerationContext`, `LoadResult`

### Modal Types
- **File**: `src/ui/modals/types/ModalTypes.ts`
- **Interfaces**: All modal-related type definitions

### Export Types
- **File**: `src/ui/modals/types/ExportTypes.ts`
- **Types**: `ExportScope`, `ExportFormat`, export-related interfaces

## 🚀 Application Entry Points

### Main Application
- **File**: `src/main.ts`
- **Functions**:
  - `startApplication()` - Initialize entire application
  - `addVersionInfoToHeader()` - Add version display
  - `checkVersionMismatches()` - Handle version migration

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

### Using Storage Service
```typescript
import { StorageService } from './src/StorageService';

const storage = await StorageService.getInstance();
await storage.set('key', data);
const data = await storage.get('key');
```

### Using OpenRouter Client (Recommended Pattern)
```typescript
import { OpenRouterClient } from './src/OpenRouterClient';

const client = OpenRouterClient.getInstance();

// RECOMMENDED: Use streamingChat for new code
let fullResponse = '';
await client.streamingChat('creator', [{ role: 'user', content: prompt }], {
  onStart: () => console.log('AI generation started'),
  onChunk: (chunk) => {
    fullResponse += chunk;
    console.log(`Received ${fullResponse.length} characters so far`);
  },
  onComplete: (response) => console.log('Generation complete:', response),
  onError: (error) => console.error('Generation failed:', error)
});

// LEGACY: chat() method (deprecated but still works)
const response = await client.chat('creator', prompt);
```

### Listening to AI Progress Events
```typescript
// Set up progress tracking in UI
window.addEventListener('ai-progress', (event) => {
  const { type, message, characters } = event.detail;
  const progressElement = document.getElementById('ai-progress-report');
  
  switch(type) {
    case 'start':
      progressElement.textContent = message;
      progressElement.style.display = 'block';
      break;
    case 'update':
      progressElement.textContent = `${characters} characters received so far...`;
      break;
    case 'complete':
      progressElement.textContent = `Done. ${characters} characters received.`;
      break;
  }
});
``` 