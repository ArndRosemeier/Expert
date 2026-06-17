/**
 * ReviewCommandParser - extracts node-addressed commands from an LLM response.
 *
 * The reviewer vocabulary keeps the spirit of the node chat editor's XML syntax
 * but makes every command reference a node by its session handle (node="N3").
 * Supported commands:
 *   <edit node="N3">...full new content...</edit>
 *   <title node="N3">New Title</title>
 *   <replace node="N3"><search>..</search><replace>..</replace></replace>
 *   <multi_replace scope="content|context|both"><search>..</search><replace>..</replace></multi_replace>
 *   <context node="N3" [trigger="kw"]>text</context>                 (add)
 *   <context node="N3" id="c2" [trigger="kw"]>text</context>         (edit)
 *   <context node="N3" id="c2" remove />                             (remove)
 *
 * Parsing preserves command order (commands are applied sequentially), captures
 * the exact raw XML for each command (for the Executed/Failed echo), and reports
 * malformed commands loudly instead of dropping them silently.
 */

import {
    MultiReplaceScope,
    ReviewCommand,
    ReviewParseError,
    ReviewParseResult
} from './ReviewTypes';

interface IndexedCommand {
    index: number;
    command: ReviewCommand;
}

export class ReviewCommandParser {
    public static parse(text: string): ReviewParseResult {
        const commands: IndexedCommand[] = [];
        const errors: ReviewParseError[] = [];

        // Working copy: matched regions are masked with spaces so later regexes
        // do not re-match them, while indices stay aligned with the original.
        let working = text;

        const run = (
            regex: RegExp,
            onMatch: (match: RegExpExecArray, index: number) => void
        ): void => {
            const matches = Array.from(working.matchAll(regex));
            for (const match of matches) {
                const index = match.index;
                if (index === undefined) {
                    throw new Error('ReviewCommandParser: regex match without an index');
                }
                onMatch(match as RegExpExecArray, index);
                working = working.slice(0, index) + ' '.repeat(match[0].length) + working.slice(index + match[0].length);
            }
        };

        // 1) multi_replace
        run(
            /<multi_replace([^>]*)>\s*<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>\s*<\/multi_replace>/gi,
            (m, index) => {
                const raw = m[0];
                const attrs = ReviewCommandParser.parseAttrs(m[1] ?? '');
                const search = (m[2] ?? '').trim();
                const replace = (m[3] ?? '').trim();
                if (search === '') {
                    errors.push({ message: 'multi_replace has an empty <search>.', sourceText: raw });
                    return;
                }
                const scopeRaw = (attrs.values['scope'] ?? 'both').toLowerCase();
                if (scopeRaw !== 'content' && scopeRaw !== 'context' && scopeRaw !== 'both') {
                    errors.push({ message: `multi_replace has invalid scope "${scopeRaw}" (use content|context|both).`, sourceText: raw });
                    return;
                }
                commands.push({ index, command: { kind: 'multi_replace', scope: scopeRaw as MultiReplaceScope, search, replace, rawXml: raw } });
            }
        );

        // 2) replace (node-targeted)
        run(
            /<replace\s+([^>]*?)>\s*<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>\s*<\/replace>/gi,
            (m, index) => {
                const raw = m[0];
                const attrs = ReviewCommandParser.parseAttrs(m[1] ?? '');
                const handle = attrs.values['node'];
                const search = (m[2] ?? '').trim();
                const replace = (m[3] ?? '').trim();
                if (!handle) {
                    errors.push({ message: 'replace is missing the node="N#" attribute.', sourceText: raw });
                    return;
                }
                if (search === '') {
                    errors.push({ message: 'replace has an empty <search>.', sourceText: raw });
                    return;
                }
                commands.push({ index, command: { kind: 'replace', handle, search, replace, rawXml: raw } });
            }
        );

        // 3) edit
        run(
            /<edit\s+([^>]*?)>([\s\S]*?)<\/edit>/gi,
            (m, index) => {
                const raw = m[0];
                const attrs = ReviewCommandParser.parseAttrs(m[1] ?? '');
                const handle = attrs.values['node'];
                const content = (m[2] ?? '').trim();
                if (!handle) {
                    errors.push({ message: 'edit is missing the node="N#" attribute.', sourceText: raw });
                    return;
                }
                commands.push({ index, command: { kind: 'edit', handle, content, rawXml: raw } });
            }
        );

        // 4) title
        run(
            /<title\s+([^>]*?)>([\s\S]*?)<\/title>/gi,
            (m, index) => {
                const raw = m[0];
                const attrs = ReviewCommandParser.parseAttrs(m[1] ?? '');
                const handle = attrs.values['node'];
                const title = (m[2] ?? '').trim();
                if (!handle) {
                    errors.push({ message: 'title is missing the node="N#" attribute.', sourceText: raw });
                    return;
                }
                if (title === '') {
                    errors.push({ message: 'title has empty text.', sourceText: raw });
                    return;
                }
                commands.push({ index, command: { kind: 'title', handle, title, rawXml: raw } });
            }
        );

        // 5) context (content form: add or edit)
        run(
            /<context\s+([^>]*?)>([\s\S]*?)<\/context>/gi,
            (m, index) => {
                const raw = m[0];
                const attrs = ReviewCommandParser.parseAttrs(m[1] ?? '');
                const handle = attrs.values['node'];
                const text2 = (m[2] ?? '').trim();
                if (!handle) {
                    errors.push({ message: 'context is missing the node="N#" attribute.', sourceText: raw });
                    return;
                }
                if (text2 === '') {
                    errors.push({ message: 'context has empty text.', sourceText: raw });
                    return;
                }
                const hasTrigger = Object.prototype.hasOwnProperty.call(attrs.values, 'trigger');
                const trigger = hasTrigger ? (attrs.values['trigger'] ?? '') : null;
                const itemId = attrs.values['id'];
                if (itemId) {
                    commands.push({ index, command: { kind: 'context_edit', handle, itemId, text: text2, trigger, hasTrigger, rawXml: raw } });
                } else {
                    commands.push({ index, command: { kind: 'context_add', handle, text: text2, trigger, rawXml: raw } });
                }
            }
        );

        // 6) context (self-closing: remove)
        run(
            /<context\s+([^>]*?)\/>/gi,
            (m, index) => {
                const raw = m[0];
                const attrs = ReviewCommandParser.parseAttrs(m[1] ?? '');
                const handle = attrs.values['node'];
                const itemId = attrs.values['id'];
                if (!handle) {
                    errors.push({ message: 'context is missing the node="N#" attribute.', sourceText: raw });
                    return;
                }
                if (!attrs.flags.has('remove') || !itemId) {
                    errors.push({ message: 'self-closing context must be a removal: <context node="N#" id="c#" remove />.', sourceText: raw });
                    return;
                }
                commands.push({ index, command: { kind: 'context_remove', handle, itemId, rawXml: raw } });
            }
        );

        commands.sort((a, b) => a.index - b.index);
        return { commands: commands.map(c => c.command), errors };
    }

    /** Parses XML-style attributes and bare boolean flags from an attribute string. */
    private static parseAttrs(attributeText: string): { values: Record<string, string>; flags: Set<string> } {
        const values: Record<string, string> = {};
        const flags = new Set<string>();
        if (!attributeText) {
            return { values, flags };
        }

        const quoted = /(\w+)\s*=\s*"([\s\S]*?)"/g;
        let m: RegExpExecArray | null;
        while ((m = quoted.exec(attributeText)) !== null) {
            const key = m[1];
            if (key) values[key] = m[2] ?? '';
        }

        // Bare flags: word tokens that are not an attribute assignment.
        const flagRegex = /(?:^|\s)([a-zA-Z_]\w*)(?!\s*=)(?=\s|$)/g;
        let f: RegExpExecArray | null;
        while ((f = flagRegex.exec(attributeText)) !== null) {
            const token = f[1];
            if (token && !(token in values)) {
                flags.add(token);
            }
        }

        return { values, flags };
    }
}
