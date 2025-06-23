import { ProjectManager } from '../ProjectManager';
import { DocumentNode } from '../DocumentNode';
import { getElementById } from './dom-elements';
import * as state from '../state';
import { LoopProgress, RaterProgressPayload } from '../LoopOrchestrator';
import { openReaderView } from './reader-gui';

let projectManager: ProjectManager | null = null;
let selectedNodeId: string | null = null;
let collapsedNodes: Set<string> = new Set();

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

function renderProjectTree() {
    if (!projectManager) return;
    const treeContainer = getElementById('project-tree');
    treeContainer.innerHTML = '';
    const rootUL = createNodeElement(projectManager.rootNode);
    treeContainer.appendChild(rootUL);
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
    const handleGenerationStarted = (e: { nodeId: string, node: DocumentNode }) => {
        // Just refresh the tree to show spinner for the generating node
        renderMultiProjectTree();
    };

    const handleCompletion = (e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }) => {
        // Check if any operations are still in progress
        const operationsInProgress = manager.isAnyNodeGenerating();
        
        if (!operationsInProgress) {
            // Clear progress state and hide overlay when all operations complete
            updateProgressUI();
            hideGenerationOverlay();
            renderProjectUI(manager);
        } else {
            // Just refresh the tree to show updated node states - DON'T re-render details during operations
            renderMultiProjectTree();
            // Update content and summary fields without destroying the entire details view
            if (selectedNodeId) {
                const node = manager.findNodeById(selectedNodeId);
                if (node) {
                    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
                    const summaryTextArea = document.getElementById('node-summary') as HTMLTextAreaElement;
                    if (contentTextArea) contentTextArea.value = node.content;
                    if (summaryTextArea) summaryTextArea.value = node.summary;
                }
            }
        }
        
        // Clear progress bars and overlay if this operation failed
        if (!e.success) {
            updateProgressUI();
            hideGenerationOverlay();
        }
    };

    const handleError = (message: string) => {
        // Clear progress bars and hide overlay when an error occurs
        updateProgressUI();
        hideGenerationOverlay();
        alert(`An error occurred: ${message}`);
        renderProjectUI(manager);
    };
    
    const handleHighLevelProgress = (e: { nodeId: string; message: string; current: number; total: number }) => {
        // If message is empty, it means we should clear the progress
        if (!e.message || e.message.trim() === '') {
            updateProgressUI();
            hideGenerationOverlay();
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
            const summaryTextArea = getElementById('node-summary') as HTMLTextAreaElement;
            if (summaryTextArea) {
                summaryTextArea.value = e.summary;
            }
        }
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
    
    manager.on('nodeGenerationStarted', handleGenerationStarted);
    manager.on('nodeGenerationComplete', handleCompletion);
    manager.on('error', handleError);
    manager.on('high-level-progress', handleHighLevelProgress);
    manager.on('loop-progress', handleLoopProgress);
    manager.on('nodeSummaryGenerated', handleSummaryGenerated);
}


// --- Component Renders ---

function refreshGlobalProfileSelector() {
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
    const profileNames = settingsManager?.getProfileNames() || [];

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
            <div style="margin-top: 1rem;">
                <button id="delete-node-btn" class="button button-secondary" style="background-color: #dc3545; color: white; border-color: #dc3545;">
                    ${node.level === 0 ? 'Delete Project' : 'Delete Node'}
                </button>
            </div>
        </div>

        <div class="node-section generation-prompt-section">
            <div class="prompt-header">
                <label for="node-generation-prompt">Generation Prompt (use {{content}} to reference current node content)</label>
                <button id="default-prompt-btn" class="button button-secondary">Default</button>
            </div>
            <textarea id="node-generation-prompt" class="large-textarea" rows="8" placeholder="Enter a prompt here to generate content from scratch...">${node.generationPrompt || ''}</textarea>
            <div class="node-actions">
                <button id="node-generate-btn" class="button button-primary">Generate</button>
            </div>
        </div>

        <div class="node-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <label for="node-content">Content</label>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" id="show-ratings-checkbox" style="margin: 0;">
                    <label for="show-ratings-checkbox" style="font-weight: normal; font-size: 0.9rem; margin: 0;">Show ratings</label>
                </div>
            </div>
            <div id="content-display-area">
                <textarea id="node-content" class="large-textarea" rows="15" placeholder="Node content will be generated or can be written here...">${node.content || ''}</textarea>
                <div id="ratings-display" style="display: none;">
                    <!-- Ratings will be populated here -->
                </div>
            </div>
            <div class="node-actions">
                 <button id="node-summarize-btn" class="button button-secondary">Summarize</button>
            </div>
        </div>
        
        <div class="node-section">
            <label for="node-summary">Summary</label>
            <textarea id="node-summary" class="large-textarea" rows="5" placeholder="A summary of the content can be generated or written here.">${node.summary || ''}</textarea>
        </div>


    `;

    contentArea.appendChild(detailsContainer);

    // --- Populate and Set States (No Listeners Here!) ---
    const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
    const generateBtn = getElementById('node-generate-btn') as HTMLButtonElement;
    const defaultPromptBtn = getElementById('default-prompt-btn') as HTMLButtonElement;
    const summarizeBtn = getElementById('node-summarize-btn') as HTMLButtonElement;
    const showRatingsCheckbox = getElementById('show-ratings-checkbox') as HTMLInputElement;

    // Reset checkbox state when switching nodes
    if (showRatingsCheckbox) {
        showRatingsCheckbox.checked = false;
        // Ensure content view is shown by default
        toggleRatingsView(false);
    }

    if (!node.generationPrompt) {
        node.generationPrompt = projectManager.getRawGenerationPrompt(node);
        projectManager.saveToStorage().catch(console.error); // Persist the default prompt immediately
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

    // Disable buttons during any generation activity
    generateBtn.disabled = shouldDisableButtons;
    defaultPromptBtn.disabled = shouldDisableButtons;
    summarizeBtn.disabled = shouldDisableButtons;

    // Update button text to show current state
    if (isThisNodeGenerating) {
        generateBtn.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span> Generating...';
    } else if (isAnyNodeGenerating) {
        generateBtn.textContent = 'Generate (Another operation in progress)';
    } else {
        generateBtn.textContent = 'Generate';
    }

    // --- Add Branch-Specific Actions UI (Always include progress bars for consistency) ---
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'node-section';
    actionsContainer.innerHTML = `
        <div class="node-actions" style="display: flex; gap: 1rem; align-items: flex-start;">
            <!-- Progress bars on the left (always present) -->
            <div id="generation-progress-container" style="flex: 1; display: none; min-width: 300px;">
                <!-- Top Level: High-level operations -->
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
            
            <!-- Button on the right -->
            <div style="display: flex; flex-direction: column; min-width: 200px;">
                ${!node.isLeaf ? `
                    <button id="node-generate-all-btn" class="button" style="width: 100%;">Generate All Children</button>
                    <div style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem; font-size: 0.9rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <input type="checkbox" id="include-content-checkbox" checked>
                            <label for="include-content-checkbox" style="cursor: pointer; user-select: none;">Include content</label>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <input type="checkbox" id="recursive-checkbox">
                            <label for="recursive-checkbox" style="cursor: pointer; user-select: none;">Recursive</label>
                        </div>
                    </div>
                ` : ''}
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
            </style>
        </div>
    `;

    // Always add the actions container (with progress bars), regardless of node type
    detailsContainer.appendChild(actionsContainer);

    // Set up button tooltips only if the button exists (non-leaf nodes)
    if (!node.isLeaf) {
        const generateAllBtn = actionsContainer.querySelector('#node-generate-all-btn') as HTMLButtonElement;
        if (generateAllBtn) {
            // Never disable the button, but update tooltip to reflect current state
            if (shouldDisableButtons) {
                generateAllBtn.title = "Another operation is in progress. Clicking will show a message.";
            } else if (!node.content || node.content.trim() === '') {
                generateAllBtn.title = "This node has no content. Clicking will show instructions.";
            } else {
                generateAllBtn.title = "Creates children from outline (if needed). Use 'Include content' to generate content and 'Recursive' to generate down to max hierarchy level.";
            }
        }
    }
}

function showButtonSpinner(button: HTMLButtonElement, text: string = 'Working...') {
    button.disabled = true;
    const originalWidth = button.offsetWidth;
    // Lock the width to prevent the layout from shifting when the text changes.
    button.style.width = `${originalWidth}px`; 
    button.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span> ${text}`;
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
    
    const chosenIteration = node.getChosenIteration();
    
    if (!chosenIteration || !chosenIteration.ratings || chosenIteration.ratings.length === 0) {
        ratingsDisplay.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #6c757d; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                <h4 style="margin: 0 0 0.5rem 0; color: #495057;">No Ratings Available</h4>
                <p style="margin: 0; font-size: 0.9rem;">This content doesn't have any quality ratings yet. Ratings are created when content is generated through the AI system.</p>
            </div>
        `;
        return;
    }
    
    const ratings = chosenIteration.ratings;
    const maxScore = Math.max(...ratings.map(r => Math.max(r.score, r.goal)), 10); // Ensure minimum scale of 10
    
    let ratingsHtml = `
        <div style="padding: 1.5rem; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h4 style="margin: 0 0 1rem 0; color: #495057;">Quality Ratings for Final Content</h4>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
    `;
    
    ratings.forEach(rating => {
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
                Generated on: ${new Date(chosenIteration.timestamp).toLocaleString()}
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

export function setupEventListeners() {
    const mainContent = getElementById('main-content');

    mainContent.addEventListener('click', (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;

        const button = e.target.closest('button');
        if (!button) return;

        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;

        switch (button.id) {
            case 'delete-node-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

                    if (node.level === 0) {
                        // This is a project root node - delete the entire project
                        const projects = state.getProjects();
                        
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
                                        // Save the updated project list (this will exclude the deleted project)
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
                
            case 'node-generate-btn':
                // Prevent concurrent operations
                if (projectManager.isAnyNodeGenerating()) {
                    alert('Another generation operation is already in progress. Please wait for it to complete.');
                    return;
                }
                const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
                node.generationPrompt = generationPromptTextArea.value;
                
                // Show overlay and progress bars immediately to provide instant feedback
                showGenerationOverlay();
                updateProgressUI({
                    operations: { message: 'Preparing content generation...', current: 0, total: 1 }
                });
                
                projectManager.generateNodeContent(node.id);
                break;
            
            case 'default-prompt-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

                    const rawPrompt = projectManager.getRawGenerationPrompt(node);
                    const promptTextarea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
                    
                    node.generationPrompt = rawPrompt;
                    if (promptTextarea) {
                        promptTextarea.value = rawPrompt;
                    }
                    projectManager.saveToStorage().catch(console.error);
                }
                break;

            case 'node-summarize-btn':
                // Prevent concurrent operations
                if (projectManager.isAnyNodeGenerating()) {
                    alert('Another generation operation is already in progress. Please wait for it to complete.');
                    return;
                }
                
                // Show overlay and progress bars immediately to provide instant feedback
                showGenerationOverlay();
                updateProgressUI({
                    operations: { message: 'Preparing summarization...', current: 0, total: 1 }
                });
                
                projectManager.summarizeNodeContent(node.id);
                break;

            case 'node-generate-all-btn':
                // Check for concurrent operations
                if (projectManager.isAnyNodeGenerating()) {
                    alert('Another generation operation is already in progress. Please wait for it to complete.');
                    return;
                }
                
                // Check if node has content
                if (!node.content || node.content.trim() === '') {
                    alert('This node has no content. Please write or generate content for this node first.\n\nThe content should be an outline or description that can be used to create child nodes.');
                    return;
                }
                
                // Check if the "Include content" checkbox is checked
                const includeContentCheckbox = document.getElementById('include-content-checkbox') as HTMLInputElement;
                const includeContent = includeContentCheckbox ? includeContentCheckbox.checked : true;
                
                // Check if the "Recursive" checkbox is checked
                const recursiveCheckbox = document.getElementById('recursive-checkbox') as HTMLInputElement;
                const recursive = recursiveCheckbox ? recursiveCheckbox.checked : false;
                
                // Don't show overlay for generate all children since parent node isn't changing
                // Just show progress bars to indicate the operation is starting
                let operationMessage = 'Preparing to create child structure...';
                if (includeContent && recursive) {
                    operationMessage = 'Preparing to recursively generate all content...';
                } else if (includeContent) {
                    operationMessage = 'Preparing to generate all children...';
                } else if (recursive) {
                    operationMessage = 'Preparing to recursively create structure...';
                }
                
                updateProgressUI({
                    operations: { message: operationMessage, current: 0, total: 1 }
                });
        
                projectManager.generateAllChildrenContent(node.id, includeContent, recursive);
                break;
        }
    });

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

    mainContent.addEventListener('click', (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;

        if (e.target.id === 'open-reader-btn') {
            if (!projectManager) {
                alert('No project is currently loaded.');
                return;
            }
            
            // Open reader view with navigation callback
            openReaderView(projectManager, (nodeId: string) => {
                // Navigate to the node in the main editor
                selectedNodeId = nodeId;
                if (projectManager) {
                    renderProjectUI(projectManager);
                }
                // Close reader view after navigation
                const readerContainer = document.getElementById('reader-container');
                if (readerContainer) {
                    readerContainer.style.display = 'none';
                }
            }).catch(error => {
                console.error('Failed to open reader view:', error);
                alert('Failed to open reader view. Please try again.');
            });
        }
    });

     mainContent.addEventListener('input', (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;

        if (e.target.id === 'node-generation-prompt') {
            node.generationPrompt = (e.target as HTMLTextAreaElement).value;
            projectManager.saveToStorage().catch(console.error);
        } else if (e.target.id === 'node-content') {
            const textarea = e.target as HTMLTextAreaElement;
            node.content = textarea.value;
            projectManager.saveToStorage().catch(console.error);
        } else if (e.target.id === 'node-summary') {
            node.summary = (e.target as HTMLTextAreaElement).value;
            projectManager.saveToStorage().catch(console.error);
        }
    });

    mainContent.addEventListener('blur', (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        if (e.target.id === 'node-title-display') {
            node.title = (e.target as HTMLElement).textContent || '';
            projectManager.saveToStorage().catch(console.error);
            renderTree(); // Re-render tree to show new title
        }
    }, true); // Use capture phase to ensure it fires
}

export function initializeProjectUI(manager?: ProjectManager) {
    const activeProject = manager || state.getActiveProject();
    projectManager = activeProject;
    
    if (activeProject) {
        selectedNodeId = activeProject.rootNode.id;
    }
    
    loadCollapsedState().catch(console.error); // Load the collapsed state from storage

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
    
    // Render node details if we have a selected node
    if (selectedNodeId) {
        renderNodeDetails();
    } else {
        const nodeDetails = getElementById('node-details');
        nodeDetails.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;">Select a node to view details.</div>';
    }
}

function createNodeElement(node: DocumentNode): HTMLLIElement {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = node.title;
    span.dataset.id = node.id;

    if (node.id === selectedNodeId) {
        span.classList.add('active');
    }

    span.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedNodeId = node.id;
        renderNodeDetails();
        
        // Update active class on all spans
        document.querySelectorAll('#project-tree span').forEach(s => s.classList.remove('active'));
        span.classList.add('active');
    });

    li.appendChild(span);

    if (node.children && node.children.length > 0) {
        const ul = document.createElement('ul');
        node.children.forEach(child => {
            const childLi = createNodeElement(child);
            ul.appendChild(childLi);
        });
        li.appendChild(ul);
    }

    return li;
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