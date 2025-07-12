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
    
    // For AI project generation
    ai_project_generation: string;
    
    // For text import analysis
    text_import_analysis: string;
    
    // For coherence analysis
    coherence_analysis: string;
    
    // For context analysis
    context_analysis: string;
    
    // For fixing contradictions
    fix_contradiction: string;
    
    // For text polishing
    text_polishing: string;
    
    // For batch updates
    batch_update: string;
    
    // For context transformation
    context_transformation: string;
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
            Generate content in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            Your task is to respond to the following user prompt: "{{prompt}}"

            Your response will be rated by a just and unforgiving rater on the following criteria:
            - {{criteria}}

            Please generate a high-quality response that addresses these criteria.
        `.trim(),
        placeholders: ['prompt', 'criteria', 'language'],
        description: "The main system prompt for the iterative generation loop. It defines the AI's task and is combined with the 'User' prompt below to start the process."
    },

    content_generation_iterative: {
        text: `
            Generate content in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            The user's original prompt was: "{{prompt}}".
            Your last response was: "{{lastResponse}}".
            It received feedback and the editor provided the following advice to improve it: "{{editorAdvice}}".

            Please generate a new response, incorporating the editor's advice. Remember, your response will be rated by a just and unforgiving rater on these criteria:
            - {{criteria}}
        `.trim(),
        placeholders: ['prompt', 'lastResponse', 'editorAdvice', 'criteria', 'language'],
        description: "The system prompt for subsequent iterations in the loop. It's used to instruct the AI to revise its work based on feedback."
    },

    rater: {
        text: `
            Write your 'justification' field in {{language}}. All JSON field names must always remain in English.
            
            You are a just and unforgiving rating agent. Your response MUST be a single, valid JSON array and nothing else. Do not include any text before or after the JSON.

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
        placeholders: ['originalPrompt', 'response', 'criteria', 'language'],
        description: "The system prompt for the 'Rater' AI. It scores the generated content against ALL provided criteria in a single call."
    },

    editor: {
        text: `
            Provide advice in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            A response was generated: "{{response}}"
            It was rated against several criteria:
            {{ratings}}

            Please provide concise, actionable advice for the Creator LLM on how to improve the response to better meet the rating goals.
            Focus on what needs to change.
        `.trim(),
        placeholders: ['response', 'ratings', 'language'],
        description: "The system prompt for the 'Editor' AI, which provides feedback to the 'Creator' AI based on all ratings."
    },

    summarize_system: {
        text: `
            Generate summary in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are an expert at summarizing text for use as future context. Create a concise, factual summary of the following text, capturing the key points, main ideas, and any critical details.

            ---
            
            {{content}}
        `.trim(),
        placeholders: ['content', 'language'],
        description: "The system prompt for summarizing generated content. The content will be inserted where the {{content}} placeholder is."
    },

    expand_list_user: {
        text: `
            Generate titles in {{language}}. Any structural elements (such as bullet points) must always remain in English.
            
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
        placeholders: ['path', 'context', 'child_level_name', 'count', 'parent_content', 'content', 'language'],
        description: "The prompt for the 'Expand' action. It asks the AI to generate a bulleted list of titles for child nodes, which is then run through the quality loop."
    },

    content_generation_user: {
        text: `
            Generate content in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are writing the content for the node at the following path: "{{path}}".

            Here is the context of the story so far:
            ---
            {{context}}
            ---

            {{draftorfresh}}

            IMPORTANT: Your response should contain ONLY the requested content text, nothing more. Do not include any introductory remarks, explanations, meta-commentary, additional formatting, or section headers. Just provide the pure content that belongs in this section.
        `.trim(),
        placeholders: ['path', 'context', 'content', 'draftorfresh', 'language'],
        description: "The template for the user's request. This is where you define how to ask the AI to generate content for a leaf node, using context from the document. Intelligently handles existing draft content."
    },

    branch_content_generation_user: {
        text: `
            Generate outline in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are an expert at outlining and structuring documents. You are working on a node at the path "{{path}}".
            This is a "branch" node, meaning it will be expanded into child nodes later. Your task is to generate the content for this branch node.

            This content should be a detailed prose outline or comprehensive summary that thoroughly describes what will logically follow. Include rich details about key points, characters, plot developments, themes, and specific elements that will help create meaningful child nodes. Be descriptive and specific rather than brief - this detailed content will be used to generate well-defined titles and content for the child nodes later. Do NOT use bullet points, markdown formatting, or section headers.

            Here is the context of the document so far:
            ---
            {{context}}
            ---

            {{draftorfresh}}

            IMPORTANT: Your response should contain ONLY the requested outline content, nothing more. Do not include any introductory remarks, explanations, meta-commentary, additional formatting, or section headers. Just provide the pure outline text that belongs in this section.
        `.trim(),
        placeholders: ['path', 'context', 'child_level_name', 'count', 'content', 'draftorfresh', 'language'],
        description: "The template for the user's request to generate content for a non-leaf (branch) node. This should ask for a summary or outline."
    },

    create_children_from_outline_user: {
        text: `
            Write "title" and "description" fields in {{language}}. All JSON field names must always remain in English.
            
            You are an expert at structuring documents. The following text is a free-form outline for a section of a document. Your task is to read this outline and create '{{child_level_name}}' nodes that should be created from it.

            Create {{generate_count}} - analyze the outline content and break it down into logical subsections. Each subsection should:
            - Have a clear, descriptive title
            - Cover a distinct aspect or topic from the outline
            - Flow naturally from the overall structure
            - Be substantial enough to warrant its own section

            IMPORTANT: Your response must be a valid JSON array where each entry is an object with exactly two properties:
            - "title": the title of the subnode
            - "description": Complete description of what should be covered in this subnode

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
        placeholders: ['outline_content', 'child_level_name', 'context', 'content', 'count', 'generate_count', 'language'],
        description: "Reads a node's free-form text content and asks an LLM to generate a structured JSON array of child titles with brief content descriptions."
    },

    context_extraction_user: {
        text: `
            Generate extracted information in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are an expert at analyzing text and extracting specific information. Your task is to analyze the following content and extract information about: {{extraction_request}}

Please provide a clear, organized list or summary of the requested information. Be thorough but concise, and focus only on the specific type of information requested.

Content to analyze from "{{node_title}}":
---
{{content}}
---

Please extract and list all instances of: {{extraction_request}}

Format your response as a clear, organized summary that would be useful for reference.`,
        placeholders: ['extraction_request', 'node_title', 'content', 'language'],
        description: "Analyzes node content to extract specific types of information (characters, places, themes, etc.) for reference and organization."
    },

    expand_text_user: {
        text: `
            Generate expanded text in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are an expert at expanding and developing written content. Take the following text and create a more detailed, comprehensive version while maintaining the original meaning and tone.

Original text:
---
{{content}}
---

Please expand this text to make it more detailed and complete. Focus on adding depth, examples, and clarity while preserving the core message and writing style.
        `.trim(),
        placeholders: ['content', 'path', 'context', 'title', 'language'],
        description: "Simple prompt for expanding any text with more detail and depth while preserving its structure. Can be used for project roots or any text that needs fleshing out."
    },

    child_node_suggestions: {
        text: `
            Write "title" and "draft" fields in {{language}}. All JSON field names must always remain in English.
            
            You are helping expand a document by creating alternative approaches for the next child section.

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

Return as JSON array with "title" and "draft" properties.
        `.trim(),
        placeholders: ['parent_title', 'parent_content', 'context', 'language'],
        description: "Creates alternative suggestions for the next child section with different approaches or themes."
    },

    parent_content_update: {
        text: `
            Generate updated content in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            A new child node titled "{{child_title}}" is being added to this parent node.
            
Current parent content:
---
{{parent_content}}
---

Document context:
---
{{context}}
---

IMPORTANT: Keep the existing content exactly as it is. Do NOT enhance, improve, or rewrite any of the original content. Your job is to continue the content by adding a reference to the new child section.

Add about a paragraph of content to the parent content to naturally reference the new child section "{{child_title}}". Make it flow naturally from the existing content.

Only modify existing content if it's absolutely essential to create a smooth connection to the new child section. Otherwise, preserve the original content verbatim and simply append the reference.

Return the complete content with your addition.
        `.trim(),
        placeholders: ['child_title', 'parent_content', 'context', 'language'],
        description: "Updates parent content to reference a newly added child section with minimal changes."
    },

    node_chat_system: {
        text: `
            Respond in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are an AI assistant helping a user work with their document structure. You have access to the following node data from their project:

{{node_data}}

The user can ask you questions about this content, request edits, analysis, or suggestions for improvement. You should:

1. Reference specific parts of the node hierarchy when relevant
2. Provide helpful suggestions for content development
3. Offer to help with editing, expansion, or restructuring
4. Answer questions about the content structure and relationships
5. Suggest improvements to writing quality, clarity, or organization

You have full context about the document structure and content. Be helpful, specific, and actionable in your responses.
        `.trim(),
        placeholders: ['node_data', 'language'],
        description: "System prompt for the chat interface when chatting about specific nodes."
    },

    roleplay_adventure_system: {
        text: `
            Generate adventure and narrative output in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are a skilled text adventure game master. You will create an immersive interactive experience where the user becomes a character in a living world.

Here is the world and character information:
{{node_data}}

The adventure will start in this specific location/scene: "{{starting_node}}"

FIRST, analyze this world to identify all available characters that the user could become, with special focus on characters who would logically be present in or connected to the starting location "{{starting_node}}". Look for:
- Named characters with distinct personalities, backgrounds, or roles
- Characters with different abilities, knowledge, or social positions
- Characters in different locations or situations, especially those relevant to the starting scene
- Characters with various goals, relationships, or conflicts

Present the user with a numbered list of available characters, including:
- Character name
- Brief description of who they are and their current situation
- What makes them interesting to inhabit
- How they relate to or could be present in the starting location

Ask the user to choose which character they want to become by entering the number.

AFTER the user selects a character, you become the world around them. Never refer to "scenes", "story", "narrative", or "content" - you are describing reality as their character experiences it.

Immediately place them in the starting location "{{starting_node}}" as their chosen character:
1. Describe where they are and what they can see, hear, smell, and feel in this specific location
2. Explain what they know and remember as this character about this place
3. Describe their current thoughts, feelings, and immediate concerns in this situation
4. Present their immediate environment and any people or objects nearby in this location

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

Remember: This is not multiple choice. The user types what their character does or says, and you describe what happens as a result. You do not present options, just ask what the user wants to do.`.trim(),
        placeholders: ['node_data', 'starting_node', 'language'],
        description: "Creates an immersive roleplaying adventure where the user can play as characters from the story content. Analyzes the context to present character choices and facilitates free-form roleplay, starting from a specific chosen location/scene."
    },

    ai_project_generation: {
        text: `
            Generate project structure and content in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are an expert project planner and creative writing consultant. Based on the user's description, create a comprehensive project structure.

USER DESCRIPTION:
{{description}}

QUALITY CRITERIA:
The project structure you create will be evaluated against these quality criteria:
{{criteria}}

Please keep these criteria in mind when generating the project structure to ensure high-quality, well-designed projects.

YOUR TASK:
Generate a complete project structure based on the user's description. You must format your response using exactly these sections in this exact order:

Section: Title
Section: Template
Section: Context
Section: Concept

TEMPLATE RULES:
- The ROOT LEVEL (first level) may NEVER have a number - there can only be one root
- Layer names WITHOUT numbers = flexible count: "Chapter" means any number of chapters
- Layer names WITH numbers = fixed count: "Chapter 5" means exactly 5 chapters
- Examples:
  * Story|Chapter|Scene = flexible chapters, any number allowed
  * Story|Chapter 8|Scene = exactly 8 chapters, no more, no less
  * Play|Act 3|Scene = exactly 3 acts
- Use pipe (|) to separate hierarchy levels in the template
- Only use fixed numbers when specifically requested by the user or structurally important
- Keep hierarchy levels to 3-4 levels max for usability

CONTEXT GUIDELINES:
- Include information that helps maintain project consistency
- Format as separate paragraphs where each paragraph is a distinct context item
- Use double newlines to separate each context item (paragraph breaks)
- For narratives: must include SPECIFIC character details (names, ages, personalities, backgrounds, motivations, relationships), world-building, themes, style guide
- For business: may include target market, financial considerations, strategy, style guide
- For research: may include methodology, variables, ethical considerations, style guide
- Always include a style guide appropriate to the project type
- Each category should be its own paragraph (context item) when applicable
- Only include what's actually relevant to the specific project
- Be comprehensive but focused - aim for actionable information

CHARACTER REQUIREMENTS (for narratives):
- Characters must be SPECIFIC and DETAILED, not generic
- BAD: "A young man", "The protagonist", "An elderly woman"
- GOOD: "Marcus Wilde, 28, introverted software engineer with social anxiety who dreams of becoming a chef"
- Include: full names, specific ages, detailed personalities, backstories, motivations, relationships to other characters
- Each character should be unique and well-defined to maintain consistency throughout the project

TEMPLATE EXAMPLES:

2-LAYER TEMPLATES (simple projects):
BLOG: Blog|Post
CHECKLIST: Guide|Item
FAQ: FAQ|Question

3-LAYER TEMPLATES (medium complexity):
NOVEL: Book|Chapter|Scene
BUSINESS PLAN: Plan|Section|Topic
COURSE: Course|Module|Lesson
COOKBOOK: Cookbook|Category|Recipe

4-LAYER TEMPLATES (complex projects):
SCREENPLAY: Script|Act|Scene|Beat
RESEARCH STUDY: Study|Phase|Topic|Subtopic
GAME DESIGN: Game|Chapter|Level|Challenge
TECHNICAL DOCS: Documentation|Section|Feature|Implementation

FIXED NUMBER EXAMPLES:
Story|Act 3|Scene = exactly 3 acts
Course|Module 8|Lesson = exactly 8 modules
Novel|Part 4|Chapter|Scene = exactly 4 parts

CONCEPT APPROACH:
- The concept should be a guideline for the construction of an outline, not the outline itself
- Avoid numbered lists, structured sections, or detailed breakdowns
- Focus on the flow of events and details

RESPONSE FORMAT:
You must structure your response with exactly these four sections in this order:

Section: Title
[Write a compelling project title here]

Section: Template
Template Name: [Name of your template]
Hierarchy: [Level1|Level2|Level3] (use pipe separators)
Scaffolding: [Doc1, Doc2, Doc3] (comma-separated list of helpful documents)

Section: Context
[All relevant contextual information including characters (for narratives), style guides, themes, methodology, etc., formatted as separate paragraphs where each paragraph is a distinct context item separated by double newlines]

Section: Concept
[A Concept - NOT an outline. Write what happens in what order. Structuring that is a later step.]

CRITICAL: Use exactly the section headers shown above. Do not add extra text before or after the sections.`.trim(),
        placeholders: ['description', 'criteria', 'language'],
        description: "System prompt for AI-powered project generation. Creates comprehensive project structures from natural language descriptions, including templates, content outlines, and contextual information."
    },

    text_import_analysis: {
        text: `
            Generate analysis and summaries in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are an expert project analyst. Analyze the provided text content and extract a project structure from it.

ORIGINAL TEXT FILE: {{file_name}}

TEXT CONTENT:
{{text_content}}

YOUR TASK:
Analyze the text and extract a project structure. The text is bound content that should be preserved and worked with, not a creative prompt. You must format your response using exactly these sections in this exact order:

Section: Title
Section: Template  
Section: Context
Section: Concept

ANALYSIS GUIDELINES:
- Extract a meaningful title that reflects the actual content
- Determine an appropriate template structure based on the text's organization
- Context should be tightly bound to the actual text content (not creative additions)
- Concept should be a concise version of the text content itself (not a creative interpretation)

TEMPLATE RULES:
- The ROOT LEVEL (first level) may NEVER have a number - there can only be one root
- Layer names WITHOUT numbers = flexible count: "Chapter" means any number of chapters
- Layer names WITH numbers = fixed count: "Chapter 5" means exactly 5 chapters
- Use pipe (|) to separate hierarchy levels in the template
- Keep hierarchy levels to 3-5 levels max for usability
- Include a Scene layer to break up chapters into scenes

CONTEXT REQUIREMENTS:
- Must be specific to the actual text content provided
- Format as separate paragraphs where each paragraph is a distinct context item
- Use double newlines to separate each context item (paragraph breaks)
- Include key themes, concepts, or elements that appear in the text
- For narratives: extract comprehensive story context including:
  * CHARACTERS: Full names, ages, personalities, backgrounds, motivations, relationships, speech patterns, and distinctive traits
  * ORGANIZATIONS: Groups, factions, institutions with their goals, structure, and characteristics
  * WORLD DESCRIPTION: Setting details, geography, culture, technology level, social structures
  * HISTORICAL EVENTS: Past events mentioned that shape the current story
  * STYLE GUIDE: Narrative voice, tone, writing style, dialogue patterns
  * THEMES: Central themes and concepts explored in the text
- For technical content: include methodologies, frameworks, or concepts mentioned
- For business content: include strategies, markets, or approaches described
- Each category should be its own paragraph (context item) when applicable
- DO NOT add creative elements not present in the original text

RESPONSE FORMAT:
You must structure your response with exactly these four sections in this order:

Section: Title
[Extract or derive a title from the content]

Section: Template
Template Name: [Name based on content type]
Hierarchy: [Level1|Level2|Level3] (use pipe separators)
Scaffolding: [Doc1, Doc2, Doc3] (comma-separated list of helpful documents)

Section: Context
[Specific contextual information derived from the actual text content, formatted as separate paragraphs where each paragraph is a distinct context item separated by double newlines]

Section: Concept
[Concise outline of the actual text content - not creative expansion. Chronological extensive summary included.]

CRITICAL: Use exactly the section headers shown above. Base everything on the actual text content provided, not creative interpretations.`.trim(),
        placeholders: ['file_name', 'text_content', 'language'],
        description: "System prompt for analyzing text files and extracting project structure. Creates project templates and context from existing text content rather than generating new creative content."
    },

    coherence_analysis: {
        text: `
            Write your "justification" field in {{language}}. All JSON field names must always remain in English.
            
            You are analyzing the coherence between an outline and its expanded content.

Your goal is to be very critical. If in doubt, report the contradiction. Better too many contradictions than too few.

PARENT OUTLINE:
{{parent_content}}

PARENT CONTEXT (background information):
{{parent_context}}

EXPANDED CONTENT (from child sections):
{{children_content}}

TASK: Identify contradictions between the outline and the expanded content.

IMPORTANT INSTRUCTIONS:
- Focus on factual contradictions, not minor style differences
- Look for conflicts in: facts, dates, names, events, causation, logic, timelines
- Use the parent context to better understand the intended meaning
- Rate each contradiction's severity based on how much it undermines the content's coherence

SEVERITY SCALE:
- 1-3: Minor inconsistencies that don't affect overall meaning
- 4-6: Moderate contradictions that create confusion
- 7-9: Major contradictions that significantly undermine coherence
- 10: Critical contradictions that completely invalidate the content

RESPONSE FORMAT:
Return a JSON array where each contradiction has exactly these fields:
- "fact_in_outline": The specific fact or claim from the outline
- "fact_in_expansion": The contradictory fact or claim from the expanded content  
- "justification": Brief explanation of why this is a contradiction
- "offending_child_title": Title of the child node that contains the contradictory content
- "severity": A number from 1-10 based on how severely this contradiction undermines coherence

If no contradictions found, return an empty array: []

EXAMPLE:
[
  {
    "fact_in_outline": "The meeting was scheduled for Tuesday",
    "fact_in_expansion": "The meeting occurred on Wednesday morning",
    "justification": "Timeline contradiction - different days specified for the same event",
    "offending_child_title": "Meeting Summary",
    "severity": 7
  }
]

JSON Response:`.trim(),
        placeholders: ['parent_content', 'parent_context', 'children_content', 'language'],
        description: "System prompt for analyzing coherence between parent node outlines and expanded child content. Identifies factual contradictions with severity ratings and returns them in structured JSON format."
    },

    context_analysis: {
        text: `
            Write your "justification" field in {{language}}. All JSON field names must always remain in English.
            
            You are analyzing inherited context for potential issues when creating subnodes.

**Current Node:**
Title: {{node_title}}
Content: {{node_content}}

**Numbered Context Items:**
{{numbered_context_items}}

**Your Task:**
Analyze the numbered context items and identify those that might be problematic for creating subnodes of the current node. Look for:

1. **Temporal references** that refer to earlier or later states of the document
2. **Scope mismatches** where context items are too broad or too narrow for subnodes
3. **Contradictory information** that conflicts with the current node's content
4. **Outdated assumptions** that no longer apply to this part of the document
5. **Overly specific details** that would be confusing for subnode creation

**RESPONSE FORMAT - CRITICAL:**
Your response MUST be a valid JSON array and NOTHING ELSE. Do not include any explanatory text before or after the JSON.

Each issue object MUST have these EXACT field names (no variations, abbreviations, or typos):
- item_number: The number of the problematic context item (from the numbered list above)
- problematic_context_item: The specific text from the context item that's problematic
- reason_for_problem: Why this context item would be bad for subnode creation
- justification: Detailed explanation of the problem and why it needs fixing
- severity: A number from 1-10 (where 10 is most severe) based on how much this would confuse subnode creation

**EXAMPLES:**

Example 1 (issues found):
[
  {
    "item_number": 3,
    "problematic_context_item": "This document is in the early planning phase",
    "reason_for_problem": "Temporal reference that may not apply to current section",
    "justification": "This temporal reference assumes the document is still in planning, but the current section is about implementation details, making this context misleading for subnode creation",
    "severity": 7
  },
  {
    "item_number": 5,
    "problematic_context_item": "Sarah will handle the marketing campaign next month",
    "reason_for_problem": "Overly specific detail that doesn't apply to current content",
    "justification": "This specific task assignment is unrelated to the current node's focus on technical architecture, making it confusing context for technical subnodes",
    "severity": 4
  }
]

Example 2 (no issues found):
[]

**CRITICAL INSTRUCTIONS:**
- Use ONLY the exact field names shown above
- Your response must be valid JSON that can be parsed by JSON.parse()
- Do not add any text before or after the JSON array
- If no issues are found, return exactly: []
- Test your JSON mentally before responding to ensure it's valid

Your JSON response:`.trim(),
        placeholders: ['node_title', 'node_content', 'numbered_context_items', 'language'],
        description: "System prompt for analyzing inherited context for potential issues when creating subnodes. Identifies problematic context items and suggests improvements."
    },

    fix_contradiction: {
        text: `
            Generate corrected content in {{language}}. Any structural elements (such as section headers) must always remain in English.
            
            You are an expert editor. Your job is to fix a contradiction in text content.

PARENT OUTLINE REFERENCE:
{{parent_content}}

PARENT CONTEXT (for reference):
{{parent_context}}

CHILD NODE: "{{child_title}}"

CURRENT CONTENT:
{{child_content}}

CONTRADICTION TO FIX:
- Parent says: "{{fact_in_outline}}"
- Child says: "{{fact_in_expansion}}"
- Problem: {{justification}}

INSTRUCTIONS:
1. Take the current content above
2. Change only the parts that contradict the parent outline
3. Keep everything else exactly the same
4. Make sure the fixed content flows naturally
5. Return the complete corrected content

EXAMPLE:
If the current content is "The meeting happened on Wednesday and was very productive" but the parent says it was on Tuesday, you would return: "The meeting happened on Tuesday and was very productive"

YOUR RESPONSE:
Provide the complete corrected content for this child node, no abbreviations. The corrected text will REPLACE the original text, so the FULL TEXT MUST BE PRESENT.
This is for an automated workflow, so do not add any additional text or comments or questions.
Corrected text:
        `.trim(),
        placeholders: ['parent_content', 'parent_context', 'child_title', 'child_content', 'fact_in_outline', 'fact_in_expansion', 'justification', 'language'],
        description: "System prompt for fixing contradictions in child node content. Takes the contradiction details and rewrites the child content to resolve the issue while maintaining style and structure."
    },

    text_polishing: {
        text: `
            Your default language is {{language}} if not specified otherwise later in this prompt. Generate polished text. Any structural elements (such as section headers) must always remain in English.
            
            You are an expert text polisher and editor. Your task is to enhance the provided text to {{detail}}.

INSTRUCTIONS:
1. Enhance the text while preserving its core meaning and structure
2. Focus specifically on: {{detail}}
3. Ensure the enhanced text meets all the quality criteria above
4. Maintain the original tone and style unless the enhancement requires changes
5. Return ONLY the enhanced text, no explanations or meta-commentary

Your response will be evaluated against these criteria:
- {{criteria}}

Please provide the full enhanced version of the text, this is for an automated workflow, so no questions or comments please.
Text:
        `.trim(),
        placeholders: ['detail', 'criteria', 'language'],
        description: "System prompt for polishing and enhancing text content. Takes custom polishing instructions and quality criteria to improve writing quality, clarity, style, and other aspects."
    },

    batch_update: {
        text: `
            Your default language is {{language}} if the instruction does not specify otherwise.
            
            Please update the following text based on these instructions: {{instruction}}

Original text:
{{originalText}}

IMPORTANT: Your response should contain ONLY the updated text, nothing more. Do not include any labels, prefixes, explanations, or meta-commentary. Just provide the pure updated content that replaces the original text.
        `.trim(),
        placeholders: ['instruction', 'originalText', 'language'],
        description: "System prompt for batch updating text content. Takes user instructions and applies them to transform individual text strings during batch operations."
    },

    context_transformation: {
        text: `
            Your default language is {{language}} if not specified otherwise.
            
            You are an expert text analyzer. Your task is to transform existing context text into a properly formatted context that follows the paragraph-based context item format.

ORIGINAL CONTEXT:
{{original_context}}

TASK:
Transform the above context into a properly formatted context where each distinct piece of information is separated into its own paragraph (context item).

FORMATTING REQUIREMENTS:
1. Each context item should be a separate paragraph
2. Use double newlines (two line breaks) to separate each context item
3. Group related information logically into coherent paragraphs
4. Each paragraph should contain one main concept or piece of information
5. Preserve all important information from the original context
6. Do not add new information that wasn't in the original context
7. For narratives, organize by categories like: Characters, Setting, Plot Elements, Themes, etc.
8. For technical content, organize by: Concepts, Methods, Tools, Requirements, etc.
9. For business content, organize by: Strategy, Market, Goals, Resources, etc.

EXAMPLE INPUT:
"Marcus is a 28-year-old software engineer who works at TechCorp. He has social anxiety and dreams of becoming a chef. The story takes place in modern-day Seattle. The themes include personal growth and pursuing dreams. The writing style is third-person limited with a focus on internal monologue."

EXAMPLE OUTPUT:
"Marcus is a 28-year-old software engineer who works at TechCorp. He has social anxiety and dreams of becoming a chef.

The story takes place in modern-day Seattle.

The themes include personal growth and pursuing dreams.

The writing style is third-person limited with a focus on internal monologue."

IMPORTANT: Your response should contain ONLY the transformed context text, nothing more. Do not include any labels, prefixes, explanations, or meta-commentary. Just provide the pure transformed context that can be directly used.
        `.trim(),
        placeholders: ['original_context', 'language'],
        description: "System prompt for transforming arbitrary context text into the properly formatted paragraph-based context item format. Preserves all information while organizing it into separate paragraphs."
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

// Simple prompt manager class for specific use cases (like context transformation)
// For the main settings UI, use PromptManagementService instead
export class PromptManager {
    private prompts: OrchestratorPrompts;
    private settingsManager: SettingsManager;

    constructor(
        _root: HTMLElement, 
        _onSave: (prompts: OrchestratorPrompts) => void,
        settingsManager: SettingsManager
    ) {
        this.settingsManager = settingsManager;
        this.prompts = this.settingsManager.getPrompts();
    }

    public getPrompts(): OrchestratorPrompts {
        return this.prompts;
    }
} 