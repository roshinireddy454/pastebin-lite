// Contract tests for the HTTP API and HTML view.
// Runs against the in-memory store, and also against Postgres when TEST_DATABASE_URL is set.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.TEST_MODE = '1';
const { config, limits } = await import('../src/config.js');
const { createApp } = await import('../src/app.js');
const { createMemoryStore } = await import('../src/db/memory.js');
const { createPostgresStore } = await import('../src/db/postgres.js');

const backends = [['memory', () => createMemoryStore()]];
if (process.env.TEST_DATABASE_URL) {
  backends.push(['postgres', () => createPostgresStore(process.env.TEST_DATABASE_URL)]);
}

for (const [name, makeStore] of backends) {
  describe(`[${name}]`, () => {
    let store, app;
    before(() => {
      store = makeStore();
      app = createApp(store);
    });
    after(() => store.close());

    const create = (body, headers = {}) => request(app).post('/api/pastes').set(headers).send(body);
    const fetchPaste = (id, headers = {}) => request(app).get(`/api/pastes/${id}`).set(headers);
    const newPaste = async (body, headers) => {
      const res = await create(body, headers);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.id;
    };

    describe('GET /api/healthz', () => {
      test('returns 200 JSON { ok: true }', async () => {
        const res = await request(app).get('/api/healthz');
        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /application\/json/);
        assert.deepEqual(res.body, { ok: true });
      });
    });

    describe('POST /api/pastes', () => {
      test('creates a paste and returns id + share url', async () => {
        const res = await create({ content: 'hello' });
        assert.equal(res.status, 201);
        assert.match(res.body.id, /^[A-Za-z0-9]{10}$/);
        assert.match(res.body.url, new RegExp(`^http://127\\.0\\.0\\.1:\\d+/p/${res.body.id}$`));
      });

      test('url honours X-Forwarded-Proto/Host from the platform proxy', async () => {
        const res = await create({ content: 'x' }, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'paste.example.com' });
        assert.equal(res.body.url, `https://paste.example.com/p/${res.body.id}`);
      });

      test('ids are unique', async () => {
        const ids = await Promise.all(Array.from({ length: 50 }, () => newPaste({ content: 'x' })));
        assert.equal(new Set(ids).size, 50);
      });

      test('accepts both limits, and explicit nulls meaning "no limit"', async () => {
        assert.equal((await create({ content: 'a', ttl_seconds: 60, max_views: 5 })).status, 201);
        const id = await newPaste({ content: 'b', ttl_seconds: null, max_views: null });
        const res = await fetchPaste(id);
        assert.equal(res.body.remaining_views, null);
        assert.equal(res.body.expires_at, null);
      });

      const invalid = [
        ['missing content', {}],
        ['empty content', { content: '' }],
        ['whitespace-only content', { content: '   \n\t' }],
        ['non-string content', { content: 123 }],
        ['null content', { content: null }],
        ['ttl_seconds = 0', { content: 'x', ttl_seconds: 0 }],
        ['negative ttl_seconds', { content: 'x', ttl_seconds: -5 }],
        ['fractional ttl_seconds', { content: 'x', ttl_seconds: 1.5 }],
        ['string ttl_seconds', { content: 'x', ttl_seconds: '60' }],
        ['boolean ttl_seconds', { content: 'x', ttl_seconds: true }],
        ['huge ttl_seconds', { content: 'x', ttl_seconds: limits.maxTtlSeconds + 1 }],
        ['max_views = 0', { content: 'x', max_views: 0 }],
        ['negative max_views', { content: 'x', max_views: -1 }],
        ['fractional max_views', { content: 'x', max_views: 2.5 }],
        ['string max_views', { content: 'x', max_views: '3' }],
        ['huge max_views', { content: 'x', max_views: limits.maxViews + 1 }],
        ['array body', [{ content: 'x' }]],
      ];
      for (const [label, body] of invalid) {
        test(`rejects ${label} with 400 JSON`, async () => {
          const res = await create(body);
          assert.equal(res.status, 400);
          assert.equal(typeof res.body.error, 'string');
        });
      }

      test('rejects malformed JSON with 400 JSON', async () => {
        const res = await request(app).post('/api/pastes').set('Content-Type', 'application/json').send('{"content": ');
        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
      });

      test('rejects a non-JSON body with 400', async () => {
        const res = await request(app).post('/api/pastes').set('Content-Type', 'text/plain').send('content=hi');
        assert.equal(res.status, 400);
      });

      test('rejects oversized content with 413', async () => {
        const res = await create({ content: 'a'.repeat(limits.maxContentBytes + 1) });
        assert.equal(res.status, 413);
        assert.equal(typeof res.body.error, 'string');
      });

      test('accepts content exactly at the size limit', async () => {
        assert.equal((await create({ content: 'a'.repeat(limits.maxContentBytes) })).status, 201);
      });
    });

    describe('GET /api/pastes/:id', () => {
      test('returns content; no limits -> nulls', async () => {
        const id = await newPaste({ content: 'Hello, world' });
        const res = await fetchPaste(id);
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { content: 'Hello, world', remaining_views: null, expires_at: null });
        assert.equal(res.headers['cache-control'], 'no-store');
      });

      test('preserves content exactly (unicode, whitespace, newlines)', async () => {
        const content = '  héllo 🌍 世界\n\tindented\r\n<script>alert(1)</script>\n\n';
        const id = await newPaste({ content });
        assert.equal((await fetchPaste(id)).body.content, content);
      });

      test('unlimited paste can be viewed many times', async () => {
        const id = await newPaste({ content: 'x' });
        for (let i = 0; i < 10; i++) assert.equal((await fetchPaste(id)).status, 200);
      });

      test('max_views = 1: one view, then 404', async () => {
        const id = await newPaste({ content: 'once', max_views: 1 });
        const first = await fetchPaste(id);
        assert.equal(first.status, 200);
        assert.equal(first.body.remaining_views, 0);
        const second = await fetchPaste(id);
        assert.equal(second.status, 404);
        assert.equal(typeof second.body.error, 'string');
      });

      test('max_views = 3: remaining_views counts down 2,1,0 then 404', async () => {
        const id = await newPaste({ content: 'x', max_views: 3 });
        for (const expected of [2, 1, 0]) {
          const res = await fetchPaste(id);
          assert.equal(res.status, 200);
          assert.equal(res.body.remaining_views, expected);
        }
        assert.equal((await fetchPaste(id)).status, 404);
        assert.equal((await fetchPaste(id)).status, 404);
      });

      test('ttl: available until exactly created + ttl, then 404 (x-test-now-ms)', async () => {
        const t0 = 1_700_000_000_000;
        const id = await newPaste({ content: 'x', ttl_seconds: 60 }, { 'x-test-now-ms': String(t0) });

        const before = await fetchPaste(id, { 'x-test-now-ms': String(t0 + 59_999) });
        assert.equal(before.status, 200);
        assert.equal(before.body.expires_at, new Date(t0 + 60_000).toISOString());
        assert.equal(before.body.remaining_views, null);

        assert.equal((await fetchPaste(id, { 'x-test-now-ms': String(t0 + 60_000) })).status, 404);
        assert.equal((await fetchPaste(id, { 'x-test-now-ms': String(t0 + 10 ** 9) })).status, 404);
      });

      test('both limits: time expiry wins even with views left', async () => {
        const t0 = 1_700_000_000_000;
        const id = await newPaste({ content: 'x', ttl_seconds: 10, max_views: 100 }, { 'x-test-now-ms': String(t0) });
        const res = await fetchPaste(id, { 'x-test-now-ms': String(t0 + 1000) });
        assert.equal(res.body.remaining_views, 99);
        assert.equal((await fetchPaste(id, { 'x-test-now-ms': String(t0 + 10_000) })).status, 404);
      });

      test('both limits: view limit wins even before expiry', async () => {
        const id = await newPaste({ content: 'x', ttl_seconds: 3600, max_views: 2 });
        assert.equal((await fetchPaste(id)).status, 200);
        assert.equal((await fetchPaste(id)).status, 200);
        assert.equal((await fetchPaste(id)).status, 404);
      });

      test('requests after expiry do not consume views', async () => {
        const t0 = 1_700_000_000_000;
        const id = await newPaste({ content: 'x', ttl_seconds: 10, max_views: 2 }, { 'x-test-now-ms': String(t0) });
        assert.equal((await fetchPaste(id, { 'x-test-now-ms': String(t0 + 20_000) })).status, 404);
        const res = await fetchPaste(id, { 'x-test-now-ms': String(t0 + 1_000) });
        assert.equal(res.body.remaining_views, 1);
      });

      test('invalid x-test-now-ms falls back to the real clock', async () => {
        const id = await newPaste({ content: 'x', ttl_seconds: 60 });
        assert.equal((await fetchPaste(id, { 'x-test-now-ms': 'abc' })).status, 200);
        assert.equal((await fetchPaste(id, { 'x-test-now-ms': '-1' })).status, 200);
      });

      test('x-test-now-ms is ignored when TEST_MODE is off', async () => {
        const id = await newPaste({ content: 'x', ttl_seconds: 60 });
        config.testMode = false;
        try {
          const res = await fetchPaste(id, { 'x-test-now-ms': String(Date.now() + 10 ** 9) });
          assert.equal(res.status, 200);
        } finally {
          config.testMode = true;
        }
      });

      test('concurrent views never exceed max_views', async () => {
        const id = await newPaste({ content: 'x', max_views: 5 });
        const results = await Promise.all(Array.from({ length: 40 }, () => fetchPaste(id)));
        const ok = results.filter((r) => r.status === 200);
        assert.equal(ok.length, 5);
        assert.equal(results.filter((r) => r.status === 404).length, 35);
        assert.deepEqual(ok.map((r) => r.body.remaining_views).sort(), [0, 1, 2, 3, 4]);
      });

      test('unknown and malformed ids return 404 JSON', async () => {
        for (const id of ['aaaaaaaaaa', 'nope', '../../etc', '%27%20OR%201=1', 'x'.repeat(500)]) {
          const res = await fetchPaste(id);
          assert.equal(res.status, 404, id);
          assert.equal(typeof res.body.error, 'string');
        }
      });

      test('HEAD does not consume a view', async () => {
        const id = await newPaste({ content: 'x', max_views: 1 });
        await request(app).head(`/api/pastes/${id}`);
        await request(app).head(`/p/${id}`);
        assert.equal((await fetchPaste(id)).status, 200);
      });
    });

    describe('GET /p/:id (HTML view)', () => {
      test('renders HTML-escaped content', async () => {
        const id = await newPaste({ content: '<script>alert("x")</script> & \'quotes\'' });
        const res = await request(app).get(`/p/${id}`);
        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /text\/html/);
        assert.ok(res.text.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;'));
        assert.ok(!res.text.includes('<script>alert'));
        assert.match(res.headers['content-security-policy'], /default-src 'none'/);
        assert.equal(res.headers['cache-control'], 'no-store');
      });

      test('counts as a view and returns 404 HTML when exhausted', async () => {
        const id = await newPaste({ content: 'secret', max_views: 2 });
        assert.equal((await request(app).get(`/p/${id}`)).status, 200);
        assert.equal((await fetchPaste(id)).body.remaining_views, 0);
        const gone = await request(app).get(`/p/${id}`);
        assert.equal(gone.status, 404);
        assert.match(gone.headers['content-type'], /text\/html/);
        assert.ok(!gone.text.includes('secret'));
      });

      test('returns 404 for expired paste (x-test-now-ms)', async () => {
        const t0 = 1_700_000_000_000;
        const id = await newPaste({ content: 'x', ttl_seconds: 5 }, { 'x-test-now-ms': String(t0) });
        assert.equal((await request(app).get(`/p/${id}`).set('x-test-now-ms', String(t0 + 4999))).status, 200);
        assert.equal((await request(app).get(`/p/${id}`).set('x-test-now-ms', String(t0 + 5000))).status, 404);
      });

      test('returns 404 for unknown id', async () => {
        assert.equal((await request(app).get('/p/doesnotexist')).status, 404);
      });
    });

    test('unknown API routes return 404 JSON', async () => {
      const res = await request(app).get('/api/nope');
      assert.equal(res.status, 404);
      assert.equal(typeof res.body.error, 'string');
    });
  });
}
