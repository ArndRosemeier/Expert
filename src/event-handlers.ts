import { getElementById, newProjectModalContainer, testModalContainer } from './ui/dom-elements';
import { openModal, closeModal, openNewProjectModal, closeNewProjectModal, openTestModal, closeTestModal } from './ui/modal-manager';
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

    closeModal();
}

function recreateAndReconfigureServices() {
    const modelSelector = state.getModelSelector();
    if (!modelSelector) {
        console.error("ModelSelector not available. Cannot configure services.");
        return;
    }
    const client = new OpenRouterClient(modelSelector.getApiKey(), modelSelector.getSelectedModels());
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
    const settingsManager = new SettingsManager();
    state.setSettingsManager(settingsManager);

    const templateManager = new TemplateManager();
    state.setTemplateManager(templateManager);
    
    const modelSelector = new ModelSelector(onModelsSelected, closeModal);
    state.setModelSelector(modelSelector);

    // Wait for async initialization to complete
    await settingsManager.waitForInitialization();
    await modelSelector.waitForInitialization();

    recreateAndReconfigureServices();

    await loadPersistedProjects();
    
    // Initialize the UI with projects (if any)
    initializeProjectUI();

    // Attach event listeners
    getElementById('settingsBtn').addEventListener('click', openModal);
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
    getElementById('newProjectBtn').addEventListener('click', () => openNewProjectModal(handleCreateProject));
    getElementById('manageTemplatesBtn').addEventListener('click', openTemplateEditor);
    
    // Global abort button handler
    getElementById('globalAbortBtn').addEventListener('click', () => {
        const activeProject = state.getActiveProject();
        if (activeProject && activeProject.getGenerationService().canAbortGeneration()) {
            const confirmed = confirm('Are you sure you want to abort the current generation? Any partial progress will be saved.');
            if (confirmed) {
                activeProject.getGenerationService().abortCurrentGeneration();
            }
        }
    });

    // Add modal-closing listeners (disabled click-outside-to-close for settings and templates)
    // modalContainer.addEventListener('click', (e) => {
    //     if (e.target === modalContainer) closeModal();
    // });
    testModalContainer.addEventListener('click', (e) => {
        if (e.target === testModalContainer) closeTestModal();
    });
    newProjectModalContainer.addEventListener('click', (e) => {
        if (e.target === newProjectModalContainer) closeNewProjectModal();
    });

    if (!modelSelector.getApiKey() || !modelSelector.areAllModelsSelected()) {

        openModal();
    } else if (!state.getActiveProject()) {
        openNewProjectModal(handleCreateProject);
    }
    
} 