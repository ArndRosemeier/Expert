import { ProjectManager } from '../ProjectManager';
import { DocumentNode } from '../DocumentNode';
import { getElementById } from './dom-elements';
import * as state from '../state';
import { LoopProgress, RaterProgressPayload } from '../LoopOrchestrator';
import { openReaderView } from './reader-gui';

let projectManager: ProjectManager | null = null;
let selectedNodeId: string | null = null;
let collapsedNodes: Set<string> = new Set();

// Checkbox state persistence
let includeContentState: boolean = true;
let recursiveState: boolean = false;

// Version navigation state
let currentVersionIndex: number = 0;
let availableVersions: any[] = [];

// Global abort button functions
function showGlobalAbortButton() {
    const globalAbortBtn = document.getElementById('globalAbortBtn') as HTMLButtonElement;
    if (globalAbortBtn) {
        globalAbortBtn.style.display = 'inline-block';
    }
}

function hideGlobalAbortButton() {
    const globalAbortBtn = document.getElementById('globalAbortBtn') as HTMLButtonElement;
    if (globalAbortBtn) {
        globalAbortBtn.style.display = 'none';
    }
}

async function saveCollapsedState() {
    try {
        const { StorageService } = await import('../StorageService');
        const storage = await StorageService.getInstance();
        await storage.set('expert_app_collapsed_nodes', Array.from(collapsedNodes));
    } catch (error) {
        console.warn('Failed to save collapsed nodes state:', error);
    }
}

async function loadCollapsedState() {
    try {
        const { StorageService } = await import('../StorageService');
        const storage = await StorageService.getInstance();
        const saved = await storage.get<string[]>('expert_app_collapsed_nodes');
        if (saved) {
            collapsedNodes = new Set(saved);
        }
    } catch (error) {
        console.warn('Failed to load collapsed nodes state:', error);
        collapsedNodes = new Set();
    }
}

async function saveCheckboxStates() {
    try {
        const { StorageService } = await import('../StorageService');
        const storage = await StorageService.getInstance();
        await storage.set('expert_app_checkbox_states', {
            includeContent: includeContentState,
            recursive: recursiveState
        });
    } catch (error) {
        console.warn('Failed to save checkbox states:', error);
    }
}

async function loadCheckboxStates() {
    try {
        const { StorageService } = await import('../StorageService');
        const storage = await StorageService.getInstance();
        const saved = await storage.get<{includeContent: boolean, recursive: boolean}>('expert_app_checkbox_states');
        if (saved) {
            includeContentState = saved.includeContent;
            recursiveState = saved.recursive;
        }
    } catch (error) {
        console.warn('Failed to load checkbox states:', error);
    }
}



// --- Main Render Function ---

export function renderProjectUI(proj: ProjectManager) {
    projectManager = proj;
    
    // One-time setup for event listeners from the manager
    setupProjectManagerListeners(proj);

    if (!selectedNodeId || !projectManager.findNodeById(selectedNodeId)) {
        selectedNodeId = projectManager.rootNode.id;
    }
    
    const projectTree = getElementById('project-tree');
    const nodeDetails = getElementById('node-details');
    projectTree.innerHTML = ''; // Clear previous content
    nodeDetails.innerHTML = ''; // Clear previous content

    refreshGlobalProfileSelector(); // Keep the profile selector up-to-date
    renderMultiProjectTree();
    renderNodeDetails();
}

// --- Event Listener Setup ---

function setupProjectManagerListeners(manager: ProjectManager) {
    const handleGenerationStarted = (_e: { nodeId: string, node: DocumentNode }) => {
        // Just refresh the tree to show spinner for the generating node
        renderMultiProjectTree();
        // Show global abort button
        showGlobalAbortButton();
        // Always refresh UI to disable buttons during generation
        renderNodeDetails();
    };

    const handleCompletion = (_e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }) => {
        // Check if any operations are still in progress
        const operationsInProgress = manager.isAnyNodeGenerating();
        
        if (!operationsInProgress) {
            // Most UI cleanup is now handled by the coordinator
            // Just do the final project UI refresh
            renderProjectUI(manager);
            
            // Force clear progress UI as additional safety measure
            updateProgressUI();
            hideGenerationOverlay();
        } else {
            // Just refresh the tree to show updated node states - DON'T re-render details during operations
            renderMultiProjectTree();
            // Update content and summary fields without destroying the entire details view
            if (selectedNodeId) {
                const node = manager.findNodeById(selectedNodeId);
                if (node) {
                    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
                    const contextTextArea = document.getElementById('node-context') as HTMLTextAreaElement;
                    if (contentTextArea) contentTextArea.value = node.content;
                    if (contextTextArea) contextTextArea.value = node.context;
                }
            }
        }
        
        // Additional safety: Force clear progress after a delay if no operations are running
        setTimeout(() => {
            if (!manager.isAnyNodeGenerating()) {
                updateProgressUI();
                hideGenerationOverlay();
                hideGlobalAbortButton();
            }
        }, 200);
    };

    const handleAborted = (_e: { nodeId: string, node: DocumentNode }) => {
        // Handle aborted generation - similar to completion but with different messaging
        const operationsInProgress = manager.isAnyNodeGenerating();
        
        if (!operationsInProgress) {
            // UI cleanup is now handled by the coordinator
            renderProjectUI(manager);
        } else {
            renderMultiProjectTree();
        }
    };

    const handleError = (message: string) => {
        // UI cleanup is now handled by the coordinator for generation errors
        // This handler mainly deals with non-generation errors
        alert(`An error occurred: ${message}`);
        renderProjectUI(manager);
    };
    
    const handleHighLevelProgress = (e: { nodeId: string; message: string; current: number; total: number }) => {
        // If message is empty, it means we should clear the progress
        if (!e.message || e.message.trim() === '') {
            updateProgressUI();
            hideGenerationOverlay();
            
            // Additional safety: check if any nodes are still generating
            // If not, force clear everything after a short delay
            setTimeout(() => {
                if (!manager.isAnyNodeGenerating()) {
                    updateProgressUI();
                    hideGenerationOverlay();
                    hideGlobalAbortButton();
                }
            }, 100);
        } else {
        // Always show progress bars during any generation, regardless of selected node
        // This ensures consistency with the spinner behavior
        updateProgressUI({
            operations: { message: e.message, current: e.current, total: e.total }
        });
        }
    };

    const handleLoopProgress = (e: { nodeId: string; progress: LoopProgress }) => {
        // Always show progress bars during any generation, regardless of selected node
        // This ensures consistency with the spinner behavior
        const { progress } = e;
        
        // Map LoopProgress to the three progress bars
        const iterationProgress: ProgressInfo = {
            message: `Iteration: ${progress.iteration} / ${progress.maxIterations}`,
            current: progress.iteration,
            total: progress.maxIterations
        };

        const stageProgress: ProgressInfo = {
            message: `Stage: ${progress.type.charAt(0).toUpperCase() + progress.type.slice(1)} (${progress.step} / ${progress.totalStepsInIteration})`,
            current: progress.step,
            total: progress.totalStepsInIteration
        };

        let detailText = '';
        switch (progress.type) {
            case 'creator':
                detailText = 'AI is generating content...';
                break;
            case 'rater':
                detailText = `AI is evaluating against criterion: ${(progress.payload as RaterProgressPayload).criterion}`;
                break;
            case 'editor':
                detailText = 'AI is compiling feedback for the next iteration...';
                break;
        }

        updateProgressUI({
            iterations: iterationProgress,
            stages: stageProgress,
            detail: detailText,
        });
    };

    const handleSummaryGenerated = (e: { nodeId: string; summary: string }) => {
        if (e.nodeId === selectedNodeId) {
            const contextTextArea = getElementById('node-context') as HTMLTextAreaElement;
            if (contextTextArea) {
                contextTextArea.value = e.summary;
            }
        }
    };

    const handleProjectLoaded = () => {
        // Refresh the entire project UI when project structure changes (e.g., after bulk child generation)
        renderProjectUI(manager);
    };

    // We need to store the listeners so we can remove them correctly.
    // A more robust solution might use a map on the project instance itself.
    // @ts-ignore - attaching to the object for simplicity to ensure removal
    if (manager._completionListener) {
        // @ts-ignore
        manager.off('nodeGenerationStarted', manager._generationStartedListener);
        // @ts-ignore
        manager.off('nodeGenerationComplete', manager._completionListener);
        // @ts-ignore
        manager.off('error', manager._errorListener);
        // @ts-ignore
        manager.off('high-level-progress', manager._highLevelProgressListener);
        // @ts-ignore
        manager.off('loop-progress', manager._loopProgressListener);
        // @ts-ignore
        manager.off('nodeSummaryGenerated', manager._summaryGeneratedListener);
        // @ts-ignore
        manager.off('project-loaded', manager._projectLoadedListener);
    }

    // @ts-ignore
    manager._generationStartedListener = handleGenerationStarted;
    // @ts-ignore
    manager._completionListener = handleCompletion;
    // @ts-ignore
    manager._errorListener = handleError;
    // @ts-ignore
    manager._highLevelProgressListener = handleHighLevelProgress;
    // @ts-ignore
    manager._loopProgressListener = handleLoopProgress;
    // @ts-ignore
    manager._summaryGeneratedListener = handleSummaryGenerated;
    // @ts-ignore
    manager._projectLoadedListener = handleProjectLoaded;
    
    manager.on('nodeGenerationStarted', handleGenerationStarted);
    manager.on('nodeGenerationComplete', handleCompletion);
    manager.on('nodeGenerationAborted', handleAborted);
    manager.on('error', handleError);
    manager.on('high-level-progress', handleHighLevelProgress);
    manager.on('loop-progress', handleLoopProgress);
    manager.on('nodeSummaryGenerated', handleSummaryGenerated);
    manager.on('project-loaded', handleProjectLoaded);
}


// --- Component Renders ---

export function refreshGlobalProfileSelector() {
    const selector = document.getElementById('active-profile-selector') as HTMLSelectElement;
    if (!selector) return;

    const settingsManager = state.getSettingsManager();
    const profileNames = settingsManager?.getProfileNames() || [];
    const activeProfileName = settingsManager?.getLastUsedProfileName() || 'default';
    
    selector.innerHTML = profileNames.map(name => 
        `<option value="${name}" ${activeProfileName === name ? 'selected' : ''}>${name}</option>`
    ).join('');
}

function renderTree() {
    if (!projectManager) return;
    const treeContainer = getElementById('project-tree');
    treeContainer.innerHTML = buildTreeHtml(projectManager.rootNode);

    // Attach event listeners for node selection
    treeContainer.querySelectorAll('.tree-node').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const id = (e.currentTarget as HTMLElement).dataset.id;
            if (id) {
                const node = projectManager?.findNodeById(id);
                // Prevent interaction while a node is generating
                if(node?.isGenerating) return;

                selectedNodeId = id;
                renderTree(); // Re-render tree to update selection highlight
                renderNodeDetails();
            }
        });
    });

    // Attach event listeners for expand/collapse buttons
    treeContainer.querySelectorAll('.tree-expand-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const nodeId = (e.currentTarget as HTMLElement).dataset.nodeId;
            if (nodeId) {
                if (collapsedNodes.has(nodeId)) {
                    collapsedNodes.delete(nodeId);
                } else {
                    collapsedNodes.add(nodeId);
                }
                saveCollapsedState().catch(console.error); // Persist the collapsed state
                renderTree(); // Re-render tree to update expand/collapse state
            }
        });
    });
}

export function renderNodeDetails() {
    const contentArea = getElementById('node-details');
    contentArea.innerHTML = ''; // Clear previous content

    if (!projectManager || !selectedNodeId) {
        contentArea.innerHTML = '<div class="placeholder">No node selected.</div>';
        return;
    }

    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) {
        contentArea.innerHTML = `<div class="placeholder">Error: Node with ID "${selectedNodeId}" not found.</div>`;
        return;
    }
    
    // Set up project manager listeners for the active project (only if not already set up)
    if (!projectManager._listenersSetup) {
        setupProjectManagerListeners(projectManager);
        // @ts-ignore - Mark that listeners are set up to prevent duplication
        projectManager._listenersSetup = true;
    }
    
    const settingsManager = state.getSettingsManager();
    settingsManager?.getProfileNames() || [];

    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'node-details-container';
    detailsContainer.innerHTML = `
        <style>
            .node-details-container {
                padding: 1rem;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
                height: 100%;
                box-sizing: border-box;
            }
            .node-details-header {
                padding-bottom: 1rem;
                border-bottom: 1px solid var(--border-color);
            }
            .node-details-header h2 {
                font-size: 2rem;
                font-weight: bold;
                margin: 0;
            }
            .node-details-header .node-path {
                font-size: 0.9rem;
                color: #6c757d;
                margin-top: 0.25rem;
            }
            .node-section {
                background-color: #ffffff;
                border: 1px solid var(--border-color);
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
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 0.75rem;
                font-size: 1rem;
                line-height: 1.5;
                background-color: var(--input-bg);
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
                border: 1px solid var(--border-color);
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
        </style>
        <div class="node-details-header">
            <h2 id="node-title-display" contenteditable="true">${node.title}</h2>
            <div class="node-path">Path: ${projectManager.getNodePath(node.id)}</div>
            ${node.level === 0 ? `<div class="template-info" style="font-size: 0.9rem; color: #6c757d; margin-top: 0.25rem;">Template: <strong>${projectManager.template.name}</strong></div>` : ''}
            <div style="margin-top: 1rem; display: flex; gap: 1rem;">
                <button id="delete-node-btn" class="button button-secondary" style="background-color: #dc3545; color: white; border-color: #dc3545;">
                    ${node.level === 0 ? 'Delete Project' : 'Delete Node'}
                </button>
                ${node.children.length > 0 ? `
                    <button id="delete-subnodes-btn" class="button button-secondary" style="background-color: #fd7e14; color: white; border-color: #fd7e14;">
                        Delete All Subnodes
                    </button>
                ` : ''}
                <button id="export-node-btn" class="button button-secondary" style="background-color: #6366f1; color: white; border-color: #6366f1;">
                    📤 Export
                </button>
                <button id="import-node-btn" class="button button-secondary" style="background-color: #10b981; color: white; border-color: #10b981;">
                    📥 Import
                </button>
            </div>
        </div>

        <div class="node-section generation-section">
            <div class="prompt-header">
                <label for="node-generation-prompt">Generation</label>
                <div class="placeholder-buttons">
                    <button class="placeholder-btn" data-placeholder="path" title="View path placeholder value">{{path}}</button>
                    <button class="placeholder-btn" data-placeholder="context" title="View context placeholder value">{{context}}</button>
                    <button class="placeholder-btn" data-placeholder="title" title="View title placeholder value">{{title}}</button>
                    <button class="placeholder-btn" data-placeholder="content" title="View content placeholder value">{{content}}</button>
                    <button class="placeholder-btn" data-placeholder="draftorfresh" title="View draftorfresh placeholder value">{{draftorfresh}}</button>
                    ${!node.isLeaf ? '<button class="placeholder-btn" data-placeholder="child_level_name" title="View child level name placeholder value">{{child_level_name}}</button>' : ''}
                    ${!node.isLeaf ? '<button class="placeholder-btn" data-placeholder="count" title="View count placeholder value">{{count}}</button>' : ''}
                    <button id="default-prompt-btn" class="button button-secondary">Default</button>
                </div>
            </div>
            <textarea id="node-generation-prompt" class="large-textarea" rows="8" placeholder="Enter a prompt here to generate content from scratch...">${node.generationPrompt || ''}</textarea>
            
            <!-- Generation Controls -->
            <div style="display: flex; gap: 1rem; align-items: flex-start; margin-top: 1rem;">
                <!-- Left side: Single generation controls -->
                <div style="display: flex; flex-direction: column; gap: 0.75rem; min-width: 250px;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <label for="generation-count-input" style="font-size: 0.9rem; white-space: nowrap;">Count:</label>
                            <input type="number" id="generation-count-input" min="1" max="20" value="${node.generationChildrenCount}" style="width: 70px; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px;">
                        </div>
                        <button id="node-generate-btn" class="button button-primary">Generate</button>
                    </div>
                    
                    ${!node.isLeaf ? `
                        <div style="border-top: 1px solid #e9ecef; padding-top: 0.75rem;">
                            <button id="node-generate-all-btn" class="button" style="width: 100%; margin-bottom: 0.5rem;">Generate All Children</button>
                            <div style="display: flex; gap: 1rem; font-size: 0.9rem;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <input type="checkbox" id="include-content-checkbox" ${includeContentState ? 'checked' : ''}>
                                    <label for="include-content-checkbox" style="cursor: pointer; user-select: none;">Include content</label>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <input type="checkbox" id="recursive-checkbox" ${recursiveState ? 'checked' : ''}>
                                    <label for="recursive-checkbox" style="cursor: pointer; user-select: none;">Recursive</label>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Right side: Progress bars -->
                <div id="generation-progress-container" style="flex: 1; display: none; min-width: 300px;">
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                        <div class="progress-tier">
                            <div id="progress-text-operations" style="font-size: 0.9rem; font-weight: 600; color: #495057; margin-bottom: 0.25rem;"></div>
                            <div class="progress-bar-wrapper">
                                <div id="progress-bar-operations" class="progress-bar" style="width: 0%;"></div>
                            </div>
                        </div>
                        
                        <!-- Middle and Bottom Level: Iterations and Stages side by side -->
                        <div style="display: flex; gap: 1rem;">
                            <!-- Left: LoopOrchestrator iterations -->
                            <div class="progress-tier" style="flex: 1;">
                                <div id="progress-text-iterations" style="font-size: 0.85rem; color: #6c757d; margin-bottom: 0.25rem;"></div>
                                <div class="progress-bar-wrapper">
                                    <div id="progress-bar-iterations" class="progress-bar" style="width: 0%;"></div>
                                </div>
                            </div>
                            
                            <!-- Right: Stage within iteration -->
                            <div class="progress-tier" style="flex: 1;">
                                <div id="progress-text-stages" style="font-size: 0.8rem; color: #6c757d; margin-bottom: 0.25rem;"></div>
                                <div class="progress-bar-wrapper">
                                    <div id="progress-bar-stages" class="progress-bar" style="width: 0%;"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div id="progress-text-detail" style="font-style: italic; color: #6c757d; font-size: 0.75rem; margin-top: 0.25rem;"></div>
                    </div>
                </div>
                
                <style>
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
                    background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%);
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
                </style>
            </div>
        </div>

        <div class="node-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <label for="node-content">Content</label>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div id="version-navigation" style="display: none; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
                        <button id="version-prev-btn" class="version-nav-btn" title="Previous version">‹</button>
                        <span id="version-indicator">Version 1 of 1</span>
                        <button id="version-next-btn" class="version-nav-btn" title="Next version">›</button>
                        <button id="use-this-version-btn" class="button button-primary" style="display: none; padding: 0.25rem 0.5rem; font-size: 0.8rem;">Use This Version</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" id="show-ratings-checkbox" style="margin: 0;">
                        <label for="show-ratings-checkbox" style="font-weight: normal; font-size: 0.9rem; margin: 0;">Show ratings</label>
                    </div>
                </div>
            </div>
            <div id="content-display-area">
                <textarea id="node-content" class="large-textarea" rows="15" placeholder="Node content will be generated or can be written here...">${node.content || ''}</textarea>
                <div id="ratings-display" style="display: none;">
                    <!-- Ratings will be populated here -->
                </div>
            </div>
        </div>
        
        <div class="node-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label for="node-context">Context</label>
                    <span style="font-size: 0.8rem; color: #6c757d; font-style: italic;">(propagates recursively to all children)</span>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button id="node-show-inherited-btn" class="button button-secondary">Show inherited</button>
                    <button id="node-extract-context-btn" class="button button-secondary">Extract Context</button>
                </div>
            </div>
            <textarea id="node-context" class="large-textarea" rows="5" placeholder="Additional context information for this node can be written here.">${node.context || ''}</textarea>
        </div>


    `;

    contentArea.appendChild(detailsContainer);

    // --- Populate and Set States (No Listeners Here!) ---
    const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
    const generateBtn = getElementById('node-generate-btn') as HTMLButtonElement;
    const defaultPromptBtn = getElementById('default-prompt-btn') as HTMLButtonElement;
    const showRatingsCheckbox = getElementById('show-ratings-checkbox') as HTMLInputElement;

    // Reset checkbox state when switching nodes
    if (showRatingsCheckbox) {
        showRatingsCheckbox.checked = false;
        // Ensure content view is shown by default
        toggleRatingsView(false);
    }

    // Initialize version navigation
    initializeVersionNavigation(node);

    if (!node.generationPrompt) {
        node.generationPrompt = projectManager.getRawGenerationPrompt(node);
        // Don't auto-save - only save when user explicitly changes something
    }
    generationPromptTextArea.value = node.generationPrompt;

    // Check if any operation is currently running on this node or any other node in the project
    const isAnyNodeGenerating = projectManager.isAnyNodeGenerating();
    const isThisNodeGenerating = node.isGenerating;
    const shouldDisableButtons = isAnyNodeGenerating || node.isPromptGenerating;

    if (node.isPromptGenerating) {
        generationPromptTextArea.placeholder = "Generating detailed prompt...";
    } else if (!node.generationPrompt) {
        generationPromptTextArea.placeholder = "A detailed prompt was not generated. You can write one here or try expanding the parent node again.";
    } else {
        generationPromptTextArea.placeholder = "The prompt for generating content. You can edit it here.";
    }

    // Update button states based on generation status  
    const isAnyOperationInProgress = projectManager.getGenerationService().canAbortGeneration();
    
    // Normal button states (no more button transformations)
    generateBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    generateBtn.className = 'button button-primary';
    generateBtn.id = 'node-generate-btn';
    
    defaultPromptBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    
    // Handle context buttons state
    const extractContextBtn = getElementById('node-extract-context-btn') as HTMLButtonElement;
    const showInheritedBtn = getElementById('node-show-inherited-btn') as HTMLButtonElement;
    if (extractContextBtn) {
        extractContextBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    }
    if (showInheritedBtn) {
        showInheritedBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    }

    // Update button text to show current state
    if (isThisNodeGenerating) {
        generateBtn.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span> Generating...';
    } else if (isAnyOperationInProgress) {
        generateBtn.textContent = 'Generate (Operation in progress)';
    } else {
        generateBtn.textContent = 'Generate';
    }

    // Set up button tooltips and event listeners for generate all children button (now inline)
    if (!node.isLeaf) {
        const generateAllBtn = getElementById('node-generate-all-btn') as HTMLButtonElement;
        if (generateAllBtn) {
            // Normal state (no more button transformations)
            generateAllBtn.className = 'button';
            generateAllBtn.innerHTML = 'Generate All Children';
            generateAllBtn.id = 'node-generate-all-btn';
            generateAllBtn.disabled = isAnyOperationInProgress;
            
            // Update tooltip to reflect current state
            if (isAnyOperationInProgress) {
                generateAllBtn.title = "Operation in progress. Use the global abort button to cancel.";
            } else if (node.getState() === 'Empty') {
                generateAllBtn.title = "This node has no content. Clicking will show instructions.";
            } else {
                generateAllBtn.title = "Smart fill: Creates children only if none exist, generates content only for empty nodes. Use 'Include content' and 'Recursive' to control behavior.";
            }
        }
        
        // Set up checkbox event listeners to save state
        const includeContentCheckbox = getElementById('include-content-checkbox') as HTMLInputElement;
        const recursiveCheckbox = getElementById('recursive-checkbox') as HTMLInputElement;
        
        if (includeContentCheckbox) {
            includeContentCheckbox.addEventListener('change', () => {
                includeContentState = includeContentCheckbox.checked;
                saveCheckboxStates().catch(console.error);
            });
        }
        
        if (recursiveCheckbox) {
            recursiveCheckbox.addEventListener('change', () => {
                recursiveState = recursiveCheckbox.checked;
                saveCheckboxStates().catch(console.error);
            });
        }
    }
}

function initializeVersionNavigation(node: DocumentNode) {
    // Get all available versions (current content + all iterations from latest session)
    availableVersions = [];
    currentVersionIndex = 0;

    // Helper function to calculate total score
    const calculateTotalScore = (ratings: any[]): number => {
        if (!ratings || ratings.length === 0) return 0;
        return ratings.reduce((sum, rating) => sum + rating.score, 0);
    };

    // Add current content as version (will be sorted by score)
    const currentChosenIteration = node.getChosenIteration();
    availableVersions.push({
        content: node.content,
        ratings: currentChosenIteration?.ratings || null,
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
        const currentVersion = availableVersions[currentVersionIndex];
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

function navigateToVersion(direction: 'prev' | 'next') {
    if (direction === 'prev' && currentVersionIndex > 0) {
        currentVersionIndex--;
    } else if (direction === 'next' && currentVersionIndex < availableVersions.length - 1) {
        currentVersionIndex++;
    }
    
    displayCurrentVersion();
    updateVersionNavigationUI();
}

function displayCurrentVersion() {
    const currentVersion = availableVersions[currentVersionIndex];
    if (!currentVersion) return;

    // Update content display
    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
    if (contentTextArea) {
        contentTextArea.value = currentVersion.content;
    }

    // Update ratings display if currently showing ratings
    const showRatingsCheckbox = document.getElementById('show-ratings-checkbox') as HTMLInputElement;
    if (showRatingsCheckbox?.checked) {
        renderRatingsView();
    }
}

function useCurrentVersion() {
    if (!projectManager || !selectedNodeId) return;
    
    const node = projectManager.findNodeById(selectedNodeId);
    const currentVersion = availableVersions[currentVersionIndex];
    
    if (!node || !currentVersion || currentVersion.isCurrent) return;

    // Update the node's content
    node.content = currentVersion.content;
    
    // Save to storage
    projectManager.saveToStorage().catch(console.error);
    
    // Reset to show current version
    currentVersionIndex = 0;
    availableVersions[0].content = currentVersion.content;
    
    // Update UI
    displayCurrentVersion();
    updateVersionNavigationUI();
    
    // Show success message
    alert('Content updated to selected version!');
}

function toggleRatingsView(showRatings: boolean) {
    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
    const ratingsDisplay = document.getElementById('ratings-display') as HTMLDivElement;
    
    if (!contentTextArea || !ratingsDisplay) return;
    
    if (showRatings) {
        // Hide content textarea and show ratings
        contentTextArea.style.display = 'none';
        ratingsDisplay.style.display = 'block';
        
        // Populate ratings display
        renderRatingsView();
    } else {
        // Show content textarea and hide ratings
        contentTextArea.style.display = 'block';
        ratingsDisplay.style.display = 'none';
    }
}

function renderRatingsView() {
    const ratingsDisplay = document.getElementById('ratings-display') as HTMLDivElement;
    if (!ratingsDisplay || !projectManager || !selectedNodeId) return;
    
    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) return;
    
    // Get ratings from the currently selected version
    const currentVersion = availableVersions[currentVersionIndex];
    let versionRatings: any[] = [];
    let versionLabel = 'Current';
    let timestampToShow: Date | null = null;
    
    if (currentVersion && currentVersion.ratings) {
        versionRatings = currentVersion.ratings;
        versionLabel = currentVersion.label;
        timestampToShow = currentVersion.timestamp;
    } else if (currentVersion && currentVersion.isCurrent) {
        // For current version, try to get ratings from chosen iteration
        const chosenIteration = node.getChosenIteration();
        if (chosenIteration && chosenIteration.ratings) {
            versionRatings = chosenIteration.ratings;
            timestampToShow = chosenIteration.timestamp;
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
                ${currentVersion && currentVersion.isCurrent ? `
                    <button id="regenerate-ratings-btn" class="button button-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">
                        Generate Ratings for Current Content
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    const maxScore = Math.max(...versionRatings.map((r: any) => Math.max(r.score, r.goal)), 10); // Ensure minimum scale of 10
    
    let ratingsHtml = `
        <div style="padding: 1.5rem; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h4 style="margin: 0 0 1rem 0; color: #495057;">Quality Ratings for ${versionLabel} Content</h4>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
    `;
    
    versionRatings.forEach((rating: any) => {
        const scorePercentage = (rating.score / maxScore) * 100;
        const goalPercentage = (rating.goal / maxScore) * 100;
        const metGoal = rating.score >= rating.goal;
        const statusColor = metGoal ? '#28a745' : '#dc3545';
        const statusIcon = metGoal ? '✓' : '✗';
        
        ratingsHtml += `
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div style="font-weight: 600; color: #343a40;">${rating.criterion}</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="color: ${statusColor}; font-size: 1.1rem;">${statusIcon}</span>
                        <span style="font-weight: 600; color: ${statusColor};">${rating.score}/${rating.goal}</span>
                    </div>
                </div>
                
                <div style="position: relative; background-color: #e9ecef; border-radius: 6px; height: 24px; overflow: hidden;">
                    <!-- Goal line -->
                    <div style="position: absolute; left: ${goalPercentage}%; top: 0; bottom: 0; width: 2px; background-color: #ffc107; z-index: 2;"></div>
                    <!-- Score bar -->
                    <div style="height: 100%; background: linear-gradient(90deg, ${metGoal ? '#28a745' : '#dc3545'} 0%, ${metGoal ? '#34ce57' : '#e74c3c'} 100%); width: ${scorePercentage}%; border-radius: 6px; transition: width 0.3s ease-in-out; position: relative;">
                        <!-- Shine effect -->
                        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%); animation: progress-shine 2s infinite;"></div>
                    </div>
                </div>
                
                <div style="margin-top: 0.5rem; font-size: 0.85rem; color: #6c757d; font-style: italic;">
                    "${rating.justification}"
                </div>
            </div>
        `;
    });
    
    ratingsHtml += `
            </div>
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #dee2e6; font-size: 0.8rem; color: #6c757d;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <div style="width: 12px; height: 2px; background-color: #ffc107;"></div>
                    <span>Goal threshold</span>
                </div>
                ${timestampToShow ? `Generated on: ${new Date(timestampToShow).toLocaleString()}` : 'Timestamp not available'}
            </div>
        </div>
    `;
    
    ratingsDisplay.innerHTML = ratingsHtml;
}

// --- Helper Functions ---

function buildTreeHtml(node: DocumentNode, isProjectRoot: boolean = false): string {
    const isSelected = node.id === selectedNodeId;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedNodes.has(node.id);
    const indent = node.level * 20;
    
    let html = `<div class="tree-item" style="padding-left: ${indent}px;">`;
    
    // Add expand/collapse button for nodes with children
    if (hasChildren) {
        const expandIcon = isCollapsed ? '▶' : '▼';
        html += `<span class="tree-expand-btn" data-node-id="${node.id}" style="cursor: pointer; margin-right: 4px; user-select: none; font-size: 12px;">${expandIcon}</span>`;
    } else {
        // Add spacing for nodes without children to align with those that have expand buttons
        html += `<span style="margin-right: 16px;"></span>`;
    }
    
    // Add the node title with special styling for project roots
    const nodeClasses = `tree-node ${isSelected ? 'selected' : ''} ${isProjectRoot ? 'project-root' : ''}`;
    html += `<span class="${nodeClasses}" data-id="${node.id}">
                ${node.title} ${node.isGenerating ? '<span class="spinner" style="width:12px; height:12px; border-width: 2px;"></span>' : ''}
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

function showInheritedContextOverlay(projectManager: ProjectManager, node: DocumentNode) {
    // Get the context panel to match its dimensions
    const contextSection = document.querySelector('.node-section:has(#node-context)') as HTMLElement;
    if (!contextSection) return;

                contextSection.getBoundingClientRect();

    // Collect inherited contexts from parent chain
    const inheritedContexts: Array<{title: string, level: string, context: string}> = [];
    
    // Walk up the parent chain
    let currentNode = node.parentId ? projectManager.findNodeById(node.parentId) : null;
    let pathParts: Array<{title: string, level: string, context: string}> = [];
    
    while (currentNode) {
        if (currentNode.context && currentNode.context.trim()) {
            const levelName = currentNode.template[currentNode.level] || `Level ${currentNode.level}`;
            pathParts.unshift({
                title: currentNode.title,
                level: levelName,
                context: currentNode.context
            });
        }
        currentNode = currentNode.parentId ? projectManager.findNodeById(currentNode.parentId) : null;
    }
    
    inheritedContexts.push(...pathParts);

    // Create overlay content
    let contentHtml = '';
    if (inheritedContexts.length === 0) {
        contentHtml = '<div style="color: #6c757d; font-style: italic; text-align: center; padding: 2rem;">No inherited context found.<br>Add context to parent nodes to see inherited content here.</div>';
    } else {
        contentHtml = inheritedContexts.map((item, index) => `
            <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; ${index < inheritedContexts.length - 1 ? 'border-bottom: 1px solid #e9ecef;' : ''}">
                <div style="font-weight: bold; font-size: 1rem; margin-bottom: 0.5rem; color: #495057;">
                    ${item.level}: "${item.title}"
                </div>
                <div style="background-color: #f8f9fa; padding: 0.75rem; border-radius: 6px; border-left: 3px solid #007bff; white-space: pre-wrap; font-size: 0.9rem; line-height: 1.4;">
                    ${item.context}
                </div>
            </div>
        `).join('');
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'inherited-context-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        box-sizing: border-box;
    `;

    overlay.innerHTML = `
        <div class="inherited-context-content" style="
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04);
            max-width: 800px;
            max-height: 80vh;
            width: 100%;
            display: flex;
            flex-direction: column;
        ">
            <div class="inherited-context-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1.5rem;
                border-bottom: 1px solid #e5e7eb;
                background-color: #f8f9fa;
                border-radius: 12px 12px 0 0;
            ">
                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: #1f2937;">
                    Inherited Context for "${node.title}"
                </h3>
                <button class="inherited-context-close-btn" type="button" style="
                    background: #ef4444;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    cursor: pointer;
                    font-size: 1.2rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background-color 0.2s;
                " onmouseover="this.style.backgroundColor='#dc2626'" onmouseout="this.style.backgroundColor='#ef4444'">&times;</button>
            </div>
            <div class="inherited-context-body" style="
                padding: 1.5rem;
                overflow-y: auto;
                flex: 1;
                min-height: 0;
            ">
                ${contentHtml}
            </div>
        </div>
    `;

    // Add close functionality
    const closeBtn = overlay.querySelector('.inherited-context-close-btn');
    
    const closeOverlay = () => {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', closeOverlay);
    }

    // Close on overlay background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeOverlay();
        }
    });

    // Close on Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeOverlay();
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Add to DOM
    document.body.appendChild(overlay);
}

function showPlaceholderOverlay(placeholder: string, projectManager: ProjectManager, selectedNodeId: string) {
    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) return;

    // Get the generation prompt panel (section) to match its dimensions
    const promptSection = document.querySelector('.generation-section') as HTMLElement;
    if (!promptSection) return;

    const sectionRect = promptSection.getBoundingClientRect();

    // Get placeholder descriptions
    const descriptions: { [key: string]: string } = {
        'path': 'The hierarchical path from root to this node',
        'context': 'Compiled contextual information from ancestors, siblings, and parent',
        'title': 'The title of the current node',
        'content': 'The current content of the node (if any)',
        'draftorfresh': 'Instructions for handling existing content (draft improvement or new generation)',
        'child_level_name': 'The name of the child level (for branch nodes)',
        'count': 'The number of items to generate (for list generation)'
    };

    // Get the actual placeholder value
    let value: string;
    switch (placeholder) {
        case 'path':
            value = projectManager.getTreeService().getNodePath(selectedNodeId, projectManager.rootNode);
            break;
        case 'context':
            value = projectManager.getContextService().compileNodeContext(selectedNodeId, projectManager.rootNode);
            break;
        case 'title':
            value = node.title;
            break;
        case 'content':
            value = node.content || '';
            break;
        case 'draftorfresh':
            // Show what the draftorfresh placeholder would actually expand to
            if (node.content) {
                if (node.content.startsWith('Draft:')) {
                    value = `You have this existing draft to build upon:
---
${node.content}
---

Please expand this draft into full, detailed content. Use the draft as a guide for what should be covered, but write complete, polished content that goes well beyond the brief draft description.`;
                } else {
                    value = `You have this existing content to revise or expand:
---
${node.content}
---

Please improve and expand this content.`;
                }
            } else {
                value = 'Now, write the full content for this node.';
            }
            break;
        case 'child_level_name':
            value = node.childLevelName || '';
            break;
        case 'count':
            value = '5'; // Default count for demonstration
            break;
        default:
            value = '';
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'placeholder-overlay';
    overlay.innerHTML = `
        <div class="placeholder-content" style="
            width: ${sectionRect.width}px;
            height: ${sectionRect.height}px;
            max-width: none;
            max-height: none;
            position: absolute;
            top: ${sectionRect.top + window.scrollY}px;
            left: ${sectionRect.left + window.scrollX}px;
        ">
            <div class="placeholder-header">
                <h3>{{${placeholder}}}</h3>
                <button class="placeholder-close-btn" type="button">&times;</button>
            </div>
            <div class="placeholder-body">
                <div class="placeholder-description">
                    ${descriptions[placeholder] || 'Placeholder value'}
                </div>
                <div class="placeholder-value ${value ? '' : 'placeholder-empty'}">
                    ${value || '(empty)'}
                </div>
            </div>
        </div>
    `;

    // Add close functionality
    const closeBtn = overlay.querySelector('.placeholder-close-btn');
    
    const closeOverlay = () => {
        overlay.remove();
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', closeOverlay);
    }

    // Close on overlay background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeOverlay();
        }
    });

    // Close on Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeOverlay();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Add to DOM
    document.body.appendChild(overlay);
}

// The handleGenerationPanelButton function has been removed - all button handling is now unified in setupEventListeners

export function setupEventListeners() {
    const mainContent = getElementById('main-content');

    // === MAIN CONTENT EVENT DELEGATION ===
    mainContent.addEventListener('click', (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;

        const button = e.target.closest('button');
        if (!button) return;



        // === UNIFIED BUTTON HANDLER FOR ALL BUTTONS IN THE GUI ===
        
        // Handle placeholder buttons by data attribute
        if (button.classList.contains('placeholder-btn')) {
            const placeholder = button.getAttribute('data-placeholder');
            if (placeholder && projectManager && selectedNodeId) {
                showPlaceholderOverlay(placeholder, projectManager, selectedNodeId);
            }
            return;
        }

        // Handle all other buttons by ID using the same pattern
        switch (button.id) {
            // === GENERATION PANEL BUTTONS ===
            case 'default-prompt-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

                    const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
                    const defaultPrompt = projectManager.getRawGenerationPrompt(node);
                    generationPromptTextArea.value = defaultPrompt;
                    node.generationPrompt = defaultPrompt;
                }
                break;

            case 'node-generate-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

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
                    
                    const coordinator = projectManager.getGenerationCoordinator();
                    
                    const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
                    node.generationPrompt = generationPromptTextArea.value;
                    
                    // Get the count from the input
                    const countInput = getElementById('generation-count-input') as HTMLInputElement;
                    const count = countInput ? parseInt(countInput.value, 10) : node.generationChildrenCount;
                    
                    // Start operation through coordinator
                    const operationId = coordinator.startOperation('single-content', node.id, [node.id]);
                    if (!operationId) {
                        alert('Another generation operation is already in progress. Please wait for it to complete.');
                        return;
                    }
                    
                    // Use GenerationService directly
                    projectManager.getGenerationService().generateNodeContent(node.id, count)
                        .then(() => {
                            coordinator.completeOperation(operationId, true);
                        })
                        .catch((error) => {
                            coordinator.completeOperation(operationId, false, error);
                        });
                }
                break;

            case 'node-generate-all-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

                    const coordinator = projectManager.getGenerationCoordinator();
                    
                    // Check if node has content (Draft or Final)
                    if (node.getState() === 'Empty') {
                        alert('This node has no content. Please write or generate content for this node first.\n\nThe content should be an outline or description that can be used to create child nodes.');
                        return;
                    }
                    
                    // Use stored checkbox states instead of reading from DOM
                    const includeContent = includeContentState;
                    const recursive = recursiveState;
                    
                    // Collect all nodes that will be involved in this operation
                    const getAllInvolvedNodes = (parentNode: DocumentNode): string[] => {
                        const nodeIds = [parentNode.id];
                        for (const child of parentNode.children) {
                            if (recursive) {
                                nodeIds.push(...getAllInvolvedNodes(child));
                            } else {
                                nodeIds.push(child.id);
                            }
                        }
                        return nodeIds;
                    };
                    
                    const involvedNodeIds = getAllInvolvedNodes(node);
                    
                    // Start operation through coordinator
                    const operationId = coordinator.startOperation('bulk-children', node.id, involvedNodeIds);
                    if (!operationId) {
                        alert('Another generation operation is already in progress. Please wait for it to complete.');
                        return;
                    }
            
                    // Use GenerationService directly
                    projectManager.getGenerationService().generateAllChildrenContent(node.id, includeContent, recursive)
                        .then(() => {
                            coordinator.completeOperation(operationId, true);
                        })
                        .catch((error) => {
                            coordinator.completeOperation(operationId, false, error);
                        });
                }
                break;

            case 'node-extract-context-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

                    // Import and open extract context modal
                    import('./modal-manager').then(({ openExtractContextModal }) => {
                        openExtractContextModal(projectManager!, node);
                    }).catch((error: any) => {
                        console.error('Failed to open extract context modal:', error);
                        alert('Failed to open extract context dialog. Please try again.');
                    });
                }
                break;

            case 'regenerate-ratings-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

                    // Check if node has content to rate
                    if (!node.content || node.content.trim() === '') {
                        alert('No content to rate. Please add content to this node first.');
                        return;
                    }
                    
                    const confirmMessage = `This will generate quality ratings for the current content.\n\nNote: This uses AI tokens and may take a moment to complete.\n\nDo you want to proceed?`;
                    if (!confirm(confirmMessage)) {
                        return;
                    }
                    
                    const coordinator = projectManager.getGenerationCoordinator();
                    
                    // Start operation through coordinator
                    const operationId = coordinator.startOperation('single-content', node.id, [node.id]);
                    if (!operationId) {
                        alert('Another generation operation is already in progress. Please wait for it to complete.');
                        return;
                    }
                    
                    // Use the generation service to rate the content directly
                    projectManager.getGenerationService().rateNodeContent(node.id)
                        .then(() => {
                            coordinator.completeOperation(operationId, true);
                            // Switch back to content view and then to ratings view to show the new ratings
                            const showRatingsCheckbox = document.getElementById('show-ratings-checkbox') as HTMLInputElement;
                            if (showRatingsCheckbox) {
                                showRatingsCheckbox.checked = true;
                                toggleRatingsView(true);
                            }
                        })
                        .catch((error) => {
                            coordinator.completeOperation(operationId, false, error);
                        });
                }
                break;

            case 'node-show-inherited-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;
                    
                    showInheritedContextOverlay(projectManager, node);
                }
                break;

            // === NODE MANAGEMENT BUTTONS ===
            case 'delete-node-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
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
                                        const storage = await import('../StorageService').then(m => m.StorageService.getInstance());
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
                                initializeProjectUI();
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
                                projectManager.saveToStorage().catch(console.error);
                                
                                // Select the parent node or project root
                                const parentNode = node.parentId ? projectManager.findNodeById(node.parentId) : projectManager.rootNode;
                                selectedNodeId = parentNode ? parentNode.id : projectManager.rootNode.id;
                                
                                // Re-render the UI
                                renderMultiProjectTree();
                                renderNodeDetails();
                            } else {
                                alert('Failed to delete the node. It may be a root node or have an invalid parent.');
                            }
                        }
                    }
                }
                break;

            case 'delete-subnodes-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
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
                            projectManager.saveToStorage().catch(console.error);
                            
                            // Re-render the UI to reflect the changes
                            renderMultiProjectTree();
                            renderNodeDetails();
                            
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
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

                    // Import and open export modal
                    import('./modal-manager').then(({ openExportModal }) => {
                        openExportModal(projectManager!, node);
                    }).catch(error => {
                        alert('Failed to open export dialog. Please try again.');
                    });
                }
                break;

            case 'import-node-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
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

            // === VERSION NAVIGATION BUTTONS ===
            case 'version-prev-btn':
                navigateToVersion('prev');
                break;

            case 'version-next-btn':
                navigateToVersion('next');
                break;

            case 'use-this-version-btn':
                useCurrentVersion();
                break;

            // === READER VIEW BUTTON ===
            case 'open-reader-btn':
                {
                    if (!projectManager) {
                        alert('No project is currently active. Please create or select a project first.');
                        return;
                    }
                    
                    openReaderView(projectManager, (nodeId: string) => {
                        // Optional callback when navigating to a node from reader
                        selectedNodeId = nodeId;
                        renderNodeDetails();
                    }).catch((error) => {
                        console.error('Failed to open reader view:', error);
                        alert('Failed to open reader view. Please try again.');
                    });
                }
                break;

            // === MAIN APP BUTTONS (from event-handlers.ts) ===
            // These could be moved here for true unification if desired
            
            default:
                // No handler found - this is fine, not all buttons need handling
                break;
        }
    });

    // === NON-CLICK EVENT LISTENERS ===
    mainContent.addEventListener('change', (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;

        if (e.target.id === 'active-profile-selector') {
            const select = e.target as HTMLSelectElement;
            const settingsManager = state.getSettingsManager();
            if (settingsManager) {
                settingsManager.setLastUsedProfile(select.value);
            }
        } else if (e.target.id === 'show-ratings-checkbox') {
            const checkbox = e.target as HTMLInputElement;
            toggleRatingsView(checkbox.checked);
        }
    });
}

export function initializeProjectUI(manager?: ProjectManager) {
    const activeProject = manager || state.getActiveProject();
    projectManager = activeProject;
    
    if (activeProject) {
        selectedNodeId = activeProject.rootNode.id;
    }
    
    loadCollapsedState().catch(console.error); // Load the collapsed state from storage
    loadCheckboxStates().catch(console.error); // Load the checkbox states from storage

    const mainContent = getElementById('main-content');
    
    // Get profile information for the global selector
    const settingsManager = state.getSettingsManager();
    const profileNames = settingsManager?.getProfileNames() || [];
    const activeProfileName = settingsManager?.getLastUsedProfileName() || 'default';
    const profileOptions = profileNames.map(name => 
        `<option value="${name}" ${activeProfileName === name ? 'selected' : ''}>${name}</option>`
    ).join('');

    mainContent.innerHTML = `
        <style>
            #global-profile-bar {
                background-color: #f8f9fa;
                border-bottom: 1px solid var(--border-color);
                padding: 1rem;
                display: flex;
                align-items: center;
                gap: 1rem;
                margin-bottom: 1rem;
            }
            #global-profile-bar label {
                font-weight: bold;
                font-size: 1.1rem;
                color: #343a40;
                white-space: nowrap;
            }
            #global-profile-bar select {
                padding: 0.5rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                font-size: 1rem;
                min-width: 200px;
            }
            #project-container { display: flex; gap: 1rem; align-items: flex-start; }
            #project-tree { flex: 1; max-width: 400px; }
            #node-details { flex: 2; }
            .tree-item { display: flex; align-items: center; }
            .tree-expand-btn { 
                color: #6c757d; 
                font-weight: bold;
                width: 16px;
                text-align: center;
            }
            .tree-expand-btn:hover { color: var(--primary-color); }
            .tree-node { 
                padding: 0.25rem 0.5rem; 
                border-radius: 4px; 
                cursor: pointer; 
                flex-grow: 1;
                margin-left: 2px;
            }
            .tree-node.selected { background-color: var(--primary-color); color: white; }
            .tree-node:hover:not(.selected) { background-color: #e9ecef; }
            .project-root {
                font-weight: bold;
                color: #495057;
                border-left: 3px solid var(--primary-color);
                background-color: #f8f9fa;
            }
            .details-view { background-color: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .details-view h2, .details-view h3 { margin-top: 0; }
            .details-view textarea, .details-view select, .details-view input { width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-color); }
            .details-view .form-group { margin-bottom: 1rem; }
            .action-buttons { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
            .spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid rgba(0,0,0,0.1);
                border-radius: 50%;
                border-top-color: var(--primary-color);
                animation: spin 1s ease-in-out infinite;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
        <div id="global-profile-bar">
            <label for="active-profile-selector">Active profile:</label>
            <select id="active-profile-selector">${profileOptions}</select>
            <span style="color: #6c757d; font-size: 0.9rem;">This profile will be used for all AI operations (Generate, Summarize, etc.)</span>
            <button id="open-reader-btn" style="margin-left: auto; padding: 0.5rem 1rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--primary-color); color: white; cursor: pointer; font-size: 0.9rem;">📖 Reader View</button>
        </div>
        <div id="project-container">
            <div id="project-tree"></div>
            <div id="node-details"></div>
        </div>
    `;
    
    // Render the multi-project tree (event listeners are set up once in main.ts)
    renderMultiProjectTree();
    
    // Ensure global abort button is hidden on initialization
    hideGlobalAbortButton();
    
    // Render node details if we have a selected node
    if (selectedNodeId) {
        renderNodeDetails();
    } else {
        const nodeDetails = getElementById('node-details');
        nodeDetails.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;">Select a node to view details.</div>';
    }
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
}

// Global progress state to maintain all three progress bars
let currentProgressState = {
    operations: null as ProgressInfo | null,
    iterations: null as ProgressInfo | null,
    stages: null as ProgressInfo | null,
    detail: ''
};

function updateProgressUI(data?: ProgressUIData) {
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
    
    if (!data) {
        // Clear all progress and hide container
        currentProgressState = { operations: null, iterations: null, stages: null, detail: '' };
        container.style.display = 'none';
        return;
    }
    
    // Update the global state with new data (preserve existing values if not provided)
    if (data.operations) currentProgressState.operations = data.operations;
    if (data.iterations) currentProgressState.iterations = data.iterations;
    if (data.stages) currentProgressState.stages = data.stages;
    if (data.detail !== undefined) currentProgressState.detail = data.detail;
    
    // Show container and all progress bars whenever we have any progress data
    container.style.display = 'block';
    operationsText.style.display = 'block';
    operationsBar.style.display = 'block';
    iterationsText.style.display = 'block';
    iterationsBar.style.display = 'block';
    stagesText.style.display = 'block';
    stagesBar.style.display = 'block';
    
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
}

// Expose UI functions globally for the GenerationCoordinator
(window as any).updateProgressUI = updateProgressUI;
(window as any).showGenerationOverlay = showGenerationOverlay;
(window as any).hideGenerationOverlay = hideGenerationOverlay;
(window as any).showGlobalAbortButton = showGlobalAbortButton;
(window as any).hideGlobalAbortButton = hideGlobalAbortButton;



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

function renderMultiProjectTree() {
    const treeContainer = getElementById('project-tree');
    const projects = state.getProjects();
    
    if (projects.length === 0) {
        treeContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;">No projects available. Create a new project to get started.</div>';
        return;
    }
    
    let html = '';
    projects.forEach(project => {
        html += buildTreeHtml(project.rootNode, true); // true indicates this is a project root
    });
    
    treeContainer.innerHTML = html;

    // Attach event listeners for node selection
    treeContainer.querySelectorAll('.tree-node').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const id = (e.currentTarget as HTMLElement).dataset.id;
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
                    // Prevent interaction while a node is generating
                    if (node.isGenerating) return;

                    selectedNodeId = id;
                    projectManager = nodeProject; // Update the active project manager
                    state.setActiveProject(nodeProject.rootNode.id); // Update the active project in state
                    renderMultiProjectTree(); // Re-render tree to update selection highlight
                    renderNodeDetails();
                }
            }
        });
    });

    // Attach event listeners for expand/collapse buttons
    treeContainer.querySelectorAll('.tree-expand-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const nodeId = (e.currentTarget as HTMLElement).dataset.nodeId;
            if (nodeId) {
                if (collapsedNodes.has(nodeId)) {
                    collapsedNodes.delete(nodeId);
                } else {
                    collapsedNodes.add(nodeId);
                }
                saveCollapsedState().catch(console.error); // Persist the collapsed state
                renderMultiProjectTree(); // Re-render tree to update expand/collapse state
            }
        });
    });
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

    // Validate hierarchy depth compatibility
    if (importData.children && Array.isArray(importData.children) && importData.children.length > 0) {
        const importDepth = calculateImportDataDepth(importData);
        const targetLevel = targetNode.level;
        const templateLength = targetNode.template.length;
        const availableDepth = templateLength - targetLevel - 1; // -1 because targetLevel is 0-indexed
        
        if (importDepth > availableDepth) {
            throw new Error(
                `Hierarchy mismatch: The imported data has ${importDepth} levels of children, ` +
                `but the target node can only accommodate ${availableDepth} more levels.\n\n` +
                `Target node is at level ${targetLevel} in a ${templateLength}-level template ` +
                `(${targetNode.template.join(' → ')}).`
            );
        }
    }

    // Import the node data
    if (importData.title !== undefined) {
        targetNode.title = importData.title;
    }

    if (importData.content !== undefined) {
        targetNode.content = importData.content;
    }

    if (importData.context !== undefined) {
        targetNode.context = importData.context;
    }

    if (importData.generationPrompt !== undefined) {
        targetNode.generationPrompt = importData.generationPrompt;
    }

    // Option 1: Replace the current node's children (destructive)
    // Option 2: Merge children (non-destructive)
    // For now, let's ask the user what they want to do
    if (importData.children && Array.isArray(importData.children) && importData.children.length > 0) {
        const hasExistingChildren = targetNode.children.length > 0;
        
        if (hasExistingChildren) {
            const userChoice = confirm(
                `The target node "${targetNode.title}" already has ${targetNode.children.length} children.\n\n` +
                `Click OK to REPLACE all existing children with imported ones.\n` +
                `Click Cancel to APPEND imported children to existing ones.`
            );
            
            if (userChoice) {
                // Replace: Remove all existing children first
                targetNode.children.forEach(child => {
                    projectManager.removeNode(child.id);
                });
            }
        }
        
        // Import children recursively
        importData.children.forEach((childData: any, index: number) => {
            importChildNode(projectManager, targetNode.id, childData, index);
        });
    }

    // Save the project
    projectManager.saveToStorage().catch(console.error);
}

/**
 * Recursively import a child node and its descendants
 */
function importChildNode(projectManager: ProjectManager, parentId: string, childData: any, index: number): void {
    if (!childData.title) {
        console.warn(`Skipping child node at index ${index}: Missing title`);
        return;
    }

    // Create the child node
    const newNode = projectManager.addNode(childData.title, parentId);

    // Set node properties
    if (childData.content !== undefined) {
        newNode.content = childData.content;
    }

    if (childData.context !== undefined) {
        newNode.context = childData.context;
    }

    if (childData.generationPrompt !== undefined) {
        newNode.generationPrompt = childData.generationPrompt;
    }

    // Recursively import children
    if (childData.children && Array.isArray(childData.children)) {
        childData.children.forEach((grandChildData: any, grandChildIndex: number) => {
            importChildNode(projectManager, newNode.id, grandChildData, grandChildIndex);
        });
    }
}