import { getElementById, newProjectModalContainer, testModalContainer, validateDOMElements } from './ui/dom-elements';
import { closeNewProjectModal, closeTestModal } from './ui/modal-manager';
import { openSettingsModal, openOnboardingWizard, createModalFactory, setDefaultModalFactory } from './ui/modals/ModalFactory';
import * as state from './state';
import { ProjectManager } from './ProjectManager';
import { DocumentNode, GenerationSession, ChildScope } from './DocumentNode';
import type { ImportedVersionJson } from './ui/types/ProjectUiTypes';
import { ProjectTemplate } from './ProjectTemplate';
import type { InferredTemplate } from './services/TemplateInferenceService';
import { initializeProjectUI } from './ui/project-ui';
import { LoopHistoryItem } from './LoopOrchestrator';

import { SettingsManager } from './SettingsManager';
import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator } from './LoopOrchestrator';

import { openTemplateEditor } from './ui/template-editor';
import { TemplateManager } from './TemplateManager';
import { STORAGE_KEYS } from './constants';
import { NewProjectModal } from './ui/modals/NewProjectModal';
import { AssertFlatTemplateCopy } from './ProjectUtils';
import { applyConditionalContextItems, restoreConditionalContextItems } from './ContextFormat';
import { GenerationErrorService } from './ui/modals/services/GenerationErrorService';

/**
 * Open the RPG View
 */
async function openRPGMode(): Promise<void> {
    try {
        // Import and open the real RPG View
        const { openRPGView } = await import('./rpg/ui/RPGView');
        await openRPGView();
        console.log('🎲 RPG Mode opened');
    } catch (error) {
        console.error('❌ Failed to open RPG Mode:', error);
        alert('Failed to open RPG Mode. Please try again.');
    }
}

/**
 * Open the RPG Lite View
 */
async function openRPGLiteMode(): Promise<void> {
    try {
        const { openRPGLiteView } = await import('./rpg-lite/ui/RPGLiteView');
        await openRPGLiteView();
        console.log('🗨️ RPG Lite opened');
    } catch (error) {
        console.error('❌ Failed to open RPG Lite:', error);
        alert('Failed to open RPG Lite. Please try again.');
    }
}

/**
 * Open the World RPG View
 */
async function openWorldRpgMode(): Promise<void> {
    try {
        const { openWorldRpgView } = await import('./world-rpg/ui/WorldRpgView');
        await openWorldRpgView();
        console.log('🗺️ World RPG opened');
    } catch (error) {
        console.error('❌ Failed to open World RPG:', error);
        alert('Failed to open World RPG. Please try again.');
    }
}

/**
 * Open the Idea Board in a modal or overlay
 */
async function openIdeaBoard(): Promise<void> {
    try {
        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.id = 'idea-board-modal';
        modalContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Create board container
        const boardContainer = document.createElement('div');
        boardContainer.style.cssText = `
            width: 95vw;
            height: 90vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            background: #333;
            color: white;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: between;
            border-radius: 12px 12px 0 0;
        `;
        header.innerHTML = `
            <span style="font-size: 1.1rem; font-weight: 600;">🧠 Idea Board</span>
            <button id="close-idea-board" style="
                background: none;
                border: none;
                color: white;
                font-size: 1.2rem;
                cursor: pointer;
                margin-left: auto;
                padding: 4px 8px;
                border-radius: 4px;
                transition: background 0.2s;
            " onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
               onmouseout="this.style.background='none'">✕</button>
        `;

        // Create board content area
        const contentArea = document.createElement('div');
        contentArea.style.cssText = `
            flex: 1;
            position: relative;
            background: #f5f5f5;
        `;

        // Assemble modal
        boardContainer.appendChild(header);
        boardContainer.appendChild(contentArea);
        modalContainer.appendChild(boardContainer);
        document.body.appendChild(modalContainer);

        // Import and initialize idea board
        const { IdeaBoard } = await import('./idea-board/index');
        const boardName = 'Global Ideas';
        
        const ideaBoard = new IdeaBoard(contentArea, boardName);
        
        // Store globally for access from other parts of the application
        window.currentIdeaBoard = ideaBoard;
        
        console.log('🗒️ Idea Board opened');

        // Close button handler
        const closeBtn = header.querySelector('#close-idea-board');
        closeBtn?.addEventListener('click', () => {
            ideaBoard.destroy();
            modalContainer.remove();
            delete window.currentIdeaBoard;
            console.log('🗒️ Idea Board closed');
        });

        // Close on backdrop click
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                ideaBoard.destroy();
                modalContainer.remove();
                delete window.currentIdeaBoard;
                console.log('🗒️ Idea Board closed');
            }
        });

        // ESC key to close
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                ideaBoard.destroy();
                modalContainer.remove();
                delete window.currentIdeaBoard;
                document.removeEventListener('keydown', handleEscape);
                console.log('🗒️ Idea Board closed');
            }
        };
        document.addEventListener('keydown', handleEscape);

    } catch (error) {
        console.error('❌ Failed to open Idea Board:', error);
        alert('Failed to open Idea Board. Please try again.');
    }
}

/**
 * Show a simple progress modal during text analysis
 */
function showProgressModal(message: string): HTMLElement {
    const modalHtml = `
        <div id="progress-modal" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        ">
            <div style="
                background: white;
                padding: 2rem;
                border-radius: 8px;
                text-align: center;
                max-width: 560px;
                width: 90%;
            ">
                <div style="margin-bottom: 1rem;">
                    <div style="
                        border: 3px solid #f3f3f3;
                        border-top: 3px solid #007bff;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin: 0 auto;
                    "></div>
                </div>
                <div class="progress-message" style="font-size: 1rem; color: #333; margin-bottom: 0.75rem;">${message}</div>
                <div class="progress-log" style="text-align: left; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:0.5rem 0.75rem; max-height:40vh; overflow:auto; font-size:0.9rem; color:#374151; white-space: pre-wrap;"></div>
            </div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    
    const modalElement = document.createElement('div');
    modalElement.innerHTML = modalHtml;
    document.body.appendChild(modalElement);
    return modalElement;
}

function progressSetMessage(modalElement: HTMLElement, message: string): void {
    const el = modalElement.querySelector('.progress-message');
    if (!el) {
        throw new Error('Progress modal is missing .progress-message element');
    }
    el.textContent = message;
}

function progressLog(modalElement: HTMLElement, line: string): void {
    const log = modalElement.querySelector('.progress-log');
    if (!log) {
        throw new Error('Progress modal is missing .progress-log element');
    }
    const logElement = log as HTMLElement;
    const entry = document.createElement('div');
    entry.textContent = line;
    logElement.appendChild(entry);
    logElement.scrollTop = logElement.scrollHeight;
}

/**
 * Close the progress modal
 */
function closeProgressModal(modalElement: HTMLElement): void {
    modalElement.parentNode?.removeChild(modalElement);
}

async function onModelsSelected(models: Record<string, string>, webSearchEnabled?: Record<string, boolean>, selectedProviders?: Record<string, string>) {
    const modelSelector = state.getModelSelector();
    if (!modelSelector) {
        throw new Error('ModelSelector not available - services not properly initialized');
    }
    
    // The model selector now handles its own storage internally.
    // We just need to reconfigure services and save the updated models to the active settings profile.
    recreateAndReconfigureServices();
    
    // CRITICAL FIX: Use centralized ProfileManagerService instead of getLastUsedProfileName()
    // This ensures models are saved to the profile the user is actually editing
    const { getProfileManagerService } = await import('./ui/services/ProfileManagerService');
    const profileManager = getProfileManagerService();
    
    await profileManager.saveModelsToCurrentProfile(models, webSearchEnabled, selectedProviders);

    // Settings modal now closes automatically after saving
    // No need to explicitly close since SettingsModal manages its own lifecycle
}

function recreateAndReconfigureServices() {
    const modelSelector = state.getModelSelector();
    const settingsManager = state.getSettingsManager();
    if (!modelSelector) {
        throw new Error("ModelSelector not available - services not properly initialized");
    }
    if (!settingsManager) {
        throw new Error("SettingsManager not available - services not properly initialized");
    }
    const client = OpenRouterClient.getInstance();
    
    // Connect the OpenRouterClient to the SettingsManager for AI logging
    client.setSettingsManager(settingsManager);
    
    const activeProject = state.getActiveProject();
    if (!activeProject) {
        throw new Error('No active project');
    }
    const projectSettings = activeProject.getSettingsManager();
    const orchestratorPrompts = state.getOrchestratorPrompts();
    if (!orchestratorPrompts) {
        throw new Error("OrchestratorPrompts not available - application state corrupted");
    }
    const orchestrator = new LoopOrchestrator(projectSettings, client, orchestratorPrompts);
    state.setOpenRouterClient(client);
    state.setOrchestrator(orchestrator);
    
}

interface AIGeneratedData {
    isAIGenerated: boolean;
    content?: string;
    context?: string;
    description?: string;
    projectType?: string;
    options?: Record<string, unknown>;
}

type ImportTemplateField = string[] | { name?: string; hierarchyLevels?: string[] };

// Removed generateSimpleId - using centralized ContextIDGenerator instead
// AI conditional context creation now lives in the shared applyConditionalContextItems
// helper (ContextFormat.ts) so every import/creation path behaves identically.

/**
 * Uniform finalize step for an already-built imported project: register it,
 * make it active, reconfigure services for it, persist, and open its UI.
 * Shared by every text/PDF import path so they all end identically.
 */
async function finalizeImportedProject(project: ProjectManager): Promise<void> {
    state.addProject(project);
    state.setActiveProject(project.rootNode.id);
    recreateAndReconfigureServices();
    await project.saveToStorage();
    await initializeProjectUI(project);
}

function handleCreateProject(title: string, template: ProjectTemplate, aiData?: unknown) {
    const orchestrator = state.getOrchestrator();
    const settingsManager = state.getSettingsManager();
    const client = state.getOpenRouterClient();

    if (!orchestrator || !settingsManager || !client) {
        alert('Core services not initialized. Cannot create project.');
        return;
    }
    
    const project = new ProjectManager(title, template, orchestrator, settingsManager, client);
    
    // Set the project language to match current language setting
    try {
        const currentLanguage = settingsManager.getLanguage();
        project.setLanguage(currentLanguage);
        console.log(`🌐 New project language set to: ${currentLanguage}`);
    } catch (error) {
        console.warn('Could not set project language:', error);
    }
    
    // Ensure all nodes share the same template reference
    AssertFlatTemplateCopy(project);
    
    // Apply AI-generated content and context to root node if provided
    const typedAiData = aiData as AIGeneratedData | undefined;
    if (typedAiData?.isAIGenerated) {
        console.log('🤖 Applying AI-generated content and context to root node');
        const rootNode = project.rootNode;
        
        // Use version management system for content/context updates

        
        if (typedAiData.content !== undefined) {
            rootNode.setContent(typedAiData.content, 'master');
            console.log('✅ Applied AI content to root node, length:', typedAiData.content.length);
        }
        
        if (typedAiData.context !== undefined) {
            // Parse AI-generated conditional context with trigger tags
            console.log('🔄 Parsing AI-generated conditional context items');
            applyConditionalContextItems(rootNode, typedAiData.context);
            console.log('✅ Applied AI conditional context to root node, length:', typedAiData.context.length);
        }
        
        // Store AI metadata in content for reference
        if (typedAiData.description) {
            console.log('�� AI project created from description:', typedAiData.description);
            console.log('🎯 Project type:', typedAiData.projectType);
            console.log('⚙️ Generation options:', typedAiData.options);
        }
    }
    
    state.addProject(project);
    
    // Set the new project as active and select its root node
    state.setActiveProject(project.rootNode.id);
    
    // Recreate and configure services for the new project
    recreateAndReconfigureServices();
    
    void project.saveToStorage();
    
    closeNewProjectModal();
    void initializeProjectUI(project);
}

interface ImportNodeData {
    title?: string;
    content?: string;
    context?: string;
    generationPrompt?: string;
    children?: ImportNodeData[];
    // Enhanced export fields
    id?: string;
    level?: number;
    hierarchyTemplate?: string[]; // Node hierarchy template (different from project template)
    generationHistory?: LoopHistoryItem[];
    generationSessions?: GenerationSession[];
    versions?: ImportedVersionJson[];
    collapsed?: boolean;
    creatorModel?: string;
    // Conditional context (node-level)
    conditionalContextItems?: Array<{
        id: string;
        text: string;
        keywords?: string[];
        childScope?: ChildScope;
        leavesOnly?: boolean;
    }>;
    // Legacy fields for backward compatibility
    template?: ImportTemplateField;
}

function handleImportProject(title: string, template: ProjectTemplate, importData: ImportNodeData) {
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
        
        // Ensure all nodes share the same template reference
        AssertFlatTemplateCopy(project);
        
        // Enhanced: Import root node data with version support
        const rootNode = project.rootNode;
        
                if (importData.versions && Array.isArray(importData.versions) && importData.versions.length > 0) {
            console.log(`🔄 Importing root node with enhanced version data: ${importData.versions.length} versions`);
            
            // Replace the root node with a fully restored version
            const nodeDataForCreation = {
                id: rootNode.id, // Keep the same ID for root
                title: importData.title ?? 'Imported Project',
                level: 0, // Root level
                parentId: null,
                template: template.hierarchyLevels, // Use the project template's hierarchy levels
                generationPrompt: importData.generationPrompt,
                generationHistory: importData.generationHistory ?? [],
                generationSessions: importData.generationSessions ?? [],
                versions: importData.versions, // This will be properly handled by DocumentNode.fromJSON
                collapsed: importData.collapsed ?? false,
                children: [], // Will be handled recursively
                conditionalContextItems: Array.isArray(importData.conditionalContextItems) ? importData.conditionalContextItems : []
            };
            
            // Create new root node with full version data
            const restoredRootNode = DocumentNode.fromJSON(nodeDataForCreation);
            
            // Replace the project's root node. The project title follows the root
            // node's title automatically, so there is nothing else to set here.
            project.rootNode = restoredRootNode;
            
        } else {
            console.log(`🔄 Importing root node with legacy format (no version data)`);
            
            // Legacy import: Set properties individually
            if (importData.title !== undefined) {
                rootNode.setTitle(importData.title, 'imported');
            }

            if (importData.content !== undefined) {
                rootNode.setContent(importData.content, 'imported');
            }

            if (importData.context !== undefined) {
                // Traditional context removed - context handled by conditional context system
            }

            if (importData.generationPrompt !== undefined) {
                rootNode.generationPrompt = importData.generationPrompt;
            }

            // Restore conditional context items (node-level)
            restoreConditionalContextItems(rootNode, importData.conditionalContextItems);
        }

        // Import children recursively if they exist
        if (importData.children && Array.isArray(importData.children)) {
            importData.children.forEach((childData: ImportNodeData, index: number) => {
                importChildNodeForProject(project, rootNode.id, childData, index);
            });
        }
        
        // Propagate the correct template to all nodes in the project
        const propagateRecursively = (node: DocumentNode) => {
            // Update the node's template to be a shallow copy of the project template
            node.template = [...template.hierarchyLevels];
            
            // Recursively propagate to all children
            node.children.forEach(child => { propagateRecursively(child); });
        };
        propagateRecursively(project.rootNode);
        
        // Ensure all nodes share the same template reference for dropdown population
        AssertFlatTemplateCopy(project);
        
        // Add to state and save
        state.addProject(project);
        
        // Set the imported project as active and select its root node
        state.setActiveProject(project.rootNode.id);
        
        // Recreate and configure services for the imported project
        recreateAndReconfigureServices();
        
        void project.saveToStorage();
        
        void initializeProjectUI(project);
        alert(`Project "${title}" imported successfully!`);
        
    } catch (error) {
        console.error('Import project failed:', error);
        alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}

// Removed unused function calculateImportDepth

function importChildNodeForProject(project: ProjectManager, parentId: string, childData: ImportNodeData, index: number): void {
    if (!childData.title) {
        console.warn(`Skipping child node at index ${index}: Missing title`);
        return;
    }

    const parentNode = project.findNodeById(parentId);
    if (!parentNode) {
        console.warn(`Parent node not found: ${parentId}`);
        return;
    }

    // Enhanced: Check if we have version data (new format) or need legacy import
    let newNode: DocumentNode;
    
    if (childData.versions && Array.isArray(childData.versions) && childData.versions.length > 0) {
        console.log(`🔄 Importing project child with enhanced version data: ${childData.versions.length} versions`);
        
        // FIXED: Use proper project manager method to ensure template sharing
        newNode = project.addNode(childData.title, parentId);
        
        // Now restore the version data and other properties
        newNode.id = `imported_${Date.now()}_${childData.id ?? 'unknown'}`; // New ID to avoid conflicts
        
        newNode.importVersionsFromExport(childData.versions);
        
        // Restore other properties
        if (childData.generationPrompt) {
            newNode.generationPrompt = childData.generationPrompt;
        }
        if (childData.generationHistory) {
            newNode.generationHistory = childData.generationHistory;
        }
        if (childData.generationSessions) {
            newNode.generationSessions = childData.generationSessions;
        }
        if (childData.collapsed !== undefined) {
            newNode.collapsed = childData.collapsed;
        }
        // Restore conditional context items (node-level)
        restoreConditionalContextItems(newNode, childData.conditionalContextItems);
        
    } else {
        console.log(`🔄 Importing project child with legacy format (no version data)`);
        
        // Legacy import: Create new node and set properties individually
        newNode = importChildNodeWithRootTemplateForProject(project, parentId, childData.title);

        // Set node properties using version management system
        if (childData.content !== undefined) {
            newNode.setContent(childData.content, 'imported');
        }

        if (childData.context !== undefined) {
            // Traditional context removed - context handled by conditional context system
        }

        if (childData.generationPrompt !== undefined) {
            newNode.generationPrompt = childData.generationPrompt;
        }
        // Restore conditional context items (node-level)
        restoreConditionalContextItems(newNode, childData.conditionalContextItems);
    }

    // Recursively import children
    if (childData.children && Array.isArray(childData.children)) {
        childData.children.forEach((grandChildData: ImportNodeData, grandChildIndex: number) => {
            importChildNodeForProject(project, newNode.id, grandChildData, grandChildIndex);
        });
    }
}

/**
 * Creates a new child node with the root template instead of parent template for project imports
 */
function importChildNodeWithRootTemplateForProject(project: ProjectManager, parentId: string, title: string): DocumentNode {
    const parent = project.findNodeById(parentId);
    if (!parent) {
        throw new Error(`Parent node with ID "${parentId}" not found.`);
    }

    const newLevel = parent.level + 1;
    // Use root template (shallow copy) instead of parent template
    const rootTemplate = [...project.rootNode.template];
    const newNode = new DocumentNode(newLevel, title, parent.id, rootTemplate);
    
    parent.children.push(newNode);
    
    return newNode;
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
        
        projects.forEach(project => { state.addProject(project); });
        if (activeProjectId) {
            state.setActiveProject(activeProjectId);
        }
    } catch (error) {
        console.error("Failed to load projects from storage:", error);
        // Try to clear any corrupted storage
        try {
            const storage = await import('./StorageService').then(async m => m.StorageService.getInstance());
            await storage.delete(STORAGE_KEYS.CURRENT_PROJECT);
            await storage.delete(STORAGE_KEYS.PROJECTS);
            await storage.delete(STORAGE_KEYS.ACTIVE_PROJECT);
        } catch (cleanupError) {
            console.error("Failed to cleanup corrupted storage:", cleanupError);
        }
    }
}

export async function initialize() {
    // Check browser compatibility first
  
    const { compatible, issues } = OpenRouterClient.checkBrowserCompatibility();
    
    if (!compatible) {
        console.warn(`⚠️ Browser compatibility issues detected:`, issues);
        // Show a warning but don't block execution
        if (issues.length > 0) {
            const issuesText = issues.join('\n• ');
            alert(`⚠️ Browser Compatibility Warning\n\nThe following features may not work properly:\n• ${issuesText}\n\nPlease consider updating your browser or trying a different browser.`);
        }
    } else {
        console.log('✅ Browser compatibility check passed');
    }

    // Validate DOM elements are available
    try {
        validateDOMElements();
    } catch (error) {
        console.error('❌ DOM validation failed:', error);
        // Continue execution even if validation fails
    }
    
    const settingsManager = await SettingsManager.getInstance();
    state.setSettingsManager(settingsManager);
    
    // CRITICAL: Transfer orchestrator prompts from SettingsManager to global state
    // This was missing and causing the OrchestratorPrompts not available error
    state.setOrchestratorPrompts(settingsManager.getPrompts());

    const templateManager = new TemplateManager();
    state.setTemplateManager(templateManager);
    
            const modelSelector = new ModelSelector((models, webSearch, providers) => {
            void onModelsSelected(models, webSearch, providers);
        }, () => {
        // Settings modal now handles its own closing
        // This callback is kept for ModelSelector compatibility
    });
    state.setModelSelector(modelSelector);

    // Wait for async initialization to complete
    await modelSelector.waitForInitialization();

    // Initialize the modal factory with dependencies
    const modalFactory = createModalFactory({
        settingsManager,
        modelSelector,
        refreshGlobalProfileSelector: () => {
            // Import the function dynamically to avoid circular dependencies
            void import('./ui/project-ui').then(({ refreshGlobalProfileSelector }) => {
                void refreshGlobalProfileSelector();
            });
        }
    });
    setDefaultModalFactory(modalFactory);

    // Set initial loaded profile name to match what's in SettingsManager
    const initialProfileName = settingsManager.getLastUsedProfileName();
    if (initialProfileName) {
        state.setCurrentlyLoadedProfileName(initialProfileName);

    }

    // Create minimal services for loading projects
    const client = OpenRouterClient.getInstance();
    client.setSettingsManager(settingsManager);
    state.setOpenRouterClient(client);
    
    // Create a minimal orchestrator just for loading projects
    const minimalOrchestrator = new LoopOrchestrator(settingsManager, client, state.getOrchestratorPrompts() ?? undefined);
    state.setOrchestrator(minimalOrchestrator);
    
    await loadPersistedProjects();
    
    // Recreate and configure services properly if there's an active project
    if (state.getActiveProject()) {
        recreateAndReconfigureServices();
    }
    
    // Initialize the UI with projects (if any)
    void initializeProjectUI();

    // Initialize language synchronization between projects and settings
    state.initializeLanguageSync();

    // Attach event listeners
    try {
    getElementById('settingsBtn').addEventListener('click', () => {
        openSettingsModal();
    });
    } catch (error) {
        console.error('❌ Failed to attach settings button listener:', error);
    }
    
    // Add global emergency escape for error modal loops
    try {
    document.addEventListener('keydown', (event) => {
        // Triple ESC press to emergency clear error modals
        if (event.key === 'Escape') {
            const now = Date.now();
            if (!event.ctrlKey) return; // Must hold Ctrl
            
            // Store last escape press time
            const lastEscape = window._lastEscapePress ?? 0;
            if (now - lastEscape < 1000) { // Within 1 second
                const escapeCount = (window._escapeCount ?? 0) + 1;
                window._escapeCount = escapeCount;
                
                if (escapeCount >= 3) {
                    console.log('🚨 Emergency escape activated - clearing all error modals');
                    const errorService = GenerationErrorService.getInstance();
                    errorService.clearAllErrorModals();
                    window._escapeCount = 0;
                    event.preventDefault();
                    event.stopPropagation();
                }
            } else {
                window._escapeCount = 1;
            }
            window._lastEscapePress = now;
        }
    });
    } catch (error) {
        console.error('❌ Failed to attach emergency escape listener:', error);
    }
    

    
    try {
    getElementById('newProjectBtn').addEventListener('click', () => {
        const settingsManager = state.getSettingsManager();
        if (settingsManager) {
            void NewProjectModal.open(handleCreateProject, settingsManager);
        }
    });
    } catch (error) {
        console.error('❌ Failed to attach new project button listener:', error);
    }
    
    try {
        getElementById('comprehensiveExportBtn').addEventListener('click', () => {
            void import('./ui/modals/ModalFactory').then(({ openComprehensiveExportModal }) => {
                openComprehensiveExportModal();
            }).catch(error => {
                console.error('Failed to open comprehensive export modal:', error);
                alert('Failed to open comprehensive export dialog. Please try again.');
            });
        });

        // Idea Board button
        getElementById('idea-board-btn').addEventListener('click', () => {
            void openIdeaBoard();
        });

        // RPG Mode button
        getElementById('rpg-mode-btn').addEventListener('click', () => {
            void openRPGMode();
        });

        // RPG Lite button
        getElementById('rpg-lite-mode-btn').addEventListener('click', () => {
            void openRPGLiteMode();
        });

        // World RPG button
        getElementById('world-rpg-mode-btn').addEventListener('click', () => {
            void openWorldRpgMode();
        });



        getElementById('importProjectBtn').addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Create or get existing dropdown
            let dropdown = document.getElementById('import-dropdown') as HTMLDivElement | null;
            
            if (dropdown) {
                // Toggle visibility; always reset to the top-level menu when showing
                // (a previous interaction may have left the submenu rendered).
                const isVisible = dropdown.style.display === 'block';
                if (isVisible) {
                    dropdown.style.display = 'none';
                } else {
                    renderTopLevelImportMenu(dropdown);
                    dropdown.style.display = 'block';
                }
                return;
            }
            
            // Create dropdown
            dropdown = document.createElement('div');
            dropdown.id = 'import-dropdown';
            dropdown.style.cssText = `
                position: absolute;
                top: 100%;
                right: 0;
                background: white;
                border: 1px solid var(--secondary-300);
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 1000;
                min-width: 200px;
                display: block;
            `;
            
            renderTopLevelImportMenu(dropdown);
            
                         // Position dropdown relative to button
             const button = getElementById('importProjectBtn');
             const buttonRect = button.getBoundingClientRect();
             const headerContainer = button.closest('.header-buttons');
             
             if (headerContainer instanceof HTMLElement) {
                 headerContainer.style.position = 'relative';
                 headerContainer.appendChild(dropdown);
             } else {
                 document.body.appendChild(dropdown);
                 dropdown.style.position = 'fixed';
                 dropdown.style.top = `${buttonRect.bottom + 5}px`;
                 dropdown.style.right = `${window.innerWidth - buttonRect.right}px`;
             }
             
             // Handle dropdown clicks
             const handleImportDropdownClick = (e: MouseEvent): void => {
                 const target = e.target as HTMLElement;
                 const actionButton = target.closest('[data-action]');
                 
                 if (actionButton instanceof HTMLElement) {
                     // Keep this click from reaching the document-level outside-close
                     // handler. Rendering a submenu replaces the dropdown's innerHTML,
                     // which detaches the clicked node; the outside-close handler would
                     // then mistake it for an outside click and hide the dropdown.
                     e.stopPropagation();

                     const action = actionButton.dataset['action'];

                     // 'import-text' opens a second-level Concepts-only / Full-text
                     // choice in the same dropdown rather than dispatching immediately.
                     if (action === 'import-text') {
                         renderTextImportSubmenu(dropdown);
                         return;
                     }

                     dropdown.style.display = 'none';

                     try {
                         switch (action) {
                             case 'expert-project':
                                 handleExpertProjectImport();
                                 break;
                             case 'text-concepts':
                                 handleTextImport('concept');
                                 break;
                             case 'text-fulltext':
                                 handleTextImport('fulltext');
                                 break;
                         }
                     } catch (error) {
                         console.error('Import failed:', error);
                         alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
                     }
                 }
             };
             dropdown.addEventListener('click', handleImportDropdownClick);
            
            // Close dropdown when clicking outside
            const closeDropdown = (e: Event) => {
                if (!dropdown.contains(e.target as Node) && e.target !== button) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('click', closeDropdown);
                }
            };
            
            setTimeout(() => {
                document.addEventListener('click', closeDropdown);
            }, 0);
                 });
    } catch (error) {
        console.error('❌ Failed to attach import project button listener:', error);
    }

    // Handler functions for the import dropdown options
    function handleExpertProjectImport(): void {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';

        const processExpertProjectFile = (event: ProgressEvent<FileReader>): void => {
            try {
                const content = event.target!.result as string;
                const importData = JSON.parse(content) as ImportNodeData;

                let templateData: { name: string; hierarchyLevels: string[] } | undefined;
                const rawTemplate = importData.template;
                if (rawTemplate && !Array.isArray(rawTemplate) && rawTemplate.name && rawTemplate.hierarchyLevels) {
                    templateData = {
                        name: rawTemplate.name,
                        hierarchyLevels: rawTemplate.hierarchyLevels,
                    };
                }

                if (!templateData) {
                    if (Array.isArray(importData.template)) {
                        templateData = {
                            name: `Imported Template (${importData.title ?? 'Unknown'})`,
                            hierarchyLevels: importData.template,
                        };
                    } else if (importData.children && importData.children.length > 0) {
                        let foundTemplate: string[] | null = null;
                        for (const child of importData.children) {
                            if (child.template && Array.isArray(child.template)) {
                                foundTemplate = child.template;
                                break;
                            }
                        }

                        if (foundTemplate) {
                            templateData = {
                                name: `Imported Template (${importData.title ?? 'Unknown'})`,
                                hierarchyLevels: foundTemplate,
                            };
                        } else {
                            throw new Error('Invalid import file: Missing or incomplete template information');
                        }
                    } else {
                        throw new Error('Invalid import file: Missing or incomplete template information');
                    }
                }

                const bestTemplate = new ProjectTemplate(
                    templateData.name,
                    templateData.hierarchyLevels
                );

                handleImportProject(importData.title ?? 'Imported Project', bestTemplate, importData);
            } catch (error) {
                console.error('JSON import failed:', error);
                alert('JSON import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
            }
        };
        
        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                processExpertProjectFile(event);
            };
            
            reader.onerror = () => {
                alert('Failed to read JSON file. Please try again.');
            };
            
            reader.readAsText(file);
        });
        
        // Trigger file selection
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    // Render the top-level import menu (Expert project + Import Text/PDF).
    function renderTopLevelImportMenu(dropdown: HTMLElement): void {
        dropdown.innerHTML = `
            <button class="import-option" data-action="expert-project" style="
                width: 100%;
                padding: 12px 16px;
                border: none;
                background: white;
                text-align: left;
                cursor: pointer;
                border-radius: 8px 8px 0 0;
                font-size: 14px;
                color: var(--text-primary);
            ">
                📁 Import Expert Project
                <div style="font-size: 12px; color: var(--secondary-600); margin-top: 4px;">
                    Load complete Expert project files (JSON)
                </div>
            </button>
            <button class="import-option" data-action="import-text" style="
                width: 100%;
                padding: 12px 16px;
                border: none;
                background: white;
                text-align: left;
                cursor: pointer;
                border-top: 1px solid var(--secondary-200);
                border-radius: 0 0 8px 8px;
                font-size: 14px;
                color: var(--text-primary);
            ">
                📄 Import Text/PDF
                <div style="font-size: 12px; color: var(--secondary-600); margin-top: 4px;">
                    Concepts only, or full text (MD, TXT, PDF)
                </div>
            </button>
        `;
        attachImportOptionHover(dropdown);
    }

    function attachImportOptionHover(dropdown: HTMLElement): void {
        dropdown.querySelectorAll('.import-option').forEach(option => {
            option.addEventListener('mouseenter', () => {
                (option as HTMLElement).style.backgroundColor = 'var(--secondary-50)';
            });
            option.addEventListener('mouseleave', () => {
                (option as HTMLElement).style.backgroundColor = 'white';
            });
        });
    }

    // Render the second-level Concepts-only / Full-text choice into the import
    // dropdown. Keeps the dropdown open; dispatch happens on the sub-option click.
    function renderTextImportSubmenu(dropdown: HTMLElement): void {
        dropdown.innerHTML = `
            <button class="import-option" data-action="text-concepts" style="
                width: 100%;
                padding: 12px 16px;
                border: none;
                background: white;
                text-align: left;
                cursor: pointer;
                border-radius: 8px 8px 0 0;
                font-size: 14px;
                color: var(--text-primary);
            ">
                🧠 Concepts only
                <div style="font-size: 12px; color: var(--secondary-600); margin-top: 4px;">
                    AI extracts a titled outline + context
                </div>
            </button>
            <button class="import-option" data-action="text-fulltext" style="
                width: 100%;
                padding: 12px 16px;
                border: none;
                background: white;
                text-align: left;
                cursor: pointer;
                border-top: 1px solid var(--secondary-200);
                border-radius: 0 0 8px 8px;
                font-size: 14px;
                color: var(--text-primary);
            ">
                📄 Full text
                <div style="font-size: 12px; color: var(--secondary-600); margin-top: 4px;">
                    Preserve the source and segment into a hierarchy
                </div>
            </button>
        `;
        attachImportOptionHover(dropdown);
    }

    // Unified text/PDF import: 'concept' reuses the AI creator pipeline,
    // 'fulltext' segments the source into a template hierarchy. Both produce
    // conditional context items and finalize through the shared path.
    function handleTextImport(mode: 'concept' | 'fulltext'): void {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.md,.txt,.pdf';
        fileInput.style.display = 'none';

        const processTextImportFile = async (file: File): Promise<void> => {
            const orchestrator = state.getOrchestrator();
            const settingsManager = state.getSettingsManager();
            const client = state.getOpenRouterClient();
            if (!orchestrator || !settingsManager || !client) {
                alert('Core services not initialized. Cannot import.');
                return;
            }

            const { TextImportService } = await import('./services/TextImportService');
            const service = new TextImportService(orchestrator, settingsManager, client);

            const progressModal = showProgressModal('Reading file...');
            try {
                const text = await TextImportService.acquireText(file);
                if (!text.trim()) {
                    throw new Error('The file contained no readable text.');
                }

                if (mode === 'concept') {
                    progressSetMessage(progressModal, 'Analyzing concept with AI...');
                    const project = await service.buildConceptProject(text, file.name);
                    closeProgressModal(progressModal);
                    await finalizeImportedProject(project);
                } else {
                    progressSetMessage(progressModal, 'Analyzing document structure...');
                    const { TemplateInferenceService } = await import('./services/TemplateInferenceService');
                    const inference = new TemplateInferenceService(client, settingsManager);
                    const proposed = await inference.inferTemplate(text, file.name.replace(/\.[^/.]+$/, ''));
                    closeProgressModal(progressModal);

                    const reviewed = await showTemplateReviewDialog(proposed);
                    if (!reviewed) return;

                    const runModal = showProgressModal('Segmenting document by template...');
                    try {
                        const project = await service.buildFullTextProject(text, file.name, reviewed.template, {
                            status: (m) => { progressSetMessage(runModal, m); },
                            splitStart: (level, parentTitle) => { progressLog(runModal, `Finding ${level.toLowerCase()} in "${parentTitle}"...`); },
                            splitDone: (level, parentTitle, count) => { progressLog(runModal, `Found ${count} ${level.toLowerCase()} in "${parentTitle}".`); },
                            summarizeStart: (title, n) => { progressLog(runModal, `Summarizing ${title} from ${n} children...`); },
                            summarizeDone: (title) => { progressLog(runModal, `Summarized ${title}.`); }
                        }, reviewed.groupAboveCount);
                        closeProgressModal(runModal);
                        await finalizeImportedProject(project);
                    } catch (err) {
                        closeProgressModal(runModal);
                        throw err;
                    }
                }
            } catch (error) {
                closeProgressModal(progressModal);
                console.error('Text import failed:', error);
                alert('Text import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
            }
        };

        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;
            void processTextImportFile(file);
        });

        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    /**
     * Show the auto-inferred template for review/editing before the import runs.
     * The user can rename the project and each level, and add/remove levels.
     * Resolves to the edited ProjectTemplate, or null on cancel.
     */
    async function showTemplateReviewDialog(proposed: InferredTemplate): Promise<InferredTemplate | null> {
        return new Promise<InferredTemplate | null>((resolve) => {
            // Working state: index 0 is the project/root label, the rest are child levels.
            const labels: string[] = [...proposed.template.hierarchyLevels];
            if (labels.length < 2) {
                labels.push('Chapter');
            }
            // How many leading child levels are realized by upward grouping. Kept in
            // sync as the user removes levels so it always points at real grouping
            // rows; clamped to leave at least one non-grouping child level.
            let groupAboveCount = proposed.groupAboveCount;

            const backdrop = document.createElement('div');
            backdrop.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2000; display: flex; align-items: center; justify-content: center;`;

            const dialog = document.createElement('div');
            dialog.style.cssText = `background: var(--secondary-50, #f8fafc); color: var(--secondary-900, #0f172a); border: 1px solid var(--secondary-300, #cbd5e1); border-radius: 12px; padding: 1rem; width: min(92vw, 560px); max-height: 80vh; overflow: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.3);`;

            const inputStyle = `flex: 1 1 auto; min-width: 0; padding: 0.4rem 0.6rem; border: 1px solid var(--secondary-300, #cbd5e1); border-radius: 8px; background: #ffffff; color: var(--secondary-900, #0f172a); font-size: 0.85rem;`;
            const smallBtnStyle = `padding: 0.35rem 0.6rem; border: 1px solid var(--secondary-300, #cbd5e1); border-radius: 8px; background: #ffffff; color: var(--secondary-700, #334155); cursor: pointer; font-size: 0.85rem;`;
            const primaryBtnStyle = `padding: 0.4rem 0.85rem; border: none; border-radius: 8px; background: var(--primary-500, #2563eb); color: #ffffff; cursor: pointer; font-size: 0.85rem; font-weight: 600;`;

            const head = document.createElement('div');
            head.innerHTML = `
                <h3 style="margin: 0 0 0.3rem 0; color: var(--secondary-900, #0f172a); font-size: 1rem;">Review import template</h3>
                <p style="margin: 0 0 0.6rem 0; color: var(--secondary-700, #334155); font-size: 0.8rem;">This template was inferred from the document. Adjust the project name and the hierarchy levels (outermost first), then import.</p>
            `;
            dialog.appendChild(head);

            const rootRow = document.createElement('div');
            rootRow.style.cssText = 'display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem;';
            rootRow.innerHTML = `<label style="width:5.5rem; flex:0 0 auto; font-size:0.8rem; color:var(--secondary-700,#334155);">Project</label>`;
            const rootInput = document.createElement('input');
            rootInput.type = 'text';
            rootInput.value = labels[0] ?? '';
            rootInput.style.cssText = inputStyle;
            rootInput.addEventListener('input', () => { labels[0] = rootInput.value; });
            rootRow.appendChild(rootInput);
            dialog.appendChild(rootRow);

            const levelsContainer = document.createElement('div');
            levelsContainer.style.cssText = 'display:flex; flex-direction:column; gap:0.4rem;';
            dialog.appendChild(levelsContainer);

            const renderLevels = (): void => {
                levelsContainer.innerHTML = '';
                for (let i = 1; i < labels.length; i++) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; align-items:center; gap:0.5rem;';

                    const tag = document.createElement('label');
                    tag.style.cssText = 'width:5.5rem; flex:0 0 auto; font-size:0.8rem; color:var(--secondary-700,#334155);';
                    tag.textContent = i === labels.length - 1 ? `Level ${i} (leaf)` : `Level ${i}`;
                    row.appendChild(tag);

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = labels[i] ?? '';
                    input.style.cssText = inputStyle;
                    input.addEventListener('input', () => { labels[i] = input.value; });
                    row.appendChild(input);

                    const removeBtn = document.createElement('button');
                    removeBtn.textContent = 'Remove';
                    removeBtn.style.cssText = smallBtnStyle;
                    removeBtn.disabled = labels.length <= 2; // keep at least one child level
                    if (removeBtn.disabled) { removeBtn.style.opacity = '0.5'; removeBtn.style.cursor = 'default'; }
                    removeBtn.addEventListener('click', () => {
                        if (labels.length > 2) {
                            // Removing a grouping row shrinks the grouping region.
                            if (i <= groupAboveCount) {
                                groupAboveCount = Math.max(0, groupAboveCount - 1);
                            }
                            labels.splice(i, 1);
                            renderLevels();
                        }
                    });
                    row.appendChild(removeBtn);

                    levelsContainer.appendChild(row);
                }
            };
            renderLevels();

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:0.5rem; margin-top:0.85rem;';

            const addBtn = document.createElement('button');
            addBtn.textContent = '+ Add level';
            addBtn.style.cssText = smallBtnStyle;
            addBtn.addEventListener('click', () => {
                labels.push(`Level ${labels.length}`);
                renderLevels();
            });

            const rightActions = document.createElement('div');
            rightActions.style.cssText = 'display:flex; gap:0.5rem;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = smallBtnStyle;
            const useBtn = document.createElement('button');
            useBtn.textContent = 'Import';
            useBtn.style.cssText = primaryBtnStyle;
            rightActions.appendChild(cancelBtn);
            rightActions.appendChild(useBtn);

            actions.appendChild(addBtn);
            actions.appendChild(rightActions);
            dialog.appendChild(actions);

            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            const cleanup = () => { document.body.removeChild(backdrop); };
            const onCancel = () => { cleanup(); resolve(null); };
            const onUse = () => {
                const cleaned = labels.map(l => l.trim());
                const rootLabel = cleaned[0]?.length ? cleaned[0] : 'Project';
                const childLevels = cleaned.slice(1).filter(l => l.length > 0);
                if (childLevels.length === 0) {
                    childLevels.push('Chapter');
                }
                // Grouping can only apply to leading levels and must leave at least
                // one non-grouping child level beneath it.
                const finalGroupAbove = Math.max(0, Math.min(groupAboveCount, childLevels.length - 1));
                const hierarchy = [rootLabel, ...childLevels];
                const layerLengths: (number | null)[] = hierarchy.map(() => null);
                layerLengths[layerLengths.length - 1] = proposed.template.layerLengths[proposed.template.layerLengths.length - 1] ?? null;
                cleanup();
                resolve({
                    template: new ProjectTemplate(rootLabel, hierarchy, layerLengths),
                    groupAboveCount: finalGroupAbove
                });
            };

            cancelBtn.addEventListener('click', onCancel);
            useBtn.addEventListener('click', onUse);
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) onCancel(); });
        });
    }

    // (legacy extractHierarchyLevels removed)
    
    try {
    getElementById('manageTemplatesBtn').addEventListener('click', openTemplateEditor);
    } catch (error) {
        console.error('❌ Failed to attach manage templates button listener:', error);
    }
    
    const openManualModal = async (): Promise<void> => {
        try {
            const { ManualModal } = await import('./ui/modals/index');
            await ManualModal.open();
        } catch (error) {
            console.error('Failed to open manual modal:', error);
            window.open('./public/manual.html', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
        }
    };

    try {
    getElementById('manualBtn').addEventListener('click', () => {
        void openManualModal();
    });
    } catch (error) {
        console.error('❌ Failed to attach manual button listener:', error);
    }
    
    // Global abort button handler - SIMPLIFIED VERSION
    const handleGlobalAbortClick = async (): Promise<void> => {
        const { UnifiedGenerationService } = await import('./project/UnifiedGenerationService');
        const { cancelAutoRetryWait } = await import('./ui/project-ui');

        const retryWaitCancelled = cancelAutoRetryWait();
        
        if (UnifiedGenerationService.hasActiveInstances()) {
            const summary = UnifiedGenerationService.getGenerationSummary();
            console.log(`🛑 Aborting ${summary.activeCount} active generation${summary.activeCount !== 1 ? 's' : ''} - graceful service-level abort`);
            
            try {
                UnifiedGenerationService.abortAllInstances();
                
                console.log('🛑 Graceful abort completed successfully');
                
                const abortBtn = getElementById<HTMLButtonElement>('globalAbortBtn');
                const originalText = abortBtn.textContent;
                abortBtn.textContent = 'Aborting...';
                abortBtn.disabled = true;
                
                void setTimeout(() => {
                    abortBtn.textContent = originalText;
                    abortBtn.disabled = false;
                }, 2000);
            } catch (error) {
                console.error('❌ Failed to abort generation:', error);
                alert('Failed to abort generation. Please try again.');
            }
        } else if (retryWaitCancelled) {
            console.log('🛑 Auto-retry countdown cancelled by user');
        } else {
            alert('No generation is currently in progress.');
        }
    };

    try {
    getElementById('globalAbortBtn').addEventListener('click', () => {
        void handleGlobalAbortClick();
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

    if (!modelSelector.getApiKey()) {
        // Genuine first run only (no API key yet): guide the user through the
        // focused onboarding wizard instead of dropping them into the dense
        // Settings modal. After finishing, we leave the user on the empty
        // workspace so they can decide what to do next (the visible "New Project"
        // button is right there) rather than forcing a modal on them.
        //
        // NOTE: We deliberately key this purely on the API key, NOT on whether
        // every model role is selected. A returning user (key already present)
        // whose profile predates a newer role - or who simply left one role
        // unset - must never be force-fed the wizard, because its "apply one
        // model to all roles" step would silently overwrite their per-role model
        // choices. Missing roles are surfaced loudly at generation time instead.
        openOnboardingWizard();
    } else if (!state.getActiveProject()) {
        const settingsManager = state.getSettingsManager();
        if (settingsManager) {
            void NewProjectModal.open(handleCreateProject, settingsManager);
        }
    }
    
} 