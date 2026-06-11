/**
 * WorldRpgEngine - orchestrates a single turn of the Persistent World RPG.
 *
 * Per turn:
 *   1. Build the locality context window from the deterministic world store.
 *   2. Stream the narrator's prose to the UI (immersive, no mechanics).
 *   3. Ask the parser model for a strict-JSON state update, giving it the id
 *      registry so it reuses existing ids instead of duplicating entities.
 *   4. Apply the update deterministically (entities, edges, player move, clock).
 *
 * The engine mutates the adventure in place; the caller persists it afterwards.
 */

import { OpenRouterClient, OpenRouterMessage } from '../../OpenRouterClient';
import {
  Adventure,
  WorldRpgChatMessage,
  WorldRpgDebugCapture,
  WorldRpgGenerationMeta,
  WorldRpgStateUpdate,
  mapCompletionMetaToGenerationMeta
} from '../types/WorldRpgTypes';
import { DEFAULT_MAX_CONTEXT_MESSAGES } from '../constants';
import { newId, now } from '../util';
import { buildLocalityContext, LocalityResult } from './localityContext';
import { getLocation } from './worldGraph';
import { applyStateUpdate } from './worldMutations';
import {
  HIDDEN_TAGS_INSTRUCTION,
  NARRATOR_OPENING_INSTRUCTION,
  NARRATOR_SYSTEM_PROMPT,
  PARSER_PROMPT
} from '../prompts';

export interface TurnCallbacks {
  onNarratorStart?: () => void;
  onNarratorChunk: (chunk: string) => void;
  onNarratorComplete: (fullText: string, meta?: WorldRpgGenerationMeta) => void;
  /**
   * Persist the adventure now that the narration is in the transcript, before
   * the slower parser phase runs. Guarantees the visible answer is durable even
   * if the parser call is slow, fails, or the user navigates away mid-turn.
   */
  onNarratorPersist: () => Promise<void>;
  /** Called after the world store has been updated; reports minutes advanced. */
  onStateApplied?: (advancedMinutes: number) => void;
  /** Called for parser/apply errors that do not invalidate the narration. */
  onStateError?: (error: Error) => void;
}

function parseStrictJson<T>(text: string): T {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Parser model did not return a JSON object. Got: ${trimmed.slice(0, 2000)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

export class WorldRpgEngine {
  private client: OpenRouterClient;

  constructor(client: OpenRouterClient) {
    this.client = client;
  }

  /**
   * Capture the pre-turn state so the upcoming turn can be retried. Replaces any
   * previous snapshot; only the most recent turn is retryable.
   */
  private captureRollback(adventure: Adventure, action: string | null): void {
    adventure.rollback = {
      graph: structuredClone(adventure.graph),
      clockMinutes: adventure.clockMinutes,
      turn: adventure.turn,
      currentLocationId: adventure.currentLocationId,
      recentEventsSummary: adventure.recentEventsSummary,
      transcriptLength: adventure.transcript.length,
      action
    };
  }

  /**
   * Restore the adventure to the state captured before the last turn. After
   * this, re-run generateOpening/runPlayerTurn (using the returned action) to
   * regenerate the turn from identical inputs.
   */
  rollbackLastTurn(adventure: Adventure): string | null {
    const snapshot = adventure.rollback;
    if (!snapshot) {
      throw new Error('No turn available to retry.');
    }
    adventure.graph = structuredClone(snapshot.graph);
    adventure.clockMinutes = snapshot.clockMinutes;
    adventure.turn = snapshot.turn;
    adventure.currentLocationId = snapshot.currentLocationId;
    adventure.recentEventsSummary = snapshot.recentEventsSummary;
    adventure.transcript = adventure.transcript.slice(0, snapshot.transcriptLength);
    return snapshot.action;
  }

  /** Generate the opening scene for a fresh adventure (no player action yet). */
  async generateOpening(adventure: Adventure, callbacks: TurnCallbacks): Promise<void> {
    this.captureRollback(adventure, null);
    adventure.turn += 1;
    const locality = this.prepareLocality(adventure);
    const premise = adventure.premise.trim();
    const openingInstruction = premise.length > 0
      ? `${NARRATOR_OPENING_INSTRUCTION}\n\nSCENARIO PREMISE & OPENING DIRECTIVE (honor this for the first scene):\n${premise}`
      : NARRATOR_OPENING_INSTRUCTION;
    const messages = this.buildNarratorMessages(adventure, locality, openingInstruction);
    const { text, meta } = await this.streamNarrator(adventure, messages, callbacks);
    this.appendAssistantMessage(adventure, text, meta);
    await callbacks.onNarratorPersist();

    const debug = this.startDebugCapture(adventure, messages);
    // The opening establishes the scene; ask the parser to record any new
    // entities/details it introduced.
    await this.runParserPhase(adventure, locality, NARRATOR_OPENING_INSTRUCTION, text, callbacks, debug);
    adventure.lastDebug = debug;
    adventure.updatedAt = now();
  }

  /** Process a player's action: narrate the result and update the world. */
  async runPlayerTurn(adventure: Adventure, userText: string, callbacks: TurnCallbacks): Promise<void> {
    const action = userText.trim();
    if (action.length === 0) {
      throw new Error('Player action is empty.');
    }
    this.captureRollback(adventure, action);
    adventure.turn += 1;

    const userMessage: WorldRpgChatMessage = {
      id: newId('wmsg'),
      role: 'user',
      content: action,
      createdAt: now()
    };
    adventure.transcript.push(userMessage);

    const locality = this.prepareLocality(adventure);
    const messages = this.buildNarratorMessages(adventure, locality);
    const { text, meta } = await this.streamNarrator(adventure, messages, callbacks);
    this.appendAssistantMessage(adventure, text, meta);
    await callbacks.onNarratorPersist();

    const debug = this.startDebugCapture(adventure, messages);
    await this.runParserPhase(adventure, locality, action, text, callbacks, debug);
    adventure.lastDebug = debug;
    adventure.updatedAt = now();
  }

  /** Begin a debug capture for this turn from the narrator's sent messages. */
  private startDebugCapture(adventure: Adventure, messages: OpenRouterMessage[]): WorldRpgDebugCapture {
    return {
      turn: adventure.turn,
      narratorMessages: messages.map(m => ({ role: m.role, content: m.content })),
      parserPrompt: '',
      parserRaw: ''
    };
  }

  /** Build the locality window and stamp included nodes as used this turn. */
  private prepareLocality(adventure: Adventure): LocalityResult {
    const locality = buildLocalityContext(adventure);
    for (const id of locality.includedLocationIds) {
      getLocation(adventure.graph, id).lastUsedTurn = adventure.turn;
    }
    return locality;
  }

  private buildNarratorMessages(
    adventure: Adventure,
    locality: LocalityResult,
    openingInstruction?: string
  ): OpenRouterMessage[] {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: NARRATOR_SYSTEM_PROMPT }
    ];
    const rules = adventure.graph.rules.trim();
    if (rules.length > 0) {
      messages.push({
        role: 'user',
        content: `WORLD RULES & SETTING (always apply; never contradict):\n${rules}`
      });
    }
    // Add the hidden-tags instruction unless the rules already describe them.
    if (!/<\s*hidden/i.test(rules)) {
      messages.push({ role: 'user', content: HIDDEN_TAGS_INSTRUCTION });
    }
    messages.push({
      role: 'user',
      content: `WORLD STATE (reference only - do not show ids to the player):\n${locality.narratorContext}`
    });
    const recent = adventure.transcript.slice(-DEFAULT_MAX_CONTEXT_MESSAGES);
    for (const message of recent) {
      messages.push({ role: message.role, content: message.content });
    }
    if (openingInstruction) {
      messages.push({ role: 'user', content: openingInstruction });
    }
    return messages;
  }

  private async streamNarrator(
    adventure: Adventure,
    messages: OpenRouterMessage[],
    callbacks: TurnCallbacks
  ): Promise<{ text: string; meta?: WorldRpgGenerationMeta }> {
    callbacks.onNarratorStart?.();
    let fullText = '';
    let meta: WorldRpgGenerationMeta | undefined;
    const images: string[] = [];

    await this.client.streamingChat(adventure.narratorPurpose, messages, {
      onStart: () => {},
      onChunk: (chunk: string) => {
        fullText += chunk;
        callbacks.onNarratorChunk(chunk);
      },
      onImages: (urls: string[]) => {
        images.push(...urls);
      },
      onMeta: (completionMeta) => {
        meta = mapCompletionMetaToGenerationMeta(adventure.narratorPurpose, completionMeta);
      },
      onComplete: (final: string) => {
        fullText = final;
      },
      onError: () => {}
    });

    this.pendingImages = images;
    callbacks.onNarratorComplete(fullText, meta);
    return { text: fullText, ...(meta ? { meta } : {}) };
  }

  private pendingImages: string[] = [];

  private appendAssistantMessage(adventure: Adventure, text: string, meta?: WorldRpgGenerationMeta): void {
    const message: WorldRpgChatMessage = {
      id: newId('wmsg'),
      role: 'assistant',
      content: text,
      createdAt: now(),
      ...(meta ? { generation: meta } : {}),
      ...(this.pendingImages.length > 0 ? { images: [...this.pendingImages] } : {})
    };
    this.pendingImages = [];
    adventure.transcript.push(message);
  }

  /**
   * Run the parser model and apply its update. Parser/apply failures are
   * reported via onStateError but never discard the already-shown narration.
   */
  private async runParserPhase(
    adventure: Adventure,
    locality: LocalityResult,
    playerAction: string,
    narratorText: string,
    callbacks: TurnCallbacks,
    debug: WorldRpgDebugCapture
  ): Promise<void> {
    const registryText = locality.registry
      .map(entry => `${entry.type} ${entry.id} = "${entry.name}"`)
      .join('\n');
    const prompt = PARSER_PROMPT
      .split('{{registry}}').join(registryText)
      .split('{{current_location_id}}').join(adventure.currentLocationId)
      .split('{{player_action}}').join(playerAction)
      .split('{{gm_response}}').join(narratorText);
    debug.parserPrompt = prompt;

    let raw = '';
    await this.client.streamingChat(adventure.parserPurpose, [{ role: 'user', content: prompt }], {
      onStart: () => {},
      onChunk: (chunk: string) => {
        raw += chunk;
      },
      onComplete: (final: string) => {
        raw = final;
      },
      onError: () => {}
    });
    debug.parserRaw = raw;

    try {
      const update = parseStrictJson<WorldRpgStateUpdate>(raw);
      const advanced = applyStateUpdate(adventure, update, adventure.turn);
      callbacks.onStateApplied?.(advanced);
    } catch (error) {
      const actual = error instanceof Error ? error : new Error('Unknown parser/apply error');
      callbacks.onStateError?.(actual);
    }
  }
}
