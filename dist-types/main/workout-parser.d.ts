export interface WorkoutData {
    id: string;
    type: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    distance?: number;
    calories?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    filePath: string;
    deviceName?: string;
    elevationGain?: number;
    steps?: number;
}
/**
 * Parse Garmin FIT files with enhanced extraction
 * Uses basic FIT file structure parsing for common workout data
 */
export declare function parseFitFile(filePath: string): Promise<WorkoutData | null>;
/**
 * Parse GPX files with comprehensive data extraction
 * Extracts duration, distance, elevation, calories from GPX structure
 */
export declare function parseGpxFile(filePath: string): Promise<WorkoutData | null>;
/**
 * Scan directory for new workout files and parse them
 */
export declare function scanWorkouts(directory: string): Promise<WorkoutData[]>;
