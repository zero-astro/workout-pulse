# WorkoutPulse API Documentation

## Overview

This document provides detailed API reference for the WorkoutPulse application, including Fittrackee API integration, USB detection methods, and internal module interfaces.

---

## Table of Contents

- [Fittrackee API Integration](#fittrackee-api-integration)
- [USB Detection API](#usb-detection-api)
- [Workout Parser API](#workout-parser-api)
- [Local Database API](#local-database-api)
- [OAuth Client API](#oauth-client-api)
- [Security Utilities API](#security-utilities-api)

---

## Fittrackee API Integration

### Base URL
```typescript
const BASE_URL = 'https://api.fittrackee.org'
```

### Activity Types Mapping

| Local Type | Fittrackee ID | Description |
|------------|---------------|-------------|
| Run        | 1             | Running     |
| Ride       | 2             | Cycling     |
| Walk       | 3             | Walking     |
| Hike       | 4             | Hiking      |
| Swim       | 5             | Swimming    |
| Unknown    | 99            | Other       |

### Workout Data Interface

```typescript
export interface FittrackeeWorkout {
  uuid: string                    // Unique workout identifier (UUID v4)
  activity_type_id: number        // Activity type ID (1-5, 99 for unknown)
  device_uuid?: string            // Device UUID (optional)
  is_outdoors?: boolean           // Whether workout was outdoors
  name?: string                   // Workout name/description
  description?: string            // Detailed description
  distance: number                // Distance in meters
  moving_time: number             // Moving time in seconds
  elapsed_time: number            // Total elapsed time in seconds
  elevation_gain: number          // Elevation gain in meters
  total_photo_count: number       // Number of photos attached
  start_datetime: string          // ISO 8601 datetime (e.g., "2024-04-10T09:30:00Z")
  end_datetime: string            // ISO 8601 datetime
  average_heart_rate?: number     // Average heart rate in bpm
  maximum_heart_rate?: number     // Maximum heart rate in bpm
  calories: number                // Calories burned
  workout_id?: number             // Workout ID returned by Fittrackee API
}
```

### API Client Methods

#### `uploadWorkout(workout: WorkoutData): Promise<FittrackeeWorkout>`

Uploads a single workout to Fittrackee.

**Parameters:**
- `workout` (WorkoutData): Local workout data object

**Returns:**
- `Promise<FittrackeeWorkout>`: Uploaded workout with Fittrackee ID

**Example:**
```typescript
const uploaded = await fittrackeeApi.uploadWorkout({
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  type: 'Run',
  startTime: new Date('2024-04-10T09:30:00Z'),
  endTime: new Date('2024-04-10T10:15:00Z'),
  duration: 2700, // seconds
  distance: 10500, // meters (10.5 km)
  elevationGain: 150, // meters
  calories: 650,
  avgHeartRate: 145,
  maxHeartRate: 172,
  deviceName: 'Garmin Fenix 7',
  filePath: '/Volumes/GARMIN/Activities/12345.fit'
})

console.log('Workout uploaded:', uploaded.workout_id)
```

#### `uploadWorkoutsBatch(workouts: WorkoutData[], options?: BatchOptions): Promise<UploadResult>`

Uploads multiple workouts with rate limiting and duplicate detection.

**Parameters:**
- `workouts`: Array of workout data objects
- `options` (optional):
  - `skipDuplicates?: boolean` (default: true)
  - `batchSize?: number` (default: 5)
  - `delayMs?: number` (default: 1000)

**Returns:**
```typescript
interface UploadResult {
  success: number      // Number of successful uploads
  failed: number       // Number of failed uploads
  errors: string[]     // Error messages for failed uploads
}
```

**Example:**
```typescript
const result = await fittrackeeApi.uploadWorkoutsBatch(workouts, {
  skipDuplicates: true,
  batchSize: 3,
  delayMs: 2000
})

console.log(`Uploaded ${result.success}/${workouts.length} workouts`)
if (result.failed > 0) {
  console.error('Failed uploads:', result.errors)
}
```

#### `getRecentWorkouts(limit?: number): Promise<FittrackeeWorkout[]>`

Fetches recent workouts from Fittrackee.

**Parameters:**
- `limit`: Maximum number of workouts to fetch (default: 100)

**Returns:**
- `Promise<FittrackeeWorkout[]>`: Array of workout objects

#### `deleteWorkout(uuid: string): Promise<void>`

Deletes a workout by UUID.

**Parameters:**
- `uuid`: Workout UUID to delete

**Example:**
```typescript
await fittrackeeApi.deleteWorkout('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
console.log('Workout deleted successfully')
```

---

## USB Detection API

### Device Information Interface

```typescript
interface UsbDevice {
  path: string           // Mount point (e.g., '/Volumes/GARMIN')
  name: string           // Device name (e.g., 'Garmin Fenix', 'Fitbit Charge')
  deviceType: 'garmin' | 'fitbit' | 'apple_watch' | 'unknown'
  workoutFiles: string[] // Array of detected workout file paths
}
```

### RobustUsbDetector Methods

#### `detectDevices(): UsbDevice[]`

Detects all connected USB devices with workout files.

**Returns:**
- `UsbDevice[]`: Array of detected devices

**Example:**
```typescript
const detector = new RobustUsbDetector()
const devices = detector.detectDevices()

devices.forEach(device => {
  console.log(`Found ${device.name} at ${device.path}`)
  console.log('Workout files:', device.workoutFiles.length)
})
```

#### `findWorkoutFiles(directory: string): string[]`

Finds workout files (FIT, GPX, TCX) in a directory recursively.

**Parameters:**
- `directory`: Directory path to scan

**Returns:**
- `string[]`: Array of workout file paths

**Supported Formats:**
- `.fit` - Garmin FIT format
- `.gpx` - GPS Exchange Format
- `.tcx` - Training Center XML format

#### Event Emitters

```typescript
detector.on('connected', (device: UsbDevice) => {
  console.log('USB device connected:', device.name)
})

detector.on('disconnected', (device: UsbDevice) => {
  console.log('USB device disconnected:', device.name)
})

detector.on('workout-detected', (filePath: string) => {
  console.log('New workout file found:', filePath)
})

detector.on('error', (error: Error) => {
  console.error('USB detection error:', error.message)
})
```

---

## Workout Parser API

### WorkoutData Interface

```typescript
export interface WorkoutData {
  id: string              // Unique workout ID (UUID)
  type: string            // Activity type (Run, Ride, Walk, etc.)
  filePath: string        // Path to source file
  deviceName?: string     // Device name from file metadata
  
  // Timing
  startTime: Date         // Workout start time
  endTime: Date           // Workout end time
  duration: number        // Total duration in seconds
  
  // Metrics
  distance?: number       // Distance in meters
  elevationGain?: number  // Elevation gain in meters
  calories?: number       // Calories burned
  
  // Heart Rate
  avgHeartRate?: number   // Average heart rate (bpm)
  maxHeartRate?: number   // Maximum heart rate (bpm)
}
```

### Parser Methods

#### `parseFITFile(filePath: string): Promise<WorkoutData>`

Parses a Garmin FIT file.

**Returns:**
- `Promise<WorkoutData>`: Parsed workout data

**Example:**
```typescript
const workout = await parseFITFile('/Volumes/GARMIN/Activities/12345.fit')
console.log('Distance:', (workout.distance / 1000).toFixed(2) + ' km')
console.log('Duration:', formatDuration(workout.duration))
```

#### `parseGPXFile(filePath: string): Promise<WorkoutData>`

Parses a GPX file.

**Returns:**
- `Promise<WorkoutData>`: Parsed workout data

#### `parseTCXFile(filePath: string): Promise<WorkoutData>`

Parses a TCX file.

**Returns:**
- `Promise<WorkoutData>`: Parsed workout data

---

## Local Database API

### LocalWorkoutDB Methods

#### `saveWorkout(workout: LocalWorkout): Promise<void>`

Saves a workout to the local SQLite database.

```typescript
const db = new LocalWorkoutDB()
await db.saveWorkout({
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  type: 'Run',
  startTime: Date.now(),
  endTime: Date.now() + 2700000,
  duration: 2700,
  distance: 10500,
  calories: 650
})
```

#### `getWorkouts(filter?: WorkoutFilter): Promise<LocalWorkout[]>`

Retrieves workouts from the database.

**Parameters:**
- `filter` (optional):
  - `synced?: boolean`
  - `type?: string`
  - `fromDate?: Date`
  - `toDate?: Date`

#### `getStatistics(): Promise<DashboardStats>`

Returns workout statistics.

```typescript
interface DashboardStats {
  total: number
  synced: number
  unsynced: number
  byType: Record<string, number>
}

const stats = await db.getStatistics()
console.log(`Total workouts: ${stats.total}`)
console.log(`Unsynced: ${stats.unsynced}`)
```

---

## OAuth Client API

### FittrackeeOAuthClient Methods

#### `setCredentials(clientId: string, clientSecret: string): Promise<void>`

Sets and securely stores OAuth credentials.

**Example:**
```typescript
await fittrackeeOAuth.setCredentials(
  'your_client_id',
  'your_client_secret'
)
console.log('Credentials stored securely')
```

#### `loadStoredCredentials(): Promise<OAuthCredentials | null>`

Loads stored OAuth credentials from secure storage.

**Returns:**
- `Promise<OAuthCredentials | null>`: Client credentials or null

#### `getAuthorizationUrl(): string`

Generates the authorization URL for Fittrackee OAuth flow.

```typescript
const authUrl = fittrackeeOAuth.getAuthorizationUrl()
console.log('Open this URL in browser:', authUrl)
```

#### `handleCallback(code: string): Promise<void>`

Exchanges authorization code for access token.

**Parameters:**
- `code`: Authorization code from callback

---

## Security Utilities API

### SecurityUtils Methods

#### `validateEmail(email: string): ValidationResult`

Validates email format.

```typescript
const result = securityUtils.validateEmail('user@example.com')
if (!result.valid) {
  console.error('Invalid email:', result.errors)
}
```

#### `validateWorkoutData(workout: any): ValidationResult`

Validates workout data before API submission.

```typescript
const validation = securityUtils.validateWorkoutData({
  uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  start_datetime: '2024-04-10T09:30:00Z',
  end_datetime: '2024-04-10T10:15:00Z',
  distance: 10500,
  moving_time: 2700,
  calories: 650
})

if (!validation.valid) {
  throw new Error(`Invalid workout data: ${validation.errors.join(', ')}`)
}
```

#### `hasSqlInjection(input: string): boolean`

Checks for SQL injection patterns.

```typescript
if (securityUtils.hasSqlInjection(userInput)) {
  throw new Error('Potential SQL injection detected')
}
```

#### `hasXssPattern(input: string): boolean`

Checks for XSS attack patterns.

```typescript
if (securityUtils.hasXssPattern(userInput)) {
  throw new Error('Potential XSS attack detected')
}
```

---

## Rate Limiting

### Token Bucket Algorithm

**Configuration:**
- Maximum requests: 100 per minute
- Window size: 60 seconds

**Usage:**
```typescript
const rateLimiter = securityUtils.createRateLimiter(100, 60000)

if (rateLimiter.isAllowed('api-request')) {
  // Make API request
} else {
  throw new Error('Rate limit exceeded')
}
```

---

## Logging API

### Logger Methods

#### `logger.info(module: string, message: string, data?: any)`

Logs an informational message.

**Example:**
```typescript
logger.info('FittrackeeAPI', 'Workout uploaded successfully', {
  workoutId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  duration: 2700
})
```

#### `logger.error(module: string, message: string, data?: any)`

Logs an error with context.

**Example:**
```typescript
try {
  await fittrackeeApi.uploadWorkout(workout)
} catch (error) {
  logger.error('FittrackeeAPI', 'Failed to upload workout', {
    workoutId: workout.id,
    error: error.message
  })
}
```

#### `logger.getRecentLogs(lines?: number): string[]`

Retrieves recent log entries.

**Example:**
```typescript
const recentLogs = logger.getRecentLogs(50)
console.log('Recent logs:', recentLogs.join('\n'))
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Rate limit exceeded` | Too many API requests | Wait and retry after delay |
| `Invalid workout data` | Validation failed | Check workout fields |
| `Token expired` | Access token expired | Refresh token automatically |
| `USB device not found` | Device disconnected | Reconnect device |

### Retry Logic

All API operations use exponential backoff with circuit breaker pattern:
- Maximum attempts: 3
- Initial delay: 1000ms
- Max delay: 10000ms

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-04-10 | Initial release with core features |

---

## Support

For API issues or questions:
- GitHub Issues: https://github.com/zero-astro/workout-pulse/issues
- Email: support@workoutpulse.app (future)
