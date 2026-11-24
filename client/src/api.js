/** POST /api/pastes. Resolves to { id, url } or throws an Error carrying the server's message. */
export async function createPaste({ content, ttlSeconds, maxViews }) {
  const body = { content };
  if (ttlSeconds) body.ttl_seconds = ttlSeconds;
  if (maxViews) body.max_views = maxViews;

  let res;
  try {
    res = await fetch('/api/pastes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Network error: could not reach the server.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
