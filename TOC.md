# Expert Application - Developer Guide

Essential technical documentation for the Expert application architecture.

## 🚀 Getting Started

### Entry Points
- **Main App**: `src/main.ts` - Core application entry point

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

### Version Management System
The DocumentNode versioning system is a cornerstone of the Expert application architecture:

#### Key Concepts
- **Version Objects**: Each version is a separate `ContentVersion` object with its own content, context, tags, and timestamp
- **Master Version**: The currently active version (marked with `master` tag)
- **Version Tags**: Used to categorize and identify specific version types (`generated`, `chat_edited`, `polished`, etc.)
- **Version Promotion**: Moving any version to become the new master

#### Critical APIs
- **`node.getAllVersions()`** - Get all version objects
- **`node.getVersionsWithTag(tag)`** - Find versions by specific tag
- **`node.addVersion(tags, fields)`** - Create new version with tags
- **`node.promoteToMaster(versionId)`** - Make version the active master
- **Direct version updates** - Modify version object properties directly

#### Common Pitfalls
- ❌ **DON'T** use `setContentWithTags()` thinking it creates separate versions (it only modifies master)
- ❌ **DON'T** directly assign to `node.content` (causes TypeScript errors)
- ✅ **DO** work with version objects directly for true version management
- ✅ **DO** use `promoteToMaster()` to make versions active

### Content Generation & AI Services
- **`src/LoopOrchestrator.ts`** - AI generation orchestration (creator → rater → editor loop)
- **`src/project/UnifiedGenerationService.ts`** - Level-based bulk generation
- **`src/OpenRouterClient.ts`** - AI provider integration with streaming support
- **`src/AIInteractionsService.ts`** - AI interaction tracking and analytics
- **`src/AILogService.ts`** - AI conversation logging
- **`src/services/TaskModelService.ts`** - AI model assignment per task type
- **`src/services/PromptExpansionService.ts`** - Dynamic prompt variable expansion

### Quality Rating System
The quality of generated content is judged against **quality criteria**, which now come in two kinds (a discriminated union on `QualityCriterion` in `src/types.ts`):

- **LLM criteria** (`kind: 'llm'`) - subjective qualities (e.g. *Prompt Adherence*, *Natural Human Voice*) scored 1-10 by the **rater** model.
- **Metric criteria** (`kind: 'metric'`) - objective AI-ism checks (e.g. *Em-dash Restraint*, *Avoids AI Clichés*, *Human-like Naming*) evaluated **deterministically in code**, not by an LLM.

Key files:
- **`src/quality/MetricEvaluator.ts`** - splits criteria, runs metrics, maps results onto the shared `Rating` shape, builds creator guidance
- **`src/quality/metrics/MetricRegistry.ts`** - strongly-typed registry + `withMetric` dispatcher; add a metric here plus its definition file
- **`src/quality/metrics/MetricTypes.ts`** - `MetricDefinition`/`MetricResult` interfaces and the 1-10 scoring helpers (`scoreFromCount`, `scoreFromRatio`)
- **`src/quality/metrics/*.ts`** - pure detectors: `emDashDensity`, `bannedPhrases`, `bannedNames`, `notXButY`, `tricolon`, `repeatedSentenceOpeners`
- **`src/quality/historicalDefaultCriteria.ts`** - snapshots of previous default sets so unchanged profiles upgrade cleanly when `DEFAULT_CRITERIA` changes
- **`src/SettingsManager.ts`** - holds `DEFAULT_CRITERIA`; strips default criteria on save and repopulates/upgrades them on load

How an iteration is rated (in `LoopOrchestrator.runLoop`):
1. **Split** criteria into LLM vs. enabled metric criteria once per run.
2. **Rater pass**: the rater model scores LLM criteria only (skipped entirely if there are none).
3. **Metric pass**: `evaluateMetrics` runs each metric's pure `detect()` locally; results use the same 1-10 scale.
4. **Merge** into one `combinedRatings` array.
5. **Goals (strict)**: `allGoalsMet` requires **every enabled criterion** — LLM *and* metric alike — to reach its goal. There is no soft/gate distinction: if a check should not be able to block, lower its goal or disable it.
6. **Failure score (ranking only)**: each failing criterion adds `(goal − actual) × weight` (LLM weight = 1). This score never affects pass/fail; it is used **only** to choose the best attempt when no iteration passes. **Best-iteration selection is tiered**: an iteration that met all goals (`allGoalsMet`) always beats one that did not; within a tier the lowest failure score wins, with recency breaking ties.
7. **Creator awareness**: `formatCriteriaForCreator` injects each metric's `creatorGuidance` (e.g. the banned-names list) into the creator prompt up front, so violations are usually avoided before they happen.
8. **Failed-node flag**: if the committed master version still has any rating below goal, the tree shows a `❗` marker (tooltip lists the failing criteria) and the node inspector shows a PASSED/FAILED verdict. The flag clears once the node is regenerated to a passing result or replaced by manual (unrated) content.

⚠️ **Statelessness**: metric detection is pure (text + params → score, no external state), so it runs inside the existing inner loop without affecting the stateless/resumable generation strategy (see `Stateless_Generation_Logic_Documentation.md`).

⚠️ **Changing `DEFAULT_CRITERIA`**: when you edit the defaults, append the **outgoing** set to `PREVIOUS_DEFAULT_CRITERIA_SETS` in `historicalDefaultCriteria.ts` (exact name/description/goal/outline/leaf) so existing users keep upgrading instead of being frozen on stale defaults.

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
- **`src/ui/components/UniversalTextEditor.ts`** - Dual-mode editor (simple/enhanced) with AI transformation, search, and highlighting
- **`src/ui/text-editor-with-highlighting.ts`** - ⚠️ CRITICAL: Enhanced editor engine with persistent highlighting, search, and undo
- **`src/ui/components/TextTransformModal.ts`** - AI text transformation interface

#### UniversalTextEditor Architecture
- **Dual Mode**: Switches between simple textarea and enhanced editor with full features
- **AI Integration**: Select text → AI transform with automatic highlighting of changes
- **Search System**: Ctrl+F opens in-editor search with multi-result highlighting
- **Highlighting**: 20-second persistent highlights that survive editor recreation
- **State Management**: Robust cleanup and mode switching without data loss

#### TextEditorWithHighlighting Features  
- **Persistent Highlights**: Expiration-based highlighting system (20s for AI replacements)
- **Search Integration**: Real-time search with current/total result highlighting
- **Text Preservation**: Mission-critical text integrity during all operations
- **Event System**: Focus/blur/change events with proper cursor management
- **Undo Support**: Global undo functionality (Ctrl+Z) for AI transformations

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

## 🎭 Node Chat Editor System (formerly XML Story Creation)

The Node Chat Editor is a collaborative AI editing interface that allows real-time refinement of existing project content.

### Core Components
- **`src/xml-story-creation/index.ts`** - XML story system entry point
- **`src/xml-story-creation/services/XMLStoryService.ts`** - Context item management, XML command processing
- **`src/xml-story-creation/parser/XMLStoryParser.ts`** - AI response XML parsing with `</outline_replace>` commands
- **`src/ui/modals/XMLStoryModal.ts`** - Main chat interface with outline + context editing

### Message Flow Architecture
1. **System Prompt**: AI editing instructions (always sent)
2. **Dynamic Context Prompt**: Current outline + context items + human edits (always sent)
3. **User Message**: Raw user input only (stored in chat history)
4. **AI Response**: Processed for XML commands, cleaned text stored in history

### Key Features
- **Smart Context**: Always sends fresh node state, chat history contains only user/AI conversation
- **Unified Outline**: Single text editor for complete node content
- **Individual Context Items**: Separate AI-managed context elements with global (*) vs situational flags
- **Failed Command Recovery**: User-prompted AI correction with detailed error feedback
- **Custom Buttons**: Persistent prompt shortcuts per node

### XML Commands Supported
- `</outline_replace>CONTENT</outline_replace>` - Replace entire outline
- `<append>CONTENT</append>` - Add to outline end
- `<replace_command><search>TEXT</search><replace>NEW</replace></replace_command>` - Replace specific text
- `<context id="new_id">DESCRIPTION</context>` - Create context item
- `</edit id="item_id">NEW_DESCRIPTION</edit>` - Edit existing context item
- `</delete id="item_id">` - Remove context item

### Error Handling Pattern
1. Failed commands are collected during AI response processing
2. User alert shows all failures with raw XML + reasons
3. If user accepts, generates correction message: "These commands did not work: [list]. Please try again."
4. Message sent as normal user input, AI gets full context to fix mistakes

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

## 🎲 RPG System

**A complete roleplaying game system with dual-LLM workflow, persistent world, and intelligent context construction.**

### Core Components
- **`src/rpg/types/RPGTypes.ts`** - Core type definitions (entities, relationships, sessions, snapshots)
- **`src/rpg/services/WorldStateService.ts`** - CRUD operations, snapshots, locking, relationship graph traversal
- **`src/rpg/services/RPGContextBuilder.ts`** - Context construction with graph traversal and formatting
- **`src/rpg/services/RPGStateParser.ts`** - XML parser for State Parser LLM output
- **`src/rpg/services/RPGInteractionService.ts`** - Dual-LLM orchestration (Game LLM + State Parser)
- **`src/rpg/services/RPGPlaceholderService.ts`** - Prompt placeholder registration

### UI Components
- **`src/rpg/ui/RPGView.ts`** - Main RPG interface with session management
- **`src/rpg/ui/RPGConversationPanel.ts`** - Chat interface with streaming support
- **`src/rpg/ui/RPGWorldInspector.ts`** - Scene/World toggle with tree-based viewer
- **`src/rpg/ui/RPGSnapshotManager.ts`** - Snapshot browsing and rollback
- **`src/rpg/ui/rpg-styles.css`** - Complete styling for RPG mode

### Key Features
- **Dual-LLM Workflow**: Game LLM (narrator) + State Parser LLM (world updates)
- **Persistent World**: Locations, Characters, Lore with flexible JSON state
- **Relationship Graph**: BFS traversal for intelligent context inclusion
- **Emergent Geography**: Distance tracking extracted from narrative
- **State Locking**: Prevents race conditions during async analysis
- **Move-by-Move Snapshots**: Automatic save/rollback functionality
- **XML-Based Updates**: Structured state changes via XML schema

### Prompts (in `src/PromptManager.ts`)
- **`rpg_game_narration_system`** - Game LLM system prompt with world state placeholders
- **`rpg_state_parser_system`** - State Parser LLM with XML schema
- **`rpg_state_parser_user`** - State Parser user prompt

### Storage (in `src/StorageService.ts`)
- **`rpg_sessions`** store - Game session data
- **`rpg_snapshots`** store - Save state snapshots

### Usage Flow
1. Click RPG Mode button (🎲)
2. Create or load session
3. Type action → Game LLM generates narrative
4. State Parser extracts world changes (async)
5. World state updates + snapshot created
6. Browse world in Scene/World view
7. Restore snapshots for rollback

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

#### Basic Content Access
```typescript
// Get current master content
const content = node.content;
const context = node.context;
const title = node.title;

// ⚠️ WARNING: These methods modify MASTER version only
node.setContentWithTags(content, ['generated'], { model: 'gpt-4' });
node.setContextWithTags(context, ['context_adjusted']);
```

#### Proper Version Management
```typescript
// Get all versions
const versions = node.getAllVersions();
const masterVersion = node.getMasterVersion();

// Find versions by tag
const chatVersions = node.getVersionsWithTag('chat_edited');
const generatedVersions = node.getVersionsWithTag('generated');

// Create new version with tags
const newVersionId = node.addVersion(['draft', 'experimental'], {
  content: 'New content',
  context: 'New context',
  title: 'New title'
});

// Update existing version (CORRECT approach)
const existingVersion = versions.find(v => v.tags.has('chat_edited'));
if (existingVersion) {
  existingVersion.content = newContent;
  existingVersion.context = newContext;
  existingVersion.timestamp = new Date();
  // Promote to master
  node.promoteToMaster(existingVersion.id);
}

// Promote any version to master
node.promoteToMaster(versionId);
```

#### Version Object Structure
```typescript
interface ContentVersion {
  id: string;
  content: string;
  title: string;
  context: string;
  tags: Set<string>;
  timestamp: Date;
  metadata: { [key: string]: any };
  ratings?: Rating[];
}
```

#### Common Version Patterns
```typescript
// Node Chat Editor pattern - update or create tagged version
const existingChatVersions = node.getVersionsWithTag('chat_edited');
if (existingChatVersions.length > 0) {
  // Update existing version object
  const chatVersion = existingChatVersions[0];
  chatVersion.content = newContent;
  chatVersion.timestamp = new Date();
  node.promoteToMaster(chatVersion.id);
} else {
  // Create new tagged version
  const versionId = node.addVersion(['chat_edited'], {
    content: newContent,
    context: newContext
  });
  if (versionId) {
    node.promoteToMaster(versionId);
  }
}

// Generation iterations pattern
node.addVersion(['generated', 'iteration1'], { content: attempt1 });
node.addVersion(['generated', 'iteration2'], { content: attempt2 });
// Best iteration gets promoted to master later
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

### Node Chat Editor Usage
```typescript
import { openXMLStoryModal } from './ui/modals/ModalFactory';

// Open with existing node data
openXMLStoryModal({
  title: activeNode.title,
  content: activeNode.content,
  contextItems: activeNode.context.split('\n\n'),
  sourceNode: activeNode
});

// Message flow: System + Context prompts + raw user message
// AI responds with XML commands + conversational text
// Failed commands trigger user-prompted correction flow
// Results in proper version management with 'chat_edited' tags
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
  - Recognizes the `src/main.ts` entry point
  - Use `npm run deadcode:check` to verify no unused code
- **ESLint**: Code linting with `npm run lint`

### Key Events
- **`ai-progress`** - AI generation progress updates
- **`tree-update-needed`** - UI refresh required (includes `chat-edited` reason for Node Chat Editor updates)
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

1. **Text Editor System (CRITICAL)**:
   - `TextEditorWithHighlighting` is mission-critical for data preservation 
   - `setText()` always clears highlights - use persistent highlighting for robustness
   - Editor recreation (e.g., in XMLStoryModal) destroys highlights unless managed properly
   - Test thoroughly before modifying - handles complex cursor/selection state

2. **Version Management (CRITICAL)**:
   - ❌ **NEVER** assume `setContentWithTags()` creates separate versions - it only modifies master + adds tags
   - ✅ **ALWAYS** use `node.addVersion()` to create true separate versions
   - ✅ **ALWAYS** work with version objects directly: `version.content = newContent; version.timestamp = new Date()`
   - ✅ **ALWAYS** use `node.promoteToMaster(versionId)` to make versions active
   - 🔍 **Pattern**: Check for existing tagged versions before creating new ones

3. **Content Assignment**: 
   - ✅ Use `node.addVersion()` for new versions
   - ✅ Direct version object modification for updates
   - ❌ Direct assignment to `node.content` causes TypeScript errors

4. **Storage**: Use `StorageService.getInstance()` - avoid direct localStorage

5. **Event Management**: Use `event-manager.ts` for reliable DOM event handling

6. **Modal Lifecycle**: Extend `BaseModal` and register with `ModalRegistry`

7. **State Management**: Use global state accessors from `src/state.ts` instead of direct imports

8. **XML Story Elements**: Use proper event emission for story element changes

9. **Dead Code**: Run `npm run deadcode:check` before commits to prevent accumulation

10. **Text Preservation**: Any HTML ↔ Text conversion must preserve all characters exactly

11. **AI Integration**: Use streaming APIs with proper error handling and progress feedback

12. **Version Tags**: Use consistent tagging patterns (`chat_edited`, `generated`, `polished`, etc.) for UI compatibility 