import { getElementById, newProjectModalContainer, testModalContainer, validateDOMElements } from './ui/dom-elements';
import { openNewProjectModal, closeNewProjectModal, openTestModal, closeTestModal } from './ui/modal-manager';
import { openSettingsModal, createModalFactory, setDefaultModalFactory } from './ui/modals/ModalFactory';
import { TestRunner } from './TestRunner';
import * as state from './state';
import { ProjectManager } from './ProjectManager';
import { ProjectTemplate } from './ProjectTemplate';
import { initializeProjectUI } from './ui/project-ui';

import { SettingsManager } from './SettingsManager';
import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator } from './LoopOrchestrator';

import { openTemplateEditor } from './ui/template-editor';
import { TemplateManager } from './TemplateManager';

function onModelsSelected(models: Record<string, string>) {
    const modelSelector = state.getModelSelector();
    const settingsManager = state.getSettingsManager();
    if (!modelSelector || !settingsManager) return;
    
    // The model selector now handles its own storage internally.
    // We just need to reconfigure services and save the updated models to the active settings profile.
    recreateAndReconfigureServices();
    
    const activeProfileName = settingsManager.getLastUsedProfileName() || 'default';
    const activeProfile = settingsManager.getProfile(activeProfileName) || { 
        prompt: '', 
        criteria: [], 
        maxIterations: 5, 
        selectedModels: {},
        contextExtractionPrompt: 'Extract relevant context from the following content for use in generating new content:\n\n{{content}}\n\nProvide a clear, structured summary of the key information that would be useful for content generation.'
    };
    activeProfile.selectedModels = models;
    settingsManager.saveProfile(activeProfileName, activeProfile);

    // Settings modal now closes automatically after saving
    // No need to explicitly close since SettingsModal manages its own lifecycle
}

function recreateAndReconfigureServices() {
    const modelSelector = state.getModelSelector();
    const settingsManager = state.getSettingsManager();
    if (!modelSelector) {
        console.error("ModelSelector not available. Cannot configure services.");
        return;
    }
    const client = new OpenRouterClient(modelSelector.getApiKey(), modelSelector.getSelectedModels());
    
    // Connect the OpenRouterClient to the SettingsManager for AI logging
    if (settingsManager) {
        client.setSettingsManager(settingsManager);
    }
    
    const orchestrator = new LoopOrchestrator(client, state.getOrchestratorPrompts() || undefined);
    state.setOpenRouterClient(client);
    state.setOrchestrator(orchestrator);
    
}

function handleCreateProject(title: string, template: ProjectTemplate) {
    const orchestrator = state.getOrchestrator();
    const settingsManager = state.getSettingsManager();
    const client = state.getOpenRouterClient();

    if (!orchestrator || !settingsManager || !client) {
        alert('Core services not initialized. Cannot create project.');
        return;
    }
    
    const project = new ProjectManager(title, template, orchestrator, settingsManager, client);
    state.addProject(project);
    project.saveToStorage();
    
    closeNewProjectModal();
    initializeProjectUI();
}

function handleImportProject(title: string, template: ProjectTemplate, importData: any) {
    const orchestrator = state.getOrchestrator();
    const settingsManager = state.getSettingsManager();
    const client = state.getOpenRouterClient();

    if (!orchestrator || !settingsManager || !client) {
        alert('Core services not initialized. Cannot import project.');
        return;
    }
    
    try {
        // Create a new project with the imported title and detected template
        const project = new ProjectManager(title, template, orchestrator, settingsManager, client);
        
        // Import the data into the project's root node
        const rootNode = project.rootNode;
        
        // Import node data (reusing the existing import logic)
        if (importData.title !== undefined) {
            rootNode.title = importData.title;
            project.projectTitle = importData.title; // Keep project title in sync
        }

        if (importData.content !== undefined) {
            rootNode.content = importData.content;
        }

        if (importData.context !== undefined) {
            rootNode.context = importData.context;
        }

        if (importData.generationPrompt !== undefined) {
            rootNode.generationPrompt = importData.generationPrompt;
        }

        // Import children recursively if they exist
        if (importData.children && Array.isArray(importData.children)) {
            importData.children.forEach((childData: any, index: number) => {
                importChildNodeForProject(project, rootNode.id, childData, index);
            });
        }
        
        // Add to state and save
        state.addProject(project);
        project.saveToStorage();
        
        initializeProjectUI();
        alert(`Project "${title}" imported successfully!`);
        
    } catch (error) {
        console.error('Import project failed:', error);
        alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}

function calculateImportDepth(data: any): number {
    if (!data.children || !Array.isArray(data.children) || data.children.length === 0) {
        return 0; // No children = 0 additional depth
    }
    
    let maxChildDepth = 0;
    for (const child of data.children) {
        const childDepth = calculateImportDepth(child);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    
    return 1 + maxChildDepth; // 1 for this level + max child depth
}

function importChildNodeForProject(project: ProjectManager, parentId: string, childData: any, index: number): void {
    if (!childData.title) {
        console.warn(`Skipping child node at index ${index}: Missing title`);
        return;
    }

    // Create the child node
    const newNode = project.addNode(childData.title, parentId);

    // Set node properties
    if (childData.content !== undefined) {
        newNode.content = childData.content;
    }

    if (childData.context !== undefined) {
        newNode.context = childData.context;
    }

    if (childData.generationPrompt !== undefined) {
        newNode.generationPrompt = childData.generationPrompt;
    }

    // Recursively import children
    if (childData.children && Array.isArray(childData.children)) {
        childData.children.forEach((grandChildData: any, grandChildIndex: number) => {
            importChildNodeForProject(project, newNode.id, grandChildData, grandChildIndex);
        });
    }
}

async function loadPersistedProjects(): Promise<void> {
    try {
        const orchestrator = state.getOrchestrator();
        const settingsManager = state.getSettingsManager();
        const client = state.getOpenRouterClient();
        if (!orchestrator || !settingsManager || !client) {
            throw new Error("Cannot load projects without core services.");
        }
        
        const { projects, activeProjectId } = await ProjectManager.loadAllProjectsFromStorage(orchestrator, settingsManager, client);
        
        projects.forEach(project => state.addProject(project));
        if (activeProjectId) {
            state.setActiveProject(activeProjectId);
        }
    } catch (error) {
        console.error("Failed to load projects from storage:", error);
        // Try to clear any corrupted storage
        try {
            const storage = await import('./StorageService').then(m => m.StorageService.getInstance());
            await storage.delete('expert_app_current_project');
            await storage.delete('expert_app_projects');
            await storage.delete('expert_app_active_project');
        } catch (cleanupError) {
            console.error("Failed to cleanup corrupted storage:", cleanupError);
        }
    }
}

export async function initialize() {
    // Validate DOM elements are available
    try {
        validateDOMElements();
    } catch (error) {
        console.error('❌ DOM validation failed:', error);
        // Continue execution even if validation fails
    }
    
    const settingsManager = new SettingsManager();
    state.setSettingsManager(settingsManager);

    const templateManager = new TemplateManager();
    state.setTemplateManager(templateManager);
    
    const modelSelector = new ModelSelector(onModelsSelected, () => {
        // Settings modal now handles its own closing
        // This callback is kept for ModelSelector compatibility
    });
    state.setModelSelector(modelSelector);

    // Wait for async initialization to complete
    await settingsManager.waitForInitialization();
    await modelSelector.waitForInitialization();

    // Initialize the modal factory with dependencies
    const modalFactory = createModalFactory({
        settingsManager,
        modelSelector
    });
    setDefaultModalFactory(modalFactory);

    recreateAndReconfigureServices();

    await loadPersistedProjects();
    
    // Initialize the UI with projects (if any)
    initializeProjectUI();

    // Attach event listeners
    try {
    getElementById('settingsBtn').addEventListener('click', () => {
        openSettingsModal();
    });
    } catch (error) {
        console.error('❌ Failed to attach settings button listener:', error);
    }
    
    try {
    getElementById('runTestsBtn').addEventListener('click', async () => {
        const client = state.getOpenRouterClient();
        if (!client) {
            alert("API client not initialized. Cannot run tests.");
            return;
        }
        
        // Show test selection modal
        const testSelectionHtml = `
            <h2>Select Test Suite</h2>
            <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem;">
                <button id="runCoreTestsBtn" class="button button-primary" style="padding: 1rem; font-size: 1rem;">
                    Core Functionality Tests
                    <div style="font-size: 0.875rem; opacity: 0.8; margin-top: 0.25rem;">
                        Document nodes, project management, templates, tree operations
                    </div>
                </button>
                <button id="runStorageTestsBtn" class="button button-primary" style="padding: 1rem; font-size: 1rem;">
                    Storage System Tests
                    <div style="font-size: 0.875rem; opacity: 0.8; margin-top: 0.25rem;">
                        IndexedDB, storage abstraction, service layer storage
                    </div>
                </button>
                <button id="runAllTestsBtn" class="button button-secondary" style="padding: 1rem; font-size: 1rem;">
                    Run All Tests
                    <div style="font-size: 0.875rem; opacity: 0.8; margin-top: 0.25rem;">
                        Complete test suite (may take longer)
                    </div>
                </button>
            </div>
        `;
        
        openTestModal(testSelectionHtml);
        
        // Add event listeners for test options
        const runCoreTests = async () => {
        const testRunner = new TestRunner(client);
        const resultsHtml = await testRunner.runPhase1Tests();
        openTestModal(resultsHtml);
        };
        
        const runStorageTests = async () => {
            const testRunner = new TestRunner(client);
            const resultsHtml = await testRunner.runStorageTests();
            openTestModal(resultsHtml);
        };
        
        const runAllTests = async () => {
            const testRunner = new TestRunner(client);
            const coreResults = await testRunner.runPhase1Tests();
            const storageResults = await testRunner.runStorageTests();
            const combinedResults = `
                ${coreResults}
                <hr style="margin: 2rem 0;">
                ${storageResults}
            `;
            openTestModal(combinedResults);
        };
        
        setTimeout(() => {
            document.getElementById('runCoreTestsBtn')?.addEventListener('click', runCoreTests);
            document.getElementById('runStorageTestsBtn')?.addEventListener('click', runStorageTests);
            document.getElementById('runAllTestsBtn')?.addEventListener('click', runAllTests);
        }, 100);
    });
    } catch (error) {
        console.error('❌ Failed to attach run tests button listener:', error);
    }
    
    try {
    getElementById('newProjectBtn').addEventListener('click', () => openNewProjectModal(handleCreateProject));
    } catch (error) {
        console.error('❌ Failed to attach new project button listener:', error);
    }
    
    try {
        getElementById('importProjectBtn').addEventListener('click', () => {
            
            // Create file input element (same as node import)
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const file = target.files?.[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const content = event.target?.result as string;
                        const importData = JSON.parse(content);
                        
                        // Detect suitable template (same logic as modal)
                        const templateManager = state.getTemplateManager();
                        if (!templateManager) {
                            throw new Error('Template manager not available');
                        }
                        
                        // Calculate depth and find suitable template
                        const depth = calculateImportDepth(importData);
                        const templateNames = templateManager.getTemplateNames();
                        let bestTemplate: ProjectTemplate | null = null;
                        
                        // Look for a template that has enough levels for the import
                        for (const templateName of templateNames) {
                            const template = templateManager.getTemplate(templateName);
                            if (template && template.hierarchyLevels.length >= depth + 1) {
                                bestTemplate = template;
                                break;
                            }
                        }
                        
                        // If no template found, default to Standard Novel
                        if (!bestTemplate) {
                            const standardTemplate = templateManager.getTemplate('Standard Novel');
                            if (standardTemplate) {
                                bestTemplate = standardTemplate;
                            }
                        }
                        
                        if (!bestTemplate) {
                            throw new Error('No suitable template found');
                        }
                        
                        // Import project data
                        handleImportProject(importData.title || 'Imported Project', bestTemplate, importData);
                        
                    } catch (error) {
                        console.error('Import failed:', error);
                        alert('Import failed: ' + (error instanceof Error ? error.message : 'Invalid JSON file'));
                    }
                };
                
                reader.onerror = () => {
                    alert('Failed to read file. Please try again.');
                };
                
                reader.readAsText(file);
            });
            
            // Trigger file selection
            document.body.appendChild(fileInput);
            fileInput.click();
            document.body.removeChild(fileInput);
        });
    } catch (error) {
        console.error('❌ Failed to attach import project button listener:', error);
    }
    
    try {
    getElementById('manageTemplatesBtn').addEventListener('click', openTemplateEditor);
    } catch (error) {
        console.error('❌ Failed to attach manage templates button listener:', error);
    }
    
    // Global abort button handler
    try {
    getElementById('globalAbortBtn').addEventListener('click', () => {
        const activeProject = state.getActiveProject();
        if (activeProject && activeProject.getGenerationService().canAbortGeneration()) {
            const confirmed = confirm('Are you sure you want to abort the current generation? Any partial progress will be saved.');
            if (confirmed) {
                activeProject.getGenerationService().abortCurrentGeneration();
            }
        }
    });
    } catch (error) {
        console.error('❌ Failed to attach global abort button listener:', error);
    }

    // Add modal-closing listeners (disabled click-outside-to-close for settings and templates)
    // modalContainer.addEventListener('click', (e) => {
    //     if (e.target === modalContainer) closeModal();
    // });
    testModalContainer().addEventListener('click', (e) => {
        if (e.target === testModalContainer()) closeTestModal();
    });
    newProjectModalContainer().addEventListener('click', (e) => {
        if (e.target === newProjectModalContainer()) closeNewProjectModal();
    });

    if (!modelSelector.getApiKey() || !modelSelector.areAllModelsSelected()) {
        openSettingsModal();
    } else if (!state.getActiveProject()) {
        openNewProjectModal(handleCreateProject);
    }
    
} 