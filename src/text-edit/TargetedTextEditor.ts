import type { SystemCommand } from '../xml-story-creation/types/XMLStoryTypes';

/**
 * TargetedTextEditor
 *
 * Single source of truth for applying body-text edit commands to a plain text
 * string. It is deliberately body-only: it knows nothing about conditional
 * context items, story elements, the chat UI, or node versioning. Callers feed
 * it text plus parsed commands and receive the new text plus a per-command
 * report of what happened.
 *
 * Supported command types:
 *  - replace_command  fuzzy search/replace (must match exactly once)
 *  - append           append content to the end of the text
 *  - replace_section  replace a ===Title=== section's content (and optional title)
 *  - remove_section   remove a ===Title=== section entirely
 *  - outline_replace  full-body replace (always applies)
 *
 * Any other command type is reported as a failure rather than silently ignored,
 * so an off-spec command is visible to the caller.
 */

/** A half-open character range [start, end) within a text. */
export interface TextRange {
    start: number;
    end: number;
}

/** Result of applying a single command. */
export interface TargetedEditOutcome {
    ok: boolean;
    /** Human-readable description of success or the reason for failure. */
    message: string;
    /** The resulting text when ok is true. Undefined on failure. */
    newText?: string;
    /**
     * For replace_command: the range of the inserted replacement within newText,
     * so a caller can highlight what changed. Undefined for other commands.
     */
    matchRange?: TextRange;
}

/** Per-command entry produced by {@link TargetedTextEditor.apply}. */
export interface TargetedEditResult {
    command: SystemCommand;
    ok: boolean;
    message: string;
    matchRange?: TextRange;
}

/** Aggregate result of applying a batch of commands sequentially. */
export interface TargetedApplyOutcome {
    newText: string;
    results: TargetedEditResult[];
}

export class TargetedTextEditor {
    /**
     * Apply a batch of commands sequentially. Each command operates on the text
     * produced by the previous command, so later commands re-search the evolving
     * text. Commands that fail leave the text unchanged and are reported with
     * ok=false; processing continues with the remaining commands.
     */
    public static apply(text: string, commands: SystemCommand[]): TargetedApplyOutcome {
        let current = text;
        const results: TargetedEditResult[] = [];

        for (const command of commands) {
            const outcome = TargetedTextEditor.applyOne(current, command);
            if (outcome.ok && outcome.newText !== undefined) {
                current = outcome.newText;
            }
            const result: TargetedEditResult = {
                command,
                ok: outcome.ok,
                message: outcome.message
            };
            if (outcome.matchRange) {
                result.matchRange = outcome.matchRange;
            }
            results.push(result);
        }

        return { newText: current, results };
    }

    /**
     * Apply a single command to the given text. Pure: returns the new text and a
     * report without mutating anything.
     */
    public static applyOne(text: string, command: SystemCommand): TargetedEditOutcome {
        switch (command.type) {
            case 'replace_command':
                return TargetedTextEditor.applyReplaceCommand(text, command);
            case 'append':
                return TargetedTextEditor.applyAppend(text, command);
            case 'replace_section':
                return TargetedTextEditor.applyReplaceSection(text, command);
            case 'remove_section':
                return TargetedTextEditor.applyRemoveSection(text, command);
            case 'outline_replace':
                return TargetedTextEditor.applyOutlineReplace(command);
            default:
                return {
                    ok: false,
                    message: `Unsupported command type for targeted editing: "${command.type}".`
                };
        }
    }

    // ------------------------------------------------------------------
    // Per-command transforms
    // ------------------------------------------------------------------

    private static applyReplaceCommand(text: string, command: SystemCommand): TargetedEditOutcome {
        const searchText = command.searchText;
        const replaceText = command.replaceText;
        if (!searchText || !replaceText) {
            return { ok: false, message: 'Replace command missing search text or replace text.' };
        }

        const matches = TargetedTextEditor.findFuzzyMatches(text, searchText);
        if (matches.length === 0) {
            return {
                ok: false,
                message: `Search text "${searchText}" not found (ignoring punctuation/whitespace).`
            };
        }
        if (matches.length > 1) {
            return {
                ok: false,
                message: `Search text "${searchText}" appears ${matches.length} times. Must be unique for replacement.`
            };
        }

        const match = matches[0]!;
        const trimmedReplace = TargetedTextEditor.trimTrailingNonAlphanumeric(replaceText);
        const newText = text.substring(0, match.start) + trimmedReplace + text.substring(match.end);
        return {
            ok: true,
            message: 'Replaced 1 occurrence.',
            newText,
            matchRange: { start: match.start, end: match.start + trimmedReplace.length }
        };
    }

    private static applyAppend(text: string, command: SystemCommand): TargetedEditOutcome {
        if (!command.content) {
            return { ok: false, message: 'Append command missing content.' };
        }
        const newText = text + '\n\n' + command.content;
        return { ok: true, message: 'Appended content.', newText };
    }

    private static applyReplaceSection(text: string, command: SystemCommand): TargetedEditOutcome {
        const sectionTitle = command.sectionTitle;
        if (!sectionTitle || !command.content) {
            return { ok: false, message: 'Section replace command missing section title or content.' };
        }

        const sections = TargetedTextEditor.parseContentSections(text);
        const targetIndex = sections.findIndex(section => section.title === sectionTitle);
        if (targetIndex === -1) {
            return { ok: false, message: `Section "${sectionTitle}" not found.` };
        }

        // The replacement content may carry a new ===Title=== header to rename.
        let newTitle = sectionTitle;
        let newContent = command.content;
        const titleMatch = newContent.match(/^===\s*(.+?)\s*===\s*\n?([\s\S]*)$/);
        if (titleMatch) {
            newTitle = titleMatch[1]!.trim();
            newContent = titleMatch[2]!.trim();
        }

        const newSections = [...sections];
        newSections[targetIndex] = { title: newTitle, content: newContent };
        const finalContent = newSections
            .map(section => `===${section.title}===\n${section.content}`)
            .join('\n\n');
        return { ok: true, message: `Replaced section "${sectionTitle}".`, newText: finalContent };
    }

    private static applyRemoveSection(text: string, command: SystemCommand): TargetedEditOutcome {
        const sectionTitle = command.sectionTitle;
        if (!sectionTitle) {
            return { ok: false, message: 'Section remove command missing section title.' };
        }

        const sections = TargetedTextEditor.parseContentSections(text);
        const targetIndex = sections.findIndex(section => section.title === sectionTitle);
        if (targetIndex === -1) {
            return { ok: false, message: `Section "${sectionTitle}" not found.` };
        }

        const remaining = sections.filter((_, index) => index !== targetIndex);
        const newText = remaining.length > 0
            ? remaining.map(section => `===${section.title}===\n${section.content}`).join('\n\n')
            : '';
        return { ok: true, message: `Removed section "${sectionTitle}".`, newText };
    }

    private static applyOutlineReplace(command: SystemCommand): TargetedEditOutcome {
        if (command.content === undefined) {
            return { ok: false, message: 'Full replace command missing content.' };
        }
        return { ok: true, message: 'Replaced full body.', newText: command.content };
    }

    // ------------------------------------------------------------------
    // Pure helpers (moved verbatim from XMLStoryModal so both paths share them)
    // ------------------------------------------------------------------

    /**
     * Trim trailing non-alphanumeric characters from replacement text. The fuzzy
     * matcher ignores punctuation when locating the search target, so the model
     * often includes trailing punctuation in the replacement that would otherwise
     * double up (e.g. "word.." instead of "word.").
     */
    public static trimTrailingNonAlphanumeric(text: string): string {
        return text.replace(/[^a-zA-Z0-9]+$/, '');
    }

    /**
     * Parse ===Title=== sections from text. Returns sections with their title and
     * trimmed content; lines before the first header are ignored.
     */
    public static parseContentSections(content: string): Array<{ title: string; content: string }> {
        if (content.trim().length === 0) {
            return [];
        }

        const lines = content.split('\n');
        const sections: Array<{ title: string; content: string }> = [];
        let currentSection: { title: string; content: string[] } | null = null;

        for (const line of lines) {
            const sectionMatch = line.match(/^===(.+?)===\s*$/);
            if (sectionMatch) {
                if (currentSection) {
                    sections.push({
                        title: currentSection.title,
                        content: currentSection.content.join('\n').trim()
                    });
                }
                const title = sectionMatch[1];
                if (title) {
                    currentSection = { title: title.trim(), content: [] };
                }
            } else if (currentSection) {
                currentSection.content.push(line);
            }
        }

        if (currentSection) {
            sections.push({
                title: currentSection.title,
                content: currentSection.content.join('\n').trim()
            });
        }

        return sections.filter(section => section.title.length > 0);
    }

    /**
     * Find fuzzy matches of searchPattern in text, comparing only lowercase
     * alphanumeric characters while preserving exact original positions. This
     * tolerates the model's whitespace/punctuation/casing drift (e.g. searching
     * "chapter 1 the discovery" against "Chapter 1:  The Discovery -") while still
     * returning byte-accurate ranges suitable for substring replacement.
     *
     * Returns every non-overlapping match as a half-open [start, end) range.
     */
    public static findFuzzyMatches(text: string, searchPattern: string): TextRange[] {
        const matches: TextRange[] = [];

        const isAlphaNumeric = (char: string): boolean => /[a-zA-Z0-9]/.test(char);

        const normalizedPattern = searchPattern.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        if (normalizedPattern.length === 0) {
            return matches;
        }

        let textIndex = 0;
        while (textIndex < text.length) {
            let matchStart = -1;
            let matchEnd = -1;
            let patternIndex = 0;
            let currentTextIndex = textIndex;

            while (currentTextIndex < text.length && patternIndex < normalizedPattern.length) {
                const textChar = text[currentTextIndex]?.toLowerCase();

                if (textChar && isAlphaNumeric(textChar)) {
                    if (textChar === normalizedPattern[patternIndex]) {
                        if (matchStart === -1) {
                            matchStart = currentTextIndex;
                        }
                        patternIndex++;
                        matchEnd = currentTextIndex + 1;
                    } else {
                        break;
                    }
                } else if (matchStart !== -1) {
                    matchEnd = currentTextIndex + 1;
                }

                currentTextIndex++;
            }

            if (patternIndex === normalizedPattern.length && matchStart !== -1) {
                matches.push({ start: matchStart, end: matchEnd });
                textIndex = matchEnd;
            } else {
                textIndex++;
            }
        }

        return matches;
    }
}
