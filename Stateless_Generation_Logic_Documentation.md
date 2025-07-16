# Stateless Generation Logic Documentation

## Overview

The Expert system uses a sophisticated **stateless target-state-based generation strategy** for content creation and tree expansion. This approach ensures deterministic, level-based processing where nodes advance through clearly defined states based on generation parameters.

## Core Concepts

### Target State vs Current State

**Target State**: What a node should achieve based on generation parameters
**Current State**: What a node has actually achieved

The system continuously compares these states and performs work to close the gap.

### Generation Parameters

The system uses four key parameters that define what work should be done at each level:

- **`draftLevel`**: Maximum level where children (drafts) can be created
- **`contentLevel`**: Maximum level where content should be generated  
- **`contextPruneLevel`**: Maximum level where context should be pruned/adjusted
- **`coherenceLevel`**: Maximum level where coherence checks should be performed

### Level-Based Target State Calculation

For each level from `startNode.level` to `maxLevel`, the system calculates:

```typescript
targetStates[level] = {
    level,
    needsContextPruning: levels.contextPruneLevel >= level && level > 0,
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
1. **Context Pruning** (if needed)
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
    hasContextPruning: node.ContextIsAdjusted(),
    hasContent: node.getState() === 'Final',
    hasCoherenceCheck: masterVersion?.tags.has('consistent_to_parent'),
    hasChildren: node.children.length > 0
};
```

### Node States
- **Empty**: No content
- **Draft**: Content exists but starts with "Draft:" or has 'draft' tag
- **Final**: Has real content that's not marked as draft

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

### Main Processing Loop
```
while (workDone) {
    workDone = false;
    allNodes = collectAllDescendants(startNodeId);
    targetStates = calculateTargetStates(levels, startLevel, maxLevel);
    
    for each node in allNodes {
        workNeeded = getWorkNeeded(node, targetStates[node.level]);
        
        if (workNeeded.contextPruning) → handleContextPruning();
        if (workNeeded.contentGeneration) → handleContentGeneration();  
        if (workNeeded.coherenceCheck && isLastSibling) → handleCoherenceCheck();
        if (workNeeded.expansion && canNodeExpand()) → handleDraftCreation();
    }
}
```

### Termination Condition
Loop continues until a complete pass produces no work (`workDone = false`).

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
- New child nodes inherit parent context during creation
- Context pruning happens after creation, before content generation

### Model Selection
- Child creation uses 'creator' model
- Content generation uses 'prose' (leaf nodes) or 'creator' (branch nodes)

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

1. **Deterministic**: Same parameters always produce same processing order
2. **Stateless**: No complex state flags to manage
3. **Level-Coordinated**: Prevents inconsistent tree states
4. **Flexible**: Supports both content-first and structure-first workflows
5. **Fault-Tolerant & Resumable**: **This is the killer feature** - interrupted work can be seamlessly continued
   - Network problems? No problem - fix connection and restart
   - API rate limits? Wait and continue - no duplicate work
   - Browser crash? Reload and pick up exactly where you left off
   - No complex state tracking needed - the system calculates what's needed on each run
   - Zero duplicate work - already completed tasks are automatically detected and skipped

## Potential Issues

1. **Large Trees**: Checking all same-level nodes can be expensive
2. **Complex Dependencies**: Coherence checks can create unexpected waiting
3. **User Confusion**: Draft expansion behavior may surprise users
4. **Debug Complexity**: Hard to trace why expansion is blocked

---

*This documentation should be updated as the logic evolves or edge cases are discovered.* 