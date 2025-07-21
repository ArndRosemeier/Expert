import { getElementById, newProjectModalContainer, testModalContainer, validateDOMElements } from './ui/dom-elements';
import { closeNewProjectModal, closeTestModal } from './ui/modal-manager';
import { openSettingsModal, createModalFactory, setDefaultModalFactory } from './ui/modals/ModalFactory';
import * as state from './state';
import { ProjectManager } from './ProjectManager';
import { DocumentNode, GenerationSession, ContentVersion } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { initializeProjectUI } from './ui/project-ui';
import { LoopHistoryItem } from './LoopOrchestrator';

import { SettingsManager } from './SettingsManager';
import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator } from './LoopOrchestrator';

import { openTemplateEditor } from './ui/template-editor';
import { TemplateManager } from './TemplateManager';
import { DEFAULT_MAX_ITERATIONS, DEFAULT_CONTEXT_EXTRACTION_PROMPT, STORAGE_KEYS } from './constants';
import { NewProjectModal } from './ui/modals/NewProjectModal';
import { AssertFlatTemplateCopy } from './ProjectUtils';
import { GenerationErrorService } from './ui/modals/services/GenerationErrorService';


import * as pdfjsLib from 'pdfjs-dist';

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
        
        console.log('🗒️ Idea Board opened');

        // Close button handler
        const closeBtn = header.querySelector('#close-idea-board');
        closeBtn?.addEventListener('click', () => {
            ideaBoard.destroy();
            modalContainer.remove();
            console.log('🗒️ Idea Board closed');
        });

        // Close on backdrop click
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                ideaBoard.destroy();
                modalContainer.remove();
                console.log('🗒️ Idea Board closed');
            }
        });

        // ESC key to close
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                ideaBoard.destroy();
                modalContainer.remove();
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
                max-width: 300px;
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
                <div style="font-size: 1rem; color: #333;">${message}</div>
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

/**
 * Close the progress modal
 */
function closeProgressModal(modalElement: HTMLElement): void {
    if (modalElement && modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
    }
}

/**
 * Extract text content from a PDF file
 */
async function extractTextFromPDF(file: File): Promise<string> {
    try {
        // Configure PDF.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        
        // Load the PDF
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        
        let fullText = '';
        
        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .filter((item: any): item is { str: string } => item && typeof item === 'object' && 'str' in item)
                .map((item: any) => item.str)
                .join(' ');
            fullText += pageText + '\n\n';
        }
        
        return fullText.trim();
    } catch (error) {
        console.error('PDF text extraction failed:', error);
        throw new Error('Failed to extract text from PDF. The file may be corrupted or contain only images.');
    }
}


function onModelsSelected(models: Record<string, string>, webSearchEnabled?: Record<string, boolean>, selectedProviders?: Record<string, string>) {
    const modelSelector = state.getModelSelector();
    const settingsManager = state.getSettingsManager();
    if (!modelSelector) {
        throw new Error('ModelSelector not available - services not properly initialized');
    }
    if (!settingsManager) {
        throw new Error('SettingsManager not available - services not properly initialized');
    }
    
    // The model selector now handles its own storage internally.
    // We just need to reconfigure services and save the updated models to the active settings profile.
    recreateAndReconfigureServices();
    
    const activeProfileName = settingsManager.getLastUsedProfileName() || 'default';
    const activeProfile = settingsManager.getProfile(activeProfileName) || { 
        criteria: [], 
        maxIterations: DEFAULT_MAX_ITERATIONS, 
        selectedModels: {},
        webSearchEnabled: {},
        selectedProviders: {},
        contextExtractionPrompt: DEFAULT_CONTEXT_EXTRACTION_PROMPT
    };
    activeProfile.selectedModels = models;
    if (webSearchEnabled) {
        activeProfile.webSearchEnabled = webSearchEnabled;
    }
    if (selectedProviders) {
        activeProfile.selectedProviders = selectedProviders;
    }
    void settingsManager.saveProfile(activeProfileName, activeProfile);

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
    options?: any;
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
    if (typedAiData && typedAiData.isAIGenerated) {
        console.log('🤖 Applying AI-generated content and context to root node');
        const rootNode = project.rootNode;
        
        // Use version management system for content/context updates

        
        if (typedAiData.content !== undefined) {
            rootNode.setContent(typedAiData.content, 'master');
            console.log('✅ Applied AI content to root node, length:', typedAiData.content.length);
        }
        
        if (typedAiData.context !== undefined) {
            rootNode.setContext(typedAiData.context, 'master');
            console.log('✅ Applied AI context to root node, length:', typedAiData.context.length);
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
    versions?: ContentVersion[];
    collapsed?: boolean;
    creatorModel?: string;
    // Legacy fields for backward compatibility
    template?: any; // Project template for text imports (different usage)
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
                title: importData.title || 'Imported Project',
                level: 0, // Root level
                parentId: null,
                template: template.hierarchyLevels, // Use the project template's hierarchy levels
                generationPrompt: importData.generationPrompt,
                generationHistory: importData.generationHistory ?? [],
                generationSessions: importData.generationSessions ?? [],
                versions: importData.versions, // This will be properly handled by DocumentNode.fromJSON
                collapsed: importData.collapsed ?? false,
                children: [] // Will be handled recursively
            };
            
            // Create new root node with full version data
            const restoredRootNode = DocumentNode.fromJSON(nodeDataForCreation);
            
            // Replace the project's root node
            project.rootNode = restoredRootNode;
            project.projectTitle = importData.title || 'Imported Project';
            
        } else {
            console.log(`🔄 Importing root node with legacy format (no version data)`);
            
            // Legacy import: Set properties individually
            if (importData.title !== undefined) {
                rootNode.setTitle(importData.title, 'imported');
                project.projectTitle = importData.title; // Keep project title in sync
            }

            if (importData.content !== undefined) {
                rootNode.setContent(importData.content, 'imported');
            }

            if (importData.context !== undefined) {
                rootNode.setContext(importData.context, 'imported');
            }

            if (importData.generationPrompt !== undefined) {
                rootNode.generationPrompt = importData.generationPrompt;
            }
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
            node.children.forEach(child => propagateRecursively(child));
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
        newNode.id = `imported_${Date.now()}_${childData.id || 'unknown'}`; // New ID to avoid conflicts
        
        // Clear the default master version and restore all versions from import
        (newNode as any).versions = []; // Clear default versions
        
        if (childData.versions && Array.isArray(childData.versions)) {
            // Restore all versions with proper tag handling
            childData.versions.forEach((versionData: any) => {
                const restoredVersion = {
                    id: versionData.id,
                    content: versionData.content,
                    title: versionData.title,
                    context: versionData.context,
                    tags: new Set(Array.isArray(versionData.tags) ? versionData.tags : []),
                    timestamp: new Date(versionData.timestamp),
                    ratings: versionData.ratings ? [...versionData.ratings] : undefined,
                    creatorModel: versionData.creatorModel,
                    metadata: versionData.metadata ? { ...versionData.metadata } : {}
                };
                (newNode as any).versions.push(restoredVersion);
            });
        }
        
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
        
    } else {
        console.log(`🔄 Importing project child with legacy format (no version data)`);
        
        // Legacy import: Create new node and set properties individually
        newNode = importChildNodeWithRootTemplateForProject(project, parentId, childData.title);

        // Set node properties using version management system
        if (childData.content !== undefined) {
            newNode.setContent(childData.content, 'imported');
        }

        if (childData.context !== undefined) {
            newNode.setContext(childData.context, 'imported');
        }

        if (childData.generationPrompt !== undefined) {
            newNode.generationPrompt = childData.generationPrompt;
        }
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
        
        projects.forEach(project => state.addProject(project));
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
    
    const modelSelector = new ModelSelector(onModelsSelected, () => {
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
        console.log(`🔄 Initial profile consistency: "${initialProfileName}" set as loaded profile`);
    }

    // Create minimal services for loading projects
    const client = OpenRouterClient.getInstance();
    if (settingsManager) {
        client.setSettingsManager(settingsManager);
    }
    state.setOpenRouterClient(client);
    
    // Create a minimal orchestrator just for loading projects
    const minimalOrchestrator = new LoopOrchestrator(settingsManager, client, state.getOrchestratorPrompts() || undefined);
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
            const lastEscape = (window as any)._lastEscapePress || 0;
            if (now - lastEscape < 1000) { // Within 1 second
                const escapeCount = ((window as any)._escapeCount || 0) + 1;
                (window as any)._escapeCount = escapeCount;
                
                if (escapeCount >= 3) {
                    console.log('🚨 Emergency escape activated - clearing all error modals');
                    const errorService = GenerationErrorService.getInstance();
                    errorService.clearAllErrorModals();
                    (window as any)._escapeCount = 0;
                    event.preventDefault();
                    event.stopPropagation();
                }
            } else {
                (window as any)._escapeCount = 1;
            }
            (window as any)._lastEscapePress = now;
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



        getElementById('importProjectBtn').addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Create or get existing dropdown
            let dropdown = document.getElementById('import-dropdown') as HTMLDivElement;
            
            if (dropdown) {
                // Toggle visibility
                const isVisible = dropdown.style.display === 'block';
                dropdown.style.display = isVisible ? 'none' : 'block';
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
                <button class="import-option" data-action="import-concept" style="
                    width: 100%;
                    padding: 12px 16px;
                    border: none;
                    background: white;
                    text-align: left;
                    cursor: pointer;
                    border-top: 1px solid var(--secondary-200);
                    font-size: 14px;
                    color: var(--text-primary);
                ">
                    🧠 Import Concept
                    <div style="font-size: 12px; color: var(--secondary-600); margin-top: 4px;">
                        AI analysis of text/PDF files for concepts
                    </div>
                </button>
                <button class="import-option" data-action="hierarchical-document" style="
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
                    📄 Import Hierarchical Document
                    <div style="font-size: 12px; color: var(--secondary-600); margin-top: 4px;">
                        Pattern-based hierarchy detection (MD, TXT, PDF)
                    </div>
                </button>
            `;
            
            // Add hover effects
            const options = dropdown.querySelectorAll('.import-option');
            options.forEach(option => {
                option.addEventListener('mouseenter', () => {
                    (option as HTMLElement).style.backgroundColor = 'var(--secondary-50)';
                });
                option.addEventListener('mouseleave', () => {
                    (option as HTMLElement).style.backgroundColor = 'white';
                });
            });
            
                         // Position dropdown relative to button
             const button = getElementById('importProjectBtn');
             const buttonRect = button.getBoundingClientRect();
             const headerContainer = button.closest('.header-buttons') as HTMLElement;
             
             if (headerContainer) {
                 headerContainer.style.position = 'relative';
                 headerContainer.appendChild(dropdown);
             } else {
                 document.body.appendChild(dropdown);
                 dropdown.style.position = 'fixed';
                 dropdown.style.top = `${buttonRect.bottom + 5}px`;
                 dropdown.style.right = `${window.innerWidth - buttonRect.right}px`;
             }
             
             // Handle dropdown clicks
             dropdown.addEventListener('click', async (e) => {
                 const target = e.target as HTMLElement;
                 const actionButton = target.closest('[data-action]') as HTMLElement;
                 
                 if (actionButton) {
                     const action = actionButton.dataset['action'];
                     dropdown.style.display = 'none';
                     
                     try {
                         switch (action) {
                             case 'expert-project':
                                 await handleExpertProjectImport();
                                 break;
                             case 'import-concept':
                                 await handleConceptImport();
                                 break;
                             case 'hierarchical-document':
                                 await handleHierarchicalDocumentImport();
                                 break;
                         }
                     } catch (error) {
                         console.error('Import failed:', error);
                         alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
                     }
                 }
             });
            
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
    async function handleExpertProjectImport(): Promise<void> {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const content = event.target?.result as string;
                    const importData = JSON.parse(content);
                    
                    // Extract template - first try from project level, then from root node, then from child nodes
                    let templateData = importData.template;
                    
                    if (!templateData || !templateData.name || !templateData.hierarchyLevels || !templateData.scaffoldingDocuments) {
                        // Check if root node has template as array (node export format)
                        if (importData.template && Array.isArray(importData.template)) {
                            templateData = {
                                name: `Imported Template (${importData.title || 'Unknown'})`,
                                hierarchyLevels: importData.template,
                                scaffoldingDocuments: []
                            };
                        } else if (importData.children && importData.children.length > 0) {
                            // Try to extract template from first child that has one
                            let foundTemplate = null;
                            for (const child of importData.children) {
                                if (child.template && Array.isArray(child.template)) {
                                    foundTemplate = child.template;
                                    break;
                                }
                            }
                            
                            if (foundTemplate) {
                                templateData = {
                                    name: `Imported Template (${importData.title || 'Unknown'})`,
                                    hierarchyLevels: foundTemplate,
                                    scaffoldingDocuments: []
                                };
                            } else {
                                throw new Error('Invalid import file: Missing or incomplete template information');
                            }
                        } else {
                            throw new Error('Invalid import file: Missing or incomplete template information');
                        }
                    }
                    
                    // Create template from extracted data
                    const bestTemplate = new ProjectTemplate(
                        templateData.name,
                        templateData.hierarchyLevels,
                        templateData.scaffoldingDocuments
                    );
                    
                    // Import project data
                    handleImportProject(importData.title || 'Imported Project', bestTemplate, importData);
                    
                } catch (error) {
                    console.error('JSON import failed:', error);
                    alert('JSON import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
                }
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

    async function handleConceptImport(): Promise<void> {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.pdf';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;
            
            try {
                const fileName = file.name.toLowerCase();
                const isPdfFile = fileName.endsWith('.pdf');
                
                if (isPdfFile) {
                    // Handle PDF file - extract text then analyze with AI
                    const progressModal = showProgressModal('Extracting text from PDF...');
                    
                    try {
                        const textContent = await extractTextFromPDF(file);
                        closeProgressModal(progressModal);
                        
                        if (!textContent.trim()) {
                            throw new Error('No text content found in PDF. The PDF may contain only images or be empty.');
                        }
                        
                        // Pass extracted text to text import handler
                        await handleTextImportWithAI(textContent, file.name);
                        
                    } catch (error) {
                        closeProgressModal(progressModal);
                        throw error;
                    }
                    
                } else {
                    // Handle text file - analyze with AI
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            const content = event.target?.result as string;
                            await handleTextImportWithAI(content, file.name);
                        } catch (error) {
                            console.error('Text import failed:', error);
                            alert('Text import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
                        }
                    };
                    
                    reader.onerror = () => {
                        alert('Failed to read text file. Please try again.');
                    };
                    
                    reader.readAsText(file);
                }
                
            } catch (error) {
                console.error('Concept import failed:', error);
                alert('Concept import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
            }
        });
        
        // Trigger file selection
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    async function handleHierarchicalDocumentImport(): Promise<void> {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.md,.txt,.pdf';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;
            
            try {
                const progressModal = showProgressModal('Analyzing document structure...');
                
                let textContent: string;
                const fileName = file.name.toLowerCase();
                const isPdfFile = fileName.endsWith('.pdf');
                
                try {
                    if (isPdfFile) {
                        // Extract text from PDF
                        textContent = await extractTextFromPDF(file);
                        if (!textContent.trim()) {
                            throw new Error('No text content found in PDF. The PDF may contain only images or be empty.');
                        }
                    } else {
                        // Read text file
                        textContent = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                resolve(event.target?.result as string);
                            };
                            reader.onerror = () => {
                                reject(new Error('Failed to read file'));
                            };
                            reader.readAsText(file);
                        });
                    }
                    
                    // Use DocumentImportService to parse the document
                    const { DocumentImportService } = await import('./DocumentImportService');
                    const importService = new DocumentImportService({
                        detection: { 
                            minimumConfidence: 0.1,
                            enableHeaderDetection: true,
                            enableNumberingDetection: true,
                            enableKeywordDetection: true,
                            enableIndentationDetection: true,
                            enableFormattingDetection: true,
                            maxContentLength: 10000
                        }
                    });
                    
                    const parsedDocument = importService.parseDocument(textContent, file.name);
                    
                    closeProgressModal(progressModal);
                    
                    // Show import preview with confidence warning if low
                    let confirmMessage = `📄 Hierarchical Document Import\n\n` +
                        `Document: "${file.name}"\n` +
                        `Format: ${parsedDocument.format.toUpperCase()}\n` +
                        `Detected: ${parsedDocument.hierarchy.length} top-level sections\n` +
                        `Confidence: ${(parsedDocument.totalConfidence * 100).toFixed(1)}%\n` +
                        `Words: ${parsedDocument.metadata.wordCount}\n`;
                    
                    if (parsedDocument.totalConfidence < 0.3) {
                        confirmMessage += `\n⚠️ Low confidence detection. The structure may not be accurate.\n`;
                    }
                    
                    confirmMessage += `\nCreate project from this structure?`;
                    
                    const confirmImport = confirm(confirmMessage);
                    
                    if (!confirmImport) {
                        return;
                    }
                    
                    // Convert hierarchy to project structure
                    const projectTitle = parsedDocument.metadata.title || file.name.replace(/\.[^/.]+$/, '');
                    const hierarchyLevels = extractHierarchyLevels(parsedDocument.hierarchy);
                    
                    // Create template from detected hierarchy
                    const template = new ProjectTemplate(
                        `Imported from ${file.name}`,
                        hierarchyLevels,
                        []
                    );
                    
                    // Create project with proper hierarchical structure
                    await createHierarchicalProject(projectTitle, template, parsedDocument.hierarchy, file.name, parsedDocument.totalConfidence);
                    
                } catch (error) {
                    // Always close progress modal on any error
                    closeProgressModal(progressModal);
                    throw error; // Re-throw to be caught by outer catch
                }
                
            } catch (error) {
                console.error('Hierarchical import failed:', error);
                alert('Hierarchical import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
            }
        });
        
        // Trigger file selection
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    // Function to create project with proper hierarchical structure from DocumentImportService
    async function createHierarchicalProject(projectTitle: string, template: ProjectTemplate, hierarchyNodes: any[], fileName: string, confidence: number): Promise<void> {
        const orchestrator = state.getOrchestrator();
        const settingsManager = state.getSettingsManager();
        const client = state.getOpenRouterClient();

        if (!orchestrator || !settingsManager || !client) {
            throw new Error('Core services not initialized. Cannot create hierarchical project.');
        }

        // Create the project
        const project = new ProjectManager(projectTitle, template, orchestrator, settingsManager, client);
        
        // Set the project language to match current language setting
        try {
            const currentLanguage = settingsManager.getLanguage();
            project.setLanguage(currentLanguage);
            console.log(`🌐 Imported project language set to: ${currentLanguage}`);
        } catch (error) {
            console.warn('Could not set imported project language:', error);
        }
        
        // Ensure all nodes share the same template reference
        AssertFlatTemplateCopy(project);

        // Set root node title and add metadata about the import
        const rootNode = project.rootNode;
        rootNode.setTitle(projectTitle, 'master');
        
        // Add import metadata to root node
        const rootMasterVersion = rootNode.getMasterVersion();
        if (rootMasterVersion) {
            rootMasterVersion.metadata = rootMasterVersion.metadata || {};
            rootMasterVersion.metadata['importSource'] = fileName;
            rootMasterVersion.metadata['detectionConfidence'] = confidence;
            rootMasterVersion.metadata['importType'] = 'hierarchical';
            rootMasterVersion.metadata['importTimestamp'] = new Date().toISOString();
        }

        // Recursively create nodes from hierarchy
        await createNodesFromHierarchy(project, rootNode.id, hierarchyNodes);

        // Add to state and save
        state.addProject(project);
        
        // Set the new project as active and select its root node
        state.setActiveProject(project.rootNode.id);
        
        // Recreate and configure services for the new project
        recreateAndReconfigureServices();
        
        // Save to storage
        await project.saveToStorage();
        
        // Initialize the project UI
        await initializeProjectUI(project);
        
        console.log(`✅ Hierarchical project "${projectTitle}" created successfully with ${hierarchyNodes.length} top-level sections`);
    }

    // Helper function to recursively create DocumentNode instances from hierarchy
    async function createNodesFromHierarchy(project: ProjectManager, parentId: string | null, hierarchyNodes: any[]): Promise<void> {
        for (const hierarchyNode of hierarchyNodes) {
            // Create the node using ProjectManager's addNode method
            const documentNode = project.addNode(hierarchyNode.title, parentId);
            
            // Set the content for this node
            if (hierarchyNode.content && hierarchyNode.content.trim()) {
                documentNode.setContent(hierarchyNode.content.trim(), 'master');
            }
            
            // Add detection metadata
            const masterVersion = documentNode.getMasterVersion();
            if (masterVersion) {
                masterVersion.metadata = masterVersion.metadata || {};
                masterVersion.metadata['detectionMethod'] = hierarchyNode.detectionMethod;
                masterVersion.metadata['detectionConfidence'] = hierarchyNode.confidence;
                masterVersion.metadata['hierarchyLevel'] = hierarchyNode.level;
                masterVersion.metadata['startPosition'] = hierarchyNode.startPosition;
                masterVersion.metadata['endPosition'] = hierarchyNode.endPosition;
            }
            
            // Recursively create children
            if (hierarchyNode.children && hierarchyNode.children.length > 0) {
                await createNodesFromHierarchy(project, documentNode.id, hierarchyNode.children);
            }
        }
    }

    // Helper function to handle text import with AI analysis (extracted from original function)
    async function handleTextImportWithAI(textContent: string, fileName: string): Promise<void> {
        const settingsManager = state.getSettingsManager();
        const openRouterClient = state.getOpenRouterClient();
        
        if (!settingsManager || !openRouterClient) {
            throw new Error('Core services not initialized. Cannot analyze text file.');
        }
        
        // Show progress indicator
        const progressModal = showProgressModal('Analyzing text content...');
        
        try {
            // Create analysis prompt using PromptManager
            const prompts = settingsManager.getPrompts();
            const analysisPrompt = prompts.text_import_analysis
                .replace(/\{\{file_name\}\}/g, fileName)
                .replace(/\{\{text_content\}\}/g, textContent)
                .replace(/\{\{language\}\}/g, settingsManager.getLanguage());
            
            // Use creator model for analysis
            const response = await openRouterClient.chat('creator', analysisPrompt);
            
            // Parse the AI response using the same parser as AI project generation
            const { SmartContentParser } = await import('./project/SmartContentParser');
            const parsedContent = SmartContentParser.parseGenerationResponse(response, 'project');
            
            if (!parsedContent.hasStructuredData || !parsedContent.template) {
                throw new Error('Failed to extract project structure from text. The AI could not identify clear project elements.');
            }
            
            // Create template from parsed data
            const template = new ProjectTemplate(
                parsedContent.template.name,
                parsedContent.template.hierarchyLevels,
                parsedContent.template.scaffoldingDocuments
            );
            
            // Create import data in the same format as JSON import
            const importData = {
                title: parsedContent.metadata['title'] || fileName.replace(/\.[^/.]+$/, ''), // Remove file extension
                content: parsedContent.content,
                context: parsedContent.context,
                template: parsedContent.template,
                isTextImport: true,
                originalFileName: fileName
            };
            
            // Hide progress modal
            closeProgressModal(progressModal);
            
            // Import the analyzed project
            handleImportProject(importData.title, template, importData);
            
        } catch (error) {
            closeProgressModal(progressModal);
            throw error;
        }
    }

    // Helper function to extract hierarchy levels for template creation
    function extractHierarchyLevels(hierarchyNodes: any[]): string[] {
        const levels = new Set<number>();
        
        function collectLevels(nodes: any[]): void {
            for (const node of nodes) {
                levels.add(node.level);
                if (node.children && node.children.length > 0) {
                    collectLevels(node.children);
                }
            }
        }
        
        collectLevels(hierarchyNodes);
        
        const sortedLevels = Array.from(levels).sort((a, b) => a - b);
        const levelNames: string[] = [];
        
        for (let i = 0; i < sortedLevels.length; i++) {
            switch (i) {
                case 0: levelNames.push('Book'); break;
                case 1: levelNames.push('Chapter'); break;
                case 2: levelNames.push('Section'); break;
                case 3: levelNames.push('Subsection'); break;
                default: levelNames.push(`Level ${i + 1}`); break;
            }
        }
        
        return levelNames.length > 0 ? levelNames : ['Document', 'Section'];
    }
    
    try {
    getElementById('manageTemplatesBtn').addEventListener('click', openTemplateEditor);
    } catch (error) {
        console.error('❌ Failed to attach manage templates button listener:', error);
    }
    
    try {
    getElementById('manualBtn').addEventListener('click', async () => {
        try {
            const { ManualModal } = await import('./ui/modals/index');
            await ManualModal.open();
        } catch (error) {
            console.error('Failed to open manual modal:', error);
            // Fallback to opening in new window
            window.open('./public/manual.html', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
        }
    });
    } catch (error) {
        console.error('❌ Failed to attach manual button listener:', error);
    }
    
    // Global abort button handler - SIMPLIFIED VERSION
    try {
    getElementById('globalAbortBtn').addEventListener('click', async () => {
        const activeProject = state.getActiveProject();
        if (activeProject && activeProject.getGenerationController().canAbortGeneration(activeProject.rootNode)) {
            const confirmed = confirm('Are you sure you want to abort the current generation? Any partial progress will be saved.');
            if (confirmed) {
                console.log('🛑 User confirmed abort - using simplified abort');
                try {
                    // HYBRID APPROACH: Immediate abort at both levels
                    // 1. Stop all HTTP requests immediately (single bottleneck)
                    const { OpenRouterClient } = await import('./OpenRouterClient');
                    const openRouterClient = OpenRouterClient.getInstance();
                    openRouterClient.abortAllOperations();
                    
                    // 2. Set stopRequested flag for immediate loop exit
                    activeProject.getGenerationController().abortCurrentGeneration(activeProject.rootNode);
                    
                    console.log('🛑 Simplified abort completed successfully');
                    
                    // Provide immediate feedback
                    const abortBtn = getElementById('globalAbortBtn') as HTMLButtonElement;
                    if (abortBtn) {
                        const originalText = abortBtn.textContent;
                        abortBtn.textContent = 'Aborting...';
                        abortBtn.disabled = true;
                        
                        // Reset button after 2 seconds (faster since it's simpler)
                        void setTimeout(() => {
                            abortBtn.textContent = originalText;
                            abortBtn.disabled = false;
                        }, 2000);
                    }
                } catch (error) {
                    console.error('❌ Failed to abort generation:', error);
                    alert('Failed to abort generation. Please try again.');
                }
            }
        } else {
            alert('No generation is currently in progress.');
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
        const settingsManager = state.getSettingsManager();
        if (settingsManager) {
            void NewProjectModal.open(handleCreateProject, settingsManager);
        }
    }
    
} 