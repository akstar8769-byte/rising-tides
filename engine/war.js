/**
 * WAR EXPANSION (+ EMPIRE RULES)
 * ==============================
 * Adds territories, militia, attacks, occupation, the Climate Accord, and
 * (in 'empire' mode) puppets, tribute, commands and revolts.
 * Everything else (walls, trading, market, seawall, scoring) comes from base.js.
 *
 * Round order (PDF W7):
 *   1. Upkeep (round 2+): planned withdrawals/releases, militia upkeep, garrison,
 *      Flood +1 per occupying player, check Accord and catastrophe.   [automatic]
 *   2. Talk & build ('talk')     — also recruit units, set puppet commands.
 *   3. Choose secretly ('choose')
 *   4. Reveal & collect           — automatic
 *   5. Resolve attacks            — automatic (clashes first), pauses for loot ('loot')
 *   6. Trade & build ('trade')
 *
 * Rule decisions are numbered Q1–Q25 in RULE_NOTES.md.
 */
'use strict';

const { fail, MATERIALS, emptyBag, cleanBag, bagTotal, hasBag, addBag, subBag, describeBag, rollDie, addLog } = require('./util');
const { BIOMES, areAdjacent } = require('./board');
const base = require('./base');
const diplomacy = require('./diplomacy');
const battles = require('./totalwar');
const ARS = require('./arsenal');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const W = (s) => s.settings.war;
const E = (s) => s.settings.empire;
const isEmpire = (s) => s.mode === 'empire';
const TW = (s) => s.mode === 'totalwar'; // Total War: war is encouraged
const TWS = (s) => s.settings.totalwar;
/** Total War opening truce: no attacks on other players yet (claiming empty land is fine). */
const inTruce = (s) => TW(s) && s.round <= (TWS(s).truceRounds || 0);

function getTile(s, id) {
  const t = s.board.tiles.find((x) => x.id === id && x.kind === 'land');
  if (!t) fail('Pick a valid tile.');
  return t;
}
/** A land tile or (Total War) a sea bay. */
function getAnyTile(s, id) {
  const t = s.board.tiles.find((x) => x.id === id && (x.kind === 'land' || x.kind === 'sea'));
  if (!t) fail('Pick a valid tile.');
  return t;
}
const domainOf = (k) => ARS.UNITS[k].domain;
const isCoastal = (s, t) => t.kind === 'land' && s.board.tiles.some((x) => x.kind === 'sea' && areAdjacent(x, t));
/** Sea bays this player's ships hold. */
function seasHeld(s, seat) {
  return s.board.tiles.filter((t) => t.kind === 'sea' && t.controller === seat);
}
/** A sea bay with no ships left in it belongs to nobody. */
function refreshSeas(s) {
  for (const t of s.board.tiles) if (t.kind === 'sea' && !Object.values(t.units || {}).some((n) => n > 0)) t.controller = null;
}

// ---------------------------------------------------------------- sea lanes (ocean boards)
// On boards with sea lanes (the "oceans" map) ships move hex by hex through the
// ocean instead of jumping between bays, troops can only cross the sea along an
// unbroken chain of your ships, fishing grounds pay whoever holds them, and enemy
// ships next to your coast blockade it.
const LANES = (s) => !!(s.board && s.board.seaLanes);

/** Groups of touching sea hexes held by this player (each a Set of tiles). */
function fleetGroups(s, seat) {
  const held = seasHeld(s, seat);
  const seen = new Set();
  const groups = [];
  for (const t of held) {
    if (seen.has(t)) continue;
    const g = new Set([t]);
    seen.add(t);
    const queue = [t];
    while (queue.length) {
      const x = queue.shift();
      for (const y of held) if (!seen.has(y) && areAdjacent(x, y)) { seen.add(y); g.add(y); queue.push(y); }
    }
    groups.push(g);
  }
  return groups;
}
const touches = (group, t) => [...group].some((sea) => areAdjacent(sea, t));

/**
 * TRANSPORT SHIPS (sea-lane boards). Your ships on sea hexes next to one of your
 * coastal tiles can carry the troops there across the sea in one go: each ship
 * carries transportPerShip units, up to transportRange sea hexes away (counting
 * the hex the ships are on), through sea that is empty or yours. Enemy ships in
 * the way block the route.
 * Returns { ships, capacity, dist: Map(seaTile -> hexes), prev } or null.
 */
function transportFrom(s, seat, X) {
  if (!LANES(s) || !X || X.kind !== 'land') return null;
  const cfg = TWS(s);
  const ships = s.board.tiles.filter((t) => t.kind === 'sea' && t.controller === seat && unitsAt(t, seat) > 0 && areAdjacent(t, X));
  if (!ships.length) return null;
  const capacity = ships.reduce((a, t) => a + unitsAt(t, seat), 0) * (cfg.transportPerShip ?? 3);
  const range = cfg.transportRange ?? 6;
  const dist = new Map();
  const prev = new Map();
  const queue = [];
  for (const t of ships) {
    dist.set(t, 1);
    queue.push(t);
  }
  while (queue.length) {
    const t = queue.shift();
    const d = dist.get(t);
    if (d >= range) continue;
    for (const n of s.board.tiles) {
      if (n.kind !== 'sea' || dist.has(n) || !areAdjacent(t, n) || (n.controller != null && n.controller !== seat)) continue;
      dist.set(n, d + 1);
      prev.set(n, t);
      queue.push(n);
    }
  }
  return { ships, capacity, dist, prev };
}
/** Can this transport land troops on coast T? */
const reaches = (tr, T) => !!tr && [...tr.dist.keys()].some((sea) => areAdjacent(sea, T));
/** The shortest sea route of a transport to coast T (list of sea hexes). */
function routeTo(tr, T) {
  let best = null;
  for (const [sea, d] of tr.dist) if (areAdjacent(sea, T) && (!best || d < tr.dist.get(best))) best = sea;
  const path = [];
  for (let x = best; x; x = tr.prev.get(x)) path.push(x);
  return path;
}

/**
 * Sea hexes your troops can land from. Sea-lane boards: every sea hex your
 * transports can reach. Other boards: every bay you hold.
 */
function landingSeas(s, seat) {
  if (!LANES(s)) return seasHeld(s, seat);
  const out = new Set();
  for (const X of controlled(s, seat)) {
    const tr = transportFrom(s, seat, X);
    if (tr) for (const sea of tr.dist.keys()) out.add(sea);
  }
  return [...out];
}

/** Enemy ships off this coastal tile, and none of the holder's own: it earns nothing. */
function blockaded(s, t) {
  if (!TW(s) || !LANES(s) || TWS(s).blockades === false || t.kind !== 'land' || t.controller == null || inTruce(s)) return false;
  let enemy = false;
  for (const x of s.board.tiles) {
    if (x.kind !== 'sea' || x.controller == null || !areAdjacent(x, t)) continue;
    if (x.controller === t.controller) return false;
    enemy = true;
  }
  return enemy;
}
function controlled(s, seat) {
  return s.board.tiles.filter((t) => t.kind === 'land' && t.controller === seat);
}
function puppetsOf(s, seat) {
  return s.players.filter((p) => p.puppetOf === seat).map((p) => p.seat);
}
function isSanctioned(s, p) {
  return p.sanctionedThrough != null && p.sanctionedThrough >= s.round;
}
/** Holds any tile it doesn't own, or any puppet (PDF W5, W8.3). */
function isOccupier(s, seat) {
  return controlled(s, seat).some((t) => t.owner !== seat) || puppetsOf(s, seat).length > 0;
}
/** Some of this player's own tiles are held by someone else. */
function hasOccupiedTile(s, seat) {
  return s.board.tiles.some((t) => t.owner === seat && t.controller !== seat);
}
/**
 * A capital can be attacked once enough of its provinces are occupied, by anyone
 * (setting war.capitalOpensAfter: 1 = after one province, 2 = the PDF's "both").
 */
function capitalOpen(s, t) {
  const provs = s.board.tiles.filter((x) => x.owner === t.owner && x.role === 'province');
  const occupied = provs.filter((x) => x.controller !== t.owner).length;
  return provs.length > 0 && occupied >= Math.min(W(s).capitalOpensAfter, provs.length);
}
function aidEligible(s, p) {
  if (TW(s)) return false;
  return !s.accordBroken && (p.damaged || hasOccupiedTile(s, p.seat) || p.puppetOf != null);
}

function tileName(s, t) {
  if (t.kind === 'sea') return `the sea bay ${t.id}${t.controller != null ? ' held by ' + s.players[t.controller].name : ''}`;
  const biome = BIOMES[t.biome].label;
  const held = t.controller != null && t.controller !== t.owner ? ` held by ${s.players[t.controller].name}` : '';
  if (t.owner == null) return `the open ${biome} tile ${t.id}${held}`;
  const owner = s.players[t.owner].name;
  return `${owner}'s ${t.role === 'capital' ? 'capital' : biome + ' province'} ${t.id}${held}`;
}

/** Take `n` tokens from a bag, largest pile first. Returns what was taken. */
function takeLargest(bag, n) {
  const taken = emptyBag();
  const pool = { ...bag };
  for (let i = 0; i < n; i++) {
    const m = MATERIALS.reduce((best, x) => (pool[x] > pool[best] ? x : best), MATERIALS[0]);
    if (pool[m] <= 0) break;
    pool[m]--;
    taken[m]++;
  }
  return taken;
}

function leastHeld(p) {
  return MATERIALS.reduce((best, m) => (p.materials[m] < p.materials[best] ? m : best), MATERIALS[0]);
}

// ---------------------------------------------------------------------------
// Production and targets (also shown to players in their view)
// ---------------------------------------------------------------------------

/**
 * What a player collects each round.
 *   passive: every tile you hold gives passivePerTile of its own resource, whatever
 *            you play — Attack included. (A Mixed tile gives what you hold least of.)
 *   Sustainable adds a bonus of your home resource:
 *     fixed:   the bonus when it is automatic (single-resource home)
 *     free:    how much of it you pick yourself (Mixed home, or production access)
 *     allowed: which materials the free part may be
 *   Unsustainable adds `unsustainable` materials of any mix (Flood +1).
 */
function production(s, seat) {
  const w = W(s);
  const p = s.players[seat];
  const tiles = controlled(s, seat);
  const passive = emptyBag();
  const fishing = TW(s) && LANES(s) ? seasHeld(s, seat).filter((t) => t.fish) : [];
  const blocked = tiles.filter((t) => blockaded(s, t));
  for (const t of [...tiles.filter((x) => !blocked.includes(x)), ...fishing]) {
    let res = BIOMES[t.biome].resource;
    if (!res) {
      // Mixed tile: the material you hold least of (counting this round's income so far)
      res = MATERIALS.reduce((best, m) => (p.materials[m] + passive[m] < p.materials[best] + passive[best] ? m : best), MATERIALS[0]);
    }
    if (t.kind === 'sea') {
      passive[res] += TWS(s).fishingIncome ?? 1; // fishing ground: the catch is worth what you're short of
      continue;
    }
    passive[res] += w.passivePerTile;
    if (TW(s) && t.owner !== seat) passive[res] += TWS(s).occupiedBonus; // plunder
  }
  const homeRes = BIOMES[p.biome].resource;
  const base = { passive, tiles: tiles.length, unsustainable: w.unsustainableBonus, fishing: fishing.length, blockaded: blocked.map((t) => t.id) };
  const puppets = puppetsOf(s, seat);
  if (isEmpire(s) && E(s).productionAccess && puppets.length) {
    // Production access (PDF W8.2, Q21): take your Sustainable bonus as your own
    // or your puppets' resource types.
    const types = new Set(homeRes ? [homeRes] : MATERIALS);
    for (const t of [...tiles, ...puppets.flatMap((q) => controlled(s, q))]) {
      const res = BIOMES[t.biome].resource;
      if (res) types.add(res);
      else MATERIALS.forEach((m) => types.add(m));
    }
    return { ...base, fixed: emptyBag(), free: w.sustainableBonus, allowed: MATERIALS.filter((m) => types.has(m)), access: true };
  }
  if (homeRes) return { ...base, fixed: { ...emptyBag(), [homeRes]: w.sustainableBonus }, free: 0, allowed: [homeRes], access: false };
  return { ...base, fixed: emptyBag(), free: w.sustainableBonus, allowed: MATERIALS.slice(), access: false }; // Mixed home: any
}

/** Tiles this player may attack with their own action. */
function attackTargets(s, seat) {
  const p = s.players[seat];
  const forbidden = new Set([seat, ...puppetsOf(s, seat)]);
  if (p.puppetOf != null) {
    forbidden.add(p.puppetOf);
    puppetsOf(s, p.puppetOf).forEach((x) => forbidden.add(x));
  }
  const mine = controlled(s, seat);
  // Total War: amphibious attacks land on coasts next to a sea bay your ships hold.
  const amph = TW(s) && TWS(s).amphibious && mine.some((m) => isCoastal(s, m)) ? landingSeas(s, seat) : [];
  const land = s.board.tiles
    .filter(
      (t) =>
        t.kind === 'land' &&
        !forbidden.has(t.controller) &&
        (mine.some((m) => areAdjacent(m, t)) || amph.some((sea) => areAdjacent(sea, t))) &&
        (t.controller != null || W(s).openTilesClaimable) &&
        !(t.controller != null && inTruce(s)) &&
        !(t.role === 'capital' && !capitalOpen(s, t)),
    )
    .map((t) => t.id);
  // Total War: ships can sail to any sea bay that isn't already theirs (the bays are joined by the ocean).
  const hasShips = seasHeld(s, seat).some((t) => unitsAt(t, seat) > 0);
  // Sea-lane boards: only the sea hexes right next to your fleets.
  const held = seasHeld(s, seat).filter((t) => unitsAt(t, seat) > 0);
  const sea = TW(s) && hasShips ? s.board.tiles.filter((t) => t.kind === 'sea' && t.controller !== seat && !forbidden.has(t.controller) && !(t.controller != null && inTruce(s)) && (!LANES(s) || held.some((h) => areAdjacent(h, t)))).map((t) => t.id) : [];
  return [...land, ...sea];
}

/** A puppet's command, falling back to Sustainable if none or no longer possible (Q22). */
function effectiveCommand(s, p) {
  const c = p.command;
  if (!c) return { action: 'sustainable', fallback: true };
  if (c.action === 'attack' && (p.units < 1 || !attackTargets(s, p.seat).includes(c.target))) return { action: 'sustainable', fallback: true };
  if (c.action === 'attack' && ST(s) && !attackSources(s, p.seat, c.target).length) return { action: 'sustainable', fallback: true };
  // A treaty the puppet signed beats its overlord's command.
  if (c.action === 'unsustainable' && diplomacy.blockedBy(s, p.seat, 'unsustainable')) return { action: 'sustainable', fallback: true };
  if (c.action === 'attack' && diplomacy.blockedBy(s, p.seat, 'attack', getTile(s, c.target).controller)) return { action: 'sustainable', fallback: true };
  return c;
}

// Units that fight. Units listed first are lost first (puppets before overlords, Q24).
function attackPool(s, e) {
  if (e.kind === 'revolt' || s.players[e.seat].puppetOf != null) return [e.seat];
  return [...puppetsOf(s, e.seat), e.seat];
}
function defencePool(s, seat, revolt) {
  if (revolt) return [seat]; // overlord defends with own units only (W8.4)
  const p = s.players[seat];
  if (p.puppetOf != null) return [seat, p.puppetOf]; // proxy war: overlord helps
  return [...puppetsOf(s, seat), seat];
}
const poolUnits = (s, pool) => pool.reduce((a, x) => a + s.players[x].units, 0);
function removeUnits(s, pool, n) {
  let left = n;
  for (const x of pool) {
    const k = Math.min(left, s.players[x].units);
    s.players[x].units -= k;
    s.players[x].stats.unitsLost += k;
    left -= k;
    if (!left) break;
  }
}

/**
 * Compare dice: highest with highest, second with second…
 * tieTo: 'attacker' | 'defender' | 'both' (clash: a tie costs both sides a unit)
 */
function compareDice(aRolls, dRolls, tieTo) {
  const a = [...aRolls].sort((x, y) => y - x);
  const d = [...dRolls].sort((x, y) => y - x);
  let aWon = 0;
  let dWon = 0;
  let ties = 0;
  for (let i = 0; i < Math.min(a.length, d.length); i++) {
    if (a[i] > d[i]) aWon++;
    else if (a[i] < d[i]) dWon++;
    else if (tieTo === 'attacker') aWon++;
    else if (tieTo === 'defender') dWon++;
    else ties++;
  }
  return { a, d, aWon, dWon, ties };
}

const roll = (s, n) => Array.from({ length: n }, () => rollDie(s));

// ---------------------------------------------------------------------------
// Talk & Build actions
// ---------------------------------------------------------------------------

function requireBuild(s) {
  if (!base.BUILD_PHASES.includes(s.phase)) fail('You can only do that during a Talk & Build or Trade & Build phase.');
}
function me(s, actor) {
  if (typeof actor !== 'number' || !s.players[actor]) fail('Only seated players can do that.');
  return s.players[actor];
}

/** Recruit militia: { count, materials } — any materials, unitCost each. */
function recruit(s, actor, { count = 1, materials, tile, unit = 'militia' } = {}) {
  requireBuild(s);
  const p = me(s, actor);
  if (!Number.isInteger(count) || count < 1 || count > 50) fail('Invalid number of units.');
  if (!battles.TYPES.includes(unit) || (!TW(s) && unit !== 'militia')) fail('Unknown unit type.');
  if (TW(s) && !ARS.canBuild(p, unit)) fail(`Research ${ARS.TECHS[ARS.UNITS[unit].tech].name} first.`);
  diplomacy.checkUnits(s, actor, p.units + count);
  const bag = cleanBag(materials);
  const need = (TW(s) ? TWS(s)[unit].cost : W(s).unitCost) * count;
  if (bagTotal(bag) !== need) fail(`${count === 1 ? 'A unit costs' : count + ' units cost'} ${need} materials (any mix).`);
  if (!hasBag(p.materials, bag)) fail("You don't have those materials.");
  let where = '';
  if (ST(s)) {
    // Stationed units: new units appear on a tile you control (default: your capital).
    const T = TW(s) ? getAnyTile(s, tile || p.homeTile) : getTile(s, tile || p.homeTile);
    if (TW(s) && domainOf(unit) === 'sea') {
      // Ships are launched into a sea bay next to your coast that no enemy fleet holds.
      if (T.kind !== 'sea') fail('Ships must be launched into a sea bay.');
      if (T.controller != null && T.controller !== actor) fail('Enemy ships hold that bay.');
      if (!controlled(s, actor).some((m) => areAdjacent(m, T))) fail('Launch ships into a bay next to your own coast.');
      T.controller = actor;
    } else if (T.kind !== 'land') fail('Only ships can go to sea.');
    else if (T.controller !== actor) fail('Recruit onto a tile you control.');
    addTroops(T, actor, { ...zeroTroops(), [unit]: count });
    where = ` on ${tileName(s, T)}`;
  }
  subBag(p.materials, bag);
  p.units += count;
  p.stats.unitsRecruited += count;
  const what = TW(s) ? `${count} ${unit}` : `${count} unit${count === 1 ? '' : 's'}`;
  addLog(s, `${p.name} recruited ${what}${where} (army ${p.units}).`);
}

/** Overlord sets a puppet's action, publicly. { puppet, action, target } */
function setCommand(s, actor, { puppet, action, target } = {}) {
  requireBuild(s);
  if (!isEmpire(s)) fail('Commands are part of the Empire rules.');
  const o = me(s, actor);
  const q = s.players[puppet];
  if (!q || q.puppetOf !== actor) fail('That player is not your puppet.');
  const cmd = { action };
  if (action === 'attack') {
    if (q.units < 1) fail(`${q.name} has no units to attack with.`);
    if (!attackTargets(s, puppet).includes(target)) fail(`${q.name} can't attack that tile.`);
    if (ST(s) && !attackSources(s, puppet, target).length) fail(`${q.name} has no units next to that tile.`);
    cmd.target = target;
  } else if (action !== 'sustainable' && action !== 'unsustainable') fail('Command Sustainable, Unsustainable or Attack.');
  q.command = cmd;
  const what = action === 'attack' ? `attack ${tileName(s, getTile(s, target))}` : action === 'sustainable' ? 'develop Sustainably' : 'develop Unsustainably';
  addLog(s, `${o.name} commands their puppet ${q.name} to ${what}.`, { kind: 'command' });
}

/** Toggle: give an occupied tile back at the next upkeep. */
function planWithdraw(s, actor, { tile } = {}) {
  requireBuild(s);
  const p = me(s, actor);
  const t = getTile(s, tile);
  if (t.controller !== actor || t.owner === actor) fail('You can only withdraw from a tile you occupy.');
  const list = p.plans.withdraw;
  const i = list.indexOf(tile);
  if (i >= 0) list.splice(i, 1);
  else list.push(tile);
}

/** Toggle: free a puppet at the next upkeep. */
function planRelease(s, actor, { puppet } = {}) {
  requireBuild(s);
  const p = me(s, actor);
  const q = s.players[puppet];
  if (!q || q.puppetOf !== actor) fail('That player is not your puppet.');
  const list = p.plans.release;
  const i = list.indexOf(puppet);
  if (i >= 0) list.splice(i, 1);
  else list.push(puppet);
}

// ---------------------------------------------------------------------------
// Upkeep (start of each round from round 2)
// ---------------------------------------------------------------------------

/** Militia upkeep owed: 1 material per N units (Total War: per N upkeep points by unit type). */
function upkeepDue(s, p) {
  if (!TW(s)) return Math.floor(p.units / W(s).upkeepUnitsPerMaterial);
  const cfg = TWS(s);
  let points = 0;
  for (const t of s.board.tiles) {
    const c = troopsAt(t, p.seat);
    for (const k of battles.TYPES) points += c[k] * cfg[k].upkeep;
  }
  // Hard / Brutal bots keep their armies for less.
  if (p.bot && cfg.botDifficulty === 'hard') points = (points * (cfg.botUpkeepPctHard ?? 100)) / 100;
  if (p.bot && cfg.botDifficulty === 'brutal') points = (points * (cfg.botUpkeepPctBrutal ?? 100)) / 100;
  return Math.floor(points / cfg.upkeepPointsPerMaterial);
}

/** Pay n materials, largest pile first (Q13). */
function payLargest(p, n) {
  const paid = takeLargest(p.materials, n);
  subBag(p.materials, paid);
  return paid;
}

function freePuppet(s, seat, text) {
  const q = s.players[seat];
  const was = q.puppetOf;
  // Its own provinces that fell with the capital come back with its freedom.
  if (was != null) for (const t of s.board.tiles) if (t.kind === 'land' && t.owner === seat && t.controller === was) t.controller = seat;
  q.puppetOf = null;
  q.puppetSince = null;
  q.command = null;
  addLog(s, text, { kind: 'notice', event: 'puppetFreed', seat });
  // Stationed: the old overlord's units can't stay on the freed player's tiles.
  if (ST(s)) for (const t of controlled(s, seat)) clearTile(s, t, 'home');
}

/** Total War bot difficulty: bots get extra materials at the start of every round. */
function botBonus(s) {
  const cfg = TWS(s);
  const n = cfg.botDifficulty === 'brutal' ? cfg.botBonusBrutal : cfg.botDifficulty === 'hard' ? cfg.botBonusHard : 0;
  if (!n) return;
  const bots = s.players.filter((p) => p.bot);
  if (!bots.length) return;
  // Catch-up: a bot whose army is worth less than the strongest human army gets a share
  // of the gap every round, so the bots keep pace with players who build big armies.
  const worth = (seat) => s.board.tiles.reduce((a, t) => a + battles.TYPES.reduce((b, k) => b + (troopsAt(t, seat)[k] || 0) * cfg[k].cost, 0), 0);
  const humans = s.players.filter((p) => !p.bot);
  const top = humans.length ? Math.max(...humans.map((p) => worth(p.seat))) : 0;
  const pct = cfg.botDifficulty === 'brutal' ? cfg.botCatchUpPctBrutal ?? 0 : cfg.botCatchUpPctHard ?? 0;
  const extra = {};
  for (const p of bots) {
    const gap = top - worth(p.seat);
    extra[p.seat] = gap > 0 ? Math.min(cfg.botCatchUpMax ?? 15, Math.round((gap * pct) / 100)) : 0;
    // Spread it out: each material goes to the smallest pile.
    for (let i = 0; i < n + extra[p.seat]; i++) {
      const m = ['wood', 'stone', 'sandbag'].reduce((a, x) => (p.materials[x] < p.materials[a] ? x : a), 'wood');
      p.materials[m]++;
    }
  }
  const caught = bots.filter((p) => extra[p.seat] > 0);
  addLog(s, `🤖 ${cfg.botDifficulty === 'brutal' ? 'Brutal' : 'Hard'} bots: each bot gets +${n} materials${caught.length ? ` (catching up: ${caught.map((p) => `${p.name} +${extra[p.seat]}`).join(', ')})` : ''}.`);
}

function upkeep(s) {
  const w = W(s);
  if (TW(s)) {
    finishResearch(s);
    botBonus(s);
  }
  // 1. Planned withdrawals and releases
  for (const p of s.players) {
    for (const id of p.plans.withdraw) {
      const t = s.board.tiles.find((x) => x.id === id);
      if (t && t.controller === p.seat && t.owner !== p.seat) {
        t.controller = t.owner;
        if (ST(s)) clearTile(s, t, 'home'); // units there go back to your capital
        addLog(s, `${p.name} withdraws from ${tileName(s, t)}.`);
      }
    }
    for (const q of p.plans.release) {
      if (s.players[q].puppetOf === p.seat) freePuppet(s, q, `${p.name} frees their puppet ${s.players[q].name}.`);
    }
    p.plans = { withdraw: [], release: [] };
  }

  // 2. Militia upkeep: 1 material per N units, rounded down
  if (s.round >= w.upkeepFromRound) {
    for (const p of s.players) {
      const due = () => upkeepDue(s, p);
      let disbanded = 0;
      while (due() > bagTotal(p.materials)) {
        if (ST(s)) removeFromLargest(s, p.seat, 1); // biggest stack first
        p.units--;
        disbanded++;
      }
      const n = due();
      const paid = n ? payLargest(p, n) : null;
      p.stats.unitsDisbanded += disbanded;
      p.stats.upkeepPaid += n;
      if (disbanded) addLog(s, `${p.name} couldn't pay militia upkeep and disbanded ${disbanded} unit${disbanded === 1 ? '' : 's'}.`, { kind: 'bad' });
      if (paid) addLog(s, `${p.name} paid ${describeBag(paid)} militia upkeep for ${p.units} units.`);
    }
  }

  // 3. Garrison (Empire): unpaid puppets are freed, most recent first (Q25)
  if (isEmpire(s)) {
    const cost = (n) => {
      const table = E(s).garrisonCost;
      return n === 0 ? 0 : table[n] !== undefined ? table[n] : table[Math.max(...Object.keys(table).map(Number))];
    };
    for (const o of s.players) {
      let list = puppetsOf(s, o.seat);
      while (list.length && cost(list.length) > bagTotal(o.materials)) {
        const latest = list.reduce((a, b) => (s.players[b].puppetSince > s.players[a].puppetSince ? b : a));
        freePuppet(s, latest, `⛓ ${s.players[latest].name} is FREE: ${o.name} couldn't pay the ${cost(list.length)}-material garrison at the start of the round.`);
        list = puppetsOf(s, o.seat);
      }
      if (list.length) {
        const paid = payLargest(o, cost(list.length));
        o.stats.garrisonPaid += bagTotal(paid);
        addLog(s, `${o.name} paid ${describeBag(paid)} garrison for ${list.length} puppet${list.length === 1 ? '' : 's'}.`);
      }
    }
  }

  // 4. Occupation pollutes: Flood +N per occupying player (not per tile). 0 by default.
  const occupiers = s.players.filter((p) => isOccupier(s, p.seat));
  if (occupiers.length && w.occupationFlood > 0) {
    const rise = occupiers.length * w.occupationFlood;
    s.flood += rise;
    addLog(s, `Occupation: ${occupiers.map((p) => p.name).join(', ')} ${occupiers.length === 1 ? 'is' : 'are'} occupying. Flood +${rise} to ${s.flood}.`, { kind: 'flood' });
  }

  // 5. Armies pollute (militarisation): Flood +1 for every N units a player owns, rounded down.
  if (w.armyFloodPerUnits > 0) {
    const parts = [];
    let rise = 0;
    for (const p of s.players) {
      const f = armyFlood(s, p);
      if (!f) continue;
      rise += f;
      p.stats.armyFlood += f;
      parts.push(`${p.name} (${p.units} units) +${f}`);
    }
    if (rise) {
      s.flood += rise;
      s.floodFromArmies += rise;
      addLog(s, `Army emissions: ${parts.join(', ')}. Flood +${rise} to ${s.flood}.`, { kind: 'flood' });
    }
  }
  if (s.phase !== 'ended') {
    checkAccord(s);
    base.checkCatastrophe(s);
  }
}

/** Flood this player's army will add at the next upkeep. */
function armyFlood(s, p) {
  const k = W(s).armyFloodPerUnits;
  return k > 0 ? Math.floor(p.units / k) : 0;
}

/**
 * Destruction pollutes: every N units destroyed in battle (any side) add Flood +1.
 * Leftover losses carry over to the next battle.
 */
function destructionFlood(s, destroyed) {
  const k = W(s).destructionFloodPerUnits;
  if (!(k > 0) || destroyed <= 0) return;
  s.destroyedPool += destroyed;
  const rise = Math.floor(s.destroyedPool / k);
  s.destroyedPool %= k;
  if (!rise) return;
  s.flood += rise;
  s.floodFromDestruction += rise;
  addLog(s, `Destruction: ${destroyed} unit${destroyed === 1 ? '' : 's'} destroyed. Flood +${rise} to ${s.flood}.`, { kind: 'flood' });
  checkAccord(s);
  base.checkCatastrophe(s);
}

// ---------------------------------------------------------------------------
// Climate Accord
// ---------------------------------------------------------------------------

function checkAccord(s) {
  if (TW(s)) return; // Total War has no Climate Accord
  if (s.accordBroken || s.flood < W(s).accordLine) return;
  s.accordBroken = true;
  s.accordBrokeRound = s.round;
  for (const p of s.players) if (p.sanctionedThrough != null && p.sanctionedThrough > s.round) p.sanctionedThrough = s.round;
  addLog(s, `The Flood reached ${s.flood}: the CLIMATE ACCORD IS BROKEN. No more sanctions or international aid, ever. Current sanctions end this round.`, {
    kind: 'bad',
  });
}

function applySanction(s, e, T, resistance) {
  if (TW(s)) return;
  if (s.accordBroken || e.kind === 'revolt' || resistance || T.controller == null) return;
  const A = s.players[e.seat];
  const who = A.puppetOf != null ? s.players[A.puppetOf] : A; // commanded attack: the overlord (Q24)
  who.sanctionedThrough = s.round + W(s).sanctionRounds;
  who.stats.sanctions += 1;
  addLog(s, `${who.name} is SANCTIONED until the end of round ${who.sanctionedThrough}: no trading, gifts or market.`, { kind: 'bad' });
}

// ---------------------------------------------------------------------------
// Choose secretly
// ---------------------------------------------------------------------------

const ACTION_LABEL = { sustainable: 'Sustainable', unsustainable: 'Unsustainable', attack: 'Attack', revolt: 'Revolt' };

/**
 * { action: 'sustainable', mix?, aid? }   mix = the free part (Mixed tiles / production access)
 * { action: 'unsustainable', mix, aid? }
 * { action: 'attack', target: tileId }
 * { action: 'revolt' }                    puppets only: attack your overlord's capital
 */
function choose(s, actor, { action, mix, target, aid, from, count, troops } = {}) {
  if (s.phase !== 'choose') fail('It is not time to choose an action.');
  const p = me(s, actor);
  const ch = { action };
  if (p.puppetOf != null) {
    const cmd = effectiveCommand(s, p);
    if (action !== 'revolt' && action !== cmd.action) fail(`Your overlord commanded ${ACTION_LABEL[cmd.action]}. Play it, or revolt.`);
    if (action === 'attack') target = cmd.target;
  } else if (action === 'revolt') fail('Only puppets can revolt.');

  if (action === 'sustainable') {
    const prod = production(s, actor);
    ch.mix = prod.free > 0 ? cleanBag(mix, 'mix') : emptyBag();
    if (bagTotal(ch.mix) !== prod.free) fail(`Pick exactly ${prod.free} materials.`);
    if (MATERIALS.some((m) => ch.mix[m] > 0 && !prod.allowed.includes(m))) fail('You can only pick materials your tiles produce.');
  } else if (action === 'unsustainable') {
    diplomacy.checkMove(s, actor, 'unsustainable');
    const n = production(s, actor).unsustainable;
    ch.mix = cleanBag(mix, 'mix');
    if (bagTotal(ch.mix) !== n) fail(`Pick exactly ${n} materials.`);
  } else if (action === 'attack') {
    if (p.puppetOf == null && !attackTargets(s, actor).includes(target)) {
      const T0 = s.board.tiles.find((x) => x.id === target);
      if (T0 && T0.controller != null && T0.controller !== actor && inTruce(s)) fail(`Opening truce: no attacks on other players until round ${TWS(s).truceRounds + 1}.`);
      fail("You can't attack that tile.");
    }
    const T = TW(s) ? getAnyTile(s, target) : getTile(s, target);
    diplomacy.checkMove(s, actor, 'attack', T.controller);
    if (ST(s)) {
      const src = s.board.tiles.find((x) => x.id === from);
      const okSrc = TW(s) ? attackSources(s, actor, target).some((x) => x.tile === from) : src && src.controller === actor && areAdjacent(src, T);
      if (!src || src.controller !== actor || !okSrc) fail(T.kind === 'sea' ? 'Sail from a sea bay your ships hold.' : 'Attack from one of your tiles next to the target (or across a sea bay you hold).');
      if (TW(s)) {
        const tr = troops ? cleanTroops(troops) : null;
        const have = troopsAt(src, actor);
        if (tr && battles.TYPES.some((k) => tr[k] > 0 && (domainOf(k) === 'sea') !== (T.kind === 'sea'))) fail(T.kind === 'sea' ? 'Only ships can fight at sea.' : "Ships can't go ashore — they shell the coast from their bay instead.");
        if (tr && battles.TYPES.some((k) => tr[k] > have[k])) fail("You don't have those troops on that tile.");
        if (tr) {
          count = battles.sum(tr);
          ch.troops = tr;
          const srcInfo = attackSources(s, actor, target).find((x) => x.tile === from);
          if (srcInfo && srcInfo.capacity && count > srcInfo.capacity) fail(`Your ships off ${from} can carry ${srcInfo.capacity} troops (${TWS(s).transportPerShip ?? 3} per ship). Send fewer or bring more ships.`);
        }
      }
      checkSend(src, actor, count);
      Object.assign(ch, { from, count });
    } else if (poolUnits(s, attackPool(s, { seat: actor, kind: 'attack' })) < 1) fail('You need at least 1 unit to attack.');
    ch.target = target;
  } else if (action === 'revolt') {
    if (p.units < 1) fail('You need at least 1 unit to revolt.');
    diplomacy.checkMove(s, actor, 'attack', p.puppetOf);
    if (ST(s)) {
      const src = s.board.tiles.find((x) => x.id === from);
      if (!src || src.controller !== actor) fail('Revolt from one of your own tiles.');
      checkSend(src, actor, count);
      Object.assign(ch, { from, count });
    }
  } else {
    fail('Choose Sustainable, Unsustainable or Attack.');
  }
  if ((action === 'sustainable' || action === 'unsustainable') && aidEligible(s, p)) {
    ch.aid = MATERIALS.includes(aid) ? aid : leastHeld(p);
  }
  p.choice = ch;
  if (s.players.every((x) => x.choice)) reveal(s);
}

/** Used when the host skips a player. */
function defaultChoice(s, p) {
  const evenOf = (n, allowed) => {
    const b = emptyBag();
    for (let i = 0; i < n; i++) b[allowed[i % allowed.length]]++;
    return b;
  };
  let action = 'sustainable';
  if (p.puppetOf != null) action = effectiveCommand(s, p).action;
  const ch = { action };
  if (action === 'attack') {
    ch.target = effectiveCommand(s, p).target;
    if (ST(s)) {
      const best = attackSources(s, p.seat, ch.target).sort((a, b) => b.units - a.units)[0];
      Object.assign(ch, { from: best.tile, count: best.units });
    }
  }
  else if (action === 'sustainable') {
    const prod = production(s, p.seat);
    ch.mix = evenOf(prod.free, prod.allowed);
  } else ch.mix = evenOf(production(s, p.seat).unsustainable, MATERIALS);
  if (action !== 'attack' && aidEligible(s, p)) ch.aid = leastHeld(p);
  return ch;
}

// ---------------------------------------------------------------------------
// Reveal & collect
// ---------------------------------------------------------------------------

function choiceText(s, p) {
  const ch = p.choice;
  const ordered = p.puppetOf != null && ch.action !== 'revolt' ? ' (as commanded)' : '';
  if (ch.action === 'attack') return `Attack on ${tileName(s, getAnyTile(s, ch.target))}${ordered}`;
  if (ch.action === 'revolt') return `REVOLT against ${s.players[p.puppetOf].name}`;
  return ACTION_LABEL[ch.action] + ordered;
}

function reveal(s) {
  const w = W(s);
  const order = base.clockwise(s);
  addLog(s, 'Revealed: ' + order.map((i) => `${s.players[i].name} — ${choiceText(s, s.players[i])}`).join('; ') + '.', { kind: 'reveal' });

  let rise = 0;
  for (const i of order) {
    const p = s.players[i];
    const ch = p.choice;
    p.stats[ch.action] += 1;
    const fight = ch.action === 'attack' || ch.action === 'revolt';
    const prod = production(s, i);
    const bag = { ...prod.passive }; // passive income from every tile you hold
    if (ch.action === 'sustainable') addBag(addBag(bag, prod.fixed), ch.mix);
    if (ch.action === 'unsustainable') addBag(bag, ch.mix);
    const notes = [];
    if (fight) {
      rise += w.attackFlood;
      notes.push(`${ch.action === 'revolt' ? 'revolting' : 'attacking'}: tile income only`);
    }
    const getsAid = !fight && ch.aid && aidEligible(s, p); // checked before this round's Flood rises (Q16)
    if (p.damaged) {
      const lost = takeLargest(bag, w.damagedPenalty);
      subBag(bag, lost);
      p.damaged = false;
      notes.push(`−${bagTotal(lost)} Damaged`);
    }
    if (getsAid) {
      bag[ch.aid] += w.aidAmount;
      p.stats.aidReceived += w.aidAmount;
      notes.push(`+${w.aidAmount} ${ch.aid} international aid`);
    }
    addBag(p.materials, bag);
    if (ch.action === 'unsustainable') {
      rise += s.settings.base.unsustainableFlood;
      notes.push(`Flood +${s.settings.base.unsustainableFlood}`);
    }
    addLog(s, `${p.name} collected ${describeBag(bag)}${notes.length ? ' (' + notes.join(', ') + ')' : ''}.`);
    // Tribute: half of everything a puppet collects, rounded up (Q20)
    if (p.puppetOf != null && bagTotal(bag) > 0) {
      const o = s.players[p.puppetOf];
      const t = takeLargest(bag, Math.ceil(bagTotal(bag) / E(s).tributeDivisor));
      subBag(p.materials, t);
      addBag(o.materials, t);
      p.stats.tributePaid += bagTotal(t);
      o.stats.tributeReceived += bagTotal(t);
      addLog(s, `${p.name} pays ${describeBag(t)} tribute to ${o.name}.`);
    }
  }
  if (rise > 0) {
    s.flood += rise;
    addLog(s, `The Flood rises by ${rise} to ${s.flood} (catastrophe at ${base.threshold(s)}).`, { kind: 'flood' });
  }
  checkAccord(s);
  if (base.checkCatastrophe(s)) return;

  if (TW(s)) {
    const twEntries = order
      .filter((i) => s.players[i].choice.action === 'attack')
      .map((i) => ({ seat: i, tile: s.players[i].choice.target, from: s.players[i].choice.from, count: s.players[i].choice.count, troops: s.players[i].choice.troops || null }));
    startBattles(s, twEntries);
    return;
  }

  // Battle list: clashes first, then other attacks clockwise from the starting player.
  const entries = order
    .filter((i) => ['attack', 'revolt'].includes(s.players[i].choice.action))
    .map((i) => {
      const p = s.players[i];
      const ch = p.choice;
      return ch.action === 'revolt' ? { seat: i, kind: 'revolt', from: ch.from, count: ch.count } : { seat: i, kind: 'attack', tile: ch.target, from: ch.from, count: ch.count };
    });
  const ctrl = (id) => s.board.tiles.find((t) => t.id === id).controller;
  const inClash = new Set();
  const clashes = [];
  for (const a of entries) {
    if (a.kind !== 'attack' || inClash.has(a)) continue;
    const b = entries.find((x) => x !== a && x.kind === 'attack' && !inClash.has(x) && ctrl(a.tile) === x.seat && ctrl(x.tile) === a.seat);
    if (b) {
      inClash.add(a).add(b);
      clashes.push({ type: 'clash', a, b });
    }
  }
  s.battleQueue = [...clashes, ...entries.filter((e) => !inClash.has(e)).map((e) => ({ type: 'attack', e }))];
  continueBattles(s);
}

// ---------------------------------------------------------------------------
// Resolve attacks
// ---------------------------------------------------------------------------

function continueBattles(s) {
  while (s.battleQueue && s.battleQueue.length) {
    const b = s.battleQueue.shift();
    const lostBefore = s.players.reduce((a, p) => a + p.stats.unitsLost, 0);
    const r = b.type === 'clash' ? resolveClash(s, b) : resolveAttack(s, b.e);
    destructionFlood(s, s.players.reduce((a, p) => a + p.stats.unitsLost, 0) - lostBefore);
    if (s.phase === 'ended') return; // the battle's destruction caused a catastrophe
    if (r === 'pick') {
      s.phase = 'loot';
      return;
    }
  }
  s.pendingLoot = null;
  base.startTradePhase(s);
}

/** Winner takes up to `max` tokens; pauses for the loot picker when there's a real choice. */
function grantLoot(s, taker, from, max) {
  const A = s.players[taker];
  const D = s.players[from];
  const avail = bagTotal(D.materials);
  const n = Math.min(max, avail);
  if (n <= 0) {
    addLog(s, `${D.name} had nothing to take.`);
    return;
  }
  if (avail <= max || MATERIALS.filter((m) => D.materials[m] > 0).length === 1) {
    const take = avail <= max ? { ...D.materials } : { ...emptyBag(), [MATERIALS.find((m) => D.materials[m] > 0)]: n };
    subBag(D.materials, take);
    addBag(A.materials, take);
    A.stats.tokensStolen += bagTotal(take);
    addLog(s, `${A.name} takes ${describeBag(take)} from ${D.name}.`);
    return;
  }
  addLog(s, `${A.name} is choosing ${n} tokens to take from ${D.name}…`);
  s.pendingLoot = { id: s.seq, raider: taker, target: from, count: n };
  return 'pick';
}

function capture(s, overlord, victim) {
  const O = s.players[overlord];
  const V = s.players[victim];
  for (const q of puppetsOf(s, victim)) freePuppet(s, q, `${s.players[q].name} is freed because their overlord ${V.name} has fallen.`);
  const old = V.puppetOf;
  V.puppetOf = overlord;
  V.puppetSince = s.seq;
  V.command = null;
  V.plans = { withdraw: V.plans.withdraw, release: [] };
  const takeAll = E(s).capitalTakesAll !== false;
  const cap = getTile(s, V.homeTile);
  // The rest of the territory: with capitalTakesAll it falls with the capital (to the
  // new overlord, empty); otherwise the provinces go back to the puppet as before.
  const rest = s.board.tiles.filter((t) => t.kind === 'land' && t !== cap && ((t.owner === victim && t.role === 'province') || t.controller === victim));
  if (ST(s)) {
    // Units on the fallen capital are destroyed.
    for (const [k, n] of Object.entries(cap.units || {})) s.players[k].stats.unitsLost += n;
    cap.units = {};
    cap.troops = {};
    for (const t of rest) {
      if (takeAll) {
        // The victim's troops there surrender; anyone else's go home.
        const lost = unitsAt(t, victim);
        V.stats.unitsLost += lost;
        setTroops(t, victim, zeroTroops());
        t.controller = overlord;
      } else if (t.owner === victim) t.controller = victim;
      clearTile(s, t, 'home');
    }
  } else for (const t of rest) t.controller = takeAll ? overlord : t.owner === victim ? victim : t.controller;
  O.stats.captures += 1;
  addLog(
    s,
    `${V.name}'s capital falls! ${V.name} becomes ${O.name}'s PUPPET${old != null ? ` (no longer ${s.players[old].name}'s)` : ''}. ${takeAll ? `The rest of ${V.name}'s land falls with it — ${O.name} now holds ${rest.length ? rest.map((t) => t.id).join(', ') : 'it'}.` : `${V.name}'s provinces return to them.`}`,
    { kind: 'bad' },
  );
}

/** Effects of winning a battle for tile T against defender D. */
function applyWin(s, { e, taker, D, T }) {
  const A = s.players[e.seat];
  const Dp = s.players[D];
  if (e.kind === 'revolt') {
    A.stats.revoltsWon += 1;
    freePuppet(s, e.seat, `${A.name}'s revolt succeeds — ${A.name} is free!`);
    return grantLoot(s, e.seat, D, E(s).revoltLoot);
  }
  if (T.role === 'capital') {
    if (isEmpire(s) && T.owner === D) {
      capture(s, taker, D);
      return grantLoot(s, taker, D, Math.floor(bagTotal(Dp.materials) / E(s).captureStockDivisor));
    }
    Dp.damaged = true;
    addLog(s, `${Dp.name}'s capital holds, but ${Dp.name} is Damaged.`);
    return grantLoot(s, taker, D, W(s).maxLoot);
  }
  const retake = T.owner === taker;
  const name = tileName(s, T); // name it before it changes hands
  T.controller = taker;
  Dp.damaged = true;
  addLog(s, retake ? `${s.players[taker].name} retakes ${name}. ${Dp.name} is Damaged.` : `${s.players[taker].name} occupies ${name}. ${Dp.name} is Damaged.`);
  return grantLoot(s, taker, D, W(s).maxLoot);
}

function resolveAttack(s, e) {
  if (ST(s)) return resolveAttackST(s, e);
  const w = W(s);
  const A = s.players[e.seat];
  const revolt = e.kind === 'revolt';
  let T;
  if (revolt) {
    if (A.puppetOf == null) {
      addLog(s, `${A.name}'s revolt fizzles: they are already free.`);
      return;
    }
    T = getTile(s, s.players[A.puppetOf].homeTile);
  } else T = getTile(s, e.tile);
  const taker = !revolt && A.puppetOf != null ? A.puppetOf : e.seat; // commanded attacks win for the overlord
  const name = tileName(s, T);
  const aPool = attackPool(s, e);
  if (poolUnits(s, aPool) < 1) {
    addLog(s, `${A.name}'s attack on ${name} fizzles: no units left.`);
    return;
  }
  if (!revolt) {
    const ctrlP = T.controller != null ? s.players[T.controller] : null;
    if (T.controller === taker || T.controller === e.seat || (ctrlP && ctrlP.puppetOf === taker)) {
      addLog(s, `${A.name}'s attack on ${name} fizzles: it is already on their side.`);
      return;
    }
    if (T.role === 'capital' && !capitalOpen(s, T)) {
      addLog(s, `${A.name}'s attack on ${name} fizzles: its provinces are no longer both occupied.`);
      return;
    }
  }
  if (T.controller == null) {
    if (!w.openTilesClaimable) {
      addLog(s, `${A.name}'s attack fizzles: open tiles can't be claimed.`);
      return;
    }
    T.controller = taker;
    A.stats.claims += 1;
    addLog(s, `${A.name} claims ${name} for ${taker === e.seat ? 'themselves' : s.players[taker].name}.`);
    return;
  }

  const D = T.controller;
  const Dp = s.players[D];
  diplomacy.onHostile(s, e.seat, D); // remembers the attack; breaks any pact between them
  const resistance = T.owner === e.seat || T.owner === taker;
  applySanction(s, e, T, resistance);
  Dp.stats.timesAttacked += 1;
  const dPool = defencePool(s, D, revolt);
  const dUnits = poolUnits(s, dPool);
  const verb = revolt ? 'revolted against' : 'attacked';
  let won;
  let text;
  let dice = null;
  if (dUnits === 0) {
    won = true;
    text = `${A.name} ${verb} ${name}. ${Dp.name} had no units to defend — ${A.name} wins automatically.`;
  } else {
    const aN = Math.min(poolUnits(s, aPool), w.maxAttackDice);
    const dN = Math.min(dUnits, w.maxDefenceDice) + (T.role === 'capital' ? w.capitalExtraDefenceDice : 0);
    const r = compareDice(roll(s, aN), roll(s, dN), revolt || resistance ? 'attacker' : 'defender');
    removeUnits(s, aPool, r.dWon);
    removeUnits(s, dPool, r.aWon);
    won = r.aWon > r.dWon;
    const tieNote = revolt ? ' (ties go to the rebel)' : resistance ? ' (ties go to the owner)' : '';
    text =
      `${A.name} ${verb} ${name}: ${r.a.join(', ')} vs ${r.d.join(', ')}${tieNote}. ` +
      (won ? `${A.name} wins` : `${Dp.name} holds`) +
      ` (${A.name} loses ${r.dWon}, ${Dp.name} loses ${r.aWon} unit${r.aWon === 1 ? '' : 's'}).`;
    dice = {
      title: `${revolt ? 'Revolt' : 'Attack'}: ${A.name} → ${Dp.name}`,
      sides: [
        { seat: e.seat, rolls: r.a },
        { seat: D, rolls: r.d },
      ],
      winner: won ? e.seat : D,
    };
  }
  addLog(s, text, { kind: 'battle', dice });
  if (!won) {
    A.stats.attacksLost += 1;
    if (revolt) addLog(s, `${A.name} stays ${Dp.name}'s puppet.`);
    return;
  }
  A.stats.attacksWon += 1;
  return applyWin(s, { e, taker, D, T });
}

/** Two players attacked each other: one battle, both roll as attackers, ties cost both. */
function resolveClash(s, { a, b }) {
  if (ST(s)) return resolveClashST(s, { a, b });
  const w = W(s);
  const A = s.players[a.seat];
  const B = s.players[b.seat];
  const TA = getTile(s, a.tile); // A's target (held by B)
  const TB = getTile(s, b.tile); // B's target (held by A)
  const poolA = attackPool(s, a);
  const poolB = attackPool(s, b);
  s.clashCount += 1;
  A.stats.clashes += 1;
  B.stats.clashes += 1;
  diplomacy.onHostile(s, a.seat, b.seat);
  diplomacy.onHostile(s, b.seat, a.seat);
  applySanction(s, a, TA, TA.owner === a.seat || TA.owner === A.puppetOf);
  applySanction(s, b, TB, TB.owner === b.seat || TB.owner === B.puppetOf);
  const ua = poolUnits(s, poolA);
  const ub = poolUnits(s, poolB);
  let aWins;
  let text;
  let dice = null;
  if (!ua || !ub) {
    aWins = ua > ub ? true : ub > ua ? false : null;
    text = `CLASH between ${A.name} and ${B.name}. ` + (aWins === null ? 'Neither has units left — nothing happens.' : `${aWins ? B.name : A.name} has no units — ${aWins ? A.name : B.name} wins.`);
  } else {
    const r = compareDice(roll(s, Math.min(ua, w.maxAttackDice)), roll(s, Math.min(ub, w.maxAttackDice)), 'both');
    removeUnits(s, poolA, r.dWon + r.ties);
    removeUnits(s, poolB, r.aWon + r.ties);
    aWins = r.aWon > r.dWon ? true : r.dWon > r.aWon ? false : null;
    text =
      `CLASH! ${A.name} and ${B.name} attacked each other: ${r.a.join(', ')} vs ${r.d.join(', ')}. ` +
      (aWins === null ? 'An even split — nothing changes hands' : `${aWins ? A.name : B.name} wins`) +
      ` (${A.name} loses ${r.dWon + r.ties}, ${B.name} loses ${r.aWon + r.ties}).`;
    dice = {
      title: `Clash: ${A.name} ⚔ ${B.name}`,
      sides: [
        { seat: a.seat, rolls: r.a },
        { seat: b.seat, rolls: r.d },
      ],
      winner: aWins === null ? null : aWins ? a.seat : b.seat,
    };
  }
  addLog(s, text, { kind: 'battle', dice });
  if (aWins === null) return;
  const [win, lose, T] = aWins ? [a, b, TA] : [b, a, TB];
  const W_ = s.players[win.seat];
  W_.stats.attacksWon += 1;
  s.players[lose.seat].stats.attacksLost += 1;
  const taker = W_.puppetOf != null ? W_.puppetOf : win.seat;
  return applyWin(s, { e: win, taker, D: T.controller, T });
}

// ---------------------------------------------------------------------------
// Extra info for each player's view
// ---------------------------------------------------------------------------

function decorateView(v, s, seat) {
  const w = W(s);
  v.war = {
    accordBroken: s.accordBroken,
    accordBrokeRound: s.accordBrokeRound,
    accordLine: w.accordLine,
    clashCount: s.clashCount,
    destroyedPool: s.destroyedPool,
    floodFromArmies: s.floodFromArmies,
    floodFromDestruction: s.floodFromDestruction,
  };
  for (const p of v.players) {
    const sp = s.players[p.seat];
    p.sanctioned = isSanctioned(s, sp);
    p.puppets = puppetsOf(s, p.seat);
    p.occupier = isOccupier(s, p.seat);
    p.aidEligible = aidEligible(s, sp);
    p.tilesHeld = controlled(s, p.seat).length;
    p.upkeepDue = s.round + 1 >= w.upkeepFromRound ? Math.floor(sp.units / w.upkeepUnitsPerMaterial) : 0;
    p.armyFloodDue = armyFlood(s, sp);
    if (isEmpire(s) && p.puppets.length) {
      const t = E(s).garrisonCost;
      p.garrisonDue = t[p.puppets.length] !== undefined ? t[p.puppets.length] : t[Math.max(...Object.keys(t).map(Number))];
    } else p.garrisonDue = 0;
    if (sp.puppetOf != null) p.effectiveCommand = effectiveCommand(s, sp);
    if (p.seat === seat) p.production = production(s, seat);
  }
  const mine = s.players[seat];
  v.attackTargets = mine && mine.puppetOf == null ? attackTargets(s, seat) : [];
  v.commandTargets = {};
  if (mine) for (const q of puppetsOf(s, seat)) v.commandTargets[q] = attackTargets(s, q);
  delete v.battleQueue;
  // Battles waiting their turn (each player fights one at a time). Troop details stay hidden.
  v.battleWaiting = (s.battleQueueTW || []).map((e) => {
    const T = getAnyTile(s, e.tile);
    return { attacker: e.seat, defender: T.controller, tile: e.tile, name: tileName(s, T) };
  });
  delete v.battleQueueTW;
  if (TW(s)) {
    v.war.noAccord = true;
    const cfg = TWS(s);
    const meP = s.players[seat];
    v.tw = {
      truce: inTruce(s) ? cfg.truceRounds : 0, // last round of the opening truce (0 = none)
      units: battles.TYPES.map((k) => ({ type: k, ...cfg[k], ...ARS.UNITS[k], unlocked: meP ? ARS.canBuild(meP, k) : false, level: meP ? ARS.levelOf(meP, k) : 1, leveled: ARS.LEVELED.includes(k) })),
      techs: ARS.TECH_IDS.map((id) => ({ id, ...ARS.TECHS[id], cost: ARS.techCost(cfg, id) })),
      formations: battles.FORMATION_IDS.map((id) => ({ id, name: battles.FORMATIONS[id].name, desc: battles.FORMATIONS[id].desc, ...cfg.formations[id] })),
      mapW: battles.MAP_W,
      mapH: battles.MAP_H,
      seas: meP ? s.board.tiles.filter((t) => t.kind === 'sea' && (t.controller == null || t.controller === seat) && controlled(s, seat).some((m) => areAdjacent(m, t))).map((t) => t.id) : [],
    };
    for (const p of v.players) {
      p.upkeepDue = upkeepDue(s, s.players[p.seat]);
      p.research = researchOf(s.players[p.seat]);
    }
  }
  if (ST(s)) {
    v.stationed = true;
    v.attackSources = {};
    const targets = [...v.attackTargets];
    if (mine && mine.puppetOf != null) {
      const c = effectiveCommand(s, mine);
      if (c.action === 'attack') targets.push(c.target);
    }
    for (const id of targets) v.attackSources[id] = attackSources(s, seat, id);
    v.revoltSources = mine && mine.puppetOf != null ? controlled(s, seat).filter((t) => unitsAt(t, seat) > 0).map((t) => ({ tile: t.id, units: unitsAt(t, seat) })) : [];
    v.standTiles = mine ? s.board.tiles.filter((t) => canStand(s, seat, t)).map((t) => t.id) : [];
    if (TW(s) && mine) v.seaTiles = s.board.tiles.filter((t) => t.kind === 'sea' && (t.controller === seat || t.controller == null)).map((t) => t.id);
    if (TW(s) && LANES(s)) v.blockaded = s.board.tiles.filter((t) => blockaded(s, t)).map((t) => t.id);
    if (TW(s) && mine) v.bombardTargets = bombardTargets(s, seat);
  }
}

// ===========================================================================
// STATIONED UNITS (setting war.stationedUnits, on by default)
// Units live on tiles, like Risk: tile.units = { seat: count }.
// p.units is always kept equal to the player's total, so upkeep and the
// screens work the same either way.
// ===========================================================================

function ST(s) {
  return !!W(s).stationedUnits;
}
function unitsAt(t, seat) {
  return (t.units && t.units[seat]) || 0;
}
/**
 * Units on a tile can be of different types (Total War: militia, infantry, cavalry;
 * other modes only ever use militia). t.units[seat] is the total, t.troops[seat]
 * the breakdown. These helpers keep the two in step.
 */
const zeroTroops = () => ARS.zero();
function troopsAt(t, seat) {
  const n = unitsAt(t, seat);
  const tr = t.troops && t.troops[seat];
  if (!tr || battles.sum(tr) !== n) return { ...zeroTroops(), militia: n };
  return { ...zeroTroops(), ...tr };
}
function setTroops(t, seat, c) {
  if (!t.units) t.units = {};
  if (!t.troops) t.troops = {};
  const n = battles.sum(c);
  if (n <= 0) {
    delete t.units[seat];
    delete t.troops[seat];
    if (t.vet) delete t.vet[seat];
    return;
  }
  t.units[seat] = n;
  t.troops[seat] = Object.fromEntries(battles.TYPES.filter((k) => c[k] > 0).map((k) => [k, c[k]]));
  normVet(t, seat);
}
function addTroops(t, seat, c) {
  const cur = troopsAt(t, seat);
  for (const k of battles.TYPES) cur[k] += c[k] || 0;
  setTroops(t, seat, cur);
  if (RANKS.has(c)) addRanks(t, seat, RANKS.get(c));
}

// ---------------------------------------------------------------- veterans (Total War)
// Each tile remembers how many of a player's units of each type are veterans:
// t.vet[seat][type] = [seasoned, veteran, elite] (the rest are green recruits).
// Units that survive a battle go up a rank. When troops leave a tile the best go
// first; when units are lost outside battle (upkeep, shelling, convoys) recruits go first.
// Troop counts being carried somewhere get their ranks attached here:
const RANKS = new WeakMap();
const tagRanks = (c, rk) => {
  if (rk && Object.keys(rk).length) RANKS.set(c, rk);
  return c;
};
function vetAt(t, seat) {
  return (t.vet && t.vet[seat]) || {};
}
/** Veterans never outnumber the units of their type; the least experienced go first. */
function normVet(t, seat) {
  if (!t.vet || !t.vet[seat]) return;
  const tr = troopsAt(t, seat);
  const v = t.vet[seat];
  for (const k of Object.keys(v)) {
    let over = v[k][0] + v[k][1] + v[k][2] - (tr[k] || 0);
    for (let r = 0; r < 3 && over > 0; r++) {
      const x = Math.min(over, v[k][r]);
      v[k][r] -= x;
      over -= x;
    }
    if (!v[k].some(Boolean)) delete v[k];
  }
  if (!Object.keys(v).length) delete t.vet[seat];
}
function addRanks(t, seat, rk) {
  if (!rk) return;
  t.vet = t.vet || {};
  const v = (t.vet[seat] = t.vet[seat] || {});
  for (const [k, a] of Object.entries(rk)) {
    const cur = (v[k] = v[k] || [0, 0, 0]);
    for (let r = 0; r < 3; r++) cur[r] += a[r] || 0;
  }
  normVet(t, seat);
}
/** Take the best-ranked units (elite first) for counts c out of a rank table (changes it). */
function pickBest(table, c) {
  const out = {};
  for (const k of battles.TYPES) {
    let n = c[k] || 0;
    const a = table[k];
    if (!n || !a) continue;
    const o = [0, 0, 0];
    for (let r = 2; r >= 0 && n > 0; r--) {
      const x = Math.min(n, a[r]);
      a[r] -= x;
      o[r] += x;
      n -= x;
    }
    if (o.some(Boolean)) out[k] = o;
  }
  return out;
}
/** Run take() (which removes troops from t and returns them): the best ranks leave with them. */
function withRanks(t, seat, take) {
  const snap = JSON.parse(JSON.stringify(vetAt(t, seat)));
  const taken = take();
  const rk = pickBest(snap, taken);
  t.vet = t.vet || {};
  t.vet[seat] = snap;
  normVet(t, seat);
  return tagRanks(taken, rk);
}
function mergeRanks(...list) {
  const out = {};
  for (const rk of list)
    for (const [k, a] of Object.entries(rk || {})) {
      const cur = (out[k] = out[k] || [0, 0, 0]);
      for (let r = 0; r < 3; r++) cur[r] += a[r] || 0;
    }
  return out;
}
function takeTroops(t, seat, c) {
  const cur = troopsAt(t, seat);
  for (const k of battles.TYPES) {
    if (cur[k] < (c[k] || 0)) fail("You don't have those troops there.");
    cur[k] -= c[k] || 0;
  }
  setTroops(t, seat, cur);
  return { ...zeroTroops(), ...c };
}
/** Take n units, cheapest types first (only types that can go to `domainFilter`). Returns what was taken. */
function takeCheapest(t, seat, n, domainFilter = null) {
  const cur = troopsAt(t, seat);
  const taken = zeroTroops();
  let left = n;
  for (const k of battles.TYPES) {
    if (domainFilter === 'sea' ? domainOf(k) !== 'sea' : domainFilter === 'land' ? domainOf(k) === 'sea' : false) continue;
    const x = Math.min(left, cur[k]);
    cur[k] -= x;
    taken[k] += x;
    left -= x;
  }
  setTroops(t, seat, cur);
  return taken;
}
const asTroops = (x) => (typeof x === 'number' ? { ...zeroTroops(), militia: x } : x);
function cleanTroops(input) {
  if (!input || typeof input !== 'object') fail('Invalid troops.');
  const c = zeroTroops();
  for (const k of battles.TYPES) {
    const v = input[k] === undefined ? 0 : input[k];
    if (!Number.isInteger(v) || v < 0 || v > 999) fail(`Invalid number of ${k}.`);
    c[k] = v;
  }
  return c;
}
function addUnitsAt(t, seat, n) {
  if (n >= 0) addTroops(t, seat, { ...zeroTroops(), militia: n });
  else takeCheapest(t, seat, -n);
}
function syncUnits(s) {
  if (!ST(s)) return;
  for (const p of s.players) p.units = 0;
  for (const t of s.board.tiles) for (const [k, n] of Object.entries(t.units || {})) s.players[k].units += n;
}
function capitalOf(s, seat) {
  return getTile(s, s.players[seat].homeTile);
}
/** Where a player's units may stand and travel: their own tiles, plus (Empire) their puppets' tiles. */
function canStand(s, seat, t) {
  if (t.kind !== 'land' || t.controller == null) return false;
  if (t.controller === seat) return true;
  return isEmpire(s) && s.players[t.controller].puppetOf === seat;
}
function checkSend(src, seat, count) {
  if (!Number.isInteger(count) || count < 1) fail('Send at least 1 unit.');
  if (unitsAt(src, seat) < count) fail(`You only have ${unitsAt(src, seat)} unit${unitsAt(src, seat) === 1 ? '' : 's'} on that tile.`);
}
function sendHome(s, seat, n) {
  const c = asTroops(n);
  if (battles.sum(c) <= 0) return;
  const home = capitalOf(s, seat);
  if (canStand(s, seat, home)) addTroops(home, seat, c);
  else {
    // Total War: your capital may have been conquered — go to any tile you still hold.
    const any = s.board.tiles.find((t) => canStand(s, seat, t));
    if (any) addTroops(any, seat, c);
    else s.players[seat].stats.unitsLost += battles.sum(c);
  }
}
/** Units that can't stay where they are step to an adjacent tile they may stand on, or are lost. */
function retreat(s, from, seat, units) {
  const c = asTroops(units);
  const n = battles.sum(c);
  if (n <= 0) return;
  const p = s.players[seat];
  const to = s.board.tiles.filter((x) => x !== from && areAdjacent(x, from) && canStand(s, seat, x)).sort((a, b) => unitsAt(b, seat) - unitsAt(a, seat))[0];
  if (to) {
    addTroops(to, seat, c);
    addLog(s, `${p.name}'s ${n} unit${n === 1 ? '' : 's'} retreat${n === 1 ? 's' : ''} to ${tileName(s, to)}.`);
  } else {
    p.stats.unitsLost += n;
    addLog(s, `${p.name}'s ${n} unit${n === 1 ? '' : 's'} had nowhere to retreat and ${n === 1 ? 'is' : 'are'} lost.`, { kind: 'bad' });
  }
}
/** Move off tile t everyone who may no longer stand there: 'home' (to capital) or 'retreat' (next door). */
function clearTile(s, t, how) {
  for (const k of Object.keys(t.units || {})) {
    const seat = Number(k);
    if (canStand(s, seat, t)) continue;
    const c = troopsAt(t, seat);
    setTroops(t, seat, zeroTroops());
    if (how === 'home') sendHome(s, seat, c);
    else retreat(s, t, seat, c);
  }
}
function removeFromLargest(s, seat, n) {
  for (let i = 0; i < n; i++) {
    const t = s.board.tiles.filter((x) => unitsAt(x, seat) > 0).sort((a, b) => unitsAt(b, seat) - unitsAt(a, seat))[0];
    if (!t) return;
    addUnitsAt(t, seat, -1);
  }
}
/** Your tiles next to `targetId` that have units on them. */
function attackSources(s, seat, targetId) {
  const T = s.board.tiles.find((x) => x.id === targetId);
  if (!T) return [];
  if (T.kind === 'sea') {
    // Fleets sail from any bay they hold (sea-lane boards: from the hexes next to it).
    return seasHeld(s, seat)
      .filter((t) => t !== T && unitsAt(t, seat) > 0 && (!LANES(s) || areAdjacent(t, T)))
      .map((t) => ({ tile: t.id, units: unitsAt(t, seat) }));
  }
  const near = s.board.tiles.filter((t) => t.kind === 'land' && t.controller === seat && unitsAt(t, seat) > 0 && areAdjacent(t, T));
  let amph = [];
  if (TW(s) && TWS(s).amphibious && LANES(s)) {
    // Troops board your ships off one of your coasts and sail to the target's coast.
    amph = s.board.tiles
      .filter((t) => t.kind === 'land' && t.controller === seat && unitsAt(t, seat) > 0 && !near.includes(t))
      .map((t) => ({ t, tr: transportFrom(s, seat, t) }))
      .filter((x) => reaches(x.tr, T))
      .map((x) => ({ tile: x.t, capacity: x.tr.capacity }));
    return [...near.map((t) => ({ tile: t.id, units: unitsAt(t, seat) })), ...amph.map((x) => ({ tile: x.tile.id, units: unitsAt(x.tile, seat), amphibious: true, capacity: x.capacity }))];
  } else if (TW(s) && TWS(s).amphibious && seasHeld(s, seat).some((sea) => areAdjacent(sea, T))) {
    amph = s.board.tiles.filter((t) => t.kind === 'land' && t.controller === seat && unitsAt(t, seat) > 0 && isCoastal(s, t) && !near.includes(t));
  }
  return [...near.map((t) => ({ tile: t.id, units: unitsAt(t, seat) })), ...amph.map((t) => ({ tile: t.id, units: unitsAt(t, seat), amphibious: true }))];
}
/** Units on a tile that defend it: the holder's first, then helpers (e.g. an overlord). Revolt: overlord only. */
function tileDefenders(T, revolt) {
  const seats = Object.keys(T.units || {})
    .map(Number)
    .filter((k) => unitsAt(T, k) > 0)
    .sort((a, b) => (b === T.controller) - (a === T.controller));
  return revolt ? seats.filter((k) => k === T.controller) : seats;
}
function removeFromTile(s, T, seats, n) {
  let left = n;
  for (const k of seats) {
    const x = Math.min(left, unitsAt(T, k));
    addUnitsAt(T, k, -x);
    s.players[k].stats.unitsLost += x;
    left -= x;
    if (!left) break;
  }
}
/** Surviving attackers go back to the tile they came from (or retreat if it's no longer theirs). */
function returnStrike(s, seat, src, units) {
  const c = asTroops(units);
  if (battles.sum(c) <= 0) return;
  if (canStand(s, seat, src)) addTroops(src, seat, c);
  else retreat(s, src, seat, c);
}

/** Move units between your tiles (any distance, through tiles you may stand on). */
function moveUnits(s, actor, { from, to, count = 1, troops = null } = {}) {
  requireBuild(s);
  if (!ST(s)) fail('Units are not stationed in this game.');
  const p = me(s, actor);
  const A = TW(s) ? getAnyTile(s, from) : getTile(s, from);
  const B = TW(s) ? getAnyTile(s, to) : getTile(s, to);
  if (A === B) fail('Pick two different tiles.');
  if (A.kind === 'sea' || B.kind === 'sea') {
    // Fleets sail between bays: any bay you hold or an empty one.
    if (A.kind !== 'sea' || B.kind !== 'sea') fail('Ships stay at sea; land units stay on land.');
    if (A.controller !== actor) fail("Those aren't your ships.");
    if (B.controller != null && B.controller !== actor) fail('Enemy ships hold that bay — attack it instead.');
    if (LANES(s)) {
      // Sail hex by hex through sea that is yours or empty.
      const seen = new Set([A.id]);
      const queue = [A];
      let found = false;
      while (queue.length && !found) {
        const t = queue.shift();
        for (const n of s.board.tiles) {
          if (n.kind !== 'sea' || seen.has(n.id) || !areAdjacent(t, n) || (n.controller != null && n.controller !== actor)) continue;
          if (n === B) found = true;
          seen.add(n.id);
          queue.push(n);
        }
      }
      if (!found) fail('No sea route: enemy ships are in the way.');
    }
    const exactS = troops ? cleanTroops(troops) : null;
    if (exactS) count = battles.sum(exactS);
    checkSend(A, actor, count);
    const moving = withRanks(A, actor, () => (exactS ? takeTroops(A, actor, exactS) : takeCheapest(A, actor, count)));
    B.controller = actor;
    addTroops(B, actor, moving);
    refreshSeas(s);
    addLog(s, `${p.name} sailed ${count} ship${count === 1 ? '' : 's'} from ${A.id} to ${B.id}.`);
    return;
  }
  const exact = troops ? cleanTroops(troops) : null;
  if (exact) count = battles.sum(exact);
  checkSend(A, actor, count);
  if (!canStand(s, actor, B)) fail("Your units can't go there.");
  // Over your own land first; failing that (Total War), also across the sea along your ships —
  // the same chain of ships an invasion crosses, so troops can follow up a landing.
  let route = landRoute(s, actor, A, B, false);
  let bySea = false;
  if (!route && TW(s) && TWS(s).amphibious) {
    route = landRoute(s, actor, A, B, true);
    bySea = !!route;
  }
  if (!route) fail(TW(s) ? (LANES(s) ? `No route: units travel through your own tiles, or by sea on your ships next to the coast they leave from (up to ${TWS(s).transportRange ?? 6} sea hexes, not through enemy ships).` : 'No route: units travel through your own tiles, or across a sea bay you hold.') : 'No route: units can only travel through your own tiles.');
  if (bySea && LANES(s)) {
    const tr = transportFrom(s, actor, A);
    if (count > tr.capacity) fail(`Your ships off ${A.id} can carry ${tr.capacity} troops (${TWS(s).transportPerShip ?? 3} per ship). Move fewer or bring more ships.`);
  }
  const moving = withRanks(A, actor, () => (exact ? takeTroops(A, actor, exact) : takeCheapest(A, actor, count)));
  if (bySea) interceptConvoy(s, actor, A, B, moving, 'reinforcements');
  addTroops(B, actor, moving);
  syncUnits(s);
  const n = battles.sum(moving);
  addLog(s, `${p.name} ${bySea ? 'shipped' : 'moved'} ${n} unit${n === 1 ? '' : 's'} from ${tileName(s, A)} to ${tileName(s, B)}${bySea ? ' by sea' : ''}.`);
}

/**
 * Is there a way for land units from A to B? Through tiles you can stand on, and
 * (viaSea) through sea hexes your ships hold. Sea-lane boards: only neighbouring
 * hexes connect; other boards: every bay you hold is joined by the open ocean.
 */
function landRoute(s, actor, A, B, viaSea) {
  if (viaSea && LANES(s)) return reaches(transportFrom(s, actor, A), B);
  const ship = (t) => viaSea && t.kind === 'sea' && t.controller === actor && unitsAt(t, actor) > 0;
  const seen = new Set([A.id]);
  const queue = [A];
  while (queue.length) {
    const t = queue.shift();
    if (t === B) return true;
    for (const n of s.board.tiles) {
      if (seen.has(n.id)) continue;
      const linked = areAdjacent(t, n) || (!LANES(s) && ship(t) && ship(n));
      if (linked && (canStand(s, actor, n) || ship(n))) {
        seen.add(n.id);
        queue.push(n);
      }
    }
  }
  return false;
}

/** Winning a non-revolt battle for tile T (shared by attacks and clashes). */
function conquerST(s, e, taker, D, T, src, strike) {
  const Dp = s.players[D];
  if (T.role === 'capital') {
    returnStrike(s, e.seat, src, strike); // capitals are never occupied
    if (isEmpire(s) && T.owner === D) {
      capture(s, taker, D);
      return grantLoot(s, taker, D, Math.floor(bagTotal(Dp.materials) / E(s).captureStockDivisor));
    }
    Dp.damaged = true;
    addLog(s, `${Dp.name}'s capital holds, but ${Dp.name} is Damaged.`);
    return grantLoot(s, taker, D, W(s).maxLoot);
  }
  const name = tileName(s, T);
  const retake = T.owner === taker;
  T.controller = taker;
  Dp.damaged = true;
  clearTile(s, T, 'retreat'); // defenders still standing fall back next door
  let moved = '';
  if (taker === e.seat && strike > 0) {
    addUnitsAt(T, e.seat, strike);
    moved = ` with ${strike} unit${strike === 1 ? '' : 's'}`;
  } else returnStrike(s, e.seat, src, strike); // a puppet's units go home; the tile is the overlord's
  addLog(s, `${s.players[taker].name} ${retake ? 'retakes' : 'occupies'} ${name}${moved}. ${Dp.name} is Damaged.`);
  return grantLoot(s, taker, D, W(s).maxLoot);
}

function resolveAttackST(s, e) {
  const w = W(s);
  const A = s.players[e.seat];
  const revolt = e.kind === 'revolt';
  if (revolt && A.puppetOf == null) {
    addLog(s, `${A.name}'s revolt fizzles: they are already free.`);
    return;
  }
  const T = revolt ? capitalOf(s, A.puppetOf) : getTile(s, e.tile);
  const taker = !revolt && A.puppetOf != null ? A.puppetOf : e.seat;
  const name = tileName(s, T);
  const src = getTile(s, e.from);
  const sent = src.controller === e.seat ? Math.min(e.count, unitsAt(src, e.seat)) : 0;
  if (sent < 1) {
    addLog(s, `${A.name}'s attack on ${name} fizzles: no units left on ${tileName(s, src)}.`);
    return;
  }
  if (!revolt) {
    const ctrlP = T.controller != null ? s.players[T.controller] : null;
    if (T.controller === taker || T.controller === e.seat || (ctrlP && ctrlP.puppetOf === taker)) {
      addLog(s, `${A.name}'s attack on ${name} fizzles: it is already on their side.`);
      return;
    }
    if (T.role === 'capital' && !capitalOpen(s, T)) {
      addLog(s, `${A.name}'s attack on ${name} fizzles: its provinces are no longer both occupied.`);
      return;
    }
  }
  addUnitsAt(src, e.seat, -sent); // the attacking units leave their tile
  let strike = sent;
  const from = ` from ${tileName(s, src)} with ${sent} unit${sent === 1 ? '' : 's'}`;

  if (T.controller == null) {
    if (!w.openTilesClaimable) {
      returnStrike(s, e.seat, src, strike);
      addLog(s, `${A.name}'s attack fizzles: open tiles can't be claimed.`);
      return;
    }
    T.controller = taker;
    A.stats.claims += 1;
    if (taker === e.seat) addUnitsAt(T, e.seat, strike);
    else returnStrike(s, e.seat, src, strike);
    addLog(s, `${A.name} claims ${name}${from}${taker === e.seat ? '' : ` for ${s.players[taker].name}`}.`);
    syncUnits(s);
    return;
  }

  const D = T.controller;
  const Dp = s.players[D];
  diplomacy.onHostile(s, e.seat, D); // remembers the attack; breaks any pact between them
  const resistance = T.owner === e.seat || T.owner === taker;
  applySanction(s, e, T, resistance);
  Dp.stats.timesAttacked += 1;
  const defenders = tileDefenders(T, revolt);
  const dUnits = defenders.reduce((a, k) => a + unitsAt(T, k), 0);
  const verb = revolt ? 'revolted against' : 'attacked';
  let won;
  let text;
  let dice = null;
  if (dUnits === 0) {
    won = true;
    text = `${A.name} ${verb} ${name}${from}. Nobody was defending it — ${A.name} wins automatically.`;
  } else {
    const dN = Math.min(dUnits, w.maxDefenceDice) + (T.role === 'capital' ? w.capitalExtraDefenceDice : 0);
    const r = compareDice(roll(s, Math.min(strike, w.maxAttackDice)), roll(s, dN), revolt || resistance ? 'attacker' : 'defender');
    strike -= r.dWon;
    A.stats.unitsLost += r.dWon;
    removeFromTile(s, T, defenders, r.aWon);
    won = r.aWon > r.dWon;
    const tieNote = revolt ? ' (ties go to the rebel)' : resistance ? ' (ties go to the owner)' : '';
    text =
      `${A.name} ${verb} ${name}${from}: ${r.a.join(', ')} vs ${r.d.join(', ')}${tieNote}. ` +
      (won ? `${A.name} wins` : `${Dp.name} holds`) +
      ` (${A.name} loses ${r.dWon}, defenders lose ${r.aWon}).`;
    dice = {
      title: `${revolt ? 'Revolt' : 'Attack'}: ${A.name} → ${Dp.name}`,
      sides: [
        { seat: e.seat, rolls: r.a },
        { seat: D, rolls: r.d },
      ],
      winner: won ? e.seat : D,
    };
  }
  addLog(s, text, { kind: 'battle', dice });
  let res;
  if (!won) {
    A.stats.attacksLost += 1;
    returnStrike(s, e.seat, src, strike);
    if (revolt) addLog(s, `${A.name} stays ${Dp.name}'s puppet.`);
  } else {
    A.stats.attacksWon += 1;
    if (revolt) {
      A.stats.revoltsWon += 1;
      returnStrike(s, e.seat, src, strike);
      freePuppet(s, e.seat, `${A.name}'s revolt succeeds — ${A.name} is free!`);
      res = grantLoot(s, e.seat, D, E(s).revoltLoot);
    } else {
      res = conquerST(s, e, taker, D, T, src, strike);
    }
  }
  syncUnits(s);
  return res;
}

function resolveClashST(s, { a, b }) {
  const w = W(s);
  const A = s.players[a.seat];
  const B = s.players[b.seat];
  const TA = getTile(s, a.tile);
  const TB = getTile(s, b.tile);
  const srcA = getTile(s, a.from);
  const srcB = getTile(s, b.from);
  let sa = srcA.controller === a.seat ? Math.min(a.count, unitsAt(srcA, a.seat)) : 0;
  let sb = srcB.controller === b.seat ? Math.min(b.count, unitsAt(srcB, b.seat)) : 0;
  s.clashCount += 1;
  A.stats.clashes += 1;
  B.stats.clashes += 1;
  diplomacy.onHostile(s, a.seat, b.seat);
  diplomacy.onHostile(s, b.seat, a.seat);
  applySanction(s, a, TA, TA.owner === a.seat || TA.owner === A.puppetOf);
  applySanction(s, b, TB, TB.owner === b.seat || TB.owner === B.puppetOf);
  addUnitsAt(srcA, a.seat, -sa);
  addUnitsAt(srcB, b.seat, -sb);
  let aWins;
  let text;
  let dice = null;
  if (!sa || !sb) {
    aWins = sa > sb ? true : sb > sa ? false : null;
    text =
      `CLASH between ${A.name} and ${B.name}. ` +
      (aWins === null ? 'Neither had units to send — nothing happens.' : `${aWins ? B.name : A.name} had no units to send — ${aWins ? A.name : B.name} wins.`);
  } else {
    const r = compareDice(roll(s, Math.min(sa, w.maxAttackDice)), roll(s, Math.min(sb, w.maxAttackDice)), 'both');
    text =
      `CLASH! ${A.name} (${sa} from ${srcA.id}) and ${B.name} (${sb} from ${srcB.id}) attacked each other: ${r.a.join(', ')} vs ${r.d.join(', ')}. ` +
      (r.aWon === r.dWon ? 'An even split — nothing changes hands' : `${r.aWon > r.dWon ? A.name : B.name} wins`) +
      ` (${A.name} loses ${r.dWon + r.ties}, ${B.name} loses ${r.aWon + r.ties}).`;
    sa -= r.dWon + r.ties;
    sb -= r.aWon + r.ties;
    A.stats.unitsLost += r.dWon + r.ties;
    B.stats.unitsLost += r.aWon + r.ties;
    aWins = r.aWon > r.dWon ? true : r.dWon > r.aWon ? false : null;
    dice = {
      title: `Clash: ${A.name} ⚔ ${B.name}`,
      sides: [
        { seat: a.seat, rolls: r.a },
        { seat: b.seat, rolls: r.d },
      ],
      winner: aWins === null ? null : aWins ? a.seat : b.seat,
    };
  }
  addLog(s, text, { kind: 'battle', dice });
  let res;
  if (aWins === null) {
    returnStrike(s, a.seat, srcA, sa);
    returnStrike(s, b.seat, srcB, sb);
  } else {
    const [win, lose, T, wSrc, lSrc, wN, lN] = aWins ? [a, b, TA, srcA, srcB, sa, sb] : [b, a, TB, srcB, srcA, sb, sa];
    const Wp = s.players[win.seat];
    Wp.stats.attacksWon += 1;
    s.players[lose.seat].stats.attacksLost += 1;
    const taker = Wp.puppetOf != null ? Wp.puppetOf : win.seat;
    res = conquerST(s, win, taker, T.controller, T, wSrc, wN);
    returnStrike(s, lose.seat, lSrc, lN); // after the tile changed hands, so they retreat if needed
  }
  syncUnits(s);
  return res;
}

// ===========================================================================
// TOTAL WAR: battles on the board
// After everyone's choices are revealed, each attack either takes empty land at
// once or starts a LIVE battle (engine/totalwar.js). Battles that don't share a
// tile run at the same time; an attack on a tile that's already being fought
// over waits for the next "wave". When a battle ends, its result is applied here.
// ===========================================================================

function seededRand(s) {
  return () => {
    // same generator as util.nextRandom, kept here to avoid a circular import
    let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startBattles(s, entries) {
  s.battles = [];
  s.battleQueueTW = entries;
  nextWave(s);
}

/** Start every battle that can start now; take empty land immediately. */
function nextWave(s) {
  // Each player fights one battle at a time: a battle waits while either side is
  // already fighting (or its tiles are). Battles between other players run alongside.
  const busy = new Set();
  const fighting = new Set();
  for (const b of s.battles) {
    if (b.status !== 'live') continue;
    busy.add(b.tile);
    busy.add(b.from);
    fighting.add(b.attacker);
    fighting.add(b.defender);
  }
  const later = [];
  let rise = 0;
  for (const e of s.battleQueueTW) {
    const A = s.players[e.seat];
    const T = getAnyTile(s, e.tile);
    const src = getAnyTile(s, e.from);
    if (busy.has(T.id) || busy.has(src.id) || fighting.has(e.seat) || (T.controller != null && fighting.has(T.controller))) {
      later.push(e);
      continue;
    }
    const name = tileName(s, T);
    if (src.controller !== e.seat) {
      addLog(s, `${A.name}'s attack on ${name} fizzles: they lost the tile it started from.`);
      continue;
    }
    if (T.controller === e.seat) {
      addLog(s, `${A.name}'s attack on ${name} fizzles: it is already theirs.`);
      continue;
    }
    if (T.role === 'capital' && T.controller === T.owner && !capitalOpen(s, T)) {
      addLog(s, `${A.name}'s attack on ${name} fizzles: its provinces are no longer occupied.`);
      continue;
    }
    // March out the chosen troops (or as many as are still there).
    const have = troopsAt(src, e.seat);
    let sent;
    const dom = T.kind === 'sea' ? 'sea' : 'land';
    if (e.troops) {
      const want = zeroTroops();
      for (const k of battles.TYPES) want[k] = (domainOf(k) === 'sea') === (dom === 'sea') ? Math.min(e.troops[k] || 0, have[k]) : 0;
      sent = withRanks(src, e.seat, () => takeTroops(src, e.seat, want));
    } else sent = withRanks(src, e.seat, () => takeCheapest(src, e.seat, Math.min(e.count || 0, battles.sum(have)), dom));
    if (src.kind === 'sea') refreshSeas(s);
    if (T.kind === 'land' && src.kind === 'land' && !areAdjacent(src, T)) {
      const tr = transportFrom(s, e.seat, src);
      if (tr && battles.sum(sent) > tr.capacity) {
        // Ships were lost since the order: only what fits sails, the rest stay home.
        const back = zeroTroops();
        const rand = seededRand(s);
        while (battles.sum(sent) > tr.capacity) back[loseOne(sent, rand)] += 1;
        addTroops(src, e.seat, back);
        addLog(s, `${A.name}'s ships off ${src.id} only carry ${tr.capacity}: ${battles.sum(back)} unit${battles.sum(back) === 1 ? '' : 's'} stay behind.`);
      }
      interceptConvoy(s, e.seat, src, T, sent);
    }
    if (!battles.sum(sent)) {
      addLog(s, `${A.name}'s attack on ${name} fizzles: no units left on ${tileName(s, src)}.`);
      continue;
    }
    A.stats.attack += 0; // counted at reveal
    if (T.controller == null) {
      T.controller = e.seat;
      addTroops(T, e.seat, sent);
      if (T.kind === 'land') A.stats.claims += 1;
      addLog(s, `${A.name} claims ${name} with ${battles.sum(sent)} unit${battles.sum(sent) === 1 ? '' : 's'}.`);
      continue;
    }
    const D = T.controller;
    diplomacy.onHostile(s, e.seat, D);
    s.players[D].stats.timesAttacked += 1;
    const defenders = troopsAt(T, D);
    if (!battles.sum(defenders)) {
      if (T.kind === 'sea') {
        T.controller = e.seat;
        addTroops(T, e.seat, sent);
        addLog(s, `${A.name}'s fleet sails into ${T.id} unopposed.`);
      } else {
        addLog(s, `${A.name} marches into ${name} — nobody was there to defend it.`);
        conquerTW(s, e.seat, D, T, sent);
      }
      continue;
    }
    // A real battle.
    const defRanks = JSON.parse(JSON.stringify(vetAt(T, D)));
    setTroops(T, D, zeroTroops()); // the defenders are in the battle now
    busy.add(T.id);
    busy.add(src.id);
    fighting.add(e.seat);
    fighting.add(D);
    rise += TWS(s).battleFlood;
    const b = beginBattleTW(s, { attacker: e.seat, defender: D, T, src, sent, defenders, ranks: { A: RANKS.get(sent) || {}, D: defRanks } });
    addLog(s, `⚔ ${T.kind === 'sea' ? 'NAVAL BATTLE' : 'BATTLE'} for ${name}: ${A.name} (${describeTroops(sent)}) attacks ${s.players[D].name} (${describeTroops(defenders)}).${b.kind === 'air' ? ' Both sides have aircraft: the air battle comes first!' : ''}`, { kind: 'battle', event: 'battleStart', battle: b.id });
  }
  s.battleQueueTW = later;
  if (rise) {
    s.flood += rise;
    addLog(s, `The fighting raises the Flood by ${rise} to ${s.flood} (catastrophe at ${base.threshold(s)}).`, { kind: 'flood' });
    if (base.checkCatastrophe(s)) return;
  }
  syncUnits(s);
  if (s.battles.some((b) => b.status === 'live')) {
    s.phase = 'battle';
    return;
  }
  if (s.battleQueueTW.length) return nextWave(s);
  s.battles = [];
  base.startTradePhase(s);
}

/** Split troops into those whose domain passes `test` and the rest. */
function splitTroops(c, test) {
  const yes = zeroTroops();
  const no = zeroTroops();
  for (const k of battles.TYPES) (test(k) ? yes : no)[k] = c[k] || 0;
  return [yes, no];
}

/** Shore bombardment per second from a side's cruisers and battleships in bays next to tile T. */
function bombardFor(s, T, seat) {
  const cfg = TWS(s);
  let dps = 0;
  for (const sea of s.board.tiles) {
    if (sea.kind !== 'sea' || sea.controller !== seat || !areAdjacent(sea, T)) continue;
    const c = troopsAt(sea, seat);
    for (const k of ['cruiser', 'battleship']) dps += (c[k] || 0) * cfg[k].attack * ARS.levelBoost(ARS.levelOf(s.players[seat], k), cfg.levelAttackPct) * (cfg.bombardPct / 100);
  }
  return Math.round(dps * 10) / 10;
}

/**
 * Start the fighting for one attack. Sea bay: a naval battle. Land: if both sides
 * brought aircraft, an AIR battle first (the land battle follows when it ends).
 * Otherwise straight to the land battle, with the bombers of whoever has aircraft.
 */
function beginBattleTW(s, { attacker, defender, T, src, sent, defenders, ranks = null }) {
  const cfg = TWS(s);
  const levels = { A: ARS.levelsOf(s.players[attacker]), D: ARS.levelsOf(s.players[defender]) };
  const common = { tile: T, from: src, attacker, defender, cfg, rand: seededRand(s), levels, ranks };
  if (T.kind === 'sea') {
    const b = battles.createBattle({ ...common, id: s.nextBattleId++, kind: 'sea', aTroops: sent, dTroops: defenders });
    s.battles.push(b);
    return b;
  }
  const isPlane = (k) => domainOf(k) === 'air';
  const [aAir, aGround] = splitTroops(sent, isPlane);
  const [dAir, dGround] = splitTroops(defenders, isPlane);
  const ground = { aGround, dGround, aAir, dAir };
  if (battles.sum(aAir) && battles.sum(dAir)) {
    const b = battles.createBattle({ ...common, id: s.nextBattleId++, kind: 'air', aTroops: aAir, dTroops: dAir });
    b.pending = ground; // the land battle that follows
    s.battles.push(b);
    return b;
  }
  const sup = battles.sum(aAir) ? 'A' : battles.sum(dAir) ? 'D' : null;
  return startLandBattle(s, common, ground, sup, sup === 'A' ? aAir : sup === 'D' ? dAir : zeroTroops());
}

/** The land battle. `sup` = side with air superiority; its bombers fly over the battle, other planes wait. */
function startLandBattle(s, common, g, sup, planes) {
  const [bombers, otherPlanes] = splitTroops(planes, (k) => k === 'bomber');
  const reserve = { A: zeroTroops(), D: zeroTroops() };
  if (sup) reserve[sup] = otherPlanes;
  // The side without air superiority keeps its planes out of the fight (they lost the air battle, or have none).
  const aT = { ...g.aGround };
  const dT = { ...g.dGround };
  if (sup === 'A') for (const k of battles.TYPES) aT[k] += bombers[k];
  if (sup === 'D') for (const k of battles.TYPES) dT[k] += bombers[k];
  const b = battles.createBattle({
    ...common,
    id: s.nextBattleId++,
    kind: 'land',
    aTroops: aT,
    dTroops: dT,
    bombard: { A: bombardFor(s, common.tile, common.attacker), D: bombardFor(s, common.tile, common.defender) },
  });
  b.reserve = reserve;
  b.airLosers = g.airLosers || { A: zeroTroops(), D: zeroTroops() };
  if (sup) b.airSuperiority = sup;
  s.battles.push(b);
  return b;
}

function describeTroops(c) {
  const parts = battles.TYPES.filter((k) => c[k] > 0).map((k) => `${c[k]} ${ARS.UNITS[k].name.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'nobody';
}

/** Ships that must leave a bay go to another bay their side holds (or an empty one), or are lost. */
function seaRetreat(s, from, seat, ships, home = false) {
  const n = battles.sum(ships);
  if (!n) return;
  const opts = s.board.tiles.filter((t) => t.kind === 'sea' && (t.controller === seat || (t.controller == null && t !== from)));
  const to = home && from.kind === 'sea' && (from.controller === seat || from.controller == null) ? from : opts.find((t) => t.controller === seat && t !== from) || opts[0];
  if (to) {
    to.controller = seat;
    addTroops(to, seat, ships);
    if (to !== from) addLog(s, `${s.players[seat].name}'s ${n} ship${n === 1 ? '' : 's'} withdraw to ${to.id}.`);
  } else {
    s.players[seat].stats.unitsLost += n;
    addLog(s, `${s.players[seat].name}'s ${n} ship${n === 1 ? '' : 's'} had nowhere to go and are scuttled.`, { kind: 'bad' });
  }
}

/** Winning a tile in Total War: move in, take loot and war spoils. */
function conquerTW(s, taker, D, T, troops) {
  const cfg = TWS(s);
  const name = tileName(s, T);
  T.controller = taker;
  clearTile(s, T, 'retreat'); // anyone left there falls back
  addTroops(T, taker, troops);
  const A = s.players[taker];
  const Dp = s.players[D];
  // Loot (taken automatically: battles are fast) + spoils from the bank
  const loot = takeLargest(Dp.materials, Math.min(cfg.maxLoot, bagTotal(Dp.materials)));
  subBag(Dp.materials, loot);
  addBag(A.materials, loot);
  A.stats.tokensStolen += bagTotal(loot);
  const res = BIOMES[T.biome].resource || leastHeld(A);
  A.materials[res] += cfg.warSpoils;
  A.stats.warSpoils = (A.stats.warSpoils || 0) + cfg.warSpoils;
  addLog(s, `🏴 ${A.name} takes ${name}${T.role === 'capital' ? ' — A CAPITAL!' : '.'} Loot: ${describeBag(loot)}; war spoils: ${cfg.warSpoils} ${res}.`, { kind: 'good' });
  // A player's own capital falls: the rest of their land surrenders with it.
  if (T.role === 'capital' && T.owner === D && cfg.capitalTakesAll !== false) {
    const rest = s.board.tiles.filter((t) => t.kind === 'land' && t !== T && t.controller === D);
    let lost = 0;
    for (const t of rest) {
      lost += unitsAt(t, D);
      setTroops(t, D, zeroTroops());
      t.controller = taker;
      clearTile(s, t, 'home'); // anyone else's troops there go home
    }
    Dp.stats.unitsLost += lost;
    syncUnits(s);
    if (rest.length) addLog(s, `🏳 With their capital gone, ${Dp.name}'s whole territory surrenders to ${A.name}: ${rest.map((t) => t.id).join(', ')}${lost ? ` (${lost} unit${lost === 1 ? '' : 's'} lay down their arms)` : ''}.`, { kind: 'bad' });
  }
  // Holding every capital ends the war at once.
  const capitals = s.board.tiles.filter((t) => t.role === 'capital');
  if (capitals.every((t) => t.controller === taker)) {
    addLog(s, `👑 ${A.name} holds every capital. The war is over!`, { kind: 'good' });
    base.finishGame(s, 'conquest');
  }
}

/** An air battle ended: count the losses, then the land battle starts. */
function finishAirTW(s, b) {
  const T = getAnyTile(s, b.tile);
  const src = getAnyTile(s, b.from);
  const A = s.players[b.attacker];
  const D = s.players[b.defender];
  A.stats.unitsLost += battles.unitsLost(b, 'A');
  D.stats.unitsLost += battles.unitsLost(b, 'D');
  const aLeft = battles.survivors(b, 'A');
  const dLeft = battles.survivors(b, 'D');
  const win = b.winner === 'A' ? A : D;
  addLog(s, `✈ ${win.name} wins the air battle over ${tileName(s, T)} — ${b.reason}. Air superiority: ${win.name}.`, { kind: 'battle', event: 'battleEnd', battle: b.id });
  const g = { ...b.pending, airLosers: { A: b.winner === 'A' ? zeroTroops() : aLeft, D: b.winner === 'D' ? zeroTroops() : dLeft } };
  const nb = startLandBattle(s, { tile: T, from: src, attacker: b.attacker, defender: b.defender, cfg: TWS(s), rand: seededRand(s), levels: b.levels, ranks: b.ranks0 }, g, b.winner, b.winner === 'A' ? aLeft : dLeft);
  addLog(s, `⚔ The land battle for ${tileName(s, T)} begins${battles.sum(nb.initial[b.winner]) ? '' : ''}.`, { kind: 'battle', event: 'battleStart', battle: nb.id });
}

/** "Ana's survivors gain experience: 2 Veterans ★★" — one line per side that gained ranks. */
function promotionLog(s, b, rkA, rkD) {
  const NAMES = ['Seasoned ★', 'Veterans ★★', 'Elite ★★★'];
  for (const [seat, rk] of [[b.attacker, rkA], [b.defender, rkD]]) {
    const by = [0, 0, 0];
    for (const a of Object.values(rk)) for (let r = 0; r < 3; r++) by[r] += a[r];
    const parts = [2, 1, 0].filter((r) => by[r]).map((r) => `${by[r]} ${NAMES[r]}`);
    if (parts.length) addLog(s, `🎖 ${s.players[seat].name}'s survivors gain experience: ${parts.join(', ')}.`, { kind: 'good' });
  }
}

/** Apply a finished battle to the board. */
function finishBattleTW(s, b) {
  if (b.kind === 'air') return finishAirTW(s, b);
  const T = getAnyTile(s, b.tile);
  const src = getAnyTile(s, b.from);
  const A = s.players[b.attacker];
  const D = s.players[b.defender];
  const aLeft = battles.survivors(b, 'A');
  const dLeft = battles.survivors(b, 'D');
  // Survivors on both sides go up a rank; units that sat the battle out keep theirs.
  const rkA = battles.survivorRanks(b, 'A');
  const rkD = battles.survivorRanks(b, 'D');
  const keptA = (b.rankLeft && b.rankLeft.A) || {};
  const keptD = (b.rankLeft && b.rankLeft.D) || {};
  promotionLog(s, b, rkA, rkD);
  // Casualties are counted in whole units: surviving dots are grouped back into units.
  const lost = (side) => battles.unitsLost(b, side);
  A.stats.unitsLost += lost('A');
  D.stats.unitsLost += lost('D');
  A.stats.encircledKills = (A.stats.encircledKills || 0) + battles.unitsSurrendered(b, 'D');
  D.stats.encircledKills = (D.stats.encircledKills || 0) + battles.unitsSurrendered(b, 'A');
  const winner = b.winner === 'A' ? A : D;
  winner.stats.battlesWon = (winner.stats.battlesWon || 0) + 1;
  const surrender = (side) => (battles.unitsSurrendered(b, side) ? `, ${battles.unitsSurrendered(b, side)} surrendered (cut off)` : '');
  addLog(
    s,
    `⚔ ${winner.name} wins the battle for ${tileName(s, T)} — ${b.reason}. ${A.name} lost ${lost('A')}${surrender('A')}; ${D.name} lost ${lost('D')}${surrender('D')}.`,
    { kind: 'battle', event: 'battleEnd', battle: b.id },
  );
  if (T.kind === 'sea') {
    if (b.winner === 'A') {
      T.controller = b.attacker;
      addTroops(T, b.attacker, tagRanks(aLeft, rkA));
      seaRetreat(s, T, b.defender, tagRanks(dLeft, rkD));
      addLog(s, `⚓ ${A.name} takes control of ${T.id}.`, { kind: 'good' });
    } else {
      addTroops(T, b.defender, tagRanks(dLeft, rkD));
      seaRetreat(s, src, b.attacker, tagRanks(aLeft, rkA), true);
    }
    refreshSeas(s);
    syncUnits(s);
    return;
  }
  // Aircraft never occupy ground: every plane flies back to base.
  const [aPlanes, aGround] = splitTroops(aLeft, (k) => domainOf(k) === 'air');
  const [dPlanes, dGround] = splitTroops(dLeft, (k) => domainOf(k) === 'air');
  const res = b.reserve || { A: zeroTroops(), D: zeroTroops() };
  const lostAir = b.airLosers || { A: zeroTroops(), D: zeroTroops() };
  const addAll = (...cs) => {
    const c = zeroTroops();
    for (const x of cs) for (const k of battles.TYPES) c[k] += x[k] || 0;
    return c;
  };
  const aHome = addAll(aPlanes, res.A, lostAir.A);
  const dPlanesAll = addAll(dPlanes, res.D, lostAir.D);
  // Hand the ranks out: ground survivors, then planes (survivors + those that sat it out).
  tagRanks(aGround, pickBest(rkA, aGround));
  tagRanks(dGround, pickBest(rkD, dGround));
  tagRanks(aHome, mergeRanks(pickBest(rkA, aPlanes), keptA));
  tagRanks(dPlanesAll, mergeRanks(pickBest(rkD, dPlanes), keptD));
  if (b.winner === 'A') {
    // Surviving defenders who weren't cut off fall back to a neighbouring tile.
    retreat(s, T, b.defender, tagRanks(addAll(dGround, dPlanesAll), mergeRanks(RANKS.get(dGround), RANKS.get(dPlanesAll))));
    if (battles.sum(aGround)) conquerTW(s, b.attacker, b.defender, T, aGround);
    else addLog(s, `${A.name}'s bombers wiped out the defence of ${tileName(s, T)}, but there are no ground troops to take it.`);
    returnStrike(s, b.attacker, src, aHome);
  } else {
    addTroops(T, b.defender, tagRanks(addAll(dGround, dPlanesAll), mergeRanks(RANKS.get(dGround), RANKS.get(dPlanesAll))));
    returnStrike(s, b.attacker, src, tagRanks(addAll(aGround, aHome), mergeRanks(RANKS.get(aGround), RANKS.get(aHome))));
  }
  syncUnits(s);
}

/**
 * Advance every live battle by dt seconds (called by the server ~10 times a
 * second). Changes the state in place. Returns true if anything ended.
 */
function stepBattles(s, dt) {
  if (s.phase !== 'battle') return false;
  let ended = false;
  for (const b of s.battles) {
    if (b.status !== 'live') continue;
    if (battles.stepBattle(b, dt * (b.speed || 1), TWS(s))) {
      ended = true;
      finishBattleTW(s, b);
      if (s.phase === 'ended') return true;
    }
  }
  if (ended) {
    // Start any waiting battle whose players are free again (others keep fighting).
    if (s.battleQueueTW.length) nextWave(s);
    else if (!s.battles.some((b) => b.status === 'live')) {
      s.battles = [];
      base.startTradePhase(s);
    }
  }
  return ended;
}

function liveBattle(s, id) {
  if (s.phase !== 'battle') fail('There is no battle right now.');
  const b = s.battles.find((x) => x.id === id && x.status === 'live');
  if (!b) fail('That battle is over.');
  return b;
}
function sideOf(b, seat) {
  if (seat === b.attacker) return 'A';
  if (seat === b.defender) return 'D';
  fail("You're not fighting in that battle.");
}

/** { battle, dots: [ids], x, y } — move your dots. */
function battleOrder(s, actor, { battle, dots, x, y } = {}) {
  const b = liveBattle(s, battle);
  const side = sideOf(b, actor);
  if (!Array.isArray(dots) || !dots.length) fail('Pick some of your units first.');
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) fail('Pick a spot on the map.');
  b.auto[side] = false;
  battles.order(b, side, dots.map(Number), x, y);
}

/** { battle, formation } — choose a formation (null = free movement). */
function battleFormation(s, actor, { battle, formation = null } = {}) {
  const b = liveBattle(s, battle);
  const side = sideOf(b, actor);
  if (formation !== null && !battles.FORMATIONS[formation]) fail('Unknown formation.');
  if (formation !== null && !battles.availableFormations(b, side).includes(formation)) fail("Your army can't use that formation (you need the right units).");
  if (!battles.setFormation(b, side, formation)) fail('Wait a moment before changing formation again.');
  b.ordered[side] = true;
}

/** { battle, on } — let the computer fight for you (or take back control). */
function battleAuto(s, actor, { battle, on = true } = {}) {
  const b = liveBattle(s, battle);
  const side = sideOf(b, actor);
  b.auto[side] = !!on;
  b.ordered[side] = true;
}

/** Host skip during battles: the computer takes over that player's battles. */
function skipBattle(s, seat) {
  let any = false;
  for (const b of s.battles) {
    if (b.status !== 'live') continue;
    if (b.attacker === seat) b.auto.A = any = true;
    if (b.defender === seat) b.auto.D = any = true;
  }
  if (!any) fail(`${s.players[seat].name} is not in a battle.`);
  addLog(s, `The host hands ${s.players[seat].name}'s battles to the computer.`);
}

/** Total War score: tiles, captured capitals, spare materials, and a safe home. */
function scoreTotalWar(s, reason) {
  const cfg = TWS(s);
  const catastrophe = reason === 'catastrophe';
  const results = s.players.map((p) => {
    const tiles = controlled(s, p.seat);
    const capitals = tiles.filter((t) => t.role === 'capital' && t.owner !== p.seat).length;
    const prot = p.walls * s.settings.base.wallProtection;
    const home = s.board.tiles.find((t) => t.id === p.homeTile);
    const homeSafe = !catastrophe && home.controller === p.seat && prot >= s.flood;
    const spare = bagTotal(p.materials);
    const score = catastrophe ? 0 : tiles.length * cfg.scoreTile + capitals * cfg.scoreCapital + Math.floor(spare / cfg.scoreMaterialsPer) + (homeSafe ? cfg.scoreHome : 0);
    return { seat: p.seat, name: p.name, walls: p.walls, protection: prot, survived: homeSafe, spare, seawallPoints: 0, tiles: tiles.length, capitals, score };
  });
  const best = catastrophe ? null : Math.max(...results.map((r) => r.score));
  const winners = catastrophe ? [] : results.filter((r) => r.score === best).map((r) => r.seat);
  return { reason, catastrophe, finalFlood: s.flood, threshold: base.threshold(s), results, winners };
}

// ===========================================================================
// TOTAL WAR: RESEARCH AND UPGRADES
// Pay for one research project at a time during Talk & Build or Trade & Build;
// it is finished at the start of the next round. Units can then be upgraded
// along their line (militia -> anti-tank/anti-air, infantry -> motorised ->
// mechanised, cavalry -> light -> medium -> heavy tank, destroyer -> cruiser ->
// battleship) by paying the difference in cost.
// ===========================================================================

function researchOf(p) {
  if (!p.research) p.research = { done: [], current: null };
  return p.research;
}

/** { tech, materials } */
function research(s, actor, { tech, materials } = {}) {
  requireBuild(s);
  if (!TW(s)) fail('Research is part of Total War.');
  const p = me(s, actor);
  const r = researchOf(p);
  const T = ARS.TECHS[tech];
  if (!T) fail('Unknown research.');
  if (r.done.includes(tech)) fail(`You already have ${T.name}.`);
  if (r.current) fail(`You are already researching ${ARS.TECHS[r.current].name}. It's ready next round.`);
  const missing = T.needs.filter((x) => !r.done.includes(x));
  if (missing.length) fail(`Research ${missing.map((x) => ARS.TECHS[x].name).join(' and ')} first.`);
  const cost = ARS.techCost(TWS(s), tech);
  const bag = cleanBag(materials);
  if (bagTotal(bag) !== cost) fail(`${T.name} costs ${cost} materials (any mix).`);
  if (!hasBag(p.materials, bag)) fail("You don't have those materials.");
  subBag(p.materials, bag);
  r.current = tech;
  p.stats.researchSpent = (p.stats.researchSpent || 0) + cost;
  addLog(s, `🔬 ${p.name} starts researching ${T.name} (ready next round).`);
}

/** Start of each round: finished research becomes available. */
function finishResearch(s) {
  for (const p of s.players) {
    const r = researchOf(p);
    if (!r.current) continue;
    r.done.push(r.current);
    const T = ARS.TECHS[r.current];
    r.current = null;
    if (T.level) addLog(s, `🔬 ${p.name} reaches ${T.name}: every ${ARS.UNITS[T.level.type].name.toLowerCase()} they have is now stronger.`, { kind: 'good' });
    else addLog(s, `🔬 ${p.name} has ${T.name}! New: ${T.unlocks.map((k) => ARS.UNITS[k].name).join(', ')}.`, { kind: 'good' });
  }
}

/** { tile, from, to, count, materials } — upgrade units on one of your tiles. */
function upgradeUnits(s, actor, { tile, from, to, count = 1, materials } = {}) {
  requireBuild(s);
  if (!TW(s)) fail('Upgrades are part of Total War.');
  const p = me(s, actor);
  if (!ARS.UNITS[from] || !ARS.UNITS[to]) fail('Unknown unit type.');
  if (!ARS.upgradePath(from, to)) fail(`${ARS.UNITS[from].name} can't be upgraded to ${ARS.UNITS[to].name}.`);
  if (!ARS.canBuild(p, to)) fail(`Research ${ARS.TECHS[ARS.UNITS[to].tech].name} first.`);
  if (!Number.isInteger(count) || count < 1 || count > 50) fail('Invalid number of units.');
  const T = getAnyTile(s, tile);
  if (T.controller !== actor) fail('Upgrade units on a tile you hold.');
  if (troopsAt(T, actor)[from] < count) fail(`You don't have ${count} ${ARS.UNITS[from].name.toLowerCase()} there.`);
  const cfg = TWS(s);
  const each = Math.max(1, cfg[to].cost - cfg[from].cost);
  const bag = cleanBag(materials);
  if (bagTotal(bag) !== each * count) fail(`Upgrading costs ${each * count} materials (any mix).`);
  if (!hasBag(p.materials, bag)) fail("You don't have those materials.");
  diplomacy.checkUnits(s, actor, p.units); // same number of units: only treaties on totals matter
  subBag(p.materials, bag);
  // Same soldiers, new kit: their rank comes with them.
  const old = withRanks(T, actor, () => takeTroops(T, actor, { ...zeroTroops(), [from]: count }));
  const rk = (RANKS.get(old) || {})[from];
  addTroops(T, actor, tagRanks({ ...zeroTroops(), [to]: count }, rk ? { [to]: rk } : null));
  p.stats.upgrades = (p.stats.upgrades || 0) + count;
  addLog(s, `⬆ ${p.name} upgraded ${count} ${ARS.UNITS[from].name.toLowerCase()} to ${ARS.UNITS[to].name.toLowerCase()} on ${tileName(s, T)}.`);
}

// ---------------------------------------------------------------- navy: bombardment and convoys
/** Shots fired by a player's cruisers and battleships on one sea hex. */
function gunShots(s, t, seat) {
  const c = troopsAt(t, seat);
  return (c.cruiser || 0) + 2 * (c.battleship || 0);
}
/** Chance that one naval shot hits, raised by the ships' research level. */
function shotChance(s, t, seat) {
  const cfg = TWS(s);
  const c = troopsAt(t, seat);
  const lv = c.battleship ? ARS.levelOf(s.players[seat], 'battleship') : ARS.levelOf(s.players[seat], 'cruiser');
  return Math.min(0.95, ((cfg.navalHitPct ?? 50) / 100) * ARS.levelBoost(lv, cfg.levelAttackPct));
}
/** Remove one random unit (weighted by numbers) from a troop count; returns its type. */
function loseOne(c, rand) {
  const types = battles.TYPES.filter((k) => c[k] > 0);
  const n = types.reduce((a, k) => a + c[k], 0);
  if (!n) return null;
  let r = Math.floor(rand() * n);
  for (const k of types) {
    if (r < c[k]) {
      c[k] -= 1;
      return k;
    }
    r -= c[k];
  }
  return null;
}

/**
 * Convoy interception (sea-lane boards): troops crossing the sea are shot at by
 * enemy cruisers and battleships next to the chain of ships carrying them. Each
 * of the attacker's destroyers in the chain screens off one shot.
 */
function interceptConvoy(s, seat, src, T, sent, what = 'convoy') {
  if (!LANES(s) || inTruce(s) || TWS(s).convoyIntercept === false) return;
  const tr = transportFrom(s, seat, src);
  if (!tr || !reaches(tr, T)) return;
  // The route the ships sail; destroyers among the transports and on the route escort it.
  const chain = new Set(routeTo(tr, T));
  const rand = seededRand(s);
  let escorts = [...new Set([...tr.ships, ...[...chain].filter((t) => t.controller === seat)])].reduce((a, t) => a + (troopsAt(t, seat).destroyer || 0), 0);
  const lost = [];
  const shooters = new Set();
  for (const sea of s.board.tiles) {
    if (sea.kind !== 'sea' || sea.controller == null || sea.controller === seat || chain.has(sea)) continue;
    if (![...chain].some((c) => areAdjacent(c, sea))) continue;
    const owner = sea.controller;
    const p = shotChance(s, sea, owner);
    for (let i = 0; i < gunShots(s, sea, owner); i++) {
      if (escorts > 0) {
        escorts--;
        continue;
      }
      shooters.add(owner);
      if (rand() < p) {
        const k = loseOne(sent, rand);
        if (k) lost.push(k);
      }
    }
  }
  if (!shooters.size) return;
  const A = s.players[seat];
  const by = [...shooters].map((x) => s.players[x].name).join(' and ');
  if (lost.length) {
    addLog(s, `🚢 ${by}'s warships fire on ${A.name}'s ${what} to ${tileName(s, T)}: ${describeTroops(countOf(lost))} sunk on the way.`, { kind: 'battle' });
    syncUnits(s);
  } else addLog(s, `🚢 ${by}'s warships fire on ${A.name}'s ${what} to ${tileName(s, T)} but miss.`, { kind: 'battle' });
}
function countOf(list) {
  const c = zeroTroops();
  for (const k of list) c[k] += 1;
  return c;
}

/**
 * { from, target } — cruisers and battleships shell an enemy coastal tile next to
 * their sea hex, once per round per hex (Talk & Build). Each hit destroys a unit.
 */
function bombard(s, actor, { from, target } = {}) {
  requireBuild(s);
  if (!TW(s)) fail('Bombardment is part of Total War.');
  const p = me(s, actor);
  const S = getAnyTile(s, from);
  const T = getTile(s, target);
  if (S.kind !== 'sea' || S.controller !== actor) fail('Pick a sea hex your ships hold.');
  const shots = gunShots(s, S, actor);
  if (!shots) fail('Only cruisers and battleships can bombard the coast.');
  if (!areAdjacent(S, T)) fail('Your ships can only shell a coast right next to them.');
  if (T.controller == null || T.controller === actor) fail('Pick an enemy-held coast.');
  if (inTruce(s)) fail(`No bombardment during the opening truce (until the end of round ${TWS(s).truceRounds}).`);
  if (puppetsOf(s, actor).includes(T.controller) || p.puppetOf === T.controller) fail("You can't shell your own puppet or overlord.");
  diplomacy.checkMove(s, actor, 'attack', T.controller);
  if (S.bombardedRound === s.round) fail('Those ships have already fired this round.');
  S.bombardedRound = s.round;
  const D = T.controller;
  diplomacy.onHostile(s, actor, D);
  const rand = seededRand(s);
  const chance = shotChance(s, S, actor);
  const c = troopsAt(T, D);
  const lost = [];
  for (let i = 0; i < shots; i++) if (rand() < chance) {
    const k = loseOne(c, rand);
    if (k) lost.push(k);
  }
  setTroops(T, D, c);
  syncUnits(s);
  const name = tileName(s, T);
  if (lost.length) addLog(s, `💥 ${p.name}'s fleet shells ${name}: ${describeTroops(countOf(lost))} of ${s.players[D].name}'s destroyed.`, { kind: 'battle' });
  else addLog(s, `💥 ${p.name}'s fleet shells ${name}${battles.sum(c) ? ' but misses' : ' — nobody there'}.`, { kind: 'battle' });
}
/** Coastal enemy tiles each of my gun ships could shell now: { seaId: [landIds] }. */
function bombardTargets(s, seat) {
  const out = {};
  if (!TW(s) || inTruce(s)) return out;
  for (const S of seasHeld(s, seat)) {
    if (!gunShots(s, S, seat) || S.bombardedRound === s.round) continue;
    const list = s.board.tiles.filter((t) => t.kind === 'land' && t.controller != null && t.controller !== seat && areAdjacent(S, t) && !puppetsOf(s, seat).includes(t.controller) && !diplomacy.blockedBy(s, seat, 'attack', t.controller)).map((t) => t.id);
    if (list.length) out[S.id] = list;
  }
  return out;
}

const handlers = { choose, recruit, setCommand, planWithdraw, planRelease, moveUnits, battleOrder, battleAuto, battleFormation, research, upgradeUnits, bombard };



module.exports = {
  handlers,
  upkeep,
  reveal,
  continueBattles,
  defaultChoice,
  decorateView,
  production,
  attackTargets,
  compareDice,
  isSanctioned,
  tileName,
  attackSources,
  unitsAt,
  troopsAt,
  stepBattles,
  skipBattle,
  scoreTotalWar,
};
