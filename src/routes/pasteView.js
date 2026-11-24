import express, { Router } from 'express';
import { rateLimits } from '../config.js';
import { asyncHandler } from '../lib/http.js';
import { isValidId } from '../lib/id.js';
import { languageExtension } from '../lib/languages.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { nowMs } from '../lib/time.js';
import { parseCookies } from '../lib/cookies.js';
import { openPaste } from '../pastes.js';
import { CSP, renderLocked, renderNotFound, renderPaste } from '../views/pasteHtml.js';

// Theme chosen in the UI is stored in a cookie so these server-rendered pages match it.
const themeFrom = (req) => {
  const theme = parseCookies(req.get('cookie')).theme;
  return theme === 'light' || theme === 'dark' ? theme : null;
};

/**
 * Server-rendered paste pages:
 *   GET  /p/:id    HTML view (counts a view), or a password form for protected pastes
 *   POST /p/:id    submit the password form
 *   GET  /raw/:id  plain text (counts a view)
 */
export function pageRouter(store) {
  const router = Router();
  const checkPasswordAttempt = createRateLimiter(rateLimits.pastePassword);

  const pageHeaders = (res) =>
    res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' });

  async function show(req, res, password) {
    const ctx = { theme: themeFrom(req), user: req.user };
    const id = req.params.id;
    const result = isValidId(id) ? await openPaste(store, id, nowMs(req), { user: req.user, password }) : { status: 'not_found' };
    if (result.status === 'not_found') return res.status(404).type('html').send(renderNotFound(ctx));
    if (result.status === 'locked') {
      return res.status(result.wrongPassword ? 401 : 200).type('html').send(renderLocked(id, result.wrongPassword, ctx));
    }
    res.status(200).type('html').send(renderPaste(result.paste, ctx));
  }

  router.get('/p/:id', asyncHandler(async (req, res) => {
    pageHeaders(res);
    // A HEAD request (e.g. a link checker or chat-app preview) must not use up a view.
    if (req.method === 'HEAD') return res.set('Allow', 'GET').status(405).end();
    await show(req, res, null);
  }));

  router.post('/p/:id', express.urlencoded({ extended: false, limit: '4kb' }), asyncHandler(async (req, res) => {
    pageHeaders(res);
    checkPasswordAttempt(`${req.ip}:${req.params.id}`);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    await show(req, res, password);
  }));

  router.get('/raw/:id', asyncHandler(async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') return res.set('Allow', 'GET').status(405).end();

    const password = req.get('x-paste-password') ?? null;
    if (password !== null) checkPasswordAttempt(`${req.ip}:${req.params.id}`);
    const result = isValidId(req.params.id)
      ? await openPaste(store, req.params.id, nowMs(req), { user: req.user, password })
      : { status: 'not_found' };

    res.type('text/plain; charset=utf-8');
    if (result.status === 'not_found') return res.status(404).send('Paste not found\n');
    if (result.status === 'locked') return res.status(401).send('This paste is password-protected\n');
    if (req.query.download === '1') {
      res.attachment(`${req.params.id}.${languageExtension(result.paste.language)}`);
    }
    res.status(200).send(result.paste.content);
  }));

  return router;
}
