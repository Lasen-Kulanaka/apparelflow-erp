import pg from "pg";

// A "pool" keeps several database connections open and reuses them,
// which is much faster than opening a new connection per request.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase requires SSL
});

export const query = (text, params) => pool.query(text, params);