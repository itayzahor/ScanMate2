/**
 * @file server.js
 * Application entry point.
 *
 * Startup order:
 *   1. Load environment variables (dotenv)
 *   2. Create Express app and attach middleware (helmet, cors, json, morgan)
 *   3. Mount all API routes under /api
 *   4. Register 404 and global error handlers
 *   5. Connect to MongoDB
 *   6. Create HTTP server, attach Socket.IO, start listening
 */
require('dotenv').config();
const http     = require('http');
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const mongoose = require('mongoose');

// ── Guard: crash early if secrets are unsafe in production ───────────────────
if (process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_SECRET ||
     process.env.JWT_SECRET === 'scanmate_dev_secret_change_in_production')) {
  console.error('FATAL: JWT_SECRET must be set to a strong secret in production.');
  process.exit(1);
}
const { connectDB }   = require('../setup/db');
const routes          = require('./routes');
const { initSocket }  = require('./socket');

const app = express();

// ── Security & parsing middleware ────────────────────────────────────────────
app.use(helmet());                         // sets secure HTTP headers

// Allow specific origins in production; allow all in development.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null;
app.use(cors({ origin: allowedOrigins ?? true, credentials: true }));

app.use(express.json({ limit: '1mb' }));  // parse JSON bodies (cap at 1 MB)
app.use(morgan('dev'));                   // request logging

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const state = mongoose.connection.readyState; // 1 = connected
  res.status(state === 1 ? 200 : 503).json({
    status: state === 1 ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    db: state === 1 ? 'connected' : 'disconnected',
  });
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
// Receives errors forwarded via next(err) from any route or middleware.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ ok: false, error: err.message || 'Server Error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
connectDB()
  .then(() => {
    const server = http.createServer(app);
    initSocket(server);  // attach Socket.IO to the same HTTP server
    server.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to connect DB:', e);
    process.exit(1);
  });
