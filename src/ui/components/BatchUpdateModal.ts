import { DocumentNode } from '../../DocumentNode';
import { SelectableNodeTree } from './SelectableNodeTree';
import { OpenRouterClient } from '../../OpenRouterClient';
import { v4 as uuidv4 } from 'uuid';

const MODEL_PURPOSES = [
    { key: 'creator', label: 'Creator' },
    { key: 'editor', label: 'Editor' },
    { key: 'rater', label: 'Rater' },
    { key: 'prose', label: 'Prose' },
];

interface BatchUpdateModalOptions {
    onClose?: () => void;
}

/**
 * BatchUpdateModal: Clean, TOC-compliant batch update modal with two panels.
 * Usage:
 *   const modal = new BatchUpdateModal(rootNode, container, { onClose });
 *   modal.render();
 */
export class BatchUpdateModal {
    private rootNode: DocumentNode;
    private container: HTMLElement;
    private options: BatchUpdateModalOptions;
    private tree: SelectableNodeTree;
    private leftPanel: HTMLElement;
    private rightPanel: HTMLElement;
    private promptInput: HTMLTextAreaElement;
    private modelSelect: HTMLSelectElement;
    private batchTagInput: HTMLInputElement;
    private runButton: HTMLButtonElement;
    private closeButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private spinner: HTMLElement;
    private logPanel: HTMLElement;
    private openRouterClient: OpenRouterClient;
    private defaultPrompt: string;
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
        this.promptInput = document.createElement('textarea');
        this.modelSelect = document.createElement('select');
        this.batchTagInput = document.createElement('input');
        this.runButton = document.createElement('button');
        this.closeButton = document.createElement('button');
        this.stopButton = document.createElement('button');
        this.spinner = document.createElement('span');
        this.logPanel = document.createElement('div');
        // Default batch update prompt
        this.defaultPrompt = `Please update the following node based on these instructions: ***your input here***

For the node titled "{{title}}" with current content:
{{content}}

=== TITLE ===
[Updated title here]

=== CONTENT ===  
[Updated content here]`;
        
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
            this.container.style.height = '90vh'; // Constrain to 90% of viewport height
            this.container.style.maxHeight = '90vh'; // Ensure it never exceeds viewport
            this.container.style.overflow = 'hidden'; // Prevent container overflow

            // --- Left Panel: Tree ---
            this.leftPanel = document.createElement('div');
            this.leftPanel.style.width = '25%';
            this.leftPanel.style.minWidth = '18em';
            this.leftPanel.style.maxWidth = '22em';
            this.leftPanel.style.background = '#fff';
            this.leftPanel.style.borderRight = '1.5px solid #e5e7eb';
            this.leftPanel.style.display = 'flex';
            this.leftPanel.style.flexDirection = 'column';
            this.leftPanel.style.position = 'relative';
            this.leftPanel.style.transition = 'width 0.3s';
            this.leftPanel.style.overflow = 'hidden';
            this.leftPanel.style.height = '100%';
            this.leftPanel.style.minHeight = '0'; // Allow flex shrinking

            // Tree selection - use flex instead of hardcoded height
            this.tree = new SelectableNodeTree(this.rootNode, document.createElement('div'));
            this.tree.render();
            this.tree['container'].style.marginTop = '2em';
            this.tree['container'].style.flex = '1 1 0%'; // Use flex instead of calc(90vh - 6em)
            this.tree['container'].style.overflowY = 'auto';
            this.tree['container'].style.background = '#fff';
            this.tree['container'].style.minHeight = '0'; // Allow flex shrinking
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
            this.rightPanel.style.overflow = 'hidden'; // Prevent panel overflow
            this.rightPanel.style.minHeight = '0'; // Allow flex shrinking
            // Controls container (prompt, model selector, buttons)
            const controlsContainer = document.createElement('div');
            controlsContainer.style.display = 'flex';
            controlsContainer.style.flexDirection = 'column';
            controlsContainer.style.gap = '2em';
            controlsContainer.style.flex = '0 1 auto'; // Allow shrinking if needed
            controlsContainer.style.minHeight = '0'; // Allow flex shrinking
            controlsContainer.style.overflow = 'hidden'; // Prevent overflow
            // Get default prompt and placeholders (move up here for scope)
            let defaultPrompt = this.defaultPrompt;
            const placeholders: string[] = ['title', 'content'];
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
                btn.addEventListener('click', () => this.tree.toggleAllAtLevel(idx));
                buttonBar.appendChild(btn);
            });
            controlsContainer.appendChild(buttonBar);
            // Enhanced header with better styling
            const headerSection = document.createElement('div');
            headerSection.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            headerSection.style.color = 'white';
            headerSection.style.padding = '1.5em';
            headerSection.style.borderRadius = '0.75em';
            headerSection.style.marginBottom = '2em';
            headerSection.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
            
            const headerTitle = document.createElement('h3');
            headerTitle.textContent = 'Batch Node Update';
            headerTitle.style.margin = '0 0 0.5em 0';
            headerTitle.style.fontSize = '1.4em';
            headerTitle.style.fontWeight = 'bold';
            headerSection.appendChild(headerTitle);
            
            const headerDesc = document.createElement('p');
            headerDesc.textContent = 'Update multiple nodes simultaneously with AI assistance. The system will modify title, content, and context based on your instructions.';
            headerDesc.style.margin = '0';
            headerDesc.style.opacity = '0.9';
            headerDesc.style.fontSize = '1em';
            headerSection.appendChild(headerDesc);
            
            controlsContainer.appendChild(headerSection);

            // Placeholders header with better styling
            const placeholderHeader = document.createElement('div');
            placeholderHeader.style.fontSize = '0.95em';
            placeholderHeader.style.fontStyle = 'italic';
            placeholderHeader.style.marginBottom = '1em';
            placeholderHeader.style.padding = '0.75em';
            placeholderHeader.style.background = '#f8fafc';
            placeholderHeader.style.border = '1px solid #e2e8f0';
            placeholderHeader.style.borderRadius = '0.5em';
            placeholderHeader.innerHTML = `<strong>Available placeholders:</strong> ${placeholders.map((p: string) => `<code style='background:#e2e8f0;padding:3px 6px;border-radius:4px;font-weight:500;color:#1e293b;'>{{${p}}}</code>`).join(', ')}`;
            controlsContainer.appendChild(placeholderHeader);
            // Batch tag section
            const batchTagSection = document.createElement('div');
            batchTagSection.style.marginBottom = '1.5em';
            
            const batchTagLabel = document.createElement('label');
            batchTagLabel.textContent = 'Batch Tag:';
            batchTagLabel.style.display = 'block';
            batchTagLabel.style.fontWeight = 'bold';
            batchTagLabel.style.marginBottom = '0.5em';
            batchTagLabel.style.color = '#374151';
            
            const batchTagInput = document.createElement('input');
            batchTagInput.type = 'text';
            batchTagInput.value = this.batchTag;
            batchTagInput.style.width = '100%';
            batchTagInput.style.padding = '0.75em';
            batchTagInput.style.border = '1px solid #d1d5db';
            batchTagInput.style.borderRadius = '0.5em';
            batchTagInput.style.fontSize = '1em';
            batchTagInput.style.boxSizing = 'border-box';
            batchTagInput.style.background = '#f9fafb';
            
            // Store reference to batchTagInput for later use
            this.batchTagInput = batchTagInput;
            
            // Update batch tag when changed
            batchTagInput.addEventListener('input', () => {
                this.batchTag = batchTagInput.value.trim() || this.batchTag;
            });
            
            batchTagSection.appendChild(batchTagLabel);
            batchTagSection.appendChild(batchTagInput);
            controlsContainer.appendChild(batchTagSection);

            // Enhanced prompt section
            const promptSection = document.createElement('div');
            promptSection.style.marginBottom = '2em';
            
            const promptLabel = document.createElement('label');
            promptLabel.textContent = 'Update Instructions:';
            promptLabel.style.fontWeight = 'bold';
            promptLabel.style.fontSize = '1.2em';
            promptLabel.style.marginBottom = '0.75em';
            promptLabel.style.display = 'block';
            promptLabel.style.color = '#1f2937';
            promptSection.appendChild(promptLabel);
            
            const promptHelp = document.createElement('div');
            promptHelp.style.fontSize = '0.9em';
            promptHelp.style.color = '#6b7280';
            promptHelp.style.marginBottom = '0.75em';
            promptHelp.style.fontStyle = 'italic';
            promptHelp.innerHTML = 'Replace <strong>***your input here***</strong> with your specific instructions. The AI will return sections with updated title and content for each selected node.';
            promptSection.appendChild(promptHelp);
            
            // Enhanced textarea for prompt input
            this.promptInput = document.createElement('textarea') as any;
            this.promptInput.value = defaultPrompt;
            this.promptInput.style.width = '100%';
            this.promptInput.style.fontSize = '1.1em';
            this.promptInput.style.padding = '1em';
            this.promptInput.style.border = '2px solid #e5e7eb';
            this.promptInput.style.borderRadius = '0.75em';
            this.promptInput.style.marginBottom = '0';
            this.promptInput.style.background = '#ffffff';
            this.promptInput.style.boxSizing = 'border-box';
            this.promptInput.style.minHeight = '8em';
            this.promptInput.style.fontFamily = 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';
            this.promptInput.style.lineHeight = '1.5';
            this.promptInput.style.resize = 'vertical';
            this.promptInput.style.transition = 'border-color 0.2s, box-shadow 0.2s';
            
            // Add focus styling
            this.promptInput.addEventListener('focus', () => {
                this.promptInput.style.borderColor = '#3b82f6';
                this.promptInput.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
            });
            this.promptInput.addEventListener('blur', () => {
                this.promptInput.style.borderColor = '#e5e7eb';
                this.promptInput.style.boxShadow = 'none';
            });
            
            promptSection.appendChild(this.promptInput);
            controlsContainer.appendChild(promptSection);
            // Enhanced model selector
            const modelSection = document.createElement('div');
            modelSection.style.marginBottom = '2em';
            
            const modelLabel = document.createElement('label');
            modelLabel.textContent = 'AI Model Purpose:';
            modelLabel.style.fontWeight = 'bold';
            modelLabel.style.fontSize = '1.2em';
            modelLabel.style.marginBottom = '0.75em';
            modelLabel.style.display = 'block';
            modelLabel.style.color = '#1f2937';
            modelSection.appendChild(modelLabel);
            
            this.modelSelect = document.createElement('select');
            this.modelSelect.style.width = '100%';
            this.modelSelect.style.fontSize = '1.1em';
            this.modelSelect.style.padding = '1em';
            this.modelSelect.style.border = '2px solid #e5e7eb';
            this.modelSelect.style.borderRadius = '0.75em';
            this.modelSelect.style.marginBottom = '0';
            this.modelSelect.style.background = '#ffffff';
            this.modelSelect.style.boxSizing = 'border-box';
            this.modelSelect.style.cursor = 'pointer';
            this.modelSelect.style.transition = 'border-color 0.2s, box-shadow 0.2s';
            
            // Add focus styling
            this.modelSelect.addEventListener('focus', () => {
                this.modelSelect.style.borderColor = '#3b82f6';
                this.modelSelect.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
            });
            this.modelSelect.addEventListener('blur', () => {
                this.modelSelect.style.borderColor = '#e5e7eb';
                this.modelSelect.style.boxShadow = 'none';
            });
            
            MODEL_PURPOSES.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.key;
                opt.textContent = p.label;
                this.modelSelect.appendChild(opt);
            });
            
            modelSection.appendChild(this.modelSelect);
            controlsContainer.appendChild(modelSection);
            
            console.log('🔧 About to create buttonRow...');
            
            // Enhanced buttons row
            const buttonRow = document.createElement('div');
            buttonRow.style.display = 'flex';
            buttonRow.style.gap = '1.5em';
            buttonRow.style.alignItems = 'center';
            buttonRow.style.marginBottom = '1em';
            buttonRow.style.justifyContent = 'flex-start';
            
            console.log('🔧 ButtonRow created, about to create buttons...');
            
            // Enhanced run button
            this.runButton = document.createElement('button');
            this.runButton.innerHTML = '<span style="margin-right: 0.5em;">🚀</span>Run Batch Update';
            this.runButton.style.fontSize = '1.1em';
            this.runButton.style.fontWeight = '600';
            this.runButton.style.padding = '1em 2em';
            this.runButton.style.borderRadius = '0.75em';
            this.runButton.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            this.runButton.style.color = '#fff';
            this.runButton.style.border = 'none';
            this.runButton.style.cursor = 'pointer';
            this.runButton.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
            this.runButton.style.transition = 'all 0.2s ease-in-out';
            this.runButton.style.display = 'inline-flex';
            this.runButton.style.alignItems = 'center';
            this.runButton.addEventListener('mouseenter', () => {
                this.runButton.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
                this.runButton.style.transform = 'translateY(-2px)';
                this.runButton.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.3)';
            });
            this.runButton.addEventListener('mouseleave', () => {
                this.runButton.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                this.runButton.style.transform = 'translateY(0)';
                this.runButton.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
            });
            this.runButton.addEventListener('click', () => this.handleRun());
            buttonRow.appendChild(this.runButton);
            
            console.log('🔧 Run button added to buttonRow');
            
            // Enhanced close button
            this.closeButton = document.createElement('button');
            this.closeButton.innerHTML = '<span style="margin-right: 0.5em;">✕</span>Close';
            this.closeButton.style.fontSize = '1.1em';
            this.closeButton.style.fontWeight = '600';
            this.closeButton.style.padding = '1em 2em';
            this.closeButton.style.borderRadius = '0.75em';
            this.closeButton.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
            this.closeButton.style.color = '#fff';
            this.closeButton.style.border = 'none';
            this.closeButton.style.cursor = 'pointer';
            this.closeButton.style.boxShadow = '0 4px 12px rgba(107, 114, 128, 0.25)';
            this.closeButton.style.transition = 'all 0.2s ease-in-out';
            this.closeButton.style.display = 'inline-flex';
            this.closeButton.style.alignItems = 'center';
            this.closeButton.addEventListener('mouseenter', () => {
                this.closeButton.style.background = 'linear-gradient(135deg, #4b5563 0%, #374151 100%)';
                this.closeButton.style.transform = 'translateY(-2px)';
                this.closeButton.style.boxShadow = '0 6px 16px rgba(107, 114, 128, 0.3)';
            });
            this.closeButton.addEventListener('mouseleave', () => {
                this.closeButton.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
                this.closeButton.style.transform = 'translateY(0)';
                this.closeButton.style.boxShadow = '0 4px 12px rgba(107, 114, 128, 0.25)';
            });
            this.closeButton.addEventListener('click', () => {
                // Warn if operation is running
                if (this.isRunning) {
                    const confirmClose = confirm('A batch operation is currently running. Are you sure you want to close? This will stop the operation.');
                    if (!confirmClose) {
                        return;
                    }
                    // Stop the operation before closing
                    this.handleStop();
                }
                
                if (this.options.onClose) {
                    this.options.onClose();
                }
            });
            buttonRow.appendChild(this.closeButton);
            
            // Enhanced stop button (initially hidden)
            this.stopButton = document.createElement('button');
            this.stopButton.innerHTML = '<span style="margin-right: 0.5em;">⏹️</span>Stop Batch';
            this.stopButton.style.fontSize = '1.1em';
            this.stopButton.style.fontWeight = '600';
            this.stopButton.style.padding = '1em 2em';
            this.stopButton.style.borderRadius = '0.75em';
            this.stopButton.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
            this.stopButton.style.color = '#fff';
            this.stopButton.style.border = 'none';
            this.stopButton.style.cursor = 'pointer';
            this.stopButton.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.25)';
            this.stopButton.style.transition = 'all 0.2s ease-in-out';
            this.stopButton.style.display = 'none'; // Initially hidden
            this.stopButton.style.alignItems = 'center';
            this.stopButton.addEventListener('mouseenter', () => {
                this.stopButton.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
                this.stopButton.style.transform = 'translateY(-2px)';
                this.stopButton.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.3)';
            });
            this.stopButton.addEventListener('mouseleave', () => {
                this.stopButton.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
                this.stopButton.style.transform = 'translateY(0)';
                this.stopButton.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.25)';
            });
            this.stopButton.addEventListener('click', () => this.handleStop());
            buttonRow.appendChild(this.stopButton);
            
            // Enhanced spinner with progress text
            this.spinner = document.createElement('div');
            this.spinner.style.display = 'none';
            this.spinner.style.alignItems = 'center';
            this.spinner.style.gap = '0.75em';
            this.spinner.style.fontSize = '1em';
            this.spinner.style.color = '#6b7280';
            this.spinner.style.fontWeight = '500';
            
            const spinnerIcon = document.createElement('span');
            spinnerIcon.style.display = 'inline-block';
            spinnerIcon.style.width = '1.5em';
            spinnerIcon.style.height = '1.5em';
            spinnerIcon.style.border = '3px solid #e5e7eb';
            spinnerIcon.style.borderTop = '3px solid #3b82f6';
            spinnerIcon.style.borderRadius = '50%';
            spinnerIcon.style.animation = 'spin 1s linear infinite';
            
            const spinnerText = document.createElement('span');
            spinnerText.textContent = 'Processing nodes...';
            
            this.spinner.appendChild(spinnerIcon);
            this.spinner.appendChild(spinnerText);
            buttonRow.appendChild(this.spinner);
            
            // Add CSS animation
            const style = document.createElement('style');
            style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
            
            controlsContainer.appendChild(buttonRow);
            this.rightPanel.appendChild(controlsContainer);
            
            console.log('🔧 ButtonRow added to controlsContainer');
            console.log('🔧 ControlsContainer added to rightPanel');
            console.log('🔧 ControlsContainer children count:', controlsContainer.children.length);
            
            // --- Log panel ---
            const logContainer = document.createElement('div');
            logContainer.style.flex = '1 1 0%';
            logContainer.style.overflowY = 'auto';
            logContainer.style.minHeight = '0';
            logContainer.style.maxHeight = '100%'; // Ensure it doesn't exceed remaining space
            logContainer.style.overflowX = 'hidden'; // Prevent horizontal scrolling
            // Log panel itself
            this.logPanel = document.createElement('div');
            this.logPanel.style.background = '#f9fafb';
            this.logPanel.style.border = '1.5px solid #e5e7eb';
            this.logPanel.style.borderRadius = '0.7em';
            this.logPanel.style.padding = '1.2em';
            this.logPanel.style.fontFamily = 'system-ui, -apple-system, sans-serif';
            this.logPanel.style.fontSize = '1.1em';
            this.logPanel.style.lineHeight = '1.5';
            this.logPanel.style.whiteSpace = 'pre-wrap';
            
            // Add initial log header
            const logHeader = document.createElement('div');
            logHeader.style.fontWeight = 'bold';
            logHeader.style.fontSize = '1.2em';
            logHeader.style.marginBottom = '1em';
            logHeader.style.color = '#374151';
            logHeader.style.borderBottom = '2px solid #e5e7eb';
            logHeader.style.paddingBottom = '0.5em';
            logHeader.textContent = 'Batch Update Log';
            this.logPanel.appendChild(logHeader);
            logContainer.appendChild(this.logPanel);
            this.rightPanel.appendChild(logContainer);

            // --- Layout: Add panels to container ---
            this.container.appendChild(this.leftPanel);
            this.container.appendChild(this.rightPanel);
            
            console.log('🔧 BatchUpdateModal render() completed successfully');
            
        } catch (error) {
            console.error('❌ Error in BatchUpdateModal render():', error);
            throw error;
        }
    }

    /**
     * Run the batch update for all selected nodes.
     */
    private async handleRun() {
        const selectedNodes = this.tree.getSelectedNodes();
        const prompt = this.promptInput.value.trim();
        const currentBatchTag = this.batchTagInput.value.trim() || this.batchTag;
        
        if (!selectedNodes.length || !prompt) {
            alert('Please select nodes and enter a prompt.');
            return;
        }
        if (prompt === this.defaultPrompt.trim()) {
            alert('Please fill out the prompt with your instruction.');
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
        
        // Clear log but keep header
        const logHeader = this.logPanel.querySelector('div');
        this.logPanel.innerHTML = '';
        if (logHeader) {
            this.logPanel.appendChild(logHeader);
        }
        
        for (const node of selectedNodes) {
            // Check for abort request
            if (this.shouldAbort) {
                this.appendLog(`⚠️ Batch Update Aborted`, 'error', 'Operation was stopped by user request.');
                break;
            }
            try {
                // Highlight the node in the tree view
                this.tree.highlightNode(node.id);
                const userPrompt = prompt
                    .replace(/\{\{title\}\}/g, node.title)
                    .replace(/\{\{content\}\}/g, node.content ?? '');
                
                // Check for abort before making API call
                if (this.shouldAbort) {
                    break;
                }
                
                const result = await this.openRouterClient.chat(this.modelSelect.value, userPrompt);
                
                // Parse section-based response
                try {
                    const parsedResult = this.parseSectionResponse(result);
                    
                    if (parsedResult.success) {
                        const updates: string[] = [];
                        
                        // Check if any changes were made
                        const titleChanged = parsedResult.title && parsedResult.title !== node.title;
                        const contentChanged = parsedResult.content && parsedResult.content !== node.content;
                        
                        if (titleChanged || contentChanged) {
                            // Create single atomic update with both changes
                            const newTitle = parsedResult.title || node.title;
                            const newContent = parsedResult.content || node.content;
                            
                            // Create version with batch tag
                            const versionId = uuidv4();
                            node.setFieldsWithTags({ 
                                title: newTitle, 
                                content: newContent, 
                                context: node.context 
                            }, new Set([currentBatchTag]), { versionId });
                            
                            // Promote to master so changes become active
                            node.promoteToMaster(versionId);
                            
                            // Track what was updated
                            if (titleChanged) {
                                updates.push(`Title: "${newTitle}"`);
                            }
                            if (contentChanged) {
                                updates.push(`Content updated (${newContent.length} chars)`);
                            }
                        }
                        
                        // Persist changes immediately
                        await this.persistNodeChanges();
                        
                        const updateSummary = updates.length > 0 ? updates.join('\n') : 'No changes made';
                        this.appendLog(`✔️ ${node.title}`, 'success', updateSummary, {
                            node: node,
                            title: parsedResult.title || node.title,
                            content: parsedResult.content || node.content
                        });
                        
                    } else {
                        throw new Error(parsedResult.error || 'Invalid section format');
                    }
                } catch (parseError) {
                    // If section parsing fails, show error and do NOT update anything
                    const errorMsg = parseError instanceof Error ? parseError.message : 'Invalid section format';
                    this.appendLog(`❌ ${node.title}`, 'error', `Section parsing failed: ${errorMsg}\n\nReceived response:\n${result.substring(0, 300)}${result.length > 300 ? '...' : ''}`);
                }
                
            } catch (err) {
                // Don't log individual errors if we're aborting
                if (!this.shouldAbort) {
                    this.appendLog(`❌ ${node.title}`, 'error', err instanceof Error ? err.message : String(err));
                }
            }
        }
        // Remove highlight after batch is done
        this.tree.highlightNode('');
        
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

    /**
     * Handle stop button click to abort the batch operation.
     */
    private handleStop() {
        if (this.isRunning) {
            this.shouldAbort = true;
            this.appendLog(`🛑 Stop Requested`, 'error', 'Batch operation will stop after current node completes.');
            
            // Update stop button to show it's been clicked
            this.stopButton.innerHTML = '<span style="margin-right: 0.5em;">⏳</span>Stopping...';
            this.stopButton.disabled = true;
        }
    }

    private parseSectionResponse(response: string): { success: boolean; title?: string; content?: string; error?: string } {
        try {
            const trimmed = response.trim();
            
            // Find section markers
            const titleMatch = trimmed.match(/=== TITLE ===\s*\n?(.*?)(?=\n=== CONTENT ===|$)/s);
            const contentMatch = trimmed.match(/=== CONTENT ===\s*\n?(.*?)(?=\n=== TITLE ===|$)/s);
            
            // Validate that both sections are present
            if (!titleMatch || !contentMatch) {
                const missingSections = [];
                if (!titleMatch) missingSections.push('TITLE');
                if (!contentMatch) missingSections.push('CONTENT');
                
                return {
                    success: false,
                    error: `Missing required sections: ${missingSections.join(', ')}`
                };
            }
            
            // Extract and clean content
            const title = titleMatch[1]?.trim() || '';
            const content = contentMatch[1]?.trim() || '';
            
            return {
                success: true,
                title,
                content
            };
            
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown parsing error'
            };
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
                
                // Update the main GUI tree - use the exported renderNodeDetails instead
                const { renderNodeDetails } = await import('../project-ui');
                renderNodeDetails();
            }
        } catch (error) {
            console.error('Failed to persist node changes:', error);
        }
    }

    private appendLog(title: string, type: 'success' | 'error', content: string, nodeData?: { node: any; title: string; content: string }) {
        const entry = document.createElement('div');
        entry.style.marginBottom = '1.5em';
        entry.style.padding = '1em';
        entry.style.borderRadius = '0.5em';
        entry.style.border = '1px solid';
        
        if (type === 'success') {
            entry.style.backgroundColor = '#f0f9ff';
            entry.style.borderColor = '#0ea5e9';
        } else {
            entry.style.backgroundColor = '#fef2f2';
            entry.style.borderColor = '#ef4444';
        }
        
        // Header with title and expand button
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.marginBottom = '0.5em';
        
        const titleDiv = document.createElement('div');
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.fontSize = '1.1em';
        titleDiv.style.color = type === 'success' ? '#0369a1' : '#dc2626';
        titleDiv.textContent = title;
        headerDiv.appendChild(titleDiv);
        
        // Add expand button for successful updates with node data
        if (type === 'success' && nodeData) {
            const expandButton = document.createElement('button');
            expandButton.textContent = '📝 Edit';
            expandButton.style.fontSize = '0.9em';
            expandButton.style.padding = '0.25em 0.5em';
            expandButton.style.border = '1px solid #0ea5e9';
            expandButton.style.borderRadius = '0.25em';
            expandButton.style.background = '#ffffff';
            expandButton.style.color = '#0369a1';
            expandButton.style.cursor = 'pointer';
            expandButton.style.transition = 'all 0.2s';
            
            expandButton.addEventListener('mouseenter', () => {
                expandButton.style.background = '#0ea5e9';
                expandButton.style.color = '#ffffff';
            });
            expandButton.addEventListener('mouseleave', () => {
                expandButton.style.background = '#ffffff';
                expandButton.style.color = '#0369a1';
            });
            
            let isExpanded = false;
            let editView: HTMLElement | null = null;
            
            expandButton.addEventListener('click', () => {
                if (!isExpanded) {
                    // Create edit view
                    editView = this.createEditView(nodeData);
                    entry.appendChild(editView);
                    expandButton.textContent = '📝 Collapse';
                    isExpanded = true;
                } else {
                    // Remove edit view
                    if (editView) {
                        editView.remove();
                        editView = null;
                    }
                    expandButton.textContent = '📝 Edit';
                    isExpanded = false;
                }
            });
            
            headerDiv.appendChild(expandButton);
        }
        
        entry.appendChild(headerDiv);
        
        // Content summary
        const contentDiv = document.createElement('div');
        contentDiv.style.whiteSpace = 'pre-wrap';
        contentDiv.style.fontSize = '1em';
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
        
        // Scroll the container, not the panel itself
        const logContainer = this.logPanel.parentElement;
        if (logContainer) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    private createEditView(nodeData: { node: any; title: string; content: string }): HTMLElement {
        const editContainer = document.createElement('div');
        editContainer.style.marginTop = '1em';
        editContainer.style.padding = '1em';
        editContainer.style.background = '#f8fafc';
        editContainer.style.border = '1px solid #e2e8f0';
        editContainer.style.borderRadius = '0.5em';
        
        // Title section
        const titleSection = document.createElement('div');
        titleSection.style.marginBottom = '1em';
        
        const titleLabel = document.createElement('label');
        titleLabel.textContent = 'Title:';
        titleLabel.style.display = 'block';
        titleLabel.style.fontWeight = 'bold';
        titleLabel.style.marginBottom = '0.5em';
        titleLabel.style.fontSize = '1em';
        titleSection.appendChild(titleLabel);
        
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = nodeData.title;
        titleInput.style.width = '100%';
        titleInput.style.padding = '0.5em';
        titleInput.style.border = '1px solid #d1d5db';
        titleInput.style.borderRadius = '0.25em';
        titleInput.style.fontSize = '1em';
        titleInput.style.boxSizing = 'border-box';
        titleSection.appendChild(titleInput);
        
        editContainer.appendChild(titleSection);
        
        // Content section
        const contentSection = document.createElement('div');
        contentSection.style.marginBottom = '1em';
        
        const contentLabel = document.createElement('label');
        contentLabel.textContent = 'Content:';
        contentLabel.style.display = 'block';
        contentLabel.style.fontWeight = 'bold';
        contentLabel.style.marginBottom = '0.5em';
        contentLabel.style.fontSize = '1em';
        contentSection.appendChild(contentLabel);
        
        const contentTextarea = document.createElement('textarea');
        contentTextarea.value = nodeData.content;
        contentTextarea.style.width = '100%';
        contentTextarea.style.minHeight = '8em';
        contentTextarea.style.padding = '0.5em';
        contentTextarea.style.border = '1px solid #d1d5db';
        contentTextarea.style.borderRadius = '0.25em';
        contentTextarea.style.fontSize = '1em';
        contentTextarea.style.fontFamily = 'inherit';
        contentTextarea.style.boxSizing = 'border-box';
        contentTextarea.style.resize = 'vertical';
        contentSection.appendChild(contentTextarea);
        
        editContainer.appendChild(contentSection);
        
        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '0.5em';
        buttonContainer.style.justifyContent = 'flex-end';
        
        const applyButton = document.createElement('button');
        applyButton.textContent = 'Apply Changes';
        applyButton.style.padding = '0.5em 1em';
        applyButton.style.background = '#10b981';
        applyButton.style.color = '#ffffff';
        applyButton.style.border = 'none';
        applyButton.style.borderRadius = '0.25em';
        applyButton.style.cursor = 'pointer';
        applyButton.style.fontWeight = '500';
        applyButton.style.transition = 'background 0.2s';
        
        applyButton.addEventListener('mouseenter', () => {
            applyButton.style.background = '#059669';
        });
        applyButton.addEventListener('mouseleave', () => {
            applyButton.style.background = '#10b981';
        });
        
        applyButton.addEventListener('click', async () => {
            // Apply changes to the node
            const newTitle = titleInput.value.trim();
            const newContent = contentTextarea.value.trim();
            
            if (newTitle !== nodeData.node.title || newContent !== nodeData.node.content) {
                // Create comprehensive manual edit tag with timestamp
                const now = new Date();
                const manualEditTag = `ManualEdit_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
                
                // Create single atomic update for manual edit
                const versionId = uuidv4();
                nodeData.node.setFieldsWithTags(
                    { title: newTitle, content: newContent, context: nodeData.node.context }, 
                    new Set([manualEditTag, this.batchTag]),
                    { versionId }
                );
                
                // Promote to master so changes become active
                nodeData.node.promoteToMaster(versionId);
                
                // Persist changes and update GUI
                await this.persistNodeChanges();
                
                // Show confirmation
                const originalText = applyButton.textContent;
                applyButton.textContent = '✓ Applied';
                applyButton.style.background = '#059669';
                setTimeout(() => {
                    applyButton.textContent = originalText;
                    applyButton.style.background = '#10b981';
                }, 1500);
            }
        });
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Reset';
        cancelButton.style.padding = '0.5em 1em';
        cancelButton.style.background = '#6b7280';
        cancelButton.style.color = '#ffffff';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '0.25em';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontWeight = '500';
        cancelButton.style.transition = 'background 0.2s';
        
        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.background = '#4b5563';
        });
        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.background = '#6b7280';
        });
        
        cancelButton.addEventListener('click', () => {
            titleInput.value = nodeData.title;
            contentTextarea.value = nodeData.content;
        });
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(applyButton);
        editContainer.appendChild(buttonContainer);
        
        return editContainer;
    }

    private getPluralLevelName(levelName: string): string {
        if (levelName.endsWith('s')) return levelName;
        return levelName + 's';
    }
} 