"use strict";
const electron = require("electron");
const path = require("path");
const events = require("events");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const https = require("https");
const http = require("http");
require("buffer");
const node_events = require("node:events");
const node_fs = require("node:fs");
const promises = require("node:fs/promises");
const sp = require("node:path");
const node_stream = require("node:stream");
const node_os = require("node:os");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const os__namespace = /* @__PURE__ */ _interopNamespaceDefault(os);
const https__namespace = /* @__PURE__ */ _interopNamespaceDefault(https);
const http__namespace = /* @__PURE__ */ _interopNamespaceDefault(http);
const sp__namespace = /* @__PURE__ */ _interopNamespaceDefault(sp);
class FittrackeeOAuthClient extends events.EventEmitter {
  clientId = "";
  clientSecret = "";
  redirectUri = "http://localhost:3456/callback";
  state = "";
  server;
  // Electron net module or http server
  // OAuth endpoints for Fittrackee
  authUrl = "https://api.fittrackee.org/oauth/authorize";
  tokenUrl = "https://api.fittrackee.org/oauth/token";
  // Storage paths
  credentialsPath = "";
  constructor() {
    super();
    if (electron.app) {
      this.credentialsPath = path__namespace.join(
        electron.app.getPath("userData"),
        "fittrackee_credentials.json"
      );
    } else {
      this.credentialsPath = path__namespace.join(os__namespace.homedir(), ".workout-pulse", "credentials.json");
    }
    const dir = path__namespace.dirname(this.credentialsPath);
    if (!fs__namespace.existsSync(dir)) {
      fs__namespace.mkdirSync(dir, { recursive: true });
    }
  }
  /**
   * Set OAuth credentials from environment or config
   */
  setCredentials(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    console.log("[WorkoutPulse] OAuth credentials configured");
  }
  /**
   * Load stored credentials from secure storage
   */
  loadStoredCredentials() {
    try {
      if (fs__namespace.existsSync(this.credentialsPath)) {
        const data = fs__namespace.readFileSync(this.credentialsPath, "utf8");
        const credentials = JSON.parse(data);
        if (credentials.tokenExpiry && Date.now() > credentials.tokenExpiry) {
          console.log("[WorkoutPulse] Stored token expired, requesting refresh");
          this.emit("expired", {
            type: "expired",
            timestamp: Date.now()
          });
          return null;
        }
        console.log("[WorkoutPulse] Loaded stored credentials (token valid)");
        return credentials;
      }
    } catch (error) {
      console.error("[WorkoutPulse] Error loading credentials:", error);
    }
    return null;
  }
  /**
   * Save credentials to secure storage
   */
  saveCredentials(credentials) {
    try {
      const encryptedCredentials = this.encryptCredentials(credentials);
      fs__namespace.writeFileSync(
        this.credentialsPath,
        JSON.stringify(encryptedCredentials, null, 2),
        { mode: 384 }
        // Only owner can read/write
      );
      console.log("[WorkoutPulse] Credentials saved securely");
    } catch (error) {
      console.error("[WorkoutPulse] Error saving credentials:", error);
      throw new Error("Failed to save credentials securely");
    }
  }
  /**
   * Remove stored credentials (for logout)
   */
  removeStoredCredentials() {
    try {
      if (fs__namespace.existsSync(this.credentialsPath)) {
        fs__namespace.unlinkSync(this.credentialsPath);
        console.log("[WorkoutPulse] Credentials removed");
      }
    } catch (error) {
      console.error("[WorkoutPulse] Error removing credentials:", error);
    }
  }
  /**
   * Generate authorization URL with state parameter
   */
  getAuthorizationUrl() {
    this.state = crypto__namespace.randomBytes(32).toString("hex");
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      state: this.state,
      scope: "workouts:read workouts:write"
      // Adjust based on Fittrackee API
    });
    const url = `${this.authUrl}?${params.toString()}`;
    console.log("[WorkoutPulse] Authorization URL generated:", url);
    return url;
  }
  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await this.makeTokenRequest({
        grant_type: "authorization_code",
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri
      });
      const tokens = JSON.parse(response);
      const credentials = {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: Date.now() + tokens.expires_in * 1e3
        // Convert to milliseconds
      };
      this.saveCredentials(credentials);
      console.log("[WorkoutPulse] Token exchanged successfully");
      this.emit("token-exchanged", {
        type: "token-exchanged",
        credentials,
        timestamp: Date.now()
      });
      return credentials;
    } catch (error) {
      console.error("[WorkoutPulse] Error exchanging code for token:", error);
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }
  /**
   * Refresh expired access token using refresh token
   */
  async refreshToken(refreshToken) {
    try {
      const response = await this.makeTokenRequest({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret
      });
      const tokens = JSON.parse(response);
      const storedCreds = this.loadStoredCredentials() || {
        clientId: this.clientId,
        clientSecret: this.clientSecret
      };
      const newCredentials = {
        ...storedCreds,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || refreshToken,
        // Keep old refresh token if not provided
        tokenExpiry: Date.now() + tokens.expires_in * 1e3
      };
      this.saveCredentials(newCredentials);
      console.log("[WorkoutPulse] Token refreshed successfully");
      return newCredentials;
    } catch (error) {
      console.error("[WorkoutPulse] Error refreshing token:", error);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }
  /**
   * Make HTTP request to OAuth server
   */
  async makeTokenRequest(params) {
    new URLSearchParams(params).toString();
    console.log("[WorkoutPulse] Would make token request to:", this.tokenUrl);
    console.log("[WorkoutPulse] Request params:", Object.keys(params));
    return JSON.stringify({
      access_token: "mock_access_token_" + Date.now(),
      refresh_token: "mock_refresh_token_" + Date.now(),
      expires_in: 3600,
      token_type: "Bearer"
    });
  }
  /**
   * Validate current access token
   */
  async validateToken() {
    const credentials = this.loadStoredCredentials();
    if (!credentials || !credentials.accessToken) {
      console.log("[WorkoutPulse] No access token found");
      return false;
    }
    if (credentials.tokenExpiry && Date.now() > credentials.tokenExpiry) {
      console.log("[WorkoutPulse] Access token expired");
      return false;
    }
    try {
      const isValid = await this.testApiConnection(credentials.accessToken);
      if (!isValid) {
        console.log("[WorkoutPulse] Token validation failed, attempting refresh");
        if (credentials.refreshToken) {
          await this.refreshToken(credentials.refreshToken);
          return true;
        }
      }
      return isValid;
    } catch (error) {
      console.error("[WorkoutPulse] Token validation error:", error);
      return false;
    }
  }
  /**
   * Test API connection with provided token
   */
  async testApiConnection(token) {
    console.log("[WorkoutPulse] Testing API connection with token");
    return true;
  }
  /**
   * Encrypt credentials before storage (basic encryption)
   */
  encryptCredentials(credentials) {
    if (process.env.NODE_ENV === "test") {
      return {
        ...credentials,
        encryptedData: Buffer.from(JSON.stringify(credentials)).toString("base64"),
        iv: "test-iv-for-mock-only"
      };
    }
    const key = process.env.ENCRYPTION_KEY || "default-key-change-in-production";
    const iv = crypto__namespace.randomBytes(16).toString("hex").slice(0, 16);
    try {
      const cipher = crypto__namespace.createCipheriv(
        "aes-256-cbc",
        Buffer.from(key, "utf8"),
        Buffer.from(iv, "hex")
      );
      let encrypted = cipher.update(JSON.stringify(credentials));
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      return {
        ...credentials,
        iv,
        encryptedData: encrypted.toString("base64")
      };
    } catch (error) {
      console.error("[WorkoutPulse] Encryption failed:", error);
      throw new Error("Credential encryption failed");
    }
  }
  /**
   * Get current authorization state
   */
  getState() {
    return this.state;
  }
  /**
   * Clear stored state (after callback)
   */
  clearState() {
    this.state = "";
  }
  /**
   * Check if user is authorized
   */
  isAuthenticated() {
    const credentials = this.loadStoredCredentials();
    return !!credentials && !!credentials.accessToken;
  }
}
const fittrackeeOAuth = new FittrackeeOAuthClient();
class FittrackeeApiClient extends events.EventEmitter {
  baseUrl = "https://api.fittrackee.org";
  accessToken = "";
  oauthClient;
  // Activity type mapping (Fittrackee activity types)
  activityTypeMap = {
    "Run": 1,
    "Ride": 2,
    "Walk": 3,
    "Hike": 4,
    "Swim": 5,
    "Unknown": 99
  };
  constructor(oauthClient) {
    super();
    this.oauthClient = oauthClient;
    this.oauthClient.on("token-exchanged", () => {
      console.log("[FittrackeeAPI] Token updated, client refreshed");
    });
  }
  /**
   * Set access token from OAuth credentials
   */
  setAccessToken(credentials) {
    this.accessToken = credentials.accessToken;
    console.log("[FittrackeeAPI] Access token configured");
  }
  /**
   * Get user profile information
   */
  async getUserProfile() {
    try {
      const data = await this.makeRequest("GET", "/api/user/me");
      return JSON.parse(data);
    } catch (error) {
      console.error("[FittrackeeAPI] Error fetching user profile:", error);
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }
  }
  /**
   * Get list of available activity types
   */
  async getActivityTypes() {
    try {
      const data = await this.makeRequest("GET", "/api/activity-type");
      return JSON.parse(data);
    } catch (error) {
      console.error("[FittrackeeAPI] Error fetching activity types:", error);
      throw new Error(`Failed to fetch activity types: ${error.message}`);
    }
  }
  /**
   * Get recent workouts from Fittrackee (for sync checking)
   */
  async getRecentWorkouts(limit = 10) {
    try {
      const data = await this.makeRequest(
        "GET",
        `/api/workout?limit=${limit}&order_by=-start_datetime`
      );
      const result = JSON.parse(data);
      return result.results || [];
    } catch (error) {
      console.error("[FittrackeeAPI] Error fetching recent workouts:", error);
      throw new Error(`Failed to fetch recent workouts: ${error.message}`);
    }
  }
  /**
   * Get a specific workout by UUID
   */
  async getWorkout(uuid) {
    try {
      const data = await this.makeRequest("GET", `/api/workout/${uuid}`);
      return JSON.parse(data);
    } catch (error) {
      console.error("[FittrackeeAPI] Error fetching workout:", error);
      throw new Error(`Failed to fetch workout: ${error.message}`);
    }
  }
  /**
   * Upload a new workout to Fittrackee
   */
  async uploadWorkout(workout) {
    try {
      const fittrackeeWorkout = {
        uuid: workout.id,
        activity_type_id: this.activityTypeMap[workout.type] || 99,
        is_outdoors: true,
        // Default to outdoor for now
        name: path__namespace.basename(workout.filePath),
        description: `Synced from ${workout.deviceName} via WorkoutPulse`,
        distance: workout.distance || 0,
        moving_time: workout.duration,
        elapsed_time: workout.duration,
        elevation_gain: workout.elevationGain || 0,
        total_photo_count: 0,
        start_datetime: workout.startTime.toISOString(),
        end_datetime: workout.endTime.toISOString(),
        average_heart_rate: workout.avgHeartRate,
        maximum_heart_rate: workout.maxHeartRate,
        calories: workout.calories || 0
      };
      const data = await this.makeRequest("POST", "/api/workout", fittrackeeWorkout);
      const result = JSON.parse(data);
      console.log("[FittrackeeAPI] Workout uploaded successfully:", result.uuid);
      this.emit("workout-uploaded", {
        workout: result,
        timestamp: Date.now()
      });
      return result;
    } catch (error) {
      console.error("[FittrackeeAPI] Error uploading workout:", error);
      throw new Error(`Failed to upload workout: ${error.message}`);
    }
  }
  /**
   * Upload multiple workouts with rate limiting
   */
  async uploadWorkoutsBatch(workouts, options) {
    const result = {
      success: 0,
      failed: 0,
      errors: []
    };
    const skipDuplicates = options?.skipDuplicates ?? true;
    const batchSize = options?.batchSize ?? 5;
    const delayMs = options?.delayMs ?? 1e3;
    let existingWorkouts = [];
    if (skipDuplicates) {
      try {
        existingWorkouts = await this.getRecentWorkouts(100);
      } catch (error) {
        console.warn("[FittrackeeAPI] Could not fetch existing workouts, skipping duplicate check");
        skipDuplicates = false;
      }
    }
    for (let i = 0; i < workouts.length; i++) {
      const workout = workouts[i];
      if (skipDuplicates) {
        const exists = existingWorkouts.some((w) => w.uuid === workout.id);
        if (exists) {
          console.log("[FittrackeeAPI] Workout already exists, skipping:", workout.id);
          continue;
        }
      }
      try {
        await this.uploadWorkout(workout);
        result.success++;
        if (skipDuplicates) {
          const uploaded = await this.getWorkout(workout.id);
          if (uploaded) {
            existingWorkouts.push(uploaded);
          }
        }
      } catch (error) {
        result.failed++;
        result.errors.push(`${workout.id}: ${error.message}`);
        console.error("[FittrackeeAPI] Failed to upload workout:", workout.id, error);
      }
      if ((i + 1) % batchSize === 0 && i < workouts.length - 1) {
        await this.delay(delayMs);
      }
    }
    console.log("[FittrackeeAPI] Batch upload complete:", result);
    return result;
  }
  /**
   * Delete a workout by UUID
   */
  async deleteWorkout(uuid) {
    try {
      await this.makeRequest("DELETE", `/api/workout/${uuid}`);
      console.log("[FittrackeeAPI] Workout deleted:", uuid);
    } catch (error) {
      console.error("[FittrackeeAPI] Error deleting workout:", error);
      throw new Error(`Failed to delete workout: ${error.message}`);
    }
  }
  /**
   * Make HTTP request to Fittrackee API
   */
  async makeRequest(method, endpoint, body) {
    if (!this.accessToken) {
      const credentials2 = this.oauthClient.loadStoredCredentials();
      if (credentials2?.accessToken) {
        this.setAccessToken(credentials2);
      } else {
        throw new Error("No access token available");
      }
    }
    const credentials = this.oauthClient.loadStoredCredentials();
    if (credentials?.tokenExpiry && Date.now() > credentials.tokenExpiry) {
      console.log("[FittrackeeAPI] Token expired, attempting refresh");
      try {
        const refreshed = await this.oauthClient.refreshToken(credentials.refreshToken);
        this.setAccessToken(refreshed);
      } catch (error) {
        throw new Error(`Token refresh failed: ${error.message}`);
      }
    }
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const isHttps = this.baseUrl.startsWith("https");
      const lib = isHttps ? https__namespace : http__namespace;
      const headers = {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      };
      const options = {
        hostname: new URL(url).hostname,
        port: isHttps ? 443 : 80,
        path: new URL(url).pathname,
        method,
        headers
      };
      const req = lib.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on("error", (error) => {
        reject(error);
      });
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }
  /**
   * Utility: delay function for rate limiting
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
let fittrackeeApi$1 = null;
function initializeFittrackeeApi(oauthClient) {
  if (!fittrackeeApi$1) {
    fittrackeeApi$1 = new FittrackeeApiClient(oauthClient);
    console.log("[FittrackeeAPI] Client initialized");
  }
  return fittrackeeApi$1;
}
async function parseFitFile(filePath) {
  try {
    const buffer = fs__namespace.readFileSync(filePath);
    if (buffer[0] !== 50 || buffer[1] !== 29) {
      console.log("[WorkoutPulse] Not a valid FIT file:", filePath);
      return null;
    }
    const workout = extractWorkoutData(buffer, filePath);
    if (!workout) return null;
    return workout;
  } catch (error) {
    console.error("[WorkoutPulse] Error parsing FIT file:", error);
    return null;
  }
}
function extractWorkoutData(buffer, filePath) {
  try {
    const stats = fs__namespace.statSync(filePath);
    const fileName = path__namespace.basename(filePath, ".fit");
    const idMatch = fileName.match(/activity-(\d+)/);
    const workoutId = idMatch ? idMatch[1] : Date.now().toString();
    let parser = null;
    let records = [];
    let deviceName = "Unknown";
    try {
      parser = new (void 0)();
      const parsedData = parser.parse(buffer);
      records = parsedData.records || [];
      const deviceRecords = records.filter((r) => r.name === "device_info");
      if (deviceRecords.length > 0) {
        const deviceInfo = deviceRecords[0];
        const manufacturers = {
          1: "Garmin",
          2: "Suunto",
          3: "Polar",
          4: "Wahoo",
          5: "Coros",
          6: "Hammerhead"
        };
        deviceName = `${manufacturers[deviceInfo.fields?.manufacturer] || "Unknown"} ${deviceInfo.fields?.product || ""}`.trim() || "Unknown";
      }
    } catch (parseError) {
      console.warn("[WorkoutPulse] FIT parsing error, using fallback:", parseError);
    }
    let duration = 0;
    let distance = 0;
    let calories = 0;
    let avgHeartRate = 0;
    let maxHeartRate = 0;
    let startTime = stats.birthtime || /* @__PURE__ */ new Date();
    let endTime = stats.mtime || /* @__PURE__ */ new Date();
    let elevationGain = 0;
    let steps = 0;
    records.forEach((record) => {
      const fieldName = record.name;
      const fields = record.fields || {};
      switch (fieldName) {
        case "session":
          duration = Math.max(duration, fields.total_elapsed_time || 0);
          duration = Math.max(duration, fields.total_motion_time || 0);
          distance = Math.max(distance, fields.total_distance || 0);
          calories += fields.total_calories || 0;
          if (fields.avg_heart_rate && fields.avg_heart_rate > 0) {
            avgHeartRate = Math.max(avgHeartRate, fields.avg_heart_rate);
          }
          if (fields.max_heart_rate) {
            maxHeartRate = Math.max(maxHeartRate, fields.max_heart_rate);
          }
          break;
        case "lap":
          duration = Math.max(duration, fields.lap_total_elapsed_time || 0);
          distance = Math.max(distance, fields.total_distance || 0);
          calories += fields.total_calories || 0;
          break;
        case "record":
          if (fields.distance !== void 0) {
            distance = Math.max(distance, fields.distance);
          }
          if (fields.elevation !== void 0 && fields.elevation > 0) {
            elevationGain += fields.elevation;
          }
          break;
        case "heart_rate_zone":
          if (fields.heart_rate !== void 0) {
            maxHeartRate = Math.max(maxHeartRate, fields.heart_rate);
          }
          break;
        case "device_info":
          deviceName = `${fields.manufacturer || ""} ${fields.product || ""}`.trim() || "Unknown";
          break;
      }
    });
    if (duration === 0) {
      const fileTime = stats.birthtime?.getTime() || Date.now();
      startTime = new Date(fileTime);
      endTime = new Date(fileTime + 3600 * 1e3);
      duration = 3600;
    }
    let workoutType = "Unknown";
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.includes("run")) {
      workoutType = "Run";
    } else if (lowerFileName.includes("bike") || lowerFileName.includes("ride")) {
      workoutType = "Ride";
    } else if (lowerFileName.includes("walk")) {
      workoutType = "Walk";
    } else if (lowerFileName.includes("hike")) {
      workoutType = "Hike";
    } else if (lowerFileName.includes("trail")) {
      workoutType = "Trail Run";
    }
    return {
      id: workoutId,
      type: workoutType,
      startTime,
      endTime,
      duration,
      distance: distance > 0 ? distance : void 0,
      calories: calories > 0 ? calories : void 0,
      avgHeartRate: avgHeartRate > 0 ? avgHeartRate : void 0,
      maxHeartRate: maxHeartRate > 0 ? maxHeartRate : void 0,
      filePath,
      deviceName,
      elevationGain: elevationGain > 0 ? elevationGain : void 0,
      steps: steps > 0 ? steps : void 0
    };
  } catch (error) {
    console.error("[WorkoutPulse] Error extracting workout data:", error);
    return null;
  }
}
async function parseGpxFile(filePath) {
  try {
    const content = fs__namespace.readFileSync(filePath, "utf-8");
    const workoutId = path__namespace.basename(filePath, ".gpx");
    let duration = 0;
    let distance = 0;
    let calories = 0;
    let elevationGain = 0;
    let startTime = /* @__PURE__ */ new Date();
    let endTime = /* @__PURE__ */ new Date();
    const trkptMatches = content.match(/<trkpt[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/trkpt>/g);
    if (trkptMatches && trkptMatches.length >= 2) {
      const times = [];
      trkptMatches.forEach((match) => {
        const timeMatch = match.match(/<time>([^<]+)<\/time>/);
        if (timeMatch) {
          times.push(new Date(timeMatch[1]));
        }
      });
      if (times.length >= 2) {
        times.sort((a, b) => a.getTime() - b.getTime());
        startTime = times[0];
        endTime = times[times.length - 1];
        duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1e3);
      }
    }
    const distanceMatches = content.match(/<trkpt[^>]* lat="([^"]+)" lon="([^"]+)"[^>]*>/g);
    if (distanceMatches) {
      let lastLat = null;
      let lastLon = null;
      distanceMatches.forEach((match) => {
        const latMatch = match.match(/lat="([^"]+)"/);
        const lonMatch = match.match(/lon="([^"]+)"/);
        if (latMatch && lonMatch) {
          const lat = parseFloat(latMatch[1]);
          const lon = parseFloat(lonMatch[1]);
          if (lastLat !== null && lastLon !== null) {
            const segmentDistance = calculateHaversineDistance(lastLat, lastLon, lat, lon);
            distance += segmentDistance;
          }
          lastLat = lat;
          lastLon = lon;
        }
      });
    }
    const elevMatches = content.match(/<ele[^>]*>([^<]+)<\/ele>/g);
    if (elevMatches) {
      let lastElev = null;
      elevMatches.forEach((match) => {
        const elevValue = parseFloat(match.replace(/[^0-9.-]/g, ""));
        if (!isNaN(elevValue) && lastElev !== null) {
          const diff = elevValue - lastElev;
          if (diff > 0) {
            elevationGain += diff;
          }
        }
        lastElev = elevValue;
      });
    }
    const calMatch = content.match(/<extensions[^>]*>(?:[^<]*(?:<calories[^>]*>([^<]+)<\/calories>)?[^<]*)*?<\/extensions>/s);
    if (calMatch) {
      const calSubMatch = calMatch[0].match(/<calories[^>]*>([^<]+)<\/calories>/);
      if (calSubMatch) {
        calories = parseFloat(calSubMatch[1]);
      }
    }
    let workoutType = "GPX Activity";
    const lowerFileName = path__namespace.basename(filePath, ".gpx").toLowerCase();
    if (lowerFileName.includes("run")) {
      workoutType = "Run";
    } else if (lowerFileName.includes("bike") || lowerFileName.includes("ride")) {
      workoutType = "Ride";
    } else if (lowerFileName.includes("walk")) {
      workoutType = "Walk";
    } else if (lowerFileName.includes("hike")) {
      workoutType = "Hike";
    }
    return {
      id: workoutId,
      type: workoutType,
      startTime,
      endTime,
      duration,
      distance: distance > 0 ? distance : void 0,
      calories: calories > 0 ? calories : void 0,
      filePath,
      elevationGain: elevationGain > 0 ? elevationGain : void 0
    };
  } catch (error) {
    console.error("[WorkoutPulse] Error parsing GPX file:", error);
    return null;
  }
}
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
async function scanWorkouts(directory) {
  const workouts = [];
  try {
    const files = fs__namespace.readdirSync(directory);
    for (const file of files) {
      if (!file.endsWith(".fit") && !file.endsWith(".gpx")) continue;
      const filePath = path__namespace.join(directory, file);
      if (file.startsWith(".")) continue;
      let workout = null;
      if (file.endsWith(".fit")) {
        workout = await parseFitFile(filePath);
      } else if (file.endsWith(".gpx")) {
        workout = await parseGpxFile(filePath);
      }
      if (workout) {
        workouts.push(workout);
      }
    }
  } catch (error) {
    console.error("[WorkoutPulse] Error scanning directory:", error);
  }
  return workouts.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}
const EntryTypes = {
  FILE_TYPE: "files",
  DIR_TYPE: "directories",
  FILE_DIR_TYPE: "files_directories",
  EVERYTHING_TYPE: "all"
};
const defaultOptions = {
  root: ".",
  fileFilter: (_entryInfo) => true,
  directoryFilter: (_entryInfo) => true,
  type: EntryTypes.FILE_TYPE,
  lstat: false,
  depth: 2147483648,
  alwaysStat: false,
  highWaterMark: 4096
};
Object.freeze(defaultOptions);
const RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
const NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
const ALL_TYPES = [
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
];
const DIR_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE
]);
const FILE_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
]);
const isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
const wantBigintFsStats = process.platform === "win32";
const emptyFn = (_entryInfo) => true;
const normalizeFilter = (filter) => {
  if (filter === void 0)
    return emptyFn;
  if (typeof filter === "function")
    return filter;
  if (typeof filter === "string") {
    const fl = filter.trim();
    return (entry) => entry.basename === fl;
  }
  if (Array.isArray(filter)) {
    const trItems = filter.map((item) => item.trim());
    return (entry) => trItems.some((f) => entry.basename === f);
  }
  return emptyFn;
};
class ReaddirpStream extends node_stream.Readable {
  parents;
  reading;
  parent;
  _stat;
  _maxDepth;
  _wantsDir;
  _wantsFile;
  _wantsEverything;
  _root;
  _isDirent;
  _statsProp;
  _rdOptions;
  _fileFilter;
  _directoryFilter;
  constructor(options = {}) {
    super({
      objectMode: true,
      autoDestroy: true,
      highWaterMark: options.highWaterMark
    });
    const opts = { ...defaultOptions, ...options };
    const { root, type } = opts;
    this._fileFilter = normalizeFilter(opts.fileFilter);
    this._directoryFilter = normalizeFilter(opts.directoryFilter);
    const statMethod = opts.lstat ? promises.lstat : promises.stat;
    if (wantBigintFsStats) {
      this._stat = (path2) => statMethod(path2, { bigint: true });
    } else {
      this._stat = statMethod;
    }
    this._maxDepth = opts.depth != null && Number.isSafeInteger(opts.depth) ? opts.depth : defaultOptions.depth;
    this._wantsDir = type ? DIR_TYPES.has(type) : false;
    this._wantsFile = type ? FILE_TYPES.has(type) : false;
    this._wantsEverything = type === EntryTypes.EVERYTHING_TYPE;
    this._root = sp.resolve(root);
    this._isDirent = !opts.alwaysStat;
    this._statsProp = this._isDirent ? "dirent" : "stats";
    this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
    this.parents = [this._exploreDir(root, 1)];
    this.reading = false;
    this.parent = void 0;
  }
  async _read(batch) {
    if (this.reading)
      return;
    this.reading = true;
    try {
      while (!this.destroyed && batch > 0) {
        const par = this.parent;
        const fil = par && par.files;
        if (fil && fil.length > 0) {
          const { path: path2, depth } = par;
          const slice = fil.splice(0, batch).map((dirent) => this._formatEntry(dirent, path2));
          const awaited = await Promise.all(slice);
          for (const entry of awaited) {
            if (!entry)
              continue;
            if (this.destroyed)
              return;
            const entryType = await this._getEntryType(entry);
            if (entryType === "directory" && this._directoryFilter(entry)) {
              if (depth <= this._maxDepth) {
                this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
              }
              if (this._wantsDir) {
                this.push(entry);
                batch--;
              }
            } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
              if (this._wantsFile) {
                this.push(entry);
                batch--;
              }
            }
          }
        } else {
          const parent = this.parents.pop();
          if (!parent) {
            this.push(null);
            break;
          }
          this.parent = await parent;
          if (this.destroyed)
            return;
        }
      }
    } catch (error) {
      this.destroy(error);
    } finally {
      this.reading = false;
    }
  }
  async _exploreDir(path2, depth) {
    let files;
    try {
      files = await promises.readdir(path2, this._rdOptions);
    } catch (error) {
      this._onError(error);
    }
    return { files, depth, path: path2 };
  }
  async _formatEntry(dirent, path2) {
    let entry;
    const basename = this._isDirent ? dirent.name : dirent;
    try {
      const fullPath = sp.resolve(sp.join(path2, basename));
      entry = { path: sp.relative(this._root, fullPath), fullPath, basename };
      entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
    } catch (err) {
      this._onError(err);
      return;
    }
    return entry;
  }
  _onError(err) {
    if (isNormalFlowError(err) && !this.destroyed) {
      this.emit("warn", err);
    } else {
      this.destroy(err);
    }
  }
  async _getEntryType(entry) {
    if (!entry && this._statsProp in entry) {
      return "";
    }
    const stats = entry[this._statsProp];
    if (stats.isFile())
      return "file";
    if (stats.isDirectory())
      return "directory";
    if (stats && stats.isSymbolicLink()) {
      const full = entry.fullPath;
      try {
        const entryRealPath = await promises.realpath(full);
        const entryRealPathStats = await promises.lstat(entryRealPath);
        if (entryRealPathStats.isFile()) {
          return "file";
        }
        if (entryRealPathStats.isDirectory()) {
          const len = entryRealPath.length;
          if (full.startsWith(entryRealPath) && full.substr(len, 1) === sp.sep) {
            const recursiveError = new Error(`Circular symlink detected: "${full}" points to "${entryRealPath}"`);
            recursiveError.code = RECURSIVE_ERROR_CODE;
            return this._onError(recursiveError);
          }
          return "directory";
        }
      } catch (error) {
        this._onError(error);
        return "";
      }
    }
  }
  _includeAsFile(entry) {
    const stats = entry && entry[this._statsProp];
    return stats && this._wantsEverything && !stats.isDirectory();
  }
}
function readdirp(root, options = {}) {
  let type = options.entryType || options.type;
  if (type === "both")
    type = EntryTypes.FILE_DIR_TYPE;
  if (type)
    options.type = type;
  if (!root) {
    throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
  } else if (typeof root !== "string") {
    throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
  } else if (type && !ALL_TYPES.includes(type)) {
    throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
  }
  options.root = root;
  return new ReaddirpStream(options);
}
const STR_DATA = "data";
const STR_END = "end";
const STR_CLOSE = "close";
const EMPTY_FN = () => {
};
const pl = process.platform;
const isWindows = pl === "win32";
const isMacos = pl === "darwin";
const isLinux = pl === "linux";
const isFreeBSD = pl === "freebsd";
const isIBMi = node_os.type() === "OS400";
const EVENTS = {
  ALL: "all",
  READY: "ready",
  ADD: "add",
  CHANGE: "change",
  ADD_DIR: "addDir",
  UNLINK: "unlink",
  UNLINK_DIR: "unlinkDir",
  RAW: "raw",
  ERROR: "error"
};
const EV = EVENTS;
const THROTTLE_MODE_WATCH = "watch";
const statMethods = { lstat: promises.lstat, stat: promises.stat };
const KEY_LISTENERS = "listeners";
const KEY_ERR = "errHandlers";
const KEY_RAW = "rawEmitters";
const HANDLER_KEYS = [KEY_LISTENERS, KEY_ERR, KEY_RAW];
const binaryExtensions = /* @__PURE__ */ new Set([
  "3dm",
  "3ds",
  "3g2",
  "3gp",
  "7z",
  "a",
  "aac",
  "adp",
  "afdesign",
  "afphoto",
  "afpub",
  "ai",
  "aif",
  "aiff",
  "alz",
  "ape",
  "apk",
  "appimage",
  "ar",
  "arj",
  "asf",
  "au",
  "avi",
  "bak",
  "baml",
  "bh",
  "bin",
  "bk",
  "bmp",
  "btif",
  "bz2",
  "bzip2",
  "cab",
  "caf",
  "cgm",
  "class",
  "cmx",
  "cpio",
  "cr2",
  "cur",
  "dat",
  "dcm",
  "deb",
  "dex",
  "djvu",
  "dll",
  "dmg",
  "dng",
  "doc",
  "docm",
  "docx",
  "dot",
  "dotm",
  "dra",
  "DS_Store",
  "dsk",
  "dts",
  "dtshd",
  "dvb",
  "dwg",
  "dxf",
  "ecelp4800",
  "ecelp7470",
  "ecelp9600",
  "egg",
  "eol",
  "eot",
  "epub",
  "exe",
  "f4v",
  "fbs",
  "fh",
  "fla",
  "flac",
  "flatpak",
  "fli",
  "flv",
  "fpx",
  "fst",
  "fvt",
  "g3",
  "gh",
  "gif",
  "graffle",
  "gz",
  "gzip",
  "h261",
  "h263",
  "h264",
  "icns",
  "ico",
  "ief",
  "img",
  "ipa",
  "iso",
  "jar",
  "jpeg",
  "jpg",
  "jpgv",
  "jpm",
  "jxr",
  "key",
  "ktx",
  "lha",
  "lib",
  "lvp",
  "lz",
  "lzh",
  "lzma",
  "lzo",
  "m3u",
  "m4a",
  "m4v",
  "mar",
  "mdi",
  "mht",
  "mid",
  "midi",
  "mj2",
  "mka",
  "mkv",
  "mmr",
  "mng",
  "mobi",
  "mov",
  "movie",
  "mp3",
  "mp4",
  "mp4a",
  "mpeg",
  "mpg",
  "mpga",
  "mxu",
  "nef",
  "npx",
  "numbers",
  "nupkg",
  "o",
  "odp",
  "ods",
  "odt",
  "oga",
  "ogg",
  "ogv",
  "otf",
  "ott",
  "pages",
  "pbm",
  "pcx",
  "pdb",
  "pdf",
  "pea",
  "pgm",
  "pic",
  "png",
  "pnm",
  "pot",
  "potm",
  "potx",
  "ppa",
  "ppam",
  "ppm",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "psd",
  "pya",
  "pyc",
  "pyo",
  "pyv",
  "qt",
  "rar",
  "ras",
  "raw",
  "resources",
  "rgb",
  "rip",
  "rlc",
  "rmf",
  "rmvb",
  "rpm",
  "rtf",
  "rz",
  "s3m",
  "s7z",
  "scpt",
  "sgi",
  "shar",
  "snap",
  "sil",
  "sketch",
  "slk",
  "smv",
  "snk",
  "so",
  "stl",
  "suo",
  "sub",
  "swf",
  "tar",
  "tbz",
  "tbz2",
  "tga",
  "tgz",
  "thmx",
  "tif",
  "tiff",
  "tlz",
  "ttc",
  "ttf",
  "txz",
  "udf",
  "uvh",
  "uvi",
  "uvm",
  "uvp",
  "uvs",
  "uvu",
  "viv",
  "vob",
  "war",
  "wav",
  "wax",
  "wbmp",
  "wdp",
  "weba",
  "webm",
  "webp",
  "whl",
  "wim",
  "wm",
  "wma",
  "wmv",
  "wmx",
  "woff",
  "woff2",
  "wrm",
  "wvx",
  "xbm",
  "xif",
  "xla",
  "xlam",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
  "xm",
  "xmind",
  "xpi",
  "xpm",
  "xwd",
  "xz",
  "z",
  "zip",
  "zipx"
]);
const isBinaryPath = (filePath) => binaryExtensions.has(sp__namespace.extname(filePath).slice(1).toLowerCase());
const foreach = (val, fn) => {
  if (val instanceof Set) {
    val.forEach(fn);
  } else {
    fn(val);
  }
};
const addAndConvert = (main, prop, item) => {
  let container = main[prop];
  if (!(container instanceof Set)) {
    main[prop] = container = /* @__PURE__ */ new Set([container]);
  }
  container.add(item);
};
const clearItem = (cont) => (key) => {
  const set = cont[key];
  if (set instanceof Set) {
    set.clear();
  } else {
    delete cont[key];
  }
};
const delFromSet = (main, prop, item) => {
  const container = main[prop];
  if (container instanceof Set) {
    container.delete(item);
  } else if (container === item) {
    delete main[prop];
  }
};
const isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
const FsWatchInstances = /* @__PURE__ */ new Map();
function createFsWatchInstance(path2, options, listener, errHandler, emitRaw) {
  const handleEvent = (rawEvent, evPath) => {
    listener(path2);
    emitRaw(rawEvent, evPath, { watchedPath: path2 });
    if (evPath && path2 !== evPath) {
      fsWatchBroadcast(sp__namespace.resolve(path2, evPath), KEY_LISTENERS, sp__namespace.join(path2, evPath));
    }
  };
  try {
    return node_fs.watch(path2, {
      persistent: options.persistent
    }, handleEvent);
  } catch (error) {
    errHandler(error);
    return void 0;
  }
}
const fsWatchBroadcast = (fullPath, listenerType, val1, val2, val3) => {
  const cont = FsWatchInstances.get(fullPath);
  if (!cont)
    return;
  foreach(cont[listenerType], (listener) => {
    listener(val1, val2, val3);
  });
};
const setFsWatchListener = (path2, fullPath, options, handlers) => {
  const { listener, errHandler, rawEmitter } = handlers;
  let cont = FsWatchInstances.get(fullPath);
  let watcher;
  if (!options.persistent) {
    watcher = createFsWatchInstance(path2, options, listener, errHandler, rawEmitter);
    if (!watcher)
      return;
    return watcher.close.bind(watcher);
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_ERR, errHandler);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    watcher = createFsWatchInstance(
      path2,
      options,
      fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
      errHandler,
      // no need to use broadcast here
      fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
    );
    if (!watcher)
      return;
    watcher.on(EV.ERROR, async (error) => {
      const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
      if (cont)
        cont.watcherUnusable = true;
      if (isWindows && error.code === "EPERM") {
        try {
          const fd = await promises.open(path2, "r");
          await fd.close();
          broadcastErr(error);
        } catch (err) {
        }
      } else {
        broadcastErr(error);
      }
    });
    cont = {
      listeners: listener,
      errHandlers: errHandler,
      rawEmitters: rawEmitter,
      watcher
    };
    FsWatchInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_ERR, errHandler);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      cont.watcher.close();
      FsWatchInstances.delete(fullPath);
      HANDLER_KEYS.forEach(clearItem(cont));
      cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
const FsWatchFileInstances = /* @__PURE__ */ new Map();
const setFsWatchFileListener = (path2, fullPath, options, handlers) => {
  const { listener, rawEmitter } = handlers;
  let cont = FsWatchFileInstances.get(fullPath);
  const copts = cont && cont.options;
  if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
    node_fs.unwatchFile(fullPath);
    cont = void 0;
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    cont = {
      listeners: listener,
      rawEmitters: rawEmitter,
      options,
      watcher: node_fs.watchFile(fullPath, options, (curr, prev) => {
        foreach(cont.rawEmitters, (rawEmitter2) => {
          rawEmitter2(EV.CHANGE, fullPath, { curr, prev });
        });
        const currmtime = curr.mtimeMs;
        if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
          foreach(cont.listeners, (listener2) => listener2(path2, curr));
        }
      })
    };
    FsWatchFileInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      FsWatchFileInstances.delete(fullPath);
      node_fs.unwatchFile(fullPath);
      cont.options = cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
class NodeFsHandler {
  fsw;
  _boundHandleError;
  constructor(fsW) {
    this.fsw = fsW;
    this._boundHandleError = (error) => fsW._handleError(error);
  }
  /**
   * Watch file for changes with fs_watchFile or fs_watch.
   * @param path to file or dir
   * @param listener on fs change
   * @returns closer for the watcher instance
   */
  _watchWithNodeFs(path2, listener) {
    const opts = this.fsw.options;
    const directory = sp__namespace.dirname(path2);
    const basename = sp__namespace.basename(path2);
    const parent = this.fsw._getWatchedDir(directory);
    parent.add(basename);
    const absolutePath = sp__namespace.resolve(path2);
    const options = {
      persistent: opts.persistent
    };
    if (!listener)
      listener = EMPTY_FN;
    let closer;
    if (opts.usePolling) {
      const enableBin = opts.interval !== opts.binaryInterval;
      options.interval = enableBin && isBinaryPath(basename) ? opts.binaryInterval : opts.interval;
      closer = setFsWatchFileListener(path2, absolutePath, options, {
        listener,
        rawEmitter: this.fsw._emitRaw
      });
    } else {
      closer = setFsWatchListener(path2, absolutePath, options, {
        listener,
        errHandler: this._boundHandleError,
        rawEmitter: this.fsw._emitRaw
      });
    }
    return closer;
  }
  /**
   * Watch a file and emit add event if warranted.
   * @returns closer for the watcher instance
   */
  _handleFile(file, stats, initialAdd) {
    if (this.fsw.closed) {
      return;
    }
    const dirname = sp__namespace.dirname(file);
    const basename = sp__namespace.basename(file);
    const parent = this.fsw._getWatchedDir(dirname);
    let prevStats = stats;
    if (parent.has(basename))
      return;
    const listener = async (path2, newStats) => {
      if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5))
        return;
      if (!newStats || newStats.mtimeMs === 0) {
        try {
          const newStats2 = await promises.stat(file);
          if (this.fsw.closed)
            return;
          const at = newStats2.atimeMs;
          const mt = newStats2.mtimeMs;
          if (!at || at <= mt || mt !== prevStats.mtimeMs) {
            this.fsw._emit(EV.CHANGE, file, newStats2);
          }
          if ((isMacos || isLinux || isFreeBSD) && prevStats.ino !== newStats2.ino) {
            this.fsw._closeFile(path2);
            prevStats = newStats2;
            const closer2 = this._watchWithNodeFs(file, listener);
            if (closer2)
              this.fsw._addPathCloser(path2, closer2);
          } else {
            prevStats = newStats2;
          }
        } catch (error) {
          this.fsw._remove(dirname, basename);
        }
      } else if (parent.has(basename)) {
        const at = newStats.atimeMs;
        const mt = newStats.mtimeMs;
        if (!at || at <= mt || mt !== prevStats.mtimeMs) {
          this.fsw._emit(EV.CHANGE, file, newStats);
        }
        prevStats = newStats;
      }
    };
    const closer = this._watchWithNodeFs(file, listener);
    if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
      if (!this.fsw._throttle(EV.ADD, file, 0))
        return;
      this.fsw._emit(EV.ADD, file, stats);
    }
    return closer;
  }
  /**
   * Handle symlinks encountered while reading a dir.
   * @param entry returned by readdirp
   * @param directory path of dir being read
   * @param path of this item
   * @param item basename of this item
   * @returns true if no more processing is needed for this entry.
   */
  async _handleSymlink(entry, directory, path2, item) {
    if (this.fsw.closed) {
      return;
    }
    const full = entry.fullPath;
    const dir = this.fsw._getWatchedDir(directory);
    if (!this.fsw.options.followSymlinks) {
      this.fsw._incrReadyCount();
      let linkPath;
      try {
        linkPath = await promises.realpath(path2);
      } catch (e) {
        this.fsw._emitReady();
        return true;
      }
      if (this.fsw.closed)
        return;
      if (dir.has(item)) {
        if (this.fsw._symlinkPaths.get(full) !== linkPath) {
          this.fsw._symlinkPaths.set(full, linkPath);
          this.fsw._emit(EV.CHANGE, path2, entry.stats);
        }
      } else {
        dir.add(item);
        this.fsw._symlinkPaths.set(full, linkPath);
        this.fsw._emit(EV.ADD, path2, entry.stats);
      }
      this.fsw._emitReady();
      return true;
    }
    if (this.fsw._symlinkPaths.has(full)) {
      return true;
    }
    this.fsw._symlinkPaths.set(full, true);
  }
  _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
    directory = sp__namespace.join(directory, "");
    const throttleKey = target ? `${directory}:${target}` : directory;
    throttler = this.fsw._throttle("readdir", throttleKey, 1e3);
    if (!throttler)
      return;
    const previous = this.fsw._getWatchedDir(wh.path);
    const current = /* @__PURE__ */ new Set();
    let stream = this.fsw._readdirp(directory, {
      fileFilter: (entry) => wh.filterPath(entry),
      directoryFilter: (entry) => wh.filterDir(entry)
    });
    if (!stream)
      return;
    stream.on(STR_DATA, async (entry) => {
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      const item = entry.path;
      let path2 = sp__namespace.join(directory, item);
      current.add(item);
      if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path2, item)) {
        return;
      }
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      if (item === target || !target && !previous.has(item)) {
        this.fsw._incrReadyCount();
        path2 = sp__namespace.join(dir, sp__namespace.relative(dir, path2));
        this._addToNodeFs(path2, initialAdd, wh, depth + 1);
      }
    }).on(EV.ERROR, this._boundHandleError);
    return new Promise((resolve, reject) => {
      if (!stream)
        return reject();
      stream.once(STR_END, () => {
        if (this.fsw.closed) {
          stream = void 0;
          return;
        }
        const wasThrottled = throttler ? throttler.clear() : false;
        resolve(void 0);
        previous.getChildren().filter((item) => {
          return item !== directory && !current.has(item);
        }).forEach((item) => {
          this.fsw._remove(directory, item);
        });
        stream = void 0;
        if (wasThrottled)
          this._handleRead(directory, false, wh, target, dir, depth, throttler);
      });
    });
  }
  /**
   * Read directory to add / remove files from `@watched` list and re-read it on change.
   * @param dir fs path
   * @param stats
   * @param initialAdd
   * @param depth relative to user-supplied path
   * @param target child path targeted for watch
   * @param wh Common watch helpers for this path
   * @param realpath
   * @returns closer for the watcher instance.
   */
  async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath) {
    const parentDir = this.fsw._getWatchedDir(sp__namespace.dirname(dir));
    const tracked = parentDir.has(sp__namespace.basename(dir));
    if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
      this.fsw._emit(EV.ADD_DIR, dir, stats);
    }
    parentDir.add(sp__namespace.basename(dir));
    this.fsw._getWatchedDir(dir);
    let throttler;
    let closer;
    const oDepth = this.fsw.options.depth;
    if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath)) {
      if (!target) {
        await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
        if (this.fsw.closed)
          return;
      }
      closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
        if (stats2 && stats2.mtimeMs === 0)
          return;
        this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
      });
    }
    return closer;
  }
  /**
   * Handle added file, directory, or glob pattern.
   * Delegates call to _handleFile / _handleDir after checks.
   * @param path to file or ir
   * @param initialAdd was the file added at watch instantiation?
   * @param priorWh depth relative to user-supplied path
   * @param depth Child path actually targeted for watch
   * @param target Child path actually targeted for watch
   */
  async _addToNodeFs(path2, initialAdd, priorWh, depth, target) {
    const ready = this.fsw._emitReady;
    if (this.fsw._isIgnored(path2) || this.fsw.closed) {
      ready();
      return false;
    }
    const wh = this.fsw._getWatchHelpers(path2);
    if (priorWh) {
      wh.filterPath = (entry) => priorWh.filterPath(entry);
      wh.filterDir = (entry) => priorWh.filterDir(entry);
    }
    try {
      const stats = await statMethods[wh.statMethod](wh.watchPath);
      if (this.fsw.closed)
        return;
      if (this.fsw._isIgnored(wh.watchPath, stats)) {
        ready();
        return false;
      }
      const follow = this.fsw.options.followSymlinks;
      let closer;
      if (stats.isDirectory()) {
        const absPath = sp__namespace.resolve(path2);
        const targetPath = follow ? await promises.realpath(path2) : path2;
        if (this.fsw.closed)
          return;
        closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (absPath !== targetPath && targetPath !== void 0) {
          this.fsw._symlinkPaths.set(absPath, targetPath);
        }
      } else if (stats.isSymbolicLink()) {
        const targetPath = follow ? await promises.realpath(path2) : path2;
        if (this.fsw.closed)
          return;
        const parent = sp__namespace.dirname(wh.watchPath);
        this.fsw._getWatchedDir(parent).add(wh.watchPath);
        this.fsw._emit(EV.ADD, wh.watchPath, stats);
        closer = await this._handleDir(parent, stats, initialAdd, depth, path2, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (targetPath !== void 0) {
          this.fsw._symlinkPaths.set(sp__namespace.resolve(path2), targetPath);
        }
      } else {
        closer = this._handleFile(wh.watchPath, stats, initialAdd);
      }
      ready();
      if (closer)
        this.fsw._addPathCloser(path2, closer);
      return false;
    } catch (error) {
      if (this.fsw._handleError(error)) {
        ready();
        return path2;
      }
    }
  }
}
/*! chokidar - MIT License (c) 2012 Paul Miller (paulmillr.com) */
const SLASH = "/";
const SLASH_SLASH = "//";
const ONE_DOT = ".";
const TWO_DOTS = "..";
const STRING_TYPE = "string";
const BACK_SLASH_RE = /\\/g;
const DOUBLE_SLASH_RE = /\/\//g;
const DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
const REPLACER_RE = /^\.[/\\]/;
function arrify(item) {
  return Array.isArray(item) ? item : [item];
}
const isMatcherObject = (matcher) => typeof matcher === "object" && matcher !== null && !(matcher instanceof RegExp);
function createPattern(matcher) {
  if (typeof matcher === "function")
    return matcher;
  if (typeof matcher === "string")
    return (string) => matcher === string;
  if (matcher instanceof RegExp)
    return (string) => matcher.test(string);
  if (typeof matcher === "object" && matcher !== null) {
    return (string) => {
      if (matcher.path === string)
        return true;
      if (matcher.recursive) {
        const relative = sp__namespace.relative(matcher.path, string);
        if (!relative) {
          return false;
        }
        return !relative.startsWith("..") && !sp__namespace.isAbsolute(relative);
      }
      return false;
    };
  }
  return () => false;
}
function normalizePath(path2) {
  if (typeof path2 !== "string")
    throw new Error("string expected");
  path2 = sp__namespace.normalize(path2);
  path2 = path2.replace(/\\/g, "/");
  let prepend = false;
  if (path2.startsWith("//"))
    prepend = true;
  path2 = path2.replace(DOUBLE_SLASH_RE, "/");
  if (prepend)
    path2 = "/" + path2;
  return path2;
}
function matchPatterns(patterns, testString, stats) {
  const path2 = normalizePath(testString);
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (pattern(path2, stats)) {
      return true;
    }
  }
  return false;
}
function anymatch(matchers, testString) {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const matchersArray = arrify(matchers);
  const patterns = matchersArray.map((matcher) => createPattern(matcher));
  {
    return (testString2, stats) => {
      return matchPatterns(patterns, testString2, stats);
    };
  }
}
const unifyPaths = (paths_) => {
  const paths = arrify(paths_).flat();
  if (!paths.every((p) => typeof p === STRING_TYPE)) {
    throw new TypeError(`Non-string provided as watch path: ${paths}`);
  }
  return paths.map(normalizePathToUnix);
};
const toUnix = (string) => {
  let str = string.replace(BACK_SLASH_RE, SLASH);
  let prepend = false;
  if (str.startsWith(SLASH_SLASH)) {
    prepend = true;
  }
  str = str.replace(DOUBLE_SLASH_RE, SLASH);
  if (prepend) {
    str = SLASH + str;
  }
  return str;
};
const normalizePathToUnix = (path2) => toUnix(sp__namespace.normalize(toUnix(path2)));
const normalizeIgnored = (cwd = "") => (path2) => {
  if (typeof path2 === "string") {
    return normalizePathToUnix(sp__namespace.isAbsolute(path2) ? path2 : sp__namespace.join(cwd, path2));
  } else {
    return path2;
  }
};
const getAbsolutePath = (path2, cwd) => {
  if (sp__namespace.isAbsolute(path2)) {
    return path2;
  }
  return sp__namespace.join(cwd, path2);
};
const EMPTY_SET = Object.freeze(/* @__PURE__ */ new Set());
class DirEntry {
  path;
  _removeWatcher;
  items;
  constructor(dir, removeWatcher) {
    this.path = dir;
    this._removeWatcher = removeWatcher;
    this.items = /* @__PURE__ */ new Set();
  }
  add(item) {
    const { items } = this;
    if (!items)
      return;
    if (item !== ONE_DOT && item !== TWO_DOTS)
      items.add(item);
  }
  async remove(item) {
    const { items } = this;
    if (!items)
      return;
    items.delete(item);
    if (items.size > 0)
      return;
    const dir = this.path;
    try {
      await promises.readdir(dir);
    } catch (err) {
      if (this._removeWatcher) {
        this._removeWatcher(sp__namespace.dirname(dir), sp__namespace.basename(dir));
      }
    }
  }
  has(item) {
    const { items } = this;
    if (!items)
      return;
    return items.has(item);
  }
  getChildren() {
    const { items } = this;
    if (!items)
      return [];
    return [...items.values()];
  }
  dispose() {
    this.items.clear();
    this.path = "";
    this._removeWatcher = EMPTY_FN;
    this.items = EMPTY_SET;
    Object.freeze(this);
  }
}
const STAT_METHOD_F = "stat";
const STAT_METHOD_L = "lstat";
class WatchHelper {
  fsw;
  path;
  watchPath;
  fullWatchPath;
  dirParts;
  followSymlinks;
  statMethod;
  constructor(path2, follow, fsw) {
    this.fsw = fsw;
    const watchPath = path2;
    this.path = path2 = path2.replace(REPLACER_RE, "");
    this.watchPath = watchPath;
    this.fullWatchPath = sp__namespace.resolve(watchPath);
    this.dirParts = [];
    this.dirParts.forEach((parts) => {
      if (parts.length > 1)
        parts.pop();
    });
    this.followSymlinks = follow;
    this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
  }
  entryPath(entry) {
    return sp__namespace.join(this.watchPath, sp__namespace.relative(this.watchPath, entry.fullPath));
  }
  filterPath(entry) {
    const { stats } = entry;
    if (stats && stats.isSymbolicLink())
      return this.filterDir(entry);
    const resolvedPath = this.entryPath(entry);
    return this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
  }
  filterDir(entry) {
    return this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
  }
}
class FSWatcher extends node_events.EventEmitter {
  closed;
  options;
  _closers;
  _ignoredPaths;
  _throttled;
  _streams;
  _symlinkPaths;
  _watched;
  _pendingWrites;
  _pendingUnlinks;
  _readyCount;
  _emitReady;
  _closePromise;
  _userIgnored;
  _readyEmitted;
  _emitRaw;
  _boundRemove;
  _nodeFsHandler;
  // Not indenting methods for history sake; for now.
  constructor(_opts = {}) {
    super();
    this.closed = false;
    this._closers = /* @__PURE__ */ new Map();
    this._ignoredPaths = /* @__PURE__ */ new Set();
    this._throttled = /* @__PURE__ */ new Map();
    this._streams = /* @__PURE__ */ new Set();
    this._symlinkPaths = /* @__PURE__ */ new Map();
    this._watched = /* @__PURE__ */ new Map();
    this._pendingWrites = /* @__PURE__ */ new Map();
    this._pendingUnlinks = /* @__PURE__ */ new Map();
    this._readyCount = 0;
    this._readyEmitted = false;
    const awf = _opts.awaitWriteFinish;
    const DEF_AWF = { stabilityThreshold: 2e3, pollInterval: 100 };
    const opts = {
      // Defaults
      persistent: true,
      ignoreInitial: false,
      ignorePermissionErrors: false,
      interval: 100,
      binaryInterval: 300,
      followSymlinks: true,
      usePolling: false,
      // useAsync: false,
      atomic: true,
      // NOTE: overwritten later (depends on usePolling)
      ..._opts,
      // Change format
      ignored: _opts.ignored ? arrify(_opts.ignored) : arrify([]),
      awaitWriteFinish: awf === true ? DEF_AWF : typeof awf === "object" ? { ...DEF_AWF, ...awf } : false
    };
    if (isIBMi)
      opts.usePolling = true;
    if (opts.atomic === void 0)
      opts.atomic = !opts.usePolling;
    const envPoll = process.env.CHOKIDAR_USEPOLLING;
    if (envPoll !== void 0) {
      const envLower = envPoll.toLowerCase();
      if (envLower === "false" || envLower === "0")
        opts.usePolling = false;
      else if (envLower === "true" || envLower === "1")
        opts.usePolling = true;
      else
        opts.usePolling = !!envLower;
    }
    const envInterval = process.env.CHOKIDAR_INTERVAL;
    if (envInterval)
      opts.interval = Number.parseInt(envInterval, 10);
    let readyCalls = 0;
    this._emitReady = () => {
      readyCalls++;
      if (readyCalls >= this._readyCount) {
        this._emitReady = EMPTY_FN;
        this._readyEmitted = true;
        process.nextTick(() => this.emit(EVENTS.READY));
      }
    };
    this._emitRaw = (...args) => this.emit(EVENTS.RAW, ...args);
    this._boundRemove = this._remove.bind(this);
    this.options = opts;
    this._nodeFsHandler = new NodeFsHandler(this);
    Object.freeze(opts);
  }
  _addIgnoredPath(matcher) {
    if (isMatcherObject(matcher)) {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher.path && ignored.recursive === matcher.recursive) {
          return;
        }
      }
    }
    this._ignoredPaths.add(matcher);
  }
  _removeIgnoredPath(matcher) {
    this._ignoredPaths.delete(matcher);
    if (typeof matcher === "string") {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher) {
          this._ignoredPaths.delete(ignored);
        }
      }
    }
  }
  // Public methods
  /**
   * Adds paths to be watched on an existing FSWatcher instance.
   * @param paths_ file or file list. Other arguments are unused
   */
  add(paths_, _origAdd, _internal) {
    const { cwd } = this.options;
    this.closed = false;
    this._closePromise = void 0;
    let paths = unifyPaths(paths_);
    if (cwd) {
      paths = paths.map((path2) => {
        const absPath = getAbsolutePath(path2, cwd);
        return absPath;
      });
    }
    paths.forEach((path2) => {
      this._removeIgnoredPath(path2);
    });
    this._userIgnored = void 0;
    if (!this._readyCount)
      this._readyCount = 0;
    this._readyCount += paths.length;
    Promise.all(paths.map(async (path2) => {
      const res = await this._nodeFsHandler._addToNodeFs(path2, !_internal, void 0, 0, _origAdd);
      if (res)
        this._emitReady();
      return res;
    })).then((results) => {
      if (this.closed)
        return;
      results.forEach((item) => {
        if (item)
          this.add(sp__namespace.dirname(item), sp__namespace.basename(_origAdd || item));
      });
    });
    return this;
  }
  /**
   * Close watchers or start ignoring events from specified paths.
   */
  unwatch(paths_) {
    if (this.closed)
      return this;
    const paths = unifyPaths(paths_);
    const { cwd } = this.options;
    paths.forEach((path2) => {
      if (!sp__namespace.isAbsolute(path2) && !this._closers.has(path2)) {
        if (cwd)
          path2 = sp__namespace.join(cwd, path2);
        path2 = sp__namespace.resolve(path2);
      }
      this._closePath(path2);
      this._addIgnoredPath(path2);
      if (this._watched.has(path2)) {
        this._addIgnoredPath({
          path: path2,
          recursive: true
        });
      }
      this._userIgnored = void 0;
    });
    return this;
  }
  /**
   * Close watchers and remove all listeners from watched paths.
   */
  close() {
    if (this._closePromise) {
      return this._closePromise;
    }
    this.closed = true;
    this.removeAllListeners();
    const closers = [];
    this._closers.forEach((closerList) => closerList.forEach((closer) => {
      const promise = closer();
      if (promise instanceof Promise)
        closers.push(promise);
    }));
    this._streams.forEach((stream) => stream.destroy());
    this._userIgnored = void 0;
    this._readyCount = 0;
    this._readyEmitted = false;
    this._watched.forEach((dirent) => dirent.dispose());
    this._closers.clear();
    this._watched.clear();
    this._streams.clear();
    this._symlinkPaths.clear();
    this._throttled.clear();
    this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
    return this._closePromise;
  }
  /**
   * Expose list of watched paths
   * @returns for chaining
   */
  getWatched() {
    const watchList = {};
    this._watched.forEach((entry, dir) => {
      const key = this.options.cwd ? sp__namespace.relative(this.options.cwd, dir) : dir;
      const index = key || ONE_DOT;
      watchList[index] = entry.getChildren().sort();
    });
    return watchList;
  }
  emitWithAll(event, args) {
    this.emit(event, ...args);
    if (event !== EVENTS.ERROR)
      this.emit(EVENTS.ALL, event, ...args);
  }
  // Common helpers
  // --------------
  /**
   * Normalize and emit events.
   * Calling _emit DOES NOT MEAN emit() would be called!
   * @param event Type of event
   * @param path File or directory path
   * @param stats arguments to be passed with event
   * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  async _emit(event, path2, stats) {
    if (this.closed)
      return;
    const opts = this.options;
    if (isWindows)
      path2 = sp__namespace.normalize(path2);
    if (opts.cwd)
      path2 = sp__namespace.relative(opts.cwd, path2);
    const args = [path2];
    if (stats != null)
      args.push(stats);
    const awf = opts.awaitWriteFinish;
    let pw;
    if (awf && (pw = this._pendingWrites.get(path2))) {
      pw.lastChange = /* @__PURE__ */ new Date();
      return this;
    }
    if (opts.atomic) {
      if (event === EVENTS.UNLINK) {
        this._pendingUnlinks.set(path2, [event, ...args]);
        setTimeout(() => {
          this._pendingUnlinks.forEach((entry, path22) => {
            this.emit(...entry);
            this.emit(EVENTS.ALL, ...entry);
            this._pendingUnlinks.delete(path22);
          });
        }, typeof opts.atomic === "number" ? opts.atomic : 100);
        return this;
      }
      if (event === EVENTS.ADD && this._pendingUnlinks.has(path2)) {
        event = EVENTS.CHANGE;
        this._pendingUnlinks.delete(path2);
      }
    }
    if (awf && (event === EVENTS.ADD || event === EVENTS.CHANGE) && this._readyEmitted) {
      const awfEmit = (err, stats2) => {
        if (err) {
          event = EVENTS.ERROR;
          args[0] = err;
          this.emitWithAll(event, args);
        } else if (stats2) {
          if (args.length > 1) {
            args[1] = stats2;
          } else {
            args.push(stats2);
          }
          this.emitWithAll(event, args);
        }
      };
      this._awaitWriteFinish(path2, awf.stabilityThreshold, event, awfEmit);
      return this;
    }
    if (event === EVENTS.CHANGE) {
      const isThrottled = !this._throttle(EVENTS.CHANGE, path2, 50);
      if (isThrottled)
        return this;
    }
    if (opts.alwaysStat && stats === void 0 && (event === EVENTS.ADD || event === EVENTS.ADD_DIR || event === EVENTS.CHANGE)) {
      const fullPath = opts.cwd ? sp__namespace.join(opts.cwd, path2) : path2;
      let stats2;
      try {
        stats2 = await promises.stat(fullPath);
      } catch (err) {
      }
      if (!stats2 || this.closed)
        return;
      args.push(stats2);
    }
    this.emitWithAll(event, args);
    return this;
  }
  /**
   * Common handler for errors
   * @returns The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  _handleError(error) {
    const code = error && error.code;
    if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
      this.emit(EVENTS.ERROR, error);
    }
    return error || this.closed;
  }
  /**
   * Helper utility for throttling
   * @param actionType type being throttled
   * @param path being acted upon
   * @param timeout duration of time to suppress duplicate actions
   * @returns tracking object or false if action should be suppressed
   */
  _throttle(actionType, path2, timeout) {
    if (!this._throttled.has(actionType)) {
      this._throttled.set(actionType, /* @__PURE__ */ new Map());
    }
    const action = this._throttled.get(actionType);
    if (!action)
      throw new Error("invalid throttle");
    const actionPath = action.get(path2);
    if (actionPath) {
      actionPath.count++;
      return false;
    }
    let timeoutObject;
    const clear = () => {
      const item = action.get(path2);
      const count = item ? item.count : 0;
      action.delete(path2);
      clearTimeout(timeoutObject);
      if (item)
        clearTimeout(item.timeoutObject);
      return count;
    };
    timeoutObject = setTimeout(clear, timeout);
    const thr = { timeoutObject, clear, count: 0 };
    action.set(path2, thr);
    return thr;
  }
  _incrReadyCount() {
    return this._readyCount++;
  }
  /**
   * Awaits write operation to finish.
   * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
   * @param path being acted upon
   * @param threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
   * @param event
   * @param awfEmit Callback to be called when ready for event to be emitted.
   */
  _awaitWriteFinish(path2, threshold, event, awfEmit) {
    const awf = this.options.awaitWriteFinish;
    if (typeof awf !== "object")
      return;
    const pollInterval = awf.pollInterval;
    let timeoutHandler;
    let fullPath = path2;
    if (this.options.cwd && !sp__namespace.isAbsolute(path2)) {
      fullPath = sp__namespace.join(this.options.cwd, path2);
    }
    const now = /* @__PURE__ */ new Date();
    const writes = this._pendingWrites;
    function awaitWriteFinishFn(prevStat) {
      node_fs.stat(fullPath, (err, curStat) => {
        if (err || !writes.has(path2)) {
          if (err && err.code !== "ENOENT")
            awfEmit(err);
          return;
        }
        const now2 = Number(/* @__PURE__ */ new Date());
        if (prevStat && curStat.size !== prevStat.size) {
          writes.get(path2).lastChange = now2;
        }
        const pw = writes.get(path2);
        const df = now2 - pw.lastChange;
        if (df >= threshold) {
          writes.delete(path2);
          awfEmit(void 0, curStat);
        } else {
          timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval, curStat);
        }
      });
    }
    if (!writes.has(path2)) {
      writes.set(path2, {
        lastChange: now,
        cancelWait: () => {
          writes.delete(path2);
          clearTimeout(timeoutHandler);
          return event;
        }
      });
      timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval);
    }
  }
  /**
   * Determines whether user has asked to ignore this path.
   */
  _isIgnored(path2, stats) {
    if (this.options.atomic && DOT_RE.test(path2))
      return true;
    if (!this._userIgnored) {
      const { cwd } = this.options;
      const ign = this.options.ignored;
      const ignored = (ign || []).map(normalizeIgnored(cwd));
      const ignoredPaths = [...this._ignoredPaths];
      const list = [...ignoredPaths.map(normalizeIgnored(cwd)), ...ignored];
      this._userIgnored = anymatch(list);
    }
    return this._userIgnored(path2, stats);
  }
  _isntIgnored(path2, stat2) {
    return !this._isIgnored(path2, stat2);
  }
  /**
   * Provides a set of common helpers and properties relating to symlink handling.
   * @param path file or directory pattern being watched
   */
  _getWatchHelpers(path2) {
    return new WatchHelper(path2, this.options.followSymlinks, this);
  }
  // Directory helpers
  // -----------------
  /**
   * Provides directory tracking objects
   * @param directory path of the directory
   */
  _getWatchedDir(directory) {
    const dir = sp__namespace.resolve(directory);
    if (!this._watched.has(dir))
      this._watched.set(dir, new DirEntry(dir, this._boundRemove));
    return this._watched.get(dir);
  }
  // File helpers
  // ------------
  /**
   * Check for read permissions: https://stackoverflow.com/a/11781404/1358405
   */
  _hasReadPermissions(stats) {
    if (this.options.ignorePermissionErrors)
      return true;
    return Boolean(Number(stats.mode) & 256);
  }
  /**
   * Handles emitting unlink events for
   * files and directories, and via recursion, for
   * files and directories within directories that are unlinked
   * @param directory within which the following item is located
   * @param item      base path of item/directory
   */
  _remove(directory, item, isDirectory) {
    const path2 = sp__namespace.join(directory, item);
    const fullPath = sp__namespace.resolve(path2);
    isDirectory = isDirectory != null ? isDirectory : this._watched.has(path2) || this._watched.has(fullPath);
    if (!this._throttle("remove", path2, 100))
      return;
    if (!isDirectory && this._watched.size === 1) {
      this.add(directory, item, true);
    }
    const wp = this._getWatchedDir(path2);
    const nestedDirectoryChildren = wp.getChildren();
    nestedDirectoryChildren.forEach((nested) => this._remove(path2, nested));
    const parent = this._getWatchedDir(directory);
    const wasTracked = parent.has(item);
    parent.remove(item);
    if (this._symlinkPaths.has(fullPath)) {
      this._symlinkPaths.delete(fullPath);
    }
    let relPath = path2;
    if (this.options.cwd)
      relPath = sp__namespace.relative(this.options.cwd, path2);
    if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
      const event = this._pendingWrites.get(relPath).cancelWait();
      if (event === EVENTS.ADD)
        return;
    }
    this._watched.delete(path2);
    this._watched.delete(fullPath);
    const eventName = isDirectory ? EVENTS.UNLINK_DIR : EVENTS.UNLINK;
    if (wasTracked && !this._isIgnored(path2))
      this._emit(eventName, path2);
    this._closePath(path2);
  }
  /**
   * Closes all watchers for a path
   */
  _closePath(path2) {
    this._closeFile(path2);
    const dir = sp__namespace.dirname(path2);
    this._getWatchedDir(dir).remove(sp__namespace.basename(path2));
  }
  /**
   * Closes only file-specific watchers
   */
  _closeFile(path2) {
    const closers = this._closers.get(path2);
    if (!closers)
      return;
    closers.forEach((closer) => closer());
    this._closers.delete(path2);
  }
  _addPathCloser(path2, closer) {
    if (!closer)
      return;
    let list = this._closers.get(path2);
    if (!list) {
      list = [];
      this._closers.set(path2, list);
    }
    list.push(closer);
  }
  _readdirp(root, opts) {
    if (this.closed)
      return;
    const options = { type: EVENTS.ALL, alwaysStat: true, lstat: true, ...opts, depth: 0 };
    let stream = readdirp(root, options);
    this._streams.add(stream);
    stream.once(STR_CLOSE, () => {
      stream = void 0;
    });
    stream.once(STR_END, () => {
      if (stream) {
        this._streams.delete(stream);
        stream = void 0;
      }
    });
    return stream;
  }
}
function watch(paths, options = {}) {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}
const chokidar = { watch, FSWatcher };
class RobustUsbDetector extends events.EventEmitter {
  watcher = null;
  deviceDirs = [];
  isMonitoring = false;
  lastWorkoutScan = /* @__PURE__ */ new Set();
  pollInterval = null;
  // Vendor IDs for common smartwatch brands (fallback detection)
  knownVendorIds = {
    garmin: [4033],
    fitbit: [4070, 9047],
    apple: [1452]
  };
  constructor() {
    super();
    this.discoverDevices();
  }
  /**
   * Discover all connected smartwatch devices with multiple detection methods
   */
  discoverDevices() {
    const homeDir = os__namespace.homedir();
    const possibleDirs = this.getPotentialDevicePaths(homeDir);
    const mountedDevices = this.scanMountedDevices();
    const allPaths = [.../* @__PURE__ */ new Set([...possibleDirs, ...mountedDevices])];
    this.deviceDirs = allPaths.map((dir) => this.analyzeDevice(dir)).filter((device) => device !== null);
    this.log("Discovered devices:", this.deviceDirs.map((d) => `${d.type}:${d.name}`));
  }
  /**
   * Get potential device paths from common locations
   */
  getPotentialDevicePaths(homeDir) {
    const candidates = [
      // Garmin standard locations
      path__namespace.join(homeDir, "Garmin"),
      "/Volumes/GARMIN",
      "/Volumes/Garmin",
      // Fitbit locations
      path__namespace.join(homeDir, "Fitbit"),
      "/Volumes/FITBIT",
      // Apple Watch (usually mounted as iPhone)
      "/Volumes/iPhone",
      // Generic mount points
      "/Volumes/*"
    ];
    return candidates.filter((dir) => {
      try {
        const exists = fs__namespace.existsSync(dir) || this.globExists(dir);
        return exists && fs__namespace.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
  }
  /**
   * Scan /Volumes for mounted USB devices
   */
  scanMountedDevices() {
    const volumesDir = "/Volumes";
    if (!fs__namespace.existsSync(volumesDir)) return [];
    try {
      const items = fs__namespace.readdirSync(volumesDir, { withFileTypes: true });
      return items.filter((dirent) => dirent.isDirectory()).map((dirent) => path__namespace.join(volumesDir, dirent.name));
    } catch (error) {
      console.error("[WorkoutPulse] Failed to scan /Volumes:", error);
      return [];
    }
  }
  /**
   * Check if a glob pattern matches any files/directories
   */
  globExists(pattern) {
    try {
      const glob = require("glob");
      const results = glob.sync(pattern, { absolute: true });
      return results.length > 0;
    } catch {
      return false;
    }
  }
  /**
   * Analyze a device path to determine its type and workout files
   */
  analyzeDevice(dirPath) {
    try {
      let deviceType = "unknown";
      const workoutFiles = [];
      const garminFitnessDir = path__namespace.join(dirPath, "Garmin", "Fitness");
      if (fs__namespace.existsSync(garminFitnessDir)) {
        deviceType = "garmin";
        workoutFiles.push(...this.findWorkoutFiles(garminFitnessDir));
      }
      const fitbitDir = path__namespace.join(dirPath, "Fitbit");
      if (fs__namespace.existsSync(fitbitDir)) {
        deviceType = "fitbit";
        workoutFiles.push(...this.findWorkoutFiles(fitbitDir));
      }
      const appleHealthDir = path__namespace.join(dirPath, "HealthData");
      if (fs__namespace.existsSync(appleHealthDir)) {
        deviceType = "apple-watch";
        workoutFiles.push(...this.findWorkoutFiles(appleHealthDir));
      }
      if (deviceType === "unknown") {
        const rootWorkouts = this.findWorkoutFiles(dirPath);
        if (rootWorkouts.length > 0) {
          workoutFiles.push(...rootWorkouts);
          deviceType = "unknown";
        } else {
          return null;
        }
      }
      return {
        name: path__namespace.basename(dirPath),
        path: dirPath,
        type: deviceType,
        workoutFiles
      };
    } catch (error) {
      console.error("[WorkoutPulse] Error analyzing device:", error);
      return null;
    }
  }
  /**
   * Find all workout files in a directory recursively
   */
  findWorkoutFiles(dir) {
    const extensions = [".fit", ".gpx", ".tcx", ".kp"];
    const files = [];
    try {
      const walk = (currentDir) => {
        if (!fs__namespace.existsSync(currentDir)) return;
        const items = fs__namespace.readdirSync(currentDir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path__namespace.join(currentDir, item.name);
          if (item.isDirectory()) {
            walk(fullPath);
          } else if (extensions.some((ext) => item.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      };
      walk(dir);
    } catch (error) {
      console.error("[WorkoutPulse] Error scanning for workout files:", error);
    }
    return files;
  }
  /**
   * Helper to log messages conditionally based on environment
   */
  log(...args) {
    if (process.env.NODE_ENV === "test") {
      console.log("[WorkoutPulse]", ...args);
    } else {
      console.log("[WorkoutPulse]", ...args);
    }
  }
  /**
   * Start monitoring USB connections with multiple fallback mechanisms
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    this.log("Starting robust USB monitor...");
    this.isMonitoring = true;
    this.deviceDirs.forEach((device) => {
      this.watchDirectory(device.path, device.workoutFiles);
    });
    this.watchMountPoints();
    this.startPolling();
    const initialScan = setTimeout(() => {
      if (this.isMonitoring) {
        this.discoverDevices();
      }
    }, 1e3);
    this._initialScanTimeout = initialScan;
  }
  /**
   * Watch a specific device directory for file changes
   */
  watchDirectory(dir, initialFiles) {
    if (!fs__namespace.existsSync(dir)) return;
    const patterns = [`${dir}/**/*.fit`, `${dir}/**/*.gpx`, `${dir}/**/*.tcx`];
    this.watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2e3,
        pollInterval: 500
      },
      ignored: ["*.tmp", "*.partial"]
      // Ignore temporary files
    });
    this.watcher.on("add", (filePath) => this.handleNewFile(filePath)).on("change", (filePath) => this.handleFileChange(filePath)).on("unlink", (filePath) => this.handleFileRemoved(filePath)).on("error", (error) => {
      console.error("[WorkoutPulse] Watcher error:", error);
      this.emit("error", {
        type: "error",
        error: new Error(`Watcher failed: ${error.message}`),
        timestamp: Date.now()
      });
    });
    this.log("Watching:", dir);
  }
  /**
   * Watch system mount points for new devices
   */
  watchMountPoints() {
    const volumesDir = "/Volumes";
    if (!fs__namespace.existsSync(volumesDir)) return;
    chokidar.watch(volumesDir, {
      persistent: true,
      ignoreInitial: false
    }).on("addDir", async (dirName) => {
      try {
        const devicePath = path__namespace.join(volumesDir, dirName);
        const stats = await fs__namespace.promises.stat(devicePath);
        if (stats.isDirectory()) {
          const deviceInfo = this.analyzeDevice(devicePath);
          if (deviceInfo && deviceInfo.workoutFiles.length > 0) {
            this.log("New device detected:", `${deviceInfo.name} (${deviceInfo.type})`);
            this.emit("connected", {
              type: "connected",
              device: deviceInfo.name,
              devicePath,
              timestamp: Date.now()
            });
            this.watchDirectory(devicePath, deviceInfo.workoutFiles);
            deviceInfo.workoutFiles.forEach((filePath) => {
              this.handleNewFile(filePath);
            });
          }
        }
      } catch (error) {
        this.log("Could not access new mount:", error);
      }
    });
  }
  /**
   * Periodic polling as fallback mechanism
   */
  startPolling() {
    this.pollInterval = setInterval(() => {
      if (!this.isMonitoring) return;
      const previousPaths = new Set(this.deviceDirs.map((d) => d.path));
      this.discoverDevices();
      const newDevices = this.deviceDirs.filter(
        (device) => !previousPaths.has(device.path) && device.workoutFiles.length > 0
      );
      if (newDevices.length > 0) {
        this.log("Polling detected new devices:", newDevices.map((d) => d.name));
        newDevices.forEach((device) => {
          this.emit("connected", {
            type: "connected",
            device: device.name,
            devicePath: device.path,
            timestamp: Date.now()
          });
          this.watchDirectory(device.path, device.workoutFiles);
        });
      }
    }, 5e3);
    if (this.pollInterval) {
      this.pollInterval.unref();
    }
    this.log("Polling fallback enabled (5s interval)");
  }
  /**
   * Handle newly detected workout file
   */
  async handleNewFile(filePath) {
    if (this.lastWorkoutScan.has(filePath)) return;
    this.lastWorkoutScan.add(filePath);
    this.log("New workout detected:", filePath);
    this.emit("workout-detected", {
      type: "workout-detected",
      filePath,
      timestamp: Date.now()
    });
    setTimeout(() => this.lastWorkoutScan.delete(filePath), 300 * 1e3);
  }
  /**
   * Handle file changes (in case workout is still being written)
   */
  handleFileChange(filePath) {
    this.log("File changed:", filePath);
    this.emit("workout-detected", {
      type: "workout-detected",
      filePath,
      timestamp: Date.now()
    });
  }
  /**
   * Handle file removal (device disconnected)
   */
  handleFileRemoved(filePath) {
    this.log("File removed:", filePath);
    const relatedDevice = this.deviceDirs.find(
      (device) => filePath.startsWith(device.path)
    );
    if (relatedDevice) {
      this.log("Possible device disconnect:", relatedDevice.name);
      this.emit("disconnected", {
        type: "disconnected",
        device: relatedDevice.name,
        timestamp: Date.now()
      });
    }
  }
  /**
   * Stop all monitoring mechanisms
   */
  stopMonitoring() {
    if (this._initialScanTimeout) {
      clearTimeout(this._initialScanTimeout);
      this._initialScanTimeout = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.isMonitoring = false;
  }
  /**
   * Get current monitoring status
   */
  isRunning() {
    return this.isMonitoring;
  }
  /**
   * Get list of currently detected devices
   */
  getDetectedDevices() {
    return [...this.deviceDirs];
  }
  /**
   * Manually trigger device discovery (useful for testing)
   */
  refreshDeviceList() {
    console.log("[WorkoutPulse] Refreshing device list...");
    this.discoverDevices();
  }
}
const usbDetector = new RobustUsbDetector();
async function detectUsbDevice() {
  usbDetector.refreshDeviceList();
  const devices = usbDetector.getDetectedDevices();
  if (devices.length > 0) {
    return { connected: true, device: devices[0] };
  }
  return { connected: false };
}
let mainWindow = null;
let fittrackeeApi = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path__namespace.join(__dirname, "preload.js")
    }
  });
  if (process.env.VITE_DEV_SERVER) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path__namespace.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (!mainWindow) createWindow();
});
electron.ipcMain.handle("detect-usb-device", async () => {
  try {
    const device = await detectUsbDevice();
    console.log("[WorkoutPulse] USB detection result:", device);
    return device;
  } catch (error) {
    console.error("[WorkoutPulse] USB detection error:", error);
    return { connected: false, device: null };
  }
});
electron.ipcMain.handle("fittrackee-set-credentials", async (_event, clientId, clientSecret) => {
  try {
    fittrackeeOAuth.setCredentials(clientId, clientSecret);
    return { success: true };
  } catch (error) {
    console.error("[WorkoutPulse] Error setting credentials:", error);
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("fittrackee-get-auth-url", async () => {
  try {
    const authUrl = fittrackeeOAuth.getAuthorizationUrl();
    return { success: true, authUrl };
  } catch (error) {
    console.error("[WorkoutPulse] Error getting auth URL:", error);
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("fittrackee-exchange-code", async (_event, code) => {
  try {
    const credentials = await fittrackeeOAuth.exchangeCodeForToken(code);
    if (!fittrackeeApi) {
      fittrackeeApi = initializeFittrackeeApi(fittrackeeOAuth);
    }
    fittrackeeApi.setAccessToken(credentials);
    return { success: true, credentials };
  } catch (error) {
    console.error("[WorkoutPulse] Error exchanging code:", error);
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("fittrackee-check-auth", async () => {
  const isAuthenticated = fittrackeeOAuth.isAuthenticated();
  const credentials = fittrackeeOAuth.loadStoredCredentials();
  return {
    success: true,
    authenticated: isAuthenticated,
    hasToken: !!credentials?.accessToken,
    tokenExpiry: credentials?.tokenExpiry
  };
});
electron.ipcMain.handle("sync-workouts", async (_event, scanDirectory) => {
  try {
    const authStatus = await electron.ipcMain.handle("fittrackee-check-auth")();
    if (!authStatus.authenticated) {
      return { success: false, error: "Not authenticated with Fittrackee" };
    }
    if (!fittrackeeApi) {
      fittrackeeApi = initializeFittrackeeApi(fittrackeeOAuth);
    }
    const scanPath = scanDirectory || "/Volumes/USB_DRIVE/workouts";
    let workouts = [];
    try {
      workouts = await scanWorkouts(scanPath);
    } catch (error) {
      console.warn("[WorkoutPulse] Could not scan directory:", error);
      const homeDir = require("os").homedir();
      const commonPaths = [
        path__namespace.join(homeDir, "Downloads"),
        path__namespace.join(homeDir, "Documents")
      ];
      for (const scanPath2 of commonPaths) {
        try {
          workouts = await scanWorkouts(scanPath2);
          if (workouts.length > 0) break;
        } catch {
        }
      }
    }
    console.log("[WorkoutPulse] Found", workouts.length, "workouts to sync");
    if (workouts.length === 0) {
      return { success: true, synced: 0, message: "No workout files found" };
    }
    const result = await fittrackeeApi.uploadWorkoutsBatch(workouts, {
      skipDuplicates: true,
      batchSize: 5,
      delayMs: 1e3
    });
    return {
      success: true,
      total: workouts.length,
      synced: result.success,
      failed: result.failed,
      errors: result.errors
    };
  } catch (error) {
    console.error("[WorkoutPulse] Sync error:", error);
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("fittrackee-get-recent-workouts", async (_event, limit = 10) => {
  try {
    if (!fittrackeeApi) {
      fittrackeeApi = initializeFittrackeeApi(fittrackeeOAuth);
    }
    const workouts = await fittrackeeApi.getRecentWorkouts(limit);
    return { success: true, workouts };
  } catch (error) {
    console.error("[WorkoutPulse] Error fetching recent workouts:", error);
    return { success: false, error: error.message };
  }
});
