import { OpenRouterClient } from '../OpenRouterClient';
import { XMLStoryParser } from '../xml-story-creation/parser/XMLStoryParser';
import type { SystemCommand } from '../xml-story-creation/types/XMLStoryTypes';
import { TargetedTextEditor } from './TargetedTextEditor';

/**
 * TargetedEditRunner
 *
 * Shared driver for "let a model revise a body of text with targeted XML edit
 * commands". It is used by both the generation loop editor and the coherence
 * contradiction fixer so the two behave identically.
 *
 * On each attempt it asks the caller to build a prompt (given the current text
 * and any prior failures), sends it to the model, parses out the supported edit
 * commands, applies them, and feeds any that could not be applied back into the
 * next attempt. It never rewrites the whole body unless the model explicitly
 * chooses <outline_replace>.
 *
 * There is no defensive masking here: a chat failure rethrows loudly, and the
 * per-command results are surfaced to the caller so nothing fails silently.
 */

/** A targeted edit that could not be applied (surfaced to the caller). */
export interface TargetedEditFailure {
    /** The search text or section the failed command targeted. */
    search: string;
    /** Why it could not be applied. */
    reason: string;
}

/** Body-edit command types a targeted-edit prompt is allowed to emit. */
export const SUPPORTED_EDIT_COMMANDS: ReadonlySet<SystemCommand['type']> = new Set([
    'replace_command',
    'append',
    'replace_section',
    'remove_section',
    'outline_replace'
]);

export interface TargetedEditRunOptions {
    client: OpenRouterClient;
    /** Model purpose passed to client.chat (e.g. 'editor', 'prose', 'creator'). */
    purpose: string;
    /** The text to edit. */
    text: string;
    /** Maximum number of model calls (initial attempt plus retries). */
    maxAttempts: number;
    /**
     * Build the prompt for one attempt. Receives the current (evolving) text so
     * retries re-anchor against the latest content, plus the feedback block for
     * edits that could not be applied on the previous attempt (empty on the
     * first attempt).
     */
    buildPrompt: (args: { priorFailures: string; text: string }) => string;
    /** Optional abort signal forwarded to client.chat. */
    signal?: AbortSignal;
    /** Optional cooperative stop check; when it returns true the loop exits. */
    shouldStop?: () => boolean;
    /** Optional hook invoked once per attempt before the model call. */
    onAttempt?: (args: { attempt: number; prompt: string }) => void;
}

export interface TargetedEditRunResult {
    /** The resulting text after all applied edits. */
    text: string;
    /** Edits that still could not be applied within the attempt budget. */
    dropped: TargetedEditFailure[];
    /** Whether the model ever produced actionable edit commands. */
    producedCommands: boolean;
    /** Number of commands successfully applied on the final applying attempt. */
    appliedCount: number;
}

/** Short identifier for a command's target, for failure reporting. */
export function describeCommandTarget(command: SystemCommand): string {
    if (command.type === 'replace_command') {
        return command.searchText ?? '(missing search text)';
    }
    if (command.type === 'replace_section' || command.type === 'remove_section') {
        return `section "${command.sectionTitle ?? '(missing title)'}"`;
    }
    return command.type;
}

/**
 * Build the feedback block injected into the next attempt, listing the commands
 * that could not be applied and why.
 */
export function formatPriorFailures(failures: Array<{ command: SystemCommand; message: string }>): string {
    const lines = failures
        .map(f => `- ${describeCommandTarget(f.command)}: ${f.message}`)
        .join('\n');
    return `Your previous edit commands below could NOT be applied and were skipped. Re-express ONLY these against the CURRENT text shown above (copy the search text verbatim and make it unique), or use <outline_replace> if a fix genuinely cannot be localized:\n${lines}`;
}

/**
 * Drive a bounded, feedback-guided sequence of targeted edits over a text.
 */
export async function runTargetedEdits(opts: TargetedEditRunOptions): Promise<TargetedEditRunResult> {
    const parser = new XMLStoryParser();
    let text = opts.text;
    let priorFailures = '';
    let dropped: TargetedEditFailure[] = [];
    let producedCommands = false;
    let appliedCount = 0;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        const prompt = opts.buildPrompt({ priorFailures, text });
        opts.onAttempt?.({ attempt, prompt });

        let output: string;
        try {
            output = await opts.client.chat(opts.purpose, prompt, undefined, opts.signal);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error during editing';
            console.error('Targeted editing failed:', errorMessage);
            throw new Error(`Targeted editing failed: ${errorMessage}`);
        }

        if (opts.shouldStop?.()) {
            break;
        }

        // Context commands are out of scope for targeted body editing.
        const parsed = parser.parseResponse(output, undefined, { includeContextCommands: false });
        const commands = parsed.systemCommands.filter(c => SUPPORTED_EDIT_COMMANDS.has(c.type));

        if (commands.length === 0) {
            // The model produced no actionable commands: nothing to apply.
            dropped = [];
            break;
        }
        producedCommands = true;

        const { newText, results } = TargetedTextEditor.apply(text, commands);
        text = newText;
        appliedCount = results.filter(r => r.ok).length;

        const failures = results.filter(r => !r.ok);
        if (failures.length === 0) {
            dropped = [];
            break;
        }

        // Carry the still-failing edits forward: feed them back on the next
        // attempt, and record them as dropped if the budget runs out.
        dropped = failures.map(f => ({
            search: describeCommandTarget(f.command),
            reason: f.message
        }));
        priorFailures = formatPriorFailures(failures);
    }

    return { text, dropped, producedCommands, appliedCount };
}
