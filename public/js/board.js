// SVG hex board. Tile positions come from the board data the server sends
// (engine/layouts.js), so a new layout needs no changes here.
//
// Each tile shows:  biome colour + glyph; the OWNER as a coloured border with
// their pattern; in War modes, an OCCUPIER's flag (⚑P2) when someone else holds it;
// on capitals: name, walls, units and markers (🩹 Damaged, ⛔ sanctioned, ⛓ puppet, 👑 overlord).
import { esc, BIOME, PLAYER_STYLE } from './ui.js';
import { viewBoxFor } from './mapview.js';

const SIZE = 50; // hex radius in SVG units
const SQ3 = Math.sqrt(3);

export function center(t) {
  // pointy-top axial -> pixel
  return { x: SIZE * SQ3 * (t.q + t.r / 2), y: SIZE * 1.5 * t.r };
}

function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Stationed units: a dark badge like "⚔3" (or "⚔2+1" when an overlord helps defend). */
function unitBadge(t, x, y) {
  const stacks = Object.entries(t.units || {}).filter(([, n]) => n > 0);
  if (!stacks.length) return '';
  stacks.sort(([a], [b]) => (Number(b) === t.controller) - (Number(a) === t.controller));
  const label = '⚔' + stacks.map(([, n]) => n).join('+');
  const w = 16 + label.length * 9;
  const bx = x - 38;
  const by = y - 34;
  const ring = PLAYER_STYLE[Number(stacks[0][0])].color;
  return `<g class="unit-badge"><rect x="${bx}" y="${by}" width="${w}" height="23" rx="11" fill="#1c2833" stroke="${ring}" stroke-width="3"/>
    <text x="${bx + w / 2}" y="${by + 16.5}" class="ubadge">${label}</text></g>`;
}

/** Factory: 🌿 green ring (sustainable) or 🏭 grey ring with smoke (unsustainable), in the owner's colour. */
function factoryBadge(t, x, y) {
  const st = PLAYER_STYLE[t.factory.owner];
  const green = t.factory.kind === 'sustainable';
  const cx = x + 26;
  const cy = y - (t.role === 'capital' ? 30 : 4);
  return `<g class="factory"><circle cx="${cx}" cy="${cy}" r="15" fill="${st.color}" stroke="${green ? '#1e8449' : '#555'}" stroke-width="4" ${green ? '' : 'stroke-dasharray="4 2"'}/>
    <text x="${cx}" y="${cy + 6}" class="fglyph">${green ? '🌿' : '🏭'}</text>
    ${t.role === 'capital' ? '' : `<text x="${x}" y="${y + 38}" class="tid">${t.id} · ${st.label}</text>`}</g>`;
}

/**
 * opts.highlight: tile ids to outline as possible targets (clickable)
 * opts.selected:  the currently chosen target
 */
export function renderBoard(game, opts = {}) {
  const war = !!game.war;
  const highlight = new Set(opts.highlight || []);
  const tiles = game.board.tiles;
  const cs = tiles.map(center);
  const xs = cs.map((c) => c.x);
  const ys = cs.map((c) => c.y);
  const pad = SIZE + 6;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;

  const parts = tiles.map((t, i) => {
    const { x, y } = cs[i];
    if (t.kind === 'village') {
      const bonus = game.seawallBonus;
      return `<g class="tile village">
        <polygon points="${hexPoints(x, y, SIZE - 2)}" fill="#efe4c8" stroke="#8a7b57" stroke-width="2"/>
        <text x="${x}" y="${y - 12}" class="glyph">🏘️</text>
        <text x="${x}" y="${y + 10}" class="tlabel">Village</text>
        <text x="${x}" y="${y + 25}" class="tsub">Seawall ${game.seawall}${bonus ? ` (+${bonus})` : ''}</text>
      </g>`;
    }
    if (t.kind === 'sea') {
      // Sea bay: water, with the holder's colour as a ring and their ships as a badge.
      const hold = t.controller != null ? PLAYER_STYLE[t.controller] : null;
      let act = ` data-act="tileMenu" data-tile="${t.id}" role="button" tabindex="0"`;
      let cls = 'tile sea';
      let ring = '';
      if (highlight.has(t.id)) {
        cls += opts.selected === t.id ? ' target selected' : ' target';
        act = ` data-act="pickTile" data-tile="${t.id}" role="button" tabindex="0"`;
        ring = `<polygon points="${hexPoints(x, y, SIZE - 4)}" class="target-ring"/>`;
      }
      return `<g class="${cls}"${act}><title>${t.fish ? 'Fishing ground' : 'Sea'} ${t.id}${hold ? ' — ' + esc(game.players[t.controller].name) + "'s fleet" : ''}${t.fish ? ' (earns its holder income)' : ''}</title>
        <polygon points="${hexPoints(x, y, SIZE - 2)}" fill="#1f4e79" stroke="${hold ? hold.color : '#ffffff'}" stroke-width="${hold ? 6 : 2}"/>
        <text x="${x}" y="${y - 4}" class="glyph">${t.fish ? '🐟' : '🌊'}</text>
        <text x="${x}" y="${y + 38}" class="tid" style="fill:#fff">${t.id}</text>
        ${game.stationed ? unitBadge(t, x, y) : ''}${ring}</g>`;
    }
    const b = BIOME[t.biome];
    const owner = t.owner != null ? game.players[t.owner] : null;
    const isCapital = owner && t.role === 'capital';
    const occupier = war && t.controller != null && t.controller !== t.owner ? t.controller : null;
    const unheld = !owner && occupier == null;
    let inner = `<polygon points="${hexPoints(x, y, SIZE - 2)}" fill="${b.color}" stroke="#ffffff" stroke-width="2"/>`;
    if (owner) {
      const st = PLAYER_STYLE[t.owner];
      inner += `<polygon points="${hexPoints(x, y, SIZE - 7)}" fill="url(#pat-${t.owner})" stroke="${st.color}" stroke-width="7" opacity=".95"/>`;
    }
    if (occupier != null) {
      // Occupied: the holder's colour fills the middle, with a flag label.
      const oc = PLAYER_STYLE[occupier];
      inner += `<polygon points="${hexPoints(x, y, SIZE - 16)}" fill="${oc.color}" opacity=".55"/>
        <polygon points="${hexPoints(x, y, SIZE - 16)}" fill="url(#pat-${occupier})"/>
        <rect x="${x - 25}" y="${y + 3}" width="50" height="20" rx="6" fill="${oc.color}" stroke="#000" stroke-width="1.5"/>
        <text x="${x}" y="${y + 18}" class="tname small" fill="${oc.ink}">⚑${oc.label}</text>`;
    }
    inner += `<text x="${x}" y="${y - (isCapital ? 22 : occupier != null ? 12 : 2)}" class="glyph">${b.glyph}</text>`;
    if (isCapital) {
      const st = PLAYER_STYLE[t.owner];
      const short = owner.name.length > 7 ? owner.name.slice(0, 6) + '…' : owner.name;
      let sub = `🧱${owner.walls}`;
      if (war && !game.stationed) sub += ` ⚔${owner.units}`;
      if (t.owner === game.you) sub += ' · you';
      let marks = '';
      if (owner.damaged) marks += '🩹';
      if (owner.sanctioned) marks += '⛔';
      if (owner.puppetOf != null) marks += `⛓${PLAYER_STYLE[owner.puppetOf].label}`;
      if (owner.puppets && owner.puppets.length) marks += '👑';
      inner += `<rect x="${x - 42}" y="${y - 9}" width="84" height="25" rx="7" fill="${st.color}" stroke="${t.owner === game.you ? '#000' : '#0004'}" stroke-width="${t.owner === game.you ? 2.5 : 1}"/>
        <text x="${x}" y="${y + 9}" class="tname" fill="${st.ink}">${st.label} ${esc(short)}</text>
        <text x="${x}" y="${y + 33}" class="tsub strong">${sub}</text>
        ${marks ? `<text x="${x + 30}" y="${y - 26}" class="marks">${marks}</text>` : ''}`;
    }
    if (war && !isCapital) inner += `<text x="${x}" y="${y + 38}" class="tid">${t.id}</text>`;
    if ((game.blockaded || []).includes(t.id)) inner += `<text x="${x - 28}" y="${y - 20}" class="marks"><title>Blockaded: enemy ships offshore, no income</title>⚓</text>`;
    if (game.stationed) inner += unitBadge(t, x, y);
    if (t.factory) inner += factoryBadge(t, x, y);
    else if (t.controller == null && !owner && game.factories) inner += `<text x="${x}" y="${y + 38}" class="tid">${t.id}</text>`;
    let cls = 'tile';
    if (unheld) cls += ' open';
    let act = ` data-act="tileMenu" data-tile="${t.id}" role="button" tabindex="0"`;
    if (highlight.has(t.id)) {
      cls += opts.selected === t.id ? ' target selected' : ' target';
      act = ` data-act="pickTile" data-tile="${t.id}" role="button" tabindex="0"`;
      inner += `<polygon points="${hexPoints(x, y, SIZE - 4)}" class="target-ring"/>`;
    }
    const title = `${owner ? `${owner.name}'s ${t.role}` : 'Open tile'} ${t.id} — ${b.label}${occupier != null ? `, held by ${game.players[occupier].name}` : ''}${(game.blockaded || []).includes(t.id) ? ' — BLOCKADED (no income)' : ''}`;
    return `<g class="${cls}"${act}><title>${esc(title)}</title>${inner}</g>`;
  });

  const factoryLegend = game.factories ? '<span>🌿 sustainable factory · 🏭 unsustainable factory (ring = owner)</span>' : '';
  const legendExtra = war
    ? `${game.board.seaLanes ? '<span>🐟 fishing ground (income for its holder)</span><span>⚓ blockaded (enemy ships offshore)</span>' : ''}<span>⚑P2 = occupied by P2</span><span>⚔ units${game.stationed ? ' on that tile' : ''}</span><span>🩹 Damaged</span><span>⛔ sanctioned</span>${game.mode === 'empire' ? '<span>⛓ puppet · 👑 overlord</span>' : ''}`
    : '';
  const box = [Math.round(minX), Math.round(minY), Math.round(w), Math.round(h)];
  const vb = opts.view ? viewBoxFor(box, opts.view) : box;
  return `<svg class="board" viewBox="${vb.map((n) => n.toFixed(1)).join(' ')}" data-box="${box.join(' ')}" role="img" aria-label="Game board">${parts.join('')}</svg>
  <div class="legend">${Object.values(BIOME)
    .filter((b) => !b.sea || tiles.some((t) => t.kind === 'sea'))
    .map((b) => `<span><i style="background:${b.color}"></i>${b.glyph} ${b.label}${b.sea ? ' (ships only)' : b.res ? ` (${b.res === 'sandbag' ? 'sandbags' : b.res})` : ' (any)'}</span>`)
    .join('')}${legendExtra}${factoryLegend}</div>
  ${highlight.size ? '<p class="hint map-hint">Tap an outlined tile to choose it.</p>' : ''}`;
}
