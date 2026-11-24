import { config } from '../config.js';

/**
 * Returns the "current time" in epoch milliseconds for a request.
 *
 * With TEST_MODE=1, a valid `x-test-now-ms` header replaces the real clock,
 * so automated tests can check expiry without actually waiting.
 * Outside test mode the header is ignored, so clients can't extend a paste's life.
 */
export function nowMs(req) {
  if (config.testMode) {
    const raw = req.get('x-test-now-ms');
    if (raw !== undefined && /^\d+$/.test(raw.trim())) {
      const value = Number(raw.trim());
      if (Number.isSafeInteger(value)) return value;
    }
  }
  return Date.now();
}
