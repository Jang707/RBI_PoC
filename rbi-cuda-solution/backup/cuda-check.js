/**
 * CUDA Check Utility
 * Checks for CUDA and related capabilities on the system
 */

const { spawn, exec } = require('child_process');
const os = require('os');
const { ENCODER_CONFIG } = require('./config');
const logger = require('./logger');

/**
 * Check system capabilities
 * @returns {Promise<Object>} System capabilities
 */
async function checkSystemCapabilities() {
  try {
    logger.info('Checking system capabilities');
    
    // Get system info
    const systemInfo = getSystemInfo();
    
    // Check CUDA availability
    const cudaInfo = await checkCUDAInfo();
    
    // Check FFmpeg capabilities
    const ffmpegInfo = await checkFFmpegCapabilities();
    
    // Check GPU info
    const gpuInfo = await checkGPUInfo();
    
    // Combine all info
    const capabilities = {
      system: systemInfo,
      cuda: cudaInfo,
      ffmpeg: ffmpegInfo,
      gpu: gpuInfo
    };
    
    logger.info('System capabilities check complete', capabilities);
    
    return capabilities;
  } catch (error) {
    logger.error('Error checking system capabilities', error);
    
    // Return basic system info
    return {
      system: getSystemInfo(),
      cuda: { available: false },
      ffmpeg: { available: false },
      gpu: { available: false }
    };
  }
}

/**
 * Get system information
 * @returns {Object} System information
 */
function getSystemInfo() {
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem()
  };
}

/**
 * Check CUDA information
 * @returns {Promise<Object>} CUDA information
 */
async function checkCUDAInfo() {
  try {
    logger.info('Checking CUDA information');
    
    // Check if nvidia-smi is available
    const nvidiaSmiAvailable = await checkCommandAvailable('nvidia-smi');
    
    if (!nvidiaSmiAvailable) {
      logger.warn('nvidia-smi not available');
      return { available: false };
    }
    
    // Get CUDA version
    const cudaVersion = await getCUDAVersion();
    
    // Get NVENC capabilities
    const nvencCapabilities = await getNVENCCapabilities();
    
    return {
      available: true,
      version: cudaVersion,
      nvenc: nvencCapabilities
    };
  } catch (error) {
    logger.error('Error checking CUDA information', error);
    return { available: false };
  }
}

/**
 * Check if command is available
 * @param {string} command Command to check
 * @returns {Promise<boolean>} Available
 */
async function checkCommandAvailable(command) {
  return new Promise((resolve) => {
    const platform = os.platform();
    let checkCommand;
    
    if (platform === 'win32') {
      checkCommand = `where ${command}`;
    } else {
      checkCommand = `which ${command}`;
    }
    
    exec(checkCommand, (error) => {
      resolve(!error);
    });
  });
}

/**
 * Get CUDA version
 * @returns {Promise<string>} CUDA version
 */
async function getCUDAVersion() {
  return new Promise((resolve) => {
    exec('nvidia-smi --query-gpu=driver_version --format=csv,noheader', (error, stdout) => {
      if (error) {
        logger.error('Error getting CUDA version', error);
        resolve('unknown');
        return;
      }
      
      const driverVersion = stdout.trim();
      resolve(driverVersion);
    });
  });
}

/**
 * Get NVENC capabilities
 * @returns {Promise<Object>} NVENC capabilities
 */
async function getNVENCCapabilities() {
  try {
    // Check if FFmpeg is available
    const ffmpegAvailable = await checkCommandAvailable(ENCODER_CONFIG.ffmpegPath);
    
    if (!ffmpegAvailable) {
      logger.warn('FFmpeg not available');
      return { available: false };
    }
    
    // Check if NVENC is available
    const nvencAvailable = await checkNVENCAvailable();
    
    if (!nvencAvailable) {
      logger.warn('NVENC not available');
      return { available: false };
    }
    
    // Get supported codecs
    const supportedCodecs = await getSupportedNVENCCodecs();
    
    return {
      available: true,
      supportedCodecs
    };
  } catch (error) {
    logger.error('Error getting NVENC capabilities', error);
    return { available: false };
  }
}

/**
 * Check if NVENC is available
 * @returns {Promise<boolean>} Available
 */
async function checkNVENCAvailable() {
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
 * Get supported NVENC codecs
 * @returns {Promise<Array>} Supported codecs
 */
async function getSupportedNVENCCodecs() {
  return new Promise((resolve) => {
    const ffmpeg = spawn(ENCODER_CONFIG.ffmpegPath, ['-encoders']);
    let output = '';
    
    ffmpeg.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffmpeg.on('error', (error) => {
      logger.error('Error getting supported NVENC codecs', error);
      resolve([]);
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        resolve([]);
        return;
      }
      
      const codecs = [];
      
      if (output.includes('h264_nvenc')) {
        codecs.push('h264');
      }
      
      if (output.includes('hevc_nvenc')) {
        codecs.push('hevc');
      }
      
      resolve(codecs);
    });
  });
}

/**
 * Check FFmpeg capabilities
 * @returns {Promise<Object>} FFmpeg capabilities
 */
async function checkFFmpegCapabilities() {
  try {
    // Check if FFmpeg is available
    const ffmpegAvailable = await checkCommandAvailable(ENCODER_CONFIG.ffmpegPath);
    
    if (!ffmpegAvailable) {
      logger.warn('FFmpeg not available');
      return { available: false };
    }
    
    // Get FFmpeg version
    const version = await getFFmpegVersion();
    
    // Get supported hardware accelerations
    const hwaccels = await getFFmpegHWAccels();
    
    // Get supported encoders
    const encoders = await getFFmpegEncoders();
    
    return {
      available: true,
      version,
      hwaccels,
      encoders
    };
  } catch (error) {
    logger.error('Error checking FFmpeg capabilities', error);
    return { available: false };
  }
}

/**
 * Get FFmpeg version
 * @returns {Promise<string>} FFmpeg version
 */
async function getFFmpegVersion() {
  return new Promise((resolve) => {
    const ffmpeg = spawn(ENCODER_CONFIG.ffmpegPath, ['-version']);
    let output = '';
    
    ffmpeg.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffmpeg.on('error', (error) => {
      logger.error('Error getting FFmpeg version', error);
      resolve('unknown');
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        resolve('unknown');
        return;
      }
      
      const versionMatch = output.match(/ffmpeg version (\S+)/);
      
      if (versionMatch && versionMatch[1]) {
        resolve(versionMatch[1]);
      } else {
        resolve('unknown');
      }
    });
  });
}

/**
 * Get FFmpeg hardware accelerations
 * @returns {Promise<Array>} Hardware accelerations
 */
async function getFFmpegHWAccels() {
  return new Promise((resolve) => {
    const ffmpeg = spawn(ENCODER_CONFIG.ffmpegPath, ['-hwaccels']);
    let output = '';
    
    ffmpeg.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffmpeg.on('error', (error) => {
      logger.error('Error getting FFmpeg hardware accelerations', error);
      resolve([]);
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        resolve([]);
        return;
      }
      
      const lines = output.split('\n');
      const hwaccels = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line) {
          hwaccels.push(line);
        }
      }
      
      resolve(hwaccels);
    });
  });
}

/**
 * Get FFmpeg encoders
 * @returns {Promise<Object>} Encoders
 */
async function getFFmpegEncoders() {
  return new Promise((resolve) => {
    const ffmpeg = spawn(ENCODER_CONFIG.ffmpegPath, ['-encoders']);
    let output = '';
    
    ffmpeg.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffmpeg.on('error', (error) => {
      logger.error('Error getting FFmpeg encoders', error);
      resolve({});
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        resolve({});
        return;
      }
      
      const encoders = {
        h264: [],
        hevc: [],
        vp8: [],
        vp9: [],
        av1: []
      };
      
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes('h264')) {
          encoders.h264.push(line.trim());
        } else if (line.includes('hevc') || line.includes('h265')) {
          encoders.hevc.push(line.trim());
        } else if (line.includes('vp8')) {
          encoders.vp8.push(line.trim());
        } else if (line.includes('vp9')) {
          encoders.vp9.push(line.trim());
        } else if (line.includes('av1')) {
          encoders.av1.push(line.trim());
        }
      }
      
      resolve(encoders);
    });
  });
}

/**
 * Check GPU information
 * @returns {Promise<Object>} GPU information
 */
async function checkGPUInfo() {
  try {
    // Check if nvidia-smi is available
    const nvidiaSmiAvailable = await checkCommandAvailable('nvidia-smi');
    
    if (!nvidiaSmiAvailable) {
      logger.warn('nvidia-smi not available');
      return { available: false };
    }
    
    // Get GPU count
    const gpuCount = await getGPUCount();
    
    // Get GPU details
    const gpuDetails = await getGPUDetails();
    
    return {
      available: true,
      count: gpuCount,
      details: gpuDetails
    };
  } catch (error) {
    logger.error('Error checking GPU information', error);
    return { available: false };
  }
}

/**
 * Get GPU count
 * @returns {Promise<number>} GPU count
 */
async function getGPUCount() {
  return new Promise((resolve) => {
    exec('nvidia-smi --query-gpu=count --format=csv,noheader', (error, stdout) => {
      if (error) {
        logger.error('Error getting GPU count', error);
        resolve(0);
        return;
      }
      
      const count = parseInt(stdout.trim(), 10);
      resolve(isNaN(count) ? 0 : count);
    });
  });
}

/**
 * Get GPU details
 * @returns {Promise<Array>} GPU details
 */
async function getGPUDetails() {
  return new Promise((resolve) => {
    exec('nvidia-smi --query-gpu=name,memory.total,memory.free,temperature.gpu,utilization.gpu --format=csv,noheader', (error, stdout) => {
      if (error) {
        logger.error('Error getting GPU details', error);
        resolve([]);
        return;
      }
      
      const lines = stdout.trim().split('\n');
      const details = [];
      
      for (const line of lines) {
        const [name, totalMemory, freeMemory, temperature, utilization] = line.split(',').map(item => item.trim());
        
        details.push({
          name,
          totalMemory,
          freeMemory,
          temperature,
          utilization
        });
      }
      
      resolve(details);
    });
  });
}

/**
 * Check if CUDA is available for encoding
 * @returns {Promise<boolean>} Available
 */
async function isCUDAAvailableForEncoding() {
  try {
    // Check system capabilities
    const capabilities = await checkSystemCapabilities();
    
    // Check if CUDA is available
    if (!capabilities.cuda.available) {
      return false;
    }
    
    // Check if NVENC is available
    if (!capabilities.cuda.nvenc.available) {
      return false;
    }
    
    // Check if FFmpeg is available
    if (!capabilities.ffmpeg.available) {
      return false;
    }
    
    // Check if FFmpeg supports CUDA
    if (!capabilities.ffmpeg.hwaccels.includes('cuda')) {
      return false;
    }
    
    // Check if FFmpeg supports NVENC
    if (!capabilities.ffmpeg.encoders.h264.some(encoder => encoder.includes('nvenc'))) {
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Error checking if CUDA is available for encoding', error);
    return false;
  }
}

module.exports = {
  checkSystemCapabilities,
  isCUDAAvailableForEncoding
};
