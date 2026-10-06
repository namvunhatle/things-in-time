'use client';

import { useState } from 'react';

export default function ArchiveUnlockForm({ archiveId, initialError = false }) {
  const [error, setError] = useState(initialError ? 'that password didn’t match. try again.' : '');
  const [opening, setOpening] = useState(false);

  async function unlock(event) {
    event.preventDefault();
    if (opening) return;
    setOpening(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/share/${archiveId}/unlock`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: form,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.redirect) {
        setError(result?.error || 'couldn’t open this archive. try again.');
        return;
      }
      window.location.assign(result.redirect);
    } catch {
      setError('couldn’t open this archive. check your connection and try again.');
    } finally {
      setOpening(false);
    }
  }

  return <form action={`/api/share/${archiveId}/unlock`} method="post" onSubmit={unlock}>
    <label htmlFor="passcode">password</label>
    <div className="gate-input"><input id="passcode" name="passcode" type="password" required autoComplete="current-password" maxLength={128} aria-describedby={error ? 'gate-error' : undefined} aria-invalid={error ? true : undefined} /><button type="submit" disabled={opening}>{opening ? 'opening…' : 'open'}</button></div>
    {error && <p className="gate-error" id="gate-error" role="alert">{error}</p>}
  </form>;
}
