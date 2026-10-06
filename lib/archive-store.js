import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { get, put } from '@vercel/blob';
import { database, databaseConfigured, ensureDatabaseSchema } from './db';

const scrypt = promisify(scryptCallback);
const DATA_ROOT = path.join(process.cwd(), '.archive-data');
const ID_PATTERN = /^[a-zA-Z0-9_-]{16,64}$/;
const SHARE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/;
const MEDIA_PATTERN = /^[a-zA-Z0-9_-]{12,64}\.(?:jpe?g|png|webp|gif|avif)$/i;
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function validArchiveReference(value) {
  return ID_PATTERN.test(value || '') || SHARE_PATTERN.test(value || '');
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function archiveDirectory(id) {
  if (!ID_PATTERN.test(id || '')) throw new Error('invalid archive id');
  return path.join(DATA_ROOT, id);
}

function cleanTitle(value) {
  const title = String(value || '').trim().replace(/\s+/g, ' ');
  if (!title || title.length > 80) throw new Error('title must be between 1 and 80 characters');
  return title;
}

function cleanSubtitle(value) {
  const subtitle = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (subtitle.length > 400) throw new Error('subtitle must be 400 characters or fewer');
  return subtitle;
}

function shareSlug(title) {
  const base = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'archive';
  return `${base}-${randomBytes(4).toString('hex')}`;
}

function attachRevision(archive, revision) {
  Object.defineProperty(archive, '_revision', { value: Number(revision), writable: true, enumerable: false });
  return archive;
}

function serializableArchive(archive) {
  return JSON.parse(JSON.stringify(archive));
}

async function passwordRecord(password) {
  const value = String(password || '');
  if (value.length < 6 || value.length > 128) throw new Error('password must be between 6 and 128 characters');
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64);
  return { salt: salt.toString('base64url'), hash: Buffer.from(derived).toString('base64url') };
}

async function writeArchive(archive) {
  if (databaseConfigured()) {
    await ensureDatabaseSchema();
    const sql = database();
    const expectedRevision = Number(archive._revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error('archive revision missing');
    const [updated] = await sql`UPDATE archives
      SET document = ${JSON.stringify(serializableArchive(archive))}::jsonb,
          share_slug = ${archive.shareSlug || archive.id},
          revision = revision + 1,
          updated_at = NOW()
      WHERE id = ${archive.id} AND revision = ${expectedRevision}
      RETURNING revision`;
    if (!updated) throw new Error('archive changed in another request. refresh and try again.');
    archive._revision = Number(updated.revision);
    return;
  }
  const directory = archiveDirectory(archive.id);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, 'archive.json');
  const temporary = path.join(directory, `.archive-${randomBytes(6).toString('hex')}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(archive, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temporary, target);
}

export async function createArchive({ title, password }) {
  const id = randomBytes(18).toString('base64url');
  const editorKey = randomBytes(24).toString('base64url');
  const archive = {
    version: 1,
    id,
    title: cleanTitle(title),
    subtitle: '',
    shareSlug: shareSlug(cleanTitle(title)),
    createdAt: new Date().toISOString(),
    password: await passwordRecord(password),
    editorKeyHash: createHash('sha256').update(editorKey).digest('base64url'),
    canvas: { width: 1200, height: 900 },
    items: [],
  };
  if (databaseConfigured()) {
    await ensureDatabaseSchema();
    const sql = database();
    await sql`INSERT INTO archives (id, share_slug, document)
      VALUES (${archive.id}, ${archive.shareSlug}, ${JSON.stringify(archive)}::jsonb)`;
    attachRevision(archive, 0);
    return { archive, editorKey };
  }
  await fs.mkdir(path.join(archiveDirectory(id), 'media'), { recursive: true, mode: 0o700 });
  await writeArchive(archive);
  return { archive, editorKey };
}

export async function readArchive(id) {
  if (databaseConfigured()) {
    if (!ID_PATTERN.test(id || '') && !SHARE_PATTERN.test(id || '')) return null;
    await ensureDatabaseSchema();
    const sql = database();
    const [row] = await sql`SELECT document, revision FROM archives
      WHERE id = ${id} OR share_slug = ${id}
      LIMIT 1`;
    if (!row) return null;
    const archive = typeof row.document === 'string' ? JSON.parse(row.document) : row.document;
    archive.items = (archive.items || []).map(item => item.type === 'note' ? { ...item, width: 728 } : item);
    return attachRevision(archive, row.revision);
  }
  try {
    let resolvedId = id;
    if (!ID_PATTERN.test(id || '') && SHARE_PATTERN.test(id || '')) {
      const candidates = await fs.readdir(DATA_ROOT).catch(() => []);
      for (const candidate of candidates) {
        if (!ID_PATTERN.test(candidate)) continue;
        const candidateRaw = await fs.readFile(path.join(archiveDirectory(candidate), 'archive.json'), 'utf8').catch(() => null);
        if (candidateRaw && JSON.parse(candidateRaw).shareSlug === id) { resolvedId = candidate; break; }
      }
    }
    const raw = await fs.readFile(path.join(archiveDirectory(resolvedId), 'archive.json'), 'utf8');
    const archive = JSON.parse(raw);
    archive.items = (archive.items || []).map(item => item.type === 'note' ? { ...item, width: 728 } : item);
    return archive;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.message === 'invalid archive id') return null;
    throw error;
  }
}

export function verifyEditorKey(archive, key) {
  if (!archive || typeof key !== 'string') return false;
  const hash = createHash('sha256').update(key).digest('base64url');
  return safeEqual(hash, archive.editorKeyHash);
}

export async function verifyArchivePassword(archive, password) {
  if (!archive || typeof password !== 'string') return false;
  const salt = Buffer.from(archive.password.salt, 'base64url');
  const derived = Buffer.from(await scrypt(password, salt, 64));
  return safeEqual(derived, Buffer.from(archive.password.hash, 'base64url'));
}

function sessionSecret() {
  const secret = process.env.ARCHIVE_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('ARCHIVE_SESSION_SECRET must be configured');
  return secret;
}

function sessionSignature(purpose, id, expiry, binding = '') {
  return createHmac('sha256', sessionSecret()).update(`${purpose}:${id}:${expiry}:${binding}`).digest('base64url');
}

export function viewerCookieName(id) {
  if (!validArchiveReference(id)) return 'archive_view_invalid';
  return `archive_view_${id}`;
}

export function createViewerSession(id) {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${expiry}.${sessionSignature('viewer', id, expiry)}`;
}

export function hasViewerSession(id, token) {
  if (!validArchiveReference(id) || typeof token !== 'string') return false;
  const [expiry, signature, extra] = token.split('.');
  if (extra || !/^\d+$/.test(expiry || '') || !signature) return false;
  const seconds = Number(expiry);
  const now = Math.floor(Date.now() / 1000);
  return seconds > now && seconds <= now + SESSION_SECONDS && safeEqual(signature, sessionSignature('viewer', id, expiry));
}

export function editorCookieName(id) {
  if (!ID_PATTERN.test(id || '')) return 'archive_editor_invalid';
  return `archive_editor_${id}`;
}

export function createEditorSession(archive) {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${expiry}.${sessionSignature('editor', archive.id, expiry, archive.editorKeyHash)}`;
}

export function hasEditorSession(archive, token) {
  if (!archive || typeof token !== 'string') return false;
  const [expiry, signature, extra] = token.split('.');
  if (extra || !/^\d+$/.test(expiry || '') || !signature) return false;
  const seconds = Number(expiry);
  const now = Math.floor(Date.now() / 1000);
  return seconds > now && seconds <= now + SESSION_SECONDS && safeEqual(signature, sessionSignature('editor', archive.id, expiry, archive.editorKeyHash));
}

export async function addArchiveImage(archive, file, position) {
  const types = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  const extension = types[file.type];
  if (!extension) throw new Error('unsupported image type');
  if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('image must be smaller than 10 MB');

  const itemId = randomBytes(12).toString('base64url');
  const fileName = `${itemId}.${extension}`;
  const media = Buffer.from(await file.arrayBuffer());
  if (databaseConfigured()) {
    await put(`archives/${archive.id}/${fileName}`, media, {
      access: 'private',
      contentType: file.type,
      addRandomSuffix: false,
    });
  } else {
    const mediaPath = path.join(archiveDirectory(archive.id), 'media', fileName);
    await fs.writeFile(mediaPath, media, { flag: 'wx', mode: 0o600 });
  }

  const item = {
    id: itemId,
    type: 'image',
    fileName,
    x: Math.max(0, Math.min(920, Number(position.x) || 0)),
    y: Math.max(0, Math.min(820, Number(position.y) || 0)),
    width: 280,
    alt: '',
    attachedTo: archive.items.some(candidate => candidate.type === 'note' && candidate.id === position.attachedTo)
      ? position.attachedTo
      : null,
  };
  archive.items.push(item);
  await writeArchive(archive);
  return item;
}

export async function addArchiveNote(archive, position = {}) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value;
  const requestedX = Number(position.x);
  const requestedY = Number(position.y);
  const item = {
    id: randomBytes(12).toString('base64url'),
    type: 'note',
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
    content: '',
    x: Math.max(0, Math.min(472, Number.isFinite(requestedX) ? requestedX : 0)),
    y: Math.max(0, Math.min(760, Number.isFinite(requestedY) ? requestedY : 62)),
    width: 728,
  };
  archive.items.push(item);
  await writeArchive(archive);
  return item;
}

function youtubeVideoId(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('paste a valid YouTube link');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('paste a valid YouTube link');
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let videoId = '';
  if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  if (host === 'youtube.com') {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
    else if (/^\/(?:shorts|embed)\//.test(url.pathname)) videoId = url.pathname.split('/')[2] || '';
  }
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error('paste a valid YouTube video or Shorts link');
  return videoId;
}

async function cacheYoutubeMetadata(archiveId, itemId, videoId) {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const metadataResponse = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
    });
    if (!metadataResponse.ok) return {};
    const metadata = await metadataResponse.json();
    const thumbnailUrl = new URL(metadata.thumbnail_url);
    if (thumbnailUrl.protocol !== 'https:' || !(thumbnailUrl.hostname === 'ytimg.com' || thumbnailUrl.hostname.endsWith('.ytimg.com'))) return {};

    const thumbnailResponse = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(6000) });
    if (!thumbnailResponse.ok) return {};
    const contentType = thumbnailResponse.headers.get('content-type')?.split(';')[0];
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const extension = extensions[contentType];
    if (!extension || Number(thumbnailResponse.headers.get('content-length') || 0) > 5 * 1024 * 1024) return {};
    const thumbnail = Buffer.from(await thumbnailResponse.arrayBuffer());
    if (!thumbnail.length || thumbnail.length > 5 * 1024 * 1024) return {};
    const thumbnailFileName = `${itemId}-youtube.${extension}`;
    if (databaseConfigured()) {
      await put(`archives/${archiveId}/${thumbnailFileName}`, thumbnail, {
        access: 'private',
        contentType,
        addRandomSuffix: false,
      });
    } else {
      await fs.writeFile(path.join(archiveDirectory(archiveId), 'media', thumbnailFileName), thumbnail, { flag: 'wx', mode: 0o600 });
    }
    return {
      title: String(metadata.title || '').trim().slice(0, 160),
      thumbnailFileName,
    };
  } catch {
    return {};
  }
}

export async function addArchiveYoutube(archive, url, position = {}) {
  const videoId = youtubeVideoId(url);
  const itemId = randomBytes(12).toString('base64url');
  const metadata = await cacheYoutubeMetadata(archive.id, itemId, videoId);
  const item = {
    id: itemId,
    type: 'youtube',
    videoId,
    x: Math.max(0, Math.min(840, Number(position.x) || 760)),
    y: Math.max(0, Math.min(660, Number(position.y) || 90)),
    width: 360,
    ...metadata,
  };
  archive.items.push(item);
  await writeArchive(archive);
  return item;
}

export async function refreshArchiveYoutubeMetadata(archive, itemId) {
  const item = archive.items.find(candidate => candidate.type === 'youtube' && candidate.id === itemId);
  if (!item) throw new Error('YouTube item not found');
  const metadata = await cacheYoutubeMetadata(archive.id, item.id, item.videoId);
  if (!metadata.thumbnailFileName) return item;
  Object.assign(item, metadata);
  await writeArchive(archive);
  return item;
}

export async function updateArchiveLayout(archive, payload) {
  if (payload.title !== undefined) archive.title = cleanTitle(payload.title);
  if (payload.subtitle !== undefined) archive.subtitle = cleanSubtitle(payload.subtitle);
  if (payload.items === undefined) {
    await writeArchive(archive);
    return archive;
  }
  const existing = new Map(archive.items.map(item => [item.id, item]));
  if (!Array.isArray(payload.items) || payload.items.length > 100) throw new Error('invalid canvas items');
  const noteIds = new Set(archive.items.filter(item => item.type === 'note').map(item => item.id));
  archive.items = payload.items.map(candidate => {
    const item = existing.get(candidate.id);
    if (!item) throw new Error('unknown canvas item');
    const maximumWidth = item.type === 'note' ? 728 : item.type === 'youtube' ? 560 : 600;
    const width = Math.max(80, Math.min(maximumWidth, Number(candidate.width) || item.width));
    const shared = {
      ...item,
      x: Math.max(0, Math.min(archive.canvas.width - width, Number(candidate.x) || 0)),
      y: Math.max(0, Math.min(archive.canvas.height - 40, Number(candidate.y) || 0)),
      width,
    };
    if (item.type === 'note') return {
      ...shared,
      content: String(candidate.content || '').slice(0, 10000),
    };
    if (item.type === 'youtube') return shared;
    return {
      ...shared,
      alt: String(candidate.alt || '').slice(0, 160),
      attachedTo: noteIds.has(candidate.attachedTo) ? candidate.attachedTo : null,
    };
  });
  await writeArchive(archive);
  return archive;
}

export async function readArchiveMedia(id, fileName) {
  if (!MEDIA_PATTERN.test(fileName || '')) return null;
  if (databaseConfigured()) {
    const result = await get(`archives/${id}/${fileName}`, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    return {
      body: result.stream,
      contentType: result.blob.contentType,
      etag: result.blob.etag,
    };
  }
  try {
    return { body: await fs.readFile(path.join(archiveDirectory(id), 'media', fileName)) };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export const archiveSessionSeconds = SESSION_SECONDS;
