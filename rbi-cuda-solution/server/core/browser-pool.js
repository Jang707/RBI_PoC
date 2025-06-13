/**
 * Browser Pool
 * Manages browser instances and pages
 */

const { EventEmitter } = require('events');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const { BROWSER_CONFIG } = require('../utils/config');
const logger = require('../utils/logger');
const { ResourceLimitError, NotFoundError } = require('../utils/error-handler');

/**
 * BrowserPool class
 */
class BrowserPool extends EventEmitter {
  /**
   * Constructor
   */
  constructor() {
    super();
    this.browsers = new Map();
    this.pages = new Map();
    this.running = false;
    this.memoryMonitoringInterval = null;
    
    logger.info('Browser Pool initialized');
  }

  /**
   * Initialize browser pool
   * @returns {Promise<boolean>} Success
   */
  async initialize() {
    try {
      logger.info('Initializing Browser Pool');
      
      // Set running flag
      this.running = true;
      
      // Start memory monitoring
      this.startMemoryMonitoring();
      
      logger.info('Browser Pool initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Error initializing Browser Pool', error);
      this.running = false;
      return false;
    }
  }

  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    // Monitor memory usage every minute
    this.memoryMonitoringInterval = setInterval(async () => {
      try {
        await this.monitorMemoryUsage();
      } catch (error) {
        logger.error('Error monitoring memory usage', error);
      }
    }, BROWSER_CONFIG.memoryMonitoringInterval);
  }

  /**
   * Monitor memory usage
   * @returns {Promise<void>}
   */
  async monitorMemoryUsage() {
    try {
      logger.info('Monitoring browser memory usage');
      
      // Check each browser's memory usage
      for (const [browserId, browser] of this.browsers.entries()) {
        try {
          // Get browser process
          const browserProcess = browser.process();
          
          if (!browserProcess) {
            continue;
          }
          
          // Check if browser has exceeded memory threshold
          if (browser.pages().length === 0) {
            // No pages, close browser
            logger.info(`Browser ${browserId} has no pages, closing`);
            await this.closeBrowser(browserId);
          } else if (browser.pagesCreated >= BROWSER_CONFIG.restartBrowserAfterPages) {
            // Too many pages created, restart browser
            logger.info(`Browser ${browserId} has created too many pages (${browser.pagesCreated}), restarting`);
            await this.restartBrowser(browserId);
          } else if (Date.now() - browser.createdAt >= BROWSER_CONFIG.restartBrowserAfterTime) {
            // Browser has been running for too long, restart
            logger.info(`Browser ${browserId} has been running for too long, restarting`);
            await this.restartBrowser(browserId);
          }
        } catch (error) {
          logger.error(`Error monitoring browser ${browserId}`, error);
        }
      }
    } catch (error) {
      logger.error('Error monitoring memory usage', error);
    }
  }

  /**
   * Create browser
   * @param {Object} options Browser options
   * @returns {Promise<Object>} Browser info
   */
  async createBrowser(options = {}) {
    try {
      logger.info('Creating browser', options);
      
      // Check if we've reached the maximum number of browsers
      if (this.browsers.size >= BROWSER_CONFIG.maxBrowsers) {
        throw new ResourceLimitError(`Maximum number of browsers reached (${BROWSER_CONFIG.maxBrowsers})`);
      }
      
      // Generate browser ID
      const browserId = options.browserId || uuidv4();
      
      // Check if browser already exists
      if (this.browsers.has(browserId)) {
        logger.warn(`Browser already exists: ${browserId}`);
        return { id: browserId, browser: this.browsers.get(browserId) };
      }
      
      // Launch browser
      const launchOptions = {
        ...BROWSER_CONFIG.launchOptions,
        ...options
      };
      
      // Use custom executable path if provided
      if (BROWSER_CONFIG.executablePath) {
        launchOptions.executablePath = BROWSER_CONFIG.executablePath;
      }
      
      const browser = await puppeteer.launch(launchOptions);
      
      // Add custom properties
      browser.id = browserId;
      browser.createdAt = Date.now();
      browser.pagesCreated = 0;
      
      // Store browser
      this.browsers.set(browserId, browser);
      
      // Set up event listeners
      browser.on('disconnected', () => {
        logger.info(`Browser ${browserId} disconnected`);
        this.browsers.delete(browserId);
        this.emit('browserDisconnected', browserId);
      });
      
      logger.info(`Browser created: ${browserId}`);
      
      // Emit browser created event
      this.emit('browserCreated', browserId, browser);
      
      return { id: browserId, browser };
    } catch (error) {
      logger.error('Error creating browser', error);
      throw error;
    }
  }

  /**
   * Get browser
   * @param {string} browserId Browser ID
   * @returns {Object} Browser instance
   */
  getBrowser(browserId) {
    return this.browsers.get(browserId);
  }

  /**
   * Get or create browser
   * @param {Object} options Browser options
   * @returns {Promise<Object>} Browser info
   */
  async getOrCreateBrowser(options = {}) {
    try {
      // Check if we have any browsers
      if (this.browsers.size === 0) {
        return await this.createBrowser(options);
      }
      
      // Find browser with fewest pages
      let bestBrowser = null;
      let minPages = Infinity;
      
      for (const [browserId, browser] of this.browsers.entries()) {
        const pageCount = (await browser.pages()).length;
        
        if (pageCount < minPages && pageCount < BROWSER_CONFIG.maxPagesPerBrowser) {
          bestBrowser = { id: browserId, browser };
          minPages = pageCount;
        }
      }
      
      // If we found a suitable browser, return it
      if (bestBrowser) {
        return bestBrowser;
      }
      
      // Otherwise, create a new browser
      return await this.createBrowser(options);
    } catch (error) {
      logger.error('Error getting or creating browser', error);
      throw error;
    }
  }

  /**
   * Create page
   * @param {Object} options Page options
   * @returns {Promise<Object>} Page info
   */
  async createPage(options = {}) {
    try {
      logger.info('Creating page', options);
      
      // Get or create browser
      const { id: browserId, browser } = await this.getOrCreateBrowser(options.browserOptions);
      
      // Generate page ID
      const pageId = options.pageId || uuidv4();
      
      // Check if page already exists
      if (this.pages.has(pageId)) {
        logger.warn(`Page already exists: ${pageId}`);
        return this.pages.get(pageId);
      }
      
      // Create page
      const page = await browser.newPage();
      
      // Increment pages created counter
      browser.pagesCreated++;
      
      // Set viewport
      await page.setViewport({
        width: options.width || BROWSER_CONFIG.defaultViewport.width,
        height: options.height || BROWSER_CONFIG.defaultViewport.height,
        deviceScaleFactor: options.deviceScaleFactor || BROWSER_CONFIG.defaultViewport.deviceScaleFactor,
        isMobile: options.isMobile || BROWSER_CONFIG.defaultViewport.isMobile,
        hasTouch: options.hasTouch || BROWSER_CONFIG.defaultViewport.hasTouch,
        isLandscape: options.isLandscape || BROWSER_CONFIG.defaultViewport.isLandscape
      });
      
      // Set page settings
      await page.setJavaScriptEnabled(BROWSER_CONFIG.defaultPageSettings.javaScriptEnabled);
      
      // Add custom properties
      page.id = pageId;
      page.browserId = browserId;
      page.createdAt = Date.now();
      page.lastActivityAt = Date.now();
      page.screencastRunning = false;
      
      // Store page
      this.pages.set(pageId, {
        id: pageId,
        browserId,
        page,
        createdAt: page.createdAt,
        lastActivityAt: page.lastActivityAt,
        screencastRunning: false,
        options: {
          ...options,
          width: options.width || BROWSER_CONFIG.defaultViewport.width,
          height: options.height || BROWSER_CONFIG.defaultViewport.height,
          deviceScaleFactor: options.deviceScaleFactor || BROWSER_CONFIG.defaultViewport.deviceScaleFactor
        }
      });
      
      // Set up event listeners
      page.on('close', () => {
        logger.info(`Page ${pageId} closed`);
        this.pages.delete(pageId);
        this.emit('pageClosed', pageId);
      });
      
      logger.info(`Page created: ${pageId} in browser ${browserId}`);
      
      // Emit page created event
      this.emit('pageCreated', pageId, this.pages.get(pageId));
      
      return this.pages.get(pageId);
    } catch (error) {
      logger.error('Error creating page', error);
      throw error;
    }
  }

  /**
   * Get page
   * @param {string} pageId Page ID
   * @returns {Object} Page info
   */
  getPage(pageId) {
    const pageInfo = this.pages.get(pageId);
    
    if (pageInfo) {
      // Update last activity time
      pageInfo.lastActivityAt = Date.now();
    }
    
    return pageInfo;
  }

  /**
   * Navigate page
   * @param {string} pageId Page ID
   * @param {string} url URL to navigate to
   * @param {Object} options Navigation options
   * @returns {Promise<Object>} Navigation result
   */
  async navigatePage(pageId, url, options = {}) {
    try {
      logger.info(`Navigating page ${pageId} to ${url}`);
      
      // Get page
      const pageInfo = this.getPage(pageId);
      
      if (!pageInfo) {
        throw new NotFoundError(`Page not found: ${pageId}`);
      }
      
      // Navigate to URL
      const response = await pageInfo.page.goto(url, {
        waitUntil: options.waitUntil || 'networkidle2',
        timeout: options.timeout || 30000
      });
      
      // Update last activity time
      pageInfo.lastActivityAt = Date.now();
      
      logger.info(`Page ${pageId} navigated to ${url}`);
      
      // Emit page navigated event
      this.emit('pageNavigated', pageId, url);
      
      return {
        pageId,
        url,
        status: response ? response.status() : null,
        ok: response ? response.ok() : false
      };
    } catch (error) {
      logger.error(`Error navigating page ${pageId} to ${url}`, error);
      throw error;
    }
  }

  /**
   * Start screencast
   * @param {string} pageId Page ID
   * @param {Object} options Screencast options
   * @returns {Promise<boolean>} Success
   */
  async startScreencast(pageId, options = {}) {
    try {
      logger.info(`Starting screencast for page ${pageId}`, options);
      
      // Get page
      const pageInfo = this.getPage(pageId);
      
      if (!pageInfo) {
        throw new NotFoundError(`Page not found: ${pageId}`);
      }
      
      // Check if screencast is already running
      if (pageInfo.screencastRunning) {
        logger.warn(`Screencast already running for page ${pageId}`);
        return true;
      }
      
      // Get CDP session
      const client = await pageInfo.page.target().createCDPSession();
      
      // Start screencast
      await client.send('Page.startScreencast', {
        format: options.format || 'jpeg',
        quality: options.quality || 90,
        maxWidth: options.maxWidth || 1920,
        maxHeight: options.maxHeight || 1080,
        everyNthFrame: options.everyNthFrame || 1
      });
      
      // Store CDP session
      pageInfo.client = client;
      pageInfo.screencastRunning = true;
      
      // Set up screencast frame event handler
      client.on('Page.screencastFrame', async (frameObject) => {
        try {
          // Acknowledge frame
          await client.send('Page.screencastFrameAck', { sessionId: frameObject.sessionId });
          
          // Update last activity time
          pageInfo.lastActivityAt = Date.now();
          
          // Emit screencast frame event
          this.emit('screencastFrame', pageId, frameObject);
        } catch (error) {
          logger.error(`Error handling screencast frame for page ${pageId}`, error);
        }
      });
      
      logger.info(`Screencast started for page ${pageId}`);
      
      // Emit screencast started event
      this.emit('screencastStarted', pageId);
      
      return true;
    } catch (error) {
      logger.error(`Error starting screencast for page ${pageId}`, error);
      
      // Update screencast status
      const pageInfo = this.getPage(pageId);
      
      if (pageInfo) {
        pageInfo.screencastRunning = false;
      }
      
      throw error;
    }
  }

  /**
   * Stop screencast
   * @param {string} pageId Page ID
   * @returns {Promise<boolean>} Success
   */
  async stopScreencast(pageId) {
    try {
      logger.info(`Stopping screencast for page ${pageId}`);
      
      // Get page
      const pageInfo = this.getPage(pageId);
      
      if (!pageInfo) {
        logger.warn(`Page not found: ${pageId}`);
        return false;
      }
      
      // Check if screencast is running
      if (!pageInfo.screencastRunning) {
        logger.warn(`Screencast not running for page ${pageId}`);
        return true;
      }
      
      // Stop screencast
      if (pageInfo.client) {
        await pageInfo.client.send('Page.stopScreencast');
        
        // Remove CDP session
        pageInfo.client = null;
      }
      
      // Update screencast status
      pageInfo.screencastRunning = false;
      
      logger.info(`Screencast stopped for page ${pageId}`);
      
      // Emit screencast stopped event
      this.emit('screencastStopped', pageId);
      
      return true;
    } catch (error) {
      logger.error(`Error stopping screencast for page ${pageId}`, error);
      
      // Update screencast status
      const pageInfo = this.getPage(pageId);
      
      if (pageInfo) {
        pageInfo.screencastRunning = false;
      }
      
      return false;
    }
  }

  /**
   * Close page
   * @param {string} pageId Page ID
   * @returns {Promise<boolean>} Success
   */
  async closePage(pageId) {
    try {
      logger.info(`Closing page ${pageId}`);
      
      // Get page
      const pageInfo = this.getPage(pageId);
      
      if (!pageInfo) {
        logger.warn(`Page not found: ${pageId}`);
        return false;
      }
      
      // Stop screencast if running
      if (pageInfo.screencastRunning) {
        await this.stopScreencast(pageId);
      }
      
      // Close page
      await pageInfo.page.close();
      
      // Remove page
      this.pages.delete(pageId);
      
      logger.info(`Page closed: ${pageId}`);
      
      // Emit page closed event
      this.emit('pageClosed', pageId);
      
      return true;
    } catch (error) {
      logger.error(`Error closing page ${pageId}`, error);
      
      // Remove page anyway
      this.pages.delete(pageId);
      
      // Emit page closed event
      this.emit('pageClosed', pageId);
      
      return false;
    }
  }

  /**
   * Close browser
   * @param {string} browserId Browser ID
   * @returns {Promise<boolean>} Success
   */
  async closeBrowser(browserId) {
    try {
      logger.info(`Closing browser ${browserId}`);
      
      // Get browser
      const browser = this.getBrowser(browserId);
      
      if (!browser) {
        logger.warn(`Browser not found: ${browserId}`);
        return false;
      }
      
      // Close all pages in this browser
      for (const [pageId, pageInfo] of this.pages.entries()) {
        if (pageInfo.browserId === browserId) {
          try {
            await this.closePage(pageId);
          } catch (error) {
            logger.error(`Error closing page ${pageId} in browser ${browserId}`, error);
          }
        }
      }
      
      // Close browser
      await browser.close();
      
      // Remove browser
      this.browsers.delete(browserId);
      
      logger.info(`Browser closed: ${browserId}`);
      
      // Emit browser closed event
      this.emit('browserClosed', browserId);
      
      return true;
    } catch (error) {
      logger.error(`Error closing browser ${browserId}`, error);
      
      // Remove browser anyway
      this.browsers.delete(browserId);
      
      // Emit browser closed event
      this.emit('browserClosed', browserId);
      
      return false;
    }
  }

  /**
   * Restart browser
   * @param {string} browserId Browser ID
   * @returns {Promise<Object>} New browser info
   */
  async restartBrowser(browserId) {
    try {
      logger.info(`Restarting browser ${browserId}`);
      
      // Get browser
      const browser = this.getBrowser(browserId);
      
      if (!browser) {
        logger.warn(`Browser not found: ${browserId}`);
        return null;
      }
      
      // Get browser options
      const options = {
        browserId
      };
      
      // Close browser
      await this.closeBrowser(browserId);
      
      // Create new browser
      const newBrowser = await this.createBrowser(options);
      
      logger.info(`Browser restarted: ${browserId}`);
      
      return newBrowser;
    } catch (error) {
      logger.error(`Error restarting browser ${browserId}`, error);
      throw error;
    }
  }

  /**
   * Get all browsers
   * @returns {Array} Browsers
   */
  getAllBrowsers() {
    return Array.from(this.browsers.entries()).map(([id, browser]) => ({
      id,
      createdAt: browser.createdAt,
      pagesCreated: browser.pagesCreated
    }));
  }

  /**
   * Get all pages
   * @returns {Array} Pages
   */
  getAllPages() {
    return Array.from(this.pages.values()).map(pageInfo => ({
      id: pageInfo.id,
      browserId: pageInfo.browserId,
      createdAt: pageInfo.createdAt,
      lastActivityAt: pageInfo.lastActivityAt,
      screencastRunning: pageInfo.screencastRunning,
      options: pageInfo.options
    }));
  }

  /**
   * Get browsers count
   * @returns {number} Browsers count
   */
  getBrowsersCount() {
    return this.browsers.size;
  }

  /**
   * Get pages count
   * @returns {number} Pages count
   */
  getPagesCount() {
    return this.pages.size;
  }

  /**
   * Check if browser pool is running
   * @returns {boolean} Running status
   */
  isRunning() {
    return this.running;
  }

  /**
   * Shutdown browser pool
   * @returns {Promise<boolean>} Success
   */
  async shutdown() {
    try {
      logger.info('Shutting down Browser Pool');
      
      // Set running flag
      this.running = false;
      
      // Clear memory monitoring interval
      if (this.memoryMonitoringInterval) {
        clearInterval(this.memoryMonitoringInterval);
      }
      
      // Close all browsers
      const browserIds = Array.from(this.browsers.keys());
      
      for (const browserId of browserIds) {
        try {
          await this.closeBrowser(browserId);
        } catch (error) {
          logger.error(`Error closing browser ${browserId} during shutdown`, error);
        }
      }
      
      // Clear maps
      this.browsers.clear();
      this.pages.clear();
      
      logger.info('Browser Pool shutdown complete');
      
      return true;
    } catch (error) {
      logger.error('Error shutting down Browser Pool', error);
      return false;
    }
  }
}

module.exports = BrowserPool;
