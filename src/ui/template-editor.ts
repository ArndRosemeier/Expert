import { getElementById } from "./dom-elements";
import { openGenericModal, closeGenericModal } from './modal-manager';
import { ProjectTemplate } from "../ProjectTemplate";
import * as state from '../state';

let currentTemplateName: string | null = null;
let isDirty = false;

// Main entry point
export function openTemplateEditor() {
    const templateManager = state.getTemplateManager();
    if (!templateManager) {
        alert("Template manager is not initialized.");
        return;
    }

    const templateNames = templateManager.getTemplateNames();
    currentTemplateName = templateNames[0] || null;

    const content = `
        <style>
            #template-editor-container { display: flex; flex-direction: column; gap: 1.5rem; }
            .template-controls { display: flex; gap: 1rem; align-items: center; }
            .template-controls select, .template-controls input { flex-grow: 1; padding: 0.5rem; }
            .hierarchy-editor { display: flex; flex-direction: column; gap: 0.5rem; }
            .hierarchy-layer { display: flex; align-items: center; gap: 0.5rem; }
            .hierarchy-layer input { flex-grow: 1; padding: 0.5rem; }
            .template-actions { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem; }
        </style>
        <div id="template-editor-container">
            <h2>Manage Templates</h2>
            <div class="template-controls">
                <select id="template-select"></select>
                <button id="delete-template-btn" class="button button-danger">Delete</button>
            </div>
            <div class="template-controls">
                <input type="text" id="template-name-input" placeholder="Enter template name..."/>
                <button id="save-as-new-btn" class="button button-secondary">Save as New</button>
            </div>
            <div id="hierarchy-editor-container">
                <h3>Hierarchy Levels</h3>
                <div id="hierarchy-editor" class="hierarchy-editor"></div>
                <button id="add-layer-btn" class="button button-secondary" style="margin-top: 0.5rem;">+ Add Level</button>
            </div>
            <div class="template-actions">
                <button id="cancel-templates-btn" class="button button-secondary">Cancel</button>
                <button id="save-template-btn" class="button button-primary">Save Changes</button>
            </div>
        </div>
    `;
    
    openGenericModal(content, setupTemplateEditorListeners);
}

// Setup all event listeners for the modal
function setupTemplateEditorListeners() {
    isDirty = false;
    
    // Populate dropdown and initial view
    populateTemplateSelector();
    renderCurrentTemplateView();

    // Attach listeners
    getElementById('template-select').addEventListener('change', handleTemplateSelect);
    getElementById('save-template-btn').addEventListener('click', handleSave);
    getElementById('save-as-new-btn').addEventListener('click', handleSaveAsNew);
    getElementById('delete-template-btn').addEventListener('click', handleDelete);
    getElementById('add-layer-btn').addEventListener('click', handleAddLayer);
    getElementById('cancel-templates-btn').addEventListener('click', handleCancel);

    // Listener for removing layers (delegated)
    getElementById('hierarchy-editor').addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('remove-layer-btn')) {
            handleRemoveLayer(e.target as HTMLElement);
        }
    });

    // Listener for tracking changes
    getElementById('template-editor-container').addEventListener('input', () => { isDirty = true; });
}

// --- Event Handlers ---

function handleTemplateSelect(event: Event) {
    if (isDirty && !confirm("You have unsaved changes. Are you sure you want to switch?")) {
        (event.target as HTMLSelectElement).value = currentTemplateName || '';
        return;
    }
    currentTemplateName = (event.target as HTMLSelectElement).value;
    isDirty = false;
    renderCurrentTemplateView();
}

function handleSave() {
    const templateManager = state.getTemplateManager();
    const templateNameInput = getElementById<HTMLInputElement>('template-name-input');
    if (!templateManager || !currentTemplateName) return;

    const newName = templateNameInput.value.trim();
    if (!newName) {
        alert("Template name cannot be empty.");
        return;
    }

    const template = getTemplateFromUI();
    
    try {
        // If the name has changed, we need to delete the old one
        if (newName !== currentTemplateName) {
            templateManager.deleteTemplate(currentTemplateName);
        }
        templateManager.saveTemplate(newName, template);
        isDirty = false;
        alert(`Template '${newName}' saved successfully.`);
        closeGenericModal();
    } catch (error: any) {
        alert(`Error saving template: ${error.message}`);
    }
}

function handleSaveAsNew() {
    const templateManager = state.getTemplateManager();
    const templateNameInput = getElementById<HTMLInputElement>('template-name-input');
    if (!templateManager) return;

    const newName = templateNameInput.value.trim();
    if (!newName) {
        alert("Please enter a name for the new template.");
        return;
    }

    if (templateManager.getTemplate(newName)) {
        alert(`A template named '${newName}' already exists. Please choose a different name.`);
        return;
    }

    const template = getTemplateFromUI();

    try {
        templateManager.saveTemplate(newName, template);
        isDirty = false;
        alert(`Template '${newName}' created successfully.`);
        // Refresh the selector to include the new template
        currentTemplateName = newName;
        populateTemplateSelector();
        renderCurrentTemplateView();
    } catch (error: any) {
        alert(`Error creating template: ${error.message}`);
    }
}


function handleDelete() {
    const templateManager = state.getTemplateManager();
    if (!templateManager || !currentTemplateName) return;

    if (confirm(`Are you sure you want to delete the template '${currentTemplateName}'?`)) {
        try {
            templateManager.deleteTemplate(currentTemplateName);
            const templateNames = templateManager.getTemplateNames();
            currentTemplateName = templateNames[0] || null;
            isDirty = false;
            populateTemplateSelector();
            renderCurrentTemplateView();
            alert("Template deleted.");
        } catch (error: any) {
            alert(`Error deleting template: ${error.message}`);
        }
    }
}

function handleAddLayer() {
    const editor = getElementById('hierarchy-editor');
    const newIndex = editor.children.length;
    const newLayer = createLayerElement('', newIndex);
    editor.appendChild(newLayer);
    isDirty = true;
}

function handleRemoveLayer(button: HTMLElement) {
    button.closest('.hierarchy-layer')?.remove();
    // Re-index remaining layers
    const editor = getElementById('hierarchy-editor');
    Array.from(editor.children).forEach((layer, index) => {
        const input = layer.querySelector('input');
        if (input) input.dataset.index = String(index);
    });
    isDirty = true;
}

function handleCancel() {
    if (isDirty && !confirm("You have unsaved changes. Are you sure you want to cancel?")) {
        return;
    }
    closeGenericModal();
}

// --- UI Rendering ---

function populateTemplateSelector() {
    const templateManager = state.getTemplateManager();
    const select = getElementById<HTMLSelectElement>('template-select');
    if (!templateManager || !select) return;

    const names = templateManager.getTemplateNames();
    select.innerHTML = names.map(name => `<option value="${name}">${name}</option>`).join('');
    
    if (currentTemplateName) {
        select.value = currentTemplateName;
    }
}

function renderCurrentTemplateView() {
    const templateManager = state.getTemplateManager();
    const nameInput = getElementById<HTMLInputElement>('template-name-input');
    const editor = getElementById('hierarchy-editor');
    if (!templateManager || !nameInput || !editor) return;

    if (!currentTemplateName) {
        nameInput.value = '';
        editor.innerHTML = 'No template selected.';
        return;
    }

    const template = templateManager.getTemplate(currentTemplateName);
    if (!template) {
        nameInput.value = '';
        editor.innerHTML = `Template '${currentTemplateName}' not found.`;
        return;
    }

    nameInput.value = template.name;
    editor.innerHTML = ''; // Clear previous layers
    template.hierarchyLevels.forEach((level, index) => {
        const layerElement = createLayerElement(level, index);
        editor.appendChild(layerElement);
    });
}

function createLayerElement(level: string, index: number): HTMLElement {
    const div = document.createElement('div');
    div.className = 'hierarchy-layer';
    div.innerHTML = `
        <input type="text" value="${level}" data-index="${index}" placeholder="e.g., Chapter" />
        <button class="remove-layer-btn button button-danger">-</button>
    `;
    return div;
}

function getTemplateFromUI(): ProjectTemplate {
    const nameInput = getElementById<HTMLInputElement>('template-name-input');
    const editor = getElementById('hierarchy-editor');
    const name = nameInput.value.trim();
    
    const levels: string[] = [];
    editor.querySelectorAll<HTMLInputElement>('.hierarchy-layer input').forEach(input => {
        levels.push(input.value);
    });
    
    // For now, scaffolding docs are not editable in this UI
    const templateManager = state.getTemplateManager();
    const existingTemplate = currentTemplateName ? templateManager?.getTemplate(currentTemplateName) : undefined;
    const scaffoldingDocs = existingTemplate ? existingTemplate.scaffoldingDocuments : [];

    return new ProjectTemplate(name, levels, scaffoldingDocs);
} 