import { badRequest } from './lib/errors.js';
import { generateId } from './lib/id.js';
import { hashPassword, verifyPassword } from './lib/passwords.js';
import { DuplicateError } from './db/postgres.js';

const MAX_ID_ATTEMPTS = 5;

/** Creates a paste and returns its ID. Expiry is fixed at creation: now + ttl. */
export async function createPaste(store, input, now, user) {
  if (input.visibility === 'private' && !user) throw badRequest('Log in to create private pastes');

  const expiresAt = input.ttlSeconds === null ? null : now + input.ttlSeconds * 1000;
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  for (let attempt = 1; ; attempt++) {
    const id = generateId();
    try {
      await store.createPaste({
        id,
        content: input.content,
        createdAt: now,
        expiresAt,
        maxViews: input.maxViews,
        title: input.title,
        language: input.language,
        visibility: input.visibility,
        passwordHash,
        userId: user?.id ?? null,
      });
      return id;
    } catch (err) {
      if (!(err instanceof DuplicateError) || attempt >= MAX_ID_ATTEMPTS) throw err;
    }
  }
}

/**
 * Opens a paste for viewing. Access rules run first, without counting a view:
 *  - missing, expired or used up          -> { status: 'not_found' }
 *  - private and the viewer isn't owner   -> { status: 'not_found' } (existence isn't revealed)
 *  - password-protected, no/wrong password -> { status: 'locked' }   (the owner skips this)
 * Only then is a view recorded atomically; if a concurrent request took the last view in
 * between, consumeView returns null and this is reported as not found.
 */
export async function openPaste(store, id, now, { user = null, password = null } = {}) {
  const access = await store.getPasteAccess(id, now);
  if (!access) return { status: 'not_found' };

  const isOwner = user !== null && access.userId !== null && user.id === access.userId;
  if (access.visibility === 'private' && !isOwner) return { status: 'not_found' };

  if (access.passwordHash && !isOwner) {
    if (password === null) return { status: 'locked', wrongPassword: false };
    if (!(await verifyPassword(password, access.passwordHash))) return { status: 'locked', wrongPassword: true };
  }

  const paste = await store.consumeView(id, now);
  if (!paste) return { status: 'not_found' };
  return { status: 'ok', paste: { ...paste, id, isOwner, hasPassword: Boolean(access.passwordHash) } };
}

/**
 * Applies an owner's edits and returns the updated paste, or null if it isn't theirs or is no
 * longer active. A new password is hashed; `password: null` removes the existing one.
 */
export async function updatePaste(store, id, user, changes, now) {
  const { password, ...rest } = changes;
  const update = { ...rest };
  if (password !== undefined) update.passwordHash = password === null ? null : await hashPassword(password);
  if (!(await store.updatePaste(id, user.id, now, update))) return null;
  return store.getOwnedPaste(id, user.id, now);
}

/** Everything the owner's edit form needs. */
export const toEditView = (p, baseUrl) => ({
  id: p.id,
  url: `${baseUrl}/p/${p.id}`,
  title: p.title,
  content: p.content,
  language: p.language,
  visibility: p.visibility,
  has_password: p.hasPassword,
  created_at: new Date(p.createdAt).toISOString(),
  updated_at: p.updatedAt === null ? null : new Date(p.updatedAt).toISOString(),
  expires_at: p.expiresAt === null ? null : new Date(p.expiresAt).toISOString(),
  max_views: p.maxViews,
  views: p.viewCount,
});

/** The core API representation: exactly { content, remaining_views, expires_at }. */
export const toApiView = (paste) => ({
  content: paste.content,
  remaining_views: paste.maxViews === null ? null : paste.maxViews - paste.viewCount,
  expires_at: paste.expiresAt === null ? null : new Date(paste.expiresAt).toISOString(),
});

/** Status of a paste in listings. */
export function pasteStatus(p, now) {
  if (p.maxViews !== null && p.viewCount >= p.maxViews) return 'used_up';
  if (p.expiresAt !== null && p.expiresAt <= now) return 'expired';
  return 'active';
}

/** Summary used by the dashboard, archive and profiles (no content). */
export const toSummary = (p, now, baseUrl) => ({
  id: p.id,
  url: `${baseUrl}/p/${p.id}`,
  title: p.title,
  language: p.language,
  visibility: p.visibility,
  has_password: p.hasPassword,
  created_at: new Date(p.createdAt).toISOString(),
  expires_at: p.expiresAt === null ? null : new Date(p.expiresAt).toISOString(),
  max_views: p.maxViews,
  views: p.viewCount,
  size: p.size,
  author: p.author,
  status: pasteStatus(p, now),
});
