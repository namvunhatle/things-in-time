import fs from 'node:fs';
import path from 'node:path';
import { confidentialEntriesDirectory } from './confidential-paths';
import { database, databaseConfigured, ensureDatabaseSchema } from './db';
import { parseMarkdownEntry } from './markdown-entry';
import { randomBytes } from 'node:crypto';

export const categories = {
  all: 'all',
  understood: 'things i understood too late',
  miss: 'things i miss',
  songs: 'songs',
  home: 'our home',
  unsaid: 'things i never said',
};
export async function readEntries(category = 'all', ownerId = 'user_01') {
  if (databaseConfigured()) {
    await ensureDatabaseSchema();
    const sql = database();
    const rows = await sql`SELECT document FROM published_entries WHERE owner_id = ${ownerId} ORDER BY sort_key DESC, id DESC`;
    return rows.map(row => typeof row.document === 'string' ? JSON.parse(row.document) : row.document)
      .filter(entry => !entry.draft && (category === 'all' || entry.category === category));
  }
  const directory = confidentialEntriesDirectory;
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith('.md')).map(name => {
    const { data, content } = parseMarkdownEntry(fs.readFileSync(path.join(directory, name), 'utf8'));
    return { ...data, id: name.replace(/\.md$/, ''), content };
  }).filter(entry => !entry.draft && (category === 'all' || entry.category === category))
    .sort((a, b) => `${b.date}T${b.time || '23:59'}`.localeCompare(`${a.date}T${a.time || '23:59'}`) || b.id.localeCompare(a.id));
}

const entryIdPattern = /^[a-zA-Z0-9_-]{8,100}$/;

function cleanEntryPayload(payload, previous = {}) {
  const date = String(payload.date ?? previous.date ?? '').trim();
  const time = String(payload.time ?? previous.time ?? '').trim();
  const category = String(payload.category ?? previous.category ?? 'unsaid');
  const title = String(payload.title ?? previous.title ?? '').trim().slice(0, 200);
  const content = String(payload.content ?? previous.content ?? '').replace(/\r\n?/g, '\n').slice(0, 20000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) throw new Error('enter a valid date');
  if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('enter a valid time');
  if (!Object.hasOwn(categories, category) || category === 'all') throw new Error('choose a valid category');
  if (!content.trim()) throw new Error('text dump cannot be empty');
  return { ...previous, title, content, date, time, category, lang: 'en', draft: false };
}

export async function createPublishedEntry(ownerId, payload) {
  if (!databaseConfigured()) throw new Error('the personal editor requires the production database');
  await ensureDatabaseSchema();
  const sql = database();
  const id = `entry_${randomBytes(9).toString('base64url')}`;
  const document = { id, kind: 'dump', assistant_assisted: false, ...cleanEntryPayload(payload) };
  const sortKey = `${document.date}T${document.time || '23:59'}`;
  await sql`INSERT INTO published_entries (id, owner_id, document, sort_key)
    VALUES (${id}, ${ownerId}, ${JSON.stringify(document)}::jsonb, ${sortKey})`;
  return document;
}

export async function updatePublishedEntry(ownerId, entryId, payload) {
  if (!entryIdPattern.test(entryId || '')) throw new Error('invalid entry');
  if (!databaseConfigured()) throw new Error('the personal editor requires the production database');
  await ensureDatabaseSchema();
  const sql = database();
  const [row] = await sql`SELECT document FROM published_entries WHERE id = ${entryId} AND owner_id = ${ownerId} LIMIT 1`;
  if (!row) throw new Error('entry not found');
  const previous = typeof row.document === 'string' ? JSON.parse(row.document) : row.document;
  const document = { ...cleanEntryPayload(payload, previous), id: entryId };
  const sortKey = `${document.date}T${document.time || '23:59'}`;
  await sql`UPDATE published_entries SET document = ${JSON.stringify(document)}::jsonb, sort_key = ${sortKey}, updated_at = NOW()
    WHERE id = ${entryId} AND owner_id = ${ownerId}`;
  return document;
}
export function dateLabel(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(date + 'T12:00:00Z')).toLowerCase();
}
export function timeLabel(time) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}
