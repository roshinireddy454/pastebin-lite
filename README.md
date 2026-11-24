# Pastebin Lite

A full-stack web application for sharing text and code through a link. Paste anything, get a unique URL,
and optionally have the paste expire **after a set time**, **after a number of views**, or both, whichever
comes first. Accounts add private pastes, a personal dashboard and a public profile.

**Live demo:** https://pastebin-lite-delta-three.vercel.app

---

## Notes for reviewers

**Core requirements:** creating a paste, a unique shareable link, viewing it, time-based expiry and
view-count expiry are all implemented. Expired, used-up and unknown pastes return `404`.
View limits are enforced with a single atomic SQL statement, so they hold under concurrent requests
(see [Enforcing view limits safely](#enforcing-view-limits-safely)).

**Testing the API directly:** no login is needed for the core endpoints.

```bash
curl -s https://pastebin-lite-delta-three.vercel.app/api/healthz
curl -s -H 'Content-Type: application/json' -d '{"content":"Hello","ttl_seconds":600,"max_views":3}' \
  https://pastebin-lite-delta-three.vercel.app/api/pastes
curl -s https://pastebin-lite-delta-three.vercel.app/api/pastes/<id>
```

With `TEST_MODE=1` (enabled on the deployment), the `x-test-now-ms` header sets the current time for
expiry checks; see [Testing expiry deterministically](#testing-expiry-deterministically).

**Beyond the brief:** a user account service (sign up, log in, log out with secure server-side
sessions), private and password-protected pastes, editing and deleting your own pastes, a dashboard,
a public archive with search, user profiles, syntax highlighting, and light/dark themes.
On the website, creating a paste requires an account; the API keeps anonymous creation so the core
behaviour can be tested without logging in. All account features can also be tested through the API:
see [Testing accounts through the API](#testing-accounts-through-the-api).

**Possible next steps:** if useful, I can add **JWT (token-based) authentication** for API clients
alongside the session cookies, and **email verification** at sign-up with password reset by email.

**Quality:** 93 automated tests, each run against both the PostgreSQL and in-memory stores
(`npm test`; see [Tests](#tests)).

---

## Features

**Pastes**
- **Create and share**: store any text (up to 512 KB) and get an unguessable, shareable link. No account needed.
- **Time-based expiry**: presets (10 minutes to 1 week) or any custom duration.
- **View-based expiry**: a maximum number of views, including one-click **burn after read**.
- **Correct under concurrency**: a view limit is never exceeded, even when many requests arrive at the same moment.
- **Titles and syntax highlighting** for 23 languages, with line numbers.
- **Visibility**: *unlisted* (link only, the default), *public* (listed in the archive) or *private* (owner only).
- **Password protection**: viewers must enter a password; failed attempts don't use up views.
- **Paste tools**: copy, download, raw text view, and *clone* into a new paste.
- **Editing**: owners can change the title, content, language, visibility and password. Expiry and
  view limits are fixed at creation, and edits never reset or use up views.

**Accounts**
- **Sign up / log in / log out** with secure, server-side sessions.
- **Guests can view, members create**: anyone with a link can view a paste; creating, editing and deleting
  on the website requires an account, so every paste made there has an owner who can manage it.
- **Dashboard**: all your pastes with views, expiry and status (active, expired, views used up), with stats, edit and delete.
- **Public profile** at `/u/<username>` listing a user's public pastes.
- **Public archive** of recent public pastes, with search.

**Experience and security**
- **Safe rendering**: pasted HTML or scripts are always shown as text and never executed.
- **Light and dark themes**: follows the system setting, with a toggle remembered across pages.
- **Responsive UI** for desktop and mobile.

## Tech stack

| Layer | Technology | Why |
| --- | --- | --- |
| Backend | Node.js, Express | Small, well-understood HTTP layer with explicit routing and error handling |
| Frontend | React, React Router, Vite | Component-based UI with client-side routing; fast builds |
| Syntax highlighting | highlight.js (server-side) | Paste pages work without client-side JavaScript |
| Auth | Server-side sessions, scrypt | No extra dependencies; sessions can be revoked instantly |
| Database | PostgreSQL (Neon) | Transactions and row-level locking make view counting reliable |
| Hosting | Vercel | Static frontend on the CDN, Express API as a serverless function |
| Tests | Node.js test runner, Supertest | No extra framework; tests exercise the real HTTP layer |

---

## API

All API responses are JSON. Errors have the form `{ "error": "<message>" }`.

### Health check

```
GET /api/healthz
```

Returns `200 { "ok": true }` when the application and database are reachable, otherwise `503 { "ok": false }`.

### Create a paste

```
POST /api/pastes
Content-Type: application/json

{ "content": "Hello, world!", "ttl_seconds": 600, "max_views": 3 }
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `content` | string | yes | Non-empty (not only whitespace), at most 512 KB. Stored exactly as sent. |
| `ttl_seconds` | integer | no | ≥ 1. The paste expires this many seconds after creation. |
| `max_views` | integer | no | ≥ 1. The paste can be viewed this many times. |

Omitting a limit, or sending `null`, means no limit.

**`201 Created`**

```json
{ "id": "9TYwqfqDQ7", "url": "https://pastebin-lite-delta-three.vercel.app/p/9TYwqfqDQ7" }
```

**Errors:** `400` for invalid input or malformed JSON, `413` when the content is too large.

### Fetch a paste

```
GET /api/pastes/:id
```

Each successful request **counts as one view**.

**`200 OK`**

```json
{ "content": "Hello, world!", "remaining_views": 2, "expires_at": "2026-11-24T05:24:01.000Z" }
```

- `remaining_views`: views left after this one, or `null` if unlimited.
- `expires_at`: ISO 8601 timestamp (UTC), or `null` if the paste never expires.

**`404 Not Found`** when the paste does not exist, has expired, or has no views left. All three cases
return the same response on purpose, so a client cannot learn which one applied.

### View a paste in the browser

```
GET /p/:id
```

Returns a server-rendered HTML page with the paste content (also counts as one view), or a
"Paste not available" page with status `404`.

### Optional fields when creating a paste

All of these are optional. Requests that only send `content`, `ttl_seconds` and `max_views` behave exactly as described above.

| Field | Type | Rules |
| --- | --- | --- |
| `title` | string | Up to 100 characters. |
| `language` | string | One of the supported language ids (e.g. `python`, `javascript`), default `plaintext`. |
| `visibility` | string | `unlisted` (default), `public`, or `private` (requires login). |
| `password` | string | Up to 128 characters. Required to view the paste. |

For a password-protected paste, `GET /api/pastes/:id` returns `401` unless the request includes the
header `x-paste-password: <password>`. A failed attempt does not count as a view.

### Accounts and listings

| Method & path | Description |
| --- | --- |
| `POST /api/auth/signup` | `{ username, email, password }`. Creates an account and logs in. `409` if taken. |
| `POST /api/auth/login` | `{ login, password }`, where `login` is a username or email. |
| `POST /api/auth/logout` | Ends the session. |
| `GET /api/auth/me` | `{ user }`, or `{ user: null }` when logged out. |
| `GET /api/me/pastes?page=N` | Your pastes, including expired ones, plus totals. Requires login. |
| `GET /api/pastes/:id/edit` | Full paste data for the edit form (owner only; doesn't count as a view). |
| `PATCH /api/pastes/:id` | Edit your paste: any of `title`, `content`, `language`, `visibility`, `password` (`null` removes it). Requires login. |
| `DELETE /api/pastes/:id` | Delete one of your pastes. Requires login. |
| `GET /api/public/pastes?q=&page=N` | Public archive: active public pastes, newest first, searchable by title. |
| `GET /api/users/:username` | A user's profile and public pastes. |
| `GET /raw/:id` | The paste as plain text (counts as a view). Add `?download=1` to download it. |

Listing endpoints return summaries only (never the content) and **never count as views**.

### Testing accounts through the API

Every account feature can be exercised without the website. The session is a cookie, so `curl` keeps it
in a cookie file (`-c` saves it, `-b` sends it):

```bash
BASE=https://pastebin-lite-delta-three.vercel.app

# Sign up (also logs in). Use any new username/email.
curl -s -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"username":"reviewer1","email":"reviewer1@example.com","password":"password123"}' \
  $BASE/api/auth/signup

# Create a private, titled paste as that user
curl -s -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"content":"Hello","title":"Demo","language":"plaintext","visibility":"private"}' \
  $BASE/api/pastes
# -> {"id":"<ID>","url":"..."}

curl -s $BASE/api/pastes/<ID>                      # anonymous: 404 (private)
curl -s -b cookies.txt $BASE/api/pastes/<ID>       # owner: 200

# Edit, list, delete (owner only)
curl -s -b cookies.txt -X PATCH -H 'Content-Type: application/json' \
  -d '{"content":"Hello again","visibility":"public"}' $BASE/api/pastes/<ID>
curl -s -b cookies.txt $BASE/api/me/pastes
curl -s -b cookies.txt -X DELETE -o /dev/null -w '%{http_code}\n' $BASE/api/pastes/<ID>   # 204

# Log out
curl -s -b cookies.txt -X POST -o /dev/null -w '%{http_code}\n' $BASE/api/auth/logout    # 204
```

Requests without a session behave exactly as in the core API: anonymous `POST /api/pastes` still works.

### Testing expiry deterministically

When the server runs with `TEST_MODE=1`, the request header `x-test-now-ms: <epoch milliseconds>` is used
as the current time for creating pastes and checking expiry. This lets automated tests check time-based
expiry without waiting. Without `TEST_MODE=1`, the header is ignored.

---

## How it works

### Data model

```sql
users    (id, username, email, password_hash, created_at)
         -- unique indexes on lower(username) and lower(email)
sessions (token_hash PRIMARY KEY, user_id → users, created_at, expires_at)
pastes   (id PRIMARY KEY, content, created_at,
          expires_at,          -- NULL = never expires
          max_views,           -- NULL = unlimited views
          view_count,
          title, language,
          visibility,          -- 'unlisted' | 'public' | 'private'
          password_hash,       -- NULL = no password
          user_id → users)     -- NULL = created anonymously
```

`expires_at` is computed once at creation (`created_at + ttl_seconds`), so checking expiry is a single
comparison. Partial and composite indexes serve the archive (`created_at` where public) and the
dashboard (`user_id, created_at`).

The schema is created and upgraded automatically on startup with idempotent statements
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), run under a Postgres advisory lock so that
several serverless instances starting at once don't race each other.

### Generating unique links

Each paste gets a 10-character ID from a 57-character, URL-safe alphabet without look-alike characters
(`0/O`, `1/l/I`), generated with Node's cryptographically secure `crypto.randomInt`. That gives about
3.6 × 10¹⁷ possible IDs, so links cannot be guessed or enumerated, unlike sequential IDs. The primary key
guarantees uniqueness, and in the extremely unlikely event of a collision the server retries with a new ID.

### Enforcing view limits safely

A naive implementation reads the paste, checks the view count, then writes the new count. Under
concurrent requests, two readers could both see "2 of 3 views used" and both be allowed through.

Instead, recording a view is **one atomic SQL statement**:

```sql
UPDATE pastes
   SET view_count = view_count + 1
 WHERE id = $1
   AND (expires_at IS NULL OR expires_at > $now)
   AND (max_views  IS NULL OR view_count < max_views)
RETURNING content, expires_at, max_views, view_count;
```

PostgreSQL locks the row for the update. A concurrent request waits, then re-checks the `WHERE`
condition against the updated row, so no more than `max_views` requests can ever succeed. If no row is
returned, the paste is unavailable and the API responds with `404`.

Verified under load: 200 simultaneous requests for a paste with `max_views = 10` produced exactly
10 successful responses and 190 `404`s.

Because the expiry check is part of the same condition, requests for an expired paste never use up views.

### Access control

Opening a paste runs the access rules **before** any view is counted:

1. Missing, expired or used up → `404`.
2. Private, and the viewer isn't the owner → `404`, the same response as a missing paste, so its existence isn't revealed.
3. Password-protected, and the viewer isn't the owner → `401` until the right password is supplied.
   Passwords are checked against a scrypt hash, and attempts are rate-limited.
4. Only then is the view recorded with the atomic `UPDATE` above. If a concurrent request took the last
   view in between, the update matches no row and the result is `404`.

### Accounts and sessions

- Passwords are hashed with **scrypt** (memory-hard, built into Node.js), using a random salt per password
  and a constant-time comparison.
- Logging in creates a random 256-bit session token, sent in an **HttpOnly, SameSite=Lax** cookie
  (`Secure` over HTTPS). JavaScript can't read it, and the browser won't send it on cross-site form posts,
  which protects the state-changing endpoints against CSRF.
- The database stores only the **SHA-256 hash** of each token, so a leaked database contains no usable sessions.
  Sessions are server-side, so logging out revokes them immediately.
- A failed login returns the same message whether or not the user exists, and takes the same time
  (a dummy hash check), so accounts can't be discovered. Login attempts are rate-limited per IP and account.
- After login, redirects only go to paths on this site (no open redirects).

### Website vs. API: who can create pastes

The website asks visitors to log in before creating a paste, and editing or deleting always requires
being the owner. The public `POST /api/pastes` endpoint still accepts anonymous requests, because it is
the documented integration API (scripts, CLI tools and automated tests create pastes without a browser
session). Anonymous pastes have no owner, so nobody can edit or delete them; they simply expire.

### Editing

Only the owner can edit, and only while the paste is still active. The update runs as one `UPDATE … WHERE
id = $1 AND user_id = $2 AND <still active>`, so ownership and availability are checked atomically.
Expiry time, view limit and view count are deliberately not editable: they are a promise to the people the
link was shared with (for example, "this can be read once"). Edits set `updated_at`, shown as "Edited" on the paste page.

### Expiry

Expiry is checked when a paste is read, not by a background job. This keeps the system simple and fits
serverless hosting, where no process runs between requests. Expired rows can never be returned.
A periodic `DELETE FROM pastes WHERE expires_at < now()` could be added to reclaim storage.

### Caching

Every paste response includes `Cache-Control: no-store`. Without it, a CDN or browser could serve a
cached copy, bypassing both the view counter and expiry.

### Security

- Paste content is HTML-escaped on the server (or by highlight.js when highlighting) before rendering.
- The paste page sends a strict Content-Security-Policy. The only script allowed is the page's own
  script (theme toggle, copy, download, clone), identified by its SHA-256 hash, so nothing inside a paste
  can ever execute. The raw endpoint is served as `text/plain` with a sandboxing CSP.
- `HEAD` requests to paste URLs return `405`, so link checkers and chat-app link previews cannot use up views.
- Input is validated strictly: values like `"10"` or `1.5` are rejected rather than silently converted,
  and request bodies are size-limited.

### Why the paste page is server-rendered

`/p/:id` returns complete HTML from the server, so the content is visible to any client (browsers, `curl`,
automated checks) without running JavaScript. It is also a single request, so it counts as exactly one view.

### Storage abstraction

`src/db/postgres.js` and `src/db/memory.js` implement the same interface, and the test suite runs against
both. Without `DATABASE_URL`, the app uses in-memory storage for local development. In-memory storage is
not suitable for production on serverless hosting, because each instance would have separate memory.

---

## Project structure

```
api/index.js              Vercel serverless entry point (exports the Express app)
src/
  server.js               Standalone server entry point (local / Render / Railway)
  app.js                  Express app: middleware, routing, error handling
  config.js               Environment configuration and limits
  pastes.js               Core logic: create, access rules, view counting
  auth.js                 Sessions: cookie handling, loading the current user
  routes/api.js           Paste API, listings, delete
  routes/auth.js          Sign up, log in, log out
  routes/pasteView.js     /p/:id (HTML + password form) and /raw/:id
  views/pasteHtml.js      Server-rendered paste pages
  db/                     PostgreSQL and in-memory stores (same interface)
  lib/                    Validation, passwords, IDs, languages, rate limiting, time
client/src/
  pages/                  Create, edit, log in / sign up, dashboard, archive, profile
  components/             Layout (navigation, user menu), shared form fields, paste lists
test/
  api.test.js             Core API contract, edge cases and concurrency
  features.test.js        Accounts, visibility, passwords, listings, editing, delete, raw, highlighting
vercel.json               Vercel build and routing configuration
```

---

## Running locally

Requires Node.js 18 or newer.

```bash
npm install
npm run build          # build the React frontend
npm start              # http://localhost:3000
```

To use PostgreSQL locally, copy `.env.example` to `.env`, set `DATABASE_URL`, then run:

```bash
node --env-file=.env src/server.js
```

For development with live reload, run the API and the frontend in two terminals:

```bash
npm run dev            # API on http://localhost:3000
npm run dev:client     # UI on http://localhost:5173 (proxies API calls)
```

### Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Use Neon's pooled connection string in production. |
| `TEST_MODE` | Set to `1` to enable the `x-test-now-ms` header for deterministic expiry testing. |
| `PUBLIC_BASE_URL` | Optional. Overrides the origin used in generated share links. |
| `PORT` | Port for the standalone server (default `3000`). |

---

## Tests

```bash
npm test                                                        # in-memory store
TEST_DATABASE_URL=postgres://user:pass@localhost/db npm test    # also against PostgreSQL
```

The suite has 93 tests, run against each storage backend. They cover:

- creating and fetching pastes, with exact content preservation (Unicode, whitespace, HTML)
- input validation (missing, empty or wrongly typed fields, out-of-range values, malformed JSON, oversized bodies)
- view limits, including `remaining_views` counting down and `404` once used up
- time expiry at the exact boundary, using `x-test-now-ms`
- combined limits, where whichever is reached first applies
- concurrency (40 parallel requests never exceed `max_views`)
- accounts: sign-up validation, case-insensitive uniqueness, login by username or email, logout,
  identical errors for unknown users, rate limiting, forged cookies
- private pastes (owner only), password protection (API and HTML form; failed attempts don't use views)
- dashboard, archive (visibility filtering, search with literal `%` and `_`), profiles, and owner-only delete
- editing: owner-only, doesn't use views, adding/removing passwords, no edits to expired or anonymous pastes
- raw view and download, syntax highlighting with line numbers, HTML escaping, CSP script hash, `HEAD` handling

---

## Deployment

The app is deployed on **Vercel**, with a **Neon** PostgreSQL database.

1. Create a Neon project and copy the **pooled** connection string.
2. Import the repository into Vercel with the **Other** framework preset. `vercel.json` already defines
   the build command, output directory and routing.
3. Set the environment variables `DATABASE_URL` and `TEST_MODE=1`.
4. Deploy. Vercel serves the React build from its CDN and routes `/api/*` and `/p/*` to the Express function.

The app also runs unchanged on any Node.js host such as Render or Railway. Use the build command
`npm install && npm run build` and the start command `npm start`.
