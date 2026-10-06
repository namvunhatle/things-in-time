import { randomToken } from './archive-crypto';

// Canvas units are desktop pixels: the canvas is 1200 wide, a note 728 wide with a 576px text
// column at 21px/1.65 serif. Heights are estimated, not measured, so a layout can be computed
// before anything renders (and in the stacked phone view, where nothing is at its desktop size).
const CHARS_PER_LINE = 58;
const LINE = 35;
const PARAGRAPH_GAP = 24;
export const ITEM_GAP = 96;
export const NOTE_X = 0;
export const NOTE_WIDTH = 728;
const MIN_CANVAS_HEIGHT = 900;
const BOTTOM_ROOM = 320;

export function estimateHeight(item) {
  if (item.type === 'image') return item.width * 1.3;
  if (item.type === 'youtube') return item.width * 0.5625 + 48;
  const paragraphs = String(item.content || '').split(/\n{2,}/);
  const lines = paragraphs.reduce((sum, paragraph) => sum + paragraph.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0), 0);
  // the editor's textarea is at least 190px tall
  return Math.max(190, lines * LINE + (paragraphs.length - 1) * PARAGRAPH_GAP) + 16;
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
