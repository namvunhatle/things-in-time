'use client';

import { useEffect, useRef, useState } from 'react';
import EncryptedImage from './EncryptedImage';
import { randomToken } from '../lib/archive-crypto';
import { isImageFile, prepareImage } from '../lib/prepare-image';
import { isStacked, readingOrder, sideOf } from '../lib/canvas-order';

const imageUrl = (archiveId, fileName) => `/api/archive-media/${archiveId}/${fileName}`;
const itemStyle = (item, archive, order = {}) => ({
  order: order[item.id],
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

function newNote(count) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value;
  return { id: randomToken(12), type: 'note', date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}`, content: '', x: 0, y: Math.min(760, 62 + count * 260), width: 728 };
}

function youtubeVideoId(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com') id = url.pathname === '/watch' ? (url.searchParams.get('v') || '') : (/^\/(?:shorts|embed)\//.test(url.pathname) ? (url.pathname.split('/')[2] || '') : '');
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : '';
  } catch {
    return '';
  }
}

export default function ArchiveEditor({ archive, secure = null }) {
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
  // encrypted archives carry the full link, with the #secret that opens them
  const shareUrl = archive.shareUrl || (typeof window === 'undefined' ? `/a/${archive.shareSlug}` : `${window.location.origin}/a/${archive.shareSlug}`);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    if (!itemsRef.current.length && !initialNoteRequested.current) {
      initialNoteRequested.current = true;
      addNote();
    }
  }, []);
  useEffect(() => {
    // encrypted archives keep no recovery link on the device (see lib/key-vault.js)
    if (secure) return;
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
      if (secure) {
        await secure.save({ presentation: 'canvas', title: nextTitle, subtitle: nextSubtitle, canvas: archive.canvas, items: nextItems });
        setStatus('');
        return;
      }
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
      if (secure) {
        const item = newNote(count);
        const next = [...itemsRef.current, item];
        replaceItems(next);
        await save(next);
        requestAnimationFrame(() => noteRefs.current.get(item.id)?.focus());
        return;
      }
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

  async function uploadFiles(files, point, attachedTo = null, alternate = false) {
    const images = [...files].filter(isImageFile);
    if (!images.length) {
      if (files.length) setStatus('choose a photo');
      return;
    }
    let next = itemsRef.current;
    let added = null;
    for (const [index, file] of images.entries()) {
      setStatus(images.length > 1 ? `uploading ${index + 1} of ${images.length}…` : 'uploading…');
      let prepared;
      try {
        prepared = await prepareImage(file);
      } catch (error) {
        setStatus(error.message);
        return;
      }
      // stacked (phone) uploads alternate sides so a batch doesn't line up on one edge
      const x = alternate ? (index % 2 ? 700 - point.x : point.x) : Math.max(0, Math.min(920, point.x + index * 22));
      const y = Math.max(0, Math.min(820, point.y + index * 22));
      if (secure) {
        try {
          const fileName = await secure.upload(prepared.blob);
          added = { id: randomToken(12), type: 'image', fileName, contentType: prepared.contentType, x, y, width: 280, alt: '', attachedTo };
          next = [...next, added];
          replaceItems(next);
          await save(next);
          continue;
        } catch (error) {
          setStatus(error.message || 'upload failed');
          return;
        }
      }
      const data = new FormData();
      data.set('file', new File([prepared.blob], prepared.contentType === 'image/gif' ? 'photo.gif' : 'photo.jpg', { type: prepared.contentType }));
      data.set('x', String(x));
      data.set('y', String(y));
      if (attachedTo) data.set('attachedTo', attachedTo);
      const response = await fetch(`/api/archives/${archive.id}/media`, { method: 'POST', body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(result.error || 'upload failed');
        return;
      }
      added = result.item;
      next = [...next, added];
      replaceItems(next);
    }
    setDropTarget(null);
    setStatus(images.length > 1 ? `${images.length} photos added` : 'photo added');
    // on a phone the canvas is a single column: show where the photo landed
    if (added && isStacked()) requestAnimationFrame(() => canvasRef.current?.querySelector(`[data-item="${added.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  async function addYoutube(event) {
    event.preventDefault();
    if (!youtubeUrl.trim()) return;
    const count = itemsRef.current.filter(item => item.type === 'youtube').length;
    setStatus('adding video…');
    try {
      if (secure) {
        const videoId = youtubeVideoId(youtubeUrl);
        if (!videoId) throw new Error('paste a valid YouTube link');
        const item = { id: randomToken(12), type: 'youtube', videoId, x: Math.max(0, 760 - count * 24), y: Math.min(660, 90 + count * 230), width: 360 };
        const next = [...itemsRef.current, item];
        replaceItems(next);
        await save(next);
        setYoutubeUrl('');
        setStatus('');
        return;
      }
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
    const files = [...event.target.files];
    event.target.value = '';
    const count = itemsRef.current.filter(item => item.type === 'image').length;
    if (isStacked()) {
      // phone: the photo goes after everything else, alternating sides, so it shows up at the bottom
      const lowest = itemsRef.current.reduce((max, item) => Math.max(max, item.y), 0);
      uploadFiles(files, { x: count % 2 ? 80 : 620, y: Math.min(820, lowest + 40) }, null, true);
      return;
    }
    uploadFiles(files, { x: 820 - (count % 4) * 28, y: 80 + (count % 6) * 42 });
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
    // stacked phone layout has no positions to drag; let the finger scroll the page
    if (isStacked()) return;
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
    window.addEventListener('pointercancel', end, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
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

  const order = readingOrder(items);

  return <>
    <header className="editor-bar">
      <div>
        <p className="eyebrow">editor</p>
        <textarea className="editor-title" rows={1} value={title} maxLength={80} aria-label="archive name" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} onChange={event => setTitle(event.target.value)} onBlur={() => save(itemsRef.current, title, subtitle)} />
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
          <a href={shareUrl} target="_blank" rel="noreferrer">view ↗</a>
        </div>
        {status && <span className="editor-status" role="status">{status}</span>}
      </div>
    </header>
    <div ref={canvasRef} className={`archive-canvas editor-canvas${dragging ? ' is-dragging' : ''}`} style={{ aspectRatio: `${archive.canvas.width} / ${archive.canvas.height}` }} onDragOver={event => event.preventDefault()} onDrop={dropOnCanvas}>
      {items.map(item => item.type === 'note' ? <article
        key={item.id}
        className={`canvas-note canvas-entry${dropTarget === item.id ? ' is-drop-target' : ''}`}
        style={itemStyle(item, archive, order)} data-item={item.id}
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
      </article> : item.type === 'youtube' ? <div key={item.id} className={`canvas-item youtube-sticky side-${sideOf(item, archive.canvas)}`} style={itemStyle(item, archive, order)} data-item={item.id} onPointerDown={event => beginMove(event, item)}>
        <div className="youtube-frame youtube-placeholder" aria-label="YouTube video preview">
          {item.thumbnailFileName && !secure && <img className="youtube-thumbnail" src={imageUrl(archive.id, item.thumbnailFileName)} alt="" draggable="false" />}
          {secure && <img className="youtube-thumbnail" src={`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`} alt="" draggable="false" referrerPolicy="no-referrer" />}
          <span className="youtube-play" aria-hidden="true">▶</span>
        </div>
        <div className="youtube-card-label"><span>{item.title || 'youtube'}</span></div>
      </div> : <div key={item.id} className={`canvas-item sticky-photo side-${sideOf(item, archive.canvas)}`} style={itemStyle(item, archive, order)} data-item={item.id} onPointerDown={event => beginMove(event, item)}>
        {secure ? <EncryptedImage archiveId={archive.id} fileName={item.fileName} dataKey={secure.dataKey} contentType={item.contentType} alt={item.alt || ''} draggable="false" /> : <img src={imageUrl(archive.id, item.fileName)} alt={item.alt || ''} draggable="false" />}
      </div>)}
    </div>
  </>;
}
