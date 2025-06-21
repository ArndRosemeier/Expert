import { getElementById } from "./dom-elements";
import { openGenericModal, closeGenericModal } from './modal-manager';

// Mock function until we integrate with SettingsManager
function saveTemplatesToLocalStorage(templates: Record<string, string[]>) {
    console.log("Saving templates:", templates);
    // In the future, this will be:
    // settingsManager.set('templates', templates);
}

// Mock function
function getTemplatesFromLocalStorage(): Record<string, string[]> {
    console.log("Getting templates");
    // In the future, this will be:
    // return settingsManager.get('templates') || { 'Default': ['Novel', 'Act', 'Chapter', 'Scene'] };
    return { 'Default': ['Novel', 'Act', 'Chapter', 'Scene'] };
}


export function openTemplateEditor() {
    const content = `
        <style>
            .template-set { margin-bottom: 2rem; border: 1px solid #e5e7eb; padding: 1rem; border-radius: 8px; }
            .template-layer { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
            .template-layer input { flex-grow: 1; }
        </style>
        <h2>Manage Templates</h2>
        <p>Define the hierarchical structure for your documents.</p>
        <div id="template-list-container"></div>
        <button id="add-template-btn" class="button button-secondary" disabled>Add New Template (Coming Soon)</button>
        <hr style="margin: 1.5rem 0;">
        <div style="display: flex; justify-content: flex-end; gap: 1rem;">
            <button id="cancel-templates-btn" class="button button-secondary">Cancel</button>
            <button id="save-templates-btn" class="button button-primary">Save Changes</button>
        </div>
    `;
    
    openGenericModal(content, () => {
        renderTemplateList();

        getElementById('add-template-btn').addEventListener('click', () => {
            alert("Feature to add a new named template coming soon!");
        });

        getElementById('cancel-templates-btn').addEventListener('click', closeGenericModal);
        
        getElementById('save-templates-btn').addEventListener('click', () => {
            // TODO: Implement saving logic
            alert("Saving logic coming soon!");
            closeGenericModal();
        });
    });
}

function renderTemplateList() {
    const container = getElementById('template-list-container');
    const templates = getTemplatesFromLocalStorage();
    
    let html = '';
    for (const name in templates) {
        html += renderSingleTemplateView(name, templates[name]);
    }
    container.innerHTML = html;

    // TODO: Add event listeners for remove/add layer buttons
}

function renderSingleTemplateView(name: string, layers: string[]): string {
    const layerInputs = layers.map((layer, index) => `
        <div class="template-layer">
            <input type="text" value="${layer}" data-template-name="${name}" data-layer-index="${index}" />
            <button class="remove-layer-btn" data-template-name="${name}" data-layer-index="${index}">-</button>
        </div>
    `).join('');

    return `
        <div class="template-set">
            <h3>${name}</h3>
            <div class="layers-container">${layerInputs}</div>
            <button class="add-layer-btn" data-template-name="${name}">+ Add Layer</button>
        </div>
    `;
} 