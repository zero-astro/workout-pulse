import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
  data?: any
}

class Logger {
  private logDir: string
  private maxFileSize = 10 * 1024 * 1024 // 10MB per file
  private currentLogSize = 0
  
  constructor() {
    const appDataDir = path.join(os.homedir(), '.workout-pulse')
    this.logDir = path.join(appDataDir, 'logs')
    
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
    
    // Initialize current log size
    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(this.logDir, `${today}.log`)
    if (fs.existsSync(logFile)) {
      this.currentLogSize = fs.statSync(logFile).size
    }
  }

  private getLogFile(): string {
    const today = new Date().toISOString().split('T')[0]
    return path.join(this.logDir, `${today}.log`)
  }

  private shouldRotate(): boolean {
    const logFile = this.getLogFile()
    
    // Check if file exists and get current size
    try {
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile)
        return stats.size >= this.maxFileSize
      }
    } catch (error) {
      console.error('[Logger] Error checking log file size:', error)
    }
    
    return false
  }

  private rotateLog(): void {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const oldLogFile = path.join(this.logDir, `${yesterday}.log`)
    
    // Move today's log to yesterday's name if it exists
    if (fs.existsSync(oldLogFile)) {
      fs.unlinkSync(oldLogFile)
    }
    
    if (this.shouldRotate()) {
      const currentLog = this.getLogFile()
      const backupLog = path.join(this.logDir, `${today}.log.backup`)
      
      try {
        fs.renameSync(currentLog, backupLog)
        this.currentLogSize = 0
      } catch (error) {
        console.error('[Logger] Error rotating log file:', error)
      }
    }
  }

  private formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').split('.')[0]
  }

  public log(level: LogLevel, module: string, message: string, data?: any): void {
    const timestamp = this.formatTimestamp(new Date())
    
    // Create log entry
    const entry: LogEntry = {
      timestamp,
      level,
      module,
      message,
      ...(data && { data })
    }

    // Format log line
    let logLine = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${module}] ${message}`
    
    if (data) {
      try {
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
        logLine += `\n${jsonData}`
      } catch (error) {
        logLine += `\n[Data serialization failed: ${error}]`
      }
    }

    // Add newline if not present
    if (!logLine.endsWith('\n')) {
      logLine += '\n'
    }

    // Write to file
    try {
      const logFile = this.getLogFile()
      
      // Check if rotation is needed before writing
      if (this.shouldRotate()) {
        this.rotateLog()
      }
      
      fs.appendFileSync(logFile, logLine)
      this.currentLogSize += Buffer.byteLength(logLine)
    } catch (error) {
      console.error('[Logger] Error writing to log file:', error)
    }

    // Also output to console for development/debugging
    const consoleMethods: Record<LogLevel, (...args: any[]) => void> = {
      debug: console.debug,
      info: console.log,
      warn: console.warn,
      error: console.error
    }

    consoleMethods[level](logLine)
  }

  public debug(module: string, message: string, data?: any): void {
    this.log('debug', module, message, data)
  }

  public info(module: string, message: string, data?: any): void {
    this.log('info', module, message, data)
  }

  public warn(module: string, message: string, data?: any): void {
    this.log('warn', module, message, data)
  }

  public error(module: string, message: string, data?: any): void {
    this.log('error', module, message, data)
  }

  /**
   * Get recent log entries for display
   */
  public getRecentLogs(lines: number = 50): string[] {
    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(this.logDir, `${today}.log`)
    
    if (!fs.existsSync(logFile)) {
      return []
    }

    try {
      const content = fs.readFileSync(logFile, 'utf8')
      const allLines = content.split('\n').filter(line => line.length > 0)
      
      // Return last N lines
      return allLines.slice(-lines)
    } catch (error) {
      console.error('[Logger] Error reading log file:', error)
      return []
    }
  }

  /**
   * Clear old logs (keep only today's)
   */
  public clearOldLogs(days: number = 7): void {
    try {
      const files = fs.readdirSync(this.logDir)
      const now = Date.now()
      
      for (const file of files) {
        if (!file.endsWith('.log')) continue
        
        const filePath = path.join(this.logDir, file)
        const stats = fs.statSync(filePath)
        const ageInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24)
        
        if (ageInDays > days && !file.includes('today')) {
          fs.unlinkSync(filePath)
          console.log(`[Logger] Removed old log file: ${file} (${Math.round(ageInDays)} days old)`)
        }
      }
    } catch (error) {
      console.error('[Logger] Error clearing old logs:', error)
    }
  }

  /**
   * Export logs to JSON for analysis
   */
  public exportLogs(format: 'json' | 'text' = 'text'): string {
    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(this.logDir, `${today}.log`)
    
    if (!fs.existsSync(logFile)) {
      return ''
    }

    try {
      const content = fs.readFileSync(logFile, 'utf8')
      
      if (format === 'json') {
        // Parse each line as JSON log entry
        const entries: LogEntry[] = []
        
        for (const line of content.split('\n')) {
          if (!line.trim()) continue
          
          try {
            // Extract timestamp, level, module from structured format
            const match = line.match(/^\[(.+?)\] \[(.+?)\] \[(.+?)\] (.+)$/)
            if (match) {
              entries.push({
                timestamp: match[1],
                level: match[2].toLowerCase() as LogLevel,
                module: match[3],
                message: match[4]
              })
            }
          } catch (error) {
            // Skip malformed lines
          }
        }
        
        return JSON.stringify(entries, null, 2)
      }
      
      return content
    } catch (error) {
      console.error('[Logger] Error exporting logs:', error)
      return ''
    }
  }
}

// Export singleton instance
export const logger = new Logger()
