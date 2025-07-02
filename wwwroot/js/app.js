import { ChatApplication } from './ChatApplication.js';

/**
 * Application Entry Point
 * Initializes the chat application when DOM is ready
 */
class AppBootstrapper {
    constructor() {
        this.app = null;
        this.isReady = false;
    }

    /**
     * Boots the application
     */
    async boot() {
        console.log('🚀 Starting Chat Application...');

        try {
            // Wait for DOM to be ready
            await this._waitForDOMReady();

            // Create and initialize application
            this.app = new ChatApplication();
            const success = await this.app.initialize();

            if (success) {
                // Make app globally available for debugging and compatibility
                window.chatApp = this.app;
                this.isReady = true;

                // Add global functions for HTML onclick handlers
                this._addGlobalFunctions();

                console.log('✅ Chat Application started successfully');
                console.log('📊 Application stats:', this.app.getStats());

                // Add development helpers in debug mode
                if (this._isDebugMode()) {
                    this._addDebugHelpers();
                }

                // Add global error handler
                this._setupGlobalErrorHandler();

            } else {
                console.error('❌ Failed to start Chat Application');
                this._handleBootFailure();
            }

        } catch (error) {
            console.error('💥 Critical error during application boot:', error);
            this._handleBootFailure();
        }
    }

    /**
     * Shuts down the application gracefully
     */
    async shutdown() {
        console.log('🛑 Shutting down Chat Application...');

        if (this.app) {
            try {
                await this.app.logout();
                this.app.dispose();
                this.app = null;
                window.chatApp = null;
                this.isReady = false;
                console.log('✅ Chat Application shut down successfully');
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
            }
        }
    }

    /**
     * Gets application status
     * @returns {object}
     */
    getStatus() {
        return {
            isReady: this.isReady,
            hasApp: !!this.app,
            stats: this.app ? this.app.getStats() : null
        };
    }

    // Private methods

    /**
     * Waits for DOM to be ready
     * @returns {Promise<void>}
     * @private
     */
    _waitForDOMReady() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }

    /**
     * Checks if debug mode is enabled
     * @returns {boolean}
     * @private
     */
    _isDebugMode() {
        return localStorage.getItem('chatDebug') === 'true' ||
            window.location.hostname === 'localhost' ||
            window.location.search.includes('debug=true');
    }

    /**
     * Adds global functions for HTML onclick handlers
     * @private
     */
    _addGlobalFunctions() {
        const self = this; // Capture 'this' reference

        // Global function for joining rooms
        window.joinRoom = (roomName) => {
            console.log('Global joinRoom called:', roomName);
            if (self.app && self.isReady) {
                return self.app.joinRoom(roomName);
            } else {
                console.error('Chat application not ready');
                return Promise.resolve(false);
            }
        };

        // Global function for leaving rooms
        window.leaveRoom = (roomName) => {
            console.log('Global leaveRoom called:', roomName);
            if (self.app && self.isReady) {
                return self.app.leaveRoom(roomName);
            } else {
                console.error('Chat application not ready');
                return Promise.resolve(false);
            }
        };

        // Global function for switching rooms from sidebar - FIX THE ASYNC ISSUE
        window.switchToRoomFromSidebar = async (roomName) => {
            console.log('🌐 Global switchToRoomFromSidebar called:', roomName);

            if (self.app && self.isReady) {
                try {
                    console.log('🌐 About to call app.switchToRoom...');
                    const result = await self.app.switchToRoom(roomName);
                    console.log('🌐 Global switchToRoomFromSidebar result:', result);
                    return result;
                } catch (error) {
                    console.error('🌐 Global switchToRoomFromSidebar error:', error);
                    return false;
                }
            } else {
                console.error('🌐 Chat application not ready');
                return false;
            }
        };

        // Global function for sending messages
        window.sendMessage = () => {
            console.log('Global sendMessage called');
            if (self.app && self.isReady) {
                return self.app.sendMessage();
            } else {
                console.error('Chat application not ready');
                return Promise.resolve(false);
            }
        };

        console.log('✅ Global functions added for HTML compatibility');
    }

    /**
     * Adds debug helpers for development
     * @private
     */
    _addDebugHelpers() {
        console.log('🐛 Debug mode enabled - Adding development helpers');

        // Global debug object
        window.chatDebug = {
            app: this.app,
            getStats: () => this.app.getStats(),
            getValidationConfig: () => this.app._getDependency('validationService').getValidationConfig(),
            testMessage: (message) => {
                const validation = this.app._getDependency('validationService');
                return {
                    isValid: validation.isValidMessage(message),
                    sanitized: validation.sanitizeText(message)
                };
            },
            testRoomName: (roomName) => {
                const validation = this.app._getDependency('validationService');
                return validation.isValidRoomName(roomName);
            },
            clearStorage: () => {
                sessionStorage.clear();
                localStorage.clear();
                console.log('🗑️ Storage cleared');
            },
            exportStats: () => {
                const stats = this.app.getStats();
                const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chat-stats-${new Date().toISOString()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        };

        // Add performance monitoring
        this._addPerformanceMonitoring();

        // Log key presses for debugging
        this._addDebugKeyHandlers();
    }

    /**
     * Adds performance monitoring
     * @private
     */
    _addPerformanceMonitoring() {
        let messageCount = 0;
        let lastMemoryCheck = performance.now();

        const checkPerformance = () => {
            const now = performance.now();

            if (now - lastMemoryCheck > 30000) { // Every 30 seconds
                if (window.performance && window.performance.memory) {
                    const memory = window.performance.memory;
                    console.log('📊 Memory usage:', {
                        used: Math.round(memory.usedJSHeapSize / 1024 / 1024) + ' MB',
                        total: Math.round(memory.totalJSHeapSize / 1024 / 1024) + ' MB',
                        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + ' MB',
                        messages: messageCount
                    });
                }
                lastMemoryCheck = now;
            }
        };

        // Monitor every 5 seconds
        setInterval(checkPerformance, 5000);

        // Track message count
        const originalRenderMessage = this.app._getDependency('uiManager').renderMessage;
        this.app._getDependency('uiManager').renderMessage = function (...args) {
            messageCount++;
            return originalRenderMessage.apply(this, args);
        };
    }

    /**
     * Adds debug key handlers
     * @private
     */
    _addDebugKeyHandlers() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+D = Toggle detailed debug logging
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                const debugLevel = localStorage.getItem('chatDebugLevel') || 'info';
                const newLevel = debugLevel === 'info' ? 'debug' : 'info';
                localStorage.setItem('chatDebugLevel', newLevel);
                console.log(`🐛 Debug level changed to: ${newLevel}`);
            }

            // Ctrl+Shift+S = Export stats
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                window.chatDebug.exportStats();
            }

            // Ctrl+Shift+C = Clear storage
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                if (confirm('Clear all stored data? This will log you out.')) {
                    window.chatDebug.clearStorage();
                    window.location.reload();
                }
            }
        });
    }

    /**
     * Sets up global error handler
     * @private
     */
    _setupGlobalErrorHandler() {
        window.addEventListener('error', (event) => {
            console.error('🚨 Global JavaScript error:', event.error);

            if (this.app) {
                try {
                    this.app._handleError(event.error);
                } catch (handlerError) {
                    console.error('❌ Error in error handler:', handlerError);
                }
            }
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('🚨 Unhandled promise rejection:', event.reason);

            if (this.app) {
                try {
                    this.app._handleError(event.reason);
                } catch (handlerError) {
                    console.error('❌ Error in rejection handler:', handlerError);
                }
            }
        });
    }

    /**
     * Handles application boot failure
     * @private
     */
    _handleBootFailure() {
        console.error('💔 Application failed to start');

        // Try to show user-friendly error
        try {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #f44336;
                color: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                z-index: 10000;
                text-align: center;
                font-family: Arial, sans-serif;
            `;
            errorDiv.innerHTML = `
                <h3>🚨 Chat Application Failed to Start</h3>
                <p>Please refresh the page or contact support if the problem persists.</p>
                <button onclick="window.location.reload()" style="
                    background: white;
                    color: #f44336;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 10px;
                ">Refresh Page</button>
            `;
            document.body.appendChild(errorDiv);
        } catch (error) {
            console.error('Failed to show error UI:', error);
            // Fallback to alert
            alert('Chat application failed to start. Please refresh the page.');
        }
    }
}

// Create and start the application
const bootstrapper = new AppBootstrapper();

// Boot the application
bootstrapper.boot().catch(error => {
    console.error('💥 Fatal error during application boot:', error);
});

// Global access for debugging
window.appBootstrapper = bootstrapper;

// Handle page unload
window.addEventListener('beforeunload', () => {
    bootstrapper.shutdown();
});

// Export for module usage
export { AppBootstrapper }; 