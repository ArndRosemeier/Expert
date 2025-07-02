# AI Project Creation System - Implementation Plan

## 🎯 **Vision**
Transform the new project experience from manual template selection to intelligent AI-powered project generation that creates comprehensive project structures, templates, and context based on natural language descriptions.

## 📋 **Revised Core Requirements**

### **Enhanced New Project Dialog**
- Tabbed approach: Manual tab (unchanged) + AI tab
- AI tab: Natural language project description input
- AI generation creates: **Content**, **Template**, **Context**

### **Simplified JSON Response Structure**
```json
{
  "Content": "Detailed project outline and structure",
  "Template": {
    "name": "Generated Template Name",
    "hierarchyLevels": ["Level1", "Level2", "Level3"],
    "scaffoldingDocuments": ["Doc1", "Doc2"]
  },
  "Context": "All relevant contextual information - may include style guides for any project type, character information for narratives, methodology for research, financial considerations for business plans, etc. Only include what's relevant to the specific project."
}
```

### **Template Layer Clarification**

**How Numbers Work in Template Layers:**
- **Layer name WITHOUT number** = Flexible (unlimited nodes)
  - `"Chapter"` = any number of chapters can be created
  - `"Section"` = any number of sections can be created
  
- **Layer name WITH number** = Fixed (exact count enforced)
  - `"Chapter 12"` = exactly 12 chapters must be created
  - `"Section 7"` = exactly 7 sections must be created

**Examples:**
- **Flexible structure**: `["Story", "Chapter", "Scene"]` = unlimited chapters, unlimited scenes
- **Fixed structure**: `["Story", "Chapter 12", "Scene"]` = exactly 12 chapters, unlimited scenes per chapter  
- **Mixed structure**: `["Business Plan", "Section 7", "Subsection", "Detail"]` = exactly 7 main sections, unlimited subsections and details

**Template Design Rules:**
- Use numbers only when the structure requires a specific count
- Most creative projects should use flexible layers
- Business/academic projects often benefit from fixed structures
- Numbers enforce structure but reduce flexibility

## 🏗️ **Architecture Overview**

### **New Components**
```
src/ui/modals/
├── NewProjectModal.ts (enhanced)
├── components/
│   ├── AIProjectCreator.ts (new)
│   └── ManualProjectCreator.ts (extracted)
└── services/
    ├── ProjectGenerationService.ts (new)
    └── TemplateGenerationService.ts (new)

src/project/
├── AIProjectGenerator.ts (new)
└── SmartContentParser.ts (new)

src/prompts/
└── ProjectCreationPrompts.ts (new)
```

---

## 📝 **Detailed Implementation Plan**

### **Phase 1: Core Infrastructure**

#### **1. Enhanced New Project Dialog**
**File**: `src/ui/modals/NewProjectModal.ts`

**Changes:**
- Convert to tabbed interface using existing tab component pattern
- Split current functionality into `ManualProjectCreator` component
- Add new `AIProjectCreator` component
- Maintain backward compatibility

**Implementation:**
```typescript
export class NewProjectModal extends BaseModal {
    private activeTab: 'manual' | 'ai' = 'manual';
    private manualCreator: ManualProjectCreator;
    private aiCreator: AIProjectCreator;
    
    protected renderContent(): string {
        return `
            <div class="tab-container">
                <div class="tab-header">
                    <button class="tab-btn ${this.activeTab === 'manual' ? 'active' : ''}" 
                            data-tab="manual">📝 Manual Setup</button>
                    <button class="tab-btn ${this.activeTab === 'ai' ? 'active' : ''}" 
                            data-tab="ai">🤖 AI Creation</button>
                </div>
                <div class="tab-content">
                    ${this.activeTab === 'manual' ? this.manualCreator.render() : this.aiCreator.render()}
                </div>
            </div>
        `;
    }
}
```

#### **1.2 Manual Project Creator Component**
**File**: `src/ui/modals/components/ManualProjectCreator.ts`

**Purpose**: Extract current new project dialog functionality into reusable component
- Template selection dropdown
- Project title input
- Create button
- Validation logic

#### **1.3 AI Project Creator Component**
**File**: `src/ui/modals/components/AIProjectCreator.ts`

**Purpose**: New AI-powered project creation interface
```typescript
export class AIProjectCreator {
    render(): string {
        return `
            <div class="ai-project-creator">
                <div class="description-section">
                    <label for="project-description">🤖 Describe Your Project</label>
                    <textarea id="project-description" 
                              placeholder="Example: A fantasy novel about a young wizard discovering ancient magic in modern Tokyo. The story should have 5 main characters, follow a 3-act structure, and blend Japanese folklore with contemporary urban setting..."
                              rows="6"></textarea>
                    <div class="helper-text">
                        💡 Be as detailed as possible! Include genre, themes, structure preferences, character count, setting, target audience, or any specific requirements.
                    </div>
                </div>
                
                <div class="generation-options">
                    <h4>🎯 Generation Options</h4>
                    <div class="option-group">
                        <label>
                            <input type="checkbox" id="detailed-outline" checked>
                            📋 Create detailed project outline
                        </label>
                    </div>
                    <div class="option-note">
                        💡 <strong>Note:</strong> Style guides and character information (for stories) are automatically included based on your project type.
                    </div>
                </div>
                
                <div class="action-buttons">
                    <button id="generate-project-btn" class="button button-primary">
                        🚀 Generate Project Structure
                    </button>
                </div>
                
                <div id="generation-progress" class="progress-section" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="progress-text">Analyzing project requirements...</div>
                </div>
            </div>
        `;
    }
}
```

### **Phase 2: AI Generation Engine**

#### **2.1 Project Generation Service**
**File**: `src/ui/modals/services/ProjectGenerationService.ts`

**Purpose**: Orchestrate AI project creation workflow
```typescript
export class ProjectGenerationService {
    async generateProject(description: string, options: ProjectGenerationOptions): Promise<GeneratedProject> {
        // 1. Generate project structure using AI
        const projectData = await this.aiProjectGenerator.generateProjectStructure(description, options);
        
        // 2. Parse and validate the response
        const parsedProject = this.parseProjectResponse(projectData);
        
        // 3. Create project with generated template
        const project = await this.createProjectFromGeneration(parsedProject);
        
        return project;
    }
}
```

#### **2.2 AI Project Generator**
**File**: `src/project/AIProjectGenerator.ts`

**Purpose**: Core AI logic for project structure generation
```typescript
export class AIProjectGenerator {
    async generateProjectStructure(description: string, options: ProjectGenerationOptions): Promise<string> {
        const prompt = this.buildProjectGenerationPrompt(description, options);
        
        // Use current OpenRouter client for generation
        const response = await this.openRouterClient.generateContent({
            model: this.getCreatorModel(),
            prompt: prompt,
            maxTokens: 4000 // Larger response for comprehensive projects
        });
        
        return response;
    }
}
```

#### **2.3 Project Creation Prompts**
**File**: `src/prompts/ProjectCreationPrompts.ts`

**Purpose**: Sophisticated prompts for project generation
```typescript
export class ProjectCreationPrompts {
    static buildProjectGenerationPrompt(description: string, options: ProjectGenerationOptions): string {
        return `You are an expert project planner and creative writing consultant. Based on the user's description, create a comprehensive project structure.

USER DESCRIPTION:
${description}

YOUR TASK:
Generate a complete project structure based on the user's description. Return your response as a JSON object with this exact structure:

{
    "Content": "Detailed project outline and structure description",
    "Template": {
        "name": "Template Name",
        "hierarchyLevels": ["Level1", "Level2", "Level3"],
        "scaffoldingDocuments": ["Doc1", "Doc2"]
    },
    "Context": "All relevant contextual information for this project type - may include style guides, character information (for narratives), methodology (for research), financial considerations (for business), etc."
}

TEMPLATE RULES:
- Flexible layers: ["Story", "Chapter", "Scene"] = any number of chapters
- Fixed layers: ["Story", "Chapter 12", "Scene"] = exactly 12 chapters  
- Use fixed numbers only when specifically requested or structurally important

CONTEXT GUIDELINES:
- Include information that helps maintain project consistency
- For narratives: may include character details, world-building, themes, style guide
- For business: may include target market, financial considerations, strategy, style guide
- For research: may include methodology, variables, ethical considerations, style guide
- Always include a style guide appropriate to the project type
- Only include what's actually relevant to the specific project

${this.getTemplateExamples()}

Return ONLY the JSON object, no additional commentary.`;
    }

    private static getTemplateExamples(): string {
        return `
NOVEL: ["Book", "Part", "Chapter", "Scene"]
RESEARCH: ["Study", "Phase", "Topic", "Subtopic"]
BUSINESS: ["Plan", "Section", "Strategy", "Action"]
SCREENPLAY: ["Script", "Act", "Scene", "Beat"]
COURSE: ["Course", "Module", "Lesson", "Exercise"]
GAME: ["Game", "Chapter", "Level", "Challenge"]
COOKBOOK: ["Cookbook", "Category", "Recipe", "Step"]
TRAVEL: ["Guide", "Destination", "Activity", "Detail"]
TECHNICAL: ["Documentation", "Section", "Feature", "Implementation"]
        `;
    }
}
```

### **Phase 3: Smart Content Parser**

#### **3.1 Enhanced Node Generation**
**File**: `src/project/SmartContentParser.ts`

**Purpose**: Detect and parse JSON responses from LLM
```typescript
export class SmartContentParser {
    static parseGenerationResponse(response: string): ParsedContent {
        try {
            // Try to extract JSON from response
            const jsonMatch = this.extractJson(response);
            
            if (jsonMatch) {
                return {
                    hasStructuredData: true,
                    content: jsonMatch.content || response,
                    context: jsonMatch.context || '',
                    metadata: jsonMatch.metadata || {}
                };
            }
        } catch (error) {
            console.log('No structured JSON found, using raw response');
        }
        
        // Fallback to current behavior
        return {
            hasStructuredData: false,
            content: response,
            context: '',
            metadata: {}
        };
    }
    
    private static extractJson(text: string): any | null {
        // Multiple strategies to find JSON in response
        const strategies = [
            // Look for ```json blocks
            /```json\s*(\{[\s\S]*?\})\s*```/i,
            // Look for plain JSON objects
            /(\{[\s\S]*?"content"[\s\S]*?\})/i,
            // Look for any valid JSON object
            /(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/
        ];
        
        for (const pattern of strategies) {
            const match = text.match(pattern);
            if (match) {
                try {
                    return JSON.parse(match[1]);
                } catch (e) {
                    continue;
                }
            }
        }
        
        return null;
    }
}
```

#### **3.2 Integration with Generation Service**
**File**: `src/project/GenerationService.ts` (modify existing)

**Enhancement**: Add smart parsing to existing generation methods
```typescript
// In existing generateNodeContent method
const response = await this.openRouterClient.generateContent(params);

// NEW: Smart parsing
const parsedContent = SmartContentParser.parseGenerationResponse(response);

if (parsedContent.hasStructuredData) {
    // Use structured data
    node.content = parsedContent.content;
    if (parsedContent.context) {
        node.context = parsedContent.context;
    }
    // Handle any additional metadata
} else {
    // Current behavior
    node.content = response;
}
```

### **Phase 4: Enhanced Prompts for Structured Responses**

#### **4.1 Structured Content Prompts**
Add to existing generation prompts to encourage JSON responses when beneficial:

```typescript
// Example addition to content generation prompts
const structuredPromptSuffix = `

OPTIONAL: If your response would benefit from additional context or metadata, you may structure it as JSON:
{
    "content": "Main content here",
    "context": "Additional context or background",
    "notes": "Any development notes"
}

Otherwise, provide your response as plain text.`;
```

### **3. Template Examples for AI Learning**

**Novel Template (Flexible Structure):**
```json
{
  "Content": "Epic fantasy story set in modern Tokyo where ancient magic awakens...",
  "Template": {
    "name": "Fantasy Novel Structure",
    "hierarchyLevels": ["Novel", "Chapter", "Scene"],
    "scaffoldingDocuments": ["Character Profiles", "World Building", "Magic System"]
  },
  "Context": "CHARACTERS:\n- Protagonist: Kenji (17, discovers magical heritage)\n- Mentor: Ancient dragon spirit\n\nSTYLE GUIDE:\n- Voice: Third person limited\n- Tone: Dark urban fantasy\n- Themes: Tradition vs modernity, coming of age\n\nWORLD BUILDING:\n- Modern Tokyo with hidden magical realm\n- Ancient spirits awakening due to urban expansion"
}
```

**Business Plan Template (Fixed Structure):**
```json
{
  "Content": "Comprehensive business plan for sustainable coffee shop focusing on local community...",
  "Template": {
    "name": "Business Plan Structure", 
    "hierarchyLevels": ["Business Plan", "Section 7", "Subsection", "Detail"],
    "scaffoldingDocuments": ["Executive Summary", "Financial Projections", "Market Research"]
  },
  "Context": "TARGET MARKET:\n- Local professionals and students\n- Environmentally conscious consumers\n\nUNIQUE VALUE PROPOSITION:\n- Zero-waste operations\n- Local supplier partnerships\n- Community workspace\n\nFINANCIAL PROJECTIONS:\n- Initial investment: $150K\n- Break-even: Month 18\n- Revenue streams: Coffee sales, workspace rental, events"
}
```

**Research Study Template (Flexible Structure):**
```json
{
  "Content": "Comprehensive study on climate change impacts on urban biodiversity...",
  "Template": {
    "name": "Research Study Structure",
    "hierarchyLevels": ["Research Study", "Chapter", "Section", "Finding"],
    "scaffoldingDocuments": ["Abstract", "Literature Review", "Methodology", "Appendices"]
  },
  "Context": "RESEARCH METHODOLOGY:\n- Mixed methods approach\n- Quantitative biodiversity surveys\n- Qualitative stakeholder interviews\n\nKEY VARIABLES:\n- Species diversity indices\n- Urban development density\n- Temperature and precipitation data\n\nETHICAL CONSIDERATIONS:\n- Environmental impact minimization\n- Community engagement protocols"
}
```

**3-Act Story Template (Fixed Acts, Flexible Scenes):**
```json
{
  "Content": "Mystery thriller with classic three-act structure...",
  "Template": {
    "name": "Three-Act Story Structure",
    "hierarchyLevels": ["Story", "Act 3", "Scene"],
    "scaffoldingDocuments": ["Character Arcs", "Plot Outline", "Clue Timeline"]
  },
  "Context": "STRUCTURE RATIONALE:\n- Act 1: Setup and inciting incident (25%)\n- Act 2: Rising action and complications (50%)\n- Act 3: Climax and resolution (25%)\n\nSTYLE GUIDE:\n- Voice: Third person omniscient\n- Tone: Suspenseful and atmospheric\n- Pacing: Escalating tension with strategic reveals\n\nMYSTERY ELEMENTS:\n- Red herrings and misdirection\n- Clue placement and revelation timing\n- Character motivation and secrets"
}
```

**12-Chapter Book Template (Fixed Chapters):**
```json
{
  "Content": "Self-help book with structured personal development journey...",
  "Template": {
    "name": "12-Chapter Personal Development Guide",
    "hierarchyLevels": ["Book", "Chapter 12", "Section", "Exercise"],
    "scaffoldingDocuments": ["Introduction", "Assessment Tools", "Progress Tracker", "Resources"]
  },
  "Context": "STRUCTURE RATIONALE:\n- 12 chapters = one per month for yearly transformation\n- Each chapter builds on previous concepts\n- Progressive skill development\n\nSTYLE GUIDE:\n- Voice: Encouraging and practical\n- Tone: Professional yet accessible\n- Format: Theory + practical exercises\n\nTARGET AUDIENCE:\n- Adults seeking personal growth\n- 25-45 age range\n- Professional development focus"
}
```

**Cookbook Template (Flexible Categories):**
```json
{
  "Content": "Mediterranean cuisine cookbook featuring seasonal ingredients...",
  "Template": {
    "name": "Mediterranean Cookbook",
    "hierarchyLevels": ["Cookbook", "Category", "Recipe", "Step"],
    "scaffoldingDocuments": ["Introduction", "Ingredient Guide", "Techniques", "Index"]
  },
  "Context": "CULINARY APPROACH:\n- Seasonal ingredient focus\n- Traditional techniques with modern adaptations\n- Dietary variations included (vegetarian, gluten-free)\n\nSTYLE GUIDE:\n- Voice: Warm and encouraging\n- Tone: Authentic Mediterranean hospitality\n- Format: Story + recipe + technique tips\n\nCATEGORIES:\n- Appetizers & Mezze\n- Soups & Salads  \n- Main Dishes\n- Desserts & Sweets\n- Beverages"
}
```



---

## 🎨 **User Experience Flow**

### **AI Project Creation Flow**
1. **User opens New Project dialog**
2. **Selects AI tab**
3. **Describes project in natural language**
4. **Configures generation options**
5. **Clicks "Generate Project"**
6. **System shows progress indicators**
7. **AI generates comprehensive project structure**
8. **User reviews generated template and context**
9. **Project is created with custom template**
10. **User can immediately start working**

### **Enhanced Node Generation Flow**
1. **User generates content for any node**
2. **System analyzes LLM response**
3. **If JSON detected**: Extracts content and context separately
4. **If no JSON**: Uses current behavior
5. **Content and context are updated appropriately**

---

## 🧪 **Implementation Phases**

### **Phase 1: Foundation** ✅ **COMPLETE**
- [x] Tabbed NewProjectModal with Manual and AI tabs
- [x] ManualProjectCreator component 
- [x] AIProjectCreator component with beautiful UI
- [x] ProjectGenerationService with mock generation
- [x] Basic project type inference and template generation

### **Phase 2: AI Generation Engine** 🔄 **IN PROGRESS**
**Next Steps:**
- [ ] Update ProjectGenerationService for simplified JSON structure
- [ ] Create sophisticated AI prompts with template examples
- [ ] Implement robust JSON parsing with multiple fallback strategies
- [ ] Add template layer parsing (flexible vs fixed)

### **Phase 3: Smart Content Parser**
- [ ] Enhanced node generation with JSON detection
- [ ] Backward compatibility with existing text-based generation
- [ ] Smart content extraction from AI responses

### **Phase 4: Polish & Testing**
- [ ] Error handling and validation
- [ ] Progress indicators and user feedback
- [ ] Performance optimization
- [ ] Comprehensive testing

## **AI Prompt Strategy**

### **System Prompt Template**
```
You are a project structure expert. Generate a project based on the user's description.

RESPONSE FORMAT (JSON):
{
  "Content": "Detailed project outline and structure description",
  "Template": {
    "name": "Template Name",
    "hierarchyLevels": ["Level1", "Level2", "Level3"], 
    "scaffoldingDocuments": ["Doc1", "Doc2"]
  },
  "Context": "Relevant contextual information for this specific project type"
}

TEMPLATE RULES:
- Flexible layers: ["Story", "Chapter", "Scene"] = any number of chapters
- Fixed layers: ["Story", "Chapter 12", "Scene"] = exactly 12 chapters  
- Use fixed numbers only when specifically requested or structurally important

CONTEXT GUIDELINES:
- Include information that helps maintain project consistency
- For narratives: may include character details, world-building, themes, style guide
- For business: may include target market, financial considerations, strategy, style guide
- For research: may include methodology, variables, ethical considerations, style guide
- Always include a style guide appropriate to the project type
- Only include what's actually relevant to the specific project

EXAMPLES:
[Include 5-7 template examples here for different project types]
```

## **Technical Implementation Details**

### **Template Layer Processing**
```typescript
function parseTemplateLayer(layer: string): { name: string; isFixed: boolean; count?: number } {
  const match = layer.match(/^(.+?)\s+(\d+)$/);
  if (match) {
    return { name: match[1], isFixed: true, count: parseInt(match[2]) };
  }
  return { name: layer, isFixed: false };
}
```

### **JSON Parsing Strategy**
```typescript
class SmartContentParser {
  parseAIResponse(response: string): AIGenerationResponse | null {
    // Strategy 1: Direct JSON parsing
    // Strategy 2: Extract JSON from markdown code blocks
    // Strategy 3: Extract key-value pairs with regex
    // Strategy 4: Structured text parsing
    // Strategy 5: Fallback to manual content extraction
  }
}
```

## **Success Metrics**
- **Usability**: Users can create structured projects in under 2 minutes
- **Quality**: Generated templates are contextually appropriate  
- **Flexibility**: Supports diverse project types (narrative, business, research, documentation)
- **Reliability**: 95%+ successful JSON parsing rate
- **Adoption**: 70%+ of new projects use AI creation after 1 month

## **Risk Mitigation**
- **Fallback strategies** for JSON parsing failures
- **Template validation** before project creation
- **User review step** before finalizing AI-generated projects
- **Manual override** options for power users
- **Graceful degradation** to manual creation if AI fails

---

## 🚀 **Future Enhancements**

### **Advanced Features**
- **Project Templates Library**: Save and share successful AI-generated templates
- **Iterative Refinement**: Allow users to refine generated structures
- **Multi-Language Support**: Generate projects in different languages
- **Industry Specialization**: Specialized prompts for different domains

### **Integration Opportunities**
- **Import from External Sources**: Generate projects from PDFs, URLs, etc.
- **Collaborative Creation**: Multiple users refining project structure
- **Version Control**: Track evolution of AI-generated project structures

---

This plan provides a comprehensive roadmap for transforming the project creation experience while maintaining backward compatibility and introducing powerful AI-driven capabilities that will significantly enhance user productivity and project quality. 