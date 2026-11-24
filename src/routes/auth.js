import { Router } from 'express';
import { rateLimits } from '../config.js';
import { endSession, serializeUser, startSession } from '../auth.js';
import { DuplicateError } from '../db/postgres.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { asyncHandler, noStore } from '../lib/http.js';
import { hashPassword, verifyDummy, verifyPassword } from '../lib/passwords.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { validateLogin, validateSignup } from '../lib/validate.js';

export function authRouter(store) {
  const router = Router();
  const checkLogin = createRateLimiter(rateLimits.login);
  const checkSignup = createRateLimiter(rateLimits.signup);

  router.use(noStore);

  router.post('/signup', asyncHandler(async (req, res) => {
    const input = validateSignup(req.body);
    checkSignup(req.ip);
    let user;
    try {
      user = await store.createUser({ username: input.username, email: input.email, passwordHash: await hashPassword(input.password) });
    } catch (err) {
      if (err instanceof DuplicateError) {
        throw conflict(err.field === 'email' ? 'An account with this email already exists' : 'That username is taken');
      }
      throw err;
    }
    await startSession(store, req, res, user);
    res.status(201).json({ user: serializeUser(user) });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const { login, password } = validateLogin(req.body);
    checkLogin(`${req.ip}:${login.toLowerCase()}`);
    const user = await store.findUserForLogin(login);
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyDummy(password);
    // Same message whether the user exists or not, so accounts can't be discovered this way.
    if (!ok) throw unauthorized('Invalid username or password');
    await startSession(store, req, res, user);
    res.json({ user: serializeUser(user) });
  }));

  router.post('/logout', asyncHandler(async (req, res) => {
    await endSession(store, req, res);
    res.status(204).end();
  }));

  router.get('/me', (req, res) => {
    res.json({ user: req.user ? serializeUser(req.user) : null });
  });

  return router;
}
