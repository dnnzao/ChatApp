using ChatApp.Models;

namespace ChatApp.Services {
    public interface IMessageRepository {
        Task<int> SaveMessageAsync(ChatMessage message);
        Task<List<ChatMessage>> GetRecentMessagesAsync(string roomName, int count = 50);
        Task<List<ChatMessage>> GetMessagesByUserAsync(string username, int count = 100);
        Task<List<ChatMessage>> SearchMessagesAsync(string roomName, string searchTerm, int count = 50);
        Task InitializeDatabaseAsync();
    }
} 