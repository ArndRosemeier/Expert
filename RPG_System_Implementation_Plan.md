# RPG System Implementation Plan

## Overview
A dedicated roleplaying experience with a persistent game world, intelligent context construction, and dual-LLM workflow (Game LLM for narration + State Parser LLM for world updates).

---

## Core Concepts

### 1. Persistent Game World
- **Locations**: Places in the game world with descriptions, connections, and states
- **Characters**: NPCs and players with attributes, relationships, and states
- **Lore**: Background information, events, and world-building details
- **Relationships**: Connections between entities (Character↔Character, Character↔Location, Character↔Lore, Location↔Lore)

### 2. Intelligent Context Construction
- **Last 2 Messages Only**: Recent conversational continuity (User + LLM)
- **World State**: Current location, present characters, relevant lore
- **Graph Traversal**: Include related entities via relationship links (e.g., friend's knowledge, location's lore)
- **Soft Geography**: Include emergent distances from current location to maintain consistency

### 3. Dual-LLM Workflow
- **Game LLM (Narrator)**: Generates narrative responses (default: prose model)
- **State Parser LLM (Parser)**: Extracts world state changes from narrative (default: editor model)
- **Async State Analysis**: Parser runs in background; user can type, but submission awaits completion
- **State Locking**: No manual/AI world modifications while analysis is in progress

### 4. Automatic Snapshots
- **Move-by-Move**: Save complete world state after each turn
- **Age-Based Cleanup**: Remove snapshots older than user-defined threshold
- **Rollback**: User can restore any previous snapshot

---

## 1. File Structure & Components

### New Files to Create
```
src/rpg/
├── types/
│   └── RPGTypes.ts                     # Core interfaces (Location, Character, Lore, Relationship, etc.)
├── services/
│   ├── WorldStateService.ts            # CRUD, Snapshots, Locking, Relationships
│   ├── RPGContextBuilder.ts            # Constructs LLM context from world state
│   ├── RPGInteractionService.ts        # Orchestrates Game LLM + State Parser
│   └── RPGStateParser.ts               # Parses LLM output for world updates
└── ui/
    ├── RPGView.ts                      # Main RPG interface (conversation + world inspector)
    ├── RPGConversationPanel.ts         # Chat interface for game interaction
    ├── RPGWorldInspector.ts            # Tree-based world viewer with Scene/World toggle
    ├── RPGSnapshotManager.ts           # Snapshot browsing and rollback UI
    └── components/
        ├── RPGEntityEditor.ts          # Edit Location/Character/Lore entities
        └── RPGRelationshipEditor.ts    # Manage relationships between entities
```

### Files to Modify
```
src/PromptManager.ts                    # Add RPG prompts
src/StorageService.ts                   # Add RPG world state + snapshot stores
src/IndexedDBService.ts                 # (No changes needed - already generic)
src/ui/modal-manager.ts                 # Register RPG modals if needed
src/event-handlers.ts                   # Add RPG button listener (DONE)
index.html                              # Add RPG button (DONE)
```

---

## 2. Prompt Definitions

### 2.1 Add to `OrchestratorPrompts` Interface
```typescript
// In src/PromptManager.ts OrchestratorPrompts interface:

// RPG Game Narration (Game LLM)
rpg_game_narration_system: string;

// RPG State Parsing (State Parser LLM)
rpg_state_parser_system: string;
rpg_state_parser_user: string;
```

### 2.2 Prompt Templates (to add to `defaultPromptDefinitions`)

#### `rpg_game_narration_system`
```typescript
rpg_game_narration_system: {
    text: `
You are the Game Master for an immersive roleplaying adventure. Your role is to narrate events, describe scenes, roleplay characters, and respond to the player's actions in a dynamic and engaging way.

## Current World State

### Location
{{rpg_current_location}}

### Characters Present
{{rpg_present_characters}}

### Player Character
{{rpg_player_character}}

### Relevant Lore & Background
{{rpg_relevant_lore}}

### Recent Events Summary
{{rpg_recent_events}}

### Known Distances (from current location)
{{rpg_known_distances}}

## Guidelines
1. **Narrative Style**: Be vivid, immersive, and consistent with the world state above.
2. **Character Roleplay**: Speak as NPCs when they interact; use their knowledge and relationships.
3. **World Consistency**: Respect established facts (distances, relationships, events).
4. **Dynamic Choices**: Offer meaningful decisions without railroading the player.
5. **State Changes**: Describe changes naturally (movement, item acquisition, relationships) so the State Parser can extract them.
6. **Emergent Geography**: If the player travels to a new location, describe the journey and mention approximate travel time/distance.

## Important
- You do NOT need to output structured data or XML. Write naturally.
- The State Parser will extract changes from your narrative automatically.
- Focus on creating an engaging, coherent experience for the player.
    `.trim(),
    placeholders: [
        'rpg_current_location',
        'rpg_present_characters',
        'rpg_player_character',
        'rpg_relevant_lore',
        'rpg_recent_events',
        'rpg_known_distances'
    ],
    description: "System prompt for the Game LLM (narrator). Provides world state context for generating immersive narrative responses."
}
```

#### `rpg_state_parser_system`
```typescript
rpg_state_parser_system: {
    text: `
You are the State Parser for an RPG system. Your job is to analyze narrative text generated by the Game Master and extract structured information about changes to the game world.

## Your Task
1. Read the player's action and the Game Master's narrative response.
2. Extract any changes to:
   - **Locations**: New locations discovered, location state changes
   - **Characters**: New characters introduced, character state changes, relationship changes
   - **Lore**: New background information, events, world-building details
   - **Distances**: Travel times or distances mentioned between locations
   - **Recent Events**: A brief summary of what just happened (for continuity)

3. Output structured XML (see schema below).

## Output Format (XML)
You MUST respond with valid XML following this schema:

<rpg_state_update>
  <locations>
    <location action="create|update">
      <id>unique_identifier</id>
      <name>Location Name</name>
      <description>Location description</description>
      <state>JSON object with dynamic state</state>
    </location>
    <!-- Repeat for each location -->
  </locations>
  
  <characters>
    <character action="create|update">
      <id>unique_identifier</id>
      <name>Character Name</name>
      <description>Character description</description>
      <state>JSON object with dynamic state</state>
    </character>
    <!-- Repeat for each character -->
  </characters>
  
  <lore>
    <lore_item action="create|update">
      <id>unique_identifier</id>
      <title>Lore Title</title>
      <content>Lore content</content>
      <tags>comma,separated,tags</tags>
    </lore_item>
    <!-- Repeat for each lore item -->
  </lore>
  
  <relationships>
    <relationship action="create|update|delete">
      <from_id>entity_id_1</from_id>
      <to_id>entity_id_2</to_id>
      <type>friend|enemy|knows|located_at|related_to|etc</type>
      <description>Optional relationship description</description>
    </relationship>
    <!-- Repeat for each relationship -->
  </relationships>
  
  <distances>
    <distance>
      <from_location_id>location_id_1</from_location_id>
      <to_location_id>location_id_2</to_location_id>
      <distance>Numeric value or range</distance>
      <unit>km|miles|hours|days|etc</unit>
    </distance>
    <!-- Repeat for each distance -->
  </distances>
  
  <recent_events_summary>
    Brief summary of what happened in this turn for continuity.
  </recent_events_summary>
  
  <player_location>
    <current_location_id>current_location_id</current_location_id>
  </player_location>
</rpg_state_update>

## Rules
- Only extract information explicitly present or strongly implied in the narrative.
- Use "create" action for new entities, "update" for changes to existing ones.
- Generate stable IDs: lowercase, underscores, descriptive (e.g., "tavern_golden_mug").
- If no changes, return an empty tag (e.g., <locations></locations>).
- The "state" field is flexible JSON for dynamic attributes (health, mood, inventory, etc.).
- Do NOT invent information not present in the narrative.
    `.trim(),
    placeholders: [],
    description: "System prompt for the State Parser LLM. Defines XML schema for extracting structured world state changes from narrative text."
}
```

#### `rpg_state_parser_user`
```typescript
rpg_state_parser_user: {
    text: `
## Player's Action
{{rpg_player_action}}

## Game Master's Response
{{rpg_gm_response}}

## Instructions
Extract all world state changes from the Game Master's response and output them as structured XML according to the schema provided in your system instructions.
    `.trim(),
    placeholders: ['rpg_player_action', 'rpg_gm_response'],
    description: "User prompt for the State Parser LLM. Provides the player action and GM response for analysis."
}
```

---

## 3. Data Structures (RPGTypes.ts)

### Core Entity Interfaces
```typescript
// src/rpg/types/RPGTypes.ts

export interface RPGLocation {
    id: string;
    name: string;
    description: string;
    state: Record<string, unknown>; // Flexible JSON for dynamic attributes
    createdAt: number;
    updatedAt: number;
}

export interface RPGCharacter {
    id: string;
    name: string;
    description: string;
    state: Record<string, unknown>; // health, mood, inventory, etc.
    createdAt: number;
    updatedAt: number;
}

export interface RPGLore {
    id: string;
    title: string;
    content: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
}

export interface RPGRelationship {
    id: string;
    fromId: string; // Entity ID (character, location, lore)
    toId: string;
    type: string; // 'friend', 'enemy', 'knows', 'located_at', 'related_to', etc.
    description?: string;
    createdAt: number;
    updatedAt: number;
}

export interface RPGDistance {
    fromLocationId: string;
    toLocationId: string;
    distance: number | string; // Can be numeric or range
    unit: string; // 'km', 'miles', 'hours', 'days'
    createdAt: number;
}

export interface RPGWorldState {
    locations: Map<string, RPGLocation>;
    characters: Map<string, RPGCharacter>;
    lore: Map<string, RPGLore>;
    relationships: Map<string, RPGRelationship>;
    distances: RPGDistance[];
    recentEventsSummary: string;
    currentLocationId: string;
    playerCharacterId: string;
}

export interface RPGSnapshot {
    id: string;
    timestamp: number;
    worldState: RPGWorldState;
    conversationTurn: number; // Which turn this snapshot represents
}

export interface RPGConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface RPGGameSession {
    id: string;
    title: string;
    worldState: RPGWorldState;
    conversationHistory: RPGConversationMessage[]; // Full history for display
    last2Messages: RPGConversationMessage[]; // Only last 2 for LLM context
    snapshots: string[]; // Snapshot IDs
    narratorModel: string; // Model ID for Game LLM
    parserModel: string; // Model ID for State Parser LLM
    createdAt: number;
    updatedAt: number;
}

export interface RPGStateUpdateXML {
    locations?: Array<{
        action: 'create' | 'update';
        id: string;
        name?: string;
        description?: string;
        state?: Record<string, unknown>;
    }>;
    characters?: Array<{
        action: 'create' | 'update';
        id: string;
        name?: string;
        description?: string;
        state?: Record<string, unknown>;
    }>;
    lore?: Array<{
        action: 'create' | 'update';
        id: string;
        title?: string;
        content?: string;
        tags?: string[];
    }>;
    relationships?: Array<{
        action: 'create' | 'update' | 'delete';
        fromId: string;
        toId: string;
        type: string;
        description?: string;
    }>;
    distances?: Array<{
        fromLocationId: string;
        toLocationId: string;
        distance: number | string;
        unit: string;
    }>;
    recentEventsSummary?: string;
    playerLocation?: {
        currentLocationId: string;
    };
}

export interface RPGModelConfig {
    narratorModelId: string; // Default: prose model
    parserModelId: string;   // Default: editor model
}

export interface RPGAnalysisState {
    isAnalyzing: boolean;
    canSubmit: boolean;
}
```

---

## 4. Code Reuse Mapping

### Existing → RPG Use Case
| Existing Component | RPG Use Case |
|--------------------|-------------|
| `IndexedDBService` | World state persistence (no changes needed) |
| `StorageService` | Extend with RPG stores (`rpg_sessions`, `rpg_snapshots`) |
| `OpenRouterClient` | Game LLM + State Parser LLM interactions |
| `PromptExpansionService` | Expand RPG prompts with world state placeholders |
| `xml-story-creation/parser/XMLStoryParser` | Adapt for parsing RPG state update XML |
| `ModelSelector` / `TaskModelService` | Select narrator/parser models from defined roles |
| `ui/components/SelectableNodeTree` | Adapt for World Inspector tree view |
| `ui/chat-interface.ts` | Reference for conversation UI patterns |

---

## 5. Implementation Steps

### Step 1: Define Core Types
**File**: `src/rpg/types/RPGTypes.ts`
- Define all interfaces from section 3
- Export types for use across RPG system

### Step 2: Add RPG Prompts to PromptManager
**File**: `src/PromptManager.ts`
1. Add 3 new prompt keys to `OrchestratorPrompts` interface:
   - `rpg_game_narration_system`
   - `rpg_state_parser_system`
   - `rpg_state_parser_user`
2. Add prompt definitions to `defaultPromptDefinitions` (see section 2.2)

### Step 3: Extend StorageService
**File**: `src/StorageService.ts`
- Add `rpg_sessions` store (key: session ID, value: `RPGGameSession`)
- Add `rpg_snapshots` store (key: snapshot ID, value: `RPGSnapshot`)
- Add methods:
  - `saveRPGSession(session: RPGGameSession): Promise<void>`
  - `loadRPGSession(sessionId: string): Promise<RPGGameSession | null>`
  - `deleteRPGSession(sessionId: string): Promise<void>`
  - `listRPGSessions(): Promise<RPGGameSession[]>`
  - `saveRPGSnapshot(snapshot: RPGSnapshot): Promise<void>`
  - `loadRPGSnapshot(snapshotId: string): Promise<RPGSnapshot | null>`
  - `deleteRPGSnapshot(snapshotId: string): Promise<void>`
  - `listRPGSnapshots(sessionId: string): Promise<RPGSnapshot[]>`

### Step 4: Register RPG Placeholders
**File**: Create `src/rpg/services/RPGPlaceholderService.ts`
- Register custom placeholders for RPG context:
  - `rpg_current_location`: Formatted current location (name + description + state)
  - `rpg_present_characters`: Formatted list of characters at current location (via relationships)
  - `rpg_player_character`: Formatted player character info
  - `rpg_relevant_lore`: Formatted lore connected to current location or present characters
  - `rpg_recent_events`: Recent events summary from world state
  - `rpg_known_distances`: Formatted list of distances from current location
  - `rpg_player_action`: Last user message
  - `rpg_gm_response`: Last LLM response
- Use `PromptExpansionService.registerContextPlaceholder()` to register them

### Step 5: Implement WorldStateService
**File**: `src/rpg/services/WorldStateService.ts`
- **CRUD Operations**: Create, Read, Update, Delete for Locations, Characters, Lore, Relationships
- **State Locking**: `lockState()`, `unlockState()`, `isLocked()` (prevents modifications during analysis)
- **Snapshots**: `createSnapshot(session: RPGGameSession): Promise<RPGSnapshot>` (move-by-move)
- **Snapshot Cleanup**: `cleanupOldSnapshots(sessionId: string, maxAgeMs: number): Promise<void>`
- **Rollback**: `restoreSnapshot(snapshotId: string): Promise<RPGWorldState>`
- **Relationship Graph**: `getRelatedEntities(entityId: string, depth: number): Set<string>` (BFS/DFS traversal)
- **Distance Lookup**: `getKnownDistances(fromLocationId: string): RPGDistance[]`

### Step 6: Implement RPGContextBuilder
**File**: `src/rpg/services/RPGContextBuilder.ts`
- **Purpose**: Build `PlaceholderContext` for `PromptExpansionService`
- **Methods**:
  - `buildGameNarrationContext(session: RPGGameSession): PlaceholderContext`
    - Use `WorldStateService.getRelatedEntities()` to include relevant characters/lore
    - Format current location, present characters, player character, relevant lore, recent events, known distances
  - `buildStateParserContext(playerAction: string, gmResponse: string): PlaceholderContext`
    - Provide last user message and last LLM response for analysis

### Step 7: Implement RPGStateParser
**File**: `src/rpg/services/RPGStateParser.ts`
- **Purpose**: Parse XML output from State Parser LLM
- **Reuse**: Adapt `xml-story-creation/parser/XMLStoryParser` for RPG XML schema
- **Method**: `parseStateUpdate(xmlString: string): RPGStateUpdateXML`
- **Error Handling**: Validate XML structure, log parsing errors

### Step 8: Implement RPGInteractionService
**File**: `src/rpg/services/RPGInteractionService.ts`
- **Purpose**: Orchestrate Game LLM + State Parser LLM + State Updates
- **Dependencies**: `OpenRouterClient`, `PromptExpansionService`, `RPGContextBuilder`, `RPGStateParser`, `WorldStateService`
- **Methods**:
  - `async sendPlayerAction(session: RPGGameSession, playerAction: string): Promise<string>`
    - Lock state
    - Build Game LLM context (with world state)
    - Call Game LLM (streaming response)
    - Display response immediately
    - Trigger async State Parser analysis (background)
    - Return response
  - `async waitForAnalysisCompletion(): Promise<void>` (called before next user input submission)
    - Await State Parser completion
    - Apply state updates via `WorldStateService`
    - Create snapshot
    - Unlock state
  - `isAnalyzing(): boolean` (UI can check this to disable submit button)

### Step 9: Build RPG UI Components
**Files**: `src/rpg/ui/*.ts`
1. **RPGView.ts**: Main container with Scene/World toggle, conversation panel, world inspector, snapshot manager
2. **RPGConversationPanel.ts**: Chat interface (reuse patterns from `chat-interface.ts`)
   - Model selectors for narrator + parser
   - Input field (disabled while analyzing)
   - Message display with streaming support
3. **RPGWorldInspector.ts**: Tree-based world viewer (adapt `SelectableNodeTree`)
   - **Scene View**: Current location + present characters + relevant lore
   - **World View**: All locations, characters, lore in collapsible tree with relationship links
   - Click relationship link → jump to related entity
4. **RPGSnapshotManager.ts**: Snapshot browsing + rollback UI
   - List snapshots by timestamp/turn
   - Restore snapshot button
5. **RPGEntityEditor.ts**: Modal for editing Location/Character/Lore
   - Form fields for name, description, state (JSON editor)
   - Save/Cancel buttons
6. **RPGRelationshipEditor.ts**: Modal for managing relationships
   - Add/Remove/Edit relationships
   - Dropdown for entity selection, relationship type

### Step 10: Wire Up Event Handlers
**File**: `src/event-handlers.ts` (DONE)
- RPG button listener already added (opens `RPGMockView`)
- Update to open real `RPGView` instead of mock

### Step 11: Testing & Iteration
- Test dual-LLM flow with async state analysis
- Test state locking (ensure no race conditions)
- Test snapshot creation + rollback
- Test relationship graph traversal
- Test emergent distance tracking
- Test prompt placeholder expansion
- Iterate on UI/UX based on user feedback

---

## 6. Workflow Diagram

```
User Action → Game LLM (Narrator)
                ↓
         Display Response Immediately
                ↓
    Trigger State Parser (Background)
                ↓
      User can type while waiting
                ↓
      User hits submit → Wait for analysis
                ↓
    Apply State Updates + Create Snapshot
                ↓
         Unlock State → Next Turn
```

---

## 7. Key Design Decisions

1. **2-Message Limit**: Only last user + assistant messages in LLM context; rely on world state for long-term memory
2. **Async State Analysis**: Non-blocking for typing, blocking for submission
3. **State Locking**: Prevents race conditions during analysis
4. **Move-by-Move Snapshots**: Automatic undo/rollback without manual save management
5. **Relationship Graph**: Intelligent context inclusion via BFS/DFS traversal
6. **Soft Geography**: Emergent distances extracted from narrative, not pre-mapped
7. **XML for Parsing**: Structured, reliable format for State Parser output
8. **Model Roles**: prose = narrator, editor = parser (user-configurable)
9. **Code Reuse**: Leverage existing IndexedDB, OpenRouter, Prompt, XML, Tree components

---

## 8. Future Enhancements (Out of Scope)

- **Multi-Player Support**: Shared world state, turn-based or real-time
- **Procedural Generation**: AI-generated locations/characters on demand
- **Quest System**: Track objectives, branching storylines
- **Combat System**: Structured mechanics for battles
- **Advanced Snapshot Management**: Branching timelines, compare snapshots
- **Export/Import**: Share game sessions, worlds
- **Voice Integration**: TTS for narration, STT for input

---

## 9. Dependencies & Requirements

- **Existing Services**: IndexedDB, OpenRouter, PromptManager, SettingsManager
- **New Dependencies**: None (pure TypeScript/DOM)
- **User Configuration**: Model selection (narrator/parser), snapshot cleanup age
- **Storage Size**: Estimated ~100KB per session, ~10KB per snapshot (manageable for IndexedDB)

---

## 10. Success Metrics

- [ ] User can create a new RPG session with initial world setup
- [ ] User can interact with Game LLM via conversation interface
- [ ] State Parser extracts world changes from narrative (95%+ accuracy)
- [ ] World Inspector displays current scene and full world state
- [ ] Snapshots are created automatically after each turn
- [ ] User can rollback to any previous snapshot
- [ ] Relationships are visible and navigable in World Inspector
- [ ] Emergent distances are tracked and included in context
- [ ] No race conditions or state corruption during analysis
- [ ] System scales to 100+ locations, 50+ characters without performance degradation

---

## Notes
- This plan prioritizes **simplicity** and **robustness** over advanced features
- The system is **stateless** from the LLM's perspective (only last 2 messages)
- The system is **stateful** from the application's perspective (persistent world data)
- The dual-LLM approach ensures **narrative quality** (prose model) + **reliable parsing** (editor model)

