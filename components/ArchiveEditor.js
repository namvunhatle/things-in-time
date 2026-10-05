'use client';

import { useEffect, useRef, useState } from 'react';

function imageUrl(archiveId, fileName) {
  return `/api/archive-media/${archiveId}/${fileName}`;
}

export default function ArchiveEditor({ archive }) {
  const [items, setItems] = useState(archive.items);
  const [title, setTitle] = useState(archive.title);
  const [status, setStatus] = useState('saved');
  const [dragging, setDragging] = useState(null);
  const [recoveryUrl, setRecoveryUrl] = useState('');
  const canvasRef = useRef(null);
  const itemsRef = useRef(items);
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

  async function uploadFiles(files, point) {
    const images = [...files].filter(file => file.type.startsWith('image/'));
    if (!images.length) return;
    setStatus('uploading…');
    let next = itemsRef.current;
    for (const [index, file] of images.entries()) {
      const data = new FormData();
      data.set('file', file);
      data.set('x', String(point.x + index * 22));
      data.set('y', String(point.y + index * 22));
      const response = await fetch(`/api/archives/${archive.id}/media`, { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) {
        setStatus(result.error || 'upload failed');
        return;
      }
      next = [...next, result.item];
      setItems(next);
      itemsRef.current = next;
    }
    setStatus('saved');
  }

  function drop(event) {
    event.preventDefault();
    const point = canvasPoint(event.clientX, event.clientY);
    uploadFiles(event.dataTransfer.files, point);
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
      setItems(current => {
        const next = current.map(item => item.id === dragging.id ? {
          ...item,
          x: Math.max(0, Math.min(archive.canvas.width - item.width, point.x - dragging.offsetX)),
          y: Math.max(0, Math.min(archive.canvas.height - 40, point.y - dragging.offsetY)),
        } : item);
        itemsRef.current = next;
        return next;
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
        {recoveryUrl && <button type="button" onClick={copyRecoveryLink}>copy editor recovery link</button>}
        <button type="button" onClick={copyShareLink}>copy share link</button>
        <a href={`/a/${archive.id}`} target="_blank" rel="noreferrer">open view ↗</a>
      </div>
    </header>
    <div className="editor-help">drop photos anywhere on the canvas. drag them again to move them.</div>
    <div
      ref={canvasRef}
      className={`archive-canvas editor-canvas${dragging ? ' is-dragging' : ''}`}
      style={{ aspectRatio: `${archive.canvas.width} / ${archive.canvas.height}` }}
      onDragOver={event => event.preventDefault()}
      onDrop={drop}
    >
      {!items.length && <div className="canvas-empty"><span>drop a photo here</span><small>jpg, png, webp, gif or avif · max 10 MB</small></div>}
      {items.map(item => <div
        key={item.id}
        className="canvas-item"
        style={{ left: `${item.x / archive.canvas.width * 100}%`, top: `${item.y / archive.canvas.height * 100}%`, width: `${item.width / archive.canvas.width * 100}%` }}
        onPointerDown={event => beginMove(event, item)}
      >
        <img src={imageUrl(archive.id, item.fileName)} alt={item.alt || ''} draggable="false" />
      </div>)}
    </div>
    <p className="editor-footnote">keep this editor URL private. anyone with it can change this archive. localhost share links only work on this machine.</p>
  </>;
}
