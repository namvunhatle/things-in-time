import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'archive_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
export const unlisted = () => process.env.ARCHIVE_ACCESS === 'unlisted';
export const configured = () => Boolean(process.env.ARCHIVE_PASSCODE && process.env.ARCHIVE_SESSION_SECRET?.length >= 32);

function sign(value) {
  return createHmac('sha256', process.env.ARCHIVE_SESSION_SECRET)
    .update(value + ':' + process.env.ARCHIVE_PASSCODE).digest('base64url');
}
function equal(a, b) {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}
export function matchesPasscode(value) {
  return configured() && typeof value === 'string' && equal(value, process.env.ARCHIVE_PASSCODE);
}
export function createSession() {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${expiry}.${sign(expiry)}`;
}
export function hasAccess(token) {
  if (unlisted()) return true;
  if (!configured() || typeof token !== 'string' || token.length > 100) return false;
  const [expiry, signature, extra] = token.split('.');
  if (extra || !/^\d+$/.test(expiry) || !signature) return false;
  const seconds = Number(expiry);
  const now = Math.floor(Date.now() / 1000);
  return seconds > now && seconds <= now + SESSION_SECONDS && equal(signature, sign(expiry));
}
