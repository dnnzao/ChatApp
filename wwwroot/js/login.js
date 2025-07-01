class LoginClient {
    constructor() {
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl("/chatHub")
            .withAutomaticReconnect([0, 2000, 10000, 30000]) // Add automatic reconnection
            .configureLogging(signalR.LogLevel.Information)
            .build();

        this.isConnected = false;
        this.lastUsernameCheck = 0;
        this.USERNAME_CHECK_COOLDOWN = 300;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        this.initializeConnection();
        this.setupEventHandlers();
    }

    async initializeConnection() {
        try {
            await this.connection.start();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus("Connected");
            document.getElementById("reserveUsernameBtn").disabled = false;
            console.log("SignalR Connected");
        } catch (err) {
            console.error("SignalR Connection Error: ", err);
            this.updateConnectionStatus("Connection Failed");
            this.reconnectAttempts++;

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                setTimeout(() => this.initializeConnection(), delay);
            } else {
                this.updateConnectionStatus("Connection Failed - Refresh Page");
            }
        }
    }

    setupEventHandlers() {
        // Enhanced connection events
        this.connection.onclose((error) => {
            this.isConnected = false;
            this.updateConnectionStatus("Disconnected");
            document.getElementById("reserveUsernameBtn").disabled = true;
            console.log("Connection closed:", error);
        });

        this.connection.onreconnecting((error) => {
            this.isConnected = false;
            this.updateConnectionStatus("Reconnecting...");
            document.getElementById("reserveUsernameBtn").disabled = true;
            console.log("Reconnecting:", error);
        });

        this.connection.onreconnected((connectionId) => {
            this.isConnected = true;
            this.updateConnectionStatus("Reconnected");
            document.getElementById("reserveUsernameBtn").disabled = false;
            console.log("Reconnected with ID:", connectionId);
        });

        // Username management events
        this.connection.on("UsernameReserved", (username) => {
            const sessionData = {
                username: username,
                timestamp: Date.now(),
                sessionId: crypto.randomUUID(),
                checksum: this.generateChecksum(username)
            };

            sessionStorage.setItem("chatSession", JSON.stringify(sessionData));
            sessionStorage.setItem("chatUsername", username);
            window.location.href = "/Chat";
        });

        this.connection.on("UsernameReservationFailed", (error) => {
            this.showUsernameError(this.sanitizeErrorMessage(error));
        });

        this.connection.on("UsernameAvailability", (username, isAvailable) => {
            this.updateUsernameStatus(username, isAvailable);
        });

        this.setupDOMEventHandlers();
    }

    setupDOMEventHandlers() {
        const usernameInput = document.getElementById("usernameInput");
        const reserveBtn = document.getElementById("reserveUsernameBtn");

        // Enhanced input validation with rate limiting
        usernameInput.addEventListener("input", (e) => {
            const username = e.target.value.trim();

            // Client-side validation
            if (!this.isValidUsernameFormat(username)) {
                if (username.length > 0) {
                    this.showUsernameError("Username must be 3-20 characters, letters, numbers, _ and - only");
                } else {
                    this.clearUsernameStatus();
                }
                reserveBtn.disabled = true;
                return;
            }

            // Rate limiting for username checks
            const now = Date.now();
            if (now - this.lastUsernameCheck < this.USERNAME_CHECK_COOLDOWN) {
                return;
            }

            if (username.length >= 3 && this.isConnected) {
                this.connection.invoke("CheckUsernameAvailability", username);
                this.lastUsernameCheck = now;
            } else {
                this.clearUsernameStatus();
                reserveBtn.disabled = true;
            }
        });

        // Prevent paste of invalid characters
        usernameInput.addEventListener("paste", (e) => {
            setTimeout(() => {
                const value = e.target.value;
                const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 20);
                if (value !== sanitized) {
                    e.target.value = sanitized;
                    this.showUsernameError("Invalid characters were removed");
                }
            }, 0);
        });

        // Limit input length and filter invalid characters
        usernameInput.addEventListener("keypress", (e) => {
            const char = e.key;

            // Allow special keys
            if (e.ctrlKey || e.altKey || char === "Backspace" || char === "Delete" ||
                char === "ArrowLeft" || char === "ArrowRight" || char === "Tab") {
                return;
            }

            // Check if character is valid
            if (!/[a-zA-Z0-9_-]/.test(char)) {
                e.preventDefault();
                return;
            }

            // Check length limit
            if (e.target.value.length >= 20) {
                e.preventDefault();
                return;
            }

            // Handle Enter key
            if (char === "Enter" && !reserveBtn.disabled) {
                this.reserveUsername();
            }
        });

        reserveBtn.addEventListener("click", () => this.reserveUsername());
    }

    // Client-side username validation (must match server-side)
    isValidUsernameFormat(username) {
        if (!username || typeof username !== 'string') return false;
        if (username.length < 3 || username.length > 20) return false;
        return /^[a-zA-Z0-9_-]+$/.test(username);
    }

    // Simple checksum for session integrity
    generateChecksum(username) {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            const char = username.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    sanitizeErrorMessage(error) {
        if (!error || typeof error !== 'string') return "Unknown error";
        // Remove potentially dangerous content and limit length
        return error.replace(/[<>]/g, '').substring(0, 100);
    }

    async reserveUsername() {
        const usernameInput = document.getElementById("usernameInput");
        const username = usernameInput.value.trim();

        if (!username || !this.isConnected) return;

        // Final validation before sending
        if (!this.isValidUsernameFormat(username)) {
            this.showUsernameError("Invalid username format");
            return;
        }

        // Disable button to prevent double-click
        const reserveBtn = document.getElementById("reserveUsernameBtn");
        const originalText = reserveBtn.textContent;
        reserveBtn.disabled = true;
        reserveBtn.textContent = "Entering...";

        try {
            await this.connection.invoke("ReserveUsername", username);
        } catch (err) {
            console.error("Error reserving username:", err);
            this.showUsernameError("Failed to reserve username. Please try again.");

            // Re-enable button
            reserveBtn.disabled = false;
            reserveBtn.textContent = originalText;
        }
    }

    // UI Update Methods - Secure implementations
    updateConnectionStatus(status) {
        const statusElement = document.getElementById("connectionStatus");
        if (statusElement) {
            statusElement.textContent = status; // Use textContent for security
            statusElement.className = `connection-status ${status.toLowerCase().replace(/[^a-z-]/g, '')}`;
        }
    }

    updateUsernameStatus(username, isAvailable) {
        const statusElement = document.getElementById("usernameStatus");
        const reserveBtn = document.getElementById("reserveUsernameBtn");

        if (!statusElement || !reserveBtn) return;

        // Validate the response data
        if (typeof isAvailable !== 'boolean' || !this.isValidUsernameFormat(username)) {
            this.showUsernameError("Invalid response from server");
            return;
        }

        if (isAvailable) {
            statusElement.textContent = "✓ Username is available";
            statusElement.className = "username-status available";
            reserveBtn.disabled = false;
        } else {
            statusElement.textContent = "✗ Username is taken or invalid";
            statusElement.className = "username-status taken";
            reserveBtn.disabled = true;
        }
    }

    clearUsernameStatus() {
        const statusElement = document.getElementById("usernameStatus");
        const reserveBtn = document.getElementById("reserveUsernameBtn");

        if (statusElement) {
            statusElement.textContent = "";
            statusElement.className = "username-status";
        }

        if (reserveBtn) {
            reserveBtn.disabled = true;
        }
    }

    showUsernameError(error) {
        const statusElement = document.getElementById("usernameStatus");
        if (statusElement) {
            statusElement.textContent = this.sanitizeErrorMessage(error);
            statusElement.className = "username-status invalid";
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
    new LoginClient();
});