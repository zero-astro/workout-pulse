import { EventEmitter } from 'events';
import { FittrackeeOAuthClient, OAuthCredentials } from './oauth-client';
import { WorkoutData } from './workout-parser';
export interface FittrackeeWorkout {
    uuid: string;
    activity_type_id: number;
    device_uuid?: string;
    is_outdoors?: boolean;
    name?: string;
    description?: string;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    elevation_gain: number;
    total_photo_count: number;
    start_datetime: string;
    end_datetime: string;
    average_heart_rate?: number;
    maximum_heart_rate?: number;
    calories: number;
    workout_id?: number;
}
export interface FittrackeeActivityType {
    id: number;
    name: string;
}
export declare class FittrackeeApiClient extends EventEmitter {
    private baseUrl;
    private accessToken;
    private oauthClient;
    private rateLimiter;
    private readonly activityTypeMap;
    constructor(oauthClient: FittrackeeOAuthClient);
    /**
     * Set access token from OAuth credentials
     */
    setAccessToken(credentials: OAuthCredentials): void;
    /**
     * Get user profile information with retry logic
     */
    getUserProfile(): Promise<any>;
    /**
     * Get list of available activity types with retry logic
     */
    getActivityTypes(): Promise<FittrackeeActivityType[]>;
    /**
     * Get recent workouts from Fittrackee with retry logic
     */
    getRecentWorkouts(limit?: number): Promise<FittrackeeWorkout[]>;
    /**
     * Get a specific workout by UUID
     */
    getWorkout(uuid: string): Promise<FittrackeeWorkout | null>;
    /**
     * Upload a new workout to Fittrackee with retry logic, circuit breaker, and input validation
     */
    uploadWorkout(workout: WorkoutData): Promise<FittrackeeWorkout>;
    /**
     * Upload multiple workouts with rate limiting
     */
    uploadWorkoutsBatch(workouts: WorkoutData[], options?: {
        skipDuplicates?: boolean;
        batchSize?: number;
        delayMs?: number;
    }): Promise<{
        success: number;
        failed: number;
        errors: string[];
    }>;
    /**
     * Delete a workout by UUID with retry logic
     */
    deleteWorkout(uuid: string): Promise<void>;
    /**
     * Make HTTP request to Fittrackee API with rate limiting
     */
    private makeRequest;
    /**
     * Utility: delay function for rate limiting
     */
    private delay;
}
export declare let fittrackeeApi: FittrackeeApiClient | null;
export declare function initializeFittrackeeApi(oauthClient: FittrackeeOAuthClient): FittrackeeApiClient;
