# Idea Board Design Document

## Overview
An infinite canvas idea board with moveable post-it notes and integrated LLM chat functionality. This feature provides a visual brainstorming environment that complements the hierarchical document structure of the Expert application.

## All programming for this will be separate from Expert core functionality. No changes to core functionality because of this.

## Core Features

### 1. Infinite Canvas
- **Infinite scrolling/panning** in all directions
- **Multi-level zoom** (10% - 500% range)
- **Smooth animations** for pan/zoom operations
- **Grid overlay** (toggleable) for alignment assistance

### 2. Post-It Notes
- **Draggable sticky notes** with different colors
- **Resizable notes** with minimum/maximum size constraints
- **Color coding** (yellow, blue, green, pink, orange, white)
- **Grouping/clustering** with visual connection lines
- **Z-index management** (bring to front/send to back)

### 3. LLM Chat Integration
- **Floating chat panel** (collapsible, repositionable)
- **Node content and context insertable** (optionally including sub nodes)
- **Idea generation** - AI suggests related concepts
- **Board analysis** - AI analyzes existing notes and suggests connections
- **Export suggestions** - AI helps organize ideas into document structure

### 4. Collaboration & Persistence
- **Auto-save** board state on focus loss of input elements

## Technical Architecture

### Rendering Engine Choice: Canvas API
**Rationale:** 
- Performance: Direct pixel manipulation for smooth pan/zoom
- Flexibility: Custom rendering without DOM limitations
- Memory efficiency: Only visible elements need detailed rendering
- Cross-platform consistency

**Alternative considered:** SVG - Rejected due to performance issues with large numbers of elements

### Core Components

```typescript
// Main board engine
class IdeaBoard {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private viewport: Viewport;
  private elements: Map<string, BoardElement>;
  private selectionManager: SelectionManager;
  private chatInterface: ChatInterface;
}

// Viewport management
class Viewport {
  x: number; y: number;           // Camera position
  zoom: number;                   // Current zoom level
  width: number; height: number;  // Canvas dimensions
  
  screenToWorld(screenX: number, screenY: number): Point;
  worldToScreen(worldX: number, worldY: number): Point;
  isVisible(element: BoardElement): boolean;
}

// Base element interface
interface BoardElement {
  id: string;
  type: 'post-it' | 'connection-line' | 'group';
  position: Point;
  size: Size;
  zIndex: number;
  render(context: CanvasRenderingContext2D, viewport: Viewport): void;
  hitTest(point: Point): boolean;
  serialize(): ElementData;
}

// Post-it implementation
class PostItNote implements BoardElement {
  content: string;
  color: PostItColor;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  // ... implementation
}
```

### File Structure
```
src/
├── idea-board/
│   ├── index.ts                    // Main export
│   ├── IdeaBoard.ts               // Core board class
│   ├── rendering/
│   │   ├── Viewport.ts            // Camera/viewport management
│   │   ├── Renderer.ts            // Main rendering engine
│   │   └── TextRenderer.ts        // Text rendering utilities
│   ├── elements/
│   │   ├── BoardElement.ts        // Base element interface
│   │   ├── PostItNote.ts          // Post-it implementation
│   │   ├── ConnectionLine.ts      // Lines connecting elements
│   │   └── ElementGroup.ts        // Grouping functionality
│   ├── interaction/
│   │   ├── InputManager.ts        // Mouse/touch/keyboard input
│   │   ├── SelectionManager.ts    // Element selection logic
│   │   ├── DragManager.ts         // Drag and drop operations
│   │   └── ZoomManager.ts         // Pan and zoom controls
│   ├── persistence/
│   │   ├── BoardSerializer.ts     // Save/load board state
│   │   └── BoardMigration.ts      // Version compatibility
│   ├── chat/
│   │   ├── ChatInterface.ts       // Chat UI component
│   │   ├── IdeaAnalyzer.ts        // AI board analysis
│   │   └── IdeaGenerator.ts       // AI idea generation
│   └── ui/
│       ├── ToolPanel.ts           // Tool selection panel
│       ├── ColorPicker.ts         // Color selection
│       ├── Minimap.ts             // Navigation minimap
│       └── ExportModal.ts         // Export functionality
```

## User Interface Design

### Layout
```
┌─────────────────────────────────────────────────────┐
│ [File] [Edit] [View] [Tools]              [?] [×]   │ ← Menu bar
├─────────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           ┌───────┐ │
│ │ +   │ │ 🎨  │ │ 🔗 │ │ 📋  │    ...    │ Chat  │ │ ← Tool panel
│ └─────┘ └─────┘ └─────┘ └─────┘           └───────┘ │
├─────────────────────────────────────────────────────┤
│                                                     │
│              INFINITE CANVAS AREA                   │
│                                                     │
│    ┌─────────┐      ┌─────────┐                     │
│    │ Post-it │      │ Post-it │                     │
│    │ Note 1  │  ──  │ Note 2  │                     │
│    └─────────┘      └─────────┘                     │
│                                                     │
│                     ┌─────────┐                     │
│                     │ Post-it │                     │
│                     │ Note 3  │                     │
│                     └─────────┘                     │
├─────────────────────────────────────────────────────┤
│ Zoom: 100% | Position: (0, 0) | Elements: 3         │ ← Status bar
└─────────────────────────────────────────────────────┘

┌─────────────────┐ ← Floating chat panel (draggable)
│ 💬 AI Assistant │
├─────────────────┤
│ Analyze this    │
│ board and       │
│ suggest themes  │
├─────────────────┤
│ [Send] [Clear]  │
└─────────────────┘
```

### Tool Panel Icons & Functions
- **➕ Add Post-it** - Create new sticky note
- **🎨 Colors** - Color picker for notes
- **🔗 Connect** - Draw connection lines between notes
- **📋 Text** - Text formatting options
- **🔍 Search** - Find notes by content
- **📁 Export** - Export board or selection
- **⚙️ Settings** - Board preferences

### Keyboard Shortcuts
- **Space + Drag** - Pan canvas
- **Ctrl + Scroll** - Zoom in/out
- **Ctrl + A** - Select all notes
- **Delete** - Remove selected notes
- **Ctrl + Z/Y** - Undo/Redo
- **Ctrl + C/V** - Copy/Paste notes
- **F** - Fit all content in view
- **G** - Toggle grid
- **Tab** - Cycle through notes

## Data Models

### Board State
```typescript
interface IdeaBoardState {
  id: string;
  name: string;
  projectId?: string;
  created: Date;
  lastModified: Date;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  elements: ElementData[];
  connections: ConnectionData[];
  metadata: {
    version: string;
    totalElements: number;
    bounds: BoundingRect;
  };
}

interface ElementData {
  id: string;
  type: 'post-it' | 'text-box' | 'image';
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  content: string;
  style: {
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
  };
  metadata: {
    created: Date;
    lastEdited: Date;
    tags?: string[];
  };
}

interface ConnectionData {
  id: string;
  fromElementId: string;
  toElementId: string;
  style: {
    color: string;
    thickness: number;
    lineType: 'straight' | 'curved' | 'step';
  };
}
```

## LLM Integration Points

### 1. Idea Generation
**Prompt Templates:**
```typescript
const IDEA_GENERATION_PROMPTS = {
  brainstorm: "Based on these existing ideas: {existingNotes}, generate 5 related concepts for brainstorming about {topic}",
  expand: "Take this idea: '{selectedNote}' and suggest 3-4 ways to develop it further",
  connect: "Looking at these two ideas: '{noteA}' and '{noteB}', suggest how they might relate or combine"
};
```

### 2. Board Analysis
**Analysis Features:**
- **Theme Detection** - Identify common themes across notes
- **Grouping Suggestions** - Suggest which notes should be grouped
- **Gap Analysis** - Identify missing concepts or connections
- **Priority Ranking** - Help prioritize ideas based on criteria

### 3. Export Intelligence
**Smart Export Options:**
- **Outline Generation** - Convert spatial layout to hierarchical structure
- **Report Creation** - Generate written summary of board content
- **Action Items** - Extract actionable items from ideas
- **Mind Map Export** - Convert to traditional mind map format

## Performance Considerations

### Rendering Optimization
- **Viewport Culling** - Only render visible elements
- **Level of Detail** - Simplified rendering when zoomed out
- **Dirty Region Tracking** - Only redraw changed areas
- **Animation Frame Management** - Smooth 60fps animations

### Memory Management
- **Element Pooling** - Reuse element objects to reduce GC
- **Lazy Loading** - Load element details on demand
- **Efficient Storage** - Minimize memory footprint of data structures

### Large Board Handling
- **Spatial Indexing** - Quadtree for fast spatial queries
- **Progressive Loading** - Stream elements as user navigates
- **Compression** - Compress board data for storage/transfer

## Integration with Expert App

### Project Linking
- **Board Creation** - Create boards within project context
- **Content Export** - Export board content to document nodes
- **Reference Links** - Link post-its to specific document sections

### Storage Integration
- **Unified Storage** - Use existing IndexedDB infrastructure
- **Backup/Sync** - Include boards in project backup/restore
- **Version Control** - Track board changes alongside document changes

### UI Integration
- **Navigation** - Access boards from project menu
- **Modal/Panel** - Open boards in overlay or dedicated view
- **Notifications** - Show board updates in notification system

## Development Phases

### Phase 1: Core Canvas (Week 1-2)
- [ ] Basic canvas setup with pan/zoom
- [ ] Simple post-it creation and editing
- [ ] Basic persistence to localStorage
- [ ] Mouse interaction (click, drag, select)

### Phase 2: Advanced Features (Week 3-4)
- [ ] Color coding and styling options
- [ ] Search functionality

### Phase 3: LLM Integration (Week 5-6)
- [ ] Chat interface implementation
- [ ] Basic idea generation prompts
- [ ] Board analysis features
- [ ] Export intelligence

### Phase 4: Polish & Integration (Week 7-8)
- [ ] Performance optimization
- [ ] Integration with main Expert app
- [ ] Advanced export options
- [ ] User testing and refinement

## Open Questions for Iteration

1. **Canvas Size Limits**: Should we impose any practical limits on canvas size? No.
2. **Collaborative Features**: Future support for real-time collaboration? No.
3. **Mobile Support**: Touch interface considerations for tablets? No.
4. **Template System**: Pre-built board templates for common use cases? Not yet.
5. **Advanced Elements**: Support for images, shapes, or other element types? Not yet.
6. **Integration Depth**: How tightly should boards integrate with document editing? Losely, read only at the start.

## Technology Dependencies

### New Dependencies
- **None required** - Uses native Canvas API and existing infrastructure

### Existing Dependencies Leveraged
- **OpenRouterClient** - For LLM integration
- **ProjectManager** - For project context and storage
- **EventEmitter** - For component communication
- **IndexedDBService** - For persistence

## Success Metrics

### User Experience
- **Smooth Performance** - 60fps pan/zoom with 100+ elements (low prio, just needs to be usable)
- **Quick Loading** - Board loads in <2 seconds
- **Intuitive Interaction** - New users can create first post-it in <30 seconds

### Technical Quality
- **Cross-browser Compatibility** - Works on Chrome, Firefox, Safari, Edge

This design provides a solid foundation for an innovative idea board feature. What aspects would you like to discuss or modify? 