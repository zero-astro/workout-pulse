import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  detectUsbDevice: () => ipcRenderer.invoke('detect-usb-device'),
  fittrackeeAuthenticate: (credentials: any) => ipcRenderer.invoke('fittrackee-authenticate', credentials),
  syncWorkouts: () => ipcRenderer.invoke('sync-workouts')
})

export type ElectronAPI = typeof window.electron
