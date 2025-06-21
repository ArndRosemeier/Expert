import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator, type LoopInput, type QualityCriterion, type Rating, type LoopHistoryItem } from './LoopOrchestrator';
import { PromptManager, defaultPrompts, type OrchestratorPrompts } from './PromptManager';
import { SettingsManager, type SettingsProfile } from './SettingsManager';
import { DocumentNode } from './DocumentNode';
import { TestRunner, type TestResult } from './TestRunner';
import { ProjectManager } from './ProjectManager';
import { ProjectTemplate } from './ProjectTemplate';

// --- Fresh Start Debug Logic ---
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('clean') === 'true') {
    console.log('Clean start requested. Clearing local storage...');
    localStorage.removeItem('openrouter_api_key');
    localStorage.removeItem('openrouter_model_purposes');
    localStorage.removeItem('expert_app_prompts');
    localStorage.removeItem('expert_app_settings_profiles');
    localStorage.removeItem('expert_app_settings_last_profile');
    localStorage.removeItem('expert_app_current_project');
    
    // Redirect to the same page without the query parameter
    window.location.href = window.location.pathname;
}

// --- Payload Interfaces (Workaround) ---
export interface CreatorPayload {
    prompt: string;
    response: string;
}
export interface RatingPayload {
    ratings: Rating[];
}
export interface EditorPayload {
    prompt:string;
    advice: string;
}

// --- Type-Safe DOM Access ---
function getElementById<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Could not find element with id: ${id}`);
    }
    return element as T;
}

// --- DOM Elements ---
const mainAppContainer = getElementById<HTMLElement>('main-app');
const settingsBtn = getElementById<HTMLButtonElement>('settingsBtn');
const modalContainer = getElementById<HTMLElement>('modal-container');
const modalContent = getElementById<HTMLElement>('modal-content');
const testModalContainer = getElementById<HTMLElement>('test-modal-container');
const testModalContent = getElementById<HTMLElement>('test-modal-content');
const runTestsBtn = getElementById<HTMLButtonElement>('runTestsBtn');
const newProjectBtn = getElementById<HTMLButtonElement>('newProjectBtn');
const newProjectModalContainer = getElementById<HTMLElement>('new-project-modal-container');
const newProjectModalContent = getElementById<HTMLElement>('new-project-modal-content');


if (!mainAppContainer || !settingsBtn || !modalContainer || !modalContent || !testModalContainer || !testModalContent || !runTestsBtn || !newProjectBtn || !newProjectModalContainer || !newProjectModalContent) {
    throw new Error('Could not find required DOM elements');
}

// --- State ---
let openRouterClient: OpenRouterClient | null = null;
let modelSelector: ModelSelector | null = null;
let selectedModels: Record<string, string> = {};
let orchestrator: LoopOrchestrator | null = null;
let settingsManager: SettingsManager | null = null;
let orchestratorPrompts: OrchestratorPrompts = { ...defaultPrompts };
let loopHistory: LoopHistoryItem[] = [];
let viewedIteration = 0;
let isAppRendered = false;
let currentProject: ProjectManager | null = null;

// --- Hardcoded Project Templates ---
const novelTemplate = new ProjectTemplate(
    "Standard Novel",
    ['Book', 'Act', 'Chapter'],
    ['Main Outline', 'Character Bios']
);

const manualTemplate = new ProjectTemplate(
    "Technical Manual",
    ['Manual', 'Section', 'Topic'],
    ['Glossary']
);

const projectTemplates: Record<string, ProjectTemplate> = {
    "novel": novelTemplate,
    "manual": manualTemplate,
};


const defaultProseCriteria: QualityCriterion[] = [
    { name: "Clarity & Conciseness. The writing is direct, easy to understand, and avoids unnecessary words or filler phrases.", goal: 8 },
    { name: "Natural & Authentic Tone. The language sounds human and authentic. It avoids being overly formal, academic, or robotic.", goal: 9 },
    { name: "Engaging Flow. The text is interesting and holds the reader's attention. Sentences and paragraphs transition smoothly.", goal: 8 },
    { name: "Varied Sentence Structure. The length and structure of sentences are varied to create a pleasing rhythm, avoiding monotony.", goal: 7 },
    { name: "Subtlety (Show, Don't Tell). The writing implies emotions and ideas through description and action rather than stating them directly. It avoids being on-the-nose.", goal: 8 },
    { name: "Avoids AI Clichés. The text avoids common AI phrases like 'In conclusion,' 'It's important to note,' 'delve into,' or 'tapestry of...'", goal: 9 },
    { name: "Understated Language. The prose avoids overly dramatic, sensational, or grandiose language. The tone is measured and appropriate.", goal: 9 },
    { name: "Specificity & Concrete Detail. The writing uses specific, concrete details and examples rather than vague generalities.", goal: 8 },
    { name: "Original Phrasing. The text avoids common idioms and clichés, opting for more original ways to express ideas.", goal: 7 },
    { name: "Human-like Naming. When applicable, any names for people, places, or concepts are creative and feel natural. Avoid common AI-generated names like 'Elara' or 'Lyra.'", goal: 8 }
];

// --- Functions ---
function openModal() {
    if (modalContainer) {
        renderSettingsModal();
        modalContainer.style.display = 'flex';
    }
}

function closeModal() {
    if (modalContainer) {
        modalContainer.style.display = 'none';
    }
}

function openTestModal() {
    if (testModalContainer) {
        testModalContainer.style.display = 'flex';
    }
}

function closeTestModal() {
    if (testModalContainer) {
        testModalContainer.style.display = 'none';
    }
}

function openNewProjectModal() {
    renderNewProjectModal();
    if (newProjectModalContainer) {
        newProjectModalContainer.style.display = 'flex';
    }
}

function closeNewProjectModal() {
    if (newProjectModalContainer) {
        newProjectModalContainer.style.display = 'none';
    }
}

function renderNewProjectModal() {
    newProjectModalContent.innerHTML = `
        <h2>Create New Project</h2>
        <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="project-title-input">Project Title</label>
            <input type="text" id="project-title-input" placeholder="e.g., 'My Sci-Fi Epic'">
        </div>
        <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="project-template-select">Project Template</label>
            <select id="project-template-select">
                <option value="novel">Standard Novel</option>
                <option value="manual">Technical Manual</option>
            </select>
        </div>
        <div class="button-group" style="display: flex; justify-content: flex-end; gap: 1rem;">
            <button id="cancel-create-project-btn" class="button button-secondary">Cancel</button>
            <button id="confirm-create-project-btn" class="button button-primary">Create</button>
        </div>
    `;

    getElementById('confirm-create-project-btn').addEventListener('click', () => {
        const title = getElementById<HTMLInputElement>('project-title-input').value;
        const templateKey = getElementById<HTMLSelectElement>('project-template-select').value;
        const template = projectTemplates[templateKey];

        if (!title.trim()) {
            alert('Project Title cannot be empty.');
            return;
        }

        if (!template) {
            alert('Invalid project template selected.');
            return;
        }

        try {
            if (!orchestrator || !settingsManager) {
                alert("Core services not configured. Cannot create project.");
                return;
            }
            const project = new ProjectManager(title, template, orchestrator, settingsManager);
            const projectJson = project.save();
            localStorage.setItem('expert_app_current_project', projectJson); 
            console.log('Project saved:', project.projectTitle);
            currentProject = project;
            
            closeNewProjectModal();
            renderProjectUI(project);
        } catch (error) {
            console.error("Failed to create or save project:", error);
            alert("An error occurred while creating the project. See console for details.");
        }
    });

    getElementById('cancel-create-project-btn').addEventListener('click', closeNewProjectModal);
}

function reconfigureCoreServices(models: Record<string, string>) {
    console.log('Reconfiguring core services with models:', models);
    selectedModels = models;

    const apiKey = modelSelector?.getApiKey();
    if (apiKey) {
        const client = new OpenRouterClient(apiKey, selectedModels);
        orchestrator = new LoopOrchestrator(client, orchestratorPrompts);
        console.log('OpenRouter client and Orchestrator configured.');
    }
}

function onModelsSelected(models: Record<string, string>) {
    reconfigureCoreServices(models);
    
    closeModal();
    if (!isAppRendered) {
        // If settings are complete for the first time, decide what to render.
        const savedProjectJson = localStorage.getItem('expert_app_current_project');
        if (savedProjectJson) {
            try {
                if (!orchestrator || !settingsManager) {
                    throw new Error("Orchestrator not available to load project.");
                }
                currentProject = ProjectManager.load(savedProjectJson, orchestrator, settingsManager);
                console.log('Loaded project from storage:', currentProject.projectTitle);
                renderProjectUI(currentProject);
            } catch (e) {
                console.error("Failed to load project, starting fresh.", e);
                localStorage.removeItem('expert_app_current_project');
                renderMainApp();
            }
        } else {
            renderMainApp();
        }
        isAppRendered = true;
    }
}

function onPromptsSaved(prompts: OrchestratorPrompts) {
    orchestratorPrompts = prompts;
    if (openRouterClient) {
        orchestrator = new LoopOrchestrator(openRouterClient, orchestratorPrompts);
    }
    // This function is no longer needed as the prompt modal is removed
    // closePromptModal();
}

function renderProjectUI(project: ProjectManager) {
    mainAppContainer.innerHTML = `
        <style>
            .project-grid {
                display: grid;
                grid-template-columns: 300px 1fr;
                gap: 2rem;
                height: calc(100vh - 120px); /* Adjust for header height */
            }
            .tree-panel, .detail-panel {
                background-color: white;
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06);
                overflow-y: auto;
            }
            .tree-panel h2, .detail-panel h2 {
                margin-top: 0;
                font-size: 1.25rem;
                border-bottom: 1px solid var(--border-color);
                padding-bottom: 0.75rem;
                margin-bottom: 1rem;
            }
            .project-tree-list, .project-tree-list ul {
                list-style: none;
                padding-left: 1rem;
            }
            .project-tree-list li {
                padding: 0.25rem 0.5rem;
                border-radius: 4px;
                cursor: pointer;
            }
            .project-tree-list li:hover {
                background-color: var(--bg-subtle);
            }
            .selected-node {
                background-color: var(--primary-color) !important;
                color: white;
            }
            .node-settings-bar {
                display: flex;
                gap: 1rem;
                align-items: flex-end;
                margin-bottom: 1rem;
            }
            .node-settings-bar .form-group {
                flex-grow: 1;
            }
            .criterion > .criterion-text-display {
                flex-grow: 1;
                padding: 0.75rem 0.5rem;
                cursor: text;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                border: 1px solid transparent;
            }
            .large-textarea {
                width: 100%;
                min-height: 120px;
                resize: vertical;
            }
            .node-content {
                background-color: var(--bg-subtle);
                padding: 1rem;
                border-radius: 8px;
                min-height: 100px;
                white-space: pre-wrap;
            }
        </style>
        <div class="project-grid">
            <div id="project-tree-container" class="tree-panel">
                <h2>${project.projectTitle}</h2>
                <div id="project-tree"></div>
            </div>
            <div id="project-detail-container" class="detail-panel">
                <h2>Details</h2>
                <div id="project-details">Select a node to see its details.</div>
            </div>
        </div>
    `;

    // Render the actual tree structure (will be implemented next)
    const treeContainer = getElementById('project-tree');
    renderProjectTree(project.rootNode, treeContainer);

    treeContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'LI') {
            const nodeId = target.dataset.nodeId;
            if (nodeId) {
                // Clear previous selection
                document.querySelectorAll('.project-tree-list .selected-node').forEach(el => {
                    el.classList.remove('selected-node');
                });
                // Add new selection
                target.classList.add('selected-node');
                renderNodeDetails(project, nodeId);
            }
        }
    });
}

function renderNodeDetails(project: ProjectManager, nodeId: string) {
    const node = project.findNodeById(nodeId);
    if (!node) {
        getElementById('project-details').innerHTML = 'Node not found.';
        return;
    }

    const detailsContainer = getElementById('project-details');
    const profileNames = settingsManager?.getProfileNames() || [];
    
    // Create dropdown options
    const profileOptions = profileNames.map(name => 
        `<option value="${name}" ${name === node.settingsProfileName ? 'selected' : ''}>${name}</option>`
    ).join('');

    detailsContainer.innerHTML = `
        <h3>${node.title}</h3>
        <div class="node-settings-bar">
            <div class="form-group">
                <label for="node-profile-select">Generation Profile</label>
                <select id="node-profile-select">
                    ${profileOptions}
                </select>
            </div>
            <button id="manage-profiles-btn" class="button button-secondary">Manage Profiles</button>
        </div>
        <div>
            <label for="node-prompt">Generation Prompt:</label>
            <textarea id="node-prompt" class="large-textarea" placeholder="Enter the prompt for generating this node's content...">${node.prompt}</textarea>
        </div>
        <div style="margin-top: 1.5rem;">
            <button id="generate-node-btn" class="button button-primary">Generate</button>
        </div>
        <hr>
        <h4>Generated Content:</h4>
        <div id="node-content-display" class="node-content">${node.content.replace(/\\n/g, '<br>')}</div>
    `;
    
    // --- Event Listeners for the new UI ---
    
    getElementById('manage-profiles-btn').addEventListener('click', openModal);

    const profileSelect = getElementById<HTMLSelectElement>('node-profile-select');
    profileSelect.addEventListener('change', () => {
        node.settingsProfileName = profileSelect.value;
        // Maybe save the project here implicitly? For now, it's just in memory.
        console.log(`Node ${node.id} profile changed to: ${node.settingsProfileName}`);
    });

    getElementById('generate-node-btn').addEventListener('click', () => {
        const promptText = getElementById<HTMLTextAreaElement>('node-prompt').value;
        
        if (!promptText) {
            alert('Please enter a prompt.');
            return;
        }
        
        const generateBtn = getElementById<HTMLButtonElement>('generate-node-btn');
        const contentDisplay = getElementById<HTMLDivElement>('node-content-display');

        // --- Event-driven UI updates ---
        const onProgress = (payload: { nodeId: string, content: string }) => {
            if (payload.nodeId === nodeId) {
                contentDisplay.innerHTML = payload.content.replace(/\\n/g, '<br>');
            }
        };

        const onComplete = (payload: { nodeId: string, success: boolean, node?: DocumentNode, error?: any }) => {
            if (payload.nodeId === nodeId) {
                generateBtn.textContent = 'Generate';
                generateBtn.removeAttribute('disabled');
                
                if (!payload.success) {
                    console.error("Generation failed:", payload.error);
                    alert(`Failed to generate content: ${payload.error}`);
                }
                
                // Clean up listeners
                project.off('nodeGenerationProgress', onProgress);
                project.off('nodeGenerationComplete', onComplete);
            }
        };

        project.on('nodeGenerationProgress', onProgress);
        project.on('nodeGenerationComplete', onComplete);

        generateBtn.textContent = 'Generating...';
        generateBtn.setAttribute('disabled', 'true');
        
        // This now runs in the background and communicates via events
        project.generateNodeContent(nodeId, promptText);
    });
}

function renderProjectTree(rootNode: DocumentNode, container: HTMLElement) {
    container.innerHTML = ''; // Clear previous tree
    const tree = document.createElement('ul');
    tree.className = 'project-tree-list';

    function buildTree(node: DocumentNode, parentElement: HTMLElement) {
        const listItem = document.createElement('li');
        listItem.textContent = node.title;
        listItem.dataset.nodeId = String(node.id);
        
        if (node.children.length > 0) {
            const childrenList = document.createElement('ul');
            node.children.forEach(child => buildTree(child, childrenList));
            listItem.appendChild(childrenList);
        }
        
        parentElement.appendChild(listItem);
    }

    buildTree(rootNode, tree);
    container.appendChild(tree);
}

function renderMainApp() {
    mainAppContainer.innerHTML = `
        <style>
            .grid-container {
                display: grid;
                grid-template-columns: 1fr 2fr;
                gap: 2rem;
            }

            .control-panel {
                background-color: white;
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06);
            }

            .results-panel {
                background-color: transparent;
            }

            h2, h3 {
                font-weight: 600;
                color: #111827;
                margin-top: 0;
            }
            h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1.5rem; }
            h3 { font-size: 1.125rem; margin-bottom: 1rem; }

            label {
                font-weight: 500;
                margin-bottom: 0.5rem;
                display: block;
            }

            input[type="text"], input[type="number"], textarea, select {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                transition: border-color 0.2s, box-shadow 0.2s;
                box-sizing: border-box;
            }
            input[type="text"]:focus, input[type="number"]:focus, textarea:focus, select:focus {
                outline: none;
                border-color: var(--primary-color);
                box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
            }
            textarea#prompt {
                min-height: 150px;
                resize: vertical;
            }
            .criterion textarea {
                flex-grow: 1;
                resize: none;
                overflow-y: hidden;
                line-height: 1.5;
                padding-top: 0.6rem;
                padding-bottom: 0.6rem;
            }

            .criterion { display: flex; gap: 0.75rem; margin-bottom: 0.75rem; align-items: center !important; }
            .criterion input[type="number"] { max-width: 80px; }

            .remove-criterion-btn {
                background: none;
                border: none;
                color: var(--secondary-color);
                font-size: 1.25rem;
                padding: 0.25rem;
                line-height: 1;
            }
            .remove-criterion-btn:hover { color: #dc2626; }

            .settings-bar { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; align-items: center; }
            .settings-bar input { flex-grow: 1; }
            
            .criteria-actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
            
            hr { border: none; border-top: 1px solid var(--border-color); margin: 1.5rem 0; }

            .response-block {
                padding: 1.5rem;
                border-radius: 12px;
                margin-top: 1rem;
                border: 1px solid;
                box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);
            }
            .response-block h3 { margin-top: 0; }
            .response-block pre { white-space: pre-wrap; word-break: break-all; background-color: var(--bg-subtle); padding: 1rem; border-radius: 8px; }

            .response-creator { background-color: #eff6ff; border-color: #bfdbfe; }
            .response-rater { background-color: #fefce8; border-color: #fde68a; }
            .response-editor { background-color: #faf5ff; border-color: #e9d5ff; }
            
            #final-result-container { margin-top: 1rem; }

            #history-controls {
                display: none; /* Hidden by default */
                padding: 1rem;
                background-color: var(--bg-subtle);
                border-radius: 12px;
                margin-top: 1rem;
                border: 1px solid var(--border-color);
            }
            #history-controls label {
                font-weight: 500;
                margin-right: 1rem;
            }
            #history-controls input[type="range"] {
                width: 200px;
                vertical-align: middle;
            }

            .progress-container {
                margin-top: 1rem;
                display: none; /* Hidden by default */
            }
            .progress-bar-wrapper {
                background-color: var(--bg-subtle);
                border-radius: 8px;
                padding: 3px;
                margin-bottom: 0.5rem;
            }
            .progress-bar {
                background-color: var(--primary-color);
                height: 20px;
                border-radius: 6px;
                transition: width 0.3s ease-in-out;
                text-align: center;
                color: white;
                font-size: 0.8rem;
                line-height: 20px;
                font-weight: 500;
            }

            .rating-list { list-style: none; padding: 0; margin: 0; }
            .rating-item { padding: 1rem 0; border-bottom: 1px solid var(--border-color); }
            .rating-item:first-child { padding-top: 0; }
            .rating-item:last-child { border-bottom: none; padding-bottom: 0; }
            .rating-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
            .rating-name { font-weight: 600; color: #374151; }
            .rating-score { font-weight: 700; font-size: 1.25rem; }
            .rating-reasoning { margin: 0; color: var(--secondary-color); font-size: 0.875rem; }

            .settings-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 2rem;
            }
            .settings-column {
                display: flex;
                flex-direction: column;
                min-height: 300px; /* Ensure columns have some base height */
            }
            #modal-criteria-list {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            .criterion > .criterion-text-display, 
            .criterion > textarea {
                flex-grow: 1;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                line-height: 1.5;
                box-sizing: border-box;
            }
            .criterion > .criterion-text-display {
                cursor: text;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .criterion > textarea {
                display: none; /* Hidden by default */
                resize: vertical;
                min-height: 80px;
            }
            .modal-body {
                padding: 1.5rem 2rem;
            }
            .modal-content {
                width: 80vw;
                max-width: 1200px;
            }

        </style>
        
        <div class="grid-container">
            <div class="control-panel">
                <h2>Controls</h2>
        
                <div>
                    <label for="prompt">Your Prompt:</label>
                    <textarea id="prompt" placeholder="Enter the high-level goal for your text..."></textarea>
                </div>
                
                <hr>
        
                <button id="start-loop-btn" class="button button-primary" style="width: 100%;">Start Loop</button>
                <button id="stop-loop-btn" class="button button-primary" style="display: none; width: 100%; background-color: #dc2626;">Stop Loop</button>
                
                <div id="progress-container" class="progress-container">
                    <div class="progress-bar-wrapper">
                        <div id="iteration-progress-bar" class="progress-bar" style="width: 0%;"></div>
                    </div>
                    <div class="progress-bar-wrapper">
                        <div id="step-progress-bar" class="progress-bar" style="width: 0%;"></div>
                    </div>
                </div>
            </div>
            
            <div class="results-panel">
                <div id="history-controls">
                    <label for="iteration-slider">View Iteration:</label>
                    <span id="iteration-label">1 / 1</span>
                    <input type="range" id="iteration-slider" min="1" max="1" value="1">
                </div>
                <div id="results-container">
                    <div id="live-response-container" class="response-block response-creator" style="display: none;">
                        <h3>Live Response</h3>
                        <p id="live-response"></p>
                    </div>
                    <div id="ratings-container" class="response-block response-rater" style="display: none;">
                        <h3>Latest Ratings</h3>
                        <div id="ratings"></div>
                    </div>
                    <div id="editor-advice-container" class="response-block response-editor" style="display: none;">
                        <h3>Editor's Advice</h3>
                        <p id="editor-advice"></p>
                    </div>
                    <div id="final-result-container"></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('start-loop-btn')?.addEventListener('click', handleStartLoop);
    document.getElementById('stop-loop-btn')?.addEventListener('click', () => {
        if (orchestrator) {
            orchestrator.requestStop();
        }
    });
}

function autoResizeTextarea(this: HTMLTextAreaElement) {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
}

function getShortCriterionName(fullName: string): string {
    return fullName.split('.')[0];
}

function getCriteriaFromUI(container: HTMLElement): QualityCriterion[] {
    const criteria: QualityCriterion[] = [];
    const criterionElements = container.querySelectorAll('.criterion');
    criterionElements.forEach(el => {
        const textarea = el.querySelector<HTMLTextAreaElement>('textarea');
        const input = el.querySelector<HTMLInputElement>('input[type="number"]');
        if (textarea && input) {
            const name = textarea.value;
            const goal = parseInt(input.value, 10);
            if (name && !isNaN(goal)) {
                criteria.push({ name, goal });
            }
        }
    });
    return criteria;
}

function getRatingColor(rating: number): string {
    const hue = (rating / 10) * 120; // 0=red, 10=green
    return `hsl(${hue}, 70%, 50%)`;
}

function renderRatings(ratings: Rating[]): string {
    if (!ratings) {
        return '<p>No ratings available.</p>';
    }

    return `
        <ul class="rating-list">
            ${ratings.map(r => `
                <li class="rating-item">
                    <div class="rating-header">
                        <span class="rating-name">${getShortCriterionName(r.criterion)} (Goal: ${r.goal})</span>
                        <span class="rating-score" style="color: ${getRatingColor(r.score)}">${r.score}/10</span>
                    </div>
                    <p class="rating-reasoning">${r.justification}</p>
                </li>
            `).join('')}
        </ul>
    `;
}

function isCriteriaArray(data: any): data is QualityCriterion[] {
    return Array.isArray(data) && data.every(item =>
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'goal' in item &&
        typeof item.name === 'string' &&
        typeof item.goal === 'number'
    );
}

function findBestFailedIteration(history: LoopHistoryItem[]): number {
    let bestIteration = -1;
    let highestScore = -1;

    // Get unique iteration numbers that have ratings
    const ratedIterations = [...new Set(history.filter(h => h.type === 'rating').map(h => h.iteration))];

    for (const iter of ratedIterations) {
        // Find the rating payload for this iteration
        const ratingItem = history.find(h => h.iteration === iter && h.type === 'rating');
        if (!ratingItem) continue;

        const ratings = (ratingItem.payload as RatingPayload).ratings;
        const totalScore = ratings.reduce((acc, r) => acc + r.score, 0);

        // Check if any goal was missed in this iteration
        const success = ratings.every(r => r.score >= r.goal);

        if (!success && totalScore > highestScore) {
            highestScore = totalScore;
            bestIteration = iter;
        }
    }
    
    // Fallback to the last iteration if no failed one is clearly "best"
    return bestIteration > 0 ? bestIteration : ratedIterations.pop() || 1;
}

function renderDataForIteration(iteration: number) {
    if (loopHistory.length === 0) return;

    const historyForIter = loopHistory.filter(h => h.iteration === iteration);

    const creatorUpdate = historyForIter.find(h => h.type === 'creator');
    const ratingUpdate = historyForIter.find(h => h.type === 'rating');
    const editorUpdate = historyForIter.find(h => h.type === 'editor');

    const creatorContainer = getElementById<HTMLDivElement>('live-response-container');
    const ratingsContainer = getElementById<HTMLDivElement>('ratings-container');
    const editorContainer = getElementById<HTMLDivElement>('editor-advice-container');
    
    const creatorContent = getElementById<HTMLParagraphElement>('live-response');
    const ratingsContent = getElementById<HTMLDivElement>('ratings');
    const editorContent = getElementById<HTMLParagraphElement>('editor-advice');

    if (creatorUpdate) {
        creatorContainer.style.display = 'block';
        creatorContent.innerHTML = (creatorUpdate.payload as CreatorPayload).response.replace(/\n/g, '<br>');
    } else {
        creatorContainer.style.display = 'none';
    }

    if (ratingUpdate) {
        ratingsContainer.style.display = 'block';
        ratingsContent.innerHTML = renderRatings((ratingUpdate.payload as RatingPayload).ratings);
    } else {
        ratingsContainer.style.display = 'none';
    }

    if (editorUpdate) {
        editorContainer.style.display = 'block';
        editorContent.innerHTML = (editorUpdate.payload as EditorPayload).advice.replace(/\n/g, '<br>');
    } else {
        editorContainer.style.display = 'none';
    }
    
    // Update slider label
    const iterLabel = getElementById<HTMLSpanElement>('iteration-label');
    const iterSlider = getElementById<HTMLInputElement>('iteration-slider');
    iterLabel.textContent = `${iteration} / ${iterSlider.max}`;
}

async function handleStartLoop() {
    if (!orchestrator) {
        alert('Please configure models first.');
        return;
    }

    loopHistory = [];
    viewedIteration = 0;
    getElementById<HTMLDivElement>('history-controls').style.display = 'none';

    const promptEl = getElementById<HTMLTextAreaElement>('prompt');
    const criteria = getCriteriaFromUI(getElementById('criteria-list'));

    if (!promptEl.value.trim()) {
        alert('Please enter a prompt before starting the loop.');
        return;
    }

    if (criteria.length === 0) {
        alert('Please define at least one quality criterion before starting the loop.');
        return;
    }

    const loopInput: LoopInput = {
        prompt: promptEl.value,
        criteria: criteria,
        maxIterations: parseInt((getElementById('max-iterations') as HTMLInputElement).value, 10) || 5,
    };

    const startBtn = getElementById<HTMLButtonElement>('start-loop-btn');
    const stopBtn = getElementById<HTMLButtonElement>('stop-loop-btn');

    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';

    // Reset and show progress bars
    const progressContainer = getElementById<HTMLDivElement>('progress-container');
    const iterationProgressBar = getElementById<HTMLDivElement>('iteration-progress-bar');
    const stepProgressBar = getElementById<HTMLDivElement>('step-progress-bar');
    progressContainer.style.display = 'block';
    iterationProgressBar.style.width = '0%';
    iterationProgressBar.textContent = 'Starting...';
    stepProgressBar.style.width = '0%';
    stepProgressBar.textContent = '';

    // Clear previous results and show containers
    const resultsContainer = getElementById<HTMLElement>('results-container');
    const finalResultContainer = getElementById<HTMLElement>('final-result-container');

    // Hide all sub-containers initially
    (Array.from(resultsContainer.children) as HTMLElement[]).forEach(c => (c as HTMLElement).style.display = 'none');
    
    finalResultContainer.style.display = 'block';
    finalResultContainer.innerHTML = 'Looping...';
    
    try {
        const result = await orchestrator.runLoop(loopInput);
        finalResultContainer.style.display = 'none'; // Hide the "Looping..." message
        
        loopHistory = result.history;
        const totalIterations = result.iterations;

        if (totalIterations > 0) {
            let iterationToShow = totalIterations;
            if (!result.success) {
                iterationToShow = findBestFailedIteration(loopHistory);
                console.log(`Loop failed. Showing best iteration: ${iterationToShow}`);
            }

            const historyControls = getElementById<HTMLDivElement>('history-controls');
            const iterSlider = getElementById<HTMLInputElement>('iteration-slider');
            
            historyControls.style.display = 'block';
            iterSlider.max = String(totalIterations);
            iterSlider.value = String(iterationToShow);
            viewedIteration = iterationToShow;
            renderDataForIteration(viewedIteration);
        } else {
            finalResultContainer.style.display = 'block';
            finalResultContainer.innerHTML = '<p>The loop did not run any iterations.</p>';
        }

    } catch (error) {
        finalResultContainer.style.display = 'block';
        finalResultContainer.innerHTML = `<p style="color: red;">Error: ${error}</p>`;
        console.error(error);
    } finally {
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        getElementById<HTMLDivElement>('progress-container').style.display = 'none';
    }
}

function renderCriteria(container: HTMLElement, criteria: QualityCriterion[]) {
    container.innerHTML = '';
    criteria.forEach(c => {
        const criterionElement = createCriterionElement(c);
        container.appendChild(criterionElement);
        const textarea = criterionElement.querySelector('textarea');
        if (textarea) {
            autoResizeTextarea.call(textarea);
        }
    });
}

function createCriterionElement(criterion?: QualityCriterion): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'criterion';

    const textarea = document.createElement('textarea');
    textarea.placeholder = "e.g., 'Clarity and conciseness'";
    textarea.value = criterion?.name || '';
    textarea.addEventListener('input', autoResizeTextarea);
    textarea.addEventListener('focus', function() { this.selectionStart = this.selectionEnd = this.value.length; });

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '10';
    input.value = criterion?.goal.toString() || '8';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-criterion-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove criterion';

    const textDisplay = document.createElement('div');
    textDisplay.className = 'criterion-text-display';

    const textareaContainer = document.createElement('div');
    textareaContainer.style.flexGrow = '1';
    textareaContainer.style.position = 'relative';

    const updateDisplay = (text: string) => {
        textDisplay.textContent = text.split('.')[0] + (text.includes('.') && text.split('.')[0] !== text ? '.' : '');
    };
    
    updateDisplay(criterion?.name || "New Criterion...");
    textarea.value = criterion?.name || "New Criterion...";
    textarea.style.display = 'none';

    textDisplay.addEventListener('click', () => {
        textDisplay.style.display = 'none';
        textarea.style.display = 'block';
        textarea.focus();
        autoResizeTextarea.call(textarea);
    });

    textarea.addEventListener('blur', () => {
        textarea.style.display = 'none';
        textDisplay.style.display = 'block';
        updateDisplay(textarea.value);
    });
    
    textareaContainer.appendChild(textDisplay);
    textareaContainer.appendChild(textarea);
    
    div.appendChild(textareaContainer);
    div.appendChild(input);
    div.appendChild(removeBtn);

    return div;
}

function handleLoadDefaultCriteria() {
    if (confirm('Are you sure you want to replace your current criteria with the defaults?')) {
        renderCriteria(getElementById('criteria-list'), defaultProseCriteria);
    }
}

async function handleCopyCriteria(container: HTMLElement) {
    const criteria = getCriteriaFromUI(container);
    if (criteria.length > 0) {
        try {
            await navigator.clipboard.writeText(JSON.stringify(criteria, null, 2));
            alert('Criteria copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy criteria: ', err);
            alert('Failed to copy criteria. See console for details.');
        }
    } else {
        alert('No criteria to copy.');
    }
}

async function handlePasteCriteria(container: HTMLElement) {
    try {
        const text = await navigator.clipboard.readText();
        const parsed = JSON.parse(text);
        if (isCriteriaArray(parsed)) {
            if (confirm('Are you sure you want to replace your current criteria with the content from your clipboard?')) {
                renderCriteria(container, parsed);
            }
        } else {
            alert('Clipboard content is not valid criteria data.');
        }
    } catch (err) {
        console.error('Failed to paste criteria: ', err);
        alert('Failed to read from clipboard or parse data. See console for details.');
    }
}

function updateSettingsUI(profile: SettingsProfile) {
    getElementById<HTMLInputElement>('modal-max-iterations').value = String(profile.maxIterations);
    renderCriteria(getElementById('modal-criteria-list'), profile.criteria);
}

function updateProfileDropdown() {
    const select = getElementById<HTMLSelectElement>('settings-profile-select');
    if (!settingsManager) return;

    const profiles = settingsManager.getProfileNames();
    const lastUsed = settingsManager.getLastUsedProfileName();

    select.innerHTML = ''; // Clear existing options
    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a profile...';
    select.appendChild(defaultOption);
    
    profiles.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === lastUsed) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function handleSaveProfile() {
    if (!settingsManager || !modelSelector) return;
    const nameInput = getElementById<HTMLInputElement>('settings-profile-name');
    let name = nameInput.value.trim();

    if (!name) {
        const select = getElementById<HTMLSelectElement>('settings-profile-select');
        const selectedName = select.value;
        if (selectedName && confirm(`No new profile name entered. Do you want to overwrite the selected profile "${selectedName}"?`)) {
            name = selectedName;
        } else {
            return; // User cancelled or no profile was selected
        }
    }

    const currentProfile: SettingsProfile = {
        maxIterations: parseInt(getElementById<HTMLInputElement>('modal-max-iterations').value, 10),
        criteria: getCriteriaFromUI(getElementById('modal-criteria-list')),
        selectedModels: modelSelector.getSelectedModels(),
    };
    
    settingsManager.saveProfile(name, currentProfile);
    nameInput.value = '';
    updateProfileDropdown();
    // Ensure the potentially new/overwritten profile is selected
    const select = getElementById<HTMLSelectElement>('settings-profile-select');
    select.value = name;
}

function handleLoadProfile(event: Event) {
    if (!settingsManager || !modelSelector) return;
    const select = event.target as HTMLSelectElement | null;
    if (!select) return;

    const profileName = select.value;
    const profile = settingsManager.getProfile(profileName);
    if (profile) {
        updateSettingsUI(profile);
        modelSelector.setSelectedModels(profile.selectedModels);
        settingsManager.setLastUsedProfile(profileName);
    }
}

function handleDeleteProfile() {
    if (!settingsManager) return;
    const select = getElementById<HTMLSelectElement>('settings-profile-select');
    const profileName = select.value;
    if (profileName && confirm(`Are you sure you want to delete the "${profileName}" profile?`)) {
        settingsManager.deleteProfile(profileName);
        loadAndApplyLastUsedProfile(); // Load another profile or clear UI
    }
}

function loadAndApplyLastUsedProfile() {
    if (!settingsManager || !modelSelector) return;
    const lastProfile = settingsManager.getLastUsedProfile();
    if (lastProfile) {
        updateSettingsUI(lastProfile);
        modelSelector.setSelectedModels(lastProfile.selectedModels);
    }
    updateProfileDropdown();
}

function handleRunTests() {
    const testRunner = new TestRunner();
    const resultsDiv = getElementById<HTMLDivElement>('test-modal-content');
    
    const runTests = async () => {
        resultsDiv.innerHTML = '<h2>Running Tests...</h2>';
        openTestModal();

        const testResults = await testRunner.runAllTests();

        resultsDiv.innerHTML = '<h2>Test Results</h2>';
        resultsDiv.innerHTML += testResults
            .map(result => `<div class="test-result ${result.success ? 'passed' : 'failed'}">${result.success ? '✓' : '✗'} ${result.message}</div>`)
            .join('');
    };

    runTests();
}

function renderSettingsModal() {
    if (!modalContent || !modelSelector) return;

    modalContent.innerHTML = `
        <style>
            .modal-content {
                width: 80vw;
                max-width: 1200px;
            }
            .modal-body {
                padding: 1.5rem 2rem;
            }
            .settings-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }
            .settings-column {
                display: flex;
                flex-direction: column;
                min-height: 300px; /* Ensure columns have some base height */
            }
            #modal-criteria-list {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            .criterion {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }
            .criterion > .criterion-text-display, 
            .criterion > textarea {
                flex-grow: 1;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                line-height: 1.5;
                box-sizing: border-box;
            }
            .criterion > .criterion-text-display {
                cursor: text;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .criterion > textarea {
                display: none; /* Hidden by default */
                resize: vertical;
                min-height: 80px;
            }
            .settings-section {
                background-color: var(--bg-subtle);
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 1.5rem;
            }
            .criteria-actions { 
                display: flex; 
                gap: 0.75rem; 
                margin-top: 1.5rem; 
            }
        </style>
        <div class="modal-header">
            <h2>Generation Settings</h2>
            <button id="close-settings-modal-btn" class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
            <div class="settings-grid">
                <div class="settings-section">
                    <div class="settings-bar">
                        <select id="settings-profile-select"></select>
                        <input type="text" id="settings-profile-name" placeholder="New or existing profile name"/>
                        <button id="settings-save-btn" class="button button-secondary">Save</button>
                        <button id="settings-delete-btn" class="button button-secondary">Delete</button>
                    </div>
                </div>

                <div id="settings-models-container" class="settings-column settings-section">
                    <h3>Models</h3>
                    <!-- ModelSelector will be rendered here -->
                </div>
                
                <div id="settings-criteria-container" class="settings-column settings-section">
                    <h3>Quality Criteria</h3>
                    <div id="modal-criteria-list"></div>
                    <div style="margin-top: 1.5rem;">
                        <label for="modal-max-iterations">Max Iterations:</label>
                        <input type="number" id="modal-max-iterations" min="1" max="20" value="5" style="max-width: 100px;">
                    </div>
                    <div class="criteria-actions">
                        <button id="modal-add-criterion-btn" class="button button-secondary">Add</button>
                        <button id="modal-default-criteria-btn" class="button button-secondary">Defaults</button>
                        <button id="modal-copy-criteria-btn" class="button button-secondary">Copy</button>
                        <button id="modal-paste-criteria-btn" class="button button-secondary">Paste</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- Render and Wire-Up Components ---

    // Model Selector
    const modelsContainer = getElementById('settings-models-container');
    modelSelector.render(modelsContainer);

    // Criteria Editor
    const modalCriteriaList = getElementById('modal-criteria-list');
    getElementById('modal-add-criterion-btn').addEventListener('click', () => {
        const newItem = createCriterionElement();
        modalCriteriaList.appendChild(newItem);
        (newItem.querySelector('textarea') as HTMLTextAreaElement)?.focus();
    });
    getElementById('modal-default-criteria-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to replace your current criteria with the defaults?')) {
            renderCriteria(modalCriteriaList, defaultProseCriteria);
        }
    });
    getElementById('modal-copy-criteria-btn').addEventListener('click', () => handleCopyCriteria(modalCriteriaList));
    getElementById('modal-paste-criteria-btn').addEventListener('click', () => handlePasteCriteria(modalCriteriaList));
     modalCriteriaList.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('remove-criterion-btn')) {
            (e.target as HTMLElement).closest('.criterion')?.remove();
        }
    });

    // Profile Management
    document.getElementById('settings-save-btn')?.addEventListener('click', handleSaveProfile);
    document.getElementById('settings-delete-btn')?.addEventListener('click', handleDeleteProfile);
    document.getElementById('settings-profile-select')?.addEventListener('change', handleLoadProfile);
    getElementById('close-settings-modal-btn').addEventListener('click', closeModal);
    
    // Initial Load
    loadAndApplyLastUsedProfile();
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    // Button bindings
    settingsBtn.addEventListener('click', openModal);
    runTestsBtn.addEventListener('click', handleRunTests);
    newProjectBtn.addEventListener('click', openNewProjectModal);

    // Modal close-on-click-outside behavior
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            closeModal();
        }
    });
    testModalContainer.addEventListener('click', (e) => {
        if (e.target === testModalContainer) {
            closeTestModal();
        }
    });
    newProjectModalContainer.addEventListener('click', (e) => {
        if (e.target === newProjectModalContainer) {
            closeNewProjectModal();
        }
    });

    // Initialize ModelSelector
    modelSelector = new ModelSelector(onModelsSelected, closeModal);
    modelSelector.render(modalContent);

    // Initialize SettingsManager
    settingsManager = new SettingsManager();

    // Check if we can show the main app right away
    const apiKey = modelSelector.getApiKey();
    const allModelsSet = modelSelector.areAllModelsSelected();

    if (!apiKey || !allModelsSet) {
        console.log('API key or models not set. Forcing settings modal.');
        // Make the modal non-closable until setup is complete
        openModal();
        (modalContainer.querySelector('.modal-content') as HTMLElement).style.pointerEvents = 'auto';
        modalContainer.style.pointerEvents = 'auto';
        // Temporarily disable closing by clicking outside
        const modalClickHandler = (e: MouseEvent) => {
            if (e.target === modalContainer) {
                e.stopPropagation();
            }
        };
        modalContainer.addEventListener('click', modalClickHandler);
        // We will remove this listener in onModelsSelected when setup is complete
    } else {
        // If settings are okay, configure services and render the appropriate view
        reconfigureCoreServices(modelSelector.getSelectedModels());
        
        const savedProjectJson = localStorage.getItem('expert_app_current_project');
        if (savedProjectJson) {
            try {
                if (!orchestrator || !settingsManager) {
                    throw new Error("Orchestrator not available to load project.");
                }
                currentProject = ProjectManager.load(savedProjectJson, orchestrator, settingsManager);
                console.log('Loaded project from storage:', currentProject.projectTitle);
                renderProjectUI(currentProject);
            } catch (error) {
                console.error('Failed to load project from storage, showing main app instead.', error);
                renderMainApp();
            }
        } else {
            renderMainApp();
        }
        isAppRendered = true;
    }

    console.log('Application initialized.');
}); 