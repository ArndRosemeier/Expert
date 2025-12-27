/**
 * RPG Mock View - A prototype UI for the dedicated roleplaying feature
 * This is a visual mockup to demonstrate the intended user experience
 */

export class RPGMockView {
    private container: HTMLElement;
    private closeCallback: () => void;

    constructor(container: HTMLElement, closeCallback: () => void) {
        this.container = container;
        this.closeCallback = closeCallback;
        this.render();
    }

    private render(): void {
        this.container.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                height: 100%;
                background: #1a1a2e;
                color: #eee;
                font-family: 'Inter', sans-serif;
            ">
                <!-- Header -->
                <div style="
                    background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
                    padding: 1rem 1.5rem;
                    border-bottom: 2px solid #533483;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                ">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-size: 1.5rem;">🎲</span>
                        <h2 style="margin: 0; font-size: 1.25rem; font-weight: 600;">RPG Mode</h2>
                        <span style="
                            background: #533483;
                            color: white;
                            padding: 0.25rem 0.75rem;
                            border-radius: 12px;
                            font-size: 0.75rem;
                            font-weight: 500;
                        ">PROTOTYPE</span>
                    </div>
                    <button id="rpg-close" style="
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        color: white;
                        font-size: 1.2rem;
                        cursor: pointer;
                        padding: 0.5rem 0.75rem;
                        border-radius: 6px;
                        transition: background 0.2s;
                    ">✕</button>
                </div>

                <!-- Main Content Area -->
                <div style="
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                ">
                    <!-- Left Panel: World Inspector -->
                    <div style="
                        width: 360px;
                        background: #16213e;
                        border-right: 2px solid #533483;
                        display: flex;
                        flex-direction: column;
                    ">
                        <!-- Header with view toggle -->
                        <div style="
                            padding: 1rem;
                            border-bottom: 1px solid #533483;
                        ">
                            <h3 style="
                                margin: 0 0 0.75rem 0;
                                font-size: 0.9rem;
                                text-transform: uppercase;
                                letter-spacing: 1px;
                                color: #b8b8d1;
                            ">World Inspector</h3>
                            
                            <!-- View Toggle -->
                            <div style="
                                display: flex;
                                background: #0f3460;
                                border-radius: 6px;
                                overflow: hidden;
                            ">
                                <button class="view-toggle active" data-view="scene" style="
                                    flex: 1;
                                    padding: 0.5rem;
                                    border: none;
                                    background: #533483;
                                    color: white;
                                    font-size: 0.8rem;
                                    cursor: pointer;
                                    transition: background 0.2s;
                                ">🎯 Scene</button>
                                <button class="view-toggle" data-view="world" style="
                                    flex: 1;
                                    padding: 0.5rem;
                                    border: none;
                                    background: transparent;
                                    color: #b8b8d1;
                                    font-size: 0.8rem;
                                    cursor: pointer;
                                    transition: background 0.2s;
                                ">🌍 World</button>
                            </div>
                        </div>

                        <!-- Scene View -->
                        <div class="scene-view" style="
                            flex: 1;
                            overflow-y: auto;
                            padding: 1rem;
                        ">
                            <!-- Current Location -->
                            <div style="
                                background: #0f3460;
                                padding: 1rem;
                                border-radius: 8px;
                                margin-bottom: 1rem;
                                border-left: 3px solid #e94560;
                            ">
                                <div style="
                                    font-size: 0.75rem;
                                    text-transform: uppercase;
                                    color: #b8b8d1;
                                    margin-bottom: 0.5rem;
                                ">📍 Current Location</div>
                                <div style="font-weight: 600; margin-bottom: 0.5rem;">The Rusty Dragon Inn</div>
                                <div style="font-size: 0.85rem; color: #b8b8d1; line-height: 1.4;">
                                    A warm tavern filled with the smell of ale and roasted meat.
                                </div>
                            </div>

                            <!-- Characters Present -->
                            <div style="
                                background: #0f3460;
                                padding: 1rem;
                                border-radius: 8px;
                                margin-bottom: 1rem;
                            ">
                                <div style="
                                    font-size: 0.75rem;
                                    text-transform: uppercase;
                                    color: #b8b8d1;
                                    margin-bottom: 0.75rem;
                                ">👥 Characters Present</div>
                                
                                <div style="margin-bottom: 0.75rem;">
                                    <div style="font-weight: 600; margin-bottom: 0.25rem;">Ameiko Kaijitsu</div>
                                    <div style="font-size: 0.8rem; color: #b8b8d1;">Innkeeper, Friendly</div>
                                </div>
                                
                                <div>
                                    <div style="font-weight: 600; margin-bottom: 0.25rem;">Mysterious Stranger</div>
                                    <div style="font-size: 0.8rem; color: #b8b8d1;">Hooded figure, Neutral</div>
                                </div>
                            </div>

                            <!-- Recent Events -->
                            <div style="
                                background: #0f3460;
                                padding: 1rem;
                                border-radius: 8px;
                                margin-bottom: 1rem;
                            ">
                                <div style="
                                    font-size: 0.75rem;
                                    text-transform: uppercase;
                                    color: #b8b8d1;
                                    margin-bottom: 0.75rem;
                                ">📜 Recent Events</div>
                                <ul style="
                                    margin: 0;
                                    padding-left: 1.25rem;
                                    font-size: 0.85rem;
                                    color: #b8b8d1;
                                    line-height: 1.6;
                                ">
                                    <li>Arrived at the inn after dark</li>
                                    <li>Ordered ale from Ameiko</li>
                                    <li>Noticed the hooded stranger watching</li>
                                </ul>
                            </div>
                        </div>

                        <!-- World View (Tree-based) -->
                        <div class="world-view" style="
                            flex: 1;
                            overflow-y: auto;
                            padding: 1rem;
                            display: none;
                        ">
                            <!-- Search Bar -->
                            <div style="margin-bottom: 1rem;">
                                <input type="text" placeholder="🔍 Search world..." style="
                                    width: 100%;
                                    padding: 0.5rem;
                                    background: #0f3460;
                                    border: 1px solid #533483;
                                    border-radius: 6px;
                                    color: #eee;
                                    font-size: 0.85rem;
                                ">
                            </div>

                            <!-- World Tree -->
                            <div class="world-tree">
                                <!-- Locations Category -->
                                <div class="tree-category">
                                    <div class="tree-category-header" style="
                                        display: flex;
                                        align-items: center;
                                        padding: 0.5rem;
                                        cursor: pointer;
                                        font-weight: 600;
                                        color: #b8b8d1;
                                        margin-bottom: 0.5rem;
                                    ">
                                        <span style="margin-right: 0.5rem;">▼</span>
                                        <span>📍 Locations (3)</span>
                                    </div>
                                    
                                    <!-- Location: Rusty Dragon Inn (Expanded) -->
                                    <div class="tree-item" style="margin-left: 20px; margin-bottom: 0.75rem;">
                                        <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                                            <span style="margin-right: 0.5rem; color: #b8b8d1;">▼</span>
                                            <span style="color: #e94560; font-weight: 600;">⭐ The Rusty Dragon Inn</span>
                                            <button class="edit-btn" style="
                                                margin-left: auto;
                                                background: rgba(83, 52, 131, 0.5);
                                                border: none;
                                                color: #b8b8d1;
                                                padding: 0.25rem 0.5rem;
                                                border-radius: 4px;
                                                font-size: 0.7rem;
                                                cursor: pointer;
                                            ">Edit</button>
                                        </div>
                                        <div style="margin-left: 20px; font-size: 0.8rem; color: #b8b8d1; margin-bottom: 0.5rem;">
                                            A warm tavern filled with the smell of ale...
                                        </div>
                                        
                                        <!-- Relationships -->
                                        <div style="margin-left: 20px; margin-top: 0.5rem;">
                                            <div style="font-size: 0.75rem; color: #b8b8d1; margin-bottom: 0.25rem;">🔗 Connections</div>
                                            <div class="relationship-link" style="
                                                display: flex;
                                                align-items: center;
                                                padding: 0.25rem 0.5rem;
                                                margin-bottom: 0.25rem;
                                                background: rgba(15, 52, 96, 0.3);
                                                border-radius: 4px;
                                                cursor: pointer;
                                                transition: background 0.2s;
                                            ">
                                                <span style="font-size: 0.8rem;">📍 Town Square (adjacent)</span>
                                                <span style="margin-left: auto; color: #e94560;">→</span>
                                            </div>
                                            <div class="relationship-link" style="
                                                display: flex;
                                                align-items: center;
                                                padding: 0.25rem 0.5rem;
                                                margin-bottom: 0.25rem;
                                                background: rgba(15, 52, 96, 0.3);
                                                border-radius: 4px;
                                                cursor: pointer;
                                                transition: background 0.2s;
                                            ">
                                                <span style="font-size: 0.8rem;">👤 Ameiko Kaijitsu (owner)</span>
                                                <span style="margin-left: auto; color: #e94560;">→</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Location: Town Square (Collapsed) -->
                                    <div class="tree-item" style="margin-left: 20px; margin-bottom: 0.5rem;">
                                        <div style="display: flex; align-items: center;">
                                            <span style="margin-right: 0.5rem; color: #b8b8d1; cursor: pointer;">▶</span>
                                            <span style="color: #eee;">Town Square</span>
                                        </div>
                                    </div>
                                    
                                    <!-- Location: Ancient Library (Collapsed) -->
                                    <div class="tree-item" style="margin-left: 20px; margin-bottom: 0.5rem;">
                                        <div style="display: flex; align-items: center;">
                                            <span style="margin-right: 0.5rem; color: #b8b8d1; cursor: pointer;">▶</span>
                                            <span style="color: #eee;">Ancient Library</span>
                                        </div>
                                    </div>
                                    
                                    <button style="
                                        margin-left: 20px;
                                        background: rgba(83, 52, 131, 0.3);
                                        border: 1px dashed #533483;
                                        color: #b8b8d1;
                                        padding: 0.5rem;
                                        border-radius: 4px;
                                        font-size: 0.8rem;
                                        cursor: pointer;
                                        width: calc(100% - 20px);
                                    ">+ Add Location</button>
                                </div>

                                <!-- Characters Category -->
                                <div class="tree-category" style="margin-top: 1rem;">
                                    <div class="tree-category-header" style="
                                        display: flex;
                                        align-items: center;
                                        padding: 0.5rem;
                                        cursor: pointer;
                                        font-weight: 600;
                                        color: #b8b8d1;
                                        margin-bottom: 0.5rem;
                                    ">
                                        <span style="margin-right: 0.5rem;">▼</span>
                                        <span>👥 Characters (4)</span>
                                    </div>
                                    
                                    <!-- Character: Ameiko (Expanded) -->
                                    <div class="tree-item" style="margin-left: 20px; margin-bottom: 0.75rem;">
                                        <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                                            <span style="margin-right: 0.5rem; color: #b8b8d1;">▼</span>
                                            <span style="color: #eee; font-weight: 600;">Ameiko Kaijitsu</span>
                                            <button class="edit-btn" style="
                                                margin-left: auto;
                                                background: rgba(83, 52, 131, 0.5);
                                                border: none;
                                                color: #b8b8d1;
                                                padding: 0.25rem 0.5rem;
                                                border-radius: 4px;
                                                font-size: 0.7rem;
                                                cursor: pointer;
                                            ">Edit</button>
                                        </div>
                                        <div style="margin-left: 20px; font-size: 0.75rem; color: #b8b8d1; margin-bottom: 0.25rem;">
                                            @ Rusty Dragon Inn
                                        </div>
                                        <div style="margin-left: 20px; font-size: 0.75rem; color: #b8b8d1; margin-bottom: 0.5rem;">
                                            Status: Friendly
                                        </div>
                                        
                                        <!-- Relationships -->
                                        <div style="margin-left: 20px; margin-top: 0.5rem;">
                                            <div style="font-size: 0.75rem; color: #b8b8d1; margin-bottom: 0.25rem;">🔗 Relationships</div>
                                            <div class="relationship-link" style="
                                                display: flex;
                                                align-items: center;
                                                padding: 0.25rem 0.5rem;
                                                margin-bottom: 0.25rem;
                                                background: rgba(15, 52, 96, 0.3);
                                                border-radius: 4px;
                                                cursor: pointer;
                                                transition: background 0.2s;
                                            ">
                                                <span style="font-size: 0.8rem;">😊 Sheriff Hemlock</span>
                                                <span style="font-size: 0.7rem; color: #b8b8d1; margin-left: 0.5rem;">(Friend ⟷ 85)</span>
                                                <span style="margin-left: auto; color: #e94560;">→</span>
                                            </div>
                                            <div class="relationship-link" style="
                                                display: flex;
                                                align-items: center;
                                                padding: 0.25rem 0.5rem;
                                                margin-bottom: 0.25rem;
                                                background: rgba(15, 52, 96, 0.3);
                                                border-radius: 4px;
                                                cursor: pointer;
                                                transition: background 0.2s;
                                            ">
                                                <span style="font-size: 0.8rem;">😠 Tsuto Kaijitsu</span>
                                                <span style="font-size: 0.7rem; color: #b8b8d1; margin-left: 0.5rem;">(Family → 20)</span>
                                                <span style="margin-left: auto; color: #e94560;">→</span>
                                            </div>
                                            <div class="relationship-link" style="
                                                display: flex;
                                                align-items: center;
                                                padding: 0.25rem 0.5rem;
                                                margin-bottom: 0.25rem;
                                                background: rgba(15, 52, 96, 0.3);
                                                border-radius: 4px;
                                                cursor: pointer;
                                                transition: background 0.2s;
                                            ">
                                                <span style="font-size: 0.8rem;">🏠 Rusty Dragon Inn</span>
                                                <span style="font-size: 0.7rem; color: #b8b8d1; margin-left: 0.5rem;">(Owns 100)</span>
                                                <span style="margin-left: auto; color: #e94560;">→</span>
                                            </div>
                                            <button style="
                                                width: 100%;
                                                margin-top: 0.25rem;
                                                background: rgba(83, 52, 131, 0.3);
                                                border: 1px dashed #533483;
                                                color: #b8b8d1;
                                                padding: 0.4rem;
                                                border-radius: 4px;
                                                font-size: 0.75rem;
                                                cursor: pointer;
                                            ">+ Add Relationship</button>
                                        </div>
                                    </div>
                                    
                                    <!-- Other characters collapsed -->
                                    <div class="tree-item" style="margin-left: 20px; margin-bottom: 0.5rem;">
                                        <div style="display: flex; align-items: center;">
                                            <span style="margin-right: 0.5rem; color: #b8b8d1; cursor: pointer;">▶</span>
                                            <span style="color: #eee;">Sheriff Hemlock</span>
                                        </div>
                                    </div>
                                    <div class="tree-item" style="margin-left: 20px; margin-bottom: 0.5rem;">
                                        <div style="display: flex; align-items: center;">
                                            <span style="margin-right: 0.5rem; color: #b8b8d1; cursor: pointer;">▶</span>
                                            <span style="color: #eee;">Tsuto Kaijitsu</span>
                                        </div>
                                    </div>
                                    <div class="tree-item" style="margin-left: 20px; margin-bottom: 0.5rem;">
                                        <div style="display: flex; align-items: center;">
                                            <span style="margin-right: 0.5rem; color: #b8b8d1; cursor: pointer;">▶</span>
                                            <span style="color: #eee;">Mysterious Stranger</span>
                                        </div>
                                    </div>
                                    
                                    <button style="
                                        margin-left: 20px;
                                        background: rgba(83, 52, 131, 0.3);
                                        border: 1px dashed #533483;
                                        color: #b8b8d1;
                                        padding: 0.5rem;
                                        border-radius: 4px;
                                        font-size: 0.8rem;
                                        cursor: pointer;
                                        width: calc(100% - 20px);
                                    ">+ Add Character</button>
                                </div>

                                <!-- Lore Category (Collapsed) -->
                                <div class="tree-category" style="margin-top: 1rem;">
                                    <div class="tree-category-header" style="
                                        display: flex;
                                        align-items: center;
                                        padding: 0.5rem;
                                        cursor: pointer;
                                        font-weight: 600;
                                        color: #b8b8d1;
                                    ">
                                        <span style="margin-right: 0.5rem;">▶</span>
                                        <span>📜 Lore & History (15)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- State Lock Indicator (Footer) -->
                        <div style="
                            padding: 0.75rem 1rem;
                            border-top: 1px solid #533483;
                            background: rgba(83, 52, 131, 0.2);
                        ">
                            <div style="
                                font-size: 0.8rem;
                                color: #b8b8d1;
                                text-align: center;
                            ">
                                🔓 World State Unlocked<br>
                                <span style="font-size: 0.7rem;">Manual editing enabled</span>
                            </div>
                        </div>
                    </div>

                    <!-- Center Panel: Conversation -->
                    <div style="
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        background: #1a1a2e;
                    ">
                        <!-- Conversation History -->
                        <div style="
                            flex: 1;
                            overflow-y: auto;
                            padding: 1.5rem;
                        ">
                            <!-- System Message -->
                            <div style="
                                background: rgba(83, 52, 131, 0.2);
                                border-left: 3px solid #533483;
                                padding: 1rem;
                                border-radius: 8px;
                                margin-bottom: 1.5rem;
                                font-size: 0.9rem;
                                color: #b8b8d1;
                            ">
                                🎭 You are roleplaying in a fantasy world. The game master will respond to your actions.
                            </div>

                            <!-- User Message -->
                            <div style="
                                margin-bottom: 1.5rem;
                                display: flex;
                                justify-content: flex-end;
                            ">
                                <div style="
                                    background: #533483;
                                    padding: 1rem;
                                    border-radius: 12px 12px 4px 12px;
                                    max-width: 70%;
                                ">
                                    <div style="font-size: 0.75rem; color: #b8b8d1; margin-bottom: 0.5rem;">You</div>
                                    <div>I approach the bar and order an ale from Ameiko.</div>
                                </div>
                            </div>

                            <!-- Assistant Message -->
                            <div style="
                                margin-bottom: 1.5rem;
                                display: flex;
                            ">
                                <div style="
                                    background: #0f3460;
                                    padding: 1rem;
                                    border-radius: 12px 12px 12px 4px;
                                    max-width: 70%;
                                ">
                                    <div style="font-size: 0.75rem; color: #b8b8d1; margin-bottom: 0.5rem;">Game Master</div>
                                    <div style="line-height: 1.6;">
                                        Ameiko looks up from polishing a glass and gives you a warm smile. "Rough day?" she asks, 
                                        already reaching for a clean mug. She pulls the tap and fills it with amber liquid, 
                                        the foam settling nicely at the top. "That'll be 2 silver," she says, sliding it across 
                                        the bar. As you reach for your coin purse, you notice the hooded stranger in the corner 
                                        has turned slightly, as if listening to your conversation.
                                    </div>
                                    <!-- State Update Indicator -->
                                    <div style="
                                        margin-top: 0.75rem;
                                        padding: 0.5rem;
                                        background: rgba(233, 69, 96, 0.2);
                                        border-radius: 6px;
                                        font-size: 0.75rem;
                                        color: #e94560;
                                    ">
                                        ⚙️ Analyzing world state changes...
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Input Area -->
                        <div style="
                            border-top: 2px solid #533483;
                            padding: 1rem 1.5rem;
                            background: #16213e;
                        ">
                            <div style="display: flex; gap: 0.75rem; align-items: flex-end;">
                                <textarea 
                                    placeholder="Describe your action..."
                                    style="
                                        flex: 1;
                                        background: #0f3460;
                                        border: 1px solid #533483;
                                        color: #eee;
                                        padding: 0.75rem;
                                        border-radius: 8px;
                                        font-family: 'Inter', sans-serif;
                                        font-size: 0.95rem;
                                        resize: vertical;
                                        min-height: 60px;
                                    "
                                ></textarea>
                                <button style="
                                    background: linear-gradient(135deg, #e94560 0%, #c7365f 100%);
                                    border: none;
                                    color: white;
                                    padding: 0.75rem 1.5rem;
                                    border-radius: 8px;
                                    font-weight: 600;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                    box-shadow: 0 2px 8px rgba(233, 69, 96, 0.3);
                                ">
                                    Submit Action
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Right Panel: Snapshot Manager -->
                    <div style="
                        width: 280px;
                        background: #16213e;
                        border-left: 2px solid #533483;
                        overflow-y: auto;
                        padding: 1rem;
                    ">
                        <h3 style="
                            margin: 0 0 1rem 0;
                            font-size: 0.9rem;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                            color: #b8b8d1;
                        ">Save States</h3>

                        <!-- Current Session -->
                        <div style="
                            background: #0f3460;
                            padding: 1rem;
                            border-radius: 8px;
                            margin-bottom: 0.75rem;
                            border: 2px solid #e94560;
                        ">
                            <div style="
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                margin-bottom: 0.5rem;
                            ">
                                <span style="font-weight: 600; font-size: 0.9rem;">Current State</span>
                                <span style="
                                    background: #e94560;
                                    color: white;
                                    padding: 0.125rem 0.5rem;
                                    border-radius: 8px;
                                    font-size: 0.7rem;
                                ">LIVE</span>
                            </div>
                            <div style="font-size: 0.75rem; color: #b8b8d1;">Turn 3 • Just now</div>
                        </div>

                        <!-- Previous Snapshots -->
                        <div style="
                            background: rgba(15, 52, 96, 0.5);
                            padding: 0.75rem;
                            border-radius: 8px;
                            margin-bottom: 0.5rem;
                            cursor: pointer;
                            transition: background 0.2s;
                        ">
                            <div style="font-size: 0.85rem; margin-bottom: 0.25rem;">Turn 2</div>
                            <div style="font-size: 0.7rem; color: #b8b8d1;">2 minutes ago</div>
                        </div>

                        <div style="
                            background: rgba(15, 52, 96, 0.5);
                            padding: 0.75rem;
                            border-radius: 8px;
                            margin-bottom: 0.5rem;
                            cursor: pointer;
                            transition: background 0.2s;
                        ">
                            <div style="font-size: 0.85rem; margin-bottom: 0.25rem;">Turn 1</div>
                            <div style="font-size: 0.7rem; color: #b8b8d1;">5 minutes ago</div>
                        </div>

                        <div style="
                            background: rgba(15, 52, 96, 0.5);
                            padding: 0.75rem;
                            border-radius: 8px;
                            margin-bottom: 1rem;
                            cursor: pointer;
                            transition: background 0.2s;
                        ">
                            <div style="font-size: 0.85rem; margin-bottom: 0.25rem;">Session Start</div>
                            <div style="font-size: 0.7rem; color: #b8b8d1;">8 minutes ago</div>
                        </div>

                        <!-- Snapshot Settings -->
                        <div style="
                            background: rgba(83, 52, 131, 0.3);
                            border: 1px dashed #533483;
                            padding: 0.75rem;
                            border-radius: 6px;
                            font-size: 0.8rem;
                            color: #b8b8d1;
                        ">
                            <div style="margin-bottom: 0.5rem;">⚙️ Auto-save: Enabled</div>
                            <div style="font-size: 0.7rem;">Keep snapshots for 24 hours</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        const closeBtn = this.container.querySelector('#rpg-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeCallback());
        }

        // View toggle functionality
        const viewToggles = this.container.querySelectorAll('.view-toggle');
        const sceneView = this.container.querySelector('.scene-view') as HTMLElement;
        const worldView = this.container.querySelector('.world-view') as HTMLElement;
        
        viewToggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const view = (toggle as HTMLElement).dataset['view'];
                
                // Update active states
                viewToggles.forEach(t => {
                    (t as HTMLElement).style.background = 'transparent';
                    (t as HTMLElement).style.color = '#b8b8d1';
                });
                (toggle as HTMLElement).style.background = '#533483';
                (toggle as HTMLElement).style.color = 'white';
                
                // Toggle views
                if (view === 'scene') {
                    sceneView.style.display = 'block';
                    worldView.style.display = 'none';
                } else {
                    sceneView.style.display = 'none';
                    worldView.style.display = 'block';
                }
            });
        });

        // Add hover effects for relationship links
        const relationshipLinks = this.container.querySelectorAll('.relationship-link');
        relationshipLinks.forEach(link => {
            link.addEventListener('mouseenter', () => {
                (link as HTMLElement).style.background = 'rgba(233, 69, 96, 0.3)';
            });
            link.addEventListener('mouseleave', () => {
                (link as HTMLElement).style.background = 'rgba(15, 52, 96, 0.3)';
            });
            link.addEventListener('click', () => {
                // Mock: Show which entity would be navigated to
                const text = (link as HTMLElement).textContent || '';
                console.log('🎲 Navigate to:', text);
                // In real implementation, this would scroll to and expand the target entity
            });
        });

        // Add hover effects for edit buttons
        const editButtons = this.container.querySelectorAll('.edit-btn');
        editButtons.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                (btn as HTMLElement).style.background = 'rgba(83, 52, 131, 0.8)';
            });
            btn.addEventListener('mouseleave', () => {
                (btn as HTMLElement).style.background = 'rgba(83, 52, 131, 0.5)';
            });
        });

        // Close button hover
        if (closeBtn) {
            closeBtn.addEventListener('mouseenter', () => {
                (closeBtn as HTMLElement).style.background = 'rgba(255, 255, 255, 0.2)';
            });
            closeBtn.addEventListener('mouseleave', () => {
                (closeBtn as HTMLElement).style.background = 'rgba(255, 255, 255, 0.1)';
            });
        }
    }

    destroy(): void {
        // Cleanup if needed
    }
}

