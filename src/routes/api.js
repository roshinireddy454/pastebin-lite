import { Router } from 'express';
import { limits, rateLimits } from '../config.js';
import { requireUser } from '../auth.js';
import { HttpError, notFound } from '../lib/errors.js';
import { asyncHandler, baseUrl, noStore, parsePage } from '../lib/http.js';
import { isValidId } from '../lib/id.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { nowMs } from '../lib/time.js';
import { validateCreatePaste, validateUpdatePaste } from '../lib/validate.js';
import { createPaste, openPaste, toApiView, toEditView, toSummary, updatePaste } from '../pastes.js';

/** Fetches one page of summaries; asks for one extra row to know whether there's a next page. */
async function listPage(store, req, options) {
  const now = nowMs(req);
  const { page, offset } = parsePage(req.query.page, limits.pageSize);
  const rows = await store.listPastes({ ...options, now, limit: limits.pageSize + 1, offset });
  return {
    pastes: rows.slice(0, limits.pageSize).map((p) => toSummary(p, now, baseUrl(req))),
    page,
    has_more: rows.length > limits.pageSize,
  };
}

export function apiRouter(store) {
  const router = Router();
  const checkPasswordAttempt = createRateLimiter(rateLimits.pastePassword);

  // Responses depend on live state (view counts, sessions): nothing may be cached by a CDN or browser.
  router.use(noStore);

  router.get('/healthz', asyncHandler(async (req, res) => {
    try {
      await store.ping();
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[healthz] storage check failed:', err.message);
      res.status(503).json({ ok: false });
    }
  }));

  // ---------- Core paste API ----------

  router.post('/pastes', asyncHandler(async (req, res) => {
    const input = validateCreatePaste(req.body);
    const id = await createPaste(store, input, nowMs(req), req.user);
    res.status(201).json({ id, url: `${baseUrl(req)}/p/${id}` });
  }));

  router.get('/pastes/:id', asyncHandler(async (req, res) => {
    // A HEAD request (e.g. a link checker) must not use up a view.
    if (req.method === 'HEAD') return res.set('Allow', 'GET').status(405).end();
    if (!isValidId(req.params.id)) throw notFound();

    const password = req.get('x-paste-password') ?? null;
    if (password !== null) checkPasswordAttempt(`${req.ip}:${req.params.id}`);

    const result = await openPaste(store, req.params.id, nowMs(req), { user: req.user, password });
    if (result.status === 'not_found') throw notFound();
    if (result.status === 'locked') {
      throw new HttpError(401, result.wrongPassword ? 'Incorrect password' : 'This paste is password-protected');
    }
    res.status(200).json(toApiView(result.paste));
  }));

  // ---------- Owner-only management ----------

  // Full paste data for the edit form. The owner editing doesn't count as a view.
  router.get('/pastes/:id/edit', asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const paste = isValidId(req.params.id) ? await store.getOwnedPaste(req.params.id, user.id, nowMs(req)) : null;
    if (!paste) throw notFound();
    res.json(toEditView(paste, baseUrl(req)));
  }));

  router.patch('/pastes/:id', asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const changes = validateUpdatePaste(req.body);
    if (!isValidId(req.params.id)) throw notFound();
    const paste = await updatePaste(store, req.params.id, user, changes, nowMs(req));
    if (!paste) throw notFound();
    res.json(toEditView(paste, baseUrl(req)));
  }));

  router.delete('/pastes/:id', asyncHandler(async (req, res) => {
    const user = requireUser(req);
    if (!isValidId(req.params.id) || !(await store.deletePaste(req.params.id, user.id))) throw notFound();
    res.status(204).end();
  }));

  // ---------- Listings (never count views) ----------

  router.get('/me/pastes', asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const [list, stats] = await Promise.all([
      listPage(store, req, { userId: user.id, includeInactive: true }),
      store.userStats(user.id, nowMs(req)),
    ]);
    res.json({ ...list, stats });
  }));

  router.get('/public/pastes', asyncHandler(async (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    res.json(await listPage(store, req, { publicOnly: true, search }));
  }));

  router.get('/users/:username', asyncHandler(async (req, res) => {
    const user = await store.findUserByUsername(String(req.params.username).slice(0, 24));
    if (!user) throw notFound('User not found');
    const list = await listPage(store, req, { userId: user.id, publicOnly: true });
    res.json({ user: { username: user.username, created_at: new Date(user.createdAt).toISOString() }, ...list });
  }));

  return router;
}
