'use client';

import { useState } from 'react';
import PortalCreateForm from './PortalCreateForm';
import RecentArchives from './RecentArchives';

const PERSONAL_ARCHIVE_SLUG = 'things-i-couldnt-say-in-time';

export default function PortalLanding() {
  const [mode, setMode] = useState('create');
  const [viewValue, setViewValue] = useState('');
  const [error, setError] = useState('');

  function openArchive(event) {
    event.preventDefault();
    setError('');
    const value = viewValue.trim();
    let slug = value;
    try {
      if (/^https?:\/\//i.test(value)) {
        const url = new URL(value);
        const match = url.pathname.match(/^\/a\/([a-zA-Z0-9_-]{3,80})(?:\/unlock)?\/?$/);
        if (!match) throw new Error();
        slug = match[1];
      }
    } catch {
      setError('paste a valid archive link.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(slug)) {
      setError('paste a valid archive link.');
      return;
    }
    window.location.assign(`/a/${slug}`);
  }

  return <main id="main" className="portal-shell product-home">
    <nav className="portal-modes" aria-label="archive mode">
      <button type="button" aria-current={mode === 'create' ? 'page' : undefined} onClick={() => setMode('create')}>create</button>
      <button type="button" aria-current={mode === 'view' ? 'page' : undefined} onClick={() => setMode('view')}>view</button>
    </nav>

    {mode === 'create' ? <>
      <section className="portal-intro">
        <p className="eyebrow">a new archive</p>
        <h1>make a quiet place<br />for what you want to keep.</h1>
        <p>start with an empty canvas. add text dumps, drop photos anywhere, then share a password-protected view.</p>
      </section>
      <RecentArchives />
      <PortalCreateForm />
      <p className="portal-note">this browser remembers editor links · copy the recovery link before switching devices</p>
    </> : <>
      <section className="portal-intro">
        <p className="eyebrow">view an archive</p>
        <h1>open something<br />someone shared with you.</h1>
        <p>paste the archive link. its password is entered on the next screen.</p>
      </section>
      <form className="portal-form view-archive-form" onSubmit={openArchive}>
        <label><span>archive link</span><input value={viewValue} onChange={event => setViewValue(event.target.value)} placeholder="https://things-in-time.vercel.app/a/…" required /></label>
        {error && <p className="portal-error" role="alert">{error}</p>}
        <button type="submit">open archive</button>
      </form>
      <p className="portal-note"><a href={`/a/${PERSONAL_ARCHIVE_SLUG}`}>test with my archive →</a></p>
    </>}
  </main>;
}
