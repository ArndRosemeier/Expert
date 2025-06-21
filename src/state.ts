import { ProjectManager } from "./ProjectManager";
import { ModelSelector } from "./ModelSelector";
import { OpenRouterClient } from "./OpenRouterClient";
import { SettingsManager } from "./SettingsManager";
import { LoopOrchestrator } from "./LoopOrchestrator";
import { OrchestratorPrompts } from "./PromptManager";
import { TemplateManager } from "./TemplateManager";

let orchestrator: LoopOrchestrator | null = null;
let currentProject: ProjectManager | null = null;
let openRouterClient: OpenRouterClient | null = null;
let settingsManager: SettingsManager | null = null;
let modelSelector: ModelSelector | null = null;
let templateManager: TemplateManager | null = null;
let isAppRendered: boolean = false;
let orchestratorPrompts: OrchestratorPrompts | null = null;

// --- Getters ---
export const getOrchestrator = () => orchestrator;
export const getCurrentProject = () => currentProject;
export const getOpenRouterClient = () => openRouterClient;
export const getModelSelector = () => modelSelector;
export const getSettingsManager = () => settingsManager;
export const getTemplateManager = () => templateManager;
export const getIsAppRendered = () => isAppRendered;
export const getOrchestratorPrompts = () => orchestratorPrompts;

// --- Setters ---
export const setOrchestrator = (newOrchestrator: LoopOrchestrator) => orchestrator = newOrchestrator;
export const setCurrentProject = (project: ProjectManager | null) => currentProject = project;
export const setOpenRouterClient = (client: OpenRouterClient) => openRouterClient = client;
export const setModelSelector = (newModelSelector: ModelSelector) => modelSelector = newModelSelector;
export const setSettingsManager = (newSettingsManager: SettingsManager) => settingsManager = newSettingsManager;
export const setTemplateManager = (newTemplateManager: TemplateManager) => templateManager = newTemplateManager;
export const setIsAppRendered = (value: boolean) => isAppRendered = value;
export const setOrchestratorPrompts = (prompts: OrchestratorPrompts) => orchestratorPrompts = prompts; 