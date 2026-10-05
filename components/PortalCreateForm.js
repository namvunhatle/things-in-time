'use client';

import { useState } from 'react';

export default function PortalCreateForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      const response = await fetch('/api/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.get('title'), password: form.get('password') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'couldn’t create the archive.');
      window.location.assign(result.editorUrl);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return <form className="portal-form" onSubmit={submit}>
    <label>
      <span>archive name</span>
      <input name="title" required maxLength={80} placeholder="somewhere between then and now" />
    </label>
    <label>
      <span>viewer password</span>
      <input name="password" type="password" required minLength={6} maxLength={128} autoComplete="new-password" />
    </label>
    <label>
      <span>repeat password</span>
      <input name="confirm" type="password" required minLength={6} maxLength={128} autoComplete="new-password" />
    </label>
    {error && <p className="portal-error" role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'creating…' : 'create archive'}</button>
  </form>;
}
