// Small shared building blocks for the screens: escaping, icons, player chips, steppers.

export const MATS = ['wood', 'stone', 'sandbag'];
export const MAT_LABEL = { wood: 'Wood', stone: 'Stone', sandbag: 'Sandbag' };

export const BIOME = {
  forest: { label: 'Forest', glyph: '🌲', color: '#5c9a4a', res: 'wood' },
  quarry: { label: 'Quarry', glyph: '⛰️', color: '#a3a8ae', res: 'stone' },
  riverbank: { label: 'Riverbank', glyph: '🌊', color: '#79b4d4', res: 'sandbag' },
  mixed: { label: 'Mixed', glyph: '✳️', color: '#b9a2db', res: null },
};

// Okabe–Ito colour-blind-safe palette, plus a pattern and a label for each seat.
export const PLAYER_STYLE = [
  { color: '#0072B2', ink: '#fff', label: 'P1' },
  { color: '#E69F00', ink: '#000', label: 'P2' },
  { color: '#009E73', ink: '#fff', label: 'P3' },
  { color: '#CC79A7', ink: '#000', label: 'P4' },
  { color: '#F0E442', ink: '#000', label: 'P5' },
];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Small square showing a player's colour + pattern. */
export function swatch(seat, size = 18) {
  const st = PLAYER_STYLE[seat] || PLAYER_STYLE[0];
  return `<svg class="swatch" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" rx="5" fill="${st.color}"/><rect width="20" height="20" rx="5" fill="url(#pat-${seat})"/><rect x=".5" y=".5" width="19" height="19" rx="4.5" fill="none" stroke="rgba(0,0,0,.35)"/></svg>`;
}

/** "▣ P2 Ben" */
export function chip(seat, name) {
  const st = PLAYER_STYLE[seat] || PLAYER_STYLE[0];
  return `<span class="chip">${swatch(seat)}<b class="plabel">${st.label}</b> ${esc(name)}</span>`;
}

export function matIcon(m, size = 22) {
  const svgs = {
    wood: `<rect x="2" y="7" width="20" height="10" rx="5" fill="#8B5A2B"/><ellipse cx="18.5" cy="12" rx="3.2" ry="5" fill="#E2B07A"/><ellipse cx="18.5" cy="12" rx="1.4" ry="2.4" fill="none" stroke="#8B5A2B" stroke-width="1"/>`,
    stone: `<polygon points="3,16 6.5,7 14.5,4.5 20.5,10.5 19,18.5 9,20.5" fill="#8E949C" stroke="#555b63" stroke-width="1.2"/><path d="M7 11 L12 9" stroke="#c3c8ce" stroke-width="1.4"/>`,
    sandbag: `<path d="M4 9 Q12 4.5 20 9 L21 17 Q12 21.5 3 17 Z" fill="#D8C08A" stroke="#8f7a45" stroke-width="1.2"/><path d="M12 6.5 V19" stroke="#8f7a45" stroke-width="1.2" stroke-dasharray="2 1.5"/>`,
  };
  return `<svg class="mat-icon" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${MAT_LABEL[m]}">${svgs[m]}</svg>`;
}

/** Inline list like "🪵2 🪨1" using icons. */
export function bagInline(bag, { showZero = false } = {}) {
  if (!bag) return '<span class="muted">hidden</span>';
  const parts = MATS.filter((m) => showZero || bag[m] > 0).map((m) => `<span class="mat">${matIcon(m, 18)}<b>${bag[m]}</b></span>`);
  return parts.length ? parts.join(' ') : '<span class="muted">nothing</span>';
}

export function bagText(bag) {
  const parts = MATS.filter((m) => bag[m] > 0).map((m) => `${bag[m]} ${m === 'sandbag' && bag[m] !== 1 ? 'sandbags' : m}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function bagTotal(bag) {
  return bag ? bag.wood + bag.stone + bag.sandbag : 0;
}

/** A − / value / + control. `path` is where app.js stores the value. */
export function stepper(path, value, { min = 0, max = 99, label = '' } = {}) {
  return `<span class="stepper" role="group" aria-label="${esc(label)}">
    <button type="button" class="step" data-act="step" data-path="${path}" data-d="-1" data-min="${min}" data-max="${max}" ${value <= min ? 'disabled' : ''} aria-label="less">−</button>
    <output>${value}</output>
    <button type="button" class="step" data-act="step" data-path="${path}" data-d="1" data-min="${min}" data-max="${max}" ${value >= max ? 'disabled' : ''} aria-label="more">+</button>
  </span>`;
}

/** Three steppers, one per material. maxBag limits each (e.g. what you own). */
export function bagEditor(path, bag, maxBag = null, maxEach = 99) {
  return `<div class="bag-editor">${MATS.map(
    (m) => `<div class="bag-row">${matIcon(m)}<span class="bag-name">${MAT_LABEL[m]}</span>${stepper(`${path}.${m}`, bag[m] || 0, {
      max: maxBag ? maxBag[m] : maxEach,
      label: MAT_LABEL[m],
    })}</div>`,
  ).join('')}</div>`;
}

export const PHASE_LABEL = {
  talk: 'Talk & build',
  choose: 'Choose secretly',
  loot: 'Resolve raids',
  raids: 'Resolve raids',
  trade: 'Trade & build',
  ended: 'Game over',
};

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
