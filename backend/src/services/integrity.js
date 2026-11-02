// Integrity checker: re-derives the truth for ONE event from the bookings table and compares it with
// everything that is supposed to agree with it. It only reads. It can run on any event at any time
// (the organizer dashboard has a button for it) and the Chaos Lab runs it after every experiment.
//
// Each check states its rule in plain words so a failing check explains itself.

export async function checkEvent(ctx, eventId) {
  const { rows } = await ctx.pool.query(
    `SELECT e.capacity, e.seats_left,
            (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status IN ('HELD','CONFIRMED')) AS active,
            (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status = 'HELD' AND b.hold_expires_at IS NULL) AS held_without_deadline,
            (SELECT count(*)::int FROM (SELECT 1 FROM bookings b WHERE b.event_id = e.id AND b.status IN ('HELD','CONFIRMED')
                                         GROUP BY b.user_id HAVING count(*) > 1) d) AS people_with_two_seats,
            (SELECT count(*)::int FROM waitlist w WHERE w.event_id = e.id
                AND EXISTS (SELECT 1 FROM bookings b WHERE b.event_id = e.id AND b.user_id = w.user_id AND b.status IN ('HELD','CONFIRMED'))) AS waiting_and_seated,
            (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id) AS bookings_total
       FROM events e WHERE e.id = $1`, [eventId]);
  const f = rows[0];
  if (!f) return null;

  const checks = [
    { id: 'NO_OVERSELL', title: 'Never more seats handed out than exist',
      rule: 'count(HELD + CONFIRMED bookings) <= capacity', expected: `<= ${f.capacity}`, actual: f.active, ok: f.active <= f.capacity },
    { id: 'COUNTER_EXACT', title: 'The seat counter matches the bookings',
      rule: 'seats_left = capacity - count(HELD + CONFIRMED)', expected: f.capacity - f.active, actual: f.seats_left, ok: f.seats_left === f.capacity - f.active },
    { id: 'COUNTER_IN_RANGE', title: 'The seat counter is never negative or above capacity',
      rule: '0 <= seats_left <= capacity', expected: `0..${f.capacity}`, actual: f.seats_left, ok: f.seats_left >= 0 && f.seats_left <= f.capacity },
    { id: 'ONE_SEAT_PER_PERSON', title: 'Nobody holds two seats',
      rule: 'no user has more than one HELD/CONFIRMED booking for this event', expected: 0, actual: f.people_with_two_seats, ok: f.people_with_two_seats === 0 },
    { id: 'HOLDS_EXPIRE', title: 'Every hold has a deadline',
      rule: 'every HELD booking has hold_expires_at, so the sweeper can always free it', expected: 0, actual: f.held_without_deadline, ok: f.held_without_deadline === 0 },
    { id: 'WAITING_HOLDS_NOTHING', title: 'Nobody is both waiting and seated',
      rule: 'a waitlist row never belongs to a user who already has an active booking', expected: 0, actual: f.waiting_and_seated, ok: f.waiting_and_seated === 0 },
  ];

  // Redis is only a cache. Compare it too, but give in-flight requests a moment before calling it drift.
  if (ctx.redis) {
    const pgHolders = f.active;
    let seen = await ctx.redis.peek(eventId);
    const agrees = (s) => s && s.seats === f.seats_left && s.holders === pgHolders;
    if (seen && !agrees(seen)) { await new Promise((r) => setTimeout(r, 300)); seen = await ctx.redis.peek(eventId); }
    if (seen === null) checks.push({ id: 'REDIS_AGREES', title: 'Redis agrees with Postgres', rule: 'Redis seat counter and holder count equal the Postgres values', skipped: true, ok: true, expected: '-', actual: 'Redis has no keys for this event (it will rebuild them on demand)' });
    else checks.push({ id: 'REDIS_AGREES', title: 'Redis agrees with Postgres', rule: 'Redis seat counter and holder count equal the Postgres values',
      expected: `${f.seats_left} seats, ${pgHolders} holders`, actual: `${seen.seats} seats, ${seen.holders} holders`, ok: agrees(seen) });
  }

  return { event_id: String(eventId), ok: checks.every((c) => c.ok), bookings_total: f.bookings_total, checks };
}
