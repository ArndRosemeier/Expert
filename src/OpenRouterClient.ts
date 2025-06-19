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

  /**
   * Send a chat message for a given purpose. Always uses role 'user'.
   * Returns just the model's answer string.
   */
  async chat(purpose: string, message: string): Promise<string> {
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
    const response = await this.sendMessage(request);
    // Return the first assistant message content, or empty string if not found
    const answer = response.choices?.[0]?.message?.content ?? '';
    return answer;
  }

  async sendMessage(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
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