class ChatClient {
    constructor() {
        this.username = this.validateSession();
        if (!this.username) {
            window.location.href = "/";
            return;
        }

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl("/chatHub")
            .withAutomaticReconnect([0, 2000, 10000, 30000])
            .configureLogging(signalR.LogLevel.Information)
            .build();

        this.currentRoom = "";
        this.joinedRooms = new Set();
        this.roomMessages = new Map();
        this.isConnected = false;
        this.isLoggedIn = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        // Security: Rate limiting for client-side actions
        this.lastMessageTime = 0;
        this.MESSAGE_COOLDOWN = 1000;

        this.initializeConnection();
        this.setupEventHandlers();
        this.initializeUI();
    }

    // Helper method to parse timestamps consistently
    parseTimestamp(timestampValue) {
        try {
            console.log('Parsing timestamp:', timestampValue, 'Type:', typeof timestampValue);

            // If it's already a Date object, return it
            if (timestampValue instanceof Date) {
                return timestampValue;
            }

            // If it's a string, handle different formats
            if (typeof timestampValue === 'string') {
                // ISO format with timezone (e.g., "2024-12-19T21:40:45.123Z")
                if (timestampValue.includes('Z') || timestampValue.includes('+') || timestampValue.includes('-')) {
                    return new Date(timestampValue);
                }

                // Assume it's UTC if no timezone info
                // Convert "2024-12-19T21:40:45.123" to proper UTC
                const utcString = timestampValue.endsWith('Z') ? timestampValue : timestampValue + 'Z';
                return new Date(utcString);
            }

            // If it's a number (timestamp), convert it
            if (typeof timestampValue === 'number') {
                return new Date(timestampValue);
            }

            // Try to parse as-is
            const parsed = new Date(timestampValue);
            if (isNaN(parsed.getTime())) {
                console.warn('Could not parse timestamp, using current time:', timestampValue);
                return new Date();
            }

            return parsed;
        } catch (error) {
            console.error('Error parsing timestamp:', timestampValue, error);
            return new Date(); // Fallback to current time
        }
    }

    // Helper method to parse timestamps consistently
    parseTimestamp(timestampValue) {
        try {
            console.log('Parsing timestamp:', timestampValue, 'Type:', typeof timestampValue);

            // If it's already a Date object, return it
            if (timestampValue instanceof Date) {
                return timestampValue;
            }

            // If it's a string, handle different formats
            if (typeof timestampValue === 'string') {
                // ISO format with timezone (e.g., "2024-12-19T21:40:45.123Z")
                if (timestampValue.includes('Z') || timestampValue.includes('+') || timestampValue.includes('-')) {
                    return new Date(timestampValue);
                }

                // Assume it's UTC if no timezone info
                // Convert "2024-12-19T21:40:45.123" to proper UTC
                const utcString = timestampValue.endsWith('Z') ? timestampValue : timestampValue + 'Z';
                return new Date(utcString);
            }

            // If it's a number (timestamp), convert it
            if (typeof timestampValue === 'number') {
                return new Date(timestampValue);
            }

            // Try to parse as-is
            const parsed = new Date(timestampValue);
            if (isNaN(parsed.getTime())) {
                console.warn('Could not parse timestamp, using current time:', timestampValue);
                return new Date();
            }

            return parsed;
        } catch (error) {
            console.error('Error parsing timestamp:', timestampValue, error);
            return new Date(); // Fallback to current time
        }
    }

    // Enhanced session validation with security checks
    validateSession() {
        try {
            const sessionData = sessionStorage.getItem("chatSession");
            if (!sessionData) {
                return null;
            }

            const session = JSON.parse(sessionData);

            // Validate session structure
            if (!session.username || !session.timestamp || !session.sessionId) {
                this.clearSession();
                return null;
            }

            // Check session age (24 hours max)
            const sessionAge = Date.now() - session.timestamp;
            const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours

            if (sessionAge > MAX_SESSION_AGE) {
                this.clearSession();
                return null;
            }

            // Validate username format (same as server-side)
            if (!this.isValidUsernameFormat(session.username)) {
                this.clearSession();
                return null;
            }

            return session.username;
        } catch (error) {
            console.error("Session validation error:", error);
            this.clearSession();
            return null;
        }
    }

    // Client-side username validation (matches server-side)
    isValidUsernameFormat(username) {
        if (!username || typeof username !== 'string') return false;
        if (username.length < 1 || username.length > 20) return false;
        return /^[a-zA-Z0-9_-]+$/.test(username);
    }

    clearSession() {
        sessionStorage.removeItem("chatSession");
        sessionStorage.removeItem("chatUsername"); // Clear old format too
    }

    initializeUI() {
        // Secure: Use textContent instead of innerHTML
        const usernameElement = document.getElementById("currentUsername");
        if (usernameElement) {
            usernameElement.textContent = this.username;
        }
    }

    async initializeConnection() {
        try {
            await this.connection.start();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus("Connected");

            // Re-reserve username since this is a new connection
            await this.connection.invoke("ReserveUsername", this.username);

            console.log("SignalR Connected");
        } catch (err) {
            console.error("SignalR Connection Error: ", err);
            this.updateConnectionStatus("Connection Failed");
            this.reconnectAttempts++;

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                setTimeout(() => this.initializeConnection(), delay);
            } else {
                this.updateConnectionStatus("Connection Failed - Please Refresh");
            }
        }
    }

    setupEventHandlers() {
        // Connection events
        this.connection.onclose((error) => {
            this.isConnected = false;
            this.updateConnectionStatus("Disconnected");
            console.log("Connection closed:", error);
        });

        this.connection.onreconnecting((error) => {
            this.isConnected = false;
            this.updateConnectionStatus("Reconnecting...");
            console.log("Reconnecting:", error);
        });

        this.connection.onreconnected(async (connectionId) => {
            this.isConnected = true;
            this.updateConnectionStatus("Reconnected");
            console.log("Reconnected with ID:", connectionId);

            // Re-establish session after reconnection
            try {
                await this.connection.invoke("ReserveUsername", this.username);

                // Rejoin all rooms
                for (const roomName of this.joinedRooms) {
                    await this.connection.invoke("JoinRoom", roomName);
                }

                // Switch back to current room if we had one
                if (this.currentRoom && this.joinedRooms.has(this.currentRoom)) {
                    await this.connection.invoke("SwitchToRoom", this.currentRoom);
                }
            } catch (error) {
                console.error("Error re-establishing session:", error);
            }
        });

        // Username management events
        this.connection.on("UsernameReserved", (username) => {
            console.log("Username re-reserved:", username);
        });

        this.connection.on("UsernameReservationFailed", (error) => {
            alert("Your username is no longer available. Please login again.");
            this.clearSession();
            window.location.href = "/";
        });

        this.connection.on("RoomsAvailable", (rooms, roomCounts) => {
            this.updateRoomCounts(roomCounts);
        });

        // Room management events
        this.connection.on("JoinedRoom", (roomName) => {
            // Validate room name
            if (!this.isValidRoomName(roomName)) {
                console.error("Invalid room name received:", roomName);
                return;
            }

            this.joinedRooms.add(roomName);
            this.roomMessages.set(roomName, []);
            this.updateRoomUI(roomName, true);
            this.addRoomTab(roomName);
            if (!this.currentRoom) {
                this.switchToRoom(roomName);
            }
        });

        this.connection.on("LeftRoom", (roomName) => {
            if (!this.isValidRoomName(roomName)) return;

            this.joinedRooms.delete(roomName);
            this.roomMessages.delete(roomName);
            this.updateRoomUI(roomName, false);
            this.removeRoomTab(roomName);
            if (this.currentRoom === roomName) {
                this.currentRoom = Array.from(this.joinedRooms)[0] || "";
                if (this.currentRoom) {
                    this.switchToRoom(this.currentRoom);
                } else {
                    this.showNoRoomSelected();
                }
            }
        });

        this.connection.on("SwitchedToRoom", (roomName) => {
            if (!this.isValidRoomName(roomName)) return;

            this.currentRoom = roomName;
            this.updateCurrentRoomDisplay(roomName);
            this.loadRoomMessages(roomName);
            document.getElementById("messageInput").disabled = false;
            document.getElementById("sendButton").disabled = false;
        });

        this.connection.on("RoomCountsUpdated", (roomCounts) => {
            this.updateRoomCounts(roomCounts);
        });

        // Message events with validation
        this.connection.on("ReceiveMessage", (user, message, room) => {
            // Validate all parameters
            if (!this.isValidUsernameFormat(user) ||
                !this.isValidMessage(message) ||
                !this.isValidRoomName(room)) {
                console.error("Invalid message data received");
                return;
            }
            this.displayMessage(user, message, room);
        });

        this.connection.on("MessageHistory", (roomName, messages) => {
            this.loadMessageHistory(roomName, messages);
        });

        this.connection.on("UserJoined", (message) => {
            if (this.isValidSystemMessage(message)) {
                this.displaySystemMessage(message, 'join');
            }
        });

        this.connection.on("UserLeft", (message) => {
            if (this.isValidSystemMessage(message)) {
                this.displaySystemMessage(message, 'leave');
            }
        });

        // Error events
        this.connection.on("JoinFailed", (error) => {
            this.showError("Failed to join room: " + this.sanitizeErrorMessage(error));
        });

        this.connection.on("MessageFailed", (error) => {
            this.showError("Failed to send message: " + this.sanitizeErrorMessage(error));
        });

        this.connection.on("Error", (error) => {
            this.showError("Error: " + this.sanitizeErrorMessage(error));
        });

        this.setupDOMEventHandlers();
    }

    // Validation methods
    isValidRoomName(roomName) {
        if (!roomName || typeof roomName !== 'string') return false;
        const allowedRooms = ['general', 'family', 'friends', 'gaming', 'tech', 'random'];
        return allowedRooms.includes(roomName.toLowerCase());
    }

    isValidMessage(message) {
        if (!message || typeof message !== 'string') return false;
        if (message.length > 500) return false;

        // Check for potentially malicious patterns
        const dangerousPatterns = [
            '<script', 'javascript:', 'onload=', 'onerror=', 'onclick=',
            'data:text/html', 'vbscript:', 'expression('
        ];

        const lowerMessage = message.toLowerCase();
        return !dangerousPatterns.some(pattern => lowerMessage.includes(pattern));
    }

    isValidSystemMessage(message) {
        if (!message || typeof message !== 'string') return false;
        return message.length <= 200; // System messages should be shorter
    }

    sanitizeErrorMessage(error) {
        if (!error || typeof error !== 'string') return "Unknown error";
        // Remove potentially sensitive information
        return error.substring(0, 100).replace(/[<>]/g, '');
    }

    setupDOMEventHandlers() {
        const messageInput = document.getElementById("messageInput");
        const sendButton = document.getElementById("sendButton");

        // Enhanced input validation
        messageInput.addEventListener("input", (e) => {
            const value = e.target.value;
            if (value.length > 500) {
                e.target.value = value.substring(0, 500);
            }
        });

        messageInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                this.sendMessage();
            }
        });

        sendButton.addEventListener("click", () => this.sendMessage());
        document.getElementById("logoutBtn").addEventListener("click", () => this.logout());
    }

    async joinRoom(roomName) {
        if (!this.isConnected || !this.isValidRoomName(roomName)) return;

        if (this.joinedRooms.has(roomName)) {
            this.switchToRoom(roomName);
            return;
        }

        try {
            await this.connection.invoke("JoinRoom", roomName);
        } catch (err) {
            console.error("Error joining room:", err);
            this.showError("Failed to join room. Please try again.");
        }
    }

    async leaveRoom(roomName) {
        if (!this.isConnected || !this.joinedRooms.has(roomName) || !this.isValidRoomName(roomName)) return;

        try {
            await this.connection.invoke("LeaveRoom", roomName);
        } catch (err) {
            console.error("Error leaving room:", err);
            this.showError("Failed to leave room. Please try again.");
        }
    }

    async switchToRoom(roomName) {
        if (!this.joinedRooms.has(roomName) || !this.isValidRoomName(roomName)) return;

        try {
            await this.connection.invoke("SwitchToRoom", roomName);
        } catch (err) {
            console.error("Error switching to room:", err);
        }
    }

    switchToRoomFromSidebar(roomName) {
        if (this.joinedRooms.has(roomName) && this.isValidRoomName(roomName)) {
            this.switchToRoom(roomName);
        }
    }

    async sendMessage() {
        const messageInput = document.getElementById("messageInput");
        const message = messageInput.value.trim();

        // Enhanced validation and rate limiting
        if (!message || !this.currentRoom || !this.isConnected) return;

        // Client-side rate limiting
        const now = Date.now();
        if (now - this.lastMessageTime < this.MESSAGE_COOLDOWN) {
            this.showError("Please wait before sending another message.");
            return;
        }

        // Validate message
        if (!this.isValidMessage(message)) {
            this.showError("Message contains invalid content.");
            return;
        }

        try {
            await this.connection.invoke("SendMessage", message);
            messageInput.value = "";
            this.lastMessageTime = now;
        } catch (err) {
            console.error("Error sending message:", err);
            this.showError("Failed to send message. Please try again.");
        }
    }

    // UI Update Methods with security improvements
    updateConnectionStatus(status) {
        const statusElement = document.getElementById("connectionStatus");
        if (statusElement) {
            statusElement.textContent = status; // Use textContent, not innerHTML
            statusElement.className = `connection-status-small ${status.toLowerCase().replace(' ', '-')}`;
        }
    }

    updateRoomCounts(roomCounts) {
        if (!roomCounts || typeof roomCounts !== 'object') return;

        for (const [roomName, count] of Object.entries(roomCounts)) {
            if (!this.isValidRoomName(roomName) || typeof count !== 'number') continue;

            const countElement = document.getElementById(`count-${roomName}`);
            if (countElement) {
                countElement.textContent = Math.max(0, Math.min(999, count)); // Sanity check
            }
        }
    }

    updateRoomUI(roomName, isJoined) {
        if (!this.isValidRoomName(roomName)) return;

        const roomItem = document.querySelector(`[data-room="${roomName}"]`);
        if (!roomItem) return;

        const joinBtn = roomItem.querySelector(".btn-join");
        const leaveBtn = roomItem.querySelector(".btn-leave");

        if (isJoined) {
            roomItem.classList.add("joined");
            if (joinBtn) joinBtn.style.display = "none";
            if (leaveBtn) leaveBtn.style.display = "inline-block";
        } else {
            roomItem.classList.remove("joined", "active");
            if (joinBtn) joinBtn.style.display = "inline-block";
            if (leaveBtn) leaveBtn.style.display = "none";
        }
    }

    addRoomTab(roomName) {
        if (!this.isValidRoomName(roomName)) return;

        const tabsContainer = document.getElementById("roomTabs");
        if (!tabsContainer) return;

        // Don't add if tab already exists
        if (tabsContainer.querySelector(`[data-room-tab="${roomName}"]`)) return;

        const tab = document.createElement("div");
        tab.className = "room-tab";
        tab.setAttribute("data-room-tab", roomName);

        // Create elements safely
        const roomSpan = document.createElement("span");
        roomSpan.textContent = roomName;
        roomSpan.style.cursor = "pointer";
        roomSpan.onclick = () => chatClient.switchToRoom(roomName);

        const closeBtn = document.createElement("button");
        closeBtn.className = "close-btn";
        closeBtn.textContent = "×";
        closeBtn.title = "Leave room";
        closeBtn.onclick = () => chatClient.leaveRoom(roomName);

        tab.appendChild(roomSpan);
        tab.appendChild(closeBtn);
        tabsContainer.appendChild(tab);
    }

    removeRoomTab(roomName) {
        if (!this.isValidRoomName(roomName)) return;

        const tab = document.querySelector(`[data-room-tab="${roomName}"]`);
        if (tab) {
            tab.remove();
        }
    }

    updateCurrentRoomDisplay(roomName) {
        const displayElement = document.getElementById("currentRoomDisplay");
        if (displayElement) {
            displayElement.textContent = `#${roomName}`; // Safe text assignment
        }

        // Update active states
        document.querySelectorAll(".room-tab").forEach(tab => {
            tab.classList.remove("active");
        });

        const activeTab = document.querySelector(`[data-room-tab="${roomName}"]`);
        if (activeTab) {
            activeTab.classList.add("active");
        }

        document.querySelectorAll(".room-item").forEach(item => {
            item.classList.remove("active");
        });

        const activeRoom = document.querySelector(`[data-room="${roomName}"]`);
        if (activeRoom) {
            activeRoom.classList.add("active");
        }
    }

    showNoRoomSelected() {
        const displayElement = document.getElementById("currentRoomDisplay");
        if (displayElement) {
            displayElement.textContent = "Select a room to start chatting";
        }

        document.getElementById("messageInput").disabled = true;
        document.getElementById("sendButton").disabled = true;
        this.currentRoom = "";
        this.clearMessages();

        document.querySelectorAll(".room-tab").forEach(tab => {
            tab.classList.remove("active");
        });
        document.querySelectorAll(".room-item").forEach(item => {
            item.classList.remove("active");
        });
    }

    displayMessage(user, message, room) {
        if (!this.roomMessages.has(room)) {
            this.roomMessages.set(room, []);
        }

        const messageData = {
            type: 'message',
            user: user,
            message: message,
            room: room,
            timestamp: new Date() // Live messages use current local time
        };

        this.roomMessages.get(room).push(messageData);

        // Only display if this message is for the current active room
        if (room === this.currentRoom) {
            this.renderMessage(messageData);
        }
    }

    displaySystemMessage(message, type) {
        if (!this.currentRoom) return;

        const messageData = {
            type: 'system',
            message: message,
            systemType: type,
            room: this.currentRoom,
            timestamp: new Date() // System messages use current local time
        };

        if (this.roomMessages.has(this.currentRoom)) {
            this.roomMessages.get(this.currentRoom).push(messageData);
        }

        this.renderSystemMessage(messageData);
    }

    // Secure rendering methods
    renderMessage(messageData) {
        const messagesList = document.getElementById("messagesList");
        if (!messagesList) return;

        const li = document.createElement("li");
        li.className = "message";

        // Add class for historical messages
        if (messageData.isHistorical) {
            li.classList.add("historical-message");
        }

        // Create elements safely without innerHTML
        const timestampSpan = document.createElement("span");
        timestampSpan.className = "timestamp";
        timestampSpan.textContent = `[${messageData.timestamp.toLocaleTimeString()}]`;

        const userSpan = document.createElement("span");
        userSpan.className = "user";
        userSpan.textContent = `${messageData.user}:`;

        const textSpan = document.createElement("span");
        textSpan.className = "text";
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

    renderSystemMessage(messageData) {
        const messagesList = document.getElementById("messagesList");
        if (!messagesList) return;

        const li = document.createElement("li");
        li.className = `system-message ${messageData.systemType}`;

        const timestampSpan = document.createElement("span");
        timestampSpan.className = "timestamp";
        timestampSpan.textContent = `[${messageData.timestamp.toLocaleTimeString()}]`;

        const iconSpan = document.createElement("span");
        iconSpan.textContent = messageData.systemType === 'join' ? '✅' : '❌';

        const textSpan = document.createElement("span");
        textSpan.className = "text";
        textSpan.textContent = messageData.message;

        li.appendChild(timestampSpan);
        li.appendChild(iconSpan);
        li.appendChild(textSpan);

        messagesList.appendChild(li);
        this.scrollToBottom();
    }

    loadRoomMessages(roomName) {
        this.clearMessages();

        if (this.roomMessages.has(roomName)) {
            const messages = this.roomMessages.get(roomName);
            messages.forEach(messageData => {
                if (messageData.type === 'message') {
                    this.renderMessage(messageData);
                } else if (messageData.type === 'system') {
                    this.renderSystemMessage(messageData);
                }
            });
        }
    }

    loadMessageHistory(roomName, messages) {
        try {
            if (!this.isValidRoomName(roomName) || !Array.isArray(messages)) {
                console.error("Invalid message history data received");
                return;
            }

            // Initialize room messages if not exists
            if (!this.roomMessages.has(roomName)) {
                this.roomMessages.set(roomName, []);
            }

            // Clear existing messages for this room (in case of reload)
            this.roomMessages.set(roomName, []);

            // Add historical messages to room messages
            messages.forEach(msg => {
                if (this.isValidUsernameFormat(msg.user) &&
                    this.isValidMessage(msg.message) &&
                    this.isValidRoomName(msg.room)) {

                    const messageData = {
                        user: msg.user,
                        message: msg.message,
                        room: msg.room,
                        timestamp: this.parseTimestamp(msg.timestamp),
                        type: 'message',
                        isHistorical: true
                    };

                    this.roomMessages.get(roomName).push(messageData);
                }
            });

            // If this is the current room, display the messages
            if (this.currentRoom === roomName) {
                this.loadRoomMessages(roomName);
            }

            console.log(`Loaded ${messages.length} historical messages for room ${roomName}`);
        } catch (error) {
            console.error("Error loading message history:", error);
        }
    }

    clearMessages() {
        const messagesList = document.getElementById("messagesList");
        if (messagesList) {
            messagesList.innerHTML = "";
        }
    }

    scrollToBottom() {
        const messagesList = document.getElementById("messagesList");
        if (messagesList) {
            messagesList.scrollTop = messagesList.scrollHeight;
        }
    }

    showError(message) {
        console.error(message);
        // Use a more secure notification system in production
        alert(this.sanitizeErrorMessage(message));
    }

    logout() {
        if (confirm("Are you sure you want to logout?")) {
            this.clearSession();
            window.location.href = "/";
        }
    }

    // Remove the insecure escapeHtml method since we're using textContent
    // escapeHtml is no longer needed with secure DOM manipulation
}

// Global variable for easy access from HTML onclick handlers
let chatClient;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
    chatClient = new ChatClient();
});