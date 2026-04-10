import { EventEmitter } from 'events'
import * as https from 'https'
import * as http from 'http'
import * as path from 'path'
import { FittrackeeOAuthClient, OAuthCredentials } from './oauth-client'
import { WorkoutData } from './workout-parser'
import { apiRetryHandler, circuitBreaker } from './api-retry-handler'

export interface FittrackeeWorkout {
  uuid: string
  activity_type_id: number
  device_uuid?: string
  is_outdoors?: boolean
  name?: string
  description?: string
  distance: number // meters
  moving_time: number // seconds
  elapsed_time: number // seconds
  elevation_gain: number // meters
  total_photo_count: number
  start_datetime: string // ISO 8601
  end_datetime: string // ISO 8601
  average_heart_rate?: number
  maximum_heart_rate?: number
  calories: number
  workout_id?: number
}

export interface FittrackeeActivityType {
  id: number
  name: string
}

export class FittrackeeApiClient extends EventEmitter {
  private baseUrl: string = 'https://api.fittrackee.org'
  private accessToken: string = ''
  private oauthClient: FittrackeeOAuthClient
  
  // Activity type mapping (Fittrackee activity types)
  private readonly activityTypeMap: Record<string, number> = {
    'Run': 1,
    'Ride': 2,
    'Walk': 3,
    'Hike': 4,
    'Swim': 5,
    'Unknown': 99
  }

  constructor(oauthClient: FittrackeeOAuthClient) {
    super()
    this.oauthClient = oauthClient
    
    // Listen for token changes
    this.oauthClient.on('token-exchanged', () => {
      console.log('[FittrackeeAPI] Token updated, client refreshed')
    })
  }

  /**
   * Set access token from OAuth credentials
   */
  setAccessToken(credentials: OAuthCredentials): void {
    this.accessToken = credentials.accessToken!
    console.log('[FittrackeeAPI] Access token configured')
  }

  /**
   * Get user profile information with retry logic
   */
  async getUserProfile(): Promise<any> {
    const result = await apiRetryHandler.execute(
      () => this.makeRequest('GET', '/api/user/me').then(JSON.parse),
      {
        onRetry: (attempt, error, delayMs) => {
          console.log(`[FittrackeeAPI] getUserProfile retry ${attempt}/${this.options.maxAttempts}, waiting ${delayMs}ms`)
        },
        onSuccess: () => console.log('[FittrackeeAPI] User profile fetched successfully'),
        onError: (error, attempts) => {
          console.error(`[FittrackeeAPI] getUserProfile failed after ${attempts} attempts:`, error.message)
        }
      }
    )

    if (!result.success) {
      throw new Error(`Failed to fetch user profile after ${result.attempts} attempts: ${result.lastError?.message}`)
    }

    return result.result
  }

  /**
   * Get list of available activity types with retry logic
   */
  async getActivityTypes(): Promise<FittrackeeActivityType[]> {
    const result = await apiRetryHandler.execute(
      () => this.makeRequest('GET', '/api/activity-type').then(JSON.parse),
      {
        onRetry: (attempt, error, delayMs) => {
          console.log(`[FittrackeeAPI] getActivityTypes retry ${attempt}/${this.options.maxAttempts}, waiting ${delayMs}ms`)
        },
        onSuccess: () => console.log('[FittrackeeAPI] Activity types fetched successfully'),
        onError: (error, attempts) => {
          console.error(`[FittrackeeAPI] getActivityTypes failed after ${attempts} attempts:`, error.message)
        }
      }
    )

    if (!result.success) {
      throw new Error(`Failed to fetch activity types after ${result.attempts} attempts: ${result.lastError?.message}`)
    }

    return result.result
  }

  /**
   * Get recent workouts from Fittrackee with retry logic
   */
  async getRecentWorkouts(limit: number = 10): Promise<FittrackeeWorkout[]> {
    const result = await apiRetryHandler.execute(
      () => this.makeRequest('GET', `/api/workout?limit=${limit}&order_by=-start_datetime`).then(JSON.parse),
      {
        onRetry: (attempt, error, delayMs) => {
          console.log(`[FittrackeeAPI] getRecentWorkouts retry ${attempt}/${this.options.maxAttempts}, waiting ${delayMs}ms`)
        },
        onSuccess: () => console.log('[FittrackeeAPI] Recent workouts fetched successfully'),
        onError: (error, attempts) => {
          console.error(`[FittrackeeAPI] getRecentWorkouts failed after ${attempts} attempts:`, error.message)
        }
      }
    )

    if (!result.success) {
      throw new Error(`Failed to fetch recent workouts after ${result.attempts} attempts: ${result.lastError?.message}`)
    }

    const parsed = result.result
    return parsed.results || []
  }

  /**
   * Get a specific workout by UUID
   */
  async getWorkout(uuid: string): Promise<FittrackeeWorkout | null> {
    try {
      const data = await this.makeRequest('GET', `/api/workout/${uuid}`)
      return JSON.parse(data)
    } catch (error) {
      console.error('[FittrackeeAPI] Error fetching workout:', error)
      throw new Error(`Failed to fetch workout: ${error.message}`)
    }
  }

  /**
   * Upload a new workout to Fittrackee with retry logic and circuit breaker
   */
  async uploadWorkout(workout: WorkoutData): Promise<FittrackeeWorkout> {
    // Map local WorkoutData to Fittrackee format
    const fittrackeeWorkout: FittrackeeWorkout = {
      uuid: workout.id,
      activity_type_id: this.activityTypeMap[workout.type] || 99,
      is_outdoors: true, // Default to outdoor for now
      name: path.basename(workout.filePath),
      description: `Synced from ${workout.deviceName} via WorkoutPulse`,
      distance: workout.distance || 0,
      moving_time: workout.duration,
      elapsed_time: workout.duration,
      elevation_gain: workout.elevationGain || 0,
      total_photo_count: 0,
      start_datetime: workout.startTime.toISOString(),
      end_datetime: workout.endTime.toISOString(),
      average_heart_rate: workout.avgHeartRate,
      maximum_heart_rate: workout.maxHeartRate,
      calories: workout.calories || 0
    }

    const result = await circuitBreaker.execute(
      async () => {
        const data = await this.makeRequest('POST', '/api/workout', fittrackeeWorkout)
        return JSON.parse(data)
      },
      {
        onRetry: (attempt, error, delayMs) => {
          console.log(`[FittrackeeAPI] uploadWorkout retry ${attempt}/${this.options.maxAttempts}, waiting ${delayMs}ms`)
        },
        onSuccess: () => console.log('[FittrackeeAPI] Workout uploaded successfully'),
        onError: (error, attempts) => {
          console.error(`[FittrackeeAPI] uploadWorkout failed after ${attempts} attempts:`, error.message)
        }
      }
    )

    if (!result.success) {
      throw new Error(`Failed to upload workout after ${result.attempts} attempts: ${result.lastError?.message}`)
    }

    const uploadedWorkout = result.result
    
    console.log('[FittrackeeAPI] Workout uploaded successfully:', uploadedWorkout.uuid)
    
    this.emit('workout-uploaded', {
      workout: uploadedWorkout,
      timestamp: Date.now()
    })

    return uploadedWorkout
  }

  /**
   * Upload multiple workouts with rate limiting
   */
  async uploadWorkoutsBatch(workouts: WorkoutData[], options?: {
    skipDuplicates?: boolean
    batchSize?: number
    delayMs?: number
  }): Promise<{ success: number; failed: number; errors: string[] }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    }

    const skipDuplicates = options?.skipDuplicates ?? true
    const batchSize = options?.batchSize ?? 5
    const delayMs = options?.delayMs ?? 1000

    // Get existing workouts if checking for duplicates
    let existingWorkouts: FittrackeeWorkout[] = []
    if (skipDuplicates) {
      try {
        existingWorkouts = await this.getRecentWorkouts(100)
      } catch (error) {
        console.warn('[FittrackeeAPI] Could not fetch existing workouts, skipping duplicate check')
        skipDuplicates = false
      }
    }

    for (let i = 0; i < workouts.length; i++) {
      const workout = workouts[i]
      
      // Check for duplicates
      if (skipDuplicates) {
        const exists = existingWorkouts.some(w => w.uuid === workout.id)
        if (exists) {
          console.log('[FittrackeeAPI] Workout already exists, skipping:', workout.id)
          continue
        }
      }

      try {
        await this.uploadWorkout(workout)
        result.success++
        
        // Add to existing list for duplicate checking
        if (skipDuplicates) {
          const uploaded = await this.getWorkout(workout.id)
          if (uploaded) {
            existingWorkouts.push(uploaded)
          }
        }
      } catch (error) {
        result.failed++
        result.errors.push(`${workout.id}: ${error.message}`)
        console.error('[FittrackeeAPI] Failed to upload workout:', workout.id, error)
      }

      // Rate limiting: wait between batches
      if ((i + 1) % batchSize === 0 && i < workouts.length - 1) {
        await this.delay(delayMs)
      }
    }

    console.log('[FittrackeeAPI] Batch upload complete:', result)
    
    return result
  }

  /**
   * Delete a workout by UUID with retry logic
   */
  async deleteWorkout(uuid: string): Promise<void> {
    const result = await apiRetryHandler.execute(
      () => this.makeRequest('DELETE', `/api/workout/${uuid}`),
      {
        onRetry: (attempt, error, delayMs) => {
          console.log(`[FittrackeeAPI] deleteWorkout retry ${attempt}/${this.options.maxAttempts}, waiting ${delayMs}ms`)
        },
        onSuccess: () => console.log('[FittrackeeAPI] Workout deleted successfully'),
        onError: (error, attempts) => {
          console.error(`[FittrackeeAPI] deleteWorkout failed after ${attempts} attempts:`, error.message)
        }
      }
    )

    if (!result.success) {
      throw new Error(`Failed to delete workout after ${result.attempts} attempts: ${result.lastError?.message}`)
    }
  }

  /**
   * Make HTTP request to Fittrackee API
   */
  private async makeRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<string> {
    // Ensure we have a valid token
    if (!this.accessToken) {
      const credentials = this.oauthClient.loadStoredCredentials()
      if (credentials?.accessToken) {
        this.setAccessToken(credentials)
      } else {
        throw new Error('No access token available')
      }
    }

    // Check token expiry and refresh if needed
    const credentials = this.oauthClient.loadStoredCredentials()
    if (credentials?.tokenExpiry && Date.now() > credentials.tokenExpiry) {
      console.log('[FittrackeeAPI] Token expired, attempting refresh')
      try {
        const refreshed = await this.oauthClient.refreshToken(credentials.refreshToken!)
        this.setAccessToken(refreshed)
      } catch (error) {
        throw new Error(`Token refresh failed: ${error.message}`)
      }
    }

    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`
      const isHttps = this.baseUrl.startsWith('https')
      const lib = isHttps ? https : http
      
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }

      const options = {
        hostname: new URL(url).hostname,
        port: isHttps ? 443 : 80,
        path: new URL(url).pathname,
        method,
        headers
      }

      const req = lib.request(options, (res) => {
        let data = ''
        
        res.on('data', (chunk) => data += chunk)
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data)
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`))
          }
        })
      })

      req.on('error', (error) => {
        reject(error)
      })

      // Write request body for POST/PUT
      if (body) {
        req.write(JSON.stringify(body))
      }

      req.end()
    })
  }

  /**
   * Utility: delay function for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Export singleton instance (will be initialized with OAuth client)
export let fittrackeeApi: FittrackeeApiClient | null = null

export function initializeFittrackeeApi(oauthClient: FittrackeeOAuthClient): FittrackeeApiClient {
  if (!fittrackeeApi) {
    fittrackeeApi = new FittrackeeApiClient(oauthClient)
    console.log('[FittrackeeAPI] Client initialized')
  }
  return fittrackeeApi
}
