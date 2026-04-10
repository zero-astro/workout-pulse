// Mock Electron module for Jest tests
module.exports = {
  app: {
    getPath: jest.fn((name) => {
      const paths = {
        userData: '/tmp/test-user-data',
        home: require('os').homedir(),
        desktop: `${require('os').homedir()}/Desktop`,
        documents: `${require('os').homedir()}/Documents`
      }
      return paths[name] || paths.userData
    }),
    getName: jest.fn(() => 'WorkoutPulse'),
    getVersion: jest.fn(() => '1.0.0')
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({})),
  ipcMain: {
    on: jest.fn(),
    once: jest.fn(),
    send: jest.fn(),
    handle: jest.fn()
  },
  ipcRenderer: {
    send: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    invoke: jest.fn()
  },
  shell: {
    openExternal: jest.fn(),
    showItemInFolder: jest.fn(),
    beep: jest.fn()
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => true),
    encryptString: jest.fn((s) => Buffer.from(s)),
    decryptString: jest.fn((b) => b.toString())
  }
}
