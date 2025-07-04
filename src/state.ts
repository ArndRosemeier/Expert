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

// Event listeners for active project changes
type ActiveProjectChangeListener = (activeProject: ProjectManager | null) => void;
const activeProjectChangeListeners: ActiveProjectChangeListener[] = [];

// --- Getters ---
export const getOrchestrator = () => orchestrator;
export const getProjects = () => projects;
export const getActiveProject = (): ProjectManager | null => {
    if (!activeProjectId) return null;
    const project = projects.find(p => p.rootNode.id === activeProjectId);
    if (!project) {
        console.warn(`⚠️ Active project ${activeProjectId} not found in projects list. Resetting active project.`);
        activeProjectId = projects.length > 0 ? projects[0]!.rootNode.id : null;
        return activeProjectId ? projects.find(p => p.rootNode.id === activeProjectId) || null : null;
    }
    return project;
};
export const getActiveProjectId = () => activeProjectId;
export const getOpenRouterClient = () => openRouterClient;
export const getSettingsManager = (): SettingsManager | null => {
    // Try to get the already initialized singleton first
    try {
        return SettingsManager.getInstanceSync();
    } catch {
        // Fallback to the stored instance if singleton not yet initialized
        return settingsManager;
    }
};
export const getModelSelector = () => modelSelector;
export const getTemplateManager = () => templateManager;
export const getIsAppRendered = () => isAppRendered;
export const getOrchestratorPrompts = () => orchestratorPrompts;

/**
 * Subscribe to active project changes
 */
export const onActiveProjectChange = (listener: ActiveProjectChangeListener) => {
    activeProjectChangeListeners.push(listener);
    return () => {
        const index = activeProjectChangeListeners.indexOf(listener);
        if (index > -1) {
            activeProjectChangeListeners.splice(index, 1);
        }
    };
};

/**
 * Notify all listeners when active project changes
 */
const notifyActiveProjectChange = (activeProject: ProjectManager | null) => {
    activeProjectChangeListeners.forEach(listener => {
        try {
            listener(activeProject);
        } catch (error) {
            console.error('Error in active project change listener:', error);
        }
    });
};

export const addProject = (project: ProjectManager) => {
    // Avoid duplicate projects
    const existing = projects.find(p => p.rootNode.id === project.rootNode.id);
    if (existing) {
        console.warn(`⚠️ Project ${project.rootNode.id} already exists. Skipping add.`);
        return;
    }
    
    projects.push(project);
    if (!activeProjectId) {
        activeProjectId = project.rootNode.id;
        notifyActiveProjectChange(project);
    }
};

export const setActiveProject = (projectId: string) => {
    const project = projects.find(p => p.rootNode.id === projectId);
    if (project && activeProjectId !== projectId) {
        activeProjectId = projectId;
        notifyActiveProjectChange(project);
        console.log(`🔄 Active project changed to: ${project.projectTitle} (${projectId})`);
    } else if (!project) {
        console.error(`❌ Project ${projectId} not found in projects list`);
    }
};

export const removeProject = (projectId: string) => {
    const index = projects.findIndex(p => p.rootNode.id === projectId);
    if (index >= 0) {
        const removedProject = projects[index];
        if (!removedProject) {
            console.error(`❌ Project at index ${index} is undefined`);
            return;
        }
        
        projects.splice(index, 1);
        
        // Update active project if the removed project was active
        if (activeProjectId === projectId) {
            activeProjectId = projects.length > 0 ? projects[0]!.rootNode.id : null;
            const newActiveProject = activeProjectId ? projects.find(p => p.rootNode.id === activeProjectId) || null : null;
            notifyActiveProjectChange(newActiveProject);
            console.log(`🔄 Active project changed after removal: ${newActiveProject?.projectTitle || 'None'}`);
        }
        
        console.log(`🗑️ Project removed: ${removedProject.projectTitle} (${projectId})`);
    }
};

/**
 * Get a project by its ID
 */
export const getProjectById = (projectId: string): ProjectManager | null => {
    return projects.find(p => p.rootNode.id === projectId) || null;
};

/**
 * Ensure active project consistency - call this after loading projects
 */
export const ensureActiveProjectConsistency = () => {
    if (activeProjectId && !projects.find(p => p.rootNode.id === activeProjectId)) {
        console.warn(`⚠️ Active project ${activeProjectId} not found. Resetting to first available project.`);
        activeProjectId = projects.length > 0 ? projects[0]!.rootNode.id : null;
        const newActiveProject = activeProjectId ? projects.find(p => p.rootNode.id === activeProjectId) || null : null;
        notifyActiveProjectChange(newActiveProject);
    }
};

export const setCurrentProject = (project: ProjectManager | null) => {
    if (project) {
        // If project already exists, just set it as active
        const existing = projects.find(p => p.rootNode.id === project.rootNode.id);
        if (existing) {
            setActiveProject(project.rootNode.id);
        } else {
            addProject(project);
        }
    } else {
        activeProjectId = null;
        notifyActiveProjectChange(null);
    }
};

// --- Setters ---
export const setOrchestrator = (newOrchestrator: LoopOrchestrator) => orchestrator = newOrchestrator;
export const setOpenRouterClient = (newClient: OpenRouterClient) => openRouterClient = newClient;
export const setSettingsManager = (newSettingsManager: SettingsManager) => settingsManager = newSettingsManager;
export const setModelSelector = (newModelSelector: ModelSelector) => modelSelector = newModelSelector;
export const setTemplateManager = (newTemplateManager: TemplateManager) => templateManager = newTemplateManager;
export const setIsAppRendered = (newIsAppRendered: boolean) => isAppRendered = newIsAppRendered;
export const setOrchestratorPrompts = (newPrompts: OrchestratorPrompts) => orchestratorPrompts = newPrompts;
export const getCurrentlyLoadedProfileName = () => currentlyLoadedProfileName;
export const setCurrentlyLoadedProfileName = (profileName: string | null) => currentlyLoadedProfileName = profileName; 