import { ProjectManager } from './ProjectManager';
import { DocumentNode } from './DocumentNode';

/**
 * Ensures all nodes in a project share the same template reference as the root node.
 * This function should be called after any project creation or loading to guarantee
 * template consistency across the entire node tree.
 * 
 * @param project The ProjectManager instance to fix
 */
export function AssertFlatTemplateCopy(project: ProjectManager): void {
    if (!project || !project.rootNode) {
        console.warn('AssertFlatTemplateCopy: Invalid project provided');
        return;
    }

    const rootTemplate = project.rootNode.template;
    if (!rootTemplate || !Array.isArray(rootTemplate)) {
        console.warn('AssertFlatTemplateCopy: Root node has invalid template');
        return;
    }

    // Recursively update all nodes to use the root template reference
    function updateNodeTemplate(node: DocumentNode): void {
        // Ensure the node uses the same template reference as root
        node.template = rootTemplate;
        
        // Recursively update all children
        for (const child of node.children) {
            updateNodeTemplate(child);
        }
    }

    // Update all child nodes (root node already has the correct reference)
    for (const child of project.rootNode.children) {
        updateNodeTemplate(child);
    }

    console.log(`✅ AssertFlatTemplateCopy: Updated ${countNodes(project.rootNode)} nodes to share template reference`);
}

/**
 * Helper function to count total nodes in a tree
 */
function countNodes(node: DocumentNode): number {
    let count = 1; // Count this node
    for (const child of node.children) {
        count += countNodes(child);
    }
    return count;
} 