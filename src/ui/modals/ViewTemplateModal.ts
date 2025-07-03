import { showGenericModal } from './index';
import { SingleTemplateEditor } from '../components/SingleTemplateEditor';
import { ProjectTemplate } from '../../ProjectTemplate';
import { DocumentNode } from '../../DocumentNode';
import * as state from '../../state';

/**
 * Recursively updates all nodes in the tree with the new template
 */
function updateAllNodeTemplates(rootNode: DocumentNode, newTemplate: string[]): void {
    // Update root node template
    rootNode.template = [...newTemplate];
    
    // Recursively update all child nodes
    function updateNodeAndChildren(node: DocumentNode): void {
        node.template = [...newTemplate];
        for (const child of node.children) {
            updateNodeAndChildren(child);
        }
    }
    
    // Update all child nodes
    for (const child of rootNode.children) {
        updateNodeAndChildren(child);
    }
}

export function showViewTemplateModal(rootNode: DocumentNode): void {
    try {
        const templateManager = state.getTemplateManager();
        if (!templateManager) {
            alert("Template manager is not initialized.");
            return;
        }

        // Get the template from the root node
        const templateHierarchy = rootNode.template;
        if (!templateHierarchy || templateHierarchy.length === 0) {
            alert("This project does not have a template.");
            return;
        }

        // Convert template hierarchy to ProjectTemplate
        const template = new ProjectTemplate(
            `${rootNode.title} Template`,
            templateHierarchy,
            []
        );

        let singleTemplateEditor: SingleTemplateEditor | null = null;
        let isDirty = false;

        const content = `
            <style>
                #view-template-container { 
                    display: flex; 
                    flex-direction: column; 
                    gap: 1rem; 
                    min-height: 400px;
                }
                .template-info { 
                    background: #f0f8ff; 
                    border: 1px solid #b6d7ff; 
                    border-radius: 6px; 
                    padding: 1rem; 
                    margin-bottom: 1rem;
                }
                .template-info h3 { 
                    margin: 0 0 0.5rem 0; 
                    color: #1e3a8a; 
                }
                .template-info p { 
                    margin: 0; 
                    color: #374151; 
                    font-size: 0.9em;
                }
                .template-editor-section { 
                    border: 1px solid #ddd; 
                    border-radius: 6px; 
                    padding: 1rem; 
                    background: #f9f9f9; 
                    flex-grow: 1;
                }
            </style>
            <div id="view-template-container">
                <div class="template-info">
                    <h3>📋 Project Template: ${template.name}</h3>
                    <p>This is the template structure for project "${rootNode.title}". You can view and edit the hierarchy levels below.</p>
                </div>
                <div class="template-editor-section">
                    <div id="view-template-editor-container"></div>
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
                            if (isDirty && !confirm("You have unsaved changes. Are you sure you want to close?")) {
                                throw new Error('__KEEP_MODAL_OPEN__');
                            }
                            void modal.close();
                        }
                    },
                    {
                        id: 'save',
                        label: '💾 Save Changes',
                        type: 'primary',
                        handler: async () => {
                            if (!singleTemplateEditor) {
                                void modal.close();
                                return;
                            }

                            try {
                                const updatedTemplate = singleTemplateEditor.getTemplateFromUI();
                                
                                // Validate template
                                if (!updatedTemplate.name.trim()) {
                                    alert("Template name cannot be empty.");
                                    throw new Error('__KEEP_MODAL_OPEN__');
                                }

                                if (updatedTemplate.hierarchyLevels.length === 0) {
                                    alert("Template must have at least one hierarchy level.");
                                    throw new Error('__KEEP_MODAL_OPEN__');
                                }

                                // Apply the updated template to the root node
                                rootNode.template = updatedTemplate.hierarchyLevels;

                                // Update all child nodes with the new template
                                updateAllNodeTemplates(rootNode, updatedTemplate.hierarchyLevels);

                                // Save the project to persist template changes
                                const currentProject = state.getActiveProject();
                                if (currentProject && currentProject.rootNode.id === rootNode.id) {
                                    await currentProject.saveToStorage();
                                }

                                // Mark as clean and close
                                isDirty = false;
                                singleTemplateEditor.markClean();

                                alert("Template updated successfully!");
                                void modal.close();

                                // Refresh the project UI to reflect template changes
                                const activeProject = state.getActiveProject();
                                if (activeProject && activeProject.rootNode.id === rootNode.id) {
                                    // Refresh the UI
                                    const { initializeProjectUI } = await import('../project-ui');
                                    initializeProjectUI(activeProject);
                                }

                            } catch (error: any) {
                                if (error.message === '__KEEP_MODAL_OPEN__') {
                                    throw error;
                                }
                                alert(`Error saving template: ${error.message}`);
                                throw new Error('__KEEP_MODAL_OPEN__');
                            }
                        }
                    }
                ]
            },
            {
                title: '🔍 View & Edit Template',
                maxWidth: '800px',
                maxHeight: '700px'
            },
            {
                onOpen: () => {
                    setupViewTemplateEditor(template);
                }
            }
        );

        function setupViewTemplateEditor(template: ProjectTemplate): void {
            // Create a copy of the template to avoid modifying the original until save
            const templateCopy = new ProjectTemplate(
                template.name,
                [...template.hierarchyLevels],
                [...template.scaffoldingDocuments]
            );

            singleTemplateEditor = new SingleTemplateEditor({
                containerId: 'view-template-editor-container',
                template: templateCopy,
                onTemplateChange: (_updatedTemplate) => {
                    isDirty = true;
                },
                readonly: false,
                showNameField: true
            });

            singleTemplateEditor.render();
            isDirty = false;
        }

    } catch (error) {
        console.error('❌ Error in showViewTemplateModal:', error);
        alert('Failed to open template viewer: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
} 