/**
 * Logger Utility
 * Provides structured logging for the application
 */

const winston = require('winston');
const { format, transports } = winston;
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// Define console format
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.printf(({ level, message, timestamp, ...metadata }) => {
    let metaStr = '';
    
    if (Object.keys(metadata).length > 0 && metadata.stack !== undefined) {
      // Error object
      metaStr = `\n${metadata.stack}`;
    } else if (Object.keys(metadata).length > 0) {
      // Other metadata
      metaStr = Object.keys(metadata).length ? `\n${JSON.stringify(metadata, null, 2)}` : '';
    }
    
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'rbi-cuda-solution' },
  transports: [
    // Write all logs to console
    new transports.Console({
      format: consoleFormat
    }),
    
    // Write all logs with level 'info' and below to combined.log
    new transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Write all logs with level 'error' and below to error.log
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Add stream for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

/**
 * Log a debug message
 * @param {string} message Message to log
 * @param {Object} metadata Additional metadata
 */
function debug(message, metadata) {
  logger.debug(message, metadata);
}

/**
 * Log an info message
 * @param {string} message Message to log
 * @param {Object} metadata Additional metadata
 */
function info(message, metadata) {
  logger.info(message, metadata);
}

/**
 * Log a warning message
 * @param {string} message Message to log
 * @param {Object} metadata Additional metadata
 */
function warn(message, metadata) {
  logger.warn(message, metadata);
}

/**
 * Log an error message
 * @param {string} message Message to log
 * @param {Error|Object} error Error object or additional metadata
 */
function error(message, error) {
  if (error instanceof Error) {
    logger.error(message, { stack: error.stack });
  } else {
    logger.error(message, error);
  }
}

/**
 * Log an HTTP request
 * @param {string} message Message to log
 * @param {Object} metadata Additional metadata
 */
function http(message, metadata) {
  logger.http(message, metadata);
}

/**
 * Create a child logger with additional metadata
 * @param {Object} metadata Additional metadata
 * @returns {Object} Child logger
 */
function child(metadata) {
  return logger.child(metadata);
}

module.exports = {
  debug,
  info,
  warn,
  error,
  http,
  child,
  stream: logger.stream
};
