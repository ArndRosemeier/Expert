import type { IdeaBoard } from '../IdeaBoard';

export interface ToolPanelConfig {
  onColorChange: (color: string) => void;
  onSearchToggle: () => void;
  onAddPostIt: () => void;
  onExport: () => void;
  onSettings: () => void;
}

export class ToolPanel {
  private container: HTMLElement;
  private ideaBoard: IdeaBoard;
  private config: ToolPanelConfig;
  private colorPicker: HTMLElement | null = null;
  private searchBox: HTMLElement | null = null;
  private exportMenu: HTMLElement | null = null;
  private settingsMenu: HTMLElement | null = null;
  private currentColor: string = '#fff9c4'; // Default light yellow
  
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
    this.container = this.createContainer();
    this.createToolButtons();
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

    // Color picker button
    const colorBtn = this.createToolButton('🎨', 'Colors', () => {
      this.toggleColorPicker();
    });

    // Search button
    const searchBtn = this.createToolButton('🔍', 'Search', () => {
      this.toggleSearch();
    });

    // Export button (placeholder for now)
    const exportBtn = this.createToolButton('📁', 'Export', () => {
      this.toggleExportMenu();
    });

    // Settings button (placeholder for now)
    const settingsBtn = this.createToolButton('⚙️', 'Settings', () => {
      this.toggleSettingsMenu();
    });

    this.container.appendChild(addBtn);
    this.container.appendChild(colorBtn);
    this.container.appendChild(searchBtn);
    this.container.appendChild(exportBtn);
    this.container.appendChild(settingsBtn);
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
        const isSelected = this.colors[index].value === color;
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

  private toggleExportMenu(): void {
    if (this.exportMenu) {
      this.exportMenu.remove();
      this.exportMenu = null;
      return;
    }

    this.exportMenu = this.createExportMenu();
    // Append to the same parent as the tool panel to ensure proper layering
    this.container.parentElement?.appendChild(this.exportMenu);
    this.positionExportMenu();
  }

  private createExportMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.style.cssText = `
      position: absolute;
      background: white;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      z-index: 10001;
      border: 1px solid rgba(0, 0, 0, 0.1);
      min-width: 150px;
    `;

    const exportOptions = [
      { name: 'Export as JSON', action: () => this.config.onExport() },
      { name: 'Export as Markdown', action: () => this.config.onExport() },
      { name: 'Export as HTML', action: () => this.config.onExport() },
    ];

    exportOptions.forEach(option => {
      const optionButton = document.createElement('button');
      optionButton.textContent = option.name;
      optionButton.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.2s ease;
      `;

      optionButton.addEventListener('mouseenter', () => {
        optionButton.style.backgroundColor = '#f5f5f5';
      });

      optionButton.addEventListener('mouseleave', () => {
        optionButton.style.backgroundColor = 'transparent';
      });

      optionButton.addEventListener('click', () => {
        option.action();
        this.exportMenu?.remove();
        this.exportMenu = null;
      });

      menu.appendChild(optionButton);
    });

    // Close menu when clicking outside
    const closeHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        this.exportMenu = null;
        document.removeEventListener('click', closeHandler);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 100);

    return menu;
  }

  private positionExportMenu(): void {
    if (!this.exportMenu) return;

    const exportButton = this.container.children[3] as HTMLElement; // Export button is fourth
    if (exportButton) {
      const exportButtonRect = exportButton.getBoundingClientRect();
      this.exportMenu.style.top = `${exportButtonRect.bottom + 8}px`;
      this.exportMenu.style.left = `${exportButtonRect.left}px`;
    }
  }

  private toggleSettingsMenu(): void {
    if (this.settingsMenu) {
      this.settingsMenu.remove();
      this.settingsMenu = null;
      return;
    }

    this.settingsMenu = this.createSettingsMenu();
    // Append to the same parent as the tool panel to ensure proper layering
    this.container.parentElement?.appendChild(this.settingsMenu);
    this.positionSettingsMenu();
  }

  private createSettingsMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.style.cssText = `
      position: absolute;
      background: white;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      z-index: 10001;
      border: 1px solid rgba(0, 0, 0, 0.1);
      min-width: 150px;
    `;

    const settingsOptions = [
      { name: 'Settings', action: () => this.config.onSettings() },
      { name: 'About', action: () => this.config.onSettings() }, // Placeholder for about action
    ];

    settingsOptions.forEach(option => {
      const optionButton = document.createElement('button');
      optionButton.textContent = option.name;
      optionButton.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.2s ease;
      `;

      optionButton.addEventListener('mouseenter', () => {
        optionButton.style.backgroundColor = '#f5f5f5';
      });

      optionButton.addEventListener('mouseleave', () => {
        optionButton.style.backgroundColor = 'transparent';
      });

      optionButton.addEventListener('click', () => {
        option.action();
        this.settingsMenu?.remove();
        this.settingsMenu = null;
      });

      menu.appendChild(optionButton);
    });

    // Close menu when clicking outside
    const closeHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        this.settingsMenu = null;
        document.removeEventListener('click', closeHandler);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 100);

    return menu;
  }

  private positionSettingsMenu(): void {
    if (!this.settingsMenu) return;

    const settingsButton = this.container.children[4] as HTMLElement; // Settings button is fifth
    if (settingsButton) {
      const settingsButtonRect = settingsButton.getBoundingClientRect();
      this.settingsMenu.style.top = `${settingsButtonRect.bottom + 8}px`;
      this.settingsMenu.style.left = `${settingsButtonRect.left}px`;
    }
  }

  getCurrentColor(): string {
    return this.currentColor;
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
    if (this.exportMenu) {
      this.exportMenu.remove();
    }
    if (this.settingsMenu) {
      this.settingsMenu.remove();
    }
    this.container.remove();
  }
} 