'use client';

import { useEffect, useState } from 'react';
import ArchiveCanvasView from './ArchiveCanvasView';
import Entry from './Entry';
import { openWithViewerKey, viewerCredentials } from '../lib/archive-crypto';

const categories = {
  all: 'all', understood: 'things i understood too late', miss: 'things i miss', songs: 'songs', home: 'our home', unsaid: 'things i never said',
};

export default function SecureArchiveViewer({ gate }) {
  const archive = gate;
  const [opened, setOpened] = useState(null);
  const [category, setCategory] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkSecret, setLinkSecret] = useState(null);

  // The link secret lives in the #fragment, which browsers never send to the server.
  useEffect(() => {
    setLinkSecret(window.location.hash.slice(1));
  }, []);

  async function unlock(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const password = new FormData(event.currentTarget).get('passcode');
    try {
      const credentials = await viewerCredentials(gate, password, linkSecret);
      const response = await fetch(`/api/share/${gate.shareSlug}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ authSecret: credentials.authSecret }),
      });
      if (response.status === 429) throw new Error('too many attempts. try again later.');
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.archive) throw new Error('that password didn’t match. try again.');
      setOpened(await openWithViewerKey(gate.id, credentials.wrapKey, result.archive));
    } catch (unlockError) {
      setError(unlockError.message?.startsWith('too many') ? unlockError.message : 'that password didn’t match. try again.');
    } finally {
      setBusy(false);
    }
  }

  if (linkSecret !== null && !/^[A-Za-z0-9_-]{22}$/.test(linkSecret)) return <main id="main" className="gate">
    <p className="eyebrow">an encrypted archive</p>
    <h1>this link is incomplete.</h1>
    <p>ask the person who shared it for the full link. the part after # opens the archive and never reaches our server.</p>
  </main>;

  if (!opened) return <main id="main" className="gate">
    <p className="eyebrow">an encrypted archive</p>
    <h1>open the archive.</h1>
    <form onSubmit={unlock}>
      <label htmlFor="passcode">password</label>
      <div className="gate-input"><input id="passcode" name="passcode" type="password" required minLength={12} maxLength={128} autoComplete="current-password" aria-describedby={error ? 'gate-error' : undefined} aria-invalid={error ? true : undefined} /><button type="submit" disabled={busy || linkSecret === null}>{busy ? 'opening…' : 'open'}</button></div>
      {error && <p className="gate-error" id="gate-error" role="alert">{error}</p>}
    </form>
  </main>;

  const document = opened.document;
  if (document.presentation === 'timeline') {
    const entries = (document.entries || []).filter(entry => !entry.draft && (category === 'all' || entry.category === category));
    return <main id="main" className="notebook">
      <header className="opening"><p className="eyebrow">a private archive</p><h1>{document.title}</h1>{document.subtitle && <p className="intro">{document.subtitle}</p>}</header>
      <nav className="filters" aria-label="filter the archive">
        <button className="text-button" type="button" aria-current={category === 'all' ? 'page' : undefined} onClick={() => setCategory('all')}>all entries</button>
        <details className="browse"><summary>{category === 'all' ? 'browse by feeling' : categories[category]}</summary><div className="filter-options">{Object.entries(categories).filter(([value]) => value !== 'all').map(([value, label]) => <button className="text-button" type="button" key={value} aria-current={category === value ? 'page' : undefined} onClick={() => setCategory(value)}>{label}</button>)}</div></details>
      </nav>
      <section id="entries" aria-label="chronological archive">{entries.map(entry => <Entry key={entry.id} entry={entry} />)}</section>
      <footer><p>this is an archive, not an argument.</p><a href="/">create your own archive</a><form action={`/api/share/${archive.shareSlug}/lock`} method="post"><button className="text-button" type="submit">close the archive</button></form></footer>
    </main>;
  }

  return <main id="main" className="notebook shared-archive">
    <header className="shared-opening"><p className="eyebrow">a private archive</p><h1>{document.title}</h1>{document.subtitle && <p className="intro">{document.subtitle}</p>}</header>
    <nav className="shared-filter" aria-label="archive view"><span>all entries</span></nav>
    <ArchiveCanvasView archive={{ id: archive.id, canvas: document.canvas, items: document.items || [] }} dataKey={opened.dataKey} />
    <footer><p>this is an archive, not an argument.</p><form action={`/api/share/${archive.shareSlug}/lock`} method="post"><button className="text-button" type="submit">close the archive</button></form></footer>
  </main>;
}
