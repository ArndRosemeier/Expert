import { getElementById, modalContainer, modalContent, testModalContainer, testModalContent, newProjectModalContainer, newProjectModalContent } from './dom-elements';
import { ProjectManager } from '../ProjectManager';
import { ProjectTemplate } from '../ProjectTemplate';
import * as state from '../state';
import { ModelSelector } from '../ModelSelector';
import { SettingsProfile, DEFAULT_CRITERIA } from '../SettingsManager';
import { QualityCriterion } from '../types';
import { PromptManager } from '../PromptManager';

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
            <div id="settings-profile-container" class="settings-section">
                <div class="settings-bar">
                    <select id="modal-profile-select"></select>
                    <button id="modal-load-profile-btn">Load</button>
                    <input type="text" id="modal-new-profile-name" placeholder="New Profile Name...">
                    <button id="modal-save-profile-btn">Save</button>
                    <button id="modal-delete-profile-btn" class="button-danger">Delete</button>
                </div>
            </div>
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
    const modalMaxIterations = getElementById('modal-max-iterations') as HTMLInputElement;
    const modalDefaultCriteriaBtn = getElementById('modal-default-criteria-btn');

    // --- Profile Management ---
    const settingsManagerInstance = state.getSettingsManager();
    const profileSelect = getElementById('modal-profile-select') as HTMLSelectElement;
    const newProfileNameInput = getElementById('modal-new-profile-name') as HTMLInputElement;

    const populateProfileSelector = () => {
        if (!settingsManagerInstance) return;
        const profiles = settingsManagerInstance.getProfileNames();
        const lastUsed = settingsManagerInstance.getLastUsedProfileName();
        profileSelect.innerHTML = profiles.map(p => `<option value="${p}" ${p === lastUsed ? 'selected' : ''}>${p}</option>`).join('');
    };

    const applyProfileToUI = (profile: SettingsProfile | null) => {
        if (!profile || !modelSelector) return;
        
        // Apply models
        if (profile.selectedModels) modelSelector.setSelectedModels(profile.selectedModels);
        
        // Apply criteria and iterations
        renderCriteria(modalCriteriaList, profile.criteria);
        modalMaxIterations.value = String(profile.maxIterations);

        // Note: Prompts are handled by the PromptManager instance which is aware of the SettingsManager
        // Re-rendering or a more direct update might be needed if prompts are to be swapped dynamically.
        // For now, we assume the PromptManager reflects the correct state or is re-initialized.
    };

    getElementById('modal-load-profile-btn').addEventListener('click', () => {
        if (!settingsManagerInstance) return;
        const profileName = profileSelect.value;
        const profile = settingsManagerInstance.getProfile(profileName);
        applyProfileToUI(profile || null);
        settingsManagerInstance.setLastUsedProfile(profileName);
        alert(`Profile "${profileName}" loaded.`);
    });

    getElementById('modal-save-profile-btn').addEventListener('click', () => {
        if (!settingsManagerInstance || !modelSelector) return;
        let profileName = newProfileNameInput.value.trim();
        if (!profileName) {
            profileName = profileSelect.value;
        }
        if (!profileName) {
            alert('Please enter a name for the new profile or select an existing one to overwrite.');
            return;
        }

        const currentSettings: SettingsProfile = {
            selectedModels: modelSelector.getSelectedModels(),
            criteria: getCriteriaFromUI(modalCriteriaList),
            maxIterations: parseInt(modalMaxIterations.value, 10),
            prompt: '' // Prompt is managed separately, but the property is required.
        };

        settingsManagerInstance.saveProfile(profileName, currentSettings);
        settingsManagerInstance.setLastUsedProfile(profileName);
        newProfileNameInput.value = '';
        populateProfileSelector();
        profileSelect.value = profileName;
        alert(`Profile "${profileName}" saved.`);
    });

    getElementById('modal-delete-profile-btn').addEventListener('click', () => {
        const profileName = profileSelect.value;
        if (!settingsManagerInstance || !profileName) return;

        if (confirm(`Are you sure you want to delete the profile "${profileName}"?`)) {
            settingsManagerInstance.deleteProfile(profileName);
            populateProfileSelector();
            // Load the default profile after deleting
            const defaultProfile = settingsManagerInstance.getProfile('default');
            applyProfileToUI(defaultProfile || null);
            alert(`Profile "${profileName}" deleted.`);
        }
    });


    // Initial Population
    populateProfileSelector();
    const lastUsedProfile = settingsManagerInstance?.getLastUsedProfile();
    applyProfileToUI(lastUsedProfile || null);


    // --- Old Criteria Editor Wiring ---
    getElementById('modal-add-criterion-btn').addEventListener('click', () => {
        const newCriterion: QualityCriterion = {
            name: "New Criterion...",
            goal: 8,
            weight: 1.0,
            description: ""
        };
        const newItem = createCriterionElement(newCriterion);
        modalCriteriaList.appendChild(newItem);
        
        const textarea = newItem.querySelector('textarea');
        if (textarea) {
            textarea.style.display = 'block';
            textarea.focus();
            autoResizeTextarea.call(textarea);
            const textDisplay = newItem.querySelector('.criterion-text-display');
            if(textDisplay) (textDisplay as HTMLElement).style.display = 'none';
        }
    });
    modalDefaultCriteriaBtn.addEventListener('click', () => {
        if (confirm("This will replace your current criteria list with the application defaults. Are you sure?")) {
            renderCriteria(modalCriteriaList, DEFAULT_CRITERIA);
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
    const templateManager = state.getTemplateManager();
    if (!templateManager) {
        // This case should ideally not happen if initialization is correct.
        newProjectModalContent.innerHTML = `<p>Error: Template Manager not found.</p>`;
        return;
    }
    const templateNames = templateManager.getTemplateNames();
    const optionsHtml = templateNames.map(name => `<option value="${name}">${name}</option>`).join('');

    newProjectModalContent.innerHTML = `
        <h2>Create New Project</h2>
        <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="project-title-input">Project Title</label>
            <input type="text" id="project-title-input" placeholder="e.g., 'My Sci-Fi Epic'">
        </div>
        <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="project-template-select">Project Template</label>
            <select id="project-template-select">
                ${optionsHtml}
            </select>
        </div>
        <div class="button-group" style="display: flex; justify-content: flex-end; gap: 1rem;">
            <button id="cancel-create-project-btn" class="button button-secondary">Cancel</button>
            <button id="confirm-create-project-btn" class="button button-primary">Create</button>
        </div>
    `;

    getElementById('confirm-create-project-btn').addEventListener('click', () => {
        const title = getElementById<HTMLInputElement>('project-title-input').value;
        const templateName = getElementById<HTMLSelectElement>('project-template-select').value;
        const template = templateManager.getTemplate(templateName);

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

function createCriterionElement(criterion: QualityCriterion): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'criterion';

    const textarea = document.createElement('textarea');
    textarea.placeholder = "e.g., 'Clarity and conciseness'";
    textarea.value = criterion.name;
    textarea.addEventListener('input', autoResizeTextarea);
    textarea.addEventListener('focus', function() { this.selectionStart = this.selectionEnd = this.value.length; });

    const goalInput = document.createElement('input');
    goalInput.type = 'number';
    goalInput.min = '1';
    goalInput.max = '10';
    goalInput.value = criterion.goal.toString();
    goalInput.title = 'Goal (1-10)';

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.min = '0.1';
    weightInput.max = '2.0';
    weightInput.step = '0.1';
    weightInput.value = criterion.weight.toString();
    weightInput.title = 'Weight (0.1-2.0)';
    
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
    
    updateDisplay(criterion.name);
    textarea.value = criterion.name;
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
    div.appendChild(goalInput);
    div.appendChild(weightInput);
    div.appendChild(removeBtn);

    return div;
}

function getCriteriaFromUI(container: HTMLElement): QualityCriterion[] {
    const criteria: QualityCriterion[] = [];
    const criterionElements = container.querySelectorAll('.criterion');
    criterionElements.forEach(el => {
        const textarea = el.querySelector<HTMLTextAreaElement>('textarea');
        const inputs = el.querySelectorAll<HTMLInputElement>('input[type="number"]');
        if (textarea && inputs.length === 2) {
            const name = textarea.value;
            const goal = parseInt(inputs[0].value, 10);
            const weight = parseFloat(inputs[1].value);
            if (name && !isNaN(goal) && !isNaN(weight)) {
                criteria.push({ name, goal, weight });
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
        'weight' in item &&
        typeof item.name === 'string' &&
        typeof item.goal === 'number' &&
        typeof item.weight === 'number'
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