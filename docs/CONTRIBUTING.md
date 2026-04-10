# Contributing to WorkoutPulse

Thank you for your interest in contributing to WorkoutPulse! This guide provides everything you need to know about setting up the development environment, coding standards, and submission process.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Documentation Requirements](#documentation-requirements)
- [Common Tasks](#common-tasks)

---

## Getting Started

### Prerequisites

Before you can contribute, ensure you have:

- **Node.js** 18+ installed ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- **Git** for version control
- **Code editor**: VS Code recommended (with ESLint extension)
- **Smartwatch** (optional, for testing USB detection)

### Verify Installation

```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher

# Check npm version
npm --version   # Should be v9.0.0 or higher

# Check Git version
git --version
```

---

## Development Setup

### Step 1: Fork and Clone Repository

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/workout-pulse.git
cd workout-pulse

# Add upstream remote for syncing with original repo
git remote add upstream https://github.com/zero-astro/workout-pulse.git
```

### Step 2: Install Dependencies

```bash
# Install all dependencies
npm install

# Verify installation
npm run lint      # Check code style
npm run type-check  # Check TypeScript types
```

### Step 3: Run Development Server

```bash
# Start the app in development mode
npm run dev

# App will open automatically with hot-reload enabled
```

### Step 4: Build for Testing

```bash
# Build production bundle
npm run build

# Create distributable packages (macOS, Windows, Linux)
npm run dist
```

---

## Project Structure

```
workout-pulse/
├── src/
│   ├── main/              # Electron main process
│   │   ├── api-client.ts  # Fittrackee API integration
│   │   ├── credentials-manager.ts  # Secure credential storage
│   │   ├── logger.ts      # Logging utility
│   │   ├── oauth-client.ts    # OAuth 2.0 authentication
│   │   ├── security-utils.ts  # Input validation & sanitization
│   │   ├── usb-detector.ts    # USB device detection
│   │   └── index.ts       # Main entry point
│   │
│   ├── renderer/          # React frontend (Electron renderer)
│   │   ├── components/    # UI Components
│   │   │   ├── Dashboard.tsx      # Main dashboard view
│   │   │   ├── SettingsModal.tsx  # OAuth configuration modal
│   │   │   └── WorkoutDetailsModal.tsx  # Workout details view
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript type definitions
│   │   └── App.tsx        # Root component
│   │
│   ├── __tests__/         # Unit tests
│   │   ├── usb-detector.test.ts
│   │   └── workout-parser.test.ts
│   │
│   └── main/              # Electron IPC handlers
│       └── ipc-handlers.ts
│
├── docs/                  # Documentation (this file)
│   ├── API_DOCUMENTATION.md
│   ├── CONTRIBUTING.md
│   └── TROUBLESHOOTING_GUIDE.md
│
├── public/                # Static assets
│   └── icons/             # App icons for different platforms
│
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite bundler configuration
└── README.md              # Project overview

```

### Key Directories Explained

#### `src/main/` - Electron Main Process

Handles:
- USB device detection and monitoring
- Fittrackee API communication
- OAuth authentication flow
- Secure credential storage (AES-256-CBC encryption)
- Local SQLite database operations
- IPC event handling with renderer process

**Important Files:**
- `index.ts`: Application lifecycle, window management
- `usb-detector.ts`: Multi-method USB detection (file watcher, mount scanning, polling)
- `fittrackee-api-client.ts`: API client with rate limiting and retry logic
- `credentials-manager.ts`: Encrypted credential storage

#### `src/renderer/` - React Frontend

Handles:
- User interface rendering
- Real-time sync progress display
- Workout statistics visualization
- Settings management UI

**Important Files:**
- `App.tsx`: Root component with theme provider
- `Dashboard.tsx`: Main dashboard with workout list and stats
- `components/`: Reusable UI components

#### `src/__tests__/` - Test Suite

Jest-based unit tests:
- USB detection logic
- Workout parser (FIT/GPX/TCX)
- API client mock tests
- Security utilities validation

---

## Coding Standards

### TypeScript Style Guide

Follow these conventions consistently:

#### 1. Naming Conventions

```typescript
// ✅ Good - PascalCase for classes/types
interface WorkoutData {
  id: string
  startTime: Date
}

class FittrackeeApiClient extends EventEmitter {}

// ✅ Good - camelCase for variables/functions
const workoutId = 'a1b2c3d4-e5f6-7890'
function uploadWorkout(workout: WorkoutData) {}

// ❌ Bad - Avoid UPPER_CASE for constants (except config)
const MAX_WORKOUTS = 100  // ✅ OK for configuration
let workoutCount = 0      // ✅ OK for runtime variables
```

#### 2. Type Annotations

Always use explicit type annotations:

```typescript
// ✅ Good - Explicit types
function calculateDistance(distanceMeters: number, durationSeconds: number): number {
  return distanceMeters / durationSeconds
}

const workoutList: WorkoutData[] = []

// ❌ Bad - Implicit any
function foo(x) {
  return x * 2
}
```

#### 3. Error Handling

Use structured error handling with logging:

```typescript
import { logger } from './logger'

async function uploadWorkout(workout: WorkoutData): Promise<void> {
  try {
    // Validate input first
    if (!securityUtils.validateWorkoutData(workout)) {
      throw new Error('Invalid workout data')
    }
    
    await apiClient.uploadWorkout(workout)
    logger.info('API', 'Workout uploaded successfully', { id: workout.id })
  } catch (error) {
    // Log with context before re-throwing
    logger.error('API', 'Failed to upload workout', { 
      error: error.message,
      workoutId: workout.id 
    })
    throw new Error(`Upload failed: ${error.message}`)
  }
}
```

#### 4. Async/Await Pattern

Prefer async/await over Promise chains:

```typescript
// ✅ Good - Async/await
async function syncWorkouts(): Promise<void> {
  const workouts = await fetchPendingWorkouts()
  
  for (const workout of workouts) {
    try {
      await uploadToFittrackee(workout)
    } catch (error) {
      logger.warn('Sync', 'Failed to upload workout', { id: workout.id })
    }
  }
}

// ❌ Bad - Promise chains
function syncWorkouts() {
  return fetchPendingWorkouts()
    .then(workouts => {
      return workouts.map(workout => uploadToFittrackee(workout))
    })
}
```

#### 5. Comments and Documentation

Use JSDoc for public APIs:

```typescript
/**
 * Uploads a workout to Fittrackee API with rate limiting
 * 
 * @param workout - Workout data object with required fields
 * @returns Promise that resolves when upload completes
 * @throws Error if validation fails or API request errors
 */
async function uploadWorkout(workout: WorkoutData): Promise<void> {
  // Implementation
}
```

### Code Style Enforcement

Run these commands before committing:

```bash
# Check code style (ESLint)
npm run lint

# Fix auto-correctable issues
npm run lint -- --fix

# Type check TypeScript
npm run type-check

# Run all tests
npm test
```

---

## Testing Guidelines

### Writing Unit Tests

All new features must include unit tests:

#### 1. Test Structure

Follow the pattern in existing tests:

```typescript
// src/__tests__/usb-detector.test.ts
import { RobustUsbDetector } from '../main/usb-detector'

describe('RobustUsbDetector', () => {
  let detector: RobustUsbDetector
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks()
    detector = new RobustUsbDetector()
  })
  
  afterEach(() => {
    // Cleanup after each test
    detector.removeAllListeners()
  })
  
  it('should detect Garmin devices when mounted', () => {
    // Mock file system
    jest.spyOn(fs, 'readdirSync').mockImplementation((path) => {
      if (path.includes('/Volumes')) return ['GARMIN']
      throw new Error('Not found')
    })
    
    const devices = detector.detectDevices()
    expect(devices).toHaveLength(1)
    expect(devices[0].name).toBe('Garmin Fenix')
  })
  
  it('should emit connected event when device appears', () => {
    const mockDevice = { path: '/Volumes/GARMIN', name: 'Garmin' }
    
    detector.on('connected', (device) => {
      expect(device).toEqual(mockDevice)
    })
    
    // Trigger detection
    detector.startPolling()
  })
})
```

#### 2. Test Coverage Requirements

- **Minimum 70% coverage** for new code
- **100% coverage** for security utilities and API client
- All edge cases must be tested (null inputs, empty arrays, etc.)

#### 3. Mocking External Dependencies

Use Jest mocks for:
- File system operations (`fs`, `path`)
- USB device detection (`node-usb`)
- Network requests (Fittrackee API)
- Electron APIs (`app`, `ipcMain`, etc.)

```typescript
// Mock better-sqlite3 (CommonJS module)
jest.mock('better-sqlite3', () => {
  const mockDb = {
    prepare: jest.fn().mockReturnThis(),
    run: jest.fn(),
    all: jest.fn()
  }
  return jest.fn().mockImplementation(() => mockDb)
})

// Mock Electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/fake/path'),
    name: 'WorkoutPulse'
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn()
  }
}))
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- usb-detector.test.ts

# Run with coverage report
npm test -- --coverage

# Watch mode for TDD
npm test -- --watch
```

---

## Pull Request Process

### 1. Create a Branch

Use descriptive branch names:

```bash
# Feature branches
git checkout -b feature/add-apple-watch-support
git checkout -b feature/improve-usb-detection-speed

# Bug fix branches  
git checkout -b fix/resolve-token-expiry-issue
git checkout -b fix/correct-workout-duration-calculation

# Documentation branches
git checkout -b docs/update-api-documentation
```

### 2. Make Changes

Follow these steps:

1. **Write code** that implements the feature/fix
2. **Add tests** for new functionality
3. **Update documentation** if needed (README, API docs)
4. **Run linting and type checking**: `npm run lint && npm run type-check`
5. **Run all tests**: `npm test -- --coverage`

### 3. Commit Messages

Use conventional commits format:

```bash
# Feature
git commit -m "feat: Add Apple Watch USB detection support"

# Bug fix
git commit -m "fix: Resolve token expiry issue in OAuth flow"

# Documentation
git commit -m "docs: Update API documentation with new endpoints"

# Refactor
git commit -m "refactor: Extract rate limiter to separate module"

# Test
git commit -m "test: Add unit tests for workout parser"
```

**Commit Message Structure:**
```
<type>(<scope>): <subject>

<body> (optional)

<footer> (optional, e.g., Closes #123)
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring without behavior change
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### 4. Push and Create PR

```bash
# Sync with upstream
git fetch upstream
git rebase upstream/main

# Push your branch
git push origin feature/add-apple-watch-support

# Create PR on GitHub (follow the link shown after push)
```

### 5. PR Template

When creating a pull request, fill out this template:

```markdown
## Description
[Describe what changes this PR introduces]

## Related Issue
[Closes #123] or [Fixes #456]

## Changes Made
- [ ] Added Apple Watch USB detection
- [ ] Updated unit tests (coverage: 85%)
- [ ] Updated API documentation
- [ ] Fixed linting errors

## Testing Performed
- [x] Unit tests pass locally
- [x] Integration tests with Garmin Fenix 7
- [x] Manual testing on macOS Ventura
- [x] No breaking changes to existing features

## Screenshots (if applicable)
[Add screenshots of UI changes]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-reviewed my own code
- [ ] Commented my code, particularly in hard-to-understand areas
- [ ] Made corresponding changes to documentation
- [ ] Added tests for new functionality
- [ ] Ran `npm test` and all tests pass
```

---

## Documentation Requirements

### When Updating Code

You must update documentation when:

1. **Adding new public APIs** → Update `docs/API_DOCUMENTATION.md`
2. **Changing behavior** → Update relevant README sections
3. **Fixing bugs** → Add to `docs/CHANGELOG.md` (future)
4. **New features** → Document usage with examples

### Documentation Checklist

Before submitting PR:

- [ ] Code is commented where logic isn't obvious
- [ ] JSDoc comments added for all public functions/classes
- [ ] README updated if user-facing changes exist
- [ ] API documentation reflects new endpoints/methods
- [ ] Troubleshooting guide updated with common issues
- [ ] Examples provided for complex features

### Example Documentation Update

```markdown
## New Feature: Apple Watch Support

Added support for Apple Watch USB detection and workout file parsing.

### Usage

1. Connect Apple Watch via Lightning cable
2. App will automatically detect device at `/Volumes/Apple_Watch`
3. Workout files (.fit) are extracted and synced to Fittrackee

### Configuration

No additional configuration required. Apple Watch is detected by default PID:VID `05ac:1437`.

### Testing

Tested with:
- Apple Watch Series 8 (watchOS 9)
- Apple Watch Ultra (watchOS 9)
```

---

## Common Tasks

### Adding a New Smartwatch Brand

**Step 1:** Identify device PID/VID

```bash
# macOS - List USB devices
system_profiler SPUSBDataType | grep -A 5 "Product"

# Linux
lsusb | grep -i garmin
```

**Step 2:** Update `usb-detector.ts`

```typescript
// Add to BRAND_DETECTION_RULES array
{
  name: 'Apple Watch',
  pids: ['1437'], // Apple-specific PID
  vid: '05ac',   // Apple vendor ID
  mountPoint: '/Volumes/Apple_Watch'
}
```

**Step 3:** Add tests

```typescript
// src/__tests__/usb-detector.test.ts
it('should detect Apple Watch when connected', () => {
  const devices = detector.detectDevices()
  expect(devices.some(d => d.name === 'Apple Watch')).toBe(true)
})
```

**Step 4:** Update documentation

Add to `docs/API_DOCUMENTATION.md`:
```markdown
### Supported Devices

| Brand | Model | Format | Notes |
|-------|-------|--------|-------|
| Apple | All | FIT | Requires watchOS 9+ |
```

---

### Fixing a Security Vulnerability

**Step 1:** Identify the vulnerability

```bash
npm audit
# Output: "electron <=39.8.4 has ASAR Integrity Bypass"
```

**Step 2:** Check if fix is available

```bash
npm view electron versions --json
# Check if newer version fixes the issue
```

**Step 3:** Update dependencies (if safe)

```bash
# Non-breaking update
npm update electron

# Breaking change - requires manual review
npm install electron@latest --save-exact
```

**Step 4:** Test thoroughly

```bash
npm test -- --coverage
npm run build
```

**Step 5:** Document the fix

Add to `docs/CHANGELOG.md`:
```markdown
## [1.0.1] - 2024-04-15

### Security
- Updated electron to v39.8.5 (fixes ASAR integrity bypass)
- Added security audit to CI pipeline
```

---

### Debugging USB Detection Issues

**Step 1:** Enable verbose logging

```bash
export LOG_LEVEL=debug
npm run dev
```

**Step 2:** Check logs in real-time

```bash
tail -f ~/.workout-pulse/logs/$(date +%Y-%m-%d).log | grep -i usb
```

**Step 3:** Test detection manually

```javascript
// In app console (F12 > Console)
const detector = new RobustUsbDetector()
detector.on('connected', device => console.log('Detected:', device))
detector.detectDevices()
```

---

## Code Review Process

### What Reviewers Look For

1. **Functionality**: Does the code work as intended?
2. **Testing**: Are there adequate tests with good coverage?
3. **Security**: No vulnerabilities introduced (SQL injection, XSS, etc.)
4. **Performance**: No obvious performance regressions
5. **Code Quality**: Follows style guide and best practices
6. **Documentation**: Public APIs are documented

### Review Checklist

- [ ] Code compiles without errors (`npm run type-check`)
- [ ] All tests pass (`npm test -- --coverage`)
- [ ] No linting errors (`npm run lint`)
- [ ] Security utilities used for input validation
- [ ] Error handling with proper logging
- [ ] Comments explain complex logic
- [ ] No hardcoded secrets or credentials

---

## Getting Help

### Before Asking for Help

1. **Search existing issues**: https://github.com/zero-astro/workout-pulse/issues
2. **Read documentation**: `docs/API_DOCUMENTATION.md`, `docs/TROUBLESHOOTING_GUIDE.md`
3. **Check logs**: `~/.workout-pulse/logs/YYYY-MM-DD.log`

### Where to Ask

- **General questions**: GitHub Discussions (future)
- **Bug reports**: GitHub Issues with template filled out
- **Feature requests**: GitHub Issues with detailed description
- **Urgent issues**: Contact maintainer via email (if available)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License. See `LICENSE` file for details.

---

## Thank You!

Thank you for contributing to WorkoutPulse! Your efforts help make fitness tracking more accessible and automated for everyone. 🚀

For questions or feedback, feel free to open an issue or reach out via GitHub.
