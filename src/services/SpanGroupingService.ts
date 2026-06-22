/**
 * SpanGroupingService
 *
 * Realizes the "above markers" hierarchy layers for full-text import. The
 * marker-first segmenter (HierarchicalImportService) consumes structural markers
 * greedily at whatever level it runs, so coarser parent layers that the document
 * does not physically mark (e.g. grouping many chapters into Acts) cannot be
 * produced by segmentation. This service adds them afterwards by asking the model
 * to group a flat, ordered list of top-level spans into contiguous parent units.
 *
 * It is deliberately isolated from the central segmentation path: it takes the
 * already-built top spans and returns a new layer of parent spans whose children
 * are exactly those input spans (char offsets untouched). When the model fails to
 * produce a valid (contiguous, covering, >= 2) grouping it returns null so the
 * caller can skip the layer rather than invent a bogus single-group structure.
 */

import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';
import { SegmentedSpan } from './HierarchicalImportService';
import { getPromptText } from '../PromptManager';

interface RawGroup {
  title: string;
  firstChild: number; // 1-based inclusive
  lastChild: number;  // 1-based inclusive
}

const SNIPPET_CHARS = 140;

export class SpanGroupingService {
  private readonly client: OpenRouterClient;
  private readonly settings: SettingsManager;

  constructor(client: OpenRouterClient, settings: SettingsManager) {
    this.client = client;
    this.settings = settings;
  }

  /**
   * Group a flat, ordered list of spans into contiguous parent spans named after
   * `parentLevelName`. Returns the parent spans (children set to the originals),
   * or null when grouping is impossible or the model response is invalid.
   */
  public async groupTopSpans(
    fullText: string,
    spans: SegmentedSpan[],
    parentLevelName: string
  ): Promise<SegmentedSpan[] | null> {
    if (spans.length < 2) {
      return null;
    }

    const prompt = getPromptText('import_grouping')
      .replace(/\{\{parent_level\}\}/g, parentLevelName)
      .replace(/\{\{children\}\}/g, this.renderChildren(fullText, spans))
      .replace(/\{\{language\}\}/g, this.settings.getGlobalLanguage());

    const raw = await this.client.chat('editor', prompt);
    const groups = this.parseGroups(raw, spans.length);
    if (!groups) {
      console.warn(`SpanGroupingService: model returned no valid grouping for "${parentLevelName}"; skipping this layer.`);
      return null;
    }

    return groups.map(g => {
      const children = spans.slice(g.firstChild - 1, g.lastChild);
      return {
        title: g.title,
        startChar: children[0]!.startChar,
        endChar: children[children.length - 1]!.endChar,
        children
      };
    });
  }

  private renderChildren(fullText: string, spans: SegmentedSpan[]): string {
    return spans
      .map((s, i) => `${i + 1}: ${s.title} — ${this.firstSnippet(fullText.slice(s.startChar, s.endChar))}`)
      .join('\n');
  }

  private firstSnippet(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS)}…` : flat;
  }

  /**
   * Parse `<group first="x" last="y">title</group>` tags and validate they form a
   * strict, contiguous cover of sections 1..n with at least two groups. Returns
   * null on any violation. XML is used (not JSON) because it survives free-text
   * titles far more reliably.
   */
  private parseGroups(raw: string, n: number): RawGroup[] | null {
    const re = /<group\s+first="(\d+)"\s+last="(\d+)"\s*>([\s\S]*?)<\/group>/gi;
    const parsed: RawGroup[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(raw)) !== null) {
      const first = parseInt(match[1]!, 10);
      const last = parseInt(match[2]!, 10);
      const title = match[3]!.trim();
      if (title.length === 0 || !Number.isFinite(first) || !Number.isFinite(last)) {
        return null;
      }
      parsed.push({ title, firstChild: first, lastChild: last });
    }

    if (parsed.length < 2) {
      return null;
    }

    parsed.sort((a, b) => a.firstChild - b.firstChild);
    let expectedStart = 1;
    for (const g of parsed) {
      if (g.firstChild !== expectedStart || g.lastChild < g.firstChild || g.lastChild > n) {
        return null;
      }
      expectedStart = g.lastChild + 1;
    }
    if (expectedStart !== n + 1) {
      return null;
    }
    return parsed;
  }
}
