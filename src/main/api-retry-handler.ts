/**
 * Retry Handler for API Operations
 * Implements exponential backoff with jitter and circuit breaker pattern
 */

export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  multiplier?: number
  jitter?: boolean
  retryableErrors?: (Error | string)[]
}

export interface RetryResult<T> {
  success: boolean
  attempts: number
  lastError?: Error
  result?: T
  durationMs: number
}

export class ApiRetryHandler {
  private options: Required<RetryOptions>

  constructor(options?: RetryOptions) {
    this.options = {
      maxAttempts: options?.maxAttempts ?? 3,
      initialDelayMs: options?.initialDelayMs ?? 1000,
      maxDelayMs: options?.maxDelayMs ?? 30000,
      multiplier: options?.multiplier ?? 2,
      jitter: options?.jitter ?? true,
      retryableErrors: options?.retryableErrors ?? [
        'NetworkError',
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNREFUSED',
        'ENOTFOUND',
        '503', // Service Unavailable
        '429'  // Too Many Requests
      ]
    }
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    options?: {
      onRetry?: (attempt: number, error: Error, delayMs: number) => void
      onSuccess?: (result: T, attempts: number) => void
      onError?: (error: Error, attempts: number) => void
    }
  ): Promise<RetryResult<T>> {
    const startTime = Date.now()
    let lastError: Error | undefined
    let attempt = 0

    while (attempt < this.options.maxAttempts) {
      attempt++

      try {
        const result = await fn()
        
        options?.onSuccess?.(result, attempt)
        
        return {
          success: true,
          attempts: attempt,
          durationMs: Date.now() - startTime,
          result
        }
      } catch (error) {
        lastError = error as Error
        
        // Check if this error is retryable
        const isRetryable = this.isRetryable(error)

        if (!isRetryable || attempt === this.options.maxAttempts) {
          options?.onError?.(lastError, attempt)
          
          return {
            success: false,
            attempts: attempt,
            lastError,
            durationMs: Date.now() - startTime
          }
        }

        // Calculate delay with exponential backoff and jitter
        const delayMs = this.calculateDelay(attempt)
        
        options?.onRetry?.(attempt, lastError, delayMs)
        
        console.log(`[ApiRetry] Attempt ${attempt}/${this.options.maxAttempts} failed:`, error.message)
        console.log(`[ApiRetry] Retrying in ${delayMs}ms...`)

        // Wait before retrying
        await this.sleep(delayMs)
      }
    }

    options?.onError?.(lastError!, attempt)

    return {
      success: false,
      attempts: attempt,
      lastError,
      durationMs: Date.now() - startTime
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryable(error: Error | string): boolean {
    const errorMessage = typeof error === 'string' ? error : error.message || error.toString()
    
    // Check for known retryable error patterns
    return this.options.retryableErrors.some(pattern => 
      errorMessage.includes(pattern) || 
      (error instanceof Error && error.name?.includes(pattern))
    )
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number): number {
    const baseDelay = this.options.initialDelayMs * Math.pow(this.options.multiplier, attempt - 1)
    const cappedDelay = Math.min(baseDelay, this.options.maxDelayMs)

    if (!this.options.jitter) {
      return cappedDelay
    }

    // Add jitter (±25% of delay)
    const jitterAmount = cappedDelay * 0.25
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount
    
    return Math.max(100, Math.floor(cappedDelay + jitter))
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by stopping requests when service is down
 */

export interface CircuitState {
  state: 'closed' | 'open' | 'half-open'
  failureCount: number
  lastFailureTime?: number
  successCount: number
}

export class CircuitBreaker {
  private state: CircuitState = {
    state: 'closed',
    failureCount: 0,
    successCount: 0
  }

  private readonly failureThreshold: number
  private readonly recoveryTimeoutMs: number
  private readonly halfOpenMaxRequests: number

  constructor(options?: {
    failureThreshold?: number
    recoveryTimeoutMs?: number
    halfOpenMaxRequests?: number
  }) {
    this.failureThreshold = options?.failureThreshold ?? 5
    this.recoveryTimeoutMs = options?.recoveryTimeoutMs ?? 30000
    this.halfOpenMaxRequests = options?.halfOpenMaxRequests ?? 3
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    const startTime = Date.now()

    // Check if circuit is open
    if (this.state.state === 'open') {
      // Check if recovery timeout has passed
      if (this.state.lastFailureTime && 
          Date.now() - this.state.lastFailureTime > this.recoveryTimeoutMs) {
        // Transition to half-open
        this.state = { ...this.state, state: 'half-open', successCount: 0 }
        console.log('[CircuitBreaker] Transitioning to HALF-OPEN state')
      } else {
        return {
          success: false,
          attempts: 0,
          lastError: new Error('Circuit breaker is OPEN'),
          durationMs: Date.now() - startTime
        }
      }
    }

    try {
      const result = await fn()
      
      // Success - update state
      if (this.state.state === 'half-open') {
        this.state.successCount++
        
        // If we've made enough successful requests, close the circuit
        if (this.state.successCount >= this.halfOpenMaxRequests) {
          this.state = { 
            state: 'closed', 
            failureCount: 0, 
            successCount: 0 
          }
          console.log('[CircuitBreaker] Transitioning to CLOSED state')
        }
      } else {
        // Reset failure count on success in closed state
        this.state.failureCount = 0
      }

      return {
        success: true,
        attempts: 1,
        durationMs: Date.now() - startTime,
        result
      }
    } catch (error) {
      const err = error as Error
      
      // Update failure count
      this.state.failureCount++
      this.state.lastFailureTime = Date.now()

      // If we've exceeded the threshold, open the circuit
      if (this.state.failureCount >= this.failureThreshold && 
          this.state.state !== 'open') {
        this.state = { ...this.state, state: 'open' }
        console.log('[CircuitBreaker] Transitioning to OPEN state after', 
          this.state.failureCount, 'failures')
      }

      return {
        success: false,
        attempts: 1,
        lastError: err,
        durationMs: Date.now() - startTime
      }
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return { ...this.state }
  }

  /**
   * Reset circuit breaker to closed state (manual override)
   */
  reset(): void {
    this.state = {
      state: 'closed',
      failureCount: 0,
      successCount: 0
    }
    console.log('[CircuitBreaker] Manually reset to CLOSED state')
  }

  /**
   * Force open the circuit (for testing or emergency)
   */
  open(): void {
    this.state = { ...this.state, state: 'open' }
    console.log('[CircuitBreaker] Manually opened')
  }
}

// Export singleton instances with sensible defaults
export const apiRetryHandler = new ApiRetryHandler()
export const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeoutMs: 30000,
  halfOpenMaxRequests: 3
})
