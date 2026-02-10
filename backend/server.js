require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { execSync } = require('child_process');

// Import routes
const apiRoutes = require('./routes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Optional LaTeX compiler availability check
if (process.env.LATEX_USE_LOCAL === 'true') {
  try {
    const cmd = process.platform === 'win32' ? 'where pdflatex' : 'which pdflatex';
    const output = execSync(cmd, { stdio: 'pipe' }).toString().trim();
    if (output) {
      console.log(`✅ pdflatex found: ${output.split(/\r?\n/)[0]}`);
    }
  } catch (error) {
    console.warn('⚠️  pdflatex not found on PATH. Local LaTeX compilation will fail.');
  }
}

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: [
          "'self'",
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'https://spectropy-tlm-generator.vercel.app'
        ],
        frameSrc: [
          "'self'",
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'https://spectropy-tlm-generator.vercel.app',
          'https://tlm-generator.vercel.app'
        ]
      }
    }
  })
); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json({ limit: '10mb' })); // Parse JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded

// Logging (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api', apiRoutes);

// Static files (if needed)
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: ${process.env.SUPABASE_URL ? 'Connected' : 'Not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

module.exports = app;
