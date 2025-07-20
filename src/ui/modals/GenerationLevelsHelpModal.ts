import { BaseModal } from './core/BaseModal';

export class GenerationLevelsHelpModal extends BaseModal {
    constructor() {
        super({ 
            id: 'generation-levels-help-modal',
            closable: true,
            backdrop: true
        });
    }

    /**
     * Render method required by BaseModal
     */
    public render(): HTMLElement {
        const content = document.createElement('div');
        content.innerHTML = this.renderModalContent();
        return content;
    }

    /**
     * Render modal content
     */
    private renderModalContent(): string {
        return `
            <div class="modal-header">
                <h2>🎯 Generation Levels Guide</h2>
            </div>
            
            <div class="modal-body">
                <div class="help-intro">
                    <p>The <strong>Generation Levels</strong> control how the AI processes your project hierarchy. Think of them as different "passes" that work together:</p>
                </div>

                <div class="levels-grid-explanation">
                    <h3>📊 The Four Control Levels</h3>
                    
                    <div class="level-card draft-card">
                        <div class="level-header">
                            <span class="level-icon">📝</span>
                            <h4>Draft Level</h4>
                            <span class="level-badge primary">Structure Creator</span>
                        </div>
                        <p><strong>What it does:</strong> Creates child nodes (outline structure) down to this level.</p>
                        <p><strong>Example:</strong> Set to "Chapter" → AI creates chapter titles under your book</p>
                        <div class="tip">💡 This is usually your deepest level - it defines how detailed your structure gets.</div>
                    </div>

                    <div class="level-card content-card">
                        <div class="level-header">
                            <span class="level-icon">✍️</span>
                            <h4>Content Level</h4>
                            <span class="level-badge secondary">Content Writer</span>
                        </div>
                        <p><strong>What it does:</strong> Generates actual written content for nodes at or above this level.</p>
                        <p><strong>Example:</strong> Set to "Scene" → AI writes full content for scenes and everything above</p>
                        <div class="tip">💡 Must be ≤ Draft Level. Lower numbers = more content gets written.</div>
                    </div>

                    <div class="level-card context-card">
                        <div class="level-header">
                            <span class="level-icon">🔧</span>
                            <h4>Context Prune Level</h4>
                            <span class="level-badge tertiary">Context Cleaner</span>
                        </div>
                        <p><strong>What it does:</strong> Automatically cleans up inherited context to remove irrelevant information.</p>
                        <p><strong>Example:</strong> Removes context about other chapters when working on a specific scene</p>
                        <div class="tip">💡 Helps prevent context overload and keeps AI focused on relevant information.</div>
                    </div>

                    <div class="level-card coherence-card">
                        <div class="level-header">
                            <span class="level-icon">🔍</span>
                            <h4>Coherence Level</h4>
                            <span class="level-badge quaternary">Quality Checker</span>
                        </div>
                        <p><strong>What it does:</strong> Checks for contradictions between outline and expanded content.</p>
                        <p><strong>Example:</strong> Ensures chapter content actually matches the chapter's outline description</p>
                        <div class="tip">💡 Can be ≤ Draft Level. Triggers after all children of a level are completed.</div>
                    </div>
                </div>

                <div class="workflow-explanation">
                    <h3>🔄 How They Work Together</h3>
                    <div class="workflow-steps">
                        <div class="workflow-step">
                            <span class="step-number">1</span>
                            <div class="step-content">
                                <strong>Draft Creation:</strong> AI creates child nodes down to Draft Level
                            </div>
                        </div>
                        <div class="workflow-step">
                            <span class="step-number">2</span>
                            <div class="step-content">
                                <strong>Context Pruning:</strong> AI cleans inherited context for better focus
                            </div>
                        </div>
                        <div class="workflow-step">
                            <span class="step-number">3</span>
                            <div class="step-content">
                                <strong>Content Generation:</strong> AI writes actual content for specified levels
                            </div>
                        </div>
                        <div class="workflow-step">
                            <span class="step-number">4</span>
                            <div class="step-content">
                                <strong>Coherence Check:</strong> AI verifies consistency between outline and content
                            </div>
                        </div>
                    </div>
                </div>

                <div class="examples-section">
                    <h3>💡 Common Configurations</h3>
                    
                    <div class="example-config">
                        <h4>📚 Quick Structure + Content</h4>
                        <div class="config-grid">
                            <span>Draft Level: <strong>2 (Chapter)</strong></span>
                            <span>Content Level: <strong>1 (Part)</strong></span>
                            <span>Context Prune: <strong>2 (Chapter)</strong></span>
                            <span>Coherence: <strong>0 (Book)</strong></span>
                        </div>
                        <p><em>Creates chapters, writes content for parts and book, cleans chapter context, checks book coherence.</em></p>
                    </div>

                    <div class="example-config">
                        <h4>🎬 Detailed Scene Work</h4>
                        <div class="config-grid">
                            <span>Draft Level: <strong>3 (Scene)</strong></span>
                            <span>Content Level: <strong>3 (Scene)</strong></span>
                            <span>Context Prune: <strong>3 (Scene)</strong></span>
                            <span>Coherence: <strong>2 (Chapter)</strong></span>
                        </div>
                        <p><em>Creates detailed structure down to scenes, writes all content, cleans all context, checks chapter coherence.</em></p>
                    </div>

                    <div class="example-config">
                        <h4>🏗️ Structure Only</h4>
                        <div class="config-grid">
                            <span>Draft Level: <strong>3 (Scene)</strong></span>
                            <span>Content Level: <strong>None</strong></span>
                            <span>Context Prune: <strong>None</strong></span>
                            <span>Coherence: <strong>None</strong></span>
                        </div>
                        <p><em>Just creates the outline structure - no content generation, context cleaning, or coherence checking.</em></p>
                    </div>
                </div>

                <div class="important-rules">
                    <h3>⚠️ Important Rules</h3>
                    <ul>
                        <li><strong>Content Level ≤ Draft Level:</strong> You can't write content for levels that don't exist yet</li>
                        <li><strong>Coherence Level ≤ Draft Level:</strong> Coherence checks the parent of completed levels</li>
                        <li><strong>"None" option:</strong> Use this to skip any step completely</li>
                        <li><strong>Lower numbers = higher in hierarchy:</strong> 0 is the root, 1 is first level down, etc.</li>
                    </ul>
                </div>
            </div>
            
            <div class="modal-actions">
                <button class="button button-primary" id="close-help-modal-btn">
                    Got it! 👍
                </button>
            </div>
            
            <style>
                .help-intro {
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 1.5rem;
                    border-left: 4px solid #007bff;
                }
                
                .levels-grid-explanation {
                    margin-bottom: 2rem;
                }
                
                .level-card {
                    background: #fff;
                    border: 2px solid #e9ecef;
                    border-radius: 10px;
                    padding: 1rem;
                    margin-bottom: 1rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .level-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                }
                
                .level-icon {
                    font-size: 1.2rem;
                }
                
                .level-header h4 {
                    margin: 0;
                    flex: 1;
                    color: #212529;
                }
                
                .level-badge {
                    padding: 0.25rem 0.5rem;
                    border-radius: 12px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .level-badge.primary { background: #e3f2fd; color: #1976d2; }
                .level-badge.secondary { background: #f3e5f5; color: #7b1fa2; }
                .level-badge.tertiary { background: #e8f5e8; color: #388e3c; }
                .level-badge.quaternary { background: #fff3e0; color: #f57c00; }
                
                .draft-card { border-color: #2196f3; }
                .content-card { border-color: #9c27b0; }
                .context-card { border-color: #4caf50; }
                .coherence-card { border-color: #ff9800; }
                
                .tip {
                    background: #f8f9fa;
                    padding: 0.5rem;
                    border-radius: 6px;
                    font-size: 0.9rem;
                    margin-top: 0.5rem;
                    border-left: 3px solid #6c757d;
                }
                
                .workflow-explanation {
                    margin-bottom: 2rem;
                }
                
                .workflow-steps {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                
                .workflow-step {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    background: #f8f9fa;
                    padding: 0.75rem;
                    border-radius: 8px;
                }
                
                .step-number {
                    background: #007bff;
                    color: white;
                    width: 2rem;
                    height: 2rem;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    flex-shrink: 0;
                }
                
                .examples-section {
                    margin-bottom: 2rem;
                }
                
                .example-config {
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    padding: 1rem;
                    margin-bottom: 1rem;
                }
                
                .example-config h4 {
                    margin: 0 0 0.75rem 0;
                    color: #495057;
                }
                
                .config-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                }
                
                .config-grid span {
                    background: white;
                    padding: 0.5rem;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    border: 1px solid #e9ecef;
                }
                
                .example-config em {
                    color: #6c757d;
                    font-size: 0.9rem;
                }
                
                .important-rules {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 8px;
                    padding: 1rem;
                }
                
                .important-rules h3 {
                    margin-top: 0;
                    color: #856404;
                }
                
                .important-rules ul {
                    margin-bottom: 0;
                }
                
                .important-rules li {
                    margin-bottom: 0.5rem;
                    color: #856404;
                }
                
                .important-rules strong {
                    color: #533f03;
                }
            </style>
        `;
    }

    /**
     * Setup event handlers after modal opens
     */
    protected override setupEventHandlers(): void {
        super.setupEventHandlers();
        
        // Close button - use setTimeout to ensure DOM is ready
        setTimeout(() => {
            const closeBtn = document.getElementById('close-help-modal-btn') as HTMLButtonElement;
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    void this.close();
                });
            }
        }, 0);
    }
} 