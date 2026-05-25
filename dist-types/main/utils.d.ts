/**
 * Utility functions for WorkoutPulse
 */
/**
 * Parse ISO 8601 datetime string to Date object
 */
export declare function parseDateTime(isoString: string): Date;
/**
 * Format duration in seconds to human-readable string
 */
export declare function formatDuration(seconds: number): string;
/**
 * Format distance in meters to human-readable string
 */
export declare function formatDistance(meters: number): string;
/**
 * Format calories to human-readable string
 */
export declare function formatCalories(calories: number): string;
/**
 * Format heart rate to human-readable string
 */
export declare function formatHeartRate(bpm: number): string;
/**
 * Check if two dates are the same day
 */
export declare function isSameDay(date1: Date, date2: Date): boolean;
/**
 * Generate UUID v4
 */
export declare function generateUUID(): string;
