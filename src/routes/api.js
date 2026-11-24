import { Router } from 'express';
import { config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/errors.js';
import { isValidId } from '../lib/id.js';
import { nowMs } from '../lib/time.js';
import { validateCreatePaste } from '../lib/validate.js';
import { createPaste, viewPaste } from '../pastes.js';

// Share URLs use the public origin: PUBLIC_BASE_URL if set, else the host the client actually used
// (X-Forwarded-Host behind a proxy; req.protocol already honours X-Forwarded-Proto via 'trust proxy').
function baseUrl(req) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${req.protocol}://${host}`;
}

export function apiRouter(store) {
  const router = Router();

  // Responses depend on live state (view counts), so nothing may be cached by a CDN or browser.
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/healthz', asyncHandler(async (req, res) => {
    try {
      await store.ping();
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[healthz] storage check failed:', err.message);
      res.status(503).json({ ok: false });
    }
  }));

  router.post('/pastes', asyncHandler(async (req, res) => {
    const input = validateCreatePaste(req.body);
    const id = await createPaste(store, input, nowMs(req));
    res.status(201).json({ id, url: `${baseUrl(req)}/p/${id}` });
  }));

  router.get('/pastes/:id', asyncHandler(async (req, res) => {
    // A HEAD request (e.g. a link checker) must not use up a view.
    if (req.method === 'HEAD') return res.set('Allow', 'GET').status(405).end();
    const paste = isValidId(req.params.id) ? await viewPaste(store, req.params.id, nowMs(req)) : null;
    if (!paste) throw notFound();
    res.status(200).json(paste);
  }));

  router.use((req, res) => res.status(404).json({ error: 'Not found' }));

  return router;
}
