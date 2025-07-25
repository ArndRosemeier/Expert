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
 * Configuration for redundancy detection
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
 * Modal state for tracking user interactions
 */
export interface RedundancyModalState {
    /** Current analysis result being displayed */
    currentAnalysis: RedundancyAnalysisResult | null;
    
    /** IDs of nodes marked for deletion */
    markedForDeletion: Set<string>;
    
    /** Whether analysis is currently running */
    isAnalyzing: boolean;
    
    /** User's review status for each redundancy */
    reviewedRedundancies: Set<string>;
} 