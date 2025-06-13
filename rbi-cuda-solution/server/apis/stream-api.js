/**
 * Stream API
 * RESTful API for streaming operations
 */

const express = require('express');
const { asyncHandler, validateRequest } = require('../utils/error-handler');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Create stream API router
 * @param {Object} streamingEngine Streaming engine
 * @param {Object} sessionManager Session manager
 * @returns {Object} Express router
 */
const createStreamApi = (streamingEngine, sessionManager) => {
  // Get webrtcService from streamingEngine
  const webrtcService = streamingEngine.webrtcService;
  const router = express.Router();
  
  /**
   * Stream creation schema
   */
  const streamCreationSchema = Joi.object({
    quality: Joi.string().valid('low', 'medium', 'high', 'ultra').optional(),
    maxWidth: Joi.number().min(320).max(1920).optional(),
    maxHeight: Joi.number().min(240).max(1080).optional(),
    frameRate: Joi.number().min(10).max(60).optional(),
    bitrate: Joi.number().min(100000).max(10000000).optional()
  });
  
  /**
   * Create WebRTC connection
   */
  router.post('/:sessionId/webrtc', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Creating WebRTC connection for session ${sessionId}`);
    
    // Create peer connection
    const { peerConnection } = await webrtcService.createPeerConnection(sessionId);
    
    // Create offer
    const offer = await webrtcService.createOffer(sessionId);
    
    // Return offer
    res.json({
      success: true,
      data: {
        sessionId,
        offer
      }
    });
  }));
  
  /**
   * Handle WebRTC answer
   */
  router.post('/:sessionId/webrtc/answer', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { answer } = req.body;
    
    logger.info(`Handling WebRTC answer for session ${sessionId}`);
    
    // Check if answer is provided
    if (!answer) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ERR_ANSWER_REQUIRED',
          message: 'Answer is required'
        }
      });
    }
    
    // Handle answer
    await webrtcService.handleAnswer(sessionId, answer);
    
    // Return success
    res.json({
      success: true,
      data: {
        sessionId
      }
    });
  }));
  
  /**
   * Add ICE candidate
   */
  router.post('/:sessionId/webrtc/ice-candidate', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { candidate } = req.body;
    
    logger.info(`Adding ICE candidate for session ${sessionId}`);
    
    // Check if candidate is provided
    if (!candidate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ERR_CANDIDATE_REQUIRED',
          message: 'Candidate is required'
        }
      });
    }
    
    // Add ICE candidate
    await webrtcService.addIceCandidate(sessionId, candidate);
    
    // Return success
    res.json({
      success: true,
      data: {
        sessionId
      }
    });
  }));
  
  /**
   * Get ICE candidates
   */
  router.get('/:sessionId/webrtc/ice-candidates', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Getting ICE candidates for session ${sessionId}`);
    
    // Get ICE candidates
    const candidates = webrtcService.getIceCandidates(sessionId);
    
    // Return candidates
    res.json({
      success: true,
      data: {
        sessionId,
        candidates
      }
    });
  }));
  
  /**
   * Start stream
   */
  router.post('/:sessionId/start', validateRequest(streamCreationSchema), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Starting stream for session ${sessionId}`, req.body);
    
    // Start stream
    const stream = await streamingEngine.startStream(sessionId, req.body);
    
    // Return stream info
    res.json({
      success: true,
      data: {
        sessionId,
        quality: stream.options.quality,
        resolution: `${stream.options.maxWidth}x${stream.options.maxHeight}`,
        frameRate: stream.options.frameRate,
        bitrate: stream.options.bitrate
      }
    });
  }));
  
  /**
   * Stop stream
   */
  router.post('/:sessionId/stop', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Stopping stream for session ${sessionId}`);
    
    // Stop stream
    const success = await streamingEngine.stopStream(sessionId);
    
    // Check if stream was stopped
    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_STREAM_NOT_FOUND',
          message: `Stream not found for session: ${sessionId}`
        }
      });
    }
    
    // Return success
    res.json({
      success: true,
      data: {
        sessionId
      }
    });
  }));
  
  /**
   * Update stream quality
   */
  router.post('/:sessionId/quality', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { quality } = req.body;
    
    logger.info(`Updating stream quality for session ${sessionId} to ${quality}`);
    
    // Check if quality is provided
    if (!quality) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ERR_QUALITY_REQUIRED',
          message: 'Quality is required'
        }
      });
    }
    
    // Update stream quality
    const stream = await streamingEngine.updateStreamQuality(sessionId, quality);
    
    // Check if stream exists
    if (!stream) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_STREAM_NOT_FOUND',
          message: `Stream not found for session: ${sessionId}`
        }
      });
    }
    
    // Return stream info
    res.json({
      success: true,
      data: {
        sessionId,
        quality: stream.options.quality,
        resolution: `${stream.options.maxWidth}x${stream.options.maxHeight}`,
        frameRate: stream.options.frameRate,
        bitrate: stream.options.bitrate
      }
    });
  }));
  
  /**
   * Update stream options
   */
  router.post('/:sessionId/options', validateRequest(streamCreationSchema), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Updating stream options for session ${sessionId}`, req.body);
    
    // Update stream options
    const stream = await streamingEngine.updateStreamOptions(sessionId, req.body);
    
    // Check if stream exists
    if (!stream) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_STREAM_NOT_FOUND',
          message: `Stream not found for session: ${sessionId}`
        }
      });
    }
    
    // Return stream info
    res.json({
      success: true,
      data: {
        sessionId,
        quality: stream.options.quality,
        resolution: `${stream.options.maxWidth}x${stream.options.maxHeight}`,
        frameRate: stream.options.frameRate,
        bitrate: stream.options.bitrate
      }
    });
  }));
  
  /**
   * Get stream stats
   */
  router.get('/:sessionId/stats', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Getting stream stats for session ${sessionId}`);
    
    // Get stream stats
    const stats = streamingEngine.getStreamStats(sessionId);
    
    // Check if stream exists
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_STREAM_NOT_FOUND',
          message: `Stream not found for session: ${sessionId}`
        }
      });
    }
    
    // Return stats
    res.json({
      success: true,
      data: stats
    });
  }));
  
  /**
   * Get WebRTC stats
   */
  router.get('/:sessionId/webrtc/stats', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Getting WebRTC stats for session ${sessionId}`);
    
    // Get WebRTC stats
    const stats = await webrtcService.getPeerConnectionStats(sessionId);
    
    // Check if peer connection exists
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_PEER_CONNECTION_NOT_FOUND',
          message: `Peer connection not found for session: ${sessionId}`
        }
      });
    }
    
    // Return stats
    res.json({
      success: true,
      data: {
        sessionId,
        stats
      }
    });
  }));
  
  /**
   * Get all stream stats
   */
  router.get('/stats', asyncHandler(async (req, res) => {
    logger.info('Getting all stream stats');
    
    // Get all stream stats
    const stats = streamingEngine.getAllStreamStats();
    
    // Return stats
    res.json({
      success: true,
      data: {
        count: stats.length,
        streams: stats
      }
    });
  }));
  
  return router;
};

module.exports = createStreamApi;
