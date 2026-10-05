import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const ACCOUNTS_ROOT = path.join(process.cwd(), '.archive-data', 'accounts');
const ID_PATTERN = /^[a-zA-Z0-9_-]{16,64}$/;
const SESSION_SECONDS = 60 * 60 * 24 * 30;
export const accountCookieName = 'archive_account';
export const accountSessionSeconds = SESSION_SECONDS;

const safeEqual = (left, right) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

function cleanUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error('username must be 3–32 letters, numbers, dots, dashes or underscores');
  return username;
}

async function passwordRecord(password) {
  const value = String(password || '');
  if (value.length < 8 || value.length > 128) throw new Error('password must be between 8 and 128 characters');
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64);
  return { salt: salt.toString('base64url'), hash: Buffer.from(derived).toString('base64url') };
}

async function writeAccount(account) {
  await fs.mkdir(ACCOUNTS_ROOT, { recursive: true, mode: 0o700 });
  const target = path.join(ACCOUNTS_ROOT, `${account.id}.json`);
  const temporary = path.join(ACCOUNTS_ROOT, `.account-${randomBytes(6).toString('hex')}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(account, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temporary, target);
}

async function allAccounts() {
  try {
    const names = await fs.readdir(ACCOUNTS_ROOT);
    return await Promise.all(names.filter(name => ID_PATTERN.test(name.replace(/\.json$/, '')) && name.endsWith('.json')).map(async name => JSON.parse(await fs.readFile(path.join(ACCOUNTS_ROOT, name), 'utf8'))));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function createAccount({ username, password }) {
  const clean = cleanUsername(username);
  if ((await allAccounts()).some(account => account.username === clean)) throw new Error('that username is already taken');
  const account = {
    id: randomBytes(18).toString('base64url'),
    username: clean,
    createdAt: new Date().toISOString(),
    password: await passwordRecord(password),
  };
  await writeAccount(account);
  return account;
}

export async function readAccount(id) {
  if (!ID_PATTERN.test(id || '')) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(ACCOUNTS_ROOT, `${id}.json`), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function verifyAccount(username, password) {
  const clean = cleanUsername(username);
  const account = (await allAccounts()).find(candidate => candidate.username === clean);
  if (!account || typeof password !== 'string') return null;
  const derived = Buffer.from(await scrypt(password, Buffer.from(account.password.salt, 'base64url'), 64));
  return safeEqual(derived, Buffer.from(account.password.hash, 'base64url')) ? account : null;
}

function sessionSecret() {
  const secret = process.env.ARCHIVE_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('ARCHIVE_SESSION_SECRET must be configured');
  return secret;
}

function signature(account, expiry) {
  return createHmac('sha256', sessionSecret()).update(`account:${account.id}:${expiry}:${account.password.hash}`).digest('base64url');
}

export function createAccountSession(account) {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${account.id}.${expiry}.${signature(account, expiry)}`;
}

export async function accountFromSession(token) {
  if (typeof token !== 'string') return null;
  const [id, expiry, sessionSignature, extra] = token.split('.');
  if (extra || !ID_PATTERN.test(id || '') || !/^\d+$/.test(expiry || '') || !sessionSignature) return null;
  const seconds = Number(expiry);
  const now = Math.floor(Date.now() / 1000);
  if (seconds <= now || seconds > now + SESSION_SECONDS) return null;
  const account = await readAccount(id);
  if (!account || !safeEqual(sessionSignature, signature(account, expiry))) return null;
  return account;
}
