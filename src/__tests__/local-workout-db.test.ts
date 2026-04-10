import { LocalWorkoutDatabase, initializeLocalWorkoutDb } from '../main/local-workout-db'

// Mock better-sqlite3 for tests
jest.mock('better-sqlite3', () => {
  const mockDb = {
    exec: jest.fn(),
    prepare: jest.fn().mockImplementation((sql) => {
      const stmt = {
        run: jest.fn().mockReturnValue({ changes: 1 }),
        get: jest.fn().mockImplementation(() => {
          if (sql.includes('COUNT(*)')) return { count: 0 }
          return null
        }),
        all: jest.fn().mockImplementation((...params) => {
          if (sql.includes('SELECT COUNT') || sql.includes('GROUP BY')) return []
          return []
        })
      }
      
      // Mock specific queries to return test data
      if (sql.includes('WHERE id = ?')) {
        stmt.get = jest.fn().mockReturnValue({
          id: 'test-workout-1',
          filePath: '/tmp/test.fit',
          fileName: 'test.fit',
          deviceName: 'Garmin Fenix',
          type: 'Run',
          startTime: new Date('2026-04-10T08:00:00Z').getTime(),
          endTime: new Date('2026-04-10T09:00:00Z').getTime(),
          duration: 3600,
          distance: 10000,
          elevationGain: 150,
          calories: 500,
          avgHeartRate: 150,
          maxHeartRate: 175,
          syncedAt: null,
          fittrackeeUuid: null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
      }
      
      if (sql.includes('SELECT * FROM workouts ORDER BY')) {
        stmt.all = jest.fn().mockReturnValue([])
      }
      
      return stmt
    }),
    pragma: jest.fn(),
    close: jest.fn()
  }
  
  return jest.fn().mockImplementation(() => mockDb)
})

// Set test environment
process.env.NODE_ENV = 'test'

describe('LocalWorkoutDatabase', () => {
  let db: LocalWorkoutDatabase

  beforeEach(() => {
    // Clear singleton instance to get fresh database
    const module = require('../main/local-workout-db')
    if (module.localWorkoutDb) {
      module.localWorkoutDb = null
    }
    
    db = initializeLocalWorkoutDb()
  })

  afterEach(() => {
    db.close()
  })

  test('should add and retrieve a workout', () => {
    const workout = {
      id: 'test-workout-1',
      filePath: '/tmp/test.fit',
      deviceName: 'Garmin Fenix',
      type: 'Run',
      startTime: new Date('2026-04-10T08:00:00Z'),
      endTime: new Date('2026-04-10T09:00:00Z'),
      duration: 3600,
      distance: 10000,
      elevationGain: 150,
      calories: 500,
      avgHeartRate: 150,
      maxHeartRate: 175
    }

    const record = db.addWorkout(workout)
    
    expect(record.id).toBe('test-workout-1')
    expect(record.type).toBe('Run')
    expect(record.distance).toBe(10000)
    expect(record.syncedAt).toBeNull()
  })

  test('should mark workout as synced', () => {
    const workout = {
      id: 'test-workout-2',
      filePath: '/tmp/test.fit',
      deviceName: 'Garmin Fenix',
      type: 'Run',
      startTime: new Date('2026-04-10T08:00:00Z'),
      endTime: new Date('2026-04-10T09:00:00Z'),
      duration: 3600,
      distance: 10000,
      calories: 500,
      avgHeartRate: 150,
      maxHeartRate: 175
    }

    db.addWorkout(workout)
    
    const marked = db.markAsSynced('test-workout-2', 'fittrackee-uuid-123')
    
    expect(marked).toBe(true)
    
    const record = db.getWorkout('test-workout-2')
    expect(record?.syncedAt).toBeDefined()
    expect(record?.fittrackeeUuid).toBe('fittrackee-uuid-123')
  })

  test('should filter workouts by type', () => {
    const runWorkout = {
      id: 'run-1',
      filePath: '/tmp/run.fit',
      deviceName: 'Garmin Fenix',
      type: 'Run',
      startTime: new Date('2026-04-10T08:00:00Z'),
      endTime: new Date('2026-04-10T09:00:00Z'),
      duration: 3600,
      calories: 500
    }

    const rideWorkout = {
      id: 'ride-1',
      filePath: '/tmp/ride.fit',
      deviceName: 'Garmin Fenix',
      type: 'Ride',
      startTime: new Date('2026-04-10T10:00:00Z'),
      endTime: new Date('2026-04-10T11:30:00Z'),
      duration: 5400,
      calories: 800
    }

    db.addWorkout(runWorkout)
    db.addWorkout(rideWorkout)

    const runs = db.getAllWorkouts({ type: 'Run' })
    expect(runs).toHaveLength(1)
    expect(runs[0].type).toBe('Run')

    const rides = db.getAllWorkouts({ type: 'Ride' })
    expect(rides).toHaveLength(1)
    expect(rides[0].type).toBe('Ride')
  })

  test('should filter unsynced workouts', () => {
    const syncedWorkout = {
      id: 'synced-1',
      filePath: '/tmp/synced.fit',
      deviceName: 'Garmin Fenix',
      type: 'Run',
      startTime: new Date('2026-04-10T08:00:00Z'),
      endTime: new Date('2026-04-10T09:00:00Z'),
      duration: 3600,
      calories: 500
    }

    const unsyncedWorkout = {
      id: 'unsynced-1',
      filePath: '/tmp/unsynced.fit',
      deviceName: 'Garmin Fenix',
      type: 'Ride',
      startTime: new Date('2026-04-10T10:00:00Z'),
      endTime: new Date('2026-04-10T11:30:00Z'),
      duration: 5400,
      calories: 800
    }

    db.addWorkout(syncedWorkout)
    db.addWorkout(unsyncedWorkout)
    
    // Mark one as synced
    db.markAsSynced('synced-1', 'fittrackee-uuid')

    const unsynced = db.getUnsyncedWorkouts()
    expect(unsynced).toHaveLength(1)
    expect(unsynced[0].id).toBe('unsynced-1')
  })

  test('should get statistics', () => {
    const workouts = [
      { id: 'run-1', type: 'Run', synced: true },
      { id: 'run-2', type: 'Run', synced: false },
      { id: 'ride-1', type: 'Ride', synced: true },
      { id: 'hike-1', type: 'Hike', synced: false }
    ]

    workouts.forEach(w => {
      const workout = {
        id: w.id,
        filePath: `/tmp/${w.id}.fit`,
        deviceName: 'Garmin Fenix',
        type: w.type as string,
        startTime: new Date('2026-04-10T08:00:00Z'),
        endTime: new Date('2026-04-10T09:00:00Z'),
        duration: 3600,
        calories: 500
      }
      
      const record = db.addWorkout(workout)
      if (w.synced) {
        db.markAsSynced(w.id, `fittrackee-${w.id}`)
      }
    })

    const stats = db.getStatistics()
    
    expect(stats.total).toBe(4)
    expect(stats.synced).toBe(2)
    expect(stats.unsynced).toBe(2)
    expect(stats.byType.Run).toBe(2)
    expect(stats.byType.Ride).toBe(1)
    expect(stats.byType.Hike).toBe(1)
  })

  test('should delete workout', () => {
    const workout = {
      id: 'delete-test',
      filePath: '/tmp/delete.fit',
      deviceName: 'Garmin Fenix',
      type: 'Run',
      startTime: new Date('2026-04-10T08:00:00Z'),
      endTime: new Date('2026-04-10T09:00:00Z'),
      duration: 3600,
      calories: 500
    }

    db.addWorkout(workout)
    
    const deleted = db.deleteWorkout('delete-test')
    expect(deleted).toBe(true)
    
    const record = db.getWorkout('delete-test')
    expect(record).toBeNull()
  })

  test('should update workout', () => {
    const workout = {
      id: 'update-test',
      filePath: '/tmp/update.fit',
      deviceName: 'Garmin Fenix',
      type: 'Run',
      startTime: new Date('2026-04-10T08:00:00Z'),
      endTime: new Date('2026-04-10T09:00:00Z'),
      duration: 3600,
      calories: 500
    }

    db.addWorkout(workout)
    
    const updated = db.updateWorkout('update-test', { 
      distance: 12000,
      elevationGain: 200 
    })
    
    expect(updated).toBe(true)
    
    const record = db.getWorkout('update-test')
    expect(record?.distance).toBe(12000)
    expect(record?.elevationGain).toBe(200)
  })

  test('should get recent workouts', () => {
    const now = Date.now()
    
    // Add workout from today
    const todayWorkout = {
      id: 'today-1',
      filePath: '/tmp/today.fit',
      deviceName: 'Garmin Fenix',
      type: 'Run',
      startTime: new Date(now),
      endTime: new Date(now + 3600 * 1000),
      duration: 3600,
      calories: 500
    }

    // Add workout from 10 days ago
    const oldWorkout = {
      id: 'old-1',
      filePath: '/tmp/old.fit',
      deviceName: 'Garmin Fenix',
      type: 'Ride',
      startTime: new Date(now - 10 * 24 * 60 * 60 * 1000),
      endTime: new Date(now - 10 * 24 * 60 * 60 * 1000 + 5400 * 1000),
      duration: 5400,
      calories: 800
    }

    db.addWorkout(todayWorkout)
    db.addWorkout(oldWorkout)

    const recent = db.getRecentWorkouts(7) // Last 7 days
    expect(recent).toHaveLength(1)
    expect(recent[0].id).toBe('today-1')
  })
})
