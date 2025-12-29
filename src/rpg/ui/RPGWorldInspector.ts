/**
 * RPG World Inspector
 * 
 * Tree-based viewer for the game world with Scene/World toggle.
 * - Scene View: Current location + present characters + relevant lore
 * - World View: All locations, characters, lore with relationships
 */

import { RPGAttitudeIntensity, RPGAttitudeStance, RPGGameSession, RPGGoal, RPGGoalPriority, RPGGoalStatus, RPGRelationship, RPGRelationshipKind, RPGSuspiciousEntityFlag } from '../types/RPGTypes';
import { WorldStateService } from '../services/WorldStateService';
import { RPGInteractionService } from '../services/RPGInteractionService';
import { getActiveProject } from '../../state';

export class RPGWorldInspector {
    private container: HTMLElement;
    private session: RPGGameSession;
    private worldStateService: WorldStateService;
    private interactionService: RPGInteractionService;
    private currentView: 'scene' | 'world' = 'scene';
    public debugMode: boolean = false;
    public autoConsolidate: boolean = true;
    
    private contentContainer: HTMLElement | null = null;

    private getCurrentTurn(): number {
        return Math.floor(this.session.conversationHistory.length / 2);
    }

    private getAgeClass(lastUsedTurn: number): string {
        const delta = this.getCurrentTurn() - lastUsedTurn;
        if (delta <= 1) return 'rpg-age-fresh';
        if (delta <= 3) return 'rpg-age-warm';
        if (delta <= 8) return 'rpg-age-stale';
        return 'rpg-age-cold';
    }
    
    constructor(
        container: HTMLElement,
        session: RPGGameSession,
        worldStateService: WorldStateService,
        interactionService: RPGInteractionService
    ) {
        this.container = container;
        this.session = session;
        this.worldStateService = worldStateService;
        this.interactionService = interactionService;
        
        this.render();
    }

    private getSuspiciousFlag(entityId: string): RPGSuspiciousEntityFlag | undefined {
        return this.session.suspiciousEntities.find(f => f.entityId === entityId);
    }
    
    /**
     * Render the world inspector
     */
    private render(): void {
        const html = `
            <div class="rpg-world-inspector">
                <div class="rpg-world-inspector-header">
                    <h3>World Inspector</h3>
                    <div class="rpg-header-controls">
                        <label class="rpg-debug-checkbox">
                            <input type="checkbox" id="rpg-debug-mode" />
                            <span>Debug Mode</span>
                        </label>
                        <label class="rpg-debug-checkbox">
                            <input type="checkbox" id="rpg-auto-consolidate" checked />
                            <span>Auto Consolidate</span>
                        </label>
                        <div class="rpg-view-toggle">
                            <button id="rpg-scene-view-btn" class="active">Scene</button>
                            <button id="rpg-world-view-btn">World</button>
                        </div>
                    </div>
                </div>
                <div id="rpg-world-content" class="rpg-world-content"></div>
            </div>
        `;
        
        this.container.innerHTML = html;
        
        // Get references
        this.contentContainer = this.container.querySelector('#rpg-world-content');
        this.contentContainer?.addEventListener('click', (e) => {
            void this.handleContentClick(e);
        });
        
        // Attach debug mode listener
        const debugCheckbox = this.container.querySelector('#rpg-debug-mode') as HTMLInputElement;
        debugCheckbox?.addEventListener('change', () => {
            this.debugMode = debugCheckbox.checked;
            console.log(`🐛 Debug mode ${this.debugMode ? 'enabled' : 'disabled'}`);
        });

        const autoConsolidateCheckbox = this.container.querySelector('#rpg-auto-consolidate') as HTMLInputElement;
        autoConsolidateCheckbox?.addEventListener('change', () => {
            this.autoConsolidate = autoConsolidateCheckbox.checked;
            this.interactionService.setAutoConsolidateEnabled(this.autoConsolidate);
        });
        
        // Attach toggle listeners
        const sceneBtn = this.container.querySelector('#rpg-scene-view-btn');
        const worldBtn = this.container.querySelector('#rpg-world-view-btn');
        
        sceneBtn?.addEventListener('click', () => {
            this.currentView = 'scene';
            sceneBtn.classList.add('active');
            worldBtn?.classList.remove('active');
            this.renderContent();
        });
        
        worldBtn?.addEventListener('click', () => {
            this.currentView = 'world';
            worldBtn?.classList.add('active');
            sceneBtn?.classList.remove('active');
            this.renderContent();
        });
        
        // Render initial content
        this.renderContent();
    }
    
    private async handleContentClick(event: Event): Promise<void> {
        if (!this.contentContainer) return;

        const target = event.target as HTMLElement | null;
        if (!target) return;

        const header = target.closest('.rpg-tree-category-header') as HTMLElement | null;
        if (header) {
            const category = header.getAttribute('data-category');
            const content = this.contentContainer.querySelector(`.rpg-tree-category-content[data-category="${category}"]`);
            content?.classList.toggle('collapsed');
            header.classList.toggle('collapsed');
            return;
        }

        const entityHeader = target.closest('.rpg-entity-header') as HTMLElement | null;
        if (entityHeader) {
            const entityId = entityHeader.getAttribute('data-entity-id');
            const content = this.contentContainer.querySelector(`.rpg-entity-details[data-entity-id="${entityId}"]`);
            content?.classList.toggle('collapsed');
            entityHeader.classList.toggle('expanded');
            return;
        }

        const relationshipLink = target.closest('.rpg-relationship-link') as HTMLElement | null;
        if (relationshipLink) {
            const targetId = relationshipLink.getAttribute('data-target-id');
            if (targetId) {
                this.scrollToEntity(targetId);
            }
            return;
        }

        const actionEl = target.closest('[data-rpg-action]') as HTMLElement | null;
        if (!actionEl) return;

        const action = actionEl.getAttribute('data-rpg-action');
        if (!action) return;

        try {
            if (action === 'save-entity') {
                await this.saveEntity(actionEl);
                return;
            }
            if (action === 'delete-entity') {
                await this.deleteEntity(actionEl);
                return;
            }
            if (action === 'set-current-location') {
                await this.setCurrentLocation(actionEl);
                return;
            }
            if (action === 'delete-relationship') {
                await this.deleteRelationship(actionEl);
                return;
            }
            if (action === 'save-relationship') {
                await this.saveRelationship(actionEl);
                return;
            }
            if (action === 'add-relationship') {
                await this.addRelationship(actionEl);
                return;
            }
            if (action === 'consolidate-entity') {
                await this.consolidateEntity(actionEl);
                return;
            }
        } catch (err) {
            console.error('World Inspector action failed:', err);
            alert(err instanceof Error ? err.message : String(err));
        }
    }

    /**
     * Render content based on current view
     */
    private renderContent(): void {
        if (!this.contentContainer) return;
        
        if (this.currentView === 'scene') {
            this.renderSceneView();
        } else {
            this.renderWorldView();
        }
    }
    
    /**
     * Render Scene View (current location + present entities)
     */
    private renderSceneView(): void {
        if (!this.contentContainer) return;
        
        const worldState = this.session.worldState;

        const currentLocation = this.worldStateService.getLocation(worldState, worldState.currentLocationId);
        const playerCharacter = this.worldStateService.getCharacter(worldState, worldState.playerCharacterId);

        const characterIdsAtLocation = this.worldStateService.getEntitiesAtLocation(worldState, worldState.currentLocationId);
        const charactersAtLocation = characterIdsAtLocation
            .map(id => this.worldStateService.getCharacter(worldState, id))
            .filter((c): c is NonNullable<typeof c> => c !== undefined && c.id !== worldState.playerCharacterId);

        const relatedEntityIds = this.worldStateService.getRelatedEntities(worldState, worldState.currentLocationId, 1);
        const relevantLore = Array.from(relatedEntityIds)
            .map(id => this.worldStateService.getLore(worldState, id))
            .filter(l => l !== undefined);

        let html = '<div class="rpg-world-view">';

        if (currentLocation) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="scene_location">📍 Current Location</div>';
            html += '<div class="rpg-tree-category-content" data-category="scene_location">';
            html += this.renderEntityWithRelationships(currentLocation.id, 'location', currentLocation.name);
            html += '</div></div>';
        }

        if (playerCharacter) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="scene_player">🧙 You</div>';
            html += '<div class="rpg-tree-category-content" data-category="scene_player">';
            html += this.renderEntityWithRelationships(playerCharacter.id, 'character', playerCharacter.name);
            html += '</div></div>';
        }

        if (charactersAtLocation.length > 0) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="scene_characters">👥 Characters Present (' + charactersAtLocation.length + ')</div>';
            html += '<div class="rpg-tree-category-content" data-category="scene_characters">';
            for (const ch of charactersAtLocation) {
                html += this.renderEntityWithRelationships(ch.id, 'character', ch.name);
            }
            html += '</div></div>';
        }

        if (relevantLore.length > 0) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="scene_lore">📜 Relevant Lore (' + relevantLore.length + ')</div>';
            html += '<div class="rpg-tree-category-content" data-category="scene_lore">';
            for (const loreItem of relevantLore) {
                html += this.renderEntityWithRelationships(loreItem.id, 'lore', loreItem.title);
            }
            html += '</div></div>';
        }

        html += '</div>';
        this.contentContainer.innerHTML = html;
    }
    
    /**
     * Render World View (all entities with relationships)
     */
    private renderWorldView(): void {
        if (!this.contentContainer) return;
        
        const worldState = this.session.worldState;
        
        let html = '<div class="rpg-world-view">';
        
        // Locations
        const locations = this.worldStateService.listLocations(worldState);
        if (locations.length > 0) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="locations">📍 Locations (' + locations.length + ')</div>';
            html += '<div class="rpg-tree-category-content" data-category="locations">';
            for (const location of locations) {
                html += this.renderEntityWithRelationships(location.id, 'location', location.name);
            }
            html += '</div>';
            html += '</div>';
        }
        
        // Characters
        const characters = this.worldStateService.listCharacters(worldState);
        if (characters.length > 0) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="characters">👥 Characters (' + characters.length + ')</div>';
            html += '<div class="rpg-tree-category-content" data-category="characters">';
            for (const character of characters) {
                html += this.renderEntityWithRelationships(character.id, 'character', character.name);
            }
            html += '</div>';
            html += '</div>';
        }
        
        // Lore
        const lore = this.worldStateService.listLore(worldState);
        if (lore.length > 0) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="lore">📜 Lore (' + lore.length + ')</div>';
            html += '<div class="rpg-tree-category-content" data-category="lore">';
            for (const loreItem of lore) {
                html += this.renderEntityWithRelationships(loreItem.id, 'lore', loreItem.title);
            }
            html += '</div>';
            html += '</div>';
        }

        // Relationships (global list, because they count as world items)
        const relationships = this.worldStateService.listRelationships(worldState);
        if (relationships.length > 0) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="relationships">🔗 Relationships (' + relationships.length + ')</div>';
            html += '<div class="rpg-tree-category-content" data-category="relationships">';
            html += this.renderGlobalRelationships(relationships);
            html += '</div>';
            html += '</div>';
        }

        // Distances
        const distances = this.worldStateService.getAllDistances(worldState);
        if (distances.length > 0) {
            html += '<div class="rpg-tree-category">';
            html += '<div class="rpg-tree-category-header" data-category="distances">🧭 Distances (' + distances.length + ')</div>';
            html += '<div class="rpg-tree-category-content" data-category="distances">';
            for (const d of distances) {
                const fromName = this.worldStateService.getLocation(worldState, d.fromLocationId)?.name || d.fromLocationId;
                const toName = this.worldStateService.getLocation(worldState, d.toLocationId)?.name || d.toLocationId;
                const ageClass = this.getAgeClass(d.lastUsedTurn);
                html += '<div class="rpg-entity-tree-item">';
                html += `<div class="rpg-entity-header expanded ${ageClass}">`;
                html += `<span class="rpg-expand-icon">•</span> ${this.escapeHtml(fromName)} → ${this.escapeHtml(toName)} (${this.escapeHtml(String(d.distance))} ${this.escapeHtml(d.unit)})`;
                html += '</div>';
                html += `<div class="rpg-entity-details">`;
                html += `<small class="rpg-muted">Created turn: ${d.createdTurn}</small>`;
                html += `<br><small class="rpg-muted">Last used turn: ${d.lastUsedTurn}</small>`;
                html += '</div>';
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
        }
        
        html += '</div>';
        
        this.contentContainer.innerHTML = html;
    }

    private renderGlobalRelationships(relationships: RPGRelationship[]): string {
        let html = '<div class="rpg-relationships">';
        html += '<ul>';

        for (const rel of relationships) {
            const fromName = this.getEntityName(rel.fromId);
            const toName = this.getEntityName(rel.toId);
            const ageClass = this.getAgeClass(rel.lastUsedTurn);

            html += `<li class="rpg-entity-tree-item rpg-relationship-editor" data-rel-id="${rel.id}">`;

            // Collapsible header (same behavior as other world items)
            html += `<div class="rpg-entity-header ${ageClass}" data-entity-id="${rel.id}" data-entity-type="relationship">`;
            html += `<span class="rpg-expand-icon">▶</span> `;
            html += `${this.escapeHtml(fromName)} <span class="rpg-relationship-type">${rel.kind}</span> ${this.escapeHtml(toName)}`;
            html += ` <small class="rpg-muted">(last used turn: ${rel.lastUsedTurn})</small>`;
            html += `</div>`;

            html += `<div class="rpg-entity-details collapsed" data-entity-id="${rel.id}">`;

            html += `<div class="rpg-relationship-fields">`;
            html += `<small class="rpg-muted">Created turn: ${rel.createdTurn}</small>`;
            html += `<br><small class="rpg-muted">Last used turn: ${rel.lastUsedTurn}</small>`;
            html += `<br><small class="rpg-muted">From: <a class="rpg-relationship-link" data-target-id="${rel.fromId}">${this.escapeHtml(fromName)}</a></small>`;
            html += `<br><small class="rpg-muted">To: <a class="rpg-relationship-link" data-target-id="${rel.toId}">${this.escapeHtml(toName)}</a></small>`;
            html += `<label>Note</label><input class="rpg-edit-input" data-rel-field="note" value="${this.escapeHtml(rel.note || '')}" />`;

            if (rel.kind === 'attitude_towards') {
                html += `<label>Stance</label>${this.renderStanceSelect(rel.stance)}`;
                html += `<label>Intensity</label>${this.renderIntensitySelect(rel.intensity)}`;
                html += `<label>Reason</label><input class="rpg-edit-input" data-rel-field="reason" value="${this.escapeHtml(rel.reason || '')}" />`;
            }
            html += `</div>`;

            html += `
                <div class="rpg-relationship-actions">
                    <button type="button" data-rpg-action="save-relationship" data-rel-id="${rel.id}">Save</button>
                    <button type="button" data-rpg-action="delete-relationship" data-rel-id="${rel.id}">Delete</button>
                </div>
            `;

            html += `</div>`; // entity-details
            html += '</li>';
        }

        html += '</ul>';
        html += '</div>';
        return html;
    }
    
    /**
     * Render an entity with its relationships
     */
    private renderEntityWithRelationships(entityId: string, entityType: string, entityName: string): string {
        const worldState = this.session.worldState;
        const relationships = this.worldStateService.getRelationshipsForEntity(worldState, entityId);

        let lastUsedTurn: number;
        if (entityType === 'location') {
            const entity = this.worldStateService.getLocation(worldState, entityId);
            if (!entity) throw new Error(`Location not found: ${entityId}`);
            lastUsedTurn = entity.lastUsedTurn;
        } else if (entityType === 'character') {
            const entity = this.worldStateService.getCharacter(worldState, entityId);
            if (!entity) throw new Error(`Character not found: ${entityId}`);
            lastUsedTurn = entity.lastUsedTurn;
        } else if (entityType === 'lore') {
            const entity = this.worldStateService.getLore(worldState, entityId);
            if (!entity) throw new Error(`Lore not found: ${entityId}`);
            lastUsedTurn = entity.lastUsedTurn;
        } else {
            throw new Error(`Unknown entity type: ${entityType}`);
        }

        const ageClass = this.getAgeClass(lastUsedTurn);
        const flag = this.getSuspiciousFlag(entityId);
        
        let html = '<div class="rpg-entity-tree-item">';
        
        // Entity header (clickable to expand)
        html += `<div class="rpg-entity-header ${ageClass}" data-entity-id="${entityId}" data-entity-type="${entityType}">`;
        html += `<span class="rpg-expand-icon">▶</span> ${entityName}`;
        if (relationships.length > 0) {
            html += ` <span class="rpg-relationship-count">(${relationships.length} relationships)</span>`;
        }
        if (flag) {
            html += ` <span class="rpg-suspicious-flag" title="${this.escapeHtml(flag.reason)}">⚠</span>`;
        }
        html += ` <small class="rpg-muted">(last used turn: ${lastUsedTurn})</small>`;
        html += '</div>';
        
        // Entity details (collapsible)
        html += `<div class="rpg-entity-details collapsed" data-entity-id="${entityId}">`;
        
        // Editable entity info
        if (entityType === 'location') {
            const entity = this.worldStateService.getLocation(worldState, entityId);
            if (entity) {
                html += this.renderLocationEditor(entityId);
            }
        } else if (entityType === 'character') {
            const entity = this.worldStateService.getCharacter(worldState, entityId);
            if (entity) {
                html += this.renderCharacterEditor(entityId);
            }
        } else if (entityType === 'lore') {
            const entity = this.worldStateService.getLore(worldState, entityId);
            if (entity) {
                html += this.renderLoreEditor(entityId);
            }
        }
        
        html += this.renderRelationshipsEditor(entityId, relationships);
        html += this.renderAddRelationshipEditor(entityId);
        
        html += '</div>'; // entity-details
        html += '</div>'; // entity-tree-item
        
        return html;
    }

    private renderLocationEditor(locationId: string): string {
        const worldState = this.session.worldState;
        const location = this.worldStateService.getLocation(worldState, locationId);
        if (!location) return '';

        const isCurrent = worldState.currentLocationId === locationId;

        return `
            <div class="rpg-entity-editor" data-entity-id="${locationId}" data-entity-type="location">
                <div class="rpg-entity-editor-row">
                    <label>Created turn</label>
                    <input class="rpg-edit-input" value="${location.createdTurn}" disabled />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Last used turn</label>
                    <input class="rpg-edit-input" value="${location.lastUsedTurn}" disabled />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Name</label>
                    <input class="rpg-edit-input" data-field="name" value="${this.escapeHtml(location.name)}" />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Description</label>
                    <textarea class="rpg-edit-textarea" data-field="description" rows="6">${this.escapeHtml(location.description)}</textarea>
                </div>
                <div class="rpg-entity-editor-row">
                    <label>State (JSON)</label>
                    <textarea class="rpg-edit-textarea" data-field="state" rows="6">${this.escapeHtml(JSON.stringify(location.state, null, 2))}</textarea>
                </div>
                <div class="rpg-entity-editor-row">
                    <label>SceneState (JSON)</label>
                    <textarea class="rpg-edit-textarea" data-field="sceneState" rows="6">${this.escapeHtml(JSON.stringify(location.sceneState, null, 2))}</textarea>
                </div>
                <div class="rpg-entity-editor-actions">
                    <button type="button" data-rpg-action="save-entity" data-entity-id="${locationId}" data-entity-type="location">Save</button>
                    <button type="button" data-rpg-action="consolidate-entity" data-entity-id="${locationId}" data-entity-type="location">Consolidate</button>
                    ${isCurrent ? '' : `<button type="button" data-rpg-action="set-current-location" data-entity-id="${locationId}">Set as current</button>`}
                    <button type="button" data-rpg-action="delete-entity" data-entity-id="${locationId}" data-entity-type="location">Delete</button>
                </div>
            </div>
        `.trim();
    }

    private renderCharacterEditor(characterId: string): string {
        const worldState = this.session.worldState;
        const character = this.worldStateService.getCharacter(worldState, characterId);
        if (!character) return '';

        const isPlayer = worldState.playerCharacterId === characterId;

        return `
            <div class="rpg-entity-editor" data-entity-id="${characterId}" data-entity-type="character">
                <div class="rpg-entity-editor-row">
                    <label>Created turn</label>
                    <input class="rpg-edit-input" value="${character.createdTurn}" disabled />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Last used turn</label>
                    <input class="rpg-edit-input" value="${character.lastUsedTurn}" disabled />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Name</label>
                    <input class="rpg-edit-input" data-field="name" value="${this.escapeHtml(character.name)}" />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Description</label>
                    <textarea class="rpg-edit-textarea" data-field="description" rows="8">${this.escapeHtml(character.description)}</textarea>
                </div>
                <div class="rpg-entity-editor-row">
                    <label>State (JSON)</label>
                    <textarea class="rpg-edit-textarea" data-field="state" rows="6">${this.escapeHtml(JSON.stringify(character.state, null, 2))}</textarea>
                </div>
                <div class="rpg-entity-editor-row">
                    <label>SceneState (JSON)</label>
                    <textarea class="rpg-edit-textarea" data-field="sceneState" rows="6">${this.escapeHtml(JSON.stringify(character.sceneState, null, 2))}</textarea>
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Goals (JSON)</label>
                    <textarea class="rpg-edit-textarea" data-field="goals" rows="6">${this.escapeHtml(JSON.stringify(character.goals, null, 2))}</textarea>
                </div>
                <div class="rpg-entity-editor-actions">
                    <button type="button" data-rpg-action="save-entity" data-entity-id="${characterId}" data-entity-type="character">Save</button>
                    <button type="button" data-rpg-action="consolidate-entity" data-entity-id="${characterId}" data-entity-type="character">Consolidate</button>
                    ${isPlayer ? '' : `<button type="button" data-rpg-action="delete-entity" data-entity-id="${characterId}" data-entity-type="character">Delete</button>`}
                </div>
            </div>
        `.trim();
    }

    private renderLoreEditor(loreId: string): string {
        const worldState = this.session.worldState;
        const lore = this.worldStateService.getLore(worldState, loreId);
        if (!lore) return '';

        return `
            <div class="rpg-entity-editor" data-entity-id="${loreId}" data-entity-type="lore">
                <div class="rpg-entity-editor-row">
                    <label>Created turn</label>
                    <input class="rpg-edit-input" value="${lore.createdTurn}" disabled />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Last used turn</label>
                    <input class="rpg-edit-input" value="${lore.lastUsedTurn}" disabled />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Title</label>
                    <input class="rpg-edit-input" data-field="title" value="${this.escapeHtml(lore.title)}" />
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Content</label>
                    <textarea class="rpg-edit-textarea" data-field="content" rows="8">${this.escapeHtml(lore.content)}</textarea>
                </div>
                <div class="rpg-entity-editor-row">
                    <label>Tags (comma-separated)</label>
                    <input class="rpg-edit-input" data-field="tags" value="${this.escapeHtml(lore.tags.join(', '))}" />
                </div>
                <div class="rpg-entity-editor-actions">
                    <button type="button" data-rpg-action="save-entity" data-entity-id="${loreId}" data-entity-type="lore">Save</button>
                    <button type="button" data-rpg-action="delete-entity" data-entity-id="${loreId}" data-entity-type="lore">Delete</button>
                </div>
            </div>
        `.trim();
    }

    private renderRelationshipsEditor(entityId: string, relationships: RPGRelationship[]): string {
        if (relationships.length === 0) {
            return `<div class="rpg-relationships"><strong>Relationships:</strong> <span class="rpg-muted">[none]</span></div>`;
        }

        let html = '<div class="rpg-relationships">';
        html += '<strong>Relationships:</strong>';
        html += '<ul>';

        for (const rel of relationships) {
            const isOutgoing = rel.fromId === entityId;
            const otherId = isOutgoing ? rel.toId : rel.fromId;
            const otherEntity = this.getEntityName(otherId);

            html += `<li class="rpg-relationship-editor" data-rel-id="${rel.id}">`;
            html += isOutgoing
                ? `<span class="rpg-relationship-type">${rel.kind}</span> → `
                : `← <span class="rpg-relationship-type">${rel.kind}</span> `;
            html += `<a class="rpg-relationship-link" data-target-id="${otherId}">${otherEntity}</a>`;

            html += `<div class="rpg-relationship-fields">`;
            html += `<small class="rpg-muted">Created turn: ${rel.createdTurn}</small>`;
            html += `<label>Note</label><input class="rpg-edit-input" data-rel-field="note" value="${this.escapeHtml(rel.note || '')}" />`;

            if (rel.kind === 'attitude_towards') {
                html += `<label>Stance</label>${this.renderStanceSelect(rel.stance)}`;
                html += `<label>Intensity</label>${this.renderIntensitySelect(rel.intensity)}`;
                html += `<label>Reason</label><input class="rpg-edit-input" data-rel-field="reason" value="${this.escapeHtml(rel.reason || '')}" />`;
            }
            html += `</div>`;

            html += `
                <div class="rpg-relationship-actions">
                    <button type="button" data-rpg-action="save-relationship" data-rel-id="${rel.id}">Save</button>
                    <button type="button" data-rpg-action="delete-relationship" data-rel-id="${rel.id}">Delete</button>
                </div>
            `;
            html += '</li>';
        }

        html += '</ul>';
        html += '</div>';
        return html;
    }

    private renderAddRelationshipEditor(fromId: string): string {
        const worldState = this.session.worldState;

        const entityOptions: Array<{ id: string; label: string }> = [];
        for (const loc of this.worldStateService.listLocations(worldState)) entityOptions.push({ id: loc.id, label: `📍 ${loc.name}` });
        for (const ch of this.worldStateService.listCharacters(worldState)) entityOptions.push({ id: ch.id, label: `👤 ${ch.name}` });
        for (const lore of this.worldStateService.listLore(worldState)) entityOptions.push({ id: lore.id, label: `📜 ${lore.title}` });

        const kinds: RPGRelationshipKind[] = [
            'located_at',
            'describes',
            'found_at',
            'knows_name_of',
            'knows_about',
            'knows_fact',
            'attitude_towards'
        ];

        return `
            <div class="rpg-add-relationship" data-from-id="${fromId}">
                <strong>Add relationship</strong>
                <div class="rpg-add-relationship-grid">
                    <label>Kind</label>
                    <select class="rpg-edit-select" data-add-field="kind">
                        ${kinds.map(k => `<option value="${k}">${k}</option>`).join('')}
                    </select>
                    <label>To</label>
                    <select class="rpg-edit-select" data-add-field="toId">
                        ${entityOptions.map(o => `<option value="${o.id}">${this.escapeHtml(o.label)}</option>`).join('')}
                    </select>
                    <label>Note</label>
                    <input class="rpg-edit-input" data-add-field="note" value="" />
                    <label>Stance (attitude)</label>
                    ${this.renderStanceSelect('neutral', true)}
                    <label>Intensity (attitude)</label>
                    ${this.renderIntensitySelect(0, true)}
                    <label>Reason (attitude)</label>
                    <input class="rpg-edit-input" data-add-field="reason" value="" />
                </div>
                <div class="rpg-entity-editor-actions">
                    <button type="button" data-rpg-action="add-relationship" data-from-id="${fromId}">Add</button>
                </div>
            </div>
        `.trim();
    }

    private renderStanceSelect(selected: RPGAttitudeStance, isAddForm: boolean = false): string {
        const stances: RPGAttitudeStance[] = ['friendly', 'neutral', 'hostile', 'fearful', 'respectful', 'suspicious', 'romantic', 'disgusted'];
        return `
            <select class="rpg-edit-select" ${isAddForm ? 'data-add-field="stance"' : 'data-rel-field="stance"'}>
                ${stances.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
        `.trim();
    }

    private renderIntensitySelect(selected: RPGAttitudeIntensity, isAddForm: boolean = false): string {
        const values: RPGAttitudeIntensity[] = [-3, -2, -1, 0, 1, 2, 3];
        return `
            <select class="rpg-edit-select" ${isAddForm ? 'data-add-field="intensity"' : 'data-rel-field="intensity"'}>
                ${values.map(v => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
        `.trim();
    }

    private async saveEntity(actionEl: HTMLElement): Promise<void> {
        const entityId = actionEl.getAttribute('data-entity-id');
        const entityType = actionEl.getAttribute('data-entity-type');
        if (!entityId || !entityType) throw new Error('Save entity: missing entity id/type');

        const editor = this.contentContainer?.querySelector(`.rpg-entity-editor[data-entity-id="${entityId}"]`) as HTMLElement | null;
        if (!editor) throw new Error(`Save entity: editor not found for ${entityId}`);

        const worldState = this.session.worldState;

        if (entityType === 'location') {
            const name = (editor.querySelector('[data-field="name"]') as HTMLInputElement).value.trim();
            const description = (editor.querySelector('[data-field="description"]') as HTMLTextAreaElement).value;
            const stateText = (editor.querySelector('[data-field="state"]') as HTMLTextAreaElement).value;
            const state = JSON.parse(stateText) as Record<string, unknown>;

            const sceneStateText = (editor.querySelector('[data-field="sceneState"]') as HTMLTextAreaElement).value;
            const sceneState = JSON.parse(sceneStateText) as Record<string, unknown>;

            this.worldStateService.updateLocation(worldState, entityId, { name, description, state, sceneState });
        } else if (entityType === 'character') {
            const name = (editor.querySelector('[data-field="name"]') as HTMLInputElement).value.trim();
            const description = (editor.querySelector('[data-field="description"]') as HTMLTextAreaElement).value;
            const stateText = (editor.querySelector('[data-field="state"]') as HTMLTextAreaElement).value;
            const state = JSON.parse(stateText) as Record<string, unknown>;

            const sceneStateText = (editor.querySelector('[data-field="sceneState"]') as HTMLTextAreaElement).value;
            const sceneState = JSON.parse(sceneStateText) as Record<string, unknown>;

            const goalsText = (editor.querySelector('[data-field="goals"]') as HTMLTextAreaElement).value;
            const parsedGoals = JSON.parse(goalsText) as unknown;
            if (!Array.isArray(parsedGoals)) {
                throw new Error('Goals must be a JSON array.');
            }

            const goals: RPGGoal[] = parsedGoals.map((g: unknown) => {
                if (!g || typeof g !== 'object') throw new Error('Goal must be an object.');
                const anyG = g as Record<string, unknown>;
                const id = anyG['id'];
                const text = anyG['text'];
                const status = anyG['status'];
                const priority = anyG['priority'];
                const createdTurn = anyG['createdTurn'];
                const updatedTurn = anyG['updatedTurn'];

                if (typeof id !== 'string') throw new Error('Goal.id must be a string.');
                if (typeof text !== 'string') throw new Error('Goal.text must be a string.');
                if (status !== 'active' && status !== 'completed' && status !== 'abandoned') throw new Error(`Invalid goal.status for '${id}'.`);
                if (priority !== 1 && priority !== 2 && priority !== 3 && priority !== 4 && priority !== 5) throw new Error(`Invalid goal.priority for '${id}'.`);
                if (typeof createdTurn !== 'number') throw new Error(`Goal.createdTurn must be a number for '${id}'.`);
                if (typeof updatedTurn !== 'number') throw new Error(`Goal.updatedTurn must be a number for '${id}'.`);

                return {
                    id,
                    text,
                    status: status as RPGGoalStatus,
                    priority: priority as RPGGoalPriority,
                    createdTurn,
                    updatedTurn
                };
            });

            this.worldStateService.updateCharacter(worldState, entityId, { name, description, state, sceneState, goals });
        } else if (entityType === 'lore') {
            const title = (editor.querySelector('[data-field="title"]') as HTMLInputElement).value.trim();
            const content = (editor.querySelector('[data-field="content"]') as HTMLTextAreaElement).value;
            const tagsText = (editor.querySelector('[data-field="tags"]') as HTMLInputElement).value;
            const tags = tagsText.split(',').map(t => t.trim()).filter(t => t.length > 0);

            this.worldStateService.updateLore(worldState, entityId, { title, content, tags });
        } else {
            throw new Error(`Save entity: unsupported type '${entityType}'`);
        }

        await this.worldStateService.saveSession(this.session);
        this.refresh();
    }

    private async deleteEntity(actionEl: HTMLElement): Promise<void> {
        const entityId = actionEl.getAttribute('data-entity-id');
        const entityType = actionEl.getAttribute('data-entity-type');
        if (!entityId || !entityType) throw new Error('Delete entity: missing entity id/type');

        if (!confirm(`Delete ${entityType} '${entityId}'? This will also delete its relationships.`)) {
            return;
        }

        const worldState = this.session.worldState;

        if (entityType === 'location') {
            if (worldState.currentLocationId === entityId) {
                throw new Error('Cannot delete the current location. Move to another location first.');
            }
            this.worldStateService.deleteLocation(worldState, entityId);
        } else if (entityType === 'character') {
            if (worldState.playerCharacterId === entityId) {
                throw new Error('Cannot delete the player character.');
            }
            this.worldStateService.deleteCharacter(worldState, entityId);
        } else if (entityType === 'lore') {
            this.worldStateService.deleteLore(worldState, entityId);
        } else {
            throw new Error(`Delete entity: unsupported type '${entityType}'`);
        }

        await this.worldStateService.saveSession(this.session);
        this.refresh();
    }

    private async setCurrentLocation(actionEl: HTMLElement): Promise<void> {
        const locationId = actionEl.getAttribute('data-entity-id');
        if (!locationId) throw new Error('Set current location: missing entity id');

        this.worldStateService.updateCurrentLocation(this.session.worldState, locationId);
        await this.worldStateService.saveSession(this.session);
        this.refresh();
    }

    private async deleteRelationship(actionEl: HTMLElement): Promise<void> {
        const relId = actionEl.getAttribute('data-rel-id');
        if (!relId) throw new Error('Delete relationship: missing rel id');

        if (!confirm('Delete this relationship?')) return;

        this.worldStateService.deleteRelationship(this.session.worldState, relId);
        await this.worldStateService.saveSession(this.session);
        this.refresh();
    }

    private async saveRelationship(actionEl: HTMLElement): Promise<void> {
        const relId = actionEl.getAttribute('data-rel-id');
        if (!relId) throw new Error('Save relationship: missing rel id');

        const worldState = this.session.worldState;
        const rel = this.worldStateService.getRelationship(worldState, relId);
        if (!rel) throw new Error(`Relationship not found: ${relId}`);

        const wrapper = this.contentContainer?.querySelector(`.rpg-relationship-editor[data-rel-id="${relId}"]`) as HTMLElement | null;
        if (!wrapper) throw new Error(`Relationship editor not found: ${relId}`);

        const note = (wrapper.querySelector('[data-rel-field="note"]') as HTMLInputElement | null)?.value;

        if (rel.kind === 'attitude_towards') {
            const stance = (wrapper.querySelector('[data-rel-field="stance"]') as HTMLSelectElement).value as RPGAttitudeStance;
            const intensityVal = Number((wrapper.querySelector('[data-rel-field="intensity"]') as HTMLSelectElement).value);
            const reason = (wrapper.querySelector('[data-rel-field="reason"]') as HTMLInputElement | null)?.value;

            if (intensityVal !== -3 && intensityVal !== -2 && intensityVal !== -1 && intensityVal !== 0 && intensityVal !== 1 && intensityVal !== 2 && intensityVal !== 3) {
                throw new Error(`Invalid intensity: ${intensityVal}`);
            }

            this.worldStateService.updateRelationship(worldState, relId, {
                ...(note !== undefined && { note }),
                stance,
                intensity: intensityVal,
                ...(reason !== undefined && { reason })
            });
        } else {
            this.worldStateService.updateRelationship(worldState, relId, {
                ...(note !== undefined && { note })
            });
        }

        await this.worldStateService.saveSession(this.session);
        this.refresh();
    }

    private async addRelationship(actionEl: HTMLElement): Promise<void> {
        const fromId = actionEl.getAttribute('data-from-id');
        if (!fromId) throw new Error('Add relationship: missing from id');

        const wrapper = this.contentContainer?.querySelector(`.rpg-add-relationship[data-from-id="${fromId}"]`) as HTMLElement | null;
        if (!wrapper) throw new Error('Add relationship UI not found');

        const kind = (wrapper.querySelector('[data-add-field="kind"]') as HTMLSelectElement).value as RPGRelationshipKind;
        const toId = (wrapper.querySelector('[data-add-field="toId"]') as HTMLSelectElement).value;
        const note = (wrapper.querySelector('[data-add-field="note"]') as HTMLInputElement).value;

        const base = {
            id: `rel_${fromId}_${toId}_${kind}_${Date.now()}`,
            fromId,
            toId,
            kind,
            createdTurn: this.getCurrentTurn(),
            lastUsedTurn: this.getCurrentTurn(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        let rel: RPGRelationship;
        if (kind === 'attitude_towards') {
            const stance = (wrapper.querySelector('[data-add-field="stance"]') as HTMLSelectElement).value as RPGAttitudeStance;
            const intensityVal = Number((wrapper.querySelector('[data-add-field="intensity"]') as HTMLSelectElement).value);
            const reason = (wrapper.querySelector('[data-add-field="reason"]') as HTMLInputElement).value;

            if (intensityVal !== -3 && intensityVal !== -2 && intensityVal !== -1 && intensityVal !== 0 && intensityVal !== 1 && intensityVal !== 2 && intensityVal !== 3) {
                throw new Error(`Invalid intensity: ${intensityVal}`);
            }

            rel = {
                ...base,
                kind: 'attitude_towards',
                stance,
                intensity: intensityVal,
                ...(reason.trim().length > 0 && { reason: reason.trim() }),
                ...(note.trim().length > 0 && { note: note.trim() })
            };
        } else {
            rel = {
                ...base,
                kind,
                ...(note.trim().length > 0 && { note: note.trim() })
            };
        }

        this.worldStateService.createRelationship(this.session.worldState, rel);
        await this.worldStateService.saveSession(this.session);
        this.refresh();
    }

    private async consolidateEntity(actionEl: HTMLElement): Promise<void> {
        const entityId = actionEl.getAttribute('data-entity-id');
        const entityType = actionEl.getAttribute('data-entity-type');
        if (!entityId || !entityType) throw new Error('Consolidate entity: missing entity id/type');

        if (entityType !== 'character' && entityType !== 'location') {
            throw new Error(`Consolidation is only supported for characters and locations (got: ${entityType}).`);
        }

        if (!confirm(`Consolidate ${entityType} "${this.getEntityName(entityId)}"?\n\nThis will rewrite the entity's STATE (JSON) to remove contradictions and stale details.`)) {
            return;
        }

        if (!getActiveProject()) {
            throw new Error('No active project.');
        }

        // This is an explicit LLM call; we keep it loud and visible in logs.
        await this.interactionService.consolidateEntity(this.session, entityType, entityId);
        this.refresh();
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    /**
     * Get entity name by ID
     */
    private getEntityName(entityId: string): string {
        const worldState = this.session.worldState;
        
        const location = this.worldStateService.getLocation(worldState, entityId);
        if (location) return location.name;
        
        const character = this.worldStateService.getCharacter(worldState, entityId);
        if (character) return character.name;
        
        const lore = this.worldStateService.getLore(worldState, entityId);
        if (lore) return lore.title;
        
        return entityId;
    }
    
    /**
     * Scroll to an entity in the view
     */
    private scrollToEntity(entityId: string): void {
        const entityElement = this.contentContainer?.querySelector(`[data-entity-id="${entityId}"]`);
        if (entityElement) {
            entityElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            entityElement.classList.add('rpg-highlight');
            setTimeout(() => {
                entityElement.classList.remove('rpg-highlight');
            }, 2000);
        }
    }
    
    /**
     * Refresh the inspector
     */
    refresh(): void {
        this.renderContent();
    }
}

