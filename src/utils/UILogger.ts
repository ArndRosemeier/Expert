export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    details?: string;
}

export class UILogger {
    private static instance: UILogger | null = null;
    private logContainer: HTMLElement | null = null;
    private logTextArea: HTMLTextAreaElement | null = null;
    private logs: LogEntry[] = [];
    private maxLogs: number = 1000;
    private isExpanded: boolean = true;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): UILogger {
        UILogger.instance ??= new UILogger();
        return UILogger.instance;
    }

    public initialize(containerId: string): void {
        this.logContainer = document.getElementById(containerId);
        if (!this.logContainer) {
            console.error(`UILogger: Container with id '${containerId}' not found`);
            return;
        }

        this.logTextArea = this.logContainer.querySelector('.ui-log-content') as HTMLTextAreaElement;
        if (!this.logTextArea) {
            console.error('UILogger: Log textarea not found in container');
            return;
        }

        // Apply current fold state to new DOM elements
        this.applyFoldState();
        
        // Initial display update to show any existing logs
        this.updateLogDisplay();
    }

    public debug(message: string, details?: string): void {
        this.addLog('debug', message, details);
    }

    public info(message: string, details?: string): void {
        this.addLog('info', message, details);
    }

    public warn(message: string, details?: string): void {
        this.addLog('warn', message, details);
    }

    public error(message: string, details?: string): void {
        this.addLog('error', message, details);
    }

    public success(message: string, details?: string): void {
        this.addLog('success', message, details);
    }

    private addLog(level: LogLevel, message: string, details?: string): void {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
            ...(details !== undefined && { details })
        };

        this.logs.push(entry);

        // Keep only the most recent logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        this.updateLogDisplay();
    }

    private updateLogDisplay(): void {
        if (!this.logTextArea) {
            console.warn('UILogger: logTextArea not found, cannot update display');
            return;
        }

        const logText = this.logs.map(entry => this.formatLogEntry(entry)).join('\n');
        this.logTextArea.value = logText;
        
        // Force a re-render by triggering a layout recalculation
        this.logTextArea.style.display = 'none';
        this.logTextArea.offsetHeight; // Force reflow
        this.logTextArea.style.display = '';
        
        // Auto-scroll to bottom
        this.logTextArea.scrollTop = this.logTextArea.scrollHeight;
    }

    private formatLogEntry(entry: LogEntry): string {
        const timestamp = entry.timestamp.toLocaleTimeString();
        const levelIcon = this.getLevelIcon(entry.level);
        const baseText = `[${timestamp}] ${levelIcon} ${entry.message}`;
        
        if (entry.details) {
            return `${baseText}\n    → ${entry.details}`;
        }
        
        return baseText;
    }

    private getLevelIcon(level: LogLevel): string {
        switch (level) {
            case 'debug': return '🔍';
            case 'info': return 'ℹ️';
            case 'warn': return '⚠️';
            case 'error': return '❌';
            case 'success': return '✅';
            default: return '•';
        }
    }

    public clear(): void {
        this.logs = [];
        this.updateLogDisplay();
    }

    public exportLogs(): string {
        return this.logs.map(entry => this.formatLogEntry(entry)).join('\n');
    }

    public getLogCount(): number {
        return this.logs.length;
    }

    public getLogCountByLevel(): Record<LogLevel, number> {
        const counts: Record<LogLevel, number> = {
            debug: 0,
            info: 0,
            warn: 0,
            error: 0,
            success: 0
        };

        this.logs.forEach(entry => {
            counts[entry.level]++;
        });

        return counts;
    }

    public refreshDisplay(): void {
        this.updateLogDisplay();
    }

    public toggle(): void {
        if (!this.logContainer) return;

        const isCollapsed = this.logContainer.classList.contains('collapsed');
        if (isCollapsed) {
            this.expand();
        } else {
            this.collapse();
        }
        

    }

    public expand(): void {
        if (!this.logContainer) return;
        
        this.isExpanded = true;
        this.logContainer.classList.remove('collapsed');
        const header = this.logContainer.querySelector('.ui-log-header') as HTMLElement;
        if (header) {
            const toggleIcon = header.querySelector('.toggle-icon') as HTMLElement;
            if (toggleIcon) {
                toggleIcon.textContent = '▼';
            }
        }
    }

    public collapse(): void {
        if (!this.logContainer) return;
        
        this.isExpanded = false;
        this.logContainer.classList.add('collapsed');
        const header = this.logContainer.querySelector('.ui-log-header') as HTMLElement;
        if (header) {
            const toggleIcon = header.querySelector('.toggle-icon') as HTMLElement;
            if (toggleIcon) {
                toggleIcon.textContent = '▶';
            }
        }
    }



    private applyFoldState(): void {
        if (this.isExpanded) {
            this.expand();
        } else {
            this.collapse();
        }
    }
}

// Export a convenience instance
export const uiLogger = UILogger.getInstance(); 