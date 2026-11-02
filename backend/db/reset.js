// Development helper: wipes the public schema and re-runs all migrations.
import pg from 'pg';
import { migrate } from './migrate.js';

if (process.env.NODE_ENV === 'production') { console.error('Refusing to reset a production database.'); process.exit(1); }
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
const pool = new pg.Pool({ connectionString: url });
try {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
} finally { await pool.end(); }
