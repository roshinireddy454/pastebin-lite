import { createHash, randomBytes } from 'node:crypto';
import { auth } from './config.js';
import { parseCookies } from './lib/cookies.js';
import { unauthorized } from './lib/errors.js';

/*
 * Server-side sessions.
 * - The browser gets a random 256-bit token in an HttpOnly cookie (JavaScript can't read it).
 * - The database stores only the SHA-256 hash of the token, so a database leak doesn't
 *   expose usable sessions.
 * - SameSite=Lax means the cookie isn't sent on cross-site POST/DELETE requests, which
 *   protects the state-changing endpoints against CSRF.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** Attaches req.user (or null) based on the session cookie. */
export function sessionMiddleware(store) {
  return async (req, res, next) => {
    req.user = null;
    const token = parseCookies(req.get('cookie'))[auth.sessionCookie];
    if (!token || !TOKEN_PATTERN.test(token)) return next();
    try {
      req.user = await store.findSessionUser(hashToken(token), Date.now());
      next();
    } catch (err) {
      next(err);
    }
  };
}

const cookieOptions = (req) => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });

export async function startSession(store, req, res, user) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + auth.sessionTtlMs;
  await store.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt });
  res.cookie(auth.sessionCookie, token, { ...cookieOptions(req), maxAge: auth.sessionTtlMs });
}

export async function endSession(store, req, res) {
  const token = parseCookies(req.get('cookie'))[auth.sessionCookie];
  if (token && TOKEN_PATTERN.test(token)) await store.deleteSession(hashToken(token));
  res.clearCookie(auth.sessionCookie, cookieOptions(req));
}

export function requireUser(req) {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** The user as returned by the API (email only ever goes to its owner). */
export const serializeUser = (u) => ({ id: u.id, username: u.username, email: u.email, created_at: new Date(u.createdAt).toISOString() });
