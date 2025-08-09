import { ProjectTemplate } from '../ProjectTemplate';
import { TextSegmentationService } from './TextSegmentationService';
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
  private readonly client: OpenRouterClient;
  private readonly settings: SettingsManager;

  constructor(client: OpenRouterClient, settings: SettingsManager) {
    this.client = client;
    this.settings = settings;
    this.segmentation = TextSegmentationService.getInstance();
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
    const topGranularity = this.normalizeSplitScope(topLevelName);

    const topSections = await this.splitOneLevel(text, topGranularity, topTarget, (index) => this.defaultTitleForLevel(topLevelName, index));

    // Iteratively split deeper levels, maintaining nested structure without overwriting
    let frontier: SegmentedSpan[] = topSections;
    for (let levelIndex = 2; levelIndex < levels.length; levelIndex++) {
      const levelName = levels[levelIndex] || `Level ${levelIndex + 1}`;
      const target = this.parseFixedCount(levelName);
      const granularity = this.normalizeSplitScope(levelName);

      const nextFrontier: SegmentedSpan[] = [];

      for (const parent of frontier) {
        const childText = text.slice(parent.startChar, parent.endChar);
        hooks?.splitStart?.(levelName, parent.title);
        const children = await this.splitOneLevel(childText, granularity, target, (i) => this.defaultTitleForLevel(levelName, i));
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

  private async splitOneLevel(
    text: string,
    splitScope: string,
    targetCount: number | null,
    defaultTitler: (index1Based: number) => string
  ): Promise<SegmentedSpan[]> {
    // Use paragraph-based segmentation and map back to character spans
    const segOptions: Parameters<TextSegmentationService['segmentByParagraphMarkers']>[1] = {
      granularity: 'custom',
      language: this.settings.getGlobalLanguage(),
      purpose: 'editor'
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
          title: defaultTitler(1),
          startChar: 0,
          endChar: text.length,
        },
      ];
    }

    const spans: SegmentedSpan[] = [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      const startParagraph = s.startParagraphIndex; // 1-based
      const endParagraphExclusive = i + 1 < sections.length ? sections[i + 1]!.startParagraphIndex : paragraphs.length + 1;

      const startChar = paragraphs[startParagraph - 1]!.startChar;
      const endChar = endParagraphExclusive === paragraphs.length + 1 ? text.length : paragraphs[endParagraphExclusive - 1]!.startChar;

      const title = this.isFixedCountScope(splitScope) ? defaultTitler(i + 1) : s.title || defaultTitler(i + 1);

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

  private normalizeSplitScope(levelName: string): string {
    // Return a simple scope keyword (acts, chapters, scenes...) or generic 'parts'
    const base = levelName.replace(/\b\d+\b/g, '').trim().toLowerCase();
    if (/chapter/.test(base)) return 'chapters';
    if (/scene/.test(base)) return 'scenes';
    if (/act/.test(base)) return 'acts';
    if (/part/.test(base)) return 'parts';
    return 'parts';
  }

  private defaultTitleForLevel(levelName: string, index1: number): string {
    const base = levelName.replace(/\b\d+\b/g, '').trim();
    // Standardize common names like Chapter/Scene
    if (/chapter/i.test(base)) return `Chapter ${index1}`;
    if (/scene/i.test(base)) return `Scene ${index1}`;
    if (/act/i.test(base)) return `Act ${index1}`;
    if (/part/i.test(base)) return `Part ${index1}`;
    return `${base || 'Section'} ${index1}`;
  }
}


