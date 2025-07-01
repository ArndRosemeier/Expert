import { SettingsManager } from './SettingsManager';
import { STORAGE_KEYS } from './constants';

export const PROMPT_STORAGE_KEY = STORAGE_KEYS.PROMPTS;

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

export interface PromptDefinition {
    text: string;
    placeholders: string[];
    description: string;
}

// SINGLE SOURCE OF TRUTH for all prompt definitions
export const defaultPromptDefinitions: Record<keyof OrchestratorPrompts, PromptDefinition> = {
    content_generation_initial: {
        text: `
            Your task is to respond to the following user prompt: "{{prompt}}"

            Your response will be rated by a just and unforegiving rater on the following criteria:
            - {{criteria}}

            Please generate a high-quality response that addresses these criteria.
        `.trim(),
        placeholders: ['prompt', 'criteria'],
        description: "The main system prompt for the iterative generation loop. It defines the AI's task and is combined with the 'User' prompt below to start the process."
    },

    content_generation_iterative: {
        text: `
            The user's original prompt was: "{{prompt}}".
            Your last response was: "{{lastResponse}}".
            It received feedback and the editor provided the following advice to improve it: "{{editorAdvice}}".

            Please generate a new response, incorporating the editor's advice. Remember, your response will be rated by a just and unforegiving rater on these criteria:
            - {{criteria}}
        `.trim(),
        placeholders: ['prompt', 'lastResponse', 'editorAdvice', 'criteria'],
        description: "The system prompt for subsequent iterations in the loop. It's used to instruct the AI to revise its work based on feedback."
    },

    rater: {
        text: `
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
        placeholders: ['originalPrompt', 'response', 'criteria'],
        description: "The system prompt for the 'Rater' AI. It scores the generated content against ALL provided criteria in a single call."
    },

    editor: {
        text: `
            A response was generated: "{{response}}"
            It was rated against several criteria:
            {{ratings}}

            Please provide concise, actionable advice for the Creator LLM on how to improve the response to better meet the rating goals.
            Focus on what needs to change.
        `.trim(),
        placeholders: ['response', 'ratings'],
        description: "The system prompt for the 'Editor' AI, which provides feedback to the 'Creator' AI based on all ratings."
    },

    summarize_system: {
        text: `
            You are an expert at summarizing text for use as future context. Create a concise, factual summary of the following text, capturing the key points, main ideas, and any critical details.

            ---
            
            {{content}}
        `.trim(),
        placeholders: ['content'],
        description: "The system prompt for summarizing generated content. The content will be inserted where the {{content}} placeholder is."
    },

    expand_list_user: {
        text: `
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
        placeholders: ['path', 'context', 'child_level_name', 'count', 'parent_content', 'content'],
        description: "The prompt for the 'Expand' action. It asks the AI to generate a bulleted list of titles for child nodes, which is then run through the quality loop."
    },

    content_generation_user: {
        text: `
            You are writing the content for the node at the following path: "{{path}}".
            The title of this node is "{{title}}".

            Here is the context of the story so far:
            ---
            {{context}}
            ---

            {{draftorfresh}}

            IMPORTANT: Your response should contain ONLY the requested content text, nothing more. Do not include any introductory remarks, explanations, meta-commentary, or additional formatting. Just provide the pure content that belongs in this section.
        `.trim(),
        placeholders: ['path', 'context', 'title', 'content', 'draftorfresh'],
        description: "The template for the user's request. This is where you define how to ask the AI to generate content for a leaf node, using context from the document. Intelligently handles existing draft content."
    },

    branch_content_generation_user: {
        text: `
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
        placeholders: ['path', 'context', 'title', 'child_level_name', 'count', 'content', 'draftorfresh'],
        description: "The template for the user's request to generate content for a non-leaf (branch) node. This should ask for a summary or outline."
    },

    create_children_from_outline_user: {
        text: `
            You are an expert at structuring documents. The following text is a free-form outline for a section of a document. Your task is to read this outline and create '{{child_level_name}}' nodes that should be created from it.

            Create {{generate_count}} - analyze the outline content and break it down into logical subsections. Each subsection should:
            - Have a clear, descriptive title
            - Cover a distinct aspect or topic from the outline
            - Flow naturally from the overall structure
            - Be substantial enough to warrant its own section

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
        placeholders: ['outline_content', 'child_level_name', 'context', 'content', 'count', 'generate_count'],
        description: "Reads a node's free-form text content and asks an LLM to generate a structured JSON array of child titles with brief content descriptions."
    },

    prompt_for_child_generation_prompt: {
        text: `You are an expert at creating generative prompts for a hierarchical document. The user is expanding a parent node. A new child node with the title "{{child_title}}" has just been created.

The parent node's content is:
---
{{parent_content}}
---

The broader context of the document is:
---
{{context}}
---

Based on all of this information, please write a detailed, one-paragraph prompt that can be used to generate the full text content for the new child node titled "{{child_title}}". The prompt should be self-contained and guide an AI to write content that logically follows the parent, fits within the document's context, and fulfills the promise of its title. Do not just repeat the title; create a rich instruction.`,
        placeholders: ['parent_content', 'context', 'child_title', 'content'],
        description: "Used after 'Expand'. For each new child title, this prompt generates a good default generation prompt for that child."
    },

    context_extraction_user: {
        text: `You are an expert at analyzing text and extracting specific information. Your task is to analyze the following content and extract information about: {{extraction_request}}

Please provide a clear, organized list or summary of the requested information. Be thorough but concise, and focus only on the specific type of information requested.

Content to analyze from "{{node_title}}":
---
{{content}}
---

Please extract and list all instances of: {{extraction_request}}

Format your response as a clear, organized summary that would be useful for reference.`,
        placeholders: ['extraction_request', 'node_title', 'content'],
        description: "Analyzes node content to extract specific types of information (characters, places, themes, etc.) for reference and organization."
    },

    expand_text_user: {
        text: `You are an expert at expanding and developing written content. Take the following text and create a more detailed, comprehensive version while maintaining the original meaning and tone.

Original text:
---
{{content}}
---

Please expand this text to make it more detailed and complete. Focus on adding depth, examples, and clarity while preserving the core message and writing style.`,
        placeholders: ['content', 'path', 'context', 'title'],
        description: "Simple prompt for expanding any text with more detail and depth while preserving its structure. Can be used for project roots or any text that needs fleshing out."
    },

    child_node_suggestions: {
        text: `You are helping expand a document by creating alternative approaches for the next child section.

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
        placeholders: ['parent_title', 'parent_content', 'context'],
        description: "Creates alternative suggestions for the next child section with different approaches or themes."
    },

    parent_content_update: {
        text: `A new child node titled "{{child_title}}" is being added to this parent node.
        
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
        placeholders: ['child_title', 'parent_content', 'context'],
        description: "Updates parent content to reference a newly added child section with minimal changes."
    },

    node_chat_system: {
        text: `You are an AI assistant helping a user work with their document structure. You have access to the following node data from their project:

{{node_data}}

The user can ask you questions about this content, request edits, analysis, or suggestions for improvement. You should:

1. Reference specific parts of the node hierarchy when relevant
2. Provide helpful suggestions for content development
3. Offer to help with editing, expansion, or restructuring
4. Answer questions about the content structure and relationships
5. Suggest improvements to writing quality, clarity, or organization

You have full context about the document structure and content. Be helpful, specific, and actionable in your responses.`,
        placeholders: ['node_data'],
        description: "System prompt for the chat interface when chatting about specific nodes."
    },

    roleplay_adventure_system: {
        text: `You are a skilled text adventure game master. You will create an immersive interactive experience where the user becomes a character in a living world.

Here is the world and character information:
{{node_data}}

FIRST, analyze this world to identify all available characters that the user could become. Look for:
- Named characters with distinct personalities, backgrounds, or roles
- Characters with different abilities, knowledge, or social positions
- Characters in different locations or situations
- Characters with various goals, relationships, or conflicts

Present the user with a numbered list of available characters, including:
- Character name
- Brief description of who they are and their current situation
- What makes them interesting to inhabit

Ask the user to choose which character they want to become by entering the number.

AFTER the user selects a character, you become the world around them. Never refer to "scenes", "story", "narrative", or "content" - you are describing reality as their character experiences it.

Immediately place them in their character's current situation:
1. Describe where they are and what they can see, hear, smell, and feel
2. Explain what they know and remember as this character
3. Describe their current thoughts, feelings, and immediate concerns
4. Present their immediate environment and any people or objects nearby

From then on, you are the world responding to their actions. When they act or speak:
- Describe the immediate consequences of their actions
- Have other characters react and respond naturally
- Describe changes in the environment
- Present new choices and opportunities based on what happens

The user controls only their character's actions and words. You control everything else - other people, the environment, consequences, and the flow of events.

This is completely free-form. The user can:
- Say anything as their character
- Attempt any action their character could try  
- Explore and investigate their surroundings
- Interact with other characters however they choose
- Make decisions that affect what happens next

Never break character or refer to this as a game, story, or roleplay. You are simply describing what happens in this world as the user lives as their chosen character.

Remember: This is not multiple choice. The user types what their character does or says, and you describe what happens as a result.`,
        placeholders: ['node_data'],
        description: "Creates an immersive roleplaying adventure where the user can play as characters from the story content. Analyzes the context to present character choices and facilitates free-form roleplay."
    }
};

// Derived objects for backward compatibility
export const defaultPrompts: OrchestratorPrompts = {} as OrchestratorPrompts;
Object.keys(defaultPromptDefinitions).forEach(key => {
    const promptKey = key as keyof OrchestratorPrompts;
    defaultPrompts[promptKey] = defaultPromptDefinitions[promptKey].text;
});

// Helper functions for accessing metadata
export function getPromptPlaceholders(promptKey: keyof OrchestratorPrompts): string[] {
    return defaultPromptDefinitions[promptKey]?.placeholders || [];
}

export function getPromptDescription(promptKey: keyof OrchestratorPrompts): string {
    return defaultPromptDefinitions[promptKey]?.description || '';
}

export function getPromptText(promptKey: keyof OrchestratorPrompts): string {
    return defaultPromptDefinitions[promptKey]?.text || '';
}

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

            const description = getPromptDescription(k);
            if (description) {
                const descriptionEl = document.createElement('p');
                descriptionEl.className = 'prompt-description';
                descriptionEl.textContent = description;
                editorDiv.appendChild(descriptionEl);
            }

            const availablePlaceholders = getPromptPlaceholders(k);
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