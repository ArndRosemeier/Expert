import { ProjectManager } from "./ProjectManager";
import { DocumentNode } from "./DocumentNode";
import { ModelSelector } from "./ModelSelector";
import { OpenRouterClient } from "./OpenRouterClient";
import { SettingsManager } from "./SettingsManager";
import { LoopOrchestrator } from "./LoopOrchestrator";
import { OrchestratorPrompts } from "./PromptManager";
import { TemplateManager } from "./TemplateManager";

let orchestrator: LoopOrchestrator | null = null;
const projects: ProjectManager[] = [];
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

// Language synchronization functionality (decoupled - no longer used)

/**
 * Initialize language synchronization between projects and settings
 * DECOUPLED: No longer automatically syncs project language changes to global settings
 */
export const initializeLanguageSync = () => {
    // Subscribe to active project changes to update UI display only
    onActiveProjectChange((activeProject) => {
        if (!settingsManager) return;
        
        if (!activeProject) {
            // No active project, show global language in UI
            const globalLanguage = settingsManager.getGlobalLanguage();
            updateLanguageSelectorUI(globalLanguage);
            return;
        }
        
        // Just update the UI to show current global language setting
        // No longer automatically sync project language to global setting
        const globalLanguage = settingsManager.getGlobalLanguage();
        updateLanguageSelectorUI(globalLanguage);
    });
};

/**
 * Handle language change from settings - DECOUPLED: only changes global default
 * No longer automatically syncs to active project
 */
export const handleLanguageChange = (_newLanguage: string) => {
    // Language change now only affects the global default setting
    // Projects maintain their own language settings independently
    // Use "Set Project Language" button to explicitly copy global to project
};

/**
 * Update language selector UI component if it exists
 */
const updateLanguageSelectorUI = (language: string) => {
    // Find language selector in the DOM and update it
    const languageContainer = document.getElementById('language-selector-container');
    if (languageContainer) {
        // Try to find the LanguageSelector instance
        // We'll need to trigger a custom event that the LanguageSelector can listen to
        const event = new CustomEvent('externalLanguageChange', { 
            detail: { language } 
        });
        languageContainer.dispatchEvent(event);
    }
};

// --- Getters ---
export const getOrchestrator = () => orchestrator;
export const getProjects = () => projects;
export const getActiveProject = (): ProjectManager | null => {
    if (!activeProjectId) {
        // This is a valid state - no project is active yet
        return null;
    }
    const project = projects.find(p => p.rootNode.id === activeProjectId);
    if (!project) {
        throw new Error(`Active project ${activeProjectId} not found in projects list - this indicates state corruption that must be debugged`);
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

/**
 * Find a node by ID across all projects
 * Returns both the node and the project manager that contains it
 */
export const findNodeGlobally = (nodeId: string): { node: DocumentNode; projectManager: ProjectManager } | null => {
    for (const project of projects) {
        const node = project.findNodeById(nodeId);
        if (node) {
            return { node, projectManager: project };
        }
    }
    return null;
};

/**
 * Find the project that contains a specific node
 * Returns the project manager that contains the node, or null if not found
 */
export const findProjectByNode = (node: DocumentNode): ProjectManager | null => {
    const result = findNodeGlobally(node.id);
    return result ? result.projectManager : null;
};

/**
 * Find the project that has the specified root node
 * Returns the project manager with the matching root node, or null if not found
 */
export const findProjectByRootNode = (rootNode: DocumentNode): ProjectManager | null => {
    for (const project of projects) {
        if (project.rootNode.id === rootNode.id) {
            return project;
        }
    }
    return null;
};

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
            const newActiveProject = activeProjectId ? (() => {
                const found = projects.find(p => p.rootNode.id === activeProjectId);
                if (!found) {
                    throw new Error(`State corruption: activeProjectId ${activeProjectId} set but project not found in projects list`);
                }
                return found;
            })() : null;
            notifyActiveProjectChange(newActiveProject);
            console.log(`🔄 Active project changed after removal: ${newActiveProject?.projectTitle ?? 'None'}`);
        }
        
        console.log(`🗑️ Project removed: ${removedProject.projectTitle} (${projectId})`);
    }
};

/**
 * Get a project by its ID
 */
export const getProjectById = (projectId: string): ProjectManager | null => {
    return projects.find(p => p.rootNode.id === projectId) ?? null;
};

/**
 * Ensure active project consistency - call this after loading projects
 */
export const ensureActiveProjectConsistency = () => {
    if (activeProjectId && !projects.find(p => p.rootNode.id === activeProjectId)) {
        console.warn(`⚠️ Active project ${activeProjectId} not found. Resetting to first available project.`);
        activeProjectId = projects.length > 0 ? projects[0]!.rootNode.id : null;
        const newActiveProject = activeProjectId ? (() => {
            const found = projects.find(p => p.rootNode.id === activeProjectId);
            if (!found) {
                throw new Error(`State corruption: activeProjectId ${activeProjectId} set but project not found after consistency check`);
            }
            return found;
        })() : null;
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