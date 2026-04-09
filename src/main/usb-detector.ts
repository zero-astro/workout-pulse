import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import chokidar from 'chokidar'

export interface UsbDeviceEvent {
  type: 'connected' | 'disconnected' | 'workout-detected' | 'error'
  device?: string
  devicePath?: string
  filePath?: string
  error?: Error
  timestamp: number
}

export interface DeviceInfo {
  name: string
  path: string
  type: 'garmin' | 'fitbit' | 'apple-watch' | 'unknown'
  workoutFiles: string[]
}

export class RobustUsbDetector extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null
  private deviceDirs: DeviceInfo[] = []
  private isMonitoring = false
  private lastWorkoutScan = new Set<string>()
  private pollInterval: NodeJS.Timeout | null = null
  
  // Vendor IDs for common smartwatch brands (fallback detection)
  private knownVendorIds = {
    garmin: [0x0fc1],
    fitbit: [0x0fe6, 0x2357],
    apple: [0x05ac]
  }

  constructor() {
    super()
    this.discoverDevices()
  }

  /**
   * Discover all connected smartwatch devices with multiple detection methods
   */
  private discoverDevices(): void {
    const homeDir = os.homedir()
    
    // Method 1: Check common mount points and directories
    const possibleDirs = this.getPotentialDevicePaths(homeDir)
    
    // Method 2: Scan /Volumes for mounted devices (macOS/Unix)
    const mountedDevices = this.scanMountedDevices()
    
    // Combine and deduplicate
    const allPaths = [...new Set([...possibleDirs, ...mountedDevices])]
    
    // Analyze each path to identify device type
    this.deviceDirs = allPaths
      .map(dir => this.analyzeDevice(dir))
      .filter(device => device !== null) as DeviceInfo[]

    this.log('Discovered devices:', this.deviceDirs.map(d => `${d.type}:${d.name}`))
  }

  /**
   * Get potential device paths from common locations
   */
  private getPotentialDevicePaths(homeDir: string): string[] {
    const candidates = [
      // Garmin standard locations
      path.join(homeDir, 'Garmin'),
      '/Volumes/GARMIN',
      '/Volumes/Garmin',
      
      // Fitbit locations
      path.join(homeDir, 'Fitbit'),
      '/Volumes/FITBIT',
      
      // Apple Watch (usually mounted as iPhone)
      '/Volumes/iPhone',
      
      // Generic mount points
      '/Volumes/*'
    ]

    return candidates.filter(dir => {
      try {
        const exists = fs.existsSync(dir) || this.globExists(dir)
        return exists && fs.statSync(dir).isDirectory()
      } catch {
        return false
      }
    })
  }

  /**
   * Scan /Volumes for mounted USB devices
   */
  private scanMountedDevices(): string[] {
    const volumesDir = '/Volumes'
    
    if (!fs.existsSync(volumesDir)) return []
    
    try {
      const items = fs.readdirSync(volumesDir, { withFileTypes: true })
      return items
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(volumesDir, dirent.name))
    } catch (error) {
      console.error('[WorkoutPulse] Failed to scan /Volumes:', error)
      return []
    }
  }

  /**
   * Check if a glob pattern matches any files/directories
   */
  private globExists(pattern: string): boolean {
    try {
      const glob = require('glob')
      const results = glob.sync(pattern, { absolute: true })
      return results.length > 0
    } catch {
      // glob not available or pattern invalid, skip this check
      return false
    }
  }

  /**
   * Analyze a device path to determine its type and workout files
   */
  private analyzeDevice(dirPath: string): DeviceInfo | null {
    try {
      let deviceType: DeviceInfo['type'] = 'unknown'
      const workoutFiles: string[] = []
      
      // Check for Garmin-specific structure
      const garminFitnessDir = path.join(dirPath, 'Garmin', 'Fitness')
      if (fs.existsSync(garminFitnessDir)) {
        deviceType = 'garmin'
        workoutFiles.push(...this.findWorkoutFiles(garminFitnessDir))
      }
      
      // Check for Fitbit structure
      const fitbitDir = path.join(dirPath, 'Fitbit')
      if (fs.existsSync(fitbitDir)) {
        deviceType = 'fitbit'
        workoutFiles.push(...this.findWorkoutFiles(fitbitDir))
      }
      
      // Check for Apple Watch/iPhone structure
      const appleHealthDir = path.join(dirPath, 'HealthData')
      if (fs.existsSync(appleHealthDir)) {
        deviceType = 'apple-watch'
        workoutFiles.push(...this.findWorkoutFiles(appleHealthDir))
      }
      
      // If no specific type found but directory exists, it might still have workouts
      if (deviceType === 'unknown') {
        const rootWorkouts = this.findWorkoutFiles(dirPath)
        if (rootWorkouts.length > 0) {
          workoutFiles.push(...rootWorkouts)
          deviceType = 'unknown' // Could be any brand
        } else {
          return null // No workouts found, skip this device
        }
      }
      
      return {
        name: path.basename(dirPath),
        path: dirPath,
        type: deviceType,
        workoutFiles
      }
    } catch (error) {
      console.error('[WorkoutPulse] Error analyzing device:', error)
      return null
    }
  }

  /**
   * Find all workout files in a directory recursively
   */
  private findWorkoutFiles(dir: string): string[] {
    const extensions = ['.fit', '.gpx', '.tcx', '.kp']
    const files: string[] = []
    
    try {
      const walk = (currentDir: string) => {
        if (!fs.existsSync(currentDir)) return
        
        const items = fs.readdirSync(currentDir, { withFileTypes: true })
        
        for (const item of items) {
          const fullPath = path.join(currentDir, item.name)
          
          if (item.isDirectory()) {
            walk(fullPath)
          } else if (extensions.some(ext => item.name.endsWith(ext))) {
            files.push(fullPath)
          }
        }
      }
      
      walk(dir)
    } catch (error) {
      console.error('[WorkoutPulse] Error scanning for workout files:', error)
    }
    
    return files
  }

  /**
   * Helper to log messages conditionally based on environment
   */
  private log(...args: any[]): void {
    // Always log in test mode for debugging, but filter in production
    if (process.env.NODE_ENV === 'test') {
      console.log('[WorkoutPulse]', ...args)
    } else {
      console.log('[WorkoutPulse]', ...args)
    }
  }

  /**
   * Start monitoring USB connections with multiple fallback mechanisms
   */
  startMonitoring(): void {
    if (this.isMonitoring) return
    
    this.log('Starting robust USB monitor...')
    this.isMonitoring = true
    
    // Primary: File system watcher on known device directories
    this.deviceDirs.forEach(device => {
      this.watchDirectory(device.path, device.workoutFiles)
    })
    
    // Fallback 1: Watch /Volumes for new mount points
    this.watchMountPoints()
    
    // Fallback 2: Periodic polling (every 5 seconds) as ultimate fallback
    this.startPolling()
    
    // Initial scan after a short delay to catch any late-emerging devices
    const initialScan = setTimeout(() => {
      if (this.isMonitoring) {
        this.discoverDevices()
      }
    }, 1000)
    // Store reference for cleanup in stopMonitoring
    ;(this as any)._initialScanTimeout = initialScan
  }

  /**
   * Watch a specific device directory for file changes
   */
  private watchDirectory(dir: string, initialFiles: string[]): void {
    if (!fs.existsSync(dir)) return
    
    // Watch the entire directory tree for workout files
    const patterns = [`${dir}/**/*.fit`, `${dir}/**/*.gpx`, `${dir}/**/*.tcx`]
    
    this.watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500
      },
      ignored: ['*.tmp', '*.partial'] // Ignore temporary files
    })

    this.watcher
      .on('add', (filePath) => this.handleNewFile(filePath))
      .on('change', (filePath) => this.handleFileChange(filePath))
      .on('unlink', (filePath) => this.handleFileRemoved(filePath))
      .on('error', (error) => {
        console.error('[WorkoutPulse] Watcher error:', error)
        this.emit('error', {
          type: 'error' as const,
          error: new Error(`Watcher failed: ${error.message}`),
          timestamp: Date.now()
        })
      })

    this.log('Watching:', dir)
  }

  /**
   * Watch system mount points for new devices
   */
  private watchMountPoints(): void {
    const volumesDir = '/Volumes'
    
    if (!fs.existsSync(volumesDir)) return
    
    chokidar.watch(volumesDir, {
      persistent: true,
      ignoreInitial: false
    })
      .on('addDir', async (dirName) => {
        try {
          const devicePath = path.join(volumesDir, dirName as string)
          const stats = await fs.promises.stat(devicePath)
          
          if (stats.isDirectory()) {
            // Analyze the new device
            const deviceInfo = this.analyzeDevice(devicePath)
            
            if (deviceInfo && deviceInfo.workoutFiles.length > 0) {
              this.log('New device detected:', `${deviceInfo.name} (${deviceInfo.type})`)
              
              this.emit('connected', {
                type: 'connected' as const,
                device: deviceInfo.name,
                devicePath,
                timestamp: Date.now()
              })
              
              // Start watching this new directory
              this.watchDirectory(devicePath, deviceInfo.workoutFiles)
              
              // Emit workout-detected for any existing files
              deviceInfo.workoutFiles.forEach(filePath => {
                this.handleNewFile(filePath)
              })
            }
          }
        } catch (error) {
          this.log('Could not access new mount:', error)
        }
      })
  }

  /**
   * Periodic polling as fallback mechanism
   */
  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      if (!this.isMonitoring) return
      
      // Check for new devices
      const previousPaths = new Set(this.deviceDirs.map(d => d.path))
      this.discoverDevices()
      
      const newDevices = this.deviceDirs.filter(
        device => !previousPaths.has(device.path) && device.workoutFiles.length > 0
      )
      
      if (newDevices.length > 0) {
        this.log('Polling detected new devices:', newDevices.map(d => d.name))
        
        newDevices.forEach(device => {
          this.emit('connected', {
            type: 'connected' as const,
            device: device.name,
            devicePath: device.path,
            timestamp: Date.now()
          })
          
          // Start watching the new device
          this.watchDirectory(device.path, device.workoutFiles)
        })
      }
    }, 5000) // Check every 5 seconds
    
    // Unref to prevent Node from waiting for this timer during test cleanup
    if (this.pollInterval) {
      this.pollInterval.unref()
    }
    
    this.log('Polling fallback enabled (5s interval)')
  }

  /**
   * Handle newly detected workout file
   */
  private async handleNewFile(filePath: string): void {
    // Skip if already processed
    if (this.lastWorkoutScan.has(filePath)) return
    
    this.lastWorkoutScan.add(filePath)
    
    this.log('New workout detected:', filePath)
    
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
  private handleFileChange(filePath: string): void {
    // Re-scan the file if it's a new change
    this.log('File changed:', filePath)
    
    this.emit('workout-detected', {
      type: 'workout-detected' as const,
      filePath,
      timestamp: Date.now()
    })
  }

  /**
   * Handle file removal (device disconnected)
   */
  private handleFileRemoved(filePath: string): void {
    this.log('File removed:', filePath)
    
    // Check if this means device disconnection
    const relatedDevice = this.deviceDirs.find(device => 
      filePath.startsWith(device.path)
    )
    
    if (relatedDevice) {
      this.log('Possible device disconnect:', relatedDevice.name)
      
      this.emit('disconnected', {
        type: 'disconnected' as const,
        device: relatedDevice.name,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Stop all monitoring mechanisms
   */
  stopMonitoring(): void {
    // Clear initial scan timeout if still pending
    if ((this as any)._initialScanTimeout) {
      clearTimeout((this as any)._initialScanTimeout)
      ;(this as any)._initialScanTimeout = null
    }
    
    // Stop polling
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    
    // Stop file watcher
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    
    this.isMonitoring = false
  }

  /**
   * Get current monitoring status
   */
  isRunning(): boolean {
    return this.isMonitoring
  }

  /**
   * Get list of currently detected devices
   */
  getDetectedDevices(): DeviceInfo[] {
    return [...this.deviceDirs]
  }

  /**
   * Manually trigger device discovery (useful for testing)
   */
  refreshDeviceList(): void {
    console.log('[WorkoutPulse] Refreshing device list...')
    this.discoverDevices()
  }
}

// Export singleton instance
export const usbDetector = new RobustUsbDetector()

/**
 * Simple USB device detection function (non-streaming)
 */
export async function detectUsbDevice(): Promise<{ connected: boolean; device?: DeviceInfo }> {
  // Trigger initial discovery
  usbDetector.refreshDeviceList()
  
  const devices = usbDetector.getDetectedDevices()
  
  if (devices.length > 0) {
    return { connected: true, device: devices[0] }
  }
  
  return { connected: false }
}
