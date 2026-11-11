// Main game screen: phase bar, Flood track, my panel, players, trading, log.
// On phones one tab is shown at a time; on wide screens everything is visible.
import { esc, chip, swatch, matIcon, bagInline, bagText, bagTotal, bagEditor, stepper, MATS, MAT_LABEL, BIOME, PHASE_LABEL, PLAYER_STYLE, plural } from './ui.js';
import { renderBoard } from './board.js';
import { renderLog, renderChat } from './log.js';
import { accordPill, accordCard, warTags, warMyPanel, warChoosePanel, tileLabel } from './war-ui.js';
export { tileLabel };
import { diplomacyPanel, diploTags, limitsNote, myPactWith } from './diplomacy-ui.js';
import { battlePanel } from './battle-ui.js';

const BUILD = ['talk', 'trade'];
const j = (o) => esc(JSON.stringify(o));

export function renderGame(store) {
  const d = store.data;
  const g = d.game;
  const me = g.players[g.you];
  const tab = store.ui.tab;
  const incoming = g.trades.filter((t) => t.to === g.you).length + (g.pacts || []).filter((p) => p.status === 'proposed' && p.b === g.you).length + (g.treaties || []).filter((t) => t.invited.includes(g.you) && ![...t.signed, ...t.declined, ...t.broken].includes(g.you)).length;

  return `
  ${topBar(store)}
  ${d.paused ? '<div class="banner paused">⏸ The host has paused the game.</div>' : ''}
  ${floodBanner(g)}
  <main class="game-grid tab-${tab}">
    <section class="col col-board" data-tab="board">
      <div class="card board-card">${renderBoard(g, boardOptions(store))}</div>
      <div class="card"><h2>Players</h2>${playersList(store)}</div>
    </section>
    <section class="col col-play" data-tab="play">
      <div class="card">${floodTrack(g, me)}</div>
      ${phasePanel(store)}
      ${myPanel(store)}
    </section>
    <section class="col col-trade" data-tab="trade">
      ${tradePanel(store)}
      ${diplomacyPanel(store)}
    </section>
    <section class="col col-log" data-tab="log">
      <div class="card"><h2>Chat</h2>${renderChat(store)}</div>
      <div class="card"><h2>Event log</h2>${renderLog(g)}</div>
    </section>
  </main>
  <nav class="tabbar" aria-label="Sections">
    ${tabButton('play', 'Play', '🎲', tab)}
    ${tabButton('board', 'Board', '🗺️', tab)}
    ${tabButton('trade', 'Trade', '🤝', tab, incoming)}
    ${tabButton('log', 'Log & chat', '💬', tab, store.unreadChat)}
  </nav>`;
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

function tabButton(id, label, icon, current, badge = 0) {
  return `<button class="tabbtn ${current === id ? 'active' : ''}" data-act="tab" data-tab="${id}" aria-pressed="${current === id}">
    <span aria-hidden="true">${icon}</span>${label}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
}

// ------------------------------------------------------------------ top bar
function topBar(store) {
  const d = store.data;
  const g = d.game;
  const rounds = g.mode === 'base' ? g.settings.base.rounds : g.settings.war.rounds;
  const waiting = g.waitingFor.map((s) => g.players[s].name);
  const waitText = waiting.length ? (waiting.length === g.players.length ? 'waiting for everyone' : `waiting for: ${waiting.map(esc).join(', ')}`) : '';
  const youWaited = g.waitingFor.includes(g.you);
  return `<header class="topbar">
    <div class="phase-line">
      <span class="round">Round ${g.round} of ${rounds}${g.settings.base.stormEnabled && g.mode === 'base' ? '*' : ''}</span>
      <span class="phase">${PHASE_LABEL[g.phase] || g.phase}</span>
      <span class="flood-pill ${dangerClass(g)}" title="Flood / catastrophe threshold">🌊 ${g.flood}/${g.threshold}</span>
      ${accordPill(g)}
    </div>
    <div class="wait-line ${youWaited ? 'you' : ''}">${youWaited ? '<b>Your move.</b> ' : ''}${waitText}</div>
    <div class="top-actions">
      <span class="muted small">Room ${esc(d.code)}</span>
      ${d.you.isHost ? `<button class="btn small" data-act="toggleHost" aria-expanded="${store.ui.hostOpen}">Host ▾</button>` : ''}
    </div>
    ${d.you.isHost && store.ui.hostOpen ? hostMenu(store) : ''}
  </header>`;
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
      <p class="hint">Trade, give, build walls${g.factories ? ' and factories' : ''}, use the market, donate to the seawall${g.war ? ', recruit militia' : ''}${g.mode === 'empire' ? ', command your puppets' : ''}. ${next}</p>
      ${
        me.ready
          ? `<button class="btn big ready-done" data-act="unready">✔ Ready — tap to undo</button>`
          : `<button class="btn primary big" data-act="ready">I'm ready</button>`
      }
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
      <p class="hint">You pay ${b.claimCostWood} wood. You and the owner each roll a die — higher wins, ties go to the owner. Win: the factory becomes yours. You can also tap an outlined tile on the Board tab.</p>`;
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
    <div class="my-mats">${MATS.map((m) => `<div class="mat-tile">${matIcon(m, 34)}<b>${me.materials[m]}</b><span>${MAT_LABEL[m]}</span></div>`).join('')}</div>
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
function playersList(store) {
  const d = store.data;
  const g = d.game;
  return `<ul class="players">${g.players
    .map((p) => {
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
    })
    .join('')}</ul>`;
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
