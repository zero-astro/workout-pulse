export declare class CredentialsManager {
    private credentialsPath;
    private masterKey;
    constructor();
    /**
     * Generate a system-specific key from environment or create one
     */
    private getMasterKey;
    /**
     * Encrypt sensitive data using AES-256-CBC
     */
    private encrypt;
    /**
     * Decrypt data using AES-256-CBC
     */
    private decrypt;
    /**
     * Store OAuth credentials securely
     */
    storeOAuthCredentials(clientId: string, clientSecret: string): Promise<void>;
    /**
     * Retrieve stored OAuth credentials from .env or encrypted storage
     */
    getOAuthCredentials(): Promise<{
        clientId: string;
        clientSecret: string;
    } | null>;
    /**
     * Remove stored credentials
     */
    removeOAuthCredentials(): Promise<void>;
    /**
     * Check if credentials are stored
     */
    hasStoredCredentials(): Promise<boolean>;
    /**
     * Validate credential format before storing
     */
    validateCredentials(clientId: string, clientSecret: string): boolean;
    /**
     * Securely clear sensitive data from memory
     */
    private secureClear;
}
export declare const credentialsManager: CredentialsManager;
