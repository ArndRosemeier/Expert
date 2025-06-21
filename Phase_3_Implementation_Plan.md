# Phase 3: Template-Driven Document Generation

This document outlines the plan for evolving the "Expert" application from a single-prompt tool into a sophisticated, template-driven system for generating structured, long-form documents.

---

## GUI Design Overview

The application will be updated to a two-column layout, with a header bar and a modal for template editing.

**1. Header Bar**
*   A standard header containing the title "Expert" followed by a row of buttons:
    *   `[New Project]`
    *   `[Run Tests]`
    *   `[Settings]`
    *   `[Manage Templates]` (New)

**2. Main Content Area (Two-Column Layout)**

*   **Left Column: Project Tree**
    *   This column displays the document hierarchy as a simple, vertically-indented list. It is not a graphical tree with connector lines.
    *   The selected item in the list will be visually highlighted.
    *   Example of the structure:
        ```
        Novel: Cosmic Odyssey
          Act 1
            ...
          Act 2
            Chapter 3      <-- (Selected)
              Scene 1
              Scene 2
        ```

*   **Right Column: Details View**
    *   This column's content is dynamic and changes based on the type of node selected in the Project Tree. All displayed text fields (like Summary and Content) will be editable by the user.
    *   **If a "Branch" node is selected (e.g., a node that can have children like 'Chapter 3'):**
        *   **Path:** Displays the full hierarchical path to the node (e.g., `Novel / Act 2 / Chapter 3`).
        *   **Summary:** A multi-line text area for viewing and editing the node's summary.
        *   **Action Button:** An `[Expand]` button to trigger the generation of child nodes.
    *   **If a "Leaf" node is selected (e.g., a node at the end of a hierarchy like 'Scene 1'):**
        *   **Path:** Displays the full hierarchical path to the node (e.g., `Novel / Act 2 / Chapter 3 / Scene 1`).
        *   **Summary:** A multi-line text area for the node's summary.
        *   **Content:** A large, editable text area displaying the full generated text for the node.
        *   **Action Button:** A `[Generate]` button to trigger the content generation.
    *   **On-Demand Prompt View:** For any node that has had content or children generated, a mechanism (e.g., a "Show Prompt" button) will allow the user to see the exact prompt that was used.

**3. Template Editor Modal**
*   Launched by the `[Manage Templates]` button.
*   Features a list of editable text inputs, each representing a level in the hierarchy.
*   Includes an `[Add Layer]` button to add new levels and "Remove" buttons for each existing level.
*   Provides `[Save]` and `[Cancel]` buttons.

---

## 1. Template Editor UI

### 1.1. Template Editor

This will be a new section within the main settings modal for creating and managing document templates.

*   **Data Structure:** A template will be stored as a simple object containing a name and an array of strings representing the hierarchy.
    ```json
    {
      "name": "Standard Novel",
      "hierarchy": ["Book", "Act", "Chapter", "Scene"]
    }
    ```
*   **UI:** A dedicated modal or view for creating and managing document templates.
    *   **Functionality:**
        *   **Create New Template:** Allows the user to define a new document structure.
        *   **UI:** Instead of a simple textarea, the editor will feature a more structured, interactive list.
            *   The hierarchy will be displayed as a vertical list of editable text inputs.
            *   Each text input represents one level of the hierarchy (e.g., "Novel", "Act", "Chapter").
            *   An "Add Layer" button will be present to append a new, blank level to the end of the list.
            *   Each layer will have its own "Remove" button.
            *   This approach guides the user through the process and prevents formatting errors.
        *   **Save Template:** Saves the structure (as an ordered list of strings) to `localStorage` for future use.
*   The application will start with a default "Novel" template: `["Novel", "Act", "Chapter", "Scene"]`.

### 1.2. Document Node Enhancements

The `DocumentNode` class will need to be updated to support this new workflow.

*   **`template: string[]`**: The hierarchical template used (e.g., `["Novel", "Act", "Chapter"]`).
*   **`summary: string`**: A brief, user-editable summary of the node's content. This will be used for context compilation.
*   **`generationPrompt: string | null`**: Stores the full text of the prompt sent to the LLM for either expansion or content generation. Initially null.
*   **`isLeaf: boolean`**: A getter that returns `true` if the node is at the last level of its template.
*   **`childLevelName: string | null`**: A getter that returns the name of the next level in the hierarchy (e.g., for an "Act" node, it would return "Chapter"). This is for UI button labels.

### 1.3. Core User Actions

The primary user interactions will be "Expand" and "Generate".

*   **Expand Action:**
    *   Available on non-leaf nodes.
    *   Triggers an LLM call using the "Expand Prompt."
    *   This prompt will receive the same rich context as the "Generate" action to ensure the generated titles are relevant to the story so far.
    *   Expects a structured JSON response (e.g., an array of chapter titles).
    *   Parses the JSON and creates the corresponding child `DocumentNode`s.
*   **Generate Action:**
    *   Available only on leaf nodes (e.g., Scenes).
    *   Triggers an LLM call using the "Content Generation Prompt".
    *   This prompt will be fed a rich context string compiled from summaries of ancestor and preceding sibling nodes.
    *   Returns plain text content.
    *   **Post-Generation Step:** After receiving the content, a second LLM call will be made to the **Editor Model** using the "Summarization Prompt" to populate the node's `summary` field.

---

## 2. Context Compilation Logic

This is the most critical part of the new functionality. When generating content or expanding a node, we need to provide the LLM with a coherent, structure-agnostic narrative of what has happened so far.

**Example Scenario:** Generating `Chapter 3` of `Act 2` in the novel "Cosmic Odyssey".

The context compilation algorithm will perform the following steps:

1.  **Identify Target Node:** `Chapter 3`
2.  **Construct Node Path:** Generate a clear, hierarchical path string for the target node.
    *   Example: `Novel: Cosmic Odyssey => Act: Act 2 => Chapter: Chapter 3`
3.  **Gather Preceding Sibling Context:**
    *   Find all siblings of `Chapter 3` that appear before it: `Chapter 1`, `Chapter 2`.
    *   Retrieve the `summary` for each of these nodes.
4.  **Traverse Up and Gather Ancestor/Cousin Context:**
    *   Move up to the parent: `Act 2`.
    *   Find all preceding siblings of `Act 2`: `Act 1`.
    *   Retrieve the `summary` for `Act 1`.
    *   (This process would continue all the way to the root node).
5.  **Assemble the Context String:** The final string passed to the LLM would be structure-agnostic and look something like this:
    ```
    You are working on the document path: "Novel: Cosmic Odyssey => Act: Act 2".

    Here is a summary of the story so far:

    **Summary of Sibling "Act 1":**
    [Summary of Act 1...]

    **Summary of Sibling "Chapter 1" (within "Act 2"):**
    [Summary of Chapter 1...]

    **Summary of Sibling "Chapter 2" (within "Act 2"):**
    [Summary of Chapter 2...]

    Based on this context, provide the titles for the next set of 'Chapter' entries.
    ```

---

## 3. New LLM Prompts

We will need three distinct, structure-agnostic prompts to power this workflow.

### 3.1. Expand Prompt

*   **Goal:** To generate the titles for the next level of the hierarchy, based on the story so far.
*   **Model:** Creator
*   **Returns:** Structured JSON.

```
System:
You are an expert author and structural outliner. Your task is to generate a list of titles for the children of a given document node, based on the provided context. Your output MUST be a valid JSON array of strings. Do not include any other text or explanations.

User:
You are working on the document path: "Novel: Cosmic Odyssey => Act: Act 2".

[CONTEXT_STRING ASSEMBLED BY THE ALGORITHM]

Based on this context, generate the titles for the 'Chapter' nodes that will follow.

Assistant:
[
  "Chapter 1: The Derelict Ship",
  "Chapter 2: The Warning",
  "Chapter 3: The Trap is Sprung"
]
```

### 3.2. Content Generation Prompt (Leaf Nodes)

*   **Goal:** To write the full text content for a leaf node based on its context.
*   **Model:** Creator
*   **Returns:** Plain text.

```
System:
You are a world-class author, known for your vivid prose and compelling narratives. Continue the story based on the provided context.

User:
You are writing the content for the node at the following path: "Novel: Cosmic Odyssey => Act: Act 1 => Chapter: The Signal => Scene: First Contact on Vesper".

Here is the context of the story so far:
[CONTEXT_STRING ASSEMBLED BY THE ALGORITHM]

Now, write the full content for the scene "First Contact on Vesper".
```

### 3.3. Summarization Prompt

*   **Goal:** To create a concise summary of a node's content after it has been generated.
*   **Model:** Editor
*   **Returns:** Plain text.

```
System:
You are an expert at summarizing text for use as future context. Create a concise, factual summary of the following text, capturing the key events, characters, and plot advancements.

User:
[FULL TEXT CONTENT OF THE GENERATED NODE]
```

This structured plan provides a clear path forward for implementing the next phase of the application. 