import { GenerationErrorModal, ErrorDetails } from '../GenerationErrorModal';

export class GenerationErrorService {
    private static instance: GenerationErrorService | null = null;

    private constructor() {
        // Private constructor for singleton
    }

    /**
     * Check if an error is actually an abort operation (not a real error for the user)
     */
    private isAbortError(error: Error): boolean {
        return error.name === 'AbortError' || 
               error.message.includes('Request was aborted') ||
               error.message.includes('Generation aborted by user') ||
               error.message.includes('aborted');
    }

    /**
     * Show a simple abort notification instead of an error modal
     */
    private showAbortNotification(operation?: string): void {
        // Create a simple toast-style notification
        const notification = document.createElement('div');
        notification.className = 'abort-notification';
        notification.innerHTML = `
            <div class="abort-content">
                <span class="abort-icon">⏹️</span>
                <span class="abort-message">${operation ? `${operation} aborted` : 'Operation aborted'}</span>
            </div>
        `;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #6c757d;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            animation: slideInRight 0.3s ease-out;
        `;
        
        // Add animation styles
        if (!document.querySelector('#abort-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'abort-notification-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
                .abort-content {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .abort-icon {
                    font-size: 16px;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * Central error handling - checks for abort and shows appropriate UI
     */
    private async handleError(error: Error, errorDetails: Omit<ErrorDetails, 'originalError' | 'timestamp'>, abortMessage?: string): Promise<void> {
        // Check if this is an abort operation, not a real error
        if (this.isAbortError(error)) {
            this.showAbortNotification(abortMessage);
            return;
        }

        // Always log the error to console for debugging
        console.error(`${errorDetails.title}:`, error);
        if (errorDetails.operation) {
            console.error(`Operation: ${errorDetails.operation}`);
        }
        if (errorDetails.purpose) {
            console.error(`Purpose: ${errorDetails.purpose}`);
        }

        // Show the full error modal
        const fullErrorDetails: ErrorDetails = {
            ...errorDetails,
            originalError: error,
            timestamp: new Date(),
            ...(error.stack && { stack: error.stack })
        };

        const modal = new GenerationErrorModal(fullErrorDetails);
        await modal.open();
    }

    public static getInstance(): GenerationErrorService {
        if (!GenerationErrorService.instance) {
            GenerationErrorService.instance = new GenerationErrorService();
        }
        return GenerationErrorService.instance;
    }

    /**
     * Show a detailed error modal for generation failures
     */
    public async showGenerationError(errorDetails: Partial<ErrorDetails> & { message: string }): Promise<void> {
        const fullErrorDetails: ErrorDetails = {
            title: 'Generation Failed',
            timestamp: new Date(),
            ...errorDetails
        };

        const modal = new GenerationErrorModal(fullErrorDetails);
        await modal.open();
    }

    /**
     * Show error for OpenRouter API failures
     */
    public async showOpenRouterError(error: Error, purpose?: string, model?: string): Promise<void> {
        await this.handleError(error, {
            title: 'OpenRouter API Error',
            message: this.formatErrorMessage(error),
            ...(purpose && { purpose }),
            ...(model && { model })
        }, 'Generation');
    }

    /**
     * Show error for content generation failures
     */
    public async showContentGenerationError(error: Error, nodeTitle?: string, purpose?: string): Promise<void> {
        await this.handleError(error, {
            title: `Content Generation Failed${nodeTitle ? ` for "${nodeTitle}"` : ''}`,
            message: this.formatErrorMessage(error),
            operation: 'Content Generation',
            ...(purpose && { purpose })
        }, `Content generation${nodeTitle ? ` for "${nodeTitle}"` : ''}`);
    }

    /**
     * Show error for project generation failures
     */
    public async showProjectGenerationError(error: Error, description?: string): Promise<void> {
        await this.handleError(error, {
            title: 'Project Generation Failed',
            message: this.formatErrorMessage(error),
            purpose: 'Project Creation',
            operation: description ? `Generating project from: "${description}"` : 'Project Generation'
        }, 'Project generation');
    }

    /**
     * Show error for streaming chat failures
     */
    public async showStreamingError(error: Error, purpose: string, model?: string): Promise<void> {
        await this.handleError(error, {
            title: 'Streaming Error',
            message: this.formatErrorMessage(error),
            purpose,
            operation: 'Streaming Chat',
            ...(model && { model })
        }, 'Streaming chat');
    }

    /**
     * Show a generic AI error with context
     */
    public async showAIError(error: Error, context: {
        title?: string;
        purpose?: string;
        model?: string;
        operation?: string;
    } = {}): Promise<void> {
        await this.handleError(error, {
            title: context.title || 'AI Operation Failed',
            message: this.formatErrorMessage(error),
            ...(context.purpose && { purpose: context.purpose }),
            ...(context.model && { model: context.model }),
            ...(context.operation && { operation: context.operation })
        }, context.operation || 'AI operation');
    }

    /**
     * Helper method to extract model information from error context
     */
    private extractModelFromError(error: any): string | undefined {
        // Try to extract model from various error formats
        if (error?.model) return error.model;
        if (error?.config?.model) return error.config.model;
        if (error?.originalError?.model) return error.originalError.model;
        return undefined;
    }

    /**
     * Helper method to format error messages for better readability
     */
    private formatErrorMessage(error: Error): string {
        let message = error.message;

        // Handle common OpenRouter error patterns
        if (message.includes('OpenRouter API error:')) {
            // Extract the actual error message
            const match = message.match(/OpenRouter API error: \d+ .+ - (.+)/);
            if (match && match[1]) {
                message = match[1];
            }
        }

        // Handle rate limiting
        if (message.includes('rate limit') || message.includes('429')) {
            message = 'Rate limit exceeded. Please wait a moment before trying again.';
        }

        // Handle auth errors
        if (message.includes('401') || message.includes('Unauthorized')) {
            message = 'Authentication failed. Please check your API key in settings.';
        }

        // Handle insufficient credits
        if (message.includes('insufficient') && message.includes('credit')) {
            message = 'Insufficient credits. Please add credits to your OpenRouter account.';
        }

        return message;
    }
} 