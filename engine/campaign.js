/**
 * GRAND CAMPAIGNS (Europe 1939)
 * =============================
 * Unlike the two-sided scenarios, a campaign has many nations — every one a player
 * (humans pick theirs, bots play the rest) — with factions that grow over time, wars
 * between particular nations, and capitulation when a capital falls.
 *
 *   p.nation   the nation a seat plays          p.faction  'allies' | 'axis' | 'comintern' | null
 *   p.out      the nation has capitulated       s.campaign.wars  ['a-b', ...] seat pairs at war
 */
'use strict';

const { addLog } = require('./util');
const EU = require('./europe39');

const CAMPAIGNS = { europe39: EU };

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const colName = (c) => (c < 26 ? COLS[c] : COLS[Math.floor(c / 26) - 1] + COLS[c % 26]);
const gridId = (c, r) => `${colName(c)}${r + 1}`;
const CH_TERRAIN = { p: 'plains', w: 'woods', h: 'hills', r: 'river' };
const T = (str) => Object.fromEntries(str.split(' ').filter(Boolean).map((x) => x.split(':')).map(([k, n]) => [k, +n]));
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** A seat's nation: one of the campaign's nations, or a breakaway nation from a civil war. */
function nationMeta(s, seat) {
  return dataOf(s).NATIONS[seat] || (s.campaign.extra || {})[seat] || { id: s.players[seat].nation, name: s.players[seat].name, color: '#888', ink: '#fff' };
}

function dataOf(s) {
  return CAMPAIGNS[s.campaign && s.campaign.id] || null;
}
const isCampaign = (s) => !!(s && s.campaign);

/** Nations in seat order for a campaign (the lobby needs the list before a game exists). */
function nationsOf(id) {
  const d = CAMPAIGNS[id];
  return d ? d.NATIONS : [];
}

// ---------------------------------------------------------------- setup

/**
 * Build the campaign board and the nations. state.players must already hold one player
 * per nation, in NATIONS order. `cfg` is the campaign's style (materials, research…).
 */
function setup(state, id, cfg = {}) {
  const d = CAMPAIGNS[id];
  state.campaign = { id, wars: [], extra: {} };
  const seatOf = {};
  d.NATIONS.forEach((n, i) => {
    seatOf[n.letter] = i;
    for (const a of n.also || []) seatOf[a] = i;
  });
  const tiles = [];
  d.MAP.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      const sea = ch === '.';
      const seat = sea ? null : seatOf[ch];
      tiles.push({
        id: gridId(c, r),
        q: c - (r - (r & 1)) / 2,
        r,
        c,
        kind: sea ? 'sea' : 'land',
        // Steel (wood), oil (stone), manpower (sandbags): industry makes steel, oil fields oil, everywhere else manpower.
        biome: sea ? 'sea' : 'riverbank',
        ...(sea ? {} : { terrain: CH_TERRAIN[d.TERRAIN[r][c]] || 'plains' }),
        owner: seat ?? null,
        role: seat == null ? null : 'province',
        controller: seat ?? null,
        units: {},
        factory: null,
      });
    });
  });
  const at = (c, r) => tiles.find((t) => t.c === c && t.r === r);
  for (const [c, r, name, f] of d.CITIES) {
    const t = at(c, r);
    Object.assign(t, { name, ...(f.ind ? { industry: true } : {}), ...(f.vp ? { vp: f.vp, victory: true } : {}), ...(f.oil ? { oil: true } : {}) });
    if (f.ind) t.biome = 'forest';
    if (f.oil) t.biome = 'quarry';
  }
  // Oil country: Romania's fields and the Caucasus.
  for (const t of tiles) if (t.kind === 'land' && ((t.owner === seatOf.A && t.r >= 10) || (t.owner === seatOf.R && t.r >= 12 && t.c >= 24))) t.biome = 'quarry';

  d.NATIONS.forEach((n, seat) => {
    const p = state.players[seat];
    const cap = tiles.find((t) => t.name === n.capital);
    cap.role = 'capital';
    Object.assign(p, { nation: n.id, side: n.id, faction: n.faction || null, out: false, biome: 'mixed', homeTile: cap.id });
    const pol = (d.POLITICS || {})[n.id] || ['nonaligned', 25, 25, 25, 25];
    p.gov = pol[0];
    p.pop = { democracy: pol[1], fascism: pol[2], communism: pol[3], nonaligned: pol[4] };
    const m = n.major ? cfg.majorMaterials ?? 15 : cfg.minorMaterials ?? 6;
    p.materials = { wood: Math.ceil(m / 3), stone: Math.floor(m / 3), sandbag: m - Math.ceil(m / 3) - Math.floor(m / 3) };
    p.research = { done: [...(d.RESEARCH[n.id] || d.RESEARCH.minor)], current: null };
  });
  // Armies, garrisons, fleets.
  const place = (t, seat, str) => {
    t.troops = t.troops || {};
    const cur = t.troops[seat] || {};
    for (const [k, v] of Object.entries(T(str))) cur[k] = (cur[k] || 0) + v;
    t.troops[seat] = cur;
  };
  d.NATIONS.forEach((n, seat) => {
    const list = d.ARMIES[n.id];
    if (list) for (const [c, r, str] of list) place(at(c, r), seat, str);
    else place(tiles.find((t) => t.name === n.capital), seat, d.MINOR_GARRISON);
  });
  for (const [c, r, str, nid] of d.FLEETS) {
    const t = at(c, r);
    const seat = d.NATIONS.findIndex((n) => n.id === nid);
    t.controller = seat;
    place(t, seat, str);
  }
  for (const p of state.players) p.units = 0;
  for (const t of tiles) {
    for (const [seat, tr] of Object.entries(t.troops || {})) {
      const nUnits = Object.values(tr).reduce((a, v) => a + v, 0);
      t.units[seat] = nUnits;
      state.players[seat].units += nUnits;
    }
  }
  state.board = { layout: 'campaign', tiles, seaLanes: true, campaign: id };
  // The war as it stood on 3 September 1939.
  const seat = (nid) => d.NATIONS.findIndex((n) => n.id === nid);
  for (const [a, b] of [['GER', 'POL'], ['GER', 'UK'], ['GER', 'FRA']]) state.campaign.wars.push(pairKey(seat(a), seat(b)));
  return state.board;
}

// ---------------------------------------------------------------- wars and factions

function atWar(s, a, b) {
  return a !== b && s.campaign.wars.includes(pairKey(a, b));
}
/** Seats on the same side as `seat` (its faction), not counting `seat`. */
function alliesOf(s, seat) {
  const f = s.players[seat].faction;
  if (!f) return [];
  return s.players.filter((p) => p.seat !== seat && p.faction === f && !p.out).map((p) => p.seat);
}
/** Seats `seat` is at war with. */
function enemiesOf(s, seat) {
  return s.players.filter((p) => !p.out && atWar(s, seat, p.seat)).map((p) => p.seat);
}
/** May `a` attack, bomb or shell `b`'s land and ships? Only nations at war. */
function canFight(s, a, b) {
  return b == null || atWar(s, a, b);
}

/**
 * `a` declares war on `b`. Factions defend their members: everyone in a's faction is
 * at war with everyone in b's faction (a nation outside any faction fights alone).
 */
function declareWar(s, a, b, why = null, alone = false, quiet = false) {
  const pa = s.players[a];
  const pb = s.players[b];
  if (pa.out || pb.out || a === b) return false;
  if (pa.faction && pa.faction === pb.faction) return false;
  // alone: a war between just these two (e.g. the USSR's invasion of Poland didn't bring Britain and France in).
  const side = (x) => (!alone && s.players[x].faction ? s.players.filter((p) => p.faction === s.players[x].faction && !p.out).map((p) => p.seat) : [x]);
  const before = s.campaign.wars.length;
  for (const x of side(a)) for (const y of side(b)) if (!atWar(s, x, y) && x !== y) s.campaign.wars.push(pairKey(x, y));
  if (s.campaign.wars.length === before) return false;
  if (!quiet) addLog(s, `📰 ${why || `${pa.name} (${nationName(s, a)}) declares war on ${pb.name} (${nationName(s, b)})`}!`, { kind: 'bad', event: 'war' });
  return true;
}
function joinFaction(s, seat, faction, why = null, quiet = false) {
  const p = s.players[seat];
  if (p.out || p.faction === faction) return false;
  // You can't join a faction you are at war with.
  if (s.players.some((q) => q.faction === faction && atWar(s, seat, q.seat))) return false;
  p.faction = faction;
  // Joining brings you into your new allies' wars against nations already fighting the faction.
  if (!quiet) addLog(s, `📰 ${why || `${nationName(s, seat)} joins the ${dataOf(s).FACTIONS[faction].name}`}.`, { kind: 'round', event: 'join' });
  return true;
}
function nationName(s, seat) {
  return nationMeta(s, seat).name;
}

/** A nation whose capital has fallen leaves the war. */
function capitulate(s, seat, taker) {
  const p = s.players[seat];
  if (p.out) return;
  p.out = true;
  p.faction = null;
  s.campaign.wars = s.campaign.wars.filter((k) => !k.split('-').map(Number).includes(seat));
  p.ready = true;
  p.decisions = [];
  if (s.phase === 'choose' && !p.choice) p.choice = outChoice();
  addLog(s, `🏳 ${nationName(s, seat)} capitulates to ${nationName(s, taker)}!`, { kind: 'bad', event: 'capitulation' });
}
/** The automatic "choice" of a nation that is out of the war. */
const outChoice = () => ({ action: 'sustainable', mix: { wood: 0, stone: 0, sandbag: 0 }, out: true });

// ---------------------------------------------------------------- each round

/** Attacks a nation may launch per round: great powers more than minor nations. */
function attacksFor(s, seat, cfg = {}) {
  const n = nationMeta(s, seat);
  return n && n.major ? cfg.majorAttacks ?? 3 : cfg.minorAttacks ?? 1;
}

/** Start of a round: the historical timeline, for nations played by bots. */
function roundStart(s) {
  const d = dataOf(s);
  // Each government slowly gains support (up to 90%).
  for (const p of s.players) if (!p.out && p.pop && p.pop[p.gov] < 90) shiftPop(p, p.gov, 1);
  // The opening headlines (the war as it stood when the game starts).
  if (s.round === 1 && !s.campaign.opened) {
    s.campaign.opened = true;
    for (const h of d.OPENING || []) addLog(s, `📰 ${h}!`, { kind: 'bad', event: 'news' });
  }
  runEvents(s);
  addLog(s, `🗓 ${d.dateOf(s.round)}.`, { kind: 'round' });
  printPaper(s);
}

// ---------------------------------------------------------------- events & the newspaper

const seatOfNation = (s, nid) => s.players.findIndex((p) => p.nation === nid);

/** Helpers for an event's `when` condition. */
function eventHelpers(s, seat) {
  const out = (id) => {
    const x = seatOfNation(s, id);
    return x < 0 || !!s.players[x].out;
  };
  const war = (a, b) => {
    const x = seatOfNation(s, a);
    const y = seatOfNation(s, b);
    return x >= 0 && y >= 0 && atWar(s, x, y);
  };
  return { atWar: war, out, me: s.players[seat] };
}

/** Fire this round's events: humans get a decision, bots take the historical option. */
function runEvents(s) {
  const d = dataOf(s);
  s.campaign.fired = s.campaign.fired || [];
  const fired = s.campaign.fired;
  for (const e of d.EVENTS || []) {
    if (s.round < e.round || s.round > (e.until ?? e.round)) continue;
    const key = `${e.id}:${e.nation || e.faction}`;
    if (fired.includes(key)) continue;
    if (e.faction) {
      fired.push(key);
      for (const p of s.players) if (p.faction === e.faction && !p.out) applyEffects(s, p.seat, e.effects || {});
      addLog(s, `📰 ${e.news || e.title}.`, { kind: 'round', event: 'news' });
      continue;
    }
    const seat = seatOfNation(s, e.nation);
    if (seat < 0 || s.players[seat].out) continue;
    if (e.when && !e.when(eventHelpers(s, seat))) continue;
    fired.push(key);
    offerEvent(s, seat, e);
  }
  // Unrest: a government with little support faces protests every few rounds.
  const u = d.UNREST;
  if (u) {
    for (const p of [...s.players]) {
      if (p.out || !p.pop || p.pop[p.gov] >= u.below) continue;
      if (p.unrestRound && s.round - p.unrestRound < u.every) continue;
      p.unrestRound = s.round;
      offerEvent(s, p.seat, u);
    }
  }
}

/** Plain-words summary of an option's effects. */
function describeOption(s, o) {
  const d = dataOf(s);
  const name = (id) => (d.NATIONS.find((n) => n.id === id) || { name: id }).name;
  const bits = [];
  if (o.join) bits.push(`joins the ${d.FACTIONS[o.join].name}`);
  if (o.war) bits.push(`⚔ war with ${o.war.map(name).join(' and ')}${o.alone ? '' : ' (and their allies)'}`);
  if (o.materials) bits.push(`${o.materials > 0 ? '+' : ''}${o.materials} materials`);
  for (const [k, v] of Object.entries(o.pop || {})) bits.push(`+${v}% ${d.IDEOLOGIES[k].name}`);
  if (o.popGov) bits.push(`+${o.popGov}% support for the government`);
  if (o.units) bits.push(`+${o.units} infantry at the capital`);
  return bits.join(' · ') || 'nothing changes';
}

function offerEvent(s, seat, e) {
  const p = s.players[seat];
  if (p.bot) {
    const i = Math.max(0, e.options.findIndex((o) => o.hist));
    return resolveOption(s, seat, e.options[i]);
  }
  p.decisions = p.decisions || [];
  p.decisions.push({
    key: `${e.id}:${s.round}`,
    id: e.id,
    title: e.title,
    text: e.text,
    options: e.options.map((o) => ({ ...structuredClone(o), summary: describeOption(s, o) })),
  });
  addLog(s, `📰 ${nationName(s, seat)} faces a decision: ${e.title}.`, { kind: 'round', event: 'decision', seat });
}

/** Carry out an event option for a nation. */
function resolveOption(s, seat, o) {
  const name = nationName(s, seat);
  const news = (o.news || '').split('%N').join(name);
  let told = false;
  // Joining through an event makes peace with the new allies first (e.g. the USSR and Poland in 1941).
  if (o.join) {
    const friends = s.players.filter((q) => q.faction === o.join).map((q) => q.seat);
    s.campaign.wars = s.campaign.wars.filter((k) => {
      const [x, y] = k.split('-').map(Number);
      return !((x === seat && friends.includes(y)) || (y === seat && friends.includes(x)));
    });
  }
  if (o.join && joinFaction(s, seat, o.join, news || null, !!o.war)) told = !o.war;
  for (const [i, id] of (o.war || []).entries()) {
    const b = seatOfNation(s, id);
    if (b >= 0 && b !== seat && declareWar(s, seat, b, news || null, !!o.alone, told) ) told = true;
  }
  applyEffects(s, seat, o);
  if (!told && news) addLog(s, `📰 ${news}.`, { kind: 'round', event: 'news' });
}

/** Materials, popularity and troops from an event. */
function applyEffects(s, seat, o) {
  const p = s.players[seat];
  const KINDS = ['wood', 'stone', 'sandbag'];
  if (o.materials > 0) for (let i = 0; i < o.materials; i++) p.materials[KINDS[i % 3]] += 1;
  if (o.materials < 0) {
    for (let i = 0; i < -o.materials; i++) {
      const k = KINDS.reduce((a, b) => (p.materials[b] > p.materials[a] ? b : a));
      if (p.materials[k] > 0) p.materials[k] -= 1;
    }
  }
  if (p.pop) {
    for (const [k, v] of Object.entries(o.pop || {})) shiftPop(p, k, v);
    if (o.popGov) shiftPop(p, p.gov, o.popGov);
  }
  if (o.units) {
    const cap = s.board.tiles.find((t) => t.id === p.homeTile);
    if (cap && cap.controller === seat) {
      cap.troops = cap.troops || {};
      cap.units = cap.units || {};
      cap.troops[seat] = cap.troops[seat] || {};
      cap.troops[seat].infantry = (cap.troops[seat].infantry || 0) + o.units;
      cap.units[seat] = (cap.units[seat] || 0) + o.units;
      p.units = (p.units || 0) + o.units;
    }
  }
}

/** The round's newspaper: the headlines since the last edition. */
const HEADLINE_EVENTS = ['war', 'join', 'capitulation', 'news', 'capture'];
function printPaper(s) {
  const d = dataOf(s);
  const from = s.campaign.newsSeq || 0;
  const lines = [];
  for (let i = s.log.length - 1; i >= 0 && s.log[i].id > from; i--) {
    const l = s.log[i];
    if (HEADLINE_EVENTS.includes(l.event)) lines.unshift((l.headline || l.text).replace(/^📰\s*/, ''));
  }
  s.campaign.paper = { round: s.round, date: d.dateOf(s.round), headlines: lines.slice(-14), vp: vpHeld(s) };
  s.campaign.newsSeq = s.seq;
}

// ---------------------------------------------------------------- politics
// Each nation has a government and a popularity for each ideology (percent, sums to 100).

/** Move `amount` points of popularity to `ideo`, taken from the others in proportion to their size. */
function shiftPop(p, ideo, amount) {
  const others = Object.keys(p.pop).filter((k) => k !== ideo);
  let left = Math.min(amount, others.reduce((a, k) => a + p.pop[k], 0));
  const take = left;
  while (left > 0) {
    const k = others.reduce((a, b) => (p.pop[b] > p.pop[a] ? b : a));
    if (!p.pop[k]) break;
    p.pop[k] -= 1;
    left -= 1;
  }
  p.pop[ideo] += take - left;
}

/** Does this faction accept a nation with this government? */
function fits(s, faction, gov) {
  return !faction || (dataOf(s).FACTION_FIT[faction] || []).includes(gov);
}

/**
 * Democracies need a reason to go to war: the target must already be at war with a member
 * of their faction, or with any democracy. Everyone else may declare war freely.
 */
function mayDeclare(s, a, b) {
  if (s.players[a].gov !== 'democracy') return true;
  const friends = [a, ...alliesOf(s, a)];
  return s.players.some((p) => !p.out && atWar(s, b, p.seat) && (friends.includes(p.seat) || p.gov === 'democracy'));
}

/** What changing to `ideo` would do now: 'same' | 'peaceful' | 'civilWar' | 'impossible'. */
function changeOutcome(s, seat, ideo, cfg = {}) {
  const p = s.players[seat];
  if (p.gov === ideo) return 'same';
  const v = p.pop[ideo] || 0;
  if (v >= (cfg.peacefulPct ?? 50)) return 'peaceful';
  if (v >= (cfg.civilWarPct ?? 30)) return 'civilWar';
  return 'impossible';
}

/**
 * Change a nation's government. With enough support it's peaceful; with partial support
 * the country splits and the old regime fights on as a bot nation (a civil war).
 * Returns the new seat of the breakaway nation (civil war) or null.
 */
function changeGovernment(s, seat, ideo, cfg = {}) {
  const d = dataOf(s);
  const p = s.players[seat];
  const old = p.gov;
  const how = changeOutcome(s, seat, ideo, cfg);
  let rebel = null;
  if (how === 'civilWar') rebel = splitNation(s, seat, ideo);
  p.gov = ideo;
  // Support rallies to the new government.
  if (p.pop[ideo] < 55) shiftPop(p, ideo, 55 - p.pop[ideo]);
  addLog(s, how === 'peaceful'
    ? `📰 ${nationName(s, seat)} changes government: ${d.IDEOLOGIES[old].name} → ${d.IDEOLOGIES[ideo].name}.`
    : `📰 CIVIL WAR in ${nationName(s, seat)}: the new ${d.IDEOLOGIES[ideo].name} government fights the ${d.IDEOLOGIES[old].name} loyalists!`, { kind: 'bad', event: 'war' });
  // A government its faction won't accept leaves the faction.
  if (p.faction && !fits(s, p.faction, ideo)) {
    addLog(s, `📰 ${nationName(s, seat)} leaves the ${d.FACTIONS[p.faction].name}.`, { kind: 'round' });
    p.faction = null;
  }
  return rebel;
}

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
/** Darken a #rrggbb colour (for a breakaway nation). */
const darker = (hex) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.6).toString(16).padStart(2, '0')).join('');

/**
 * Civil war: the nation splits. Its land nearest the capital — a share equal to the new
 * ideology's support against the old one's — stays with the player under the new
 * government; the rest (with the units on it, and half the materials) becomes a new
 * nation of the old government, played by a bot, at war with the player and in all the
 * player's existing wars.
 */
function splitNation(s, seat, ideo) {
  const d = dataOf(s);
  const p = s.players[seat];
  const old = p.gov;
  const meta = nationMeta(s, seat);
  const home = s.board.tiles.find((t) => t.id === p.homeTile);
  const land = s.board.tiles.filter((t) => t.kind === 'land' && t.controller === seat).sort((a, b) => hexDist(a, home) - hexDist(b, home));
  const keepShare = (p.pop[ideo] || 0) / Math.max(1, (p.pop[ideo] || 0) + (p.pop[old] || 0));
  const keep = Math.max(1, Math.round(land.length * keepShare));
  const theirs = land.slice(keep);
  if (!theirs.length) return null;
  // The new nation.
  const ns = s.players.length;
  const q = structuredClone(p);
  for (const k of Object.keys(q.stats || {})) if (typeof q.stats[k] === 'number') q.stats[k] = 0;
  const half = (n) => Math.floor(n / 2);
  s.campaign.extra = s.campaign.extra || {};
  Object.assign(q, {
    seat: ns,
    name: `${meta.name} (${d.IDEOLOGIES[old].name})`,
    bot: true,
    nation: `${meta.id}-${old.slice(0, 3).toUpperCase()}`,
    side: `${meta.id}-${old.slice(0, 3).toUpperCase()}`,
    gov: old,
    pop: { democracy: 10, fascism: 10, communism: 10, nonaligned: 10, [old]: 70 },
    faction: fits(s, p.faction, old) ? p.faction : null,
    out: false,
    ready: false,
    choice: null,
    units: 0,
    hits: {},
    plans: { withdraw: [], release: [] },
    materials: { wood: half(p.materials.wood), stone: half(p.materials.stone), sandbag: half(p.materials.sandbag) },
  });
  for (const m of ['wood', 'stone', 'sandbag']) p.materials[m] -= q.materials[m];
  // Their capital: their biggest city (victory points, then industry), else the farthest hex.
  const cap = [...theirs].sort((a, b) => (b.vp || 0) - (a.vp || 0) || !!b.industry - !!a.industry || !!b.name - !!a.name)[0];
  q.homeTile = cap.id;
  s.players.push(q);
  s.campaign.extra[ns] = { id: q.nation, name: q.name, color: darker(meta.color || '#888888'), ink: '#fff', major: false, capital: cap.name || cap.id, personality: 'balanced' };
  for (const t of theirs) {
    t.owner = ns;
    t.controller = ns;
    t.role = t === cap ? 'capital' : 'province';
    if (t.troops && t.troops[seat]) {
      t.troops[ns] = t.troops[seat];
      delete t.troops[seat];
    }
    if (t.units && t.units[seat]) {
      t.units[ns] = t.units[seat];
      delete t.units[seat];
    }
  }
  for (const g of s.generals || []) if (g.seat === seat && theirs.some((t) => t.id === g.tile)) g.seat = ns;
  // Part of the army defects: the loyalists raise a militia at their new capital.
  const before = s.board.tiles.reduce((a, t) => a + ((t.units || {})[seat] || 0), 0);
  const militia = Math.max(3, Math.round((before * (1 - keepShare)) / 2));
  cap.troops = cap.troops || {};
  cap.units = cap.units || {};
  cap.troops[ns] = cap.troops[ns] || {};
  cap.troops[ns].infantry = (cap.troops[ns].infantry || 0) + militia;
  cap.units[ns] = (cap.units[ns] || 0) + militia;
  for (const x of [p, q]) x.units = s.board.tiles.reduce((a, t) => a + ((t.units || {})[x.seat] || 0), 0);
  // The civil war, and the parent's wars (the loyalists fight the same enemies).
  for (const e of enemiesOf(s, seat)) s.campaign.wars.push(pairKey(ns, e));
  s.campaign.wars.push(pairKey(seat, ns));
  return ns;
}

// ---------------------------------------------------------------- victory

/** Victory points held by each faction (cities' vp). */
function vpHeld(s) {
  const held = { allies: 0, axis: 0, comintern: 0 };
  for (const t of s.board.tiles) if (t.vp && t.controller != null) {
    const f = s.players[t.controller].faction;
    if (f) held[f] += t.vp;
  }
  return held;
}
/** End of the game: the faction with the most victory points wins. */
function decide(s) {
  const held = vpHeld(s);
  const d = dataOf(s);
  const best = Object.entries(held).sort((a, b) => b[1] - a[1]);
  if (!best[0][1] || best[0][1] === best[1][1]) return { side: null, why: `No faction leads: victory points ${Object.entries(held).map(([f, v]) => `${d.FACTIONS[f].name} ${v}`).join(', ')}.` };
  return { side: best[0][0], why: `The ${d.FACTIONS[best[0][0]].name} hold the most victory points (${Object.entries(held).map(([f, v]) => `${d.FACTIONS[f].name} ${v}`).join(', ')}).` };
}
function winners(s, side) {
  return side ? s.players.filter((p) => p.faction === side).map((p) => p.seat) : [];
}

/** Public campaign info for a player's view. */
function view(s, seat, cfg = {}) {
  const d = dataOf(s);
  const me = s.players[seat];
  return {
    kind: 'campaign',
    id: s.campaign.id,
    name: 'Europe, 1939',
    date: d.dateOf(s.round),
    nations: s.players.map((p, i) => {
      const n = nationMeta(s, i);
      return { seat: i, id: n.id, name: n.name, color: n.color, ink: n.ink, major: !!n.major, faction: p.faction, out: !!p.out, human: !p.bot, gov: p.gov, pop: p.pop };
    }),
    ideologies: d.IDEOLOGIES,
    factionFit: d.FACTION_FIT,
    politics: { propagandaCost: cfg.propagandaCost ?? 4, propagandaStep: cfg.propagandaStep ?? 5, propagandaPerRound: cfg.propagandaPerRound ?? 2, peaceful: cfg.peacefulPct ?? 50, civilWar: cfg.civilWarPct ?? 30, usedThisRound: me && me.propagandaRound === s.round ? me.propagandaUsed || 0 : 0 },
    factions: d.FACTIONS,
    wars: [...s.campaign.wars],
    atWar: me ? enemiesOf(s, seat) : [],
    vp: vpHeld(s),
    attacksPerRound: me ? attacksFor(s, seat, cfg) : 0,
    // For the bots: "sides" are the factions, and each unaligned nation on its own.
    sides: [
      ...Object.keys(d.FACTIONS).map((f) => ({ id: f, name: d.FACTIONS[f].name, icon: d.FACTIONS[f].icon, seats: s.players.filter((p) => p.faction === f && !p.out).map((p) => p.seat) })),
      ...s.players.filter((p) => !p.faction).map((p) => ({ id: `n:${p.nation}`, name: nationName(s, p.seat), icon: '⬜', seats: [p.seat] })),
    ],
    decisive: {},
    next: (d.EVENTS || []).filter((e) => e.round > s.round && e.round <= s.round + 2 && !e.when).map((e) => ({ round: e.round, text: e.faction ? e.news : ((e.options.find((o) => o.hist) || e.options[0]).news || e.title) })),
    paper: s.campaign.paper || null,
    plan: me && me.bot ? planFor(s, seat) : null,
    doctrine: me ? doctrine(s, seat) : null,
    decisions: me ? (me.decisions || []).map((x) => ({ key: x.key, title: x.title, text: x.text, options: x.options.map((o) => ({ label: o.label, summary: o.summary, hist: !!o.hist })) })) : [],
  };
}

/** Fill in what older saves lack (governments and popularity came in with Phase 3). */
function upgradeSave(s) {
  const d = dataOf(s);
  s.campaign.extra = s.campaign.extra || {};
  s.players.forEach((p, i) => {
    if (p.gov && p.pop) return;
    const pol = (d.POLITICS || {})[(d.NATIONS[i] || {}).id] || ['nonaligned', 25, 25, 25, 25];
    p.gov = pol[0];
    p.pop = { democracy: pol[1], fascism: pol[2], communism: pol[3], nonaligned: pol[4] };
  });
  return s;
}

/** Winter rounds: those starting in December (round 2 = Dec 1939, then every 4th). */
const isWinter = (round) => round % 4 === 2;
/** A nation's doctrine bonuses this round: { attack, defence (%), active: [{ name, text, until }] }. */
function doctrine(s, seat) {
  const d = dataOf(s);
  const p = s.players[seat];
  const out = { attack: 100, defence: 100, active: [] };
  if (!p) return out;
  for (const x of (d.DOCTRINES || {})[p.nation] || []) {
    if (s.round < x.from || s.round > x.to || (x.winter && !isWinter(s.round))) continue;
    out.attack = Math.round((out.attack * (x.attack || 100)) / 100);
    out.defence = Math.round((out.defence * (x.defence || 100)) / 100);
    out.active.push({ name: x.name, text: x.text, until: d.dateOf(x.to) });
  }
  return out;
}

/** A bot nation's war plan this round: { attack: [city names], defend: [...], passive }. */
function planFor(s, seat) {
  const d = dataOf(s);
  const phases = ((d.WAR_PLANS || {})[s.players[seat].nation] || []).filter((x) => x.from <= s.round && s.round <= x.to);
  if (!phases.length) return null;
  return {
    attack: [...new Set(phases.flatMap((x) => x.attack || []))],
    // Where the army masses: the main thrust's targets if the plan names one, else all of them.
    main: [...new Set((phases.some((x) => x.main) ? phases.filter((x) => x.main) : phases).flatMap((x) => x.attack || []))],
    defend: [...new Set(phases.flatMap((x) => x.defend || []))],
    avoid: [...new Set(phases.flatMap((x) => x.avoid || []))],
    strict: phases.some((x) => x.strict),
    passive: phases.some((x) => x.passive) && !phases.some((x) => (x.attack || []).length),
  };
}

module.exports = { doctrine, isWinter, planFor, resolveOption, runEvents, printPaper, describeOption, upgradeSave, nationMeta, shiftPop, fits, mayDeclare, changeOutcome, changeGovernment, splitNation, CAMPAIGNS, isCampaign, nationsOf, setup, atWar, alliesOf, enemiesOf, canFight, declareWar, joinFaction, capitulate, outChoice, attacksFor, roundStart, vpHeld, decide, winners, view, nationName, gridId };
