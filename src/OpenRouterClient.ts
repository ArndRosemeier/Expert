export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  stream?: boolean;
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
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

import { AILogService } from './AILogService';
import { SettingsManager } from './SettingsManager';

export interface StreamingCallbacks {
  onStart?: () => void;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

export class OpenRouterClient {
  private apiKey: string;
  private apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions';
  private modelPurposeMap: Record<string, string> = {};
  private aiLogService: AILogService;
  private settingsManager: SettingsManager | null = null;

  private currentAbortController: AbortController | null = null;

  constructor(apiKey: string, modelPurposeMap?: Record<string, string>) {
    this.apiKey = apiKey;
    if (modelPurposeMap) {
      this.modelPurposeMap = modelPurposeMap;
    }
    this.aiLogService = AILogService.getInstance();
  }

  public setSettingsManager(settingsManager: SettingsManager): void {
    this.settingsManager = settingsManager;
  }

  setModelPurpose(purpose: string, model: string) {
    this.modelPurposeMap[purpose] = model;
  }

  getModelForPurpose(purpose: string): string | undefined {
    return this.modelPurposeMap[purpose];
  }

  public setSelectedModels(models: Record<string, string>): void {
    this.modelPurposeMap = models;
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  /**
   * Cancel any ongoing API request
   */
  public abort(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * Check if there's an ongoing request that can be aborted
   */
  public canAbort(): boolean {
    return this.currentAbortController !== null;
  }

  /**
   * Send a chat message for a given purpose. Always uses role 'user'.
   * Returns just the model's answer string.
   */
  async chat(purpose: string, message: string, abortSignal?: AbortSignal): Promise<string> {
    const model = this.getModelForPurpose(purpose);

    if (!model) {
      throw new Error(`No model configured for purpose: ${purpose}`);
    }

    console.log(`🚀 Starting AI generation for purpose: ${purpose}, model: ${model}`);
    const startTime = Date.now();
    const request: OpenRouterRequest = {
      model,
      messages: [
        { role: 'user', content: message }
      ],
    };
    
    try {
      console.log(`📤 Sending request to OpenRouter:`, { model, messageLength: message.length });
      const response = await this.sendMessage(request, abortSignal);
      console.log(`📨 Received response from OpenRouter:`, { 
        hasChoices: !!response.choices, 
        choicesLength: response.choices?.length || 0,
        hasContent: !!response.choices?.[0]?.message?.content
      });
      
      const answer = response.choices?.[0]?.message?.content ?? '';
      const duration = Date.now() - startTime;
      console.log(`✅ AI generation completed successfully in ${duration}ms, response length: ${answer.length}`);

      // Log the interaction if logging is enabled
      if (this.settingsManager?.isAILoggingEnabled()) {
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
      const duration = Date.now() - startTime;
      console.error(`❌ AI generation failed for purpose: ${purpose}`, {
        error: error instanceof Error ? error.message : error,
        duration,
        model,
        messageLength: message.length,
        errorType: error instanceof Error ? error.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Log failed requests too if logging is enabled
      if (this.settingsManager?.isAILoggingEnabled()) {
        try {
          await this.aiLogService.addLogEntry({
            timestamp: new Date(),
            purpose,
            prompt: message,
            response: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
            model,
            requestDuration: duration
          });
        } catch (logError) {
          console.error('Failed to log AI interaction error:', logError);
        }
      }
      throw error;
    }
  }

  async sendMessage(request: OpenRouterRequest, externalAbortSignal?: AbortSignal): Promise<OpenRouterResponse> {
    // Create abort controller for this request
    this.currentAbortController = new AbortController();
    
    // If external abort signal is provided, listen to it and abort our controller
    if (externalAbortSignal) {
      externalAbortSignal.addEventListener('abort', () => {
        if (this.currentAbortController) {
          this.currentAbortController.abort();
        }
      });
    }

    console.log(`🌐 Initiating HTTP request to OpenRouter API`, {
      url: this.apiUrl,
      model: request.model,
      messageCount: request.messages.length,
      hasStream: !!request.stream,
      hasAbortSignal: !!externalAbortSignal
    });

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
        signal: this.currentAbortController.signal
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
        console.error(`🚨 HTTP error response:`, {
          status: response.status,
          statusText: response.statusText,
          url: this.apiUrl
        });
        const errorText = await response.text();
        console.error(`🚨 Error response body:`, errorText);
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
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
        url: this.apiUrl
      });
      
      if (error.name === 'AbortError') {
        throw new Error('Request was aborted');
      }
      throw error;
    } finally {
      console.log(`🧹 Cleaning up abort controller`);
      this.currentAbortController = null;
    }
  }

  async fetchModels(): Promise<OpenRouterModel[]> {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }
    const data: OpenRouterModelsResponse = await response.json();
    return data.data;
  }

  /**
   * Send a streaming chat message for a given purpose. Always uses role 'user'.
   * Calls onContent for each chunk and onComplete when finished.
   */
  async streamingChat(purpose: string, messages: OpenRouterMessage[], callbacks: StreamingCallbacks, abortSignal?: AbortSignal): Promise<void> {
    const model = this.getModelForPurpose(purpose);

    if (!model) {
      const error = new Error(`No model configured for purpose: ${purpose}`);
      callbacks.onError?.(error);
      throw error;
    }

    const startTime = Date.now();
    const request: OpenRouterRequest = {
      model,
      messages,
      stream: true
    };
    
    try {
      // Create abort controller for this request
      this.currentAbortController = new AbortController();
      
      // If external abort signal is provided, listen to it and abort our controller
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          if (this.currentAbortController) {
            this.currentAbortController.abort();
          }
        });
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
        signal: this.currentAbortController.signal
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
        
        // Log the interaction if logging is enabled
        if (this.settingsManager?.isAILoggingEnabled()) {
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
      if (error.name === 'AbortError') {
        const abortError = new Error('Request was aborted');
        callbacks.onError?.(abortError);
        throw abortError;
      }
      
      // Log failed requests too if logging is enabled
      if (this.settingsManager?.isAILoggingEnabled()) {
        try {
          const duration = Date.now() - startTime;
          await this.aiLogService.addLogEntry({
            timestamp: new Date(),
            purpose,
            prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
            response: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
            model,
            requestDuration: duration
          });
        } catch (logError) {
          console.error('Failed to log AI interaction error:', logError);
        }
      }
      
      callbacks.onError?.(error);
      throw error;
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Stream a conversation with multiple messages for a given purpose.
   * This is the method expected by the chat interface.
   */
  async chatStreamConversation(purpose: string, messages: OpenRouterMessage[], callbacks: StreamingCallbacks, abortSignal?: AbortSignal): Promise<void> {
    callbacks.onStart?.();
    return this.streamingChat(purpose, messages, callbacks, abortSignal);
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
} 