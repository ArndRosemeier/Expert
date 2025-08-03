import { LoopHistoryItem } from './LoopOrchestrator';
import { Rating } from './types/RatingTypes';
import { v4 as uuidv4 } from 'uuid';

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
export interface LastGenerationParameters {
    draftLevel: number;
    contentLevel: number;
    contextPruneLevel: number;
    coherenceLevel: number;
    autofixSeverity: number;
}

/**
 * Represents a single version of node content with tags and metadata.
 */
export interface ContentVersion {
    id: string;
    content: string;
    title: string;
    context: string;
    tags: Set<string>;
    timestamp: Date;
    ratings?: Rating[];
    creatorModel?: string;
    metadata?: { [key: string]: any };
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

    constructor(level: number, initialTitle: string, parentId: string | null = null, template: string[] = [], initialContext: string = '', initialContent: string = '') {
        this.id = uuidv4();
        this.level = level;
        this.parentId = parentId;
        this.template = template;

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
        
        // Create initial master version
        const initialVersion = {
            id: uuidv4(),
            content: initialContent || '',
            title: initialTitle,
            context: initialContext || '',
            tags: new Set(['master']),
            timestamp: new Date(),
            metadata: {}
        };
        
        this.versions = [initialVersion];
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
        if (match && match[2]) {
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
            notes: this.notes
        };
    }

    /**
     * Static method to restore from JSON with legacy compatibility.
     */
    static fromJSON(data: any): DocumentNode {
        // Always use a non-empty string for title
        const safeTitle = (typeof data.title === 'string' && data.title.trim()) ? data.title : 'Untitled';
        
        // Create node with empty initial values (will be overwritten by versions)
        const node = new DocumentNode(data.level, safeTitle, data.parentId, data.template, '', '');
        
        // Restore basic properties
        node.id = data.id;
        node.collapsed = data.collapsed || false;
        node.generationPrompt = data.generationPrompt;
        node.isPromptGenerating = false; // Always reset transient state on load
        node.generationHistory = data.generationHistory || [];
        node.isGenerating = false; // Always reset transient state on load
        node.generationSessions = data.generationSessions || [];
        
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
        node.lastGenerationParameters = data.lastGenerationParameters || null;
        
        // Restore notes
        node.notes = data.notes || '';
        
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
                
                return {
                    ...v,
                    title: (typeof v.title === 'string' && v.title.trim()) ? v.title : safeTitle,
                    tags: tags,
                    timestamp: new Date(v.timestamp)
                };
            });
        } else {
            // Legacy compatibility: convert old format to new version system
            node.versions = [];
            
            // 1. Handle main content (from data.content or data._content)
            const mainContent = data.content || data._content || '';
            const mainTitle = data.title || safeTitle;
            const mainContext = data.context || data.summary || '';
            
            if (mainContent || mainTitle !== 'Untitled' || mainContext) {
                const masterMetadata: { [key: string]: any } = {};
                
                // Preserve legacy creatorModel if it exists
                if (data.creatorModel) {
                    masterMetadata['creatorModel'] = data.creatorModel;
                }
                
                node.versions.push({
                    id: uuidv4(),
                    content: mainContent,
                    title: mainTitle,
                    context: mainContext,
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
                                ratings: iteration.ratings || []
                            };
                            
                            // If this was the chosen iteration, it might have been the master
                            // But we already created a master from the main content, so don't duplicate
                            if (!iteration.wasChosen || iteration.content !== mainContent) {
                                                            node.versions.push({
                                id: uuidv4(),
                                content: iteration.content,
                                title: mainTitle,
                                context: mainContext,
                                tags: tags,
                                timestamp: new Date(iteration.timestamp || session.startTime),
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
                    context: '',
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

    get context(): string {
        const masterVersion = this.getMasterVersion();
        if (!masterVersion) {
            throw new Error(`DocumentNode ${this.id}: No master version available - node data corrupted`);
        }
        return masterVersion.context;
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
    addVersion(tags: string[], fields?: { title?: string, content?: string, context?: string }, metadata?: { [key: string]: any }, ratings?: Rating[]): string | null {
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
        const defaultContext = masterVersion.context;
        
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
            context: fields?.context ?? defaultContext,
            tags: tagSet,
            timestamp: new Date(),
            metadata: metadata || {},
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
     * Sets context. If tag provided, adds that tag to the master version only when context actually changes.
     * @param context New context value
     * @param tag Optional tag - if provided, adds this tag to the master version when context changes
     */
    setContext(context: string, tag?: string): void {
        const masterVersion = this.getMasterVersion();
        if (masterVersion) {
            // Only proceed if context actually changed
            if (masterVersion.context !== context) {
                masterVersion.context = context;
                masterVersion.timestamp = new Date();
                
                // Add tag if provided (only when context actually changed)
                if (tag) {
                    masterVersion.tags.add(tag);
                }
            }
        }
    }

    /**
     * Sets context with multiple tags.
     * @param context New context value
     * @param tags Array of tags to add to the master version
     */
    setContextWithTags(context: string, tags: string[]): void {
        const masterVersion = this.getMasterVersion();
        if (masterVersion) {
            masterVersion.context = context;
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
    setContentFromGeneration(newContent: string, model?: string, iterationIndex?: number): void {
        // Get current master version for title/context preservation
        const currentMaster = this.getMasterVersion();
        if (!currentMaster) {
            throw new Error(`DocumentNode ${this.id}: Cannot set generation content - no master version exists (node not properly initialized)`);
        }
        const preservedTitle = currentMaster.title;
        const preservedContext = currentMaster.context;
        
        const tags = ['generated']; // Do NOT include master tag automatically
        if (iterationIndex !== undefined) {
            tags.push(`iteration${iterationIndex}`);
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
                if (iteration && iteration.ratings) {
                    ratings = iteration.ratings.map(r => ({ ...r })); // Deep copy ratings
                }
            }
        }
        
        this.addVersion(tags, {
            content: newContent,
            title: preservedTitle,
            context: preservedContext
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
            ? latestSession.iterations.find(iter => iter.wasChosen) || null
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
        return match && match[1] ? match[1] : rawChildLevelName;
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
     * Checks if the node's context has been AI-adjusted.
     * Returns true if the master version has the 'context_ai_adjusted' tag,
     * or if all other versions with 'context_ai_adjusted' tag have the same context as the master.
     */
    ContextIsAdjusted(): boolean {
        const masterVersion = this.getMasterVersion();
        if (!masterVersion) {
            return false;
        }
        
        // First check if master version has context_ai_adjusted tag
        if (masterVersion.tags.has('context_ai_adjusted')) {
            return true;
        }
        
        // Find all other versions with context_ai_adjusted tag
        const adjustedVersions = this.getVersionsWithTag('context_ai_adjusted');
        
        // If no adjusted versions found, return false
        if (adjustedVersions.length === 0) {
            return false;
        }
        
        // Check if all adjusted versions have the same context as master
        const masterContext = masterVersion.context;
        const allVersionsMatch = adjustedVersions.every(version => 
            version.context === masterContext
        );
        
        return allVersionsMatch;
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
}