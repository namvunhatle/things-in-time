// Motion for the editor, on the Web Animations API: transform and opacity only, a spring curve
// where the browser has linear() easing, and nothing at all for anyone who asked for less motion.
const SPRING = 'linear(0, 0.157, 0.438, 0.66, 0.808, 0.897, 0.948, 0.976, 0.99, 0.997, 1)';
let easing = '';

function spring() {
  if (!easing) easing = globalThis.CSS?.supports?.('transition-timing-function', SPRING) ? SPRING : 'cubic-bezier(.2, .8, .2, 1)';
  return easing;
}

export function reducedMotion() {
  return typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function itemNodes(container) {
  // skip what dnd-kit is carrying and the placeholder it leaves behind
  return container ? [...container.querySelectorAll(':scope > [data-item]:not([data-dnd-dragging]):not([data-dnd-placeholder])')] : [];
}

// Where each item sits in the canvas. Layout offsets, not bounding boxes: they ignore transforms,
// so an item that is still gliding is measured where it is going, not where it is drawn.
export function measure(container) {
  return new Map(itemNodes(container).map(node => [node.dataset.item, { left: node.offsetLeft, top: node.offsetTop }]));
}

// FLIP: whatever moved since `before` glides there from where it was; ids in `enter` fade in.
export function glide(container, before, enter = []) {
  if (reducedMotion()) return;
  for (const node of itemNodes(container)) {
    const was = before.get(node.dataset.item);
    const base = getComputedStyle(node).transform;
    const rest = base === 'none' ? '' : base;
    if (!was) {
      if (enter.includes(node.dataset.item)) node.animate([{ opacity: 0, transform: `translateY(-12px) ${rest}` }, { opacity: 1, transform: rest || 'none' }], { duration: 420, easing: spring() });
      continue;
    }
    const dx = was.left - node.offsetLeft;
    const dy = was.top - node.offsetTop;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    node.animate([{ transform: `translate(${dx}px, ${dy}px) ${rest}` }, { transform: rest || 'none' }], { duration: 380, easing: spring() });
  }
}
