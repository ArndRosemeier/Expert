import { getElementById, modalContainer, modalContent, testModalContainer, testModalContent, newProjectModalContainer, newProjectModalContent } from './dom-elements';
import { ProjectManager } from '../ProjectManager';
import { ProjectTemplate } from '../ProjectTemplate';
import * as state from '../state';
import { ModelSelector } from '../ModelSelector';
import { SettingsProfile } from '../SettingsManager';
import { QualityCriterion } from '../LoopOrchestrator';
import { PromptManager } from '../PromptManager';

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


// --- Generic Modal Functions ---
export function openGenericModal(content: string, onOpen?: () => void) {
    if (modalContainer && modalContent) {
        modalContent.innerHTML = content;
        modalContainer.style.display = 'flex';
        if (onOpen) {
            onOpen();
        }
    }
}

export function closeGenericModal() {
    if (modalContainer && modalContent) {
        modalContainer.style.display = 'none';
        modalContent.innerHTML = ''; // Clear content on close
    }
}


// --- Public Functions ---
export function openModal() {
    if (modalContainer) {
        renderSettingsModal();
        modalContainer.style.display = 'flex';
    }
}

export function closeModal() {
    if (modalContainer) {
        modalContainer.style.display = 'none';
    }
}

export function openTestModal(content: string) {
    if (testModalContainer && testModalContent) {
        testModalContent.innerHTML = content;
        testModalContainer.style.display = 'flex';
    }
}

export function closeTestModal() {
    if (testModalContainer) {
        testModalContainer.style.display = 'none';
    }
}

export function openNewProjectModal(onCreate: (title: string, template: ProjectTemplate) => void) {
    renderNewProjectModal(onCreate);
    if (newProjectModalContainer) {
        newProjectModalContainer.style.display = 'flex';
    }
}

export function closeNewProjectModal() {
    if (newProjectModalContainer) {
        newProjectModalContainer.style.display = 'none';
    }
}

export function renderSettingsModal() {
    const modelSelector = state.getModelSelector();
    if (!modalContent || !modelSelector) return;

    modalContent.innerHTML = `
        <style>
            .modal-content {
                width: 80vw;
                max-width: 1200px;
            }
            .modal-body {
                padding: 1.5rem 2rem;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }
            .settings-section {
                background-color: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 1.5rem;
            }
            .settings-bar {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }
            .settings-bar select,
            .settings-bar input[type="text"] {
                flex-grow: 1;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                line-height: 1.5;
                box-sizing: border-box;
            }
            .settings-bar button {
                padding: 0.75rem 1rem;
                border: none;
                border-radius: 8px;
                background-color: var(--button-bg);
                color: var(--button-text);
                cursor: pointer;
            }
            .settings-bar button:hover {
                background-color: var(--button-bg-hover);
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
            .criterion .criterion-text-display,
            .criterion textarea {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                line-height: 1.5;
                box-sizing: border-box;
            }
            .criterion .criterion-text-display {
                cursor: pointer;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .criterion .criterion-text-display:hover {
                background-color: #e9ecef;
            }
            .criterion input[type="number"] {
                width: 65px;
                flex-shrink: 0;
            }
            .criterion textarea {
                display: none; /* Hidden by default */
                resize: vertical;
                min-height: 80px;
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
            <div id="settings-models-container" class="settings-section">
                <h3>Models</h3>
                <!-- ModelSelector will be rendered here -->
            </div>
            <div id="settings-prompts-container" class="settings-section">
                <h3>Prompts</h3>
                <!-- PromptManager will be rendered here -->
            </div>
            <div id="settings-criteria-container" class="settings-section">
                <h3>Quality Criteria</h3>
                <div id="modal-criteria-list" style="flex-grow: 1; display: flex; flex-direction: column; gap: 0.75rem;"></div>
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
    `;

    // --- Render and Wire-Up Components ---

    // Model Selector
    const modelsContainer = getElementById('settings-models-container');
    modelSelector.render(modelsContainer);

    // Prompt Manager
    const promptsContainer = getElementById('settings-prompts-container');
    const settingsManager = state.getSettingsManager();
    if (settingsManager) {
        const promptManager = new PromptManager(promptsContainer, (prompts) => {
            // Just save the prompts. The orchestrator will be re-created with new prompts
            // the next time the models are selected, or on the next app load.
            state.setOrchestratorPrompts(prompts);
        }, settingsManager);
    }

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

    getElementById('close-settings-modal-btn').addEventListener('click', closeModal);
}

// --- Private Functions ---

function renderNewProjectModal(onCreate: (title: string, template: ProjectTemplate) => void) {
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

        if (!title.trim() || !template) {
            alert('Project Title and a valid template are required.');
            return;
        }
        
        onCreate(title, template);
    });

    getElementById('cancel-create-project-btn').addEventListener('click', closeNewProjectModal);
}

function autoResizeTextarea(this: HTMLTextAreaElement) {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
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