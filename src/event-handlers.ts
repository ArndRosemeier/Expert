import { getElementById, modalContainer, newProjectModalContainer, testModalContainer } from './ui/dom-elements';
import { openModal, closeModal, openNewProjectModal, closeNewProjectModal, openTestModal, closeTestModal } from './ui/modal-manager';
import { TestRunner } from './TestRunner';
import * as state from './state';
import { ProjectManager } from './ProjectManager';
import { ProjectTemplate } from './ProjectTemplate';
import { renderProjectUI, initializeProjectUI } from './ui/project-ui';
import { renderLoopUI } from './ui/loop-ui';
import { SettingsManager } from './SettingsManager';
import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator } from './LoopOrchestrator';
import { OrchestratorPrompts } from './PromptManager';
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
    const activeProfile = settingsManager.getProfile(activeProfileName) || { prompt: '', criteria: [], maxIterations: 5, selectedModels: {} };
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
    console.log('Services reconfigured.');
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
    state.setCurrentProject(project);
    project.saveToLocalStorage();
    
    closeNewProjectModal();
    initializeProjectUI(project);
}

function loadPersistedProject(): ProjectManager | null {
    const savedProjectJson = localStorage.getItem('expert_app_current_project');
    if (!savedProjectJson) return null;

    try {
        const orchestrator = state.getOrchestrator();
        const settingsManager = state.getSettingsManager();
        const client = state.getOpenRouterClient();
        if (!orchestrator || !settingsManager || !client) {
            throw new Error("Cannot load project without core services.");
        }
        return ProjectManager.load(savedProjectJson, orchestrator, settingsManager, client);
    } catch (error) {
        console.error("Failed to load project from storage:", error);
        localStorage.removeItem('expert_app_current_project');
        return null;
    }
}

export function initialize() {
    const settingsManager = new SettingsManager();
    state.setSettingsManager(settingsManager);

    const templateManager = new TemplateManager();
    state.setTemplateManager(templateManager);
    
    const modelSelector = new ModelSelector(onModelsSelected, closeModal);
    state.setModelSelector(modelSelector);

    recreateAndReconfigureServices();

    const project = loadPersistedProject();
    if (project) {
        state.setCurrentProject(project);
        initializeProjectUI(project);
    }

    // Attach event listeners
    getElementById('settingsBtn').addEventListener('click', openModal);
    getElementById('runTestsBtn').addEventListener('click', async () => {
        const client = state.getOpenRouterClient();
        if (!client) {
            alert("API client not initialized. Cannot run tests.");
            return;
        }
        const testRunner = new TestRunner(client);
        const resultsHtml = await testRunner.runPhase1Tests();
        openTestModal(resultsHtml);
    });
    getElementById('newProjectBtn').addEventListener('click', () => openNewProjectModal(handleCreateProject));
    getElementById('manageTemplatesBtn').addEventListener('click', openTemplateEditor);

    // Add modal-closing listeners
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) closeModal();
    });
    testModalContainer.addEventListener('click', (e) => {
        if (e.target === testModalContainer) closeTestModal();
    });
    newProjectModalContainer.addEventListener('click', (e) => {
        if (e.target === newProjectModalContainer) closeNewProjectModal();
    });

    if (!modelSelector.getApiKey() || !modelSelector.areAllModelsSelected()) {
        console.log('API key or models not set. Forcing settings modal.');
        openModal();
    } else if (!project) {
        openNewProjectModal(handleCreateProject);
    }
    console.log('Application initialized.');
} 