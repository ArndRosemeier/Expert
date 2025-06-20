import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator, type LoopInput, type QualityCriterion, type Rating, type ProgressCallback, type LoopHistoryItem } from './LoopOrchestrator';
import { PromptManager, defaultPrompts, type OrchestratorPrompts } from './PromptManager';
import { SettingsManager, type SettingsProfile } from './SettingsManager';

// --- Fresh Start Debug Logic ---
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('clean') === 'true') {
    console.log('Clean start requested. Clearing local storage...');
    localStorage.removeItem('openrouter_api_key');
    localStorage.removeItem('openrouter_model_purposes');
    localStorage.removeItem('expert_app_prompts');
    localStorage.removeItem('expert_app_settings_profiles');
    localStorage.removeItem('expert_app_settings_last_profile');
    
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
const configureModelsBtn = getElementById<HTMLButtonElement>('configure-models-btn');
const configurePromptsBtn = getElementById<HTMLButtonElement>('configure-prompts-btn');
const modalContainer = getElementById<HTMLElement>('modal-container');
const modalContent = getElementById<HTMLElement>('modal-content');
const promptModalContainer = getElementById<HTMLElement>('prompt-modal-container');
const promptModalContent = getElementById<HTMLElement>('prompt-modal-content');

if (!mainAppContainer || !configureModelsBtn || !modalContainer || !modalContent || !configurePromptsBtn || !promptModalContainer || !promptModalContent) {
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
    if (modalContainer && modelSelector) {
        modelSelector.loadFromStorage();
        modelSelector.update();
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
    if (!isAppRendered) {
        renderMainApp();
        mainAppContainer.style.display = 'block';
        isAppRendered = true;
    }
}

function onPromptsSaved(prompts: OrchestratorPrompts) {
    orchestratorPrompts = prompts;
    if (openRouterClient) {
        orchestrator = new LoopOrchestrator(openRouterClient, orchestratorPrompts);
    }
    closePromptModal();
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
                <div id="criteria-list"></div>
                <div class="criteria-actions">
                    <button id="add-criterion-btn" class="button button-secondary">Add Criterion</button>
                    <button id="default-criteria-btn" class="button button-secondary">Load Defaults</button>
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

    // --- Settings Profile Event Listeners ---
    document.getElementById('settings-save-btn')?.addEventListener('click', handleSaveProfile);
    document.getElementById('settings-delete-btn')?.addEventListener('click', handleDeleteProfile);
    document.getElementById('settings-profile-select')?.addEventListener('change', handleLoadProfile);
    
    // --- Other Listeners ---
    document.getElementById('add-criterion-btn')?.addEventListener('click', () => {
        const list = document.getElementById('criteria-list');
        if (!list) return;

        const newItem = createCriterionElement();
        list.appendChild(newItem);
        
        const textarea = newItem.querySelector('textarea') as HTMLTextAreaElement;
        textarea?.focus();
    });

    document.getElementById('copy-criteria-btn')?.addEventListener('click', handleCopyCriteria);
    document.getElementById('paste-criteria-btn')?.addEventListener('click', handlePasteCriteria);
    document.getElementById('default-criteria-btn')?.addEventListener('click', handleLoadDefaultCriteria);

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

    getElementById('iteration-slider')?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        viewedIteration = parseInt(target.value, 10);
        renderDataForIteration(viewedIteration);
    });

    loadAndApplyLastUsedProfile();

    if (getCriteriaFromUI().length === 0) {
        renderCriteria(defaultProseCriteria);
    }
}

function autoResizeTextarea(this: HTMLTextAreaElement) {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
}

function getShortCriterionName(fullName: string): string {
    const stopIndex = fullName.indexOf('.');
    return stopIndex > 0 ? fullName.substring(0, stopIndex) : fullName;
}

function getCriteriaFromUI(): QualityCriterion[] {
    const criteriaNodes = document.querySelectorAll('#criteria-list .criterion');
    const criteria: QualityCriterion[] = [];
    criteriaNodes.forEach(node => {
        const nameInput = node.querySelector('textarea') as HTMLTextAreaElement;
        const goalInput = node.querySelector('input[type="number"]') as HTMLInputElement;

        let name = '';
        const isActiveElement = document.activeElement === nameInput;

        if (isActiveElement) {
            // If the textarea is being edited, its value is the full text.
            name = nameInput.value;
        } else {
            // Otherwise, the full text is in the dataset.
            name = nameInput.dataset.fullText || nameInput.value;
        }

        if (name.trim() && goalInput?.value) {
            criteria.push({
                name: name.trim(),
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
                        <span class="rating-name">${getShortCriterionName(item.criterion)} (Goal: ${item.goal})</span>
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

function findBestFailedIteration(history: LoopHistoryItem[]): number {
    let bestIteration = -1;
    let minDeviation = Infinity;

    const iterations = [...new Set(history.map(h => h.iteration))];

    for (const iter of iterations) {
        const ratingHistoryItem = history.find(h => h.iteration === iter && h.type === 'rating');
        if (!ratingHistoryItem) continue;

        const ratings = (ratingHistoryItem.payload as RatingPayload).ratings;
        const totalDeviation = ratings.reduce((acc, r) => {
            const deviation = r.goal - r.score;
            return acc + (deviation > 0 ? deviation : 0);
        }, 0);

        if (totalDeviation < minDeviation) {
            minDeviation = totalDeviation;
            bestIteration = iter;
        }
    }

    return bestIteration > 0 ? bestIteration : (iterations.pop() || 1);
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

    loopHistory = [];
    viewedIteration = 0;
    getElementById<HTMLDivElement>('history-controls').style.display = 'none';

    const promptEl = getElementById<HTMLTextAreaElement>('prompt');
    const criteria = getCriteriaFromUI();

    if (!promptEl.value.trim()) {
        alert('Please enter a prompt before starting the loop.');
        return;
    }

    if (criteria.length === 0) {
        alert('Please define at least one quality criterion before starting the loop.');
        return;
    }

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

function renderCriteria(criteria: QualityCriterion[]) {
    const list = getElementById<HTMLElement>('criteria-list');
    list.innerHTML = '';
    
    criteria.forEach(c => {
        const newItem = createCriterionElement(c);
        list.appendChild(newItem);
    });
}

function createCriterionElement(criterion?: QualityCriterion): HTMLDivElement {
    const newItem = document.createElement('div');
    newItem.className = 'criterion';
    newItem.innerHTML = `
        <textarea placeholder="Criterion Name. Description..." rows="1"></textarea>
        <input type="number" min="1" max="10" placeholder="Goal">
        <button class="remove-criterion-btn" title="Remove">&times;</button>
    `;

    const textarea = newItem.querySelector('textarea') as HTMLTextAreaElement;
    const goalInput = newItem.querySelector('input[type="number"]') as HTMLInputElement;

    if (criterion) {
        textarea.value = getShortCriterionName(criterion.name);
        textarea.dataset.fullText = criterion.name;
        goalInput.value = String(criterion.goal);
    }
    
    textarea.addEventListener('focus', () => {
        textarea.value = textarea.dataset.fullText || '';
        autoResizeTextarea.call(textarea);
    });

    textarea.addEventListener('blur', () => {
        const fullText = textarea.value.trim();
        if (fullText) {
            textarea.dataset.fullText = fullText;
            textarea.value = getShortCriterionName(fullText);
        } else {
            delete textarea.dataset.fullText;
            textarea.value = '';
        }
        textarea.style.height = 'auto';
    });

    textarea.addEventListener('input', autoResizeTextarea);

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLElement).blur();
        }
    });

    newItem.querySelector('.remove-criterion-btn')?.addEventListener('click', () => newItem.remove());
    
    return newItem;
}

function handleLoadDefaultCriteria() {
    const currentCriteria = getCriteriaFromUI();
    const criteriaMap = new Map<string, QualityCriterion>();

    // Add current criteria to the map first to preserve them
    currentCriteria.forEach(c => criteriaMap.set(c.name, c));
    
    // Add/overwrite with default criteria
    defaultProseCriteria.forEach(c => criteriaMap.set(c.name, c));

    const newCriteria = Array.from(criteriaMap.values());

    renderCriteria(newCriteria);
    alert('Default criteria loaded and merged!');
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
        prompt: getElementById<HTMLTextAreaElement>('prompt').value,
        maxIterations: parseInt(getElementById<HTMLInputElement>('max-iterations').value, 10),
        criteria: getCriteriaFromUI(),
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
    mainAppContainer.style.display = 'block';
    isAppRendered = true;
} else {
    // For new users, open the configuration modal immediately.
    mainAppContainer.style.display = 'none';
    openModal();
}

console.log('Application initialized.'); 