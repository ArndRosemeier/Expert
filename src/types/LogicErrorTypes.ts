/**
 * Type definitions for the Logic Error Detection System
 * 
 * This system identifies logical inconsistencies, plot holes, and continuity errors
 * across leaf nodes in the story structure using the 🧩 puzzle piece concept.
 */

import { DocumentNode } from '../DocumentNode';

/**
 * Types of logic errors that can be detected
 */
export type LogicErrorType = 
    | 'plot_hole'
    | 'character_contradiction' 
    | 'timeline_inconsistency'
    | 'logical_inconsistency'
    | 'factual_error'
    | 'continuity_error';

/**
 * Severity categories for logic errors
 */
export type LogicErrorCategory = 'critical' | 'major' | 'minor';

/**
 * Represents a detected logic error in the story
 */
export interface LogicError {
    /** Unique identifier for this error */
    id: string;
    
    /** Type of logic error detected */
    type: LogicErrorType;
    
    /** Severity score from 1-10 (10 being most severe) */
    severity: number;
    
    /** Category based on severity */
    category: LogicErrorCategory;
    
    /** Brief description of the error */
    description: string;
    
    /** Detailed explanation of why this is considered an error */
    justification: string;
    
    /** Array of leaf node titles that contain this error */
    offendingLeaves: string[];
    
    /** Optional suggestion for fixing the error */
    suggestedFix?: string;
    
    /** Whether this error has been reviewed by the user */
    reviewed?: boolean;
    
    /** Whether this error has been marked as resolved */
    resolved?: boolean;
    
    /** User notes about this error */
    userNotes?: string;
}

/**
 * Result of logic error analysis for a parent node
 */
export interface LogicAnalysisResult {
    /** The parent node whose leaves were analyzed */
    parentNode: DocumentNode;
    
    /** Array of detected logic errors */
    errors: LogicError[];
    
    /** Number of leaf nodes analyzed */
    leavesAnalyzed: number;
    
    /** Total character count of analyzed content */
    totalLeafContent: number;
    
    /** When the analysis was performed */
    timestamp: Date;
    
    /** Quick statistics by error type */
    errorsByType: Record<LogicErrorType, number>;
    
    /** Quick statistics by severity category */
    errorsByCategory: Record<LogicErrorCategory, number>;
    
    /** Total number of errors above the configured minimum severity */
    actionableErrors: number;
    
    /** Any errors during analysis */
    analysisError?: string;
}

/**
 * Configuration for logic error detection
 */
export interface LogicErrorDetectionConfig {
    /** Whether to include leaf nodes with no content */
    includeEmptyLeaves: boolean;
    
    /** Array of error types to check for */
    errorTypes: LogicErrorType[];
    
    /** Minimum severity threshold (1-10) to report errors */
    minimumSeverity: number;
    
    /** Whether to group results by error type in the UI */
    groupByType: boolean;
    
    /** Maximum number of leaves to analyze in one batch */
    maxLeavesPerAnalysis: number;
}

/**
 * Raw AI response structure for parsing logic errors
 */
export interface LogicErrorAIResponse {
    errors: Array<{
        type: LogicErrorType;
        severity: number;
        description: string;
        justification: string;
        offendingLeaves: string[];
        suggestedFix?: string;
    }>;
}

/**
 * Default configuration values
 */
export const DEFAULT_LOGIC_ERROR_CONFIG: LogicErrorDetectionConfig = {
    includeEmptyLeaves: false,
    errorTypes: [
        'plot_hole',
        'character_contradiction',
        'timeline_inconsistency',
        'logical_inconsistency',
        'factual_error',
        'continuity_error'
    ],
    minimumSeverity: 5,
    groupByType: true,
    maxLeavesPerAnalysis: 50
};

/**
 * Helper functions for error categorization
 */
export function categorizeErrorBySeverity(severity: number): LogicErrorCategory {
    if (severity >= 8) return 'critical';
    if (severity >= 6) return 'major';
    return 'minor';
}

export function getErrorTypeLabel(type: LogicErrorType): string {
    const labels: Record<LogicErrorType, string> = {
        'plot_hole': 'Plot Hole',
        'character_contradiction': 'Character Contradiction',
        'timeline_inconsistency': 'Timeline Inconsistency',
        'logical_inconsistency': 'Logical Inconsistency',
        'factual_error': 'Factual Error',
        'continuity_error': 'Continuity Error'
    };
    return labels[type];
}

export function getErrorTypeDescription(type: LogicErrorType): string {
    const descriptions: Record<LogicErrorType, string> = {
        'plot_hole': 'Missing or unexplained story elements that break narrative flow',
        'character_contradiction': 'Inconsistencies in character behavior, knowledge, or abilities',
        'timeline_inconsistency': 'Events that occur in impossible or contradictory time sequences',
        'logical_inconsistency': 'Actions or events that defy established story logic',
        'factual_error': 'Contradictions in established facts within the story world',
        'continuity_error': 'Inconsistencies in details between different story sections'
    };
    return descriptions[type];
}

 