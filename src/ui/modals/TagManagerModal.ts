import { DocumentNode } from '../../DocumentNode';
import { SelectableNodeTree } from '../components/SelectableNodeTree';
import { BaseModal } from './core/BaseModal';
import { analyzeTagsInHierarchy, VersionInfo } from '../../ProjectUtils';

interface TagManagerModalOptions {
    onClose?: () => void;
}

interface TagNodeMapping {
    [tagName: string]: DocumentNode[];
}

/**
 * TagManagerModal: Manage tags across node hierarchies with bulk operations
 * Features:
 * - Read-only tree view of node hierarchy
 * - Tag-based node selection
 * - Bulk tag operations: add, remove, promote, copy
 */
export class TagManagerModal extends BaseModal {
    private rootNode: DocumentNode;
    private options: TagManagerModalOptions;
    private tree: SelectableNodeTree;
    private leftPanel: HTMLElement;
    private rightPanel: HTMLElement;
    private tagListContainer: HTMLElement;
    private actionsContainer: HTMLElement;
    private selectedTag: string | null = null;
    private tagToNodesMap: TagNodeMapping = {};
    private tagToVersionsMap: { [tagName: string]: VersionInfo[] } = {};

    constructor(rootNode: DocumentNode, options?: TagManagerModalOptions) {
        super({
            id: `tag-manager-${rootNode.id}`,
            title: 'Tag Manager',
            closable: true,
            backdrop: true
        }, options?.onClose ? {
            onClose: async () => options.onClose!()
        } : {});
        this.rootNode = rootNode;
        this.options = options || {};
        this.tree = new SelectableNodeTree(rootNode, document.createElement('div'));
        this.leftPanel = document.createElement('div');
        this.rightPanel = document.createElement('div');
        this.tagListContainer = document.createElement('div');
        this.actionsContainer = document.createElement('div');
        
        this.initializeTagMappings();
    }

    protected override buildContentStyle(): string {
        return `
            /* Make tree checkboxes read-only */
            .selectable-node-tree input[type="checkbox"] {
                pointer-events: none !important;
                opacity: 0.6 !important;
            }
            
            .tree-node.tag-selected {
                background: #eff6ff !important;
                border-left: 3px solid #3b82f6 !important;
            }
        `;
    }

    public render(): HTMLElement {
        const container = document.createElement('div');
        
        // Layout: two panels, set container height with proper constraints
        container.style.display = 'flex';
        container.style.flexDirection = 'row';
        container.style.gap = '0';
        container.style.alignItems = 'stretch';
        container.style.justifyContent = 'stretch';
        container.style.boxSizing = 'border-box';
        container.style.height = '90vh';
        container.style.maxHeight = '90vh';
        container.style.overflow = 'hidden';

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
        this.leftPanel.style.minHeight = '0';

        // Tree header
        const treeHeader = document.createElement('div');
        treeHeader.style.padding = '1rem 1.5rem';
        treeHeader.style.background = '#f9fafb';
        treeHeader.style.borderBottom = '1px solid #e5e7eb';
        treeHeader.style.fontWeight = '600';
        treeHeader.style.color = '#374151';
        treeHeader.style.fontSize = '0.875rem';
        treeHeader.textContent = 'Node Hierarchy (Read-Only)';
        this.leftPanel.appendChild(treeHeader);

        // Tree content
        this.setupTree();
        this.tree.render();
        const treeContainer = this.tree['container'];
        treeContainer.style.flex = '1 1 0%';
        treeContainer.style.overflowY = 'auto';
        treeContainer.style.background = '#fff';
        treeContainer.style.minHeight = '0';
        treeContainer.style.padding = '1rem';
        this.leftPanel.appendChild(treeContainer);

        // Add highlight style for tag selected nodes
        const highlightStyle = document.createElement('style');
        highlightStyle.textContent = `
            .tree-node.tag-selected {
                background: #eff6ff !important;
                border-left: 4px solid #3b82f6 !important;
                box-shadow: 0 0 0 2px #bae6fd;
            }
        `;
        this.leftPanel.appendChild(highlightStyle);

        // --- Right Panel: Tags and Actions ---
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

        // Header section
        const headerSection = document.createElement('div');
        headerSection.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        headerSection.style.color = 'white';
        headerSection.style.padding = '1.5em';
        headerSection.style.borderRadius = '0.75em';
        headerSection.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        headerSection.style.marginBottom = '2em';

        const headerTitle = document.createElement('h2');
        headerTitle.textContent = 'Tag Manager';
        headerTitle.style.margin = '0 0 0.5em 0';
        headerTitle.style.fontSize = '1.5em';
        headerTitle.style.fontWeight = '700';
        headerSection.appendChild(headerTitle);

        const headerDesc = document.createElement('p');
        headerDesc.textContent = `Manage tags across "${this.rootNode.title}" and all its descendants`;
        headerDesc.style.margin = '0';
        headerDesc.style.fontSize = '1em';
        headerDesc.style.opacity = '0.9';
        headerSection.appendChild(headerDesc);

        this.rightPanel.appendChild(headerSection);

        // Tags section
        const tagsSection = document.createElement('div');
        tagsSection.style.background = '#f8fafc';
        tagsSection.style.padding = '1.5em';
        tagsSection.style.borderRadius = '0.75em';
        tagsSection.style.border = '1px solid #e2e8f0';
        tagsSection.style.marginBottom = '2em';
        tagsSection.style.flex = '1 1 0%';
        tagsSection.style.display = 'flex';
        tagsSection.style.flexDirection = 'column';
        tagsSection.style.minHeight = '0';

        const tagsTitle = document.createElement('h3');
        tagsTitle.textContent = 'Available Tags';
        tagsTitle.style.margin = '0 0 1em 0';
        tagsTitle.style.fontSize = '1.1em';
        tagsTitle.style.fontWeight = '600';
        tagsTitle.style.color = '#374151';
        tagsSection.appendChild(tagsTitle);

        this.tagListContainer = document.createElement('div');
        this.tagListContainer.style.flex = '1 1 0%';
        this.tagListContainer.style.overflowY = 'auto';
        this.tagListContainer.style.minHeight = '0';
        this.renderTagList();
        tagsSection.appendChild(this.tagListContainer);

        this.rightPanel.appendChild(tagsSection);

        // Actions section
        const actionsSection = document.createElement('div');
        actionsSection.style.background = '#f8fafc';
        actionsSection.style.padding = '1.5em';
        actionsSection.style.borderRadius = '0.75em';
        actionsSection.style.border = '1px solid #e2e8f0';
        actionsSection.style.flex = '0 0 auto';

        const actionsTitle = document.createElement('h3');
        actionsTitle.textContent = 'Tag Operations';
        actionsTitle.style.margin = '0 0 1em 0';
        actionsTitle.style.fontSize = '1.1em';
        actionsTitle.style.fontWeight = '600';
        actionsTitle.style.color = '#374151';
        actionsSection.appendChild(actionsTitle);

        this.actionsContainer = document.createElement('div');
        this.renderActions();
        actionsSection.appendChild(this.actionsContainer);

        this.rightPanel.appendChild(actionsSection);

        container.appendChild(this.leftPanel);
        container.appendChild(this.rightPanel);

        return container;
    }

    private setupTree(): void {
        // The tree is already set up with the root node in constructor
        // We just need to add styling for read-only mode
        const style = document.createElement('style');
        style.textContent = `
            .selectable-node-tree input[type="checkbox"] {
                pointer-events: none !important;
                opacity: 0.6 !important;
            }
        `;
        document.head.appendChild(style);
    }

    private initializeTagMappings(): void {
        const tagAnalysis = analyzeTagsInHierarchy(this.rootNode);
        this.tagToNodesMap = tagAnalysis.tagToNodesMap;
        this.tagToVersionsMap = tagAnalysis.tagToVersionsMap;
    }

    private renderTagList(): void {
        const tags = Object.keys(this.tagToNodesMap).sort((a, b) => {
            // Master tag always first
            if (a === 'master') return -1;
            if (b === 'master') return 1;
            return a.localeCompare(b);
        });

        if (tags.length === 0) {
            const noTagsDiv = document.createElement('div');
            noTagsDiv.style.textAlign = 'center';
            noTagsDiv.style.color = '#6b7280';
            noTagsDiv.style.fontStyle = 'italic';
            noTagsDiv.style.padding = '2rem';
            noTagsDiv.textContent = 'No tags found in hierarchy';
            this.tagListContainer.innerHTML = '';
            this.tagListContainer.appendChild(noTagsDiv);
            return;
        }

        this.tagListContainer.innerHTML = '';

        tags.forEach(tag => {
            const nodeCount = this.tagToNodesMap[tag]?.length || 0;
            const versionCount = this.tagToVersionsMap[tag]?.length || 0;
            
            const tagItem = document.createElement('div');
            
            // Base styling
            tagItem.style.padding = '0.75rem 1rem';
            tagItem.style.borderBottom = '1px solid #f3f4f6';
            tagItem.style.cursor = 'pointer';
            tagItem.style.transition = 'all 0.2s ease';
            tagItem.style.display = 'flex';
            tagItem.style.justifyContent = 'space-between';
            tagItem.style.alignItems = 'center';
            tagItem.style.borderRadius = '6px';
            tagItem.style.marginBottom = '4px';

            // Master tag styling
            if (tag === 'master') {
                tagItem.style.background = '#f0fdf4';
                tagItem.style.borderLeft = '4px solid #10b981';
                tagItem.style.color = '#065f46';
            } else {
                tagItem.style.background = '#fff';
                tagItem.style.borderLeft = '4px solid transparent';
            }

            // Selected tag styling
            if (this.selectedTag === tag) {
                if (tag === 'master') {
                    tagItem.style.background = '#dcfce7';
                } else {
                    tagItem.style.background = '#eff6ff';
                    tagItem.style.borderLeft = '4px solid #3b82f6';
                    tagItem.style.color = '#1e40af';
                }
            }

            // Hover effect
            tagItem.addEventListener('mouseenter', () => {
                if (this.selectedTag !== tag) {
                    tagItem.style.background = '#f9fafb';
                }
            });
            
            tagItem.addEventListener('mouseleave', () => {
                if (this.selectedTag !== tag) {
                    if (tag === 'master') {
                        tagItem.style.background = '#f0fdf4';
                    } else {
                        tagItem.style.background = '#fff';
                    }
                }
            });
            
            // Tag name
            const tagName = document.createElement('span');
            tagName.style.fontWeight = '500';
            tagName.style.flex = '1';
            tagName.textContent = tag;
            tagItem.appendChild(tagName);

            // Tag count
            const tagCount = document.createElement('span');
            tagCount.style.padding = '0.25rem 0.5rem';
            tagCount.style.borderRadius = '12px';
            tagCount.style.fontSize = '0.75rem';
            tagCount.style.fontWeight = '500';
            tagCount.style.marginLeft = '0.5rem';
            tagCount.title = `${versionCount} versions across ${nodeCount} nodes`;
            tagCount.textContent = `${nodeCount}n/${versionCount}v`;

            // Count styling based on tag state
            if (this.selectedTag === tag) {
                if (tag === 'master') {
                    tagCount.style.background = '#10b981';
                    tagCount.style.color = 'white';
                } else {
                    tagCount.style.background = '#3b82f6';
                    tagCount.style.color = 'white';
                }
            } else {
                if (tag === 'master') {
                    tagCount.style.background = '#10b981';
                    tagCount.style.color = 'white';
                } else {
                    tagCount.style.background = '#e5e7eb';
                    tagCount.style.color = '#6b7280';
                }
            }

            tagItem.appendChild(tagCount);
            
            tagItem.addEventListener('click', () => {
                this.selectTag(tag);
            });
            
            this.tagListContainer.appendChild(tagItem);
        });
    }

    private selectTag(tag: string): void {
        this.selectedTag = tag;
        
        // Update tag list appearance
        this.renderTagList();
        
        // Update tree to highlight nodes with this tag
        this.highlightNodesWithTag(tag);
        
        // Update actions
        this.renderActions();
    }

    private highlightNodesWithTag(tag: string): void {
        const nodesWithTag = this.tagToNodesMap[tag] || [];
        
        // First, uncheck all checkboxes and remove highlights
        const allCheckboxes = document.querySelectorAll('.selectable-node-tree input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
        allCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
            // Remove highlight from parent row
            const row = checkbox.closest('.selectable-tree-item');
            if (row) {
                row.classList.remove('tag-selected');
            }
        });
        
        // Check checkboxes and add highlights for nodes with selected tag
        nodesWithTag.forEach(node => {
            const checkbox = document.querySelector(`input[type="checkbox"][data-node-id="${node.id}"]`) as HTMLInputElement;
            if (checkbox) {
                checkbox.checked = true;
                // Add highlight to parent row
                const row = checkbox.closest('.selectable-tree-item');
                if (row) {
                    row.classList.add('tag-selected');
                }
            }
        });
    }

    private renderActions(): void {
        this.actionsContainer.innerHTML = '';

        if (!this.selectedTag) {
            const noSelectionDiv = document.createElement('div');
            noSelectionDiv.style.textAlign = 'center';
            noSelectionDiv.style.color = '#6b7280';
            noSelectionDiv.style.fontStyle = 'italic';
            noSelectionDiv.style.padding = '2rem';
            noSelectionDiv.textContent = 'Select a tag to see available operations';
            this.actionsContainer.appendChild(noSelectionDiv);
            return;
        }

        const isMasterTag = this.selectedTag === 'master';
        const nodeCount = this.tagToNodesMap[this.selectedTag]?.length || 0;
        const versionCount = this.tagToVersionsMap[this.selectedTag]?.length || 0;
        
        // Selected tag info
        const selectedTagInfo = document.createElement('div');
        selectedTagInfo.style.background = '#f0f9ff';
        selectedTagInfo.style.border = '1px solid #bae6fd';
        selectedTagInfo.style.borderRadius = '6px';
        selectedTagInfo.style.padding = '1rem';
        selectedTagInfo.style.marginBottom = '1.5rem';

        const tagName = document.createElement('div');
        tagName.style.fontWeight = '600';
        tagName.style.color = '#0c4a6e';
        tagName.style.marginBottom = '0.5rem';
        tagName.textContent = `Selected: ${this.selectedTag}`;
        selectedTagInfo.appendChild(tagName);

        const tagStats = document.createElement('div');
        tagStats.style.fontSize = '0.875rem';
        tagStats.style.color = '#075985';
        tagStats.textContent = `${nodeCount} nodes, ${versionCount} versions`;
        selectedTagInfo.appendChild(tagStats);

        this.actionsContainer.appendChild(selectedTagInfo);

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '0.75rem';

        // Add Tag button
        const addTagBtn = this.createActionButton('➕ Add Another Tag', 'primary', () => this.handleAddTag());
        buttonContainer.appendChild(addTagBtn);

        // Remove Tag button (not for master)
        if (!isMasterTag) {
            const removeTagBtn = this.createActionButton('🗑️ Remove Tag', 'danger', () => this.handleRemoveTag());
            buttonContainer.appendChild(removeTagBtn);
        }

        // Promote to Master button (not for master)
        if (!isMasterTag) {
            const promoteBtn = this.createActionButton('👑 Promote to Master', 'default', () => this.handlePromoteToMaster());
            buttonContainer.appendChild(promoteBtn);
        }

        // Copy button (not for master)
        if (!isMasterTag) {
            const copyBtn = this.createActionButton('📋 Copy Versions', 'default', () => this.handleCopyVersions());
            buttonContainer.appendChild(copyBtn);
        }

        // Remove Versions button (not for master)
        if (!isMasterTag) {
            const removeVersionsBtn = this.createActionButton('🗑️ Remove Versions', 'danger', () => this.handleRemoveVersions());
            buttonContainer.appendChild(removeVersionsBtn);
        }

        // Close button
        const closeBtn = this.createActionButton('✖️ Close', 'default', () => {
            void this.close();
            if (this.options.onClose) {
                this.options.onClose();
            }
        });
        buttonContainer.appendChild(closeBtn);

        this.actionsContainer.appendChild(buttonContainer);
    }

    private createActionButton(text: string, variant: 'primary' | 'danger' | 'default', onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.textContent = text;
        
        // Base styling
        button.style.width = '100%';
        button.style.padding = '0.75rem 1rem';
        button.style.border = '1px solid #d1d5db';
        button.style.borderRadius = '6px';
        button.style.fontWeight = '500';
        button.style.cursor = 'pointer';
        button.style.transition = 'all 0.2s ease';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.gap = '0.5rem';
        button.style.fontSize = '0.875rem';

        // Variant styling
        switch (variant) {
            case 'primary':
                button.style.background = '#3b82f6';
                button.style.color = 'white';
                button.style.borderColor = '#3b82f6';
                button.addEventListener('mouseenter', () => {
                    button.style.background = '#2563eb';
                    button.style.borderColor = '#2563eb';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.background = '#3b82f6';
                    button.style.borderColor = '#3b82f6';
                });
                break;
            case 'danger':
                button.style.background = '#dc2626';
                button.style.color = 'white';
                button.style.borderColor = '#dc2626';
                button.addEventListener('mouseenter', () => {
                    button.style.background = '#b91c1c';
                    button.style.borderColor = '#b91c1c';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.background = '#dc2626';
                    button.style.borderColor = '#dc2626';
                });
                break;
            default:
                button.style.background = '#f9fafb';
                button.style.color = '#374151';
                button.style.borderColor = '#d1d5db';
                button.addEventListener('mouseenter', () => {
                    button.style.background = '#f3f4f6';
                    button.style.borderColor = '#9ca3af';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.background = '#f9fafb';
                    button.style.borderColor = '#d1d5db';
                });
                break;
        }

        button.addEventListener('click', onClick);
        return button;
    }

    private handleAddTag(): void {
        if (!this.selectedTag) return;

        const newTag = prompt('Enter the tag to add to all versions with "' + this.selectedTag + '":');
        if (!newTag || newTag.trim() === '') return;

        const trimmedTag = newTag.trim();
        
        // Add tag to all versions that have the selected tag
        const versions = this.tagToVersionsMap[this.selectedTag];
        if (!versions) return;
        
        let addedCount = 0;

        versions.forEach(versionInfo => {
            const { node, versionId } = versionInfo;
            const version = node.getAllVersions().find(v => v.id === versionId);
            if (version && !version.tags.has(trimmedTag)) {
                version.tags.add(trimmedTag);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            alert(`Added tag "${trimmedTag}" to ${addedCount} versions`);
            void this.persistChanges();
            this.initializeTagMappings();
            this.renderTagList();
            this.renderActions();
        } else {
            alert('Tag already exists on all selected versions');
        }
    }

    private handleRemoveTag(): void {
        if (!this.selectedTag || this.selectedTag === 'master') return;

        const versions = this.tagToVersionsMap[this.selectedTag];
        if (!versions) return;

        if (!confirm(`Remove tag "${this.selectedTag}" from all ${versions.length} versions?`)) {
            return;
        }
        
        versions.forEach(versionInfo => {
            const { node, versionId } = versionInfo;
            const version = node.getAllVersions().find(v => v.id === versionId);
            if (version) {
                version.tags.delete(this.selectedTag!);
            }
        });

        alert(`Removed tag "${this.selectedTag}" from ${versions.length} versions`);
        void this.persistChanges();
        
        // Clear selection and refresh
        this.selectedTag = null;
        this.initializeTagMappings();
        this.renderTagList();
        this.renderActions();
        this.highlightNodesWithTag(''); // Clear highlights
    }

    private handlePromoteToMaster(): void {
        if (!this.selectedTag || this.selectedTag === 'master') return;

        // Check uniqueness - each node should have exactly one version with this tag
        const versions = this.tagToVersionsMap[this.selectedTag];
        if (!versions) return;

        const nodeVersionCounts = new Map<DocumentNode, number>();
        
        versions.forEach(versionInfo => {
            const count = nodeVersionCounts.get(versionInfo.node) || 0;
            nodeVersionCounts.set(versionInfo.node, count + 1);
        });

        const nonUniqueNodes = Array.from(nodeVersionCounts.entries()).filter(([_node, count]) => count > 1);
        
        if (nonUniqueNodes.length > 0) {
            const nodeNames = nonUniqueNodes.map(([node, count]) => `"${node.title}" (${count} versions)`).join(', ');
            alert(`Cannot promote to master: Tag "${this.selectedTag}" is not unique for these nodes: ${nodeNames}`);
            return;
        }

        if (!confirm(`Promote all versions with tag "${this.selectedTag}" to master? This will replace current master versions.`)) {
            return;
        }
        
        versions.forEach(versionInfo => {
            const { node, versionId } = versionInfo;
            node.promoteToMaster(versionId);
        });

        alert(`Promoted ${versions.length} versions to master`);
        void this.persistChanges();
        this.initializeTagMappings();
        this.renderTagList();
        this.renderActions();
    }

    private handleCopyVersions(): void {
        if (!this.selectedTag || this.selectedTag === 'master') return;

        // Check uniqueness
        const versions = this.tagToVersionsMap[this.selectedTag];
        if (!versions) return;

        const nodeVersionCounts = new Map<DocumentNode, number>();
        
        versions.forEach(versionInfo => {
            const count = nodeVersionCounts.get(versionInfo.node) || 0;
            nodeVersionCounts.set(versionInfo.node, count + 1);
        });

        const nonUniqueNodes = Array.from(nodeVersionCounts.entries()).filter(([_node, count]) => count > 1);
        
        if (nonUniqueNodes.length > 0) {
            const nodeNames = nonUniqueNodes.map(([node, count]) => `"${node.title}" (${count} versions)`).join(', ');
            alert(`Cannot copy: Tag "${this.selectedTag}" is not unique for these nodes: ${nodeNames}`);
            return;
        }

        const newTag = prompt(`Enter tag for copied versions (copying from "${this.selectedTag}"):`);
        if (!newTag || newTag.trim() === '') return;

        const trimmedTag = newTag.trim();
        
        versions.forEach(versionInfo => {
            const { node, versionId } = versionInfo;
            const sourceVersion = node.getAllVersions().find(v => v.id === versionId);
            if (sourceVersion) {
                // Create new version with copied content and new tag
                node.addVersion([trimmedTag], {
                    title: sourceVersion.title,
                    content: sourceVersion.content,
                    context: sourceVersion.context
                });
            }
        });

        alert(`Copied ${versions.length} versions with new tag "${trimmedTag}"`);
        void this.persistChanges();
        this.initializeTagMappings();
        this.renderTagList();
        this.renderActions();
    }

    private handleRemoveVersions(): void {
        if (!this.selectedTag || this.selectedTag === 'master') return;

        const versions = this.tagToVersionsMap[this.selectedTag];
        if (!versions) return;

        // Check if any versions have both the selected tag and master tag
        const masterVersionsWithTag = versions.filter(versionInfo => {
            const { node, versionId } = versionInfo;
            const version = node.getAllVersions().find(v => v.id === versionId);
            return version?.tags.has('master');
        });

        if (masterVersionsWithTag.length > 0) {
            const nodeNames = masterVersionsWithTag.map(v => `"${v.node.title}"`).join(', ');
            alert(`Cannot remove versions with tag "${this.selectedTag}" because ${masterVersionsWithTag.length} of them are also master versions.\n\nAffected nodes: ${nodeNames}\n\nMaster versions cannot be deleted. Remove the "${this.selectedTag}" tag from these versions first, or use a different tag.`);
            return;
        }

        const nodeCount = this.tagToNodesMap[this.selectedTag]?.length || 0;
        
        if (!confirm(`Remove all ${versions.length} versions with tag "${this.selectedTag}" from ${nodeCount} nodes?\n\nThis will permanently delete these versions. This action cannot be undone.`)) {
            return;
        }

        let removedCount = 0;
        
        versions.forEach(versionInfo => {
            const { node, versionId } = versionInfo;
            
            try {
                // Use the proper removeVersion method
                const wasRemoved = node.removeVersion(versionId);
                if (wasRemoved) {
                    removedCount++;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to remove version ${versionId} from node "${node.title}": ${errorMessage}`);
            }
        });

        if (removedCount > 0) {
            alert(`Removed ${removedCount} versions with tag "${this.selectedTag}"`);
            void this.persistChanges();
            
            // Clear selection and refresh
            this.selectedTag = null;
            this.initializeTagMappings();
            this.renderTagList();
            this.renderActions();
            this.highlightNodesWithTag(''); // Clear highlights
        } else {
            alert('No versions could be removed. Some versions may be the only version in their nodes and cannot be deleted.');
        }
    }

    private async persistChanges(): Promise<void> {
        try {
            const { getActiveProject } = await import('../../state');
            const projectManager = getActiveProject();
            
            if (projectManager) {
                await projectManager.saveToStorage();
                const { renderMultiProjectTree, renderNodeDetails } = await import('../project-ui');
                renderMultiProjectTree();
                renderNodeDetails();
            }
        } catch (error) {
            console.error('Failed to persist tag changes:', error);
        }
    }

    protected getSize(): { width: string; height: string } {
        return { width: '95vw', height: '90vh' };
    }

    public override destroy(): void {
        // Clean up event listeners and references
        this.tree = null as any;
        this.tagToNodesMap = {};
        this.tagToVersionsMap = {};
        void super.destroy();
    }
} 