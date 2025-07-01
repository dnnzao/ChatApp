import { IConnectionManager } from './IConnectionManager.js';

/**
 * Concrete implementation of SignalR connection management
 * Single Responsibility: Manages SignalR connection and communication
 */
export class ConnectionManager extends IConnectionManager {
    constructor() {
        super();
        this.connection = null;
        this.isConnectedState = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.connectionStateCallbacks = [];
        this.eventHandlers = new Map();
    }

    /**
     * Initializes and starts the SignalR connection
     * @param {string} username 
     * @returns {Promise<boolean>} Success status
     */
    async initialize(username) {
        try {
            if (this.connection) {
                await this.disconnect();
            }

            // Create new connection
            this.connection = new signalR.HubConnectionBuilder()
                .withUrl("/chatHub", {
                    skipNegotiation: false,
                    transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
                })
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: retryContext => {
                        // Exponential backoff: 0s, 2s, 10s, 30s, 60s
                        if (retryContext.previousRetryCount === 0) return 0;
                        if (retryContext.previousRetryCount === 1) return 2000;
                        if (retryContext.previousRetryCount === 2) return 10000;
                        if (retryContext.previousRetryCount === 3) return 30000;
                        return 60000;
                    }
                })
                .configureLogging(signalR.LogLevel.Information)
                .build();

            // Configure connection timeouts
            this.connection.serverTimeoutInMilliseconds = 120000; // 2 minutes
            this.connection.keepAliveIntervalInMilliseconds = 30000; // 30 seconds

            // Setup connection event handlers
            this._setupConnectionEventHandlers();

            // Start connection
            await this.connection.start();

            this.isConnectedState = true;
            this.reconnectAttempts = 0;
            this._notifyConnectionStateChanged("Connected");

            console.log("SignalR connection established successfully");
            return true;

        } catch (error) {
            console.error("Failed to initialize SignalR connection:", error);
            this._notifyConnectionStateChanged("Disconnected");
            return false;
        }
    }

    /**
     * Closes the connection gracefully
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.connection) {
            try {
                await this.connection.stop();
                console.log("SignalR connection closed");
            } catch (error) {
                console.error("Error closing connection:", error);
            }
        }

        this.isConnectedState = false;
        this.connection = null;
        this._notifyConnectionStateChanged("Disconnected");
    }

    /**
     * Gets the current connection state
     * @returns {string} Connection state
     */
    getConnectionState() {
        if (!this.connection) return "Disconnected";

        const state = this.connection.state;
        switch (state) {
            case signalR.HubConnectionState.Connected:
                return "Connected";
            case signalR.HubConnectionState.Connecting:
                return "Connecting";
            case signalR.HubConnectionState.Reconnecting:
                return "Reconnecting";
            case signalR.HubConnectionState.Disconnected:
                return "Disconnected";
            case signalR.HubConnectionState.Disconnecting:
                return "Disconnecting";
            default:
                return "Unknown";
        }
    }

    /**
     * Invokes a method on the server hub
     * @param {string} methodName 
     * @param {...any} args 
     * @returns {Promise<any>}
     */
    async invoke(methodName, ...args) {
        if (!this.connection || !this.isConnectedState) {
            throw new Error("Connection not available");
        }

        try {
            const result = await this.connection.invoke(methodName, ...args);
            console.log(`Hub method '${methodName}' invoked successfully`);
            return result;
        } catch (error) {
            console.error(`Failed to invoke hub method '${methodName}':`, error);
            throw error;
        }
    }

    /**
     * Registers an event handler for server messages
     * @param {string} eventName 
     * @param {Function} handler 
     */
    on(eventName, handler) {
        if (!this.connection) {
            console.warn(`Cannot register handler for '${eventName}': connection not initialized`);
            return;
        }

        try {
            this.connection.on(eventName, handler);

            // Track handlers for cleanup
            if (!this.eventHandlers.has(eventName)) {
                this.eventHandlers.set(eventName, []);
            }
            this.eventHandlers.get(eventName).push(handler);

            console.log(`Event handler registered for '${eventName}'`);
        } catch (error) {
            console.error(`Failed to register event handler for '${eventName}':`, error);
        }
    }

    /**
     * Removes an event handler
     * @param {string} eventName 
     * @param {Function} handler 
     */
    off(eventName, handler) {
        if (!this.connection) return;

        try {
            this.connection.off(eventName, handler);

            // Remove from tracking
            const handlers = this.eventHandlers.get(eventName);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
            }

            console.log(`Event handler removed for '${eventName}'`);
        } catch (error) {
            console.error(`Failed to remove event handler for '${eventName}':`, error);
        }
    }

    /**
     * Registers a callback for connection state changes
     * @param {Function} callback 
     */
    onConnectionStateChanged(callback) {
        this.connectionStateCallbacks.push(callback);
    }

    /**
     * Gets connection statistics
     * @returns {object}
     */
    getConnectionStats() {
        return {
            isConnected: this.isConnectedState,
            state: this.getConnectionState(),
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            eventHandlers: Array.from(this.eventHandlers.keys()),
            connectionId: this.connection?.connectionId || null
        };
    }

    /**
     * Checks if connection is healthy
     * @returns {boolean}
     */
    isHealthy() {
        return this.isConnectedState &&
            this.connection &&
            this.connection.state === signalR.HubConnectionState.Connected;
    }

    /**
     * Sends a ping to test connection
     * @returns {Promise<boolean>}
     */
    async ping() {
        try {
            if (!this.isHealthy()) {
                return false;
            }

            const startTime = performance.now();
            await this.invoke("Ping");
            const endTime = performance.now();
            const roundTripTime = endTime - startTime;

            console.log(`Connection ping: ${roundTripTime.toFixed(2)}ms`);
            return true;

        } catch (error) {
            console.error("Ping failed:", error);
            return false;
        }
    }

    // Private methods

    /**
     * Sets up connection event handlers
     * @private
     */
    _setupConnectionEventHandlers() {
        if (!this.connection) return;

        // Connection closed
        this.connection.onclose(async (error) => {
            this.isConnectedState = false;
            if (error) {
                console.error("Connection closed with error:", error);
                this._notifyConnectionStateChanged("Disconnected (Error)");
            } else {
                console.log("Connection closed");
                this._notifyConnectionStateChanged("Disconnected");
            }
        });

        // Reconnecting
        this.connection.onreconnecting((error) => {
            this.isConnectedState = false;
            this.reconnectAttempts++;
            console.log(`Reconnecting (attempt ${this.reconnectAttempts})...`, error);
            this._notifyConnectionStateChanged(`Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        });

        // Reconnected
        this.connection.onreconnected((connectionId) => {
            this.isConnectedState = true;
            this.reconnectAttempts = 0;
            console.log("Reconnected successfully:", connectionId);
            this._notifyConnectionStateChanged("Connected (Reconnected)");
        });
    }

    /**
     * Notifies all callbacks of connection state changes
     * @param {string} newState 
     * @private
     */
    _notifyConnectionStateChanged(newState) {
        this.connectionStateCallbacks.forEach(callback => {
            try {
                callback(newState);
            } catch (error) {
                console.error("Error in connection state callback:", error);
            }
        });
    }

    /**
     * Cleanup resources
     */
    dispose() {
        // Clear event handlers
        this.eventHandlers.forEach((handlers, eventName) => {
            handlers.forEach(handler => {
                this.off(eventName, handler);
            });
        });
        this.eventHandlers.clear();

        // Clear state callbacks
        this.connectionStateCallbacks = [];

        // Disconnect
        this.disconnect();
    }
} 