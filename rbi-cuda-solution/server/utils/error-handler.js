/**
 * Error Handler Utility
 * Provides centralized error handling for the application
 */

const logger = require('./logger');

/**
 * Custom error class for API errors
 */
class APIError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for validation errors
 */
class ValidationError extends Error {
  constructor(message, validationErrors = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.validationErrors = validationErrors;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for authentication errors
 */
class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for authorization errors
 */
class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for not found errors
 */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for conflict errors
 */
class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for resource limit errors
 */
class ResourceLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResourceLimitError';
    this.statusCode = 429;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Express error handler middleware
 * @param {Error} err Error object
 * @param {Object} req Express request object
 * @param {Object} res Express response object
 * @param {Function} next Express next function
 */
function errorHandlerMiddleware(err, req, res, next) {
  // Log error
  logger.error(`Error handling request: ${req.method} ${req.url}`, err);
  
  // Set default status code
  const statusCode = err.statusCode || 500;
  
  // Prepare error response
  const errorResponse = {
    error: {
      message: err.message || 'Internal Server Error',
      type: err.name || 'Error',
      statusCode
    }
  };
  
  // Add validation errors if available
  if (err.validationErrors) {
    errorResponse.error.validationErrors = err.validationErrors;
  }
  
  // Add error details if available
  if (err.details) {
    errorResponse.error.details = err.details;
  }
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Async handler for Express route handlers
 * @param {Function} fn Express route handler
 * @returns {Function} Wrapped route handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Handle uncaught exceptions
 * @param {Error} err Error object
 */
function handleUncaughtException(err) {
  logger.error('Uncaught exception', err);
  
  // Perform cleanup if needed
  
  // Exit process with error
  process.exit(1);
}

/**
 * Handle unhandled rejections
 * @param {Error} reason Rejection reason
 * @param {Promise} promise Rejected promise
 */
function handleUnhandledRejection(reason, promise) {
  logger.error('Unhandled rejection', { reason, promise });
  
  // Perform cleanup if needed
  
  // Exit process with error
  process.exit(1);
}

/**
 * Initialize error handlers
 */
function initializeErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', handleUncaughtException);
  
  // Handle unhandled rejections
  process.on('unhandledRejection', handleUnhandledRejection);
  
  logger.info('Error handlers initialized');
}

/**
 * Validate request middleware
 * @param {Object} schema Joi schema
 * @returns {Function} Express middleware
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        message: detail.message,
        path: detail.path
      }));
      
      next(new ValidationError('Validation error', validationErrors));
    } else {
      next();
    }
  };
}

module.exports = {
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ResourceLimitError,
  errorHandlerMiddleware,
  asyncHandler,
  initializeErrorHandlers,
  validateRequest
};
