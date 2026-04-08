import * as fs from 'fs'
import * as path from 'path'

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
}

/**
 * Parse Garmin FIT files (simplified - uses basic FIT file structure)
 * For production, consider using @fitnesse/fit-parser or similar library
 */
export async function parseFitFile(filePath: string): Promise<WorkoutData | null> {
  try {
    const buffer = fs.readFileSync(filePath)
    
    // Check if it's a valid FIT file (should start with 0x32, 0x1D)
    if (buffer[0] !== 0x32 || buffer[1] !== 0x1D) {
      console.log('[WorkoutPulse] Not a valid FIT file:', filePath)
      return null
    }

    // Extract basic metadata from FIT header
    const workout = extractWorkoutData(buffer, filePath)
    
    if (!workout) return null
    
    return workout
  } catch (error) {
    console.error('[WorkoutPulse] Error parsing FIT file:', error)
    return null
  }
}

/**
 * Extract workout data from FIT buffer (simplified extraction)
 */
function extractWorkoutData(buffer: Buffer, filePath: string): WorkoutData | null {
  // FIT file structure is complex - this is a basic implementation
  // For production, use a proper FIT parser library
  
  try {
    // Get file modification time as fallback
    const stats = fs.statSync(filePath)
    
    // Extract filename-based info (Garmin names files like: activity-1234567890.fit)
    const fileName = path.basename(filePath, '.fit')
    const idMatch = fileName.match(/activity-(\d+)/)
    const workoutId = idMatch ? idMatch[1] : Date.now().toString()
    
    // Default values (would be extracted from FIT records in production)
    return {
      id: workoutId,
      type: 'Unknown', // Would parse from FIT message types
      startTime: stats.birthtime || new Date(),
      endTime: stats.mtime || new Date(),
      duration: 0, // In seconds - would extract from FIT
      filePath
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
