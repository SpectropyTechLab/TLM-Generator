const { verifyToken } = require('../utils/auth');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const token = header.startsWith('Bearer ') ? header.slice(7) : queryToken;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'AUTH_SECRET not configured' });
  }
  const payload = verifyToken(token, secret);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = payload;
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
