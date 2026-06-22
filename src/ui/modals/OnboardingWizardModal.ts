/**
 * OnboardingWizardModal
 *
 * A focused first-run wizard that replaces the dense Settings modal for brand-new
 * users. It collects the essentials and nothing more:
 *   Step 1 - paste the OpenRouter API key (validated by fetching the model catalog).
 *   Step 2 - pick ONE model, applied to all four purposes (creator/rater/editor/prose).
 *            Advanced users can later differentiate per purpose in Settings.
 *
 * The model picker is populated from OpenRouter's "latest" alias rows
 * (ids prefixed with "~", e.g. "~anthropic/claude-opus-latest") which always
 * resolve to the newest concrete model and need no maintenance on our side.
 * If no such aliases are returned, the full catalog is shown instead.
 *
 * On completion the chosen model is persisted and the wizard hands off to the
 * supplied onComplete callback (which opens the New Project modal).
 */

import { SimpleModal } from './core/SimpleModal';
import { createElement, MODAL_STYLES } from './core/modal-utils';
import { ModelSelector } from '../../ModelSelector';
import { OpenRouterClient, OpenRouterModel } from '../../OpenRouterClient';
import { getProfileManagerService } from '../services/ProfileManagerService';

const PURPOSE_KEYS = ['creator', 'rater', 'editor', 'prose'] as const;

function isApiKeyFormatValid(key: string): boolean {
    const trimmed = key.trim();
    return trimmed.startsWith('sk-') && trimmed.length >= 32;
}

export class OnboardingWizardModal extends SimpleModal {
    private readonly modelSelector: ModelSelector;
    private readonly onComplete: (() => void | Promise<void>) | undefined;

    private body: HTMLElement | null = null;
    private step: 1 | 2 = 1;

    private apiKey: string = '';
    private models: OpenRouterModel[] = [];
    private latestModels: OpenRouterModel[] = [];
    private showAll: boolean = false;
    private filterText: string = '';
    private selectedModelId: string = '';
    private busy: boolean = false;

    constructor(modelSelector: ModelSelector, onComplete?: () => void | Promise<void>) {
        super({
            id: 'onboarding-wizard-modal',
            closable: true,
            backdrop: false,
            width: 'min(92vw, 44rem)',
            maxWidth: '44rem',
            maxHeight: '90vh',
        });
        this.modelSelector = modelSelector;
        this.onComplete = onComplete;
    }

    public static async open(
        modelSelector: ModelSelector,
        onComplete?: () => void | Promise<void>,
    ): Promise<OnboardingWizardModal> {
        const modal = new OnboardingWizardModal(modelSelector, onComplete);
        await modal.open();
        return modal;
    }

    public render(): HTMLElement {
        const wrap = createElement('div');
        wrap.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
            width: 100%;
            min-width: min(88vw, 40rem);
        `;

        const header = createElement('div');
        header.innerHTML = `
            <h2 style="margin: 0 0 0.25rem 0; font-size: 1.5rem; color: #111827;">Welcome to Expert</h2>
            <p style="margin: 0; color: #6b7280; font-size: 0.95rem;">
                Two quick steps and you are ready to write. You can fine-tune everything later in Settings.
            </p>
        `;
        wrap.appendChild(header);

        this.body = createElement('div');
        this.body.style.cssText = 'display: flex; flex-direction: column; gap: 1rem;';
        wrap.appendChild(this.body);

        this.renderStep();
        return wrap;
    }

    private renderStep(): void {
        if (!this.body) return;
        this.body.innerHTML = '';
        if (this.step === 1) {
            this.renderKeyStep(this.body);
        } else {
            this.renderModelStep(this.body);
        }
    }

    // ----- Step 1: API key -------------------------------------------------

    private renderKeyStep(container: HTMLElement): void {
        const stepLabel = createElement('div');
        stepLabel.textContent = 'Step 1 of 2 - Connect OpenRouter';
        stepLabel.style.cssText = 'font-weight: 600; color: #2563eb; font-size: 0.85rem; letter-spacing: 0.02em;';
        container.appendChild(stepLabel);

        const intro = createElement('p');
        intro.innerHTML = `
            Expert generates text through <strong>OpenRouter</strong>, which gives you access to many AI models with one key.
            Paste your API key below. Don't have one yet?
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style="color: #2563eb;">Create a free key</a>.
        `;
        intro.style.cssText = 'margin: 0; color: #374151; font-size: 0.95rem; line-height: 1.5;';
        container.appendChild(intro);

        const input = createElement('input');
        input.type = 'password';
        input.placeholder = 'sk-or-...';
        input.value = this.apiKey;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            padding: 0.75rem 1rem;
            font-size: 1rem;
            border: 1px solid #d1d5db;
            border-radius: 0.5rem;
            outline: none;
        `;
        container.appendChild(input);

        const error = createElement('div');
        error.style.cssText = 'color: #dc2626; font-size: 0.9rem; min-height: 1.2rem;';
        container.appendChild(error);

        const footer = createElement('div');
        footer.style.cssText = 'display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem;';

        const continueBtn = createElement('button');
        continueBtn.type = 'button';
        continueBtn.textContent = 'Continue';
        continueBtn.style.cssText = `${MODAL_STYLES.button} background-color: #2563eb; color: white;`;

        const syncContinueState = (): void => {
            const ok = isApiKeyFormatValid(this.apiKey) && !this.busy;
            continueBtn.disabled = !ok;
            continueBtn.style.opacity = ok ? '1' : '0.5';
            continueBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
        };

        input.addEventListener('input', () => {
            this.apiKey = input.value;
            error.textContent = '';
            syncContinueState();
        });
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && isApiKeyFormatValid(this.apiKey) && !this.busy) {
                e.preventDefault();
                void this.validateKeyAndAdvance(error, continueBtn, syncContinueState);
            }
        });

        continueBtn.addEventListener('click', () => {
            void this.validateKeyAndAdvance(error, continueBtn, syncContinueState);
        });

        footer.appendChild(continueBtn);
        container.appendChild(footer);

        syncContinueState();
        setTimeout(() => { input.focus(); }, 0);
    }

    private async validateKeyAndAdvance(
        error: HTMLElement,
        continueBtn: HTMLButtonElement,
        syncContinueState: () => void,
    ): Promise<void> {
        this.busy = true;
        error.textContent = '';
        continueBtn.textContent = 'Checking key...';
        syncContinueState();

        try {
            // setApiKey persists the key and auto-fetches the catalog (throws on failure).
            await this.modelSelector.setApiKey(this.apiKey.trim());
            this.models = this.modelSelector.getModels();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            error.textContent = `Could not validate the key: ${message}`;
            this.busy = false;
            continueBtn.textContent = 'Continue';
            syncContinueState();
            return;
        }

        this.latestModels = this.models
            .filter(m => m.id.startsWith('~'))
            .sort((a, b) => a.name.localeCompare(b.name));

        // Default to the curated "latest" shortlist when available, otherwise the full catalog.
        this.showAll = this.latestModels.length === 0;

        this.busy = false;
        continueBtn.textContent = 'Continue';
        this.step = 2;
        this.renderStep();
    }

    // ----- Step 2: single model selection ----------------------------------

    private renderModelStep(container: HTMLElement): void {
        const stepLabel = createElement('div');
        stepLabel.textContent = 'Step 2 of 2 - Choose a model';
        stepLabel.style.cssText = 'font-weight: 600; color: #2563eb; font-size: 0.85rem; letter-spacing: 0.02em;';
        container.appendChild(stepLabel);

        const intro = createElement('p');
        intro.innerHTML = `
            Pick one model to get started. It will be used for every role (writing, rating, editing).
            You can assign different models per role later in Settings.
        `;
        intro.style.cssText = 'margin: 0; color: #374151; font-size: 0.95rem; line-height: 1.5;';
        container.appendChild(intro);

        const hasLatest = this.latestModels.length > 0;
        const note = createElement('div');
        note.style.cssText = 'color: #6b7280; font-size: 0.85rem;';
        if (hasLatest && !this.showAll) {
            note.textContent = 'Showing "latest" models - these automatically track the newest version of each family.';
        } else if (hasLatest && this.showAll) {
            note.textContent = 'Showing all available models.';
        } else {
            note.textContent = 'No "latest" aliases were returned by OpenRouter, so the full catalog is shown.';
        }
        container.appendChild(note);

        const filter = createElement('input');
        filter.type = 'text';
        filter.placeholder = 'Filter models...';
        filter.value = this.filterText;
        filter.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            padding: 0.6rem 0.85rem;
            font-size: 0.95rem;
            border: 1px solid #d1d5db;
            border-radius: 0.5rem;
            outline: none;
        `;
        container.appendChild(filter);

        const select = createElement('select');
        select.size = 8;
        select.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            padding: 0.4rem;
            font-size: 0.95rem;
            border: 1px solid #d1d5db;
            border-radius: 0.5rem;
            outline: none;
        `;
        container.appendChild(select);

        const populate = (): void => {
            const source = (hasLatest && !this.showAll) ? this.latestModels : this.models;
            const needle = this.filterText.trim().toLowerCase();
            const filtered = needle
                ? source.filter(m =>
                    m.name.toLowerCase().includes(needle) || m.id.toLowerCase().includes(needle))
                : source;

            select.innerHTML = '';
            for (const model of filtered) {
                const opt = createElement('option');
                opt.value = model.id;
                opt.textContent = model.name;
                if (model.id === this.selectedModelId) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            }
        };
        populate();

        filter.addEventListener('input', () => {
            this.filterText = filter.value;
            populate();
        });

        select.addEventListener('change', () => {
            this.selectedModelId = select.value;
            syncFinishState();
        });

        // "Show all models" toggle (only meaningful when a shortlist exists).
        let toggleRow: HTMLElement | null = null;
        if (hasLatest) {
            toggleRow = createElement('label');
            toggleRow.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; color: #374151; font-size: 0.9rem; cursor: pointer;';
            const cb = createElement('input');
            cb.type = 'checkbox';
            cb.checked = this.showAll;
            cb.addEventListener('change', () => {
                this.showAll = cb.checked;
                this.renderStep();
            });
            const cbLabel = createElement('span');
            cbLabel.textContent = 'Show all models';
            toggleRow.appendChild(cb);
            toggleRow.appendChild(cbLabel);
            container.appendChild(toggleRow);
        }

        const error = createElement('div');
        error.style.cssText = 'color: #dc2626; font-size: 0.9rem; min-height: 1.2rem;';
        container.appendChild(error);

        const footer = createElement('div');
        footer.style.cssText = 'display: flex; justify-content: space-between; gap: 0.75rem; margin-top: 0.5rem;';

        const backBtn = createElement('button');
        backBtn.type = 'button';
        backBtn.textContent = 'Back';
        backBtn.style.cssText = `${MODAL_STYLES.button} ${MODAL_STYLES.outlineButton}`;
        backBtn.addEventListener('click', () => {
            if (this.busy) return;
            this.step = 1;
            this.renderStep();
        });

        const finishBtn = createElement('button');
        finishBtn.type = 'button';
        finishBtn.textContent = 'Finish & create project';
        finishBtn.style.cssText = `${MODAL_STYLES.button} background-color: #2563eb; color: white;`;

        const syncFinishState = (): void => {
            const ok = this.selectedModelId !== '' && !this.busy;
            finishBtn.disabled = !ok;
            finishBtn.style.opacity = ok ? '1' : '0.5';
            finishBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
        };

        finishBtn.addEventListener('click', () => {
            void this.finish(error, finishBtn, syncFinishState);
        });

        footer.appendChild(backBtn);
        footer.appendChild(finishBtn);
        container.appendChild(footer);

        syncFinishState();
    }

    private async finish(
        error: HTMLElement,
        finishBtn: HTMLButtonElement,
        syncFinishState: () => void,
    ): Promise<void> {
        const id = this.selectedModelId;
        if (!id) return;

        this.busy = true;
        error.textContent = '';
        finishBtn.textContent = 'Setting up...';
        syncFinishState();

        // Validate that provider/endpoint info loads for the chosen model BEFORE persisting.
        // This avoids leaving a selection that later crashes areAllModelsSelected().
        try {
            await OpenRouterClient.getInstance().fetchModelEndpoints(id);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            error.textContent = `Could not load provider info for this model (${message}). Please choose another.`;
            this.busy = false;
            finishBtn.textContent = 'Finish & create project';
            syncFinishState();
            return;
        }

        const models: Record<string, string> = {};
        const providers: Record<string, string> = {};
        for (const key of PURPOSE_KEYS) {
            models[key] = id;
            providers[key] = 'automatic';
        }

        await this.modelSelector.setSelectedModels(models);
        await this.modelSelector.setSelectedProviders(providers);
        await getProfileManagerService().saveModelsToCurrentProfile(models, undefined, providers);

        await this.close();
        if (this.onComplete) {
            await this.onComplete();
        }
    }
}
