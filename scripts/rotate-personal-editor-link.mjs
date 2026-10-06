import { createHash, randomBytes } from 'node:crypto';
import { database, ensureDatabaseSchema } from '../lib/db.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');

const archiveId = 'user_01_personal_archive';
const editorKey = randomBytes(32).toString('base64url');
const editorKeyHash = createHash('sha256').update(editorKey).digest('base64url');
await ensureDatabaseSchema();
const sql = database();
const [current] = await sql`SELECT document->>'version' AS version FROM archives WHERE id = ${archiveId} LIMIT 1`;
if (current?.version === '2') {
  console.error('The personal archive is encrypted: open the editor with your recovery key instead. Nothing was changed.');
  process.exit(1);
}
const [updated] = await sql`UPDATE archives
  SET document = jsonb_set(document, '{editorKeyHash}', ${JSON.stringify(editorKeyHash)}::jsonb),
      revision = revision + 1,
      updated_at = NOW()
  WHERE id = ${archiveId}
  RETURNING id`;
if (!updated) throw new Error('personal archive not found');

const origin = String(process.env.PRODUCTION_ORIGIN || 'https://things-in-time.vercel.app').replace(/\/$/, '');
console.log(`${origin}/portal/${archiveId}/claim#key=${encodeURIComponent(editorKey)}`);
