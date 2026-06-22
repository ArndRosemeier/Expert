/**
 * TemplateInferenceService
 *
 * Builds a fitting ProjectTemplate from a raw document so the full-text importer
 * no longer has to ask the user to pick a template up front.
 *
 * Hybrid strategy:
 *  1. Deterministic structure discovery: recurse StructuralMarkerDetector over
 *     the document (open-ended, no template) to find the natural nesting depth,
 *     a few sample titles per level, and the size of the smallest detected
 *     sections. This matches exactly what the segmentation step will follow for
 *     marked-up documents.
 *  2. Bounded LLM design pass: send a compact skeleton (per-level counts +
 *     sample titles + size stats + document opening) and ask the model to DESIGN
 *     the full hierarchy: the overall project type, the ordered level names, and
 *     how many EXTRA levels it added above the detected markers (coarser grouping
 *     layers, e.g. Acts) and below them (finer leaf layers, e.g. Scenes).
 *
 * The detected marker layers are realized by the marker-first segmentation. The
 * "below" layers are realized by the segmenter's LLM paragraph fallback. The
 * "above" layers (groupAboveCount) are realized separately by SpanGroupingService
 * after segmentation. This service therefore returns both the template and the
 * groupAboveCount the importer needs.
 */

import { ProjectTemplate } from '../ProjectTemplate';
import { OpenRouterClient } from '../OpenRouterClient';
import { SettingsManager } from '../SettingsManager';
import { StructuralMarkerDetector } from './StructuralMarkerDetector';
import { getPromptText } from '../PromptManager';

interface DiscoveredLevel {
  sectionCount: number;
  sampleTitles: string[];
  /** Median section size in characters at this level (0 when no sections). */
  medianChars: number;
}

interface HierarchyDesign {
  projectType: string;
  levelNames: string[];
  levelsAboveMarkers: number;
  levelsBelowMarkers: number;
}

/** Inference result: the proposed template plus how many top child levels are
 *  realized by upward grouping (rather than marker/LLM segmentation). */
export interface InferredTemplate {
  template: ProjectTemplate;
  groupAboveCount: number;
}

const MAX_CHILD_LEVELS = 4;
const MAX_SAMPLE_TITLES = 6;
const DOC_HEAD_CHARS = 600;
const APPROX_CHARS_PER_WORD = 6;
const APPROX_CHARS_PER_PARAGRAPH = 700;
/** A deepest detected section larger than this (chars) is too big to be a leaf. */
const LARGE_LEAF_THRESHOLD_CHARS = 4000;
/** Minimum top-level section count before the fallback adds a coarser grouping layer. */
const GROUP_ABOVE_MIN_SECTIONS = 8;
/** Target leaf output length (paragraphs) for inferred templates. */
const LEAF_TARGET_PARAGRAPHS = 5;

export class TemplateInferenceService {
  private readonly client: OpenRouterClient;
  private readonly settings: SettingsManager;
  private readonly detector = new StructuralMarkerDetector();

  constructor(client: OpenRouterClient, settings: SettingsManager) {
    this.client = client;
    this.settings = settings;
  }

  /**
   * Infer a fitting template for the document. Always returns at least one child
   * level (so plain prose still gets a usable hierarchy via LLM paragraph
   * segmentation at import time).
   */
  public async inferTemplate(text: string, fallbackName: string): Promise<InferredTemplate> {
    const levels = this.discoverStructure(text);
    const markerDepth = levels.length;
    const skeleton = this.buildSkeleton(levels, text);
    const design = await this.designHierarchy(skeleton, markerDepth, levels, fallbackName);

    const projectType = design.projectType.trim().length > 0 ? design.projectType.trim() : fallbackName;
    const childLevels = design.levelNames.map(n => n.trim()).filter(n => n.length > 0);
    const hierarchyLevels = [projectType, ...childLevels];

    // Leaf aims for a handful of paragraphs, matching normal project templates.
    const layerLengths: (number | null)[] = hierarchyLevels.map(() => null);
    layerLengths[layerLengths.length - 1] = LEAF_TARGET_PARAGRAPHS;

    const template = new ProjectTemplate(projectType, hierarchyLevels, layerLengths);
    // Grouping can only ever apply above real markers and must leave at least one
    // non-grouping child level beneath it to operate on.
    const groupAboveCount = Math.max(0, Math.min(design.levelsAboveMarkers, markerDepth > 0 ? childLevels.length - 1 : 0));
    return { template, groupAboveCount };
  }

  /**
   * Walk the document level by level, splitting each section's slice again until
   * no level produces further structure or the depth cap is reached. Returns one
   * DiscoveredLevel per detected child level (empty for unstructured prose).
   */
  private discoverStructure(text: string): DiscoveredLevel[] {
    const levels: DiscoveredLevel[] = [];
    let slices: string[] = [text];

    for (let depth = 0; depth < MAX_CHILD_LEVELS; depth++) {
      const childSlices: string[] = [];
      const childSizes: number[] = [];
      const sampleTitles: string[] = [];
      let sectionCount = 0;

      for (const slice of slices) {
        const detected = this.detector.detectChildSections(slice);
        if (!detected || detected.length < 2) {
          continue;
        }
        for (const section of detected) {
          sectionCount += 1;
          const childText = slice.slice(section.startChar, section.endChar);
          childSlices.push(childText);
          childSizes.push(childText.trim().length);
          const title = section.title.trim();
          if (title.length > 0 && sampleTitles.length < MAX_SAMPLE_TITLES) {
            sampleTitles.push(title);
          }
        }
      }

      if (sectionCount === 0) {
        break;
      }
      levels.push({ sectionCount, sampleTitles, medianChars: this.median(childSizes) });
      slices = childSlices;
    }

    return levels;
  }

  /**
   * Compact, token-bounded description of the detected structure for the LLM.
   */
  private buildSkeleton(levels: DiscoveredLevel[], text: string): string {
    const head = text.slice(0, DOC_HEAD_CHARS).replace(/\s+/g, ' ').trim();
    const lines: string[] = [];
    lines.push(`Document opening: ${head}`);
    lines.push(`Whole document: ~${this.approxWords(text.trim().length)} words.`);

    if (levels.length === 0) {
      lines.push('Detected structure: none (continuous prose, no structural markers).');
    } else {
      levels.forEach((level, index) => {
        const titles = level.sampleTitles.length > 0
          ? level.sampleTitles.map(t => `"${t}"`).join(', ')
          : '(no titles)';
        const isDeepest = index === levels.length - 1;
        const size = isDeepest
          ? ` Each section is ~${this.approxWords(level.medianChars)} words (~${this.approxParagraphs(level.medianChars)} paragraphs) on average.`
          : '';
        lines.push(`Detected level ${index + 1}: ${level.sectionCount} sections. Sample titles: ${titles}.${size}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Ask the model to design the hierarchy. Returns a safe generic design on any
   * malformed/unexpected response (an agreed naming nicety, not a masked
   * correctness error); a thrown network error still propagates loudly.
   */
  private async designHierarchy(
    skeleton: string,
    markerDepth: number,
    levels: DiscoveredLevel[],
    fallbackName: string
  ): Promise<HierarchyDesign> {
    const template = getPromptText('import_template_design');
    const prompt = template
      .replace(/\{\{skeleton\}\}/g, skeleton)
      .replace(/\{\{marker_depth\}\}/g, String(markerDepth))
      .replace(/\{\{language\}\}/g, this.settings.getGlobalLanguage());

    const raw = await this.client.chat('editor', prompt);
    return this.parseDesign(raw, markerDepth, levels, fallbackName);
  }

  private parseDesign(
    raw: string,
    markerDepth: number,
    levels: DiscoveredLevel[],
    fallbackName: string
  ): HierarchyDesign {
    const levelNames: string[] = [];
    const levelRe = /<level>([\s\S]*?)<\/level>/gi;
    let levelMatch: RegExpExecArray | null;
    while ((levelMatch = levelRe.exec(raw)) !== null) {
      const name = levelMatch[1]!.trim();
      if (name.length > 0) {
        levelNames.push(name);
      }
    }

    if (levelNames.length === 0) {
      console.warn('TemplateInferenceService: design response had no usable <level> entries; using generic hierarchy.');
      return this.genericDesign(markerDepth, levels, fallbackName);
    }

    const total = levelNames.length;
    const extra = total - markerDepth;
    if (extra < 0) {
      // The model dropped detected levels entirely; its naming can't be trusted.
      console.warn('TemplateInferenceService: design response omitted detected levels; using generic hierarchy.');
      return this.genericDesign(markerDepth, levels, fallbackName);
    }

    const projectType = this.extractTag(raw, 'projectType');

    // Anchor the detected marker levels in the MIDDLE no matter what the model
    // reports for the counts: the first `above` names are coarser grouping layers,
    // the last `below` names are finer leaf layers, and the markerDepth names in
    // between are the detected levels (so the marker layer is never lost). We trust
    // the model's counts when they are self-consistent, otherwise we reconstruct
    // them so they always satisfy above + markerDepth + below === total.
    let above = this.coerceInt(this.extractTag(raw, 'levelsAboveMarkers'));
    let below = this.coerceInt(this.extractTag(raw, 'levelsBelowMarkers'));
    const consistent = Number.isFinite(above) && above >= 0
      && Number.isFinite(below) && below >= 0
      && above + markerDepth + below === total;

    if (!consistent) {
      const deepest = levels[levels.length - 1];
      const deepestLarge = deepest !== undefined && deepest.medianChars > LARGE_LEAF_THRESHOLD_CHARS;
      below = Number.isFinite(below) ? Math.max(0, Math.min(below, extra)) : (deepestLarge ? Math.min(1, extra) : 0);
      above = extra - below;
    }

    // Markers cannot be grouped above when none were detected.
    if (markerDepth === 0) {
      above = 0;
      below = total;
    }

    return { projectType, levelNames, levelsAboveMarkers: above, levelsBelowMarkers: below };
  }

  /**
   * Safe default design: name the detected levels conventionally (innermost is a
   * Chapter), add a finer Scene leaf when the smallest detected sections are too
   * large to be leaves, and add a coarser grouping layer when there are many
   * top-level sections that plausibly group. Always preserves the detected levels.
   */
  private genericDesign(markerDepth: number, levels: DiscoveredLevel[], fallbackName: string): HierarchyDesign {
    if (markerDepth === 0) {
      // No markers at all: one chapter level + a scene leaf, both realized by the
      // segmenter's LLM paragraph splitting.
      return { projectType: fallbackName, levelNames: ['Chapter', 'Scene'], levelsAboveMarkers: 0, levelsBelowMarkers: 2 };
    }

    const deepest = levels[levels.length - 1];
    const needsLeaf = deepest !== undefined && deepest.medianChars > LARGE_LEAF_THRESHOLD_CHARS;
    const topCount = levels[0]?.sectionCount ?? 0;
    // Only group above the common single-marker case to keep fallback names clean.
    const addAbove = markerDepth === 1 && topCount >= GROUP_ABOVE_MIN_SECTIONS;

    const aboveNames = addAbove ? ['Part'] : [];
    const markerNames = this.genericMarkerNames(markerDepth);
    const belowNames = needsLeaf ? ['Scene'] : [];

    return {
      projectType: fallbackName,
      levelNames: [...aboveNames, ...markerNames, ...belowNames],
      levelsAboveMarkers: aboveNames.length,
      levelsBelowMarkers: belowNames.length
    };
  }

  /** Conventional labels for the detected marker levels, outermost -> innermost. */
  private genericMarkerNames(count: number): string[] {
    if (count <= 0) {
      return [];
    }
    // A single detected level in prose is almost always a chapter.
    if (count === 1) {
      return ['Chapter'];
    }
    const ladder = ['Part', 'Chapter', 'Section', 'Subsection'];
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      names.push(ladder[i] ?? `Level ${i + 1}`);
    }
    return names;
  }

  /** Return the trimmed text content of the first <tag>...</tag>, or '' if absent. */
  private extractTag(raw: string, tag: string): string {
    const match = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1]!.trim() : '';
  }

  private coerceInt(value: unknown): number {
    if (typeof value === 'number') {
      return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value))) {
      return Math.trunc(Number(value));
    }
    return NaN;
  }

  private median(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
  }

  private approxWords(chars: number): number {
    return Math.max(0, Math.round(chars / APPROX_CHARS_PER_WORD));
  }

  private approxParagraphs(chars: number): number {
    return Math.max(1, Math.round(chars / APPROX_CHARS_PER_PARAGRAPH));
  }
}
