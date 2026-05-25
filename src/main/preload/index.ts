import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload Script - Secure IPC Bridge for WorkoutPulse
 * 
 * This script exposes a safe subset of Electron's IPC functionality
 * to the renderer process (React UI) without exposing the full ipcRenderer API.
 * 
 * Security: Uses contextBridge to prevent direct access to Node.js APIs
 * from the renderer process, following Electron security best practices.
 */

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  /**
   * Detect connected USB smartwatch devices (Garmin, Fitbit, Apple Watch)
   * @returns Promise<{ connected: boolean; device?: DeviceInfo }>
   */
  detectUsbDevice: () => ipcRenderer.invoke('detect-usb-device'),
  
  /**
   * Set Fittrackee OAuth credentials for API authentication
   * @param clientId - OAuth client ID from Fittrackee developer portal
   * @param clientSecret - OAuth client secret (stored securely)
   * @returns Promise<{ success: boolean }>
   */
  fittrackeeSetCredentials: (clientId: string, clientSecret: string) => 
    ipcRenderer.invoke('fittrackee-set-credentials', clientId, clientSecret),
  
  /**
   * Get OAuth authorization URL for Fittrackee login flow
   * @returns Promise<{ success: boolean; authUrl?: string }>
   */
  fittrackeeGetAuthUrl: () => ipcRenderer.invoke('fittrackee-get-auth-url'),
  
  /**
   * Exchange OAuth authorization code for access/refresh tokens
   * Called after user completes Fittrackee login in browser
   * @param code - Authorization code from Fittrackee callback URL
   * @returns Promise<{ success: boolean; credentials?: OAuthCredentials }>
   */
  fittrackeeExchangeCode: (code: string) => 
    ipcRenderer.invoke('fittrackee-exchange-code', code),
  
  /**
   * Check current authentication status with Fittrackee
   * @returns Promise<{ success: boolean; authenticated: boolean; hasToken: boolean }>
   */
  fittrackeeCheckAuth: () => ipcRenderer.invoke('fittrackee-check-auth'),
  
  /**
   * Sync workouts from USB device or specified directory to Fittrackee
   * Scans for FIT/GPX files, parses them, and uploads to Fittrackee API
   * @param scanDirectory - Optional path to scan (defaults to /Volumes/USB_DRIVE/workouts)
   * @returns Promise<{ success: boolean; synced?: number }>
   */
  syncWorkouts: (scanDirectory?: string) => 
    ipcRenderer.invoke('sync-workouts', scanDirectory),
  
  /**
   * Get recent workouts from local SQLite database
   * @param limit - Maximum number of workouts to return (default: 10)
   * @returns Promise<WorkoutData[]>
   */
  getRecentWorkouts: (limit?: number) => 
    ipcRenderer.invoke('fittrackee-get-recent-workouts', limit),
  
  /**
   * Get all workouts from local database with pagination
   * @param limit - Maximum number of workouts to return
   * @returns Promise<WorkoutData[]>
   */
  getLocalWorkouts: (limit?: number) => 
    ipcRenderer.invoke('get-local-workouts', limit),
  
  /**
   * Get paginated workouts from local database for lazy loading
   * Returns a page of workouts with total count and hasMore flag
   * @param offset - Number of records to skip (for pagination)
   * @param limit - Maximum number of workouts per page (default: 25)
   * @param filters - Optional filter criteria (type, date range, etc.)
   * @returns Promise<{ workouts: WorkoutData[], total: number, hasMore: boolean }>\n    */
  getPaginatedWorkouts: (offset = 0, limit = 25, filters?: any) => 
    ipcRenderer.invoke('get-paginated-workouts', offset, limit, filters),
  
  /**
   * Get workout statistics from local database
   * Returns total workouts, distance, duration, calories, etc.
   * @returns Promise<{ totalWorkouts: number; totalDistance: number; ... }>
   */
  getWorkoutStatistics: () => 
    ipcRenderer.invoke('get-workout-statistics'),
  
  /**
   * Open Fittrackee OAuth authorization modal in browser
   * Triggers the login flow for user authentication
   * @returns Promise<{ success: boolean }>
   */
  openAuthModal: () => 
    ipcRenderer.invoke('open-auth-modal'),
  
  /**
   * Open external URL in system default browser
   * Used for Fittrackee authorization page and other external links
   * @param url - URL to open in browser
   * @returns Promise<{ success: boolean }>
   */
  openBrowser: (url: string) => 
    ipcRenderer.invoke('open-browser', url),
  
  /**
   * Make POST request to Fittrackee API endpoint
   * Used for OAuth token exchange and other POST operations
   * @param url - Target URL for the POST request
   * @param formData - Form data to send in the request body
   * @returns Promise<{ success: boolean; data?: any }>
   */
  postToUrl: (url: string, formData: URLSearchParams) => 
    ipcRenderer.invoke('post-to-url', url, formData)
})

/**
 * TypeScript type definition for the exposed Electron API
 * Used by renderer components to access IPC methods with full type safety
 */
export type ElectronAPI = typeof window.electron
