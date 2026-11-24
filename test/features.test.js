// Tests for accounts, visibility, password protection, listings, deletion, raw view and highlighting.
// Runs against the in-memory store, and also against Postgres when TEST_DATABASE_URL is set.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import request from 'supertest';

process.env.TEST_MODE = '1';
const { rateLimits } = await import('../src/config.js');
rateLimits.signup.max = 10_000; // this suite creates many accounts; the login limit stays as configured
const { createApp } = await import('../src/app.js');
const { createMemoryStore } = await import('../src/db/memory.js');
const { createPostgresStore } = await import('../src/db/postgres.js');

const backends = [['memory', () => createMemoryStore()]];
if (process.env.TEST_DATABASE_URL) {
  backends.push(['postgres', () => createPostgresStore(process.env.TEST_DATABASE_URL)]);
}

// Unique names per run so Postgres tests can be re-run against the same database.
const uniq = () => randomBytes(4).toString('hex');

for (const [name, makeStore] of backends) {
  describe(`[${name}] features`, () => {
    let store, app;
    before(() => {
      store = makeStore();
      app = createApp(store);
    });
    after(() => store.close());

    async function signup(agent = request.agent(app), overrides = {}) {
      const u = uniq();
      const body = { username: `user_${u}`, email: `u${u}@example.com`, password: 'correct-horse', ...overrides };
      const res = await agent.post('/api/auth/signup').send(body);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return { agent, user: res.body.user, ...body };
    }
    const createAs = async (agent, body, headers = {}) => {
      const res = await agent.post('/api/pastes').set(headers).send(body);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.id;
    };

    describe('accounts', () => {
      test('signup logs in with a secure session cookie', async () => {
        const agent = request.agent(app);
        const u = uniq();
        const res = await agent.post('/api/auth/signup').send({ username: `Ana_${u}`, email: `ANA${u}@Example.com`, password: 'password123' });
        assert.equal(res.status, 201);
        assert.equal(res.body.user.username, `Ana_${u}`);
        assert.equal(res.body.user.email, `ana${u}@example.com`);
        const cookie = res.headers['set-cookie'].join(';');
        assert.match(cookie, /sid=[\w-]{43}/);
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Lax/);
        const me = await agent.get('/api/auth/me');
        assert.equal(me.body.user.username, `Ana_${u}`);
      });

      test('usernames and emails are unique, case-insensitively', async () => {
        const { username, email } = await signup();
        const dupName = await request(app).post('/api/auth/signup').send({ username: username.toUpperCase(), email: `x${uniq()}@example.com`, password: 'password123' });
        assert.equal(dupName.status, 409);
        const dupEmail = await request(app).post('/api/auth/signup').send({ username: `x_${uniq()}`, email: email.toUpperCase(), password: 'password123' });
        assert.equal(dupEmail.status, 409);
      });

      const badSignups = [
        ['short username', { username: 'ab' }],
        ['username with spaces', { username: 'a b c' }],
        ['reserved username', { username: 'admin' }],
        ['invalid email', { email: 'not-an-email' }],
        ['short password', { password: 'short' }],
        ['non-string password', { password: 12345678 }],
      ];
      for (const [label, override] of badSignups) {
        test(`rejects signup: ${label}`, async () => {
          const res = await request(app).post('/api/auth/signup')
            .send({ username: `ok_${uniq()}`, email: `ok${uniq()}@example.com`, password: 'password123', ...override });
          assert.equal(res.status, 400);
          assert.equal(typeof res.body.error, 'string');
        });
      }

      test('login by username or email; logout ends the session', async () => {
        const { username, email, password } = await signup();
        const a = request.agent(app);
        assert.equal((await a.post('/api/auth/login').send({ login: username, password })).status, 200);
        assert.equal((await a.get('/api/auth/me')).body.user.username, username);
        assert.equal((await a.post('/api/auth/logout')).status, 204);
        assert.equal((await a.get('/api/auth/me')).body.user, null);

        const b = request.agent(app);
        assert.equal((await b.post('/api/auth/login').send({ login: email.toUpperCase(), password })).status, 200);
      });

      test('wrong password and unknown user give the same 401', async () => {
        const { username } = await signup();
        const wrong = await request(app).post('/api/auth/login').send({ login: username, password: 'nope-nope' });
        const unknown = await request(app).post('/api/auth/login').send({ login: `ghost_${uniq()}`, password: 'nope-nope' });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.equal(wrong.body.error, unknown.body.error);
      });

      test('repeated failed logins are rate limited', async () => {
        const login = `target_${uniq()}`;
        let last;
        for (let i = 0; i < 11; i++) last = await request(app).post('/api/auth/login').send({ login, password: 'guess-guess' });
        assert.equal(last.status, 429);
        assert.ok(Number(last.headers['retry-after']) > 0);
      });

      test('a forged session cookie is treated as logged out', async () => {
        const res = await request(app).get('/api/auth/me').set('Cookie', `sid=${'A'.repeat(43)}`);
        assert.equal(res.body.user, null);
      });
    });

    describe('paste options', () => {
      test('title, language and visibility are stored; core API response shape is unchanged', async () => {
        const { agent } = await signup();
        const id = await createAs(agent, { content: 'print(1)', title: 'Hello', language: 'python', visibility: 'public', max_views: 5 });
        const res = await request(app).get(`/api/pastes/${id}`);
        assert.deepEqual(Object.keys(res.body).sort(), ['content', 'expires_at', 'remaining_views']);
      });

      const badOptions = [
        ['unknown language', { language: 'klingon' }],
        ['unknown visibility', { visibility: 'secret' }],
        ['title too long', { title: 'x'.repeat(101) }],
        ['non-string title', { title: 42 }],
        ['non-string password', { password: 1234 }],
      ];
      for (const [label, extra] of badOptions) {
        test(`rejects ${label}`, async () => {
          const res = await request(app).post('/api/pastes').send({ content: 'x', ...extra });
          assert.equal(res.status, 400);
        });
      }

      test('private pastes require an account', async () => {
        const res = await request(app).post('/api/pastes').send({ content: 'x', visibility: 'private' });
        assert.equal(res.status, 400);
      });
    });

    describe('private pastes', () => {
      test('only the owner can view; everyone else gets 404', async () => {
        const owner = await signup();
        const other = await signup();
        const id = await createAs(owner.agent, { content: 'secret', visibility: 'private' });

        assert.equal((await request(app).get(`/api/pastes/${id}`)).status, 404);
        assert.equal((await other.agent.get(`/api/pastes/${id}`)).status, 404);
        assert.equal((await request(app).get(`/p/${id}`)).status, 404);
        const mine = await owner.agent.get(`/api/pastes/${id}`);
        assert.equal(mine.status, 200);
        assert.equal(mine.body.content, 'secret');
      });
    });

    describe('password-protected pastes', () => {
      test('API requires the password, and failed attempts do not use views', async () => {
        const id = await createAs(request(app), { content: 'hidden', password: 's3cret', max_views: 2 });
        const none = await request(app).get(`/api/pastes/${id}`);
        assert.equal(none.status, 401);
        const wrong = await request(app).get(`/api/pastes/${id}`).set('x-paste-password', 'nope');
        assert.equal(wrong.status, 401);
        const ok = await request(app).get(`/api/pastes/${id}`).set('x-paste-password', 's3cret');
        assert.equal(ok.status, 200);
        assert.equal(ok.body.content, 'hidden');
        assert.equal(ok.body.remaining_views, 1);
      });

      test('HTML view shows an unlock form, then the content after the right password', async () => {
        const id = await createAs(request(app), { content: 'TOPSECRET <b>text</b>', password: 'open sesame', max_views: 1 });
        const form = await request(app).get(`/p/${id}`);
        assert.equal(form.status, 200);
        assert.match(form.text, /Password required/);
        assert.ok(!form.text.includes('TOPSECRET'));

        const wrong = await request(app).post(`/p/${id}`).type('form').send({ password: 'wrong' });
        assert.equal(wrong.status, 401);
        assert.match(wrong.text, /Incorrect password/);

        const ok = await request(app).post(`/p/${id}`).type('form').send({ password: 'open sesame' });
        assert.equal(ok.status, 200);
        assert.ok(ok.text.includes('TOPSECRET &lt;b&gt;text&lt;/b&gt;'));
        assert.equal((await request(app).post(`/p/${id}`).type('form').send({ password: 'open sesame' })).status, 404);
      });

      test('the owner does not need the password', async () => {
        const owner = await signup();
        const id = await createAs(owner.agent, { content: 'mine', password: 'pw-pw-pw' });
        assert.equal((await owner.agent.get(`/api/pastes/${id}`)).status, 200);
      });
    });

    describe('listings', () => {
      test('dashboard lists my pastes with status, without counting views', async () => {
        const { agent } = await signup();
        const t0 = 1_700_000_000_000;
        const a = await createAs(agent, { content: 'a', title: 'First', max_views: 1 });
        const b = await createAs(agent, { content: 'b', title: 'Second', ttl_seconds: 10 }, { 'x-test-now-ms': String(t0) });
        await request(app).get(`/api/pastes/${a}`); // uses the only view
        await createAs(request(app), { content: 'someone else' });

        const res = await agent.get('/api/me/pastes');
        assert.equal(res.status, 200);
        const byId = Object.fromEntries(res.body.pastes.map((p) => [p.id, p]));
        assert.deepEqual(Object.keys(byId).sort(), [a, b].sort());
        assert.equal(byId[a].status, 'used_up');
        assert.equal(byId[a].views, 1);
        assert.equal(byId[b].status, 'expired'); // created at t0 (2023) with a 10s TTL
        assert.equal(byId[b].title, 'Second');
        assert.ok(!('content' in byId[b]));
        assert.deepEqual(res.body.stats, { total: 2, active: 0, views: 1 });
      });

      test('dashboard requires login', async () => {
        assert.equal((await request(app).get('/api/me/pastes')).status, 401);
      });

      test('archive shows only active public pastes, newest first, with search', async () => {
        const { agent, username } = await signup();
        const tag = uniq();
        const pub = await createAs(agent, { content: 'x', title: `Public ${tag}`, visibility: 'public' });
        await createAs(agent, { content: 'x', title: `Unlisted ${tag}`, visibility: 'unlisted' });
        await createAs(agent, { content: 'x', title: `Private ${tag}`, visibility: 'private' });
        const burned = await createAs(agent, { content: 'x', title: `Burned ${tag}`, visibility: 'public', max_views: 1 });
        await request(app).get(`/api/pastes/${burned}`);

        const res = await request(app).get('/api/public/pastes').query({ q: tag });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.pastes.map((p) => p.id), [pub]);
        assert.equal(res.body.pastes[0].author, username);
        assert.equal(res.body.has_more, false);
      });

      test('archive search treats % and _ literally', async () => {
        const tag = uniq();
        await createAs(request(app), { content: 'x', title: `100% sure ${tag}`, visibility: 'public' });
        await createAs(request(app), { content: 'x', title: `1000 sure ${tag}`, visibility: 'public' });
        const res = await request(app).get('/api/public/pastes').query({ q: `0% sure ${tag}` });
        assert.equal(res.body.pastes.length, 1);
      });

      test('profile lists a user\'s public pastes; unknown users are 404', async () => {
        const { agent, username } = await signup();
        const pub = await createAs(agent, { content: 'x', visibility: 'public' });
        await createAs(agent, { content: 'x', visibility: 'unlisted' });
        const res = await request(app).get(`/api/users/${username.toUpperCase()}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.user.username, username);
        assert.ok(!('email' in res.body.user));
        assert.deepEqual(res.body.pastes.map((p) => p.id), [pub]);
        assert.equal((await request(app).get('/api/users/nobody_here_123')).status, 404);
      });
    });

    describe('deleting', () => {
      test('only the owner can delete', async () => {
        const owner = await signup();
        const other = await signup();
        const id = await createAs(owner.agent, { content: 'x' });
        assert.equal((await request(app).delete(`/api/pastes/${id}`)).status, 401);
        assert.equal((await other.agent.delete(`/api/pastes/${id}`)).status, 404);
        assert.equal((await owner.agent.delete(`/api/pastes/${id}`)).status, 204);
        assert.equal((await request(app).get(`/api/pastes/${id}`)).status, 404);
        assert.equal((await owner.agent.delete(`/api/pastes/${id}`)).status, 404);
      });

      test('anonymous pastes cannot be deleted by anyone', async () => {
        const id = await createAs(request(app), { content: 'x' });
        const { agent } = await signup();
        assert.equal((await agent.delete(`/api/pastes/${id}`)).status, 404);
      });
    });

    describe('editing', () => {
      test('owner loads the edit form without using a view, then saves changes', async () => {
        const { agent } = await signup();
        const id = await createAs(agent, { content: 'v1', title: 'Old', language: 'plaintext', max_views: 3 });

        const form = await agent.get(`/api/pastes/${id}/edit`);
        assert.equal(form.status, 200);
        assert.equal(form.body.content, 'v1');
        assert.equal(form.body.views, 0);
        assert.equal(form.body.updated_at, null);

        const saved = await agent.patch(`/api/pastes/${id}`).send({ content: 'v2', title: 'New', language: 'python', visibility: 'public' });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.title, 'New');
        assert.equal(saved.body.language, 'python');
        assert.equal(saved.body.visibility, 'public');
        assert.ok(saved.body.updated_at);

        const view = await request(app).get(`/api/pastes/${id}`);
        assert.equal(view.body.content, 'v2');
        assert.equal(view.body.remaining_views, 2); // edits never reset or use views
        assert.match((await request(app).get(`/p/${id}`)).text, /Edited/);
      });

      test('a password can be added and removed', async () => {
        const { agent } = await signup();
        const id = await createAs(agent, { content: 'x' });
        assert.equal((await agent.patch(`/api/pastes/${id}`).send({ password: 'pw123' })).body.has_password, true);
        assert.equal((await request(app).get(`/api/pastes/${id}`)).status, 401);
        assert.equal((await agent.patch(`/api/pastes/${id}`).send({ password: null })).body.has_password, false);
        assert.equal((await request(app).get(`/api/pastes/${id}`)).status, 200);
      });

      test('only the owner can edit; guests must log in', async () => {
        const owner = await signup();
        const other = await signup();
        const id = await createAs(owner.agent, { content: 'x' });
        assert.equal((await request(app).patch(`/api/pastes/${id}`).send({ content: 'hacked' })).status, 401);
        assert.equal((await request(app).get(`/api/pastes/${id}/edit`)).status, 401);
        assert.equal((await other.agent.patch(`/api/pastes/${id}`).send({ content: 'hacked' })).status, 404);
        assert.equal((await other.agent.get(`/api/pastes/${id}/edit`)).status, 404);
        assert.equal((await request(app).get(`/api/pastes/${id}`)).body.content, 'x');
      });

      test('anonymous pastes cannot be edited by anyone', async () => {
        const id = await createAs(request(app), { content: 'x' });
        const { agent } = await signup();
        assert.equal((await agent.patch(`/api/pastes/${id}`).send({ content: 'y' })).status, 404);
      });

      test('expired or used-up pastes cannot be edited', async () => {
        const { agent } = await signup();
        const id = await createAs(agent, { content: 'x', max_views: 1 });
        await request(app).get(`/api/pastes/${id}`);
        assert.equal((await agent.patch(`/api/pastes/${id}`).send({ content: 'y' })).status, 404);
        assert.equal((await agent.get(`/api/pastes/${id}/edit`)).status, 404);
      });

      const badEdits = [
        ['empty body', {}],
        ['empty content', { content: '   ' }],
        ['unknown language', { language: 'klingon' }],
        ['unknown visibility', { visibility: 'secret' }],
        ['empty password', { password: '' }],
        ['title too long', { title: 'x'.repeat(101) }],
      ];
      for (const [label, body] of badEdits) {
        test(`rejects edit: ${label}`, async () => {
          const { agent } = await signup();
          const id = await createAs(agent, { content: 'x' });
          assert.equal((await agent.patch(`/api/pastes/${id}`).send(body)).status, 400);
        });
      }

      test('the paste page shows Edit and Delete to the owner only', async () => {
        const { agent } = await signup();
        const id = await createAs(agent, { content: 'x' });
        const mine = await agent.get(`/p/${id}`);
        assert.ok(mine.text.includes(`href="/edit/${id}"`));
        assert.ok(mine.text.includes('id="delete"'));
        const theirs = await request(app).get(`/p/${id}`);
        assert.ok(!theirs.text.includes('/edit/'));
        assert.ok(!theirs.text.includes('id="delete"'));
      });
    });

    describe('raw view and rendering', () => {
      test('raw returns plain text, counts a view, and can be downloaded', async () => {
        const id = await createAs(request(app), { content: '<h1>hi</h1>', language: 'html', max_views: 2 });
        const res = await request(app).get(`/raw/${id}`);
        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /^text\/plain/);
        assert.equal(res.text, '<h1>hi</h1>');
        assert.match(res.headers['content-security-policy'], /sandbox/);
        const dl = await request(app).get(`/raw/${id}?download=1`);
        assert.match(dl.headers['content-disposition'], new RegExp(`attachment; filename="${id}\\.html"`));
        assert.equal((await request(app).get(`/raw/${id}`)).status, 404);
      });

      test('raw of a password-protected paste needs the header', async () => {
        const id = await createAs(request(app), { content: 'x', password: 'pw' });
        assert.equal((await request(app).get(`/raw/${id}`)).status, 401);
        assert.equal((await request(app).get(`/raw/${id}`).set('x-paste-password', 'pw')).status, 200);
      });

      test('code is syntax highlighted with line numbers, and still escaped', async () => {
        const id = await createAs(request(app), { content: 'def f():\n    return "<script>"\n', language: 'python', title: 'Snippet' });
        const res = await request(app).get(`/p/${id}`);
        assert.equal(res.status, 200);
        assert.match(res.text, /class="hljs-keyword">def</);
        assert.match(res.text, /<pre class="gutter" aria-hidden="true">1\n2<\/pre>/);
        assert.ok(res.text.includes('&lt;script&gt;'));
        assert.ok(!res.text.includes('"<script>"'));
        assert.match(res.text, /<h1>Snippet<\/h1>/);
      });

      test('page shows the author and links to their profile', async () => {
        const { agent, username } = await signup();
        const id = await createAs(agent, { content: 'x' });
        const res = await request(app).get(`/p/${id}`);
        assert.ok(res.text.includes(`href="/u/${username}"`));
      });
    });
  });
}
