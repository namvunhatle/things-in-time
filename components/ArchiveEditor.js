'use client';

import { useEffect, useRef, useState } from 'react';

const imageUrl = (archiveId, fileName) => `/api/archive-media/${archiveId}/${fileName}`;
const itemStyle = (item, archive) => ({
  left: `${item.x / archive.canvas.width * 100}%`,
  top: `${item.y / archive.canvas.height * 100}%`,
  width: `${item.width / archive.canvas.width * 100}%`,
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
  const [status, setStatus] = useState('saved');
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [recoveryUrl, setRecoveryUrl] = useState('');
  const canvasRef = useRef(null);
  const itemsRef = useRef(items);
  const noteRefs = useRef(new Map());
  const shareUrl = typeof window === 'undefined' ? `/a/${archive.id}` : `${window.location.origin}/a/${archive.id}`;

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { setRecoveryUrl(sessionStorage.getItem(`archive_recovery_${archive.id}`) || ''); }, [archive.id]);

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

  async function save(nextItems = itemsRef.current, nextTitle = title) {
    setStatus('saving…');
    try {
      const response = await fetch(`/api/archives/${archive.id}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle, items: nextItems }),
      });
      if (!response.ok) throw new Error('save failed');
      setStatus('saved');
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
        body: JSON.stringify({ x: 90 + count * 24, y: 90 + count * 34 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'could not add note');
      replaceItems(current => [...current, result.item]);
      setStatus('saved');
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
    setStatus('saved');
  }

  function dropOnCanvas(event) {
    event.preventDefault();
    uploadFiles(event.dataTransfer.files, canvasPoint(event.clientX, event.clientY));
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
        <p className="eyebrow">archive editor</p>
        <input className="editor-title" value={title} maxLength={80} aria-label="archive name" onChange={event => setTitle(event.target.value)} onBlur={() => save(itemsRef.current, title)} />
      </div>
      <div className="editor-actions">
        <span>{status}</span>
        <button type="button" onClick={addNote}>+ text dump</button>
        {recoveryUrl && <button type="button" onClick={copyRecoveryLink}>copy editor recovery link</button>}
        <button type="button" onClick={copyShareLink}>copy share link</button>
        <a href={`/a/${archive.id}`} target="_blank" rel="noreferrer">open view ↗</a>
      </div>
    </header>
    <div className="editor-help">add a text dump, then drop a photo onto that note to place it beside the writing. everything can still be moved.</div>
    <div ref={canvasRef} className={`archive-canvas editor-canvas${dragging ? ' is-dragging' : ''}`} style={{ aspectRatio: `${archive.canvas.width} / ${archive.canvas.height}` }} onDragOver={event => event.preventDefault()} onDrop={dropOnCanvas}>
      {!items.length && <div className="canvas-empty"><button type="button" onClick={addNote}>start with a text dump</button><small>then drop a photo directly onto the note</small></div>}
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
          <small>drag note</small>
        </div>
        <div className="note-writing">
          <textarea ref={node => { if (node) noteRefs.current.set(item.id, node); else noteRefs.current.delete(item.id); }} className="note-editor" value={item.content} maxLength={10000} aria-label={`text dump from ${dateLabel(item.date)}`} placeholder="type it here. leave it rough." onChange={event => editNote(item.id, event.target.value)} onBlur={() => save(itemsRef.current)} />
          <div className="note-drop-hint">drop a photo on this entry → it’ll sit beside the writing</div>
        </div>
      </article> : <div key={item.id} className="canvas-item" style={itemStyle(item, archive)} onPointerDown={event => beginMove(event, item)}>
        <img src={imageUrl(archive.id, item.fileName)} alt={item.alt || ''} draggable="false" />
      </div>)}
    </div>
    <p className="editor-footnote">keep this editor URL private. anyone with it can change this archive. localhost share links only work on this machine.</p>
  </>;
}
