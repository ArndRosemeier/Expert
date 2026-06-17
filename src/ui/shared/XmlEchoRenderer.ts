/**
 * XmlEchoRenderer - renders an assistant message that mixes prose with XML
 * commands, highlighting each command block with an Executed/Failed badge and a
 * short status message.
 *
 * Generalized from XMLStoryModal.formatXMLBlocksGenerically so multiple editors
 * (node chat editor, guided reviewer) can share the same echo styling.
 */

export interface XmlEchoResult {
    /** The exact raw XML of the command, as emitted by the model. */
    rawXml: string;
    ok: boolean;
    message: string;
}

export class XmlEchoRenderer {
    /**
     * Renders `text` into HTML. XML blocks that match a result are shown as
     * status cards; unmatched XML is shown as a neutral card; prose is escaped.
     */
    public static render(text: string, results: XmlEchoResult[]): string {
        const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();
        const byExact = new Map<string, XmlEchoResult>();
        const byNormalized = new Map<string, XmlEchoResult>();
        for (const r of results) {
            byExact.set(r.rawXml, r);
            byNormalized.set(normalize(r.rawXml), r);
        }

        // Backreference ensures the closing tag matches the opening tag name.
        const xmlRegex = /<([a-zA-Z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>|<([a-zA-Z][\w-]*)(?:\s[^>]*)?\/>/g;

        let html = '';
        let lastIndex = 0;
        const matches = Array.from(text.matchAll(xmlRegex));

        for (const match of matches) {
            const index = match.index;
            if (index === undefined) {
                continue;
            }
            if (index > lastIndex) {
                html += XmlEchoRenderer.escapeHtml(text.slice(lastIndex, index)).replace(/\n/g, '<br/>');
            }
            const block = match[0];
            const result = byExact.get(block) ?? byNormalized.get(normalize(block)) ?? null;
            html += XmlEchoRenderer.renderBlock(block, result);
            lastIndex = index + block.length;
        }

        if (lastIndex < text.length) {
            html += XmlEchoRenderer.escapeHtml(text.slice(lastIndex)).replace(/\n/g, '<br/>');
        }

        return html;
    }

    private static renderBlock(block: string, result: XmlEchoResult | null): string {
        let borderColor = '#e5e7eb';
        let background = '#f9fafb';
        let badge = '';

        if (result) {
            if (result.ok) {
                borderColor = '#16a34a';
                background = '#ecfdf5';
                badge = XmlEchoRenderer.badge('#dcfce7', '#166534', `\u2713 ${result.message}`);
            } else {
                borderColor = '#dc2626';
                background = '#fef2f2';
                badge = XmlEchoRenderer.badge('#fee2e2', '#991b1b', `\u2717 ${result.message}`);
            }
        }

        return `<div style="border:2px solid ${borderColor};background:${background};border-radius:8px;padding:8px;margin:8px 0;white-space:pre-wrap;display:flex;flex-direction:column;gap:6px;">`
            + `<code style="font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace;">${XmlEchoRenderer.escapeHtml(block)}</code>`
            + badge
            + `</div>`;
    }

    private static badge(bg: string, color: string, label: string): string {
        return `<span style="align-self:flex-start;display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;background:${bg};color:${color};font-weight:700;font-size:12px;">${XmlEchoRenderer.escapeHtml(label)}</span>`;
    }

    private static escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
