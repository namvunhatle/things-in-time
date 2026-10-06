'use client';

import { useState } from 'react';
import { createSecureArchive } from '../lib/archive-crypto';
import { rememberArchive, saveArchiveKey } from '../lib/key-vault';

export default function PortalCreateForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [saved, setSaved] = useState(false);

  async function copyRecoveryKey() {
    try {
      await navigator.clipboard.writeText(created.recoveryKey);
      setSaved(true);
    } catch {
      setError('copy failed. select the recovery key and save it somewhere private.');
    }
  }

  function openEditor() {
    if (!created || !saved) return;
    window.location.assign(`/portal/${created.id}`);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirm')) {
      setError('the passwords don’t match.');
      setBusy(false);
      return;
    }
    try {
      const title = String(form.get('title') || '').trim();
      if (!title || title.length > 80) throw new Error('archive name must be between 1 and 80 characters.');
      const encrypted = await createSecureArchive({ title, password: form.get('password') });
      const response = await fetch('/api/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted.archive),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'couldn’t create the archive.');
      // sign this browser in as the editor and keep the data key here (non-extractable);
      // the recovery key is shown once below and stored nowhere
      const session = await fetch(`/api/archives/${result.id}/editor-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: encrypted.editorAuth }),
      });
      if (!session.ok) throw new Error('the archive was created, but this browser couldn’t sign in. use your recovery key.');
      await saveArchiveKey(result.id, encrypted.dataKey);
      rememberArchive({ id: result.id, shareSlug: result.shareSlug, title });
      setCreated({ id: result.id, recoveryKey: encrypted.recoveryKey });
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  if (created) return <section className="recovery-key-card" aria-labelledby="recovery-title">
    <p className="eyebrow">recovery key</p>
    <h2 id="recovery-title">save this somewhere private.</h2>
    <p>it is the only way back into your editor. we cannot recover it for you.</p>
    <output className="recovery-key" aria-label="recovery key">{created.recoveryKey}</output>
    <button type="button" onClick={copyRecoveryKey}>copy recovery key</button>
    <label className="recovery-confirm"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} /> i saved it somewhere safe</label>
    <button type="button" disabled={!saved} onClick={openEditor}>open editor</button>
    {error && <p className="portal-error" role="alert">{error}</p>}
  </section>;

  return <form className="portal-form" onSubmit={submit}>
    <label>
      <span>archive name</span>
      <input name="title" required maxLength={80} placeholder="somewhere between then and now" />
    </label>
    <label>
      <span>viewer password</span>
      <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
    </label>
    <label>
      <span>repeat password</span>
      <input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
    </label>
    {error && <p className="portal-error" role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'creating…' : 'create archive'}</button>
  </form>;
}
