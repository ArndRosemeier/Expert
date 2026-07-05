/**
 * Context help dialog.
 *
 * A read-only explanatory modal describing how conditional context items work:
 * what they are, how they are inherited, and how the three gates (structural
 * child scope, leaves-only reach, and trigger words) plus the "=>" constraint
 * prefix control when an item reaches a generating node. Opened from the "?"
 * button in the ConditionalContextEditor.
 */

import { showGenericModal } from './GenericModal';
import type { GenericModalContent } from './types/ModalTypes';

const HELP_HTML = `
<div style="max-height:72vh; overflow:auto; padding-right:0.5rem; line-height:1.55; color:#1f2937; font-size:0.95rem;">

    <p style="margin:0 0 1rem 0;">
        <strong>Conditional context items</strong> are facts, rules, and instructions you attach to a node.
        They are the world/background knowledge the AI is given when it generates or edits content —
        separate from the node's own body text. Unlike body text (which gets split up and scattered as a
        node is expanded into children), a context item is <strong>inherited by the entire subtree</strong>
        beneath the node it is attached to.
    </p>

    <h3 style="margin:1.25rem 0 0.4rem 0; font-size:1.02rem; color:#111827;">Where to attach them</h3>
    <p style="margin:0 0 0.75rem 0;">
        Attach anything true for the <em>whole project</em> to the <strong>root</strong> node. Attach things
        true for a branch (a chapter, a location, a character's arc) to that branch's node. Rule of thumb:
        if a fact should hold for a node and everything below it, it belongs in a context item — not in the
        body text, which only travels down one path.
    </p>

    <h3 style="margin:1.25rem 0 0.4rem 0; font-size:1.02rem; color:#111827;">How inheritance works during generation</h3>
    <p style="margin:0 0 0.75rem 0;">
        When a node <em>N</em> generates, the engine walks from the root down to <em>N</em> and collects every
        ancestor's context items whose gates (below) pass for <em>N</em>. The green dot next to an item means
        it currently <strong>applies to the node open in the editor</strong>; a grey dot means it does not.
        Inherited items from ancestors are shown (read-only) in the "Show inherited" section.
    </p>

    <h3 style="margin:1.25rem 0 0.4rem 0; font-size:1.02rem; color:#111827;">The three gates</h3>
    <p style="margin:0 0 0.5rem 0;">Each item can be narrowed by up to three independent gates. An item applies to a node only if <em>all</em> its gates pass:</p>
    <ul style="margin:0 0 0.75rem 1.1rem; padding:0;">
        <li style="margin-bottom:0.5rem;">
            <strong>Applies to children (structural scope)</strong> — expressed against the owner node's
            <em>direct children</em> (the <code>===Section===</code> titles):
            <ul style="margin:0.3rem 0 0 1.1rem;">
                <li><strong>All children</strong> — the item reaches the owner and its entire subtree (the default, "global").</li>
                <li><strong>Only these children</strong> — reaches only the listed child subtrees.</li>
                <li><strong>All except these children</strong> — reaches everywhere <em>except</em> the listed children (so newly added children stay in scope).</li>
            </ul>
            To scope more deeply than direct children, attach the item to the deeper node instead — it is the same operation one level down.
        </li>
        <li style="margin-bottom:0.5rem;">
            <strong>Leaves only</strong> — when on, the item reaches only leaf-layer (finished-prose) nodes,
            and is withheld from the intermediate outline layers above them.
        </li>
        <li style="margin-bottom:0.5rem;">
            <strong>Trigger words (keywords)</strong> — an optional content gate. When set, the item is
            included only if at least one trigger word appears in the target's content (the node itself plus
            its earlier same-layer siblings). Matching is whole-word and case-insensitive. Leave empty to
            always include (subject to the other gates).
        </li>
    </ul>

    <h3 style="margin:1.25rem 0 0.4rem 0; font-size:1.02rem; color:#111827;">Passive context vs. verifiable constraints (<code>=&gt;</code>)</h3>
    <p style="margin:0 0 0.75rem 0;">
        Most items are <strong>passive context</strong>: background the AI simply reads. If you begin an
        item's text with <code>=&gt;</code>, it becomes a <strong>binary verifiable constraint</strong>
        instead: it is removed from the passive context block and surfaced to the rater as a pass/fail
        criterion that the generated content must satisfy (e.g. <code>=&gt; must end on a cliffhanger</code>).
        Use passive items for what the world <em>is</em>, and <code>=&gt;</code> constraints for hard rules a
        result must obey.
    </p>

    <h3 style="margin:1.25rem 0 0.4rem 0; font-size:1.02rem; color:#111827;">Item ids</h3>
    <p style="margin:0 0 0.75rem 0;">
        Every item has a stable id like <code>id_7</code>, shown on its row. This is the id the AI refers to
        in chat when it proposes edits to a specific item, so you can match what it says to what you see here.
    </p>

    <h3 style="margin:1.25rem 0 0.4rem 0; font-size:1.02rem; color:#111827;">Practical tips</h3>
    <ul style="margin:0 0 0.25rem 1.1rem; padding:0;">
        <li style="margin-bottom:0.35rem;">Keep each item to a single, self-contained fact or rule — it makes consistency and scoping far easier.</li>
        <li style="margin-bottom:0.35rem;">Prefer context items over body text for anything shared across a whole branch.</li>
        <li style="margin-bottom:0.35rem;">Use trigger words to keep situational details (a character who only appears later) out of nodes where they would be noise.</li>
        <li style="margin-bottom:0.35rem;">Reach for <code>=&gt;</code> only for things you actually want checked; everything else is better as plain context.</li>
    </ul>

</div>
`;

/**
 * Opens the context help dialog. Purely informational, dismissed with a single
 * "Got it" button (or the backdrop / close control).
 */
export function showContextHelp(): void {
    const content: GenericModalContent = {
        content: HELP_HTML,
        actions: [
            {
                id: 'close',
                label: 'Got it',
                type: 'primary',
                handler: () => { /* modal closes automatically */ }
            }
        ]
    };

    showGenericModal(
        content,
        { title: 'Understanding context', maxWidth: '680px' }
    );
}
