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
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
    require_parameters?: boolean;
    data_collection?: 'allow' | 'deny';
    only?: string[];
    ignore?: string[];
    quantizations?: string[];
    sort?: string;
    max_price?: Record<string, number>;
  };
}

export interface OpenRouterResponse {
  choices: Array<{
    message: OpenRouterMessage;
    finish_reason?: string; // Add finish_reason to the interface
  }>;
}

export interface OpenRouterModelEndpoint {
  name: string;
  context_length: number;
  pricing: {
    request?: string;
    image?: string;
    prompt?: string;
    completion?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  provider_name: string;
  supported_parameters?: string[];
  quantization?: string;
  max_completion_tokens?: number;
  max_prompt_tokens?: number;
  status?: string;
  uptime_last_30m?: number;
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
  endpoints?: OpenRouterModelEndpoint[]; // Provider-specific endpoints
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export interface OpenRouterModelEndpointsResponse {
  data: {
    id: string;
    name: string;
    created: number;
    description: string;
    architecture: {
      input_modalities: string[];
      output_modalities: string[];
      tokenizer: string;
      instruct_type?: string;
    };
    endpoints: OpenRouterModelEndpoint[];
  };
}

import { AILogService } from './AILogService';
import { SettingsManager } from './SettingsManager';
import { StorageService } from './StorageService';
import { AIInteractionsService } from './AIInteractionsService';

import { GenerationErrorService } from './ui/modals';
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
   * Ensures that the UI profile selection matches the actually loaded profile.
   * This fixes inconsistencies where the dropdown shows one profile but different models are loaded.
   */
  private async ensureProfileConsistency(): Promise<void> {
    const settingsManager = state.getSettingsManager()!;
    const modelSelector = state.getModelSelector()!;
    
    // Get the profile selected in the UI
    const uiSelectedProfile = settingsManager.getLastUsedProfileName();
    
    // Get the profile that's actually loaded in the ModelSelector
    const loadedProfile = state.getCurrentlyLoadedProfileName();
    
    // If they don't match, load the correct profile
          if (uiSelectedProfile !== loadedProfile) {
      
      if (uiSelectedProfile) {
        const profile = settingsManager.getProfile(uiSelectedProfile);
        if (profile) {
          // Load all settings from the profile (models, web search, providers)
          await modelSelector.loadFromCurrentProfile();
          
          state.setCurrentlyLoadedProfileName(uiSelectedProfile);
        } else {
          console.warn(`⚠️  Profile "${uiSelectedProfile}" not found or has no models. Using current loaded profile.`);
        }
      }
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
   * Get model configuration including web search preferences and provider for a purpose
   */
  private async getModelConfigForPurpose(purpose: string): Promise<{model: string, webSearchEnabled: boolean, hasNativeWebSearch: boolean, provider?: string}> {
    try {
      const modelSelector = state.getModelSelector();
      if (!modelSelector) {
        throw new Error('ModelSelector not available');
      }
      
      const models = modelSelector.getSelectedModels();
      const providers = modelSelector.getSelectedProviders();
      const webSearchPrefs = modelSelector.getWebSearchEnabled();
      const model = models[purpose];
      const provider = providers[purpose];
      

      
      if (!model) {
        throw new Error(`No model configured for purpose: ${purpose}`);
      }

      // Check if this model has native web search
      const allModels = await this.fetchModels();
      const modelInfo = allModels.find(m => m.id === model);
      const hasNativeWebSearch = modelInfo ? OpenRouterClient.hasNativeWebSearch(modelInfo) : false;
      
      const webSearchEnabled = hasNativeWebSearch || (webSearchPrefs[purpose] || false);
      
      const result: {model: string, webSearchEnabled: boolean, hasNativeWebSearch: boolean, provider?: string} = {
        model,
        webSearchEnabled,
        hasNativeWebSearch
      };
      
      // Only include provider if it's specified and not "automatic"
      if (provider && provider !== 'automatic') {
        result.provider = provider;
      }
      
      return result;
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
      // Use the singleton pattern - try sync first, fall back to state if not initialized
      try {
        this.settingsManager = SettingsManager.getInstanceSync();
      } catch {
        // Fallback to state method if singleton not yet initialized
        this.settingsManager = state.getSettingsManager();
      }
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
      try {
        controller.abort();
      } catch (error) {
        console.warn(`🛑 OpenRouterClient: Error aborting operation ${operationId}:`, error);
      }
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Abort all active operations
   */
  public abortAllOperations(): void {
    const operationCount = this.activeOperations.size;
    
    if (operationCount === 0) {
      return;
    }
    
    const abortPromises = [];
    for (const [operationId, controller] of this.activeOperations.entries()) {
      abortPromises.push(
        Promise.resolve().then(() => {
          try {
            controller.abort();
          } catch (error) {
            console.warn(`🛑 OpenRouterClient: Error aborting operation ${operationId}:`, error);
          }
        })
      );
    }
    
    // Execute all aborts in parallel for faster response
    Promise.all(abortPromises).catch(error => {
      console.warn(`🛑 OpenRouterClient: Error during bulk abort:`, error);
    });
    
    this.activeOperations.clear();
  }

  /**
   * Check if any operations are currently active/pending
   */
  public hasActiveOperations(): boolean {
    return this.activeOperations.size > 0;
  }

  /**
   * Get the number of currently active operations
   */
  public getActiveOperationCount(): number {
    return this.activeOperations.size;
  }

  /**
   * Get the IDs of all currently active operations
   */
  public getActiveOperationIds(): string[] {
    return Array.from(this.activeOperations.keys());
  }

  /**
   * Check if a specific operation is currently active
   */
  public isOperationActive(operationId: string): boolean {
    return this.activeOperations.has(operationId);
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
   * 
   * @deprecated This method is obsolete and only exists for backward compatibility.
   * It internally routes all requests through streamingChat().
   * 
   * For new code, use streamingChat() directly with appropriate callbacks:
   * - Better control over streaming progress
   * - More explicit about asynchronous nature
   * - Direct access to chunked responses
   * - Cleaner error handling
   * 
   * Example migration:
   * ```
   * // OLD (obsolete):
   * const response = await client.chat('creator', prompt);
   * 
   * // NEW (recommended):
   * let fullResponse = '';
   * await client.streamingChat('creator', [{ role: 'user', content: prompt }], {
   *   onStart: () => console.log('Started'),
   *   onChunk: (chunk) => fullResponse += chunk,
   *   onComplete: (response) => console.log('Done:', response),
   *   onError: (error) => console.error('Error:', error)
   * });
   * ```
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
    
    // CRITICAL FIX: Ensure UI selection matches loaded profile
    await this.ensureProfileConsistency();

    return new Promise<string>((resolve, reject) => {
      let fullResponse = '';
      const startTime = Date.now();
      
      const callbacks: StreamingCallbacks = {
        onStart: () => {
        },
        onChunk: (chunk: string) => {
          fullResponse += chunk;
        },
        onComplete: async (finalResponse: string) => {
          try {
            const duration = Date.now() - startTime;

            // Log the interaction if logging is enabled
            const settingsManager = this.getSettingsManager();
            if (settingsManager?.isAILoggingEnabled()) {
              try {
                const model = await this.getModelForPurpose(purpose);
                await this.aiLogService.addLogEntry({
                  timestamp: new Date(),
                  purpose,
                  prompt: message,
                  response: finalResponse,
                  model,
                  requestDuration: duration
                });
              } catch (logError) {
                console.error('Failed to log AI interaction:', logError);
              }
            }

            resolve(finalResponse);
          } catch (logError) {
            console.error('Error in completion handler:', logError);
            resolve(finalResponse); // Still resolve with the response even if logging fails
          }
        },
        onError: async (error: Error) => {
          console.error(`❌ Chat failed for purpose: ${purpose}, operation: ${opId}`, {
            error: error.message,
            errorType: error.name,
            stack: error.stack
          });
          
          // Log failed requests too if logging is enabled
          const settingsManager = this.getSettingsManager();
          if (settingsManager?.isAILoggingEnabled()) {
            try {
              const model = await this.getModelForPurpose(purpose).catch(() => 'unknown');
              await this.aiLogService.addLogEntry({
                timestamp: new Date(),
                purpose,
                prompt: message,
                response: `ERROR: ${error.message}`,
                model,
                requestDuration: 0
              });
            } catch (logError) {
              console.error('Failed to log AI interaction error:', logError);
            }
          }
          
          // Show detailed error modal
          const errorService = GenerationErrorService.getInstance();
          const modelForError = await this.getModelForPurpose(purpose).catch(() => undefined);
          void errorService.showOpenRouterError(error, purpose, modelForError);
          
          reject(error);
        }
      };

      // Route everything through streamingChat for unified handling
      this.streamingChat(purpose, [{ role: 'user', content: message }], callbacks, opId, abortController.signal)
        .catch(reject)
        .finally(() => {
          this.activeOperations.delete(opId);
        });
    });
  }



  async sendMessage(request: OpenRouterRequest, apiKey: string, abortSignal: AbortSignal): Promise<OpenRouterResponse> {



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
      


      if (!response.ok) {
        // Try to parse error body as JSON
        let errorBody: unknown = null;
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
          apiKey: maskApiKey(apiKey),
          errorBody,
          errorText
        });
        // Handle structured error response
        const errorMessage = (errorBody && typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody && 
                              typeof (errorBody as any).error === 'object' && (errorBody as any).error !== null &&
                              'message' in (errorBody as any).error && typeof (errorBody as any).error.message === 'string') 
                              ? (errorBody as any).error.message : errorText;
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorMessage}`);
      }

      return await response.json();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown request error';
      const errorName = error instanceof Error ? error.name : 'Unknown';
      console.error(`💥 Request failed:`, {
        errorName,
        errorMessage,
        isAbortError: errorName === 'AbortError',
        isNetworkError: error instanceof TypeError,
        url: this.apiUrl,
        apiKey: maskApiKey(apiKey) // WARNING: Logging API keys is dangerous in production!
      });
      if (errorName === 'AbortError') {
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
        let errorBody: unknown = null;
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
        // Handle structured error response
        const errorMessage = (errorBody && typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody && 
                              typeof (errorBody as any).error === 'object' && (errorBody as any).error !== null &&
                              'message' in (errorBody as any).error && typeof (errorBody as any).error.message === 'string') 
                              ? (errorBody as any).error.message : errorText;
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorMessage}`);
      }
      const data: OpenRouterModelsResponse = await response.json();
      return data.data;
    } catch (error: unknown) {
      console.error(`💥 fetchModels failed:`, {
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        isAbortError: error instanceof Error && error.name === 'AbortError',
        isNetworkError: error instanceof TypeError,
        url: 'https://openrouter.ai/api/v1/models',
        apiKey: maskApiKey(apiKey) // WARNING: Logging API keys is dangerous in production!
      });
      throw error;
    }
  }

  /**
   * Fetch detailed provider information for a specific model
   */
  async fetchModelEndpoints(modelId: string): Promise<OpenRouterModelEndpoint[]> {
    const apiKey = await this.getApiKeyFromStorage();
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured. Please set it in the settings.');
    }

    // Parse model ID to get author and slug
    const parts = modelId.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid model ID format: ${modelId}. Expected format: author/slug`);
    }
    const [author, slug] = parts;

    try {
      const url = `https://openrouter.ai/api/v1/models/${author}/${slug}/endpoints`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      
      if (!response.ok) {
        // Try to parse error body as JSON
        let errorBody: unknown = null;
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
        console.error(`🚨 HTTP error response (fetchModelEndpoints):`, {
          status: response.status,
          statusText: response.statusText,
          url,
          modelId,
          apiKey: maskApiKey(apiKey),
          errorBody,
          errorText
        });
        // Handle structured error response
        const errorMessage = (errorBody && typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody && 
                              typeof (errorBody as any).error === 'object' && (errorBody as any).error !== null &&
                              'message' in (errorBody as any).error && typeof (errorBody as any).error.message === 'string') 
                              ? (errorBody as any).error.message : errorText;
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorMessage}`);
      }
      
      const data: OpenRouterModelEndpointsResponse = await response.json();
      return data.data.endpoints || [];
    } catch (error: unknown) {
      console.error(`💥 fetchModelEndpoints failed for ${modelId}:`, {
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        modelId,
        apiKey: maskApiKey(apiKey)
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

    // CRITICAL FIX: Ensure UI selection matches loaded profile
    await this.ensureProfileConsistency();

    try {
      const apiKey = await this.getApiKeyFromStorage();
      if (!apiKey) {
        const error = new Error('OpenRouter API key not configured. Please set it in the settings.');
        callbacks.onError?.(error);
        throw error;
      }

      const modelConfig = await this.getModelConfigForPurpose(purpose);
      const { model, webSearchEnabled, hasNativeWebSearch, provider } = modelConfig;
      


      const startTime = Date.now();
      const request: OpenRouterRequest = {
        model: webSearchEnabled && !hasNativeWebSearch ? `${model}:online` : model,
        messages,
        stream: true
      };
      
      // Add provider routing if specified
      if (provider) {
        request.provider = {
          order: [provider],
          allow_fallbacks: false // Only use the selected provider
        };
      }

      // Add web search options for native web search models
      if (webSearchEnabled && hasNativeWebSearch) {
        request.web_search_options = {
          search_context_size: 'medium' // Default to medium context
        };
      }
      


      // Show AI interactions overlay if enabled
      const aiInteractionsService = AIInteractionsService.getInstance();
      const promptText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      aiInteractionsService.showInteraction(purpose, promptText);
      
      // Emit simple progress event
      window.dispatchEvent(new CustomEvent('ai-progress', { 
        detail: { type: 'start', message: 'Waiting for response...' } 
      }));

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
        console.error('❌ OpenRouter API error response:', errorText);
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
      let wasContentFiltered = false;
      let contentFilterReason = '';

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
                const choice = parsed.choices?.[0];
                const content = choice?.delta?.content;
                const finishReason = choice?.finish_reason;
                
                // Check for content filtering
                if (finishReason === 'content_filter') {
                  wasContentFiltered = true;
                  contentFilterReason = 'Content was filtered by the AI safety system';
                  break; // Stop processing further chunks
                }
                
                if (content) {
                  fullContent += content;
                  callbacks.onChunk?.(content);
                  aiInteractionsService.updateResponse(content);
                  
                  // Emit progress update with current character count
                  window.dispatchEvent(new CustomEvent('ai-progress', { 
                    detail: { type: 'update', characters: fullContent.length } 
                  }));
                }
              } catch (parseError) {
                // Ignore JSON parse errors for partial chunks
                continue;
              }
            }
          }
        }
        
        // Check for content filtering after streaming completes
        if (wasContentFiltered) {
          const error = new Error(`Content filtering detected: ${contentFilterReason}. The AI model refused to generate content due to safety restrictions. Try using a different model or rephrasing your content.`);
          error.name = 'ContentFilterError';
          callbacks.onError?.(error);
          throw error;
        }
        
        // Check for empty response (another form of content filtering)
        if (fullContent.length === 0) {
          const error = new Error(`Empty response received from ${model}. This often indicates content filtering by the AI safety system. The model may have detected content that violates its usage policies. Try using a different model (like Mistral Large for best unrestricted quality) or rephrasing your content to be less explicit.`);
          error.name = 'EmptyResponseError';
          callbacks.onError?.(error);
          throw error;
        }
        
        const duration = Date.now() - startTime;
        
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
        
        aiInteractionsService.completeInteraction();
        
        // Emit completion event with final character count
        window.dispatchEvent(new CustomEvent('ai-progress', { 
          detail: { type: 'complete', characters: fullContent.length } 
        }));
        
        callbacks.onComplete?.(fullContent);
        
      } finally {
        reader.releaseLock();
      }
      
    } catch (error: unknown) {
      console.error(`❌ Streaming chat failed for purpose: ${purpose}, operation: ${opId}`, error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        const abortError = new Error('Request was aborted');
        callbacks.onError?.(abortError);
      } else {
        const actualError = error instanceof Error ? error : new Error('Unknown streaming error');
        callbacks.onError?.(actualError);
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
      
      // Show detailed error modal for streaming errors
      if (error instanceof Error && error.name !== 'AbortError') {
        const errorService = GenerationErrorService.getInstance();
        const modelForError = await this.getModelForPurpose(purpose).catch(() => undefined);
        void errorService.showStreamingError(error, purpose, modelForError);
      }
      
      const actualError = error instanceof Error ? error : new Error('Unknown streaming error');
      callbacks.onError?.(actualError);
      throw actualError;
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