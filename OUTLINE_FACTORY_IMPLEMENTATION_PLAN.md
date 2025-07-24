# Outline Factory Implementation Plan

## Overview
The Outline Factory is a new feature that allows users to create project outlines by combining free-form ideas with structured genre, style, and context selections. It will be integrated as a third tab in the New Project Dialog.

## 1. File Structure & Components

### New Files to Create
```
src/ui/modals/components/
├── OutlineFactory.ts              # Main outline factory component
├── GenreSelector.ts               # Genre/theme checkboxes component
├── StyleGuideSelector.ts          # Style guide checkboxes component  
├── ContextConfiguration.ts        # Character/location/worldbuilding numbers
└── OutlineFactoryPrompts.ts       # Prompt templates for outline generation

src/types/
└── OutlineFactoryTypes.ts         # Type definitions for outline factory

src/ui/modals/services/
└── OutlineFactoryService.ts       # Business logic for outline generation
```

### Files to Modify
```
src/ui/modals/NewProjectModal.ts   # Add third tab and resize dialog
src/ui/modals/core/BaseModal.ts    # Support larger modal sizes
src/types/ModalTypes.ts            # Add outline factory types
```

## 2. Data Structures

### Core Types (OutlineFactoryTypes.ts)
```typescript
export interface OutlineFactoryConfig {
  ideas: string;                    // Free-form text input
  genres: GenreSelection;           // Selected genre/theme checkboxes
  styleGuide: StyleSelection;       // Selected style checkboxes
  context: ContextConfig;           // Character/location counts
}

export interface GenreSelection {
  // Genre/Theme Categories
  tone: string[];                   // 'gritty', 'dark', 'light', 'comedic'
  genre: string[];                  // 'horror', 'romance', 'fantasy', 'sf', 'mystery'
  audience: string[];               // 'children', 'ya', 'adult', 'mature'
  content: string[];                // 'erotic', 'violent', 'family-friendly'
  subgenres: string[];              // 'cyberpunk', 'steampunk', 'urban-fantasy'
}

export interface StyleSelection {
  narrative: string[];              // 'show-dont-tell', 'explicit', 'subtle'
  voice: string[];                  // 'warm', 'cold', 'intimate', 'distant'
  pacing: string[];                 // 'fast-paced', 'slow-burn', 'episodic'
  perspective: string[];            // 'first-person', 'third-limited', 'omniscient'
}

export interface ContextConfig {
  protagonists: number;             // 1-5
  antagonists: number;              // 0-3
  sideCharacters: number;           // 0-10
  locations: number;                // 1-10
  worldbuildingDetails: number;     // 0-10
}

export interface OutlineGenerationResult {
  title: string;
  content: string;
  context: string;
  styleGuideContext: string;        // Generated with "*" prefix
}

export interface OutlineFactoryDefaults {
  ideas: string;
  genres: GenreSelection;
  styleGuide: StyleSelection;
  context: ContextConfig;
}

export interface OutlineFactoryPersistence {
  lastUsedConfig: OutlineFactoryConfig;
  defaults: OutlineFactoryDefaults;
}
```

## 3. UI Design & Layout

### Modal Expansion
- Resize NewProjectModal to 90% of window size
- Add responsive breakpoints for smaller screens
- Ensure proper scrolling for content overflow

### Tab Structure
```
[ Manual Project ] [ AI Project ] [ Outline Factory ]
```

### Outline Factory Tab Layout
```
┌─────────────────────────────────────────────────────────────┐
│                        IDEAS SECTION                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Free-form text area for user ideas                      │ │
│ │ (Multi-line, expandable)                                │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    GENRE & THEMES SECTION                  │
│ [Tone]      [⚫ Gritty] [⚪ Dark] [⚪ Light] [⚪ Comedic]    │
│ [Genre]     [⚪ Horror] [⚫ Romance] [⚪ Fantasy] [⚪ SF]     │
│ [Audience]  [⚪ Children] [⚪ YA] [⚫ Adult] [⚪ Mature]     │
│ [Content]   [⚪ Erotic] [⚪ Violent] [⚫ Family-Friendly]   │
│ [Subgenres] [⚪ Cyberpunk] [⚪ Steampunk] [⚪ Urban Fantasy]│
├─────────────────────────────────────────────────────────────┤
│                    STYLE GUIDE SECTION                     │
│ [Narrative] [⚫ Show Don't Tell] [⚪ Explicit] [⚪ Subtle]  │
│ [Voice]     [⚫ Warm] [⚪ Cold] [⚪ Intimate] [⚪ Distant]   │
│ [Pacing]    [⚪ Fast-Paced] [⚫ Slow-Burn] [⚪ Episodic]   │
│ [Perspective] [⚫ First-Person] [⚪ Third-Limited] etc.     │
├─────────────────────────────────────────────────────────────┤
│                    CONTEXT CONFIGURATION                   │
│ Protagonists:     [2] ⊖ ⊕     Antagonists:     [1] ⊖ ⊕    │
│ Side Characters:  [3] ⊖ ⊕     Locations:       [4] ⊖ ⊕    │
│ Worldbuilding Details: [2] ⊖ ⊕                             │
├─────────────────────────────────────────────────────────────┤
│                      ACTION BUTTONS                        │
│          [Reset to Default] [Generate Outline] [Cancel]    │
└─────────────────────────────────────────────────────────────┘
```

## 4. Component Implementation

### OutlineFactory.ts (Main Component)
```typescript
export class OutlineFactory {
  private container: HTMLElement;
  private config: OutlineFactoryConfig;
  private genreSelector: GenreSelector;
  private styleSelector: StyleGuideSelector;
  private contextConfig: ContextConfiguration;
  private storageService: StorageService;
  
  // Render main layout and sub-components
  // Handle form validation
  // Coordinate with OutlineFactoryService for generation
  // Load/save configuration to persistent storage
  // Handle reset to defaults functionality
  // Emit events for project creation
  
  async loadPersistedConfig(): Promise<void>
  async saveCurrentConfig(): Promise<void>
  resetToDefaults(): void
}
```

### GenreSelector.ts
```typescript
export class GenreSelector {
  // Render categorized checkbox groups
  // Handle multiple selections per category
  // Provide preset combinations (e.g., "Fantasy Adventure", "Dark Horror")
  // Validate logical combinations (warn about conflicts)
}
```

### StyleGuideSelector.ts
```typescript
export class StyleGuideSelector {
  // Render style-related checkboxes
  // Show style explanations on hover/click
  // Generate procedural style guide text from selections
  // Preview style guide output
}
```

### ContextConfiguration.ts
```typescript
export class ContextConfiguration {
  // Number inputs with +/- controls
  // Validation (min/max values)
  // Dynamic hints based on selections
  // Calculate complexity score
}
```

## 5. Prompt Engineering

### OutlineFactoryPrompts.ts
```typescript
export const OUTLINE_GENERATION_PROMPT = `
Generate a creative project outline based on:

User Ideas: {{ideas}}
Selected Genres: {{genres}}
Tone & Themes: {{themes}}
Context Requirements:
- {{protagonists}} protagonists
- {{antagonists}} antagonists  
- {{sideCharacters}} side characters
- {{locations}} locations
- {{worldbuildingDetails}} worldbuilding elements

Create:
1. PROJECT TITLE: Creative, genre-appropriate title
2. PROJECT CONTENT: Detailed outline (500-800 words)
3. PROJECT CONTEXT: Background, setting, and premise (300-500 words)

Focus on {{selectedGenres}} elements with {{selectedTones}} tone.
Ensure all specified characters and locations are incorporated.
Make it engaging and internally consistent.
`;

export const STYLE_GUIDE_GENERATOR = {
  // Procedural generation of style guide from selections
  generateStyleGuide(selections: StyleSelection): string {
    // Convert selected checkboxes into coherent paragraph
    // Add "*" prefix for permanent context
  }
};

export const DEFAULT_OUTLINE_FACTORY_CONFIG: OutlineFactoryConfig = {
  ideas: '',
  genres: {
    tone: [],
    genre: [],
    audience: ['adult'],
    content: ['family-friendly'],
    subgenres: []
  },
  styleGuide: {
    narrative: ['show-dont-tell'],
    voice: ['warm'],
    pacing: [],
    perspective: []
  },
  context: {
    protagonists: 1,
    antagonists: 1,
    sideCharacters: 2,
    locations: 3,
    worldbuildingDetails: 2
  }
};
```

## 6. Business Logic

### OutlineFactoryService.ts
```typescript
export class OutlineFactoryService {
  private storageService: StorageService;
  private readonly STORAGE_KEY = 'outline_factory_settings';
  
  async generateOutline(config: OutlineFactoryConfig): Promise<OutlineGenerationResult> {
    // 1. Validate configuration
    // 2. Build generation prompt from config
    // 3. Call AI service for content generation
    // 4. Generate procedural style guide
    // 5. Combine results
    // 6. Return formatted result
  }
  
  validateConfig(config: OutlineFactoryConfig): ValidationResult {
    // Check for logical conflicts
    // Ensure minimum requirements met
    // Provide helpful error messages
  }
  
  generateStyleGuideText(selections: StyleSelection): string {
    // Convert selected checkboxes into coherent paragraph
    // Add "*" prefix for permanent context
  }
  
  // Persistence Methods
  async saveConfiguration(config: OutlineFactoryConfig): Promise<void> {
    // Save current configuration to storage for restoration
  }
  
  async loadConfiguration(): Promise<OutlineFactoryConfig | null> {
    // Load previously saved configuration
  }
  
  getDefaultConfiguration(): OutlineFactoryConfig {
    // Return sensible default values for fresh start
  }
  
  async resetToDefaults(): Promise<void> {
    // Clear saved configuration and return to defaults
  }
}
```

## 7. Integration Points

### NewProjectModal.ts Modifications
```typescript
// Add third tab
private renderTabs(): void {
  // Add "Outline Factory" tab
  // Handle tab switching
  // Resize modal to 90% window size
}

// Handle outline factory project creation
private async handleOutlineFactorySubmit(result: OutlineGenerationResult): Promise<void> {
  // Create new project with generated content
  // Set content, context, and style guide
  // Apply "*" prefix to style guide in context
  // Save current outline factory configuration for next time
  // Close modal and navigate to new project
}

// Initialize outline factory with persisted settings
private async initializeOutlineFactory(): Promise<void> {
  // Load previously saved configuration
  // Apply to all form controls
  // Set up auto-save on changes
}

// Handle reset to defaults
private handleOutlineFactoryReset(): void {
  // Reset all controls to default values
  // Clear persisted configuration
  // Update UI to reflect reset state
}
```

### Modal Size Adjustments
```css
.outline-factory-modal {
  width: 90vw;
  height: 90vh;
  max-width: 1400px;
  max-height: 1000px;
}

.outline-factory-tab {
  display: grid;
  grid-template-rows: auto auto auto auto auto;
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
}
```

## 8. Implementation Phases

### Phase 1: Foundation (2-3 days)
- Create type definitions
- Set up basic component structure
- Implement modal resizing
- Add third tab to NewProjectModal

### Phase 2: UI Components (3-4 days)
- Implement GenreSelector with all checkboxes
- Implement StyleGuideSelector
- Implement ContextConfiguration
- Add responsive layout and styling

### Phase 3: Business Logic & Persistence (2-3 days)
- Implement OutlineFactoryService
- Create prompt templates
- Add configuration validation
- Implement style guide generation
- Add persistence methods for saving/loading configuration
- Implement reset to defaults functionality

### Phase 4: Integration (1-2 days)
- Connect components to service
- Handle project creation flow
- Implement auto-save on configuration changes
- Add error handling and loading states
- Test full workflow with persistence

### Phase 5: Polish (1-2 days)
- Improve UX with hints and tooltips
- Add preset combinations
- Performance optimizations
- Add smooth transitions for reset functionality

## 9. Technical Considerations

### Performance
- Lazy load checkbox options
- Debounce auto-save operations to prevent excessive storage calls
- Efficient DOM updates for large checkbox lists
- Optimize configuration loading on modal open

### UX/UI
- Clear visual grouping of checkbox categories
- Keyboard navigation support
- Automatic persistence of all settings
- Helpful tooltips and explanations
- Smooth reset animation/feedback

### Validation
- Prevent conflicting selections (e.g., "Children" + "Erotic")
- Provide smart defaults based on genre selection
- Clear error messages with suggestions

### Accessibility
- Proper ARIA labels for all controls
- Keyboard-only navigation
- Screen reader compatibility
- High contrast mode support

### Persistence Strategy
- **Storage Key:** `outline_factory_settings`
- **Auto-save:** Debounced saves on any form change (500ms delay)
- **Storage Contents:**
  - Last used ideas text
  - All checkbox selections across all categories
  - All numeric configuration values
  - Timestamp of last save
- **Reset Behavior:** Clears storage and applies hardcoded defaults
- **Initialization:** Loads from storage on modal open, falls back to defaults

## 10. Future Enhancements

### Advanced Features
- Save/load outline factory templates
- Community sharing of configurations
- AI-suggested genre combinations
- Export outline to external formats

### Integration
- Connect to existing prompt system
- Use outline factory for story continuation
- Integrate with character/location generators

## 11. Testing Strategy

### Unit Tests
- Component rendering
- Configuration validation
- Style guide generation
- Prompt building

### Integration Tests
- Tab switching in modal
- Full outline generation workflow
- Project creation from outline
- Error handling scenarios

### User Testing
- Gather feedback on checkbox organization
- Test workflow efficiency
- Validate generated content quality
- Assess modal size and usability

This implementation plan provides a comprehensive roadmap for developing the Outline Factory feature while maintaining code quality and user experience standards. 