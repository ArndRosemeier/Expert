export const PROMPT_STORAGE_KEY = 'expert_app_prompts';

export interface OrchestratorPrompts {
    creator_initial: string;
    creator: string;
    rater: string;
    editor: string;
}

export const defaultPrompts: OrchestratorPrompts = {
    creator_initial: `
        Your task is to respond to the following user prompt: "{{prompt}}"

        Your response will be rated on the following criteria:
        - {{criteria}}

        Please generate a high-quality response that addresses these criteria.
    `.trim(),
    creator: `
        The user's original prompt was: "{{prompt}}".
        Your last response was: "{{lastResponse}}".
        It received feedback and the editor provided the following advice to improve it: "{{editorAdvice}}".

        Please generate a new response, incorporating the editor's advice. Remember, your response will be rated on these criteria:
        - {{criteria}}
    `.trim(),
    rater: `
        The user's original prompt was: "{{originalPrompt}}".
        
        Here is a response generated for that prompt: "{{response}}"
        
        Please rate this response on the single criterion of "{{criterion}}".
        The goal is to score at least {{goal}} out of 10.
        
        Provide your response as a JSON object with two keys:
        - "score": A number from 1 to 10.
        - "justification": A brief explanation for your score.

        Example: {"score": 8, "justification": "The response is clear and well-structured."}
    `.trim(),
    editor: `
        A response was generated: "{{response}}"
        It was rated against several criteria:
        {{ratings}}

        Please provide concise, actionable advice for the Creator LLM on how to improve the response to better meet the rating goals.
        Focus on what needs to change.
    `.trim(),
};

const placeholders: Record<keyof OrchestratorPrompts, string[]> = {
    creator_initial: ['prompt', 'criteria'],
    creator: ['prompt', 'lastResponse', 'editorAdvice', 'criteria'],
    rater: ['originalPrompt', 'response', 'criterion', 'goal'],
    editor: ['response', 'ratings'],
};

export class PromptManager {
    private prompts: OrchestratorPrompts;
    private onSave: (prompts: OrchestratorPrompts) => void;
    private root: HTMLElement;

    constructor(root: HTMLElement, onSave: (prompts: OrchestratorPrompts) => void) {
        this.root = root;
        this.onSave = onSave;
        this.prompts = this.loadFromStorage();
        this.render();
    }

    private loadFromStorage(): OrchestratorPrompts {
        const saved = localStorage.getItem(PROMPT_STORAGE_KEY);
        if (saved) {
            return { ...defaultPrompts, ...JSON.parse(saved) };
        }
        return { ...defaultPrompts };
    }

    private saveToStorage() {
        localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(this.prompts));
        this.onSave(this.prompts);
        console.log('Prompts saved.');
    }

    private revertToDefaults() {
        if (confirm('Are you sure you want to revert all prompts to their default values? Any unsaved changes will be lost.')) {
            this.prompts = { ...defaultPrompts };
            this.render();
        }
    }

    public getPrompts(): OrchestratorPrompts {
        return this.prompts;
    }

    render() {
        this.root.innerHTML = `
            <style>
                .prompt-editor { margin-bottom: 1.5rem; }
                .prompt-editor label { font-weight: bold; display: block; margin-bottom: 0.25rem; }
                .prompt-editor textarea { width: 100%; min-height: 200px; font-family: monospace; }
                .placeholders { font-size: 0.8rem; font-style: italic; margin-bottom: 0.5rem; color: #555; }
                .placeholders code { background-color: #eee; padding: 2px 4px; border-radius: 3px; }
            </style>
            <h2>Configure Prompts</h2>
            <p>Edit the templates used by the LLM agents.</p>
        `;

        Object.keys(this.prompts).forEach(key => {
            const k = key as keyof OrchestratorPrompts;
            const editorDiv = document.createElement('div');
            editorDiv.className = 'prompt-editor';
            
            const label = document.createElement('label');
            label.textContent = `${k.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} Prompt Template`;

            const placeholderText = document.createElement('div');
            placeholderText.className = 'placeholders';
            placeholderText.innerHTML = `Available placeholders: ${placeholders[k].map(p => `<code>{{${p}}}</code>`).join(', ')}`;
            
            const textarea = document.createElement('textarea');
            textarea.value = this.prompts[k];
            textarea.addEventListener('input', () => {
                this.prompts[k] = textarea.value;
            });

            editorDiv.appendChild(label);
            editorDiv.appendChild(placeholderText);
            editorDiv.appendChild(textarea);
            this.root.appendChild(editorDiv);
        });

        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '1.5rem';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '1rem';

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save and Close';
        saveButton.addEventListener('click', () => this.saveToStorage());
        buttonContainer.appendChild(saveButton);
        
        const revertButton = document.createElement('button');
        revertButton.textContent = 'Revert to Default';
        revertButton.addEventListener('click', () => this.revertToDefaults());
        buttonContainer.appendChild(revertButton);

        this.root.appendChild(buttonContainer);
    }
} 