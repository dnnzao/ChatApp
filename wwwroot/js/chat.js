class ChatClient {
    constructor() {
        // Check if user has a valid username from login page
        this.username = sessionStorage.getItem("chatUsername");
        if (!this.username) {
            // Redirect to login page if no username found
            window.location.href = "/";
            return;
        }

        this.connection = new signalR.HubConnectionBuilder().withUrl("/chatHub").build();
        this.currentRoom = "";
        this.joinedRooms = new Set();
        this.roomMessages = new Map(); // Store messages for each room separately
        this.isConnected = false;
        this.isLoggedIn = true; // User is already logged in

        this.initializeConnection();
        this.setupEventHandlers();
        this.initializeUI();
    }

    initializeUI() {
        // Set username in display
        document.getElementById("currentUsername").textContent = this.username;
    }

    async initializeConnection() {
        try {
            await this.connection.start();
            this.isConnected = true;
            this.updateConnectionStatus("Connected");

            // Re-reserve username since this is a new connection
            await this.connection.invoke("ReserveUsername", this.username);

            console.log("SignalR Connected");
        } catch (err) {
            console.error("SignalR Connection Error: ", err);
            this.updateConnectionStatus("Connection Failed");
            setTimeout(() => this.initializeConnection(), 5000);
        }
    }

    setupEventHandlers() {
        // Connection events
        this.connection.onclose(() => {
            this.isConnected = false;
            this.updateConnectionStatus("Disconnected");
            setTimeout(() => this.initializeConnection(), 5000);
        });

        // Username management events
        this.connection.on("UsernameReserved", (username) => {
            // Username successfully reserved, we're ready to go
            console.log("Username re-reserved:", username);
        });

        this.connection.on("UsernameReservationFailed", (error) => {
            // Username is no longer available, redirect to login
            alert("Your username is no longer available. Please login again.");
            sessionStorage.removeItem("chatUsername");
            window.location.href = "/";
        });

        this.connection.on("RoomsAvailable", (rooms, roomCounts) => {
            this.updateRoomCounts(roomCounts);
        });

        // Room management events
        this.connection.on("JoinedRoom", (roomName) => {
            this.joinedRooms.add(roomName);
            this.roomMessages.set(roomName, []); // Initialize empty message array for this room
            this.updateRoomUI(roomName, true);
            this.addRoomTab(roomName);
            if (!this.currentRoom) {
                this.switchToRoom(roomName);
            }
        });

        this.connection.on("LeftRoom", (roomName) => {
            this.joinedRooms.delete(roomName);
            this.roomMessages.delete(roomName); // Remove messages for this room
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
            this.currentRoom = roomName;
            this.updateCurrentRoomDisplay(roomName);
            this.loadRoomMessages(roomName); // Load messages for this room
            document.getElementById("messageInput").disabled = false;
            document.getElementById("sendButton").disabled = false;
        });

        this.connection.on("RoomCountsUpdated", (roomCounts) => {
            this.updateRoomCounts(roomCounts);
        });

        // Message events
        this.connection.on("ReceiveMessage", (user, message, room) => {
            this.displayMessage(user, message, room);
        });

        this.connection.on("UserJoined", (message) => {
            this.displaySystemMessage(message, 'join');
        });

        this.connection.on("UserLeft", (message) => {
            this.displaySystemMessage(message, 'leave');
        });

        // Error events
        this.connection.on("JoinFailed", (error) => {
            this.showError("Failed to join room: " + error);
        });

        this.connection.on("MessageFailed", (error) => {
            this.showError("Failed to send message: " + error);
        });

        this.connection.on("Error", (error) => {
            this.showError("Error: " + error);
        });

        // DOM event handlers
        this.setupDOMEventHandlers();
    }

    setupDOMEventHandlers() {
        // Chat input
        const messageInput = document.getElementById("messageInput");
        const sendButton = document.getElementById("sendButton");

        messageInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                this.sendMessage();
            }
        });

        sendButton.addEventListener("click", () => this.sendMessage());

        // Logout button
        document.getElementById("logoutBtn").addEventListener("click", () => this.logout());
    }

    async joinRoom(roomName) {
        if (!this.isConnected) return;

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
        if (!this.isConnected || !this.joinedRooms.has(roomName)) return;

        try {
            await this.connection.invoke("LeaveRoom", roomName);
        } catch (err) {
            console.error("Error leaving room:", err);
            this.showError("Failed to leave room. Please try again.");
        }
    }

    async switchToRoom(roomName) {
        if (!this.joinedRooms.has(roomName)) return;

        try {
            await this.connection.invoke("SwitchToRoom", roomName);
        } catch (err) {
            console.error("Error switching to room:", err);
        }
    }

    switchToRoomFromSidebar(roomName) {
        // If user is in the room, switch to it. If not, do nothing (they need to join first)
        if (this.joinedRooms.has(roomName)) {
            this.switchToRoom(roomName);
        }
    }

    async sendMessage() {
        const messageInput = document.getElementById("messageInput");
        const message = messageInput.value.trim();

        if (!message || !this.currentRoom || !this.isConnected) return;

        try {
            await this.connection.invoke("SendMessage", message);
            messageInput.value = "";
        } catch (err) {
            console.error("Error sending message:", err);
            this.showError("Failed to send message. Please try again.");
        }
    }

    // UI Update Methods
    updateConnectionStatus(status) {
        const statusElement = document.getElementById("connectionStatus");
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `connection-status-small ${status.toLowerCase().replace(' ', '-')}`;
        }
    }

    updateRoomCounts(roomCounts) {
        for (const [roomName, count] of Object.entries(roomCounts)) {
            const countElement = document.getElementById(`count-${roomName}`);
            if (countElement) {
                countElement.textContent = count;
            }
        }
    }

    updateRoomUI(roomName, isJoined) {
        const roomItem = document.querySelector(`[data-room="${roomName}"]`);
        if (!roomItem) return;

        const joinBtn = roomItem.querySelector(".btn-join");
        const leaveBtn = roomItem.querySelector(".btn-leave");

        if (isJoined) {
            roomItem.classList.add("joined");
            joinBtn.style.display = "none";
            leaveBtn.style.display = "inline-block";
        } else {
            roomItem.classList.remove("joined", "active");
            joinBtn.style.display = "inline-block";
            leaveBtn.style.display = "none";
        }
    }

    addRoomTab(roomName) {
        const tabsContainer = document.getElementById("roomTabs");

        // Don't add if tab already exists
        if (tabsContainer.querySelector(`[data-room-tab="${roomName}"]`)) return;

        const tab = document.createElement("div");
        tab.className = "room-tab";
        tab.setAttribute("data-room-tab", roomName);
        tab.innerHTML = `
            <span onclick="chatClient.switchToRoom('${roomName}')" style="cursor: pointer;">${roomName}</span>
            <button class="close-btn" onclick="chatClient.leaveRoom('${roomName}')" title="Leave room">×</button>
        `;

        tabsContainer.appendChild(tab);
    }

    removeRoomTab(roomName) {
        const tab = document.querySelector(`[data-room-tab="${roomName}"]`);
        if (tab) {
            tab.remove();
        }
    }

    updateCurrentRoomDisplay(roomName) {
        document.getElementById("currentRoomDisplay").textContent = `#${roomName}`;

        // Update active tab
        document.querySelectorAll(".room-tab").forEach(tab => {
            tab.classList.remove("active");
        });

        const activeTab = document.querySelector(`[data-room-tab="${roomName}"]`);
        if (activeTab) {
            activeTab.classList.add("active");
        }

        // Update active room in sidebar
        document.querySelectorAll(".room-item").forEach(item => {
            item.classList.remove("active");
        });

        const activeRoom = document.querySelector(`[data-room="${roomName}"]`);
        if (activeRoom) {
            activeRoom.classList.add("active");
        }
    }

    showNoRoomSelected() {
        document.getElementById("currentRoomDisplay").textContent = "Select a room to start chatting";
        document.getElementById("messageInput").disabled = true;
        document.getElementById("sendButton").disabled = true;
        this.currentRoom = ""; // Clear current room
        this.clearMessages();

        // Remove active states
        document.querySelectorAll(".room-tab").forEach(tab => {
            tab.classList.remove("active");
        });
        document.querySelectorAll(".room-item").forEach(item => {
            item.classList.remove("active");
        });
    }

    displayMessage(user, message, room) {
        // Store message in the appropriate room's message history
        if (!this.roomMessages.has(room)) {
            this.roomMessages.set(room, []);
        }

        const messageData = {
            type: 'message',
            user: user,
            message: message,
            room: room,
            timestamp: new Date()
        };

        this.roomMessages.get(room).push(messageData);

        // Only display if this message is for the current active room
        if (room === this.currentRoom) {
            this.renderMessage(messageData);
        }
    }

    displaySystemMessage(message, type) {
        // System messages should appear in all rooms the user is in
        // But for now, we'll only show them in the current room
        if (!this.currentRoom) return;

        const messageData = {
            type: 'system',
            message: message,
            systemType: type,
            room: this.currentRoom,
            timestamp: new Date()
        };

        // Store in current room's history
        if (this.roomMessages.has(this.currentRoom)) {
            this.roomMessages.get(this.currentRoom).push(messageData);
        }

        this.renderSystemMessage(messageData);
    }

    renderMessage(messageData) {
        const messagesList = document.getElementById("messagesList");
        const li = document.createElement("li");
        li.className = "message";

        const timestamp = messageData.timestamp.toLocaleTimeString();
        li.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            <span class="user">${this.escapeHtml(messageData.user)}:</span>
            <span class="text">${this.escapeHtml(messageData.message)}</span>
        `;

        messagesList.appendChild(li);
        this.scrollToBottom();
    }

    renderSystemMessage(messageData) {
        const messagesList = document.getElementById("messagesList");
        const li = document.createElement("li");
        li.className = `system-message ${messageData.systemType}`;

        const timestamp = messageData.timestamp.toLocaleTimeString();
        const icon = messageData.systemType === 'join' ? '✅' : '❌';
        li.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            ${icon}
            <span class="text">${this.escapeHtml(messageData.message)}</span>
        `;

        messagesList.appendChild(li);
        this.scrollToBottom();
    }

    loadRoomMessages(roomName) {
        // Clear current messages
        this.clearMessages();

        // Load messages for the specified room
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

    clearMessages() {
        document.getElementById("messagesList").innerHTML = "";
    }

    scrollToBottom() {
        const messagesList = document.getElementById("messagesList");
        messagesList.scrollTop = messagesList.scrollHeight;
    }

    showError(message) {
        console.error(message);
        alert(message); // Simple alert for now
    }

    logout() {
        if (confirm("Are you sure you want to logout?")) {
            // Clear username from storage
            sessionStorage.removeItem("chatUsername");

            // Redirect to login page
            window.location.href = "/";
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global variable for easy access from HTML onclick handlers
let chatClient;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
    chatClient = new ChatClient();
});