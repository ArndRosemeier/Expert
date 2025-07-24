import { StorageService, IStorageService } from '../../../StorageService';
import { OpenRouterClient } from '../../../OpenRouterClient';
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
    const tones = config.genres.tone.join(', ') || 'Neutral';
    const contentRating = config.genres.content.join(', ') || 'General';
    
    return template
      .replace('{{ideas}}', config.ideas || 'No specific ideas provided')
      .replace('{{genres}}', genres)
      .replace('{{tones}}', tones)
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
    // Parse AI response into structured sections
    // Look for common patterns in AI responses
    
    let title = 'Generated Project';
    let projectContent = '';
    let projectContext = '';
    
    // Extract PROJECT TITLE (exactly as we ask for it in the prompt)
    const titleMatch = content.match(/(?:^|\n)(?:1\.?\s*)?(?:\*\*)?PROJECT TITLE(?:\*\*)?:\s*(.+?)(?:\n|$)/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim().replace(/^\*\*|\*\*$/g, ''); // Remove any markdown formatting
    }
    
    // Extract PROJECT OUTLINE (exactly as we ask for it in the prompt)
    const outlineMatch = content.match(/(?:^|\n)(?:2\.?\s*)?(?:\*\*)?PROJECT OUTLINE(?:\*\*)?:\s*([\s\S]*?)(?=\n(?:3\.?\s*)?(?:\*\*)?BACKGROUND CONTEXT(?:\*\*)?:|$)/i);
    if (outlineMatch && outlineMatch[1]) {
      projectContent = outlineMatch[1].trim();
    }
    
    // Extract BACKGROUND CONTEXT (exactly as we ask for it in the prompt)
    const contextMatch = content.match(/(?:^|\n)(?:3\.?\s*)?(?:\*\*)?BACKGROUND CONTEXT(?:\*\*)?:\s*([\s\S]*?)$/i);
    if (contextMatch && contextMatch[1]) {
      projectContext = contextMatch[1].trim();
    }
    
    // Fallback parsing if exact format isn't found
    if (!projectContent || !projectContext) {
      console.warn('Exact format parsing failed, attempting fallback parsing');
      
      // Look for any content between title and context sections
      if (!projectContent) {
        const fallbackContentMatch = content.match(/(?:outline|content)[\s\S]*?\n([\s\S]*?)(?:\n(?:background|context):|$)/i);
        if (fallbackContentMatch && fallbackContentMatch[1]) {
          projectContent = fallbackContentMatch[1].trim();
        }
      }
      
      // Look for anything after "background" or "context"
      if (!projectContext) {
        const fallbackContextMatch = content.match(/(?:background|context):?\s*([\s\S]*?)$/i);
        if (fallbackContextMatch && fallbackContextMatch[1]) {
          projectContext = fallbackContextMatch[1].trim();
        }
      }
      
      // Final fallback: split content if all else fails
      if (!projectContent && !projectContext) {
        console.warn('All parsing failed, using rough content split');
        const lines = content.split('\n').filter(line => line.trim());
        const midpoint = Math.floor(lines.length * 0.6);
        projectContent = lines.slice(0, midpoint).join('\n').trim();
        projectContext = lines.slice(midpoint).join('\n').trim();
      }
    }
    
    // Ensure we have content
    if (!projectContent) {
      projectContent = content.trim();
    }
    
    if (!projectContext) {
      projectContext = 'Background and setting details to be developed.';
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