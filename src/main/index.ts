import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'

let mainWindow: BrowserWindow | null = null

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
  // TODO: Implement USB detection logic
  return { connected: false, device: null }
})

// Fittrackee OAuth
ipcMain.handle('fittrackee-authenticate', async (_event, credentials) => {
  // TODO: Implement OAuth flow with Fittrackee
  return { success: true, token: 'mock_token' }
})

// Sync workouts
ipcMain.handle('sync-workouts', async () => {
  // TODO: Implement workout sync logic
  return { success: true, synced: 0 }
})
