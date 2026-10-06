'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DragDropProvider } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import EncryptedImage from './EncryptedImage';
import { randomToken } from '../lib/archive-crypto';
import { isImageFile, prepareImage } from '../lib/prepare-image';
import { STACKED_QUERY, isStacked, readingOrder, sideOf } from '../lib/canvas-order';
import { ITEM_GAP, estimateHeight, fittedCanvas, insertAtTop, lowestBottom, moveInReadingOrder, nextBeside, pushApart } from '../lib/canvas-layout';

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
// coming back to the editor after this long starts a fresh page on a phone
const NEW_PAGE_AFTER = 15 * 60 * 1000;
// on the desktop canvas the blank page needs room at the top: everything else is drawn this much
// lower while it's there, which is exactly where the first character moves it (see insertAtTop)
const DRAFT_SPACE = estimateHeight({ type: 'note', content: '' }) + ITEM_GAP;

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

function newNote(y) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value;
  return { id: randomToken(12), type: 'note', date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}`, content: '', x: 0, y, width: 728 };
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

// On a phone the canvas is one column and items are reordered by long-press and drag (dnd-kit);
// on a wider screen they are moved freely with beginMove below.
function Sortable({ id, index, disabled, children }) {
  const { ref, handleRef } = useSortable({ id, index, disabled });
  return children(ref, handleRef);
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
  const [stacked, setStacked] = useState(false);
  // an encrypted archive opens on a blank page at the top: a note that doesn't exist until the
  // first character is typed, so opening and closing the editor leaves nothing behind
  const [draft, setDraft] = useState(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [showSubtitle, setShowSubtitle] = useState(false);
  // encrypted archives grow taller as they fill up; legacy ones keep the server's fixed size
  const [canvas, setCanvas] = useState(archive.canvas);
  const canvasSize = useRef(archive.canvas);
  const canvasRef = useRef(null);
  const itemsRef = useRef(items);
  const titleRef = useRef(title);
  const subtitleRef = useRef(subtitle);
  const draftRef = useRef(null);
  const lastNoteRef = useRef(null);
  const noteRefs = useRef(new Map());
  const menuRef = useRef(null);
  const subtitleField = useRef(null);
  const initialNoteRequested = useRef(false);
  const saveChain = useRef(Promise.resolve());
  const saveTimer = useRef(null);
  const unsaved = useRef(false);
  const saveRef = useRef(null);
  const startWritingRef = useRef(null);
  const viewOffset = useRef(0);
  const focusDraft = useRef(false);
  // encrypted archives carry the full link, with the #secret that opens them
  const shareUrl = archive.shareUrl || (typeof window === 'undefined' ? `/a/${archive.shareSlug}` : `${window.location.origin}/a/${archive.shareSlug}`);

  useEffect(() => { itemsRef.current = items; }, [items]);
  // confirmations ("photo added", "editor link copied") fade out; work in progress and errors stay
  useEffect(() => {
    if (!status || status.endsWith('…') || status.startsWith('couldn')) return;
    const timer = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(timer);
  }, [status]);
  useEffect(() => {
    const query = window.matchMedia(STACKED_QUERY);
    const update = () => setStacked(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!secure || draftRef.current) return;
    // a desktop opens with the caret on the blank page (once it's on screen, below); a phone waits
    // for a tap, which is when the keyboard can open
    focusDraft.current = !isStacked();
    changeDraft(newNote(0));
  }, [stacked]);
  useLayoutEffect(() => {
    if (!focusDraft.current || !draft) return;
    focusDraft.current = false;
    noteRefs.current.get(draft.id)?.focus({ preventScroll: true });
  }, [draft]);
  useEffect(() => {
    // encrypted archives get the blank page instead
    if (secure) return;
    if (!itemsRef.current.length && !initialNoteRequested.current) {
      initialNoteRequested.current = true;
      addNote();
    }
  }, []);
  // never lose writing: what's pending is saved when the page is hidden (switching apps, locking
  // the phone, closing the tab). Coming back after a while, to the top of the page, starts a fresh one.
  useEffect(() => {
    let hiddenAt = 0;
    function flush() {
      if (unsaved.current) saveRef.current(undefined, undefined, undefined, { quiet: true, keepalive: true });
    }
    function visibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        flush();
      } else if (hiddenAt && Date.now() - hiddenAt > NEW_PAGE_AFTER && secure && !draftRef.current && window.scrollY < 120) {
        changeDraft(newNote(0));
      }
    }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
  // N, anywhere outside a text field, starts a new page
  useEffect(() => {
    function key(event) {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable], dialog')) return;
      event.preventDefault();
      startWritingRef.current();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
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

  // Notes hug their text. On the desktop canvas of an encrypted archive, everything is measured and
  // pushApart makes room: a note's photos and videos stack beside it, and a note that outgrows its
  // space pushes what's below it down (legacy archives keep the server's fixed canvas).
  useLayoutEffect(() => {
    for (const node of noteRefs.current.values()) {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    }
    const canvasNode = canvasRef.current;
    if (!secure || isStacked() || dragging || !canvasNode) return;
    const scale = canvasSize.current.width / canvasNode.getBoundingClientRect().width;
    const heights = {};
    for (const node of canvasNode.querySelectorAll(':scope > [data-item]')) heights[node.dataset.item] = node.offsetHeight * scale;
    const next = pushApart(itemsRef.current, heights);
    if (next !== itemsRef.current) {
      replaceItems(next);
      scheduleSave();
    }
  }, [items, draft, dragging, layoutTick]);
  // measure again when something changes size by itself, like a photo that finishes loading
  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!canvasNode || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setLayoutTick(tick => tick + 1));
    for (const node of canvasNode.querySelectorAll(':scope > [data-item]')) observer.observe(node);
    return () => observer.disconnect();
  }, [items.length, draft]);

  function canvasPoint(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = canvasSize.current.width / rect.width;
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale - viewOffset.current };
  }

  function grow(nextItems) {
    const fitted = fittedCanvas(canvasSize.current, nextItems);
    if (fitted.height !== canvasSize.current.height) {
      canvasSize.current = fitted;
      setCanvas(fitted);
    }
    return fitted;
  }

  // where the next item goes: below everything else
  function nextFreeY() {
    return itemsRef.current.length ? Math.round(lowestBottom(itemsRef.current) + ITEM_GAP) : 62;
  }

  function replaceItems(updater) {
    if (Array.isArray(updater)) {
      if (secure) grow(updater);
      itemsRef.current = updater;
    }
    setItems(current => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      itemsRef.current = next;
      return next;
    });
  }

  // Saves go out one at a time: the server refuses a write based on an older revision, which two
  // overlapping saves would be. Quiet saves (while typing) don't flash "saving…"; a failed one
  // leaves the work marked unsaved, so the next save or leaving the page tries again.
  function save(nextItems = itemsRef.current, nextTitle = titleRef.current, nextSubtitle = subtitleRef.current, { quiet = false, keepalive = false } = {}) {
    clearTimeout(saveTimer.current);
    unsaved.current = false;
    if (!quiet) setStatus('saving…');
    const run = saveChain.current.then(async () => {
      if (secure) {
        await secure.save({ presentation: 'canvas', title: nextTitle, subtitle: nextSubtitle, canvas: grow(nextItems), items: nextItems }, { keepalive });
        return;
      }
      const body = JSON.stringify({ title: nextTitle, subtitle: nextSubtitle, items: nextItems });
      // a keepalive request outlives the page, but only up to 64KB
      const response = await fetch(`/api/archives/${archive.id}/layout`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: keepalive && body.length < 60_000 });
      if (!response.ok) throw new Error('save failed');
    }).then(
      () => setStatus(current => current === 'saving…' || current === 'couldn’t save' ? '' : current),
      () => {
        unsaved.current = true;
        setStatus('couldn’t save');
      },
    );
    saveChain.current = run;
    return run;
  }
  saveRef.current = save;

  // typing saves itself a second after the last keystroke
  function scheduleSave() {
    unsaved.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRef.current(undefined, undefined, undefined, { quiet: true }), 1000);
  }

  function changeDraft(next) {
    draftRef.current = next;
    setDraft(next);
  }

  // The first character turns the blank page into a note at the top. It keeps the page's key and
  // place in the column, so React keeps the same textarea: the keyboard and the caret stay put.
  function writeDraft(content) {
    const current = draftRef.current;
    if (!content.trim()) {
      changeDraft({ ...current, content });
      return;
    }
    const note = { ...newNote(0), id: current.id, content };
    lastNoteRef.current = note.id;
    changeDraft(null);
    replaceItems(insertAtTop(itemsRef.current, note));
    scheduleSave();
  }

  // "write" (or N): the blank page at the top, with the caret in it. On a phone the focus has to
  // happen inside the tap, or the keyboard stays down.
  function startWriting() {
    if (!secure) {
      addNote();
      return;
    }
    if (!draftRef.current) flushSync(() => changeDraft(newNote(0)));
    noteRefs.current.get(draftRef.current.id)?.focus();
  }
  startWritingRef.current = startWriting;

  // where a photo or video added on a phone goes: beside the note being written, after any
  // already there, so it reads right after that note
  function besideLastNote(width) {
    const note = itemsRef.current.find(item => item.id === lastNoteRef.current && item.type === 'note');
    return note ? nextBeside(itemsRef.current, note, width, canvasSize.current.width) : null;
  }

  async function addNote() {
    const count = itemsRef.current.filter(item => item.type === 'note').length;
    setStatus('adding note…');
    try {
      if (secure) {
        const item = newNote(0);
        const next = insertAtTop(itemsRef.current, item);
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

  async function uploadFiles(files, point, { attachedTo = null, alternate = false, placed = false, atTop = false } = {}) {
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
      const x = alternate ? (index % 2 ? 700 - point.x : point.x) : Math.max(0, Math.min(canvasSize.current.width - 280, point.x + index * 22));
      const y = secure ? Math.max(0, point.y + index * 22) : Math.max(0, Math.min(canvasSize.current.height - 80, point.y + index * 22));
      if (secure) {
        try {
          const fileName = await secure.upload(prepared.blob);
          // a note's photos stack beside it, each under the last
          const note = attachedTo && next.find(item => item.id === attachedTo);
          const spot = note ? nextBeside(next, note, 280, canvasSize.current.width) : { x, y };
          added = { id: randomToken(12), type: 'image', fileName, contentType: prepared.contentType, x: spot.x, y: spot.y, width: 280, alt: '', attachedTo, ...(placed ? { placed: true } : {}) };
          next = atTop ? insertAtTop(next, added) : [...next, added];
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
        const item = { id: randomToken(12), type: 'youtube', videoId, x: Math.max(0, 760 - (count % 4) * 24), y: nextFreeY(), width: 360 };
        // on a phone it goes with the note being written, or on top, like everything new
        const beside = isStacked() ? besideLastNote(item.width) : null;
        const next = beside ? [...itemsRef.current, { ...item, ...beside }] : isStacked() ? insertAtTop(itemsRef.current, item) : [...itemsRef.current, item];
        replaceItems(next);
        await save(next);
        setYoutubeUrl('');
        setStatus('');
        return true;
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
      return true;
    } catch (error) {
      setStatus(error.message || 'couldn’t add video');
      return false;
    }
  }

  function dropOnCanvas(event) {
    event.preventDefault();
    uploadFiles(event.dataTransfer.files, canvasPoint(event.clientX, event.clientY), { placed: true });
  }

  function choosePhotos(event) {
    const files = [...event.target.files];
    event.target.value = '';
    const count = itemsRef.current.filter(item => item.type === 'image').length;
    if (isStacked() && secure) {
      // phone: a photo goes with the note being written; with nothing written yet, on top
      const beside = besideLastNote(280);
      if (beside) uploadFiles(files, beside, { attachedTo: beside.attachedTo });
      else uploadFiles(files, { x: count % 2 ? 80 : 620, y: 0 }, { atTop: true });
      return;
    }
    if (isStacked()) {
      // legacy archive on a phone: the photo goes after everything else, alternating sides
      uploadFiles(files, { x: count % 2 ? 80 : 620, y: Math.min(canvasSize.current.height - 80, itemsRef.current.reduce((max, item) => Math.max(max, item.y), 0) + 40) }, { alternate: true });
      return;
    }
    uploadFiles(files, { x: 820 - (count % 4) * 28, y: 80 + (count % 6) * 42 });
  }

  function dropOnNote(event, note) {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    uploadFiles(event.dataTransfer.files, {
      x: Math.min(canvasSize.current.width - 280, note.x + note.width + 28),
      y: note.y,
    }, { attachedTo: note.id });
  }

  function beginMove(event, item) {
    // stacked phone layout has no positions to drag; let the finger scroll the page
    if (isStacked()) return;
    event.preventDefault();
    const point = canvasPoint(event.clientX, event.clientY);
    // a photo or video put somewhere by hand stays there, even over a note's text (see pushApart)
    if (item.type !== 'note' && !item.placed) replaceItems(itemsRef.current.map(candidate => candidate.id === item.id ? { ...candidate, placed: true } : candidate));
    setDragging({ id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y });
  }

  useEffect(() => {
    if (!dragging) return;
    function move(event) {
      const point = canvasPoint(event.clientX, event.clientY);
      replaceItems(current => {
        const moved = current.find(item => item.id === dragging.id);
        if (!moved) return current;
        const x = Math.max(0, Math.min(canvasSize.current.width - moved.width, point.x - dragging.offsetX));
        const y = Math.max(0, Math.min(canvasSize.current.height - 40, point.y - dragging.offsetY));
        const dx = x - moved.x;
        const dy = y - moved.y;
        return current.map(item => {
          if (item.id === moved.id) return { ...item, x, y };
          if (moved.type === 'note' && item.attachedTo === moved.id) return {
            ...item,
            x: Math.max(0, Math.min(canvasSize.current.width - item.width, item.x + dx)),
            y: Math.max(0, Math.min(canvasSize.current.height - 40, item.y + dy)),
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
    replaceItems(itemsRef.current.map(item => item.id === id ? { ...item, content } : item));
    scheduleSave();
  }

  function editSubtitle() {
    menuRef.current?.close();
    flushSync(() => setShowSubtitle(true));
    subtitleField.current?.focus();
  }

  // legacy archives have a recovery link that opens the editor by itself; an encrypted archive's
  // editor link asks for the recovery key on any browser that doesn't hold the archive's key
  async function copyEditorLink() {
    try {
      await navigator.clipboard.writeText(recoveryUrl || `${window.location.origin}/portal/${archive.id}`);
      setStatus(secure ? 'editor link copied. other browsers will ask for your recovery key.' : 'editor link copied');
    } catch {
      setStatus('couldn’t copy the editor link');
    }
  }

  const order = readingOrder(items);
  // Phone: the column is in reading order in the DOM itself, so dnd-kit can reorder it, and the
  // blank page comes first. Desktop: positions place everything, and the blank page comes last in
  // the DOM, where its note lands in the items (insertAtTop appends), so it stays the same textarea.
  const sorted = stacked ? [...items].sort((a, b) => order[a.id] - order[b.id]) : items;
  const shown = !draft ? sorted : stacked ? [draft, ...sorted] : [...sorted, draft];
  // desktop: while the blank page is there, everything else is drawn DRAFT_SPACE lower
  const drawOffset = draft && !stacked ? DRAFT_SPACE : 0;
  viewOffset.current = drawOffset;
  const view = { canvas: { width: canvas.width, height: canvas.height + drawOffset } };
  const draftTop = Math.max(0, Math.min(62, ...items.map(item => item.y)));
  const place = item => itemStyle(item === draft ? { ...item, y: draftTop } : { ...item, y: item.y + drawOffset }, view);

  function reorder(event) {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!isSortable(source)) return;
    const offset = draftRef.current ? 1 : 0;
    const from = source.sortable.initialIndex - offset;
    const to = Math.max(0, source.sortable.index - offset);
    if (from < 0 || from === to) return;
    const next = moveInReadingOrder(itemsRef.current, from, to);
    replaceItems(next);
    save(next);
  }

  return <>
    <header className={`editor-bar${showSubtitle ? ' show-subtitle' : ''}`}>
      <div>
        <textarea className="editor-title" rows={1} value={title} maxLength={80} aria-label="archive name" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} onChange={event => { titleRef.current = event.target.value; setTitle(event.target.value); scheduleSave(); }} onBlur={() => { if (unsaved.current) save(); }} />
        <textarea ref={subtitleField} className="editor-subtitle" value={subtitle} maxLength={400} aria-label="archive subtitle" placeholder="subtitle" onChange={event => { subtitleRef.current = event.target.value; setSubtitle(event.target.value); scheduleSave(); }} onBlur={() => { if (unsaved.current) save(); }} />
      </div>
      <div className="editor-actions">
        <div className="editor-create-actions">
          <button type="button" onClick={startWriting} title="new page (N)">write</button>
          <label className="editor-upload">+ photo<input type="file" accept={IMAGE_TYPES} multiple onChange={choosePhotos} /></label>
          <details className="editor-video-add">
            <summary>+ video</summary>
            <form className="youtube-add-form" onSubmit={addYoutube}>
              <input type="url" value={youtubeUrl} onChange={event => setYoutubeUrl(event.target.value)} placeholder="youtube url" aria-label="YouTube link" />
              <button type="submit">add</button>
            </form>
          </details>
        </div>
        <div className="editor-link-actions">
          <button type="button" onClick={copyEditorLink}>copy editor link</button>
          <a href={shareUrl} target="_blank" rel="noreferrer">view link ↗</a>
        </div>
        {status && <span className="editor-status" role="status">{status}</span>}
      </div>
    </header>
    <div ref={canvasRef} className={`archive-canvas editor-canvas${dragging ? ' is-dragging' : ''}`} style={{ aspectRatio: `${view.canvas.width} / ${view.canvas.height}` }} onDragOver={event => event.preventDefault()} onDrop={dropOnCanvas}>
      <DragDropProvider onDragEnd={reorder}>
        {shown.map((item, index) => { const isDraft = item === draft; return <Sortable key={item.id} id={item.id} index={index} disabled={!stacked || !secure || isDraft}>{(ref, handleRef) => item.type === 'note' ? <article
          ref={ref}
          className={`canvas-note canvas-entry${isDraft ? ' is-draft' : ''}${dropTarget === item.id ? ' is-drop-target' : ''}`}
          style={place(item)} data-item={item.id}
          {...(isDraft ? {} : {
            onDragEnter: event => { event.preventDefault(); setDropTarget(item.id); },
            onDragOver: event => event.preventDefault(),
            onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); },
            onDrop: event => dropOnNote(event, item),
          })}
        >
          <div ref={handleRef} className="note-meta" onPointerDown={event => { if (!isDraft) beginMove(event, item); }}>
            <time dateTime={`${item.date}T${item.time}+07:00`}>{dateLabel(item.date)}</time>
            {item.time && <span>{timeLabel(item.time)}</span>}
          </div>
          <div className="note-writing">
            <textarea ref={node => { if (node) noteRefs.current.set(item.id, node); else noteRefs.current.delete(item.id); }} className="note-editor" rows={1} value={item.content} maxLength={10000} aria-label={isDraft ? 'new entry' : `text dump from ${dateLabel(item.date)}`} placeholder="type it here. leave it rough." onChange={event => isDraft ? writeDraft(event.target.value) : editNote(item.id, event.target.value)} onFocus={() => { lastNoteRef.current = isDraft ? null : item.id; }} onBlur={() => { if (unsaved.current) save(); }} />
          </div>
        </article> : item.type === 'youtube' ? <div ref={ref} className={`canvas-item youtube-sticky side-${sideOf(item, canvas)}`} style={place(item)} data-item={item.id} onPointerDown={event => beginMove(event, item)}>
          <div className="youtube-frame youtube-placeholder" aria-label="YouTube video preview">
            {item.thumbnailFileName && !secure && <img className="youtube-thumbnail" src={imageUrl(archive.id, item.thumbnailFileName)} alt="" draggable="false" />}
            {secure && <img className="youtube-thumbnail" src={`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`} alt="" draggable="false" referrerPolicy="no-referrer" />}
            <span className="youtube-play" aria-hidden="true">▶</span>
          </div>
          <div className="youtube-card-label"><span>{item.title || 'youtube'}</span></div>
        </div> : <div ref={ref} className={`canvas-item sticky-photo side-${sideOf(item, canvas)}`} style={place(item)} data-item={item.id} onPointerDown={event => beginMove(event, item)}>
          {secure ? <EncryptedImage archiveId={archive.id} fileName={item.fileName} dataKey={secure.dataKey} contentType={item.contentType} alt={item.alt || ''} draggable="false" /> : <img src={imageUrl(archive.id, item.fileName)} alt={item.alt || ''} draggable="false" />}
        </div>}</Sortable>; })}
      </DragDropProvider>
    </div>
    {/* phone: everything but writing lives in one bar at the bottom, in reach of the thumb */}
    <nav className="mobile-bar" aria-label="editor">
      <button type="button" onClick={startWriting}>write</button>
      <label className="mobile-photo">photo<input type="file" accept={IMAGE_TYPES} multiple onChange={choosePhotos} /></label>
      <button type="button" onClick={() => menuRef.current?.showModal()}>more</button>
      {status && <span className="mobile-status" role="status">{status}</span>}
    </nav>
    <dialog ref={menuRef} className="mobile-sheet" aria-label="more" onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="mobile-sheet-body">
        <form className="sheet-video" onSubmit={async event => { if (await addYoutube(event)) menuRef.current?.close(); }}>
          <input type="url" value={youtubeUrl} onChange={event => setYoutubeUrl(event.target.value)} placeholder="paste a youtube link" aria-label="YouTube link" />
          <button type="submit">add video</button>
        </form>
        <button type="button" onClick={copyEditorLink}>copy editor link</button>
        <a href={shareUrl} target="_blank" rel="noreferrer">view link ↗</a>
        <button type="button" onClick={editSubtitle}>{subtitle ? 'edit subtitle' : 'add a subtitle'}</button>
        {status && <p className="sheet-status" role="status">{status}</p>}
        <button type="button" className="sheet-close" onClick={() => menuRef.current?.close()}>close</button>
      </div>
    </dialog>
  </>;
}
