# Remote Browser Isolation (RBI) Solution

This is a simplified Remote Browser Isolation (RBI) solution that provides secure web browsing by isolating the browser from the user's device. The browser runs on a remote server, and only the rendered content is streamed to the user's device.

## Features

- **Browser Isolation**: Runs browsers in isolated environments on the server
- **Session Management**: Manages user sessions and browser instances
- **Real-time Streaming**: Streams browser content to clients in real-time
- **WebRTC Integration**: Uses WebRTC for low-latency video streaming
- **RESTful API**: Provides a comprehensive API for client integration
- **Scalable Architecture**: Designed to scale with increasing user load

## Architecture

The RBI solution consists of the following components:

### Core Components

- **BrowserPool**: Manages browser instances and pages using Puppeteer
- **SessionManager**: Handles user sessions and their resources
- **StreamingEngine**: Manages streaming of browser content to clients

### Services

- **WebRTCService**: Handles WebRTC connections for streaming
- **WebSocketService**: Manages WebSocket connections for real-time communication
- **BasicEncoder**: Provides basic video encoding for streaming

### APIs

- **SessionAPI**: RESTful API for session management
- **StreamAPI**: RESTful API for streaming operations

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A modern web browser

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/rbi-solution.git
   ```

2. Install dependencies:
   ```
   cd rbi-solution/server
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   PORT=3000
   HOST=0.0.0.0
   NODE_ENV=development
   ```

4. Start the server:
   ```
   npm start
   ```

## Usage

### Creating a Session

```
POST /api/sessions
```

Example request:
```json
{
  "userId": "user123",
  "timeout": 3600000,
  "startUrl": "https://example.com",
  "viewport": {
    "width": 1920,
    "height": 1080
  }
}
```

### Starting a Stream

```
POST /api/streams/:sessionId/start
```

Example request:
```json
{
  "quality": "high",
  "maxWidth": 1920,
  "maxHeight": 1080,
  "frameRate": 30,
  "bitrate": 3000000
}
```

### Navigating to a URL

```
POST /api/sessions/:sessionId/navigate
```

Example request:
```json
{
  "url": "https://example.com/page"
}
```

## Development

### Running in Development Mode

```
npm run dev
```

### Running Tests

```
npm test
```

### Linting

```
npm run lint
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
