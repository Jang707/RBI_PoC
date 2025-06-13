/**
 * WebRTC Service with fallback options
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
    this.wrtc = null;
    this.fallbackMode = false;
    
    // Try to load wrtc module with multiple fallbacks
    this.initializeWebRTC();
    
    logger.info('WebRTC Service initialized');
  }

  /**
   * Initialize WebRTC with fallback options
   */
  initializeWebRTC() {
    const wrtcOptions = [
      'wrtc',
      '@roamhq/wrtc',
      'werift'
    ];

    for (const pkg of wrtcOptions) {
      try {
        this.wrtc = require(pkg);
        logger.info(`${pkg} module loaded successfully`);
        return;
      } catch (error) {
        logger.debug(`Failed to load ${pkg}: ${error.message}`);
      }
    }

    // If no WebRTC package is available, use fallback mode
    logger.warn('No WebRTC module available, using fallback mode');
    this.fallbackMode = true;
    this.initializeFallbackMode();
  }

  /**
   * Initialize fallback mode using WebSocket streaming
   */
  initializeFallbackMode() {
    // Create mock WebRTC objects for compatibility
    this.wrtc = {
      RTCPeerConnection: class MockRTCPeerConnection extends EventEmitter {
        constructor(config) {
          super();
          this.config = config;
          this.iceConnectionState = 'new';
          this.connectionState = 'new';
          this.tracks = [];
        }

        addTrack(track) {
          this.tracks.push(track);
        }

        async createOffer() {
          return {
            type: 'offer',
            sdp: 'mock-sdp-offer'
          };
        }

        async setLocalDescription(desc) {
          // Mock implementation
        }

        async setRemoteDescription(desc) {
          // Mock implementation
        }

        async addIceCandidate(candidate) {
          // Mock implementation
        }

        async getStats() {
          return new Map();
        }

        close() {
          this.iceConnectionState = 'closed';
          this.connectionState = 'closed';
        }
      },
      
      RTCSessionDescription: class {
        constructor(desc) {
          this.type = desc.type;
          this.sdp = desc.sdp;
        }
      },
      
      RTCIceCandidate: class {
        constructor(candidate) {
          this.candidate = candidate.candidate;
          this.sdpMid = candidate.sdpMid;
          this.sdpMLineIndex = candidate.sdpMLineIndex;
        }
      },
      
      nonstandard: {
        RTCVideoSource: class {
          createTrack() {
            return {
              source: this,
              stop: () => {},
              onFrame: (frame) => {
                // In fallback mode, we could send frame via WebSocket
                logger.debug('Fallback mode: frame received');
              }
            };
          }
        },
        
        RTCVideoFrame: class {
          constructor(options) {
            this.type = options.type;
            this.data = options.data;
            this.width = options.width;
            this.height = options.height;
          }
        }
      }
    };

    logger.info('Fallback WebRTC mock initialized');
  }

  /**
   * Initialize WebRTC service
   * @returns {Promise<boolean>} Success
   */
  async initialize() {
    try {
      logger.info('Initializing WebRTC Service');
      
      if (this.fallbackMode) {
        logger.warn('Running in fallback mode - WebRTC features will be limited');
      }
      
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
        fallbackMode: this.fallbackMode,
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
      
      // Set up event listeners (only for real WebRTC)
      if (!this.fallbackMode) {
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
      }
      
      logger.info(`WebRTC connection created: ${connectionId}${this.fallbackMode ? ' (fallback mode)' : ''}`);
      
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
      
      if (this.fallbackMode) {
        // In fallback mode, emit frame data for WebSocket handling
        this.emit('frameData', connectionId, frameData, frameInfo);
        return true;
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

  // ... rest of the methods remain the same as original ...

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
   * Check if running in fallback mode
   * @returns {boolean} Fallback mode status
   */
  isFallbackMode() {
    return this.fallbackMode;
  }

  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      running: this.running,
      fallbackMode: this.fallbackMode,
      connectionsCount: this.connections.size,
      wrtcAvailable: !this.fallbackMode
    };
  }
}

module.exports = WebRTCService;