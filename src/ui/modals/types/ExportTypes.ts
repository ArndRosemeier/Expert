/**
 * Type definitions for export functionality
 */

import { ChildScope, DocumentNode, GenerationSession } from '../../../DocumentNode';
import { LoopHistoryItem } from '../../../LoopOrchestrator';
import { Rating } from '../../../types/RatingTypes';
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
    // Conditional context (node-level)
    conditionalContextItems?: Array<{
        id: string;
        text: string;
        keywords?: string[];
        childScope?: ChildScope;
        leavesOnly?: boolean;
    }>;
    // Generation metadata
    creatorModel?: string;
    generationHistory?: LoopHistoryItem[];
    generationSessions?: GenerationSession[];
    // Enhanced: Complete version and tagging system
    versions?: ContentVersionExportData[];
    // UI state
    collapsed?: boolean;
}

/**
 * Content version data for export/import
 */
export interface ContentVersionExportData {
    id: string;
    content: string;
    title: string;
    tags: string[];
    timestamp: string;
    ratings?: Rating[];
    creatorModel?: string;
    metadata?: Record<string, unknown>;
}

 