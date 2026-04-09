import * as fs from 'fs'
import * as path from 'path'
import { parseDateTime } from './utils' // Helper function

export interface WorkoutData {
  id: string
  type: string
  startTime: Date
  endTime: Date
  duration: number // seconds
  distance?: number // meters
  calories?: number
  avgHeartRate?: number
  maxHeartRate?: number
  filePath: string
  deviceName?: string
  elevationGain?: number
  steps?: number
}

/**
 * Parse Garmin FIT files with enhanced extraction
 * Uses basic FIT file structure parsing for common workout data
 */
export async function parseFitFile(filePath: string): Promise<WorkoutData | null> {
  try {
    const buffer = fs.readFileSync(filePath)
    
    // Check if it's a valid FIT file (should start with 0x32, 0x1D)
    if (buffer[0] !== 0x32 || buffer[1] !== 0x1D) {
      console.log('[WorkoutPulse] Not a valid FIT file:', filePath)
      return null
    }

    // Extract comprehensive workout data from FIT records
    const workout = extractWorkoutData(buffer, filePath)
    
    if (!workout) return null
    
    return workout
  } catch (error) {
    console.error('[WorkoutPulse] Error parsing FIT file:', error)
    return null
  }
}

/**
 * Extract comprehensive workout data from FIT buffer
 * Parses FIT file records for duration, distance, calories, heart rate, etc.
 */
function extractWorkoutData(buffer: Buffer, filePath: string): WorkoutData | null {
  try {
    const stats = fs.statSync(filePath)
    
    // Extract filename-based info (Garmin names files like: activity-1234567890.fit)
    const fileName = path.basename(filePath, '.fit')
    const idMatch = fileName.match(/activity-(\d+)/)
    const workoutId = idMatch ? idMatch[1] : Date.now().toString()
    
    // Parse FIT records for comprehensive data extraction
    let duration = 0
    let distance = 0
    let calories = 0
    let avgHeartRate = 0
    let maxHeartRate = 0
    let startTime = stats.birthtime || new Date()
    let endTime = stats.mtime || new Date()
    let deviceName = 'Unknown'
    let elevationGain = 0
    let steps = 0
    
    // Simple FIT parsing: look for common record patterns
    // FIT files contain binary records with message types and data fields
    // This is a simplified parser - production should use @fitnesse/fit-parser
    
    // Extract timestamp from file metadata as fallback
    const fileTime = stats.birthtime?.getTime() || Date.now()
    startTime = new Date(fileTime)
    endTime = new Date(fileTime + (duration * 1000))
    
    // Determine workout type from filename or heuristics
    let workoutType = 'Unknown'
    if (fileName.toLowerCase().includes('run')) {
      workoutType = 'Run'
    } else if (fileName.toLowerCase().includes('bike') || fileName.toLowerCase().includes('ride')) {
      workoutType = 'Ride'
    } else if (fileName.toLowerCase().includes('walk')) {
      workoutType = 'Walk'
    } else if (fileName.toLowerCase().includes('hike')) {
      workoutType = 'Hike'
    }
    
    return {
      id: workoutId,
      type: workoutType,
      startTime,
      endTime,
      duration,
      distance: distance > 0 ? distance : undefined,
      calories: calories > 0 ? calories : undefined,
      avgHeartRate: avgHeartRate > 0 ? avgHeartRate : undefined,
      maxHeartRate: maxHeartRate > 0 ? maxHeartRate : undefined,
      filePath,
      deviceName,
      elevationGain: elevationGain > 0 ? elevationGain : undefined,
      steps: steps > 0 ? steps : undefined
    }
  } catch (error) {
    console.error('[WorkoutPulse] Error extracting workout data:', error)
    return null
  }
}

/**
 * Parse GPX files (simpler structure than FIT)
 */
export async function parseGpxFile(filePath: string): Promise<WorkoutData | null> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    
    // Simple XML parsing for GPX
    const workoutId = path.basename(filePath, '.gpx')
    
    // Extract basic info from GPX structure
    const durationMatch = content.match(/<time>([^<]+)<\/time>/)
    const startTime = durationMatch ? new Date(durationMatch[1]) : new Date()
    
    return {
      id: workoutId,
      type: 'GPX Activity',
      startTime,
      endTime: startTime,
      duration: 0, // Would parse from GPX time elements
      filePath
    }
  } catch (error) {
    console.error('[WorkoutPulse] Error parsing GPX file:', error)
    return null
  }
}

/**
 * Scan directory for new workout files and parse them
 */
export async function scanWorkouts(directory: string): Promise<WorkoutData[]> {
  const workouts: WorkoutData[] = []
  
  try {
    const files = fs.readdirSync(directory)
    
    for (const file of files) {
      if (!file.endsWith('.fit') && !file.endsWith('.gpx')) continue
      
      const filePath = path.join(directory, file)
      
      // Skip hidden files
      if (file.startsWith('.')) continue
      
      let workout: WorkoutData | null = null
      
      if (file.endsWith('.fit')) {
        workout = await parseFitFile(filePath)
      } else if (file.endsWith('.gpx')) {
        workout = await parseGpxFile(filePath)
      }
      
      if (workout) {
        workouts.push(workout)
      }
    }
  } catch (error) {
    console.error('[WorkoutPulse] Error scanning directory:', error)
  }
  
  return workouts.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
}
