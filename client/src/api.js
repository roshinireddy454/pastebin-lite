/** Small fetch wrapper: JSON in/out, throws an Error with the server's message on failure. */
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('Network error: could not reach the server.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString();
  return s ? `?${s}` : '';
};

export const api = {
  me: () => request('GET', '/api/auth/me'),
  signup: (body) => request('POST', '/api/auth/signup', body),
  login: (body) => request('POST', '/api/auth/login', body),
  logout: () => request('POST', '/api/auth/logout'),

  createPaste: (body) => request('POST', '/api/pastes', body),
  deletePaste: (id) => request('DELETE', `/api/pastes/${encodeURIComponent(id)}`),
  getPasteForEdit: (id) => request('GET', `/api/pastes/${encodeURIComponent(id)}/edit`),
  updatePaste: (id, changes) => request('PATCH', `/api/pastes/${encodeURIComponent(id)}`, changes),
  myPastes: (page = 1) => request('GET', `/api/me/pastes${qs({ page })}`),
  publicPastes: ({ q, page = 1 } = {}) => request('GET', `/api/public/pastes${qs({ q, page })}`),
  userProfile: (username, page = 1) => request('GET', `/api/users/${encodeURIComponent(username)}${qs({ page })}`),
};
