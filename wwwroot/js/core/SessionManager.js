import { ISessionManager } from './ISessionManager.js';

/**
 * Concrete implementation of session management
 * Single Responsibility: Manages user sessions and authentication
 */
export class SessionManager extends ISessionManager {
    constructor() {
        super();
        this.MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
        this.SESSION_KEY = "chatSession";
        this.LEGACY_SESSION_KEY = "chatUsername"; // For backward compatibility
        this.currentUsername = null;
    }

    /**
     * Validates the current session with comprehensive security checks
     * @returns {string|null} Username if valid, null otherwise
     */
    validateSession() {
        try {
            const sessionData = sessionStorage.getItem(this.SESSION_KEY);
            if (!sessionData) {
                // Check for legacy session format
                return this._migrateLegacySession();
            }

            const session = JSON.parse(sessionData);

            // Validate session structure
            if (!session.username || !session.timestamp || !session.hash) {
                console.warn('Invalid session structure');
                this.clearSession();
                return null;
            }

            // Check expiration
            const now = Date.now();
            if (now - session.timestamp > this.MAX_SESSION_AGE) {
                console.log('Session expired');
                this.clearSession();
                return null;
            }

            // Validate session hash (basic integrity check)
            const expectedHash = this._generateSessionHash(session.username, session.timestamp);
            if (session.hash !== expectedHash) {
                console.warn('Session integrity check failed');
                this.clearSession();
                return null;
            }

            // Validate username format
            if (!this.isValidUsernameFormat(session.username)) {
                console.warn('Invalid username format in session');
                this.clearSession();
                return null;
            }

            this.currentUsername = session.username;
            console.log('Session validated successfully for user:', session.username);
            return session.username;

        } catch (error) {
            console.error('Error validating session:', error);
            this.clearSession();
            return null;
        }
    }

    /**
     * Creates a new session for the given username
     * @param {string} username 
     * @returns {boolean}
     */
    createSession(username) {
        if (!this.isValidUsernameFormat(username)) {
            console.error('Cannot create session: invalid username format');
            return false;
        }

        try {
            const now = Date.now();
            const sessionData = {
                username: username,
                timestamp: now,
                hash: this._generateSessionHash(username, now),
                version: "2.0" // Session format version
            };

            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
            this.currentUsername = username;

            console.log('Session created successfully for user:', username);
            return true;

        } catch (error) {
            console.error('Error creating session:', error);
            return false;
        }
    }

    /**
     * Clears the current session
     */
    clearSession() {
        try {
            sessionStorage.removeItem(this.SESSION_KEY);
            sessionStorage.removeItem(this.LEGACY_SESSION_KEY); // Also remove legacy
            this.currentUsername = null;
            console.log('Session cleared');
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    }

    /**
     * Updates session activity timestamp
     */
    updateActivity() {
        if (!this.currentUsername) {
            return;
        }

        try {
            const sessionData = sessionStorage.getItem(this.SESSION_KEY);
            if (sessionData) {
                const session = JSON.parse(sessionData);
                const now = Date.now();

                // Update timestamp and hash
                session.timestamp = now;
                session.hash = this._generateSessionHash(session.username, now);

                sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
            }
        } catch (error) {
            console.error('Error updating session activity:', error);
        }
    }

    /**
     * Validates username format according to business rules
     * @param {string} username 
     * @returns {boolean}
     */
    isValidUsernameFormat(username) {
        if (!username || typeof username !== 'string') {
            return false;
        }

        const trimmed = username.trim();

        // Length constraints
        if (trimmed.length < 1 || trimmed.length > 20) {
            return false;
        }

        // Character constraints (alphanumeric, underscore, hyphen)
        const validPattern = /^[a-zA-Z0-9_-]+$/;
        if (!validPattern.test(trimmed)) {
            return false;
        }

        // Cannot start with special characters
        if (trimmed.startsWith('-') || trimmed.startsWith('_')) {
            return false;
        }

        // Reserved usernames
        const reserved = ['admin', 'system', 'bot', 'server', 'guest', 'anonymous'];
        if (reserved.includes(trimmed.toLowerCase())) {
            return false;
        }

        return true;
    }

    /**
     * Gets comprehensive session information
     * @returns {object}
     */
    getSessionInfo() {
        try {
            const sessionData = sessionStorage.getItem(this.SESSION_KEY);
            if (!sessionData) {
                return {
                    isValid: false,
                    username: null,
                    age: null,
                    remainingTime: null
                };
            }

            const session = JSON.parse(sessionData);
            const now = Date.now();
            const age = now - session.timestamp;
            const remainingTime = this.MAX_SESSION_AGE - age;

            return {
                isValid: remainingTime > 0,
                username: session.username,
                age: age,
                remainingTime: Math.max(0, remainingTime),
                createdAt: new Date(session.timestamp).toISOString(),
                expiresAt: new Date(session.timestamp + this.MAX_SESSION_AGE).toISOString(),
                version: session.version || "1.0"
            };

        } catch (error) {
            console.error('Error getting session info:', error);
            return {
                isValid: false,
                username: null,
                age: null,
                remainingTime: null,
                error: error.message
            };
        }
    }

    /**
     * Checks if the current session is expired
     * @returns {boolean}
     */
    isSessionExpired() {
        const info = this.getSessionInfo();
        return !info.isValid || info.remainingTime <= 0;
    }

    /**
     * Gets the current username from session
     * @returns {string|null}
     */
    getCurrentUsername() {
        return this.currentUsername;
    }

    /**
     * Monitors session and provides warnings before expiration
     * @param {Function} warningCallback 
     */
    monitorSession(warningCallback) {
        const checkInterval = 60000; // Check every minute
        const warningThreshold = 5 * 60 * 1000; // Warn 5 minutes before expiration

        const monitor = () => {
            const info = this.getSessionInfo();

            if (!info.isValid) {
                console.log('Session expired during monitoring');
                return; // Stop monitoring
            }

            if (info.remainingTime <= warningThreshold && info.remainingTime > 0) {
                const minutesLeft = Math.ceil(info.remainingTime / 60000);
                warningCallback(`Session expires in ${minutesLeft} minutes`);
            }

            // Continue monitoring if session is still valid
            if (info.remainingTime > 0) {
                setTimeout(monitor, checkInterval);
            }
        };

        // Start monitoring
        setTimeout(monitor, checkInterval);
    }

    // Private methods

    /**
     * Generates a session hash for integrity checking
     * @param {string} username 
     * @param {number} timestamp 
     * @returns {string}
     * @private
     */
    _generateSessionHash(username, timestamp) {
        // Simple hash for session integrity (not cryptographically secure)
        const data = `${username}-${timestamp}-${navigator.userAgent.slice(0, 20)}`;
        let hash = 0;

        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return hash.toString(36);
    }

    /**
     * Migrates legacy session format to new format
     * @returns {string|null}
     * @private
     */
    _migrateLegacySession() {
        try {
            const legacyUsername = sessionStorage.getItem(this.LEGACY_SESSION_KEY);
            if (!legacyUsername) {
                return null;
            }

            console.log('Migrating legacy session for user:', legacyUsername);

            // Create new session format
            if (this.createSession(legacyUsername)) {
                // Remove legacy format
                sessionStorage.removeItem(this.LEGACY_SESSION_KEY);
                return legacyUsername;
            }

            return null;

        } catch (error) {
            console.error('Error migrating legacy session:', error);
            return null;
        }
    }

    /**
     * Cleanup method
     */
    dispose() {
        this.currentUsername = null;
    }
} 