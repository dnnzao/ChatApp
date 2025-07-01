using ChatApp.Models;

namespace ChatApp.Services {
    public interface IChatService {
        Task<bool> ReserveUsernameAsync(string connectionId, string username);
        bool IsUsernameAvailable(string username);
        Task<bool> JoinRoomAsync(string connectionId, string roomName);
        Task<bool> LeaveRoomAsync(string connectionId, string roomName);
        Task<bool> SwitchToRoomAsync(string connectionId, string roomName);
        List<string> GetUserJoinedRooms(string connectionId);
        Task<bool> SendMessageAsync(ChatMessage message);
        List<string> GetAvailableRooms();
        Dictionary<string, int> GetRoomUserCounts();
        bool IsValidRoomName(string roomName);
        bool IsValidUsername(string username);
        bool IsValidMessage(string message);
        ChatUser? GetUser(string connectionId);
        ChatRoom? GetRoom(string roomName);
        void RemoveUser(string connectionId);
        bool CanConnect(string ipAddress, string connectionId);
        void RemoveConnection(string ipAddress);
        bool CheckUsernameAvailability(string connectionId, string username);
        void CleanupOldData();
        Task<List<ChatMessage>> GetRecentMessagesAsync(string roomName, int count = 50);
        Task<List<ChatMessage>> GetMessagesByUserAsync(string username, int count = 100);
        Task<List<ChatMessage>> SearchMessagesAsync(string roomName, string searchTerm, int count = 50);
    }
}