using ChatApp.Hubs;
using ChatApp.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();

// Enhanced SignalR configuration with security settings
builder.Services.AddSignalR(options => {
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();

    // Increase timeouts for ngrok stability
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(60);
    options.KeepAliveInterval = TimeSpan.FromSeconds(30);
    options.HandshakeTimeout = TimeSpan.FromSeconds(30);

    // Security: Limit message size to prevent large payloads
    options.MaximumReceiveMessageSize = 1024; // 1KB max per message

    // Security: Limit parallel invocations
    options.MaximumParallelInvocationsPerClient = 1;

    // Security: Disable detailed errors in production
    if (!builder.Environment.IsDevelopment()) {
        options.EnableDetailedErrors = false;
    }
});

builder.Services.AddHealthChecks();

// Register custom services
builder.Services.AddSingleton<IChatService, ChatService>();

// Add logging with security considerations
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
if (builder.Environment.IsDevelopment()) {
    builder.Logging.AddDebug();
}

// Security: Add rate limiting (if using ASP.NET Core 7+)
builder.Services.AddRateLimiter(options => {
    options.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<HttpContext, string>(
        httpContext => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: partition => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions {
                AutoReplenishment = true,
                PermitLimit = 100, // 100 requests per window
                Window = TimeSpan.FromMinutes(1) // 1 minute window
            }));
});

var app = builder.Build();

// Configure pipeline with enhanced security
if (!app.Environment.IsDevelopment()) {
    app.UseExceptionHandler("/Error");

    // Security: Force HTTPS in production
    app.UseHsts();
    app.UseHttpsRedirection();
} else {
    // Development: Still redirect HTTP to HTTPS for consistency
    app.UseHttpsRedirection();
}

// Security: Add comprehensive security headers
app.Use(async (context, next) => {
    var headers = context.Response.Headers;

    // Prevent clickjacking
    headers.Append("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    headers.Append("X-Content-Type-Options", "nosniff");

    // Enable XSS protection (legacy browsers)
    headers.Append("X-XSS-Protection", "1; mode=block");

    // Control referrer information
    headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");

    // Prevent DNS prefetching
    headers.Append("X-DNS-Prefetch-Control", "off");

    // Content Security Policy for enhanced XSS protection
    var csp = "default-src 'self'; " +
              "script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'; " +
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com http://fonts.googleapis.com; " +
              "connect-src 'self'" + (app.Environment.IsDevelopment() ? " ws://localhost:* wss://localhost:* http://localhost:*" : "") + "; " +
              "img-src 'self' data:; " +
              "font-src 'self' https://fonts.gstatic.com http://fonts.gstatic.com; " +
              "object-src 'none'; " +
              "media-src 'none'; " +
              "frame-src 'none';";

    headers.Append("Content-Security-Policy", csp);

    // Additional security headers
    headers.Append("X-Permitted-Cross-Domain-Policies", "none");
    headers.Append("X-Download-Options", "noopen");

    // HSTS for HTTPS enforcement (only add if using HTTPS)
    if (context.Request.IsHttps) {
        headers.Append("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    // ngrok skip warning (development only)
    if (app.Environment.IsDevelopment()) {
        headers.Append("ngrok-skip-browser-warning", "true");
    }

    await next();
});

// Security: Add rate limiting middleware
app.UseRateLimiter();

// Standard middleware
app.UseStaticFiles();
app.UseRouting();

// Security: Custom middleware for connection tracking and abuse prevention
app.Use(async (context, next) => {
    // Handle ngrok headers
    if (context.Request.Headers.ContainsKey("X-Forwarded-Proto")) {
        context.Request.Scheme = context.Request.Headers["X-Forwarded-Proto"];
    }

    if (context.Request.Headers.ContainsKey("X-Forwarded-For")) {
        var forwardedFor = context.Request.Headers["X-Forwarded-For"].ToString();
        var ip = forwardedFor.Split(',')[0].Trim();
        context.Connection.RemoteIpAddress = System.Net.IPAddress.Parse(ip);
    }

    await next();
});

// Map routes
app.MapRazorPages();
app.MapHub<ChatHub>("/chatHub");

// Security: Add a simple health check endpoint (optional)
app.MapHealthChecks("/health");

// Security: Log application startup
app.Logger.LogInformation("ChatApp started in {Environment} mode", app.Environment.EnvironmentName);

app.Run();