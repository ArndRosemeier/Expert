import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator, type LoopInput, type QualityCriterion } from './LoopOrchestrator';
import { PromptManager, defaultPrompts, type OrchestratorPrompts } from './PromptManager';
import { SettingsManager, type SettingsProfile } from './SettingsManager';

// --- DOM Elements ---
const initialSetupContainer = document.getElementById('initial-setup');
const mainAppContainer = document.getElementById('main-app');
const configureModelsBtn = document.getElementById('configure-models-btn');
const configurePromptsBtn = document.getElementById('configure-prompts-btn');
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');
const promptModalContainer = document.getElementById('prompt-modal-container');
const promptModalContent = document.getElementById('prompt-modal-content');

if (!initialSetupContainer || !mainAppContainer || !configureModelsBtn || !modalContainer || !modalContent || !configurePromptsBtn || !promptModalContainer || !promptModalContent) {
    throw new Error('Could not find required DOM elements');
}

// --- State ---
let openRouterClient: OpenRouterClient | null = null;
let modelSelector: ModelSelector | null = null;
let selectedModels: Record<string, string> = {};
let orchestrator: LoopOrchestrator | null = null;
let promptManager: PromptManager | null = null;
let settingsManager: SettingsManager | null = null;
let orchestratorPrompts: OrchestratorPrompts = { ...defaultPrompts };
const CRITERIA_STORAGE_KEY = 'expert_app_criteria';
const PROMPT_STORAGE_KEY_MAIN = 'expert_app_main_prompt';
const MAX_ITERATIONS_STORAGE_KEY = 'expert_app_max_iterations';

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
    if (initialSetupContainer!.style.display !== 'none') {
        renderMainApp();
        initialSetupContainer!.style.display = 'none';
        mainAppContainer!.style.display = 'block';
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
    mainAppContainer!.innerHTML = `
        <style>
            .criterion { display: flex; gap: 1rem; margin-bottom: 0.5rem; align-items: center; }
            .criterion input { flex-grow: 1; }
            #results-container pre { 
                white-space: pre-wrap; 
                word-break: break-all;
            }
            .response-block {
                padding: 1rem;
                border-radius: 8px;
                margin-top: 1rem;
            }
            .response-creator { background-color: #eef8ff; border: 1px solid #cce7ff; }
            .response-rater { background-color: #fffbeb; border: 1px solid #ffe58f; }
            .response-editor { background-color: #f6f0ff; border: 1px solid #e3d0ff; }
            #prompt { width: 100%; min-height: 100px; }
            .settings-bar { display: flex; gap: 1rem; margin-bottom: 1rem; align-items: center; }
        </style>

        <div class="settings-bar">
            <select id="settings-profile-select"></select>
            <input type="text" id="settings-profile-name" placeholder="New Profile Name"/>
            <button id="settings-save-btn">Save</button>
            <button id="settings-delete-btn">Delete</button>
        </div>

        <h2>Application Controls</h2>
        <div>
            <label for="prompt">Your Prompt:</label><br>
            <textarea id="prompt"></textarea>
        </div>
        
        <h3>Quality Criteria</h3>
        <div id="criteria-list">
            <div class="criterion">
                <input type="text" value="Clarity" placeholder="Criterion Name">
                <input type="number" value="8" min="1" max="10" placeholder="Goal (1-10)">
                <button class="remove-criterion-btn">Remove</button>
            </div>
            <div class="criterion">
                <input type="text" value="Friendliness" placeholder="Criterion Name">
                <input type="number" value="9" min="1" max="10" placeholder="Goal (1-10)">
                <button class="remove-criterion-btn">Remove</button>
            </div>
        </div>
        <button id="add-criterion-btn">Add Criterion</button>
        <button id="copy-criteria-btn">Copy Criteria</button>
        <button id="paste-criteria-btn">Paste Criteria</button>
        
        <hr>

        <div>
            <label for="max-iterations">Max Iterations:</label>
            <input type="number" id="max-iterations" min="1" max="20" style="width: 50px;">
        </div>
        
        <button id="start-loop-btn">Start Loop</button>
        <button id="stop-loop-btn" style="display: none;">Stop Loop</button>
        <div id="results-container">
            <div id="live-response-container" class="response-block response-creator" style="display: none;">
                <h3>Live Response</h3>
                <p id="live-response"></p>
            </div>
            <div id="ratings-container" class="response-block response-rater" style="display: none;">
                <h3>Latest Ratings</h3>
                <pre id="ratings"></pre>
            </div>
            <div id="editor-advice-container" class="response-block response-editor" style="display: none;">
                <h3>Editor's Advice</h3>
                <p id="editor-advice"></p>
            </div>
            <div id="final-result-container"></div>
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
            <input type="number" min="1" max="10" placeholder="Goal (1-10)">
            <button class="remove-criterion-btn">Remove</button>
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
        if (nameInput.value && goalInput.value) {
            criteria.push({
                name: nameInput.value,
                goal: parseInt(goalInput.value, 10)
            });
        }
    });
    return criteria;
}

function saveCriteriaToStorage() {
    const criteria = getCriteriaFromUI();
    localStorage.setItem(CRITERIA_STORAGE_KEY, JSON.stringify(criteria));
}

function loadCriteriaFromStorage() {
    const savedCriteria = localStorage.getItem(CRITERIA_STORAGE_KEY);
    if (savedCriteria) {
        const criteria = JSON.parse(savedCriteria) as QualityCriterion[];
        const list = document.getElementById('criteria-list');
        if (list) {
            list.innerHTML = ''; // Clear existing
            criteria.forEach(c => {
                const newItem = document.createElement('div');
                newItem.className = 'criterion';
                newItem.innerHTML = `
                    <input type="text" value="${c.name}" placeholder="Criterion Name">
                    <input type="number" value="${c.goal}" min="1" max="10" placeholder="Goal (1-10)">
                    <button class="remove-criterion-btn">Remove</button>
                `;
                list.appendChild(newItem);
            });
        }
    }
}

function onProgress(update: any) {
    const { type, payload } = update;

    if (type === 'creator') {
        const container = document.getElementById('live-response-container');
        const element = document.getElementById('live-response');
        if (container && element) {
            container.style.display = 'block';
            element.innerHTML = payload.response.replace(/\n/g, '<br>');
        }
    } else if (type === 'rating') {
        const container = document.getElementById('ratings-container');
        const element = document.getElementById('ratings');
        if (container && element) {
            container.style.display = 'block';
            element.textContent = JSON.stringify(payload.ratings, null, 2);
        }
    } else if (type === 'editor') {
        const container = document.getElementById('editor-advice-container');
        const element = document.getElementById('editor-advice');
        if (container && element) {
            container.style.display = 'block';
            element.innerHTML = payload.advice.replace(/\n/g, '<br>');
        }
    }
}

async function handleStartLoop() {
    if (!orchestrator) {
        alert('Please configure models first.');
        return;
    }

    const promptEl = document.getElementById('prompt') as HTMLTextAreaElement;
    const criteria = getCriteriaFromUI();
    const maxIterationsEl = document.getElementById('max-iterations') as HTMLInputElement;
    
    const loopInput: LoopInput = {
        prompt: promptEl.value,
        criteria: criteria,
        maxIterations: parseInt(maxIterationsEl.value, 10) || 5,
    };

    const startBtn = document.getElementById('start-loop-btn') as HTMLButtonElement;
    const stopBtn = document.getElementById('stop-loop-btn') as HTMLButtonElement;
    
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';

    // Clear previous results and show containers
    const resultsContainer = document.getElementById('results-container');
    const finalResultContainer = document.getElementById('final-result-container');
    if (resultsContainer) {
        // Hide all sub-containers initially
        (Array.from(resultsContainer.children) as HTMLElement[]).forEach(c => (c as HTMLElement).style.display = 'none');
    }
    
    if(finalResultContainer) {
        finalResultContainer.style.display = 'block';
        finalResultContainer.innerHTML = 'Looping...';
    }

    try {
        const result = await orchestrator.runLoop(loopInput, onProgress);
        if (finalResultContainer) {
            const successColor = result.success ? 'green' : 'orange';
            finalResultContainer.style.display = 'block';
            finalResultContainer.innerHTML = `
                <h3 style="color: ${successColor};">Loop Finished (Success: ${result.success})</h3>
                <p>Iterations: ${result.iterations}</p>
                <h3>Final Response:</h3>
                <p>${result.finalResponse.replace(/\n/g, '<br>')}</p>
                <h3>Full History:</h3>
                <pre>${JSON.stringify(result.history, null, 2)}</pre>
            `;
        }
    } catch (error) {
        if (finalResultContainer) {
            finalResultContainer.style.display = 'block';
            finalResultContainer.innerHTML = `<p style="color: red;">Error: ${error}</p>`;
        }
        console.error(error);
    } finally {
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
    }
}

function renderCriteria(criteria: QualityCriterion[]) {
    const list = document.getElementById('criteria-list');
    if (!list) return;
    list.innerHTML = '';
    
    criteria.forEach(c => {
        const newItem = document.createElement('div');
        newItem.className = 'criterion';
        newItem.innerHTML = `
            <input type="text" value="${c.name}" placeholder="Criterion Name">
            <input type="number" value="${c.goal}" min="1" max="10" placeholder="Goal (1-10)">
            <button class="remove-criterion-btn">Remove</button>
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
        const pastedCriteria = JSON.parse(text);

        if (!Array.isArray(pastedCriteria) || !pastedCriteria.every(c => c.name && typeof c.goal === 'number')) {
            throw new Error('Clipboard does not contain a valid criteria array.');
        }

        const currentCriteria = getCriteriaFromUI();
        const criteriaMap = new Map<string, QualityCriterion>();

        currentCriteria.forEach(c => criteriaMap.set(c.name, c));
        pastedCriteria.forEach((c: QualityCriterion) => criteriaMap.set(c.name, c));

        const newCriteria = Array.from(criteriaMap.values());

        renderCriteria(newCriteria);
        alert('Criteria pasted and merged!');

    } catch (err) {
        console.error('Failed to paste criteria: ', err);
        alert('Failed to paste criteria. Please make sure the clipboard contains a valid JSON array of criteria.');
    }
}

function updateSettingsUI(profile: SettingsProfile) {
    (document.getElementById('prompt') as HTMLTextAreaElement).value = profile.prompt;
    (document.getElementById('max-iterations') as HTMLInputElement).value = String(profile.maxIterations);
    renderCriteria(profile.criteria);
}

function updateProfileDropdown() {
    if (!settingsManager) return;
    const select = document.getElementById('settings-profile-select') as HTMLSelectElement;
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
    const nameInput = document.getElementById('settings-profile-name') as HTMLInputElement;
    const name = nameInput.value;
    if (!name) {
        alert('Please enter a name for the settings profile.');
        return;
    }

    const currentProfile: SettingsProfile = {
        prompt: (document.getElementById('prompt') as HTMLTextAreaElement).value,
        maxIterations: parseInt((document.getElementById('max-iterations') as HTMLInputElement).value, 10),
        criteria: getCriteriaFromUI(),
        selectedModels: modelSelector.getSelectedModels(),
    };
    
    settingsManager.saveProfile(name, currentProfile);
    nameInput.value = '';
    updateProfileDropdown();
}

function handleLoadProfile(event: Event) {
    if (!settingsManager || !modelSelector) return;
    const select = event.target as HTMLSelectElement;
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
    const select = document.getElementById('settings-profile-select') as HTMLSelectElement;
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

// Add listeners for criteria changes to save them
document.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#criteria-list .criterion')) {
        saveCriteriaToStorage();
    }
});
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'add-criterion-btn' || target.classList.contains('remove-criterion-btn')) {
        // Timeout to allow DOM update before saving
        setTimeout(saveCriteriaToStorage, 0);
    }
});

// Initialize ModelSelector
modelSelector = new ModelSelector(onModelsSelected, closeModal);
modelSelector.render(modalContent);

// Initialize PromptManager
promptManager = new PromptManager(promptModalContent, onPromptsSaved);

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
    mainAppContainer!.style.display = 'none';
    initialSetupContainer!.style.display = 'block';
}

console.log('Application initialized.'); 