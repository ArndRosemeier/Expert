# Expert Application - Complete User Manual

## Table of Contents
1. [Overview & Getting Started](#overview--getting-started)
2. [Authentication & Setup](#authentication--setup)
3. [Main Interface](#main-interface)
4. [Project Management](#project-management)
5. [Hierarchical Document Generation](#hierarchical-document-generation)
6. [AI-Powered Content Creation](#ai-powered-content-creation)
7. [Templates & Structure](#templates--structure)
8. [Quality Control System](#quality-control-system)
9. [Profile & Model Management](#profile--model-management)
10. [Reader View & Export](#reader-view--export)
11. [Advanced Features](#advanced-features)
12. [Troubleshooting](#troubleshooting)
13. [Best Practices](#best-practices)

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
8. Final content saved to node

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
- **Goal Score**: Target score (1-10) for this criterion
- **Weight**: Importance relative to other criteria

**Default Criteria:**

1. **Prompt Adherence** (Goal: 9)
   - Stays on topic and addresses the request
   - Follows given instructions accurately
   - Maintains focus throughout content

2. **Clarity & Conciseness** (Goal: 7)
   - Direct, easy to understand writing
   - Eliminates unnecessary complexity
   - Clear communication of ideas

3. **Natural & Authentic Tone** (Goal: 7)
   - Human-sounding, not robotic
   - Appropriate voice for content type
   - Engaging and relatable style

4. **Engaging Flow** (Goal: 8)
   - Interesting progression of ideas
   - Smooth transitions between concepts
   - Maintains reader interest

5. **Varied Sentence Structure** (Goal: 7)
   - Avoids monotonous patterns
   - Mix of short and long sentences
   - Dynamic rhythm and pacing

6. **Subtlety (Show, Don't Tell)** (Goal: 8)
   - Implies rather than states directly
   - Uses descriptive scenes and actions
   - Lets readers draw conclusions

7. **Avoids AI Clichés** (Goal: 8)
   - No common AI phrases ("delve into", "realm of")
   - Original expression
   - Distinctive voice

8. **Understated Language** (Goal: 8)
   - Measured tone, not overdramatic
   - Appropriate emotional level
   - Sophisticated restraint

9. **Specificity & Concrete Detail** (Goal: 8)
   - Specific examples vs. generalities
   - Vivid, precise descriptions
   - Concrete rather than abstract

10. **Original Phrasing** (Goal: 7)
    - Avoids clichés and common idioms
    - Fresh perspective and expression
    - Creative word choices

11. **Stylistic Variation** (Goal: 8)
    - Natural rhythm and tone shifts
    - Varied paragraph lengths
    - Dynamic presentation

12. **Emotional Subtlety** (Goal: 8)
    - Layered emotions, not explicit
    - Complex character psychology
    - Nuanced emotional expression

13. **Lexical Character** (Goal: 8)
    - Distinctive word choices
    - Consistent voice
    - Memorable language

14. **Human-like Naming** (Goal: 8)
    - Realistic character names
    - Culturally appropriate naming
    - Avoiding generic or obvious names

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

**Scoring Process:**
1. Rater AI evaluates content against each criterion
2. Assigns numerical score (1-10) based on criterion goals
3. Provides written justification for each score
4. Overall score calculated as weighted average
5. Identifies areas needing improvement

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
2. Click "Check Coherence" in actions menu
3. AI analyzes parent outline vs. children content
4. Identifies factual contradictions and inconsistencies
5. Provides severity ratings (1-10) for each issue
6. Suggests corrections for identified problems

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