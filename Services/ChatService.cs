using ChatApp.Models;
using ChatApp.Services;
using System.Collections.Concurrent;
using System.Text.RegularExpressions;

namespace ChatApp.Services {
    public class ChatService : IChatService {
        private readonly ConcurrentDictionary<string, ChatUser> _users = new(); // connectionId -> user
        private readonly ConcurrentDictionary<string, ChatRoom> _rooms = new(); // roomName -> room
        private readonly ConcurrentDictionary<string, string> _globalUsernames = new(); // username -> connectionId
        private readonly ILogger<ChatService> _logger;

        // Rate limiting
        private readonly ConcurrentDictionary<string, DateTime> _lastMessageTime = new();
        private readonly TimeSpan _messageInterval = TimeSpan.FromSeconds(1);

        // Pre-defined rooms
        private readonly List<string> _allowedRooms = new()
        {
            "general",
            "family",
            "friends",
            "gaming",
            "tech",
            "random"
        };

        public ChatService(ILogger<ChatService> logger) {
            _logger = logger;
            InitializeRooms();
        }

        private void InitializeRooms() {
            foreach (var roomName in _allowedRooms) {
                _rooms.TryAdd(roomName, new ChatRoom { Name = roomName });
                _logger.LogInformation("Initialized room: {RoomName}", roomName);
            }
        }

        public async Task<bool> ReserveUsernameAsync(string connectionId, string username) {
            try {
                if (!IsValidUsername(username)) {
                    _logger.LogWarning("Invalid username attempted: {Username}", username);
                    return false;
                }

                // Check if username is already taken
                if (_globalUsernames.ContainsKey(username.ToLowerInvariant())) {
                    _logger.LogWarning("Username already taken: {Username}", username);
                    return false;
                }

                // Remove old username if user had one
                if (_users.TryGetValue(connectionId, out var existingUser)) {
                    _globalUsernames.TryRemove(existingUser.Username.ToLowerInvariant(), out _);
                }

                // Reserve the new username
                _globalUsernames.TryAdd(username.ToLowerInvariant(), connectionId);

                // Create or update user
                var user = new ChatUser {
                    ConnectionId = connectionId,
                    Username = username,
                    CurrentRoom = string.Empty,
                    JoinedRooms = new HashSet<string>() // Multi-room support
                };

                _users.AddOrUpdate(connectionId, user, (_, _) => user);

                _logger.LogInformation("Username reserved: {Username} for connection {ConnectionId}", username, connectionId);
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error reserving username {Username}", username);
                return false;
            }
        }

        public async Task<bool> JoinRoomAsync(string connectionId, string roomName) {
            try {
                // Get user - they must have reserved a username first
                if (!_users.TryGetValue(connectionId, out var user)) {
                    _logger.LogWarning("User attempted to join room without reserved username");
                    return false;
                }

                // Check if room is allowed
                if (!_allowedRooms.Contains(roomName.ToLowerInvariant())) {
                    _logger.LogWarning("Attempt to join non-existent room: {RoomName}", roomName);
                    return false;
                }

                // Get the room
                if (!_rooms.TryGetValue(roomName, out var room)) {
                    _logger.LogError("Room {RoomName} not found in initialized rooms", roomName);
                    return false;
                }

                if (!room.CanJoin) {
                    _logger.LogWarning("Room {RoomName} is full", roomName);
                    return false;
                }

                // Check if user is already in this room
                if (user.JoinedRooms.Contains(roomName)) {
                    _logger.LogInformation("User {Username} already in room {RoomName}", user.Username, roomName);
                    return true; // Already in room, that's fine
                }

                // Add user to room
                user.JoinedRooms.Add(roomName);
                user.CurrentRoom = roomName; // Set as active room
                room.Users.Add(user.Username);

                _logger.LogInformation("User {Username} joined room {RoomName}", user.Username, roomName);
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error joining room {RoomName}", roomName);
                return false;
            }
        }

        public async Task<bool> LeaveRoomAsync(string connectionId, string roomName) {
            try {
                if (!_users.TryGetValue(connectionId, out var user)) {
                    return false;
                }

                if (_rooms.TryGetValue(roomName, out var room)) {
                    room.Users.Remove(user.Username);
                }

                user.JoinedRooms.Remove(roomName);

                // If this was the current room, switch to another room or none
                if (user.CurrentRoom == roomName) {
                    user.CurrentRoom = user.JoinedRooms.FirstOrDefault() ?? string.Empty;
                }

                _logger.LogInformation("User {Username} left room {RoomName}", user.Username, roomName);
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error leaving room {RoomName}", roomName);
                return false;
            }
        }

        public async Task<bool> SwitchToRoomAsync(string connectionId, string roomName) {
            try {
                if (!_users.TryGetValue(connectionId, out var user)) {
                    return false;
                }

                // Check if user is in this room
                if (!user.JoinedRooms.Contains(roomName)) {
                    _logger.LogWarning("User {Username} attempted to switch to room {RoomName} they're not in", user.Username, roomName);
                    return false;
                }

                user.CurrentRoom = roomName;
                _logger.LogInformation("User {Username} switched to room {RoomName}", user.Username, roomName);
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error switching to room {RoomName}", roomName);
                return false;
            }
        }

        public async Task<bool> SendMessageAsync(ChatMessage message) {
            try {
                if (!IsValidMessage(message.Message) || !IsValidUsername(message.User)) {
                    _logger.LogWarning("Invalid message from {User} in {Room}", message.User, message.Room);
                    return false;
                }

                // Check if room is allowed
                if (!_allowedRooms.Contains(message.Room.ToLowerInvariant())) {
                    _logger.LogWarning("Message sent to non-existent room: {Room}", message.Room);
                    return false;
                }

                // Rate limiting
                var now = DateTime.UtcNow;
                var key = $"{message.User}_{message.Room}";

                if (_lastMessageTime.TryGetValue(key, out var lastTime) && now - lastTime < _messageInterval) {
                    _logger.LogWarning("Rate limit exceeded for user {User}", message.User);
                    return false;
                }

                _lastMessageTime.AddOrUpdate(key, now, (_, _) => now);

                // HTML encode message to prevent XSS
                message.Message = System.Net.WebUtility.HtmlEncode(message.Message);
                message.User = System.Net.WebUtility.HtmlEncode(message.User);

                _logger.LogInformation("Message sent by {User} in {Room}", message.User, message.Room);
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error sending message from {User}", message.User);
                return false;
            }
        }

        public List<string> GetAvailableRooms() {
            return _allowedRooms.ToList();
        }

        public Dictionary<string, int> GetRoomUserCounts() {
            return _rooms.ToDictionary(
                kvp => kvp.Key,
                kvp => kvp.Value.Users.Count
            );
        }

        public List<string> GetUserJoinedRooms(string connectionId) {
            if (_users.TryGetValue(connectionId, out var user)) {
                return user.JoinedRooms.ToList();
            }
            return new List<string>();
        }

        public bool IsUsernameAvailable(string username) {
            return !_globalUsernames.ContainsKey(username.ToLowerInvariant());
        }

        public bool IsValidRoomName(string roomName) {
            if (string.IsNullOrWhiteSpace(roomName)) return false;
            return _allowedRooms.Contains(roomName.ToLowerInvariant());
        }

        public bool IsValidUsername(string username) {
            if (string.IsNullOrWhiteSpace(username)) return false;
            if (username.Length < 1 || username.Length > 20) return false;

            // Only allow alphanumeric and some special characters
            return Regex.IsMatch(username, @"^[a-zA-Z0-9_-]+$");
        }

        public bool IsValidMessage(string message) {
            if (string.IsNullOrWhiteSpace(message)) return false;
            return message.Length <= 500;
        }

        public ChatUser? GetUser(string connectionId) {
            _users.TryGetValue(connectionId, out var user);
            return user;
        }

        public ChatRoom? GetRoom(string roomName) {
            _rooms.TryGetValue(roomName, out var room);
            return room;
        }

        public void RemoveUser(string connectionId) {
            if (_users.TryGetValue(connectionId, out var user)) {
                // Remove from global usernames
                _globalUsernames.TryRemove(user.Username.ToLowerInvariant(), out _);

                // Remove from all rooms
                foreach (var roomName in user.JoinedRooms) {
                    if (_rooms.TryGetValue(roomName, out var room)) {
                        room.Users.Remove(user.Username);
                    }
                }
            }

            _users.TryRemove(connectionId, out _);
        }
    }
}