/**
 * Drag and Drop Manager for Project Tree
 * 
 * Handles drag and drop functionality for moving nodes between parents
 * with template compatibility checking and automatic template adjustment.
 * 
 * FEATURES:
 * - Drag any node to move it to a new parent
 * - Visual feedback (green = valid, red = invalid, blue = dragging)
 * - Layer depth compatibility checking
 * - Automatic template adjustment when moving between projects
 * - Project removal when moving root nodes
 * - Confirmation dialogs for significant operations
 * 
 * COMPATIBILITY RULES:
 * - Cannot drop node onto itself or its descendants
 * - Must not exceed template depth limits:
 *   * New position + node tree depth ≤ template length
 *   * Prevents creating nodes beyond template hierarchy
 * - Target location must have compatible layer depth:
 *   * If target has no children: any depth allowed
 *   * If target has children: dragged node depth ≤ max child depth
 * 
 * TEMPLATE ADJUSTMENT:
 * - Moved nodes get flat copy of target project template
 * - All subnodes inherit the new template
 * - Hierarchy levels are automatically updated
 * 
 * USAGE:
 * 1. Hover over any node to see drag handles (⋮⋮)
 * 2. Drag node to desired target parent
 * 3. Green highlight = valid drop, Red = invalid
 * 4. Confirm any project moves or cross-project moves
 */

import { DocumentNode } from '../DocumentNode';
import { ProjectManager } from '../ProjectManager';
import { AssertFlatTemplateCopy } from '../ProjectUtils';
import * as state from '../state';

export interface DragDropResult {
    success: boolean;
    projectRemoved?: boolean;
    removedProjectId?: string | undefined;
    message: string;
}

export class DragDropManager {
    private draggedNode: DocumentNode | null = null;
    private draggedNodeProject: ProjectManager | null = null;
    
    constructor() {
        this.setupDragDropStyles();
    }

    /**
     * Check if a node can be dropped into a target parent
     */
    public canDrop(draggedNode: DocumentNode, targetParent: DocumentNode): boolean {
        // Cannot drop node onto itself or its descendants
        if (this.isDescendantOf(targetParent, draggedNode)) {
            return false;
        }

        // Check template depth limits - critical validation!
        if (!this.isTemplateDepthCompatible(draggedNode, targetParent)) {
            return false;
        }

        // Check layer depth compatibility
        const draggedDepthFromRoot = this.getDepthFromRoot(draggedNode);
        const targetChildrenDepths = targetParent.children.map(child => this.getDepthFromRoot(child));
        
        // If target has no children, any depth is compatible
        if (targetChildrenDepths.length === 0) {
            return true;
        }

        // Check if dragged node depth is compatible with existing children
        const maxChildDepth = Math.max(...targetChildrenDepths);
        return draggedDepthFromRoot <= maxChildDepth;
    }

    /**
     * Check if moving a node to a target parent would exceed template depth limits
     */
    private isTemplateDepthCompatible(draggedNode: DocumentNode, targetParent: DocumentNode): boolean {
        // Calculate the depth of the dragged node and its subtree
        const draggedNodeDepth = this.calculateNodeTreeDepth(draggedNode);
        
        // Calculate where the dragged node would be placed (target level + 1)
        const newNodeLevel = targetParent.level + 1;
        
        // Check if the new position + node depth would exceed template length
        const requiredTemplateLength = newNodeLevel + draggedNodeDepth;
        const availableTemplateLength = targetParent.template.length;
        
        return requiredTemplateLength <= availableTemplateLength;
    }

    /**
     * Calculate the maximum depth of a node and its entire subtree
     */
    private calculateNodeTreeDepth(node: DocumentNode): number {
        if (!node.children || node.children.length === 0) {
            return 1; // Just this node
        }
        
        // Find the maximum depth among all children
        let maxChildDepth = 0;
        for (const child of node.children) {
            const childDepth = this.calculateNodeTreeDepth(child);
            maxChildDepth = Math.max(maxChildDepth, childDepth);
        }
        
        return 1 + maxChildDepth; // This node + deepest child path
    }

    /**
     * Get the depth of a node from its project root
     */
    private getDepthFromRoot(node: DocumentNode): number {
        let depth = 0;
        let current = node;
        
        while (current.parentId) {
            depth++;
            // Find the parent node across all projects
            let parent: DocumentNode | null = null;
            for (const project of state.getProjects()) {
                parent = project.findNodeById(current.parentId);
                if (parent) break;
            }
            if (!parent) break;
            current = parent;
        }
        
        return depth;
    }

    /**
     * Check if targetNode is a descendant of potentialAncestor
     */
    private isDescendantOf(targetNode: DocumentNode, potentialAncestor: DocumentNode): boolean {
        if (targetNode.id === potentialAncestor.id) {
            return true;
        }
        
        return this.hasDescendant(potentialAncestor, targetNode.id);
    }

    private hasDescendant(node: DocumentNode, targetId: string): boolean {
        for (const child of node.children) {
            if (child.id === targetId || this.hasDescendant(child, targetId)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Move a node to a new parent with template adjustment
     */
    public async moveNode(
        draggedNode: DocumentNode, 
        targetParent: DocumentNode, 
        sourceProject: ProjectManager, 
        targetProject: ProjectManager
    ): Promise<DragDropResult> {
        try {
            // Remove from source parent
            this.removeNodeFromParent(draggedNode, sourceProject);

            // Update node hierarchy levels
            const newLevel = targetParent.level + 1;
            this.updateNodeLevels(draggedNode, newLevel);

            // Set new parent
            draggedNode.parentId = targetParent.id;
            targetParent.children.push(draggedNode);

            // Ensure template consistency using existing utility
            if (sourceProject !== targetProject) {
                // If moving between projects, ensure template consistency in target project
                AssertFlatTemplateCopy(targetProject);
            } else {
                // If moving within same project, still ensure consistency
                AssertFlatTemplateCopy(sourceProject);
            }

            // Check if we need to remove the source project
            let projectRemoved = false;
            let removedProjectId: string | undefined;
            
            if (sourceProject !== targetProject && sourceProject.rootNode.id === draggedNode.id) {
                // Moving a root node to another project - remove the source project
                projectRemoved = true;
                removedProjectId = sourceProject.rootNode.id;
                await this.removeProject(sourceProject);
            }

            // Save both projects
            await sourceProject.saveToStorage();
            if (sourceProject !== targetProject) {
                await targetProject.saveToStorage();
            }

            return {
                success: true,
                projectRemoved,
                removedProjectId,
                message: projectRemoved 
                    ? `Node moved successfully. Source project was removed.`
                    : `Node moved successfully.`
            };

        } catch (error) {
            console.error('Failed to move node:', error);
            return {
                success: false,
                message: `Failed to move node: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Remove node from its current parent
     */
    private removeNodeFromParent(node: DocumentNode, project: ProjectManager): void {
        if (!node.parentId) {
            // This is a root node - handle separately in moveNode
            return;
        }

        const parent = project.findNodeById(node.parentId);
        if (parent) {
            const index = parent.children.findIndex(child => child.id === node.id);
            if (index !== -1) {
                parent.children.splice(index, 1);
            }
        }
    }



    /**
     * Update node levels for the new hierarchy position
     */
    private updateNodeLevels(node: DocumentNode, newLevel: number): void {
        const levelDifference = newLevel - node.level;
        
        node.level = newLevel;
        
        // Recursively update all descendants
        this.updateDescendantLevels(node, levelDifference);
    }

    private updateDescendantLevels(node: DocumentNode, levelDifference: number): void {
        for (const child of node.children) {
            child.level += levelDifference;
            this.updateDescendantLevels(child, levelDifference);
        }
    }

    /**
     * Remove a project from the state and storage
     */
    private async removeProject(project: ProjectManager): Promise<void> {
        // Use the state management function to remove the project
        state.removeProject(project.rootNode.id);
        
        // Save the updated state to storage
        const remainingProjects = state.getProjects();
        if (remainingProjects.length > 0) {
            await remainingProjects[0]!.saveToStorage();
        } else {
            // If no projects remain, clear storage
            await project.clearAllProjectsFromStorage();
        }
    }

    /**
     * Set up CSS styles for drag and drop visual feedback
     */
    private setupDragDropStyles(): void {
        const styleId = 'drag-drop-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Draggable indicator */
            .tree-item[draggable="true"] {
                cursor: move;
            }
            
            .tree-item[draggable="true"]:hover {
                background: rgba(0, 123, 255, 0.05);
            }
            
            /* Drag states */
            .tree-item.dragging {
                opacity: 0.5;
                background: rgba(0, 123, 255, 0.1);
                transform: scale(0.98);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }
            
            .tree-item.drag-over {
                background: rgba(0, 123, 255, 0.2);
                border-left: 3px solid #007bff;
                transition: all 0.2s ease;
            }
            
            .tree-item.drag-invalid {
                background: rgba(220, 53, 69, 0.1);
                border-left: 3px solid #dc3545;
                cursor: not-allowed;
            }
            
            .tree-item.drag-valid {
                background: rgba(40, 167, 69, 0.1);
                border-left: 3px solid #28a745;
                cursor: copy;
            }
            
            .drag-indicator {
                position: absolute;
                background: #007bff;
                height: 2px;
                left: 0;
                right: 0;
                z-index: 1000;
                pointer-events: none;
            }
            
            /* Visual feedback for draggable items */
            .tree-item[draggable="true"]::before {
                content: "⋮⋮";
                color: #999;
                font-size: 0.8em;
                margin-right: 4px;
                opacity: 0;
                transition: opacity 0.2s ease;
            }
            
            .tree-item[draggable="true"]:hover::before {
                opacity: 0.7;
            }
        `;
        
        document.head.appendChild(style);
    }

    /**
     * Initialize drag functionality for a node element
     */
    public initializeDragNode(element: HTMLElement, node: DocumentNode, project: ProjectManager): void {
        element.draggable = true;
        
        element.addEventListener('dragstart', (e) => {
            this.draggedNode = node;
            this.draggedNodeProject = project;
            
            element.classList.add('dragging');
            
            // Set drag data
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', node.id);
                
                // Create custom drag image with node title
                const dragImage = document.createElement('div');
                dragImage.style.cssText = `
                    padding: 8px 12px;
                    background: #007bff;
                    color: white;
                    border-radius: 4px;
                    font-size: 14px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    position: absolute;
                    top: -1000px;
                    left: -1000px;
                    z-index: 1000;
                `;
                dragImage.textContent = `Moving: ${node.title}`;
                document.body.appendChild(dragImage);
                e.dataTransfer.setDragImage(dragImage, 0, 0);
                
                // Clean up drag image after a brief delay
                setTimeout(() => {
                    document.body.removeChild(dragImage);
                }, 100);
            }
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
            this.clearDragOverEffects();
            this.draggedNode = null;
            this.draggedNodeProject = null;
        });
    }

    /**
     * Initialize drop functionality for a node element
     */
    public initializeDropTarget(element: HTMLElement, node: DocumentNode, project: ProjectManager): void {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            
            if (!this.draggedNode || !this.draggedNodeProject) return;
            
            const canDropHere = this.canDrop(this.draggedNode, node);
            
            // Clear previous effects
            this.clearDragOverEffects();
            
            // Add appropriate visual feedback
            element.classList.add('drag-over');
            if (canDropHere) {
                element.classList.add('drag-valid');
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'move';
                }
            } else {
                element.classList.add('drag-invalid');
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'none';
                }
            }
        });

        element.addEventListener('dragleave', (e) => {
            // Only clear if we're actually leaving the element (not just moving to a child)
            const rect = element.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;
            
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                this.clearDragOverEffects();
            }
        });

        element.addEventListener('drop', async (e) => {
            e.preventDefault();
            
            if (!this.draggedNode || !this.draggedNodeProject) return;
            
            const canDropHere = this.canDrop(this.draggedNode, node);
            if (!canDropHere) return;
            
            // Check if this is a significant move that needs confirmation
            const isProjectMove = this.draggedNodeProject.rootNode.id === this.draggedNode.id;
            const isCrossProject = this.draggedNodeProject !== project;
            
            let shouldProceed = true;
            if (isProjectMove) {
                shouldProceed = confirm(
                    `You are about to move the entire project "${this.draggedNode.title}" into "${node.title}". ` +
                    `This will remove the source project. Are you sure you want to continue?`
                );
            } else if (isCrossProject) {
                shouldProceed = confirm(
                    `You are about to move "${this.draggedNode.title}" from one project to another. ` +
                    `The node's template will be adjusted to match the target project. Continue?`
                );
            }
            
            if (!shouldProceed) {
                this.clearDragOverEffects();
                return;
            }
            
            // Perform the move
            const result = await this.moveNode(this.draggedNode, node, this.draggedNodeProject, project);
            
            // Clear visual effects
            this.clearDragOverEffects();
            
            // Show result to user
            if (result.success) {
                // Refresh the UI
                const { renderProjectUI } = await import('./project-ui');
                await renderProjectUI(project);
                
                // Show success message
                console.log(result.message);
                if (result.projectRemoved) {
                    alert(`Node moved successfully. The source project has been removed.`);
                }
            } else {
                alert(result.message);
            }
        });
    }

    /**
     * Clear all drag over visual effects
     */
    private clearDragOverEffects(): void {
        document.querySelectorAll('.tree-item').forEach(el => {
            el.classList.remove('drag-over', 'drag-valid', 'drag-invalid');
        });
        
        // Remove drag indicators
        document.querySelectorAll('.drag-indicator').forEach(el => { el.remove(); });
    }
}

// Export singleton instance
export const dragDropManager = new DragDropManager();
