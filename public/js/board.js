// SVG hex board. Tile positions come from the board data the server sends
// (engine/layouts.js), so a new layout needs no changes here.
import { esc, BIOME, PLAYER_STYLE } from './ui.js';

const SIZE = 50; // hex radius in SVG units
const SQ3 = Math.sqrt(3);

function center(t) {
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

export function renderBoard(game) {
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
    const b = BIOME[t.biome];
    const owner = t.owner != null ? game.players[t.owner] : null;
    const isHome = owner && t.role === 'capital';
    const faded = !owner ? ' open' : '';
    let inner = `<polygon points="${hexPoints(x, y, SIZE - 2)}" fill="${b.color}" stroke="#ffffff" stroke-width="2"/>`;
    if (owner) {
      const st = PLAYER_STYLE[t.owner];
      inner += `<polygon points="${hexPoints(x, y, SIZE - 7)}" fill="url(#pat-${t.owner})" stroke="${st.color}" stroke-width="7" opacity=".95"/>`;
    }
    inner += `<text x="${x}" y="${y - (isHome ? 22 : 2)}" class="glyph">${b.glyph}</text>`;
    if (isHome) {
      const st = PLAYER_STYLE[t.owner];
      const short = owner.name.length > 7 ? owner.name.slice(0, 6) + '…' : owner.name;
      inner += `<rect x="${x - 42}" y="${y - 9}" width="84" height="25" rx="7" fill="${st.color}" stroke="${t.owner === game.you ? '#000' : '#0004'}" stroke-width="${t.owner === game.you ? 2.5 : 1}"/>
        <text x="${x}" y="${y + 9}" class="tname" fill="${st.ink}">${st.label} ${esc(short)}</text>
        <text x="${x}" y="${y + 33}" class="tsub strong">🧱${owner.walls}${t.owner === game.you ? ' · you' : ''}</text>`;
    }
    const title = owner ? `${owner.name}'s home — ${b.label}` : `Open tile — ${b.label}`;
    return `<g class="tile${faded}"><title>${esc(title)}</title>${inner}</g>`;
  });

  return `<svg class="board" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" role="img" aria-label="Game board">${parts.join('')}</svg>
  <div class="legend">${Object.values(BIOME)
    .map((b) => `<span><i style="background:${b.color}"></i>${b.glyph} ${b.label}${b.res ? ` (${b.res === 'sandbag' ? 'sandbags' : b.res})` : ' (any)'}</span>`)
    .join('')}</div>`;
}
