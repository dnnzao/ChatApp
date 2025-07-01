using Microsoft.AspNetCore.SignalR;
using ChatApp.Services;
using ChatApp.Models;

namespace ChatApp.Hubs {
    public class ChatHub : Hub {
        private readonly IChatService _chatService;
        private readonly ILogger<ChatHub> _logger;

        public ChatHub(IChatService chatService, ILogger<ChatHub> logger) {
            _chatService = chatService;
            _logger = logger;
        }

        public async Task ReserveUsername(string username) {
            try {
                var success = await _chatService.ReserveUsernameAsync(Context.ConnectionId, username);

                if (success) {
                    await Clients.Caller.SendAsync("UsernameReserved", username);

                    // Send available rooms and their user counts
                    var rooms = _chatService.GetAvailableRooms();
                    var roomCounts = _chatService.GetRoomUserCounts();
                    await Clients.Caller.SendAsync("RoomsAvailable", rooms, roomCounts);
                } else {
                    await Clients.Caller.SendAsync("UsernameReservationFailed", "Username is already taken or invalid.");
                }
            } catch (Exception ex) {
                _logger.LogError(ex, "Error in ReserveUsername for {Username}", username);
                await Clients.Caller.SendAsync("Error", "An error occurred while reserving username.");
            }
        }

        public async Task JoinRoom(string roomName) {
            try {
                var user = _chatService.GetUser(Context.ConnectionId);
                if (user == null) {
                    await Clients.Caller.SendAsync("JoinFailed", "Please set a username first.");
                    return;
                }

                var success = await _chatService.JoinRoomAsync(Context.ConnectionId, roomName);

                if (success) {
                    await Groups.AddToGroupAsync(Context.ConnectionId, roomName);
                    await Clients.Group(roomName).SendAsync("UserJoined", $"{user.Username} joined {roomName}");
                    await Clients.Caller.SendAsync("JoinedRoom", roomName);

                    // Load and send recent message history for this room
                    try {
                        var recentMessages = await _chatService.GetRecentMessagesAsync(roomName, 50);
                        _logger.LogInformation("Retrieved {Count} messages from database for room {RoomName}", 
                                             recentMessages.Count, roomName);
                        
                        if (recentMessages.Any()) {
                            await Clients.Caller.SendAsync("MessageHistory", roomName, recentMessages);
                            _logger.LogInformation("Sent {Count} historical messages to user {Username} for room {RoomName}",
                                                 recentMessages.Count, user.Username, roomName);
                        } else {
                            _logger.LogInformation("No historical messages found for room {RoomName}", roomName);
                        }
                    } catch (Exception historyEx) {
                        _logger.LogError(historyEx, "Failed to load message history for room {RoomName}", roomName);
                        // Don't fail the join operation if history loading fails
                    }

                    // Update room counts for all users
                    var roomCounts = _chatService.GetRoomUserCounts();
                    await Clients.All.SendAsync("RoomCountsUpdated", roomCounts);
                } else {
                    await Clients.Caller.SendAsync("JoinFailed", "Failed to join room.");
                }
            } catch (Exception ex) {
                _logger.LogError(ex, "Error in JoinRoom for {RoomName}", roomName);
                await Clients.Caller.SendAsync("Error", "An error occurred while joining the room.");
            }
        }

        public async Task LeaveRoom(string roomName) {
            try {
                var user = _chatService.GetUser(Context.ConnectionId);
                if (user == null) return;

                var success = await _chatService.LeaveRoomAsync(Context.ConnectionId, roomName);

                if (success) {
                    await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomName);
                    await Clients.Group(roomName).SendAsync("UserLeft", $"{user.Username} left {roomName}");
                    await Clients.Caller.SendAsync("LeftRoom", roomName);

                    // Update room counts for all users
                    var roomCounts = _chatService.GetRoomUserCounts();
                    await Clients.All.SendAsync("RoomCountsUpdated", roomCounts);
                }
            } catch (Exception ex) {
                _logger.LogError(ex, "Error in LeaveRoom for {RoomName}", roomName);
            }
        }

        public async Task SwitchToRoom(string roomName) {
            try {
                var user = _chatService.GetUser(Context.ConnectionId);
                if (user == null) return;

                var success = await _chatService.SwitchToRoomAsync(Context.ConnectionId, roomName);

                if (success) {
                    await Clients.Caller.SendAsync("SwitchedToRoom", roomName);
                } else {
                    await Clients.Caller.SendAsync("SwitchFailed", "You are not in that room.");
                }
            } catch (Exception ex) {
                _logger.LogError(ex, "Error in SwitchToRoom for {RoomName}", roomName);
            }
        }

        public async Task SendMessage(string message) {
            try {
                var user = _chatService.GetUser(Context.ConnectionId);
                if (user == null || string.IsNullOrEmpty(user.CurrentRoom)) {
                    await Clients.Caller.SendAsync("MessageFailed", "Please join a room first.");
                    return;
                }

                var chatMessage = new ChatMessage {
                    Room = user.CurrentRoom,
                    User = user.Username,
                    Message = message
                };

                var success = await _chatService.SendMessageAsync(chatMessage);

                if (success) {
                    await Clients.Group(user.CurrentRoom).SendAsync("ReceiveMessage", chatMessage.User, chatMessage.Message, user.CurrentRoom);
                } else {
                    await Clients.Caller.SendAsync("MessageFailed", "Message could not be sent. Please check your input or try again later.");
                }
            } catch (Exception ex) {
                _logger.LogError(ex, "Error sending message from user");
                await Clients.Caller.SendAsync("Error", "An error occurred while sending the message.");
            }
        }
        public override async Task OnConnectedAsync() {
            var ipAddress = Context.GetHttpContext()?.Connection?.RemoteIpAddress?.ToString() ?? "unknown";
            var chatService = _chatService as ChatService;

            if (chatService?.CanConnect(ipAddress, Context.ConnectionId) == false) {
                _logger.LogWarning("Connection rejected for IP: {IP}", ipAddress);
                Context.Abort();
                return;
            }

            _logger.LogInformation("New connection from IP: {IP}, Connection: {ConnectionId}", ipAddress, Context.ConnectionId);
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception) {
            try {
                var ipAddress = Context.GetHttpContext()?.Connection?.RemoteIpAddress?.ToString() ?? "unknown";
                var chatService = _chatService as ChatService;
                chatService?.RemoveConnection(ipAddress);

                var user = _chatService.GetUser(Context.ConnectionId);

                if (user != null) {
                    // Notify all rooms the user was in
                    foreach (var roomName in user.JoinedRooms) {
                        await Clients.Group(roomName).SendAsync("UserLeft", $"{user.Username} disconnected from {roomName}");
                    }

                    // Update room counts for all users
                    _chatService.RemoveUser(Context.ConnectionId);
                    var roomCounts = _chatService.GetRoomUserCounts();
                    await Clients.All.SendAsync("RoomCountsUpdated", roomCounts);
                }
            } catch (Exception ex) {
                _logger.LogError(ex, "Error in OnDisconnectedAsync for connection {ConnectionId}", Context.ConnectionId);
            }

            await base.OnDisconnectedAsync(exception);
        }

        public async Task CheckUsernameAvailability(string username) {
            try {
                var chatService = _chatService as ChatService;
                if (chatService?.CheckUsernameAvailability(Context.ConnectionId, username) == false) {
                    await Clients.Caller.SendAsync("Error", "Too many username checks. Please wait.");
                    return;
                }

                var isAvailable = _chatService.IsUsernameAvailable(username) && _chatService.IsValidUsername(username);
                await Clients.Caller.SendAsync("UsernameAvailability", username, isAvailable);
            } catch (Exception ex) {
                _logger.LogError(ex, "Error checking username availability for {Username}", username);
            }
        }
    }
}