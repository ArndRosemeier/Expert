import type { IdeaBoard } from '../IdeaBoard';
import * as state from '../../state';
import { StorageService, type IStorageService } from '../../StorageService';

// Storage key for persisting model purpose selection
const STORAGE_KEY_MODEL_PURPOSE = 'idea_board_model_purpose';

// Available AI model purposes for idea board operations
const AI_MODEL_PURPOSES = [
  { key: 'creator', label: 'Creator' },
  { key: 'rater', label: 'Rater' },
  { key: 'editor', label: 'Editor' },
  { key: 'prose', label: 'Prose' },
] as const;

export interface ToolPanelConfig {
  onColorChange: (color: string) => void;
  onSearchToggle: () => void;
  onAddPostIt: () => void;
  onAddBackgroundRect: () => void;
  onAddNodeContent: () => void;
  onSummarize: () => void;
  onExpand: () => void;
  onGenerateIdeas: () => void;
  onTransform: () => void;
  onExportMarkdown: () => void;
  onClearAll: () => void;
  onModelChange: (modelPurpose: string) => void;
}

export class ToolPanel {
  private container: HTMLElement;
  private ideaBoard: IdeaBoard;
  private config: ToolPanelConfig;
  private colorPicker: HTMLElement | null = null;
  private searchBox: HTMLElement | null = null;
  private currentColor: string = '#fff9c4'; // Default light yellow
  private selectedModelPurpose: string = 'editor'; // Default to editor model
  private modelDropdownElement: HTMLSelectElement | null = null;
  private storageService: Promise<IStorageService>;
  
  // Available post-it colors
  private readonly colors = [
    { name: 'Yellow', value: '#fff9c4' },     // Light yellow
    { name: 'Blue', value: '#bbdefb' },       // Light blue  
    { name: 'Green', value: '#c8e6c9' },      // Light green
    { name: 'Pink', value: '#f8bbd9' },       // Light pink
    { name: 'Orange', value: '#ffcc80' },     // Light orange
    { name: 'White', value: '#ffffff' },      // White
    { name: 'Purple', value: '#e1bee7' },     // Light purple
    { name: 'Red', value: '#ffcdd2' }         // Light red
  ];

  constructor(ideaBoard: IdeaBoard, config: ToolPanelConfig) {
    this.ideaBoard = ideaBoard;
    this.config = config;
    this.storageService = StorageService.getInstance();
    this.container = this.createContainer();
    this.createToolButtons();
    
    // Load saved model purpose and refresh dropdown
    this.loadModelPurposeFromStorage();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'idea-board-tool-panel';
    container.style.cssText = `
      position: absolute;
      top: 12px;
      left: 12px;
      display: flex;
      gap: 8px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      padding: 8px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    return container;
  }

  private createToolButtons(): void {
    // Add Post-it button
    const addBtn = this.createToolButton('➕', 'Add Post-it', () => {
      this.config.onAddPostIt();
    });

    // Add Background Rectangle button
    const addBgRectBtn = this.createToolButton('⬛', 'Add Background Area', () => {
      this.config.onAddBackgroundRect();
    });

    // Add Node Content button
    const nodeBtn = this.createToolButton('📄', 'Add Node Content', () => {
      this.config.onAddNodeContent();
    });

    // Color picker button
    const colorBtn = this.createToolButton('🎨', 'Colors', () => {
      this.toggleColorPicker();
    });

    // Search button
    const searchBtn = this.createToolButton('🔍', 'Search', () => {
      this.toggleSearch();
    });

    // Summarize button
    const summarizeBtn = this.createToolButton('🧠', 'Summarize', () => {
      this.config.onSummarize();
    });

    // Continue button
    const continueBtn = this.createToolButton('🔄', 'Continue', () => {
      this.config.onExpand();
    });

    // Generate Ideas button
    const ideasBtn = this.createToolButton('💡', 'Generate Ideas', () => {
      this.config.onGenerateIdeas();
    });

    // Transform button
    const transformBtn = this.createToolButton('✨', 'Transform', () => {
      this.config.onTransform();
    });

    // Export as Markdown button
    const exportBtn = this.createToolButton('📁', 'Export as Markdown', () => {
      this.config.onExportMarkdown();
    });

    // Clear All button
    const clearBtn = this.createToolButton('🗑️', 'Clear All', () => {
      this.config.onClearAll();
    });

    // Model Selection Dropdown
    const modelDropdown = this.createModelDropdown();

    this.container.appendChild(addBtn);
    this.container.appendChild(addBgRectBtn);
    this.container.appendChild(nodeBtn);
    this.container.appendChild(colorBtn);
    this.container.appendChild(searchBtn);
    this.container.appendChild(summarizeBtn);
    this.container.appendChild(continueBtn);
    this.container.appendChild(ideasBtn);
    this.container.appendChild(transformBtn);
    this.container.appendChild(exportBtn);
    this.container.appendChild(clearBtn);
    this.container.appendChild(modelDropdown);
  }

  private createToolButton(icon: string, tooltip: string, onClick: () => void): HTMLElement {
    const button = document.createElement('button');
    button.innerHTML = icon;
    button.title = tooltip;
    button.style.cssText = `
      background: none;
      border: none;
      font-size: 18px;
      padding: 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      height: 36px;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = 'transparent';
    });

    button.addEventListener('click', onClick);
    return button;
  }

  private toggleColorPicker(): void {
    if (this.colorPicker) {
      this.colorPicker.remove();
      this.colorPicker = null;
      return;
    }

    this.colorPicker = this.createColorPicker();
    // Append to the same parent as the tool panel to ensure proper layering
    this.container.parentElement?.appendChild(this.colorPicker);
    this.positionColorPicker();
  }

  private createColorPicker(): HTMLElement {
    const picker = document.createElement('div');
    picker.style.cssText = `
      position: absolute;
      background: white;
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      z-index: 10001;
      border: 1px solid rgba(0, 0, 0, 0.1);
    `;

    this.colors.forEach(color => {
      const colorButton = document.createElement('button');
      colorButton.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid ${color.value === this.currentColor ? '#333' : 'transparent'};
        background-color: ${color.value};
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: ${color.value === '#ffffff' ? 'inset 0 0 0 1px rgba(0,0,0,0.2)' : '0 2px 4px rgba(0,0,0,0.1)'};
      `;

      colorButton.title = color.name;
      
      colorButton.addEventListener('mouseenter', () => {
        colorButton.style.transform = 'scale(1.1)';
      });

      colorButton.addEventListener('mouseleave', () => {
        colorButton.style.transform = 'scale(1)';
      });

      colorButton.addEventListener('click', () => {
        this.selectColor(color.value);
      });

      picker.appendChild(colorButton);
    });

    // Close picker when clicking outside
    const closeHandler = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove();
        this.colorPicker = null;
        document.removeEventListener('click', closeHandler);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 100);

    return picker;
  }

  private positionColorPicker(): void {
    if (!this.colorPicker) return;

    const colorButton = this.container.children[1] as HTMLElement; // Color button is second
    if (colorButton) {
      const colorButtonRect = colorButton.getBoundingClientRect();
      this.colorPicker.style.top = `${colorButtonRect.bottom + 8}px`;
      this.colorPicker.style.left = `${colorButtonRect.left}px`;
    }
  }

  private selectColor(color: string): void {
    this.currentColor = color;
    this.config.onColorChange(color);
    
    // Update color picker visual state
    if (this.colorPicker) {
      const buttons = this.colorPicker.querySelectorAll('button');
      buttons.forEach((btn, index) => {
        const isSelected = this.colors[index]?.value === color;
        btn.style.border = `2px solid ${isSelected ? '#333' : 'transparent'}`;
      });
    }

    // Close color picker after selection
    if (this.colorPicker) {
      this.colorPicker.remove();
      this.colorPicker = null;
    }
  }

  private toggleSearch(): void {
    if (this.searchBox) {
      this.searchBox.remove();
      this.searchBox = null;
      return;
    }

    this.searchBox = this.createSearchBox();
    // Append to the same parent as the tool panel to ensure proper layering
    this.container.parentElement?.appendChild(this.searchBox);
    this.positionSearchBox();
    
    // Focus the search input
    const input = this.searchBox.querySelector('input');
    if (input) {
      input.focus();
    }
  }

  private createSearchBox(): HTMLElement {
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `
      position: absolute;
      background: white;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      z-index: 10001;
      border: 1px solid rgba(0, 0, 0, 0.1);
      min-width: 250px;
    `;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search post-its...';
    searchInput.style.cssText = `
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 8px 12px;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
    `;

    const resultsContainer = document.createElement('div');
    resultsContainer.style.cssText = `
      margin-top: 8px;
      max-height: 200px;
      overflow-y: auto;
    `;

    let searchTimeout: number;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = (e.target as HTMLInputElement).value.trim();
      
      searchTimeout = window.setTimeout(() => {
        this.performSearch(query, resultsContainer);
      }, 300);
    });

    // Close search when clicking outside
    const closeHandler = (e: MouseEvent) => {
      if (!searchContainer.contains(e.target as Node)) {
        searchContainer.remove();
        this.searchBox = null;
        document.removeEventListener('click', closeHandler);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 100);

    // Close on ESC key
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        searchContainer.remove();
        this.searchBox = null;
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);

    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(resultsContainer);
    return searchContainer;
  }

  private positionSearchBox(): void {
    if (!this.searchBox) return;

    const searchButton = this.container.children[2] as HTMLElement; // Search button is third
    if (searchButton) {
      const searchButtonRect = searchButton.getBoundingClientRect();
      this.searchBox.style.top = `${searchButtonRect.bottom + 8}px`;
      this.searchBox.style.left = `${searchButtonRect.left}px`;
    }
  }

  private performSearch(query: string, resultsContainer: HTMLElement): void {
    resultsContainer.innerHTML = '';
    
    if (!query) {
      return;
    }

    // Get all post-its from the idea board and search their content
    const postIts = this.ideaBoard.getAllPostIts();
    const matches = postIts.filter((postIt) => 
      postIt.content.toLowerCase().includes(query.toLowerCase())
    );

    if (matches.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = 'No matching post-its found';
      noResults.style.cssText = `
        color: #666;
        font-style: italic;
        padding: 8px 0;
        text-align: center;
      `;
      resultsContainer.appendChild(noResults);
      return;
    }

    matches.forEach((postIt) => {
      const resultItem = document.createElement('div');
      resultItem.style.cssText = `
        padding: 8px;
        border-radius: 4px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
        transition: background-color 0.2s ease;
      `;

      // Highlight matching text
      const content = postIt.content;
      const index = content.toLowerCase().indexOf(query.toLowerCase());
      const highlighted = content.substring(0, index) + 
        `<mark style="background: yellow; padding: 0 2px;">${content.substring(index, index + query.length)}</mark>` + 
        content.substring(index + query.length);

      resultItem.innerHTML = highlighted;

      resultItem.addEventListener('mouseenter', () => {
        resultItem.style.backgroundColor = '#f5f5f5';
      });

      resultItem.addEventListener('mouseleave', () => {
        resultItem.style.backgroundColor = 'transparent';
      });

      resultItem.addEventListener('click', () => {
        // Focus on the found post-it
        this.ideaBoard.focusOnPostIt(postIt.id);
        
        // Close search
        if (this.searchBox) {
          this.searchBox.remove();
          this.searchBox = null;
        }
      });

      resultsContainer.appendChild(resultItem);
    });
  }





  getCurrentColor(): string {
    return this.currentColor;
  }

  getSelectedModelPurpose(): string {
    return this.selectedModelPurpose;
  }

  /**
   * Refresh the model dropdown with current model names
   */
  refreshModelDropdown(): void {
    this.updateModelDropdownOptions();
  }

  /**
   * Load the saved model purpose from storage
   */
  private async loadModelPurposeFromStorage(): Promise<void> {
    try {
      const storage = await this.storageService;
      const savedPurpose = await storage.get<string>(STORAGE_KEY_MODEL_PURPOSE);
      
      if (savedPurpose && AI_MODEL_PURPOSES.some(p => p.key === savedPurpose)) {
        this.selectedModelPurpose = savedPurpose;
        console.log(`🤖 Loaded saved model purpose: ${savedPurpose}`);
      } else {
        console.log(`🤖 Using default model purpose: ${this.selectedModelPurpose}`);
      }
    } catch (error) {
      console.warn('Failed to load model purpose from storage:', error);
    }
    
    // Refresh dropdown after loading
    setTimeout(() => this.refreshModelDropdown(), 100);
  }

  /**
   * Save the current model purpose to storage
   */
  private async saveModelPurposeToStorage(): Promise<void> {
    try {
      const storage = await this.storageService;
      await storage.set(STORAGE_KEY_MODEL_PURPOSE, this.selectedModelPurpose);
      console.log(`🤖 Saved model purpose: ${this.selectedModelPurpose}`);
    } catch (error) {
      console.warn('Failed to save model purpose to storage:', error);
    }
  }

  /**
   * Create a model selection dropdown for AI operations
   */
  private createModelDropdown(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
      display: inline-block;
      height: 34px;
      display: flex;
      align-items: center;
    `;

    const dropdown = document.createElement('select');
    dropdown.title = 'Select AI Model for Operations';
    dropdown.style.cssText = `
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      min-width: 120px;
      max-width: 200px;
      height: 34px;
      box-sizing: border-box;
    `;

    this.modelDropdownElement = dropdown;
    this.updateModelDropdownOptions();

    // Handle selection changes
    dropdown.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.selectedModelPurpose = target.value;
      this.config.onModelChange(target.value);
      this.saveModelPurposeToStorage(); // Save the selection
      console.log(`🤖 AI model changed to: ${target.value}`);
    });

    container.appendChild(dropdown);
    return container;
  }

  /**
   * Update the dropdown options with actual model names
   */
  private updateModelDropdownOptions(): void {
    if (!this.modelDropdownElement) return;

    // Clear existing options
    this.modelDropdownElement.innerHTML = '';

    try {
      // Try to get the settings manager to get actual model names
      const settingsManager = state.getSettingsManager();
      
      if (settingsManager) {
        const profile = settingsManager.getLastUsedProfile();
        const selectedModels = profile?.selectedModels || {};

        // Add options with actual model names
        AI_MODEL_PURPOSES.forEach(purpose => {
          const option = document.createElement('option');
          option.value = purpose.key;
          
          const modelName = selectedModels[purpose.key];
          if (modelName) {
            // Extract a shorter model name (remove provider prefix if present)
            const shortName = modelName.includes('/') ? modelName.split('/')[1] : modelName;
            option.textContent = `${purpose.label}: ${shortName}`;
          } else {
            option.textContent = `${purpose.label}: Not configured`;
          }
          
          if (purpose.key === this.selectedModelPurpose) {
            option.selected = true;
          }
          this.modelDropdownElement!.appendChild(option);
        });
      } else {
        // Fallback: just show purpose labels
        AI_MODEL_PURPOSES.forEach(purpose => {
          const option = document.createElement('option');
          option.value = purpose.key;
          option.textContent = purpose.label;
          if (purpose.key === this.selectedModelPurpose) {
            option.selected = true;
          }
          this.modelDropdownElement!.appendChild(option);
        });
      }
    } catch (error) {
      console.warn('Could not load model names for dropdown:', error);
      // Fallback: just show purpose labels
      AI_MODEL_PURPOSES.forEach(purpose => {
        const option = document.createElement('option');
        option.value = purpose.key;
        option.textContent = purpose.label;
        if (purpose.key === this.selectedModelPurpose) {
          option.selected = true;
        }
        this.modelDropdownElement!.appendChild(option);
      });
    }
  }

  attachTo(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  destroy(): void {
    if (this.colorPicker) {
      this.colorPicker.remove();
    }
    if (this.searchBox) {
      this.searchBox.remove();
    }
    this.container.remove();
  }
} 