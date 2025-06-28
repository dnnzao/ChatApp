namespace ChatApp.Models {
    public class ChatUser {
        public string ConnectionId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string CurrentRoom { get; set; } = string.Empty; // Currently active room
        public HashSet<string> JoinedRooms { get; set; } = new(); // All rooms user is in
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
        public DateTime LastActivity { get; set; } = DateTime.UtcNow;
    }
}