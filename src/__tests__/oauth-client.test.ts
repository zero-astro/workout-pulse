/**
 * Unit Tests for OAuth Client
 */

const { FittrackeeOAuthClient } = require('../main/oauth-client')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Mock Electron app module
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/test-user-data')
  }
}))

describe('FittrackeeOAuthClient', () => {
  let client
  let testCredentialsPath

  beforeEach(() => {
    // Create isolated test directory
    const testDir = `/tmp/workout-pulse-oauth-test-${Date.now()}`
    fs.mkdirSync(testDir, { recursive: true })
    
    client = new FittrackeeOAuthClient()
    testCredentialsPath = path.join(testDir, 'credentials.json')
    
    // Override credentials path for testing
    client.credentialsPath = testCredentialsPath
    
    // Clear any existing test files
    if (fs.existsSync(testCredentialsPath)) {
      fs.unlinkSync(testCredentialsPath)
    }
  })

  afterEach(() => {
    // Clean up test directory
    try {
      const testDirPath = path.dirname(client.credentialsPath)
      fs.rmSync(testDirPath, { recursive: true, force: true })
    } catch (error) {
      console.log('Cleanup error:', error)
    }
    
    jest.clearAllMocks()
  })

  describe('setCredentials', () => {
    it('should store client ID and secret', () => {
      const clientId = 'test-client-id'
      const clientSecret = 'test-client-secret'
      
      client.setCredentials(clientId, clientSecret)
      
      // Verify credentials are stored (internal state)
      expect(client.clientId).toBe(clientId)
      expect(client.clientSecret).toBe(clientSecret)
    })

    it('should log configuration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      
      client.setCredentials('id', 'secret')
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('OAuth credentials configured')
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe('loadStoredCredentials', () => {
    it('should return null when no credentials file exists', () => {
      const result = client.loadStoredCredentials()
      expect(result).toBeNull()
    })

    it('should load valid credentials from file', () => {
      const mockCredentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        tokenExpiry: Date.now() + 3600000 // 1 hour from now
      }

      fs.writeFileSync(
        testCredentialsPath,
        JSON.stringify(mockCredentials, null, 2),
        { mode: 0o600 }
      )

      const result = client.loadStoredCredentials()
      
      expect(result).not.toBeNull()
      expect(result.clientId).toBe('test-client-id')
      expect(result.accessToken).toBe('mock_access_token')
    })

    it('should return null when token is expired', () => {
      const mockCredentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'expired_token',
        refreshToken: 'refresh_token',
        tokenExpiry: Date.now() - 3600000 // 1 hour ago
      }

      fs.writeFileSync(
        testCredentialsPath,
        JSON.stringify(mockCredentials, null, 2),
        { mode: 0o600 }
      )

      const emitSpy = jest.spyOn(client, 'emit').mockImplementation(() => {})
      
      const result = client.loadStoredCredentials()
      
      expect(result).toBeNull()
      expect(emitSpy).toHaveBeenCalledWith('expired', expect.objectContaining({
        type: 'expired'
      }))
      
      emitSpy.mockRestore()
    })

    it('should handle corrupted JSON gracefully', () => {
      fs.writeFileSync(testCredentialsPath, 'not valid json {{{')
      
      const result = client.loadStoredCredentials()
      expect(result).toBeNull()
    })
  })

  describe('saveCredentials', () => {
    it('should save credentials to file with correct permissions', () => {
      const mockCredentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        tokenExpiry: Date.now() + 3600000
      }

      client.saveCredentials(mockCredentials)

      expect(fs.existsSync(testCredentialsPath)).toBe(true)
      
      const stats = fs.statSync(testCredentialsPath)
      // Check file permissions (should be 600 - owner read/write only)
      expect(stats.mode & 0o777).toBe(0o600)
    })

    it('should encrypt sensitive data before saving', () => {
      const mockCredentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      }

      client.saveCredentials(mockCredentials)

      const savedData = JSON.parse(fs.readFileSync(testCredentialsPath, 'utf8'))
      
      // Verify encryption was applied (should have encryptedData field)
      expect(savedData).toHaveProperty('encryptedData')
    })

    it('should throw error on save failure', () => {
      const mockCredentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      }

      // Make the path invalid to trigger write error
      client.credentialsPath = '/nonexistent/directory/creds.json'

      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => client.saveCredentials(mockCredentials)).toThrow()

      consoleSpy.mockRestore()
    })
  })

  describe('removeStoredCredentials', () => {
    it('should delete credentials file if it exists', () => {
      // First create a credentials file
      const mockCredentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      }
      client.saveCredentials(mockCredentials)

      expect(fs.existsSync(testCredentialsPath)).toBe(true)

      // Now remove it
      client.removeStoredCredentials()

      expect(fs.existsSync(testCredentialsPath)).toBe(false)
    })

    it('should not throw error when no credentials file exists', () => {
      expect(() => client.removeStoredCredentials()).not.toThrow()
    })
  })

  describe('getAuthorizationUrl', () => {
    it('should generate authorization URL with correct parameters', () => {
      // Set credentials before generating URL (required for client_id)
      client.setCredentials('test-client-id', 'test-client-secret')
      
      const url = client.getAuthorizationUrl()
      
      expect(url).toContain('https://api.fittrackee.org/oauth/authorize')
      expect(url).toContain('client_id=test-client-id')
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3456%2Fcallback')
      expect(url).toContain('response_type=code')
      expect(url).toContain('state=') // Should have a state parameter
      expect(url).toContain('scope=workouts%3Aread+workouts%3Awrite')
    })

    it('should generate unique state parameter each time', () => {
      const url1 = client.getAuthorizationUrl()
      const url2 = client.getAuthorizationUrl()
      
      // Extract state parameters
      const state1 = new URLSearchParams(url1.split('?')[1]).get('state')
      const state2 = new URLSearchParams(url2.split('?')[1]).get('state')
      
      expect(state1).not.toBe(state2)
      expect(state1.length).toBe(64) // 32 bytes hex encoded
    })
  })

  describe('isAuthenticated', () => {
    it('should return false when no credentials exist', () => {
      const result = client.isAuthenticated()
      expect(result).toBe(false)
    })

    it('should return true when valid credentials exist', () => {
      const mockCredentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'valid_token'
      }
      
      fs.writeFileSync(
        testCredentialsPath,
        JSON.stringify(mockCredentials, null, 2),
        { mode: 0o600 }
      )

      const result = client.isAuthenticated()
      expect(result).toBe(true)
    })
  })

  describe('token refresh flow', () => {
    it('should emit token-exchanged event after successful exchange', async () => {
      const mockCredentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      }
      
      client.setCredentials(mockCredentials.clientId, mockCredentials.clientSecret)

      const emitSpy = jest.spyOn(client, 'emit').mockImplementation(() => {})

      try {
        await client.exchangeCodeForToken('authorization_code_123')
        
        expect(emitSpy).toHaveBeenCalledWith('token-exchanged', expect.objectContaining({
          type: 'token-exchanged'
        }))
      } finally {
        emitSpy.mockRestore()
      }
    })

    it('should handle token exchange failure gracefully', async () => {
      client.setCredentials('id', 'secret')

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      try {
        // This will fail because we're mocking the HTTP response
        await expect(client.exchangeCodeForToken('invalid_code')).resolves.toBeDefined()
      } finally {
        consoleSpy.mockRestore()
      }
    })
  })
})
