import pg from 'pg';

export function createPool(config) {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    // Fail fast instead of hanging forever if the pool is exhausted or the DB is slow.
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    // A request that dies mid-transaction must not hold row locks forever.
    idle_in_transaction_session_timeout: 15000,
  });
}

/**
 * Run `fn(client)` inside BEGIN/COMMIT. Rolls back on any error and ALWAYS releases the client.
 *
 * Deadlock retry: two transactions that touch the same rows in opposite order (for example the
 * sweeper updating bookings->events while an event cancellation updates events->bookings) can
 * deadlock. Postgres detects this and aborts one with code 40P01. Because `fn` only does database
 * work (side effects like Redis updates happen AFTER tx returns), re-running it is safe.
 */
export async function tx(pool, fn, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    let destroy = false;
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        destroy = true; // connection is in an unknown state: throw it away instead of reusing it
      }
      if ((err.code === '40P01' || err.code === '40001') && attempt < retries) continue;
      throw err;
    } finally {
      client.release(destroy);
    }
  }
}
