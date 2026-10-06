'use client';

import { useEffect, useState } from 'react';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function EntryForm({ archiveId, entry, categories, onSaved, isNew = false }) {
  const [value, setValue] = useState(entry);
  const [status, setStatus] = useState('');

  function change(field, next) {
    setValue(current => ({ ...current, [field]: next }));
    if (!isNew) setStatus('unsaved');
  }

  function toggleSong(enabled) {
    setValue(current => ({
      ...current,
      category: enabled ? 'songs' : current.category === 'songs' ? 'unsaid' : current.category,
      song: enabled ? (current.song || { title: '', artist: '', url: '' }) : null,
    }));
    if (!isNew) setStatus('unsaved');
  }

  function changeSong(field, next) {
    setValue(current => ({ ...current, song: { ...current.song, [field]: next } }));
    if (!isNew) setStatus('unsaved');
  }

  async function submit(event) {
    event.preventDefault();
    setStatus('saving…');
    const endpoint = isNew
      ? `/api/archives/${archiveId}/entries`
      : `/api/archives/${archiveId}/entries/${entry.id}`;
    try {
      const response = await fetch(endpoint, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'save failed');
      setValue(result.entry);
      setStatus('');
      onSaved(result.entry);
      if (isNew) setValue({ title: '', content: '', date: today(), time: '', category: 'unsaid', song: null });
    } catch (error) {
      setStatus(error.message || 'couldn’t save');
    }
  }

  return <form className={`personal-entry-form${isNew ? ' is-new' : ''}`} onSubmit={submit}>
    <div className="personal-entry-meta">
      <label><span>date</span><input type="date" value={value.date} required onChange={event => change('date', event.target.value)} /></label>
      <label><span>time</span><input type="time" value={value.time || ''} onChange={event => change('time', event.target.value)} /></label>
      <label><span>category</span><select value={value.category || 'unsaid'} disabled={Boolean(value.song)} onChange={event => change('category', event.target.value)}>{Object.entries(categories).filter(([key]) => key !== 'all').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    <label className="song-toggle"><input type="checkbox" checked={Boolean(value.song)} onChange={event => toggleSong(event.target.checked)} /><span>song</span></label>
    {value.song && <div className="personal-song-fields">
      <label><span>song title</span><input value={value.song.title || ''} maxLength={200} required onChange={event => changeSong('title', event.target.value)} /></label>
      <label><span>artist</span><input value={value.song.artist || ''} maxLength={200} required onChange={event => changeSong('artist', event.target.value)} /></label>
      <label><span>link <small>optional</small></span><input type="url" value={value.song.url || ''} maxLength={1000} placeholder="https://" onChange={event => changeSong('url', event.target.value)} /></label>
    </div>}
    {!value.song && <label className="personal-entry-title"><span>title</span><input value={value.title || ''} maxLength={200} placeholder="optional" onChange={event => change('title', event.target.value)} /></label>}
    <label className="personal-entry-content"><span>text</span><textarea value={value.content || ''} maxLength={20000} required placeholder="leave it rough." onChange={event => change('content', event.target.value)} /></label>
    <div className="personal-entry-save"><button type="submit">{isNew ? 'publish' : 'save'}</button>{status && <span role="status">{status}</span>}</div>
  </form>;
}

export default function PersonalArchiveEditor({ archive, entries: initialEntries, categories }) {
  const [title, setTitle] = useState(archive.title);
  const [subtitle, setSubtitle] = useState(archive.subtitle);
  const [entries, setEntries] = useState(initialEntries);
  const [status, setStatus] = useState('');
  const [recoveryUrl, setRecoveryUrl] = useState('');
  const shareUrl = typeof window === 'undefined' ? `/a/${archive.shareSlug}` : `${window.location.origin}/a/${archive.shareSlug}`;

  useEffect(() => {
    const key = `archive_recovery_${archive.id}`;
    const stored = localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    if (stored) localStorage.setItem(key, stored);
    setRecoveryUrl(stored);
  }, [archive.id]);

  async function saveSettings() {
    setStatus('saving…');
    try {
      const response = await fetch(`/api/archives/${archive.id}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, subtitle }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'save failed');
      setStatus('');
    } catch (error) {
      setStatus(error.message || 'couldn’t save');
    }
  }

  async function copy(value, success) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(success);
    } catch {
      setStatus('couldn’t copy link');
    }
  }

  function replaceEntry(saved) {
    setEntries(current => current.map(entry => entry.id === saved.id ? saved : entry));
  }

  function addEntry(saved) {
    setEntries(current => [saved, ...current]);
    setStatus('entry added');
  }

  return <>
    <header className="personal-editor-header">
      <p className="eyebrow">editor</p>
      <textarea className="editor-title" rows={1} value={title} maxLength={80} aria-label="archive title" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} onChange={event => { setTitle(event.target.value); setStatus('unsaved'); }} onBlur={saveSettings} />
      <textarea className="editor-subtitle" value={subtitle} maxLength={400} aria-label="archive subtitle" placeholder="subtitle" onChange={event => { setSubtitle(event.target.value); setStatus('unsaved'); }} onBlur={saveSettings} />
      <div className="personal-editor-actions">
        {recoveryUrl && <button type="button" onClick={() => copy(recoveryUrl, 'editor link copied')}>editor link</button>}
        <button type="button" onClick={() => copy(shareUrl, 'share link copied')}>share link</button>
        <a href={`/a/${archive.shareSlug}`} target="_blank" rel="noreferrer">view ↗</a>
        {status && <span role="status">{status}</span>}
      </div>
    </header>
    <details className="personal-composer">
      <summary>new entry</summary>
      <EntryForm archiveId={archive.id} entry={{ title: '', content: '', date: today(), time: '', category: 'unsaid', song: null }} categories={categories} onSaved={addEntry} isNew />
    </details>
    <section className="personal-entry-list" aria-label="published entries">
      <p className="eyebrow">{entries.length} published entries</p>
      {entries.map(entry => <details className="personal-entry" key={entry.id}>
        <summary><time dateTime={`${entry.date}${entry.time ? `T${entry.time}` : ''}`}>{entry.date}</time><span>{entry.song?.title || entry.title || entry.content.split('\n')[0]}</span></summary>
        <EntryForm archiveId={archive.id} entry={entry} categories={categories} onSaved={replaceEntry} />
      </details>)}
    </section>
  </>;
}
