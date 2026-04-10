import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  detectUsbDevice: () => ipcRenderer.invoke('detect-usb-device'),
  fittrackeeSetCredentials: (clientId: string, clientSecret: string) => 
    ipcRenderer.invoke('fittrackee-set-credentials', clientId, clientSecret),
  fittrackeeGetAuthUrl: () => ipcRenderer.invoke('fittrackee-get-auth-url'),
  fittrackeeExchangeCode: (code: string) => 
    ipcRenderer.invoke('fittrackee-exchange-code', code),
  fittrackeeCheckAuth: () => ipcRenderer.invoke('fittrackee-check-auth'),
  syncWorkouts: (scanDirectory?: string) => 
    ipcRenderer.invoke('sync-workouts', scanDirectory),
  getRecentWorkouts: (limit?: number) => 
    ipcRenderer.invoke('fittrackee-get-recent-workouts', limit),
  // Local database methods
  getLocalWorkouts: (limit?: number) => 
    ipcRenderer.invoke('get-local-workouts', limit),
  getWorkoutStatistics: () => 
    ipcRenderer.invoke('get-workout-statistics'),
  openAuthModal: () => 
    ipcRenderer.invoke('open-auth-modal')
})

export type ElectronAPI = typeof window.electron
