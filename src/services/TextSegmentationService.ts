import { OpenRouterClient, OpenRouterMessage } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';
import { getPromptText } from '../PromptManager';
import { createPromptExpansionService } from './PromptExpansionService';

export type SegmentationGranularity = 'act' | 'chapter' | 'scene' | 'custom';

export interface ParagraphInfo {
  id: string; // e.g., p1
  index: number; // 1-based index
  text: string;
  startChar: number; // start offset in ORIGINAL text
  endChar: number; // end offset (exclusive) in ORIGINAL text
}

export interface SegmentationOptions {
  granularity?: SegmentationGranularity;
  targetCount?: number; // optional hint (e.g., 3 acts)
  language?: string; // for prompt wording; does not affect JSON keys
  purpose?: 'creator' | 'rater' | 'editor' | 'prose'; // reuse existing purposes only
}

export interface SegmentationResultSection {
  startParagraphIndex: number; // 1-based
  title: string;
}

export interface SegmentationResult {
  sections: SegmentationResultSection[]; // ordered sections
  paragraphs: ParagraphInfo[]; // complete paragraph listing
}

interface LlmSectionRaw {
  start: string; // "pN"
  title: string;
}

export class TextSegmentationService {
  private static instance: TextSegmentationService | null = null;

  public static getInstance(): TextSegmentationService {
    if (!TextSegmentationService.instance) {
      TextSegmentationService.instance = new TextSegmentationService();
    }
    return TextSegmentationService.instance;
  }

  private readonly client: OpenRouterClient;
  private readonly settings: SettingsManager;

  private constructor() {
    this.client = OpenRouterClient.getInstance();
    // Prefer sync getter; SettingsManager is a singleton in this app
    this.settings = SettingsManager.getInstanceSync();
  }

  public async segmentByParagraphMarkers(
    originalText: string,
    options: SegmentationOptions = {}
  ): Promise<SegmentationResult> {
    const language = options.language || this.settings.getGlobalLanguage();
    const purpose = options.purpose || 'editor';
    const granularity = options.granularity || 'custom';

    const paragraphs = this.computeParagraphs(originalText);
    const curated = this.buildCuratedText(paragraphs);

    const reqArgs: { language: string; granularity: SegmentationGranularity; purpose: 'creator' | 'rater' | 'editor' | 'prose'; targetCount?: number } = {
      language,
      granularity,
      purpose,
    };
    if (typeof options.targetCount === 'number') {
      reqArgs.targetCount = options.targetCount;
    }
    const sectionsRaw = await this.requestSectionsWithTitles(curated, reqArgs);

    if (!sectionsRaw || sectionsRaw.length === 0) {
      throw new Error('TextSegmentationService: Model returned no sections.');
    }

    // Map raw sections to numeric paragraph indices
    const sections: SegmentationResultSection[] = sectionsRaw
      .map((r) => ({
        index: this.parseParagraphId(r.start),
        title: (r.title || '').trim(),
      }))
      .filter((x): x is { index: number; title: string } => Number.isInteger(x.index) && x.index >= 1 && x.index <= paragraphs.length && x.title.length > 0)
      .sort((a, b) => a.index - b.index)
      .map((x) => ({ startParagraphIndex: x.index, title: x.title }));

    if (sections.length === 0) {
      throw new Error('TextSegmentationService: No valid section entries after parsing.');
    }
    if (sections[0]!.startParagraphIndex !== 1) {
      throw new Error('TextSegmentationService: First section does not start at p1 as required.');
    }

    return { sections, paragraphs };
  }

  private computeParagraphs(text: string): ParagraphInfo[] {
    const paragraphs: ParagraphInfo[] = [];
    let cursor = 0;
    let paragraphStart = 0;

    const pushParagraph = (start: number, end: number) => {
      const raw = text.slice(start, end);
      const normalized = raw.replace(/\s+$/u, '');
      const id = `p${paragraphs.length + 1}`;
      paragraphs.push({ id, index: paragraphs.length + 1, text: normalized, startChar: start, endChar: end });
    };

    while (cursor < text.length) {
      // Detect double-newline paragraph breaks (robust to \r\n)
      const m = /(\r?\n){2,}/g.exec(text.slice(cursor));
      if (!m) break;
      const breakIndex = cursor + m.index!;
      const breakLength = m[0]!.length;
      // Paragraph from paragraphStart to breakIndex
      pushParagraph(paragraphStart, breakIndex);
      // Skip the break
      cursor = breakIndex + breakLength;
      paragraphStart = cursor;
    }
    // Tail
    if (paragraphStart <= text.length) {
      pushParagraph(paragraphStart, text.length);
    }

    // If the text had no explicit double-newline breaks, treat entire text as one paragraph
    if (paragraphs.length === 0) {
      paragraphs.push({ id: 'p1', index: 1, text, startChar: 0, endChar: text.length });
    }
    return paragraphs;
  }

  private buildCuratedText(paragraphs: ParagraphInfo[]): string {
    return paragraphs.map((p) => `==${p.id}==\n${p.text}`.trimEnd()).join('\n\n');
  }

  private buildSplitScope(granularity: SegmentationGranularity, targetCount?: number): string {
    const core = granularity === 'custom' ? 'parts' : granularity;
    if (targetCount && targetCount > 0) {
      return `${core} (aim for about ${targetCount} boundaries)`;
    }
    return String(core);
  }

  private parseParagraphId(id: string | null | undefined): number {
    if (!id) return NaN;
    const m = String(id).trim().match(/^p(\d+)$/i);
    if (!m) return NaN;
    return parseInt(m[1]!, 10);
  }

  private async requestSectionsWithTitles(
    curatedText: string,
    args: { language: string; granularity: SegmentationGranularity; targetCount?: number; purpose: 'creator' | 'rater' | 'editor' | 'prose' }
  ): Promise<LlmSectionRaw[]> {
    const splitScope = this.buildSplitScope(args.granularity, args.targetCount);

    // Expand prompts via centralized manager
    const systemTemplate = getPromptText('text_segmentation_system');
    const userTemplate = getPromptText('text_segmentation_user');
    const expander = createPromptExpansionService(this.settings);

    const system = expander.expandPrompt(systemTemplate, { custom: { split_scope: splitScope }, project: { language: args.language } }, args.language);
    const user = expander.expandPrompt(userTemplate, { custom: { curated_text: curatedText }, project: { language: args.language } }, args.language);

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    let full = '';
    await this.client.streamingChat(args.purpose, messages, {
      onStart: () => {},
      onChunk: (c) => (full += c),
      onComplete: () => {},
      onError: (e) => {
        throw e;
      },
    });

    return this.parseSectionsJson(full);
  }

  private parseSectionsJson(rawResponse: string): LlmSectionRaw[] {
    const text = this.stripBom(rawResponse).trim();

    // Quick path: try plain parse first after stripping common wrappers
    const stripped = this.stripCodeFences(text).trim();
    const candidates = [stripped, this.extractFirstJsonArray(stripped) ?? ''];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate) as unknown;
        const arr = this.validateSectionsArray(parsed);
        return arr;
      } catch {
        // try next strategy
      }
    }

    // Last attempt: extract from original text
    const fallback = this.extractFirstJsonArray(text);
    if (fallback) {
      try {
        const parsed = JSON.parse(fallback) as unknown;
        const arr = this.validateSectionsArray(parsed);
        return arr;
      } catch (e) {
        throw new Error(`TextSegmentationService: Failed to parse JSON sections from model output. Last error: ${(e as Error).message}`);
      }
    }

    throw new Error('TextSegmentationService: Model output did not contain a valid JSON array.');
  }

  private stripBom(s: string): string {
    return s.replace(/^\uFEFF/, '');
  }

  private stripCodeFences(s: string): string {
    // Remove a single top-level Markdown code fence if present
    const fenceMatch = s.match(/^```[a-zA-Z]*\s*[\s\S]*?```\s*$/);
    if (!fenceMatch) return s;
    const inner = s.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '');
    return inner;
  }

  private extractFirstJsonArray(s: string): string | null {
    const start = s.indexOf('[');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          return s.slice(start, i + 1);
        }
      }
    }
    return null;
  }

  private validateSectionsArray(parsed: unknown): LlmSectionRaw[] {
    if (!Array.isArray(parsed)) {
      throw new Error('Model output is not a JSON array');
    }
    const out: LlmSectionRaw[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        throw new Error('Model output array contains non-object item');
      }
      const start = (item as any).start;
      const title = (item as any).title;
      if (typeof start !== 'string' || typeof title !== 'string') {
        throw new Error('Model output items must have string start and title');
      }
      out.push({ start, title });
    }
    if (out.length === 0) {
      throw new Error('Model output array is empty');
    }
    if (out[0]!.start.trim().toLowerCase() !== 'p1') {
      throw new Error('First section must start at "p1"');
    }
    return out;
  }
}


