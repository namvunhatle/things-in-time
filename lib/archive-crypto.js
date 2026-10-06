const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const ENCRYPTION_VERSION = 2;
export const PBKDF2_ITERATIONS = 600_000;

function webCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('secure browser encryption is unavailable.');
  return globalThis.crypto;
}

export function toBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function randomBytes(length) {
  return webCrypto().getRandomValues(new Uint8Array(length));
}

export function randomToken(length = 18) {
  return toBase64Url(randomBytes(length));
}

export function generateRecoveryKey() {
  return `tit_${toBase64Url(randomBytes(32))}`;
}

function recoveryKeyBytes(recoveryKey) {
  const value = String(recoveryKey || '').trim();
  if (!/^tit_[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('that recovery key is not valid.');
  return fromBase64Url(value.slice(4));
}

async function sha256(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return new Uint8Array(await webCrypto().subtle.digest('SHA-256', bytes));
}

async function recoveryMaterial(archiveId, recoveryKey) {
  const material = await webCrypto().subtle.importKey('raw', recoveryKeyBytes(recoveryKey), 'HKDF', false, ['deriveKey', 'deriveBits']);
  const salt = await sha256(`things-in-time:${archiveId}:recovery:v1`);
  const wrapKey = await webCrypto().subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('archive-key-wrap') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const authSecret = new Uint8Array(await webCrypto().subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('editor-auth') },
    material,
    256,
  ));
  return { wrapKey, authSecret };
}

export const VIEWER_KDF = 'PBKDF2-SHA256+link-HKDF';

export function generateLinkSecret() {
  return toBase64Url(randomBytes(16));
}

function linkSecretBytes(linkSecret) {
  const value = String(linkSecret || '').trim();
  if (!/^[A-Za-z0-9_-]{22}$/.test(value)) throw new Error('this link is incomplete.');
  return fromBase64Url(value);
}

// Viewing needs both factors: the secret in the share link's #fragment (never sent to the server)
// and the password. The server only ever sees a hash of the auth half, so neither the operator
// nor someone holding the database can test passwords without the link, and someone holding the
// link can only test them online, through the rate limit.
async function viewerSecrets(archiveId, password, linkSecret, salt, iterations = PBKDF2_ITERATIONS) {
  const value = String(password || '');
  if (value.length < 12 || value.length > 128) throw new Error('use a password between 12 and 128 characters.');
  const link = linkSecretBytes(linkSecret);
  const passwordMaterial = await webCrypto().subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']);
  const stretched = new Uint8Array(await webCrypto().subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    passwordMaterial,
    256,
  ));
  const combined = new Uint8Array(link.length + stretched.length);
  combined.set(link);
  combined.set(stretched, link.length);
  const material = await webCrypto().subtle.importKey('raw', combined, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const hkdfSalt = await sha256(`things-in-time:${archiveId}:viewer:v2`);
  const wrapKey = await webCrypto().subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: hkdfSalt, info: encoder.encode('viewer-key-wrap') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const authSecret = new Uint8Array(await webCrypto().subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: hkdfSalt, info: encoder.encode('viewer-auth') },
    material,
    256,
  ));
  return { wrapKey, authSecret };
}

async function importDataKey(raw) {
  return webCrypto().subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptRaw(key, bytes, additionalData) {
  const iv = randomBytes(12);
  const ciphertext = await webCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(additionalData), tagLength: 128 },
    key,
    bytes,
  );
  return { iv: toBase64Url(iv), ciphertext: toBase64Url(ciphertext) };
}

async function decryptRaw(key, payload, additionalData) {
  try {
    return new Uint8Array(await webCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(payload.iv), additionalData: encoder.encode(additionalData), tagLength: 128 },
      key,
      fromBase64Url(payload.ciphertext),
    ));
  } catch {
    throw new Error('couldn’t decrypt this archive.');
  }
}

export async function encryptDocument(archiveId, key, document) {
  return encryptRaw(key, encoder.encode(JSON.stringify(document)), `things-in-time:${archiveId}:document:v2`);
}

export async function decryptDocument(archiveId, key, payload) {
  const bytes = await decryptRaw(key, payload, `things-in-time:${archiveId}:document:v2`);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error('the encrypted archive is damaged.');
  }
}

export async function encryptMedia(archiveId, fileName, key, bytes) {
  const encrypted = await encryptRaw(key, new Uint8Array(bytes), `things-in-time:${archiveId}:media:${fileName}:v2`);
  return new Blob([fromBase64Url(encrypted.ciphertext)], { type: 'application/octet-stream' });
}

export async function decryptMedia(archiveId, fileName, key, bytes) {
  return decryptRaw(key, {
    iv: fileName.slice(0, 16),
    ciphertext: toBase64Url(new Uint8Array(bytes)),
  }, `things-in-time:${archiveId}:media:${fileName}:v2`);
}

export async function createEncryptedMedia(archiveId, key, bytes) {
  const iv = randomBytes(12);
  const fileName = `${toBase64Url(iv)}_${randomToken(12)}.bin`;
  const ciphertext = await webCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`things-in-time:${archiveId}:media:${fileName}:v2`), tagLength: 128 },
    key,
    bytes,
  );
  return { fileName, blob: new Blob([ciphertext], { type: 'application/octet-stream' }) };
}

function randomShareSlug() {
  const left = ['quiet', 'soft', 'still', 'slow', 'hidden', 'private', 'small', 'distant'];
  const right = ['orbit', 'room', 'window', 'letter', 'evening', 'memory', 'corner', 'signal'];
  const bytes = randomBytes(2);
  return `${left[bytes[0] % left.length]}-${right[bytes[1] % right.length]}-${randomToken(8).toLowerCase().replace(/_/g, 'x')}`;
}

export async function editorAuthSecret(archiveId, recoveryKey) {
  return toBase64Url((await recoveryMaterial(archiveId, recoveryKey)).authSecret);
}

export async function createSecureArchive({ title, password, document: suppliedDocument, archiveId: suppliedArchiveId, shareSlug: suppliedShareSlug }) {
  const archiveId = suppliedArchiveId || randomToken(18);
  const shareSlug = suppliedShareSlug || randomShareSlug();
  const recoveryKey = generateRecoveryKey();
  const linkSecret = generateLinkSecret();
  const extractableKey = await webCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawDataKey = new Uint8Array(await webCrypto().subtle.exportKey('raw', extractableKey));
  const dataKey = await importDataKey(rawDataKey);
  const { wrapKey, authSecret } = await recoveryMaterial(archiveId, recoveryKey);
  const recoveryWrap = await encryptRaw(wrapKey, rawDataKey, `things-in-time:${archiveId}:recovery-wrap:v2`);
  const passwordSalt = randomBytes(16);
  const viewer = await viewerSecrets(archiveId, password, linkSecret, passwordSalt);
  const viewerWrap = await encryptRaw(viewer.wrapKey, rawDataKey, `things-in-time:${archiveId}:viewer-wrap:v2`);
  rawDataKey.fill(0);
  const linkSecretWrap = await encryptRaw(dataKey, linkSecretBytes(linkSecret), `things-in-time:${archiveId}:link-secret:v2`);
  const document = suppliedDocument || {
    presentation: 'canvas',
    title: String(title || '').trim(),
    subtitle: '',
    canvas: { width: 1200, height: 900 },
    items: [],
  };
  const encryptedDocument = await encryptDocument(archiveId, dataKey, document);
  return {
    recoveryKey,
    linkSecret,
    dataKey,
    editorAuth: toBase64Url(authSecret),
    archive: {
      version: ENCRYPTION_VERSION,
      id: archiveId,
      shareSlug,
      createdAt: new Date().toISOString(),
      editorAuthHash: toBase64Url(await sha256(authSecret)),
      viewerAuthHash: toBase64Url(await sha256(viewer.authSecret)),
      crypto: {
        suite: 'AES-256-GCM',
        recoveryWrap,
        linkSecretWrap,
        viewerWrap: {
          ...viewerWrap,
          kdf: { name: VIEWER_KDF, iterations: PBKDF2_ITERATIONS, salt: toBase64Url(passwordSalt) },
        },
        document: encryptedDocument,
      },
    },
  };
}

// Owner: recovery key → data key (non-extractable, safe to keep in IndexedDB).
export async function unwrapWithRecovery(archiveId, recoveryWrap, recoveryKey) {
  const { wrapKey } = await recoveryMaterial(archiveId, recoveryKey);
  const rawDataKey = await decryptRaw(wrapKey, recoveryWrap, `things-in-time:${archiveId}:recovery-wrap:v2`);
  try {
    return await importDataKey(rawDataKey);
  } finally {
    rawDataKey.fill(0);
  }
}

export async function decryptLinkSecret(archiveId, dataKey, linkSecretWrap) {
  return toBase64Url(await decryptRaw(dataKey, linkSecretWrap, `things-in-time:${archiveId}:link-secret:v2`));
}

// Viewer, step 1: derive the auth secret to send and the key that will unwrap the reply.
export async function viewerCredentials(gate, password, linkSecret) {
  const kdf = gate.kdf;
  if (kdf?.name !== VIEWER_KDF || kdf.iterations < PBKDF2_ITERATIONS) throw new Error('unsupported password protection.');
  const viewer = await viewerSecrets(gate.id, password, linkSecret, fromBase64Url(kdf.salt), kdf.iterations);
  return { wrapKey: viewer.wrapKey, authSecret: toBase64Url(viewer.authSecret) };
}

// Viewer, step 2: the server returned the wrapped key only after the auth secret matched.
export async function openWithViewerKey(archiveId, wrapKey, payload) {
  const rawDataKey = await decryptRaw(wrapKey, payload.viewerWrap, `things-in-time:${archiveId}:viewer-wrap:v2`);
  try {
    const dataKey = await importDataKey(rawDataKey);
    return { dataKey, document: await decryptDocument(archiveId, dataKey, payload.document) };
  } finally {
    rawDataKey.fill(0);
  }
}
