/**
 * Main Express Server
 */

// Import dependencies
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const { SERVER_CONFIG, AUTH_CONFIG } = require('./utils/config');
const logger = require('./utils/logger');
const errorHandler = require('./utils/error-handler');
const cudaCheck = require('./utils/cuda-check');

// Import services
const WebSocketService = require('./services/websocket-service');
const WebRTCService = require('./services/webrtc-service');

// Import core modules
const BrowserPool = require('./core/browser-pool');
const SessionManager = require('./core/session-manager');
const StreamingEngine = require('./core/streaming-engine');
const cudaEncoder = require('./services/cuda-encoder');

// Import API routes
const sessionApiRouter = require('./apis/session-api');
const streamApiRouter = require('./apis/stream-api');

// Initialize Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize error handlers
errorHandler.initializeErrorHandlers();

// Apply middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors(SERVER_CONFIG.cors));
app.use(morgan('combined', { stream: logger.stream }));
app.use(bodyParser.json(SERVER_CONFIG.bodyParser.json));
app.use(bodyParser.urlencoded(SERVER_CONFIG.bodyParser.urlencoded));

// Serve static files
app.use(express.static(path.join(__dirname, SERVER_CONFIG.staticFiles.path), SERVER_CONFIG.staticFiles.options));

// Basic authentication middleware
const basicAuth = (req, res, next) => {
  if (!AUTH_CONFIG.basic.enabled) {
    return next();
  }
  
  // Get authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Parse authorization header
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const username = auth[0];
  const password = auth[1];
  
  // Check credentials
  if (username === AUTH_CONFIG.basic.username && password === AUTH_CONFIG.basic.password) {
    return next();
  }
  
  res.setHeader('WWW-Authenticate', 'Basic');
  return res.status(401).json({ error: 'Invalid credentials' });
};

// Apply basic authentication to all routes if enabled
if (AUTH_CONFIG.basic.enabled) {
  app.use(basicAuth);
}

// Initialize services and core modules
let websocketService, webrtcService, browserPool, sessionManager, streamingEngine;

async function initializeServices() {
  try {
    logger.info('Initializing services...');
    
    // Check CUDA availability
    const systemCapabilities = await cudaCheck.checkSystemCapabilities();
    logger.info('System capabilities', systemCapabilities);
    
    // Initialize CUDA encoder
    await cudaEncoder.initialize();
    
    // Initialize WebSocket service
    websocketService = new WebSocketService(server);
    await websocketService.initialize();
    
    // Initialize WebRTC service
    webrtcService = new WebRTCService();
    await webrtcService.initialize();
    
    // Initialize browser pool
    browserPool = new BrowserPool();
    await browserPool.initialize();
    
    // Initialize session manager
    sessionManager = new SessionManager(browserPool);
    await sessionManager.initialize();
    
    // Initialize streaming engine
    streamingEngine = new StreamingEngine(browserPool, sessionManager, webrtcService, cudaEncoder);
    
    // Set up API routes with dependencies
    app.use('/api/sessions', sessionApiRouter(sessionManager, browserPool));
    app.use('/api/streams', streamApiRouter(streamingEngine, sessionManager));
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          websocket: websocketService.isRunning(),
          webrtc: webrtcService.isRunning(),
          browserPool: browserPool.isRunning(),
          sessionManager: sessionManager.isRunning(),
          streamingEngine: streamingEngine instanceof StreamingEngine
        },
        cuda: {
          available: cudaEncoder.cudaAvailable,
          nvencAvailable: cudaEncoder.nvencAvailable
        }
      });
    });
    
    // System info endpoint
    app.get('/system-info', (req, res) => {
      res.json({
        systemCapabilities,
        sessions: sessionManager.getSessionsCount(),
        browsers: browserPool.getBrowsersCount(),
        streams: streamingEngine.getAllStreamStats()
      });
    });
    
    // Error handling middleware
    app.use(errorHandler.errorHandlerMiddleware);
    
    logger.info('Services initialized successfully');
  } catch (error) {
    logger.error('Error initializing services', error);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  try {
    // Initialize services
    await initializeServices();
    
    // Start server
    server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
      logger.info(`Server running on http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error', error);
      process.exit(1);
    });
    
    // Handle server close
    server.on('close', () => {
      logger.info('Server closed');
    });
    
    // Handle process termination
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      shutdown();
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      shutdown();
    });
  } catch (error) {
    logger.error('Error starting server', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down...');
  
  // Close server
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  try {
    // Shutdown services
    if (streamingEngine) await streamingEngine.shutdown();
    if (sessionManager) await sessionManager.shutdown();
    if (browserPool) await browserPool.shutdown();
    if (webrtcService) await webrtcService.shutdown();
    if (websocketService) await websocketService.shutdown();
    if (cudaEncoder) await cudaEncoder.shutdown();
    
    logger.info('All services shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer, shutdown };
