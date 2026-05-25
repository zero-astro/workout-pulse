import { EventEmitter } from 'events';
export interface UsbDeviceEvent {
    type: 'connected' | 'disconnected' | 'workout-detected' | 'error';
    device?: string;
    devicePath?: string;
    filePath?: string;
    error?: Error;
    timestamp: number;
}
export interface DeviceInfo {
    name: string;
    path: string;
    type: 'garmin' | 'fitbit' | 'apple-watch' | 'unknown';
    workoutFiles: string[];
}
export declare class RobustUsbDetector extends EventEmitter {
    private watcher;
    private deviceDirs;
    private isMonitoring;
    private lastWorkoutScan;
    private pollInterval;
    private knownVendorIds;
    constructor();
    /**
     * Discover all connected smartwatch devices with multiple detection methods
     */
    private discoverDevices;
    /**
     * Get potential device paths from common locations
     */
    private getPotentialDevicePaths;
    /**
     * Scan /Volumes for mounted USB devices
     */
    private scanMountedDevices;
    /**
     * Check if a glob pattern matches any files/directories
     */
    private globExists;
    /**
     * Analyze a device path to determine its type and workout files
     */
    private analyzeDevice;
    /**
     * Find all workout files in a directory recursively
     */
    private findWorkoutFiles;
    /**
     * Helper to log messages conditionally based on environment
     */
    private log;
    /**
     * Start monitoring USB connections with multiple fallback mechanisms
     */
    startMonitoring(): void;
    /**
     * Watch a specific device directory for file changes
     */
    private watchDirectory;
    /**
     * Watch system mount points for new devices
     */
    private watchMountPoints;
    /**
     * Periodic polling as fallback mechanism
     */
    private startPolling;
    /**
     * Handle newly detected workout file
     */
    private handleNewFile;
    /**
     * Handle file changes (in case workout is still being written)
     */
    private handleFileChange;
    /**
     * Handle file removal (device disconnected)
     */
    private handleFileRemoved;
    /**
     * Stop all monitoring mechanisms
     */
    stopMonitoring(): void;
    /**
     * Get current monitoring status
     */
    isRunning(): boolean;
    /**
     * Get list of currently detected devices
     */
    getDetectedDevices(): DeviceInfo[];
    /**
     * Manually trigger device discovery (useful for testing)
     */
    refreshDeviceList(): void;
}
export declare const usbDetector: RobustUsbDetector;
/**
 * Simple USB device detection function (non-streaming)
 */
export declare function detectUsbDevice(): Promise<{
    connected: boolean;
    device?: DeviceInfo;
}>;
