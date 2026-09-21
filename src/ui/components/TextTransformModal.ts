import { BaseModal } from '../modals/core/BaseModal';
import { ModalConfig, ModalHooks } from '../modals/types/ModalTypes';
import { createElement } from '../modals/core/modal-utils';
import { StorageService, type IStorageService } from '../../StorageService';
import { MODEL_PURPOSES } from '../../services/TaskModelService';
import { escapeHtml } from '../modals/core/modal-utils';

export interface TextTransformRequest {
  textToChange: string;
  context?: string;
  formatInstructions?: string;
  transformInstruction: string;
  modelPurpose?: string;
}

export interface TextTransformModalConfig extends ModalConfig {
  onTransformRequested?: (request: TextTransformRequest) => void;
  defaultText?: string;
  defaultContext?: string;
  defaultFormatInstructions?: string;
  defaultInstruction?: string;
}

const STORAGE_KEY_TEXT_TRANSFORM_HISTORY = 'text_transform_history';
const STORAGE_KEY_TEXT_TRANSFORM_MODEL_PURPOSE = 'text_transform_model_purpose';
const MAX_HISTORY_ITEMS = 20; // Keep last 20 transform instructions

export class TextTransformModal extends BaseModal {
  private textToChangeTextarea: HTMLTextAreaElement | null = null;
  private contextTextarea: HTMLTextAreaElement | null = null;
  private formatInstructionsTextarea: HTMLTextAreaElement | null = null;
  private instructionTextarea: HTMLTextAreaElement | null = null;
  private modelPurposeSelect: HTMLSelectElement | null = null;
  private historyContainer: HTMLElement | null = null;
  private onTransformRequested: ((request: TextTransformRequest) => void) | undefined;
  private storageService: Promise<IStorageService>;
  private transformHistory: string[] = [];
  private selectedModelPurpose: string = 'editor'; // Default to editor purpose

  constructor(config: TextTransformModalConfig, hooks: ModalHooks = {}) {
    super({
      title: '✨ Transform Text',
      closable: true,
      backdrop: true,
      width: '1200px',
      height: '700px',
      ...config,
      id: config.id || 'text-transform-modal'
    }, hooks);
    
    this.onTransformRequested = config.onTransformRequested;
    this.storageService = StorageService.getInstance();
  }

  public override async open(): Promise<void> {
    // Load transform history and model purpose before opening
    await this.loadTransformHistory();
    await this.loadModelPurpose();
    await super.open();
    
    // Focus the text area after modal opens
    setTimeout(() => {
      if (this.textToChangeTextarea) {
        this.textToChangeTextarea.focus();
      }
    }, 100);
  }

  public render(): HTMLElement {
    const container = createElement('div', {
      classes: ['text-transform-modal-container']
    });
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = this.getModalStyles();
    container.appendChild(style);
    
    // Add the main content
    container.innerHTML += this.getModalHTML();
    
    // Setup event listeners after DOM is ready
    setTimeout(() => {
      this.setupEventListeners();
    }, 0);
    
    return container;
  }

  private getModalStyles(): string {
    return `
        .text-transform-modal-container {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        
        .top-controls {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 1rem;
          flex-shrink: 0;
        }
        
        .transform-modal-content {
          display: flex;
          gap: 1.5rem;
          flex: 1;
          min-height: 0;
        }
        
        .left-column {
          flex: 2;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          height: 100%;
          min-height: 0;
        }
        
        .right-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          height: 100%;
          border-left: 1px solid #e5e7eb;
          padding-left: 1.5rem;
          min-height: 0;
        }
        
        .text-input-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
        }
        
        .context-area {
          flex: 0.8;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
        }
        
        .format-area {
          flex: 0.6;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
        }
        
        .instruction-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
        }
        
        .model-selection-area {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .model-purpose-select {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #d1d5db;
          border-radius: 8px;
          font-family: inherit;
          font-size: 14px;
          background: white;
          outline: none;
          transition: border-color 0.2s;
          cursor: pointer;
        }
        
        .model-purpose-select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .transform-history-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
        }
        
        .text-textarea {
          width: 100%;
          flex: 1;
          min-height: 120px;
          padding: 0.75rem;
          border: 2px solid #d1d5db;
          border-radius: 8px;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }
        
        .context-textarea {
          width: 100%;
          flex: 1;
          min-height: 80px;
          padding: 0.75rem;
          border: 2px solid #d1d5db;
          border-radius: 8px;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }
        
        .format-textarea {
          width: 100%;
          flex: 1;
          min-height: 60px;
          padding: 0.75rem;
          border: 2px solid #d1d5db;
          border-radius: 8px;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }
        
        .instruction-textarea {
          width: 100%;
          flex: 1;
          min-height: 100px;
          padding: 0.75rem;
          border: 2px solid #d1d5db;
          border-radius: 8px;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }
        
        .text-textarea:focus,
        .context-textarea:focus,
        .format-textarea:focus,
        .instruction-textarea:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .history-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
        }
        
        .history-item {
          padding: 0.75rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.875rem;
          line-height: 1.4;
          word-wrap: break-word;
          hyphens: auto;
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }
        
        .history-item-content {
          flex: 1;
        }
        
        .history-item-delete {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #ef4444;
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          transition: all 0.2s;
          opacity: 0.7;
        }
        
        .history-item-delete:hover {
          opacity: 1;
          background: #dc2626;
          transform: scale(1.1);
        }
        
        .history-item:hover {
          background: #e2e8f0;
          border-color: #cbd5e1;
          transform: translateY(-1px);
        }
        
        .history-item:active {
          transform: translateY(0);
        }
        
        .history-empty {
          text-align: center;
          color: #9ca3af;
          font-style: italic;
          padding: 2rem;
        }
        
        .form-label {
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
          display: block;
        }
        
        .form-label-optional {
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 0.5rem;
          display: block;
        }
        
        .modal-actions {
          display: flex;
          gap: 1rem;
        }
        
        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }
        
        .btn-secondary:hover {
          background: #e5e7eb;
        }
        
        .btn-primary {
          background: #3b82f6;
          color: white;
        }
        
        .btn-primary:hover {
          background: #2563eb;
        }
        
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
    `;
  }

  private getModalHTML(): string {
    const config = this.config as TextTransformModalConfig;
    
    return `
      <div class="top-controls">
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="cancel-btn">
            Cancel
          </button>
          <button type="button" class="btn btn-primary" id="transform-btn">
            Transform Text
          </button>
        </div>
      </div>
       
      <div class="transform-modal-content">
        <div class="left-column">
          <div class="text-input-area">
            <label class="form-label" for="text-to-change-textarea">
              Text to Transform *
            </label>
            <textarea 
              id="text-to-change-textarea" 
              class="text-textarea"
              placeholder="Enter the text you want to transform..."
            >${escapeHtml(config.defaultText ?? '')}</textarea>
          </div>
          
          <div class="context-area">
            <label class="form-label-optional" for="context-textarea">
              Context (Optional)
            </label>
            <textarea 
              id="context-textarea" 
              class="context-textarea"
              placeholder="Provide additional context about the text, its purpose, audience, etc..."
            >${escapeHtml(config.defaultContext ?? '')}</textarea>
          </div>
          
          <div class="format-area">
            <label class="form-label-optional" for="format-instructions-textarea">
              Format Instructions (Optional)
            </label>
            <textarea 
              id="format-instructions-textarea" 
              class="format-textarea"
              placeholder="Specify format requirements: bullet points, paragraphs, word count, tone, etc..."
            >${escapeHtml(config.defaultFormatInstructions ?? '')}</textarea>
          </div>
        </div>
        
        <div class="right-column">
          <div class="instruction-area">
            <label class="form-label" for="instruction-textarea">
              Transformation Instructions *
            </label>
            <textarea 
              id="instruction-textarea" 
              class="instruction-textarea"
              placeholder="Describe how you want to transform the text...&#10;&#10;Examples:&#10;• Make it more formal and professional&#10;• Simplify for a younger audience&#10;• Add more detail and examples&#10;• Convert to a list format&#10;• Fix grammar and spelling&#10;• Change tone to be more engaging"
            >${escapeHtml(config.defaultInstruction ?? '')}</textarea>
          </div>
          
          <div class="model-selection-area">
            <label class="form-label" for="model-purpose-select">
              AI Model Purpose
            </label>
            <select id="model-purpose-select" class="model-purpose-select">
              ${this.renderModelPurposeOptions()}
            </select>
          </div>
          
          <div class="transform-history-section">
            <label class="form-label">Previous Instructions</label>
            <div id="history-container" class="history-list">
              ${this.renderHistoryItems()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderHistoryItems(): string {
    if (this.transformHistory.length === 0) {
      return '<div class="history-empty">No previous instructions</div>';
    }
    
    return this.transformHistory
      .slice() // Create a copy
      .reverse() // Show most recent first
      .map((instruction, index) => `
        <div class="history-item" data-instruction="${escapeHtml(instruction)}" title="Click to use this instruction">
          <div class="history-item-content">
            ${escapeHtml(instruction)}
          </div>
          <button class="history-item-delete" data-delete-index="${this.transformHistory.length - 1 - index}" title="Remove this instruction">
            ×
          </button>
        </div>
      `)
      .join('');
  }

  private renderModelPurposeOptions(): string {
    return MODEL_PURPOSES
      .map(purpose => `
        <option value="${purpose.key}" ${purpose.key === this.selectedModelPurpose ? 'selected' : ''}>
          ${purpose.label}
        </option>
      `)
      .join('');
  }


  protected setupEventListeners(): void {
    // Get DOM elements
    this.textToChangeTextarea = this.element?.querySelector('#text-to-change-textarea') as HTMLTextAreaElement;
    this.contextTextarea = this.element?.querySelector('#context-textarea') as HTMLTextAreaElement;
    this.formatInstructionsTextarea = this.element?.querySelector('#format-instructions-textarea') as HTMLTextAreaElement;
    this.instructionTextarea = this.element?.querySelector('#instruction-textarea') as HTMLTextAreaElement;
    this.modelPurposeSelect = this.element?.querySelector('#model-purpose-select') as HTMLSelectElement;
    this.historyContainer = this.element?.querySelector('#history-container') as HTMLElement;
    
    // Cancel button
    const cancelBtn = this.element?.querySelector('#cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        void this.close();
      });
    }
    
    // Transform button
    const transformBtn = this.element?.querySelector('#transform-btn');
    if (transformBtn) {
      transformBtn.addEventListener('click', () => {
        void this.handleTransform();
      });
    }
    
    // Model purpose selection
    this.modelPurposeSelect.addEventListener('change', () => {
      this.selectedModelPurpose = this.modelPurposeSelect!.value;
      void this.saveModelPurpose();
    });
    
    // History item clicks
    this.historyContainer.addEventListener('click', (event) => {
        const deleteButton = (event.target as HTMLElement).closest('.history-item-delete');
        if (deleteButton) {
          // Handle delete button click
          event.stopPropagation(); // Prevent triggering the history item click
          const deleteIndex = parseInt(deleteButton.getAttribute('data-delete-index') ?? '0');
          void this.deleteHistoryItem(deleteIndex);
          return;
        }
        
        const historyItem = (event.target as HTMLElement).closest('.history-item');
        if (historyItem && this.instructionTextarea) {
          const instruction = historyItem.getAttribute('data-instruction');
          if (instruction) {
            this.instructionTextarea.value = instruction;
            this.instructionTextarea.focus();
            
            // Position cursor at end
            setTimeout(() => {
              if (this.instructionTextarea) {
                this.instructionTextarea.setSelectionRange(
                  this.instructionTextarea.value.length, 
                  this.instructionTextarea.value.length
                );
              }
            }, 10);
          }
        }
      });
    
    // Enter key handling (Ctrl+Enter to submit)
    [this.textToChangeTextarea, this.contextTextarea, this.formatInstructionsTextarea, this.instructionTextarea].forEach(textarea => {
      textarea.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'Enter') {
          event.preventDefault();
          void this.handleTransform();
        }
      });
    });
  }

  private async handleTransform(): Promise<void> {
    if (!this.textToChangeTextarea || !this.instructionTextarea) return;
    
    const textToChange = this.textToChangeTextarea.value.trim();
    const context = this.contextTextarea?.value.trim() ?? undefined;
    const formatInstructions = this.formatInstructionsTextarea?.value.trim() ?? undefined;
    const transformInstruction = this.instructionTextarea.value.trim();
    
    if (!textToChange) {
      alert('Please enter the text you want to transform.');
      this.textToChangeTextarea.focus();
      return;
    }
    
    if (!transformInstruction) {
      alert('Please enter instructions for how to transform the text.');
      this.instructionTextarea.focus();
      return;
    }
    
    // Save instruction to history
    await this.saveToHistory(transformInstruction);
    
    // Create the transform request
    const request: TextTransformRequest = {
      textToChange,
      transformInstruction,
      modelPurpose: this.selectedModelPurpose
    };
    
    if (context) {
      request.context = context;
    }
    
    if (formatInstructions) {
      request.formatInstructions = formatInstructions;
    }
    
    // Call the callback
    if (this.onTransformRequested) {
      this.onTransformRequested(request);
    }
    
    await this.close();
  }

  private async loadTransformHistory(): Promise<void> {
    try {
      const storage = await this.storageService;
      const history = await storage.get<string[]>(STORAGE_KEY_TEXT_TRANSFORM_HISTORY);
      this.transformHistory = history ?? [];
    } catch (error) {
      console.warn('Failed to load transform history:', error);
      this.transformHistory = [];
    }
  }

  private async saveToHistory(instruction: string): Promise<void> {
    try {
      // Add to history (avoid duplicates)
      const existingIndex = this.transformHistory.indexOf(instruction);
      if (existingIndex >= 0) {
        // Move to end if already exists
        this.transformHistory.splice(existingIndex, 1);
      }
      
      this.transformHistory.push(instruction);
      
      // Keep only the last MAX_HISTORY_ITEMS
      if (this.transformHistory.length > MAX_HISTORY_ITEMS) {
        this.transformHistory = this.transformHistory.slice(-MAX_HISTORY_ITEMS);
      }
      
      // Save to storage
      const storage = await this.storageService;
      await storage.set(STORAGE_KEY_TEXT_TRANSFORM_HISTORY, this.transformHistory);
    } catch (error) {
      console.warn('Failed to save transform history:', error);
    }
  }

  private async deleteHistoryItem(index: number): Promise<void> {
    try {
      // Remove item from history array
      if (index >= 0 && index < this.transformHistory.length) {
        this.transformHistory.splice(index, 1);
        
        // Save updated history to storage
        const storage = await this.storageService;
        await storage.set(STORAGE_KEY_TEXT_TRANSFORM_HISTORY, this.transformHistory);
        
        // Update the UI
        if (this.historyContainer) {
          this.historyContainer.innerHTML = this.renderHistoryItems();
        }
      }
    } catch (error) {
      console.warn('Failed to delete history item:', error);
    }
  }

  private async loadModelPurpose(): Promise<void> {
    try {
      const storage = await this.storageService;
      const savedPurpose = await storage.get<string>(STORAGE_KEY_TEXT_TRANSFORM_MODEL_PURPOSE);
      this.selectedModelPurpose = savedPurpose ?? 'editor'; // Default to editor
    } catch (error) {
      console.warn('Failed to load model purpose:', error);
      this.selectedModelPurpose = 'editor'; // Default to editor on error
    }
  }

  private async saveModelPurpose(): Promise<void> {
    try {
      const storage = await this.storageService;
      await storage.set(STORAGE_KEY_TEXT_TRANSFORM_MODEL_PURPOSE, this.selectedModelPurpose);
    } catch (error) {
      console.warn('Failed to save model purpose:', error);
    }
  }
} 