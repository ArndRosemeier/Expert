export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
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

export class OpenRouterClient {
  private apiKey: string;
  private apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions';
  private modelPurposeMap: Record<string, string> = {};
  private models: Record<string, string> = {};
  private currentAbortController: AbortController | null = null;

  constructor(apiKey: string, modelPurposeMap?: Record<string, string>) {
    this.apiKey = apiKey;
    if (modelPurposeMap) {
      this.modelPurposeMap = modelPurposeMap;
    }
  }

  setModelPurpose(purpose: string, model: string) {
    this.modelPurposeMap[purpose] = model;
  }

  getModelForPurpose(purpose: string): string | undefined {
    return this.modelPurposeMap[purpose];
  }

  public setSelectedModels(models: Record<string, string>): void {
    this.models = models;
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
    const request: OpenRouterRequest = {
      model,
      messages: [
        { role: 'user', content: message }
      ],
    };
    const response = await this.sendMessage(request, abortSignal);
    // Return the first assistant message content, or empty string if not found
    const answer = response.choices?.[0]?.message?.content ?? '';
    return answer;
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

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request was aborted');
      }
      throw error;
    } finally {
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
} 