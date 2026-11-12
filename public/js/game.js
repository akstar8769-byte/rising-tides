// Main game screen: phase bar, Flood track, my panel, players, trading, log.
// On phones one tab is shown at a time; on wide screens everything is visible.
import { esc, chip, swatch, matIcon, bagInline, bagText, bagTotal, bagEditor, stepper, MATS, MAT_LABEL, BIOME, PHASE_LABEL, PLAYER_STYLE, plural } from './ui.js';
import { renderBoard, center } from './board.js';
import { renderLog, renderChat } from './log.js';
import { accordPill, accordCard, warTags, warMyPanel, warChoosePanel, tileLabel, payLargest, targetNote } from './war-ui.js';
export { tileLabel };
import { diplomacyPanel, diploTags, limitsNote, myPactWith } from './diplomacy-ui.js';
import { battlePanel } from './battle-ui.js';

const BUILD = ['talk', 'trade'];
const j = (o) => esc(JSON.stringify(o));

// The game screen is a map table: the board fills the window, your stock sits in a
// thin bar on top, rivals are banners over the map, and everything else slides in
// from the side (a bottom sheet on phones) when you open it from the dock.
const DRAWERS = [
  { id: 'turn', icon: '🎯', label: 'Turn' },
  { id: 'build', icon: '🏗️', label: 'Build' },
  { id: 'trade', icon: '🤝', label: 'Trade' },
  { id: 'flood', icon: '🌊', label: 'Flood' },
  { id: 'log', icon: '📜', label: 'Log' },
  { id: 'chat', icon: '💬', label: 'Chat' },
];
const DRAWER_TITLE = { turn: 'Your turn', build: 'Build & army', trade: 'Trade & diplomacy', flood: 'The Flood', log: 'Event log', chat: 'Chat' };

export function renderGame(store) {
  const d = store.data;
  const g = d.game;
  const ui = store.ui;
  const drawer = DRAWERS.some((x) => x.id === ui.drawer) ? ui.drawer : null;
  const incoming = g.trades.filter((t) => t.to === g.you).length + (g.pacts || []).filter((p) => p.status === 'proposed' && p.b === g.you).length + (g.treaties || []).filter((t) => t.invited.includes(g.you) && ![...t.signed, ...t.declined, ...t.broken].includes(g.you)).length;
  const badges = { trade: incoming, chat: store.unreadChat, turn: g.waitingFor.includes(g.you) && !BUILD.includes(g.phase) ? '!' : 0 };
  const wide = drawer === 'turn' && g.phase === 'battle';

  return `<div class="table ${drawer ? 'has-drawer' : ''} ${wide ? 'drawer-wide' : ''}">
  ${hud(store)}
  <div class="alerts">
    ${d.paused ? '<div class="banner paused">⏸ The host has paused the game.</div>' : ''}
    ${floodBanner(g)}
  </div>
  <main class="map ${ui.legend ? 'show-legend' : ''}">
    ${renderBoard(g, { ...boardOptions(store), view: mapView(store) })}
    ${rivals(store)}
    <div class="map-zoom" role="group" aria-label="Zoom">
      <button data-act="zoom" data-f="1.4" aria-label="Zoom in">＋</button>
      <button data-act="zoom" data-f="0.7" aria-label="Zoom out">－</button>
      <button data-act="zoom" data-f="0" aria-label="Show the whole map" title="Whole map">⟲</button>
    </div>
    <button class="map-key" data-act="set" data-path="legend" data-json="${!ui.legend}" aria-pressed="${!!ui.legend}">🗺 Key</button>
  </main>
  ${
    drawer
      ? `<aside class="drawer" aria-label="${DRAWER_TITLE[drawer]}">
    <div class="drawer-head"><h2>${DRAWER_TITLE[drawer]}</h2><button class="icon-btn" data-act="drawer" data-id="${drawer}" aria-label="Close">✕</button></div>
    <div class="drawer-body" data-keep-scroll="drawer-${drawer}">${drawerBody(store, drawer)}</div>
  </aside>`
      : ''
  }
  ${tileMenu(store)}
  <nav class="dock" aria-label="Panels">
    <div class="dock-btns">${DRAWERS.map(
      (x) => `<button class="dock-btn ${drawer === x.id ? 'active' : ''}" data-act="drawer" data-id="${x.id}" aria-pressed="${drawer === x.id}">
        <span aria-hidden="true">${x.icon}</span><small>${x.label}</small>${badges[x.id] ? `<span class="badge">${badges[x.id]}</span>` : ''}</button>`,
    ).join('')}</div>
    ${endTurn(store)}
  </nav>
</div>`;
}

/** Where the map is looking. Big boards start zoomed in on your capital. */
function mapView(store) {
  if (store.ui.mapView) return store.ui.mapView;
  const g = store.data.game;
  if (g.board.tiles.length <= 40) return null;
  const home = g.board.tiles.find((t) => t.owner === g.you && t.role === 'capital');
  if (!home) return null;
  const c = center(home);
  return { zoom: 1.7, cx: c.x, cy: c.y };
}

function drawerBody(store, id) {
  const g = store.data.game;
  const me = g.players[g.you];
  if (id === 'turn') return phasePanel(store) || '<p class="muted">Nothing to do right now.</p>';
  if (id === 'build') return myPanel(store);
  if (id === 'trade') return tradePanel(store) + diplomacyPanel(store);
  if (id === 'flood') return `<div class="card">${floodTrack(g, me)}</div>`;
  if (id === 'log') return `<div class="card">${renderLog(g)}</div>`;
  if (id === 'chat') return `<div class="card">${renderChat(store)}</div>`;
  return '';
}

// ------------------------------------------------------------------ top bar (HUD)
function hud(store) {
  const d = store.data;
  const g = d.game;
  const me = g.players[g.you];
  const rounds = g.mode === 'base' ? g.settings.base.rounds : g.settings.war.rounds;
  return `<header class="hud">
    <div class="hud-phase">
      <span class="hud-round">Round ${g.round}<small>/${rounds}${g.settings.base.stormEnabled && g.mode === 'base' ? '*' : ''}</small></span>
      <b class="hud-phase-name">${PHASE_LABEL[g.phase] || g.phase}</b>
    </div>
    <div class="hud-pills">
      <button class="flood-pill ${dangerClass(g)}" data-act="drawer" data-id="flood" title="Flood / catastrophe threshold">🌊 ${g.flood}/${g.threshold}</button>
      ${g.tw && g.tw.truce ? `<span class="truce-pill" title="Nobody can attack another player yet">🕊 Truce to rd ${g.tw.truce}</span>` : accordPill(g)}
    </div>
    <div class="hud-res" aria-label="Your stock">
      ${MATS.map((m) => `<span class="res" title="${MAT_LABEL[m]}">${matIcon(m, 22)}<b>${me.materials[m]}</b></span>`).join('')}
      <span class="res" title="Walls (protection ${me.protection})">🧱<b>${me.walls}</b><small class="${me.protection >= g.flood ? 'ok' : 'warn'}">${me.protection >= g.flood ? 'safe' : 'at risk'}</small></span>
      ${g.war ? `<span class="res" title="Your units">⚔<b>${me.units}</b></span>` : ''}
    </div>
    <div class="hud-room">
      <span class="small">Room ${esc(d.code)}</span>
      ${d.you.isHost ? `<button class="btn small" data-act="toggleHost" aria-expanded="${store.ui.hostOpen}">Host ▾</button>` : ''}
    </div>
    ${d.you.isHost && store.ui.hostOpen ? hostMenu(store) : ''}
  </header>`;
}

/** The big wax-seal button: Ready / choose / go to the battle. */
function endTurn(store) {
  const g = store.data.game;
  const me = g.players[g.you];
  const others = g.waitingFor.filter((s) => s !== g.you).map((s) => esc(g.players[s].name));
  const wait = others.length ? (others.length >= g.players.length - 1 && g.players.length > 2 ? 'Waiting for everyone' : `Waiting for ${others.join(', ')}`) : '';
  let btn;
  if (BUILD.includes(g.phase))
    btn = me.ready
      ? `<button class="end-turn done" data-act="unready" title="Tap to undo">✔ Ready<small>tap to undo</small></button>`
      : `<button class="end-turn" data-act="ready" ${store.data.paused ? 'disabled' : ''}>End turn ▶</button>`;
  else if (g.phase === 'choose')
    btn = me.choice
      ? `<button class="end-turn done" data-act="drawer" data-id="turn" data-keep="1">🔒 Locked in</button>`
      : `<button class="end-turn" data-act="drawer" data-id="turn" data-keep="1">Choose move ▶</button>`;
  else if (g.phase === 'battle') btn = `<button class="end-turn" data-act="drawer" data-id="turn" data-keep="1">⚔ Battles</button>`;
  else btn = `<button class="end-turn" data-act="drawer" data-id="turn" data-keep="1">${PHASE_LABEL[g.phase] || 'Continue'}</button>`;
  return `<div class="end-wrap">${wait ? `<span class="end-wait">${wait}</span>` : ''}${btn}</div>`;
}

// ------------------------------------------------------------------ rival banners
function rivals(store) {
  const d = store.data;
  const g = d.game;
  const open = store.ui.rival;
  const banners = g.players
    .map((p) => {
      const member = d.members[p.seat];
      let status = '';
      if (BUILD.includes(g.phase)) status = p.ready ? '<i class="ok" title="Ready">✓</i>' : '<i title="Still building">…</i>';
      else if (g.phase === 'choose') status = p.hasChosen ? '<i class="ok" title="Chosen">✓</i>' : '<i title="Thinking">🤔</i>';
      const safe = p.protection >= g.flood;
      return `<button class="rival ${p.seat === g.you ? 'me' : ''} ${open === p.seat ? 'open' : ''}" style="--pc:${PLAYER_STYLE[p.seat].color}" data-act="set" data-path="rival" data-json="${open === p.seat ? 'null' : p.seat}" aria-expanded="${open === p.seat}">
        ${swatch(p.seat, 20)}<span class="rname">${esc(p.name)}${p.seat === g.you ? ' <small>(you)</small>' : ''}</span>${status}
        <span class="rline">${g.war ? `⚔${p.units} ` : ''}🧱${p.walls}${safe ? '' : ' <b class="warn" title="Home at risk">⚠</b>'}${member && member.bot ? ' 🤖' : ''}${member && !member.connected ? ' <span class="warn">offline</span>' : ''}${p.sanctioned ? ' ⛔' : ''}${p.damaged ? ' 🩹' : ''}</span>
      </button>`;
    })
    .join('');
  const pop = open != null && g.players[open] ? `<div class="rival-pop"><ul class="players">${playerItem(store, g.players[open])}</ul></div>` : '';
  return `<div class="rivals">${banners}${pop}</div>`;
}

// ------------------------------------------------------------------ tile menu
function tileMenu(store) {
  const m = store.ui.tileMenu;
  if (!m) return '';
  const g = store.data.game;
  const t = g.board.tiles.find((x) => x.id === m.id);
  if (!t) return '';
  const acts = tileActions(store, t);
  const units = Object.entries(t.units || {})
    .filter(([, n]) => n > 0)
    .map(([s, n]) => {
      const tr = t.troops && t.troops[s];
      const detail = tr && g.tw ? Object.entries(tr).filter(([, k]) => k > 0).map(([k, c]) => `${(g.tw.units.find((u) => u.type === k) || { shape: '●' }).shape}${c}`).join(' ') : '';
      return `<li>${chip(+s, g.players[s].name)} ⚔ ${n}${detail ? ` <small>${detail}</small>` : ''}</li>`;
    })
    .join('');
  const b = BIOME[t.biome];
  const w = 280;
  const left = Math.max(8, Math.min(m.x - w / 2, (typeof innerWidth === 'number' ? innerWidth : 1000) - w - 8));
  const top = Math.max(8, Math.min(m.y + 6, (typeof innerHeight === 'number' ? innerHeight : 800) - 300));
  return `<div class="tile-menu" style="left:${left}px;top:${top}px;width:${w}px" role="dialog" aria-label="${esc(tileLabel(g, t.id))}">
    <div class="tm-head"><b>${esc(tileLabel(g, t.id))}</b><button class="icon-btn" data-act="closeTileMenu" aria-label="Close">✕</button></div>
    <p class="small muted">${t.fish ? '🐟 Fishing ground — whoever holds it with ships earns income every round' : t.kind === 'sea' ? (g.board.seaLanes ? '🌊 Open sea — ships move hex by hex; a chain of your ships lets troops cross' : '🌊 Sea bay — ships only') : b ? `${b.glyph} ${b.label}${b.res ? ` — makes ${b.res === 'sandbag' ? 'sandbags' : b.res}` : ''}` : ''}${(g.blockaded || []).includes(t.id) ? ' · <b class="warn">⚓ Blockaded: no income</b>' : ''}${t.factory ? ` · ${t.factory.kind === 'sustainable' ? '🌿' : '🏭'} ${esc(g.players[t.factory.owner].name)}'s factory` : ''}</p>
    ${units ? `<ul class="plain tm-units">${units}</ul>` : g.stationed && t.kind !== 'village' ? '<p class="small muted">No units here.</p>' : ''}
    ${acts.length ? `<div class="tm-actions">${acts.join('')}</div>` : `<p class="hint">${tileIdleHint(g)}</p>`}
  </div>`;
}

function tileIdleHint(g) {
  if (BUILD.includes(g.phase)) return 'Nothing to do on this tile right now.';
  if (g.phase === 'choose') return 'You can’t act on this tile this turn.';
  return 'Actions open again in the next Talk & Build phase.';
}

/** Buttons for what you can do on this tile right now. */
function tileActions(store, t) {
  const d = store.data;
  const g = d.game;
  const me = g.players[g.you];
  const id = t.id;
  const out = [];
  const btn = (op, label, note = '', primary = false) =>
    `<button class="btn ${primary ? 'primary' : ''}" data-act="tileDo" data-op="${op}" data-tile="${id}">${label}${note ? `<small>${note}</small>` : ''}</button>`;
  const canBuild = BUILD.includes(g.phase) && !d.paused;
  const mine = (n) => (n.units && n.units[g.you]) || 0;
  if (canBuild) {
    if (g.war && t.kind === 'land' && t.controller === g.you) out.push(btn('recruit', '🪖 Recruit here', '', true));
    if (g.tw && t.kind === 'sea' && (g.tw.seas || []).includes(id) && g.tw.units.some((u) => u.domain === 'sea' && u.unlocked)) out.push(btn('recruit', '⚓ Launch ships here', '', true));
    if (g.stationed && mine(t) > 0) out.push(btn('moveFrom', '🚶 Move troops from here'));
    const dests = t.kind === 'sea' ? g.seaTiles || [] : g.standTiles || [];
    if (g.stationed && dests.includes(id) && g.board.tiles.some((x) => x.id !== id && mine(x) > 0 && (x.kind === 'sea') === (t.kind === 'sea'))) out.push(btn('moveTo', '📍 Move troops here'));
    if (g.tw && t.controller === g.you && mine(t) > 0 && g.tw.units.some((u) => u.unlocked && u.from)) out.push(btn('upgrade', '⬆ Upgrade troops here'));
    if (g.war && t.kind === 'land' && t.controller === g.you && t.owner != null && t.owner !== g.you) {
      const planned = me.plans.withdraw.includes(id);
      out.push(btn('withdraw', planned ? '✔ Withdrawing at upkeep' : '↩ Withdraw at next upkeep'));
    }
    if (g.factories && g.factories.sites.includes(id)) out.push(btn('factory', '🏭 Build a factory here', '', true));
  }
  // Navy: cruisers and battleships shell the coast next to them (once per round per hex).
  if (canBuild && g.bombardTargets) {
    const shell = (from, target) =>
      `<button class="btn" data-act="bombard" data-from="${from}" data-target="${target}">💥 Bombard ${esc(tileLabel(g, target))}<small>${from === id ? '' : 'from your ships on ' + from + ' · '}each hit destroys a unit there</small></button>`;
    if (t.kind === 'sea') for (const target of g.bombardTargets[id] || []) out.push(shell(id, target));
    else for (const [from, list] of Object.entries(g.bombardTargets)) if (list.includes(id)) out.push(shell(from, id));
  }
  if (g.phase === 'choose' && !d.paused) {
    if (g.war && me.puppetOf == null && (g.attackTargets || []).includes(id)) out.push(btn('attack', '⚔ Attack this tile', esc(targetNote(g, id)), true));
    if (g.factories && g.factories.claimTargets.includes(id)) out.push(btn('claim', '🏴 Claim this factory', '', true));
    if (!g.war && !g.factories && t.role === 'capital' && t.owner != null && t.owner !== g.you) out.push(btn('raid', `🗡 Raid ${esc(g.players[t.owner].name)}`, '', true));
  }
  return out;
}

/** Which tiles to outline on the board (attack targets while choosing / commanding). */
function boardOptions(store) {
  const g = store.data.game;
  const ui = store.ui;
  if (g.factories) {
    if (g.phase === 'choose' && ui.choice.action === 'claim') return { highlight: g.factories.claimTargets, selected: ui.choice.target };
    if (BUILD.includes(g.phase) && ui.factory.picking) return { highlight: g.factories.sites, selected: ui.factory.tile };
    return {};
  }
  if (!g.war) return {};
  if (ui.cmdAttackFor != null && g.commandTargets[ui.cmdAttackFor]) return { highlight: g.commandTargets[ui.cmdAttackFor], selected: null };
  if (g.phase === 'choose' && ui.choice.action === 'attack' && g.players[g.you].puppetOf == null) return { highlight: g.attackTargets, selected: ui.choice.target };
  return {};
}

function hostMenu(store) {
  const d = store.data;
  const g = d.game;
  const skips = g.waitingFor
    .map((s) => {
      const offline = !d.members[s]?.connected;
      return `<button class="btn small" data-act="host" data-op="skip" data-seat="${s}">Skip ${esc(g.players[s].name)}${offline ? ' (offline)' : ''}</button>`;
    })
    .join('');
  return `<div class="host-menu">
    ${d.paused ? '<button class="btn small" data-act="host" data-op="resume">▶ Resume</button>' : '<button class="btn small" data-act="host" data-op="pause">⏸ Pause</button>'}
    ${skips}
    <button class="btn small danger" data-act="host" data-op="endGame">End game</button>
    <p class="hint">Skip: marks a player Ready, plays Sustainable for them (puppets: their command), or picks their loot at random.</p>
  </div>`;
}

function dangerClass(g) {
  const gap = g.threshold - g.flood;
  return gap <= 1 ? 'critical' : gap <= 2 ? 'danger' : '';
}

function floodBanner(g) {
  const gap = g.threshold - g.flood;
  if (gap > 2) return '';
  return `<div class="banner ${gap <= 1 ? 'critical' : 'danger'}">⚠️ The Flood is ${g.flood}. ${gap === 1 ? 'One more' : 'Two more'} Flood rise${gap === 1 ? '' : 's'} and the whole village is lost!</div>`;
}

// ------------------------------------------------------------------ flood track
function floodTrack(g, me) {
  const max = g.threshold;
  const cells = [];
  for (let i = 0; i <= max; i++) {
    const accord = g.war && i === g.war.accordLine;
    const cls = [i <= g.flood ? 'filled' : '', i === max ? 'cata' : '', i === g.flood ? 'current' : '', i === me.protection ? 'mine' : '', accord ? (g.war.accordBroken ? 'accord broken' : 'accord') : ''].join(' ');
    const label = i === max ? '☠' : max > 24 && i % 5 && i !== g.flood ? '' : i; // long tracks: every 5th number
    cells.push(`<div class="fcell ${cls}" ${accord ? 'title="Climate Accord line"' : ''}><span>${label}</span></div>`);
  }
  const safe = me.protection >= g.flood;
  const seawall = g.settings.base;
  const toNext = seawall.seawallPerStep - (g.seawall % seawall.seawallPerStep);
  const capped = g.seawallBonus >= seawall.seawallMaxSteps;
  return `<h2>Flood</h2>
    <div class="flood-track ${max > 14 ? 'dense' : ''}" role="img" aria-label="Flood ${g.flood}, catastrophe at ${max}">${cells.join('')}</div>
    <div class="flood-key">
      <span><i class="k filled"></i>Flood ${g.flood}</span>
      <span><i class="k cata"></i>Catastrophe at ${max}${g.seawallBonus ? ` (incl. +${g.seawallBonus} seawall)` : ''}</span>
      <span><i class="k mine"></i>Your protection ${me.protection}</span>
      ${g.war && !g.war.noAccord ? `<span><i class="k accord"></i>Accord line ${g.war.accordLine}</span>` : ''}
    </div>
    ${accordCard(g)}
    ${g.factories ? `<p class="small">Factories each round: 🏭 Flood +${g.factories.effect.up}, 🌿 Flood −${g.factories.effect.down} (every ${g.settings.base.factoryGreenPer} sustainable factories on the board, everyone's together).</p>` : ''}
    <p class="${safe ? 'ok' : 'warn'} small">${safe ? `✔ Your home is safe at Flood ${g.flood}.` : `✖ Your home would flood at Flood ${g.flood}. You need ${g.flood - me.protection} more protection.`}
    Seawall: ${g.seawall} donated${capped ? ' (bonus maxed)' : `, ${toNext} more for +1`}.</p>`;
}

// ------------------------------------------------------------------ phase-specific panel
function phasePanel(store) {
  const g = store.data.game;
  const me = g.players[g.you];
  if (BUILD.includes(g.phase)) {
    const title = g.war ? (g.phase === 'talk' ? '2. Talk & build' : '6. Trade & build again') : g.phase === 'talk' ? '1. Talk & build' : '5. Trade & build again';
    const next = g.phase === 'talk' ? 'When everyone is Ready, you choose actions secretly.' : 'When everyone is Ready, the round ends and the starting player moves clockwise.';
    return `<div class="card phase-card">
      <h2>${title}</h2>
      <p class="hint">Trade, give, build walls${g.factories ? ' and factories' : ''}, use the market, donate to the seawall${g.tw ? ', research, recruit and upgrade troops' : g.war ? ', recruit militia' : ''}${g.mode === 'empire' ? ', command your puppets' : ''}. ${next}</p>
      <p class="small">${me.ready ? '✔ You are Ready — tap the green button below to undo.' : 'When you are done, press <b>End turn</b> at the bottom right.'}</p>
      ${lastReveal(g)}
    </div>`;
  }
  if (g.phase === 'choose') return g.war ? warChoosePanel(store, { choiceLabel, capped, actionCard: makeCard(store.ui.choice) }) : choosePanel(store);
  if (g.phase === 'loot') return lootPanel(store);
  if (g.phase === 'battle') return battlePanel(store);
  return '';
}

function lastReveal(g) {
  if (g.phase !== 'trade') return '';
  const items = g.players.filter((p) => p.choice).map((p) => `<li>${chip(p.seat, p.name)} ${choiceLabel(g, p.choice)}</li>`);
  return items.length ? `<h3>This round's actions</h3><ul class="reveal-list">${items.join('')}</ul>` : '';
}

function makeCard(c) {
  return (action, title, desc, flood, disabled = false, why = '') =>
    `<button class="action-card ${action} ${c.action === action ? 'selected' : ''}" data-act="pickAction" data-value="${action}" ${disabled ? 'disabled' : ''} aria-pressed="${c.action === action}">
      <b>${title}</b><span>${desc}</span><em>${flood}</em>${why ? `<small>${why}</small>` : ''}</button>`;
}

function choiceLabel(g, c) {
  if (!c) return '';
  if (c.action === 'attack') return `<span class="act raid">Attack → ${esc(tileLabel(g, c.target))}</span>`;
  if (c.action === 'revolt') return `<span class="act unsus">Revolt!</span>`;
  if (c.action === 'raid') return `<span class="act raid">Raid → ${esc(g.players[c.target].name)}</span>`;
  if (c.action === 'claim') return `<span class="act raid">Claim → ${esc(c.target)}</span>`;
  if (c.action === 'unsustainable') return `<span class="act unsus">Unsustainable</span>`;
  return `<span class="act sus">Sustainable</span>`;
}

function choosePanel(store) {
  const g = store.data.game;
  const me = g.players[g.you];
  const c = store.ui.choice;
  const b = g.settings.base;
  const homeRes = BIOME[me.biome].res;

  if (me.choice && !c.editing) {
    const ch = me.choice;
    const detail =
      ch.action === 'claim' ? `(${esc(tileLabel(g, ch.target))})` :
      ch.action === 'raid' ? `on ${esc(g.players[ch.target].name)}` : ch.mix ? `(${bagText(ch.mix)})` : `(${b.sustainableCollect} ${homeRes === 'sandbag' ? 'sandbags' : homeRes})`;
    return `<div class="card phase-card">
      <h2>2. Choose secretly</h2>
      <p class="locked">🔒 Locked in: ${choiceLabel(g, ch)} ${detail}</p>
      <p class="hint">Waiting for the others. You can change your mind until the last player locks in.</p>
      <button class="btn" data-act="set" data-path="choice.editing" data-json="true">Change my action</button>
    </div>`;
  }

  const card = makeCard(c);

  const susDesc = homeRes ? `Collect ${b.sustainableCollect} ${homeRes === 'sandbag' ? 'sandbags' : homeRes}` : `Collect any ${b.sustainableCollect}`;
  const noWood = me.materials.wood < b.raidCostWood;
  const L = g.limits || { protectedSeats: {} };
  let extra = '';
  let canLock = false;
  if (c.action === 'sustainable' && !homeRes) {
    const n = bagTotal(c.mix);
    extra = `<h3>Pick ${b.sustainableCollect} materials (${n}/${b.sustainableCollect})</h3>${bagEditor('choice.mix', c.mix, capped(c.mix, b.sustainableCollect))}`;
    canLock = n === b.sustainableCollect;
  } else if (c.action === 'sustainable') {
    canLock = true;
  } else if (c.action === 'unsustainable') {
    const n = bagTotal(c.mix);
    extra = `<h3>Pick ${b.unsustainableCollect} materials (${n}/${b.unsustainableCollect})</h3>${bagEditor('choice.mix', c.mix, capped(c.mix, b.unsustainableCollect))}`;
    canLock = n === b.unsustainableCollect;
  } else if (c.action === 'claim') {
    const F = g.factories;
    extra = `<h3>Claim which factory?</h3>${
      F.claimTargets.length
        ? `<div class="target-list">${F.claimTargets
            .map((id) => {
              const t = g.board.tiles.find((x) => x.id === id);
              const o = g.players[t.factory.owner];
              const bad = L.protectedSeats[o.seat];
              return `<button class="target ${c.target === id ? 'selected' : ''}" data-act="set" data-path="choice.target" data-value="${id}" aria-pressed="${c.target === id}" ${bad ? 'disabled' : ''}>${chip(o.seat, o.name)} <span>${t.factory.kind === 'sustainable' ? '🌿' : '🏭'} ${esc(id)}</span><small>${BIOME[t.biome].label}${bad ? ' · 📜 treaty' : myPactWith(g, o.seat) ? ' · ⚠ breaks your pact' : ''}</small></button>`;
            })
            .join('')}</div>`
        : '<p class="muted">No factories you can claim (factories on home tiles are safe).</p>'
    }
      <p class="hint">You pay ${b.claimCostWood} wood. You and the owner each roll a die — higher wins, ties go to the owner. Win: the factory becomes yours. You can also tap a factory on the map.</p>`;
    canLock = c.target != null;
  } else if (c.action === 'raid') {
    extra = `<h3>Raid whom?</h3><div class="target-list">${g.players
      .filter((p) => p.seat !== g.you)
      .map(
        (p) =>
          `<button class="target ${c.target === p.seat ? 'selected' : ''}" data-act="set" data-path="choice.target" data-json="${p.seat}" aria-pressed="${c.target === p.seat}" ${L.protectedSeats[p.seat] ? 'disabled' : ''}>${chip(p.seat, p.name)}<small>${p.materials ? bagInline(p.materials) : plural(p.materialTotal, 'material')}${L.protectedSeats[p.seat] ? ' · 📜 treaty' : myPactWith(g, p.seat) ? ' · ⚠ breaks your pact' : ''}</small></button>`,
      )
      .join('')}</div>
      <p class="hint">At resolution you pay ${b.raidCostWood} wood; they pay ${b.raidDefenceWood} wood to defend if they can. You must roll strictly higher. Win: take up to ${b.raidMaxLoot} tokens.</p>`;
    canLock = c.target != null;
  }

  return `<div class="card phase-card">
    <h2>2. Choose secretly</h2>
    <p class="hint">Nobody can see your choice until everyone has chosen.</p>
    ${limitsNote(g)}
    <div class="action-cards">
      ${card('sustainable', 'Sustainable', susDesc, 'No Flood change')}
      ${card('unsustainable', 'Unsustainable', `Collect any ${b.unsustainableCollect}`, `Flood +${b.unsustainableFlood}`, !!L.noUnsustainable, L.noUnsustainable ? '📜 Treaty forbids' : '')}
      ${
        g.factories
          ? card('claim', 'Claim a factory', "Roll for another player's factory", 'No Flood change', me.materials.wood < b.claimCostWood || !!L.noAttacks || !g.factories.claimTargets.length, L.noAttacks ? '📜 Treaty forbids' : me.materials.wood < b.claimCostWood ? `Needs ${b.claimCostWood} wood` : !g.factories.claimTargets.length ? 'No factories to claim' : '')
          : card('raid', 'Raid', 'Steal from a player', 'No Flood change', noWood || !!L.noAttacks, L.noAttacks ? '📜 Treaty forbids' : noWood ? `Needs ${b.raidCostWood} wood` : '')
      }
    </div>
    ${extra}
    ${c.action ? `<button class="btn primary big" data-act="lockIn" ${canLock ? '' : 'disabled'}>Lock in ${c.action === 'raid' ? 'raid' : c.action === 'claim' ? 'claim' : c.action}</button>` : ''}
    ${me.choice ? `<button class="btn link" data-act="set" data-path="choice.editing" data-json="false">Keep my current choice</button>` : ''}
  </div>`;
}

function secondsLeft(store) {
  return store.lootDeadline ? `${Math.max(0, Math.ceil((store.lootDeadline - Date.now()) / 1000))}s` : '';
}

/** Per-material limits so the total can't go above `total` (and not above `have`). */
function capped(bag, total, have = null) {
  const left = total - bagTotal(bag);
  const out = {};
  for (const m of MATS) out[m] = Math.min(have ? have[m] : Infinity, bag[m] + left);
  return out;
}

function lootPanel(store) {
  const g = store.data.game;
  const L = g.pendingLoot;
  const raider = g.players[L.raider];
  const target = g.players[L.target];
  if (L.raider !== g.you) {
    return `<div class="card phase-card"><h2>4. Resolve raids</h2>
      <p>${chip(raider.seat, raider.name)} won a raid on ${chip(target.seat, target.name)} and is choosing ${L.count} tokens… <span class="countdown">${secondsLeft(store)}</span></p></div>`;
  }
  const loot = store.ui.loot;
  const n = bagTotal(loot);
  const theirs = target.materials || { wood: 99, stone: 99, sandbag: 99 };
  const limit = capped(loot, L.count, theirs);
  return `<div class="card phase-card loot">
    <h2>You won the raid!</h2>
    <p>Pick ${L.count} tokens to take from ${chip(target.seat, target.name)}. They have ${target.materials ? bagInline(target.materials) : plural(target.materialTotal, 'material')}.</p>
    <p class="hint">Time left: <b class="countdown">${secondsLeft(store)}</b> — after that, tokens are picked at random.</p>
    ${bagEditor('loot', loot, limit)}
    <button class="btn primary big" data-act="pickLoot" ${n === L.count ? '' : 'disabled'}>Take ${n}/${L.count}</button>
  </div>`;
}

// ------------------------------------------------------------------ my panel
function myPanel(store) {
  const g = store.data.game;
  const me = g.players[g.you];
  const b = g.settings.base;
  const canBuild = BUILD.includes(g.phase) && !store.data.paused;
  const cost = { wood: b.wallCostWood, stone: b.wallCostStone, sandbag: b.wallCostSandbag };
  const affordable = Math.min(...MATS.map((m) => (cost[m] ? Math.floor(me.materials[m] / cost[m]) : Infinity)));
  const walls = Math.min(store.ui.walls, Math.max(1, affordable));
  const mk = store.ui.market;
  const marketMax = Math.max(1, Math.floor(me.materials[mk.give] / b.marketGive));
  const donateTotal = bagTotal(store.ui.donate);
  const biome = BIOME[me.biome];

  return `<div class="card my-panel">
    <h2>${chip(me.seat, me.name)} <span class="muted small">${biome.glyph} ${biome.label} home${biome.res ? ` — collects ${biome.res === 'sandbag' ? 'sandbags' : biome.res}` : ' — collects any'}</span></h2>
    <div class="walls-line">🧱 <b>${me.walls}</b> wall${me.walls === 1 ? '' : 's'} = <b>${me.protection}</b> protection · Seawall donated: ${me.donated}</div>
    ${g.war ? `<div class="row wrap small">${warTags(g, me)}</div>` : ''}
    ${warMyPanel(store)}
    ${factoryPanel(store, canBuild)}

    <details class="tool" ${canBuild ? 'open' : ''}>
      <summary>Build walls <span class="muted small">(${bagText(cost)} each)</span></summary>
      <div class="row wrap">
        ${stepper('walls', walls, { min: 1, max: Math.max(1, affordable), label: 'Walls to build' })}
        <button class="btn primary" data-act="buildWall" ${canBuild && affordable >= 1 ? '' : 'disabled'}>Build ${walls} wall${walls === 1 ? '' : 's'}</button>
        ${affordable < 1 ? '<span class="muted small">Not enough materials yet.</span>' : ''}
      </div>
    </details>

    <details class="tool">
      <summary>Market <span class="muted small">(${b.marketGive} of one → ${b.marketGet} of another)</span></summary>
      <div class="market">
        <div><span class="small muted">Give ${b.marketGive * Math.min(mk.times, marketMax)}</span>${matPicker('market.give', mk.give)}</div>
        <div><span class="small muted">Get ${b.marketGet * Math.min(mk.times, marketMax)}</span>${matPicker('market.get', mk.get)}</div>
        <div class="row">${stepper('market.times', Math.min(mk.times, marketMax), { min: 1, max: marketMax, label: 'Times' })}<span class="small muted">times</span></div>
        <button class="btn" data-act="market" ${canBuild && !me.sanctioned && mk.give !== mk.get && me.materials[mk.give] >= b.marketGive ? '' : 'disabled'}>Trade at market</button>
      </div>
    </details>

    <details class="tool">
      <summary>Village seawall <span class="muted small">(${b.seawallPerStep} donated = +1 threshold, max +${b.seawallMaxSteps}; ${b.seawallPointsPerMaterial} pt each)</span></summary>
      ${bagEditor('donate', store.ui.donate, me.materials)}
      ${(() => {
        const pay = payLargest(me.materials, Math.min(b.seawallPerStep, bagTotal(me.materials)));
        return `<div class="row wrap">${pay && bagTotal(pay) ? `<button class="btn small" data-act="set" data-path="donate" data-json="${esc(JSON.stringify(pay))}">⚡ Auto-fill ${bagTotal(pay)}</button>` : ''}<button class="btn small" data-act="set" data-path="donate" data-json="{&quot;wood&quot;:0,&quot;stone&quot;:0,&quot;sandbag&quot;:0}">Clear</button></div>`;
      })()}
      <button class="btn" data-act="donate" ${canBuild && donateTotal ? '' : 'disabled'}>Donate ${donateTotal || ''}</button>
      <p class="hint">Donated materials are discarded, but each one scores ${b.seawallPointsPerMaterial} point${b.seawallPointsPerMaterial === 1 ? '' : 's'} if your home survives.</p>
    </details>
  </div>`;
}

// ------------------------------------------------------------------ factories (Base)
function factoryPanel(store, canBuild) {
  const g = store.data.game;
  const F = g.factories;
  if (!F) return '';
  const me = g.players[g.you];
  const b = g.settings.base;
  const f = store.ui.factory;
  const cost = (k) => (k === 'sustainable' ? { wood: b.factorySusWood, stone: b.factorySusStone, sandbag: b.factorySusSandbag } : { wood: b.factoryUnsWood, stone: b.factoryUnsStone, sandbag: b.factoryUnsSandbag });
  const can = (k) => MATS.every((m) => me.materials[m] >= cost(k)[m]);
  const myUns = F.mine.filter((x) => x.kind === 'unsustainable').length;
  const unsFull = myUns >= F.unsMax;
  const L = g.limits || {};
  const kindCard = (k) => {
    const sus = k === 'sustainable';
    const off = !sus && (unsFull || L.noUnsustainable);
    return `<button class="action-card ${sus ? 'sustainable' : 'unsustainable'} ${f.kind === k ? 'selected' : ''}" data-act="set" data-path="factory.kind" data-value="${k}" aria-pressed="${f.kind === k}" ${off ? 'disabled' : ''}>
      <b>${sus ? '🌿 Sustainable' : '🏭 Unsustainable'}</b><span>${bagText(cost(k))} · makes ${sus ? b.factorySusMakes : b.factoryUnsMakes}/round</span>
      <em>${sus ? `Every ${b.factoryGreenPer} on the board: Flood −${b.factoryGreenDrop}/round` : `Flood +${b.factoryUnsFlood} every round`}</em>
      ${off ? `<small>${L.noUnsustainable ? '📜 Treaty forbids' : `You have ${F.unsMax} (max)`}</small>` : sus ? '' : `<small>${myUns}/${F.unsMax} used</small>`}</button>`;
  };
  const tileOk = f.tile && F.sites.includes(f.tile);
  const sites = F.sites.length
    ? `<div class="target-list">${F.sites
        .map((id) => `<button class="target ${f.tile === id ? 'selected' : ''}" data-act="set" data-path="factory.tile" data-value="${id}" aria-pressed="${f.tile === id}"><span>${esc(tileLabel(g, id))}</span><small>makes ${BIOME[g.board.tiles.find((t) => t.id === id).biome].res || 'any'}</small></button>`)
        .join('')}</div>`
    : '<p class="muted small">Nowhere to build — every tile next to your land is taken.</p>';
  const mine = F.mine.length
    ? `<ul class="plain">${F.mine
        .map((x) => `<li>${x.kind === 'sustainable' ? '🌿' : '🏭'} ${esc(tileLabel(g, x.tile))} <button class="btn small link" data-act="demolishFactory" data-tile="${x.tile}" ${canBuild ? '' : 'disabled'}>Demolish</button></li>`)
        .join('')}</ul>`
    : '<p class="muted small">You have no factories yet.</p>';
  const e = F.effect;
  return `<details class="tool" ${canBuild ? 'open' : ''}>
      <summary>Factories <span class="muted small">(board: 🌿${F.counts.sustainable} 🏭${F.counts.unsustainable} → Flood ${e.up - e.down > 0 ? '+' : ''}${e.up - e.down} per round)</span></summary>
      <p class="hint">Factories make materials every round and are how you expand: build on your home tile or an empty tile next to your home or your factories. Others can try to claim factories that aren't on a home tile.</p>
      <div class="action-cards two">${kindCard('sustainable')}${kindCard('unsustainable')}</div>
      <h3>Where?</h3>
      ${sites}
      <div class="row wrap">
        <button class="btn" data-act="factoryPickOnBoard">🗺️ Pick on the board</button>
        <button class="btn primary" data-act="buildFactory" ${canBuild && tileOk && can(f.kind) && !(f.kind === 'unsustainable' && unsFull) ? '' : 'disabled'}>Build ${f.kind} factory${tileOk ? ' on ' + esc(f.tile) : ''}</button>
      </div>
      ${can(f.kind) ? '' : `<p class="muted small">Needs ${bagText(cost(f.kind))}.</p>`}
      <h3>Your factories</h3>
      ${mine}
    </details>`;
}

function matPicker(path, value) {
  return `<div class="mat-picker">${MATS.map(
    (m) => `<button class="matbtn ${value === m ? 'selected' : ''}" data-act="set" data-path="${path}" data-value="${m}" aria-pressed="${value === m}" aria-label="${MAT_LABEL[m]}">${matIcon(m, 26)}</button>`,
  ).join('')}</div>`;
}

// ------------------------------------------------------------------ players list
function playerItem(store, p) {
  const d = store.data;
  const g = d.game;
  {
    {
      const member = d.members[p.seat];
      const b = BIOME[p.biome];
      let status = '';
      if (BUILD.includes(g.phase)) status = p.ready ? '<span class="tag ok">Ready ✓</span>' : '<span class="tag">Building…</span>';
      else if (g.phase === 'choose') status = p.hasChosen ? '<span class="tag ok">Chosen ✓</span>' : '<span class="tag">Thinking…</span>';
      const safe = p.protection >= g.flood;
      const skip =
        d.you.isHost && g.waitingFor.includes(p.seat) && p.seat !== g.you
          ? `<button class="btn small" data-act="host" data-op="skip" data-seat="${p.seat}">Skip</button>`
          : '';
      return `<li class="player ${p.seat === g.you ? 'me' : ''}" style="--pc:${PLAYER_STYLE[p.seat].color}">
        <div class="row">
          ${chip(p.seat, p.name)}
          ${g.startingPlayer === p.seat ? '<span class="tag" title="Starting player">★ start</span>' : ''}
          ${member && !member.connected ? '<span class="tag warn">offline</span>' : ''}
          ${member && member.bot ? `<span class="tag bot" title="Computer player">🤖 ${esc(member.bot)}</span>` : ''}
          <span class="grow"></span>${status}${skip}
        </div>
        <div class="row small wrap">
          <span>${b.glyph} ${b.label}</span>
          <span>${p.materials ? bagInline(p.materials, { showZero: true }) : `${plural(p.materialTotal, 'material')}`}</span>
          <span>🧱 ${p.walls} (${p.protection}) <span class="${safe ? 'ok' : 'warn'}">${safe ? 'safe' : 'at risk'}</span></span>
          ${g.phase === 'trade' && p.choice ? choiceLabel(g, p.choice) : ''}
        </div>
        ${g.war ? `<div class="row small wrap">${warTags(g, p)}</div>` : ''}
        ${diploTags(g, p) ? `<div class="row small wrap">${diploTags(g, p)}</div>` : ''}
      </li>`;
    }
  }
}

// ------------------------------------------------------------------ trading
function tradePanel(store) {
  const d = store.data;
  const g = d.game;
  const me = g.players[g.you];
  const t = store.ui.trade;
  const open = BUILD.includes(g.phase) && !d.paused;
  const others = g.players.filter((p) => p.seat !== g.you);
  const target = t.to != null ? g.players[t.to] : null;

  const incoming = g.trades.filter((x) => x.to === g.you);
  const outgoing = g.trades.filter((x) => x.from === g.you);

  const incomingHtml = incoming.length
    ? incoming
        .map((x) => {
          const from = g.players[x.from];
          return `<li class="offer"><div>${chip(from.seat, from.name)} offers <b>${bagInline(x.give)}</b> for your <b>${bagInline(x.get)}</b></div>
            <div class="row"><button class="btn primary small" data-act="acceptTrade" data-id="${x.id}" ${open ? '' : 'disabled'}>Accept</button>
            <button class="btn small" data-act="rejectTrade" data-id="${x.id}">Reject</button></div></li>`;
        })
        .join('')
    : '<li class="muted">No offers for you right now.</li>';
  const outgoingHtml = outgoing.length
    ? outgoing
        .map((x) => {
          const to = g.players[x.to];
          return `<li class="offer"><div>To ${chip(to.seat, to.name)}: your <b>${bagInline(x.give)}</b> for <b>${bagInline(x.get)}</b></div>
            <div class="row"><button class="btn small" data-act="cancelTrade" data-id="${x.id}">Cancel offer</button></div></li>`;
        })
        .join('')
    : '';

  const giveN = bagTotal(t.give);
  const getN = bagTotal(t.get);
  return `<div class="card">
    <h2>Trade offers</h2>
    ${open ? '' : '<p class="warn small">Trading is closed until the next Trade & Build phase.</p>'}
    ${me.sanctioned ? `<p class="warn small">⛔ You are sanctioned until the end of round ${me.sanctionedThrough}: no trading, gifts or market.</p>` : ''}
    ${g.war && others.some((p) => p.sanctioned) ? `<p class="hint">Sanctioned (nobody may trade with them): ${others.filter((p) => p.sanctioned).map((p) => esc(p.name)).join(', ')}.</p>` : ''}
    <ul class="offers">${incomingHtml}</ul>
    ${outgoingHtml ? `<h3>Your open offers</h3><ul class="offers">${outgoingHtml}</ul>` : ''}
  </div>
  <div class="card">
    <h2>Make an offer or give a gift</h2>
    <p class="hint">Trades happen only if they accept. Promises are not binding — the game never enforces them.</p>
    <div class="target-list">${others
      .map((p) => `<button class="target ${t.to === p.seat ? 'selected' : ''}" data-act="set" data-path="trade.to" data-json="${p.seat}" aria-pressed="${t.to === p.seat}">${chip(p.seat, p.name)}</button>`)
      .join('')}</div>
    <div class="trade-sides">
      <div><h3>You give</h3>${bagEditor('trade.give', t.give, me.materials)}</div>
      <div><h3>You get</h3>${bagEditor('trade.get', t.get, target && target.materials ? target.materials : null, 20)}</div>
    </div>
    <div class="row wrap">
      <button class="btn primary" data-act="proposeTrade" ${open && target && giveN && getN ? '' : 'disabled'}>Send trade offer</button>
      <button class="btn" data-act="gift" ${open && target && giveN && !getN ? '' : 'disabled'} title="Set 'You get' to nothing to give a gift">Give as gift</button>
    </div>
    ${target ? '' : '<p class="hint">Pick a player first.</p>'}
  </div>`;
}
