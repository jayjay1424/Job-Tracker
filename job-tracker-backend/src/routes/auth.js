const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { generateToken, prisma } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const LOGFILE = path.join(__dirname, '..', 'backend-run.log');
function log(...a) { try { fs.appendFileSync(LOGFILE, new Date().toISOString() + ' | ' + a.join(' ') + '\n'); } catch (e) {} }

const router = Router();

// ─── Signup ───────────────────────────────────────────────────────
router.post('/signup',
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100)'),
    body('email').trim().isEmail().withMessage('Valid email is required').isLength({ max: 254 }).withMessage('Email too long').normalizeEmail(),
    body('password')
      .isLength({ min: 6, max: 128 })
      .withMessage('Password must be 6-128 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const name = String(req.body.name || '').trim();
      const email = String(req.body.email || '').trim().toLowerCase();
      const { password } = req.body;

      // Check if user exists (case-insensitive)
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const user = await prisma.user.create({
        data: { name, email, password: hashedPassword },
        select: { id: true, name: true, email: true, createdAt: true }
      });

      log('SIGNUP_SUCCESS', user.id);

      // Generate token
      const token = generateToken(user.id);

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(201).json({
        message: 'Signup successful',
        user
      });
    } catch (err) {
      log('SIGNUP_ERROR', err.message);
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Signup failed' });
    }
  }
);

// ─── Login ────────────────────────────────────────────────────────
router.post('/login',
  [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required').isLength({ max: 128 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const email = String(req.body.email || '').trim().toLowerCase();
      const { password } = req.body;

      // Find user
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check password
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      log('LOGIN_SUCCESS', user.id);

      // Generate token
      const token = generateToken(user.id);

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      // Return user without password
      const { password: _pwd, ...safeUser } = user;
      res.json({
        message: 'Login successful',
        user: safeUser
      });
    } catch (err) {
      log('LOGIN_ERROR', err.message);
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// ─── Logout ───────────────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  res.json({ message: 'Logged out' });
});

// ─── Get Current User ─────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.token;

    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { verifyToken } = require('../middleware/auth');
    const decoded = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, createdAt: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ─── Forgot Password ────────────────────────────────────────────────
// Issues a single-use reset token (valid 1 hour). Always returns a generic
// message so account existence can't be probed. In non-production the raw
// token is also returned (and logged) since no email service is configured.
router.post('/forgot-password',
  [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const email = String(req.body.email || '').trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        // Invalidate any previous unused tokens for this user
        await prisma.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null }
        });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
          }
        });

        const resetLink = `${process.env.CLIENT_URL || ''}/reset-password?token=${rawToken}`;
        log('PASSWORD_RESET_ISSUED', user.id, resetLink);
        console.log(`[password-reset] ${email} -> ${resetLink}`);

        return res.json({
          message: 'If an account exists for that email, a reset link has been generated.',
          ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawToken, resetLink } : {})
        });
      }

      log('PASSWORD_RESET_REQUEST_UNKNOWN_EMAIL');
      res.json({ message: 'If an account exists for that email, a reset link has been generated.' });
    } catch (err) {
      log('FORGOT_PASSWORD_ERROR', err.message);
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Could not process request' });
    }
  }
);

// ─── Reset Password ─────────────────────────────────────────────────
// Consumes a reset token and sets a new password.
router.post('/reset-password',
  [
    body('token').trim().notEmpty().withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 6, max: 128 })
      .withMessage('Password must be 6-128 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, password } = req.body;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const record = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { id: true, email: true } } }
      });

      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return res.status(400).json({ error: 'Reset link is invalid or has expired' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      await prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword }
      });

      // Single-use: mark consumed and clear any other pending tokens
      await prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } });

      log('PASSWORD_RESET_SUCCESS', record.userId);
      res.json({ message: 'Password has been reset. You can now sign in.' });
    } catch (err) {
      log('RESET_PASSWORD_ERROR', err.message);
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Could not reset password' });
    }
  }
);

module.exports = router;
