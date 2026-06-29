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
  /**
   * Optional scope label for the split prompt (e.g. the user's template level
   * name in their own language). When provided it replaces the generic English
   * scope word so the prompt stays language-aware rather than English-locked.
   */
  customScope?: string;
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

// Token-bounding constants for the skeleton+windowed fallback. They keep the
// per-call input size bounded regardless of total document length so very large
// slices never overflow the model context. All values are structural (counts /
// char budgets) and carry no language assumptions.
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_FULL_INPUT_TOKENS = 6000; // above this, switch to skeleton+windowed mode
const WINDOW_PARAGRAPHS = 120; // paragraphs analysed per LLM call in skeleton mode
const WINDOW_OVERLAP = 8; // paragraph overlap between consecutive windows
const PREVIEW_CHARS = 120; // characters of preview kept per paragraph in skeleton mode

export class TextSegmentationService {
  private static instance: TextSegmentationService | null = null;

  public static getInstance(): TextSegmentationService {
    TextSegmentationService.instance ??= new TextSegmentationService();
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
    const language = options.language ?? this.settings.getGlobalLanguage();
    const purpose = options.purpose ?? 'editor';
    const granularity = options.granularity ?? 'custom';

    const paragraphs = this.computeParagraphs(originalText);
    const curated = this.buildCuratedText(paragraphs);

    const reqArgs: { language: string; granularity: SegmentationGranularity; purpose: 'creator' | 'rater' | 'editor' | 'prose'; targetCount?: number; customScope?: string } = {
      language,
      granularity,
      purpose,
    };
    if (typeof options.targetCount === 'number') {
      reqArgs.targetCount = options.targetCount;
    }
    if (typeof options.customScope === 'string' && options.customScope.trim().length > 0) {
      reqArgs.customScope = options.customScope.trim();
    }

    // Token guard: when the full curated text is too large, segment using the
    // skeleton+windowed strategy (paragraph previews processed in overlapping
    // windows) so each LLM call stays within a bounded input size.
    const approxTokens = Math.ceil(curated.length / APPROX_CHARS_PER_TOKEN);
    if (approxTokens > MAX_FULL_INPUT_TOKENS) {
      const windowedSections = await this.segmentSkeletonWindowed(paragraphs, reqArgs);
      if (windowedSections.length === 0) {
        throw new Error('TextSegmentationService: Skeleton segmentation returned no sections.');
      }
      return { sections: windowedSections, paragraphs };
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

  /**
   * Segment a large paragraph list using bounded skeleton windows.
   *
   * Instead of sending full prose, each paragraph is reduced to a short preview.
   * Paragraphs are processed in overlapping windows with locally re-based ids
   * (p1..pK per window) so the existing prompt contract ("first section starts
   * at p1") holds inside every window; local ids are mapped back to global
   * paragraph indices afterwards. Boundaries detected in overlap regions by two
   * windows are de-duplicated. Token use per call is bounded by WINDOW_PARAGRAPHS
   * and PREVIEW_CHARS, independent of total document size.
   */
  private async segmentSkeletonWindowed(
    paragraphs: ParagraphInfo[],
    args: { language: string; granularity: SegmentationGranularity; targetCount?: number; purpose: 'creator' | 'rater' | 'editor' | 'prose'; customScope?: string }
  ): Promise<SegmentationResultSection[]> {
    const total = paragraphs.length;
    const boundaries = new Map<number, string>(); // global 1-based index -> title

    let windowStart = 0; // 0-based paragraph offset
    while (windowStart < total) {
      const windowEnd = Math.min(total, windowStart + WINDOW_PARAGRAPHS);
      const windowParagraphs = paragraphs.slice(windowStart, windowEnd);
      const curated = this.buildSkeletonText(windowParagraphs);

      const raw = await this.requestSectionsWithTitles(curated, args);
      for (const r of raw) {
        const localIndex = this.parseParagraphId(r.start);
        if (!Number.isInteger(localIndex) || localIndex < 1 || localIndex > windowParagraphs.length) {
          continue;
        }
        const globalIndex = windowStart + localIndex; // local p1 -> global (windowStart + 1)
        const title = (r.title || '').trim();
        const existing = boundaries.get(globalIndex);
        if (existing === undefined || (existing.length === 0 && title.length > 0)) {
          boundaries.set(globalIndex, title);
        }
      }

      if (windowEnd >= total) {
        break;
      }
      windowStart = Math.max(0, windowEnd - WINDOW_OVERLAP);
    }

    // The first document section must always start at p1.
    if (!boundaries.has(1)) {
      boundaries.set(1, '');
    }

    return Array.from(boundaries.entries())
      .filter(([index]) => index >= 1 && index <= total)
      .map(([index, title]) => ({ startParagraphIndex: index, title }))
      .sort((a, b) => a.startParagraphIndex - b.startParagraphIndex);
  }

  /**
   * Build curated skeleton text for a window: re-based local ids (p1..pK) plus a
   * short, language-neutral preview of each paragraph.
   */
  private buildSkeletonText(paragraphs: ParagraphInfo[]): string {
    return paragraphs
      .map((p, i) => `==p${i + 1}==\n${this.previewOf(p.text)}`)
      .join('\n\n');
  }

  private previewOf(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= PREVIEW_CHARS) {
      return clean;
    }
    return `${clean.slice(0, PREVIEW_CHARS).trim()}…`;
  }

  private buildSplitScope(granularity: SegmentationGranularity, targetCount?: number, customScope?: string): string {
    const core = customScope && customScope.length > 0
      ? customScope
      : (granularity === 'custom' ? 'parts' : granularity);
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
    args: { language: string; granularity: SegmentationGranularity; targetCount?: number; purpose: 'creator' | 'rater' | 'editor' | 'prose'; customScope?: string }
  ): Promise<LlmSectionRaw[]> {
    const splitScope = this.buildSplitScope(args.granularity, args.targetCount, args.customScope);

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


