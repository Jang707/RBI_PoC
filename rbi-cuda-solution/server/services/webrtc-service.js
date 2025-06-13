/**
 * WebRTC Service
 * Manages WebRTC connections for streaming
 */

const { EventEmitter } = require('events');
const { WEBRTC_CONFIG } = require('../utils/config');
const logger = require('../utils/logger');
const { NotFoundError } = require('../utils/error-handler');

/**
 * WebRTCService class
 */
class WebRTCService extends EventEmitter {
  /**
   * Constructor
   */
  constructor() {
    super();
    this.connections = new Map();
    this.running = false;
    
    // Try to load wrtc module
    try {
      //this.wrtc = require('wrtc');
      this.wrtc = require('webrtc')
      logger.info('wrtc module loaded successfully');
    } catch (error) {
      logger.warn('wrtc module not available, WebRTC functionality will be limited', error);
      this.wrtc = null;
    }
    
    logger.info('WebRTC Service initialized');
  }

  /**
   * Initialize WebRTC service
   * @returns {Promise<boolean>} Success
   */
  async initialize() {
    try {
      logger.info('Initializing WebRTC Service');
      
      // Set running flag
      this.running = true;
      
      logger.info('WebRTC Service initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Error initializing WebRTC Service', error);
      this.running = false;
      return false;
    }
  }

  /**
   * Create connection
   * @param {string} connectionId Connection ID
   * @param {Object} options Connection options
   * @returns {Promise<Object>} Connection info
   */
  async createConnection(connectionId, options = {}) {
    try {
      logger.info(`Creating WebRTC connection: ${connectionId}`, options);
      
      // Check if connection already exists
      if (this.connections.has(connectionId)) {
        logger.warn(`WebRTC connection already exists: ${connectionId}`);
        return this.connections.get(connectionId);
      }
      
      // Check if wrtc module is available
      if (!this.wrtc) {
        throw new Error('wrtc module not available');
      }
      
      // Create RTCPeerConnection
      const peerConnection = new this.wrtc.RTCPeerConnection({
        iceServers: options.iceServers || WEBRTC_CONFIG.iceServers,
        sdpSemantics: options.sdpSemantics || WEBRTC_CONFIG.sdpSemantics,
        bundlePolicy: options.bundlePolicy || WEBRTC_CONFIG.bundlePolicy,
        rtcpMuxPolicy: options.rtcpMuxPolicy || WEBRTC_CONFIG.rtcpMuxPolicy
      });
      
      // Create video track
      const videoTrack = this.createVideoTrack(options);
      
      // Add video track to peer connection
      peerConnection.addTrack(videoTrack);
      
      // Create connection info
      const connection = {
        id: connectionId,
        peerConnection,
        videoTrack,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        options: {
          ...options,
          width: options.width || WEBRTC_CONFIG.mediaConstraints.video.width.ideal,
          height: options.height || WEBRTC_CONFIG.mediaConstraints.video.height.ideal,
          frameRate: options.frameRate || WEBRTC_CONFIG.mediaConstraints.video.frameRate.ideal
        },
        stats: {
          bytesSent: 0,
          bytesReceived: 0,
          packetsLost: 0,
          roundTripTime: 0,
          jitter: 0
        },
        active: true
      };
      
      // Store connection
      this.connections.set(connectionId, connection);
      
      // Set up event listeners
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.emit('iceCandidate', connectionId, event.candidate);
        }
      };
      
      peerConnection.oniceconnectionstatechange = () => {
        logger.info(`ICE connection state changed for ${connectionId}: ${peerConnection.iceConnectionState}`);
        
        if (peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.iceConnectionState === 'failed' || 
            peerConnection.iceConnectionState === 'closed') {
          this.emit('connectionClosed', connectionId, peerConnection.iceConnectionState);
        }
      };
      
      peerConnection.onconnectionstatechange = () => {
        logger.info(`Connection state changed for ${connectionId}: ${peerConnection.connectionState}`);
        
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed' || 
            peerConnection.connectionState === 'closed') {
          this.emit('connectionClosed', connectionId, peerConnection.connectionState);
        }
      };
      
      logger.info(`WebRTC connection created: ${connectionId}`);
      
      // Emit connection created event
      this.emit('connectionCreated', connectionId, connection);
      
      return connection;
    } catch (error) {
      logger.error(`Error creating WebRTC connection: ${connectionId}`, error);
      throw error;
    }
  }

  /**
   * Create video track
   * @param {Object} options Video track options
   * @returns {MediaStreamTrack} Video track
   */
  createVideoTrack(options = {}) {
    try {
      // Check if wrtc module is available
      if (!this.wrtc) {
        throw new Error('wrtc module not available');
      }
      
      // Create video source
      const videoSource = new this.wrtc.nonstandard.RTCVideoSource();
      
      // Create video track
      const videoTrack = videoSource.createTrack();
      
      // Store video source
      videoTrack.source = videoSource;
      
      return videoTrack;
    } catch (error) {
      logger.error('Error creating video track', error);
      throw error;
    }
  }

  /**
   * Get connection
   * @param {string} connectionId Connection ID
   * @returns {Object} Connection info
   */
  getConnection(connectionId) {
    // Get connection
    const connection = this.connections.get(connectionId);
    
    if (!connection) {
      return null;
    }
    
    // Update last activity time
    connection.lastActivityAt = Date.now();
    
    return connection;
  }

  /**
   * Create offer
   * @param {string} connectionId Connection ID
   * @returns {Promise<Object>} Offer
   */
  async createOffer(connectionId) {
    try {
      logger.info(`Creating offer for connection: ${connectionId}`);
      
      // Get connection
      const connection = this.getConnection(connectionId);
      
      if (!connection) {
        throw new NotFoundError(`WebRTC connection not found: ${connectionId}`);
      }
      
      // Create offer
      const offer = await connection.peerConnection.createOffer();
      
      // Set local description
      await connection.peerConnection.setLocalDescription(offer);
      
      logger.info(`Offer created for connection: ${connectionId}`);
      
      return {
        type: offer.type,
        sdp: offer.sdp
      };
    } catch (error) {
      logger.error(`Error creating offer for connection: ${connectionId}`, error);
      throw error;
    }
  }

  /**
   * Set remote description
   * @param {string} connectionId Connection ID
   * @param {Object} description Remote description
   * @returns {Promise<boolean>} Success
   */
  async setRemoteDescription(connectionId, description) {
    try {
      logger.info(`Setting remote description for connection: ${connectionId}`);
      
      // Get connection
      const connection = this.getConnection(connectionId);
      
      if (!connection) {
        throw new NotFoundError(`WebRTC connection not found: ${connectionId}`);
      }
      
      // Create RTCSessionDescription
      const rtcSessionDescription = new this.wrtc.RTCSessionDescription(description);
      
      // Set remote description
      await connection.peerConnection.setRemoteDescription(rtcSessionDescription);
      
      logger.info(`Remote description set for connection: ${connectionId}`);
      
      return true;
    } catch (error) {
      logger.error(`Error setting remote description for connection: ${connectionId}`, error);
      throw error;
    }
  }

  /**
   * Add ICE candidate
   * @param {string} connectionId Connection ID
   * @param {Object} candidate ICE candidate
   * @returns {Promise<boolean>} Success
   */
  async addIceCandidate(connectionId, candidate) {
    try {
      logger.info(`Adding ICE candidate for connection: ${connectionId}`);
      
      // Get connection
      const connection = this.getConnection(connectionId);
      
      if (!connection) {
        throw new NotFoundError(`WebRTC connection not found: ${connectionId}`);
      }
      
      // Create RTCIceCandidate
      const rtcIceCandidate = new this.wrtc.RTCIceCandidate(candidate);
      
      // Add ICE candidate
      await connection.peerConnection.addIceCandidate(rtcIceCandidate);
      
      logger.info(`ICE candidate added for connection: ${connectionId}`);
      
      return true;
    } catch (error) {
      logger.error(`Error adding ICE candidate for connection: ${connectionId}`, error);
      throw error;
    }
  }

  /**
   * Send video frame
   * @param {string} connectionId Connection ID
   * @param {Buffer} frameData Frame data
   * @param {Object} frameInfo Frame info
   * @returns {Promise<boolean>} Success
   */
  async sendVideoFrame(connectionId, frameData, frameInfo = {}) {
    try {
      // Get connection
      const connection = this.getConnection(connectionId);
      
      if (!connection || !connection.active) {
        return false;
      }
      
      // Check if wrtc module is available
      if (!this.wrtc) {
        return false;
      }
      
      // Create video frame
      const videoFrame = new this.wrtc.nonstandard.RTCVideoFrame({
        type: 'RGBA',
        data: new Uint8ClampedArray(frameData),
        width: frameInfo.width || connection.options.width,
        height: frameInfo.height || connection.options.height
      });
      
      // Send video frame
      connection.videoTrack.source.onFrame(videoFrame);
      
      // Update stats
      connection.stats.bytesSent += frameData.length;
      
      return true;
    } catch (error) {
      logger.error(`Error sending video frame for connection: ${connectionId}`, error);
      return false;
    }
  }

  /**
   * Get connection stats
   * @param {string} connectionId Connection ID
   * @returns {Promise<Object>} Connection stats
   */
  async getConnectionStats(connectionId) {
    try {
      // Get connection
      const connection = this.getConnection(connectionId);
      
      if (!connection) {
        return null;
      }
      
      // Get stats
      const stats = { ...connection.stats };
      
      // Try to get real-time stats from peer connection
      try {
        if (connection.peerConnection) {
          const rtcStats = await connection.peerConnection.getStats();
          
          // Process stats
          for (const [, report] of rtcStats) {
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
              stats.bytesSent = report.bytesSent || stats.bytesSent;
              stats.packetsSent = report.packetsSent;
              stats.framesEncoded = report.framesEncoded;
              stats.framesSent = report.framesSent;
            } else if (report.type === 'inbound-rtp' && report.kind === 'video') {
              stats.bytesReceived = report.bytesReceived || stats.bytesReceived;
              stats.packetsReceived = report.packetsReceived;
              stats.packetsLost = report.packetsLost || stats.packetsLost;
              stats.jitter = report.jitter || stats.jitter;
              stats.framesDecoded = report.framesDecoded;
              stats.framesReceived = report.framesReceived;
            } else if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
              stats.roundTripTime = report.roundTripTime || stats.roundTripTime;
              stats.packetsLost = report.packetsLost || stats.packetsLost;
              stats.jitter = report.jitter || stats.jitter;
            }
          }
        }
      } catch (error) {
        logger.error(`Error getting real-time stats for connection: ${connectionId}`, error);
      }
      
      // Add timestamp
      stats.timestamp = Date.now();
      
      return stats;
    } catch (error) {
      logger.error(`Error getting connection stats for: ${connectionId}`, error);
      return null;
    }
  }

  /**
   * Close connection
   * @param {string} connectionId Connection ID
   * @returns {Promise<boolean>} Success
   */
  async closeConnection(connectionId) {
    try {
      logger.info(`Closing WebRTC connection: ${connectionId}`);
      
      // Get connection
      const connection = this.connections.get(connectionId);
      
      if (!connection) {
        logger.warn(`WebRTC connection not found: ${connectionId}`);
        return false;
      }
      
      // Update active status
      connection.active = false;
      
      // Close video track
      if (connection.videoTrack) {
        connection.videoTrack.stop();
      }
      
      // Close peer connection
      if (connection.peerConnection) {
        connection.peerConnection.close();
      }
      
      // Remove connection
      this.connections.delete(connectionId);
      
      logger.info(`WebRTC connection closed: ${connectionId}`);
      
      // Emit connection closed event
      this.emit('connectionClosed', connectionId, 'closed');
      
      return true;
    } catch (error) {
      logger.error(`Error closing WebRTC connection: ${connectionId}`, error);
      
      // Remove connection anyway
      this.connections.delete(connectionId);
      
      // Emit connection closed event
      this.emit('connectionClosed', connectionId, 'error');
      
      return false;
    }
  }

  /**
   * Get all connections
   * @returns {Array} Connections
   */
  getAllConnections() {
    return Array.from(this.connections.values()).map(connection => ({
      id: connection.id,
      createdAt: connection.createdAt,
      lastActivityAt: connection.lastActivityAt,
      options: connection.options,
      active: connection.active,
      iceConnectionState: connection.peerConnection ? connection.peerConnection.iceConnectionState : null,
      connectionState: connection.peerConnection ? connection.peerConnection.connectionState : null
    }));
  }

  /**
   * Get connections count
   * @returns {number} Connections count
   */
  getConnectionsCount() {
    return this.connections.size;
  }

  /**
   * Check if WebRTC service is running
   * @returns {boolean} Running status
   */
  isRunning() {
    return this.running;
  }

  /**
   * Shutdown WebRTC service
   * @returns {Promise<boolean>} Success
   */
  async shutdown() {
    try {
      logger.info('Shutting down WebRTC Service');
      
      // Set running flag
      this.running = false;
      
      // Close all connections
      const connectionIds = Array.from(this.connections.keys());
      
      for (const connectionId of connectionIds) {
        try {
          await this.closeConnection(connectionId);
        } catch (error) {
          logger.error(`Error closing WebRTC connection ${connectionId} during shutdown`, error);
        }
      }
      
      // Clear connections
      this.connections.clear();
      
      logger.info('WebRTC Service shutdown complete');
      
      return true;
    } catch (error) {
      logger.error('Error shutting down WebRTC Service', error);
      return false;
    }
  }
}

module.exports = WebRTCService;
