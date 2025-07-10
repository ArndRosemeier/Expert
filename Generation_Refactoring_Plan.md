# Unified Generation System

## Overview
The Expert application uses a unified level-based work queue system for all content generation using template hierarchy levels.

## Current System Architecture

### Level-Based Generation
All generation is handled by `UnifiedGenerationService` using four level selectors that determine the scope and type of work performed.

## Level-Based Control System

### Four Level Selectors

1. **Draft Level** - Deepest level for which drafts (child nodes) should exist
2. **Content Level** - Which levels get content generated (must be ≤ Draft Level)
3. **Context Prune Level** - Which levels get context auto-pruned
4. **Coherence Level** - Which levels get coherence checking (must be < Draft Level, max = Draft Level - 1)

### Template Level Hierarchy
- Level 0: Book/Project Root
- Level 1: Act/Part
- Level 2: Chapter/Section  
- Level 3: Scene/Subsection
- etc.

### Level Constraints
- **Draft Level**: Deepest level for which children are created (e.g., Draft Level = 2 means create drafts for levels 0, 1, 2)
- **Content Level**: Must be ≤ Draft Level (can't generate content deeper than existing drafts)
- **Coherence Level**: Must be < Draft Level (can't check coherence on deepest level - no children to check against)

### Example Scenario
If Draft Level = 2 (Chapter):
- Creates drafts for: Book (0), Act (1), Chapter (2)
- Content Level can be: -1 (None), 0 (Book), 1 (Act), or 2 (Chapter)
- Coherence Level can be: -1 (None), 0 (Book), or 1 (Act) - NOT 2 because chapters have no children to check coherence with

### Breadth-First Processing Order
With Draft Level = 2, starting from Book:
1. **Initial Queue**: [Book(0)]
2. **Process Book(0)**: Add children to end → [Act1(1), Act2(1)]
3. **Process Act1(1)**: Add children to end → [Act2(1), Chapter1(2), Chapter2(2)]
4. **Process Act2(1)**: Add children to end → [Chapter1(2), Chapter2(2), Chapter3(2), Chapter4(2)]
5. **Process Chapter1(2)**: No children (at draft level)
6. **Process Chapter2(2)**: No children (at draft level)
7. **Process Chapter3(2)**: No children (at draft level)
8. **Process Chapter4(2)**: No children (at draft level)

**Result**: Book → Acts → Chapters (breadth-first, level by level)

### Work Queue Processing
1. **Initialize**: Create work queue, add triggering node, set position = 0
2. **Process Loop**: For each work item (breadth-first order):
   - Context pruning (if Context Prune Level ≥ node.level)
   - Content generation (if Content Level ≥ node.level AND node.state ≠ 'Final')
   - Draft creation (if node.level < Draft Level)
   - Child coherence check (if last child AND Coherence Level ≥ parent.level)
   - **Add new work items to END of queue** with `push()` for breadth-first traversal
3. **Progress**: Top-level bar shows position/total work items

## Implementation

### Core Service
**File**: `src/project/UnifiedGenerationService.ts`

**Key Interface**:
```typescript
interface GenerationLevels {
  draftLevel: number;
  contentLevel: number;
  contextPruneLevel: number;
  coherenceLevel: number;
}
```

**Main Function**:
```typescript
public async generateWithLevels(startNodeId: string, levels: GenerationLevels): Promise<void>
```

### UI Implementation
**File**: `src/ui/project-ui.ts`

**Controls**:
- 4 level dropdown selectors with template level names
- Validation: Content Level ≤ Draft Level, Coherence Level < Draft Level
- Single "Generate" button
- Real-time level state persistence

### Progress System
- **Top-level**: Work queue position (e.g., "Processing: Chapter 1 (3/8)")
- **Iteration-level**: Current iteration progress
- **Stage-level**: Current generation phase (create/rate/edit)

## Work Queue Processing

### KISS Principle Implementation
1. **Initialize Queue**: Add all nodes in level range that might need any type of work
2. **Process Items**: For each work item, workers decide if they need to do anything
3. **Add Children**: When creating drafts, add children if they might need any work
4. **Continue**: Process until queue is empty

### Work Item Processing
```typescript
async processWorkItem(item: WorkItem, levels: GenerationLevels): Promise<WorkItem[]> {
  // Workers decide if they need to do anything
}
```

## Usage Examples

### Generate Content for Current Node Only
```typescript
const levels = {
  draftLevel: -1,        // No children
  contentLevel: 0,       // Generate content for level 0 (current node)
  contextPruneLevel: -1, // No context pruning  
  coherenceLevel: -1     // No coherence checking
};
```

### Create Children with Content
```typescript
const levels = {
  draftLevel: 1,         // Create children at level 1
  contentLevel: 1,       // Generate content for level 1 children
  contextPruneLevel: 1,  // Auto-prune context for level 1
  coherenceLevel: 0      // Check coherence for level 0 (current node)
};
```

### Deep Recursive Generation
```typescript
const levels = {
  draftLevel: 3,         // Create children down to level 3
  contentLevel: 3,       // Generate content for all levels
  contextPruneLevel: 2,  // Auto-prune context from level 2+
  coherenceLevel: 2      // Check coherence for levels 0-2
};
``` 