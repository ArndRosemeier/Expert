import { StorageService, IStorageService } from '../../../StorageService';
import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { formatCriteriaAsJson } from '../../../ProjectUtils';
import { createPromptExpansionService } from '../../../services/PromptExpansionService';
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
    
    // 2. Build generation prompt from config using PromptExpansionService
    const promptManager = state.getOrchestratorPrompts()!;
    const settingsManager = await SettingsManager.getInstance();
    const expansionService = createPromptExpansionService(settingsManager);
    
    // Get current profile's criteria and format them using standard JSON format
    const profile = settingsManager.getLastUsedProfile();
    const criteria = profile?.criteria || [];
    const formattedCriteria = formatCriteriaAsJson(criteria);
    
    // Prepare context for outline generation
    const outlineContext = this.buildOutlineContext(config);
    
    // Expand prompts with proper placeholder support (including {{language}})
    const systemPrompt = expansionService.expandPrompt(promptManager.outline_generation_system, {
      custom: { criteria: formattedCriteria }
    });
    
    const userPrompt = expansionService.expandPrompt(promptManager.outline_generation_user, {
      custom: outlineContext
    });
    
    // 3. Call AI service using 'creator' model
    const client = OpenRouterClient.getInstance();
    let generatedContent = '';
    
    await client.streamingChat('creator', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      onStart: () => { /* no-op */ },
      onChunk: (chunk) => { generatedContent += chunk; },
      onComplete: () => { /* no-op */ },
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
  
  private buildOutlineContext(config: OutlineFactoryConfig): Record<string, string> {
    const stylePreferences = this.formatStylePreferences(config.styleGuide);
    const genres = this.formatGenreSelections(config.genres);
    const contentRating = config.genres.content.join(', ') || 'General';
    
    return {
      ideas: config.ideas || 'No specific ideas provided',
      genres: genres,
      contentRating: contentRating,
      protagonists: config.context.protagonists.toString(),
      antagonists: config.context.antagonists.toString(),
      sideCharacters: config.context.sideCharacters.toString(),
      locations: config.context.locations.toString(),
      worldbuildingDetails: config.context.worldbuildingDetails.toString(),
      stylePreferences: stylePreferences
    };
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
    
    // Extract PROJECT TITLE. The outline body may contain internal ===Section Title===
    // headers, so terminate ONLY at the next known top-level wrapper delimiter (or end),
    // never at any "===". Otherwise internal section headers would truncate the body.
    const titleMatch = content.match(/===PROJECT TITLE===([\s\S]*?)(?=\n===PROJECT OUTLINE===|\n===BACKGROUND CONTEXT===|$)/);
    if (titleMatch?.[1]) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes
    }
    
    // Extract PROJECT OUTLINE (keeps any internal ===Section Title=== headers intact).
    const outlineMatch = content.match(/===PROJECT OUTLINE===([\s\S]*?)(?=\n===BACKGROUND CONTEXT===|$)/);
    if (outlineMatch?.[1]) {
      projectContent = outlineMatch[1].trim();
    }
    
    // Extract BACKGROUND CONTEXT - everything after its delimiter to the end.
    const contextMatch = content.match(/===BACKGROUND CONTEXT===([\s\S]*?)$/);
    if (contextMatch?.[1]) {
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