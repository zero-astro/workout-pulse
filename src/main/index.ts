import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import * as path from 'path'
// fs import removed - unused in this module
// FittrackeeOAuthClient import removed - not directly used here

let mainWindow: BrowserWindow | null = null
let fittrackeeApi: any = null // FittrackeeApiClient instance
const localDb = require('./local-workout-db').initializeLocalWorkoutDb()

/**
 * Create the main application window with Electron security best practices
 * - Disables Node.js integration in renderer process
 * - Enables context isolation for secure IPC communication
 * - Loads preload script for safe API exposure
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  // Hide menu bar on all platforms (especially macOS) for cleaner UI
  const emptyMenu = Menu.buildFromTemplate([])
  mainWindow.setMenu(emptyMenu)

  // Load the app - use Vite dev server in development, bundled file in production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// Initialize the app and create window when Electron is ready
app.whenReady().then(createWindow)

// Quit all windows when all are closed (except on macOS where it stays active)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Reactivate app on macOS dock click when no windows are open
app.on('activate', () => {
  if (!mainWindow) createWindow()
})

/**
 * IPC Handler: Detect connected USB smartwatch devices
 * Scans for Garmin, Fitbit, and Apple Watch devices using multiple detection methods
 */
ipcMain.handle('detect-usb-device', async () => {
  try {
    const device = await require('./usb-detector').detectUsbDevice()
    console.log('[WorkoutPulse] USB detection result:', device)
    return device
  } catch (error) {
    console.error('[WorkoutPulse] USB detection error:', error)
    return { connected: false, device: null }
  }
})

/**
 * IPC Handler: Set Fittrackee OAuth credentials
 * Validates and stores client ID/secret for API authentication
 */
ipcMain.handle('fittrackee-set-credentials', async (_event, clientId, clientSecret) => {
  try {
    const { fittrackeeOAuth } = require('./oauth-client')
    await fittrackeeOAuth.setCredentials(clientId, clientSecret)
    return { success: true }
  } catch (error) {
    console.error('[WorkoutPulse] Error setting credentials:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Get Fittrackee OAuth authorization URL
 * Returns the URL for user to authenticate with Fittrackee
 */
ipcMain.handle('fittrackee-get-auth-url', async () => {
  try {
    const { fittrackeeOAuth } = require('./oauth-client')
    const authUrl = fittrackeeOAuth.getAuthorizationUrl()
    return { success: true, authUrl }
  } catch (error) {
    console.error('[WorkoutPulse] Error getting auth URL:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Exchange OAuth authorization code for access/refresh tokens
 * Called after user completes Fittrackee login in browser
 */
ipcMain.handle('fittrackee-exchange-code', async (_event, code) => {
  try {
    const { fittrackeeOAuth } = require('./oauth-client')
    const credentials = await fittrackeeOAuth.exchangeCodeForToken(code)
    
    // Initialize API client with new credentials if not already created
    if (!fittrackeeApi) {
      fittrackeeApi = require('./fittrackee-api-client').initializeFittrackeeApi(fittrackeeOAuth)
    }
    fittrackeeApi.setAccessToken(credentials)
    
    return { success: true, credentials }
  } catch (error) {
    console.error('[WorkoutPulse] Error exchanging code:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Check current Fittrackee authentication status
 * Returns whether user is authenticated and has valid tokens
 */
ipcMain.handle('fittrackee-check-auth', async () => {
  const { fittrackeeOAuth } = require('./oauth-client')
  const isAuthenticated = fittrackeeOAuth.isAuthenticated()
  const credentials = await fittrackeeOAuth.loadStoredCredentials()
  
  return {
    success: true,
    authenticated: isAuthenticated,
    hasToken: !!credentials?.accessToken,
    tokenExpiry: credentials?.tokenExpiry
  }
})

/**
 * IPC Handler: Sync workouts from USB device to Fittrackee API
 * Main sync workflow: detect devices → extract files → parse → upload
 */
ipcMain.handle('sync-workouts', async (_event, scanDirectory?: string) => {
  try {
    // Check authentication first - prevent syncing without valid credentials
    const authStatus = await fittrackeeApi?.getUserProfile()
    if (!authStatus) {
      return { success: false, error: 'Not authenticated with Fittrackee' }
    }

    // Initialize API client if needed
    if (!fittrackeeApi) {
      const { initializeFittrackeeApi } = require('./fittrackee-api-client')
      const { fittrackeeOAuth } = require('./oauth-client')
      fittrackeeApi = initializeFittrackeeApi(fittrackeeOAuth)
    }

    // Scan for workout files in specified or default directory
    const scanPath = scanDirectory || '/Volumes/USB_DRIVE/workouts' // Default path
    let workouts: any[] = []
    
    try {
      workouts = await require('./workout-parser').scanWorkouts(scanPath)
    } catch (error) {
      console.warn('[WorkoutPulse] Could not scan directory:', error)
      // Try common locations as fallback
      const homeDir = require('os').homedir()
      const commonPaths = [
        path.join(homeDir, 'Downloads'),
        path.join(homeDir, 'Documents')
      ]
      
      for (const scanPath of commonPaths) {
        try {
          workouts = await require('./workout-parser').scanWorkouts(scanPath)
          if (workouts.length > 0) break
        } catch {}
      }
    }

    console.log('[WorkoutPulse] Found', workouts.length, 'workouts to sync')
    
    // No workouts found - return success with zero count
    if (workouts.length === 0) {
      return { success: true, synced: 0, message: 'No workout files found' }
    }

    // Upload workouts to Fittrackee in batches with deduplication
    const result = await fittrackeeApi.uploadWorkoutsBatch(workouts, {
      skipDuplicates: true,
      batchSize: 5,
      delayMs: 1000
    })

    // Emit progress events during upload for UI updates
    for (let i = 0; i < workouts.length; i++) {
      if (mainWindow) {
        mainWindow.webContents.send('sync-progress', { current: i + 1, total: workouts.length })
      }
    }

    return {
      success: true,
      total: workouts.length,
      synced: result.success,
      failed: result.failed,
      errors: result.errors
    }
    
  } catch (error) {
    console.error('[WorkoutPulse] Sync error:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Get all workouts from local SQLite database
 * Returns workout data stored locally for offline access and statistics
 */
ipcMain.handle('get-local-workouts', async (_event, limit?: number) => {
  try {
    const workouts = localDb.getAllWorkouts({})
    return { success: true, workouts: limit ? workouts.slice(0, limit) : workouts }
  } catch (error) {
    console.error('[WorkoutPulse] Error fetching local workouts:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Get paginated workouts from local SQLite database (for lazy loading)
 * Returns a page of workouts with total count for UI pagination controls
 */
ipcMain.handle('get-paginated-workouts', async (_event, offset = 0, limit = 25, filters?: any) => {
  try {
    const result = localDb.getPaginatedWorkouts(filters || {}, offset, limit)
    return { success: true, ...result }
  } catch (error) {
    console.error('[WorkoutPulse] Error fetching paginated workouts:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Get workout statistics from local database
 * Returns aggregated data: total workouts, distance, duration, calories, etc.
 */
ipcMain.handle('get-workout-statistics', async () => {
  try {
    const stats = localDb.getStatistics()
    return { success: true, ...stats }
  } catch (error) {
    console.error('[WorkoutPulse] Error getting statistics:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Open Fittrackee OAuth authorization modal
 * Triggers the login flow for user authentication with Fittrackee
 */
ipcMain.handle('open-auth-modal', async () => {
  try {
    const { fittrackeeOAuth } = require('./oauth-client')
    
    // Check if already authenticated - skip auth flow if so
    const isAuthenticated = fittrackeeOAuth.isAuthenticated()
    
    if (isAuthenticated) {
      return { success: true, alreadyAuthenticated: true }
    }
    
    // Get authorization form data for FitTrackee OAuth POST request
    try {
      const authData = fittrackeeOAuth.getAuthorizationFormData()
      
      // Send the form data to renderer to POST to FitTrackee
      mainWindow?.webContents.send('show-auth-modal', authData)
      return { success: true }
    } catch (error) {
      console.error('[WorkoutPulse] Error getting auth URL:', error)
      return { success: false, error: 'Failed to generate authorization form' }
    }
  } catch (error) {
    console.error('[WorkoutPulse] Error opening auth modal:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Get recent workouts from Fittrackee API
 * Fetches the most recent workouts synced to Fittrackee cloud
 */
ipcMain.handle('fittrackee-get-recent-workouts', async (_event, limit = 10) => {
  try {
    if (!fittrackeeApi) {
      const { initializeFittrackeeApi } = require('./fittrackee-api-client')
      const { fittrackeeOAuth } = require('./oauth-client')
      fittrackeeApi = initializeFittrackeeApi(fittrackeeOAuth)
    }
    
    const workouts = await fittrackeeApi.getRecentWorkouts(limit)
    return { success: true, workouts }
  } catch (error) {
    console.error('[WorkoutPulse] Error fetching recent workouts:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: Open external URL in system default browser
 * Used for Fittrackee authorization page and other external links
 */
ipcMain.handle('open-browser', async (_event, url: string) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    console.error('[WorkoutPulse] Error opening browser:', error)
    return { success: false, error: error.message }
  }
})

/**
 * IPC Handler: POST request to FitTrackee authorization endpoint
 * Used for OAuth token exchange with form data submission
 */
ipcMain.handle('post-to-url', async (_event, url: string, formData: URLSearchParams) => {
  try {
    // Use Electron's net module for the POST request (bypasses CORS in renderer)
    const { net } = require('electron')
    
    const request = net.request({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    
    return new Promise((resolve) => {
      let responseData = ''
      
      request.on('response', (response: any) => {
        let data = ''
        response.on('data', (chunk: any) => { data += chunk })
        response.on('end', () => {
          resolve({ success: true, data })
        })
      })
      
      request.on('error', (err: any) => {
        console.error('[WorkoutPulse] POST error:', err)
        resolve({ success: false, error: err.message })
      })
      
      // Write form data to request body in URL-encoded format
      const formDataString = Array.from(formData.entries())
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')
      
      request.write(formDataString)
      request.end()
    })
  } catch (error) {
    console.error('[WorkoutPulse] Error posting to URL:', error)
    return { success: false, error: error.message }
  }
})
