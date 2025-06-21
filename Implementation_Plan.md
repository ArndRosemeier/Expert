# Detailed Implementation Plan: Phase 1 - Core Data Models

This document breaks down the "Phase 1: The Core Data Model" section of `Vision_And_Plan.md` into concrete, actionable, and testable steps. The goal is to build a solid, non-UI foundation for the project structure before integrating any LLM logic.

---

### **Step 1.1: The `DocumentNode` Class**

*   **Task:** Create the `src/DocumentNode.ts` file and implement the `DocumentNode` class. This class represents a single item in our document hierarchy (like a chapter or a section).
*   **Details:**
    *   The class will have properties: `id` (string), `level` (number), `title` (string), `parentId` (string | null), `children` (array of `DocumentNode`s).
    *   For now, `content`, `summary`, `inheritedContext`, and `criteria` can be initialized as empty strings or arrays.
    *   The constructor will initialize these properties. We will use a simple function to generate unique IDs for now.
*   **Testing (In a temporary test script or `main.ts`):**
    1.  Instantiate a root node for a "Book".
    2.  Instantiate a child node for an "Act".
    3.  Add the "Act" node to the "Book"'s `children` array and set its `parentId`.
    4.  Log the resulting structure to the console to verify the relationship is correct.

---

### **Step 1.2: The `ProjectTemplate` Class**

*   **Task:** Create the `src/ProjectTemplate.ts` file and implement the `ProjectTemplate` class. This class defines the "shape" of a project.
*   **Details:**
    *   The class will have properties: `name` (string, e.g., "Standard Novel"), `hierarchyLevels` (array of strings, e.g., `['Book', 'Act', 'Chapter']`), and `scaffoldingDocuments` (array of strings, e.g., `['Main Outline', 'Character Bios']`).
*   **Testing:**
    1.  Create an instance for a "Standard Novel".
    2.  Create another instance for a "Technical Manual" with different levels and scaffolding docs.
    3.  Log both instances to the console to verify their properties.

---

### **Step 1.3: `ProjectManager` - Initial Structure**

*   **Task:** Create the `src/ProjectManager.ts` file and implement the skeleton of the `ProjectManager` class. This class will be the master controller for a project.
*   **Details:**
    *   The class will have properties: `projectTitle` (string), `template` (an instance of `ProjectTemplate`), and `rootNode` (an instance of `DocumentNode`).
    *   The constructor will accept a title and a template, and it will initialize a new project by creating the root `DocumentNode` based on the template's first hierarchy level.
    *   Implement a `findNodeById(id: string, startNode = this.rootNode): DocumentNode | null` method. This will be a recursive function that traverses the document tree to find a specific node.
*   **Testing:**
    1.  Create a `ProjectManager` instance for a new novel.
    2.  Use `findNodeById` to find the root node and verify its title and level are correct.

---

### **Step 1.4: `ProjectManager` - Tree Manipulation**

*   **Task:** Add methods to the `ProjectManager` to add and remove nodes from the tree.
*   **Details:**
    *   Implement `addNode(title: string, parentId: string): DocumentNode`. This method will:
        1.  Find the parent node using `findNodeById`.
        2.  Throw an error if the parent doesn't exist.
        3.  Create a new `DocumentNode`, setting its `level` to `parent.level + 1`.
        4.  Add the new node to the parent's `children` array.
        5.  Return the newly created node.
    *   Implement `removeNode(id: string): boolean`. This method will traverse the tree to find and remove a node (and all its descendants) from its parent's `children` array.
*   **Testing:**
    1.  Using the `ProjectManager` from the previous step, call `addNode` to add an "Act 1" under the root.
    2.  Add "Chapter 1" and "Chapter 2" under "Act 1".
    3.  Log the entire `projectManager.rootNode` to visualize the tree and verify the structure.
    4.  Call `removeNode` on "Chapter 2" and log the tree again to confirm its removal.

---

### **Step 1.5: `ProjectManager` - Persistence**

*   **Task:** Add the ability to save and load the entire project state.
*   **Details:**
    *   Implement a `save(): string` method. This method will serialize the entire project object (including the `rootNode` tree and template) into a JSON string.
    *   Implement a static method `load(json: string): ProjectManager`. This is the most complex step. It cannot simply `JSON.parse` the data, as this would lose the class methods (`findNodeById`, `addNode`, etc.). It must "rehydrate" the project:
        1.  Parse the JSON into a plain object.
        2.  Create a new `ProjectManager` instance.
        3.  Recursively walk through the plain node objects from the JSON and create new `DocumentNode` instances, rebuilding the tree structure within the new `ProjectManager`.
*   **Testing:**
    1.  Build a project with several nodes as in the previous test.
    2.  Call `save()` to get the JSON string.
    3.  Call `ProjectManager.load()` with that string to create a `newProjectManager`.
    4.  Verify that `newProjectManager` has the same data. Test its methods by calling `findNodeById` on it to ensure the class instance was reconstructed correctly.

---

### **Step 1.6: Create a Test GUI**

*   **Task:** Create a simple, visual way to run the tests for Phase 1 and see the results, integrated into the current application.
*   **Details:**
    1.  **`TestRunner.ts`**: Create a new file `src/TestRunner.ts`. This class will contain a single public method, `runPhase1Tests(): { success: boolean, message: string }[]`. This method will programmatically execute all the testing logic described in steps 1.1 through 1.5. Each test step will return a result object.
    2.  **UI - Test Modal**: Create a new, dedicated modal in `index.html` (e.g., `id="test-modal-container"`). This modal will be used to display the results of the tests.
    3.  **UI - Test Button**: Add a "Run Tests" button to the main header in `index.html`.
    4.  **Integration in `main.ts`**:
        - Wire up the "Run Tests" button to an event handler.
        - The handler will instantiate `TestRunner`, call `runPhase1Tests()`, and then dynamically generate HTML to display the results (e.g., a list of tests with a green checkmark for success or a red 'X' for failure, along with the message).
        - This HTML will be injected into the test modal, which is then displayed.
*   **Testing:**
    1.  Click the "Run Tests" button.
    2.  Verify that the modal appears and shows the results for all the implemented tests.
    3.  Intentionally break one of the classes (e.g., make `addNode` fail) and re-run the tests to ensure the test runner correctly reports the failure.

---

### **Conclusion of Phase 1**

Upon completing these steps, we will have a fully functional, in-memory project data model. It will be completely decoupled from the UI and the LLM engine, and thoroughly testable on its own. This provides a rock-solid foundation for Phase 2, where we will begin integrating the `LoopOrchestrator` to breathe life into the nodes. 