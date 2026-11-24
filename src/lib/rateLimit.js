import { HttpError } from './errors.js';

/**
 * Fixed-window rate limiter held in memory, used to slow down password guessing.
 * On serverless hosting each instance keeps its own counters, so this is best-effort;
 * a shared store such as Redis would be the next step for strict global limits.
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  return function check(key) {
    const now = Date.now();
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    }
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const err = new HttpError(429, 'Too many attempts. Please try again later.');
      err.retryAfter = Math.ceil((entry.reset - now) / 1000);
      throw err;
    }
  };
}
