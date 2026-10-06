'use client';

import { useState } from 'react';
import { createSecureArchive } from '../lib/archive-crypto';
import { rememberArchive, saveArchiveKey } from '../lib/key-vault';

export default function LegacyEncryptionMigration({ archive, document }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);

  async function migrate(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirm')) {
      setError('the passwords don’t match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const encrypted = await createSecureArchive({
        title: document.title,
        password: form.get('password'),
        document,
        archiveId: archive.id,
        shareSlug: archive.shareSlug,
      });
      const response = await fetch(`/api/archives/${archive.id}/migrate-encrypted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted.archive),
      });
      const responseBody = await response.json();
      if (!response.ok) throw new Error(responseBody.error || 'encryption failed');
      // the old editor session was bound to the old editor key: sign in again with the new one,
      // and keep the data key on this device. The recovery key is shown once and stored nowhere.
      const session = await fetch(`/api/archives/${archive.id}/editor-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: encrypted.editorAuth }),
      });
      if (!session.ok) throw new Error('encrypted, but this browser couldn’t sign in. use your recovery key.');
      await saveArchiveKey(archive.id, encrypted.dataKey);
      rememberArchive({ id: archive.id, shareSlug: archive.shareSlug, title: document.title });
      setResult({ recoveryKey: encrypted.recoveryKey, editorUrl: `/portal/${archive.id}`, cleanupPending: responseBody.cleanupPending });
    } catch (migrationError) {
      setError(migrationError.message || 'encryption failed');
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(result.recoveryKey);
      setSaved(true);
    } catch {
      setError('copy failed. select the key and save it somewhere private.');
    }
  }

  if (result) return <section className="recovery-key-card migration-card">
    <p className="eyebrow">zero-access encryption is on</p>
    <h2>save your new recovery key.</h2>
    <p>this is the only way back into the editor. we cannot recover it.</p>
    <p>your view link has changed: old links stop working. open the new one with “view link” in the editor.</p>
    <output className="recovery-key">{result.recoveryKey}</output>
    <button type="button" onClick={copyKey}>copy recovery key</button>
    <label className="recovery-confirm"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} /> i saved it somewhere safe</label>
    <button type="button" disabled={!saved} onClick={() => window.location.assign(result.editorUrl)}>verify encrypted archive</button>
  </section>;

  if (!open) return <button className="migration-trigger" type="button" onClick={() => setOpen(true)}>turn on zero-access encryption</button>;

  return <form className="migration-card portal-form" onSubmit={migrate}>
    <p>choose a new viewer password. notes and metadata will be encrypted in this browser before upload.</p>
    <label><span>new viewer password</span><input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /></label>
    <label><span>repeat password</span><input name="confirm" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /></label>
    {error && <p className="portal-error" role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'encrypting…' : 'encrypt archive'}</button>
  </form>;
}
