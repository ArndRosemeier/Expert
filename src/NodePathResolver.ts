import { DocumentNode } from './DocumentNode';
import { ProjectManager } from './ProjectManager';

/**
 * Result of resolving a node path: either the resolved node or a human-readable
 * error explaining why it could not be resolved. A miss is a normal runtime
 * outcome (reported back to the AI), not a thrown programming error.
 */
export type NodePathResolution = { node: DocumentNode } | { error: string };

/**
 * Resolve a filesystem-like path to a node, used by the node chat editor's
 * <requestnode path="..."/> command.
 *
 * Path grammar:
 * - '/' and '\\' are interchangeable separators.
 * - A relative path (no leading separator) resolves against the current node's
 *   direct children, e.g. "Chapter 1" or "Chapter 1/Scene 2".
 * - An absolute path (leading separator) starts from a project root selected by
 *   the project's name, e.g. "\\Other Project\\Act 1\\Chapter 2". A bare
 *   "\\Other Project" resolves to that project's root node.
 * - "." stays on the current node; ".." moves to the parent.
 * - Title and project-name matching is trimmed and case-insensitive; the first
 *   match wins when titles are ambiguous.
 */
export function resolveNodePath(currentNode: DocumentNode, rawPath: string, projects: ProjectManager[]): NodePathResolution {
    if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
        return { error: 'Empty node path' };
    }

    const normalized = rawPath.replace(/\\/g, '/').trim();
    const isAbsolute = normalized.startsWith('/');
    const segments = normalized.split('/').map(s => s.trim()).filter(s => s.length > 0);

    let cursor: DocumentNode;
    let ownerRoot: DocumentNode;
    let startSegmentIndex = 0;

    if (isAbsolute) {
        if (segments.length === 0) {
            return { error: 'Absolute path is missing a project name' };
        }
        const projectName = segments[0]!;
        const project = findProjectByName(projects, projectName);
        if (!project) {
            return { error: `No project named "${projectName}"` };
        }
        cursor = project.rootNode;
        ownerRoot = project.rootNode;
        startSegmentIndex = 1;
    } else {
        const root = findOwnerRoot(currentNode, projects);
        if (!root) {
            return { error: "Could not locate the current node's project" };
        }
        cursor = currentNode;
        ownerRoot = root;
    }

    for (let i = startSegmentIndex; i < segments.length; i++) {
        const seg = segments[i]!;
        if (seg === '.') {
            continue;
        }
        if (seg === '..') {
            const parent = findParentInTree(ownerRoot, cursor.id);
            if (!parent) {
                return { error: `"${cursor.title}" has no parent (cannot go up from here)` };
            }
            cursor = parent;
            continue;
        }
        const child = cursor.children.find(c => titlesEqual(c.title, seg));
        if (!child) {
            return { error: `No child titled "${seg}" under "${cursor.title}"` };
        }
        cursor = child;
    }

    return { node: cursor };
}

function titlesEqual(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Find a project by name. The canonical project name is its root node's title
 * (the live, user-visible name). ProjectManager.projectTitle is a creation-time
 * copy that is NOT kept in sync on rename, so it must not be used here.
 */
function findProjectByName(projects: ProjectManager[], name: string): ProjectManager | null {
    return projects.find(p => titlesEqual(p.rootNode.title, name)) ?? null;
}

/**
 * Find the root node of the project whose tree contains the given node.
 */
function findOwnerRoot(node: DocumentNode, projects: ProjectManager[]): DocumentNode | null {
    for (const project of projects) {
        if (treeContainsId(project.rootNode, node.id)) {
            return project.rootNode;
        }
    }
    return null;
}

function treeContainsId(root: DocumentNode, id: string): boolean {
    if (root.id === id) {
        return true;
    }
    return root.children.some(child => treeContainsId(child, id));
}

/**
 * Find the parent of the node with the given id within a tree, or null when the
 * id is the root or not found.
 */
function findParentInTree(root: DocumentNode, childId: string): DocumentNode | null {
    for (const child of root.children) {
        if (child.id === childId) {
            return root;
        }
        const found = findParentInTree(child, childId);
        if (found) {
            return found;
        }
    }
    return null;
}
