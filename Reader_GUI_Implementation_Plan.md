# Reader GUI Implementation Plan

## Overview

A clean, distraction-free reading interface that presents hierarchical content in a readable format. The interface is content-agnostic and works with any project structure (books, manuals, reports, etc.).

## Core Features

### Content Display Strategy
- **Finished Projects**: Display all leaf nodes (deepest available content) in document order
- **Unfinished Projects**: Display nodes at the deepest available level for each branch
- **Content-Agnostic**: Works with any hierarchy (Book→Chapter→Scene, Manual→Section→Topic, etc.)

### Visual Hierarchy System
- **6-Level Color Gradient**: Background colors indicating hierarchy depth (0-5+)
- **Content Separators**: Visual indicators when transitioning between different nodes
- **Typography Scaling**: Headers scale based on hierarchy level

### Interactive Features
- **Double-Click Navigation**: Double-click any text to jump to that node in the main editor
- **Smooth Scrolling**: Fluid navigation between sections
- **Responsive Design**: Works on all screen sizes

## Technical Architecture

### File Structure
```
src/ui/
├── reader-gui.ts          # Main reader interface controller
├── reader-renderer.ts     # Content rendering and layout
└── reader-styles.ts       # CSS generation and theming
```

### Core Classes

#### `ReaderGUI`
- Main interface controller
- Manages reader state and navigation
- Handles user interactions

#### `ReaderRenderer`
- Renders hierarchical content to HTML
- Applies hierarchy-based styling
- Generates content separators

#### `ReaderStyles`
- Manages CSS generation
- Handles color schemes
- Responsive design utilities

## Implementation Phases

### Phase 1: Core Reader Structure (2-3 hours)

#### Files to Create:
- `src/ui/reader-gui.ts`
- `src/ui/reader-renderer.ts`
- `src/ui/reader-styles.ts`

#### Key Components:

**1. ReaderGUI Class**
```typescript
class ReaderGUI {
  private projectManager: ProjectManager
  private container: HTMLElement
  private renderer: ReaderRenderer
  
  // Core methods
  public render(): void
  public refresh(): void
  public scrollToNode(nodeId: string): void
  private handleDoubleClick(event: MouseEvent): void
}
```

**2. Content Analysis**
```typescript
interface ContentNode {
  id: string
  title: string
  content: string
  level: number
  isLeaf: boolean
  hasContent: boolean
  position: number  // Reading order position
}

function analyzeProjectContent(project: ProjectManager): ContentNode[]
```

**3. Hierarchy Color System**
```typescript
const HIERARCHY_COLORS = [
  '#ffffff',  // Level 0: Pure white
  '#fafafa',  // Level 1: Very light gray
  '#f5f5f5',  // Level 2: Light gray
  '#f0f0f0',  // Level 3: Medium light gray
  '#ebebeb',  // Level 4: Slightly darker
  '#e6e6e6'   // Level 5+: Darkest in series
]
```

#### Deliverables:
- Basic reader interface with hierarchy colors
- Content analysis function
- Simple content rendering

### Phase 2: Content Rendering and Separators (2-3 hours)

#### Key Features:

**1. Content Separator System**
```typescript
interface SeparatorConfig {
  fromLevel: number
  toLevel: number
  style: 'major' | 'minor' | 'section'
}

function generateSeparator(config: SeparatorConfig): HTMLElement
```

**2. Typography System**
```typescript
interface TypographyConfig {
  level: number
  fontSize: string
  fontWeight: string
  marginTop: string
  marginBottom: string
}

const TYPOGRAPHY_SCALE: TypographyConfig[]
```

**3. Content Rendering**
```typescript
class ReaderRenderer {
  public renderContent(nodes: ContentNode[]): HTMLElement
  private renderNode(node: ContentNode): HTMLElement
  private renderSeparator(fromLevel: number, toLevel: number): HTMLElement
  private applyHierarchyStyles(element: HTMLElement, level: number): void
}
```

#### Separator Types:
- **Major Separators**: Between top-level sections (thick lines, more spacing)
- **Minor Separators**: Between sub-sections (thin lines, less spacing)
- **Section Breaks**: Simple spacing for scene/paragraph transitions

#### Deliverables:
- Complete content rendering system
- Visual separators between content sections
- Typography scaling based on hierarchy

### Phase 3: Double-Click Navigation (1-2 hours)

#### Key Features:

**1. Click Position Mapping**
```typescript
interface ClickMapping {
  nodeId: string
  startPosition: number
  endPosition: number
}

function buildClickMappings(content: HTMLElement): ClickMapping[]
```

**2. Navigation System**
```typescript
class NavigationHandler {
  private clickMappings: ClickMapping[]
  
  public handleDoubleClick(event: MouseEvent): string | null
  public scrollToNode(nodeId: string): void
  private findNodeAtPosition(clickPosition: number): string | null
}
```

**3. Integration with Main UI**
```typescript
// In reader-gui.ts
private handleDoubleClick(event: MouseEvent): void {
  const nodeId = this.navigationHandler.handleDoubleClick(event)
  if (nodeId) {
    this.onNavigateToNode(nodeId) // Callback to main UI
  }
}
```

#### Technical Approach:
- Use `document.caretPositionFromPoint()` to get click position
- Map DOM positions to node IDs
- Trigger navigation callback to main editor interface

#### Deliverables:
- Double-click detection and mapping
- Seamless navigation to main editor
- Position-based node identification

### Phase 4: Reading Experience Enhancements (2-3 hours)

#### Key Features:

**1. Reading Controls**
```typescript
interface ReaderControls {
  fontSize: number
  lineHeight: number
  maxWidth: number
  theme: 'light' | 'dark' | 'sepia'
}

class ReaderControls {
  public adjustFontSize(delta: number): void
  public setLineHeight(value: number): void
  public setMaxWidth(value: number): void
  public setTheme(theme: string): void
}
```

**2. Table of Contents**
```typescript
interface TOCEntry {
  nodeId: string
  title: string
  level: number
  position: number
}

class TableOfContents {
  public generate(nodes: ContentNode[]): TOCEntry[]
  public render(): HTMLElement
  public scrollToEntry(nodeId: string): void
}
```

**3. Progress Tracking**
```typescript
class ReadingProgress {
  public getCurrentPosition(): number
  public getTotalLength(): number
  public getProgressPercentage(): number
  public setPosition(position: number): void
}
```

#### UI Components:
- Floating controls panel
- Collapsible table of contents
- Progress indicator
- Theme switcher

#### Deliverables:
- Reading customization controls
- Table of contents with navigation
- Reading progress tracking

### Phase 5: Export and Integration (1-2 hours)

#### Key Features:

**1. Export Functionality**
```typescript
class ReaderExporter {
  public exportToHTML(): string
  public exportToPDF(): void
  public exportToMarkdown(): string
  public preparePrintView(): void
}
```

**2. Integration with Main UI**
```typescript
// Add to main navigation
function openReaderView(project: ProjectManager): void
function closeReaderView(): void
function toggleReaderView(): void
```

**3. URL State Management**
```typescript
// Support for bookmarkable reading positions
function updateURL(nodeId: string, position: number): void
function restoreFromURL(): { nodeId: string, position: number }
```

#### Deliverables:
- Export functionality (HTML, PDF, Markdown)
- Integration with main application
- URL-based position bookmarking

## Data Structures

### ContentNode Interface
```typescript
interface ContentNode {
  id: string
  title: string
  content: string
  level: number
  isLeaf: boolean
  hasContent: boolean
  position: number
  wordCount: number
  estimatedReadingTime: number
}
```

### ReaderConfig Interface
```typescript
interface ReaderConfig {
  showTOC: boolean
  fontSize: number
  lineHeight: number
  maxWidth: number
  theme: 'light' | 'dark' | 'sepia'
  separatorStyle: 'minimal' | 'standard' | 'bold'
}
```

### ClickMapping Interface
```typescript
interface ClickMapping {
  nodeId: string
  element: HTMLElement
  startOffset: number
  endOffset: number
}
```

## CSS Architecture

### Hierarchy Color System
```css
.reader-content[data-level="0"] { background-color: #ffffff; }
.reader-content[data-level="1"] { background-color: #fafafa; }
.reader-content[data-level="2"] { background-color: #f5f5f5; }
.reader-content[data-level="3"] { background-color: #f0f0f0; }
.reader-content[data-level="4"] { background-color: #ebebeb; }
.reader-content[data-level="5"] { background-color: #e6e6e6; }
```

### Typography Scale
```css
.reader-title[data-level="0"] { font-size: 2.5rem; }
.reader-title[data-level="1"] { font-size: 2rem; }
.reader-title[data-level="2"] { font-size: 1.75rem; }
.reader-title[data-level="3"] { font-size: 1.5rem; }
.reader-title[data-level="4"] { font-size: 1.25rem; }
.reader-title[data-level="5"] { font-size: 1.1rem; }
```

### Separator Styles
```css
.reader-separator.major { 
  border-top: 3px solid #ddd; 
  margin: 3rem 0; 
}
.reader-separator.minor { 
  border-top: 1px solid #eee; 
  margin: 2rem 0; 
}
.reader-separator.section { 
  margin: 1.5rem 0; 
}
```

## Integration Points

### Main Application
- Add "Reader View" button to project toolbar
- Integrate with existing project state management
- Handle navigation between reader and editor modes

### Event System
- `reader:open` - Reader view opened
- `reader:close` - Reader view closed
- `reader:navigate` - User double-clicked to navigate
- `reader:export` - Content exported

### State Management
- Reading position persistence
- Reader preferences storage
- Integration with existing project storage

## Testing Strategy

### Unit Tests
- Content analysis function
- Hierarchy color application
- Click position mapping
- Export functionality

### Integration Tests
- Reader-to-editor navigation
- Project state synchronization
- Export format validation

### User Experience Tests
- Reading flow on different screen sizes
- Double-click accuracy
- Performance with large documents

## Performance Considerations

### Optimization Strategies
- Efficient DOM manipulation
- CSS-based styling (avoid inline styles)
- Event delegation for click handling
- Minimal re-rendering on updates

### Memory Management
- Clean up event listeners
- Efficient content caching
- Avoid memory leaks in long reading sessions

## Accessibility Features

### Screen Reader Support
- Proper heading hierarchy
- ARIA labels for navigation
- Skip links for content sections

### Keyboard Navigation
- Tab navigation through sections
- Keyboard shortcuts for common actions
- Focus management

### Visual Accessibility
- High contrast mode support
- Scalable fonts
- Colorblind-friendly separators

## Future Enhancements

### Advanced Features
- Full-text search within reader
- Annotation system
- Reading speed tracking
- Offline reading support

### Collaboration Features
- Shared reading sessions
- Comment system
- Version comparison in reader

### Advanced Export
- EPUB generation
- Custom styling templates
- Batch export options

This implementation plan provides a solid foundation for building a sophisticated yet user-friendly reader interface that enhances the content consumption experience while maintaining seamless integration with the existing editing workflow. 