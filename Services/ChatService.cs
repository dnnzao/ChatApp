using ChatApp.Models;
using ChatApp.Services;
using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using System.Net;

namespace ChatApp.Services {
    public class ChatService : IChatService {
        private readonly ConcurrentDictionary<string, ChatUser> _users = new(); // connectionId -> user
        private readonly ConcurrentDictionary<string, ChatRoom> _rooms = new(); // roomName -> room
        private readonly ConcurrentDictionary<string, string> _globalUsernames = new(); // username -> connectionId
        private readonly ILogger<ChatService> _logger;
        private readonly IMessageRepository _messageRepository;

        // Enhanced rate limiting with multiple tracking methods
        private readonly ConcurrentDictionary<string, DateTime> _lastMessageTime = new();
        private readonly ConcurrentDictionary<string, DateTime> _lastMessageByConnection = new();
        private readonly ConcurrentDictionary<string, int> _connectionsByIp = new();
        private readonly ConcurrentDictionary<string, List<DateTime>> _usernameChecksByConnection = new();

        private readonly TimeSpan _messageInterval = TimeSpan.FromSeconds(1);
        private readonly TimeSpan _usernameCheckInterval = TimeSpan.FromMilliseconds(300);
        private const int MAX_CONNECTIONS_PER_IP = 5;
        private const int MAX_USERNAME_CHECKS_PER_MINUTE = 20;

        // Security patterns for message validation
        private readonly string[] _dangerousPatterns = {
            "<script", "javascript:", "onload=", "onerror=", "onclick=", "onmouseover=",
            "data:text/html", "vbscript:", "expression(", "eval(", "document.cookie",
            "document.write", "window.location", "<iframe", "<object", "<embed",
            "style=expression", "background:url", "-moz-binding"
        };

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

        public ChatService(ILogger<ChatService> logger, IMessageRepository messageRepository) {
            _logger = logger;
            _messageRepository = messageRepository;
            InitializeRooms();
        }

        private void InitializeRooms() {
            foreach (var roomName in _allowedRooms) {
                _rooms.TryAdd(roomName, new ChatRoom { Name = roomName });
                _logger.LogInformation("Initialized room: {RoomName}", roomName);
            }
        }

        // Enhanced security logging
        private void LogSecurityEvent(string eventType, string details, string? connectionId = null, string? ipAddress = null) {
            _logger.LogWarning("Security Event: {EventType} - {Details} - Connection: {ConnectionId} - IP: {IP}",
                              eventType, details, connectionId ?? "Unknown", ipAddress ?? "Unknown");
        }

        // Connection tracking for rate limiting
        public bool CanConnect(string ipAddress, string connectionId) {
            try {
                // Track connections per IP
                _connectionsByIp.AddOrUpdate(ipAddress, 1, (key, count) => count + 1);

                if (_connectionsByIp[ipAddress] > MAX_CONNECTIONS_PER_IP) {
                    LogSecurityEvent("ExcessiveConnections", $"IP exceeded connection limit", connectionId, ipAddress);
                    return false;
                }

                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error checking connection limits");
                return true; // Allow connection if check fails
            }
        }

        public void RemoveConnection(string ipAddress) {
            try {
                _connectionsByIp.AddOrUpdate(ipAddress, 0, (key, count) => Math.Max(0, count - 1));
            } catch (Exception ex) {
                _logger.LogError(ex, "Error removing connection tracking");
            }
        }

        public async Task<bool> ReserveUsernameAsync(string connectionId, string username) {
            try {
                if (!IsValidUsername(username)) {
                    LogSecurityEvent("InvalidUsername", $"Invalid username attempted: {username}", connectionId);
                    return false;
                }

                // Enhanced username validation
                if (ContainsProfanity(username) || ContainsSuspiciousPatterns(username)) {
                    LogSecurityEvent("SuspiciousUsername", $"Suspicious username attempted: {username}", connectionId);
                    return false;
                }

                // Check if username is already taken (case-insensitive)
                var lowerUsername = username.ToLowerInvariant();
                if (_globalUsernames.ContainsKey(lowerUsername)) {
                    _logger.LogInformation("Username already taken: {Username}", username);
                    return false;
                }

                // Remove old username if user had one
                if (_users.TryGetValue(connectionId, out var existingUser)) {
                    _globalUsernames.TryRemove(existingUser.Username.ToLowerInvariant(), out _);
                }

                // Reserve the new username
                _globalUsernames.TryAdd(lowerUsername, connectionId);

                // Create or update user
                var user = new ChatUser {
                    ConnectionId = connectionId,
                    Username = username, // Keep original case
                    CurrentRoom = string.Empty,
                    JoinedRooms = new HashSet<string>()
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
                // Validate room name
                if (!IsValidRoomName(roomName)) {
                    LogSecurityEvent("InvalidRoomAccess", $"Attempt to join invalid room: {roomName}", connectionId);
                    return false;
                }

                // Get user - they must have reserved a username first
                if (!_users.TryGetValue(connectionId, out var user)) {
                    LogSecurityEvent("UnauthorizedRoomJoin", "User attempted to join room without reserved username", connectionId);
                    return false;
                }

                // Get the room
                if (!_rooms.TryGetValue(roomName, out var room)) {
                    _logger.LogError("Room {RoomName} not found in initialized rooms", roomName);
                    return false;
                }

                if (!room.CanJoin) {
                    _logger.LogInformation("Room {RoomName} is full", roomName);
                    return false;
                }

                // Check if user is already in this room
                if (user.JoinedRooms.Contains(roomName)) {
                    _logger.LogInformation("User {Username} already in room {RoomName}", user.Username, roomName);
                    return true;
                }

                // Add user to room
                user.JoinedRooms.Add(roomName);
                user.CurrentRoom = roomName;
                room.Users.Add(user.Username);
                user.LastActivity = DateTime.UtcNow;

                _logger.LogInformation("User {Username} joined room {RoomName}", user.Username, roomName);
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error joining room {RoomName}", roomName);
                return false;
            }
        }

        public async Task<bool> LeaveRoomAsync(string connectionId, string roomName) {
            try {
                if (!IsValidRoomName(roomName)) {
                    return false;
                }

                if (!_users.TryGetValue(connectionId, out var user)) {
                    return false;
                }

                if (_rooms.TryGetValue(roomName, out var room)) {
                    room.Users.Remove(user.Username);
                }

                user.JoinedRooms.Remove(roomName);
                user.LastActivity = DateTime.UtcNow;

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
                if (!IsValidRoomName(roomName)) {
                    return false;
                }

                if (!_users.TryGetValue(connectionId, out var user)) {
                    return false;
                }

                // Check if user is in this room
                if (!user.JoinedRooms.Contains(roomName)) {
                    LogSecurityEvent("UnauthorizedRoomSwitch",
                        $"User {user.Username} attempted to switch to room {roomName} they're not in", connectionId);
                    return false;
                }

                user.CurrentRoom = roomName;
                user.LastActivity = DateTime.UtcNow;

                _logger.LogInformation("User {Username} switched to room {RoomName}", user.Username, roomName);
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error switching to room {RoomName}", roomName);
                return false;
            }
        }

        public async Task<bool> SendMessageAsync(ChatMessage message) {
            try {
                // Enhanced message validation
                if (!IsValidMessage(message.Message) || !IsValidUsername(message.User) || !IsValidRoomName(message.Room)) {
                    LogSecurityEvent("InvalidMessage",
                        $"Invalid message from {message.User} in {message.Room}", null);
                    return false;
                }

                // Check for malicious content
                if (ContainsMaliciousContent(message.Message)) {
                    LogSecurityEvent("MaliciousContent",
                        $"Malicious content detected from {message.User}", null);
                    return false;
                }

                // Enhanced rate limiting
                var now = DateTime.UtcNow;
                var userRoomKey = $"{message.User}_{message.Room}";

                if (_lastMessageTime.TryGetValue(userRoomKey, out var lastTime) &&
                    now - lastTime < _messageInterval) {
                    LogSecurityEvent("RateLimitExceeded", $"Rate limit exceeded for user {message.User}", null);
                    return false;
                }

                _lastMessageTime.AddOrUpdate(userRoomKey, now, (_, _) => now);

                // Sanitize message content
                message.Message = SanitizeMessage(message.Message);
                message.User = WebUtility.HtmlEncode(message.User);
                message.Room = WebUtility.HtmlEncode(message.Room);

                // Save message to database
                try {
                    var messageId = await _messageRepository.SaveMessageAsync(message);
                    message.Id = messageId;
                    _logger.LogInformation("Message saved with ID {MessageId} by {User} in {Room}",
                        messageId, message.User, message.Room);
                } catch (Exception ex) {
                    _logger.LogError(ex, "Failed to save message to database from {User} in {Room}",
                        message.User, message.Room);
                    // Continue without failing the message send
                }

                _logger.LogInformation("Message sent by {User} in {Room}: {MessagePreview}",
                    message.User, message.Room, message.Message.Substring(0, Math.Min(50, message.Message.Length)));
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error sending message from {User}", message.User);
                return false;
            }
        }

        // Enhanced username check with rate limiting
        public bool CheckUsernameAvailability(string connectionId, string username) {
            try {
                // Rate limiting for username checks
                var now = DateTime.UtcNow;
                if (!_usernameChecksByConnection.ContainsKey(connectionId)) {
                    _usernameChecksByConnection[connectionId] = new List<DateTime>();
                }

                var checks = _usernameChecksByConnection[connectionId];

                // Remove checks older than 1 minute
                checks.RemoveAll(time => now - time > TimeSpan.FromMinutes(1));

                if (checks.Count >= MAX_USERNAME_CHECKS_PER_MINUTE) {
                    LogSecurityEvent("ExcessiveUsernameChecks",
                        $"Connection exceeded username check limit", connectionId);
                    return false;
                }

                checks.Add(now);
                return true;
            } catch (Exception ex) {
                _logger.LogError(ex, "Error checking username availability rate limit");
                return false;
            }
        }

        // Enhanced validation methods
        public bool IsValidRoomName(string roomName) {
            if (string.IsNullOrWhiteSpace(roomName)) return false;
            if (roomName.Length > 30) return false;
            return _allowedRooms.Contains(roomName.ToLowerInvariant());
        }

        public bool IsValidUsername(string username) {
            if (string.IsNullOrWhiteSpace(username)) return false;
            if (username.Length < 3 || username.Length > 20) return false;

            // Only allow alphanumeric and some special characters
            if (!Regex.IsMatch(username, @"^[a-zA-Z0-9_-]+$")) return false;

            // Additional security checks
            if (ContainsSuspiciousPatterns(username)) return false;

            return true;
        }

        public bool IsValidMessage(string message) {
            if (string.IsNullOrWhiteSpace(message)) return false;
            if (message.Length > 500) return false;

            // Check for suspicious patterns
            return !ContainsMaliciousContent(message);
        }

        // Security helper methods
        private bool ContainsMaliciousContent(string content) {
            if (string.IsNullOrEmpty(content)) return false;

            var lowerContent = content.ToLowerInvariant();
            return _dangerousPatterns.Any(pattern => lowerContent.Contains(pattern));
        }

        private bool ContainsSuspiciousPatterns(string input) {
            if (string.IsNullOrEmpty(input)) return false;

            var lowerInput = input.ToLowerInvariant();

            // Check for suspicious patterns in usernames
            var suspiciousPatterns = new[] {
                "admin", "system", "bot", "null", "undefined", "script", "test"
            };

            return suspiciousPatterns.Any(pattern => lowerInput.Contains(pattern));
        }

        private bool ContainsProfanity(string input) {
            // Basic profanity filter - in production, use a comprehensive library
            if (string.IsNullOrEmpty(input)) return false;

            var lowerInput = input.ToLowerInvariant();
            var basicProfanity = new[] { "badword1", "badword2" }; // Add actual words as needed

            return basicProfanity.Any(word => lowerInput.Contains(word));
        }

        private string SanitizeMessage(string message) {
            if (string.IsNullOrEmpty(message)) return string.Empty;

            // HTML encode the message
            var sanitized = WebUtility.HtmlEncode(message);

            // Additional sanitization if needed
            sanitized = sanitized.Trim();

            return sanitized;
        }

        // Existing methods with enhanced security
        public List<string> GetAvailableRooms() {
            return _allowedRooms.ToList();
        }

        public Dictionary<string, int> GetRoomUserCounts() {
            try {
                return _rooms.ToDictionary(
                    kvp => kvp.Key,
                    kvp => Math.Min(kvp.Value.Users.Count, 999) // Cap displayed count
                );
            } catch (Exception ex) {
                _logger.LogError(ex, "Error getting room user counts");
                return new Dictionary<string, int>();
            }
        }

        public List<string> GetUserJoinedRooms(string connectionId) {
            if (_users.TryGetValue(connectionId, out var user)) {
                return user.JoinedRooms.ToList();
            }
            return new List<string>();
        }

        public bool IsUsernameAvailable(string username) {
            if (!IsValidUsername(username)) return false;
            return !_globalUsernames.ContainsKey(username.ToLowerInvariant());
        }

        public ChatUser? GetUser(string connectionId) {
            _users.TryGetValue(connectionId, out var user);
            return user;
        }

        public ChatRoom? GetRoom(string roomName) {
            if (!IsValidRoomName(roomName)) return null;
            _rooms.TryGetValue(roomName, out var room);
            return room;
        }

        public void RemoveUser(string connectionId) {
            try {
                if (_users.TryGetValue(connectionId, out var user)) {
                    // Remove from global usernames
                    _globalUsernames.TryRemove(user.Username.ToLowerInvariant(), out _);

                    // Remove from all rooms
                    foreach (var roomName in user.JoinedRooms.ToList()) {
                        if (_rooms.TryGetValue(roomName, out var room)) {
                            room.Users.Remove(user.Username);
                        }
                    }

                    _logger.LogInformation("User {Username} removed from system", user.Username);
                }

                _users.TryRemove(connectionId, out _);

                // Clean up rate limiting data
                _lastMessageTime.Keys
                    .Where(key => key.StartsWith($"{connectionId}_"))
                    .ToList()
                    .ForEach(key => _lastMessageTime.TryRemove(key, out _));

                _usernameChecksByConnection.TryRemove(connectionId, out _);
                _lastMessageByConnection.TryRemove(connectionId, out _);
            } catch (Exception ex) {
                _logger.LogError(ex, "Error removing user for connection {ConnectionId}", connectionId);
            }
        }

        // Cleanup old data periodically (call this from a background service)
        public void CleanupOldData() {
            try {
                var cutoffTime = DateTime.UtcNow.AddHours(-24);

                // Clean up old username checks
                foreach (var kvp in _usernameChecksByConnection.ToList()) {
                    kvp.Value.RemoveAll(time => time < cutoffTime);
                    if (!kvp.Value.Any()) {
                        _usernameChecksByConnection.TryRemove(kvp.Key, out _);
                    }
                }

                // Clean up old message times
                foreach (var kvp in _lastMessageTime.ToList()) {
                    if (kvp.Value < cutoffTime) {
                        _lastMessageTime.TryRemove(kvp.Key, out _);
                    }
                }
            } catch (Exception ex) {
                _logger.LogError(ex, "Error cleaning up old data");
            }
        }

        // Message history methods
        public async Task<List<ChatMessage>> GetRecentMessagesAsync(string roomName, int count = 50) {
            try {
                if (!IsValidRoomName(roomName)) {
                    _logger.LogWarning("Invalid room name requested for message history: {RoomName}", roomName);
                    return new List<ChatMessage>();
                }

                return await _messageRepository.GetRecentMessagesAsync(roomName, count);
            } catch (Exception ex) {
                _logger.LogError(ex, "Error getting recent messages for room {RoomName}", roomName);
                return new List<ChatMessage>();
            }
        }

        public async Task<List<ChatMessage>> GetMessagesByUserAsync(string username, int count = 100) {
            try {
                if (!IsValidUsername(username)) {
                    _logger.LogWarning("Invalid username requested for message history: {Username}", username);
                    return new List<ChatMessage>();
                }

                return await _messageRepository.GetMessagesByUserAsync(username, count);
            } catch (Exception ex) {
                _logger.LogError(ex, "Error getting messages by user {Username}", username);
                return new List<ChatMessage>();
            }
        }

        public async Task<List<ChatMessage>> SearchMessagesAsync(string roomName, string searchTerm, int count = 50) {
            try {
                if (!IsValidRoomName(roomName) || string.IsNullOrWhiteSpace(searchTerm)) {
                    _logger.LogWarning("Invalid search parameters: room={RoomName}, term={SearchTerm}", roomName, searchTerm);
                    return new List<ChatMessage>();
                }

                // Basic sanitization of search term
                searchTerm = searchTerm.Trim();
                if (searchTerm.Length > 100) {
                    searchTerm = searchTerm.Substring(0, 100);
                }

                return await _messageRepository.SearchMessagesAsync(roomName, searchTerm, count);
            } catch (Exception ex) {
                _logger.LogError(ex, "Error searching messages in room {RoomName} for term {SearchTerm}", roomName, searchTerm);
                return new List<ChatMessage>();
            }
        }
    }
}