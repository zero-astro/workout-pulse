# WorkoutPulse Troubleshooting Guide

## Common Issues and Solutions

This guide helps you resolve common issues when using WorkoutPulse.

---

## Table of Contents

- [USB Detection Issues](#usb-detection-issues)
- [Fittrackee API Errors](#fittrackee-api-errors)
- [Workout Sync Problems](#workout-sync-problems)
- [Authentication Issues](#authentication-issues)
- [Performance & Resource Usage](#performance--resource-usage)
- [Log Files & Debugging](#log-files--debugging)

---

## USB Detection Issues

### Issue: "No devices detected" or "USB device not found"

**Symptoms:**
- App doesn't detect connected smartwatch
- No workout files appear in the list
- USB indicator shows disconnected even when watch is plugged in

**Solutions:**

#### 1. Check Physical Connection
```bash
# macOS - List all USB devices
system_profiler SPUSBDataType

# Linux - List USB devices
lsusb

# Windows - Device Manager > Universal Serial Bus controllers
```

#### 2. Verify Mount Point
- **macOS**: Watch should appear in `/Volumes/` directory
- **Linux**: Check `/media/username/` or `/run/media/username/`
- **Windows**: Check `E:\`, `F:\`, etc. in File Explorer

#### 3. Manual Scan Test
```bash
# macOS/Linux - Find workout files manually
find /Volumes/GARMIN -name "*.fit" -o -name "*.gpx" -o -name "*.tcx"

# Windows (PowerShell)
Get-ChildItem "E:\Garmin\Activities" -Recurse -Filter *.fit
```

#### 4. Permissions Issues
**macOS:**
```bash
# Grant Full Disk Access to WorkoutPulse in System Preferences > Privacy & Security > Full Disk Access
# Or run app from terminal to see permission errors:
open /Applications/WorkoutPulse.app --args --enable-logging
```

**Linux:**
```bash
# Add user to plugdev group (Debian/Ubuntu)
sudo usermod -aG plugdev $USER

# Or create udev rule for Garmin devices
sudo nano /etc/udev/rules.d/50-garmin.rules
```
Add this line:
```
ACTION=="add|change", SUBSYSTEM=="usb", ATTR{idVendor}=="0fcu", MODE="0666"
```

#### 5. Force Rescan
- Disconnect and reconnect the watch
- Restart WorkoutPulse application
- Check logs for detailed error messages

---

## Fittrackee API Errors

### Issue: "Authentication failed" or "Invalid credentials"

**Symptoms:**
- OAuth flow fails during authorization
- Access token expires unexpectedly
- 401 Unauthorized errors in console

**Solutions:**

#### 1. Re-authorize Account
```typescript
// In app settings, click "Reconnect Fittrackee"
// This will:
// 1. Clear stored credentials
// 2. Generate new authorization URL
// 3. Complete OAuth flow again
```

#### 2. Check Client Credentials
Verify your Fittrackee OAuth credentials are correct:
- **Client ID**: Should be a long alphanumeric string (e.g., `abc123def456...`)
- **Client Secret**: Should be at least 16 characters
- Both should be stored in encrypted format

#### 3. Token Refresh Issues
If tokens expire frequently, check:
```bash
# Check token expiry timestamp
cat ~/.workout-pulse/credentials.json.enc | base64 -d 2>/dev/null | python3 -m json.tool
```

**Solution:** Tokens should auto-refresh. If not, clear credentials and re-authorize.

---

### Issue: "Rate limit exceeded"

**Symptoms:**
- Error message: "Rate limit exceeded. Please slow down API requests."
- Uploads fail after multiple successful attempts

**Cause:**
- Too many workout uploads in short time (exceeds 100 requests/minute)

**Solutions:**

#### 1. Wait and Retry
```bash
# The app automatically implements rate limiting with:
# - Token bucket algorithm
# - 100 requests per minute window
# - Exponential backoff on failures

# If you see this error, wait ~60 seconds before retrying
```

#### 2. Reduce Batch Size
Edit `src/main/fittrackee-api-client.ts`:
```typescript
// Change from:
const batchSize = 5

// To smaller value:
const batchSize = 3
```

---

### Issue: "Duplicate workout detected"

**Symptoms:**
- Workout not uploaded, marked as duplicate
- Same workout appears multiple times in Fittrackee

**Solutions:**

#### 1. Check UUID Consistency
Each workout file should have a unique UUID:
```typescript
// Workout ID is extracted from FIT/GPX file metadata
// If UUIDs are identical, only first upload succeeds
```

#### 2. Delete Duplicates in Fittrackee
- Go to https://fittrackee.org/workouts
- Find duplicate workouts (same date/time)
- Delete unwanted duplicates manually
- Resync the workout from app

---

## Workout Sync Problems

### Issue: "Workout files not found" or "Invalid file format"

**Symptoms:**
- App detects USB device but shows 0 workout files
- Error: "Failed to parse FIT file"
- Workout data missing (distance, duration, etc.)

**Solutions:**

#### 1. Verify File Format
Supported formats:
- `.fit` - Garmin FIT format (most common)
- `.gpx` - GPS Exchange Format
- `.tcx` - Training Center XML format

Check file extension:
```bash
# macOS/Linux
file /Volumes/GARMIN/Activities/12345.fit
# Should output: "data" or "GPS Exchange Format"

# Windows (PowerShell)
Get-Content "E:\Garmin\Activities\12345.fit" -Head 10 | Out-String
```

#### 2. Check File Integrity
Corrupted files won't parse:
```bash
# Test FIT file with Garmin Express or SportTracks
# If file doesn't open in other apps, it's corrupted
```

**Solution:** Re-transfer workout from watch to computer.

#### 3. Verify Workout Data Fields
Minimum required fields for upload:
- `startTime` - ISO 8601 datetime
- `endTime` - ISO 8601 datetime  
- `distance` - Meters (can be 0)
- `movingTime` - Seconds
- `calories` - Calories burned

---

### Issue: "Upload failed" or "Network error"

**Symptoms:**
- Workout sync fails with network timeout
- Error: "Failed to connect to api.fittrackee.org"

**Solutions:**

#### 1. Check Network Connectivity
```bash
# Test Fittrackee API endpoint
curl -I https://api.fittrackee.org

# Should return HTTP 200 OK
```

#### 2. Firewall/Proxy Configuration
If behind corporate firewall:
- Allow outbound HTTPS (port 443) to `api.fittrackee.org`
- Configure proxy in app settings if required

#### 3. DNS Issues
Try changing DNS server:
```bash
# macOS - Edit /etc/resolv.conf
nameserver 8.8.8.8  # Google DNS
nameserver 1.1.1.1  # Cloudflare DNS

# Windows (PowerShell)
netsh interface ip set dns "Ethernet" static 8.8.8.8
```

---

## Authentication Issues

### Issue: "OAuth callback failed" or "Authorization code expired"

**Symptoms:**
- Browser redirects to `http://localhost:3456/callback` but shows error
- Error message: "Invalid state parameter" or "Code expired"

**Solutions:**

#### 1. Complete OAuth Flow Completely
```typescript
// 1. Click "Connect Fittrackee" in app settings
// 2. Browser opens authorization page
// 3. Authorize the application
// 4. Redirect to http://localhost:3456/callback?code=XXXXX
// 5. App captures code and exchanges for token

// If step 4 fails, try again from step 1
```

#### 2. Check Local Server Port
Port `3456` must be available:
```bash
# macOS/Linux - Check if port is in use
lsof -i :3456

# Windows (PowerShell)
netstat -ano | findstr :3456
```

**Solution:** If another app uses port 3456, change it in `oauth-client.ts`:
```typescript
private redirectUri: string = 'http://localhost:3457/callback' // Change to different port
```

#### 3. Clear Browser Cache
Sometimes browser caches old OAuth state:
- Open incognito/private window for authorization
- Or clear cookies for `localhost` and try again

---

## Performance & Resource Usage

### Issue: "High CPU usage" or "App is slow"

**Symptoms:**
- WorkoutPulse uses >50% CPU when idle
- App freezes during USB scan
- Slow workout sync (>1 minute per workout)

**Solutions:**

#### 1. Reduce USB Polling Interval
Edit `src/main/usb-detector.ts`:
```typescript
// Change from:
private pollingInterval = 1000 // ms (1 second)

// To longer interval:
private pollingInterval = 5000 // ms (5 seconds)
```

#### 2. Limit Workout File Scans
Reduce recursive scan depth:
```typescript
// In usb-detector.ts, limit directory traversal
const maxDepth = 3 // Only scan 3 levels deep
```

#### 3. Disable Unnecessary Logging
Set logging level to `warn` or `error`:
```bash
# Create .env file in project root
LOG_LEVEL=warn
```

---

### Issue: "Large bundle size" or "Slow startup"

**Solutions:**

#### 1. Enable Code Splitting
Edit `vite.config.ts`:
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['electron', 'node-usb'],
          'react': ['react', 'react-dom']
        }
      }
    }
  }
})
```

#### 2. Lazy Load Components
```typescript
// In Dashboard.tsx, use React.lazy for heavy components
const SettingsModal = lazy(() => import('./SettingsModal'))
const WorkoutDetailsModal = lazy(() => import('./WorkoutDetailsModal'))
```

---

## Log Files & Debugging

### Accessing Logs

**Location:** `~/.workout-pulse/logs/YYYY-MM-DD.log`

**View Recent Logs (macOS/Linux):**
```bash
# Last 50 lines of today's log
tail -n 50 ~/.workout-pulse/logs/$(date +%Y-%m-%d).log

# Follow logs in real-time
tail -f ~/.workout-pulse/logs/$(date +%Y-%m-%d).log
```

**View Recent Logs (Windows):**
```powershell
# Get today's log file
Get-Content "$HOME\.workout-pulse\logs\$(Get-Date -Format 'yyyy-MM-dd').log" -Tail 50
```

### Debug Mode

Enable verbose logging:
```bash
# macOS/Linux
export LOG_LEVEL=debug
npm run dev

# Windows (PowerShell)
$env:LOG_LEVEL="debug"
npm run dev
```

### Export Logs for Support

**Export as JSON:**
```typescript
// In app console or terminal
const logs = logger.getRecentLogs(100)
console.log(JSON.stringify(logs, null, 2))
```

**Export to file:**
```bash
# Create export script (export-logs.js)
const fs = require('fs')
const path = require('path')
const { logger } = require('./dist/main/logger.js')

const logs = logger.exportLogs('json')
fs.writeFileSync('workout-pulse-logs.json', logs)
console.log('Logs exported to workout-pulse-logs.json')
```

---

## Advanced Debugging

### USB Detection Debug Script

Create `debug-usb.js`:
```javascript
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function detectUSBDevices() {
  console.log('=== USB Device Detection ===\n')
  
  // macOS
  if (process.platform === 'darwin') {
    try {
      const volumes = fs.readdirSync('/Volumes')
      console.log('Detected volumes in /Volumes:')
      volumes.forEach(vol => {
        const volPath = path.join('/Volumes', vol)
        const fitFiles = getWorkoutFiles(volPath)
        if (fitFiles.length > 0) {
          console.log(`  ${vol}: ${fitFiles.length} workout files`)
        }
      })
    } catch (error) {
      console.error('Error:', error.message)
    }
  }
  
  // Linux
  else if (process.platform === 'linux') {
    try {
      const mounts = execSync('mount | grep -E "vfat|exFAT"').toString()
      console.log('Detected FAT/exFAT mounts:')
      console.log(mounts)
    } catch (error) {
      console.error('Error:', error.message)
    }
  }
}

function getWorkoutFiles(dir, depth = 0) {
  if (depth > 3) return [] // Limit recursion
  
  const files = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory()) {
        files.push(...getWorkoutFiles(fullPath, depth + 1))
      } else if (/\.fit$|\.gpx$|\.tcx$/.test(entry.name)) {
        files.push(fullPath)
      }
    }
  } catch (error) {
    // Skip inaccessible directories
  }
  
  return files
}

detectUSBDevices()
```

Run: `node debug-usb.js`

---

## Getting Help

### Before Submitting Issue Report

1. **Check logs**: `~/.workout-pulse/logs/YYYY-MM-DD.log`
2. **Verify dependencies**: Run `npm audit` to check for vulnerabilities
3. **Test with different devices**: Try multiple smartwatches if available
4. **Reproduce consistently**: Note exact steps that cause the issue

### Submitting Bug Reports

**GitHub Issues Template:**
```markdown
## Issue Description
[Clear description of what's happening]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior  
[What actually happens]

## Environment
- OS: [macOS/Windows/Linux version]
- Node.js: [version from `node -v`]
- WorkoutPulse: [version from package.json]
- Smartwatch: [brand and model]

## Logs
[Paste relevant log entries or attach log file]

## Screenshots (if applicable)
[Attach screenshots of error messages or UI issues]
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-04-10 | Initial troubleshooting guide |

---

## Additional Resources

- **API Documentation**: `docs/API_DOCUMENTATION.md`
- **Contributing Guide**: `docs/CONTRIBUTING.md` (future)
- **GitHub Issues**: https://github.com/zero-astro/workout-pulse/issues
- **Fittrackee API Docs**: https://fittrackee.org/api-docs
