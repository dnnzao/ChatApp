/**
 * Interface for UI management operations
 * Follows Interface Segregation Principle - focused on UI operations only
 */
export class IUIManager {
    /**
     * Initializes the UI with user data
     * @param {string} username 
     */
    initializeUI(username) {
        throw new Error("Method 'initializeUI' must be implemented");
    }

    /**
     * Updates connection status display
     * @param {string} status 
     */
    updateConnectionStatus(status) {
        throw new Error("Method 'updateConnectionStatus' must be implemented");
    }

    /**
     * Updates room user counts
     * @param {object} roomCounts 
     */
    updateRoomCounts(roomCounts) {
        throw new Error("Method 'updateRoomCounts' must be implemented");
    }

    /**
     * Updates room UI state (joined/not joined)
     * @param {string} roomName 
     * @param {boolean} isJoined 
     */
    updateRoomUI(roomName, isJoined) {
        throw new Error("Method 'updateRoomUI' must be implemented");
    }

    /**
     * Adds a room tab
     * @param {string} roomName 
     */
    addRoomTab(roomName) {
        throw new Error("Method 'addRoomTab' must be implemented");
    }

    /**
     * Removes a room tab
     * @param {string} roomName 
     */
    removeRoomTab(roomName) {
        throw new Error("Method 'removeRoomTab' must be implemented");
    }

    /**
     * Updates current room display
     * @param {string} roomName 
     */
    updateCurrentRoomDisplay(roomName) {
        throw new Error("Method 'updateCurrentRoomDisplay' must be implemented");
    }

    /**
     * Shows no room selected state
     */
    showNoRoomSelected() {
        throw new Error("Method 'showNoRoomSelected' must be implemented");
    }

    /**
     * Renders a chat message
     * @param {object} messageData 
     */
    renderMessage(messageData) {
        throw new Error("Method 'renderMessage' must be implemented");
    }

    /**
     * Renders a system message
     * @param {object} messageData 
     */
    renderSystemMessage(messageData) {
        throw new Error("Method 'renderSystemMessage' must be implemented");
    }

    /**
     * Clears all messages
     */
    clearMessages() {
        throw new Error("Method 'clearMessages' must be implemented");
    }

    /**
     * Scrolls to bottom of messages
     */
    scrollToBottom() {
        throw new Error("Method 'scrollToBottom' must be implemented");
    }

    /**
     * Shows an error message
     * @param {string} message 
     */
    showError(message) {
        throw new Error("Method 'showError' must be implemented");
    }

    /**
     * Sets up DOM event handlers
     */
    setupDOMEventHandlers() {
        throw new Error("Method 'setupDOMEventHandlers' must be implemented");
    }
} 