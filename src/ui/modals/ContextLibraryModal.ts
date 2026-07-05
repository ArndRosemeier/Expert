/**
 * Context library dialog.
 *
 * A curated, user-extensible library of reusable context items — mostly "=>"
 * enforced constraints such as anti-AI-cliche guards and craft rules distilled
 * from documented LLM writing tells. The dialog lists entries in a wide,
 * space-efficient two-column grid with checkmarks; checking entries and
 * confirming copies their text into the current node's conditional context (via
 * the onAdd callback). Users can add, edit, and delete their own entries, which
 * are persisted.
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

const CONTEXT_LIBRARY_STORAGE_KEY = 'context-library-entries-v1';

/**
 * A single library entry. `text` is the full item text and may begin with "=>"
 * to declare a binary verifiable constraint (enforced by the rater); otherwise
 * it is passive background context.
 */
export interface ContextLibraryEntry {
    id: string;
    name: string;
    text: string;
}

/**
 * Built-in starter entries. Ids are stable so the load-time merge can detect and
 * re-seed any that are missing from a user's stored library. Constraints are
 * phrased as binary (pass/fail) rules and target documented LLM writing tells.
 */
const DEFAULT_CONTEXT_LIBRARY: ContextLibraryEntry[] = [
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
    }
];

/**
 * Ids of built-in defaults that have been retired. They are pruned from a user's
 * stored library on load so removed built-ins do not linger.
 */
const RETIRED_DEFAULT_IDS: ReadonlySet<string> = new Set<string>([
    // Redundant with the rater's standard "No Antithesis Reframing" criterion.
    'ctxlib-no-antithesis'
]);

/** Normalize entry/item text for presence comparison. */
function normalizeText(text: string): string {
    return text.trim();
}

/**
 * Load the library from storage. Prunes any retired defaults, then
 * non-destructively merges in any built-in defaults that are missing by id. If
 * nothing is stored, seed with the defaults and persist them.
 */
async function loadLibrary(): Promise<ContextLibraryEntry[]> {
    const storage = await StorageService.getInstance();
    const stored = await storage.get<ContextLibraryEntry[]>(CONTEXT_LIBRARY_STORAGE_KEY);

    if (stored && Array.isArray(stored) && stored.length > 0) {
        const pruned = stored.filter(e => !RETIRED_DEFAULT_IDS.has(e.id));
        const knownIds = new Set(pruned.map(e => e.id));
        const missingDefaults = DEFAULT_CONTEXT_LIBRARY.filter(e => !knownIds.has(e.id));
        const merged = [...pruned, ...missingDefaults.map(e => ({ ...e }))];
        if (merged.length !== stored.length) {
            await storage.set(CONTEXT_LIBRARY_STORAGE_KEY, merged);
        }
        return merged;
    }

    const seeded = DEFAULT_CONTEXT_LIBRARY.map(e => ({ ...e }));
    await storage.set(CONTEXT_LIBRARY_STORAGE_KEY, seeded);
    return seeded;
}

/** Persist the given library entries. */
async function saveLibrary(entries: ContextLibraryEntry[]): Promise<void> {
    const storage = await StorageService.getInstance();
    await storage.set(CONTEXT_LIBRARY_STORAGE_KEY, entries);
}

/**
 * Open the context library picker.
 *
 * @param existingTexts Texts of the context items already on the target node.
 *                      Entries matching one of these are shown as already added
 *                      and cannot be checked (preventing duplicates).
 * @param onAdd Called with the texts of the newly checked entries when the user
 *              confirms. Empty texts are filtered out. The modal closes after.
 */
export function showContextLibrary(existingTexts: string[], onAdd: (texts: string[]) => void): void {
    const presentSet = new Set(existingTexts.map(normalizeText));

    // Working state, shared between the async list builder (onOpen) and the
    // footer action handlers (defined at showGenericModal call time).
    let workingEntries: ContextLibraryEntry[] = [];
    const checkedIds = new Set<string>();

    const collectCheckedTexts = (): string[] =>
        workingEntries
            .filter(e => checkedIds.has(e.id) && !presentSet.has(normalizeText(e.text)))
            .map(e => e.text.trim())
            .filter(text => text.length > 0);

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
                handler: () => { onAdd(collectCheckedTexts()); }
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
                workingEntries = await loadLibrary();
                buildUI(root, workingEntries, checkedIds, presentSet);
            }
        }
    );
}

/** Build the interactive picker UI inside the given root element. */
function buildUI(root: HTMLElement, entries: ContextLibraryEntry[], checkedIds: Set<string>, presentSet: Set<string>): void {
    root.innerHTML = '';
    root.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem; color: #1f2937;';

    const intro = createElement('p', {
        content: 'Check the entries you want, then "Add checked to context" to copy them into this node. Items starting with "=>" become enforced (pass/fail) constraints. Entries already on this node are marked "in context" and cannot be added twice. Edit or add your own; changes are saved automatically.'
    });
    intro.style.cssText = 'margin: 0; font-size: 0.9rem; line-height: 1.5; color: #374151;';
    root.appendChild(intro);

    const grid = createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 0.6rem;
        max-height: 60vh;
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
        const entry: ContextLibraryEntry = { id: crypto.randomUUID(), name: 'New entry', text: '' };
        entries.push(entry);
        void saveLibrary(entries);
        renderGrid(grid, entries, checkedIds, presentSet);
    });
    root.appendChild(newBtn);

    renderGrid(grid, entries, checkedIds, presentSet);
}

/** Clear and rebuild the entry cards. */
function renderGrid(grid: HTMLElement, entries: ContextLibraryEntry[], checkedIds: Set<string>, presentSet: Set<string>): void {
    grid.innerHTML = '';

    if (entries.length === 0) {
        const empty = createElement('div', { content: 'The library is empty. Add an entry to get started.' });
        empty.style.cssText = 'color: #9ca3af; padding: 0.25rem;';
        grid.appendChild(empty);
        return;
    }

    for (const entry of entries) {
        grid.appendChild(buildCard(entry, entries, checkedIds, presentSet, grid));
    }
}

/** Build a single editable, checkable entry card. */
function buildCard(
    entry: ContextLibraryEntry,
    entries: ContextLibraryEntry[],
    checkedIds: Set<string>,
    presentSet: Set<string>,
    grid: HTMLElement
): HTMLElement {
    const isPresent = presentSet.has(normalizeText(entry.text));

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
    checkbox.checked = isPresent ? true : checkedIds.has(entry.id);
    checkbox.disabled = isPresent;
    checkbox.style.cssText = 'flex: 0 0 auto;';
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) checkedIds.add(entry.id); else checkedIds.delete(entry.id);
    });

    const nameInput = createElement('input');
    nameInput.type = 'text';
    nameInput.value = entry.name;
    nameInput.placeholder = 'Entry name';
    nameInput.style.cssText = 'flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 0.3rem 0.5rem; border: 1px solid #d1d5db; border-radius: 0.4rem; font-weight: 600;';
    nameInput.addEventListener('input', () => { entry.name = nameInput.value; });
    nameInput.addEventListener('change', () => { void saveLibrary(entries); });

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
        checkedIds.delete(entry.id);
        void saveLibrary(entries);
        renderGrid(grid, entries, checkedIds, presentSet);
    });
    topRow.appendChild(deleteBtn);

    const textArea = createElement('textarea');
    textArea.value = entry.text;
    textArea.placeholder = 'Context text. Begin with => to make it an enforced constraint.';
    textArea.rows = 3;
    textArea.style.cssText = 'width: 100%; box-sizing: border-box; padding: 0.35rem 0.5rem; border: 1px solid #d1d5db; border-radius: 0.4rem; resize: vertical; font: inherit;';
    textArea.addEventListener('input', () => { entry.text = textArea.value; });
    textArea.addEventListener('change', () => { void saveLibrary(entries); });

    card.appendChild(topRow);
    card.appendChild(textArea);

    return card;
}
