// Total War battle screen: draw the battlefield, select your units, tap to move them.
// The server runs the battle; this file only shows it and sends orders.
//
// Drawing is split in layers so phones stay smooth:
//   terrain            drawn once per battle
//   territory + front  redrawn when the server sends an update (~5 times a second)
//   dots               animated every screen frame, sliding between server updates
import { esc, chip, PLAYER_STYLE } from './ui.js';
import { tileLabel } from './war-ui.js';

const TERRAIN_COLOR = { '.': '#dfe9c8', f: '#86b26c', h: '#cdb88c', w: '#79b6dc', '=': '#b6dbef', o: '#3f7fae' };
const SKY = '#cfe3f3';
const TERRAIN_NAME = { f: 'forest', h: 'hill', w: 'river', '=': 'ford' };
const shapeOf = (g, t) => ((g.tw && g.tw.units.find((u) => u.type === t)) || { shape: '●' }).shape;
const nameOf = (g, t) => ((g.tw && g.tw.units.find((u) => u.type === t)) || { name: t }).name;
const KIND_TITLE = { land: '⚔ Battle for', air: '✈ Air battle over', sea: '⚓ Naval battle for' };
const SNAP_MS = 200; // how often the server sends positions
const TCOLS = 30; // territory grid (2x2 squares on a 60x40 map)
const TROWS = 20;

// ---------------------------------------------------------------- data

/** Battles waiting for you to finish this one (each player fights one at a time). */
function waitingLine(g) {
  const mine = (g.battleWaiting || []).filter((w) => w.attacker === g.you || w.defender === g.you);
  if (!mine.length) return '';
  const say = (w) => (w.attacker === g.you ? `you attack ${esc(w.name)}` : `${esc(g.players[w.attacker].name)} attacks ${esc(w.name)}`);
  return `<p class="small muted">⏳ Next up for you: ${mine.map(say).join(' · ')} (starts when this battle ends)</p>`;
}

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
    formation: snap.formation || full.formation,
    forms: snap.forms,
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
  if (b.kind === 'air') return `<rect x="0" y="0" width="${W}" height="40" fill="${SKY}"/>`;
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
  if (b.kind === 'air') return '';
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
    if (d.type === 'bomber' || d.type === 'interceptor') {
      // Aircraft fly above the battle: a shadow on the ground, the plane lifted and
      // turned towards where it is flying (otherwise towards the enemy's side).
      const moving = Math.hypot(d.tx - x, d.ty - y) > 0.4;
      const ang = moving ? (Math.atan2(d.ty - y, d.tx - x) * 180) / Math.PI : d.side === 'A' ? 0 : 180;
      const big = d.type === 'bomber' ? 1.5 : 1.15;
      parts.push(`<ellipse cx="${f2(x)}" cy="${f2(y + 0.2)}" rx="${f2(big * 0.8)}" ry="${f2(big * 0.35)}" fill="#000" fill-opacity=".22"/>`);
      parts.push(`<g transform="translate(${f2(x)} ${f2(y - AIR_LIFT)}) rotate(${ang.toFixed(0)}) scale(${big})">${dotShape(d.type, 0, 0)} fill="${st.color}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${f2(sw / big)}"${dash}/></g>`);
    } else {
      const shape = dotShape(d.type, x, y);
      parts.push(`${shape} fill="${st.color}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
    }
    const mark = dotMark(d.type, x, y);
    if (mark) parts.push(mark);
    if (d.side === mySide) parts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6" fill="transparent" data-dot="${d.id}"/>`);
  }
  parts.push(shellsLayer(b.id, now));
  return parts.join('');
}

// ---------------------------------------------------------------- gunfire
// The server sends the shells fired since its last update. Each one flies from the
// gun to its target and bursts there, so you can see who is shelling whom.
const shells = []; // { battle, x1, y1, x2, y2, k, t0, flight }

/** Called when battle positions arrive: queue the new shells for animation. */
export function addShells(snaps) {
  const now = performance.now();
  for (const s of snaps) {
    (s.shots || []).forEach(([x1, y1, x2, y2, k], i) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const flight = k === 'antiair' ? 160 : k === 'bomb' ? 520 : Math.min(700, 220 + len * 30);
      // Spread the shots of one update over its 200 ms so volleys ripple.
      shells.push({ battle: s.id, x1, y1, x2, y2, k, t0: now + ((i * 37) % SNAP_MS), flight });
    });
  }
  while (shells.length > 150) shells.shift();
}

const BURST_MS = 380;
const AIR_LIFT = 1.3; // aircraft are drawn this far above their spot on the ground

/** A bomb: falls from the plane to the target, shrinking as it drops, then a big double blast. */
function bombFrame(s, age) {
  if (age < s.flight) {
    const p = age / s.flight;
    const e = p * p; // speeds up as it falls
    const x = s.x1 + (s.x2 - s.x1) * e;
    const y = s.y1 - AIR_LIFT + (s.y2 - (s.y1 - AIR_LIFT)) * e;
    const r = 0.45 - 0.2 * p;
    return `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="${(r * 0.7).toFixed(2)}" ry="${r.toFixed(2)}" fill="#1b1b1b"/>`;
  }
  const p = (age - s.flight) / BURST_MS;
  const r1 = 1 + p * 3.4;
  const r2 = 0.5 + p * 2;
  return `<circle cx="${s.x2}" cy="${s.y2}" r="${r1.toFixed(2)}" fill="#5a4636" fill-opacity="${(0.45 * (1 - p)).toFixed(2)}"/><circle cx="${s.x2}" cy="${s.y2}" r="${r2.toFixed(2)}" fill="#ffb02e" fill-opacity="${(0.95 * (1 - p)).toFixed(2)}" stroke="#d6331f" stroke-opacity="${(1 - p).toFixed(2)}" stroke-width=".25"/>`;
}
function shellsLayer(battleId, now) {
  const out = [];
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    const age = now - s.t0;
    if (age > s.flight + BURST_MS) {
      shells.splice(i, 1);
      continue;
    }
    if (s.battle !== battleId || age < 0) continue;
    if (s.k === 'bomb') {
      out.push(bombFrame(s, age));
      continue;
    }
    if (age < s.flight) {
      // In flight: a dark shell with a short smoky trail (anti-air: a quick yellow tracer).
      const p = age / s.flight;
      const x = s.x1 + (s.x2 - s.x1) * p;
      const y = s.y1 + (s.y2 - s.y1) * p - (s.k === 'antiair' ? 0 : Math.sin(p * Math.PI) * Math.min(4, Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * 0.25));
      const q = Math.max(0, p - 0.15);
      const tx = s.x1 + (s.x2 - s.x1) * q;
      const ty = s.y1 + (s.y2 - s.y1) * q - (s.k === 'antiair' ? 0 : Math.sin(q * Math.PI) * Math.min(4, Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * 0.25));
      if (s.k === 'antiair') out.push(`<line x1="${tx.toFixed(2)}" y1="${ty.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#ffd84d" stroke-width=".3" stroke-linecap="round"/>`);
      else out.push(`<line x1="${tx.toFixed(2)}" y1="${ty.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#555" stroke-opacity=".5" stroke-width=".6" stroke-linecap="round"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".65" fill="#222"/>`);
    } else {
      // Impact: an orange burst that grows and fades.
      const p = (age - s.flight) / BURST_MS;
      const r = (s.k === 'antiair' ? 0.6 : 0.9) + p * (s.k === 'ship' ? 3 : 2.3);
      out.push(`<circle cx="${s.x2}" cy="${s.y2}" r="${r.toFixed(2)}" fill="#ff8a1f" fill-opacity="${(0.85 * (1 - p)).toFixed(2)}" stroke="#c0392b" stroke-opacity="${(1 - p).toFixed(2)}" stroke-width=".2"/>`);
    }
  }
  return `<g class="shells" pointer-events="none">${out.join('')}</g>`;
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

const f2 = (n) => n.toFixed(2);
const poly = (pts) => `<polygon points="${pts.map(([a, b]) => f2(a) + ',' + f2(b)).join(' ')}"`;
/** The outline of a dot by unit type. */
function dotShape(type, x, y) {
  switch (type) {
    case 'infantry':
    case 'motorised':
    case 'mechanised': {
      const s = type === 'infantry' ? 0.6 : type === 'motorised' ? 0.65 : 0.72;
      return `<rect x="${f2(x - s)}" y="${f2(y - s)}" width="${f2(2 * s)}" height="${f2(2 * s)}" rx="${type === 'mechanised' ? 0.05 : 0.15}"`;
    }
    case 'cavalry':
      return poly([[x, y - 0.8], [x + 0.75, y + 0.55], [x - 0.75, y + 0.55]]);
    case 'lightTank':
    case 'mediumTank':
    case 'heavyTank': {
      const s = type === 'lightTank' ? 0.75 : type === 'mediumTank' ? 0.9 : 1.05;
      return poly([[x, y - s], [x + s, y], [x, y + s], [x - s, y]]);
    }
    case 'artillery':
      return poly([[x - 0.25, y - 0.8], [x + 0.25, y - 0.8], [x + 0.25, y - 0.25], [x + 0.8, y - 0.25], [x + 0.8, y + 0.25], [x + 0.25, y + 0.25], [x + 0.25, y + 0.8], [x - 0.25, y + 0.8], [x - 0.25, y + 0.25], [x - 0.8, y + 0.25], [x - 0.8, y - 0.25], [x - 0.25, y - 0.25]]);
    case 'interceptor':
      return poly([[x + 0.9, y], [x - 0.7, y - 0.6], [x - 0.35, y], [x - 0.7, y + 0.6]]);
    case 'bomber':
      return poly([[x + 1, y], [x + 0.7, y - 0.15], [x + 0.2, y - 0.15], [x - 0.1, y - 1.1], [x - 0.35, y - 1.1], [x - 0.25, y - 0.15], [x - 0.7, y - 0.15], [x - 0.9, y - 0.5], [x - 1, y - 0.5], [x - 0.95, y], [x - 1, y + 0.5], [x - 0.9, y + 0.5], [x - 0.7, y + 0.15], [x - 0.25, y + 0.15], [x - 0.35, y + 1.1], [x - 0.1, y + 1.1], [x + 0.2, y + 0.15], [x + 0.7, y + 0.15]]);
    case 'destroyer':
    case 'cruiser':
    case 'battleship': {
      const rx = type === 'destroyer' ? 0.9 : type === 'cruiser' ? 1.1 : 1.35;
      return `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${rx}" ry=".45"`;
    }
    default:
      return `<circle cx="${f2(x)}" cy="${f2(y)}" r=".6"`;
  }
}
/** A small inner mark for units that share an outline. */
function dotMark(type, x, y) {
  if (type === 'antitank') return `<rect x="${f2(x - 0.4)}" y="${f2(y - 0.1)}" width=".8" height=".2" fill="#111"/>`;
  if (type === 'antiair') return `<circle cx="${f2(x)}" cy="${f2(y)}" r=".22" fill="#fff"/>`;
  if (type === 'motorised' || type === 'mechanised') return `<line x1="${f2(x - 0.5)}" y1="${f2(y + 0.35)}" x2="${f2(x + 0.5)}" y2="${f2(y + 0.35)}" stroke="#111" stroke-width=".15"/>`;
  return '';
}

/** Formation buttons for my side (only the ones my units allow). */
function formationRow(store, b, mySide) {
  const g = store.data.game;
  if (!mySide || b.kind === 'air' || b.status !== 'live') return '';
  const avail = (b.forms && b.forms[mySide]) || [];
  const cur = b.formation && b.formation[mySide];
  const meta = (id) => g.tw.formations.find((f) => f.id === id) || { name: id };
  const pct = (f) => {
    const bits = [];
    if (f.attackPct && f.attackPct !== 100) bits.push(`attack ${f.attackPct > 100 ? '+' : ''}${f.attackPct - 100}%`);
    if (f.defencePct && f.defencePct !== 100) bits.push(`protection ${f.defencePct > 100 ? '+' : ''}${f.defencePct - 100}%`);
    if (f.speedPct && f.speedPct !== 100) bits.push(`speed ${f.speedPct > 100 ? '+' : ''}${f.speedPct - 100}%`);
    return bits.join(', ');
  };
  return `<div class="formations"><span class="small"><b>Formation:</b> ${cur ? esc(meta(cur).name) : 'free'}</span>
    <div class="row wrap">${avail
      .map((id) => {
        const f = meta(id);
        return `<button class="btn small ${cur === id ? 'primary' : ''}" data-act="battleFormation" data-id="${b.id}" data-formation="${id}" title="${esc(f.desc + ' ' + pct(f))}">${esc(f.name)}</button>`;
      })
      .join('')}<button class="btn small ${cur ? '' : 'primary'}" data-act="battleFormation" data-id="${b.id}" data-formation="none" title="No formation: move units freely, no bonus">Free</button></div>
    ${cur ? `<p class="hint">${esc(meta(cur).desc)} ${esc(pct(meta(cur)))}</p>` : '<p class="hint">Pick a formation to arrange your whole army and get its bonus. Available ones depend on your units; you can switch at any time.</p>'}</div>`;
}

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
  const typesIn = [...new Set(b.dots.map((d) => d.type))];
  const army = (side) => typesIn.map((t) => (units(side, t) ? `<span title="${esc(nameOf(g, t))}">${shapeOf(g, t)}${units(side, t)}</span>` : '')).filter(Boolean).join(' ') || 'none left';
  const myTypes = mySide ? [...new Set(b.dots.filter((d) => d.side === mySide).map((d) => d.type))] : [];
  const kind = b.kind || 'land';
  const extras = [];
  if (b.airSuperiority) extras.push(`✈ air superiority: ${esc(g.players[b.airSuperiority === 'A' ? b.attacker : b.defender].name)}`);
  if (b.bombard && (b.bombard.A || b.bombard.D)) extras.push(`🚢 shore bombardment${b.bombard.A ? ` — ${esc(A.name)} ${b.bombard.A}/s` : ''}${b.bombard.D ? ` — ${esc(D.name)} ${b.bombard.D}/s` : ''}`);
  const auto = mySide && b.auto && b.auto[mySide];
  const done = b.status !== 'live';
  const terrainKinds = [...new Set(b.terrain.join(''))].filter((c) => TERRAIN_NAME[c]).map((c) => TERRAIN_NAME[c]);
  return `<div class="card phase-card battle-card">
    <h2>${KIND_TITLE[kind]} ${esc(tileLabel(g, b.tile))}</h2>
    <div class="battle-meta row wrap">
      <span>${chip(A.seat, A.name)} <small>attacking · <span class="army-A">${army('A')}</span></small></span>
      <span>vs</span>
      <span>${chip(D.seat, D.name)} <small>defending · <span class="army-D">${army('D')}</span></small></span>
    </div>
    <div class="battle-meta row wrap small">
      <span>⏱ <b class="battle-clock">${done ? 'over' : fmt((b.limit - b.time) / (b.speed || 1))}</b></span>
      ${kind === 'air' ? '<span>No flag: shoot down their aircraft. Winner gets air superiority.</span>' : `<span>⚑ capture <b class="battle-capture">${(Math.min(b.capture, b.captureNeeded) / (b.speed || 1)).toFixed(1)}</b> / ${Math.round(b.captureNeeded / (b.speed || 1))}s</span>`}
      ${extras.map((x) => `<span>${x}</span>`).join('')}
      ${terrainKinds.length ? `<span class="muted">terrain: ${terrainKinds.join(', ')}</span>` : ''}
      ${done ? `<span class="tag ${b.winner === mySide ? 'ok' : 'warn'}">${b.winner === 'A' ? esc(A.name) : esc(D.name)} won</span>` : ''}
    </div>
    ${others.length ? `<div class="row wrap">${others.map((x) => `<button class="btn small" data-act="watchBattle" data-id="${x.id}">Watch: ${esc(g.players[x.attacker].name)} vs ${esc(g.players[x.defender].name)}</button>`).join('')}</div>` : ''}
    ${waitingLine(g)}
    <div id="battle-wrap">${battleSvg(store, b)}</div>
    ${
      mySide && !done
        ? `<div class="row wrap battle-controls">
        <button class="btn small" data-act="battleSelect" data-type="all" title="Select every unit: tap the map and the whole formation moves there, keeping its shape">⬢ Whole army</button>
        ${myTypes.map((t) => `<button class="btn small" data-act="battleSelect" data-type="${t}">${shapeOf(g, t)} ${esc(nameOf(g, t))}</button>`).join('')}
        <button class="btn small" data-act="battleSelect" data-type="none">Clear</button>
        <button class="btn small" data-act="battleAddMode" aria-pressed="${store.ui.battleAdd ? 'true' : 'false'}">${store.ui.battleAdd ? '✓ ' : ''}Add to selection</button>
        <button class="btn small ${auto ? 'primary' : ''}" data-act="battleAuto" data-id="${b.id}" data-on="${auto ? 0 : 1}">${auto ? '🤖 Auto-battle ON' : '🤖 Auto-battle'}</button>
      </div>
      <div id="bt-forms">${formationRow(store, b, mySide)}</div>
      ${
        kind === 'air'
          ? `<p class="hint">Tap your aircraft, then tap where to fly. Interceptors shred bombers; bombers are weak in a dogfight, so keep them away. The last side with planes — or the stronger side when time runs out — wins air superiority: its bombers then join the land battle, where only anti-air can shoot them down.</p>`
          : kind === 'sea'
            ? `<p class="hint">Tap your ships, then tap where to sail. <b>${mySide === 'A' ? 'Hold the flag ⚑ with no enemy ship on it' : 'Keep their ships off the flag ⚑ until time runs out'}.</b> Cruisers and battleships fire at range; destroyers are fast. Hit a ship from two sides for bonus damage. The winner holds the sea bay.</p>`
            : ''
      }
      <p class="hint" ${kind === 'land' ? '' : 'hidden'}>Tap a unit (or a type button), then tap the map to send it. Several units move together and keep their formation — tap ⬢ Whole army to move everything. Your artillery follows the army by itself until you move it by hand (picking a formation sends it back to following). <b>${mySide === 'A' ? 'Hold the flag ⚑ with nobody defending it' : 'Keep attackers off the flag ⚑ until time runs out'}.</b> Ground you move through becomes yours (tinted); the dark line is the <b>frontline</b>. Your supply runs through your own ground back to your edge of the map — units cut off (red outline, red pocket) take heavy damage and surrender. Hit enemies from two sides for bonus damage. Cavalry struggles against infantry — until you encircle them. Tanks ignore rifle fire but fear anti-tank guns; only anti-air can hit planes.</p>`
        : `<p class="hint">You're watching. ${typesIn.map((t) => `${shapeOf(g, t)} ${esc(nameOf(g, t).toLowerCase())}`).join(' ')} (each unit is a group of dots). Tinted ground = territory, dark line = frontline, red = cut off.</p>`
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
  if (clock) clock.textContent = b.status === 'live' ? fmt((b.limit - b.time) / (b.speed || 1)) : 'over';
  const cap = document.querySelector('.battle-capture');
  if (cap) cap.textContent = (Math.min(b.capture, b.captureNeeded) / (b.speed || 1)).toFixed(1);
  // Keep the Auto-battle button in step (the computer may take over an idle side).
  const g = store.data.game;
  const side = b.attacker === g.you ? 'A' : b.defender === g.you ? 'D' : null;
  const forms = document.getElementById('bt-forms');
  if (forms) {
    const html = formationRow(store, b, side);
    if (forms.dataset.last !== html) {
      forms.innerHTML = html;
      forms.dataset.last = html;
    }
  }
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

/**
 * Which of my units is under this point? The dots are redrawn every frame, so we
 * hit-test against where they are drawn rather than relying on the clicked element.
 * Returns the unit id, or null.
 */
export function unitAt(store, b, p) {
  const g = store.data.game;
  const mySide = b.attacker === g.you ? 'A' : b.defender === g.you ? 'D' : null;
  if (!mySide) return null;
  const now = performance.now();
  let best = null;
  let bestD = 2.2; // tap radius in map squares
  for (const d of b.dots) {
    if (d.side !== mySide) continue;
    const pos = (anim.battle === b.id && drawnPos(d.id, now)) || d;
    const dist = Math.hypot(pos.x - p.x, pos.y - p.y);
    if (dist < bestD) {
      bestD = dist;
      best = d.unit;
    }
  }
  return best;
}

/**
 * Tapping a unit selects just that unit (tap it again to unselect).
 * With add = true (Shift/Ctrl, or "Add to selection" switched on) it joins the selection.
 */
export function selectUnit(store, b, unit, add) {
  const ids = b.dots.filter((d) => d.unit === unit).map((d) => d.id);
  const sel = new Set(store.ui.battleSel);
  const already = ids.every((id) => sel.has(id));
  if (add) {
    for (const id of ids) already ? sel.delete(id) : sel.add(id);
    store.ui.battleSel = [...sel];
  } else {
    const onlyThis = already && sel.size === ids.length;
    store.ui.battleSel = onlyThis ? [] : ids;
  }
}

/** Turn a click on the battlefield into map coordinates. */
export function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : null;
}
