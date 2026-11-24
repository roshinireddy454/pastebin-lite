import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { isValidId } from '../lib/id.js';
import { nowMs } from '../lib/time.js';
import { viewPaste } from '../pastes.js';
import { CSP, renderNotFound, renderPaste } from '../views/pasteHtml.js';

// Theme chosen in the UI is stored in a cookie so this server-rendered page matches it.
const themeFrom = (req) => /(?:^|;\s*)theme=(light|dark)(?:;|$)/.exec(req.get('cookie') || '')?.[1] ?? null;

/** Server-rendered HTML view at /p/:id, so the content is readable without any client-side JS. */
export function pageRouter(store) {
  const router = Router();

  router.get('/p/:id', asyncHandler(async (req, res) => {
    // Paste content is user-supplied: it's HTML-escaped, and the CSP allows only our own hashed script.
    res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') return res.set('Allow', 'GET').status(405).end();

    const theme = themeFrom(req);
    const paste = isValidId(req.params.id) ? await viewPaste(store, req.params.id, nowMs(req)) : null;
    if (!paste) return res.status(404).type('html').send(renderNotFound(theme));
    res.status(200).type('html').send(renderPaste(paste, theme));
  }));

  return router;
}
