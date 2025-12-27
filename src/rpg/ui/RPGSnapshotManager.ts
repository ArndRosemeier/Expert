/**
 * RPG Snapshot Manager
 * 
 * Manages snapshots (save states) for the RPG session.
 * Allows browsing and restoring previous game states.
 */

import { RPGGameSession, RPGSnapshotSerialized, deserializeSnapshot } from '../types/RPGTypes';
import { WorldStateService } from '../services/WorldStateService';
import { StorageService } from '../../StorageService';

export class RPGSnapshotManager {
    private container: HTMLElement;
    private session: RPGGameSession;
    private worldStateService: WorldStateService;
    private onRestore: () => void;
    
    private snapshotsListContainer: HTMLElement | null = null;
    
    constructor(
        container: HTMLElement,
        session: RPGGameSession,
        worldStateService: WorldStateService,
        onRestore: () => void
    ) {
        this.container = container;
        this.session = session;
        this.worldStateService = worldStateService;
        this.onRestore = onRestore;
        
        this.render();
    }
    
    /**
     * Render the snapshot manager
     */
    private render(): void {
        const html = `
            <div class="rpg-snapshot-manager">
                <div class="rpg-snapshot-header">
                    <h3>Snapshots</h3>
                    <button id="rpg-create-snapshot-btn" title="Create manual snapshot">💾</button>
                </div>
                <div id="rpg-snapshots-list" class="rpg-snapshots-list"></div>
            </div>
        `;
        
        this.container.innerHTML = html;
        
        // Get references
        this.snapshotsListContainer = this.container.querySelector('#rpg-snapshots-list');
        
        // Attach create snapshot button
        const createBtn = this.container.querySelector('#rpg-create-snapshot-btn');
        createBtn?.addEventListener('click', () => {
            void this.createManualSnapshot();
        });
        
        // Render snapshots list
        void this.renderSnapshotsList();
    }
    
    /**
     * Render the list of snapshots
     */
    private async renderSnapshotsList(): Promise<void> {
        if (!this.snapshotsListContainer) return;
        
        try {
            const storage = await StorageService.getInstance();
            const allSnapshots = await storage.listRPGSnapshots<RPGSnapshotSerialized>();
            
            // Filter snapshots for this session
            const sessionSnapshots = allSnapshots
                .filter((s: RPGSnapshotSerialized) => s.id.includes(this.session.id))
                .sort((a: RPGSnapshotSerialized, b: RPGSnapshotSerialized) => b.timestamp - a.timestamp); // Most recent first
            
            if (sessionSnapshots.length === 0) {
                this.snapshotsListContainer.innerHTML = '<p class="rpg-no-snapshots">No snapshots yet</p>';
                return;
            }
            
            let html = '';
            for (const snapshot of sessionSnapshots) {
                const date = new Date(snapshot.timestamp).toLocaleString();
                const isCurrent = snapshot.conversationTurn === Math.floor(this.session.conversationHistory.length / 2);
                
                html += '<div class="rpg-snapshot-item' + (isCurrent ? ' rpg-snapshot-current' : '') + '">';
                html += `<div class="rpg-snapshot-info">`;
                html += `<strong>Turn ${snapshot.conversationTurn}</strong>`;
                html += `<br><span class="rpg-snapshot-time">${date}</span>`;
                if (isCurrent) {
                    html += '<br><span class="rpg-snapshot-badge">Current</span>';
                }
                html += '</div>';
                if (!isCurrent) {
                    html += `<button class="rpg-restore-btn" data-snapshot-id="${snapshot.id}">Restore</button>`;
                }
                html += `<button class="rpg-delete-snapshot-btn" data-snapshot-id="${snapshot.id}">🗑️</button>`;
                html += '</div>';
            }
            
            this.snapshotsListContainer.innerHTML = html;
            
            // Attach restore buttons
            const restoreButtons = this.snapshotsListContainer.querySelectorAll('.rpg-restore-btn');
            restoreButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const snapshotId = btn.getAttribute('data-snapshot-id');
                    if (snapshotId) {
                        void this.restoreSnapshot(snapshotId);
                    }
                });
            });
            
            // Attach delete buttons
            const deleteButtons = this.snapshotsListContainer.querySelectorAll('.rpg-delete-snapshot-btn');
            deleteButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const snapshotId = btn.getAttribute('data-snapshot-id');
                    if (snapshotId) {
                        void this.deleteSnapshot(snapshotId);
                    }
                });
            });
            
        } catch (error) {
            console.error('Error rendering snapshots list:', error);
            if (this.snapshotsListContainer) {
                this.snapshotsListContainer.innerHTML = '<p class="rpg-error">Error loading snapshots</p>';
            }
        }
    }
    
    /**
     * Create a manual snapshot
     */
    private async createManualSnapshot(): Promise<void> {
        try {
            const turn = Math.floor(this.session.conversationHistory.length / 2);
            await this.worldStateService.createSnapshot(this.session, turn);
            
            // Refresh list
            await this.renderSnapshotsList();
            
            alert('Snapshot created successfully!');
        } catch (error) {
            console.error('Error creating snapshot:', error);
            alert(`Failed to create snapshot: ${error instanceof Error ? error.message : error}`);
        }
    }
    
    /**
     * Restore a snapshot
     */
    private async restoreSnapshot(snapshotId: string): Promise<void> {
        if (!confirm('Are you sure you want to restore this snapshot? Current progress after this point will be lost.')) {
            return;
        }
        
        try {
            // Load snapshot
            const storage = await StorageService.getInstance();
            const serialized = await storage.loadRPGSnapshot<RPGSnapshotSerialized>(snapshotId);
            
            if (!serialized) {
                throw new Error('Snapshot not found');
            }
            
            const snapshot = deserializeSnapshot(serialized);
            
            // Restore world state
            this.session.worldState = snapshot.worldState;
            
            // Restore conversation history (truncate to snapshot turn)
            const messagesToKeep = snapshot.conversationTurn * 2;
            this.session.conversationHistory = this.session.conversationHistory.slice(0, messagesToKeep);
            
            // Update last 2 messages
            const allMessages = [...this.session.conversationHistory];
            this.session.last2Messages = allMessages.slice(-2);
            
            // Save session
            await this.worldStateService.saveSession(this.session);
            
            // Notify parent
            this.onRestore();
            
            alert('Snapshot restored successfully!');
            
            // Refresh list
            await this.renderSnapshotsList();
            
        } catch (error) {
            console.error('Error restoring snapshot:', error);
            alert(`Failed to restore snapshot: ${error instanceof Error ? error.message : error}`);
        }
    }
    
    /**
     * Delete a snapshot
     */
    private async deleteSnapshot(snapshotId: string): Promise<void> {
        if (!confirm('Are you sure you want to delete this snapshot?')) {
            return;
        }
        
        try {
            await this.worldStateService.deleteSnapshot(snapshotId);
            
            // Remove from session snapshots list
            this.session.snapshots = this.session.snapshots.filter(id => id !== snapshotId);
            
            // Refresh list
            await this.renderSnapshotsList();
            
        } catch (error) {
            console.error('Error deleting snapshot:', error);
            alert(`Failed to delete snapshot: ${error instanceof Error ? error.message : error}`);
        }
    }
    
    /**
     * Refresh the snapshot manager
     */
    refresh(): void {
        void this.renderSnapshotsList();
    }
}

