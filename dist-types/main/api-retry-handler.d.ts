/**
 * Retry Handler for API Operations
 * Implements exponential backoff with jitter and circuit breaker pattern
 */
export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    jitter?: boolean;
    retryableErrors?: (Error | string)[];
}
export interface RetryResult<T> {
    success: boolean;
    attempts: number;
    lastError?: Error;
    result?: T;
    durationMs: number;
}
export declare class ApiRetryHandler {
    private options;
    constructor(options?: RetryOptions);
    /**
     * Execute a function with retry logic
     */
    execute<T>(fn: () => Promise<T>, options?: {
        onRetry?: (attempt: number, error: Error, delayMs: number) => void;
        onSuccess?: (result: T, attempts: number) => void;
        onError?: (error: Error, attempts: number) => void;
    }): Promise<RetryResult<T>>;
    /**
     * Check if an error is retryable
     */
    private isRetryable;
    /**
     * Calculate delay with exponential backoff and optional jitter
     */
    private calculateDelay;
    /**
     * Sleep for specified milliseconds
     */
    private sleep;
}
/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by stopping requests when service is down
 */
export interface CircuitState {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime?: number;
    successCount: number;
}
export declare class CircuitBreaker {
    private state;
    private readonly failureThreshold;
    private readonly recoveryTimeoutMs;
    private readonly halfOpenMaxRequests;
    constructor(options?: {
        failureThreshold?: number;
        recoveryTimeoutMs?: number;
        halfOpenMaxRequests?: number;
    });
    /**
     * Execute a function with circuit breaker protection
     */
    execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>>;
    /**
     * Get current circuit state
     */
    getState(): CircuitState;
    /**
     * Reset circuit breaker to closed state (manual override)
     */
    reset(): void;
    /**
     * Force open the circuit (for testing or emergency)
     */
    open(): void;
}
export declare const apiRetryHandler: ApiRetryHandler;
export declare const circuitBreaker: CircuitBreaker;
