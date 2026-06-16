# Stateless Generation Logic Documentation

## Overview

The Expert system uses a sophisticated **stateless target-state-based generation strategy** for content creation and tree expansion. This approach ensures deterministic, level-based processing where nodes advance through clearly defined states based on generation parameters.

**Critical Design Principle**: The system processes exactly **one operation per iteration** and reassesses the complete tree state after each operation. This eliminates temporal coupling and ensures identical behavior whether generation runs continuously or is interrupted and resumed.

## Context Assembly & The Future-Knowledge (Anti-Foreshadowing) Policy

> **This is the most important and most fragile design decision in the whole generation system. Read this before touching `ContextService.compileNodeContext` or the `includeParentContent` logic in `UnifiedGenerationService.buildLoopInput`. Several "obvious improvements" here will silently degrade output quality.**

### What a node "knows" when its content is generated

When content is generated for a node (e.g. a Chapter), the context handed to the LLM (`ContextService.compileNodeContext`) is deliberately limited to:

1. **Conditional/keyword context** — context items belonging to the node and its ancestors whose triggers match. Always included.
2. **The previous node at the same template level** — the node immediately before this one in global reading order (`TreeService.getPreviousNode`, which can cross parent boundaries, e.g. the last Chapter of the previous Part). Provides backward continuity. Always included when it has content.
3. **The node's own slice of the parent outline, as its draft** — when a parent is broken into children, each child is seeded with ONLY its own section/description as a `draft` (`"Draft: <section>"`), surfaced via the `{{draftorfresh}}` placeholder with "Do not advance the plot past the draft."
4. **The parent's full outline — ONLY conditionally** (see below).

It explicitly does **NOT** receive:
- **The next node** (forward sibling content) — intentionally omitted.
- **The parent's full outline**, unless the parent outline is free-form (no `===sections===`).

### The conditional that controls future-knowledge

```typescript
// UnifiedGenerationService.buildLoopInput
const parentSections = this.parseContentSections(parentNode.content);
const parentHasSections = parentSections.length > 0;
includeParentContent = !parentHasSections;
```

- **Parent outlined with predetermined sections (`===Title===`)** → `includeParentContent = false`. The child sees only its own section draft + the previous node. **It does NOT know what its sibling chapters contain → no future knowledge.**
- **Parent outlined free-form (no sections)** → `includeParentContent = true`. The child receives the parent's entire outline, which describes ALL siblings → the node DOES know the future in draft form.

### Why it is built this way (the decision)

An LLM **can** benefit from knowing where a story is heading, but in practice full future knowledge made the model **foreshadow and plant hints toward content that belongs to later siblings**, which hurt results. Removing future knowledge produced **noticeably better prose** — but only worked well when the structure was fixed up front via **predetermined sections**, so each child still has a precise, self-contained brief in its own draft.

There is no golden middle: either the model sees the future (better-informed but foreshadows) or it does not (cleaner, but each unit must be self-contained). The project deliberately chose the **no-future-knowledge** path because:
- the results are better,
- it costs fewer tokens (no whole-parent outline copied into every child), and
- predetermined sections give each child enough local context to stand alone.

Therefore **deterministic child creation (predetermined sections) is the default** (`deterministicChildCreationState = true` in `project-ui.ts`), and the conditional above keeps future knowledge out of the default path.

### ⚠️ Guardrails for future changes

- **Do NOT unconditionally include the parent's full content** in `compileNodeContext`. That re-introduces foreshadowing for the default (sectioned) flow.
- **Do NOT add next-node / forward-sibling content** to the context. The omission in `ContextService.compileNodeContext` is intentional, not a missing feature.
- **Do NOT make children inherit the whole parent outline as their draft.** Each child must carry only its own slice (`createChildFromSection` / `handleDraftCreation`).
- If you want to experiment with giving the model future knowledge, do it behind the **free-form (non-deterministic) outline** path, which already supplies the full parent outline — do not change the sectioned default.

## Core Concepts

### Target State vs Current State

**Target State**: What a node should achieve based on generation parameters
**Current State**: What a node has actually achieved

The system continuously compares these states and performs work to close the gap.

### Generation Parameters

The system uses four key parameters that define what work should be done at each level:

- **`draftLevel`**: Maximum level where children (drafts) can be created
- **`contentLevel`**: Maximum level where content should be generated
- **`coherenceLevel`**: Maximum level where coherence checks should be performed
- **`autofixSeverity`**: Coherence autofix threshold (-1 = disabled, 1-10 = severity at/above which contradictions are auto-fixed)
- **`deterministicChildCreation`**: When true (the default), branch outlines are written with `===Section===` headers and children are created deterministically from those sections. This is also what keeps future knowledge out of child generation (see the Context Assembly section above).

> **Removed:** `contextPruneLevel` no longer exists. The old "traditional context" pruning was replaced by the conditional/keyword context system, so there is no context-pruning work item anymore. The `needsContextPruning`/`hasContextPruning` fields still exist in the code but are hard-wired to a no-op.

### Level-Based Target State Calculation

For each level from `startNode.level` to `maxLevel`, the system calculates:

```typescript
targetStates[level] = {
    level,
    needsContextPruning: false, // vestigial: context pruning was removed
    needsContent: levels.contentLevel >= level,
    needsCoherenceCheck: (levels.coherenceLevel + 1) >= level && level > 0,
    canExpand: level < levels.draftLevel
};
```

**Key Insight**: `canExpand` is true when `level < draftLevel`, meaning nodes can create children even if they don't have final content.

## Processing Rules

### 1. Same-Level Coordination
- All nodes at the same level have identical target states
- A node can only expand if **ALL** nodes at its level have reached their target state
- This prevents premature expansion and ensures coordinated progression

### 2. Work Order Priority
Work is performed in strict order:
1. **Context Pruning** (vestigial — always a no-op now; the conditional context system replaced it)
2. **Content Generation** (if needed)  
3. **Coherence Check** (if needed, only on last sibling)
4. **Expansion** (if allowed and all same-level nodes ready)

### 3. Expansion Logic
A node can expand only if:
- `targetState.canExpand` is true (`level < draftLevel`)
- Node has no existing children
- **ALL** nodes at the same level have completed their required work

## Current State Determination

```typescript
currentState = {
    hasContextPruning: false, // vestigial: was node.ContextIsAdjusted(), context pruning removed
    hasContent: node.getState() === 'Final',
    hasCoherenceCheck: node.isConsistentToParent(), // any version tagged 'consistent_to_parent'
    hasChildren: node.children.length > 0
};
```

### Node States
- **Empty**: No content
- **Draft**: Content exists but starts with "Draft:" or has 'draft' tag
- **Final**: Has real content that's not marked as draft

## Version Management & Draft Preservation

### The Sacred Nature of Draft Versions
**Critical Principle**: Draft versions must NEVER be modified during content generation. They serve as sacred baseline states that users can return to when regenerating content.

**Previous Issue (Fixed)**: The system was directly overwriting draft content:
```typescript
// OLD - WRONG: Corrupted draft versions
node.setContent(result.finalResponse, 'generatedWinner');
```
This approach violated draft preservation by writing new content into existing draft versions, making the original draft state unrecoverable.

**Current Solution**: Version promotion workflow:
```typescript
// NEW - CORRECT: Preserves draft versions
const finalVersion = node.getAllVersions().find((v: ContentVersion) => 
    v.content === result.finalResponse && v.tags.has('generated')
);

if (finalVersion) {
    // Promote the generated version to master with generatedWinner tag
    node.promoteToMaster(finalVersion.id, ['generatedWinner']);
} else {
    // Fallback: create new version and promote it
    const newVersionId = node.addVersion(['generated', 'finalResult'], {
        content: result.finalResponse
    });
    node.promoteToMaster(newVersionId, ['generatedWinner']);
}
```

### Content Generation Version Workflow
1. **Preserve Original**: Draft versions remain untouched
2. **Create New Versions**: Each generation iteration creates new versions with 'generated' tags
3. **Promote Winner**: The best iteration is promoted to master status  
4. **Maintain History**: All iterations remain available for comparison and rollback

### Benefits of Version Preservation
- **Regeneration Safety**: Users can always return to original draft state
- **Version History**: Complete audit trail of all generation attempts
- **Rollback Capability**: Easy to revert to any previous state
- **No Data Loss**: Original user input is never destroyed

## Frozen Settings System

### The Settings Consistency Problem (Fixed)
**Previous Issue**: Coherence checks used live settings during generation, creating inconsistent behavior when users changed settings mid-process.

**Problem Scenarios**:
- User changes coherence prompt during generation → different analysis behavior
- User switches model configuration → different AI model mid-generation  
- User changes language → prompts in different language mid-process

### Frozen Settings Solution
All generation-related settings are now **captured once at generation start** and remain frozen throughout the entire process:

```typescript
const frozenSettings: FrozenSettings = {
    coherenceAnalysisPrompt: prompts.coherence_analysis || '',
    fixContradictionPrompt: prompts.fix_contradiction || '',
    language: this.deps.settingsManager.getLanguage(),
    taskModelConfigs: profile?.taskModelConfigs || { /* defaults */ }
};
```

### What Gets Frozen
- **Prompt Templates**: coherence_analysis, fix_contradiction 
- **Language Setting**: For prompt placeholder replacement
- **Model Configurations**: Which models to use for each task type

### Benefits of Frozen Settings
- **Predictable Behavior**: Generation won't change mid-process if user touches UI
- **No Race Conditions**: Settings changes can't corrupt ongoing generation  
- **Deterministic Results**: Same frozen parameters always produce identical behavior
- **Consistent Analysis**: Coherence checks use same settings throughout entire generation

### No Defensive Programming
The coherence service fully commits to frozen settings - if frozen settings are missing or incomplete, errors will be thrown immediately. This ensures consistent behavior and makes problems visible rather than hiding them with fallbacks.

## Work Determination Logic

```typescript
workNeeded = {
    contextPruning: targetState.needsContextPruning && !currentState.hasContextPruning,
    contentGeneration: targetState.needsContent && !currentState.hasContent,
    coherenceCheck: targetState.needsCoherenceCheck && !currentState.hasCoherenceCheck,
    expansion: targetState.canExpand && !currentState.hasChildren
};
```

## Expansion Scenarios

### Scenario 1: Content-First Expansion
**Parameters**: `draftLevel=3, contentLevel=2`
- Level 1: Gets content → Final state → Can expand when ready
- Level 2: Gets content → Final state → Can expand when all level 2 nodes ready
- Level 3: Created as drafts, no content generation

### Scenario 2: Structure-First Expansion  
**Parameters**: `draftLevel=4, contentLevel=1`
- Level 1: Gets content → Final state
- Level 2: Created as drafts → Can expand immediately (no content needed)
- Level 3: Created as drafts → Can expand immediately (no content needed)
- Level 4: Created as drafts, cannot expand further

### Scenario 3: Mixed Processing
**Parameters**: `draftLevel=3, contentLevel=2, contextPruneLevel=2, coherenceLevel=1`
- Level 1: Content + Coherence check
- Level 2: Content + Context pruning  
- Level 3: Just drafts (no content, no context work, no coherence)

## Sibling Coordination Algorithm

### All-Nodes-at-Level Must Be Ready
```typescript
const siblings = allNodes.filter(n => n.level === node.level);
const allSiblingsReady = siblings.every(sibling => {
    const siblingWorkNeeded = this.getWorkNeeded(sibling, targetState);
    const isReady = !siblingWorkNeeded.contextPruning && 
                   !siblingWorkNeeded.contentGeneration && 
                   !siblingWorkNeeded.coherenceCheck;
    return isReady;
});
```

**Critical**: This checks ALL nodes at the same level across the entire descendant tree, not just direct siblings under the same parent.

## Loop Structure

### Single-Operation Processing Loop
```
while (workDone) {
    workDone = false;
    allNodes = collectAllDescendants(startNodeId);  // Fresh assessment every iteration
    targetStates = calculateTargetStates(levels, startLevel, maxLevel);
    
    for each node in allNodes {
        workNeeded = getWorkNeeded(node, targetStates[node.level]);
        
        // Do ONLY the first operation needed, then break for fresh assessment
        if (workNeeded.contextPruning) → handleContextPruning() → BREAK;
        if (workNeeded.contentGeneration) → handleContentGeneration() → BREAK;  
        if (workNeeded.coherenceCheck && isLastSibling) → handleCoherenceCheck() → BREAK;
        if (workNeeded.expansion && canNodeExpand()) → handleDraftCreation() → BREAK;
    }
}
```

### Key Characteristics
- **One Operation Per Iteration**: After any work is performed, immediately break and start fresh
- **Fresh Tree Assessment**: Every iteration calls `collectAllDescendants()` for current tree state
- **No Temporal Coupling**: Tree modifications don't affect other operations within the same iteration
- **Predictable Behavior**: Identical processing order whether continuous or interrupted

### Work Priority Order
1. **Context Pruning** (highest priority)
2. **Content Generation** 
3. **Coherence Check** (only on last sibling)
4. **Expansion** (lowest priority)

### Termination Condition
Loop continues until a complete pass produces no work (`workDone = false`).

## Node Processing Order

### Creation Order vs. Modification Order
The system processes nodes in **creation order** (array position) rather than modification timestamps. This ensures stable, predictable ordering that doesn't change based on operations.

**Previous Issue (Fixed)**: Originally used timestamp-based ordering:
```typescript
// OLD - BROKEN: Timestamps change with operations
const sortedChildren = [...currentNode.children].sort((a, b) => {
    const aMasterVersion = a.getMasterVersion()!;
    const bMasterVersion = b.getMasterVersion()!;
    return aMasterVersion.timestamp.getTime() - bMasterVersion.timestamp.getTime();
});
```

**Current Solution**: Uses natural array order (creation order):
```typescript
// NEW - STABLE: Creation order never changes
const sortedChildren = [...currentNode.children];
```

### Why This Matters
**Problem Scenario:**
1. Parent expands → Child A, B, C (creation order)
2. Child A gets context-adjusted (timestamp updated to "now")  
3. Generation interrupted and resumed
4. System would process B, C, A (wrong timestamp order)
5. Child A triggers coherence check but has no content → **BUG**

**Solution:**
- **Stable Ordering**: A, B, C always processed in creation order
- **Correct "Last Sibling"**: Child C always triggers coherence, not A
- **Resumable**: Interruptions don't change processing logic

## Temporal Coupling Elimination

### The Hidden State Problem (Solved)
The original design had a subtle temporal coupling issue where the order of operations **within a single iteration** could affect tree state and subsequent decisions.

**Previous Issue**: 
```typescript
// OLD - Multiple operations per iteration created race conditions
for (const node of allNodes) {
    if (workNeeded.expansion) expandNode(); // Tree changes
    if (workNeeded.content) generateContent(); // Decision based on modified tree
}
```

**Root Cause**: When P1 expanded (creating children), P2's expansion decision saw a different tree state than the initial `allNodes` captured at loop start.

**Current Solution**: Single-operation iterations with immediate reassessment:
```typescript
// NEW - One operation, then fresh assessment
for (const node of allNodes) {
    if (workNeeded.expansion) {
        expandNode();
        break; // Exit immediately - fresh tree assessment next iteration
    }
}
```

### Benefits of Single-Operation Iterations
1. **Eliminates Race Conditions**: No mid-iteration tree changes affecting later decisions
2. **Consistent Behavior**: Continuous vs. interrupted generation identical
3. **Easier Debugging**: Each iteration has single responsibility
4. **Perfect Resumability**: Every restart sees identical tree state

## Fault Tolerance & Seamless Recovery

### How Resumability Works

The stateless design means **every restart is a fresh calculation** of what work needs to be done:

1. **Check Current State**: System examines actual node states (content, tags, children)
2. **Calculate Target State**: Based on the same generation parameters
3. **Determine Work Needed**: Only tasks not yet completed
4. **Resume Processing**: Pick up exactly where interrupted

### Recovery Scenarios

**Network Interruption During Content Generation:**
- Node remains in "generating" state until completion
- On restart: System detects incomplete generation, retries that specific node
- Already completed nodes are skipped automatically

**API Rate Limit Hit:**
- Some nodes completed, others still pending
- On restart: Completed nodes detected via state analysis
- Only pending nodes are processed

**Browser Crash Mid-Process:**
- All completed work is already saved to storage
- On reload: System recalculates from saved state
- Seamlessly continues from interruption point

**Power Outage:**
- Storage is persistent (IndexedDB)
- On restart: Full state reconstruction from storage
- Zero duplicate work, perfect continuation

### No State Corruption Possible

Traditional state-machine approaches risk corruption:
- "Started but not finished" flags get stuck
- Complex state transitions can break
- Recovery requires manual intervention

**Stateless approach eliminates this**:
- No persistent state flags to corrupt
- Each run is independent calculation
- Always self-correcting based on actual node states

## Edge Cases and Considerations

### Draft Nodes Can Expand
- If `contentLevel < draftLevel`, nodes get created as drafts without content
- These draft nodes can still expand if all same-level nodes are "ready"
- "Ready" means completed all required work, not necessarily having final content

### Coherence Check Workflow (Complex!)
Coherence checking has a unique workflow that differs from other operations:

**The Challenge**: Coherence analyzes parent-child relationships, not individual nodes
- **Analysis Target**: Parent node content vs ALL its children's content
- **Execution Trigger**: Called with PARENT as parameter
- **Result Tags**: Applied to CHILDREN ("consistent_to_parent")

**The Workflow**:
1. **Wait for All Children**: Coherence can only run when ALL children of a parent are in final state
2. **Last Sibling Triggers**: Only the "last sibling" at a level triggers the coherence check
3. **Parent Analysis**: System analyzes parent.content against all children.content
4. **Tag Children**: Results are applied as "consistent_to_parent" tags on the children
5. **Level Coordination**: All children must be tagged before any can proceed to next stage

**Level Calculation Logic**:
```typescript
// If coherenceLevel = 1, we want to check level 1 parents against level 2 children
const needsCoherenceCheck = (levels.coherenceLevel + 1) >= level && level > 0;
```
The `+1` adjustment accounts for the parent-child relationship - children need to wait for coherence results.

**Why "Last Sibling" Trigger?**:
- Prevents redundant coherence checks (one check per parent, not per child)
- Ensures ALL children are ready before analysis
- Uses parent.children array order to determine "last"

### Context Inheritance
- New child nodes selectively inherit conditional/keyword context during creation
- There is no context-pruning step anymore (the conditional context system replaced it)
- What a node actually sees at generation time is governed by the **Context Assembly & Future-Knowledge Policy** near the top of this document

### Model Selection
- Child creation uses 'creator' model
- Content generation uses 'prose' (leaf nodes) or 'creator' (branch nodes)
- Leaf vs branch is determined purely by the template (`node.isLeaf = level >= template.length - 1`), never by the chosen generation levels. Branch nodes always produce an outline via the 'creator' model; only leaf nodes produce final prose via the 'prose' model.

## Common Misunderstandings

### "Drafts Should Not Expand"
**Wrong**: Drafts can expand if they're not supposed to get content (`level > contentLevel`)

### "Direct Siblings Only"
**Wrong**: Expansion waits for ALL nodes at the same level across the entire descendant tree

### "Content Required for Expansion"  
**Wrong**: Only required work (as defined by target state) must be completed

### "Coherence Level = Node Level"
**Wrong**: `coherenceLevel = 1` means analyze level 1 PARENTS against their level 2 CHILDREN
- The coherence check is performed on the parent
- The results (tags) are applied to the children  
- Children at level `coherenceLevel + 1` must wait for coherence results

### "Each Node Checks Its Own Coherence"
**Wrong**: Coherence is a parent-child relationship analysis
- One coherence check per parent (triggered by last child)
- Analysis compares parent content vs ALL children content
- Results affect multiple children simultaneously

## Debugging Tips

### Check Target States
```typescript
console.log('Target state for level', level, ':', targetStates[level]);
```

### Check Work Needed
```typescript
console.log('Work needed for node', node.title, ':', workNeeded);
```

### Check Sibling Readiness
```typescript
const siblings = allNodes.filter(n => n.level === node.level);
siblings.forEach(s => {
    const work = getWorkNeeded(s, targetState);
    console.log(s.title, 'needs work:', work);
});
```

### Check Coherence Status
```typescript
// For debugging coherence blocking issues
console.log('Node state:', node.getState());
console.log('Has coherence tag:', node.getMasterVersion()?.tags.has('consistent_to_parent'));
console.log('Is last sibling:', this.isLastSibling(node));
console.log('Parent has children ready for coherence:', 
    parent.children.every(child => child.getState() === 'Final'));
```

## Benefits of This Approach

1. **Truly Deterministic**: Same parameters **always** produce identical processing order
   - Creation order preserved regardless of operations
   - No timestamp-based side effects
   - Continuous vs. interrupted generation behaves identically

2. **Genuinely Stateless**: No hidden temporal dependencies
   - Single-operation iterations eliminate race conditions
   - Fresh tree assessment every iteration
   - No complex state flags to manage
   - **Frozen Settings**: All analysis uses parameters captured at generation start

3. **Level-Coordinated**: Prevents inconsistent tree states
   - Same-level nodes always have identical target states
   - Coordinated progression prevents premature expansion

4. **Flexible**: Supports both content-first and structure-first workflows
   - Draft nodes can expand without content if design allows
   - Multiple expansion strategies supported

5. **Fault-Tolerant & Resumable**: **This is the killer feature** - interrupted work can be seamlessly continued
   - Network problems? No problem - fix connection and restart
   - API rate limits? Wait and continue - no duplicate work  
   - Browser crash? Reload and pick up exactly where you left off
   - No complex state tracking needed - the system calculates what's needed on each run
   - Zero duplicate work - already completed tasks are automatically detected and skipped

6. **Debuggable & Predictable**: 
   - Single responsibility per iteration makes debugging easier
   - No temporal coupling between operations
   - Identical behavior regardless of interruption timing

## Potential Issues

1. **Performance with Large Trees**: More frequent `collectAllDescendants()` calls
   - **Mitigation**: Tree traversal is microseconds vs. LLM calls in seconds - negligible impact
   - Single-operation approach actually simplifies reasoning and debugging

2. **Complex Dependencies**: Coherence checks can create unexpected waiting
   - Last sibling must trigger coherence for entire level
   - All children must be complete before coherence analysis

3. **User Confusion**: Draft expansion behavior may surprise users  
   - Nodes can expand even without final content if design allows
   - "Ready" means target state achieved, not necessarily final content

4. **Debugging Requires Understanding**: While much simpler than before, requires understanding:
   - Creation order vs. modification order
   - Single-operation iteration philosophy
   - Target state vs. current state comparison

---

*This documentation was last updated to add the Context Assembly & Future-Knowledge (Anti-Foreshadowing) Policy, to record that predetermined sections (deterministic child creation) are the default specifically to keep future knowledge out of child generation, and to remove stale references to the deleted context-pruning system (`contextPruneLevel`, `ContextIsAdjusted`). It also reflects the earlier single-operation iteration approach and creation-order processing fixes that eliminated temporal coupling issues.* 