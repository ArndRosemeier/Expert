/**
 * Read-only statistics modal for a node and its subtree.
 *
 * Structure/progress stats are shown once at the top; all text-related stats are
 * split into "Prose" (leaf nodes) and "Outline" (structural nodes) tabs, because
 * those corpora are written by different models under different rules.
 */

import { DocumentNode } from '../../DocumentNode';
import { computeSubtreeStatistics, SubtreeStatistics, TextStats, StructureStats } from '../../statistics/NodeStatistics';
import { showGenericModal } from './index';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(value: number): string {
  return value.toLocaleString();
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) {
    return '< 1 min';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${hours} h ${rest} min`;
}

function row(label: string, value: string): string {
  return `<tr><td class="stat-label">${label}</td><td class="stat-value">${value}</td></tr>`;
}

function renderStructure(s: StructureStats): string {
  const byLevel = s.nodesByLevel
    .map((l) => `<li>${escapeHtml(l.label)}: <strong>${num(l.count)}</strong></li>`)
    .join('');

  return `
    <section class="stats-section">
      <h3>Structure & progress</h3>
      <table class="stats-table">
        ${row('Total nodes', num(s.totalNodes))}
        ${row('Prose (leaf) nodes', num(s.proseNodes))}
        ${row('Outline (structural) nodes', num(s.outlineNodes))}
        ${row('Depth (levels)', num(s.depth))}
        ${row('Completion', `${s.completionPercent}% (${num(s.leavesFinal)} of ${num(s.proseNodes)} scenes final)`)}
        ${row('Scenes by state', `${num(s.leavesFinal)} final / ${num(s.leavesDraft)} draft / ${num(s.leavesEmpty)} empty`)}
        ${row('Open to-dos', num(s.openTodos))}
      </table>
      <div class="stats-breakdown">
        <div class="stats-breakdown-title">Nodes by level</div>
        <ul>${byLevel}</ul>
      </div>
    </section>
  `;
}

function renderTextStats(t: TextStats, emptyHint: string): string {
  if (t.nodesWithText === 0) {
    return `<div class="stats-empty">${emptyHint}</div>`;
  }

  const longest = t.longestNode
    ? `${escapeHtml(t.longestNode.title)} (${num(t.longestNode.words)} words)`
    : '-';
  const shortest = t.shortestNode
    ? `${escapeHtml(t.shortestNode.title)} (${num(t.shortestNode.words)} words)`
    : '-';

  const byLevel = t.wordsByLevel
    .map((l) => `<li>${escapeHtml(l.label)}: <strong>${num(l.words)}</strong> words</li>`)
    .join('');

  return `
    <table class="stats-table">
      ${row('Nodes with text', `${num(t.nodesWithText)} of ${num(t.nodeCount)}`)}
      ${row('Words', num(t.wordCount))}
      ${row('Characters (with spaces)', num(t.charsWithSpaces))}
      ${row('Characters (no spaces)', num(t.charsNoSpaces))}
      ${row('Size', kb(t.bytes))}
      ${row('Paragraphs', num(t.paragraphCount))}
      ${row('Sentences', num(t.sentenceCount))}
      ${row('Avg words / sentence', num(t.avgWordsPerSentence))}
      ${row('Avg words / paragraph', num(t.avgWordsPerParagraph))}
      ${row('Avg words / node', num(t.avgWordsPerNode))}
      ${row('Longest node', longest)}
      ${row('Shortest node', shortest)}
      ${row('Dialogue ratio', `${t.dialoguePercent}%`)}
      ${row('Unique words', num(t.uniqueWords))}
      ${row('Type-token ratio', t.typeTokenRatio.toString())}
      ${row('Em-dashes', `${num(t.emDashCount)} (${t.emDashPer1000Words} per 1000 words)`)}
      ${row('Reading time', formatMinutes(t.readingMinutes))}
      ${row('Estimated pages', num(t.estimatedPages))}
    </table>
    <div class="stats-breakdown">
      <div class="stats-breakdown-title">Words by level</div>
      <ul>${byLevel}</ul>
    </div>
  `;
}

function buildContent(stats: SubtreeStatistics): string {
  return `
    <div class="node-stats">
      <style>
        .node-stats { font-size: 0.95rem; color: #1e293b; min-width: 48rem; }
        .node-stats h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
        .node-stats .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.75rem; align-items: start; }
        @media (max-width: 640px) { .node-stats { min-width: 0; } .node-stats .stats-grid { grid-template-columns: 1fr; } }
        .node-stats .stats-section { margin-bottom: 0; }
        .node-stats .stats-table { width: 100%; border-collapse: collapse; }
        .node-stats .stats-table td { padding: 0.32rem 0.5rem; border-bottom: 1px solid #eef2f7; }
        .node-stats .stat-label { color: #64748b; }
        .node-stats .stat-value { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
        .node-stats .stats-breakdown { margin-top: 0.6rem; }
        .node-stats .stats-breakdown-title { color: #64748b; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.3rem; }
        .node-stats .stats-breakdown ul { margin: 0; padding-left: 1.1rem; }
        .node-stats .stats-breakdown li { margin: 0.1rem 0; }
        .node-stats .stats-tabs { display: flex; gap: 0.4rem; border-bottom: 2px solid #e2e8f0; margin-bottom: 0.9rem; }
        .node-stats .stats-tab {
          padding: 0.45rem 1rem; border: none; background: transparent; cursor: pointer;
          font-size: 0.95rem; font-weight: 600; color: #64748b; border-bottom: 2px solid transparent; margin-bottom: -2px;
        }
        .node-stats .stats-tab:hover { color: #2563eb; }
        .node-stats .stats-tab.active { color: #2563eb; border-bottom-color: #2563eb; }
        .node-stats .stats-panel { display: none; }
        .node-stats .stats-panel.active { display: block; }
        .node-stats .stats-empty { color: #64748b; font-style: italic; padding: 0.8rem 0; }
      </style>
      <div class="stats-grid">
        ${renderStructure(stats.structure)}
        <section class="stats-section">
          <h3>Text statistics</h3>
          <div class="stats-tabs">
            <button class="stats-tab active" data-stats-tab="prose">Prose</button>
            <button class="stats-tab" data-stats-tab="outline">Outline</button>
          </div>
          <div class="stats-panel active" data-stats-panel="prose">
            ${renderTextStats(stats.prose, 'No prose (leaf) nodes with text in this subtree.')}
          </div>
          <div class="stats-panel" data-stats-panel="outline">
            ${renderTextStats(stats.outline, 'No outline (structural) nodes with text in this subtree.')}
          </div>
        </section>
      </div>
    </div>
  `;
}

function wireTabs(): void {
  const wrapper = document.querySelector('.node-stats');
  if (!wrapper) {
    return;
  }
  const tabs = wrapper.querySelectorAll<HTMLButtonElement>('.stats-tab');
  const panels = wrapper.querySelectorAll<HTMLElement>('.stats-panel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-stats-tab');
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      panels.forEach((p) => p.classList.toggle('active', p.getAttribute('data-stats-panel') === target));
    });
  });
}

/**
 * Compute statistics for the node and its subtree and display them in a modal.
 */
export function openNodeStatisticsModal(node: DocumentNode): void {
  const stats = computeSubtreeStatistics(node);
  showGenericModal(
    buildContent(stats),
    { title: `Statistics: ${node.title}`, maxWidth: '60rem' },
    { onOpen: () => { wireTabs(); } }
  );
}
