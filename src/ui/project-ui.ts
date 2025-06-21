import { ProjectManager } from '../ProjectManager';
import { DocumentNode } from '../DocumentNode';
import { getElementById } from './dom-elements';
import * as state from '../state';
import { LoopProgress, RaterProgressPayload } from '../LoopOrchestrator';

let projectManager: ProjectManager | null = null;
let selectedNodeId: string | null = null;

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

    renderTree();
    renderNodeDetails();
}

// --- Event Listener Setup ---

function setupProjectManagerListeners(manager: ProjectManager) {
    const handleCompletion = () => {
        renderProjectUI(manager);
    };

    const handleError = (message: string) => {
        alert(`An error occurred: ${message}`);
        renderProjectUI(manager);
    };
    
    const handleHighLevelProgress = (e: { nodeId: string; message: string; current: number; total: number }) => {
        if (e.nodeId === selectedNodeId) {
            updateProgressUI({
                highLevel: { message: e.message, current: e.current, total: e.total }
            });
        }
    };

    const handleLoopProgress = (e: { nodeId: string; progress: LoopProgress }) => {
        if (e.nodeId === selectedNodeId) {
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
                iteration: iterationProgress,
                stage: stageProgress,
                detail: detailText,
            });
        }
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
    manager._completionListener = handleCompletion;
    // @ts-ignore
    manager._errorListener = handleError;
    // @ts-ignore
    manager._highLevelProgressListener = handleHighLevelProgress;
    // @ts-ignore
    manager._loopProgressListener = handleLoopProgress;
    // @ts-ignore
    manager._summaryGeneratedListener = handleSummaryGenerated;
    
    manager.on('nodeGenerationComplete', handleCompletion);
    manager.on('error', handleError);
    manager.on('high-level-progress', handleHighLevelProgress);
    manager.on('loop-progress', handleLoopProgress);
    manager.on('nodeSummaryGenerated', handleSummaryGenerated);
}


// --- Component Renders ---

function renderTree() {
    if (!projectManager) return;
    const treeContainer = getElementById('project-tree');
    treeContainer.innerHTML = buildTreeHtml(projectManager.rootNode);

    // Attach event listeners
    treeContainer.querySelectorAll('.tree-node').forEach(el => {
        el.addEventListener('click', (e) => {
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
    
    const settingsManager = state.getSettingsManager();
    const profileNames = settingsManager?.getProfileNames() || [];
    const profileOptions = profileNames.map(name => `<option value="${name}" ${node.settingsProfileName === name ? 'selected' : ''}>${name}</option>`).join('');

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
        </div>

        <div class="node-section generation-prompt-section">
            <div class="prompt-header">
                <label for="node-generation-prompt">Generation Prompt</label>
                <button id="default-prompt-btn" class="button button-secondary">Default</button>
            </div>
            <textarea id="node-generation-prompt" class="large-textarea" rows="8" placeholder="Enter a prompt here to generate content from scratch...">${node.generationPrompt || ''}</textarea>
            <div class="node-actions settings-bar">
                <label for="node-generation-settings">Profile:</label>
                <select id="node-generation-settings">${profileOptions}</select>
                <button id="node-generate-btn" class="button button-primary">Generate</button>
            </div>
        </div>

        <div class="node-section">
            <label for="node-content">Content</label>
            <textarea id="node-content" class="large-textarea" rows="15" placeholder="Node content will be generated or can be written here...">${node.content || ''}</textarea>
            <div class="node-actions">
                 <button id="node-summarize-btn" class="button button-secondary">Summarize</button>
            </div>
        </div>
        
        <div class="node-section">
            <label for="node-summary">Summary</label>
            <textarea id="node-summary" class="large-textarea" rows="5" placeholder="A summary of the content can be generated or written here.">${node.summary || ''}</textarea>
        </div>

        <div id="generation-progress-container" class="node-section">
            <label>Progress</label>
            <div id="progress-text-high-level"></div>
            <progress id="progress-bar-high-level" value="0" max="100" style="width: 100%;"></progress>
            
            <div id="progress-text-iteration" style="margin-top: 1rem;"></div>
            <progress id="progress-bar-iteration" value="0" max="100" style="width: 100%;"></progress>

            <div id="progress-text-stage" style="margin-top: 1rem;"></div>
            <progress id="progress-bar-stage" value="0" max="100" style="width: 100%;"></progress>
            
            <div id="progress-text-detail" style="font-style: italic; color: #6c757d; margin-top: 1rem;"></div>
        </div>
    `;

    contentArea.appendChild(detailsContainer);
    
    // Hide progress container by default, it will be shown by events
    updateProgressUI();

    // --- Populate and Set States (No Listeners Here!) ---
    const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
    const generateBtn = getElementById('node-generate-btn') as HTMLButtonElement;
    const defaultPromptBtn = getElementById('default-prompt-btn') as HTMLButtonElement;

    generationPromptTextArea.value = node.generationPrompt || '';
    if (node.isPromptGenerating) {
        generationPromptTextArea.placeholder = "Generating detailed prompt...";
        generateBtn.disabled = true;
    } else {
        if (!node.generationPrompt) {
            generationPromptTextArea.placeholder = "A detailed prompt was not generated. You can write one here or try expanding the parent node again.";
        } else {
            generationPromptTextArea.placeholder = "The prompt for generating content. You can edit it here.";
        }
        generateBtn.disabled = false;
    }

    // --- Add Branch-Specific Actions UI ---
    if (!node.isLeaf) {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'node-section';
        actionsContainer.innerHTML = `
            <div class="node-actions settings-bar">
                <button id="node-create-children-btn" class="button">Create Children from Outline</button>
                <button id="node-generate-all-btn" class="button">Generate All Children</button>
            </div>
        `;

        const createChildrenBtn = actionsContainer.querySelector('#node-create-children-btn') as HTMLButtonElement;
        const generateAllBtn = actionsContainer.querySelector('#node-generate-all-btn') as HTMLButtonElement;

        if (node.children.length === 0) {
            generateAllBtn.disabled = true;
            generateAllBtn.title = "This node has no children to generate content for. Use 'Create Children from Outline' first.";
        }
        
        detailsContainer.appendChild(actionsContainer);
    }
}

function showButtonSpinner(button: HTMLButtonElement, text: string = 'Working...') {
    button.disabled = true;
    const originalWidth = button.offsetWidth;
    // Lock the width to prevent the layout from shifting when the text changes.
    button.style.width = `${originalWidth}px`; 
    button.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span> ${text}`;
}

// --- Helper Functions ---

function buildTreeHtml(node: DocumentNode): string {
    const isSelected = node.id === selectedNodeId;
    let html = `<div style="padding-left: ${node.level * 20}px;">`;
    html += `<div class="tree-node ${isSelected ? 'selected' : ''}" data-id="${node.id}">
                ${node.title} ${node.isGenerating ? '<span class="spinner" style="width:12px; height:12px; border-width: 2px;"></span>' : ''}
             </div>`;
    
    if (node.children.length > 0) {
        node.children.forEach(child => {
            html += buildTreeHtml(child);
        });
    }

    html += `</div>`;
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
            case 'node-generate-btn':
                const generationSettingsSelect = getElementById('node-generation-settings') as HTMLSelectElement;
                const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
                node.generationPrompt = generationPromptTextArea.value;
                node.settingsProfileName = generationSettingsSelect.value;
                projectManager.generateNodeContent(node.id);
                break;
            
            case 'default-prompt-btn':
                {
                    if (!projectManager || !selectedNodeId) return;
                    const node = projectManager.findNodeById(selectedNodeId);
                    if (!node) return;

                    const defaultPrompt = projectManager.constructGenerationPrompt(node.id);
                    const promptTextarea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
                    
                    node.generationPrompt = defaultPrompt;
                    if (promptTextarea) {
                        promptTextarea.value = defaultPrompt;
                    }
                    projectManager.saveToLocalStorage();
                }
                break;

            case 'node-summarize-btn':
                projectManager.summarizeNodeContent(node.id);
                break;

            case 'node-create-children-btn':
                if (!node.content || !node.content.trim()) {
                    alert("The node's content is empty. Please write or generate an outline in the 'Content' area before creating children.");
                    return;
                }
                console.log(`'Create Children from Outline' button clicked for node ${node.id}.`);
                projectManager.createChildrenFromOutline(node.id);
                break;

            case 'node-generate-all-btn':
                console.log(`'Generate All Children' button clicked for node ${node.id}.`);
                projectManager.generateAllChildrenContent(node.id);
                break;
        }
    });

     mainContent.addEventListener('input', (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;

        if (e.target.id === 'node-generation-prompt') {
            node.generationPrompt = (e.target as HTMLTextAreaElement).value;
            projectManager.saveToLocalStorage();
        } else if (e.target.id === 'node-content') {
            const textarea = e.target as HTMLTextAreaElement;
            node.content = textarea.value;
            projectManager.saveToLocalStorage();
        } else if (e.target.id === 'node-summary') {
            node.summary = (e.target as HTMLTextAreaElement).value;
            projectManager.saveToLocalStorage();
        }
    });

    mainContent.addEventListener('blur', (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        if (e.target.id === 'node-title-display') {
            node.title = (e.target as HTMLElement).textContent || '';
            projectManager.saveToLocalStorage();
            renderTree(); // Re-render tree to show new title
        }
    }, true); // Use capture phase to ensure it fires
}

export function initializeProjectUI(manager: ProjectManager) {
    projectManager = manager;
    selectedNodeId = manager.rootNode.id;

    const mainContent = getElementById('main-content');
    mainContent.innerHTML = `
        <style>
            #project-container { display: flex; gap: 1rem; align-items: flex-start; }
            #project-tree { flex: 1; max-width: 400px; }
            #node-details { flex: 2; }
            .tree-node { padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; }
            .tree-node.selected { background-color: var(--primary-color); color: white; }
            .tree-node:hover:not(.selected) { background-color: #e9ecef; }
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
        <div id="project-container">
            <div id="project-tree"></div>
            <div id="node-details"></div>
        </div>
    `;
    
    setupProjectManagerListeners(manager);
    renderProjectUI(manager);
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
    highLevel?: ProgressInfo;
    iteration?: ProgressInfo;
    stage?: ProgressInfo;
    detail?: string;
}

function updateProgressUI(data?: ProgressUIData) {
    const container = document.getElementById('generation-progress-container');
    if (!container) return;

    const hlText = getElementById('progress-text-high-level');
    const hlBar = getElementById('progress-bar-high-level') as HTMLProgressElement;
    const iterText = getElementById('progress-text-iteration');
    const iterBar = getElementById('progress-bar-iteration') as HTMLProgressElement;
    const stageText = getElementById('progress-text-stage');
    const stageBar = getElementById('progress-bar-stage') as HTMLProgressElement;
    const detailText = getElementById('progress-text-detail');
    
    if (!data) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';

    // Update High-Level Progress
    if (data.highLevel) {
        hlText.textContent = data.highLevel.message;
        hlBar.value = data.highLevel.current;
        hlBar.max = data.highLevel.total;
        hlText.style.display = 'block';
        hlBar.style.display = 'block';
    } else {
        hlText.style.display = 'none';
        hlBar.style.display = 'none';
    }

    // Update Iteration Progress
    if (data.iteration) {
        iterText.textContent = data.iteration.message;
        iterBar.value = data.iteration.current;
        iterBar.max = data.iteration.total;
        iterText.style.display = 'block';
        iterBar.style.display = 'block';
    } else {
        iterText.style.display = 'none';
        iterBar.style.display = 'none';
    }

    // Update Stage Progress
    if (data.stage) {
        stageText.textContent = data.stage.message;
        stageBar.value = data.stage.current;
        stageBar.max = data.stage.total;
        stageText.style.display = 'block';
        stageBar.style.display = 'block';
    } else {
        stageText.style.display = 'none';
        stageBar.style.display = 'none';
    }

    // Update Detail Text
    detailText.textContent = data.detail || '';
    detailText.style.display = data.detail ? 'block' : 'none';
} 