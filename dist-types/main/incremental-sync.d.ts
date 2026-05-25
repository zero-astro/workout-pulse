import { EventEmitter } from 'events';
import { FittrackeeApiClient, FittrackeeWorkout } from './fittrackee-api-client';
import { LocalWorkoutRecord } from './local-workout-db';
export interface SyncMetadata {
    workoutId: string;
    uploadedAt: number;
    fittrackeeUuid: string;
    localFilePath: string;
}
export interface SyncResult {
    success: boolean;
    skipped: boolean;
    reason?: string;
    workout?: FittrackeeWorkout;
    error?: Error;
}
export declare class IncrementalSyncManager extends EventEmitter {
    private syncMetadataPath;
    private syncMetadata;
    private apiClient;
    private recentWorkoutsCache;
    private localDb;
    constructor();
    /**
     * Initialize with API client reference and local database
     */
    initialize(apiClient: FittrackeeApiClient): void;
    /**
     * Load sync metadata from disk
     */
    private loadSyncMetadata;
    /**
     * Save sync metadata to disk
     */
    private saveSyncMetadata;
    /**
     * Check if a workout has already been synced (by UUID)
     */
    isAlreadySynced(workoutId: string): boolean;
    /**
     * Get sync metadata for a specific workout
     */
    getSyncMetadata(workoutId: string): SyncMetadata | null;
    /**
     * Check if workout exists on Fittrackee (for duplicate detection)
     */
    checkFittrackeeDuplicate(uuid: string): Promise<boolean>;
    /**
     * Process a single workout with incremental sync logic
     */
    processWorkout(filePath: string, options?: {
        skipDuplicates?: boolean;
        checkFittrackee?: boolean;
    }): Promise<SyncResult>;
    /**
     * Process multiple workouts with incremental sync
     */
    processWorkoutsBatch(filePaths: string[], options?: {
        skipDuplicates?: boolean;
        checkFittrackee?: boolean;
    }): Promise<{
        total: number;
        success: number;
        skipped: number;
        failed: number;
        results: SyncResult[];
    }>;
    /**
     * Get list of workouts that have been synced (from local database)
     */
    getSyncedWorkouts(): LocalWorkoutRecord[];
    /**
     * Get unsynced workouts from local database
     */
    getUnsyncedWorkouts(): LocalWorkoutRecord[];
    /**
     * Get recent workouts from local database
     */
    getRecentWorkouts(days?: number): LocalWorkoutRecord[];
    /**
     * Remove sync metadata for a specific workout (for undo/cleanup)
     */
    removeSyncMetadata(workoutId: string): boolean;
    /**
     * Clear all sync metadata (for testing or reset)
     */
    clearAllMetadata(): void;
    /**
     * Get statistics about synced workouts (from local database)
     */
    getStatistics(): {
        totalWorkouts: number;
        synced: number;
        unsynced: number;
        byType: Record<string, number>;
        recentSyncs: number;
        oldestSync?: number;
        newestSync?: number;
    };
}
export declare const incrementalSync: IncrementalSyncManager;
