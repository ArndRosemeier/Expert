import { getElementById, newProjectModalContainer, testModalContainer, validateDOMElements } from './ui/dom-elements';
import { closeNewProjectModal, closeTestModal } from './ui/modal-manager';
import { openSettingsModal, createModalFactory, setDefaultModalFactory } from './ui/modals/ModalFactory';
import * as state from './state';
import { ProjectManager } from './ProjectManager';
import { DocumentNode } from './DocumentNode';
import { ProjectTemplate } from './ProjectTemplate';
import { initializeProjectUI } from './ui/project-ui';

import { SettingsManager } from './SettingsManager';
import { ModelSelector } from './ModelSelector';
import { OpenRouterClient } from './OpenRouterClient';
import { LoopOrchestrator } from './LoopOrchestrator';

import { openTemplateEditor } from './ui/template-editor';
import { TemplateManager } from './TemplateManager';
import { DEFAULT_MAX_ITERATIONS, DEFAULT_CONTEXT_EXTRACTION_PROMPT, STORAGE_KEYS } from './constants';
import { NewProjectModal } from './ui/modals/NewProjectModal';
import { AssertFlatTemplateCopy } from './ProjectUtils';


import * as pdfjsLib from 'pdfjs-dist';

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


function onModelsSelected(models: Record<string, string>, webSearchEnabled?: Record<string, boolean>) {
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
        maxIterations: DEFAULT_MAX_ITERATIONS, 
        selectedModels: {},
        webSearchEnabled: {},
        contextExtractionPrompt: DEFAULT_CONTEXT_EXTRACTION_PROMPT
    };
    activeProfile.selectedModels = models;
    if (webSearchEnabled) {
        activeProfile.webSearchEnabled = webSearchEnabled;
    }
    void settingsManager.saveProfile(activeProfileName, activeProfile);

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
    const client = OpenRouterClient.getInstance();
    
    // Connect the OpenRouterClient to the SettingsManager for AI logging
    if (settingsManager) {
        client.setSettingsManager(settingsManager);
    }
    
    const activeProject = state.getActiveProject();
    if (!activeProject) {
        throw new Error('No active project');
    }
    const projectSettings = activeProject.getSettingsManager();
    const orchestrator = new LoopOrchestrator(projectSettings, client, state.getOrchestratorPrompts() || undefined);
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
            console.log('📝 AI project created from description:', typedAiData.description);
            console.log('🎯 Project type:', typedAiData.projectType);
            console.log('⚙️ Generation options:', typedAiData.options);
        }
    }
    
    state.addProject(project);
    
    // Set the new project as active and select its root node
    state.setActiveProject(project.rootNode.id);
    
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
        
        // Import the data into the project's root node
        const rootNode = project.rootNode;
        
        // Import node data using version management system
        
        if (importData.title !== undefined) {
            rootNode.setTitle(importData.title, 'master');
            project.projectTitle = importData.title; // Keep project title in sync
        }

        if (importData.content !== undefined) {
            rootNode.setContent(importData.content, 'master');
        }

        if (importData.context !== undefined) {
            rootNode.setContext(importData.context, 'master');
        }

        if (importData.generationPrompt !== undefined) {
            rootNode.generationPrompt = importData.generationPrompt;
        }

        // Import children recursively if they exist
        if (importData.children && Array.isArray(importData.children)) {
            importData.children.forEach((childData: ImportNodeData, index: number) => {
                importChildNodeForProject(project, rootNode.id, childData, index);
            });
        }
        
        // Add to state and save
        state.addProject(project);
        
        // Set the imported project as active and select its root node
        state.setActiveProject(project.rootNode.id);
        
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

    // Create the child node with root template (shallow copy)
    const newNode = importChildNodeWithRootTemplateForProject(project, parentId, childData.title);

    // Set node properties using version management system
    
    if (childData.content !== undefined) {
        newNode.setContent(childData.content, 'master');
    }

    if (childData.context !== undefined) {
        newNode.setContext(childData.context, 'master');
    }

    if (childData.generationPrompt !== undefined) {
        newNode.generationPrompt = childData.generationPrompt;
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

    recreateAndReconfigureServices();
    
    // Set initial loaded profile name to match what's in SettingsManager
    const initialProfileName = settingsManager.getLastUsedProfileName();
    if (initialProfileName) {
        state.setCurrentlyLoadedProfileName(initialProfileName);
        console.log(`🔄 Initial profile consistency: "${initialProfileName}" set as loaded profile`);
    }

    await loadPersistedProjects();
    

    
    // Initialize the UI with projects (if any)
    void initializeProjectUI();

    // Attach event listeners
    try {
    getElementById('settingsBtn').addEventListener('click', () => {
        openSettingsModal();
    });
    } catch (error) {
        console.error('❌ Failed to attach settings button listener:', error);
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



        getElementById('importProjectBtn').addEventListener('click', () => {
            
            // Create file input element (now accepts JSON, text, and PDF files)
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json,.txt,.pdf';
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', async (e) => {
                const target = e.target as HTMLInputElement;
                const file = target.files?.[0];
                if (!file) return;
                
                try {
                    // Determine file type and handle accordingly
                    const fileName = file.name.toLowerCase();
                    const isJsonFile = fileName.endsWith('.json');
                    const isPdfFile = fileName.endsWith('.pdf');
                    
                    if (isJsonFile) {
                        // Handle JSON file (existing logic)
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
                        
                    } else if (isPdfFile) {
                        // Handle PDF file - extract text then analyze with AI
                        const progressModal = showProgressModal('Extracting text from PDF...');
                        
                        try {
                            const textContent = await extractTextFromPDF(file);
                            closeProgressModal(progressModal);
                            
                            if (!textContent.trim()) {
                                throw new Error('No text content found in PDF. The PDF may contain only images or be empty.');
                            }
                            
                            // Pass extracted text to text import handler
                            await handleTextImport(textContent, file.name);
                            
                        } catch (error) {
                            closeProgressModal(progressModal);
                            console.error('PDF import failed:', error);
                            alert('PDF import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
                        }
                        
                    } else {
                        // Handle text file - analyze with AI
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                            try {
                                const content = event.target?.result as string;
                                await handleTextImport(content, file.name);
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
                    console.error('Import failed:', error);
                    alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
                }
            });
            
            // Helper function to handle text import with AI analysis
            async function handleTextImport(textContent: string, fileName: string): Promise<void> {
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
    
    // Global abort button handler - SIMPLIFIED VERSION
    try {
    getElementById('globalAbortBtn').addEventListener('click', async () => {
        const activeProject = state.getActiveProject();
        if (activeProject && activeProject.getGenerationService().canAbortGeneration()) {
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
                    activeProject.getGenerationService().abortCurrentGeneration();
                    
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