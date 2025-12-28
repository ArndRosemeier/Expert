# RPG System

A complete roleplaying game system with dual-LLM workflow, persistent world state, and intelligent context construction.

## Quick Start

1. Click the RPG Mode button (🎲) in the main interface
2. Create a new session or load an existing one
3. Define your starting location and player character
4. Start playing!

## Architecture Overview

### Dual-LLM Workflow

**Game LLM (Narrator)**
- Generates immersive narrative responses
- Uses prose model by default
- Context includes: current location, present characters, relevant lore, known distances

**State Parser LLM (Parser)**
- Extracts structured world state changes from narrative
- Uses editor model by default
- Runs asynchronously in the background
- Outputs XML with entity updates, relationships, distances

### World State

**Entities:**
- **Locations**: Places with descriptions and flexible JSON state
- **Characters**: NPCs and players with attributes and state
- **Lore**: Background information and world-building details

**Relationships:**
- Graph-based connections between entities
- Types: friend, enemy, knows, located_at, related_to, etc.
- Used for intelligent context inclusion

**Distances:**
- Emergent tracking from narrative mentions
- Maintains geographic consistency
- Included in context to prevent contradictions

### Intelligent Context Construction

**Last 2 Messages:**
- Recent conversational continuity
- User's last action + LLM's last response

**World State:**
- Current location (description + state)
- Characters present (via located_at relationships)
- Player character (description + state)

**Graph Traversal:**
- BFS algorithm includes related entities (depth 2)
- Example: If NPC has a "friend" relationship, that friend's knowledge is included

**Known Distances:**
- Distances from current location to other locations
- Prevents inconsistencies in travel time

### State Management

**Locking Mechanism:**
- State locked during LLM interaction
- Prevents race conditions
- Unlocked after analysis complete

**Async Analysis:**
- User can type while analysis runs
- Submission waits for analysis completion
- Ensures next turn uses updated state

**Move-by-Move Snapshots:**
- Automatic save after each turn
- Rollback to any previous state
- Age-based cleanup available

## Directory Structure

```
src/rpg/
├── types/
│   └── RPGTypes.ts                    # Core type definitions
├── services/
│   ├── RPGPlaceholderService.ts       # Prompt placeholder registration
│   ├── WorldStateService.ts           # CRUD + Snapshots + Locking
│   ├── RPGContextBuilder.ts           # Context construction
│   ├── RPGStateParser.ts              # XML parsing
│   └── RPGInteractionService.ts       # Dual-LLM orchestration
└── ui/
    ├── RPGView.ts                     # Main interface
    ├── RPGConversationPanel.ts        # Chat interface
    ├── RPGWorldInspector.ts           # World viewer (Scene/World)
    ├── RPGSnapshotManager.ts          # Snapshot management
    └── rpg-styles.css                 # Complete styling
```

## API Usage

### Create a New Session

```typescript
const worldState = worldStateService.createEmptyWorldState();

// Add starting location
worldStateService.createLocation(worldState, {
    id: 'tavern',
    name: 'The Golden Mug',
    description: 'A cozy tavern...',
    state: { crowded: true },
    createdTurn: 0,
    lastUsedTurn: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
});

// Add player character
worldStateService.createCharacter(worldState, {
    id: 'player',
    name: 'Adventurer',
    description: 'A brave soul...',
    state: { health: 100, gold: 50 },
    createdTurn: 0,
    lastUsedTurn: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
});

// Create relationship
worldStateService.createRelationship(worldState, {
    id: 'player_at_tavern',
    fromId: 'player',
    toId: 'tavern',
    kind: 'located_at',
    createdTurn: 0,
    lastUsedTurn: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
});

worldState.currentLocationId = 'tavern';
worldState.playerCharacterId = 'player';
```

### Send Player Action

```typescript
const response = await interactionService.sendPlayerAction(
    session,
    settingsManager,
    "I order a drink and ask the bartender about rumors.",
    (chunk) => {
        // Handle streaming chunks
        console.log(chunk);
    }
);

// Analysis runs in background
// User can type next action
// Submission waits for analysis completion
```

### Browse World State

```typescript
// Get all locations
const locations = worldStateService.listLocations(worldState);

// Get characters at location
const characterIds = worldStateService.getEntitiesAtLocation(worldState, 'tavern');

// Get related entities (BFS traversal)
const relatedIds = worldStateService.getRelatedEntities(worldState, 'player', 2);

// Get known distances
const distances = worldStateService.getKnownDistances(worldState, 'tavern');
```

### Manage Snapshots

```typescript
// Create snapshot
const snapshot = await worldStateService.createSnapshot(session, turnNumber);

// Restore snapshot
const restoredState = await worldStateService.restoreSnapshot(snapshotId);

// Delete old snapshots
await worldStateService.cleanupOldSnapshots(sessionId, maxAgeMs);
```

## Prompts

### rpg_game_narration_system
System prompt for Game LLM with placeholders:
- `{{rpg_current_location}}`
- `{{rpg_present_characters}}`
- `{{rpg_player_character}}`
- `{{rpg_relevant_lore}}`
- `{{rpg_recent_events}}`
- `{{rpg_known_distances}}`

### rpg_state_parser_system
System prompt for State Parser LLM with XML schema definition.

### rpg_state_parser_user
User prompt for State Parser LLM:
- `{{rpg_player_action}}`
- `{{rpg_gm_response}}`

## XML State Update Schema

```xml
<rpg_state_update>
  <locations>
    <location action="create|update">
      <id>location_id</id>
      <name>Location Name</name>
      <description>Description</description>
      <state>{"key": "value"}</state>
    </location>
  </locations>
  
  <characters>
    <character action="create|update">
      <id>character_id</id>
      <name>Character Name</name>
      <description>Description</description>
      <state>{"health": 100}</state>
    </character>
  </characters>
  
  <lore>
    <lore_item action="create|update">
      <id>lore_id</id>
      <title>Lore Title</title>
      <content>Lore content</content>
      <tags>tag1,tag2</tags>
    </lore_item>
  </lore>
  
  <relationships>
    <relationship action="create|update|delete">
      <from_id>entity1</from_id>
      <to_id>entity2</to_id>
      <type>friend</type>
      <description>Optional</description>
    </relationship>
  </relationships>
  
  <distances>
    <distance>
      <from_location_id>loc1</from_location_id>
      <to_location_id>loc2</to_location_id>
      <distance>5</distance>
      <unit>km</unit>
    </distance>
  </distances>
  
  <recent_events_summary>
    Brief summary of what happened
  </recent_events_summary>
  
  <player_location>
    <current_location_id>new_location</current_location_id>
  </player_location>
</rpg_state_update>
```

## Future Enhancements

- Entity editors (modal forms for manual editing)
- Relationship editor UI
- Import/Export game sessions
- Multi-player support
- Combat system with structured mechanics
- Quest tracking system
- Procedural generation
- Voice integration (TTS/STT)

## Documentation

- **Implementation Plan**: `RPG_System_Implementation_Plan.md`
- **Implementation Summary**: `RPG_System_Implementation_Summary.md`
- **TOC Entry**: `TOC.md` (search for "RPG System")

