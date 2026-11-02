-- Waitlist: people waiting for a seat on a sold-out event, served first-come first-served.
-- A waiting person holds NO seat, so waitlist rows never count toward the capacity invariant.
-- When a seat frees up, the first waiter is turned into a normal HELD booking inside the SAME transaction
-- that freed the seat (services/waitlist.js), so the seat is never visible as "free" to someone else in between.
CREATE TABLE waitlist (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- the id IS the queue order
  event_id   bigint      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    bigint      NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_one_per_user UNIQUE (event_id, user_id)
);
CREATE INDEX waitlist_event_order ON waitlist (event_id, id);
