/**
 * Session API
 * RESTful API for session management
 */

const express = require('express');
const { asyncHandler, validateRequest } = require('../utils/error-handler');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Create session API router
 * @param {Object} sessionManager Session manager
 * @returns {Object} Express router
 */
const createSessionApi = (sessionManager) => {
  const router = express.Router();
  
  /**
   * Session creation schema
   */
  const sessionCreationSchema = Joi.object({
    userId: Joi.string().optional(),
    timeout: Joi.number().min(60000).max(3600000).optional(), // 1 minute to 1 hour
    startUrl: Joi.string().uri().optional(),
    userAgent: Joi.string().optional(),
    viewport: Joi.object({
      width: Joi.number().min(320).max(1920).optional(),
      height: Joi.number().min(240).max(1080).optional()
    }).optional()
  });
  
  /**
   * Create session
   */
  router.post('/', validateRequest(sessionCreationSchema), asyncHandler(async (req, res) => {
    logger.info('Creating session', req.body);
    
    // Create session
    const session = await sessionManager.createSession(req.body);
    
    // Return session info
    res.status(201).json({
      success: true,
      data: {
        sessionId: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      }
    });
  }));
  
  /**
   * Get session
   */
  router.get('/:sessionId', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Getting session ${sessionId}`);
    
    // Get session
    const session = sessionManager.getSession(sessionId);
    
    // Check if session exists
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_SESSION_NOT_FOUND',
          message: `Session not found: ${sessionId}`
        }
      });
    }
    
    // Return session info
    res.json({
      success: true,
      data: {
        sessionId: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        expiresAt: session.expiresAt,
        options: session.options
      }
    });
  }));
  
  /**
   * Refresh session
   */
  router.post('/:sessionId/refresh', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Refreshing session ${sessionId}`);
    
    // Refresh session
    const session = sessionManager.refreshSession(sessionId);
    
    // Return session info
    res.json({
      success: true,
      data: {
        sessionId: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        expiresAt: session.expiresAt
      }
    });
  }));
  
  /**
   * Destroy session
   */
  router.delete('/:sessionId', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Destroying session ${sessionId}`);
    
    // Destroy session
    const success = await sessionManager.destroySession(sessionId);
    
    // Check if session was destroyed
    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_SESSION_NOT_FOUND',
          message: `Session not found: ${sessionId}`
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
   * Navigate to URL
   */
  router.post('/:sessionId/navigate', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { url, options } = req.body;
    
    logger.info(`Navigating session ${sessionId} to ${url}`);
    
    // Check if URL is provided
    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ERR_URL_REQUIRED',
          message: 'URL is required'
        }
      });
    }
    
    // Navigate to URL
    const result = await sessionManager.navigateToUrl(sessionId, url, options);
    
    // Return result
    res.json({
      success: true,
      data: {
        sessionId,
        url,
        result
      }
    });
  }));
  
  /**
   * Execute script
   */
  router.post('/:sessionId/execute', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { script, options } = req.body;
    
    logger.info(`Executing script for session ${sessionId}`);
    
    // Check if script is provided
    if (!script) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ERR_SCRIPT_REQUIRED',
          message: 'Script is required'
        }
      });
    }
    
    // Execute script
    const result = await sessionManager.executeScript(sessionId, script, options);
    
    // Return result
    res.json({
      success: true,
      data: {
        sessionId,
        result
      }
    });
  }));
  
  /**
   * Send input
   */
  router.post('/:sessionId/input', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { input } = req.body;
    
    logger.info(`Sending input for session ${sessionId}`, input);
    
    // Check if input is provided
    if (!input) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ERR_INPUT_REQUIRED',
          message: 'Input is required'
        }
      });
    }
    
    // Send input
    const success = await sessionManager.sendInput(sessionId, input);
    
    // Return result
    res.json({
      success: true,
      data: {
        sessionId,
        success
      }
    });
  }));
  
  /**
   * Get session stats
   */
  router.get('/:sessionId/stats', asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    logger.info(`Getting stats for session ${sessionId}`);
    
    // Get session stats
    const stats = await sessionManager.getSessionStats(sessionId);
    
    // Check if session exists
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_SESSION_NOT_FOUND',
          message: `Session not found: ${sessionId}`
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
   * Get all sessions
   */
  router.get('/', asyncHandler(async (req, res) => {
    logger.info('Getting all sessions');
    
    // Get all sessions
    const sessions = sessionManager.getAllSessions();
    
    // Return sessions
    res.json({
      success: true,
      data: {
        count: sessions.length,
        sessions: sessions.map(session => ({
          sessionId: session.id,
          userId: session.userId,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt
        }))
      }
    });
  }));
  
  /**
   * Get all session stats
   */
  router.get('/stats', asyncHandler(async (req, res) => {
    logger.info('Getting all session stats');
    
    // Get all session stats
    const stats = await sessionManager.getAllSessionStats();
    
    // Return stats
    res.json({
      success: true,
      data: {
        count: stats.length,
        sessions: stats
      }
    });
  }));
  
  return router;
};

module.exports = createSessionApi;
