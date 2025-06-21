import { SettingsManager } from './SettingsManager';

export const PROMPT_STORAGE_KEY = 'expert_app_prompts';

export interface OrchestratorPrompts {
    // For the main generation loop
    content_generation_initial: string;
    content_generation_iterative: string;
    rater: string;
    editor: string;
    
    // For single-shot actions
    summarize_system: string;
    expand_list_user: string;
    content_generation_user: string;
    branch_content_generation_user: string;
    create_children_from_outline_user: string;
    prompt_for_child_generation_prompt: string;
}

export const defaultPrompts: OrchestratorPrompts = {
    content_generation_initial: `
        Your task is to respond to the following user prompt: "{{prompt}}"

        Your response will be rated on the following criteria:
        - {{criteria}}

        Please generate a high-quality response that addresses these criteria.
    `.trim(),
    content_generation_iterative: `
        The user's original prompt was: "{{prompt}}".
        Your last response was: "{{lastResponse}}".
        It received feedback and the editor provided the following advice to improve it: "{{editorAdvice}}".

        Please generate a new response, incorporating the editor's advice. Remember, your response will be rated on these criteria:
        - {{criteria}}
    `.trim(),
    rater: `
        You are a rating agent. Your response MUST be a single, valid JSON object and nothing else. Do not include any text before or after the JSON.

        The user's original prompt was: "{{originalPrompt}}".
        
        Here is a response generated for that prompt: "{{response}}"
        
        Please rate this response on the single criterion of "{{criterion}}".
        The goal is to score at least {{goal}} out of 10.
        
        Provide your response as a JSON object with two keys:
        - "score": A number from 1 to 10.
        - "justification": A brief explanation for your score, written in a neutral, objective tone.

        Example: {"score": 8, "justification": "The response is clear and well-structured."}
    `.trim(),
    editor: `
        A response was generated: "{{response}}"
        It was rated against several criteria:
        {{ratings}}

        Please provide concise, actionable advice for the Creator LLM on how to improve the response to better meet the rating goals.
        Focus on what needs to change.
    `.trim(),

    // New prompts for template-based actions
    summarize_system: `
        You are an expert at summarizing text for use as future context. Create a concise, factual summary of the following text, capturing the key points, main ideas, and any critical details.

        ---
        
        {{content}}
    `.trim(),
    expand_list_user: `
        You are working on the document path: "{{path}}".

        Here is the content of the document you are expanding:
        ---
        {{parent_content}}
        ---

        Here is the context of the document so far:
        ---
        {{context}}
        ---

        Based on this, generate a bullet point list of {{count}} titles for the '{{child_level_name}}' nodes that will follow. Each title must be on a new line and start with a single asterisk (*).
    `.trim(),
    content_generation_user: `
        You are writing the content for the node at the following path: "{{path}}".
        The title of this node is "{{title}}".

        Here is the context of the story so far:
        ---
        {{context}}
        ---

        Now, write the full content for this node.
    `.trim(),
    branch_content_generation_user: `
        You are an expert at outlining and structuring documents. You are working on a node at the path "{{path}}" with the title "{{title}}".
        This is a "branch" node, meaning it will be expanded into child nodes later. Your task is to generate the content for this branch node.

        This content should be a prose outline or a summary of the key points, characters, and plot beats for the {{count}} '{{child_level_name}}' nodes that will logically follow. This text will be used to generate the titles of the child nodes later. Do NOT use bullet points or markdown. Write it as a single block of text.

        Here is the context of the document so far:
        ---
        {{context}}
        ---
    `.trim(),
    create_children_from_outline_user: `
        You are an expert at structuring documents. The following text is a free-form outline for a section of a document. Your task is to read this outline and generate a concise, bulleted list of titles for the '{{child_level_name}}' nodes that should be created from it.

        Each title must be on a new line and start with a single asterisk (*). Do not include any other text or explanations.

        Here is the context of the document so far:
        ---
        {{context}}
        ---

        Here is the outline to process:
        ---
        {{outline_content}}
        ---
    `.trim(),
    prompt_for_child_generation_prompt: `You are an expert at creating generative prompts for a hierarchical document. The user is expanding a parent node. A new child node with the title "{{child_title}}" has just been created.

The parent node's content is:
---
{{parent_content}}
---

The broader context of the document is:
---
{{context}}
---

Based on all of this information, please write a detailed, one-paragraph prompt that can be used to generate the full text content for the new child node titled "{{child_title}}". The prompt should be self-contained and guide an AI to write content that logically follows the parent, fits within the document's context, and fulfills the promise of its title. Do not just repeat the title; create a rich instruction.`,
};

const placeholders: Record<keyof OrchestratorPrompts, string[]> = {
    content_generation_initial: ['prompt', 'criteria'],
    content_generation_iterative: ['prompt', 'lastResponse', 'editorAdvice', 'criteria'],
    rater: ['originalPrompt', 'response', 'criterion', 'goal'],
    editor: ['response', 'ratings'],
    summarize_system: ['content'],
    expand_list_user: ['path', 'context', 'child_level_name', 'count', 'parent_content'],
    content_generation_user: ['path', 'context', 'title'],
    branch_content_generation_user: ['path', 'context', 'title', 'child_level_name', 'count'],
    create_children_from_outline_user: ['outline_content', 'child_level_name', 'context'],
    prompt_for_child_generation_prompt: ['parent_content', 'context', 'child_title'],
};

const promptDescriptions: Partial<Record<keyof OrchestratorPrompts, string>> = {
    content_generation_initial: "The main system prompt for the iterative generation loop. It defines the AI's task and is combined with the 'User' prompt below to start the process.",
    content_generation_iterative: "The system prompt for subsequent iterations in the loop. It's used to instruct the AI to revise its work based on feedback.",
    content_generation_user: "The template for the user's request. This is where you define how to ask the AI to generate content for a leaf node, using context from the document.",
    branch_content_generation_user: "The template for the user's request to generate content for a non-leaf (branch) node. This should ask for a summary or outline.",
    rater: "The system prompt for the 'Rater' AI, which scores the generated content against a single criterion.",
    editor: "The system prompt for the 'Editor' AI, which provides feedback to the 'Creator' AI based on all ratings.",
    summarize_system: "The system prompt for summarizing generated content. The content will be inserted where the {{content}} placeholder is.",
    expand_list_user: "The prompt for the 'Expand' action. It asks the AI to generate a bulleted list of titles for child nodes, which is then run through the quality loop.",
    create_children_from_outline_user: "Reads a node's free-form text content and asks an LLM to generate a structured, bulleted list of child titles.",
    prompt_for_child_generation_prompt: "Used after 'Expand'. For each new child title, this prompt generates a good default generation prompt for that child."
};

export class PromptManager {
    private prompts: OrchestratorPrompts;
    private onSave: (prompts: OrchestratorPrompts) => void;
    private root: HTMLElement;
    private settingsManager: SettingsManager;

    constructor(
        root: HTMLElement, 
        onSave: (prompts: OrchestratorPrompts) => void,
        settingsManager: SettingsManager
    ) {
        this.root = root;
        this.onSave = onSave;
        this.settingsManager = settingsManager;
        this.prompts = this.settingsManager.getPrompts();
        this.render();
    }

    private saveToStorage() {
        this.settingsManager.savePrompts(this.prompts);
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
                .prompt-description { font-size: 0.9rem; margin-bottom: 0.75rem; color: #333; }
            </style>
            <h2>Configure Prompts</h2>
            <p>Edit the templates used by the LLM agents.</p>
        `;

        Object.keys(this.prompts).forEach(key => {
            const k = key as keyof OrchestratorPrompts;
            const editorDiv = document.createElement('div');
            editorDiv.className = 'prompt-editor';
            
            const label = document.createElement('label');
            label.textContent = `${k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Prompt Template`;

            editorDiv.appendChild(label);

            const description = promptDescriptions[k];
            if (description) {
                const descriptionEl = document.createElement('p');
                descriptionEl.className = 'prompt-description';
                descriptionEl.textContent = description;
                editorDiv.appendChild(descriptionEl);
            }

            const availablePlaceholders = placeholders[k];
            if (availablePlaceholders && availablePlaceholders.length > 0) {
                const placeholderText = document.createElement('div');
                placeholderText.className = 'placeholders';
                placeholderText.innerHTML = `Available placeholders: ${availablePlaceholders.map(p => `<code>{{${p}}}</code>`).join(', ')}`;
                editorDiv.appendChild(placeholderText);
            }
            
            const textarea = document.createElement('textarea');
            textarea.value = this.prompts[k];
            textarea.addEventListener('input', () => {
                this.prompts[k] = textarea.value;
            });

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