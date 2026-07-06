/**
 * Context library dialog.
 *
 * A curated, user-extensible library of reusable context items, split across two
 * tabs:
 *
 *   - Constraints: mostly "=>" enforced (pass/fail) rules distilled from
 *     documented LLM writing tells. Added as normal context items.
 *   - Style guides: positive, comprehensive descriptions of a writing style.
 *     Passive (not enforced) and added as LEAVES-ONLY items, since there is no
 *     point styling intermediate outline layers.
 *
 * The dialog lists entries in a wide, space-efficient two-column grid with
 * checkmarks; checking entries and confirming copies their text into the current
 * node's conditional context (via the onAdd callback). Users can add, edit, and
 * delete their own entries per tab, which are persisted.
 *
 * The dialog is aware of what is already on the node: entries whose text already
 * exists as a context item are shown checked and disabled ("in context"), and
 * are never added again.
 *
 * Opened from the small library button in the ConditionalContextEditor.
 *
 * Persistence and the "merge missing built-in defaults by id" behavior mirror the
 * Advisor-preset system in XMLStoryModal: built-in defaults are re-seeded when
 * absent (so newly shipped defaults reach existing users), while user-created
 * entries persist. Retired defaults are pruned by id so removed built-ins do not
 * linger in a user's stored library.
 */

import { showGenericModal } from './GenericModal';
import { StorageService } from '../../StorageService';
import { createElement } from './core/modal-utils';
import type { GenericModalContent } from './types/ModalTypes';

/**
 * A single library entry. `text` is the full item text. For the Constraints tab
 * it may begin with "=>" to declare a binary verifiable constraint (enforced by
 * the rater); for the Style guides tab it is passive background prose.
 */
export interface ContextLibraryEntry {
    id: string;
    name: string;
    text: string;
}

/** A context item to create on the node, with its application facet(s). */
export interface ContextAddition {
    text: string;
    leavesOnly: boolean;
}

type LibraryKind = 'constraint' | 'style';

interface KindConfig {
    key: string;
    label: string;
    defaults: ContextLibraryEntry[];
    retiredIds: ReadonlySet<string>;
    /** How added items reach nodes. Style guides apply to leaf/prose nodes only. */
    leavesOnly: boolean;
    hint: string;
    placeholder: string;
}

/**
 * Built-in constraint entries. Ids are stable so the load-time merge can detect
 * and re-seed any that are missing. Constraints are phrased as binary (pass/fail)
 * rules and target documented LLM writing tells.
 */
const DEFAULT_CONSTRAINTS: ContextLibraryEntry[] = [
    {
        id: 'ctxlib-anti-cliche',
        name: 'Anti-cliche vocabulary',
        text: '=> Avoid AI-cliche vocabulary and filler (e.g. "delve", "tapestry", "testament to", "leverage", "utilize", "seamless", "robust", "myriad", "in today\'s fast-paced world", "little did they know").'
    },
    {
        id: 'ctxlib-show-dont-tell',
        name: 'Show, don\'t tell',
        text: '=> Convey emotion through action and subtext; do not name the emotion outright.'
    },
    {
        id: 'ctxlib-sentence-rhythm',
        name: 'Vary sentence rhythm',
        text: '=> Vary sentence length and structure; avoid a uniform cadence.'
    },
    {
        id: 'ctxlib-concrete-detail',
        name: 'Concrete sensory detail',
        text: '=> Ground each scene in at least one specific, concrete sensory detail.'
    },
    {
        id: 'ctxlib-pov-tense-lock',
        name: 'POV / tense lock (style guide)',
        text: '=> Stay in third-person limited, past tense.'
    },
    {
        id: 'ctxlib-dramatize-dialogue',
        name: 'Dramatize, don\'t summarize dialogue',
        text: '=> Dramatize important interactions as direct speech; do not summarize in narration conversations that should play out on the page.'
    },
    {
        id: 'ctxlib-dialogue-subtext',
        name: 'Dialogue subtext',
        text: '=> Give dialogue subtext: characters deflect, evade, or talk around what they want instead of stating their feelings plainly.'
    },
    {
        id: 'ctxlib-plain-tags',
        name: 'Plain dialogue tags',
        text: '=> Use plain dialogue tags ("said"/"asked") or action beats; avoid ornate tags (murmured, rasped, breathed) and adverb tags ("she said nervously").'
    },
    {
        id: 'ctxlib-distinct-voices',
        name: 'Distinct character voices',
        text: '=> Give each character a distinct voice; with the dialogue tags removed, the reader could still tell who is speaking.'
    },
    {
        id: 'ctxlib-no-emotion-explain',
        name: 'No speech-gesture-emotion cycle',
        text: '=> Do not follow the mechanical pattern of a dialogue line, then a gesture, then a sentence naming the emotion.'
    },
    {
        id: 'ctxlib-no-wisdom-bow',
        name: 'No tidy wisdom summary',
        text: '=> Do not end a scene or chapter with a standalone aphorism that packages its meaning ("Some wounds, she understood now, never truly close").'
    },
    {
        id: 'ctxlib-emotional-shift',
        name: 'Let emotion shift in a scene',
        text: '=> Let the emotional register move within a scene; it must not hold a single note from beginning to end.'
    },
    {
        id: 'ctxlib-embrace-ambiguity',
        name: 'Embrace ambiguity',
        text: '=> Do not resolve everything neatly; leave some questions open and let characters stay contradictory or mysterious.'
    },
    {
        id: 'ctxlib-scene-changes',
        name: 'Every scene must change something',
        text: '=> Every scene must change something concrete (a relationship, a plan, a character\'s understanding); avoid scenes where nothing shifts.'
    },
    {
        id: 'ctxlib-no-throat-clearing',
        name: 'No throat-clearing openings',
        text: '=> Do not open with weather-as-mood or generic scene-setting ("In a world where…"); begin with something concrete and specific.'
    },
    {
        id: 'ctxlib-no-body-cliches',
        name: 'No stock body-language cliches',
        text: '=> Avoid stock physical cliches for emotion (furrowed brow, single tear, heart skipping a beat, widening eyes, a chill down the spine, jaw dropping).'
    },
    {
        id: 'ctxlib-no-rule-of-three',
        name: 'No habitual rule of three',
        text: '=> Do not habitually group ideas or images in threes; vary the number of items in lists and descriptions.'
    },
    {
        id: 'ctxlib-emotion-not-only-body',
        name: 'Vary how emotion is shown',
        text: '=> Do not convey emotion mainly through bodily sensations (racing heart, tight chest, knot in the stomach, prickling skin); show feeling through choices, actions, dialogue and thought as well.'
    },
    {
        id: 'ctxlib-no-philosophical-dialogue',
        name: 'Dialogue is not a debate stage',
        text: '=> Do not use dialogue as a vehicle for abstract philosophical or thematic debate; characters talk to pursue what they want, not to voice the story\'s ideas.'
    },
    {
        id: 'ctxlib-character-intro-in-action',
        name: 'Introduce characters in action',
        text: '=> Introduce characters through action, speech and how others treat them, not through an upfront block of external physical description.'
    }
];

/**
 * Built-in style-guide entries. Passive (no "=>"), comprehensive descriptions of
 * a writing style. Added as leaves-only items.
 */
const DEFAULT_STYLES: ContextLibraryEntry[] = [
    {
        id: 'style-minimalist',
        name: 'Minimalist (Hemingway)',
        text: 'Write in a spare, minimalist style in the tradition of Hemingway: short declarative sentences, concrete nouns and strong verbs, and few adjectives or adverbs. Prefer plain words to ornate ones. Follow the iceberg principle — imply emotion through action, objects, and dialogue rather than describing it directly. Trust omission and subtext to carry weight; leave the unspoken beneath the surface.'
    },
    {
        id: 'style-lyrical',
        name: 'Lyrical / literary',
        text: 'Write in a lyrical, literary style: musical prose attentive to rhythm and the sound of sentences, with vivid but precise imagery and metaphors that illuminate rather than decorate. Vary sentence length for cadence and let paragraphs breathe. Favor sensory specificity, interiority, and emotional resonance over plot summary, without tipping into purple prose.'
    },
    {
        id: 'style-noir',
        name: 'Hardboiled noir',
        text: 'Write in a hardboiled noir style: terse, cynical narration in a world-weary voice, wry understatement, and sharp, surprising similes. Keep dialogue clipped and loaded. Evoke an atmosphere of moral ambiguity, shadow, cigarette smoke, and rain-slicked streets, where everyone has an angle and no one is clean.'
    },
    {
        id: 'style-pulp',
        name: 'Fast-paced pulp adventure',
        text: 'Write in a fast-paced pulp adventure style: propulsive action, vivid set pieces, and momentum over introspection. Use short scenes, strong verbs, and hooks or cliffhangers that pull the reader forward. Keep the stakes high and the pace relentless; description is quick and functional, serving the drive of the story.'
    },
    {
        id: 'style-comic',
        name: 'Witty / comic',
        text: 'Write in a light, witty, comic style: playful narration, ironic asides, and precise comic timing. Let humor arise from character, situation, and reversal rather than from breaking the story\'s internal logic. Keep the wit dry and character-rooted; underplay the jokes rather than telegraphing them.'
    },
    {
        id: 'style-gothic',
        name: 'Gothic',
        text: 'Write in a gothic style: a brooding, oppressive atmosphere, decaying grand settings, and a mounting sense of dread and the uncanny. Use rich, shadowed description in which landscape, weather, and architecture mirror inner turmoil. Build psychological unease slowly, with secrets, isolation, and the past pressing on the present.'
    },
    {
        id: 'style-clean-contemporary',
        name: 'Clean contemporary',
        text: 'Write in a clean, contemporary style: clear, unadorned prose in the active voice, concrete detail, and an unobtrusive narrator that never calls attention to itself. Use modern diction and natural, realistic dialogue. Set scenes efficiently and get out of the way of the story; clarity and momentum over ornament.'
    },
    {
        id: 'style-mythic',
        name: 'Mythic / fairy-tale',
        text: 'Write in a mythic, fairy-tale style: a timeless, oral-storytelling cadence, formal but simple diction, and patterned repetition. Use archetypal images and a sense of the numinous, with moral weight beneath the surface. Keep a slight distance and formality, as of a tale told and retold rather than a scene observed up close.'
    },
    {
        id: 'style-epic-fantasy',
        name: 'Epic / high fantasy register',
        text: 'Write in a high, epic register suited to grand fantasy: elevated but clear diction, sweeping description of landscape and deep history, and formal, weighty dialogue. Convey scale, lineage, and destiny. Keep the grandeur disciplined — evocative and specific rather than vague or purple.'
    }
];

const KIND_CONFIG: Record<LibraryKind, KindConfig> = {
    constraint: {
        key: 'context-library-entries-v1',
        label: 'Constraints',
        defaults: DEFAULT_CONSTRAINTS,
        // Redundant with the rater's standard "No Antithesis Reframing" criterion.
        retiredIds: new Set<string>(['ctxlib-no-antithesis']),
        // These are all prose-craft rules; they only make sense on the finished
        // prose. Adding them leaves-only lets the user drop them once on a
        // high-level (even the top) node and have them bind only the leaf/prose
        // nodes beneath it, never the intermediate outline layers.
        leavesOnly: true,
        hint: 'Check the constraints you want, then "Add checked to context". Items starting with "=>" become enforced (pass/fail) rules the rater must satisfy. They are added as leaves-only, so you can set them once on a high-level node and they apply only to the finished prose (leaf) nodes beneath it.',
        placeholder: 'Constraint text. Begin with => to make it an enforced (pass/fail) rule.'
    },
    style: {
        key: 'context-style-library-entries-v1',
        label: 'Style guides',
        defaults: DEFAULT_STYLES,
        retiredIds: new Set<string>(),
        leavesOnly: true,
        hint: 'Comprehensive descriptions of a writing style. Added as passive, leaves-only context (they guide the finished prose, not the outline layers). Usually you want one per branch.',
        placeholder: 'A comprehensive description of the writing style (passive, not enforced).'
    }
};

interface LibraryState {
    entriesByKind: Record<LibraryKind, ContextLibraryEntry[]>;
    checkedIds: Set<string>;
    presentSet: Set<string>;
    activeKind: LibraryKind;
}

/** Normalize entry/item text for presence comparison. */
function normalizeText(text: string): string {
    return text.trim();
}

/**
 * Load one library from storage. Prunes any retired defaults, then
 * non-destructively merges in any built-in defaults that are missing by id. If
 * nothing is stored, seed with the defaults and persist them.
 */
async function loadLibrary(cfg: KindConfig): Promise<ContextLibraryEntry[]> {
    const storage = await StorageService.getInstance();
    const stored = await storage.get<ContextLibraryEntry[]>(cfg.key);

    if (stored && Array.isArray(stored) && stored.length > 0) {
        const pruned = stored.filter(e => !cfg.retiredIds.has(e.id));
        const knownIds = new Set(pruned.map(e => e.id));
        const missingDefaults = cfg.defaults.filter(e => !knownIds.has(e.id));
        const merged = [...pruned, ...missingDefaults.map(e => ({ ...e }))];
        if (merged.length !== stored.length) {
            await storage.set(cfg.key, merged);
        }
        return merged;
    }

    const seeded = cfg.defaults.map(e => ({ ...e }));
    await storage.set(cfg.key, seeded);
    return seeded;
}

/** Persist the given library entries under the given key. */
async function saveLibrary(key: string, entries: ContextLibraryEntry[]): Promise<void> {
    const storage = await StorageService.getInstance();
    await storage.set(key, entries);
}

/**
 * Open the context library picker.
 *
 * @param existingTexts Texts of the context items already on the target node.
 *                      Entries matching one of these are shown as already added
 *                      and cannot be checked (preventing duplicates).
 * @param onAdd Called with the newly checked additions (text + application facet)
 *              when the user confirms. Empty texts are filtered out. The modal
 *              closes after.
 */
export function showContextLibrary(existingTexts: string[], onAdd: (additions: ContextAddition[]) => void): void {
    const state: LibraryState = {
        entriesByKind: { constraint: [], style: [] },
        checkedIds: new Set<string>(),
        presentSet: new Set(existingTexts.map(normalizeText)),
        activeKind: 'constraint'
    };

    const collectAdditions = (): ContextAddition[] => {
        const out: ContextAddition[] = [];
        for (const kind of ['constraint', 'style'] as LibraryKind[]) {
            const leavesOnly = KIND_CONFIG[kind].leavesOnly;
            for (const entry of state.entriesByKind[kind]) {
                if (!state.checkedIds.has(entry.id)) continue;
                if (state.presentSet.has(normalizeText(entry.text))) continue;
                const text = entry.text.trim();
                if (text.length === 0) continue;
                out.push({ text, leavesOnly });
            }
        }
        return out;
    };

    const content: GenericModalContent = {
        content: '<div id="ctx-lib-root"></div>',
        actions: [
            {
                id: 'close',
                label: 'Close',
                type: 'outline',
                handler: () => { /* modal closes automatically */ }
            },
            {
                id: 'add',
                label: 'Add checked to context',
                type: 'primary',
                handler: () => { onAdd(collectAdditions()); }
            }
        ]
    };

    showGenericModal(
        content,
        { title: 'Context library', maxWidth: '1040px' },
        {
            onOpen: async () => {
                const root = document.getElementById('ctx-lib-root');
                if (!root) {
                    throw new Error('ContextLibraryModal: #ctx-lib-root not found after render');
                }
                state.entriesByKind.constraint = await loadLibrary(KIND_CONFIG.constraint);
                state.entriesByKind.style = await loadLibrary(KIND_CONFIG.style);
                buildUI(root, state);
            }
        }
    );
}

/** Build the tabbed interactive picker UI inside the given root element. */
function buildUI(root: HTMLElement, state: LibraryState): void {
    root.innerHTML = '';
    root.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem; color: #1f2937;';

    // Tab bar
    const tabBar = createElement('div');
    tabBar.style.cssText = 'display: flex; gap: 0.4rem; border-bottom: 1px solid #e5e7eb;';
    const tabButtons: Record<LibraryKind, HTMLButtonElement> = {
        constraint: makeTabButton(KIND_CONFIG.constraint.label),
        style: makeTabButton(KIND_CONFIG.style.label)
    };
    tabBar.appendChild(tabButtons.constraint);
    tabBar.appendChild(tabButtons.style);
    root.appendChild(tabBar);

    const hint = createElement('p');
    hint.style.cssText = 'margin: 0; font-size: 0.9rem; line-height: 1.5; color: #374151;';
    root.appendChild(hint);

    const grid = createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 0.6rem;
        max-height: 58vh;
        overflow: auto;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 0.5rem;
    `;
    root.appendChild(grid);

    const newBtn = createElement('button', { content: '\uFF0B New entry' });
    newBtn.type = 'button';
    newBtn.style.cssText = 'align-self: flex-start; padding: 0.4rem 0.8rem; border-radius: 0.5rem; border: 1px solid #1d4ed8; background: #2563eb; color: #ffffff; font-weight: 600; cursor: pointer;';
    newBtn.addEventListener('click', () => {
        const cfg = KIND_CONFIG[state.activeKind];
        const entry: ContextLibraryEntry = { id: crypto.randomUUID(), name: 'New entry', text: '' };
        state.entriesByKind[state.activeKind].push(entry);
        void saveLibrary(cfg.key, state.entriesByKind[state.activeKind]);
        renderGrid(grid, state);
    });
    root.appendChild(newBtn);

    const renderActive = (): void => {
        for (const kind of ['constraint', 'style'] as LibraryKind[]) {
            styleTabButton(tabButtons[kind], kind === state.activeKind);
        }
        hint.textContent = KIND_CONFIG[state.activeKind].hint;
        renderGrid(grid, state);
    };

    for (const kind of ['constraint', 'style'] as LibraryKind[]) {
        tabButtons[kind].addEventListener('click', () => {
            state.activeKind = kind;
            renderActive();
        });
    }

    renderActive();
}

function makeTabButton(label: string): HTMLButtonElement {
    const btn = createElement('button', { content: label });
    btn.type = 'button';
    return btn;
}

function styleTabButton(btn: HTMLButtonElement, active: boolean): void {
    btn.style.cssText = `
        padding: 0.5rem 1rem;
        border: none;
        border-bottom: 3px solid ${active ? '#2563eb' : 'transparent'};
        background: transparent;
        color: ${active ? '#1d4ed8' : '#6b7280'};
        font-weight: 600;
        cursor: pointer;
        margin-bottom: -1px;
    `;
}

/** Clear and rebuild the entry cards for the active tab. */
function renderGrid(grid: HTMLElement, state: LibraryState): void {
    grid.innerHTML = '';
    const entries = state.entriesByKind[state.activeKind];

    if (entries.length === 0) {
        const empty = createElement('div', { content: 'This library is empty. Add an entry to get started.' });
        empty.style.cssText = 'color: #9ca3af; padding: 0.25rem;';
        grid.appendChild(empty);
        return;
    }

    for (const entry of entries) {
        grid.appendChild(buildCard(entry, state, grid));
    }
}

/** Build a single editable, checkable entry card for the active tab. */
function buildCard(entry: ContextLibraryEntry, state: LibraryState, grid: HTMLElement): HTMLElement {
    const cfg = KIND_CONFIG[state.activeKind];
    const entries = state.entriesByKind[state.activeKind];
    const isPresent = state.presentSet.has(normalizeText(entry.text));

    const card = createElement('div');
    card.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.5rem;
        border: 1px solid ${isPresent ? '#a7f3d0' : '#e5e7eb'};
        border-radius: 0.5rem;
        background: ${isPresent ? '#f0fdf4' : '#ffffff'};
    `;

    const topRow = createElement('div');
    topRow.style.cssText = 'display: flex; gap: 0.4rem; align-items: center;';

    const checkbox = createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isPresent ? true : state.checkedIds.has(entry.id);
    checkbox.disabled = isPresent;
    checkbox.style.cssText = 'flex: 0 0 auto;';
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.checkedIds.add(entry.id); else state.checkedIds.delete(entry.id);
    });

    const nameInput = createElement('input');
    nameInput.type = 'text';
    nameInput.value = entry.name;
    nameInput.placeholder = 'Entry name';
    nameInput.style.cssText = 'flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 0.3rem 0.5rem; border: 1px solid #d1d5db; border-radius: 0.4rem; font-weight: 600;';
    nameInput.addEventListener('input', () => { entry.name = nameInput.value; });
    nameInput.addEventListener('change', () => { void saveLibrary(cfg.key, entries); });

    topRow.appendChild(checkbox);
    topRow.appendChild(nameInput);

    if (isPresent) {
        const badge = createElement('span', { content: '✓ in context' });
        badge.style.cssText = 'flex: 0 0 auto; font-size: 0.72rem; color: #047857; background: #d1fae5; border: 1px solid #a7f3d0; border-radius: 0.3rem; padding: 0.1rem 0.35rem; white-space: nowrap;';
        topRow.appendChild(badge);
    }

    const deleteBtn = createElement('button', { content: '\u2715' });
    deleteBtn.type = 'button';
    deleteBtn.title = 'Delete this entry';
    deleteBtn.style.cssText = 'flex: 0 0 auto; width: 1.7rem; height: 1.7rem; line-height: 1; padding: 0; border-radius: 0.4rem; border: 1px solid #fecaca; background: #fee2e2; color: #b91c1c; font-weight: 700; cursor: pointer;';
    deleteBtn.addEventListener('click', () => {
        const index = entries.findIndex(e => e.id === entry.id);
        if (index !== -1) entries.splice(index, 1);
        state.checkedIds.delete(entry.id);
        void saveLibrary(cfg.key, entries);
        renderGrid(grid, state);
    });
    topRow.appendChild(deleteBtn);

    const textArea = createElement('textarea');
    textArea.value = entry.text;
    textArea.placeholder = cfg.placeholder;
    textArea.rows = state.activeKind === 'style' ? 5 : 3;
    textArea.style.cssText = 'width: 100%; box-sizing: border-box; padding: 0.35rem 0.5rem; border: 1px solid #d1d5db; border-radius: 0.4rem; resize: vertical; font: inherit;';
    textArea.addEventListener('input', () => { entry.text = textArea.value; });
    textArea.addEventListener('change', () => { void saveLibrary(cfg.key, entries); });

    card.appendChild(topRow);
    card.appendChild(textArea);

    return card;
}
