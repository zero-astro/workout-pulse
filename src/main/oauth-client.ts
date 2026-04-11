import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { credentialsManager } from './credentials-manager'
import { logger } from './logger'


export interface OAuthCredentials {
  clientId: string
  clientSecret: string
  accessToken?: string
  refreshToken?: string
  tokenExpiry?: number
}

export interface OAuthEvent {
  type: 'authorized' | 'token-exchanged' | 'error' | 'expired'
  credentials?: OAuthCredentials
  error?: Error
  timestamp: number
}

export class FittrackeeOAuthClient extends EventEmitter {
  private clientId: string = ''
  private clientSecret: string = ''
  private redirectUri: string = 'http://localhost:3456/callback'
  private state: string = ''
  private server: any // Electron net module or http server

  // OAuth endpoints - configurable for self-hosted FitTrackee instances
  constructor(baseApiUrl?: string) {
    super()
    
    // Use provided base URL or default to cloud instance
    this.baseApiUrl = baseApiUrl || 'https://api.fittrackee.org'
    this.authUrl = `${this.baseApiUrl}/oauth/authorize`
    this.tokenUrl = `${this.baseApiUrl}/oauth/token`

  // Storage paths
  private credentialsPath: string = ''

  constructor() {
    super()

    // Initialize storage path
    if (app) {
      this.credentialsPath = path.join(
        app.getPath('userData'),
        'fittrackee_credentials.json'
      )
    } else {
      // Fallback for testing without Electron
      this.credentialsPath = path.join(os.homedir(), '.workout-pulse', 'credentials.json')
    }

    // Ensure directory exists
    const dir = path.dirname(this.credentialsPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * Set OAuth credentials from environment or config with validation and secure storage
   */
  async setCredentials(clientId: string, clientSecret: string): Promise<void> {
    // Validate credential format before storing
    try {
      credentialsManager.validateCredentials(clientId, clientSecret)
    } catch (error) {
      console.error('[OAuthClient] Invalid credentials:', error.message)
      throw error
    }

    this.clientId = clientId
    this.clientSecret = clientSecret
    
    // Store credentials securely using CredentialsManager
    try {
      await credentialsManager.storeOAuthCredentials(clientId, clientSecret)
      logger.info('OAuthClient', 'OAuth credentials configured and stored securely')
    } catch (error) {
      logger.error('OAuthClient', 'Failed to store credentials', { error: error.message })
      throw new Error('Failed to store OAuth credentials securely')
    }
  }

  /**
   * Load stored OAuth credentials from secure storage
   */
  async loadStoredCredentials(): Promise<OAuthCredentials | null> {
    try {
      // Use centralized CredentialsManager for loading client credentials
      const stored = await credentialsManager.getOAuthCredentials()

      if (!stored) {
        logger.warn('OAuthClient', 'No OAuth credentials found - check .env file')
        return null
      }

      // Validate that we have both required fields
      if (!stored.clientId || !stored.clientSecret) {
        logger.error('OAuthClient', 'Invalid credentials structure: missing clientId or clientSecret')
        return null
      }

      const credentials: OAuthCredentials = {
        clientId: stored.clientId,
        clientSecret: stored.clientSecret
      }

      logger.info('OAuthClient', `✓ Loaded OAuth credentials (clientId: ${stored.clientId.substring(0, 4)}...)`)
      return credentials
    } catch (error) {
      logger.error('OAuthClient', 'Error loading credentials', { error: error.message })
      return null
    }
  }

  /**
   * Load access tokens from secure storage
   */
  async loadAccessTokens(): Promise<{ accessToken?: string; refreshToken?: string; tokenExpiry?: number } | null> {
    try {
      if (!fs.existsSync(this.credentialsPath.replace('.json', '_tokens.json'))) {
        return null
      }

      const data = fs.readFileSync(this.credentialsPath.replace('.json', '_tokens.json'), 'utf8')
      return JSON.parse(data)
    } catch (error) {
      logger.error('OAuthClient', 'Error loading access tokens', { error: error.message })
      return null
    }
  }

  /**
   * Save access token and refresh token to secure storage
   */
  async saveCredentials(credentials: OAuthCredentials): Promise<void> {
    try {
      // Store access tokens separately from client credentials
      // In production, use electron-store with encryption or native keychain
      const tokenData = {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        tokenExpiry: credentials.tokenExpiry
      }

      // Write to secure location (owner-only permissions)
      fs.writeFileSync(
        this.credentialsPath.replace('.json', '_tokens.json'),
        JSON.stringify(tokenData, null, 2),
        { mode: 0o600 }
      )

      logger.info('OAuthClient', 'Access tokens saved securely')
    } catch (error) {
      logger.error('OAuthClient', 'Error saving credentials', { error: error.message })
      throw new Error('Failed to save access tokens securely')
    }
  }

  /**
   * Remove stored credentials and tokens (for logout)
   */
  async removeStoredCredentials(): Promise<void> {
    try {
      // Remove OAuth client credentials
      await credentialsManager.removeOAuthCredentials()

      // Remove access token file
      const tokenPath = this.credentialsPath.replace('.json', '_tokens.json')
      if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath)
      }

      logger.info('OAuthClient', 'All credentials removed securely')
    } catch (error) {
      logger.error('OAuthClient', 'Error removing credentials', { error: error.message })
      throw new Error('Failed to remove all credentials')
    }
  }

  /**
   * Generate authorization form data for POST request to FitTrackee
   * Note: FitTrackee requires a POST request, not GET like standard OAuth2
   */
  getAuthorizationFormData(): { url: string; formData: URLSearchParams } {
    // Generate cryptographically secure random state
    this.state = crypto.randomBytes(32).toString('hex')

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scopes: 'workouts:read workouts:write', // FitTrackee uses 'scopes' not 'scope'
      confirm: 'true',
      state: this.state,
      redirect_uri: this.redirectUri
    })

    const url = `${this.authUrl}`

    logger.info('OAuthClient', `Authorization form prepared for ${url}`)
    return { url, formData: params }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthCredentials> {
    try {
      // In production, use Electron's net module or https
      const response = await this.makeTokenRequest({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri
      })

      const tokens = JSON.parse(response)

      const credentials: OAuthCredentials = {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: Date.now() + (tokens.expires_in * 1000) // Convert to milliseconds
      }

      // Save credentials securely
      this.saveCredentials(credentials)

      console.log('[WorkoutPulse] Token exchanged successfully')

      this.emit('token-exchanged', {
        type: 'token-exchanged' as const,
        credentials,
        timestamp: Date.now()
      })

      return credentials

    } catch (error) {
      console.error('[WorkoutPulse] Error exchanging code for token:', error)
      throw new Error(`Token exchange failed: ${error.message}`)
    }
  }

  /**
   * Refresh expired access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthCredentials> {
    try {
      const response = await this.makeTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret
      })

      const tokens = JSON.parse(response)

      // Load existing credentials to preserve client ID/secret
      const storedCreds = this.loadStoredCredentials() || {
        clientId: this.clientId,
        clientSecret: this.clientSecret
      }

      const newCredentials: OAuthCredentials = {
        ...storedCreds,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || refreshToken, // Keep old refresh token if not provided
        tokenExpiry: Date.now() + (tokens.expires_in * 1000)
      }

      this.saveCredentials(newCredentials)

      console.log('[WorkoutPulse] Token refreshed successfully')

      return newCredentials

    } catch (error) {
      console.error('[WorkoutPulse] Error refreshing token:', error)
      throw new Error(`Token refresh failed: ${error.message}`)
    }
  }

  /**
   * Make HTTP request to OAuth server
   */
  private async makeTokenRequest(params: Record<string, string>): Promise<string> {
    // In production with Electron, use electron/net module
    // For now, this is a placeholder that would be replaced with actual implementation

    const formData = new URLSearchParams(params).toString()

    // This would be replaced with actual HTTP request in Electron environment
    console.log('[WorkoutPulse] Would make token request to:', this.tokenUrl)
    console.log('[WorkoutPulse] Request params:', Object.keys(params))

    // Mock response for development (remove in production)
    return JSON.stringify({
      access_token: 'mock_access_token_' + Date.now(),
      refresh_token: 'mock_refresh_token_' + Date.now(),
      expires_in: 3600,
      token_type: 'Bearer'
    })

    // Production implementation would look like:
    /*
    const { net } = require('electron')
    const request = net.request({
      url: this.tokenUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: Buffer.from(formData)
    })

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []

      request.on('response', (response) => {
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve(Buffer.concat(chunks).toString()))
      })

      request.on('error', (err) => reject(err))
      request.end()
    })
    */
  }

  /**
   * Validate current access token
   */
  async validateToken(): Promise<boolean> {
    const credentials = this.loadStoredCredentials()

    if (!credentials || !credentials.accessToken) {
      console.log('[WorkoutPulse] No access token found')
      return false
    }

    // Check expiry
    if (credentials.tokenExpiry && Date.now() > credentials.tokenExpiry) {
      console.log('[WorkoutPulse] Access token expired')
      return false
    }

    // Optionally validate by making a test API call
    try {
      const isValid = await this.testApiConnection(credentials.accessToken)

      if (!isValid) {
        console.log('[WorkoutPulse] Token validation failed, attempting refresh')

        // Try to refresh the token
        if (credentials.refreshToken) {
          await this.refreshToken(credentials.refreshToken)
          return true
        }
      }

      return isValid

    } catch (error) {
      console.error('[WorkoutPulse] Token validation error:', error)
      return false
    }
  }

  /**
   * Test API connection with provided token
   */
  private async testApiConnection(token: string): Promise<boolean> {
    // This would make a real API call to validate the token
    console.log('[WorkoutPulse] Testing API connection with token')

    // Mock validation for development
    return true

    /*
    const response = await fetch('https://api.fittrackee.org/api/user/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    return response.ok
    */
  }



  /**
   * Get current authorization state
   */
  getState(): string {
    return this.state
  }

  /**
   * Clear stored state (after callback)
   */
  clearState(): void {
    this.state = ''
  }

  /**
   * Check if user is authorized
   */
  isAuthenticated(): boolean {
    // First check client credentials (clientId/clientSecret)
    const clientCreds = this.loadStoredCredentials()
    if (!clientCreds || !clientCreds.clientId) {
      return false
    }
    
    // Then check access tokens from separate file
    const accessTokens = this.loadAccessTokens()
    if (accessTokens && accessTokens.accessToken) {
      // Check if token is expired
      if (accessTokens.tokenExpiry && Date.now() > accessTokens.tokenExpiry) {
        console.log('[OAuthClient] Access token expired')
        return false
      }
      return true
    }
    
    return false
  }
}

// Export singleton instance
export const fittrackeeOAuth = new FittrackeeOAuthClient()
