/**
 * Rich text renderer for narrator prose, ported from the rpg-lite module.
 *
 * Two capabilities:
 *  - XML folding: complete <tag>...</tag> elements become foldable; <hidden>
 *    blocks are folded by default (the player can reveal them). This lets the
 *    narrator keep internal/continuity notes out of the way without losing them.
 *  - Highlighting: direct speech, XML/JSON, emphasis, actions, and dice rolls
 *    are styled to make the prose more readable.
 *
 * Output is HTML; all source text is escaped first, so it is injection-safe.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Convert raw narrator text into highlighted, foldable HTML. */
export function renderWorldRpgContent(content: string): string {
  let result = escapeHtml(content);

  // Complete XML elements with folding capability (non-greedy, scoped to the
  // matching close tag). <hidden> starts folded.
  let foldId = 0;
  result = result.replace(
    /(&lt;([A-Za-z_][\w:\-.]*)(?:\s+[^&]*?)?&gt;)([\s\S]*?)(&lt;\/\2&gt;)/g,
    (_match, openTag: string, tagName: string, inner: string, closeTag: string) => {
      const id = `wr-xml-fold-${foldId++}`;
      const isHidden = tagName.toLowerCase() === 'hidden';
      const foldedClass = isHidden ? ' xml-folded' : '';
      return `<span class="world-rpg-xml-foldable${foldedClass}" data-fold-id="${id}">` +
        `<span class="world-rpg-xml-fold-toggle" data-toggle-id="${id}">` +
        `<span class="world-rpg-xml-fold-icon">${isHidden ? '▶' : '▼'}</span>` +
        `<span class="world-rpg-xml-fold-tagname">${tagName}</span>` +
        `<span class="world-rpg-highlight-xml-tag world-rpg-xml-fold-open-tag">${openTag}</span>` +
        `</span>` +
        `<span class="world-rpg-xml-fold-content" data-content-id="${id}">${inner}</span>` +
        `<span class="world-rpg-highlight-xml-tag">${closeTag}</span>` +
        `</span>`;
    }
  );

  // Self-closing XML tags: <tag />
  result = result.replace(
    /(&lt;[A-Za-z_][\w:\-.]*(?:\s+[^&]*?)?\/&gt;)/g,
    '<span class="world-rpg-highlight-xml">$1</span>'
  );

  // JSON blocks (objects/arrays), constrained to not cross paragraph breaks.
  result = result.replace(
    /(\{(?:(?!\n\n)[\s\S])*?\}|\[(?:(?!\n\n)[\s\S])*?\])/g,
    (match: string) => {
      if ((match.includes('&quot;') || match.includes(':')) && match.length > 10) {
        return `<span class="world-rpg-highlight-json">${match}</span>`;
      }
      return match;
    }
  );

  // Direct speech. The body excludes '<' so a quote cannot span across an
  // injected highlight span (e.g. a stray quote inside a folded <hidden> block).
  const speechPatterns: RegExp[] = [
    /(&quot;(?:(?!\n\n)[^<])*?&quot;[,.?!]?)/g,
    /(\u201C(?:(?!\n\n)[^<])*?\u201D[,.?!]?)/g,
    /(\u2018(?:(?!\n\n)[^<])*?\u2019[,.?!]?)/g,
    /(\u00AB(?:(?!\n\n)[^<])*?\u00BB[,.?!]?)/g
  ];
  for (const pattern of speechPatterns) {
    result = result.replace(pattern, '<span class="world-rpg-highlight-speech">$1</span>');
  }

  // Collapse runs of asterisks so they don't form unbalanced emphasis spans.
  result = result.replace(/(\*{2,})/g, '*');

  // Bold **text** then italic/action *text*, constrained to a single paragraph.
  result = result.replace(
    /(\*\*(?:(?!\n\n)[^*]){2,}?\*\*)/g,
    '<span class="world-rpg-highlight-emphasis">$1</span>'
  );
  result = result.replace(
    /(?<!\*)(\*(?:(?!\n\n)[^*]){2,}?\*)(?!\*)/g,
    '<span class="world-rpg-highlight-action">$1</span>'
  );

  // Dice rolls (d20, 2d6, 1d100+1).
  result = result.replace(
    /(\b\d*d\d+(?:[+-]\d+)?\b)/gi,
    '<span class="world-rpg-highlight-dice">$1</span>'
  );

  return result;
}

/** Wire click-to-fold behavior for XML blocks inside a rendered container. */
export function attachWorldRpgFoldHandlers(container: HTMLElement): void {
  const toggles = container.querySelectorAll('.world-rpg-xml-fold-toggle');
  toggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const foldId = (toggle as HTMLElement).dataset['toggleId'];
      if (!foldId) {
        return;
      }
      const foldable = container.querySelector(`[data-fold-id="${foldId}"]`) as HTMLElement | null;
      const icon = toggle.querySelector('.world-rpg-xml-fold-icon');
      if (foldable && icon) {
        foldable.classList.toggle('xml-folded');
        icon.textContent = foldable.classList.contains('xml-folded') ? '▶' : '▼';
      }
    });
  });
}
