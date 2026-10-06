import { randomToken } from './archive-crypto';
import { readingOrder } from './canvas-order';

// Canvas units are desktop pixels: the canvas is 1200 wide, a note 728 wide with a 576px text
// column at 21px/1.65 serif. Heights are estimated, not measured, so a layout can be computed
// before anything renders (and in the stacked phone view, where nothing is at its desktop size).
const CHARS_PER_LINE = 58;
const LINE = 35;
const PARAGRAPH_GAP = 24;
export const ITEM_GAP = 96;
// between a note's photos and videos, stacked beside it
const STACK_GAP = 24;
export const NOTE_X = 0;
export const NOTE_WIDTH = 728;
const MIN_CANVAS_HEIGHT = 900;
const BOTTOM_ROOM = 320;

export function estimateHeight(item) {
  if (item.type === 'image') return item.width * 1.3;
  if (item.type === 'youtube') return item.width * 0.5625 + 48;
  const paragraphs = String(item.content || '').split(/\n{2,}/);
  const lines = paragraphs.reduce((sum, paragraph) => sum + paragraph.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0), 0);
  // a note is as tall as its text: an empty one is a line
  return Math.max(LINE, lines * LINE + (paragraphs.length - 1) * PARAGRAPH_GAP) + 16;
}

export function lowestBottom(items) {
  return items.reduce((max, item) => Math.max(max, item.y + estimateHeight(item)), 0);
}

// Grows (never shrinks) the canvas so everything fits with room below for the next item.
export function fittedCanvas(canvas, items) {
  return { ...canvas, height: Math.max(canvas.height, MIN_CANVAS_HEIGHT, Math.ceil(lowestBottom(items) + BOTTOM_ROOM)) };
}

function youtubeId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return parsed.pathname.slice(1, 12);
    if (host === 'youtube.com') return parsed.searchParams.get('v') || (parsed.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/) || [])[1] || '';
  } catch {}
  return '';
}

function sortKey(entry) {
  return `${entry.date || ''}T${entry.time || '99:99'}`;
}

// The first archive was a timeline (titled entries, categories, songs) edited with a form. This
// lays its entries out as canvas notes, newest at the top like the timeline read. Titles and songs
// become the first lines of the note; a YouTube song link also becomes a video card beside it.
// The original entries are kept in the (encrypted) document as legacyTimeline, so nothing is lost.
export function timelineToCanvas(document) {
  const entries = [...(document.entries || [])]
    .filter(entry => !entry.draft)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const items = [];
  let y = 62;
  for (const entry of entries) {
    const heading = entry.song
      ? [`♪ ${entry.song.title}${entry.song.artist ? ` — ${entry.song.artist}` : ''}`, entry.song.url && !youtubeId(entry.song.url) ? entry.song.url : ''].filter(Boolean).join('\n')
      : (entry.title || '').trim();
    const content = [heading, String(entry.content || '').trim()].filter(Boolean).join('\n\n');
    const note = { id: randomToken(12), type: 'note', date: entry.date, time: entry.time || '', content, x: NOTE_X, y, width: NOTE_WIDTH };
    items.push(note);
    const videoId = entry.song?.url ? youtubeId(entry.song.url) : '';
    if (/^[\w-]{11}$/.test(videoId)) items.push({ id: randomToken(12), type: 'youtube', videoId, title: `${entry.song.title} — ${entry.song.artist}`, x: 800, y: y + 8, width: 360 });
    y += estimateHeight(note) + ITEM_GAP;
  }
  const canvas = fittedCanvas({ width: 1200, height: MIN_CANVAS_HEIGHT }, items);
  return {
    presentation: 'canvas',
    title: document.title,
    subtitle: document.subtitle || '',
    canvas,
    items,
    legacyTimeline: { entries: document.entries || [], convertedAt: new Date().toISOString() },
  };
}

const MIN_GAP = 48;
const overlapsX = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x;

// Notes hug their text, so one can end up taller than the space left below it. Given the real
// heights (estimates for anything not measured), this
//  1. lines up a note's own photos and videos beside it, one under another, where they overlap;
//  2. pushes down what a note, with those photos and videos, now covers, and everything under it.
// It never pulls anything up. A photo or video someone dragged into place (placed: true) may sit
// over a note's text or a pile on purpose: it is never what gets pushed, though it still moves
// along when the content above it does.
export function pushApart(items, heights = {}) {
  const height = item => heights[item.id] ?? estimateHeight(item);
  let next = items;
  for (const note of items.filter(item => item.type === 'note')) {
    const kids = next.filter(item => item.attachedTo === note.id && !item.placed).sort((a, b) => a.y - b.y);
    const settled = [];
    const moves = new Map();
    for (const kid of kids) {
      const y = settled.filter(other => overlapsX(other, kid)).reduce((lowest, other) => Math.max(lowest, Math.ceil(other.y + height(other) + STACK_GAP)), kid.y);
      if (y !== kid.y) moves.set(kid.id, y);
      settled.push({ ...kid, y });
    }
    if (moves.size) next = next.map(item => moves.has(item.id) ? { ...item, y: moves.get(item.id) } : item);
  }
  const notes = next.filter(item => item.type === 'note').sort((a, b) => a.y - b.y);
  for (const { id } of notes) {
    const note = next.find(item => item.id === id);
    const kids = next.filter(item => item.attachedTo === id && !item.placed);
    const bottom = Math.max(note.y + height(note), ...kids.map(kid => kid.y + height(kid)));
    const blockers = next.filter(item => (item.type === 'note' || !item.placed) && item.id !== id && item.attachedTo !== id && item.y > note.y && item.y < bottom + MIN_GAP && overlapsX(item, note));
    if (!blockers.length) continue;
    const from = Math.min(...blockers.map(item => item.y));
    const delta = Math.ceil(bottom + MIN_GAP - from);
    // everything from there down moves, except this note's own photos and videos
    const moved = new Set(next.filter(item => item.y >= from && item.attachedTo !== id).map(item => item.id));
    next = next.map(item => moved.has(item.id) || moved.has(item.attachedTo) ? { ...item, y: item.y + delta } : item);
  }
  return next;
}

// Where a new photo or video for a note goes: beside it, under any it already has.
export function nextBeside(items, note, width, canvasWidth = 1200) {
  const kids = items.filter(item => item.attachedTo === note.id);
  const y = kids.length ? Math.max(...kids.map(kid => kid.y + estimateHeight(kid))) + STACK_GAP : note.y;
  return { attachedTo: note.id, x: Math.min(canvasWidth - width, note.x + note.width + 28), y: Math.round(y) };
}

// On a phone the canvas is one column, and dragging reorders it. This turns "move the item at
// reading position `from` to `to`" into canvas positions that read in that order, so the desktop
// canvas follows: a note moves within the column of notes (closing the gap it leaves, opening
// one where it lands); a photo or video lands beside the note above it, attached to it.
export function moveInReadingOrder(items, from, to) {
  const rank = readingOrder(items);
  const list = [...items].sort((a, b) => rank[a.id] - rank[b.id]);
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  const at = list.indexOf(moved);
  const byId = new Map(items.map(item => [item.id, item]));
  const anchor = item => (item.attachedTo && byId.get(item.attachedTo)) || item;

  if (moved.type === 'note') {
    const kids = new Set(items.filter(item => item.attachedTo === moved.id).map(item => item.id));
    const own = item => item.id === moved.id || kids.has(item.id);
    const space = estimateHeight(moved) + ITEM_GAP;
    // close the gap it leaves
    let next = items.map(item => !own(item) && item.y > moved.y ? { ...item, y: Math.max(0, item.y - space) } : item);
    // the first item after it in the new order that doesn't belong to something above it
    const before = new Set(list.slice(0, at).map(item => anchor(item).id));
    const after = list.slice(at + 1).find(item => !own(item) && !before.has(anchor(item).id));
    const current = id => next.find(item => item.id === id);
    const y = after ? current(anchor(after).id).y : Math.round(lowestBottom(next.filter(item => !own(item))) + ITEM_GAP);
    // open one where it lands
    next = next.map(item => !own(item) && item.y >= y ? { ...item, y: item.y + space } : item);
    const delta = y - moved.y;
    return next.map(item => own(item) ? { ...item, ...(item.id === moved.id ? { x: NOTE_X } : {}), y: Math.max(0, item.y + delta) } : item);
  }

  const above = at > 0 ? anchor(list[at - 1]) : null;
  if (above?.type === 'note') {
    // attached items read right after their note, in y order: stack them in the new order
    const group = list.filter(item => item.attachedTo === above.id || item === moved);
    const x = Math.min(1200 - moved.width, above.x + above.width + 28);
    const ys = new Map();
    let y = above.y;
    for (const item of group) {
      ys.set(item.id, Math.round(y));
      y += estimateHeight(item) + STACK_GAP;
    }
    return items.map(item => {
      if (!ys.has(item.id)) return item;
      return item === moved ? { ...item, attachedTo: above.id, placed: false, x, y: ys.get(item.id) } : { ...item, y: ys.get(item.id) };
    });
  }
  // above is a loose photo or video, or nothing: sit just under it, or just above whatever follows
  const below = list.slice(at + 1).map(anchor).find(Boolean);
  const y = above ? above.y + 1 : Math.max(0, (below ? below.y : 62) - 1);
  return items.map(item => item === moved ? { ...item, attachedTo: null, placed: false, y } : item);
}

// Newest first: a new item goes at the top of the canvas and everything else moves down to make room.
export function insertAtTop(items, item) {
  const top = Math.min(62, ...items.map(other => other.y));
  const space = estimateHeight(item) + ITEM_GAP;
  return [...items.map(other => ({ ...other, y: other.y + space })), { ...item, y: Math.max(0, top) }];
}
