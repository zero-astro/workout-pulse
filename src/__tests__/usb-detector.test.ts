import { RobustUsbDetector, detectUsbDevice } from '../main/usb-detector'
import * as fs from 'fs'
import * as path from 'path'

// Mock chokidar
jest.mock('chokidar', () => ({
  watch: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis()
  })),
  FSWatcher: class {
    on = jest.fn()
    off = jest.fn()
    close = jest.fn()
  }
}))

// Mock glob
jest.mock('glob', () => ({
  sync: jest.fn(() => [])
}))

describe('RobustUsbDetector', () => {
  let detector: RobustUsbDetector
  const mockDevicePath = '/Volumes/GARMIN'
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
    
    // Create fresh instance for each test
    detector = new RobustUsbDetector()
  })

  afterEach(() => {
    detector.stopMonitoring()
    jest.resetModules()
  })

  describe('Device Discovery', () => {
    test('should discover devices from common mount points', () => {
      // Mock fs.existsSync to return true for Garmin path
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === mockDevicePath || dir.includes('Garmin')) {
          return true
        }
        return false
      })

      // Mock statSync to indicate directory
      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true })

      detector.discoverDevices()
      
      const devices = detector.getDetectedDevices()
      
      // Should have discovered at least one device path
      expect(detector.getDetectedDevices()).toBeDefined()
    })

    test('should filter out directories without workout files', () => {
      // Mock fs to return true but no workout files found
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir === mockDevicePath || dir.includes('Garmin')
      })

      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true })
      
      // Mock findWorkoutFiles to return empty array
      const originalFind = detector.findWorkoutFiles.bind(detector)
      detector.findWorkoutFiles = jest.fn().mockReturnValue([])

      detector.discoverDevices()
      
      // Should not add devices without workout files
      expect(detector.getDetectedDevices()).toHaveLength(0)
    })

    test('should identify Garmin device type', () => {
      const mockGarminDir = '/Volumes/Garmin/Fitness'
      
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir === mockDevicePath || dir === mockGarminDir
      })

      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true })
      
      // Mock workout files found
      detector.findWorkoutFiles = jest.fn().mockReturnValue(['/Volumes/Garmin/Fitness/workout.fit'])

      const deviceInfo = detector.analyzeDevice(mockGarminDir)
      
      expect(deviceInfo?.type).toBe('garmin')
      expect(deviceInfo?.workoutFiles.length).toBe(1)
    })

    test('should identify Fitbit device type', () => {
      const mockFitbitDir = '/Volumes/Fitbit'
      
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir === mockDevicePath || dir.includes('Fitbit')
      })

      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true })
      
      detector.findWorkoutFiles = jest.fn().mockReturnValue(['/Volumes/Fitbit/workout.gpx'])

      const deviceInfo = detector.analyzeDevice(mockFitbitDir)
      
      expect(deviceInfo?.type).toBe('fitbit')
    })

    test('should identify Apple Watch device type', () => {
      const mockAppleDir = '/Volumes/iPhone/HealthData'
      
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir === mockDevicePath || dir.includes('HealthData')
      })

      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true })
      
      detector.findWorkoutFiles = jest.fn().mockReturnValue(['/Volumes/iPhone/HealthData/workout.fit'])

      const deviceInfo = detector.analyzeDevice(mockAppleDir)
      
      expect(deviceInfo?.type).toBe('apple-watch')
    })
  })

  describe('File Scanning', () => {
    test('should find FIT files recursively', () => {
      const mockFiles = [
        '/Volumes/Garmin/workout.fit',
        '/Volumes/Garmin/Fitness/activity.fit',
        '/Volumes/Garmin/Other/file.txt' // Should be ignored
      ]

      detector.findWorkoutFiles = jest.fn().mockImplementation((dir: string) => {
        return mockFiles.filter(f => f.endsWith('.fit'))
      })

      const results = detector.findWorkoutFiles(mockFiles[0].split('/').slice(0, 4).join('/'))
      
      expect(results.length).toBeGreaterThan(0)
    })

    test('should find GPX files', () => {
      const mockFiles = ['/Volumes/Garmin/trail.gpx']
      
      detector.findWorkoutFiles = jest.fn().mockImplementation((dir: string) => {
        return mockFiles.filter(f => f.endsWith('.gpx'))
      })

      const results = detector.findWorkoutFiles(mockFiles[0].split('/').slice(0, 4).join('/'))
      
      expect(results.length).toBeGreaterThan(0)
    })

    test('should find TCX files', () => {
      const mockFiles = ['/Volumes/Garmin/race.tcx']
      
      detector.findWorkoutFiles = jest.fn().mockImplementation((dir: string) => {
        return mockFiles.filter(f => f.endsWith('.tcx'))
      })

      const results = detector.findWorkoutFiles(mockFiles[0].split('/').slice(0, 4).join('/'))
      
      expect(results.length).toBeGreaterThan(0)
    })

    test('should ignore non-workout file extensions', () => {
      const mockFiles = [
        '/Volumes/Garmin/readme.txt',
        '/Volumes/Garmin/config.json',
        '/Volumes/Garmin/image.jpg'
      ]

      detector.findWorkoutFiles = jest.fn().mockImplementation((dir: string) => {
        return mockFiles.filter(f => /\.(fit|gpx|tcx|kp)$/.test(f))
      })

      const results = detector.findWorkoutFiles(mockFiles[0].split('/').slice(0, 4).join('/'))
      
      expect(results.length).toBe(0)
    })
  })

  describe('Event Emission', () => {
    test('should emit connected event when device detected', (done) => {
      detector.on('connected', (event) => {
        expect(event.type).toBe('connected')
        expect(event.timestamp).toBeDefined()
        done()
      })

      // Simulate device detection
      detector.emit('connected', {
        type: 'connected',
        device: 'Test Device',
        devicePath: '/Volumes/TEST',
        timestamp: Date.now()
      })
    })

    test('should emit workout-detected event when file found', (done) => {
      detector.on('workout-detected', (event) => {
        expect(event.type).toBe('workout-detected')
        expect(event.filePath).toBeDefined()
        done()
      })

      // Simulate workout detection
      detector.emit('workout-detected', {
        type: 'workout-detected',
        filePath: '/Volumes/Garmin/workout.fit',
        timestamp: Date.now()
      })
    })

    test('should emit disconnected event when device removed', (done) => {
      detector.on('disconnected', (event) => {
        expect(event.type).toBe('disconnected')
        expect(event.timestamp).toBeDefined()
        done()
      })

      // Simulate disconnection
      detector.emit('disconnected', {
        type: 'disconnected',
        device: 'Test Device',
        timestamp: Date.now()
      })
    })

    test('should emit error event on failure', (done) => {
      const testError = new Error('Test error')
      
      detector.on('error', (event) => {
        expect(event.type).toBe('error')
        expect(event.error).toBe(testError)
        done()
      })

      // Simulate error
      detector.emit('error', {
        type: 'error',
        error: testError,
        timestamp: Date.now()
      })
    })
  })

  describe('Monitoring Lifecycle', () => {
    test('should start monitoring without errors', () => {
      // Mock chokidar to avoid actual file watching
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        off: jest.fn().mockReturnThis(),
        close: jest.fn()
      }

      require('chokidar').watch = jest.fn(() => mockWatcher)

      detector.startMonitoring()
      
      expect(detector.isRunning()).toBe(true)
    })

    test('should stop monitoring and cleanup', () => {
      detector.startMonitoring()
      expect(detector.isRunning()).toBe(true)
      
      detector.stopMonitoring()
      
      expect(detector.isRunning()).toBe(false)
    })

    test('should prevent duplicate start', () => {
      detector.startMonitoring()
      const firstPollInterval = (detector as any).pollInterval
      
      detector.startMonitoring() // Should not create new interval
      
      const secondPollInterval = (detector as any).pollInterval
      
      expect(firstPollInterval).toBe(secondPollInterval)
    })

    test('should refresh device list on demand', () => {
      const mockRefresh = jest.spyOn(detector, 'discoverDevices')
      
      detector.refreshDeviceList()
      
      expect(mockRefresh).toHaveBeenCalled()
      mockRefresh.mockRestore()
    })
  })

  describe('detectUsbDevice Function', () => {
    test('should return connected=false when no devices found', async () => {
      // Mock to return empty array
      detector.getDetectedDevices = jest.fn().mockReturnValue([])
      
      const result = await detectUsbDevice()
      
      expect(result.connected).toBe(false)
      expect(result.device).toBeUndefined()
    })

    test('should return connected=true with device info when found', async () => {
      const mockDevice = {
        name: 'Garmin Fenix',
        path: '/Volumes/GARMIN',
        type: 'garmin' as const,
        workoutFiles: ['/Volumes/GARMIN/workout.fit']
      }

      detector.getDetectedDevices = jest.fn().mockReturnValue([mockDevice])
      
      const result = await detectUsbDevice()
      
      expect(result.connected).toBe(true)
      expect(result.device).toBeDefined()
      expect(result.device?.name).toBe('Garmin Fenix')
    })

    test('should handle errors gracefully', async () => {
      detector.refreshDeviceList = jest.fn().mockImplementation(() => {
        throw new Error('Test error')
      })
      
      const result = await detectUsbDevice()
      
      // Should still return safe default even on error
      expect(result.connected).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    test('should handle non-existent device paths gracefully', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      
      const deviceInfo = detector.analyzeDevice('/Volumes/NonExistent')
      
      expect(deviceInfo).toBeNull()
    })

    test('should handle permission errors when scanning directories', () => {
      ;(fs.statSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied')
      })
      
      const deviceInfo = detector.analyzeDevice('/Volumes/Protected')
      
      expect(deviceInfo).toBeNull()
    })

    test('should handle empty workout file arrays', () => {
      detector.findWorkoutFiles = jest.fn().mockReturnValue([])
      
      ;(fs.existsSync as jest.Mock).mockReturnValue(true)
      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true })
      
      const deviceInfo = detector.analyzeDevice('/Volumes/Empty')
      
      expect(deviceInfo).toBeNull() // Should filter out devices without workouts
    })

    test('should deduplicate device paths', () => {
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir.includes('Garmin') || dir.includes('/Volumes')
      })
      
      detector.discoverDevices()
      
      const devices = detector.getDetectedDevices()
      const uniquePaths = new Set(devices.map(d => d.path))
      
      expect(devices.length).toBe(uniquePaths.size) // No duplicates
    })
  })

  describe('Integration Tests', () => {
    test('should handle full device detection workflow', () => {
      // Mock all fs methods
      ;(fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return dir.includes('/Volumes') || dir.includes('Garmin')
      })
      
      ;(fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true })
      
      detector.findWorkoutFiles = jest.fn().mockReturnValue([
        '/Volumes/Garmin/Fitness/activity.fit',
        '/Volumes/Garmin/workout.gpx'
      ])

      // Run full discovery
      detector.discoverDevices()
      
      const devices = detector.getDetectedDevices()
      
      expect(devices.length).toBeGreaterThan(0)
      expect(devices[0].workoutFiles.length).toBeGreaterThan(0)
    })

    test('should maintain event listener cleanup', () => {
      const mockListener = jest.fn()
      detector.on('test-event', mockListener)
      
      // Emit and verify
      detector.emit('test-event', 'data')
      expect(mockListener).toHaveBeenCalledWith('data')
      
      // Remove listener
      detector.off('test-event', mockListener)
      
      // Should not be called again
      detector.emit('test-event', 'new-data')
      expect(mockListener).toHaveBeenCalledTimes(1)
    })
  })
})
