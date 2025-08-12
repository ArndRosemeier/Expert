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
  [key: string]: string[];          // Index signature for dynamic access
}

export interface StyleSelection {
  narrative: string[];              // 'show-dont-tell', 'explicit', 'subtle', 'direct-speech-is-king'
  voice: string[];                  // 'warm', 'cold', 'intimate', 'distant'
  pacing: string[];                 // 'fast-paced', 'slow-burn', 'episodic'
  perspective: string[];            // 'first-person', 'third-limited', 'omniscient'
  [key: string]: string[];          // Index signature for dynamic access
}

export interface ContextConfig {
  protagonists: number;             // 1-5
  antagonists: number;              // 0-3
  sideCharacters: number;           // 0-10
  locations: number;                // 1-10
  worldbuildingDetails: number;     // 0-10
  [key: string]: number;            // Index signature for dynamic access
}

export interface OutlineGenerationResult {
  title: string;
  content: string;
  context: string;
  styleGuideContext: string;        // Generated with "*" prefix
  genreThemesContext: string;       // Generated with "*" prefix for genre & themes
}



export interface ValidationResult {
  isValid: boolean;
  message: string;
}

// Available options for each category
export const GENRE_OPTIONS = {
  tone: [
    { id: 'gritty', label: 'Gritty' },
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'comedic', label: 'Comedic' },
    { id: 'serious', label: 'Serious' },
    { id: 'whimsical', label: 'Whimsical' },
    { id: 'melancholic', label: 'Melancholic' },
    { id: 'hopeful', label: 'Hopeful' }
  ],
  genre: [
    { id: 'horror', label: 'Horror' },
    { id: 'romance', label: 'Romance' },
    { id: 'fantasy', label: 'Fantasy' },
    { id: 'sf', label: 'Science Fiction' },
    { id: 'mystery', label: 'Mystery' },
    { id: 'thriller', label: 'Thriller' },
    { id: 'drama', label: 'Drama' },
    { id: 'comedy', label: 'Comedy' },
    { id: 'adventure', label: 'Adventure' },
    { id: 'action', label: 'Action' },
    { id: 'western', label: 'Western' },
    { id: 'historical', label: 'Historical' },
    { id: 'contemporary', label: 'Contemporary' },
    { id: 'literary', label: 'Literary Fiction' }
  ],
  audience: [
    { id: 'children', label: 'Children' },
    { id: 'ya', label: 'Young Adult' },
    { id: 'adult', label: 'Adult' },
    { id: 'mature', label: 'Mature' }
  ],
  content: [
    { id: 'family-friendly', label: 'Family Friendly' },
    { id: 'mild-violence', label: 'Mild Violence' },
    { id: 'violent', label: 'Violent' },
    { id: 'erotic', label: 'Erotic' },
    { id: 'mature-themes', label: 'Mature Themes' },
    { id: 'profanity', label: 'Profanity' },
    { id: 'substance-use', label: 'Substance Use' }
  ],
  subgenres: [
    { id: 'cyberpunk', label: 'Cyberpunk' },
    { id: 'steampunk', label: 'Steampunk' },
    { id: 'urban-fantasy', label: 'Urban Fantasy' },
    { id: 'dystopian', label: 'Dystopian' },
    { id: 'post-apocalyptic', label: 'Post-Apocalyptic' },
    { id: 'space-opera', label: 'Space Opera' },
    { id: 'hard-sf', label: 'Hard Science Fiction' },
    { id: 'paranormal', label: 'Paranormal' },
    { id: 'gothic', label: 'Gothic' },
    { id: 'cozy-mystery', label: 'Cozy Mystery' },
    { id: 'noir', label: 'Noir' },
    { id: 'epic-fantasy', label: 'Epic Fantasy' },
    { id: 'sword-sorcery', label: 'Sword & Sorcery' },
    { id: 'alternate-history', label: 'Alternate History' }
  ]
} as const;

export const STYLE_OPTIONS = {
  narrative: [
    { id: 'show-dont-tell', label: 'Show Don\'t Tell' },
    { id: 'explicit', label: 'Explicit' },
    { id: 'subtle', label: 'Subtle' },
    { id: 'descriptive', label: 'Descriptive' },
    { id: 'minimalist', label: 'Minimalist' },
    { id: 'verbose', label: 'Verbose' },
    { id: 'atmospheric', label: 'Atmospheric' },
    { id: 'direct-speech-is-king', label: 'Direct Speech is King' }
  ],
  voice: [
    { id: 'warm', label: 'Warm' },
    { id: 'cold', label: 'Cold' },
    { id: 'intimate', label: 'Intimate' },
    { id: 'distant', label: 'Distant' },
    { id: 'formal', label: 'Formal' },
    { id: 'casual', label: 'Casual' },
    { id: 'authoritative', label: 'Authoritative' },
    { id: 'conversational', label: 'Conversational' }
  ],
  pacing: [
    { id: 'fast-paced', label: 'Fast-Paced' },
    { id: 'slow-burn', label: 'Slow Burn' },
    { id: 'episodic', label: 'Episodic' },
    { id: 'gradual-build', label: 'Gradual Build' },
    { id: 'constant-tension', label: 'Constant Tension' },
    { id: 'varied-rhythm', label: 'Varied Rhythm' }
  ],
  perspective: [
    { id: 'first-person', label: 'First Person' },
    { id: 'third-limited', label: 'Third Person Limited' },
    { id: 'third-omniscient', label: 'Third Person Omniscient' },
    { id: 'multiple-pov', label: 'Multiple POV' },
    { id: 'second-person', label: 'Second Person' }
  ]
} as const;

// Context configuration limits
export const CONTEXT_LIMITS = {
  protagonists: { min: 1, max: 5 },
  antagonists: { min: 0, max: 3 },
  sideCharacters: { min: 0, max: 10 },
  locations: { min: 1, max: 10 },
  worldbuildingDetails: { min: 0, max: 10 }
} as const;

// Default configuration
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
    narrative: ['show-dont-tell', 'direct-speech-is-king'],
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