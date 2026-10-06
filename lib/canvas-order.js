// On a phone the canvas is shown as one column. Items keep their desktop x/y; this only decides the
// order they are read in: top to bottom, then left to right, with photos dropped on a note right
// after that note.
export const STACKED_QUERY = '(max-width: 699px)';

export function isStacked() {
  return typeof window !== 'undefined' && window.matchMedia(STACKED_QUERY).matches;
}

export function readingOrder(items) {
  const byPosition = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.y - b.item.y || a.item.x - b.item.x || a.index - b.index);
  const notes = new Set(items.filter(item => item.type === 'note').map(item => item.id));
  const attached = new Map();
  for (const { item } of byPosition) {
    if (item.attachedTo && notes.has(item.attachedTo)) attached.set(item.attachedTo, [...(attached.get(item.attachedTo) || []), item]);
  }
  const order = {};
  let rank = 0;
  for (const { item } of byPosition) {
    if (item.attachedTo && notes.has(item.attachedTo)) continue;
    order[item.id] = rank++;
    for (const child of attached.get(item.id) || []) order[child.id] = rank++;
  }
  return order;
}

// which side a photo leans to in the column, from where it sits on the desktop canvas
export function sideOf(item, canvas) {
  return item.x + item.width / 2 > canvas.width / 2 ? 'right' : 'left';
}
