/**
 * Interface for session management operations
 * Follows Interface Segregation Principle - focused on session-related operations only
 */
export class ISessionManager {
    /**
     * Validates the current session
     * @returns {string|null} Username if valid, null otherwise
     */
    validateSession() {
        throw new Error("Method 'validateSession' must be implemented");
    }

    /**
     * Clears the current session
     */
    clearSession() {
        throw new Error("Method 'clearSession' must be implemented");
    }

    /**
     * Validates username format
     * @param {string} username 
     * @returns {boolean}
     */
    isValidUsernameFormat(username) {
        throw new Error("Method 'isValidUsernameFormat' must be implemented");
    }

    /**
     * Gets the current username
     * @returns {string|null}
     */
    getCurrentUsername() {
        throw new Error("Method 'getCurrentUsername' must be implemented");
    }

    /**
     * Updates session activity timestamp
     */
    updateActivity() {
        throw new Error("Method 'updateActivity' must be implemented");
    }
} 