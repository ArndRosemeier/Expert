import { ProjectManager } from './ProjectManager';
import { DocumentNode } from './DocumentNode';
import { QualityCriterion } from './types';

/**
 * Interface for tag analysis results
 */
interface TagAnalysis {
    tagToNodesMap: { [tagName: string]: DocumentNode[] };
    tagToVersionsMap: { [tagName: string]: VersionInfo[] };
    allTags: string[];
}

/**
 * Interface for version information
 */
export interface VersionInfo {
    node: DocumentNode;
    versionId: string;
    version: any; // ContentVersion
}

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


}



/**
 * Formats criteria as JSON for consistent presentation to AI models.
 * This centralizes the criteria formatting logic used across the application.
 * 
 * @param criteria Array of quality criteria to format
 * @returns JSON string representation of criteria or fallback message
 */
export function formatCriteriaAsJson(criteria: QualityCriterion[]): string {
    if (!criteria || criteria.length === 0) {
        return 'No criteria defined';
    }
    
    const formattedCriteria = criteria.map(c => {
        // Extract just the name part (before any period) for cleaner display
        const shortName = c.name.indexOf('.') > 0 ? c.name.substring(0, c.name.indexOf('.')) : c.name;
        return {
            name: shortName,
            description: c.description || shortName
        };
    });
    
    return JSON.stringify(formattedCriteria, null, 2);
}

/**
 * Get all descendant nodes from a given root node (including the root node itself)
 * 
 * @param rootNode The root node to start traversal from
 * @returns Array of all descendant nodes including the root
 */
export function getAllDescendants(rootNode: DocumentNode): DocumentNode[] {
    const descendants: DocumentNode[] = [rootNode];
    
    const traverse = (currentNode: DocumentNode) => {
        for (const child of currentNode.children) {
            descendants.push(child);
            traverse(child);
        }
    };
    
    traverse(rootNode);
    return descendants;
}

/**
 * Analyze all tags in a node hierarchy, collecting tag-to-node and tag-to-version mappings
 * 
 * @param rootNode The root node to analyze (includes all descendants)
 * @returns TagAnalysis object containing tag mappings and sorted tag list
 */
export function analyzeTagsInHierarchy(rootNode: DocumentNode): TagAnalysis {
    const allNodes = getAllDescendants(rootNode);
    const tagToNodesMap: { [tagName: string]: DocumentNode[] } = {};
    const tagToVersionsMap: { [tagName: string]: VersionInfo[] } = {};

    // Collect all tags from all versions of all nodes
    for (const node of allNodes) {
        const versions = node.getAllVersions();
        
        for (const version of versions) {
            for (const tag of version.tags) {
                // Map tag to nodes
                if (!tagToNodesMap[tag]) {
                    tagToNodesMap[tag] = [];
                }
                if (!tagToNodesMap[tag].includes(node)) {
                    tagToNodesMap[tag].push(node);
                }

                // Map tag to versions
                if (!tagToVersionsMap[tag]) {
                    tagToVersionsMap[tag] = [];
                }
                tagToVersionsMap[tag].push({
                    node,
                    versionId: version.id,
                    version
                });
            }
        }
    }

    // Create sorted tag list (master first, then alphabetical)
    const allTags = Object.keys(tagToNodesMap).sort((a, b) => {
        if (a === 'master') return -1;
        if (b === 'master') return 1;
        return a.localeCompare(b);
    });

    return {
        tagToNodesMap,
        tagToVersionsMap,
        allTags
    };
}
