import { DocumentNode } from './DocumentNode';
import { CoherenceContradiction } from './types/CoherenceTypes';

interface CoherenceLogEntry {
    timestamp: Date;
    nodeId: string;
    nodeTitle: string;
    parentNodeId: string;
    parentNodeTitle: string;
    contradiction: CoherenceContradiction;
    reason: 'below_autofix_threshold' | 'autofix_disabled' | 'autofix_failed';
    autofixSeverityThreshold?: number;
}

interface CoherenceLogData {
    entries: CoherenceLogEntry[];
    version: string;
}

export class CoherenceLog {
    private static instance: CoherenceLog | null = null;
    private projectLogData: Map<string, CoherenceLogData> = new Map();
    
    private constructor() {}
    
    public static getInstance(): CoherenceLog {
        if (!CoherenceLog.instance) {
            CoherenceLog.instance = new CoherenceLog();
        }
        return CoherenceLog.instance;
    }
    
    /**
     * Log a coherence issue for a specific project
     */
    public logCoherenceIssue(
        projectId: string,
        parentNode: DocumentNode,
        contradiction: CoherenceContradiction,
        reason: 'below_autofix_threshold' | 'autofix_disabled' | 'autofix_failed',
        autofixSeverityThreshold?: number
    ): void {
        const entry: CoherenceLogEntry = {
            timestamp: new Date(),
            nodeId: contradiction.offending_child_id || '',
            nodeTitle: contradiction.offending_child_title,
            parentNodeId: parentNode.id,
            parentNodeTitle: parentNode.title,
            contradiction,
            reason,
            ...(autofixSeverityThreshold !== undefined && { autofixSeverityThreshold })
        };
        
        const logData = this.getOrCreateLogData(projectId);
        logData.entries.push(entry);
        
        // Keep only last 1000 entries per project to prevent memory issues
        if (logData.entries.length > 1000) {
            logData.entries = logData.entries.slice(-1000);
        }
        
        console.log(`📝 Logged coherence issue: ${contradiction.offending_child_title} (severity ${contradiction.severity}) - ${reason}`);
    }
    
    /**
     * Get all coherence log entries for a project
     */
    public getLogEntries(projectId: string): CoherenceLogEntry[] {
        const logData = this.projectLogData.get(projectId);
        return logData ? [...logData.entries] : [];
    }
    
    /**
     * Get recent coherence log entries for a project
     */
    public getRecentLogEntries(projectId: string, maxEntries: number = 50): CoherenceLogEntry[] {
        const allEntries = this.getLogEntries(projectId);
        return allEntries.slice(-maxEntries);
    }
    
    /**
     * Get coherence log entries by severity range
     */
    public getLogEntriesBySeverity(projectId: string, minSeverity: number, maxSeverity: number = 10): CoherenceLogEntry[] {
        const allEntries = this.getLogEntries(projectId);
        return allEntries.filter(entry => 
            entry.contradiction.severity >= minSeverity && 
            entry.contradiction.severity <= maxSeverity
        );
    }
    
    /**
     * Get coherence log entries by reason
     */
    public getLogEntriesByReason(projectId: string, reason: 'below_autofix_threshold' | 'autofix_disabled' | 'autofix_failed'): CoherenceLogEntry[] {
        const allEntries = this.getLogEntries(projectId);
        return allEntries.filter(entry => entry.reason === reason);
    }
    
    /**
     * Clear all log entries for a project
     */
    public clearLogEntries(projectId: string): void {
        this.projectLogData.delete(projectId);
        console.log(`🧹 Cleared coherence log for project ${projectId}`);
    }
    
    /**
     * Get summary statistics for a project's coherence log
     */
    public getLogSummary(projectId: string): {
        totalEntries: number;
        severityBreakdown: Record<string, number>;
        reasonBreakdown: Record<string, number>;
        oldestEntry?: Date;
        newestEntry?: Date;
    } {
        const entries = this.getLogEntries(projectId);
        
        const severityBreakdown: Record<string, number> = {};
        const reasonBreakdown: Record<string, number> = {};
        
        entries.forEach(entry => {
            const severity = entry.contradiction.severity;
            const severityRange = severity >= 8 ? 'high' : severity >= 5 ? 'medium' : 'low';
            severityBreakdown[severityRange] = (severityBreakdown[severityRange] || 0) + 1;
            
            reasonBreakdown[entry.reason] = (reasonBreakdown[entry.reason] || 0) + 1;
        });
        
        const result: {
            totalEntries: number;
            severityBreakdown: Record<string, number>;
            reasonBreakdown: Record<string, number>;
            oldestEntry?: Date;
            newestEntry?: Date;
        } = {
            totalEntries: entries.length,
            severityBreakdown,
            reasonBreakdown
        };
        
        if (entries.length > 0) {
            const firstEntry = entries[0];
            const lastEntry = entries[entries.length - 1];
            if (firstEntry) result.oldestEntry = firstEntry.timestamp;
            if (lastEntry) result.newestEntry = lastEntry.timestamp;
        }
        
        return result;
    }
    
    /**
     * Save coherence log to project storage
     * TODO: Implement proper project storage integration
     */
    public async saveToProject(projectId: string): Promise<void> {
        // TODO: Implement saving coherence log to project storage
        console.log('📝 Saving coherence log to project:', projectId);
    }
    
    /**
     * Load coherence log from project storage
     * TODO: Implement proper project storage integration
     */
    public async loadFromProject(projectId: string): Promise<void> {
        // TODO: Implement loading coherence log from project storage
        console.log('📖 Loading coherence log from project:', projectId);
    }
    
    private getOrCreateLogData(projectId: string): CoherenceLogData {
        let logData = this.projectLogData.get(projectId);
        if (!logData) {
            logData = {
                entries: [],
                version: '1.0'
            };
            this.projectLogData.set(projectId, logData);
        }
        return logData;
    }
} 