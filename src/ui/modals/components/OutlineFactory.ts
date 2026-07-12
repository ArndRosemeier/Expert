import { OutlineFactoryService } from '../services/OutlineFactoryService';
import type { 
  OutlineFactoryConfig, 
  OutlineGenerationResult,
  ContextConfig
} from '../../../types/OutlineFactoryTypes';
import { 
  GENRE_OPTIONS, 
  STYLE_OPTIONS, 
  CONTEXT_LIMITS 
} from '../../../types/OutlineFactoryTypes';
import { UniversalTextEditor } from '../../components/UniversalTextEditor';

export class OutlineFactory {
  private container: HTMLElement;
  private config: OutlineFactoryConfig;
  private service: OutlineFactoryService;
  private changeHandlers: ((config: OutlineFactoryConfig) => void)[] = [];
  private saveTimeout: number | null = null;
  private readonly SAVE_DEBOUNCE_MS = 500;
  
  // UI Elements
  private ideasTextarea?: UniversalTextEditor;
  private genreCheckboxes: Map<string, HTMLInputElement[]> = new Map();
  private styleCheckboxes: Map<string, HTMLInputElement[]> = new Map();
  private contextInputs: Map<string, HTMLInputElement> = new Map();
  private resetButton?: HTMLButtonElement;
  private generateButton?: HTMLButtonElement;
  private validationMessage?: HTMLElement;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.service = new OutlineFactoryService();
    this.config = this.service.getDefaultConfiguration();
  }
  
  async render(): Promise<void> {
    this.container.innerHTML = this.getHTML();
    this.bindElements();
    this.setupEventListeners();
    await this.loadPersistedConfig();
    this.applyConfigToUI();
  }
  
  private getHTML(): string {
    return `
      <div class="outline-factory" style="
        display: grid;
        grid-template-rows: auto auto auto auto auto;
        gap: 1.5rem;
        padding: 1rem;
        height: 100%;
        overflow-y: auto;
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <!-- Ideas Section -->
        <div class="ideas-section" style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
        ">
          <label style="
            display: block;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: #374151;
          ">💭 Your Ideas</label>
          <textarea 
            id="ideas-textarea"
            placeholder="Describe your story ideas, themes, or concepts here... (optional)"
            style="
              width: 100%;
              min-height: 120px;
              padding: 0.75rem;
              border: 1px solid #d1d5db;
              border-radius: 6px;
              font-size: 0.9rem;
              resize: vertical;
              font-family: inherit;
            "
          ></textarea>
        </div>

        <!-- Genre & Themes Section -->
        <div class="genre-section" style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
        ">
          <h3 style="
            margin: 0 0 1rem 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #374151;
          ">🎭 Genre & Themes</h3>
          <div id="genre-checkboxes" style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
          "></div>
        </div>

        <!-- Style Guide Section -->
        <div class="style-section" style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
        ">
          <h3 style="
            margin: 0 0 1rem 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #374151;
          ">✍️ Style Guide</h3>
          <div id="style-checkboxes" style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
          "></div>
        </div>

        <!-- Context Configuration Section -->
        <div class="context-section" style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
        ">
          <h3 style="
            margin: 0 0 1rem 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #374151;
          ">⚙️ Story Configuration</h3>
          <div id="context-controls" style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
          "></div>
        </div>

        <!-- Action Buttons -->
        <div class="actions-section" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 1rem;
        ">
          <div id="validation-message" style="
            color: #dc2626;
            font-size: 0.875rem;
            font-weight: 500;
          "></div>
          
          <div style="display: flex; gap: 0.75rem;">
            <button 
              id="reset-button"
              style="
                padding: 0.5rem 1rem;
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 0.875rem;
                cursor: pointer;
                transition: all 0.2s;
              "
            >
              🔄 Reset to Default
            </button>
            
            <button 
              id="generate-button"
              style="
                padding: 0.5rem 1.5rem;
                background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
              "
            >
              ✨ Generate Outline
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  private bindElements(): void {
    // Upgrade ideas textarea to enhanced UniversalTextEditor
    const originalIdeasTextarea = this.container.querySelector('#ideas-textarea') as HTMLTextAreaElement;
    this.ideasTextarea = UniversalTextEditor.replace(originalIdeasTextarea, {
      mode: 'enhanced'  // Enable AI features and text transformation
    });
    this.resetButton = this.container.querySelector('#reset-button') as HTMLButtonElement;
    this.generateButton = this.container.querySelector('#generate-button') as HTMLButtonElement;
    this.validationMessage = this.container.querySelector('#validation-message') as HTMLElement;
    
    this.renderGenreCheckboxes();
    this.renderStyleCheckboxes();
    this.renderContextControls();
  }
  
  private renderGenreCheckboxes(): void {
    const container = this.container.querySelector('#genre-checkboxes')!;
    
    Object.entries(GENRE_OPTIONS).forEach(([category, options]) => {
      const typedOptions = options as readonly { readonly id: string; readonly label: string }[];
      const categoryDiv = document.createElement('div');
      categoryDiv.style.cssText = `
        background: white;
        padding: 0.75rem;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
      `;
      
      const title = document.createElement('div');
      title.textContent = category.charAt(0).toUpperCase() + category.slice(1);
      title.style.cssText = `
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #374151;
        font-size: 0.875rem;
      `;
      categoryDiv.appendChild(title);
      
      const checkboxContainer = document.createElement('div');
      checkboxContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      `;
      
      const categoryCheckboxes: HTMLInputElement[] = [];
      
      typedOptions.forEach((option) => {
        const label = document.createElement('label');
        label.style.cssText = `
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          transition: background-color 0.2s;
        `;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = option.id;
        checkbox.dataset['category'] = category;
        checkbox.style.cssText = `
          margin: 0;
          accent-color: #3b82f6;
        `;
        
        const span = document.createElement('span');
        span.textContent = option.label;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        
        label.addEventListener('mouseenter', () => {
          label.style.backgroundColor = '#f3f4f6';
        });
        label.addEventListener('mouseleave', () => {
          label.style.backgroundColor = 'transparent';
        });
        
        checkboxContainer.appendChild(label);
        categoryCheckboxes.push(checkbox);
      });
      
      this.genreCheckboxes.set(category, categoryCheckboxes);
      categoryDiv.appendChild(checkboxContainer);
      container.appendChild(categoryDiv);
    });
  }
  
  private renderStyleCheckboxes(): void {
    const container = this.container.querySelector('#style-checkboxes')!;
    
    Object.entries(STYLE_OPTIONS).forEach(([category, options]) => {
      const typedOptions = options as readonly { readonly id: string; readonly label: string }[];
      const categoryDiv = document.createElement('div');
      categoryDiv.style.cssText = `
        background: white;
        padding: 0.75rem;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
      `;
      
      const title = document.createElement('div');
      title.textContent = category.charAt(0).toUpperCase() + category.slice(1);
      title.style.cssText = `
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #374151;
        font-size: 0.875rem;
      `;
      categoryDiv.appendChild(title);
      
      const checkboxContainer = document.createElement('div');
      checkboxContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      `;
      
      const categoryCheckboxes: HTMLInputElement[] = [];
      
      typedOptions.forEach((option) => {
        const label = document.createElement('label');
        label.style.cssText = `
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          transition: background-color 0.2s;
        `;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = option.id;
        checkbox.dataset['category'] = category;
        checkbox.style.cssText = `
          margin: 0;
          accent-color: #3b82f6;
        `;
        
        const span = document.createElement('span');
        span.textContent = option.label;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        
        label.addEventListener('mouseenter', () => {
          label.style.backgroundColor = '#f3f4f6';
        });
        label.addEventListener('mouseleave', () => {
          label.style.backgroundColor = 'transparent';
        });
        
        checkboxContainer.appendChild(label);
        categoryCheckboxes.push(checkbox);
      });
      
      this.styleCheckboxes.set(category, categoryCheckboxes);
      categoryDiv.appendChild(checkboxContainer);
      container.appendChild(categoryDiv);
    });
  }
  
  private renderContextControls(): void {
    const container = this.container.querySelector('#context-controls')!;
    
    const contextFields = [
      { key: 'protagonists', label: 'Protagonists' },
      { key: 'antagonists', label: 'Antagonists' },
      { key: 'sideCharacters', label: 'Side Characters' },
      { key: 'locations', label: 'Locations' },
      { key: 'worldbuildingDetails', label: 'Worldbuilding Details' }
    ];
    
    contextFields.forEach(({ key, label }) => {
      const limits = CONTEXT_LIMITS[key as keyof typeof CONTEXT_LIMITS];
      
      const controlDiv = document.createElement('div');
      controlDiv.style.cssText = `
        background: white;
        padding: 0.75rem;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      `;
      
      const labelEl = document.createElement('label');
      labelEl.textContent = label;
      labelEl.style.cssText = `
        font-weight: 600;
        color: #374151;
        font-size: 0.875rem;
      `;
      
      const inputContainer = document.createElement('div');
      inputContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.5rem;
      `;
      
      const decreaseBtn = document.createElement('button');
      decreaseBtn.textContent = '−';
      decreaseBtn.style.cssText = `
        width: 30px;
        height: 30px;
        border: 1px solid #d1d5db;
        background: #f9fafb;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: bold;
        color: #374151;
      `;
      
      const input = document.createElement('input');
      input.type = 'number';
      input.min = limits.min.toString();
      input.max = limits.max.toString();
      input.value = this.config.context[key as keyof ContextConfig]!.toString();
      input.dataset['field'] = key;
      input.style.cssText = `
        width: 60px;
        text-align: center;
        padding: 0.25rem;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 0.875rem;
      `;
      
      const increaseBtn = document.createElement('button');
      increaseBtn.textContent = '+';
      increaseBtn.style.cssText = `
        width: 30px;
        height: 30px;
        border: 1px solid #d1d5db;
        background: #f9fafb;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: bold;
        color: #374151;
      `;
      
      const rangeText = document.createElement('span');
      rangeText.textContent = `(${limits.min}-${limits.max})`;
      rangeText.style.cssText = `
        font-size: 0.75rem;
        color: #6b7280;
        margin-left: 0.5rem;
      `;
      
      // Event listeners for +/- buttons
      decreaseBtn.addEventListener('click', () => {
        const currentValue = parseInt(input.value);
        if (currentValue > limits.min) {
          input.value = (currentValue - 1).toString();
          this.updateConfigFromUI();
        }
      });
      
      increaseBtn.addEventListener('click', () => {
        const currentValue = parseInt(input.value);
        if (currentValue < limits.max) {
          input.value = (currentValue + 1).toString();
          this.updateConfigFromUI();
        }
      });
      
      inputContainer.appendChild(decreaseBtn);
      inputContainer.appendChild(input);
      inputContainer.appendChild(increaseBtn);
      inputContainer.appendChild(rangeText);
      
      controlDiv.appendChild(labelEl);
      controlDiv.appendChild(inputContainer);
      container.appendChild(controlDiv);
      
      this.contextInputs.set(key, input);
    });
  }
  
  private setupEventListeners(): void {
    // Ideas textarea (enhanced with AI features)
    if (this.ideasTextarea) {
      this.ideasTextarea.addEventListener('input', () => {
        this.updateConfigFromUI();
      });
    }
    
    // Genre checkboxes
    this.genreCheckboxes.forEach((checkboxes) => {
      checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          this.updateConfigFromUI();
        });
      });
    });
    
    // Style checkboxes
    this.styleCheckboxes.forEach((checkboxes) => {
      checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          this.updateConfigFromUI();
        });
      });
    });
    
    // Context inputs
    this.contextInputs.forEach((input) => {
      input.addEventListener('change', () => {
        this.updateConfigFromUI();
      });
    });
    
    // Reset button
    this.resetButton!.addEventListener('click', () => {
      void this.resetToDefaults();
    });
    
    // Generate button
    this.generateButton!.addEventListener('click', () => {
      void this.handleGenerate();
    });
  }
  
  private updateConfigFromUI(): void {
    // Update ideas
    this.config.ideas = this.ideasTextarea?.value ?? '';
    
    // Update genres
    this.genreCheckboxes.forEach((checkboxes, category) => {
      const selected = checkboxes
        .filter(cb => cb.checked)
        .map(cb => cb.value);
      (this.config.genres as Record<string, string[]>)[category] = selected;
    });
    
    // Update styles
    this.styleCheckboxes.forEach((checkboxes, category) => {
      const selected = checkboxes
        .filter(cb => cb.checked)
        .map(cb => cb.value);
      (this.config.styleGuide as Record<string, string[]>)[category] = selected;
    });
    
    // Update context
    this.contextInputs.forEach((input, key) => {
      const value = parseInt(input.value) || 0;
      (this.config.context as Record<string, number>)[key] = value;
    });
    
    this.validateAndUpdateUI();
    this.notifyChange();
  }
  
  private validateAndUpdateUI(): void {
    const validation = this.service.validateConfig(this.config);
    
    this.validationMessage!.textContent = validation.isValid ? '' : validation.message;
    this.generateButton!.disabled = !validation.isValid;
    this.generateButton!.style.opacity = validation.isValid ? '1' : '0.5';
  }
  
  private async handleGenerate(): Promise<void> {
    const originalText = this.generateButton!.textContent;
    this.generateButton!.disabled = true;
    this.generateButton!.textContent = '⏳ Generating...';
    
    try {
      const result = await this.service.generateOutline(this.config);
      this.emitGenerated(result);
    } catch (error) {
      console.error('Failed to generate outline:', error);
      this.validationMessage!.textContent = error instanceof Error ? error.message : 'Generation failed';
    } finally {
      this.generateButton!.disabled = false;
      this.generateButton!.textContent = originalText;
      this.validateAndUpdateUI();
    }
  }
  
  private async loadPersistedConfig(): Promise<void> {
    const saved = await this.service.loadConfiguration();
    if (saved) {
      this.config = saved;
    }
  }
  
  private applyConfigToUI(): void {
    // Apply ideas
    if (this.ideasTextarea) {
      this.ideasTextarea.value = this.config.ideas;
    }
    
    // Apply genres
    this.genreCheckboxes.forEach((checkboxes, category) => {
      const selected = this.config.genres[category] ?? [];
      checkboxes.forEach(checkbox => {
        checkbox.checked = selected.includes(checkbox.value);
      });
    });
    
    // Apply styles
    this.styleCheckboxes.forEach((checkboxes, category) => {
      const selected = this.config.styleGuide[category] ?? [];
      checkboxes.forEach(checkbox => {
        checkbox.checked = selected.includes(checkbox.value);
      });
    });
    
    // Apply context
    this.contextInputs.forEach((input, key) => {
      const value = this.config.context[key];
      input.value = value!.toString();
    });
    
    this.validateAndUpdateUI();
  }
  
  private async resetToDefaults(): Promise<void> {
    await this.service.resetToDefaults();
    this.config = this.service.getDefaultConfiguration();
    this.applyConfigToUI();
    this.notifyChange();
  }
  
  private debouncedSave(): void {
    clearTimeout(this.saveTimeout!);
    this.saveTimeout = window.setTimeout(() => {
      void this.service.saveConfiguration(this.config);
    }, this.SAVE_DEBOUNCE_MS);
  }
  
  private notifyChange(): void {
    this.changeHandlers.forEach(handler => { handler(this.config); });
    this.debouncedSave();
  }
  
  private emitGenerated(result: OutlineGenerationResult): void {
    const event = new CustomEvent('outline-generated', {
      detail: result,
      bubbles: true
    });
    this.container.dispatchEvent(event);
  }
  
  // Public API
  onChange(handler: (config: OutlineFactoryConfig) => void): void {
    this.changeHandlers.push(handler);
  }
  
  getCurrentConfig(): OutlineFactoryConfig {
    return { ...this.config };
  }
  
  async generateOutline(): Promise<OutlineGenerationResult> {
    return await this.service.generateOutline(this.config);
  }
} 