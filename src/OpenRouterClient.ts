export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
  usage?: {
    include?: boolean;
  };
  // Optional model parameters
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  // Some providers (OpenAI-compatible) expect `max_tokens` instead
  max_tokens?: number;
  // Optional verbosity parameter (top-level, per OpenRouter docs) for models that
  // support it (OpenAI GPT-5 family; mapped to effort for Anthropic). Enum values:
  // low | medium | high | xhigh | max.
  verbosity?: string | number;
  // Reasoning/thinking parameters for models that support it
  thinking?: {
    type?: 'enabled' | 'disabled';
    budget_tokens?: number;
  };
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    budget_tokens?: number; // Internal storage only, gets mapped to max_tokens
  };
  plugins?: Array<{
    id: string;
    max_results?: number;
    search_prompt?: string;
  }>;
  web_search_options?: {
    search_context_size?: 'low' | 'medium' | 'high';
  };
  /** Output modalities to request from the model. Use ["image", "text"] for models supporting image generation. */
  modalities?: string[];
  /** Image configuration for image-generation requests. */
  image_config?: {
    aspect_ratio?: string;
    image_size?: string;
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

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
  total_cost?: number;
}

export interface OpenRouterCompletionMeta {
  model: string;
  provider?: string;
  usage?: OpenRouterUsage;
  totalCostUsd?: number;
  generationId?: string;
  promptChars: number;
  completionChars: number;
  durationMs: number;
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
  onStart: () => void;
  onChunk: (chunk: string) => void;
  /** Called when the model returns image URLs (base64 data URLs). May be called once or multiple times. */
  onImages?: (imageUrls: string[]) => void;
  onComplete: (fullContent: string) => void;
  onMeta?: (meta: OpenRouterCompletionMeta) => void;
  onError: (error: Error) => void;
}

export interface StreamingChatOptions {
  temperature?: number;  // Optional temperature override (0-2)
  /** Request specific output modalities. Use ["image", "text"] for image-generation capable models. */
  modalities?: string[];
}

/**
 * Utility to mask API keys in logs (shows only first/last 4 chars)
 * WARNING: Logging API keys is dangerous in production! Only use for debugging.
 */
function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '[MASKED]';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeUsage(raw: unknown): OpenRouterUsage | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const promptTokens = readNumber(obj['prompt_tokens']);
  const completionTokens = readNumber(obj['completion_tokens']);
  const totalTokens = readNumber(obj['total_tokens']);
  if (typeof promptTokens !== 'number' || typeof completionTokens !== 'number' || typeof totalTokens !== 'number') {
    return undefined;
  }
  const cost =
    readNumber(obj['cost']) ??
    readNumber(obj['cost_usd']) ??
    readNumber(obj['total_cost_usd']);
  const totalCost = readNumber(obj['total_cost']);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    ...(typeof cost === 'number' ? { cost } : {}),
    ...(typeof totalCost === 'number' ? { total_cost: totalCost } : {})
  };
}

function readFirstHeader(headers: Headers, names: string[]): string | null {
  for (const n of names) {
    const v = headers.get(n);
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

/**
 * Typed reason info extracted from an OpenRouter SSE error payload.
 * OpenRouter emits the real failure reason as a terminal `chat.completion.chunk`
 * carrying a top-level (or choice-level) `error` object plus `finish_reason: "error"`.
 */
interface StreamFailure {
  code?: string | number;
  message?: string;
  errorType?: string;
  providerCode?: string;
  providerName?: string;
  finishReason?: string;
  nativeFinishReason?: string;
}

/** `error_type` values that indicate transient provider congestion (safe to retry). */
const CONGESTION_ERROR_TYPES: ReadonlySet<string> = new Set([
  'provider_unavailable',
  'provider_overloaded',
  'timeout',
  'rate_limit_exceeded',
  'server'
]);

/** HTTP statuses that indicate transient congestion (safe to retry). */
const RETRYABLE_HTTP_STATUS: ReadonlySet<number> = new Set([429, 502, 503, 504]);

// Idle/stall watchdog for streaming. If no bytes at all arrive within this window
// (OpenRouter sends periodic ": OPENROUTER PROCESSING" keepalives even while a
// model is still "thinking", so any healthy request keeps resetting this), the
// connection is treated as a stalled/congested provider: the request is aborted
// and surfaced as a retryable ProviderCongestionError instead of hanging forever.
const STREAM_STALL_TIMEOUT_MS = 120_000;
const STREAM_STALL_CHECK_MS = 5_000;

/**
 * Extract typed failure info from a parsed SSE chunk. Returns null for normal
 * chunks (content deltas, `stop`/`length` completions). Non-null only when the
 * provider reported an error (top-level/choice-level `error` object or
 * `finish_reason: "error"`).
 */
function extractStreamFailure(parsed: unknown): StreamFailure | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const root = parsed as Record<string, unknown>;

  const rawChoice = Array.isArray(root['choices']) ? (root['choices'] as unknown[])[0] : undefined;
  const choice = (typeof rawChoice === 'object' && rawChoice !== null)
    ? (rawChoice as Record<string, unknown>)
    : undefined;

  const finishReason = choice && typeof choice['finish_reason'] === 'string'
    ? choice['finish_reason']
    : undefined;
  const nativeFinishReason = choice && typeof choice['native_finish_reason'] === 'string'
    ? choice['native_finish_reason']
    : undefined;

  let rawError: Record<string, unknown> | undefined;
  if (typeof root['error'] === 'object' && root['error'] !== null) {
    rawError = root['error'] as Record<string, unknown>;
  } else if (choice && typeof choice['error'] === 'object' && choice['error'] !== null) {
    rawError = choice['error'] as Record<string, unknown>;
  }

  if (!rawError && finishReason !== 'error') return null;

  const failure: StreamFailure = {};
  if (finishReason) failure.finishReason = finishReason;
  if (nativeFinishReason) failure.nativeFinishReason = nativeFinishReason;

  if (rawError) {
    const code = rawError['code'];
    if (typeof code === 'string' || typeof code === 'number') failure.code = code;
    const message = rawError['message'];
    if (typeof message === 'string') failure.message = message;
    const metadata = (typeof rawError['metadata'] === 'object' && rawError['metadata'] !== null)
      ? (rawError['metadata'] as Record<string, unknown>)
      : undefined;
    if (metadata) {
      if (typeof metadata['error_type'] === 'string') failure.errorType = metadata['error_type'];
      if (typeof metadata['provider_code'] === 'string') failure.providerCode = metadata['provider_code'];
      if (typeof metadata['provider_name'] === 'string') failure.providerName = metadata['provider_name'];
    }
  }
  return failure;
}

/** Whether a captured stream failure is transient congestion that is safe to retry. */
function isCongestionFailure(f: StreamFailure): boolean {
  if (f.errorType && CONGESTION_ERROR_TYPES.has(f.errorType)) return true;
  if (typeof f.code === 'number' && RETRYABLE_HTTP_STATUS.has(f.code)) return true;
  // An `error` finish with no typed detail is, per OpenRouter, almost always a
  // transient provider disconnect/overload — treat it as retryable congestion.
  if (!f.errorType && f.finishReason === 'error') return true;
  return false;
}

/** Parse a `Retry-After` header (seconds or HTTP-date) into seconds. */
function parseRetryAfterSeconds(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum)) return Math.max(0, asNum);
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    const secs = (asDate - Date.now()) / 1000;
    return secs > 0 ? secs : 0;
  }
  return undefined;
}

/** Build a human-readable, accurate message from a captured stream failure. */
function describeStreamFailure(model: string, f: StreamFailure, attempts: number): string {
  const parts: string[] = [];
  if (f.errorType) parts.push(`type=${f.errorType}`);
  if (typeof f.code !== 'undefined') parts.push(`code=${f.code}`);
  if (f.providerName) parts.push(`provider=${f.providerName}`);
  if (f.providerCode) parts.push(`provider_code=${f.providerCode}`);
  if (f.nativeFinishReason) parts.push(`native_finish=${f.nativeFinishReason}`);
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  const providerMsg = f.message ? `: ${f.message}` : '';
  return `Provider error from ${model}${detail}${providerMsg}. Failed after ${attempts} attempt(s).`;
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

  private async fetchGenerationMeta(apiKey: string, generationId: string): Promise<{ totalCostUsd?: number; usage?: OpenRouterUsage }> {
    const url = `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter generation API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const json = (await response.json()) as unknown;
    const root = (typeof json === 'object' && json !== null) ? (json as Record<string, unknown>) : {};
    const data = (typeof root['data'] === 'object' && root['data'] !== null) ? (root['data'] as Record<string, unknown>) : root;

    const totalCostUsd =
      readNumber(data['total_cost']) ??
      readNumber(data['total_cost_usd']) ??
      readNumber(data['totalCostUsd']) ??
      readNumber(data['cost']) ??
      readNumber(data['price']);
    const usage = normalizeUsage(data['usage']);

    return {
      ...(typeof totalCostUsd === 'number' ? { totalCostUsd } : {}),
      ...(usage ? { usage } : {})
    };
  }

  /**
   * Get the singleton instance of OpenRouterClient
   */
  public static getInstance(): OpenRouterClient {
    OpenRouterClient.instance ??= new OpenRouterClient();
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
      return key ?? '';
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
      const providerSelection = providers[purpose];
      

      
      if (!model) {
        throw new Error(`No model configured for purpose: ${purpose}`);
      }

      // Check if this model has native web search
      const allModels = await this.fetchModels();
      const modelInfo = allModels.find(m => m.id === model);
      const hasNativeWebSearch = modelInfo ? OpenRouterClient.hasNativeWebSearch(modelInfo) : false;
      
      const webSearchEnabled = hasNativeWebSearch || ((webSearchPrefs[purpose] ?? false));
      
      const result: {model: string, webSearchEnabled: boolean, hasNativeWebSearch: boolean, provider?: string} = {
        model,
        webSearchEnabled,
        hasNativeWebSearch
      };
      
      // Only include provider if it's specified and not "automatic"
      if (providerSelection && providerSelection !== 'automatic') {
        // Map the provider selection back to the actual endpoint name for API calls
        const actualProvider = await this.mapProviderSelectionToEndpointName(model, providerSelection);
        if (actualProvider) {
          result.provider = actualProvider;
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to get model config for purpose ${purpose}:`, error);
      throw error;
    }
  }

  /**
   * Determine which max tokens key the selected model supports.
   * Defaults to 'max_tokens' if unknown.
   */
  private async getMaxTokensParameterKey(modelId: string): Promise<'max_output_tokens' | 'max_tokens'> {
    try {
      const allModels = await this.fetchModels();
      const modelInfo = allModels.find(m => m.id === modelId);
      const supported = new Set<string>(modelInfo?.supported_parameters ?? []);
      if (supported.has('max_output_tokens')) return 'max_output_tokens';
      if (supported.has('max_tokens')) return 'max_tokens';
      // Check provider endpoints for additional hints
      if (modelInfo) {
        try {
          const endpoints = await this.fetchModelEndpoints(modelId);
          for (const ep of endpoints) {
            const epParams = new Set<string>(ep.supported_parameters ?? []);
            if (epParams.has('max_output_tokens')) return 'max_output_tokens';
            if (epParams.has('max_tokens')) return 'max_tokens';
          }
        } catch {
          // Ignore endpoint fetch issues; fall back to default
        }
      }
    } catch {
      // Ignore fetch issues and use default
    }
    return 'max_tokens';
  }

  

  /**
   * Map a provider selection value back to the actual endpoint name for API calls
   */
  private async mapProviderSelectionToEndpointName(modelId: string, providerSelection: string): Promise<string | null> {
    try {
      // For backwards compatibility, if the selection looks like a basic slug, use it directly
      if (providerSelection && !providerSelection.includes('-') && providerSelection !== 'automatic') {
        return providerSelection;
      }

      // For new format selections (like "deepinfra-1"), we need to fetch the model endpoints
      // to map back to the actual endpoint name
      const client = OpenRouterClient.getInstance();
      const endpoints = await client.fetchModelEndpoints(modelId);
      
      if (!endpoints || endpoints.length === 0) {
        // Log helpful diagnostics for missing endpoints (console only)
        console.info(`[OpenRouterClient] No provider endpoints for ${modelId}. Supported params cannot be resolved per provider.`);
        return null;
      }

      // If the provider selection matches an endpoint name directly, use it
      const directMatch = endpoints.find((endpoint: OpenRouterModelEndpoint) => endpoint.name === providerSelection);
      if (directMatch) {
        return directMatch.name;
      }

      // If the provider selection is a base slug (like "deepinfra"), find the first matching endpoint
      const slugMatch = endpoints.find((endpoint: OpenRouterModelEndpoint) => {
        const providerDisplayName = endpoint.provider_name || endpoint.name;
        const baseSlug = this.getProviderSlug(providerDisplayName);
        return baseSlug === providerSelection;
      });
      if (slugMatch) {
        return slugMatch.name;
      }

      // If the provider selection is a numbered variant (like "deepinfra-1"), extract the base and find by index
      const indexMatch = providerSelection.match(/^(.+)-(\d+)$/);
      if (indexMatch?.[1] && indexMatch[2]) {
        const [, baseSlug, indexStr] = indexMatch;
        const index = parseInt(indexStr, 10);
        
        // Find all endpoints matching the base slug
        const matchingEndpoints = endpoints.filter((endpoint: OpenRouterModelEndpoint) => {
          const providerDisplayName = endpoint.provider_name || endpoint.name;
          const endpointSlug = this.getProviderSlug(providerDisplayName);
          return endpointSlug === baseSlug;
        });
        
        if (matchingEndpoints[index]) {
          return matchingEndpoints[index].name;
        }
      }

      console.warn(`Could not map provider selection "${providerSelection}" to endpoint for model ${modelId}`);
      return null;
    } catch (error) {
      console.error('Error mapping provider selection to endpoint name:', error);
      return null;
    }
  }

  /**
   * Convert provider display name to API slug (helper method)
   */
  private getProviderSlug(providerName: string): string {
    // Common provider name to slug mappings (duplicate from ModelSelector for consistency)
    const providerMap: Record<string, string> = {
      'Groq': 'groq',
      'Together': 'together',
      'DeepInfra': 'deepinfra',
      'Fireworks': 'fireworks',
      'Anthropic': 'anthropic',
      'OpenAI': 'openai',
      'Google': 'google-ai-studio',
      'Google AI Studio': 'google-ai-studio',
      'Mistral': 'mistral',
      'Cohere': 'cohere',
      'Meta': 'meta',
      'Moonshot AI': 'moonshot',
      'Azure': 'azure',
      'Amazon Bedrock': 'bedrock',
      'Replicate': 'replicate',
      'Hugging Face': 'huggingface',
      'Cerebras': 'cerebras',
      'Perplexity': 'perplexity',
      'xAI': 'xai',
      'BaseTen': 'baseten',
      'SambaNova': 'sambanova',
      'Lepton': 'lepton',
      'Hyperbolic': 'hyperbolic',
      'DeepSeek': 'deepseek',
      'Liquid': 'liquid',
      'AI21': 'ai21',
      'Inflection': 'inflection',
      '01.AI': '01ai'
    };

    if (providerMap[providerName]) {
      return providerMap[providerName];
    }

    const words = providerName.split(/[\s\/\-_]+/);
    const firstWord = words[0] ?? 'unknown';
    const normalized = firstWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (normalized.length > 2 && normalized.length < 20) {
      return normalized;
    } else {
      return 'unknown';
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
    const opId = _operationId ?? this.generateOperationId(purpose);
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
      
      const callbacks: StreamingCallbacks = {
        onStart: () => {
        },
        onChunk: (chunk: string) => {
          fullResponse += chunk;
        },
        onComplete: async (finalResponse: string) => {
          try {
            // NOTE: Logging is handled by streamingChat() method to avoid duplicates
            // since chat() internally calls streamingChat()
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
          
          // NOTE: Error logging is handled by streamingChat() method to avoid duplicates
          // since chat() internally calls streamingChat()
          
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
   * Check whether a given model supports image output (i.e. image generation).
   * Uses the cached fetchModels() data and checks architecture.output_modalities.
   */
  async modelSupportsImageOutput(modelId: string): Promise<boolean> {
    try {
      const models = await this.fetchModels();
      const model = models.find(m => m.id === modelId);
      return model?.architecture?.output_modalities?.includes('image') ?? false;
    } catch {
      return false;
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
   * Abortable delay used between retry attempts. Honors a server-provided
   * Retry-After (seconds) when available, otherwise uses capped exponential
   * backoff. Rejects with an AbortError if the operation is aborted while waiting.
   */
  private async delayBeforeRetry(
    attempt: number,
    retryAfterSeconds: number | undefined,
    signal: AbortSignal,
    purpose: string,
    reason: string
  ): Promise<void> {
    const backoffMs = Math.min(20000, 800 * Math.pow(2, attempt - 1));
    const waitMs = typeof retryAfterSeconds === 'number'
      ? Math.min(20000, Math.max(0, retryAfterSeconds * 1000))
      : backoffMs;

    const nextAttempt = attempt + 1;
    void import('./utils/UILogger').then(({ uiLogger }) => {
      uiLogger.warn('OpenRouter retrying', `Purpose: ${purpose} | Reason: ${reason} | Attempt ${nextAttempt} in ${Math.round(waitMs)}ms`);
    }).catch(() => {
      // UI logger not available, that's ok
    });
    window.dispatchEvent(new CustomEvent('ai-progress', {
      detail: { type: 'start', message: `Provider congested (${reason}), retrying…` }
    }));

    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, waitMs);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Send a streaming chat message for a given purpose.
   * Calls onContent for each chunk and onComplete when finished.
   */
  async streamingChat(purpose: string, messages: OpenRouterMessage[], callbacks: StreamingCallbacks, operationId?: string, externalAbortSignal?: AbortSignal, options?: StreamingChatOptions): Promise<void> {
    const opId = operationId ?? this.generateOperationId(purpose);
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

    // Stall watchdog state (see STREAM_STALL_TIMEOUT_MS). `stallState.stalled` lets
    // the catch block distinguish a stall-abort from a genuine user abort.
    const stallState = { stalled: false };
    let stallWatchdog: ReturnType<typeof setInterval> | null = null;
    const clearStallWatchdog = () => {
      if (stallWatchdog !== null) {
        clearInterval(stallWatchdog);
        stallWatchdog = null;
      }
    };

    try {
      const apiKey = await this.getApiKeyFromStorage();
      if (!apiKey) {
        const error = new Error('OpenRouter API key not configured. Please set it in the settings.');
        throw error;
      }

      const modelConfig = await this.getModelConfigForPurpose(purpose);
      const { model, webSearchEnabled, hasNativeWebSearch, provider } = modelConfig;
      

      
      // Calculate prompt length and log request start
      const promptForLogging = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const promptLength = promptForLogging.length;
      
      // Log to UI Logger
      void import('./utils/UILogger').then(({ uiLogger }) => {
        uiLogger.info(`OpenRouter request started`, `Purpose: ${purpose} | Model: ${model} | Prompt: ${promptLength} chars`);
      }).catch(() => {
        // UI logger not available, that's ok
      });

      const startTime = Date.now();
      const request: OpenRouterRequest = {
        model: webSearchEnabled && !hasNativeWebSearch ? `${model}:online` : model,
        messages,
        stream: true,
        stream_options: {
          include_usage: true
        },
        usage: {
          include: true
        }
      };
      
      // Apply per-purpose model parameters if configured
      try {
        const modelSelector = state.getModelSelector();
        const params = modelSelector?.getSelectedParams?.();
        if (params?.[purpose]) {
          const p = params[purpose] as { temperature?: number; top_p?: number; max_output_tokens?: number; verbosity?: string | number; thinking?: { enabled?: boolean; budget_tokens?: number }, reasoning?: { effort?: 'low' | 'medium' | 'high'; budget_tokens?: number } };
          if (typeof p.temperature === 'number') {
            request.temperature = Math.max(0, Math.min(2, p.temperature));
          }
          // Override with options temperature if provided (for RPGLite session-specific temperature)
          if (options?.temperature !== undefined) {
            request.temperature = Math.max(0, Math.min(2, options.temperature));
          }
          // (modalities applied unconditionally below, outside this params block)
          if (typeof p.top_p === 'number') {
            request.top_p = Math.max(0, Math.min(1, p.top_p));
          }
          if (typeof p.max_output_tokens === 'number') {
            const normalized = Math.max(1, Math.floor(p.max_output_tokens));
            const key = await this.getMaxTokensParameterKey(model);
            if (key === 'max_output_tokens') {
              request.max_output_tokens = normalized;
            } else {
              request.max_tokens = normalized;
            }
          }
          if (typeof p.verbosity !== 'undefined') {
            // OpenRouter expects `verbosity` as a TOP-LEVEL field on the chat
            // completions request (enum: low|medium|high|xhigh|max). See
            // https://openrouter.ai/docs/api/reference/parameters#verbosity
            // For the OpenAI GPT-5 family it controls response length; for Anthropic
            // it maps to output_config.effort. Do NOT nest it under `text` — that is
            // the OpenAI Responses API shape and is ignored by OpenRouter's chat
            // completions endpoint, which silently leaves the model fully verbose.
            request.verbosity = p.verbosity;
            console.info(`[OpenRouterClient] Setting verbosity=${String(p.verbosity)} for model ${model}`);
          }
          if (p.thinking?.enabled) {
            request.thinking = {
              type: 'enabled',
              ...(p.thinking.budget_tokens ? { budget_tokens: Math.max(256, Math.floor(p.thinking.budget_tokens)) } : {})
            };
          }
          if (p.reasoning && (p.reasoning.effort || p.reasoning.budget_tokens)) {
            request.reasoning = {};
            // Use effort-based approach if specified (takes priority)
            if (p.reasoning.effort) {
              request.reasoning.effort = p.reasoning.effort;
            } 
            // Otherwise use token budget approach (but never both together)
            else if (p.reasoning.budget_tokens) {
              request.reasoning.max_tokens = Math.max(256, Math.floor(p.reasoning.budget_tokens));
            }
          }
        }
      } catch (e) {
        // Intentionally let errors surface in development logs without blocking the request
        console.error('Failed to apply per-purpose model parameters:', e);
      }
      
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

      // Apply options that must be set regardless of whether per-purpose params exist
      if (options?.temperature !== undefined && request.temperature === undefined) {
        // Only apply if not already set by the params block above
        request.temperature = Math.max(0, Math.min(2, options.temperature));
      }
      if (options?.modalities) {
        request.modalities = options.modalities;
        // Remove stream_options for image requests — image models don't support it
        // and it can interfere with the response. Streaming itself stays on.
        if (options.modalities.includes('image')) {
          delete (request as Partial<OpenRouterRequest>).stream_options;
          delete (request as Partial<OpenRouterRequest>).usage;
        }
      }


      // Show AI interactions overlay if enabled
      const aiInteractionsService = AIInteractionsService.getInstance();
      const promptText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      aiInteractionsService.showInteraction(purpose, promptText);
      
      // Emit simple progress event
      window.dispatchEvent(new CustomEvent('ai-progress', { 
        detail: { type: 'start', message: 'Waiting for response...' } 
      }));

      // Success-carrying state (populated by the successful attempt).
      let fullContent = '';
      let receivedImages = false;
      let finalUsage: OpenRouterUsage | undefined = undefined;
      let finalTotalCostUsd: number | undefined = undefined;
      let generationId: string | undefined = undefined;

      // Bounded retry loop. Transient provider congestion (a retryable HTTP status,
      // an in-stream `error`, or an empty result with no detail) is retried ONLY
      // when nothing has been streamed yet, so consumers never see duplicated
      // partial output. Real content filtering and non-transient errors are thrown
      // immediately with their true reason.
      const maxAttempts = 4;
      let attempt = 0;
      let attemptStart = startTime;

      for (;;) {
        attempt++;
        attemptStart = Date.now();

        // Reset per-attempt accumulators.
        fullContent = '';
        receivedImages = false;
        finalUsage = undefined;
        finalTotalCostUsd = undefined;
        generationId = undefined;
        let wasContentFiltered = false;
        let contentFilterReason = '';
        let streamFailure: StreamFailure | null = null;
        let shouldRetry = false;

      // (Re)arm the idle watchdog for this attempt. It aborts the request if no
      // bytes arrive for STREAM_STALL_TIMEOUT_MS (covers both a hanging fetch and
      // a stalled token stream). Bumped on fetch return and on every read below.
      clearStallWatchdog();
      let lastActivityAt = Date.now();
      stallWatchdog = setInterval(() => {
        if (Date.now() - lastActivityAt > STREAM_STALL_TIMEOUT_MS) {
          stallState.stalled = true;
          clearStallWatchdog();
          window.dispatchEvent(new CustomEvent('ai-progress', {
            detail: { type: 'start', message: `No response for ${STREAM_STALL_TIMEOUT_MS / 1000}s — connection stalled, retrying…` }
          }));
          abortController.abort();
        }
      }, STREAM_STALL_CHECK_MS);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
        signal: abortController.signal
      });
      lastActivityAt = Date.now();



      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ OpenRouter API error response:', errorText);
        if (RETRYABLE_HTTP_STATUS.has(response.status) && attempt < maxAttempts) {
          const retryAfter = parseRetryAfterSeconds(response.headers);
          await this.delayBeforeRetry(attempt, retryAfter, abortController.signal, purpose, `HTTP ${response.status}`);
          continue;
        }
        const error = new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
        if (RETRYABLE_HTTP_STATUS.has(response.status)) {
          error.name = 'ProviderCongestionError';
        }
        throw error;
      }

      if (!response.body) {
        const error = new Error('Response body is null');
        throw error;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Try to capture generation/cost from headers (if exposed by CORS)
      const headerGen = readFirstHeader(response.headers, [
        'x-openrouter-generation',
        'x-openrouter-id',
        'x-request-id'
      ]);
      if (typeof headerGen === 'string') {
        generationId = headerGen;
      }

      const headerCost = readFirstHeader(response.headers, [
        'x-openrouter-total-cost',
        'x-openrouter-cost',
        'x-total-cost'
      ]);
      const headerCostNum = readNumber(headerCost);
      if (typeof headerCostNum === 'number') {
        finalTotalCostUsd = headerCostNum;
      }

      const headerUsage = readFirstHeader(response.headers, [
        'x-openrouter-usage',
        'x-usage'
      ]);
      if (typeof headerUsage === 'string') {
        try {
          const parsedUsage = JSON.parse(headerUsage) as unknown;
          const normalized = normalizeUsage(parsedUsage);
          if (normalized) {
            finalUsage = normalized;
          }
        } catch (e) {
          console.error('Failed to parse usage header from OpenRouter:', e);
        }
      }

      // Only announce start once; retries are transparent to consumers.
      if (attempt === 1) {
        callbacks.onStart();
      }

      try {
        // Line buffer: SSE lines can be arbitrarily large (e.g. base64 images).
        // network read() chunks are fixed-size, so a single data: line may span
        // many reads. We accumulate bytes here and only process complete lines.
        let sseLineBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          lastActivityAt = Date.now(); // any byte (including keepalives) resets the stall watchdog

          if (done) break;
          
          sseLineBuffer += decoder.decode(value, { stream: true });

          // Split on newlines but keep the trailing partial line in the buffer
          const lines = sseLineBuffer.split('\n');
          sseLineBuffer = lines.pop() ?? '';
          
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

                // Capture usage/cost if present (usually only on final chunk when include_usage is enabled)
                if (parsed.usage) {
                  const normalized = normalizeUsage(parsed.usage);
                  if (normalized) {
                    finalUsage = normalized;
                  }
                  const tc = readNumber((parsed.usage as { total_cost?: unknown }).total_cost);
                  if (typeof tc === 'number') finalTotalCostUsd = tc;
                } else {
                  const tc = readNumber((parsed as { total_cost?: unknown }).total_cost);
                  if (typeof tc === 'number') finalTotalCostUsd = tc;
                }

                const pid = (parsed as { id?: unknown }).id;
                if (typeof pid === 'string' && pid.length > 0) {
                  generationId = pid;
                }

                // Capture the real failure reason from any error chunk
                // (top-level or choice-level `error`, or finish_reason "error").
                const failure = extractStreamFailure(parsed);
                if (failure) {
                  streamFailure = failure;
                }
                
                // Check for content filtering
                if (finishReason === 'content_filter') {
                  wasContentFiltered = true;
                  contentFilterReason = 'Content was filtered by the AI safety system';
                  break; // Stop processing further chunks
                }
                
                if (content) {
                  fullContent += content;
                  callbacks.onChunk(content);
                  aiInteractionsService.updateResponse(content);
                  
                  // Emit progress update with current character count
                  window.dispatchEvent(new CustomEvent('ai-progress', { 
                    detail: { type: 'update', characters: fullContent.length } 
                  }));
                }

                // Handle image output from image-generation capable models
                const deltaImages = choice?.delta?.images as Array<{ image_url: { url: string } }> | undefined;
                if (deltaImages && deltaImages.length > 0) {
                  const urls = deltaImages.map(img => img.image_url.url);
                  receivedImages = true;
                  callbacks.onImages?.(urls);
                }
              } catch (parseError) {
                // Ignore JSON parse errors (malformed lines from the server)
                continue;
              }
            }
          }
        }
        
        // Stream fully consumed — the stall watchdog is no longer relevant for the
        // post-stream cost/usage lookups below.
        clearStallWatchdog();

        // Check for content filtering after streaming completes
        if (wasContentFiltered) {
          const nativeInfo = streamFailure?.nativeFinishReason ? ` (native_finish=${streamFailure.nativeFinishReason})` : '';
          const error = new Error(`Content filtering detected: ${contentFilterReason}${nativeInfo}. The AI model refused to generate content due to safety restrictions. Try using a different model or rephrasing your content.`);
          error.name = 'ContentFilterError';
          throw error;
        }
        
        // Provider reported an error in-stream — this is where congestion lives.
        if (streamFailure) {
          if (fullContent.length === 0 && isCongestionFailure(streamFailure) && attempt < maxAttempts) {
            shouldRetry = true;
          } else {
            const truncatedNote = fullContent.length > 0 ? ' Output was truncated before completion.' : '';
            const error = new Error(`${describeStreamFailure(model, streamFailure, attempt)}${truncatedNote}`);
            error.name = 'ProviderCongestionError';
            throw error;
          }
        } else if (fullContent.length === 0 && !receivedImages) {
          // Empty result with no error detail. Per OpenRouter this is almost
          // always transient provider congestion, NOT content filtering.
          // (image-only models legitimately return no text, hence the images guard.)
          if (attempt < maxAttempts) {
            shouldRetry = true;
          } else {
            const error = new Error(`Empty response received from ${model}: no content and no error detail returned (most likely provider congestion), after ${attempt} attempts. This is usually temporary — try again, or switch provider/model.`);
            error.name = 'ProviderCongestionError';
            throw error;
          }
        }

        if (shouldRetry) {
          const reason = streamFailure?.errorType ?? (streamFailure ? 'provider error' : 'empty response');
          await this.delayBeforeRetry(attempt, undefined, abortController.signal, purpose, reason);
          continue;
        }
        
        const duration = Date.now() - attemptStart;
        
        let totalCostUsd = typeof finalTotalCostUsd === 'number' ? finalTotalCostUsd : undefined;
        if (typeof totalCostUsd !== 'number') {
          if (typeof finalUsage?.total_cost === 'number') {
            totalCostUsd = finalUsage.total_cost;
          } else if (typeof finalUsage?.cost === 'number') {
            totalCostUsd = finalUsage.cost;
          }
        }

        if (typeof totalCostUsd !== 'number' && typeof generationId === 'string') {
          try {
            const meta = await this.fetchGenerationMeta(apiKey, generationId);
            if (!finalUsage && meta.usage) {
              finalUsage = meta.usage;
            }
            if (typeof meta.totalCostUsd === 'number') {
              totalCostUsd = meta.totalCostUsd;
            }
          } catch (e) {
            console.error('Failed to fetch OpenRouter generation cost/usage:', e);
          }
        }

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
        
        // Log completion to UI Logger
        void import('./utils/UILogger').then(({ uiLogger }) => {
          uiLogger.success(`OpenRouter request completed`, `Purpose: ${purpose} | Model: ${model} | Response: ${fullContent.length} chars`);
        }).catch(() => {
          // UI logger not available, that's ok
        });
        
        // Emit completion event with final character count
        window.dispatchEvent(new CustomEvent('ai-progress', { 
          detail: { type: 'complete', characters: fullContent.length } 
        }));

        callbacks.onMeta?.({
          model,
          ...(typeof provider === 'string' ? { provider } : {}),
          ...(finalUsage ? { usage: finalUsage } : {}),
          ...(typeof totalCostUsd === 'number' ? { totalCostUsd } : {}),
          ...(typeof generationId === 'string' ? { generationId } : {}),
          promptChars: promptLength,
          completionChars: fullContent.length,
          durationMs: duration
        });

        callbacks.onComplete(fullContent);
        
      } finally {
        clearStallWatchdog();
        reader.releaseLock();
      }

        // Successful attempt — leave the retry loop.
        break;
      }

    } catch (error: unknown) {
      console.error(`❌ Streaming chat failed for purpose: ${purpose}, operation: ${opId}`, error);
      
      // Log error to UI Logger
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      void import('./utils/UILogger').then(({ uiLogger }) => {
        // Get model for error logging (fallback if not available)
        this.getModelForPurpose(purpose).then(modelName => {
          uiLogger.error(`OpenRouter request failed`, `Purpose: ${purpose} | Model: ${modelName} | Error: ${errorMessage}`);
        }).catch(() => {
          uiLogger.error(`OpenRouter request failed`, `Purpose: ${purpose} | Error: ${errorMessage}`);
        });
      }).catch(() => {
        // UI logger not available, that's ok
      });
      
      // A stall-triggered abort is congestion, not a user abort — surface it as a
      // retryable ProviderCongestionError so the coherence/run-level retries fire.
      let reportedError: Error;
      if (stallState.stalled && error instanceof Error && error.name === 'AbortError') {
        reportedError = new Error(`No response from the provider for ${STREAM_STALL_TIMEOUT_MS / 1000}s (stalled stream, most likely provider congestion). Retry recommended.`);
        reportedError.name = 'ProviderCongestionError';
      } else if (error instanceof Error && error.name === 'AbortError') {
        reportedError = new Error('Request was aborted');
      } else {
        reportedError = error instanceof Error ? error : new Error('Unknown streaming error');
      }
      callbacks.onError(reportedError);
      
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
      
      throw reportedError;
    } finally {
      clearStallWatchdog();
      this.activeOperations.delete(opId);
    }
  }

  /**
   * Stream a conversation with multiple messages for a given purpose.
   * This is the method expected by the chat interface.
   */
  async chatStreamConversation(purpose: string, messages: OpenRouterMessage[], callbacks: StreamingCallbacks, operationId?: string, externalAbortSignal?: AbortSignal): Promise<void> {
    callbacks.onStart();
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