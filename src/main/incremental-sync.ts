import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { FittrackeeApiClient, FittrackeeWorkout } from './fittrackee-api-client'
import { WorkoutData, parseFitFile, parseGpxFile } from './workout-parser'
import { initializeLocalWorkoutDb, LocalWorkoutRecord } from './local-workout-db'

export interface SyncMetadata {
  workoutId: string
  uploadedAt: number
  fittrackeeUuid: string
  localFilePath: string
}

export interface SyncResult {
  success: boolean
  skipped: boolean
  reason?: string
  workout?: FittrackeeWorkout
  error?: Error
}

export class IncrementalSyncManager extends EventEmitter {
  private syncMetadataPath: string = ''
  private syncMetadata: Map<string, SyncMetadata> = new Map()
  private apiClient: FittrackeeApiClient | null = null
  
  // Cache for recently synced workouts (in-memory)
  private recentWorkoutsCache: Set<string> = new Set()
  
  // Local workout database
  private localDb: ReturnType<typeof initializeLocalWorkoutDb> | null = null

  constructor() {
    super()
    
    // Initialize metadata storage path
    const appDataDir = path.join(os.homedir(), '.workout-pulse')
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true })
    }
    
    this.syncMetadataPath = path.join(appDataDir, 'sync_metadata.json')
    this.loadSyncMetadata()
  }

  /**
   * Initialize with API client reference and local database
   */
  initialize(apiClient: FittrackeeApiClient): void {
    this.apiClient = apiClient
    // Initialize local workout database
    this.localDb = initializeLocalWorkoutDb()
  }

  /**
   * Load sync metadata from disk
   */
  private loadSyncMetadata(): void {
    try {
      if (fs.existsSync(this.syncMetadataPath)) {
        const data = fs.readFileSync(this.syncMetadataPath, 'utf8')
        const metadataList: SyncMetadata[] = JSON.parse(data)
        
        // Convert to Map for faster lookups
        this.syncMetadata = new Map(
          metadataList.map(m => [m.workoutId, m])
        )
        
        console.log('[IncrementalSync] Loaded', this.syncMetadata.size, 'sync records')
      }
    } catch (error) {
      console.error('[IncrementalSync] Error loading sync metadata:', error)
      // Start fresh if metadata is corrupted
      this.syncMetadata = new Map()
    }
  }

  /**
   * Save sync metadata to disk
   */
  private saveSyncMetadata(): void {
    try {
      const metadataList = Array.from(this.syncMetadata.values())
      
      fs.writeFileSync(
        this.syncMetadataPath,
        JSON.stringify(metadataList, null, 2),
        { mode: 0o600 } // Secure file permissions
      )
      
      console.log('[IncrementalSync] Saved', metadataList.length, 'sync records')
    } catch (error) {
      console.error('[IncrementalSync] Error saving sync metadata:', error)
      throw new Error('Failed to save sync metadata')
    }
  }

  /**
   * Check if a workout has already been synced (by UUID)
   */
  isAlreadySynced(workoutId: string): boolean {
    // Check local database first
    const localRecord = this.localDb?.getWorkout(workoutId)
    if (localRecord && localRecord.syncedAt) {
      return true
    }
    
    // Then check sync metadata map
    if (this.syncMetadata.has(workoutId)) {
      return true
    }
    
    // Finally check recent cache
    return this.recentWorkoutsCache.has(workoutId)
  }

  /**
   * Get sync metadata for a specific workout
   */
  getSyncMetadata(workoutId: string): SyncMetadata | null {
    return this.syncMetadata.get(workoutId) || null
  }

  /**
   * Check if workout exists on Fittrackee (for duplicate detection)
   */
  async checkFittrackeeDuplicate(uuid: string): Promise<boolean> {
    if (!this.apiClient) {
      console.warn('[IncrementalSync] API client not initialized')
      return false
    }

    try {
      const workout = await this.apiClient.getWorkout(uuid)
      return workout !== null
    } catch (error) {
      // If we can't check, assume it's not a duplicate
      console.log('[IncrementalSync] Could not verify duplicate:', error.message)
      return false
    }
  }

  /**
   * Process a single workout with incremental sync logic
   */
  async processWorkout(
    filePath: string,
    options?: { skipDuplicates?: boolean; checkFittrackee?: boolean }
  ): Promise<SyncResult> {
    const skipDuplicates = options?.skipDuplicates ?? true
    const checkFittrackee = options?.checkFittrackee ?? true

    // Parse the workout file
    let workout: WorkoutData | null = null
    
    try {
      if (filePath.endsWith('.fit')) {
        workout = await parseFitFile(filePath)
      } else if (filePath.endsWith('.gpx')) {
        workout = await parseGpxFile(filePath)
      }

      if (!workout) {
        return {
          success: false,
          skipped: true,
          reason: 'Failed to parse workout file'
        }
      }
    } catch (error) {
      return {
        success: false,
        skipped: true,
        error: error as Error
      }
    }

    // Store workout in local database first (even if not syncing)
    if (this.localDb && !this.isAlreadySynced(workout.id)) {
      this.localDb.addWorkout(workout)
    }

    // Check if already synced locally
    if (skipDuplicates && this.isAlreadySynced(workout.id)) {
      console.log('[IncrementalSync] Workout already synced locally:', workout.id)
      
      return {
        success: true,
        skipped: true,
        reason: 'Already synced'
      }
    }

    // Check if exists on Fittrackee (optional but recommended)
    if (checkFittrackee && skipDuplicates) {
      const existsOnServer = await this.checkFittrackeeDuplicate(workout.id)
      
      if (existsOnServer) {
        console.log('[IncrementalSync] Workout already exists on Fittrackee:', workout.id)
        
        return {
          success: true,
          skipped: true,
          reason: 'Already synced to server'
        }
      }
    }

    // Upload to Fittrackee
    if (!this.apiClient) {
      return {
        success: false,
        skipped: true,
        error: new Error('API client not initialized')
      }
    }

    try {
      const uploadedWorkout = await this.apiClient.uploadWorkout(workout)
      
      // Save sync metadata
      this.syncMetadata.set(workout.id, {
        workoutId: workout.id,
        uploadedAt: Date.now(),
        fittrackeeUuid: uploadedWorkout.uuid,
        localFilePath: filePath
      })
      
      // Mark as synced in local database
      if (this.localDb) {
        this.localDb.markAsSynced(workout.id, uploadedWorkout.uuid)
      }
      
      // Add to recent cache (temporary)
      this.recentWorkoutsCache.add(workout.id)
      
      // Clean up cache after 1 hour
      setTimeout(() => {
        this.recentWorkoutsCache.delete(workout.id)
      }, 60 * 60 * 1000)

      console.log('[IncrementalSync] Workout synced successfully:', workout.id)
      
      return {
        success: true,
        skipped: false,
        workout: uploadedWorkout
      }
    } catch (error) {
      const syncError = error as Error
      
      // Don't save metadata if upload failed
      console.error('[IncrementalSync] Failed to sync workout:', workout.id, syncError)
      
      return {
        success: false,
        skipped: true,
        error: syncError
      }
    }
  }

  /**
   * Process multiple workouts with incremental sync
   */
  async processWorkoutsBatch(
    filePaths: string[],
    options?: { skipDuplicates?: boolean; checkFittrackee?: boolean }
  ): Promise<{
    total: number
    success: number
    skipped: number
    failed: number
    results: SyncResult[]
  }> {
    const results: SyncResult[] = []
    let successCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const filePath of filePaths) {
      const result = await this.processWorkout(filePath, options)
      results.push(result)
      
      if (result.success && !result.skipped) {
        successCount++
      } else if (!result.success) {
        failedCount++
      } else {
        skippedCount++
      }
    }

    // Save metadata after batch operation
    this.saveSyncMetadata()

    console.log('[IncrementalSync] Batch complete:', {
      total: filePaths.length,
      success: successCount,
      skipped: skippedCount,
      failed: failedCount
    })

    return {
      total: filePaths.length,
      success: successCount,
      skipped: skippedCount,
      failed: failedCount,
      results
    }
  }

  /**
   * Get list of workouts that have been synced (from local database)
   */
  getSyncedWorkouts(): LocalWorkoutRecord[] {
    if (!this.localDb) {
      return []
    }
    return this.localDb.getSyncedWorkouts()
  }

  /**
   * Get unsynced workouts from local database
   */
  getUnsyncedWorkouts(): LocalWorkoutRecord[] {
    if (!this.localDb) {
      return []
    }
    return this.localDb.getUnsyncedWorkouts()
  }

  /**
   * Get recent workouts from local database
   */
  getRecentWorkouts(days: number = 7): LocalWorkoutRecord[] {
    if (!this.localDb) {
      return []
    }
    return this.localDb.getRecentWorkouts(days)
  }

  /**
   * Remove sync metadata for a specific workout (for undo/cleanup)
   */
  removeSyncMetadata(workoutId: string): boolean {
    const removed = this.syncMetadata.delete(workoutId)
    
    if (removed) {
      this.saveSyncMetadata()
      console.log('[IncrementalSync] Removed sync metadata for:', workoutId)
    }
    
    return removed
  }

  /**
   * Clear all sync metadata (for testing or reset)
   */
  clearAllMetadata(): void {
    this.syncMetadata.clear()
    this.recentWorkoutsCache.clear()
    
    try {
      if (fs.existsSync(this.syncMetadataPath)) {
        fs.unlinkSync(this.syncMetadataPath)
      }
    } catch (error) {
      console.error('[IncrementalSync] Error clearing metadata:', error)
    }
  }

  /**
   * Get statistics about synced workouts (from local database)
   */
  getStatistics(): {
    totalWorkouts: number
    synced: number
    unsynced: number
    byType: Record<string, number>
    recentSyncs: number // Last 24 hours
    oldestSync?: number
    newestSync?: number
  } {
    const now = Date.now()
    const oneDayAgo = now - (24 * 60 * 60 * 1000)

    let oldestSync: number | undefined
    let newestSync: number | undefined

    for (const metadata of this.syncMetadata.values()) {
      if (oldestSync === undefined || metadata.uploadedAt < oldestSync) {
        oldestSync = metadata.uploadedAt
      }
      
      if (newestSync === undefined || metadata.uploadedAt > newestSync) {
        newestSync = metadata.uploadedAt
      }
    }

    const recentSyncs = Array.from(this.syncMetadata.values()).filter(
      m => m.uploadedAt >= oneDayAgo
    ).length

    // Get comprehensive stats from local database
    let dbStats: {
      total: number
      synced: number
      unsynced: number
      byType: Record<string, number>
    } = { total: 0, synced: 0, unsynced: 0, byType: {} }

    if (this.localDb) {
      dbStats = this.localDb.getStatistics()
    }

    return {
      totalWorkouts: dbStats.total,
      synced: dbStats.synced,
      unsynced: dbStats.unsynced,
      byType: dbStats.byType,
      recentSyncs,
      oldestSync,
      newestSync
    }
  }
}

// Export singleton instance
export const incrementalSync = new IncrementalSyncManager()
