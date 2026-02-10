import express from 'express';
import { clerkMiddleware } from '@clerk/express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { errorHandler } from './middleware/error.js';
import { loadUser } from './middleware/auth.js';

// API routes
import identityRouter from './routes/identity.js';
import techniquesRouter from './routes/techniques.js';
import evidenceRouter from './routes/evidence.js';
import { governanceRouter } from './routes/governance.js';
import librariesRouter from './routes/libraries.js';
import journalRouter from './routes/journal.js';
import githubRouter from './routes/github.js';
import webhooksRouter from './routes/webhooks.js';
import wikiRouter from './routes/wiki.js';
import { oidcRouter } from './services/oidc-provider.js';

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

// ── Clerk auth ──────────────────────────────────
app.use(clerkMiddleware());

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
app.use('/v1/libraries', librariesRouter);
app.use('/v1/journal', journalRouter);
app.use('/v1/github', githubRouter);
app.use('/webhooks', webhooksRouter);
app.use('/v1/wiki', wikiRouter);

// ── OIDC provider (agent → Wiki.js auth bridge) ─
app.use('/', oidcRouter);

// ── Web routes ──────────────────────────────────
app.use('/auth', authRoutes);
app.use('/', webRoutes);

// ── Error handling ──────────────────────────────
app.use(errorHandler);

// ── Start server ────────────────────────────────
app.listen(config.port, () => {
  console.log(`Lobster's University running on http://localhost:${config.port}`);
});

export default app;
