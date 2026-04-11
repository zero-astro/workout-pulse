import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as dotenv from 'dotenv'
import { logger } from './logger'

// Encryption configuration
const ALGORITHM = 'aes-256-cbc'
const ENCRYPTION_KEY_LENGTH = 32 // bytes for AES-256
const IV_LENGTH = 16 // bytes for CBC mode
const SALT_LENGTH = 16
const ITERATIONS = 100000

// Environment variable for master key (optional, falls back to system key)
const MASTER_KEY_ENV = 'WORKOUT_PULSE_MASTER_KEY'

interface EncryptedCredentials {
  encryptedData: string
  iv: string
  salt: string
  iterations: number
}

export class CredentialsManager {
  private credentialsPath: string
  private masterKey: Buffer | null = null
  
  constructor() {
    // Initialize credentials storage path
    const appDataDir = path.join(os.homedir(), '.workout-pulse')
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true })
    }
    
    this.credentialsPath = path.join(appDataDir, 'credentials.json.enc')
  }

  /**
   * Generate a system-specific key from environment or create one
   */
  private async getMasterKey(): Promise<Buffer> {
    // Check for master key in environment variable (highest security)
    if (process.env[MASTER_KEY_ENV]) {
      const key = Buffer.from(process.env[MASTER_KEY_ENV], 'hex')
      if (key.length === ENCRYPTION_KEY_LENGTH) {
        return key
      }
    }

    // Generate a system-specific key from hostname + user info
    // This is less secure than environment variable but better than hardcoded keys
    const systemInfo = `${os.hostname()}:${os.userInfo().uid}`
    const hash = crypto.createHash('sha256').update(systemInfo).digest()
    
    return Buffer.from(hash.slice(0, ENCRYPTION_KEY_LENGTH))
  }

  /**
   * Encrypt sensitive data using AES-256-CBC
   */
  private async encrypt(data: string): Promise<EncryptedCredentials> {
    const key = await this.getMasterKey()
    
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH)
    const iv = crypto.randomBytes(IV_LENGTH)
    
    // Derive encryption key from master key + salt
    const derivedKey = crypto.pbkdf2Sync(key, salt, ITERATIONS, ENCRYPTION_KEY_LENGTH, 'sha256')
    
    // Create cipher and encrypt data
    const cipher = crypto.createCipher(ALGORITHM, derivedKey)
    cipher.setAutoPadding(true)
    
    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      iterations: ITERATIONS
    }
  }

  /**
   * Decrypt data using AES-256-CBC
   */
  private async decrypt(encrypted: EncryptedCredentials): Promise<string> {
    const key = await this.getMasterKey()
    
    // Parse hex values
    const salt = Buffer.from(encrypted.salt, 'hex')
    const iv = Buffer.from(encrypted.iv, 'hex')
    
    // Derive encryption key from master key + salt
    const derivedKey = crypto.pbkdf2Sync(key, salt, encrypted.iterations, ENCRYPTION_KEY_LENGTH, 'sha256')
    
    // Create decipher and decrypt data
    const decipher = crypto.createDecipher(ALGORITHM, derivedKey)
    decipher.setAutoPadding(true)
    
    let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  /**
   * Store OAuth credentials securely
   */
  async storeOAuthCredentials(clientId: string, clientSecret: string): Promise<void> {
    try {
      const credentials = JSON.stringify({ clientId, clientSecret })
      const encrypted = await this.encrypt(credentials)
      
      // Write with secure permissions (owner read/write only)
      fs.writeFileSync(
        this.credentialsPath,
        JSON.stringify(encrypted),
        { mode: 0o600 }
      )
      
      logger.info('CredentialsManager', 'OAuth credentials stored securely')
    } catch (error) {
      logger.error('CredentialsManager', 'Error storing credentials', { error: error.message })
      throw new Error('Failed to store credentials securely')
    }
  }

  /**
   * Retrieve stored OAuth credentials from .env or encrypted storage
   */
  async getOAuthCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
    // First, try to load from .env file (highest priority for development)
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath })
      
      const clientId = process.env.FITTRACKEE_CLIENT_ID
      const clientSecret = process.env.FITTRACKEE_CLIENT_SECRET
      
      if (clientId && clientSecret) {
        logger.info('CredentialsManager', 'Loaded OAuth credentials from .env file')
        return { clientId, clientSecret }
      }
    }

    // Fall back to encrypted storage
    try {
      if (!fs.existsSync(this.credentialsPath)) {
        return null
      }

      const encryptedData = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'))
      const decrypted = await this.decrypt(encryptedData)
      
      return JSON.parse(decrypted)
    } catch (error) {
      logger.error('CredentialsManager', 'Error retrieving credentials', { error: error.message })
      // Return null on any decryption error (credentials may be corrupted)
      return null
    }
  }

  /**
   * Remove stored credentials
   */
  async removeOAuthCredentials(): Promise<void> {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        fs.unlinkSync(this.credentialsPath)
        logger.info('CredentialsManager', 'OAuth credentials removed')
      }
    } catch (error) {
      logger.error('CredentialsManager', 'Error removing credentials', { error: error.message })
      throw new Error('Failed to remove credentials')
    }
  }

  /**
   * Check if credentials are stored
   */
  async hasStoredCredentials(): Promise<boolean> {
    return fs.existsSync(this.credentialsPath)
  }

  /**
   * Validate credential format before storing
   */
  validateCredentials(clientId: string, clientSecret: string): boolean {
    // Basic validation for OAuth credentials
    if (!clientId || clientId.length < 8) {
      throw new Error('Invalid client ID: must be at least 8 characters')
    }

    if (!clientSecret || clientSecret.length < 16) {
      throw new Error('Invalid client secret: must be at least 16 characters')
    }

    // Check for common insecure patterns
    if (clientId.includes('your_') || clientId.includes('example_')) {
      console.warn('[CredentialsManager] Client ID appears to be a placeholder')
    }

    if (clientSecret.includes('your_') || clientSecret.includes('example_')) {
      console.warn('[CredentialsManager] Client secret appears to be a placeholder')
    }

    return true
  }

  /**
   * Securely clear sensitive data from memory
   */
  private secureClear(buffer: Buffer): void {
    if (buffer.length > 0) {
      crypto.randomFillSync(buffer)
      buffer.fill(0)
    }
  }
}

// Export singleton instance
export const credentialsManager = new CredentialsManager()
