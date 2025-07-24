import { StorageService, IStorageService } from '../../../StorageService';
import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { formatCriteriaAsJson } from '../../../ProjectUtils';
import * as state from '../../../state';
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
    const promptManager = state.getOrchestratorPrompts()!;
    const settingsManager = await SettingsManager.getInstance();
    
    // Get current profile's criteria and format them using standard JSON format
    const profile = settingsManager.getLastUsedProfile();
    const criteria = profile?.criteria || [];
    const formattedCriteria = formatCriteriaAsJson(criteria);
    
    const systemPrompt = promptManager.outline_generation_system.replace('{{criteria}}', formattedCriteria);
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
    
    // 5. Generate procedural style guide and genre/themes context
    const styleGuideContext = this.generateStyleGuideText(config.styleGuide);
    const genreThemesContext = this.generateGenreThemesContext(config.genres);
    
    return {
      title: parsed.title,
      content: parsed.content,
      context: parsed.context,
      styleGuideContext,
      genreThemesContext
    };
  }
  
  private buildUserPrompt(template: string, config: OutlineFactoryConfig): string {
    const stylePreferences = this.formatStylePreferences(config.styleGuide);
    const genres = this.formatGenreSelections(config.genres);
    const contentRating = config.genres.content.join(', ') || 'General';
    
    return template
      .replace('{{ideas}}', config.ideas || 'No specific ideas provided')
      .replace('{{genres}}', genres)
      .replace('{{contentRating}}', contentRating)
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
    
    if (config.genres.audience.includes('children') && 
        config.genres.content.includes('violent')) {
      return { isValid: false, message: 'Children\'s content should not include violent themes' };
    }
    
    // Ensure minimum requirements
    if (config.context.protagonists < 1) {
      return { isValid: false, message: 'At least one protagonist is required' };
    }
    
    if (config.context.locations < 1) {
      return { isValid: false, message: 'At least one location is required' };
    }
    
    // Check if no genres are selected at all
    const hasAnyGenre = Object.values(config.genres).some(arr => arr.length > 0);
    if (!hasAnyGenre && !config.ideas.trim()) {
      return { isValid: false, message: 'Please provide either some ideas or select at least one genre/theme' };
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
      .map((style: string) => style.replace(/-/g, ' '))
      .join(', ');
    
    return `*Style Guide: Write using ${styleText} approach.`;
  }
  
  generateGenreThemesContext(genres: GenreSelection): string {
    const genreInfo = this.formatGenreSelections(genres);
    
    if (!genreInfo || genreInfo === 'No specific genre preferences') {
      return '*Genre & Themes: No specific genre preferences selected.';
    }
    
    return `*Genre & Themes: This story follows ${genreInfo}.`;
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
    await storage.delete(this.STORAGE_KEY);
  }
  
  private parseGeneratedContent(content: string): { title: string; content: string; context: string } {
    // Parse AI response using simple section delimiters - KISS principle
    
    let title = 'Generated Project';
    let projectContent = '';
    let projectContext = '';
    
    // Extract PROJECT TITLE - simple format: "===PROJECT TITLE==="
    const titleMatch = content.match(/===PROJECT TITLE===([\s\S]*?)(?====|$)/);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes
    }
    
    // Extract PROJECT OUTLINE - simple format: "===PROJECT OUTLINE==="
    const outlineMatch = content.match(/===PROJECT OUTLINE===([\s\S]*?)(?====|$)/);
    if (outlineMatch && outlineMatch[1]) {
      projectContent = outlineMatch[1].trim();
    }
    
    // Extract BACKGROUND CONTEXT - simple format: "===BACKGROUND CONTEXT==="
    const contextMatch = content.match(/===BACKGROUND CONTEXT===([\s\S]*?)(?====|$)/);
    if (contextMatch && contextMatch[1]) {
      projectContext = contextMatch[1].trim();
    }
    
    // Strict parsing - no fallbacks
    if (!titleMatch) {
      throw new Error('AI did not provide ===PROJECT TITLE=== section in the expected format');
    }
    
    if (!outlineMatch) {
      throw new Error('AI did not provide ===PROJECT OUTLINE=== section in the expected format');
    }
    
    if (!contextMatch) {
      throw new Error('AI did not provide ===BACKGROUND CONTEXT=== section in the expected format');
    }
    
    return {
      title,
      content: projectContent,
      context: projectContext
    };
  }
  
  private formatStylePreferences(styleGuide: StyleSelection): string {
    const formattedCategories: string[] = [];
    
    Object.entries(styleGuide).forEach(([category, selections]) => {
      if (selections.length > 0) {
        const formattedSelections = selections
          .map((s: string) => s.replace(/-/g, ' '))
          .join(', ');
        formattedCategories.push(`${category}: ${formattedSelections}`);
      }
    });
    
    return formattedCategories.join('; ') || 'No specific style preferences';
  }
  
  private formatGenreSelections(genres: GenreSelection): string {
    const formattedCategories: string[] = [];
    
    Object.entries(genres).forEach(([category, selections]) => {
      if (selections.length > 0) {
        const formattedSelections = selections
          .map((s: string) => s.replace(/-/g, ' '))
          .join(', ');
        formattedCategories.push(`${category}: ${formattedSelections}`);
      }
    });
    
    return formattedCategories.join('; ') || 'No specific genre preferences';
  }
} 