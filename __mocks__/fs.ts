// Manual mock for fs module — all methods return controllable values via jest.fn()
const existsSync = jest.fn().mockReturnValue(false)
const statSync = jest.fn().mockReturnValue({ isDirectory: () => false } as any)
const readdirSync = jest.fn().mockReturnValue([])

module.exports = {
  // Sync APIs used by usb-detector.ts
  existsSync,
  statSync,
  readdirSync,
  
  // Also export the real implementations for tests that need them
  __esModule: true,
  __real__: require.requireActual('fs'),
  
  // Async APIs (not used by usb-detector but exported)
  promises: {
    stat: jest.fn(),
    readdir: jest.fn(),
    access: jest.fn()
  },
  
  // Other common fs exports
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  createReadStream: jest.fn(),
  createWriteStream: jest.fn(),
  appendFileSync: jest.fn()
}
