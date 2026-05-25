import { WorkoutData } from './workout-parser';
/**
 * Local workout database schema
 */
export interface LocalWorkoutRecord {
    id: string;
    filePath: string;
    fileName: string;
    deviceName?: string;
    type: string;
    startTime: number;
    endTime: number;
    duration: number;
    distance?: number;
    elevationGain?: number;
    calories?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    syncedAt?: number;
    fittrackeeUuid?: string;
    createdAt: number;
    updatedAt: number;
}
export interface WorkoutFilterOptions {
    deviceId?: string;
    type?: string;
    startDate?: Date;
    endDate?: Date;
    syncedOnly?: boolean;
    unsyncedOnly?: boolean;
}
export declare class LocalWorkoutDatabase {
    private db;
    private dbPath;
    constructor();
    /**
     * Create database tables and indexes
     */
    private initializeSchema;
    /**
     * Add a new workout record to the database
     */
    addWorkout(workout: WorkoutData): LocalWorkoutRecord;
    /**
     * Get a workout by ID
     */
    getWorkout(id: string): LocalWorkoutRecord | null;
    /**
     * Get all workouts (with optional filtering)
     */
    getAllWorkouts(options?: WorkoutFilterOptions): LocalWorkoutRecord[];
    /**
     * Get unsynced workouts (not yet uploaded to Fittrackee)
     */
    getUnsyncedWorkouts(): LocalWorkoutRecord[];
    /**
     * Get synced workouts only
     */
    getSyncedWorkouts(): LocalWorkoutRecord[];
    /**
     * Mark a workout as synced to Fittrackee
     */
    markAsSynced(workoutId: string, fittrackeeUuid: string): boolean;
    /**
     * Update an existing workout record
     */
    updateWorkout(workoutId: string, updates: Partial<LocalWorkoutRecord>): boolean;
    /**
     * Delete a workout record from the database
     */
    deleteWorkout(workoutId: string): boolean;
    /**
     * Get statistics about stored workouts
     */
    getStatistics(): {
        total: number;
        synced: number;
        unsynced: number;
        byType: Record<string, number>;
        recentSyncs: number;
    };
    /**
     * Get recent workouts (last N days)
     */
    getRecentWorkouts(days?: number): LocalWorkoutRecord[];
    /**
     * Close database connection (for cleanup)
     */
    close(): void;
}
export declare let localWorkoutDb: LocalWorkoutDatabase | null;
export declare function initializeLocalWorkoutDb(): LocalWorkoutDatabase;
