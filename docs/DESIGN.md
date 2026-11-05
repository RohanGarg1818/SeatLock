# Design decisions

Each section says what was chosen, what the alternatives were, and why. File names point at the code. Where something is
not built, it says so: "plan" means described but not implemented, and nothing here is a measured claim unless it links to
[RESULTS.md](RESULTS.md).

## 1. The core problem: taking the last seat

Two people click Register for the last seat at the same instant. The naive code is:

```
seats = SELECT seats_left FROM events WHERE id = 1      -- both read 1
if seats > 0: UPDATE events SET seats_left = seats - 1  -- both write 0, both insert a booking
```

Both pass the `if`, both write `0` (the second write overwrites the first with a value computed from a stale read), and two
bookings exist for one seat. This is a **lost update**. `backend/src/routes/demo.js` (`book-naive`) implements exactly this on purpose
and `npm run race-demo` shows it overselling (measured numbers in RESULTS.md section 1).

### What SeatLock does: one conditional UPDATE

`backend/src/services/hold.js`, `holdInPostgres`:

```sql
UPDATE events SET seats_left = seats_left - 1
 WHERE id = $1 AND seats_left > 0 AND status = 'PUBLISHED' AND registration_opens_at <= now() AND ... 
RETURNING seats_left, hold_minutes
```

The check (`seats_left > 0`) and the write (`- 1`) are **one statement**. Postgres takes the row lock, and a second transaction
touching the same row waits for the first to commit, then re-evaluates the `WHERE` against the *new* row. It sees `seats_left = 0`,
matches no rows, and the code answers "sold out". Zero rows updated *is* the "no seat" signal.

### The four ways to do this, compared

| Approach | How it works | Why not (or why yes) |
|---|---|---|
| **Conditional UPDATE** (chosen) | Check and write in one statement; rows-affected tells you if you won | One round trip, no explicit lock management, no retries, cannot be done wrong by forgetting a `FOR UPDATE`. All business rules (time window, eligibility) go in the same `WHERE`, evaluated at the same instant |
| `SELECT ... FOR UPDATE` then `UPDATE` | Lock the row, read, decide in application code, write | Correct, but two round trips while holding a lock, and correctness depends on every code path remembering the `FOR UPDATE`. Holding a lock across application logic makes the hot row a queue. We use it where we genuinely need to read-then-decide (publish, capacity change, cancel event in `routes/events.js`) |
| Optimistic locking (version column) | Read with version, `UPDATE ... WHERE version = $v`, retry if 0 rows | Under a rush, nearly every attempt conflicts and retries, which multiplies load exactly when the system is busiest. Good for rarely-contended rows, wrong for one row everyone wants |
| `SERIALIZABLE` isolation | Database detects anomalies and aborts one transaction | Correct, but under contention it aborts many transactions with `40001` and every caller needs retry logic. Heavy for a problem a single `UPDATE` already solves |

We still wrap the hold in a transaction (`tx()` in `backend/src/db.js`) because it does two things that must commit together:
decrement the counter *and* insert the booking row. If the `INSERT` fails (for example a duplicate), the whole transaction rolls
back and the decrement disappears with it, so a seat can never leak.

### Defence in depth: three independent guards

1. The conditional `UPDATE` (above).
2. `CONSTRAINT events_seats_range CHECK (seats_left >= 0 AND seats_left <= capacity)` in `db/migrations/001_init.sql`. Even a future buggy
   query that subtracts without checking cannot push the counter below zero; Postgres rejects it. It also stops an over-large
   `+ 1` on release (the counter can never exceed capacity). The error handler maps a violation to `409 CAPACITY_CONFLICT`.
3. `bookings_one_active_per_user`, a **partial unique index** `ON bookings (event_id, user_id) WHERE status IN ('HELD','CONFIRMED')`.
   One person cannot hold two seats even with two tabs and two different idempotency keys. Cancelled and expired rows are excluded,
   so people can register again after cancelling.

The invariant `active bookings <= capacity` and the consistency `seats_left = capacity - active` are re-checked after every
concurrency test in `backend/test/` and after every load-test run.

### Time comes from the database

Every time comparison (`registration_opens_at <= now()`, `hold_expires_at > now()`) uses Postgres `now()`, never the Node
process clock and never the browser clock. With several API servers, their clocks disagree by milliseconds to seconds; one database
clock cannot. The website receives `hold_seconds_left` computed *by the database* and counts down locally with
`performance.now()`, so a student whose laptop clock is wrong still sees the correct countdown.

## 2. Raw SQL instead of an ORM

Chosen: `pg` with parameterized queries (`$1, $2`), written by hand.

- The most important statements here (conditional `UPDATE`, `FOR UPDATE SKIP LOCKED` in a CTE, `INSERT ... ON CONFLICT`, partial
  indexes, `FILTER (WHERE ...)` aggregates, a streaming cursor) are exactly the ones ORMs make awkward or hide. With an ORM you
  would end up writing raw SQL for the core and learning the ORM's API for the rest.
- The SQL you read is the SQL that runs, so it can be explained line by line in an interview and reasoned about for locking.
- Every query is parameterized, so user input is never concatenated into SQL. The only dynamic SQL is the column list in
  `PATCH /events/:id`, and those names come from a hard-coded whitelist (`EDITABLE` in `routes/events.js`), never from the request.

Cost: no automatic type safety or migrations, and more typing. Migrations are a small runner (`db/migrate.js`) over numbered `.sql`
files recorded in `schema_migrations`.

### Dependency justification (backend)

| Package | Why it is needed | Why not something else |
|---|---|---|
| `express` 5 | HTTP routing and middleware. Express 5 forwards errors from async handlers automatically | Fastify would also work; Express is what most interviewers know |
| `pg` | The PostgreSQL driver, with pooling | Required for raw SQL |
| `pg-query-stream` | Streams CSV rows from a database cursor (section 11) | Without it the whole result would be loaded into memory |
| `ioredis` | Redis client with Lua scripting and good reconnect behaviour | `redis` (node-redis) also works; ioredis `defineCommand` makes Lua scripts one-liners |
| `bcryptjs` | Password hashing | Pure JavaScript, no native build step on Render/Windows. Slower than native `bcrypt`, which is acceptable for login volumes |
| `jsonwebtoken` | Signing and verifying login tokens | Small and standard |
| `zod` | One validation approach for every request body, plus the dynamic answer schema (section 14) | |
| `autocannon` (dev) | Load generator for `npm run loadtest` | |

(Email uses Resend's HTTP API through the built-in `fetch`, so it adds no package.)

No cookie-parser (a 10-line reader in `middleware/auth.js`), no helmet (we set the two headers we need in `app.js`), no logging
library (`logger.js` is 45 lines of JSON lines), no test framework (`node:test` ships with Node), and no `dotenv` (Node's `--env-file`).

### Dependency justification (frontend)

| Package | Why |
|---|---|
| `next`, `react`, `react-dom` | The framework (section 18) |
| `tailwindcss`, `@tailwindcss/postcss` | Styling with design tokens in CSS variables |
| `react-markdown` | Safe Markdown rendering (section 19) |
| `qrcode.react` | Renders the ticket QR as SVG, client-side, no image service |
| `@yudiel/react-qr-scanner` | Camera access and QR decoding for the gate scanner (bundles a WebAssembly decoder; we self-host the `.wasm`) |
| `@fontsource-variable/*` | Fonts served from our own origin: no third-party request, no layout shift from a late font |
| `server-only` | Makes the build fail if server-only code (which forwards cookies) is ever imported into a client component |

## 3. Why an in-process mutex does not work

A tempting "fix" is a lock in Node: `if (locked) wait; locked = true; ...`. It only serialises requests **inside one process**.
In production there are several API instances (and `node --watch` restarts, and Render may run two during a deploy). Two
instances have two separate mutexes, so both can read "1 seat left" at the same instant: the same race, one level up. The only
thing every instance shares is the database, so the database must be the arbiter. (`backend/test/redis.test.js` runs two full API
instances against one database and one Redis and asserts exactly `capacity` succeed.)

## 4. Holds: reserve first, confirm later

Registration has a form (custom questions). If the seat were only taken at the *end*, a person could fill in a long form and be
told "sold out" at the last click. So `POST /events/:id/hold` takes the seat immediately and gives the person `hold_minutes`
(default 5) to finish. `POST /bookings/:id/confirm` converts `HELD` to `CONFIRMED` with another conditional `UPDATE`
(`WHERE status = 'HELD' AND hold_expires_at > now()`), so an expired hold can never be confirmed, even if the sweeper has not run yet.

States are changed only by conditional updates whose `WHERE` names the state we expect (`services/booking.js`). An illegal move
(confirming an expired hold, cancelling twice, cancelling after check-in) matches zero rows and cannot corrupt anything; the code
then looks again to give a precise error (`410 HOLD_EXPIRED`, `409 BOOKING_NOT_ACTIVE`, ...).

**Idempotency.** Networks retry. The client sends an `Idempotency-Key` header (generated once per registration attempt and reused
on retries). `bookings_user_idem_key` is a unique index on `(user_id, idempotency_key)`. A retry with the same key returns the
original booking with status **200** instead of **201** and consumes no seat. Keys are scoped per user so one user's key can never
collide with, or leak, another's. Reusing a key for a different event is `422 IDEMPOTENCY_KEY_REUSED`.
A subtle bug found by the tests: when two requests with the *same* key arrive at once, the loser of the unique-index race may be
reported against either unique index. `resolveDuplicate` therefore checks the idempotency key first, and only then concludes
"already registered by a different key".

## 5. The hold sweeper, and why not Redis expiry events

Holds that are never confirmed must return their seats. `backend/src/sweeper.js` runs every `SWEEP_INTERVAL_SECONDS` (30) inside each API process:

```sql
WITH expired AS (UPDATE bookings SET status='EXPIRED' WHERE status='HELD' AND id IN
                  (SELECT id FROM bookings WHERE status='HELD' AND hold_expires_at < now()
                    ORDER BY hold_expires_at FOR UPDATE SKIP LOCKED LIMIT 500) RETURNING event_id, user_id),
     released AS (UPDATE events e SET seats_left = seats_left + c.n FROM (SELECT event_id, count(*) n FROM expired GROUP BY event_id) c WHERE e.id = c.event_id)
SELECT ...
```

- `FOR UPDATE SKIP LOCKED`: several sweepers (one per instance) each lock the batch they pick and skip rows another sweeper holds, so
  nobody waits and **no seat is released twice**. (The test runs three sweepers at once over 600 expired holds.)
- The status change and the seat release are one statement, so they commit or fail together.
- It is idempotent and self-healing: whatever was missed (process asleep, crash) is simply picked up on the next run. The partial index
  `bookings_held_expiry` keeps the scan tiny.
- Correctness never depends on the sweeper. `confirm` checks `hold_expires_at > now()` itself. A late sweeper only means a seat
  becomes available a little later.

**Why not Redis key-expiry notifications** (set a key with a TTL and release the seat when it expires)? Keyspace notifications are
fire-and-forget pub/sub: if no subscriber is connected at that moment (deploy, restart, network blip) the message is lost forever
and the seat leaks permanently. They are also off by default on managed Redis. A polling query over the source of truth cannot lose anything.

The sweeper retries on deadlock (`40P01`): `tx()` re-runs the function up to twice, which is safe because the function only does
database work; side effects such as Redis updates happen after the transaction returns.

## 6. Redis: an optimisation, never the source of truth

Redis (`backend/src/redisLayer.js`) does three jobs: a fast "sold out" answer, an atomic admission gate, and shared rate limits.

**The rule that makes it safe:** the Postgres conditional `UPDATE` still runs for every request Redis lets through. So if Redis is
wrong:

- counter too low, or flag stale: a false "sold out" (a person may retry; reconciliation repairs it), never an oversell;
- counter too high: extra attempts reach Postgres, which says no.

Pieces: a **Lua gate** (`GATE_LUA`) that atomically checks "initialised? already a holder? seats > 0?" and decrements, returning 1 (admitted), 0 (sold out), -1 (already holds), -2 (not initialised). A **`soldout` flag with a 30 s TTL** so a lost "seat returned" message can never wedge an event. A **release script** that never creates the counter (an `INCR` on a missing key would invent a seat). **Compensation**: if Redis admitted a request but Postgres did not hand out a *new* seat (sold out, duplicate, validation), the Redis change is undone. **Reconciliation** every `RECONCILE_INTERVAL_SECONDS` compares Redis with Postgres, re-checks 250 ms later (in-flight requests make them differ for a moment) before correcting, and logs every correction. **Lazy initialisation**: if the keys vanish (Redis restart), the first request notices (`-2`) and rebuilds from Postgres in the background, with a negative cache so a missing event is not rebuilt in a loop.

Keys look like `event:{<id>}:seats`. The braces are a Redis Cluster *hash tag*: all keys of one event land in the same slot, which Lua
scripts touching several keys require.

If Redis is unconfigured or dies, every method degrades to "do nothing" and the Postgres path serves the request (tested: Redis
down from the start, and killed mid-traffic: only 201/409, never a 5xx, and the fallback is logged). Honest measured effect:
roughly 2x on a sold-out rush, no help (slightly slower) on the success path; see RESULTS.md.

### The two-store consistency trade-off

Postgres and Redis are two systems; there is no transaction spanning both. A crash between "Redis admitted" and "Postgres
committed" leaves them disagreeing. We choose the failure mode on purpose: Postgres is the truth, Redis is allowed to drift only
in the safe direction, side effects on Redis happen **after** the Postgres commit (never inside the transaction, so a rollback or
a retry cannot leave Redis changed), and reconciliation repairs drift. The alternative (making Redis the truth) would need Redis
persistence guarantees and a way to rebuild Postgres from it, which is a much harder problem.

## 7. Signed tickets

The QR code contains `base64url({bookingId, eventId}) + "." + base64url(HMAC-SHA256(TICKET_SECRET, payload))` (`backend/src/tickets.js`).

- A bare booking id is guessable (1, 2, 3...): anyone could walk in by typing numbers. A signature can only be produced by someone who
  knows `TICKET_SECRET`, so a forged or edited ticket is rejected **before** any database work.
- The signature is compared with `timingSafeEqual`, so response timing cannot reveal how many bytes matched.
- `TICKET_SECRET` is separate from `JWT_SECRET`: a leak of one does not break the other.
- A ticket proves "this booking existed when issued", not "it is still valid". Check-in re-checks the **live** booking state (one
  conditional `UPDATE ... WHERE status='CONFIRMED' AND checked_in_at IS NULL`), so a cancelled booking's QR is refused and a ticket
  scanned twice (even from eight phones at once) checks in exactly once.

**If the secret leaks:** an attacker can mint tickets for any booking id. Rotate: set `TICKET_SECRET` to a new value and put the old
one in `TICKET_SECRET_PREVIOUS`. New tickets use the new secret; already-issued tickets (verified against both) keep working. Once
everyone has been given a fresh ticket, or the event is over, remove `TICKET_SECRET_PREVIOUS`, and the leaked secret stops working.
Even a forged ticket still has to name a real, `CONFIRMED`, not-yet-checked-in booking of an event the scanner is staff for, which
limits the damage but is not a substitute for rotating. (Tested: `ops.test.js`, "secret rotation".)

**Offline scanning (plan, not built).** The scanner currently calls the API for every scan, so it needs connectivity. An offline
design: before the event, a staff device downloads the list of valid booking ids for the event (signed, or fetched over an
authenticated call) and verifies signatures locally with a *public-key* signature scheme (Ed25519) instead of HMAC, so the device never
holds a secret that could forge tickets. It records scans locally and syncs later; duplicates across two offline devices are then
resolved at sync time ("first scan wins" by timestamp), with the trade-off that two offline gates can both admit the same ticket
for a while. The current HMAC design cannot do this safely, because verifying locally requires holding the signing secret.

## 8. Audit entries in the same transaction

`backend/src/audit.js` takes the *same database client* as the change it records. The `audit_log` row and the change commit together or
roll back together. If the audit were written after the commit, a crash in between would lose the record of a change that happened; if
written before, it could record a change that was then rolled back. (Test: "rolled-back actions leave nothing".) Cost: a slightly
longer transaction. Hold/confirm are *not* audited per request: they are high-volume, and the booking row itself is their record.

## 9. Keyset pagination

`GET /events/:id/registrations?after=<id>` returns `WHERE b.event_id = $1 AND b.id > $2 ORDER BY b.id LIMIT n+1`.

- `OFFSET 100000` makes the database walk and discard 100,000 rows each time; keyset cost is constant at any depth
  because `bookings_event_id_id (event_id, id)` jumps straight to the cursor.
- Rows inserted while you page are never skipped or repeated. With OFFSET, an insert shifts every later page.
- Fetching `n+1` rows tells us whether another page exists without a second `count(*)` query.

Trade-off: you cannot jump to "page 17", only "next". For an admin list with search that is the right trade. Audit uses the same idea in reverse (`before=`) because newest-first is natural there.

## 10. Why `bigint` IDs are strings in JSON

IDs are `bigint GENERATED ALWAYS AS IDENTITY`. JavaScript numbers are exact only up to 2^53, and `pg` returns `bigint` as a string
for that reason. We keep them as strings end to end (API, JSON, URLs) so no conversion can silently corrupt an id. Identity (not
random UUID) keeps indexes small and ordered, which keyset pagination relies on; ids are not secret, so every access is
authorised by ownership checks, and someone else's booking id looks identical to a missing one (404).

## 11. Streaming the CSV export

`GET /events/:id/registrations.csv` (`routes/eventOps.js`) opens a Postgres **cursor** (`pg-query-stream`), transforms rows to CSV
lines, and pipes them to the response with `stream/promises` `pipeline`. Memory stays flat (a few hundred rows at a time) for 50 or
500,000 registrations; loading everything into an array first would not. `pipeline` also propagates back-pressure (a slow client
slows the database read) and, if the client hangs up, destroys the cursor so the **connection is released** (tested: "client
hang-up mid-stream releases the database connection"). A failed stream drops the connection instead of returning it to the pool.

Details that matter: a UTF-8 BOM so Excel reads names correctly; correct quoting of commas, quotes and newlines; and
**formula-injection neutralisation**: a cell starting with `=` or `@` (or `+`/`-` followed by something other than a number) would be executed as a formula by Excel, so such cells
are prefixed with a `'` (plain negative numbers are left alone). A registration answer is attacker-controlled text, and an organizer opens this file.

## 12. Auth and sessions

- Passwords: bcrypt. Login compares against a dummy hash when the email is unknown, so "no such user" takes as long as "wrong
  password" and emails cannot be enumerated by timing. Both give the same `401 INVALID_CREDENTIALS`.
- Token: a JWT in an **httpOnly, SameSite=Lax** cookie (`Secure` in production). JavaScript on the page cannot read it, so XSS cannot
  steal it. A `Bearer` header is also accepted so scripts and tests can call the API.
- The user is **re-read from the database on every request**, so a role change or deletion applies immediately instead of when a
  7-day token expires. Cost: one indexed lookup per request (this is part of the measured load-test cost).
- CSRF: SameSite=Lax blocks cross-site POSTs; on top, if `ALLOWED_ORIGINS` is set, a cookie-authenticated write with an unknown `Origin` header is refused.
- Roles are checked on every protected route (`requireRole`), and organizers can only touch their own events (`ownership.js`: a non-owner gets 404, so event ids cannot be probed).
- Auth routes are rate limited per IP; booking routes per user.

**Rate limiting** (`backend/src/ratelimit.js`) is a *fixed window* counter: `INCR` a key per (limiter, caller, minute). Cheap (one Redis round
trip), shared across instances through Redis, with an in-memory fallback when Redis is down. Weakness: up to 2x the limit can pass
across a window boundary; a sliding window removes that at more cost per request. For login and booking spam the cheap version is enough.

## 13. One approach each for errors, validation, logging

- **Errors**: code throws `AppError(status, CODE, message, details)`; one middleware (`errors.js`) formats `{error:{code,message,details}}`. Postgres constraint
  violations are mapped by constraint *name* (`translatePgError`), so the database stays the judge. Unknown errors become a generic 500 and the stack goes to the log, never to the client.
- **Validation**: zod schemas, parsed by one helper (`util.js` `parse`), producing `422 VALIDATION_FAILED` with per-field messages.
- **Logging**: JSON lines with a request id (`X-Request-Id`, from `AsyncLocalStorage`, so any function can log with the current id without passing it around).
- **Dependency injection**: `ctx = {config, pool, redis, log}` is passed explicitly (no hidden globals), which is why tests can build an app on a test database with Redis on or off.

## 14. Custom registration questions and the edit rules

Organizers define questions (text, long text, email, phone, number, select, checkbox). The answers schema is **built at runtime from the
event's questions** (`questions.js`, `validateAnswers`) and applied on confirm, so the server decides what a valid answer is; the browser form is a convenience only.
`.strict()` rejects answers to questions that do not exist instead of silently storing them.

**Edit rules.** Once any booking exists, stored answers must stay valid, so the question list may only change in ways that cannot
invalidate them (`checkQuestionEditAllowed`): no removing a question, no changing its type, no making an optional question
required, no removing a select option, no shrinking `maxLength`, and new questions must be optional. Before any booking exists, edits are free. The check runs in the
same transaction that **locks the event row**, so a concurrent first booking either finishes before the check or waits for it.

## 15. Slug immutability

The slug is generated from the title at creation (collisions get a random suffix, using a `SAVEPOINT` so a failed insert does not
abort the transaction; the `UNIQUE` constraint, not a prior `SELECT`, prevents duplicates). It is **never editable**: `PATCH /events/:id` is a strict
schema without a slug. Event links get pasted into WhatsApp groups, posters and calendar invites; changing the slug would break
every one of them. A wrong title can be fixed without changing the link.

## 16. Streaming, polling, and SSE

The website shows live seat counts (event page) and live stats (organizer overview) by **polling** every 3 s, paused while the tab is
hidden (`document.visibilityState`). Server-Sent Events (or WebSockets) would push updates instantly, but each open connection holds a socket and a
server slot for as long as the page is open: thousands of students watching a rush would hold thousands of connections on a
512 MB instance, plus sticky routing or a pub/sub layer between instances. Polling is stateless, cacheable, works on any host,
and 3 s is fresh enough for "seats left". The actual protection against a rush is the server-side gate, not what the browser displays. If load requires it,
the next step is a short cache on the public event endpoint (a second or two) rather than SSE.

## 17. Fairness and a virtual waiting room (plan, not built)

Today, "first request to reach the database wins". That is fair in the sense of "no one cheats the lock", but not fair to someone on a
slow connection, and a script can send requests faster than a human. Options, in increasing effort: per-user rate limits (built);
requiring login (built, so one account is one identity); a **virtual waiting room**: before registration opens, everyone who arrives
joins a queue and gets a random position (a lottery over the first N seconds, so network speed stops mattering); the room admits users to
the real hold endpoint at a rate the backend can handle. Implementation sketch: a Redis sorted set or a signed "admission token" with a time window; the hold endpoint
requires a valid token. This would also protect Postgres from a thundering herd. Not built: it needs product decisions (lottery or
first-come order) that belong to the organizers.

## 18. Why Next.js instead of Vite

The essential difference for this product is **link previews**. People share event links in WhatsApp, Telegram and Slack. Their
crawlers fetch the HTML **without running JavaScript** and read `<meta property="og:title|og:image">`. A Vite single-page app serves an empty shell, so every shared link shows a blank
card. Next.js renders the page and `generateMetadata` on the server, so the HTML already contains the title, description and image URL. We also generate a per-event Open Graph image
at `/e/[slug]/og` (`ImageResponse`). Server Components also let the public pages fetch data on the server with the visitor's cookie (the personalised "you're registered" state)
with no loading spinner and no API keys in the browser. Trade-off: a Node server to run (Vercel handles it) and a steeper mental model than a plain SPA.

### The `/api` proxy and first-party cookies

The API lives on another origin in production (`onrender.com`) while the site is on `vercel.app`. A cookie set by the API would be a
**third-party cookie** for the site, which Safari and (increasingly) Chrome block, silently logging users out. Instead the browser only
ever calls `/api/*` on the **site's own origin**, and `next.config.ts` rewrites that to `API_URL`. The cookie then belongs to the
site (first-party) and works everywhere. Server Components call the API directly and forward the cookie themselves (`lib/server.ts`).
Cost: one extra hop for browser requests, and a Vercel/Next dependency in the request path. Hard-coded at build time: changing `API_URL` needs a redeploy.

## 19. Safe Markdown and XSS

Event descriptions are written by organizers and shown to the public, so they are a stored-XSS risk if rendered carelessly. `react-markdown` builds React elements (no
`dangerouslySetInnerHTML`), **does not allow raw HTML** in the Markdown, and we additionally disallow images (tracking pixels) and
force `rel="noopener noreferrer nofollow ugc"` on links. Banner URLs must be `https` (the API's schema rejects `javascript:` URLs). React escapes everything else, including registration answers in the dashboard table.
The CSV export neutralises spreadsheet formulas (section 11). The one place that cannot be escaped is a file that *another program* opens, which is why that case has its own defence.

## 20. A million-request plan (plan, not measured)

RESULTS.md measured about 400 successful holds/s and about 1,200 rejections/s on one 2-vCPU machine shared with the database and load generator; those are not
production numbers. If a registration really faced a million requests in a few minutes, the plan would be, in order:

1. **Do not let a million requests reach the API.** A virtual waiting room / CDN edge rate limit in front, and a static "sold out" page once the event is full.
2. **Cheap rejection first.** Redis (built) answers sold-out in one `GET`. Move authentication off the hot path for rejected requests (a signed short-lived token verified without a database lookup), since the user lookup was the main remaining cost after sell-out.
3. **Horizontal API.** Stateless API instances behind a load balancer (the design already allows it: no in-process state that matters; two-instance test).
4. **Fix the real ceiling: one hot row.** Every successful hold updates one `events` row, so successes serialise. Options: shard the counter into N rows (e.g. 10 "seat buckets" of capacity/10, picking one at random and trying the others when empty), or hand out seat numbers from a Redis list pre-loaded with the capacity and reconcile to Postgres asynchronously. Both trade simplicity for throughput, so measure first.
5. **Postgres**: a connection pooler (PgBouncer / Neon pooler) so thousands of requests do not mean thousands of connections; read replicas for the public pages; the booking writes stay on the primary.
6. **Queue the slow work** (emails, calendar invites) so it never sits in the booking request.

## 21. How Razorpay (payments) would plug in (plan, not built)

Paid events add a step between hold and confirm, and the hold is exactly the tool for it: **the seat is already reserved while the person pays.**

1. `POST /bookings/:id/pay`: server creates a Razorpay *order* for the event price (amount computed on the server, never trusted from the browser) and stores `razorpay_order_id` on the booking, moving it to `PAYMENT_PENDING`; the hold is extended a few minutes so a slow payment is not cut off (extend with a conditional `UPDATE ... WHERE status IN ('HELD','PAYMENT_PENDING')`).
2. The browser opens Razorpay Checkout; on success Razorpay calls our **webhook** (`payment.captured`). Verify the `X-Razorpay-Signature` HMAC over the raw body with the webhook secret before trusting anything. Do not trust the browser's "payment succeeded" callback.
3. The webhook handler confirms the booking in one conditional `UPDATE ... WHERE razorpay_order_id = $1 AND status IN ('HELD','PAYMENT_PENDING')` and stores `razorpay_payment_id` under a **unique** index, so a webhook delivered twice (they are retried) cannot confirm or charge twice: it is idempotent for the same reason holds are.
4. Hard case: payment captured **after** the hold expired and the seat was resold. The handler must detect this (`UPDATE` matches zero rows) and issue an automatic refund, and the sweeper must not release a booking in `PAYMENT_PENDING` until a grace period has passed. Cancellations call the Razorpay refund API and write an audit row in the same transaction.
5. Reconciliation job: periodically list recent Razorpay orders and compare with bookings, because webhooks can be missed.

## 22. The waitlist and automatic promotion

When an event is sold out, `POST /events/:id/waitlist` puts a person in a queue (`waitlist` table, migration `002_waitlist.sql`). The row id *is* the
queue order, `UNIQUE (event_id, user_id)` makes joining idempotent (you keep your place), and a waiting person holds **no seat**, so waitlist rows never count
toward the capacity invariant.

**The rule:** a seat that is freed while someone is waiting is handed to the first waiter *in the same transaction that freed it*
(`promoteWaitlist` in `services/waitlist.js`, called from `cancelBooking`, the sweeper, and the capacity change). The waiter becomes a normal
`HELD` booking (hold length `WAITLIST_HOLD_MINUTES`, default 15, because they may not be looking at the page).

Why in the same transaction rather than "free the seat, then notify the next person"? Because between those two steps `seats_left` would be 1, and anyone who clicks Register
at that instant takes the seat ahead of the queue. Doing it as a transfer means `seats_left` never becomes visible as positive while a live waiter exists: it goes 0, +1, -1, 0 inside one
transaction. Tested: a newcomer's hold right after a cancel gets `409 SOLD_OUT` and the waiter holds the seat. The capacity invariant is untouched because "release a seat, take a seat" is
a transfer; with 20 cancellations racing and 30 people waiting, exactly the first 20 in line end up holding, in order.

Details: the promoter locks the event row (`FOR UPDATE`) so only one transaction promotes for an event at a time, locks the front waiter, skips and drops anyone who already has an active booking or whose
email domain is no longer allowed, and stops when seats run out or the event is not currently open for registration. Joining takes `FOR SHARE` on the event row: many people can join at once, but a
seat being freed or taken finishes first, so "is it really sold out?" is answered consistently. If a waiter registers directly, their waitlist row is deleted in the same transaction.

Redis: a promotion changes who holds seats without changing the count, so after commit the layer **rebuilds that event's keys from Postgres** (`syncEvent`) instead of trying to patch counters. Email is sent after commit (section 23).

Not built: notification other than email and the page itself (no SMS or push), and no "decline this seat" button (a promoted person who does nothing simply expires and the next person is promoted by the sweeper).

## 23. Check-in details, verify-only mode, and email

**What the QR contains.** Only a signed reference (section 7). The scanner POSTs it to `/checkin`; the server verifies the signature, then returns the attendee's name, email, registration time and every answer, labelled using the event's question definitions (`labelAnswers`).
Putting the person's data inside the QR would make a cancelled ticket still "valid" offline, expose personal data to anyone who photographs a ticket, and make forging easier.
`preview: true` on the same endpoint does everything except write, so a volunteer can look someone up (or double-check a ticket) without spending the single check-in; the screen then offers "Check in now". It enforces the same permissions as a real scan (tested: a non-staff user gets 403, not the attendee data).

**Email** (`backend/src/mailer.js`) is optional and uses Resend's HTTP API through `fetch`: no new dependency. It sends a ticket link on confirmation and a "seat opened up" message on waitlist promotion. It is always sent **after** the database commit, never awaited by the request, and a failure is logged and ignored, so an email outage can never fail a registration or
strand a seat. With no `RESEND_API_KEY` / `MAIL_FROM` it does nothing. The tests run it against a fake provider on a local port (including a provider returning 500).

## 24. Chaos Lab and the integrity checker

**Problem.** "It never oversells" is a claim. A reader should be able to try to break it and see the evidence.

**Integrity checker** (`services/integrity.js`). Read-only. For one event it recomputes the truth from the `bookings` table with SQL aggregates and compares it with everything that must agree with it: no oversell (`active <= capacity`), exact counter (`seats_left = capacity - active`), counter in range, one seat per person, every hold has a deadline, nobody both waiting and seated, and (when Redis is on) the Redis counter and holder count. Each check carries its rule in plain words, the expected value and the found value. It can run on a real event at any time (`GET /events/:id/integrity`). For Redis it looks twice, 300 ms apart, because in-flight requests make the two stores differ for a moment; a persistent difference is reported.

**Chaos Lab** (`services/chaos.js`, `POST /demo/chaos`, demo mode only). Creates a hidden demo event and many users, then sends real HTTP requests through the same endpoints a student uses. Failures you can add: the same request three times at once (idempotency), a second request with a different key (second tab, caught by the one-active-booking-per-user index), Redis switched off mid-rush and back on with stale counters (the reconcile then repairs it), waitlist promotions, cancellations, and forced hold expiry with the sweeper running while people click. Then it runs the checker. Only one experiment runs at a time because the Redis switch is shared process state.

**Sabotage.** One option swaps the real booking endpoint for the naive read-then-write one used by the race demo. The experiment must then fail; a test asserts it does. This is the answer to "how do I know your checker is not just always green?". In sabotage runs the database `CHECK (seats_left <= capacity)` can also refuse the sweeper because the counter is already corrupt; that is reported in the timeline, not hidden.

**Why Redis's reconcile takes an optional event id.** The normal pass skips demo events (they are never cached in production), so the lab asks it to check its own event explicitly.

**What it does not prove.** It checks the state after a run, on one machine, with the failures listed above. It does not kill Postgres or the API process, it does not test multiple API instances, and a passing run is evidence rather than a proof.

## 25. Two portals, two sessions

Attendees and organizers are different people doing different jobs, so they get different sites and different logins.

- **Two cookies, two token audiences.** The website uses `seatlock_token` and the organizer portal uses `seatlock_org_token`. Every JWT carries an `aud` claim (`attendee` or `organizer`). The guard for each portal checks the claim, so an attendee token is simply "not logged in" on organizer routes and the other way round (the API answers 401, not 403, because from that portal's point of view nobody is logged in).
- **Separate sign-up and login.** `POST /organizer/auth/register|login|logout`, `GET /organizer/auth/me`. Organizers also give their society name. An organizer account cannot log in on the website and an attendee account cannot log in on the portal (`403 WRONG_PORTAL`, only after the password is verified, so it leaks nothing to a stranger).
- **Admins** still log in on the website (`/admin`). They may also log in on the portal, to help an organizer.
- **Gate scanning** works from both: `POST /checkin` uses `requireEither`, because volunteers scan on the website and organizers scan in their portal.
- **One guard factory** (`guard(aud, ...roles)` in `middleware/auth.js`) builds both guards, so they cannot drift apart. Role changes still apply immediately because the user is re-read from the database on every request.
- **Frontend.** Next.js route groups: `(site)` has the attendee header and footer, `organizer/(auth)` is a bare login page, `organizer/(portal)` has its own header and redirects to the portal login when there is no organizer session.
- Covered by `test/organizer-auth.test.js` (6 tests) and the browser script `e2e3` (26 checks).

### Who can do what

Four levels, each able to do everything the level below can:

| Level | Scope | Can |
|---|---|---|
| Admin | the whole platform | everything below, on every event: edit details and capacity, publish or cancel, see registrations, manage volunteers, scan, and change user roles. An admin signed in on the website needs no separate organizer login; the portal API accepts their website session. |
| Organizer | their own events | create and edit events, see registrations, add or remove volunteers, scan |
| Volunteer | one event (`event_staff`) | scan tickets for that event only |
| Attendee | their own bookings | register, cancel, hold a waitlist place |

Only admins cross between the two sessions. An organizer or participant holding only a website token still gets 401 from the portal API (`test/organizer-auth.test.js`).

## 26. Other decisions

- **Graceful shutdown** (`server.js`): on SIGTERM stop the sweeper, stop accepting connections, wait for in-flight requests, then close Redis and the pool (a deploy must not cut a booking in half).
- **Pool timeouts** (`db.js`): `statement_timeout` 15 s and `idle_in_transaction_session_timeout` 15 s so one stuck request cannot hold row locks forever; `connectionTimeoutMillis` 5 s so an exhausted pool fails fast.
- **Deadlock retry**: `tx()` retries `40P01`/`40001` twice. Deadlocks are real here: the sweeper updates `bookings` then `events`, while cancelling an event updates `events` then `bookings`.
- **Demo endpoints** exist only when `ENABLE_DEMO=true`, and the config refuses that value in production. Demo events carry `is_demo` and never appear in any listing.
- **Self-hosted fonts and QR decoder**: no request to a third-party CDN is needed to register or to scan at a gate.
- **Admin portal**: `GET /admin/stats` (SQL aggregates, demo events excluded) and `GET /admin/events` (keyset-paginated, with organizer and counts); admins reach any event's manager page through the same ownership check as organizers (`getOwnedEvent` allows admins).
- **Accessibility**: real labels, visible focus, a live-region timer, status shown by text and a glyph as well as colour, 44 px touch targets, dark mode following the OS with a manual toggle.
- **Design system**: warm paper and ink with one vermilion accent, a serif display face for headings, no gradients; colours are CSS variables so light/dark is one set of tokens.
