import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator, type LoopInput, type QualityCriterion } from './LoopOrchestrator';
import { PromptManager, type OrchestratorPrompts, defaultPrompts } from './PromptManager';

// --- DOM Elements ---
const initialSetupContainer = document.getElementById('initial-setup');
const configureModelsBtn = document.getElementById('configure-models-btn');
const configurePromptsBtn = document.getElementById('configure-prompts-btn');
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');
const promptModalContainer = document.getElementById('prompt-modal-container');
const promptModalContent = document.getElementById('prompt-modal-content');
const mainAppContainer = document.getElementById('main-app');

if (!initialSetupContainer || !configureModelsBtn || !modalContainer || !modalContent || !mainAppContainer || !configurePromptsBtn || !promptModalContainer || !promptModalContent) {
    throw new Error('Could not find required DOM elements');
}

// --- State ---
let modelSelector: ModelSelector | null = null;
let selectedModels: Record<string, string> = {};
let orchestrator: LoopOrchestrator | null = null;
let promptManager: PromptManager | null = null;
let orchestratorPrompts: OrchestratorPrompts = defaultPrompts;
const CRITERIA_STORAGE_KEY = 'expert_app_criteria';
let openRouterClient: OpenRouterClient | null = null;

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

function onModelsSelected(models: Record<string, string>) {
    selectedModels = models;

    const apiKey = modelSelector?.getApiKey();
    if (apiKey) {
        openRouterClient = new OpenRouterClient(apiKey, selectedModels);
        orchestrator = new LoopOrchestrator(openRouterClient, 5, orchestratorPrompts);
        console.log('OpenRouter client and Orchestrator configured.');
    }
    
    closeModal();
    renderMainApp();
    if (initialSetupContainer) initialSetupContainer.style.display = 'none';
    if (mainAppContainer) mainAppContainer.style.display = 'block';
}

function onPromptsSaved(prompts: OrchestratorPrompts) {
    orchestratorPrompts = prompts;
    // ... existing code ...
    // ... existing code ...
    // Initialize PromptManager
    promptManager = new PromptManager(promptModalContent, onPromptsSaved);

    // Check if we can show the main app right away
    const apiKey = modelSelector.getApiKey();
    const allModelsSet = modelSelector.areAllModelsSelected();

    if (apiKey && allModelsSet) {
        console.log('Models already configured, showing main app.');
        onModelsSelected(modelSelector.getSelectedModels());
    }

    console.log('Application initialized.');
}

function renderMainApp() {
    // ... existing code ...
}

// ... existing code ...

<p>Configure your LLM agents and start a curated feedback loop.</p>
<button id="configure-models-btn">Configure Models</button>
<button id="configure-prompts-btn">Configure Prompts</button>
<hr>
<div id="main-app">
// ... existing code ...
</div>
</div>

<div id="modal-container">
    <div id="modal-content">
        <!-- ModelSelector will be rendered here -->
    </div>
</div>

<div id="prompt-modal-container" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center;">
    <div id="prompt-modal-content" style="background-color: white; padding: 2rem; border-radius: 8px; max-width: 80vw; max-height: 80vh; overflow-y: auto;">
        <!-- PromptManager will be rendered here -->
    </div>
</div>

<script type="module" src="/src/main.ts"></script>
</body>
</html> 