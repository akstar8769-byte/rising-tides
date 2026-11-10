// Total War battle screen: draw the battlefield, select your dots, tap to move them.
// The server runs the battle; this file only shows it and sends orders.
import { esc, chip, PLAYER_STYLE } from './ui.js';
import { tileLabel } from './war-ui.js';

const TERRAIN_COLOR = { '.': '#dfe9c8', f: '#86b26c', h: '#cdb88c', w: '#79b6dc', '=': '#b6dbef' };
const TERRAIN_NAME = { f: 'forest', h: 'hill', w: 'river', '=': 'ford' };
const SHAPE = { militia: '●', infantry: '■', cavalry: '▲' };

/** The battle with the latest positions from the server merged in. */
export function liveBattle(store, id) {
  const g = store.data.game;
  const full = (g.battles || []).find((b) => b.id === id);
  if (!full) return null;
  const snap = (store.battleSnaps || {})[id];
  if (!snap) return full;
  return {
    ...full,
    time: snap.time,
    capture: snap.capture,
    status: snap.status,
    winner: snap.winner,
    auto: snap.auto,
    dots: snap.dots.map(([id2, side, type, x, y, hp, cut, tx, ty]) => ({ id: id2, side, type, x, y, hpPct: hp, cut: !!cut, tx, ty, seat: side === 'A' ? full.attacker : full.defender })),
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

/** The battlefield SVG for one battle. */
export function battleSvg(store, b) {
  const g = store.data.game;
  const W = g.tw.mapW;
  const H = g.tw.mapH;
  const cell = W / b.terrain[0].length;
  const mySide = b.attacker === g.you ? 'A' : b.defender === g.you ? 'D' : null;
  const sel = new Set(store.ui.battleSel || []);
  const parts = [];
  b.terrain.forEach((row, y) =>
    [...row].forEach((ch, x) => parts.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell + 0.05}" height="${cell + 0.05}" fill="${TERRAIN_COLOR[ch] || TERRAIN_COLOR['.']}"/>`)),
  );
  // Each side's supply edge
  const aCol = PLAYER_STYLE[b.attacker].color;
  const dCol = PLAYER_STYLE[b.defender].color;
  parts.push(`<rect x="0" y="0" width="1.2" height="${H}" fill="${aCol}" opacity=".55"/><rect x="${W - 1.2}" y="0" width="1.2" height="${H}" fill="${dCol}" opacity=".55"/>`);
  // Objective + capture progress
  const o = b.obj;
  const circ = 2 * Math.PI * o.r;
  const prog = Math.min(1, (b.capture || 0) / b.captureNeeded);
  parts.push(`<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="rgba(255,255,255,.25)" stroke="#333" stroke-width=".25" stroke-dasharray="1 .8"/>
    <circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="none" stroke="${aCol}" stroke-width=".7" stroke-dasharray="${circ * prog} ${circ}" transform="rotate(-90 ${o.x} ${o.y})"/>
    <text x="${o.x}" y="${o.y + 1}" font-size="3" text-anchor="middle">⚑</text>`);
  // Move orders of my selected dots
  for (const d of b.dots) {
    if (d.side === mySide && sel.has(d.id) && Math.hypot(d.tx - d.x, d.ty - d.y) > 0.5) {
      parts.push(`<line x1="${d.x}" y1="${d.y}" x2="${d.tx}" y2="${d.ty}" stroke="#111" stroke-width=".18" stroke-dasharray=".6 .5"/>`);
    }
  }
  // Dots
  for (const d of b.dots) {
    const st = PLAYER_STYLE[d.seat];
    const hp = d.hpPct != null ? d.hpPct / 100 : d.hp / d.max;
    const op = (0.35 + 0.65 * hp).toFixed(2);
    const stroke = sel.has(d.id) && d.side === mySide ? '#fff' : d.cut ? '#d7263d' : '#111';
    const sw = sel.has(d.id) && d.side === mySide ? 0.45 : d.cut ? 0.4 : 0.15;
    const dash = d.cut ? ' stroke-dasharray=".5 .3"' : '';
    let shape;
    if (d.type === 'infantry') shape = `<rect x="${d.x - 0.95}" y="${d.y - 0.95}" width="1.9" height="1.9" rx=".2"`;
    else if (d.type === 'cavalry') shape = `<polygon points="${d.x},${d.y - 1.2} ${d.x + 1.15},${d.y + 0.85} ${d.x - 1.15},${d.y + 0.85}"`;
    else shape = `<circle cx="${d.x}" cy="${d.y}" r=".9"`;
    parts.push(`${shape} fill="${st.color}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
    if (d.side === mySide) parts.push(`<circle cx="${d.x}" cy="${d.y}" r="2" fill="transparent" data-dot="${d.id}"/>`);
  }
  return `<svg id="battle-svg" viewBox="0 0 ${W} ${H}" data-battle="${b.id}" role="img" aria-label="Battlefield">${parts.join('')}</svg>`;
}

/** The whole battle card for the Play tab. */
export function battlePanel(store) {
  const g = store.data.game;
  const id = pickBattle(store);
  if (id == null) return '<div class="card phase-card"><h2>⚔ Battles</h2><p>Waiting for battles to start…</p></div>';
  const b = liveBattle(store, id);
  const A = g.players[b.attacker];
  const D = g.players[b.defender];
  const mySide = b.attacker === g.you ? 'A' : b.defender === g.you ? 'D' : null;
  const others = (g.battles || []).filter((x) => x.id !== id);
  const count = (side, type) => b.dots.filter((d) => d.side === side && (!type || d.type === type)).length;
  const army = (side) => ['militia', 'infantry', 'cavalry'].map((t) => (count(side, t) ? `${SHAPE[t]}${count(side, t)}` : '')).filter(Boolean).join(' ') || 'none left';
  const auto = mySide && b.auto && b.auto[mySide];
  const done = b.status !== 'live';
  const terrainKinds = [...new Set(b.terrain.join(''))].filter((c) => TERRAIN_NAME[c]).map((c) => TERRAIN_NAME[c]);
  return `<div class="card phase-card battle-card">
    <h2>⚔ Battle for ${esc(tileLabel(g, b.tile))}</h2>
    <div class="battle-meta row wrap">
      <span>${chip(A.seat, A.name)} <small>attacking · ${army('A')}</small></span>
      <span>vs</span>
      <span>${chip(D.seat, D.name)} <small>defending · ${army('D')}</small></span>
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
      <p class="hint">Tap your units (or a type button), then tap the map to send them. <b>${mySide === 'A' ? 'Hold the flag ⚑ with nobody defending it' : 'Keep attackers off the flag ⚑ until time runs out'}.</b> Units cut off from your side's edge of the map (red dashed outline) take heavy damage and surrender. Hit enemies from two sides for bonus damage. Cavalry struggles against infantry — until you encircle them. Forests and hills protect; rivers are slow except at fords.</p>`
        : `<p class="hint">You're watching. ● militia ■ infantry ▲ cavalry. Red dashed outline = cut off from supply.</p>`
    }
  </div>`;
}

/** Called on every battle snapshot: redraw just the battlefield, not the whole page. */
export function refreshBattle(store) {
  const wrap = document.getElementById('battle-wrap');
  const svg = wrap && wrap.querySelector('#battle-svg');
  if (!svg) return;
  const b = liveBattle(store, Number(svg.dataset.battle));
  if (!b) return;
  wrap.innerHTML = battleSvg(store, b);
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

/** Turn a click on the battlefield into map coordinates. */
export function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : null;
}
