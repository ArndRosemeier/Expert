import { ProjectManager } from "./ProjectManager";
import { ModelSelector } from "./ModelSelector";
import { OpenRouterClient } from "./OpenRouterClient";
import { SettingsManager } from "./SettingsManager";
import { LoopOrchestrator } from "./LoopOrchestrator";
import { OrchestratorPrompts } from "./PromptManager";
import { TemplateManager } from "./TemplateManager";

let orchestrator: LoopOrchestrator | null = null;
let projects: ProjectManager[] = [];
let activeProjectId: string | null = null;
let openRouterClient: OpenRouterClient | null = null;
let settingsManager: SettingsManager | null = null;
let modelSelector: ModelSelector | null = null;
let templateManager: TemplateManager | null = null;
let isAppRendered: boolean = false;
let orchestratorPrompts: OrchestratorPrompts | null = null;
let currentlyLoadedProfileName: string | null = null;

// --- Getters ---
export const getOrchestrator = () => orchestrator;
export const getProjects = () => projects;
export const getActiveProject = () => projects.find(p => p.rootNode.id === activeProjectId) || null;
export const getOpenRouterClient = () => openRouterClient;
export const getSettingsManager = () => settingsManager;
export const getModelSelector = () => modelSelector;
export const getTemplateManager = () => templateManager;
export const getIsAppRendered = () => isAppRendered;
export const getOrchestratorPrompts = () => orchestratorPrompts;
export const getCurrentlyLoadedProfileName = () => currentlyLoadedProfileName;

// --- Setters ---
export const setOrchestrator = (orch: LoopOrchestrator | null) => orchestrator = orch;
export const addProject = (project: ProjectManager) => {
    projects.push(project);
    if (!activeProjectId) {
        activeProjectId = project.rootNode.id;
    }
};
export const setActiveProject = (projectId: string) => {
    const project = projects.find(p => p.rootNode.id === projectId);
    if (project) {
        activeProjectId = projectId;
    }
};
export const removeProject = (projectId: string) => {
    const index = projects.findIndex(p => p.rootNode.id === projectId);
    if (index >= 0) {
        projects.splice(index, 1);
        if (activeProjectId === projectId) {
            activeProjectId = projects.length > 0 ? projects[0]!.rootNode.id : null;
        }
    }
};
export const setOpenRouterClient = (client: OpenRouterClient | null) => openRouterClient = client;
export const setSettingsManager = (manager: SettingsManager | null) => settingsManager = manager;
export const setModelSelector = (selector: ModelSelector | null) => modelSelector = selector;
export const setTemplateManager = (manager: TemplateManager | null) => templateManager = manager;
export const setIsAppRendered = (rendered: boolean) => isAppRendered = rendered;
export const setOrchestratorPrompts = (prompts: OrchestratorPrompts | null) => orchestratorPrompts = prompts;
export const setCurrentlyLoadedProfileName = (profileName: string | null) => currentlyLoadedProfileName = profileName;

// --- Legacy compatibility ---
export const getCurrentProject = () => getActiveProject();
export const setCurrentProject = (project: ProjectManager | null) => {
    if (project) {
        // If project already exists, just set it as active
        const existing = projects.find(p => p.rootNode.id === project.rootNode.id);
        if (existing) {
            activeProjectId = project.rootNode.id;
        } else {
            addProject(project);
        }
    } else {
        activeProjectId = null;
    }
}; 