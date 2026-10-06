import { neon } from '@neondatabase/serverless';
import { personalArchive } from './personal-archive';

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
      if (personalArchive.ownerId) await sql`INSERT INTO archive_users (id) VALUES (${personalArchive.ownerId}) ON CONFLICT (id) DO NOTHING`;
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
      await sql`CREATE TABLE IF NOT EXISTS archive_rate_limits (
        identity_hash TEXT NOT NULL,
        scope TEXT NOT NULL,
        bucket BIGINT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (identity_hash, scope, bucket)
      )`;
      await sql`CREATE TABLE IF NOT EXISTS archive_media_objects (
        archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (archive_id, file_name)
      )`;
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}
