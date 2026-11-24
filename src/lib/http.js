import { config } from '../config.js';

// Share URLs use the public origin: PUBLIC_BASE_URL if set, else the host the client actually used
// (X-Forwarded-Host behind a proxy; req.protocol already honours X-Forwarded-Proto via 'trust proxy').
export function baseUrl(req) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${req.protocol}://${host}`;
}

/** ?page=N (1-based) -> offset. Invalid values fall back to page 1. */
export function parsePage(value, pageSize) {
  const page = /^\d{1,4}$/.test(String(value ?? '')) ? Math.max(1, Number(value)) : 1;
  return { page, offset: (page - 1) * pageSize };
}

// Express 4 does not forward rejected promises to the error handler; this does.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
