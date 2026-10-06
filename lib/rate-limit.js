import 'server-only';
import { createHmac } from 'node:crypto';
import { database, databaseConfigured, ensureDatabaseSchema } from './db';

const localAttempts = new Map();

function identity(request, subject) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = subject || request.headers.get('x-real-ip') || forwarded || 'unknown';
  const secret = process.env.ARCHIVE_SESSION_SECRET || 'local-development-only';
  return createHmac('sha256', secret).update(address).digest('base64url');
}

// Counts per client IP by default. Pass `subject` to count against something shared instead
// (e.g. one archive), so rotating IPs does not buy more guesses.
export async function withinRateLimit(request, scope, limit, windowSeconds, subject = '') {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSeconds);
  const hash = identity(request, subject);
  if (databaseConfigured()) {
    await ensureDatabaseSchema();
    const sql = database();
    const [row] = await sql`INSERT INTO archive_rate_limits (identity_hash, scope, bucket, attempts)
      VALUES (${hash}, ${scope}, ${bucket}, 1)
      ON CONFLICT (identity_hash, scope, bucket)
      DO UPDATE SET attempts = archive_rate_limits.attempts + 1, updated_at = NOW()
      RETURNING attempts`;
    // keep the table small: now and then, drop buckets older than a day
    if (Math.random() < 0.01) await sql`DELETE FROM archive_rate_limits WHERE updated_at < NOW() - INTERVAL '1 day'`;
    return Number(row.attempts) <= limit;
  }
  const key = `${hash}:${scope}:${bucket}`;
  const attempts = (localAttempts.get(key) || 0) + 1;
  localAttempts.set(key, attempts);
  if (localAttempts.size > 500) {
    for (const candidate of localAttempts.keys()) if (!candidate.endsWith(`:${bucket}`)) localAttempts.delete(candidate);
  }
  return attempts <= limit;
}
