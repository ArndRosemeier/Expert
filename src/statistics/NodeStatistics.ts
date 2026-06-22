/**
 * Pure, side-effect-free statistics for a DocumentNode and its subtree.
 *
 * Text-related metrics are computed separately for two corpora because they are
 * produced by different models under different rules:
 *   - "prose"   : leaf nodes (the final story text)
 *   - "outline" : structural/branch nodes (sectioned outlines)
 *
 * Everything here is deterministic and operates only on already-loaded content,
 * so it is cheap to run synchronously from the UI.
 */

import { DocumentNode } from '../DocumentNode';
import { getAllDescendants } from '../ProjectUtils';
import { countWords, splitSentences } from '../quality/metrics/textUtils';

/** Average adult silent reading speed, words per minute. */
const WORDS_PER_MINUTE = 200;
/** Standard manuscript page size, words per page. */
const WORDS_PER_PAGE = 250;
/** The em-dash character (U+2014) the app's AI-ism guardrails care about. */
const EM_DASH = '\u2014';

/** A single node singled out by an extreme (e.g. longest/shortest). */
export interface NodeExtreme {
  title: string;
  words: number;
}

/** Word total attributed to one template level. */
export interface LevelWordCount {
  level: number;
  label: string;
  words: number;
}

/** Node count attributed to one template level. */
export interface LevelNodeCount {
  level: number;
  label: string;
  count: number;
}

/** Text metrics for one corpus (prose or outline). */
export interface TextStats {
  /** Number of nodes in this corpus (regardless of whether they have text). */
  nodeCount: number;
  /** Number of nodes in this corpus that actually contain body text. */
  nodesWithText: number;
  wordCount: number;
  charsWithSpaces: number;
  charsNoSpaces: number;
  bytes: number;
  paragraphCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  avgWordsPerParagraph: number;
  avgWordsPerNode: number;
  longestNode: NodeExtreme | null;
  shortestNode: NodeExtreme | null;
  /** Percent of characters that sit inside quotation marks. */
  dialoguePercent: number;
  uniqueWords: number;
  /** Unique words / total word tokens (lexical variety), 0..1. */
  typeTokenRatio: number;
  emDashCount: number;
  emDashPer1000Words: number;
  readingMinutes: number;
  estimatedPages: number;
  wordsByLevel: LevelWordCount[];
}

/** Structure/progress metrics for the whole subtree (corpus-independent). */
export interface StructureStats {
  totalNodes: number;
  proseNodes: number;
  outlineNodes: number;
  /** Number of template levels spanned below (and including) the root. */
  depth: number;
  nodesByLevel: LevelNodeCount[];
  leavesFinal: number;
  leavesDraft: number;
  leavesEmpty: number;
  completionPercent: number;
  openTodos: number;
}

export interface SubtreeStatistics {
  prose: TextStats;
  outline: TextStats;
  structure: StructureStats;
}

/** Resolve the human-readable label for an absolute template level. */
function levelLabel(template: string[], level: number): string {
  const name = template[level];
  return name && name.trim().length > 0 ? name : `Level ${level + 1}`;
}

/** Count paragraphs (blank-line separated blocks that contain text). */
function countParagraphs(text: string): number {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0).length;
}

/** Total characters that sit inside straight or typographic quotation marks. */
function charsInsideQuotes(text: string): number {
  let total = 0;
  const patterns = [/"([^"]*)"/g, /\u201c([^\u201d]*)\u201d/g];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      total += match[1]!.length;
    }
  }
  return total;
}

/** Extract lower-cased word tokens (letters/numbers/apostrophes) for vocabulary. */
function wordTokens(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}']+/gu);
  return matches ?? [];
}

function round(value: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Build text statistics for a set of nodes from one corpus. */
function computeTextStats(nodes: DocumentNode[], template: string[]): TextStats {
  const encoder = new TextEncoder();

  let wordCount = 0;
  let charsWithSpaces = 0;
  let charsNoSpaces = 0;
  let bytes = 0;
  let paragraphCount = 0;
  let sentenceCount = 0;
  let emDashCount = 0;
  let dialogueChars = 0;
  let nodesWithText = 0;
  let tokenCount = 0;

  const vocabulary = new Set<string>();
  const wordsByLevel = new Map<number, number>();
  let longestNode: NodeExtreme | null = null;
  let shortestNode: NodeExtreme | null = null;

  for (const node of nodes) {
    const content = node.content;
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      continue;
    }

    nodesWithText++;
    const words = countWords(content);
    wordCount += words;
    charsWithSpaces += content.length;
    charsNoSpaces += content.replace(/\s/g, '').length;
    bytes += encoder.encode(content).length;
    paragraphCount += countParagraphs(content);
    sentenceCount += splitSentences(content).length;
    emDashCount += content.split(EM_DASH).length - 1;
    dialogueChars += charsInsideQuotes(content);

    for (const token of wordTokens(content)) {
      vocabulary.add(token);
      tokenCount++;
    }

    wordsByLevel.set(node.level, (wordsByLevel.get(node.level) ?? 0) + words);

    if (longestNode === null || words > longestNode.words) {
      longestNode = { title: node.title, words };
    }
    if (shortestNode === null || words < shortestNode.words) {
      shortestNode = { title: node.title, words };
    }
  }

  const wordsByLevelList: LevelWordCount[] = [...wordsByLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, words]) => ({ level, label: levelLabel(template, level), words }));

  return {
    nodeCount: nodes.length,
    nodesWithText,
    wordCount,
    charsWithSpaces,
    charsNoSpaces,
    bytes,
    paragraphCount,
    sentenceCount,
    avgWordsPerSentence: sentenceCount > 0 ? round(wordCount / sentenceCount) : 0,
    avgWordsPerParagraph: paragraphCount > 0 ? round(wordCount / paragraphCount) : 0,
    avgWordsPerNode: nodesWithText > 0 ? round(wordCount / nodesWithText) : 0,
    longestNode,
    shortestNode,
    dialoguePercent: charsWithSpaces > 0 ? round((dialogueChars / charsWithSpaces) * 100) : 0,
    uniqueWords: vocabulary.size,
    typeTokenRatio: tokenCount > 0 ? round(vocabulary.size / tokenCount, 3) : 0,
    emDashCount,
    emDashPer1000Words: wordCount > 0 ? round((emDashCount / wordCount) * 1000) : 0,
    readingMinutes: round(wordCount / WORDS_PER_MINUTE),
    estimatedPages: Math.ceil(wordCount / WORDS_PER_PAGE),
    wordsByLevel: wordsByLevelList
  };
}

/** Compute the structure/progress statistics over the whole subtree. */
function computeStructureStats(root: DocumentNode, allNodes: DocumentNode[], template: string[]): StructureStats {
  const proseNodes = allNodes.filter((n) => n.isLeaf);
  const outlineNodes = allNodes.filter((n) => !n.isLeaf);

  let maxLevel = root.level;
  const countByLevel = new Map<number, number>();
  let openTodos = 0;
  for (const node of allNodes) {
    if (node.level > maxLevel) {
      maxLevel = node.level;
    }
    countByLevel.set(node.level, (countByLevel.get(node.level) ?? 0) + 1);
    openTodos += node.getIncompleteTodos().length;
  }

  let leavesFinal = 0;
  let leavesDraft = 0;
  let leavesEmpty = 0;
  for (const leaf of proseNodes) {
    const state = leaf.getState();
    if (state === 'Final') {
      leavesFinal++;
    } else if (state === 'Draft') {
      leavesDraft++;
    } else {
      leavesEmpty++;
    }
  }

  const nodesByLevel: LevelNodeCount[] = [...countByLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, count]) => ({ level, label: levelLabel(template, level), count }));

  return {
    totalNodes: allNodes.length,
    proseNodes: proseNodes.length,
    outlineNodes: outlineNodes.length,
    depth: maxLevel - root.level + 1,
    nodesByLevel,
    leavesFinal,
    leavesDraft,
    leavesEmpty,
    completionPercent: proseNodes.length > 0 ? round((leavesFinal / proseNodes.length) * 100) : 0,
    openTodos
  };
}

/**
 * Compute all statistics for a node and its descendants. Level labels are taken
 * from the node's own flat template (every node carries the full level list).
 */
export function computeSubtreeStatistics(root: DocumentNode): SubtreeStatistics {
  const allNodes = getAllDescendants(root);
  const template = root.template;

  const proseNodes = allNodes.filter((n) => n.isLeaf);
  const outlineNodes = allNodes.filter((n) => !n.isLeaf);

  return {
    prose: computeTextStats(proseNodes, template),
    outline: computeTextStats(outlineNodes, template),
    structure: computeStructureStats(root, allNodes, template)
  };
}
