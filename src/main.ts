import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator, type LoopInput, type QualityCriterion, type Rating, type ProgressCallback } from './LoopOrchestrator';
import { PromptManager, defaultPrompts, type OrchestratorPrompts } from './PromptManager';
import { SettingsManager, type SettingsProfile } from './SettingsManager';

// --- Type-Safe DOM Access ---
function getElementById<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Could not find element with id: ${id}`);
    }
    return element as T;
}

// --- DOM Elements ---
const initialSetupContainer = getElementById<HTMLElement>('initial-setup');
const mainAppContainer = getElementById<HTMLElement>('main-app');
const configureModelsBtn = getElementById<HTMLButtonElement>('configure-models-btn');
const configurePromptsBtn = getElementById<HTMLButtonElement>('configure-prompts-btn');
const modalContainer = getElementById<HTMLElement>('modal-container');
const modalContent = getElementById<HTMLElement>('modal-content');
const promptModalContainer = getElementById<HTMLElement>('prompt-modal-container');
const promptModalContent = getElementById<HTMLElement>('prompt-modal-content');

if (!initialSetupContainer || !mainAppContainer || !configureModelsBtn || !modalContainer || !modalContent || !configurePromptsBtn || !promptModalContainer || !promptModalContent) {
    throw new Error('Could not find required DOM elements');
}

// --- State ---
let openRouterClient: OpenRouterClient | null = null;
let modelSelector: ModelSelector | null = null;
let selectedModels: Record<string, string> = {};
let orchestrator: LoopOrchestrator | null = null;
let settingsManager: SettingsManager | null = null;
let orchestratorPrompts: OrchestratorPrompts = { ...defaultPrompts };

// --- Functions ---
function openModal() {
    if (modalContainer) {
        modalContainer.style.display = 'flex';
    }
}

function closeModal() {
    if (modalContainer) {
        modalContainer.style.display = 'none';
    }
}

function openPromptModal() {
    if (promptModalContainer) {
        promptModalContainer.style.display = 'flex';
    }
}

function closePromptModal() {
    if (promptModalContainer) {
        promptModalContainer.style.display = 'none';
    }
}

function reconfigureCoreServices(models: Record<string, string>) {
    console.log('Reconfiguring core services with models:', models);
    selectedModels = models;

    const apiKey = modelSelector?.getApiKey();
    if (apiKey) {
        openRouterClient = new OpenRouterClient(apiKey, selectedModels);
        orchestrator = new LoopOrchestrator(openRouterClient, orchestratorPrompts);
        console.log('OpenRouter client and Orchestrator configured.');
    }
}

function onModelsSelected(models: Record<string, string>) {
    reconfigureCoreServices(models);
    
    closeModal();
    if (initialSetupContainer.style.display !== 'none') {
        renderMainApp();
        initialSetupContainer.style.display = 'none';
        mainAppContainer.style.display = 'block';
    }
}

function onPromptsSaved(prompts: OrchestratorPrompts) {
    orchestratorPrompts = prompts;
    // Re-initialize orchestrator with new prompts if it exists
    if (openRouterClient) {
        orchestrator = new LoopOrchestrator(openRouterClient, orchestratorPrompts);
    }
    closePromptModal();
}

function renderMainApp() {
    mainAppContainer.innerHTML = `
        <style>
            :root {
                --primary-color: #4f46e5;
                --primary-hover: #4338ca;
                --secondary-color: #6b7280;
                --border-color: #d1d5db;
                --input-bg: #fff;
                --bg-subtle: #f9fafb;
            }

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

            .criterion { display: flex; gap: 0.75rem; margin-bottom: 0.75rem; align-items: center; }
            .criterion input[type="text"] { flex-grow: 1; }
            .criterion input[type="number"] { max-width: 80px; }

            .button {
                display: inline-block;
                padding: 0.75rem 1.25rem;
                border-radius: 8px;
                font-weight: 500;
                text-align: center;
                border: 1px solid transparent;
                transition: all 0.2s;
            }
            .button-primary { background-color: var(--primary-color); color: white; }
            .button-primary:hover { background-color: var(--primary-hover); }
            
            .button-secondary { background-color: white; color: var(--secondary-color); border-color: var(--border-color); }
            .button-secondary:hover { background-color: var(--bg-subtle); }

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

        </style>
        
        <div class="grid-container">
            <div class="control-panel">
                <h2>Settings & Controls</h2>

                <div class="settings-bar">
                    <select id="settings-profile-select"></select>
                    <input type="text" id="settings-profile-name" placeholder="New Profile Name"/>
                    <button id="settings-save-btn" class="button button-secondary">Save</button>
                    <button id="settings-delete-btn" class="button button-secondary">Delete</button>
                </div>
        
                <div>
                    <label for="prompt">Your Prompt:</label>
                    <textarea id="prompt"></textarea>
                </div>
                
                <hr>

                <h3>Quality Criteria</h3>
                <div id="criteria-list">
                    <div class="criterion">
                        <input type="text" value="Clarity" placeholder="Criterion Name">
                        <input type="number" value="8" min="1" max="10" placeholder="Goal">
                        <button class="remove-criterion-btn" title="Remove">&times;</button>
                    </div>
                    <div class="criterion">
                        <input type="text" value="Friendliness" placeholder="Criterion Name">
                        <input type="number" value="9" min="1" max="10" placeholder="Goal">
                        <button class="remove-criterion-btn" title="Remove">&times;</button>
                    </div>
                </div>
                <div class="criteria-actions">
                    <button id="add-criterion-btn" class="button button-secondary">Add Criterion</button>
                    <button id="copy-criteria-btn" class="button button-secondary">Copy</button>
                    <button id="paste-criteria-btn" class="button button-secondary">Paste</button>
                </div>
                
                <hr>
        
                <div>
                    <label for="max-iterations">Max Iterations:</label>
                    <input type="number" id="max-iterations" min="1" max="20" value="5" style="max-width: 100px;">
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

    // --- Settings Profile Event Listeners ---
    document.getElementById('settings-save-btn')?.addEventListener('click', handleSaveProfile);
    document.getElementById('settings-delete-btn')?.addEventListener('click', handleDeleteProfile);
    document.getElementById('settings-profile-select')?.addEventListener('change', handleLoadProfile);
    
    // --- Other Listeners ---
    document.getElementById('add-criterion-btn')?.addEventListener('click', () => {
        const list = document.getElementById('criteria-list');
        const newItem = document.createElement('div');
        newItem.className = 'criterion';
        newItem.innerHTML = `
            <input type="text" placeholder="Criterion Name">
            <input type="number" min="1" max="10" placeholder="Goal">
            <button class="remove-criterion-btn" title="Remove">&times;</button>
        `;
        newItem.querySelector('.remove-criterion-btn')?.addEventListener('click', () => newItem.remove());
        list?.appendChild(newItem);
    });

    document.getElementById('copy-criteria-btn')?.addEventListener('click', handleCopyCriteria);
    document.getElementById('paste-criteria-btn')?.addEventListener('click', handlePasteCriteria);

    document.getElementById('criteria-list')?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('remove-criterion-btn')) {
            (e.target as HTMLElement).closest('.criterion')?.remove();
        }
    });

    document.getElementById('start-loop-btn')?.addEventListener('click', handleStartLoop);
    document.getElementById('stop-loop-btn')?.addEventListener('click', () => {
        if (orchestrator) {
            orchestrator.requestStop();
        }
    });
    loadAndApplyLastUsedProfile();
}

function getCriteriaFromUI(): QualityCriterion[] {
    const criteriaNodes = document.querySelectorAll('#criteria-list .criterion');
    const criteria: QualityCriterion[] = [];
    criteriaNodes.forEach(node => {
        const nameInput = node.querySelector('input[type="text"]') as HTMLInputElement;
        const goalInput = node.querySelector('input[type="number"]') as HTMLInputElement;
        if (nameInput?.value && goalInput?.value) {
            criteria.push({
                name: nameInput.value,
                goal: parseInt(goalInput.value, 10)
            });
        }
    });
    return criteria;
}

function getRatingColor(rating: number): string {
    if (rating >= 8) return '#10b981'; // green-500
    if (rating >= 5) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
}

function renderRatings(ratings: Rating[]): string {
    return `
        <ul class="rating-list">
            ${ratings.map(item => `
                <li class="rating-item">
                    <div class="rating-header">
                        <span class="rating-name">${item.criterion} (Goal: ${item.goal})</span>
                        <span class="rating-score" style="color: ${getRatingColor(item.score)}">
                            ${item.score} / 10
                        </span>
                    </div>
                    <p class="rating-reasoning">${(item.justification || 'No reasoning provided.').replace(/\n/g, '<br>')}</p>
                </li>
            `).join('')}
        </ul>
    `;
}

function isCriteriaArray(data: any): data is QualityCriterion[] {
    return (
        Array.isArray(data) &&
        data.every(
            (item) =>
                typeof item === 'object' &&
                item !== null &&
                'name' in item &&
                typeof item.name === 'string' &&
                'goal' in item &&
                typeof item.goal === 'number'
        )
    );
}

function onProgress(update: Parameters<ProgressCallback>[0]) {
    const { type, payload, iteration, maxIterations, step, totalStepsInIteration } = update;

    // Update progress bars
    const iterationProgressBar = getElementById<HTMLDivElement>('iteration-progress-bar');
    const stepProgressBar = getElementById<HTMLDivElement>('step-progress-bar');
    const iterationProgress = (iteration / maxIterations) * 100;
    const stepProgress = (step / totalStepsInIteration) * 100;
    
    iterationProgressBar.style.width = `${iterationProgress}%`;
    iterationProgressBar.textContent = `Iteration: ${iteration} / ${maxIterations}`;
    
    const stepType = type.charAt(0).toUpperCase() + type.slice(1);
    stepProgressBar.style.width = `${stepProgress}%`;
    stepProgressBar.textContent = `Step: ${step} of ${totalStepsInIteration} (${stepType})`;

    if (type === 'creator') {
        const container = getElementById<HTMLElement>('live-response-container');
        const element = getElementById<HTMLParagraphElement>('live-response');
        container.style.display = 'block';
        element.innerHTML = payload.response.replace(/\n/g, '<br>');
    } else if (type === 'rating') {
        const container = getElementById<HTMLElement>('ratings-container');
        const element = getElementById<HTMLElement>('ratings');
        console.log('Received ratings payload for rendering:', JSON.stringify(payload.ratings, null, 2));
        container.style.display = 'block';
        element.innerHTML = renderRatings(payload.ratings);
    } else if (type === 'editor') {
        const container = getElementById<HTMLElement>('editor-advice-container');
        const element = getElementById<HTMLParagraphElement>('editor-advice');
        container.style.display = 'block';
        element.innerHTML = payload.advice.replace(/\n/g, '<br>');
    }
}

async function handleStartLoop() {
    if (!orchestrator) {
        alert('Please configure models first.');
        return;
    }

    const promptEl = getElementById<HTMLTextAreaElement>('prompt');
    const criteria = getCriteriaFromUI();
    const maxIterationsEl = getElementById<HTMLInputElement>('max-iterations');
    
    const loopInput: LoopInput = {
        prompt: promptEl.value,
        criteria: criteria,
        maxIterations: parseInt(maxIterationsEl.value, 10) || 5,
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
        const result = await orchestrator.runLoop(loopInput, onProgress);
        const successColor = result.success ? '#10b981' : '#f59e0b';
        finalResultContainer.style.display = 'block';
        finalResultContainer.innerHTML = `
            <div class="response-block">
                <h3 style="color: ${successColor};">Loop Finished (Success: ${result.success})</h3>
                <p>Total Iterations: ${result.iterations}</p>
            </div>

            <div class="response-block response-creator">
                <h3>Final Response:</h3>
                <p>${result.finalResponse.replace(/\n/g, '<br>')}</p>
            </div>
            
            <div class="response-block">
                <h3>Full History:</h3>
                <pre>${JSON.stringify(result.history, null, 2)}</pre>
            </div>
        `;
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

function renderCriteria(criteria: QualityCriterion[]) {
    const list = getElementById<HTMLElement>('criteria-list');
    list.innerHTML = '';
    
    criteria.forEach(c => {
        const newItem = document.createElement('div');
        newItem.className = 'criterion';
        newItem.innerHTML = `
            <input type="text" value="${c.name}" placeholder="Criterion Name">
            <input type="number" value="${c.goal}" min="1" max="10" placeholder="Goal (1-10)">
            <button class="remove-criterion-btn" title="Remove">&times;</button>
        `;
        list.appendChild(newItem);
    });
}

async function handleCopyCriteria() {
    const criteria = getCriteriaFromUI();
    if (criteria.length === 0) {
        alert('No criteria to copy.');
        return;
    }
    try {
        await navigator.clipboard.writeText(JSON.stringify(criteria, null, 2));
        alert('Criteria copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy criteria: ', err);
        alert('Failed to copy criteria to clipboard.');
    }
}

async function handlePasteCriteria() {
    try {
        const text = await navigator.clipboard.readText();
        const pastedData = JSON.parse(text);

        if (!isCriteriaArray(pastedData)) {
            throw new Error('Clipboard does not contain a valid criteria array.');
        }

        const currentCriteria = getCriteriaFromUI();
        const criteriaMap = new Map<string, QualityCriterion>();

        currentCriteria.forEach(c => criteriaMap.set(c.name, c));
        pastedData.forEach((c: QualityCriterion) => criteriaMap.set(c.name, c));

        const newCriteria = Array.from(criteriaMap.values());

        renderCriteria(newCriteria);
        alert('Criteria pasted and merged!');

    } catch (err) {
        console.error('Failed to paste criteria: ', err);
        alert('Failed to paste criteria. Please make sure the clipboard contains a valid JSON array of criteria.');
    }
}

function updateSettingsUI(profile: SettingsProfile) {
    getElementById<HTMLTextAreaElement>('prompt').value = profile.prompt;
    getElementById<HTMLInputElement>('max-iterations').value = String(profile.maxIterations);
    renderCriteria(profile.criteria);
}

function updateProfileDropdown() {
    if (!settingsManager) return;
    const select = getElementById<HTMLSelectElement>('settings-profile-select');
    const currentProfileName = settingsManager.getLastUsedProfileName();
    select.innerHTML = '';
    
    const names = settingsManager.getProfileNames();
    if (names.length === 0) {
        select.innerHTML = '<option disabled>No profiles saved</option>';
        return;
    }

    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === currentProfileName) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function handleSaveProfile() {
    if (!settingsManager || !modelSelector) return;
    const nameInput = getElementById<HTMLInputElement>('settings-profile-name');
    const name = nameInput.value;
    if (!name) {
        alert('Please enter a name for the settings profile.');
        return;
    }

    const currentProfile: SettingsProfile = {
        prompt: getElementById<HTMLTextAreaElement>('prompt').value,
        maxIterations: parseInt(getElementById<HTMLInputElement>('max-iterations').value, 10),
        criteria: getCriteriaFromUI(),
        selectedModels: modelSelector.getSelectedModels(),
    };
    
    settingsManager.saveProfile(name, currentProfile);
    nameInput.value = '';
    updateProfileDropdown();
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
        reconfigureCoreServices(profile.selectedModels);
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
    if (!settingsManager) return;
    const lastProfile = settingsManager.getLastUsedProfile();
    if (lastProfile) {
        updateSettingsUI(lastProfile);
    }
    updateProfileDropdown();
}

// --- Initialization ---
configureModelsBtn.addEventListener('click', openModal);
configurePromptsBtn.addEventListener('click', openPromptModal);

// Close modal if clicked outside of content
modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) {
        closeModal();
    }
});

promptModalContainer.addEventListener('click', (e) => {
    if (e.target === promptModalContainer) {
        closePromptModal();
    }
});

// Initialize ModelSelector
modelSelector = new ModelSelector(onModelsSelected, closeModal);
modelSelector.render(modalContent);

// Initialize PromptManager
new PromptManager(promptModalContent, onPromptsSaved);

// Initialize SettingsManager
settingsManager = new SettingsManager();

// Check if we can show the main app right away
const apiKey = modelSelector.getApiKey();
const allModelsSet = modelSelector.areAllModelsSelected();

if (apiKey && allModelsSet) {
    console.log('Models already configured, showing main app.');
    reconfigureCoreServices(modelSelector.getSelectedModels());
    renderMainApp();
    initialSetupContainer.style.display = 'none';
    mainAppContainer.style.display = 'block';
} else {
    // Ensure main app is hidden if not configured
    mainAppContainer.style.display = 'none';
    initialSetupContainer.style.display = 'block';
}

console.log('Application initialized.'); 