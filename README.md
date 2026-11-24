# Pastebin Lite

A small, fast web application for sharing text through a link. Paste any text, get a unique URL, and
optionally have the paste expire **after a set time**, **after a number of views**, or both, whichever
comes first.

**Live demo:** https://pastebin-lite-delta-three.vercel.app

---

## Features

- **Create and share**: store any text (up to 512 KB) and get an unguessable, shareable link.
- **Time-based expiry**: the paste becomes unavailable after a chosen duration.
- **View-based expiry**: the paste becomes unavailable after a chosen number of views.
- **Combined limits**: whichever limit is reached first applies.
- **Correct under concurrency**: a view limit is never exceeded, even when many requests arrive at the same moment.
- **Safe rendering**: pasted HTML or scripts are always shown as plain text and never executed.
- **Light and dark themes**: follows the system setting, with a toggle that is remembered across pages.
- **Responsive UI**: works on desktop and mobile.

## Tech stack

| Layer | Technology | Why |
| --- | --- | --- |
| Backend | Node.js, Express | Small, well-understood HTTP layer with explicit routing and error handling |
| Frontend | React, Vite | Fast to build and load; the UI is a single interactive form |
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

### Testing expiry deterministically

When the server runs with `TEST_MODE=1`, the request header `x-test-now-ms: <epoch milliseconds>` is used
as the current time for creating pastes and checking expiry. This lets automated tests check time-based
expiry without waiting. Without `TEST_MODE=1`, the header is ignored.

---

## How it works

### Data model

A single table:

```sql
CREATE TABLE pastes (
  id          VARCHAR(16) PRIMARY KEY,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ,              -- NULL = never expires
  max_views   INTEGER,                  -- NULL = unlimited views
  view_count  INTEGER     NOT NULL DEFAULT 0
);
```

`expires_at` is computed once at creation (`created_at + ttl_seconds`), so checking expiry is a single
comparison. The table is created automatically on first use.

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

### Expiry

Expiry is checked when a paste is read, not by a background job. This keeps the system simple and fits
serverless hosting, where no process runs between requests. Expired rows can never be returned.
A periodic `DELETE FROM pastes WHERE expires_at < now()` could be added to reclaim storage.

### Caching

Every paste response includes `Cache-Control: no-store`. Without it, a CDN or browser could serve a
cached copy, bypassing both the view counter and expiry.

### Security

- Paste content is HTML-escaped on the server before rendering.
- The paste page sends a strict Content-Security-Policy. The only script allowed is the page's own
  theme/copy script, identified by its SHA-256 hash, so nothing inside a paste can ever execute.
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
  pastes.js               Core logic: create and view pastes
  routes/api.js           /api/healthz, /api/pastes, /api/pastes/:id
  routes/pasteView.js     /p/:id HTML page
  views/pasteHtml.js      HTML rendering for the paste page
  db/                     PostgreSQL and in-memory stores
  lib/                    ID generation, validation, time handling, errors
client/                   React frontend (Vite)
test/api.test.js          API, edge-case and concurrency tests
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

The suite has 47 tests, run against each storage backend. They cover:

- creating and fetching pastes, with exact content preservation (Unicode, whitespace, HTML)
- input validation (missing, empty or wrongly typed fields, out-of-range values, malformed JSON, oversized bodies)
- view limits, including `remaining_views` counting down and `404` once used up
- time expiry at the exact boundary, using `x-test-now-ms`
- combined limits, where whichever is reached first applies
- concurrency (40 parallel requests never exceed `max_views`)
- HTML escaping, the Content-Security-Policy, the theme cookie and `HEAD` handling

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
