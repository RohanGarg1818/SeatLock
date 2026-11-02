# SeatLock: interview preparation

Everything here refers to code that exists and was run. Where the honest answer is "not built" or "not measured", it says so;
that is the right thing to say in an interview too. Measured numbers are in [docs/RESULTS.md](docs/RESULTS.md); reasoning behind
each decision is in [docs/DESIGN.md](docs/DESIGN.md).

## Contents

1. [The 60-second pitch](#1-the-60-second-pitch)
2. [The 3-minute demo script](#2-the-3-minute-demo-script)
3. [The lost-update timeline](#3-the-lost-update-timeline)
4. [Request walkthrough: one click on "Register"](#4-request-walkthrough-one-click-on-register)
5. [File-by-file guide](#5-file-by-file-guide)
6. [Edge cases mapped to code](#6-edge-cases-mapped-to-code)
7. [Questions and answers](#7-questions-and-answers-40-core-plus-9-bonus)
8. [What it does not do yet](#8-what-it-does-not-do-yet)

---

## 1. The 60-second pitch

"SeatLock is an event registration platform for college societies. The problem I wanted to solve is the moment a popular event
opens: hundreds of students click Register at the same second for forty seats, and a naive system gives out more tickets than seats.
It happens because the code reads the seat count, checks it, and writes it back as separate steps, so two requests both see one seat left.

I fixed it at the database. Taking a seat is a single conditional `UPDATE ... WHERE seats_left > 0`, so the check and the decrement
are one atomic statement; a database `CHECK` constraint and a unique index are backup layers underneath. A person gets a five-minute
hold on the seat while they fill in the form, and a sweeper returns expired holds. I proved it with a race demo: 200 simultaneous
requests for 20 seats, the naive version booked 54, mine booked exactly 20; and an integration suite of 91 tests against a real
Postgres. The site also has a Chaos Lab: I can fire a crowd at an event while switching on double clicks, a dead cache, cancellations and expiring holds, and an independent checker re-derives every seat number from the raw bookings. With a sabotage switch that swaps in the broken code, it turns red, so you can see it is not rigged. Redis sits in front as an optional speed-up for sold-out rushes: it can only ever say 'sold out' too early, never oversell,
and the app works with Redis switched off. On top of that there are signed QR tickets, a volunteer check-in scanner, a streamed CSV
export, a waitlist that hands a freed seat to the next person in line inside the same transaction, and a Next.js site with link previews."

(The "54" is a real measurement from this build; the number varies run to run because it is a race. Say "more than 20, for example 54".)

## 2. The 3-minute demo script

Setup beforehand: the README "Run it locally" steps, two browser windows (one normal, one private), and a terminal in `backend/`.

**0:00 - The problem (30 s).** Terminal: `npm run race-demo -- --capacity 20 --requests 200`. While it runs: "200 people, 20 seats."
Point at NAIVE: "bookings created: more than 20, `oversold by`, `invariant held: NO`, and look, `seats_left` even says 0 though more than 20 people hold a seat: that is the lost update." Point at ATOMIC: "exactly 20, invariant held."

**0:30 - Why (30 s).** Open `backend/src/services/hold.js`, find the `UPDATE events SET seats_left = seats_left - 1 WHERE ... AND seats_left > 0`.
"The whole fix is that this check and this write are one statement. The second request waits for the row lock, re-reads, sees zero, matches no rows." Then open `backend/db/migrations/001_init.sql` and show `events_seats_range` and `bookings_one_active_per_user`: "two more layers so no future bug can break it."

**1:00 - The product (60 s).** Window 1 (student, `asha@ipu.ac.in`): open HackIPU, click Register: "the seat is held now, five-minute countdown, the server tells the browser the seconds left so a wrong laptop clock cannot cheat." Fill the form, confirm, open the ticket: "a signed QR, not a booking number, so it cannot be guessed." Window 2 (private, `meera@gmail.com`): open Intro to Rust, click Register: "refused: that event only accepts college emails; the rule is in the same SQL statement."

**2:00 - Gate day (45 s).** Log in as the volunteer, open the scanner for HackIPU, paste Asha's ticket into the fallback box (I only tested the paste path in a browser, not a real phone camera, so say so if you show the camera): green "Checked in, Asha Sharma". Paste it again: red "Already checked in, by whom and when". "One conditional UPDATE again, so eight phones scanning one ticket still check in once."

**2:30 - Chaos Lab (15 s, optional).** Race demo page, scroll to Chaos Lab, leave every failure ticked, Run: "double clicks, dead Redis, cancellations, expiries; every check passes." Tick Sabotage, run again: red, seats taken far above capacity. "Same checker, broken code: it is not rigged."

**2:45 - Close (15 s).** "Organizer dashboard shows live seats, registrations with keyset pagination, a streamed CSV, and an audit log written in the same transaction as each change. Redis is an optional layer: roughly double the throughput on a sold-out rush in my measurements, no help on the success path, and I can say exactly why." Stop; ask what they would like to dig into.

If the demo breaks: say what failed, show `docs/RESULTS.md`, and walk through section 3 below on a whiteboard. The explanation is the product.

---

## 3. The lost-update timeline

Event has `seats_left = 1`. Requests A and B arrive at the same time. **Naive code** (`routes/demo.js`, `book-naive`):

| Time | Request A | Request B | `seats_left` in DB | Bookings |
|---|---|---|---|---|
| t1 | `SELECT seats_left` returns 1 | | 1 | 0 |
| t2 | | `SELECT seats_left` returns 1 | 1 | 0 |
| t3 | `if (1 > 0)` passes | `if (1 > 0)` passes | 1 | 0 |
| t4 | `UPDATE SET seats_left = 1 - 1` (writes 0) | | 0 | 0 |
| t5 | | `UPDATE SET seats_left = 1 - 1` (writes 0 again) | 0 | 0 |
| t6 | `INSERT booking` | `INSERT booking` | **0** | **2** |

One seat, two bookings, and the counter says everything is fine. B's write was computed from a value (1) that A had already made stale.
With hundreds of requests the counter barely moves while bookings pile up (our run: 54 bookings for 20 seats).

**SeatLock** (`services/hold.js`, `holdInPostgres`), same start:

| Time | Request A | Request B | `seats_left` |
|---|---|---|---|
| t1 | `UPDATE ... SET seats_left = seats_left - 1 WHERE id=1 AND seats_left > 0`: takes the row lock, evaluates `1 > 0`, writes 0 | `UPDATE ...` same statement: **blocks waiting for the row lock** | 1, then 0 |
| t2 | `INSERT booking`, COMMIT, lock released | still waiting | 0 |
| t3 | | lock acquired; Postgres **re-evaluates the WHERE on the new row**: `0 > 0` is false, 0 rows updated | 0 |
| t4 | returns 201 | code sees `rowCount === 0`, runs `diagnoseFailure`, returns `409 SOLD_OUT` | 0 |

The difference: the decision ("is there a seat?") is made *inside* the write, while holding the lock, on the current value, instead of
in the application on a value read earlier.

---

## 4. Request walkthrough: one click on "Register"

Follow one logged-in student clicking Register on `/e/hackipu-2026`, with Redis on.

1. **Browser.** `frontend/src/components/RegisterPanel.tsx`, function `register()`. It creates an idempotency key **once per attempt** (and reuses it if the request is retried) and calls `api('/events/:id/hold', ...)` from `frontend/src/lib/client.ts`.
2. **Same-origin proxy.** The call goes to `/api/events/:id/hold` on the *website*. `frontend/next.config.ts` (`rewrites`) forwards it to `API_URL`. The auth cookie travels with it because to the browser it is a first-party cookie.
3. **Express setup.** `backend/src/app.js`, `createApp`: `requestLogger` (`logger.js`) assigns an `X-Request-Id` using `AsyncLocalStorage`; the `no-store` header; `express.json` with a 100 kb limit.
4. **Route.** `backend/src/routes/bookings.js`, `POST /events/:id/hold`. Middleware order: `requireAuth` then `limit`.
   - `requireAuth` is `authMiddleware(ctx).requireAuth` in `backend/src/middleware/auth.js`: verifies the JWT from the httpOnly cookie, **reloads the user from the database** (so role changes apply immediately), and runs the `Origin` check for cookie-authenticated writes.
   - `limit` is `rateLimit(...)` from `backend/src/ratelimit.js`: a per-user fixed-window counter in Redis (or in memory), `429 RATE_LIMITED` with `Retry-After` if exceeded.
5. **Validation.** The handler reads the `Idempotency-Key` header (missing: `400 IDEMPOTENCY_KEY_REQUIRED`) and parses the event id with `idParam` (`util.js`).
6. **Service.** `holdSeat(ctx, {eventId, user, key})` in `backend/src/services/hold.js`.
7. **Redis admission (optional).** `ctx.redis.admit(eventId, userId)` in `backend/src/redisLayer.js`. First a `GET` of the `soldout` flag: set means answer `409 SOLD_OUT` immediately with no database work. Otherwise the Lua `GATE_LUA` decides atomically: admitted (counter decremented, user added to the holders set), sold out, already a holder, or "keys missing, ask Postgres".
8. **Postgres transaction.** `tx(pool, fn)` in `backend/src/db.js` runs `holdInPostgres`:
   1. Replay check: does `(user_id, idempotency_key)` already exist? Return that booking with `created: false` (status 200).
   2. Cheap early exit: does this user already hold an active booking? `409 ALREADY_REGISTERED` (the unique index is the real guard).
   3. **The atomic seat grab:** the conditional `UPDATE events ... WHERE seats_left > 0 AND status='PUBLISHED' AND registration_opens_at <= now() AND ... AND (allowed_email_domains IS NULL OR $2 = ANY(allowed_email_domains))`. Zero rows means `diagnoseFailure` runs one `SELECT` to say exactly why (not open, closed, ended, cancelled, not eligible, or sold out).
   4. `INSERT INTO bookings ... status 'HELD', hold_expires_at = now() + make_interval(mins => hold_minutes)`. A failure here rolls the whole transaction back, including the decrement.
9. **Edge handling after the transaction.** If a unique index was violated (a concurrent duplicate), `resolveDuplicate` decides between "replay the winner's booking" and "already registered". If Redis admitted the request but Postgres did not create a new seat, `redis.compensate` undoes the Redis change. If this was the last seat, `redis.markSoldOut` sets the 30 s flag. These happen **after** commit.
10. **Response.** `res.status(created ? 201 : 200).json({ booking })`, including `hold_seconds_left` computed by the database.
11. **Errors on any step.** Thrown `AppError`s (or mapped Postgres errors) reach `errorHandler` in `backend/src/errors.js`, which returns `{error:{code,message,details}}`; unknown errors become a generic 500 with the stack only in the log.
12. **Back in the browser.** `RegisterPanel.startHold` starts the countdown from `hold_seconds_left` using `performance.now()`. The user fills the questions (`QuestionField.tsx`), and `confirm()` calls `POST /bookings/:id/confirm`.
13. **Confirm.** `confirmBooking` in `backend/src/services/booking.js`: owner-only lookup, `validateAnswers` (`backend/src/questions.js`) builds a zod schema from the event's questions and rejects bad answers with field errors, then the conditional `UPDATE ... WHERE status='HELD' AND hold_expires_at > now()`. Zero rows: work out whether it expired (`410 HOLD_EXPIRED`), was cancelled, or a duplicate request already confirmed it (return that booking: idempotent).
14. **Ticket.** `GET /bookings/:id/ticket` in `routes/bookings.js` calls `makeTicket` (`backend/src/tickets.js`); the page `frontend/src/app/me/tickets/[bookingId]/page.tsx` draws it with `QrTicket.tsx`.
15. **In the background.** `startSweeper` (`backend/src/sweeper.js`) releases holds that were never confirmed; `startReconciler` (in `redisLayer.js`) repairs Redis drift.

---

## 5. File-by-file guide

### Backend: `backend/`

| File | Responsibility |
|---|---|
| `src/server.js` | Entry point: builds `ctx`, starts the sweeper and Redis sync/reconciler, graceful shutdown (stop sweeper, drain in-flight requests, close Redis and the pool) |
| `src/app.js` | `createApp(ctx)`: middleware order, `/health`, mounts routers (demo only if `enableDemo`) |
| `src/config.js` | `loadConfig(env)`: reads and validates env vars; refuses weak secrets and `ENABLE_DEMO` in production |
| `src/db.js` | `createPool` (timeouts) and `tx(pool, fn)` (BEGIN/COMMIT/ROLLBACK, always releases the client, retries deadlocks) |
| `src/errors.js` | `AppError`, `translatePgError` (constraint name to client error), `errorHandler`, `notFoundHandler` |
| `src/logger.js` | JSON-lines logger and `requestLogger` (request id via `AsyncLocalStorage`) |
| `src/util.js` | `parse` (zod to 422), `idParam`, `limitParam`, `likePattern` (escapes `%`/`_`), shared column lists, `REG_STATE_SQL` |
| `src/middleware/auth.js` | `signToken`, cookie helpers, `authMiddleware` (`optionalAuth`, `requireAuth`, origin check), `requireRole` |
| `src/ownership.js` | `getOwnedEvent`: organizer-or-admin check, 404 for non-owners, optional `FOR UPDATE` |
| `src/audit.js` | `audit(client, ...)`: writes an audit row using the caller's transaction client |
| `src/questions.js` | `questionsSchema`, `validateAnswers` (runtime zod schema), `checkQuestionEditAllowed` |
| `src/tickets.js` | `makeTicket` / `verifyTicket` (HMAC-SHA256, `timingSafeEqual`, previous-secret rotation) |
| `src/ratelimit.js` | Fixed-window limiter: Redis counter, in-memory fallback |
| `src/redisLayer.js` | The optional Redis layer: Lua gate/release, sold-out flag, compensation, reconcile, lazy init, graceful degradation |
| `src/mailer.js` | Optional Resend email (ticket link, waitlist promotion); after commit, failures swallowed |
| `src/services/waitlist.js` | `joinWaitlist`, `leaveWaitlist`, `promoteWaitlist` (in-transaction seat transfer), `afterPromotion` |
| `src/sweeper.js` | `sweepOnce` (the `SKIP LOCKED` CTE) and `startSweeper` |
| `src/services/hold.js` | `holdSeat`, `holdInPostgres`, `diagnoseFailure`, `resolveDuplicate`: the core |
| `src/services/booking.js` | `confirmBooking`, `cancelBooking` |
| `src/services/raceDemo.js` | `runRace`: fires N concurrent requests at a throw-away event and reports the invariant |
| `src/routes/auth.js` | register, login, logout, me; per-IP rate limit; dummy-hash timing equalisation |
| `src/routes/public.js` | public event list/detail, `.ics` calendar file, `/config` |
| `src/routes/bookings.js` | hold, confirm, cancel, my bookings, one booking, ticket |
| `src/routes/events.js` | Organizer CRUD: create (slug), patch (question rules), publish, capacity, cancel, complete, delete |
| `src/routes/eventOps.js` | stats, registrations (keyset), CSV stream, audit, staff, `/me/staff-events` |
| `src/routes/checkin.js` | `POST /checkin`: verify signature, check staff, `preview` mode, one conditional UPDATE, attendee details, precise failure reasons |
| `src/routes/admin.js` | Admin stats, all-events list, user search and role change (cannot demote self) |
| `src/routes/uploads.js` | Signs Cloudinary upload parameters (the browser uploads directly) |
| `src/routes/demo.js` | The deliberately racy `book-naive` and `POST /demo/race` (only with `ENABLE_DEMO`) |
| `db/migrations/001_init.sql`, `002_waitlist.sql` | The schema and every integrity rule; `db/migrate.js` runs migrations; `db/reset.js` wipes a dev DB |
| `scripts/` | `seed.js`, `race-demo.js`, `loadtest.js` |
| `test/` | `race.test.js`, `product.test.js`, `ops.test.js`, `redis.test.js`, `waitlist.test.js`, `waitlist-redis.test.js`, `checkin-details.test.js`, `mail.test.js`, `admin.test.js`, shared `helpers.js` |

### Frontend: `frontend/src/`

| File | Responsibility |
|---|---|
| `lib/server.ts` | `serverFetch` (forwards the cookie to the API from Server Components), `getUser` |
| `lib/client.ts` | Browser `api()` helper and `ApiError`; always calls `/api/*` on our own origin |
| `lib/format.ts` | IST date formatting, datetime-local conversion, `safeNext` (blocks open redirects) |
| `app/page.tsx` | Public event list |
| `app/e/[slug]/page.tsx` | Event page: `generateMetadata` (Open Graph), details, `RegisterPanel` |
| `app/e/[slug]/og/route.tsx` | Generated Open Graph image |
| `components/RegisterPanel.tsx` | The registration state machine in the browser: hold, countdown, form, confirm, release, errors, polling seats |
| `app/me/page.tsx`, `app/me/tickets/[bookingId]/page.tsx` | My registrations, the QR ticket |
| `app/dashboard/**` | Organizer dashboard, event manager (`EventManager.tsx`, tabs), new event, scanner page, race demo |
| `components/Scanner.tsx` | Camera scanner, debounce, full-screen green/red result with attendee details, verify-only toggle, paste fallback, self-hosted decoder |
| `components/EventForm.tsx`, `QuestionBuilder.tsx` | Create/edit event, with locked-question hints |
| `components/RegistrationsPanel.tsx`, `StaffPanel.tsx`, `AuditPanel.tsx` | Registrations (keyset "load more"), volunteers, activity |
| `app/admin/page.tsx`, `components/AdminPortal.tsx`, `AdminEvents.tsx`, `AdminUsers.tsx` | Admin overview, all events, user list and role changes |
| `components/Markdown.tsx` | Safe Markdown rendering |
| `next.config.ts` | The `/api/*` rewrite |

---

## 6. Edge cases mapped to code

| Edge case | Where it is handled | Test |
|---|---|---|
| Two people, last seat | `holdInPostgres` conditional `UPDATE` | `race.test.js`: 200 simultaneous holds on 20 seats |
| Counter forced negative by a future bug | `events_seats_range` CHECK, mapped to `409 CAPACITY_CONFLICT` in `errors.js` | capacity tests in `product.test.js` |
| Same person, two tabs, two keys | `bookings_one_active_per_user` partial unique index, `resolveDuplicate` | "same user, two different idempotency keys at once" |
| Network retry of the same request | `bookings_user_idem_key`, replay returns 200 | "idempotent retry ... even concurrently" |
| Same key used for another event | `422 IDEMPOTENCY_KEY_REUSED` in `holdInPostgres` / `resolveDuplicate` | `race.test.js` |
| Hold expired but sweeper has not run | `confirmBooking` checks `hold_expires_at > now()` itself, `410` | "confirm: expired hold => 410, even if the sweeper has not run" |
| Two sweepers at once | `FOR UPDATE SKIP LOCKED` in `SWEEP_SQL` | "two sweepers at once never double-release" |
| Sweeper racing a cancel or confirm | all three are conditional UPDATEs naming the expected state | "sweeper racing user cancels and confirms" |
| Confirm clicked twice | conditional `UPDATE`, second sees `CONFIRMED` and returns it | "confirming the same hold twice at once confirms exactly once" |
| Cancel twice / after check-in | `cancelBooking` conditional `UPDATE` with `checked_in_at IS NULL`, `409` | "double cancel is 409" |
| Registration not open / closed / ended / cancelled | `WHERE` clause + `diagnoseFailure` using DB `now()` | "registration window uses database time" |
| Wrong email domain | `$2 = ANY(allowed_email_domains)` in the `WHERE`, `403 NOT_ELIGIBLE` | "eligibility by email domain" |
| Capacity lowered below active bookings | one `UPDATE` adjusting both columns; CHECK rejects | "reduction below active bookings is rejected" |
| Capacity changed while bookings happen | `seats_left + (new - old)` evaluated on the locked row | "capacity change racing holds keeps the invariant" |
| Event cancelled with live bookings | one transaction cancels every booking and resets seats (`routes/events.js`, cancel) | "cancelling an event cancels every active booking" |
| Questions edited after bookings exist | `checkQuestionEditAllowed`, event row locked | "question edits: free before any booking; append-only-optional afterwards" |
| Answers invalid or missing | `validateAnswers` runtime schema, `422` with `details.fields` | "confirm: valid answers confirm; invalid ... rejected" |
| Forged or edited ticket | `verifyTicket` before any DB access | "forged, tampered, malformed and foreign-secret tickets" |
| Ticket scanned from many phones at once | `UPDATE ... WHERE checked_in_at IS NULL` in `checkin.js` | "scanned from several devices at once checks in exactly once" |
| Volunteer of another event scans | staff check in `checkin.js`, `403 NOT_STAFF` | "only staff of THIS event may check in" |
| Ticket for the wrong gate | `event_id` mismatch, `400 WRONG_EVENT` | same test |
| Someone probing booking/event ids | owner-only queries answer 404 for others | "ownership" and ticket tests |
| Role changed while logged in | user reloaded from DB per request (`middleware/auth.js`) | "role enforcement" |
| Redis down or killed mid-traffic | `safe()` wrapper in `redisLayer.js` degrades to Postgres, logs it | "Redis dying mid-traffic: no errors, no overselling" |
| Redis counter drifts | reconcile with 250 ms re-check, logged; drift only causes false sold-out | "drift can only cause FALSE SOLD OUT" |
| Redis restarted and empty | gate returns -2, `lazyInit` rebuilds | "uninitialised keys" |
| Two API instances | no in-process state that matters | "two API instances sharing Redis and Postgres" |
| Deadlock between sweeper and cancel | `tx()` retries `40P01` and `40001` twice | no dedicated deadlock test; the sweeper/cancel race tests pass, but I did not force a deadlock |
| CSV of 500k rows | `pg-query-stream` + `pipeline`, flat memory | "3000 rows ... flat memory use" |
| Client hangs up mid-CSV | `pipeline` destroys the cursor, connection released | "client hang-up mid-stream releases the database connection" |
| Spreadsheet formula in an answer | `csvCell` neutralisation in `eventOps.js` | "CSV export streams correct CSV ... neutralised formulas" |
| Audit and change out of sync | `audit(client, ...)` in the same transaction | "rolled-back actions leave nothing" |
| Brute-force login | per-IP rate limit, `429` with `Retry-After`; dummy hash equalises timing | "rate limiting" |
| Email already registered at the same moment | `users_email_key` UNIQUE mapped to `409 EMAIL_TAKEN` | auth tests |
| Someone jumps the queue when a seat frees up | seat is transferred to the first waiter inside the freeing transaction (`promoteWaitlist`) | "a newcomer cannot jump the queue" |
| Everyone cancels while many wait | per-event row lock serialises promotions; FIFO by waitlist id | "everyone cancels at once while 30 people wait" |
| Waiter already has a seat / domain no longer allowed | dropped without consuming a seat in `promoteWaitlist` | `waitlist.test.js` join rules |
| Redis after a promotion | `afterPromotion` rebuilds the event's keys from Postgres | `waitlist-redis.test.js` |
| Email provider down | mail is after commit, un-awaited, errors swallowed | "a provider outage does not break the confirmation" |
| Volunteer wants to look, not consume, a ticket | `preview: true` in `checkin.js` | "preview changes nothing" |
| Slug collision | `UNIQUE` + `SAVEPOINT` retry with a suffix in `routes/events.js` | "slugs" |

---

## 7. Questions and answers (40 core, plus 10 bonus)

### Concurrency and correctness

**1. What is the core problem?**
Overselling under concurrency. If the app reads `seats_left`, checks it, and writes it back in separate steps, two simultaneous requests both see the last seat and both take it. It is a lost update (timeline in section 3).

**2. How do you prevent it?**
One statement: `UPDATE events SET seats_left = seats_left - 1 WHERE id = $1 AND seats_left > 0 AND ...`. The database locks the row, checks and writes together, and a competing transaction waits, re-evaluates the `WHERE` on the new value, and updates zero rows. Zero rows affected means "no seat".

**3. Why not `SELECT ... FOR UPDATE`?**
It is correct, but it takes two round trips while holding a lock, and safety depends on every code path remembering it. The conditional `UPDATE` is one round trip and cannot be used wrongly. I do use `FOR UPDATE` where I really must read and then decide (publish, capacity change, cancel event).

**4. Why not optimistic locking?**
With a version column, every writer except one fails and retries. During a rush almost all requests conflict, so retries multiply the load exactly when the system is busiest. Optimistic locking is for rows that are rarely contended; this row is the most contended in the system.

**5. Why not `SERIALIZABLE`?**
It is correct but works by aborting transactions that conflict, so under contention many requests fail with `40001` and each needs retry logic. A single conditional `UPDATE` already solves the problem more cheaply.

**6. Couldn't you just use a lock in Node?**
No. A mutex only serialises requests inside one process. With two API instances there are two mutexes and the race is back. Only the database is shared by every instance, so the database must decide. I have a test that runs two real instances against one database.

**7. What happens if the application has a bug that skips the check?**
Two more layers exist in the database: `CHECK (seats_left >= 0 AND seats_left <= capacity)` rejects a negative counter, and a partial unique index stops one user holding two seats. The application is the first guard, not the only one.

**8. What is a lost update, precisely?**
Two transactions read the same value, each computes a new value from it, and the second write silently overwrites the first, so one change is lost. Here both write `1 - 1 = 0` when two seats should have gone.

**9. Why a transaction at all if one `UPDATE` is atomic?**
The hold needs two writes that must succeed or fail together: decrement the counter and insert the booking. If the insert fails (duplicate user, duplicate key), the rollback also undoes the decrement so a seat cannot leak.

**10. What is an idempotency key and why is it needed?**
A client-generated unique id for one logical attempt, sent in a header. Networks and impatient users retry; without a key a retry would take a second seat. With it, the second request returns the original booking (status 200 instead of 201) and consumes nothing. It is a unique index on `(user_id, idempotency_key)`, scoped per user so keys cannot collide or leak between users.

**11. Tell me about a bug you found in your own code.**
Two requests with the same key arriving at once returned `[201, 409]` instead of `[201, 200]`. Both violated a unique index, and Postgres reports whichever index it checks first, so my code concluded "already registered" even though the loser was just a retry of the winner. The fix in `resolveDuplicate` is to check the idempotency key first. A test caught it; I did not find it by reading.

**12. Why do time checks use `now()` from the database?**
Servers' clocks disagree, and a student's laptop clock can be hours wrong. One database clock gives one consistent answer to "has registration opened?" and "has the hold expired?". The browser countdown starts from `hold_seconds_left` computed by the database.

### Holds, sweeper, state machine

**13. Why holds instead of taking the seat at the end?**
The form has custom questions. If the seat were taken at the last click, someone could fill in a long form and then be told "sold out". Taking the seat first and giving five minutes to finish is what ticketing sites do.

**14. How are expired holds released?**
A sweeper in each API process runs a single SQL statement every 30 s that marks expired `HELD` rows `EXPIRED` and adds the seats back, in one statement, using `FOR UPDATE SKIP LOCKED` so several sweepers never process the same row.

**15. What if the sweeper is down or late?**
Correctness does not depend on it: `confirmBooking` itself requires `hold_expires_at > now()`, so an expired hold can never be confirmed. A late sweeper only delays when the seat reappears. The sweeper is idempotent, so it catches up on the next run.

**16. Why not release seats with Redis key expiry events?**
Keyspace notifications are fire-and-forget: if the subscriber is not connected at that instant, the message is lost forever and the seat leaks. A polling query over the source of truth cannot lose anything.

**17. What does `SKIP LOCKED` do?**
When selecting rows `FOR UPDATE`, rows already locked by another transaction are skipped instead of waited for. Two sweepers therefore take different batches and never double-release a seat. It is the standard pattern for work queues in Postgres.

**18. How do you stop illegal state changes (confirming an expired hold, cancelling twice)?**
Every transition is a conditional `UPDATE` whose `WHERE` names the expected current state. An illegal transition matches zero rows and changes nothing; the code then reads the row to produce a precise error.

### Redis

**19. Why add Redis at all?**
To speed up rejections. After sell-out thousands of requests would each open a Postgres transaction just to be told no. Redis answers "sold out" with one `GET`. In my measurements that roughly doubled throughput on a sold-out rush (about 1,200 vs 550-685 requests/s on a small shared machine), and did *not* help the success path (slightly slower, about 360 vs 400 requests/s).

**20. Can Redis cause overselling?**
No, by design. The Postgres conditional `UPDATE` still runs for every request Redis lets through. If Redis is wrong it can only reject too early (false sold-out) or let extra requests reach Postgres, which says no.

**21. What if Redis crashes in the middle of traffic?**
Every Redis call is wrapped; on error it behaves as "no opinion" and the request goes to Postgres, with a throttled warning in the log. Tested: Redis killed mid-traffic gives only 201s and 409s, never a 5xx, and no oversell.

**22. What is the Lua script for?**
It does "keys exist? user already holds one? seats > 0? decrement and record" as one indivisible step, because Redis runs a script without interleaving other commands. Separate `GET` then `DECR` calls would have the same race we are fixing in Postgres.

**23. What is compensation?**
If Redis admitted a request but Postgres did not hand out a new seat (sold out, duplicate, validation), the Redis decrement must be undone, otherwise Redis slowly drifts toward "sold out". The release script gives the seat back and, if appropriate, removes the user from the holders set.

**24. How is drift repaired?**
A reconciler compares Redis with Postgres every 60 s, re-checks 250 ms later (in-flight requests cause brief, harmless differences), and rebuilds the event's keys if still different, logging each correction. Drift can only cause false "sold out", never an oversell.

**25. Why does the sold-out flag have a TTL?**
So that a missed "seat returned" message can never leave an event stuck as sold out: it heals itself after 30 seconds.

**26. What are the curly braces in `event:{12}:seats`?**
A Redis Cluster hash tag: keys with the same tag land in the same slot, which Lua scripts touching several keys require. Not needed on a single Redis, but free insurance.

**27. Is two-store consistency a problem?**
There is no transaction across Postgres and Redis, so they can disagree after a crash. I chose which one is the truth (Postgres), allowed Redis to be wrong only in the safe direction, apply Redis changes only after the Postgres commit, and reconcile. That is a design trade-off, not an accident.

### Tickets, auth, security

**28. Why a signed QR instead of the booking id?**
Ids are guessable (1, 2, 3). The token includes an HMAC-SHA256 signature that only someone with `TICKET_SECRET` can produce, so a forged ticket is rejected before touching the database. The scanner still checks live state, so a cancelled booking's QR is refused.

**29. What if `TICKET_SECRET` leaks?**
An attacker could mint tickets for any id. Rotate: put the new secret in `TICKET_SECRET` and the old one in `TICKET_SECRET_PREVIOUS`; existing tickets still verify; new ones use the new secret; when the event is over remove the old one. A forged ticket must still name a real, confirmed, unscanned booking of an event the scanner staffs, which limits the damage.

**30. Why `timingSafeEqual`?**
A normal string comparison stops at the first different byte, so response time could reveal how much of a guessed signature was right. `timingSafeEqual` takes the same time regardless.

**31. How is auth done?**
bcrypt for passwords; a JWT in an httpOnly, SameSite=Lax cookie so page JavaScript cannot read it; the user is re-read from the database on each request so role changes take effect immediately. Login compares against a dummy hash when the email is unknown, so timing does not reveal which emails exist.

**32. How do you handle CSRF?**
SameSite=Lax stops browsers sending the cookie on cross-site POSTs; additionally, when `ALLOWED_ORIGINS` is set, a cookie-authenticated write with an unrecognised `Origin` header gets `403 BAD_ORIGIN`.

**33. How do you prevent XSS?**
React escapes everything by default; organizer Markdown goes through `react-markdown`, which never uses `innerHTML`, ignores raw HTML, and we also drop images and force safe `rel` on links; banner URLs must be `https`. The CSV export separately neutralises spreadsheet formulas, because Excel is a different interpreter.

**34. What stops an organizer reading another organizer's data?**
`getOwnedEvent` returns 404 (not 403) for anyone who is not the owner or an admin, so ids cannot even be probed. Every organizer route goes through it, and a test asserts it.

### Data, API, scale

**35. Why raw SQL and not an ORM?**
The core of this project (conditional updates, `SKIP LOCKED`, partial indexes, streaming cursors) is exactly what ORMs hide or make awkward, and I wanted every statement visible and explainable. All queries are parameterized. The cost is more typing and no automatic migrations.

**36. Why keyset pagination?**
`OFFSET n` makes the database read and discard n rows, so deep pages get slower; keyset (`WHERE id > $cursor ORDER BY id LIMIT n`) uses the index and is constant-cost. It also never skips or repeats rows when new rows arrive while paging. The trade-off is no "jump to page 17".

**37. How does the CSV export handle a huge event?**
It streams from a Postgres cursor through `pipeline` to the response, so memory stays flat, back-pressure reaches the database, and a client disconnect destroys the cursor and releases the connection. It also writes a UTF-8 BOM and neutralises formulas.

**38. Why are audit entries written in the same transaction?**
So the record and the change cannot disagree: written after the commit, a crash would lose the record of something that happened; written before, it could record something rolled back. Same transaction means both or neither.

**39. How would you scale this to a million requests?**
Not by making Postgres faster first. In order: keep most requests away (waiting room, CDN, static sold-out page), reject cheaply (Redis, avoid the per-request user lookup), run more stateless API instances, then address the real ceiling, the single hot `events` row, by sharding the counter or pre-allocating seats in Redis. Add a connection pooler. I have not measured any of this beyond one small machine; the plan is in DESIGN.md section 20.

**40. How would you add payments?**
The hold already reserves the seat while someone pays. Create the Razorpay order on the server, move the booking to a payment-pending state with an extended hold, and confirm only from the verified webhook (signature check), using a conditional update and a unique payment-id index so a re-delivered webhook is idempotent. The hard case is payment arriving after the hold expired and the seat was resold: detect the zero-row update and refund automatically. Not built; plan in DESIGN.md section 21.

### Bonus questions you may get

**41. Why Next.js and not Vite?**
Link previews. WhatsApp and Slack crawlers do not run JavaScript, so they need the Open Graph tags in the server-rendered HTML; a Vite single-page app gives them an empty shell. Server Components also let public pages fetch with the visitor's cookie without a loading spinner.

**42. Why proxy `/api` through Next.js?**
So the login cookie is first-party. The API is on another domain in production, and cookies it sets would be third-party cookies, which Safari and increasingly Chrome block.

**43. Why polling instead of SSE or WebSockets?**
Every open connection occupies a socket and a server slot for as long as the page stays open; thousands of students watching a rush would hold thousands. Polling every 3 s (paused when the tab is hidden) is stateless and good enough for "seats left"; the real protection is the server-side gate.

**44. How does the waitlist avoid letting someone jump the queue?**
A freed seat is transferred to the first waiter in the same transaction that freed it (cancel, sweeper, capacity raise). `seats_left` never shows a positive number while a live waiter exists, so a newcomer's hold gets `409 SOLD_OUT`. The row id is the queue order, so FIFO needs no extra column.

**45. Does the waitlist break the "never oversell" invariant?**
No. A waiting person holds no seat and is not counted. Promotion is "release one seat, take one seat" inside one transaction, so active bookings never exceed capacity; the same invariant check runs after the 20-cancels-30-waiting test, with and without Redis.

**46. What happens if the promoted person never shows up?**
Their hold (15 minutes by default) expires, the sweeper releases it, and the same transfer logic promotes the next person. No manual step.

**47. Why is the QR just a signed id, and not the attendee's details?**
Data in the QR would be unrevocable (a cancelled ticket would still look valid), would leak personal data to anyone who photographs it, and would be easier to forge. The server looks up the live booking on every scan and returns the details to authorised staff only.

**48. What does "verify only" do and why is it safe?**
`preview: true` runs the same signature check and permission check, reads the booking, and returns the attendee and answers without writing. It requires the same staff access, so it cannot be used to read attendee data you are not allowed to see.

**49. What happens when the API restarts during a request?**
Graceful shutdown stops accepting connections, waits for in-flight requests, then closes Redis and the pool. A request that dies mid-transaction rolls back (nothing half-written), and `idle_in_transaction_session_timeout` stops an abandoned transaction holding locks.

---

**50. How do you know it never oversells? Did you just assume?**
Two answers. First, the design: the check and the decrement are one statement, with a `CHECK` constraint and unique indexes underneath. Second, evidence: the Chaos Lab fires a crowd of real HTTP requests at a throwaway event while I switch on double-click retries, a second tab, Redis dying mid-rush, cancellations, expiring holds and the waitlist. Then `integrity.js` recomputes every number from the raw bookings, with each rule written in plain words. A "sabotage" switch swaps in the naive read-then-write code and the verdict goes red (in one run: 296 seats taken of 25), so the checker is not just always green. It is still evidence from one machine, not a formal proof, and it does not kill Postgres or run several API instances.

## 8. What it does not do yet

Be upfront about all of this.

- **No payments.** Registration is free. The design for Razorpay is written (DESIGN.md section 21) but not coded.
- **Waitlist notifications are email only, and email is untested against the real provider.** The mail code is tested against a fake provider; with no Resend key nothing is sent and promoted people only see their hold on the website. No SMS or push, no reminders, no "decline this seat" button.
- **The waitlist is first-come, first-served with no priority rules** and gives the promoted person one fixed-length hold (`WAITLIST_HOLD_MINUTES`).
- **No offline scanning.** The scanner needs a connection to the API for every scan. An offline design is sketched in DESIGN.md section 7.
- **No virtual waiting room, no fairness guarantees beyond "first to reach the database".** Sketched in section 17 of DESIGN.md.
- **Throughput is unproven beyond one small machine.** The load tests ran the generator, the API, Postgres and Redis on 2 shared vCPUs, with each configuration run twice. Nothing was measured across a network, with several API instances under load, or on the deployment services.
- **The single hot row.** Successful holds all update one `events` row, so the success path has a ceiling (about 400 requests/s on the test machine). Sharding the counter is a known next step, not built.
- **The Chaos Lab is evidence, not proof.** It checks the state after a run on one machine with the listed failures; it does not kill Postgres or the API process, and it does not run several API instances.
- **Docker Compose and the deployment steps were not executed.** The build environment ran native Postgres and Redis and had no access to Render, Neon, Upstash or Vercel; the README's deployment section is a checklist written from documentation.
- **Cloudinary uploads were tested only as far as signing** (the signature and the hidden-when-unconfigured behaviour); an actual upload to a real Cloudinary account was not run.
- **Browser coverage is two headless Chromium runs** (22 checks on the core flows incl. a 390 px phone width, 18 on the waitlist, verify-only scanning and admin). No real phone camera test of the QR scanner (the paste fallback was exercised), no Safari or Firefox, no automated accessibility audit, no Lighthouse run.
- **Single database, single region, no backups configured**, no monitoring or alerting beyond JSON logs and `/health`.
- **Fixed-window rate limiting** allows up to 2x the limit across a window boundary.
- **Admin role changes are audited, but there is no UI for the audit log of non-event actions.**
- **Security review is by the author only.** No external penetration test.
