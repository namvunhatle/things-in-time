'use client';

import { useEffect, useState } from 'react';
import ArchiveCanvasView from './ArchiveCanvasView';
import Entry from './Entry';
import { decryptLinkSecret, openWithViewerKey, viewerCredentials } from '../lib/archive-crypto';
import { loadArchiveKey } from '../lib/key-vault';

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

  const [ownsArchive, setOwnsArchive] = useState(false);

  // The link secret lives in the #fragment, which browsers never send to the server.
  // Opened without it (an old bookmark, a trimmed link)? If this browser holds the archive's key,
  // it is the owner's: rebuild the full link instead of turning them away.
  useEffect(() => {
    let active = true;
    async function readLink() {
      const fromHash = window.location.hash.slice(1);
      if (/^[A-Za-z0-9_-]{22}$/.test(fromHash)) {
        setLinkSecret(fromHash);
        return;
      }
      const dataKey = gate.linkSecretWrap ? await loadArchiveKey(gate.id) : null;
      if (dataKey) {
        try {
          const recovered = await decryptLinkSecret(gate.id, dataKey, gate.linkSecretWrap);
          window.history.replaceState(null, '', `${window.location.pathname}#${recovered}`);
          if (active) setLinkSecret(recovered);
          return;
        } catch {
          if (active) setOwnsArchive(true);
        }
      }
      if (active) setLinkSecret(fromHash);
    }
    readLink();
    return () => { active = false; };
  }, [gate]);

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
      // only a 401 means the password (with this link) is wrong; say so only then
      if (response.status === 401) throw new Error('that password didn’t match. try again.');
      if (response.status === 429) throw new Error('too many attempts. try again later.');
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.archive) throw new Error(`couldn’t open the archive (error ${response.status}). try again.`);
      try {
        setOpened(await openWithViewerKey(gate.id, credentials.wrapKey, result.archive));
      } catch {
        throw new Error('the password matched, but the archive couldn’t be decrypted. ask the owner to reset the password.');
      }
    } catch (unlockError) {
      setError(unlockError.message || 'couldn’t open the archive. try again.');
    } finally {
      setBusy(false);
    }
  }

  if (linkSecret !== null && !/^[A-Za-z0-9_-]{22}$/.test(linkSecret)) return <main id="main" className="gate">
    <p className="eyebrow">an encrypted archive</p>
    <h1>this link is incomplete.</h1>
    <p>ask the person who shared it for the full link. the part after # opens the archive and never reaches our server.</p>
    <p>{ownsArchive ? 'this browser’s key no longer matches. open the editor with your recovery key, then use “view link” there.' : 'if this is your archive, open your editor and use “view link” there.'} <a href={`/portal/${gate.id}`}>open the editor</a></p>
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
