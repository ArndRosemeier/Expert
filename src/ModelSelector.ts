import { OpenRouterClient } from './OpenRouterClient';
import type { OpenRouterModel } from './OpenRouterClient';
import { StorageService, IStorageService } from './StorageService';
import { showBalanceModal } from './ui/modals/BalanceModal';

// Use IndexedDB storage keys instead of localStorage
const STORAGE_KEY_API_KEY = 'openrouter_api_key';
const STORAGE_KEY_MODELS = 'openrouter_model_purposes';
const STORAGE_KEY_WEB_SEARCH = 'openrouter_web_search_preferences';
const PURPOSES = [
  { key: 'creator', label: 'Creator' },
  { key: 'rater', label: 'Rater' },
  { key: 'editor', label: 'Editor' },
  { key: 'prose', label: 'Prose' },
];

function formatPromptCompletionPricing(pricing: Record<string, string>) {
  const result: string[] = [];
  if (pricing['prompt']) {
    const perToken = parseFloat(pricing['prompt']);
    if (!isNaN(perToken)) {
      const perMillion = perToken * 1_000_000;
      result.push(`Input: $${perMillion.toLocaleString(undefined, { maximumFractionDigits: 2 })} per million tokens`);
    }
  }
  if (pricing['completion']) {
    const perToken = parseFloat(pricing['completion']);
    if (!isNaN(perToken)) {
      const perMillion = perToken * 1_000_000;
      result.push(`Output: $${perMillion.toLocaleString(undefined, { maximumFractionDigits: 2 })} per million tokens`);
    }
  }
  return result;
}

/**
 * Checks if the OpenRouter API key looks valid (format only, not actual validity)
 */
function isApiKeyFormatValid(key: string): boolean {
  return typeof key === 'string' && key.startsWith('sk-') && key.length >= 32;
}

export class ModelSelector {
  private onSelect: (selectedModels: Record<string, string>, webSearchEnabled?: Record<string, boolean>) => void;
  private closeModal: () => void;
  private apiKey: string = '';
  private models: OpenRouterModel[] = [];
  private loading: boolean = false;
  private testing: boolean = false;
  private error: string | null = null;
  private fetched: boolean = false;
  private selectedModels: Record<string, string> = {};
  private webSearchEnabled: Record<string, boolean> = {}; // Track web search preferences per purpose
  private root: HTMLElement | null = null;
  private storageService: Promise<IStorageService>;
  private initializationPromise: Promise<void>;
  
  // UI Element References for robust event handling
  private apiKeyInput: HTMLInputElement | null = null;
  private testButton: HTMLButtonElement | null = null;
  private balanceButton: HTMLButtonElement | null = null;
  private fetchButton: HTMLButtonElement | null = null;
  
  // Debounced save function to prevent excessive storage calls
  private saveTimeoutId: number | null = null;
  private readonly SAVE_DEBOUNCE_MS = 300;

  constructor(
    onSelect: (selectedModels: Record<string, string>, webSearchEnabled?: Record<string, boolean>) => void,
    closeModal: () => void,
  ) {
    this.onSelect = onSelect;
    this.closeModal = closeModal;
    this.storageService = StorageService.getInstance();
    this.initializationPromise = this.initializeAsync();
  }

  public async waitForInitialization(): Promise<void> {
    return this.initializationPromise;
  }

  private async initializeAsync(): Promise<void> {
    await this.loadFromStorage();
    if (this.apiKey && !this.fetched) {
      try {
        await this.fetchModels();
      } catch (error) {
        console.warn('Failed to auto-fetch models during initialization:', error);
      }
    }
  }

  render(root: HTMLElement) {
    this.root = root;
    this.update();
  }

  /**
   * Centralized method to save API key with debouncing and error handling
   */
  private async debouncedSaveApiKey(): Promise<void> {
    // Clear existing timeout
    if (this.saveTimeoutId !== null) {
      clearTimeout(this.saveTimeoutId);
    }
    
    // Set new timeout for debounced save
    this.saveTimeoutId = window.setTimeout(async () => {
      try {
        console.log('💾 Saving OpenRouter API key to IndexedDB...');
        const storage = await this.storageService;
        await storage.set(STORAGE_KEY_API_KEY, this.apiKey);
        console.log('✅ OpenRouter API key saved successfully to IndexedDB');
        
        // Update button states after successful save
        this.updateButtonStates();
      } catch (error) {
        console.error('❌ CRITICAL: Failed to save OpenRouter API key:', error);
        // Show user-visible error
        this.showStorageError('Failed to save API key. Please try again.');
      } finally {
        this.saveTimeoutId = null;
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  /**
   * Centralized method to update button states
   */
    private updateButtonStates(): void {
    if (this.testButton) {
      this.testButton.disabled = this.testing || !this.apiKey;
      this.testButton.style.background = this.testing || !this.apiKey ? '#d1d5db' : '#10b981';
      this.testButton.style.cursor = this.testing || !this.apiKey ? 'not-allowed' : 'pointer';
      this.testButton.textContent = this.testing ? 'Testing...' : 'Test API Key';
    }

    if (this.balanceButton) {
      this.balanceButton.disabled = this.testing || !this.apiKey;
      this.balanceButton.style.background = this.testing || !this.apiKey ? '#d1d5db' : '#f59e0b';
      this.balanceButton.style.cursor = this.testing || !this.apiKey ? 'not-allowed' : 'pointer';
      this.balanceButton.textContent = this.testing ? 'Checking...' : 'Check Balance';
    }

    if (this.fetchButton) {
      this.fetchButton.disabled = this.loading || !this.apiKey;
      this.fetchButton.style.background = this.loading || !this.apiKey ? '#93c5fd' : 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)';
      this.fetchButton.style.cursor = this.loading || !this.apiKey ? 'not-allowed' : 'pointer';
      this.fetchButton.textContent = this.loading ? 'Fetching...' : 'Fetch Models';
    }
  }

  /**
   * Show storage error to user
   */
  private showStorageError(message: string): void {
    // Create or update error display
    const container = this.root?.querySelector('.model-selector-container');
    if (!container) return;
    
    let errorDiv = container.querySelector('.storage-error') as HTMLElement;
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.className = 'storage-error';
      errorDiv.style.cssText = `
        color: #dc2626;
        background: #fee2e2;
        border: 1px solid #fecaca;
        border-radius: 0.5rem;
        padding: 0.75rem;
        margin-bottom: 1rem;
        font-weight: 500;
      `;
      container.insertBefore(errorDiv, container.firstChild);
    }
    
    errorDiv.textContent = `⚠️ ${message}`;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (errorDiv && errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 5000);
  }

  /**
   * Centralized event handler setup for API key input
   */
  private setupApiKeyInputEvents(): void {
    if (!this.apiKeyInput) return;

    // Remove any existing listeners to prevent duplicates
    const newInput = this.apiKeyInput.cloneNode(true) as HTMLInputElement;
    const parentNode = this.apiKeyInput.parentNode;
    if (parentNode) {
      parentNode.replaceChild(newInput, this.apiKeyInput);
    }
    this.apiKeyInput = newInput;

    // Input event - save on every keystroke (debounced)
    this.apiKeyInput.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.apiKey = target.value;
      
      // Immediate UI feedback
      this.updateButtonStates();
      
      // Debounced save to storage
      void this.debouncedSaveApiKey();
    });

    // Focus/blur events for visual feedback
    this.apiKeyInput.addEventListener('focus', () => {
      const input = this.apiKeyInput;
      if (input) {
        input.style.borderColor = '#3b82f6';
        input.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
      }
    });

    this.apiKeyInput.addEventListener('blur', () => {
      const input = this.apiKeyInput;
      if (input) {
        input.style.borderColor = '#d1d5db';
        input.style.boxShadow = 'none';
      }
    });

    // Paste event - handle pasted content
    this.apiKeyInput.addEventListener('paste', () => {
      // Small delay to allow paste to complete
      setTimeout(() => {
        const input = this.apiKeyInput;
        if (input) {
          this.apiKey = input.value;
          this.updateButtonStates();
          void this.debouncedSaveApiKey();
        }
      }, 50);
    });

    // Keyboard shortcuts
    this.apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.apiKey && !this.testing && !this.loading) {
        // Enter key - test API key if available
        e.preventDefault();
        void this.testApiKey();
      } else if (e.key === 'Escape') {
        // Escape key - blur input
        const input = this.apiKeyInput;
        if (input) {
          input.blur();
        }
      }
    });
  }

  update() {
    if (!this.root) return;
    this.root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'model-selector-container';
    container.style.cssText = `
      width: 100%;
      padding: 2vw;
      background: rgba(255,255,255,0.95);
      border-radius: 1.5rem;
      box-shadow: 0 4px 32px 0 rgba(0,0,0,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      box-sizing: border-box;
    `;

    // Header
    const h2 = document.createElement('h2');
    h2.textContent = 'Configure OpenRouter Models';
    h2.style.cssText = `
      font-size: 1.5rem;
      font-weight: bold;
      margin: 0 0 0.5rem 0;
      text-align: center;
      letter-spacing: 0.01em;
      background: linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%);
      color: white;
      border-radius: 1rem;
      padding: 0.75rem 0;
      box-shadow: 0 2px 8px 0 rgba(59,130,246,0.10);
    `;
    container.appendChild(h2);

    // API key input section
    const inputDiv = document.createElement('div');
    inputDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    `;

    // Create API key input with robust setup
    this.apiKeyInput = document.createElement('input');
    this.apiKeyInput.type = 'password';
    this.apiKeyInput.placeholder = 'Enter OpenRouter API Key';
    this.apiKeyInput.value = this.apiKey;
    this.apiKeyInput.style.cssText = `
      padding: 0.75rem 1rem;
      border: 1.5px solid #d1d5db;
      border-radius: 0.75rem;
      font-size: 1rem;
      background: #f9fafb;
      transition: all 0.2s;
      outline: none;
    `;
    inputDiv.appendChild(this.apiKeyInput);

    // Format warning
    const formatWarning = document.createElement('div');
    formatWarning.style.cssText = `
      color: #b91c1c;
      background: #fee2e2;
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
      font-size: 0.95rem;
      font-weight: 500;
      margin-bottom: 0.25rem;
      display: none;
    `;
    formatWarning.textContent = '⚠️ This API key does not match the expected format (should start with "sk-" and be at least 32 characters). It may not work.';
    inputDiv.appendChild(formatWarning);

    // Info section
    const info = document.createElement('div');
    info.innerHTML = '<strong>Info:</strong> Your API key and model selections are stored in your browser\'s IndexedDB. Anyone with access to this browser profile can view them.';
    info.style.cssText = `
      font-size: 0.85rem;
      color: #b45309;
      background: #fef3c7;
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
    `;
    inputDiv.appendChild(info);

    // Button container
    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = `
      display: flex;
      gap: 0.75rem;
      width: 100%;
    `;

    // Test API Key button
    this.testButton = document.createElement('button');
    this.testButton.textContent = this.testing ? 'Testing...' : 'Test API Key';
    this.testButton.disabled = this.testing || !this.apiKey;
    this.testButton.style.cssText = `
      padding: 0.75rem 1rem;
      background: ${this.testing || !this.apiKey ? '#d1d5db' : '#10b981'};
      color: white;
      font-weight: bold;
      border: none;
      border-radius: 0.75rem;
      font-size: 1rem;
      cursor: ${this.testing || !this.apiKey ? 'not-allowed' : 'pointer'};
      transition: background 0.2s;
      flex: 1;
    `;
    this.testButton.addEventListener('click', () => void this.testApiKey());
    this.testButton.addEventListener('mouseenter', () => {
      if (this.testButton && !this.testButton.disabled) {
        this.testButton.style.background = '#059669';
      }
    });
    this.testButton.addEventListener('mouseleave', () => {
      if (this.testButton && !this.testButton.disabled) {
        this.testButton.style.background = '#10b981';
      }
    });
    buttonRow.appendChild(this.testButton);

    // Check Balance button
    this.balanceButton = document.createElement('button');
    this.balanceButton.textContent = this.testing ? 'Checking...' : 'Check Balance';
    this.balanceButton.disabled = this.testing || !this.apiKey;
    this.balanceButton.style.cssText = `
      padding: 0.75rem 1rem;
      background: ${this.testing || !this.apiKey ? '#d1d5db' : '#f59e0b'};
      color: white;
      font-weight: bold;
      border: none;
      border-radius: 0.75rem;
      font-size: 1rem;
      cursor: ${this.testing || !this.apiKey ? 'not-allowed' : 'pointer'};
      transition: background 0.2s;
      flex: 1;
    `;
    this.balanceButton.addEventListener('click', () => void this.checkBalance());
    this.balanceButton.addEventListener('mouseenter', () => {
      if (this.balanceButton && !this.balanceButton.disabled) {
        this.balanceButton.style.background = '#d97706';
      }
    });
    this.balanceButton.addEventListener('mouseleave', () => {
      if (this.balanceButton && !this.balanceButton.disabled) {
        this.balanceButton.style.background = '#f59e0b';
      }
    });
    buttonRow.appendChild(this.balanceButton);

    // Fetch Models button
    this.fetchButton = document.createElement('button');
    this.fetchButton.textContent = this.loading ? 'Fetching...' : 'Fetch Models';
    this.fetchButton.disabled = this.loading || !this.apiKey;
    this.fetchButton.style.cssText = `
      padding: 0.75rem 1rem;
      background: ${this.loading || !this.apiKey ? '#93c5fd' : 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)'};
      color: white;
      font-weight: bold;
      border: none;
      border-radius: 0.75rem;
      font-size: 1rem;
      cursor: ${this.loading || !this.apiKey ? 'not-allowed' : 'pointer'};
      transition: background 0.2s;
      flex: 1;
    `;
    this.fetchButton.addEventListener('click', () => void this.fetchModels());
    this.fetchButton.addEventListener('mouseenter', () => {
      if (this.fetchButton && !this.fetchButton.disabled) {
        this.fetchButton.style.background = 'linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)';
      }
    });
    this.fetchButton.addEventListener('mouseleave', () => {
      if (this.fetchButton && !this.fetchButton.disabled) {
        this.fetchButton.style.background = 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)';
      }
    });
    buttonRow.appendChild(this.fetchButton);

    inputDiv.appendChild(buttonRow);

    // Add the input section to the container
    container.appendChild(inputDiv);

    // Setup centralized event handling for API key input
    this.setupApiKeyInputEvents();

    // Show/hide format warning based on key
    if ((this.apiKey as string) && !isApiKeyFormatValid(this.apiKey as string)) {
      formatWarning.style.display = 'block';
    } else {
      formatWarning.style.display = 'none';
    }

    // Error display
    if (this.error) {
      const err = document.createElement('p');
      err.textContent = `Error: ${this.error}`;
      err.style.cssText = `
        color: #dc2626;
        background: #fee2e2;
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-weight: bold;
        margin: 0;
      `;
      container.appendChild(err);
    }

    // Model selectors (rest of the existing logic)
    if (this.fetched && !this.loading && !this.error && this.models.length > 0) {
      this.renderModelSelectors(container);
    }

    this.root.appendChild(container);
  }

  /**
   * Render model selection grid
   */
  private renderModelSelectors(container: HTMLElement): void {
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.5rem;
      width: 100%;
    `;

    PURPOSES.forEach((purpose) => {
      const section = document.createElement('div');
      section.style.cssText = `
        background: #f3f4f6;
        border: 1.5px solid #d1d5db;
        border-radius: 1rem;
        padding: 1rem 1.25rem;
        box-shadow: 0 1px 4px 0 rgba(0,0,0,0.04);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        height: 100%;
      `;

      const label = document.createElement('div');
      label.textContent = `${purpose.label} Model`;
      label.style.cssText = `
        font-weight: bold;
        margin-bottom: 0.25rem;
      `;
      section.appendChild(label);

      const select = document.createElement('select');
      select.style.cssText = `
        padding: 0.5rem 1rem;
        border: 1.5px solid #d1d5db;
        border-radius: 0.75rem;
        font-size: 1rem;
        background: #fff;
        transition: border-color 0.2s;
      `;
      select.addEventListener('focus', () => { select.style.borderColor = '#3b82f6'; });
      select.addEventListener('blur', () => { select.style.borderColor = '#d1d5db'; });

      // Options
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.disabled = true;
      defaultOpt.textContent = 'Select a model...';
      select.appendChild(defaultOpt);

      // Sort models by name for better UX
      const sortedModels = [...this.models].sort((a, b) => a.name.localeCompare(b.name));
      sortedModels.forEach(model => {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.name;
        select.appendChild(opt);
      });

      // Set value after options are added
      const validModel = this.models.find(m => m.id === this.selectedModels[purpose.key]);
      select.value = validModel ? validModel.id : '';

      // Model description and pricing
      const desc = document.createElement('div');
      let pricingUl: HTMLUListElement | undefined = undefined;
      
      if (validModel) {
        desc.textContent = validModel.description || '';
        desc.style.cssText = `
          font-size: 0.95rem;
          color: #374151;
          margin-top: 0.25rem;
        `;
        section.appendChild(desc);
        
        // Web search capabilities indicator (only show for native web search)
        const hasNativeWebSearch = OpenRouterClient.hasNativeWebSearch(validModel);
        if (hasNativeWebSearch) {
          const webSearchDiv = document.createElement('div');
          webSearchDiv.textContent = '🌐 Native Web Search';
          webSearchDiv.style.cssText = `
            font-size: 0.85rem;
            margin-top: 0.5rem;
            padding: 0.25rem 0.5rem;
            border-radius: 0.5rem;
            display: inline-block;
            background-color: #dcfce7;
            color: #166534;
            border: 1px solid #bbf7d0;
          `;
          section.appendChild(webSearchDiv);
        }

        // Web search via plugin checkbox (show for all models)
        const webSearchCheckboxContainer = document.createElement('div');
        webSearchCheckboxContainer.style.cssText = `
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        `;

        const webSearchCheckbox = document.createElement('input');
        webSearchCheckbox.type = 'checkbox';
        webSearchCheckbox.id = `web-search-${purpose.key}`;
        webSearchCheckbox.checked = this.webSearchEnabled[purpose.key] || false;
        webSearchCheckbox.style.cssText = `
          width: 16px;
          height: 16px;
          cursor: pointer;
          margin: 0;
          vertical-align: middle;
        `;

        const webSearchLabel = document.createElement('label');
        webSearchLabel.htmlFor = `web-search-${purpose.key}`;
        webSearchLabel.textContent = 'Enable Web Search';
        webSearchLabel.style.cssText = `
          font-size: 0.9rem;
          color: #374151;
          cursor: pointer;
          user-select: none;
          line-height: 16px;
          margin: 0;
        `;

        webSearchCheckbox.addEventListener('change', () => {
          this.webSearchEnabled[purpose.key] = webSearchCheckbox.checked;
          // Re-render to update pricing display
          this.update();
        });

        webSearchCheckboxContainer.appendChild(webSearchCheckbox);
        webSearchCheckboxContainer.appendChild(webSearchLabel);
        section.appendChild(webSearchCheckboxContainer);
        
        if (validModel.pricing) {
          pricingUl = document.createElement('ul');
          pricingUl.style.cssText = `
            list-style: disc inside;
            margin-left: 1.5rem;
            margin-top: 0.5rem;
          `;
          
          // Regular pricing
          formatPromptCompletionPricing(validModel.pricing).forEach(line => {
            const li = document.createElement('li');
            li.textContent = line;
            li.style.cssText = `
              font-size: 0.9rem;
              color: #2563eb;
            `;
            pricingUl?.appendChild(li);
          });
          
          // Web search pricing (only show when checkbox is enabled)
          if (this.webSearchEnabled[purpose.key]) {
            const li = document.createElement('li');
            li.textContent = `Web Search: $4.00 per 1000 results ($0.02 per request)`;
            li.style.cssText = `
              font-size: 0.9rem;
              color: #d97706;
              font-weight: 500;
            `;
            pricingUl?.appendChild(li);
          }
          
          section.appendChild(pricingUl);
        }
      } else {
        desc.textContent = '';
        section.appendChild(desc);
      }

      select.addEventListener('change', (e) => {
        this.selectedModels[purpose.key] = (e.target as HTMLSelectElement).value;
        const model = this.models.find(m => m.id === this.selectedModels[purpose.key]);
        desc.textContent = model ? (model.description || '') : '';
        
        // Update pricing - full re-render is simpler and more reliable
        this.update(); // Re-render to update all model information including web search capabilities
      });
      
      section.appendChild(select);
      if (validModel && pricingUl) {
        section.appendChild(pricingUl);
      }
      grid.appendChild(section);
    });
    
    container.appendChild(grid);

    // Save/Cancel buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      margin-top: 1.5rem;
    `;

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.disabled = true; // Start disabled, will be enabled async
    void this.isSavedConfigValid().then(isValid => {
      cancelBtn.disabled = !isValid;
    });
    cancelBtn.addEventListener('click', () => {
      this.closeModal();
    });
    buttonContainer.appendChild(cancelBtn);

    // Save and Close button
    const saveBtn = document.createElement('button');
    const allSelected = this.areAllModelsSelected();
    saveBtn.textContent = 'Save and Close';
    saveBtn.disabled = !allSelected;
    saveBtn.addEventListener('click', async () => {
      if (this.areAllModelsSelected()) {
        await this.saveToStorage();
        this.onSelect(this.selectedModels, this.webSearchEnabled);
      }
    });
    buttonContainer.appendChild(saveBtn);

    container.appendChild(buttonContainer);
  }

  private async testApiKey() {
    this.testing = true;
    this.error = null;
    this.updateButtonStates();
    
    try {
      // Use the proper OpenRouter API key validation endpoint
      const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        // Key is valid, optionally get key details
        const keyData = await response.json();
        this.error = null;
        
        // Show success message with key details if available
        let message = '✅ API Key is valid!';
        if (keyData?.data?.label) {
          message += ` (${keyData.data.label})`;
        }
        if (keyData?.data?.limit && keyData.data.limit > 0) {
          message += ` Credit limit: $${keyData.data.limit}`;
        }
        
        alert(message);
      } else {
        // Key is invalid
        const errorData = await response.json().catch(() => ({ error: { message: 'Invalid API key' } }));
        const errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        this.error = `API Key Test Failed: ${errorMessage}`;
        alert(`❌ API Key Test Failed: ${errorMessage}`);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
      this.error = `API Key Test Failed: ${errorMessage}`;
      alert(`❌ API Key Test Failed: ${errorMessage}`);
    } finally {
      this.testing = false;
      this.updateButtonStates();
    }
  }

  private async checkBalance() {
    this.testing = true;
    this.error = null;
    this.updateButtonStates();
    
    try {
      // Get both API key info and account credits in parallel
      const [keyResponse, creditsResponse] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/auth/key', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('https://openrouter.ai/api/v1/credits', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        })
      ]);
      
      if (!keyResponse.ok || !creditsResponse.ok) {
        const keyError = !keyResponse.ok ? `Key API: ${keyResponse.status}` : '';
        const creditsError = !creditsResponse.ok ? `Credits API: ${creditsResponse.status}` : '';
        const errorMessage = [keyError, creditsError].filter(Boolean).join(', ');
        this.error = `Balance Check Failed: ${errorMessage}`;
        showBalanceModal({ message: `❌ Balance Check Failed: ${errorMessage}`, isError: true });
        return;
      }
      
      const keyData = await keyResponse.json();
      const creditsData = await creditsResponse.json();
      this.error = null;
      
      console.log('OpenRouter key response:', keyData); // Debug logging
      console.log('OpenRouter credits response:', creditsData); // Debug logging
      
      // Check if we have the expected data structure
      if (!keyData?.data || !creditsData?.data) {
        showBalanceModal({ message: `❌ Unexpected response format from OpenRouter API.\n\nKey response: ${JSON.stringify(keyData, null, 2)}\n\nCredits response: ${JSON.stringify(creditsData, null, 2)}`, isError: true });
        return;
      }
      
      // Format balance information
      let message = '💰 OpenRouter Account Balance\n\n';
      
      // Account-wide credits (this is your real money balance)
      if (creditsData.data.total_credits !== undefined && creditsData.data.total_usage !== undefined) {
        try {
          const totalCredits = Number(creditsData.data.total_credits);
          const totalUsage = Number(creditsData.data.total_usage);
          const remainingBalance = totalCredits - totalUsage;
          
          message += `💳 Total Credits Purchased: $${totalCredits.toFixed(4)}\n`;
          message += `📊 Total Credits Used: $${totalUsage.toFixed(4)}\n`;
          message += `💵 Current Account Balance: $${remainingBalance.toFixed(4)}\n`;
          
          // Add visual indicator based on remaining account balance
          if (remainingBalance <= 0) {
            message += `\n🚨 CRITICAL: Account balance depleted! Add credits immediately.`;
          } else if (remainingBalance < 1) {
            message += `\n⚠️ Low balance warning! Consider adding more credits.`;
          } else if (remainingBalance < 5) {
            message += `\n⚡ Balance getting low. You may want to add more credits soon.`;
          } else {
            message += `\n✅ Good account balance.`;
          }
        } catch (e) {
          message += `💳 Total Credits: ${creditsData.data.total_credits} (raw)\n`;
          message += `📊 Total Usage: ${creditsData.data.total_usage} (raw)\n`;
        }
      }
      
      // API Key specific info
      message += `\n\n🔑 API Key Information:\n`;
      
      if (keyData.data.label) {
        message += `🏷️ Label: ${keyData.data.label}\n`;
      }
      
      if (keyData.data.usage !== undefined && keyData.data.usage !== null) {
        try {
          message += `📈 Key Usage: $${Number(keyData.data.usage).toFixed(4)}\n`;
        } catch (e) {
          message += `📈 Key Usage: ${keyData.data.usage} (raw value)\n`;
        }
      }
      
      if (keyData.data.limit !== undefined && keyData.data.limit !== null) {
        try {
          if (Number(keyData.data.limit) > 0) {
            message += `🎯 Key Limit: $${Number(keyData.data.limit).toFixed(2)}\n`;
          } else {
            message += `🎯 Key Limit: Unlimited\n`;
          }
        } catch (e) {
          message += `🎯 Key Limit: ${keyData.data.limit} (raw value)\n`;
        }
      } else if (keyData.data.limit === null) {
        message += `🎯 Key Limit: Unlimited\n`;
      }
      
      if (keyData.data.is_free_tier === true) {
        message += `\n🆓 Free tier account`;
      } else if (keyData.data.is_free_tier === false) {
        message += `\n💎 Paid account`;
      }
      
      showBalanceModal({ message, isError: false });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
      this.error = `Balance Check Failed: ${errorMessage}`;
      showBalanceModal({ message: `❌ Balance Check Failed: ${errorMessage}`, isError: true });
    } finally {
      this.testing = false;
      this.updateButtonStates();
    }
  }



  private async fetchModels() {
    this.loading = true;
    this.error = null;
    this.fetched = false;
    this.updateButtonStates();
    
    try {
      const client = OpenRouterClient.getInstance();
      this.models = await client.fetchModels();
      
      console.log(`🔄 Fetched ${this.models.length} models from OpenRouter`);
      
      // BUGFIX: Don't clear models if fetch returned zero models (likely an API/network issue)
      if (this.models.length === 0) {
        console.warn('⚠️ Fetched 0 models - this might be an API issue. Not clearing existing selections.');
        this.fetched = true;
        this.update();
        return;
      }
      
      // Track if any models were cleared during validation
      let modelsCleared = false;
      
      // Log current selections before validation
      console.log('🔍 Current model selections before validation:', this.selectedModels);
      
      // Ensure selectedModels only contains ids present in models
      const modelIds = new Set(this.models.map(m => m.id));
      for (const purpose of PURPOSES) {
        const selectedModel = this.selectedModels[purpose.key];
        if (selectedModel && !modelIds.has(selectedModel)) {
          console.warn(`⚠️ Model "${selectedModel}" for ${purpose.key} no longer exists in fetched models, clearing selection`);
          this.selectedModels[purpose.key] = '';
          modelsCleared = true;
        }
      }
      
      // Log selections after validation
      if (modelsCleared) {
        console.log('🔍 Model selections after validation:', this.selectedModels);
      }
      
      // BUGFIX: Only save to storage if we actually cleared models (to prevent unnecessary saves)
      if (modelsCleared) {
        console.log('💾 Saving updated model selections after clearing invalid models');
        await this.saveToStorage();
      }
      
      this.fetched = true;
      this.loading = false; // Set loading to false BEFORE update() so model selectors render
      this.update(); // Full re-render to show model selectors
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
      this.error = errorMessage;
      this.loading = false; // Also set loading to false in error case
      console.error('❌ fetchModels failed:', errorMessage);
      this.update(); // Re-render to show error
      throw e;
    } finally {
      // updateButtonStates() still needed to refresh button states
      this.updateButtonStates();
    }
  }

  async loadFromStorage(): Promise<void> {
    try {
      const storage = await this.storageService;
      
      const key = await storage.get<string>(STORAGE_KEY_API_KEY);
      if (key) {
        this.apiKey = key;
        console.log('✅ OpenRouter API key loaded from IndexedDB');
      } else {
        console.log('ℹ️ No OpenRouter API key found in IndexedDB');
      }

      const models = await storage.get<Record<string, string>>(STORAGE_KEY_MODELS);
      if (models) {
        this.selectedModels = models;
        console.log('✅ OpenRouter model selections loaded from IndexedDB:', models);
      } else {
        console.log('ℹ️ No OpenRouter model selections found in IndexedDB');
      }

      const webSearchPrefs = await storage.get<Record<string, boolean>>(STORAGE_KEY_WEB_SEARCH);
      if (webSearchPrefs) {
        this.webSearchEnabled = webSearchPrefs;
        console.log('✅ OpenRouter web search preferences loaded from IndexedDB:', webSearchPrefs);
      } else {
        console.log('ℹ️ No OpenRouter web search preferences found in IndexedDB');
      }
    } catch (error) {
      console.error('❌ CRITICAL: Failed to load OpenRouter configuration from storage:', error);
      this.selectedModels = {};
      this.webSearchEnabled = {};
      this.apiKey = '';
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      const storage = await this.storageService;
      await storage.set(STORAGE_KEY_API_KEY, this.apiKey);
      await storage.set(STORAGE_KEY_MODELS, this.selectedModels);
      await storage.set(STORAGE_KEY_WEB_SEARCH, this.webSearchEnabled);
      console.log('✅ OpenRouter configuration saved to IndexedDB');
    } catch (error) {
      console.error('❌ Failed to save OpenRouter configuration to IndexedDB:', error);
      throw error;
    }
  }

  public areAllModelsSelected(): boolean {
    return PURPOSES.every(p => this.selectedModels[p.key] && this.selectedModels[p.key] !== '');
  }

  public async setSelectedModels(models: Record<string, string>): Promise<void> {
    this.selectedModels = { ...models };
    await this.saveToStorage();
    this.update();
  }

  public getSelectedModels(): Record<string, string> {
    return this.selectedModels;
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  /**
   * Get all models that support native web search
   */
  public getModelsWithNativeWebSearch(): OpenRouterModel[] {
    return this.models.filter(model => 
      model.pricing?.['web_search'] !== undefined && model.pricing['web_search'] !== "0"
    );
  }

  /**
   * Get all models (all support web search via plugin)
   */
  public getModelsWithWebSearchSupport(): OpenRouterModel[] {
    return this.models; // All models support web search via plugin
  }

  /**
   * Get web search preferences
   */
  public getWebSearchEnabled(): Record<string, boolean> {
    return this.webSearchEnabled;
  }

  /**
   * Set web search preferences
   */
  public async setWebSearchEnabled(webSearchEnabled: Record<string, boolean>): Promise<void> {
    this.webSearchEnabled = webSearchEnabled;
    await this.saveToStorage();
  }

  private async isSavedConfigValid(): Promise<boolean> {
    try {
      const storage = await this.storageService;
      const savedModels = await storage.get<Record<string, string>>(STORAGE_KEY_MODELS);
      if (!savedModels) return false;
      
      return PURPOSES.every(p => savedModels[p.key]);
    } catch (error) {
      console.error('Failed to check saved config validity', error);
      return false;
    }
  }
} 