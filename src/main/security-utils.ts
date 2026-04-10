import * as crypto from 'crypto'

/**
 * Input validation and sanitization utilities for security best practices
 */

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class SecurityUtils {
  /**
   * Validate email format (basic RFC 5322 compliant)
   */
  static validateEmail(email: string): ValidationResult {
    const errors: string[] = []
    
    if (!email || typeof email !== 'string') {
      errors.push('Email is required and must be a string')
      return { valid: false, errors }
    }

    // Basic email regex (RFC 5322 simplified)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/
    
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format')
    }

    // Check for length limits
    if (email.length > 254) {
      errors.push('Email too long (max 254 characters)')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate URL format
   */
  static validateUrl(url: string): ValidationResult {
    const errors: string[] = []
    
    if (!url || typeof url !== 'string') {
      errors.push('URL is required and must be a string')
      return { valid: false, errors }
    }

    try {
      const parsedUrl = new URL(url)
      
      // Only allow http/https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        errors.push('URL must use HTTP or HTTPS protocol')
      }

      // Check for length limits
      if (url.length > 2048) {
        errors.push('URL too long (max 2048 characters)')
      }
    } catch (error) {
      errors.push('Invalid URL format')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Sanitize string input to prevent injection attacks
   */
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') {
      return ''
    }

    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    
    // Escape HTML special characters (XSS prevention)
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
    
    // Limit length to prevent buffer overflow attacks
    sanitized = sanitized.slice(0, 1000)

    return sanitized.trim()
  }

  /**
   * Validate UUID format
   */
  static validateUuid(uuid: string): ValidationResult {
    const errors: string[] = []
    
    if (!uuid || typeof uuid !== 'string') {
      errors.push('UUID is required and must be a string')
      return { valid: false, errors }
    }

    // UUID v4 regex pattern
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    
    if (!uuidRegex.test(uuid)) {
      errors.push('Invalid UUID format')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate numeric input with range checking
   */
  static validateNumber(value: any, options?: {
    min?: number
    max?: number
    required?: boolean
    allowNegative?: boolean
  }): ValidationResult {
    const errors: string[] = []
    
    // Check if value is provided (if required)
    if ((value === undefined || value === null || value === '') && options?.required !== false) {
      errors.push('Value is required')
      return { valid: false, errors }
    }

    // Convert to number if string
    const num = typeof value === 'string' ? parseFloat(value) : value
    
    // Check if it's a valid number
    if (typeof num !== 'number' || isNaN(num)) {
      errors.push('Value must be a valid number')
      return { valid: false, errors }
    }

    // Check range constraints
    const min = options?.min ?? -Infinity
    const max = options?.max ?? Infinity
    
    if (num < min) {
      errors.push(`Value must be at least ${min}`)
    }
    
    if (num > max) {
      errors.push(`Value must be at most ${max}`)
    }

    // Check negative constraint
    if (!options?.allowNegative && num < 0) {
      errors.push('Negative values not allowed')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate workout data structure before API submission
   */
  static validateWorkoutData(workout: any): ValidationResult {
    const errors: string[] = []
    
    // Required fields
    if (!workout.start_datetime) {
      errors.push('start_datetime is required')
    } else {
      const dateValidation = this.validateDate(workout.start_datetime)
      errors.push(...dateValidation.errors)
    }

    if (!workout.end_datetime) {
      errors.push('end_datetime is required')
    } else {
      const dateValidation = this.validateDate(workout.end_datetime)
      errors.push(...dateValidation.errors)
    }

    // Validate numeric fields
    const distanceValidation = this.validateNumber(workout.distance, { 
      min: 0, 
      max: 10000000, // Max 10,000 km
      required: false 
    })
    errors.push(...distanceValidation.errors)

    const durationValidation = this.validateNumber(workout.moving_time, { 
      min: 0, 
      max: 86400, // Max 24 hours in seconds
      allowNegative: false 
    })
    errors.push(...durationValidation.errors)

    const caloriesValidation = this.validateNumber(workout.calories, { 
      min: 0, 
      max: 100000,
      allowNegative: false 
    })
    errors.push(...caloriesValidation.errors)

    // Validate UUID if present
    if (workout.uuid) {
      const uuidValidation = this.validateUuid(workout.uuid)
      errors.push(...uuidValidation.errors)
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate ISO 8601 date format
   */
  static validateDate(dateString: string): ValidationResult {
    const errors: string[] = []
    
    if (!dateString || typeof dateString !== 'string') {
      errors.push('Date is required and must be a string')
      return { valid: false, errors }
    }

    // Try to parse as ISO date
    const date = new Date(dateString)
    
    if (isNaN(date.getTime())) {
      errors.push('Invalid date format')
    } else {
      // Check for future dates (optional validation)
      const now = new Date()
      if (date > now) {
        errors.push('Date cannot be in the future')
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Generate cryptographically secure random string
   */
  static generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let token = ''
    
    // Use crypto.randomBytes for security (not Math.random)
    const bytes = crypto.randomBytes(Math.ceil(length / 2))
    
    for (let i = 0; i < length; i++) {
      token += chars[bytes[i] % chars.length]
    }
    
    return token
  }

  /**
   * Hash password with salt using PBKDF2
   */
  static async hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
    const randomSalt = salt || crypto.randomBytes(16).toString('hex')
    
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, randomSalt, 100000, 32, 'sha256', (err, hash) => {
        if (err) {
          reject(err)
        } else {
          resolve({
            hash: hash.toString('hex'),
            salt: randomSalt
          })
        }
      })
    })
  }

  /**
   * Rate limiting utility (in-memory token bucket)
   */
  static createRateLimiter(maxRequests: number, windowMs: number): {
    isAllowed: (key: string) => boolean
    reset: () => void
  } {
    const requests = new Map<string, number[]>()
    
    const cleanup = () => {
      const now = Date.now()
      for (const [key, timestamps] of requests.entries()) {
        // Remove old timestamps outside the window
        const validTimestamps = timestamps.filter(t => now - t < windowMs)
        
        if (validTimestamps.length === 0) {
          requests.delete(key)
        } else {
          requests.set(key, validTimestamps)
        }
      }
    }

    // Auto-cleanup every minute
    setInterval(cleanup, windowMs / 2)

    return {
      isAllowed: (key: string): boolean => {
        cleanup()
        
        const now = Date.now()
        const timestamps = requests.get(key) || []
        
        if (timestamps.length < maxRequests) {
          timestamps.push(now)
          requests.set(key, timestamps)
          return true
        }
        
        return false
      },
      
      reset: () => {
        requests.clear()
      }
    }
  }

  /**
   * Check if input contains potential SQL injection patterns
   */
  static hasSqlInjection(input: string): boolean {
    const sqlPatterns = [
      /(--|\/\*|\*\/)/, // SQL comments
      /(['"])?;?\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)/i, // Dangerous keywords
      /(\bUNION\b.*\bSELECT\b)/i, // UNION SELECT
      /(\bOR\b\s+\d+\s*=\s*\d+)/i, // OR 1=1
    ]

    return sqlPatterns.some(pattern => pattern.test(input))
  }

  /**
   * Check if input contains potential XSS patterns
   */
  static hasXssPattern(input: string): boolean {
    const xssPatterns = [
      /<script/i, // Script tags
      /javascript:/i, // JavaScript protocol
      /on\w+\s*=/i, // Event handlers (onclick=, onload=, etc.)
      /<iframe/i, // Iframe injection
      /<object|<embed/i, // Object/embed injection
    ]

    return xssPatterns.some(pattern => pattern.test(input))
  }
}

// Export singleton instance for convenience
export const securityUtils = SecurityUtils
