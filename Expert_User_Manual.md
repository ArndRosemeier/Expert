# Expert Application - User Manual

---

## Getting Started

### System Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for AI features
- Valid Expert application key

### First Time Setup
1. Navigate to the Expert application URL
2. You'll be prompted to enter an application key
3. Enter your key in the validation modal
4. The application will start once authenticated
5. In the settings dialog you need to set up your OpenRouter key and the used models for each purpose.

---

## Main Interface Overview

### Header Bar
- **Application Title**: Expert (top left)
- **Action Buttons** (top right):
  - **New Project**: Create a new project
  - **Import Project**: Load existing project
  - **Run Tests**: Execute application tests
  - **Settings**: Access configuration
  - **Manage Templates**: Template management
- **Active Profile Selector**: Dropdown to switch between profiles (e.g., "Flash")
- **Reader View Button**: Toggle reading mode (top right)

### Project Information Section
- **Project Title**: Large heading showing current project name
- **Project Details**: Root path and template information
- **Project Actions**:
  - **Delete Project**: Remove current project
  - **Export**: Save project in various formats
  - **Import**: Load content into project (three import types available)
  - **Edit**: Modify project settings

### Generation Panel
- **Story Concept Area**: Text input for generation prompts
- **Generation Controls**:
  - **Count**: Number of iterations
  - **Generate Button**: Start AI generation
  - **Include content**: Checkbox option
  - **Recursive**: Checkbox for recursive processing
  - **Generate All Children**: Option for batch processing

### Content Area
- **Large Text Editor**: Main content editing area with syntax highlighting
- **Story/Document Content**: Generated or edited text content
- **Show ratings**: Toggle for evaluation display

### Context Section (Bottom)
- **Context Display**: Shows "Progressively recursive in all children"
- **Extract Context Button**: Generate context information for AI

### Generation Options (Right Side)
- **Iteration Levels**: Level1, Level2, Level3, etc.
- **Quality Ratings**: Numerical evaluation system
- **Generation Settings**: Various AI generation parameters
- **Default Option**: Standard generation settings

---

## Project Management

### Creating Projects
1. Click **"New Project"** in the header bar
2. Choose from available templates (e.g., "Standard Novel")
3. Give your project a descriptive title
4. The project will be created with the selected template structure

### Project Structure
Projects are organized with the following elements:
- **Root Path**: Shows the project hierarchy (e.g., "Root: Book: Giants Of Greystone")
- **Template**: Indicates the project template used
- **Main Content**: Large text editing area for primary content
- **Generation Prompts**: Story concept and generation instructions

### Project Operations
- **Delete Project**: Remove the entire project (red button)
- **Export**: Save project in various formats (green button)
- **Import**: Load content from external sources with three options:
  - **Import Expert Project**: Load existing Expert project files
  - **Import Concept**: AI-powered analysis for concept extraction
  - **Import Hierarchical Document**: Pattern-based import creating structured hierarchy
- **Edit**: Access project settings and configuration

### Content Generation Workflow
1. **Enter Story Concept**: Define your content goals in the generation area
2. **Set Generation Parameters**: Choose count, recursion options
3. **Generate Content**: Click "Generate" to create AI content
4. **Review and Refine**: Edit generated content in the main text area
5. **Iterate**: Use different generation levels for refinement

### Project Persistence
- Projects are automatically saved to browser storage
- Active profile affects generation behavior
- Use Export feature for backups and sharing
- Content persists between sessions

---

## Document Import

Expert supports importing structured documents in multiple formats, automatically detecting hierarchy and creating a properly organized project. The system can import PDF files, Markdown documents, and plain text files with intelligent structure recognition.

### Import Options

When you click the "Import" button, you'll see three import options:

1. **Import Expert Project**: Load an existing Expert project (JSON format)
2. **Import Concept**: AI-powered analysis of documents for concept extraction
3. **Import Hierarchical Document**: Pattern-based import that creates structured project hierarchy

### Supported Document Formats

#### PDF Documents
- Any PDF with structured text content
- Headers, sections, and chapters will be automatically detected
- Text-based PDFs work best (not scanned images)
- File size limit: Reasonable size for browser processing

#### Markdown Documents
- Standard Markdown format (`.md` files)
- Headers (`#`, `##`, `###`, etc.) define hierarchy levels
- Nested structure supported up to 6 levels deep
- Content between headers becomes node content

#### Plain Text Documents
- Text files (`.txt`) with clear structural patterns
- Multiple header detection methods supported
- Works with various formatting conventions

### Document Structure Requirements

For successful hierarchical import, your documents should follow clear structural patterns:

#### Markdown Structure (Recommended)

```markdown
# Main Title or Book Title

Introduction or book overview content.

## Chapter 1: Beginning

Content for the first chapter goes here.

### Section 1.1: Character Introduction

Detailed content about characters.

### Section 1.2: Setting

Description of the setting.

## Chapter 2: Development

Content for the second chapter.

### Section 2.1: Plot Development

Story progression details.

# Part Two: Advanced Topics

Second major section of the document.

## Chapter 3: Resolution

Final chapter content.
```

#### Numbered Sections

```text
1. Executive Summary

Overview content for the entire document.

1.1. Project Goals

Specific goals and objectives.

1.2. Timeline

Project timeline information.

2. Technical Requirements

Technical specification details.

2.1. System Requirements

Hardware and software requirements.

2.1.1. Server Specifications

Detailed server requirements.

2.2. Implementation Steps

Step-by-step implementation guide.

3. Conclusion

Final thoughts and next steps.
```

#### Plain Text Headers

```text
PART ONE: FOUNDATION
====================

Introduction content for the first part.

Chapter 1: Getting Started
--------------------------

Content for the first chapter.

Section A: Prerequisites
~~~~~~~~~~~~~~~~~~~~~~~~

Prerequisites information.

Section B: Installation
~~~~~~~~~~~~~~~~~~~~~~~

Installation instructions.

Chapter 2: Advanced Topics
---------------------------

Advanced content here.

PART TWO: IMPLEMENTATION
========================

Second major section content.
```

#### Keyword-Based Sections

```text
Chapter 1: The Journey Begins

Chapter content describing the start of the journey.

Section 1: Preparation

Preparation details and requirements.

Section 2: First Steps

Initial steps in the process.

Chapter 2: Advanced Techniques

More advanced topics and techniques.

Episode 1: Troubleshooting

Common problems and solutions.

Episode 2: Best Practices

Recommended approaches and practices.
```

### Structure Detection Patterns

The import system recognizes these patterns for hierarchy detection:

#### Headers (Highest Confidence)
- **Markdown headers**: `#`, `##`, `###`, `####`, `#####`, `######`
- **Underlined headers**: Lines with `====` or `----` underneath
- **ALL CAPS headers**: Lines in ALL CAPITAL LETTERS

#### Numbering Systems (High Confidence)
- **Decimal numbering**: `1.`, `1.1.`, `1.1.1.`, `1.1.1.1.`
- **Roman numerals**: `I.`, `II.`, `III.`, `IV.`
- **Letter sequences**: `A.`, `B.`, `C.`, `a.`, `b.`, `c.`
- **Mixed systems**: `1.A.`, `1.A.i.`, etc.

#### Keywords (Medium Confidence)
- **Chapter**: "Chapter 1", "Chapter One", "Ch. 1"
- **Section**: "Section A", "Section 1.1", "Sect. 1"
- **Part**: "Part I", "Part One", "Part 1"
- **Book**: "Book 1", "Book I", "Book One"
- **Episode**: "Episode 1", "Ep. 1"
- **Volume**: "Volume 1", "Vol. 1"

#### Formatting (Lower Confidence)
- **Bold text**: `**Bold Header**` or similar formatting
- **Indentation**: Consistent spacing patterns
- **Special characters**: Lines with repeated characters (`===`, `---`, `***`)

### Import Process

1. **Select File**: Choose your document file (PDF, Markdown, or Plain Text)
2. **Automatic Detection**: The system analyzes the document structure
3. **Confidence Assessment**: Shows detection confidence percentage
4. **Preview Structure**: Review the detected hierarchy before import
5. **Import Confirmation**: Confirm or adjust the detected structure
6. **Project Creation**: A new project is created with the hierarchical structure

### Detection Confidence

The system provides confidence scores for detected structures:

- **90%+ (Excellent)**: Strong, clear patterns detected - high success rate
- **70-89% (Good)**: Solid structure with minor ambiguities
- **50-69% (Fair)**: Moderate structure detection - review recommended  
- **30-49% (Low)**: Weak patterns - manual review required
- **Below 30%**: Very low confidence - consider restructuring document

### Tips for Better Import Results

#### Document Preparation
1. **Use consistent formatting** throughout your document
2. **Clear header hierarchy**: Don't skip levels (e.g., don't go from `#` to `###`)
3. **Meaningful titles**: Use descriptive headers that reflect content
4. **Avoid mixed patterns**: Stick to one numbering/header system per document
5. **Proper spacing**: Leave blank lines around headers for clarity

#### Markdown Best Practices
- Start with a single `#` for the main title
- Use sequential header levels (`#`, `##`, `###`)
- Include content between headers (not just header lists)
- Use standard Markdown formatting

#### Plain Text Optimization
- Use consistent underlining patterns (`====` for main headers, `----` for subheaders)
- Maintain consistent indentation if using indented structures
- Use ALL CAPS sparingly for major section headers only
- Include clear content separation between sections

#### PDF Considerations
- Ensure text is selectable (not scanned images)
- Use consistent font sizes for headers
- Maintain clear visual hierarchy
- Avoid complex layouts with multiple columns

### Template Recommendations

Based on detected structure, Expert will suggest appropriate project templates:

- **Novel Template**: For books with chapters and scenes
- **Technical Manual**: For documentation with numbered sections
- **Report Template**: For business or academic reports
- **Custom Template**: Generated based on your specific structure

### Troubleshooting Import Issues

#### Low Confidence Detection
- **Check structure consistency**: Ensure headers follow patterns
- **Review formatting**: Look for mixed or inconsistent styles
- **Simplify structure**: Reduce complexity if too many patterns detected
- **Manual adjustment**: Edit document before import for clearer structure

#### Missing Content
- **Verify text selection**: Ensure text is selectable in PDFs
- **Check file encoding**: Use UTF-8 encoding for text files
- **Review file size**: Large files may have processing limitations
- **Format validation**: Ensure proper Markdown syntax

#### Incorrect Hierarchy
- **Review header levels**: Check for skipped or inconsistent levels
- **Validate numbering**: Ensure numbering sequences are logical
- **Check mixed patterns**: Avoid combining different structure systems
- **Consider manual editing**: Adjust structure before re-importing

### Import Limitations

- **File size**: Large documents may take longer to process
- **Complex layouts**: Multi-column or table-heavy documents may not import cleanly
- **Scanned PDFs**: Image-based PDFs require OCR processing
- **Mixed formats**: Documents combining multiple structure patterns may have lower confidence
- **Unicode support**: Special characters may need UTF-8 encoding

---

## Document Editing

### Content Editor
- **Large text area** for main content editing
- **Rich text display** with proper formatting
- **Structured content** with headings and sections
- **Auto-save** functionality preserves changes
- **Scroll support** for long documents

### Content Structure
The editor supports structured content including:
- **Story concepts and outlines**
- **Character descriptions** and development
- **Scene and chapter content**
- **Formatting elements** (headings, lists, emphasis)

### Editor Modes
- **Edit Mode**: Full editing capabilities with generation controls
- **Reader View**: Clean reading interface (toggle with Reader View button)
- **Generation Mode**: Focus on AI content creation
- **Review Mode**: Evaluate and refine generated content

### Content Management
- **Direct editing** in the main content area
- **Generation integration** with existing content
- **Content replacement** or appending options
- **Version management** through generation levels

---

## AI-Powered Features

### Content Generation Process
1. **Enter Story Concept**: Write your generation prompt in the story concept area
2. **Set Generation Count**: Choose number of iterations (e.g., Count: 3)
3. **Configure Options**:
   - **Include content**: Use existing content as context
   - **Recursive**: Apply generation recursively
4. **Click Generate** to start AI processing

### Generation Levels & Refinement
The application provides multiple generation levels for iterative improvement:
- **Level1, Level2, Level3**: Progressive refinement stages
- **Quality Ratings**: Numerical evaluation of generation quality
- **Default Settings**: Standard generation parameters
- **Custom Levels**: Specialized generation approaches

### AI Models & Profiles
- **Active Profile**: Select AI behavior profile (e.g., "Flash")
- **Profile-specific settings** affect generation style and quality
- **Model configuration** managed through Settings
- **Performance optimization** based on selected profile

### Context System
- **Automatic Context Extraction**: "Progressively recursive in all children"
- **Extract Context Button**: Generate context information for AI
- **Contextual Awareness**: AI considers existing content structure
- **Recursive Processing**: Apply context through document hierarchy

### Generation Controls
- **Generate Button**: Start single generation cycle
- **Generate All Children**: Batch process multiple elements
- **Show Ratings**: Display quality evaluation metrics
- **Reader View**: Switch to reading mode for review

---

## Settings & Configuration

Access the Settings dialog by clicking the **Settings** button in the header bar. The settings are organized into several sections that control all aspects of the application's behavior.

### Application Key Status
At the top of the settings dialog, you'll see your current application key status:
- **🟢 Valid Key**: Shows expiration date and days remaining
- **🟡 Expiring Soon**: Key expires within 7 days
- **🔴 Expired/Missing**: Key has expired or no valid key found

The key information updates in real-time and affects access to AI features.

### Profile Management
Profiles store complete configurations including AI models, quality criteria, and generation settings. This allows you to quickly switch between different writing approaches or use cases.

**Profile Operations:**
- **Create New Profile**: Save current settings as a new profile
- **Switch Profile**: Change to a different configuration instantly  
- **Delete Profile**: Remove unwanted profiles
- **Export Profile**: Download profile as JSON file for backup/sharing
- **Import Profile**: Load profile from JSON file
- **Duplicate Profile**: Create copy of existing profile for modification

**Profile Components:**
Each profile contains:
- Selected AI models for different purposes
- Custom quality criteria with scoring goals
- Maximum iteration settings
- AI prompt configurations

### AI Model Configuration
Configure which AI models to use for different generation tasks. The system supports OpenRouter API for access to multiple AI models.

**Setup Process:**
1. **Enter API Key**: Input your OpenRouter API key
2. **Test Connection**: Verify the API key works correctly
3. **Fetch Models**: Retrieve available models from OpenRouter
4. **Select Models**: Choose models for each purpose:
   - **Creator**: Main content generation model
   - **Rater**: Model for evaluating content quality
   - **Editor**: Model for refining and editing content

**Model Information:**
For each model, you'll see:
- Model name and provider
- Context window size (token capacity)
- Pricing per million tokens (input/output)
- Performance characteristics

**Security Note:**
API keys are stored in your browser's IndexedDB. Anyone with access to your browser profile can view stored keys.

### Quality Criteria System
Define detailed criteria for evaluating AI-generated content. Each criterion has a scoring goal (1-10) and controls when it's applied.

**Default Criteria Include:**
- **Prompt Adherence** (Goal: 9): Stays on topic and addresses the request
- **Clarity & Conciseness** (Goal: 7): Direct, easy to understand writing  
- **Natural & Authentic Tone** (Goal: 7): Human-sounding, not robotic
- **Engaging Flow** (Goal: 8): Interesting with smooth transitions
- **Varied Sentence Structure** (Goal: 7): Avoids monotonous patterns
- **Subtlety (Show, Don't Tell)** (Goal: 8): Implies rather than states directly
- **Avoids AI Clichés** (Goal: 8): No common AI phrases like "delve into"
- **Understated Language** (Goal: 8): Measured tone, not dramatic
- **Specificity & Concrete Detail** (Goal: 8): Specific examples vs. generalities
- **Original Phrasing** (Goal: 7): Avoids clichés and common idioms
- **Stylistic Variation** (Goal: 8): Natural rhythm and tone shifts
- **Emotional Subtlety** (Goal: 8): Layered emotions, not explicit
- **Lexical Character** (Goal: 8): Distinctive word choices
- **Human-like Naming** (Goal: 8): Realistic character names
- **Avoids Dramatical Reframing** (Goal: 8): No artificial elevation of ordinary actions

**Criteria Settings:**
- **Name**: Descriptive title for the criterion
- **Goal**: Target score from 1-10
- **Description**: Detailed explanation of what to evaluate
- **Outline**: Apply to outline/structural nodes
- **Leaf**: Apply to final content nodes

**Criteria Management:**
- **Add Criterion**: Create new evaluation standard
- **Edit Criteria**: Modify existing criteria in-place
- **Reset to Defaults**: Restore application defaults
- **Copy/Paste**: Share criteria between profiles or devices

### Generation Settings
Control how AI content generation behaves across the application.

**Max Iterations**: Set maximum refinement cycles (1-10)
- Higher values allow more polish but take longer
- Lower values provide faster results
- Default is typically 5 iterations

### AI Prompts Configuration  
Manage the prompts used for different AI generation tasks. The system includes various specialized prompts for different content types and generation approaches.

**Prompt Categories:**
- Content generation prompts
- Context extraction prompts  
- Quality evaluation prompts
- Editing and refinement prompts

**Prompt Management:**
- Edit prompts directly in the interface
- Auto-save functionality preserves changes
- Descriptions and placeholders guide customization
- Reset to defaults available for each prompt

### AI Logging System
Control whether AI conversations are logged and access historical data.

**Logging Options:**
- **Enable AI conversation logging**: Toggle logging on/off
- Logs include prompts, responses, timestamps, and metadata
- Useful for debugging generation issues
- Helps track AI model performance

**Log Management:**
- **View AI Logs**: Access complete conversation history
- Filter logs by date, model, or content type
- Export logs for analysis or backup
- Clear old logs to manage storage

**Privacy Note:**
AI logs are stored locally in your browser and include all prompts and responses. Disable logging if privacy is a concern.

### Settings Persistence
- **Auto-save**: Changes save automatically as you make them
- **Unsaved Changes Indicator**: Shows when changes haven't been saved
- **Profile Storage**: Settings persist between browser sessions
- **Cross-device Sync**: Use Export/Import to share settings between devices

### Settings Best Practices
1. **Create Profiles for Different Projects**: Different writing styles benefit from different configurations
2. **Test Model Changes**: Verify new models work as expected before important projects
3. **Backup Profiles**: Export important configurations before major changes
4. **Monitor Key Expiration**: Keep track of application key validity
5. **Adjust Criteria Gradually**: Small changes to quality criteria can have big impacts
6. **Use AI Logging for Debugging**: Enable logging when troubleshooting generation issues

### AI Logging
- **Enable/disable** detailed AI interaction logging
- **Review generation history**
- **Debug AI responses**
- **Performance tracking**

---

## Templates

### Using Templates
1. **Select template** when creating new project
2. **Pre-configured structure** with example content
3. **Customizable** to your specific needs
4. **Starting point** for common document types

### Template Types
- **Research Papers**: Academic writing structure
- **Business Reports**: Professional document format
- **Creative Writing**: Fiction and narrative templates
- **Documentation**: Technical writing templates
- **Custom**: Create your own templates

### Template Editor
- **Modify existing** templates to suit your needs
- **Create new** templates from successful projects
- **Share templates** between projects
- **Template library** management

---

## Export Functionality

### Export Formats
- **HTML**: Web-ready format with styling
- **Markdown**: Plain text with formatting markup
- **Plain Text**: Clean text without formatting
- **Reimport**: Expert native format for backup

### Export Scope
- **Single Document**: Export just one node
- **Hierarchy**: Export node and all children
- **Leaves Only**: Export only bottom-level documents

### Export Process
1. **Right-click** target node or use Export button
2. **Choose export format**
3. **Select scope** (single/hierarchy/leaves)
4. **Configure options** (if available)
5. **Download** generated file

---

## Troubleshooting

### Common Issues

#### Authentication Problems
- **Key not accepted**: Verify key format and expiration
- **Access denied**: Check if key has expired
- **Generator not working**: Clear browser cache and try again

#### Performance Issues
- **Slow loading**: Check internet connection
- **AI timeouts**: Try reducing context size or changing models
- **Browser freezing**: Close other tabs and refresh

#### Data Loss Prevention
- **Regular exports**: Backup important projects
- **Browser storage**: Don't clear browser data unnecessarily
- **Multiple profiles**: Use different profiles for different projects

### Browser Compatibility
- **Chrome**: Fully supported
- **Firefox**: Fully supported  
- **Safari**: Supported with minor limitations
- **Edge**: Fully supported
- **Mobile browsers**: Limited functionality

### Getting Help
1. **Check this manual** for common solutions
2. **Review AI logs** for generation issues
3. **Try different browser** if problems persist
4. **Clear browser cache** as last resort
5. **Contact support** with specific error messages

---


## Best Practices

### Project Organization
- **Use descriptive names** for documents and projects
- **Logical hierarchy** that reflects your content structure
- **Regular exports** to prevent data loss
- **Consistent naming** conventions

### AI Usage
- **Clear instructions** in quality criteria
- **Appropriate context** size for generation
- **Review and refine** AI output
- **Iterate gradually** rather than generating large sections

### Performance Optimization
- **Close unused projects** to save memory
- **Regular browser maintenance** (clear cache occasionally)
- **Moderate document size** to maintain responsiveness
- **Export and archive** completed projects

---

## Version Information

This manual covers Expert Application features as of the current release. The application is actively developed with regular updates and improvements.

For the latest information and updates, check the application's built-in help system or contact support.

---

*© 2024 Expert Application - User Manual v1.0* 

## Table of Contents
1. [Getting Started](#getting-started)
2. [Authentication & Key Management](#authentication--key-management)
3. [Main Interface Overview](#main-interface-overview)
4. [Project Management](#project-management)
5. [Document Editing](#document-editing)
6. [AI-Powered Features](#ai-powered-features)
7. [Settings & Configuration](#settings--configuration)
8. [Templates](#templates)
9. [Export Functionality](#export-functionality)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

### System Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for AI features
- Valid Expert application key

### First Time Setup
1. Navigate to the Expert application URL
2. You'll be prompted to enter an application key
3. Enter your key in the validation modal
4. The application will start once authenticated
5. In the settings dialog you need to set up your OpenRouter key and the used models for each purpose.

---

## Main Interface Overview

### Header Bar
- **Application Title**: Expert (top left)
- **Action Buttons** (top right):
  - **New Project**: Create a new project
  - **Import Project**: Load existing project
  - **Run Tests**: Execute application tests
  - **Settings**: Access configuration
  - **Manage Templates**: Template management
- **Active Profile Selector**: Dropdown to switch between profiles (e.g., "Flash")
- **Reader View Button**: Toggle reading mode (top right)

### Project Information Section
- **Project Title**: Large heading showing current project name
- **Project Details**: Root path and template information
- **Project Actions**:
  - **Delete Project**: Remove current project
  - **Export**: Save project in various formats
  - **Import**: Load content into project
  - **Edit**: Modify project settings

### Generation Panel
- **Story Concept Area**: Text input for generation prompts
- **Generation Controls**:
  - **Count**: Number of iterations
  - **Generate Button**: Start AI generation
  - **Include content**: Checkbox option
  - **Recursive**: Checkbox for recursive processing
  - **Generate All Children**: Option for batch processing

### Content Area
- **Large Text Editor**: Main content editing area with syntax highlighting
- **Story/Document Content**: Generated or edited text content
- **Show ratings**: Toggle for evaluation display

### Context Section (Bottom)
- **Context Display**: Shows "Progressively recursive in all children"
- **Extract Context Button**: Generate context information for AI

### Generation Options (Right Side)
- **Iteration Levels**: Level1, Level2, Level3, etc.
- **Quality Ratings**: Numerical evaluation system
- **Generation Settings**: Various AI generation parameters
- **Default Option**: Standard generation settings

---

## Project Management

### Creating Projects
1. Click **"New Project"** in the header bar
2. Choose from available templates (e.g., "Standard Novel")
3. Give your project a descriptive title
4. The project will be created with the selected template structure

### Project Structure
Projects are organized with the following elements:
- **Root Path**: Shows the project hierarchy (e.g., "Root: Book: Giants Of Greystone")
- **Template**: Indicates the project template used
- **Main Content**: Large text editing area for primary content
- **Generation Prompts**: Story concept and generation instructions

### Project Operations
- **Delete Project**: Remove the entire project (red button)
- **Export**: Save project in various formats (green button)
- **Import**: Load content from external sources
- **Edit**: Access project settings and configuration

### Content Generation Workflow
1. **Enter Story Concept**: Define your content goals in the generation area
2. **Set Generation Parameters**: Choose count, recursion options
3. **Generate Content**: Click "Generate" to create AI content
4. **Review and Refine**: Edit generated content in the main text area
5. **Iterate**: Use different generation levels for refinement

### Project Persistence
- Projects are automatically saved to browser storage
- Active profile affects generation behavior
- Use Export feature for backups and sharing
- Content persists between sessions

---

## Document Editing

### Content Editor
- **Large text area** for main content editing
- **Rich text display** with proper formatting
- **Structured content** with headings and sections
- **Auto-save** functionality preserves changes
- **Scroll support** for long documents

### Content Structure
The editor supports structured content including:
- **Story concepts and outlines**
- **Character descriptions** and development
- **Scene and chapter content**
- **Formatting elements** (headings, lists, emphasis)

### Editor Modes
- **Edit Mode**: Full editing capabilities with generation controls
- **Reader View**: Clean reading interface (toggle with Reader View button)
- **Generation Mode**: Focus on AI content creation
- **Review Mode**: Evaluate and refine generated content

### Content Management
- **Direct editing** in the main content area
- **Generation integration** with existing content
- **Content replacement** or appending options
- **Version management** through generation levels

---

## AI-Powered Features

### Content Generation Process
1. **Enter Story Concept**: Write your generation prompt in the story concept area
2. **Set Generation Count**: Choose number of iterations (e.g., Count: 3)
3. **Configure Options**:
   - **Include content**: Use existing content as context
   - **Recursive**: Apply generation recursively
4. **Click Generate** to start AI processing

### Generation Levels & Refinement
The application provides multiple generation levels for iterative improvement:
- **Level1, Level2, Level3**: Progressive refinement stages
- **Quality Ratings**: Numerical evaluation of generation quality
- **Default Settings**: Standard generation parameters
- **Custom Levels**: Specialized generation approaches

### AI Models & Profiles
- **Active Profile**: Select AI behavior profile (e.g., "Flash")
- **Profile-specific settings** affect generation style and quality
- **Model configuration** managed through Settings
- **Performance optimization** based on selected profile

### Context System
- **Automatic Context Extraction**: "Progressively recursive in all children"
- **Extract Context Button**: Generate context information for AI
- **Contextual Awareness**: AI considers existing content structure
- **Recursive Processing**: Apply context through document hierarchy

### Generation Controls
- **Generate Button**: Start single generation cycle
- **Generate All Children**: Batch process multiple elements
- **Show Ratings**: Display quality evaluation metrics
- **Reader View**: Switch to reading mode for review

---

## Settings & Configuration

Access the Settings dialog by clicking the **Settings** button in the header bar. The settings are organized into several sections that control all aspects of the application's behavior.

### Application Key Status
At the top of the settings dialog, you'll see your current application key status:
- **🟢 Valid Key**: Shows expiration date and days remaining
- **🟡 Expiring Soon**: Key expires within 7 days
- **🔴 Expired/Missing**: Key has expired or no valid key found

The key information updates in real-time and affects access to AI features.

### Profile Management
Profiles store complete configurations including AI models, quality criteria, and generation settings. This allows you to quickly switch between different writing approaches or use cases.

**Profile Operations:**
- **Create New Profile**: Save current settings as a new profile
- **Switch Profile**: Change to a different configuration instantly  
- **Delete Profile**: Remove unwanted profiles
- **Export Profile**: Download profile as JSON file for backup/sharing
- **Import Profile**: Load profile from JSON file
- **Duplicate Profile**: Create copy of existing profile for modification

**Profile Components:**
Each profile contains:
- Selected AI models for different purposes
- Custom quality criteria with scoring goals
- Maximum iteration settings
- AI prompt configurations

### AI Model Configuration
Configure which AI models to use for different generation tasks. The system supports OpenRouter API for access to multiple AI models.

**Setup Process:**
1. **Enter API Key**: Input your OpenRouter API key
2. **Test Connection**: Verify the API key works correctly
3. **Fetch Models**: Retrieve available models from OpenRouter
4. **Select Models**: Choose models for each purpose:
   - **Creator**: Main content generation model
   - **Rater**: Model for evaluating content quality
   - **Editor**: Model for refining and editing content

**Model Information:**
For each model, you'll see:
- Model name and provider
- Context window size (token capacity)
- Pricing per million tokens (input/output)
- Performance characteristics

**Security Note:**
API keys are stored in your browser's IndexedDB. Anyone with access to your browser profile can view stored keys.

### Quality Criteria System
Define detailed criteria for evaluating AI-generated content. Each criterion has a scoring goal (1-10) and controls when it's applied.

**Default Criteria Include:**
- **Prompt Adherence** (Goal: 9): Stays on topic and addresses the request
- **Clarity & Conciseness** (Goal: 7): Direct, easy to understand writing  
- **Natural & Authentic Tone** (Goal: 7): Human-sounding, not robotic
- **Engaging Flow** (Goal: 8): Interesting with smooth transitions
- **Varied Sentence Structure** (Goal: 7): Avoids monotonous patterns
- **Subtlety (Show, Don't Tell)** (Goal: 8): Implies rather than states directly
- **Avoids AI Clichés** (Goal: 8): No common AI phrases like "delve into"
- **Understated Language** (Goal: 8): Measured tone, not dramatic
- **Specificity & Concrete Detail** (Goal: 8): Specific examples vs. generalities
- **Original Phrasing** (Goal: 7): Avoids clichés and common idioms
- **Stylistic Variation** (Goal: 8): Natural rhythm and tone shifts
- **Emotional Subtlety** (Goal: 8): Layered emotions, not explicit
- **Lexical Character** (Goal: 8): Distinctive word choices
- **Human-like Naming** (Goal: 8): Realistic character names
- **Avoids Dramatical Reframing** (Goal: 8): No artificial elevation of ordinary actions

**Criteria Settings:**
- **Name**: Descriptive title for the criterion
- **Goal**: Target score from 1-10
- **Description**: Detailed explanation of what to evaluate
- **Outline**: Apply to outline/structural nodes
- **Leaf**: Apply to final content nodes

**Criteria Management:**
- **Add Criterion**: Create new evaluation standard
- **Edit Criteria**: Modify existing criteria in-place
- **Reset to Defaults**: Restore application defaults
- **Copy/Paste**: Share criteria between profiles or devices

### Generation Settings
Control how AI content generation behaves across the application.

**Max Iterations**: Set maximum refinement cycles (1-10)
- Higher values allow more polish but take longer
- Lower values provide faster results
- Default is typically 5 iterations

### AI Prompts Configuration  
Manage the prompts used for different AI generation tasks. The system includes various specialized prompts for different content types and generation approaches.

**Prompt Categories:**
- Content generation prompts
- Context extraction prompts  
- Quality evaluation prompts
- Editing and refinement prompts

**Prompt Management:**
- Edit prompts directly in the interface
- Auto-save functionality preserves changes
- Descriptions and placeholders guide customization
- Reset to defaults available for each prompt

### AI Logging System
Control whether AI conversations are logged and access historical data.

**Logging Options:**
- **Enable AI conversation logging**: Toggle logging on/off
- Logs include prompts, responses, timestamps, and metadata
- Useful for debugging generation issues
- Helps track AI model performance

**Log Management:**
- **View AI Logs**: Access complete conversation history
- Filter logs by date, model, or content type
- Export logs for analysis or backup
- Clear old logs to manage storage

**Privacy Note:**
AI logs are stored locally in your browser and include all prompts and responses. Disable logging if privacy is a concern.

### Settings Persistence
- **Auto-save**: Changes save automatically as you make them
- **Unsaved Changes Indicator**: Shows when changes haven't been saved
- **Profile Storage**: Settings persist between browser sessions
- **Cross-device Sync**: Use Export/Import to share settings between devices

### Settings Best Practices
1. **Create Profiles for Different Projects**: Different writing styles benefit from different configurations
2. **Test Model Changes**: Verify new models work as expected before important projects
3. **Backup Profiles**: Export important configurations before major changes
4. **Monitor Key Expiration**: Keep track of application key validity
5. **Adjust Criteria Gradually**: Small changes to quality criteria can have big impacts
6. **Use AI Logging for Debugging**: Enable logging when troubleshooting generation issues

### AI Logging
- **Enable/disable** detailed AI interaction logging
- **Review generation history**
- **Debug AI responses**
- **Performance tracking**

---

## Templates

### Using Templates
1. **Select template** when creating new project
2. **Pre-configured structure** with example content
3. **Customizable** to your specific needs
4. **Starting point** for common document types

### Template Types
- **Research Papers**: Academic writing structure
- **Business Reports**: Professional document format
- **Creative Writing**: Fiction and narrative templates
- **Documentation**: Technical writing templates
- **Custom**: Create your own templates

### Template Editor
- **Modify existing** templates to suit your needs
- **Create new** templates from successful projects
- **Share templates** between projects
- **Template library** management

---

## Export Functionality

### Export Formats
- **HTML**: Web-ready format with styling
- **Markdown**: Plain text with formatting markup
- **Plain Text**: Clean text without formatting
- **Reimport**: Expert native format for backup

### Export Scope
- **Single Document**: Export just one node
- **Hierarchy**: Export node and all children
- **Leaves Only**: Export only bottom-level documents

### Export Process
1. **Right-click** target node or use Export button
2. **Choose export format**
3. **Select scope** (single/hierarchy/leaves)
4. **Configure options** (if available)
5. **Download** generated file

---

## Troubleshooting

### Common Issues

#### Authentication Problems
- **Key not accepted**: Verify key format and expiration
- **Access denied**: Check if key has expired
- **Generator not working**: Clear browser cache and try again

#### Performance Issues
- **Slow loading**: Check internet connection
- **AI timeouts**: Try reducing context size or changing models
- **Browser freezing**: Close other tabs and refresh

#### Data Loss Prevention
- **Regular exports**: Backup important projects
- **Browser storage**: Don't clear browser data unnecessarily
- **Multiple profiles**: Use different profiles for different projects

### Browser Compatibility
- **Chrome**: Fully supported
- **Firefox**: Fully supported  
- **Safari**: Supported with minor limitations
- **Edge**: Fully supported
- **Mobile browsers**: Limited functionality

### Getting Help
1. **Check this manual** for common solutions
2. **Review AI logs** for generation issues
3. **Try different browser** if problems persist
4. **Clear browser cache** as last resort
5. **Contact support** with specific error messages

---


## Best Practices

### Project Organization
- **Use descriptive names** for documents and projects
- **Logical hierarchy** that reflects your content structure
- **Regular exports** to prevent data loss
- **Consistent naming** conventions

### AI Usage
- **Clear instructions** in quality criteria
- **Appropriate context** size for generation
- **Review and refine** AI output
- **Iterate gradually** rather than generating large sections

### Performance Optimization
- **Close unused projects** to save memory
- **Regular browser maintenance** (clear cache occasionally)
- **Moderate document size** to maintain responsiveness
- **Export and archive** completed projects

---

## Version Information

This manual covers Expert Application features as of the current release. The application is actively developed with regular updates and improvements.

For the latest information and updates, check the application's built-in help system or contact support.

---

*© 2024 Expert Application - User Manual v1.0* 