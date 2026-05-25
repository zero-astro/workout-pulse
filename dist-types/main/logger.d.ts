export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
declare class Logger {
    private logDir;
    private maxFileSize;
    private currentLogSize;
    constructor();
    private getLogFile;
    private shouldRotate;
    private rotateLog;
    private formatTimestamp;
    log(level: LogLevel, module: string, message: string, data?: any): void;
    debug(module: string, message: string, data?: any): void;
    info(module: string, message: string, data?: any): void;
    warn(module: string, message: string, data?: any): void;
    error(module: string, message: string, data?: any): void;
    /**
     * Get recent log entries for display
     */
    getRecentLogs(lines?: number): string[];
    /**
     * Clear old logs (keep only today's)
     */
    clearOldLogs(days?: number): void;
    /**
     * Export logs to JSON for analysis
     */
    exportLogs(format?: 'json' | 'text'): string;
}
export declare const logger: Logger;
export {};
