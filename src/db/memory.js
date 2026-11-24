import { DuplicateIdError } from './postgres.js';

/**
 * In-memory store with the same contract as the Postgres store.
 * Used for tests and local development without a database. Not for production:
 * data is lost on restart and isn't shared between serverless instances.
 * Each method runs synchronously between awaits, so check-and-increment is atomic.
 */
export function createMemoryStore() {
  const pastes = new Map();

  return {
    async create({ id, content, createdAt, expiresAt, maxViews }) {
      if (pastes.has(id)) throw new DuplicateIdError(id);
      pastes.set(id, { content, createdAt, expiresAt, maxViews, viewCount: 0 });
    },

    async consumeView(id, now) {
      const p = pastes.get(id);
      if (!p) return null;
      if (p.expiresAt !== null && p.expiresAt <= now) return null;
      if (p.maxViews !== null && p.viewCount >= p.maxViews) return null;
      p.viewCount += 1;
      return { content: p.content, expiresAt: p.expiresAt, maxViews: p.maxViews, viewCount: p.viewCount };
    },

    async ping() {},
    async close() {},
  };
}
