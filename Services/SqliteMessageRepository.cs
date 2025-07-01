using ChatApp.Models;
using Microsoft.Data.Sqlite;
using Dapper;
using System.Text;

namespace ChatApp.Services {
    public class SqliteMessageRepository : IMessageRepository {
        private readonly string _connectionString;
        private readonly ILogger<SqliteMessageRepository> _logger;

        public SqliteMessageRepository(IConfiguration configuration, ILogger<SqliteMessageRepository> logger) {
            var dbPath = configuration.GetConnectionString("DefaultConnection") ?? "Data/chatapp.db";
            _connectionString = $"Data Source={dbPath}";
            _logger = logger;
        }

        public async Task InitializeDatabaseAsync() {
            try {
                // Ensure the Data directory exists
                var dbPath = GetDatabasePath();
                var directory = Path.GetDirectoryName(dbPath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory)) {
                    Directory.CreateDirectory(directory);
                }

                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                // Create Messages table
                var createTableSql = @"
                    CREATE TABLE IF NOT EXISTS Messages (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        User TEXT NOT NULL,
                        Message TEXT NOT NULL,
                        Room TEXT NOT NULL,
                        Timestamp DATETIME NOT NULL,
                        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE INDEX IF NOT EXISTS idx_room_timestamp ON Messages(Room, Timestamp DESC);
                    CREATE INDEX IF NOT EXISTS idx_user_timestamp ON Messages(User, Timestamp DESC);
                    CREATE INDEX IF NOT EXISTS idx_created_at ON Messages(CreatedAt DESC);
                ";

                await connection.ExecuteAsync(createTableSql);
                _logger.LogInformation("Database initialized successfully");
            } catch (Exception ex) {
                _logger.LogError(ex, "Failed to initialize database");
                throw;
            }
        }

        public async Task<int> SaveMessageAsync(ChatMessage message) {
            try {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                var sql = @"
                    INSERT INTO Messages (User, Message, Room, Timestamp)
                    VALUES (@User, @Message, @Room, @Timestamp);
                    SELECT last_insert_rowid();
                ";

                var id = await connection.QuerySingleAsync<int>(sql, new {
                    User = message.User,
                    Message = message.Message,
                    Room = message.Room,
                    Timestamp = message.Timestamp
                });

                _logger.LogDebug("Message saved with ID {MessageId} from user {User} in room {Room}", 
                               id, message.User, message.Room);
                return id;
            } catch (Exception ex) {
                _logger.LogError(ex, "Failed to save message from user {User} in room {Room}", 
                               message.User, message.Room);
                throw;
            }
        }

        public async Task<List<ChatMessage>> GetRecentMessagesAsync(string roomName, int count = 50) {
            try {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                var sql = @"
                    SELECT Id, User, Message, Room, Timestamp
                    FROM Messages
                    WHERE Room = @Room
                    ORDER BY Timestamp DESC
                    LIMIT @Count
                ";

                var messages = await connection.QueryAsync<ChatMessage>(sql, new { 
                    Room = roomName, 
                    Count = count 
                });

                // Return in chronological order (oldest first)
                var result = messages.Reverse().ToList();
                
                _logger.LogDebug("Retrieved {Count} recent messages for room {Room}", 
                               result.Count, roomName);
                return result;
            } catch (Exception ex) {
                _logger.LogError(ex, "Failed to get recent messages for room {Room}", roomName);
                return new List<ChatMessage>();
            }
        }

        public async Task<List<ChatMessage>> GetMessagesByUserAsync(string username, int count = 100) {
            try {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                var sql = @"
                    SELECT Id, User, Message, Room, Timestamp
                    FROM Messages
                    WHERE User = @User COLLATE NOCASE
                    ORDER BY Timestamp DESC
                    LIMIT @Count
                ";

                var messages = await connection.QueryAsync<ChatMessage>(sql, new { 
                    User = username, 
                    Count = count 
                });

                var result = messages.Reverse().ToList();
                
                _logger.LogDebug("Retrieved {Count} messages by user {User}", 
                               result.Count, username);
                return result;
            } catch (Exception ex) {
                _logger.LogError(ex, "Failed to get messages by user {User}", username);
                return new List<ChatMessage>();
            }
        }

        public async Task<List<ChatMessage>> SearchMessagesAsync(string roomName, string searchTerm, int count = 50) {
            try {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                var sql = @"
                    SELECT Id, User, Message, Room, Timestamp
                    FROM Messages
                    WHERE Room = @Room 
                    AND (Message LIKE @SearchTerm OR User LIKE @SearchTerm)
                    ORDER BY Timestamp DESC
                    LIMIT @Count
                ";

                var searchPattern = $"%{searchTerm}%";
                var messages = await connection.QueryAsync<ChatMessage>(sql, new { 
                    Room = roomName,
                    SearchTerm = searchPattern,
                    Count = count 
                });

                var result = messages.Reverse().ToList();
                
                _logger.LogDebug("Found {Count} messages matching '{SearchTerm}' in room {Room}", 
                               result.Count, searchTerm, roomName);
                return result;
            } catch (Exception ex) {
                _logger.LogError(ex, "Failed to search messages in room {Room} for term '{SearchTerm}'", 
                               roomName, searchTerm);
                return new List<ChatMessage>();
            }
        }

        private string GetDatabasePath() {
            var connection = new SqliteConnectionStringBuilder(_connectionString);
            return connection.DataSource;
        }
    }
} 