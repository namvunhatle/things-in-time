'use client';

// Keeps each archive's data key on this device as a non-extractable CryptoKey in IndexedDB.
// Scripts can use it to encrypt and decrypt, but cannot read the key bytes out, and the recovery
// key itself is never stored anywhere — it is only typed in to (re)open an archive on a device.
const DATABASE = 'things-in-time-keys';
const STORE = 'archive-keys';

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function saveArchiveKey(archiveId, dataKey) {
  if (dataKey.extractable) throw new Error('refusing to store an extractable archive key.');
  await run('readwrite', store => store.put(dataKey, archiveId));
}

export async function loadArchiveKey(archiveId) {
  try {
    return (await run('readonly', store => store.get(archiveId))) || null;
  } catch {
    return null;
  }
}

export async function forgetArchiveKey(archiveId) {
  await run('readwrite', store => store.delete(archiveId));
}

// Remembers which archives this browser can edit. Holds no secrets: opening one still needs the
// editor cookie and the key above.
export function rememberArchive({ id, shareSlug, title }) {
  try {
    localStorage.removeItem(`archive_recovery_${id}`);
    const recent = JSON.parse(localStorage.getItem('archive_recent') || '[]').filter(item => item.id !== id);
    recent.unshift({ id, shareSlug, title: title || 'encrypted archive', encrypted: true, lastOpened: new Date().toISOString() });
    localStorage.setItem('archive_recent', JSON.stringify(recent.slice(0, 20)));
  } catch {
    // storage unavailable: the archive still opens with the recovery key
  }
}
