import { ProjectTemplate } from './ProjectTemplate';

// =====================================================
// TYPES AND INTERFACES
// =====================================================

export type DocumentFormat = 'markdown' | 'plaintext' | 'pdf' | 'unknown';

export interface HierarchyNode {
  id: string;
  level: number;
  title: string;
  content: string;
  startPosition: number;
  endPosition: number;
  children: HierarchyNode[];
  detectionMethod: DetectionMethod;
  confidence: number;
}

export type DetectionMethod = 'header' | 'numbering' | 'keyword' | 'indentation' | 'formatting';

export interface DetectionResult {
  method: DetectionMethod;
  nodes: HierarchyNode[];
  confidence: number;
}

export interface ParsedDocument {
  format: DocumentFormat;
  hierarchy: HierarchyNode[];
  metadata: DocumentMetadata;
  totalConfidence: number;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  date?: Date;
  wordCount: number;
  characterCount: number;
  estimatedReadingTime: number;
}

export interface TemplateRecommendation {
  template: ProjectTemplate;
  confidence: number;
  reasoning: string;
}

export interface ImportSettings {
  detection: {
    enableHeaderDetection: boolean;
    enableNumberingDetection: boolean;
    enableKeywordDetection: boolean;
    enableIndentationDetection: boolean;
    enableFormattingDetection: boolean;
    minimumConfidence: number;
    maxContentLength: number;
  };
  content: {
    preserveFormatting: boolean;
    normalizeWhitespace: boolean;
    removeEmptyLines: boolean;
    extractMetadata: boolean;
  };
  templates: {
    autoSelectTemplate: boolean;
    createCustomTemplate: boolean;
    minimumTemplateConfidence: number;
  };
}

// =====================================================
// PATTERN DEFINITIONS
// =====================================================

interface PatternDefinitions {
  headers: {
    markdown: RegExp;
    html: RegExp;
  };
  numbering: {
    decimal: RegExp;
    roman: RegExp;
    letter: RegExp;
    mixed: RegExp;
  };
  keywords: {
    chapter: RegExp;
    section: RegExp;
    part: RegExp;
    episode: RegExp;
    act: RegExp;
  };
  formatting: {
    allCaps: RegExp;
    underlined: RegExp;
    repeated: RegExp;
    bold: RegExp;
  };
}

const PATTERNS: PatternDefinitions = {
  headers: {
    markdown: /^(#{1,6})\s+(.+)$/gm,
    html: /<h([1-6])[^>]*>([^<]+)<\/h[1-6]>/gi,
  },
  numbering: {
    decimal: /^(\d+(?:\.\d+)*)\.\s+(.+)$/gm,
    roman: /^([IVXLCDM]+)\.\s+(.+)$/gm,
    letter: /^([A-Za-z])\.\s+(.+)$/gm,
    mixed: /^(\d+[A-Za-z]|\d+\.\d+[A-Za-z])\.\s+(.+)$/gm,
  },
  keywords: {
    chapter: /^(Chapter\s+\d+):?\s*(.*)$/gmi,
    section: /^(Section\s+\d+(?:\.\d+)*):?\s*(.*)$/gmi,
    part: /^(Part\s+[IVXLCDM]+):?\s*(.*)$/gmi,
    episode: /^(Episode\s+\d+):?\s*(.*)$/gmi,
    act: /^(Act\s+\d+(?:,\s*Scene\s+\d+)?):?\s*(.*)$/gmi,
  },
  formatting: {
    allCaps: /^[A-Z\s\d\-_]{3,}$/,
    underlined: /^(.+)\n[=-]{3,}$/gm,
    repeated: /^[=\-*]{3,}$/,
    bold: /^\*\*(.*)\*\*$/,
  },
};

// =====================================================
// DEFAULT SETTINGS
// =====================================================

const DEFAULT_SETTINGS: ImportSettings = {
  detection: {
    enableHeaderDetection: true,
    enableNumberingDetection: true,
    enableKeywordDetection: true,
    enableIndentationDetection: true,
    enableFormattingDetection: true,
    minimumConfidence: 0.3,
    maxContentLength: 10000,
  },
  content: {
    preserveFormatting: false,
    normalizeWhitespace: true,
    removeEmptyLines: true,
    extractMetadata: true,
  },
  templates: {
    autoSelectTemplate: true,
    createCustomTemplate: false,
    minimumTemplateConfidence: 0.6,
  },
};

// =====================================================
// CORE DOCUMENT IMPORT SERVICE
// =====================================================

export class DocumentImportService {
  private settings: ImportSettings;

  constructor(customSettings?: Partial<ImportSettings>) {
    this.settings = this.mergeSettings(DEFAULT_SETTINGS, customSettings);
  }

  // =====================================================
  // PUBLIC API
  // =====================================================

  /**
   * Parse a document and detect its hierarchical structure
   */
  public parseDocument(content: string, filename?: string): ParsedDocument {
    if (!content || content.trim().length === 0) {
      throw new Error('Document content cannot be empty');
    }

    // Detect document format
    const format = this.detectFormat(content, filename);
    if (format === 'unknown') {
      throw new Error('Unable to determine document format');
    }

    // Extract metadata
    const metadata = this.extractMetadata(content, format);

    // Detect hierarchy using multiple methods
    const detectionResults = this.detectHierarchy(content, format);
    
    if (detectionResults.length === 0) {
      throw new Error('No hierarchical structure detected in document');
    }

    // Merge and validate detection results
    const finalHierarchy = this.mergeDetectionResults(detectionResults);
    const totalConfidence = this.calculateOverallConfidence(detectionResults);

    if (totalConfidence < this.settings.detection.minimumConfidence) {
      throw new Error(`Detection confidence too low: ${totalConfidence.toFixed(2)} < ${this.settings.detection.minimumConfidence}`);
    }

    return {
      format,
      hierarchy: finalHierarchy,
      metadata,
      totalConfidence,
    };
  }

  /**
   * Suggest appropriate templates for the detected hierarchy
   */
  public suggestTemplates(hierarchy: HierarchyNode[]): TemplateRecommendation[] {
    if (hierarchy.length === 0) {
      throw new Error('Cannot suggest templates for empty hierarchy');
    }

    const recommendations: TemplateRecommendation[] = [];
    
    // Analyze structure patterns
    const levels = this.analyzeHierarchyLevels(hierarchy);
    const patterns = this.analyzeContentPatterns(hierarchy);
    
    // Check against known templates
    recommendations.push(...this.matchAgainstKnownTemplates(levels, patterns));
    
    // Generate custom template if enabled
    if (this.settings.templates.createCustomTemplate && recommendations.length === 0) {
      recommendations.push(this.generateCustomTemplate(hierarchy));
    }

    return recommendations.filter(rec => rec.confidence >= this.settings.templates.minimumTemplateConfidence);
  }

  /**
   * Update import settings
   */
  public updateSettings(newSettings: Partial<ImportSettings>): void {
    this.settings = this.mergeSettings(this.settings, newSettings);
  }

  /**
   * Get current settings
   */
  public getSettings(): ImportSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  // =====================================================
  // FORMAT DETECTION
  // =====================================================

  private detectFormat(content: string, filename?: string): DocumentFormat {
    // Check filename extension first
    if (filename) {
      const extension = filename.toLowerCase().split('.').pop();
      switch (extension) {
        case 'md':
        case 'markdown':
          return 'markdown';
        case 'pdf':
          return 'pdf';
        case 'txt':
          return 'plaintext';
      }
    }

    // Analyze content patterns
    if (this.isMarkdownContent(content)) {
      return 'markdown';
    }
    
    if (this.isPDFContent(content)) {
      return 'pdf';
    }
    
    // Default to plaintext for other content
    return 'plaintext';
  }

  private isMarkdownContent(content: string): boolean {
    const markdownPatterns = [
      /^#{1,6}\s/m,           // Headers
      /\*\*.*\*\*/,           // Bold
      /\*.*\*/,               // Italic
      /\[.*\]\(.*\)/,         // Links
      /```[\s\S]*```/,        // Code blocks
      /^\s*[-*+]\s/m,         // Lists
    ];

    let matches = 0;
    for (const pattern of markdownPatterns) {
      if (pattern.test(content)) {
        matches++;
      }
    }

    return matches >= 2; // Need at least 2 markdown patterns
  }

  private isPDFContent(content: string): boolean {
    // Check for PDF content indicators
    return content.includes('%PDF-') || 
           content.includes('startxref') ||
           content.includes('endobj');
  }

  // =====================================================
  // HIERARCHY DETECTION
  // =====================================================

  private detectHierarchy(content: string, format: DocumentFormat): DetectionResult[] {
    const results: DetectionResult[] = [];

    if (this.settings.detection.enableHeaderDetection) {
      const headerResult = this.detectHeaders(content, format);
      if (headerResult.nodes.length > 0) {
        results.push(headerResult);
      }
    }

    if (this.settings.detection.enableNumberingDetection) {
      const numberingResult = this.detectNumbering(content);
      if (numberingResult.nodes.length > 0) {
        results.push(numberingResult);
      }
    }

    if (this.settings.detection.enableKeywordDetection) {
      const keywordResult = this.detectKeywords(content);
      if (keywordResult.nodes.length > 0) {
        results.push(keywordResult);
      }
    }

    if (this.settings.detection.enableIndentationDetection) {
      const indentationResult = this.detectIndentation(content);
      if (indentationResult.nodes.length > 0) {
        results.push(indentationResult);
      }
    }

    if (this.settings.detection.enableFormattingDetection) {
      const formattingResult = this.detectFormatting(content);
      if (formattingResult.nodes.length > 0) {
        results.push(formattingResult);
      }
    }

    return results;
  }

  private detectHeaders(content: string, format: DocumentFormat): DetectionResult {
    const nodes: HierarchyNode[] = [];
    
    if (format === 'markdown') {
      nodes.push(...this.detectMarkdownHeaders(content));
    } else {
      nodes.push(...this.detectPlainTextHeaders(content));
    }

    return {
      method: 'header',
      nodes,
      confidence: this.calculateHeaderConfidence(nodes, content),
    };
  }

  private detectMarkdownHeaders(content: string): HierarchyNode[] {
    const nodes: HierarchyNode[] = [];
    const lines = content.split('\n');
    let currentPosition = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        currentPosition += 1; // Just newline
        continue;
      }

      const match = line.match(PATTERNS.headers.markdown);
      
      if (match && match[1] && match[2]) {
        const level = match[1].length - 1; // Convert # count to 0-based level
        const title = match[2].trim();
        const startPosition = currentPosition;
        
        nodes.push({
          id: this.generateNodeId(),
          level,
          title,
          content: '', // Will be filled after all nodes are detected
          startPosition,
          endPosition: startPosition + line.length,
          children: [],
          detectionMethod: 'header',
          confidence: 0.9, // High confidence for markdown headers
        });
      }
      
      currentPosition += line.length + 1; // +1 for newline
    }

    // Fill content for all detected header nodes
    this.fillHeaderContent(nodes, content, lines);
    
    return this.buildHierarchyTree(nodes);
  }

  private detectPlainTextHeaders(content: string): HierarchyNode[] {
    const nodes: HierarchyNode[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const trimmedLine = line.trim();
      
      // Check for underlined headers
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine) {
          const trimmedNextLine = nextLine.trim();
          if (this.isUnderline(trimmedNextLine) && trimmedLine.length > 0) {
            const level = this.getUnderlineLevel(trimmedNextLine);
            nodes.push(this.createHeaderNode(trimmedLine, level, i, lines, content));
          }
        }
      }
      
      // Check for ALL CAPS headers (single line, reasonable length)
      if (PATTERNS.formatting.allCaps.test(trimmedLine) && trimmedLine.length > 3 && trimmedLine.length < 80) {
        nodes.push(this.createHeaderNode(trimmedLine, 0, i, lines, content));
      }
    }

    // Fill content for detected plain text header nodes
    this.fillHeaderContent(nodes, content, lines);

    return this.buildHierarchyTree(nodes);
  }

  private detectNumbering(content: string): DetectionResult {
    const nodes: HierarchyNode[] = [];
    
    // Try different numbering patterns
    for (const [_type, pattern] of Object.entries(PATTERNS.numbering)) {
      const matches = Array.from(content.matchAll(pattern));
      
      for (const match of matches) {
        if (!match[1] || !match[2]) continue;
        
        const numberPart = match[1];
        const title = match[2].trim();
        const level = numberPart.split('.').length - 1;
        
        nodes.push({
          id: this.generateNodeId(),
          level,
          title: `${numberPart}. ${title}`,
          content: '', // Will be filled later
          startPosition: match.index || 0,
          endPosition: (match.index || 0) + match[0].length,
          children: [],
          detectionMethod: 'numbering',
          confidence: 0.8,
        });
      }
    }

    // Fill content for numbering nodes
    if (nodes.length > 0) {
      this.fillNumberingContent(nodes, content);
    }

    return {
      method: 'numbering',
      nodes: this.buildHierarchyTree(nodes),
      confidence: this.calculateNumberingConfidence(nodes),
    };
  }

  private detectKeywords(content: string): DetectionResult {
    const nodes: HierarchyNode[] = [];
    
    for (const [type, pattern] of Object.entries(PATTERNS.keywords)) {
      const matches = Array.from(content.matchAll(pattern));
      
      for (const match of matches) {
        if (!match[1]) continue;
        
        const keywordPart = match[1];
        const title = match[2] || keywordPart;
        const level = this.getKeywordLevel(type);
        
        nodes.push({
          id: this.generateNodeId(),
          level,
          title: title.trim(),
          content: '', // Will be filled later
          startPosition: match.index || 0,
          endPosition: (match.index || 0) + match[0].length,
          children: [],
          detectionMethod: 'keyword',
          confidence: 0.7,
        });
      }
    }

    // Fill content for keyword nodes
    if (nodes.length > 0) {
      this.fillKeywordContent(nodes, content);
    }

    return {
      method: 'keyword',
      nodes: this.buildHierarchyTree(nodes),
      confidence: this.calculateKeywordConfidence(nodes),
    };
  }

  private detectIndentation(content: string): DetectionResult {
    const nodes: HierarchyNode[] = [];
    const lines = content.split('\n');
    
    // Look for consistent indentation patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue; // Skip empty lines
      
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      
      const indentLevel = this.calculateIndentLevel(line);
      
      if (indentLevel > 0) {
        nodes.push({
          id: this.generateNodeId(),
          level: indentLevel,
          title: trimmed,
          content: '', // Will be filled later
          startPosition: this.getLinePosition(lines, i),
          endPosition: this.getLinePosition(lines, i) + (line?.length || 0),
          children: [],
          detectionMethod: 'indentation',
          confidence: 0.5,
        });
      }
    }

    // Fill content for indentation nodes
    if (nodes.length > 0) {
      this.fillIndentationContent(nodes, content, lines);
    }

    return {
      method: 'indentation',
      nodes: this.buildHierarchyTree(nodes),
      confidence: this.calculateIndentationConfidence(nodes),
    };
  }

  private detectFormatting(content: string): DetectionResult {
    const nodes: HierarchyNode[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue; // Skip undefined lines

      const trimmed = line.trim();
      
      // Look for lines with special formatting
      if (PATTERNS.formatting.bold.test(trimmed)) {
        const match = trimmed.match(PATTERNS.formatting.bold);
        if (match && match[1]) {
          const title = match[1].trim();
          nodes.push({
            id: this.generateNodeId(),
            level: 0,
            title: title,
            content: '', // Will be filled later
            startPosition: this.getLinePosition(lines, i),
            endPosition: this.getLinePosition(lines, i) + line.length,
            children: [],
            detectionMethod: 'formatting',
            confidence: 0.4,
          });
        }
      }
    }

    // Fill content for formatting nodes
    if (nodes.length > 0) {
      this.fillFormattingContent(nodes, content, lines);
    }

    return {
      method: 'formatting',
      nodes: this.buildHierarchyTree(nodes),
      confidence: this.calculateFormattingConfidence(nodes),
    };
  }

  private buildHierarchyTree(nodes: HierarchyNode[]): HierarchyNode[] {
    if (nodes.length === 0) return [];
    
    // Sort by position first
    const sortedNodes = [...nodes].sort((a, b) => a.startPosition - b.startPosition);
    
    const result: HierarchyNode[] = [];
    const stack: HierarchyNode[] = [];
    
    for (const node of sortedNodes) {
      // Remove nodes from stack that are at same or deeper level
      while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) {
        stack.pop();
      }
      
      if (stack.length === 0) {
        result.push(node);
      } else {
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.children.push(node);
        }
      }
      
      stack.push(node);
    }
    
    return result;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private mergeSettings(base: ImportSettings, override?: Partial<ImportSettings>): ImportSettings {
    if (!override) return base;
    
    return {
      detection: { ...base.detection, ...override.detection },
      content: { ...base.content, ...override.content },
      templates: { ...base.templates, ...override.templates },
    };
  }

  private generateNodeId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractMetadata(content: string, _format: DocumentFormat): DocumentMetadata {
    const wordCount = this.countWords(content);
    const characterCount = content.length;
    const estimatedReadingTime = Math.ceil(wordCount / 200); // 200 words per minute

    const metadata: DocumentMetadata = {
      wordCount,
      characterCount,
      estimatedReadingTime,
    };

    if (this.settings.content.extractMetadata) {
      // Try to extract title, author, date from content
      const extractedTitle = this.extractTitle(content);
      const extractedAuthor = this.extractAuthor(content);
      const extractedDate = this.extractDate(content);
      
      if (extractedTitle) metadata.title = extractedTitle;
      if (extractedAuthor) metadata.author = extractedAuthor;
      if (extractedDate) metadata.date = extractedDate;
    }

    return metadata;
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private extractTitle(content: string): string | null {
    const firstLine = content.split('\n')[0];
    if (!firstLine) return null;
    
    const trimmed = firstLine.trim();
    
    // Look for markdown header
    const headerMatch = trimmed.match(/^#+\s+(.+)$/);
    if (headerMatch && headerMatch[1]) {
      return headerMatch[1].trim();
    }
    
    // Use first line if it's reasonable length
    if (trimmed.length > 3 && trimmed.length < 100) {
      return trimmed;
    }
    
    return null;
  }

  private extractAuthor(content: string): string | null {
    // Look for author patterns
    const authorPattern = /(?:by|author|written by)\s*:?\s*([^.\n]+)/i;
    const match = content.match(authorPattern);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  }

  private extractDate(content: string): Date | null {
    // Look for date patterns
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;
    const match = content.match(datePattern);
    if (match && match[1]) {
      try {
        const date = new Date(match[1]);
        return isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
    }
    return null;
  }

  private isUnderline(line: string): boolean {
    return /^[=-]{3,}$/.test(line.trim());
  }

  private getUnderlineLevel(line: string): number {
    const char = line.trim()[0];
    return char === '=' ? 0 : 1; // = for level 0, - for level 1
  }

  private getKeywordLevel(keyword: string): number {
    const levelMap: Record<string, number> = {
      'part': 0,
      'chapter': 1,
      'section': 2,
      'episode': 1,
      'act': 0,
    };
    return levelMap[keyword] || 0;
  }

  private calculateIndentLevel(line: string): number {
    if (!line) return 0;
    
    const indent = line.match(/^(\s*)/);
    if (!indent || !indent[1]) return 0;
    
    const spaces = indent[1].replace(/\t/g, '    '); // Convert tabs to 4 spaces
    return Math.floor(spaces.length / 2); // 2 spaces = 1 level
  }

  private getLinePosition(lines: string[], lineIndex: number): number {
    let position = 0;
    for (let i = 0; i < lineIndex && i < lines.length; i++) {
      const line = lines[i];
      position += (line ? line.length : 0) + 1; // +1 for newline
    }
    return position;
  }

  private extractContentBetween(content: string, startPos: number, endPos: number): string {
    return content.substring(startPos, endPos).trim();
  }

  private createHeaderNode(title: string, level: number, lineIndex: number, lines: string[], _content: string): HierarchyNode {
    const startPosition = this.getLinePosition(lines, lineIndex);
    const endPosition = startPosition + title.length;

    return {
      id: this.generateNodeId(),
      level,
      title,
      content: '', // Will be filled by fillHeaderContent
      startPosition,
      endPosition,
      children: [],
      detectionMethod: 'formatting',
      confidence: 0.6,
    };
  }

  // Fixed content filling methods
  private fillHeaderContent(nodes: HierarchyNode[], _content: string, lines: string[]): void {
    if (nodes.length === 0) return;

    // Sort nodes by start position to ensure correct order
    const sortedNodes = [...nodes].sort((a, b) => a.startPosition - b.startPosition);

    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i];
      if (!node) continue;
      
      const nextNode = sortedNodes[i + 1];

      // Find the line index for this node
      const nodeLineIndex = this.findLineIndex(lines, node.startPosition);
      
      // Extract content from the line after the header until the next header
      let contentLines: string[] = [];
      let startSearchIndex = nodeLineIndex + 1;
      
      // For underlined headers, skip the underline too
      if (startSearchIndex < lines.length) {
        const nextLine = lines[startSearchIndex];
        if (nextLine && this.isUnderline(nextLine.trim())) {
          startSearchIndex++;
        }
      }

      // Collect content lines until next header or end
      for (let j = startSearchIndex; j < lines.length; j++) {
        const line = lines[j];
        if (line === undefined) continue; // Handle undefined lines
        
        // Stop if we hit the next header
        if (nextNode && j >= this.findLineIndex(lines, nextNode.startPosition)) {
          break;
        }
        
        // Stop if we hit another header pattern
        if (this.isHeaderLine(line)) {
          break;
        }
        
        contentLines.push(line);
      }

      // Set the extracted content
      node.content = contentLines.join('\n').trim();
    }
  }

  private fillNumberingContent(nodes: HierarchyNode[], content: string): void {
    if (nodes.length === 0) return;

    // Sort nodes by start position
    const sortedNodes = [...nodes].sort((a, b) => a.startPosition - b.startPosition);
    
    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i];
      if (!node) continue; // Skip undefined nodes
      
      const nextNode = sortedNodes[i + 1];
      
      // Extract content between this node and the next
      const startPos = node.endPosition;
      const endPos = nextNode ? nextNode.startPosition : content.length;
      
      if (startPos < endPos) {
        node.content = this.extractContentBetween(content, startPos, endPos);
      }
    }
  }

  private fillKeywordContent(nodes: HierarchyNode[], content: string): void {
    // Similar to fillNumberingContent
    this.fillNumberingContent(nodes, content);
  }

  private fillIndentationContent(nodes: HierarchyNode[], _content: string, lines: string[]): void {
    // Implementation for filling content for indentation-based nodes
    for (const node of nodes) {
      // Find content lines at deeper indentation level
      const nodeLineIndex = this.findLineIndex(lines, node.startPosition);
      const contentLines: string[] = [];
      
      for (let i = nodeLineIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue; // Handle undefined lines
        
        const lineIndent = this.calculateIndentLevel(line);
        
        if (lineIndent > node.level) {
          contentLines.push(line);
        } else if (line.trim().length > 0) {
          break; // Found next section
        }
      }
      
      node.content = contentLines.join('\n').trim();
    }
  }

  private fillFormattingContent(nodes: HierarchyNode[], content: string, lines: string[]): void {
    // Similar approach for formatting-based nodes
    this.fillIndentationContent(nodes, content, lines);
  }

  // Helper method to check if a line is a header
  private isHeaderLine(line: string): boolean {
    if (!line) return false;
    
    // Check for markdown headers
    if (PATTERNS.headers.markdown.test(line)) return true;
    
    // Check for ALL CAPS headers
    if (PATTERNS.formatting.allCaps.test(line.trim()) && line.trim().length > 3 && line.trim().length < 80) return true;
    
    // Check for numbered sections
    for (const pattern of Object.values(PATTERNS.numbering)) {
      if (pattern.test(line)) return true;
    }
    
    // Check for keywords
    for (const pattern of Object.values(PATTERNS.keywords)) {
      if (pattern.test(line)) return true;
    }
    
    return false;
  }

  private findLineIndex(lines: string[], position: number): number {
    let currentPos = 0;
    for (let i = 0; i < lines.length; i++) {
      if (currentPos >= position) return i;
      const line = lines[i];
      currentPos += (line ? line.length : 0) + 1; // Handle undefined lines
    }
    return Math.max(0, lines.length - 1);
  }

  private mergeDetectionResults(results: DetectionResult[]): HierarchyNode[] {
    if (results.length === 0) return [];
    
    // Sort by confidence and use the best result
    results.sort((a, b) => b.confidence - a.confidence);
    const bestResult = results[0];
    return bestResult ? bestResult.nodes : [];
  }

  private calculateOverallConfidence(results: DetectionResult[]): number {
    if (results.length === 0) return 0;
    
    // Use the highest confidence from all detection methods
    const maxConfidence = Math.max(...results.map(r => r.confidence));
    return maxConfidence;
  }

  private calculateHeaderConfidence(nodes: HierarchyNode[], content: string): number {
    if (nodes.length === 0) return 0;
    
    const contentLength = content.length;
    const headerCoverage = nodes.length / (contentLength / 1000); // Headers per 1000 chars
    
    return Math.min(0.9, headerCoverage * 0.3);
  }

  private calculateNumberingConfidence(nodes: HierarchyNode[]): number {
    // Calculate confidence based on consistency of numbering
    if (nodes.length < 2) return 0.3;

    let consistentCount = 0;
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];

      if (prev && curr && (curr.level >= prev.level || curr.level === prev.level + 1)) {
        consistentCount++;
      }
    }

    return Math.min(0.9, 0.5 + (consistentCount / (nodes.length - 1)) * 0.4);
  }

  private calculateKeywordConfidence(nodes: HierarchyNode[]): number {
    // Keywords are fairly reliable if found
    return Math.min(0.8, nodes.length * 0.15);
  }

  private calculateIndentationConfidence(nodes: HierarchyNode[]): number {
    // Indentation can be unreliable
    return Math.min(0.6, nodes.length * 0.1);
  }

  private calculateFormattingConfidence(nodes: HierarchyNode[]): number {
    // Formatting is least reliable
    return Math.min(0.5, nodes.length * 0.05);
  }

  private analyzeHierarchyLevels(hierarchy: HierarchyNode[]): { maxDepth: number; levelCounts: number[] } {
    const levelCounts: number[] = [];
    let maxDepth = 0;
    
    const traverse = (nodes: HierarchyNode[], depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      
      for (const node of nodes) {
        levelCounts[depth] = (levelCounts[depth] || 0) + 1;
        traverse(node.children, depth + 1);
      }
    };
    
    traverse(hierarchy, 0);
    
    return { maxDepth, levelCounts };
  }

  private analyzeContentPatterns(hierarchy: HierarchyNode[]): { hasChapters: boolean; hasScenes: boolean; hasSections: boolean } {
    const allTitles = this.collectAllTitles(hierarchy).map(t => t.toLowerCase());
    
    return {
      hasChapters: allTitles.some(t => t.includes('chapter')),
      hasScenes: allTitles.some(t => t.includes('scene')),
      hasSections: allTitles.some(t => t.includes('section')),
    };
  }

  private collectAllTitles(nodes: HierarchyNode[]): string[] {
    const titles: string[] = [];
    
    const traverse = (nodeList: HierarchyNode[]) => {
      for (const node of nodeList) {
        titles.push(node.title);
        traverse(node.children);
      }
    };
    
    traverse(nodes);
    return titles;
  }

  private matchAgainstKnownTemplates(levels: any, patterns: any): TemplateRecommendation[] {
    const recommendations: TemplateRecommendation[] = [];
    
    // Novel template
    if (patterns.hasChapters && levels.maxDepth >= 1) {
      recommendations.push({
        template: new ProjectTemplate('Novel', ['Book', 'Chapter', 'Scene'], []),
        confidence: 0.8,
        reasoning: 'Document contains chapters and multiple levels, suitable for novel structure',
      });
    }
    
    // Technical manual
    if (patterns.hasSections && levels.maxDepth >= 2) {
      recommendations.push({
        template: new ProjectTemplate('Technical Manual', ['Manual', 'Section', 'Subsection'], []),
        confidence: 0.7,
        reasoning: 'Document contains sections and subsections, suitable for technical documentation',
      });
    }
    
    return recommendations;
  }

  private generateCustomTemplate(hierarchy: HierarchyNode[]): TemplateRecommendation {
    const { maxDepth } = this.analyzeHierarchyLevels(hierarchy);
    const levelNames: string[] = [];
    
    for (let i = 0; i <= maxDepth; i++) {
      levelNames.push(`Level ${i + 1}`);
    }
    
    return {
      template: new ProjectTemplate('Custom Template', levelNames, []),
      confidence: 0.5,
      reasoning: 'Generated custom template based on detected hierarchy structure',
    };
  }
} 