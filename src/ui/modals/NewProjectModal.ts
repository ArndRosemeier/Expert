/**
 * Enhanced New Project Modal with Tabbed Interface
 * 
 * Provides both manual and AI-powered project creation
 */

import { BaseModal } from './core/BaseModal';
import { ModalConfig } from './types/ModalTypes';
import { ManualProjectCreator, ManualProjectCreatorConfig } from './components/ManualProjectCreator';
import { AIProjectCreator, AIProjectCreatorConfig } from './components/AIProjectCreator';
import { OutlineFactory } from './components/OutlineFactory';
import { OutlineGenerationResult } from '../../types/OutlineFactoryTypes';
import { AI_ASSISTANT_EMOJI } from '../../constants';
import { ProjectTemplate } from '../../ProjectTemplate';
import { createElement } from './core/modal-utils';
import { SettingsManager } from '../../SettingsManager';
import * as state from '../../state';

interface NewProjectModalConfig extends ModalConfig {
    onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => void;
    settingsManager: SettingsManager;
}

type TabType = 'manual' | 'ai' | 'outline';

export class NewProjectModal extends BaseModal {
    private onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => void;
    private activeTab: TabType = 'ai';
    private manualCreator: ManualProjectCreator;
    private aiCreator: AIProjectCreator;
    private outlineFactory: OutlineFactory;
    private currentTabContent: HTMLElement | null = null;
    private settingsManager: SettingsManager;

    constructor(config: NewProjectModalConfig) {
        super({
            ...config,
            title: '🚀 Create New Project',
            id: 'new-project-modal'
        });

        this.onCreate = config.onCreate;
        this.settingsManager = config.settingsManager;

        // Initialize components
        const manualConfig: ManualProjectCreatorConfig = {
            onCreate: (title: string, template: ProjectTemplate) => {
                this.handleProjectCreated(title, template);
            }
        };

        const aiConfig: AIProjectCreatorConfig = {
            onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => {
                this.handleProjectCreated(title, template, aiData);
            },
            settingsManager: this.settingsManager
        };

        this.manualCreator = new ManualProjectCreator(manualConfig);
        this.aiCreator = new AIProjectCreator(aiConfig);
        this.outlineFactory = new OutlineFactory(createElement('div'));
        
        // Set up outline factory event listener
        this.outlineFactory.onChange(() => {
            // Auto-save configuration on changes - handled internally by OutlineFactory
        });
    }

    public render(): HTMLElement {
        const container = createElement('div', {
            classes: ['new-project-modal']
        });

        container.innerHTML = `
            <style>
                .new-project-modal {
                    max-width: 1200px;
                    width: 90vw;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                
                .modal-header {
                    padding: 1.5rem 1.5rem 0 1.5rem;
                    border-bottom: 1px solid #e9ecef;
                    margin-bottom: 0;
                }
                
                .modal-title {
                    font-size: 1.5rem;
                    font-weight: bold;
                    color: #333;
                    margin: 0 0 1rem 0;
                    text-align: center;
                }
                
                .tab-container {
                    padding: 0 1.5rem;
                }
                
                .tab-header {
                    display: flex;
                    border-bottom: 2px solid #e9ecef;
                    margin-bottom: 2rem;
                    gap: 0;
                }
                
                .tab-btn {
                    flex: 1;
                    padding: 1rem 1.5rem;
                    border: none;
                    background: transparent;
                    color: #6c757d;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border-bottom: 3px solid transparent;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                }
                
                .tab-btn:hover {
                    color: #007bff;
                    background-color: #f8f9fa;
                }
                
                .tab-btn.active {
                    color: #007bff;
                    border-bottom-color: #007bff;
                    background-color: #f8f9fa;
                }
                
                .tab-content {
                    min-height: 400px;
                    padding: 0 0 2rem 0;
                }
                
                /* Make modal wider for 2-column layout */
                .modal {
                    max-width: 1000px;
                }
                
                .modal-body {
                    padding: 0;
                }
                
                /* Override button styles to ensure consistency */
                .button {
                    padding: 0.75rem 1.5rem;
                    border: none;
                    border-radius: 6px;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                }
                
                .button-primary {
                    background-color: #007bff;
                    color: white;
                    border: 2px solid #007bff;
                }
                
                .button-primary:hover {
                    background-color: #0056b3;
                    border-color: #0056b3;
                    transform: translateY(-1px);
                }
                
                .button-primary:disabled {
                    background-color: #6c757d;
                    border-color: #6c757d;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .button-secondary {
                    background-color: transparent;
                    color: #6c757d;
                    border: 2px solid #6c757d;
                }
                
                .button-secondary:hover {
                    background-color: #6c757d;
                    color: white;
                    transform: translateY(-1px);
                }
                
                .form-control {
                    padding: 0.75rem;
                    border: 2px solid #e1e5e9;
                    border-radius: 6px;
                    font-family: inherit;
                    font-size: 1rem;
                    transition: border-color 0.2s ease;
                    box-sizing: border-box;
                }
                
                .form-control:focus {
                    outline: none;
                    border-color: #007bff;
                    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
                }
                
                .form-group {
                    margin-bottom: 1.5rem;
                }
                
                .form-group label {
                    display: block;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                    color: #333;
                }
                
                .form-text {
                    font-size: 0.875rem;
                    color: #6c757d;
                    margin-top: 0.25rem;
                }
                
                .error-message {
                    color: #dc3545;
                    font-weight: 500;
                    text-align: center;
                    padding: 1rem;
                    background-color: #f8d7da;
                    border: 1px solid #f5c6cb;
                    border-radius: 6px;
                }
            </style>
            
            <div class="modal-header">
                <h2 class="modal-title">🚀 Create New Project</h2>
            </div>
            
            <div class="modal-body">
                <div class="tab-container">
                    <div class="tab-header">
                        <button class="tab-btn ${this.activeTab === 'manual' ? 'active' : ''}" 
                                data-tab="manual">
                            📝 Manual Setup
                        </button>
                        <button class="tab-btn ${this.activeTab === 'ai' ? 'active' : ''}" 
                                data-tab="ai">
                            ${AI_ASSISTANT_EMOJI} AI Creation
                        </button>
                        <button class="tab-btn ${this.activeTab === 'outline' ? 'active' : ''}" 
                                data-tab="outline">
                            🏭 Outline Factory
                        </button>
                    </div>
                    <div class="tab-content" id="tab-content-container">
                        <!-- Tab content will be rendered here -->
                    </div>
                </div>
            </div>
        `;

        // Set up tab switching
        this.setupTabSwitching(container);
        
        // Render initial tab content
        this.renderTabContent(container);

        return container;
    }

    private setupTabSwitching(container: HTMLElement): void {
        const tabButtons = container.querySelectorAll('.tab-btn');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const tab = target.getAttribute('data-tab') as TabType;
                
                if (tab && tab !== this.activeTab) {
                    this.switchTab(tab, container);
                }
            });
        });
    }

    private switchTab(tab: TabType, container: HTMLElement): void {
        // Clean up current tab
        this.cleanupCurrentTab();
        
        // Update active tab
        this.activeTab = tab;
        
        // Update tab button states
        const tabButtons = container.querySelectorAll('.tab-btn');
        tabButtons.forEach(button => {
            const buttonTab = button.getAttribute('data-tab');
            if (buttonTab === tab) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        
        // Render new tab content
        this.renderTabContent(container);
    }

    private renderTabContent(container: HTMLElement): void {
        const contentContainer = container.querySelector('#tab-content-container') as HTMLElement;
        
        if (!contentContainer) return;
        
        // Clear existing content
        contentContainer.innerHTML = '';
        
        if (this.activeTab === 'outline') {
            // Render OutlineFactory component directly to the container
            this.outlineFactory = new OutlineFactory(contentContainer);
            this.outlineFactory.render().then(() => {
                // Listen for outline generation completion
                contentContainer.addEventListener('outline-generated', async (event: Event) => {
                    const customEvent = event as CustomEvent;
                    const result = customEvent.detail as OutlineGenerationResult;
                    await this.handleOutlineGenerationResult(result);
                });
            });
        } else {
            // Generate content for manual/ai tabs
            const content = this.activeTab === 'manual' 
                ? this.manualCreator.render()
                : this.aiCreator.render();
            
            contentContainer.innerHTML = content;
            
            // Set up event listeners for the active component
            const activeCreator = this.activeTab === 'manual' ? this.manualCreator : this.aiCreator;
            activeCreator.setupEventListeners(contentContainer);
            
            // Set up cancel event handlers
            contentContainer.addEventListener('manual-cancel', async () => this.close());
            contentContainer.addEventListener('ai-cancel', async () => this.close());
        }
        
        // Store reference for cleanup
        this.currentTabContent = contentContainer;
    }

    private async handleOutlineGenerationResult(result: OutlineGenerationResult): Promise<void> {
        try {
            // Get any available template for the structure (content will be overridden by AI data)
            const templateManager = state.getTemplateManager()!;
            const templateNames = templateManager.getTemplateNames();
            const template = templateManager.getTemplate(templateNames[0]!)!;
            
            // Combine AI-generated context with procedural genre/themes and style guide
            const combinedContext = result.context + '\n\n' + result.genreThemesContext + '\n\n' + result.styleGuideContext;
            
            // Create AI data structure for the outline factory result
            const aiData = {
                isAIGenerated: true,
                content: result.content,
                context: combinedContext,
                description: 'Generated by Outline Factory',
                projectType: 'outline-factory',
                options: this.outlineFactory.getCurrentConfig()
            };
            
            // Create the project with outline factory data
            await this.handleProjectCreated(result.title, template, aiData);
            
        } catch (error) {
            console.error('Failed to handle outline generation result:', error);
            alert('Failed to create project from outline. Please try again.');
        }
    }

    private cleanupCurrentTab(): void {
        if (this.currentTabContent) {
            if (this.activeTab === 'outline') {
                // OutlineFactory handles its own cleanup
            } else {
                // Cleanup the active component
                const activeCreator = this.activeTab === 'manual' ? this.manualCreator : this.aiCreator;
                activeCreator.cleanup();
            }
            this.currentTabContent = null;
        }
    }

    private async handleProjectCreated(title: string, template: ProjectTemplate, aiData?: unknown): Promise<void> {
        try {
            // Call the provided onCreate callback
            this.onCreate(title, template, aiData);
            
            // Close the modal
            await this.close();
            
        } catch (error) {
            console.error('Failed to create project:', error);
            alert('Failed to create project. Please try again.');
        }
    }

    public override async close(): Promise<void> {
        // Clean up current tab before closing
        this.cleanupCurrentTab();
        
        // Clean up components
        this.manualCreator.cleanup();
        this.aiCreator.cleanup();
        // OutlineFactory handles its own cleanup internally
        
        await super.close();
    }

    /**
     * Static method to open the new project modal
     */
    public static async open(onCreate: (title: string, template: ProjectTemplate, aiData?: unknown) => void, settingsManager: SettingsManager): Promise<NewProjectModal> {
        const modal = new NewProjectModal({
            id: 'new-project-modal',
            onCreate,
            settingsManager
        });
        
        await modal.open();
        return modal;
    }
} 