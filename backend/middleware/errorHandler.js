/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error response
  const errorResponse = {
    success: false,
    error: err.message || 'Internal server error'
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;