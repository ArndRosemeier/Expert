import { ProjectManager } from '../ProjectManager';
import { DocumentNode } from '../DocumentNode';
import { getElementById } from './dom-elements';
import * as state from '../state';
import { findProjectByNode } from '../state';

import { openReaderView } from './reader-gui';
import { openAddChildNodeModal, getDefaultModalFactory } from './modals/ModalFactory';
import { CoherenceService } from './modals/services/CoherenceService';
import { CoherenceModal } from './modals/CoherenceModal';
// ContextAdjusterService removed - using conditional context system
// ContextAdjusterModal removed - using conditional context system

import { AssertFlatTemplateCopy } from '../ProjectUtils';
import { restoreConditionalContextItems } from '../ContextFormat';
import { LanguageSelector } from './components/LanguageSelector';
import { AIInteractionsService } from '../AIInteractionsService';
import { UniversalTextEditor } from './components/UniversalTextEditor';
import { ContextIDGenerator } from '../ContextIDGenerator';

// Global references to enhanced editors for access across functions
let enhancedContentEditor: UniversalTextEditor | null = null;
// enhancedContextEditor removed - using conditional context system

// getContextInfoText import removed - using conditional context system
import { ProjectTemplate } from '../ProjectTemplate';
import { AI_ASSISTANT_EMOJI } from '../constants';
import { LoopProgress } from '../LoopOrchestrator';
import { dragDropManager } from './DragDropManager';

/**
 * Calculate model name based on phase and node for progress display
 */
function getModelNameForPhase(nodeId: string, phase: 'create' | 'rate' | 'edit'): string | undefined {
    if (!projectManager) return undefined;
    
    const node = projectManager.findNodeById(nodeId);
    if (!node) return undefined;
    
    const settingsManager = state.getSettingsManager();
    if (!settingsManager) return undefined;
    
    const profile = settingsManager.getLastUsedProfile();
    if (!profile?.selectedModels) return undefined;
    
    let modelKey: string;
    if (phase === 'create') {
        // Use appropriate creator model based on node type
        modelKey = node.isLeaf ? 'prose' : 'creator';
    } else if (phase === 'rate') {
        modelKey = 'rater';
    } else if (phase === 'edit') {
        modelKey = 'editor';
    } else {
        modelKey = node.isLeaf ? 'prose' : 'creator';
    }
    
    const modelName = profile.selectedModels[modelKey];
    if (!modelName) return undefined;
    
    // Format model name for user display (e.g., "x-ai/grok-4" -> "Grok 4")
    return formatModelName(modelName);
}

/**
 * Format model name for user display (e.g., "x-ai/grok-4" -> "Grok 4")
 */
function formatModelName(modelId: string): string {
    // Map of model patterns to friendly names
    const modelMap: { [key: string]: string } = {
        'x-ai/grok-4': 'Grok 4',
        'x-ai/grok-2': 'Grok 2',
        'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
        'anthropic/claude-3-opus': 'Claude 3 Opus',
        'anthropic/claude-3-sonnet': 'Claude 3 Sonnet',
        'anthropic/claude-3-haiku': 'Claude 3 Haiku',
        'openai/gpt-4o': 'GPT-4o',
        'openai/gpt-4': 'GPT-4',
        'openai/gpt-4-turbo': 'GPT-4 Turbo',
        'openai/gpt-3.5-turbo': 'GPT-3.5 Turbo',
        'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
        'google/gemini-pro': 'Gemini Pro',
        'meta-llama/llama-3.1-405b-instruct': 'Llama 3.1 405B',
        'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1 70B',
        'meta-llama/llama-3.1-8b-instruct': 'Llama 3.1 8B'
    };

    // Check for exact match first
    if (modelMap[modelId]) {
        return modelMap[modelId];
    }

    // Extract readable name from model ID if no exact match
    let name = modelId.replace(/^[^/]+\//, ''); // Remove provider prefix
    name = name.replace(/-instruct$/, ''); // Remove -instruct suffix
    name = name.replace(/-/g, ' '); // Replace hyphens with spaces
    
    // Capitalize words
    return name.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

/**
 * Maps language names to their corresponding flag emojis
 * Falls back to 🌐 globe icon if no specific flag is available
 */
function getLanguageFlag(language: string): string {
    // Use the same flag mappings as the language dropdown for consistency
    const languageFlags: Record<string, string> = {
        'English': '🇬🇧',
        'Spanish': '🇪🇸', 
        'French': '🇫🇷',
        'German': '🇩🇪',
        'Italian': '🇮🇹',
        'Portuguese': '🇵🇹',
        'Russian': '🇷🇺',
        'Chinese': '🇨🇳',
        'Japanese': '🇯🇵',
        'Korean': '🇰🇷',
        'Arabic': '🇸🇦',
        'Dutch': '🇳🇱',
        'Polish': '🇵🇱',
        'Swedish': '🇸🇪',
        'Norwegian': '🇳🇴',
        'Danish': '🇩🇰',
        'Finnish': '🇫🇮',
        'Greek': '🇬🇷',
        'Turkish': '🇹🇷',
        'Hindi': '🇮🇳',
        // Additional languages not in dropdown but commonly used
        'Hebrew': '🇮🇱',
        'Czech': '🇨🇿',
        'Hungarian': '🇭🇺',
        'Romanian': '🇷🇴',
        'Bulgarian': '🇧🇬',
        'Croatian': '🇭🇷',
        'Serbian': '🇷🇸',
        'Ukrainian': '🇺🇦',
        'Slovak': '🇸🇰',
        'Slovenian': '🇸🇮',
        'Estonian': '🇪🇪',
        'Latvian': '🇱🇻',
        'Lithuanian': '🇱🇹',
        'Thai': '🇹🇭',
        'Vietnamese': '🇻🇳',
        'Indonesian': '🇮🇩',
        'Malay': '🇲🇾',
        'Filipino': '🇵🇭',
        // Alternative names
        'Deutsch': '🇩🇪',
        'Français': '🇫🇷',
        'Español': '🇪🇸',
        'Italiano': '🇮🇹',
        'Português': '🇵🇹',
        'Nederlands': '🇳🇱',
        'Русский': '🇷🇺',
        '日本語': '🇯🇵',
        '中文': '🇨🇳',
        '한국어': '🇰🇷',
        'العربية': '🇸🇦'
    };
    
    // Try exact match first
    if (languageFlags[language]) {
        return languageFlags[language];
    }
    
    // Try case-insensitive match
    const lowerLanguage = language.toLowerCase();
    for (const [key, flag] of Object.entries(languageFlags)) {
        if (key.toLowerCase() === lowerLanguage) {
            return flag;
        }
    }
    
    // Fallback to globe icon
    return '🌐';
}

/**
 * Gets the appropriate status icons for a node based on its state
 * Returns an object with separate status, todo, and language icons for proper horizontal layout
 */
function getNodeStatusIcons(node: DocumentNode): { statusIcon: string; todoIcon: string; languageIcon: string; qualityIcon: string } {
    let statusIcon = '';
    let todoIcon = '';
    let languageIcon = '';
    let qualityIcon = '';
    
    // Root nodes have no status icon - they're distinguished by typography
    if (node.level === 0 || node.parentId === null) {
        statusIcon = '';
    } else {
        const masterVersion = node.getMasterVersion();
        if (!masterVersion) {
            statusIcon = '🟣'; // Fallback to pure draft if no master version
        } else {
            const hasContent = node.content && node.content.trim().length > 0;
            const isDraft = masterVersion.tags.has('draft');
            const isConsistentWithParent = node.isConsistentToParent();
            const hasOwnConditionalContext = node.getConditionalContextItems().length > 0;
            
            // Special case: Non-root node with its own conditional context (exceptional)
            if (hasOwnConditionalContext) {
                statusIcon = '🔷'; // Special diamond icon for non-root nodes with own context
            }
            // Finished: content done and coherent with parent
            else if (hasContent && !isDraft && isConsistentWithParent) {
                statusIcon = '⭐';
            }
            // Content done - basic state
            else if (hasContent && !isDraft) {
                statusIcon = '🟡';
            }
            // Pure draft
            else {
                statusIcon = '🟣';
            }
        }
    }
    
    // Add todo indicator if this node has todos (separate from status)
    if (nodesWithTodoIndicators.has(node.id)) {
        todoIcon = '⚠️';
    }

    // Flag nodes whose winning generation did not meet all quality goals.
    if ((node.level !== 0 && node.parentId !== null) && node.hasFailedGeneration()) {
        qualityIcon = '❗';
    }
    
    // Add language flag for project root nodes that have a project-specific language
    if (node.level === 0 || node.parentId === null) {
        // This is a project root node - check if it has a project-specific language
        const project = state.getProjects().find(p => p.rootNode.id === node.id);
        if (project) {
            const projectLanguage = project.getLanguage();
            if (projectLanguage) {
                // Project has a specific language set - use actual flag if available
                languageIcon = getLanguageFlag(projectLanguage);
            }
        }
    }
    
    return { statusIcon, todoIcon, languageIcon, qualityIcon };
}

/**
 * Counts status types in the entire tree starting from a root node
 */
function countStatusTypes(rootNode: DocumentNode): Map<string, number> {
    const counts = new Map<string, number>();
    
    function countRecursively(node: DocumentNode) {
        // Skip root nodes themselves
        if (node.level !== 0 && node.parentId !== null) {
            const { statusIcon } = getNodeStatusIcons(node);
            const icon = statusIcon;
            if (icon) {
                const current = counts.get(icon) ?? 0;
                counts.set(icon, current + 1);
            }
        }
        
        // Process children
        node.children.forEach(child => { countRecursively(child); });
    }
    
    countRecursively(rootNode);
    return counts;
}

/**
 * Gets a project root tooltip showing status summary
 */
function getProjectRootTooltip(rootNode: DocumentNode): string {
    const statusCounts = countStatusTypes(rootNode);
    
    if (statusCounts.size === 0) {
        return 'Project contains no child nodes';
    }
    
    const statusLines: string[] = [];
    
    // Define the order and descriptions for each status type
    const statusOrder = [
        { icon: '⭐', description: 'Finished - content done and coherent with parent' },
        { icon: '🔷', description: 'Has own conditional context (exceptional for non-root)' },
        { icon: '🟡', description: 'Content done - basic state' },
        { icon: '🟣', description: 'Pure draft' }
    ];
    
    statusOrder.forEach(({ icon, description }) => {
        const count = statusCounts.get(icon);
        if (count && count > 0) {
            statusLines.push(`${icon} ${description}: ${count}`);
        }
    });
    
    return statusLines.join('\n');
}

/**
 * Gets the appropriate tooltip text for a node based on its status
 */
function getNodeStatusTooltip(node: DocumentNode): string {
    // Check for todo indicator first  
    if (nodesWithTodoIndicators.has(node.id)) {
        const incompleteTodos = node.getIncompleteTodos();
        if (incompleteTodos.length > 0) {
            // This node has direct todos
            const todoText = incompleteTodos.length === 1 ? '1 todo item' : `${incompleteTodos.length} todo items`;
            const firstTodo = incompleteTodos[0];
            const preview = firstTodo ? firstTodo.description.substring(0, 50) : '';
            const ellipsis = firstTodo && firstTodo.description.length > 50 ? '...' : '';
            return `⚠️ Has ${todoText}: ${preview}${ellipsis}`;
        } else {
            // This node has todos in descendants
            return '⚠️ Contains nodes with todo items';
        }
    }
    
    // Root nodes get project summary tooltip
    if (node.level === 0 || node.parentId === null) {
        return getProjectRootTooltip(node);
    }
    
    const masterVersion = node.getMasterVersion();
    if (!masterVersion) {
        return 'Pure draft - no content version available';
    }
    
    const hasContent = node.content && node.content.trim().length > 0;
    const isDraft = masterVersion.tags.has('draft');
    const isContextAdjusted = false; // Context adjustment removed with traditional context
    const isConsistentWithParent = node.isConsistentToParent();
    
    // Finished: all conditions met
    if (hasContent && !isDraft && isContextAdjusted && isConsistentWithParent) {
        return 'Finished - content complete, context adjusted, and consistent with parent';
    }
    
    // Content done, coherent with parent (but no context adjustment)
    if (hasContent && !isDraft && !isContextAdjusted && isConsistentWithParent) {
        return 'Content done and coherent with parent - ready for context adjustment';
    }
    
    // Content done, context adjusted (but no coherence check)
    if (hasContent && !isDraft && isContextAdjusted) {
        return 'Content done with context adjusted';
    }
    
    // Content done, nothing much else
    if (hasContent && !isDraft) {
        return 'Content done - basic state';
    }
    
    // Draft with adjusted context
    if (hasContent && isDraft && isContextAdjusted) {
        return 'Draft with adjusted context';
    }
    
    // Pure draft
    return 'Pure draft';
}




// --- State Variables ---
let projectManager: ProjectManager | null = null;

export function getCurrentProjectManager(): ProjectManager {
  if (!projectManager) {
    throw new Error('No project is currently loaded - this is a programming error');
  }
  return projectManager;
}

export function setSelectedNodeAndRedraw(nodeId: string): void {
  if (!projectManager) {
    throw new Error('No project is currently loaded - this is a programming error');
  }
  selectedNodeId = nodeId;
  renderProjectUI(projectManager);
}
let selectedNodeId: string | null = null;

// Persistent checkbox states
// Level-based generation state
let draftLevelState: number = -1;
let contentLevelState: number = -1;
// contextPruneLevelState removed - using conditional context system
let coherenceLevelState: number = -1;
let autofixSeverityState: number = 5; // -1 = none, 1-10 = autofix threshold. Defaults to 5 on first run.
let deterministicChildCreationState: boolean = true;

// Long-run auto-retry: for unattended multi-hour runs, retry the whole run once
// per minute up to `autoRetryCountState` times if it fails (e.g. congestion).
let autoRetryEnabledState: boolean = false;
let autoRetryCountState: number = 10;

// Export for use by DocumentNode
(globalThis as any).deterministicChildCreationState = deterministicChildCreationState;
// pruneScopeState removed - prune scope UI removed


// Simple bulk operation tracking
let isBulkOperationActive: boolean = false;

// Helper function to get all nodes recursively
function getAllNodesRecursively(node: DocumentNode): DocumentNode[] {
    const result: DocumentNode[] = [node];
    node.children.forEach((child: DocumentNode) => {
        result.push(...getAllNodesRecursively(child));
    });
    return result;
}

// Event handler for expand button clicks with modifier key support
const handleExpandButtonClick = async (e: Event) => {
    const mouseEvent = e as MouseEvent;
    const target = (e.target as HTMLElement).closest('.tree-expand-btn') as HTMLElement;
    if (!target) return;

    e.stopPropagation();
    e.preventDefault();
    
    const nodeId = target.dataset['nodeId'] ?? target.getAttribute('data-node-id');
    if (!nodeId) {
        console.error('❌ No nodeId found on expand button', target);
        return;
    }

    const projects = state.getProjects();
    
    // Find the node and project
    let targetNode: DocumentNode | null = null;
    let nodeProject: ProjectManager | null = null;
    for (const project of projects) {
        targetNode = project.findNodeById(nodeId);
        if (targetNode) {
            nodeProject = project;
            break;
        }
    }
    
    if (!targetNode || !nodeProject) {
        console.error('❌ No node found with ID:', nodeId);
        return;
    }

    // Determine scope based on modifier keys
    if (mouseEvent.altKey) {
        // Alt+Click: Toggle all nodes in all projects
        targetNode.collapsed = !targetNode.collapsed;
        const targetState = targetNode.collapsed;
        
        for (const project of projects) {
            const allNodes = getAllNodesRecursively(project.rootNode);
            allNodes.forEach((node: DocumentNode) => {
                if (node.children.length > 0) {
                    node.collapsed = targetState;
                }
            });
            await project.saveToStorage();
        }
        
    } else if (mouseEvent.ctrlKey) {
        // Ctrl+Click: Toggle all nodes in this project
        targetNode.collapsed = !targetNode.collapsed;
        const targetState = targetNode.collapsed;
        
        const allNodes = getAllNodesRecursively(nodeProject.rootNode);
        const nodesWithChildren = allNodes.filter((n: DocumentNode) => n.children.length > 0);
        
        nodesWithChildren.forEach((node: DocumentNode) => {
            node.collapsed = targetState;
        });
        
        await nodeProject.saveToStorage();
        
    } else if (mouseEvent.shiftKey) {
        // Shift+Click: Toggle all nodes at this level
        targetNode.collapsed = !targetNode.collapsed;
        const targetState = targetNode.collapsed;
        
        const nodesAtSameLevel = nodeProject.getTreeService().getNodesAtTemplateLevel(nodeProject.rootNode, targetNode.level);
        const nodesWithChildren = nodesAtSameLevel.filter(n => n.children.length > 0);
        
        nodesWithChildren.forEach(levelNode => {
            levelNode.collapsed = targetState;
        });
        
        await nodeProject.saveToStorage();
        
    } else {
        // Regular click: Toggle individual node
        targetNode.collapsed = !targetNode.collapsed;
        await nodeProject.saveToStorage();
    }
    
    // Re-render the tree
    renderMultiProjectTree();
};


// Version navigation state
import type { Rating } from '../types/RatingTypes';

let currentVersionIndex: number = 0;

interface VersionView {
    content: string;
    ratings: Rating[] | null;
    isCurrent: boolean;
    label: string;
    timestamp?: Date;
    totalScore: number;
}

let availableVersions: VersionView[] = [];

// Button labels - centralized for consistency
const BUTTON_LABELS = {
    GENERATE: 'Generate',
    GENERATE_RATINGS: 'Generate Ratings for Current Content'
} as const;

// Global abort button is now always visible - no show/hide functions needed

async function saveLevelStates() {
    try {
        const { StorageService } = await import('../StorageService');
        const storage = await StorageService.getInstance();
        await storage.set('expert_app_level_states', {
            draftLevel: draftLevelState,
            contentLevel: contentLevelState,
            coherenceLevel: coherenceLevelState,
            autofixSeverity: autofixSeverityState,
            deterministicChildCreation: deterministicChildCreationState,
            autoRetryEnabled: autoRetryEnabledState,
            autoRetryCount: autoRetryCountState
            // pruneScope removed - prune scope UI removed
        });
    } catch (error) {
        // Failed to save level states
    }
}

async function loadLevelStates() {
    try {
        const { StorageService } = await import('../StorageService');
        const storage = await StorageService.getInstance();
        const saved = await storage.get<{draftLevel: number, contentLevel: number, contextPruneLevel: number, coherenceLevel: number, autofixSeverity: number, deterministicChildCreation: boolean, autoRetryEnabled?: boolean, autoRetryCount?: number}>('expert_app_level_states');
        if (saved) {
            draftLevelState = saved.draftLevel ?? -1;
            contentLevelState = saved.contentLevel ?? -1;
            // contextPruneLevelState removed with traditional context system
            coherenceLevelState = saved.coherenceLevel ?? -1;
            autofixSeverityState = saved.autofixSeverity ?? 5;
            deterministicChildCreationState = saved.deterministicChildCreation ?? true;
            (globalThis as any).deterministicChildCreationState = deterministicChildCreationState;
            autoRetryEnabledState = saved.autoRetryEnabled ?? false;
            autoRetryCountState = saved.autoRetryCount ?? 10;
            // pruneScopeState removed - prune scope UI removed
        }
    } catch (error) {
        // Failed to load level states
    }
}

// Function to capture current dropdown values from DOM
function captureCurrentDropdownValues() {
    try {
        const draftSelector = document.getElementById('draft-level-selector') as HTMLSelectElement;
        const contentSelector = document.getElementById('content-level-selector') as HTMLSelectElement;
        // contextPruneSelector removed - using conditional context system
        const coherenceSelector = document.getElementById('coherence-level-selector') as HTMLSelectElement;
        const autofixSeveritySelector = document.getElementById('autofix-severity-selector') as HTMLSelectElement;
        // pruneScopeSelector removed - prune scope UI removed
        
        if (draftSelector) {
            draftLevelState = parseInt(draftSelector.value);
        }
        if (contentSelector) {
            contentLevelState = parseInt(contentSelector.value);
        }
        // contextPruneSelector removed with traditional context system
        if (coherenceSelector) {
            coherenceLevelState = parseInt(coherenceSelector.value);
        }
        if (autofixSeveritySelector) {
            autofixSeverityState = parseInt(autofixSeveritySelector.value);
        }
        
        // Update deterministic child creation state
        const deterministicCheckbox = document.getElementById('deterministic-child-creation-checkbox') as HTMLInputElement;
        if (deterministicCheckbox) {
            deterministicChildCreationState = deterministicCheckbox.checked;
        }
        // pruneScopeSelector removed - prune scope UI removed
    } catch (error) {
        // Failed to capture dropdown values
    }
}

/**
 * Gets the template-specific name for the current node's level.
 * e.g., if node is at level 0 and template is ["Book", "Act", "Chapter"], returns "Book"
 * e.g., if node is at level 1 and template is ["Book", "Act", "Chapter"], returns "Act"
 */
function getCurrentLevelName(node: DocumentNode): string {
    if (node.level < 0 || node.level >= node.template.length) {
        return node.level === 0 ? 'Project' : 'Node'; // Special fallback for root level
    }
    
    const rawLevelName = node.template[node.level];
    if (!rawLevelName || typeof rawLevelName !== 'string') {
        return node.level === 0 ? 'Project' : 'Node'; // Special fallback for root level
    }
    
    // Extract just the base name (remove numbers)
    // Pattern: "Book 1" -> "Book", "Act 1" -> "Act", "Chapter 10" -> "Chapter"
    const match = rawLevelName.match(/^(\w+)(?:\s+\d+)?$/);
    return match?.[1] ?? rawLevelName;
}

/**
 * Cleans a single raw template level name like "Chapter 1" into its base "Chapter".
 */
function cleanLevelName(rawLevelName: string): string {
    const match = rawLevelName.match(/^(\w+)(?:\s+\d+)?$/);
    return match?.[1] ?? rawLevelName;
}

/**
 * Pluralizes a level name using simple English rules sufficient for template labels
 * (e.g. "Chapter" -> "Chapters", "Story" -> "Stories", "Branch" -> "Branches").
 */
function pluralizeLevel(name: string): string {
    if (/[^aeiou]y$/i.test(name)) {
        return name.slice(0, -1) + 'ies';
    }
    if (/(s|x|z|ch|sh)$/i.test(name)) {
        return name + 'es';
    }
    return name + 's';
}

/**
 * Joins a list of words with commas and a trailing "and" (e.g. ["a","b","c"] -> "a, b and c").
 */
function joinWithAnd(items: string[]): string {
    const last = items.slice(-1).join('');
    const head = items.slice(0, -1).join(', ');
    return head ? `${head} and ${last}` : last;
}

/**
 * Returns the cleaned template level name at an index, throwing loudly if the index
 * is out of range so depth/template mismatches surface immediately rather than silently.
 */
function templateLevelName(template: string[], index: number): string {
    const raw = template[index];
    if (raw === undefined) {
        throw new Error(`Template has no level at index ${index} (template length ${template.length})`);
    }
    return cleanLevelName(raw);
}

/**
 * Builds the idle label for the top-bar Generate button from the current depth state,
 * e.g. "⚡ Generate down to Scene" or "⚡ Generate this Book" (depth == own level).
 */
function computeGenerateLabel(node: DocumentNode): string {
    const template = node.template;
    const ownLevel = node.level;
    const lastIndex = template.length - 1;
    const depth = Math.min(Math.max(draftLevelState, ownLevel), lastIndex);
    if (depth <= ownLevel) {
        return `⚡ Generate this ${templateLevelName(template, ownLevel)}`;
    }
    return `⚡ Generate down to ${templateLevelName(template, depth)}`;
}

/**
 * Produces a plain-language sentence describing what Generate will do for this node,
 * derived from the node's template and the current draft/content/coherence depth state.
 *
 * Mirrors the engine's prose/outline split: only nodes at the deepest template level
 * (leaves) get prose; every level above a leaf gets outline content. This matches the
 * prose-vs-creator model selection (DocumentNode.isLeaf -> 'prose').
 */
function buildGenerationPreview(node: DocumentNode): string {
    const template = node.template;
    const ownLevel = node.level;
    const leafLevel = template.length - 1;
    const draft = Math.min(Math.max(draftLevelState, ownLevel), leafLevel);
    const content = contentLevelState;
    const coherence = coherenceLevelState;
    const ownName = templateLevelName(template, ownLevel);

    // No new sub-structure: work stays on this node itself.
    if (draft <= ownLevel) {
        if (content === -1) {
            return 'Builds nothing new — pick a deeper level, or enable content in Advanced.';
        }
        const ownKind = ownLevel >= leafLevel ? 'prose' : 'outline';
        return `Writes this ${ownName}'s ${ownKind} (no sub-structure).`;
    }

    // Names of the child levels that will be created (ownLevel+1 .. draft), pluralized.
    const createdNames: string[] = [];
    for (let lvl = ownLevel + 1; lvl <= draft; lvl++) {
        createdNames.push(pluralizeLevel(templateLevelName(template, lvl)));
    }

    let sentence = `Creates ${joinWithAnd(createdNames)} under this ${ownName}`;

    if (content === -1) {
        sentence += ' (structure only)';
    } else {
        // Deepest level that actually receives written content.
        const contentDepth = Math.min(content, draft);
        const reachesProse = contentDepth >= leafLevel;
        const hasOutlineLevels = contentDepth - 1 >= ownLevel + 1;

        if (contentDepth < draft) {
            // Decoupled in Advanced: structure is built deeper than content is written.
            // Anything above a leaf is outline, so a shallower content depth is always outline.
            sentence += ` and writes outline down to ${templateLevelName(template, contentDepth)}`;
        } else if (reachesProse && hasOutlineLevels) {
            const leafPlural = pluralizeLevel(templateLevelName(template, leafLevel));
            sentence += ` and writes their outline, plus prose for the ${leafPlural}`;
        } else if (reachesProse) {
            sentence += ' and writes their prose';
        } else {
            sentence += ' and writes their outline';
        }
    }

    if (coherence !== -1) {
        sentence += ', checking coherence';
    }

    return sentence + '.';
}



// REMOVED: collectNodesAtRelativeLevel - replaced with centralized TreeService.getNodesAtTemplateLevel()

/**
 * Gets available template layers below a node that have actual nodes.
 * @param node The node to check layers for
 * @returns Array of layer info with level, name, and node count
 */
function getAvailableLayersForDeletion(node: DocumentNode): Array<{relativeLevel: number, levelName: string, nodes: DocumentNode[], pluralName: string}> {
    const layers: Array<{relativeLevel: number, levelName: string, nodes: DocumentNode[], pluralName: string}> = [];
    
    // Check each level starting from direct children
    for (let relativeLevel = 1; relativeLevel <= 5; relativeLevel++) { // Limit to 5 levels deep for practical reasons
        const targetLevel = node.level + relativeLevel;
        if (targetLevel >= node.template.length) {
            break; // No more template levels available
        }
        
        // Use centralized level collection: convert relative to absolute level
        const absoluteLevel = node.level + relativeLevel;
        const project = findProjectByNode(node);
        if (!project) continue;
        const nodesAtLevel = project.getTreeService().getNodesAtTemplateLevel(node, absoluteLevel);
        if (nodesAtLevel.length > 0) {
            const rawLevelName = node.template[targetLevel];
            if (rawLevelName) {
                // Extract base name from template (e.g., "Chapter 3" -> "Chapter")
                const match = rawLevelName.match(/^(\w+)(?:\s+\d+)?$/);
                const levelName = match?.[1] ?? rawLevelName;
                const pluralName = levelName + 's'; // Simple pluralization
                
                layers.push({
                    relativeLevel,
                    levelName,
                    nodes: nodesAtLevel,
                    pluralName
                });
            }
        }
    }
    
    return layers;
}

/**
 * Shows the actions modal with all available node actions organized in sections
 */
// Import the reusable Dropdown class
import { Dropdown } from './Dropdown';

// Store the dropdown instance for the actions button
let actionsDropdownInstance: Dropdown | null = null;

function showActionsDropdown(node: DocumentNode): void {
    // Close any existing dropdown first
    if (actionsDropdownInstance) {
        void actionsDropdownInstance.close();
        actionsDropdownInstance = null;
    }

    // Find the Actions button
    const actionsButton = document.getElementById('actions-dropdown-btn');
    if (!actionsButton) {
        console.error('Actions button not found');
        return;
    }

    // Create the dropdown content
    const dropdownContent = createActionsDropdownContent(node);

    // Add actions-specific styles
    ensureActionsDropdownStyles();

    // Create the dropdown instance
    actionsDropdownInstance = new Dropdown(actionsButton, dropdownContent, {
        minWidth: '34rem',
        maxWidth: '40rem',
        className: 'actions-dropdown',
        closeOnInsideClick: false, // We'll handle this ourselves to allow action execution
        position: 'bottom-left'
    });

    // Open the dropdown
    void actionsDropdownInstance.open();
    void actionsDropdownInstance.open();
    // Add custom click handler for actions
    void setTimeout(() => {
        const dropdownElement = document.querySelector('.dropdown-menu.actions-dropdown');
        if (dropdownElement) {
            dropdownElement.addEventListener('click', (e) => {
                const button = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
                if (button) {
                    const action = button.getAttribute('data-action');
                    if (action) {
                        // Map actions to the existing handler IDs
                        const actionMap: Record<string, string> = {
                            'new-top-layer': 'new-top-layer-btn',
                            'view-template': 'view-template-btn',
                            'add-child': 'add-child-node-btn',
                            'delete-node': 'delete-node-btn',
                            'delete-all-children': 'delete-subnodes-btn',
                            'search': 'search-btn',
                            'export': 'export-node-btn',
                            'import': 'import-node-btn',
                            'chat': 'chat-node-btn',
                            'node-edit-chat': 'xml-story-creation-btn',
                            'guided-review': 'guided-review-btn',
                            'node-statistics': 'node-statistics-btn',
                            'polish-text': 'polish-text-btn',
                            'edit-context': 'edit-context-btn',
                            'copy-to-new-project': 'copy-to-new-project-btn',
                            'check-coherence': 'check-coherence-btn',
                            'detect-redundant-children': 'detect-redundant-children-btn',
                            'detect-logic-errors': 'detect-logic-errors-btn',
                            'fix-logic-outline': 'fix-logic-outline-btn',

                            'batch-update': 'batch-update-btn',
                            'tag-manager': 'tag-manager-btn',
                            'set-project-language': 'set-project-language-btn'
                        };
                        
                        // Handle idea board actions directly
                        if (action === 'send-content-to-idea-board') {
                            // Close dropdown first
                            if (actionsDropdownInstance) {
                                void actionsDropdownInstance.close();
                                actionsDropdownInstance = null;
                            }
                            void handleSendToIdeaBoard('content');
                            return;
                        }
                        if (action === 'send-context-to-idea-board') {
                            // Close dropdown first
                            if (actionsDropdownInstance) {
                                void actionsDropdownInstance.close();
                                actionsDropdownInstance = null;
                            }
                            void handleSendToIdeaBoard('context');
                            return;
                        }
                        if (action === 'send-both-to-idea-board') {
                            // Close dropdown first
                            if (actionsDropdownInstance) {
                                void actionsDropdownInstance.close();
                                actionsDropdownInstance = null;
                            }
                            void handleSendToIdeaBoard('both');
                            return;
                        }
                        
                        // Handle layer-specific delete actions before action map lookup
                        const deleteLayerMatch = action.match(/^delete-layer-(\d+)$/);
                        if (deleteLayerMatch?.[1]) {
                            // Close dropdown first
                            if (actionsDropdownInstance) {
                                void actionsDropdownInstance.close();
                                actionsDropdownInstance = null;
                            }
                            const relativeLevel = parseInt(deleteLayerMatch[1], 10);
                            handleDeleteLayer(relativeLevel);
                            return;
                        }
                        
                        const handlerAction = actionMap[action];
                        if (handlerAction) {
                            // Close dropdown first
                            if (actionsDropdownInstance) {
                                void actionsDropdownInstance.close();
                                actionsDropdownInstance = null;
                            }
                            // Execute action
                            handleDropdownAction(handlerAction);
                        }
                    }
                }
            });
        }
    }, 50);
}

async function handleNewTopLayer(oldRootNode: DocumentNode): Promise<void> {
    // Prompt user for the new layer name
    const layerName = prompt('Enter the name for the new top layer (e.g., "Series 3" for a series with 3 children target, or just "Series"):');
    
    if (!layerName?.trim()) {
        return; // User cancelled or entered empty name
    }

    const trimmedName = layerName.trim();
    
    // Parse the layer name to extract target count
    let newLevelName: string = trimmedName;
    
    // Check if the name ends with a number (e.g., "Series 3")
    const match = trimmedName.match(/^(.+?)\s+(\d+)$/);
    if (match?.[1] && match[2]) {
        newLevelName = match[1]!; // Non-null assertion since we checked above
        // Target count parsing available but not currently used
    }

    try {
        // Get the current template
        const currentTemplate = projectManager!.template;
        
        // Create extended template hierarchy levels
        const newHierarchyLevels = [newLevelName, ...currentTemplate.hierarchyLevels];
        // The new top layer has no length hint yet; keep lengths index-aligned.
        const newLayerLengths: (number | null)[] = [null, ...currentTemplate.layerLengths];
        
        // Create new template
        const newTemplate = new ProjectTemplate(
            'custom',
            newHierarchyLevels,
            newLayerLengths
        );

        // Create new root node with the extended template
        const oldTitle: string = oldRootNode.title ?? 'Root';
        const newRoot = new DocumentNode(
            0,
            oldTitle,
            null,
            newHierarchyLevels,
            '',
            newLayerLengths
        );

        // Update old root's level and parent
        oldRootNode.level = 1;
        oldRootNode.parentId = newRoot.id;

        // Add old root as child of new root
        newRoot.children.push(oldRootNode);

        // Update the project with the new structure. The project title follows the
        // new root node's title (the previous project name), so adding a top layer
        // keeps the project's name intact.
        projectManager!.template = newTemplate;
        projectManager!.rootNode = newRoot;

        // Ensure all nodes share the same template reference  
        AssertFlatTemplateCopy(projectManager!);

        // Update selected node to the new root
        selectedNodeId = newRoot.id;

        // Save changes to storage
        await projectManager!.saveToStorage();

        // Refresh the project UI
        renderProjectUI(projectManager!);

        alert(`Successfully created new top layer "${newLevelName}" with the old structure as its child.`);

    } catch (error) {
        console.error('Error creating new top layer:', error);
        alert('Failed to create new top layer. Please try again.');
    }
}

/**
 * Handles setting the project language to match the global default
 */
async function handleSetProjectLanguage(): Promise<void> {
    if (!selectedNodeId || !projectManager) {
        alert('Please select a project root to set the project language.');
        return;
    }
    
    const selectedNode = projectManager.findNodeById(selectedNodeId);
    if (!selectedNode || selectedNode.level !== 0) {
        alert('Please select a project root to set the project language.');
        return;
    }

    const settingsManager = state.getSettingsManager();
    if (!settingsManager) {
        alert('Settings manager not available.');
        return;
    }

    try {
        // Get the current global default language
        const globalLanguage = settingsManager.getGlobalLanguage();
        
        // Get the current project language for comparison
        const activeProject = state.getActiveProject();
        const currentProjectLanguage = activeProject?.getLanguage();
        
        // Check if project already has this language
        if (currentProjectLanguage === globalLanguage) {
            return; // Silently skip if already set
        }
        
        // Set the project language directly without confirmation
        await settingsManager.setProjectLanguage(globalLanguage);
        
        // Refresh the UI to show the updated language
        renderMultiProjectTree();
        await renderNodeDetails();
        
    } catch (error) {
        console.error('Failed to set project language:', error);
        // Silently fail - error is logged to console
    }
}

async function handleCopyToNewProject(sourceNode: DocumentNode): Promise<void> {
    try {
        // Build adjusted template from the source node's own template to ensure exact match
        const adjustedHierarchyLevels = sourceNode.template.slice(sourceNode.level);
        
        if (adjustedHierarchyLevels.length === 0) {
            alert('Cannot create project: No template levels available for this node.');
            return;
        }

        // Create new template for the extracted project
        const newTemplate = new ProjectTemplate(
            `${sourceNode.title} Project`,
            adjustedHierarchyLevels
        );

        // Deep copy the source node and all its children, adjusting levels
        const newRootNode = deepCopyNodeWithLevelAdjustment(sourceNode, -sourceNode.level, adjustedHierarchyLevels);
        // Ensure new root has no parent
        newRootNode.parentId = null;

        // Create unique project title
        const baseTitle = sourceNode.level === 0 ? `${sourceNode.title} (Copy)` : sourceNode.title;
        const uniqueTitle = generateUniqueProjectTitle(baseTitle);
        
        const newProjectManager = new ProjectManager(
            uniqueTitle,
            newTemplate,
            state.getOrchestrator()!,
            projectManager!.getSettingsManager(),
            state.getOpenRouterClient()!
        );

        // Copy language from source project (fallback to global language if project-specific not set)
        try {
            const sourceLanguage = projectManager!.getLanguage() ?? projectManager!.getSettingsManager().getLanguage();
            if (sourceLanguage) {
                newProjectManager.setLanguage(sourceLanguage);
            }
        } catch (e) {
            // Failed to copy project language to new project
        }

        // Ensure all nodes share the same template reference
        AssertFlatTemplateCopy(newProjectManager);

        // Replace the auto-generated root with our copied structure
        newProjectManager.rootNode = newRootNode;
        
        // Normalize conditional context item IDs in the copied project tree to use the new format
        ContextIDGenerator.getInstance().normalizeConditionalContextIds(newProjectManager.rootNode);
        
        // Update the root node title to match the unique project title using version management
        newRootNode.setTitle(uniqueTitle, 'master');

        // Add to the projects list first
        state.addProject(newProjectManager);

        // Set as the active project
        state.setActiveProject(newProjectManager.rootNode.id);

        // Then save the new project to storage
        await newProjectManager.saveToStorage();

        // Refresh the project tree to show the new project
        renderMultiProjectTree();

        // New project created successfully
        
        const message = sourceNode.level === 0 
            ? `Successfully created copy of project "${uniqueTitle}".`
            : `Successfully created new project "${uniqueTitle}" from the selected node.`;
        alert(message);

    } catch (error) {
        console.error('Error creating new project:', error);
        alert('Failed to create new project. Please try again.');
    }
}

function deepCopyNodeWithLevelAdjustment(sourceNode: DocumentNode, levelAdjustment: number, adjustedTemplate: string[]): DocumentNode {
    // Create new node with adjusted level (without root node for ID generation - will be normalized later)
    const newLevel = sourceNode.level + levelAdjustment;
    const newNode = new DocumentNode(
        newLevel,
        sourceNode.title,
        sourceNode.parentId,
        adjustedTemplate
    );

    // Rebuild versions and tags from source node
    const sourceVersions = sourceNode.getAllVersions();
    const masterVersion = sourceVersions.find(v => v.tags.has('master')) ?? null;
    let newMasterId: string | null = null;
    if (masterVersion) {
        const masterTags = Array.from(masterVersion.tags).filter(t => t !== 'master');
        newMasterId = newNode.addVersion(masterTags, { title: masterVersion.title, content: masterVersion.content }, masterVersion.metadata, masterVersion.ratings);
    }
    for (const v of sourceVersions) {
        if (masterVersion && v.id === masterVersion.id) continue;
        const tags = Array.from(v.tags).filter(t => t !== 'master');
        newNode.addVersion(tags, { title: v.title, content: v.content }, v.metadata, v.ratings);
    }
    if (newMasterId) {
        newNode.promoteToMaster(newMasterId);
    }
    
    // Copy other properties directly
    newNode.generationPrompt = sourceNode.generationPrompt;
    newNode.isPromptGenerating = sourceNode.isPromptGenerating;
    newNode.collapsed = sourceNode.collapsed;
    newNode.generationHistory = [...sourceNode.generationHistory];
    newNode.isGenerating = sourceNode.isGenerating;
    newNode.generationSessions = sourceNode.generationSessions.map(session => ({...session}));
    
    // Copy conditional context items using public API
    const items = sourceNode.getConditionalContextItems();
    for (const item of items) {
        const newId = newNode.addConditionalContextItem(item.text);
        newNode.updateConditionalContextItem(newId, {
            keywords: item.keywords ? item.keywords.slice() : [],
            childScope: item.childScope ? { mode: item.childScope.mode, titles: item.childScope.titles.slice() } : { mode: 'all', titles: [] },
            leavesOnly: item.leavesOnly === true
        });
    }

    // Versions include metadata; no extra handling needed here

    // Recursively copy children with level adjustment
    newNode.children = sourceNode.children.map(child => 
        deepCopyNodeWithLevelAdjustment(child, levelAdjustment, adjustedTemplate)
    );

    // Update parent IDs for children
    newNode.children.forEach(child => {
        child.parentId = newNode.id;
    });

    return newNode;
}

function generateUniqueProjectTitle(baseTitle: string): string {
    const existingProjects = state.getProjects();
    const existingTitles = new Set(existingProjects.map(p => p.projectTitle));
    
    // If the base title doesn't exist, use it
    if (!existingTitles.has(baseTitle)) {
        return baseTitle;
    }
    
    // Try appending numbers until we find a unique title
    let counter = 2;
    let candidateTitle = `${baseTitle} ${counter}`;
    
    while (existingTitles.has(candidateTitle)) {
        counter++;
        candidateTitle = `${baseTitle} ${counter}`;
    }
    
    return candidateTitle;
}

function showActionsContextMenu(node: DocumentNode, mouseEvent: MouseEvent): void {
    // Close any existing dropdown first
    if (actionsDropdownInstance) {
        void actionsDropdownInstance.close();
        actionsDropdownInstance = null;
    }

    // Create a temporary invisible trigger element at mouse position
    const triggerElement = document.createElement('div');
    triggerElement.style.position = 'absolute';
    triggerElement.style.left = `${mouseEvent.clientX + window.scrollX}px`;
    triggerElement.style.top = `${mouseEvent.clientY + window.scrollY}px`;
    triggerElement.style.width = '1px';
    triggerElement.style.height = '1px';
    triggerElement.style.visibility = 'hidden';
    triggerElement.style.pointerEvents = 'none';
    document.body.appendChild(triggerElement);

    // Create the dropdown content (reuse existing function)
    const dropdownContent = createActionsDropdownContent(node);

    // Add actions-specific styles
    ensureActionsDropdownStyles();

    // Create the dropdown instance
    actionsDropdownInstance = new Dropdown(triggerElement, dropdownContent, {
        minWidth: '34rem',
        maxWidth: '40rem',
        className: 'actions-dropdown context-menu',
        closeOnInsideClick: false, // We'll handle this ourselves to allow action execution
        position: 'bottom-left'
    });

    // Clean up trigger element when dropdown closes
    const originalClose = actionsDropdownInstance.close.bind(actionsDropdownInstance);
    actionsDropdownInstance.close = () => {
        if (triggerElement.parentNode) {
            triggerElement.parentNode.removeChild(triggerElement);
        }
        originalClose();
    };

    // Open the dropdown
    void actionsDropdownInstance.open();
    
    // Add custom click handler for actions (reuse existing logic)
    void setTimeout(() => {
        const dropdownElement = document.querySelector('.dropdown-menu.actions-dropdown');
        if (dropdownElement) {
            dropdownElement.addEventListener('click', (e) => {
                const button = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
                if (button) {
                    const action = button.getAttribute('data-action');
                    if (action) {
                        // Map actions to the existing handler IDs
                        // Handle idea board actions directly
                        if (action === 'send-content-to-idea-board') {
                            void handleSendToIdeaBoard('content');
                            actionsDropdownInstance?.close();
                            return;
                        }
                        if (action === 'send-context-to-idea-board') {
                            void handleSendToIdeaBoard('context');
                            actionsDropdownInstance?.close();
                            return;
                        }
                        if (action === 'send-both-to-idea-board') {
                            void handleSendToIdeaBoard('both');
                            actionsDropdownInstance?.close();
                            return;
                        }
                        
                        // Handle layer-specific delete actions before action map lookup
                        const deleteLayerMatch = action.match(/^delete-layer-(\d+)$/);
                        if (deleteLayerMatch?.[1]) {
                            // Close the dropdown after action
                            actionsDropdownInstance?.close();
                            const relativeLevel = parseInt(deleteLayerMatch[1], 10);
                            handleDeleteLayer(relativeLevel);
                            return;
                        }
                        
                        // Map other actions to the existing handler IDs
                        const actionMap: Record<string, string> = {
                            'new-top-layer': 'new-top-layer-btn',
                            'view-template': 'view-template-btn',
                            'add-child': 'add-child-node-btn',
                            'delete-node': 'delete-node-btn',
                            'delete-all-children': 'delete-subnodes-btn',
                            'search': 'search-btn',
                            'export': 'export-node-btn',
                            'import': 'import-node-btn',
                            'chat': 'chat-node-btn',
                            'node-edit-chat': 'xml-story-creation-btn',
                            'guided-review': 'guided-review-btn',
                            'node-statistics': 'node-statistics-btn',
                            'polish-text': 'polish-text-btn',
                            'edit-context': 'edit-context-btn',
                            'copy-to-new-project': 'copy-to-new-project-btn',
                            'check-coherence': 'check-coherence-btn',
                            'detect-redundant-children': 'detect-redundant-children-btn',
                            'detect-logic-errors': 'detect-logic-errors-btn',
                            'fix-logic-outline': 'fix-logic-outline-btn',

                            'batch-update': 'batch-update-btn',
                            'tag-manager': 'tag-manager-btn',
                            'set-project-language': 'set-project-language-btn'
                        };
                        
                        const handlerAction = actionMap[action];
                        if (handlerAction) {
                            // Close the dropdown after action
                            actionsDropdownInstance?.close();
                            
                            // Use the same handler as the regular dropdown
                            handleDropdownAction(handlerAction);
                        }
                    }
                }
            });
        }
    }, 10);
}

/**
 * Check if a node has leaf nodes (nodes without children or with only empty children)
 */
function hasLeafNodes(node: DocumentNode): boolean {
    const countLeafNodes = (parentNode: DocumentNode): number => {
        let count = 0;
        const traverse = (currentNode: DocumentNode) => {
            if (!currentNode.children || currentNode.children.length === 0) {
                // Check if this leaf has content
                if (currentNode.content && currentNode.content.trim().length > 0) {
                    count++;
                }
            } else {
                for (const child of currentNode.children) {
                    traverse(child);
                }
            }
        };
        
        if (parentNode.children) {
            for (const child of parentNode.children) {
                traverse(child);
            }
        }
        
        return count;
    };
    
    return countLeafNodes(node) > 0;
}

function createActionsDropdownContent(node: DocumentNode): string {
    return `
        <div class="actions-dropdown-content">
            <div class="actions-dropdown-column">
            <!-- Structure Section -->
            <div class="action-section">
                <div class="section-title">Structure</div>
                <div class="action-buttons">
                    ${node.level === 0 ? `
                        <button class="action-btn" data-action="new-top-layer">
                            🆕 New Top Layer
                        </button>
                        <button class="action-btn" data-action="view-template">
                            📋 View Template
                        </button>
                    ` : ''}
                    ${!node.isLeaf ? `
                        <button class="action-btn" data-action="add-child">
                            ➕ Add ${node.childLevelName ?? 'Child'}
                        </button>
                    ` : ''}
                    <button class="action-btn action-btn-danger" data-action="delete-node">
                        🗑️ Delete ${getCurrentLevelName(node)}
                    </button>
                    ${(() => {
                        if (node.children.length === 0) return '';
                        
                        const availableLayers = getAvailableLayersForDeletion(node);
                        if (availableLayers.length === 0) return '';
                        
                        return availableLayers.map(layer => `
                            <button class="action-btn action-btn-warning" data-action="delete-layer-${layer.relativeLevel}" 
                                    title="Delete all ${layer.nodes.length} ${layer.pluralName.toLowerCase()} (${layer.nodes.length} node${layer.nodes.length !== 1 ? 's' : ''})">
                                🗑️ Delete All ${layer.pluralName} (${layer.nodes.length})
                            </button>
                        `).join('');
                    })()}
                </div>
            </div>

            ${node.level === 0 ? `
                <!-- Project Settings Section -->
                <div class="action-section">
                    <div class="section-title">Project Settings</div>
                    <div class="action-buttons">
                        <button class="action-btn" data-action="set-project-language">
                            🌐 Set Project Language
                        </button>
                    </div>
                </div>
            ` : ''}
            </div>

            <div class="actions-dropdown-column">
            <!-- Data Section -->
            <div class="action-section">
                <div class="section-title">Data</div>
                <div class="action-buttons">
                    <button class="action-btn" data-action="search">
                        🔍 Search & Replace
                    </button>
                    <button class="action-btn" data-action="export">
                        📤 Export
                    </button>
                    <button class="action-btn" data-action="import">
                        📥 Import
                    </button>
                    <button class="action-btn" data-action="batch-update">
                        🔄 Batch Update
                    </button>
                    <button class="action-btn" data-action="tag-manager">
                        🏷️ Tag Manager
                    </button>
                    <button class="action-btn" data-action="chat">
                        💬 Chat
                    </button>
                    <button class="action-btn" data-action="node-edit-chat">
                        🗨️ Edit Chat
                    </button>
                    <button class="action-btn" data-action="guided-review">
                        🔎 Guided Review
                    </button>
                    <button class="action-btn" data-action="node-statistics">
                        📊 Statistics
                    </button>
                    <button class="action-btn" data-action="polish-text">
                        🎨 Polish Text
                    </button>
                    <button class="action-btn" data-action="edit-context">
                        📝 Edit Context
                    </button>
                    <button class="action-btn" data-action="copy-to-new-project">
                        📋 Copy to New Project
                    </button>
                    ${node.children && node.children.length > 0 ? `
                        <button class="action-btn" data-action="check-coherence">
                            🔍 Check Coherence
                        </button>
                    ` : ''}
                    ${node.children && node.children.length >= 2 ? `
                        <button class="action-btn" data-action="detect-redundant-children">
                            🗑️ Find Redundant Children
                        </button>
                    ` : ''}
                    ${hasLeafNodes(node) ? `
                        <button class="action-btn" data-action="detect-logic-errors">
                            🧩 Check Logic Errors
                        </button>
                    ` : ''}
                    ${node.getIncompleteTodos().length > 0 ? `
                        <button class="action-btn" data-action="fix-logic-outline">
                            🔧 Fix Logic in Outline
                        </button>
                    ` : ''}

                    <button class="action-btn" data-action="send-content-to-idea-board">
                        💡 Send Content to Idea Board
                    </button>
                    <button class="action-btn" data-action="send-context-to-idea-board">
                        💭 Send Context to Idea Board
                    </button>
                    <button class="action-btn" data-action="send-both-to-idea-board">
                        💡💭 Send Both to Idea Board
                    </button>
                </div>
            </div>
            </div>
        </div>
    `;
}

function ensureActionsDropdownStyles(): void {
    if (document.querySelector('#actions-dropdown-styles')) return;

    const style = document.createElement('style');
    style.id = 'actions-dropdown-styles';
    style.textContent = `
        .dropdown-menu.actions-dropdown {
            padding: 0.75rem;
        }
        
        .actions-dropdown-content {
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            gap: 1rem;
        }
        
        .actions-dropdown-column {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            flex: 1;
            min-width: 0;
        }
        
        .actions-dropdown .action-section {
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 0.75rem;
            background: #f9fafb;
        }
        
        .actions-dropdown .section-title {
            font-size: 0.7rem;
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 0.5rem;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 0.25rem;
        }
        
        .actions-dropdown .action-buttons {
            display: flex;
            flex-direction: column;
            gap: 0;
        }
        
        .actions-dropdown .action-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 0.75rem;
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 0;
            margin-top: -1px;
            cursor: pointer;
            font-size: 0.8rem;
            color: #374151;
            transition: all 0.15s;
            text-align: left;
            width: 100%;
        }
        
        .actions-dropdown .action-btn:first-child {
            margin-top: 0;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
        }
        
        .actions-dropdown .action-btn:last-child {
            border-bottom-left-radius: 4px;
            border-bottom-right-radius: 4px;
        }
        
        .actions-dropdown .action-btn:hover:not(:disabled) {
            background: #f3f4f6;
            border-color: #9ca3af;
            position: relative;
            z-index: 1;
        }
        
        .actions-dropdown .action-btn:disabled {
            color: #9ca3af;
            cursor: not-allowed;
            opacity: 0.6;
        }
        
        .actions-dropdown .action-btn-danger:hover:not(:disabled) {
            background: #fef2f2;
            border-color: #f87171;
            color: #dc2626;
        }
        
        .actions-dropdown .action-btn-warning:hover:not(:disabled) {
            background: #fffbeb;
            border-color: #fbbf24;
            color: #d97706;
        }
    `;
    
    document.head.appendChild(style);
}



// --- Main Render Function ---

export async function renderProjectUI(proj: ProjectManager) {
    projectManager = proj;
    
    // Update modal factory dependencies to include the active project manager
    try {
        const modalFactory = getDefaultModalFactory();
        modalFactory.updateDependencies({ projectManager: proj });
    } catch (error) {
        // Modal factory not initialized yet
    }
    
    // One-time setup for event listeners from the manager
    setupProjectManagerListeners(proj);

    if (!selectedNodeId || !projectManager.findNodeById(selectedNodeId)) {
        selectedNodeId = projectManager.rootNode.id;
    }
    
    const projectTree = getElementById('project-tree');
    const nodeDetails = getElementById('node-details');
    projectTree.innerHTML = ''; // Clear previous content
    nodeDetails.innerHTML = ''; // Clear previous content

    void refreshGlobalProfileSelector(); // Keep the profile selector up-to-date
    renderMultiProjectTree();
    void void renderNodeDetails();
    
    // Re-attach event listeners after DOM replacement in renderProjectUI

    await setupEventListeners();
}

// --- Event Listener Setup ---

interface ManagerListeners {
    handleGenerationStarted: (e: { nodeId: string, node: DocumentNode }) => void;
    handleCompletion: (e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }) => void;
    handleBulkGenerationComplete: (e: { nodeId: string; node: DocumentNode; operation: string; options: any; success: boolean }) => void;
    handleAborted: (e: { nodeId: string, node: DocumentNode }) => void;
    handleError: (message: string) => void;
    handleLoopProgress: (e: { nodeId: string, progress: LoopProgress }) => void;
    handleUnifiedProgress: (e: { nodeId: string; operations?: { message: string; current: number; total: number }; iterations?: { message: string; current: number; total: number }; stages?: { message: string; current: number; total: number }; detail?: string }) => void;
    handleSummaryGenerated: (e: { nodeId: string, summary: string }) => void;
    handleProjectLoaded: () => void;
    handleTreeUpdateNeeded: (e: { nodeId: string; reason: string }) => void;
    handleCoherenceAnalysisStarted: (e: { nodeId: string, node: DocumentNode }) => void;
    handleCoherenceAnalysisComplete: (e: { nodeId: string, node: DocumentNode, hasContradictions: boolean, contradictionCount: number }) => void;
}

const managerListenerRegistry = new WeakMap<ProjectManager, ManagerListeners>();

function setupProjectManagerListeners(manager: ProjectManager) {
    const handleGenerationStarted = (e: { nodeId: string, node: DocumentNode }) => {
        // Just refresh the tree to show spinner for the generating node
        renderMultiProjectTree();
        // Note: Global abort button is managed by GenerationCoordinator
        
        // Only refresh node details if we're looking at the node being generated
        // This prevents unnecessary UI re-rendering that can cause button disappearance
        if (selectedNodeId === e['nodeId']) {
            void void renderNodeDetails();
        }
    };

    const handleCompletion = (_e: { nodeId: string; success: boolean; error?: unknown, node: DocumentNode }) => {
        // Check if any operations are still in progress
        const operationsInProgress = manager.isAnyNodeGenerating();
        
        if (!operationsInProgress && !isBulkOperationActive) {
            // Most UI cleanup is now handled by the coordinator
            // Just do the final project UI refresh
            // Capture current dropdown values before re-rendering to preserve user selections
            captureCurrentDropdownValues();
            renderProjectUI(manager);
            
            // Force clear progress UI as additional safety measure
        clearProgressUI();
            hideGenerationOverlay();
            
            // Coherence check is now handled by the dedicated bulkGenerationComplete event
            // This simplifies the completion handler and makes timing more reliable
        } else {
            // Just refresh the tree to show updated node states - DON'T re-render details during operations
            renderMultiProjectTree();
            // Update content and summary fields without destroying the entire details view
            if (selectedNodeId) {
                const node = manager.findNodeById(selectedNodeId);
                if (node) {
                    // Update enhanced editors if they exist, otherwise fall back to original method
                    if (enhancedContentEditor) {
                        enhancedContentEditor.value = node.content;
                    } else {
                        const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
                        if (contentTextArea) contentTextArea.value = node.content;
                    }
                    
                    // Context editor removed - using conditional context system
                }
            }
        }
        
        // Additional safety: Force clear progress after a delay if no operations are running
        void void setTimeout(() => {
            if (!manager.isAnyNodeGenerating() && !isBulkOperationActive) {
                clearProgressUI();
                hideGenerationOverlay();
                // Note: Global abort button is managed by GenerationCoordinator
            }
        }, 200);
    };

    const handleAborted = (_e: { nodeId: string, node: DocumentNode }) => {
        // Handle aborted generation - similar to completion but with different messaging
        // Clear bulk operation flag in case of abort
        isBulkOperationActive = false;
        
        const operationsInProgress = manager.isAnyNodeGenerating();
        
        if (!operationsInProgress) {
            // UI cleanup is now handled by the coordinator
            // Capture current dropdown values before re-rendering to preserve user selections
            captureCurrentDropdownValues();
            renderProjectUI(manager);
        } else {
            renderMultiProjectTree();
        }
    };

    const handleError = (message: string) => {
        // UI cleanup is now handled by the coordinator for generation errors
        // This handler mainly deals with non-generation errors
        alert(`An error occurred: ${message}`);
        // Capture current dropdown values before re-rendering to preserve user selections
        captureCurrentDropdownValues();
        renderProjectUI(manager);
    };
    
    // Handle direct LoopOrchestrator progress events
    const handleLoopProgress = (e: { nodeId: string, progress: LoopProgress }) => {
        try {
            const { progress } = e;
            const progressData: ProgressUIData = {};
            
            // Map LoopProgress to UI format
            progressData.iterations = {
                current: progress.iteration,
                total: progress.maxIterations,
                message: `Iteration ${progress.iteration} of ${progress.maxIterations}`
            };
            
            // Map phase to step number: create=1, rate=2, edit=3
            const phaseToStep: Record<string, number> = { 'create': 1, 'rate': 2, 'edit': 3 };
            progressData.stages = {
                current: phaseToStep[progress.phase] ?? 1,
                total: 3,
                message: `${progress.phase} phase`
            };
            
            // Calculate model name based on phase and node
            const modelName = getModelNameForPhase(e.nodeId, progress.phase);
            if (modelName) {
                progressData.model = modelName;
            }
            
            updateProgressUI(progressData);
        } catch (error) {
            console.error('Error updating loop progress:', error);
        }
    };

    const handleUnifiedProgress = (e: { nodeId: string; operations?: ProgressInfo; iterations?: ProgressInfo; stages?: ProgressInfo; detail?: string; model?: string }) => {
        try {
            const progressData: ProgressUIData = {};
            if (e.operations) progressData.operations = e.operations;
            if (e.iterations) progressData.iterations = e.iterations;
            if (e.stages) progressData.stages = e.stages;
            if (e.detail) progressData.detail = e.detail;
            if (e.model) progressData.model = e.model;
            
            updateProgressUI(progressData);
        } catch (error) {
            console.error('Error updating unified progress:', error);
        }
    };

    const handleSummaryGenerated = (e: { nodeId: string; summary: string }) => {
        if (e.nodeId === selectedNodeId) {
            // Update enhanced editor if it exists, otherwise fall back to original method
            // Context UI removed - using conditional context system
        }
    };

    const handleBulkGenerationComplete = (e: { nodeId: string; node: DocumentNode; operation: string; options: unknown; success: boolean }) => {
        // Bulk generation complete for node
        
        // Clear bulk operation flag
        isBulkOperationActive = false;
        
        // Check if coherence check was requested for this generation
        if (e.node && (e.node as any)._pendingCoherenceCheck && e.success) {
            const completedNode = e.node;
            // Auto-starting coherence analysis for node
            
            // Clear the pending flag
            delete (completedNode as any)._pendingCoherenceCheck;
            
            // Open coherence check modal after a short delay
            void void setTimeout(() => {
                void import('./modals/CoherenceModal').then(({ CoherenceModal }) => {
                    void import('./modals/services/CoherenceService').then(({ CoherenceService }) => {
                        // Create coherence service instance
                        const coherenceService = new CoherenceService(
                            state.getOpenRouterClient()!,
                            state.getSettingsManager()!
                        );

                        // Check if node is eligible for coherence analysis
                        if (!coherenceService.isNodeEligible(completedNode)) {
                            // Skipping auto-coherence check - node not eligible
                            return;
                        }

                        // Create and show modal in loading state - pass the project root
                        const analysisModal = new CoherenceModal(manager.rootNode);
                        analysisModal.openInLoadingState(completedNode);
                        
                        // Prepare frozen settings using centralized utility
                        void import('./utils/CoherenceUtils').then(({ CoherenceUtils }) => {
                            const frozenSettings = CoherenceUtils.prepareFrozenSettings(state.getSettingsManager()!);
                            
                            // Perform analysis with proper frozen settings (same as UnifiedGenerationService)
                            coherenceService.analyzeCoherence(completedNode, frozenSettings)
                                .then((result) => {
                                    console.log('Coherence analysis completed, updating modal with results:', result);
                                    // Update modal with results
                                    analysisModal.updateWithResults(result);
                                })
                                .catch((error) => {
                                    console.error('Coherence analysis failed:', error);
                                    // Close loading modal and show error
                                    void analysisModal.close();
                                    alert('Coherence analysis failed: ' + error.message);
                                });
                        });
                    }).catch((error: unknown) => {
                        console.error('Failed to load CoherenceService:', error);
                    });
                }).catch((error: unknown) => {
                    console.error('Failed to open coherence modal:', error);
                });
            }, 1000);
        }
    };

    const handleProjectLoaded = () => {
        // Refresh the entire project UI when project structure changes (e.g., after bulk child generation)
        // Capture current dropdown values before re-rendering to preserve user selections
        captureCurrentDropdownValues();
        renderProjectUI(manager);
    };

    // PERFORMANCE FIX: Debounced rendering to prevent rapid DOM rebuilds during generation
    // Problem: tree-update-needed events fire very rapidly during generation (draft-creation-started,
    // children-created, context-pruning-started, etc.) causing DOM race conditions and element warnings
    // Solution: Batch non-critical events, render immediately for critical ones, lightweight updates for status
    let renderTimeout: NodeJS.Timeout | null = null;
    let pendingRenderEvents: Array<{ nodeId: string; reason: string }> = [];
    
    const debouncedRenderProjectUI = () => {
        if (renderTimeout) {
            clearTimeout(renderTimeout);
        }
        
        // Adaptive delay based on pending events - more events = longer delay to batch them
        const baseDelay = 50;
        const adaptiveDelay = Math.min(baseDelay + (pendingRenderEvents.length * 10), 200);
        
        renderTimeout = setTimeout(() => {
            // Executing debounced render (logging removed to reduce noise)
            
            // Capture current dropdown values before re-rendering to preserve user selections
            captureCurrentDropdownValues();
            
            // Execute the render
            renderProjectUI(manager);
            
            // Clear pending events
            pendingRenderEvents = [];
            renderTimeout = null;
        }, adaptiveDelay);
    };

    const handleTreeUpdateNeeded = (e: { nodeId: string; reason: string }) => {
        // Tree update event received (logging reduced to minimize noise)
        
        // Add to pending events
        pendingRenderEvents.push(e);
        
        // For critical events that need immediate UI updates, render immediately
        const criticalEvents = ['generation-completed', 'children-created', 'generation-failed'];
        if (criticalEvents.includes(e.reason)) {
            // Cancel any pending debounced render and execute immediately
            if (renderTimeout) {
                clearTimeout(renderTimeout);
                renderTimeout = null;
            }
            // Immediate render for critical event (logging removed to reduce noise)
            captureCurrentDropdownValues();
            renderProjectUI(manager);
            pendingRenderEvents = [];
        } else {
            // For non-critical events, just update the tree display to reduce DOM churn
            const lightweightEvents = ['draft-creation-started', 'context-pruning-started', 'generation-started'];
            if (lightweightEvents.includes(e.reason)) {
                // Just refresh the tree to show status updates, don't rebuild everything
                renderMultiProjectTree();
            } else {
                // Use debounced rendering for other non-critical events
                debouncedRenderProjectUI();
            }
        }
    };

    const handleCoherenceAnalysisStarted = (e: { nodeId: string, node: DocumentNode }) => {
        console.log(`🔍 Coherence analysis started for node "${e.node.title}"`);
        
        // Update progress UI to show coherence analysis in progress
        updateProgressUI({
            operations: {
                message: `Analyzing coherence for "${e.node.title}"`,
                current: 1,
                total: 1
            },
            detail: 'Checking for contradictions between outline and expanded content...'
        });
    };

    const handleCoherenceAnalysisComplete = (e: { nodeId: string, node: DocumentNode, hasContradictions: boolean, contradictionCount: number }) => {
        console.log(`🔍 Coherence analysis completed for node "${e.node.title}": ${e.hasContradictions ? `${e.contradictionCount} contradictions found` : 'No contradictions found'}`);
        
        // Clear progress UI
        clearProgressUI();
        
        // Optionally show a brief notification
        if (e.hasContradictions) {
            // The modal will be shown by the service, so we don't need to show additional UI here
            console.log(`⚠️ Coherence modal will be shown for ${e.contradictionCount} contradictions`);
        }
    };

    // Remove previous listeners if registered
    const existing = managerListenerRegistry.get(manager);
    if (existing) {
        manager.off('nodeGenerationStarted', existing.handleGenerationStarted);
        manager.off('nodeGenerationComplete', existing.handleCompletion);
        manager.off('bulkGenerationComplete', existing.handleBulkGenerationComplete);
        manager.off('error', existing.handleError);
        manager.off('loop-progress', existing.handleLoopProgress);
        manager.off('unified-progress', existing.handleUnifiedProgress);
        manager.off('nodeSummaryGenerated', existing.handleSummaryGenerated);
        manager.off('project-loaded', existing.handleProjectLoaded);
        manager.off('tree-update-needed', existing.handleTreeUpdateNeeded);
        manager.off('coherenceAnalysisStarted', existing.handleCoherenceAnalysisStarted);
        manager.off('coherenceAnalysisComplete', existing.handleCoherenceAnalysisComplete);
    }
    
    manager.on('nodeGenerationStarted', handleGenerationStarted);
    manager.on('nodeGenerationComplete', handleCompletion);
    manager.on('bulkGenerationComplete', handleBulkGenerationComplete);
    manager.on('nodeGenerationAborted', handleAborted);
    manager.on('error', handleError);
    manager.on('loop-progress', handleLoopProgress);
    manager.on('unified-progress', handleUnifiedProgress);
    manager.on('nodeSummaryGenerated', handleSummaryGenerated);
    manager.on('project-loaded', handleProjectLoaded);
    manager.on('tree-update-needed', handleTreeUpdateNeeded);
    manager.on('coherenceAnalysisStarted', handleCoherenceAnalysisStarted);
    manager.on('coherenceAnalysisComplete', handleCoherenceAnalysisComplete);

    managerListenerRegistry.set(manager, {
        handleGenerationStarted,
        handleCompletion,
        handleBulkGenerationComplete,
        handleAborted,
        handleError,
        handleLoopProgress,
        handleUnifiedProgress,
        handleSummaryGenerated,
        handleProjectLoaded,
        handleTreeUpdateNeeded,
        handleCoherenceAnalysisStarted,
        handleCoherenceAnalysisComplete
    });
}


// --- Component Renders ---

export async function refreshGlobalProfileSelector() {
    const selector = document.getElementById('active-profile-selector') as HTMLSelectElement;
    if (!selector) return;

    // Use centralized ProfileManagerService for consistent profile data
    const { getProfileManagerService } = await import('./services/ProfileManagerService');
    const profileManager = getProfileManagerService();
    
    const profileNames = profileManager.getAvailableProfiles();
    const activeProfileName = profileManager.getCurrentActiveProfile() ?? 'default';
    
    selector.innerHTML = profileNames.map(name => 
        `<option value="${name}" ${activeProfileName === name ? 'selected' : ''}>${name}</option>`
    ).join('');
}



export async function renderNodeDetails(retryOptions?: { _isRetry?: boolean }) {
    const contentArea = getElementById('node-details');
    contentArea.innerHTML = ''; // Clear previous content

    if (!projectManager) {
        throw new Error('projectManager is null in renderNodeDetails - application state corrupted');
    }
    if (!selectedNodeId) {
        // This is a valid state - no node is selected yet
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.replaceContent('node-details', '<div class="placeholder">No node selected.</div>');
        });
        return;
    }

    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) {
        // Use safe content replacement for error
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.replaceContent('node-details', `<div class="placeholder">Error: Node with ID "${selectedNodeId}" not found.</div>`);
        }).catch(() => {
            contentArea.innerHTML = `<div class="placeholder">Error: Node with ID "${selectedNodeId}" not found.</div>`;
        });
        return;
    }
    
    // Set up project manager listeners for the active project (only if not already set up)
    if (!projectManager._listenersSetup) {
        setupProjectManagerListeners(projectManager);
        // @ts-ignore - Mark that listeners are set up to prevent duplication
        projectManager._listenersSetup = true;
    }
    
    const settingsManager = state.getSettingsManager();
    settingsManager?.getProfileNames() ?? [];

    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'node-details-container';
    detailsContainer.innerHTML = `
        <style>
            .node-details-container {
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                height: 100%;
                box-sizing: border-box;
            }
            .node-details-header {
                background-color: #f8f9fa;
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 0;
                border: 1px solid #e9ecef;
                display: grid;
                grid-template-columns: minmax(14rem, 22rem) 1fr;
                gap: 1.5rem;
                align-items: start;
            }
            .node-details-header h2 {
                font-size: 1.4rem;
                font-weight: 600;
                color: #212529;
                border: none;
                outline: none;
                background: transparent;
                cursor: text;
                margin: 0;
            }
            .node-details-header h2:focus {
                background-color: white;
                padding: 0.25rem 0.5rem;
                border-radius: 4px;
                box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
            }
            .node-details-header .node-path {
                font-size: 0.9rem;
                color: #6c757d;
                font-family: 'Courier New', monospace;
                background-color: #fff;
                padding: 0.25rem 0.5rem;
                border-radius: 4px;
                display: inline-block;
                margin-top: 0.25rem;
            }
            .node-details-header .header-left {
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 0;
                width: 100%;
            }
            .header-right {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 0.75rem;
                width: 100%;
                min-width: 0;
            }
            .generation-controls-compact {
                background-color: #fff;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                padding: 0.75rem;
                width: 100%;
            }
            
            .level-controls {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            
            .level-controls-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.5rem 0.75rem;
            }
            
            .level-primary-row {
                display: flex;
                align-items: flex-end;
                gap: 0.75rem;
            }
            
            /* --- Generation plan card (level ladder + live preview) --- */
            .gen-plan-card {
                display: flex;
                flex-direction: column;
                gap: 0.6rem;
            }
            
            .gen-plan-header {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                font-size: 0.85rem;
                font-weight: 600;
                color: #374151;
            }
            
            .gen-plan-title {
                flex: 1;
            }
            
            .gen-plan-help {
                flex-shrink: 0;
                width: 1.25rem;
                height: 1.25rem;
                border-radius: 50%;
                border: 1px solid #cbd5e1;
                background: #f8fafc;
                color: #475569;
                font-size: 0.7rem;
                font-weight: 700;
                line-height: 1;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
            }
            
            .gen-plan-help:hover {
                border-color: #3b82f6;
                color: #2563eb;
            }
            
            .level-ladder {
                display: flex;
                flex-direction: row;
                flex-wrap: wrap;
                align-items: center;
                gap: 0.2rem 0.35rem;
            }
            
            .ladder-rung {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                padding: 0.25rem 0.5rem;
                border: none;
                background: none;
                text-align: left;
                border-radius: 999px;
                cursor: pointer;
                position: relative;
                font-size: 0.85rem;
                color: #9ca3af;
                white-space: nowrap;
                transition: background 0.15s ease, color 0.15s ease;
            }
            
            .ladder-rung:hover {
                background: #f1f5f9;
            }
            
            .rung-dot {
                position: relative;
                z-index: 1;
                width: 0.7rem;
                height: 0.7rem;
                border-radius: 50%;
                border: 2px solid #cbd5e1;
                background: #fff;
                flex-shrink: 0;
                transition: all 0.15s ease;
            }
            
            .ladder-arrow {
                color: #cbd5e1;
                font-size: 0.85rem;
                line-height: 1;
                user-select: none;
                align-self: center;
                transition: color 0.15s ease;
            }
            
            .ladder-arrow.in-scope {
                color: #2563eb;
            }
            
            .ladder-rung.in-scope {
                color: #1f2937;
            }
            
            .ladder-rung.in-scope .rung-dot {
                border-color: #2563eb;
                background: #2563eb;
            }
            
            .ladder-rung.target {
                font-weight: 700;
                background: #eff6ff;
            }
            
            .ladder-rung.target .rung-dot {
                box-shadow: 0 0 0 3px rgba(37, 130, 246, 0.2);
            }
            
            .rung-name {
                flex-shrink: 0;
            }
            
            .gen-plan-bottom {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 0.6rem;
            }
            
            .generation-preview {
                flex: 1 1 16rem;
                min-width: 0;
                font-size: 0.8rem;
                line-height: 1.4;
                color: #475569;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 4px;
                padding: 0.5rem 0.6rem;
                min-height: 2.4rem;
                display: flex;
                align-items: center;
            }
            
            .gen-plan-actions {
                flex: 0 0 auto;
                display: flex;
                align-items: flex-end;
                gap: 0.5rem;
            }
            
            .gen-plan-actions #node-generate-btn {
                flex: 0 0 auto;
                min-width: 9rem;
                max-width: 18rem;
            }

            .gen-plan-actions-secondary {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 0.4rem;
            }

            .auto-retry-control {
                display: flex;
                align-items: center;
                gap: 0.35rem;
                font-size: 0.8rem;
                color: #495057;
                white-space: nowrap;
                cursor: pointer;
                user-select: none;
            }

            .auto-retry-control input[type="number"] {
                width: 3.4rem;
                padding: 0.15rem 0.3rem;
                font-size: 0.8rem;
                border: 1px solid #ced4da;
                border-radius: 4px;
            }

            .auto-retry-control input[type="number"]:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }
            
            .gen-plan-actions .generation-advanced-btn {
                flex-shrink: 0;
            }
            
            .generation-advanced-btn {
                flex-shrink: 0;
                white-space: nowrap;
                font-size: 0.8rem;
                padding: 0.4rem 0.7rem;
            }
            
            .generation-advanced-popup {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            }
            
            .generation-advanced-popup-content {
                width: 90%;
                max-width: 32rem;
                max-height: 85%;
                overflow-y: auto;
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08);
                padding: 1.25rem;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            
            .generation-advanced-popup-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 1rem;
                font-weight: 600;
                color: #111827;
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 0.5rem;
            }
            
            .generation-advanced-close {
                background: none;
                border: none;
                font-size: 1.4rem;
                line-height: 1;
                cursor: pointer;
                color: #6b7280;
                padding: 0 0.25rem;
            }
            
            .generation-advanced-close:hover {
                color: #111827;
            }
            
            .level-selector {
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
            }
            
            .level-selector label {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                font-size: 0.8rem;
                font-weight: 600;
                color: #374151;
                cursor: help;
            }
            
            .level-icon {
                font-size: 0.9rem;
                flex-shrink: 0;
            }
            
            .level-dropdown {
                padding: 0.4rem 0.5rem;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 0.8rem;
                background-color: #fff;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .level-dropdown:hover {
                border-color: #9ca3af;
            }
            
            .level-dropdown:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
            }
            
            .level-dropdown:disabled {
                background-color: #f9fafb;
                color: #6b7280;
                cursor: not-allowed;
            }
            
            .level-validation-message {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                padding: 0.4rem 0.5rem;
                background-color: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 4px;
                font-size: 0.75rem;
                color: #92400e;
            }
            
            .validation-icon {
                font-size: 0.8rem;
                flex-shrink: 0;
            }
            
            .generation-actions {
                display: flex;
                justify-content: center;
                margin-top: 0.25rem;
            }
            
            .prune-and-threshold-row {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                margin-top: 0.5rem;
            }
            
            .prune-level-container, .rating-threshold-container {
                flex: 0 0 auto;
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
                min-width: 0;
            }
            
            .prune-level-container .level-dropdown, .rating-threshold-container .level-dropdown {
                width: 140px;
            }
            
            .prune-level-container label, .rating-threshold-container label {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                font-size: 0.8rem;
                font-weight: 600;
                color: #374151;
                cursor: help;
            }
            #node-generate-btn, #node-generate-all-btn {
                min-width: 85px;
                text-align: center;
            }
            .primary-controls {
                display: flex;
                justify-content: flex-start;
                align-items: center;
                gap: 1.5rem;
                margin-bottom: 0.5rem;
            }
            .generation-type-selector {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            .generation-actions {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                margin-left: auto;
            }
            .secondary-controls {
                border-top: 1px solid #f1f3f4;
                padding-top: 0.5rem;
                display: flex;
                justify-content: flex-end;
            }
            .generation-options {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.4rem 0.8rem;
                width: 100%;
            }
            .leaf-node-info {
                border-top: 1px solid #f1f3f4;
                padding-top: 0.5rem;
            }
            .progress-tier {
                margin-bottom: 0.25rem;
            }
            .progress-tier:last-of-type {
                margin-bottom: 0;
            }
            .progress-bar-wrapper {
                background-color: #e9ecef;
                border-radius: 6px;
                height: 16px;
                overflow: hidden;
                position: relative;
            }
            .progress-bar {
                background: linear-gradient(90deg, var(--primary-500) 0%, var(--primary-600) 100%);
                height: 100%;
                border-radius: 6px;
                transition: width 0.3s ease-in-out;
                position: relative;
                min-width: 0;
            }
            .progress-bar::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
                animation: progress-shine 2s infinite;
            }
            @keyframes progress-shine {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            .version-nav-btn {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                color: #495057;
                border-radius: 4px;
                width: 28px;
                height: 28px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.1rem;
                font-weight: bold;
                transition: all 0.2s;
            }
            .version-nav-btn:hover:not(:disabled) {
                background: #e9ecef;
                border-color: #adb5bd;
                color: #343a40;
            }
            .version-nav-btn:disabled {
                background: #f8f9fa;
                border-color: #e9ecef;
                color: #adb5bd;
                cursor: not-allowed;
            }
            .node-section {
                background-color: #ffffff;
                border: 1px solid var(--secondary-300);
                border-radius: 12px;
                padding: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            }
            .node-section label {
                font-weight: bold;
                font-size: 1.1rem;
                color: #343a40;
            }
            .large-textarea {
                width: 100%;
                border: 1px solid var(--secondary-300);
                border-radius: 8px;
                padding: 0.75rem;
                font-size: 0.85rem;
                line-height: 1.5;
                background-color: #ffffff;
                resize: vertical;
            }
            .node-actions {
                display: flex;
                justify-content: flex-end;
                margin-top: 0.5rem;
            }
            .settings-bar {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                width: 100%;
            }
            .settings-bar label {
                font-size: 1rem;
                white-space: nowrap;
            }
            .settings-bar select, .settings-bar input {
                flex-grow: 1;
                padding: 0.5rem;
                border: 1px solid var(--secondary-300);
                border-radius: 8px;
            }
            .settings-bar input[type="number"] {
                flex-grow: 0;
                width: 70px;
            }
            .prompt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.75rem;
            }
            .help-button:hover, .node-inspector-button:hover {
                background: #e9ecef !important;
                border-color: #495057 !important;
                color: #495057 !important;
                transform: scale(1.05);
            }
            .help-button:active, .node-inspector-button:active {
                transform: scale(0.95);
            }
        </style>
        <div class="node-details-header">
            <!-- Left Side: Title Column with subdivisions -->
            <div class="header-left">
                <!-- Title Row -->
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                    <button id="node-inspector-btn" class="node-inspector-button" title="Inspect Node Versions" style="width: 1.5rem; height: 1.5rem; border-radius: 50%; border: 1px solid #6c757d; background: #f8f9fa; color: #6c757d; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; font-weight: bold;">i</button>
                    <h2 id="node-title-display" contenteditable="true" style="margin: 0;">${node.title}</h2>
                    <span style="font-size: 0.7em; color: #6c757d; font-weight: normal;">(${getCurrentLevelName(node)})</span>
                    ${(() => {
                        const masterVersion = node.getMasterVersion();
                        if (masterVersion && masterVersion.timestamp) {
                            const timestamp = new Date(masterVersion.timestamp);
                            const now = new Date();
                            const diffMs = now.getTime() - timestamp.getTime();
                            const diffMinutes = Math.floor(diffMs / (1000 * 60));
                            const diffHours = Math.floor(diffMinutes / 60);
                            const diffDays = Math.floor(diffHours / 24);
                            
                            let timeAgo;
                            if (diffMinutes < 1) {
                                timeAgo = 'just now';
                            } else if (diffMinutes < 60) {
                                timeAgo = `${diffMinutes}m ago`;
                            } else if (diffHours < 24) {
                                timeAgo = `${diffHours}h ago`;
                            } else if (diffDays < 7) {
                                timeAgo = `${diffDays}d ago`;
                            } else {
                                timeAgo = timestamp.toLocaleDateString();
                            }
                            
                            return `<span style="font-size: 0.65em; color: #9ca3af; font-weight: normal; margin-left: 0.5rem;" title="Last modified: ${timestamp.toLocaleString()}">${timeAgo}</span>`;
                        }
                        return '';
                    })()}
                </div>
                
                <!-- Template Info Row -->
                ${node.level === 0 ? `<div class="template-info" style="font-size: 0.9rem; color: #6c757d; margin-bottom: 0.5rem;">Template: <strong>${projectManager.template.name}</strong></div>` : ''}
                
                <!-- Progress Indicators Row (full width of title column) -->
                <div id="generation-progress-container" style="display: none; margin-bottom: 0.75rem;">
                    <div class="progress-tier" style="margin-bottom: 0.25rem;">
                        <div id="progress-text-operations" style="font-size: 0.75rem; font-weight: 600; color: #374151; margin-bottom: 0.2rem; text-align: left;"></div>
                        <div class="progress-bar-wrapper" style="height: 20px;">
                            <div id="progress-bar-operations" class="progress-bar" style="width: 0%;"></div>
                        </div>
                    </div>

                    <!-- Sub-progress bars -->
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
                        <div class="progress-tier" style="flex: 1;">
                            <div id="progress-text-iterations" style="font-size: 0.65rem; color: #6b7280; margin-bottom: 0.1rem; text-align: center;"></div>
                            <div class="progress-bar-wrapper" style="height: 16px;">
                                <div id="progress-bar-iterations" class="progress-bar" style="width: 0%;"></div>
                            </div>
                        </div>
                        
                        <div class="progress-tier" style="flex: 1;">
                            <div id="progress-text-stages" style="font-size: 0.65rem; color: #6b7280; margin-bottom: 0.1rem; text-align: center;"></div>
                            <div class="progress-bar-wrapper" style="height: 16px;">
                                <div id="progress-bar-stages" class="progress-bar" style="width: 0%;"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="progress-text-detail" style="font-style: italic; color: #6b7280; font-size: 0.6rem; margin-top: 0.25rem; text-align: left;"></div>
                </div>
                
                <!-- Actions Button Row (inside title column) -->
                <div style="margin-top: auto; display: flex; align-items: center; gap: 0.5rem;">
                    <button id="xml-story-creation-btn" class="button button-secondary" 
                            title="Edit Content with AI - Refine and improve this content collaboratively" 
                            style="padding: 0.4rem; font-size: 0.8rem; min-width: auto; width: 2.2rem; height: 2.2rem; display: flex; align-items: center; justify-content: center;">
                        📝
                    </button>
                    <button id="overview-board-btn" class="button button-secondary" 
                            title="Overview Board - Visualize narrative elements" 
                            style="padding: 0.4rem; font-size: 0.8rem; min-width: auto; width: 2.2rem; height: 2.2rem; display: flex; align-items: center; justify-content: center;">
                        📊
                    </button>

                    <button id="actions-dropdown-btn" class="button button-secondary" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        ⚡ Actions
                        <span style="font-size: 0.7em;">▼</span>
                    </button>
                </div>
            </div>
                    
            <!-- Right Side: Generation Controls -->
            <div class="header-right">
                <div class="generation-controls-compact">
                    <!-- Level-Based Generation Controls -->
                    <div class="level-controls">
                        <!-- Primary: self-describing generation plan (level ladder + live preview) -->
                        <div class="gen-plan-card">
                            <div class="gen-plan-header">
                                <span class="level-icon">🎚️</span>
                                <span class="gen-plan-title">Generation plan</span>
                                <button id="generation-levels-help-btn" type="button" class="gen-plan-help" title="How generation levels work" aria-label="How generation levels work">?</button>
                            </div>
                            <div id="level-ladder" class="level-ladder" role="radiogroup" aria-label="Generation depth">
                                ${node.template.slice(node.level).map((levelName, index, levels) => {
                                    const actualLevel = node.level + index;
                                    const clean = cleanLevelName(levelName);
                                    const isOwn = index === 0;
                                    const isLast = index === levels.length - 1;
                                    const rung = `<button type="button" class="ladder-rung${isOwn ? ' is-own' : ''}" data-level="${actualLevel}" role="radio" aria-checked="false"${isOwn ? ' title="This node"' : ''}>
                                        <span class="rung-dot"></span>
                                        <span class="rung-name">${clean}</span>
                                    </button>`;
                                    const arrow = isLast ? '' : `<span class="ladder-arrow" data-after="${actualLevel}" aria-hidden="true">&rarr;</span>`;
                                    return rung + arrow;
                                }).join('')}
                            </div>
                            <div class="gen-plan-bottom">
                                <div id="generation-preview" class="generation-preview"></div>
                                <div class="gen-plan-actions">
                                    <button id="node-generate-btn" class="button button-primary">
                                        ⚡ Generate
                                    </button>
                                    <div class="gen-plan-actions-secondary">
                                        <label class="auto-retry-control" title="For long, unattended runs: if the whole generation fails (e.g. provider congestion), automatically retry it once per minute, up to this many times. Click Abort to stop retrying.">
                                            <input type="checkbox" id="auto-retry-toggle">
                                            <span>Auto-retry &times;</span>
                                            <input type="number" id="auto-retry-count" min="1" max="999" step="1" value="10" disabled>
                                        </label>
                                        <button id="generation-advanced-btn" type="button" class="button button-secondary generation-advanced-btn" title="Advanced generation settings">
                                            ⚙️ Advanced
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Advanced popup overlay (hidden by default) -->
                        <div id="generation-advanced-popup" class="generation-advanced-popup" style="display: none;">
                          <div class="generation-advanced-popup-content">
                            <div class="generation-advanced-popup-header">
                                <span>Advanced Generation Settings</span>
                                <button id="generation-advanced-close" type="button" class="generation-advanced-close" title="Close">&times;</button>
                            </div>
                            <div class="level-controls-grid">
                            <!-- Draft Level -->
                            <div class="level-selector">
                                <label for="draft-level-selector" title="Deepest level for which children (drafts) are created">
                                    <span class="level-icon">📝</span>
                                    Draft Level:
                            </label>
                                <select id="draft-level-selector" class="level-dropdown">
                                    ${node.template.slice(node.level).map((levelName, index) => {
                                        const actualLevel = node.level + index;
                                        const cleanLevelName = levelName.match(/^(\w+)(?:\s+\d+)?$/)?.[1] ?? levelName;
                                        return `<option value="${actualLevel}" ${draftLevelState === actualLevel ? 'selected' : ''}>${cleanLevelName}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            
                            <!-- Content Level -->
                            <div class="level-selector">
                                <label for="content-level-selector" title="Which levels get content generated">
                                    <span class="level-icon">✍️</span>
                                    Content Level:
                            </label>
                                <select id="content-level-selector" class="level-dropdown">
                                    <option value="-1" ${contentLevelState === -1 ? 'selected' : ''}>None</option>
                                    ${node.template.slice(node.level).map((levelName, index) => {
                                        const actualLevel = node.level + index;
                                        const cleanLevelName = levelName.match(/^(\w+)(?:\s+\d+)?$/)?.[1] ?? levelName;
                                        return `<option value="${actualLevel}" ${contentLevelState === actualLevel ? 'selected' : ''}>${cleanLevelName}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            
                            <!-- Coherence Level -->
                            <div class="level-selector">
                                <label for="coherence-level-selector" title="Establish coherence down to this level">
                                    <span class="level-icon">🔍</span>
                                    Coherence Level:
                                </label>
                                <select id="coherence-level-selector" class="level-dropdown">
                                    <option value="-1" ${coherenceLevelState === -1 ? 'selected' : ''}>None</option>
                                                                         // @ts-ignore - TypeScript incorrectly thinks map only expects 1 argument
                                    ${node.template.slice(node.level, -1).map((_, index) => {
                                        const actualLevel = node.level + index;
                                        // Show the child level name (one level down) but keep the parent level as value
                                        const childLevelIndex = node.level + index + 1;
                                        const childLevelName = childLevelIndex < node.template.length ? node.template[childLevelIndex] : null;
                                        if (childLevelName) {
                                            const cleanChildLevelName = childLevelName.match(/^(\w+)(?:\s+\d+)?$/)?.[1] ?? childLevelName;
                                            return `<option value="${actualLevel}" ${coherenceLevelState === actualLevel ? 'selected' : ''}>${cleanChildLevelName}</option>`;
                                        }
                                        return ''; // Skip if no child level exists
                                    }).filter(option => option !== '').join('')}
                                </select>
                            </div>
                            
                            <!-- Autofix Severity -->
                            <div class="level-selector">
                                <label for="autofix-severity-selector" title="Auto-fix contradictions of this severity and higher during generation">
                                    <span class="level-icon">${AI_ASSISTANT_EMOJI}</span>
                                    Autofix Severity:
                                </label>
                                <select id="autofix-severity-selector" class="level-dropdown">
                                    <option value="-1" ${autofixSeverityState === -1 ? 'selected' : ''}>None</option>
                                    <option value="1" ${autofixSeverityState === 1 ? 'selected' : ''}>1 (All)</option>
                                    <option value="2" ${autofixSeverityState === 2 ? 'selected' : ''}>2+</option>
                                    <option value="3" ${autofixSeverityState === 3 ? 'selected' : ''}>3+</option>
                                    <option value="4" ${autofixSeverityState === 4 ? 'selected' : ''}>4+</option>
                                    <option value="5" ${autofixSeverityState === 5 ? 'selected' : ''}>5+ (Medium)</option>
                                    <option value="6" ${autofixSeverityState === 6 ? 'selected' : ''}>6+</option>
                                    <option value="7" ${autofixSeverityState === 7 ? 'selected' : ''}>7+</option>
                                    <option value="8" ${autofixSeverityState === 8 ? 'selected' : ''}>8+ (High)</option>
                                    <option value="9" ${autofixSeverityState === 9 ? 'selected' : ''}>9+</option>
                                    <option value="10" ${autofixSeverityState === 10 ? 'selected' : ''}>10 (Critical)</option>
                                </select>
                            </div>
                            
                            <!-- Context Prune Level removed - using conditional context system -->
                            
                            <!-- Prune Scope removed - prune scope UI removed -->
                </div>
                
                            <!-- Validation Messages -->
                            <div id="level-validation-message" class="level-validation-message" style="display: none;">
                                <span class="validation-icon">⚠️</span>
                                <span id="validation-text"></span>
                            </div>
                          </div>
                        </div>
                        <!-- /Advanced popup overlay -->
                    </div>
                            
                    ${node.isLeaf ? `
                        <div class="leaf-node-info" style="font-size: 0.8rem; color: #6c757d; font-style: italic; text-align: center; margin-top: 0.5rem;">
                            Leaf node (${node.template[node.level] ?? 'final level'}) - no children
                                </div>
                    ` : ''}
                    
                    <!-- Generation Status Display (compact) -->
                    <div id="generation-status" style="display: none; margin-top: 0.5rem; padding: 0.4rem 0.5rem; background-color: #e8f4fd; border: 1px solid #bee5eb; border-radius: 4px; font-size: 0.7rem; color: #0c5460; font-style: italic; text-align: center;">
                        <!-- Status messages will appear here -->
                            </div>
                        </div>
                    </div>
                </div>
                
                <style>
        /* Actions modal now uses proper BaseModal system */
                </style>



        <div class="node-section" id="content-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; cursor: pointer;" id="content-toggle">
                <div style="display: flex; align-items: baseline; gap: 0.5rem;">
                    <span class="toggle-icon" id="content-toggle-icon">▼</span>
                    <label for="node-content" style="cursor: pointer;">Content</label>
                    <span style="font-size: 0.75rem; color: #6c757d; font-style: italic; line-height: 1;">${node.creatorModel ?? 'user text, not generated'}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div id="version-navigation" style="display: none; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
                        <button id="version-prev-btn" class="version-nav-btn" title="Previous version">‹</button>
                        <span id="version-indicator">Version 1 of 1</span>
                        <button id="version-next-btn" class="version-nav-btn" title="Next version">›</button>
                        <button id="use-this-version-btn" class="button button-primary button-sm" style="display: none;">Use This Version</button>
                    </div>
                </div>
            </div>
            <div id="content-display-area" class="foldable-content">
                <textarea id="node-content" class="large-textarea" rows="15" placeholder="Node content will be generated or can be written here...">${node.content || ''}</textarea>
            </div>
        </div>
        
        <!-- Context section removed - using conditional context system -->

        <!-- Conditional Context Panel (embedded, below context, above app log) -->
        <div class="node-section" id="conditional-context-panel">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: baseline; gap: 0.5rem;">
                    <label>Conditional Context</label>
                    <span style="font-size: 0.8rem; color: #6c757d; font-style: italic; line-height: 1;">Edit items and conditions, items are automatically evaluated on all descendants</span>
                </div>
            </div>
            <div id="conditional-context-host" style="width: 100%; min-height: 300px; display: flex; flex-direction: column;"></div>
        </div>

        <!-- UI Logger Section -->
        <div id="ui-log-container" class="ui-log-container">
            <div class="ui-log-header">
                <div class="ui-log-title">
                    <span class="toggle-icon">▼</span>
                    <span>📋 Application Log</span>
                </div>
                <div class="ui-log-stats">
                    <div class="stat-item">
                        <span>📝</span>
                        <span id="log-count">0</span>
                    </div>
                    <div class="stat-item">
                        <span>❌</span>
                        <span id="error-count">0</span>
                    </div>
                    <div class="stat-item">
                        <span>⚠️</span>
                        <span id="warn-count">0</span>
                    </div>
                </div>
            </div>
            <div class="ui-log-content-wrapper">
                <textarea id="ui-log-content" class="ui-log-content" readonly placeholder="Application logs will appear here..."></textarea>
                <div class="ui-log-actions">
                    <button id="ui-log-clear" class="ui-log-btn">Clear</button>
                    <button id="ui-log-export" class="ui-log-btn">Export</button>
                </div>
            </div>
        </div>


    `;

    contentArea.appendChild(detailsContainer);
    
    // Initialize UI Logger
    await initializeUILogger();
    
    // Re-attach event listeners after DOM content replacement

    // Check if generation is in progress and show progress container if needed
    const isGenerationActive = projectManager.isAnyNodeGenerating();
    if (isGenerationActive) {
        const progressContainer = document.getElementById('generation-progress-container');
        if (progressContainer && progressContainer.style.display === 'none') {
            // Make sure progress container is visible if generation is active
            progressContainer.style.display = 'block';
        }
    }

    // === DEBUGGING: Log dropdown HTML generation ===
    // Actions dropdown rendered successfully

    // --- Populate and Set States (No Listeners Here!) ---
    const generateBtn = getElementById('node-generate-btn') as HTMLButtonElement;

    // Initialize version navigation
    initializeVersionNavigation(node);
    
    // Update the content display to show the current version
    updateVersionContentDisplay();

    // Wire fold/unfold for Content
    const contentToggle = document.getElementById('content-toggle');
    const contentAreaEl = document.getElementById('content-display-area');
    const contentIcon = document.getElementById('content-toggle-icon');
    if (contentToggle && contentAreaEl && contentIcon) {
        contentToggle.addEventListener('click', (e) => {
            // Avoid toggling when inner actionable buttons are clicked (e.g., version nav)
            if ((e.target as HTMLElement).closest('#version-navigation')) return;
            const collapsed = contentAreaEl.classList.toggle('collapsed');
            contentIcon.textContent = collapsed ? '▶' : '▼';
        });
    }

    // Wire fold/unfold for Context
    const contextToggle = document.getElementById('context-toggle');
    const contextAreaEl = document.getElementById('context-display-area');
    const contextIcon = document.getElementById('context-toggle-icon');
    if (contextToggle && contextAreaEl && contextIcon) {
        contextToggle.addEventListener('click', (e) => {
            // Skip propagation for any remaining button interactions
            if ((e.target as HTMLElement).closest('button')) {
                return;
            }
            const collapsed = contextAreaEl.classList.toggle('collapsed');
            contextIcon.textContent = collapsed ? '▶' : '▼';
        });
    }

    // Check if any operation is currently running on this node or any other node in the project
    const isAnyNodeGenerating = projectManager.isAnyNodeGenerating();
    const isThisNodeGenerating = node.isGenerating;
    const shouldDisableButtons = isAnyNodeGenerating || node.isPromptGenerating;

    // Update button states based on generation status  
    const isAnyOperationInProgress = projectManager.getTreeService().isAnyNodeGenerating(projectManager.rootNode);
    
    // Normal button states (no more button transformations)
    generateBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    generateBtn.className = 'button button-primary';
    generateBtn.id = 'node-generate-btn';
    
    // Context buttons removed - using conditional context system now

    // Update button text to show current state - USING SAFE METHOD to prevent listener loss
    if (isThisNodeGenerating) {
        // Import EventManager for safe button updates
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.updateButtonContent('node-generate-btn', 
            '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span>...',
                { disabled: true, className: 'button button-primary' }
            );
        });
    } else if (isAnyOperationInProgress) {
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.updateButtonContent('node-generate-btn', 
                '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span>...',
                { disabled: true, className: 'button button-primary' }
            );
        });
    } else {
        // Idle: the Generate button describes its target depth (e.g. "Generate down to Scene").
        const idleLabel = computeGenerateLabel(node);
        generateBtn.dataset['idleLabel'] = idleLabel;
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.updateButtonContent('node-generate-btn', 
                idleLabel,
                { disabled: false, className: 'button button-primary' }
            );
        });
    }

    // Handle deterministic child creation checkbox visibility and events
    const deterministicContainer = document.getElementById('deterministic-child-creation-container');
    const deterministicCheckbox = document.getElementById('deterministic-child-creation-checkbox') as HTMLInputElement;
    
    if (deterministicContainer && deterministicCheckbox) {
        // Show checkbox only for non-leaf nodes (outline nodes)
        const templateLevels = Object.keys(node.template || {}).map(k => parseInt(k)).filter(n => !isNaN(n));
        const maxLevel = templateLevels.length > 0 ? Math.max(...templateLevels) : -1;
        const isLeafNode = node.template?.[node.level] && node.level === maxLevel;
        
        deterministicContainer.style.display = isLeafNode ? 'none' : 'flex';
        
        // Add change handler to update global state
        deterministicCheckbox.onchange = () => {
            deterministicChildCreationState = deterministicCheckbox.checked;
            (globalThis as any).deterministicChildCreationState = deterministicChildCreationState;
            console.log(`[UI] Checkbox changed: deterministicChildCreationState=${deterministicChildCreationState}`);
            void saveLevelStates(); // Save to storage like other level states
        };
    }

    // Mount Conditional Context Editor into the panel
    try {
        const host = document.getElementById('conditional-context-host');
        if (host && projectManager) {
            // Lazy import to avoid bundling cost until needed
            const { ConditionalContextEditor } = await import('./components/ConditionalContextEditor');
            // Clean previous content (destroy old editor if any was mounted)
            host.innerHTML = '';
            const editor = new ConditionalContextEditor({ node, projectManager, showPreview: false, showInheritedByDefault: true });
            // Store instance on the host for cleanup on re-render
            (host as any).__ccEditor?.destroy?.();
            (host as any).__ccEditor = editor;
            editor.mount(host);

            // Wire click-through from ConditionalContextEditor to select nodes in main UI
            // Remove previous listener if present
            const prevListener = (host as any).__ccSelectListener as EventListener | undefined;
            if (prevListener) {
                window.removeEventListener('cc-select-node', prevListener);
            }

            const onCcSelect = (ev: Event) => {
                const detail = (ev as CustomEvent<{ nodeId: string }>).detail;
                if (detail && detail.nodeId) {
                    setSelectedNodeAndRedraw(detail.nodeId);
                }
            };
            (host as any).__ccSelectListener = onCcSelect as EventListener;
            window.addEventListener('cc-select-node', onCcSelect as EventListener);
        }
    } catch (e) {
        console.error('Failed to mount Conditional Context Editor panel:', e);
    }

    // Set up event listeners for level-based generation controls
    const draftLevelSelector = getElementById('draft-level-selector') as HTMLSelectElement;
    const contentLevelSelector = getElementById('content-level-selector') as HTMLSelectElement;
    // context-prune-level-selector removed - using conditional context system
    const coherenceLevelSelector = getElementById('coherence-level-selector') as HTMLSelectElement;
    const autofixSeveritySelector = getElementById('autofix-severity-selector') as HTMLSelectElement;
    const validationMessage = getElementById('level-validation-message') as HTMLDivElement;
    const validationText = getElementById('validation-text') as HTMLSpanElement;
    
    // Restore last generation parameters for this node if available
    if (node.lastGenerationParameters) {
        const params = node.lastGenerationParameters;
        if (draftLevelSelector) draftLevelSelector.value = params.draftLevel.toString();
        if (contentLevelSelector) contentLevelSelector.value = params.contentLevel.toString();
        // contextPruneLevelSelector removed - using conditional context system
        if (coherenceLevelSelector) coherenceLevelSelector.value = params.coherenceLevel.toString();
        if (autofixSeveritySelector) autofixSeveritySelector.value = params.autofixSeverity.toString();
        
        // Restore deterministic child creation checkbox
        const deterministicCheckbox = document.getElementById('deterministic-child-creation-checkbox') as HTMLInputElement;
        if (deterministicCheckbox && params.deterministicChildCreation !== undefined) {
            deterministicCheckbox.checked = params.deterministicChildCreation;
            deterministicChildCreationState = params.deterministicChildCreation;
            (globalThis as any).deterministicChildCreationState = deterministicChildCreationState;
        }
        
        // Update global state variables to match restored values
        draftLevelState = params.draftLevel;
        contentLevelState = params.contentLevel;
        // contextPruneLevelState removed - using conditional context system
        coherenceLevelState = params.coherenceLevel;
        autofixSeverityState = params.autofixSeverity;
        
        // Generation parameters restored (logging removed to reduce noise)
    }
    
    // Validation function
    const validateLevels = (): boolean => {
        if (!draftLevelSelector || !contentLevelSelector || !coherenceLevelSelector) {
            return true; // Skip validation if elements not found
        }
        
        const draftLevel = parseInt(draftLevelSelector.value);
        const contentLevel = parseInt(contentLevelSelector.value);
        const coherenceLevel = parseInt(coherenceLevelSelector.value);
        
        let isValid = true;
        let errorMessage = '';
        
        // Content level cannot be higher than draft level
        if (contentLevel > draftLevel) {
            isValid = false;
            errorMessage = 'Content level cannot be higher than draft level';
        }
        
        // Coherence level cannot be higher than draft level
        if (coherenceLevel > draftLevel && draftLevel !== -1) {
            isValid = false;
            errorMessage = 'Coherence level cannot be higher than draft level';
        }
        
        // Show/hide validation message
        if (validationMessage && validationText) {
            if (isValid) {
                validationMessage.style.display = 'none';
                    } else {
                validationText.textContent = errorMessage;
                validationMessage.style.display = 'flex';
            }
        }
        
        return isValid;
    };
    
    // --- Primary level ladder + live preview + Advanced popup ---
    const levelLadder = getElementById('level-ladder') as HTMLDivElement;
    const generationPreview = getElementById('generation-preview') as HTMLDivElement;
    const levelsHelpBtn = getElementById('generation-levels-help-btn') as HTMLButtonElement;
    const advancedBtn = getElementById('generation-advanced-btn') as HTMLButtonElement;
    const advancedPopup = getElementById('generation-advanced-popup') as HTMLDivElement;
    const advancedCloseBtn = getElementById('generation-advanced-close') as HTMLButtonElement;

    // Coherence targets a parent level whose children are checked, so it can never
    // reach the leaf level; this is its deepest valid value.
    const maxCoherenceLevel = node.template.length - 2;

    // Highlight ladder rungs from the node's own level through the current draft depth.
    const renderLadderState = () => {
        const effectiveDraft = Math.min(Math.max(draftLevelState, node.level), node.template.length - 1);
        levelLadder.querySelectorAll('.ladder-rung').forEach(rung => {
            const level = parseInt((rung as HTMLElement).dataset['level'] as string);
            rung.classList.toggle('in-scope', level <= effectiveDraft);
            rung.classList.toggle('target', level === effectiveDraft);
            rung.setAttribute('aria-checked', level === effectiveDraft ? 'true' : 'false');
        });
        // Color the connector arrows that fall inside the built range (the arrow after
        // level N is in scope when level N+1 is in scope, i.e. N < effectiveDraft).
        levelLadder.querySelectorAll('.ladder-arrow').forEach(arrow => {
            const after = parseInt((arrow as HTMLElement).dataset['after'] as string);
            arrow.classList.toggle('in-scope', after < effectiveDraft);
        });
    };

    // Refresh the plain-language preview sentence under the ladder.
    const renderPreview = () => {
        generationPreview.textContent = buildGenerationPreview(node);
    };

    // Keep the idle Generate button label in sync with the current depth.
    const refreshGenerateLabel = () => {
        const idleLabel = computeGenerateLabel(node);
        const btn = document.getElementById('node-generate-btn') as HTMLButtonElement | null;
        if (btn) {
            btn.dataset['idleLabel'] = idleLabel;
            // Only rewrite the visible label while idle; never clobber a spinner/busy state.
            if (!btn.disabled) {
                btn.innerHTML = idleLabel;
            }
        }
    };

    // Re-derive ladder highlight + preview + button label from current state.
    const syncLadderFromAdvanced = () => {
        renderLadderState();
        renderPreview();
        refreshGenerateLabel();
    };

    // Single-knob: a ladder rung sets draft, content, and coherence in one step.
    // Autofix severity is intentionally untouched - it is an advanced-only setting.
    const setDepth = (level: number) => {
        draftLevelState = level;
        contentLevelState = level;
        // Coherence dropdown stores the PARENT level whose children are checked
        // (see coherence-level-selector options and UnifiedGenerationService). When
        // expanding below this node, target the parent of the deepest draft level.
        const coherence = level > node.level
            ? Math.min(level - 1, maxCoherenceLevel)
            : -1;

        coherenceLevelState = coherence;

        if (draftLevelSelector) draftLevelSelector.value = level.toString();
        if (contentLevelSelector) contentLevelSelector.value = level.toString();
        if (coherenceLevelSelector) coherenceLevelSelector.value = coherence.toString();

        validateLevels();
        syncLadderFromAdvanced();
        void saveLevelStates();
    };

    // Advanced selectors: capture every dropdown value into state, then persist.
    // The ladder + preview re-derive from the (possibly decoupled) Advanced values.
    const advancedSelectors = [draftLevelSelector, contentLevelSelector, coherenceLevelSelector, autofixSeveritySelector];
    advancedSelectors.forEach(selector => {
        if (selector) {
            selector.addEventListener('change', () => {
                captureCurrentDropdownValues();
                validateLevels();
                syncLadderFromAdvanced();
                void saveLevelStates();
            });
        }
    });

    // Clicking a rung selects the target depth.
    levelLadder.querySelectorAll('.ladder-rung').forEach(rung => {
        rung.addEventListener('click', () => {
            const level = parseInt((rung as HTMLElement).dataset['level'] as string);
            setDepth(level);
        });
    });

    // "How this works" help affordance.
    levelsHelpBtn.addEventListener('click', () => {
        void import('./modals/GenerationLevelsHelpModal').then(({ GenerationLevelsHelpModal }) => {
            const modal = new GenerationLevelsHelpModal();
            void modal.open();
        });
    });

    // Reflect the restored/initial depth on first render.
    syncLadderFromAdvanced();

    // Advanced popup open/close
    if (advancedBtn && advancedPopup) {
        advancedBtn.addEventListener('click', () => {
            advancedPopup.style.display = 'flex';
        });
    }
    const closeAdvancedPopup = () => {
        if (advancedPopup) advancedPopup.style.display = 'none';
    };
    if (advancedCloseBtn) {
        advancedCloseBtn.addEventListener('click', closeAdvancedPopup);
    }
    if (advancedPopup) {
        // Clicking the dimmed backdrop (outside the content) closes the popup.
        advancedPopup.addEventListener('click', (e) => {
            if (e.target === advancedPopup) closeAdvancedPopup();
        });
    }

    // Long-run auto-retry control (above the Advanced button).
    const autoRetryToggle = document.getElementById('auto-retry-toggle') as HTMLInputElement | null;
    const autoRetryCountInput = document.getElementById('auto-retry-count') as HTMLInputElement | null;
    if (autoRetryToggle && autoRetryCountInput) {
        autoRetryToggle.checked = autoRetryEnabledState;
        autoRetryCountInput.value = String(autoRetryCountState);
        autoRetryCountInput.disabled = !autoRetryEnabledState;

        autoRetryToggle.addEventListener('change', () => {
            autoRetryEnabledState = autoRetryToggle.checked;
            autoRetryCountInput.disabled = !autoRetryEnabledState;
            void saveLevelStates();
        });
        autoRetryCountInput.addEventListener('change', () => {
            const parsed = parseInt(autoRetryCountInput.value, 10);
            const clamped = Number.isFinite(parsed) ? Math.max(1, Math.min(999, parsed)) : autoRetryCountState;
            autoRetryCountState = clamped;
            autoRetryCountInput.value = String(clamped);
            void saveLevelStates();
        });
    }

    // Initial validation
    validateLevels();

    // Set up auto propagate checkbox listener (outside the if block since it's always present)


    // --- CRITICAL: Add missing event listeners for content and context textareas ---
    // This must happen AFTER the DOM elements are created and appended above
    // Use safe element access to prevent errors during DOM updates
    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
    // contextTextArea removed - using conditional context system
    const nodeTitleDisplay = document.getElementById('node-title-display') as HTMLElement;
    
    // RACE CONDITION FIX: Ensure elements exist before proceeding (safety check with retry mechanism)  
    if (!contentTextArea || !nodeTitleDisplay) {
        // During rapid UI updates, DOM might be in transition state - retry once after a short delay
        const missingElements = {
            contentTextArea: Boolean(contentTextArea),
            nodeTitleDisplay: Boolean(nodeTitleDisplay)
        };
        
        // Only log warning on second attempt (after retry)
        const isRetryAttempt = retryOptions?._isRetry;
        if (isRetryAttempt) {
            console.warn('Failed to find required DOM elements in renderNodeDetails after retry:', missingElements);
            return; // Exit gracefully if elements still don't exist after retry
        }
        
        // First attempt - schedule a retry after a short delay
        setTimeout(() => {
            // Mark this as a retry attempt to prevent infinite recursion
            renderNodeDetails({ _isRetry: true });
        }, 25); // 25ms retry delay
        return;
    }

    // Upgrade content textarea to enhanced UniversalTextEditor - Drop-in replacement!
    if (contentTextArea) {
        enhancedContentEditor = UniversalTextEditor.replace(contentTextArea, {
            mode: 'enhanced'  // Enable AI features and text transformation
        });
        
        // Content textarea - save content changes to node only on blur (when focus is lost)
        enhancedContentEditor.addEventListener('blur', () => {
            if (projectManager && selectedNodeId) {
                const node = projectManager.findNodeById(selectedNodeId);
                if (node) {
                    // Use version management system to update content with "edited" and "content_edited" tags
                    node.setContentWithTags(enhancedContentEditor!.value, ['edited', 'content_edited']);
                    // Save to storage immediately since this only happens on blur
                    void projectManager.saveToStorage();
                }
            }
        });
    }

    // Enhanced context editor removed - using conditional context system



    // Node title - save title changes to node
    if (nodeTitleDisplay) {
        nodeTitleDisplay.addEventListener('input', () => {
            if (projectManager && selectedNodeId) {
                const node = projectManager.findNodeById(selectedNodeId);
                if (node) {
                    // Use version management system to update title with "edited" and "title_edited" tags
                    node.setTitleWithTags(nodeTitleDisplay.textContent ?? '', ['edited', 'title_edited']);
                    // Save to storage with debounced approach
                    clearTimeout((nodeTitleDisplay as any)._saveTimeout);
                    (nodeTitleDisplay as any)._saveTimeout = void void setTimeout(() => {
                        void projectManager!.saveToStorage().catch(console.error);
                        // Re-render tree to show updated title
                        renderMultiProjectTree();
                    }, 1000); // Save after 1 second of no typing
                }
            }
        });
    }

    // Actions dropdown elements initialized
}

function initializeVersionNavigation(node: DocumentNode) {
    // Get all available versions (current content + all iterations from latest session)
    availableVersions = [];
    currentVersionIndex = 0;

    // Helper function to calculate total score
    const calculateTotalScore = (ratings: Rating[]): number => {
        if (!ratings || ratings.length === 0) return 0;
        return ratings.reduce((sum, rating) => sum + rating.actual, 0);
    };

    // Add current content as version (will be sorted by score)
    const currentChosenIteration = node.getChosenIteration();
    availableVersions.push({
        content: node.content,
        ratings: currentChosenIteration?.ratings ?? null,
        isCurrent: true,
        label: 'Current',
        totalScore: currentChosenIteration?.ratings ? calculateTotalScore(currentChosenIteration.ratings) : 0
    });

    // Add iterations from the latest generation session
    const latestSession = node.getLatestGenerationSession();
    if (latestSession && latestSession.iterations.length > 0) {
        latestSession.iterations.forEach((iteration) => {
            // Skip the chosen iteration since it's already included as current content
            if (!iteration.wasChosen) {
                availableVersions.push({
                    content: iteration.content,
                    ratings: iteration.ratings,
                    isCurrent: false,
                    label: '', // Will be set after sorting
                    timestamp: iteration.timestamp,
                    totalScore: calculateTotalScore(iteration.ratings)
                });
            }
        });
    }

    // Sort all versions by total score (highest first)
    availableVersions.sort((a, b) => b.totalScore - a.totalScore);

    // Assign clean labels based on score ranking
    availableVersions.forEach((version, index) => {
        if (version.isCurrent) {
            version.label = `Current (Score: ${version.totalScore})`;
        } else {
            version.label = `Version ${index + 1} (Score: ${version.totalScore})`;
        }
    });

    // Find the current content's new index after sorting
    currentVersionIndex = availableVersions.findIndex(v => v.isCurrent);

    // Update UI visibility and state
    updateVersionNavigationUI();
}

async function initializeUILogger(): Promise<void> {
    const { uiLogger } = await import('../utils/UILogger');
    
    // Initialize the logger
    uiLogger.initialize('ui-log-container');
    
    // Update stats display
    function updateLogStats(): void {
        const counts = uiLogger.getLogCountByLevel();
        const totalCount = uiLogger.getLogCount();
        
        const logCountElement = document.getElementById('log-count');
        const errorCountElement = document.getElementById('error-count');
        const warnCountElement = document.getElementById('warn-count');
        
        if (logCountElement) logCountElement.textContent = totalCount.toString();
        if (errorCountElement) errorCountElement.textContent = counts.error.toString();
        if (warnCountElement) warnCountElement.textContent = counts.warn.toString();
    }
    
    // Add intersection observer to refresh display when logger becomes visible
    const logContainer = document.getElementById('ui-log-container');
    if (logContainer && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    uiLogger.refreshDisplay();
                    updateLogStats();
                }
            });
        }, { threshold: 0.1 });
        
        observer.observe(logContainer);
    }
    
    // Add event listeners
    const logHeader = document.querySelector('.ui-log-header');
    if (logHeader) {
        logHeader.addEventListener('click', () => {
            uiLogger.toggle();
            // Refresh display after toggle
            setTimeout(() => {
                uiLogger.refreshDisplay();
                updateLogStats();
            }, 100);
        });
    }
    
    const clearBtn = document.getElementById('ui-log-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            uiLogger.clear();
            updateLogStats();
        });
    }
    
    const exportBtn = document.getElementById('ui-log-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const logs = uiLogger.exportLogs();
            const blob = new Blob([logs], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `expert-app-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    
    updateLogStats();
}

function updateVersionNavigationUI() {
    const versionNav = document.getElementById('version-navigation');
    const versionIndicator = document.getElementById('version-indicator');
    const prevBtn = document.getElementById('version-prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('version-next-btn') as HTMLButtonElement;
    const useVersionBtn = document.getElementById('use-this-version-btn') as HTMLButtonElement;

    if (!versionNav || !versionIndicator || !prevBtn || !nextBtn || !useVersionBtn) return;

    // Show/hide navigation based on whether there are multiple versions
    if (availableVersions.length > 1) {
        versionNav.style.display = 'flex';
        
        // Update indicator text - just show the version label
        const currentVersion = availableVersions[currentVersionIndex]!;
        versionIndicator.textContent = currentVersion.label;
        
        // Update button states
        prevBtn.disabled = currentVersionIndex === 0;
        nextBtn.disabled = currentVersionIndex === availableVersions.length - 1;
        
        // Show "Use This Version" button only if not on current version
        useVersionBtn.style.display = currentVersion.isCurrent ? 'none' : 'inline-block';
    } else {
        versionNav.style.display = 'none';
    }
}

function updateVersionContentDisplay() {
    const currentVersion = availableVersions[currentVersionIndex]!;
    if (!currentVersion) return;
    
    // Update the content textarea to show the selected version's content
    if (enhancedContentEditor) {
        enhancedContentEditor.value = currentVersion.content;
    } else {
        const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
        if (contentTextArea) {
            contentTextArea.value = currentVersion.content;
        }
    }
    
    // Update the ratings view if it's currently showing
    const showRatingsCheckbox = document.getElementById('show-ratings-checkbox') as HTMLInputElement;
    if (showRatingsCheckbox && showRatingsCheckbox.checked) {
        renderRatingsView();
    }
}









function renderRatingsView() {
    const ratingsDisplay = document.getElementById('ratings-display') as HTMLDivElement;
    if (!ratingsDisplay) {
        throw new Error('Ratings display element not found - DOM structure corrupted');
    }
    if (!projectManager) {
        throw new Error('ProjectManager is null in renderRatingsView - application state corrupted');
    }
    if (!selectedNodeId) {
        throw new Error('No node selected in renderRatingsView - UI state corrupted');
    }
    
    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) {
        throw new Error(`Node ${selectedNodeId} not found in renderRatingsView - data corruption detected`);
    }
    
    // Import RatingsRenderer dynamically
    void import('./components/RatingsRenderer').then(({ RatingsRenderer }) => {
        // Get ratings from the currently selected version
        const currentVersion = availableVersions[currentVersionIndex];
        let versionRatings: Rating[] = [];
        let versionLabel = 'Current';
        let timestampToShow: Date | null = null;
        
        if (currentVersion?.ratings) {
            versionRatings = currentVersion.ratings;
            versionLabel = currentVersion.label;
            timestampToShow = currentVersion.timestamp ?? null;
        } else if (currentVersion?.isCurrent) {
            // For current version, try to get ratings from chosen iteration
            const chosenIteration = node.getChosenIteration();
            if (chosenIteration && chosenIteration.ratings) {
                versionRatings = chosenIteration.ratings;
                timestampToShow = chosenIteration.timestamp ?? null;
            }
        }
        
        if (!versionRatings || versionRatings.length === 0) {
            ratingsDisplay.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: #6c757d; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                    <h4 style="margin: 0 0 1rem 0; color: #495057;">No Ratings Available</h4>
                    <p style="margin: 0 0 1rem 0; font-size: 0.9rem;">This ${versionLabel.toLowerCase()} content doesn't have any quality ratings yet.</p>
                    <p style="margin: 0 0 1.5rem 0; font-size: 0.85rem; color: #868e96;">
                        Ratings are created when content is generated through the AI system. If you edited the content manually, 
                        the previous ratings were cleared since they no longer apply to the modified text.
                    </p>
                    ${currentVersion?.isCurrent ? `
                        <button id="regenerate-ratings-btn" class="button button-primary">
                            ${BUTTON_LABELS.GENERATE_RATINGS}
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }
        
        // Convert ratings to expected format for unified Rating interface
        const formattedRatings = versionRatings.map((rating: Rating) => ({
            actual: rating.actual,
            goal: rating.goal,
            criterion: rating.criterion,
            justification: rating.justification,
            passed: rating.actual >= rating.goal
        }));
        
        // Render using shared component
        const options: import('./components/RatingsRenderer').RatingsDisplayOptions = {
            title: `Quality Ratings for ${versionLabel} Content`,
            showTimestamp: Boolean(timestampToShow),
            compact: false,
            showGoalLine: true,
            showJustification: true
        };
        
        if (timestampToShow) {
            options.timestamp = new Date(timestampToShow);
        }
        
        const ratingsHtml = RatingsRenderer.renderRatings(formattedRatings as Rating[], options);
        
        ratingsDisplay.innerHTML = ratingsHtml;
        
        // Add styles to head if not already present
        if (!document.querySelector('#ratings-renderer-styles')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'ratings-renderer-styles';
            styleElement.textContent = RatingsRenderer.getStyles();
            document.head.appendChild(styleElement);
        }
    }).catch(console.error);
}

// --- Helper Functions ---

function buildTreeHtml(node: DocumentNode, isProjectRoot: boolean = false): string {
    const isSelected = node.id === selectedNodeId;
    const hasChildren = node.children.length > 0;
    const isCollapsed = node.collapsed; // Use node's collapsed property instead of global set
    
    // Simple flexbox approach with clean indentation
    const indent = node.level * 20;
    let html = `<div class="tree-item" data-depth="${node.level}" style="margin-left: ${indent}px;">`;
    
    // Expand/collapse button or spacer
    if (hasChildren) {
        const expandIcon = isCollapsed ? '▶' : '▼';
        html += `<span class="tree-expand-btn" data-node-id="${node.id}" title="Click: toggle this node | Shift+Click: toggle this level | Ctrl+Click: toggle project | Alt+Click: toggle all">${expandIcon}</span>`;
    } else {
        html += `<span class="tree-expand-spacer"></span>`;
    }
    
    // Status icons (separate elements for horizontal layout)
    const { statusIcon, todoIcon, languageIcon, qualityIcon } = getNodeStatusIcons(node);
    html += `<span class="node-status-icon">${statusIcon}</span>`;
    if (todoIcon) {
        // Determine if this node has direct todos or just descendant todos
        const hasDirectTodos = nodesWithDirectTodos.has(node.id);
        const todoClass = hasDirectTodos ? 'node-todo-icon' : 'node-todo-icon-small';
        html += `<span class="${todoClass}">${todoIcon}</span>`;
    }
    if (qualityIcon) {
        const failing = node.getFailingRatings();
        const summary = failing.map(r => `${r.criterion} ${r.actual}/${r.goal}`).join(', ');
        const qualityTooltip = `Generation below quality goals: ${summary}`;
        html += `<span class="node-quality-icon" title="${qualityTooltip}">${qualityIcon}</span>`;
    }
    if (languageIcon && isProjectRoot) {
        // Get the project to show the actual language in tooltip
        const project = state.getProjects().find(p => p.rootNode.id === node.id);
        const projectLanguage = project ? project.getLanguage() : null;
        const tooltip = projectLanguage ? `Project language: ${projectLanguage}` : 'Project has language-specific setting';
        html += `<span class="node-language-icon" title="${tooltip}">${languageIcon}</span>`;
    }
    
    // Node title
    const nodeTypeClass = isProjectRoot ? 'project-root' : (hasChildren ? 'has-children' : 'leaf-node');
    const nodeClasses = `tree-node ${isSelected ? 'selected' : ''} ${nodeTypeClass}`;
    const statusTooltip = getNodeStatusTooltip(node);
    const tooltipAttr = statusTooltip ? ` title="${statusTooltip}"` : '';
    html += `<span class="${nodeClasses}" data-id="${node.id}"${tooltipAttr}>
                <span class="node-title">${node.title}</span>${node.isGenerating ? '<span class="spinner" style="width:12px; height:12px; border-width: 2px;"></span>' : ''}
             </span>`;
    
    html += `</div>`;
    
    // Add children if not collapsed
    if (hasChildren && !isCollapsed) {
        node.children.forEach(child => {
            html += buildTreeHtml(child, false);
        });
    }

    return html;
}







/**
 * Handle deletion of nodes at a specific layer relative to the selected node
 * @param relativeLevel The level relative to selected node (1 = direct children, 2 = grandchildren, etc.)
 */
function handleDeleteLayer(relativeLevel: number): void {
    if (!projectManager || !selectedNodeId) {
        alert('No node selected. Please select a node first.');
        return;
    }

    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) {
        alert('Selected node not found.');
        return;
    }

    // Use centralized level collection: convert relative to absolute level
    const absoluteLevel = node.level + relativeLevel;
    const nodesAtLevel = projectManager.getTreeService().getNodesAtTemplateLevel(node, absoluteLevel);
    if (nodesAtLevel.length === 0) {
        alert('No nodes found at the specified level.');
        return;
    }

    // Get layer information for user-friendly messaging
    const availableLayers = getAvailableLayersForDeletion(node);
    const layerInfo = availableLayers.find(layer => layer.relativeLevel === relativeLevel);
    if (!layerInfo) {
        alert('Layer information not found.');
        return;
    }

    const confirmMessage = `Are you sure you want to delete all ${nodesAtLevel.length} ${layerInfo.pluralName.toLowerCase()} under "${node.title}"?\n\nThis will permanently delete:\n- All ${nodesAtLevel.length} ${layerInfo.levelName.toLowerCase()} nodes and their content\n- All nested subnodes beneath those ${layerInfo.levelName.toLowerCase()}s\n- All generated summaries and history\n\nThe parent structure above ${layerInfo.levelName.toLowerCase()} level will remain intact.\n\nThis action cannot be undone.`;
    
    if (confirm(confirmMessage)) {
        let deletedCount = 0;
        for (const nodeToDelete of nodesAtLevel) {
            const success = projectManager.removeNode(nodeToDelete.id);
            if (success) {
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            void projectManager.saveToStorage().catch(console.error);
            
            // Re-render the UI to reflect the changes
            renderMultiProjectTree();
            void void renderNodeDetails();
            
            if (deletedCount === nodesAtLevel.length) {
                alert(`Successfully deleted all ${deletedCount} ${layerInfo.pluralName.toLowerCase()}.`);
            } else {
                alert(`Deleted ${deletedCount} out of ${nodesAtLevel.length} ${layerInfo.pluralName.toLowerCase()}. Some nodes may have failed to delete.`);
            }
        } else {
            alert(`Failed to delete any ${layerInfo.pluralName.toLowerCase()}. Please try again.`);
        }
    }
}

/**
 * Handle dropdown action by button ID
 * This function contains all the logic for dropdown actions that were moved out of the main switch statement
 */
function handleDropdownAction(buttonId: string): void {
    if (!projectManager) {
        throw new Error('ProjectManager is null in handleDropdownAction - application state corrupted');
    }
    if (!selectedNodeId) {
        throw new Error('No node selected in handleDropdownAction - UI state corrupted');
    }

    // Handle layer-specific delete actions (pattern: delete-layer-{relativeLevel})
    const deleteLayerMatch = buttonId.match(/^delete-layer-(\d+)$/);
    if (deleteLayerMatch?.[1]) {
        const relativeLevel = parseInt(deleteLayerMatch[1], 10);
        handleDeleteLayer(relativeLevel);
        return;
    }

    switch (buttonId) {
        case 'new-top-layer-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node || node.level !== 0) {
                    alert('This action is only available for root nodes.');
                    return;
                }

                void handleNewTopLayer(node);
            }
            break;

        case 'copy-to-new-project-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) {
                    alert('No node selected.');
                    return;
                }

                void handleCopyToNewProject(node);
            }
            break;

        case 'view-template-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) {
                    alert('No node selected.');
                    return;
                }

                if (node.level !== 0) {
                    alert('This action is only available for root nodes.');
                    return;
                }

                // Import and open the view template modal
                void import('./modals/ViewTemplateModal').then(({ showViewTemplateModal }) => {
                    showViewTemplateModal(node);
                }).catch(error => {
                    console.error('Failed to open view template modal:', error);
                    alert('Failed to open template viewer. Please try again.');
                });
            }
            break;

        case 'node-generate-content-action':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) {
                    throw new Error(`Node ${selectedNodeId} not found in node-generate-content-action - data corruption detected`);
                }

                // Check if node state is Final and warn user
                if (node.getState() === 'Final') {
                    const contentPreview = node.content.substring(0, 100) + (node.content.length > 100 ? '...' : '');
                    const confirmMessage = `This node contains final content that will be replaced.

Current content: "${contentPreview}"

Are you sure you want to generate new content and replace the existing content?

This action cannot be undone.`;
                    
                    if (!confirm(confirmMessage)) {
                        return;
                    }
                }
                
                // Use unified generation system - content only for this node
                void (async () => {
                    try {
                        showGenerationOverlay();
                        
                        // Import UnifiedGenerationService
                        const { UnifiedGenerationService } = await import('../project/UnifiedGenerationService');
                        
                        // Create service dependencies using existing projectManager services  
                        const unifiedService = new UnifiedGenerationService({
                            treeService: projectManager.getTreeService(),
                            contextService: projectManager.getContextService(),
                            promptService: projectManager.getPromptService(),
                            generationCoordinator: projectManager.getGenerationCoordinator(),
                            loopOrchestrator: (projectManager as any).loopOrchestrator,
                            settingsManager: projectManager.getSettingsManager(),
                            openRouterClient: (projectManager as any).openRouterClient,
                            eventEmitter: projectManager as any,
                            saveToStorage: () => projectManager!.saveToStorage(),
                            rootNode: projectManager.rootNode
                        });
                        
                        // Define generation levels - content only for this node
                        const levels = {
                            draftLevel: -1, // No children creation
                            contentLevel: node.level, // Generate content only for this level  
                            coherenceLevel: -1, // No coherence checking
                            autofixSeverity: -1, // No autofix
                            // pruneScope completely removed - was only needed for traditional context adjustment
                        };
                        
                        // Start unified generation
                        await unifiedService.generateWithLevels(node.id, levels);
                        
                        // Save to storage
                        await projectManager.saveToStorage();
                        
                        // Content generation completed
                        
                    } catch (error) {
                        console.error('Content generation failed:', error);
                        
                        // Use rich error modal instead of basic alert
                        if (error instanceof Error) {
                            // Check if this is a content filtering error
                            const isContentFiltering = error.message.includes('Content analysis blocked by AI safety system') ||
                                                      error.name === 'ContentFilterError';
                            
                            if (isContentFiltering) {
                                import('./modals').then(({ GenerationErrorService }) => {
                                    const errorService = GenerationErrorService.getInstance();
                                    void errorService.showContentFilteringError(error, {
                                        purpose: 'Content Generation',
                                        operation: `Content generation for "${node.title}"`,
                                        nodeTitle: node.title
                                    });
                                }).catch(console.error);
                            } else {
                                import('./modals').then(({ GenerationErrorService }) => {
                                    const errorService = GenerationErrorService.getInstance();
                                    void errorService.showContentGenerationError(error, node.title);
                                }).catch(console.error);
                            }
                        } else {
                            alert(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                    } finally {
                        clearProgressUI();
                        hideGenerationOverlay();
                    }
                })();
            }
            break;

        case 'node-generate-all-action':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.isLeaf) {
                    alert(`This node is a leaf node (${node.template[node.level] ?? 'final level'}) and cannot have children.\n\nLeaf nodes are the final level in your project structure and are meant to contain the actual content rather than generate child nodes.`);
                    return;
                }

                if (node.getState() === 'Empty') {
                    alert('This node has no content yet. Please generate content for this node first, then use "Generate All Children" to create child nodes based on that content.');
                    return;
                }

                // Use unified generation system - create children and generate content for deeper levels
                void (async () => {
                    try {
                        showGenerationOverlay();
                        
                        // Import UnifiedGenerationService
                        const { UnifiedGenerationService } = await import('../project/UnifiedGenerationService');
                        
                        // Create service dependencies using existing projectManager services  
                        const unifiedService = new UnifiedGenerationService({
                            treeService: projectManager.getTreeService(),
                            contextService: projectManager.getContextService(),
                            promptService: projectManager.getPromptService(),
                            generationCoordinator: projectManager.getGenerationCoordinator(),
                            loopOrchestrator: (projectManager as any).loopOrchestrator,
                            settingsManager: projectManager.getSettingsManager(),
                            openRouterClient: (projectManager as any).openRouterClient,
                            eventEmitter: projectManager as any,
                            saveToStorage: () => projectManager!.saveToStorage(),
                            rootNode: projectManager.rootNode
                        });
                        
                        // Define generation levels - create children and generate content for them
                        const levels = {
                            draftLevel: node.level + 1, // Create children one level down
                            contentLevel: node.level + 1, // Generate content for the children
                            coherenceLevel: node.level, // Check coherence at parent level
                            autofixSeverity: -1, // No autofix
                            // pruneScope completely removed - was only needed for traditional context adjustment
                        };
                        
                        // Start unified generation
                        await unifiedService.generateWithLevels(node.id, levels);
                        
                        // Save to storage
                        await projectManager.saveToStorage();
                        
                        // Bulk generation completed
                        
                    } catch (error) {
                        console.error('Bulk generation failed:', error);
                        
                        // Use rich error modal instead of basic alert
                        if (error instanceof Error) {
                            // Check if this is a content filtering error
                            const isContentFiltering = error.message.includes('Content analysis blocked by AI safety system') ||
                                                      error.name === 'ContentFilterError';
                            
                            if (isContentFiltering) {
                                import('./modals').then(({ GenerationErrorService }) => {
                                    const errorService = GenerationErrorService.getInstance();
                                    void errorService.showContentFilteringError(error, {
                                        purpose: 'Bulk Generation',
                                        operation: `Bulk generation for "${node.title}"`,
                                        nodeTitle: node.title
                                    });
                                }).catch(console.error);
                            } else {
                                import('./modals').then(({ GenerationErrorService }) => {
                                    const errorService = GenerationErrorService.getInstance();
                                    void errorService.showAIError(error, {
                                        title: 'Bulk Generation Failed',
                                        purpose: 'Bulk Generation',
                                        operation: `Bulk generation for "${node.title}"`
                                    });
                                }).catch(console.error);
                            }
                        } else {
                            alert(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                    } finally {
                        clearProgressUI();
                        hideGenerationOverlay();
                    }
                })();
            }
            break;



        case 'add-child-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.isLeaf) {
                    const nodeLevelName = node.template[node.level] ?? 'final level';
                    alert(`This node is a leaf node (${nodeLevelName}) and cannot have children.\n\nLeaf nodes are the final level in your project structure and are meant to contain the actual content rather than generate child nodes.`);
                    return;
                }

                // Open the Add Child Node Modal
                openAddChildNodeModal(node, node.id)
                    .then((_modal) => {
                        // Add Child Node modal opened
                        // The modal factory handles UI refresh automatically
                    })
                    .catch((error) => {
                        console.error('❌ Failed to open Add Child Node modal:', error);
                        alert('Failed to open Add Child Node dialog. Please try again.');
                    });
            }
            break;

        case 'delete-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.level === 0) {
                    // This is a project root node - delete the entire project
                    state.getProjects();
                    
                    const confirmMessage = `Are you sure you want to delete the entire project "${node.title}"?\n\nThis will permanently delete:\n- The project and all its content\n- All child nodes and their content\n- All generated summaries and history\n\nThis action cannot be undone.`;
                    
                    if (confirm(confirmMessage)) {
                        // Store the project to delete for storage cleanup
                        const projectToDelete = projectManager;
                        
                        // Remove from in-memory state
                        state.removeProject(node.id);
                        
                        // Handle storage cleanup
                        (async () => {
                            try {
                                // If this was the last project, clear all storage
                                const remainingProjects = state.getProjects();
                                if (remainingProjects.length === 0) {
                                    // Clear all project storage
                                    if (projectToDelete) {
                                        await projectToDelete.clearAllProjectsFromStorage();
                                    }
                                } else {
                                    // First, explicitly remove the deleted project from IndexedDB
                                    const storage = await import('../StorageService').then(async m => m.StorageService.getInstance());
                                    if (storage.isIndexedDB()) {
                                        const indexedDBService = (storage as any).indexedDBService;
                                        if (indexedDBService) {
                                            await indexedDBService.delete('projects', node.id);
                                        }
                                    }
                                    
                                    // Then save the updated project list
                                    const remainingProject = state.getActiveProject();
                                    if (remainingProject) {
                                        await remainingProject.saveToStorage();
                                    }
                                }
                            } catch (error) {
                                console.error('Failed to update storage after project deletion:', error);
                            }
                        })();
                        
                        // If this was the last project, clear selection and show empty state
                        const remainingProjects = state.getProjects();
                        if (remainingProjects.length === 0) {
                            selectedNodeId = null;
                            projectManager = null;
                            
                            // Show empty state
                            const nodeDetails = getElementById('node-details');
                            nodeDetails.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;"><h3>No Projects</h3><p>All projects have been deleted. Create a new project to get started.</p></div>';
                            
                            // Render empty tree
                            renderMultiProjectTree();
                        } else {
                            // Re-initialize the UI with the remaining projects
                            void initializeProjectUI();
                        }
                    }
                } else {
                    // This is a regular node - delete just this node and its children
                    const hasChildren = node.children.length > 0;
                    const childrenText = hasChildren ? `\n- ${node.children.length} child node(s) and all their content` : '';
                    
                    const confirmMessage = `Are you sure you want to delete "${node.title}"?\n\nThis will permanently delete:\n- This node and its content\n- Generated summary and history${childrenText}\n\nThis action cannot be undone.`;
                    
                    if (confirm(confirmMessage)) {
                        const success = projectManager.removeNode(node.id);
                        if (success) {
                            void projectManager.saveToStorage().catch(console.error);
                            
                            // Select the parent node or project root
                            const parentNode = node.parentId ? projectManager.findNodeById(node.parentId) : projectManager.rootNode;
                            selectedNodeId = parentNode ? parentNode.id : projectManager.rootNode.id;
                            
                            // Re-render the UI
                            renderMultiProjectTree();
                            void void renderNodeDetails();
                        } else {
                            alert('Failed to delete the node. It may be a root node or have an invalid parent.');
                        }
                    }
                }
            }
            break;

        case 'delete-subnodes-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.children.length === 0) {
                    alert('This node has no subnodes to delete.');
                    return;
                }

                const childCount = node.children.length;
                const confirmMessage = `Are you sure you want to delete all ${childCount} subnode(s) of "${node.title}"?\n\nThis will permanently delete:\n- All ${childCount} child nodes and their content\n- All nested subnodes and their content\n- All generated summaries and history\n\nThe parent node "${node.title}" will remain intact.\n\nThis action cannot be undone.`;
                
                if (confirm(confirmMessage)) {
                    // Create a copy of the children array since we'll be modifying the original
                    const childrenToDelete = [...node.children];
                    
                    let deletedCount = 0;
                    for (const child of childrenToDelete) {
                        const success = projectManager.removeNode(child.id);
                        if (success) {
                            deletedCount++;
                        }
                    }
                    
                    if (deletedCount > 0) {
                        void projectManager.saveToStorage().catch(console.error);
                        
                        // Re-render the UI to reflect the changes
                        renderMultiProjectTree();
                        void renderNodeDetails();
                        
                        if (deletedCount === childCount) {
                            alert(`Successfully deleted all ${deletedCount} subnodes.`);
                        } else {
                            alert(`Deleted ${deletedCount} out of ${childCount} subnodes. Some nodes may have failed to delete.`);
                        }
                    } else {
                        alert('Failed to delete any subnodes. Please try again.');
                    }
                }
            }
            break;

        case 'export-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Import and open export modal
                void import('./modal-manager').then(({ openExportModal }) => {
                    openExportModal(projectManager!, node);
                }).catch(_error => {
                    alert('Failed to open export dialog. Please try again.');
                });
            }
            break;

        case 'import-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Create file input element
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json';
                fileInput.style.display = 'none';
                
                fileInput.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    const file = target.files?.[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const content = event.target?.result as string;
                            const importData = JSON.parse(content);
                            
                            // Validate and import
                            if (projectManager) {
                                importNodeData(projectManager, node.id, importData);
                                
                                // Refresh the UI to show imported content
                                renderProjectUI(projectManager);
                            }
                            
                        } catch (error) {
                            console.error('Import failed:', error);
                            alert('Import failed: ' + (error instanceof Error ? error.message : 'Invalid JSON file'));
                        }
                    };
                    
                    reader.onerror = () => {
                        alert('Failed to read file. Please try again.');
                    };
                    
                    reader.readAsText(file);
                });
                
                // Trigger file selection
                document.body.appendChild(fileInput);
                fileInput.click();
                document.body.removeChild(fileInput);
            }
            break;

        case 'chat-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;
                
                // Import and open chat modal
                void import('./modal-manager').then(({ openNodeChatModal }) => {
                    openNodeChatModal(projectManager!, node);
                }).catch(error => {
                    console.error('Failed to open chat modal:', error);
                    alert('Failed to open chat dialog. Please try again.');
                });
            }
            break;

        case 'xml-story-creation-btn':
            {
                // Use the centralized handler from buttonHandlers
                const handler = buttonHandlers['xml-story-creation-btn'];
                if (handler) {
                    handler(new Event('click'));
                }
            }
            break;

        case 'guided-review-btn':
            {
                const handler = buttonHandlers['guided-review-btn'];
                if (handler) {
                    handler(new Event('click'));
                }
            }
            break;

        case 'node-statistics-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;
                void import('./modals/NodeStatisticsModal').then(({ openNodeStatisticsModal }) => {
                    openNodeStatisticsModal(node);
                }).catch((error: unknown) => {
                    console.error('Failed to open Statistics modal:', error);
                    alert('Failed to open Statistics. Please try again.');
                });
            }
            break;

        case 'polish-text-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;
                
                // Check if node has content to polish
                if (!node.content || node.content.trim() === '') {
                    alert('This node has no content to polish. Please add some content first.');
                    return;
                }
                
                // Import and open polisher modal
                void import('./modals/PolisherModal').then(async ({ PolisherModal }) => {
                    const polisherModal = new PolisherModal(
                        state.getSettingsManager()!,
                        state.getOpenRouterClient()!
                    );
                    await polisherModal.initialize();
                    await polisherModal.openWithNode(node);
                }).catch(error => {
                    console.error('Failed to open polisher modal:', error);
                    alert('Failed to open text polisher. Please try again.');
                });
            }
            break;

        case 'edit-context-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;
                
                // Import and open context editor modal
                // Context editor modal removed - using conditional context system
                console.log('Context editor removed - use conditional context editor instead');
            }
            break;

        // node-propagate-context-btn and node-extract-context-btn removed - using conditional context system

        case 'check-coherence-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Create coherence service instance
                const coherenceService = new CoherenceService(
                    state.getOpenRouterClient()!,
                    state.getSettingsManager()!
                );

                // Check if node is eligible for coherence analysis
                if (!coherenceService.isNodeEligible(node)) {
                    const reason = coherenceService.getIneligibilityReason(node);
                    alert(`Cannot analyze coherence: ${reason}`);
                    return;
                }

                // Create and show modal in loading state - pass the active project root
                const analysisModal = new CoherenceModal(projectManager.rootNode);
                void analysisModal.openInLoadingState(node);
                
                // Prepare frozen settings using centralized utility
                void import('./utils/CoherenceUtils').then(({ CoherenceUtils }) => {
                    const frozenSettings = CoherenceUtils.prepareFrozenSettings(state.getSettingsManager()!);
                    
                    // Perform analysis with proper frozen settings (same as UnifiedGenerationService)
                    coherenceService.analyzeCoherence(node, frozenSettings)
                        .then((result) => {
                            console.log('Coherence analysis completed, updating modal with results:', result);
                            // Update modal with results
                            analysisModal.updateWithResults(result);
                        })
                        .catch((error) => {
                            console.error('Coherence analysis failed:', error);
                            // Close loading modal and show error
                            void analysisModal.close();
                            alert('Coherence analysis failed: ' + error.message);
                        });
                });
            }
            break;

        case 'detect-redundant-children-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.children.length < 2) {
                    alert('Node must have at least 2 children for redundancy analysis.');
                    return;
                }

                // Create and open redundancy detector modal
                void import('./modals/RedundancyDetectorModal').then(({ RedundancyDetectorModal }) => {
                    const modal = new RedundancyDetectorModal({
                        id: 'redundancy-detector',
                        parentNode: node,
                        projectManager: projectManager!
                    });
                    void modal.open();
                }).catch((error) => {
                    console.error('Failed to open Redundancy Detector:', error);
                    alert('Failed to open redundancy detector. Please try again.');
                });
            }
            break;

        case 'detect-logic-errors-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Count leaf nodes under this parent
                const countLeafNodes = (parentNode: DocumentNode): number => {
                    let count = 0;
                    const traverse = (currentNode: DocumentNode) => {
                        if (!currentNode.children || currentNode.children.length === 0) {
                            count++;
                        } else {
                            for (const child of currentNode.children) {
                                traverse(child);
                            }
                        }
                    };
                    
                    if (parentNode.children) {
                        for (const child of parentNode.children) {
                            traverse(child);
                        }
                    }
                    
                    return count;
                };

                const leafCount = countLeafNodes(node);
                if (leafCount === 0) {
                    alert('Node must have leaf nodes with content for logic error analysis.');
                    return;
                }

                // Create and open logic error detector modal
                void import('./modals/LogicErrorDetectorModal').then(({ LogicErrorDetectorModal }) => {
                    const modal = new LogicErrorDetectorModal({
                        id: 'logic-error-detector',
                        parentNode: node,
                        projectManager: projectManager!
                    });
                    void modal.open();
                }).catch((error) => {
                    console.error('Failed to open Logic Error Detector:', error);
                    alert('Failed to open logic error detector. Please try again.');
                });
            }
            break;

        case 'fix-logic-outline-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                const incompleteTodos = node.getIncompleteTodos();
                if (incompleteTodos.length === 0) {
                    alert('Node must have incomplete todo items to fix logic in outline.');
                    return;
                }

                // Create and open logic outline fixer modal
                void import('./modals/LogicOutlineFixerModal').then(({ LogicOutlineFixerModal }) => {
                    const modal = new LogicOutlineFixerModal({
                        id: 'logic-outline-fixer',
                        node: node,
                        projectManager: projectManager!
                    });
                    void modal.open();
                }).catch((error) => {
                    console.error('Failed to open Logic Outline Fixer:', error);
                    alert('Failed to open logic outline fixer. Please try again.');
                });
            }
            break;



        case 'batch-update-btn':
            {
                if (!projectManager || !selectedNodeId) return;
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Import and open batch update modal
                import('./components/BatchUpdateModal').then(({ BatchUpdateModal }) => {
                    if (!projectManager) {
                        throw new Error('ProjectManager became null during async import - application state corrupted');
                    }
                    
                    // Create modal container
                    const modalContainer = document.createElement('div');
                    modalContainer.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.5);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 1000;
                    `;

                    // Create modal content
                    const modalContent = document.createElement('div');
                    modalContent.style.cssText = `
                        width: 95%;
                        max-width: 1200px;
                        height: 85%;
                        max-height: 800px;
                        background: white;
                        border-radius: 12px;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                        overflow: hidden;
                        position: relative;
                    `;

                    modalContainer.appendChild(modalContent);
                    document.body.appendChild(modalContainer);

                    // Create and render batch update modal
                    const batchModal = new BatchUpdateModal(projectManager.rootNode, modalContent, {
                        onClose: () => {
                            document.body.removeChild(modalContainer);
                            // Refresh UI after batch update
                            if (projectManager) {
                                renderProjectUI(projectManager);
                            }
                        }
                    });

                    batchModal.render();

                    // Close modal when clicking outside
                    modalContainer.addEventListener('click', (e) => {
                        if (e.target === modalContainer) {
                            document.body.removeChild(modalContainer);
                            if (projectManager) {
                                renderProjectUI(projectManager);
                            }
                        }
                    });

                    // Close modal with Escape key
                    const handleEscape = (e: KeyboardEvent) => {
                        if (e.key === 'Escape') {
                            document.body.removeChild(modalContainer);
                            if (projectManager) {
                                renderProjectUI(projectManager);
                            }
                            document.removeEventListener('keydown', handleEscape);
                        }
                    };
                    document.addEventListener('keydown', handleEscape);
                    
                }).catch(error => {
                    console.error('Failed to open batch update modal:', error);
                    alert('Failed to open batch update dialog. Please try again.');
                });
            }
            break;

        case 'tag-manager-btn':
            {
                if (!projectManager || !selectedNodeId) return;
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Import and open tag manager modal
                import('./modals/TagManagerModal').then(({ TagManagerModal }) => {
                    if (!projectManager) {
                        throw new Error('ProjectManager became null during async import - application state corrupted');
                    }
                    
                    const tagModal = new TagManagerModal(node, {
                        onClose: () => {
                            // Refresh UI after tag operations
                            if (projectManager) {
                                renderMultiProjectTree();
                                void renderNodeDetails();
                            }
                        }
                    });

                    void tagModal.open();
                    
                }).catch(error => {
                    console.error('Failed to open tag manager modal:', error);
                    alert('Failed to open tag manager. Please try again.');
                });
            }
            break;

        case 'search-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;
                
                void import('./modals/SearchModal').then(({ SearchModal }) => {
                    const searchModal = new SearchModal();
                    searchModal.openForNode(node);
                }).catch((error: unknown) => {
                    console.error('Failed to open search modal:', error);
                    alert('Failed to open search. Please try again.');
                });
            }
            break;

        case 'set-project-language-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node || node.level !== 0) {
                    alert('Please select a project root to set the project language.');
                    return;
                }

                void handleSetProjectLanguage();
            }
            break;

        default:
            console.warn('Unknown dropdown action:', buttonId);
    }
}

export async function setupEventListeners() {

    
    // Use EventManager for robust event handling that survives DOM replacements
    const { eventManager } = await import('./event-manager');
    
    // Clear any existing manual listeners to prevent conflicts
    removeAllListeners();
    
    // Set up event delegation using EventManager for all button clicks
    const mainContent = getElementById('main-content');
    if (!mainContent) {
        console.error('❌ Main content not found for event setup');
        return;
    }
    
    // Remove existing event manager setup to prevent duplicates
    if ((mainContent as any)._eventManagerSetup) {

        return;
    }
    
    // Set up delegated click events for all buttons
    eventManager.addDelegatedEvent(mainContent, 'click', 'button[id]', (event: Event) => {
        // Use currentTarget (the button) instead of target (which might be a child element like an arrow span)
        const button = event.currentTarget as HTMLButtonElement;
        if (!button?.id) return;
        
        const handler = buttonHandlers[button.id];
        if (handler) {
            event.preventDefault();
            event.stopPropagation();
            // Button click handled (logging removed to reduce noise)
            handler(event);
        }
    });
    
    // Mark as set up to prevent duplicate setup
    (mainContent as any)._eventManagerSetup = true;
    
    // Set up global Ctrl+F search handler
    setupGlobalSearchHandler();
    
    // Set up delegated change events using EventManager  
    eventManager.addDelegatedEvent(mainContent, 'change', 'select[id], input[id]', async (e: Event) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;

        if (e.target.id === 'active-profile-selector') {
            const select = e.target as HTMLSelectElement;
            
            // Use centralized ProfileManagerService for consistent profile switching
            const { getProfileManagerService } = await import('./services/ProfileManagerService');
            const profileManager = getProfileManagerService();
            
            await profileManager.switchToProfile(select.value);
            
            // Force refresh of node details to pick up new profile settings
            if (selectedNodeId) {
                void renderNodeDetails();
            }
        } else if (e.target.id === 'draft-level-selector') {
            const select = e.target as HTMLSelectElement;
            draftLevelState = parseInt(select.value);
            void saveLevelStates();
        } else if (e.target.id === 'content-level-selector') {
            const select = e.target as HTMLSelectElement;
            contentLevelState = parseInt(select.value);
            void saveLevelStates();
        // context-prune-level-selector removed - using conditional context system
        } else if (e.target.id === 'coherence-level-selector') {
            const select = e.target as HTMLSelectElement;
            coherenceLevelState = parseInt(select.value);
            void saveLevelStates();
        } else if (e.target.id === 'autofix-severity-selector') {
            const select = e.target as HTMLSelectElement;
            autofixSeverityState = parseInt(select.value);
            void saveLevelStates();
        // prune-scope-selector removed - prune scope UI removed

        } else if ((e.target as HTMLInputElement).name === 'generation-type') {
            // Handle generation type radio button changes
            const radio = e.target as HTMLInputElement;
            const childrenOptions = document.getElementById('children-generation-options');
            const countContainer = document.querySelector('.count-container') as HTMLElement;
            
            if (radio.value === 'children') {
                if (childrenOptions) childrenOptions.style.display = 'block';
                if (countContainer) countContainer.style.display = 'flex';
            } else {
                if (childrenOptions) childrenOptions.style.display = 'none';
                if (countContainer) countContainer.style.display = 'none';
            }
        }
    });
}

export async function initializeProjectUI(manager?: ProjectManager) {
    const activeProject = manager ?? state.getActiveProject();
    projectManager = activeProject;
    
    // Initialize centralized profile management
    const { getProfileManagerService } = await import('./services/ProfileManagerService');
    const profileManager = getProfileManagerService();
    
    // Set up profile change synchronization for both selectors
    profileManager.onProfileChange(async () => {
        await refreshGlobalProfileSelector();
    });
    
    // Update modal factory dependencies if we have an active project
    if (activeProject) {
        selectedNodeId = activeProject.rootNode.id;
        
        try {
            const modalFactory = getDefaultModalFactory();
            modalFactory.updateDependencies({ projectManager: activeProject });
        } catch (error) {
            // Modal factory not initialized yet
        }
    }
    
    // Load the checkbox states from storage
    await loadLevelStates();
    
    // Set sensible defaults for first-time usage if no states were loaded
    if (draftLevelState === -1 && contentLevelState === -1 && coherenceLevelState === -1) {
        // First time - set some sensible defaults
        if (activeProject) {
            const currentNode = activeProject.findNodeById(selectedNodeId ?? activeProject.rootNode.id);
            if (currentNode) {
                draftLevelState = currentNode.level; // Create children at current level
                contentLevelState = currentNode.level; // Generate content at current level
                // contextPruneLevelState removed - using conditional context system
                coherenceLevelState = -1; // No coherence checking by default
            }
        }
    }

    const mainContent = getElementById('main-content');
    
    // Get profile information for the global selector
    const settingsManager = state.getSettingsManager();
    
    // Wait for SettingsManager initialization to complete before reading profile data
    if (settingsManager) {
        await settingsManager.waitForInitialization();
    }
    
    const profileNames = settingsManager?.getProfileNames() ?? [];
    const activeProfileName = settingsManager?.getLastUsedProfileName() ?? 'default';
    
    const profileOptions = profileNames.map(name => 
        `<option value="${name}" ${activeProfileName === name ? 'selected' : ''}>${name}</option>`
    ).join('');

    mainContent.innerHTML = `
        <style>
            /* === LAYOUT COORDINATION === */
            .main-layout-container {
                padding: 0 2rem;
                max-width: 100%;
                box-sizing: border-box;
            }
            
            #global-profile-bar {
                background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
                border-bottom: 1px solid #e5e7eb;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                padding: 0 2rem;
                display: flex;
                align-items: center;
                margin-bottom: 1rem;
                min-height: 60px;
                box-sizing: border-box;
            }
            
            /* Override enhanced-layout.css container styles */
            #project-container { 
                display: flex !important; 
                gap: 1rem !important; 
                align-items: flex-start !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                background-color: transparent !important;
                min-height: auto !important;
            }
            
            /* #project-tree styling now completely handled by enhanced-layout.css */
            #node-details { flex: 2 !important; }
            
            /* Professional Top Bar Groups */
            .top-bar-group {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.75rem 1.25rem;
                border-right: 1px solid #e5e7eb;
                height: 100%;
                box-sizing: border-box;
            }
            
            .top-bar-group:first-child {
                padding-left: 0;
            }
            
            .top-bar-group:last-child {
                border-right: none;
                margin-left: auto;
                padding-right: 0;
            }
            
            .top-bar-group.settings-group {
                background: rgba(59, 130, 246, 0.02);
            }
            
            .top-bar-group.monitoring-group {
                background: rgba(16, 185, 129, 0.02);
            }
            
            .top-bar-group.actions-group {
                background: rgba(239, 68, 68, 0.02);
            }
            
            /* Consistent Element Heights */
            .top-bar-element {
                height: 40px;
                display: flex;
                align-items: center;
                border-radius: 6px;
                transition: all 0.2s ease;
            }
            
            /* Professional Labels */
            .top-bar-label {
                font-weight: 600;
                font-size: 0.9rem;
                color: #374151;
                white-space: nowrap;
                margin-right: 0.5rem;
            }
            
            /* Standardized Selects */
            .top-bar-select {
                height: 40px;
                padding: 0 0.75rem;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 0.9rem;
                background: white;
                color: #374151;
                min-width: 180px;
                transition: all 0.2s ease;
            }
            
            .top-bar-select:hover {
                border-color: #9ca3af;
            }
            
            .top-bar-select:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            /* Professional Checkbox Container */
            .checkbox-container {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 0.75rem;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
            }
            
            .checkbox-container:hover {
                background: rgba(59, 130, 246, 0.05);
            }
            
            .checkbox-container input[type="checkbox"] {
                margin: 0;
                accent-color: #3b82f6;
            }
            
            .checkbox-container label {
                font-size: 0.9rem;
                font-weight: 500;
                color: #374151;
                cursor: pointer;
                margin: 0;
            }
            
            /* Progress Report Styling */
            .progress-report {
                font-size: 0.75rem;
                color: #6b7280;
                font-style: italic;
                margin-top: 0.25rem;
                padding-left: 1.75rem;
            }
            
            /* Group Titles */
            .group-title {
                font-size: 0.7rem;
                font-weight: 700;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 0.25rem;
                padding: 0 0.5rem;
            }
            
            #global-language-selector {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            #global-language-selector .language-selector {
                margin-bottom: 0;
            }
            
            #global-language-selector .language-selector-dropdown {
                height: 40px;
                padding: 0 0.75rem;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 0.9rem;
                background: white;
                min-width: 180px;
            }
            
            /* === Tree Layout Handled by enhanced-layout.css === */
            /* All tree styles moved to static CSS for consistent dev/production behavior */
            .details-view { background-color: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .details-view h2, .details-view h3 { margin-top: 0; }
            .details-view textarea, .details-view select, .details-view input { width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--secondary-300); }
            .details-view .form-group { margin-bottom: 1rem; }
            .action-buttons { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
            .foldable-content { display: block; }
            .foldable-content.collapsed { display: none; }
            .spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid rgba(0,0,0,0.1);
                border-radius: 50%;
                border-top-color: var(--primary-500);
                animation: spin 1s ease-in-out infinite;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
            
            /* === RESPONSIVE LAYOUT COORDINATION === */
            @media (max-width: 1024px) {
                #global-profile-bar {
                    padding: 0 1.5rem;
                }
                
                #project-container {
                    padding: 0 !important;
                }
                
                .main-layout-container {
                    padding: 0 1.5rem;
                }
            }
            
            @media (max-width: 768px) {
                #global-profile-bar {
                    padding: 0 1rem;
                    flex-direction: column;
                    gap: 0.75rem;
                    align-items: stretch;
                    min-height: auto;
                    padding-top: 1rem;
                    padding-bottom: 1rem;
                }
                
                #project-container {
                    padding: 0 !important;
                    flex-direction: column !important;
                    gap: 1.5rem !important;
                }
                
                .main-layout-container {
                    padding: 0 1rem;
                }
                
                .top-bar-group {
                    border-right: none;
                    border-bottom: 1px solid #e5e7eb;
                    padding: 0.75rem 0;
                }
                
                .top-bar-group:first-child {
                    padding-left: 0;
                }
                
                .top-bar-group:last-child {
                    border-bottom: none;
                    margin-left: 0;
                    padding-right: 0;
                }
                
                #project-tree {
                    max-width: none !important;
                    flex: none !important;
                }
                
                #node-details {
                    flex: none !important;
                }
            }
            
            @media (max-width: 480px) {
                #global-profile-bar {
                    padding: 0 0.75rem;
                }
                
                #project-container {
                    padding: 0 !important;
                }
                
                .main-layout-container {
                    padding: 0 0.75rem;
                }
            }
        </style>
        <div id="global-profile-bar">
            <!-- Settings Group -->
            <div class="top-bar-group settings-group">
                <div class="top-bar-element">
                    <label for="active-profile-selector" class="top-bar-label">Profile:</label>
                    <select id="active-profile-selector" class="top-bar-select">${profileOptions}</select>
                </div>
                <div class="top-bar-element">
                    <label class="top-bar-label">Language:</label>
                    <div id="global-language-selector">
                        <div id="language-selector-container"></div>
                    </div>
                </div>
            </div>
            
            <!-- Monitoring Group -->
            <div class="top-bar-group monitoring-group">
                <div class="top-bar-element">
                    <div class="checkbox-container">
                        <input type="checkbox" id="ai-interactions-checkbox">
                        <label for="ai-interactions-checkbox">${AI_ASSISTANT_EMOJI} See AI interactions</label>
                    </div>
                </div>
                <div id="ai-progress-report" class="progress-report" style="display: none;">
                    <!-- AI progress will appear here -->
                </div>
            </div>
            
            <!-- Actions Group -->
            <div class="top-bar-group actions-group">

                <div id="deterministic-child-creation-container" style="display: none; align-items: center; margin-right: 0.5rem;">
                    <input type="checkbox" id="deterministic-child-creation-checkbox" ${deterministicChildCreationState ? 'checked' : ''} style="margin-right: 0.5rem; cursor: pointer;" />
                    <label for="deterministic-child-creation-checkbox" style="font-size: 0.9rem; color: #374151; cursor: pointer; user-select: none; white-space: nowrap;">Deterministic child creation</label>
                </div>
                <button id="generation-explainer-btn" class="help-button top-bar-element" title="How generation works" style="width: 1.6rem; height: 1.6rem; border-radius: 50%; border: 1px solid #6c757d; background: #f8f9fa; color: #6c757d; font-size: 0.8rem; font-style: italic; font-weight: 700; font-family: Georgia, 'Times New Roman', serif; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; margin-right: 1rem;">
                    i
                </button>
                <button id="open-reader-btn" class="button button-primary top-bar-element" style="margin-right: 1rem;">📖 Reader View</button>
            </div>
        </div>
        <div id="project-container">
            <div id="project-tree"></div>
            <div id="node-details"></div>
        </div>
        
        <!-- AI Interactions Overlay -->
        <div id="ai-interactions-overlay" style="display: none;">
            <div class="ai-modal-content">
                <div class="ai-overlay-header">
                    <h3>${AI_ASSISTANT_EMOJI} AI Interaction</h3>
                    <button id="close-ai-overlay" class="close-btn">&times;</button>
                </div>
                <div class="ai-overlay-content">
                    <div class="ai-prompt-section">
                        <h4>📤 Prompt:</h4>
                        <div id="ai-prompt-content" class="ai-content-box"></div>
                    </div>
                    <div class="ai-response-section">
                        <h4>📥 Response:</h4>
                        <div id="ai-response-content" class="ai-content-box"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Initialize language selector - DECOUPLED: only changes global default
    const languageContainer = getElementById('language-selector-container');
    if (languageContainer && settingsManager) {
        new LanguageSelector(languageContainer, {
            currentLanguage: settingsManager.getGlobalLanguage(),
            onLanguageChange: async (language: string) => {
                // Only update global default language
                await settingsManager.setLanguage(language);
                
                // DECOUPLED: No longer automatically syncs to active project
                // Users must use "Set Project Language" button to explicitly copy global to project
            }
        });
    }
    
    // Render the multi-project tree (event listeners are set up once in main.ts)
    renderMultiProjectTree();
    
    // Global abort button is now always visible
    
    // Render node details if we have a selected node
    if (selectedNodeId) {
        void renderNodeDetails();
    } else {
        const nodeDetails = getElementById('node-details');
        nodeDetails.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;">Select a node to view details.</div>';
    }
    
    // Re-setup event listeners after DOM replacement

    await setupEventListeners();
    
    // Initialize AI interactions service
    const aiInteractionsService = AIInteractionsService.getInstance();
    await aiInteractionsService.initialize();
    
    // Set up simple AI progress event listener
    window.addEventListener('ai-progress', (event: any) => {
        const progressElement = document.getElementById('ai-progress-report')!; // Crash if not found!
        const { type, message, characters } = event.detail;
        
        switch(type) {
            case 'start':
                progressElement.textContent = message;
                progressElement.style.display = 'block';
                break;
            case 'update':
                progressElement.textContent = `${characters} characters received so far...`;
                break;
            case 'complete':
                progressElement.textContent = `Done. ${characters} characters received.`;
                break;
        }
    });
}



interface ProgressInfo {
    message: string;
    current: number;
    total: number;
}

interface ProgressUIData {
    operations?: ProgressInfo;    // Top level: High-level operations (e.g., "Generating child 3 of 5")
    iterations?: ProgressInfo;    // Middle level: LoopOrchestrator iterations (e.g., "Iteration 2 of 5")
    stages?: ProgressInfo;        // Bottom level: Stage within iteration (Create, Rate, Edit)
    detail?: string;              // Detail text below all progress bars
    model?: string;               // Current model being used (e.g., "Grok 4")
}

// Global progress state to maintain all three progress bars
let currentProgressState = {
    operations: null as ProgressInfo | null,
    iterations: null as ProgressInfo | null,
    stages: null as ProgressInfo | null,
    detail: '',
    model: ''
};

function clearProgressUI() {
    const container = document.getElementById('generation-progress-container');
    if (!container) {
        return;
    }
    
    currentProgressState = { operations: null, iterations: null, stages: null, detail: '', model: '' };
    container.style.display = 'none';
}

function updateProgressUI(data: ProgressUIData) {
    const container = document.getElementById('generation-progress-container');
    if (!container) {
        return;
    }

    const operationsText = getElementById('progress-text-operations');
    const operationsBar = getElementById('progress-bar-operations') as HTMLDivElement;
    const iterationsText = getElementById('progress-text-iterations');
    const iterationsBar = getElementById('progress-bar-iterations') as HTMLDivElement;
    const stagesText = getElementById('progress-text-stages');
    const stagesBar = getElementById('progress-bar-stages') as HTMLDivElement;
    const detailText = getElementById('progress-text-detail');
    let modelText = document.getElementById('progress-text-model');
    if (!modelText) {
        // Create model text element if it doesn't exist
        modelText = document.createElement('div');
        modelText.id = 'progress-text-model';
        modelText.style.cssText = `
            font-size: 0.9rem;
            color: #6c757d;
            text-align: center;
            font-style: italic;
            margin-top: 0.5rem;
            padding: 0.25rem;
        `;
        // Insert after detail text if it exists, otherwise append to container
        const detailText = document.getElementById('progress-text-detail');
        if (detailText && detailText.parentNode) {
            detailText.parentNode.insertBefore(modelText, detailText.nextSibling);
        } else {
            container.appendChild(modelText);
        }
    }
    
    // Update the global state with new data (preserve existing values if not provided)
    if (data.operations) {
        currentProgressState.operations = data.operations;
    }
    if (data.iterations) currentProgressState.iterations = data.iterations;
    if (data.stages) currentProgressState.stages = data.stages;
    if (data.detail !== undefined) currentProgressState.detail = data.detail;
    if (data.model !== undefined) currentProgressState.model = data.model;
    
    // Show container whenever we have any progress data (let CSS handle element display)
    container.style.display = 'block';
    
    // Helper function to calculate percentage and update custom progress bar
    const updateProgressBar = (bar: HTMLDivElement, current: number, total: number) => {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        bar.style.width = `${percentage}%`;
    };
    
    // Update Operations Progress (Top Level)
    if (currentProgressState.operations) {
        operationsText.textContent = currentProgressState.operations.message;
        updateProgressBar(operationsBar, currentProgressState.operations.current, currentProgressState.operations.total);
    } else {
        operationsText.textContent = '';
        operationsBar.style.width = '0%';
    }

    // Update Iterations Progress (Middle Level)
    if (currentProgressState.iterations) {
        iterationsText.textContent = currentProgressState.iterations.message;
        updateProgressBar(iterationsBar, currentProgressState.iterations.current, currentProgressState.iterations.total);
    } else {
        iterationsText.textContent = '';
        iterationsBar.style.width = '0%';
    }

    // Update Stages Progress (Bottom Level)
    if (currentProgressState.stages) {
        stagesText.textContent = currentProgressState.stages.message;
        updateProgressBar(stagesBar, currentProgressState.stages.current, currentProgressState.stages.total);
    } else {
        stagesText.textContent = '';
        stagesBar.style.width = '0%';
    }

    // Update Detail Text
    detailText.textContent = currentProgressState.detail || '';
    detailText.style.display = currentProgressState.detail ? 'block' : 'none';

    // Update Model Text
    if (currentProgressState.model) {
        modelText.textContent = `${currentProgressState.model} is thinking...`;
        modelText.style.display = 'block';
    } else {
        modelText.textContent = '';
        modelText.style.display = 'none';
    }
}

// Expose UI functions globally for the GenerationCoordinator
(window as any).updateProgressUI = updateProgressUI;
(window as any).clearProgressUI = clearProgressUI;
(window as any).showGenerationOverlay = showGenerationOverlay;
(window as any).hideGenerationOverlay = hideGenerationOverlay;



function showGenerationOverlay() {
    const contentDisplayArea = getElementById('content-display-area');
    
    if (!contentDisplayArea) {
        console.warn('Content display area not found, cannot show overlay');
        return;
    }
    
    // Remove any existing overlay
    const existingOverlay = document.getElementById('generation-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'generation-overlay';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(248, 249, 250, 0.95);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        border-radius: 8px;
        backdrop-filter: blur(2px);
    `;
    
    overlay.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; margin-bottom: 1rem;"></div>
            <h3 style="margin: 0 0 0.5rem 0; color: #495057;">Generation in Progress</h3>
            <p style="margin: 0; color: #6c757d; font-size: 0.9rem;">Content is being generated and will appear here</p>
        </div>
    `;
    
    // Position the content display area relatively so overlay can be positioned absolutely
    contentDisplayArea.style.position = 'relative';
    contentDisplayArea.appendChild(overlay);
}

function hideGenerationOverlay() {
    const overlay = document.getElementById('generation-overlay');
    if (overlay) {
        overlay.remove();
    }
    
    // Reset position if no overlay
    const contentDisplayArea = getElementById('content-display-area');
    if (contentDisplayArea) {
        contentDisplayArea.style.position = '';
    }
}

// === LONG-RUN AUTO-RETRY ===

const AUTO_RETRY_INTERVAL_MS = 60000;

// Set while an auto-retry countdown is in progress so the Abort button can cancel it.
let autoRetryWaitCancel: (() => void) | null = null;

/** Update the text shown inside the generation overlay (if present). */
function setGenerationOverlayMessage(title: string, subtitle: string): void {
    const overlay = document.getElementById('generation-overlay');
    if (!overlay) return;
    const titleEl = overlay.querySelector('h3');
    const subtitleEl = overlay.querySelector('p');
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
}

/**
 * Whether a failed run should be auto-retried. Genuine content-safety refusals
 * and user aborts are never retried; everything else is treated as potentially
 * transient (the common case for long unattended runs is provider congestion).
 */
function isRetryableRunError(error: Error): boolean {
    if (error.name === 'ContentFilterError' || error.name === 'AbortError') return false;
    if (error.message.includes('Content analysis blocked by AI safety system')) return false;
    if (error.message.includes('Request was aborted') || error.message.includes('Generation aborted by user')) return false;
    return true;
}

/**
 * Wait one interval before the next auto-retry, showing a live countdown in the
 * overlay. Resolves false when the wait elapses, or true if it was cancelled
 * (user pressed Abort).
 */
async function waitForAutoRetry(retryNumber: number, totalRetries: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        let remaining = Math.ceil(AUTO_RETRY_INTERVAL_MS / 1000);
        const render = () => {
            const countdown = `Auto-retry ${retryNumber}/${totalRetries} in ${remaining}s\u2026 (click Abort to stop)`;
            setGenerationOverlayMessage('Run failed \u2014 waiting to retry', countdown);
            // Mirror into the top-bar progress info box (where char counts show).
            window.dispatchEvent(new CustomEvent('ai-progress', {
                detail: { type: 'start', message: `Run failed \u2014 ${countdown}` }
            }));
        };
        render();
        const interval = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) render();
        }, 1000);
        const finish = (cancelled: boolean) => {
            clearInterval(interval);
            clearTimeout(timer);
            autoRetryWaitCancel = null;
            resolve(cancelled);
        };
        const timer = setTimeout(() => { finish(false); }, AUTO_RETRY_INTERVAL_MS);
        autoRetryWaitCancel = () => { finish(true); };
    });
}

/**
 * Cancel an in-progress auto-retry countdown. Returns true if a wait was active.
 * Called by the global Abort button so aborting also stops pending retries.
 */
export function cancelAutoRetryWait(): boolean {
    if (autoRetryWaitCancel) {
        autoRetryWaitCancel();
        return true;
    }
    return false;
}

export function renderMultiProjectTree() {
    const treeContainer = getElementById('project-tree');
    const projects = state.getProjects();
    

    
    if (projects.length === 0) {
        treeContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;">No projects available. Create a new project to get started.</div>';
        return;
    }
    
    // Build todo indicator cache for all projects (efficient single scan)
    buildTodoIndicatorCacheForAllProjects(projects);
    
    let html = '';
    projects.forEach((project, _index) => {

        html += buildTreeHtml(project.rootNode, true); // true indicates this is a project root
    });
    

    treeContainer.innerHTML = html;
    
    // Attach event listeners for node selection
    treeContainer.querySelectorAll('.tree-node').forEach(el => {
        // Left click: select node
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const id = (e.currentTarget as HTMLElement).dataset['id'];
            if (id) {
                // Find which project this node belongs to
                let nodeProject: ProjectManager | null = null;
                let node: DocumentNode | null = null;
                
                for (const project of projects) {
                    node = project.findNodeById(id);
                    if (node) {
                        nodeProject = project;
                        break;
                    }
                }
                
                if (node && nodeProject) {
                    // Allow selection of nodes even when they're generating
                    selectedNodeId = id;
                    projectManager = nodeProject; // Update the active project manager
                    state.setActiveProject(nodeProject.rootNode.id); // Update the active project in state
                    renderMultiProjectTree(); // Re-render tree to update selection highlight
                    void renderNodeDetails();
                }
            }
        });
        
        // Right click: show actions context menu
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // Prevent default context menu
            e.stopPropagation();
            
            const id = (e.currentTarget as HTMLElement).dataset['id'];
            if (id) {
                // Find which project this node belongs to
                let nodeProject: ProjectManager | null = null;
                let node: DocumentNode | null = null;
                
                for (const project of projects) {
                    node = project.findNodeById(id);
                    if (node) {
                        nodeProject = project;
                        break;
                    }
                }
                
                if (node && nodeProject) {
                    // First select the node (same as left click)
                    selectedNodeId = id;
                    projectManager = nodeProject;
                    state.setActiveProject(nodeProject.rootNode.id);
                    renderMultiProjectTree();
                    void renderNodeDetails();
                    
                    // Then show actions context menu at cursor position
                    showActionsContextMenu(node, e as MouseEvent);
                }
            }
        });

        // Double click: open node inspector
        el.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const id = (e.currentTarget as HTMLElement).dataset['id'];
            if (id) {
                // Find which project this node belongs to
                let nodeProject: ProjectManager | null = null;
                let node: DocumentNode | null = null;
                
                for (const project of projects) {
                    node = project.findNodeById(id);
                    if (node) {
                        nodeProject = project;
                        break;
                    }
                }
                
                if (node && nodeProject) {
                    // Select the node first
                    selectedNodeId = id;
                    projectManager = nodeProject;
                    state.setActiveProject(nodeProject.rootNode.id);
                    renderMultiProjectTree();
                    void renderNodeDetails();
                    
                    // Open node inspector modal
                    void import('./modals/index').then(({ NodeInspectorModal }) => {
                        const modal = new NodeInspectorModal();
                        modal.openWithNode(node);
                    }).catch((error: unknown) => {
                        console.error('Failed to open node inspector modal:', error);
                        alert('Failed to open node inspector. Please try again.');
                    });
                }
            }
        });

        // Initialize drag and drop for this node
        const nodeId = (el as HTMLElement).dataset['id'];
        if (nodeId) {
            // Find the node and project
            let node: DocumentNode | null = null;
            let nodeProject: ProjectManager | null = null;
            
            for (const project of projects) {
                node = project.findNodeById(nodeId);
                if (node) {
                    nodeProject = project;
                    break;
                }
            }
            
            if (node && nodeProject) {
                // Get the parent tree-item element for drag operations
                const treeItem = el.closest('.tree-item') as HTMLElement;
                if (treeItem) {
                    // Initialize drag functionality
                    dragDropManager.initializeDragNode(treeItem, node, nodeProject);
                    
                    // Initialize drop functionality (nodes can be dropped into other nodes)
                    dragDropManager.initializeDropTarget(treeItem, node, nodeProject);
                }
            }
        }
    });

    // Remove any existing delegated listener to avoid duplicates
    treeContainer.removeEventListener('click', handleExpandButtonClick);
    // Add event delegation listener to tree container (survives re-renders)
    treeContainer.addEventListener('click', handleExpandButtonClick);
}

/**
 * Calculate the maximum depth of a hierarchy in import data
 */
function calculateImportDataDepth(data: any): number {
    if (!data.children || !Array.isArray(data.children) || data.children.length === 0) {
        return 0; // No children = 0 additional depth
    }
    
    let maxChildDepth = 0;
    for (const child of data.children) {
        const childDepth = calculateImportDataDepth(child);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    
    return 1 + maxChildDepth; // 1 for this level + max child depth
}

/**
 * Import node data from JSON export and merge it into the specified target node
 */
function importNodeData(projectManager: ProjectManager, targetNodeId: string, importData: any): void {
    const targetNode = projectManager.findNodeById(targetNodeId);
    if (!targetNode) {
        throw new Error('Target node not found');
    }

    // Validate import data structure
    if (!importData || typeof importData !== 'object') {
        throw new Error('Invalid import data: Expected JSON object');
    }

    if (!importData.title) {
        throw new Error('Invalid import data: Missing title field');
    }

    // Validate that the imported data can be placed as a child of the target node
    const totalImportDepth = 1 + calculateImportDataDepth(importData); // +1 for the imported node itself
    const targetLevel = targetNode.level;
    const templateLength = targetNode.template.length;
    const availableDepth = templateLength - targetLevel - 1; // Available levels below target node
    
    if (totalImportDepth > availableDepth) {
        throw new Error(
            `Hierarchy mismatch: The imported content needs ${totalImportDepth} levels ` +
            `but can only fit ${availableDepth} levels as a child of the selected node.\n\n` +
            `Target node "${targetNode.title}" is at level ${targetLevel} in a ${templateLength}-level template ` +
            `(${targetNode.template.join(' → ')}).`
        );
    }

    // Enhanced: Check if we have version data (new format) or need legacy import
    let importedNode: DocumentNode;
    
    if (importData.versions && Array.isArray(importData.versions) && importData.versions.length > 0) {
        // Importing with enhanced version data
        
        // FIXED: Use proper project manager method to ensure template sharing
        importedNode = projectManager.addNode(importData.title, targetNode.id);
        
        // Now restore the version data and other properties
        importedNode.id = `imported_${Date.now()}_${importData.id ?? 'unknown'}`; // New ID to avoid conflicts
        
        // Clear the default master version and restore all versions from import
        (importedNode as any).versions = []; // Clear default versions
        
        if (importData.versions && Array.isArray(importData.versions)) {
            // Restore all versions with proper tag handling
            importData.versions.forEach((versionData: any) => {
                const restoredVersion = {
                    id: versionData.id,
                    content: versionData.content,
                    title: versionData.title,
                    context: versionData.context,
                    tags: new Set(Array.isArray(versionData.tags) ? versionData.tags : []),
                    timestamp: new Date(versionData.timestamp),
                    ratings: versionData.ratings ? [...versionData.ratings] : undefined,
                    creatorModel: versionData.creatorModel,
                    metadata: versionData.metadata ? { ...versionData.metadata } : {}
                };
                (importedNode as any).versions.push(restoredVersion);
            });
        }
        
        // Restore other properties
        if (importData.generationPrompt) {
            importedNode.generationPrompt = importData.generationPrompt;
        }
        if (importData.generationHistory) {
            importedNode.generationHistory = importData.generationHistory;
        }
        if (importData.generationSessions) {
            importedNode.generationSessions = importData.generationSessions;
        }
        if (importData.collapsed !== undefined) {
            importedNode.collapsed = importData.collapsed;
        }
        // Restore conditional context items (node-level)
        restoreConditionalContextItems(importedNode, importData.conditionalContextItems);
        
    } else {
        // Importing with legacy format
        
        // Legacy import: Create new node and set properties individually
        importedNode = importChildNodeWithRootTemplate(projectManager, targetNode.id, importData.title);

        // Set imported node properties using version management system
        if (importData.content !== undefined) {
            importedNode.setContent(importData.content, 'imported');
        }

        if (importData.context !== undefined) {
            // Context import removed - using conditional context system
        }

        if (importData.generationPrompt !== undefined) {
            importedNode.generationPrompt = importData.generationPrompt;
        }
        
        // Restore generation metadata in version metadata
        if (importData.creatorModel !== undefined) {
            const masterVersion = importedNode.getMasterVersion();
            if (masterVersion) {
                masterVersion.metadata = masterVersion.metadata ?? {};
                masterVersion.metadata['creatorModel'] = importData.creatorModel;
            }
        }
        
        if (importData.generationHistory !== undefined && Array.isArray(importData.generationHistory)) {
            importedNode.generationHistory = importData.generationHistory;
        }
        
        if (importData.generationSessions !== undefined && Array.isArray(importData.generationSessions)) {
            importedNode.generationSessions = importData.generationSessions;
        }
        // Restore conditional context items (node-level)
        restoreConditionalContextItems(importedNode, importData.conditionalContextItems);
    }

    // Import children recursively
    if (importData.children && Array.isArray(importData.children)) {
        importData.children.forEach((childData: any, index: number) => {
            importChildNode(projectManager, importedNode.id, childData, index);
        });
    }

    // Propagate the correct template to all newly imported nodes
    propagateTemplateToSubtree(importedNode);

    // CRITICAL: Ensure all nodes share the same template reference for dropdown population
    AssertFlatTemplateCopy(projectManager);

    // Save the project
    void projectManager.saveToStorage().catch(console.error);
}

/**
 * Recursively import a child node and its descendants
 */
function importChildNode(projectManager: ProjectManager, parentId: string, childData: any, index: number): void {
    if (!childData.title) {
        console.warn(`Skipping child node at index ${index}: Missing title`);
        return;
    }

    const parentNode = projectManager.findNodeById(parentId);
    if (!parentNode) {
        console.warn(`Parent node not found: ${parentId}`);
        return;
    }

    // Enhanced: Check if we have version data (new format) or need legacy import
    let newNode: DocumentNode;
    
    if (childData.versions && Array.isArray(childData.versions) && childData.versions.length > 0) {
                    // Importing child with enhanced version data
        
        // FIXED: Use proper project manager method to ensure template sharing
        newNode = projectManager.addNode(childData.title, parentId);
        
        // Now restore the version data and other properties
        newNode.id = `imported_${Date.now()}_${childData.id ?? 'unknown'}`; // New ID to avoid conflicts
        
        // Clear the default master version and restore all versions from import
        (newNode as any).versions = []; // Clear default versions
        
        if (childData.versions && Array.isArray(childData.versions)) {
            // Restore all versions with proper tag handling
            childData.versions.forEach((versionData: any) => {
                const restoredVersion = {
                    id: versionData.id,
                    content: versionData.content,
                    title: versionData.title,
                    context: versionData.context,
                    tags: new Set(Array.isArray(versionData.tags) ? versionData.tags : []),
                    timestamp: new Date(versionData.timestamp),
                    ratings: versionData.ratings ? [...versionData.ratings] : undefined,
                    creatorModel: versionData.creatorModel,
                    metadata: versionData.metadata ? { ...versionData.metadata } : {}
                };
                (newNode as any).versions.push(restoredVersion);
            });
        }
        
        // Restore other properties
        if (childData.generationPrompt) {
            newNode.generationPrompt = childData.generationPrompt;
        }
        if (childData.generationHistory) {
            newNode.generationHistory = childData.generationHistory;
        }
        if (childData.generationSessions) {
            newNode.generationSessions = childData.generationSessions;
        }
        if (childData.collapsed !== undefined) {
            newNode.collapsed = childData.collapsed;
        }
        // Restore conditional context items (node-level)
        restoreConditionalContextItems(newNode, childData.conditionalContextItems);
        
    } else {
                    // Importing child with legacy format
        
        // Legacy import: Create new node and set properties individually
        newNode = importChildNodeWithRootTemplate(projectManager, parentId, childData.title);

        // Set node properties using version management system
        if (childData.content !== undefined) {
            newNode.setContent(childData.content, 'imported');
        }

        if (childData.context !== undefined) {
            // Context import removed - using conditional context system
        }

        if (childData.generationPrompt !== undefined) {
            newNode.generationPrompt = childData.generationPrompt;
        }
        
        // Restore generation metadata for child nodes in version metadata
        if (childData.creatorModel !== undefined) {
            const masterVersion = newNode.getMasterVersion();
            if (masterVersion) {
                masterVersion.metadata = masterVersion.metadata ?? {};
                masterVersion.metadata['creatorModel'] = childData.creatorModel;
            }
        }
        
        if (childData.generationHistory !== undefined && Array.isArray(childData.generationHistory)) {
            newNode.generationHistory = childData.generationHistory;
        }
        
        if (childData.generationSessions !== undefined && Array.isArray(childData.generationSessions)) {
            newNode.generationSessions = childData.generationSessions;
        }
        // Restore conditional context items (node-level)
        restoreConditionalContextItems(newNode, childData.conditionalContextItems);
    }

    // Recursively import children
    if (childData.children && Array.isArray(childData.children)) {
        childData.children.forEach((grandChildData: any, grandChildIndex: number) => {
            importChildNode(projectManager, newNode.id, grandChildData, grandChildIndex);
        });
    }
}

/**
 * Creates a new child node with the root template instead of parent template
 */
function importChildNodeWithRootTemplate(projectManager: ProjectManager, parentId: string, title: string): DocumentNode {
    const parent = projectManager.findNodeById(parentId);
    if (!parent) {
        throw new Error(`Parent node with ID "${parentId}" not found.`);
    }

    const newLevel = parent.level + 1;
    // Use root template (shallow copy) instead of parent template
    const rootTemplate = [...projectManager.rootNode.template];
    const newNode = new DocumentNode(newLevel, title, parent.id, rootTemplate);
    
    parent.children.push(newNode);
    
    return newNode;
}

/**
 * Propagates the correct template to all nodes in a subtree based on their position in the hierarchy
 */
function propagateTemplateToSubtree(rootNode: DocumentNode): void {
    const projectTemplate = projectManager?.rootNode.template;
    if (!projectTemplate) {
        console.warn('No project template available for propagation');
        return;
    }

    const propagateRecursively = (node: DocumentNode) => {
        // Update the node's template to be a shallow copy of the project template
        node.template = [...projectTemplate];
        
        // Recursively propagate to all children
        node.children.forEach(child => { propagateRecursively(child); });
    };

    propagateRecursively(rootNode);
}

/**
 * Unified generation handler that checks radio button state and calls appropriate generation method
 */
async function handleUnifiedGeneration(node: DocumentNode): Promise<void> {
    if (!projectManager) {
        throw new Error('ProjectManager is null in handleUnifiedGeneration - application state corrupted');
    }

    // Get level values from dropdowns
    const draftLevelSelector = getElementById('draft-level-selector') as HTMLSelectElement;
    const contentLevelSelector = getElementById('content-level-selector') as HTMLSelectElement;
    // context-prune-level-selector removed - using conditional context system
    const coherenceLevelSelector = getElementById('coherence-level-selector') as HTMLSelectElement;
    const autofixSeveritySelector = getElementById('autofix-severity-selector') as HTMLSelectElement;
    // pruneScopeSelector removed - prune scope UI removed
    
    if (!draftLevelSelector || !contentLevelSelector || !coherenceLevelSelector || !autofixSeveritySelector) {
        console.error('Level selector dropdowns not found');
        return;
    }

    // Get level values
    const draftLevel = parseInt(draftLevelSelector.value);
    const contentLevel = parseInt(contentLevelSelector.value);
    // contextPruneLevel removed - using conditional context system
    const coherenceLevel = parseInt(coherenceLevelSelector.value);
    const autofixSeverity = parseInt(autofixSeveritySelector.value);
    // pruneScope removed - prune scope UI removed
    
    // Validate levels
    if (contentLevel > draftLevel) {
        alert('Content level cannot be higher than draft level');
            return;
        }
        
    if (coherenceLevel > draftLevel && draftLevel !== -1) {
        alert('Coherence level cannot be higher than draft level');
        return;
    }
    
    // Check if any work needs to be done
    if (draftLevel === -1 && contentLevel === -1 && coherenceLevel === -1) {
        alert('Please select at least one level for generation');
        return;
    }
    
    // Show generation overlay at start
    showGenerationOverlay();

    const pm = projectManager;
    const { UnifiedGenerationService } = await import('../project/UnifiedGenerationService');
    const { GenerationErrorService } = await import('./modals');

    // Define generation levels
    const levels = {
        draftLevel,
        contentLevel,
        coherenceLevel,
        autofixSeverity,
        deterministicChildCreation: deterministicChildCreationState
        // pruneScope completely removed - was only needed for traditional context adjustment
    };

    // Store generation parameters in the node for next time
    node.lastGenerationParameters = { ...levels };

    // Long-run auto-retry: retry the whole run once per minute up to N times when
    // it fails (e.g. provider congestion). Mid-run error modals are suppressed
    // while retries may still recover; a single final error is shown at the end.
    const autoRetry = autoRetryEnabledState && autoRetryCountState > 0;
    const coordinator = pm.getGenerationCoordinator();
    let finalError: Error | null = null;

    try {
        // Suppress the coordinator's blocking failure alert while auto-retry is active.
        coordinator.setSuppressFailureAlert(autoRetry);
        let attempt = 0;
        for (;;) {
            attempt++;
            GenerationErrorService.setSuppressModals(autoRetry);

            let attemptError: Error | null = null;
            try {
                const unifiedService = new UnifiedGenerationService({
                    treeService: pm.getTreeService(),
                    contextService: pm.getContextService(),
                    promptService: pm.getPromptService(),
                    generationCoordinator: pm.getGenerationCoordinator(),
                    loopOrchestrator: (pm as any).loopOrchestrator,
                    settingsManager: pm.getSettingsManager(),
                    openRouterClient: (pm as any).openRouterClient,
                    eventEmitter: pm as any,
                    saveToStorage: () => pm.saveToStorage(),
                    rootNode: pm.rootNode
                });
                await unifiedService.generateWithLevels(node.id, levels);
                await pm.saveToStorage();
            } catch (error) {
                attemptError = error instanceof Error ? error : new Error(String(error));
            } finally {
                GenerationErrorService.setSuppressModals(false);
            }

            if (!attemptError) {
                finalError = null;
                break; // success
            }

            const canRetry = autoRetry && attempt <= autoRetryCountState && isRetryableRunError(attemptError);
            if (!canRetry) {
                finalError = attemptError;
                break;
            }

            console.warn(`Generation attempt ${attempt} failed (${attemptError.name}: ${attemptError.message}); auto-retrying in ${AUTO_RETRY_INTERVAL_MS / 1000}s (${attempt}/${autoRetryCountState}).`);
            // The coordinator removes the overlay after a failed op; re-show it for the countdown.
            showGenerationOverlay();
            const cancelled = await waitForAutoRetry(attempt, autoRetryCountState);
            if (cancelled) {
                finalError = null; // user aborted the wait
                break;
            }
            setGenerationOverlayMessage('Generation in Progress', 'Content is being generated and will appear here');
        }
    } finally {
        coordinator.setSuppressFailureAlert(false);
        // Clear progress UI and hide overlay
        clearProgressUI();
        hideGenerationOverlay();
    }

    if (finalError) {
        console.error('Unified generation failed:', finalError);
        const error = finalError;
        const errorService = GenerationErrorService.getInstance();
        const isContentFiltering = error.message.includes('Content analysis blocked by AI safety system') ||
                                  error.name === 'ContentFilterError';
        if (isContentFiltering) {
            void errorService.showContentFilteringError(error, {
                purpose: 'Unified Generation',
                operation: `Generation for "${node.title}"`,
                nodeTitle: node.title
            });
        } else {
            void errorService.showAIError(error, {
                title: 'Generation Failed',
                purpose: 'Unified Generation',
                operation: `Generation for "${node.title}"`
            });
        }
    }
}



// === CHECKBOX STATE MANAGEMENT ===

// === IDEA BOARD INTEGRATION ===

/**
 * Handle send to idea board with different options
 */
async function handleSendToIdeaBoard(option: 'content' | 'context' | 'both'): Promise<void> {

    if (!projectManager || !selectedNodeId) {
        alert('No node selected. Please select a node to send to the idea board.');
        return;
    }

    const selectedNode = projectManager.findNodeById(selectedNodeId);
    if (!selectedNode) {
        alert('Selected node not found.');
        return;
    }

    try {
        switch (option) {
            case 'content':
                await sendContentToIdeaBoard(selectedNode);
                break;
            case 'context':
                await sendContextToIdeaBoard(selectedNode);
                break;
            case 'both':
                await sendBothToIdeaBoard(selectedNode);
                break;
        }
    } catch (error) {
        console.error('Failed to send to idea board:', error);
        alert('Failed to send content to idea board. Please try again.');
    }
}

/**
 * Ensure idea board modal is open
 */
async function ensureIdeaBoardOpen(): Promise<void> {
    const ideaBoardModal = document.getElementById('idea-board-modal');
    if (!ideaBoardModal) {
        await openIdeaBoardModal();
        // Wait a moment for the board to initialize
        await new Promise(resolve => setTimeout(resolve, 300));
    }
}

/**
 * Get idea board instance from global window object
 */
async function getIdeaBoardInstance(): Promise<any> {
    const ideaBoard = (window as any).currentIdeaBoard;
    if (!ideaBoard) {
        throw new Error('Could not access idea board instance');
    }
    return ideaBoard;
}



/**
 * Send only content to idea board as a single sticker
 */
async function sendContentToIdeaBoard(node: DocumentNode): Promise<void> {
    await ensureIdeaBoardOpen();
    const ideaBoard = await getIdeaBoardInstance();
    
    // Find free space on the canvas
    const freeSpace = findFreeSpaceOnCanvas(ideaBoard);
    
    // Create single content sticker at free space location
    const contentSticker = ideaBoard.createNewPostIt({ x: freeSpace.x, y: freeSpace.y }, node.content);
    contentSticker.setColor('#fff9c4'); // Default yellow
    contentSticker.source = { nodeId: node.id, type: 'content' };
    
    ideaBoard.requestRedraw();
    ideaBoard.selectElement(contentSticker);
}

/**
 * Send only context to idea board as a single sticker
 */
async function sendContextToIdeaBoard(node: DocumentNode): Promise<void> {
    await ensureIdeaBoardOpen();
    const ideaBoard = await getIdeaBoardInstance();
    
    // Find free space on the canvas
    const freeSpace = findFreeSpaceOnCanvas(ideaBoard);
    
    // Create single context sticker at free space location
    const contextSticker = ideaBoard.createNewPostIt({ x: freeSpace.x, y: freeSpace.y }, 'Conditional context available'); // Traditional context removed
    contextSticker.setColor('#fff9c4'); // Default yellow
    contextSticker.source = { nodeId: node.id, type: 'context' };
    
    ideaBoard.requestRedraw();
    ideaBoard.selectElement(contextSticker);
}

/**
 * Send both content and context to idea board (original functionality)
 */
async function sendBothToIdeaBoard(node: DocumentNode): Promise<void> {
    await ensureIdeaBoardOpen();
    const ideaBoard = await getIdeaBoardInstance();
    
    // Find free space on the canvas
    const freeSpace = findFreeSpaceOnCanvas(ideaBoard);
    
    try {
        // Create background rectangle (light blue)
        const backgroundRect = ideaBoard.createBackgroundRectangle({ x: freeSpace.x, y: freeSpace.y });
        backgroundRect.setBackgroundColor('#e3f2fd'); // Very light blue
        
        // Size the background rectangle to contain both stickers with padding
        backgroundRect.size = { width: 280, height: 420 }; // Adjusted to fit both stickers plus padding
        ideaBoard.updateElementData(backgroundRect);
        
        // Create content sticker (light red) inside the background rectangle
        const contentSticker = ideaBoard.createNewPostIt(
            { x: freeSpace.x + 20, y: freeSpace.y + 20 }, 
            node.content
        );
        contentSticker.setColor('#fff9c4'); // Standard yellow
        contentSticker.source = { nodeId: node.id, type: 'content' };
        
        // Create context sticker (standard yellow) inside the background rectangle
        const contextSticker = ideaBoard.createNewPostIt(
            { x: freeSpace.x + 20, y: freeSpace.y + 200 }, 
            'Conditional context available' // Traditional context removed
        );
        contextSticker.setColor('#fff9c4'); // Standard yellow
        contextSticker.source = { nodeId: node.id, type: 'context' };
        
        // Force a redraw and select the background rectangle to ensure visibility
        ideaBoard.requestRedraw();
        ideaBoard.selectElement(backgroundRect);
        
    } catch (error) {
        console.error('Error creating stickers:', error);
        throw error;
    }
}

/**
 * Open idea board modal
 */
async function openIdeaBoardModal(): Promise<void> {
    // Check if already open
    if (document.getElementById('idea-board-modal')) {
        return;
    }

    // Trigger the existing idea board button
    const ideaBoardBtn = document.getElementById('idea-board-btn');
    if (ideaBoardBtn) {
        ideaBoardBtn.click();
        
        // Wait for the modal to be created and idea board instance to be available
        let attempts = 0;
        while (!document.getElementById('idea-board-modal') && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        // Wait a bit more for the idea board to be fully initialized
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

/**
 * Find free space on the idea board canvas
 */
function findFreeSpaceOnCanvas(ideaBoard: any): { x: number; y: number; width: number; height: number } {
    // Get all existing elements to avoid overlap
    const existingElements: any[] = [];
    
    // Get elements from the idea board
    for (const element of ideaBoard.elements.values()) {
        if (element.position) {
            existingElements.push(element);
        }
    }
    
    // Define the space we need (background + 2 stickers with padding)
    const neededWidth = 300;
    const neededHeight = 400;
    
    // Get the center of the current viewport (where user is looking)
    const viewportCenterX = ideaBoard.viewport.x + ideaBoard.viewport.width / (2 * ideaBoard.viewport.zoom);
    const viewportCenterY = ideaBoard.viewport.y + ideaBoard.viewport.height / (2 * ideaBoard.viewport.zoom);
    
    // Try to find free space in a spiral pattern starting from viewport center
    for (let radius = 0; radius < 500; radius += 50) {
        for (let angle = 0; angle < 360; angle += 45) {
            const x = viewportCenterX + Math.cos(angle * Math.PI / 180) * radius - neededWidth / 2;
            const y = viewportCenterY + Math.sin(angle * Math.PI / 180) * radius - neededHeight / 2;
            
            // Check if this position has enough free space
            const hasOverlap = existingElements.some((element: any) => {
                if (!element.position) return false;
                
                const elementRight = element.position.x + (element.size?.width ?? 225);
                const elementBottom = element.position.y + (element.size?.height ?? 150);
                const testRight = x + neededWidth;
                const testBottom = y + neededHeight;
                
                return !(x > elementRight || testRight < element.position.x || 
                        y > elementBottom || testBottom < element.position.y);
            });
            
            if (!hasOverlap) {
                return { x, y, width: neededWidth, height: neededHeight };
            }
        }
    }
    
    // Fallback to a position near viewport center if no free space found
    return { 
        x: viewportCenterX - neededWidth / 2 + 300, 
        y: viewportCenterY - neededHeight / 2, 
        width: neededWidth, 
        height: neededHeight 
    };
}

// === CENTRALIZED EVENT LISTENER SYSTEM ===

/**
 * Mapping of button IDs to their event handlers
 * TODO: Migrate to MainUIEventRegistry for better event management
 */
export const buttonHandlers: Record<string, (event: Event) => void> = {
    'node-generate-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        void handleUnifiedGeneration(node);
    },

    'generation-explainer-btn': (_e: Event) => {
        window.open('./creation-loop.html', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    },
    
    'xml-story-creation-btn': (_e: Event) => {
        // XML Story Creation button clicked - initialize with current node data
        if (!projectManager || !selectedNodeId) {
            // No active project/node - open empty modal
            void import('./modals/ModalFactory').then(({ openXMLStoryModal }) => {
                void openXMLStoryModal();
            }).catch((error: unknown) => {
                console.error('❌ Failed to open XML Story Creation modal:', error);
                alert('Failed to open Node Chat Editor. Please try again.');
            });
            return;
        }

        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) {
            console.warn('Selected node not found:', selectedNodeId);
            return;
        }

        // Gather node data for initialization
        const initializationData = {
            title: node.title || 'Untitled',
            content: node.content || '',
            contextItems: [], // Traditional context removed - using conditional context
            sourceNode: node
        };



        void import('./modals/ModalFactory').then(({ openXMLStoryModal }) => {
            void openXMLStoryModal(initializationData);
        }).catch((error: unknown) => {
            console.error('❌ Failed to open XML Story Creation modal:', error);
            alert('Failed to open XML Story Creator. Please try again.');
        });
    },

    'guided-review-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) {
            alert('Select a node first to start a guided review.');
            return;
        }
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) {
            console.warn('Selected node not found:', selectedNodeId);
            return;
        }
        const pm = projectManager;
        void import('./modals/ModalFactory').then(({ openGuidedReviewModal }) => {
            void openGuidedReviewModal(node, pm);
        }).catch((error: unknown) => {
            console.error('❌ Failed to open Guided Reviewer modal:', error);
            alert('Failed to open Guided Reviewer. Please try again.');
        });
    },

    
    // 'node-propagate-context-btn': removed - using conditional context system
    
    // 'node-extract-context-btn': removed - using conditional context system
    

    
    'context-info-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        // ContextInfoModal removed - using conditional context system
        console.log('Context items editor removed - use conditional context editor instead');
    },
    
    'edit-context-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        // ContextInfoModal removed - using conditional context system
            // ContextItemsEditorModal removed - using conditional context system
            console.log('Context editor removed - use conditional context editor instead');
    },
    
    'node-inspector-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        // Import and open node inspector modal
        void import('./modals/index').then(({ NodeInspectorModal }) => {
            const modal = new NodeInspectorModal();
            modal.openWithNode(node);
        }).catch((error: unknown) => {
            console.error('Failed to open node inspector modal:', error);
            alert('Failed to open node inspector. Please try again.');
        });
    },
    
    'open-reader-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const selectedNode = projectManager.findNodeById(selectedNodeId);
        if (!selectedNode) return;
        
        openReaderView(projectManager, selectedNode, (nodeId: string) => {
            selectedNodeId = nodeId;
            void renderNodeDetails();
        }).catch((error: unknown) => {
            console.error('Failed to open reader view:', error);
            alert('Failed to open reader view. Please try again.');
        });
    },
    
    'overview-board-btn': async (_e: Event) => {
        if (!projectManager) {
            alert('No active project found. Please select or create a project first.');
            return;
        }
        
        if (!selectedNodeId) {
            alert('No node selected. Please select a node to analyze.');
            return;
        }
        
        const selectedNode = projectManager.findNodeById(selectedNodeId);
        if (!selectedNode) {
            alert('Selected node not found. Please select a valid node.');
            return;
        }

        const settingsManager = state.getSettingsManager();
        const openRouterClient = state.getOpenRouterClient();
        
        if (!settingsManager || !openRouterClient) {
            alert('Required services not available. Please ensure the application is fully loaded.');
            return;
        }

        // Import and open the Overview Board Modal
        try {
            // Overview Board requested
            
            const { OverviewBoardModal } = await import('../overview-board');
            const modal = new OverviewBoardModal({
                selectedNode: selectedNode,
                openRouterClient: openRouterClient,
                settingsManager: settingsManager,
                title: `Overview Board - ${selectedNode.title}`,
                id: 'overview-board-modal',
                width: '95vw',
                height: '90vh',
                closable: true
            });
            
            modal.open();
                            // Overview Board modal opened
        } catch (error) {
            console.error('❌ Failed to open Overview Board:', error);
            alert('Failed to open Overview Board. Please try again.');
        }
    },


    
    'version-prev-btn': (_e: Event) => {
        if (currentVersionIndex > 0) {
            currentVersionIndex--;
            updateVersionNavigationUI();
            updateVersionContentDisplay();
        }
    },
    
    'version-next-btn': (_e: Event) => {
        if (currentVersionIndex < availableVersions.length - 1) {
            currentVersionIndex++;
            updateVersionNavigationUI();
            updateVersionContentDisplay();
        }
    },
    
    'use-this-version-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node || !availableVersions[currentVersionIndex]) return;
        
        const selectedVersion = availableVersions[currentVersionIndex]!;
        // Use version management system to update content
        node.setContent(selectedVersion.content, 'master');
        // Generation metadata restoration from VersionView is not applicable
        
        void projectManager.saveToStorage().catch(console.error);
        
        initializeVersionNavigation(node);
        updateVersionNavigationUI();
        updateVersionContentDisplay();
        
        if (enhancedContentEditor) {
            enhancedContentEditor.value = node.content;
        } else {
            const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
            if (contentTextArea) {
                contentTextArea.value = node.content;
            }
        }
        
        alert('Version restored as current content.');
    },
    
    'actions-dropdown-btn': (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (selectedNodeId && projectManager) {
            const selectedNode = projectManager.findNodeById(selectedNodeId);
            if (selectedNode) {
                showActionsDropdown(selectedNode);
            }
        }
    },

    'search-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        void import('./modals/SearchModal').then(({ SearchModal }) => {
            const searchModal = new SearchModal();
            searchModal.openForNode(node);
        }).catch((error: unknown) => {
            console.error('Failed to open search modal:', error);
            alert('Failed to open search. Please try again.');
        });
    },

    'set-project-language-btn': async (_e: Event) => {
        if (!selectedNodeId || !projectManager) {
            alert('Please select a project root to set the project language.');
            return;
        }
        
        const selectedNode = projectManager.findNodeById(selectedNodeId);
        if (!selectedNode || selectedNode.level !== 0) {
            alert('Please select a project root to set the project language.');
            return;
        }

        try {
            await handleSetProjectLanguage();
        } catch (error) {
            console.error('Failed to set project language:', error);
            alert('Failed to set project language. Please try again.');
        }
    }
};

/**
 * Removes all event listeners from tracked buttons
 */
function removeAllListeners() {

    
    // Remove click listeners from all tracked buttons
    Object.keys(buttonHandlers).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            const handler = (button as any)._expertHandler;
            if (handler) {
                button.removeEventListener('click', handler);
                delete (button as any)._expertHandler;
            }
        }
    });
    
    // Remove main content delegation listener
    const mainContent = getElementById('main-content');
    const existingListener = (mainContent as any)._expertEventListener;
    if (existingListener) {
        mainContent.removeEventListener('click', existingListener);
        delete (mainContent as any)._expertEventListener;
    }
}

// Legacy function removed - now using EventManager delegation in setupEventListeners

// === CHECKBOX STATE MANAGEMENT ===

// Global cache for nodes that should show todo indicators (themselves or descendants have todos)
const nodesWithTodoIndicators: Set<string> = new Set();
// Cache for nodes that have direct todos (not just descendants)
const nodesWithDirectTodos: Set<string> = new Set();

/**
 * Build todo indicator cache for all projects
 */
function buildTodoIndicatorCacheForAllProjects(projects: ProjectManager[]): void {
    nodesWithTodoIndicators.clear();
    nodesWithDirectTodos.clear();
    
    projects.forEach(project => {
        buildTodoIndicatorCache(project.rootNode, false); // false = don't clear cache
    });
    
    
}

/**
 * Efficiently scan all nodes once and identify which should show todo indicators.
 * A node gets a todo indicator if it has todos OR any of its descendants have todos.
 */
function buildTodoIndicatorCache(rootNode: DocumentNode, clearCache: boolean = true): void {
    if (clearCache) {
        nodesWithTodoIndicators.clear();
        nodesWithDirectTodos.clear();
    }
    
    // Recursive function to check a node and all its descendants
    function checkNodeForTodos(node: DocumentNode): boolean {
        let hasAnyTodos = false;
        
        // Check if this node itself has todos
        if (node.todos && node.todos.length > 0) {
            // Only count incomplete todos
            const incompleteTodos = node.getIncompleteTodos();
            if (incompleteTodos.length > 0) {
                hasAnyTodos = true;
                nodesWithDirectTodos.add(node.id);
            }
        }
        
        // Check all children recursively
        for (const child of node.children) {
            const childHasTodos = checkNodeForTodos(child);
            if (childHasTodos) {
                hasAnyTodos = true;
            }
        }
        
        // If this node or any descendant has todos, mark this node for indicator
        if (hasAnyTodos) {
            nodesWithTodoIndicators.add(node.id);
        }
        
        return hasAnyTodos;
    }
    
    checkNodeForTodos(rootNode);
}

/**
 * Set up global Ctrl+F search handler
 */
function setupGlobalSearchHandler(): void {
    // Remove existing handler if any
    if ((document as any)._globalSearchHandler) {
        document.removeEventListener('keydown', (document as any)._globalSearchHandler);
    }

    const globalSearchHandler = (event: KeyboardEvent): void => {
        // Check if Ctrl+F or Cmd+F is pressed
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
            // Check if we're currently in a UniversalTextEditor enhanced mode
            const activeElement = document.activeElement;
            
            // If the active element is within a text-editor-with-highlighting, let it handle Ctrl+F
            if (activeElement && activeElement.closest('.text-editor-with-highlighting')) {
                return; // Let UniversalTextEditor handle this
            }
            
            // If we're in any other input/textarea, let browser handle it
            if (activeElement && (
                activeElement.tagName === 'INPUT' || 
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.getAttribute('contenteditable') === 'true'
            )) {
                return; // Let browser handle normal input fields
            }
            
            // If no project/node is selected, ignore
            if (!projectManager || !selectedNodeId) {
                return;
            }
            
            const node = projectManager.findNodeById(selectedNodeId);
            if (!node) {
                return;
            }
            
            // Prevent browser's native find dialog
            event.preventDefault();
            event.stopPropagation();
            
            // Open our search modal
            void import('./modals/SearchModal').then(({ SearchModal }) => {
                const searchModal = new SearchModal();
                searchModal.openForNode(node);
            }).catch((error: unknown) => {
                console.error('Failed to open search modal:', error);
            });
        }
    };

    // Add the event listener
    document.addEventListener('keydown', globalSearchHandler);
    
    // Store reference for cleanup
    (document as any)._globalSearchHandler = globalSearchHandler;
}
