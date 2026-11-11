// War + Empire parts of the game screen: units, recruiting, attack targets,
// the Climate Accord, puppets, commands and revolts.
import { esc, chip, bagInline, bagText, bagTotal, bagEditor, stepper, MATS, MAT_LABEL, BIOME } from './ui.js';
import { limitsNote, myPactWith } from './diplomacy-ui.js';

const BUILD = ['talk', 'trade'];
const j = (o) => esc(JSON.stringify(o));

/** "Ben's capital (C1)", "Open Quarry tile (I5) held by Ana" */
export function tileLabel(g, id) {
  const t = g.board.tiles.find((x) => x.id === id);
  if (!t) return id;
  const b = BIOME[t.biome].label;
  const held = t.controller != null && t.controller !== t.owner ? ` — held by ${g.players[t.controller].name}` : '';
  if (t.kind === 'sea') return `Sea bay ${t.id}${t.controller != null ? ' — ' + g.players[t.controller].name + "'s fleet" : ''}`;
  if (t.factory && t.owner == null) return `${b} tile ${t.id} (${g.players[t.factory.owner].name}'s factory)`;
  if (t.owner == null) return `Open ${b} tile (${t.id})${held}`;
  return `${g.players[t.owner].name}'s ${t.role === 'capital' ? 'capital' : b + ' province'} (${t.id})${held}`;
}

export function accordPill(g) {
  if (!g.war || g.war.noAccord) return '';
  return g.war.accordBroken
    ? `<span class="accord-pill broken" title="Climate Accord broken in round ${g.war.accordBrokeRound}">💔 Accord broken</span>`
    : `<span class="accord-pill" title="Climate Accord holds while the Flood is below ${g.war.accordLine}">🤝 Accord &lt;${g.war.accordLine}</span>`;
}

export function accordCard(g) {
  if (g.tw && g.tw.truce)
    return `<p class="accord-note">🕊 <b>Opening truce</b> until the end of round ${g.tw.truce}: nobody can attack another player yet. Claiming empty land is allowed. Use the time to research, recruit and build up.</p>`;
  if (!g.war || g.war.noAccord) return '';
  const w = g.war;
  if (w.accordBroken)
    return `<p class="accord-note broken">💔 <b>The Climate Accord broke in round ${w.accordBrokeRound}.</b> No more sanctions on attackers and no international aid — for the rest of the game.</p>`;
  return `<p class="accord-note">🤝 <b>Climate Accord holds</b> while the Flood is below ${w.accordLine} (${w.accordLine - g.flood} to go). Attackers are sanctioned for a round; Damaged players, players with an occupied tile${
    g.mode === 'empire' ? ' and puppets' : ''
  } get +${g.settings.war.aidAmount} aid when developing.</p>`;
}

/** Small status tags for a player. */
export function warTags(g, p) {
  if (!g.war) return '';
  const tags = [];
  tags.push(`<span class="tag units" title="Militia units">⚔ ${p.units}</span>`);
  if (p.damaged) tags.push('<span class="tag warn" title="Collects 1 less on their next development">🩹 Damaged</span>');
  if (p.sanctioned) tags.push(`<span class="tag warn" title="No trading, gifts or market">⛔ Sanctioned (to rd ${p.sanctionedThrough})</span>`);
  if (p.puppetOf != null) tags.push(`<span class="tag puppet">⛓ Puppet of ${esc(g.players[p.puppetOf].name)}</span>`);
  if (p.puppets && p.puppets.length) tags.push(`<span class="tag overlord">👑 Overlord of ${p.puppets.map((s) => esc(g.players[s].name)).join(', ')}</span>`);
  else if (p.occupier) tags.push('<span class="tag">⚑ Occupying</span>');
  if (p.aidEligible) tags.push('<span class="tag ok" title="Gets international aid when developing">+aid</span>');
  return tags.join(' ');
}

function commandText(g, cmd) {
  if (!cmd) return 'no command (Sustainable)';
  if (cmd.action === 'attack') return `Attack ${tileLabel(g, cmd.target)}`;
  return cmd.action === 'sustainable' ? 'Sustainable' : 'Unsustainable';
}

// ------------------------------------------------------------------ my panel (build phases)
export function warMyPanel(store) {
  store0 = store;
  const d = store.data;
  const g = d.game;
  if (!g.war) return '';
  const me = g.players[g.you];
  const w = g.settings.war;
  const canBuild = BUILD.includes(g.phase) && !d.paused;
  const r = store.ui.recruit;
  if (g.tw) {
    const cur = g.tw.units.find((u) => u.type === r.unit);
    if (!cur || !cur.unlocked) r.unit = 'infantry';
  }
  const unitInfo = g.tw ? g.tw.units.find((u) => u.type === (r.unit || 'infantry')) : null;
  const atSea = unitInfo && unitInfo.domain === 'sea';
  const placeIds = atSea ? g.tw.seas : g.board.tiles.filter((t) => t.kind === 'land' && t.controller === g.you).map((t) => t.id);
  if (g.stationed && !placeIds.includes(r.tile)) r.tile = atSea ? placeIds[0] || null : me.homeTile;
  const unitCost = unitInfo ? unitInfo.cost : w.unitCost;
  const maxUnits = Math.max(1, Math.floor(bagTotal(me.materials) / unitCost));
  const count = Math.min(r.count, maxUnits);
  const need = count * unitCost;
  // Auto-fill: whenever the unit, the number or your stock changes, pay from your
  // biggest piles. You can still change the mix by hand (or Clear it).
  const autoKey = `${r.unit}|${count}|${MATS.map((m) => me.materials[m]).join(',')}`;
  if (r.autoKey !== autoKey) {
    r.autoKey = autoKey;
    const pay = payLargest(me.materials, need);
    if (pay) r.mix = pay;
  }
  const have = bagTotal(r.mix);
  const left = need - have;
  const limit = {};
  for (const m of MATS) limit[m] = Math.min(me.materials[m], r.mix[m] + left);

  const myOccupied = g.board.tiles.filter((t) => t.kind === 'land' && t.controller === g.you && t.owner !== g.you);
  const occHtml = myOccupied.length
    ? `<h3>Tiles you occupy</h3><ul class="plain">${myOccupied
        .map((t) => {
          const planned = me.plans.withdraw.includes(t.id);
          return `<li class="row wrap">${esc(tileLabel(g, t.id))}<span class="grow"></span>
            <button class="btn small ${planned ? 'primary' : ''}" data-act="planWithdraw" data-tile="${t.id}" ${canBuild ? '' : 'disabled'}>${planned ? '✔ Withdrawing at next upkeep' : 'Withdraw at next upkeep'}</button></li>`;
        })
        .join('')}</ul><p class="hint">Occupying any tile costs the village +${w.occupationFlood} Flood every round (once per player, not per tile).</p>`
    : '';

  return `<div class="war-box">
    ${me.puppetOf != null ? puppetBox(store) : ''}
    <div class="row wrap"><span>⚔ <b>${me.units}</b> ${g.tw ? '' : 'militia '}unit${me.units === 1 ? '' : 's'}${g.stationed ? ` — ${unitSpread(g, g.you)}` : ''}</span>
      ${g.tw ? `<span class="small">${troopSummary(g, g.you)}</span>` : ''}
      ${me.production ? `<span class="small">Tile income every round: ${bagInline(me.production.passive)}</span>` : ''}
      <span class="muted small">Upkeep next round: ${me.upkeepDue} material${me.upkeepDue === 1 ? '' : 's'}${me.garrisonDue ? ` + garrison ${me.garrisonDue}` : ''}</span>
      ${w.armyFloodPerUnits > 0 ? `<span class="small ${me.armyFloodDue ? 'warn' : 'muted'}">🏭 Army emissions next upkeep: Flood +${me.armyFloodDue} (1 per ${w.armyFloodPerUnits} units)</span>` : ''}</div>
    <details class="tool" ${canBuild ? 'open' : ''}>
      <summary>Recruit ${g.tw ? 'troops' : 'militia'} <span class="muted small">(${g.tw ? 'costs below; upkeep by type' : `${w.unitCost} materials each, any mix; upkeep 1 per ${w.upkeepUnitsPerMaterial} units`}${w.armyFloodPerUnits > 0 ? `; every ${w.armyFloodPerUnits} units add Flood +1 each round` : ''})</span></summary>
      ${g.tw ? unitPicker(g, r.unit || 'infantry') : ''}
      <div class="row wrap">${stepper('recruit.count', count, { min: 1, max: maxUnits, label: 'Units' })}<span class="small muted">unit${count === 1 ? '' : 's'} — pay ${need}:</span></div>
      ${bagEditor('recruit.mix', r.mix, limit)}
      <div class="row wrap"><button class="btn small" data-act="set" data-path="recruit.autoKey" data-json="null">⚡ Auto-fill</button><button class="btn small" data-act="set" data-path="recruit.mix" data-json="{&quot;wood&quot;:0,&quot;stone&quot;:0,&quot;sandbag&quot;:0}">Clear</button></div>
      ${g.stationed ? (placeIds.length ? `<label class="inline">${atSea ? 'Launch into' : 'Place on'} ${tileSelect('recruit.tile', placeIds, r.tile, g)}</label>` : '<p class="warn small">No sea bay next to your coast is free for new ships.</p>') : ''}
      <button class="btn primary" data-act="recruit" ${canBuild && have === need && (!g.stationed || placeIds.length) ? '' : 'disabled'}>Recruit ${count} ${g.tw ? esc(unitInfo.name.toLowerCase()) : ''} (${have}/${need})</button>
    </details>
    ${g.tw ? researchPanel(store, canBuild) + upgradePanel(store, canBuild) : ''}
    ${g.stationed ? movePanel(store, canBuild) : ''}
    ${occHtml}
    ${overlordBox(store)}
  </div>`;
}

function puppetBox(store) {
  const g = store.data.game;
  const me = g.players[g.you];
  const o = g.players[me.puppetOf];
  const oMats = o.materials ? o.materials.wood + o.materials.stone + o.materials.sandbag : o.materialTotal;
  const due = (o.upkeepDue || 0) + (o.garrisonDue || 0);
  const garrison = `<p class="small">At the start of next round ${esc(o.name)} must pay a <b>${o.garrisonDue}-material garrison</b> to keep you (after ${o.upkeepDue} for militia upkeep). ${esc(o.name)} has ${oMats} material${oMats === 1 ? '' : 's'} now${oMats < due ? ' — <b class="ok">not enough: you will go free unless they get more!</b>' : '.'}</p>`;
  return `<div class="puppet-box">⛓ <b>You are ${esc(o.name)}'s puppet.</b> Command: <b>${esc(commandText(g, me.effectiveCommand))}</b>.
    ${garrison}
    <p class="hint">You pay half of everything you collect as tribute (rounded up). Each round you must play the command — or revolt: attack ${esc(o.name)}'s capital (ties go to you, ${esc(o.name)} defends alone, never sanctioned). You can still survive and win.</p></div>`;
}

function overlordBox(store) {
  const d = store.data;
  const g = d.game;
  const me = g.players[g.you];
  if (!me.puppets || !me.puppets.length) return '';
  const canBuild = BUILD.includes(g.phase) && !d.paused;
  const cmdFor = store.ui.cmdAttackFor;
  return `<h3>Your puppets</h3><ul class="plain">${me.puppets
    .map((s) => {
      const q = g.players[s];
      const releasing = me.plans.release.includes(s);
      const targets = g.commandTargets[s] || [];
      const picking = cmdFor === s;
      return `<li class="puppet-row">
        <div class="row wrap">${chip(s, q.name)} <span class="small">⚔ ${q.units}</span><span class="grow"></span>
          <span class="small">Command: <b>${esc(commandText(g, q.command))}</b></span></div>
        <div class="row wrap">
          <button class="btn small" data-act="setCommand" data-puppet="${s}" data-action="sustainable" ${canBuild ? '' : 'disabled'}>Sustainable</button>
          <button class="btn small" data-act="setCommand" data-puppet="${s}" data-action="unsustainable" ${canBuild ? '' : 'disabled'}>Unsustainable</button>
          <button class="btn small ${picking ? 'primary' : ''}" data-act="set" data-path="cmdAttackFor" data-json="${picking ? 'null' : s}" ${canBuild && q.units > 0 && targets.length ? '' : 'disabled'}>Attack…</button>
          <button class="btn small ${releasing ? 'primary' : ''}" data-act="planRelease" data-puppet="${s}" ${canBuild ? '' : 'disabled'}>${releasing ? '✔ Freeing at upkeep' : 'Free at upkeep'}</button>
        </div>
        ${
          picking
            ? `<div class="target-list">${targets
                .map((id) => `<button class="target" data-act="setCommand" data-puppet="${s}" data-action="attack" data-target="${id}">${esc(tileLabel(g, id))}</button>`)
                .join('')}</div><p class="hint">Spoils and the tile go to you. Commands are public.</p>`
            : ''
        }
      </li>`;
    })
    .join('')}</ul><p class="hint">Garrison next upkeep: ${me.garrisonDue} materials. Unpaid puppets are freed (most recent first). Holding any puppet counts as occupying (+1 Flood a round). You may add puppets' units to your attack and defence dice.</p>`;
}

// ------------------------------------------------------------------ stationed units

/** Units a player has on a tile. */
export function unitsOn(t, seat) {
  return (t.units && t.units[seat]) || 0;
}

/** "C0 ×2, I0 ×1" */
function unitSpread(g, seat) {
  const parts = g.board.tiles.filter((t) => unitsOn(t, seat) > 0).map((t) => `${t.id} ×${unitsOn(t, seat)}`);
  return parts.length ? parts.join(', ') : 'none placed';
}

function tileSelect(path, ids, value, g) {
  return `<select data-model="${path}">${ids.map((id) => `<option value="${id}" ${id === value ? 'selected' : ''}>${esc(tileLabel(g, id))}</option>`).join('')}</select>`;
}

/** Move units between your tiles (like Risk's fortify), during Talk & Build. */
function movePanel(store, canBuild) {
  const g = store.data.game;
  const mv = store.ui.move;
  const sources = g.board.tiles.filter((t) => unitsOn(t, g.you) > 0).map((t) => t.id);
  if (!sources.length) return '';
  const from = sources.includes(mv.from) ? mv.from : sources[0];
  const fromSea = g.board.tiles.find((t) => t.id === from).kind === 'sea';
  const dests = (fromSea ? g.seaTiles || [] : g.standTiles || []).filter((id) => id !== from);
  const to = dests.includes(mv.to) ? mv.to : dests[0];
  const max = unitsOn(g.board.tiles.find((t) => t.id === from), g.you);
  const count = Math.min(Math.max(1, mv.count), max);
  mv.from = from;
  mv.to = to;
  mv.count = count;
  return `<details class="tool" ${canBuild ? 'open' : ''}>
    <summary>Move units <span class="muted small">(through your own tiles, as often as you like${g.tw ? '; ships sail between sea bays' : ''})</span></summary>
    <div class="move-grid">
      <label>From ${tileSelect('move.from', sources, from, g)}</label>
      <label>To ${dests.length ? tileSelect('move.to', dests, to, g) : '<span class="muted">nowhere else</span>'}</label>
      ${g.tw ? troopSteppers('move.troops', mv.troops, troopsOn(g, from)) : `<div class="row">${stepper('move.count', count, { min: 1, max, label: 'Units to move' })}<span class="small muted">of ${max}</span></div>`}
      <button class="btn" data-act="moveUnits" ${canBuild && dests.length && (!g.tw || troopCount(mv.troops)) ? '' : 'disabled'}>Move ${g.tw ? troopCount(mv.troops) : count}</button>
    </div>
    <p class="hint">Only units on a tile defend it. An empty tile is lost to any attack.</p>
  </details>`;
}

/** "Attack from" picker: which of your tiles, and how many units. */
function sourcePicker(store, sources) {
  const g = store.data.game;
  const c = store.ui.choice;
  if (!sources || !sources.length) return { html: '<p class="warn small">None of your units are next to that tile. Move some there during Talk & Build.</p>', ok: false };
  if (!sources.some((x) => x.tile === c.from)) {
    const best = sources.reduce((a, b) => (b.units > a.units ? b : a));
    c.from = best.tile;
    c.count = best.units;
  }
  const max = sources.find((x) => x.tile === c.from).units;
  c.count = Math.min(Math.max(1, c.count || max), max);
  if (g.tw) {
    const have = troopsOn(g, c.from);
    if (!c.troops || c.troopsFrom !== c.from) {
      c.troops = { ...have }; // default: send everyone
      c.troopsFrom = c.from;
    }
    const T = g.board.tiles.find((x) => x.id === c.target);
    const seaFight = T && T.kind === 'sea';
    for (const u of g.tw.units) c.troops[u.type] = (u.domain === 'sea') === seaFight ? Math.min(c.troops[u.type] || 0, have[u.type] || 0) : 0;
  }
  const html = `<h3>Attack from</h3><div class="target-list">${sources
    .map(
      (x) =>
        `<button class="target ${c.from === x.tile ? 'selected' : ''}" data-act="set" data-path="choice.from" data-value="${x.tile}" aria-pressed="${c.from === x.tile}"><span>${esc(tileLabel(g, x.tile))}</span><small>⚔ ${x.units} there${x.amphibious ? ' · 🚢 lands by sea' : ''}</small></button>`,
    )
    .join('')}</div>
    ${g.tw ? `<h3>Send</h3>${troopSteppers('choice.troops', c.troops, sendable(g, c.from, c.target))}` : ''}
    <div class="row wrap" ${g.tw ? 'hidden' : ''}>${stepper('choice.count', c.count, { min: 1, max, label: 'Units to send' })}<span class="small">unit${c.count === 1 ? '' : 's'} sent (${Math.min(c.count, g.settings.war.maxAttackDice)} di${Math.min(c.count, g.settings.war.maxAttackDice) === 1 ? "e" : "ce"}) — ${max - c.count} stay${max - c.count === 1 ? 's' : ''} behind</span></div>
    <p class="hint">If you win, the surviving attackers move into the captured province. If you lose, survivors come back.</p>`;
  return { html, ok: g.tw ? troopCount(c.troops) > 0 : true };
}

// ------------------------------------------------------------------ Total War helpers
// Unit types, names and shapes come from the server (engine/arsenal.js) in g.tw.units.
const FALLBACK = ['militia', 'infantry', 'cavalry'];
const typesOf = (g) => (g.tw ? g.tw.units.map((u) => u.type) : FALLBACK);
const unitOf = (g, k) => (g.tw && g.tw.units.find((u) => u.type === k)) || { type: k, name: k, shape: '●', domain: 'land' };
export function troopsOn(g, tileId) {
  const t = g.board.tiles.find((x) => x.id === tileId);
  const n = (t && t.units && t.units[g.you]) || 0;
  const tr = (t && t.troops && t.troops[g.you]) || {};
  const out = Object.fromEntries(typesOf(g).map((k) => [k, tr[k] || 0]));
  if (troopCount(out) !== n) return { ...Object.fromEntries(typesOf(g).map((k) => [k, 0])), militia: n };
  return out;
}
const troopCount = (c) => (c ? Object.values(c).reduce((a, n) => a + (n || 0), 0) : 0);
/** Troops on a tile that can join an attack on `target` (ships only at sea; no ships ashore). */
function sendable(g, from, target) {
  const have = troopsOn(g, from);
  const T = g.board.tiles.find((x) => x.id === target);
  const sea = T && T.kind === 'sea';
  for (const k of Object.keys(have)) if ((unitOf(g, k).domain === 'sea') !== sea) have[k] = 0;
  return have;
}
function troopSummary(g, seat) {
  const tot = {};
  for (const t of g.board.tiles) {
    const tr = (t.troops && t.troops[seat]) || {};
    for (const [k, n] of Object.entries(tr)) tot[k] = (tot[k] || 0) + n;
  }
  const parts = Object.entries(tot)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${unitOf(g, k).shape} ${n} ${unitOf(g, k).name.toLowerCase()}`);
  return parts.length ? parts.join(' · ') : '';
}
function troopSteppers(path, c, have) {
  c = c || {};
  return `<div class="bag-editor">${Object.keys(have)
    .filter((k) => have[k] > 0)
    .map((k) => {
      const u = unitOf(store0.data.game, k);
      return `<div class="bag-row"><span class="unit-shape">${u.shape}</span><span class="bag-name">${esc(u.name)} <small class="muted">(${have[k]} here)</small></span>${stepper(`${path}.${k}`, Math.min(c[k] || 0, have[k]), { max: have[k], label: u.name })}</div>`;
    })
    .join('')}</div>`;
}
let store0 = null; // set by warMyPanel / warChoosePanel so helpers can read unit names
const DOMAIN_TITLE = { land: 'Land', air: 'Air', sea: 'Sea' };
function unitPicker(g, current) {
  const techName = (id) => (g.tw.techs.find((t) => t.id === id) || { name: id }).name;
  const groups = ['land', 'air', 'sea'].map((dom) => {
    const cards = g.tw.units
      .filter((u) => u.domain === dom)
      .map(
        (u) => `<button class="unit-card ${u.type === current ? 'selected' : ''} ${u.unlocked ? '' : 'locked'}" data-act="set" data-path="recruit.unit" data-value="${u.type}" aria-pressed="${u.type === current}" ${u.unlocked ? '' : 'disabled'}>
        <b>${u.shape} ${esc(u.name)}</b>
        <span>${u.unlocked ? `${u.cost} materials · upkeep ${u.upkeep}` : `🔒 Research ${esc(techName(u.tech))}`}</span>
        <small>HP ${u.hp} · dmg ${u.attack}/s · speed ${u.speed}${u.range ? ` · range ${u.range}` : ''}</small>
      </button>`,
      )
      .join('');
    return `<h4 class="unit-domain">${DOMAIN_TITLE[dom]}</h4><div class="unit-picker">${cards}</div>`;
  });
  return `${groups.join('')}<p class="hint">Tanks shrug off rifles; anti-tank guns shred tanks. Only anti-air and aircraft can hit planes. Artillery, anti-air, cruisers and battleships fire at range. Cavalry rides down militia and encircled infantry. Ships hold sea bays, shell coastal battles and carry your troops across.</p>`;
}

/** Pay n materials from the biggest piles (research and upgrades). */
export function payLargest(mats, n) {
  const pool = { ...mats };
  const out = { wood: 0, stone: 0, sandbag: 0 };
  for (let i = 0; i < n; i++) {
    const m = MATS.reduce((a, x) => (pool[x] > pool[a] ? x : a), MATS[0]);
    if (pool[m] <= 0) return null;
    pool[m]--;
    out[m]++;
  }
  return out;
}

/** The research tree: one project at a time, ready next round. */
function researchPanel(store, canBuild) {
  const g = store.data.game;
  const me = g.players[g.you];
  const r = me.research || { done: [], current: null };
  const total = bagTotal(me.materials);
  const rows = g.tw.techs.map((t) => {
    const done = r.done.includes(t.id);
    const now = r.current === t.id;
    const ready = t.needs.every((x) => r.done.includes(x));
    const pay = payLargest(me.materials, t.cost);
    let right;
    if (done) right = '<span class="tag ok">✔ done</span>';
    else if (now) right = '<span class="tag">🔬 ready next round</span>';
    else if (!ready) right = `<span class="muted small">needs ${t.needs.map((x) => esc(g.tw.techs.find((y) => y.id === x).name)).join(', ')}</span>`;
    else right = `<button class="btn small" data-act="research" data-tech="${t.id}" ${canBuild && !r.current && pay ? '' : 'disabled'} title="Paid from your biggest piles">Research (${t.cost})</button>`;
    const unlocks = t.unlocks.map((k) => `${unitOf(g, k).shape} ${esc(unitOf(g, k).name)}`).join(', ');
    return `<li class="tech ${done ? 'done' : now ? 'now' : ready ? 'ready' : 'locked'}"><div><b>${esc(t.name)}</b> <small class="muted">→ ${unlocks}</small></div>${right}</li>`;
  });
  return `<details class="tool research" ${canBuild && !r.current ? 'open' : ''}>
    <summary>🔬 Research <span class="muted small">(${r.current ? 'researching ' + esc(g.tw.techs.find((t) => t.id === r.current).name) : `${r.done.length}/${g.tw.techs.length} done`}; you have ${total} materials)</span></summary>
    <ul class="tech-list">${rows.join('')}</ul>
    <p class="hint">One project at a time; it is finished at the start of next round. Paid from your biggest piles. Tanks: Artillery → Light → Medium → Heavy. Infantry: Motorised → Mechanised → Aircraft (interceptors and bombers). Militia can become anti-tank or anti-air. Shipyards → Cruisers → Battleships.</p>
  </details>`;
}

/** Upgrade units on one of your tiles along their line, paying the difference. */
function upgradePanel(store, canBuild) {
  const g = store.data.game;
  const me = g.players[g.you];
  const ug = store.ui.upgrade;
  const chain = (to) => {
    const out = [];
    let k = unitOf(g, to).from;
    while (k) {
      out.push(k);
      k = unitOf(g, k).from;
    }
    return out;
  };
  // Every (tile, from -> to) we could do
  const options = [];
  for (const t of g.board.tiles) {
    if (t.controller !== g.you) continue;
    const have = troopsOn(g, t.id);
    for (const to of g.tw.units.filter((u) => u.unlocked && u.from)) for (const from of chain(to.type)) if (have[from] > 0) options.push({ tile: t.id, from, to: to.type, have: have[from] });
  }
  if (!options.length) return '';
  const key = (o) => `${o.tile}|${o.from}|${o.to}`;
  let sel = options.find((o) => key(o) === ug.key) || options[0];
  ug.key = key(sel);
  const each = Math.max(1, unitOf(g, sel.to).cost - unitOf(g, sel.from).cost);
  const count = Math.min(Math.max(1, ug.count || 1), sel.have);
  ug.count = count;
  const pay = payLargest(me.materials, each * count);
  return `<details class="tool">
    <summary>⬆ Upgrade units <span class="muted small">(pay the difference in cost)</span></summary>
    <label class="inline">Upgrade <select data-model="upgrade.key">${options
      .map((o) => `<option value="${key(o)}" ${key(o) === ug.key ? 'selected' : ''}>${esc(o.tile)}: ${esc(unitOf(g, o.from).name)} → ${esc(unitOf(g, o.to).name)} (${o.have} there)</option>`)
      .join('')}</select></label>
    <div class="row wrap">${stepper('upgrade.count', count, { min: 1, max: sel.have, label: 'Units to upgrade' })}<span class="small muted">× ${each} = ${each * count} materials (from your biggest piles)</span></div>
    <button class="btn" data-act="upgradeUnits" ${canBuild && pay ? '' : 'disabled'}>Upgrade ${count}</button>
  </details>`;
}

// ------------------------------------------------------------------ choose panel
function targetNote(g, id) {
  const t = g.board.tiles.find((x) => x.id === id);
  const notes = [];
  const exempt = t.controller == null || t.owner === g.you;
  if (t.kind === 'sea') notes.push(t.controller == null ? 'empty sea bay — sail in' : 'sea bay — naval battle');
  else if (t.controller == null) notes.push('claim — automatic win, no loot');
  else if (t.owner === g.you) notes.push('retake your land — ties go to you');
  else if (t.role === 'capital') notes.push(`capital — defender +${g.settings.war.capitalExtraDefenceDice} die${g.mode === 'empire' ? '; win = they become your puppet' : '; win = loot, no capture'}`);
  else notes.push('province');
  if (g.stationed && t.controller != null) {
    const d = Object.values(t.units || {}).reduce((a, b) => a + b, 0);
    notes.push(d ? `defended by ${d}` : 'undefended!');
  }
  if (!g.war.accordBroken && !exempt) notes.push('⛔ you will be sanctioned');
  if (t.controller != null && myPactWith(g, t.controller)) notes.push(`⚠ breaks your pact with ${g.players[t.controller].name}`);
  if (t.controller != null && g.limits && g.limits.protectedSeats[t.controller]) notes.push('📜 forbidden by your treaty');
  return notes.join(' · ');
}

export function warChoosePanel(store, { choiceLabel, capped, actionCard }) {
  store0 = store;
  const g = store.data.game;
  const me = g.players[g.you];
  const c = store.ui.choice;
  const prod = me.production;
  const w = g.settings.war;
  const puppet = me.puppetOf != null;
  const cmd = puppet ? me.effectiveCommand : null;

  if (me.choice && !c.editing) {
    const ch = me.choice;
    let detail = '';
    if (ch.action === 'attack') detail = `on ${esc(tileLabel(g, ch.target))}${ch.from ? ` from ${ch.from} with ${ch.count}` : ''}`;
    else if (ch.action === 'revolt') detail = `against ${esc(g.players[me.puppetOf].name)}`;
    else if (ch.mix && bagTotal(ch.mix)) detail = `(${bagText(ch.mix)}${ch.action === 'sustainable' && bagTotal(prod.fixed) ? ' + ' + bagText(prod.fixed) : ''})`;
    else if (ch.action === 'sustainable') detail = `(${bagText(prod.fixed)})`;
    return `<div class="card phase-card">
      <h2>3. Choose secretly</h2>
      <p class="locked">🔒 Locked in: ${choiceLabel(g, ch)} ${detail}</p>
      <p class="hint">Waiting for the others. You can change your mind until the last player locks in.</p>
      <button class="btn" data-act="set" data-path="choice.editing" data-json="true">Change my action</button>
    </div>`;
  }

  const pool = me.units + (me.puppets || []).reduce((a, s) => a + g.players[s].units, 0);
  const susDesc = prod.access
    ? `Tiles + any ${prod.free} (${prod.allowed.join('/')})`
    : prod.free
      ? `Tiles + ${prod.free} of your choice`
      : `Tiles + ${bagText(prod.fixed)}`;
  const cards = [];
  if (!puppet || cmd.action === 'sustainable') cards.push(actionCard('sustainable', 'Sustainable', susDesc, 'No Flood change'));
  const L = g.limits || { protectedSeats: {} };
  if (!puppet || cmd.action === 'unsustainable') cards.push(actionCard('unsustainable', 'Unsustainable', `Tiles + any ${prod.unsustainable}`, `Flood +${g.settings.base.unsustainableFlood}`, !!L.noUnsustainable, L.noUnsustainable ? '📜 Treaty forbids' : ''));
  if (!puppet) {
    const why = L.noAttacks ? '📜 Treaty forbids' : pool < 1 ? 'Needs 1 unit' : !g.attackTargets.length ? (g.tw && g.tw.truce ? `🕊 Truce until round ${g.tw.truce + 1}` : 'No targets') : g.stationed && !g.attackTargets.some((id) => (g.attackSources[id] || []).length) ? 'No units at the front' : '';
    cards.push(actionCard('attack', 'Attack', 'Tile income only', `Flood +${w.attackFlood}`, !!why, why));
  } else if (cmd.action === 'attack') {
    cards.push(actionCard('attack', 'Attack (ordered)', esc(tileLabel(g, cmd.target)), `Flood +${w.attackFlood}`));
  }
  if (puppet) cards.push(actionCard('revolt', 'Revolt!', `Attack ${esc(g.players[me.puppetOf].name)}'s capital`, `Flood +${w.attackFlood}`, me.units < 1, me.units < 1 ? 'Needs 1 unit' : ''));

  let extra = '';
  let canLock = false;
  const dev = c.action === 'sustainable' || c.action === 'unsustainable';
  const tileIncome = `<p class="small">Your ${prod.tiles} tile${prod.tiles === 1 ? '' : 's'} give ${bagInline(prod.passive)} this round whatever you play.</p>`;
  if (c.action === 'sustainable') {
    if (prod.free > 0) {
      const lim = capped(c.mix, prod.free);
      for (const m of MATS) if (!prod.allowed.includes(m)) lim[m] = 0;
      extra = `${tileIncome}<h3>Plus pick ${prod.free} (${bagTotal(c.mix)}/${prod.free})</h3>${bagEditor('choice.mix', c.mix, lim)}`;
      canLock = bagTotal(c.mix) === prod.free;
    } else {
      extra = `${tileIncome}<p>Plus: ${bagInline(prod.fixed)}</p>`;
      canLock = true;
    }
  } else if (c.action === 'unsustainable') {
    extra = `${tileIncome}<h3>Plus pick ${prod.unsustainable} materials (${bagTotal(c.mix)}/${prod.unsustainable})</h3>${bagEditor('choice.mix', c.mix, capped(c.mix, prod.unsustainable))}`;
    canLock = bagTotal(c.mix) === prod.unsustainable;
  } else if (c.action === 'attack' && !puppet) {
    extra = `${tileIncome}<h3>Attack which tile?</h3><div class="target-list">${g.attackTargets
      .map(
        (id) =>
          `<button class="target ${c.target === id ? 'selected' : ''}" data-act="set" data-path="choice.target" data-value="${id}" aria-pressed="${c.target === id}">
          <span>${esc(tileLabel(g, id))}</span><small>${esc(targetNote(g, id))}</small></button>`,
      )
      .join('')}</div>
      <p class="hint">Targets are outlined on the Board tab too. You roll 1 die per unit${g.stationed ? ' sent' : ''} (max ${w.maxAttackDice}${!g.stationed && me.puppets && me.puppets.length ? ', puppets\' units included' : ''}); the defender up to ${w.maxDefenceDice}. Ties go to the defender. Win: occupy it and take up to ${w.maxLoot} tokens.${w.destructionFloodPerUnits > 0 ? ` Every ${w.destructionFloodPerUnits} units destroyed in battle (either side) add Flood +1.` : ''}</p>`;
    canLock = !!c.target;
    if (g.stationed && c.target) {
      const sp = sourcePicker(store, g.attackSources[c.target]);
      extra += sp.html;
      canLock = sp.ok;
    }
  } else if (c.action === 'attack' && puppet) {
    extra = `<p>Your overlord ordered this attack. If you win, the tile and spoils go to ${esc(g.players[me.puppetOf].name)}.</p>`;
    canLock = true;
    if (g.stationed) {
      c.target = cmd.target;
      const sp = sourcePicker(store, g.attackSources[cmd.target]);
      extra += sp.html;
      canLock = sp.ok;
    }
  } else if (c.action === 'revolt') {
    extra = `<p>You attack ${esc(g.players[me.puppetOf].name)}'s capital${g.stationed ? '' : ` with your ${me.units} unit${me.units === 1 ? '' : 's'}`}. Ties go to you. Win: you're free and take up to ${g.settings.empire.revoltLoot} tokens. Lose: you stay a puppet and lost units stay lost.</p>`;
    canLock = true;
    if (g.stationed) {
      const sp = sourcePicker(store, g.revoltSources);
      extra += sp.html.replace('Attack from', 'Revolt from (any of your tiles)');
      canLock = sp.ok;
    }
  }
  if (dev && me.damaged) extra += `<p class="warn small">🩹 You're Damaged: you'll collect ${w.damagedPenalty} less this time.</p>`;
  if (dev && me.aidEligible) {
    const aid = store.ui.choice.aid || 'wood';
    extra += `<h3>International aid: +${w.aidAmount} of</h3><div class="mat-picker">${MATS.map(
      (m) => `<button class="matbtn ${aid === m ? 'selected' : ''}" data-act="set" data-path="choice.aid" data-value="${m}" aria-pressed="${aid === m}">${MAT_LABEL[m]}</button>`,
    ).join('')}</div>`;
  }

  return `<div class="card phase-card">
    <h2>3. Choose secretly</h2>
    ${limitsNote(g)}
    ${puppet ? `<p class="puppet-box">⛓ ${esc(g.players[me.puppetOf].name)} commands: <b>${esc(commandText(g, cmd))}</b>. Play it — or revolt.</p>` : '<p class="hint">Nobody can see your choice until everyone has chosen.</p>'}
    <div class="action-cards">${cards.join('')}</div>
    ${extra}
    ${c.action ? `<button class="btn primary big" data-act="lockIn" ${canLock ? '' : 'disabled'}>Lock in ${c.action}</button>` : ''}
    ${me.choice ? `<button class="btn link" data-act="set" data-path="choice.editing" data-json="false">Keep my current choice</button>` : ''}
  </div>`;
}
