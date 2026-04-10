import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { fittrackeeOAuth, FittrackeeOAuthClient } from './oauth-client'
import { initializeFittrackeeApi, FittrackeeApiClient } from './fittrackee-api-client'
import { scanWorkouts, WorkoutData } from './workout-parser'
import { detectUsbDevice } from './usb-detector'
import { initializeLocalWorkoutDb } from './local-workout-db'

let mainWindow: BrowserWindow | null = null
let fittrackeeApi: FittrackeeApiClient | null = null
const localDb = initializeLocalWorkoutDb()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (process.env.VITE_DEV_SERVER) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!mainWindow) createWindow()
})

// USB Device Detection
ipcMain.handle('detect-usb-device', async () => {
  try {
    const device = await detectUsbDevice()
    console.log('[WorkoutPulse] USB detection result:', device)
    return device
  } catch (error) {
    console.error('[WorkoutPulse] USB detection error:', error)
    return { connected: false, device: null }
  }
})

// Fittrackee OAuth - Set credentials
ipcMain.handle('fittrackee-set-credentials', async (_event, clientId, clientSecret) => {
  try {
    fittrackeeOAuth.setCredentials(clientId, clientSecret)
    return { success: true }
  } catch (error) {
    console.error('[WorkoutPulse] Error setting credentials:', error)
    return { success: false, error: error.message }
  }
})

// Fittrackee OAuth - Get authorization URL
ipcMain.handle('fittrackee-get-auth-url', async () => {
  try {
    const authUrl = fittrackeeOAuth.getAuthorizationUrl()
    return { success: true, authUrl }
  } catch (error) {
    console.error('[WorkoutPulse] Error getting auth URL:', error)
    return { success: false, error: error.message }
  }
})

// Fittrackee OAuth - Exchange code for token
ipcMain.handle('fittrackee-exchange-code', async (_event, code) => {
  try {
    const credentials = await fittrackeeOAuth.exchangeCodeForToken(code)
    
    // Initialize API client with new credentials
    if (!fittrackeeApi) {
      fittrackeeApi = initializeFittrackeeApi(fittrackeeOAuth)
    }
    fittrackeeApi.setAccessToken(credentials)
    
    return { success: true, credentials }
  } catch (error) {
    console.error('[WorkoutPulse] Error exchanging code:', error)
    return { success: false, error: error.message }
  }
})

// Fittrackee OAuth - Check authentication status
ipcMain.handle('fittrackee-check-auth', async () => {
  const isAuthenticated = fittrackeeOAuth.isAuthenticated()
  const credentials = fittrackeeOAuth.loadStoredCredentials()
  
  return {
    success: true,
    authenticated: isAuthenticated,
    hasToken: !!credentials?.accessToken,
    tokenExpiry: credentials?.tokenExpiry
  }
})

// Sync workouts from USB to Fittrackee
ipcMain.handle('sync-workouts', async (_event, scanDirectory?: string) => {
  try {
    // Check authentication first
    const authStatus = await ipcMain.handle('fittrackee-check-auth')()
    if (!authStatus.authenticated) {
      return { success: false, error: 'Not authenticated with Fittrackee' }
    }

    // Initialize API client if needed
    if (!fittrackeeApi) {
      fittrackeeApi = initializeFittrackeeApi(fittrackeeOAuth)
    }

    // Scan for workout files
    const scanPath = scanDirectory || '/Volumes/USB_DRIVE/workouts' // Default path
    let workouts: WorkoutData[] = []
    
    try {
      workouts = await scanWorkouts(scanPath)
    } catch (error) {
      console.warn('[WorkoutPulse] Could not scan directory:', error)
      // Try common locations
      const homeDir = require('os').homedir()
      const commonPaths = [
        path.join(homeDir, 'Downloads'),
        path.join(homeDir, 'Documents')
      ]
      
      for (const scanPath of commonPaths) {
        try {
          workouts = await scanWorkouts(scanPath)
          if (workouts.length > 0) break
        } catch {}
      }
    }

    console.log('[WorkoutPulse] Found', workouts.length, 'workouts to sync')
    
    if (workouts.length === 0) {
      return { success: true, synced: 0, message: 'No workout files found' }
    }

    // Upload workouts to Fittrackee with progress tracking
    const result = await fittrackeeApi.uploadWorkoutsBatch(workouts, {
      skipDuplicates: true,
      batchSize: 5,
      delayMs: 1000
    })

    // Emit progress events during upload
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

// Get local workouts from database
ipcMain.handle('get-local-workouts', async (_event, limit?: number) => {
  try {
    const workouts = localDb.getAllWorkouts({})
    return { success: true, workouts: limit ? workouts.slice(0, limit) : workouts }
  } catch (error) {
    console.error('[WorkoutPulse] Error fetching local workouts:', error)
    return { success: false, error: error.message }
  }
})

// Get workout statistics
ipcMain.handle('get-workout-statistics', async () => {
  try {
    const stats = localDb.getStatistics()
    return { success: true, ...stats }
  } catch (error) {
    console.error('[WorkoutPulse] Error getting statistics:', error)
    return { success: false, error: error.message }
  }
})

// Open auth modal from renderer
ipcMain.handle('open-auth-modal', async () => {
  try {
    mainWindow?.webContents.send('show-auth-modal')
    return { success: true }
  } catch (error) {
    console.error('[WorkoutPulse] Error opening auth modal:', error)
    return { success: false, error: error.message }
  }
})

// Get recent workouts from Fittrackee
ipcMain.handle('fittrackee-get-recent-workouts', async (_event, limit = 10) => {
  try {
    if (!fittrackeeApi) {
      fittrackeeApi = initializeFittrackeeApi(fittrackeeOAuth)
    }
    
    const workouts = await fittrackeeApi.getRecentWorkouts(limit)
    return { success: true, workouts }
  } catch (error) {
    console.error('[WorkoutPulse] Error fetching recent workouts:', error)
    return { success: false, error: error.message }
  }
})
