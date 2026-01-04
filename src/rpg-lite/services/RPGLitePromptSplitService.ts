import { OpenRouterClient, OpenRouterMessage } from '../../OpenRouterClient';
import { getPromptText } from '../../PromptManager';

export interface RPGLitePromptSplitResult {
  title: string;
  systemPrompt: string;
  prefixContext: string;
}

function parseStrictJson<T>(text: string): T {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Prompt split model did not return a JSON object. Got: ${trimmed.slice(0, 2000)}`);
  }
  const jsonText = trimmed.slice(start, end + 1);
  return JSON.parse(jsonText) as T;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Prompt split JSON is missing non-empty field "${field}".`);
  }
}

export class RPGLitePromptSplitService {
  private openRouterClient: OpenRouterClient;

  constructor(openRouterClient: OpenRouterClient) {
    this.openRouterClient = openRouterClient;
  }

  async splitAdventurePrompt(adventurePrompt: string): Promise<RPGLitePromptSplitResult> {
    const template = getPromptText('rpg_lite_prompt_split');
    const prompt = template.split('{{adventure_prompt}}').join(adventurePrompt);

    const messages: OpenRouterMessage[] = [
      { role: 'user', content: prompt }
    ];

    let full = '';
    await this.openRouterClient.streamingChat('creator', messages, {
      onStart: () => {},
      onChunk: (chunk: string) => {
        full += chunk;
      },
      onComplete: () => {},
      onError: () => {}
    });

    const parsed = parseStrictJson<{ title: unknown; systemPrompt: unknown; prefixContext: unknown }>(full);
    assertNonEmptyString(parsed.title, 'title');
    assertNonEmptyString(parsed.systemPrompt, 'systemPrompt');
    assertNonEmptyString(parsed.prefixContext, 'prefixContext');

    return {
      title: parsed.title.trim(),
      systemPrompt: parsed.systemPrompt,
      prefixContext: parsed.prefixContext
    };
  }
}


