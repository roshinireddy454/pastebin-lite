import { DuplicateError } from './postgres.js';

/**
 * In-memory store with the same contract as the Postgres store.
 * Used for tests and local development without a database. Not for production:
 * data is lost on restart and isn't shared between serverless instances.
 * Each method runs synchronously between awaits, so check-and-increment is atomic.
 */
export function createMemoryStore() {
  const users = new Map(); // id -> user (with passwordHash)
  const sessions = new Map(); // tokenHash -> { userId, expiresAt }
  const pastes = new Map(); // id -> paste
  let nextUserId = 1;

  const publicUser = (u) => u && { id: u.id, username: u.username, email: u.email, createdAt: u.createdAt };
  const isActive = (p, now) => (p.expiresAt === null || p.expiresAt > now) && (p.maxViews === null || p.viewCount < p.maxViews);
  const authorOf = (p) => (p.userId !== null ? users.get(p.userId)?.username ?? null : null);

  return {
    async createUser({ username, email, passwordHash }) {
      for (const u of users.values()) {
        if (u.username.toLowerCase() === username.toLowerCase()) throw new DuplicateError('username');
        if (u.email.toLowerCase() === email.toLowerCase()) throw new DuplicateError('email');
      }
      const user = { id: String(nextUserId++), username, email, passwordHash, createdAt: Date.now() };
      users.set(user.id, user);
      return publicUser(user);
    },

    async findUserForLogin(login) {
      const l = login.toLowerCase();
      for (const u of users.values()) {
        if (u.username.toLowerCase() === l || u.email.toLowerCase() === l) return { ...publicUser(u), passwordHash: u.passwordHash };
      }
      return null;
    },

    async findUserByUsername(username) {
      const l = username.toLowerCase();
      for (const u of users.values()) if (u.username.toLowerCase() === l) return publicUser(u);
      return null;
    },

    async createSession({ tokenHash, userId, expiresAt }) {
      sessions.set(tokenHash, { userId, expiresAt });
    },

    async findSessionUser(tokenHash, now) {
      const s = sessions.get(tokenHash);
      if (!s || s.expiresAt <= now) return null;
      return publicUser(users.get(s.userId)) ?? null;
    },

    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },

    async createPaste(p) {
      if (pastes.has(p.id)) throw new DuplicateError('id');
      pastes.set(p.id, { ...p, updatedAt: null, viewCount: 0 });
    },

    async getPasteAccess(id, now) {
      const p = pastes.get(id);
      if (!p || !isActive(p, now)) return null;
      return { userId: p.userId, visibility: p.visibility, passwordHash: p.passwordHash };
    },

    async consumeView(id, now) {
      const p = pastes.get(id);
      if (!p || !isActive(p, now)) return null;
      p.viewCount += 1;
      const { content, title, language, visibility, createdAt, updatedAt, expiresAt, maxViews, viewCount, userId } = p;
      return { content, title, language, visibility, createdAt, updatedAt, expiresAt, maxViews, viewCount, userId, author: authorOf(p) };
    },

    async getOwnedPaste(id, userId, now) {
      const p = pastes.get(id);
      if (!p || p.userId !== userId || !isActive(p, now)) return null;
      const { content, title, language, visibility, createdAt, updatedAt, expiresAt, maxViews, viewCount } = p;
      return { id, content, title, language, visibility, hasPassword: p.passwordHash !== null, createdAt, updatedAt, expiresAt, maxViews, viewCount };
    },

    async updatePaste(id, userId, now, changes) {
      const p = pastes.get(id);
      if (!p || p.userId !== userId || !isActive(p, now)) return false;
      for (const key of ['title', 'content', 'language', 'visibility', 'passwordHash']) {
        if (changes[key] !== undefined) p[key] = changes[key];
      }
      p.updatedAt = now;
      return true;
    },

    async listPastes({ userId = null, publicOnly = false, includeInactive = false, search = '', now, limit, offset = 0 }) {
      const needle = search.toLowerCase();
      return [...pastes.values()]
        .filter((p) => (userId === null || p.userId === userId)
          && (!publicOnly || p.visibility === 'public')
          && (includeInactive || isActive(p, now))
          && (!needle || (p.title ?? '').toLowerCase().includes(needle)))
        .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1))
        .slice(offset, offset + limit)
        .map((p) => ({
          id: p.id,
          title: p.title,
          language: p.language,
          visibility: p.visibility,
          hasPassword: p.passwordHash !== null,
          createdAt: p.createdAt,
          expiresAt: p.expiresAt,
          maxViews: p.maxViews,
          viewCount: p.viewCount,
          size: Buffer.byteLength(p.content, 'utf8'),
          author: authorOf(p),
        }));
    },

    async userStats(userId, now) {
      const mine = [...pastes.values()].filter((p) => p.userId === userId);
      return {
        total: mine.length,
        active: mine.filter((p) => isActive(p, now)).length,
        views: mine.reduce((sum, p) => sum + p.viewCount, 0),
      };
    },

    async deletePaste(id, userId) {
      const p = pastes.get(id);
      if (!p || p.userId !== userId) return false;
      pastes.delete(id);
      return true;
    },

    async ping() {},
    async close() {},
  };
}
