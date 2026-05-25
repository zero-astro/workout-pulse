/**
 * Input validation and sanitization utilities for security best practices
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
export declare class SecurityUtils {
    /**
     * Validate email format (basic RFC 5322 compliant)
     */
    static validateEmail(email: string): ValidationResult;
    /**
     * Validate URL format
     */
    static validateUrl(url: string): ValidationResult;
    /**
     * Sanitize string input to prevent injection attacks
     */
    static sanitizeString(input: string): string;
    /**
     * Validate UUID format
     */
    static validateUuid(uuid: string): ValidationResult;
    /**
     * Validate numeric input with range checking
     */
    static validateNumber(value: any, options?: {
        min?: number;
        max?: number;
        required?: boolean;
        allowNegative?: boolean;
    }): ValidationResult;
    /**
     * Validate workout data structure before API submission
     */
    static validateWorkoutData(workout: any): ValidationResult;
    /**
     * Validate ISO 8601 date format
     */
    static validateDate(dateString: string): ValidationResult;
    /**
     * Generate cryptographically secure random string
     */
    static generateSecureToken(length?: number): string;
    /**
     * Hash password with salt using PBKDF2
     */
    static hashPassword(password: string, salt?: string): Promise<{
        hash: string;
        salt: string;
    }>;
    /**
     * Rate limiting utility (in-memory token bucket)
     */
    static createRateLimiter(maxRequests: number, windowMs: number): {
        isAllowed: (key: string) => boolean;
        reset: () => void;
    };
    /**
     * Check if input contains potential SQL injection patterns
     */
    static hasSqlInjection(input: string): boolean;
    /**
     * Check if input contains potential XSS patterns
     */
    static hasXssPattern(input: string): boolean;
}
export declare const securityUtils: typeof SecurityUtils;
