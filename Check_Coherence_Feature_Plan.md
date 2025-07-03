# Check Coherence Feature - Implementation Plan

## 📋 Overview

The "Check coherence" feature analyzes consistency between parent node content (outline) and child node content (expanded text), using AI to identify contradictions and present findings in a user-friendly modal.

## 🎯 Requirements Summary

- **Action Button**: New "Check coherence" button in node actions menu
- **Node Eligibility**: Only works on nodes with children containing non-empty, non-draft content
- **Content Processing**: Collects all children content into flowing text
- **AI Analysis**: Uses rater model to identify contradictions between outline and expanded content
- **Results Format**: JSON array with `fact_in_outline` and `fact_in_expansion` fields
- **UI Presentation**: Modal with readable format and clipboard functionality

## 🏗️ Architecture Overview

### Components to Create
1. **CoherenceModal** - Modal for displaying results
2. **CoherenceService** - Service for content analysis
3. **Action Button Integration** - Add to actions dropdown
4. **Prompt Management** - Add coherence analysis prompt

### Integration Points
- **Actions Dropdown**: Add coherence check button
- **Modal System**: Use existing BaseModal pattern
- **AI Services**: Integrate with LoopOrchestrator/OpenRouterClient
- **Progress System**: Use existing progress modal patterns

## 📁 File Structure

```
src/
├── ui/modals/
│   ├── CoherenceModal.ts           # New modal for displaying results
│   └── services/
│       └── CoherenceService.ts     # New service for content analysis
├── ui/
│   └── project-ui.ts               # Add action button (modify existing)
├── PromptManager.ts                # Add coherence analysis prompt (modify existing)
└── types/
    └── CoherenceTypes.ts           # Type definitions for coherence analysis
```

## 🔧 Implementation Details

### 1. Type Definitions

**File**: `src/types/CoherenceTypes.ts`
```typescript
export interface CoherenceContradiction {
    fact_in_outline: string;
    fact_in_expansion: string;
}

export interface CoherenceAnalysisResult {
    contradictions: CoherenceContradiction[];
    hasContradictions: boolean;
    analysisTimestamp: Date;
    parentNodeId: string;
    childNodeIds: string[];
}

export interface CoherenceAnalysisRequest {
    parentContent: string;
    childrenContent: string;
    parentNodeTitle: string;
    childNodeTitles: string[];
}
```

### 2. Prompt Management Integration

**File**: `src/PromptManager.ts` (modifications)

Add to `OrchestratorPrompts` interface:
```typescript
coherence_analysis: string;
```

Add to `defaultPrompts`:
```typescript
coherence_analysis: `You are analyzing the coherence between an outline and its expanded content.

PARENT OUTLINE:
{{parent_content}}

EXPANDED CONTENT (from child sections):
{{children_content}}

TASK: Identify contradictions between the outline and the expanded content.

IMPORTANT INSTRUCTIONS:
- Focus on factual contradictions, not minor style differences
- Look for conflicts in: facts, dates, names, events, causation, logic, timelines
- Ignore differences in detail level (outline vs expansion is expected)
- Only report actual contradictions, not missing information
- Be precise and specific in your examples

RESPONSE FORMAT:
Return a JSON array where each contradiction has exactly these fields:
- "fact_in_outline": The specific fact or claim from the outline
- "fact_in_expansion": The contradictory fact or claim from the expanded content

If no contradictions found, return an empty array: []

EXAMPLE:
[
  {
    "fact_in_outline": "The meeting was scheduled for Tuesday",
    "fact_in_expansion": "The meeting occurred on Wednesday morning"
  }
]

JSON Response:`
```

Add to prompt placeholders:
```typescript
coherence_analysis: ['parent_content', 'children_content']
```

### 3. Coherence Service

**File**: `src/ui/modals/services/CoherenceService.ts`
```typescript
import { OpenRouterClient } from '../../../OpenRouterClient';
import { SettingsManager } from '../../../SettingsManager';
import { DocumentNode } from '../../../DocumentNode';
import { CoherenceAnalysisRequest, CoherenceAnalysisResult, CoherenceContradiction } from '../../../types/CoherenceTypes';

export class CoherenceService {
    private openRouterClient: OpenRouterClient;
    private settingsManager: SettingsManager;

    constructor(openRouterClient: OpenRouterClient, settingsManager: SettingsManager) {
        this.openRouterClient = openRouterClient;
        this.settingsManager = settingsManager;
    }

    /**
     * Check if a node is eligible for coherence analysis
     */
    isNodeEligible(node: DocumentNode): boolean {
        if (!node.children || node.children.length === 0) {
            return false;
        }

        // Check if any child has non-empty, non-draft content
        const hasValidChildren = node.children.some(child => {
            const content = child.content?.trim();
            return content && content.length > 0 && !content.toLowerCase().includes('[draft]');
        });

        return hasValidChildren;
    }

    /**
     * Get the reason why a node is not eligible (for user feedback)
     */
    getIneligibilityReason(node: DocumentNode): string {
        if (!node.children || node.children.length === 0) {
            return 'This node has no children to analyze.';
        }

        const validChildren = node.children.filter(child => {
            const content = child.content?.trim();
            return content && content.length > 0 && !content.toLowerCase().includes('[draft]');
        });

        if (validChildren.length === 0) {
            return 'All child nodes are empty or contain draft content.';
        }

        return 'Node is not eligible for coherence analysis.';
    }

    /**
     * Prepare analysis request from node and its children
     */
    private prepareAnalysisRequest(node: DocumentNode): CoherenceAnalysisRequest {
        const validChildren = node.children.filter(child => {
            const content = child.content?.trim();
            return content && content.length > 0 && !content.toLowerCase().includes('[draft]');
        });

        const childrenContent = validChildren
            .map(child => {
                const title = child.title ? `## ${child.title}\n\n` : '';
                return title + child.content;
            })
            .join('\n\n---\n\n');

        return {
            parentContent: node.content || '',
            childrenContent: childrenContent,
            parentNodeTitle: node.title || 'Untitled Node',
            childNodeTitles: validChildren.map(child => child.title || 'Untitled')
        };
    }

    /**
     * Perform coherence analysis using AI
     */
    async analyzeCoherence(node: DocumentNode): Promise<CoherenceAnalysisResult> {
        if (!this.isNodeEligible(node)) {
            throw new Error(this.getIneligibilityReason(node));
        }

        const request = this.prepareAnalysisRequest(node);
        
        // Create analysis prompt
        const prompts = this.settingsManager.getPrompts();
        const analysisPrompt = prompts.coherence_analysis
            .replace(/\{\{parent_content\}\}/g, request.parentContent)
            .replace(/\{\{children_content\}\}/g, request.childrenContent);

        try {
            // Use rater model for analysis
            const response = await this.openRouterClient.chat('rater', analysisPrompt);
            
            // Parse JSON response
            const contradictions = this.parseAnalysisResponse(response);
            
            return {
                contradictions,
                hasContradictions: contradictions.length > 0,
                analysisTimestamp: new Date(),
                parentNodeId: node.id,
                childNodeIds: node.children.map(child => child.id)
            };
        } catch (error) {
            console.error('Coherence analysis failed:', error);
            throw new Error('Failed to analyze coherence. Please try again.');
        }
    }

    /**
     * Parse AI response and extract contradictions
     */
    private parseAnalysisResponse(response: string): CoherenceContradiction[] {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('No JSON array found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);
            
            if (!Array.isArray(parsed)) {
                throw new Error('Response is not an array');
            }

            // Validate and normalize contradictions
            return parsed.map((item, index) => {
                if (!item || typeof item !== 'object') {
                    throw new Error(`Invalid contradiction at index ${index}`);
                }

                const contradiction: CoherenceContradiction = {
                    fact_in_outline: String(item.fact_in_outline || '').trim(),
                    fact_in_expansion: String(item.fact_in_expansion || '').trim()
                };

                if (!contradiction.fact_in_outline || !contradiction.fact_in_expansion) {
                    throw new Error(`Missing required fields in contradiction at index ${index}`);
                }

                return contradiction;
            });
        } catch (error) {
            console.error('Failed to parse coherence analysis response:', error);
            console.error('Response content:', response);
            throw new Error('Failed to parse analysis results. The AI response may be malformed.');
        }
    }
}
```

### 4. Coherence Modal

**File**: `src/ui/modals/CoherenceModal.ts`
```typescript
import { BaseModal } from './core/BaseModal';
import { CoherenceAnalysisResult, CoherenceContradiction } from '../../types/CoherenceTypes';
import { DocumentNode } from '../../DocumentNode';

export class CoherenceModal extends BaseModal {
    private analysisResult: CoherenceAnalysisResult | null = null;
    private parentNode: DocumentNode | null = null;

    constructor() {
        super('coherence-modal');
    }

    /**
     * Open modal with coherence analysis results
     */
    async open(result: CoherenceAnalysisResult, parentNode: DocumentNode): Promise<void> {
        this.analysisResult = result;
        this.parentNode = parentNode;
        
        const content = this.renderModalContent();
        await super.open(content);
        
        this.setupEventListeners();
    }

    /**
     * Render modal content
     */
    private renderModalContent(): string {
        if (!this.analysisResult || !this.parentNode) {
            return '<p>No analysis results available.</p>';
        }

        const { contradictions, hasContradictions, analysisTimestamp } = this.analysisResult;
        const nodeTitle = this.parentNode.title || 'Untitled Node';
        
        const headerContent = `
            <div class="modal-header">
                <h2>Coherence Analysis Results</h2>
                <button class="close-btn" id="close-coherence-modal">&times;</button>
            </div>
        `;

        const statusContent = hasContradictions 
            ? `<div class="analysis-status error">
                <strong>⚠️ Found ${contradictions.length} contradiction${contradictions.length === 1 ? '' : 's'}</strong>
                <p>The outline and expanded content have some inconsistencies.</p>
               </div>`
            : `<div class="analysis-status success">
                <strong>✅ No contradictions found</strong>
                <p>The outline and expanded content are coherent.</p>
               </div>`;

        const infoContent = `
            <div class="analysis-info">
                <p><strong>Analyzed Node:</strong> ${nodeTitle}</p>
                <p><strong>Analysis Time:</strong> ${analysisTimestamp.toLocaleString()}</p>
                <p><strong>Child Nodes:</strong> ${this.analysisResult.childNodeIds.length}</p>
            </div>
        `;

        const contradictionsContent = hasContradictions 
            ? this.renderContradictions(contradictions)
            : '';

        const actionsContent = `
            <div class="modal-actions">
                <button class="button button-secondary" id="copy-coherence-results">
                    📋 Copy to Clipboard
                </button>
                <button class="button button-primary" id="close-coherence-modal-btn">
                    Close
                </button>
            </div>
        `;

        return `
            ${headerContent}
            <div class="modal-body">
                ${statusContent}
                ${infoContent}
                ${contradictionsContent}
            </div>
            ${actionsContent}
        `;
    }

    /**
     * Render contradictions list
     */
    private renderContradictions(contradictions: CoherenceContradiction[]): string {
        const contradictionItems = contradictions.map((contradiction, index) => `
            <div class="contradiction-item">
                <h4>Contradiction ${index + 1}</h4>
                <div class="contradiction-details">
                    <div class="outline-fact">
                        <strong>In Outline:</strong>
                        <p>${this.escapeHtml(contradiction.fact_in_outline)}</p>
                    </div>
                    <div class="expansion-fact">
                        <strong>In Expanded Content:</strong>
                        <p>${this.escapeHtml(contradiction.fact_in_expansion)}</p>
                    </div>
                </div>
            </div>
        `).join('');

        return `
            <div class="contradictions-section">
                <h3>Found Contradictions</h3>
                <div class="contradictions-list">
                    ${contradictionItems}
                </div>
            </div>
        `;
    }

    /**
     * Generate readable text for clipboard
     */
    private generateClipboardText(): string {
        if (!this.analysisResult || !this.parentNode) {
            return 'No analysis results available.';
        }

        const { contradictions, hasContradictions, analysisTimestamp } = this.analysisResult;
        const nodeTitle = this.parentNode.title || 'Untitled Node';
        
        let text = `COHERENCE ANALYSIS RESULTS\n`;
        text += `${'='.repeat(30)}\n\n`;
        text += `Node: ${nodeTitle}\n`;
        text += `Analysis Time: ${analysisTimestamp.toLocaleString()}\n`;
        text += `Child Nodes Analyzed: ${this.analysisResult.childNodeIds.length}\n\n`;

        if (hasContradictions) {
            text += `STATUS: ⚠️ Found ${contradictions.length} contradiction${contradictions.length === 1 ? '' : 's'}\n\n`;
            
            contradictions.forEach((contradiction, index) => {
                text += `CONTRADICTION ${index + 1}:\n`;
                text += `${'-'.repeat(20)}\n`;
                text += `In Outline: ${contradiction.fact_in_outline}\n`;
                text += `In Expanded Content: ${contradiction.fact_in_expansion}\n\n`;
            });
        } else {
            text += `STATUS: ✅ No contradictions found\n`;
            text += `The outline and expanded content are coherent.\n\n`;
        }

        return text;
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        // Close button handlers
        const closeBtn = document.getElementById('close-coherence-modal');
        const closeModalBtn = document.getElementById('close-coherence-modal-btn');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.close());
        }

        // Copy to clipboard handler
        const copyBtn = document.getElementById('copy-coherence-results');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyToClipboard());
        }

        // ESC key handler
        document.addEventListener('keydown', this.handleEscKey.bind(this));
    }

    /**
     * Handle ESC key press
     */
    private handleEscKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.close();
        }
    }

    /**
     * Copy results to clipboard
     */
    private async copyToClipboard(): Promise<void> {
        try {
            const text = this.generateClipboardText();
            await navigator.clipboard.writeText(text);
            
            // Show success feedback
            const copyBtn = document.getElementById('copy-coherence-results');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            alert('Failed to copy to clipboard. Please try again.');
        }
    }

    /**
     * Close modal and cleanup
     */
    async close(): Promise<void> {
        // Remove event listeners
        document.removeEventListener('keydown', this.handleEscKey.bind(this));
        
        // Clear data
        this.analysisResult = null;
        this.parentNode = null;
        
        await super.close();
    }

    /**
     * Escape HTML content
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

### 5. Action Button Integration

**File**: `src/ui/project-ui.ts` (modifications)

Add to `createActionsDropdownContent()` function:
```typescript
// Add coherence check button in Structure section
const coherenceBtn = coherenceService.isNodeEligible(node) 
    ? `<button class="dropdown-item" id="coherence-check-btn" data-node-id="${node.id}">
        <span class="dropdown-item-icon">🔍</span>
        Check Coherence
       </button>`
    : `<button class="dropdown-item disabled" title="${coherenceService.getIneligibilityReason(node)}">
        <span class="dropdown-item-icon">🔍</span>
        Check Coherence
       </button>`;
```

Add to action button event handlers:
```typescript
// Coherence check handler
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'coherence-check-btn') {
        const nodeId = e.target.getAttribute('data-node-id');
        if (nodeId) {
            await handleCoherenceCheck(nodeId);
        }
    }
});

/**
 * Handle coherence check action
 */
async function handleCoherenceCheck(nodeId: string): Promise<void> {
    const activeProject = state.getActiveProject();
    if (!activeProject) {
        alert('No active project found.');
        return;
    }

    const node = activeProject.findNodeById(nodeId);
    if (!node) {
        alert('Node not found.');
        return;
    }

    // Create service instances
    const coherenceService = new CoherenceService(
        state.getOpenRouterClient(),
        state.getSettingsManager()
    );

    // Check eligibility
    if (!coherenceService.isNodeEligible(node)) {
        alert(coherenceService.getIneligibilityReason(node));
        return;
    }

    // Show progress modal
    const progressModal = showProgressModal('Analyzing coherence...');

    try {
        // Perform analysis
        const result = await coherenceService.analyzeCoherence(node);
        
        // Hide progress modal
        closeProgressModal(progressModal);
        
        // Show results in modal
        const coherenceModal = new CoherenceModal();
        await coherenceModal.open(result, node);
        
    } catch (error) {
        console.error('Coherence analysis failed:', error);
        closeProgressModal(progressModal);
        alert('Coherence analysis failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}
```

### 6. Modal Styling

**File**: `src/ui/enhanced-layout.css` (additions)
```css
/* Coherence Modal Styles */
.coherence-modal .modal-body {
    max-height: 70vh;
    overflow-y: auto;
}

.analysis-status {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
}

.analysis-status.success {
    background-color: #f0f9ff;
    border: 1px solid #059669;
    color: #065f46;
}

.analysis-status.error {
    background-color: #fef2f2;
    border: 1px solid #dc2626;
    color: #991b1b;
}

.analysis-info {
    background-color: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
}

.analysis-info p {
    margin: 0.5rem 0;
}

.contradictions-section {
    margin-top: 1.5rem;
}

.contradictions-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.contradiction-item {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    background-color: #fafafa;
}

.contradiction-item h4 {
    margin: 0 0 0.75rem 0;
    color: #dc2626;
}

.contradiction-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
}

.outline-fact, .expansion-fact {
    padding: 0.75rem;
    border-radius: 6px;
}

.outline-fact {
    background-color: #e0f2fe;
    border-left: 4px solid #0284c7;
}

.expansion-fact {
    background-color: #fff7ed;
    border-left: 4px solid #ea580c;
}

.outline-fact strong, .expansion-fact strong {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
}

.outline-fact p, .expansion-fact p {
    margin: 0;
    line-height: 1.5;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
    .contradiction-details {
        grid-template-columns: 1fr;
    }
}
```

## 🔄 Integration Steps

### Phase 1: Core Implementation
1. Create type definitions (`CoherenceTypes.ts`)
2. Add prompt to `PromptManager.ts`
3. Implement `CoherenceService.ts`
4. Create `CoherenceModal.ts`

### Phase 2: UI Integration
1. Add action button to `project-ui.ts`
2. Add event handlers and progress integration
3. Add modal styling to `enhanced-layout.css`
4. Test action button states and eligibility

### Phase 3: Testing & Refinement
1. Test with various node structures
2. Validate JSON parsing robustness
3. Test clipboard functionality
4. Verify modal responsiveness
5. Test error handling scenarios

## 🧪 Testing Scenarios

### Valid Scenarios
1. **Parent with coherent children**: Should return empty array
2. **Parent with contradictory children**: Should return contradiction list
3. **Mixed content**: Some coherent, some contradictory sections

### Edge Cases
1. **Empty parent content**: Should still analyze children consistency
2. **Single child**: Should work with one child node
3. **Very long content**: Should handle large text volumes
4. **Malformed AI response**: Should handle JSON parsing errors

### Error Scenarios
1. **No children**: Button should be disabled
2. **All draft children**: Button should be disabled with explanation
3. **Network failure**: Should show error message
4. **Invalid JSON response**: Should show parsing error

## 📊 Success Metrics

- **Functional**: Button appears correctly based on node eligibility
- **Usability**: Results are clear and actionable
- **Reliability**: Robust error handling and recovery

## 🔒 Security Considerations

- **Input Sanitization**: All user content is properly escaped in UI
- **API Security**: Uses existing OpenRouter client security patterns

## 🚀 Future Enhancements

1. **Batch Analysis**: Analyze multiple nodes simultaneously
3. **Smart Suggestions**: AI-powered suggestions for fixing contradictions
4. **Export Options**: Export analysis results to different formats
5. **Integration with Generation**: Incorporate coherence checks into content generation workflow

---

*This plan follows the established architectural patterns in the Expert application and integrates seamlessly with the existing modal system, AI services, and UI components.* 