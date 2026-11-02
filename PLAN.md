# SeatLock — build plan and status

Legend: [ ] todo · [~] in progress · [x] done (verified by running it in this session)

## Environment notes
- Built and tested in a Linux workspace with a real PostgreSQL 16.15 and Redis 7.0.15 (native binaries, not Docker —
  the workspace had no Docker daemon). `docker-compose.yml` is provided for your machine but was **not run** here.

## Phases
1. [x] Correctness core — layout, migrations, atomic hold, naive vs atomic race demo
2. [x] Product backend — auth/roles, events (draft/publish/slug/questions/eligibility), registration flow, idempotency, cancel, sweeper, capacity, event cancel, errors, logging
3. [x] Operations backend — tickets, check-in, staff, stats, keyset registrations, streaming CSV, audit, admin users, .ics, Cloudinary signing
4. [x] Scale layer — Redis rate limit, sold-out fast path, Lua gate, compensation, reconciliation, graceful fallback
5. [x] Proof — integration tests, load tests, docs/RESULTS.md (measured numbers only)
6. [x] Website — Next.js App Router + Tailwind
7. [x] Docs — README, docs/DESIGN.md, INTERVIEW.md
8. [x] Stretch — waitlist with automatic promotion (done in the completion pass, after everything else passed)

## Status log
(updated after every phase)

- Phase 1 done: migrations + runner, atomic hold (conditional UPDATE), naive endpoint, race demo. `node test/race.test.js` 7/7 pass (3 consecutive runs). Real race-demo run: naive 200 req/20 seats -> 50 bookings (oversold by 30); atomic -> exactly 20.
  - Bug found by tests & fixed: concurrent same-key requests returned 409 instead of replaying the winner (Postgres reports whichever unique index it checks first).
- Phases 2-4 done. `npm test`: 63/63 pass (race 7, product 27, ops 16, redis 13), ~23 s, against real Postgres 16 + Redis 7.
  - Phase 2 tests caught nothing new after the Phase 1 fix; Phase 4 test run exposed two wrong test assumptions (lazy-init counter is a snapshot; pg.Pool.query internally calls connect) and one real gap: no log line when Redis died mid-traffic. Fixed.
  - Design note: `is_demo` boolean added to `events` (not in the original data model) to hide race-demo events.
- Phase 5 done: `npm test` 63/63; `npm run loadtest` run twice (all 8 runs invariant held); docs/RESULTS.md written from the measured JSON. Seed script (`db:seed`, `db:seed:demo`) verified.
- Phase 6 done: Next.js 16 site (public pages with Open Graph, auth, register flow with hold countdown, QR ticket, organizer dashboard with tabs, scanner, race demo page, admin). `next build` and `tsc --noEmit` clean. A scripted headless-Chromium run (22 checks) passed: register + confirm + ticket, ineligible domain, organizer overview/registrations/CSV/team, volunteer scan (ok, duplicate, forged), admin, race demo, role gating, 404 page, OG image route, no horizontal scroll at 390 px.
  - Found by that run: the QR decoder downloads its WebAssembly from a public CDN by default (failed in the sandbox, and would fail on a bad network). Fixed by self-hosting it (`npm run copy-wasm`).
- Phase 7 done: README.md, docs/DESIGN.md, INTERVIEW.md. File and function names referenced in the docs were checked against the repo by script. Deployment steps and docker-compose are documented but were NOT executed.
- Final verification: `npm test` 63/63 (about 23 s), `next build` OK.
- Completion pass (user asked to finish the whole project; context: three portals, QR at the gate confirms everything):
  - Waitlist: migration 002, join/leave/me endpoints, `promoteWaitlist` called inside cancel / sweeper / capacity-increase transactions, event cancel and complete clear it, Redis rebuilt from Postgres after promotion, UI on the event page, /me and organizer stats. Tests: waitlist (9), waitlist with Redis (1).
  - QR scan now returns name, email, registration time and labelled answers; `preview: true` verify-only mode; scanner UI shows them and offers "Check in now". Tests: 2.
  - Optional email via Resend (ticket link, waitlist promotion), after commit, failures swallowed. Tests against a fake provider: 3.
  - Admin portal: `/admin/stats`, `/admin/events`, tabs Overview / Events / Users. Tests: 2.
  - `npm test`: 80/80 (~26 s). Load test re-run twice after the change (runs 3-4), invariant held in all runs. Browser: 22/22 core flows + 18/18 waitlist/scanner/admin flows. `next build` OK.
  - Environment note: the sandbox's Postgres/Redis were reset once during this pass and recreated (same versions).
