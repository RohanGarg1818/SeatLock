# Measured results

Everything on this page was produced by running the commands shown, in the build session, on the machine below.
Nothing is estimated. Where something was **not** run, it says so.

## Machine and versions

| | |
|---|---|
| CPU | Intel Xeon @ 2.80 GHz, **2 vCPUs** |
| Memory | 8,028 MB |
| OS | Linux 6.18 x64 (a cloud sandbox VM) |
| Node.js | v22.23.4 |
| PostgreSQL | 16.15 (native install, default config except `max_connections=200`) |
| Redis | 7.0.15 (native install, default config) |
| API DB pool | `DB_POOL_MAX=20` |

**Important caveat:** the load generator (autocannon), the API process, PostgreSQL and Redis all ran on those same 2 vCPUs,
and PostgreSQL/Redis were not tuned. Absolute numbers are therefore low and only meaningful *relative to each other*.
A real deployment (separate database, more cores) would produce different absolute numbers. Not run: any test across
a network, against Neon/Upstash/Render, or with more than one API instance under load.

## 1. Correctness: the race demo

Command: `cd backend && npm run race-demo -- --capacity 20 --requests 200` (Redis enabled)

| mode | requests | response codes | bookings created | capacity | oversold by | invariant held |
|---|---|---|---|---|---|---|
| naive (read, then write back) | 200 | 201 x54, 409 x146 | **54** | 20 | **34** | **NO** |
| atomic (conditional UPDATE) | 200 | 201 x20, 409 x180 | 20 | 20 | 0 | yes |

Command: `npm run race-demo -- --capacity 200 --requests 1000`

| mode | requests | response codes | bookings created | capacity | oversold by | invariant held |
|---|---|---|---|---|---|---|
| naive | 1000 | 201 x542, 409 x458 | **542** | 200 | **342** | **NO** |
| atomic | 1000 | 201 x200, 409 x800 | 200 | 200 | 0 | yes |

The naive numbers vary run to run (it is a race); an earlier run of the first command, with Redis off, gave 50 bookings
(oversold by 30). The atomic mode gave exactly `capacity` every time it was run.
In naive mode `seats_left` also ends up wrong (here it read 0 although 54 bookings exist for 20 seats): the lost-update symptom.

## 2. Test suite

Command: `cd backend && npm test` (real PostgreSQL 16 test database + real Redis; no mocked database anywhere)

Result of the last full run in this session: **91 tests, 91 passed, 0 failed**, about 30 seconds.
Files: `race.test.js` (7), `product.test.js` (27), `ops.test.js` (16), `redis.test.js` (13), `waitlist.test.js` (9), `waitlist-redis.test.js` (1), `chaos.test.js` (11), `checkin-details.test.js` (2), `mail.test.js` (3), `admin.test.js` (2).
The concurrency tests run the core invariant query (`active bookings <= capacity` and `seats_left == capacity - active`) afterwards.
The Redis tests flush Redis database 1 and the test database is truncated per file, so run them only against a throw-away database
(the test helper refuses a database whose name does not contain "test").

What the suite covers, mapped to the requirements: hold -> confirm -> ticket -> check-in; 200/300 simultaneous holds on a
20-seat event (exactly 20 succeed, with and without Redis); same user with different idempotency keys at once (exactly one
succeeds); idempotent retries, including concurrent ones; invalid/missing custom answers; expired hold gives 410; three
sweepers at once on 600 expired holds release each seat exactly once; sweeper racing cancels and confirms; cancel returns a
seat; capacity cut below active bookings rejected; capacity changes racing holds; domain eligibility; registration window
using database time; forged/tampered/foreign-secret tickets; one ticket scanned from 8 devices at once checks in once;
cancelled booking and volunteer-of-another-event rejected; role enforcement on every organizer/admin route; drafts hidden
publicly; CSV with commas, quotes, CRLF, unicode and formula injection (round-tripped through a CSV parser), a 3,000-row
export that arrives in several chunks, and a client hang-up that releases its DB connection; Redis unreachable from the
start and killed mid-traffic (only 201/409, never 5xx); Redis drift both directions plus reconciliation; two API instances
sharing Redis and Postgres; rate limits shared across instances; waitlist (join rules, first-in-line promotion on cancel / expiry / capacity increase, 20 cancels at once with 30 waiting gives exactly the first 20 waiters a seat, nobody jumps the queue, same with Redis on and Redis agrees afterwards); scan details and verify-only mode; emails sent to a fake provider and a provider failure not affecting registration; admin stats and event list.

## 3. Load test

Command: `cd backend && npm run loadtest` (defaults: 10 s per run, 64 connections; `scripts/loadtest.js`)
The API is started as a separate child process with `NODE_ENV=production`, the booking rate limit raised to 10,000,000/min
(so the limiter is **not** being measured), and `SWEEP_INTERVAL_SECONDS=30`. Each request is `POST /events/:id/hold` by a
different pre-created user (JWT minted by the script) with a unique `Idempotency-Key`, so each request includes the
authentication lookup. Latencies are measured per response by autocannon and the percentiles are computed from every
sample. The whole script was run twice back to back **after the waitlist was added** (runs 3 and 4 below). The first two runs, made
before the waitlist existed, are kept as `docs/loadtest-run1.json` / `loadtest-run2.json` for comparison; nothing was discarded.
The waitlist adds one cheap `DELETE FROM waitlist WHERE event_id AND user_id` inside each successful hold.

Scenarios: **rush** = 500 seats, 20,000 distinct users (sold out after the first 500 successes, then almost every request
is a rejection); **open** = 100,000 seats, 40,000 distinct users (nearly every request writes a booking).

| scenario | mode | run | req/s | p50 ms | p95 ms | p99 ms | response codes | invariant |
|---|---|---|---|---|---|---|---|---|
| rush | postgres-only | 3 | 637.5 | 87.8 | 186.1 | 307.6 | 201 x500, 409 x5875 | held |
| rush | postgres-only | 4 | 605.6 | 92.9 | 182.9 | 331.5 | 201 x500, 409 x5556 | held |
| rush | redis-enabled | 3 | 1159.5 | 43.2 | 105.1 | 305.0 | 201 x500, 409 x11095 | held |
| rush | redis-enabled | 4 | 1228.0 | 42.7 | 86.9 | 270.0 | 201 x500, 409 x11780 | held |
| open | postgres-only | 3 | 381.5 | 152.1 | 276.1 | 360.6 | 201 x3815 | held |
| open | postgres-only | 4 | 383.2 | 150.7 | 277.6 | 381.9 | 201 x3832 | held |
| open | redis-enabled | 3 | 348.4 | 166.2 | 301.6 | 394.3 | 201 x3484 | held |
| open | redis-enabled | 4 | 358.2 | 161.1 | 294.4 | 405.4 | 201 x3582 | held |

For reference, the earlier runs 1 and 2 (before the waitlist): rush postgres-only 684.7 / 548.3 req/s, rush redis 1208.1 / 1186.6,
open postgres-only 395.8 / 406.8, open redis 366.4 / 357.5. The open (success-path) numbers are about 3-6% lower after the
waitlist, which is inside the run-to-run noise I saw (up to about 25% on the rush scenario), so I make no claim that the waitlist cost
anything measurable, and no claim that it cost nothing.

Zero connection errors and zero timeouts in all sixteen runs. After every run the invariant query was executed against the
database (`active bookings <= capacity` and `seats_left == capacity - active`) and held. Raw output:
`docs/loadtest-run1.json` to `loadtest-run4.json`.

### How to read these numbers (honest interpretation)

- **Rush scenario:** with Redis enabled throughput was roughly 2x (about 1,160-1,230 vs 550-685 req/s across all four runs) and p50 latency
  about half (about 43-44 ms vs 84-108 ms). That is the sold-out fast path working: after sell-out, rejections are answered
  without opening a Postgres transaction. Each request still pays for the user lookup that authenticates it, which is
  why the gain is about 2x and not more. p99 was not better with Redis (270-310 ms vs 271-332 ms); the tail is dominated by
  the 500 real bookings and by CPU contention on this 2-vCPU machine, so I make no claim about tail latency.
- **Open scenario:** Redis did **not** help here; it was slightly slower (about 348-366 vs 382-407 req/s) because every
  request pays an extra Redis round trip and the Postgres UPDATE still runs for every admitted request. That is expected:
  Redis is an optimisation for rejection-heavy rushes, not for the success path. The success path is limited by one hot
  `events` row that every booking must update.
- The ~400 req/s ceiling on the success path in this environment is not a statement about production capacity: the machine
  is 2 shared vCPUs. I did not profile where the time goes, so I do not claim a bottleneck.
- Each configuration was run four times in total (two before the waitlist, two after). The runs differ by up to about 25% (rush, postgres-only: 548 vs 685), so
  differences smaller than that should not be read as real.

## Not measured / not run

- No test with more than one API instance under load (correctness with two instances is tested; throughput is not).
- No test against the production services (Neon, Upstash, Render, Vercel). The deployment instructions in the README
  follow those services' documentation but were not executed.
- No browser-level or website performance measurement (no Lighthouse or similar run). The website was exercised by two scripted headless-Chromium runs (22 checks for the core flows; 18 for waitlist, promotion, verify-only scanning and the admin portal; all passed), which test behaviour, not speed.
- Email was tested only against a local fake provider, never against Resend itself.
- Docker / `docker-compose.yml` was not executed (the build sandbox has no Docker daemon). Postgres and Redis were run as native
  processes of the same versions family (PostgreSQL 16, Redis 7). The sandbox's Postgres and Redis were reset once mid-session and recreated with the same settings before the later runs.
- Latency of the rate limiter, the sweeper and the reconciler under load was not measured.


## Chaos Lab (measured in this build)

- `chaos.test.js` (11 tests): the checker passes on a healthy event; it fails when the counter is corrupted, when a seated person is also on the waitlist, and when Redis disagrees; five failure mixes (none, double-click plus second tab, Redis outage, cancellations plus expiry plus waitlist, everything at once) each ended with every check passing; sabotage ended with a failing verdict. The chaos tests were run three times in a row and passed each time.
- One browser run of the lab with every failure on and the real booking code: all 7 checks passed.
- One browser run with sabotage on, 300 people for 25 seats, everything else on: 1290 requests in 6198 ms, the checker reported 296 seats taken of 25 and a counter that said 25 free, two checks failed, and the sweeper was refused by the database `CHECK`. The numbers differ every run because it is a race.
- Not measured: Chaos Lab on a deployed server, with several API instances, or with Postgres itself being killed.
