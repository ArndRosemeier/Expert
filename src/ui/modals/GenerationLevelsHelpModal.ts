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
                <h2>🎚️ Generation Plan</h2>
            </div>
            
            <div class="modal-body">
                <div class="help-intro">
                    <p>Generation works with <strong>one main knob</strong>: pick how deep to build. Expert reads your project's template (the ordered level names like Book → Act → Chapter → Scene) and builds everything from this node down to the level you choose.</p>
                </div>

                <div class="levels-grid-explanation">
                    <h3>🪜 The level ladder</h3>
                    <div class="level-card draft-card">
                        <div class="level-header">
                            <span class="level-icon">🎚️</span>
                            <h4>Pick a target depth</h4>
                            <span class="level-badge primary">One knob</span>
                        </div>
                        <p><strong>What it does:</strong> The ladder shows the level names from this node down to the deepest level your template allows. Click a rung to set the target. Expert creates the structure down to that rung and writes its content — <em>outline</em> for the intermediate levels and <em>prose</em> for the deepest (leaf) level — checking coherence as it goes.</p>
                        <p><strong>Example:</strong> On a Book, pick <strong>Scene</strong> → Expert creates the Acts, Chapters and Scenes, writing outline for the Acts and Chapters and full prose for the Scenes.</p>
                        <div class="tip">💡 Depth is dynamic. A short story may only offer Chapter → Scene; an epic may offer Book → Act → Chapter → Scene. The ladder always matches the current node's template.</div>
                    </div>

                    <div class="level-card content-card">
                        <div class="level-header">
                            <span class="level-icon">👁️</span>
                            <h4>Live preview</h4>
                            <span class="level-badge secondary">Plain language</span>
                        </div>
                        <p><strong>What it does:</strong> The sentence under the ladder spells out exactly what Generate will do, and the Generate button mirrors it (e.g. "Generate down to Scene"). No guessing.</p>
                        <div class="tip">💡 If the target is this node's own level, Expert just writes this node's content — no sub-structure.</div>
                    </div>
                </div>

                <div class="examples-section">
                    <h3>⚙️ Advanced — the rare exceptions</h3>
                    <p>Almost everyone only needs the single depth knob. <strong>Advanced</strong> is there for the uncommon cases:</p>

                    <div class="example-config">
                        <h4>Decoupled depths</h4>
                        <p><em>Build the structure deeper than the prose — e.g. create Scenes everywhere but only write prose down to Chapter. Set Draft, Content and Coherence levels independently. The preview updates honestly to reflect the split.</em></p>
                    </div>

                    <div class="example-config">
                        <h4>Autofix severity</h4>
                        <p><em>Choose which contradiction severities are auto-fixed during generation. Usually left on and rarely changed.</em></p>
                    </div>

                    <div class="example-config">
                        <h4>Deterministic children</h4>
                        <p><em>Create child nodes deterministically instead of letting the model decide how many — useful when you want a fixed structure.</em></p>
                    </div>
                </div>

                <div class="important-rules">
                    <h3>⚠️ Good to know</h3>
                    <ul>
                        <li><strong>Content can't go deeper than structure:</strong> you can't write prose for levels that haven't been created.</li>
                        <li><strong>Coherence stops one level above the leaf:</strong> it checks a parent against its completed children.</li>
                        <li><strong>The depth knob keeps these in sync</strong> automatically; only Advanced lets them diverge.</li>
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