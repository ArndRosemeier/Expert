/**
 * Enhanced Project UI with robust event handling
 * 
 * This demonstrates how to use the EventManager to prevent event listener loss
 * and provides patterns for migrating existing code.
 */

import { eventManager } from './event-manager';
import { getElementById } from './dom-elements';
import type { ProjectManager } from '../ProjectManager';


// Re-export original functions for compatibility
export { 
    renderProjectUI, 
    renderNodeDetails, 
    initializeProjectUI,
    refreshGlobalProfileSelector 
} from './project-ui';

/**
 * Enhanced setup that uses EventManager for robust event handling
 * Call this instead of the original setupEventListeners
 */
export function setupEnhancedEventListeners(): void {
    console.log('🔧 Setting up enhanced event listeners with EventManager...');
    
    // Get the main content container for event delegation
    const mainContent = getElementById('main-content');
    if (!mainContent) {
        console.error('❌ Main content container not found');
        return;
    }

    // === GENERATION PANEL BUTTONS (Event Delegation) ===
    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#default-prompt-btn',
        handleDefaultPromptClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#node-generate-btn',
        handleNodeGenerateClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#node-generate-all-btn',
        handleNodeGenerateAllClick
    );

    // === CONTEXT BUTTONS ===
    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#node-propagate-context-btn',
        handlePropagateContextClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#node-extract-context-btn',
        handleExtractContextClick
    );

    // === NODE ACTION BUTTONS ===
    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#delete-node-btn',
        handleDeleteNodeClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#delete-subnodes-btn',
        handleDeleteSubnodesClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#add-child-node-btn',
        handleAddChildNodeClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#export-node-btn',
        handleExportNodeClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#import-node-btn',
        handleImportNodeClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#chat-node-btn',
        handleChatNodeClick
    );

    // === PLACEHOLDER BUTTONS ===
    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '.placeholder-btn',
        handlePlaceholderClick
    );

    // === VERSION NAVIGATION ===
    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#version-prev-btn',
        handleVersionPrevClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#version-next-btn',
        handleVersionNextClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '#use-this-version-btn',
        handleUseVersionClick
    );

    // === CHECKBOXES AND INPUTS ===
    eventManager.addDelegatedEvent(
        mainContent,
        'change',
        '#include-content-checkbox',
        handleIncludeContentChange
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'change',
        '#recursive-checkbox',
        handleRecursiveChange
    );



    // === TEXT AREAS (Input events) ===
    eventManager.addDelegatedEvent(
        mainContent,
        'input',
        '#node-content',
        handleContentInput
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'input',
        '#node-context',
        handleContextInput
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'input',
        '#node-generation-prompt',
        handleGenerationPromptInput
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'input',
        '#node-title-display',
        handleTitleInput
    );

    // === TREE NAVIGATION ===
    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '.tree-node',
        handleTreeNodeClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'click',
        '.tree-expand-btn',
        handleTreeExpandClick
    );

    eventManager.addDelegatedEvent(
        mainContent,
        'dblclick',
        '.tree-expand-btn',
        handleTreeExpandDoubleClick
    );

    console.log('✅ Enhanced event listeners set up successfully');
    
}

/**
 * Safe button update that preserves event listeners
 */
export function updateGenerateButton(
    _nodeId: string, 
    state: 'generating' | 'idle' | 'disabled',
    _projectManager?: ProjectManager
): void {
    const buttonId = 'node-generate-btn';
    
    switch (state) {
        case 'generating':
            eventManager.updateButtonContent(buttonId, 
                '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span>...',
                { disabled: true, className: 'button button-primary' }
            );
            break;
            
        case 'idle':
            eventManager.updateButtonContent(buttonId, 
                'Generate',
                { disabled: false, className: 'button button-primary' }
            );
            break;
            
        case 'disabled':
            eventManager.updateButtonContent(buttonId, 
                '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; vertical-align: middle; margin-right: 8px;"></span>...',
                { disabled: true, className: 'button button-primary' }
            );
            break;
    }
}

/**
 * Safe DOM replacement for node details
 */
export function replaceNodeDetailsContent(htmlContent: string): void {
    eventManager.replaceContent('node-details', htmlContent, {
        afterReplace: () => {
            console.log('🔄 Node details content replaced, event delegation still active');
        }
    });
}

// === EVENT HANDLERS ===
// These handlers extract the logic from the original setupEventListeners function

function handleDefaultPromptClick(_event: Event): void {
    console.log('🔧 Default prompt clicked - implementation needed');
    // TODO: Access project state through proper state management
    // This handler needs access to current project and selected node
}

function handleNodeGenerateClick(_event: Event): void {
    console.log('🚀 Node generate clicked - implementation needed');
    // TODO: Access project state through proper state management
    // This handler needs access to current project and selected node
}

function handleNodeGenerateAllClick(_event: Event): void {
    console.log('🚀 Node generate all clicked - implementation needed');
    // TODO: Access project state through proper state management
    // This handler needs access to current project and selected node
}

// Placeholder implementations for other handlers
// These would be extracted from the original setupEventListeners function

function handlePropagateContextClick(_event: Event): void {
    console.log('🔄 Propagate context clicked');
    // TODO: Extract implementation from original code
}

function handleExtractContextClick(_event: Event): void {
    console.log('🔄 Extract context clicked');
    // TODO: Extract implementation from original code
}

function handleDeleteNodeClick(_event: Event): void {
    console.log('🗑️ Delete node clicked');
    // TODO: Extract implementation from original code
}

function handleDeleteSubnodesClick(_event: Event): void {
    console.log('🗂️ Delete subnodes clicked');
    // TODO: Extract implementation from original code
}

function handleAddChildNodeClick(_event: Event): void {
    console.log('➕ Add child node clicked');
    // TODO: Extract implementation from original code
}

function handleExportNodeClick(_event: Event): void {
    console.log('📤 Export node clicked');
    // TODO: Extract implementation from original code
}

function handleImportNodeClick(_event: Event): void {
    console.log('📥 Import node clicked');
    // TODO: Extract implementation from original code
}

function handleChatNodeClick(_event: Event): void {
    console.log('💬 Chat node clicked');
    // TODO: Extract implementation from original code
}

function handlePlaceholderClick(_event: Event): void {
    console.log('🔍 Placeholder clicked');
    // TODO: Extract implementation from original code
}

function handleVersionPrevClick(_event: Event): void {
    // Note: Version navigation is now handled in project-ui.ts
    // This handler is no longer needed but kept for compatibility
}

function handleVersionNextClick(_event: Event): void {
    // Note: Version navigation is now handled in project-ui.ts
    // This handler is no longer needed but kept for compatibility
}

function handleUseVersionClick(_event: Event): void {
    // Note: Version navigation is now handled in project-ui.ts
    // This handler is no longer needed but kept for compatibility
}

function handleIncludeContentChange(_event: Event): void {
    console.log('📄 Include content changed');
    // TODO: Extract implementation from original code
}

function handleRecursiveChange(_event: Event): void {
    console.log('🔄 Recursive changed');
    // TODO: Extract implementation from original code
}



function handleContentInput(_event: Event): void {
    console.log('📝 Content input');
    // TODO: Extract implementation from original code
}

function handleContextInput(_event: Event): void {
    console.log('🎯 Context input');
    // TODO: Extract implementation from original code
}

function handleGenerationPromptInput(_event: Event): void {
    console.log('🔧 Generation prompt input');
    // TODO: Extract implementation from original code
}

function handleTitleInput(_event: Event): void {
    console.log('📝 Title input');
    // TODO: Extract implementation from original code
}

function handleTreeNodeClick(_event: Event): void {
    console.log('🌳 Tree node clicked');
    // TODO: Extract implementation from original code
}

function handleTreeExpandClick(_event: Event): void {
    console.log('➕ Tree expand clicked');
    // TODO: Extract implementation from original code
}

function handleTreeExpandDoubleClick(_event: Event): void {
    console.log('➕➕ Tree expand double clicked');
    // TODO: Extract implementation from original code
}

/**
 * Cleanup function - call this when shutting down or switching projects
 */
export function cleanupEnhancedEventListeners(): void {
    console.log('🧹 Cleaning up enhanced event listeners...');
    eventManager.cleanup();
    console.log('✅ Enhanced event listeners cleaned up');
}

/**
 * Debug function to check event listener status
 */
export function debugEventListeners(): void {
    console.log('🔍 Event Manager Debug Info:', eventManager.getDebugInfo());
} 