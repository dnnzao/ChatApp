// Debug version to test module loading
console.log('🔍 Debug App Loading...');

// Test each module individually
async function testModuleLoading() {
    try {
        console.log('1. Testing ValidationService...');
        const { ValidationService } = await import('./core/ValidationService.js');
        const validator = new ValidationService();
        console.log('✅ ValidationService loaded:', validator.isValidMessage('test'));

        console.log('2. Testing SessionManager...');
        const { SessionManager } = await import('./core/SessionManager.js');
        const sessionManager = new SessionManager();
        console.log('✅ SessionManager loaded:', sessionManager.getCurrentUsername());

        console.log('3. Testing ConnectionManager...');
        const { ConnectionManager } = await import('./core/ConnectionManager.js');
        const connectionManager = new ConnectionManager();
        console.log('✅ ConnectionManager loaded:', connectionManager.getConnectionState());

        console.log('4. Testing UIManager...');
        const { UIManager } = await import('./core/UIManager.js');
        const uiManager = new UIManager(validator);
        console.log('✅ UIManager loaded');

        console.log('5. Testing ChatApplication...');
        const { ChatApplication } = await import('./ChatApplication.js');
        const app = new ChatApplication();
        console.log('✅ ChatApplication loaded');

        // Test initialization
        console.log('6. Testing initialization...');
        const success = await app.initialize();
        console.log('🎯 Initialization result:', success);

        // Make globally available
        window.chatApp = app;
        window.debugApp = {
            validator,
            sessionManager,
            connectionManager,
            uiManager,
            app
        };

        console.log('🎉 All modules loaded successfully!');
        return true;

    } catch (error) {
        console.error('❌ Module loading failed at step:', error);
        console.error('Error stack:', error.stack);

        // Show error to user
        document.body.innerHTML += `
            <div style="position: fixed; top: 20px; left: 20px; background: red; color: white; padding: 20px; border-radius: 8px; z-index: 10000;">
                <h3>🚨 Module Loading Error</h3>
                <p><strong>Error:</strong> ${error.message}</p>
                <p><strong>Check Browser Console for Details</strong></p>
                <button onclick="location.reload()">Refresh Page</button>
            </div>
        `;
        return false;
    }
}

// Global functions for compatibility
window.joinRoom = function (roomName) {
    console.log('Global joinRoom called:', roomName);
    if (window.chatApp) {
        return window.chatApp.joinRoom(roomName);
    } else {
        console.error('Chat app not loaded yet');
    }
};

window.leaveRoom = function (roomName) {
    console.log('Global leaveRoom called:', roomName);
    if (window.chatApp) {
        return window.chatApp.leaveRoom(roomName);
    } else {
        console.error('Chat app not loaded yet');
    }
};

window.switchToRoomFromSidebar = function (roomName) {
    console.log('Global switchToRoomFromSidebar called:', roomName);
    if (window.chatApp) {
        return window.chatApp.switchToRoom(roomName);
    } else {
        console.error('Chat app not loaded yet');
    }
};

// Wait for DOM and test loading
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', testModuleLoading);
} else {
    testModuleLoading();
} 