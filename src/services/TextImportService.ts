/**
 * TextImportService
 *
 * Single orchestration point for importing a text/PDF document into a project.
 * Two modes:
 *   - buildConceptProject: AI reads the document and produces a titled project
 *     (template + sectioned outline + conditional context). The sectioned root
 *     outline is split into children deterministically at first generation.
 *   - buildFullTextProject: preserve the source verbatim at the leaves, build the
 *     hierarchy by (markers-first) segmentation, summarize upward, and extract
 *     conditional context from the bounded root summary.
 *
 * Both modes create conditional context items via the shared
 * applyConditionalContextItems helper, so context handling is identical
 * everywhere. The caller is responsible for finalizing (registering + UI).
 */

import * as pdfjsLib from 'pdfjs-dist';

import { ProjectManager } from '../ProjectManager';
import { ProjectTemplate } from '../ProjectTemplate';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';
import { LoopOrchestrator } from '../LoopOrchestrator';
import { AssertFlatTemplateCopy } from '../ProjectUtils';
import { applyConditionalContextItems } from '../ContextFormat';
import { getPromptText } from '../PromptManager';
import { ProjectGenerationService } from '../ui/modals/services/ProjectGenerationService';
import { HierarchicalImportService, SegmentedSpan, ImportChildInfo } from './HierarchicalImportService';
import { SpanGroupingService } from './SpanGroupingService';

export interface FullTextImportHooks {
  status?: (message: string) => void;
  splitStart?: (levelName: string, parentTitle: string) => void;
  splitDone?: (levelName: string, parentTitle: string, count: number) => void;
  summarizeStart?: (title: string, count: number) => void;
  summarizeDone?: (title: string) => void;
}

export class TextImportService {
  private readonly orchestrator: LoopOrchestrator;
  private readonly settings: SettingsManager;
  private readonly client: OpenRouterClient;

  constructor(orchestrator: LoopOrchestrator, settings: SettingsManager, client: OpenRouterClient) {
    this.orchestrator = orchestrator;
    this.settings = settings;
    this.client = client;
  }

  /**
   * Read a .txt/.md file as text, or extract text from a .pdf file.
   */
  public static async acquireText(file: File): Promise<string> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
      const text = await TextImportService.extractTextFromPDF(file);
      if (!text.trim()) {
        throw new Error('No text content found in PDF. The PDF may contain only images or be empty.');
      }
      return text;
    }
    return file.text();
  }

  /**
   * Concept mode: reuse the AI creator pipeline to produce a titled project with
   * a sectioned outline and conditional context. Children are NOT built here;
   * they are created at generation time from the sectioned outline.
   */
  public async buildConceptProject(text: string, fileName: string): Promise<ProjectManager> {
    const generator = new ProjectGenerationService(this.client, this.settings);
    const result = await generator.generateProject({
      description: text,
      options: { includeCharacters: true, includeStyleGuide: true }
    });

    const title = result.title.trim().length > 0 ? result.title.trim() : this.baseName(fileName);
    const project = new ProjectManager(title, result.template, this.orchestrator, this.settings, this.client);
    project.setLanguage(this.settings.getLanguage());
    AssertFlatTemplateCopy(project);

    const root = project.rootNode;
    root.setTitleWithTags(title, ['master', 'imported']);
    root.setContent(result.content, 'master');
    applyConditionalContextItems(root, result.context);

    return project;
  }

  /**
   * Full-text mode: build the hierarchy by segmentation (markers-first with a
   * bounded LLM fallback inside HierarchicalImportService), keep verbatim source
   * at the leaves, summarize upward, then extract conditional context from the
   * (bounded) root summary.
   */
  public async buildFullTextProject(
    text: string,
    fileName: string,
    template: ProjectTemplate,
    hooks?: FullTextImportHooks,
    groupAboveCount: number = 0
  ): Promise<ProjectManager> {
    const importer = new HierarchicalImportService(this.client, this.settings);

    // The top `groupAboveCount` child levels are realized by upward grouping after
    // segmentation; the segmenter only handles the marker-anchored level and the
    // finer (leaf) levels beneath it.
    const childLevels = template.hierarchyLevels.slice(1);
    const groupingNames = childLevels.slice(0, groupAboveCount); // outermost -> innermost
    const segmentationChildLevels = childLevels.slice(groupAboveCount);
    const rootLabel = template.hierarchyLevels[0] || template.name;
    const segmentationTemplate = new ProjectTemplate(rootLabel, [rootLabel, ...segmentationChildLevels]);

    const segTopLabel = (segmentationChildLevels[0] || 'parts').toLowerCase();
    hooks?.status?.(`Finding ${segTopLabel} in ${fileName}...`);
    const spans = await importer.segmentByTemplate(text, segmentationTemplate, {
      splitStart: (level, parentTitle) => hooks?.splitStart?.(level, parentTitle),
      splitDone: (level, parentTitle, count) => hooks?.splitDone?.(level, parentTitle, count)
    });

    // Drop spans that carry only a heading/title and no actual body text, so
    // segmentation can never produce title-only scenes with empty content.
    let topSpans = this.pruneEmptySpans(text, spans);
    hooks?.status?.(`Found ${topSpans.length} ${segTopLabel}. Building project...`);

    // Realize the coarser grouping layers from innermost outward. Each successful
    // grouping adds one parent layer; if the model cannot produce a valid grouping
    // we stop (no bogus single-group layers) and the final template is trimmed to
    // match what was actually built.
    const realizedGroupNames: string[] = [];
    const grouper = new SpanGroupingService(this.client, this.settings);
    for (let k = groupingNames.length - 1; k >= 0; k--) {
      const name = groupingNames[k]!;
      hooks?.status?.(`Grouping ${topSpans.length} into ${name.toLowerCase()}...`);
      const grouped = await grouper.groupTopSpans(text, topSpans, name);
      if (!grouped) {
        break;
      }
      topSpans = grouped;
      realizedGroupNames.unshift(name);
    }

    const finalChildLevels = [...realizedGroupNames, ...segmentationChildLevels];
    const finalLevels = [rootLabel, ...finalChildLevels];
    const finalLayerLengths: (number | null)[] = finalLevels.map(() => null);
    finalLayerLengths[finalLayerLengths.length - 1] = template.layerLengths[template.layerLengths.length - 1] ?? null;
    const finalTemplate = new ProjectTemplate(template.name, finalLevels, finalLayerLengths);

    const projectTitle = this.baseName(fileName);
    const project = await this.buildTreeFromSpans(projectTitle, finalTemplate, text, topSpans, importer, hooks);
    project.setLanguage(this.settings.getLanguage());

    // Extract conditional context from the bounded root summary (never the whole
    // document) so context creation stays token-bounded for any document size.
    const root = project.rootNode;
    const rootSummary = root.content;
    if (rootSummary.trim().length > 0) {
      hooks?.status?.('Extracting context from summary...');
      const extracted = await this.extractContextFromDigest(rootSummary);
      applyConditionalContextItems(root, extracted);
    }

    return project;
  }

  /**
   * Recursively remove spans that contain no real body text (only a heading or
   * the title line, or pure whitespace). A parent that loses all of its children
   * is kept only if its own verbatim slice still has body text (becoming a leaf);
   * otherwise it is dropped too. This prevents title-only scenes from being
   * imported when two structural markers sit back-to-back with nothing between.
   */
  private pruneEmptySpans(fullText: string, spans: SegmentedSpan[]): SegmentedSpan[] {
    const result: SegmentedSpan[] = [];
    for (const span of spans) {
      if (span.children && span.children.length > 0) {
        const prunedChildren = this.pruneEmptySpans(fullText, span.children);
        if (prunedChildren.length > 0) {
          result.push({ ...span, children: prunedChildren });
        } else if (this.spanHasBodyText(fullText, span)) {
          // All children were empty; keep this span as a verbatim leaf instead.
          result.push({ title: span.title, startChar: span.startChar, endChar: span.endChar });
        }
      } else if (this.spanHasBodyText(fullText, span)) {
        result.push({ title: span.title, startChar: span.startChar, endChar: span.endChar });
      }
    }
    return result;
  }

  /**
   * True when a span's source slice has narrative text beyond its leading
   * heading/title line. The leading heading line (and any setext underline) is
   * ignored because it merely repeats the node title.
   */
  private spanHasBodyText(fullText: string, span: SegmentedSpan): boolean {
    const raw = fullText.slice(span.startChar, span.endChar);
    const lines = raw.split(/\r?\n/);

    let i = 0;
    while (i < lines.length && lines[i]!.trim().length === 0) {
      i++;
    }
    if (i < lines.length && this.isHeadingOrTitleLine(lines[i]!.trim(), span.title)) {
      i++;
      if (i < lines.length && /^(=+|-{3,})$/.test(lines[i]!.trim())) {
        i++;
      }
    }

    return lines.slice(i).join('\n').trim().length > 0;
  }

  /**
   * Heuristic match for a structural heading line or a line that simply repeats
   * the span's title. Kept in sync with StructuralMarkerDetector's signals
   * (ATX / numbered / thematic-break) plus exact title equality.
   */
  private isHeadingOrTitleLine(lineTrim: string, title: string): boolean {
    if (lineTrim.length === 0) {
      return false;
    }
    const titleTrim = title.trim();
    if (titleTrim.length > 0 && lineTrim.toLowerCase() === titleTrim.toLowerCase()) {
      return true;
    }
    if (/^#{1,6}\s+/.test(lineTrim)) {
      return true;
    }
    if (/^\d+(?:\.\d+)*[.)]?\s+/.test(lineTrim)) {
      return true;
    }
    if (/^([*_-])(?:\s*\1){2,}$/.test(lineTrim)) {
      return true;
    }
    return false;
  }

  private async buildTreeFromSpans(
    projectTitle: string,
    template: ProjectTemplate,
    fullText: string,
    spans: SegmentedSpan[],
    importer: HierarchicalImportService,
    hooks?: FullTextImportHooks
  ): Promise<ProjectManager> {
    const project = new ProjectManager(projectTitle, template, this.orchestrator, this.settings, this.client);
    AssertFlatTemplateCopy(project);

    const root = project.rootNode;
    // The root has no parent, so it gets only the 'imported' marker (no
    // consistent_to_parent). Set unconditionally so the marker is present even
    // when the root title already matches the project title.
    root.setTitleWithTags(projectTitle, ['master', 'imported']);

    // Build the subtree for a parent, returning each child's title + final content
    // so the parent can be written as a ===Title=== sectioned outline (the same
    // deterministic format a normal project uses, so the import is editable like
    // one: adding a part, regenerating a branch, etc.).
    const buildChildren = async (parentId: string, nodeSpans: SegmentedSpan[]): Promise<ImportChildInfo[]> => {
      const infos: ImportChildInfo[] = [];
      for (const span of nodeSpans) {
        const node = project.addNode(span.title, parentId);

        let nodeContent: string;
        if (span.children && span.children.length > 0) {
          const childInfos = await buildChildren(node.id, span.children);
          if (childInfos.length > 0) {
            hooks?.summarizeStart?.(span.title, childInfos.length);
            nodeContent = await this.outlineFromChildren(importer, childInfos);
            hooks?.summarizeDone?.(span.title);
          } else {
            // No usable children: fall back to the verbatim source slice.
            nodeContent = fullText.slice(span.startChar, span.endChar).trim();
          }
        } else {
          // Leaf: keep the exact source slice verbatim.
          nodeContent = fullText.slice(span.startChar, span.endChar).trim();
        }
        // Imported nodes are consistent with their parent by construction (the
        // parent's outline is generated from these children), so we pre-apply the
        // consistent_to_parent tag the coherence check would otherwise add, plus
        // an 'imported' marker.
        node.setContentWithTags(nodeContent, ['master', 'imported', 'consistent_to_parent']);
        infos.push({ title: span.title, content: nodeContent });
      }
      return infos;
    };

    const topInfos = await buildChildren(root.id, spans);

    if (topInfos.length > 0) {
      hooks?.summarizeStart?.(projectTitle, topInfos.length);
      const rootContent = await this.outlineFromChildren(importer, topInfos);
      root.setContent(rootContent, 'master');
      hooks?.summarizeDone?.(projectTitle);
    }

    return project;
  }

  /**
   * Assemble a parent's content as a `===Title===` sectioned outline, one section
   * per child, using LLM-written outline descriptions as the bodies. The section
   * titles are exactly the child titles so deterministic child creation matches
   * them. Falls back to a short verbatim excerpt per child when the model fails to
   * return a well-formed, count-matching description list.
   */
  private async outlineFromChildren(importer: HierarchicalImportService, children: ImportChildInfo[]): Promise<string> {
    const bodies = await importer.outlineChildren(children);
    return children
      .map((child, i) => `===${child.title}===\n${bodies[i] ?? ''}`)
      .join('\n\n');
  }

  private async extractContextFromDigest(digest: string): Promise<string> {
    const template = getPromptText('context_extraction');
    const prompt = template
      .replace(/\{\{digest\}\}/g, digest)
      .replace(/\{\{language\}\}/g, this.settings.getGlobalLanguage());
    return this.client.chat('editor', prompt);
  }

  private baseName(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, '');
  }

  private static async extractTextFromPDF(file: File): Promise<string> {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      fullText += pageText + '\n\n';
    }

    return fullText.trim();
  }
}
