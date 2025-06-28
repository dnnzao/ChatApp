using ChatApp.Models;

namespace ChatApp.Services {
    public interface IChatService {
        // Username management
        Task<bool> ReserveUsernameAsync(string connectionId, string username);
        bool IsUsernameAvailable(string username);

        // Multi-room management
        Task<bool> JoinRoomAsync(string connectionId, string roomName);
        Task<bool> LeaveRoomAsync(string connectionId, string roomName);
        Task<bool> SwitchToRoomAsync(string connectionId, string roomName);
        List<string> GetUserJoinedRooms(string connectionId);

        // Messaging
        Task<bool> SendMessageAsync(ChatMessage message);

        // Room information
        List<string> GetAvailableRooms();
        Dictionary<string, int> GetRoomUserCounts();

        // Validation
        bool IsValidRoomName(string roomName);
        bool IsValidUsername(string username);
        bool IsValidMessage(string message);

        // User management
        ChatUser? GetUser(string connectionId);
        ChatRoom? GetRoom(string roomName);
        void RemoveUser(string connectionId);
    }
}