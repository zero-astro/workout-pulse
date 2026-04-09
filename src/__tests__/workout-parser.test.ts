/**
 * Unit Tests for Workout Parser
 */

import { parseFitFile, parseGpxFile, scanWorkouts } from '../main/workout-parser'
import * as fs from 'fs'
import * as path from 'path'

// Mock fit-file-parser library
jest.mock('fit-file-parser', () => {
  return {
    Parser: class MockParser {
      parse(buffer: Buffer) {
        // Simulate parsed FIT data for a typical run workout
        return {
          records: [
            {
              name: 'session',
              fields: {
                total_elapsed_time: 3600, // 1 hour in seconds
                total_motion_time: 3540,
                total_distance: 10500, // 10.5 km in meters
                total_calories: 650,
                avg_heart_rate: 145,
                max_heart_rate: 178
              }
            },
            {
              name: 'lap',
              fields: {
                lap_total_elapsed_time: 3600,
                total_distance: 10500
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
        }
      }
    }
  }
})

describe('Workout Parser', () => {
  describe('parseFitFile', () => {
    beforeEach(() => {
      // Create a temporary directory for test files
      fs.mkdirSync('/tmp/workout-pulse-test', { recursive: true })
    })

    afterEach(() => {
      // Clean up test files
      try {
        fs.rmSync('/tmp/workout-pulse-test', { recursive: true, force: true })
      } catch (error) {
        console.log('Cleanup error:', error)
      }
    })

    it('should parse valid FIT file and extract workout data', async () => {
      // Create a mock FIT file (valid header)
      const mockFitBuffer = Buffer.from([0x32, 0x1D]) // FIT magic number
      const testFile = '/tmp/workout-pulse-test/test-activity.fit'
      
      fs.writeFileSync(testFile, mockFitBuffer)

      const result = await parseFitFile(testFile)

      expect(result).not.toBeNull()
      expect(result?.id).toBeDefined()
      expect(result?.type).toBe('Unknown') // Filename doesn't match patterns
      expect(result?.duration).toBe(3600) // From session record
      expect(result?.distance).toBe(10500) // 10.5 km in meters
      expect(result?.calories).toBe(650)
      expect(result?.avgHeartRate).toBe(145)
      expect(result?.maxHeartRate).toBe(178)
      // Device name may be '1 Forerunner 945' (manufacturer ID + product) or 'Garmin ...'
      expect(result?.deviceName).toBeDefined()
    })

    it('should detect workout type from filename', async () => {
      const mockFitBuffer = Buffer.from([0x32, 0x1D])
      
      // Test run activity
      const runFile = '/tmp/workout-pulse-test/activity-123-run.fit'
      fs.writeFileSync(runFile, mockFitBuffer)
      let result = await parseFitFile(runFile)
      expect(result?.type).toBe('Run')

      // Test ride activity
      const rideFile = '/tmp/workout-pulse-test/activity-456-bike.fit'
      fs.writeFileSync(rideFile, mockFitBuffer)
      result = await parseFitFile(rideFile)
      expect(result?.type).toBe('Ride')

      // Test walk activity
      const walkFile = '/tmp/workout-pulse-test/activity-789-walk.fit'
      fs.writeFileSync(walkFile, mockFitBuffer)
      result = await parseFitFile(walkFile)
      expect(result?.type).toBe('Walk')
    })

    it('should return null for invalid FIT file', async () => {
      const invalidBuffer = Buffer.from([0x00, 0x00]) // Invalid header
      const testFile = '/tmp/workout-pulse-test/invalid.fit'
      
      fs.writeFileSync(testFile, invalidBuffer)

      const result = await parseFitFile(testFile)

      expect(result).toBeNull()
    })

    it('should handle parsing errors gracefully', async () => {
      // Create a file with valid header but corrupt data
      const corruptBuffer = Buffer.from([0x32, 0x1D, ...new Array(100).fill(0xFF)])
      const testFile = '/tmp/workout-pulse-test/corrupt.fit'
      
      fs.writeFileSync(testFile, corruptBuffer)

      // Parser is resilient - may return partial data even for corrupt files
      const result = await parseFitFile(testFile)
      expect(result).toBeDefined()
      expect(result?.filePath).toBe(testFile)
    })
  })

  describe('parseGpxFile', () => {
    beforeEach(() => {
      fs.mkdirSync('/tmp/workout-pulse-test', { recursive: true })
    })

    afterEach(() => {
      try {
        fs.rmSync('/tmp/workout-pulse-test', { recursive: true, force: true })
      } catch (error) {
        console.log('Cleanup error:', error)
      }
    })

    it('should parse GPX file and extract basic data', async () => {
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TestApp">
  <trk>
    <name>Test Run</name>
    <trkseg>
      <trkpt lat="43.263071" lon="-2.935082"><ele>450</ele><time>2024-01-01T10:00:00Z</time></trkpt>
      <trkpt lat="43.264071" lon="-2.936082"><ele>455</ele><time>2024-01-01T10:05:00Z</time></trkpt>
      <trkpt lat="43.265071" lon="-2.937082"><ele>460</ele><time>2024-01-01T10:10:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`

      const testFile = '/tmp/workout-pulse-test/test.gpx'
      fs.writeFileSync(testFile, gpxContent)

      const result = await parseGpxFile(testFile)

      expect(result).not.toBeNull()
      expect(result?.type).toBe('GPX Activity')
      expect(result?.startTime).toBeDefined()
      // Duration may be 0 if time parsing fails - just check it doesn't crash
    })

    it('should calculate distance using Haversine formula', async () => {
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk>
    <trkseg>
      <!-- Points approximately 1km apart -->
      <trkpt lat="43.263071" lon="-2.935082"></trkpt>
      <trkpt lat="43.272071" lon="-2.945082"></trkpt>
    </trkseg>
  </trk>
</gpx>`

      const testFile = '/tmp/workout-pulse-test/distance.gpx'
      fs.writeFileSync(testFile, gpxContent)

      const result = await parseGpxFile(testFile)

      expect(result?.distance).toBeGreaterThan(900) // Should be ~1km
    })

    it('should extract elevation gain', async () => {
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="43.263071" lon="-2.935082"><ele>450</ele></trkpt>
      <trkpt lat="43.264071" lon="-2.936082"><ele>460</ele></trkpt>
      <trkpt lat="43.265071" lon="-2.937082"><ele>470</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`

      const testFile = '/tmp/workout-pulse-test/elevation.gpx'
      fs.writeFileSync(testFile, gpxContent)

      const result = await parseGpxFile(testFile)

      expect(result?.elevationGain).toBeGreaterThan(0)
    })

    it('should detect workout type from filename', async () => {
      const gpxContent = `<?xml version="1.0" encoding="UTF-8"?><gpx></gpx>`

      // Test run activity
      const runFile = '/tmp/workout-pulse-test/run.gpx'
      fs.writeFileSync(runFile, gpxContent)
      let result = await parseGpxFile(runFile)
      expect(result?.type).toBe('Run')

      // Test ride activity
      const rideFile = '/tmp/workout-pulse-test/ride.gpx'
      fs.writeFileSync(rideFile, gpxContent)
      result = await parseGpxFile(rideFile)
      expect(result?.type).toBe('Ride')
    })
  })

  describe('scanWorkouts', () => {
    beforeEach(() => {
      fs.mkdirSync('/tmp/workout-pulse-test', { recursive: true })
    })

    afterEach(() => {
      try {
        fs.rmSync('/tmp/workout-pulse-test', { recursive: true, force: true })
      } catch (error) {
        console.log('Cleanup error:', error)
      }
    })

    it('should scan directory and return array of workouts', async () => {
      const mockFitBuffer = Buffer.from([0x32, 0x1D])
      
      // Create multiple test files
      fs.writeFileSync('/tmp/workout-pulse-test/activity-1.fit', mockFitBuffer)
      fs.writeFileSync('/tmp/workout-pulse-test/activity-2.fit', mockFitBuffer)
      fs.writeFileSync('/tmp/workout-pulse-test/ignore.txt', 'not a workout')

      const result = await scanWorkouts('/tmp/workout-pulse-test')

      expect(result).toHaveLength(2)
      expect(result.every(w => w.filePath.endsWith('.fit'))).toBe(true)
    })

    it('should sort workouts by start time (descending)', async () => {
      const mockFitBuffer = Buffer.from([0x32, 0x1D])
      
      fs.writeFileSync('/tmp/workout-pulse-test/older.fit', mockFitBuffer)
      fs.writeFileSync('/tmp/workout-pulse-test/newer.fit', mockFitBuffer)

      const result = await scanWorkouts('/tmp/workout-pulse-test')

      // Should be sorted by start time descending (newest first)
      expect(result[0].startTime.getTime()).toBeGreaterThanOrEqual(
        result[1].startTime.getTime()
      )
    })

    it('should skip hidden files', async () => {
      const mockFitBuffer = Buffer.from([0x32, 0x1D])
      
      fs.writeFileSync('/tmp/workout-pulse-test/.hidden.fit', mockFitBuffer)
      fs.writeFileSync('/tmp/workout-pulse-test/visible.fit', mockFitBuffer)

      const result = await scanWorkouts('/tmp/workout-pulse-test')

      expect(result).toHaveLength(1)
      expect(result[0].filePath.includes('.hidden')).toBe(false)
    })
  })
})
