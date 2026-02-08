import { Request, Response, NextFunction } from 'express';

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    humanId: string;
    email: string;
    displayName: string | null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.humanId) {
    res.redirect('/auth/login?redirect=' + encodeURIComponent(req.originalUrl));
    return;
  }
  next();
}

export function loadUser(req: Request, res: Response, next: NextFunction) {
  res.locals.user = req.session.humanId
    ? { id: req.session.humanId, email: req.session.email, displayName: req.session.displayName }
    : null;
  next();
}
