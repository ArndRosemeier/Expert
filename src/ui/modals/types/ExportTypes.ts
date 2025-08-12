/**
 * Type definitions for export functionality
 */

import { DocumentNode } from '../../../DocumentNode';
import { FileDownloadResult } from '../../../utils/FileDownloadService';

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
    EPUB = 'epub',
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
    // EPUB-specific options
    author?: string;
}

/**
 * Export result
 */
export interface ExportResult {
    content: string | Blob;
    filename: string;
    mimeType: string;
}

/**
 * Export service interface
 */
export interface IExportService {
    export(node: DocumentNode, config: ExportConfig): Promise<ExportResult>;
    generateContent(nodes: DocumentNode[], format: ExportFormat, title?: string): string;
    downloadFile(result: ExportResult): Promise<FileDownloadResult>;
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
    // Enhanced: Complete version and tagging system
    versions?: ContentVersionExportData[];
    // UI state
    collapsed?: boolean;
}

/**
 * Content version data for export/import
 */
interface ContentVersionExportData {
    id: string;
    content: string;
    title: string;
    context: string;
    tags: string[]; // Array instead of Set for JSON serialization
    timestamp: string; // ISO string for JSON serialization
    ratings?: any[]; // Rating array from LoopOrchestrator
    creatorModel?: string;
    metadata?: { [key: string]: any };
}

 