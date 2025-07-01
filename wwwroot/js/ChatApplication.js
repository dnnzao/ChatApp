import { SessionManager } from './core/SessionManager.js';
import { ConnectionManager } from './core/ConnectionManager.js';
import { ValidationService } from './core/ValidationService.js';
import { UIManager } from './core/UIManager.js';

/**
 * Main Chat Application - Dependency Injection Container
 * Follows Dependency Inversion Principle - Depends on abstractions, not concretions
 * Single Responsibility: Orchestrates the entire chat application
 */
export class ChatApplication {
    constructor() {
        // Dependency Injection Container
        this.dependencies = new Map();

        // Application state
        this.isInitialized = false;
        this.currentRoom = null;
        this.joinedRooms = new Set();
        this.roomMessages = new Map();

        // Rate limiting
        this.lastMessageTime = 0;
        this.MESSAGE_COOLDOWN = 1000; // 1 second

        // Initialize dependencies
        this._initializeDependencies();
        this._wireUpDependencies();
    }

    /**
     * Initializes the chat application
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            // Validate session first
            const sessionManager = this._getDependency('sessionManager');
            const username = sessionManager.validateSession();

            if (!username) {
                console.log('No valid session found, redirecting to login');
                window.location.href = "/";
                return false;
            }

            // Initialize connection first
            const connectionManager = this._getDependency('connectionManager');
            const connected = await connectionManager.initialize(username);

            if (!connected) {
                console.error('Failed to initialize connection');
                return false;
            }

            // Register SignalR event handlers before reserving username
            this._registerSignalREventHandlers();

            // Reserve username on server (this will check for duplicates)
            const usernameReserved = await this._reserveUsername(username);

            if (!usernameReserved) {
                console.log('Username already taken or invalid, redirecting to login');
                sessionManager.clearSession();
                window.location.href = "/";
                return false;
            }

            // Initialize UI after successful username reservation
            const uiManager = this._getDependency('uiManager');
            uiManager.initializeUI(username);
            uiManager.setupDOMEventHandlers();

            // Register UI event handlers
            this._registerUIEventHandlers();

            this.isInitialized = true;
            console.log('Chat application initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize chat application:', error);
            this._handleError(error);
            return false;
        }
    }

    /**
     * Joins a room
     * @param {string} roomName 
     * @returns {Promise<boolean>}
     */
    async joinRoom(roomName) {
        const validationService = this._getDependency('validationService');

        if (!validationService.isValidRoomName(roomName)) {
            this._showError('Invalid room name');
            return false;
        }

        if (this.joinedRooms.has(roomName)) {
            console.log(`Already joined room: ${roomName}`);
            return this.switchToRoom(roomName);
        }

        try {
            const connectionManager = this._getDependency('connectionManager');

            // JoinRoom will automatically send message history via "MessageHistory" event
            await connectionManager.invoke("JoinRoom", roomName);

            this.joinedRooms.add(roomName);
            this.currentRoom = roomName;

            const uiManager = this._getDependency('uiManager');
            uiManager.addRoomTab(roomName);
            uiManager.updateCurrentRoomDisplay(roomName);
            uiManager.updateRoomUI(roomName, true);

            // Clear current messages and display any existing messages for this room
            uiManager.clearMessages();
            this._displayRoomMessages(roomName);

            console.log(`Successfully joined room: ${roomName}`);
            return true;

        } catch (error) {
            console.error(`Failed to join room ${roomName}:`, error);
            this._handleError(error);
            return false;
        }
    }

    /**
     * Leaves a room
     * @param {string} roomName 
     * @returns {Promise<boolean>}
     */
    async leaveRoom(roomName) {
        const validationService = this._getDependency('validationService');

        if (!validationService.isValidRoomName(roomName)) {
            return false;
        }

        if (!this.joinedRooms.has(roomName)) {
            console.log(`Not in room: ${roomName}`);
            return true;
        }

        try {
            const connectionManager = this._getDependency('connectionManager');
            await connectionManager.invoke("LeaveRoom", roomName);

            this.joinedRooms.delete(roomName);
            this.roomMessages.delete(roomName);

            const uiManager = this._getDependency('uiManager');
            uiManager.removeRoomTab(roomName);
            uiManager.updateRoomUI(roomName, false);

            // If this was the current room, switch to another or show no room
            if (this.currentRoom === roomName) {
                const remainingRooms = Array.from(this.joinedRooms);
                if (remainingRooms.length > 0) {
                    this.switchToRoom(remainingRooms[0]);
                } else {
                    this.currentRoom = null;
                    uiManager.showNoRoomSelected();
                }
            }

            console.log(`Successfully left room: ${roomName}`);
            return true;

        } catch (error) {
            console.error(`Failed to leave room ${roomName}:`, error);
            this._handleError(error);
            return false;
        }
    }

    /**
     * Switches to a room (without joining if not already joined)
     * @param {string} roomName 
     * @returns {boolean}
     */
    async switchToRoom(roomName) {
        const validationService = this._getDependency('validationService');

        if (!validationService.isValidRoomName(roomName)) {
            return false;
        }

        if (!this.joinedRooms.has(roomName)) {
            console.warn(`Cannot switch to room ${roomName}: not joined`);
            return false;
        }

        try {
            // ✅ ADD THIS: Tell the server about the room switch
            const connectionManager = this._getDependency('connectionManager');
            await connectionManager.invoke("SwitchToRoom", roomName);

            // Update current room
            this.currentRoom = roomName;

            const uiManager = this._getDependency('uiManager');
            uiManager.updateCurrentRoomDisplay(roomName);

            // Clear current messages and display messages for the new room
            uiManager.clearMessages();
            this._displayRoomMessages(roomName);

            console.log(`Switched to room: ${roomName}`);
            return true;

        } catch (error) {
            console.error(`Failed to switch to room ${roomName}:`, error);
            this._handleError(error);
            return false;
        }
    }

    /**
     * Sends a message to the current room
     * @returns {Promise<boolean>}
     */
    async sendMessage() {
        if (!this.currentRoom) {
            this._showError('No room selected');
            return false;
        }

        const uiManager = this._getDependency('uiManager');
        const message = uiManager.getMessageInput();

        if (!message) {
            return false;
        }

        const validationService = this._getDependency('validationService');

        if (!validationService.isValidMessage(message)) {
            this._showError('Invalid message content');
            return false;
        }

        // Rate limiting
        if (!validationService.isRateLimitCompliant(this.lastMessageTime, this.MESSAGE_COOLDOWN)) {
            this._showError('Please wait before sending another message');
            return false;
        }

        try {
            const connectionManager = this._getDependency('connectionManager');
            await connectionManager.invoke("SendMessage", message);

            uiManager.clearMessageInput();
            this.lastMessageTime = Date.now();

            // Update session activity
            const sessionManager = this._getDependency('sessionManager');
            sessionManager.updateActivity();

            return true;

        } catch (error) {
            console.error('Failed to send message:', error);
            this._handleError(error);
            return false;
        }
    }

    /**
     * Logs out the user
     */
    async logout() {
        try {
            // Clear session
            const sessionManager = this._getDependency('sessionManager');
            sessionManager.clearSession();

            // Disconnect from SignalR
            const connectionManager = this._getDependency('connectionManager');
            await connectionManager.disconnect();

            // Reset application state
            this._resetState();

            // Redirect to login
            window.location.href = "/";

        } catch (error) {
            console.error('Error during logout:', error);
            // Force redirect even if there was an error
            window.location.href = "/";
        }
    }

    /**
     * Gets application statistics
     * @returns {object}
     */
    getStats() {
        const connectionManager = this._getDependency('connectionManager');
        const sessionManager = this._getDependency('sessionManager');

        return {
            isInitialized: this.isInitialized,
            currentRoom: this.currentRoom,
            joinedRooms: Array.from(this.joinedRooms),
            totalRoomsJoined: this.joinedRooms.size,
            connection: connectionManager.getConnectionStats(),
            session: sessionManager.getSessionInfo(),
            lastMessageTime: this.lastMessageTime
        };
    }

    // Private methods

    /**
     * Initializes all dependencies
     * @private
     */
    _initializeDependencies() {
        // Create instances in order of dependencies
        const validationService = new ValidationService();
        const sessionManager = new SessionManager();
        const connectionManager = new ConnectionManager();
        const uiManager = new UIManager(validationService);

        // Register dependencies
        this.dependencies.set('validationService', validationService);
        this.dependencies.set('sessionManager', sessionManager);
        this.dependencies.set('connectionManager', connectionManager);
        this.dependencies.set('uiManager', uiManager);
    }

    /**
     * Wires up dependencies between components
     * @private
     */
    _wireUpDependencies() {
        const connectionManager = this._getDependency('connectionManager');
        const uiManager = this._getDependency('uiManager');

        // Wire connection state changes to UI
        connectionManager.onConnectionStateChanged((state) => {
            uiManager.updateConnectionStatus(state);
        });
    }

    /**
     * Gets a dependency from the container
     * @param {string} name 
     * @returns {any}
     * @private
     */
    _getDependency(name) {
        const dependency = this.dependencies.get(name);
        if (!dependency) {
            throw new Error(`Dependency '${name}' not found`);
        }
        return dependency;
    }

    /**
     * Registers UI event handlers
     * @private
     */
    _registerUIEventHandlers() {
        const uiManager = this._getDependency('uiManager');

        uiManager.onEvent('sendMessage', () => this.sendMessage());
        uiManager.onEvent('joinRoom', (roomName) => this.joinRoom(roomName));
        uiManager.onEvent('leaveRoom', (roomName) => this.leaveRoom(roomName));
        uiManager.onEvent('switchRoom', (roomName) => this.switchToRoom(roomName));
        uiManager.onEvent('logout', () => this.logout());
    }

    /**
     * Registers SignalR event handlers
     * @private
     */
    _registerSignalREventHandlers() {
        const connectionManager = this._getDependency('connectionManager');
        const uiManager = this._getDependency('uiManager');

        // Message received (server sends "ReceiveMessage")
        connectionManager.on("ReceiveMessage", (user, message, room) => {
            this._handleMessageReceived(user, message, room);
        });

        // User joined room (system message)
        connectionManager.on("UserJoined", (message) => {
            this._handleSystemMessage(message, "join");
        });

        // User left room (system message)
        connectionManager.on("UserLeft", (message) => {
            this._handleSystemMessage(message, "leave");
        });

        // Room join success
        connectionManager.on("JoinedRoom", (roomName) => {
            console.log(`Successfully joined room: ${roomName}`);
            // Room join is handled in the joinRoom method
        });

        // Room leave success
        connectionManager.on("LeftRoom", (roomName) => {
            console.log(`Successfully left room: ${roomName}`);
            // Room leave is handled in the leaveRoom method
        });

        // Room join failed
        connectionManager.on("JoinFailed", (message) => {
            this._showError(`Failed to join room: ${message}`);
        });

        // Room switch success
        connectionManager.on("SwitchedToRoom", (roomName) => {
            console.log(`Successfully switched to room: ${roomName}`);
        });

        // Room switch failed
        connectionManager.on("SwitchFailed", (message) => {
            this._showError(`Failed to switch room: ${message}`);
        });

        // Message send failed
        connectionManager.on("MessageFailed", (message) => {
            this._showError(`Message failed: ${message}`);
        });

        // Room counts updated
        connectionManager.on("RoomCountsUpdated", (roomCounts) => {
            uiManager.updateRoomCounts(roomCounts);
        });

        // Room history received (server sends "MessageHistory")
        connectionManager.on("MessageHistory", (roomName, messages) => {
            this._handleRoomHistory(roomName, messages);
        });

        // Username reservation success
        connectionManager.on("UsernameReserved", (username) => {
            console.log(`Username reserved successfully: ${username}`);
            this._usernameReservationResolve?.(true);
        });

        // Username reservation failed
        connectionManager.on("UsernameReservationFailed", (message) => {
            console.log(`Username reservation failed: ${message}`);
            this._usernameReservationResolve?.(false);
        });

        // Rooms available (sent after successful username reservation)
        connectionManager.on("RoomsAvailable", (rooms, roomCounts) => {
            const uiManager = this._getDependency('uiManager');
            uiManager.updateRoomCounts(roomCounts);
        });

        // Error received
        connectionManager.on("Error", (errorMessage) => {
            this._handleServerError(errorMessage);
        });
    }

    /**
     * Handles incoming messages
     * @param {string} user 
     * @param {string} message 
     * @param {string} room 
     * @private
     */
    _handleMessageReceived(user, message, room) {
        const validationService = this._getDependency('validationService');
        const uiManager = this._getDependency('uiManager');

        // Validate incoming data
        if (!validationService.isValidMessage(message) ||
            !validationService.isValidRoomName(room)) {
            console.warn('Invalid message data received');
            return;
        }

        const messageData = {
            user: user,
            message: message,
            room: room,
            timestamp: new Date(),
            isHistorical: false
        };

        console.log(`Received new message from ${user} in ${room}: ${message.substring(0, 50)}`);

        // Store message
        if (!this.roomMessages.has(room)) {
            this.roomMessages.set(room, []);
        }
        this.roomMessages.get(room).push(messageData);

        // Limit message history to prevent memory issues
        const messages = this.roomMessages.get(room);
        if (messages.length > 100) {
            messages.shift(); // Remove oldest message
        }

        // Display message if it's for the current room
        if (this.currentRoom === room) {
            uiManager.renderMessage(messageData);
            uiManager.scrollToBottom();
            console.log(`Displayed new message in current room: ${room}`);
        } else {
            console.log(`Message received for non-current room: ${room} (current: ${this.currentRoom})`);
        }
    }

    /**
     * Handles system messages
     * @param {string} message 
     * @param {string} systemType 
     * @private
     */
    _handleSystemMessage(message, systemType) {
        const validationService = this._getDependency('validationService');
        const uiManager = this._getDependency('uiManager');

        if (!validationService.isValidSystemMessage(message)) {
            console.warn('Invalid system message received');
            return;
        }

        const messageData = {
            message: message,
            systemType: systemType,
            timestamp: new Date()
        };

        uiManager.renderSystemMessage(messageData);
    }

    /**
     * Handles room history
     * @param {string} roomName 
     * @param {Array} messages 
     * @private
     */
    _handleRoomHistory(roomName, messages) {
        if (!Array.isArray(messages)) {
            console.warn('Invalid room history data');
            return;
        }

        console.log(`Received ${messages.length} historical messages for room: ${roomName}`);

        const processedMessages = messages.map(msg => ({
            user: msg.user,
            message: msg.message,
            room: roomName,
            timestamp: this._parseTimestamp(msg.timestamp),
            isHistorical: true
        }));

        // Store messages
        this.roomMessages.set(roomName, processedMessages);

        // Display if it's the current room
        if (this.currentRoom === roomName) {
            const uiManager = this._getDependency('uiManager');
            uiManager.clearMessages(); // Clear any existing messages first
            this._displayRoomMessages(roomName);
            console.log(`Displayed ${processedMessages.length} historical messages for current room: ${roomName}`);
        }
    }

    /**
     * Handles server errors
     * @param {string} errorMessage 
     * @private
     */
    _handleServerError(errorMessage) {
        const validationService = this._getDependency('validationService');
        const sanitizedError = validationService.sanitizeErrorMessage(errorMessage);
        this._showError(sanitizedError);
    }

    /**
     * Displays messages for a room
     * @param {string} roomName 
     * @private
     */
    _displayRoomMessages(roomName) {
        const messages = this.roomMessages.get(roomName);
        if (!messages || messages.length === 0) {
            console.log(`No messages to display for room: ${roomName}`);
            return;
        }

        console.log(`Displaying ${messages.length} messages for room: ${roomName}`);
        const uiManager = this._getDependency('uiManager');
        messages.forEach(messageData => {
            uiManager.renderMessage(messageData);
        });

        // Scroll to bottom after displaying all messages
        uiManager.scrollToBottom();
    }

    /**
     * Parses timestamp from server
     * @param {any} timestampValue 
     * @returns {Date}
     * @private
     */
    _parseTimestamp(timestampValue) {
        try {
            if (timestampValue instanceof Date) {
                return timestampValue;
            }

            if (typeof timestampValue === 'string') {
                const utcString = timestampValue.endsWith('Z') ? timestampValue : timestampValue + 'Z';
                return new Date(utcString);
            }

            if (typeof timestampValue === 'number') {
                return new Date(timestampValue);
            }

            const parsed = new Date(timestampValue);
            return isNaN(parsed.getTime()) ? new Date() : parsed;

        } catch (error) {
            console.error('Error parsing timestamp:', timestampValue, error);
            return new Date();
        }
    }

    /**
     * Reserves username on the server
     * @param {string} username 
     * @returns {Promise<boolean>}
     * @private
     */
    async _reserveUsername(username) {
        return new Promise((resolve) => {
            this._usernameReservationResolve = resolve;

            // Set a timeout in case the server doesn't respond
            const timeout = setTimeout(() => {
                console.error('Username reservation timed out');
                this._usernameReservationResolve = null;
                resolve(false);
            }, 10000); // 10 second timeout

            // Clear timeout when resolved
            const originalResolve = this._usernameReservationResolve;
            this._usernameReservationResolve = (result) => {
                clearTimeout(timeout);
                this._usernameReservationResolve = null;
                originalResolve(result);
            };

            // Invoke server method
            const connectionManager = this._getDependency('connectionManager');
            connectionManager.invoke("ReserveUsername", username).catch((error) => {
                console.error('Failed to reserve username:', error);
                clearTimeout(timeout);
                this._usernameReservationResolve = null;
                resolve(false);
            });
        });
    }

    /**
     * Shows an error message
     * @param {string} message 
     * @private
     */
    _showError(message) {
        const uiManager = this._getDependency('uiManager');
        uiManager.showError(message);
    }

    /**
     * Handles application errors
     * @param {Error} error 
     * @private
     */
    _handleError(error) {
        console.error('Application error:', error);
        const validationService = this._getDependency('validationService');
        const sanitizedError = validationService.sanitizeErrorMessage(error.message || error.toString());
        this._showError(sanitizedError);
    }

    /**
     * Resets application state
     * @private
     */
    _resetState() {
        this.isInitialized = false;
        this.currentRoom = null;
        this.joinedRooms.clear();
        this.roomMessages.clear();
        this.lastMessageTime = 0;
    }

    /**
     * Cleanup resources
     */
    dispose() {
        this._resetState();

        // Dispose dependencies
        this.dependencies.forEach(dependency => {
            if (dependency.dispose) {
                dependency.dispose();
            }
        });

        this.dependencies.clear();
    }
}

// Global functions for backward compatibility with existing HTML onclick handlers
window.joinRoom = function (roomName) {
    if (window.chatApp) {
        window.chatApp.joinRoom(roomName);
    }
};

window.leaveRoom = function (roomName) {
    if (window.chatApp) {
        window.chatApp.leaveRoom(roomName);
    }
};

window.switchToRoomFromSidebar = function (roomName) {
    if (window.chatApp) {
        window.chatApp.switchToRoom(roomName);
    }
}; 