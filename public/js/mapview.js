// Zooming and scrolling the board, like a strategy map: mouse wheel or pinch to
// zoom, drag to pan, and + / − / ⟲ buttons. The view lives in store.ui.mapView
// ({ cx, cy, zoom }) so it survives redraws; while you drag or zoom we change the
// SVG's viewBox directly for smoothness.

export const MAX_ZOOM = 5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The viewBox [x, y, w, h] to show for the whole-board box and a view. */
export function viewBoxFor(box, view) {
  const [bx, by, bw, bh] = box;
  const z = clamp((view && view.zoom) || 1, 1, MAX_ZOOM);
  const w = bw / z;
  const h = bh / z;
  const cx = clamp(view && view.cx != null ? view.cx : bx + bw / 2, bx + w / 2, bx + bw - w / 2);
  const cy = clamp(view && view.cy != null ? view.cy : by + bh / 2, by + h / 2, by + bh - h / 2);
  return [cx - w / 2, cy - h / 2, w, h];
}

const boxOf = (svg) => (svg.dataset.box || '').split(' ').map(Number);
function apply(store, svg) {
  const vb = viewBoxFor(boxOf(svg), store.ui.mapView);
  svg.setAttribute('viewBox', vb.map((n) => n.toFixed(1)).join(' '));
}
/** What the map shows right now (read from the SVG, so default views count too). */
function current(store, svg) {
  const box = boxOf(svg);
  const v = svg.viewBox && svg.viewBox.baseVal;
  const vb = v && v.width ? [v.x, v.y, v.width, v.height] : viewBoxFor(box, store.ui.mapView);
  return { box, zoom: clamp(box[2] / vb[2], 1, MAX_ZOOM), cx: vb[0] + vb[2] / 2, cy: vb[1] + vb[3] / 2 };
}
/** Screen point -> board units. */
function toBoard(svg, x, y) {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(x, y).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** Zoom by `factor`, keeping the board point under (x, y) where it is. */
export function zoomAt(store, svg, factor, x, y) {
  const c = current(store, svg);
  const zoom = clamp(c.zoom * factor, 1, MAX_ZOOM);
  const p = x == null ? { x: c.cx, y: c.cy } : toBoard(svg, x, y) || { x: c.cx, y: c.cy };
  const k = c.zoom / zoom;
  store.ui.mapView = { zoom, cx: p.x + (c.cx - p.x) * k, cy: p.y + (c.cy - p.y) * k };
  // Clamp the centre into the board so the next drag starts from what you see.
  const vb = viewBoxFor(c.box, store.ui.mapView);
  store.ui.mapView.cx = vb[0] + vb[2] / 2;
  store.ui.mapView.cy = vb[1] + vb[3] / 2;
  apply(store, svg);
}

let dragMovedAt = 0;
/** True right after a drag, so the click that ends it doesn't open a tile menu. */
export const justDragged = () => performance.now() - dragMovedAt < 250;

export function installMapControls(store) {
  const pointers = new Map(); // pointerId -> {x, y}
  let start = null; // { cx, cy, x, y, dist, zoom, moved }
  const svgAt = (e) => e.target.closest && e.target.closest('.map svg.board');

  document.addEventListener(
    'wheel',
    (e) => {
      const svg = svgAt(e);
      if (!svg) return;
      e.preventDefault();
      zoomAt(store, svg, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), e.clientX, e.clientY);
    },
    { passive: false },
  );

  document.addEventListener('pointerdown', (e) => {
    const svg = svgAt(e);
    if (!svg || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = current(store, svg);
    const pts = [...pointers.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const m0 = svg.getScreenCTM();
    start = { svg, scale: m0 ? m0.a : 1, cx: c.cx, cy: c.cy, zoom: c.zoom, x: mid.x, y: mid.y, dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, moved: start ? start.moved : false };
  });

  document.addEventListener('pointermove', (e) => {
    if (!start || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = start.svg;
    if (!svg.isConnected) return;
    const pts = [...pointers.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dx = mid.x - start.x;
    const dy = mid.y - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 6 && pts.length < 2) return;
    start.moved = true;
    const scale = start.scale || 1; // screen pixels per board unit when the drag began
    let zoom = start.zoom;
    if (pts.length > 1 && start.dist) zoom = clamp(start.zoom * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / start.dist), 1, MAX_ZOOM);
    // Pixels -> board units at the zoom the drag started with.
    const unit = 1 / scale;
    store.ui.mapView = { zoom, cx: start.cx - dx * unit, cy: start.cy - dy * unit };
    apply(store, svg);
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (start && start.moved) dragMovedAt = performance.now();
    if (!pointers.size) {
      // Keep the clamped centre.
      if (start && start.svg.isConnected) {
        const c = current(store, start.svg);
        store.ui.mapView = { zoom: c.zoom, cx: c.cx, cy: c.cy };
      }
      start = null;
    } else if (start) {
      // One finger lifted from a pinch: carry on dragging from here.
      const c = current(store, start.svg);
      const p = [...pointers.values()][0];
      const m1 = start.svg.getScreenCTM();
      start = { ...start, scale: m1 ? m1.a : start.scale, cx: c.cx, cy: c.cy, zoom: c.zoom, x: p.x, y: p.y, dist: 0 };
    }
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}
