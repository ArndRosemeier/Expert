# Detailed Implementation Plan: Phase 2 - Generation Engine Integration

This document outlines the concrete steps to achieve "Phase 2" from `Vision_And_Plan.md`. The primary goal is to connect the `ProjectManager` (our data layer) with the `LoopOrchestrator` (our generation engine) so that we can generate content for individual `DocumentNode`s within a project.

---

### **Step 2.1: Enhance `DocumentNode`**

*   **Task:** Update the `DocumentNode` class to store all necessary data for a generation job.
*   **File:** `src/DocumentNode.ts`
*   **Details:**
    1.  Add a `content: string` property to hold the main text generated for the node.
    2.  Add a `summary: string` property. This will be unused for now but is needed for Phase 3.
    3.  Add a `criteria: QualityCriterion[]` property to store the specific quality goals for this node's content.
    4.  Add a `prompt: string` property to store the initial prompt used for generation.
    5.  Update the constructor to initialize these new fields.
*   **Testing:** Modify the Phase 1 tests in `TestRunner.ts` to verify these new properties are correctly initialized on new nodes.

---

### **Step 2.2: Context Compilation in `ProjectManager`**

*   **Task:** Create a method within `ProjectManager` that gathers all the necessary context for generating a specific node's content.
*   **File:** `src/ProjectManager.ts`
*   **Details:**
    1.  Implement a new private method: `compileNodeContext(nodeId: string): string`.
    2.  For now, this method will be simple. It will find the target node and its parent. It should return a string that includes the project title, the parent node's title, and the target node's title.
    3.  Example output: `"Project: My Sci-Fi Epic\nAct: The First Encounter\nChapter: The Signal"`
    4.  This method will be significantly expanded in Phase 3 to include summaries and scaffolding, but this provides the initial hook.
*   **Testing:** Add a new test case in `TestRunner.ts` that creates a small project tree, calls `compileNodeContext` on a child node, and verifies the output string contains the expected titles.

---

### **Step 2.3: `ProjectManager` Generation Method**

*   **Task:** Implement the main method in `ProjectManager` that will trigger the `LoopOrchestrator`. This is the core of Phase 2.
*   **File:** `src/ProjectManager.ts`
*   **Details:**
    1.  Add a `loopOrchestrator: LoopOrchestrator` property to the `ProjectManager`. It should be passed in via the constructor.
    2.  Implement a new public method: `generateNodeContent(nodeId: string, prompt: string, criteria: QualityCriterion[], maxIterations: number): Promise<void>`.
    3.  This method will be `async` and wrap the orchestrator logic in a `Promise`.
    4.  **Logic:**
        a. Find the node using `findNodeById`. If not found, reject the promise.
        b. Update the node's `prompt` and `criteria` properties.
        c. Call `compileNodeContext(nodeId)` from Step 2.2.
        d. Create the full prompt for the orchestrator: combine the compiled context with the user's `prompt`.
        e. Create the `LoopInput` object for the `LoopOrchestrator`.
        f. **Crucially**, set up a listener for the orchestrator's `progress` event *before* starting the loop. When a `creator` step payload is received, update the `node.content` property in near real-time.
        g. Call `loopOrchestrator.runLoop(loopInput)`.
        h. When the `runLoop` promise resolves, store the final `result.history` on the `DocumentNode` (we'll need a property for this, e.g., `generationHistory: LoopHistoryItem[]`).
*   **Testing:** This is difficult to unit test without a live LLM call. The primary testing will happen in the UI (Step 2.4). However, we can add a test in `TestRunner.ts` that uses a mock `LoopOrchestrator` to ensure `generateNodeContent` calls the orchestrator with the correct parameters.

---

### **Step 2.4: UI Integration for Node Generation**

*   **Task:** Update the UI to allow a user to select a node and generate content for it.
*   **Files:** `src/main.ts`, `index.html`
*   **Details:**
    1.  **Node Selection:** Modify the `renderProjectTree` function in `main.ts`. Add a click event listener to each `<li>` element representing a node. When a node is clicked:
        a. Store the `node.id` of the clicked node in a global variable (e.g., `selectedNodeId`).
        b. Add a visual indicator (e.g., a "selected" CSS class) to the clicked list item.
        c. Update the "Details" panel to show information about the selected node.
    2.  **Details Panel UI:** In the "Details" panel (`project-detail-container`), display:
        a. The node's title.
        b. A `textarea` for the user to enter the generation `prompt`. Load any existing `prompt` from the node.
        c. A "Generate" button.
    3.  **Event Handler:** In `main.ts`, wire up the "Generate" button. The click handler will:
        a. Get the `selectedNodeId`, the prompt from the `textarea`, and the criteria from the main UI (which is already implemented).
        b. Call `currentProject.generateNodeContent(...)`.
        c. Add a new `<div>` inside the details panel to show the generated `node.content` as it streams in. You can achieve this by using the `ProjectManager`'s event emitter to send updates from the orchestrator's `progress` event handler up to the UI.
*   **Testing:**
    1.  Create a new project from the UI.
    2.  Click on a chapter node.
    3.  The details panel should appear.
    4.  Enter a prompt like "Write the opening paragraph."
    5.  Click "Generate".
    6.  Verify the `LoopOrchestrator` progress bars appear and that text streams into the details panel.
    7.  After generation, if you re-select the node, the prompt and content should persist.

---

### **Conclusion of Phase 2**

Completing this phase will mark a major milestone. We will have successfully bridged our data model with our generation engine. The application will be able to manage a hierarchical document structure and generate content for any part of that structure on demand, laying all the essential groundwork for the advanced automation features in Phase 3. 