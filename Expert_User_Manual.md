# Expert Application - User Manual

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