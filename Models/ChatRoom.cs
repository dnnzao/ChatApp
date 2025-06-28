namespace ChatApp.Models {
    public class ChatRoom {
        public string Name { get; set; } = string.Empty;
        public HashSet<string> Users { get; set; } = new();
        public DateTime Created { get; set; } = DateTime.UtcNow;
        public int MaxUsers { get; set; } = 50;

        public bool CanJoin => Users.Count < MaxUsers;
    }
}