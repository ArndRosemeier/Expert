/**
 * StructuralMarkerDetector
 *
 * Language-agnostic detection of section boundaries inside a block of text.
 *
 * IMPORTANT: This detector keys ONLY on formatting/structure signals that are
 * independent of any natural language. It must NEVER look for words like
 * "Chapter", "Part", "Kapitel", etc. The supported signals are:
 *   - Markdown ATX headings:      #, ##, ... ###### (depth = number of '#')
 *   - Setext headings:            a text line underlined by === (depth 1) or --- (depth 2)
 *   - Numbered headings:          1, 1.2, 3.4.1 (depth = count of dotted numbers)
 *   - Thematic breaks/separators: ***, ---, ___ (same-level dividers, no title)
 *   - Isolated short lines:       a short line surrounded by blank lines (weak heading)
 *
 * The detector is used per text slice. It returns the contiguous sections at the
 * SHALLOWEST heading depth present (so the orchestrator's recursive descent maps
 * naturally: the first split corresponds to the first template sub-level, the
 * next deeper split to the next, and so on). When a slice begins with its own
 * (shallower) heading, that leading heading is treated as the slice's own title
 * and ignored for boundary purposes, so recursion descends into deeper headings.
 *
 * Returns null when no usable structure is found, signalling the caller to fall
 * back to LLM-based segmentation.
 */

export interface DetectedSection {
  /** Start offset within the provided slice (inclusive). */
  startChar: number;
  /** End offset within the provided slice (exclusive). */
  endChar: number;
  /** Title from the heading text, or empty string when the marker carries no title. */
  title: string;
}

interface LineInfo {
  text: string;
  startChar: number;
  endChar: number; // exclusive, not including the line break
}

interface HeadingMarker {
  startChar: number; // start offset of the heading line
  depth: number;
  title: string;
}

const MAX_NUMBERED_HEADING_LENGTH = 80;
const MAX_SHORTLINE_HEADING_LENGTH = 60;

export class StructuralMarkerDetector {
  /**
   * Detect the child sections of a text slice using structural markers only.
   * Returns null if no reliable structure produces at least two sections.
   */
  public detectChildSections(text: string): DetectedSection[] | null {
    if (!text || text.trim().length === 0) {
      return null;
    }

    const lines = this.computeLines(text);

    // Priority 1: real headings (ATX / setext / numbered) carry depth + title.
    const headings = this.detectHeadingMarkers(lines);
    const fromHeadings = this.sectionsFromHeadings(text, headings);
    if (fromHeadings) {
      return fromHeadings;
    }

    // Priority 2: thematic-break separators (same-level dividers, no titles).
    const fromSeparators = this.sectionsFromSeparators(text, lines);
    if (fromSeparators) {
      return fromSeparators;
    }

    // Priority 3 (weakest): isolated short lines acting as headings.
    const fromShortLines = this.sectionsFromShortLines(text, lines);
    if (fromShortLines) {
      return fromShortLines;
    }

    return null;
  }

  private computeLines(text: string): LineInfo[] {
    const lines: LineInfo[] = [];
    let cursor = 0;
    const re = /\r?\n/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = cursor;
      const end = match.index;
      lines.push({ text: text.slice(start, end), startChar: start, endChar: end });
      cursor = match.index + match[0].length;
    }
    // Trailing line (no terminating newline)
    lines.push({ text: text.slice(cursor), startChar: cursor, endChar: text.length });
    return lines;
  }

  private detectHeadingMarkers(lines: LineInfo[]): HeadingMarker[] {
    const markers: HeadingMarker[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.text.trim();
      if (trimmed.length === 0) {
        continue;
      }

      // ATX heading: one to six leading '#', a space, then the title.
      const atx = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (atx && atx[1] && atx[2]) {
        markers.push({ startChar: line.startChar, depth: atx[1].length, title: atx[2].trim() });
        continue;
      }

      // Setext heading: current text line underlined by === or --- on the next line.
      const next = lines[i + 1];
      if (next) {
        const underline = next.text.trim();
        if (/^=+$/.test(underline)) {
          markers.push({ startChar: line.startChar, depth: 1, title: trimmed });
          continue;
        }
        // Require >= 3 dashes so we do not confuse this with a thematic break.
        if (/^-{3,}$/.test(underline) && !this.isThematicBreak(trimmed)) {
          markers.push({ startChar: line.startChar, depth: 2, title: trimmed });
          continue;
        }
      }

      // Numbered heading: dotted decimal prefix, short standalone line.
      const numbered = trimmed.match(/^(\d+(?:\.\d+)*)[.)]?\s+(.+)$/);
      if (numbered && numbered[1] && numbered[2] && trimmed.length <= MAX_NUMBERED_HEADING_LENGTH) {
        const depth = numbered[1].split('.').length;
        markers.push({ startChar: line.startChar, depth, title: trimmed });
        continue;
      }
    }

    return markers;
  }

  private sectionsFromHeadings(text: string, markers: HeadingMarker[]): DetectedSection[] | null {
    if (markers.length === 0) {
      return null;
    }

    let working = markers;

    // If the first marker sits at the very start of the slice AND is strictly
    // shallower than the rest, it is this slice's own heading (consumed by the
    // parent). Drop it so we split on the deeper child headings instead.
    const first = markers[0]!;
    const startsAtSliceTop = text.slice(0, first.startChar).trim().length === 0;
    if (startsAtSliceTop && markers.length > 1) {
      const restMinDepth = Math.min(...markers.slice(1).map(m => m.depth));
      if (first.depth < restMinDepth) {
        working = markers.slice(1);
      }
    }

    const minDepth = Math.min(...working.map(m => m.depth));
    const boundaries = working.filter(m => m.depth === minDepth);
    if (boundaries.length < 2) {
      return null;
    }

    return this.buildContiguousSections(text, boundaries.map(b => ({ startChar: b.startChar, title: b.title })));
  }

  private sectionsFromSeparators(text: string, lines: LineInfo[]): DetectedSection[] | null {
    const separatorLines = lines.filter(l => this.isThematicBreak(l.text.trim()));
    if (separatorLines.length < 1) {
      return null;
    }

    // Sections are the spans BETWEEN separators (the separator lines themselves
    // are kept inside the following span so no source text is lost). Build
    // boundaries at the start of each content run.
    const boundaries: { startChar: number; title: string }[] = [{ startChar: 0, title: '' }];
    for (const sep of separatorLines) {
      boundaries.push({ startChar: sep.startChar, title: '' });
    }

    const sections = this.buildContiguousSections(text, boundaries);
    // Need at least two non-trivial sections to count as a real division.
    const meaningful = sections.filter(s => text.slice(s.startChar, s.endChar).trim().length > 0);
    if (meaningful.length < 2) {
      return null;
    }
    return sections;
  }

  private sectionsFromShortLines(text: string, lines: LineInfo[]): DetectedSection[] | null {
    const candidates: HeadingMarker[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.text.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_SHORTLINE_HEADING_LENGTH) {
        continue;
      }
      // Must not end like a sentence/clause (structural heading heuristic).
      if (/[.!?:,;]$/.test(trimmed)) {
        continue;
      }
      const prev = lines[i - 1];
      const next = lines[i + 1];
      const prevBlank = !prev || prev.text.trim().length === 0;
      const nextBlank = !next || next.text.trim().length === 0;
      if (prevBlank && nextBlank) {
        candidates.push({ startChar: line.startChar, depth: 1, title: trimmed });
      }
    }

    if (candidates.length < 2) {
      return null;
    }

    return this.buildContiguousSections(text, candidates.map(c => ({ startChar: c.startChar, title: c.title })));
  }

  /**
   * Build contiguous, non-overlapping sections that cover [0, textLength).
   * The first section absorbs any preamble before the first boundary and is
   * titled by the first boundary. Each subsequent boundary starts a new section.
   */
  private buildContiguousSections(text: string, boundaries: { startChar: number; title: string }[]): DetectedSection[] {
    const sorted = [...boundaries].sort((a, b) => a.startChar - b.startChar);
    const sections: DetectedSection[] = [];
    const textLength = text.length;

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]!;
      const isFirst = i === 0;
      const start = isFirst ? 0 : current.startChar;
      const end = i + 1 < sorted.length ? sorted[i + 1]!.startChar : textLength;
      if (end <= start) {
        continue;
      }
      sections.push({ startChar: start, endChar: end, title: current.title });
    }

    return sections;
  }

  private isThematicBreak(trimmed: string): boolean {
    // ***, ---, ___ with optional spaces between the markers (>= 3 markers).
    return /^([*_-])(?:\s*\1){2,}$/.test(trimmed);
  }
}
