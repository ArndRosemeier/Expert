import { getElementById } from "./dom-elements";
import { showGenericModal } from './modals/index';
import { ProjectTemplate } from "../ProjectTemplate";
import { SingleTemplateEditor } from './components/SingleTemplateEditor';
import * as state from '../state';

let currentTemplateName: string | null = null;
let isDirty = false;
let isPopulating = false; // Semaphore to prevent dirty flag during UI population
let singleTemplateEditor: SingleTemplateEditor | null = null;

// Main entry point
export function openTemplateEditor() {
    try {
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
            .template-editor-section { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; background: #f9f9f9; }
        </style>
        <div id="template-editor-container">
            <h2>Manage Templates</h2>
            <div class="template-controls">
                <select id="template-select"></select>
                <button id="delete-template-btn" class="button button-danger">Delete</button>
                <button id="restore-defaults-btn" class="button button-warning">🔄 Restore Defaults</button>
            </div>
            <div class="template-controls">
                <button id="save-as-new-btn" class="button button-secondary">Save as New</button>
            </div>
            <div class="template-editor-section">
                <div id="single-template-editor-container"></div>
            </div>
        </div>
    `;
    
    const modal = showGenericModal(
        {
            content: content,
            actions: [
                {
                    id: 'cancel',
                    label: '✕ Close',
                    type: 'secondary',
                    handler: async () => {
                        if (isDirty && !confirm("You have unsaved changes. Are you sure you want to cancel?")) {
                            throw new Error('__KEEP_MODAL_OPEN__');
                        }
                        void modal.close();
                    }
                },
                {
                    id: 'save',
                    label: 'Save Changes',
                    type: 'primary',
                    handler: async () => {
                        handleSaveFromModal(modal);
                    }
                }
            ]
        },
        {
            title: 'Manage Templates',
            maxWidth: '800px'
        },
        {
            onOpen: () => {
                setupTemplateEditorListeners();
            }
        }
    );
        
    } catch (error) {
        console.error('❌ Error in openTemplateEditor:', error);
        alert('Failed to open template editor: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}

// Setup all event listeners for the modal - ENHANCED with EventManager
function setupTemplateEditorListeners() {
    isDirty = false;
    
    // Populate dropdown and initial view
    populateTemplateSelector();
    renderCurrentTemplateView();

    // 🔧 NEW: Use EventManager for robust event delegation to prevent listener loss
    void import('./event-manager').then(({ eventManager }) => {
        const container = getElementById('template-editor-container');
        if (!container) {
            console.error('❌ Template editor container not found');
            return;
        }

        // Add delegated event listeners that survive DOM changes
        eventManager.addDelegatedEvent(container, 'change', '#template-select', handleTemplateSelect);
        eventManager.addDelegatedEvent(container, 'click', '#save-as-new-btn', handleSaveAsNew);
        eventManager.addDelegatedEvent(container, 'click', '#delete-template-btn', handleDelete);
        eventManager.addDelegatedEvent(container, 'click', '#restore-defaults-btn', handleRestoreDefaults);

        console.log('✅ Template editor listeners set up with EventManager');
        console.log('📊 EventManager status:', eventManager.getDebugInfo());
    }).catch((error) => {
        console.error('❌ Failed to setup enhanced template editor listeners, falling back to direct listeners:', error);
        
        // Fallback to original direct listeners if EventManager fails
        getElementById('template-select').addEventListener('change', handleTemplateSelect);
        getElementById('save-as-new-btn').addEventListener('click', handleSaveAsNew);
        getElementById('delete-template-btn').addEventListener('click', handleDelete);
        getElementById('restore-defaults-btn').addEventListener('click', handleRestoreDefaults);
    });
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
    if (!templateManager || !currentTemplateName || !singleTemplateEditor) return;

    const template = singleTemplateEditor.getTemplateFromUI();
    const newName = template.name.trim();
    if (!newName) {
        alert("Template name cannot be empty.");
        return;
    }
    
    try {
        // If the name has changed, check if we're creating a new template or renaming
        if (newName !== currentTemplateName) {
            // Check if the new name already exists
            if (templateManager.getTemplate(newName)) {
                alert(`A template named '${newName}' already exists. Please choose a different name or use 'Save as New'.`);
                return;
            }
            
            // Only delete the old template if there are multiple templates
            const templateNames = templateManager.getTemplateNames();
            if (templateNames.length > 1) {
            templateManager.deleteTemplate(currentTemplateName);
            }
        }
        
        templateManager.saveTemplate(newName, template);
        isDirty = false;
        alert(`Template '${newName}' saved successfully.`);
        
        // Update current template name and refresh UI
        currentTemplateName = newName;
        populateTemplateSelector();
        renderCurrentTemplateView();
        
        // Modal will be closed by the caller
    } catch (error: any) {
        alert(`Error saving template: ${error.message}`);
        throw error; // Re-throw to prevent modal from closing on error
    }
}

function handleSaveAsNew() {
    const templateManager = state.getTemplateManager();
    if (!templateManager || !singleTemplateEditor) return;

    const template = singleTemplateEditor.getTemplateFromUI();
    const newName = template.name.trim();
    if (!newName) {
        alert("Please enter a name for the new template.");
        return;
    }

    if (templateManager.getTemplate(newName)) {
        alert(`A template named '${newName}' already exists. Please choose a different name.`);
        return;
    }

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

function handleRestoreDefaults() {
    const templateManager = state.getTemplateManager();
    if (!templateManager) return;

    if (confirm("Are you sure you want to restore all templates to defaults? This will remove any custom templates you have created.")) {
        try {
            templateManager.restoreDefaults();
            const templateNames = templateManager.getTemplateNames();
            currentTemplateName = templateNames[0] || null;
            isDirty = false;
            populateTemplateSelector();
            renderCurrentTemplateView();
            alert("Templates restored to defaults successfully.");
        } catch (error: any) {
            alert(`Error restoring defaults: ${error.message}`);
        }
    }
}



function handleSaveFromModal(modal: any) {
    try {
        handleSave();
        void modal.close();
    } catch (error) {
        // Error already shown in handleSave, just keep modal open
        throw new Error('__KEEP_MODAL_OPEN__');
    }
}

function handleCancel() {
    if (isDirty && !confirm("You have unsaved changes. Are you sure you want to cancel?")) {
        return;
    }
    // Modal closing is now handled by the new modal system
}

// --- UI Rendering ---

function populateTemplateSelector() {
    const templateManager = state.getTemplateManager();
    const select = getElementById<HTMLSelectElement>('template-select');
    if (!templateManager || !select) return;

    // Set semaphore to prevent dirty flag during UI population
    isPopulating = true;

    const names = templateManager.getTemplateNames().sort();
    select.innerHTML = names.map(name => `<option value="${name}">${name}</option>`).join('');
    
    if (currentTemplateName) {
        select.value = currentTemplateName;
    }

    // Clear semaphore after population
    isPopulating = false;
}

function renderCurrentTemplateView() {
    const templateManager = state.getTemplateManager();
    const container = getElementById('single-template-editor-container');
    if (!templateManager || !container) return;

    // Set semaphore to prevent dirty flag during UI population
    isPopulating = true;

    if (!currentTemplateName) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No template selected.</p>';
        singleTemplateEditor = null;
        isPopulating = false;
        return;
    }

    const template = templateManager.getTemplate(currentTemplateName);
    if (!template) {
        container.innerHTML = `<p style="text-align: center; color: #666; padding: 2rem;">Template '${currentTemplateName}' not found.</p>`;
        singleTemplateEditor = null;
        isPopulating = false;
        return;
    }

    // Create and render the single template editor
    singleTemplateEditor = new SingleTemplateEditor({
        containerId: 'single-template-editor-container',
        template: template,
        onTemplateChange: (updatedTemplate) => {
            isDirty = true;
        },
        readonly: false,
        showNameField: true
    });

    singleTemplateEditor.render();
    
    // Clear semaphore and ensure dirty flag is false after population
    isPopulating = false;
    isDirty = false;
}

 