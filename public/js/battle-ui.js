// Total War battle screen: draw the battlefield, select your units, tap to move them.
// The server runs the battle; this file only shows it and sends orders.
//
// Drawing is split in layers so phones stay smooth:
//   terrain            drawn once per battle
//   territory + front  redrawn when the server sends an update (~5 times a second)
//   dots               animated every screen frame, sliding between server updates
import { esc, chip, PLAYER_STYLE } from './ui.js';
import { tileLabel } from './war-ui.js';

const TERRAIN_COLOR = { '.': '#dfe9c8', f: '#86b26c', h: '#cdb88c', w: '#79b6dc', '=': '#b6dbef' };
const TERRAIN_NAME = { f: 'forest', h: 'hill', w: 'river', '=': 'ford' };
const SHAPE = { militia: '●', infantry: '■', cavalry: '▲' };
const SNAP_MS = 200; // how often the server sends positions
const TCOLS = 30; // territory grid (2x2 squares on a 60x40 map)
const TROWS = 20;

// ---------------------------------------------------------------- data

/** The battle with the latest positions from the server merged in. */
export function liveBattle(store, id) {
  const g = store.data.game;
  const full = (g.battles || []).find((b) => b.id === id);
  if (!full) return null;
  const snap = (store.battleSnaps || {})[id];
  if (!snap) return { ...full, dots: full.dots.map((d) => ({ ...d, hpPct: Math.round((d.hp / d.max) * 100) })) };
  return {
    ...full,
    time: snap.time,
    capture: snap.capture,
    status: snap.status,
    winner: snap.winner,
    auto: snap.auto,
    terr: snap.terr,
    dots: snap.dots.map(([id2, side, type, x, y, hp, cut, tx, ty, unit]) => ({ id: id2, side, type, x, y, hpPct: hp, cut: !!cut, tx, ty, unit, seat: side === 'A' ? full.attacker : full.defender })),
  };
}

function pickBattle(store) {
  const g = store.data.game;
  const all = g.battles || [];
  const mine = all.filter((b) => b.attacker === g.you || b.defender === g.you);
  const want = all.find((b) => b.id === store.ui.watchBattle);
  return (want || mine.find((b) => b.status === 'live') || mine[0] || all[0] || null)?.id ?? null;
}

const fmt = (secs) => `${Math.floor(secs / 60)}:${String(Math.max(0, Math.floor(secs % 60))).padStart(2, '0')}`;

// ---------------------------------------------------------------- smooth movement
// When a snapshot arrives we remember where every dot is drawn right now (prev)
// and where the server says it is (cur), then slide from one to the other.
const anim = { battle: null, prev: new Map(), cur: new Map(), t0: 0 };

function drawnPos(id, now) {
  const c = anim.cur.get(id);
  if (!c) return null;
  const p = anim.prev.get(id) || c;
  const k = Math.min(1, (now - anim.t0) / SNAP_MS);
  return { x: p.x + (c.x - p.x) * k, y: p.y + (c.y - p.y) * k };
}

function takeSnapshot(b) {
  const now = performance.now();
  if (anim.battle !== b.id) {
    anim.battle = b.id;
    anim.prev = new Map();
    anim.cur = new Map();
  }
  const prev = new Map();
  for (const d of b.dots) prev.set(d.id, drawnPos(d.id, now) || { x: d.x, y: d.y });
  anim.prev = prev;
  anim.cur = new Map(b.dots.map((d) => [d.id, { x: d.x, y: d.y }]));
  anim.t0 = now;
}

// ---------------------------------------------------------------- drawing

function terrainLayer(b, W) {
  const cell = W / b.terrain[0].length;
  return b.terrain
    .map((row, y) => [...row].map((ch, x) => `<rect x="${x * cell}" y="${y * cell}" width="${cell + 0.05}" height="${cell + 0.05}" fill="${TERRAIN_COLOR[ch] || TERRAIN_COLOR['.']}"/>`).join(''))
    .join('');
}

/** Territory tint (runs of squares merged per row) and the frontline between the two sides. */
function territoryLayer(b) {
  const terr = b.terr || '';
  if (terr.length !== TCOLS * TROWS) return '';
  const aCol = PLAYER_STYLE[b.attacker].color;
  const dCol = PLAYER_STYLE[b.defender].color;
  const fill = { a: aCol, d: dCol, A: '#d7263d', D: '#d7263d' };
  const op = { a: 0.2, d: 0.2, A: 0.28, D: 0.28 };
  const parts = [];
  for (let y = 0; y < TROWS; y++) {
    let x = 0;
    while (x < TCOLS) {
      const ch = terr[y * TCOLS + x];
      let end = x + 1;
      while (end < TCOLS && terr[y * TCOLS + end] === ch) end++;
      if (ch !== '.') parts.push(`<rect x="${x * 2}" y="${y * 2}" width="${(end - x) * 2}" height="2" fill="${fill[ch]}" fill-opacity="${op[ch]}"/>`);
      x = end;
    }
  }
  // Frontline: wherever an attacker square touches a defender square
  const side = (ch) => (ch === 'a' || ch === 'A' ? 'A' : ch === 'd' || ch === 'D' ? 'D' : null);
  let path = '';
  for (let y = 0; y < TROWS; y++) {
    for (let x = 0; x < TCOLS; x++) {
      const s = side(terr[y * TCOLS + x]);
      if (!s) continue;
      const r = x + 1 < TCOLS ? side(terr[y * TCOLS + x + 1]) : null;
      const d = y + 1 < TROWS ? side(terr[(y + 1) * TCOLS + x]) : null;
      if (r && r !== s) path += `M${(x + 1) * 2} ${y * 2}V${(y + 1) * 2}`;
      if (d && d !== s) path += `M${x * 2} ${(y + 1) * 2}H${(x + 1) * 2}`;
    }
  }
  if (path) parts.push(`<path d="${path}" stroke="#1c2833" stroke-width=".45" stroke-linecap="round" fill="none"/>`);
  return parts.join('');
}

function objectiveLayer(b) {
  const o = b.obj;
  const circ = 2 * Math.PI * o.r;
  const prog = Math.min(1, (b.capture || 0) / b.captureNeeded);
  const aCol = PLAYER_STYLE[b.attacker].color;
  return `<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="rgba(255,255,255,.2)" stroke="#333" stroke-width=".25" stroke-dasharray="1 .8"/>
    <circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="none" stroke="${aCol}" stroke-width=".8" stroke-dasharray="${circ * prog} ${circ}" transform="rotate(-90 ${o.x} ${o.y})"/>
    <text x="${o.x}" y="${o.y + 1}" font-size="3" text-anchor="middle">⚑</text>`;
}

function dotsLayer(store, b, now) {
  const g = store.data.game;
  const mySide = b.attacker === g.you ? 'A' : b.defender === g.you ? 'D' : null;
  const sel = new Set(store.ui.battleSel || []);
  const parts = [];
  for (const d of b.dots) {
    const pos = (anim.battle === b.id && drawnPos(d.id, now)) || d;
    if (d.side === mySide && sel.has(d.id) && Math.hypot(d.tx - pos.x, d.ty - pos.y) > 0.6) {
      parts.push(`<line x1="${pos.x}" y1="${pos.y}" x2="${d.tx}" y2="${d.ty}" stroke="#111" stroke-width=".15" stroke-dasharray=".5 .5"/>`);
    }
  }
  for (const d of b.dots) {
    const { x, y } = (anim.battle === b.id && drawnPos(d.id, now)) || d;
    const st = PLAYER_STYLE[d.seat];
    const op = (0.35 + 0.65 * ((d.hpPct ?? 100) / 100)).toFixed(2);
    const selected = sel.has(d.id) && d.side === mySide;
    const stroke = selected ? '#fff' : d.cut ? '#d7263d' : '#111';
    const sw = selected ? 0.35 : d.cut ? 0.3 : 0.12;
    const dash = d.cut ? ' stroke-dasharray=".4 .25"' : '';
    let shape;
    if (d.type === 'infantry') shape = `<rect x="${(x - 0.6).toFixed(2)}" y="${(y - 0.6).toFixed(2)}" width="1.2" height="1.2" rx=".15"`;
    else if (d.type === 'cavalry') shape = `<polygon points="${x.toFixed(2)},${(y - 0.8).toFixed(2)} ${(x + 0.75).toFixed(2)},${(y + 0.55).toFixed(2)} ${(x - 0.75).toFixed(2)},${(y + 0.55).toFixed(2)}"`;
    else shape = `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".6"`;
    parts.push(`${shape} fill="${st.color}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
    if (d.side === mySide) parts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6" fill="transparent" data-dot="${d.id}"/>`);
  }
  return parts.join('');
}

/** The battlefield SVG for one battle (all layers). */
export function battleSvg(store, b) {
  const g = store.data.game;
  const W = g.tw.mapW;
  const H = g.tw.mapH;
  const aCol = PLAYER_STYLE[b.attacker].color;
  const dCol = PLAYER_STYLE[b.defender].color;
  return `<svg id="battle-svg" viewBox="0 0 ${W} ${H}" data-battle="${b.id}" role="img" aria-label="Battlefield">
    <g>${terrainLayer(b, W)}</g>
    <g id="bt-terr">${territoryLayer(b)}</g>
    <rect x="0" y="0" width="1" height="${H}" fill="${aCol}" opacity=".7"/><rect x="${W - 1}" y="0" width="1" height="${H}" fill="${dCol}" opacity=".7"/>
    <g id="bt-obj">${objectiveLayer(b)}</g>
    <g id="bt-dots">${dotsLayer(store, b, performance.now())}</g>
  </svg>`;
}

// ---------------------------------------------------------------- the panel

/** The whole battle card for the Play tab. */
export function battlePanel(store) {
  const g = store.data.game;
  const id = pickBattle(store);
  if (id == null) return '<div class="card phase-card"><h2>⚔ Battles</h2><p>Waiting for battles to start…</p></div>';
  const b = liveBattle(store, id);
  if (anim.battle !== b.id) takeSnapshot(b);
  const A = g.players[b.attacker];
  const D = g.players[b.defender];
  const mySide = b.attacker === g.you ? 'A' : b.defender === g.you ? 'D' : null;
  const others = (g.battles || []).filter((x) => x.id !== id);
  const units = (side, type) => {
    const set = new Set(b.dots.filter((d) => d.side === side && (!type || d.type === type)).map((d) => d.unit));
    return set.size;
  };
  const army = (side) => ['militia', 'infantry', 'cavalry'].map((t) => (units(side, t) ? `${SHAPE[t]}${units(side, t)}` : '')).filter(Boolean).join(' ') || 'none left';
  const auto = mySide && b.auto && b.auto[mySide];
  const done = b.status !== 'live';
  const terrainKinds = [...new Set(b.terrain.join(''))].filter((c) => TERRAIN_NAME[c]).map((c) => TERRAIN_NAME[c]);
  return `<div class="card phase-card battle-card">
    <h2>⚔ Battle for ${esc(tileLabel(g, b.tile))}</h2>
    <div class="battle-meta row wrap">
      <span>${chip(A.seat, A.name)} <small>attacking · <span class="army-A">${army('A')}</span></small></span>
      <span>vs</span>
      <span>${chip(D.seat, D.name)} <small>defending · <span class="army-D">${army('D')}</span></small></span>
    </div>
    <div class="battle-meta row wrap small">
      <span>⏱ <b class="battle-clock">${done ? 'over' : fmt(b.limit - b.time)}</b></span>
      <span>⚑ capture <b class="battle-capture">${Math.min(b.capture, b.captureNeeded).toFixed(1)}</b> / ${b.captureNeeded}s</span>
      ${terrainKinds.length ? `<span class="muted">terrain: ${terrainKinds.join(', ')}</span>` : ''}
      ${done ? `<span class="tag ${b.winner === mySide ? 'ok' : 'warn'}">${b.winner === 'A' ? esc(A.name) : esc(D.name)} won</span>` : ''}
    </div>
    ${others.length ? `<div class="row wrap">${others.map((x) => `<button class="btn small" data-act="watchBattle" data-id="${x.id}">Watch: ${esc(g.players[x.attacker].name)} vs ${esc(g.players[x.defender].name)}</button>`).join('')}</div>` : ''}
    <div id="battle-wrap">${battleSvg(store, b)}</div>
    ${
      mySide && !done
        ? `<div class="row wrap battle-controls">
        <button class="btn small" data-act="battleSelect" data-type="all">Select all</button>
        <button class="btn small" data-act="battleSelect" data-type="militia">● Militia</button>
        <button class="btn small" data-act="battleSelect" data-type="infantry">■ Infantry</button>
        <button class="btn small" data-act="battleSelect" data-type="cavalry">▲ Cavalry</button>
        <button class="btn small" data-act="battleSelect" data-type="none">Clear</button>
        <button class="btn small ${auto ? 'primary' : ''}" data-act="battleAuto" data-id="${b.id}" data-on="${auto ? 0 : 1}">${auto ? '🤖 Auto-battle ON' : '🤖 Auto-battle'}</button>
      </div>
      <p class="hint">Tap a unit (or a type button), then tap the map to send it. <b>${mySide === 'A' ? 'Hold the flag ⚑ with nobody defending it' : 'Keep attackers off the flag ⚑ until time runs out'}.</b> Ground you move through becomes yours (tinted); the dark line is the <b>frontline</b>. Your supply runs through your own ground back to your edge of the map — units cut off (red outline, red pocket) take heavy damage and surrender. Hit enemies from two sides for bonus damage. Cavalry struggles against infantry — until you encircle them.</p>`
        : `<p class="hint">You're watching. ● militia ■ infantry ▲ cavalry (each unit is a group of dots). Tinted ground = territory, dark line = frontline, red = cut off.</p>`
    }
  </div>`;
}

/** Called on every battle snapshot: update territory, front, flag and labels (dots animate on their own). */
export function refreshBattle(store) {
  const svg = document.getElementById('battle-svg');
  if (!svg) return;
  const b = liveBattle(store, Number(svg.dataset.battle));
  if (!b) return;
  takeSnapshot(b);
  const set = (sel, html) => {
    const el = svg.querySelector(sel);
    if (el) el.innerHTML = html;
  };
  set('#bt-terr', territoryLayer(b));
  set('#bt-obj', objectiveLayer(b));
  const clock = document.querySelector('.battle-clock');
  if (clock) clock.textContent = b.status === 'live' ? fmt(b.limit - b.time) : 'over';
  const cap = document.querySelector('.battle-capture');
  if (cap) cap.textContent = Math.min(b.capture, b.captureNeeded).toFixed(1);
  // Keep the Auto-battle button in step (the computer may take over an idle side).
  const g = store.data.game;
  const side = b.attacker === g.you ? 'A' : b.defender === g.you ? 'D' : null;
  const btn = document.querySelector('[data-act="battleAuto"]');
  if (btn && side && b.auto) {
    const on = !!b.auto[side];
    btn.textContent = on ? '🤖 Auto-battle ON' : '🤖 Auto-battle';
    btn.classList.toggle('primary', on);
    btn.dataset.on = on ? '0' : '1';
  }
}

/** Redraw just the dots, every screen frame, while a battlefield is on screen. */
let storeRef = null;
export function startBattleAnimation(store) {
  storeRef = store;
  const frame = () => {
    const svg = document.getElementById('battle-svg');
    const layer = svg && svg.querySelector('#bt-dots');
    if (layer && storeRef && storeRef.data && storeRef.data.game) {
      const b = liveBattle(storeRef, Number(svg.dataset.battle));
      if (b) layer.innerHTML = dotsLayer(storeRef, b, performance.now());
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Tapping a dot selects (or unselects) its whole unit. */
export function toggleUnit(store, dotId) {
  const svg = document.getElementById('battle-svg');
  const b = svg && liveBattle(store, Number(svg.dataset.battle));
  if (!b) return;
  const dot = b.dots.find((d) => d.id === dotId);
  if (!dot) return;
  const unitDots = b.dots.filter((d) => d.unit === dot.unit).map((d) => d.id);
  const sel = new Set(store.ui.battleSel);
  const on = !sel.has(dotId);
  for (const id of unitDots) on ? sel.add(id) : sel.delete(id);
  store.ui.battleSel = [...sel];
}

/** Turn a click on the battlefield into map coordinates. */
export function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : null;
}
