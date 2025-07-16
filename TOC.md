# Expert Application - Developer Guide

Essential documentation for developing the Expert application.

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
- **`src/state.ts`** - Global application state

### Content Generation
- **`src/LoopOrchestrator.ts`** - AI generation orchestration 
- **`src/project/UnifiedGenerationService.ts`** - Level-based bulk generation
- **`src/OpenRouterClient.ts`** - AI provider integration

### Settings & Configuration
- **`src/SettingsManager.ts`** - User profiles and settings
- **`src/ModelSelector.ts`** - AI model configuration
- **`src/PromptManager.ts`** - Prompt templates

## 🎨 User Interface

### Main UI
- **`src/ui/project-ui.ts`** - Primary interface and event handling
- **`src/ui/event-manager.ts`** - Enhanced DOM event management

### Modal System
- **`src/ui/modals/core/BaseModal.ts`** - Base modal class
- **`src/ui/modals/ModalFactory.ts`** - Modal creation utilities
- **Key Modals**:
  - `NewProjectModal.ts` - Project creation
  - `SettingsModal.ts` - Settings management
  - `CoherenceModal.ts` - Content coherence checking
  - `ContextAdjusterModal.ts` - Context pruning

### Export System
- **`src/ui/modals/services/ExportService.ts`** - Node export functionality
- **`src/ui/modals/services/ComprehensiveExportService.ts`** - Full data backup
- **`src/ui/modals/services/WorkingEpubGenerator.ts`** - EPUB generation

## 🔑 Key Management System

**Separate application for API key generation (accessible via `/keys.html`)**

- **`src/keys/keys-ui.ts`** - Key management interface
- **`src/keys/KeyManager.ts`** - Key generation and validation
- **`src/keys/KeyStorage.ts`** - Key persistence
- **`src/keys/AppKeyService.ts`** - Application key validation

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

### Important Constants
- **`src/constants.ts`** - Application constants and limits
- **`src/types.ts`** - Core type definitions
- **`src/project/types/ProjectTypes.ts`** - Project-specific types

## 🚨 Critical Development Notes

1. **Content Assignment**: Always use `setContentWithTags()` or `setMasterContentDirect()` - direct assignment causes TypeScript errors
2. **Storage**: Use `StorageService.getInstance()` - avoid direct localStorage
3. **Event Management**: Use `event-manager.ts` for reliable DOM event handling
4. **Modal Lifecycle**: Extend `BaseModal` and register with `ModalRegistry`
5. **Dead Code**: Run `npm run deadcode:check` before commits to prevent accumulation 