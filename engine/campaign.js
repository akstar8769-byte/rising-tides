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
  state.campaign = { id, wars: [] };
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
function declareWar(s, a, b, why = null, alone = false) {
  const pa = s.players[a];
  const pb = s.players[b];
  if (pa.out || pb.out || a === b) return false;
  if (pa.faction && pa.faction === pb.faction) return false;
  // alone: a war between just these two (e.g. the USSR's invasion of Poland didn't bring Britain and France in).
  const side = (x) => (!alone && s.players[x].faction ? s.players.filter((p) => p.faction === s.players[x].faction && !p.out).map((p) => p.seat) : [x]);
  const before = s.campaign.wars.length;
  for (const x of side(a)) for (const y of side(b)) if (!atWar(s, x, y) && x !== y) s.campaign.wars.push(pairKey(x, y));
  if (s.campaign.wars.length === before) return false;
  addLog(s, `📰 ${why || `${pa.name} (${nationName(s, a)}) declares war on ${pb.name} (${nationName(s, b)})`}!`, { kind: 'bad', event: 'war' });
  return true;
}
function joinFaction(s, seat, faction, why = null) {
  const p = s.players[seat];
  if (p.out || p.faction === faction) return false;
  // You can't join a faction you are at war with.
  if (s.players.some((q) => q.faction === faction && atWar(s, seat, q.seat))) return false;
  p.faction = faction;
  // Joining brings you into your new allies' wars against nations already fighting the faction.
  addLog(s, `📰 ${why || `${nationName(s, seat)} joins the ${dataOf(s).FACTIONS[faction].name}`}.`, { kind: 'round', event: 'join' });
  return true;
}
function nationName(s, seat) {
  const d = dataOf(s);
  return d.NATIONS[seat] ? d.NATIONS[seat].name : s.players[seat].name;
}

/** A nation whose capital has fallen leaves the war. */
function capitulate(s, seat, taker) {
  const p = s.players[seat];
  if (p.out) return;
  p.out = true;
  p.faction = null;
  s.campaign.wars = s.campaign.wars.filter((k) => !k.split('-').map(Number).includes(seat));
  p.ready = true;
  if (s.phase === 'choose' && !p.choice) p.choice = outChoice();
  addLog(s, `🏳 ${nationName(s, seat)} capitulates to ${nationName(s, taker)}!`, { kind: 'bad', event: 'capitulation' });
}
/** The automatic "choice" of a nation that is out of the war. */
const outChoice = () => ({ action: 'sustainable', mix: { wood: 0, stone: 0, sandbag: 0 }, out: true });

// ---------------------------------------------------------------- each round

/** Attacks a nation may launch per round: great powers more than minor nations. */
function attacksFor(s, seat, cfg = {}) {
  const n = dataOf(s).NATIONS[seat];
  return n && n.major ? cfg.majorAttacks ?? 3 : cfg.minorAttacks ?? 1;
}

/** Start of a round: the historical timeline, for nations played by bots. */
function roundStart(s) {
  const d = dataOf(s);
  const seat = (nid) => d.NATIONS.findIndex((n) => n.id === nid);
  for (const e of d.TIMELINE.filter((x) => x.round === s.round)) {
    if (e.war) {
      const [a, b] = e.war.map(seat);
      if (s.players[a].bot) declareWar(s, a, b, e.text, !!e.alone);
    } else if (e.join) {
      const a = seat(e.join[0]);
      if (s.players[a].bot) joinFaction(s, a, e.join[1], e.text);
    }
  }
  addLog(s, `🗓 ${d.dateOf(s.round)}.`, { kind: 'round' });
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
    nations: d.NATIONS.map((n, i) => ({ seat: i, id: n.id, name: n.name, color: n.color, ink: n.ink, major: !!n.major, faction: s.players[i].faction, out: !!s.players[i].out, human: !s.players[i].bot })),
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
    next: d.TIMELINE.filter((e) => e.round > s.round && e.round <= s.round + 2).map((e) => ({ round: e.round, text: e.text })),
  };
}

module.exports = { CAMPAIGNS, isCampaign, nationsOf, setup, atWar, alliesOf, enemiesOf, canFight, declareWar, joinFaction, capitulate, outChoice, attacksFor, roundStart, vpHeld, decide, winners, view, nationName, gridId };
