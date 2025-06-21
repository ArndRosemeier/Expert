import { ProjectManager } from "../ProjectManager";
import { DocumentNode } from "../DocumentNode";
import { getElementById } from "./dom-elements";
import * as state from '../state';
import { openModal } from './modal-manager';

export function renderProjectUI(project: ProjectManager) {
    // Clean up old listeners to prevent memory leaks
    project.off('nodeGenerationProgress', onProgress);
    project.off('nodeGenerationComplete', onComplete);

    getElementById('main-app').innerHTML = `
        <style>
            .project-grid {
                display: grid;
                grid-template-columns: 350px 1fr;
                gap: 2rem;
                height: calc(100vh - 120px);
            }
            .tree-panel, .detail-panel {
                background-color: white;
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06);
                overflow-y: auto;
            }
            .tree-panel h2 {
                margin-top: 0;
                font-size: 1.25rem;
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 0.75rem;
                margin-bottom: 1rem;
            }
            .project-tree-list {
                list-style: none;
                padding-left: 0;
            }
            .project-tree-list li {
                padding: 0.5rem 0.75rem;
                border-radius: 6px;
                cursor: pointer;
                margin-bottom: 0.25rem;
            }
            .project-tree-list li:hover {
                background-color: #f9fafb;
            }
            .selected-node {
                background-color: #4f46e5 !important;
                color: white;
            }
            .node-path { font-size: 0.8rem; color: #6b7280; margin-bottom: 1rem; }
            .details-section { margin-bottom: 1.5rem; }
            .details-section h4 { margin: 0 0 0.5rem 0; }
            .editable-text {
                width: 100%;
                min-height: 100px;
                padding: 0.75rem;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                resize: vertical;
            }
            #prompt-display-container {
                margin-top: 1rem;
                background-color: #f9fafb;
                padding: 1rem;
                border-radius: 8px;
                white-space: pre-wrap;
                display: none; /* Hidden by default */
            }
        </style>
        <div class="project-grid">
            <div id="project-tree-container" class="tree-panel">
                <h2>${project.projectTitle}</h2>
                <div id="project-tree"></div>
            </div>
            <div id="project-detail-container" class="detail-panel">
                <div id="project-details">Select a node to see its details.</div>
            </div>
        </div>
    `;

    const treeContainer = getElementById('project-tree');
    renderProjectTree(project.rootNode, treeContainer);

    treeContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const nodeLi = target.closest('li[data-node-id]');
        if (nodeLi) {
            const nodeId = nodeLi.getAttribute('data-node-id');
            if (nodeId) {
                document.querySelectorAll('.project-tree-list .selected-node').forEach(el => {
                    el.classList.remove('selected-node');
                });
                nodeLi.classList.add('selected-node');
                renderNodeDetails(project, nodeId);
            }
        }
    });

    project.on('nodeGenerationProgress', onProgress);
    project.on('nodeGenerationComplete', onComplete);
}

function renderProjectTree(rootNode: DocumentNode, container: HTMLElement) {
    container.innerHTML = '';
    const tree = document.createElement('ul');
    tree.className = 'project-tree-list';

    function buildTree(node: DocumentNode, parentElement: HTMLElement, level: number) {
        const listItem = document.createElement('li');
        listItem.textContent = node.title;
        listItem.dataset.nodeId = node.id;
        listItem.style.paddingLeft = `${level * 1.5 + 0.75}rem`;
        
        parentElement.appendChild(listItem);
        
        if (node.children.length > 0) {
            node.children.forEach(child => buildTree(child, parentElement, level + 1));
        }
    }

    buildTree(rootNode, tree, 0);
    container.appendChild(tree);
}

function getNodePath(project: ProjectManager, nodeId: string): string {
    let path = [];
    let currentNode = project.findNodeById(nodeId);
    while(currentNode) {
        path.unshift(currentNode.title);
        currentNode = currentNode.parentId ? project.findNodeById(currentNode.parentId) : null;
    }
    return path.join(' / ');
}

function renderNodeDetails(project: ProjectManager, nodeId: string) {
    const node = project.findNodeById(nodeId);
    if (!node) {
        getElementById('project-details').innerHTML = 'Node not found.';
        return;
    }

    const detailsContainer = getElementById('project-details');
    const isLeaf = node.isLeaf;
    const actionButtonLabel = isLeaf ? 'Generate' : `Expand ${node.childLevelName}`;
    
    detailsContainer.innerHTML = `
        <h3>${node.title}</h3>
        <div class="node-path">${getNodePath(project, nodeId)}</div>
        
        <div class="details-section">
            <h4>Summary</h4>
            <textarea id="node-summary" class="editable-text" placeholder="Enter a summary...">${node.summary}</textarea>
        </div>

        ${isLeaf ? `
            <div class="details-section">
                <h4>Content</h4>
                <textarea id="node-content" class="editable-text" style="min-height: 250px;" placeholder="Generated content will appear here...">${node.content}</textarea>
            </div>
        ` : ''}
        
        <button id="node-action-btn" class="button button-primary">${actionButtonLabel}</button>
        <button id="show-prompt-btn" class="button button-secondary" style="${node.generationPrompt ? '' : 'display: none;'}">Show Prompt</button>
        
        <div id="prompt-display-container">
            <h4>Generation Prompt:</h4>
            <pre><code>${node.generationPrompt || ''}</code></pre>
        </div>
    `;
    
    // --- Event Listeners for the new UI ---
    
    const actionBtn = getElementById<HTMLButtonElement>('node-action-btn');
    actionBtn.addEventListener('click', () => {
        actionBtn.textContent = 'Working...';
        actionBtn.disabled = true;

        if (isLeaf) {
            project.generateNodeContent(nodeId);
        } else {
            project.expandNode(nodeId);
        }
    });

    getElementById('show-prompt-btn').addEventListener('click', (e) => {
        const promptContainer = getElementById('prompt-display-container');
        const button = e.target as HTMLButtonElement;
        const isVisible = promptContainer.style.display === 'block';
        promptContainer.style.display = isVisible ? 'none' : 'block';
        button.textContent = isVisible ? 'Show Prompt' : 'Hide Prompt';
    });

    // Add listeners for saving summary/content on blur
    getElementById<HTMLTextAreaElement>('node-summary').addEventListener('blur', (e) => {
        node.summary = (e.target as HTMLTextAreaElement).value;
        project.saveToLocalStorage(); // Assumes this method will be added to ProjectManager
    });

    if (isLeaf) {
        getElementById<HTMLTextAreaElement>('node-content').addEventListener('blur', (e) => {
            node.content = (e.target as HTMLTextAreaElement).value;
            project.saveToLocalStorage(); // Assumes this method will be added to ProjectManager
        });
    }
}

const onProgress = (payload: { nodeId: string, content: string }) => {
    const selectedNodeElement = document.querySelector('.selected-node') as HTMLLIElement | null;
    if(selectedNodeElement && selectedNodeElement.dataset.nodeId === payload.nodeId) {
        const contentDisplay = getElementById<HTMLTextAreaElement>('node-content');
        if (contentDisplay) {
            contentDisplay.value = payload.content;
        }
    }
};

const onComplete = (payload: { nodeId: string, success: boolean, node?: DocumentNode, error?: any }) => {
    const selectedNodeElement = document.querySelector('.selected-node') as HTMLLIElement | null;
    if(selectedNodeElement && selectedNodeElement.dataset.nodeId === payload.nodeId) {
        const actionBtn = getElementById<HTMLButtonElement>('node-action-btn');
        if(actionBtn) {
            actionBtn.textContent = payload.node?.isLeaf ? 'Generate' : `Expand ${payload.node?.childLevelName}`;
            actionBtn.removeAttribute('disabled');
        }
        
        if (!payload.success) {
            console.error("Generation failed:", payload.error);
            alert(`Failed to generate content: ${payload.error}`);
        } else if (payload.node) {
            // Re-render details to show new prompt if it exists
            renderNodeDetails(state.getCurrentProject() as ProjectManager, payload.nodeId);
        }
    }
}; 