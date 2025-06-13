/**
 * Streaming Engine
 * Handles streaming of browser content to clients
 */

const { EventEmitter } = require('events');
const { STREAMING_CONFIG } = require('../utils/config');
const logger = require('../utils/logger');

/**
 * StreamingEngine class
 */
class StreamingEngine extends EventEmitter {
  constructor(browserPool, sessionManager, webrtcService, cudaEncoder) {
    super();
    this.browserPool = browserPool;
    this.sessionManager = sessionManager;
    this.webrtcService = webrtcService;
    this.cudaEncoder = cudaEncoder;
    this.streams = new Map();
    this.frameProcessors = new Map();
    this.adaptiveQualityControllers = new Map();
    this.performanceMetrics = new Map();
    
    logger.info('Streaming Engine initialized');
    
    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Browser Pool events
    this.browserPool.on('screencastFrame', this.handleScreencastFrame.bind(this));
    this.browserPool.on('pageClosed', this.handlePageClosed.bind(this));
    
    // Session Manager events
    this.sessionManager.on('sessionClosed', this.handleSessionClosed.bind(this));
    
    // WebRTC Service events
    this.webrtcService.on('connectionClosed', this.handleWebRTCConnectionClosed.bind(this));
    
    // CUDA Encoder events
    this.cudaEncoder.on('encodedFrame', this.handleEncodedFrame.bind(this));
  }

  /**
   * Create stream
   * @param {string} sessionId Session ID
   * @param {Object} options Stream options
   * @returns {Promise<Object>} Stream info
   */
  async createStream(sessionId, options = {}) {
    try {
      logger.info(`Creating stream for session ${sessionId}`, options);
      
      // Check if stream already exists
      if (this.streams.has(sessionId)) {
        logger.warn(`Stream already exists for session ${sessionId}`);
        return this.streams.get(sessionId);
      }
      
      // Get session
      const session = this.sessionManager.getSession(sessionId);
      
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      // Create page if not provided
      let pageId = options.pageId || session.pageId;
      
      if (!pageId) {
        // Create page
        const pageOptions = {
          width: options.width || STREAMING_CONFIG.defaultWidth,
          height: options.height || STREAMING_CONFIG.defaultHeight,
          deviceScaleFactor: options.deviceScaleFactor || STREAMING_CONFIG.defaultDeviceScaleFactor
        };
        
        const page = await this.browserPool.createPage(pageOptions);
        pageId = page.id;
        
        // Update session
        await this.sessionManager.updateSession(sessionId, {
          pageId,
          browserId: page.browserId
        });
      }
      
      // Get page
      const page = this.browserPool.getPage(pageId);
      
      if (!page) {
        throw new Error(`Page not found: ${pageId}`);
      }
      
      // Create WebRTC connection if not provided
      let webrtcId = options.webrtcId || session.webrtcId;
      
      if (!webrtcId) {
        // Create WebRTC connection
        const webrtcOptions = {
          width: options.width || STREAMING_CONFIG.defaultWidth,
          height: options.height || STREAMING_CONFIG.defaultHeight,
          frameRate: options.frameRate || STREAMING_CONFIG.defaultFrameRate
        };
        
        const connection = await this.webrtcService.createConnection(sessionId, webrtcOptions);
        webrtcId = sessionId;
        
        // Update session
        await this.sessionManager.updateSession(sessionId, {
          webrtcId
        });
      }
      
      // Create encoder if needed
      const encoderOptions = {
        maxWidth: options.width || STREAMING_CONFIG.defaultWidth,
        maxHeight: options.height || STREAMING_CONFIG.defaultHeight,
        frameRate: options.frameRate || STREAMING_CONFIG.defaultFrameRate,
        bitrate: options.bitrate || STREAMING_CONFIG.defaultBitrate,
        strategy: options.encodingStrategy || STREAMING_CONFIG.defaultEncodingStrategy
      };
      
      await this.cudaEncoder.createEncoder(sessionId, encoderOptions);
      
      // Start screencast
      const screencastOptions = {
        format: options.screencastFormat || STREAMING_CONFIG.defaultScreencastFormat,
        quality: options.screencastQuality || STREAMING_CONFIG.defaultScreencastQuality,
        maxWidth: options.width || STREAMING_CONFIG.defaultWidth,
        maxHeight: options.height || STREAMING_CONFIG.defaultHeight,
        everyNthFrame: options.everyNthFrame || STREAMING_CONFIG.defaultEveryNthFrame
      };
      
      await this.browserPool.startScreencast(pageId, screencastOptions);
      
      // Create stream
      const stream = {
        sessionId,
        pageId,
        webrtcId,
        options: {
          ...options,
          width: options.width || STREAMING_CONFIG.defaultWidth,
          height: options.height || STREAMING_CONFIG.defaultHeight,
          frameRate: options.frameRate || STREAMING_CONFIG.defaultFrameRate,
          bitrate: options.bitrate || STREAMING_CONFIG.defaultBitrate,
          encodingStrategy: options.encodingStrategy || STREAMING_CONFIG.defaultEncodingStrategy,
          adaptiveQuality: options.adaptiveQuality !== false
        },
        createdAt: Date.now(),
        lastFrameAt: Date.now(),
        frameCount: 0,
        keyFrameCount: 0,
        droppedFrameCount: 0,
        totalBytes: 0,
        active: true
      };
      
      // Store stream
      this.streams.set(sessionId, stream);
      
      // Create frame processor
      this.createFrameProcessor(sessionId, stream.options);
      
      // Create adaptive quality controller
      this.createAdaptiveQualityController(sessionId, stream.options);
      
      // Initialize performance metrics
      this.initializePerformanceMetrics(sessionId);
      
      logger.info(`Stream created for session ${sessionId}`);
      
      // Emit stream created event
      this.emit('streamCreated', sessionId, stream);
      
      return stream;
    } catch (error) {
      logger.error(`Error creating stream for session ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * Create frame processor
   * @param {string} sessionId Session ID
   * @param {Object} options Frame processor options
   */
  createFrameProcessor(sessionId, options = {}) {
    // Create frame processor
    const frameProcessor = {
      sessionId,
      options,
      lastFrameTimestamp: Date.now(),
      frameInterval: 1000 / (options.frameRate || STREAMING_CONFIG.defaultFrameRate),
      frameQueue: [],
      processing: false,
      dropped: 0,
      processed: 0
    };
    
    // Store frame processor
    this.frameProcessors.set(sessionId, frameProcessor);
  }

  /**
   * Create adaptive quality controller
   * @param {string} sessionId Session ID
   * @param {Object} options Adaptive quality controller options
   */
  createAdaptiveQualityController(sessionId, options = {}) {
    // Create adaptive quality controller
    const adaptiveQualityController = {
      sessionId,
      options,
      enabled: options.adaptiveQuality !== false,
      lastAdjustmentTime: Date.now(),
      adjustmentInterval: STREAMING_CONFIG.adaptiveQualityAdjustmentInterval,
      networkStats: {
        rtt: [],
        jitter: [],
        packetLoss: [],
        bandwidth: []
      },
      encodingStats: {
        encodingTimes: [],
        bitrates: [],
        frameIntervals: []
      },
      currentQuality: {
        width: options.width || STREAMING_CONFIG.defaultWidth,
        height: options.height || STREAMING_CONFIG.defaultHeight,
        frameRate: options.frameRate || STREAMING_CONFIG.defaultFrameRate,
        bitrate: options.bitrate || STREAMING_CONFIG.defaultBitrate,
        quality: options.screencastQuality || STREAMING_CONFIG.defaultScreencastQuality
      },
      targetQuality: {
        width: options.width || STREAMING_CONFIG.defaultWidth,
        height: options.height || STREAMING_CONFIG.defaultHeight,
        frameRate: options.frameRate || STREAMING_CONFIG.defaultFrameRate,
        bitrate: options.bitrate || STREAMING_CONFIG.defaultBitrate,
        quality: options.screencastQuality || STREAMING_CONFIG.defaultScreencastQuality
      }
    };
    
    // Store adaptive quality controller
    this.adaptiveQualityControllers.set(sessionId, adaptiveQualityController);
  }

  /**
   * Initialize performance metrics
   * @param {string} sessionId Session ID
   */
  initializePerformanceMetrics(sessionId) {
    // Initialize performance metrics
    const performanceMetrics = {
      frameEncodeTime: [],
      networkLatency: [],
      memoryUsage: [],
      cpuUsage: [],
      frameRate: [],
      bitrate: [],
      timestamp: Date.now()
    };
    
    // Store performance metrics
    this.performanceMetrics.set(sessionId, performanceMetrics);
  }

  /**
   * Handle screencast frame
   * @param {string} pageId Page ID
   * @param {Object} frameObject Frame object
   */
  async handleScreencastFrame(pageId, frameObject) {
    try {
      // Find session for page
      let sessionId = null;
      
      for (const [id, stream] of this.streams.entries()) {
        if (stream.pageId === pageId) {
          sessionId = id;
          break;
        }
      }
      
      if (!sessionId) {
        return;
      }
      
      // Get stream
      const stream = this.streams.get(sessionId);
      
      if (!stream || !stream.active) {
        return;
      }
      
      // Update stream
      stream.lastFrameAt = Date.now();
      stream.frameCount++;
      
      // Get frame processor
      const frameProcessor = this.frameProcessors.get(sessionId);
      
      if (!frameProcessor) {
        return;
      }
      
      // Check if we should process this frame
      const now = Date.now();
      const timeSinceLastFrame = now - frameProcessor.lastFrameTimestamp;
      
      if (timeSinceLastFrame < frameProcessor.frameInterval) {
        // Drop frame
        stream.droppedFrameCount++;
        frameProcessor.dropped++;
        return;
      }
      
      // Update frame processor
      frameProcessor.lastFrameTimestamp = now;
      
      // Process frame
      await this.processFrame(sessionId, frameObject);
    } catch (error) {
      logger.error(`Error handling screencast frame for page ${pageId}`, error);
    }
  }

  /**
   * Process frame
   * @param {string} sessionId Session ID
   * @param {Object} frameObject Frame object
   * @returns {Promise<boolean>} Success
   */
  async processFrame(sessionId, frameObject) {
    try {
      // Get frame processor
      const frameProcessor = this.frameProcessors.get(sessionId);
      
      if (!frameProcessor) {
        return false;
      }
      
      // Check if already processing
      if (frameProcessor.processing) {
        // Add to queue
        frameProcessor.frameQueue.push(frameObject);
        return true;
      }
      
      // Set processing flag
      frameProcessor.processing = true;
      
      try {
        // Get frame data
        const frameData = Buffer.from(frameObject.data, 'base64');
        
        // Get adaptive quality controller
        const adaptiveQualityController = this.adaptiveQualityControllers.get(sessionId);
        
        // Apply adaptive quality if enabled
        if (adaptiveQualityController && adaptiveQualityController.enabled) {
          await this.applyAdaptiveQuality(sessionId);
        }
        
        // Encode frame
        const startTime = Date.now();
        await this.cudaEncoder.encodeFrame(sessionId, frameData);
        const endTime = Date.now();
        
        // Update performance metrics
        this.updatePerformanceMetrics(sessionId, {
          frameEncodeTime: endTime - startTime
        });
        
        // Update frame processor
        frameProcessor.processed++;
        
        // Process next frame in queue
        if (frameProcessor.frameQueue.length > 0) {
          const nextFrame = frameProcessor.frameQueue.shift();
          setImmediate(() => this.processFrame(sessionId, nextFrame));
        }
        
        return true;
      } finally {
        // Clear processing flag
        frameProcessor.processing = false;
      }
    } catch (error) {
      logger.error(`Error processing frame for session ${sessionId}`, error);
      return false;
    }
  }

  /**
   * Handle encoded frame
   * @param {string} sessionId Session ID
   * @param {Buffer} frameData Frame data
   * @param {Object} frameInfo Frame info
   */
  async handleEncodedFrame(sessionId, frameData, frameInfo) {
    try {
      // Get stream
      const stream = this.streams.get(sessionId);
      
      if (!stream || !stream.active) {
        return;
      }
      
      // Update stream
      stream.lastFrameAt = Date.now();
      stream.totalBytes += frameData.length;
      
      if (frameInfo.keyFrame) {
        stream.keyFrameCount++;
      }
      
      // Send frame via WebRTC
      await this.webrtcService.sendVideoFrame(sessionId, frameData, {
        width: stream.options.width,
        height: stream.options.height,
        timestamp: frameInfo.timestamp,
        format: frameInfo.format
      });
      
      // Update session stats
      await this.sessionManager.updateSessionStats(sessionId, {
        frameCount: stream.frameCount,
        bytesSent: stream.totalBytes
      });
      
      // Emit frame sent event
      this.emit('frameSent', sessionId, {
        timestamp: Date.now(),
        frameCount: stream.frameCount,
        keyFrameCount: stream.keyFrameCount,
        droppedFrameCount: stream.droppedFrameCount,
        totalBytes: stream.totalBytes
      });
    } catch (error) {
      logger.error(`Error handling encoded frame for session ${sessionId}`, error);
    }
  }

  /**
   * Apply adaptive quality
   * @param {string} sessionId Session ID
   * @returns {Promise<boolean>} Success
   */
  async applyAdaptiveQuality(sessionId) {
    try {
      // Get adaptive quality controller
      const adaptiveQualityController = this.adaptiveQualityControllers.get(sessionId);
      
      if (!adaptiveQualityController || !adaptiveQualityController.enabled) {
        return false;
      }
      
      // Check if it's time to adjust quality
      const now = Date.now();
      
      if (now - adaptiveQualityController.lastAdjustmentTime < adaptiveQualityController.adjustmentInterval) {
        return false;
      }
      
      // Update last adjustment time
      adaptiveQualityController.lastAdjustmentTime = now;
      
      // Get WebRTC connection stats
      const webrtcStats = await this.webrtcService.getConnectionStats(sessionId);
      
      if (!webrtcStats) {
        return false;
      }
      
      // Get encoder stats
      const encoderStats = this.cudaEncoder.getEncoderStats(sessionId);
      
      if (!encoderStats) {
        return false;
      }
      
      // Update network stats
      adaptiveQualityController.networkStats.rtt.push(webrtcStats.roundTripTime);
      adaptiveQualityController.networkStats.jitter.push(webrtcStats.jitter);
      adaptiveQualityController.networkStats.packetLoss.push(webrtcStats.packetsLost);
      
      // Keep only the last 10 stats
      if (adaptiveQualityController.networkStats.rtt.length > 10) {
        adaptiveQualityController.networkStats.rtt.shift();
        adaptiveQualityController.networkStats.jitter.shift();
        adaptiveQualityController.networkStats.packetLoss.shift();
      }
      
      // Update encoding stats
      adaptiveQualityController.encodingStats.encodingTimes.push(encoderStats.encodingTime);
      adaptiveQualityController.encodingStats.bitrates.push(encoderStats.avgBitrate);
      
      // Keep only the last 10 stats
      if (adaptiveQualityController.encodingStats.encodingTimes.length > 10) {
        adaptiveQualityController.encodingStats.encodingTimes.shift();
        adaptiveQualityController.encodingStats.bitrates.shift();
      }
      
      // Calculate average stats
      const avgRtt = adaptiveQualityController.networkStats.rtt.reduce((sum, val) => sum + val, 0) / adaptiveQualityController.networkStats.rtt.length;
      const avgJitter = adaptiveQualityController.networkStats.jitter.reduce((sum, val) => sum + val, 0) / adaptiveQualityController.networkStats.jitter.length;
      const avgPacketLoss = adaptiveQualityController.networkStats.packetLoss.reduce((sum, val) => sum + val, 0) / adaptiveQualityController.networkStats.packetLoss.length;
      const avgEncodingTime = adaptiveQualityController.encodingStats.encodingTimes.reduce((sum, val) => sum + val, 0) / adaptiveQualityController.encodingStats.encodingTimes.length;
      const avgBitrate = adaptiveQualityController.encodingStats.bitrates.reduce((sum, val) => sum + val, 0) / adaptiveQualityController.encodingStats.bitrates.length;
      
      // Determine network conditions
      let networkCondition = 'good';
      
      if (avgRtt > 300 || avgJitter > 50 || avgPacketLoss > 5) {
        networkCondition = 'poor';
      } else if (avgRtt > 150 || avgJitter > 25 || avgPacketLoss > 2) {
        networkCondition = 'fair';
      }
      
      // Determine encoding conditions
      let encodingCondition = 'good';
      
      if (avgEncodingTime > 50) {
        encodingCondition = 'poor';
      } else if (avgEncodingTime > 25) {
        encodingCondition = 'fair';
      }
      
      // Adjust quality based on conditions
      let qualityChanged = false;
      
      if (networkCondition === 'poor' || encodingCondition === 'poor') {
        // Reduce quality
        if (adaptiveQualityController.currentQuality.bitrate > STREAMING_CONFIG.minBitrate) {
          adaptiveQualityController.targetQuality.bitrate = Math.max(
            adaptiveQualityController.currentQuality.bitrate * 0.8,
            STREAMING_CONFIG.minBitrate
          );
          qualityChanged = true;
        }
        
        if (adaptiveQualityController.currentQuality.frameRate > STREAMING_CONFIG.minFrameRate) {
          adaptiveQualityController.targetQuality.frameRate = Math.max(
            adaptiveQualityController.currentQuality.frameRate * 0.8,
            STREAMING_CONFIG.minFrameRate
          );
          qualityChanged = true;
        }
      } else if (networkCondition === 'fair' || encodingCondition === 'fair') {
        // Slightly reduce quality
        if (adaptiveQualityController.currentQuality.bitrate > STREAMING_CONFIG.minBitrate) {
          adaptiveQualityController.targetQuality.bitrate = Math.max(
            adaptiveQualityController.currentQuality.bitrate * 0.9,
            STREAMING_CONFIG.minBitrate
          );
          qualityChanged = true;
        }
      } else if (networkCondition === 'good' && encodingCondition === 'good') {
        // Increase quality
        if (adaptiveQualityController.currentQuality.bitrate < adaptiveQualityController.options.bitrate) {
          adaptiveQualityController.targetQuality.bitrate = Math.min(
            adaptiveQualityController.currentQuality.bitrate * 1.1,
            adaptiveQualityController.options.bitrate
          );
          qualityChanged = true;
        }
        
        if (adaptiveQualityController.currentQuality.frameRate < adaptiveQualityController.options.frameRate) {
          adaptiveQualityController.targetQuality.frameRate = Math.min(
            adaptiveQualityController.currentQuality.frameRate * 1.1,
            adaptiveQualityController.options.frameRate
          );
          qualityChanged = true;
        }
      }
      
      // Apply quality changes if needed
      if (qualityChanged) {
        // Update encoder options
        await this.cudaEncoder.updateEncoderOptions(sessionId, {
          bitrate: Math.round(adaptiveQualityController.targetQuality.bitrate),
          frameRate: Math.round(adaptiveQualityController.targetQuality.frameRate)
        });
        
        // Update current quality
        adaptiveQualityController.currentQuality = { ...adaptiveQualityController.targetQuality };
        
        // Emit quality changed event
        this.emit('qualityChanged', sessionId, adaptiveQualityController.currentQuality);
        
        logger.info(`Adaptive quality adjusted for session ${sessionId}`, adaptiveQualityController.currentQuality);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error applying adaptive quality for session ${sessionId}`, error);
      return false;
    }
  }

  /**
   * Update performance metrics
   * @param {string} sessionId Session ID
   * @param {Object} metrics Metrics to update
   */
  updatePerformanceMetrics(sessionId, metrics = {}) {
    try {
      // Get performance metrics
      const performanceMetrics = this.performanceMetrics.get(sessionId);
      
      if (!performanceMetrics) {
        return;
      }
      
      // Update metrics
      if (metrics.frameEncodeTime !== undefined) {
        performanceMetrics.frameEncodeTime.push(metrics.frameEncodeTime);
        
        // Keep only the last 100 metrics
        if (performanceMetrics.frameEncodeTime.length > 100) {
          performanceMetrics.frameEncodeTime.shift();
        }
      }
      
      if (metrics.networkLatency !== undefined) {
        performanceMetrics.networkLatency.push(metrics.networkLatency);
        
        // Keep only the last 100 metrics
        if (performanceMetrics.networkLatency.length > 100) {
          performanceMetrics.networkLatency.shift();
        }
      }
      
      if (metrics.memoryUsage !== undefined) {
        performanceMetrics.memoryUsage.push(metrics.memoryUsage);
        
        // Keep only the last 100 metrics
        if (performanceMetrics.memoryUsage.length > 100) {
          performanceMetrics.memoryUsage.shift();
        }
      }
      
      if (metrics.cpuUsage !== undefined) {
        performanceMetrics.cpuUsage.push(metrics.cpuUsage);
        
        // Keep only the last 100 metrics
        if (performanceMetrics.cpuUsage.length > 100) {
          performanceMetrics.cpuUsage.shift();
        }
      }
      
      if (metrics.frameRate !== undefined) {
        performanceMetrics.frameRate.push(metrics.frameRate);
        
        // Keep only the last 100 metrics
        if (performanceMetrics.frameRate.length > 100) {
          performanceMetrics.frameRate.shift();
        }
      }
      
      if (metrics.bitrate !== undefined) {
        performanceMetrics.bitrate.push(metrics.bitrate);
        
        // Keep only the last 100 metrics
        if (performanceMetrics.bitrate.length > 100) {
          performanceMetrics.bitrate.shift();
        }
      }
      
      // Update timestamp
      performanceMetrics.timestamp = Date.now();
    } catch (error) {
      logger.error(`Error updating performance metrics for session ${sessionId}`, error);
    }
  }

  /**
   * Handle page closed
   * @param {string} pageId Page ID
   */
  async handlePageClosed(pageId) {
    try {
      // Find session for page
      let sessionId = null;
      
      for (const [id, stream] of this.streams.entries()) {
        if (stream.pageId === pageId) {
          sessionId = id;
          break;
        }
      }
      
      if (!sessionId) {
        return;
      }
      
      // Close stream
      await this.closeStream(sessionId, 'page_closed');
    } catch (error) {
      logger.error(`Error handling page closed for page ${pageId}`, error);
    }
  }

  /**
   * Handle session closed
   * @param {string} sessionId Session ID
   */
  async handleSessionClosed(sessionId) {
    try {
      // Close stream
      await this.closeStream(sessionId, 'session_closed');
    } catch (error) {
      logger.error(`Error handling session closed for session ${sessionId}`, error);
    }
  }

  /**
   * Handle WebRTC connection closed
   * @param {string} sessionId Session ID
   */
  async handleWebRTCConnectionClosed(sessionId) {
    try {
      // Get stream
      const stream = this.streams.get(sessionId);
      
      if (!stream) {
        return;
      }
      
      // Close stream
      await this.closeStream(sessionId, 'webrtc_closed');
    } catch (error) {
      logger.error(`Error handling WebRTC connection closed for session ${sessionId}`, error);
    }
  }

  /**
   * Close stream
   * @param {string} sessionId Session ID
   * @param {string} reason Reason for closing
   * @returns {Promise<boolean>} Success
   */
  async closeStream(sessionId, reason = 'closed') {
    try {
      logger.info(`Closing stream for session ${sessionId} with reason: ${reason}`);
      
      // Get stream
      const stream = this.streams.get(sessionId);
      
      if (!stream) {
        logger.warn(`Stream not found for session ${sessionId}`);
        return false;
      }
      
      // Update stream
      stream.active = false;
      
      // Stop screencast
      try {
        await this.browserPool.stopScreencast(stream.pageId);
      } catch (error) {
        logger.error(`Error stopping screencast for session ${sessionId}`, error);
      }
      
      // Destroy encoder
      try {
        await this.cudaEncoder.destroyEncoder(sessionId);
      } catch (error) {
        logger.error(`Error destroying encoder for session ${sessionId}`, error);
      }
      
      // Close WebRTC connection
      try {
        await this.webrtcService.closeConnection(sessionId);
      } catch (error) {
        logger.error(`Error closing WebRTC connection for session ${sessionId}`, error);
      }
      
      // Remove frame processor
      this.frameProcessors.delete(sessionId);
      
      // Remove adaptive quality controller
      this.adaptiveQualityControllers.delete(sessionId);
      
      // Remove performance metrics
      this.performanceMetrics.delete(sessionId);
      
      // Remove stream
      this.streams.delete(sessionId);
      
      logger.info(`Stream closed for session ${sessionId}`);
      
      // Emit stream closed event
      this.emit('streamClosed', sessionId, reason);
      
      return true;
    } catch (error) {
      logger.error(`Error closing stream for session ${sessionId}`, error);
      
      // Remove stream anyway
      this.streams.delete(sessionId);
      this.frameProcessors.delete(sessionId);
      this.adaptiveQualityControllers.delete(sessionId);
      this.performanceMetrics.delete(sessionId);
      
      return false;
    }
  }

  /**
   * Get stream
   * @param {string} sessionId Session ID
   * @returns {Object} Stream info
   */
  getStream(sessionId) {
    return this.streams.get(sessionId);
  }

  /**
   * Get stream stats
   * @param {string} sessionId Session ID
   * @returns {Object} Stream stats
   */
  getStreamStats(sessionId) {
    try {
      // Get stream
      const stream = this.streams.get(sessionId);
      
      if (!stream) {
        return null;
      }
      
      // Get frame processor
      const frameProcessor = this.frameProcessors.get(sessionId);
      
      // Get adaptive quality controller
      const adaptiveQualityController = this.adaptiveQualityControllers.get(sessionId);
      
      // Get performance metrics
      const performanceMetrics = this.performanceMetrics.get(sessionId);
      
      // Get encoder stats
      const encoderStats = this.cudaEncoder.getEncoderStats(sessionId);
      
      // Get WebRTC stats
      const webrtcStats = this.webrtcService.getConnectionStats(sessionId);
      
      // Compile stats
      return {
        sessionId,
        active: stream.active,
        frameCount: stream.frameCount,
        keyFrameCount: stream.keyFrameCount,
        droppedFrameCount: stream.droppedFrameCount,
        totalBytes: stream.totalBytes,
        uptime: Date.now() - stream.createdAt,
        lastFrameAt: stream.lastFrameAt,
        options: stream.options,
        frameProcessor: frameProcessor ? {
          processed: frameProcessor.processed,
          dropped: frameProcessor.dropped,
          queueLength: frameProcessor.frameQueue.length,
          frameInterval: frameProcessor.frameInterval
        } : null,
        adaptiveQuality: adaptiveQualityController ? {
          enabled: adaptiveQualityController.enabled,
          currentQuality: adaptiveQualityController.currentQuality
        } : null,
        performanceMetrics: performanceMetrics ? {
          frameEncodeTime: performanceMetrics.frameEncodeTime.length > 0 ? 
            performanceMetrics.frameEncodeTime.reduce((sum, val) => sum + val, 0) / performanceMetrics.frameEncodeTime.length : 0,
          networkLatency: performanceMetrics.networkLatency.length > 0 ?
            performanceMetrics.networkLatency.reduce((sum, val) => sum + val, 0) / performanceMetrics.networkLatency.length : 0
        } : null,
        encoder: encoderStats,
        webrtc: webrtcStats,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Error getting stream stats for session ${sessionId}`, error);
      return null;
    }
  }

  /**
   * Get all stream stats
   * @returns {Array} Stream stats
   */
  getAllStreamStats() {
    const stats = [];
    
    for (const sessionId of this.streams.keys()) {
      try {
        const streamStats = this.getStreamStats(sessionId);
        
        if (streamStats) {
          stats.push(streamStats);
        }
      } catch (error) {
        logger.error(`Error getting stats for stream ${sessionId}`, error);
      }
    }
    
    return stats;
  }

  /**
   * Shutdown streaming engine
   */
  async shutdown() {
    logger.info('Shutting down Streaming Engine');
    
    try {
      // Close all streams
      const sessionIds = Array.from(this.streams.keys());
      
      for (const sessionId of sessionIds) {
        try {
          await this.closeStream(sessionId, 'shutdown');
        } catch (error) {
          logger.error(`Error closing stream ${sessionId} during shutdown`, error);
        }
      }
      
      logger.info('Streaming Engine shutdown complete');
    } catch (error) {
      logger.error('Error shutting down Streaming Engine', error);
    }
  }
}

module.exports = StreamingEngine;
