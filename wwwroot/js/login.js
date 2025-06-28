class LoginClient {
    constructor() {
        this.connection = new signalR.HubConnectionBuilder().withUrl("/chatHub").build();
        this.isConnected = false;

        this.initializeConnection();
        this.setupEventHandlers();
    }

    async initializeConnection() {
        try {
            await this.connection.start();
            this.isConnected = true;
            this.updateConnectionStatus("Connected");
            document.getElementById("reserveUsernameBtn").disabled = false;
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
            document.getElementById("reserveUsernameBtn").disabled = true;
            setTimeout(() => this.initializeConnection(), 5000);
        });

        // Username management events
        this.connection.on("UsernameReserved", (username) => {
            // Store username in sessionStorage for the chat page
            sessionStorage.setItem("chatUsername", username);

            // Redirect to chat page
            window.location.href = "/Chat";
        });

        this.connection.on("UsernameReservationFailed", (error) => {
            this.showUsernameError(error);
        });

        this.connection.on("UsernameAvailability", (username, isAvailable) => {
            this.updateUsernameStatus(username, isAvailable);
        });

        // DOM event handlers
        this.setupDOMEventHandlers();
    }

    setupDOMEventHandlers() {
        // Username input and validation
        const usernameInput = document.getElementById("usernameInput");
        const reserveBtn = document.getElementById("reserveUsernameBtn");

        usernameInput.addEventListener("input", (e) => {
            const username = e.target.value.trim();
            if (username.length >= 3 && this.isConnected) {
                this.connection.invoke("CheckUsernameAvailability", username);
            } else {
                this.clearUsernameStatus();
                reserveBtn.disabled = true;
            }
        });

        usernameInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && !reserveBtn.disabled) {
                this.reserveUsername();
            }
        });

        reserveBtn.addEventListener("click", () => this.reserveUsername());
    }

    async reserveUsername() {
        const username = document.getElementById("usernameInput").value.trim();
        if (!username || !this.isConnected) return;

        // Disable button to prevent double-click
        const reserveBtn = document.getElementById("reserveUsernameBtn");
        reserveBtn.disabled = true;
        reserveBtn.textContent = "Entering...";

        try {
            await this.connection.invoke("ReserveUsername", username);
        } catch (err) {
            console.error("Error reserving username:", err);
            this.showUsernameError("Failed to reserve username. Please try again.");

            // Re-enable button
            reserveBtn.disabled = false;
            reserveBtn.textContent = "Enter Chat";
        }
    }

    // UI Update Methods
    updateConnectionStatus(status) {
        const statusElement = document.getElementById("connectionStatus");
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `connection-status ${status.toLowerCase().replace(' ', '-')}`;
        }
    }

    updateUsernameStatus(username, isAvailable) {
        const statusElement = document.getElementById("usernameStatus");
        const reserveBtn = document.getElementById("reserveUsernameBtn");

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
        statusElement.textContent = "";
        statusElement.className = "username-status";
        document.getElementById("reserveUsernameBtn").disabled = true;
    }

    showUsernameError(error) {
        const statusElement = document.getElementById("usernameStatus");
        statusElement.textContent = error;
        statusElement.className = "username-status invalid";
    }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
    new LoginClient();
});