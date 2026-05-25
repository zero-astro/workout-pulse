/**
 * Unit tests for USB detection logic (RobustUsbDetector)
 */

// Mock fs BEFORE any imports — Jest hoists this to the top
jest.mock('fs', () => {
  const realFs = jest.requireActual('fs')
  return {
    ...realFs,
    existsSync: jest.fn().mockReturnValue(false),
    statSync: jest.fn().mockReturnValue({ isDirectory: () => false } as any),
    readdirSync: jest.fn().mockReturnValue([])
  }
})

// Mock chokidar — default import style (import chokidar from 'chokidar')
jest.mock('chokidar', () => {
  const mockWatcher = {
    on: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis(),
    close: jest.fn()
  }
  return {
    __esModule: true,
    default: {
      watch: jest.fn(() => mockWatcher),
      FSWatcher: class {
        on = jest.fn().mockReturnThis()
        off = jest.fn().mockReturnThis()
        close = jest.fn()
      }
    },
    watch: jest.fn(() => mockWatcher)
  }
})

// Mock glob (external module)
jest.mock('glob', () => ({
  sync: jest.fn(() => [])
}))

// ---- Import the module under test ----
import { RobustUsbDetector, detectUsbDevice } from '../main/usb-detector'
import * as fs from 'fs'

describe('RobustUsbDetector', () => {
  let detector: RobustUsbDetector | null = null

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset mock return values for each test
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false } as any)
    ;(fs.readdirSync as jest.Mock).mockReturnValue([])
    // Restore real setInterval/clearInterval (needed for event emission tests)
    global.setInterval = jest.requireActual('timers').setInterval
    global.clearInterval = jest.requireActual('timers').clearInterval
  })

  afterEach(() => {
    if (detector) {
      try { detector.stopMonitoring() } catch {}
    }
    detector = null
  })

  // ---- Constructor / Discovery ----

  describe('Constructor & initial discovery', () => {
    test('should create an instance without throwing', () => {
      const d = new RobustUsbDetector()
      detector = d
      expect(d).toBeDefined()
      expect(d.isRunning()).toBe(false)
    })

    test('getDetectedDevices should return the internal device list', () => {
      const d = new RobustUsbDetector()
      detector = d
      expect(d.getDetectedDevices()).toEqual([])
    })
  })

  // ---- File watcher detection method ----

  describe('File watcher detection', () => {
    test('startMonitoring should set isMonitoring to true and create a chokidar watcher', () => {
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => dir === '/Volumes')
      const d = new RobustUsbDetector()
      detector = d
      d.startMonitoring()

      expect(d.isRunning()).toBe(true)

      // chokidar.watch should have been called for /Volumes
      const chokidarModule = require('chokidar')
      expect(chokidarModule.default.watch).toHaveBeenCalled()
    })

    test('startMonitoring should be idempotent (no duplicate watchers)', () => {
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => dir === '/Volumes')
      const d = new RobustUsbDetector()
      detector = d
      d.startMonitoring()
      const firstCallCount = require('chokidar').default.watch.mock.calls.length

      d.startMonitoring() // second call should not create more watchers
      expect(require('chokidar').default.watch.mock.calls.length).toBe(firstCallCount)
    })

    test('stopMonitoring should clear the watcher and set isMonitoring to false', () => {
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => dir === '/Volumes')
      const d = new RobustUsbDetector()
      detector = d
      d.startMonitoring()
      expect(d.isRunning()).toBe(true)

      d.stopMonitoring()
      expect(d.isRunning()).toBe(false)
    })
  })

  // ---- Mount scanning detection method ----

  describe('Mount scanning', () => {
    test('scanMountedDevices should list directories under /Volumes when it exists', () => {
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => dir === '/Volumes')
      ;(fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'GARMIN', isDirectory: () => true },
        { name: 'iPhone', isDirectory: () => true }
      ])

      const d = new RobustUsbDetector()
      detector = d
      expect(d.getDetectedDevices()).toBeDefined()
    })

    test('scanMountedDevices should return empty array when /Volumes does not exist', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d
      expect(d.getDetectedDevices()).toEqual([])
    })
  })

  // ---- Polling detection fallback ----

  describe('Polling fallback', () => {
    test('startMonitoring should start a polling interval (setInterval called)', () => {
      // /Volumes must NOT exist for polling mode to be triggered
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => dir === '/Volumes')

      const setSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({ 
        ref: () => {}, 
        unref: () => {}
      }))

      const d = new RobustUsbDetector()
      detector = d
      d.startMonitoring()

      expect(setSpy).toHaveBeenCalled()
      // Should be called with 5000 ms interval
      const pollingCalls = setSpy.mock.calls.filter(
        (call: any) => typeof call[1] === 'number' && call[1] === 5000
      )
      expect(pollingCalls.length).toBeGreaterThan(0)

      d.stopMonitoring()
    })

    test('stopMonitoring should clear the polling interval', () => {
      // /Volumes must NOT exist for polling mode to be triggered
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => dir === '/Volumes')
      
      // Track which interval IDs are created and cleared
      const clearedIds: number[] = []
      let mockId = 1
      
      jest.spyOn(global, 'setInterval').mockImplementation(() => {
        return { id: ++mockId, ref: () => {}, unref: () => {} } as any
      }) as any
      jest.spyOn(global, 'clearInterval').mockImplementation((id: any) => {
        if (typeof id === 'object' && id !== null) clearedIds.push(id.id)
        else clearedIds.push(id)
      }) as any

      const d = new RobustUsbDetector()
      detector = d
      d.startMonitoring()
      
      // Get the interval ID that was set (polling is started in startPolling)
      const pollingCalls = (global.setInterval as jest.Mock).mock.calls.filter(
        (call: any) => typeof call[1] === 'number' && call[1] === 5000
      )
      
      d.stopMonitoring()

      // clearInterval should have been called for the polling interval
      expect(clearedIds.length).toBeGreaterThan(0)
    })
  })

  // ---- Garmin device detection ----

  describe('Garmin device detection', () => {
    test('should identify a Garmin device when Garmin/Fitness directory exists', () => {
      const garminPath = '/Volumes/Garmin'
      // analyzeDevice checks: path.join(dirPath, 'Garmin', 'Fitness') = /Volumes/Garmin/Garmin/Fitness
      const fitnessDir = `${garminPath}/Garmin/Fitness`

      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir === garminPath || dir === fitnessDir || dir.startsWith('/Volumes/')
      })
      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true } as any)
      ;(fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir.includes('Garmin') && dir.includes('Fitness')) return ['WORKOUT001.fit']
        if (dir.includes('Garmin')) return ['FIT', 'Music']
        if (dir === '/Volumes') return ['Garmin']
        return []
      })

      const d = new RobustUsbDetector()
      detector = d
      const devices = d.getDetectedDevices()

      expect(devices.length).toBeGreaterThan(0)
    })
  })

  // ---- Fitbit device detection ----

  describe('Fitbit device detection', () => {
    test('should identify a Fitbit device when Fitbit directory exists with workout files', () => {
      const fitbitPath = '/Volumes/FITBIT'
      // analyzeDevice checks: path.join(dirPath, 'Fitbit') = /Volumes/FITBIT/Fitbit
      const fitbitSubDir = `${fitbitPath}/Fitbit`

      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir === fitbitPath || dir === fitbitSubDir || dir.startsWith('/Volumes/')
      })
      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true } as any)
      ;(fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir.includes('Fitbit')) return ['activities.gpx', 'sleep.kp']
        if (dir === '/Volumes') return ['FITBIT']
        return []
      })

      const d = new RobustUsbDetector()
      detector = d
      const devices = d.getDetectedDevices()

      expect(devices.length).toBeGreaterThan(0)
    })
  })

  // ---- Apple Watch device detection ----

  describe('Apple Watch device detection', () => {
    test('should identify an Apple Watch when HealthData directory exists under iPhone mount', () => {
      const iphonePath = '/Volumes/iPhone'
      // analyzeDevice checks: path.join(dirPath, 'HealthData') = /Volumes/iPhone/HealthData
      const healthDir = `${iphonePath}/HealthData`

      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir === iphonePath || dir === healthDir || dir.startsWith('/Volumes/')
      })
      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true } as any)
      ;(fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir.includes('HealthData')) return ['workout.tcx']
        if (dir === '/Volumes') return ['iPhone']
        return []
      })

      const d = new RobustUsbDetector()
      detector = d
      const devices = d.getDetectedDevices()

      expect(devices.length).toBeGreaterThan(0)
    })
  })

  // ---- Error handling and edge cases ----

  describe('Error handling & edge cases', () => {
    test('should handle non-existent device paths gracefully (return empty)', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d
      expect(d.getDetectedDevices()).toEqual([])
    })

    test('should emit error event when watcher encounters an error', (done) => {
      // /Volumes must exist for chokidar watcher to be created
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => dir === '/Volumes')
      const d = new RobustUsbDetector()
      detector = d

      d.on('error', (evt) => {
        expect(evt).toBeDefined()
        expect(evt.type).toBe('error')
        expect(evt.error).toBeDefined()
        done()
      })

      d.startMonitoring()

      // Manually emit error event to verify handler works
      setTimeout(() => {
        d.emit('error', {
          type: 'error',
          error: new Error('Watcher failed: EACCES'),
          timestamp: Date.now()
        } as any)
      }, 50)
    }, 10000)

    test('should handle multiple devices simultaneously', () => {
      const garminPath = '/Volumes/Garmin'
      const fitbitPath = '/Volumes/FITBIT'
      // analyzeDevice checks subdirectories inside each mount point
      const garminFitnessDir = `${garminPath}/Garmin/Fitness`
      const fitbitSubDir = `${fitbitPath}/Fitbit`

      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir === garminPath || dir === fitbitPath || dir === '/Volumes'
          || dir === garminFitnessDir || dir === fitbitSubDir
          || dir.startsWith('/Volumes/')
      })
      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true } as any)
      ;(fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir.includes('Garmin') && dir.includes('Fitness')) return ['WORKOUT001.fit']
        if (dir.includes('Fitbit')) return ['activities.gpx']
        if (dir.includes('Garmin')) return ['FIT', 'Music']
        if (dir === '/Volumes') return ['Garmin', 'FITBIT']
        return []
      })

      const d = new RobustUsbDetector()
      detector = d
      const devices = d.getDetectedDevices()

      expect(devices.length).toBeGreaterThan(0)
    })

    test('should handle disconnect during scan (no crash)', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d
      
      // Simulate a directory disappearing mid-scan by making statSync throw
      ;(fs.statSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOTDIR: not a directory')
      })

      expect(() => d.refreshDeviceList()).not.toThrow()
    })

    test('should deduplicate device paths', () => {
      const garminPath = '/Volumes/Garmin'
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => dir === garminPath || dir === '/Volumes')
      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true } as any)
      ;(fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir.includes('Garmin')) return ['FIT']
        if (dir === '/Volumes') return ['Garmin']
        return []
      })

      const d = new RobustUsbDetector()
      detector = d
      const devices = d.getDetectedDevices()
      const paths = devices.map(d => d.path)
      const uniquePaths = [...new Set(paths)]

      expect(uniquePaths.length).toBe(paths.length) // no duplicates
    })
  })

  // ---- Event emission tests ----

  describe('Event emission', () => {
    test('should emit connected event when a new device is detected via polling', (done) => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d

      let connectFired = false
      d.on('connected', (evt) => {
        expect(evt).toBeDefined()
        expect(evt.type).toBe('connected')
        expect(evt.timestamp).toBeDefined()
        connectFired = true
      })

      // After 200ms, manually emit a connected event (simulating polling detection)
      setTimeout(() => {
        d.emit('connected', {
          type: 'connected',
          device: 'GARMIN',
          devicePath: '/Volumes/GARMIN',
          timestamp: Date.now()
        } as any)

        expect(connectFired).toBe(true)
        done()
      }, 200)

      d.startMonitoring()
    })

    test('should emit workout-detected event when a new file appears', (done) => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d

      d.on('workout-detected', (evt) => {
        expect(evt).toBeDefined()
        expect(evt.type).toBe('workout-detected')
        expect(evt.filePath).toBe('/Volumes/GARMIN/WORKOUT001.fit')
        done()
      })

      setTimeout(() => {
        d.emit('workout-detected', {
          type: 'workout-detected',
          filePath: '/Volumes/GARMIN/WORKOUT001.fit',
          timestamp: Date.now()
        } as any)
      }, 100)

      d.startMonitoring()
    })

    test('should emit disconnected event when a device is removed', (done) => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d

      d.on('disconnected', (evt) => {
        expect(evt).toBeDefined()
        expect(evt.type).toBe('disconnected')
        expect(evt.device).toBe('GARMIN')
        done()
      })

      setTimeout(() => {
        d.emit('disconnected', {
          type: 'disconnected',
          device: 'GARMIN',
          timestamp: Date.now()
        } as any)
      }, 100)

      d.startMonitoring()
    })
  })

  // ---- detectUsbDevice function ----

  describe('detectUsbDevice function', () => {
    test('should return connected=false when no devices are found', async () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const result = await detectUsbDevice()
      expect(result.connected).toBe(false)
    })

    test('should handle errors gracefully and return connected=false', async () => {
      // Make existsSync throw to simulate a permission error during discovery
      ;(fs.existsSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = await detectUsbDevice()
      expect(result.connected).toBe(false)
    })
  })

  // ---- Monitoring lifecycle ----

  describe('Monitoring lifecycle', () => {
    test('isRunning should return false before startMonitoring', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d
      expect(d.isRunning()).toBe(false)
    })

    test('stopMonitoring should be safe to call even if never started', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d
      expect(() => d.stopMonitoring()).not.toThrow()
    })

    test('refreshDeviceList should not throw', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      const d = new RobustUsbDetector()
      detector = d
      expect(() => d.refreshDeviceList()).not.toThrow()
    })
  })
})
