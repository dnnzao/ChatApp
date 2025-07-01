import { IUIManager } from './IUIManager.js';

/**
 * Concrete implementation of UI management
 * Single Responsibility: Manages all DOM manipulations and UI updates
 */
export class UIManager extends IUIManager {
    constructor(validationService) {
        super();
        this.validationService = validationService;
        this.elements = new Map(); // Cache for DOM elements
        this.currentRoom = null;
        this.eventCallbacks = new Map();

        // Initialize element cache
        this._cacheElements();
    }

    /**
     * Initializes the UI with user data
     * @param {string} username 
     */
    initializeUI(username) {
        // Secure: Use textContent instead of innerHTML
        const usernameElement = this._getElement('currentUsername');
        if (usernameElement) {
            usernameElement.textContent = username;
        }

        // Enable message input and send button
        const messageInput = this._getElement('messageInput');
        const sendButton = this._getElement('sendButton');

        if (messageInput) {
            messageInput.disabled = false;
            messageInput.placeholder = "Type a message...";
        }

        if (sendButton) {
            sendButton.disabled = false;
        }

        this._setupInputValidation();
    }

    /**
     * Updates connection status display
     * @param {string} status 
     */
    updateConnectionStatus(status) {
        const statusElement = this._getElement('connectionStatus');
        if (!statusElement) return;

        // Sanitize status text
        const sanitizedStatus = this.validationService.sanitizeText(status);
        statusElement.textContent = sanitizedStatus;

        // Update CSS classes based on status
        statusElement.className = 'connection-status-small';

        if (sanitizedStatus.includes('Connected')) {
            statusElement.classList.add('connected');
        } else if (sanitizedStatus.includes('Connecting') || sanitizedStatus.includes('Reconnecting')) {
            statusElement.classList.add('connecting');
        } else {
            statusElement.classList.add('disconnected');
        }
    }

    /**
     * Updates room user counts
     * @param {object} roomCounts 
     */
    updateRoomCounts(roomCounts) {
        if (!roomCounts || typeof roomCounts !== 'object') {
            console.warn('Invalid room counts data');
            return;
        }

        Object.keys(roomCounts).forEach(roomName => {
            const countElement = this._getElement(`count-${roomName}`);
            if (countElement) {
                const count = parseInt(roomCounts[roomName]) || 0;
                countElement.textContent = count.toString();
            }
        });
    }

    /**
     * Updates room UI state (joined/not joined)
     * @param {string} roomName 
     * @param {boolean} isJoined 
     */
    updateRoomUI(roomName, isJoined) {
        if (!this.validationService.isValidRoomName(roomName)) {
            console.warn('Invalid room name for UI update:', roomName);
            return;
        }

        const roomElement = this._getElement(`room-${roomName}`) ||
            document.querySelector(`[data-room="${roomName}"]`);

        if (!roomElement) return;

        const joinButton = roomElement.querySelector('.btn-join');
        const leaveButton = roomElement.querySelector('.btn-leave');

        if (isJoined) {
            roomElement.classList.add('joined');
            if (joinButton) joinButton.style.display = 'none';
            if (leaveButton) leaveButton.style.display = 'inline-block';
        } else {
            roomElement.classList.remove('joined');
            if (joinButton) joinButton.style.display = 'inline-block';
            if (leaveButton) leaveButton.style.display = 'none';
        }
    }

    /**
     * Adds a room tab with secure content handling
     * @param {string} roomName 
     */
    addRoomTab(roomName) {
        if (!this.validationService.isValidRoomName(roomName)) {
            console.warn('Invalid room name for tab creation:', roomName);
            return;
        }

        const roomTabs = this._getElement('roomTabs');
        if (!roomTabs) return;

        // Check if tab already exists
        const existingTab = roomTabs.querySelector(`[data-room="${roomName}"]`);
        if (existingTab) return;

        // Create tab element securely
        const tab = document.createElement('div');
        tab.className = 'room-tab';
        tab.setAttribute('data-room', roomName);

        // Create tab content
        const tabText = document.createElement('span');
        tabText.textContent = roomName; // Secure text content

        const closeBtn = document.createElement('span');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '×';
        closeBtn.title = 'Leave room';

        // Add click handlers
        tab.addEventListener('click', (e) => {
            if (e.target !== closeBtn) {
                this._fireEvent('switchRoom', roomName);
            }
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._fireEvent('leaveRoom', roomName);
        });

        tab.appendChild(tabText);
        tab.appendChild(closeBtn);
        roomTabs.appendChild(tab);

        // Update active tab
        this._setActiveTab(roomName);
    }

    /**
     * Removes a room tab
     * @param {string} roomName 
     */
    removeRoomTab(roomName) {
        if (!this.validationService.isValidRoomName(roomName)) return;

        const roomTabs = this._getElement('roomTabs');
        if (!roomTabs) return;

        const tab = roomTabs.querySelector(`[data-room="${roomName}"]`);
        if (tab) {
            tab.remove();
        }

        // If this was the active room, show no room selected
        if (this.currentRoom === roomName) {
            this.showNoRoomSelected();
        }
    }

    /**
     * Updates current room display
     * @param {string} roomName 
     */
    updateCurrentRoomDisplay(roomName) {
        if (!this.validationService.isValidRoomName(roomName)) {
            this.showNoRoomSelected();
            return;
        }

        this.currentRoom = roomName;

        const displayElement = this._getElement('currentRoomDisplay');
        if (displayElement) {
            displayElement.textContent = `${roomName} Chat`;
        }

        // Enable message input for active room
        const messageInput = this._getElement('messageInput');
        const sendButton = this._getElement('sendButton');

        if (messageInput) messageInput.disabled = false;
        if (sendButton) sendButton.disabled = false;

        this._setActiveTab(roomName);
    }

    /**
     * Shows no room selected state
     */
    showNoRoomSelected() {
        this.currentRoom = null;

        const displayElement = this._getElement('currentRoomDisplay');
        if (displayElement) {
            displayElement.textContent = 'Select a room to start chatting';
        }

        // Disable message input
        const messageInput = this._getElement('messageInput');
        const sendButton = this._getElement('sendButton');

        if (messageInput) {
            messageInput.disabled = true;
            messageInput.placeholder = 'Join a room to start chatting...';
        }
        if (sendButton) sendButton.disabled = true;

        // Clear active tab
        this._clearActiveTabs();
    }

    /**
     * Renders a chat message securely
     * @param {object} messageData 
     */
    renderMessage(messageData) {
        if (!this._validateMessageData(messageData)) return;

        const messagesList = this._getElement('messagesList');
        if (!messagesList) return;

        const li = document.createElement('li');
        li.className = 'message';

        // Add class for historical messages
        if (messageData.isHistorical) {
            li.classList.add('historical-message');
        }

        // Create elements safely without innerHTML
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = `[${messageData.timestamp.toLocaleTimeString()}]`;

        const userSpan = document.createElement('span');
        userSpan.className = 'user';
        userSpan.textContent = `${messageData.user}:`;

        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = messageData.message;

        li.appendChild(timestampSpan);
        li.appendChild(userSpan);
        li.appendChild(textSpan);

        messagesList.appendChild(li);

        // Only scroll to bottom for new messages, not historical ones
        if (!messageData.isHistorical) {
            this.scrollToBottom();
        }
    }

    /**
     * Renders a system message securely
     * @param {object} messageData 
     */
    renderSystemMessage(messageData) {
        if (!this._validateSystemMessageData(messageData)) return;

        const messagesList = this._getElement('messagesList');
        if (!messagesList) return;

        const li = document.createElement('li');
        li.className = `system-message ${messageData.systemType}`;

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = `[${messageData.timestamp.toLocaleTimeString()}]`;

        const iconSpan = document.createElement('span');
        iconSpan.textContent = messageData.systemType === 'join' ? '✅' : '❌';

        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = messageData.message;

        li.appendChild(timestampSpan);
        li.appendChild(iconSpan);
        li.appendChild(textSpan);

        messagesList.appendChild(li);
        this.scrollToBottom();
    }

    /**
     * Clears all messages
     */
    clearMessages() {
        const messagesList = this._getElement('messagesList');
        if (messagesList) {
            messagesList.innerHTML = "";
        }
    }

    /**
     * Scrolls to bottom of messages
     */
    scrollToBottom() {
        const messagesList = this._getElement('messagesList');
        if (messagesList) {
            messagesList.scrollTop = messagesList.scrollHeight;
        }
    }

    /**
     * Shows an error message
     * @param {string} message 
     */
    showError(message) {
        const sanitizedMessage = this.validationService.sanitizeErrorMessage(message);
        console.error(sanitizedMessage);

        // Create a temporary error display
        this._showTemporaryNotification(sanitizedMessage, 'error');
    }

    /**
     * Sets up DOM event handlers
     */
    setupDOMEventHandlers() {
        // Message input enter key handler
        const messageInput = this._getElement('messageInput');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._fireEvent('sendMessage');
                }
            });
        }

        // Send button handler
        const sendButton = this._getElement('sendButton');
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                this._fireEvent('sendMessage');
            });
        }

        // Logout button handler
        const logoutBtn = this._getElement('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this._fireEvent('logout');
            });
        }

        console.log('DOM event handlers set up successfully');
    }

    /**
     * Registers an event callback
     * @param {string} eventName 
     * @param {Function} callback 
     */
    onEvent(eventName, callback) {
        if (!this.eventCallbacks.has(eventName)) {
            this.eventCallbacks.set(eventName, []);
        }
        this.eventCallbacks.get(eventName).push(callback);
    }

    /**
     * Gets the current message input value
     * @returns {string}
     */
    getMessageInput() {
        const messageInput = this._getElement('messageInput');
        return messageInput ? messageInput.value.trim() : '';
    }

    /**
     * Clears the message input
     */
    clearMessageInput() {
        const messageInput = this._getElement('messageInput');
        if (messageInput) {
            messageInput.value = '';
        }
    }

    // Private methods

    /**
     * Caches DOM elements for performance
     * @private
     */
    _cacheElements() {
        const elementIds = [
            'currentUsername', 'connectionStatus', 'messageInput', 'sendButton',
            'messagesList', 'currentRoomDisplay', 'roomTabs', 'logoutBtn'
        ];

        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.elements.set(id, element);
            }
        });
    }

    /**
     * Gets a cached DOM element
     * @param {string} elementId 
     * @returns {HTMLElement|null}
     * @private
     */
    _getElement(elementId) {
        return this.elements.get(elementId) || document.getElementById(elementId);
    }

    /**
     * Sets up input validation
     * @private
     */
    _setupInputValidation() {
        const messageInput = this._getElement('messageInput');
        if (!messageInput) return;

        messageInput.addEventListener('input', (e) => {
            const value = e.target.value;
            const sendButton = this._getElement('sendButton');

            if (sendButton) {
                sendButton.disabled = !this.validationService.isValidMessage(value);
            }
        });
    }

    /**
     * Sets the active tab
     * @param {string} roomName 
     * @private
     */
    _setActiveTab(roomName) {
        const roomTabs = this._getElement('roomTabs');
        if (!roomTabs) return;

        // Remove active class from all tabs
        roomTabs.querySelectorAll('.room-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Add active class to current tab
        const activeTab = roomTabs.querySelector(`[data-room="${roomName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
    }

    /**
     * Clears all active tabs
     * @private
     */
    _clearActiveTabs() {
        const roomTabs = this._getElement('roomTabs');
        if (roomTabs) {
            roomTabs.querySelectorAll('.room-tab').forEach(tab => {
                tab.classList.remove('active');
            });
        }
    }

    /**
     * Validates message data
     * @param {object} messageData 
     * @returns {boolean}
     * @private
     */
    _validateMessageData(messageData) {
        return messageData &&
            typeof messageData.user === 'string' &&
            typeof messageData.message === 'string' &&
            messageData.timestamp instanceof Date &&
            this.validationService.isValidMessage(messageData.message);
    }

    /**
     * Validates system message data
     * @param {object} messageData 
     * @returns {boolean}
     * @private
     */
    _validateSystemMessageData(messageData) {
        return messageData &&
            typeof messageData.message === 'string' &&
            typeof messageData.systemType === 'string' &&
            messageData.timestamp instanceof Date &&
            this.validationService.isValidSystemMessage(messageData.message);
    }

    /**
     * Shows a temporary notification
     * @param {string} message 
     * @param {string} type 
     * @private
     */
    _showTemporaryNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            background: ${type === 'error' ? '#f44336' : '#4caf50'};
            color: white;
            border-radius: 4px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    /**
     * Fires an event to registered callbacks
     * @param {string} eventName 
     * @param {...any} args 
     * @private
     */
    _fireEvent(eventName, ...args) {
        const callbacks = this.eventCallbacks.get(eventName);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in event callback for ${eventName}:`, error);
                }
            });
        }
    }

    /**
     * Cleanup resources
     */
    dispose() {
        this.elements.clear();
        this.eventCallbacks.clear();
        this.currentRoom = null;
    }
} 