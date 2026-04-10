import * as fs from 'fs'
import * as path from 'path'
import { parseDateTime } from './utils' // Helper function
import * as FIT from 'fit-file-parser'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Stats = fs.Stats

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
 * Extract comprehensive workout data from FIT buffer using fit-file-parser
 * Parses all FIT file records for accurate duration, distance, calories, heart rate, elevation, etc.
 */
function extractWorkoutData(buffer: Buffer, filePath: string): WorkoutData | null {
  try {
    const stats = fs.statSync(filePath)
    
    // Extract filename-based info (Garmin names files like: activity-1234567890.fit)
    const fileName = path.basename(filePath, '.fit')
    const idMatch = fileName.match(/activity-(\d+)/)
    const workoutId = idMatch ? idMatch[1] : Date.now().toString()
    
    // Use fit-file-parser for comprehensive data extraction
    let parser: FIT.Parser | null = null
    let records: any[] = []
    let deviceName = 'Unknown'
    
    try {
      // Parse FIT file using the library
      const ParserClass = (FIT as any).default
      if (!ParserClass) {
        throw new Error('FIT.Parser not found in fit-file-parser')
      }
      parser = new ParserClass()
      const parsedData = parser.parse(buffer)
      records = parsedData.records || []
      
      // Extract device name from manufacturer and product fields
      const deviceRecords = records.filter((r: any) => r.name === 'device_info')
      if (deviceRecords.length > 0) {
        const deviceInfo = deviceRecords[0]
        const manufacturers: Record<number, string> = {
          1: 'Garmin',
          2: 'Suunto',
          3: 'Polar',
          4: 'Wahoo',
          5: 'Coros',
          6: 'Hammerhead'
        }
        deviceName = `${manufacturers[deviceInfo.fields?.manufacturer] || 'Unknown'} ${deviceInfo.fields?.product || ''}`.trim() || 'Unknown'
      }
    } catch (parseError) {
      console.warn('[WorkoutPulse] FIT parsing error, using fallback:', parseError)
      // Fallback to basic extraction if parser fails
    }
    
    // Extract workout data from parsed records
    let duration = 0
    let distance = 0
    let calories = 0
    let avgHeartRate = 0
    let maxHeartRate = 0
    let startTime = stats.birthtime || new Date()
    let endTime = stats.mtime || new Date()
    let elevationGain = 0
    let steps = 0
    
    // Process records to extract workout metrics
    records.forEach((record: any) => {
      const fieldName = record.name
      const fields = record.fields || {}
      
      switch (fieldName) {
        case 'session':
          // Session data contains overall workout stats
          duration = Math.max(duration, fields.total_elapsed_time || 0)
          duration = Math.max(duration, fields.total_motion_time || 0)
          distance = Math.max(distance, fields.total_distance || 0)
          calories += fields.total_calories || 0
          
          if (fields.avg_heart_rate && fields.avg_heart_rate > 0) {
            avgHeartRate = Math.max(avgHeartRate, fields.avg_heart_rate)
          }
          if (fields.max_heart_rate) {
            maxHeartRate = Math.max(maxHeartRate, fields.max_heart_rate)
          }
          break
          
        case 'lap':
          // Lap data for segment-level stats (use max to avoid double counting)
          duration = Math.max(duration, fields.lap_total_elapsed_time || 0)
          distance = Math.max(distance, fields.total_distance || 0)
          calories += fields.total_calories || 0
          break
          
        case 'record':
          // Record-level data (per-second or per-point)
          if (fields.distance !== undefined) {
            distance = Math.max(distance, fields.distance)
          }
          if (fields.elevation !== undefined && fields.elevation > 0) {
            elevationGain += fields.elevation
          }
          break
          
        case 'heart_rate_zone':
          // Heart rate zones data
          if (fields.heart_rate !== undefined) {
            maxHeartRate = Math.max(maxHeartRate, fields.heart_rate)
          }
          break
          
        case 'device_info':
          // Device metadata
          deviceName = `${fields.manufacturer || ''} ${fields.product || ''}`.trim() || 'Unknown'
          break
      }
    })
    
    // If parser didn't extract data, use file timestamps as fallback
    if (duration === 0) {
      const fileTime = stats.birthtime?.getTime() || Date.now()
      startTime = new Date(fileTime)
      endTime = new Date(fileTime + 3600 * 1000) // Default to 1 hour workout
      duration = 3600
    }
    
    // Determine workout type from filename or heuristics
    let workoutType = 'Unknown'
    const lowerFileName = fileName.toLowerCase()
    if (lowerFileName.includes('run')) {
      workoutType = 'Run'
    } else if (lowerFileName.includes('bike') || lowerFileName.includes('ride')) {
      workoutType = 'Ride'
    } else if (lowerFileName.includes('walk')) {
      workoutType = 'Walk'
    } else if (lowerFileName.includes('hike')) {
      workoutType = 'Hike'
    } else if (lowerFileName.includes('trail')) {
      workoutType = 'Trail Run'
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
 * Parse GPX files with comprehensive data extraction
 * Extracts duration, distance, elevation, calories from GPX structure
 */
export async function parseGpxFile(filePath: string): Promise<WorkoutData | null> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    
    // Extract workout ID from filename
    const workoutId = path.basename(filePath, '.gpx')
    
    // Parse XML manually (simple regex-based parsing for common GPX structures)
    let duration = 0
    let distance = 0
    let calories = 0
    let elevationGain = 0
    let startTime = new Date()
    let endTime = new Date()
    
    // Extract time elements (start, end, duration) from track points
    const trkptMatches = content.match(/<trkpt[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/trkpt>/g)
    if (trkptMatches && trkptMatches.length >= 2) {
      const times: Date[] = []
      
      // Extract all timestamps from track points
      trkptMatches.forEach((match: string) => {
        const timeMatch = match.match(/<time>([^<]+)<\/time>/)
        if (timeMatch) {
          times.push(new Date(timeMatch[1]))
        }
      })
      
      // Sort and calculate duration
      if (times.length >= 2) {
        times.sort((a, b) => a.getTime() - b.getTime())
        startTime = times[0]
        endTime = times[times.length - 1]
        duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
      }
    }
    
    // Extract distance from track points
    const distanceMatches = content.match(/<trkpt[^>]* lat="([^"]+)" lon="([^"]+)"[^>]*>/g)
    if (distanceMatches) {
      let lastLat: number | null = null
      let lastLon: number | null = null
      
      distanceMatches.forEach((match: string) => {
        const latMatch = match.match(/lat="([^"]+)"/)
        const lonMatch = match.match(/lon="([^"]+)"/)
        
        if (latMatch && lonMatch) {
          const lat = parseFloat(latMatch[1])
          const lon = parseFloat(lonMatch[1])
          
          if (lastLat !== null && lastLon !== null) {
            // Calculate distance using Haversine formula
            const segmentDistance = calculateHaversineDistance(lastLat, lastLon, lat, lon)
            distance += segmentDistance
          }
          
          lastLat = lat
          lastLon = lon
        }
      })
    }
    
    // Extract elevation gain from track points
    const elevMatches = content.match(/<ele[^>]*>([^<]+)<\/ele>/g)
    if (elevMatches) {
      let lastElev: number | null = null
      
      elevMatches.forEach((match: string) => {
        const elevValue = parseFloat(match.replace(/[^0-9.-]/g, ''))
        if (!isNaN(elevValue) && lastElev !== null) {
          const diff = elevValue - lastElev
          if (diff > 0) {
            elevationGain += diff
          }
        }
        lastElev = elevValue
      })
    }
    
    // Extract calories from metadata if available
    const calMatch = content.match(/<extensions[^>]*>(?:[^<]*(?:<calories[^>]*>([^<]+)<\/calories>)?[^<]*)*?<\/extensions>/s)
    if (calMatch) {
      const calSubMatch = calMatch[0].match(/<calories[^>]*>([^<]+)<\/calories>/)
      if (calSubMatch) {
        calories = parseFloat(calSubMatch[1])
      }
    }
    
    // Determine workout type from filename
    let workoutType = 'GPX Activity'
    const lowerFileName = path.basename(filePath, '.gpx').toLowerCase()
    if (lowerFileName.includes('run')) {
      workoutType = 'Run'
    } else if (lowerFileName.includes('bike') || lowerFileName.includes('ride')) {
      workoutType = 'Ride'
    } else if (lowerFileName.includes('walk')) {
      workoutType = 'Walk'
    } else if (lowerFileName.includes('hike')) {
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
      filePath,
      elevationGain: elevationGain > 0 ? elevationGain : undefined
    }
  } catch (error) {
    console.error('[WorkoutPulse] Error parsing GPX file:', error)
    return null
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth's radius in meters
  
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  
  return R * c
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
