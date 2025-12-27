/**
 * World State Service
 * 
 * Manages the RPG world state with CRUD operations, snapshots, locking, and relationship graph traversal.
 */

import { 
    RPGGameSession, 
    RPGWorldState, 
    RPGSnapshot, 
    RPGSnapshotSerialized,
    RPGLocation, 
    RPGCharacter, 
    RPGLore, 
    RPGRelationship, 
    RPGDistance,
    serializeSnapshot,
    deserializeSnapshot,
    serializeSession
} from '../types/RPGTypes';
import { StorageService } from '../../StorageService';

export class WorldStateService {
    private isStateLocked: boolean = false;
    private lockReason: string = '';
    
    constructor() {}
    
    // ========================================
    // State Locking (prevent modifications during analysis)
    // ========================================
    
    /**
     * Lock the world state to prevent modifications
     */
    lockState(reason: string): void {
        this.isStateLocked = true;
        this.lockReason = reason;
        console.log(`🔒 World state locked: ${reason}`);
    }
    
    /**
     * Unlock the world state
     */
    unlockState(): void {
        this.isStateLocked = false;
        console.log(`🔓 World state unlocked (was: ${this.lockReason})`);
        this.lockReason = '';
    }
    
    /**
     * Check if the world state is locked
     */
    isLocked(): boolean {
        return this.isStateLocked;
    }
    
    /**
     * Get the reason for locking
     */
    getLockReason(): string {
        return this.lockReason;
    }
    
    /**
     * Throw error if state is locked
     */
    private assertUnlocked(): void {
        if (this.isStateLocked) {
            throw new Error(`World state is locked: ${this.lockReason}`);
        }
    }
    
    // ========================================
    // CRUD Operations - Locations
    // ========================================
    
    createLocation(worldState: RPGWorldState, location: RPGLocation): void {
        this.assertUnlocked();
        
        if (worldState.locations.has(location.id)) {
            throw new Error(`Location with ID '${location.id}' already exists`);
        }
        
        worldState.locations.set(location.id, location);
    }
    
    getLocation(worldState: RPGWorldState, id: string): RPGLocation | undefined {
        return worldState.locations.get(id);
    }
    
    updateLocation(worldState: RPGWorldState, id: string, updates: Partial<RPGLocation>): void {
        this.assertUnlocked();
        
        const existing = worldState.locations.get(id);
        if (!existing) {
            // Upsert behavior: create if doesn't exist
            console.log(`⚠️ Location '${id}' not found, creating it instead`);
            this.createLocation(worldState, {
                id,
                name: updates.name || id,
                description: updates.description || '',
                state: updates.state || {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            return;
        }
        
        const updated: RPGLocation = {
            ...existing,
            ...updates,
            id: existing.id, // ID cannot be changed
            updatedAt: Date.now()
        };
        
        worldState.locations.set(id, updated);
    }
    
    deleteLocation(worldState: RPGWorldState, id: string): void {
        this.assertUnlocked();
        
        if (!worldState.locations.has(id)) {
            throw new Error(`Location with ID '${id}' not found`);
        }
        
        worldState.locations.delete(id);
        
        // Clean up relationships involving this location
        this.deleteRelationshipsForEntity(worldState, id);
        
        // Clean up distances involving this location
        worldState.distances = worldState.distances.filter(
            d => d.fromLocationId !== id && d.toLocationId !== id
        );
    }
    
    listLocations(worldState: RPGWorldState): RPGLocation[] {
        return Array.from(worldState.locations.values());
    }
    
    // ========================================
    // CRUD Operations - Characters
    // ========================================
    
    createCharacter(worldState: RPGWorldState, character: RPGCharacter): void {
        this.assertUnlocked();
        
        if (worldState.characters.has(character.id)) {
            throw new Error(`Character with ID '${character.id}' already exists`);
        }
        
        worldState.characters.set(character.id, character);
    }
    
    getCharacter(worldState: RPGWorldState, id: string): RPGCharacter | undefined {
        return worldState.characters.get(id);
    }
    
    updateCharacter(worldState: RPGWorldState, id: string, updates: Partial<RPGCharacter>): void {
        this.assertUnlocked();
        
        const existing = worldState.characters.get(id);
        if (!existing) {
            // Upsert behavior: create if doesn't exist
            console.log(`⚠️ Character '${id}' not found, creating it instead`);
            this.createCharacter(worldState, {
                id,
                name: updates.name || id,
                description: updates.description || '',
                state: updates.state || {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            return;
        }
        
        const updated: RPGCharacter = {
            ...existing,
            ...updates,
            id: existing.id,
            updatedAt: Date.now()
        };
        
        worldState.characters.set(id, updated);
    }
    
    deleteCharacter(worldState: RPGWorldState, id: string): void {
        this.assertUnlocked();
        
        if (!worldState.characters.has(id)) {
            throw new Error(`Character with ID '${id}' not found`);
        }
        
        worldState.characters.delete(id);
        
        // Clean up relationships involving this character
        this.deleteRelationshipsForEntity(worldState, id);
    }
    
    listCharacters(worldState: RPGWorldState): RPGCharacter[] {
        return Array.from(worldState.characters.values());
    }
    
    // ========================================
    // CRUD Operations - Lore
    // ========================================
    
    createLore(worldState: RPGWorldState, lore: RPGLore): void {
        this.assertUnlocked();
        
        if (worldState.lore.has(lore.id)) {
            throw new Error(`Lore with ID '${lore.id}' already exists`);
        }
        
        worldState.lore.set(lore.id, lore);
    }
    
    getLore(worldState: RPGWorldState, id: string): RPGLore | undefined {
        return worldState.lore.get(id);
    }
    
    updateLore(worldState: RPGWorldState, id: string, updates: Partial<RPGLore>): void {
        this.assertUnlocked();
        
        const existing = worldState.lore.get(id);
        if (!existing) {
            // Upsert behavior: create if doesn't exist
            console.log(`⚠️ Lore '${id}' not found, creating it instead`);
            this.createLore(worldState, {
                id,
                title: updates.title || id,
                content: updates.content || '',
                tags: updates.tags || [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            return;
        }
        
        const updated: RPGLore = {
            ...existing,
            ...updates,
            id: existing.id,
            updatedAt: Date.now()
        };
        
        worldState.lore.set(id, updated);
    }
    
    deleteLore(worldState: RPGWorldState, id: string): void {
        this.assertUnlocked();
        
        if (!worldState.lore.has(id)) {
            throw new Error(`Lore with ID '${id}' not found`);
        }
        
        worldState.lore.delete(id);
        
        // Clean up relationships involving this lore
        this.deleteRelationshipsForEntity(worldState, id);
    }
    
    listLore(worldState: RPGWorldState): RPGLore[] {
        return Array.from(worldState.lore.values());
    }
    
    // ========================================
    // CRUD Operations - Relationships
    // ========================================
    
    createRelationship(worldState: RPGWorldState, relationship: RPGRelationship): void {
        this.assertUnlocked();
        
        if (worldState.relationships.has(relationship.id)) {
            throw new Error(`Relationship with ID '${relationship.id}' already exists`);
        }
        
        worldState.relationships.set(relationship.id, relationship);
    }
    
    getRelationship(worldState: RPGWorldState, id: string): RPGRelationship | undefined {
        return worldState.relationships.get(id);
    }
    
    updateRelationship(worldState: RPGWorldState, id: string, updates: Partial<RPGRelationship>): void {
        this.assertUnlocked();
        
        const existing = worldState.relationships.get(id);
        if (!existing) {
            throw new Error(`Relationship with ID '${id}' not found`);
        }
        
        const updated: RPGRelationship = {
            ...existing,
            ...updates,
            id: existing.id,
            updatedAt: Date.now()
        };
        
        worldState.relationships.set(id, updated);
    }
    
    deleteRelationship(worldState: RPGWorldState, id: string): void {
        this.assertUnlocked();
        
        if (!worldState.relationships.has(id)) {
            throw new Error(`Relationship with ID '${id}' not found`);
        }
        
        worldState.relationships.delete(id);
    }
    
    listRelationships(worldState: RPGWorldState): RPGRelationship[] {
        return Array.from(worldState.relationships.values());
    }
    
    /**
     * Delete all relationships involving a specific entity
     */
    private deleteRelationshipsForEntity(worldState: RPGWorldState, entityId: string): void {
        const toDelete: string[] = [];
        
        for (const [id, rel] of worldState.relationships) {
            if (rel.fromId === entityId || rel.toId === entityId) {
                toDelete.push(id);
            }
        }
        
        for (const id of toDelete) {
            worldState.relationships.delete(id);
        }
    }
    
    /**
     * Get all relationships for a specific entity (outgoing + incoming)
     */
    getRelationshipsForEntity(worldState: RPGWorldState, entityId: string): RPGRelationship[] {
        const result: RPGRelationship[] = [];
        
        for (const rel of worldState.relationships.values()) {
            if (rel.fromId === entityId || rel.toId === entityId) {
                result.push(rel);
            }
        }
        
        return result;
    }
    
    // ========================================
    // Distance Management
    // ========================================
    
    addDistance(worldState: RPGWorldState, distance: RPGDistance): void {
        this.assertUnlocked();
        
        // Remove any existing distance between these locations
        worldState.distances = worldState.distances.filter(
            d => !(d.fromLocationId === distance.fromLocationId && d.toLocationId === distance.toLocationId)
        );
        
        worldState.distances.push(distance);
    }
    
    getKnownDistances(worldState: RPGWorldState, fromLocationId: string): RPGDistance[] {
        return worldState.distances.filter(d => d.fromLocationId === fromLocationId);
    }
    
    getAllDistances(worldState: RPGWorldState): RPGDistance[] {
        return [...worldState.distances];
    }
    
    // ========================================
    // Relationship Graph Traversal (BFS)
    // ========================================
    
    /**
     * Get all related entities up to a certain depth using BFS
     * Returns a Set of entity IDs
     */
    getRelatedEntities(worldState: RPGWorldState, startEntityId: string, maxDepth: number = 2): Set<string> {
        const visited = new Set<string>();
        const queue: Array<{id: string, depth: number}> = [{id: startEntityId, depth: 0}];
        
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) break;
            
            // Skip if already visited or depth exceeded
            if (visited.has(current.id) || current.depth > maxDepth) {
                continue;
            }
            
            visited.add(current.id);
            
            // Only traverse further if we haven't reached max depth
            if (current.depth < maxDepth) {
                // Get all relationships for this entity
                const relationships = this.getRelationshipsForEntity(worldState, current.id);
                
                for (const rel of relationships) {
                    // Add both fromId and toId to queue (the other entity in the relationship)
                    const otherId = rel.fromId === current.id ? rel.toId : rel.fromId;
                    if (!visited.has(otherId)) {
                        queue.push({id: otherId, depth: current.depth + 1});
                    }
                }
            }
        }
        
        return visited;
    }
    
    /**
     * Get entities at current location (characters with 'located_at' relationship)
     */
    getEntitiesAtLocation(worldState: RPGWorldState, locationId: string): string[] {
        const result: string[] = [];
        
        for (const rel of worldState.relationships.values()) {
            if (rel.type === 'located_at' && rel.toId === locationId) {
                result.push(rel.fromId);
            }
        }
        
        return result;
    }
    
    // ========================================
    // Snapshot Management
    // ========================================
    
    /**
     * Create a snapshot of the current world state
     */
    async createSnapshot(session: RPGGameSession, conversationTurn: number): Promise<RPGSnapshot> {
        const snapshot: RPGSnapshot = {
            id: `snapshot_${session.id}_${Date.now()}`,
            timestamp: Date.now(),
            worldState: this.cloneWorldState(session.worldState),
            conversationTurn
        };
        
        // Save to IndexedDB
        const storage = await StorageService.getInstance();
        await storage.saveRPGSnapshot(serializeSnapshot(snapshot));
        
        console.log(`📸 Snapshot created: ${snapshot.id} (turn ${conversationTurn})`);
        
        return snapshot;
    }
    
    /**
     * Restore a snapshot (returns the restored world state)
     */
    async restoreSnapshot(snapshotId: string): Promise<RPGWorldState> {
        const storage = await StorageService.getInstance();
        const serialized = await storage.loadRPGSnapshot<RPGSnapshotSerialized>(snapshotId);
        
        if (!serialized) {
            throw new Error(`Snapshot '${snapshotId}' not found`);
        }
        
        const snapshot = deserializeSnapshot(serialized);
        console.log(`⏮️ Snapshot restored: ${snapshotId} (turn ${snapshot.conversationTurn})`);
        
        return this.cloneWorldState(snapshot.worldState);
    }
    
    /**
     * Delete a snapshot
     */
    async deleteSnapshot(snapshotId: string): Promise<void> {
        const storage = await StorageService.getInstance();
        await storage.deleteRPGSnapshot(snapshotId);
        console.log(`🗑️ Snapshot deleted: ${snapshotId}`);
    }
    
    /**
     * Cleanup old snapshots based on age threshold
     */
    async cleanupOldSnapshots(sessionId: string, maxAgeMs: number): Promise<void> {
        const storage = await StorageService.getInstance();
        const allSnapshots = await storage.listRPGSnapshots();
        
        const now = Date.now();
        const toDelete: string[] = [];
        
        for (const snapshotData of allSnapshots) {
            const snapshot = snapshotData as { id: string; timestamp: number };
            // Filter by session ID (snapshot IDs contain session ID)
            if (snapshot.id.includes(sessionId)) {
                const age = now - snapshot.timestamp;
                if (age > maxAgeMs) {
                    toDelete.push(snapshot.id);
                }
            }
        }
        
        for (const id of toDelete) {
            await this.deleteSnapshot(id);
        }
        
        if (toDelete.length > 0) {
            console.log(`🧹 Cleaned up ${toDelete.length} old snapshots for session ${sessionId}`);
        }
    }
    
    // ========================================
    // Utility Methods
    // ========================================
    
    /**
     * Deep clone a world state
     */
    private cloneWorldState(worldState: RPGWorldState): RPGWorldState {
        return {
            locations: new Map(worldState.locations),
            characters: new Map(worldState.characters),
            lore: new Map(worldState.lore),
            relationships: new Map(worldState.relationships),
            distances: [...worldState.distances],
            recentEventsSummary: worldState.recentEventsSummary,
            currentLocationId: worldState.currentLocationId,
            playerCharacterId: worldState.playerCharacterId
        };
    }
    
    /**
     * Create a new empty world state
     */
    createEmptyWorldState(): RPGWorldState {
        return {
            locations: new Map(),
            characters: new Map(),
            lore: new Map(),
            relationships: new Map(),
            distances: [],
            recentEventsSummary: '',
            currentLocationId: '',
            playerCharacterId: ''
        };
    }
    
    /**
     * Save a session to persistent storage
     */
    async saveSession(session: RPGGameSession): Promise<void> {
        const storage = await StorageService.getInstance();
        await storage.saveRPGSession(serializeSession(session));
        console.log(`💾 Session saved: ${session.id}`);
    }
    
    /**
     * Update the 'Recent Events Summary' in world state
     */
    updateRecentEvents(worldState: RPGWorldState, summary: string): void {
        this.assertUnlocked();
        worldState.recentEventsSummary = summary;
    }
    
    /**
     * Update the current location
     */
    updateCurrentLocation(worldState: RPGWorldState, locationId: string): void {
        this.assertUnlocked();
        
        if (!worldState.locations.has(locationId)) {
            throw new Error(`Location with ID '${locationId}' not found`);
        }
        
        worldState.currentLocationId = locationId;
    }
}

