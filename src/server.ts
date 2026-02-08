import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middleware/error.js';
import { loadUser } from './middleware/auth.js';

// API routes
import identityRouter from './routes/identity.js';
import techniquesRouter from './routes/techniques.js';
import evidenceRouter from './routes/evidence.js';
import { governanceRouter } from './routes/governance.js';

// Web routes
import { authRoutes } from './routes/auth.js';
import { webRoutes } from './web/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Body parsing ────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files ────────────────────────────────
app.use(express.static(path.join(__dirname, 'web/public')));

// ── View engine ─────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web/views'));

// ── Sessions ────────────────────────────────────
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool: pool as any,
      tableName: 'session',
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || 'lobster-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

// ── Load user into res.locals for templates ─────
app.use(loadUser);

// ── Rate limiting on API write endpoints ────────
const apiWriteLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxWriteRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.author || req.ip || 'unknown',
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many write requests. Please try again later.',
    },
  },
});

// ── API routes (/v1) ────────────────────────────
// Apply rate limiter to all API write operations
app.use('/v1', (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    return (apiWriteLimiter as any)(req, res, next);
  }
  next();
});

app.use('/v1/identities', identityRouter);
app.use('/v1/techniques', techniquesRouter);
app.use('/v1', evidenceRouter);
app.use('/v1', governanceRouter);

// ── Web routes ──────────────────────────────────
app.use('/auth', authRoutes);
app.use('/', webRoutes);

// ── Error handling ──────────────────────────────
app.use(errorHandler);

// ── Start server ────────────────────────────────
app.listen(config.port, () => {
  console.log(`Lobster Center running on http://localhost:${config.port}`);
});

export default app;
