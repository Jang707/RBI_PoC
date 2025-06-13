/**
 * WebSocket Service
 * Manages WebSocket connections for real-time communication
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { WEBSOCKET_CONFIG } = require('../utils/config');
const logger = require('../utils/logger');
const { NotFoundError } = require('../utils/error-handler');

/**
 * WebSocketService class
 */
class WebSocketService extends EventEmitter {
  /**
   * Constructor
   * @param {Object} server HTTP server instance
   */
  constructor(server) {
    super();
    this.server = server;
    this.wss = null;
    this.clients = new Map();
    this.running = false;
    this.pingInterval = null;
    
    logger.info('WebSocket Service initialized');
  }

  /**
   * Initialize WebSocket service
   * @returns {Promise<boolean>} Success
   */
  async initialize() {
    try {
      logger.info('Initializing WebSocket Service');
      
      // Create WebSocket server
      this.wss = new WebSocket.Server({
        server: this.server,
        path: WEBSOCKET_CONFIG.path,
        maxPayload: WEBSOCKET_CONFIG.maxPayloadSize,
        perMessageDeflate: WEBSOCKET_CONFIG.perMessageDeflate,
        verifyClient: WEBSOCKET_CONFIG.verifyClient ? this.verifyClient.bind(this) : false
      });
      
      // Set up event listeners
      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleError.bind(this));
      
      // Start ping interval
      this.startPingInterval();
      
      // Set running flag
      this.running = true;
      
      logger.info('WebSocket Service initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Error initializing WebSocket Service', error);
      this.running = false;
      return false;
    }
  }

  /**
   * Verify client
   * @param {Object} info Connection info
   * @param {Function} callback Callback function
   */
  verifyClient(info, callback) {
    try {
      // Get request
      const req = info.req;
      
      // Check if we've reached the rate limit
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      
      // TODO: Implement rate limiting
      
      // Accept connection
      callback(true);
    } catch (error) {
      logger.error('Error verifying WebSocket client', error);
      callback(false, 500, 'Internal Server Error');
    }
  }

  /**
   * Handle connection
   * @param {WebSocket} ws WebSocket connection
   * @param {Object} req HTTP request
   */
  handleConnection(ws, req) {
    try {
      // Generate client ID
      const clientId = uuidv4();
      
      // Get client IP
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      
      // Create client info
      const client = {
        id: clientId,
        ws,
        ip: clientIp,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        isAlive: true,
        sessionId: null,
        stats: {
          messagesSent: 0,
          messagesReceived: 0,
          bytesSent: 0,
          bytesReceived: 0
        }
      };
      
      // Store client
      this.clients.set(clientId, client);
      
      logger.info(`WebSocket client connected: ${clientId} from ${clientIp}`);
      
      // Set up event listeners
      ws.on('message', (message) => this.handleMessage(clientId, message));
      ws.on('close', () => this.handleClose(clientId));
      ws.on('error', (error) => this.handleClientError(clientId, error));
      ws.on('pong', () => this.handlePong(clientId));
      
      // Send welcome message
      this.sendMessage(clientId, {
        type: 'welcome',
        clientId,
        timestamp: Date.now()
      });
      
      // Emit client connected event
      this.emit('clientConnected', clientId, client);
    } catch (error) {
      logger.error('Error handling WebSocket connection', error);
    }
  }

  /**
   * Handle message
   * @param {string} clientId Client ID
   * @param {Buffer|string} message Message
   */
  handleMessage(clientId, message) {
    try {
      // Get client
      const client = this.clients.get(clientId);
      
      if (!client) {
        return;
      }
      
      // Update last activity time
      client.lastActivityAt = Date.now();
      
      // Update stats
      client.stats.messagesReceived++;
      client.stats.bytesReceived += message.length;
      
      // Parse message
      let parsedMessage;
      
      try {
        parsedMessage = JSON.parse(message);
      } catch (error) {
        logger.warn(`Invalid JSON message from client ${clientId}`, error);
        
        // Send error message
        this.sendMessage(clientId, {
          type: 'error',
          error: 'Invalid JSON message',
          timestamp: Date.now()
        });
        
        return;
      }
      
      // Process message
      this.processMessage(clientId, parsedMessage);
    } catch (error) {
      logger.error(`Error handling message from client ${clientId}`, error);
    }
  }

  /**
   * Process message
   * @param {string} clientId Client ID
   * @param {Object} message Message
   */
  processMessage(clientId, message) {
    try {
      // Get client
      const client = this.clients.get(clientId);
      
      if (!client) {
        return;
      }
      
      // Check message type
      switch (message.type) {
        case 'ping':
          // Send pong message
          this.sendMessage(clientId, {
            type: 'pong',
            timestamp: Date.now()
          });
          break;
          
        case 'register':
          // Register session
          if (message.sessionId) {
            client.sessionId = message.sessionId;
            
            logger.info(`Client ${clientId} registered with session ${message.sessionId}`);
            
            // Send registration confirmation
            this.sendMessage(clientId, {
              type: 'registered',
              sessionId: message.sessionId,
              timestamp: Date.now()
            });
            
            // Emit client registered event
            this.emit('clientRegistered', clientId, message.sessionId);
          } else {
            // Send error message
            this.sendMessage(clientId, {
              type: 'error',
              error: 'Missing sessionId',
              timestamp: Date.now()
            });
          }
          break;
          
        case 'input':
          // Handle input event
          if (client.sessionId) {
            // Emit input event
            this.emit('input', client.sessionId, message);
          } else {
            // Send error message
            this.sendMessage(clientId, {
              type: 'error',
              error: 'Not registered with a session',
              timestamp: Date.now()
            });
          }
          break;
          
        default:
          // Emit message event
          this.emit('message', clientId, message);
          break;
      }
    } catch (error) {
      logger.error(`Error processing message from client ${clientId}`, error);
    }
  }

  /**
   * Handle close
   * @param {string} clientId Client ID
   */
  handleClose(clientId) {
    try {
      // Get client
      const client = this.clients.get(clientId);
      
      if (!client) {
        return;
      }
      
      logger.info(`WebSocket client disconnected: ${clientId}`);
      
      // Remove client
      this.clients.delete(clientId);
      
      // Emit client disconnected event
      this.emit('clientDisconnected', clientId, client.sessionId);
    } catch (error) {
      logger.error(`Error handling close for client ${clientId}`, error);
    }
  }

  /**
   * Handle error
   * @param {Error} error Error
   */
  handleError(error) {
    logger.error('WebSocket server error', error);
  }

  /**
   * Handle client error
   * @param {string} clientId Client ID
   * @param {Error} error Error
   */
  handleClientError(clientId, error) {
    logger.error(`WebSocket client error: ${clientId}`, error);
    
    // Close connection
    this.closeConnection(clientId);
  }

  /**
   * Handle pong
   * @param {string} clientId Client ID
   */
  handlePong(clientId) {
    // Get client
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    // Update isAlive flag
    client.isAlive = true;
    
    // Update last activity time
    client.lastActivityAt = Date.now();
  }

  /**
   * Start ping interval
   */
  startPingInterval() {
    // Clear existing interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Set new interval
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, WEBSOCKET_CONFIG.pingInterval);
  }

  /**
   * Ping clients
   */
  pingClients() {
    try {
      const now = Date.now();
      
      // Check each client
      for (const [clientId, client] of this.clients.entries()) {
        // Check if client is alive
        if (!client.isAlive) {
          logger.info(`WebSocket client ${clientId} timed out`);
          
          // Terminate connection
          client.ws.terminate();
          
          // Remove client
          this.clients.delete(clientId);
          
          // Emit client disconnected event
          this.emit('clientDisconnected', clientId, client.sessionId);
          
          continue;
        }
        
        // Check if client has been inactive for too long
        const inactiveTime = now - client.lastActivityAt;
        
        if (inactiveTime > WEBSOCKET_CONFIG.pingTimeout) {
          logger.info(`WebSocket client ${clientId} inactive for too long`);
          
          // Terminate connection
          client.ws.terminate();
          
          // Remove client
          this.clients.delete(clientId);
          
          // Emit client disconnected event
          this.emit('clientDisconnected', clientId, client.sessionId);
          
          continue;
        }
        
        // Reset isAlive flag
        client.isAlive = false;
        
        // Send ping
        client.ws.ping();
      }
    } catch (error) {
      logger.error('Error pinging WebSocket clients', error);
    }
  }

  /**
   * Send message
   * @param {string} clientId Client ID
   * @param {Object} message Message
   * @returns {boolean} Success
   */
  sendMessage(clientId, message) {
    try {
      // Get client
      const client = this.clients.get(clientId);
      
      if (!client) {
        return false;
      }
      
      // Check if connection is open
      if (client.ws.readyState !== WebSocket.OPEN) {
        return false;
      }
      
      // Stringify message
      const messageString = JSON.stringify(message);
      
      // Send message
      client.ws.send(messageString);
      
      // Update stats
      client.stats.messagesSent++;
      client.stats.bytesSent += messageString.length;
      
      return true;
    } catch (error) {
      logger.error(`Error sending message to client ${clientId}`, error);
      return false;
    }
  }

  /**
   * Send binary message
   * @param {string} clientId Client ID
   * @param {Buffer} data Binary data
   * @returns {boolean} Success
   */
  sendBinaryMessage(clientId, data) {
    try {
      // Get client
      const client = this.clients.get(clientId);
      
      if (!client) {
        return false;
      }
      
      // Check if connection is open
      if (client.ws.readyState !== WebSocket.OPEN) {
        return false;
      }
      
      // Send binary data
      client.ws.send(data, { binary: true });
      
      // Update stats
      client.stats.messagesSent++;
      client.stats.bytesSent += data.length;
      
      return true;
    } catch (error) {
      logger.error(`Error sending binary message to client ${clientId}`, error);
      return false;
    }
  }

  /**
   * Broadcast message
   * @param {Object} message Message
   * @param {Function} filter Filter function
   * @returns {number} Number of clients message was sent to
   */
  broadcastMessage(message, filter = null) {
    try {
      let count = 0;
      
      // Stringify message
      const messageString = JSON.stringify(message);
      
      // Send message to all clients
      for (const [clientId, client] of this.clients.entries()) {
        // Apply filter if provided
        if (filter && !filter(client)) {
          continue;
        }
        
        // Check if connection is open
        if (client.ws.readyState !== WebSocket.OPEN) {
          continue;
        }
        
        // Send message
        client.ws.send(messageString);
        
        // Update stats
        client.stats.messagesSent++;
        client.stats.bytesSent += messageString.length;
        
        count++;
      }
      
      return count;
    } catch (error) {
      logger.error('Error broadcasting message', error);
      return 0;
    }
  }

  /**
   * Send message to session
   * @param {string} sessionId Session ID
   * @param {Object} message Message
   * @returns {boolean} Success
   */
  sendMessageToSession(sessionId, message) {
    try {
      // Find client with session ID
      for (const [clientId, client] of this.clients.entries()) {
        if (client.sessionId === sessionId) {
          return this.sendMessage(clientId, message);
        }
      }
      
      return false;
    } catch (error) {
      logger.error(`Error sending message to session ${sessionId}`, error);
      return false;
    }
  }

  /**
   * Send binary message to session
   * @param {string} sessionId Session ID
   * @param {Buffer} data Binary data
   * @returns {boolean} Success
   */
  sendBinaryMessageToSession(sessionId, data) {
    try {
      // Find client with session ID
      for (const [clientId, client] of this.clients.entries()) {
        if (client.sessionId === sessionId) {
          return this.sendBinaryMessage(clientId, data);
        }
      }
      
      return false;
    } catch (error) {
      logger.error(`Error sending binary message to session ${sessionId}`, error);
      return false;
    }
  }

  /**
   * Close connection
   * @param {string} clientId Client ID
   * @returns {boolean} Success
   */
  closeConnection(clientId) {
    try {
      // Get client
      const client = this.clients.get(clientId);
      
      if (!client) {
        return false;
      }
      
      // Close connection
      client.ws.close();
      
      // Remove client
      this.clients.delete(clientId);
      
      logger.info(`WebSocket connection closed: ${clientId}`);
      
      // Emit client disconnected event
      this.emit('clientDisconnected', clientId, client.sessionId);
      
      return true;
    } catch (error) {
      logger.error(`Error closing WebSocket connection: ${clientId}`, error);
      return false;
    }
  }

  /**
   * Get client
   * @param {string} clientId Client ID
   * @returns {Object} Client info
   */
  getClient(clientId) {
    return this.clients.get(clientId);
  }

  /**
   * Get client by session ID
   * @param {string} sessionId Session ID
   * @returns {Object} Client info
   */
  getClientBySessionId(sessionId) {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.sessionId === sessionId) {
        return { ...client, clientId };
      }
    }
    
    return null;
  }

  /**
   * Get all clients
   * @returns {Array} Clients
   */
  getAllClients() {
    return Array.from(this.clients.entries()).map(([clientId, client]) => ({
      id: clientId,
      ip: client.ip,
      createdAt: client.createdAt,
      lastActivityAt: client.lastActivityAt,
      isAlive: client.isAlive,
      sessionId: client.sessionId,
      stats: client.stats
    }));
  }

  /**
   * Get clients count
   * @returns {number} Clients count
   */
  getClientsCount() {
    return this.clients.size;
  }

  /**
   * Check if WebSocket service is running
   * @returns {boolean} Running status
   */
  isRunning() {
    return this.running;
  }

  /**
   * Shutdown WebSocket service
   * @returns {Promise<boolean>} Success
   */
  async shutdown() {
    try {
      logger.info('Shutting down WebSocket Service');
      
      // Set running flag
      this.running = false;
      
      // Clear ping interval
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
      
      // Close all connections
      for (const [clientId, client] of this.clients.entries()) {
        try {
          client.ws.close();
        } catch (error) {
          logger.error(`Error closing WebSocket connection ${clientId} during shutdown`, error);
        }
      }
      
      // Clear clients
      this.clients.clear();
      
      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }
      
      logger.info('WebSocket Service shutdown complete');
      
      return true;
    } catch (error) {
      logger.error('Error shutting down WebSocket Service', error);
      return false;
    }
  }
}

module.exports = WebSocketService;
