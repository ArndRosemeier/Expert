import { SettingsManager } from '../../SettingsManager';
import { TaskModelService, AllTaskModelConfigs, TaskModelConfig, MODEL_PURPOSES } from '../../services/TaskModelService';

export interface TaskModelEditorOptions {
    onChange?: () => void;
    showDescriptions?: boolean;
}

/**
 * Component for editing task-based model configurations
 * Allows users to configure which model purpose to use for different tasks
 */
export class TaskModelEditor {
    private container: HTMLElement;
    private taskModelService: TaskModelService;
    private options: TaskModelEditorOptions;

    constructor(
        container: HTMLElement, 
        settingsManager: SettingsManager,
        options: Partial<TaskModelEditorOptions> = {}
    ) {
        this.container = container;
        this.taskModelService = new TaskModelService(settingsManager);
        this.options = {
            showDescriptions: true,
            ...options
        };
    }

    /**
     * Render the task model editor UI
     */
    public render(): void {
        this.container.innerHTML = '';
        this.container.className = 'task-model-editor';

        // Add styles
        this.addStyles();

        // Create header
        const header = document.createElement('div');
        header.className = 'task-model-header';
        header.innerHTML = `
            <h3>Task Model Configuration</h3>
            ${this.options.showDescriptions ? `
                <p class="task-model-description">
                    Configure which AI model purpose to use for different tasks. You can choose different models for outline (branch) nodes and prose (leaf) nodes.
                </p>
            ` : ''}
        `;
        this.container.appendChild(header);

        // Create task configuration sections
        const configs = this.taskModelService.getTaskModelConfigs();
        Object.entries(configs).forEach(([taskType, config]) => {
            const section = this.createTaskConfigSection(taskType as keyof AllTaskModelConfigs, config);
            this.container.appendChild(section);
        });
    }

    /**
     * Create a task configuration section
     */
    private createTaskConfigSection(taskType: keyof AllTaskModelConfigs, config: TaskModelConfig): HTMLElement {
        const displayInfo = this.taskModelService.getTaskConfigDisplay(taskType);
        
        const section = document.createElement('div');
        section.className = 'task-config-section';
        section.innerHTML = `
            <div class="task-config-header">
                <h4>${displayInfo.taskName}</h4>
                ${this.options.showDescriptions ? this.getTaskDescription(taskType) : ''}
            </div>
            <div class="task-config-controls">
                <div class="model-config-row">
                    <div class="model-config-label">
                        <span class="model-type">Outline Nodes</span>
                        <span class="model-type-description">For branch nodes with children</span>
                    </div>
                    <div class="model-config-selection">
                        <select class="model-purpose-select" data-task="${taskType}" data-node-type="outline">
                            ${this.renderPurposeOptions(config.outline)}
                        </select>
                        <div class="current-model-container">
                            <span class="current-model-label">Current Model:</span>
                            <span class="current-model-display">${displayInfo.outline.model}</span>
                        </div>
                    </div>
                </div>
                <div class="model-config-row">
                    <div class="model-config-label">
                        <span class="model-type">Prose Nodes</span>
                        <span class="model-type-description">For leaf nodes without children</span>
                    </div>
                    <div class="model-config-selection">
                        <select class="model-purpose-select" data-task="${taskType}" data-node-type="prose">
                            ${this.renderPurposeOptions(config.prose)}
                        </select>
                        <div class="current-model-container">
                            <span class="current-model-label">Current Model:</span>
                            <span class="current-model-display">${displayInfo.prose.model}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        section.querySelectorAll('.model-purpose-select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.handleModelPurposeChange(e.target as HTMLSelectElement);
            });
        });

        return section;
    }

    /**
     * Render options for model purpose selection
     */
    private renderPurposeOptions(selectedPurpose: string): string {
        return MODEL_PURPOSES.map(purpose => `
            <option value="${purpose.key}" ${purpose.key === selectedPurpose ? 'selected' : ''}>
                ${purpose.label}
            </option>
        `).join('');
    }

    /**
     * Handle model purpose selection change
     */
    private async handleModelPurposeChange(select: HTMLSelectElement): Promise<void> {
        const taskType = select.dataset['task'] as keyof AllTaskModelConfigs;
        const nodeType = select.dataset['nodeType'] as 'outline' | 'prose';
        const newPurpose = select.value;

        if (!taskType || !nodeType) return;

        try {
            // Get current config
            const currentConfigs = this.taskModelService.getTaskModelConfigs();
            const currentConfig = currentConfigs[taskType];

            // Update the specific node type
            const updatedConfig: TaskModelConfig = {
                ...currentConfig,
                [nodeType]: newPurpose
            };

            // Save the updated configuration
            await this.taskModelService.updateTaskModelConfig(taskType, updatedConfig);

            // Update the current model display
            this.updateCurrentModelDisplay(select, newPurpose);

            // Notify of change
            this.options.onChange?.();

        } catch (error) {
            console.error('Failed to update task model configuration:', error);
            // Revert the select to its previous value
            select.value = this.taskModelService.getTaskModelConfigs()[taskType][nodeType];
        }
    }

    /**
     * Update the current model display next to a select
     */
    private updateCurrentModelDisplay(select: HTMLSelectElement, purpose: string): void {
        const row = select.closest('.model-config-row');
        if (row) {
            const display = row.querySelector('.current-model-display');
            if (display) {
                display.textContent = this.taskModelService.getCurrentModelName(purpose as any);
            }
        }
    }

    /**
     * Get description for a task type
     */
    private getTaskDescription(taskType: keyof AllTaskModelConfigs): string {
        const descriptions = {
            coherence_analysis: 'Analyzes content for contradictions between parent outlines and child content.',
            fix_contradiction: 'Fixes contradictions found in child content to match parent outlines.',
            text_polishing: 'Enhances and polishes text content for better clarity, style, and quality.',
            context_adjustment: 'Analyzes inherited context to identify problematic items for procedural removal.'
        };
        return descriptions[taskType] ? `<p class="task-description">${descriptions[taskType]}</p>` : '';
    }

    /**
     * Add CSS styles for the component
     */
    private addStyles(): void {
        const styleId = 'task-model-editor-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .task-model-editor {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 0.5rem;
                padding: 1.5rem;
                margin-bottom: 1.5rem;
            }

            .task-model-header h3 {
                margin: 0 0 0.5rem 0;
                color: #1f2937;
                font-size: 1.125rem;
                font-weight: 600;
            }

            .task-model-description {
                margin: 0 0 1rem 0;
                color: #6b7280;
                font-size: 0.875rem;
                line-height: 1.4;
            }

            .task-config-section {
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 0.375rem;
                padding: 1.25rem;
                margin-bottom: 1rem;
            }

            .task-config-section:last-child {
                margin-bottom: 0;
            }

            .task-config-header h4 {
                margin: 0 0 0.5rem 0;
                color: #1f2937;
                font-size: 1rem;
                font-weight: 600;
            }

            .task-description {
                margin: 0 0 1rem 0;
                color: #6b7280;
                font-size: 0.875rem;
                line-height: 1.4;
            }

            .task-config-controls {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }

            .model-config-row {
                display: flex;
                align-items: center;
                gap: 1rem;
                padding: 0.75rem;
                background: #f9fafb;
                border-radius: 0.375rem;
            }

            .model-config-label {
                flex: 0 0 160px;
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
            }

            .model-type {
                font-weight: 500;
                color: #1f2937;
                font-size: 0.875rem;
            }

            .model-type-description {
                color: #6b7280;
                font-size: 0.75rem;
                font-weight: normal;
            }

            .model-config-selection {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .model-purpose-select {
                flex: 0 0 140px;
                padding: 0.5rem;
                border: 1px solid #d1d5db;
                border-radius: 0.375rem;
                background: white;
                font-size: 0.875rem;
                cursor: pointer;
            }

            .model-purpose-select:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .current-model-container {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                min-width: 150px;
                font-size: 0.75rem;
                color: #6b7280;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                background: #f3f4f6;
                padding: 0.375rem 0.5rem;
                border-radius: 0.25rem;
                border: 1px solid #e5e7eb;
            }

            .current-model-label {
                font-weight: 500;
                color: #1f2937;
                font-size: 0.75rem;
                white-space: nowrap;
            }

            .current-model-display {
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 0.75rem;
                color: #6b7280;
                font-weight: 400;
            }

            @media (max-width: 768px) {
                .model-config-row {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 0.75rem;
                }

                .model-config-selection {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 0.5rem;
                }

                .current-model-container {
                    min-width: auto;
                    justify-content: space-between;
                }

                .model-purpose-select {
                    min-width: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }
} 