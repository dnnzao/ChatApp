using System.ComponentModel.DataAnnotations;

namespace ChatApp.Models {
    public class ChatMessage {
        [Required]
        [StringLength(50, MinimumLength = 1)]
        public string User { get; set; } = string.Empty;

        [Required]
        [StringLength(500, MinimumLength = 1)]
        public string Message { get; set; } = string.Empty;

        [Required]
        [StringLength(30, MinimumLength = 1)]
        public string Room { get; set; } = string.Empty;

        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}