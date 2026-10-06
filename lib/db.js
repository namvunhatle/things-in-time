import { neon } from '@neondatabase/serverless';

let schemaPromise;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function database() {
  if (!databaseConfigured()) throw new Error('DATABASE_URL must be configured');
  return neon(process.env.DATABASE_URL);
}

export async function ensureDatabaseSchema() {
  if (!databaseConfigured()) return;
  if (!schemaPromise) {
    const sql = database();
    schemaPromise = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS archive_users (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`INSERT INTO archive_users (id) VALUES ('user_01') ON CONFLICT (id) DO NOTHING`;
      await sql`CREATE TABLE IF NOT EXISTS archives (
        id TEXT PRIMARY KEY,
        share_slug TEXT UNIQUE NOT NULL,
        document JSONB NOT NULL,
        revision BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS published_entries (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES archive_users(id),
        document JSONB NOT NULL,
        sort_key TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}
