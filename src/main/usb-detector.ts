import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import chokidar from 'chokidar'

export interface UsbDeviceEvent {
  type: 'connected' | 'disconnected' | 'workout-detected'
  device?: string
  filePath?: string
  timestamp: number
}

export class GarminUsbDetector extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null
  private garminDirs: string[] = []
  private isMonitoring = false
  private lastWorkoutScan = new Set<string>()

  constructor() {
    super()
    this.discoverGarminDirectories()
  }

  /**
   * Discover Garmin directories on macOS
   */
  private discoverGarminDirectories() {
    const homeDir = process.env.HOME || ''
    
    // Common Garmin mount points on macOS
    const possibleDirs = [
      path.join(homeDir, 'Garmin'),
      path.join('/Volumes', 'GARMIN'),
      path.join('/Volumes', 'Garmin')
    ]

    this.garminDirs = possibleDirs.filter(dir => {
      try {
        return fs.existsSync(dir) && fs.statSync(dir).isDirectory()
      } catch {
        return false
      }
    })

    console.log('[WorkoutPulse] Found Garmin directories:', this.garminDirs)
  }

  /**
   * Start monitoring USB connections and workout files
   */
  startMonitoring() {
    if (this.isMonitoring) return

    console.log('[WorkoutPulse] Starting Garmin USB monitor...')
    this.isMonitoring = true

    // Monitor each discovered Garmin directory
    this.garminDirs.forEach(dir => {
      this.watchDirectory(dir)
    })

    // Also watch for new mount points (in case Garmin wasn't detected initially)
    this.watchMountPoints()
  }

  /**
   * Watch a specific directory for file changes
   */
  private watchDirectory(dir: string) {
    if (!fs.existsSync(dir)) return

    const fitnessDir = path.join(dir, 'Garmin', 'Fitness')
    
    // Watch for new workout files (.fit, .gpx, .tcx)
    const patterns = [
      `${fitnessDir}/**/*.fit`,
      `${fitnessDir}/**/*.gpx`,
      `${dir}/**/*workout*`
    ]

    this.watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500
      }
    })

    this.watcher
      .on('add', (filePath) => this.handleNewFile(filePath))
      .on('change', (filePath) => this.handleFileChange(filePath))
      .on('error', (error) => console.error('[WorkoutPulse] Watcher error:', error))

    console.log(`[WorkoutPulse] Watching: ${fitnessDir}`)
  }

  /**
   * Watch system mount points for new devices
   */
  private watchMountPoints() {
    // macOS mounts external devices in /Volumes
    const volumesDir = '/Volumes'
    
    if (!fs.existsSync(volumesDir)) return

    chokidar.watch(volumesDir, {
      persistent: true,
      ignoreInitial: false
    })
      .on('addDir', async (dirName) => {
        // Check if it's a Garmin device
        const devicePath = path.join(volumesDir, dirName as string)
        
        try {
          const stats = await fs.promises.stat(devicePath)
          if (stats.isDirectory()) {
            // Look for Garmin-specific files/directories
            const fitnessFile = path.join(devicePath, 'Garmin', 'Fitness')
            if (fs.existsSync(fitnessFile)) {
              this.emitDeviceConnected(dirName as string, devicePath)
              
              // Start watching this new directory
              this.watchDirectory(devicePath)
            }
          }
        } catch (error) {
          console.log('[WorkoutPulse] Could not access mount:', error)
        }
      })
  }

  /**
   * Handle newly detected workout file
   */
  private async handleNewFile(filePath: string) {
    // Skip if already processed
    if (this.lastWorkoutScan.has(filePath)) return
    
    this.lastWorkoutScan.add(filePath)
    
    console.log('[WorkoutPulse] New workout detected:', filePath)
    
    this.emit('workout-detected', {
      type: 'workout-detected' as const,
      filePath,
      timestamp: Date.now()
    })

    // Clean up after 5 minutes
    setTimeout(() => this.lastWorkoutScan.delete(filePath), 300 * 1000)
  }

  /**
   * Handle file changes (in case workout is still being written)
   */
  private handleFileChange(filePath: string) {
    // Could trigger re-scan if needed
    console.log('[WorkoutPulse] File changed:', filePath)
  }

  /**
   * Emit device connection event
   */
  private emitDeviceConnected(name: string, path: string) {
    this.emit('connected', {
      type: 'connected' as const,
      device: name,
      devicePath: path,
      timestamp: Date.now()
    })

    console.log(`[WorkoutPulse] Device connected: ${name}`)
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.isMonitoring = false
    console.log('[WorkoutPulse] USB monitor stopped')
  }

  /**
   * Get current monitoring status
   */
  isRunning(): boolean {
    return this.isMonitoring
  }
}

// Export singleton instance
export const usbDetector = new GarminUsbDetector()
