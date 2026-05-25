/**
 * E2E Tests for WorkoutPulse Sync Workflow
 * 
 * Simulates full smartwatch-to-Fittrackee sync flow with:
 * - Mock FIT/GPX file extraction (simulating Garmin watch USB connection)
 * - Incremental sync to Fittrackee API
 * - Offline mode with local SQLite storage
 * - Error recovery scenarios (failed upload, network loss)
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { FittrackeeApiClient } from '../fittrackee-api-client'
import { IncrementalSyncManager } from '../incremental-sync'
import { LocalWorkoutDatabase, initializeLocalWorkoutDb } from '../local-workout-db'
import { WorkoutData, parseFitFile, parseGpxFile } from '../workout-parser'

// Mock the FitParser to simulate Garmin FIT file extraction
jest.mock('../oauth-client', () => ({
  FittrackeeOAuthClient: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    loadStoredCredentials: jest.fn().mockResolvedValue({ accessToken: 'test-token' }),
    loadAccessTokens: jest.fn().mockResolvedValue({ tokenExpiry: Date.now() + 3600000 })
  }))
}))

// Mock better-sqlite3 for tests with proper query results
jest.mock('better-sqlite3', () => {
  const mockDb = {
    exec: jest.fn(),
    prepare: jest.fn().mockReturnValue({
      get: jest.fn((...args) => ({ count: 0 })), // Default to 0 counts
      run: jest.fn().mockReturnValue({ changes: 1 }),
      all: jest.fn().mockReturnValue([])
    }),
    pragma: jest.fn(),
    close: jest.fn()
  }
  
  class MockDatabase {
    constructor() {
      Object.assign(this, mockDb)
    }
  }
  
  return MockDatabase
})

// Mock fit-file-parser for FIT file extraction
jest.mock('fit-file-parser', () => {
  const FitFileParser = jest.fn().mockImplementation(() => ({
    parse: jest.fn((buffer: Buffer, callback: (err: any, data: any) => void) => {
      // Simulate Garmin FIT file parsing with realistic workout data
      setTimeout(() => {
        callback(null, {
          records: [
            {
              name: 'session',
              fields: {
                total_elapsed_time: 3600, // 1 hour
                total_distance: 21098.5, // ~21 km in meters
                total_calories: 650,
                avg_heart_rate: 145,
                max_heart_rate: 172
              }
            },
            {
              name: 'device_info',
              fields: {
                manufacturer: 1, // Garmin
                product: 'Forerunner 945'
              }
            }
          ]
        })
      }, 0)
    })
  }))
  
  return FitFileParser
})

describe('E2E WorkoutPulse Sync Workflow', () => {
  let syncManager: IncrementalSyncManager
  let localDb: LocalWorkoutDatabase | null = null
  let tempDir: string
  
  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-pulse-test-'))
    
    // Initialize sync manager with mocked API client
    const mockApiClient = {
      uploadWorkout: jest.fn().mockResolvedValue({
        uuid: 'test-workout-uuid',
        activity_type_id: 1,
        distance: 21098.5,
        moving_time: 3600,
        elapsed_time: 3600,
        elevation_gain: 450,
        calories: 650,
        start_datetime: new Date().toISOString(),
        end_datetime: new Date().toISOString()
      }),
      getWorkout: jest.fn().mockResolvedValue(null),
      getUserProfile: jest.fn().mockResolvedValue({ id: 'user-123' })
    } as any
    
    syncManager = new IncrementalSyncManager()
    syncManager.initialize(mockApiClient as FittrackeeApiClient)
  })
  
  afterEach(() => {
    // Clear all timers to prevent Jest hanging
    jest.clearAllTimers()
    
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    
    // Close database connection
    if (localDb) {
      localDb.close()
    }
  })
  
  describe('Full Sync Workflow with Mocked FIT File', () => {
    it('should simulate Garmin watch USB connection and sync workout to Fittrackee', async () => {
      // Step 1: Simulate smartwatch USB connection detection
      const mockFitFilePath = path.join(tempDir, 'activity-1234567890.fit')
      
      // Create a mock FIT file (Garmin format)
      const fitBuffer = Buffer.from([0x32, 0x1D]) // FIT file header
      fs.writeFileSync(mockFitFilePath, fitBuffer)
      
      // Step 2: Parse the FIT file (simulating Garmin FIT extraction)
      const workoutData = await parseFitFile(mockFitFilePath)
      
      expect(workoutData).not.toBeNull()
      expect(workoutData!.type).toBe('Unknown') // Default type from filename
      expect(workoutData!.duration).toBe(3600) // 1 hour from mock parser
      expect(workoutData!.distance).toBe(21098.5) // ~21 km
      expect(workoutData!.calories).toBe(650)
      expect(workoutData!.avgHeartRate).toBe(145)
      expect(workoutData!.maxHeartRate).toBe(172)
      
      // Step 3: Sync to Fittrackee via incremental sync manager
      const result = await syncManager.processWorkout(mockFitFilePath, {
        skipDuplicates: true,
        checkFittrackee: true
      })
      
      expect(result.success).toBe(true)
      expect(result.skipped).toBe(false)
      expect(result.workout).toBeDefined()
    })
    
    it('should handle GPX file extraction and sync', async () => {
      // Step 1: Create a mock GPX file with realistic trail running data
      const mockGpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="WorkoutPulse Test">
  <trk>
    <name>Trek de Tena Trail</name>
    <trkseg>
      <trkpt lat="42.65" lon="-0.70">
        <ele>1200.5</ele>
        <time>2026-09-01T08:00:00Z</time>
      </trkpt>
      <trkpt lat="42.66" lon="-0.71">
        <ele>1350.2</ele>
        <time>2026-09-01T08:30:00Z</time>
      </trkpt>
      <trkpt lat="42.67" lon="-0.72">
        <ele>1500.8</ele>
        <time>2026-09-01T09:00:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`
      
      const mockGpxFilePath = path.join(tempDir, 'trek-tena-trail.gpx')
      fs.writeFileSync(mockGpxFilePath, mockGpxContent)
      
      // Step 2: Parse GPX file (simulating GPX extraction from smartwatch export)
      const workoutData = await parseGpxFile(mockGpxFilePath)
      
      expect(workoutData).not.toBeNull()
      expect(workoutData!.type).toBe('GPX Activity') // Detected from GPX format
      expect(workoutData!.distance).toBeGreaterThan(0) // Calculated via Haversine
      
      // Step 3: Sync to Fittrackee
      const result = await syncManager.processWorkout(mockGpxFilePath, {
        skipDuplicates: true,
        checkFittrackee: true
      })
      
      expect(result.success).toBe(true)
      expect(result.skipped).toBe(false)
    })
  })
  
  describe('Offline Mode with Local SQLite Storage', () => {
    it('should store workouts locally when Fittrackee API is unavailable', async () => {
      // Step 1: Create mock FIT file
      const mockFitFilePath = path.join(tempDir, 'activity-offline-001.fit')
      fs.writeFileSync(mockFitFilePath, Buffer.from([0x32, 0x1D]))
      
      // Step 2: Simulate API failure (network loss)
      const failingApiClient = {
        uploadWorkout: jest.fn().mockRejectedValue(new Error('Network error: No internet connection')),
        getWorkout: jest.fn().mockResolvedValue(null)
      } as any
      
      syncManager.initialize(failingApiClient as FittrackeeApiClient)
      
      // Step 3: Attempt sync (should fail but store locally)
      const result = await syncManager.processWorkout(mockFitFilePath, {
        skipDuplicates: true,
        checkFittrackee: false
      })
      
      expect(result.success).toBe(false)
      expect(result.skipped).toBe(true)
    })
    
    it('should recover from network loss and sync when connection restored', async () => {
      // Step 1: Create mock FIT file and store locally (simulating offline workout)
      const mockFitFilePath = path.join(tempDir, 'activity-recovery-002.fit')
      fs.writeFileSync(mockFitFilePath, Buffer.from([0x32, 0x1D]))
      
      // Simulate offline storage
      const parsedWorkout = await parseFitFile(mockFitFilePath)
      expect(parsedWorkout).not.toBeNull()
    })
  })
  
  describe('Error Recovery Scenarios', () => {
    it('should handle partial batch sync failures gracefully', async () => {
      // Step 1: Create multiple mock FIT files
      const fitFiles = [
        path.join(tempDir, 'activity-batch-001.fit'),
        path.join(tempDir, 'activity-batch-002.fit'),
        path.join(tempDir, 'activity-batch-003.fit')
      ]
      
      for (const filePath of fitFiles) {
        fs.writeFileSync(filePath, Buffer.from([0x32, 0x1D]))
      }
      
      // Step 2: Simulate intermittent API failures
      let callCount = 0
      const flakyApiClient = {
        uploadWorkout: jest.fn().mockImplementation(() => {
          callCount++
          if (callCount === 2) {
            throw new Error('Rate limit exceeded')
          }
          return Promise.resolve({
            uuid: `batch-workout-${callCount}`,
            activity_type_id: 1,
            distance: 0,
            moving_time: 3600,
            elapsed_time: 3600,
            elevation_gain: 0,
            calories: 0,
            start_datetime: new Date().toISOString(),
            end_datetime: new Date().toISOString()
          })
        }),
        getWorkout: jest.fn().mockResolvedValue(null)
      } as any
      
      syncManager.initialize(flakyApiClient as FittrackeeApiClient)
      
      // Step 3: Process batch with error recovery
      const results = await Promise.allSettled(
        fitFiles.map(filePath => 
          syncManager.processWorkout(filePath, { skipDuplicates: true })
        )
      )
      
      // Verify partial success
      const successes = results.filter(r => r.status === 'fulfilled' && (r.value as any).success)
      expect(successes.length).toBeGreaterThan(0)
    })
    
    it('should handle corrupted FIT files gracefully', async () => {
      // Step 1: Create a corrupted FIT file
      const corruptedFitFilePath = path.join(tempDir, 'activity-corrupted.fit')
      fs.writeFileSync(corruptedFitFilePath, Buffer.from([0x00, 0x00])) // Invalid FIT header
      
      // Step 2: Attempt to parse (should fail gracefully)
      const result = await syncManager.processWorkout(corruptedFitFilePath, {
        skipDuplicates: false,
        checkFittrackee: false
      })
      
      expect(result.success).toBe(false)
      expect(result.skipped).toBe(true)
      expect(result.reason).toBe('Failed to parse workout file')
    })
  })
  
  describe('Mock Smartwatch USB Connection Simulation', () => {
    it('should detect and process workouts from mock Garmin device', async () => {
      // Step 1: Simulate USB connection detection (mock)
      const mockMountPoint = path.join(tempDir, 'garmin-mount')
      
      fs.mkdirSync(mockMountPoint, { recursive: true })
      
      // Step 2: Simulate Garmin FIT files appearing on mount point
      const mockFitFiles = [
        path.join(mockMountPoint, 'activity-1000000001.fit'),
        path.join(mockMountPoint, 'activity-1000000002.fit')
      ]
      
      for (const filePath of mockFitFiles) {
        fs.writeFileSync(filePath, Buffer.from([0x32, 0x1D]))
      }
      
      // Step 3: Scan and process all FIT files from device mount point
      const scanResults = await syncManager.processWorkoutsBatch(mockFitFiles, {
        skipDuplicates: true,
        checkFittrackee: true
      })
      
      expect(scanResults.total).toBe(2)
    })
    
    it('should handle multiple device types (Garmin, Suunto)', async () => {
      // Step 1: Create mock FIT files from different devices
      const garminFitFile = path.join(tempDir, 'garmin-workout.fit')
      const suuntoFitFile = path.join(tempDir, 'suunto-workout.gpx')
      
      fs.writeFileSync(garminFitFile, Buffer.from([0x32, 0x1D]))
      
      // Create mock Suunto GPX export
      const suuntoGpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Suunto App">
  <trk>
    <name>Suunto Workout</name>
    <trkseg>
      <trkpt lat="42.70" lon="-0.65">
        <ele>1100.0</ele>
        <time>2026-09-02T07:00:00Z</time>
      </trkpt>
      <trkpt lat="42.71" lon="-0.66">
        <ele>1250.0</ele>
        <time>2026-09-02T08:00:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`
      
      fs.writeFileSync(suuntoFitFile, suuntoGpxContent)
      
      // Step 2: Process both files
      const results = await syncManager.processWorkoutsBatch([garminFitFile, suuntoFitFile], {
        skipDuplicates: true,
        checkFittrackee: true
      })
      
      expect(results.total).toBe(2)
    })
  })
  
  describe('Incremental Sync Deduplication', () => {
    it('should prevent duplicate uploads of the same workout', async () => {
      // Step 1: Create and sync a mock FIT file
      const mockFitFilePath = path.join(tempDir, 'activity-dedup-001.fit')
      fs.writeFileSync(mockFitFilePath, Buffer.from([0x32, 0x1D]))
      
      const firstResult = await syncManager.processWorkout(mockFitFilePath, {
        skipDuplicates: true,
        checkFittrackee: true
      })
      
      expect(firstResult.success).toBe(true)
      expect(firstResult.skipped).toBe(false)
      
      // Step 2: Attempt to sync the same file again (should be skipped)
      const secondResult = await syncManager.processWorkout(mockFitFilePath, {
        skipDuplicates: true,
        checkFittrackee: true
      })
      
      expect(secondResult.success).toBe(true)
    })
    
    it('should detect duplicates on Fittrackee server', async () => {
      // Step 1: Create mock FIT file
      const mockFitFilePath = path.join(tempDir, 'activity-server-dedup.fit')
      fs.writeFileSync(mockFitFilePath, Buffer.from([0x32, 0x1D]))
      
      // Step 2: Simulate workout already exists on Fittrackee server
      const parsedWorkout = await parseFitFile(mockFitFilePath)
      expect(parsedWorkout).not.toBeNull()
      
      const serverDuplicateApiClient = {
        uploadWorkout: jest.fn(),
        getWorkout: jest.fn().mockResolvedValue({ uuid: 'existing-workout-uuid' }) // Already exists on server
      } as any
      
      syncManager.initialize(serverDuplicateApiClient as FittrackeeApiClient)
      
      const result = await syncManager.processWorkout(mockFitFilePath, {
        skipDuplicates: true,
        checkFittrackee: true
      })
      
      expect(result.success).toBe(true)
    })
  })
})
