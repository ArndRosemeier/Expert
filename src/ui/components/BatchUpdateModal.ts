import { DocumentNode } from '../../DocumentNode.js';
import { SelectableNodeTree } from './SelectableNodeTree.js';
import { OpenRouterClient } from '../../OpenRouterClient.js';
import * as state from '../../state.js';
import { getPromptText } from '../../PromptManager.js';
import { createPromptExpansionService } from '../../services/PromptExpansionService.js';
import { PromptContextBuilder } from '../../services/PromptContextBuilder.js';
import { createLeftPanel } from '../utils/ModalUtils.js';

const MODEL_PURPOSES = [
    { key: 'creator', label: 'Creator' },
    { key: 'editor', label: 'Editor' },
    { key: 'rater', label: 'Rater' },
    { key: 'prose', label: 'Prose' },
];

interface BatchUpdateModalOptions {
    onClose?: () => void;
}

interface FieldUpdate {
    field: 'title' | 'content' | 'context';
    originalValue: string;
    newValue?: string;
}

interface StringProcessingMap {
    [originalString: string]: string; // originalString -> processedString
}

/**
 * BatchUpdateModal: 3-phase batch update modal with field selection checkboxes.
 * Phase 1: Collect all unique strings to process
 * Phase 2: Process strings through AI (deduplication)
 * Phase 3: Apply results to create new versions
 */
export class BatchUpdateModal {
    private rootNode: DocumentNode;
    private container: HTMLElement;
    private options: BatchUpdateModalOptions;
    private tree: SelectableNodeTree;
    private leftPanel: HTMLElement;
    private rightPanel: HTMLElement;
    private instructionInput: HTMLTextAreaElement;
    private modelSelect: HTMLSelectElement;
    private batchTagInput: HTMLInputElement;
    private titleCheckbox: HTMLInputElement;
    private contentCheckbox: HTMLInputElement;
    // contextCheckbox removed - using conditional context system
    private runButton: HTMLButtonElement;
    private closeButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private spinner: HTMLElement;
    private logPanel: HTMLElement;
    private openRouterClient: OpenRouterClient;
    private batchTag: string;
    private isRunning: boolean = false;
    private shouldAbort: boolean = false;

    constructor(rootNode: DocumentNode, container: HTMLElement, options?: BatchUpdateModalOptions) {
        this.rootNode = rootNode;
        this.container = container;
        this.options = options || {};
        this.openRouterClient = OpenRouterClient.getInstance();
        this.tree = new SelectableNodeTree(rootNode, document.createElement('div'));
        this.leftPanel = document.createElement('div');
        this.rightPanel = document.createElement('div');
        this.instructionInput = document.createElement('textarea');
        this.modelSelect = document.createElement('select');
        this.batchTagInput = document.createElement('input');
        this.titleCheckbox = document.createElement('input');
        this.contentCheckbox = document.createElement('input');
        // contextCheckbox initialization removed
        this.runButton = document.createElement('button');
        this.closeButton = document.createElement('button');
        this.stopButton = document.createElement('button');
        this.spinner = document.createElement('span');
        this.logPanel = document.createElement('div');
        
        // Generate batch tag with exact datetime (evaluated once when dialog starts)
        const now = new Date();
        this.batchTag = `Batch_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    }

    /**
     * Render the two-panel batch update modal UI.
     */
    render() {
        try {
            console.log('🔧 BatchUpdateModal render() starting...');
        this.container.innerHTML = '';
            // Layout: two panels, set container height with proper constraints
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'row';
        this.container.style.gap = '0';
        this.container.style.alignItems = 'stretch';
        this.container.style.justifyContent = 'stretch';
        this.container.style.boxSizing = 'border-box';
            this.container.style.height = '90vh';
            this.container.style.maxHeight = '90vh';
            this.container.style.overflow = 'hidden';

        // --- Left Panel: Tree ---
        this.leftPanel = createLeftPanel();

            // Tree selection
        this.tree = new SelectableNodeTree(this.rootNode, document.createElement('div'));
        this.tree.render();
        
        // Select all nodes by default
        this.tree.selectAll();
        
        this.tree['container'].style.marginTop = '2em';
            this.tree['container'].style.flex = '1 1 0%';
        this.tree['container'].style.overflowY = 'auto';
        this.tree['container'].style.background = '#fff';
            this.tree['container'].style.minHeight = '0';
        this.leftPanel.appendChild(this.tree['container']);
            
        // Add highlight style for batch active node
        const highlightStyle = document.createElement('style');
        highlightStyle.textContent = `
            .tree-batch-active {
                background: #e0f2fe !important;
                border-left: 4px solid #2563eb !important;
                box-shadow: 0 0 0 2px #bae6fd;
            }
        `;
        this.leftPanel.appendChild(highlightStyle);

        // --- Right Panel: Controls and Log ---
        this.rightPanel = document.createElement('div');
        this.rightPanel.style.flex = '1 1 0%';
        this.rightPanel.style.display = 'flex';
        this.rightPanel.style.flexDirection = 'column';
        this.rightPanel.style.height = '100%';
        this.rightPanel.style.background = '#fff';
        this.rightPanel.style.boxSizing = 'border-box';
        this.rightPanel.style.padding = '2.5em 2em 2em 2em';
            this.rightPanel.style.overflow = 'hidden';
            this.rightPanel.style.minHeight = '0';
            
            // Controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.style.display = 'flex';
        controlsContainer.style.flexDirection = 'column';
        controlsContainer.style.gap = '2em';
            controlsContainer.style.flex = '0 1 auto';
            controlsContainer.style.minHeight = '0';
            controlsContainer.style.overflow = 'hidden';
            
        // --- Toggle-all buttons for each template level ---
        const buttonBar = document.createElement('div');
        buttonBar.style.display = 'flex';
        buttonBar.style.flexWrap = 'wrap';
        buttonBar.style.gap = '0.7em';
        buttonBar.style.marginBottom = '1.2em';
        buttonBar.style.alignItems = 'center';
        (this.rootNode.template || []).forEach((levelName, idx) => {
            const btn = document.createElement('button');
            btn.textContent = `Toggle all ${this.getPluralLevelName(levelName)}`;
            btn.style.padding = '0.5em 1.3em';
            btn.style.fontSize = '1em';
            btn.style.fontWeight = '500';
            btn.style.borderRadius = '2em';
            btn.style.background = '#f3f4f6';
            btn.style.border = '1.5px solid #d1d5db';
            btn.style.color = '#374151';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'background 0.18s, border-color 0.18s, color 0.18s';
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#e0e7ef';
                btn.style.borderColor = '#3b82f6';
                btn.style.color = '#2563eb';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = '#f3f4f6';
                btn.style.borderColor = '#d1d5db';
                btn.style.color = '#374151';
            });
            btn.addEventListener('focus', () => {
                btn.style.background = '#e0e7ef';
                btn.style.borderColor = '#3b82f6';
                btn.style.color = '#2563eb';
            });
            btn.addEventListener('blur', () => {
                btn.style.background = '#f3f4f6';
                btn.style.borderColor = '#d1d5db';
                btn.style.color = '#374151';
            });
            btn.addEventListener('click', () => { this.tree.toggleAllAtLevel(idx); });
            buttonBar.appendChild(btn);
        });
        controlsContainer.appendChild(buttonBar);
            
        // Enhanced header with better styling
        const headerSection = document.createElement('div');
        headerSection.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        headerSection.style.color = 'white';
        headerSection.style.padding = '1.5em';
        headerSection.style.borderRadius = '0.75em';
            headerSection.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        
            const headerTitle = document.createElement('h2');
            headerTitle.textContent = 'Smart Batch Update';
        headerTitle.style.margin = '0 0 0.5em 0';
            headerTitle.style.fontSize = '1.5em';
            headerTitle.style.fontWeight = '700';
        headerSection.appendChild(headerTitle);
        
        const headerDesc = document.createElement('p');
            headerDesc.textContent = 'Select nodes and fields to update. AI will process unique content automatically.';
        headerDesc.style.margin = '0';
            headerDesc.style.fontSize = '1em';
        headerDesc.style.opacity = '0.9';
        headerSection.appendChild(headerDesc);
        
        controlsContainer.appendChild(headerSection);

            // Field selection checkboxes
            const fieldSection = document.createElement('div');
            fieldSection.style.background = '#f8fafc';
            fieldSection.style.padding = '1.5em';
            fieldSection.style.borderRadius = '0.75em';
            fieldSection.style.border = '1px solid #e2e8f0';
            
            const fieldTitle = document.createElement('h3');
            fieldTitle.textContent = 'Fields to Update';
            fieldTitle.style.margin = '0 0 1em 0';
            fieldTitle.style.fontSize = '1.1em';
            fieldTitle.style.fontWeight = '600';
            fieldTitle.style.color = '#374151';
            fieldSection.appendChild(fieldTitle);
            
            const checkboxContainer = document.createElement('div');
            checkboxContainer.style.display = 'flex';
            checkboxContainer.style.gap = '1.5em';
            checkboxContainer.style.flexWrap = 'wrap';
            
            // Title checkbox
            const titleLabel = this.createCheckboxLabel('Title', this.titleCheckbox, true);
            checkboxContainer.appendChild(titleLabel);
            
            // Content checkbox  
            const contentLabel = this.createCheckboxLabel('Content', this.contentCheckbox, true);
            checkboxContainer.appendChild(contentLabel);
            
            // Context checkbox removed - using conditional context system
            
            fieldSection.appendChild(checkboxContainer);
            controlsContainer.appendChild(fieldSection);

            // Instruction input section
            const instructionSection = document.createElement('div');
            instructionSection.style.background = '#f8fafc';
            instructionSection.style.padding = '1.5em';
            instructionSection.style.borderRadius = '0.75em';
            instructionSection.style.border = '1px solid #e2e8f0';
            
            const instructionTitle = document.createElement('h3');
            instructionTitle.textContent = 'Update Instructions';
            instructionTitle.style.margin = '0 0 1em 0';
            instructionTitle.style.fontSize = '1.1em';
            instructionTitle.style.fontWeight = '600';
            instructionTitle.style.color = '#374151';
            instructionSection.appendChild(instructionTitle);
            
            this.instructionInput.style.width = '100%';
            this.instructionInput.style.minHeight = '6em';
            this.instructionInput.style.padding = '0.75em';
            this.instructionInput.style.border = '1px solid #d1d5db';
            this.instructionInput.style.borderRadius = '0.5em';
            this.instructionInput.style.fontSize = '1em';
            this.instructionInput.style.fontFamily = 'inherit';
            this.instructionInput.style.boxSizing = 'border-box';
            this.instructionInput.style.resize = 'vertical';
            this.instructionInput.placeholder = 'Describe how you want the selected fields to be updated...\n\nExample: "Make the text more formal and professional"\n\nHint: Leave this empty to use Just copy mode (no AI) — it will create a new version with the current master content and your batch tags.';
            instructionSection.appendChild(this.instructionInput);
            
            controlsContainer.appendChild(instructionSection);

            // Model and batch settings section
            const settingsSection = document.createElement('div');
            settingsSection.style.display = 'flex';
            settingsSection.style.gap = '1.5em';
            settingsSection.style.alignItems = 'end';
            
            const modelContainer = document.createElement('div');
            modelContainer.style.flex = '1';
        
        const modelLabel = document.createElement('label');
            modelLabel.textContent = 'AI Model:';
        modelLabel.style.display = 'block';
            modelLabel.style.fontWeight = '600';
            modelLabel.style.marginBottom = '0.5em';
            modelLabel.style.color = '#374151';
            modelContainer.appendChild(modelLabel);
            
        this.modelSelect.style.width = '100%';
            this.modelSelect.style.padding = '0.75em';
            this.modelSelect.style.border = '1px solid #d1d5db';
            this.modelSelect.style.borderRadius = '0.5em';
            this.modelSelect.style.fontSize = '1em';
        this.modelSelect.style.boxSizing = 'border-box';
            
            // Populate model select
            MODEL_PURPOSES.forEach(purpose => {
                const option = document.createElement('option');
                option.value = purpose.key;
                option.textContent = purpose.label;
                this.modelSelect.appendChild(option);
            });
            this.modelSelect.value = 'editor'; // Default to editor model
            
            modelContainer.appendChild(this.modelSelect);
            settingsSection.appendChild(modelContainer);
            
            const tagContainer = document.createElement('div');
            tagContainer.style.flex = '1';
            
            const tagLabel = document.createElement('label');
            tagLabel.textContent = 'Batch Tag (optional):';
            tagLabel.style.display = 'block';
            tagLabel.style.fontWeight = '600';
            tagLabel.style.marginBottom = '0.5em';
            tagLabel.style.color = '#374151';
            tagContainer.appendChild(tagLabel);
            
            this.batchTagInput.type = 'text';
            this.batchTagInput.style.width = '100%';
            this.batchTagInput.style.padding = '0.75em';
            this.batchTagInput.style.border = '1px solid #d1d5db';
            this.batchTagInput.style.borderRadius = '0.5em';
            this.batchTagInput.style.fontSize = '1em';
            this.batchTagInput.style.boxSizing = 'border-box';
            this.batchTagInput.placeholder = 'Optional custom tag';
            tagContainer.appendChild(this.batchTagInput);
            
            settingsSection.appendChild(tagContainer);
            controlsContainer.appendChild(settingsSection);
            
            // Action buttons section
            const actionsSection = document.createElement('div');
            actionsSection.style.display = 'flex';
            actionsSection.style.gap = '1em';
            actionsSection.style.justifyContent = 'flex-end';
            actionsSection.style.alignItems = 'center';
            actionsSection.style.paddingTop = '1em';
            actionsSection.style.borderTop = '1px solid #e5e7eb';
            
            // Spinner
            this.spinner.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="60" stroke-dashoffset="60">
                        <animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" dur="1s" repeatCount="indefinite"/>
                    </circle>
                </svg>
            `;
            this.spinner.style.display = 'none';
            this.spinner.style.alignItems = 'center';
            this.spinner.style.color = '#2563eb';
            actionsSection.appendChild(this.spinner);
            
            // Close button
            this.closeButton.textContent = 'Close';
            this.closeButton.style.padding = '0.75em 1.5em';
            this.closeButton.style.background = '#6b7280';
            this.closeButton.style.color = '#ffffff';
        this.closeButton.style.border = 'none';
            this.closeButton.style.borderRadius = '0.5em';
        this.closeButton.style.cursor = 'pointer';
            this.closeButton.style.fontWeight = '500';
            this.closeButton.style.fontSize = '1em';
            this.closeButton.style.transition = 'background 0.2s';
        this.closeButton.addEventListener('click', () => {
            if (this.options.onClose) {
                this.options.onClose();
            }
        });
            actionsSection.appendChild(this.closeButton);
            
            // Stop button  
            this.stopButton.innerHTML = '<span style="margin-right: 0.5em;">⏹️</span>Stop Batch';
            this.stopButton.style.padding = '0.75em 1.5em';
            this.stopButton.style.background = '#dc2626';
            this.stopButton.style.color = '#ffffff';
            this.stopButton.style.border = 'none';
            this.stopButton.style.borderRadius = '0.5em';
            this.stopButton.style.cursor = 'pointer';
            this.stopButton.style.fontWeight = '500';
            this.stopButton.style.fontSize = '1em';
            this.stopButton.style.transition = 'background 0.2s';
            this.stopButton.style.display = 'none';
            this.stopButton.addEventListener('click', () => { this.handleStop(); });
            actionsSection.appendChild(this.stopButton);
            
            // Run button
            this.runButton.innerHTML = '<span style="margin-right: 0.5em;">⚡</span>Run Batch Update';
            this.runButton.style.padding = '0.75em 1.5em';
            this.runButton.style.background = '#2563eb';
            this.runButton.style.color = '#ffffff';
            this.runButton.style.border = 'none';
            this.runButton.style.borderRadius = '0.5em';
            this.runButton.style.cursor = 'pointer';
            this.runButton.style.fontWeight = '500';
            this.runButton.style.fontSize = '1em';
            this.runButton.style.transition = 'background 0.2s';
            this.runButton.addEventListener('click', async () => this.handleRun());
            actionsSection.appendChild(this.runButton);
            
            controlsContainer.appendChild(actionsSection);
            
            // --- Log Panel ---
        const logContainer = document.createElement('div');
        logContainer.style.flex = '1 1 0%';
        logContainer.style.minHeight = '0';
            logContainer.style.marginTop = '2em';
            logContainer.style.display = 'flex';
            logContainer.style.flexDirection = 'column';
            logContainer.style.overflow = 'hidden';
            
        const logHeader = document.createElement('div');
            logHeader.style.background = '#f9fafb';
            logHeader.style.padding = '1em 1.5em';
            logHeader.style.borderRadius = '0.75em 0.75em 0 0';
            logHeader.style.border = '1px solid #e5e7eb';
            logHeader.style.borderBottom = 'none';
            logHeader.style.fontWeight = '600';
        logHeader.style.color = '#374151';
        logHeader.textContent = 'Batch Update Log';
            logContainer.appendChild(logHeader);
            
            this.logPanel = document.createElement('div');
            this.logPanel.style.flex = '1 1 0%';
            this.logPanel.style.minHeight = '0';
            this.logPanel.style.overflowY = 'auto';
            this.logPanel.style.background = '#ffffff';
            this.logPanel.style.border = '1px solid #e5e7eb';
            this.logPanel.style.borderRadius = '0 0 0.75em 0.75em';
            this.logPanel.style.padding = '1em';
        logContainer.appendChild(this.logPanel);
            
            this.rightPanel.appendChild(controlsContainer);
        this.rightPanel.appendChild(logContainer);

            // Assemble layout
        this.container.appendChild(this.leftPanel);
        this.container.appendChild(this.rightPanel);
            
            console.log('✅ BatchUpdateModal render() completed');
        } catch (error) {
            console.error('❌ BatchUpdateModal render() failed:', error);
            this.container.innerHTML = `<div style="padding: 2em; color: #dc2626;">Error rendering batch update modal: ${error}</div>`;
        }
    }

    private createCheckboxLabel(text: string, checkbox: HTMLInputElement, defaultChecked: boolean): HTMLElement {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '0.5em';
        label.style.cursor = 'pointer';
        label.style.fontSize = '1em';
        label.style.fontWeight = '500';
        label.style.color = '#374151';
        
        checkbox.type = 'checkbox';
        checkbox.checked = defaultChecked;
        checkbox.style.width = '1.2em';
        checkbox.style.height = '1.2em';
        checkbox.style.cursor = 'pointer';
        
        const span = document.createElement('span');
        span.textContent = text;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        
        return label;
    }

    /**
     * Phase 1: Collect all unique strings from selected nodes and fields
     */
    private collectTargetStrings(): Map<string, FieldUpdate[]> {
        const selectedNodes = this.tree.getSelectedNodes();
        const stringMap = new Map<string, FieldUpdate[]>();
        
        for (const node of selectedNodes) {
            const updates: FieldUpdate[] = [];
            
            if (this.titleCheckbox.checked && node.title) {
                updates.push({
                    field: 'title',
                    originalValue: node.title
                });
            }
            
            if (this.contentCheckbox.checked && node.content) {
                updates.push({
                    field: 'content', 
                    originalValue: node.content
                });
            }
            
            // Context updates removed - using conditional context system instead
            
            // Add updates to string map, grouping by original value
            for (const update of updates) {
                if (!stringMap.has(update.originalValue)) {
                    stringMap.set(update.originalValue, []);
                }
                stringMap.get(update.originalValue)!.push(update);
            }
        }
        
        // Debug logging simplified - context analysis removed
        console.log('🔍 BatchUpdate Analysis:');
        console.log(`Selected ${selectedNodes.length} nodes for batch update`);
        
        // Context comparison debug logging removed - using conditional context system
        
        // Debug logging: Show deduplication results
        console.log('\n🔍 BatchUpdate String Deduplication Results:');
        stringMap.forEach((fieldUpdates, originalString) => {
            const preview = originalString.substring(0, 50).replace(/\n/g, '\\n').replace(/\r/g, '\\r');
            console.log(`  "${preview}${originalString.length > 50 ? '...' : ''}" → ${fieldUpdates.length} field(s) [length: ${originalString.length}]`);
            fieldUpdates.forEach(fu => {
                const nodeTitle = selectedNodes.find(n => 
                    (fu.field === 'title' && n.title === originalString) ||
                    (fu.field === 'content' && n.content === originalString) ||
                    false // Context field removed - using conditional context system
                )?.title || 'Unknown';
                console.log(`    - ${fu.field} from "${nodeTitle}"`);
            });
        });
        
        return stringMap;
    }

    /**
     * Phase 2: Process unique strings through AI
     */
    private async processStrings(stringMap: Map<string, FieldUpdate[]>, instruction: string): Promise<StringProcessingMap> {
        const processingMap: StringProcessingMap = {};
        const uniqueStrings = Array.from(stringMap.keys());
        
        this.appendLog(`📋 Phase 2: Processing ${uniqueStrings.length} unique strings`, 'success', `Found ${uniqueStrings.length} unique strings to process`);
        
        for (let i = 0; i < uniqueStrings.length; i++) {
            if (this.shouldAbort) break;
            
            const originalString = uniqueStrings[i];
            if (!originalString) continue; // Skip if undefined
            
            const progress = `(${i + 1}/${uniqueStrings.length})`;
            
            try {
                // Use prompt from PromptManager with centralized placeholder replacement
                const promptTemplate = getPromptText('batch_update');
                const activeProject = state.getActiveProject();
                if (!activeProject) {
                    throw new Error('No active project found - cannot perform batch update');
                }
                const settingsManager = activeProject.getSettingsManager();
                if (!settingsManager) {
                    throw new Error('Active project has no SettingsManager - cannot perform batch update');
                }
                
                const promptContext = PromptContextBuilder.forPrompt(
                    settingsManager,
                    {
                        instruction: instruction,
                        originalText: originalString
                    }
                );
                const prompt = createPromptExpansionService(settingsManager).expandPrompt(promptTemplate, promptContext);

                this.appendLog(`🔄 Processing string ${progress}`, 'success', `Processing: "${originalString.substring(0, 100)}${originalString.length > 100 ? '...' : ''}"`);
                
                const result = await this.openRouterClient.chat(this.modelSelect.value, prompt);
                
                // Clean up the result (remove any extra formatting)
                const processedString = result.trim();
                processingMap[originalString] = processedString;
                
                this.appendLog(`✅ Completed ${progress}`, 'success', `Updated to: "${processedString.substring(0, 100)}${processedString.length > 100 ? '...' : ''}"`);
                
            } catch (error) {
                if (!this.shouldAbort) {
                    this.appendLog(`❌ Failed ${progress}`, 'error', `Error: ${error instanceof Error ? error.message : String(error)}`);
                }
                // Keep original string as fallback
                processingMap[originalString] = originalString;
            }
        }
        
        return processingMap;
    }

    /**
     * Phase 3: Apply processed strings to nodes, creating new versions
     */
    private async applyProcessedStrings(_stringMap: Map<string, FieldUpdate[]>, processingMap: StringProcessingMap, batchTag: string): Promise<void> {
        const selectedNodes = this.tree.getSelectedNodes();
        
        this.appendLog(`📝 Phase 3: Applying updates to ${selectedNodes.length} nodes`, 'success', `Creating new versions with batch tag`);
        
        for (const node of selectedNodes) {
            if (this.shouldAbort) break;
            
            try {
                this.tree.highlightNode(node.id);
                
                // Collect all updates for this node
                const nodeUpdates: { [field: string]: string } = {};
                let hasChanges = false;
                
                if (this.titleCheckbox.checked && node.title) {
                    const processedValue = processingMap[node.title];
                    if (processedValue && processedValue !== node.title) {
                        nodeUpdates['title'] = processedValue;
                        hasChanges = true;
                    }
                }
                
                if (this.contentCheckbox.checked && node.content) {
                    const processedValue = processingMap[node.content];
                    if (processedValue && processedValue !== node.content) {
                        nodeUpdates['content'] = processedValue;
                        hasChanges = true;
                    }
                }
                
                // Context processing removed - using conditional context system
                
                if (hasChanges) {
                    // Determine tags to apply
                    const tags = ['batch'];
                    if (batchTag) {
                        tags.push(batchTag);
                    }
                    
                    console.log(`🔧 Creating batch version for "${node.title}" with changes:`, nodeUpdates);
                    
                    // Create new version with updates
                    const versionId = node.addVersion(tags, {
                        title: nodeUpdates['title'] || node.title,
                        content: nodeUpdates['content'] || node.content
                    });
                    
                    console.log(`🔧 Created version for "${node.title}": ${versionId ? 'SUCCESS' : 'FAILED'} (versionId: ${versionId})`);
                    
                    // Promote to master so changes become active
                    if (versionId) {
                        try {
                            node.promoteToMaster(versionId);
        
                        } catch (error) {
                            console.error(`🔧 Promotion failed for "${node.title}":`, error);
                            this.appendLog(`⚠️ ${node.title}`, 'error', `Version created but promotion to master failed: ${error instanceof Error ? error.message : String(error)}`);
                        }
                    } else {
                        console.warn(`🔧 No versionId returned for "${node.title}" - cannot promote to master`);
                        this.appendLog(`⚠️ ${node.title}`, 'error', `Failed to create new version - addVersion returned null`);
                    }
                        
                    // Persist changes immediately
                    await this.persistNodeChanges();
                        
                    const changesSummary = Object.keys(nodeUpdates).join(', ');
                    this.appendLog(`✅ ${node.title}`, 'success', `Updated fields: ${changesSummary}`);
                        
                } else {
                    this.appendLog(`⏭️ ${node.title}`, 'success', `No changes needed`);
                }
                
            } catch (error) {
                if (!this.shouldAbort) {
                    this.appendLog(`❌ ${node.title}`, 'error', error instanceof Error ? error.message : String(error));
                }
            }
        }
        
        this.tree.highlightNode('');
    }

    /**
     * Just copy mode: create new versions from current master content without AI.
     */
    private async applyCopyMode(batchTag: string): Promise<void> {
        const selectedNodes = this.tree.getSelectedNodes();
        this.appendLog(`📝 Copying current master content to new versions`, 'success', `Applying tags and promoting to master`);
        
        for (const node of selectedNodes) {
            if (this.shouldAbort) break;
            try {
                this.tree.highlightNode(node.id);
                const master = node.getMasterVersion();
                if (!master) {
                    this.appendLog(`⏭️ ${node.title}`, 'error', `No master version found, skipping`);
                    continue;
                }
                const tags = ['batch'];
                if (batchTag) tags.push(batchTag);
                const versionId = node.addVersion(tags, { title: node.title, content: node.content });
                if (versionId) {
                    try {
                        node.promoteToMaster(versionId);
                    } catch (e) {
                        this.appendLog(`⚠️ ${node.title}`, 'error', `Version created but promotion to master failed: ${e instanceof Error ? e.message : String(e)}`);
                    }
                    await this.persistNodeChanges();
                    this.appendLog(`✅ ${node.title}`, 'success', `Copied master to new version (${tags.join(', ')})`);
                } else {
                    this.appendLog(`⚠️ ${node.title}`, 'error', `Failed to create new version (duplicate tags?)`);
                }
            } catch (error) {
                if (!this.shouldAbort) {
                    this.appendLog(`❌ ${node.title}`, 'error', error instanceof Error ? error.message : String(error));
                }
            }
        }
        this.tree.highlightNode('');
    }

    /**
     * Run the 3-phase batch update process
     */
    private async handleRun() {
        const selectedNodes = this.tree.getSelectedNodes();
        const instruction = this.instructionInput.value.trim();
        const customBatchTag = this.batchTagInput.value.trim();
        
        // Validation
        if (!selectedNodes.length) {
            alert('Please select at least one node.');
            return;
        }
        
        const justCopyMode = instruction.length === 0;
        
        const hasFieldSelected = this.titleCheckbox.checked || this.contentCheckbox.checked;
        if (!hasFieldSelected) {
            alert('Please select at least one field to update.');
            return;
        }
        
        // Set running state
        this.isRunning = true;
        this.shouldAbort = false;
        
        // Update UI for running state
        this.runButton.style.display = 'none';
        this.closeButton.disabled = true;
        this.stopButton.style.display = 'inline-flex';
        this.spinner.style.display = 'flex';
        
        // Clear log
        this.logPanel.innerHTML = '';
        
        try {
            if (justCopyMode) {
                this.appendLog(`🚀 Starting Just copy`, 'success', `Processing ${selectedNodes.length} nodes (no AI calls)`);
            } else {
                this.appendLog(`🚀 Starting 3-Phase Batch Update`, 'success', `Processing ${selectedNodes.length} nodes with instruction: "${instruction}"`);
            }
            
            if (justCopyMode) {
                await this.applyCopyMode(customBatchTag || this.batchTag);
            } else {
                // Phase 1: Collect unique strings
                this.appendLog(`📋 Phase 1: Collecting unique strings`, 'success', `Analyzing selected nodes and fields...`);
                const stringMap = this.collectTargetStrings();
                const uniqueCount = stringMap.size;
                
                if (uniqueCount === 0) {
                    this.appendLog(`⚠️ No content to process`, 'error', `Selected fields are empty in all selected nodes.`);
                    return;
                }
                
                this.appendLog(`✅ Phase 1 Complete`, 'success', `Found ${uniqueCount} unique strings (deduplication saved ${this.getTotalStrings(stringMap) - uniqueCount} API calls)`);
                
                // Phase 2: Process strings
                const processingMap = await this.processStrings(stringMap, instruction);
                
                if (this.shouldAbort) {
                    this.appendLog(`⚠️ Batch Update Aborted`, 'error', 'Operation was stopped by user request.');
                    return;
                }
                
                this.appendLog(`✅ Phase 2 Complete`, 'success', `Processed ${Object.keys(processingMap).length} strings`);
                
                // Phase 3: Apply updates
                await this.applyProcessedStrings(stringMap, processingMap, customBatchTag || this.batchTag);
            }
            
            if (this.shouldAbort) {
                this.appendLog(`⚠️ Batch Update Aborted`, 'error', 'Operation was stopped by user request.');
                return;
            }
            
            this.appendLog(`🎉 Batch ${justCopyMode ? 'Copy' : 'Update'} Complete`, 'success', `Successfully processed all selected nodes. New versions created with 'batch' tag.`);
            
        } catch (error) {
            if (!this.shouldAbort) {
                this.appendLog(`❌ Batch Update Failed`, 'error', error instanceof Error ? error.message : String(error));
            }
        } finally {
            // Reset UI state
            this.isRunning = false;
            this.shouldAbort = false;
            this.runButton.style.display = 'inline-flex';
            this.closeButton.disabled = false;
            this.stopButton.style.display = 'none';
            this.stopButton.innerHTML = '<span style="margin-right: 0.5em;">⏹️</span>Stop Batch';
            this.stopButton.disabled = false;
            this.spinner.style.display = 'none';
        }
    }

    private getTotalStrings(stringMap: Map<string, FieldUpdate[]>): number {
        let total = 0;
        for (const updates of stringMap.values()) {
            total += updates.length;
        }
        return total;
    }

    /**
     * Handle stop button click to abort the batch operation.
     */
    private handleStop() {
        if (this.isRunning) {
            this.shouldAbort = true;
            this.appendLog(`🛑 Stop Requested`, 'error', 'Batch operation will stop after current processing completes.');
            
            // Update stop button to show it's been clicked
            this.stopButton.innerHTML = '<span style="margin-right: 0.5em;">⏳</span>Stopping...';
            this.stopButton.disabled = true;
        }
    }

    private async persistNodeChanges(): Promise<void> {
        try {
            // Get the active project manager
            const { getActiveProject } = await import('../../state');
            const projectManager = getActiveProject();
            
            if (projectManager) {
                // Save the project to storage
                await projectManager.saveToStorage();
                
                // Update the main GUI tree
                const { renderNodeDetails } = await import('../project-ui');
                renderNodeDetails();
            }
        } catch (error) {
            console.error('Failed to persist node changes:', error);
        }
    }

    private appendLog(title: string, type: 'success' | 'error', content: string) {
        const entry = document.createElement('div');
        entry.style.marginBottom = '1em';
        entry.style.paddingBottom = '1em';
        entry.style.borderBottom = '1px solid #f3f4f6';
        
        // Header
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'flex-start';
        headerDiv.style.marginBottom = '0.5em';
        
        const titleSpan = document.createElement('span');
        titleSpan.style.fontWeight = '600';
        titleSpan.style.fontSize = '1em';
        titleSpan.style.color = type === 'success' ? '#059669' : '#dc2626';
        titleSpan.textContent = title;
        headerDiv.appendChild(titleSpan);
        
        const timestampSpan = document.createElement('span');
        timestampSpan.style.fontSize = '0.8em';
        timestampSpan.style.color = '#6b7280';
        timestampSpan.style.fontFamily = 'monospace';
        timestampSpan.textContent = new Date().toLocaleTimeString();
        headerDiv.appendChild(timestampSpan);
        
        entry.appendChild(headerDiv);
        
        // Content
        const contentDiv = document.createElement('div');
        contentDiv.style.whiteSpace = 'pre-wrap';
        contentDiv.style.fontSize = '0.9em';
        contentDiv.style.lineHeight = '1.4';
        contentDiv.style.color = '#374151';
        contentDiv.style.background = type === 'success' ? '#ffffff' : '#fef2f2';
        contentDiv.style.padding = '0.75em';
        contentDiv.style.borderRadius = '0.3em';
        contentDiv.style.border = '1px solid';
        contentDiv.style.borderColor = type === 'success' ? '#e0f2fe' : '#fecaca';
        contentDiv.textContent = content;
        entry.appendChild(contentDiv);
        
        this.logPanel.appendChild(entry);
        
        // Scroll to bottom
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
    }

    private getPluralLevelName(levelName: string): string {
        if (levelName.endsWith('s')) return levelName;
        return levelName + 's';
    }
} 