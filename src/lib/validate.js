import { limits } from '../config.js';
import { badRequest, HttpError } from './errors.js';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Optional positive integer: absent/null -> null; anything else must be an integer in [1, max].
// Strings like "10" and floats like 1.5 are rejected rather than silently coerced.
function optionalPositiveInt(value, field, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest(`${field} must be an integer`);
  }
  if (value < 1) throw badRequest(`${field} must be >= 1`);
  if (value > max) throw badRequest(`${field} must be <= ${max}`);
  return value;
}

/** Validates a create-paste body. Returns normalised input or throws a 4xx HttpError. */
export function validateCreatePaste(body) {
  if (!isPlainObject(body)) throw badRequest('Request body must be a JSON object');

  const { content } = body;
  if (typeof content !== 'string') throw badRequest('content is required and must be a string');
  if (content.trim().length === 0) throw badRequest('content must not be empty');
  if (Buffer.byteLength(content, 'utf8') > limits.maxContentBytes) {
    throw new HttpError(413, `content must be at most ${limits.maxContentBytes} bytes`);
  }

  return {
    content,
    ttlSeconds: optionalPositiveInt(body.ttl_seconds, 'ttl_seconds', limits.maxTtlSeconds),
    maxViews: optionalPositiveInt(body.max_views, 'max_views', limits.maxViews),
  };
}
