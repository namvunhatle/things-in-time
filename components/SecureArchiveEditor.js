'use client';

import { useEffect, useState } from 'react';
import ArchiveEditor from './ArchiveEditor';
import PersonalArchiveEditor from './PersonalArchiveEditor';
import { createEncryptedMedia, decryptDocument, decryptLinkSecret, editorAuthSecret, encryptDocument, resetViewerPassword } from '../lib/archive-crypto';
import { loadArchiveKey, rememberArchive } from '../lib/key-vault';

const categories = {
  all: 'all', understood: 'things i understood too late', miss: 'things i miss', songs: 'songs', home: 'our home', unsaid: 'things i never said',
};

// Shown once a legacy archive has been encrypted: its old plaintext copy still sits on the server
// until the owner removes it. The server refuses if the encrypted copy has fewer entries.
function PlaintextCleanup({ archiveId, entryCount }) {
  const [state, setState] = useState('pending');
  const [message, setMessage] = useState('');

  async function purge() {
    if (!window.confirm('remove the old unencrypted copy from the server? this cannot be undone. your encrypted archive stays as it is.')) return;
    setState('working');
    try {
      const response = await fetch(`/api/archives/${archiveId}/purge-plaintext`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedEntryCount: entryCount }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'cleanup failed.');
      setState('done');
      setMessage(`removed ${result.removedEntries} old entries${result.removedMedia ? ` and ${result.removedMedia} photos` : ''}.`);
    } catch (error) {
      setState('pending');
      setMessage(error.message || 'cleanup failed.');
    }
  }

  if (state === 'done') return <section className="migration-card" role="status"><p>{message} only the encrypted archive remains.</p></section>;
  return <section className="migration-card">
    <p>an unencrypted copy of your old entries is still on the server. remove it so only the encrypted archive remains.</p>
    <button type="button" disabled={state === 'working'} onClick={purge}>{state === 'working' ? 'removing…' : 'remove the old copy'}</button>
    {message && <p className="portal-error" role="alert">{message}</p>}
  </section>;
}

// Reset the viewer password with the recovery key. The share link (and its #secret) stays the same.
function ViewerPasswordReset({ archive }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const recoveryKey = String(form.get('recoveryKey') || '').trim();
    const password = String(form.get('password') || '');
    if (password !== form.get('confirm')) {
      setMessage('the passwords don’t match.');
      return;
    }
    setBusy(true);
    setMessage('changing the password…');
    try {
      const session = await fetch(`/api/archives/${archive.id}/editor-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: await editorAuthSecret(archive.id, recoveryKey) }),
      });
      if (session.status === 429) throw new Error('too many attempts. try again later.');
      if (!session.ok) throw new Error('that recovery key didn’t work.');
      const { recoveryWrap } = await session.json();
      const protection = await resetViewerPassword(archive.id, recoveryWrap, recoveryKey, archive.crypto.linkSecretWrap, password);
      const response = await fetch(`/api/archives/${archive.id}/viewer-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(protection),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'couldn’t change the password.');
      event.target.reset();
      setMessage('password changed. the share link stays the same; the old password no longer works.');
    } catch (error) {
      setMessage(error.message || 'couldn’t change the password.');
    } finally {
      setBusy(false);
    }
  }

  return <details className="migration-card viewer-password-reset">
    <summary>reset viewer password</summary>
    <form className="portal-form" onSubmit={submit}>
      <label><span>recovery key</span><input name="recoveryKey" required autoComplete="off" spellCheck="false" placeholder="tit_…" /></label>
      <label><span>new viewer password</span><input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <label><span>repeat password</span><input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <button type="submit" disabled={busy}>{busy ? 'changing…' : 'change password'}</button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>;
}

export default function SecureArchiveEditor({ archive }) {
  const [opened, setOpened] = useState(null);
  const [error, setError] = useState('decrypting your archive…');

  useEffect(() => {
    let active = true;
    async function open() {
      const dataKey = await loadArchiveKey(archive.id);
      if (!dataKey) {
        // signed in, but this browser has never held the key: ask for the recovery key
        window.location.replace(`/portal/${archive.id}/claim`);
        return;
      }
      try {
        const document = await decryptDocument(archive.id, dataKey, archive.crypto.document);
        const linkSecret = await decryptLinkSecret(archive.id, dataKey, archive.crypto.linkSecretWrap);
        const shareUrl = `${window.location.origin}/a/${archive.shareSlug}#${linkSecret}`;
        rememberArchive({ id: archive.id, shareSlug: archive.shareSlug, title: document.title });
        if (active) setOpened({ dataKey, document, shareUrl });
      } catch {
        if (active) setError('this browser’s key could not open the archive. open it again with your recovery key.');
      }
    }
    open();
    return () => { active = false; };
  }, [archive]);

  if (!opened) return <div className="gate"><p className="eyebrow">archive editor</p><h1>{error}</h1></div>;

  const secure = {
    dataKey: opened.dataKey,
    async save(document) {
      const encrypted = await encryptDocument(archive.id, opened.dataKey, document);
      const response = await fetch(`/api/archives/${archive.id}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: encrypted }),
      });
      if (!response.ok) throw new Error('save failed');
    },
    async upload(file) {
      const encrypted = await createEncryptedMedia(archive.id, opened.dataKey, await file.arrayBuffer());
      const form = new FormData();
      form.set('fileName', encrypted.fileName);
      form.set('file', encrypted.blob, encrypted.fileName);
      const response = await fetch(`/api/archives/${archive.id}/media`, { method: 'POST', body: form });
      if (!response.ok) throw new Error('upload failed');
      return encrypted.fileName;
    },
  };
  const identity = { id: archive.id, shareSlug: archive.shareSlug, shareUrl: opened.shareUrl, ...opened.document };
  if (opened.document.presentation === 'timeline') {
    return <>
      {archive.plaintextCleanupPending && <PlaintextCleanup archiveId={archive.id} entryCount={(opened.document.entries || []).length} />}
      <ViewerPasswordReset archive={archive} />
      <PersonalArchiveEditor archive={identity} entries={opened.document.entries || []} categories={categories} secure={secure} />
    </>;
  }
  return <>
    <ViewerPasswordReset archive={archive} />
    <ArchiveEditor archive={identity} secure={secure} />
  </>;
}
