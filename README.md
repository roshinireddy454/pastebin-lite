# Pastebin Lite

Store text, get a shareable link, view it through that link. A paste can optionally expire
**after a time limit**, **after a number of views**, or both (whichever comes first).

**Stack:** Node.js + Express (API and server-rendered paste page) · React + Vite (create UI) · PostgreSQL (Neon) · Vercel or Render.

## API

| Method & path | Description |
| --- | --- |
| `GET /api/healthz` | `200 {"ok": true}` when the app and database are reachable, `503 {"ok": false}` otherwise. |
| `POST /api/pastes` | Create a paste. Returns `201 {"id", "url"}`. |
| `GET /api/pastes/:id` | Fetch a paste as JSON. **Counts as one view.** |
| `GET /p/:id` | HTML page showing the paste. **Counts as one view.** |

### `POST /api/pastes`

```json
{ "content": "Hello!", "ttl_seconds": 600, "max_views": 3 }
```

- `content`: required, non-empty string (not only whitespace), at most 512 KB. Stored exactly as sent.
- `ttl_seconds`: optional integer ≥ 1. The paste expires `ttl_seconds` after creation.
- `max_views`: optional integer ≥ 1.
- Omitting a limit, or sending `null`, means no limit.

Response `201`: `{ "id": "9TYwqfqDQ7", "url": "https://<host>/p/9TYwqfqDQ7" }`

Errors are JSON, `{ "error": "<message>" }`: `400` for invalid input or malformed JSON, `413` for content that is too large.

### `GET /api/pastes/:id`

Response `200`:

```json
{ "content": "Hello!", "remaining_views": 2, "expires_at": "2026-11-24T05:24:01.000Z" }
```

- `remaining_views`: views left after this one (`null` if unlimited).
- `expires_at`: ISO 8601 UTC (`null` if the paste never expires).
- `404 {"error": "Paste not found"}` when the paste doesn't exist, has expired, or has used all its views.
  All three cases return the same response on purpose, so a client can't tell which one applied.

### Deterministic time for testing

With `TEST_MODE=1`, a request header `x-test-now-ms: <epoch milliseconds>` is used as "now" for
creation and expiry checks, so expiry can be tested without waiting. Outside test mode the header is ignored.

## Design decisions (interview notes)

**Data model**: one table:

```sql
pastes(id VARCHAR(16) PK, content TEXT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NULL,
       max_views INTEGER NULL, view_count INTEGER DEFAULT 0)
```

`expires_at` is computed once at creation (`now + ttl`), so the expiry check is a simple comparison.
`NULL` means "no limit". The table is created automatically on first use (`CREATE TABLE IF NOT EXISTS`).

**Unique URLs**: IDs are 10 characters from a 57-character alphabet with look-alikes removed
(0/O, 1/l/I), generated with `crypto.randomInt`. That gives about 3.6×10¹⁷ combinations, so IDs
can't be guessed or enumerated, unlike auto-increment IDs. The primary key enforces uniqueness,
and the code retries on the (practically impossible) collision.

**View limits under concurrency**: the core of the solution. Reading the row, checking it and then
updating it would be a race: two simultaneous requests could both see `view_count = 2 < 3` and both
succeed. Instead, each view is **one atomic statement**:

```sql
UPDATE pastes SET view_count = view_count + 1
 WHERE id = $1
   AND (expires_at IS NULL OR expires_at > $now)
   AND (max_views  IS NULL OR view_count < max_views)
RETURNING content, expires_at, max_views, view_count;
```

Postgres takes a row lock for the update. A concurrent update waits, then re-evaluates the `WHERE`
against the new row, so at most `max_views` requests can ever match. No row means "unavailable".
Tested: 200 parallel requests against a 10-view paste return exactly 10 × `200` and 190 × `404`.
Expired requests don't consume views, because the expiry check is in the same `WHERE`.

**Expiry** is checked lazily, at read time. No background job is needed, which suits serverless
hosting where nothing runs between requests. Expired rows stay in the table but can never be
returned. A cleanup job (`DELETE … WHERE expires_at < now()`) could be added as maintenance.

**Caching**: every paste response sends `Cache-Control: no-store`. Otherwise a CDN or browser
could serve a cached copy, bypassing the view counter and expiry.

**Security**: content is HTML-escaped on the server, and the paste page sends a strict CSP that
allows no scripts. Pasted `<script>` therefore displays as text and never runs. React escapes by default.
`HEAD` requests return `405` so link checkers and unfurlers can't use up views. Input is
validated strictly (`"10"` or `1.5` are rejected, not coerced) and the body size is limited.

**Why the paste page is server-rendered**: `/p/:id` returns complete HTML, so the content
is visible to any client, including automated tests and `curl`, without running JavaScript.
It's also one request, so it counts exactly one view.

**Storage abstraction**: `src/db/postgres.js` and `src/db/memory.js` implement the same interface.
The test suite runs against both. Without `DATABASE_URL` the app falls back to memory for local
development (with a warning). That fallback is not suitable for production: on serverless every
instance would have its own memory.

## Project structure

```
api/index.js          Vercel serverless entry (exports the Express app)
src/server.js         Long-running server entry (Render/Railway/local)
src/app.js            Express app: middleware, routes, error handling
src/routes/api.js     /api/healthz, /api/pastes, /api/pastes/:id
src/routes/pasteView.js  /p/:id HTML page
src/pastes.js         Business logic: create + view
src/db/               Postgres and in-memory stores
src/lib/              ID generation, validation, time, errors
src/views/            HTML rendering for /p/:id
client/               React (Vite) frontend
test/api.test.js      API contract, edge-case and concurrency tests
```

## Run locally

```bash
npm install
cp .env.example .env          # optional; without DATABASE_URL, data is kept in memory
npm run build                 # build the React app (served by Express)
DATABASE_URL=postgres://... npm start     # http://localhost:3000
```

For frontend hot reload, run `npm run dev` (API on :3000) and `npm run dev:client` (Vite on :5173, which proxies to the API).

## Tests

```bash
npm test                                                     # in-memory store
TEST_DATABASE_URL=postgres://user:pass@localhost/db npm test # also against real Postgres
```

## Deploy

### Vercel + Neon (recommended)

1. Create a Neon project and copy the **pooled** connection string.
2. Import this repository in Vercel (the framework preset can stay "Other"; `vercel.json` sets the build).
3. Add environment variables: `DATABASE_URL` = the Neon string, and `TEST_MODE` = `1` if the graders need `x-test-now-ms`.
4. Deploy, then check `https://<app>.vercel.app/api/healthz`.

`vercel.json` serves the React build from the CDN and routes `/api/*` and `/p/*` to the Express function.

### Render (alternative)

Create a Web Service: build command `npm install && npm run build`, start command `npm start`, and set the same environment variables.
