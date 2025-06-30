export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  stream?: boolean;
  plugins?: Array<{
    id: string;
    max_results?: number;
    search_prompt?: string;
  }>;
  web_search_options?: {
    search_context_size?: 'low' | 'medium' | 'high';
  };
}

export interface OpenRouterResponse {
  choices: Array<{
    message: OpenRouterMessage;
  }>;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
  };
  pricing?: Record<string, string>;
  context_length?: number;
  supported_parameters?: string[];
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

import { AILogService } from './AILogService';
import { SettingsManager } from './SettingsManager';
import { StorageService } from './StorageService';
import * as state from './state';

export interface StreamingCallbacks {
  onStart?: () => void;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Utility to mask API keys in logs (shows only first/last 4 chars)
 * WARNING: Logging API keys is dangerous in production! Only use for debugging.
 */
function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '[MASKED]';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

/**
 * Singleton OpenRouterClient with operation-scoped abort controllers and dynamic key/model loading.
 * This ensures consistent API key usage across the entire application and prevents key synchronization issues.
 */
export class OpenRouterClient {
  private static instance: OpenRouterClient | null = null;
  
  private apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions';
  private aiLogService: AILogService;
  private settingsManager: SettingsManager | null = null;
  private forceStreamingMode: boolean = true; // Use streaming for all requests by default
  
  // Operation-scoped abort controllers to handle concurrent operations safely
  private activeOperations = new Map<string, AbortController>();

  private constructor() {
    this.aiLogService = AILogService.getInstance();
  }

  /**
   * Get the singleton instance of OpenRouterClient
   */
  public static getInstance(): OpenRouterClient {
    if (!OpenRouterClient.instance) {
      OpenRouterClient.instance = new OpenRouterClient();
    }
    return OpenRouterClient.instance;
  }

  /**
   * Dynamically fetch the API key from storage for each request.
   * This ensures we always use the latest key, even if it was updated in settings.
   */
  private async getApiKeyFromStorage(): Promise<string> {
    try {
      const storage = await StorageService.getInstance();
      const key = await storage.get<string>('openrouter_api_key');
      return key || '';
    } catch (error) {
      console.error('Failed to load API key from storage:', error);
      return '';
    }
  }

  /**
   * Dynamically fetch the model for a purpose from the current ModelSelector.
   * This ensures we always use the latest model configuration.
   */
  private async getModelForPurpose(purpose: string): Promise<string> {
    try {
      const modelSelector = state.getModelSelector();
      if (!modelSelector) {
        throw new Error('ModelSelector not available');
      }
      
      const models = modelSelector.getSelectedModels();
      const model = models[purpose];
      
      if (!model) {
        throw new Error(`No model configured for purpose: ${purpose}`);
      }
      
      return model;
    } catch (error) {
      console.error(`Failed to get model for purpose ${purpose}:`, error);
      throw error;
    }
  }

  /**
   * Get model configuration including web search preferences for a purpose
   */
  private async getModelConfigForPurpose(purpose: string): Promise<{model: string, webSearchEnabled: boolean, hasNativeWebSearch: boolean}> {
    try {
      const modelSelector = state.getModelSelector();
      if (!modelSelector) {
        throw new Error('ModelSelector not available');
      }
      
      const models = modelSelector.getSelectedModels();
      const webSearchPrefs = modelSelector.getWebSearchEnabled();
      const model = models[purpose];
      
      if (!model) {
        throw new Error(`No model configured for purpose: ${purpose}`);
      }

      // Check if this model has native web search
      const allModels = await this.fetchModels();
      const modelInfo = allModels.find(m => m.id === model);
      const hasNativeWebSearch = modelInfo ? OpenRouterClient.hasNativeWebSearch(modelInfo) : false;
      
      const webSearchEnabled = hasNativeWebSearch || (webSearchPrefs[purpose] || false);
      
      return {
        model,
        webSearchEnabled,
        hasNativeWebSearch
      };
    } catch (error) {
      console.error(`Failed to get model config for purpose ${purpose}:`, error);
      throw error;
    }
  }

  /**
   * Get the current settings manager instance
   */
  private getSettingsManager(): SettingsManager | null {
    if (!this.settingsManager) {
      this.settingsManager = state.getSettingsManager();
    }
    return this.settingsManager;
  }

  public setSettingsManager(settingsManager: SettingsManager): void {
    this.settingsManager = settingsManager;
  }

  /**
   * Enable or disable streaming mode (streaming is used by default)
   * Can be disabled to use standard JSON requests if needed
   */
  public setForceStreamingMode(enabled: boolean): void {
    this.forceStreamingMode = enabled;
    console.log(`🌊 Streaming mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Check if streaming mode is enabled
   */
  public isForceStreamingMode(): boolean {
    return this.forceStreamingMode;
  }

  /**
   * Generate a unique operation ID
   */
  private generateOperationId(purpose: string): string {
    return `${purpose}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Abort a specific operation by ID
   */
  public abortOperation(operationId: string): void {
    const controller = this.activeOperations.get(operationId);
    if (controller) {
      console.log(`🛑 Aborting operation: ${operationId}`);
      controller.abort();
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Abort all active operations
   */
  public abortAllOperations(): void {
    console.log(`🛑 Aborting all operations (${this.activeOperations.size} active)`);
    for (const [operationId, controller] of this.activeOperations.entries()) {
      controller.abort();
    }
    this.activeOperations.clear();
  }

  /**
   * Get list of active operation IDs
   */
  public getActiveOperationIds(): string[] {
    return Array.from(this.activeOperations.keys());
  }

  /**
   * Check if there are any active operations
   */
  public hasActiveOperations(): boolean {
    return this.activeOperations.size > 0;
  }

  /**
   * Legacy method for backward compatibility - aborts all operations
   */
  public abort(): void {
    this.abortAllOperations();
  }

  /**
   * Legacy method for backward compatibility - checks if any operations are active
   */
  public canAbort(): boolean {
    return this.hasActiveOperations();
  }

  /**
   * Legacy method for backward compatibility - returns empty string (key is now dynamic)
   */
  public getApiKey(): string {
    console.warn('getApiKey() is deprecated in singleton mode - key is loaded dynamically');
    return '';
  }

  /**
   * Send a chat message for a given purpose. Always uses role 'user'.
   * Returns just the model's answer string.
   */
  async chat(purpose: string, message: string, _operationId?: string, externalAbortSignal?: AbortSignal): Promise<string> {
    const opId = _operationId || this.generateOperationId(purpose);
    const abortController = new AbortController();
    this.activeOperations.set(opId, abortController);

    // Listen to external abort signal if provided
    if (externalAbortSignal) {
      externalAbortSignal.addEventListener('abort', () => {
        this.abortOperation(opId);
      });
    }

    try {
      const apiKey = await this.getApiKeyFromStorage();
      if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Please set it in the settings.');
      }

      const modelConfig = await this.getModelConfigForPurpose(purpose);
      const { model, webSearchEnabled, hasNativeWebSearch } = modelConfig;
      
      console.log(`🚀 Starting AI generation for purpose: ${purpose}, model: ${model}, webSearch: ${webSearchEnabled}, operation: ${opId}`);
      
      // Use streaming by default (more reliable across different systems)
      if (this.forceStreamingMode) {
        return await this.chatWithStreamingFallback(purpose, message, opId, abortController.signal);
      }

      const startTime = Date.now();
      const request: OpenRouterRequest = {
        model: webSearchEnabled && !hasNativeWebSearch ? `${model}:online` : model,
        messages: [
          { role: 'user', content: message }
        ],
      };

      // Add web search options for native web search models
      if (webSearchEnabled && hasNativeWebSearch) {
        request.web_search_options = {
          search_context_size: 'medium' // Default to medium context
        };
      }
      
      console.log(`📤 Sending request to OpenRouter:`, { model, messageLength: message.length, operationId: opId });
      const response = await this.sendMessage(request, apiKey, abortController.signal);
      console.log(`📨 Received response from OpenRouter:`, { 
        hasChoices: !!response.choices, 
        choicesLength: response.choices?.length || 0,
        hasContent: !!response.choices?.[0]?.message?.content,
        operationId: opId
      });
      
      const answer = response.choices?.[0]?.message?.content ?? '';
      const duration = Date.now() - startTime;
      console.log(`✅ AI generation completed successfully in ${duration}ms, response length: ${answer.length}, operation: ${opId}`);

      // Log the interaction if logging is enabled
      const settingsManager = this.getSettingsManager();
      if (settingsManager?.isAILoggingEnabled()) {
        try {
          await this.aiLogService.addLogEntry({
            timestamp: new Date(),
            purpose,
            prompt: message,
            response: answer,
            model,
            requestDuration: duration
          });
        } catch (logError) {
          console.error('Failed to log AI interaction:', logError);
        }
      }

      return answer;
    } catch (error) {
      console.error(`❌ AI generation failed for purpose: ${purpose}, operation: ${opId}`, {
        error: error instanceof Error ? error.message : error,
        errorType: error instanceof Error ? error.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Try with streaming if standard request failed and it wasn't already a streaming attempt
      if (!this.forceStreamingMode) {
        try {
          return await this.chatWithStreamingFallback(purpose, message, opId, abortController.signal);
        } catch (fallbackError) {
          console.error(`❌ Streaming fallback also failed for operation: ${opId}`, fallbackError);
        }
      }
      
      // Log failed requests too if logging is enabled
      const settingsManager = this.getSettingsManager();
      if (settingsManager?.isAILoggingEnabled()) {
        try {
          await this.aiLogService.addLogEntry({
            timestamp: new Date(),
            purpose,
            prompt: message,
            response: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
            model: await this.getModelForPurpose(purpose).catch(() => 'unknown'),
            requestDuration: 0
          });
        } catch (logError) {
          console.error('Failed to log AI interaction error:', logError);
        }
      }
      
      throw error;
    } finally {
      this.activeOperations.delete(opId);
    }
  }

  /**
   * Fallback method that uses streaming to get a complete response
   * when standard JSON requests fail
   */
  private async chatWithStreamingFallback(purpose: string, message: string, operationId: string, abortSignal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullResponse = '';
      
      const callbacks: StreamingCallbacks = {
        onStart: () => {
          // Stream started
        },
        onChunk: (chunk: string) => {
          fullResponse += chunk;
        },
        onComplete: (finalResponse: string) => {
          resolve(finalResponse);
        },
        onError: (error: Error) => {
          reject(error);
        }
      };

      // Use streaming chat with single user message
      this.streamingChat(purpose, [{ role: 'user', content: message }], callbacks, operationId, abortSignal)
        .catch(reject);
    });
  }

  async sendMessage(request: OpenRouterRequest, apiKey: string, abortSignal: AbortSignal): Promise<OpenRouterResponse> {
    console.log(`🌐 Initiating HTTP request to OpenRouter API`, {
      url: this.apiUrl,
      model: request.model,
      messageCount: request.messages.length,
      hasStream: !!request.stream,
      hasAbortSignal: !!abortSignal,
      // WARNING: Logging API keys is dangerous in production!
      apiKey: maskApiKey(apiKey)
    });

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
        signal: abortSignal
      });

      console.log(`📡 HTTP response received`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: {
          'content-type': response.headers.get('content-type'),
          'content-length': response.headers.get('content-length')
        }
      });

      if (!response.ok) {
        // Try to parse error body as JSON
        let errorBody: any = null;
        let errorText = '';
        try {
          const text = await response.text();
          errorText = text;
          try {
            errorBody = JSON.parse(text);
          } catch (jsonErr) {
            // Not JSON, keep as text
          }
        } catch (bodyErr) {
          errorText = '[Failed to read error body]';
        }
        console.error(`🚨 HTTP error response:`, {
          status: response.status,
          statusText: response.statusText,
          url: this.apiUrl,
          apiKey: maskApiKey(apiKey), // WARNING: Logging API keys is dangerous in production!
          errorBody,
          errorText
        });
        if (response.status === 401) {
          console.error('🚨 401 Unauthorized error from OpenRouter! This is NOT always an invalid key. See logs above for details.');
        }
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorBody?.error?.message || errorText}`);
      }

      console.log(`🔄 Parsing JSON response...`);
      const result = await response.json();
      console.log(`✅ JSON parsed successfully`, {
        hasChoices: !!result.choices,
        choicesCount: result.choices?.length || 0
      });
      return result;
    } catch (error: any) {
      console.error(`💥 Request failed:`, {
        errorName: error.name,
        errorMessage: error.message,
        isAbortError: error.name === 'AbortError',
        isNetworkError: error instanceof TypeError,
        url: this.apiUrl,
        apiKey: maskApiKey(apiKey) // WARNING: Logging API keys is dangerous in production!
      });
      if (error.name === 'AbortError') {
        throw new Error('Request was aborted');
      }
      throw error;
    }
  }

  async fetchModels(): Promise<OpenRouterModel[]> {
    const apiKey = await this.getApiKeyFromStorage();
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured. Please set it in the settings.');
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) {
        // Try to parse error body as JSON
        let errorBody: any = null;
        let errorText = '';
        try {
          const text = await response.text();
          errorText = text;
          try {
            errorBody = JSON.parse(text);
          } catch (jsonErr) {
            // Not JSON, keep as text
          }
        } catch (bodyErr) {
          errorText = '[Failed to read error body]';
        }
        console.error(`🚨 HTTP error response (fetchModels):`, {
          status: response.status,
          statusText: response.statusText,
          url: 'https://openrouter.ai/api/v1/models',
          apiKey: maskApiKey(apiKey), // WARNING: Logging API keys is dangerous in production!
          errorBody,
          errorText
        });
        if (response.status === 401) {
          console.error('🚨 401 Unauthorized error from OpenRouter! This is NOT always an invalid key. See logs above for details.');
        }
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorBody?.error?.message || errorText}`);
      }
      const data: OpenRouterModelsResponse = await response.json();
      return data.data;
    } catch (error: any) {
      console.error(`💥 fetchModels failed:`, {
        errorName: error.name,
        errorMessage: error.message,
        isAbortError: error.name === 'AbortError',
        isNetworkError: error instanceof TypeError,
        url: 'https://openrouter.ai/api/v1/models',
        apiKey: maskApiKey(apiKey) // WARNING: Logging API keys is dangerous in production!
      });
      throw error;
    }
  }

  /**
   * Send a streaming chat message for a given purpose.
   * Calls onContent for each chunk and onComplete when finished.
   */
  async streamingChat(purpose: string, messages: OpenRouterMessage[], callbacks: StreamingCallbacks, operationId?: string, externalAbortSignal?: AbortSignal): Promise<void> {
    const opId = operationId || this.generateOperationId(purpose);
    const abortController = new AbortController();
    this.activeOperations.set(opId, abortController);

    // Listen to external abort signal if provided
    if (externalAbortSignal) {
      externalAbortSignal.addEventListener('abort', () => {
        this.abortOperation(opId);
      });
    }

    try {
      const apiKey = await this.getApiKeyFromStorage();
      if (!apiKey) {
        const error = new Error('OpenRouter API key not configured. Please set it in the settings.');
        callbacks.onError?.(error);
        throw error;
      }

      const modelConfig = await this.getModelConfigForPurpose(purpose);
      const { model, webSearchEnabled, hasNativeWebSearch } = modelConfig;

      const startTime = Date.now();
      const request: OpenRouterRequest = {
        model: webSearchEnabled && !hasNativeWebSearch ? `${model}:online` : model,
        messages,
        stream: true
      };

      // Add web search options for native web search models
      if (webSearchEnabled && hasNativeWebSearch) {
        request.web_search_options = {
          search_context_size: 'medium' // Default to medium context
        };
      }
      
      console.log(`🌊 Starting streaming chat for purpose: ${purpose}, model: ${model}, operation: ${opId}`);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
        callbacks.onError?.(error);
        throw error;
      }

      if (!response.body) {
        const error = new Error('Response body is null');
        callbacks.onError?.(error);
        throw error;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      callbacks.onStart?.();

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                continue;
              }
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                
                if (content) {
                  fullContent += content;
                  callbacks.onChunk?.(content);
                }
              } catch (parseError) {
                // Ignore JSON parse errors for partial chunks
                continue;
              }
            }
          }
        }
        
        const duration = Date.now() - startTime;
        console.log(`✅ Streaming chat completed successfully in ${duration}ms, response length: ${fullContent.length}, operation: ${opId}`);
        
        // Log the interaction if logging is enabled
        const settingsManager = this.getSettingsManager();
        if (settingsManager?.isAILoggingEnabled()) {
          try {
            await this.aiLogService.addLogEntry({
              timestamp: new Date(),
              purpose,
              prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
              response: fullContent,
              model,
              requestDuration: duration
            });
          } catch (logError) {
            console.error('Failed to log AI interaction:', logError);
          }
        }
        
        callbacks.onComplete?.(fullContent);
        
      } finally {
        reader.releaseLock();
      }
      
    } catch (error: any) {
      console.error(`❌ Streaming chat failed for purpose: ${purpose}, operation: ${opId}`, error);
      
      if (error.name === 'AbortError') {
        const abortError = new Error('Request was aborted');
        callbacks.onError?.(abortError);
        throw abortError;
      }
      
      // Log failed requests too if logging is enabled
      const settingsManager = this.getSettingsManager();
      if (settingsManager?.isAILoggingEnabled()) {
        try {
          const duration = Date.now();
          await this.aiLogService.addLogEntry({
            timestamp: new Date(),
            purpose,
            prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
            response: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
            model: await this.getModelForPurpose(purpose).catch(() => 'unknown'),
            requestDuration: duration
          });
        } catch (logError) {
          console.error('Failed to log AI interaction error:', logError);
        }
      }
      
      callbacks.onError?.(error);
      throw error;
    } finally {
      this.activeOperations.delete(opId);
    }
  }

  /**
   * Stream a conversation with multiple messages for a given purpose.
   * This is the method expected by the chat interface.
   */
  async chatStreamConversation(purpose: string, messages: OpenRouterMessage[], callbacks: StreamingCallbacks, operationId?: string, externalAbortSignal?: AbortSignal): Promise<void> {
    callbacks.onStart?.();
    return this.streamingChat(purpose, messages, callbacks, operationId, externalAbortSignal);
  }

  /**
   * Check browser compatibility for OpenRouter client features
   */
  public static checkBrowserCompatibility(): { compatible: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check fetch API
    if (typeof fetch === 'undefined') {
      issues.push('Fetch API not supported');
    }

    // Check AbortController
    if (typeof AbortController === 'undefined') {
      issues.push('AbortController not supported');
    }

    // Check JSON support
    if (typeof JSON === 'undefined' || !JSON.parse || !JSON.stringify) {
      issues.push('JSON API not fully supported');
    }

    // Check ReadableStream (for streaming)
    if (typeof ReadableStream === 'undefined') {
      issues.push('ReadableStream not supported (streaming may fail)');
    }

    // Check TextDecoder (for streaming)
    if (typeof TextDecoder === 'undefined') {
      issues.push('TextDecoder not supported (streaming may fail)');
    }

    // Check Response.body.getReader (for streaming)
    try {
      const testResponse = new Response('test');
      if (!testResponse.body || typeof testResponse.body.getReader !== 'function') {
        issues.push('Response.body.getReader not supported (streaming may fail)');
      }
    } catch (e) {
      issues.push('Unable to test streaming capabilities');
    }

    console.log(`🔍 Browser compatibility check:`, {
      compatible: issues.length === 0,
      issues: issues.length > 0 ? issues : ['All features supported'],
      userAgent: navigator.userAgent
    });

    return {
      compatible: issues.length === 0,
      issues
    };
  }

  /**
   * Check if a model supports native web search capabilities
   */
  public static hasNativeWebSearch(model: OpenRouterModel): boolean {
    return model.pricing?.['web_search'] !== undefined && model.pricing['web_search'] !== "0";
  }

  /**
   * Check if a model supports web search via plugin (all models do)
   */
  public static supportsWebSearchPlugin(): boolean {
    return true; // All OpenRouter models support web search via plugin
  }

  /**
   * Get web search pricing for a model (if available)
   */
  public static getWebSearchPricing(model: OpenRouterModel): string | null {
    if (!model.pricing?.['web_search']) return null;
    const pricePerRequest = parseFloat(model.pricing['web_search']);
    if (isNaN(pricePerRequest)) return null;
    const pricePer1000 = pricePerRequest * 1000;
    return `$${pricePer1000.toFixed(2)} per 1000 web searches`;
  }
} 