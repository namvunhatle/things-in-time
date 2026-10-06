'use client';

import { useEffect, useRef, useState } from 'react';

const imageUrl = (archiveId, fileName) => `/api/archive-media/${archiveId}/${fileName}`;
const itemStyle = (item, archive) => ({
  left: `${item.x / archive.canvas.width * 100}%`,
  top: `${item.y / archive.canvas.height * 100}%`,
  width: `${item.width / archive.canvas.width * 100}%`,
  ...(item.type === 'image' ? { '--tilt': `${([...item.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 7) - 3}deg` } : {}),
});

function dateLabel(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`)).toLowerCase();
}

function timeLabel(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}

export default function ArchiveEditor({ archive }) {
  const [items, setItems] = useState(archive.items);
  const [title, setTitle] = useState(archive.title);
  const [subtitle, setSubtitle] = useState(archive.subtitle || '');
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [recoveryUrl, setRecoveryUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const canvasRef = useRef(null);
  const itemsRef = useRef(items);
  const noteRefs = useRef(new Map());
  const initialNoteRequested = useRef(false);
  const shareUrl = typeof window === 'undefined' ? `/a/${archive.shareSlug}` : `${window.location.origin}/a/${archive.shareSlug}`;

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    if (!itemsRef.current.length && !initialNoteRequested.current) {
      initialNoteRequested.current = true;
      addNote();
    }
  }, []);
  useEffect(() => {
    const key = `archive_recovery_${archive.id}`;
    const stored = localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    if (stored) {
      localStorage.setItem(key, stored);
      try {
        const recent = JSON.parse(localStorage.getItem('archive_recent') || '[]').filter(item => item.id !== archive.id);
        recent.unshift({ id: archive.id, shareSlug: archive.shareSlug, title: archive.title, recoveryUrl: stored, lastOpened: new Date().toISOString() });
        localStorage.setItem('archive_recent', JSON.stringify(recent.slice(0, 20)));
      } catch {
        localStorage.setItem('archive_recent', JSON.stringify([{ id: archive.id, shareSlug: archive.shareSlug, title: archive.title, recoveryUrl: stored, lastOpened: new Date().toISOString() }]));
      }
    }
    setRecoveryUrl(stored);
  }, [archive.id, archive.title]);

  function canvasPoint(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * archive.canvas.width,
      y: (clientY - rect.top) / rect.height * archive.canvas.height,
    };
  }

  function replaceItems(updater) {
    setItems(current => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      itemsRef.current = next;
      return next;
    });
  }

  async function save(nextItems = itemsRef.current, nextTitle = title, nextSubtitle = subtitle) {
    setStatus('saving…');
    try {
      const response = await fetch(`/api/archives/${archive.id}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle, subtitle: nextSubtitle, items: nextItems }),
      });
      if (!response.ok) throw new Error('save failed');
      setStatus('');
    } catch {
      setStatus('couldn’t save');
    }
  }

  async function addNote() {
    const count = itemsRef.current.filter(item => item.type === 'note').length;
    setStatus('adding note…');
    try {
      const response = await fetch(`/api/archives/${archive.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 0, y: 62 + count * 260 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'could not add note');
      replaceItems(current => [...current, result.item]);
      setStatus('');
      requestAnimationFrame(() => noteRefs.current.get(result.item.id)?.focus());
    } catch (error) {
      setStatus(error.message || 'couldn’t add note');
    }
  }

  async function uploadFiles(files, point, attachedTo = null) {
    const images = [...files].filter(file => file.type.startsWith('image/'));
    if (!images.length) return;
    setStatus('uploading…');
    let next = itemsRef.current;
    for (const [index, file] of images.entries()) {
      const data = new FormData();
      data.set('file', file);
      data.set('x', String(point.x + index * 22));
      data.set('y', String(point.y + index * 22));
      if (attachedTo) data.set('attachedTo', attachedTo);
      const response = await fetch(`/api/archives/${archive.id}/media`, { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) {
        setStatus(result.error || 'upload failed');
        return;
      }
      next = [...next, result.item];
      replaceItems(next);
    }
    setDropTarget(null);
    setStatus('');
  }

  async function addYoutube(event) {
    event.preventDefault();
    if (!youtubeUrl.trim()) return;
    const count = itemsRef.current.filter(item => item.type === 'youtube').length;
    setStatus('adding video…');
    try {
      const response = await fetch(`/api/archives/${archive.id}/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl, x: 760 - count * 24, y: 90 + count * 230 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'could not add video');
      replaceItems(current => [...current, result.item]);
      setYoutubeUrl('');
      setStatus('');
    } catch (error) {
      setStatus(error.message || 'couldn’t add video');
    }
  }

  function dropOnCanvas(event) {
    event.preventDefault();
    uploadFiles(event.dataTransfer.files, canvasPoint(event.clientX, event.clientY));
  }

  function choosePhotos(event) {
    const count = itemsRef.current.filter(item => item.type === 'image').length;
    uploadFiles(event.target.files, { x: 820 - (count % 4) * 28, y: 80 + (count % 6) * 42 });
    event.target.value = '';
  }

  function dropOnNote(event, note) {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    uploadFiles(event.dataTransfer.files, {
      x: Math.min(archive.canvas.width - 280, note.x + note.width + 28),
      y: note.y,
    }, note.id);
  }

  function beginMove(event, item) {
    event.preventDefault();
    const point = canvasPoint(event.clientX, event.clientY);
    setDragging({ id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y });
  }

  useEffect(() => {
    if (!dragging) return;
    function move(event) {
      const point = canvasPoint(event.clientX, event.clientY);
      replaceItems(current => {
        const moved = current.find(item => item.id === dragging.id);
        if (!moved) return current;
        const x = Math.max(0, Math.min(archive.canvas.width - moved.width, point.x - dragging.offsetX));
        const y = Math.max(0, Math.min(archive.canvas.height - 40, point.y - dragging.offsetY));
        const dx = x - moved.x;
        const dy = y - moved.y;
        return current.map(item => {
          if (item.id === moved.id) return { ...item, x, y };
          if (moved.type === 'note' && item.attachedTo === moved.id) return {
            ...item,
            x: Math.max(0, Math.min(archive.canvas.width - item.width, item.x + dx)),
            y: Math.max(0, Math.min(archive.canvas.height - 40, item.y + dy)),
          };
          return item;
        });
      });
    }
    function end() {
      setDragging(null);
      requestAnimationFrame(() => save(itemsRef.current));
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
  }, [dragging]);

  function editNote(id, content) {
    replaceItems(current => current.map(item => item.id === id ? { ...item, content } : item));
    setStatus('unsaved');
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus('share link copied');
    } catch {
      setStatus('copy failed — open the view and copy its URL');
    }
  }

  async function copyRecoveryLink() {
    try {
      await navigator.clipboard.writeText(recoveryUrl);
      setStatus('editor recovery link copied');
    } catch {
      setStatus('couldn’t copy recovery link');
    }
  }

  return <>
    <header className="editor-bar">
      <div>
        <p className="eyebrow">editor</p>
        <input className="editor-title" value={title} maxLength={80} aria-label="archive name" onChange={event => setTitle(event.target.value)} onBlur={() => save(itemsRef.current, title, subtitle)} />
        <textarea className="editor-subtitle" value={subtitle} maxLength={400} aria-label="archive subtitle" placeholder="subtitle" onChange={event => setSubtitle(event.target.value)} onBlur={() => save(itemsRef.current, title, subtitle)} />
      </div>
      <div className="editor-actions">
        <div className="editor-create-actions">
          <button type="button" onClick={addNote}>+ text</button>
          <label className="editor-upload">+ photo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={choosePhotos} /></label>
          <details className="editor-video-add">
            <summary>+ video</summary>
            <form className="youtube-add-form" onSubmit={addYoutube}>
              <input type="url" value={youtubeUrl} onChange={event => setYoutubeUrl(event.target.value)} placeholder="youtube url" aria-label="YouTube link" />
              <button type="submit">add</button>
            </form>
          </details>
        </div>
        <div className="editor-link-actions">
          {recoveryUrl && <button type="button" onClick={copyRecoveryLink}>editor link</button>}
          <button type="button" onClick={copyShareLink}>share link</button>
          <a href={`/a/${archive.shareSlug}`} target="_blank" rel="noreferrer">view ↗</a>
        </div>
        {status && <span className="editor-status" role="status">{status}</span>}
      </div>
    </header>
    <div ref={canvasRef} className={`archive-canvas editor-canvas${dragging ? ' is-dragging' : ''}`} style={{ aspectRatio: `${archive.canvas.width} / ${archive.canvas.height}` }} onDragOver={event => event.preventDefault()} onDrop={dropOnCanvas}>
      {items.map(item => item.type === 'note' ? <article
        key={item.id}
        className={`canvas-note canvas-entry${dropTarget === item.id ? ' is-drop-target' : ''}`}
        style={itemStyle(item, archive)}
        onDragEnter={event => { event.preventDefault(); setDropTarget(item.id); }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }}
        onDrop={event => dropOnNote(event, item)}
      >
        <div className="note-meta" onPointerDown={event => beginMove(event, item)}>
          <time dateTime={`${item.date}T${item.time}+07:00`}>{dateLabel(item.date)}</time>
          {item.time && <span>{timeLabel(item.time)}</span>}
        </div>
        <div className="note-writing">
          <textarea ref={node => { if (node) noteRefs.current.set(item.id, node); else noteRefs.current.delete(item.id); }} className="note-editor" value={item.content} maxLength={10000} aria-label={`text dump from ${dateLabel(item.date)}`} placeholder="type it here. leave it rough." onChange={event => editNote(item.id, event.target.value)} onBlur={() => save(itemsRef.current)} />
        </div>
      </article> : item.type === 'youtube' ? <div key={item.id} className="canvas-item youtube-sticky" style={itemStyle(item, archive)} onPointerDown={event => beginMove(event, item)}>
        <div className="youtube-frame youtube-placeholder" aria-label="YouTube video preview">
          {item.thumbnailFileName && <img className="youtube-thumbnail" src={imageUrl(archive.id, item.thumbnailFileName)} alt="" draggable="false" />}
          <span className="youtube-play" aria-hidden="true">▶</span>
        </div>
        <div className="youtube-card-label"><span>{item.title || 'youtube'}</span></div>
      </div> : <div key={item.id} className="canvas-item sticky-photo" style={itemStyle(item, archive)} onPointerDown={event => beginMove(event, item)}>
        <img src={imageUrl(archive.id, item.fileName)} alt={item.alt || ''} draggable="false" />
      </div>)}
    </div>
  </>;
}
