import { Router, Request, Response } from 'express';

const router = Router();

router.get('/sign-out', (_req: Request, res: Response) => {
  // Clear Clerk session cookies and redirect to home
  res.clearCookie('__session');
  res.clearCookie('__client_uat');
  res.redirect('/');
});

export { router as authRoutes };
