import { OpenRouterClient } from './OpenRouterClient';
import type { OpenRouterModel } from './OpenRouterClient';
import { StorageService, IStorageService } from './StorageService';
import { showBalanceModal } from './ui/modals/BalanceModal';

// Use IndexedDB storage keys instead of localStorage
const STORAGE_KEY_API_KEY = 'openrouter_api_key';
const STORAGE_KEY_MODELS = 'openrouter_model_purposes';
const STORAGE_KEY_PROVIDERS = 'openrouter_provider_selections';
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
  private onSelect: (selectedModels: Record<string, string>, webSearchEnabled?: Record<string, boolean>, selectedProviders?: Record<string, string>) => void;
  private closeModal: () => void;
  private apiKey: string = '';
  private models: OpenRouterModel[] = [];
  private loading: boolean = false;
  private testing: boolean = false;
  private error: string | null = null;
  private fetched: boolean = false;
  private selectedModels: Record<string, string> = {};
  private selectedProviders: Record<string, string> = {}; // Track provider selections per purpose
  private selectedParams: Record<string, { temperature?: number; top_p?: number; max_output_tokens?: number; verbosity?: string | number; thinking?: { enabled?: boolean; budget_tokens?: number }; reasoning?: { effort?: 'low' | 'medium' | 'high'; budget_tokens?: number } }> = {};
  private modelEndpoints: Record<string, OpenRouterModel['endpoints']> = {}; // Cache endpoint data
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
    onSelect: (selectedModels: Record<string, string>, webSearchEnabled?: Record<string, boolean>, selectedProviders?: Record<string, string>) => void,
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
    await this.loadAPIKeyFromStorage();
    await this.loadFromCurrentProfile();
    if (this.apiKey && !this.fetched) {
      try {
        await this.fetchModels();
        // If models are already selected in the profile, log their params too
        for (const purpose of PURPOSES) {
          const selectedModel = this.selectedModels[purpose.key];
          if (selectedModel && this.modelEndpoints[selectedModel]) {
            try { await this.logModelParameterSupport(selectedModel); } catch {}
          }
        }
      } catch (error) {
        // Failed to auto-fetch models during initialization
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
        const storage = await this.storageService;
        await storage.set(STORAGE_KEY_API_KEY, this.apiKey);
        
        // Update button states after successful save
        this.updateButtonStates();

        // Automatically (re)load the catalog whenever a well-formed key is entered,
        // so the manual "Fetch Models" step is no longer required.
        if (isApiKeyFormatValid(this.apiKey)) {
          try {
            await this.fetchModels();
          } catch {
            // fetchModels already surfaces the failure in the UI via update()
          }
        }
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

        webSearchCheckbox.addEventListener('change', async () => {
          this.webSearchEnabled[purpose.key] = webSearchCheckbox.checked;
          
          // Save to current profile only (no global storage)
          await this.saveWebSearchToCurrentProfile();
          
          // Re-render to update pricing display
          this.update();
        });

        webSearchCheckboxContainer.appendChild(webSearchCheckbox);
        webSearchCheckboxContainer.appendChild(webSearchLabel);
        section.appendChild(webSearchCheckboxContainer);
        
        // Get pricing - use provider-specific pricing if available
        let pricingToShow = validModel.pricing;
        const selectedProviderSlug = this.selectedProviders[purpose.key];
        if (selectedProviderSlug && this.hasMultipleProviders(validModel.id)) {
          const providers = this.getProvidersForModel(validModel.id);
          const providerEndpoint = providers?.find(p => {
            const providerDisplayName = p.name || p.provider_name;
            const providerSlug = this.getProviderSlug(providerDisplayName);
            return providerSlug === selectedProviderSlug;
          });
          if (providerEndpoint?.pricing) {
            pricingToShow = providerEndpoint.pricing;
          }
        }

        if (pricingToShow) {
          pricingUl = document.createElement('ul');
          pricingUl.style.cssText = `
            list-style: disc inside;
            margin-left: 1.5rem;
            margin-top: 0.5rem;
          `;
          
          // Regular pricing
          formatPromptCompletionPricing(pricingToShow).forEach(line => {
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

      select.addEventListener('change', async (e) => {
        const modelId = (e.target as HTMLSelectElement).value;
        this.selectedModels[purpose.key] = modelId;
        
              // Reset provider selection to automatic when model changes
      this.selectedProviders[purpose.key] = 'automatic';
        
        // Save to storage immediately when model or provider changes
        await this.saveToStorage();
        
        if (modelId) {
          // Fetch endpoint information for the selected model
          await this.fetchModelEndpoints(modelId);
          // Log supported parameters for quick diagnostics
          await this.logModelParameterSupport(modelId);
        }
        
        const model = this.models.find(m => m.id === this.selectedModels[purpose.key]);
        desc.textContent = model ? (model.description || '') : '';
        
        // Update pricing - full re-render is simpler and more reliable
        this.update(); // Re-render to update all model information including web search capabilities
      });
      
      section.appendChild(select);

      // Provider selection (if model has multiple providers)
      if (validModel && this.hasMultipleProviders(validModel.id)) {
        const providerLabel = document.createElement('div');
        providerLabel.textContent = 'Provider';
        providerLabel.style.cssText = `
          font-weight: bold;
          margin-top: 0.75rem;
          margin-bottom: 0.25rem;
          font-size: 0.9rem;
        `;
        section.appendChild(providerLabel);

        const providerSelect = document.createElement('select');
        providerSelect.style.cssText = `
          padding: 0.5rem 1rem;
          border: 1.5px solid #d1d5db;
          border-radius: 0.75rem;
          font-size: 1rem;
          background: #fff;
          transition: border-color 0.2s;
        `;
        providerSelect.addEventListener('focus', () => { providerSelect.style.borderColor = '#3b82f6'; });
        providerSelect.addEventListener('blur', () => { providerSelect.style.borderColor = '#d1d5db'; });

        // Automatic option (default)
        const automaticProviderOpt = document.createElement('option');
        automaticProviderOpt.value = 'automatic';
        automaticProviderOpt.textContent = 'Automatic (OpenRouter chooses best)';
        providerSelect.appendChild(automaticProviderOpt);

        // Provider options
        const providers = this.getProvidersForModel(validModel.id);
        if (providers) {
          providers.forEach((endpoint, index) => {
            const opt = document.createElement('option');
            // Use the provider display name from the endpoint data
            const providerDisplayName = endpoint.provider_name || endpoint.name;
            
            // Create a unique value for each endpoint to handle duplicate provider names
            // Use the base provider slug + index for uniqueness, but fall back to endpoint name if needed
            const baseSlug = this.getProviderSlug(providerDisplayName);
            let uniqueValue: string;
            
            // If this is the first occurrence of this provider, use the base slug for backwards compatibility
            const existingValues = Array.from(providerSelect.querySelectorAll('option')).map(o => (o as HTMLOptionElement).value);
            if (!existingValues.includes(baseSlug)) {
              uniqueValue = baseSlug;
            } else {
              // For subsequent occurrences, append index or use endpoint name
              uniqueValue = `${baseSlug}-${index}`;
            }
            
            opt.value = uniqueValue;
            
            // Show provider display name with pricing if available
            let displayText = providerDisplayName;
            if (endpoint.pricing?.prompt) {
              const promptPrice = parseFloat(endpoint.pricing.prompt) * 1_000_000;
              displayText += ` ($${promptPrice.toFixed(2)}/M tokens)`;
            }
            opt.textContent = displayText;
            providerSelect.appendChild(opt);
          });
        }

        // Set current selection (crash if missing - no defensive fallbacks!)
        providerSelect.value = this.selectedProviders[purpose.key]!

        providerSelect.addEventListener('change', async (e) => {
          this.selectedProviders[purpose.key] = (e.target as HTMLSelectElement).value;
          // Save to storage immediately when provider changes
          await this.saveToStorage();
          // Re-render to update pricing display for selected provider
          this.update();
        });

        section.appendChild(providerSelect);
      }

      // Model parameter controls (temperature/top_p/max tokens, thinking)
      if (validModel) {
        const supported = new Set<string>(validModel.supported_parameters || []);
        const params = { ...(this.selectedParams[purpose.key] || {}) };

        

        const paramsContainer = document.createElement('div');
        paramsContainer.style.cssText = `
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px dashed #d1d5db;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem 1rem;
        `;

        // Track if any controls are added
        let hasAnyControls = false;
        
        const addHeadingIfNeeded = () => {
          if (!hasAnyControls) {
            const heading = document.createElement('div');
            heading.textContent = 'Model parameters';
            heading.style.cssText = `
              grid-column: 1 / -1;
              font-weight: bold;
              font-size: 0.95rem;
              color: #111827;
            `;
            paramsContainer.appendChild(heading);
            hasAnyControls = true;
          }
        };

        // Helper to create labeled input
        const createLabeledNumber = (
          labelText: string,
          value: number | undefined,
          min: number,
          max: number,
          step: number,
          placeholder: string,
          enabled: boolean,
          onChange: (val: number | undefined) => void
        ) => {
          const wrap = document.createElement('label');
          wrap.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem;';
          const lab = document.createElement('span');
          lab.textContent = labelText;
          lab.style.cssText = 'font-size: 0.85rem; color: #374151;';
          const input = document.createElement('input');
          input.type = 'number';
          input.min = String(min);
          input.max = String(max);
          input.step = String(step);
          input.placeholder = placeholder;
          input.value = value !== undefined ? String(value) : '';
          input.disabled = !enabled;
          input.style.cssText = `
            padding: 0.5rem 0.75rem;
            border: 1.5px solid #d1d5db;
            border-radius: 0.5rem;
            font-size: 0.95rem;
            background: ${enabled ? '#fff' : '#f9fafb'};
          `;
          input.addEventListener('focus', () => { if (enabled) input.style.borderColor = '#3b82f6'; });
          input.addEventListener('blur', () => { input.style.borderColor = '#d1d5db'; });
          input.addEventListener('change', async () => {
            const raw = input.value.trim();
            const num = raw === '' ? undefined : Number(raw);
            onChange(num);
            await this.setSelectedParams(purpose.key, params);
          });
          wrap.appendChild(lab);
          wrap.appendChild(input);
          return wrap;
        };

        // Only show basic parameters that the model actually supports
        const tempSupported = supported.size === 0 || supported.has('temperature') || 
                              !validModel.supported_parameters || validModel.supported_parameters.length === 0;
        if (tempSupported) {
          addHeadingIfNeeded();
          paramsContainer.appendChild(createLabeledNumber(
            'Temperature (0–2)',
            params.temperature,
            0,
            2,
            0.01,
            'e.g., 0.7',
            true, // Always enabled if shown
            (val) => {
              if (val === undefined) {
                delete params.temperature;
              } else {
                params.temperature = val;
              }
            }
          ));
        }

        const topPSupported = supported.size === 0 || supported.has('top_p') ||
                             !validModel.supported_parameters || validModel.supported_parameters.length === 0;
        if (topPSupported) {
          addHeadingIfNeeded();
          paramsContainer.appendChild(createLabeledNumber(
            'Top-p (0–1)',
            params.top_p,
            0,
            1,
            0.01,
            'e.g., 0.9',
            true, // Always enabled if shown
            (val) => {
              if (val === undefined) {
                delete params.top_p;
              } else {
                params.top_p = val;
              }
            }
          ));
        }

        const maxTokSupported = supported.size === 0 || supported.has('max_output_tokens') || supported.has('max_tokens') ||
                               !validModel.supported_parameters || validModel.supported_parameters.length === 0;
        if (maxTokSupported) {
          addHeadingIfNeeded();
          paramsContainer.appendChild(createLabeledNumber(
            'Max output tokens',
            params.max_output_tokens,
            1,
            128000,
            1,
            'e.g., 2048',
            true, // Always enabled if shown
            (val) => {
              if (val === undefined) {
                delete params.max_output_tokens;
              } else {
                params.max_output_tokens = val;
              }
            }
          ));
        }

        // Verbosity (always show for experimentation)
        addHeadingIfNeeded();
        const wrap = document.createElement('label');
        wrap.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem;';
        const lab = document.createElement('span');
        lab.textContent = 'Verbosity';
        lab.style.cssText = 'font-size: 0.85rem; color: #374151;';
        const select = document.createElement('select');
        select.style.cssText = 'padding: 0.5rem 0.75rem; border: 1.5px solid #d1d5db; border-radius: 0.5rem; font-size: 0.95rem; background: #fff;';
        const options: Array<{ value: ''; label: string } | { value: 'low' | 'medium' | 'high'; label: string }> = [
          { value: '', label: 'Default' },
          { value: 'low', label: 'Low (brief)' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High (detailed)' }
        ];
        options.forEach(opt => {
          const o = document.createElement('option');
          o.value = String(opt.value);
          o.textContent = opt.label;
          const currentVerbosity = (params.verbosity ?? '') as string | number;
          if (String(opt.value) === String(currentVerbosity)) o.selected = true;
          select.appendChild(o);
        });
        select.addEventListener('focus', () => { select.style.borderColor = '#3b82f6'; });
        select.addEventListener('blur', () => { select.style.borderColor = '#d1d5db'; });
        select.addEventListener('change', async () => {
          const v = (select.value || '') as '' | 'low' | 'medium' | 'high';
          if (v === '') {
            delete params.verbosity;
          } else {
            params.verbosity = v;
          }
          await this.setSelectedParams(purpose.key, params);
        });
        wrap.appendChild(lab);
        wrap.appendChild(select);
        paramsContainer.appendChild(wrap);

        // Unified reasoning/thinking controls (model-agnostic and future-proof)
        const reasoningSupport = this.getReasoningSupport(validModel.id, this.selectedProviders[purpose.key]);
        if (reasoningSupport.supported) {
          addHeadingIfNeeded();
          const reasoningWrap = document.createElement('div');
          reasoningWrap.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem; grid-column: 1 / -1; padding: 0.75rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; margin-top: 0.5rem;';
          
          // Header with enable checkbox
          const headerWrap = document.createElement('label');
          headerWrap.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; cursor: pointer;';
          const enableCheck = document.createElement('input');
          enableCheck.type = 'checkbox';
          enableCheck.checked = Boolean(params.thinking?.enabled || params.reasoning?.effort || params.reasoning?.budget_tokens);
          enableCheck.style.cssText = 'width: 16px; height: 16px;';
          
          const headerLabel = document.createElement('span');
          headerLabel.textContent = 'Enable Advanced Reasoning';
          headerLabel.style.cssText = 'font-weight: 600; font-size: 0.9rem; color: #1f2937;';
          
          headerWrap.appendChild(enableCheck);
          headerWrap.appendChild(headerLabel);
          reasoningWrap.appendChild(headerWrap);
          
          // Description text
          const helpText = document.createElement('div');
          helpText.textContent = reasoningSupport.description;
          helpText.style.cssText = 'font-size: 0.8rem; color: #6b7280; margin-top: -0.25rem; line-height: 1.4;';
          reasoningWrap.appendChild(helpText);

          // Controls container (shown when enabled)
          const controlsWrap = document.createElement('div');
          controlsWrap.style.cssText = 'display: grid; grid-template-columns: 1fr; gap: 0.75rem; margin-top: 0.5rem;';
          
          // Create appropriate controls based on model support
          this.createReasoningControls(controlsWrap, reasoningSupport, params, purpose.key, enableCheck);
          
          reasoningWrap.appendChild(controlsWrap);
          
          // Update controls visibility when checkbox changes
          const updateControlsVisibility = () => {
            controlsWrap.style.opacity = enableCheck.checked ? '1' : '0.5';
            controlsWrap.style.pointerEvents = enableCheck.checked ? 'auto' : 'none';
            Array.from(controlsWrap.querySelectorAll('input, select')).forEach((el: Element) => {
              (el as HTMLInputElement | HTMLSelectElement).disabled = !enableCheck.checked;
            });
          };
          
          enableCheck.addEventListener('change', async () => {
            if (!enableCheck.checked) {
              // Clear all reasoning-related params
              delete params.thinking;
              delete params.reasoning;
            } else {
              // Initialize based on model support
              const useEffortApproach = reasoningSupport.supportsEffort && (!reasoningSupport.supportsTokens || 
                reasoningSupport.description.includes('effort-based'));
              
              if (useEffortApproach) {
                params.reasoning = { effort: 'medium' };
                delete params.thinking;
              } else {
                params.thinking = { enabled: true, budget_tokens: 2048 };
                delete params.reasoning;
              }
            }
            updateControlsVisibility();
            await this.setSelectedParams(purpose.key, params);
          });
          
          updateControlsVisibility(); // Initial state
          paramsContainer.appendChild(reasoningWrap);
        }

        // Only add the params container to the section if it has controls
        if (hasAnyControls) {
          section.appendChild(paramsContainer);
        }
      }

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
        this.onSelect(this.selectedModels, this.webSearchEnabled, this.selectedProviders);
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
        // Key is invalid - parse response to get actual error message
        let errorMessage: string;
        try {
          const errorData = await response.json();
          errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        } catch (jsonError) {
          // If JSON parsing fails, the API returned invalid JSON which is a different error
          throw new Error(`API returned invalid JSON response: ${response.status} ${response.statusText}. Original error: ${jsonError}`);
        }
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
      
      // Models fetched successfully from OpenRouter
      
      // BUGFIX: Don't clear models if fetch returned zero models (likely an API/network issue)
      if (this.models.length === 0) {
        // Fetched 0 models - possible API issue, not clearing existing selections
        this.fetched = true;
        this.update();
        return;
      }
      
      // Track if any models were cleared during validation
      let modelsCleared = false;
      
      // Log current selections before validation
      // Validating current model selections
      
      // Ensure selectedModels only contains ids present in models
      const modelIds = new Set(this.models.map(m => m.id));
      for (const purpose of PURPOSES) {
        const selectedModel = this.selectedModels[purpose.key];
        if (selectedModel && !modelIds.has(selectedModel)) {
          // Model no longer exists in fetched models, clearing selection
          this.selectedModels[purpose.key] = '';
          modelsCleared = true;
        }
      }
      
      // Log selections after validation
      if (modelsCleared) {
        // Model selections validated successfully
      }
      
      // BUGFIX: Only save to storage if we actually cleared models (to prevent unnecessary saves)
      if (modelsCleared) {
        // Saving updated model selections
        await this.saveToStorage();
      }
      
      this.fetched = true;
      this.loading = false; // Set loading to false BEFORE update() so model selectors render

      // Pre-fetch endpoint information for currently selected models
      const fetchPromises: Promise<void>[] = [];
      for (const purpose of PURPOSES) {
        const selectedModel = this.selectedModels[purpose.key];
        if (selectedModel && !this.modelEndpoints[selectedModel]) {
          fetchPromises.push(this.fetchModelEndpoints(selectedModel));
        }
      }
      
      // Wait for all endpoint fetches to complete, then re-render
      if (fetchPromises.length > 0) {
        try {
          await Promise.all(fetchPromises);
          // Pre-fetched endpoint information for selected models
          this.update(); // Re-render to show provider options if available
        } catch (error) {
          // Some endpoint fetches failed during initialization
          this.update(); // Still render even if some fetches failed
        }
      } else {
        this.update(); // Full re-render to show model selectors
      }
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

  /**
   * Load only the API key from IndexedDB storage
   */
  async loadAPIKeyFromStorage(): Promise<void> {
    try {
      const storage = await this.storageService;
      
      const key = await storage.get<string>(STORAGE_KEY_API_KEY);
      if (key) {
        this.apiKey = key;
      }
    } catch (error) {
      console.error('❌ Failed to load API key from storage:', error);
    }
  }

  /**
   * @deprecated Use loadFromCurrentProfile() for settings and loadAPIKeyFromStorage() for API key
   */
  async loadFromStorage(): Promise<void> {
    try {
      const storage = await this.storageService;
      
      const key = await storage.get<string>(STORAGE_KEY_API_KEY);
      if (key) {
        this.apiKey = key;
        
      }

      const models = await storage.get<Record<string, string>>(STORAGE_KEY_MODELS);
      if (models) {
        this.selectedModels = models;
      }

      const providers = await storage.get<Record<string, string>>(STORAGE_KEY_PROVIDERS);
      if (providers) {
        // Clear any old Google provider selections that might be invalid
        const updatedProviders: Record<string, string> = {};
        let clearedCount = 0;
        for (const [key, value] of Object.entries(providers)) {
          if (value !== 'google' && value !== 'googleaistudio') {
            updatedProviders[key] = value;
          } else {
            clearedCount++;
          }
        }
        this.selectedProviders = updatedProviders;
        
        if (clearedCount > 0) {
          // Save the cleaned up providers
          await storage.set(STORAGE_KEY_PROVIDERS, updatedProviders);
        }
      } else {
        // Initialize with automatic for all purposes
        this.selectedProviders = {};
        PURPOSES.forEach(purpose => {
          this.selectedProviders[purpose.key] = 'automatic';
        });
      }

      // Ensure all purposes have a provider selection (default to automatic)
      PURPOSES.forEach(purpose => {
        if (!this.selectedProviders[purpose.key]) {
          this.selectedProviders[purpose.key] = 'automatic';
        }
      });

      // Web search preferences are now loaded from the current profile, not global storage
      await this.loadWebSearchFromCurrentProfile();
    } catch (error) {
      console.error('❌ CRITICAL: Failed to load OpenRouter configuration from storage:', error);
      this.selectedModels = {};
      this.selectedProviders = {};
      PURPOSES.forEach(purpose => {
        this.selectedProviders[purpose.key] = 'automatic';
      });
      this.webSearchEnabled = {};
      this.apiKey = '';
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      const storage = await this.storageService;
      await storage.set(STORAGE_KEY_API_KEY, this.apiKey);
      await storage.set(STORAGE_KEY_MODELS, this.selectedModels);
      await storage.set(STORAGE_KEY_PROVIDERS, this.selectedProviders);
      await storage.set('openrouter_model_params', this.selectedParams);
      // Web search preferences are now saved only to profiles, not global storage
    } catch (error) {
      console.error('❌ Failed to save OpenRouter configuration to IndexedDB:', error);
      throw error;
    }
  }

  public areAllModelsSelected(): boolean {
    return PURPOSES.every(p => {
      const modelId = this.selectedModels[p.key];
      if (!modelId || modelId === '') return false;
      
      // If model has multiple providers, check that a provider is selected (automatic is valid)
      if (this.hasMultipleProviders(modelId)) {
        const providerId = this.selectedProviders[p.key];
        return providerId && providerId !== '';
      }
      
      return true;
    });
  }

  public async setSelectedModels(models: Record<string, string>): Promise<void> {
    this.selectedModels = { ...models };
    await this.saveToStorage();
    
    // Pre-fetch endpoint information for newly selected models before rendering
    const fetchPromises: Promise<void>[] = [];
    for (const purpose of PURPOSES) {
      const selectedModel = this.selectedModels[purpose.key];
      if (selectedModel && !this.modelEndpoints[selectedModel]) {
        fetchPromises.push(this.fetchModelEndpoints(selectedModel));
      }
    }
    
    // Wait for all endpoint fetches to complete, then re-render
    if (fetchPromises.length > 0) {
      try {
        await Promise.all(fetchPromises);
      } catch (error) {
        console.error('❌ Some endpoint fetches failed during profile switch:', error);
        // Continue with update even if some fetches failed - the error will be thrown by fetchModelEndpoints
      }
    }
    
    this.update();
  }

  public getSelectedModels(): Record<string, string> {
    return this.selectedModels;
  }

  public async setSelectedProviders(providers: Record<string, string>): Promise<void> {
    // Validate providers - crash if invalid providers are set
    for (const [purpose, provider] of Object.entries(providers)) {
      if (provider !== 'automatic' && !provider) {
        throw new Error(`Invalid provider for ${purpose}: ${provider}`);
      }
    }
    
    this.selectedProviders = { ...providers };
    await this.saveToStorage();
    this.update();
  }

  public getSelectedProviders(): Record<string, string> {
    return this.selectedProviders;
  }

  public getSelectedParams(): Record<string, { temperature?: number; top_p?: number; max_output_tokens?: number; verbosity?: string | number; thinking?: { enabled?: boolean; budget_tokens?: number }; reasoning?: { effort?: 'low' | 'medium' | 'high'; budget_tokens?: number } }> {
    return this.selectedParams;
  }

  public async setSelectedParams(purpose: string, params: { temperature?: number; top_p?: number; max_output_tokens?: number; verbosity?: string | number; thinking?: { enabled?: boolean; budget_tokens?: number }; reasoning?: { effort?: 'low' | 'medium' | 'high'; budget_tokens?: number } }): Promise<void> {
    this.selectedParams[purpose] = { ...params };
    await this.saveToStorage();
    this.update();
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  /**
   * Programmatically set and persist the OpenRouter API key, then automatically
   * fetch the model catalog so the selector is immediately usable (no manual
   * "Fetch Models" step). Used by the onboarding wizard and any other code that
   * changes the key outside the rendered selector UI.
   *
   * Throws if the key is well-formed but the catalog fetch fails, so callers can
   * surface a clear validation error.
   */
  public async setApiKey(key: string): Promise<void> {
    this.apiKey = key;
    const storage = await this.storageService;
    await storage.set(STORAGE_KEY_API_KEY, this.apiKey);
    if (isApiKeyFormatValid(this.apiKey)) {
      await this.fetchModels();
    } else {
      this.fetched = false;
      if (this.root) {
        this.update();
      }
    }
  }

  /**
   * Returns the currently loaded model catalog (empty until a successful fetch).
   */
  public getModels(): OpenRouterModel[] {
    return this.models;
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
   * Set web search preferences (called when loading from profile)
   */
  public async setWebSearchEnabled(webSearchEnabled: Record<string, boolean>): Promise<void> {
    this.webSearchEnabled = webSearchEnabled;
    // No global storage - web search settings are profile-only now
  }

  /**
   * Load all settings from the current profile (models, web search, providers)
   */
  public async loadFromCurrentProfile(): Promise<void> {
    try {
      const state = await import('./state');
      const settingsManager = state.getSettingsManager();
      if (!settingsManager) {
        // SettingsManager not available - using empty settings
        this.selectedModels = {};
        this.webSearchEnabled = {};
        this.selectedProviders = {};
        return;
      }

      const activeProfileName = settingsManager.getLastUsedProfileName() || 'default';
      const activeProfile = settingsManager.getProfile(activeProfileName);
      
      if (activeProfile) {
        // Load models
        if (activeProfile.selectedModels) {
          this.selectedModels = { ...activeProfile.selectedModels };
        } else {
          this.selectedModels = {};
        }
        
        // Load web search settings
        if (activeProfile.webSearchEnabled) {
          this.webSearchEnabled = { ...activeProfile.webSearchEnabled };
        } else {
          this.webSearchEnabled = {};
        }
        
        // Load provider settings
        if (activeProfile.selectedProviders) {
          this.selectedProviders = { ...activeProfile.selectedProviders };
        } else {
          this.selectedProviders = {};
        }
        
        // Ensure all purposes have a provider selection (default to automatic)
        PURPOSES.forEach(purpose => {
          if (!this.selectedProviders[purpose.key]) {
            this.selectedProviders[purpose.key] = 'automatic';
          }
        });
        
        // Load per-model params (global for now)
        try {
          const storage = await this.storageService;
          const savedParams = await storage.get<Record<string, any>>('openrouter_model_params');
          this.selectedParams = savedParams || {};
        } catch {
          this.selectedParams = {};
        }
        
      } else {
        this.selectedModels = {};
        this.webSearchEnabled = {};
        this.selectedProviders = {};
        this.selectedParams = {};
      }
      
      // Pre-fetch endpoint information for loaded models
      const fetchPromises: Promise<void>[] = [];
      for (const purpose of PURPOSES) {
        const selectedModel = this.selectedModels[purpose.key];
        if (selectedModel && !this.modelEndpoints[selectedModel]) {
          fetchPromises.push(this.fetchModelEndpoints(selectedModel));
        }
      }
      
      if (fetchPromises.length > 0) {
        try {
          await Promise.all(fetchPromises);
        } catch (error) {
          console.error('❌ Some endpoint fetches failed:', error);
        }
      }
      
      this.update();
    } catch (error) {
      console.error('❌ Failed to load settings from profile:', error);
      this.selectedModels = {};
      this.webSearchEnabled = {};
      this.selectedProviders = {};
    }
  }

  /**
   * Load web search settings from the current profile
   * @deprecated Use loadFromCurrentProfile() instead
   */
  public async loadWebSearchFromCurrentProfile(): Promise<void> {
    try {
      const state = await import('./state');
      const settingsManager = state.getSettingsManager();
      if (!settingsManager) {
        // SettingsManager not available - using empty web search settings
        this.webSearchEnabled = {};
        return;
      }

      const activeProfileName = settingsManager.getLastUsedProfileName() || 'default';
      const activeProfile = settingsManager.getProfile(activeProfileName);
      
      if (activeProfile?.webSearchEnabled) {
        this.webSearchEnabled = { ...activeProfile.webSearchEnabled };
      } else {
        this.webSearchEnabled = {};
      }
    } catch (error) {
      console.error('❌ Failed to load web search settings from profile:', error);
      this.webSearchEnabled = {};
    }
  }

  /**
   * Save current web search settings to the active profile
   */
  private async saveWebSearchToCurrentProfile(): Promise<void> {
    try {
      const state = await import('./state');
      const settingsManager = state.getSettingsManager();
      if (!settingsManager) {
        // SettingsManager not available - web search settings not saved to profile
        return;
      }

      const activeProfileName = settingsManager.getLastUsedProfileName() || 'default';
      const activeProfile = settingsManager.getProfile(activeProfileName);
      
      if (activeProfile) {
        // Update the profile with current web search settings
        const updatedProfile = {
          ...activeProfile,
          webSearchEnabled: { ...this.webSearchEnabled }
        };
        
        await settingsManager.saveProfile(activeProfileName, updatedProfile);
      }
    } catch (error) {
      console.error('❌ Failed to save web search settings to profile:', error);
    }
  }

  /**
   * Fetch endpoint information for a model
   */
  private async fetchModelEndpoints(modelId: string): Promise<void> {
    try {
      const client = OpenRouterClient.getInstance();
      const endpoints = await client.fetchModelEndpoints(modelId);
      this.modelEndpoints[modelId] = endpoints;
      // Log parameters immediately after endpoints are fetched
      try {
        await this.logModelParameterSupport(modelId);
      } catch {}

    } catch (error) {
      console.error(`❌ CRITICAL: Failed to fetch endpoints for model ${modelId}:`, error);
      throw error; // Crash loudly - no silent error masking!
    }
  }

  /**
   * Check if a model has multiple providers available
   */
  private hasMultipleProviders(modelId: string): boolean {
    const endpoints = this.modelEndpoints[modelId]!; // Crash if not loaded!
    return endpoints.length > 1;
  }

  /**
   * Get available providers for a model
   */
  private getProvidersForModel(modelId: string): OpenRouterModel['endpoints'] {
    return this.modelEndpoints[modelId]!; // Crash if endpoints not loaded!
  }

  

  // Log model and endpoint supported parameters to help diagnose missing controls like verbosity
  private async logModelParameterSupport(modelId: string): Promise<void> {
    const model = this.models.find(m => m.id === modelId)!;
    const endpoints = this.modelEndpoints[modelId]!;
    const modelParams = (model.supported_parameters || []).join(', ') || '(none)';
    const lines: string[] = [];
    lines.push(`Model: ${model.name} (${model.id})`);
    lines.push(`Supported parameters (model-level): ${modelParams}`);
    if (endpoints && endpoints.length > 0) {
      lines.push(`Provider endpoints: ${endpoints.length}`);
      endpoints.forEach((ep, idx) => {
        const epParams = (ep.supported_parameters || []).join(', ') || '(none)';
        const providerLabel = ep.provider_name || ep.name || `endpoint-${idx}`;
        lines.push(`- ${providerLabel}: ${epParams}`);
      });
    } else {
      lines.push('No provider endpoints available');
    }
    // Model parameter support info logged (removed to reduce console noise)
  }



  // Get comprehensive reasoning support information for a model
  private getReasoningSupport(modelId: string, _selectedProviderSlug?: string): {
    supported: boolean;
    supportsEffort: boolean;
    supportsTokens: boolean;
    description: string;
  } {
    const model = this.models.find(m => m.id === modelId);
    if (!model) {
      return { supported: false, supportsEffort: false, supportsTokens: false, description: 'Model not found' };
    }
    
    
    
    const modelParams = new Set(model.supported_parameters || []);
    const endpoints = this.getProvidersForModel(modelId) || [];
    
    // Collect all supported parameters from endpoints too
    const allParams = new Set(modelParams);
    endpoints.forEach(ep => {
      (ep.supported_parameters || []).forEach(param => allParams.add(param));
    });
    
    const hasReasoning = allParams.has('reasoning');
    const hasThinking = allParams.has('thinking');
    const supported = hasReasoning || hasThinking;
    
    if (!supported) {
      return { supported: false, supportsEffort: false, supportsTokens: false, description: 'This model does not support advanced reasoning' };
    }
    
    // Determine which approaches are supported based on actual API metadata
    let supportsEffort = false;
    let supportsTokens = false;
    let description = '';
    
    // Use the actual supported_parameters to determine capabilities
    if (hasReasoning && hasThinking) {
      // Model supports both reasoning approaches
      supportsEffort = true;
      supportsTokens = true;
      description = 'Supports both effort-based and token budget reasoning approaches';
    } else if (hasReasoning) {
      // Model only supports reasoning parameter
      // Default to effort-based approach for reasoning parameter
      supportsEffort = true;
      description = 'Uses effort-based reasoning (low/medium/high intensity)';
    } else if (hasThinking) {
      // Model only supports thinking parameter
      supportsTokens = true;
      description = 'Uses token budget for reasoning (specify max tokens)';
    }
    
    // If no specific reasoning/thinking parameters, but model reports other reasoning capabilities,
    // we can still offer basic reasoning controls
    if (!hasReasoning && !hasThinking && allParams.size > 0) {
      // Check if any reasoning-related parameters exist
      const reasoningParams = Array.from(allParams).filter(param => 
        param.toLowerCase().includes('reason') || 
        param.toLowerCase().includes('think') ||
        param.toLowerCase().includes('effort')
      );
      
      if (reasoningParams.length > 0) {
        supportsEffort = true;
        supportsTokens = true;
        description = 'Supports advanced reasoning with configurable parameters';
      }
    }
    
    return { supported, supportsEffort, supportsTokens, description };
  }

  // Create appropriate reasoning controls based on what the model supports
  private createReasoningControls(container: HTMLElement, support: ReturnType<typeof this.getReasoningSupport>, params: any, purposeKey: string, _enableCheck: HTMLInputElement): void {
    // Clear existing controls
    container.innerHTML = '';
    
    // Determine the single best approach for this model (no mixed UI)
    // If model supports only one approach, use that
    // If model supports both, prefer effort-based as it's more user-friendly
    const useEffortApproach = support.supportsEffort && 
      (!support.supportsTokens || support.description.includes('effort-based'));
    
    if (useEffortApproach) {
      // Show only effort-based control
      const effortWrap = document.createElement('label');
      effortWrap.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; grid-column: 1 / -1;';
      
      const effortLabel = document.createElement('span');
      effortLabel.textContent = 'Reasoning Intensity';
      effortLabel.style.cssText = 'font-size: 0.85rem; color: #374151; font-weight: 500;';
      
      const effortSelect = document.createElement('select');
      effortSelect.style.cssText = 'padding: 0.5rem 0.75rem; border: 1.5px solid #d1d5db; border-radius: 0.5rem; font-size: 0.95rem; background: #fff;';
      
      const effortOptions = [
        { value: '', label: 'Default' },
        { value: 'low', label: 'Low (faster, less thorough)' },
        { value: 'medium', label: 'Medium (balanced)' },
        { value: 'high', label: 'High (slower, more thorough)' }
      ];
      
      effortOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === (params.reasoning?.effort || '')) option.selected = true;
        effortSelect.appendChild(option);
      });
      
      effortSelect.addEventListener('change', async () => {
        // Clear any token-based params when using effort
        delete params.thinking;
        if (!params.reasoning) params.reasoning = {};
        params.reasoning.effort = effortSelect.value === '' ? undefined : effortSelect.value as 'low' | 'medium' | 'high';
        if (params.reasoning.budget_tokens) delete params.reasoning.budget_tokens;
        await this.setSelectedParams(purposeKey, params);
      });
      
      effortWrap.appendChild(effortLabel);
      effortWrap.appendChild(effortSelect);
      container.appendChild(effortWrap);
      
    } else if (support.supportsTokens) {
      // Show only token budget control
      const tokenWrap = document.createElement('label');
      tokenWrap.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; grid-column: 1 / -1;';
      
      const tokenLabel = document.createElement('span');
      tokenLabel.textContent = 'Reasoning Token Budget';
      tokenLabel.style.cssText = 'font-size: 0.85rem; color: #374151; font-weight: 500;';
      
      const tokenInput = document.createElement('input');
      tokenInput.type = 'number';
      tokenInput.min = '256';
      tokenInput.max = '32000';
      tokenInput.step = '256';
      tokenInput.placeholder = 'e.g., 2048';
      tokenInput.value = (params.thinking?.budget_tokens || params.reasoning?.budget_tokens) ? String(params.thinking?.budget_tokens || params.reasoning?.budget_tokens) : '';
      tokenInput.style.cssText = 'padding: 0.5rem 0.75rem; border: 1.5px solid #d1d5db; border-radius: 0.5rem; font-size: 0.95rem; background: #fff;';
      
      tokenInput.addEventListener('focus', () => { tokenInput.style.borderColor = '#3b82f6'; });
      tokenInput.addEventListener('blur', () => { tokenInput.style.borderColor = '#d1d5db'; });
      tokenInput.addEventListener('change', async () => {
        const val = tokenInput.value.trim();
        const numVal = val === '' ? undefined : Math.max(256, Number(val));
        
        // Clear any effort-based params when using tokens
        if (params.reasoning?.effort) delete params.reasoning.effort;
        
        // Use thinking object for token-only models
        params.thinking = params.thinking || {};
        if (numVal === undefined) {
          delete params.thinking.budget_tokens;
        } else {
          params.thinking.budget_tokens = numVal;
        }
        
        await this.setSelectedParams(purposeKey, params);
      });
      
      tokenWrap.appendChild(tokenLabel);
      tokenWrap.appendChild(tokenInput);
      container.appendChild(tokenWrap);
    }
  }

  /**
   * Convert provider display name to API slug
   * OpenRouter uses lowercase slugs for provider routing
   */
  private getProviderSlug(providerName: string): string {
    // Common provider name to slug mappings
    const providerMap: Record<string, string> = {
      'Groq': 'groq',
      'Together': 'together',
      'DeepInfra': 'deepinfra',
      'Fireworks': 'fireworks',
      'Anthropic': 'anthropic',
      'OpenAI': 'openai',
      'Google': 'google-ai-studio',
      'Google AI Studio': 'google-ai-studio',
      'Mistral': 'mistral',
      'Cohere': 'cohere',
      'Meta': 'meta',
      'Moonshot AI': 'moonshot',
      'Azure': 'azure',
      'Amazon Bedrock': 'bedrock',
      'Replicate': 'replicate',
      'Hugging Face': 'huggingface',
      'Cerebras': 'cerebras',
      'Perplexity': 'perplexity',
      'xAI': 'xai',
      'BaseTen': 'baseten',
      'SambaNova': 'sambanova',
      'Lepton': 'lepton',
      'Hyperbolic': 'hyperbolic',
      'DeepSeek': 'deepseek',
      'Liquid': 'liquid',
      'AI21': 'ai21',
      'Inflection': 'inflection',
      '01.AI': '01ai'
    };

    // Check if we have a direct mapping
    if (providerMap[providerName]) {
      return providerMap[providerName];
    }

    // For unknown providers, use a safe fallback that only keeps the first word
    // This prevents malformed strings like "groqmoonshotaikimik2"
    const words = providerName.split(/[\s\/\-_]+/);
    const firstWord = words[0] || 'unknown';
    const normalized = firstWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Only use the normalized version if it's a reasonable length
    if (normalized.length > 2 && normalized.length < 20) {
      return normalized;
    } else {
      return 'unknown';
    }
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