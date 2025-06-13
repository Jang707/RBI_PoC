/**
 * Configuration Utility
 * Provides configuration settings for the application
 */

// Load environment variables
require('dotenv').config();

// Session configuration
const SESSION_CONFIG = {
  maxConcurrentSessions: process.env.MAX_SESSIONS ? parseInt(process.env.MAX_SESSIONS, 10) : 2,
  sessionTimeout: process.env.SESSION_TIMEOUT ? parseInt(process.env.SESSION_TIMEOUT, 10) / 1000 / 60 : 5, // minutes
  browserInstanceLimit: process.env.BROWSER_INSTANCE_LIMIT ? parseInt(process.env.BROWSER_INSTANCE_LIMIT, 10) : 5,
  memoryLimitPerSession: process.env.MEMORY_LIMIT ? parseInt(process.env.MEMORY_LIMIT, 10) / 1024 / 1024 : 300 // MB
};

// Streaming configuration
const STREAMING_CONFIG = {
  // Default dimensions
  defaultWidth: 1920,
  defaultHeight: 1080,
  defaultDeviceScaleFactor: 1,
  
  // Frame rate
  defaultFrameRate: 30,
  minFrameRate: 15,
  maxFrameRate: 60,
  
  // Bitrate (kbps)
  defaultBitrate: 3000,
  minBitrate: 500,
  maxBitrate: 10000,
  
  // Screencast settings
  defaultScreencastFormat: 'jpeg',
  defaultScreencastQuality: 90,
  defaultEveryNthFrame: 1,
  
  // Encoding strategy
  defaultEncodingStrategy: 'cuda_h264',
  
  // Adaptive quality
  adaptiveQualityEnabled: true,
  adaptiveQualityAdjustmentInterval: 5000, // ms
  
  // WebRTC settings
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  
  // Performance thresholds
  maxEncodingTime: 50, // ms
  maxNetworkLatency: 300, // ms
  
  // Fallback strategies
  encodingStrategies: [
    'cuda_h264',     // CUDA H.264 (preferred)
    'cuda_hevc',     // CUDA HEVC
    'cpu_h264',      // CPU H.264
    'cpu_hevc',      // CPU HEVC
    'mjpeg'          // MJPEG (last resort)
  ]
};

// Encoder configuration
const ENCODER_CONFIG = {
  // Default dimensions
  defaultWidth: 1920,
  defaultHeight: 1080,
  
  // Frame rate
  defaultFrameRate: 30,
  minFrameRate: 15,
  maxFrameRate: 60,
  
  // Bitrate (kbps)
  defaultBitrate: 3000,
  minBitrate: 500,
  maxBitrate: 10000,
  
  // NVENC settings
  nvencPreset: 'llhq', // Low Latency High Quality
  nvencTune: 'ull',    // Ultra Low Latency
  nvencProfile: 'baseline',
  nvencLevel: '4.0',
  
  // x264 settings
  x264Preset: 'ultrafast',
  x264Tune: 'zerolatency',
  x264Profile: 'baseline',
  x264Level: '4.0',
  
  // GOP settings
  gopSize: 60,
  keyintMin: 60,
  
  // Buffer settings
  bufferSize: 6000, // kbits
  
  // FFmpeg settings
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  
  // Temp directory
  tempDir: process.env.TEMP_DIR || require('os').tmpdir()
};

// Browser configuration
const BROWSER_CONFIG = {
  // Chrome executable path
  executablePath: process.env.CHROME_PATH || null,
  
  // Browser launch options
  launchOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu-rasterization',
      '--disable-gpu',
      '--disable-canvas-aa',
      '--disable-2d-canvas-clip-aa',
      '--disable-gl-drawing-for-tests',
      '--use-gl=swiftshader',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--mute-audio',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--disable-breakpad',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-component-extensions-with-background-pages',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--metrics-recording-only',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-popup-blocking',
      '--disable-session-crashed-bubble',
      '--disable-features=ScriptStreaming',
      '--disable-features=AutomationControlled',
      '--disable-features=AutomationMode',
      '--disable-features=AutomationDriver',
      '--disable-features=AutomationFullPageScreenshots',
      '--disable-features=AutomationElementVisibility',
      '--disable-features=AutomationElementPosition',
      '--disable-features=AutomationElementPresence',
      '--disable-features=AutomationElementText',
      '--disable-features=AutomationElementAttribute',
      '--disable-features=AutomationElementProperty',
      '--disable-features=AutomationElementState',
      '--disable-features=AutomationElementStyle',
      '--disable-features=AutomationElementComputedStyle',
      '--disable-features=AutomationElementRect',
      '--disable-features=AutomationElementScreenshot',
      '--disable-features=AutomationElementScrollIntoView',
      '--disable-features=AutomationElementClick',
      '--disable-features=AutomationElementFocus',
      '--disable-features=AutomationElementClear',
      '--disable-features=AutomationElementType',
      '--disable-features=AutomationElementSubmit',
      '--disable-features=AutomationElementValue',
      '--disable-features=AutomationElementSelected',
      '--disable-features=AutomationElementEnabled',
      '--disable-features=AutomationElementDisplayed',
      '--disable-features=AutomationElementLocation',
      '--disable-features=AutomationElementSize',
      '--disable-features=AutomationElementTagName',
      '--disable-features=AutomationElementGetAttribute',
      '--disable-features=AutomationElementGetProperty',
      '--disable-features=AutomationElementGetComputedStyle',
      '--disable-features=AutomationElementGetBoundingClientRect',
      '--disable-features=AutomationElementGetClientRects',
      '--disable-features=AutomationElementGetScreenshot',
      '--disable-features=AutomationElementScrollTo',
      '--disable-features=AutomationElementScrollBy',
      '--disable-features=AutomationElementScrollIntoViewIfNeeded',
      '--disable-features=AutomationElementClick',
      '--disable-features=AutomationElementDoubleClick',
      '--disable-features=AutomationElementContextClick',
      '--disable-features=AutomationElementHover',
      '--disable-features=AutomationElementDragAndDrop',
      '--disable-features=AutomationElementTap',
      '--disable-features=AutomationElementLongPress',
      '--disable-features=AutomationElementSwipe',
      '--disable-features=AutomationElementPinch',
      '--disable-features=AutomationElementRotate',
      '--disable-features=AutomationElementPress',
      '--disable-features=AutomationElementRelease',
      '--disable-features=AutomationElementMove',
      '--disable-features=AutomationElementWaitForElement',
      '--disable-features=AutomationElementWaitForElementToBeRemoved',
      '--disable-features=AutomationElementWaitForElementToBeVisible',
      '--disable-features=AutomationElementWaitForElementToBeHidden',
      '--disable-features=AutomationElementWaitForElementToBeEnabled',
      '--disable-features=AutomationElementWaitForElementToBeDisabled',
      '--disable-features=AutomationElementWaitForElementToBeSelected',
      '--disable-features=AutomationElementWaitForElementToBeDeselected',
      '--disable-features=AutomationElementWaitForElementToHaveText',
      '--disable-features=AutomationElementWaitForElementToHaveValue',
      '--disable-features=AutomationElementWaitForElementToHaveAttribute',
      '--disable-features=AutomationElementWaitForElementToHaveProperty',
      '--disable-features=AutomationElementWaitForElementToHaveComputedStyle',
      '--disable-features=AutomationElementWaitForElementToHaveBoundingClientRect',
      '--disable-features=AutomationElementWaitForElementToHaveClientRects',
      '--disable-features=AutomationElementWaitForElementToHaveScreenshot',
      '--disable-features=AutomationElementWaitForElementToBeStable',
      '--disable-features=AutomationElementWaitForElementToBeAttached',
      '--disable-features=AutomationElementWaitForElementToBeDetached',
      '--disable-features=AutomationElementWaitForElementToBeConnected',
      '--disable-features=AutomationElementWaitForElementToBeDisconnected',
      '--disable-features=AutomationElementWaitForElementToBeInViewport',
      '--disable-features=AutomationElementWaitForElementToBeOutOfViewport',
      '--disable-features=AutomationElementWaitForElementToBeIntersectingViewport',
      '--disable-features=AutomationElementWaitForElementToBeNotIntersectingViewport',
      '--disable-features=AutomationElementWaitForElementToBeStable',
      '--disable-features=AutomationElementWaitForElementToBeAttached',
      '--disable-features=AutomationElementWaitForElementToBeDetached',
      '--disable-features=AutomationElementWaitForElementToBeConnected',
      '--disable-features=AutomationElementWaitForElementToBeDisconnected',
      '--disable-features=AutomationElementWaitForElementToBeInViewport',
      '--disable-features=AutomationElementWaitForElementToBeOutOfViewport',
      '--disable-features=AutomationElementWaitForElementToBeIntersectingViewport',
      '--disable-features=AutomationElementWaitForElementToBeNotIntersectingViewport'
    ]
  },
  
  // Default viewport
  defaultViewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    isLandscape: true
  },
  
  // Browser pool settings
  maxBrowsers: process.env.MAX_BROWSERS ? parseInt(process.env.MAX_BROWSERS, 10) : 5,
  maxPagesPerBrowser: 5,
  browserTimeout: 30 * 60 * 1000, // 30 minutes
  
  // Browser restart settings
  restartBrowserAfterPages: 50,
  restartBrowserAfterTime: 60 * 60 * 1000, // 1 hour
  
  // Memory monitoring
  memoryMonitoringInterval: 60 * 1000, // 1 minute
  memoryThreshold: 1024 * 1024 * 1024, // 1 GB
  
  // Default page settings
  defaultPageSettings: {
    javaScriptEnabled: true,
    imagesEnabled: true,
    cssEnabled: true,
    mediaEnabled: true,
    webSecurity: false
  }
};

// WebSocket configuration
const WEBSOCKET_CONFIG = {
  // Server settings
  port: process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 8080,
  path: '/ws',
  
  // Connection settings
  maxPayloadSize: 10 * 1024 * 1024, // 10 MB
  perMessageDeflate: true,
  
  // Ping/pong settings
  pingInterval: 30000, // 30 seconds
  pingTimeout: 10000, // 10 seconds
  
  // Security settings
  verifyClient: true,
  
  // Rate limiting
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100 // 100 requests per minute
  }
};

// WebRTC configuration
const WEBRTC_CONFIG = {
  // ICE servers
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  
  // Media settings
  mediaConstraints: {
    video: {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 30, max: 60 }
    },
    audio: false
  },
  
  // Connection settings
  sdpSemantics: 'unified-plan',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  
  // Encoding settings
  videoEncoderConfig: {
    maxBitrate: 3000000, // 3 Mbps
    minBitrate: 500000, // 500 kbps
    maxFramerate: 30
  }
};

// Server configuration
const SERVER_CONFIG = {
  // HTTP server settings
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  host: process.env.HOST || '0.0.0.0',
  
  // HTTPS settings
  useHttps: process.env.USE_HTTPS === 'true',
  httpsOptions: {
    key: process.env.HTTPS_KEY_PATH,
    cert: process.env.HTTPS_CERT_PATH
  },
  
  // CORS settings
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // 100 requests per 15 minutes
  },
  
  // Body parser settings
  bodyParser: {
    json: {
      limit: '1mb'
    },
    urlencoded: {
      extended: true,
      limit: '1mb'
    }
  },
  
  // Static files
  staticFiles: {
    path: '../client/public',
    options: {
      maxAge: '1d'
    }
  },
  
  // Security settings
  helmet: {
    contentSecurityPolicy: false
  }
};

// Authentication configuration
const AUTH_CONFIG = {
  // Basic authentication
  basic: {
    enabled: process.env.BASIC_AUTH_ENABLED === 'true',
    username: process.env.BASIC_AUTH_USERNAME || 'admin',
    password: process.env.BASIC_AUTH_PASSWORD || 'password'
  },
  
  // JWT authentication
  jwt: {
    enabled: process.env.JWT_AUTH_ENABLED === 'true',
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  }
};

// Export configuration
module.exports = {
  SESSION_CONFIG,
  STREAMING_CONFIG,
  ENCODER_CONFIG,
  BROWSER_CONFIG,
  WEBSOCKET_CONFIG,
  WEBRTC_CONFIG,
  SERVER_CONFIG,
  AUTH_CONFIG
};
