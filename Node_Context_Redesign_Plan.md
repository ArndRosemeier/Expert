# Node Creation and Context Management Redesign Plan

## Overview

This document outlines the implementation plan for a new approach to node creation and context management that will:
1. Create draft content alongside titles during subnode creation
2. Implement intelligent positional context awareness
3. Replace automatic context propagation with intelligent context distillation

## Current State Analysis

### Current Node Creation Process
- `createChildrenFromOutline()` creates only titles via bullet list
- Nodes are created empty, content generated separately
- Context automatically propagates from parent to children
- No draft state tracking

### Current Context Management
- Context flows down automatically from parent to all children
- No intelligence about what context is relevant for specific positions
- No consideration of sibling relationships or ordering

## New Architecture Overview

### Phase 1: Enhanced Node Creation with Drafts
Instead of creating empty nodes with titles only, the system will create nodes with:
- Title
- Draft content
- Draft flag (`isDraft: boolean`)
- Positional awareness

### Phase 2: Intelligent Context Management
- Position-aware context compilation
- Sibling-aware context generation
- Intelligent context distillation and propagation
- Parent context + position + siblings → targeted context

## Implementation Plan

### Step 1: Data Model Changes

#### 1.1 DocumentNode Enhancements
```typescript
// Add to DocumentNode class
interface DocumentNode {
    // ... existing properties
    isDraft: boolean;           // New: indicates if node has draft content
    draftContent?: string;      // New: stores draft content separate from final content
    generatedContext?: string;  // New: context specifically generated for this node
}
```

#### 1.2 Node Creation Response Format
```typescript
// New interface for enhanced node creation
interface NodeCreationItem {
    title: string;
    draft: string;
}

// Parser for new format: "Title, Draft content goes here..."
```

### Step 2: Enhanced Node Creation Process

#### 2.1 Update `createChildrenFromOutline()` Method
**File**: `src/project/GenerationService.ts`

**Changes**:
- Modify prompt to request "Title, Draft" format instead of just titles
- Update response parsing to extract both title and draft
- Create nodes with `isDraft: true` and populate `draftContent`
- Store draft in appropriate property

**New Prompt Format**:
```
Generate a list of child nodes. Each line should contain:
- Title, followed by a comma
- Brief draft content describing what this section will contain

Format: "* Title, Draft content description..."
```

#### 2.2 Update `parseBulletedList()` Method
**File**: `src/project/GenerationService.ts`

**Enhancement**:
```typescript
private parseEnhancedBulletList(text: string): NodeCreationItem[] {
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('*') || line.startsWith('-'))
        .map(line => {
            const content = line.substring(1).trim();
            const commaIndex = content.indexOf(',');
            
            if (commaIndex === -1) {
                // Fallback to old format
                return { title: content, draft: '' };
            }
            
            return {
                title: content.substring(0, commaIndex).trim(),
                draft: content.substring(commaIndex + 1).trim()
            };
        })
        .filter(item => item.title.length > 0);
}
```

### Step 3: Positional Context System

#### 3.1 Position Detection Service
**New File**: `src/project/PositionService.ts`

```typescript
export interface NodePosition {
    isFirst: boolean;
    isLast: boolean;
    hasNext: boolean;
    hasPrevious: boolean;
    precedingNode?: DocumentNode;
    succeedingNode?: DocumentNode;
    positionInParent: number;
    totalSiblings: number;
}

export class PositionService {
    static getNodePosition(nodeId: string, rootNode: DocumentNode): NodePosition;
    static getPositionDescription(position: NodePosition): string;
    static getSiblingContext(position: NodePosition): string;
}
```

#### 3.2 Context Compilation Enhancement
**File**: `src/project/ContextService.ts`

**New Method**:
```typescript
public compilePositionalNodeContext(
    nodeId: string, 
    rootNode: DocumentNode,
    includeParentContent: boolean = true,
    includeSiblingContext: boolean = true
): string {
    const node = this.treeService.findNodeById(nodeId, rootNode);
    const position = PositionService.getNodePosition(nodeId, rootNode);
    
    // Build context sections
    const sections: string[] = [];
    
    // 1. Parent context and content
    if (node.parentId && includeParentContent) {
        const parent = this.treeService.findNodeById(node.parentId, rootNode);
        if (parent) {
            sections.push(`Parent Context: ${parent.context || 'None'}`);
            sections.push(`Parent Content: ${parent.content || 'None'}`);
        }
    }
    
    // 2. Position information
    sections.push(`Position: ${PositionService.getPositionDescription(position)}`);
    
    // 3. Sibling context
    if (includeSiblingContext) {
        const siblingContext = PositionService.getSiblingContext(position);
        if (siblingContext) {
            sections.push(`Sibling Context: ${siblingContext}`);
        }
    }
    
    return sections.join('\n\n');
}
```

### Step 4: Context Generation for Outline Nodes

#### 4.1 Enhanced Branch Content Generation
**File**: `src/PromptManager.ts`

**Update `branch_content_generation_user` prompt**:
```typescript
branch_content_generation_user: `
You are an expert at outlining and structuring documents. You are working on a node at the path "{{path}}" with the title "{{title}}".

This is a "branch" node, meaning it will be expanded into child nodes later. Your task is to:
1. Generate the content for this branch node
2. Generate a focused context summary for this node's children

CONTENT: Write a detailed prose outline that thoroughly describes what will logically follow. Include rich details about key points, characters, plot developments, themes, and specific elements. Do NOT use bullet points or markdown formatting.

CONTEXT: After the content, provide a context summary that distills the most relevant information from the broader document context for this specific section. Include only what the child nodes of this section would need to know.

Here is the broader document context:
---
{{context}}
---

Format your response as:
CONTENT:
[Your detailed outline content here]

CONTEXT:
[Focused context summary for child nodes]
`,
```

#### 4.2 Context Extraction and Storage
**Enhancement to GenerationService**:
- Parse the dual-format response (CONTENT: / CONTEXT:)
- Store content in `node.content`
- Store context in `node.generatedContext`

### Step 5: Updated Content Generation Prompts

#### 5.1 Position-Aware Content Generation
**File**: `src/PromptManager.ts`

**Update `content_generation_user` prompt**:
```typescript
content_generation_user: `
You are writing the content for the node "{{title}}" at path: "{{path}}".

Position Information:
{{position_info}}

{{#if has_preceding}}
Preceding section: "{{preceding_title}}"{{#if preceding_is_draft}} (draft){{/if}}
{{/if}}

{{#if has_succeeding}}
Following section: "{{succeeding_title}}"{{#if succeeding_is_draft}} (draft){{/if}}
{{/if}}

Relevant Context:
---
{{context}}
---

{{#if has_draft}}
Current draft to expand:
---
{{draft_content}}
---
Expand this draft into full content, maintaining consistency with the position and context.
{{else}}
Write the full content for this section, ensuring it flows naturally from the preceding content and leads appropriately to the following content.
{{/if}}

IMPORTANT: Your response should contain ONLY the requested content text, nothing more.
`,
```

### Step 6: Remove Automatic Context Propagation

#### 6.1 Update Context Service
**File**: `src/project/ContextService.ts`

**Changes**:
- Remove automatic parent-to-child context copying
- Update `compileNodeContext()` to use new positional system
- Maintain backward compatibility during transition

#### 6.2 Update Node Creation in TreeService
**File**: `src/project/TreeService.ts`

**Changes**:
- Remove automatic context inheritance in `addNode()`
- Let context generation handle intelligent propagation

### Step 7: UI Updates

#### 7.1 Draft State Indication
**File**: `src/ui/project-ui.ts`

**Changes**:
- Add visual indicators for draft nodes in tree view
- Show draft status in node details
- Add button to "finalize" draft content

#### 7.2 Context Display Enhancement
**Files**: `src/ui/project-ui.ts`, `src/ui/reader-gui.ts`

**Changes**:
- Show both inherited and generated context
- Display position information
- Show sibling relationships

### Step 8: Migration Strategy

#### 8.1 Backward Compatibility
- Existing nodes without `isDraft` property default to `isDraft: false`
- Existing context system continues to work during transition
- Gradual migration of context to new system

#### 8.2 Feature Flags
```typescript
interface GenerationConfig {
    useEnhancedNodeCreation: boolean;
    usePositionalContext: boolean;
    useIntelligentContextPropagation: boolean;
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. Data model changes (DocumentNode)
2. Enhanced node creation parsing
3. Basic position detection service

### Phase 2: Context System (Week 2)
1. Positional context compilation
2. Enhanced prompts with position awareness
3. Context generation for outline nodes

### Phase 3: Integration (Week 3)
1. Update all generation workflows
2. UI enhancements for draft state
3. Remove automatic propagation

### Phase 4: Polish (Week 4)
1. Migration tools for existing projects
2. Testing and refinement
3. Documentation updates

## Benefits of New System

### Content Quality
- **Contextual awareness**: Content flows better between sections
- **Draft refinement**: Initial drafts provide structure, final content adds detail
- **Positional consistency**: Content aware of its place in the narrative

### Context Relevance
- **Targeted context**: Only relevant information propagated to children
- **Intelligent distillation**: Context summarized and focused per level
- **Sibling awareness**: Content aware of neighboring sections

### User Experience
- **Faster iteration**: Draft content provides immediate structure
- **Better navigation**: Clear indication of draft vs. final content
- **Intelligent automation**: Less manual context management needed

## Technical Considerations

### Performance
- Position calculation cached per generation session
- Context compilation optimized for frequently accessed nodes
- Lazy loading of sibling context when needed

### Data Integrity
- Migration scripts for existing projects
- Validation of new node creation format
- Fallback to old system if new parsing fails

### Testing Strategy
- Unit tests for position detection
- Integration tests for context compilation
- End-to-end tests for full generation workflow
- Performance tests for large document hierarchies

## Risk Mitigation

### Backward Compatibility
- Feature flags for gradual rollout
- Parallel systems during transition
- Migration validation tools

### Content Quality
- A/B testing of old vs. new prompts
- User feedback collection
- Quality metrics tracking

### System Complexity
- Clear separation of concerns
- Comprehensive documentation
- Step-by-step implementation approach 