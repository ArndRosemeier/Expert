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
└── ContextConfiguration.ts        # Character/location/worldbuilding numbers

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
src/PromptManager.ts               # Add outline_generation_system and outline_generation_user prompts
```

### PromptManager.ts Required Changes
```typescript
// Add these to the orchestratorPrompts object in PromptManager.ts:
outline_generation_system: `You are a creative writing assistant that generates detailed project outlines...`,
outline_generation_user: `Generate a creative project outline based on these specifications:...`
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

export interface ValidationResult {
  isValid: boolean;
  message: string;
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
import { StorageService, IStorageService } from '../../../StorageService';
import { OpenRouterClient } from '../../../OpenRouterClient';
import { OutlineFactoryService } from '../services/OutlineFactoryService';
import type { OutlineFactoryConfig, OutlineGenerationResult } from '../../../types/OutlineFactoryTypes';

export class OutlineFactory {
  private container: HTMLElement;
  private config: OutlineFactoryConfig;
  private genreSelector: GenreSelector;
  private styleSelector: StyleGuideSelector;
  private contextConfig: ContextConfiguration;
  private service: OutlineFactoryService;
  private changeHandlers: ((config: OutlineFactoryConfig) => void)[] = [];
  private saveTimeout: number | null = null;
  private readonly SAVE_DEBOUNCE_MS = 500;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.service = new OutlineFactoryService();
    this.config = this.service.getDefaultConfiguration();
  }
  
  // Render main layout and sub-components
  async render(): Promise<void> {
    // Initialize sub-components
    // Set up event listeners with debounced auto-save
    // Load persisted configuration
  }
  
  // Handle form validation and coordinate with service
  async generateOutline(): Promise<OutlineGenerationResult> {
    return await this.service.generateOutline(this.config);
  }
  
  // Load/save configuration with auto-save
  async loadPersistedConfig(): Promise<void> {
    const saved = await this.service.loadConfiguration();
    if (saved) {
      this.config = saved;
      this.applyConfigToUI();
    }
  }
  
  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(async () => {
      await this.service.saveConfiguration(this.config);
    }, this.SAVE_DEBOUNCE_MS);
  }
  
  async resetToDefaults(): Promise<void> {
    await this.service.resetToDefaults();
    this.config = this.service.getDefaultConfiguration();
    this.applyConfigToUI();
  }
  
  // Event handling
  onChange(handler: (config: OutlineFactoryConfig) => void): void {
    this.changeHandlers.push(handler);
  }
  
  private notifyChange(): void {
    this.changeHandlers.forEach(handler => handler(this.config));
    this.debouncedSave();
  }
  
  private applyConfigToUI(): void {
    // Update all sub-components with current config
  }
  
  getCurrentConfig(): OutlineFactoryConfig {
    return { ...this.config };
  }
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

### PromptManager.ts Integration
```typescript
// Add to src/PromptManager.ts in orchestratorPrompts object:

outline_generation_system: `You are a creative writing assistant that generates detailed project outlines based on user specifications.

Your task is to create a comprehensive story outline that incorporates:
- User's free-form ideas and concepts
- Selected genre elements and themes
- Specified character and location requirements
- Chosen narrative style preferences

Always create engaging, internally consistent outlines that respect the specified constraints while being creative and compelling.`,

outline_generation_user: `Generate a creative project outline based on these specifications:

**User Ideas:** {{ideas}}

**Genre & Themes:** {{genres}}
**Tone:** {{tones}}
**Content Rating:** {{contentRating}}

**Story Requirements:**
- {{protagonists}} protagonist(s)
- {{antagonists}} antagonist(s)
- {{sideCharacters}} side characters
- {{locations}} main locations
- {{worldbuildingDetails}} worldbuilding elements to develop

**Style Preferences:** {{stylePreferences}}

Please create:

1. **PROJECT TITLE:** A compelling, genre-appropriate title

2. **PROJECT OUTLINE:** A detailed story outline (500-800 words) that incorporates all specified elements. Include plot structure, character roles, key scenes, and story progression.

3. **BACKGROUND CONTEXT:** Setting, premise, and world details (300-500 words) that establish the story's foundation.

Ensure the outline is engaging, internally consistent, and makes good use of all specified story elements.`
```

### Style Guide Generation (Procedural)
```typescript
// In OutlineFactoryService.ts
export const STYLE_GUIDE_GENERATOR = {
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
import { StorageService, IStorageService } from '../../../StorageService';
import { OpenRouterClient } from '../../../OpenRouterClient';
import type { 
  OutlineFactoryConfig, 
  OutlineGenerationResult, 
  ValidationResult,
  StyleSelection,
  GenreSelection
} from '../../../types/OutlineFactoryTypes';
import { DEFAULT_OUTLINE_FACTORY_CONFIG } from '../../../types/OutlineFactoryTypes';

export class OutlineFactoryService {
  private storageService: Promise<IStorageService>;
  private readonly STORAGE_KEY = 'outline_factory_settings';
  
  constructor() {
    this.storageService = StorageService.getInstance();
  }
  
  async generateOutline(config: OutlineFactoryConfig): Promise<OutlineGenerationResult> {
    // 1. Validate configuration
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(validation.message);
    }
    
    // 2. Build generation prompt from config using PromptManager templates
    const { getPrompts } = await import('../../../state');
    const promptManager = getPrompts();
    
    const systemPrompt = promptManager.outline_generation_system;
    const userPrompt = this.buildUserPrompt(promptManager.outline_generation_user, config);
    
    // 3. Call AI service using 'creator' model
    const client = OpenRouterClient.getInstance();
    let generatedContent = '';
    
    await client.streamingChat('creator', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      onChunk: (chunk) => { generatedContent += chunk; },
      onComplete: () => {},
      onError: (error) => { throw error; }
    });
    
    // 4. Parse generated content into title, content, and context
    const parsed = this.parseGeneratedContent(generatedContent);
    
    // 5. Generate procedural style guide
    const styleGuideContext = this.generateStyleGuideText(config.styleGuide);
    
    return {
      title: parsed.title,
      content: parsed.content,
      context: parsed.context,
      styleGuideContext
    };
  }
  
  private buildUserPrompt(template: string, config: OutlineFactoryConfig): string {
    const stylePreferences = this.formatStylePreferences(config.styleGuide);
    const genres = this.formatGenreSelections(config.genres);
    
    return template
      .replace('{{ideas}}', config.ideas || 'No specific ideas provided')
      .replace('{{genres}}', genres)
      .replace('{{tones}}', config.genres.tone.join(', ') || 'Neutral')
      .replace('{{contentRating}}', config.genres.content.join(', ') || 'General')
      .replace('{{protagonists}}', config.context.protagonists.toString())
      .replace('{{antagonists}}', config.context.antagonists.toString())
      .replace('{{sideCharacters}}', config.context.sideCharacters.toString())
      .replace('{{locations}}', config.context.locations.toString())
      .replace('{{worldbuildingDetails}}', config.context.worldbuildingDetails.toString())
      .replace('{{stylePreferences}}', stylePreferences);
  }
  
  validateConfig(config: OutlineFactoryConfig): ValidationResult {
    // Check for logical conflicts (e.g., "children" + "erotic")
    if (config.genres.audience.includes('children') && 
        config.genres.content.includes('erotic')) {
      return { isValid: false, message: 'Children\'s content cannot include erotic themes' };
    }
    
    // Ensure minimum requirements
    if (config.context.protagonists < 1) {
      return { isValid: false, message: 'At least one protagonist is required' };
    }
    
    return { isValid: true, message: '' };
  }
  
  generateStyleGuideText(selections: StyleSelection): string {
    const styles: string[] = [];
    
    // Flatten all style selections into readable text
    Object.values(selections).forEach(categorySelections => {
      styles.push(...categorySelections);
    });
    
    if (styles.length === 0) {
      return '*No specific style preferences selected.';
    }
    
    const styleText = styles
      .map(style => style.replace('-', ' '))
      .join(', ');
    
    return `*Style Guide: Write using ${styleText} approach.`;
  }
  
  // Persistence Methods (using StorageService pattern)
  async saveConfiguration(config: OutlineFactoryConfig): Promise<void> {
    const storage = await this.storageService;
    await storage.set(this.STORAGE_KEY, {
      ...config,
      timestamp: Date.now()
    });
  }
  
  async loadConfiguration(): Promise<OutlineFactoryConfig | null> {
    const storage = await this.storageService;
    const saved = await storage.get<OutlineFactoryConfig & { timestamp: number }>(this.STORAGE_KEY);
    
    if (saved) {
      // Remove timestamp before returning
      const { timestamp, ...config } = saved;
      return config;
    }
    
    return null;
  }
  
  getDefaultConfiguration(): OutlineFactoryConfig {
    return { ...DEFAULT_OUTLINE_FACTORY_CONFIG };
  }
  
  async resetToDefaults(): Promise<void> {
    const storage = await this.storageService;
    await storage.remove(this.STORAGE_KEY);
  }
  
  private parseGeneratedContent(content: string): { title: string; content: string; context: string } {
    // Parse AI response into structured sections
    // Implementation would extract title, outline, and context from generated text
    return {
      title: 'Generated Project Title',
      content: 'Generated project outline...',
      context: 'Generated background context...'
    };
  }
  
  private formatStylePreferences(styleGuide: StyleSelection): string {
    // Format style selections into readable text
    return Object.entries(styleGuide)
      .filter(([_, selections]) => selections.length > 0)
      .map(([category, selections]) => `${category}: ${selections.join(', ')}`)
      .join('; ');
  }
  
  private formatGenreSelections(genres: GenreSelection): string {
    // Format genre selections into readable text
    return Object.entries(genres)
      .filter(([_, selections]) => selections.length > 0)
      .map(([category, selections]) => `${category}: ${selections.join(', ')}`)
      .join('; ');
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
  // Create new project using proper DocumentNode pattern
  const { createNewProject } = await import('../../state');
  const projectManager = await createNewProject();
  
  // Set content using proper setContentWithTags pattern
  const rootNode = projectManager.rootNode;
  rootNode.title = result.title;
  
  // Set content and context with generation tags
  rootNode.setContentWithTags(result.content, ['outline_factory', 'generated'], {
    source: 'outline_factory',
    timestamp: Date.now()
  });
  
  // Combine context with style guide (with "*" prefix)
  const fullContext = result.context + '\n\n' + result.styleGuideContext;
  rootNode.setContext(fullContext);
  
  // Save current outline factory configuration for next time
  await this.outlineFactoryService.saveConfiguration(this.getCurrentConfig());
  
  // Save project and navigate
  await projectManager.saveToStorage();
  state.setActiveProject(projectManager.rootNode.id);
  
  // Close modal and refresh UI
  this.close();
  this.emit('projectCreated', projectManager.rootNode.id);
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