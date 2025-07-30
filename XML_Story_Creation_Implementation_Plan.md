# XML Story Creation System - Implementation Plan

## Overview

This document outlines the implementation plan for an innovative story creation system that combines conversational AI with structured data extraction. The system allows users to chat with an AI about their story ideas while the AI automatically extracts key story elements using embedded XML tags.

## Core Concept

- User engages in natural conversation with AI about their story
- AI responds in natural language but embeds XML tags for structured data extraction
- Parser extracts XML tags and displays them on a "story whiteboard"
- AI can request refreshed context via `</refresh>` tag to get current whiteboard state
- User sees only natural language; XML parsing happens transparently in background

## Phase 1: Core Foundation

### 1.1 XML Tag Definition

**Core Tag Set (Phase 1):**

```xml
<!-- Basic story elements -->
<character name="Character Name" description="Brief description" />
<location name="Location Name" description="Brief description" />
<item name="Item Name" description="Brief description" />
<plot_point description="Key plot development or event" />
<context description="General story context or background info" />

<!-- System commands -->
</refresh>  <!-- AI requests current whiteboard state -->
```

**Tag Rules:**
- Self-closing tags for entities (character, location, item)
- Content tags for narrative elements (plot_point, context)
- System commands use closing tag syntax
- All descriptions should be concise (1-2 sentences max)
- Names should be unique identifiers

### 1.2 System Prompt Development

**Location:** `src/xml-story-creation/prompts/XMLStoryCreationPrompt.ts`

**Key Requirements:**
- Establish AI's role as collaborative story development partner
- Define XML tag usage with clear examples
- Emphasize natural language flow with embedded structured data
- Specify when to use `</refresh>` (every 5-7 exchanges, when story gets complex)
- Include error handling for malformed XML

**Prompt Structure:**
```typescript
export const XML_STORY_CREATION_SYSTEM_PROMPT = {
    text: `You are a collaborative story development AI...`,
    placeholders: ['language', 'current_whiteboard', 'user_preferences'],
    description: "System prompt for XML-enabled story creation conversations"
};
```

### 1.3 XML Parser Implementation

**Location:** `src/xml-story-creation/parser/XMLStoryParser.ts`

**Responsibilities:**
- Extract XML tags from AI responses
- Validate XML structure and content
- Generate unique IDs for each extracted element
- **Mark AI Updates:** Flag new and updated elements for highlighting
- **Clear Previous Highlights:** Reset highlight flags from previous AI responses
- Return cleaned natural language text for user display
- Handle malformed XML gracefully

**Core Interface:**
```typescript
interface ParsedResponse {
    cleanedText: string;           // Natural language with XML removed
    extractedElements: StoryElement[];
    systemCommands: SystemCommand[];
    errors: ParseError[];
}

interface StoryElement {
    id: string;                    // Generated unique ID
    type: 'character' | 'location' | 'item' | 'plot_point' | 'context';
    name?: string;                 // For named entities
    description: string;
    timestamp: Date;
    sourceText: string;            // Original XML tag
    isHumanEdited: boolean;        // Track human modifications
    editHistory: EditRecord[];     // Track all changes
    lastEditTimestamp?: Date;      // When last edited by human
    isNewFromAI: boolean;          // True if created by AI in latest response
    isUpdatedByAI: boolean;        // True if modified by AI in latest response
    highlightUntilNext: boolean;   // Visual highlight until next user interaction
}

interface EditRecord {
    timestamp: Date;
    field: 'name' | 'description';
    oldValue: string;
    newValue: string;
    source: 'ai' | 'human';
}
```

### 1.4 Story Whiteboard Implementation

**Location:** `src/xml-story-creation/ui/StoryWhiteboard.ts`

**Dense UI Requirements:**
- **Full Vertical Space:** Utilize complete available window height efficiently
- **Compact Cards:** Small, information-dense element cards with minimal padding
- **Grouped Sections:** Collapsible sections by type (Characters, Locations, Items, Plot Points, Context)
- **Grid Layout:** CSS Grid or Flexbox for optimal space utilization
- **Scrollable Areas:** Independent scrolling for different element types
- **Inline Editing:** Click-to-edit functionality on all text fields
- **Quick Actions:** Edit, delete, and feedback buttons on each card

**Features:**
- Display extracted story elements as compact cards
- Group by type with collapsible sections
- Show timestamp and source context for each element
- **Human Editing:** Click-to-edit names and descriptions directly
- **Edit Tracking:** Visual indicators for human-modified elements
- **AI Feedback:** Automatic notification to AI when elements are edited
- Search/filter across all elements
- Export whiteboard as formatted text
- Real-time updates as XML is parsed

**UI Components:**
- WhiteboardContainer: Main layout with CSS Grid for dense packing
- ElementCard: Compact card design with inline editing capabilities
- EditableField: Click-to-edit text fields with save/cancel actions
- ElementTypeSection: Collapsible grouped sections with counts
- WhiteboardControls: Minimal search bar and filter toggles
- ElementTooltip: Hover details for truncated information
- EditIndicator: Visual markers for human-modified elements
- AIUpdateIndicator: Highlighting system for new/updated AI elements
- HighlightManager: Controls timing and clearing of AI highlights

### 1.5 Human Editing and AI Feedback System

**Location:** `src/xml-story-creation/ui/EditableElementCard.ts`

**Human Editing Features:**
- **Click-to-Edit:** Click any name or description field to edit inline
- **Auto-Save:** Changes saved automatically after 2-second delay or on blur
- **Visual Feedback:** Modified elements show orange border and edit icon
- **Edit History:** Track all changes with timestamps and sources
- **Undo Support:** Revert to previous AI-generated or human-edited versions

**AI Update Highlighting:**
- **New Elements:** AI-created elements show bright green border and "NEW" badge
- **Updated Elements:** AI-modified elements show blue border and "UPDATED" badge
- **Auto-Clear:** Highlights automatically clear when user sends next message
- **Smooth Transitions:** Fade animations when highlights appear/disappear
- **Multiple Updates:** Support multiple highlighted elements from single AI response

**AI Feedback Mechanism:**
- **Automatic Notification:** When user edits an element, system automatically adds feedback to chat context
- **Edit Context Injection:** Next AI response includes awareness of human changes
- **Batch Notifications:** Multiple edits grouped into single notification for efficiency
- **Edit Acknowledgment:** AI can acknowledge and respond to human modifications

**Feedback Format for AI:**
```
RECENT HUMAN EDITS TO WHITEBOARD:

The user has made the following changes since our last exchange:

CHARACTER EDIT (c_001 - Elara):
- Description changed from: "A skilled cartographer seeking her missing brother"
- Description changed to: "A skilled but anxious cartographer with trust issues, seeking her missing brother"

LOCATION EDIT (l_001 - Neo-Venice):
- Name changed from: "Venedig"
- Name changed to: "Neo-Venice"
- Description changed from: "A slowly sinking city of canals and secrets"
- Description changed to: "A cyberpunk city built on the ruins of Venice, with digital canals and AR overlays"

Please acknowledge these changes and incorporate them into our story development.
```

### 1.6 Context Refresh System

**Location:** `src/xml-story-creation/context/ContextManager.ts`

**Responsibilities:**
- Serialize current whiteboard state into AI-readable format
- Inject serialized context into conversation when `</refresh>` detected
- **Track Human Edits:** Monitor and queue human modifications for AI feedback
- **Inject Edit Notifications:** Automatically add human edit summaries to chat context
- Manage context window size to prevent token overflow
- Prioritize recent and important elements
- **Edit Batching:** Group multiple rapid edits into single notifications

**Context Format:**
```
CURRENT STORY WHITEBOARD:

CHARACTERS:
1. Elara (ID: c_001) - A skilled but anxious cartographer with trust issues, seeking her missing brother [HUMAN EDITED]
2. Marcus (ID: c_002) - A mysterious merchant with knowledge of ancient maps

LOCATIONS:
1. Neo-Venice (ID: l_001) - A cyberpunk city built on the ruins of Venice, with digital canals and AR overlays [HUMAN EDITED]
2. The Archive (ID: l_002) - Hidden library beneath the city

PLOT POINTS:
1. Elara discovers her brother's journal with cryptic map references
2. Marcus offers to guide Elara but his motives are unclear

CONTEXT:
1. The story has a steampunk aesthetic with magical elements [NOTE: May need updating due to Neo-Venice cyberpunk theme]
2. Maps are central to the plot and world-building

PENDING HUMAN EDITS TO ACKNOWLEDGE:
- Character Elara: Description refined to include personality traits
- Location Venedig renamed to Neo-Venice with cyberpunk theme added
```

### 1.6 Integration with Existing Chat System

**Location:** `src/xml-story-creation/integration/XMLChatIntegration.ts`

**Key Findings from Existing System:**
- Current chat uses `ChatInterface` class with model purpose selection ('creator', 'editor', 'rater', 'prose')
- Full-window modal overlay (90% width/height) with sidebar and main chat area
- Model selection dropdown in chat footer with real-time model display
- Uses OpenRouterClient with settingsManager integration
- Custom system prompts supported via constructor parameter

**Integration Requirements:**
- **Extend ChatInterface:** Create `XMLStoryChatInterface` that inherits from existing `ChatInterface`
- **Split Layout:** Replace single chat area with chat + whiteboard split view (50/50 or 60/40)
- **Model Selection:** Reuse existing model purpose selector but add XML-specific model configurations
- **Full Window Usage:** Follow existing pattern of 90vw/90vh modal with efficient space utilization
- **Dense Whiteboard:** Implement graphically dense whiteboard using available vertical space
- **Backward Compatibility:** Ensure standard chat features continue working

## Phase 2: Advanced Features

### 2.1 Edit/Delete Commands

**New XML Tags:**
```xml
<edit id="c_001">Updated character description</edit>
<delete id="l_002" />
<rename id="c_001" new_name="New Character Name" />
```

**Human Edit Feedback System:**
```xml
<!-- AI receives feedback when humans edit elements -->
<human_edit type="character" id="c_001" field="description" 
            old_value="A skilled cartographer" 
            new_value="A skilled but anxious cartographer with trust issues" />
<human_edit type="location" id="l_001" field="name" 
            old_value="Venedig" 
            new_value="Neo-Venice" />
```

**Implementation:**
- Modify ContextManager to include element IDs in refresh context
- Add edit/delete handling to XMLStoryParser
- **Human Edit Detection:** Track when users modify whiteboard elements
- **Edit Feedback Injection:** Automatically inject human edit notifications into chat context
- **Visual Edit Indicators:** Show modified elements with different styling
- Update UI to reflect changes visually
- Maintain edit history for undo functionality

### 2.2 Relationship System

**New XML Tags:**
```xml
<relationship type="family" from="c_001" to="c_002" description="siblings" />
<relationship type="location" from="c_001" to="l_001" description="lives in" />
<relationship type="conflict" from="c_001" to="c_003" description="sworn enemies" />
```

**Implementation:**
- Extend StoryElement interface to support relationships
- Add relationship visualization to whiteboard
- Create relationship management UI components

### 2.3 Visual Whiteboard Enhancement

**Features:**
- Drag-and-drop card arrangement
- Visual connection lines between related elements
- Card grouping and clustering
- Export as visual mind map
- Integration with existing idea board system

### 2.4 Story Structure Integration

**Integration Points:**
- Convert whiteboard elements to project context items
- Generate initial project outline from whiteboard
- Export to existing project structure
- Import existing projects to whiteboard for editing

## UI Layout Design

### Full-Window Split Layout

**Modal Structure (following existing pattern):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ XML Story Creation Chat (90vw × 90vh)                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────┬─────────────────────────┬─────────────────────────────┐ │
│ │   Sidebar   │       Chat Area         │     Story Whiteboard        │ │
│ │   (260px)   │      (40% width)        │       (40% width)           │ │
│ │             │                         │                             │ │
│ │ • Model Sel │ Messages Container      │ ┌─ Characters (12) ─────┐   │ │
│ │ • Actions   │ [User Message]          │ │ • Elara the Cartogr.. │   │ │
│ │ • Export    │ [AI Response]           │ │ • Marcus (merchant)    │   │ │
│ │             │ [User Message]          │ └─────────────────────────┘   │ │
│ │             │ [AI Response with XML]  │ ┌─ Locations (8) ───────┐   │ │
│ │             │                         │ │ • Venedig (sinking)   │   │ │
│ │             │ Input Area:             │ │ • The Archive          │   │ │
│ │             │ [Text Input]            │ └─────────────────────────┘   │ │
│ │             │ [Send] [Model: Creator] │ ┌─ Plot Points (15) ────┐   │ │
│ │             │                         │ │ • Brother's journal   │   │ │
│ │             │                         │ │ • Marcus offers help  │   │ │
│ │             │                         │ └─────────────────────────┘   │ │
│ └─────────────┴─────────────────────────┴─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

**Responsive Behavior:**
- On smaller screens, show tabs to switch between Chat and Whiteboard
- Whiteboard sections collapse/expand to save space
- Element cards stack vertically in narrow layouts

**Dense Whiteboard Design:**
- Element cards: 300px × 60px with hover expansion
- Type sections with element counts and collapse buttons
- Search bar at top of whiteboard
- Export button in whiteboard header
- Color coding for element types (blue: characters, green: locations, etc.)

**Visual Highlight System:**
- **Human Edits:** Orange border + edit icon (persistent until element updated by AI)
- **New AI Elements:** Bright green border + "NEW" badge (clears on next user message)
- **AI Updates:** Blue border + "UPDATED" badge (clears on next user message)  
- **Animations:** Smooth fade-in for new highlights, fade-out when clearing
- **Badge Design:** Small, unobtrusive badges in top-right corner of cards

## Technical Architecture

### File Structure
```
src/xml-story-creation/
├── index.ts                          # Main exports and entry point
├── types/
│   ├── XMLStoryTypes.ts             # Core type definitions
│   └── WhiteboardTypes.ts           # UI-specific types
├── parser/
│   ├── XMLStoryParser.ts            # XML parsing logic
│   └── ValidationRules.ts           # XML validation rules
├── ui/
│   ├── XMLStoryChatInterface.ts     # Extended chat interface (inherits from ChatInterface)
│   ├── StoryWhiteboard.ts           # Dense whiteboard component
│   ├── ElementCard.ts               # Compact element cards with editing
│   ├── EditableField.ts             # Inline editing component
│   ├── ElementTypeSection.ts        # Collapsible grouped sections
│   ├── WhiteboardControls.ts        # Search/filter controls
│   ├── EditIndicator.ts             # Visual edit markers (orange for human edits)
│   ├── AIUpdateIndicator.ts         # Visual markers for AI updates (green/blue)
│   └── HighlightManager.ts          # Manages highlight timing and clearing
├── context/
│   ├── ContextManager.ts            # Context refresh system
│   └── WhiteboardSerializer.ts      # Whiteboard state serialization
├── integration/
│   ├── XMLStoryModalManager.ts      # Modal management (extends existing pattern)
│   └── ProjectExportService.ts      # Export to existing project system
├── prompts/
│   └── XMLStoryCreationPrompt.ts    # System prompts with model selection
└── services/
    ├── XMLStoryService.ts           # Main service coordinator
    ├── ElementIDGenerator.ts        # Unique ID generation
    ├── EditTrackingService.ts       # Track and manage human edits
    └── HumanEditFeedbackService.ts  # Generate AI feedback for human edits
```

### Data Flow

**Standard Flow:**
1. **User Input** → Chat Interface
2. **AI Response** → XML Parser
3. **Parsed Elements** → Whiteboard Update
4. **AI Highlights Applied** → New/updated elements highlighted
5. **System Commands** → Context Manager
6. **Refreshed Context** → AI for next response

**Human Editing Flow:**
1. **User Edits Element** → EditableField Component
2. **Edit Detected** → EditTrackingService
3. **Edit Recorded** → Element Update + History
4. **Visual Update** → Whiteboard (orange border, edit icon)
5. **Edit Queued** → HumanEditFeedbackService
6. **Next User Message** → Edit feedback automatically injected + AI highlights cleared
7. **AI Acknowledges** → Natural response incorporating changes + new highlights

**Highlight Management Flow:**
1. **AI Response Processed** → Parser marks new/updated elements
2. **Highlights Applied** → Green borders for new, blue for updated
3. **User Interaction** → HighlightManager clears all AI highlights
4. **Clean State** → Ready for next AI response highlighting

### Storage Strategy

- Store whiteboard state in IndexedDB alongside chat history
- Maintain element edit history for undo functionality
- Export/import whiteboard as JSON for sharing
- Integration with existing project persistence system

## Implementation Milestones

### Milestone 1: Basic XML Parsing (Week 1-2)
- [ ] Core XML tag definitions
- [ ] Basic parser implementation
- [ ] Simple whiteboard display
- [ ] System prompt development

### Milestone 2: Human Editing System (Week 3)
- [ ] Inline editing components (EditableField)
- [ ] Edit tracking service implementation
- [ ] Visual edit indicators (orange borders for human edits)
- [ ] Edit history management

### Milestone 3: AI Highlighting System (Week 4)
- [ ] AI update detection in XML parser
- [ ] Highlight manager for timing control
- [ ] Visual indicators for new AI elements (green borders + "NEW" badge)
- [ ] Visual indicators for AI updates (blue borders + "UPDATED" badge)
- [ ] Automatic highlight clearing on user interaction

### Milestone 4: AI Feedback Integration (Week 5)
- [ ] Human edit feedback service
- [ ] Automatic edit notification injection
- [ ] Context refresh system with edit awareness
- [ ] Edit batching and acknowledgment

### Milestone 5: UI Integration (Week 6)
- [ ] Enhanced chat interface with split layout
- [ ] Dense whiteboard display with editing and highlighting
- [ ] Element card components with full visual feedback system
- [ ] Search/filter with all indicator types
- [ ] Smooth animations for highlight transitions

### Milestone 6: Advanced Features (Week 7-8)
- [ ] AI edit/delete commands
- [ ] Element relationships
- [ ] Advanced visual enhancements
- [ ] Project system integration and export
- [ ] Performance optimization for large whiteboards

## Success Metrics

- **User Engagement:** Time spent in XML story creation mode
- **Element Extraction Accuracy:** Percentage of valid XML tags parsed correctly
- **Story Completeness:** Number of story elements captured per session
- **User Satisfaction:** Feedback on natural conversation flow vs. structure extraction
- **Token Efficiency:** Context window utilization with refresh system

## Risk Mitigation

### Technical Risks
- **AI Adherence to XML Format:** Extensive prompt engineering and examples
- **XML Parsing Errors:** Graceful error handling and user feedback
- **Performance with Large Whiteboards:** Efficient rendering and virtualization

### UX Risks
- **Complexity Overwhelm:** Progressive disclosure of features
- **Natural Flow Disruption:** Hide XML mechanics from user view
- **Feature Discovery:** Clear onboarding and help system

## Future Considerations

- Integration with voice input for even more natural interaction
- Collaborative whiteboard sharing for co-authoring
- AI-suggested story elements based on current whiteboard
- Export to various story formats (screenplay, novel outline, etc.)
- Machine learning to improve XML tag suggestion accuracy

## Conclusion

This XML-in-chat story creation system represents a novel approach to collaborative storytelling that bridges the gap between natural conversation and structured story development. By implementing this in phases, we can validate the core concept while building toward a comprehensive story creation tool that could become a signature feature of the application. 