# Expert Application - Complete User Manual

---

## Overview & Getting Started

### What is Expert?

Expert is a sophisticated AI-powered hierarchical document generation system designed to create complex, structured documents using multiple AI models working in coordination. The application excels at producing long-form content like novels, technical manuals, business plans, screenplays, and academic papers through an intelligent template-based approach.

**Key Capabilities:**
- **Hierarchical Generation**: Creates structured documents using customizable templates (Book → Chapter → Scene)
- **Multi-Agent AI System**: Uses Creator, Prose, Rater, and Editor AI models for iterative quality improvement
- **Smart Context Management**: Maintains consistency across document sections using inherited context
- **Template Flexibility**: User-definable document structures for any content type
- **Quality Assurance**: Configurable quality criteria with automatic evaluation and refinement
- **Coherence Checking**: AI-powered analysis to detect and fix contradictions in content

### System Requirements

- **Browser**: Modern web browser (Chrome, Firefox, Safari, Edge)
- **Internet**: Stable connection for AI features
- **Storage**: ~50MB browser storage for projects
- **API Keys**: 
  - Expert application key (for access)
  - OpenRouter API key (for AI models)

### First-Time Setup

1. **Access the Application**
   - Navigate to the Expert application URL
   - You'll see a key validation modal on first visit

2. **Enter Application Key**
   - Input your Expert application key
   - Click "Validate Key"
   - The app will verify and initialize

3. **Configure AI Models**
   - Click "⚙️ Settings" in the header
   - Enter your OpenRouter API key
   - Test the connection
   - Select AI models for Creator, Rater, Editor and Prose roles

4. **Create Your First Project**
   - Click "📝 New Project"
   - Choose between Manual or AI-powered project creation
   - Start generating content!

---

## Authentication & Setup

### Application Key Management

**Key Status Indicators:**
- 🟢 **Valid**: Key is active with expiration date shown
- 🟡 **Expiring**: Key expires within 7 days
- 🔴 **Expired**: Key has expired or is invalid

**Key Features:**
- Automatic validation on startup
- Real-time status updates
- Secure storage in browser's IndexedDB
- Key information displayed in Settings

### OpenRouter Configuration

**Setup Process:**
1. Obtain an API key from [OpenRouter.ai](https://openrouter.ai)
2. In Expert Settings → AI Model Configuration
3. Enter your OpenRouter API key
4. Click "Test Connection" to verify
5. Use "Fetch Models" to see available AI models
6. Select models for each purpose:
   - **Creator**: Main content generation
   - **Rater**: Quality evaluation
   - **Editor**: Content refinement

**Model Information:**
- Context window size (token capacity)
- Pricing per million tokens
- Performance characteristics
- Provider details

**Security Note:**
API keys are stored locally in your browser's IndexedDB. Only you have access to them through your browser profile.

---

## Main Interface

### Header Bar

**Left Side:**
- **Expert Logo**: Application branding

**Right Side (Action Buttons):**
- **🛑 Abort Generation**: Stop any running AI operations
- **📝 New Project**: Create a new document project
- **📁 Import Project**: Load existing project data
- **📦 Save/Load All**: Comprehensive export/import system
- **🧠 Idea Board**: Open visual brainstorming canvas
- **⚙️ Settings**: Access configuration and profiles
- **🎯 Manage Templates**: Create and edit document templates

### Control Bar

**Profile Section:**
- **Profile Selector**: Switch between AI configuration profiles
- **Language Selector**: Choose content generation language

**Monitoring Section:**
- **🤖 See AI Interactions**: Toggle AI operation visibility
- **Progress Reports**: Real-time generation status

**Actions Section:**
- **📖 Reader View**: Switch to clean reading interface

### Main Content Area

The interface is organized into three main sections:

**1. Tree View (Left Panel)**
- Hierarchical project structure
- Expandable/collapsible nodes
- Status indicators for each node
- Navigation and selection interface

**2. Content Panel (Center)**
- Node details and editing interface
- Content generation controls
- Version management
- Quality ratings display

**3. Context Panel (Bottom)**
- Inherited context display
- Context extraction tools
- Project-wide context management

---

## Project Management

### Creating Projects

**Manual Project Creation:**
1. Click "📝 New Project"
2. Select "Manual" tab
3. Choose from available templates:
   - Standard Novel
   - Technical Manual
   - Business Plan
   - Screenplay
   - Academic Paper
   - Custom templates
4. Enter project title and description
5. Configure initial settings

**AI-Powered Project Creation:**
1. Click "📝 New Project"
2. Select "AI" tab
3. Describe your project in natural language:
   - "A sci-fi detective story on Mars"
   - "User manual for a mobile app"
   - "Business plan for a coffee shop"
4. The AI will generate:
   - Complete project structure
   - Custom template hierarchy
   - Initial context and scaffolding
   - Character sheets, outlines, or relevant documents

### Project Structure

**Components:**
- **Root Node**: Top-level project container
- **Hierarchy Levels**: Template-defined structure (e.g., Book → Act → Chapter → Scene)
- **Content Nodes**: Individual sections with generated content
- **Scaffolding Documents**: Supporting materials (character sheets, outlines, style guides)
- **Context System**: Inherited context flowing down the hierarchy

**Project Information:**
- Project title and description
- Template name and structure
- Creation date and last modified
- Content statistics and progress
- Quality metrics and ratings

### Project Operations

**Core Actions:**
- **Generate Content**: Create AI content for selected nodes
- **Edit Content**: Manual editing with rich text support
- **Add Child Nodes**: Expand document structure
- **Delete Nodes**: Remove sections or entire branches
- **Export Project**: Save in various formats
- **Import Content**: Load external content into nodes

**Advanced Operations:**
- **Batch Generation**: Generate multiple nodes simultaneously
- **Context Propagation**: Update context throughout hierarchy
- **Coherence Analysis**: Check for contradictions
- **Quality Evaluation**: Rate and improve content quality
- **Template Modification**: Adjust project structure

---

## Hierarchical Document Generation

### Template System

**Template Hierarchy:**
Templates define the structure of your document using levels:

```
Book Project Template:
├── Level 0: Book (Root)
├── Level 1: Act 
├── Level 2: Chapter
└── Level 3: Scene
```

**Template Types:**
- **Flexible Levels**: "Chapter" = unlimited chapters
- **Fixed Levels**: "Chapter 12" = exactly 12 chapters
- **Mixed**: "Act 3" + "Chapter" = 3 acts with unlimited chapters each

**Built-in Templates:**
- **Novel**: Book → Act → Chapter → Scene
- **Technical Manual**: Manual → Section → Topic → Subsection
- **Business Plan**: Plan → Section → Topic → Detail
- **Screenplay**: Script → Act → Scene → Beat
- **Academic Paper**: Paper → Section → Subsection → Paragraph

### Level-Based Generation Controls

**Four Control Levels:**

1. **Draft Level**: Deepest level for which child nodes are created
2. **Content Level**: Which levels receive AI-generated content (≤ Draft Level)
3. **Context Prune Level**: Which levels get automatic context cleanup
4. **Coherence Level**: Which levels get consistency checking (< Draft Level)

**Example Configuration:**
```
Draft Level: 2 (Chapter)
Content Level: 2 (Chapter)
Context Prune Level: 1 (Act)
Coherence Level: 1 (Act)
```

This creates drafts down to Chapter level, generates content for Chapters, prunes context at Act level, and checks coherence between Acts and their Chapters.

### Generation Process

**Breadth-First Processing:**
1. Start with root node
2. Process current level completely
3. Move to next level
4. Maintain context consistency throughout

**Context Inheritance:**
Each node receives context from:
- Parent node summary
- Sibling node summaries
- Project scaffolding documents
- Template-specific guidelines
- User-defined context

**Quality Assurance:**
Every generated node goes through:
1. **Creation**: AI generates initial content
2. **Rating**: Quality evaluation against criteria
3. **Editing**: Iterative improvement suggestions
4. **Refinement**: Multiple cycles until quality goals met

---

## AI-Powered Content Creation

### Multi-Agent System

Expert uses a sophisticated four-agent AI system with specialized models for different content types:

**1. Creator Agent**
- **Purpose**: Generate outlines and structural content for branch nodes
- **Input**: Generation prompt + context + quality criteria
- **Output**: Detailed outlines, summaries, and structural content
- **Models**: Typically high-creativity models (GPT-4, Claude, etc.)
- **Usage**: Used for non-leaf nodes that will be expanded into child nodes

**2. Prose Agent**
- **Purpose**: Generate refined final text for leaf nodes
- **Input**: Generation prompt + context + quality criteria
- **Output**: Polished, publication-ready text content
- **Models**: Models optimized for writing style and narrative flow
- **Usage**: Used for leaf nodes representing the finished document text

**3. Rater Agent**
- **Purpose**: Evaluate content quality for both outline and prose content
- **Input**: Generated content + quality criteria + scoring goals
- **Output**: Numerical scores (1-10) for each criterion
- **Models**: Typically analytical models focused on evaluation

**4. Editor Agent**
- **Purpose**: Provide improvement suggestions for any content type
- **Input**: Content + ratings + feedback goals
- **Output**: Specific, actionable improvement advice
- **Models**: Typically balanced models good at critique and suggestion

**Content Type Selection:**
The system automatically chooses between Creator and Prose models based on node type:
- **Branch Nodes**: Use Creator model for outlines and structural content
- **Leaf Nodes**: Use Prose model for final, polished text content

### Generation Workflow

**Single Node Generation:**
1. User selects node and clicks "⚡ Generate"
2. System compiles context from hierarchy
3. Creator generates initial content
4. Rater evaluates against quality criteria
5. If scores below goals: Editor provides feedback
6. Creator regenerates with feedback
7. Process repeats until quality goals met
8. Final content and ratings saved to node

**Batch Generation:**
1. User selects parent node and generation levels
2. System creates work queue for all target nodes
3. Processes nodes in breadth-first order
4. Each node follows single generation workflow
5. Context updates propagate to remaining nodes
6. Progress tracked in real-time

### Context Management

**Context Sources:**
- **Parent Summary**: AI-generated summary of parent content
- **Sibling Summaries**: Summaries of related nodes at same level
- **Scaffolding**: Project-wide documents (character sheets, outlines)
- **Template Context**: Structure-specific guidelines
- **User Context**: Manual context additions

**Context Inheritance:**
```
Book Context
├── Character sheets
├── Plot outline
└── Style guide
    ↓
Act 1 Context
├── Book context (inherited)
├── Act 1 summary
└── Other acts summaries
    ↓
Chapter 1 Context
├── Act 1 context (inherited)
├── Chapter 1 summary
└── Other chapter summaries
```

**Context Pruning:**
Automatic cleanup to prevent context overflow:
- Remove outdated summaries
- Condense repeated information
- Prioritize relevant context
- Maintain context size within AI model limits

### Node Chat - Interactive AI Conversations

**Node Chat** is one of Expert's most powerful features, allowing interactive conversations with AI about any part of your project. Unlike automatic generation, Node Chat provides a flexible dialogue interface for brainstorming, problem-solving, and getting specific help with your content.

**Accessing Node Chat:**
1. **Right-click** any node in the project tree
2. **Select "💬 Chat"** from the context menu
3. **Configure scope depth** for the conversation context
4. **Start your conversation** with natural language

**Scope Depth Configuration:**
- **This node only (Depth 0)**: Chat focuses solely on the selected node
- **Include direct children (Depth 1)**: Adds immediate child nodes to context
- **Include grandchildren (Depth 2)**: Extends context two levels deep
- **Multiple levels (3-5)**: Comprehensive context for complex discussions

**What You Can Do with Node Chat:**

**Creative Assistance:**
- "How can I make this chapter more exciting?"
- "What plot twists would work well here?"
- "Help me develop this character's backstory"
- "Suggest ways to improve this dialogue"

**Planning and Development:**
- "What should happen in the next scene?"
- "How can I connect these plot points?"
- "What obstacles should my character face?"
- "Help me outline the remaining chapters"

**Quality and Consistency:**
- "Does this scene match my character's personality?"
- "Is this consistent with what happened earlier?"
- "How can I improve the pacing here?"
- "What themes should I emphasize?"

**Technical and Structural:**
- "How should I organize this manual section?"
- "What information am I missing here?"
- "How can I make this more professional?"
- "Help me structure this business plan section"

**Node Chat Features:**
- **Context Awareness**: AI knows your project's characters, plot, style, and previous content
- **Persistent Memory**: Conversations remember earlier discussion points
- **Model Selection**: Choose which AI model to chat with based on your needs
- **Export Conversations**: Save important discussions for future reference
- **Real-time Responses**: Get immediate feedback and suggestions

**Example Node Chat Session:**

**User**: "I'm stuck on Chapter 3. The hero needs to discover something important about the villain, but I'm not sure how to make it happen naturally."

**AI**: "Looking at your project, I see the hero is currently in the market district. Here are some natural discovery methods:

1. **Overheard Conversation**: The hero could overhear merchants discussing the villain's past dealings
2. **Mysterious Item**: Finding an object that belonged to the villain's previous victim
3. **Witness Account**: Meeting someone who survived an encounter with the villain
4. **Hidden Message**: Discovering a coded message or warning left by another character

Given your character's curious nature from Chapter 1, the overheard conversation might work best. Want me to help you write that scene?"

**User**: "I like the overheard conversation idea. How should I structure it?"

**AI**: "For your character's personality, here's a structure that would work:
- Start with normal market activity to establish setting
- Have your hero notice something unusual in the merchants' behavior
- Build tension as the conversation reveals disturbing details
- End with your hero having to decide whether to act on this information

This fits your story's theme of moral choices and gives the hero agency in the discovery."

**Best Practices for Node Chat:**
- **Be specific** about what kind of help you need
- **Provide context** if discussing events not in the current node
- **Ask follow-up questions** to dive deeper into ideas
- **Use it iteratively** - have multiple short conversations rather than one long one
- **Reference your project elements** (characters, themes, previous events)
- **Save important insights** by exporting conversations

**Performance Tips:**
- **Limit scope depth** for faster responses (use 1-2 levels for most conversations)
- **Preview content size** before starting to understand context volume
- **Use specific models** - creative models for brainstorming, analytical models for critique
- **Break complex topics** into multiple focused conversations

---

### AI Editing Capabilities (User Guide)

This section explains what the AI can change for you and how to phrase requests in natural language. No special commands are required.

#### What the AI can change
- Outline: the overall structure and content summary of your project.
- Context items: short, reusable facts (e.g., characters, locations, themes) used to keep consistency.

#### Outline editing and Sections
- The outline is a single document that describes structure and flow.
- Sections are optional but recommended for larger projects to guide AI edits.
- Use sections specifically for structural divisions such as Acts or Chapters.
  - Examples: `===Act I===`, `===Act II===`, `===Chapter 1===`, `===Chapter 2===`
- Characters, themes, and similar background elements should be modeled as context items (not outline sections).
- What you can ask:
  - "Rewrite the outline to make the midpoint stronger."
  - "Add an `===Act II===` section that escalates conflict."
  - "Tighten the ending section and remove redundant parts."

#### Context items with triggers
- Context items keep facts consistent across your project (e.g., characters, locations, themes).
- Each item can be:
  - Global: always active.
  - Triggered: active only when a specific keyword appears (e.g., a character name).
- What you can ask:
  - "Create a global context item for the city history."
  - "Update Sarah’s context item to include her new backstory."
  - "Add a triggered context item for 'Neo-Singapore' that describes the skyline and tech vibe."

#### Limitations
- The AI can set or change the single trigger keyword for a context item.
- More complex activation conditions (beyond a single trigger keyword) must be edited manually.

#### Tips for better results
- Be explicit: "Strengthen the stakes in `===Chapter 2===` without changing the character motivations."
- Use clear section titles for Acts/Chapters to help the AI target the right part of the outline.
- Keep triggers short: use names or single keywords, not sentences.
- Iterate: ask for a small improvement, review, then continue.

---

## Templates & Structure

### Template Creation

**Template Components:**
1. **Name**: Template identifier
2. **Hierarchy Levels**: Ordered list of document levels
3. **Scaffolding Documents**: Supporting materials to generate
4. **Default Settings**: Quality criteria and generation preferences

**Creating Custom Templates:**
1. Go to "🎯 Manage Templates"
2. Click "Save as New"
3. Define hierarchy levels:
   - Level names (e.g., "Chapter", "Section")
   - Fixed counts (e.g., "Act 3" for exactly 3 acts)
   - Flexible counts (e.g., "Chapter" for unlimited chapters)
4. Specify scaffolding documents
5. Set default quality criteria
6. Save template for reuse

### Template Examples

**Novel Template:**
```json
{
  "name": "Standard Novel",
  "hierarchyLevels": ["Book", "Act 3", "Chapter", "Scene"],
  "scaffoldingDocuments": [
    "Character Sheets",
    "Plot Outline", 
    "World Building",
    "Style Guide"
  ]
}
```

**Technical Manual Template:**
```json
{
  "name": "Technical Manual",
  "hierarchyLevels": ["Manual", "Section", "Topic", "Procedure"],
  "scaffoldingDocuments": [
    "Product Overview",
    "User Personas",
    "Technical Specifications",
    "Style Guide"
  ]
}
```

**Business Plan Template:**
```json
{
  "name": "Business Plan",
  "hierarchyLevels": ["Plan", "Section 7", "Subsection"],
  "scaffoldingDocuments": [
    "Executive Summary",
    "Market Analysis",
    "Financial Projections",
    "Competitive Analysis"
  ]
}
```

### Template Management

**Operations:**
- **Create**: Build new templates from scratch
- **Edit**: Modify existing template structure
- **Duplicate**: Copy and modify existing templates
- **Delete**: Remove unused templates
- **Export**: Save template as JSON file
- **Import**: Load template from JSON file
- **Restore Defaults**: Reset to built-in templates

**Template Sharing:**
- Export templates as JSON files
- Share with other Expert users
- Import community-created templates
- Version control for template evolution

---

## Quality Control System

### Quality Criteria

Quality criteria define how AI evaluates and improves generated content. Each criterion has:
- **Name**: What aspect is being evaluated
- **Description**: Detailed explanation of the criterion
- **Goal Score**: Target score (1-10) that must be met for this criterion to pass
- **Weight**: Used only to rank failing attempts when no iteration passes (does not affect pass/fail)

Criteria come in **two kinds**:
- **LLM criteria** — subjective qualities scored 1-10 by the Rater AI.
- **Metric criteria** — objective "AI-ism" checks evaluated automatically in code (no AI call, instant and consistent), with editable parameters (e.g. word lists, thresholds).

**All criteria are strict:** a generation only succeeds when *every* enabled criterion (LLM and metric alike) reaches its goal. There is no soft/gate distinction — if a check should not be able to block success, lower its goal or disable it.

**Default LLM Criteria:**

1. **Prompt Adherence** (Goal: 9)
   - Stays on topic and addresses the request
   - Follows given instructions accurately
   - Maintains focus throughout content

2. **Specificity & Concrete Detail** (Goal: 8)
   - Specific examples vs. generalities
   - Vivid, precise descriptions
   - Concrete rather than abstract

3. **Natural Human Voice** (Goal: 8)
   - Reads like a specific person wrote it, not a model
   - Varied sentence length and rhythm, no formulaic cadence
   - Distinctive word choice; avoids stock idioms and "writerly" over-correction
   - *(Merges the former Natural Tone, Engaging Flow, Varied Sentence Structure, Stylistic Variation, Lexical Character, and Original Phrasing criteria.)*

4. **Restraint & Subtlety** (Goal: 8)
   - Implies emotion and meaning rather than stating it
   - No melodrama, rhetorical heightening, or inflation of the ordinary
   - *(Merges the former Subtlety, Emotional Subtlety, Understated Language, Dramatical Reframing, and Immediate Clarity criteria.)*

5. **Keep the essence of the draft intact** (Goal: 9)
   - Creativity stays at the detail level
   - The draft's essence is treated as the source of truth for project consistency

**Default Metric Criteria (deterministic):**

6. **Avoids AI Clichés** — type `bannedPhrases`
   - Flags overused AI phrases (e.g. "delve into", "tapestry", "testament to")
   - Phrase and regex lists are fully editable

7. **Em-dash Restraint** — type `emDashDensity`
   - Limits em-dashes per 1000 words (a strong AI-ism tell)

8. **No Antithesis Reframing** — type `notXButY`
   - Flags the "It wasn't X, it was Y" antithesis construction

9. **Human-like Naming** — type `bannedNames`
   - Flags the most egregious overused fantasy/AI character names
   - Case-sensitive, with an editable name list (varied naming is reinforced separately via prompt expansion)

### Criteria Customization

**Editing Criteria:**
1. Access Settings → Quality Criteria
2. Select criterion to modify
3. Adjust goal score (1-10)
4. Modify description and guidance
5. Enable/disable criterion
6. Set application scope (which content types)

**Creating Custom Criteria:**
1. Click "Add New Criterion"
2. Define evaluation focus
3. Write detailed description
4. Set goal score and weight
5. Specify when to apply criterion
6. Test with sample content

**Profile-Specific Criteria:**
Different profiles can have different quality criteria:
- **Creative Profile**: Emphasizes originality and style
- **Technical Profile**: Focuses on clarity and accuracy
- **Business Profile**: Prioritizes professionalism and structure
- **Academic Profile**: Emphasizes rigor and evidence

### Rating System

**Rating Components:**
Each rating contains:
- **Score**: The numerical score (1-10). LLM criteria are scored by the Rater AI; metric criteria are scored deterministically in code.
- **Criterion**: The quality aspect being evaluated
- **Feedback**: Written justification (LLM criteria) or concrete detail such as "3 banned phrases found" (metric criteria)

**Scoring Process:**
1. Criteria are split: the Rater AI scores only the **LLM criteria**, while **metric criteria** are evaluated automatically in code. (If a profile has no LLM criteria, the Rater AI is skipped entirely.)
2. Both kinds produce 1-10 scores that are merged into a single result set.
3. A criterion **passes** when its score is at or above its goal.
4. An iteration is a **success** only when *every* enabled criterion — LLM and metric alike — meets its goal. There is no soft exemption: any criterion below its goal fails the iteration.
5. Each iteration also receives a **failure score**: for every failing criterion, `(goal − score) × weight`. This score does **not** affect pass/fail; it is used only to rank attempts. **Selection is tiered**: an iteration that meets every goal always wins over one that does not; among iterations in the same tier, the **lowest** failure score is chosen (most recent breaks ties). Even when no attempt passes, the best one is still returned.
6. The creator model is told about every constraint (including the deterministic metrics and their word lists) up front, so most violations are avoided before rating even happens.
7. The chosen content is always committed. If it still misses any goal, the node is flagged with a `❗` marker in the tree (hover lists the failing criteria) and the Node Inspector shows a **PASSED/FAILED** verdict. The flag clears once you regenerate to a passing result or replace the content with manual edits.

**Rating Display:**
- Ratings appear in the Node Inspector for generated content
- Each content version shows its associated ratings
- Historical ratings remain accessible through version management

**Score Interpretation:**
- **9-10**: Excellent, exceeds expectations
- **7-8**: Good, meets most requirements
- **5-6**: Adequate, needs some improvement
- **3-4**: Poor, significant issues
- **1-2**: Unacceptable, major problems

**Quality Goals:**
- Set target scores for each criterion
- Generation continues until targets met
- Maximum iteration limit prevents infinite loops
- Balance between quality and efficiency

---

## Profile & Model Management

### Profile System

Profiles store complete AI configurations, allowing instant switching between different use cases and writing styles.

**Profile Components:**
- **AI Model Selection**: Creator, Prose, Rater, and Editor model choices
- **Quality Criteria**: Custom scoring goals and enabled criteria
- **Generation Settings**: Iteration limits and timeout values
- **Prompt Configurations**: Custom prompt templates
- **Language Settings**: Content generation language

**Default Profiles:**
- **Balanced**: Good all-around performance
- **Creative**: Emphasizes originality and style
- **Fast**: Quick generation with basic quality
- **Premium**: Highest quality models and strict criteria

### Profile Operations

**Creating Profiles:**
1. Configure desired AI models and settings
2. Set quality criteria and goals
3. Test configuration with sample content
4. Save as new profile with descriptive name
5. Switch between profiles as needed

**Profile Management:**
- **Switch**: Change active profile instantly
- **Edit**: Modify existing profile settings
- **Duplicate**: Create variant of existing profile
- **Export**: Save profile as JSON file
- **Import**: Load shared or backup profile
- **Delete**: Remove unused profiles

### Model Configuration

**Model Selection:**
For each AI role, choose from available OpenRouter models:

**Creator Models** (Outline & Structure Generation):
- **High Creativity**: GPT-4, Claude-3 Opus, Gemini Pro
- **Balanced**: GPT-3.5 Turbo, Claude-3 Sonnet
- **Fast**: Smaller models for quick generation
- **Specialized**: Domain-specific models

**Prose Models** (Final Text Generation):
- **Literary**: Models optimized for narrative writing and style
- **Professional**: Models focused on clear, polished prose
- **Creative**: Models that excel at engaging, expressive writing
- **Specific**: Genre-specific or domain-specialized prose models

**Rater Models** (Quality Evaluation):
- **Analytical**: Models good at evaluation and scoring
- **Consistent**: Models with stable rating behavior
- **Detailed**: Models providing comprehensive feedback

**Editor Models** (Improvement Suggestions):
- **Constructive**: Models good at helpful critique
- **Specific**: Models providing actionable advice
- **Balanced**: Models combining analysis and creativity

**Model Information Display:**
- Context window size (token capacity)
- Input/Output pricing per million tokens
- Provider and model family
- Performance characteristics
- Recommended use cases

### Advanced Configuration

**Model Parameters:**
- **Temperature**: Control creativity vs. consistency
- **Top-p**: Nucleus sampling for output diversity
- **Max Tokens**: Output length limits
- **Frequency Penalty**: Reduce repetition
- **Presence Penalty**: Encourage topic diversity

**Performance Tuning:**
- **Timeout Settings**: AI response time limits
- **Retry Logic**: Handling failed requests
- **Rate Limiting**: Prevent API quota exhaustion
- **Cost Management**: Monitor and control usage

---

## Idea Board

The Idea Board is an infinite canvas visual brainstorming environment that complements Expert's hierarchical document structure. It provides a flexible space for organizing ideas, exploring connections, and collaborating with AI on creative projects.

### Overview

**What is the Idea Board?**
The Idea Board is a visual workspace featuring:
- **Infinite Canvas**: Pan and zoom freely in any direction
- **Post-It Notes**: Moveable, resizable sticky notes for capturing ideas
- **AI Integration**: Smart features for summarization, continuation and idea generation... also make your own.
- **Project Integration**: Connect ideas to your document projects
- **Visual Organization**: Color coding, grouping, and connection tools
- **Ghost Outlines**: Semi-transparent guides ensure hidden structures remain visible

**When to Use the Idea Board:**
- **Brainstorming**: Generate and organize initial project ideas
- **Plot Development**: Visually map story elements, character arcs, and scenes
- **Research Organization**: Collect and categorize research materials
- **Problem Solving**: Break down complex problems into manageable parts
- **Creative Exploration**: Experiment with concepts before committing to document structure

### Accessing the Idea Board

**Opening the Idea Board:**
1. Click the **🧠 Idea Board** button in the main interface header
2. The Idea Board opens in a full-screen modal overlay
3. Multiple boards can be created and managed separately

### Core Features

#### Post-It Notes

**Creating Notes:**
- **Double-click** empty canvas space to create a new note
- **Right-click** for context menu with creation options
- Notes appear with default yellow color and standard size

**Editing Notes:**
- **Double-click** note to enter text editing mode
- **Type** to add or modify content
- **Click outside** or press Escape to finish editing
- **Markdown formatting** supported for rich text

**Customizing Notes:**
- **Color Options**: Yellow, blue, green, pink, orange, white
- **Resize**: Drag corner handles to adjust size
- **Move**: Click and drag to reposition anywhere on canvas
- **Layer Order**: Right-click to bring forward or send backward

#### Canvas Navigation

**Pan and Zoom:**
- **Mouse Wheel**: Zoom in/out at cursor position
- **Click and Drag**: Pan around the infinite canvas
- **Zoom Range**: 10% to 500% for detail work or overview
- **Smooth Animation**: Fluid movement for comfortable navigation

**Visual Aids:**
- **Ghost Outlines**: Semi-transparent dotted lines show hidden structures
- **Background Areas**: Always visible as dotted borders even when covered by notes
- **Connections**: Always visible as dotted lines even when behind other elements
- **Spatial Awareness**: Maintains visual structure reference at all times

**Navigation Tips:**
- Use zoom out for overview of all ideas
- Zoom in for detailed editing of specific notes
- Pan to explore different areas of your brainstorm
- Ghost outlines help navigate complex layered structures
- No boundaries - canvas extends infinitely in all directions

**AI Assistance Types:**

**Idea Generation:**
- "Generate 10 character concepts for a sci-fi story"
- "Suggest plot twists for my mystery novel"
- "What are innovative features for a mobile app?"

**Summarize:**
- Auto-summarize one post-it or summarize several post-its into a new one

**Continue:**
- Auto continue a post-it with alternatives in multiple post-it or connect exactly as many as you want continuations

**Export/Import:**
- Export boards as Markdown for documentation
- Export boards as JSON for complete backup and sharing  
- Import boards from JSON to restore or share between users

#### Advanced Operations

**Copy and Paste:**
- **Ctrl+C**: Copy selected notes
- **Ctrl+V**: Paste notes at cursor location

**Keyboard Shortcuts:**
- **Delete**: Remove selected note. Can include descendant notes optionally.

### Integration with Document Projects

**Project Connections:**
- **Reference Nodes**: Insert content from document project nodes

**Workflow Integration:**
1. **Brainstorm** initial concepts on Idea Board
2. **Organize** ideas visually with colors and grouping
3. **Develop** concepts using AI chat assistance
4. **Export** structured ideas to create new document projects
5. **Iterate** between board exploration and document creation

### Board Management

**Saving and Loading:**
- **Auto-Save**: Boards save automatically when you switch focus

**Export Options:**
- **Export Dropdown**: Click the 📁 button to see export options:
  - **Export as Markdown**: Convert board to structured document format
  - **Export as JSON**: Save complete board data for backup or sharing

**Import Options:**
- **Import from JSON**: Restore complete board from previously exported JSON file

### Best Practices

**Effective Brainstorming:**
- **Start Small**: Begin with simple one-line concepts
- **Use Colors**: Organize by theme, priority, or development stage
- **Think Spatially**: Position related ideas near each other
- **Embrace Chaos**: Don't worry about organization initially
- **Regular Review**: Step back and zoom out to see the big picture

**AI Collaboration:**
- **Be Specific**: Give AI clear context about your project goals
- **Iterative Refinement**: Use multiple AI conversations to develop ideas
- **Cross-Reference**: Connect AI suggestions back to your existing notes
- **Critical Evaluation**: AI provides suggestions, you make creative decisions

**Project Development:**
- **Document Progression**: Use board for initial exploration, documents for development
- **Maintain Connection**: Keep boards updated as projects evolve
- **Archive Completed**: Save finished brainstorms for future reference
- **Template Creation**: Develop board templates for recurring project types

---

## Reader View & Export

### Reader View

A clean, distraction-free interface for reviewing and reading generated content.

**Reader Features:**
- **Clean Layout**: Minimal interface focused on content
- **Typography**: Optimized fonts and spacing for reading
- **Navigation**: Table of contents with jump-to-section
- **Themes**: Light, dark, and sepia reading modes
- **Font Controls**: Adjustable size, family, and line spacing
- **Export**: Print or save as PDF from reader view

**Accessing Reader View:**
1. Click "📖 Reader View" in the control bar
2. Navigate using table of contents
3. Use settings panel for customization
4. Close reader to return to editing interface

**Reader Settings:**
- **Font Family**: Serif, sans-serif, monospace options
- **Font Size**: Adjustable from small to large
- **Line Height**: Control text spacing
- **Theme**: Light, dark, sepia color schemes
- **Column Width**: Optimize for screen or print
- **Show Metadata**: Include/exclude technical information

### Export System

**Export Formats:**
- **JSON**: Native Expert format for backup and sharing
- **Markdown**: Plain text with formatting for versatility
- **HTML**: Web-ready format with styling
- **Plain Text**: Clean text without formatting
- **PDF**: Print-ready document format

**Export Scope:**
- **Single Node**: Export just one section
- **Hierarchy**: Export node and all children
- **Leaves Only**: Export only bottom-level content
- **Complete Project**: Export entire project structure

**Export Process:**
1. Right-click target node or use main Export button
2. Choose export format
3. Select scope (single/hierarchy/leaves/complete)
4. Configure format-specific options
5. Download generated file

**Export Options:**
- **Include Metadata**: Add technical information
- **Flatten Hierarchy**: Combine levels into single document
- **Custom Styling**: Apply CSS for HTML exports
- **Page Layout**: Control margins and formatting for PDF
- **Encoding**: Character set for text exports

### Import System

**Import Sources:**
- **Project Files**: Import complete Expert projects
- **Text Files**: Import existing documents for processing
- **Structured Data**: Import JSON or CSV with hierarchy
- **Web Content**: Import from URLs or web pages

**Import Process:**
1. Click "📁 Import Project" or use node import option
2. Select file or provide URL
3. Choose import type and target location
4. Map content to project structure
5. Process and integrate imported content

**Import Intelligence:**
- **AI Analysis**: Automatically analyze imported text structure
- **Content Classification**: Identify document sections and hierarchy
- **Context Extraction**: Pull out characters, themes, and key information
- **Structure Mapping**: Suggest how content fits into templates

---

## Advanced Features

### Coherence Checking

Analyze consistency between outline and expanded content using AI.

**How It Works:**
1. Select parent node with expanded children
2. Click "Check Coherence" in actions menu or enable automatic coherence checking
3. AI analyzes parent outline vs. children content
4. Identifies factual contradictions and inconsistencies
5. Provides severity ratings (1-10) for each issue
6. Suggests corrections for identified problems

**Automatic Coherence Checking:**
- Runs automatically during level-based generation when coherence level is set
- Processes nodes systematically as content is generated
- Successfully analyzed nodes are tagged as "consistent_to_parent"

**Coherence Results:**
- **Contradiction Description**: Clear explanation of the issue
- **Severity Rating**: How much the contradiction affects coherence
- **Source Identification**: Which child node contains the contradiction
- **Suggested Fix**: AI recommendation for resolution
- **Auto-Fix Option**: Apply AI-suggested correction automatically



### Context Extraction

Automatically extract relevant information from content for use as context.

**Extraction Types:**
- **Characters**: Names, descriptions, relationships, characteristics
- **Locations**: Settings, geography, important places
- **Themes**: Central concepts, motifs, recurring ideas
- **Events**: Important plot points, chronology, causation
- **Technical Info**: Procedures, specifications, requirements
- **Custom**: User-defined extraction criteria

**Extraction Process:**
1. Select content-containing node
2. Click "Extract Context" button
3. Choose extraction type or describe custom needs
4. AI analyzes content and extracts relevant information
5. Review and edit extracted context
6. Add to project context or node context

### Batch Operations

Perform operations on multiple nodes simultaneously.

**Batch Generation:**
- Select multiple nodes or parent node
- Set generation parameters for all
- Process in optimized order
- Monitor progress across all nodes
- Handle errors and retries automatically

**Batch Updates:**
- Apply changes to multiple nodes at once
- Update context across hierarchy
- Modify settings for node groups
- Propagate template changes

### AI Chat Interface

Interactive chat with AI models using project context.

**Chat Features:**
- **Model Selection**: Choose from available AI models
- **Context Awareness**: Chat with full project context
- **Action Shortcuts**: Pre-defined prompts for common tasks
- **Conversation History**: Maintain chat context across sessions
- **Export Chat**: Save conversation for reference

**Chat Actions:**
- **Consistency Check**: Ask AI to review content coherence
- **Improvement Suggestions**: Get specific enhancement ideas
- **Roleplay Adventure**: Interactive storytelling with characters
- **Custom Queries**: Ask anything about your project

### Text Improvement Tools

**Polish Text Feature**

The Polish Text feature provides AI-powered text improvement for any content in your project. This tool is ideal for refining drafts, improving clarity, and adjusting tone or style.

**How to Use Polish Text:**
1. **Right-click** any node with content in the project tree
2. **Select "🎨 Polish Text"** from the context menu
3. **Specify improvement type** in natural language:
   - "Make this more formal and professional"
   - "Improve clarity and fix grammar"
   - "Make this more engaging and exciting"
   - "Simplify the language for general readers"
   - "Add more descriptive detail"
4. **Review suggestions** and apply desired changes
5. **Iterate** with additional polish requests if needed

**Polish Text Use Cases:**
- **Style Adjustment**: Convert between formal/casual, technical/accessible
- **Grammar and Clarity**: Fix errors and improve readability
- **Tone Modification**: Adjust emotional tone or voice
- **Content Enhancement**: Add detail, examples, or improved descriptions
- **Consistency**: Ensure text matches project style guidelines

**Reader View Text Editing**

When in Reader View, Expert provides inline text improvement tools for rapid editing:

**Accessing Reader View Tools:**
1. **Click 📖 Reader View** in the top navigation
2. **Select any text** you want to improve
3. **Choose from AI improvement options** that appear:
   - **Rewrite**: Improve the selected text while maintaining meaning
   - **Expand**: Add more detail and depth to the content
   - **Simplify**: Make complex text clearer and more accessible
   - **Tone Shift**: Change the style (formal, casual, technical, etc.)
   - **Fix Grammar**: Correct errors and improve structure

**Reader View Features:**
- **Instant Editing**: See changes immediately in context
- **Undo Function**: Revert changes if you don't like the results
- **Selection Modes**: Choose words, sentences, or paragraphs for editing
- **Context Awareness**: AI considers surrounding text for consistency
- **Export Ready**: Polish text and export directly from reader view

### Content Analysis Tools

**Logic Error Detection**

Automatically identify logical inconsistencies and plot holes in your content.

**How to Use:**
1. **Right-click** a node with child content
2. **Select "🧩 Check Logic Errors"**
3. **Review identified issues** with severity ratings
4. **Apply suggested fixes** or use them as guidance for manual edits

**Coherence Checking**

Analyze consistency between outline content and expanded child nodes.

**Process:**
1. **Select parent node** with children that have been expanded
2. **Click "🔍 Check Coherence"** from the actions menu
3. **Review contradiction analysis** with severity scores
4. **Apply automatic fixes** or edit manually based on suggestions

**Redundancy Detection**

Find duplicate or overly similar content between sibling nodes.

**Usage:**
1. **Right-click** parent node with multiple children
2. **Select "🗑️ Find Redundant Children"**
3. **Review similarity analysis** and merge suggestions
4. **Consolidate or differentiate** content as needed

### Content Organization Tools

**Tag Manager**

Organize and categorize your content with custom tags for better project management.

**Features:**
- **Custom Tags**: Create project-specific categorization
- **Bulk Tagging**: Apply tags to multiple nodes simultaneously
- **Tag Filtering**: Find content by tag categories
- **Tag Hierarchy**: Organize tags in parent-child relationships

**Context Adjuster**

Fine-tune how context flows through your project hierarchy.

**Capabilities:**
- **Context Scope**: Adjust what context each node receives
- **Context Priorities**: Weight different context sources
- **Context Exclusions**: Remove irrelevant context from specific nodes
- **Context Preview**: See effective context before generation

**Batch Update Tools**

Perform operations across multiple nodes efficiently.

**Operations:**
- **Batch Generation**: Generate content for multiple nodes
- **Batch Context Updates**: Propagate context changes throughout hierarchy
- **Batch Tag Application**: Apply tags to node groups
- **Batch Export**: Export multiple nodes in various formats

### Advanced Generation Options

**Conversation-Style Generation:**
1. Access via node actions menu
2. Configure generation parameters in natural language
3. Set advanced options like coherence checking
4. Monitor detailed progress through generation stages
5. Review and approve results before applying

**Custom Prompts:**
- Modify default generation prompts
- Create specialized prompts for different content types
- Use placeholders for dynamic content insertion
- Test prompts with sample content

**Generation Monitoring:**
- Real-time progress tracking
- Stage-by-stage updates (Create → Rate → Edit)
- Model usage and performance metrics
- Error handling and retry logic
- Detailed logging for troubleshooting

---

## Troubleshooting

### Common Issues

#### Authentication Problems

**Problem**: Application key not accepted
- **Check**: Key format and spelling
- **Verify**: Key hasn't expired
- **Try**: Copy/paste to avoid typing errors
- **Contact**: Support if key should be valid

**Problem**: AI features not working
- **Check**: OpenRouter API key configured
- **Verify**: API key has sufficient credits
- **Test**: Connection in Settings
- **Review**: Model selection and availability

#### Performance Issues

**Problem**: Slow generation or timeouts
- **Reduce**: Context size and iteration count
- **Switch**: To faster AI models
- **Check**: Internet connection stability
- **Clear**: Browser cache and restart

**Problem**: Browser freezing or crashing
- **Close**: Other tabs and applications
- **Refresh**: Page and try again
- **Update**: Browser to latest version
- **Disable**: Browser extensions that might interfere

#### Content Issues

**Problem**: Poor quality generation
- **Review**: Quality criteria and goals
- **Adjust**: Model selection for better performance
- **Improve**: Context and instructions clarity
- **Increase**: Iteration count for more refinement

**Problem**: Inconsistent content across nodes
- **Run**: Coherence checking
- **Update**: Context propagation
- **Review**: Template structure and hierarchy
- **Use**: Batch operations for consistency

**Problem**: Ratings not displaying in Node Inspector
- **Check**: That content was generated (not manually entered)
- **Try**: Switching between different content versions
- **Verify**: Generation completed successfully

#### Data Loss Prevention

**Problem**: Lost work or corrupted projects
- **Export**: Projects regularly as backup
- **Avoid**: Clearing browser data
- **Use**: Multiple profiles for different projects
- **Check**: Browser storage limits

### Browser Compatibility

**Fully Supported:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Limited Support:**
- Mobile browsers (reduced functionality)
- Older browser versions
- Browsers with strict privacy settings

**Required Features:**
- IndexedDB support
- Modern JavaScript (ES2020+)
- CSS Grid and Flexbox
- Fetch API and WebCrypto

### Getting Help

**Self-Help Steps:**
1. Check this manual for solutions
2. Review AI interaction logs in settings
3. Try different browser or incognito mode
4. Clear browser cache and restart
5. Export project before troubleshooting

**Error Reporting:**
- Note exact error messages
- Include browser and version information
- Describe steps that led to the problem
- Provide project details if relevant
- Export project if possible for diagnosis

---

## Best Practices

### Project Organization

**Structure Design:**
- Use descriptive, meaningful names for projects and nodes
- Design logical hierarchy that reflects content flow
- Keep consistent naming conventions throughout
- Plan template structure before starting content generation

**Content Management:**
- Write clear, specific generation prompts
- Provide adequate context for AI understanding
- Review and edit generated content before proceeding
- Maintain scaffolding documents (character sheets, outlines)

**Version Control:**
- Export projects regularly for backup
- Use different profiles for different project phases
- Keep important versions as separate exports
- Document major changes and decisions

### AI Usage Optimization

**Prompt Engineering:**
- Be specific and detailed in generation requests
- Provide clear context and background information
- Use examples when describing desired output style
- Include relevant constraints and requirements

**Model Selection:**
- Use creative models for initial content generation
- Use analytical models for evaluation and critique
- Match model capabilities to task requirements
- Consider cost vs. quality trade-offs

**Quality Management:**
- Set realistic quality goals for your content type
- Adjust criteria weights based on project priorities
- Use iterative refinement rather than perfect first drafts
- Review AI suggestions before accepting changes

### Performance Optimization

**Resource Management:**
- Close unused projects to save browser memory
- Limit context size to prevent AI overload
- Use appropriate batch sizes for generation
- Monitor API usage and costs

**Workflow Efficiency:**
- Set up profiles for different types of work
- Use templates to standardize project creation
- Leverage batch operations for repetitive tasks
- Export completed sections to free up space

### Content Quality

**Writing Process:**
- Start with clear outline and structure
- Generate content in logical order (parents before children)
- Review context flow between sections
- Maintain consistency in tone and style

**Review Workflow:**
1. Generate initial content with AI
2. Review for factual accuracy and relevance
3. Check coherence with surrounding content
4. Edit and refine manually as needed
5. Export and backup completed sections

### Security and Privacy

**Data Protection:**
- API keys are stored locally in your browser
- Projects are saved to your browser's local storage
- No data is sent to servers except for AI generation
- Export important projects for additional backup

**Access Control:**
- Use strong, unique Expert application keys
- Don't share API keys with others
- Be cautious when importing projects from unknown sources
- Regularly review and rotate API keys

### Collaboration

**Sharing Projects:**
- Export projects as JSON for sharing
- Include relevant templates when sharing
- Document custom settings and configurations
- Provide context about project goals and structure

**Team Workflows:**
- Establish consistent naming conventions
- Share custom templates and quality criteria
- Use standardized export formats
- Maintain documentation of decisions and changes

---

*© 2024 Expert Application - Complete User Manual*

*This manual covers Expert Application features as of the current release. The application is actively developed with regular updates and improvements.* 