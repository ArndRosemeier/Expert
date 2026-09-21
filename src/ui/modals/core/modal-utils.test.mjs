import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve the loader from the repo root so this file can move without edits.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { importTs, srcPath } = await import(
    pathToFileURL(path.join(repoRoot, 'tools', 'app-tests', 'load-ts.mjs')).href
);

/**
 * Minimal DOM stub, installed BEFORE the module is imported.
 *
 * `escapeHtml` is genuinely DOM-based (`div.textContent` -> `div.innerHTML`), so it
 * cannot run under node:test unaided. Rather than weaken production code to make it
 * testable, this stub reproduces what a real browser actually does - verified against
 * headless Chrome: `innerHTML` escapes exactly &, < and >, and NOT quote characters.
 * Getting that detail wrong here would hide a real bug, so it is stated explicitly.
 */
class StubElement {
    #text = '';
    set textContent(v) { this.#text = String(v); }
    get textContent() { return this.#text; }
    get innerHTML() {
        // Matches real Chrome: & < > only. Quotes are NOT escaped.
        return this.#text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
globalThis.document = { createElement: () => new StubElement() };

const { renderHistoryItems, escapeHtml, escapeHtmlAttribute } =
    await importTs(srcPath('ui/modals/core/modal-utils.ts'));

test('renderHistoryItems: empty history renders the empty state', () => {
    assert.equal(renderHistoryItems([]), '<div class="history-empty">No previous instructions</div>');
});

test('renderHistoryItems: newest first', () => {
    const html = renderHistoryItems(['first', 'second', 'third']);
    assert.ok(html.indexOf('third') < html.indexOf('second'), 'third before second');
    assert.ok(html.indexOf('second') < html.indexOf('first'), 'second before first');
});

test('renderHistoryItems: delete index refers to the ORIGINAL array position', () => {
    // history.length - 1 - index: for [a,b,c] rendered c,b,a the delete indices
    // must be 2,1,0 so that removing by index hits the right source element.
    const html = renderHistoryItems(['a', 'b', 'c']);
    const indices = [...html.matchAll(/data-delete-index="(\d+)"/g)].map(m => Number(m[1]));
    assert.deepEqual(indices, [2, 1, 0]);
});

test('renderHistoryItems: each entry appears in both the data attribute and the body', () => {
    const html = renderHistoryItems(['only one']);
    const occurrences = html.split('only one').length - 1;
    assert.equal(occurrences, 2, 'once in data-instruction, once in the content div');
});

test('renderHistoryItems: does not mutate the caller\'s array', () => {
    const history = ['a', 'b'];
    renderHistoryItems(history);
    assert.deepEqual(history, ['a', 'b'], 'slice() must protect the source order');
});

test('renderHistoryItems: escapes markup in instructions (XSS)', () => {
    const html = renderHistoryItems(['<img src=x onerror=alert(1)>']);
    assert.ok(!html.includes('<img'), 'raw tag must not survive');
    assert.ok(html.includes('&lt;img'), 'it must be escaped instead');
});

test('renderHistoryItems: a quote cannot break out of the data-instruction attribute', () => {
    // Regression test for a real bug found during extraction. The attribute used to be
    // filled with escapeHtml(), which is DOM-based and does NOT escape quotes (verified
    // against real Chrome: innerHTML escapes only & < >). An instruction containing a
    // double quote therefore escaped the attribute and injected markup.
    //
    // Assert on the ATTRIBUTE VALUE specifically: a raw quote elsewhere in the markup is
    // fine (it sits in a text node, where quotes are harmless).
    const html = renderHistoryItems(['a" onmouseover="alert(1)']);
    const m = html.match(/data-instruction="([^"]*)"/);
    assert.ok(m, 'the attribute must still be present and well-formed');
    assert.ok(!m[1].includes('"'), 'no raw quote may survive inside the attribute value');
    assert.ok(m[1].includes('&quot;'), 'the quote must be entity-escaped');
});

test('renderHistoryItems: the attribute value round-trips through getAttribute', () => {
    // The attribute is read back with getAttribute(), which decodes entities, so
    // escaping the quote must not change the value the handler receives.
    const original = 'a" onmouseover="alert(1)';
    const html = renderHistoryItems([original]);
    const m = html.match(/data-instruction="([^"]*)"/);
    const decoded = m[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    assert.equal(decoded, original);
});

test('escapeHtmlAttribute: escapes all five characters', () => {
    assert.equal(escapeHtmlAttribute(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('escapeHtmlAttribute: leaves plain text untouched', () => {
    assert.equal(escapeHtmlAttribute('plain text 123'), 'plain text 123');
});

test('renderHistoryItems: one item per entry', () => {
    const html = renderHistoryItems(['a', 'b', 'c', 'd']);
    assert.equal(html.split('class="history-item"').length - 1, 4);
});
