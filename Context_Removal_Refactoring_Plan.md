# Context Removal Refactoring Plan

## Overview
Remove traditional `context` field from DocumentNode versions and migrate entirely to conditional context system. This will simplify the codebase by eliminating dual context systems and obsolete functionality.

## Phase 1: Remove Traditional Context from DocumentNode
**Goal**: Break all code that depends on traditional context to identify refactoring points

### 1.1 DocumentNode Changes
- [ ] Remove `context: string` field from `ContentVersion` interface
- [ ] Remove context-related methods:
  - [ ] `get context(): string`
  - [ ] `setContext(context: string, tag?: string): void`
  - [ ] `setContextWithTags(context: string, tags: string[]): void`
- [ ] Update version management methods to not handle context field
- [ ] Update `toJSON()` and `fromJSON()` to exclude context serialization

### 1.2 Expected Breaking Points (to be fixed in later phases)
- UnifiedGenerationService context handling
- ContextAdjusterService and ContextAdjusterModal
- NodeInspectorModal context editing
- Main UI context panels
- Project import/export
- Template system context references
- Various context utility functions

## Phase 2: Migration and Conversion Logic
**Goal**: Convert existing traditional context to conditional context on project load

### 2.1 Migration Strategy
- [ ] Create migration utility in DocumentNode.fromJSON()
- [ ] Only process root node traditional context during migration
- [ ] Convert each context item to unconditional conditional context item
- [ ] Discard all non-root traditional context
- [ ] Add migration version flag to prevent re-migration

### 2.2 Migration Implementation
```typescript
// In DocumentNode.fromJSON()
private static migrateTraditionalToConditionalContext(data: any, isRoot: boolean): void {
  if (isRoot && data.context && typeof data.context === 'string') {
    const contextItems = parseContextItems(data.context);
    data.conditionalContextItems = contextItems.map(text => ({
      id: uuidv4(),
      text: text.trim(),
      conditions: [], // No conditions = always applies
      logic: 'OR' as ConditionLogicOperator,
      keywords: []
    }));
  }
  // Always remove traditional context after migration
  delete data.context;
}
```

## Phase 3: Remove Obsolete Context UI Components
**Goal**: Clean up UI components that are no longer needed

### 3.1 Components to Remove
- [ ] ContextAdjusterModal (`src/ui/modals/ContextAdjusterModal.ts`)
- [ ] ContextAdjusterService (`src/ui/modals/services/ContextAdjusterService.ts`)
- [ ] ContextRatingService (`src/ui/modals/services/ContextRatingService.ts`)
- [ ] Context editing panel in NodeInspectorModal
- [ ] "Edit Context Items" button and functionality
- [ ] Traditional context display in main UI

### 3.2 UI Updates Required
- [ ] Remove context panel from main project UI
- [ ] Update NodeInspectorModal to remove context tab/section
- [ ] Remove context-related buttons and actions
- [ ] Update layout to accommodate removed panels

## Phase 4: Update Generation Services
**Goal**: Modify generation system to use only conditional context

### 4.1 UnifiedGenerationService Changes
- [ ] Remove automatic context adjuster integration
- [ ] Remove traditional context passing to prompts
- [ ] Update context building to use only conditional context
- [ ] Remove context-related generation parameters
- [ ] Update prompt building to rely on conditional context assembly

### 4.2 Generation Flow Updates
- [ ] Modify context extraction to use `node.assembleApplicableConditionalContext(root)`
- [ ] Remove legacy context formatting
- [ ] Update generation prompts to expect only conditional context
- [ ] Remove context adjustment steps from generation pipeline

## Phase 5: Update Import/Export and Persistence
**Goal**: Ensure project save/load works without traditional context

### 5.1 Project Persistence Updates
- [ ] Update project export to exclude traditional context
- [ ] Update project import to handle legacy projects with migration
- [ ] Ensure JSON export/import works with conditional-only context
- [ ] Update project templates to use conditional context

### 5.2 Backward Compatibility
- [ ] Detect legacy projects and run migration automatically
- [ ] Add warning/info message about context migration
- [ ] Ensure no data loss during migration process

## Phase 6: Clean Up Utility Functions and Types
**Goal**: Remove unused context-related code

### 6.1 Type Definitions
- [ ] Remove context-related types that are no longer needed
- [ ] Update interfaces to remove context fields
- [ ] Clean up context-related enums and constants

### 6.2 Utility Functions
- [ ] Remove context parsing utilities (unless used for migration)
- [ ] Remove context formatting functions
- [ ] Remove context validation functions
- [ ] Update tree traversal functions to not handle traditional context

## Phase 7: Testing and Validation
**Goal**: Ensure system works correctly with conditional context only

### 7.1 Functionality Tests
- [ ] Verify project creation works without traditional context
- [ ] Test project loading and migration from legacy format
- [ ] Validate generation uses conditional context correctly
- [ ] Test export/import maintains conditional context
- [ ] Verify no traditional context remnants in saved projects

### 7.2 UI Tests
- [ ] Confirm no traditional context UI elements remain
- [ ] Test conditional context editing still works
- [ ] Verify generation prompts receive correct context
- [ ] Test context inheritance and evaluation

## Implementation Order

1. **Start with Phase 1** - Remove context from DocumentNode to break everything
2. **Identify all breakage points** - Use TypeScript errors as guide
3. **Fix critical path first** - Generation system and core functionality
4. **Remove obsolete UI** - Clean up unused components
5. **Add migration logic** - Handle legacy project loading
6. **Final cleanup** - Remove unused utilities and types

## Files Likely to Need Changes

### Core Files
- `src/DocumentNode.ts` - Remove context from ContentVersion
- `src/types/global.d.ts` - Update type definitions
- `src/state.ts` - May need context-related state cleanup

### UI Files
- `src/ui/project-ui.ts` - Remove context panels
- `src/ui/modals/NodeInspectorModal.ts` - Remove context editing
- `src/ui/modals/ContextAdjusterModal.ts` - DELETE
- `src/ui/modals/ContextInfoModal.ts` - May need updates

### Service Files
- `src/project/UnifiedGenerationService.ts` - Major context handling changes
- `src/ui/modals/services/ContextAdjusterService.ts` - DELETE
- `src/ui/modals/services/ContextRatingService.ts` - DELETE

### Generation Files
- `src/PromptManager.ts` - Update context building
- `src/project/PromptService.ts` - Remove traditional context usage
- `src/project/ContextService.ts` - May need complete rewrite or deletion

## Risk Mitigation

1. **Backup Before Starting** - Commit current state before beginning
2. **Incremental Approach** - Fix one service/component at a time
3. **Test Migration Early** - Ensure existing projects can be loaded
4. **Preserve Conditional Context** - Don't break existing conditional context functionality

## Success Criteria

- [ ] No references to traditional context remain in codebase
- [ ] All existing functionality works with conditional context only
- [ ] Legacy projects can be migrated successfully
- [ ] New projects use only conditional context
- [ ] UI is clean and simplified without dual context systems
- [ ] Generation system works correctly with conditional context
- [ ] No data loss during migration process

## Notes

- The conditional context system is already fully implemented and working
- This refactor is primarily about removing the old system, not building a new one
- Focus on breaking things first, then systematically fixing them
- Migration logic is critical - don't lose user data
- Some edge cases in context evaluation may surface during testing
