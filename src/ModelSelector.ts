import { OpenRouterClient } from './OpenRouterClient';
import type { OpenRouterModel } from './OpenRouterClient';

const LOCAL_STORAGE_KEY = 'openrouter_api_key';
const LOCAL_STORAGE_MODELS = 'openrouter_model_purposes';
const PURPOSES = [
  { key: 'creator', label: 'Creator' },
  { key: 'rating', label: 'Rating' },
  { key: 'editor', label: 'Editor' },
];

function formatPromptCompletionPricing(pricing: Record<string, string>) {
  const result: string[] = [];
  if (pricing.prompt) {
    const perToken = parseFloat(pricing.prompt);
    if (!isNaN(perToken)) {
      const perMillion = perToken * 1_000_000;
      result.push(`Input: $${perMillion.toLocaleString(undefined, { maximumFractionDigits: 2 })} per million tokens`);
    }
  }
  if (pricing.completion) {
    const perToken = parseFloat(pricing.completion);
    if (!isNaN(perToken)) {
      const perMillion = perToken * 1_000_000;
      result.push(`Output: $${perMillion.toLocaleString(undefined, { maximumFractionDigits: 2 })} per million tokens`);
    }
  }
  return result;
}

export class ModelSelector {
  private onSelect: (selectedModels: Record<string, string>) => void;
  private closeModal: () => void;
  private apiKey: string = '';
  private models: OpenRouterModel[] = [];
  private loading: boolean = false;
  private error: string | null = null;
  private fetched: boolean = false;
  private selectedModels: Record<string, string> = {};
  private root: HTMLElement | null = null;

  constructor(
    onSelect: (selectedModels: Record<string, string>) => void,
    closeModal: () => void,
    initialApiKey?: string,
    initialSelectedModels?: Record<string, string>
  ) {
    this.onSelect = onSelect;
    this.closeModal = closeModal;
    if (initialApiKey) this.apiKey = initialApiKey;
    if (initialSelectedModels) this.selectedModels = { ...initialSelectedModels };
    this.loadFromStorage();
    if (this.apiKey && !this.fetched) {
      this.fetchModels();
    }
  }

  render(root: HTMLElement) {
    this.root = root;
    this.update();
  }

  private update() {
    if (!this.root) return;
    this.root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'model-selector-container';
    container.style.width = '100%';
    container.style.padding = '2vw 2vw 2vw 2vw';
    container.style.background = 'rgba(255,255,255,0.95)';
    container.style.borderRadius = '1.5rem';
    container.style.boxShadow = '0 4px 32px 0 rgba(0,0,0,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.08)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '1.5rem';
    container.style.boxSizing = 'border-box';

    // Header
    const h2 = document.createElement('h2');
    h2.textContent = 'Configure OpenRouter Models';
    h2.style.fontSize = '1.5rem';
    h2.style.fontWeight = 'bold';
    h2.style.marginBottom = '0.5rem';
    h2.style.textAlign = 'center';
    h2.style.letterSpacing = '0.01em';
    h2.style.background = 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)';
    h2.style.color = 'white';
    h2.style.borderRadius = '1rem';
    h2.style.padding = '0.75rem 0';
    h2.style.boxShadow = '0 2px 8px 0 rgba(59,130,246,0.10)';
    container.appendChild(h2);

    // API key input
    const inputDiv = document.createElement('div');
    inputDiv.style.display = 'flex';
    inputDiv.style.flexDirection = 'column';
    inputDiv.style.gap = '0.5rem';
    inputDiv.style.marginBottom = '0.5rem';
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Enter OpenRouter API Key';
    input.value = this.apiKey;
    input.style.padding = '0.75rem 1rem';
    input.style.border = '1.5px solid #d1d5db';
    input.style.borderRadius = '0.75rem';
    input.style.fontSize = '1rem';
    input.style.background = '#f9fafb';
    input.style.transition = 'border-color 0.2s';
    input.addEventListener('focus', () => { input.style.borderColor = '#3b82f6'; });
    input.addEventListener('blur', () => { input.style.borderColor = '#d1d5db'; });
    input.addEventListener('input', (e) => {
      this.apiKey = (e.target as HTMLInputElement).value;
      this.saveToStorage();
    });
    inputDiv.appendChild(input);
    // Info
    const info = document.createElement('div');
    info.innerHTML = '<strong>Info:</strong> Your API key and model selections are stored in your browser\'s localStorage. Anyone with access to this browser profile can view them.';
    info.style.fontSize = '0.85rem';
    info.style.color = '#b45309';
    info.style.background = '#fef3c7';
    info.style.borderRadius = '0.5rem';
    info.style.padding = '0.5rem 0.75rem';
    inputDiv.appendChild(info);
    // Fetch button
    const fetchBtn = document.createElement('button');
    fetchBtn.textContent = this.loading ? 'Fetching...' : 'Fetch Models';
    fetchBtn.disabled = this.loading || !this.apiKey;
    fetchBtn.style.padding = '0.75rem 1rem';
    fetchBtn.style.background = this.loading || !this.apiKey ? '#93c5fd' : 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)';
    fetchBtn.style.color = 'white';
    fetchBtn.style.fontWeight = 'bold';
    fetchBtn.style.border = 'none';
    fetchBtn.style.borderRadius = '0.75rem';
    fetchBtn.style.fontSize = '1rem';
    fetchBtn.style.cursor = this.loading || !this.apiKey ? 'not-allowed' : 'pointer';
    fetchBtn.style.transition = 'background 0.2s';
    fetchBtn.addEventListener('mouseenter', () => {
      if (!fetchBtn.disabled) fetchBtn.style.background = 'linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)';
    });
    fetchBtn.addEventListener('mouseleave', () => {
      if (!fetchBtn.disabled) fetchBtn.style.background = 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)';
    });
    fetchBtn.addEventListener('click', () => this.fetchModels());
    inputDiv.appendChild(fetchBtn);
    container.appendChild(inputDiv);
    // Error
    if (this.error) {
      const err = document.createElement('p');
      err.textContent = `Error: ${this.error}`;
      err.style.color = '#dc2626';
      err.style.background = '#fee2e2';
      err.style.borderRadius = '0.5rem';
      err.style.padding = '0.5rem 0.75rem';
      err.style.fontWeight = 'bold';
      container.appendChild(err);
    }
    // Model selectors
    if (this.fetched && !this.loading && !this.error && this.models.length > 0) {
      // 2x2 grid for model selectors
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      grid.style.gap = '1.5rem';
      grid.style.width = '100%';
      grid.style.boxSizing = 'border-box';
      grid.style.margin = '0 auto';
      grid.style.alignItems = 'stretch';
      grid.style.justifyItems = 'stretch';
      grid.style.maxWidth = '100%';
      grid.style.padding = '0';
      // Responsive: stack on small screens
      grid.style.gridTemplateRows = 'auto auto';
      grid.style.gridAutoRows = '1fr';
      grid.style.gridAutoFlow = 'row';
      PURPOSES.forEach((purpose, idx) => {
        const section = document.createElement('div');
        section.style.background = '#f3f4f6';
        section.style.border = '1.5px solid #d1d5db';
        section.style.borderRadius = '1rem';
        section.style.padding = '1rem 1.25rem';
        section.style.boxShadow = '0 1px 4px 0 rgba(0,0,0,0.04)';
        section.style.display = 'flex';
        section.style.flexDirection = 'column';
        section.style.gap = '0.5rem';
        section.style.height = '100%';
        const label = document.createElement('div');
        label.textContent = `${purpose.label} Model`;
        label.style.fontWeight = 'bold';
        label.style.marginBottom = '0.25rem';
        section.appendChild(label);
        const select = document.createElement('select');
        select.style.padding = '0.5rem 1rem';
        select.style.border = '1.5px solid #d1d5db';
        select.style.borderRadius = '0.75rem';
        select.style.fontSize = '1rem';
        select.style.background = '#fff';
        select.style.transition = 'border-color 0.2s';
        select.addEventListener('focus', () => { select.style.borderColor = '#3b82f6'; });
        select.addEventListener('blur', () => { select.style.borderColor = '#d1d5db'; });
        // Options
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.disabled = true;
        defaultOpt.textContent = 'Select a model...';
        select.appendChild(defaultOpt);
        this.models.forEach(model => {
          const opt = document.createElement('option');
          opt.value = model.id;
          opt.textContent = model.name;
          select.appendChild(opt);
        });
        // Set value after options are added
        const validModel = this.models.find(m => m.id === this.selectedModels[purpose.key]);
        select.value = validModel ? validModel.id : '';
        // Model description and pricing
        let desc = document.createElement('div');
        let pricingUl: HTMLUListElement | undefined = undefined;
        if (validModel) {
          desc.textContent = validModel.description;
          desc.style.fontSize = '0.95rem';
          desc.style.color = '#374151';
          desc.style.marginTop = '0.25rem';
          section.appendChild(desc);
          if (validModel.pricing) {
            pricingUl = document.createElement('ul');
            pricingUl.style.listStyle = 'disc inside';
            pricingUl.style.marginLeft = '1.5rem';
            pricingUl.style.marginTop = '0.5rem';
            formatPromptCompletionPricing(validModel.pricing).forEach(line => {
              const li = document.createElement('li');
              li.textContent = line;
              li.style.fontSize = '0.9rem';
              li.style.color = '#2563eb';
              if (pricingUl) {
                pricingUl.appendChild(li);
              }
            });
            section.appendChild(pricingUl);
          }
        } else {
          desc.textContent = '';
          section.appendChild(desc);
        }
        select.addEventListener('change', (e) => {
          this.selectedModels[purpose.key] = (e.target as HTMLSelectElement).value;
          this.saveToStorage();
          const model = this.models.find(m => m.id === this.selectedModels[purpose.key]);
          desc.textContent = model ? model.description : '';
          // Update pricing
          if (pricingUl) pricingUl.remove();
          if (model && model.pricing) {
            pricingUl = document.createElement('ul');
            pricingUl.style.listStyle = 'disc inside';
            pricingUl.style.marginLeft = '1.5rem';
            pricingUl.style.marginTop = '0.5rem';
            formatPromptCompletionPricing(model.pricing).forEach(line => {
              const li = document.createElement('li');
              li.textContent = line;
              li.style.fontSize = '0.9rem';
              li.style.color = '#2563eb';
              if (pricingUl) {
                pricingUl.appendChild(li);
              }
            });
            section.appendChild(pricingUl);
          }
        });
        section.appendChild(select);
        grid.appendChild(section);
      });
      container.appendChild(grid);

      // Buttons
      const btnDiv = document.createElement('div');
      btnDiv.style.display = 'flex';
      btnDiv.style.justifyContent = 'flex-end';
      btnDiv.style.gap = '1rem';
      btnDiv.style.marginTop = '1.5rem';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save and Close';
      saveBtn.style.padding = '0.75rem 1.5rem';
      saveBtn.style.background = 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)';
      saveBtn.style.color = 'white';
      saveBtn.style.fontWeight = 'bold';
      saveBtn.style.border = 'none';
      saveBtn.style.borderRadius = '0.75rem';
      saveBtn.style.fontSize = '1rem';
      saveBtn.style.cursor = 'pointer';
      saveBtn.addEventListener('click', () => {
        this.onSelect(this.selectedModels);
        this.closeModal();
      });
      btnDiv.appendChild(saveBtn);

      container.appendChild(btnDiv);
    }
    this.root.appendChild(container);
  }

  private async fetchModels() {
    this.loading = true;
    this.error = null;
    this.fetched = false;
    this.update();
    try {
      const client = new OpenRouterClient(this.apiKey);
      this.models = await client.fetchModels();
      // Ensure selectedModels only contains ids present in models
      const modelIds = new Set(this.models.map(m => m.id));
      for (const purpose of PURPOSES) {
        if (this.selectedModels[purpose.key] && !modelIds.has(this.selectedModels[purpose.key])) {
          this.selectedModels[purpose.key] = '';
        }
      }
      this.fetched = true;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.update();
    }
  }

  private loadFromStorage() {
    if (!this.apiKey) {
      const savedKey = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedKey) this.apiKey = savedKey;
    }
    if (Object.keys(this.selectedModels).length === 0) {
      const savedModels = localStorage.getItem(LOCAL_STORAGE_MODELS);
      if (savedModels) {
        try {
          this.selectedModels = JSON.parse(savedModels);
        } catch {}
      }
    }
  }

  private saveToStorage() {
    localStorage.setItem(LOCAL_STORAGE_KEY, this.apiKey);
    localStorage.setItem(LOCAL_STORAGE_MODELS, JSON.stringify(this.selectedModels));
  }

  public areAllModelsSelected(): boolean {
    return PURPOSES.every(p => this.selectedModels[p.key] && this.selectedModels[p.key] !== '');
  }

  public setSelectedModels(models: Record<string, string>) {
    this.selectedModels = { ...models };
    this.saveToStorage();
    this.update(); // Re-render to show the new selections
  }

  public getSelectedModels(): Record<string, string> {
    return this.selectedModels;
  }

  public getApiKey(): string {
    return this.apiKey;
  }
} 