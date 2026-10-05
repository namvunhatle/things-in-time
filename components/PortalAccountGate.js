'use client';

import { useState } from 'react';

export default function PortalAccountGate() {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    if (mode === 'register' && form.get('password') !== form.get('confirm')) {
      setError('the passwords don’t match.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/account/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'couldn’t continue.');
      window.location.reload();
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return <>
    <div className="account-switch" role="tablist" aria-label="account access">
      <button type="button" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>sign in</button>
      <button type="button" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>create account</button>
    </div>
    <form className="portal-form account-form" onSubmit={submit}>
      <label><span>username</span><input name="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}" autoComplete="username" /></label>
      <label><span>password</span><input name="password" type="password" required minLength={8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {mode === 'register' && <label><span>repeat password</span><input name="confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>}
      {error && <p className="portal-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'one moment…' : mode === 'login' ? 'sign in' : 'create account'}</button>
    </form>
  </>;
}
