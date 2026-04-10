// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3')
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { WorkoutData } from './workout-parser'

// Check if we're in test environment
const isTestEnv = process.env.NODE_ENV === 'test'

/**
 * Local workout database schema
 */
export interface LocalWorkoutRecord {
  id: string           // UUID (primary key)
  filePath: string     // Original file path on disk
  fileName: string     // File name only
  deviceName?: string  // Smartwatch device name
  type: string         // Activity type (Run, Ride, etc.)
  startTime: number    // Unix timestamp
  endTime: number      // Unix timestamp
  duration: number     // Duration in seconds
  distance?: number    // Distance in meters
  elevationGain?: number // Elevation gain in meters
  calories?: number    // Calories burned
  avgHeartRate?: number // Average heart rate
  maxHeartRate?: number // Maximum heart rate
  syncedAt?: number    // Timestamp when synced to Fittrackee (null if not synced)
  fittrackeeUuid?: string // UUID on Fittrackee server
  createdAt: number    // Record creation timestamp
  updatedAt: number    // Last update timestamp
}

export interface WorkoutFilterOptions {
  deviceId?: string
  type?: string
  startDate?: Date
  endDate?: Date
  syncedOnly?: boolean
  unsyncedOnly?: boolean
}

export class LocalWorkoutDatabase {
  private db: any
  private dbPath: string

  constructor() {
    // Initialize database path in app data directory
    const appDataDir = path.join(os.homedir(), '.workout-pulse')
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true })
    }
    
    this.dbPath = path.join(appDataDir, 'workouts.db')
    
    // Open database (creates if doesn't exist)
    // In test environment, use in-memory database
    const dbLocation = isTestEnv ? ':memory:' : this.dbPath
    
    this.db = new Database(dbLocation, { 
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined 
    })

    // Enable WAL mode for better concurrent performance
    this.db.pragma('journal_mode = WAL')
    
    // Initialize schema if needed
    this.initializeSchema()
  }

  /**
   * Create database tables and indexes
   */
  private initializeSchema(): void {
    const createTable = `
      CREATE TABLE IF NOT EXISTS workouts (
        id TEXT PRIMARY KEY,
        filePath TEXT NOT NULL,
        fileName TEXT NOT NULL,
        deviceName TEXT,
        type TEXT NOT NULL,
        startTime INTEGER NOT NULL,
        endTime INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        distance REAL,
        elevationGain REAL,
        calories INTEGER,
        avgHeartRate INTEGER,
        maxHeartRate INTEGER,
        syncedAt INTEGER,
        fittrackeeUuid TEXT UNIQUE,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `

    this.db.exec(createTable)

    // Create indexes for common queries
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_workouts_type ON workouts(type);
      CREATE INDEX IF NOT EXISTS idx_workouts_synced ON workouts(syncedAt);
      CREATE INDEX IF NOT EXISTS idx_workouts_startTime ON workouts(startTime DESC);
      CREATE INDEX IF NOT EXISTS idx_workouts_device ON workouts(deviceName);
    `

    this.db.exec(createIndexes)

    console.log('[LocalWorkoutDB] Database initialized successfully')
  }

  /**
   * Add a new workout record to the database
   */
  addWorkout(workout: WorkoutData): LocalWorkoutRecord {
    const now = Date.now()
    
    const record: LocalWorkoutRecord = {
      id: workout.id,
      filePath: workout.filePath,
      fileName: path.basename(workout.filePath),
      deviceName: workout.deviceName,
      type: workout.type,
      startTime: workout.startTime.getTime(),
      endTime: workout.endTime.getTime(),
      duration: workout.duration,
      distance: workout.distance,
      elevationGain: workout.elevationGain,
      calories: workout.calories,
      avgHeartRate: workout.avgHeartRate,
      maxHeartRate: workout.maxHeartRate,
      syncedAt: null,
      fittrackeeUuid: null,
      createdAt: now,
      updatedAt: now
    }

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO workouts (
        id, filePath, fileName, deviceName, type, startTime, endTime,
        duration, distance, elevationGain, calories, avgHeartRate, maxHeartRate,
        syncedAt, fittrackeeUuid, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    insert.run(
      record.id, record.filePath, record.fileName, record.deviceName, record.type,
      record.startTime, record.endTime, record.duration, record.distance, 
      record.elevationGain, record.calories, record.avgHeartRate, record.maxHeartRate,
      record.syncedAt, record.fittrackeeUuid, record.createdAt, record.updatedAt
    )

    console.log('[LocalWorkoutDB] Added workout:', record.id)
    return record
  }

  /**
   * Get a workout by ID
   */
  getWorkout(id: string): LocalWorkoutRecord | null {
    const stmt = this.db.prepare('SELECT * FROM workouts WHERE id = ?')
    return stmt.get(id) as LocalWorkoutRecord | null
  }

  /**
   * Get all workouts (with optional filtering)
   */
  getAllWorkouts(options?: WorkoutFilterOptions): LocalWorkoutRecord[] {
    let query = 'SELECT * FROM workouts'
    const conditions: string[] = []
    const params: any[] = []

    if (options?.deviceId) {
      conditions.push('deviceName = ?')
      params.push(options.deviceId)
    }

    if (options?.type) {
      conditions.push('type = ?')
      params.push(options.type)
    }

    if (options?.startDate) {
      conditions.push('startTime >= ?')
      params.push(options.startDate.getTime())
    }

    if (options?.endDate) {
      conditions.push('startTime <= ?')
      params.push(options.endDate.getTime())
    }

    if (options?.syncedOnly) {
      conditions.push('syncedAt IS NOT NULL')
    }

    if (options?.unsyncedOnly) {
      conditions.push('syncedAt IS NULL')
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY startTime DESC'

    const stmt = this.db.prepare(query)
    return stmt.all(...params) as LocalWorkoutRecord[]
  }

  /**
   * Get unsynced workouts (not yet uploaded to Fittrackee)
   */
  getUnsyncedWorkouts(): LocalWorkoutRecord[] {
    return this.getAllWorkouts({ unsyncedOnly: true })
  }

  /**
   * Get synced workouts only
   */
  getSyncedWorkouts(): LocalWorkoutRecord[] {
    return this.getAllWorkouts({ syncedOnly: true })
  }

  /**
   * Mark a workout as synced to Fittrackee
   */
  markAsSynced(workoutId: string, fittrackeeUuid: string): boolean {
    const now = Date.now()
    
    const stmt = this.db.prepare(`
      UPDATE workouts 
      SET syncedAt = ?, fittrackeeUuid = ?, updatedAt = ?
      WHERE id = ? AND (syncedAt IS NULL OR fittrackeeUuid != ?)
    `)

    const result = stmt.run(now, fittrackeeUuid, now, workoutId, fittrackeeUuid)
    
    if (result.changes > 0) {
      console.log('[LocalWorkoutDB] Marked workout as synced:', workoutId)
      return true
    }
    
    return false
  }

  /**
   * Update an existing workout record
   */
  updateWorkout(workoutId: string, updates: Partial<LocalWorkoutRecord>): boolean {
    const now = Date.now()
    
    // Build dynamic UPDATE query
    const fields: string[] = ['updatedAt = ?']
    const params: any[] = [now]

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key !== 'id' && key !== 'createdAt') {
        fields.push(`${key} = ?`)
        params.push(value)
      }
    }

    params.push(workoutId)

    const stmt = this.db.prepare(`UPDATE workouts SET ${fields.join(', ')} WHERE id = ?`)
    const result = stmt.run(...params)

    if (result.changes > 0) {
      console.log('[LocalWorkoutDB] Updated workout:', workoutId)
      return true
    }
    
    return false
  }

  /**
   * Delete a workout record from the database
   */
  deleteWorkout(workoutId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM workouts WHERE id = ?')
    const result = stmt.run(workoutId)

    if (result.changes > 0) {
      console.log('[LocalWorkoutDB] Deleted workout:', workoutId)
      return true
    }
    
    return false
  }

  /**
   * Get statistics about stored workouts
   */
  getStatistics(): {
    total: number
    synced: number
    unsynced: number
    byType: Record<string, number>
    recentSyncs: number // Last 24 hours
  } {
    const now = Date.now()
    const oneDayAgo = now - (24 * 60 * 60 * 1000)

    // Total count
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM workouts')
    const total = (totalStmt.get() as { count: number }).count

    // Synced vs unsynced
    const syncedStmt = this.db.prepare('SELECT COUNT(*) as count FROM workouts WHERE syncedAt IS NOT NULL')
    const synced = (syncedStmt.get() as { count: number }).count
    
    const unsyncedStmt = this.db.prepare('SELECT COUNT(*) as count FROM workouts WHERE syncedAt IS NULL')
    const unsynced = (unsyncedStmt.get() as { count: number }).count

    // By type
    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count 
      FROM workouts 
      GROUP BY type
      ORDER BY count DESC
    `)
    const byTypeRaw = byTypeStmt.all() as Array<{ type: string; count: number }>
    const byType: Record<string, number> = {}
    for (const row of byTypeRaw) {
      byType[row.type] = row.count
    }

    // Recent syncs (last 24 hours)
    const recentStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM workouts 
      WHERE syncedAt >= ? AND syncedAt IS NOT NULL
    `)
    const recentSyncs = (recentStmt.get(oneDayAgo) as { count: number }).count

    return { total, synced, unsynced, byType, recentSyncs }
  }

  /**
   * Get recent workouts (last N days)
   */
  getRecentWorkouts(days: number = 7): LocalWorkoutRecord[] {
    const now = Date.now()
    const startDate = new Date(now - days * 24 * 60 * 60 * 1000)

    const stmt = this.db.prepare(`
      SELECT * FROM workouts 
      WHERE startTime >= ? 
      ORDER BY startTime DESC
      LIMIT 50
    `)

    return stmt.all(startDate.getTime()) as LocalWorkoutRecord[]
  }

  /**
   * Close database connection (for cleanup)
   */
  close(): void {
    this.db.close()
    console.log('[LocalWorkoutDB] Database closed')
  }
}

// Export singleton instance
export let localWorkoutDb: LocalWorkoutDatabase | null = null

export function initializeLocalWorkoutDb(): LocalWorkoutDatabase {
  if (!localWorkoutDb) {
    localWorkoutDb = new LocalWorkoutDatabase()
    console.log('[LocalWorkoutDB] Singleton instance created')
  }
  return localWorkoutDb
}
