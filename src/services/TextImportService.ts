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
import { HierarchicalImportService, SegmentedSpan } from './HierarchicalImportService';

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
    root.setTitle(title, 'master');
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
    hooks?: FullTextImportHooks
  ): Promise<ProjectManager> {
    const importer = new HierarchicalImportService(this.client, this.settings);

    const topLevelLabel = (template.hierarchyLevels[1] || 'parts').toLowerCase();
    hooks?.status?.(`Finding ${topLevelLabel} in ${fileName}...`);
    const spans = await importer.segmentByTemplate(text, template, {
      splitStart: (level, parentTitle) => hooks?.splitStart?.(level, parentTitle),
      splitDone: (level, parentTitle, count) => hooks?.splitDone?.(level, parentTitle, count)
    });
    hooks?.status?.(`Found ${spans.length} ${topLevelLabel} at top level. Building project...`);

    const projectTitle = this.baseName(fileName);
    const project = await this.buildTreeFromSpans(projectTitle, template, text, spans, importer, hooks);
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
    root.setTitle(projectTitle, 'master');

    const buildChildren = async (parentId: string, nodeSpans: SegmentedSpan[]): Promise<string[]> => {
      const contents: string[] = [];
      for (const span of nodeSpans) {
        const node = project.addNode(span.title, parentId);

        let nodeContent: string;
        if (span.children && span.children.length > 0) {
          const childContents = await buildChildren(node.id, span.children);
          if (childContents.length > 0) {
            hooks?.summarizeStart?.(span.title, childContents.length);
            nodeContent = await importer.summarizeChildrenToParent(childContents);
            hooks?.summarizeDone?.(span.title);
          } else {
            // No usable children: fall back to the verbatim source slice.
            nodeContent = fullText.slice(span.startChar, span.endChar).trim();
          }
        } else {
          // Leaf: keep the exact source slice verbatim.
          nodeContent = fullText.slice(span.startChar, span.endChar).trim();
        }
        node.setContent(nodeContent, 'master');
        contents.push(nodeContent);
      }
      return contents;
    };

    const topContents = await buildChildren(root.id, spans);

    if (topContents.length > 0) {
      hooks?.summarizeStart?.(projectTitle, topContents.length);
      const rootContent = await importer.summarizeChildrenToParent(topContents);
      root.setContent(rootContent, 'master');
      hooks?.summarizeDone?.(projectTitle);
    }

    return project;
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
