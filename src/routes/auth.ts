import { Router, Request, Response } from 'express';
import * as humanService from '../services/human.js';

const router = Router();

router.get('/login', (req: Request, res: Response) => {
  if (req.session.humanId) {
    res.redirect('/');
    return;
  }
  res.render('auth/login', {
    title: 'Log In',
    error: null,
    redirect: req.query.redirect || '/',
  });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password, redirect } = req.body;

  if (!email || !password) {
    res.render('auth/login', {
      title: 'Log In',
      error: 'Email and password are required.',
      redirect: redirect || '/',
    });
    return;
  }

  try {
    const account = await humanService.authenticate(email, password);
    req.session.humanId = account.id;
    req.session.email = account.email;
    req.session.displayName = account.display_name;
    res.redirect(redirect || '/');
  } catch {
    res.render('auth/login', {
      title: 'Log In',
      error: 'Invalid email or password.',
      redirect: redirect || '/',
    });
  }
});

router.get('/register', (req: Request, res: Response) => {
  if (req.session.humanId) {
    res.redirect('/');
    return;
  }
  res.render('auth/register', { title: 'Register', error: null });
});

router.post('/register', async (req: Request, res: Response) => {
  const { email, password, display_name } = req.body;

  if (!email || !password) {
    res.render('auth/register', {
      title: 'Register',
      error: 'Email and password are required.',
    });
    return;
  }

  if (password.length < 8) {
    res.render('auth/register', {
      title: 'Register',
      error: 'Password must be at least 8 characters.',
    });
    return;
  }

  try {
    const account = await humanService.createAccount(email, password, display_name || null);
    req.session.humanId = account.id;
    req.session.email = account.email;
    req.session.displayName = account.display_name;
    res.redirect('/');
  } catch (err: unknown) {
    const message = err instanceof Error && 'code' in err && (err as { code: string }).code === 'EMAIL_TAKEN'
      ? 'An account with that email already exists.'
      : 'Registration failed. Please try again.';
    res.render('auth/register', { title: 'Register', error: message });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

export { router as authRoutes };
