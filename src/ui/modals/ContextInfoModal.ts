import { BaseModal } from './core/BaseModal';

export class ContextInfoModal extends BaseModal {
    constructor() {
        super({
            id: 'context-info-modal',
            title: 'Understanding Context',
            maxWidth: '700px',
            maxHeight: '80vh'
        });
    }

    public render(): HTMLElement {
        const content = document.createElement('div');
        content.className = 'modal-body';
        content.innerHTML = `
            <style>
                .info-modal-content {
                    line-height: 1.6;
                    color: #333;
                }
                .info-modal-content h3 {
                    margin-top: 0;
                    margin-bottom: 1rem;
                    color: #2c3e50;
                    font-size: 1.4rem;
                }
                .feature-section {
                    margin-bottom: 1.5rem;
                    padding: 1rem;
                    background-color: #f8f9fa;
                    border-radius: 6px;
                    border-left: 4px solid #007cba;
                }
                .feature-section h4 {
                    margin-top: 0;
                    margin-bottom: 0.75rem;
                    color: #495057;
                    font-size: 1.1rem;
                }
                .feature-section p {
                    margin-bottom: 0.75rem;
                }
                .feature-section p:last-child {
                    margin-bottom: 0;
                }
                .feature-section pre {
                    background-color: #e9ecef;
                    padding: 0.75rem;
                    border-radius: 4px;
                    margin: 0.75rem 0;
                    overflow-x: auto;
                    border: 1px solid #dee2e6;
                }
                .feature-section code {
                    font-family: 'Courier New', monospace;
                    font-size: 0.9rem;
                    color: #d63384;
                }
                .feature-section ul {
                    margin: 0.5rem 0;
                    padding-left: 1.5rem;
                }
                .feature-section li {
                    margin-bottom: 0.25rem;
                }
                .note-section {
                    background-color: #e7f3ff;
                    padding: 1rem;
                    border-radius: 6px;
                    border-left: 4px solid #0ea5e9;
                    margin-top: 1rem;
                }
                .note-section p {
                    margin: 0;
                    color: #0c4a6e;
                }
                .modal-actions {
                    margin-top: 1.5rem;
                    text-align: center;
                    padding-top: 1rem;
                    border-top: 1px solid #dee2e6;
                }
            </style>
            <div class="info-modal-content">
                <h3>Understanding Context</h3>
                <p>The Context field provides additional information that gets passed to AI models when generating content for this node and its children.</p>
                
                <div class="feature-section">
                    <h4>🔧 Settings Override</h4>
                    <p>You can override AI settings for child node generation by adding:</p>
                    <pre><code>settingsoverride: profile_name</code></pre>
                    <p>This will use the specified profile settings when creating or generating content for child nodes. The original settings are automatically restored after generation.</p>
                    <p><strong>Example:</strong> Use <code>settingsoverride: uncensored</code> to use an uncensored model profile for sensitive content generation.</p>
                </div>

                <div class="feature-section">
                    <h4>📋 Simple Context Inheritance</h4>
                    <p>Context is now inherited simply from parent to child:</p>
                    <ul>
                        <li>When child nodes are created, they automatically receive an exact copy of their parent's context</li>
                        <li>No complex synthesis or transformation occurs</li>
                        <li>This ensures consistent guidance throughout the document hierarchy</li>
                    </ul>
                </div>

                <div class="feature-section">
                    <h4>🎯 Generation Context</h4>
                    <p>During content generation, the AI receives:</p>
                    <ul>
                        <li>The node's inherited context</li>
                        <li>Parent node content for structural understanding</li>
                        <li>Sibling titles and content for consistency</li>
                        <li>Any settings overrides specified in the context</li>
                    </ul>
                </div>

                <div class="note-section">
                    <p><strong>💡 Note:</strong> Context inheritance is immediate and automatic. Any context you set on a parent node will be copied exactly to all its children when they are created.</p>
                </div>
            </div>
            
            <div class="modal-actions">
                <button type="button" class="button button-primary" data-action="close">
                    Got it!
                </button>
            </div>
        `;

        return content;
    }
} 