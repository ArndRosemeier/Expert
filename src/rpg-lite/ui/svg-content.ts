/**
 * Utilities for turning `<svg>…</svg>` markup that an LLM writes directly into
 * its text reply into a safely-rendered inline graphic.
 *
 * Rendering strategy: the extracted SVG is turned into a `data:image/svg+xml`
 * URL and shown via an `<img>` element. Browsers do not execute scripts or
 * honour external references loaded through `<img>`, so model-authored markup
 * cannot run code or leak requests — no additional sanitisation is required.
 */

/** A contiguous run of the message content: either plain text or one SVG block. */
export type RPGLiteContentSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'svg'; readonly svg: string };

/**
 * Matches a complete `<svg …>…</svg>` block, optionally wrapped in a Markdown
 * code fence (e.g. ```svg … ```). Capture group 1 is the bare SVG markup.
 *
 * Non-greedy body so multiple SVGs in one message are captured individually.
 * An SVG with no closing tag simply does not match and stays as text — the
 * failure is visible rather than silently swallowed.
 */
const SVG_BLOCK_REGEX =
  /(?:```[A-Za-z]*[ \t]*\r?\n)?(<svg[\s\S]*?<\/svg>)(?:[ \t]*\r?\n?```)?/gi;

/**
 * Splits message content into an ordered list of text and SVG segments.
 * Text between/around SVG blocks is preserved verbatim (including empty runs
 * are dropped so callers don't render blank text nodes).
 */
export function splitSvgSegments(content: string): RPGLiteContentSegment[] {
  const segments: RPGLiteContentSegment[] = [];
  const regex = new RegExp(SVG_BLOCK_REGEX.source, SVG_BLOCK_REGEX.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const svg = match[1];
    if (svg === undefined) {
      throw new Error('SVG_BLOCK_REGEX matched without capturing the expected groups.');
    }

    const precedingText = content.slice(lastIndex, match.index);
    if (precedingText.length > 0) {
      segments.push({ kind: 'text', text: precedingText });
    }

    segments.push({ kind: 'svg', svg });
    lastIndex = match.index + fullMatch.length;
  }

  const trailingText = content.slice(lastIndex);
  if (trailingText.length > 0) {
    segments.push({ kind: 'text', text: trailingText });
  }

  return segments;
}

/** True when the content contains at least one renderable SVG block. */
export function contentHasSvg(content: string): boolean {
  const regex = new RegExp(SVG_BLOCK_REGEX.source, SVG_BLOCK_REGEX.flags);
  return regex.test(content);
}

/**
 * Encodes SVG markup into a `data:image/svg+xml` URL suitable for an `<img>`
 * `src`. `encodeURIComponent` escapes `#`, `<`, quotes, etc. so colours like
 * `fill="#fff"` and the markup itself survive intact.
 */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
