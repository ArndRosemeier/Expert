# Expert Application - Developer Guide

Essential technical documentation for the Expert application architecture.

## 🚀 Getting Started

### Entry Points
- **Main App**: `src/main.ts` - Core application entry point
- **Keys Management**: `src/keys/index.ts` - Separate key management system (accessed via `/keys.html`)

### Build & Deploy
```bash
npm run dev              # Development server
npm run build            # Production build
npm run deploy:domainfactory  # Deploy to production
npm run deadcode:check   # Check for unused code
npm run deadcode:remove  # Remove unused code automatically
```

## 🏗️ Core Architecture

### Storage & Persistence
- **`src/StorageService.ts`** - Main storage abstraction (IndexedDB wrapper)
- **`src/IndexedDBService.ts`** - Direct IndexedDB operations
- **`src/LocalStorageBlocker.ts`** - localStorage access control

### Project Management  
- **`src/ProjectManager.ts`** - Core project operations and state management
- **`src/DocumentNode.ts`** - Node structure with tag-based versioning system
- **`src/state.ts`** - Global application state and service accessors
- **`src/ProjectTemplate.ts`** - Project template system
- **`src/ProjectUtils.ts`** - Project utility functions

### Content Generation & AI Services
- **`src/LoopOrchestrator.ts`** - AI generation orchestration 
- **`src/project/UnifiedGenerationService.ts`** - Level-based bulk generation
- **`src/OpenRouterClient.ts`** - AI provider integration with streaming support
- **`src/AIInteractionsService.ts`** - AI interaction tracking and analytics
- **`src/AILogService.ts`** - AI conversation logging
- **`src/services/TaskModelService.ts`** - AI model assignment per task type
- **`src/services/PromptExpansionService.ts`** - Dynamic prompt variable expansion

### Settings & Configuration
- **`src/SettingsManager.ts`** - User profiles and settings
- **`src/ModelSelector.ts`** - AI model configuration
- **`src/PromptManager.ts`** - Prompt templates and management
- **`src/TemplateManager.ts`** - Project template management

## 🎨 User Interface Architecture

### Main UI Components
- **`src/ui/project-ui.ts`** - Primary project interface and event handling
- **`src/ui/event-manager.ts`** - Enhanced DOM event management
- **`src/ui/dom-elements.ts`** - DOM utility functions
- **`src/ui/chat-interface.ts`** - AI chat interface component

### Text Editor System
- **`src/ui/text-editor-with-highlighting.ts`** - ⚠️ CRITICAL: Main text editor with highlighting support
- **`src/ui/components/UniversalTextEditor.ts`** - Universal text editor with AI transformation
- **`src/ui/components/TextTransformModal.ts`** - AI text transformation interface

### Component Library
- **`src/ui/components/SelectableNodeTree.ts`** - Interactive node tree component
- **`src/ui/components/RatingsRenderer.ts`** - Content rating display
- **`src/ui/components/LanguageSelector.ts`** - Language selection component
- **`src/ui/components/TaskModelEditor.ts`** - AI model assignment editor
- **`src/ui/components/SingleTemplateEditor.ts`** - Template editing component
- **`src/ui/components/BatchUpdateModal.ts`** - Batch operations interface

### Modal System
- **`src/ui/modals/core/BaseModal.ts`** - Base modal class with lifecycle management
- **`src/ui/modals/core/ModalRegistry.ts`** - Modal instance registry
- **`src/ui/modals/ModalFactory.ts`** - Modal creation utilities
- **`src/ui/modal-manager.ts`** - Global modal management

### Core Modals
- **`src/ui/modals/NewProjectModal.ts`** - Project creation
- **`src/ui/modals/SettingsModal.ts`** - Settings management
- **`src/ui/modals/NodeInspectorModal.ts`** - Node detail viewer
- **`src/ui/modals/ExportModal.ts`** - Export functionality
- **`src/ui/modals/ComprehensiveExportModal.ts`** - Full project export

### AI-Powered Modals
- **`src/ui/modals/CoherenceModal.ts`** - Content coherence analysis
- **`src/ui/modals/ContextAdjusterModal.ts`** - Context optimization
- **`src/ui/modals/ConversationalGenerationModal.ts`** - Chat-based generation
- **`src/ui/modals/PolisherModal.ts`** - Content polishing
- **`src/ui/modals/LogicErrorDetectorModal.ts`** - Logic error detection
- **`src/ui/modals/LogicOutlineFixerModal.ts`** - Outline logic fixing
- **`src/ui/modals/RedundancyDetectorModal.ts`** - Content redundancy detection

## 🎭 XML Story Creation System

### Core Components
- **`src/xml-story-creation/index.ts`** - XML story system entry point
- **`src/xml-story-creation/services/XMLStoryService.ts`** - Main story state management
- **`src/xml-story-creation/parser/XMLStoryParser.ts`** - AI response XML parsing
- **`src/xml-story-creation/services/ElementIDGenerator.ts`** - Unique ID generation
- **`src/xml-story-creation/types/XMLStoryTypes.ts`** - Type definitions

### UI Components
- **`src/ui/modals/XMLStoryModal.ts`** - Main XML story creation interface

## 🎨 Idea Board System

### Core Components
- **`src/idea-board/index.ts`** - Idea board system entry point
- **`src/idea-board/IdeaBoard.ts`** - Main board management
- **`src/idea-board/rendering/Viewport.ts`** - Canvas rendering and viewport control
- **`src/idea-board/interaction/InputManager.ts`** - User interaction handling
- **`src/idea-board/persistence/BoardSerializer.ts`** - Save/load functionality

### UI Elements
- **`src/idea-board/elements/PostItNote.ts`** - Interactive note elements
- **`src/idea-board/elements/Connection.ts`** - Note connection system
- **`src/idea-board/elements/BackgroundRectangle.ts`** - Background grouping elements
- **`src/idea-board/ui/ToolPanel.ts`** - Tool palette
- **`src/idea-board/ui/NodeSearchModal.ts`** - Node search interface
- **`src/idea-board/ui/TransformModal.ts`** - Element transformation tools

### Type System
- **`src/idea-board/types/BoardTypes.ts`** - Board type definitions

## 📊 Overview Board System

### Core Components
- **`src/overview-board/index.ts`** - Overview board system entry point
- **`src/overview-board/OverviewBoardModal.ts`** - Main overview interface
- **`src/overview-board/OverviewAnalysisService.ts`** - Story analysis engine
- **`src/overview-board/rendering/OverviewRenderer.ts`** - Graph rendering system

### Analysis Elements
- **`src/overview-board/elements/OverviewElementBase.ts`** - Base element class
- **`src/overview-board/elements/CharacterNode.ts`** - Character analysis nodes
- **`src/overview-board/elements/EventNode.ts`** - Event analysis nodes
- **`src/overview-board/elements/PlaceNode.ts`** - Location analysis nodes

### Utilities
- **`src/overview-board/utils/DataConverter.ts`** - Data conversion utilities
- **`src/overview-board/types/GraphTypes.ts`** - Graph type definitions
- **`src/overview-board/types/OverviewTypes.ts`** - Overview type definitions

## 🔑 Key Management System

**Separate application for API key generation (accessible via `/keys.html`)**

### Core Components
- **`src/keys/keys-ui.ts`** - Key management interface
- **`src/keys/KeyManager.ts`** - Key generation and validation
- **`src/keys/KeyStorage.ts`** - Key persistence
- **`src/keys/AppKeyService.ts`** - Application key validation
- **`src/keys/AppKeyStorage.ts`** - Application key storage
- **`src/keys/KeyCrypto.ts`** - Key encryption utilities

## 🔧 Service Architecture

### Modal Services
- **`src/ui/modals/services/CoherenceService.ts`** - Coherence analysis implementation
- **`src/ui/modals/services/ContextAdjusterService.ts`** - Context adjustment logic
- **`src/ui/modals/services/ContextRatingService.ts`** - Content rating algorithms
- **`src/ui/modals/services/ExportService.ts`** - Node export functionality
- **`src/ui/modals/services/ComprehensiveExportService.ts`** - Full data backup
- **`src/ui/modals/services/ComprehensiveImportService.ts`** - Data import handling
- **`src/ui/modals/services/WorkingEpubGenerator.ts`** - EPUB generation
- **`src/ui/modals/services/GenerationErrorService.ts`** - Error handling and recovery
- **`src/ui/modals/services/LogicErrorDetectionService.ts`** - Logic error detection algorithms
- **`src/ui/modals/services/LogicOutlineFixerService.ts`** - Outline logic correction
- **`src/ui/modals/services/LogicChildFixerService.ts`** - Child node logic fixing
- **`src/ui/modals/services/RedundancyDetectionService.ts`** - Content redundancy analysis
- **`src/ui/modals/services/NodeCreationService.ts`** - Node creation utilities
- **`src/ui/modals/services/OutlineFactoryService.ts`** - Outline generation service
- **`src/ui/modals/services/ProjectGenerationService.ts`** - Project generation orchestration
- **`src/ui/modals/services/PromptManagementService.ts`** - Prompt management utilities
- **`src/ui/modals/services/SettingsService.ts`** - Settings management service

### Project Services
- **`src/project/ContextExtractionService.ts`** - Context extraction algorithms
- **`src/project/ContextService.ts`** - Context management and building
- **`src/project/GenerationController.ts`** - Generation process control
- **`src/project/GenerationCoordinator.ts`** - Multi-service generation coordination
- **`src/project/PromptService.ts`** - Prompt construction and management
- **`src/project/SmartContentParser.ts`** - Intelligent content parsing
- **`src/project/TreeService.ts`** - Project tree operations
- **`src/project/AIProjectGenerator.ts`** - AI-powered project generation

### Utility Services
- **`src/utils/FileDownloadService.ts`** - File download utilities
- **`src/utils/TextFormattingUtils.ts`** - Text formatting helpers
- **`src/utils/UILogger.ts`** - UI logging utilities
- **`src/ui/services/ProfileManagerService.ts`** - User profile management

## 📋 Essential APIs

### DocumentNode Content Management
```typescript
// Set content with automatic tagging
node.setContentWithTags(content, ['generated'], { model: 'gpt-4' });

// Get current master content
const content = node.content;

// Version management
const versions = node.getAllVersions();
node.promoteToMaster(versionId);
```

### Storage Operations
```typescript
const storage = await StorageService.getInstance();
await storage.set('key', data);
const data = await storage.get('key');
```

### AI Generation (Recommended Pattern)
```typescript
const client = OpenRouterClient.getInstance();
await client.streamingChat('creator', messages, {
  onStart: () => console.log('Started'),
  onChunk: (chunk) => updateUI(chunk),
  onComplete: (response) => console.log('Done'),
  onError: (error) => handleError(error)
});
```

### XML Story System Usage
```typescript
import { createXMLStorySystem } from './xml-story-creation';

const storySystem = createXMLStorySystem({
  typeFilters: new Set(['outline', 'context']),
  enableHighlighting: true
});

// Process AI response with XML
const parsed = await storySystem.processAIResponse(response);
```

### Global State Access
```typescript
import { getOrchestrator, getSettingsManager, addProject } from './state';

const orchestrator = getOrchestrator();
const settings = getSettingsManager();
addProject(newProject);
```

## 🔧 Development Utilities

### Code Quality
- **TSR (TypeScript Remove)**: Automatic dead code elimination
  - Recognizes both `src/main.ts` and `src/keys/index.ts` entry points
  - Use `npm run deadcode:check` to verify no unused code
- **ESLint**: Code linting with `npm run lint`

### Key Events
- **`ai-progress`** - AI generation progress updates
- **`tree-update-needed`** - UI refresh required
- **`unified-progress`** - Bulk generation progress
- **`xml-story-element-created`** - XML story element creation
- **`xml-story-element-updated`** - XML story element modification

### Important Files
- **`src/constants.ts`** - Application constants and limits
- **`src/types.ts`** - Core type definitions
- **`src/project/types/ProjectTypes.ts`** - Project-specific types
- **`src/types/CoherenceTypes.ts`** - Coherence analysis types
- **`src/types/ContextAdjusterTypes.ts`** - Context adjustment types
- **`src/types/LogicErrorTypes.ts`** - Logic error types
- **`src/types/OutlineFactoryTypes.ts`** - Outline factory types
- **`src/types/RatingTypes.ts`** - Rating system types
- **`src/types/RedundancyTypes.ts`** - Redundancy detection types

## 🚨 Critical Development Notes

1. **Text Editor Data Integrity**: The `text-editor-with-highlighting.ts` component is CRITICAL for data preservation - test thoroughly before modifying
2. **Content Assignment**: Always use `setContentWithTags()` or `setMasterContentDirect()` - direct assignment causes TypeScript errors
3. **Storage**: Use `StorageService.getInstance()` - avoid direct localStorage
4. **Event Management**: Use `event-manager.ts` for reliable DOM event handling
5. **Modal Lifecycle**: Extend `BaseModal` and register with `ModalRegistry`
6. **State Management**: Use global state accessors from `src/state.ts` instead of direct imports
7. **XML Story Elements**: Use proper event emission for story element changes
8. **Dead Code**: Run `npm run deadcode:check` before commits to prevent accumulation
9. **Text Preservation**: Any HTML ↔ Text conversion must preserve all characters exactly
10. **AI Integration**: Use streaming APIs with proper error handling and progress feedback 