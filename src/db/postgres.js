import pg from 'pg';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS pastes (
    id          VARCHAR(16) PRIMARY KEY,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ,
    max_views   INTEGER     CHECK (max_views IS NULL OR max_views > 0),
    view_count  INTEGER     NOT NULL DEFAULT 0
  );
`;

const UNIQUE_VIOLATION = '23505';

export class DuplicateIdError extends Error {}

/**
 * Postgres-backed store. All availability rules (expiry + view limit) are evaluated
 * inside a single UPDATE statement, so concurrent viewers can never exceed max_views:
 * Postgres row locking serialises the increments and each one re-checks the condition.
 */
export function createPostgresStore(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  // An idle client error (e.g. Neon closing a connection) must not crash the process.
  pool.on('error', (err) => console.error('[pg] idle client error:', err.message));

  // Create the schema once per process (cold start), shared by concurrent first requests.
  let ready;
  const init = () => {
    ready ??= pool.query(SCHEMA).catch((err) => {
      ready = undefined; // allow a retry on the next request
      throw err;
    });
    return ready;
  };

  return {
    async create({ id, content, createdAt, expiresAt, maxViews }) {
      await init();
      try {
        await pool.query(
          `INSERT INTO pastes (id, content, created_at, expires_at, max_views)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, content, new Date(createdAt), expiresAt === null ? null : new Date(expiresAt), maxViews],
        );
      } catch (err) {
        if (err.code === UNIQUE_VIOLATION) throw new DuplicateIdError(id);
        throw err;
      }
    },

    /** Atomically records one view. Returns the paste after the view, or null if unavailable. */
    async consumeView(id, now) {
      await init();
      const { rows } = await pool.query(
        `UPDATE pastes
            SET view_count = view_count + 1
          WHERE id = $1
            AND (expires_at IS NULL OR expires_at > $2)
            AND (max_views  IS NULL OR view_count < max_views)
        RETURNING content, expires_at, max_views, view_count`,
        [id, new Date(now)],
      );
      if (rows.length === 0) return null;
      const row = rows[0];
      return {
        content: row.content,
        expiresAt: row.expires_at ? row.expires_at.getTime() : null,
        maxViews: row.max_views,
        viewCount: row.view_count,
      };
    },

    async ping() {
      await init();
      await pool.query('SELECT 1');
    },

    close: () => pool.end(),
  };
}
