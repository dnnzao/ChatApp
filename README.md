# 💬 Multi-Room Chat Application

A modern, secure, real-time chat application built with ASP.NET Core and SignalR, featuring a sleek dark theme UI and comprehensive security hardening.

![Chat App Demo](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Security](https://img.shields.io/badge/Security-Hardened-blue)
![Platform](https://img.shields.io/badge/Platform-.NET%207-purple)
![License](https://img.shields.io/badge/License-MIT-green)

## 🚀 Features

### 💬 **Chat Functionality**
- **Multi-room support** - Join multiple chat rooms simultaneously
- **Real-time messaging** - Instant message delivery with SignalR
- **Room switching** - Seamlessly switch between active rooms
- **User presence** - See who's online in each room
- **System notifications** - Join/leave notifications

### 🎨 **Modern UI/UX**
- **Dark theme design** - GitHub-inspired modern dark interface
- **Fully responsive** - Perfect scaling from mobile to desktop
- **Smooth animations** - Polished hover effects and transitions
- **Intuitive navigation** - Tab-based room management
- **Real-time user counts** - Live room occupancy display

### 🛡️ **Enterprise-Grade Security**
- **XSS Protection** - Content Security Policy and safe DOM manipulation
- **Rate Limiting** - Global and per-user message rate limiting
- **Session Security** - Secure session management with validation
- **Input Validation** - Comprehensive server and client-side validation
- **Connection Limits** - IP-based connection throttling
- **Security Headers** - HSTS, X-Frame-Options, and more
- **Malicious Pattern Detection** - Automatic blocking of dangerous content

### 📱 **Cross-Platform**
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Browser Compatible** - Modern browser support
- **Docker Ready** - Containerized deployment
- **Cloud Deployable** - Easy deployment to any cloud platform

## 🛠️ Technology Stack

- **Backend**: ASP.NET Core 7, SignalR
- **Frontend**: Razor Pages, Vanilla JavaScript, CSS3
- **Real-time**: WebSocket connections via SignalR
- **Storage**: In-memory (ConcurrentDictionary) - no database required
- **Containerization**: Docker & Docker Compose
- **Security**: Rate limiting, CSP, security headers

## 📋 Prerequisites

- [.NET 7 SDK](https://dotnet.microsoft.com/download)
- [Docker](https://www.docker.com/) (optional, for containerized deployment)
- Modern web browser with WebSocket support

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/dnnzao/ChatApp.git
cd ChatApp
```

### 2. Run Locally
```bash
# Restore dependencies
dotnet restore

# Run the application
dotnet run

# Open browser to https://localhost:5001
```

### 3. Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up --build

# Access at http://localhost:5000
```

## 🌐 Production Deployment

### Using ngrok (Recommended for testing)
```bash
# Start your app locally
dotnet run

# In another terminal, expose with ngrok
ngrok http 5001

# Share the ngrok HTTPS URL
```

### Using Docker in Production
```bash
# Build production image
docker build -t chatapp .

# Run with production settings
docker run -d -p 80:80 -e ASPNETCORE_ENVIRONMENT=Production chatapp
```

## 💻 Usage

### Getting Started
1. **Access the application** in your web browser
2. **Enter a unique username** (3-20 characters, alphanumeric + _ -)
3. **Join chat rooms** by clicking the "Join" button
4. **Start chatting** in real-time with other users
5. **Switch between rooms** using the tab interface

### Available Rooms
- 💬 **General** - Open discussion
- 👨‍👩‍👧‍👦 **Family** - Family conversations
- 👫 **Friends** - Friends chat
- 🎮 **Gaming** - Gaming discussions
- 💻 **Tech Talk** - Technology topics
- 🎲 **Random** - Random conversations

### Features
- **Multi-room participation**: Join multiple rooms simultaneously
- **Room switching**: Click tabs to switch between active rooms
- **Leave rooms**: Use the 'X' button on room tabs
- **Real-time updates**: See live user counts and join/leave notifications

## 🏗️ Architecture

### Backend Architecture
```
├── Controllers/           # Razor Page Controllers
├── Hubs/                 # SignalR Hubs
│   └── ChatHub.cs        # Main chat hub
├── Models/               # Data models
│   ├── ChatMessage.cs    # Message model
│   ├── ChatRoom.cs       # Room model
│   └── ChatUser.cs       # User model
├── Services/             # Business logic
│   ├── ChatService.cs    # Core chat service
│   └── IChatService.cs   # Service interface
└── Pages/                # Razor Pages
    ├── Index.cshtml      # Login page
    └── Chat.cshtml       # Main chat interface
```

### Frontend Architecture
```
├── wwwroot/
│   ├── js/
│   │   ├── chat.js       # Main chat client
│   │   └── login.js      # Login functionality
│   └── css/
│       └── chat.css      # Dark theme styles
└── Pages/
    └── Shared/
        └── _Layout.cshtml # Main layout
```

## 🔒 Security Features

### 🛡️ **Defense in Depth**
Our security implementation follows enterprise best practices:

#### **Input Validation & Sanitization**
- Server-side HTML encoding for all user inputs
- Client-side input filtering and validation
- Malicious pattern detection and blocking
- Message length limits and content filtering

#### **Rate Limiting & Abuse Prevention**
- Global rate limiting: 100 requests/minute per IP
- Message rate limiting: 1 second between messages
- Connection limits: 5 concurrent connections per IP
- Username enumeration protection

#### **Session & Authentication Security**
- Secure session management with timestamps
- Session validation and expiration (24 hours)
- Connection hijacking prevention
- Secure session storage with integrity checks

#### **Web Security Headers**
```http
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

#### **Real-time Communication Security**
- SignalR message size limits (1KB max)
- Connection timeout management
- Parallel invocation limits
- Error information sanitization

### 🔍 **Security Monitoring**
- Security event logging
- Suspicious activity detection
- Connection pattern analysis
- Automated threat response

## 🎨 UI/UX Features

### Dark Theme Design
- GitHub-inspired color scheme
- Smooth animations and transitions
- Modern card-based message layout
- Responsive typography

### Responsive Layout
- **Desktop**: Full sidebar + chat area
- **Tablet**: Optimized sidebar with responsive chat
- **Mobile**: Stacked layout with collapsible sidebar
- **Auto-scaling**: Adapts to any screen size

### User Experience
- **Instant feedback**: Real-time typing indicators
- **Visual status**: Connection status indicators
- **Smooth transitions**: Animated state changes
- **Accessibility**: Proper ARIA labels and keyboard navigation

## 🔧 Configuration

### Environment Variables
```bash
ASPNETCORE_ENVIRONMENT=Production        # Set to Production for deployment
ASPNETCORE_URLS=http://+:80             # Binding URLs
```

### Security Configuration
Modify `Program.cs` to adjust security settings:
- Rate limiting thresholds
- Connection limits per IP
- Message size limits
- Session timeout duration

## 🚦 Performance

### Optimization Features
- **In-memory storage**: Lightning-fast message handling
- **Connection pooling**: Efficient SignalR connections
- **Message queuing**: Optimized real-time delivery
- **Resource cleanup**: Automatic memory management

### Scalability
- **Stateless design**: Easy horizontal scaling
- **Docker ready**: Container orchestration support
- **CDN compatible**: Static asset optimization
- **Load balancer friendly**: Session-independent architecture

## 🧪 Testing

### Manual Testing
```bash
# Run locally
dotnet run

# Test different scenarios:
# - Multiple users in different browsers
# - Cross-room messaging
# - Connection interruption recovery
# - Security input validation
```

### Security Testing
The application has been tested against:
- XSS injection attempts
- Rate limiting bypass
- Session hijacking
- Input validation bypass
- Connection flooding

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow C# coding conventions
- Add appropriate logging for new features
- Include security considerations in code reviews
- Test responsive design on multiple devices
- Maintain the dark theme consistency

### Security Contributions
When contributing security-related changes:
- Document the security impact
- Include test cases for security scenarios
- Follow the existing security patterns
- Update security documentation

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Demo**: [Live Demo](https://your-ngrok-url.ngrok.io) *(when running)*
- **Issues**: [GitHub Issues](https://github.com/dnnzao/ChatApp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/dnnzao/ChatApp/discussions)

## 📞 Support

- 📧 **Email**: [your-email@example.com]
- 💬 **Discord**: [Your Discord Server]
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/dnnzao/ChatApp/issues)

## 🙏 Acknowledgments

- **SignalR Team** - For the excellent real-time communication framework
- **ASP.NET Core Team** - For the robust web framework
- **Security Community** - For best practices and vulnerability research
- **Open Source Contributors** - For inspiration and code examples

---

<div align="center">

**⭐ Star this repository if you found it helpful!**

[Report Bug](https://github.com/dnnzao/ChatApp/issues) · [Request Feature](https://github.com/dnnzao/ChatApp/issues) · [Contributing](CONTRIBUTING.md)

</div>

---

*Built with ❤️ using ASP.NET Core and SignalR*