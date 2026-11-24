// Central place for runtime configuration, read once from the environment.
export const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || '',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  testMode: process.env.TEST_MODE === '1',
};

// Limits. Kept generous but bounded so a single request can't exhaust resources.
export const limits = {
  maxContentBytes: 512 * 1024, // 512 KB of UTF-8 text per paste
  maxTtlSeconds: 100 * 365 * 24 * 60 * 60, // 100 years
  maxViews: 1_000_000_000, // fits comfortably in a Postgres INTEGER
  maxTitleLength: 100,
  maxPastePasswordLength: 128,
  highlightMaxBytes: 200 * 1024, // larger pastes are shown without syntax highlighting
  pageSize: 20,
};

// Best-effort brute-force protection (per server instance). Read when the app is created.
export const rateLimits = {
  login: { windowMs: 15 * 60_000, max: 10 }, // per IP + login name
  signup: { windowMs: 60 * 60_000, max: 20 }, // per IP
  pastePassword: { windowMs: 15 * 60_000, max: 20 }, // per IP + paste
};

export const auth = {
  sessionCookie: 'sid',
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
};
