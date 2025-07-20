import { BaseModal } from './core/BaseModal';
import { createElement } from './core/modal-utils';
import { DocumentNode } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';

import { AI_ASSISTANT_EMOJI } from '../../constants';

export interface ConversationalGenerationModalConfig {
    projectManager: ProjectManager;
    node: DocumentNode;
}

export class ConversationalGenerationModal extends BaseModal {
    private projectManager: ProjectManager;
    private node: DocumentNode;

    // State for generation settings
    private draftLevel: number = -1;
    private contentLevel: number = -1;
    private contextPruneLevel: number = -1;
    private coherenceLevel: number = -1;
    private autofixSeverity: number = -1;
    private contextRatingThreshold: number = -1;

    constructor(config: ConversationalGenerationModalConfig) {
        super({
            id: 'conversational-generation-modal',
            title: `${AI_ASSISTANT_EMOJI} Smart Generation Assistant`,
            closable: true,
            backdrop: true,
            width: '90vw',
            height: '85vh',
            maxWidth: '1200px',
            maxHeight: '900px'
        });

        this.projectManager = config.projectManager;
        this.node = config.node;

        // Initialize with intelligent defaults
        const nextLevel = this.node.level + 1;
        this.draftLevel = nextLevel < this.node.template.length ? nextLevel : this.node.level;
        this.contentLevel = nextLevel < this.node.template.length ? nextLevel : this.node.level;
        // Context cleaning: use nextLevel unless nextLevel is leaf level (less important at leaf level)
        this.contextPruneLevel = nextLevel < this.node.template.length - 1 ? nextLevel : this.node.level;
        // Enable quality checking by default if we have appropriate levels (must be less than draft level)
        this.coherenceLevel = this.draftLevel > this.node.level ? this.node.level : -1;
        this.autofixSeverity = 5; // Default autofix severity
    }

    /**
     * Get the display name for a template level
     */
    private getLevelDisplayName(level: number): string {
        if (level < 0 || level >= this.node.template.length) return 'Unknown';
        const levelName = this.node.template[level];
        if (!levelName) return 'Unknown';
        return levelName.match(/^(\w+)(?:\s+\d+)?$/)?.[1] || levelName;
    }

    /**
     * Get available levels from current node down
     */
    private getAvailableLevels(): Array<{ value: number; name: string }> {
        const levels: Array<{ value: number; name: string }> = [];
        
        for (let i = this.node.level; i < this.node.template.length; i++) {
            levels.push({
                value: i,
                name: this.getLevelDisplayName(i)
            });
        }
        
        return levels;
    }

    /**
     * Get context cleaning levels (limited by draft level)
     */
    private getContextCleaningLevels(): Array<{ value: number; name: string }> {
        const levels: Array<{ value: number; name: string }> = [];
        
        // Context cleaning can only go up to the draft level
        const maxLevel = this.draftLevel === -1 ? this.node.level : this.draftLevel;
        
        for (let i = this.node.level; i <= maxLevel; i++) {
            levels.push({
                value: i,
                name: this.getLevelDisplayName(i)
            });
        }
        
        return levels;
    }

    /**
     * Get coherence levels (parent levels only, limited by draft level)
     */
    private getCoherenceLevels(): Array<{ value: number; name: string }> {
        const levels: Array<{ value: number; name: string }> = [];
        
        // Coherence level must be less than draft level and structure creation must be enabled
        if (this.draftLevel === -1) return levels; // No coherence checking if no structure creation
        
        const maxLevel = Math.min(this.draftLevel - 1, this.node.template.length - 2);
        
        for (let i = this.node.level; i <= maxLevel; i++) {
            levels.push({
                value: i,
                name: this.getLevelDisplayName(i + 1) // Show child level name for UI
            });
        }
        
        return levels;
    }

    public override render(): HTMLElement {
        const availableLevels = this.getAvailableLevels();
        const contextCleaningLevels = this.getContextCleaningLevels();
        const coherenceLevels = this.getCoherenceLevels();
        const currentLevelName = this.getLevelDisplayName(this.node.level);

        const container = createElement('div');
        container.innerHTML = `
            <div class="conversational-generation-container">
                <style>
                    .conversational-generation-container {
                        max-width: 1000px;
                        margin: 0 auto;
                        padding: 2rem;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        line-height: 1.6;
                        color: #374151;
                    }

                    .conversation-text {
                        font-size: 1.1rem;
                        line-height: 1.7;
                        margin: 1.5rem 0;
                    }

                    .conversation-text strong {
                        color: #1f2937;
                        font-weight: 600;
                    }

                    .inline-control {
                        display: inline-block;
                        margin: 0 0.25rem;
                        padding: 0.4rem 0.8rem;
                        border: 2px solid #3b82f6;
                        border-radius: 8px;
                        background: #eff6ff;
                        color: #1e40af;
                        font-weight: 600;
                        min-width: 120px;
                        text-align: center;
                    }

                    .inline-control select {
                        border: none;
                        background: transparent;
                        color: inherit;
                        font-weight: inherit;
                        font-size: inherit;
                        cursor: pointer;
                        width: 100%;
                    }

                    .inline-control select:focus {
                        outline: none;
                    }

                    .inline-control.disabled {
                        background: #f3f4f6;
                        border-color: #d1d5db;
                        color: #6b7280;
                    }

                    .inline-control.none-selected {
                        background: #f9fafb;
                        border-color: #e5e7eb;
                        color: #6b7280;
                    }

                    .node-info-card {
                        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        padding: 1.5rem;
                        margin: 2rem 0;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    }

                    .node-title {
                        font-size: 1.3rem;
                        font-weight: 700;
                        color: #1e293b;
                        margin-bottom: 0.5rem;
                    }

                    .node-path {
                        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
                        font-size: 0.9rem;
                        color: #64748b;
                        background: #ffffff;
                        padding: 0.25rem 0.5rem;
                        border-radius: 4px;
                        display: inline-block;
                    }

                    .control-section {
                        background: #ffffff;
                        border: 1px solid #e5e7eb;
                        border-radius: 12px;
                        padding: 1.5rem;
                        margin: 1.5rem 0;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                    }

                    .section-title {
                        font-size: 1.1rem;
                        font-weight: 600;
                        color: #1f2937;
                        margin-bottom: 1rem;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                    }

                    .advanced-options {
                        animation: fadeIn 0.3s ease-in;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    .generation-actions {
                        display: flex;
                        gap: 1rem;
                        justify-content: center;
                        margin: 2rem 0;
                        padding: 1.5rem;
                        background: #f8fafc;
                        border-radius: 12px;
                        border: 1px solid #e2e8f0;
                    }

                    .generation-actions button {
                        padding: 0.75rem 2rem;
                        border-radius: 8px;
                        font-weight: 600;
                        font-size: 1rem;
                        cursor: pointer;
                        transition: all 0.2s;
                        border: 2px solid transparent;
                    }

                    .btn-primary {
                        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                        color: white;
                        border-color: #2563eb;
                    }

                    .btn-primary:hover:not(:disabled) {
                        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                    }

                    .btn-primary:disabled {
                        background: #9ca3af;
                        border-color: #9ca3af;
                        cursor: not-allowed;
                        transform: none;
                        box-shadow: none;
                    }

                    .btn-secondary {
                        background: #ffffff;
                        color: #6b7280;
                        border-color: #d1d5db;
                    }

                    .btn-secondary:hover {
                        background: #f9fafb;
                        border-color: #9ca3af;
                    }

                    .help-text {
                        background: #fffbeb;
                        border: 1px solid #fbbf24;
                        border-radius: 8px;
                        padding: 1rem;
                        margin: 1rem 0;
                        font-size: 0.95rem;
                        color: #92400e;
                    }

                    .help-text strong {
                        color: #78350f;
                    }

                    .validation-message {
                        background: #fee2e2;
                        border: 1px solid #fca5a5;
                        border-radius: 8px;
                        padding: 0.75rem;
                        margin: 1rem 0;
                        color: #dc2626;
                        font-size: 0.9rem;
                        display: none;
                    }

                    .validation-message.show {
                        display: block;
                    }
                </style>

                <!-- Current Node Information -->
                <div class="node-info-card">
                    <div class="node-title">📄 ${this.node.title}</div>
                    <div class="node-path">${this.projectManager.getNodePath(this.node.id)}</div>
                </div>

                <!-- Main Conversation Text -->
                <div class="conversation-text">
                    Welcome to the <strong>Smart Generation Assistant</strong>! This tool will help you generate content for your project in a way that's easy to understand and configure.
                </div>

                <div class="conversation-text">
                    I'll help you generate content for your <strong>${currentLevelName}</strong> node. Let's walk through the options step by step.
                </div>

                <!-- Primary Generation Settings -->
                <div class="control-section">
                    <div class="section-title">
                        🏗️ Structure Creation
                    </div>
                    <div class="conversation-text">
                        First, I can create child nodes (the structure) down to the 
                        <span class="inline-control">
                            <select id="draft-level-select" onchange="window.conversationalModal.updateDraftLevel(this.value)">
                                <option value="-1">Don't create children</option>
                                ${availableLevels.map(level => 
                                    `<option value="${level.value}" ${this.draftLevel === level.value ? 'selected' : ''}>${level.name}</option>`
                                ).join('')}
                            </select>
                        </span>
                        level.
                    </div>
                    
                    <div class="help-text">
                        💡 <strong>Structure Creation</strong> means the AI will analyze your current content and create child nodes with titles and brief descriptions. For example, if you're at the "Book" level, it might create "Chapter 1", "Chapter 2", etc.
                    </div>
                </div>

                <div class="control-section">
                    <div class="section-title">
                        ✍️ Content Writing
                    </div>
                    <div class="conversation-text">
                        Then, I can write actual content for all nodes down to the 
                        <span class="inline-control ${this.contentLevel === -1 ? 'none-selected' : ''}">
                            <select id="content-level-select" onchange="window.conversationalModal.updateContentLevel(this.value)">
                                <option value="-1">Don't write content</option>
                                ${availableLevels.map(level => 
                                    `<option value="${level.value}" ${this.contentLevel === level.value ? 'selected' : ''}>${level.name}</option>`
                                ).join('')}
                            </select>
                        </span>
                        level.
                    </div>
                    
                    <div class="help-text">
                        💡 <strong>Content Writing</strong> means the AI will generate the actual written content for each node. This includes detailed paragraphs, dialogue, descriptions, etc. - the "meat" of your project.
                        <br><br>
                        📋 <strong>Recommendation:</strong> Set content level at the same level as structure creation, or one level below. It's not recommended to create structure (drafts) based on just other drafts.
                    </div>
                </div>

                <!-- Advanced Options -->
                <div class="conversation-text">
                    <strong>🔧 Advanced Options for Better Quality</strong>
                </div>
                
                <div class="help-text">
                    💡 <strong>Advantages:</strong> Better coherence, higher quality, fewer errors and contradictions<br>
                    ⚠️ <strong>Drawbacks:</strong> Slower generation, higher API costs, more complex processing
                </div>

                <div id="advanced-options" class="advanced-options show">
                    <div class="control-section">
                        <div class="section-title">
                            🧹 Context Cleaning
                        </div>
                        <div class="conversation-text">
                            For better focus, I can automatically clean up inherited context down to the 
                            <span class="inline-control ${this.contextPruneLevel === -1 ? 'none-selected' : ''}">
                                <select id="context-prune-level-select" onchange="window.conversationalModal.updateContextPruneLevel(this.value)">
                                    <option value="-1">Don't clean context</option>
                                    ${contextCleaningLevels.map(level => 
                                        `<option value="${level.value}" ${this.contextPruneLevel === level.value ? 'selected' : ''}>${level.name}</option>`
                                    ).join('')}
                                </select>
                            </span>
                            level.
                        </div>
                        
                        <div class="help-text">
                            💡 <strong>Context Cleaning</strong> removes irrelevant background information that might confuse the AI. For example, when writing a specific scene, it removes context about unrelated chapters.
                        </div>
                    </div>

                    <div class="control-section">
                        <div class="section-title">
                            🔍 Quality Checking
                        </div>
                        <div class="conversation-text">
                            I can check for contradictions between outlines and content at the 
                            <span class="inline-control ${this.coherenceLevel === -1 ? 'none-selected' : ''}">
                                <select id="coherence-level-select" onchange="window.conversationalModal.updateCoherenceLevel(this.value)">
                                    <option value="-1">Don't check coherence</option>
                                    ${coherenceLevels.map(level => 
                                        `<option value="${level.value}" ${this.coherenceLevel === level.value ? 'selected' : ''}>${level.name}</option>`
                                    ).join('')}
                                </select>
                            </span>
                            level.
                        </div>
                        
                        <div class="help-text">
                            💡 <strong>Quality Checking</strong> ensures that detailed content matches the original outline. If contradictions are found, you'll be shown them and can choose how to fix them.
                        </div>
                    </div>

                    <div class="control-section">
                        <div class="section-title">
                            🔧 Automatic Fixing
                        </div>
                        <div class="conversation-text">
                            When contradictions are found, automatically fix those with severity level 
                            <span class="inline-control">
                                <select id="autofix-severity-select" onchange="window.conversationalModal.updateAutofixSeverity(this.value)">
                                    <option value="-1">Don't auto-fix</option>
                                    <option value="1" ${this.autofixSeverity === 1 ? 'selected' : ''}>1+ (All issues)</option>
                                    <option value="2" ${this.autofixSeverity === 2 ? 'selected' : ''}>2+</option>
                                    <option value="3" ${this.autofixSeverity === 3 ? 'selected' : ''}>3+</option>
                                    <option value="4" ${this.autofixSeverity === 4 ? 'selected' : ''}>4+</option>
                                    <option value="5" ${this.autofixSeverity === 5 ? 'selected' : ''}>5+ (Moderate+)</option>
                                    <option value="6" ${this.autofixSeverity === 6 ? 'selected' : ''}>6+</option>
                                    <option value="7" ${this.autofixSeverity === 7 ? 'selected' : ''}>7+</option>
                                    <option value="8" ${this.autofixSeverity === 8 ? 'selected' : ''}>8+ (High+)</option>
                                    <option value="9" ${this.autofixSeverity === 9 ? 'selected' : ''}>9+</option>
                                    <option value="10" ${this.autofixSeverity === 10 ? 'selected' : ''}>10 (Critical only)</option>
                                </select>
                            </span>
                            and above.
                        </div>
                        
                        <div class="help-text">
                            💡 <strong>Automatic Fixing</strong> lets the AI automatically correct contradictions at or above a certain severity level (1-10). Level 5+ is recommended - it fixes moderate and higher severity issues. At level 0, you will be shown all issues and you can choose to fix them one by one with AI support.
                        </div>
                    </div>
                </div>

                <!-- Validation Messages -->
                <div id="validation-message" class="validation-message">
                    <!-- Validation errors will appear here -->
                </div>

                <!-- Action Buttons -->
                <div class="generation-actions">
                    <button class="btn-secondary" onclick="window.conversationalModal.close()">
                        Cancel
                    </button>
                    <button id="apply-settings-btn" class="btn-primary" onclick="window.conversationalModal.applySettingsAndGenerate()">
                        🚀 Apply Settings & Generate
                    </button>
                </div>
            </div>
        `;
        
        return container;
    }

    /**
     * Setup event handlers after modal is opened
     */
    public override async open(): Promise<void> {
        await super.open();
        
        // Expose modal instance to window for event handlers
        (window as any).conversationalModal = this;
        
        this.updateValidation();
    }

    /**
     * Update draft level
     */
    public updateDraftLevel(value: string): void {
        this.draftLevel = parseInt(value);
        
        // Adjust dependent levels if they're now invalid
        const contextCleaningLevels = this.getContextCleaningLevels();
        const coherenceLevels = this.getCoherenceLevels();
        
        // Reset context prune level if it's now invalid
        if (this.contextPruneLevel !== -1 && !contextCleaningLevels.some(l => l.value === this.contextPruneLevel)) {
            this.contextPruneLevel = -1;
        }
        
        // Reset coherence level if it's now invalid
        if (this.coherenceLevel !== -1 && !coherenceLevels.some(l => l.value === this.coherenceLevel)) {
            this.coherenceLevel = -1;
        }
        
        this.refreshDependentDropdowns();
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Update content level
     */
    public updateContentLevel(value: string): void {
        this.contentLevel = parseInt(value);
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Update context prune level
     */
    public updateContextPruneLevel(value: string): void {
        this.contextPruneLevel = parseInt(value);
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Update coherence level
     */
    public updateCoherenceLevel(value: string): void {
        this.coherenceLevel = parseInt(value);
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Update autofix severity
     */
    public updateAutofixSeverity(value: string): void {
        this.autofixSeverity = parseInt(value);
        this.updateValidation();
        this.updateInlineControlStyles();
    }

    /**
     * Toggle advanced options (kept for backwards compatibility but not used)
     */
    public toggleAdvanced(): void {
        // No longer used since advanced options are always visible
    }

    /**
     * Refresh context cleaning and coherence dropdowns based on current draft level
     */
    private refreshDependentDropdowns(): void {
        const contextCleaningLevels = this.getContextCleaningLevels();
        const coherenceLevels = this.getCoherenceLevels();
        
        // Update context cleaning dropdown
        const contextSelect = document.getElementById('context-prune-level-select') as HTMLSelectElement;
        if (contextSelect) {
            const currentValue = this.contextPruneLevel;
            contextSelect.innerHTML = `
                <option value="-1">Don't clean context</option>
                ${contextCleaningLevels.map(level => 
                    `<option value="${level.value}" ${currentValue === level.value ? 'selected' : ''}>${level.name}</option>`
                ).join('')}
            `;
        }
        
        // Update coherence dropdown
        const coherenceSelect = document.getElementById('coherence-level-select') as HTMLSelectElement;
        if (coherenceSelect) {
            const currentValue = this.coherenceLevel;
            coherenceSelect.innerHTML = `
                <option value="-1">Don't check coherence</option>
                ${coherenceLevels.map(level => 
                    `<option value="${level.value}" ${currentValue === level.value ? 'selected' : ''}>${level.name}</option>`
                ).join('')}
            `;
        }
    }

    /**
     * Update inline control styles based on selection
     */
    private updateInlineControlStyles(): void {
        const updateControlStyle = (selectId: string, value: number) => {
            const select = document.getElementById(selectId) as HTMLSelectElement;
            if (select) {
                const control = select.closest('.inline-control');
                if (control) {
                    control.classList.toggle('none-selected', value === -1);
                }
            }
        };

        updateControlStyle('draft-level-select', this.draftLevel);
        updateControlStyle('content-level-select', this.contentLevel);
        updateControlStyle('context-prune-level-select', this.contextPruneLevel);
        updateControlStyle('coherence-level-select', this.coherenceLevel);
        updateControlStyle('autofix-severity-select', this.autofixSeverity);
    }

    /**
     * Validate current settings
     */
    private updateValidation(): void {
        const validationMessage = document.getElementById('validation-message');
        const applyButton = document.getElementById('apply-settings-btn') as HTMLButtonElement;
        
        if (!validationMessage || !applyButton) return;

        let errors: string[] = [];

        // Check if content level > draft level
        if (this.contentLevel > this.draftLevel && this.draftLevel !== -1) {
            errors.push('Content level cannot be higher than structure creation level.');
        }

        // Check if coherence level >= draft level
        if (this.coherenceLevel >= this.draftLevel && this.draftLevel !== -1) {
            errors.push('Quality checking level must be less than structure creation level.');
        }

        // Check if context prune level > draft level
        if (this.contextPruneLevel > this.draftLevel && this.draftLevel !== -1) {
            errors.push('Context cleaning level cannot be higher than structure creation level.');
        }

        // Check if any work needs to be done
        if (this.draftLevel === -1 && this.contentLevel === -1 && this.contextPruneLevel === -1 && this.coherenceLevel === -1) {
            errors.push('Please select at least one option for generation.');
        }

        if (errors.length > 0) {
            validationMessage.innerHTML = errors.map(error => `⚠️ ${error}`).join('<br>');
            validationMessage.classList.add('show');
            applyButton.disabled = true;
        } else {
            validationMessage.classList.remove('show');
            applyButton.disabled = false;
        }
    }

    /**
     * Apply settings to main UI and trigger generation
     */
    public async applySettingsAndGenerate(): Promise<void> {
        try {
            // Set the main UI dropdown values
            this.setMainUILevels();
            
            // Close this modal
            await this.close();
            
            // Trigger the main generate button
            this.triggerMainGeneration();
            
        } catch (error) {
            console.error('Failed to apply settings and generate:', error);
            alert('Failed to apply settings. Please try again.');
        }
    }

    /**
     * Set the main UI level dropdown values
     */
    private setMainUILevels(): void {
        const draftSelector = document.getElementById('draft-level-selector') as HTMLSelectElement;
        const contentSelector = document.getElementById('content-level-selector') as HTMLSelectElement;
        const contextPruneSelector = document.getElementById('context-prune-level-selector') as HTMLSelectElement;
        const coherenceSelector = document.getElementById('coherence-level-selector') as HTMLSelectElement;
        const autofixSelector = document.getElementById('autofix-severity-selector') as HTMLSelectElement;
        const contextRatingThresholdSelector = document.getElementById('context-rating-threshold-selector') as HTMLSelectElement;
        
        if (draftSelector) draftSelector.value = this.draftLevel.toString();
        if (contentSelector) contentSelector.value = this.contentLevel.toString();
        if (contextPruneSelector) contextPruneSelector.value = this.contextPruneLevel.toString();
        if (coherenceSelector) coherenceSelector.value = this.coherenceLevel.toString();
        if (autofixSelector) autofixSelector.value = this.autofixSeverity.toString();
        if (contextRatingThresholdSelector) contextRatingThresholdSelector.value = this.contextRatingThreshold.toString();
        
        // Trigger change events to update any dependent UI
        [draftSelector, contentSelector, contextPruneSelector, coherenceSelector, autofixSelector, contextRatingThresholdSelector].forEach(selector => {
            if (selector) {
                selector.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    /**
     * Trigger the main generate button
     */
    private triggerMainGeneration(): void {
        const generateButton = document.getElementById('node-generate-btn') as HTMLButtonElement;
        if (generateButton) {
            // Small delay to ensure UI is updated
            setTimeout(() => {
                generateButton.click();
            }, 100);
        } else {
            console.error('Main generate button not found');
            alert('Could not find the main generate button. Please use the Generate button in the main interface.');
        }
    }

    /**
     * Cleanup when modal is closed
     */
    public override async close(): Promise<void> {
        // Clean up window reference
        delete (window as any).conversationalModal;
        await super.close();
    }
} 