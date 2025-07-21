# Overview Board Feature Implementation Plan

## Overview

The Overview Board provides users with a visual graph representation of narrative elements across a selected project layer. It uses a 3-cloud visualization approach with movable items and connections to show relationships between events, characters, and places.

**🔄 ARCHITECTURE DECISION: Reuse IdeaBoard Infrastructure**

After examining the existing IdeaBoard implementation, we can reuse significant portions of the infinite canvas infrastructure for better code integration and maintainability.

## Shared Infrastructure Reuse

### ✅ Components to Reuse Directly
- **`Viewport`** (`src/idea-board/rendering/Viewport.ts`) - Complete reuse for camera/zoom
- **`InputManager`** (`src/idea-board/interaction/InputManager.ts`) - Complete reuse for mouse/touch
- **`Point` & `Size` types** (`src/idea-board/types/BoardTypes.ts`) - Already compatible
- **Canvas rendering patterns** - Animation loop, layering, transform management

### 🔄 Components to Adapt
- **`BoardElement` interface** - Extend for Overview Board specific elements
- **Rendering pipeline** - Adapt layering for 3-cloud visualization
- **Interaction patterns** - Adapt for Overview Board specific interactions

### 🆕 Components to Create
- **Overview Board specific elements** (EventNode, CharacterNode, PlaceNode)
- **Cloud regions** and **connection rendering**
- **Overview Board specific UI** and **controls**

## Updated Architecture

### Shared Canvas Infrastructure
```
src/idea-board/
├── rendering/
│   └── Viewport.ts              # ✅ REUSE - Camera/zoom management
├── interaction/
│   └── InputManager.ts          # ✅ REUSE - Mouse/touch handling  
├── types/
│   └── BoardTypes.ts            # ✅ REUSE - Point, Size, base interfaces
```

### Overview Board Components
```
src/overview-board/
├── index.ts                     # Main exports ✅ DONE
├── OverviewAnalysisService.ts   # AI content analysis ✅ DONE
├── OverviewBoardModal.ts        # Main UI modal
├── rendering/
│   └── OverviewRenderer.ts      # 3-cloud renderer with IdeaBoard integration ✅ DONE
├── elements/
│   ├── OverviewElementBase.ts   # Base element class ✅ DONE
│   ├── EventNode.ts            # Event visualization element ✅ DONE
│   ├── CharacterNode.ts        # Character visualization element ✅ DONE
│   └── PlaceNode.ts            # Place visualization element ✅ DONE
├── types/
│   ├── OverviewTypes.ts        # Core data types ✅ DONE
│   └── GraphTypes.ts           # Rendering types ✅ DONE
└── utils/
    └── DataConverter.ts         # AI data to visual elements converter ✅ DONE

# Shared Infrastructure (Reused from IdeaBoard): ✅ DONE
├── idea-board/rendering/Viewport.ts      # Camera/zoom management
├── idea-board/interaction/InputManager.ts # Mouse/touch handling
└── idea-board/types/BoardTypes.ts        # Base types

# Prompts managed in src/PromptManager.ts ✅ DONE
# UI integration in src/ui/project-ui.ts ✅ DONE
```

## Visualization Design

### Three-Cloud Graph Layout

```
    🔵 EVENTS CLOUD          🟢 CHARACTERS CLOUD
    ┌─────────────────┐      ┌─────────────────┐
    │  ○ Wedding      │      │  ○ Alice        │
    │     ╲           │      │     ╱           │
    │      ╲          │ ──── │    ╱ ○ Bob      │
    │  ○ Battle ────────────── │ ╱              │
    │       ╱         │      │╱  ○ Charlie     │
    │      ╱          │      └─────────────────┘
    │  ○ Coronation   │              │
    └─────────────────┘              │
            │                        │
            │         🟠 PLACES CLOUD │
            │         ┌─────────────────┐
            └──────── │  ○ Castle       │
                      │     ╲           │
                      │      ○ Forest   │
                      │         ╱       │
                      │        ╱        │
                      │    ○ Village    │
                      └─────────────────┘
```

### Visual Properties

**Cloud Colors & Styling:**
- **Events Cloud** (🔵): `#3B82F6` (Blue) - Action-oriented
- **Characters Cloud** (🟢): `#10B981` (Green) - Life/people
- **Places Cloud** (🟠): `#F59E0B` (Amber) - Environmental

**Item Styling:**
- Circular nodes with cloud-specific background colors
- White text with shadow for readability
- Hover effects and selection highlighting
- Size based on significance (major/minor)

**Connection Lines:**
- Dynamic curves between connected items
- Color matches the source item's cloud
- Animated when hovering over items
- Thickness indicates relationship strength

### Interactive Features

1. **Drag & Drop**: All items freely movable within and between clouds (reusing IdeaBoard patterns)
2. **Hover Effects**: Highlight item and its connections
3. **Click Actions**: Select item for details/editing
4. **Zoom & Pan**: Navigate large relationship networks (reusing Viewport)
5. **Cloud Collapse**: Minimize clouds to focus on specific types

## Implementation Phases - UPDATED

### Phase 1: AI Analysis Foundation ✅ DONE
**Goal:** Build content analysis and data extraction

✅ **Completed:**
- Analysis Service with PromptManager integration
- AI prompt for narrative element extraction
- Layer detection and content aggregation
- UI button and basic testing interface

### Phase 2: Shared Canvas Foundation ✅ DONE
**Goal:** Create Overview Board renderer using IdeaBoard infrastructure

✅ **Completed:**
1. **Graph Types** (`src/overview-board/types/GraphTypes.ts`)
   - Extended BoardElement for Overview Board elements
   - Defined cloud region and connection interfaces
   - Element positioning and styling types

2. **Overview Elements** (`src/overview-board/elements/`)
   - `OverviewElementBase.ts` - Base class with IdeaBoard patterns
   - `EventNode.ts` - Event visualization with icons and text wrapping
   - `CharacterNode.ts` - Character visualization with role-based icons
   - `PlaceNode.ts` - Place visualization with type-based icons

3. **Cloud Renderer** (`src/overview-board/rendering/OverviewRenderer.ts`)
   - Reused Viewport for camera management
   - Implemented 3-cloud layout system (Events, Characters, Places)
   - Element rendering with proper layering (clouds → connections → elements)
   - Connection curve drawing with quadratic bezier curves
   - Full interaction support (drag, hover, select, zoom, pan)

4. **Data Converter** (`src/overview-board/utils/DataConverter.ts`)
   - Converts AI analysis data to visual elements
   - Automatic element positioning within clouds
   - Connection generation based on relationships
   - Circular layout algorithms

### Phase 3: Overview Board Modal ✅ DONE
**Goal:** Complete UI integration and user interactions

✅ **Completed:**
1. **Overview Board Modal** (`src/overview-board/OverviewBoardModal.ts`)
   - Extended BaseModal pattern with proper structure
   - Integrated analysis service, renderer, and data converter
   - Layer selection interface with auto-detection
   - Canvas container with proper sizing and styling
   - Toolbar with refresh, export, and status display
   - Professional modal styling with responsive layout

2. **UI Integration** (`src/ui/project-ui.ts`)
   - Small icon button (📊) placed left of actions dropdown as requested
   - Uses selected node as root for analysis (not project root)
   - Proper error handling and user feedback
   - Integration with existing Expert modal system

3. **Full Workflow**
   - Click Overview Board button on any selected node
   - Automatic layer detection from selected node downward
   - Layer selection dropdown with node counts
   - Smart caching system - only re-analyzes if content changed
   - Real-time AI analysis with progress indicators
   - Interactive 3-cloud visualization with zoom/pan/drag
   - Canvas export functionality
   - Element selection and details on double-click

4. **Smart Caching System** ✅ DONE
   - Analysis results cached per layer in triggering node
   - Timestamp-based invalidation checks all analyzed nodes
   - Multiple analyses per node (one per template layer)
   - "cached" indicator in status messages
   - Automatic cache persistence in project files
   - Cache survives page refreshes (F5) and app restarts
   - Cache management UI with clear cache button
   - Robust cache deserialization with Date object restoration
   - Proper Map object serialization/deserialization
   - Backward compatibility for existing cache formats
   - **FAIL LOUDLY approach**: No silent error handling or defensive programming
   - Strict validation of all cache data structures with detailed error messages
   - Critical error detection with user alerts and clear remediation steps
   - Array property validation during cache restoration (connectedCharacters, etc.)
   - Runtime data structure validation in DataConverter with specific error messages

5. **Coordinate System Fix** ✅ DONE
   - Fixed coordinate mismatch between DataConverter and OverviewRenderer
   - Elements now properly positioned inside their cloud circles
   - Dynamic positioning based on canvas dimensions
   - Eliminated leftward bias in element placement
   - **Perfect alignment**: DataConverter now uses exact coordinates from OverviewRenderer
   - Added getCloudCenters() and getCloudRadius() methods to OverviewRenderer
   - Eliminated coordinate calculation drift between rendering and positioning
   - **Simplified positioning**: Removed random radius variation for consistent alignment
   - Elements positioned at fixed 50% of cloud radius for perfect centering
   - **Position interpretation fix**: Convert center positions to top-left positions
   - Account for element size (80px major, 60px minor) in position calculations
   - Perfect alignment achieved by offsetting positions by half element size
   - **Focus/fade effect**: Selected node and connected nodes stay fully visible (opacity 1.0)
   - Unconnected nodes fade to 30% opacity for visual focus
   - Connections also fade based on relationship to selected element
   - **Enhanced visual design**: Cloud circles increased 50% (120px → 180px radius)
   - **Restored natural positioning**: Added deterministic randomness for organic layout
   - Elements positioned with ±20% radius variation and ±30° angle variation
   - **Integrated panning**: Middle mouse button or Ctrl+click for smooth viewport navigation
   - Spacebar for temporary pan mode cursor (grab/default toggle)
   - Natural "grab and drag" feeling with content following cursor movement
   - **Proper placeholder service integration**: Uses global `{{language}}` placeholder
   - Centralized placeholder expansion through PromptExpansionService
   - Consistent with rest of Expert application placeholder handling
   - **Fixed context structure**: Provides proper node context for `{{content}}` placeholder
   - Resolves placeholder conflicts between context and custom placeholder types
   - **Fixed global keyboard interference**: Space key no longer blocked in text inputs
   - Scoped keyboard shortcuts to canvas focus for both Overview Board and Idea Board
   - Preserves copy/paste functionality while allowing normal text editing
   - **Fixed web search profile isolation**: Web search settings now ONLY stored in profiles
   - Removed global web search storage entirely - single source of truth
   - Each profile maintains independent web search settings
   - **Fixed profile switching**: All profile switch methods now reload web search settings
   - Settings modal, profile dropdown, and profile services properly load web search per profile
   - No more cross-contamination between profiles

### Phase 4: Smart Renaming (Week 4)
**Goal:** Implement intelligent character renaming system

### Phase 5: Polish & Integration (Week 5)
**Goal:** Complete integration and user experience polish

## Technical Implementation Details

### Reusing IdeaBoard Patterns

**Canvas Setup:**
```typescript
// Reuse existing Viewport
import { Viewport } from '../idea-board/rendering/Viewport';
import { InputManager } from '../idea-board/interaction/InputManager';

export class OverviewRenderer {
  private viewport: Viewport;
  private inputManager: InputManager;
  
  constructor(canvas: HTMLCanvasElement) {
    this.viewport = new Viewport(canvas.width, canvas.height);
    this.inputManager = new InputManager(canvas);
    this.setupEventHandlers();
  }
}
```

**Element Interface:**
```typescript
// Extend existing BoardElement pattern
import type { BoardElement, Point, Size } from '../idea-board/types/BoardTypes';

export interface OverviewElement extends BoardElement {
  cloudType: 'events' | 'characters' | 'places';
  significance: 'major' | 'minor';
  connections: string[]; // Connected element IDs
}
```

**Rendering Pipeline:**
```typescript
// Follow IdeaBoard rendering patterns
private render(): void {
  if (!this.needsRedraw) return;

  // Clear canvas (reuse pattern)
  this.context.save();
  this.context.setTransform(1, 0, 0, 1, 0, 0);
  this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  this.context.restore();

  // Draw clouds (bottom layer)
  this.renderCloudRegions();
  
  // Draw connections (middle layer)  
  this.renderConnections();
  
  // Draw elements (top layer)
  this.renderElements();
  
  this.needsRedraw = false;
}
```

### Integration Points

**Main Interface Addition:**
- Add "📊 Overview Board" button to action bar ✅ DONE
- Integrate with existing modal system
- Layer selection from tree view

**AI Service Integration:**
- Use existing `OpenRouterClient` ✅ DONE
- Leverage `PromptManager` integration ✅ DONE
- Follow existing AI interaction patterns

**Project System Integration:**
- Use `OverviewAnalysisService` for layer navigation ✅ DONE
- Integrate with `DocumentNode` content ✅ DONE
- Follow existing persistence patterns

### AI Prompt Strategy

**Prompts are now managed through PromptManager** (`src/PromptManager.ts`) ✅ DONE

The `overview_board_analysis` prompt has been integrated into the Expert application's centralized prompt management system. This ensures:

- **Consistency**: All prompts follow the same management patterns
- **Settings Integration**: Prompts can be customized through the settings interface
- **Version Control**: Prompt changes are tracked with the application
- **Language Support**: Automatic language parameter handling

**Usage in OverviewAnalysisService:**
```typescript
const prompts = this.settingsManager.getPrompts();
const analysisPrompt = prompts.overview_board_analysis
  .replace(/\{\{layer_name\}\}/g, layerName)
  .replace(/\{\{content\}\}/g, content)
  .replace(/\{\{language\}\}/g, language);
```

The prompt extracts narrative elements with the same JSON structure as originally planned, but now integrates seamlessly with Expert's existing AI infrastructure.

## Success Metrics

### User Experience Goals
- **Quick Analysis**: Generate overview in <30 seconds
- **Intuitive Interaction**: Users can manipulate graph immediately (reusing IdeaBoard UX)
- **Clear Visualization**: Relationships obvious at a glance
- **Smooth Renaming**: Character updates work without confusion

### Technical Goals
- **Performance**: Handle 50+ items smoothly (leveraging IdeaBoard optimizations)
- **Accuracy**: 90%+ correct element extraction
- **Reliability**: No data loss during operations
- **Integration**: Seamless with existing Expert workflow
- **Code Reuse**: 70%+ infrastructure shared with IdeaBoard

## Benefits of IdeaBoard Integration

### ✅ **Code Reuse & Maintainability**
- Shared infrastructure reduces duplication
- Proven canvas rendering system
- Consistent interaction patterns across features
- Single source of truth for viewport management

### ✅ **Performance & Reliability**
- Tested infinite canvas implementation
- Optimized rendering pipeline
- Robust event handling
- Memory efficient element management

### ✅ **User Experience Consistency**
- Familiar interaction patterns for users
- Consistent zoom/pan behavior
- Shared keyboard shortcuts
- Unified visual language

## Next Steps

1. **✅ Phase 1 Complete** - AI Analysis Foundation with PromptManager integration
2. **✅ Phase 2 Complete** - Shared Canvas Foundation with IdeaBoard integration
3. **✅ Phase 3 Complete** - Overview Board Modal with full UI integration
4. **🔄 Phase 4 Next** - Smart Renaming system for character/place names
5. **⏳ Phase 5 Final** - Polish, optimization, and advanced features

**🎉 OVERVIEW BOARD IS FUNCTIONAL!** 
The core visualization is complete and ready for use. Users can now:
- Select any node in their project
- Click the 📊 icon button next to Actions
- Choose a layer to analyze (chapters, scenes, etc.)
- View a beautiful 3-cloud visualization of events, characters, and places
- Interact with elements through zoom, pan, drag, and selection
- Export visualizations as PNG images

Ready for Phase 4: Smart Renaming! 🚀 