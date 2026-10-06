'use client';

import { useState } from 'react';
import ArchiveCanvasView from './ArchiveCanvasView';
import Entry from './Entry';
import { unlockWithPassword } from '../lib/archive-crypto';

const categories = {
  all: 'all', understood: 'things i understood too late', miss: 'things i miss', songs: 'songs', home: 'our home', unsaid: 'things i never said',
};

export default function SecureArchiveViewer({ archive }) {
  const [opened, setOpened] = useState(null);
  const [category, setCategory] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function unlock(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const password = new FormData(event.currentTarget).get('passcode');
    try {
      const result = await unlockWithPassword(archive, password);
      const response = await fetch(`/api/share/${archive.shareSlug}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ authSecret: result.authSecret }),
      });
      if (!response.ok) throw new Error();
      setOpened(result);
    } catch {
      setError('that password didn’t match. try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!opened) return <main id="main" className="gate">
    <p className="eyebrow">an encrypted archive</p>
    <h1>open the archive.</h1>
    <form onSubmit={unlock}>
      <label htmlFor="passcode">password</label>
      <div className="gate-input"><input id="passcode" name="passcode" type="password" required minLength={12} maxLength={128} autoComplete="current-password" aria-describedby={error ? 'gate-error' : undefined} aria-invalid={error ? true : undefined} /><button type="submit" disabled={busy}>{busy ? 'opening…' : 'open'}</button></div>
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
