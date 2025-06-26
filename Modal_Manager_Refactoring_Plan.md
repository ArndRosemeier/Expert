# Modal Manager Refactoring Plan

## Current State Analysis

The `modal-manager.ts` file has grown to **2,317 lines** and contains multiple distinct responsibilities:
- Generic modal utilities (generic, settings, test, new project modals)
- Export functionality with multiple formats (HTML, Markdown, Plain Text)
- Prompt management with auto-save
- Settings modal with profile management
- Context extraction modal
- AI Log viewer with overlay functionality
- Various utility functions

## Refactoring Strategy

Break down the monolithic modal-manager into focused, single-responsibility modules using a layered architecture:

### 1. Core Modal Infrastructure
**File: `src/ui/modals/core/`**

#### `BaseModal.ts`
- Abstract base class for all modals
- Common modal lifecycle (open, close, render)
- Event handling patterns
- DOM manipulation utilities

#### `ModalRegistry.ts`
- Central registry for all modal types
- Modal instance management
- Global modal state tracking

#### `modal-utils.ts`
- Shared utility functions (`escapeHtml`, `escapeHtmlAttribute`, `sanitizeFilename`)
- Common styling helpers
- DOM element creation utilities

### 2. Specific Modal Implementations
**File: `src/ui/modals/`**

#### `GenericModal.ts`
- Generic modal with content injection
- Dynamic modal creation fallback
- Basic open/close functionality

#### `SettingsModal.ts`
- Settings management interface
- Profile selector and management
- Criteria editing
- Auto-save functionality
- Model selection interface

#### `ExportModal.ts`
- Export functionality interface
- Format selection (HTML, Markdown, Plain Text)
- Scope selection (single node, hierarchy, leaf nodes)
- Export execution

#### `NewProjectModal.ts`
- Project creation interface
- Template selection
- Project initialization

#### `TestModal.ts`
- Development/testing modal
- Simple content display

#### `ContextExtractionModal.ts`
- Context extraction interface
- Node selection and processing
- Progress tracking

#### `AILogModal.ts`
- AI log viewing interface
- Log filtering and search
- Overlay functionality for full content viewing

### 3. Business Logic Services
**File: `src/ui/modals/services/`**

#### `ExportService.ts`
- Export format generation (HTML, Markdown, Plain Text)
- Content formatting logic
- File generation and download
- Node traversal for different export scopes

#### `PromptManagementService.ts`
- Prompt editing and management
- Auto-save functionality
- Default prompt restoration
- Settings integration

#### `SettingsService.ts`
- Profile management (create, update, delete, duplicate)
- Settings persistence
- Profile validation
- Migration utilities

#### `AILogService.ts` (enhance existing)
- Log retrieval and formatting
- Search and filtering logic
- Overlay content management

### 4. UI Components
**File: `src/ui/modals/components/`**

#### `CriteriaEditor.ts`
- Quality criteria editing component
- Add/remove/reorder criteria
- Copy/paste functionality
- Validation and formatting

#### `ProfileSelector.ts`
- Profile dropdown component
- Profile actions (duplicate, delete, rename)
- Unsaved changes indicator

#### `ModelSelector.ts`
- Model selection interface
- Provider configuration
- Model validation

#### `LogViewer.ts`
- Log display component
- Pagination and filtering
- Content overlay integration

### 5. Types and Interfaces
**File: `src/ui/modals/types/`**

#### `ModalTypes.ts`
- Interface definitions for all modal types
- Common modal configuration interfaces
- Event payload types

#### `ExportTypes.ts`
- Export format and scope enums
- Export configuration interfaces

## Implementation Plan

### Phase 1: Infrastructure Setup
1. Create directory structure
2. Implement `BaseModal.ts` with common functionality
3. Create `ModalRegistry.ts` for centralized management
4. Extract utility functions to `modal-utils.ts`

### Phase 2: Service Layer Extraction
1. Extract `ExportService.ts` with all export logic
2. Extract `PromptManagementService.ts` 
3. Extract `SettingsService.ts` for profile management
4. Update existing `AILogService.ts` for enhanced functionality

### Phase 3: Component Extraction
1. Extract `CriteriaEditor.ts` component
2. Extract `ProfileSelector.ts` component
3. Extract `ModelSelector.ts` component
4. Extract `LogViewer.ts` component

### Phase 4: Modal Implementation
1. Implement specific modal classes extending `BaseModal`
2. Wire up services and components
3. Update imports in main application files

### Phase 5: Integration and Testing
1. Update all import statements across the application
2. Test modal functionality
3. Remove original `modal-manager.ts`
4. Update documentation

## File Structure After Refactoring

```
src/ui/modals/
├── core/
│   ├── BaseModal.ts
│   ├── ModalRegistry.ts
│   └── modal-utils.ts
├── services/
│   ├── ExportService.ts
│   ├── PromptManagementService.ts
│   ├── SettingsService.ts
│   └── AILogService.ts (enhanced)
├── components/
│   ├── CriteriaEditor.ts
│   ├── ProfileSelector.ts
│   ├── ModelSelector.ts
│   └── LogViewer.ts
├── types/
│   ├── ModalTypes.ts
│   └── ExportTypes.ts
├── GenericModal.ts
├── SettingsModal.ts
├── ExportModal.ts
├── NewProjectModal.ts
├── TestModal.ts
├── ContextExtractionModal.ts
├── AILogModal.ts
└── index.ts (barrel exports)
```

## Benefits of This Refactoring

1. **Single Responsibility**: Each file has a clear, focused purpose
2. **Maintainability**: Easier to locate and modify specific functionality
3. **Testability**: Smaller, focused units are easier to unit test
4. **Reusability**: Components can be reused across different modals
5. **Type Safety**: Better TypeScript support with focused interfaces
6. **Performance**: Smaller modules allow for better tree-shaking
7. **Developer Experience**: Easier to understand and work with individual components

## Migration Strategy

1. **Backward Compatibility**: Maintain existing public API during transition
2. **Incremental Migration**: Migrate one modal type at a time
3. **Feature Parity**: Ensure all existing functionality is preserved
4. **Testing**: Comprehensive testing at each migration step

## Breaking Changes

- Import paths will change from `../modal-manager` to specific modal modules
- Some internal implementation details may change
- Configuration interfaces may be updated for better type safety

## Estimated Effort

- **Phase 1-2**: 2-3 days (Infrastructure and Services)
- **Phase 3**: 1-2 days (Component Extraction)
- **Phase 4**: 2-3 days (Modal Implementation)
- **Phase 5**: 1-2 days (Integration and Testing)

**Total**: 6-10 days for complete refactoring

## Risk Mitigation

1. **Comprehensive Testing**: Test each module after extraction
2. **Gradual Migration**: Keep original file until all functionality is migrated
3. **Code Reviews**: Review each extracted module for correctness
4. **Documentation**: Update all relevant documentation during migration 