/**
 * Type definitions for the Redundancy Detection System
 * 
 * This system identifies sibling nodes with redundant plot content
 * where one node can be safely deleted without story loss.
 */

import { DocumentNode } from '../DocumentNode';

/**
 * Represents a detected redundancy between two sibling nodes
 */
export interface RedundancyDetection {
    /** The node that should be kept (has better/more complete content) */
    nodeToKeep: DocumentNode;
    
    /** The node that can be safely deleted */
    nodeToDelete: DocumentNode;
    
    /** Redundancy score from 0-100% (only 70%+ are flagged) */
    redundancyScore: number;
    
    /** AI explanation of why deletion is safe */
    reasoning: string;
    
    /** Assessment of potential plot loss */
    plotLoss: 'none' | 'minimal' | 'some';
    
    /** Whether this redundancy has been reviewed by user */
    reviewed?: boolean;
}

/**
 * Result of analyzing all siblings under a parent node
 */
export interface RedundancyAnalysisResult {
    /** The parent node whose children were analyzed */
    parentNode: DocumentNode;
    
    /** Array of detected redundancies (ALL results, regardless of threshold) */
    redundancies: RedundancyDetection[];
    
    /** When the analysis was performed */
    timestamp: Date;
    
    /** Quick check: are there any nodes above threshold that can be deleted? */
    hasRedundantNodes: boolean;
    
    /** Total number of children analyzed */
    childrenAnalyzed: number;
    
    /** The minimum threshold used for this analysis */
    thresholdUsed: number;
    
    /** Any errors during analysis */
    analysisError?: string;
}

/**
 * Result of recursive redundancy analysis across multiple levels
 */
export interface RecursiveRedundancyResult {
    /** Root node where analysis started */
    rootNode: DocumentNode;
    
    /** All analysis results by node ID */
    analysisResults: Map<string, RedundancyAnalysisResult>;
    
    /** All detected redundancies across all levels */
    allRedundancies: RedundancyDetection[];
    
    /** Total nodes that were analyzed */
    totalNodesAnalyzed: number;
    
    /** Total redundancies found above threshold */
    totalRedundantNodes: number;
    
    /** Analysis timestamp */
    timestamp: Date;
    
    /** Configuration used for analysis */
    config: RecursiveRedundancyConfig;
    
    /** Any errors during recursive analysis */
    errors: string[];
}

/**
 * Progress tracking for recursive analysis
 */
export interface RedundancyAnalysisProgress {
    /** Current phase of analysis */
    phase: 'discovering' | 'analyzing' | 'processing' | 'complete';
    
    /** Current node being analyzed */
    currentNode: string;
    
    /** Total nodes discovered for analysis */
    totalNodes: number;
    
    /** Nodes completed */
    completedNodes: number;
    
    /** Progress percentage (0-100) */
    percentage: number;
    
    /** Current depth level being processed */
    currentDepth: number;
    
    /** Redundancies found so far */
    redundanciesFound: number;
    
    /** Any status message */
    message?: string;
}

/**
 * Configuration for recursive redundancy analysis
 */
export interface RecursiveRedundancyConfig {
    /** Maximum depth to analyze (1 = single level, 2 = children + grandchildren, etc.) */
    maxDepth: number;
    
    /** Whether to analyze the entire project tree recursively */
    analyzeEntireProject: boolean;
    
    /** Minimum redundancy score to flag (default: 70) */
    minimumRedundancyThreshold: number;
    
    /** Maximum content length per node for analysis (default: 500 chars) */
    maxContentLength: number;
    
    /** Whether to include nodes with no content (default: false) */
    includeEmptyNodes: boolean;
    
    /** Whether to auto-delete redundancies above a certain threshold */
    autoDeleteThreshold?: number;
    
    /** Whether to continue analysis after finding redundancies */
    continueAfterRedundancies: boolean;
}

/**
 * Raw AI response structure for parsing
 */
export interface RedundancyAIResponse {
    redundancies: Array<{
        pair: string;           // e.g., "Node2-Node3"
        redundancy: number;     // 0-100
        deleteNode: string;     // e.g., "Node3"
        reasoning: string;
        plotLoss: 'none' | 'minimal' | 'some';
    }>;
}

/**
 * Configuration for redundancy detection (legacy - for backwards compatibility)
 */
export interface RedundancyDetectionConfig {
    /** Minimum redundancy score to flag (default: 70) */
    minimumRedundancyThreshold: number;
    
    /** Maximum content length per node for analysis (default: 500 chars) */
    maxContentLength: number;
    
    /** Whether to include nodes with no content (default: false) */
    includeEmptyNodes: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_REDUNDANCY_CONFIG: RedundancyDetectionConfig = {
    minimumRedundancyThreshold: 70,
    maxContentLength: 500,
    includeEmptyNodes: false
};

/**
 * Default recursive configuration values
 */
export const DEFAULT_RECURSIVE_REDUNDANCY_CONFIG: RecursiveRedundancyConfig = {
    maxDepth: 1,
    analyzeEntireProject: false,
    minimumRedundancyThreshold: 70,
    maxContentLength: 500,
    includeEmptyNodes: false,
    continueAfterRedundancies: true
};

 