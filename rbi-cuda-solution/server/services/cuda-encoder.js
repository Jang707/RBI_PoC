/**
 * CUDA Encoder Service
 * Provides CUDA-accelerated video encoding
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { ENCODER_CONFIG, STREAMING_CONFIG } = require('../utils/config');
const logger = require('../utils/logger');

/**
 * CUDAEncoder class
 */
class CUDAEncoder extends EventEmitter {
  /**
   * Constructor
   */
  constructor() {
    super();
    this.cudaAvailable = false;
    this.nvencAvailable = false;
    this.encoders = new Map();
    this.encodingStrategies = STREAMING_CONFIG.encodingStrategies;
    this.currentStrategy = STREAMING_CONFIG.defaultEncodingStrategy;
    
    logger.info('CUDA Encoder initialized');
  }

  /**
   * Initialize encoder
   * @returns {Promise<boolean>} Success
   */
  async initialize() {
    try {
      logger.info('Initializing CUDA Encoder');
      
      // Check CUDA and NVENC availability
      const { cudaAvailable, nvencAvailable } = await this.checkAvailability();
      
      this.cudaAvailable = cudaAvailable;
      this.nvencAvailable = nvencAvailable;
      
      // Set current strategy based on availability
      if (this.nvencAvailable) {
        this.currentStrategy = 'cuda_h264';
        logger.info('Using CUDA H.264 encoding strategy');
      } else {
        this.currentStrategy = 'cpu_h264';
        logger.warn('CUDA not available, falling back to CPU H.264 encoding');
      }
      
      logger.info('CUDA Encoder initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Error initializing CUDA Encoder', error);
      return false;
    }
  }

  /**
   * Check CUDA and NVENC availability
   * @returns {Promise<Object>} Availability info
   */
  async checkAvailability() {
    try {
      logger.info('Checking CUDA and NVENC availability');
      
      // Check if FFmpeg is available
      const ffmpegAvailable = await this.checkFFmpegAvailability();
      
      if (!ffmpegAvailable) {
        logger.error('FFmpeg not available');
        return { cudaAvailable: false, nvencAvailable: false };
      }
      
      // Check if CUDA is available
      const cudaAvailable = await this.checkCUDAAvailability();
      
      if (!cudaAvailable) {
        logger.warn('CUDA not available');
        return { cudaAvailable: false, nvencAvailable: false };
      }
      
      // Check if NVENC is available
      const nvencAvailable = await this.checkNVENCAvailability();
      
      if (!nvencAvailable) {
        logger.warn('NVENC not available');
        return { cudaAvailable: true, nvencAvailable: false };
      }
      
      logger.info('CUDA and NVENC available');
      
      return { cudaAvailable: true, nvencAvailable: true };
    } catch (error) {
      logger.error('Error checking CUDA and NVENC availability', error);
      return { cudaAvailable: false, nvencAvailable: false };
    }
  }

  /**
   * Check FFmpeg availability
   * @returns {Promise<boolean>} Available
   */
  async checkFFmpegAvailability() {
    return new Promise((resolve) => {
      const ffmpeg = spawn(ENCODER_CONFIG.ffmpegPath, ['-version']);
      
      ffmpeg.on('error', (error) => {
        logger.error('Error checking FFmpeg availability', error);
        resolve(false);
      });
      
      ffmpeg.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Check CUDA availability
   * @returns {Promise<boolean>} Available
   */
  async checkCUDAAvailability() {
    return new Promise((resolve) => {
      const ffmpeg = spawn(ENCODER_CONFIG.ffmpegPath, ['-hwaccels']);
      let output = '';
      
      ffmpeg.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffmpeg.on('error', (error) => {
        logger.error('Error checking CUDA availability', error);
        resolve(false);
      });
      
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          resolve(false);
          return;
        }
        
        resolve(output.includes('cuda'));
      });
    });
  }

  /**
   * Check NVENC availability
   * @returns {Promise<boolean>} Available
   */
  async checkNVENCAvailability() {
    return new Promise((resolve) => {
      const ffmpeg = spawn(ENCODER_CONFIG.ffmpegPath, ['-encoders']);
      let output = '';
      
      ffmpeg.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffmpeg.on('error', (error) => {
        logger.error('Error checking NVENC availability', error);
        resolve(false);
      });
      
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          resolve(false);
          return;
        }
        
        resolve(output.includes('h264_nvenc'));
      });
    });
  }

  /**
   * Create encoder
   * @param {string} encoderId Encoder ID
   * @param {Object} options Encoder options
   * @returns {Promise<Object>} Encoder info
   */
  async createEncoder(encoderId, options = {}) {
    try {
      logger.info(`Creating encoder: ${encoderId}`, options);
      
      // Check if encoder already exists
      if (this.encoders.has(encoderId)) {
        logger.warn(`Encoder already exists: ${encoderId}`);
        return this.encoders.get(encoderId);
      }
      
      // Create encoder info
      const encoder = {
        id: encoderId,
        process: null,
        inputPath: null,
        outputPath: null,
        options: {
          ...options,
          width: options.width || ENCODER_CONFIG.defaultWidth,
          height: options.height || ENCODER_CONFIG.defaultHeight,
          frameRate: options.frameRate || ENCODER_CONFIG.defaultFrameRate,
          bitrate: options.bitrate || ENCODER_CONFIG.defaultBitrate,
          strategy: options.strategy || this.currentStrategy
        },
        stats: {
          framesEncoded: 0,
          bytesEncoded: 0,
          encodingTime: 0,
          startTime: null,
          lastFrameTime: null
        },
        active: false
      };
      
      // Store encoder
      this.encoders.set(encoderId, encoder);
      
      logger.info(`Encoder created: ${encoderId}`);
      
      return encoder;
    } catch (error) {
      logger.error(`Error creating encoder: ${encoderId}`, error);
      throw error;
    }
  }

  /**
   * Start encoder
   * @param {string} encoderId Encoder ID
   * @param {Object} options Start options
   * @returns {Promise<boolean>} Success
   */
  async startEncoder(encoderId, options = {}) {
    try {
      logger.info(`Starting encoder: ${encoderId}`, options);
      
      // Get encoder
      const encoder = this.encoders.get(encoderId);
      
      if (!encoder) {
        logger.error(`Encoder not found: ${encoderId}`);
        return false;
      }
      
      // Check if encoder is already active
      if (encoder.active) {
        logger.warn(`Encoder already active: ${encoderId}`);
        return true;
      }
      
      // Create temp directory if it doesn't exist
      const tempDir = ENCODER_CONFIG.tempDir;
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Set input and output paths
      encoder.inputPath = options.inputPath || path.join(tempDir, `${encoderId}_input.yuv`);
      encoder.outputPath = options.outputPath || path.join(tempDir, `${encoderId}_output.h264`);
      
      // Create FFmpeg process
      const ffmpegArgs = this.buildFFmpegArgs(encoder);
      
      logger.info(`Starting FFmpeg process for encoder ${encoderId} with args:`, ffmpegArgs);
      
      const ffmpeg = spawn(ENCODER_CONFIG.ffmpegPath, ffmpegArgs);
      
      // Set up event listeners
      ffmpeg.stdout.on('data', (data) => {
        logger.debug(`FFmpeg stdout for encoder ${encoderId}: ${data.toString()}`);
      });
      
      ffmpeg.stderr.on('data', (data) => {
        logger.debug(`FFmpeg stderr for encoder ${encoderId}: ${data.toString()}`);
      });
      
      ffmpeg.on('error', (error) => {
        logger.error(`FFmpeg error for encoder ${encoderId}`, error);
        this.handleEncoderError(encoderId, error);
      });
      
      ffmpeg.on('close', (code) => {
        logger.info(`FFmpeg process closed for encoder ${encoderId} with code ${code}`);
        this.handleEncoderClosed(encoderId, code);
      });
      
      // Store process
      encoder.process = ffmpeg;
      
      // Set active flag
      encoder.active = true;
      
      // Set start time
      encoder.stats.startTime = Date.now();
      
      logger.info(`Encoder started: ${encoderId}`);
      
      // Emit encoder started event
      this.emit('encoderStarted', encoderId, encoder);
      
      return true;
    } catch (error) {
      logger.error(`Error starting encoder: ${encoderId}`, error);
      
      // Update encoder status
      const encoder = this.encoders.get(encoderId);
      
      if (encoder) {
        encoder.active = false;
      }
      
      return false;
    }
  }

  /**
   * Build FFmpeg arguments
   * @param {Object} encoder Encoder info
   * @returns {Array} FFmpeg arguments
   */
  buildFFmpegArgs(encoder) {
    const { options } = encoder;
    const args = [];
    
    // Input options
    args.push('-f', 'rawvideo');
    args.push('-pix_fmt', 'rgba');
    args.push('-s', `${options.width}x${options.height}`);
    args.push('-r', options.frameRate.toString());
    args.push('-i', encoder.inputPath);
    
    // Encoding options based on strategy
    switch (options.strategy) {
      case 'cuda_h264':
        // CUDA H.264 encoding
        args.push('-c:v', 'h264_nvenc');
        args.push('-preset', ENCODER_CONFIG.nvencPreset);
        args.push('-tune', ENCODER_CONFIG.nvencTune);
        args.push('-profile:v', ENCODER_CONFIG.nvencProfile);
        args.push('-level', ENCODER_CONFIG.nvencLevel);
        args.push('-b:v', `${options.bitrate}k`);
        args.push('-maxrate', `${options.bitrate * 1.5}k`);
        args.push('-bufsize', `${ENCODER_CONFIG.bufferSize}k`);
        args.push('-g', ENCODER_CONFIG.gopSize.toString());
        args.push('-keyint_min', ENCODER_CONFIG.keyintMin.toString());
        args.push('-rc', 'cbr');
        args.push('-gpu', '0');
        args.push('-delay', '0');
        break;
        
      case 'cuda_hevc':
        // CUDA HEVC encoding
        args.push('-c:v', 'hevc_nvenc');
        args.push('-preset', ENCODER_CONFIG.nvencPreset);
        args.push('-tune', ENCODER_CONFIG.nvencTune);
        args.push('-profile:v', 'main');
        args.push('-b:v', `${options.bitrate}k`);
        args.push('-maxrate', `${options.bitrate * 1.5}k`);
        args.push('-bufsize', `${ENCODER_CONFIG.bufferSize}k`);
        args.push('-g', ENCODER_CONFIG.gopSize.toString());
        args.push('-keyint_min', ENCODER_CONFIG.keyintMin.toString());
        args.push('-rc', 'cbr');
        args.push('-gpu', '0');
        args.push('-delay', '0');
        break;
        
      case 'cpu_h264':
        // CPU H.264 encoding
        args.push('-c:v', 'libx264');
        args.push('-preset', ENCODER_CONFIG.x264Preset);
        args.push('-tune', ENCODER_CONFIG.x264Tune);
        args.push('-profile:v', ENCODER_CONFIG.x264Profile);
        args.push('-level', ENCODER_CONFIG.x264Level);
        args.push('-b:v', `${options.bitrate}k`);
        args.push('-maxrate', `${options.bitrate * 1.5}k`);
        args.push('-bufsize', `${ENCODER_CONFIG.bufferSize}k`);
        args.push('-g', ENCODER_CONFIG.gopSize.toString());
        args.push('-keyint_min', ENCODER_CONFIG.keyintMin.toString());
        args.push('-rc', 'cbr');
        break;
        
      case 'cpu_hevc':
        // CPU HEVC encoding
        args.push('-c:v', 'libx265');
        args.push('-preset', ENCODER_CONFIG.x264Preset);
        args.push('-tune', ENCODER_CONFIG.x264Tune);
        args.push('-profile:v', 'main');
        args.push('-b:v', `${options.bitrate}k`);
        args.push('-maxrate', `${options.bitrate * 1.5}k`);
        args.push('-bufsize', `${ENCODER_CONFIG.bufferSize}k`);
        args.push('-g', ENCODER_CONFIG.gopSize.toString());
        args.push('-keyint_min', ENCODER_CONFIG.keyintMin.toString());
        break;
        
      case 'mjpeg':
        // MJPEG encoding (fallback)
        args.push('-c:v', 'mjpeg');
        args.push('-q:v', '5');
        args.push('-huffman', 'optimal');
        break;
        
      default:
        // Default to CPU H.264
        args.push('-c:v', 'libx264');
        args.push('-preset', ENCODER_CONFIG.x264Preset);
        args.push('-tune', ENCODER_CONFIG.x264Tune);
        args.push('-profile:v', ENCODER_CONFIG.x264Profile);
        args.push('-level', ENCODER_CONFIG.x264Level);
        args.push('-b:v', `${options.bitrate}k`);
        args.push('-maxrate', `${options.bitrate * 1.5}k`);
        args.push('-bufsize', `${ENCODER_CONFIG.bufferSize}k`);
        args.push('-g', ENCODER_CONFIG.gopSize.toString());
        args.push('-keyint_min', ENCODER_CONFIG.keyintMin.toString());
        break;
    }
    
    // Output options
    args.push('-f', 'h264');
    args.push('-y', encoder.outputPath);
    
    return args;
  }

  /**
   * Handle encoder error
   * @param {string} encoderId Encoder ID
   * @param {Error} error Error
   */
  handleEncoderError(encoderId, error) {
    try {
      // Get encoder
      const encoder = this.encoders.get(encoderId);
      
      if (!encoder) {
        return;
      }
      
      // Update encoder status
      encoder.active = false;
      
      // Emit encoder error event
      this.emit('encoderError', encoderId, error);
      
      // Try to restart encoder with fallback strategy
      this.tryFallbackStrategy(encoderId);
    } catch (error) {
      logger.error(`Error handling encoder error for ${encoderId}`, error);
    }
  }

  /**
   * Handle encoder closed
   * @param {string} encoderId Encoder ID
   * @param {number} code Exit code
   */
  handleEncoderClosed(encoderId, code) {
    try {
      // Get encoder
      const encoder = this.encoders.get(encoderId);
      
      if (!encoder) {
        return;
      }
      
      // Update encoder status
      encoder.active = false;
      
      // Emit encoder closed event
      this.emit('encoderClosed', encoderId, code);
      
      // Try to restart encoder if it was active and exited with error
      if (code !== 0) {
        this.tryFallbackStrategy(encoderId);
      }
    } catch (error) {
      logger.error(`Error handling encoder closed for ${encoderId}`, error);
    }
  }

  /**
   * Try fallback strategy
   * @param {string} encoderId Encoder ID
   * @returns {Promise<boolean>} Success
   */
  async tryFallbackStrategy(encoderId) {
    try {
      // Get encoder
      const encoder = this.encoders.get(encoderId);
      
      if (!encoder) {
        return false;
      }
      
      // Get current strategy
      const currentStrategy = encoder.options.strategy;
      
      // Find next strategy
      const currentIndex = this.encodingStrategies.indexOf(currentStrategy);
      
      if (currentIndex === -1 || currentIndex === this.encodingStrategies.length - 1) {
        logger.error(`No fallback strategy available for encoder ${encoderId}`);
        return false;
      }
      
      // Get next strategy
      const nextStrategy = this.encodingStrategies[currentIndex + 1];
      
      logger.info(`Trying fallback strategy for encoder ${encoderId}: ${nextStrategy}`);
      
      // Update encoder strategy
      encoder.options.strategy = nextStrategy;
      
      // Restart encoder
      return await this.startEncoder(encoderId);
    } catch (error) {
      logger.error(`Error trying fallback strategy for encoder ${encoderId}`, error);
      return false;
    }
  }

  /**
   * Encode frame
   * @param {string} encoderId Encoder ID
   * @param {Buffer} frameData Frame data
   * @param {Object} frameInfo Frame info
   * @returns {Promise<boolean>} Success
   */
  async encodeFrame(encoderId, frameData, frameInfo = {}) {
    try {
      // Get encoder
      const encoder = this.encoders.get(encoderId);
      
      if (!encoder || !encoder.active) {
        return false;
      }
      
      // Check if process is running
      if (!encoder.process || encoder.process.killed) {
        logger.warn(`Encoder ${encoderId} process not running`);
        return false;
      }
      
      // Write frame data to input pipe
      const startTime = Date.now();
      
      // Write frame data to input file
      await fs.promises.writeFile(encoder.inputPath, frameData);
      
      // Update stats
      encoder.stats.framesEncoded++;
      encoder.stats.bytesEncoded += frameData.length;
      encoder.stats.encodingTime += Date.now() - startTime;
      encoder.stats.lastFrameTime = Date.now();
      
      return true;
    } catch (error) {
      logger.error(`Error encoding frame for encoder ${encoderId}`, error);
      return false;
    }
  }

  /**
   * Read encoded data
   * @param {string} encoderId Encoder ID
   * @returns {Promise<Buffer>} Encoded data
   */
  async readEncodedData(encoderId) {
    try {
      // Get encoder
      const encoder = this.encoders.get(encoderId);
      
      if (!encoder || !encoder.active) {
        return null;
      }
      
      // Read encoded data
      const data = await fs.promises.readFile(encoder.outputPath);
      
      return data;
    } catch (error) {
      logger.error(`Error reading encoded data for encoder ${encoderId}`, error);
      return null;
    }
  }

  /**
   * Stop encoder
   * @param {string} encoderId Encoder ID
   * @returns {Promise<boolean>} Success
   */
  async stopEncoder(encoderId) {
    try {
      logger.info(`Stopping encoder: ${encoderId}`);
      
      // Get encoder
      const encoder = this.encoders.get(encoderId);
      
      if (!encoder) {
        logger.warn(`Encoder not found: ${encoderId}`);
        return false;
      }
      
      // Check if encoder is active
      if (!encoder.active) {
        logger.warn(`Encoder not active: ${encoderId}`);
        return true;
      }
      
      // Kill process
      if (encoder.process) {
        encoder.process.kill();
      }
      
      // Update encoder status
      encoder.active = false;
      
      logger.info(`Encoder stopped: ${encoderId}`);
      
      // Emit encoder stopped event
      this.emit('encoderStopped', encoderId);
      
      return true;
    } catch (error) {
      logger.error(`Error stopping encoder: ${encoderId}`, error);
      
      // Update encoder status
      const encoder = this.encoders.get(encoderId);
      
      if (encoder) {
        encoder.active = false;
      }
      
      return false;
    }
  }

  /**
   * Get encoder
   * @param {string} encoderId Encoder ID
   * @returns {Object} Encoder info
   */
  getEncoder(encoderId) {
    return this.encoders.get(encoderId);
  }

  /**
   * Get encoder stats
   * @param {string} encoderId Encoder ID
   * @returns {Object} Encoder stats
   */
  getEncoderStats(encoderId) {
    const encoder = this.encoders.get(encoderId);
    
    if (!encoder) {
      return null;
    }
    
    return { ...encoder.stats };
  }

  /**
   * Get all encoders
   * @returns {Array} Encoders
   */
  getAllEncoders() {
    return Array.from(this.encoders.entries()).map(([id, encoder]) => ({
      id,
      active: encoder.active,
      options: encoder.options,
      stats: encoder.stats
    }));
  }

  /**
   * Get encoders count
   * @returns {number} Encoders count
   */
  getEncodersCount() {
    return this.encoders.size;
  }

  /**
   * Shutdown encoder
   * @returns {Promise<boolean>} Success
   */
  async shutdown() {
    try {
      logger.info('Shutting down CUDA Encoder');
      
      // Stop all encoders
      const encoderIds = Array.from(this.encoders.keys());
      
      for (const encoderId of encoderIds) {
        try {
          await this.stopEncoder(encoderId);
        } catch (error) {
          logger.error(`Error stopping encoder ${encoderId} during shutdown`, error);
        }
      }
      
      // Clear encoders
      this.encoders.clear();
      
      logger.info('CUDA Encoder shutdown complete');
      
      return true;
    } catch (error) {
      logger.error('Error shutting down CUDA Encoder', error);
      return false;
    }
  }
}

// Create singleton instance
const cudaEncoder = new CUDAEncoder();

module.exports = cudaEncoder;
