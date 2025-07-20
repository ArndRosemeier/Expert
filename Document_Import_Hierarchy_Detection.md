# Document Import with Automatic Hierarchy Detection

## Overview

This feature enables users to import complete documents (stories, manuals, reports, etc.) with automatic detection of hierarchical structure and population of project nodes. Unlike the existing concept extraction functionality, this performs complete document parsing using pattern recognition to maintain the original document structure.

## Goals

- **Structure Preservation**: Maintain the original document's hierarchical organization
- **Template Mapping**: Automatically map detected structures to appropriate project templates
- **Content Population**: Fill project nodes with actual document content, not just concepts
- **Format Flexibility**: Support multiple input formats (Markdown, HTML, Plain Text, etc.)
- **Non-AI Approach**: Use deterministic pattern recognition instead of AI analysis
- **User Control**: Provide options for customization and manual override

## Supported Input Formats

### 1. Markdown Documents
- **Headers**: `#`, `##`, `###`, `####`, `#####`, `######`
- **Structure**: Natural hierarchy through header levels
- **Content**: Text blocks between headers become node content
- **Metadata**: Front matter support for document properties

### 2. Plain Text Documents
- **Numbered Lists**: `1.`, `1.1`, `1.1.1`, `I.`, `A.`, `a.`, etc.
- **Indentation**: Consistent spacing/tabs for hierarchy
- **Keywords**: "Chapter", "Section", "Part", "Episode", etc.
- **Formatting**: ALL CAPS, underlined text, repeated characters
- **Spacing**: Double/triple line breaks for section separation

### 3. HTML Documents
- **Header Tags**: `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, `<h6>`
- **Semantic Tags**: `<article>`, `<section>`, `<chapter>`, etc.
- **Lists**: `<ol>`, `<ul>` with nested structures
- **Divs**: Class-based structure detection

### 4. Rich Text Formats (Future)
- **Word Documents**: Style-based hierarchy detection
- **PDF**: Text extraction with formatting analysis
- **EPUB**: Chapter and section structure

## Hierarchy Detection Strategies

### 1. Header-Based Detection (Primary)

**Markdown/HTML Headers**
```
# Book Title (Level 0)
## Chapter 1: Beginning (Level 1)
### Scene 1 (Level 2)
#### Part A (Level 3)
### Scene 2 (Level 2)
## Chapter 2: Middle (Level 1)
```

**Detection Algorithm:**
- Scan for header markers (`#`, `<h1>`, etc.)
- Build hierarchy tree based on header levels
- Handle inconsistent numbering (skip levels, etc.)
- Merge content between headers into nodes

### 2. Numbering Pattern Detection

**Decimal Numbering**
```
1. Introduction
1.1 Overview
1.2 Scope
2. Methodology
2.1 Approach
2.1.1 Data Collection
2.1.2 Analysis
```

**Roman/Letter Numbering**
```
I. Introduction
   A. Overview
   B. Scope
      1. Purpose
      2. Goals
II. Methodology
```

**Detection Algorithm:**
- Regex patterns for various numbering schemes
- Hierarchy depth calculation from numbering structure
- Content extraction between numbered sections

### 3. Keyword-Based Detection

**Common Patterns:**
- `Chapter \d+:?`
- `Section \d+\.?\d*`
- `Part [IVXLCDM]+`
- `Episode \d+`
- `Act \d+, Scene \d+`

**Detection Algorithm:**
- Pattern matching with configurable keywords
- Natural language number parsing
- Contextual hierarchy building

### 4. Indentation-Based Detection

**Consistent Spacing:**
```
Introduction
    Overview
        Purpose
        Scope
    Background
Chapter 1
    Setting
    Characters
```

**Detection Algorithm:**
- Measure indentation levels (spaces/tabs)
- Build hierarchy from indentation depth
- Handle mixed indentation types

### 5. Formatting-Based Detection

**Visual Patterns:**
- ALL CAPS headers
- Underlined text
- Repeated characters (`===`, `---`, `***`)
- Bold/italic formatting (HTML/Markdown)

## Template Mapping

### 1. Template Selection Strategy

**Automatic Selection:**
1. **Content Analysis**: Detect story elements, technical content, business terms
2. **Structure Analysis**: Count levels, examine naming patterns
3. **Length Analysis**: Estimate appropriate template based on content volume

**Mapping Examples:**
```
Detected Pattern → Template
Chapter/Scene → Novel Template
Section/Subsection → Technical Manual
Part/Chapter/Act → Screenplay
Introduction/Body/Conclusion → Academic Paper
```

### 2. Template Adaptation

**Dynamic Level Mapping:**
- Map detected levels to template hierarchy
- Handle extra levels (create custom sub-levels)
- Handle missing levels (skip template levels)

**Example Mapping:**
```
Document: # Book ## Chapter ### Scene
Template: Book → Act → Chapter → Scene
Mapping: Book→Book, Chapter→Chapter, Scene→Scene (skip Act)
```

### 3. Custom Template Generation

**When Standard Templates Don't Fit:**
- Create custom template based on detected structure
- Name levels based on detected patterns
- Save as reusable custom template

## Content Processing

### 1. Content Extraction

**Text Processing:**
- Clean formatting artifacts
- Preserve paragraph structure
- Handle special characters and encoding
- Maintain line breaks and spacing

**Metadata Extraction:**
- Author, title, date from headers/front matter
- Tags from keywords or categories
- Version information

### 2. Content Distribution

**Node Population Strategy:**
1. **Header Content**: Use header text as node title
2. **Body Content**: Text between headers becomes node content
3. **Nested Content**: Handle sub-sections appropriately
4. **Overflow Handling**: Split very long sections

**Content Cleaning:**
- Remove extra whitespace
- Normalize line endings
- Handle special formatting
- Preserve intentional formatting

### 3. Context Generation

**Automatic Context Building:**
- Extract character names, locations, concepts
- Build context hierarchically (inherit from parent)
- Generate summaries for higher-level nodes
- Maintain consistency across related nodes

## User Interface Design

### 1. Import Wizard

**Step 1: File Selection**
- File upload/paste interface
- Format detection and validation
- Preview of detected structure

**Step 2: Structure Preview**
- Tree view of detected hierarchy
- Confidence indicators for each detection
- Manual adjustment options

**Step 3: Template Selection**
- Automatic template suggestions
- Manual template override
- Custom template creation option

**Step 4: Content Review**
- Node-by-node content preview
- Edit node titles and content
- Merge/split node options

**Step 5: Import Execution**
- Progress indicator
- Error handling and recovery
- Final validation

### 2. Configuration Options

**Detection Settings:**
- Enable/disable detection methods
- Adjust sensitivity thresholds
- Custom keyword patterns
- Numbering format preferences

**Content Settings:**
- Maximum node content length
- Text cleaning preferences
- Context generation options
- Metadata handling

## Implementation Architecture

### 1. Core Components

**DocumentParser Class:**
```typescript
interface DocumentParser {
  parseDocument(content: string, format: DocumentFormat): ParsedDocument;
  detectHierarchy(content: string): HierarchyNode[];
  extractContent(content: string, hierarchy: HierarchyNode[]): ContentBlock[];
}
```

**HierarchyDetector Class:**
```typescript
interface HierarchyDetector {
  detectHeaders(content: string): HeaderStructure;
  detectNumbering(content: string): NumberingStructure;
  detectKeywords(content: string): KeywordStructure;
  detectIndentation(content: string): IndentationStructure;
  mergeDetections(structures: DetectionResult[]): FinalHierarchy;
}
```

**TemplateMapper Class:**
```typescript
interface TemplateMapper {
  suggestTemplate(hierarchy: HierarchyNode[]): TemplateRecommendation[];
  mapHierarchyToTemplate(hierarchy: HierarchyNode[], template: Template): NodeMapping[];
  createCustomTemplate(hierarchy: HierarchyNode[]): Template;
}
```

### 2. Detection Pipeline

```
Input Document
    ↓
Format Detection
    ↓
Multiple Detection Methods (Parallel)
    ├── Header Detection
    ├── Numbering Detection
    ├── Keyword Detection
    ├── Indentation Detection
    └── Formatting Detection
    ↓
Confidence Scoring & Merging
    ↓
Hierarchy Validation
    ↓
Template Matching
    ↓
Content Extraction & Cleaning
    ↓
Node Creation & Population
    ↓
Final Project Structure
```

### 3. Pattern Definitions

**Regex Patterns:**
```typescript
const PATTERNS = {
  headers: {
    markdown: /^(#{1,6})\s+(.+)$/gm,
    html: /<h([1-6])[^>]*>([^<]+)<\/h[1-6]>/gi,
  },
  numbering: {
    decimal: /^(\d+(?:\.\d+)*)\.\s+(.+)$/gm,
    roman: /^([IVXLCDM]+)\.\s+(.+)$/gm,
    letter: /^([A-Z])\.\s+(.+)$/gm,
  },
  keywords: {
    chapter: /^(Chapter\s+\d+):?\s*(.*)$/gmi,
    section: /^(Section\s+\d+(?:\.\d+)*):?\s*(.*)$/gmi,
    part: /^(Part\s+[IVXLCDM]+):?\s*(.*)$/gmi,
  }
};
```

## Error Handling & Edge Cases

### 1. Ambiguous Structure

**Multiple Valid Interpretations:**
- Present options to user
- Use confidence scoring
- Allow manual override
- Provide undo/redo functionality

**Inconsistent Numbering:**
- Skip missing numbers
- Handle duplicate numbers
- Merge similar patterns
- Flag inconsistencies for review

### 2. Content Issues

**Very Large Documents:**
- Progressive parsing
- Memory management
- Progress indicators
- Chunked processing

**Malformed Content:**
- Graceful degradation
- Best-effort parsing
- User notification of issues
- Manual correction options

### 3. Template Mismatches

**No Suitable Template:**
- Create custom template
- Suggest closest match
- Allow manual mapping
- Provide template editing

**Complex Structures:**
- Flatten when necessary
- Create hybrid templates
- Support nested structures
- Handle cross-references

## Performance Considerations

### 1. Large Document Handling

**Streaming Processing:**
- Parse in chunks
- Progressive UI updates
- Memory-efficient processing
- Cancellation support

**Optimization Strategies:**
- Pre-filter content
- Cache detection results
- Parallel processing
- Lazy content loading

### 2. Real-time Preview

**Live Structure Detection:**
- Debounced parsing
- Incremental updates
- Visual feedback
- Responsive UI

## Integration Points

### 1. Existing Project System

**Template Integration:**
- Use existing template format
- Extend template capabilities
- Maintain compatibility
- Support custom templates

**Node Creation:**
- Use existing node system
- Preserve node functionality
- Maintain relationships
- Support versioning

### 2. Import/Export System

**File Format Support:**
- Extend existing import system
- Add new format handlers
- Maintain export compatibility
- Support round-trip conversion

## Future Enhancements

### 1. Advanced Detection

**Machine Learning Enhancement:**
- Learn from user corrections
- Improve pattern recognition
- Adapt to document styles
- Personalized detection

**Multi-language Support:**
- International numbering systems
- Language-specific keywords
- Cultural structure patterns
- Unicode handling

### 2. Collaborative Features

**Shared Templates:**
- Community template library
- Template sharing and rating
- Import/export templates
- Version control for templates

**Review and Approval:**
- Multi-user validation
- Change tracking
- Approval workflows
- Collaborative editing

## Success Metrics

### 1. Accuracy Metrics

- **Structure Detection Accuracy**: % of correctly identified hierarchy levels
- **Content Mapping Accuracy**: % of content correctly assigned to nodes
- **Template Matching Success**: % of successful automatic template selections

### 2. User Experience Metrics

- **Import Success Rate**: % of imports completed successfully
- **User Intervention Rate**: % of imports requiring manual adjustment
- **Time to Complete Import**: Average time from start to finished project

### 3. Performance Metrics

- **Processing Speed**: Documents per minute by size
- **Memory Usage**: Peak memory during large imports
- **Error Rate**: % of imports that fail or produce errors

## Implementation Timeline

### Phase 1: Core Framework (4 weeks)
- Document parser foundation
- Basic hierarchy detection
- Simple template mapping
- MVP user interface

### Phase 2: Advanced Detection (3 weeks)
- Multiple detection methods
- Confidence scoring
- Pattern customization
- Error handling

### Phase 3: User Experience (3 weeks)
- Import wizard
- Preview functionality
- Configuration options
- Integration testing

### Phase 4: Polish & Testing (2 weeks)
- Performance optimization
- Edge case handling
- Documentation
- User testing

## Conclusion

This document import system will significantly enhance Expert's capabilities by allowing users to quickly convert existing documents into structured projects. The non-AI approach ensures deterministic, reliable results while providing flexibility for various document formats and structures.

The system's modular design allows for incremental implementation and future enhancements, making it a valuable long-term addition to the Expert application ecosystem. 