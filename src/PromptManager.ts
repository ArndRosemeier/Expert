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
    

    
    // For context extraction
    context_extraction_user: string;
    
    // For text expansion (generic)
    expand_text_user: string;
    
    // For child node suggestions
    child_node_suggestions: string;
    
    // For parent content updates
    parent_content_update: string;
    
    // For node chat system prompt
    node_chat_system: string;
    
    // For roleplaying adventure mode
    roleplay_adventure_system: string;
}

export const defaultPrompts: OrchestratorPrompts = {
    content_generation_initial: `
        Your task is to respond to the following user prompt: "{{prompt}}"

        Your response will be rated by a just and unforegiving rater on the following criteria:
        - {{criteria}}

        Please generate a high-quality response that addresses these criteria.
    `.trim(),
    content_generation_iterative: `
        The user's original prompt was: "{{prompt}}".
        Your last response was: "{{lastResponse}}".
        It received feedback and the editor provided the following advice to improve it: "{{editorAdvice}}".

        Please generate a new response, incorporating the editor's advice. Remember, your response will be rated by a just and unforegiving rater on these criteria:
        - {{criteria}}
    `.trim(),
    rater: `
        You are a just and unforegiving rating agent. Your response MUST be a single, valid JSON array and nothing else. Do not include any text before or after the JSON.

        The user's original prompt was: "{{originalPrompt}}".
        
        Here is a response generated for that prompt:
        ---
        {{response}}
        ---
        
        Please rate this response objectively against all of the following criteria. Use your best judgment to assess the quality on a scale of 1-10.
        Do not aim to please, be just!
        
        Criteria to evaluate:
        - {{criteria}}
        
        Provide your response as a JSON array of objects. Each object must have three keys:
        - "criterion": The exact name of the criterion being rated (use the full original name).
        - "score": A number from 1 to 10 based on your objective assessment.
        - "justification": A brief explanation for your score, written in the tone of a critique.

        Example:
        [
            { "criterion": "Clarity & Conciseness", "score": 8, "justification": "The response is clear and well-structured." },
            { "criterion": "Engaging Flow", "score": 7, "justification": "The text is interesting but could have smoother transitions." }
        ]
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

        {{draftorfresh}}

        IMPORTANT: Your response should contain ONLY the requested content text, nothing more. Do not include any introductory remarks, explanations, meta-commentary, or additional formatting. Just provide the pure content that belongs in this section.
    `.trim(),
    branch_content_generation_user: `
        You are an expert at outlining and structuring documents. You are working on a node at the path "{{path}}" with the title "{{title}}".
        This is a "branch" node, meaning it will be expanded into child nodes later. Your task is to generate the content for this branch node.

        This content should be a detailed prose outline or comprehensive summary that thoroughly describes what will logically follow. Include rich details about key points, characters, plot developments, themes, and specific elements that will help create meaningful child nodes. Be descriptive and specific rather than brief - this detailed content will be used to generate well-defined titles and content for the child nodes later. Do NOT use bullet points or markdown formatting.

        Here is the context of the document so far:
        ---
        {{context}}
        ---

        {{draftorfresh}}

        IMPORTANT: Your response should contain ONLY the requested outline content, nothing more. Do not include any introductory remarks, explanations, meta-commentary, or additional formatting. Just provide the pure outline text that belongs in this section.
    `.trim(),
    create_children_from_outline_user: `
        You are an expert at structuring documents. The following text is a free-form outline for a section of a document. Your task is to read this outline and generate exactly {{count}} entries for the '{{child_level_name}}' nodes that should be created from it.

        Generate exactly {{count}} entries - no more, no less. The entries expand the outline, the context is just there to help with this task.

        IMPORTANT: Your response must be a valid JSON array where each entry is an object with exactly two properties:
        - "title": the title of the subnode
        - "description": one sentence brief description of what should be covered in this subnode

        Example format:
        [
          {
            "title": "Introduction to the Topic",
            "description": "Provides an overview and sets the foundation for understanding the main concepts."
          },
          {
            "title": "Core Principles",
            "description": "Explains the fundamental principles and key concepts that underpin the topic."
          }
        ]

        Do not include any other text, explanations, or formatting. Only provide the JSON array.

        Here is the context of the document so far:
        ---
        {{context}}
        ---

        Here is the outline to process:
        {{outline_content}}
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



    context_extraction_user: `You are an expert at analyzing text and extracting specific information. Your task is to analyze the following content and extract information about: {{extraction_request}}

Please provide a clear, organized list or summary of the requested information. Be thorough but concise, and focus only on the specific type of information requested.

Content to analyze from "{{node_title}}":
---
{{content}}
---

Please extract and list all instances of: {{extraction_request}}

Format your response as a clear, organized summary that would be useful for reference.`,

    expand_text_user: `You are an expert at expanding and developing written content. Take the following text and create a more detailed, comprehensive version while maintaining the original meaning and tone.

Original text:
---
{{content}}
---

Please expand this text to make it more detailed and complete. Focus on adding depth, examples, and clarity while preserving the core message and writing style.`,

    child_node_suggestions: `You are helping expand a document by creating alternative approaches for the next child section.

Parent node title: "{{parent_title}}"
Parent node content:
---
{{parent_content}}
---

Document context:
---
{{context}}
---

Generate exactly 5 ALTERNATIVE suggestions for the next child section. These are 5 different approaches, themes, or directions for the single next section that logically follows the parent content.

DO NOT create sequential children (like Chapter 6, Chapter 7, Chapter 8). Instead, create 5 different versions of what the next single child section focuses on.

Each suggestion must have:
- A concise, descriptive title for the next section
- A brief 1-2 sentence draft that states definitively what this approach covers

Write the drafts using confident, definitive language. Avoid tentative phrases like "could", "might", "would", or "may". State directly what the section contains and accomplishes.

Return as JSON array with "title" and "draft" properties.`,

    parent_content_update: `A new child node titled "{{child_title}}" is being added to this parent node.
    
Current parent content:
---
{{parent_content}}
---

Document context:
---
{{context}}
---

IMPORTANT: Keep the existing content exactly as it is. Do NOT enhance, improve, or rewrite any of the original content. Your job is to continue the content by adding a reference to the new child section.

Add only what is absolutely necessary to naturally reference the new child section "{{child_title}}". This might be:
- A brief sentence at the end mentioning the new section
- A simple transition phrase connecting to the new content
- A minimal addition that acknowledges the new child

Only modify existing content if it's absolutely essential to create a smooth connection to the new child section. Otherwise, preserve the original content verbatim and simply append the reference.

Return the complete content with your minimal addition.`,

    node_chat_system: `You are an AI assistant helping a user work with their document structure. You have access to the following node data from their project:

{{node_data}}

The user can ask you questions about this content, request edits, analysis, or suggestions for improvement. You should:

1. Reference specific parts of the node hierarchy when relevant
2. Provide helpful suggestions for content development
3. Offer to help with editing, expansion, or restructuring
4. Answer questions about the content structure and relationships
5. Suggest improvements to writing quality, clarity, or organization

You have full context about the document structure and content. Be helpful, specific, and actionable in your responses.`,

    roleplay_adventure_system: `You are a skilled interactive fiction and roleplaying game master. The user has provided you with story content that contains characters, settings, and narrative elements. Your task is to create an immersive roleplaying adventure based on this content.

Here is the story content and context:
{{node_data}}

FIRST, analyze the content to identify all available characters that the user could potentially roleplay as. Look for:
- Named characters with distinct personalities, backgrounds, or roles
- Characters with speaking parts or significant presence in the narrative
- Both major and minor characters who could offer interesting perspectives
- Characters from different factions, backgrounds, or with different motivations

Present the user with a numbered list of available characters, including:
- Character name
- Brief description of their role/personality
- Why they would be interesting to play

Then ask the user to choose which character they want to roleplay as by entering the number.

AFTER the user selects a character, transform into that character's perspective and:
1. Set the scene from that character's viewpoint based on the current node/context
2. Describe the immediate situation, environment, and any other characters present
3. Explain what the character knows, feels, and is currently thinking
4. Present the current situation as an open-ended scenario where the user can take any action

Make it clear that this is completely free-form - the user can:
- Say anything their character would say
- Attempt any action their character could reasonably try
- Ask questions about the world, other characters, or the situation
- Explore the environment or investigate things
- Make decisions that could change the story direction

Always respond as the game master, narrating consequences of the user's actions, speaking for NPCs, describing environments, and maintaining the story's continuity and tone. Keep the adventure engaging and true to the source material while allowing creative freedom.

Remember: This is not multiple choice. The user can type whatever they want their character to do or say.`,
};

const placeholders: Record<keyof OrchestratorPrompts, string[]> = {
    content_generation_initial: ['prompt', 'criteria'],
    content_generation_iterative: ['prompt', 'lastResponse', 'editorAdvice', 'criteria'],
    rater: ['originalPrompt', 'response', 'criteria'],
    editor: ['response', 'ratings'],
    summarize_system: ['content'],
    expand_list_user: ['path', 'context', 'child_level_name', 'count', 'parent_content', 'content'],
    content_generation_user: ['path', 'context', 'title', 'content', 'draftorfresh'],
    branch_content_generation_user: ['path', 'context', 'title', 'child_level_name', 'count', 'content', 'draftorfresh'],
    create_children_from_outline_user: ['outline_content', 'child_level_name', 'context', 'content', 'count'],
    prompt_for_child_generation_prompt: ['parent_content', 'context', 'child_title', 'content'],

    context_extraction_user: ['extraction_request', 'node_title', 'content'],
    expand_text_user: ['content', 'path', 'context', 'title'],
    child_node_suggestions: ['parent_title', 'parent_content', 'context'],
    parent_content_update: ['child_title', 'parent_content', 'context'],
    node_chat_system: ['node_data'],
    roleplay_adventure_system: ['node_data'],
};

const promptDescriptions: Partial<Record<keyof OrchestratorPrompts, string>> = {
    content_generation_initial: "The main system prompt for the iterative generation loop. It defines the AI's task and is combined with the 'User' prompt below to start the process.",
    content_generation_iterative: "The system prompt for subsequent iterations in the loop. It's used to instruct the AI to revise its work based on feedback.",
    content_generation_user: "The template for the user's request. This is where you define how to ask the AI to generate content for a leaf node, using context from the document. Intelligently handles existing draft content.",
    branch_content_generation_user: "The template for the user's request to generate content for a non-leaf (branch) node. This should ask for a summary or outline.",
    rater: "The system prompt for the 'Rater' AI. It scores the generated content against ALL provided criteria in a single call.",
    editor: "The system prompt for the 'Editor' AI, which provides feedback to the 'Creator' AI based on all ratings.",
    summarize_system: "The system prompt for summarizing generated content. The content will be inserted where the {{content}} placeholder is.",
    expand_list_user: "The prompt for the 'Expand' action. It asks the AI to generate a bulleted list of titles for child nodes, which is then run through the quality loop.",
    create_children_from_outline_user: "Reads a node's free-form text content and asks an LLM to generate a structured JSON array of child titles with brief content descriptions.",
    prompt_for_child_generation_prompt: "Used after 'Expand'. For each new child title, this prompt generates a good default generation prompt for that child.",

    context_extraction_user: "Analyzes node content to extract specific types of information (characters, places, themes, etc.) for reference and organization.",
    expand_text_user: "Simple prompt for expanding any text with more detail and depth while preserving its structure. Can be used for project roots or any text that needs fleshing out.",
    roleplay_adventure_system: "Creates an immersive roleplaying adventure where the user can play as characters from the story content. Analyzes the context to present character choices and facilitates free-form roleplay."
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

    private async saveToStorage() {
        await this.settingsManager.savePrompts(this.prompts);
        this.onSave(this.prompts);
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
        saveButton.addEventListener('click', () => void this.saveToStorage());
        buttonContainer.appendChild(saveButton);
        
        const revertButton = document.createElement('button');
        revertButton.textContent = 'Revert to Default';
        revertButton.addEventListener('click', () => this.revertToDefaults());
        buttonContainer.appendChild(revertButton);

        this.root.appendChild(buttonContainer);
    }
} 