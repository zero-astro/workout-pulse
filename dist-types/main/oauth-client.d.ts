import { EventEmitter } from 'events';
export interface OAuthCredentials {
    clientId: string;
    clientSecret: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: number;
}
export interface OAuthEvent {
    type: 'authorized' | 'token-exchanged' | 'error' | 'expired';
    credentials?: OAuthCredentials;
    error?: Error;
    timestamp: number;
}
export declare class FittrackeeOAuthClient extends EventEmitter {
    private clientId;
    private clientSecret;
    private redirectUri;
    private state;
    private server;
    private baseApiUrl;
    private authUrl;
    private tokenUrl;
    private credentialsPath;
    constructor(baseApiUrl?: string);
    /**
     * Set OAuth credentials from environment or config with validation and secure storage
     */
    setCredentials(clientId: string, clientSecret: string): Promise<void>;
    /**
     * Load stored OAuth credentials from secure storage
     */
    loadStoredCredentials(): Promise<OAuthCredentials | null>;
    /**
     * Load access tokens from secure storage
     */
    loadAccessTokens(): Promise<{
        accessToken?: string;
        refreshToken?: string;
        tokenExpiry?: number;
    } | null>;
    /**
     * Save access token and refresh token to secure storage
     */
    saveCredentials(credentials: OAuthCredentials): Promise<void>;
    /**
     * Remove stored credentials and tokens (for logout)
     */
    removeStoredCredentials(): Promise<void>;
    /**
     * Generate authorization form data for POST request to FitTrackee
     * Note: FitTrackee requires a POST request, not GET like standard OAuth2
     */
    getAuthorizationFormData(): {
        url: string;
        formData: URLSearchParams;
    };
    /**
     * Exchange authorization code for access token
     */
    exchangeCodeForToken(code: string): Promise<OAuthCredentials>;
    /**
     * Refresh expired access token using refresh token
     */
    refreshToken(refreshToken: string): Promise<OAuthCredentials>;
    /**
     * Make HTTP request to OAuth server
     */
    private makeTokenRequest;
    /**
     * Validate current access token
     */
    validateToken(): Promise<boolean>;
    /**
     * Test API connection with provided token
     */
    private testApiConnection;
    /**
     * Get current authorization state
     */
    getState(): string;
    /**
     * Clear stored state (after callback)
     */
    clearState(): void;
    /**
     * Check if user is authorized
     */
    isAuthenticated(): boolean;
}
export declare const fittrackeeOAuth: FittrackeeOAuthClient;
