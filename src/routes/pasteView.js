import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { isValidId } from '../lib/id.js';
import { nowMs } from '../lib/time.js';
import { viewPaste } from '../pastes.js';
import { renderNotFound, renderPaste } from '../views/pasteHtml.js';

// Paste content is user-supplied, so the page runs no scripts at all (content is also HTML-escaped).
const CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Server-rendered HTML view at /p/:id, so the content is readable without any client-side JS. */
export function pageRouter(store) {
  const router = Router();

  router.get('/p/:id', asyncHandler(async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') return res.set('Allow', 'GET').status(405).end();

    const paste = isValidId(req.params.id) ? await viewPaste(store, req.params.id, nowMs(req)) : null;
    if (!paste) return res.status(404).type('html').send(renderNotFound());
    res.status(200).type('html').send(renderPaste(paste));
  }));

  return router;
}
