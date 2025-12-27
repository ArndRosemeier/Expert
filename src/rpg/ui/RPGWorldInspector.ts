/**
 * RPG World Inspector
 * 
 * Tree-based viewer for the game world with Scene/World toggle.
 * - Scene View: Current location + present characters + relevant lore
 * - World View: All locations, characters, lore with relationships
 */

import { RPGGameSession } from '../types/RPGTypes';
import { WorldStateService } from '../services/WorldStateService';

export class RPGWorldInspector {
    private container: HTMLElement;
    private session: RPGGameSession;
    private worldStateService: WorldStateService;
    private currentView: 'scene' | 'world' = 'scene';
    public debugMode: boolean = false;
    
    private contentContainer: HTMLElement | null = null;
    
    constructor(
        container: HTMLElement,
        session: RPGGameSession,
        worldStateService: WorldStateService
    ) {
        this.container = container;
        this.session = session;
        this.worldStateService = worldStateService;
        
        this.render();
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
        
        // Attach debug mode listener
        const debugCheckbox = this.container.querySelector('#rpg-debug-mode') as HTMLInputElement;
        debugCheckbox?.addEventListener('change', () => {
            this.debugMode = debugCheckbox.checked;
            console.log(`🐛 Debug mode ${this.debugMode ? 'enabled' : 'disabled'}`);
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
        
        // Get current location
        const currentLocation = this.worldStateService.getLocation(worldState, worldState.currentLocationId);
        
        // Get player character
        const playerCharacter = this.worldStateService.getCharacter(worldState, worldState.playerCharacterId);
        
        // Get characters at location
        const characterIdsAtLocation = this.worldStateService.getEntitiesAtLocation(worldState, worldState.currentLocationId);
        const charactersAtLocation = characterIdsAtLocation
            .map(id => this.worldStateService.getCharacter(worldState, id))
            .filter((c): c is NonNullable<typeof c> => c !== undefined && c.id !== worldState.playerCharacterId);
        
        // Get related lore (via relationships)
        const relatedEntityIds = this.worldStateService.getRelatedEntities(worldState, worldState.currentLocationId, 1);
        const relevantLore = Array.from(relatedEntityIds)
            .map(id => this.worldStateService.getLore(worldState, id))
            .filter(l => l !== undefined);
        
        let html = '<div class="rpg-scene-view">';
        
        // Current Location
        html += '<div class="rpg-section">';
        html += '<h4>📍 Current Location</h4>';
        if (currentLocation) {
            html += `<div class="rpg-entity-item" data-entity-id="${currentLocation.id}" data-entity-type="location">`;
            html += `<strong>${currentLocation.name}</strong><br>`;
            html += `<span class="rpg-entity-desc">${currentLocation.description}</span>`;
            if (Object.keys(currentLocation.state).length > 0) {
                html += `<br><span class="rpg-entity-state">State: ${JSON.stringify(currentLocation.state)}</span>`;
            }
            html += '</div>';
        } else {
            html += '<p>Unknown location</p>';
        }
        html += '</div>';
        
        // Player Character
        html += '<div class="rpg-section">';
        html += '<h4>🧙 You</h4>';
        if (playerCharacter) {
            html += `<div class="rpg-entity-item" data-entity-id="${playerCharacter.id}" data-entity-type="character">`;
            html += `<strong>${playerCharacter.name}</strong><br>`;
            html += `<span class="rpg-entity-desc">${playerCharacter.description}</span>`;
            if (Object.keys(playerCharacter.state).length > 0) {
                html += `<br><span class="rpg-entity-state">State: ${JSON.stringify(playerCharacter.state)}</span>`;
            }
            html += '</div>';
        }
        html += '</div>';
        
        // Characters Present
        if (charactersAtLocation.length > 0) {
            html += '<div class="rpg-section">';
            html += '<h4>👥 Characters Present</h4>';
            for (const character of charactersAtLocation) {
                html += `<div class="rpg-entity-item" data-entity-id="${character.id}" data-entity-type="character">`;
                html += `<strong>${character.name}</strong><br>`;
                html += `<span class="rpg-entity-desc">${character.description}</span>`;
                if (Object.keys(character.state).length > 0) {
                    html += `<br><span class="rpg-entity-state">State: ${JSON.stringify(character.state)}</span>`;
                }
                html += '</div>';
            }
            html += '</div>';
        }
        
        // Relevant Lore
        if (relevantLore.length > 0) {
            html += '<div class="rpg-section">';
            html += '<h4>📜 Relevant Lore</h4>';
            for (const lore of relevantLore) {
                html += `<div class="rpg-entity-item" data-entity-id="${lore.id}" data-entity-type="lore">`;
                html += `<strong>${lore.title}</strong><br>`;
                html += `<span class="rpg-entity-desc">${lore.content}</span>`;
                if (lore.tags.length > 0) {
                    html += `<br><span class="rpg-entity-tags">Tags: ${lore.tags.join(', ')}</span>`;
                }
                html += '</div>';
            }
            html += '</div>';
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
        
        html += '</div>';
        
        this.contentContainer.innerHTML = html;
        
        // Attach event listeners for collapsible categories
        const categoryHeaders = this.contentContainer.querySelectorAll('.rpg-tree-category-header');
        categoryHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const category = header.getAttribute('data-category');
                const content = this.contentContainer?.querySelector(`.rpg-tree-category-content[data-category="${category}"]`);
                content?.classList.toggle('collapsed');
                header.classList.toggle('collapsed');
            });
        });
        
        // Attach event listeners for expandable entities
        const entityHeaders = this.contentContainer.querySelectorAll('.rpg-entity-header');
        entityHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const entityId = header.getAttribute('data-entity-id');
                const content = this.contentContainer?.querySelector(`.rpg-entity-details[data-entity-id="${entityId}"]`);
                content?.classList.toggle('collapsed');
                header.classList.toggle('expanded');
            });
        });
        
        // Attach event listeners for relationship links
        const relationshipLinks = this.contentContainer.querySelectorAll('.rpg-relationship-link');
        relationshipLinks.forEach(link => {
            link.addEventListener('click', () => {
                const targetId = link.getAttribute('data-target-id');
                if (targetId) {
                    this.scrollToEntity(targetId);
                }
            });
        });
    }
    
    /**
     * Render an entity with its relationships
     */
    private renderEntityWithRelationships(entityId: string, entityType: string, entityName: string): string {
        const worldState = this.session.worldState;
        const relationships = this.worldStateService.getRelationshipsForEntity(worldState, entityId);
        
        let html = '<div class="rpg-entity-tree-item">';
        
        // Entity header (clickable to expand)
        html += `<div class="rpg-entity-header" data-entity-id="${entityId}" data-entity-type="${entityType}">`;
        html += `<span class="rpg-expand-icon">▶</span> ${entityName}`;
        if (relationships.length > 0) {
            html += ` <span class="rpg-relationship-count">(${relationships.length} relationships)</span>`;
        }
        html += '</div>';
        
        // Entity details (collapsible)
        html += `<div class="rpg-entity-details collapsed" data-entity-id="${entityId}">`;
        
        // Show full entity info
        if (entityType === 'location') {
            const entity = this.worldStateService.getLocation(worldState, entityId);
            if (entity) {
                html += `<p class="rpg-entity-desc">${entity.description}</p>`;
                if (Object.keys(entity.state).length > 0) {
                    html += `<p class="rpg-entity-state">State: ${JSON.stringify(entity.state)}</p>`;
                }
            }
        } else if (entityType === 'character') {
            const entity = this.worldStateService.getCharacter(worldState, entityId);
            if (entity) {
                html += `<p class="rpg-entity-desc">${entity.description}</p>`;
                if (Object.keys(entity.state).length > 0) {
                    html += `<p class="rpg-entity-state">State: ${JSON.stringify(entity.state)}</p>`;
                }
            }
        } else if (entityType === 'lore') {
            const entity = this.worldStateService.getLore(worldState, entityId);
            if (entity) {
                html += `<p class="rpg-entity-desc">${entity.content}</p>`;
                if (entity.tags.length > 0) {
                    html += `<p class="rpg-entity-tags">Tags: ${entity.tags.join(', ')}</p>`;
                }
            }
        }
        
        // Show relationships
        if (relationships.length > 0) {
            html += '<div class="rpg-relationships">';
            html += '<strong>Relationships:</strong>';
            html += '<ul>';
            for (const rel of relationships) {
                const isOutgoing = rel.fromId === entityId;
                const otherId = isOutgoing ? rel.toId : rel.fromId;
                const otherEntity = this.getEntityName(otherId);
                
                html += '<li>';
                if (isOutgoing) {
                    html += `<span class="rpg-relationship-type">${rel.type}</span> → `;
                } else {
                    html += `← <span class="rpg-relationship-type">${rel.type}</span> `;
                }
                html += `<a class="rpg-relationship-link" data-target-id="${otherId}">${otherEntity}</a>`;
                if (rel.description) {
                    html += ` <span class="rpg-relationship-desc">(${rel.description})</span>`;
                }
                html += '</li>';
            }
            html += '</ul>';
            html += '</div>';
        }
        
        html += '</div>'; // entity-details
        html += '</div>'; // entity-tree-item
        
        return html;
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

