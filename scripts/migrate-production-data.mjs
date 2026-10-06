import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { put } from '@vercel/blob';
import { database, ensureDatabaseSchema } from '../lib/db.js';
import { parseMarkdownEntry } from '../lib/markdown-entry.js';

const root = process.cwd();
const archiveRoot = path.join(root, '.archive-data');
const entriesRoot = path.join(root, '.confidential', 'entries');
const photosRoot = path.join(root, '.confidential', 'photos');

function slugFor(archive) {
  const base = String(archive.title || 'archive').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 48) || 'archive';
  return archive.shareSlug || `${base}-${createHash('sha256').update(archive.id).digest('hex').slice(0, 8)}`;
}

async function names(directory) {
  return fs.readdir(directory).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
}

async function migratePublishedEntries(sql) {
  const overwrite = process.argv.includes('--overwrite-entries');
  let count = 0;
  for (const name of await names(entriesRoot)) {
    if (!name.endsWith('.md')) continue;
    const { data, content } = parseMarkdownEntry(await fs.readFile(path.join(entriesRoot, name), 'utf8'));
    if (data.draft) continue;
    const document = { ...data, id: name.replace(/\.md$/, ''), content };
    const sortKey = `${document.date || '0000-00-00'}T${document.time || '23:59'}`;
    if (overwrite) {
      await sql`INSERT INTO published_entries (id, owner_id, document, sort_key)
        VALUES (${document.id}, 'user_01', ${JSON.stringify(document)}::jsonb, ${sortKey})
        ON CONFLICT (id) DO UPDATE SET
          owner_id = EXCLUDED.owner_id,
          document = EXCLUDED.document,
          sort_key = EXCLUDED.sort_key,
          updated_at = NOW()`;
    } else {
      await sql`INSERT INTO published_entries (id, owner_id, document, sort_key)
        VALUES (${document.id}, 'user_01', ${JSON.stringify(document)}::jsonb, ${sortKey})
        ON CONFLICT (id) DO NOTHING`;
    }
    count += 1;
  }
  return count;
}

async function seedPersonalArchive(sql) {
  const id = 'user_01_personal_archive';
  const shareSlug = 'things-i-couldnt-say-in-time';
  const [existing] = await sql`SELECT document FROM archives WHERE id = ${id} LIMIT 1`;
  const previous = existing?.document && typeof existing.document === 'string' ? JSON.parse(existing.document) : existing?.document;
  let password = previous?.password;
  if (!password) {
    const passcode = process.env.ARCHIVE_PASSCODE;
    if (!passcode) throw new Error('ARCHIVE_PASSCODE is missing');
    const salt = randomBytes(16);
    password = {
      salt: salt.toString('base64url'),
      hash: scryptSync(passcode, salt, 64).toString('base64url'),
    };
  }
  const document = {
    version: 1,
    id,
    shareSlug,
    ownerId: 'user_01',
    presentation: 'timeline',
    title: previous?.title || 'things i couldn’t say in time',
    subtitle: previous?.subtitle || 'things i loved,\nthings i didn’t understand soon enough,\nand things i still carry.',
    createdAt: previous?.createdAt || new Date().toISOString(),
    password,
    editorKeyHash: previous?.editorKeyHash || createHash('sha256').update(randomBytes(32)).digest('base64url'),
    canvas: { width: 1200, height: 900 },
    items: previous?.items || [],
  };
  await sql`INSERT INTO archives (id, share_slug, document)
    VALUES (${id}, ${shareSlug}, ${JSON.stringify(document)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      share_slug = EXCLUDED.share_slug,
      document = EXCLUDED.document,
      revision = archives.revision + 1,
      updated_at = NOW()`;
}

async function uploadDirectory(directory, prefix) {
  let count = 0;
  for (const name of await names(directory)) {
    const target = path.join(directory, name);
    const stat = await fs.stat(target);
    if (!stat.isFile()) continue;
    await put(`${prefix}/${name}`, await fs.readFile(target), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    count += 1;
  }
  return count;
}

async function migrateArchives(sql) {
  let archives = 0;
  let media = 0;
  for (const id of await names(archiveRoot)) {
    const archiveFile = path.join(archiveRoot, id, 'archive.json');
    let archive;
    try {
      archive = JSON.parse(await fs.readFile(archiveFile, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    archive.shareSlug = slugFor(archive);
    await sql`INSERT INTO archives (id, share_slug, document)
      VALUES (${archive.id}, ${archive.shareSlug}, ${JSON.stringify(archive)}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
    media += await uploadDirectory(path.join(archiveRoot, id, 'media'), `archives/${archive.id}`);
    archives += 1;
  }
  return { archives, media };
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');

await ensureDatabaseSchema();
const sql = database();
const entries = await migratePublishedEntries(sql);
await seedPersonalArchive(sql);
let migrated = { archives: 0, media: 0 };
let personalPhotos = 0;
if (process.argv.includes('--include-canvas')) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) throw new Error('private Blob credentials are missing');
  migrated = await migrateArchives(sql);
}
if (process.argv.includes('--include-personal-media')) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) throw new Error('private Blob credentials are missing');
  personalPhotos = await uploadDirectory(photosRoot, 'personal-media');
}

console.log(`Migrated ${entries} published entries, ${migrated.archives} canvas archives, ${migrated.media} archive media files, and ${personalPhotos} personal photos.`);
