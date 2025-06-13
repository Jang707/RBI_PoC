/**
 * Session Manager
 * Manages user sessions and their associated resources
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { SESSION_CONFIG } = require('../utils/config');
const logger = require('../utils/logger');
const { ResourceLimitError, NotFoundError } = require('../utils/error-handler');

/**
 * SessionManager class
 */
class SessionManager extends EventEmitter {
  /**
   * Constructor
   * @param {Object} browserPool Browser pool instance
   */
  constructor(browserPool) {
    super();
    this.browserPool = browserPool;
    this.sessions = new Map();
    this.sessionTimeouts = new Map();
    this.running = false;
    
    logger.info('Session Manager initialized');
  }

  /**
   * Initialize session manager
   * @returns {Promise<boolean>} Success
   */
  async initialize() {
    try {
      logger.info('Initializing Session Manager');
      
      // Set running flag
      this.running = true;
      
      // Start cleanup interval
      this.startCleanupInterval();
      
      logger.info('Session Manager initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Error initializing Session Manager', error);
      this.running = false;
      return false;
    }
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    // Clean up expired sessions every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 1000);
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      logger.info('Cleaning up expired sessions');
      
      const now = Date.now();
      const expiredSessions = [];
      
      // Find expired sessions
      for (const [sessionId, session] of this.sessions.entries()) {
        const sessionAge = now - session.createdAt;
        const lastActivityAge = now - session.lastActivityAt;
        
        // Check if session has expired
        if (sessionAge > SESSION_CONFIG.sessionTimeout * 60 * 1000 || 
            lastActivityAge > SESSION_CONFIG.sessionTimeout * 60 * 1000) {
          expiredSessions.push(sessionId);
        }
      }
      
      // Close expired sessions
      for (const sessionId of expiredSessions) {
        try {
          logger.info(`Closing expired session: ${sessionId}`);
          await this.closeSession(sessionId, 'expired');
        } catch (error) {
          logger.error(`Error closing expired session ${sessionId}`, error);
        }
      }
      
      logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
    } catch (error) {
      logger.error('Error cleaning up expired sessions', error);
    }
  }

  /**
   * Create session
   * @param {Object} options Session options
   * @returns {Promise<Object>} Session info
   */
  async createSession(options = {}) {
    try {
      logger.info('Creating session', options);
      
      // Check if we've reached the maximum number of concurrent sessions
      if (this.sessions.size >= SESSION_CONFIG.maxConcurrentSessions) {
        throw new ResourceLimitError(`Maximum number of concurrent sessions reached (${SESSION_CONFIG.maxConcurrentSessions})`);
      }
      
      // Generate session ID
      const sessionId = options.sessionId || uuidv4();
      
      // Check if session already exists
      if (this.sessions.has(sessionId)) {
        logger.warn(`Session already exists: ${sessionId}`);
        return this.sessions.get(sessionId);
      }
      
      // Create session
      const session = {
        id: sessionId,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        options: {
          ...options,
          memoryLimit: options.memoryLimit || SESSION_CONFIG.memoryLimitPerSession
        },
        browserId: null,
        pageId: null,
        webrtcId: null,
        status: 'created',
        stats: {
          frameCount: 0,
          bytesSent: 0,
          bytesReceived: 0
        }
      };
      
      // Store session
      this.sessions.set(sessionId, session);
      
      // Set session timeout
      this.resetSessionTimeout(sessionId);
      
      logger.info(`Session created: ${sessionId}`);
      
      // Emit session created event
      this.emit('sessionCreated', sessionId, session);
      
      return session;
    } catch (error) {
      logger.error('Error creating session', error);
      throw error;
    }
  }

  /**
   * Get session
   * @param {string} sessionId Session ID
   * @returns {Object} Session info
   */
  getSession(sessionId) {
    // Get session
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }
    
    // Update last activity time
    session.lastActivityAt = Date.now();
    
    // Reset session timeout
    this.resetSessionTimeout(sessionId);
    
    return session;
  }

  /**
   * Update session
   * @param {string} sessionId Session ID
   * @param {Object} updates Session updates
   * @returns {Promise<Object>} Updated session info
   */
  async updateSession(sessionId, updates = {}) {
    try {
      // Get session
      const session = this.getSession(sessionId);
      
      if (!session) {
        throw new NotFoundError(`Session not found: ${sessionId}`);
      }
      
      // Update session
      Object.assign(session, updates);
      
      // Update last activity time
      session.lastActivityAt = Date.now();
      
      // Reset session timeout
      this.resetSessionTimeout(sessionId);
      
      logger.info(`Session updated: ${sessionId}`, updates);
      
      // Emit session updated event
      this.emit('sessionUpdated', sessionId, session);
      
      return session;
    } catch (error) {
      logger.error(`Error updating session ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * Update session stats
   * @param {string} sessionId Session ID
   * @param {Object} stats Stats to update
   * @returns {Promise<Object>} Updated session info
   */
  async updateSessionStats(sessionId, stats = {}) {
    try {
      // Get session
      const session = this.getSession(sessionId);
      
      if (!session) {
        throw new NotFoundError(`Session not found: ${sessionId}`);
      }
      
      // Update session stats
      Object.assign(session.stats, stats);
      
      // Update last activity time
      session.lastActivityAt = Date.now();
      
      // Reset session timeout
      this.resetSessionTimeout(sessionId);
      
      return session;
    } catch (error) {
      logger.error(`Error updating session stats for ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * Close session
   * @param {string} sessionId Session ID
   * @param {string} reason Reason for closing
   * @returns {Promise<boolean>} Success
   */
  async closeSession(sessionId, reason = 'closed') {
    try {
      logger.info(`Closing session ${sessionId} with reason: ${reason}`);
      
      // Get session
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        logger.warn(`Session not found: ${sessionId}`);
        return false;
      }
      
      // Update session status
      session.status = 'closing';
      
      // Clear session timeout
      this.clearSessionTimeout(sessionId);
      
      // Close page if exists
      if (session.pageId && this.browserPool) {
        try {
          await this.browserPool.closePage(session.pageId);
        } catch (error) {
          logger.error(`Error closing page for session ${sessionId}`, error);
        }
      }
      
      // Remove session
      this.sessions.delete(sessionId);
      
      logger.info(`Session closed: ${sessionId}`);
      
      // Emit session closed event
      this.emit('sessionClosed', sessionId, reason);
      
      return true;
    } catch (error) {
      logger.error(`Error closing session ${sessionId}`, error);
      
      // Remove session anyway
      this.sessions.delete(sessionId);
      this.clearSessionTimeout(sessionId);
      
      // Emit session closed event
      this.emit('sessionClosed', sessionId, 'error');
      
      return false;
    }
  }

  /**
   * Reset session timeout
   * @param {string} sessionId Session ID
   */
  resetSessionTimeout(sessionId) {
    // Clear existing timeout
    this.clearSessionTimeout(sessionId);
    
    // Set new timeout
    const timeout = setTimeout(async () => {
      try {
        logger.info(`Session ${sessionId} timed out`);
        await this.closeSession(sessionId, 'timeout');
      } catch (error) {
        logger.error(`Error closing timed out session ${sessionId}`, error);
      }
    }, SESSION_CONFIG.sessionTimeout * 60 * 1000);
    
    // Store timeout
    this.sessionTimeouts.set(sessionId, timeout);
  }

  /**
   * Clear session timeout
   * @param {string} sessionId Session ID
   */
  clearSessionTimeout(sessionId) {
    // Get timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    
    if (timeout) {
      // Clear timeout
      clearTimeout(timeout);
      
      // Remove timeout
      this.sessionTimeouts.delete(sessionId);
    }
  }

  /**
   * Get all sessions
   * @returns {Array} Sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions count
   * @returns {number} Sessions count
   */
  getSessionsCount() {
    return this.sessions.size;
  }

  /**
   * Check if session manager is running
   * @returns {boolean} Running status
   */
  isRunning() {
    return this.running;
  }

  /**
   * Shutdown session manager
   * @returns {Promise<boolean>} Success
   */
  async shutdown() {
    try {
      logger.info('Shutting down Session Manager');
      
      // Set running flag
      this.running = false;
      
      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      
      // Close all sessions
      const sessionIds = Array.from(this.sessions.keys());
      
      for (const sessionId of sessionIds) {
        try {
          await this.closeSession(sessionId, 'shutdown');
        } catch (error) {
          logger.error(`Error closing session ${sessionId} during shutdown`, error);
        }
      }
      
      // Clear all timeouts
      for (const [sessionId, timeout] of this.sessionTimeouts.entries()) {
        clearTimeout(timeout);
      }
      
      // Clear maps
      this.sessions.clear();
      this.sessionTimeouts.clear();
      
      logger.info('Session Manager shutdown complete');
      
      return true;
    } catch (error) {
      logger.error('Error shutting down Session Manager', error);
      return false;
    }
  }
}

module.exports = SessionManager;
