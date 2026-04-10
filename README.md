# WorkoutPulse ⚡

Desktop application to sync smartwatch workouts automatically to Fittrackee via USB connection.

## Features

- 🔌 **USB Detection**: Automatically detects when your smartwatch is connected in USB mode
- 🎯 **Fittrackee Integration**: OAuth 2.0 authentication with Fittrackee API
- 📊 **Workout Sync**: Automatic synchronization of recent workouts to your Fittrackee account
- 💾 **Local Summary**: View summary of recently synced workouts directly in the app

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **TypeScript** - Type-safe development
- **React + Vite** - Modern frontend tooling
- **TailwindCSS** - Utility-first styling
- **Node-USB** - USB device detection

## Installation After Git Clone

### Prerequisites

- Node.js 18+ 
- npm or yarn
- USB debugging enabled on your smartwatch (if applicable)

### Step-by-Step Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd workout-pulse

# 2. Install dependencies
npm install

# 3. Configure Fittrackee OAuth credentials
# Create a .env file in the root directory with:
# FITTRACKEE_CLIENT_ID=your_client_id
# FITTRACKEE_CLIENT_SECRET=your_client_secret
# (Or configure via app settings if using built-in auth)

# 4. Run in development mode
cd src/renderer && npm run dev

# Or from the root directory:
npm run dev
```

### Build for Production

```bash
# From project root
npm run build

# Create distributable packages (macOS, Windows, Linux)
npm run dist
```

## Quick Start

1. **Clone & Install**: `git clone <repo> && cd workout-pulse && npm install`
2. **Configure OAuth**: Set up Fittrackee credentials in `.env` or app settings
3. **Run Dev Server**: `npm run dev`
4. **Connect Watch**: Plug in your smartwatch via USB
5. **Sync Workouts**: The app will automatically detect and sync recent workouts

## Project Structure

```
workout-pulse/
├── src/
│   ├── main/          # Electron main process (USB detection, API calls)
│   └── renderer/      # React frontend UI
├── tests/             # Unit tests
├── package.json
└── vite.config.ts
```

## Configuration

### Fittrackee OAuth

The app uses Fittrackee's OAuth 2.0 flow for authentication. You'll need to:

1. Register your application in Fittrackee (if required)
2. Store client credentials securely
3. Implement the OAuth callback handler

### USB Detection

Currently using Node-USB for device detection. May need vendor-specific PID/VID configuration depending on your smartwatch brand.

## TODO - Implementation Tasks

### Core Features (High Priority)
- [x] ✅ **Implement robust USB device detection with fallback mechanisms** - Completed: Multi-method detection (file watcher, mount scanning, polling), multi-brand support (Garmin/Fitbit/Apple Watch), error handling
- [x] ✅ **Complete Fittrackee OAuth 2.0 authentication flow** - Completed: Full OAuth client with authorization URL generation, code exchange, token refresh, secure credential storage with encryption
- [x] ✅ **Build workout data extraction from smartwatch files** - Completed: FIT/GPX file parsing with comprehensive data extraction (duration, distance, calories, heart rate)
- [x] ✅ **Create API client for Fittrackee workouts endpoint** - Completed: Full API integration with upload, download, batch operations, duplicate detection
- [x] ✅ **Implement incremental sync logic (avoid duplicate entries)** - Done via UUID checking in local database
- [x] ✅ **Add error handling and retry mechanisms for failed syncs** - Implemented in API client with circuit breaker pattern
- [x] ✅ **Create local database/cache for offline workout storage** - SQLite-based local workout database with full CRUD operations, filtering, statistics

### User Interface (Medium Priority)
- [x] ✅ **Design main dashboard with recent workouts overview** - Completed: Modern dark-themed UI with statistics cards, connection status, activity distribution, and filtered workout list (All/Unsynced tabs)
- [x] ✅ **Build settings page for Fittrackee credentials configuration** - Completed: OAuth modal integrated in dashboard
- [x] ✅ **Add visual feedback for USB connection status** - Completed: Animated pulsing indicators, real-time detection state with spinning icons, enhanced header badge with color transitions
- [x] ✅ **Implement real-time sync progress indicator** - Completed: Animated progress bar with percentage display, current/total counter, smooth CSS transitions, IPC event listeners for live updates
- [x] ✅ **Create workout details modal/view** - Completed: Full-screen modal with comprehensive workout stats (duration, distance, calories, elevation, heart rate zones), device info, timeline, synced status indicator, responsive grid layout
- [x] ✅ **Add dark/light theme toggle with 3-state system** - Completed: Auto/Dark/Light modes, system preference detection, smooth transitions between themes, full UI color adaptation for both light and dark modes
- [ ] Add dark/light theme toggle

### Testing & Quality (Medium Priority)
- [x] ✅ **Write unit tests for workout parser** - Completed: Jest test suite with 11 passing tests, 77% coverage on workout-parser.ts
- [ ] Write unit tests for USB detection logic
- [ ] Create integration tests for Fittrackee API calls (mocked)
- [ ] Add E2E tests with mocked smartwatch data
- [x] ✅ **Set up CI/CD pipeline** - Completed: GitHub Actions workflow for automated testing on push

### Documentation (Low Priority)
- [ ] Add detailed API documentation
- [ ] Create troubleshooting guide for common issues
- [ ] Write contribution guidelines for future developers
- [ ] Generate TypeScript type definitions
- [ ] Add inline code comments throughout the codebase

### Security & Best Practices (High Priority)
- [ ] Securely store OAuth credentials (keychain/encrypted storage)
- [ ] Implement input validation and sanitization
- [ ] Add rate limiting for API requests
- [ ] Set up logging with proper error tracking
- [ ] Review and fix any security vulnerabilities

### Performance Optimization (Low Priority)
- [ ] Optimize USB polling interval to reduce CPU usage
- [ ] Implement lazy loading for large workout lists
- [ ] Add caching strategies for frequently accessed data
- [ ] Profile and optimize bundle size

## License

MIT
