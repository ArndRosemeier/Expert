import { BaseModal } from './core/BaseModal';
import { addEventListenerWithCleanup } from './core/modal-utils';
import { getContextItems, formatContextItems } from '../../ContextFormat';
import { DocumentNode } from '../../DocumentNode';
import { PromptManager } from '../../PromptManager';

interface ContextItemInfo {
    text: string;
    index: number; // 1-based index in original context
    originalIndex: number; // 0-based index in this.contextItems array, or -1 for parent items
    category: 'missing-from-child' | 'only-in-child' | 'common' | 'normal';
    isParentItem?: boolean; // true if this item is from parent only
}

export class ContextItemsEditorModal extends BaseModal {
    private node: DocumentNode;
    private contextItems: string[] = [];
    private isDirty = false;
    private isTransforming = false;
    private compareWithParent: boolean = false;
    private parentNode: DocumentNode | null = null;
    private originalValues = new Map<number, string>(); // Track original values for propagation

    constructor(node: DocumentNode) {
        super({
            id: 'context-items-editor-modal',
            title: 'Edit Context Items',
            // Make the modal significantly bigger
            maxWidth: '95vw',
            maxHeight: '95vh',
            width: '1200px',
            height: '800px'
        });
        this.node = node;
        this.contextItems = getContextItems(node.context || '');
        
        // Find parent node for comparison (async initialization)
        void this.findParentNode();
    }

    /**
     * Find the parent node for comparison
     */
    private async findParentNode(): Promise<void> {
        if (!this.node.parentId) {
            this.parentNode = null;
            return;
        }

        try {
            const { getActiveProject } = await import('../../state');
            const projectManager = getActiveProject()!;
            const { TreeService } = await import('../../project/TreeService');
            const treeService = new TreeService();
            this.parentNode = treeService.findParentNode(this.node.id, projectManager.rootNode);
            
            // Re-render if modal is already open and parent was found
            if (this.parentNode && this.element) {
                const modalBody = this.element.querySelector('.modal-body');
                if (modalBody) {
                    modalBody.innerHTML = this.render().innerHTML;
                    this.setupEventHandlers();
                }
            }
        } catch (error) {
            console.warn('Failed to find parent node:', error);
            this.parentNode = null;
        }
    }

    public render(): HTMLElement {
        const content = document.createElement('div');
        content.className = 'modal-body';
        content.innerHTML = `
            <style>
                .context-items-editor {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .context-items-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem;
                    background-color: #f8f9fa;
                    border-radius: 6px;
                    border-left: 4px solid #007cba;
                }
                .context-items-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    max-height: 500px;
                    overflow-y: auto;
                    padding: 0.5rem;
                    border: 1px solid #e9ecef;
                    border-radius: 8px;
                    background: white;
                }
                .context-item {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    padding: 1rem;
                    background-color: #f8f9fa;
                    border-radius: 6px;
                    border: 1px solid #dee2e6;
                }
                .context-item-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .context-item-number {
                    font-weight: bold;
                    color: #007cba;
                }
                .context-item-actions {
                    display: flex;
                    gap: 0.5rem;
                }
                .context-item-textarea {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-family: inherit;
                    font-size: 14px;
                    line-height: 1.5;
                    resize: vertical;
                    overflow: hidden;
                    min-height: 2.5rem;
                }
                .context-item-textarea:focus {
                    outline: none;
                    border-color: #007cba;
                    box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.1);
                }
                .btn-small {
                    padding: 0.25rem 0.5rem;
                    font-size: 0.875rem;
                    border-radius: 4px;
                    border: none;
                    cursor: pointer;
                    font-weight: 500;
                }
                .btn-danger {
                    background-color: #dc3545;
                    color: white;
                }
                .btn-danger:hover {
                    background-color: #c82333;
                }
                .btn-success {
                    background-color: #28a745;
                    color: white;
                }
                .btn-success:hover {
                    background-color: #218838;
                }
                .btn-warning {
                    background-color: #ffc107;
                    color: #212529;
                }
                .btn-warning:hover {
                    background-color: #e0a800;
                }
                .btn-info {
                    background-color: #17a2b8;
                    color: white;
                }
                .btn-info:hover {
                    background-color: #138496;
                }
                .empty-state {
                    text-align: center;
                    padding: 2rem;
                    color: #6c757d;
                    font-style: italic;
                }
                .modal-actions {
                    margin-top: 1.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: 1rem;
                    border-top: 1px solid #dee2e6;
                }
                .modal-actions-left {
                    display: flex;
                    gap: 0.5rem;
                }
                .modal-actions-right {
                    display: flex;
                    gap: 0.5rem;
                }
                .error-message {
                    color: #dc3545;
                    font-size: 0.875rem;
                    margin-top: 0.25rem;
                }
                .btn-transform {
                    background-color: #6f42c1;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 0.5rem 1rem;
                    font-size: 0.875rem;
                    cursor: pointer;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .btn-transform:hover {
                    background-color: #5a37a7;
                }
                .btn-transform:disabled {
                    background-color: #6c757d;
                    cursor: not-allowed;
                }
                .transform-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #ffffff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
            <div class="context-items-editor">
                <div class="context-items-header">
                    <div>
                        <h4 style="margin: 0;">Context Items</h4>
                        <p style="margin: 0; color: #6c757d; font-size: 0.875rem;">Each paragraph is a separate context item. Edit items individually below.</p>
                    </div>
                    <div>
                        <span style="font-weight: bold; color: #007cba;">${this.getItemCountText()}</span>
                    </div>
                </div>
                
                ${this.renderParentComparisonSection()}
                
                <div class="context-items-list" id="context-items-list">
                    ${this.renderContextItems()}
                </div>
                
                <div class="modal-actions">
                    <div class="modal-actions-left">
                        <button type="button" class="btn-success btn-small" data-action="add-item" ${this.isTransforming ? 'disabled' : ''}>
                            ➕ Add Item
                        </button>
                        <button type="button" class="btn-transform" data-action="transform" ${this.isTransforming ? 'disabled' : ''} title="Transforms unstructured context into the supported paragraph format">
                            ${this.isTransforming ? '<div class="transform-spinner"></div> Transforming...' : '🔄 Transform Context'}
                        </button>
                    </div>
                    <div class="modal-actions-right">
                        <button type="button" class="button button-secondary" data-action="cancel" ${this.isTransforming ? 'disabled' : ''}>
                            Cancel
                        </button>
                        <button type="button" class="button button-primary" data-action="save" ${this.isTransforming ? 'disabled' : ''}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;

        return content;
    }

    private renderParentComparisonSection(): string {
        if (!this.parentNode) {
            return '';
        }

        return `
            <div class="parent-comparison-section" style="
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 1rem;
            ">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input 
                        type="checkbox" 
                        id="compare-with-parent-checkbox" 
                        ${this.compareWithParent ? 'checked' : ''}
                        style="
                            margin: 0;
                            transform: scale(1.2);
                        "
                    />
                    <label for="compare-with-parent-checkbox" style="
                        font-weight: 500;
                        color: #495057;
                        margin: 0;
                        cursor: pointer;
                    ">
                        📊 Compare with Parent Context
                    </label>
                </div>
                <p style="
                    margin: 0.5rem 0 0 1.8rem;
                    color: #6c757d;
                    font-size: 0.9rem;
                    line-height: 1.4;
                ">
                    Show items missing from child, items only in child, and highlight differences. Parent items are read-only.
                </p>
            </div>
        `;
    }

    private getItemCountText(): string {
        if (this.compareWithParent && this.parentNode) {
            const organizedItems = this.getOrganizedContextItems();
            const missingCount = organizedItems.filter(item => item.category === 'missing-from-child').length;
            const onlyInChildCount = organizedItems.filter(item => item.category === 'only-in-child').length;
            const commonCount = organizedItems.filter(item => item.category === 'common').length;
            
            return `${missingCount} missing, ${onlyInChildCount} only in child, ${commonCount} common`;
        } else {
            return `${this.contextItems.length} items`;
        }
    }

    private getOrganizedContextItems(): ContextItemInfo[] {
        const items: ContextItemInfo[] = [];

        if (this.compareWithParent && this.parentNode) {
            const parentItems = getContextItems(this.parentNode.context || '');
            
            // Items missing from child (only in parent) - these come first and are read-only
            parentItems.forEach((parentItem, parentIndex) => {
                const isInChild = this.contextItems.some(childItem => 
                    childItem.trim() === parentItem.trim()
                );
                
                if (!isInChild) {
                    items.push({
                        text: parentItem,
                        index: parentIndex + 1, // 1-based
                        originalIndex: -1, // Parent items don't have an index in this.contextItems
                        category: 'missing-from-child',
                        isParentItem: true
                    });
                }
            });

            // Items only in child (not in parent)
            this.contextItems.forEach((childItem, childIndex) => {
                const isInParent = parentItems.some(parentItem => 
                    parentItem.trim() === childItem.trim()
                );
                
                if (!isInParent) {
                    items.push({
                        text: childItem,
                        index: childIndex + 1,
                        originalIndex: childIndex, // 0-based index in this.contextItems
                        category: 'only-in-child',
                        isParentItem: false
                    });
                }
            });

            // Common items
            this.contextItems.forEach((childItem, childIndex) => {
                const isInParent = parentItems.some(parentItem => 
                    parentItem.trim() === childItem.trim()
                );
                
                if (isInParent) {
                    items.push({
                        text: childItem,
                        index: childIndex + 1,
                        originalIndex: childIndex, // 0-based index in this.contextItems
                        category: 'common',
                        isParentItem: false
                    });
                }
            });
        } else {
            // Normal mode - just list all items
            this.contextItems.forEach((item, index) => {
                items.push({
                    text: item,
                    index: index + 1,
                    originalIndex: index, // 0-based index in this.contextItems
                    category: 'normal',
                    isParentItem: false
                });
            });
        }

        return items;
    }

    private renderContextItems(): string {
        const organizedItems = this.getOrganizedContextItems();
        
        if (organizedItems.length === 0) {
            return '<div class="empty-state">No context items yet. Add your first item to get started.</div>';
        }

        return organizedItems.map((item, displayIndex) => {
            // Get visual styling based on category
            let categoryStyle = '';
            let categoryLabel = '';
            let isReadOnly = false;

            switch (item.category) {
                case 'missing-from-child':
                    categoryStyle = 'background: #fff3cd; border-left: 4px solid #ffc107;';
                    categoryLabel = '⬇️ Missing from Child (only in parent)';
                    isReadOnly = true;
                    break;
                case 'only-in-child':
                    categoryStyle = 'background: #d1ecf1; border-left: 4px solid #17a2b8;';
                    categoryLabel = '⬆️ Only in Child (not in parent)';
                    break;
                case 'common':
                    categoryStyle = 'background: #d4edda; border-left: 4px solid #28a745;';
                    categoryLabel = '↔️ Common (in both)';
                    break;
                default:
                    categoryStyle = '';
                    categoryLabel = '';
            }

            return `
                <div class="context-item" data-index="${item.originalIndex}" data-display-index="${displayIndex}" style="${categoryStyle}">
                <div class="context-item-header">
                        <div>
                            <span class="context-item-number">Item #${item.index}</span>
                            ${categoryLabel ? `
                                <span style="
                                    font-size: 0.8rem;
                                    font-weight: 500;
                                    color: #495057;
                                    margin-left: 0.5rem;
                                ">${categoryLabel}</span>
                            ` : ''}
                        </div>
                        ${!isReadOnly ? `
                    <div class="context-item-actions">
                                <button type="button" class="btn-danger btn-small" data-action="remove-item" data-index="${item.originalIndex}" title="Remove this item from this node only">
                            🗑️ Remove
                        </button>
                                <button type="button" class="btn-info btn-small" data-action="propagate" data-index="${item.originalIndex}" title="Add this item to all versions of all descendant nodes that don't already have it">
                            ↗️ Propagate
                        </button>
                                <button type="button" class="btn-warning btn-small" data-action="remove-recursively" data-index="${item.originalIndex}" title="Remove this item from all versions of all descendant nodes that contain it">
                            🗑️ Remove Recursively
                        </button>
                    </div>
                        ` : `
                            <div class="context-item-actions">
                                <span style="
                                    font-size: 0.8rem;
                                    color: #6c757d;
                                    font-style: italic;
                                ">Read-only (from parent)</span>
                </div>
                        `}
            </div>
                    ${isReadOnly ? `
                        <div class="context-item-display" style="
                            padding: 0.75rem;
                            background: rgba(255,255,255,0.7);
                            border: 1px solid #e9ecef;
                            border-radius: 4px;
                            font-family: inherit;
                            font-size: 14px;
                            line-height: 1.5;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                        ">${item.text}</div>
                    ` : `
                        <textarea class="context-item-textarea" data-index="${item.originalIndex}" placeholder="Enter context item content...">${item.text}</textarea>
                        <div class="error-message" id="error-${item.originalIndex}" style="display: none;"></div>
                    `}
                </div>
            `;
        }).join('');
    }

    private refreshItemsList(): void {
        const listContainer = this.element?.querySelector('#context-items-list');
        if (listContainer) {
            listContainer.innerHTML = this.renderContextItems();
            this.setupItemEventHandlers();
            
            // Auto-resize all textareas after a short delay to ensure DOM is updated
            setTimeout(() => {
                const textareas = this.element?.querySelectorAll('.context-item-textarea');
                textareas?.forEach(textarea => {
                    this.autoResizeTextarea(textarea as HTMLTextAreaElement);
                });
            }, 10);
        }
        
        // Update item count
        const countSpan = this.element?.querySelector('.context-items-header span');
        if (countSpan) {
            countSpan.textContent = this.getItemCountText();
        }
    }

    private setupItemEventHandlers(): void {
        if (!this.element) return;

        // Add handlers for textarea changes
        const textareas = this.element.querySelectorAll('.context-item-textarea');
        textareas.forEach(textarea => {
            const textareaElement = textarea as HTMLTextAreaElement;
            
            // Auto-resize on load
            this.autoResizeTextarea(textareaElement);
            
            // Store original value when editing starts
            addEventListenerWithCleanup(
                textarea,
                'focus',
                (e) => {
                    this.handleItemFocus(e);
                },
                this.cleanupHandlers
            );
            
            addEventListenerWithCleanup(
                textarea,
                'blur',
                (e) => {
                    this.handleItemChange(e);
                },
                this.cleanupHandlers
            );
            
            // Keep input listener only for auto-resize to maintain good UX
            addEventListenerWithCleanup(
                textarea,
                'input',
                (e) => {
                    this.autoResizeTextarea(e.target as HTMLTextAreaElement);
                },
                this.cleanupHandlers
            );
        });

        // Add handlers for remove buttons
        const removeButtons = this.element.querySelectorAll('[data-action="remove-item"]');
        removeButtons.forEach(button => {
            addEventListenerWithCleanup(
                button,
                'click',
                (e) => this.handleRemoveItem(e),
                this.cleanupHandlers
            );
        });

        // Add handlers for propagate buttons
        const propagateButtons = this.element.querySelectorAll('[data-action="propagate"]');
        propagateButtons.forEach(button => {
            addEventListenerWithCleanup(
                button,
                'click',
                (e) => this.handlePropagateItem(e),
                this.cleanupHandlers
            );
        });

        // Add handlers for remove recursively buttons
        const removeRecursivelyButtons = this.element.querySelectorAll('[data-action="remove-recursively"]');
        removeRecursivelyButtons.forEach(button => {
            addEventListenerWithCleanup(
                button,
                'click',
                (e) => this.handleRemoveRecursivelyItem(e),
                this.cleanupHandlers
            );
        });
    }

    private autoResizeTextarea(textarea: HTMLTextAreaElement): void {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';
        
        // Set height to scrollHeight to fit content
        const newHeight = Math.max(textarea.scrollHeight, 40); // Minimum 40px height
        textarea.style.height = newHeight + 'px';
    }

    private handleItemFocus(e: Event): void {
        const textarea = e.target as HTMLTextAreaElement;
        const indexStr = textarea.dataset['index'];
        if (!indexStr) return;
        
        const index = parseInt(indexStr);
        
        // Safety check: don't track parent items or invalid indices
        if (index < 0 || index >= this.contextItems.length) {
            return;
        }
        
        const originalValue = this.contextItems[index];
        if (originalValue !== undefined) {
            // Store the original value before any edits
            this.originalValues.set(index, originalValue);
        }
    }

    private handleItemChange(e: Event): void {
        const textarea = e.target as HTMLTextAreaElement;
        const indexStr = textarea.dataset['index'];
        if (!indexStr) return;
        
        const index = parseInt(indexStr);
        const value = textarea.value;
        
        // Safety check: don't allow changes to parent items or invalid indices
        if (index < 0 || index >= this.contextItems.length) {
            console.warn('Invalid index for item change:', index);
            return;
        }
        
        // Check if the value contains paragraph breaks (double newlines)
        const hasMultipleParagraphs = value.includes('\n\n');
        const errorElement = this.element?.querySelector(`#error-${index}`) as HTMLElement;
        
        if (hasMultipleParagraphs) {
            if (errorElement) {
                errorElement.textContent = 'Context items cannot contain multiple paragraphs. Please use single paragraphs only.';
                errorElement.style.display = 'block';
            }
            textarea.style.borderColor = '#dc3545';
            return;
        } else {
            if (errorElement) {
                errorElement.style.display = 'none';
            }
            textarea.style.borderColor = '#ddd';
        }

        // Update the item if valid
        this.contextItems[index] = value;
        this.isDirty = true;
        
        // Check for propagation to descendants
        this.checkAndOfferPropagation(index, value);
        
        // Immediately update the node context
        this.updateNodeContext();
    }

    private handleRemoveItem(e: Event): void {
        const button = e.target as HTMLButtonElement;
        const indexStr = button.dataset['index'];
        if (!indexStr) return;
        
        const index = parseInt(indexStr);
        
        // Safety check: don't allow removal of parent items or invalid indices
        if (index < 0 || index >= this.contextItems.length) {
            console.warn('Invalid index for item removal:', index);
            return;
        }
        
        if (confirm('Are you sure you want to remove this context item?')) {
            // Remove the item from the local array
            this.contextItems.splice(index, 1);
            this.isDirty = true;
            
            // Immediately update the node context
            this.updateNodeContext();
            
            // Refresh the visual display
            this.refreshItemsList();
        }
    }

    private handlePropagateItem(e: Event): void {
        const button = e.target as HTMLButtonElement;
        const indexStr = button.dataset['index'];
        if (!indexStr) return;
        
        const index = parseInt(indexStr);
        
        // Safety check: don't allow propagation of parent items or invalid indices
        if (index < 0 || index >= this.contextItems.length) {
            console.warn('Invalid index for item propagation:', index);
            return;
        }
        
        const itemToPropagateText = this.contextItems[index];
        
        if (!itemToPropagateText || !itemToPropagateText.trim()) {
            alert('Cannot propagate empty context item.');
            return;
        }

        // Confirm action
        if (!confirm(`Are you sure you want to propagate this context item to all versions of all descendant nodes?\n\nThis will add the item to every version of every subnode that doesn't already have it.\n\nItem: "${itemToPropagateText.substring(0, 100)}${itemToPropagateText.length > 100 ? '...' : ''}"`)) {
            return;
        }

        // Propagate to all descendants
        const propagatedCount = this.propagateItemToDescendants(itemToPropagateText.trim());
        
        if (propagatedCount > 0) {
            alert(`Context item propagated to all versions of ${propagatedCount} descendant node(s).`);
        } else {
            alert('No descendant nodes found to propagate to.');
        }
    }

    private handleRemoveRecursivelyItem(e: Event): void {
        const button = e.target as HTMLButtonElement;
        const indexStr = button.dataset['index'];
        if (!indexStr) return;
        
        const index = parseInt(indexStr);
        
        // Safety check: don't allow removal of parent items or invalid indices
        if (index < 0 || index >= this.contextItems.length) {
            console.warn('Invalid index for recursive item removal:', index);
            return;
        }
        
        const itemToRemoveText = this.contextItems[index];
        
        if (!itemToRemoveText || !itemToRemoveText.trim()) {
            alert('Cannot remove empty context item.');
            return;
        }

        // Confirm action
        if (!confirm(`Are you sure you want to remove this context item from this node and all versions of all descendant nodes?\n\nThis will remove the item from this node and from every version of every subnode that contains it.\n\nItem: "${itemToRemoveText.substring(0, 100)}${itemToRemoveText.length > 100 ? '...' : ''}"`)) {
            return;
        }

        // Remove from all descendants
        const removedCount = this.removeItemFromDescendants(itemToRemoveText.trim());
        
        // Also remove from the current node
        this.contextItems.splice(index, 1);
        this.isDirty = true;
        
        // Immediately update the current node's context
        this.updateNodeContext();
        
        // Refresh the visual display
        this.refreshItemsList();
        
        if (removedCount > 0) {
            alert(`Context item removed from this node and all versions of ${removedCount} descendant node(s).`);
        } else {
            alert('Context item removed from this node. No descendant nodes found with this context item.');
        }
    }

    private propagateItemToDescendants(itemText: string): number {
        let propagatedCount = 0;
        
        // Recursively traverse all descendants
        const propagateRecursively = (node: DocumentNode) => {
            for (const child of node.children) {
                // Get all versions of the child node
                const allVersions = child.getAllVersions();
                let childUpdated = false;
                
                for (const version of allVersions) {
                    // Get current context items from this version
                    const versionContextItems = getContextItems(version.context || '');
                    
                    // Check if this item is already present (case-insensitive and trimmed comparison)
                    const normalizedItemText = itemText.toLowerCase().trim();
                    const alreadyPresent = versionContextItems.some(existingItem => 
                        existingItem.toLowerCase().trim() === normalizedItemText
                    );
                    
                    if (!alreadyPresent) {
                        // Add the item to this version's context
                        const updatedItems = [...versionContextItems, itemText];
                        const newContext = formatContextItems(updatedItems);
                        
                        // Create a new version with updated context instead of mutating existing version
                        const newVersionId = child.addVersion(
                            [...version.tags, 'context_propagated'].filter(tag => tag !== 'master'), // Remove master tag temporarily
                            {
                                content: version.content,
                                title: version.title,
                                context: newContext
                            },
                            { ...version.metadata },
                            version.ratings ? [...version.ratings] : undefined
                        );
                        
                        // If this was the master version, promote the new version to master
                        if (version.tags.has('master') && newVersionId) {
                            child.promoteToMaster(newVersionId, ['context_propagated']);
                        }
                        
                        childUpdated = true;
                    }
                }
                
                // Count this child as updated if any of its versions were updated
                if (childUpdated) {
                    propagatedCount++;
                }
                
                // Continue recursively to grandchildren
                propagateRecursively(child);
            }
        };
        
        propagateRecursively(this.node);
        
        // Save the project after propagation
        if (propagatedCount > 0) {
            void import('../../state').then(({ getActiveProject }) => {
                const project = getActiveProject();
                if (project) {
                    void project.saveToStorage();
                }
            });
        }
        
        return propagatedCount;
    }

    private removeItemFromDescendants(itemText: string): number {
        let removedCount = 0;
        
        // Recursively traverse all descendants
        const removeRecursively = (node: DocumentNode) => {
            for (const child of node.children) {
                // Get all versions of the child node
                const allVersions = child.getAllVersions();
                let childUpdated = false;
                
                for (const version of allVersions) {
                    // Get current context items from this version
                    const versionContextItems = getContextItems(version.context || '');
                    
                    // Filter out the item to remove (case-insensitive and trimmed comparison)
                    const normalizedItemText = itemText.toLowerCase().trim();
                    const filteredItems = versionContextItems.filter(existingItem => 
                        existingItem.toLowerCase().trim() !== normalizedItemText
                    );
                    
                    // If items were removed from this version, update it
                    if (filteredItems.length < versionContextItems.length) {
                        const newContext = formatContextItems(filteredItems);
                        
                        // Create a new version with updated context instead of mutating existing version
                        const newVersionId = child.addVersion(
                            [...version.tags, 'context_removed'].filter(tag => tag !== 'master'), // Remove master tag temporarily
                            {
                                content: version.content,
                                title: version.title,
                                context: newContext
                            },
                            { ...version.metadata },
                            version.ratings ? [...version.ratings] : undefined
                        );
                        
                        // If this was the master version, promote the new version to master
                        if (version.tags.has('master') && newVersionId) {
                            child.promoteToMaster(newVersionId, ['context_removed']);
                        }
                        
                        childUpdated = true;
                    }
                }
                
                // Count this child as updated if any of its versions were updated
                if (childUpdated) {
                    removedCount++;
                }
                
                // Continue recursively to grandchildren
                removeRecursively(child);
            }
        };
        
        removeRecursively(this.node);
        
        // Save the project after removal
        if (removedCount > 0) {
            void import('../../state').then(({ getActiveProject }) => {
                const project = getActiveProject();
                if (project) {
                    void project.saveToStorage();
                }
            });
        }
        
        return removedCount;
    }

    private handleAddItem(): void {
        this.contextItems.push('');
        this.isDirty = true;
        this.refreshItemsList();
        
        // Focus on the new item and ensure it's auto-resized
        setTimeout(() => {
            const newTextarea = this.element?.querySelector(`.context-item-textarea[data-index="${this.contextItems.length - 1}"]`) as HTMLTextAreaElement;
            if (newTextarea) {
                this.autoResizeTextarea(newTextarea);
                newTextarea.focus();
            }
        }, 50);
    }

    private async handleTransformContext(): Promise<void> {
        if (this.isTransforming) return;

        // Get the current context as a single string
        const currentContext = this.node.context || '';
        
        // If context is empty, show message
        if (!currentContext.trim()) {
            alert('No context to transform. Please add some context first.');
            return;
        }

        // Confirm transformation
        if (!confirm('This will transform the current context into properly formatted context items. Any unsaved changes will be lost. Continue?')) {
            return;
        }

        this.isTransforming = true;
        this.isDirty = false;

        try {
            // Re-render to show loading state
            const modalBody = this.element?.querySelector('.modal-body');
            if (modalBody) {
                modalBody.innerHTML = this.render().innerHTML;
                this.setupEventHandlers();
            }

            // Get the editor model settings
            const { SettingsManager } = await import('../../SettingsManager');
            const settings = await SettingsManager.getInstance();
            const profile = settings.getLastUsedProfile();
            const language = settings.getLanguage();

            if (!profile || !profile.selectedModels || !profile.selectedModels['editor']) {
                throw new Error('Editor model not configured. Please configure it in the settings.');
            }

            // Get the transformation prompt
            const promptManager = new PromptManager(document.body, () => {}, settings);
            const prompts = promptManager.getPrompts();
            const transformPrompt = prompts.context_transformation
                .replace('{{original_context}}', currentContext)
                .replace('{{language}}', language);

            // Call the AI model
            const { OpenRouterClient } = await import('../../OpenRouterClient');
            const client = OpenRouterClient.getInstance();
            
            const response = await client.chat('editor', transformPrompt);
            
            if (response && response.trim()) {
                // Parse the transformed context into items
                this.contextItems = getContextItems(response);
                this.isDirty = true;
            } else {
                alert('Failed to transform context. Please try again.');
            }

        } catch (error) {
            console.error('Error transforming context:', error);
            alert('An error occurred while transforming context. Please try again.');
        } finally {
            this.isTransforming = false;
            
            // Re-render to show normal state
            const modalBody = this.element?.querySelector('.modal-body');
            if (modalBody) {
                modalBody.innerHTML = this.render().innerHTML;
                this.setupEventHandlers();
                
                // Auto-resize all textareas after transformation
                setTimeout(() => {
                    const textareas = this.element?.querySelectorAll('.context-item-textarea');
                    textareas?.forEach(textarea => {
                        this.autoResizeTextarea(textarea as HTMLTextAreaElement);
                    });
                }, 10);
            }
        }
    }

    /**
     * Check if edit should propagate to descendants and offer user the choice
     */
    private checkAndOfferPropagation(index: number, newValue: string): void {
        // Get the original value that was stored when editing started
        const originalValue = this.originalValues.get(index);
        if (!originalValue || originalValue === newValue) {
            return; // No change or no original value tracked
        }
        
        // Find all descendant nodes that have the same original context item
        const descendantsWithOriginal = this.findDescendantsWithContextItem(originalValue);
        
        if (descendantsWithOriginal.length === 0) {
            return; // No descendants to propagate to
        }
        
        // Ask user if they want to propagate the change
        const confirmMessage = `Found ${descendantsWithOriginal.length} descendant node(s) with the same context item.\n\nDo you want to propagate this edit to all descendant nodes?\n\nOriginal: "${originalValue.substring(0, 100)}${originalValue.length > 100 ? '...' : ''}"\nEdited: "${newValue.substring(0, 100)}${newValue.length > 100 ? '...' : ''}"`;
        
        if (confirm(confirmMessage)) {
            // Propagate the change to all descendants
            const updatedCount = this.propagateContextItemChange(originalValue, newValue, descendantsWithOriginal);
            
            if (updatedCount > 0) {
                alert(`Context item updated in ${updatedCount} descendant node(s).`);
            }
        }
        
        // Clear the original value since we've processed this edit
        this.originalValues.delete(index);
    }

    /**
     * Find all descendant nodes that contain the specified context item
     */
    private findDescendantsWithContextItem(contextItem: string): DocumentNode[] {
        const results: DocumentNode[] = [];
        const trimmedItem = contextItem.trim();
        
        const searchRecursively = (node: DocumentNode) => {
            for (const child of node.children) {
                // Check if this child has the context item
                if (child.context) {
                    const childContextItems = getContextItems(child.context);
                    if (childContextItems.some(item => item.trim() === trimmedItem)) {
                        results.push(child);
                    }
                }
                
                // Recursively search in grandchildren
                searchRecursively(child);
            }
        };
        
        searchRecursively(this.node);
        return results;
    }

    /**
     * Propagate context item change to specified descendant nodes
     */
    private propagateContextItemChange(originalValue: string, newValue: string, descendants: DocumentNode[]): number {
        let updatedCount = 0;
        const trimmedOriginal = originalValue.trim();
        
        for (const descendant of descendants) {
            if (!descendant.context) continue;
            
            const contextItems = getContextItems(descendant.context);
            let hasChanged = false;
            
            // Replace matching context items
            const updatedItems = contextItems.map(item => {
                if (item.trim() === trimmedOriginal) {
                    hasChanged = true;
                    return newValue; // Use the exact new value (with original formatting)
                }
                return item;
            });
            
            if (hasChanged) {
                // Update the node's context
                const newContext = formatContextItems(updatedItems);
                descendant.setContextWithTags(newContext, ['edited', 'context_edited', 'context_propagated']);
                updatedCount++;
            }
        }
        
        // Save changes to storage
        void import('../../state').then(({ getActiveProject }) => {
            const project = getActiveProject();
            if (project) {
                void project.saveToStorage();
            }
        });
        
        return updatedCount;
    }

    /**
     * Updates the node's context with the current contextItems array
     */
    private updateNodeContext(): void {
        // Filter out empty items
        const validItems = this.contextItems.filter(item => item.trim().length > 0);
        
        // Create new context from items
        const newContext = formatContextItems(validItems);
        
        // Update the node context
        this.node.setContextWithTags(newContext, ['edited', 'context_edited']);
        
        // Update the context textarea in the main UI
        const contextTextArea = document.getElementById('node-context') as HTMLTextAreaElement;
        if (contextTextArea) {
            contextTextArea.value = newContext;
        }
        
        // Update the context items count display in main UI
        const contextLabel = document.querySelector('label[for="node-context"]');
        if (contextLabel) {
            const contextInfoSpan = contextLabel.parentElement?.querySelector('span');
            if (contextInfoSpan) {
                void import('../../ContextFormat').then(({ getContextInfoText }) => {
                    contextInfoSpan.textContent = getContextInfoText(newContext);
                });
            }
        }
        
        // Save the project to storage
        void import('../../state').then(({ getActiveProject }) => {
            const project = getActiveProject();
            if (project) {
                void project.saveToStorage();
            }
        });
    }

    private validateAndSave(): boolean {
        // Check for multiple paragraphs in any item
        for (let i = 0; i < this.contextItems.length; i++) {
            const item = this.contextItems[i];
            if (item && item.includes('\n\n')) {
                alert(`Context item ${i + 1} contains multiple paragraphs. Please use single paragraphs only.`);
                return false;
            }
        }

        // Update the node context (this also handles filtering empty items)
        this.updateNodeContext();
        
        return true;
    }

    /**
     * Override setupEventHandlers to add custom button handling
     */
    protected override setupEventHandlers(): void {
        // Call parent setup first
        super.setupEventHandlers();

        if (this.element) {
            // Parent comparison checkbox
            const compareCheckbox = this.element.querySelector('#compare-with-parent-checkbox') as HTMLInputElement;
            if (compareCheckbox) {
                addEventListenerWithCleanup(
                    compareCheckbox,
                    'change',
                    () => {
                        this.compareWithParent = compareCheckbox.checked;
                        this.refreshItemsList();
                    },
                    this.cleanupHandlers
                );
            }
            // Add item button
            const addButton = this.element.querySelector('[data-action="add-item"]');
            if (addButton) {
                addEventListenerWithCleanup(
                    addButton,
                    'click',
                    () => this.handleAddItem(),
                    this.cleanupHandlers
                );
            }

            // Cancel button
            const cancelButton = this.element.querySelector('[data-action="cancel"]');
            if (cancelButton) {
                addEventListenerWithCleanup(
                    cancelButton,
                    'click',
                    () => {
                        if (this.isDirty && !confirm('You have unsaved changes. Are you sure you want to cancel?')) {
                            return;
                        }
                        void this.close();
                    },
                    this.cleanupHandlers
                );
            }

            // Save button
            const saveButton = this.element.querySelector('[data-action="save"]');
            if (saveButton) {
                addEventListenerWithCleanup(
                    saveButton,
                    'click',
                    () => {
                        if (this.validateAndSave()) {
                            void this.close();
                        }
                    },
                    this.cleanupHandlers
                );
            }

            // Transform button
            const transformButton = this.element.querySelector('[data-action="transform"]');
            if (transformButton) {
                addEventListenerWithCleanup(
                    transformButton,
                    'click',
                    () => {
                        void this.handleTransformContext();
                    },
                    this.cleanupHandlers
                );
            }

            // Setup item-specific event handlers
            this.setupItemEventHandlers();
            
            // Auto-resize all textareas after initial setup
            setTimeout(() => {
                const textareas = this.element?.querySelectorAll('.context-item-textarea');
                textareas?.forEach(textarea => {
                    this.autoResizeTextarea(textarea as HTMLTextAreaElement);
                });
            }, 10);
        }
    }
}

// Export the old name for backwards compatibility
export const ContextInfoModal = ContextItemsEditorModal; 