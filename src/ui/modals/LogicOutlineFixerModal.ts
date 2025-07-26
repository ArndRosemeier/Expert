import { BaseModal } from './core/BaseModal';
import { DocumentNode } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';
import { OpenRouterClient } from '../../OpenRouterClient';
import { SettingsManager } from '../../SettingsManager';
import { LogicOutlineFixerService, FixedOutlineResult } from './services/LogicOutlineFixerService';
import { DiffTool } from '../../DiffTool';

interface LogicOutlineFixerConfig {
    id: string;
    node: DocumentNode;
    projectManager: ProjectManager;
}

export class LogicOutlineFixerModal extends BaseModal {
    private node: DocumentNode;
    private projectManager: ProjectManager;
    private modalState: 'loading' | 'review' = 'loading';
    private fixedResult: FixedOutlineResult | null = null;
    private logicOutlineService!: LogicOutlineFixerService;

    constructor(config: LogicOutlineFixerConfig) {
        super({
            id: config.id,
            title: '🔧 Fix Logic in Outline',
            width: '1000px',
            height: '80vh'
        });
        
        this.node = config.node;
        this.projectManager = config.projectManager;
    }

    public render(): HTMLElement {
        const content = document.createElement('div');
        content.innerHTML = this.renderModalContent();
        return content;
    }

    /**
     * Initialize service when modal opens
     */
    override async open(): Promise<void> {
        const openRouterClient = OpenRouterClient.getInstance();
        const settingsManager = await SettingsManager.getInstance();
        
        this.logicOutlineService = new LogicOutlineFixerService(openRouterClient, settingsManager);

        await super.open();
        this.setupEventListeners();
    }

    private renderModalContent(): string {
        if (this.modalState === 'loading') {
            return this.renderLoadingContent();
        } else {
            return this.renderReviewContent();
        }
    }

    private renderLoadingContent(): string {
        return `
            <div style="text-align: center; padding: 40px;">
                <div style="
                    width: 80px; 
                    height: 80px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 3em; 
                    margin: 0 auto 20px auto; 
                    animation: spin 2s linear infinite;
                    overflow: hidden;
                    transform-origin: center;
                ">🔧</div>
                <h3 style="color: #1976d2; margin-bottom: 15px;">Analyzing Logic Problems</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    Generating improved outline that addresses the identified logic errors...
                </p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 600px;">
                    <p style="font-size: 0.9em; color: #555; margin: 0;">
                        🧩 Analyzing ${this.node.getIncompleteTodos().length} todo items<br/>
                        🔍 Understanding current outline structure<br/>
                        ✏️ Generating improved version
                    </p>
                </div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
    }

    private renderReviewContent(): string {
        if (!this.fixedResult) {
            return '<div>Error: No fixed outline available</div>';
        }

        const todos = this.node.getIncompleteTodos();
        
        // Generate diff comparison using DiffTool
        const diffResult = DiffTool.compare(this.fixedResult.originalContent, this.fixedResult.fixedContent);
        const diffSummary = DiffTool.getSummary(diffResult);
        
        return `
            <style>
                .diff-content {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    font-family: system-ui, -apple-system, sans-serif;
                    line-height: 1.5;
                }
                
                .diff-content ins {
                    background-color: #d4edda;
                    color: #155724;
                    text-decoration: none;
                    padding: 2px 4px;
                    border-radius: 3px;
                }
                
                .diff-content del {
                    background-color: #f8d7da;
                    color: #721c24;
                    text-decoration: line-through;
                    padding: 2px 4px;
                    border-radius: 3px;
                }
                
                .diff-summary {
                    background: #e3f2fd;
                    border-left: 4px solid #2196f3;
                    padding: 12px;
                    margin-bottom: 20px;
                    border-radius: 4px;
                }
                
                .diff-stats {
                    margin: 0;
                    font-weight: 500;
                    color: #1565c0;
                }
                
                .content-comparison {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .content-section {
                    flex: 1;
                }
                
                .content-box {
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 15px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                
                .original-content {
                    border-color: #f44336;
                }
                
                .fixed-content {
                    border-color: #4caf50;
                }
            </style>

            <div style="padding: 20px; height: calc(100% - 80px); overflow-y: auto;">
                <!-- Todo Items Section -->
                <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #e65100;">🚨 Issues Being Addressed (${todos.length})</h4>
                    ${todos.map((todo, index) => `
                        <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #ffcc02;">
                            <div style="font-weight: 500;">${index + 1}. ${todo.description}</div>
                        </div>
                    `).join('')}
                </div>

                <!-- Problems Addressed Section -->
                <div style="background: #e8f5e8; border-left: 4px solid #4caf50; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #2e7d32;">✅ How Problems Were Fixed</h4>
                    <div style="font-size: 0.9em; color: #1b5e20;">
                        ${this.fixedResult.explanation}
                    </div>
                </div>

                <!-- Diff Summary -->
                <div class="diff-summary">
                    <p class="diff-stats">📊 Changes Made: ${diffSummary}</p>
                </div>

                <!-- Content Comparison -->
                <div class="content-comparison">
                    <div class="content-section">
                        <h4 style="color: #d32f2f; margin-bottom: 10px;">📄 Original Content</h4>
                        <div class="content-box original-content diff-content">
                            ${diffResult.originalHtml}
                        </div>
                    </div>
                    
                    <div class="content-section">
                        <h4 style="color: #4caf50; margin-bottom: 10px;">📝 Fixed Content</h4>
                        <div class="content-box fixed-content diff-content">
                            ${diffResult.modifiedHtml}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div style="position: absolute; bottom: 20px; left: 20px; right: 20px; display: flex; gap: 15px; justify-content: center; background: white; padding: 15px 0; border-top: 1px solid #ddd;">
                <button 
                    id="retry-fix-btn" 
                    style="background: #ff9800; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 1em; cursor: pointer; font-weight: 500;"
                >
                    🔄 Retry Fix
                </button>
                <button 
                    id="apply-fix-btn" 
                    style="background: #4caf50; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 1em; cursor: pointer; font-weight: 500;"
                >
                    ✅ Apply Fixed Outline
                </button>
                <button 
                    id="cancel-fix-btn" 
                    style="background: #757575; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-size: 1em; cursor: pointer; font-weight: 500;"
                >
                    ❌ Cancel
                </button>
            </div>
        `;
    }

    private setupEventListeners(): void {
        // Start the fixing process immediately when modal opens
        if (this.modalState === 'loading') {
            void this.generateFixedOutlineWithErrorHandling();
        }

        this.setupActionEventListeners();
    }

    private async generateFixedOutlineWithErrorHandling(): Promise<void> {
        try {
            await this.generateFixedOutline();
        } catch (error: unknown) {
            console.error('❌ Failed to generate fixed outline:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            alert(`Failed to generate fixed outline: ${errorMessage}`);
        }
    }

    private setupActionEventListeners(): void {
        // Retry button
        const retryBtn = document.getElementById('retry-fix-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', (): void => {
                this.modalState = 'loading';
                this.fixedResult = null;
                this.updateModalContent();
                void this.generateFixedOutlineWithErrorHandling();
            });
        }

        // Apply button
        const applyBtn = document.getElementById('apply-fix-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', async (): Promise<void> => {
                try {
                    await this.applyFixedOutline();
                } catch (error: unknown) {
                    console.error('❌ Failed to apply fixed outline:', error);
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    alert(`Failed to apply fixed outline: ${errorMessage}`);
                }
            });
        }

        // Cancel button
        const cancelBtn = document.getElementById('cancel-fix-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', async (): Promise<void> => {
                try {
                    await this.close();
                } catch (error: unknown) {
                    console.error('❌ Failed to close modal via cancel:', error);
                }
            });
        }
    }

    private async generateFixedOutline(): Promise<void> {
        try {
            console.log('🔧 Starting logic outline fix generation');
            
            this.fixedResult = await this.logicOutlineService.generateFixedOutline(
                this.node,
                this.node.getIncompleteTodos()
            );

            console.log('✅ Fixed outline generated successfully');
            
            this.modalState = 'review';
            this.updateModalContent();

        } catch (error) {
            console.error('❌ Failed to generate fixed outline:', error);
            
            // Show error state
            if (!this.element) {
                throw new Error('Modal element not initialized during error handling');
            }
            const modalContent = this.element.querySelector('.modal-content');
            if (!modalContent) {
                throw new Error('Modal content container not found during error handling');
            }
            modalContent.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="font-size: 3em; margin-bottom: 20px;">⚠️</div>
                    <h3 style="color: #d32f2f; margin-bottom: 15px;">Failed to Generate Fix</h3>
                    <p style="color: #666; margin-bottom: 20px;">
                        Unable to generate improved outline. Please try again.
                    </p>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button 
                            onclick="document.getElementById('${this.config.id}').dispatchEvent(new CustomEvent('retry'))"
                            style="background: #ff9800; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer;"
                        >
                            🔄 Retry
                        </button>
                        <button 
                            onclick="document.getElementById('${this.config.id}').dispatchEvent(new CustomEvent('close'))"
                            style="background: #757575; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer;"
                        >
                            ❌ Close
                        </button>
                    </div>
                </div>
            `;

            // Add event listeners for error state buttons
            if (!this.element) {
                throw new Error('Modal element not initialized for event listeners');
            }
            this.element.addEventListener('retry', (): void => {
                this.modalState = 'loading';
                this.updateModalContent();
                void this.generateFixedOutlineWithErrorHandling();
            });

            this.element.addEventListener('close', async (): Promise<void> => {
                try {
                    await this.close();
                } catch (error: unknown) {
                    console.error('❌ Failed to close modal:', error);
                }
            });
        }
    }

    private async applyFixedOutline(): Promise<void> {
        if (!this.fixedResult) {
            console.error('❌ No fixed result available');
            throw new Error('No fixed result available');
        }

        console.log('🔧 Starting to apply fixed outline...');
        console.log('📝 Original content length:', this.node.content ? this.node.content.length : 0);
        console.log('📝 Fixed content length:', this.fixedResult.fixedContent.length);

        const hasChildren: boolean = Boolean(this.node.children && this.node.children.length > 0);
        
        if (hasChildren) {
            if (!this.node.children) {
                throw new Error('Node children is null but hasChildren is true - invalid state');
            }
            const deleteChildren = confirm(
                `This node has ${this.node.children.length} child nodes.\n\n` +
                'Do you want to delete all children so they can be rebuilt fresh from the improved outline?\n\n' +
                '• Yes: Delete children and apply new outline (recommended for fresh start)\n' +
                '• No: Keep children and just update the outline content'
            );

            if (deleteChildren) {
                // Delete all children
                const childrenCount: number = this.node.children ? this.node.children.length : 0;
                console.log(`🗑️ Deleting ${childrenCount} child nodes...`);
                if (this.node.children) {
                    for (const child of [...this.node.children]) {
                        this.projectManager.removeNode(child.id);
                    }
                }
                console.log(`✅ Deleted ${childrenCount} child nodes for fresh start`);
            }
        }

        // Apply the fixed content
        console.log('📝 Applying fixed content...');
        console.log('📝 Fixed content preview:', this.fixedResult.fixedContent.substring(0, 100) + '...');
        
        this.node.setContent(this.fixedResult.fixedContent.trim());
        
        const contentAfter: string = this.node.content || '';
        console.log('📝 Content after setContent:', contentAfter.substring(0, 100) + '...');
        console.log('📝 Content length after setContent:', contentAfter.length);
        
        // Clear all todos since the outline has been fixed to address the logic problems
        console.log('📝 Clearing todos...');
        const allTodos = this.node.getIncompleteTodos();
        console.log(`📝 Found ${allTodos.length} todos to clear`);
        for (const todo of allTodos) {
            this.node.completeTodo(todo.id);
        }
        console.log('✅ All todos cleared');

        // Save changes
        console.log('💾 Saving to storage...');
        await this.projectManager.saveToStorage();
        console.log('✅ Saved to storage');
        
        // Refresh the project UI
        console.log('🔄 Refreshing UI...');
        const { renderMultiProjectTree } = await import('../project-ui');
        renderMultiProjectTree();
        console.log('✅ UI refreshed');
        
        console.log('🎉 Applied fixed outline and updated project successfully');
        
        // Show success message
        if (!this.element) {
            throw new Error('Modal element not initialized for success display');
        }
        const modalContent = this.element.querySelector('.modal-content');
        if (!modalContent) {
            throw new Error('Modal content container not found for success display');
        }
        modalContent.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 3em; margin-bottom: 20px;">✅</div>
                <h3 style="color: #4caf50; margin-bottom: 15px;">Outline Updated Successfully!</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    The improved outline has been applied to the node${hasChildren ? ' and children have been prepared for fresh expansion' : ''}.
                </p>
            </div>
        `;
    }

    private updateModalContent(): void {
        if (!this.element) {
            throw new Error('Modal element not initialized');
        }
        const modalContent = this.element.querySelector('.modal-content');
        if (!modalContent) {
            throw new Error('Modal content container not found');
        }
        modalContent.innerHTML = this.renderModalContent();
        this.setupActionEventListeners();
    }
} 