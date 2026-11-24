import pg from 'pg';

// Idempotent schema: safe to run on every cold start, and upgrades a database created by an
// earlier version (ADD COLUMN IF NOT EXISTS). Runs under an advisory lock so two instances
// starting at the same moment don't race each other.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL    PRIMARY KEY,
    username      VARCHAR(24)  NOT NULL,
    email         VARCHAR(254) NOT NULL,
    password_hash TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_key    ON users (lower(email));

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  CHAR(64)    PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

  CREATE TABLE IF NOT EXISTS pastes (
    id          VARCHAR(16) PRIMARY KEY,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ,
    max_views   INTEGER     CHECK (max_views IS NULL OR max_views > 0),
    view_count  INTEGER     NOT NULL DEFAULT 0
  );
  ALTER TABLE pastes
    ADD COLUMN IF NOT EXISTS title         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS language      VARCHAR(20) NOT NULL DEFAULT 'plaintext',
    ADD COLUMN IF NOT EXISTS visibility    VARCHAR(10) NOT NULL DEFAULT 'unlisted',
    ADD COLUMN IF NOT EXISTS password_hash TEXT,
    ADD COLUMN IF NOT EXISTS user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ;
  CREATE INDEX IF NOT EXISTS pastes_public_recent_idx ON pastes (created_at DESC) WHERE visibility = 'public';
  CREATE INDEX IF NOT EXISTS pastes_user_recent_idx   ON pastes (user_id, created_at DESC);
`;
const SCHEMA_LOCK_ID = 727_001;

const UNIQUE_VIOLATION = '23505';

export class DuplicateError extends Error {
  constructor(field) {
    super(`duplicate ${field}`);
    this.field = field;
  }
}

// "Still viewable" = not expired and views left. Used in several queries; $now is a parameter.
const ACTIVE = (now) => `(p.expires_at IS NULL OR p.expires_at > ${now}) AND (p.max_views IS NULL OR p.view_count < p.max_views)`;

const toMs = (d) => (d ? d.getTime() : null);
const toUser = (r) => r && { id: String(r.id), username: r.username, email: r.email, createdAt: toMs(r.created_at) };
const toSummary = (r) => ({
  id: r.id,
  title: r.title,
  language: r.language,
  visibility: r.visibility,
  hasPassword: r.has_password,
  createdAt: toMs(r.created_at),
  expiresAt: toMs(r.expires_at),
  maxViews: r.max_views,
  viewCount: r.view_count,
  size: Number(r.size),
  author: r.author ?? null,
});

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * PostgreSQL-backed store. View limits are enforced inside a single UPDATE statement, so
 * concurrent viewers can never exceed max_views: Postgres row locking serialises the
 * increments and each one re-checks the condition against the latest row.
 */
export function createPostgresStore(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  // An idle client error (e.g. the server closing a connection) must not crash the process.
  pool.on('error', (err) => console.error('[pg] idle client error:', err.message));

  let ready;
  const init = () => {
    ready ??= (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_ID]);
        await client.query(SCHEMA);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    })().catch((err) => {
      ready = undefined; // allow a retry on the next request
      throw err;
    });
    return ready;
  };

  const q = async (text, params) => {
    await init();
    return pool.query(text, params);
  };

  return {
    // ---------- users & sessions ----------
    async createUser({ username, email, passwordHash }) {
      try {
        const { rows } = await q(
          `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
           RETURNING id, username, email, created_at`,
          [username, email, passwordHash],
        );
        return toUser(rows[0]);
      } catch (err) {
        if (err.code === UNIQUE_VIOLATION) throw new DuplicateError(err.constraint?.includes('email') ? 'email' : 'username');
        throw err;
      }
    },

    async findUserForLogin(login) {
      const { rows } = await q(
        `SELECT id, username, email, created_at, password_hash FROM users
          WHERE lower(username) = lower($1) OR lower(email) = lower($1) LIMIT 1`,
        [login],
      );
      return rows[0] ? { ...toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
    },

    async findUserByUsername(username) {
      const { rows } = await q('SELECT id, username, email, created_at FROM users WHERE lower(username) = lower($1)', [username]);
      return toUser(rows[0]) ?? null;
    },

    async createSession({ tokenHash, userId, expiresAt }) {
      await q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, new Date(expiresAt)]);
      // Opportunistic cleanup of this user's expired sessions.
      await q('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [userId]);
    },

    async findSessionUser(tokenHash, now) {
      const { rows } = await q(
        `SELECT u.id, u.username, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [tokenHash, new Date(now)],
      );
      return toUser(rows[0]) ?? null;
    },

    async deleteSession(tokenHash) {
      await q('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },

    // ---------- pastes ----------
    async createPaste(p) {
      try {
        await q(
          `INSERT INTO pastes (id, content, created_at, expires_at, max_views, title, language, visibility, password_hash, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [p.id, p.content, new Date(p.createdAt), p.expiresAt === null ? null : new Date(p.expiresAt), p.maxViews,
            p.title, p.language, p.visibility, p.passwordHash, p.userId],
        );
      } catch (err) {
        if (err.code === UNIQUE_VIOLATION) throw new DuplicateError('id');
        throw err;
      }
    },

    /** Access info for a viewable paste (does not count a view), or null if missing/expired/used up. */
    async getPasteAccess(id, now) {
      const { rows } = await q(
        `SELECT p.user_id, p.visibility, p.password_hash FROM pastes p WHERE p.id = $1 AND ${ACTIVE('$2')}`,
        [id, new Date(now)],
      );
      const r = rows[0];
      return r ? { userId: r.user_id === null ? null : String(r.user_id), visibility: r.visibility, passwordHash: r.password_hash } : null;
    },

    /** Atomically records one view. Returns the paste after the view, or null if unavailable. */
    async consumeView(id, now) {
      const { rows } = await q(
        `UPDATE pastes p SET view_count = p.view_count + 1
          WHERE p.id = $1 AND ${ACTIVE('$2')}
        RETURNING p.content, p.title, p.language, p.visibility, p.created_at, p.updated_at, p.expires_at, p.max_views,
                  p.view_count, p.user_id, (SELECT u.username FROM users u WHERE u.id = p.user_id) AS author`,
        [id, new Date(now)],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        content: r.content,
        title: r.title,
        language: r.language,
        visibility: r.visibility,
        createdAt: toMs(r.created_at),
        updatedAt: toMs(r.updated_at),
        expiresAt: toMs(r.expires_at),
        maxViews: r.max_views,
        viewCount: r.view_count,
        userId: r.user_id === null ? null : String(r.user_id),
        author: r.author,
      };
    },

    /** An owner's still-active paste, for editing (does not count a view). */
    async getOwnedPaste(id, userId, now) {
      const { rows } = await q(
        `SELECT p.id, p.content, p.title, p.language, p.visibility, (p.password_hash IS NOT NULL) AS has_password,
                p.created_at, p.updated_at, p.expires_at, p.max_views, p.view_count
           FROM pastes p WHERE p.id = $1 AND p.user_id = $2 AND ${ACTIVE('$3')}`,
        [id, userId, new Date(now)],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        content: r.content,
        title: r.title,
        language: r.language,
        visibility: r.visibility,
        hasPassword: r.has_password,
        createdAt: toMs(r.created_at),
        updatedAt: toMs(r.updated_at),
        expiresAt: toMs(r.expires_at),
        maxViews: r.max_views,
        viewCount: r.view_count,
      };
    },

    /**
     * Applies edits to an owner's still-active paste. `changes` may hold title, content, language,
     * visibility and passwordHash (null removes the password); missing keys stay unchanged.
     * Expiry, view limit and view count are never changed by an edit.
     */
    async updatePaste(id, userId, now, changes) {
      const columns = { title: 'title', content: 'content', language: 'language', visibility: 'visibility', passwordHash: 'password_hash' };
      const params = [id, userId, new Date(now)];
      const sets = ['updated_at = $3'];
      for (const [key, column] of Object.entries(columns)) {
        if (changes[key] !== undefined) {
          params.push(changes[key]);
          sets.push(`${column} = $${params.length}`);
        }
      }
      const { rowCount } = await q(
        `UPDATE pastes p SET ${sets.join(', ')} WHERE p.id = $1 AND p.user_id = $2 AND ${ACTIVE('$3')}`,
        params,
      );
      return rowCount > 0;
    },

    /**
     * Lists paste summaries (never the content, never counts views).
     * - { userId, includeInactive: true }: an owner's dashboard, including expired pastes
     * - { publicOnly: true, userId?, search? }: the public archive / a profile, active pastes only
     */
    async listPastes({ userId = null, publicOnly = false, includeInactive = false, search = '', now, limit, offset = 0 }) {
      const where = [];
      const params = [];
      const add = (v) => `$${params.push(v)}`;
      if (userId !== null) where.push(`p.user_id = ${add(userId)}`);
      if (publicOnly) where.push(`p.visibility = 'public'`);
      if (!includeInactive) where.push(ACTIVE(add(new Date(now))));
      if (search) where.push(`p.title ILIKE ${add(`%${escapeLike(search)}%`)}`);

      const { rows } = await q(
        `SELECT p.id, p.title, p.language, p.visibility, p.created_at, p.expires_at, p.max_views, p.view_count,
                octet_length(p.content) AS size, (p.password_hash IS NOT NULL) AS has_password, u.username AS author
           FROM pastes p LEFT JOIN users u ON u.id = p.user_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY p.created_at DESC, p.id
          LIMIT ${add(limit)} OFFSET ${add(offset)}`,
        params,
      );
      return rows.map(toSummary);
    },

    /** Totals for a user's dashboard. */
    async userStats(userId, now) {
      const { rows } = await q(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE ${ACTIVE('$2')})::int AS active,
                coalesce(sum(p.view_count), 0)::bigint AS views
           FROM pastes p WHERE p.user_id = $1`,
        [userId, new Date(now)],
      );
      return { total: rows[0].total, active: rows[0].active, views: Number(rows[0].views) };
    },

    /** Deletes a paste if it belongs to userId. Returns whether something was deleted. */
    async deletePaste(id, userId) {
      const { rowCount } = await q('DELETE FROM pastes WHERE id = $1 AND user_id = $2', [id, userId]);
      return rowCount > 0;
    },

    async ping() {
      await q('SELECT 1');
    },

    close: () => pool.end(),
  };
}
