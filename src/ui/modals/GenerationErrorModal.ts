import { BaseModal } from './core/BaseModal';
import { ModalConfig, ModalHooks } from './types/ModalTypes';
import { escapeHtml } from './core/modal-utils';

export interface ErrorDetails {
    title: string;
    message: string;
    purpose?: string;
    model?: string;
    operation?: string;
    timestamp: Date;
    stack?: string;
    originalError?: unknown;
}

export class GenerationErrorModal extends BaseModal {
    private errorDetails: ErrorDetails;

    constructor(errorDetails: ErrorDetails, config: Partial<ModalConfig> = {}, hooks: ModalHooks = {}) {
        super({
            id: `error-modal-${Date.now()}`,
            title: '🚨 Generation Error',
            closable: true,
            backdrop: true,
            ...config
        }, hooks);
        this.errorDetails = errorDetails;
    }

    public render(): HTMLElement {
        const modalDiv = document.createElement('div');
        modalDiv.className = 'error-modal-wrapper';
        modalDiv.innerHTML = this.getModalContent();
        
        // Apply CSS styles
        const style = document.createElement('style');
        style.textContent = this.getModalCSS();
        modalDiv.appendChild(style);
        
        // Setup event listeners after render
        setTimeout(() => { this.setupEventListeners(); }, 0);
        
        return modalDiv;
    }


    private getModalContent(): string {
        const formattedTime = this.errorDetails.timestamp.toLocaleString();

        return `
            <div class="generation-error-content">
                <div class="error-header">
                    <div class="error-icon">⚠️</div>
                    <div class="error-title-section">
                        <h2 class="error-main-title">${escapeHtml(this.errorDetails.title)}</h2>
                        <div class="error-subtitle">An error occurred during AI generation</div>
                    </div>
                </div>

                <div class="error-details-section">
                    <div class="error-detail-card">
                        <h3>📋 Error Summary</h3>
                        <div class="error-message">${escapeHtml(this.errorDetails.message)}</div>
                    </div>

                    ${this.errorDetails.purpose ? `
                    <div class="error-detail-card">
                        <h3>🎯 Operation Details</h3>
                        <div class="error-metadata">
                            <div><strong>Purpose:</strong> ${escapeHtml(this.errorDetails.purpose)}</div>
                            ${this.errorDetails.model ? `<div><strong>Model:</strong> ${escapeHtml(this.errorDetails.model)}</div>` : ''}
                            ${this.errorDetails.operation ? `<div><strong>Operation:</strong> ${escapeHtml(this.errorDetails.operation)}</div>` : ''}
                            <div><strong>Time:</strong> ${formattedTime}</div>
                        </div>
                    </div>
                    ` : ''}

                    ${this.errorDetails.stack ? `
                    <div class="error-detail-card">
                        <h3>🔧 Technical Details</h3>
                        <div class="error-stack">
                            <pre>${escapeHtml(this.errorDetails.stack)}</pre>
                        </div>
                    </div>
                    ` : ''}
                </div>

                <div class="error-actions">
                    <button type="button" class="btn-primary" id="copy-error-btn">
                        📋 Copy Error Details
                    </button>
                    <button type="button" class="btn-secondary" id="retry-operation-btn">
                        🔄 Try Again
                    </button>
                    <button type="button" class="btn-secondary" id="close-error-btn">
                        ✖️ Close
                    </button>
                </div>

                <div class="error-tips">
                    <h3>💡 Common Solutions</h3>
                    <ul>
                        <li><strong>API Key Issues:</strong> Check that your OpenRouter API key is valid and has sufficient credits</li>
                        <li><strong>Model Availability:</strong> The selected model might be temporarily unavailable - try a different model</li>
                        <li><strong>Rate Limiting:</strong> If you're making many requests, wait a moment before retrying</li>
                        <li><strong>Network Issues:</strong> Check your internet connection and try again</li>
                        <li><strong>Content Policies:</strong> Ensure your prompt doesn't violate the model's content policies</li>
                    </ul>
                </div>
            </div>
        `;
    }

    protected setupEventListeners(): void {
        const copyBtn = this.element?.querySelector('#copy-error-btn');
        const retryBtn = this.element?.querySelector('#retry-operation-btn');
        const closeBtn = this.element?.querySelector('#close-error-btn');

        if (!(copyBtn instanceof HTMLButtonElement)) {
            throw new Error('Copy error button not found');
        }
        if (!(retryBtn instanceof HTMLButtonElement)) {
            throw new Error('Retry error button not found');
        }
        if (!(closeBtn instanceof HTMLButtonElement)) {
            throw new Error('Close error button not found');
        }

        copyBtn.addEventListener('click', () => { void this.copyErrorToClipboard(); });
        retryBtn.addEventListener('click', () => { this.handleRetry(); });
        closeBtn.addEventListener('click', () => { void this.close(); });
    }

    private formatErrorForCopy(): string {
        const timestamp = this.errorDetails.timestamp.toISOString();
        
        let errorText = `GENERATION ERROR REPORT
========================
Title: ${this.errorDetails.title}
Time: ${timestamp}

Error Message:
${this.errorDetails.message}
`;

        if (this.errorDetails.purpose) {
            errorText += `\nOperation Details:
Purpose: ${this.errorDetails.purpose}`;
            
            if (this.errorDetails.model) {
                errorText += `\nModel: ${this.errorDetails.model}`;
            }
            
            if (this.errorDetails.operation) {
                errorText += `\nOperation: ${this.errorDetails.operation}`;
            }
        }

        if (this.errorDetails.stack) {
            errorText += `\nTechnical Details:
${this.errorDetails.stack}`;
        }

        if (this.errorDetails.originalError) {
            errorText += `\nOriginal Error Object:
${JSON.stringify(this.errorDetails.originalError, null, 2)}`;
        }

        return errorText;
    }

    private async copyErrorToClipboard(): Promise<void> {
        const errorText = this.formatErrorForCopy();
        
        try {
            await navigator.clipboard.writeText(errorText);
            
            // Show temporary success feedback
            const copyBtn = this.element?.querySelector('#copy-error-btn');
            if (!(copyBtn instanceof HTMLButtonElement)) {
                throw new Error('Copy error button not found');
            }
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ Copied!';
            copyBtn.disabled = true;

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            
            // Fallback: show the text in a textarea for manual copying
            const fallbackDiv = document.createElement('div');
            fallbackDiv.innerHTML = `
                <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                           background: white; padding: 20px; border: 2px solid #ccc; z-index: 10001; 
                           width: 80%; max-width: 600px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <h3>Copy Error Details</h3>
                    <p>Unable to copy automatically. Please select all text below and copy manually:</p>
                    <textarea readonly style="width: 100%; height: 300px; font-family: monospace; font-size: 12px;">${escapeHtml(errorText)}</textarea>
                    <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 10px; padding: 5px 15px;">Close</button>
                </div>
            `;
            document.body.appendChild(fallbackDiv);
        }
    }

    private handleRetry(): void {
        // Emit a custom event that calling code can listen for
        const retryEvent = new CustomEvent('generation-error-retry', {
            detail: this.errorDetails
        });
        window.dispatchEvent(retryEvent);
        
        void this.close();
    }

    protected getModalCSS(): string {
        return `
            .generation-error-content {
                max-height: 70vh;
                overflow-y: auto;
                padding: 20px;
            }

            .error-header {
                display: flex;
                align-items: flex-start;
                gap: 15px;
                margin-bottom: 25px;
                padding: 20px;
                background: linear-gradient(135deg, #ff6b6b, #ee5a52);
                color: white;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(255, 107, 107, 0.2);
            }

            .error-icon {
                font-size: 32px;
                line-height: 1;
                flex-shrink: 0;
            }

            .error-title-section {
                flex: 1;
            }

            .error-main-title {
                margin: 0 0 5px 0;
                font-size: 24px;
                font-weight: 700;
                text-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            .error-subtitle {
                font-size: 14px;
                opacity: 0.9;
                font-weight: 500;
            }

            .error-details-section {
                margin-bottom: 25px;
            }

            .error-detail-card {
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 15px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }

            .error-detail-card h3 {
                margin: 0 0 10px 0;
                font-size: 16px;
                font-weight: 600;
                color: #495057;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .error-message {
                background: #fff;
                border: 1px solid #dee2e6;
                border-radius: 6px;
                padding: 12px;
                font-family: 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.4;
                color: #dc3545;
                word-break: break-word;
            }

            .error-metadata {
                display: flex;
                flex-direction: column;
                gap: 6px;
                font-size: 14px;
            }

            .error-metadata strong {
                color: #495057;
                font-weight: 600;
            }

            .error-stack {
                background: #2d3748;
                color: #e2e8f0;
                border-radius: 6px;
                padding: 12px;
                overflow-x: auto;
                max-height: 200px;
                overflow-y: auto;
            }

            .error-stack pre {
                margin: 0;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                line-height: 1.4;
                white-space: pre-wrap;
                word-break: break-word;
            }

            .error-actions {
                display: flex;
                gap: 12px;
                margin-bottom: 25px;
                flex-wrap: wrap;
            }

            .error-actions button {
                padding: 10px 20px;
                border-radius: 6px;
                border: none;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .error-actions .btn-primary {
                background: #007bff;
                color: white;
            }

            .error-actions .btn-primary:hover {
                background: #0056b3;
                transform: translateY(-1px);
            }

            .error-actions .btn-secondary {
                background: #6c757d;
                color: white;
            }

            .error-actions .btn-secondary:hover {
                background: #545b62;
                transform: translateY(-1px);
            }

            .error-actions button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none !important;
            }

            .error-tips {
                background: #e7f3ff;
                border: 1px solid #b3d7ff;
                border-radius: 8px;
                padding: 15px;
            }

            .error-tips h3 {
                margin: 0 0 12px 0;
                font-size: 16px;
                color: #0066cc;
                font-weight: 600;
            }

            .error-tips ul {
                margin: 0;
                padding-left: 20px;
                line-height: 1.6;
            }

            .error-tips li {
                margin-bottom: 8px;
                font-size: 14px;
            }

            .error-tips strong {
                color: #0066cc;
                font-weight: 600;
            }

            /* Responsive adjustments */
            @media (max-width: 768px) {
                .generation-error-content {
                    padding: 15px;
                }

                .error-header {
                    padding: 15px;
                }

                .error-main-title {
                    font-size: 20px;
                }

                .error-actions {
                    flex-direction: column;
                }

                .error-actions button {
                    width: 100%;
                    justify-content: center;
                }
            }
        `;
    }
} 