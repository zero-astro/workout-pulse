"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  detectUsbDevice: () => electron.ipcRenderer.invoke("detect-usb-device"),
  fittrackeeSetCredentials: (clientId, clientSecret) => electron.ipcRenderer.invoke("fittrackee-set-credentials", clientId, clientSecret),
  fittrackeeGetAuthUrl: () => electron.ipcRenderer.invoke("fittrackee-get-auth-url"),
  fittrackeeExchangeCode: (code) => electron.ipcRenderer.invoke("fittrackee-exchange-code", code),
  fittrackeeCheckAuth: () => electron.ipcRenderer.invoke("fittrackee-check-auth"),
  syncWorkouts: (scanDirectory) => electron.ipcRenderer.invoke("sync-workouts", scanDirectory),
  getRecentWorkouts: (limit) => electron.ipcRenderer.invoke("fittrackee-get-recent-workouts", limit),
  // Local database methods
  getLocalWorkouts: (limit) => electron.ipcRenderer.invoke("get-local-workouts", limit),
  getWorkoutStatistics: () => electron.ipcRenderer.invoke("get-workout-statistics"),
  openAuthModal: () => electron.ipcRenderer.invoke("open-auth-modal"),
  // Event system
  on: (channel, callback) => {
    const subscription = (event, ...args) => callback(event, ...args);
    electron.ipcRenderer.on(channel, subscription);
    return () => electron.ipcRenderer.removeListener(channel, subscription);
  },
  removeAllListeners: (channel) => {
    electron.ipcRenderer.removeAllListeners(channel);
  }
});
