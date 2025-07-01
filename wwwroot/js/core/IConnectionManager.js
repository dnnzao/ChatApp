/**
 * Interface for SignalR connection management
 * Follows Interface Segregation Principle - focused on connection operations only
 */
export class IConnectionManager {
    /**
     * Initializes and starts the SignalR connection
     * @param {string} username 
     * @returns {Promise<boolean>} Success status
     */
    async initialize(username) {
        throw new Error("Method 'initialize' must be implemented");
    }

    /**
     * Closes the connection
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error("Method 'disconnect' must be implemented");
    }

    /**
     * Gets the current connection state
     * @returns {string} Connection state
     */
    getConnectionState() {
        throw new Error("Method 'getConnectionState' must be implemented");
    }

    /**
     * Checks if currently connected
     * @returns {boolean}
     */
    isConnected() {
        throw new Error("Method 'isConnected' must be implemented");
    }

    /**
     * Invokes a method on the server hub
     * @param {string} methodName 
     * @param {...any} args 
     * @returns {Promise<any>}
     */
    async invoke(methodName, ...args) {
        throw new Error("Method 'invoke' must be implemented");
    }

    /**
     * Registers an event handler for server messages
     * @param {string} eventName 
     * @param {Function} handler 
     */
    on(eventName, handler) {
        throw new Error("Method 'on' must be implemented");
    }

    /**
     * Removes an event handler
     * @param {string} eventName 
     * @param {Function} handler 
     */
    off(eventName, handler) {
        throw new Error("Method 'off' must be implemented");
    }

    /**
     * Registers a callback for connection state changes
     * @param {Function} callback 
     */
    onConnectionStateChanged(callback) {
        throw new Error("Method 'onConnectionStateChanged' must be implemented");
    }

    /**
     * Gets connection statistics
     * @returns {object}
     */
    getConnectionStats() {
        throw new Error("Method 'getConnectionStats' must be implemented");
    }

    /**
     * Checks if connection is healthy
     * @returns {boolean}
     */
    isHealthy() {
        throw new Error("Method 'isHealthy' must be implemented");
    }
} 