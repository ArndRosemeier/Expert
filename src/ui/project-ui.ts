import { ProjectManager } from '../ProjectManager';
import { DocumentNode } from '../DocumentNode';
import { getElementById } from './dom-elements';
import * as state from '../state';
import { LoopProgress } from '../LoopOrchestrator';
import { openReaderView } from './reader-gui';
import { openAddChildNodeModal, getDefaultModalFactory } from './modals/ModalFactory';
import { CoherenceService } from './modals/services/CoherenceService';
import { CoherenceModal } from './modals/CoherenceModal';

import { AssertFlatTemplateCopy } from '../ProjectUtils';

// --- State Variables ---
let projectManager: ProjectManager | null = null;
let selectedNodeId: string | null = null;

// Persistent checkbox states
let includeContentState: boolean = true;
let recursiveState: boolean = false;
let checkCoherenceState: boolean = true;


// Version navigation state
let currentVersionIndex: number = 0;
let availableVersions: any[] = [];

// Button labels - centralized for consistency
const BUTTON_LABELS = {
    GENERATE: 'Generate',
    GENERATE_RATINGS: 'Generate Ratings for Current Content'
} as const;

// Global abort button is now always visible - no show/hide functions needed

async function saveCheckboxStates() {
    try {
        const { StorageService } = await import('../StorageService');
        const storage = await StorageService.getInstance();
        await storage.set('expert_app_checkbox_states', {
            includeContent: includeContentState,
            recursive: recursiveState,
            checkCoherence: checkCoherenceState
        });
    } catch (error) {
        console.warn('Failed to save checkbox states:', error);
    }
}

async function loadCheckboxStates() {
    try {
        const { StorageService } = await import('../StorageService');
        const storage = await StorageService.getInstance();
        const saved = await storage.get<{includeContent: boolean, recursive: boolean, checkCoherence: boolean}>('expert_app_checkbox_states');
        if (saved) {
            includeContentState = saved.includeContent;
            recursiveState = saved.recursive;
            checkCoherenceState = saved.checkCoherence ?? true; // Default to true if not saved
        }
    } catch (error) {
        console.warn('Failed to load checkbox states:', error);
    }
}

/**
 * Gets the template-specific name for the current node's level.
 * e.g., if node is at level 0 and template is ["Book", "Act", "Chapter"], returns "Book"
 * e.g., if node is at level 1 and template is ["Book", "Act", "Chapter"], returns "Act"
 */
function getCurrentLevelName(node: DocumentNode): string {
    if (node.level < 0 || node.level >= node.template.length) {
        return node.level === 0 ? 'Project' : 'Node'; // Special fallback for root level
    }
    
    const rawLevelName = node.template[node.level];
    if (!rawLevelName || typeof rawLevelName !== 'string') {
        return node.level === 0 ? 'Project' : 'Node'; // Special fallback for root level
    }
    
    // Extract just the base name (remove numbers)
    // Pattern: "Book 1" -> "Book", "Act 1" -> "Act", "Chapter 10" -> "Chapter"
    const match = rawLevelName.match(/^(\w+)(?:\s+\d+)?$/);
    return match && match[1] ? match[1] : rawLevelName;
}

/**
 * Gets the plural form of the child level name.
 * e.g., if node's children are "Chapter", returns "Chapters"
 */
function getPluralChildLevelName(node: DocumentNode): string {
    const childLevelName = node.childLevelName;
    if (!childLevelName) {
        return 'Subnodes'; // Fallback
    }
    
    // Simple pluralization: just append 's'
    return childLevelName + 's';
}

/**
 * Shows the actions modal with all available node actions organized in sections
 */
// Import the reusable Dropdown class
import { Dropdown } from './Dropdown';
import { ProjectTemplate } from '../ProjectTemplate';

// Store the dropdown instance for the actions button
let actionsDropdownInstance: Dropdown | null = null;

function showActionsDropdown(node: DocumentNode): void {
    // Close any existing dropdown first
    if (actionsDropdownInstance) {
        actionsDropdownInstance.close();
        actionsDropdownInstance = null;
    }

    // Find the Actions button
    const actionsButton = document.getElementById('actions-dropdown-btn');
    if (!actionsButton) {
        console.error('Actions button not found');
        return;
    }

    // Create the dropdown content
    const dropdownContent = createActionsDropdownContent(node);

    // Add actions-specific styles
    ensureActionsDropdownStyles();

    // Create the dropdown instance
    actionsDropdownInstance = new Dropdown(actionsButton, dropdownContent, {
        minWidth: '280px',
        maxWidth: '320px',
        className: 'actions-dropdown',
        closeOnInsideClick: false, // We'll handle this ourselves to allow action execution
        position: 'bottom-left'
    });

    // Open the dropdown
    actionsDropdownInstance.open();

    // Add custom click handler for actions
    setTimeout(() => {
        const dropdownElement = document.querySelector('.dropdown-menu.actions-dropdown');
        if (dropdownElement) {
            dropdownElement.addEventListener('click', (e) => {
                const button = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
                if (button) {
                    const action = button.getAttribute('data-action');
                    if (action) {
                        // Map actions to the existing handler IDs
                        const actionMap: Record<string, string> = {
                            'new-top-layer': 'new-top-layer-btn',
                            'view-template': 'view-template-btn',
                            'add-child': 'add-child-node-btn',
                            'delete-node': 'delete-node-btn',
                            'delete-all-children': 'delete-subnodes-btn',
                            'export': 'export-node-btn',
                            'import': 'import-node-btn',
                            'chat': 'chat-node-btn',
                            'polish-text': 'polish-text-btn',
                            'copy-to-new-project': 'copy-to-new-project-btn',
                            'check-coherence': 'check-coherence-btn'
                        };
                        
                        const handlerAction = actionMap[action];
                        if (handlerAction) {
                            // Close dropdown first
                            if (actionsDropdownInstance) {
                                actionsDropdownInstance.close();
                                actionsDropdownInstance = null;
                            }
                            // Execute action
                            handleDropdownAction(handlerAction);
                        }
                    }
                }
            });
        }
    }, 50);
}

async function handleNewTopLayer(oldRootNode: DocumentNode): Promise<void> {
    // Prompt user for the new layer name
    const layerName = prompt('Enter the name for the new top layer (e.g., "Series 3" for a series with 3 children target, or just "Series"):');
    
    if (!layerName || !layerName.trim()) {
        return; // User cancelled or entered empty name
    }

    const trimmedName = layerName.trim();
    
    // Parse the layer name to extract target count
    let newLevelName: string = trimmedName;
    
    // Check if the name ends with a number (e.g., "Series 3")
    const match = trimmedName.match(/^(.+?)\s+(\d+)$/);
    if (match && match[1] && match[2]) {
        newLevelName = match[1]!; // Non-null assertion since we checked above
        // Target count parsing available but not currently used
    }

    try {
        // Get the current template
        const currentTemplate = projectManager!.template;
        
        // Create extended template hierarchy levels
        const newHierarchyLevels = [newLevelName, ...currentTemplate.hierarchyLevels];
        
        // Create new template
        const newTemplate = new ProjectTemplate(
            'custom',
            newHierarchyLevels,
            currentTemplate.scaffoldingDocuments
        );

        // Create new root node with the extended template
        const oldTitle: string = (oldRootNode.title !== undefined && oldRootNode.title !== null) ? oldRootNode.title : 'Root';
        const newRoot = new DocumentNode(
            0,
            oldTitle,
            null,
            newHierarchyLevels
        );

        // Update old root's level and parent
        oldRootNode.level = 1;
        oldRootNode.parentId = newRoot.id;

        // Add old root as child of new root
        newRoot.children.push(oldRootNode);

        // Update the project with the new structure
        projectManager!.template = newTemplate;
        projectManager!.rootNode = newRoot;
        projectManager!.projectTitle = newLevelName;

        // Ensure all nodes share the same template reference  
        AssertFlatTemplateCopy(projectManager!);

        // Update selected node to the new root
        selectedNodeId = newRoot.id;

        // Save changes to storage
        await projectManager!.saveToStorage();

        // Refresh the project UI
        renderProjectUI(projectManager!);

        alert(`Successfully created new top layer "${newLevelName}" with the old structure as its child.`);

    } catch (error) {
        console.error('Error creating new top layer:', error);
        alert('Failed to create new top layer. Please try again.');
    }
}

async function handleCopyToNewProject(sourceNode: DocumentNode): Promise<void> {
    try {
        // Get the current template and slice it to start from the source node's level
        const currentTemplate = projectManager!.template;
        const adjustedHierarchyLevels = currentTemplate.hierarchyLevels.slice(sourceNode.level);
        
        if (adjustedHierarchyLevels.length === 0) {
            alert('Cannot create project: No template levels available for this node.');
            return;
        }

        // Create new template for the extracted project
        const newTemplate = new ProjectTemplate(
            `${sourceNode.title} Project`,
            adjustedHierarchyLevels,
            currentTemplate.scaffoldingDocuments
        );

        // Deep copy the source node and all its children, adjusting levels
        const newRootNode = deepCopyNodeWithLevelAdjustment(sourceNode, -sourceNode.level, adjustedHierarchyLevels);

        // Create unique project title
        const baseTitle = sourceNode.level === 0 ? `${sourceNode.title} (Copy)` : sourceNode.title;
        const uniqueTitle = generateUniqueProjectTitle(baseTitle);
        
        const newProjectManager = new ProjectManager(
            uniqueTitle,
            newTemplate,
            state.getOrchestrator()!,
            projectManager!.getSettingsManager(),
            state.getOpenRouterClient()!
        );

        // Ensure all nodes share the same template reference
        AssertFlatTemplateCopy(newProjectManager);

        // Replace the auto-generated root with our copied structure
        newProjectManager.rootNode = newRootNode;
        
        // Update the root node title to match the unique project title
        newRootNode.title = uniqueTitle;

        // Add to the projects list first
        state.addProject(newProjectManager);

        // Set as the active project
        state.setActiveProject(newProjectManager.rootNode.id);

        // Then save the new project to storage
        await newProjectManager.saveToStorage();

        // Refresh the project tree to show the new project
        renderMultiProjectTree();

        console.log(`New project "${uniqueTitle}" created with ID: ${newProjectManager.rootNode.id}`);
        
        const message = sourceNode.level === 0 
            ? `Successfully created copy of project "${uniqueTitle}".`
            : `Successfully created new project "${uniqueTitle}" from the selected node.`;
        alert(message);

    } catch (error) {
        console.error('Error creating new project:', error);
        alert('Failed to create new project. Please try again.');
    }
}

function deepCopyNodeWithLevelAdjustment(sourceNode: DocumentNode, levelAdjustment: number, adjustedTemplate: string[]): DocumentNode {
    // Create new node with adjusted level
    const newLevel = sourceNode.level + levelAdjustment;
    const newNode = new DocumentNode(
        newLevel,
        sourceNode.title,
        sourceNode.parentId,
        adjustedTemplate
    );

    // Copy all properties
    newNode.content = sourceNode.content;
    newNode.context = sourceNode.context;
    newNode.generationPrompt = sourceNode.generationPrompt;
    newNode.isPromptGenerating = sourceNode.isPromptGenerating;
    newNode.collapsed = sourceNode.collapsed;
    newNode.creatorModel = sourceNode.creatorModel;
    newNode.generationHistory = [...sourceNode.generationHistory];
    newNode.isGenerating = sourceNode.isGenerating;
    newNode.generationSessions = sourceNode.generationSessions.map(session => ({...session}));

    // Recursively copy children with level adjustment
    newNode.children = sourceNode.children.map(child => 
        deepCopyNodeWithLevelAdjustment(child, levelAdjustment, adjustedTemplate)
    );

    // Update parent IDs for children
    newNode.children.forEach(child => {
        child.parentId = newNode.id;
    });

    return newNode;
}

function generateUniqueProjectTitle(baseTitle: string): string {
    const existingProjects = state.getProjects();
    const existingTitles = new Set(existingProjects.map(p => p.projectTitle));
    
    // If the base title doesn't exist, use it
    if (!existingTitles.has(baseTitle)) {
        return baseTitle;
    }
    
    // Try appending numbers until we find a unique title
    let counter = 2;
    let candidateTitle = `${baseTitle} ${counter}`;
    
    while (existingTitles.has(candidateTitle)) {
        counter++;
        candidateTitle = `${baseTitle} ${counter}`;
    }
    
    return candidateTitle;
}

function createActionsDropdownContent(node: DocumentNode): string {
    return `
        <div class="actions-dropdown-content">
            <!-- Structure Section -->
            <div class="action-section">
                <div class="section-title">Structure</div>
                <div class="action-buttons">
                    ${node.level === 0 ? `
                        <button class="action-btn" data-action="new-top-layer">
                            🆕 New Top Layer
                        </button>
                        <button class="action-btn" data-action="view-template">
                            📋 View Template
                        </button>
                    ` : ''}
                    ${!node.isLeaf ? `
                        <button class="action-btn" data-action="add-child">
                            ➕ Add ${node.childLevelName || 'Child'}
                        </button>
                    ` : ''}
                    <button class="action-btn action-btn-danger" data-action="delete-node">
                        🗑️ Delete ${getCurrentLevelName(node)}
                    </button>
                    ${node.children.length > 0 ? `
                        <button class="action-btn action-btn-warning" data-action="delete-all-children">
                            🗑️ Delete All ${getPluralChildLevelName(node)}
                        </button>
                    ` : ''}
                </div>
            </div>

            <!-- Data Section -->
            <div class="action-section">
                <div class="section-title">Data</div>
                <div class="action-buttons">
                    <button class="action-btn" data-action="export">
                        📤 Export
                    </button>
                    <button class="action-btn" data-action="import">
                        📥 Import
                    </button>
                    <button class="action-btn" data-action="chat">
                        💬 Chat
                    </button>
                    <button class="action-btn" data-action="polish-text">
                        🎨 Polish Text
                    </button>
                    <button class="action-btn" data-action="copy-to-new-project">
                        📋 Copy to New Project
                    </button>
                    ${node.children && node.children.length > 0 ? `
                        <button class="action-btn" data-action="check-coherence">
                            🔍 Check Coherence
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

function ensureActionsDropdownStyles(): void {
    if (document.querySelector('#actions-dropdown-styles')) return;

    const style = document.createElement('style');
    style.id = 'actions-dropdown-styles';
    style.textContent = `
        .dropdown-menu.actions-dropdown {
            padding: 0.75rem;
        }
        
        .actions-dropdown-content {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        
        .actions-dropdown .action-section {
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 0.75rem;
            background: #f9fafb;
        }
        
        .actions-dropdown .section-title {
            font-size: 0.7rem;
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 0.5rem;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 0.25rem;
        }
        
        .actions-dropdown .action-buttons {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }
        
        .actions-dropdown .action-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 0.75rem;
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.8rem;
            color: #374151;
            transition: all 0.15s;
            text-align: left;
            width: 100%;
        }
        
        .actions-dropdown .action-btn:hover:not(:disabled) {
            background: #f3f4f6;
            border-color: #9ca3af;
            transform: translateY(-1px);
        }
        
        .actions-dropdown .action-btn:disabled {
            color: #9ca3af;
            cursor: not-allowed;
            opacity: 0.6;
        }
        
        .actions-dropdown .action-btn-danger:hover:not(:disabled) {
            background: #fef2f2;
            border-color: #f87171;
            color: #dc2626;
        }
        
        .actions-dropdown .action-btn-warning:hover:not(:disabled) {
            background: #fffbeb;
            border-color: #fbbf24;
            color: #d97706;
        }
    `;
    
    document.head.appendChild(style);
}



// --- Main Render Function ---

export function renderProjectUI(proj: ProjectManager) {
    projectManager = proj;
    
    // Update modal factory dependencies to include the active project manager
    try {
        const modalFactory = getDefaultModalFactory();
        modalFactory.updateDependencies({ projectManager: proj });
    } catch (error) {
        console.warn('Modal factory not initialized yet:', error);
    }
    
    // One-time setup for event listeners from the manager
    setupProjectManagerListeners(proj);

    if (!selectedNodeId || !projectManager.findNodeById(selectedNodeId)) {
        selectedNodeId = projectManager.rootNode.id;
    }
    
    const projectTree = getElementById('project-tree');
    const nodeDetails = getElementById('node-details');
    projectTree.innerHTML = ''; // Clear previous content
    nodeDetails.innerHTML = ''; // Clear previous content

    refreshGlobalProfileSelector(); // Keep the profile selector up-to-date
    renderMultiProjectTree();
    renderNodeDetails();
    
    // Re-attach event listeners after DOM replacement in renderProjectUI
    console.log('🔧 Re-setting up event listeners after renderProjectUI DOM replacement');
    setupEventListeners();
}

// --- Event Listener Setup ---

function setupProjectManagerListeners(manager: ProjectManager) {
    const handleGenerationStarted = (e: { nodeId: string, node: DocumentNode }) => {
        // Just refresh the tree to show spinner for the generating node
        renderMultiProjectTree();
        // Note: Global abort button is managed by GenerationCoordinator
        
        // Only refresh node details if we're looking at the node being generated
        // This prevents unnecessary UI re-rendering that can cause button disappearance
        if (selectedNodeId === e['nodeId']) {
            console.log('🔄 Refreshing node details for generating node:', e['nodeId']);
            renderNodeDetails();
        } else {
            console.log('⏭️ Skipping node details refresh - different node selected');
        }
    };

    const handleCompletion = (_e: { nodeId: string; success: boolean; error?: any, node: DocumentNode }) => {
        // Check if any operations are still in progress
        const operationsInProgress = manager.isAnyNodeGenerating();
        
        if (!operationsInProgress) {
            // Most UI cleanup is now handled by the coordinator
            // Just do the final project UI refresh
            renderProjectUI(manager);
            
            // Force clear progress UI as additional safety measure
            updateProgressUI();
            hideGenerationOverlay();
            
            // Check if coherence check was requested for this generation
            // Use the node that actually completed generation, not the currently selected node
            if (_e.node && ((_e.node as any)._pendingCoherenceCheck)) {
                const completedNode = _e.node;
                console.log(`🔍 Auto-starting coherence analysis for node "${completedNode.title}" (ID: ${completedNode.id})`);
                // Clear the pending flag
                delete (completedNode as any)._pendingCoherenceCheck;
                
                // Open coherence check modal after a short delay
                setTimeout(() => {
                    import('./modals/CoherenceModal').then(({ CoherenceModal }) => {
                        import('./modals/services/CoherenceService').then(({ CoherenceService }) => {
                            // Create coherence service instance
                            const coherenceService = new CoherenceService(
                                state.getOpenRouterClient()!,
                                state.getSettingsManager()!
                            );

                            // Check if node is eligible for coherence analysis
                            if (!coherenceService.isNodeEligible(completedNode)) {
                                console.log('Node not eligible for coherence analysis:', coherenceService.getIneligibilityReason(completedNode));
                                return;
                            }

                            // Create and show modal in loading state
                            const analysisModal = new CoherenceModal();
                            analysisModal.openInLoadingState(completedNode);
                            
                            // Perform analysis
                            coherenceService.analyzeCoherence(completedNode)
                                .then((result) => {
                                    console.log('Coherence analysis completed, updating modal with results:', result);
                                    // Update modal with results
                                    analysisModal.updateWithResults(result);
                                })
                                .catch((error) => {
                                    console.error('Coherence analysis failed:', error);
                                    // Close loading modal and show error
                                    analysisModal.close();
                                    alert('Coherence analysis failed: ' + error.message);
                                });
                        }).catch((error: any) => {
                            console.error('Failed to load CoherenceService:', error);
                        });
                    }).catch((error: any) => {
                        console.error('Failed to open coherence modal:', error);
                    });
                }, 1000);
            }
        } else {
            // Just refresh the tree to show updated node states - DON'T re-render details during operations
            renderMultiProjectTree();
            // Update content and summary fields without destroying the entire details view
            if (selectedNodeId) {
                const node = manager.findNodeById(selectedNodeId);
                if (node) {
                    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
                    const contextTextArea = document.getElementById('node-context') as HTMLTextAreaElement;
                    if (contentTextArea) contentTextArea.value = node.content;
                    if (contextTextArea) contextTextArea.value = node.context;
                }
            }
        }
        
        // Additional safety: Force clear progress after a delay if no operations are running
        setTimeout(() => {
            if (!manager.isAnyNodeGenerating()) {
                updateProgressUI();
                hideGenerationOverlay();
                // Note: Global abort button is managed by GenerationCoordinator
            }
        }, 200);
    };

    const handleAborted = (_e: { nodeId: string, node: DocumentNode }) => {
        // Handle aborted generation - similar to completion but with different messaging
        const operationsInProgress = manager.isAnyNodeGenerating();
        
        if (!operationsInProgress) {
            // UI cleanup is now handled by the coordinator
            renderProjectUI(manager);
        } else {
            renderMultiProjectTree();
        }
    };

    const handleError = (message: string) => {
        // UI cleanup is now handled by the coordinator for generation errors
        // This handler mainly deals with non-generation errors
        alert(`An error occurred: ${message}`);
        renderProjectUI(manager);
    };
    
    const handleHighLevelProgress = (e: { nodeId: string; message: string; current: number; total: number }) => {
        // If message is empty, it means we should clear the progress
        if (!e.message || e.message.trim() === '') {
            updateProgressUI();
            hideGenerationOverlay();
            
            // Additional safety: check if any nodes are still generating
            // If not, force clear everything after a short delay
            setTimeout(() => {
                if (!manager.isAnyNodeGenerating()) {
                    updateProgressUI();
                    hideGenerationOverlay();
                    // Note: Global abort button is managed by GenerationCoordinator
                }
            }, 100);
        } else {
        // Always show progress bars during any generation, regardless of selected node
        // This ensures consistency with the spinner behavior
        updateProgressUI({
            operations: { message: e.message, current: e.current, total: e.total }
        });
        }
    };

    const handleLoopProgress = (e: { nodeId: string; progress: LoopProgress }) => {
        // Always show progress bars during any generation, regardless of selected node
        // This ensures consistency with the spinner behavior
        const { progress } = e;
        
        // Map LoopProgress to the three progress bars
        const iterationProgress: ProgressInfo = {
            message: `Iteration: ${progress.iteration} / ${progress.maxIterations}`,
            current: progress.iteration,
            total: progress.maxIterations
        };

        const stageProgress: ProgressInfo = {
            message: `Stage: ${progress.type.charAt(0).toUpperCase() + progress.type.slice(1)} (${progress.step} / ${progress.totalStepsInIteration})`,
            current: progress.step,
            total: progress.totalStepsInIteration
        };

        let detailText = '';
        const modelName = progress.modelName || 'AI';
        const contentType = progress.contentType || 'content';
        
        switch (progress.type) {
            case 'creator':
                if (progress.isCompletion) {
                    detailText = progress.allCriteriaSatisfied 
                        ? `Done! All criteria satisfied.`
                        : `Done! Not all criteria satisfied, best version selected.`;
                } else if (progress.isFirstCreation) {
                    detailText = `${modelName} is creating ${contentType}...`;
                } else if (progress.isRevision) {
                    detailText = `${modelName} is revising ${contentType} based on recommendations...`;
                } else {
                    detailText = `${modelName} is generating content...`;
                }
                break;
            case 'rater':
                detailText = `${modelName} is rating the ${contentType}...`;
                break;
            case 'editor':
                detailText = `${contentType} rejected! ${modelName} is generating recommendations...`;
                break;
        }

        updateProgressUI({
            iterations: iterationProgress,
            stages: stageProgress,
            detail: detailText,
        });
    };

    const handleSummaryGenerated = (e: { nodeId: string; summary: string }) => {
        if (e.nodeId === selectedNodeId) {
            const contextTextArea = getElementById('node-context') as HTMLTextAreaElement;
            if (contextTextArea) {
                contextTextArea.value = e.summary;
            }
        }
    };

    const handleProjectLoaded = () => {
        // Refresh the entire project UI when project structure changes (e.g., after bulk child generation)
        renderProjectUI(manager);
    };

    // We need to store the listeners so we can remove them correctly.
    // A more robust solution might use a map on the project instance itself.
    // @ts-ignore - attaching to the object for simplicity to ensure removal
    if (manager._completionListener) {
        // @ts-ignore
        manager.off('nodeGenerationStarted', manager._generationStartedListener);
        // @ts-ignore
        manager.off('nodeGenerationComplete', manager._completionListener);
        // @ts-ignore
        manager.off('error', manager._errorListener);
        // @ts-ignore
        manager.off('high-level-progress', manager._highLevelProgressListener);
        // @ts-ignore
        manager.off('loop-progress', manager._loopProgressListener);
        // @ts-ignore
        manager.off('nodeSummaryGenerated', manager._summaryGeneratedListener);
        // @ts-ignore
        manager.off('project-loaded', manager._projectLoadedListener);
    }

    // @ts-ignore
    manager._generationStartedListener = handleGenerationStarted;
    // @ts-ignore
    manager._completionListener = handleCompletion;
    // @ts-ignore
    manager._errorListener = handleError;
    // @ts-ignore
    manager._highLevelProgressListener = handleHighLevelProgress;
    // @ts-ignore
    manager._loopProgressListener = handleLoopProgress;
    // @ts-ignore
    manager._summaryGeneratedListener = handleSummaryGenerated;
    // @ts-ignore
    manager._projectLoadedListener = handleProjectLoaded;
    
    manager.on('nodeGenerationStarted', handleGenerationStarted);
    manager.on('nodeGenerationComplete', handleCompletion);
    manager.on('nodeGenerationAborted', handleAborted);
    manager.on('error', handleError);
    manager.on('high-level-progress', handleHighLevelProgress);
    manager.on('loop-progress', handleLoopProgress);
    manager.on('nodeSummaryGenerated', handleSummaryGenerated);
    manager.on('project-loaded', handleProjectLoaded);
}


// --- Component Renders ---

export function refreshGlobalProfileSelector() {
    const selector = document.getElementById('active-profile-selector') as HTMLSelectElement;
    if (!selector) return;

    const settingsManager = state.getSettingsManager();
    const profileNames = settingsManager?.getProfileNames() || [];
    const activeProfileName = settingsManager?.getLastUsedProfileName() || 'default';
    
    selector.innerHTML = profileNames.map(name => 
        `<option value="${name}" ${activeProfileName === name ? 'selected' : ''}>${name}</option>`
    ).join('');
}



export function renderNodeDetails() {
    const contentArea = getElementById('node-details');
    contentArea.innerHTML = ''; // Clear previous content

    if (!projectManager || !selectedNodeId) {
        // Use safe content replacement for placeholder
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.replaceContent('node-details', '<div class="placeholder">No node selected.</div>');
        }).catch(() => {
            contentArea.innerHTML = '<div class="placeholder">No node selected.</div>';
        });
        return;
    }

    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) {
        // Use safe content replacement for error
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.replaceContent('node-details', `<div class="placeholder">Error: Node with ID "${selectedNodeId}" not found.</div>`);
        }).catch(() => {
            contentArea.innerHTML = `<div class="placeholder">Error: Node with ID "${selectedNodeId}" not found.</div>`;
        });
        return;
    }
    
    // Set up project manager listeners for the active project (only if not already set up)
    if (!projectManager._listenersSetup) {
        setupProjectManagerListeners(projectManager);
        // @ts-ignore - Mark that listeners are set up to prevent duplication
        projectManager._listenersSetup = true;
    }
    
    const settingsManager = state.getSettingsManager();
    settingsManager?.getProfileNames() || [];

    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'node-details-container';
    detailsContainer.innerHTML = `
        <style>
            .node-details-container {
                padding: 1rem;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
                height: 100%;
                box-sizing: border-box;
            }
            .node-details-header {
                padding-bottom: 1rem;
                border-bottom: 1px solid var(--border-color);
            }
            .node-details-header h2 {
                font-size: 2rem;
                font-weight: bold;
                margin: 0;
            }
            .node-details-header .node-path {
                font-size: 0.9rem;
                color: #6c757d;
                margin-top: 0.25rem;
            }
            .node-section {
                background-color: #ffffff;
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            }
            .node-section label {
                font-weight: bold;
                font-size: 1.1rem;
                color: #343a40;
            }
            .large-textarea {
                width: 100%;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 0.75rem;
                font-size: 1rem;
                line-height: 1.5;
                background-color: var(--input-bg);
                resize: vertical;
            }
            .node-actions {
                display: flex;
                justify-content: flex-end;
                margin-top: 0.5rem;
            }
            .settings-bar {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                width: 100%;
            }
            .settings-bar label {
                font-size: 1rem;
                white-space: nowrap;
            }
            .settings-bar select, .settings-bar input {
                flex-grow: 1;
                padding: 0.5rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
            }
            .settings-bar input[type="number"] {
                flex-grow: 0;
                width: 70px;
            }
            .prompt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.75rem;
            }
        </style>
        <div class="node-details-header">
            <h2 id="node-title-display" contenteditable="true">${node.title}</h2>
            <div class="node-path">Path: ${projectManager.getNodePath(node.id)}</div>
            ${node.level === 0 ? `<div class="template-info" style="font-size: 0.9rem; color: #6c757d; margin-top: 0.25rem;">Template: <strong>${projectManager.template.name}</strong></div>` : ''}
            
            <!-- Actions Button -->
            <div style="margin-top: 1rem;">
                <button id="actions-dropdown-btn" class="button button-primary" style="display: flex; align-items: center; gap: 0.5rem;">
                    ⚡ Actions
                    <span style="font-size: 0.8em;">▼</span>
                </button>
            </div>
        </div>

        <style>
        /* Actions modal now uses proper BaseModal system */
        </style>

        <div class="node-section generation-section">
            <div class="prompt-header">
                <label for="node-generation-prompt">Generation</label>
                <div class="placeholder-buttons">
                    <button class="placeholder-btn" data-placeholder="path" title="View path placeholder value">{{path}}</button>
                    <button class="placeholder-btn" data-placeholder="context" title="View context placeholder value">{{context}}</button>
                    <button class="placeholder-btn" data-placeholder="title" title="View title placeholder value">{{title}}</button>
                    <button class="placeholder-btn" data-placeholder="content" title="View content placeholder value">{{content}}</button>
                    <button class="placeholder-btn" data-placeholder="draftorfresh" title="View draftorfresh placeholder value">{{draftorfresh}}</button>
                    ${!node.isLeaf ? '<button class="placeholder-btn" data-placeholder="child_level_name" title="View child level name placeholder value">{{child_level_name}}</button>' : ''}
                    ${!node.isLeaf ? '<button class="placeholder-btn" data-placeholder="count" title="View count placeholder value">{{count}}</button>' : ''}
                    <button id="default-prompt-btn" class="button button-secondary">Default</button>
                </div>
            </div>
            <textarea id="node-generation-prompt" class="large-textarea" rows="8" placeholder="Enter a prompt here to generate content from scratch...">${node.generationPrompt || ''}</textarea>
            
            <!-- Generation Controls -->
            <div style="display: flex; gap: 1rem; align-items: flex-start; margin-top: 1rem;">
                <!-- Left side: Generation controls -->
                <div style="display: flex; flex-direction: column; gap: 0.75rem; min-width: 280px;">
                    <!-- Generation Type Selection -->
                    <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 0.5rem;">
                        <label style="font-weight: 600; color: #495057;">Generate:</label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="radio" name="generation-type" value="content" ${node.getState() !== 'Final' || node.isLeaf ? 'checked' : ''} style="margin: 0;">
                            <span>This ${getCurrentLevelName(node).toLowerCase()}</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; ${node.isLeaf ? 'opacity: 0.6; cursor: not-allowed;' : ''}">
                            <input type="radio" name="generation-type" value="children" ${node.isLeaf ? 'disabled' : (node.getState() === 'Final' ? 'checked' : '')} style="margin: 0;">
                            <span>All ${getPluralChildLevelName(node).toLowerCase()}</span>
                        </label>
                    </div>
                    
                    <!-- Generation Controls Row -->
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div class="count-container" style="display: ${!node.isLeaf && node.getState() === 'Final' ? 'flex' : 'none'}; align-items: center; gap: 0.5rem;">
                            <label for="generation-count-input" style="font-size: 0.9rem; white-space: nowrap;">Count:</label>
                            <input type="number" id="generation-count-input" min="1" max="20" value="${node.getTemplateChildrenCount() ?? ''}" style="width: 70px; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px;">
                        </div>
                        <button id="node-generate-btn" class="button button-primary">Generate</button>
                    </div>
                    
                    <!-- Additional Options for Children Generation -->
                    <div id="children-generation-options" style="display: ${!node.isLeaf && node.getState() === 'Final' ? 'block' : 'none'}; border-top: 1px solid #e9ecef; padding-top: 0.75rem;">
                        <div style="display: flex; gap: 1rem; font-size: 0.9rem; align-items: center;">
                            <label for="include-content-checkbox">
                                <input type="checkbox" id="include-content-checkbox" ${includeContentState ? 'checked' : ''}>
                                Include content
                            </label>
                            <label for="check-coherence-checkbox">
                                <input type="checkbox" id="check-coherence-checkbox" ${checkCoherenceState && !recursiveState ? 'checked' : ''} ${recursiveState ? 'disabled' : ''}>
                                Check coherence
                            </label>
                            <label for="recursive-checkbox">
                                <input type="checkbox" id="recursive-checkbox" ${recursiveState ? 'checked' : ''}>
                                Recursive
                            </label>
                        </div>
                    </div>
                    
                    ${node.isLeaf ? `
                        <div style="font-size: 0.9rem; color: #6c757d; font-style: italic;">
                            This node is a leaf node (${node.template[node.level] || 'final level'}) and cannot have children.
                        </div>
                    ` : ''}
                </div>
                
                <!-- Right side: Progress bars -->
                <div id="generation-progress-container" style="flex: 1; display: none; min-width: 300px;">
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                        <div class="progress-tier">
                            <div id="progress-text-operations" style="font-size: 0.9rem; font-weight: 600; color: #495057; margin-bottom: 0.25rem;"></div>
                            <div class="progress-bar-wrapper">
                                <div id="progress-bar-operations" class="progress-bar" style="width: 0%;"></div>
                            </div>
                        </div>
                        
                        <!-- Middle and Bottom Level: Iterations and Stages side by side -->
                        <div style="display: flex; gap: 1rem;">
                            <!-- Left: LoopOrchestrator iterations -->
                            <div class="progress-tier" style="flex: 1;">
                                <div id="progress-text-iterations" style="font-size: 0.85rem; color: #6c757d; margin-bottom: 0.25rem;"></div>
                                <div class="progress-bar-wrapper">
                                    <div id="progress-bar-iterations" class="progress-bar" style="width: 0%;"></div>
                                </div>
                            </div>
                            
                            <!-- Right: Stage within iteration -->
                            <div class="progress-tier" style="flex: 1;">
                                <div id="progress-text-stages" style="font-size: 0.8rem; color: #6c757d; margin-bottom: 0.25rem;"></div>
                                <div class="progress-bar-wrapper">
                                    <div id="progress-bar-stages" class="progress-bar" style="width: 0%;"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div id="progress-text-detail" style="font-style: italic; color: #6c757d; font-size: 0.75rem; margin-top: 0.25rem;"></div>
                    </div>
                </div>
                
                <style>
                .progress-tier {
                    margin-bottom: 0.25rem;
                }
                .progress-tier:last-of-type {
                    margin-bottom: 0;
                }
                .progress-bar-wrapper {
                    background-color: #e9ecef;
                    border-radius: 6px;
                    height: 16px;
                    overflow: hidden;
                    position: relative;
                }
                .progress-bar {
                    background: linear-gradient(90deg, var(--primary-500) 0%, var(--primary-600) 100%);
                    height: 100%;
                    border-radius: 6px;
                    transition: width 0.3s ease-in-out;
                    position: relative;
                    min-width: 0;
                }
                .progress-bar::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
                    animation: progress-shine 2s infinite;
                }
                @keyframes progress-shine {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .version-nav-btn {
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    color: #495057;
                    border-radius: 4px;
                    width: 28px;
                    height: 28px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.1rem;
                    font-weight: bold;
                    transition: all 0.2s;
                }
                .version-nav-btn:hover:not(:disabled) {
                    background: #e9ecef;
                    border-color: #adb5bd;
                    color: #343a40;
                }
                .version-nav-btn:disabled {
                    background: #f8f9fa;
                    border-color: #e9ecef;
                    color: #adb5bd;
                    cursor: not-allowed;
                }
                </style>
            </div>
            
            <!-- Generation Status Display -->
            <div id="generation-status" style="display: none; margin-top: 0.75rem; padding: 0.5rem 0.75rem; background-color: #e8f4fd; border: 1px solid #bee5eb; border-radius: 6px; font-size: 0.9rem; color: #0c5460; font-style: italic;">
                <!-- Status messages will appear here -->
            </div>
        </div>

        <div class="node-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: baseline; gap: 0.5rem;">
                    <label for="node-content">Content</label>
                    <span style="font-size: 0.75rem; color: #6c757d; font-style: italic; line-height: 1;">${node.creatorModel ? node.creatorModel : 'user text, not generated'}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div id="version-navigation" style="display: none; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
                        <button id="version-prev-btn" class="version-nav-btn" title="Previous version">‹</button>
                        <span id="version-indicator">Version 1 of 1</span>
                        <button id="version-next-btn" class="version-nav-btn" title="Next version">›</button>
                        <button id="use-this-version-btn" class="button button-primary button-sm" style="display: none;">Use This Version</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" id="show-ratings-checkbox" style="margin: 0;">
                        <label for="show-ratings-checkbox" style="font-weight: normal; font-size: 0.9rem; margin: 0;">Show ratings</label>
                    </div>
                </div>
            </div>
            <div id="content-display-area">
                <textarea id="node-content" class="large-textarea" rows="15" placeholder="Node content will be generated or can be written here...">${node.content || ''}</textarea>
                <div id="ratings-display" style="display: none;">
                    <!-- Ratings will be populated here -->
                </div>
            </div>
        </div>
        
        <div class="node-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: baseline; gap: 0.5rem;">
                    <label for="node-context">Context</label>
                    <button id="context-info-btn" class="info-button" title="Learn about Context features" style="margin-left: 4px;">i</button>
                    <span style="font-size: 0.8rem; color: #6c757d; font-style: italic; line-height: 1;">(Context will be copied to newly created child nodes.)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <button id="node-propagate-context-btn" class="button button-secondary">Propagate</button>
                    <button id="node-extract-context-btn" class="button button-secondary">Extract Context</button>
                </div>
            </div>
            <textarea id="node-context" class="large-textarea" rows="5" placeholder="Additional context information for this node can be written here.">${node.context || ''}</textarea>
        </div>


    `;

    contentArea.appendChild(detailsContainer);
    
    // Re-attach event listeners after DOM content replacement
    console.log('🔧 Re-setting up event listeners after renderNodeDetails DOM replacement');
    setupEventListeners();

    // === DEBUGGING: Log dropdown HTML generation ===
    // Actions dropdown rendered successfully

    // --- Populate and Set States (No Listeners Here!) ---
    const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
    const generateBtn = getElementById('node-generate-btn') as HTMLButtonElement;
    const defaultPromptBtn = getElementById('default-prompt-btn') as HTMLButtonElement;
    const showRatingsCheckbox = getElementById('show-ratings-checkbox') as HTMLInputElement;

    // Reset checkbox state when switching nodes
    if (showRatingsCheckbox) {
        showRatingsCheckbox.checked = false;
        // Ensure content view is shown by default
        toggleRatingsView(false);
    }

    // Initialize version navigation
    initializeVersionNavigation(node);
    
    // Update the content display to show the current version
    updateVersionContentDisplay();

    if (!node.generationPrompt) {
        node.generationPrompt = projectManager.getRawGenerationPrompt(node);
        // Don't auto-save - only save when user explicitly changes something
    }
    generationPromptTextArea.value = node.generationPrompt;

    // Check if any operation is currently running on this node or any other node in the project
    const isAnyNodeGenerating = projectManager.isAnyNodeGenerating();
    const isThisNodeGenerating = node.isGenerating;
    const shouldDisableButtons = isAnyNodeGenerating || node.isPromptGenerating;

    if (node.isPromptGenerating) {
        generationPromptTextArea.placeholder = "Generating detailed prompt...";
    } else if (!node.generationPrompt) {
        generationPromptTextArea.placeholder = "A detailed prompt was not generated. You can write one here or try expanding the parent node again.";
    } else {
        generationPromptTextArea.placeholder = "The prompt for generating content. You can edit it here.";
    }

    // Update button states based on generation status  
    const isAnyOperationInProgress = projectManager.getGenerationService().canAbortGeneration();
    
    // Normal button states (no more button transformations)
    generateBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    generateBtn.className = 'button button-primary';
    generateBtn.id = 'node-generate-btn';
    
    defaultPromptBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    
    // Handle context buttons state
    const extractContextBtn = getElementById('node-extract-context-btn') as HTMLButtonElement;
    const propagateContextBtn = getElementById('node-propagate-context-btn') as HTMLButtonElement;
    
    if (extractContextBtn) {
        extractContextBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    }
    
    if (propagateContextBtn) {
        propagateContextBtn.disabled = shouldDisableButtons || isAnyOperationInProgress;
    }

    // Update button text to show current state - USING SAFE METHOD to prevent listener loss
    if (isThisNodeGenerating) {
        // Import EventManager for safe button updates
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.updateButtonContent('node-generate-btn', 
                '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span> Generating...',
                { disabled: true, className: 'button button-primary' }
            );
        }).catch(console.error);
    } else if (isAnyOperationInProgress) {
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.updateButtonContent('node-generate-btn', 
                `${BUTTON_LABELS.GENERATE} (Operation in progress)`,
                { disabled: true, className: 'button button-primary' }
            );
        }).catch(console.error);
    } else {
        void import('./event-manager').then(({ eventManager }) => {
            eventManager.updateButtonContent('node-generate-btn', 
                BUTTON_LABELS.GENERATE,
                { disabled: false, className: 'button button-primary' }
            );
        }).catch(console.error);
    }

    // Set up button tooltips and event listeners for generate all children button (now inline)
    if (!node.isLeaf) {
        // Set up checkbox event listeners to save state
        const includeContentCheckbox = getElementById('include-content-checkbox') as HTMLInputElement;
        const checkCoherenceCheckbox = getElementById('check-coherence-checkbox') as HTMLInputElement;
        const recursiveCheckbox = getElementById('recursive-checkbox') as HTMLInputElement;
        
        if (includeContentCheckbox) {
            includeContentCheckbox.addEventListener('change', () => {
                includeContentState = includeContentCheckbox.checked;
                void saveCheckboxStates().catch(console.error);
            });
        }
        
        if (checkCoherenceCheckbox) {
            checkCoherenceCheckbox.addEventListener('change', () => {
                checkCoherenceState = checkCoherenceCheckbox.checked;
                void saveCheckboxStates().catch(console.error);
            });
        }
        
        if (recursiveCheckbox) {
            recursiveCheckbox.addEventListener('change', () => {
                recursiveState = recursiveCheckbox.checked;
                
                // When recursive is checked, uncheck and disable coherence check
                if (checkCoherenceCheckbox) {
                    if (recursiveState) {
                        checkCoherenceCheckbox.checked = false;
                        checkCoherenceCheckbox.disabled = true;
                        checkCoherenceState = false;
                    } else {
                        checkCoherenceCheckbox.disabled = false;
                        checkCoherenceCheckbox.checked = checkCoherenceState;
                    }
                }
                
                void saveCheckboxStates().catch(console.error);
            });
        }
    }

    // Set up auto propagate checkbox listener (outside the if block since it's always present)


    // --- CRITICAL: Add missing event listeners for content and context textareas ---
    // This must happen AFTER the DOM elements are created and appended above
    const contentTextArea = getElementById('node-content') as HTMLTextAreaElement;
    const contextTextArea = getElementById('node-context') as HTMLTextAreaElement;
    const nodeGenerationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
    const nodeTitleDisplay = getElementById('node-title-display') as HTMLElement;

    // Content textarea - save content changes to node
    if (contentTextArea) {
        contentTextArea.addEventListener('input', () => {
            if (projectManager && selectedNodeId) {
                const node = projectManager.findNodeById(selectedNodeId);
                if (node) {
                    node.content = contentTextArea.value;
                    // Save to storage with debounced approach
                    clearTimeout((contentTextArea as any)._saveTimeout);
                    (contentTextArea as any)._saveTimeout = setTimeout(() => {
                        void projectManager!.saveToStorage().catch(console.error);
                    }, 1000); // Save after 1 second of no typing
                }
            }
        });
    }

    // Context textarea - save context changes to node
    if (contextTextArea) {
        contextTextArea.addEventListener('input', () => {
            if (projectManager && selectedNodeId) {
                const node = projectManager.findNodeById(selectedNodeId);
                if (node) {
                                    node.context = contextTextArea.value;
                
                // Always propagate context to all descendants
                const propagateRecursively = (sourceNode: DocumentNode) => {
                    for (const child of sourceNode.children) {
                        child.context = sourceNode.context;
                        propagateRecursively(child);
                    }
                };
                
                propagateRecursively(node);
                    
                    // Save to storage with debounced approach
                    clearTimeout((contextTextArea as any)._saveTimeout);
                    (contextTextArea as any)._saveTimeout = setTimeout(() => {
                        void projectManager!.saveToStorage().catch(console.error);
                    }, 1000); // Save after 1 second of no typing
                }
            }
        });
    }

    // Generation prompt textarea - save prompt changes to node
    if (nodeGenerationPromptTextArea) {
        nodeGenerationPromptTextArea.addEventListener('input', () => {
            if (projectManager && selectedNodeId) {
                const node = projectManager.findNodeById(selectedNodeId);
                if (node) {
                    node.generationPrompt = nodeGenerationPromptTextArea.value;
                    // Save to storage with debounced approach
                    clearTimeout((nodeGenerationPromptTextArea as any)._saveTimeout);
                    (nodeGenerationPromptTextArea as any)._saveTimeout = setTimeout(() => {
                        void projectManager!.saveToStorage().catch(console.error);
                    }, 1000); // Save after 1 second of no typing
                }
            }
        });
    }

    // Node title - save title changes to node
    if (nodeTitleDisplay) {
        nodeTitleDisplay.addEventListener('input', () => {
            if (projectManager && selectedNodeId) {
                const node = projectManager.findNodeById(selectedNodeId);
                if (node) {
                    node.title = nodeTitleDisplay.textContent || '';
                    // Save to storage with debounced approach
                    clearTimeout((nodeTitleDisplay as any)._saveTimeout);
                    (nodeTitleDisplay as any)._saveTimeout = setTimeout(() => {
                        void projectManager!.saveToStorage().catch(console.error);
                        // Re-render tree to show updated title
                        renderMultiProjectTree();
                    }, 1000); // Save after 1 second of no typing
                }
            }
        });
    }

    // Actions dropdown elements initialized
}

function initializeVersionNavigation(node: DocumentNode) {
    // Get all available versions (current content + all iterations from latest session)
    availableVersions = [];
    currentVersionIndex = 0;

    // Helper function to calculate total score
    const calculateTotalScore = (ratings: any[]): number => {
        if (!ratings || ratings.length === 0) return 0;
        return ratings.reduce((sum, rating) => sum + rating.score, 0);
    };

    // Add current content as version (will be sorted by score)
    const currentChosenIteration = node.getChosenIteration();
    availableVersions.push({
        content: node.content,
        ratings: currentChosenIteration?.ratings || null,
        isCurrent: true,
        label: 'Current',
        totalScore: currentChosenIteration?.ratings ? calculateTotalScore(currentChosenIteration.ratings) : 0
    });

    // Add iterations from the latest generation session
    const latestSession = node.getLatestGenerationSession();
    if (latestSession && latestSession.iterations.length > 0) {
        latestSession.iterations.forEach((iteration) => {
            // Skip the chosen iteration since it's already included as current content
            if (!iteration.wasChosen) {
                availableVersions.push({
                    content: iteration.content,
                    ratings: iteration.ratings,
                    isCurrent: false,
                    label: '', // Will be set after sorting
                    timestamp: iteration.timestamp,
                    totalScore: calculateTotalScore(iteration.ratings)
                });
            }
        });
    }

    // Sort all versions by total score (highest first)
    availableVersions.sort((a, b) => b.totalScore - a.totalScore);

    // Assign clean labels based on score ranking
    availableVersions.forEach((version, index) => {
        if (version.isCurrent) {
            version.label = `Current (Score: ${version.totalScore})`;
        } else {
            version.label = `Version ${index + 1} (Score: ${version.totalScore})`;
        }
    });

    // Find the current content's new index after sorting
    currentVersionIndex = availableVersions.findIndex(v => v.isCurrent);

    // Update UI visibility and state
    updateVersionNavigationUI();
}

function updateVersionNavigationUI() {
    const versionNav = document.getElementById('version-navigation');
    const versionIndicator = document.getElementById('version-indicator');
    const prevBtn = document.getElementById('version-prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('version-next-btn') as HTMLButtonElement;
    const useVersionBtn = document.getElementById('use-this-version-btn') as HTMLButtonElement;

    if (!versionNav || !versionIndicator || !prevBtn || !nextBtn || !useVersionBtn) return;

    // Show/hide navigation based on whether there are multiple versions
    if (availableVersions.length > 1) {
        versionNav.style.display = 'flex';
        
        // Update indicator text - just show the version label
        const currentVersion = availableVersions[currentVersionIndex];
        versionIndicator.textContent = currentVersion.label;
        
        // Update button states
        prevBtn.disabled = currentVersionIndex === 0;
        nextBtn.disabled = currentVersionIndex === availableVersions.length - 1;
        
        // Show "Use This Version" button only if not on current version
        useVersionBtn.style.display = currentVersion.isCurrent ? 'none' : 'inline-block';
    } else {
        versionNav.style.display = 'none';
    }
}

function updateVersionContentDisplay() {
    const currentVersion = availableVersions[currentVersionIndex];
    if (!currentVersion) return;
    
    // Update the content textarea to show the selected version's content
    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
    if (contentTextArea) {
        contentTextArea.value = currentVersion.content;
    }
    
    // Update the ratings view if it's currently showing
    const showRatingsCheckbox = document.getElementById('show-ratings-checkbox') as HTMLInputElement;
    if (showRatingsCheckbox && showRatingsCheckbox.checked) {
        renderRatingsView();
    }
}







function toggleRatingsView(showRatings: boolean) {
    const contentTextArea = document.getElementById('node-content') as HTMLTextAreaElement;
    const ratingsDisplay = document.getElementById('ratings-display') as HTMLDivElement;
    
    if (!contentTextArea || !ratingsDisplay) return;
    
    if (showRatings) {
        // Hide content textarea and show ratings
        contentTextArea.style.display = 'none';
        ratingsDisplay.style.display = 'block';
        
        // Populate ratings display
        renderRatingsView();
    } else {
        // Show content textarea and hide ratings
        contentTextArea.style.display = 'block';
        ratingsDisplay.style.display = 'none';
    }
}

function renderRatingsView() {
    const ratingsDisplay = document.getElementById('ratings-display') as HTMLDivElement;
    if (!ratingsDisplay || !projectManager || !selectedNodeId) return;
    
    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) return;
    
    // Get ratings from the currently selected version
    const currentVersion = availableVersions[currentVersionIndex];
    let versionRatings: any[] = [];
    let versionLabel = 'Current';
    let timestampToShow: Date | null = null;
    
    if (currentVersion && currentVersion.ratings) {
        versionRatings = currentVersion.ratings;
        versionLabel = currentVersion.label;
        timestampToShow = currentVersion.timestamp;
    } else if (currentVersion && currentVersion.isCurrent) {
        // For current version, try to get ratings from chosen iteration
        const chosenIteration = node.getChosenIteration();
        if (chosenIteration && chosenIteration.ratings) {
            versionRatings = chosenIteration.ratings;
            timestampToShow = chosenIteration.timestamp;
        }
    }
    
    if (!versionRatings || versionRatings.length === 0) {
        ratingsDisplay.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #6c757d; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                <h4 style="margin: 0 0 1rem 0; color: #495057;">No Ratings Available</h4>
                <p style="margin: 0 0 1rem 0; font-size: 0.9rem;">This ${versionLabel.toLowerCase()} content doesn't have any quality ratings yet.</p>
                <p style="margin: 0 0 1.5rem 0; font-size: 0.85rem; color: #868e96;">
                    Ratings are created when content is generated through the AI system. If you edited the content manually, 
                    the previous ratings were cleared since they no longer apply to the modified text.
                </p>
                ${currentVersion && currentVersion.isCurrent ? `
                    <button id="regenerate-ratings-btn" class="button button-primary">
                        ${BUTTON_LABELS.GENERATE_RATINGS}
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    const maxScore = Math.max(...versionRatings.map((r: any) => Math.max(r.score, r.goal)), 10); // Ensure minimum scale of 10
    
    let ratingsHtml = `
        <div style="padding: 1.5rem; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h4 style="margin: 0 0 1rem 0; color: #495057;">Quality Ratings for ${versionLabel} Content</h4>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
    `;
    
    versionRatings.forEach((rating: any) => {
        const scorePercentage = (rating.score / maxScore) * 100;
        const goalPercentage = (rating.goal / maxScore) * 100;
        const metGoal = rating.score >= rating.goal;
        const statusColor = metGoal ? '#28a745' : '#dc3545';
        const statusIcon = metGoal ? '✓' : '✗';
        
        ratingsHtml += `
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div style="font-weight: 600; color: #343a40;">${rating.criterion}</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="color: ${statusColor}; font-size: 1.1rem;">${statusIcon}</span>
                        <span style="font-weight: 600; color: ${statusColor};">${rating.score}/${rating.goal}</span>
                    </div>
                </div>
                
                <div style="position: relative; background-color: #e9ecef; border-radius: 6px; height: 24px; overflow: hidden;">
                    <!-- Goal line -->
                    <div style="position: absolute; left: ${goalPercentage}%; top: 0; bottom: 0; width: 2px; background-color: #ffc107; z-index: 2;"></div>
                    <!-- Score bar -->
                    <div style="height: 100%; background: linear-gradient(90deg, ${metGoal ? '#28a745' : '#dc3545'} 0%, ${metGoal ? '#34ce57' : '#e74c3c'} 100%); width: ${scorePercentage}%; border-radius: 6px; transition: width 0.3s ease-in-out; position: relative;">
                        <!-- Shine effect -->
                        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%); animation: progress-shine 2s infinite;"></div>
                    </div>
                </div>
                
                <div style="margin-top: 0.5rem; font-size: 0.85rem; color: #6c757d; font-style: italic;">
                    "${rating.justification}"
                </div>
            </div>
        `;
    });
    
    ratingsHtml += `
            </div>
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #dee2e6; font-size: 0.8rem; color: #6c757d;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <div style="width: 12px; height: 2px; background-color: #ffc107;"></div>
                    <span>Goal threshold</span>
                </div>
                ${timestampToShow ? `Generated on: ${new Date(timestampToShow).toLocaleString()}` : 'Timestamp not available'}
            </div>
        </div>
    `;
    
    ratingsDisplay.innerHTML = ratingsHtml;
}

// --- Helper Functions ---

function buildTreeHtml(node: DocumentNode, isProjectRoot: boolean = false): string {
    const isSelected = node.id === selectedNodeId;
    const hasChildren = node.children.length > 0;
    const isCollapsed = node.collapsed; // Use node's collapsed property instead of global set
    const indent = node.level * 20;
    

    
    let html = `<div class="tree-item" style="padding-left: ${indent}px;">`;
    
    // Add expand/collapse button for nodes with children
    if (hasChildren) {
        const expandIcon = isCollapsed ? '▶' : '▼';
        html += `<span class="tree-expand-btn" data-node-id="${node.id}" style="cursor: pointer; margin-right: 4px; user-select: none; font-size: 12px;" title="Click: toggle this node | Double-click: toggle all nodes at this level">${expandIcon}</span>`;

    } else {
        // Add spacing for nodes without children to align with those that have expand buttons
        html += `<span style="margin-right: 16px;"></span>`;
    }
    
    // Add the node title with special styling for project roots
    const nodeClasses = `tree-node ${isSelected ? 'selected' : ''} ${isProjectRoot ? 'project-root' : ''}`;
    html += `<span class="${nodeClasses}" data-id="${node.id}">
                ${node.title} ${node.isGenerating ? '<span class="spinner" style="width:12px; height:12px; border-width: 2px;"></span>' : ''}
             </span>`;
    
    html += `</div>`;
    
    // Add children if not collapsed
    if (hasChildren && !isCollapsed) {
        node.children.forEach(child => {
            html += buildTreeHtml(child, false);
        });
    }

    return html;
}



function showPlaceholderOverlay(placeholder: string, projectManager: ProjectManager, selectedNodeId: string) {
    const node = projectManager.findNodeById(selectedNodeId);
    if (!node) return;

    // Get the generation prompt panel (section) to use as reference for initial sizing
    const promptSection = document.querySelector('.generation-section') as HTMLElement;
    if (!promptSection) return;

    const sectionRect = promptSection.getBoundingClientRect();

    // Get placeholder descriptions
    const descriptions: { [key: string]: string } = {
        'path': 'The hierarchical path from root to this node',
        'context': 'Compiled contextual information from ancestors, siblings, and parent',
        'title': 'The title of the current node',
        'content': 'The current content of the node (if any)',
        'draftorfresh': 'Instructions for handling existing content (draft improvement or new generation)',
        'child_level_name': 'The name of the child level (for branch nodes)',
        'count': 'The number of items to generate (for list generation)'
    };

    // Get the actual placeholder value
    let value: string;
    switch (placeholder) {
        case 'path':
            value = projectManager.getTreeService().getNodePath(selectedNodeId, projectManager.rootNode);
            break;
        case 'context':
            value = projectManager.getContextService().compileNodeContext(selectedNodeId, projectManager.rootNode);
            break;
        case 'title':
            value = node.title;
            break;
        case 'content':
            value = node.content || '';
            break;
        case 'draftorfresh':
            // Show what the draftorfresh placeholder would actually expand to
            if (node.content) {
                if (node.content.startsWith('Draft:')) {
                    value = `You have this existing draft to build upon:
---
${node.content}
---

Please expand this draft into full, detailed content. Use the draft as a guide for what should be covered, but write complete, polished content that goes well beyond the brief draft description.`;
                } else {
                    value = `You have this existing content to revise or expand:
---
${node.content}
---

Please improve and expand this content.`;
                }
            } else {
                value = 'Now, write the full content for this node.';
            }
            break;
        case 'child_level_name':
            value = node.childLevelName || '';
            break;
        case 'count':
            value = '5'; // Default count for demonstration
            break;
        default:
            value = '';
    }

    // No need to manually trim - DocumentNode setters handle this automatically
    // value = value.trim();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'placeholder-overlay';
    overlay.innerHTML = `<div class="placeholder-content" style="width: min(90vw, ${sectionRect.width}px); height: min(85vh, ${sectionRect.height}px); max-width: 1200px; max-height: 800px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);"><div class="placeholder-header"><h3>{{${placeholder}}}</h3><button class="placeholder-close-btn" type="button">&times;</button></div><div class="placeholder-body"><div class="placeholder-description">${descriptions[placeholder] || 'Placeholder value'}</div><div class="placeholder-value ${value ? '' : 'placeholder-empty'}"></div></div></div>`;
    
    // Set the placeholder value using textContent to avoid whitespace issues
    const valueElement = overlay.querySelector('.placeholder-value');
    if (valueElement) {
        valueElement.textContent = value || '(empty)';
    }

    // Add close functionality
    const closeBtn = overlay.querySelector('.placeholder-close-btn');
    
    const closeOverlay = () => {
        overlay.remove();
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', closeOverlay);
    }

    // Close on overlay background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeOverlay();
        }
    });

    // Close on Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeOverlay();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Add to DOM
    document.body.appendChild(overlay);
}

/**
 * Handle dropdown action by button ID
 * This function contains all the logic for dropdown actions that were moved out of the main switch statement
 */
function handleDropdownAction(buttonId: string): void {
    if (!projectManager || !selectedNodeId) return;

    switch (buttonId) {
        case 'new-top-layer-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node || node.level !== 0) {
                    alert('This action is only available for root nodes.');
                    return;
                }

                handleNewTopLayer(node);
            }
            break;

        case 'copy-to-new-project-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) {
                    alert('No node selected.');
                    return;
                }

                handleCopyToNewProject(node);
            }
            break;

        case 'view-template-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) {
                    alert('No node selected.');
                    return;
                }

                if (node.level !== 0) {
                    alert('This action is only available for root nodes.');
                    return;
                }

                // Import and open the view template modal
                import('./modals/ViewTemplateModal').then(({ showViewTemplateModal }) => {
                    showViewTemplateModal(node);
                }).catch(error => {
                    console.error('Failed to open view template modal:', error);
                    alert('Failed to open template viewer. Please try again.');
                });
            }
            break;

        case 'node-generate-content-action':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Check if node state is Final and warn user
                if (node.getState() === 'Final') {
                    const contentPreview = node.content.substring(0, 100) + (node.content.length > 100 ? '...' : '');
                    const confirmMessage = `This node contains final content that will be replaced.

Current content: "${contentPreview}"

Are you sure you want to generate new content and replace the existing content?

This action cannot be undone.`;
                    
                    if (!confirm(confirmMessage)) {
                        return;
                    }
                }
                
                const coordinator = projectManager.getGenerationCoordinator();
                
                const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
                node.generationPrompt = generationPromptTextArea.value;
                
                // Get the count from the input
                const countInput = getElementById('generation-count-input') as HTMLInputElement;
                const count = countInput ? parseInt(countInput.value, 10) : (node.getTemplateChildrenCount() ?? 5);
                
                // Start operation through coordinator
                const operationId = coordinator.startOperation('single-content', node.id, [node.id]);
                if (!operationId) {
                    alert('Another generation operation is already in progress. Please wait for it to complete.');
                    return;
                }
                
                // Generate content for the single node
                projectManager.getGenerationService().generateNodeContent(node.id, count, false)
                    .then(() => {
                        coordinator.completeOperation(operationId, true);
                        if (projectManager) {
                            void projectManager.saveToStorage().catch(console.error);
                        }
                    })
                    .catch(error => {
                        coordinator.completeOperation(operationId, false, error);
                        console.error('Content generation failed:', error);
                    });
            }
            break;

        case 'node-generate-all-action':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.isLeaf) {
                    alert(`This node is a leaf node (${node.template[node.level] || 'final level'}) and cannot have children.\n\nLeaf nodes are the final level in your project structure and are meant to contain the actual content rather than generate child nodes.`);
                    return;
                }

                if (node.getState() === 'Empty') {
                    alert('This node has no content yet. Please generate content for this node first, then use "Generate All Children" to create child nodes based on that content.');
                    return;
                }

                const includeContentCheckbox = getElementById('include-content-checkbox') as HTMLInputElement;
                const recursiveCheckbox = getElementById('recursive-checkbox') as HTMLInputElement;
                
                const includeContent = includeContentCheckbox ? includeContentCheckbox.checked : true;
                const recursive = recursiveCheckbox ? recursiveCheckbox.checked : false;

                const coordinator = projectManager.getGenerationCoordinator();
                
                // Count how many nodes will be affected
                const getAllInvolvedNodes = (parentNode: DocumentNode): string[] => {
                    const nodes: string[] = [];
                    
                    // If this node has no children, count it as needing children created
                    if (parentNode.children.length === 0) {
                        nodes.push(parentNode.id + '_children');
                    }
                    
                    // Check each child for content generation needs
                    for (const child of parentNode.children) {
                        if (includeContent && child.getState() === 'Empty') {
                            nodes.push(child.id);
                        }
                        
                        // If recursive, check children too
                        if (recursive) {
                            nodes.push(...getAllInvolvedNodes(child));
                        }
                    }
                    
                    return nodes;
                };

                const involvedNodes = getAllInvolvedNodes(node);
                const operationId = coordinator.startOperation('bulk-children', node.id, involvedNodes);
                if (!operationId) {
                    alert('Another generation operation is already in progress. Please wait for it to complete.');
                    return;
                }

                // Start the bulk generation
                projectManager.getGenerationService().generateAllChildrenContent(node.id, includeContent, recursive)
                    .then(() => {
                        coordinator.completeOperation(operationId, true);
                        if (projectManager) {
                            void projectManager.saveToStorage().catch(console.error);
                        }
                    })
                    .catch(error => {
                        coordinator.completeOperation(operationId, false, error);
                        console.error('Bulk generation failed:', error);
                    });
            }
            break;

        case 'default-prompt-action':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
                const defaultPrompt = projectManager.getRawGenerationPrompt(node);
                generationPromptTextArea.value = defaultPrompt;
                node.generationPrompt = defaultPrompt;
            }
            break;

        case 'add-child-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.isLeaf) {
                    const nodeLevelName = node.template[node.level] || 'final level';
                    alert(`This node is a leaf node (${nodeLevelName}) and cannot have children.\n\nLeaf nodes are the final level in your project structure and are meant to contain the actual content rather than generate child nodes.`);
                    return;
                }

                // Open the Add Child Node Modal
                openAddChildNodeModal(node, node.id)
                    .then((_modal) => {
                        console.log('✅ Add Child Node modal opened successfully');
                        // The modal factory handles UI refresh automatically
                    })
                    .catch((error) => {
                        console.error('❌ Failed to open Add Child Node modal:', error);
                        alert('Failed to open Add Child Node dialog. Please try again.');
                    });
            }
            break;

        case 'delete-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.level === 0) {
                    // This is a project root node - delete the entire project
                    state.getProjects();
                    
                    const confirmMessage = `Are you sure you want to delete the entire project "${node.title}"?\n\nThis will permanently delete:\n- The project and all its content\n- All child nodes and their content\n- All generated summaries and history\n\nThis action cannot be undone.`;
                    
                    if (confirm(confirmMessage)) {
                        // Store the project to delete for storage cleanup
                        const projectToDelete = projectManager;
                        
                        // Remove from in-memory state
                        state.removeProject(node.id);
                        
                        // Handle storage cleanup
                        (async () => {
                            try {
                                // If this was the last project, clear all storage
                                const remainingProjects = state.getProjects();
                                if (remainingProjects.length === 0) {
                                    // Clear all project storage
                                    if (projectToDelete) {
                                        await projectToDelete.clearAllProjectsFromStorage();
                                    }
                                } else {
                                    // First, explicitly remove the deleted project from IndexedDB
                                    const storage = await import('../StorageService').then(m => m.StorageService.getInstance());
                                    if (storage.isIndexedDB()) {
                                        const indexedDBService = (storage as any).indexedDBService;
                                        if (indexedDBService) {
                                            await indexedDBService.delete('projects', node.id);
                                        }
                                    }
                                    
                                    // Then save the updated project list
                                    const remainingProject = state.getActiveProject();
                                    if (remainingProject) {
                                        await remainingProject.saveToStorage();
                                    }
                                }
                            } catch (error) {
                                console.error('Failed to update storage after project deletion:', error);
                            }
                        })();
                        
                        // If this was the last project, clear selection and show empty state
                        const remainingProjects = state.getProjects();
                        if (remainingProjects.length === 0) {
                            selectedNodeId = null;
                            projectManager = null;
                            
                            // Show empty state
                            const nodeDetails = getElementById('node-details');
                            nodeDetails.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;"><h3>No Projects</h3><p>All projects have been deleted. Create a new project to get started.</p></div>';
                            
                            // Render empty tree
                            renderMultiProjectTree();
                        } else {
                            // Re-initialize the UI with the remaining projects
                            void initializeProjectUI();
                        }
                    }
                } else {
                    // This is a regular node - delete just this node and its children
                    const hasChildren = node.children.length > 0;
                    const childrenText = hasChildren ? `\n- ${node.children.length} child node(s) and all their content` : '';
                    
                    const confirmMessage = `Are you sure you want to delete "${node.title}"?\n\nThis will permanently delete:\n- This node and its content\n- Generated summary and history${childrenText}\n\nThis action cannot be undone.`;
                    
                    if (confirm(confirmMessage)) {
                        const success = projectManager.removeNode(node.id);
                        if (success) {
                            void projectManager.saveToStorage().catch(console.error);
                            
                            // Select the parent node or project root
                            const parentNode = node.parentId ? projectManager.findNodeById(node.parentId) : projectManager.rootNode;
                            selectedNodeId = parentNode ? parentNode.id : projectManager.rootNode.id;
                            
                            // Re-render the UI
                            renderMultiProjectTree();
                            renderNodeDetails();
                        } else {
                            alert('Failed to delete the node. It may be a root node or have an invalid parent.');
                        }
                    }
                }
            }
            break;

        case 'delete-subnodes-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                if (node.children.length === 0) {
                    alert('This node has no subnodes to delete.');
                    return;
                }

                const childCount = node.children.length;
                const confirmMessage = `Are you sure you want to delete all ${childCount} subnode(s) of "${node.title}"?\n\nThis will permanently delete:\n- All ${childCount} child nodes and their content\n- All nested subnodes and their content\n- All generated summaries and history\n\nThe parent node "${node.title}" will remain intact.\n\nThis action cannot be undone.`;
                
                if (confirm(confirmMessage)) {
                    // Create a copy of the children array since we'll be modifying the original
                    const childrenToDelete = [...node.children];
                    
                    let deletedCount = 0;
                    for (const child of childrenToDelete) {
                        const success = projectManager.removeNode(child.id);
                        if (success) {
                            deletedCount++;
                        }
                    }
                    
                    if (deletedCount > 0) {
                        void projectManager.saveToStorage().catch(console.error);
                        
                        // Re-render the UI to reflect the changes
                        renderMultiProjectTree();
                        renderNodeDetails();
                        
                        if (deletedCount === childCount) {
                            alert(`Successfully deleted all ${deletedCount} subnodes.`);
                        } else {
                            alert(`Deleted ${deletedCount} out of ${childCount} subnodes. Some nodes may have failed to delete.`);
                        }
                    } else {
                        alert('Failed to delete any subnodes. Please try again.');
                    }
                }
            }
            break;

        case 'export-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Import and open export modal
                import('./modal-manager').then(({ openExportModal }) => {
                    openExportModal(projectManager!, node);
                }).catch(_error => {
                    alert('Failed to open export dialog. Please try again.');
                });
            }
            break;

        case 'import-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Create file input element
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json';
                fileInput.style.display = 'none';
                
                fileInput.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    const file = target.files?.[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const content = event.target?.result as string;
                            const importData = JSON.parse(content);
                            
                            // Validate and import
                            if (projectManager) {
                                importNodeData(projectManager, node.id, importData);
                                
                                // Refresh the UI to show imported content
                                renderProjectUI(projectManager);
                            }
                            
                        } catch (error) {
                            console.error('Import failed:', error);
                            alert('Import failed: ' + (error instanceof Error ? error.message : 'Invalid JSON file'));
                        }
                    };
                    
                    reader.onerror = () => {
                        alert('Failed to read file. Please try again.');
                    };
                    
                    reader.readAsText(file);
                });
                
                // Trigger file selection
                document.body.appendChild(fileInput);
                fileInput.click();
                document.body.removeChild(fileInput);
            }
            break;

        case 'chat-node-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;
                
                // Import and open chat modal
                import('./modal-manager').then(({ openNodeChatModal }) => {
                    openNodeChatModal(projectManager!, node);
                }).catch(error => {
                    console.error('Failed to open chat modal:', error);
                    alert('Failed to open chat dialog. Please try again.');
                });
            }
            break;

        case 'polish-text-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;
                
                // Check if node has content to polish
                if (!node.content || node.content.trim() === '') {
                    alert('This node has no content to polish. Please add some content first.');
                    return;
                }
                
                // Import and open polisher modal
                import('./modals/PolisherModal').then(({ PolisherModal }) => {
                    const polisherModal = new PolisherModal(
                        state.getSettingsManager()!,
                        state.getOpenRouterClient()!
                    );
                    polisherModal.initialize();
                    polisherModal.openWithNode(node);
                }).catch(error => {
                    console.error('Failed to open polisher modal:', error);
                    alert('Failed to open text polisher. Please try again.');
                });
            }
            break;

        case 'node-propagate-context-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Function to propagate context to all descendants
                const propagateContextToDescendants = (parentNode: DocumentNode) => {
                    const propagatedCount = { count: 0 };
                    
                    const propagateRecursively = (sourceNode: DocumentNode) => {
                        for (const child of sourceNode.children) {
                            child.context = sourceNode.context;
                            propagatedCount.count++;
                            propagateRecursively(child);
                        }
                    };
                    
                    propagateRecursively(parentNode);
                    return propagatedCount.count;
                };

                const propagatedCount = propagateContextToDescendants(node);
                
                if (propagatedCount > 0) {
                    // Save the project after propagation
                    void projectManager.saveToStorage().catch(console.error);
                    alert(`Context propagated to ${propagatedCount} descendant node(s).`);
                    
                    // Refresh the UI to show updated context if we're viewing a child node
                    const currentNode = projectManager.findNodeById(selectedNodeId);
                    if (currentNode) {
                        const contextTextArea = getElementById('node-context') as HTMLTextAreaElement;
                        if (contextTextArea) {
                            contextTextArea.value = currentNode.context;
                        }
                    }
                } else {
                    alert('This node has no child nodes to propagate context to.');
                }
            }
            break;

        case 'node-extract-context-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Import and open extract context modal
                import('./modal-manager').then(({ openExtractContextModal }) => {
                    openExtractContextModal(projectManager!, node);
                }).catch((error: any) => {
                    console.error('Failed to open extract context modal:', error);
                    alert('Failed to open extract context dialog. Please try again.');
                });
            }
            break;

        case 'check-coherence-btn':
            {
                const node = projectManager.findNodeById(selectedNodeId);
                if (!node) return;

                // Create coherence service instance
                const coherenceService = new CoherenceService(
                    state.getOpenRouterClient()!,
                    state.getSettingsManager()!
                );

                // Check if node is eligible for coherence analysis
                if (!coherenceService.isNodeEligible(node)) {
                    alert(coherenceService.getIneligibilityReason(node));
                    return;
                }

                // Create and show modal in loading state
                const analysisModal = new CoherenceModal();
                analysisModal.openInLoadingState(node);
                
                // Perform analysis
                coherenceService.analyzeCoherence(node)
                    .then((result) => {
                        console.log('Coherence analysis completed, updating modal with results:', result);
                        // Update modal with results
                        analysisModal.updateWithResults(result);
                    })
                    .catch((error) => {
                        console.error('Coherence analysis failed:', error);
                        // Close loading modal and show error
                        analysisModal.close();
                        alert('Coherence analysis failed: ' + error.message);
                    });
            }
            break;

        default:
            console.warn('Unknown dropdown action:', buttonId);
    }
}

export function setupEventListeners() {
    console.log('🔧 Setting up simplified event listeners...');
    
    // Remove all existing listeners first
    removeAllListeners();
    
    // Attach listeners to all buttons
    attachAllListeners();
    
    // Set up non-click event listeners
    const mainContent = getElementById('main-content');
    mainContent.addEventListener('change', async (e) => {
        if (!e.target || !(e.target instanceof HTMLElement)) return;

        if (e.target.id === 'active-profile-selector') {
            const select = e.target as HTMLSelectElement;
            const settingsManager = state.getSettingsManager();
            const modelSelector = state.getModelSelector();
            if (settingsManager && modelSelector) {
                await settingsManager.setLastUsedProfile(select.value);
                
                // Actually load the profile models into the ModelSelector to ensure consistency
                const profile = settingsManager.getProfile(select.value);
                if (profile && profile.selectedModels) {
                    modelSelector.setSelectedModels(profile.selectedModels);
                    
                    // Update global state to track which profile is actually loaded
                    state.setCurrentlyLoadedProfileName(select.value);
                    console.log(`📋 Profile "${select.value}" models loaded into ModelSelector from dropdown change`);
                }
                
                // Force refresh of node details to pick up new profile settings
                if (selectedNodeId) {
                    renderNodeDetails();
                }
            }
        } else if (e.target.id === 'show-ratings-checkbox') {
            const checkbox = e.target as HTMLInputElement;
            toggleRatingsView(checkbox.checked);
        } else if ((e.target as HTMLInputElement).name === 'generation-type') {
            // Handle generation type radio button changes
            const radio = e.target as HTMLInputElement;
            const childrenOptions = document.getElementById('children-generation-options');
            const countContainer = document.querySelector('.count-container') as HTMLElement;
            
            if (radio.value === 'children') {
                if (childrenOptions) childrenOptions.style.display = 'block';
                if (countContainer) countContainer.style.display = 'flex';
            } else {
                if (childrenOptions) childrenOptions.style.display = 'none';
                if (countContainer) countContainer.style.display = 'none';
            }
        }
    });
}

export async function initializeProjectUI(manager?: ProjectManager) {
    const activeProject = manager || state.getActiveProject();
    projectManager = activeProject;
    
    // Update modal factory dependencies if we have an active project
    if (activeProject) {
        selectedNodeId = activeProject.rootNode.id;
        
        try {
            const modalFactory = getDefaultModalFactory();
            modalFactory.updateDependencies({ projectManager: activeProject });
        } catch (error) {
            console.warn('Modal factory not initialized yet:', error);
        }
    }
    
    // Load the checkbox states from storage
    await loadCheckboxStates();

    const mainContent = getElementById('main-content');
    
    // Get profile information for the global selector
    const settingsManager = state.getSettingsManager();
    const profileNames = settingsManager?.getProfileNames() || [];
    const activeProfileName = settingsManager?.getLastUsedProfileName() || 'default';
    

    
    const profileOptions = profileNames.map(name => 
        `<option value="${name}" ${activeProfileName === name ? 'selected' : ''}>${name}</option>`
    ).join('');

    mainContent.innerHTML = `
        <style>
            #global-profile-bar {
                background-color: #f8f9fa;
                border-bottom: 1px solid var(--border-color);
                padding: 1rem;
                display: flex;
                align-items: center;
                gap: 1rem;
                margin-bottom: 1rem;
            }
            #global-profile-bar label {
                font-weight: bold;
                font-size: 1.1rem;
                color: #343a40;
                white-space: nowrap;
            }
            #global-profile-bar select {
                padding: 0.5rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                font-size: 1rem;
                min-width: 200px;
            }
            #project-container { display: flex; gap: 1rem; align-items: flex-start; }
            #project-tree { flex: 1; max-width: 400px; }
            #node-details { flex: 2; }
            .tree-item { display: flex; align-items: center; }
            .tree-expand-btn { 
                color: #6c757d; 
                font-weight: bold;
                width: 16px;
                text-align: center;
            }
            .tree-expand-btn:hover { color: var(--primary-color); }
            .tree-node { 
                padding: 0.25rem 0.5rem; 
                border-radius: 4px; 
                cursor: pointer; 
                flex-grow: 1;
                margin-left: 2px;
            }
            .tree-node.selected { background-color: var(--primary-color); color: white; }
            .tree-node:hover:not(.selected) { background-color: #e9ecef; }
            .project-root {
                font-weight: bold;
                color: #495057;
                border-left: 3px solid var(--primary-color);
                background-color: #f8f9fa;
            }
            .details-view { background-color: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .details-view h2, .details-view h3 { margin-top: 0; }
            .details-view textarea, .details-view select, .details-view input { width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-color); }
            .details-view .form-group { margin-bottom: 1rem; }
            .action-buttons { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
            .spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid rgba(0,0,0,0.1);
                border-radius: 50%;
                border-top-color: var(--primary-color);
                animation: spin 1s ease-in-out infinite;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
        <div id="global-profile-bar">
            <label for="active-profile-selector">Active profile:</label>
            <select id="active-profile-selector">${profileOptions}</select>
            <span style="color: #6c757d; font-size: 0.9rem;">This profile will be used for all AI operations (Generate, Summarize, etc.)</span>
            <button id="open-reader-btn" class="button button-primary" style="margin-left: auto;">📖 Reader View</button>
        </div>
        <div id="project-container">
            <div id="project-tree"></div>
            <div id="node-details"></div>
        </div>
    `;
    
    // Render the multi-project tree (event listeners are set up once in main.ts)
    renderMultiProjectTree();
    
    // Global abort button is now always visible
    
    // Render node details if we have a selected node
    if (selectedNodeId) {
        renderNodeDetails();
    } else {
        const nodeDetails = getElementById('node-details');
        nodeDetails.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;">Select a node to view details.</div>';
    }
    
    // Re-setup event listeners after DOM replacement
    console.log('🔧 Re-setting up event listeners after DOM replacement in initializeProjectUI');
    setupEventListeners();
}



interface ProgressInfo {
    message: string;
    current: number;
    total: number;
}

interface ProgressUIData {
    operations?: ProgressInfo;    // Top level: High-level operations (e.g., "Generating child 3 of 5")
    iterations?: ProgressInfo;    // Middle level: LoopOrchestrator iterations (e.g., "Iteration 2 of 5")
    stages?: ProgressInfo;        // Bottom level: Stage within iteration (Create, Rate, Edit)
    detail?: string;              // Detail text below all progress bars
}

// Global progress state to maintain all three progress bars
let currentProgressState = {
    operations: null as ProgressInfo | null,
    iterations: null as ProgressInfo | null,
    stages: null as ProgressInfo | null,
    detail: ''
};

function updateProgressUI(data?: ProgressUIData) {
    const container = document.getElementById('generation-progress-container');
    if (!container) {
        return;
    }

    const operationsText = getElementById('progress-text-operations');
    const operationsBar = getElementById('progress-bar-operations') as HTMLDivElement;
    const iterationsText = getElementById('progress-text-iterations');
    const iterationsBar = getElementById('progress-bar-iterations') as HTMLDivElement;
    const stagesText = getElementById('progress-text-stages');
    const stagesBar = getElementById('progress-bar-stages') as HTMLDivElement;
    const detailText = getElementById('progress-text-detail');
    
    if (!data) {
        // Clear all progress and hide container
        currentProgressState = { operations: null, iterations: null, stages: null, detail: '' };
        container.style.display = 'none';
        return;
    }
    
    // Update the global state with new data (preserve existing values if not provided)
    if (data.operations) currentProgressState.operations = data.operations;
    if (data.iterations) currentProgressState.iterations = data.iterations;
    if (data.stages) currentProgressState.stages = data.stages;
    if (data.detail !== undefined) currentProgressState.detail = data.detail;
    
    // Show container and all progress bars whenever we have any progress data
    container.style.display = 'block';
    operationsText.style.display = 'block';
    operationsBar.style.display = 'block';
    iterationsText.style.display = 'block';
    iterationsBar.style.display = 'block';
    stagesText.style.display = 'block';
    stagesBar.style.display = 'block';
    
    // Helper function to calculate percentage and update custom progress bar
    const updateProgressBar = (bar: HTMLDivElement, current: number, total: number) => {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        bar.style.width = `${percentage}%`;
    };
    
    // Update Operations Progress (Top Level)
    if (currentProgressState.operations) {
        operationsText.textContent = currentProgressState.operations.message;
        updateProgressBar(operationsBar, currentProgressState.operations.current, currentProgressState.operations.total);
    } else {
        operationsText.textContent = '';
        operationsBar.style.width = '0%';
    }

    // Update Iterations Progress (Middle Level)
    if (currentProgressState.iterations) {
        iterationsText.textContent = currentProgressState.iterations.message;
        updateProgressBar(iterationsBar, currentProgressState.iterations.current, currentProgressState.iterations.total);
    } else {
        iterationsText.textContent = '';
        iterationsBar.style.width = '0%';
    }

    // Update Stages Progress (Bottom Level)
    if (currentProgressState.stages) {
        stagesText.textContent = currentProgressState.stages.message;
        updateProgressBar(stagesBar, currentProgressState.stages.current, currentProgressState.stages.total);
    } else {
        stagesText.textContent = '';
        stagesBar.style.width = '0%';
    }

    // Update Detail Text
    detailText.textContent = currentProgressState.detail || '';
    detailText.style.display = currentProgressState.detail ? 'block' : 'none';
}

// Expose UI functions globally for the GenerationCoordinator
(window as any).updateProgressUI = updateProgressUI;
(window as any).showGenerationOverlay = showGenerationOverlay;
(window as any).hideGenerationOverlay = hideGenerationOverlay;



function showGenerationOverlay() {
    const contentDisplayArea = getElementById('content-display-area');
    
    if (!contentDisplayArea) {
        console.warn('Content display area not found, cannot show overlay');
        return;
    }
    
    // Remove any existing overlay
    const existingOverlay = document.getElementById('generation-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'generation-overlay';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(248, 249, 250, 0.95);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        border-radius: 8px;
        backdrop-filter: blur(2px);
    `;
    
    overlay.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; margin-bottom: 1rem;"></div>
            <h3 style="margin: 0 0 0.5rem 0; color: #495057;">Generation in Progress</h3>
            <p style="margin: 0; color: #6c757d; font-size: 0.9rem;">Content is being generated and will appear here</p>
        </div>
    `;
    
    // Position the content display area relatively so overlay can be positioned absolutely
    contentDisplayArea.style.position = 'relative';
    contentDisplayArea.appendChild(overlay);
}

function hideGenerationOverlay() {
    const overlay = document.getElementById('generation-overlay');
    if (overlay) {
        overlay.remove();
    }
    
    // Reset position if no overlay
    const contentDisplayArea = getElementById('content-display-area');
    if (contentDisplayArea) {
        contentDisplayArea.style.position = '';
    }
}

function renderMultiProjectTree() {
    const treeContainer = getElementById('project-tree');
    const projects = state.getProjects();
    
    console.log('🔄 Rendering multi-project tree:', { 
        projectCount: projects.length, 
        projectTitles: projects.map(p => p.rootNode.title)
    });
    
    if (projects.length === 0) {
        treeContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6c757d;">No projects available. Create a new project to get started.</div>';
        return;
    }
    
    let html = '';
    projects.forEach((project, _index) => {

        html += buildTreeHtml(project.rootNode, true); // true indicates this is a project root
    });
    

    treeContainer.innerHTML = html;

    // Count expand buttons before attaching listeners
    const expandButtons = treeContainer.querySelectorAll('.tree-expand-btn');

    
    // Attach event listeners for node selection
    treeContainer.querySelectorAll('.tree-node').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const id = (e.currentTarget as HTMLElement).dataset['id'];
            if (id) {
                // Find which project this node belongs to
                let nodeProject: ProjectManager | null = null;
                let node: DocumentNode | null = null;
                
                for (const project of projects) {
                    node = project.findNodeById(id);
                    if (node) {
                        nodeProject = project;
                        break;
                    }
                }
                
                if (node && nodeProject) {
                    // Prevent interaction while a node is generating
                    if (node.isGenerating) return;

                    selectedNodeId = id;
                    projectManager = nodeProject; // Update the active project manager
                    state.setActiveProject(nodeProject.rootNode.id); // Update the active project in state
                    renderMultiProjectTree(); // Re-render tree to update selection highlight
                    renderNodeDetails();
                }
            }
        });
    });

    // Attach event listeners for expand/collapse buttons
    expandButtons.forEach((el, _index) => {

        
        // Single click for individual expand/collapse
        el.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent event bubbling
            e.preventDefault(); // Prevent any default behavior
            
            const target = e.currentTarget as HTMLElement;
            const nodeId = target.dataset['nodeId'] || target.getAttribute('data-node-id');
            

            
            if (nodeId) {
                // Find the node in all projects
                let targetNode: DocumentNode | null = null;
                for (const project of projects) {
                    targetNode = project.findNodeById(nodeId);
                    if (targetNode) break;
                }
                
                if (targetNode) {

                    
                    // Toggle the node's collapsed state
                    targetNode.collapsed = !targetNode.collapsed;
                    

                    
                    // Save the project containing this node
                    for (const project of projects) {
                        if (project.findNodeById(nodeId)) {
                            await project.saveToStorage();
                            break;
                        }
                    }
                    

                    
                    // Use requestAnimationFrame to ensure DOM updates are processed properly
                    requestAnimationFrame(() => {
                        renderMultiProjectTree(); // Re-render tree to update expand/collapse state
                    });
                } else {
                    console.error('❌ No node found with ID:', nodeId);
                }
            } else {
                console.error('❌ No nodeId found on expand button', target);
            }
        });

        // Double click for expand/collapse all nodes at the same level
        el.addEventListener('dblclick', async (e) => {
            e.stopPropagation(); // Prevent event bubbling
            e.preventDefault(); // Prevent any default behavior
            
            const target = e.currentTarget as HTMLElement;
            const nodeId = target.dataset['nodeId'] || target.getAttribute('data-node-id');
            

            
            if (nodeId) {
                // Find which project this node belongs to
                let nodeProject: ProjectManager | null = null;
                let node: DocumentNode | null = null;
                
                for (const project of projects) {
                    node = project.findNodeById(nodeId);
                    if (node) {
                        nodeProject = project;
                        break;
                    }
                }
                
                if (node && nodeProject) {
                    // Get all nodes at the same hierarchy level
                    const nodesAtSameLevel = nodeProject.getTreeService().getNodesAtLevel(node.level, nodeProject.rootNode);
                    
                    // Determine action based on current node's state
                    const isCurrentNodeCollapsed = node.collapsed;
                    

                    
                    if (isCurrentNodeCollapsed) {
                        // Current node is collapsed, so expand all nodes at this level
                        nodesAtSameLevel.forEach(levelNode => {
                            if (levelNode.children.length > 0) { // Only nodes with children can be expanded
                                levelNode.collapsed = false;
                            }
                        });
                    } else {
                        // Current node is expanded, so collapse all nodes at this level
                        nodesAtSameLevel.forEach(levelNode => {
                            if (levelNode.children.length > 0) { // Only nodes with children can be collapsed
                                levelNode.collapsed = true;
                            }
                        });
                    }
                    
                    // Save the project
                    await nodeProject.saveToStorage();
                    
                    // Use requestAnimationFrame to ensure DOM updates are processed properly
                    requestAnimationFrame(() => {
                        renderMultiProjectTree(); // Re-render tree to update expand/collapse state
                    });
                }
            }
        });
    });
}

/**
 * Calculate the maximum depth of a hierarchy in import data
 */
function calculateImportDataDepth(data: any): number {
    if (!data.children || !Array.isArray(data.children) || data.children.length === 0) {
        return 0; // No children = 0 additional depth
    }
    
    let maxChildDepth = 0;
    for (const child of data.children) {
        const childDepth = calculateImportDataDepth(child);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    
    return 1 + maxChildDepth; // 1 for this level + max child depth
}

/**
 * Import node data from JSON export and merge it into the specified target node
 */
function importNodeData(projectManager: ProjectManager, targetNodeId: string, importData: any): void {
    const targetNode = projectManager.findNodeById(targetNodeId);
    if (!targetNode) {
        throw new Error('Target node not found');
    }

    // Validate import data structure
    if (!importData || typeof importData !== 'object') {
        throw new Error('Invalid import data: Expected JSON object');
    }

    if (!importData.title) {
        throw new Error('Invalid import data: Missing title field');
    }

    // Validate that the imported data can be placed as a child of the target node
    const totalImportDepth = 1 + calculateImportDataDepth(importData); // +1 for the imported node itself
    const targetLevel = targetNode.level;
    const templateLength = targetNode.template.length;
    const availableDepth = templateLength - targetLevel - 1; // Available levels below target node
    
    if (totalImportDepth > availableDepth) {
        throw new Error(
            `Hierarchy mismatch: The imported content needs ${totalImportDepth} levels ` +
            `but can only fit ${availableDepth} levels as a child of the selected node.\n\n` +
            `Target node "${targetNode.title}" is at level ${targetLevel} in a ${templateLength}-level template ` +
            `(${targetNode.template.join(' → ')}).`
        );
    }

    // Create the imported node as a new child of the target node
    const importedNode = importChildNodeWithRootTemplate(projectManager, targetNode.id, importData.title);

    // Set imported node properties
    if (importData.content !== undefined) {
        importedNode.content = importData.content;
    }

    if (importData.context !== undefined) {
        importedNode.context = importData.context;
    }

    if (importData.generationPrompt !== undefined) {
        importedNode.generationPrompt = importData.generationPrompt;
    }
    
    // Restore generation metadata
    if (importData.creatorModel !== undefined) {
        importedNode.creatorModel = importData.creatorModel;
    }
    
    if (importData.generationHistory !== undefined && Array.isArray(importData.generationHistory)) {
        importedNode.generationHistory = importData.generationHistory;
    }
    
    if (importData.generationSessions !== undefined && Array.isArray(importData.generationSessions)) {
        importedNode.generationSessions = importData.generationSessions;
    }

    // Import children recursively
    if (importData.children && Array.isArray(importData.children)) {
        importData.children.forEach((childData: any, index: number) => {
            importChildNode(projectManager, importedNode.id, childData, index);
        });
    }

    // Propagate the correct template to all newly imported nodes
    propagateTemplateToSubtree(importedNode);

    // Save the project
    void projectManager.saveToStorage().catch(console.error);
}

/**
 * Recursively import a child node and its descendants
 */
function importChildNode(projectManager: ProjectManager, parentId: string, childData: any, index: number): void {
    if (!childData.title) {
        console.warn(`Skipping child node at index ${index}: Missing title`);
        return;
    }

    // Create the child node with root template (shallow copy)
    const newNode = importChildNodeWithRootTemplate(projectManager, parentId, childData.title);

    // Set node properties
    if (childData.content !== undefined) {
        newNode.content = childData.content;
    }

    if (childData.context !== undefined) {
        newNode.context = childData.context;
    }

    if (childData.generationPrompt !== undefined) {
        newNode.generationPrompt = childData.generationPrompt;
    }
    
    // Restore generation metadata for child nodes
    if (childData.creatorModel !== undefined) {
        newNode.creatorModel = childData.creatorModel;
    }
    
    if (childData.generationHistory !== undefined && Array.isArray(childData.generationHistory)) {
        newNode.generationHistory = childData.generationHistory;
    }
    
    if (childData.generationSessions !== undefined && Array.isArray(childData.generationSessions)) {
        newNode.generationSessions = childData.generationSessions;
    }

    // Recursively import children
    if (childData.children && Array.isArray(childData.children)) {
        childData.children.forEach((grandChildData: any, grandChildIndex: number) => {
            importChildNode(projectManager, newNode.id, grandChildData, grandChildIndex);
        });
    }
}

/**
 * Creates a new child node with the root template instead of parent template
 */
function importChildNodeWithRootTemplate(projectManager: ProjectManager, parentId: string, title: string): DocumentNode {
    const parent = projectManager.findNodeById(parentId);
    if (!parent) {
        throw new Error(`Parent node with ID "${parentId}" not found.`);
    }

    const newLevel = parent.level + 1;
    // Use root template (shallow copy) instead of parent template
    const rootTemplate = [...projectManager.rootNode.template];
    const newNode = new DocumentNode(newLevel, title, parent.id, rootTemplate);
    
    parent.children.push(newNode);
    
    return newNode;
}

/**
 * Propagates the correct template to all nodes in a subtree based on their position in the hierarchy
 */
function propagateTemplateToSubtree(rootNode: DocumentNode): void {
    const projectTemplate = projectManager?.rootNode.template;
    if (!projectTemplate) {
        console.warn('No project template available for propagation');
        return;
    }

    const propagateRecursively = (node: DocumentNode) => {
        // Update the node's template to be a shallow copy of the project template
        node.template = [...projectTemplate];
        
        // Recursively propagate to all children
        node.children.forEach(child => propagateRecursively(child));
    };

    propagateRecursively(rootNode);
}

/**
 * Unified generation handler that checks radio button state and calls appropriate generation method
 */
function handleUnifiedGeneration(node: DocumentNode): void {
    if (!projectManager) return;

    // Get the selected generation type from radio buttons
    const contentRadio = document.querySelector('input[name="generation-type"][value="content"]') as HTMLInputElement;
    const childrenRadio = document.querySelector('input[name="generation-type"][value="children"]') as HTMLInputElement;
    
    if (!contentRadio || !childrenRadio) {
        console.error('Generation type radio buttons not found');
        return;
    }

    const generateChildren = childrenRadio.checked;
    
    if (generateChildren) {
        // Generate all children
        if (node.isLeaf) {
            alert('This node is a leaf node and cannot have children.');
            return;
        }
        
        // Get checkbox states for children generation
        const includeContentCheckbox = getElementById('include-content-checkbox') as HTMLInputElement;
        const checkCoherenceCheckbox = getElementById('check-coherence-checkbox') as HTMLInputElement;
        const recursiveCheckbox = getElementById('recursive-checkbox') as HTMLInputElement;
        
        const includeContent = includeContentCheckbox?.checked ?? true;
        const checkCoherence = checkCoherenceCheckbox?.checked ?? false;
        const recursive = recursiveCheckbox?.checked ?? false;
        
        // Get count from input
        const countInput = getElementById('generation-count-input') as HTMLInputElement;
        const count = countInput?.value ? parseInt(countInput.value, 10) : node.getTemplateChildrenCount() || undefined;
        
        console.log(`🚀 Starting children generation for node "${node.title}" with options:`, {
            includeContent,
            checkCoherence,
            recursive,
            count
        });
        
        // Store the coherence check state for this generation
        if (checkCoherence) {
            (node as any)._pendingCoherenceCheck = true;
        }
        
        // Call the children generation method
        projectManager.getGenerationService().generateAllChildrenContent(node.id, includeContent, recursive);
        
    } else {
        // Generate this content
        console.log(`🚀 Starting content generation for node "${node.title}"`);
        
        // Call the single content generation method
        projectManager.getGenerationService().generateNodeContent(node.id, undefined, false);
    }
}



// === CHECKBOX STATE MANAGEMENT ===

// === CENTRALIZED EVENT LISTENER SYSTEM ===

/**
 * Mapping of button IDs to their event handlers
 */
const buttonHandlers: Record<string, (event: Event) => void> = {
    'node-generate-btn': (_e: Event) => {
        console.log('🎯 Generate button clicked');
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        handleUnifiedGeneration(node);
    },
    
    'default-prompt-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        const generationPromptTextArea = getElementById('node-generation-prompt') as HTMLTextAreaElement;
        const defaultPrompt = projectManager.getRawGenerationPrompt(node);
        generationPromptTextArea.value = defaultPrompt;
        node.generationPrompt = defaultPrompt;
    },
    
    'node-propagate-context-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        const propagateContextToDescendants = (parentNode: DocumentNode) => {
            const propagatedCount = { count: 0 };
            
            const propagateRecursively = (sourceNode: DocumentNode) => {
                for (const child of sourceNode.children) {
                    child.context = sourceNode.context;
                    propagatedCount.count++;
                    propagateRecursively(child);
                }
            };
            
            propagateRecursively(parentNode);
            return propagatedCount.count;
        };
        
        const propagatedCount = propagateContextToDescendants(node);
        
        if (propagatedCount > 0) {
            void projectManager.saveToStorage().catch(console.error);
            alert(`Context propagated to ${propagatedCount} descendant node(s).`);
            
            const currentNode = projectManager.findNodeById(selectedNodeId);
            if (currentNode) {
                const contextTextArea = getElementById('node-context') as HTMLTextAreaElement;
                if (contextTextArea) {
                    contextTextArea.value = currentNode.context;
                }
            }
        } else {
            alert('This node has no child nodes to propagate context to.');
        }
    },
    
    'node-extract-context-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node) return;
        
        import('./modal-manager').then(({ openExtractContextModal }) => {
            openExtractContextModal(projectManager!, node);
        }).catch((error: any) => {
            console.error('Failed to open extract context modal:', error);
            alert('Failed to open extract context dialog. Please try again.');
        });
    },
    
    'context-info-btn': (_e: Event) => {
        import('./modals/ContextInfoModal').then(({ ContextInfoModal }) => {
            const contextModal = new ContextInfoModal();
            void contextModal.open();
        }).catch((error: any) => {
            console.error('Failed to open context info modal:', error);
            alert('Failed to open context info dialog. Please try again.');
        });
    },
    
    'open-reader-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const selectedNode = projectManager.findNodeById(selectedNodeId);
        if (!selectedNode) return;
        
        openReaderView(projectManager, selectedNode, (nodeId: string) => {
            selectedNodeId = nodeId;
            renderNodeDetails();
        }).catch((error: any) => {
            console.error('Failed to open reader view:', error);
            alert('Failed to open reader view. Please try again.');
        });
    },
    
    'version-prev-btn': (_e: Event) => {
        if (currentVersionIndex > 0) {
            currentVersionIndex--;
            updateVersionNavigationUI();
            updateVersionContentDisplay();
        }
    },
    
    'version-next-btn': (_e: Event) => {
        if (currentVersionIndex < availableVersions.length - 1) {
            currentVersionIndex++;
            updateVersionNavigationUI();
            updateVersionContentDisplay();
        }
    },
    
    'use-this-version-btn': (_e: Event) => {
        if (!projectManager || !selectedNodeId) return;
        const node = projectManager.findNodeById(selectedNodeId);
        if (!node || !availableVersions[currentVersionIndex]) return;
        
        const selectedVersion = availableVersions[currentVersionIndex];
        node.content = selectedVersion.content;
        node.generationHistory = selectedVersion.generationHistory || [];
        node.generationSessions = selectedVersion.generationSessions || [];
        node.creatorModel = selectedVersion.creatorModel;
        
        void projectManager.saveToStorage().catch(console.error);
        
        initializeVersionNavigation(node);
        updateVersionNavigationUI();
        updateVersionContentDisplay();
        
        const contentTextArea = getElementById('node-content') as HTMLTextAreaElement;
        if (contentTextArea) {
            contentTextArea.value = node.content;
        }
        
        alert('Version restored as current content.');
    },
    
    'actions-dropdown-btn': (e: Event) => {
        console.log('🎯 Actions button clicked');
        e.preventDefault();
        e.stopPropagation();
        
        if (selectedNodeId && projectManager) {
            const selectedNode = projectManager.findNodeById(selectedNodeId);
            if (selectedNode) {
                showActionsDropdown(selectedNode);
            }
        }
    }
};

/**
 * Removes all event listeners from tracked buttons
 */
function removeAllListeners() {
    console.log('🧹 Removing all event listeners');
    
    // Remove click listeners from all tracked buttons
    Object.keys(buttonHandlers).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            const handler = (button as any)._expertHandler;
            if (handler) {
                button.removeEventListener('click', handler);
                delete (button as any)._expertHandler;
            }
        }
    });
    
    // Remove main content delegation listener
    const mainContent = getElementById('main-content');
    const existingListener = (mainContent as any)._expertEventListener;
    if (existingListener) {
        mainContent.removeEventListener('click', existingListener);
        delete (mainContent as any)._expertEventListener;
    }
}

/**
 * Attaches event listeners to all present buttons
 */
function attachAllListeners() {
    console.log('🔧 Attaching event listeners to all buttons');
    
    // Attach listeners to all buttons that exist in the DOM
    Object.entries(buttonHandlers).forEach(([buttonId, handler]) => {
        const button = document.getElementById(buttonId);
        if (button && !(button as any)._expertHandler) {
            const wrappedHandler = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                handler(e);
            };
            
            button.addEventListener('click', wrappedHandler);
            (button as any)._expertHandler = wrappedHandler;
        }
    });
    
    // Set up event delegation for placeholder buttons and other dynamic content
    const mainContent = getElementById('main-content');
    if (!(mainContent as any)._expertEventListener) {
        const delegationHandler = (e: Event) => {
            if (!e.target || !(e.target instanceof HTMLElement)) return;
            
            const button = e.target.closest('button');
            if (!button) return;
            
            // Handle placeholder buttons
            if (button.classList.contains('placeholder-btn')) {
                const placeholder = button.getAttribute('data-placeholder');
                if (placeholder && projectManager && selectedNodeId) {
                    showPlaceholderOverlay(placeholder, projectManager, selectedNodeId);
                }
                return;
            }
        };
        
        mainContent.addEventListener('click', delegationHandler);
        (mainContent as any)._expertEventListener = delegationHandler;
    }
}

// === CHECKBOX STATE MANAGEMENT ===