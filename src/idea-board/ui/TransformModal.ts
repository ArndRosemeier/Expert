import { BaseModal } from '../../ui/modals/core/BaseModal';
import { ModalConfig, ModalHooks } from '../../ui/modals/types/ModalTypes';
import { createElement } from '../../ui/modals/core/modal-utils';
import { StorageService, type IStorageService } from '../../StorageService';

export interface TransformResult {
  instruction: string;
  count: number;
}

export interface TransformModalConfig extends ModalConfig {
  onTransformConfirmed?: (result: TransformResult) => void;
  defaultInstruction?: string;
  outgoingConnectionCount?: number; // If provided, count field is locked to this value
}

const STORAGE_KEY_TRANSFORM_HISTORY = 'idea_board_transform_history';
const MAX_HISTORY_ITEMS = 20; // Keep last 20 transform instructions

export class TransformModal extends BaseModal {
  private instructionTextarea: HTMLTextAreaElement | null = null;
  private countInput: HTMLInputElement | null = null;
  private historyContainer: HTMLElement | null = null;
  private onTransformConfirmed: ((result: TransformResult) => void) | undefined;
  private storageService: Promise<IStorageService>;
  private transformHistory: string[] = [];
  private outgoingConnectionCount: number | undefined;

  constructor(config: TransformModalConfig, hooks: ModalHooks = {}) {
    super({
      title: '✨ Transform Content',
      closable: true,
      backdrop: true,
      width: '800px',
      height: '600px',
      ...config,
      id: config.id || 'transform-modal'
    }, hooks);
    
    this.onTransformConfirmed = config.onTransformConfirmed;
    this.outgoingConnectionCount = config.outgoingConnectionCount;
    this.storageService = StorageService.getInstance();
  }

  public override async open(): Promise<void> {
    // Load transform history before opening
    await this.loadTransformHistory();
    await super.open();
    
    // Focus the textarea after modal opens
    setTimeout(() => {
      if (this.instructionTextarea) {
        this.instructionTextarea.focus();
      }
    }, 100);
  }

  public render(): HTMLElement {
    const container = createElement('div', {
      classes: ['transform-modal-container']
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
        .transform-modal-content {
          display: flex;
          gap: 1.5rem;
          height: 100%;
        }
        
        .transform-input-section {
          flex: 2;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .transform-history-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          border-left: 1px solid #e5e7eb;
          padding-left: 1.5rem;
        }
        
        .instruction-textarea {
          width: 100%;
          min-height: 200px;
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
        
        .instruction-textarea:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .count-container {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        
        .count-input {
          width: 80px;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          text-align: center;
          font-size: 14px;
        }
        
        .count-input:disabled {
          background-color: #f3f4f6;
          color: #6b7280;
          cursor: not-allowed;
        }
        
        .count-explanation {
          font-size: 0.875rem;
          color: #6b7280;
          margin-left: 0.5rem;
        }
        
        .history-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 350px;
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
        
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
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
    const isCountLocked = this.outgoingConnectionCount !== undefined;
    const countValue = isCountLocked ? this.outgoingConnectionCount : 1;
    
    return `
       <div class="transform-modal-content">
        <div class="transform-input-section">
          <div>
            <label class="form-label" for="instruction-textarea">
              What would you like to do with the content?
            </label>
            <textarea 
              id="instruction-textarea" 
              class="instruction-textarea"
              placeholder="Describe how you want to transform the content...&#10;&#10;Examples:&#10;• Make it more formal and professional&#10;• Simplify for a younger audience&#10;• Add more detail and examples&#10;• Convert to a list format&#10;• Translate to Spanish"
            ></textarea>
          </div>
          
          <div class="count-container">
            <label class="form-label" style="margin: 0;">Number of variations:</label>
            <input 
              type="number" 
              id="count-input" 
              class="count-input"
              min="1" 
              max="10" 
              value="${countValue}"
              ${isCountLocked ? 'disabled' : ''}
            />
            <span class="count-explanation">
              ${isCountLocked 
                ? `(Locked to ${countValue} - matches outgoing connections)`
                : '(1-10 variations)'
              }
            </span>
          </div>
        </div>
        
        <div class="transform-history-section">
          <label class="form-label">Previous Instructions</label>
          <div id="history-container" class="history-list">
            ${this.renderHistoryItems()}
          </div>
        </div>
      </div>
      
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="cancel-btn">
          Cancel
        </button>
        <button type="button" class="btn btn-primary" id="transform-btn">
          Transform Content
        </button>
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
      .map((instruction) => `
        <div class="history-item" data-instruction="${this.escapeHtml(instruction)}" title="Click to use this instruction">
          ${this.escapeHtml(instruction)}
        </div>
      `)
      .join('');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  protected setupEventListeners(): void {
    // Get DOM elements
    this.instructionTextarea = this.element?.querySelector('#instruction-textarea') as HTMLTextAreaElement;
    this.countInput = this.element?.querySelector('#count-input') as HTMLInputElement;
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
    
    // History item clicks
    if (this.historyContainer) {
      this.historyContainer.addEventListener('click', (event) => {
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
    }
    
    // Enter key handling (Ctrl+Enter to submit)
    if (this.instructionTextarea) {
      this.instructionTextarea.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'Enter') {
          event.preventDefault();
          void this.handleTransform();
        }
      });
    }
  }

  private async handleTransform(): Promise<void> {
    if (!this.instructionTextarea || !this.countInput) return;
    
    const instruction = this.instructionTextarea.value.trim();
    const count = parseInt(this.countInput.value) || 1;
    
    if (!instruction) {
      alert('Please enter an instruction for how to transform the content.');
      this.instructionTextarea.focus();
      return;
    }
    
    // Save to history
    await this.saveToHistory(instruction);
    
    // Call the callback
    if (this.onTransformConfirmed) {
      this.onTransformConfirmed({ instruction, count });
    }
    
    await this.close();
  }

  private async loadTransformHistory(): Promise<void> {
    try {
      const storage = await this.storageService;
      const history = await storage.get<string[]>(STORAGE_KEY_TRANSFORM_HISTORY);
      this.transformHistory = history || [];
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
      await storage.set(STORAGE_KEY_TRANSFORM_HISTORY, this.transformHistory);
    } catch (error) {
      console.warn('Failed to save transform history:', error);
    }
  }
} 