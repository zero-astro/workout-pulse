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

## License

MIT
