import { BaseModal } from './core/BaseModal';
import { DocumentNode, TodoItem } from '../../DocumentNode';
import { ProjectManager } from '../../ProjectManager';
import { OpenRouterClient } from '../../OpenRouterClient';
import { SettingsManager } from '../../SettingsManager';
import { LogicOutlineFixerService, FixedOutlineResult } from './services/LogicOutlineFixerService';
import { LogicChildFixerService, FixedChildResult } from './services/LogicChildFixerService';
import { DiffTool } from '../../DiffTool';

interface LogicOutlineFixerConfig {
    id: string;
    node: DocumentNode;
    projectManager: ProjectManager;
}

type ModalState = 'choice' | 'problem-selection' | 'truth-selection' | 'parent-loading' | 'parent-review' | 'child-loading' | 'child-review';

export class LogicOutlineFixerModal extends BaseModal {
    private node: DocumentNode;
    private projectManager: ProjectManager;
    private modalState: ModalState = 'choice';
    private fixedResult: FixedOutlineResult | null = null;
    private childFixResults: Map<string, FixedChildResult> = new Map();
    private logicOutlineService!: LogicOutlineFixerService;
    private logicChildService!: LogicChildFixerService;
    private affectedNodes: DocumentNode[] = [];
    private selectedTodo: TodoItem | null = null;
    private problemAffectedNodes: DocumentNode[] = [];
    private truthNode: DocumentNode | null = null;
    private currentChildIndex = 0;

    constructor(config: LogicOutlineFixerConfig) {
        super({
            id: config.id,
            title: '🔧 Fix Logic Issues',
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
     * Initialize services when modal opens
     */
    override async open(): Promise<void> {
        const openRouterClient = OpenRouterClient.getInstance();
        const settingsManager = await SettingsManager.getInstance();
        
        this.logicOutlineService = new LogicOutlineFixerService(openRouterClient, settingsManager);
        this.logicChildService = new LogicChildFixerService(openRouterClient, settingsManager);

        // Collect affected nodes from todos
        await this.collectAffectedNodes();

        await super.open();
        this.setupEventListeners();
    }

    /**
     * Collect affected nodes from todo list
     */
    private async collectAffectedNodes(): Promise<void> {
        const todos = this.node.getIncompleteTodos();
        const nodeIds = new Set<string>();
        
        todos.forEach(todo => {
            if (todo.relatedNodes) {
                todo.relatedNodes.forEach(ref => {
                    if (ref.id !== 'unknown') {
                        nodeIds.add(ref.id);
                    }
                });
            }
        });

        // Find actual node objects
        this.affectedNodes = [];
        for (const nodeId of nodeIds) {
            const node = this.findNodeById(this.projectManager.rootNode, nodeId);
            this.affectedNodes.push(node);
        }
    }

    /**
     * Find node by ID in the tree
     */
    private findNodeById(root: DocumentNode, targetId: string): DocumentNode {
        const result = this.searchNodeById(root, targetId);
        if (result === null) {
            throw new Error(`Node with ID ${targetId} not found in tree`);
        }
        return result;
    }

    private searchNodeById(root: DocumentNode, targetId: string): DocumentNode | null {
        if (root.id === targetId) {
            return root;
        }
        
        for (const child of root.children) {
            const found = this.searchNodeById(child, targetId);
            if (found !== null) {
                return found;
            }
        }
        
        return null;
    }

    /**
     * Render modal content based on current state
     */
    private renderModalContent(): string {
        switch (this.modalState) {
            case 'choice':
                return this.renderChoiceContent();
            case 'problem-selection':
                return this.renderProblemSelectionContent();
            case 'truth-selection':
                return this.renderTruthSelectionContent();
            case 'parent-loading':
                return this.renderParentLoadingContent();
            case 'parent-review':
                return this.renderParentReviewContent();
            case 'child-loading':
                return this.renderChildLoadingContent();
            case 'child-review':
                return this.renderChildReviewContent();
            default:
                return this.renderChoiceContent();
        }
    }

    /**
     * Render choice dialog content
     */
    private renderChoiceContent(): string {
        const todos = this.node.getIncompleteTodos();
        
        return `
            <style>
                .choice-container {
                    padding: 30px;
                    text-align: center;
                    height: calc(100% - 80px);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                }
                
                .choice-title {
                    font-size: 24px;
                    margin-bottom: 20px;
                    color: #333;
                }
                
                .choice-description {
                    font-size: 16px;
                    color: #666;
                    margin-bottom: 30px;
                    max-width: 600px;
                    line-height: 1.5;
                }
                
                .todos-summary {
                    background: #fff3e0;
                    border-left: 4px solid #ff9800;
                    padding: 15px;
                    margin-bottom: 30px;
                    border-radius: 4px;
                    max-width: 600px;
                }
                
                .choice-buttons {
                    display: flex;
                    gap: 20px;
                    margin-top: 20px;
                }
                
                .choice-btn {
                    padding: 15px 30px;
                    font-size: 16px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    min-width: 200px;
                }
                
                .choice-btn.parent {
                    background: #2196f3;
                    color: white;
                }
                
                .choice-btn.parent:hover {
                    background: #1976d2;
                }
                
                .choice-btn.children {
                    background: #4caf50;
                    color: white;
                }
                
                .choice-btn.children:hover {
                    background: #388e3c;
                }
                
                .choice-btn:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                
                .affected-nodes {
                    background: #e8f5e8;
                    border-left: 4px solid #4caf50;
                    padding: 15px;
                    margin-top: 20px;
                    border-radius: 4px;
                    max-width: 600px;
                }
            </style>

            <div class="choice-container">
                <h2 class="choice-title">🔧 How would you like to fix the logic issues?</h2>
                
                <p class="choice-description">
                    Logic errors have been detected in the content. You can choose to fix them by adjusting the parent outline 
                    or by selecting a "truth" node and adjusting the other affected child nodes to match it.
                </p>
                
                <div class="todos-summary">
                    <h4 style="margin: 0 0 10px 0; color: #e65100;">🚨 Issues to Fix (${todos.length})</h4>
                    ${todos.map((todo, index) => `
                        <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #ffcc02;">
                            <div style="font-weight: 500;">${index + 1}. ${todo.description}</div>
                        </div>
                    `).join('')}
                </div>
                
                ${this.affectedNodes.length > 0 ? `
                    <div class="affected-nodes">
                        <h4 style="margin: 0 0 10px 0; color: #2e7d32;">📝 Affected Nodes (${this.affectedNodes.length})</h4>
                        ${this.affectedNodes.map(node => `
                            <div style="margin-bottom: 4px; color: #1b5e20;">• ${node.title}</div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <div class="choice-buttons">
                    <button id="fix-parent-btn" class="choice-btn parent">
                        🔧 Fix Parent Outline
                        <div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">
                            Adjust the parent content and regenerate children
                        </div>
                    </button>
                    
                    <button id="fix-children-btn" class="choice-btn children" ${this.affectedNodes.length === 0 ? 'disabled' : ''}>
                        🎯 Fix Child Nodes
                        <div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">
                            Select truth node and adjust others to match
                        </div>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render problem selection content
     */
    private renderProblemSelectionContent(): string {
        const todos = this.node.getIncompleteTodos();
        
        return `
            <style>
                .problem-selection-container {
                    padding: 20px;
                    height: calc(100% - 80px);
                    overflow-y: auto;
                }
                
                .problem-title {
                    font-size: 20px;
                    margin-bottom: 15px;
                    color: #333;
                }
                
                .problem-description {
                    color: #666;
                    margin-bottom: 20px;
                    line-height: 1.5;
                }
                
                .problem-option {
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    transition: all 0.3s ease;
                    cursor: pointer;
                }
                
                .problem-option:hover {
                    border-color: #e65100;
                }
                
                .problem-option.selected {
                    border-color: #e65100;
                    background: #fff3e0;
                }
                
                .problem-header {
                    padding: 15px;
                    border-bottom: 1px solid #eee;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .problem-details {
                    padding: 15px;
                    font-size: 14px;
                    color: #555;
                    line-height: 1.5;
                }
                
                .affected-nodes-info {
                    color: #757575;
                    font-size: 12px;
                    margin-top: 8px;
                }
                
                .problem-actions {
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                
                .problem-btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                }
                
                .problem-btn.proceed {
                    background: #e65100;
                    color: white;
                }
                
                .problem-btn.proceed:hover {
                    background: #d84315;
                }
                
                .problem-btn.proceed:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                
                .problem-btn.back {
                    background: #757575;
                    color: white;
                }
                
                .problem-btn.back:hover {
                    background: #616161;
                }
            </style>

            <div class="problem-selection-container">
                <h2 class="problem-title">🚨 Select Problem to Fix</h2>
                <p class="problem-description">
                    Multiple logic problems have been detected. Choose which specific problem you want to fix. 
                    Each problem affects different nodes and will be fixed individually.
                </p>
                
                ${todos.map((todo, index) => {
                    const affectedCount = todo.relatedNodes ? todo.relatedNodes.length : 0;
                    const nodeNames = todo.relatedNodes ? 
                        todo.relatedNodes.map(ref => ref.title).join(', ') : 
                        'Unknown nodes';
                    
                    return `
                        <div class="problem-option" data-todo-index="${index}">
                            <div class="problem-header">
                                <input type="radio" name="selected-problem" value="${index}" style="margin-right: 10px;">
                                <span>🚨 Problem ${index + 1}</span>
                            </div>
                            <div class="problem-details">
                                <div>${todo.description}</div>
                                <div class="affected-nodes-info">
                                    Affects ${affectedCount} nodes: ${nodeNames}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
                
                <div class="problem-actions">
                    <button id="problem-back-btn" class="problem-btn back">← Back</button>
                    <button id="problem-proceed-btn" class="problem-btn proceed" disabled>Fix Selected Problem</button>
                </div>
            </div>
        `;
    }

    /**
     * Render truth node selection content
     */
    private renderTruthSelectionContent(): string {
        return `
            <style>
                .truth-selection-container {
                    padding: 20px;
                    height: calc(100% - 80px);
                    overflow-y: auto;
                }
                
                .truth-title {
                    font-size: 20px;
                    margin-bottom: 15px;
                    color: #333;
                }
                
                .truth-description {
                    color: #666;
                    margin-bottom: 20px;
                    line-height: 1.5;
                }
                
                .node-option {
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    transition: all 0.3s ease;
                    cursor: pointer;
                }
                
                .node-option:hover {
                    border-color: #4caf50;
                }
                
                .node-option.selected {
                    border-color: #4caf50;
                    background: #f1f8e9;
                }
                
                .node-header {
                    padding: 15px;
                    border-bottom: 1px solid #eee;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .node-content-preview {
                    padding: 15px;
                    font-size: 14px;
                    color: #555;
                    line-height: 1.5;
                    max-height: 150px;
                    overflow-y: auto;
                    border-bottom: 1px solid #eee;
                }
                
                .logic-error-info {
                    padding: 15px;
                    background: #fff3e0;
                    border-top: 2px solid #ff9800;
                }
                
                .error-justification {
                    font-size: 14px;
                    color: #d84315;
                    line-height: 1.5;
                    margin-bottom: 8px;
                }
                
                .error-severity {
                    font-size: 12px;
                    color: #e65100;
                    font-weight: 500;
                }
                
                .truth-actions {
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                
                .truth-btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                }
                
                .truth-btn.proceed {
                    background: #4caf50;
                    color: white;
                }
                
                .truth-btn.proceed:hover {
                    background: #388e3c;
                }
                
                .truth-btn.proceed:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                
                .truth-btn.back {
                    background: #757575;
                    color: white;
                }
                
                .truth-btn.back:hover {
                    background: #616161;
                }
            </style>

            <div class="truth-selection-container">
                <h2 class="truth-title">🎯 Select the Truth Node</h2>
                <p class="truth-description">
                    Choose which node contains the correct information for "<strong>${this.selectedTodo?.description}</strong>".
                    This node will remain unchanged while others are fixed to be consistent with it.
                </p>
                
                ${this.problemAffectedNodes.map(node => `
                    <div class="node-option" data-node-id="${node.id}">
                        <div class="node-header">
                            <input type="radio" name="truth-node" value="${node.id}" style="margin-right: 10px;">
                            <span>📄 ${node.title}</span>
                        </div>
                        <div class="node-content-preview">
                            ${node.content ? node.content.substring(0, 300) + (node.content.length > 300 ? '...' : '') : 'No content'}
                        </div>
                        ${this.selectedTodo?.logicError ? `
                            <div class="logic-error-info">
                                <div class="error-justification">
                                    <strong>🚨 Problem:</strong> ${this.selectedTodo.logicError.justification}
                                </div>
                                <div class="error-severity">
                                    <strong>Severity:</strong> ${this.selectedTodo.logicError.severity}/10
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
                
                <div class="truth-actions">
                    <button id="truth-back-btn" class="truth-btn back">← Back</button>
                    <button id="truth-proceed-btn" class="truth-btn proceed" disabled>Proceed with Truth Node</button>
                </div>
            </div>
        `;
    }

    /**
     * Render parent loading content
     */
    private renderParentLoadingContent(): string {
        return `
            <div style="padding: 40px; text-align: center; height: calc(100% - 80px); display: flex; flex-direction: column; justify-content: center;">
                <div style="font-size: 18px; color: #333; margin-bottom: 20px;">🔧 Fixing Parent Outline...</div>
                <div style="margin: 20px 0;">
                    <div class="spinner-wrench" style="font-size: 48px; animation: spin 2s linear infinite; transform-origin: center;">🔧</div>
                </div>
                <div style="color: #666;">Analyzing logic issues and generating improved outline</div>
            </div>
        `;
    }

    /**
     * Render child loading content
     */
    private renderChildLoadingContent(): string {
        const totalNodes = this.problemAffectedNodes.filter(n => n !== this.truthNode).length;
        const progress = Math.round(((this.currentChildIndex) / totalNodes) * 100);
        const currentNode = this.problemAffectedNodes.filter(n => n !== this.truthNode)[this.currentChildIndex];
        
        return `
            <div style="padding: 40px; text-align: center; height: calc(100% - 80px); display: flex; flex-direction: column; justify-content: center;">
                <div style="font-size: 18px; color: #333; margin-bottom: 20px;">🎯 Fixing Child Nodes...</div>
                <div style="margin: 20px 0;">
                    <div class="spinner-target" style="font-size: 48px; animation: spin 2s linear infinite; transform-origin: center;">🎯</div>
                </div>
                <div style="color: #666; margin-bottom: 15px;">
                    Processing: ${currentNode ? currentNode.title : 'Finalizing...'}
                </div>
                <div style="background: #f5f5f5; border-radius: 10px; height: 20px; margin: 20px auto; width: 300px; overflow: hidden;">
                    <div style="background: #4caf50; height: 100%; width: ${progress}%; transition: width 0.3s ease;"></div>
                </div>
                <div style="color: #666; font-size: 14px;">Progress: ${this.currentChildIndex}/${totalNodes} nodes processed</div>
            </div>
        `;
    }

    /**
     * Render parent review content
     */
    private renderParentReviewContent(): string {
        if (!this.fixedResult) return '';

        const todos = this.node.getIncompleteTodos();
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
                
                .review-container {
                    padding: 20px;
                    height: calc(100% - 80px);
                    overflow-y: auto;
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
            </style>

            <div class="review-container">
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
                <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
                    <p style="margin: 0; font-weight: 500; color: #1565c0;">📊 Changes Made: ${diffSummary}</p>
                </div>

                <!-- Content Comparison -->
                <div class="content-comparison">
                    <div class="content-section">
                        <h4 style="margin: 0 0 10px 0; color: #d32f2f;">📄 Original Content</h4>
                        <div class="content-box" style="border-color: #f44336;">
                            ${this.fixedResult.originalContent}
                        </div>
                    </div>
                    <div class="content-section">
                        <h4 style="margin: 0 0 10px 0; color: #388e3c;">✨ Fixed Content</h4>
                        <div class="content-box" style="border-color: #4caf50;">
                            ${this.fixedResult.fixedContent}
                        </div>
                    </div>
                </div>

                <!-- Detailed Diff -->
                <h4 style="margin: 20px 0 10px 0; color: #333;">🔍 Detailed Changes</h4>
                <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; font-family: monospace;">
                    <div class="diff-content">${diffResult.modifiedHtml}</div>
                </div>
            </div>
        `;
    }

    /**
     * Render child review content
     */
    private renderChildReviewContent(): string {
        const todos = this.node.getIncompleteTodos();
        const fixedNodes = Array.from(this.childFixResults.keys());
        
        return `
            <style>
                .child-review-container {
                    padding: 20px;
                    height: calc(100% - 80px);
                    overflow-y: auto;
                }
                
                .summary-section {
                    background: #e8f5e8;
                    border-left: 4px solid #4caf50;
                    padding: 15px;
                    margin-bottom: 20px;
                    border-radius: 4px;
                }
                
                .fixed-node {
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    background: white;
                }
                
                .fixed-node-header {
                    background: #f8f9fa;
                    padding: 15px;
                    border-bottom: 1px solid #ddd;
                    font-weight: 500;
                }
                
                .fixed-node-content {
                    padding: 15px;
                }
                
                .truth-highlight {
                    background: #fff3e0;
                    border-left: 4px solid #ff9800;
                    padding: 15px;
                    margin-bottom: 20px;
                    border-radius: 4px;
                }
            </style>

            <div class="child-review-container">
                <!-- Todo Items Section -->
                <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #e65100;">🚨 Issues Addressed (${todos.length})</h4>
                    ${todos.map((todo, index) => `
                        <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #ffcc02;">
                            <div style="font-weight: 500;">${index + 1}. ${todo.description}</div>
                        </div>
                    `).join('')}
                </div>

                <!-- Truth Node Section -->
                ${this.truthNode ? `
                    <div class="truth-highlight">
                        <h4 style="margin: 0 0 10px 0; color: #e65100;">🎯 Truth Node (Unchanged)</h4>
                        <div style="font-weight: 500; margin-bottom: 5px;">${this.truthNode.title}</div>
                        <div style="font-size: 0.9em;">This node was used as the reference for fixing others.</div>
                    </div>
                ` : ''}

                <!-- Summary Section -->
                <div class="summary-section">
                    <h4 style="margin: 0 0 10px 0; color: #2e7d32;">✅ Fix Summary</h4>
                    <div style="color: #1b5e20;">
                        Fixed ${fixedNodes.length} child node(s) to align with the truth node while preserving their unique content and purpose.
                    </div>
                </div>

                <!-- Fixed Nodes -->
                <h4 style="margin: 20px 0 15px 0; color: #333;">📝 Fixed Nodes</h4>
                                 ${fixedNodes.map(nodeId => {
                     const result = this.childFixResults.get(nodeId)!;
                     const node = this.findNodeById(this.projectManager.rootNode, nodeId)!;
                    const diffResult = DiffTool.compare(result.originalContent, result.fixedContent);
                    const diffSummary = DiffTool.getSummary(diffResult);
                    
                    return `
                        <div class="fixed-node">
                            <div class="fixed-node-header">
                                📄 ${node.title}
                                <div style="font-size: 12px; color: #666; font-weight: normal; margin-top: 5px;">
                                    Changes: ${diffSummary}
                                </div>
                            </div>
                            <div class="fixed-node-content">
                                <div style="margin-bottom: 15px;">
                                    <strong style="color: #2e7d32;">How it was fixed:</strong>
                                    <div style="margin-top: 5px; color: #1b5e20; font-size: 0.9em;">
                                        ${result.explanation}
                                    </div>
                                </div>
                                
                                <details style="margin-top: 15px;">
                                    <summary style="cursor: pointer; font-weight: 500; color: #1976d2;">View Content Changes</summary>
                                    <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-family: monospace; font-size: 0.9em;">
                                        <div style="color: #d32f2f; margin-bottom: 10px;"><strong>Before:</strong></div>
                                                                                 <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 4px;">
                                             ${result.originalContent}
                                         </div>
                                        <div style="color: #388e3c; margin-bottom: 10px;"><strong>After:</strong></div>
                                        <div style="padding: 10px; background: white; border-radius: 4px;">
                                            ${result.fixedContent}
                                        </div>
                                    </div>
                                </details>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        this.element!.addEventListener('click', async (e: Event) => {
            const target = e.target as HTMLElement;
            
            if (target.id === 'fix-parent-btn') {
                this.modalState = 'parent-loading';
                this.updateContent();
                await this.generateParentFix();
            } else if (target.id === 'fix-children-btn' && !target.hasAttribute('disabled')) {
                this.modalState = 'problem-selection';
                this.updateContent();
                this.setupProblemSelectionListeners();
            } else if (target.id === 'problem-back-btn') {
                this.modalState = 'choice';
                this.updateContent();
            } else if (target.id === 'problem-proceed-btn' && !target.hasAttribute('disabled')) {
                await this.selectProblemAndShowTruthSelection();
            } else if (target.id === 'truth-back-btn') {
                this.modalState = 'problem-selection';
                this.updateContent();
                this.setupProblemSelectionListeners();
            } else if (target.id === 'truth-proceed-btn' && !target.hasAttribute('disabled')) {
                await this.startChildFix();
            }
        });


    }

    /**
     * Setup truth selection specific listeners
     */
    private setupTruthSelectionListeners(): void {
        // Click on node option to select radio button
        this.element!.querySelectorAll('.node-option').forEach((option: Element) => {
            option.addEventListener('click', (e: Event) => {
                if (e.target !== option) return;
                const radio = option.querySelector('input[type="radio"]') as HTMLInputElement;
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            });
        });

        // Add radio button change listener for truth selection (re-attach after content update)
        this.element!.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.name === 'truth-node') {
                const proceedBtn = this.element!.querySelector('#truth-proceed-btn') as HTMLButtonElement;
                proceedBtn.disabled = false;
                
                // Update visual selection
                this.element!.querySelectorAll('.node-option').forEach(option => {
                    option.classList.remove('selected');
                });
                target.closest('.node-option')!.classList.add('selected');
            }
        });
    }

    /**
     * Update modal content
     */
    private updateContent(): void {
        const content = this.element!.querySelector('.modal-content') as HTMLElement;
        if (content) {
            content.innerHTML = this.renderModalContent();
        }
    }

    /**
     * Generate parent fix
     */
    private async generateParentFix(): Promise<void> {
        const todos = this.node.getIncompleteTodos();
        this.fixedResult = await this.logicOutlineService.generateFixedOutline(this.node, todos);
        
        this.modalState = 'parent-review';
        this.updateContent();
        this.setupParentReviewActions();
    }

    /**
     * Start child fix process
     */
    private async startChildFix(): Promise<void> {
        // Get selected truth node
        const selectedRadio = this.element!.querySelector('input[name="truth-node"]:checked') as HTMLInputElement;
        const truthNodeId = selectedRadio.value;
        this.truthNode = this.findNodeById(this.projectManager.rootNode, truthNodeId);
        
        this.modalState = 'child-loading';
        this.currentChildIndex = 0;
        this.childFixResults.clear();
        this.updateContent();
        
        await this.processChildFixes();
    }

    /**
     * Process child fixes one by one
     */
    private async processChildFixes(): Promise<void> {
        const nodesToFix = this.problemAffectedNodes.filter(node => node !== this.truthNode);
        const selectedTodoArray = [this.selectedTodo!];
        
        for (let i = 0; i < nodesToFix.length; i++) {
            this.currentChildIndex = i;
            this.updateContent();
            
            const nodeToFix = nodesToFix[i]!;
            const result = await this.logicChildService.generateFixedChild(nodeToFix, this.truthNode!, selectedTodoArray);
            this.childFixResults.set(nodeToFix.id, result);
        }
        
        this.modalState = 'child-review';
        this.updateContent();
        this.setupChildReviewActions();
    }

    /**
     * Setup parent review action buttons
     */
    private setupParentReviewActions(): void {
        const actionsHtml = `
            <div style="padding: 20px; border-top: 1px solid #ddd; display: flex; justify-content: flex-end; gap: 10px;">
                <button id="retry-parent-btn" class="btn btn-secondary">🔄 Retry</button>
                <button id="apply-parent-btn" class="btn btn-primary">✅ Apply Fix</button>
            </div>
        `;
        
        const modalBody = this.element!.querySelector('.modal-body') as HTMLElement;
        modalBody.insertAdjacentHTML('beforeend', actionsHtml);

        // Add event listeners for the newly added buttons
        const retryBtn = this.element!.querySelector('#retry-parent-btn') as HTMLButtonElement;
        const applyBtn = this.element!.querySelector('#apply-parent-btn') as HTMLButtonElement;
        
        retryBtn.addEventListener('click', async () => {
            this.modalState = 'parent-loading';
            this.updateContent();
            await this.generateParentFix();
        });
        
        applyBtn.addEventListener('click', async () => {
            await this.applyParentFix();
        });
    }

    /**
     * Setup child review action buttons
     */
    private setupChildReviewActions(): void {
        const actionsHtml = `
            <div style="padding: 20px; border-top: 1px solid #ddd; display: flex; justify-content: flex-end; gap: 10px;">
                <button id="retry-child-btn" class="btn btn-secondary">🔄 Retry</button>
                <button id="apply-child-btn" class="btn btn-primary">✅ Apply Fixes</button>
            </div>
        `;
        
        const modalBody = this.element!.querySelector('.modal-body') as HTMLElement;
        modalBody.insertAdjacentHTML('beforeend', actionsHtml);

        // Add event listeners for the newly added buttons
        const retryBtn = this.element!.querySelector('#retry-child-btn') as HTMLButtonElement;
        const applyBtn = this.element!.querySelector('#apply-child-btn') as HTMLButtonElement;
        
        retryBtn.addEventListener('click', async () => {
            this.modalState = 'child-loading';
            this.childFixResults.clear();
            this.updateContent();
            await this.processChildFixes();
        });
        
        applyBtn.addEventListener('click', async () => {
            await this.applyChildFixes();
        });
    }

    /**
     * Apply parent fix
     */
    private async applyParentFix(): Promise<void> {
        if (!this.fixedResult) return;

        // Update parent content
        this.node.setContent(this.fixedResult.fixedContent, 'master');

        // Delete child nodes and clear todos as before
        const directChildren = [...this.node.children];
        for (const child of directChildren) {
            this.projectManager.removeNode(child.id);
        }

        // Clear all todos from the node
        this.node.todos = [];

        // Notify other UI components about todo changes
        this.dispatchTodoListChangedEvent();

        // Save and refresh
        await this.projectManager.saveToStorage();
        
        // Import project-ui dynamically and refresh tree
        const { renderMultiProjectTree } = await import('../project-ui');
        renderMultiProjectTree();

        // Persistence is handled by saveToStorage above
        console.log('✅ Parent fix applied and saved');

        this.close();
    }

    /**
     * Apply child fixes
     */
    private async applyChildFixes(): Promise<void> {
        // Apply fixes for the specific problem
        for (const [nodeId, result] of this.childFixResults) {
            const node = this.findNodeById(this.projectManager.rootNode, nodeId);
            node.setContent(result.fixedContent, 'master');
        }

        // Remove only the selected todo from the parent node
        const todoIndex = this.node.todos.indexOf(this.selectedTodo!);
        if (todoIndex !== -1) {
            this.node.todos.splice(todoIndex, 1);
        }

        // Notify other UI components about todo changes
        this.dispatchTodoListChangedEvent();

        // Save and refresh
        await this.projectManager.saveToStorage();
        
        // Import project-ui dynamically and refresh tree
        const { renderMultiProjectTree } = await import('../project-ui');
        renderMultiProjectTree();

        console.log('✅ Child fixes applied and saved for problem: ' + this.selectedTodo!.description);

        // Check if there are more problems to fix
        const remainingTodos = this.node.getIncompleteTodos();
        if (remainingTodos.length > 0) {
            // Return to problem selection for next problem
            this.modalState = 'problem-selection';
            this.selectedTodo = null;
            this.problemAffectedNodes = [];
            this.childFixResults.clear();
            this.updateContent();
            this.setupProblemSelectionListeners();
        } else {
            // All problems fixed, close modal
            this.close();
        }
    }

    /**
     * Setup problem selection listeners
     */
    private setupProblemSelectionListeners(): void {
        // Click on problem option to select radio button
        this.element!.querySelectorAll('.problem-option').forEach((option: Element) => {
            option.addEventListener('click', (e: Event) => {
                if (e.target !== option) return;
                const radio = option.querySelector('input[type="radio"]') as HTMLInputElement;
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            });
        });

        // Add radio button change listener for problem selection
        this.element!.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.name === 'selected-problem') {
                const proceedBtn = this.element!.querySelector('#problem-proceed-btn') as HTMLButtonElement;
                proceedBtn.disabled = false;
                
                // Update visual selection
                this.element!.querySelectorAll('.problem-option').forEach(option => {
                    option.classList.remove('selected');
                });
                target.closest('.problem-option')!.classList.add('selected');
            }
        });
    }

    /**
     * Select the chosen problem and show truth selection
     */
    private async selectProblemAndShowTruthSelection(): Promise<void> {
        const selectedRadio = this.element!.querySelector('input[name="selected-problem"]:checked') as HTMLInputElement;
        const problemIndex = parseInt(selectedRadio.value);
        const todos = this.node.getIncompleteTodos();
        
        this.selectedTodo = todos[problemIndex]!;
        
        // Build list of nodes affected by this specific problem
        this.problemAffectedNodes = [];
        if (this.selectedTodo.relatedNodes) {
            for (const nodeRef of this.selectedTodo.relatedNodes) {
                if (nodeRef.id !== 'unknown') {
                    const node = this.findNodeById(this.projectManager.rootNode, nodeRef.id);
                    this.problemAffectedNodes.push(node);
                }
            }
        }
        
        this.modalState = 'truth-selection';
        this.updateContent();
        this.setupTruthSelectionListeners();
    }

    /**
     * Dispatch todoListChanged event to notify other UI components
     */
    private dispatchTodoListChangedEvent(): void {
        try {
            const event = new CustomEvent('todoListChanged', {
                detail: { nodeId: this.node.id }
            });
            window.dispatchEvent(event);
        } catch (error) {
            console.warn('Could not notify about todo changes:', error);
        }
    }
} 