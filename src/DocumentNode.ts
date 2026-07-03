import { LoopHistoryItem } from './LoopOrchestrator';
import { Rating } from './types/RatingTypes';
import { v4 as uuidv4 } from 'uuid';
import { getContextItems, parseSectionTitles } from './ContextFormat';
import { generateNewContextID } from './ContextIDGenerator';
import { findProjectByNode } from './state';

/**
 * Prefix that turns a conditional context item into a per-node binary
 * verifiable constraint. Such items are removed from the passive context block
 * and instead surfaced as binary (pass/fail) criteria checked by the rater.
 */
export const CONSTRAINT_PREFIX = '=>';

// ---------------- Conditional Context System ----------------
//
// Conditional context items are facts/instructions attached to a node (usually
// the root for project-wide knowledge). They are inherited downward: when a
// node N generates, the engine walks root -> N and includes every ancestor's
// items that pass this item's gates for N.
//
// Scoping is STRUCTURAL and deterministic, expressed against the OWNING node's
// DIRECT CHILDREN (whose titles are known up front from the deterministic
// `===Section===` outline). There is intentionally no text-condition system:
//   - childScope: which of the owner's direct-child subtrees the item reaches
//   - leavesOnly: restrict the reach to leaf-layer (prose) nodes
//   - keywords:   optional content gate (trigger words), unchanged
// "Going deeper" than direct children is the SAME operation performed on a
// deeper node, not a special feature.

/**
 * How a conditional context item is scoped to its OWNER node's direct children.
 * - 'all':     applies to the owner and its entire subtree (the default; "global").
 * - 'include': applies only within the subtrees of the listed direct children.
 * - 'exclude': applies everywhere in the subtree EXCEPT the listed direct
 *              children (so newly created children stay in scope).
 * `titles` are matched against the owner's direct-child titles and ignored when
 * mode === 'all'.
 */
export type ChildScopeMode = 'all' | 'include' | 'exclude';

export interface ChildScope {
    mode: ChildScopeMode;
    titles: string[];
}

interface ConditionalContextItem {
    id: string;
    text: string;
    keywords?: string[];     // trigger words (content gate)
    childScope?: ChildScope; // structural scope; undefined === { mode: 'all', titles: [] }
    leavesOnly?: boolean;    // reach: only leaf-layer (prose) nodes
}

/**
 * Reference to a related node for todo items
 */
export interface TodoNodeReference {
    id: string;
    title: string;
}

/**
 * A single todo item that can reference related nodes
 */
export interface TodoItem {
    id: string;
    description: string;
    relatedNodes: TodoNodeReference[];
    timestamp: Date;
    completed?: boolean;
    // Logic error specific details (optional for todos not from logic errors)
    logicError?: {
        type: string;
        severity: number;
        justification: string;
        suggestedFix?: string;
    };
}

/**
 * Generation parameters that are remembered per node
 */
interface LastGenerationParameters {
    draftLevel: number;
    contentLevel: number;
    coherenceLevel: number;
    autofixSeverity: number;
    deterministicChildCreation?: boolean;
}

/**
 * Represents a single version of node content with tags and metadata.
 */
export interface ContentVersion {
    id: string;
    content: string;
    title: string;
    tags: Set<string>;
    timestamp: Date;
    ratings?: Rating[];
    creatorModel?: string;
    metadata?: { [key: string]: any };
    /**
     * Optional user-provided name for an explicit snapshot version. When set, it
     * is used as the version's display label in the inspector. Round-trips via
     * the spread-based (de)serialization in toJSON/fromJSON.
     */
    label?: string;
}

/**
 * Represents a single iteration attempt during content generation.
 * Each iteration contains the generated content and its quality ratings.
 */
interface GenerationIteration {
    iteration: number;
    content: string;
    ratings: Rating[];
    wasChosen: boolean; // true if this iteration became the final content
    timestamp: Date;
}

/**
 * Complete generation session data including all iterations and metadata.
 */
export interface GenerationSession {
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    originalPrompt: string;
    iterations: GenerationIteration[];
    finalIterationNumber: number;
    success: boolean;
    totalIterationsAttempted: number;
}

export class DocumentNode {
    id: string;
    level: number;
    parentId: string | null;
    children: DocumentNode[] = [];

    // --- Version-based Content Management ---
    private versions: ContentVersion[] = [];
    
    // --- Template and Generation Properties ---
    template: string[];
    /**
     * Optional fuzzy output-length targets in paragraphs, index-aligned with
     * `template` (one entry per hierarchy layer). A value N means "aim for ~N
     * paragraphs" for a node at that level; null means no hint. Propagated
     * exactly like `template` (shared reference via AssertFlatTemplateCopy and
     * inherited from the parent in TreeService.addNode). This is ONLY a hint to
     * the LLM and is never enforced.
     */
    layerLengths: (number | null)[];
    generationPrompt: string | null = null;
    isPromptGenerating: boolean = false;

    // --- UI State Properties ---
    collapsed: boolean = false; // Track if this node is collapsed in the tree view
    
    // --- Legacy & Internal Properties ---
    generationHistory: LoopHistoryItem[] = [];
    isGenerating: boolean = false;

    // --- Extended Generation History ---
    generationSessions: GenerationSession[] = [];
    currentGenerationSession: GenerationSession | null = null;

    // --- Overview Board Cache ---
    overviewBoardCache: Map<string, any> = new Map(); // CachedOverviewAnalysis by layer name

    // --- Generation Parameters Cache ---
    lastGenerationParameters: LastGenerationParameters | null = null;

    // --- Todo Items ---
    todos: TodoItem[] = [];

    // --- User Notes ---
    notes: string = '';

    // --- Conditional Context (new system, parallel to legacy `context`) ---
    private conditionalContextItems: ConditionalContextItem[] = [];

    constructor(level: number, initialTitle: string, parentId: string | null = null, template: string[] = [], initialContent: string = '', layerLengths: (number | null)[] = []) {
        // Always use UUID for tree node IDs - only conditional context item IDs use the simplified format
        this.id = uuidv4();
        this.level = level;
        this.parentId = parentId;
        this.template = template;
        this.layerLengths = layerLengths;

        // Initialize properties to default values
        this.generationPrompt = null;
        this.isPromptGenerating = false;
        this.generationHistory = [];
        this.isGenerating = false;
        this.generationSessions = [];
        this.currentGenerationSession = null;
        this.collapsed = false; // Initialize as expanded
        this.overviewBoardCache = new Map(); // Initialize cache
        this.lastGenerationParameters = null; // Initialize as null
        this.notes = ''; // Initialize notes as empty string
        
        // Create initial master version (no context field)
        const initialVersion = {
            id: uuidv4(),
            content: initialContent || '',
            title: initialTitle,
            tags: new Set(['master']),
            timestamp: new Date(),
            metadata: {}
        };
        
        this.versions = [initialVersion];
    }

    /**
     * Updates this node's ID to use the new context ID format
     * @param rootNode The root node for scanning existing IDs
     * @returns The new ID that was assigned
     */
    updateToNewContextID(rootNode: DocumentNode): string {
        this.id = generateNewContextID(rootNode);
        return this.id;
    }



    /**
     * Gets the children count from template hierarchy.
     * Looks for patterns like "Chapter 4" to extract the number 4 as the count.
     * @returns The extracted count or null if not specified in template.
     */
    public getTemplateChildrenCount(): number | null {
        if (this.isLeaf) {
            return null; // No count for leaf nodes
        }
        
        // Look at the CHILD level name (the level this node will generate)
        const childLevelIndex = this.level + 1;
        if (childLevelIndex >= this.template.length) {
            return null; // No count if no child level
        }
        
        const childLevelName = this.template[childLevelIndex];
        if (!childLevelName) {
            return null; // No count
        }
        
        // Look for numbers in the child level name
        // Pattern: "Chapter 4", "Act 3", "Section 7", etc.
        const match = childLevelName.match(/(\w+)\s+(\d+)/);
        if (match?.[2]) {
            const extractedCount = parseInt(match[2], 10);
            if (!isNaN(extractedCount) && extractedCount > 0 && extractedCount <= 20) {
                return extractedCount;
            }
        }
        
        return null; // No count if no valid number found
    }

    /**
     * Gets the current state of the node based on its master version tags.
     * @returns 'Empty' if no content, 'Draft' if master version has 'draft' tag, 'Final' otherwise
     */
    getState(): 'Empty' | 'Draft' | 'Final' {
        const content = this.content;
        if (!content || content === '') {
            return 'Empty';
        }
        
        // Check if the master version has draft tag
        const masterVersion = this.getMasterVersion();
        if (masterVersion && masterVersion.tags.has('draft')) {
            return 'Draft';
        }
        
        return 'Final';
    }

    /**
     * Custom serializer for JSON.stringify.
     * Ensures private fields and getters are correctly serialized.
     */
    toJSON() {
        return {
            id: this.id,
            level: this.level,
            parentId: this.parentId,
            children: this.children,
            template: this.template,
            layerLengths: this.layerLengths,
            generationPrompt: this.generationPrompt,
            collapsed: this.collapsed,
            generationHistory: this.generationHistory,
            generationSessions: this.generationSessions,
            versions: this.versions.map(v => ({
                ...v,
                tags: Array.from(v.tags) // Convert Set to Array for JSON
            })),
            overviewBoardCache: Array.from(this.overviewBoardCache.entries()), // Convert Map to Array for JSON
            lastGenerationParameters: this.lastGenerationParameters,
            todos: this.todos,
            notes: this.notes,
            conditionalContextItems: this.conditionalContextItems
        };
    }

    /**
     * Static method to restore from JSON with legacy compatibility.
     */
    static fromJSON(data: any): DocumentNode {
        // Always use a non-empty string for title
        const safeTitle = (typeof data.title === 'string' && data.title.trim()) ? data.title : 'Untitled';
        
        // Create node with empty initial values (will be overwritten by versions)
        const node = new DocumentNode(data.level, safeTitle, data.parentId, data.template, '');
        
        // Restore basic properties
        node.id = data.id;
        // Older saves predate per-layer length hints; default to none. Kept
        // aligned with `template` by AssertFlatTemplateCopy on load.
        node.layerLengths = Array.isArray(data.layerLengths) ? data.layerLengths : [];
        node.collapsed = data.collapsed ?? false;
        node.generationPrompt = data.generationPrompt;
        node.isPromptGenerating = false; // Always reset transient state on load
        node.generationHistory = data.generationHistory ?? [];
        node.isGenerating = false; // Always reset transient state on load
        node.generationSessions = data.generationSessions ?? [];
        
        // MIGRATION: Check for legacy context migration BEFORE processing anything else
        const hasNoConditionalContext = !data.conditionalContextItems || data.conditionalContextItems.length === 0;
        const isRootNode = data.parentId === null;
        let legacyContextMigrated = false;
        
        if (hasNoConditionalContext && isRootNode && data.versions && Array.isArray(data.versions)) {
            // Look for legacy context in raw version data before it gets processed
            const rawMasterVersion = data.versions.find((v: any) => {
                if (Array.isArray(v.tags)) {
                    return v.tags.includes('master');
                } else if (v.tags && typeof v.tags === 'object') {
                    return v.tags.master ?? Object.values(v.tags).includes('master');
                }
                return false;
            });
            
            if (rawMasterVersion?.context) {
                const legacyContext = rawMasterVersion.context;
                
                if (typeof legacyContext === 'string' && legacyContext.trim()) {
                    const contextItems = getContextItems(legacyContext);
                    
                    node.conditionalContextItems = contextItems.map(text => ({
                        id: uuidv4(),
                        text: text.trim(),
                        keywords: [],
                        childScope: { mode: 'all' as ChildScopeMode, titles: [] },
                        leavesOnly: false
                    }));
                    legacyContextMigrated = true;
                    console.log(`✅ Migrated ${contextItems.length} legacy context items to conditional context`);
                }
            }
        }
        
        // Restore overview board cache - FAIL LOUDLY on corruption
        if (data.overviewBoardCache && Array.isArray(data.overviewBoardCache)) {
            node.overviewBoardCache = new Map();
            for (const [layerName, cachedData] of data.overviewBoardCache) {
                // FAIL LOUDLY: Don't silently skip null/undefined cache data
                if (!cachedData) {
                    throw new Error(`❌ CACHE CORRUPTION: Null cache data for layer "${layerName}" during project load`);
                }
                
                // FAIL LOUDLY: Validate required cache structure
                if (!cachedData.timestamp || !cachedData.data || !cachedData.analyzedNodeIds) {
                    throw new Error(`❌ CACHE CORRUPTION: Missing required fields in cache for layer "${layerName}". Found: ${Object.keys(cachedData)}`);
                }
                
                // FAIL LOUDLY: Validate timestamp conversion
                let timestamp: Date;
                try {
                    timestamp = new Date(cachedData.timestamp);
                    if (isNaN(timestamp.getTime())) {
                        throw new Error(`Invalid timestamp: ${cachedData.timestamp}`);
                    }
                } catch (error) {
                    throw new Error(`❌ CACHE CORRUPTION: Invalid timestamp in cache for layer "${layerName}": ${cachedData.timestamp}. Error: ${error}`);
                }
                cachedData.timestamp = timestamp;
                
                // FAIL LOUDLY: Validate data structure exists
                if (!cachedData.data || typeof cachedData.data !== 'object') {
                    throw new Error(`❌ CACHE CORRUPTION: Invalid data structure in cache for layer "${layerName}". Expected object, got: ${typeof cachedData.data}`);
                }
                
                // FAIL LOUDLY: Validate lastUpdated timestamp
                if (cachedData.data.lastUpdated) {
                    try {
                        const lastUpdated = new Date(cachedData.data.lastUpdated);
                        if (isNaN(lastUpdated.getTime())) {
                            throw new Error(`Invalid lastUpdated timestamp: ${cachedData.data.lastUpdated}`);
                        }
                        cachedData.data.lastUpdated = lastUpdated;
                    } catch (error) {
                        throw new Error(`❌ CACHE CORRUPTION: Invalid lastUpdated timestamp in cache for layer "${layerName}": ${cachedData.data.lastUpdated}. Error: ${error}`);
                    }
                }
                
                // FAIL LOUDLY: Restore Map objects with strict validation
                ['events', 'characters', 'places'].forEach(mapName => {
                    const mapData = cachedData.data[mapName];
                    if (mapData && !mapData.has) { // Not already a Map
                        try {
                            if (Array.isArray(mapData)) {
                                // Validate array format
                                if (!mapData.every(item => Array.isArray(item) && item.length === 2)) {
                                    throw new Error(`Invalid array format for ${mapName}: expected [key, value] pairs`);
                                }
                                const restoredMap = new Map(mapData);
                                
                                // FAIL LOUDLY: Validate that array properties in the data remain arrays
                                for (const [key, value] of restoredMap.entries()) {
                                    const item = value as any; // Cast for cache validation
                                    if (mapName === 'events') {
                                        if (!Array.isArray(item.connectedCharacters)) {
                                            throw new Error(`Event ${key} connectedCharacters is not an array: ${typeof item.connectedCharacters}`);
                                        }
                                        if (!Array.isArray(item.connectedPlaces)) {
                                            throw new Error(`Event ${key} connectedPlaces is not an array: ${typeof item.connectedPlaces}`);
                                        }
                                    } else if (mapName === 'characters') {
                                        if (!Array.isArray(item.aliases)) {
                                            throw new Error(`Character ${key} aliases is not an array: ${typeof item.aliases}`);
                                        }
                                        if (!Array.isArray(item.connectedEvents)) {
                                            throw new Error(`Character ${key} connectedEvents is not an array: ${typeof item.connectedEvents}`);
                                        }
                                        if (!Array.isArray(item.connectedPlaces)) {
                                            throw new Error(`Character ${key} connectedPlaces is not an array: ${typeof item.connectedPlaces}`);
                                        }
                                    } else if (mapName === 'places') {
                                        if (!Array.isArray(item.connectedEvents)) {
                                            throw new Error(`Place ${key} connectedEvents is not an array: ${typeof item.connectedEvents}`);
                                        }
                                        if (!Array.isArray(item.connectedCharacters)) {
                                            throw new Error(`Place ${key} connectedCharacters is not an array: ${typeof item.connectedCharacters}`);
                                        }
                                    }
                                }
                                
                                cachedData.data[mapName] = restoredMap;
                            } else if (typeof mapData === 'object') {
                                // Fallback to object format
                                cachedData.data[mapName] = new Map(Object.entries(mapData));
                            } else {
                                throw new Error(`Invalid ${mapName} data type: ${typeof mapData}`);
                            }
                        } catch (error) {
                            throw new Error(`❌ CACHE CORRUPTION: Failed to restore ${mapName} Map for layer "${layerName}": ${error}`);
                        }
                    }
                });
                
                node.overviewBoardCache.set(layerName, cachedData);
            }
        } else {
            node.overviewBoardCache = new Map();
        }
        
        // Restore last generation parameters
        node.lastGenerationParameters = data.lastGenerationParameters ?? null;
        
        // Restore notes
        node.notes = data.notes ?? '';

        // Restore conditional context items (fail loudly on malformed data)
        // Only restore if not already migrated from legacy context
        if (!legacyContextMigrated && data.conditionalContextItems !== undefined) {
            if (!Array.isArray(data.conditionalContextItems)) {
                throw new Error('❌ CONDITIONAL CONTEXT CORRUPTION: conditionalContextItems must be an array');
            }

            node.conditionalContextItems = data.conditionalContextItems.map((raw: any) => {
                if (!raw || typeof raw !== 'object') {
                    throw new Error('❌ CONDITIONAL CONTEXT CORRUPTION: context item must be an object');
                }
                if (typeof raw.id !== 'string' || !raw.id) {
                    throw new Error('❌ CONDITIONAL CONTEXT CORRUPTION: context item missing valid id');
                }
                if (typeof raw.text !== 'string') {
                    throw new Error(`❌ CONDITIONAL CONTEXT CORRUPTION: context item ${raw.id} missing text`);
                }
                if (raw.keywords !== undefined) {
                    if (!Array.isArray(raw.keywords) || !raw.keywords.every((k: any) => typeof k === 'string')) {
                        throw new Error(`❌ CONDITIONAL CONTEXT CORRUPTION: context item ${raw.id} keywords must be an array of strings`);
                    }
                }

                // Old saves carried `conditions`/`logic` (a since-removed text-condition
                // system); those fields are intentionally ignored on load.
                const item: ConditionalContextItem = {
                    id: raw.id,
                    text: raw.text,
                    keywords: Array.isArray(raw.keywords) ? raw.keywords.slice() : [],
                    childScope: DocumentNode.parseChildScope(raw.childScope, raw.id),
                    leavesOnly: raw.leavesOnly === true
                };
                return item;
            });
        } else if (!legacyContextMigrated) {
            node.conditionalContextItems = [];
        }
        
        // Legacy context migration moved to before version processing
        
        // Restore versions
        if (data.versions && Array.isArray(data.versions)) {
            // New format: restore versions directly
            node.versions = data.versions.map((v: any) => {
                // Handle tags conversion
                let tags: Set<string>;
                if (Array.isArray(v.tags)) {
                    tags = new Set(v.tags);
                } else if (v.tags && typeof v.tags === 'object') {
                    // Handle case where tags might be stored as an object or Set-like structure
                    if (v.tags instanceof Set) {
                        tags = v.tags;
                    } else {
                        // Try to extract values if it's an object with numeric keys (serialized Set)
                        const tagValues = Object.values(v.tags).filter(tag => typeof tag === 'string');
                        tags = new Set(tagValues as string[]);
                    }
                } else {
                    tags = new Set(['master']); // Fallback to master tag
                }
                
                // Remove legacy context field from versions during migration
                const { context, ...cleanVersion } = v;
                
                return {
                    ...cleanVersion,
                    title: (typeof v.title === 'string' && v.title.trim()) ? v.title : safeTitle,
                    tags: tags,
                    timestamp: new Date(v.timestamp)
                };
            });
        } else {
            // Legacy compatibility: convert old format to new version system
            node.versions = [];
            
            // 1. Handle main content (from data.content or data._content)
            const mainContent = (data.content ?? data._content) ?? '';
            const mainTitle = data.title ?? safeTitle;
            
            if (mainContent || mainTitle !== 'Untitled') {
                const masterMetadata: { [key: string]: any } = {};
                
                // Preserve legacy creatorModel if it exists
                if (data.creatorModel) {
                    masterMetadata['creatorModel'] = data.creatorModel;
                }
                
                node.versions.push({
                    id: uuidv4(),
                    content: mainContent,
                    title: mainTitle,
                    tags: new Set(['master', 'legacy']),
                    timestamp: new Date(),
                    metadata: masterMetadata
                });
            }
            
            // 2. Convert legacy generationSessions to versions
            if (data.generationSessions && Array.isArray(data.generationSessions)) {
                data.generationSessions.forEach((session: any) => {
                    if (session.iterations && Array.isArray(session.iterations)) {
                        session.iterations.forEach((iteration: any) => {
                            const tags = new Set(['generated', `iteration${iteration.iteration}`, 'legacy']);
                            
                            // Mark winner iterations
                            if (iteration.wasChosen) {
                                tags.add('generatedWinner');
                            }
                            
                            const iterationMetadata: { [key: string]: any } = {
                                sessionId: session.sessionId,
                                ratings: iteration.ratings ?? []
                            };
                            
                            // If this was the chosen iteration, it might have been the master
                            // But we already created a master from the main content, so don't duplicate
                            if (!iteration.wasChosen || iteration.content !== mainContent) {
                                                            node.versions.push({
                                id: uuidv4(),
                                content: iteration.content,
                                title: mainTitle,
                                tags: tags,
                                timestamp: new Date(iteration.timestamp ?? session.startTime),
                                metadata: iterationMetadata
                            });
                            } else if (iteration.wasChosen && iteration.content === mainContent) {
                                // Update the master version with generation metadata
                                const masterVersion = node.versions.find(v => v.tags.has('master'));
                                if (masterVersion) {
                                    masterVersion.tags.add('generatedWinner');
                                    masterVersion.metadata = { ...masterVersion.metadata, ...iterationMetadata };
                                }
                            }
                        });
                    }
                });
            }
            
            // 3. Ensure we always have at least an empty master version
            if (node.versions.length === 0) {
                node.versions.push({
                    id: uuidv4(),
                    content: '',
                    title: safeTitle,
                    tags: new Set(['master']),
                    timestamp: new Date(),
                    metadata: {}
                });
            }
        }
        
        // Restore todos
        if (data.todos && Array.isArray(data.todos)) {
            node.todos = data.todos.map((todo: any) => ({
                ...todo,
                timestamp: new Date(todo.timestamp)
            }));
        }
        
        // Restore children
        if (data.children && Array.isArray(data.children)) {
            node.children = data.children.map((child: any) => DocumentNode.fromJSON(child));
        }
        
        return node;
    }

    // --- Read-only Getters for Version-based Content ---
    
    get content(): string {
        const masterVersion = this.getMasterVersion();
        if (!masterVersion) {
            throw new Error(`DocumentNode ${this.id}: No master version available - node data corrupted`);
        }
        return masterVersion.content;
    }

    get title(): string {
        const masterVersion = this.getMasterVersion();
        if (!masterVersion) {
            throw new Error(`DocumentNode ${this.id}: No master version available - node data corrupted`);
        }
        return masterVersion.title;
    }



    get creatorModel(): string | null {
        const masterVersion = this.getMasterVersion();
        return masterVersion?.metadata?.['creatorModel'] ?? null;
    }

    // --- Version Management Methods ---

    /**
     * Gets the master version of this node.
     */
    getMasterVersion(): ContentVersion | null {
        return this.versions.find(v => v.tags.has('master')) ?? null;
    }

    /**
     * Gets all versions of this node.
     */
    getAllVersions(): ContentVersion[] {
        return [...this.versions];
    }

    /**
     * Returns the quality ratings on the master version that did not reach their
     * goal. Empty when the node has no rated generation, or when every goal was
     * met. Used to flag nodes whose winning generation fell short of the (strict)
     * quality criteria so the user can revisit them.
     */
    getFailingRatings(): Rating[] {
        const masterVersion = this.getMasterVersion();
        if (!masterVersion?.ratings) {
            return [];
        }
        return masterVersion.ratings.filter(rating => rating.actual < rating.goal);
    }

    /**
     * True when the master version came from a generation that did not meet all
     * quality goals AND the user has not manually authorized it anyway. Clears
     * automatically once the node is regenerated to a passing result, the master
     * is replaced by manual (unrated) content, or the user approves it.
     */
    hasFailedGeneration(): boolean {
        return this.getFailingRatings().length > 0 && !this.isQualityApproved();
    }

    /**
     * True when the user manually authorized the current master version despite
     * unmet quality goals. The approval is stored as a tag on the master version
     * so it is discarded the moment the master is replaced by a regeneration.
     */
    isQualityApproved(): boolean {
        const masterVersion = this.getMasterVersion();
        return masterVersion !== null && masterVersion.tags.has('qualityApproved');
    }

    /**
     * Authorizes the current master version despite unmet quality goals, which
     * removes the failed-generation flag from the tree for this node.
     */
    approveQuality(): void {
        const masterVersion = this.getMasterVersion();
        if (!masterVersion) {
            throw new Error(`DocumentNode ${this.id}: cannot approve quality - no master version exists`);
        }
        masterVersion.tags.add('qualityApproved');
    }

    /**
     * Revokes a prior quality approval, restoring the failed-generation flag when
     * the master version still has unmet quality goals.
     */
    revokeQualityApproval(): void {
        const masterVersion = this.getMasterVersion();
        if (!masterVersion) {
            throw new Error(`DocumentNode ${this.id}: cannot revoke quality approval - no master version exists`);
        }
        masterVersion.tags.delete('qualityApproved');
    }

    /**
     * Gets versions with a specific tag.
     */
    getVersionsWithTag(tag: string): ContentVersion[] {
        return this.versions.filter(v => v.tags.has(tag));
    }

    /**
     * Checks if any version of this node has the consistent_to_parent tag.
     * @returns true if any version has the consistent_to_parent tag, false otherwise
     */
    isConsistentToParent(): boolean {
        return this.versions.some(v => v.tags.has('consistent_to_parent'));
    }

    /**
     * Adds a new version with the given tags if that exact combination doesn't exist.
     * @param tags Array of tag strings
     * @param fields Optional initial field values
     * @param metadata Optional metadata
     * @param ratings Optional ratings array
     * @returns The ID of the created version, or null if no version was created
     */
    addVersion(tags: string[], fields?: { title?: string, content?: string }, metadata?: { [key: string]: any }, ratings?: Rating[]): string | null {
        const tagSet = new Set(tags);
        
        // Check if a version with this exact tag combination already exists
        const existingVersion = this.versions.find(v => {
            if (v.tags.size !== tagSet.size) return false;
            for (const tag of tagSet) {
                if (!v.tags.has(tag)) return false;
            }
            return true;
        });
        
        if (existingVersion) {
            // Version with exact tag combination already exists
            return null;
        }
        
        // Get defaults from master version if available
        const masterVersion = this.getMasterVersion();
        if (!masterVersion) {
            throw new Error(`DocumentNode ${this.id}: Cannot add version - no master version exists (node not properly initialized)`);
        }
        const defaultTitle = masterVersion.title;
        const defaultContent = masterVersion.content;
        
        // Check if we should replace an empty master version
        const masterIsEmpty = masterVersion && masterVersion.content.trim() === '';
        const newContentIsReal = fields?.content && fields.content.trim() !== '';
        const isGenerationIteration = tags.includes('generated') && tags.some(tag => tag.startsWith('iteration'));
        const shouldReplaceMaster = masterIsEmpty && newContentIsReal && !isGenerationIteration;
        
        // If no master version exists and this is the first version with actual content,
        // automatically make it master (unless it's a generation iteration)
        const shouldBeMaster = !masterVersion || shouldReplaceMaster;
        
        if (shouldBeMaster && !isGenerationIteration) {
            tagSet.add('master');
        }
        
        // If replacing empty master, remove it first
        if (shouldReplaceMaster) {
            const masterIndex = this.versions.findIndex(v => v.id === masterVersion!.id);
            if (masterIndex !== -1) {
                this.versions.splice(masterIndex, 1);
            }
        }
        
        // Create new version
        const newVersion: ContentVersion = {
            id: uuidv4(),
            content: fields?.content ?? defaultContent,
            title: fields?.title ?? defaultTitle,
            tags: tagSet,
            timestamp: new Date(),
            metadata: metadata ?? {},
            ...(ratings && { ratings: ratings })
        };
        
        // If this version becomes master, remove master tag from remaining versions
        if (newVersion.tags.has('master')) {
            this.versions.forEach(v => v.tags.delete('master'));
        }
        
        this.versions.push(newVersion);
        return newVersion.id;
    }

    /**
     * Creates an explicit, user-named snapshot version that freezes the given
     * title/content. Unlike a generation or chat edit, the snapshot is NOT
     * promoted to master - it is a labelled, frozen copy kept purely for history.
     * @param name Non-empty display name for the snapshot.
     * @param fields Title/content to freeze (typically the current master's).
     * @returns The id of the created snapshot version.
     */
    createNamedVersion(name: string, fields: { title: string; content: string }): string {
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            throw new Error(`DocumentNode ${this.id}: cannot create a named version with an empty name`);
        }
        const snapshot: ContentVersion = {
            id: uuidv4(),
            content: fields.content,
            title: fields.title,
            tags: new Set(['snapshot']),
            timestamp: new Date(),
            metadata: {},
            label: trimmedName
        };
        this.versions.push(snapshot);
        return snapshot.id;
    }

    /**
     * Suggests a sensible default name for the next explicit snapshot version,
     * based on how many snapshots already exist on this node.
     */
    suggestNextVersionName(): string {
        const snapshotCount = this.versions.filter(v => v.tags.has('snapshot')).length;
        return `Version ${snapshotCount + 1}`;
    }

    /**
     * Sets content. If tag provided, adds that tag to the master version.
     * @param content New content value
     * @param tag Optional tag - if provided, adds this tag to the master version
     */
    setContent(content: string, tag?: string): void {
        const masterVersion = this.getMasterVersion();
        if (masterVersion) {
            // Only proceed if content actually changed
            if (masterVersion.content !== content) {
                masterVersion.content = content;
                masterVersion.timestamp = new Date();
                
                // Add tag if provided (only when content actually changed)
                if (tag) {
                    masterVersion.tags.add(tag);
                }
            }
        }
    }

    /**
     * Sets content with multiple tags.
     * @param content New content value
     * @param tags Array of tags to add to the master version
     */
    setContentWithTags(content: string, tags: string[]): void {
        const masterVersion = this.getMasterVersion();
        if (masterVersion) {
            masterVersion.content = content;
            masterVersion.timestamp = new Date();
            
            // Add all tags
            tags.forEach(tag => masterVersion.tags.add(tag));
        }
    }



    /**
     * Sets title. If tag provided, adds that tag to the master version only when title actually changes.
     * @param title New title value
     * @param tag Optional tag - if provided, adds this tag to the master version when title changes
     */
    setTitle(title: string, tag?: string): void {
        const masterVersion = this.getMasterVersion();
        if (masterVersion) {
            // Only proceed if title actually changed
            if (masterVersion.title !== title) {
                masterVersion.title = title;
                masterVersion.timestamp = new Date();
                
                // Add tag if provided (only when title actually changed)
                if (tag) {
                    masterVersion.tags.add(tag);
                }
            }
        }
    }

    /**
     * Sets title with multiple tags.
     * @param title New title value
     * @param tags Array of tags to add to the master version
     */
    setTitleWithTags(title: string, tags: string[]): void {
        const masterVersion = this.getMasterVersion();
        if (masterVersion) {
            masterVersion.title = title;
            masterVersion.timestamp = new Date();
            
            // Add all tags
            tags.forEach(tag => masterVersion.tags.add(tag));
        }
    }

    /**
     * Promotes a version to master.
     */
    promoteToMaster(versionId: string, additionalTags: string[] = []): void {
        const version = this.versions.find(v => v.id === versionId);
        if (!version) {
            throw new Error(`Version with id ${versionId} not found`);
        }
        
        // Remove master tag from all versions
        this.versions.forEach(v => v.tags.delete('master'));
        
        // Add master tag and any additional tags to the promoted version
        version.tags.add('master');
        additionalTags.forEach(tag => version.tags.add(tag));
        version.timestamp = new Date();
    }

    /**
     * Removes a version by its ID with safety checks.
     * @param versionId The ID of the version to remove
     * @returns true if version was removed, false if not found or cannot be removed
     * @throws Error if trying to remove master version or the last remaining version
     */
    removeVersion(versionId: string): boolean {
        const versionIndex = this.versions.findIndex(v => v.id === versionId);
        if (versionIndex === -1) {
            return false; // Version not found
        }
        
        const version = this.versions[versionIndex];
        if (!version) {
            return false; // Should not happen, but TypeScript safety
        }
        
        // Cannot remove master version
        if (version.tags.has('master')) {
            throw new Error('Cannot remove master version. Promote another version to master first.');
        }
        
        // Cannot remove if it's the only version
        if (this.versions.length <= 1) {
            throw new Error('Cannot remove the last remaining version.');
        }
        
        // Remove the version
        this.versions.splice(versionIndex, 1);
        return true;
    }

    /**
     * Sets content during generation process (does NOT promote to master automatically).
     */
    setContentFromGeneration(newContent: string, model?: string, iterationIndex?: number, modelTag?: string): void {
        // Get current master version for title preservation
        const currentMaster = this.getMasterVersion();
        if (!currentMaster) {
            throw new Error(`DocumentNode ${this.id}: Cannot set generation content - no master version exists (node not properly initialized)`);
        }
        const preservedTitle = currentMaster.title;
        
        const tags = ['generated']; // Do NOT include master tag automatically
        if (iterationIndex !== undefined) {
            tags.push(`iteration${iterationIndex}`);
        }
        // Tag the version with the friendly model name so users can see at a
        // glance which model produced each generated version.
        if (modelTag) {
            tags.push(modelTag);
        }
        
        const metadata: { [key: string]: any } = {};
        if (model) {
            metadata['creatorModel'] = model;
        }
        
        // Look up ratings from the generation session if iteration index is provided
        let ratings: Rating[] | undefined;
        if (iterationIndex !== undefined) {
            const currentSession = this.currentGenerationSession;
            const latestSession = this.getLatestGenerationSession();
            
            // Check current session first, then latest session
            const sessionToCheck = currentSession ?? latestSession;
            if (sessionToCheck) {
                const iteration = sessionToCheck.iterations.find(iter => iter.iteration === iterationIndex);
                if (iteration?.ratings) {
                    ratings = iteration.ratings.map(r => ({ ...r })); // Deep copy ratings
                }
            }
        }
        
        this.addVersion(tags, {
            content: newContent,
            title: preservedTitle
        }, metadata, ratings);
    }



    /**
     * Starts a new generation session.
     */
    startGenerationSession(originalPrompt: string): string {
        const sessionId = uuidv4();
        this.currentGenerationSession = {
            sessionId,
            startTime: new Date(),
            originalPrompt,
            iterations: [],
            finalIterationNumber: 0,
            success: false,
            totalIterationsAttempted: 0
        };
        return sessionId;
    }

    /**
     * Adds an iteration to the current generation session.
     */
    addGenerationIteration(iteration: number, content: string, ratings: Rating[]): void {
        if (!this.currentGenerationSession) {
            throw new Error('No active generation session. Call startGenerationSession first.');
        }

        const generationIteration: GenerationIteration = {
            iteration,
            content,
            ratings: ratings.map(r => ({ ...r })), // Deep copy ratings
            wasChosen: false, // Will be set later when session ends
            timestamp: new Date()
        };

        this.currentGenerationSession.iterations.push(generationIteration);
        this.currentGenerationSession.totalIterationsAttempted = Math.max(
            this.currentGenerationSession.totalIterationsAttempted, 
            iteration
        );
    }

    /**
     * Ends the current generation session and marks the final content.
     */
    endGenerationSession(success: boolean, finalContent: string): void {
        if (!this.currentGenerationSession) {
            throw new Error('No active generation session to end.');
        }

        this.currentGenerationSession.endTime = new Date();
        this.currentGenerationSession.success = success;

        // Find and mark the iteration that matches the final content
        const finalIteration = this.currentGenerationSession.iterations.find(
            iter => iter.content === finalContent
        );
        
        if (finalIteration) {
            finalIteration.wasChosen = true;
            this.currentGenerationSession.finalIterationNumber = finalIteration.iteration;
        } else {
            // If no exact match found, assume the last iteration was chosen
            const lastIteration = this.currentGenerationSession.iterations[
                this.currentGenerationSession.iterations.length - 1
            ];
            if (lastIteration) {
                lastIteration.wasChosen = true;
                this.currentGenerationSession.finalIterationNumber = lastIteration.iteration;
            }
        }

        // Move completed session to history
        this.generationSessions.push(this.currentGenerationSession);
        this.currentGenerationSession = null;
    }

    /**
     * Gets the most recent generation session.
     */
    getLatestGenerationSession(): GenerationSession | null {
        return this.generationSessions.length > 0 
            ? this.generationSessions[this.generationSessions.length - 1] ?? null
            : null;
    }

    /**
     * Gets all rejected iterations from the latest generation session.
     */
    getRejectedIterations(): GenerationIteration[] {
        const latestSession = this.getLatestGenerationSession();
        return latestSession 
            ? latestSession.iterations.filter(iter => !iter.wasChosen)
            : [];
    }

    /**
     * Gets the chosen iteration from the latest generation session.
     */
    getChosenIteration(): GenerationIteration | null {
        const latestSession = this.getLatestGenerationSession();
        return latestSession 
            ? latestSession.iterations.find(iter => iter.wasChosen) ?? null
            : null;
    }

    /**
     * Calculates the quality score for a version based on its ratings.
     * @param version The version to calculate score for
     * @returns The calculated score
     */
    static calculateVersionScore(version: ContentVersion): number {
        // No ratings = manual work = highest priority score
        if (!version.ratings || version.ratings.length === 0) {
            return 10000;
        }

        // Calculate sum of all rating scores
        const totalScore = version.ratings.reduce((sum, rating) => sum + rating.actual, 0);
        
        // Check if all goals are met
        const allGoalsMet = version.ratings.every(rating => rating.actual >= rating.goal);
        
        if (allGoalsMet) {
            // All goals met: return sum of scores
            return totalScore;
        } else {
            // At least one goal failed: subtract penalty to ensure it's below successful versions
            return totalScore - 1000;
        }
    }

    /**
     * Checks if the node is a leaf node according to its template.
     * A node is a leaf if its level is the last one defined in the template.
     */
    get isLeaf(): boolean {
        // Level is 0-indexed, template length is 1-based.
        return this.level >= this.template.length - 1;
    }

    /**
     * Gets the name for the next level of children.
     * e.g., if this node is an "Act" (level 1), it would return "Chapter" (level 2).
     * Extracts just the base name, so "Part 3" becomes "Part".
     * Returns null if the node is a leaf.
     */
    get childLevelName(): string | null {
        if (this.isLeaf) {
            return null;
        }
        const rawChildLevelName = this.template[this.level + 1] ?? null;
        if (!rawChildLevelName) {
            return null;
        }
        
        // Extract just the base name (remove numbers)
        // Pattern: "Part 3" -> "Part", "Chapter 10" -> "Chapter"
        const match = rawChildLevelName.match(/^(\w+)(?:\s+\d+)?$/);
        return match?.[1] ?? rawChildLevelName;
    }

    /**
     * Find a descendant node by ID recursively searching through the tree.
     * @param targetId The ID of the node to find
     * @returns The found node or null if not found
     */
    findDescendantById(targetId: string): DocumentNode | null {
        if (this.id === targetId) {
            return this;
        }
        
        for (const child of this.children) {
            const found = child.findDescendantById(targetId);
            if (found) {
                return found;
            }
        }
        
        return null;
    }



    /**
     * Add a todo item to this node
     */
    addTodo(
        description: string, 
        relatedNodes: TodoNodeReference[] = [], 
        logicError?: {
            type: string;
            severity: number;
            justification: string;
            suggestedFix?: string;
        }
    ): TodoItem {
        const todo: TodoItem = {
            id: uuidv4(),
            description,
            relatedNodes,
            timestamp: new Date(),
            completed: false
        };
        
        if (logicError) {
            todo.logicError = logicError;
        }
        
        this.todos.push(todo);
        return todo;
    }

    /**
     * Mark a todo item as completed
     */
    completeTodo(todoId: string): boolean {
        const todo = this.todos.find(t => t.id === todoId);
        if (todo) {
            todo.completed = true;
            return true;
        }
        return false;
    }

    /**
     * Remove a todo item
     */
    removeTodo(todoId: string): boolean {
        const index = this.todos.findIndex(t => t.id === todoId);
        if (index !== -1) {
            this.todos.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get incomplete todos
     */
    getIncompleteTodos(): TodoItem[] {
        return this.todos.filter(todo => !todo.completed);
    }

    /**
     * Get all todos related to a specific node
     */
    getTodosForNode(nodeId: string): TodoItem[] {
        return this.todos.filter(todo => 
            todo.relatedNodes.some(ref => ref.id === nodeId)
        );
    }

    // ---------------- Conditional Context API ----------------

    public getConditionalContextItems(): ConditionalContextItem[] {
        return this.conditionalContextItems.map(item => ({
            id: item.id,
            text: item.text,
            keywords: Array.isArray(item.keywords) ? item.keywords.slice() : [],
            childScope: { mode: item.childScope?.mode ?? 'all', titles: (item.childScope?.titles ?? []).slice() },
            leavesOnly: item.leavesOnly === true
        }));
    }

    /**
     * Replace ALL conditional context items on this node with deep copies of the
     * provided snapshot. Used to revert live context edits — e.g. when the node
     * chat editor is closed without saving — back to a captured baseline.
     */
    public setConditionalContextItems(items: ConditionalContextItem[]): void {
        this.conditionalContextItems = items.map(item => ({
            id: item.id,
            text: item.text,
            keywords: Array.isArray(item.keywords) ? item.keywords.slice() : [],
            childScope: { mode: item.childScope?.mode ?? 'all', titles: (item.childScope?.titles ?? []).slice() },
            leavesOnly: item.leavesOnly === true
        }));
    }

    /**
     * Create a new conditional context item. New items default to the broadest
     * scope (all children, every layer, no keyword gate); callers narrow them
     * via updateConditionalContextItem. This is the single creation entry point.
     */
    public addConditionalContextItem(text: string): string {
        if (typeof text !== 'string') {
            throw new Error('Conditional context item requires text');
        }

        // Generate simplified context ID for this conditional context item
        const project = findProjectByNode(this);
        const rootNode = project ? project.rootNode : this; // fallback to this node if project not found
        const id = generateNewContextID(rootNode);
        const item: ConditionalContextItem = {
            id,
            text,
            keywords: [],
            childScope: { mode: 'all', titles: [] },
            leavesOnly: false
        };
        this.conditionalContextItems.push(item);
        return id;
    }

    public updateConditionalContextItem(id: string, updates: Partial<Pick<ConditionalContextItem, 'text' | 'keywords' | 'childScope' | 'leavesOnly'>>): void {
        const item = this.conditionalContextItems.find(i => i.id === id);
        if (!item) {
            throw new Error(`Conditional context item not found: ${id}`);
        }
        if (updates.text !== undefined) {
            if (typeof updates.text !== 'string') {
                throw new Error('Updated text must be a string');
            }
            // Allow empty text during live editing; consumers may validate on save if needed
            item.text = updates.text;
        }
        if (updates.keywords !== undefined) {
            if (!Array.isArray(updates.keywords) || !updates.keywords.every(k => typeof k === 'string')) {
                throw new Error('Keywords update must be an array of strings');
            }
            item.keywords = updates.keywords.slice();
        }
        if (updates.childScope !== undefined) {
            item.childScope = DocumentNode.parseChildScope(updates.childScope, id);
        }
        if (updates.leavesOnly !== undefined) {
            if (typeof updates.leavesOnly !== 'boolean') {
                throw new Error('leavesOnly update must be a boolean');
            }
            item.leavesOnly = updates.leavesOnly;
        }
    }

    public removeConditionalContextItem(id: string): boolean {
        const index = this.conditionalContextItems.findIndex(i => i.id === id);
        if (index === -1) {
            return false;
        }
        this.conditionalContextItems.splice(index, 1);
        return true;
    }

    /**
     * Assemble matching conditional context TEXT from this node and all ancestors.
     * The triggering node is used for evaluating all conditions (for both this node's and ancestors' items).
     * Items are concatenated separated by two newlines, in order from root → ... → this.
     */
    public assembleConditionalContext(triggeringNode: DocumentNode, root: DocumentNode): string {
        // Constraint items (prefixed with CONSTRAINT_PREFIX) are surfaced as
        // verifiable criteria, not as passive context, so they are excluded here.
        const items = this.collectMatchingConditionalContextItems(triggeringNode, root)
            .filter(i => !DocumentNode.isConstraintText(i.text));
        return items.map(i => i.text).join('\n\n');
    }

    /** True when a context item's text declares a binary verifiable constraint. */
    public static isConstraintText(text: string): boolean {
        return text.trimStart().startsWith(CONSTRAINT_PREFIX);
    }

    /** Remove the constraint prefix and surrounding whitespace from an item's text. */
    public static stripConstraintPrefix(text: string): string {
        return text.trimStart().slice(CONSTRAINT_PREFIX.length).trim();
    }

    /**
     * Applicable binary constraints for THIS node (this node as the trigger),
     * returned as the instruction texts with the constraint prefix stripped.
     */
    public getApplicableConstraints(root: DocumentNode): string[] {
        return this.collectMatchingConditionalContextItems(this, root)
            .filter(i => DocumentNode.isConstraintText(i.text))
            .map(i => DocumentNode.stripConstraintPrefix(i.text));
    }

    /**
     * Central helper: get applicable conditional context items for THIS node,
     * evaluated with this node as the trigger against the provided root.
     */
    public getApplicableConditionalContextItems(root: DocumentNode): ConditionalContextItem[] {
        return this.collectMatchingConditionalContextItems(this, root);
    }

    /**
     * Central helper: assemble applicable conditional context TEXT for THIS node.
     */
    public assembleApplicableConditionalContext(root: DocumentNode): string {
        return this.assembleConditionalContext(this, root);
    }

    /**
     * Central static helper: get applicable conditional context items for an arbitrary node.
     */
    public static getApplicableConditionalContextItemsFor(triggeringNode: DocumentNode, root: DocumentNode): ConditionalContextItem[] {
        return triggeringNode.collectMatchingConditionalContextItems(triggeringNode, root);
    }

    /**
     * Central static helper: assemble applicable conditional context TEXT for an arbitrary node.
     */
    public static assembleApplicableConditionalContextFor(triggeringNode: DocumentNode, root: DocumentNode): string {
        return triggeringNode.assembleConditionalContext(triggeringNode, root);
    }

    /**
     * Collect matching conditional context items from this node and ancestors (root-first order).
     */
    public collectMatchingConditionalContextItems(triggeringNode: DocumentNode, root: DocumentNode): ConditionalContextItem[] {
        // Build the chain root -> ... -> this node. Each entry owns context items
        // whose structural scope is evaluated relative to its own direct children.
        const chain = DocumentNode.findPathFromRoot(root, this.id);
        if (!chain || chain.length === 0) {
            throw new Error(`Cannot assemble conditional context: node ${this.id} not found under provided root`);
        }
        const results: ConditionalContextItem[] = [];
        for (let i = 0; i < chain.length; i++) {
            const owner = chain[i]!;
            // The owner's direct child that lies on the path toward the target
            // node (null when the owner IS the target node).
            const childOnPath = i + 1 < chain.length ? chain[i + 1]! : null;
            for (const item of owner.conditionalContextItems) {
                if (this.evaluateConditionalContextItem(item, childOnPath, triggeringNode, root)) {
                    results.push(item);
                }
            }
        }
        return results;
    }

    // ---------------- Internal helpers for conditional context ----------------

    /**
     * Evaluate whether an item owned by some ancestor applies to the target
     * (triggering) node. Three independent gates, all of which must pass:
     *  1. childScope - is the target within the allowed direct-child subtrees?
     *  2. leavesOnly - if set, the target must be a leaf-layer (prose) node.
     *  3. keywords   - if set, at least one keyword must appear in the target's
     *                  content (this node + previous same-layer siblings).
     * @param childOnPath the owner's direct child on the path to the target, or
     *        null when the owner itself is the target.
     */
    private evaluateConditionalContextItem(item: ConditionalContextItem, childOnPath: DocumentNode | null, triggeringNode: DocumentNode, root: DocumentNode): boolean {
        // 1) Structural child scope (relative to the OWNER's direct children).
        const scope = item.childScope;
        if (scope && scope.mode !== 'all') {
            // Child-targeted items never apply to the owner's own generation.
            if (!childOnPath) {
                return false;
            }
            const inList = scope.titles.includes(childOnPath.title);
            if (scope.mode === 'include' && !inList) {
                return false;
            }
            if (scope.mode === 'exclude' && inList) {
                return false;
            }
        }

        // 2) Reach: leaves only.
        if (item.leavesOnly === true && !triggeringNode.isLeaf) {
            return false;
        }

        // 3) Keyword gate: at least one keyword must appear in the target's
        //    content (this node + previous siblings at the same layer).
        if (Array.isArray(item.keywords) && item.keywords.length > 0) {
            const haystack = this.getKeywordHaystack(triggeringNode, root);
            const keywordMatched = item.keywords.some((kw) =>
                DocumentNode.containsMatch(haystack, kw, /*wordwise*/ true, /*caseSensitive*/ false)
            );
            if (!keywordMatched) {
                return false;
            }
        }

        return true;
    }

    /**
     * Content used for the keyword gate: the triggering node plus its previous
     * siblings at the same layer, joined.
     */
    private getKeywordHaystack(triggeringNode: DocumentNode, root: DocumentNode): string {
        const parentInfo = DocumentNode.findParentAndIndex(root, triggeringNode.id);
        if (!parentInfo) {
            return triggeringNode.content || '';
        }
        const { parent, indexInParent } = parentInfo;
        const slice = parent.children.slice(0, indexInParent + 1);
        return slice.map(n => n.content || '').filter(s => s && s.length > 0).join('\n\n');
    }

    private static containsMatch(haystack: string, needle: string, wordwise: boolean, caseSensitive: boolean): boolean {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = wordwise ? `\\b${escaped}\\b` : escaped;
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(pattern, flags);
        return regex.test(haystack);
    }

    /**
     * Titles of this node's direct children. When children have not been
     * generated yet, the deterministic `===Section===` headers in this node's
     * own outline are used as the prospective child titles, so a scope can be
     * authored at the top before anything below exists.
     */
    public getDirectChildTitles(): string[] {
        // Union of already-generated children and the prospective children parsed
        // from this node's outline (===Section=== headers). Deterministic child
        // creation fills in any outline section that has no child yet, so a scope
        // may legitimately target a section that has not been expanded into a child
        // node even while OTHER siblings already exist as children.
        const titles: string[] = [];
        const seen = new Set<string>();
        for (const child of this.children) {
            if (!seen.has(child.title)) {
                seen.add(child.title);
                titles.push(child.title);
            }
        }
        for (const sectionTitle of parseSectionTitles(this.content || '')) {
            if (!seen.has(sectionTitle)) {
                seen.add(sectionTitle);
                titles.push(sectionTitle);
            }
        }
        return titles;
    }

    /**
     * Validate/normalize a ChildScope coming from JSON or an update call.
     */
    private static parseChildScope(raw: any, itemId: string): ChildScope {
        if (raw === undefined || raw === null) {
            return { mode: 'all', titles: [] };
        }
        if (typeof raw !== 'object') {
            throw new Error(`❌ CONDITIONAL CONTEXT CORRUPTION: item ${itemId} childScope must be an object`);
        }
        if (raw.mode !== 'all' && raw.mode !== 'include' && raw.mode !== 'exclude') {
            throw new Error(`❌ CONDITIONAL CONTEXT CORRUPTION: item ${itemId} childScope has invalid mode: ${raw.mode}`);
        }
        const titles = raw.titles === undefined ? [] : raw.titles;
        if (!Array.isArray(titles) || !titles.every((t: any) => typeof t === 'string')) {
            throw new Error(`❌ CONDITIONAL CONTEXT CORRUPTION: item ${itemId} childScope.titles must be an array of strings`);
        }
        return { mode: raw.mode, titles: titles.slice() };
    }

    private static findPathFromRoot(root: DocumentNode, targetId: string): DocumentNode[] {
        const path: DocumentNode[] = [];
        const found = (function dfs(node: DocumentNode): boolean {
            path.push(node);
            if (node.id === targetId) return true;
            for (const child of node.children) {
                if (dfs(child)) return true;
            }
            path.pop();
            return false;
        })(root);
        return found ? path : [];
    }

    /**
     * Public helper: returns the path from the provided root to the target node (inclusive).
     * Throws if the target node is not found under the root.
     */
    public static getPathFromRoot(root: DocumentNode, targetId: string): DocumentNode[] {
        const chain = DocumentNode.findPathFromRoot(root, targetId);
        if (!chain || chain.length === 0) {
            throw new Error(`Cannot build path: node ${targetId} not found under provided root`);
        }
        return chain;
    }

    private static findParentAndIndex(root: DocumentNode, targetId: string): { parent: DocumentNode; indexInParent: number } | null {
        const stack: DocumentNode[] = [root];
        while (stack.length > 0) {
            const node = stack.pop()!;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (!child) continue;
                if (child.id === targetId) {
                    return { parent: node, indexInParent: i };
                }
            }
            for (const child of node.children) stack.push(child);
        }
        return null;
    }

    /**
     * Builds the hierarchical path from the provided root to this node, formatted as
     * "LevelName: Title => LevelName: Title => ..." with numeric suffixes removed from level names.
     */
    public getPath(root: DocumentNode): string {
        const chain = DocumentNode.findPathFromRoot(root, this.id);
        if (!chain || chain.length === 0) {
            throw new Error(`Cannot build path: node ${this.id} not found under provided root`);
        }
        const parts = chain.map((n) => {
            const rawLevelName = (n.template[n.level] ?? `Level ${n.level}`).trim();
            const match = rawLevelName.match(/^(\w+)(?:\s+\d+)?$/);
            const levelName = (match?.[1] ?? rawLevelName).trim();
            const cleanTitle = (n.title || '').trim();
            return `${levelName}: ${cleanTitle}`;
        });
        return parts.join(' => ');
    }

    /**
     * Get deterministic child creation setting for this node
     */
    public getDeterministicChildCreation(): boolean {
        return this.lastGenerationParameters?.deterministicChildCreation ?? false;
    }

    /**
     * Set deterministic child creation setting for this node
     */
    public setDeterministicChildCreation(enabled: boolean): void {
        if (!this.lastGenerationParameters) {
            this.lastGenerationParameters = {
                draftLevel: -1,
                contentLevel: -1,
                coherenceLevel: -1,
                autofixSeverity: 0,
                deterministicChildCreation: enabled
            };
        } else {
            this.lastGenerationParameters.deterministicChildCreation = enabled;
        }
    }
}