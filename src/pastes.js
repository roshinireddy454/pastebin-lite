import { generateId } from './lib/id.js';
import { DuplicateIdError } from './db/postgres.js';

const MAX_ID_ATTEMPTS = 5;

/** Creates a paste and returns its ID. Expiry is fixed at creation: now + ttl. */
export async function createPaste(store, { content, ttlSeconds, maxViews }, now) {
  const expiresAt = ttlSeconds === null ? null : now + ttlSeconds * 1000;

  for (let attempt = 1; ; attempt++) {
    const id = generateId();
    try {
      await store.create({ id, content, createdAt: now, expiresAt, maxViews });
      return id;
    } catch (err) {
      if (!(err instanceof DuplicateIdError) || attempt >= MAX_ID_ATTEMPTS) throw err;
    }
  }
}

/**
 * Records one view and returns the public representation, or null when the paste
 * doesn't exist, has expired, or has used up its views. These cases are reported
 * the same way on purpose, so a client can't tell which one applied.
 */
export async function viewPaste(store, id, now) {
  const paste = await store.consumeView(id, now);
  if (!paste) return null;
  return {
    content: paste.content,
    remaining_views: paste.maxViews === null ? null : paste.maxViews - paste.viewCount,
    expires_at: paste.expiresAt === null ? null : new Date(paste.expiresAt).toISOString(),
  };
}
