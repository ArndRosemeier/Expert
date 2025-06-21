import { OpenRouterClient } from './OpenRouterClient';
import { ModelSelector } from './ModelSelector';
import { LoopOrchestrator, type LoopHistoryItem } from './LoopOrchestrator';
import { SettingsManager } from './SettingsManager';
import { ProjectManager } from './ProjectManager';
import { defaultPrompts, type OrchestratorPrompts } from './PromptManager';

// --- State ---
let openRouterClient: OpenRouterClient | null = null;
let modelSelector: ModelSelector | null = null;
let selectedModels: Record<string, string> = {};
let orchestrator: LoopOrchestrator | null = null;
let settingsManager: SettingsManager | null = null;
let orchestratorPrompts: OrchestratorPrompts = { ...defaultPrompts };
let loopHistory: LoopHistoryItem[] = [];
let viewedIteration = 0;
let isAppRendered = false;
let currentProject: ProjectManager | null = null;

export function getOpenRouterClient() { return openRouterClient; }
export function setOpenRouterClient(client: OpenRouterClient | null) { openRouterClient = client; }

export function getModelSelector() { return modelSelector; }
export function setModelSelector(selector: ModelSelector | null) { modelSelector = selector; }

export function getSelectedModels() { return selectedModels; }
export function setSelectedModels(models: Record<string, string>) { selectedModels = models; }

export function getOrchestrator() { return orchestrator; }
export function setOrchestrator(orch: LoopOrchestrator | null) { orchestrator = orch; }

export function getSettingsManager() { return settingsManager; }
export function setSettingsManager(manager: SettingsManager | null) { settingsManager = manager; }

export function getOrchestratorPrompts() { return orchestratorPrompts; }
export function setOrchestratorPrompts(prompts: OrchestratorPrompts) { orchestratorPrompts = prompts; }

export function getLoopHistory() { return loopHistory; }
export function setLoopHistory(history: LoopHistoryItem[]) { loopHistory = history; }

export function getViewedIteration() { return viewedIteration; }
export function setViewedIteration(iteration: number) { viewedIteration = iteration; }

export function getIsAppRendered() { return isAppRendered; }
export function setIsAppRendered(rendered: boolean) { isAppRendered = rendered; }

export function getCurrentProject() { return currentProject; }
export function setCurrentProject(project: ProjectManager | null) { currentProject = project; } 