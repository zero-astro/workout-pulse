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

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Create distributable packages
npm run dist
```

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
