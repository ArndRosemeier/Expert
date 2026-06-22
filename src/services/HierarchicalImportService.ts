import { ProjectTemplate } from '../ProjectTemplate';
import { TextSegmentationService } from './TextSegmentationService';
import { StructuralMarkerDetector } from './StructuralMarkerDetector';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';
import { getPromptText } from '../PromptManager';

export interface SegmentedSpan {
  title: string;
  startChar: number;
  endChar: number;
  children?: SegmentedSpan[];
}

export interface ImportProgressHooks {
  splitStart?: (levelName: string, parentTitle: string) => void;
  splitDone?: (levelName: string, parentTitle: string, count: number) => void;
}

/** A child node's title and (already-built) content, used to outline its parent. */
export interface ImportChildInfo {
  title: string;
  content: string;
}

export class HierarchicalImportService {
  private readonly segmentation: TextSegmentationService;
  private readonly markerDetector: StructuralMarkerDetector;
  private readonly client: OpenRouterClient;
  private readonly settings: SettingsManager;

  constructor(client: OpenRouterClient, settings: SettingsManager) {
    this.client = client;
    this.settings = settings;
    this.segmentation = TextSegmentationService.getInstance();
    this.markerDetector = new StructuralMarkerDetector();
  }

  /**
   * Split a document according to a template hierarchy.
   * - Splits top-down using the segmentation service per level
   * - For fixed-count levels (e.g., "Chapter 3") passes targetCount
   * - Returns a tree of spans with start/end char ranges and titles
   */
  public async segmentByTemplate(text: string, template: ProjectTemplate, hooks?: ImportProgressHooks): Promise<SegmentedSpan[]> {
    const levels = template.hierarchyLevels;
    if (!levels || levels.length === 0) {
      throw new Error('Template has no hierarchy levels');
    }

    // Start from level 1 as level 0 is the root name
    const topLevelName = levels[1] || 'Part';
    const topTarget = this.parseFixedCount(topLevelName);

    const topSections = await this.splitOneLevel(text, topLevelName, topTarget);

    // Iteratively split deeper levels, maintaining nested structure without overwriting
    let frontier: SegmentedSpan[] = topSections;
    for (let levelIndex = 2; levelIndex < levels.length; levelIndex++) {
      const levelName = levels[levelIndex] || `Level ${levelIndex + 1}`;
      const target = this.parseFixedCount(levelName);

      const nextFrontier: SegmentedSpan[] = [];

      for (const parent of frontier) {
        const childText = text.slice(parent.startChar, parent.endChar);
        hooks?.splitStart?.(levelName, parent.title);
        const children = await this.splitOneLevel(childText, levelName, target);
        const offsetChildren = children.map((c) => ({
          ...c,
          startChar: parent.startChar + c.startChar,
          endChar: parent.startChar + c.endChar,
        }));

        parent.children = offsetChildren;
        hooks?.splitDone?.(levelName, parent.title, offsetChildren.length);
        nextFrontier.push(...offsetChildren);
      }

      frontier = nextFrontier;
    }

    return topSections;
  }

  /**
   * Produce one concise outline description per child section, in order, so the
   * caller can assemble a `===Title===` sectioned outline as the parent's content
   * (the same deterministic format normal projects use). Returns null when the
   * model response is malformed or its length does not match the child count, so
   * the caller can fall back without inventing mismatched sections.
   */
  public async outlineChildren(children: ImportChildInfo[]): Promise<string[]> {
    if (children.length === 0) {
      return [];
    }

    const descriptions = await this.requestOutline(children);
    if (!descriptions) {
      // No silent, mangled fallback: a broken outline is worse than a failed
      // import. Fail loudly so the user can retry.
      throw new Error(
        `Outline generation failed: the model did not return ${children.length} well-formed section descriptions. Please retry the import.`
      );
    }
    return descriptions;
  }

  /**
   * One outline-pass call for a set of children. Returns one description per child
   * (in order), or null when the model response cannot be parsed into exactly the
   * expected number of sections. The full child content is sent (no truncation):
   * outlines are allowed to be large.
   */
  private async requestOutline(children: ImportChildInfo[]): Promise<string[] | null> {
    const sections = children
      .map((c, i) => `--- Input section ${i + 1}: ${c.title} ---\n${this.flattenSection(c.content)}`)
      .join('\n\n');
    const system = getPromptText('import_outline_sections')
      .replace(/\{\{sections\}\}/g, sections)
      .replace(/\{\{language\}\}/g, this.settings.getGlobalLanguage());

    const raw = await this.client.chat('editor', system);
    return this.parseDescriptions(raw, children.length);
  }

  /**
   * Flatten a child's `===Title===` outline markers to plain text before it is fed
   * to the outline pass, so the model summarizes the section instead of echoing its
   * sub-headings (which would otherwise leak `===...===` into the parent body). The
   * content is NOT truncated.
   */
  private flattenSection(content: string): string {
    return content.replace(/===\s*(.+?)\s*===/g, '$1').trim();
  }

  /**
   * Extract descriptions from `<outline_section index="n">...</outline_section>`
   * blocks. Matching by explicit index (not order/count of free-form delimiters)
   * is robust to arbitrarily long, multi-paragraph, quote-heavy text. Returns one
   * description per child, or null when a required index is missing/empty.
   *
   * The single-child case is forgiving: the entire reply describes that one child,
   * so any tags are stripped and the whole answer is used (the model sometimes
   * over-tags when the lone child itself has sub-parts).
   */
  private parseDescriptions(raw: string, expectedCount: number): string[] | null {
    if (expectedCount === 1) {
      const whole = this.sanitizeDescription(raw);
      return whole.length > 0 ? [whole] : null;
    }

    const byIndex = new Map<number, string>();
    const re = /<outline_section\s+index="(\d+)"\s*>([\s\S]*?)<\/outline_section>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(raw)) !== null) {
      const idx = parseInt(match[1]!, 10);
      const body = this.sanitizeDescription(match[2]!);
      if (!byIndex.has(idx) && body.length > 0) {
        byIndex.set(idx, body);
      }
    }

    const descriptions: string[] = [];
    for (let i = 1; i <= expectedCount; i++) {
      const body = byIndex.get(i);
      if (body === undefined) {
        return null;
      }
      descriptions.push(body);
    }
    return descriptions;
  }

  /**
   * Tidy a description: drop any `===...===` markers (which would create spurious
   * section boundaries in the parent outline) and any stray outline_section tags,
   * then collapse leftover whitespace.
   */
  private sanitizeDescription(text: string): string {
    return text
      .replace(/<\/?outline_section[^>]*>/gi, ' ')
      .replace(/===.+?===/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Split a single text slice into child spans for one template level.
   *
   * Strategy (markers-first):
   *  1. Try language-agnostic structural marker detection on the slice. If it
   *     finds a reliable structure (>= 2 sections), use those char spans and the
   *     detected titles directly - no LLM call for structure.
   *  2. Otherwise fall back to LLM paragraph segmentation. For large slices the
   *     segmentation service automatically switches to its bounded
   *     skeleton+windowed mode so token use stays bounded.
   *
   * Titles default to the user's own template level name (already in their
   * language) plus an index when no structural/LLM title is available.
   */
  private async splitOneLevel(
    text: string,
    levelName: string,
    targetCount: number | null
  ): Promise<SegmentedSpan[]> {
    // 1. Markers-first: deterministic, language-agnostic structural detection.
    const detected = this.markerDetector.detectChildSections(text);
    if (detected && detected.length >= 2) {
      return detected.map((s, i) => ({
        title: s.title.trim().length > 0 ? s.title.trim() : this.defaultTitleForLevel(levelName, i + 1),
        startChar: s.startChar,
        endChar: s.endChar,
      }));
    }

    // 2. LLM fallback (paragraph segmentation; bounded windowed mode for big slices).
    const segOptions: Parameters<TextSegmentationService['segmentByParagraphMarkers']>[1] = {
      granularity: 'custom',
      language: this.settings.getGlobalLanguage(),
      purpose: 'editor',
      customScope: this.cleanLevelName(levelName)
    };
    if (targetCount !== null) {
      segOptions.targetCount = targetCount;
    }
    const result = await this.segmentation.segmentByParagraphMarkers(text, segOptions);

    const paragraphs = result.paragraphs;
    const sections = result.sections;
    if (sections.length === 0) {
      // Fallback: single section covering whole text
      return [
        {
          title: this.defaultTitleForLevel(levelName, 1),
          startChar: 0,
          endChar: text.length,
        },
      ];
    }

    const fixedCount = this.isFixedCountScope(levelName);
    const spans: SegmentedSpan[] = [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      const startParagraph = s.startParagraphIndex; // 1-based
      const endParagraphExclusive = i + 1 < sections.length ? sections[i + 1]!.startParagraphIndex : paragraphs.length + 1;

      const startChar = paragraphs[startParagraph - 1]!.startChar;
      const endChar = endParagraphExclusive === paragraphs.length + 1 ? text.length : paragraphs[endParagraphExclusive - 1]!.startChar;

      const title = fixedCount ? this.defaultTitleForLevel(levelName, i + 1) : (s.title || this.defaultTitleForLevel(levelName, i + 1));

      spans.push({ title, startChar, endChar });
    }

    return spans;
  }

  private parseFixedCount(levelName: string): number | null {
    const m = levelName.match(/\b(\d+)\b/);
    if (!m || !m[1]) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private isFixedCountScope(levelName: string): boolean {
    return /\b\d+\b/.test(levelName);
  }

  /**
   * Strip a trailing/embedded entity count from a level name, leaving the bare
   * (user-language) label. No English keywords are involved.
   */
  private cleanLevelName(levelName: string): string {
    return levelName.replace(/\d+/g, '').trim() || levelName.trim() || 'Section';
  }

  /**
   * Default title for a node when no detected/LLM title exists. Uses the user's
   * own template level name (already in their language) plus an index.
   */
  private defaultTitleForLevel(levelName: string, index1: number): string {
    return `${this.cleanLevelName(levelName)} ${index1}`;
  }
}


