import { ProjectTemplate } from '../ProjectTemplate';
import { TextSegmentationService } from './TextSegmentationService';
import { StructuralMarkerDetector } from './StructuralMarkerDetector';
import { OpenRouterClient, OpenRouterMessage } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';

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
   * Summarize an array of child texts into a parent content using the summarize prompt
   */
  public async summarizeChildrenToParent(childrenTexts: string[]): Promise<string> {
    const prompts = this.settings.getPrompts();
    const system = prompts.summarize_system
      .replace(/\{\{content\}\}/g, childrenTexts.join('\n\n'))
      .replace(/\{\{language\}\}/g, this.settings.getGlobalLanguage());

    let full = '';
    await this.client.streamingChat('editor', [{ role: 'system', content: system } as OpenRouterMessage], {
      onStart: () => {},
      onChunk: (c) => (full += c),
      onComplete: () => {},
      onError: (e) => {
        throw e;
      },
    });
    return full.trim();
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


