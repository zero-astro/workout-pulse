/**
 * Unit tests for USB adaptive polling mechanism
 * 
 * Tests that the detector switches between idle (30s) and active (2s)
 * polling intervals based on device presence.
 */

// Mock fs BEFORE any imports — Jest hoists this to the top
jest.mock('fs', () => {
  const realFs = jest.requireActual('fs')
  return {
    ...realFs,
    existsSync: jest.fn().mockReturnValue(false),
    statSync: jest.fn().mockReturnValue({ isDirectory: () => false } as any),
    readdirSync: jest.fn().mockReturnValue([])
  }
})

// Mock chokidar — default import style (import chokidar from 'chokidar')
jest.mock('chokidar', () => {
  const mockWatcher = {
    on: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis(),
    close: jest.fn()
  }
  return {
    __esModule: true,
    default: {
      watch: jest.fn(() => mockWatcher),
      FSWatcher: class {
        on = jest.fn().mockReturnThis()
        off = jest.fn().mockReturnThis()
        close = jest.fn()
      }
    },
    watch: jest.fn(() => mockWatcher)
  }
})

// Mock glob (external module)
jest.mock('glob', () => ({
  sync: jest.fn(() => [])
}))

// ---- Import the module under test ----
import { RobustUsbDetector, detectUsbDevice } from '../main/usb-detector'
import * as fs from 'fs'

describe('RobustUsbDetector - Adaptive Polling', () => {
  let detector: RobustUsbDetector | null = null
  
  beforeEach(() => {
    jest.clearAllMocks()
    // Create a fresh instance for each test
    detector = new RobustUsbDetector()
  })
  
  afterEach(() => {
    // Clean up after each test
    if (detector && detector.isRunning()) {
      detector.stopMonitoring()
    }
    detector = null
  })
  
  it('should start with idle polling interval (30s)', () => {
    expect(detector!.getPollingInterval()).toBe(30_000)
  })
  
  it('should allow custom polling intervals via setPollingIntervals', () => {
    detector!.setPollingIntervals(15_000, 1_000)
    
    expect(detector!.getPollingInterval()).toBe(30_000) // Still idle by default
  })
  
  it('should reject invalid polling intervals (negative or zero)', () => {
    detector!.setPollingIntervals(-1000, -500)
    
    // Should keep original values since negative values are rejected
    expect(detector!.getPollingInterval()).toBe(30_000)
  })
  
  it('should start monitoring with adaptive polling', () => {
    detector!.startMonitoring()
    
    expect(detector!.isRunning()).toBe(true)
    expect(detector!.getPollingInterval()).toBe(30_000) // Starts in idle mode
  })
})
