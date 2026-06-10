/**
 * Import bridge from the rpg-lite module. An rpg-lite "scenario" is an
 * `RPGLiteStartPreset`: free-text prose (a system prompt with rules/style and a
 * prefix context describing setting/story/characters) with no structured world.
 *
 * The World RPG needs a structured graph (locations, characters, edges), so the
 * adjustment is to feed the scenario's prose to the world-bootstrap model, which
 * turns it into a deterministic starting world graph.
 */

import { OpenRouterClient } from '../../OpenRouterClient';
import { StorageService } from '../../StorageService';
import { RPGLiteStartPreset } from '../../rpg-lite/types/RPGLiteTypes';
import { OPENING_EXTRACTION_PROMPT, RULE_EXTRACTION_PROMPT } from '../prompts';

/** All saved rpg-lite scenarios (templates), newest first. */
export async function listRpgLiteScenarios(): Promise<RPGLiteStartPreset[]> {
  const storage = await StorageService.getInstance();
  const presets = await storage.listRPGLiteStartPresets<RPGLiteStartPreset>();
  return presets.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Build a world-bootstrap premise from a scenario's free text. Only the setting
 * (title + prefix context) seeds world generation; the system prompt is mapped
 * separately into the world rules via {@link scenarioToRules}.
 */
export function scenarioToPremise(preset: RPGLiteStartPreset): string {
  const parts: string[] = [];
  if (preset.title.trim().length > 0) {
    parts.push(`Title: ${preset.title.trim()}`);
  }
  if (preset.prefixContext.trim().length > 0) {
    parts.push(`Setting, story, and characters:\n${preset.prefixContext.trim()}`);
  }
  return parts.join('\n\n');
}

/**
 * Distill the always-apply world rules and setting canon from a scenario. Rules
 * in rpg-lite live in either the system prompt or the adventure context, so an
 * LLM extracts them from both, dropping plot, specific entities, and app-specific
 * formatting directives. Returns plain text (may be empty).
 */
export async function extractScenarioRules(
  client: OpenRouterClient,
  preset: RPGLiteStartPreset
): Promise<string> {
  const system = preset.systemPrompt.trim();
  const prefix = preset.prefixContext.trim();
  if (system.length === 0 && prefix.length === 0) {
    return '';
  }
  const prompt = RULE_EXTRACTION_PROMPT
    .split('{{system_prompt}}').join(system.length > 0 ? system : '(none)')
    .split('{{prefix_context}}').join(prefix.length > 0 ? prefix : '(none)');

  let raw = '';
  await client.streamingChat('editor', [{ role: 'user', content: prompt }], {
    onStart: () => {},
    onChunk: (chunk: string) => {
      raw += chunk;
    },
    onComplete: (final: string) => {
      raw = final;
    },
    onError: () => {}
  });
  return raw.trim();
}

/**
 * Distill the opening directive from a scenario: the starting situation and
 * anything that should happen in the first scene. Kept separate from the rules
 * (which are always-on) because this is used only once, to shape the opening.
 * Returns plain text (may be empty).
 */
export async function extractScenarioOpening(
  client: OpenRouterClient,
  preset: RPGLiteStartPreset
): Promise<string> {
  const system = preset.systemPrompt.trim();
  const prefix = preset.prefixContext.trim();
  if (system.length === 0 && prefix.length === 0) {
    return '';
  }
  const prompt = OPENING_EXTRACTION_PROMPT
    .split('{{system_prompt}}').join(system.length > 0 ? system : '(none)')
    .split('{{prefix_context}}').join(prefix.length > 0 ? prefix : '(none)');

  let raw = '';
  await client.streamingChat('editor', [{ role: 'user', content: prompt }], {
    onStart: () => {},
    onChunk: (chunk: string) => {
      raw += chunk;
    },
    onComplete: (final: string) => {
      raw = final;
    },
    onError: () => {}
  });
  return raw.trim();
}
