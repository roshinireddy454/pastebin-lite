import { limits } from '../config.js';
import { badRequest, HttpError } from './errors.js';
import { isLanguage } from './languages.js';

export const VISIBILITIES = ['public', 'unlisted', 'private'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function requireObject(body) {
  if (!isPlainObject(body)) throw badRequest('Request body must be a JSON object');
  return body;
}

// Optional positive integer: absent/null -> null; anything else must be an integer in [1, max].
// Strings like "10" and floats like 1.5 are rejected rather than silently coerced.
function optionalPositiveInt(value, field, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) throw badRequest(`${field} must be an integer`);
  if (value < 1) throw badRequest(`${field} must be >= 1`);
  if (value > max) throw badRequest(`${field} must be <= ${max}`);
  return value;
}

function optionalString(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  return value;
}

/**
 * Validates a create-paste body. Only `content` is required; everything else is optional,
 * so the minimal API ({ content, ttl_seconds, max_views }) keeps working unchanged.
 */
export function validateCreatePaste(body) {
  const { content } = requireObject(body);
  if (typeof content !== 'string') throw badRequest('content is required and must be a string');
  if (content.trim().length === 0) throw badRequest('content must not be empty');
  if (Buffer.byteLength(content, 'utf8') > limits.maxContentBytes) {
    throw new HttpError(413, `content must be at most ${limits.maxContentBytes} bytes`);
  }

  const title = optionalString(body.title, 'title')?.trim() || null;
  if (title && title.length > limits.maxTitleLength) {
    throw badRequest(`title must be at most ${limits.maxTitleLength} characters`);
  }

  const language = optionalString(body.language, 'language') ?? 'plaintext';
  if (!isLanguage(language)) throw badRequest('language is not supported');

  const visibility = optionalString(body.visibility, 'visibility') ?? 'unlisted';
  if (!VISIBILITIES.includes(visibility)) throw badRequest(`visibility must be one of: ${VISIBILITIES.join(', ')}`);

  const password = optionalString(body.password, 'password') || null;
  if (password && password.length > limits.maxPastePasswordLength) {
    throw badRequest(`password must be at most ${limits.maxPastePasswordLength} characters`);
  }

  return {
    content,
    ttlSeconds: optionalPositiveInt(body.ttl_seconds, 'ttl_seconds', limits.maxTtlSeconds),
    maxViews: optionalPositiveInt(body.max_views, 'max_views', limits.maxViews),
    title,
    language,
    visibility,
    password,
  };
}

/**
 * Validates an edit. Every field is optional, but at least one must be present.
 * `password`: a non-empty string sets a new password, null removes it, absent leaves it unchanged.
 * Expiry and view limits can't be edited (they're part of what the creator promised viewers).
 */
export function validateUpdatePaste(body) {
  requireObject(body);
  const out = {};

  if (body.content !== undefined) {
    if (typeof body.content !== 'string' || body.content.trim().length === 0) throw badRequest('content must be a non-empty string');
    if (Buffer.byteLength(body.content, 'utf8') > limits.maxContentBytes) {
      throw new HttpError(413, `content must be at most ${limits.maxContentBytes} bytes`);
    }
    out.content = body.content;
  }
  if (body.title !== undefined) {
    const title = optionalString(body.title, 'title')?.trim() || null;
    if (title && title.length > limits.maxTitleLength) throw badRequest(`title must be at most ${limits.maxTitleLength} characters`);
    out.title = title;
  }
  if (body.language !== undefined) {
    if (!isLanguage(body.language)) throw badRequest('language is not supported');
    out.language = body.language;
  }
  if (body.visibility !== undefined) {
    if (!VISIBILITIES.includes(body.visibility)) throw badRequest(`visibility must be one of: ${VISIBILITIES.join(', ')}`);
    out.visibility = body.visibility;
  }
  if (body.password !== undefined) {
    if (body.password !== null && (typeof body.password !== 'string' || body.password.length === 0)) {
      throw badRequest('password must be a non-empty string, or null to remove it');
    }
    if (body.password && body.password.length > limits.maxPastePasswordLength) {
      throw badRequest(`password must be at most ${limits.maxPastePasswordLength} characters`);
    }
    out.password = body.password;
  }

  if (Object.keys(out).length === 0) throw badRequest('Nothing to update');
  return out;
}

const USERNAME = /^[A-Za-z0-9_-]{3,24}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESERVED = new Set(['admin', 'api', 'login', 'signup', 'logout', 'dashboard', 'archive', 'settings', 'me', 'root']);

export function validateSignup(body) {
  const { username, email, password } = requireObject(body);
  if (typeof username !== 'string' || !USERNAME.test(username)) {
    throw badRequest('Username must be 3–24 characters: letters, numbers, _ or -');
  }
  if (RESERVED.has(username.toLowerCase())) throw badRequest('That username is not available');
  if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email.trim())) {
    throw badRequest('Enter a valid email address');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw badRequest('Password must be 8–128 characters');
  }
  return { username, email: email.trim().toLowerCase(), password };
}

export function validateLogin(body) {
  const { login, password } = requireObject(body);
  if (typeof login !== 'string' || !login.trim() || typeof password !== 'string' || !password) {
    throw badRequest('Enter your username or email and password');
  }
  if (login.length > 254 || password.length > 128) throw badRequest('Invalid username or password');
  return { login: login.trim(), password };
}
