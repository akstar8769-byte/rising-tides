// Small shared building blocks for the screens: escaping, icons, player chips, steppers.

export const MATS = ['wood', 'stone', 'sandbag'];
export const MAT_LABEL = { wood: 'Wood', stone: 'Stone', sandbag: 'Sandbag' };

export const BIOME = {
  forest: { label: 'Forest', glyph: '🌲', color: '#5c9a4a', res: 'wood' },
  quarry: { label: 'Quarry', glyph: '⛰️', color: '#a3a8ae', res: 'stone' },
  riverbank: { label: 'Riverbank', glyph: '🌊', color: '#79b4d4', res: 'sandbag' },
  mixed: { label: 'Mixed', glyph: '✳️', color: '#b9a2db', res: null },
  sea: { label: 'Sea', glyph: '🌊', color: '#1f4e79', res: null, sea: true },
};

/** Battlefield terrain (War modes) — separate from the biome, which only sets what a tile makes. */
export const TERRAIN = {
  plains: { label: 'Plains', glyph: '🌾', note: 'open ground — tank country' },
  woods: { label: 'Woods', glyph: '🌳', note: 'woods round the objective — tanks bog down, infantry ambush' },
  hills: { label: 'Hills', glyph: '🏔', note: 'hills round the objective — slow for tanks, strong for defenders' },
  river: { label: 'River', glyph: '〰', note: 'a river across the field, two fords — hard to attack over' },
};

// Okabe–Ito colour-blind-safe palette, plus a pattern and a label for each seat.
export const PLAYER_STYLE = [
  { color: '#0072B2', ink: '#fff', label: 'P1' },
  { color: '#E69F00', ink: '#000', label: 'P2' },
  { color: '#009E73', ink: '#fff', label: 'P3' },
  { color: '#CC79A7', ink: '#000', label: 'P4' },
  { color: '#F0E442', ink: '#000', label: 'P5' },
];

const DEFAULT_STYLES = PLAYER_STYLE.map((x) => ({ ...x }));
const DEFAULT_LABELS = { wood: 'Wood', stone: 'Stone', sandbag: 'Sandbag' };
let SKIN = 'default';
/**
 * Grand campaigns: one colour and label per nation (many more than 5 seats), and the
 * materials become steel, oil and manpower. Called at the start of every game render.
 */
export function applyGameStyles(g) {
  const nations = g && g.scenario && g.scenario.kind === 'campaign' ? g.scenario.nations : null;
  PLAYER_STYLE.length = 0;
  if (nations) for (const n of nations) PLAYER_STYLE.push({ color: n.color, ink: n.ink, label: n.id });
  else for (const x of DEFAULT_STYLES) PLAYER_STYLE.push({ ...x });
  SKIN = nations ? 'europe' : 'default';
  Object.assign(MAT_LABEL, nations ? { wood: 'Steel', stone: 'Oil', sandbag: 'Manpower' } : DEFAULT_LABELS);
}
/** Game-log text in the current material names ("3 wood" → "3 steel" in a campaign). */
export function skinText(text) {
  if (SKIN !== 'europe') return text;
  return String(text).replace(/\bsandbags?\b/g, 'manpower').replace(/\bwood\b/g, 'steel').replace(/\bstone\b/g, 'oil');
}

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
  if (SKIN === 'europe') {
    const eu = {
      wood: `<rect x="3" y="8" width="18" height="9" rx="1.5" fill="#8f99a6" stroke="#4b535d" stroke-width="1.2"/><path d="M6 8 L8 5 H22 L20 8" fill="#b9c2cc" stroke="#4b535d" stroke-width="1.2"/>`,
      stone: `<path d="M12 3 C8 9 6 12 6 15 a6 6 0 0 0 12 0 C18 12 16 9 12 3 Z" fill="#1f1f1f" stroke="#000" stroke-width="1"/><ellipse cx="10" cy="14" rx="1.4" ry="2.4" fill="#777"/>`,
      sandbag: `<circle cx="12" cy="7" r="3.6" fill="#d9a066" stroke="#6b4a2b" stroke-width="1.1"/><path d="M5 21 C5 14 8 12 12 12 C16 12 19 14 19 21 Z" fill="#5b7a3a" stroke="#33461f" stroke-width="1.1"/>`,
    };
    return `<svg class="mat-icon" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${MAT_LABEL[m]}">${eu[m]}</svg>`;
  }
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
  battle: '⚔ Battles!',
  ended: 'Game over',
};

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
