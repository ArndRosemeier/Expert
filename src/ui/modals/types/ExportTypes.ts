/**
 * Type definitions for export functionality
 */

import { DocumentNode } from '../../../DocumentNode';

/**
 * Export scope options
 */
export enum ExportScope {
    Single = 'single',
    Hierarchy = 'hierarchy', 
    Leaves = 'leaves'
}

/**
 * Export format options
 */
export enum ExportFormat {
    HTML = 'html',
    Markdown = 'markdown',
    Plain = 'plain',
    Reimport = 'reimport'
}

/**
 * Hierarchy title configuration for each level
 */
export interface HierarchyTitleConfig {
    [level: number]: boolean; // true = include titles, false = just newlines
}

/**
 * Export configuration
 */
export interface ExportConfig {
    scope: ExportScope;
    format: ExportFormat;
    includeRatings?: boolean;
    includeMetadata?: boolean;
    filename?: string;
    // New options for hierarchy title controls
    hierarchyTitles?: HierarchyTitleConfig;
    // HTML-specific options
    includeHtmlToc?: boolean;
}

/**
 * Export result
 */
export interface ExportResult {
    content: string;
    filename: string;
    mimeType: string;
}

/**
 * Export service interface
 */
export interface IExportService {
    export(node: DocumentNode, config: ExportConfig): Promise<ExportResult>;
    generateContent(nodes: DocumentNode[], format: ExportFormat, title?: string): string;
    downloadFile(result: ExportResult): void;
}

/**
 * Node export data for reimport format
 */
export interface NodeExportData {
    id: string;
    title: string;
    content: string;
    context?: string;
    level: number;
    template: string[];
    generationPrompt?: string;
    generationChildrenCount?: number;
    childLevelName?: string;
    children: NodeExportData[];
    // Generation metadata
    creatorModel?: string;
    generationHistory?: any[];
    generationSessions?: any[];
}

/**
 * Export generation options
 */
export interface ExportGenerationOptions {
    includeEmptyNodes?: boolean;
    includeGenerationData?: boolean;
    includeRatings?: boolean;
    maxDepth?: number;
} 