import { OpenRouterCompletionMeta, OpenRouterUsage } from '../../OpenRouterClient';

export type RPGLiteModelPurpose = 'creator' | 'prose' | 'editor' | 'rater';

export type RPGLiteMessageRole = 'user' | 'assistant';

export interface RPGLiteMessageGenerationMeta {
  purpose: RPGLiteModelPurpose;
  model: string;
  promptChars: number;
  completionChars: number;
  durationMs: number;
  usage?: OpenRouterUsage;
  totalCostUsd?: number;
}

export interface RPGLiteMessageVersion {
  content: string;
  createdAt: number;
  generation?: RPGLiteMessageGenerationMeta;
}

export interface RPGLiteChatMessage {
  id: string;
  role: RPGLiteMessageRole;
  content: string;
  createdAt: number;
  editedAt?: number;
  generation?: RPGLiteMessageGenerationMeta;
  // Support for multiple versions (e.g., from retry)
  versions?: RPGLiteMessageVersion[];
  activeVersionIndex?: number;
}

export interface RPGLiteSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;

  systemPrompt: string;
  prefixContext: string;

  narratorPurpose: RPGLiteModelPurpose;
  maxContextMessages: number;
  temperature?: number;  // Optional temperature override for this session (0-2)

  conversation: RPGLiteChatMessage[];
  clipboard?: string;
}

export interface RPGLiteStartPreset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  title: string;
  systemPrompt: string;
  prefixContext: string;
  narratorPurpose: RPGLiteModelPurpose;
  maxContextMessages: number;
}

export interface RPGLiteActionButton {
  id: string;
  label: string;
  text: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export function mapCompletionMetaToGenerationMeta(
  purpose: RPGLiteModelPurpose,
  meta: OpenRouterCompletionMeta
): RPGLiteMessageGenerationMeta {
  return {
    purpose,
    model: meta.model,
    promptChars: meta.promptChars,
    completionChars: meta.completionChars,
    durationMs: meta.durationMs,
    ...(meta.usage ? { usage: meta.usage } : {}),
    ...(typeof meta.totalCostUsd === 'number' ? { totalCostUsd: meta.totalCostUsd } : {})
  };
}


