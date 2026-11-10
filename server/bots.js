/**
 * BOTS — simple computer players, so you can test with fewer people.
 * ==================================================================
 * A bot only sees what a human in its seat would see (engine.viewFor), so it
 * can't peek at secret choices. Every time it's the bot's move, the server
 * calls decide() and applies the ONE action it returns, then asks again.
 *
 *   decide(view, memory) -> { action, key } or null
 *
 * `memory` is per bot: { personality, tried: Set, phaseKey, failures }.
 * `key` names the step; if the rules engine rejects an action, the server
 * adds its key to memory.tried so the bot moves on to its next idea.
 *
 * Personalities (change the numbers to make bots braver or more careful):
 */
'use strict';

const PERSONALITIES = {
  // wallMargin: how much protection to keep above the Flood they expect at the end
  // wallsPerRound: most walls built in one round (people save materials — they're points)
  // trust: chance to accept a pact/treaty; betray: chance to break a pact when a target is tempting
  // pactChance: chance per round to offer someone a pact
  cautious: { unsus: 0.1, raid: 0, attack: 0.1, army: 2, revolt: 0.1, donates: true, wallMargin: 2, wallsPerRound: 2, trust: 0.9, betray: 0.02, pactChance: 0.5 },
  balanced: { unsus: 0.35, raid: 0.15, attack: 0.4, army: 4, revolt: 0.3, donates: true, wallMargin: 0, wallsPerRound: 1, trust: 0.7, betray: 0.15, pactChance: 0.3 },
  warlike: { unsus: 0.5, raid: 0.45, attack: 0.8, army: 8, revolt: 0.6, donates: false, wallMargin: -1, wallsPerRound: 1, trust: 0.5, betray: 0.4, pactChance: 0.35 },
};
const PERSONALITY_ORDER = ['balanced', 'cautious', 'warlike', 'balanced'];
const BOT_NAMES = ['Bot Ada', 'Bot Bram', 'Bot Cleo', 'Bot Dax', 'Bot Eve'];

const MATS = ['wood', 'stone', 'sandbag'];
const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const total = (b) => (b ? b.wood + b.stone + b.sandbag : 0);
const empty = () => ({ wood: 0, stone: 0, sandbag: 0 });
const has = (have, need) => MATS.every((m) => have[m] >= need[m]);
const adjacent = (a, b) => DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
const unitsOn = (t, seat) => (t.units && t.units[seat]) || 0;
const chance = (p) => Math.random() < p;

function wallCost(g) {
  const b = g.settings.base;
  return { wood: b.wallCostWood, stone: b.wallCostStone, sandbag: b.wallCostSandbag };
}

/** Pick n materials (only from `allowed`), favouring what the next walls need. */
function pickMix(g, me, n, allowed = MATS) {
  const cost = wallCost(g);
  const planned = { ...me.materials };
  const mix = empty();
  for (let i = 0; i < n; i++) {
    const m = allowed.reduce((best, x) => (cost[x] * 2 - planned[x] > cost[best] * 2 - planned[best] ? x : best), allowed[0]);
    planned[m]++;
    mix[m]++;
  }
  return mix;
}

/** Take n tokens from `from`, the ones we need most first. */
function pickFrom(g, me, from, n) {
  const cost = wallCost(g);
  const left = { ...from };
  const take = empty();
  for (let i = 0; i < n; i++) {
    const options = MATS.filter((m) => left[m] > 0);
    if (!options.length) break;
    const m = options.reduce((best, x) => (cost[x] * 2 - me.materials[x] - take[x] > cost[best] * 2 - me.materials[best] - take[best] ? x : best), options[0]);
    left[m]--;
    take[m]++;
  }
  return take;
}

/** Pay n materials from the biggest piles. */
function payFromLargest(me, n) {
  const left = { ...me.materials };
  const pay = empty();
  for (let i = 0; i < n; i++) {
    const m = MATS.reduce((best, x) => (left[x] > left[best] ? x : best), MATS[0]);
    if (left[m] <= 0) break;
    left[m]--;
    pay[m]++;
  }
  return pay;
}

function decide(g, mem) {
  const me = g.players[g.you];
  const P = PERSONALITIES[mem.personality] || PERSONALITIES.balanced;
  const phaseKey = `${g.round}-${g.phase}`;
  if (mem.phaseKey !== phaseKey) {
    mem.phaseKey = phaseKey;
    mem.tried = new Set();
    mem.failures = 0;
  }
  const fresh = (key) => !mem.tried.has(key);

  if (g.phase === 'loot') {
    const L = g.pendingLoot;
    if (!L || L.raider !== g.you) return null;
    const from = g.players[L.target].materials || { wood: 99, stone: 99, sandbag: 99 };
    return { key: 'loot', action: { type: 'pickLoot', materials: pickFrom(g, me, from, L.count) } };
  }
  if (g.phase === 'talk' || g.phase === 'trade') return buildStep(g, me, P, mem, fresh);
  if (g.phase === 'choose' && !me.choice) return chooseStep(g, me, P, fresh);
  return null;
}

// ---------------------------------------------------------------- Talk & Build
function buildStep(g, me, P, mem, fresh) {
  const cost = wallCost(g);
  const danger = g.threshold - g.flood;

  // 1. Answer trade offers: accept if we can pay and we get at least as much as we give.
  for (const t of g.trades.filter((x) => x.to === g.you)) {
    const key = `trade-${t.id}`;
    if (!fresh(key)) continue;
    const fair = total(t.give) >= total(t.get) && has(me.materials, t.get) && !me.sanctioned;
    return { key, action: { type: fair ? 'acceptTrade' : 'rejectTrade', id: t.id } };
  }
  // 1b. Diplomacy: answer pact offers and treaty invitations.
  const d = diplomacyStep(g, me, P, mem, fresh);
  if (d) return d;
  if (me.ready) return null; // already done building this phase

  // 2. Build a wall only if we expect to need it by the end of the game, at most a
  //    couple per round — spare materials are points, so bots save like people do.
  if (mem.wallRound !== g.round) {
    mem.wallRound = g.round;
    mem.wallsThisRound = 0;
  }
  const wallKey = `wall-${me.walls}`;
  if (has(me.materials, cost) && fresh(wallKey) && mem.wallsThisRound < P.wallsPerRound && me.protection < wallTarget(g, P)) {
    mem.wallsThisRound++;
    return { key: wallKey, action: { type: 'buildWall', count: 1 } };
  }

  if (g.war) {
    const w = g.settings.war;
    // 3. Recruit up to the personality's army size — but walls come first unless warlike,
    //    and cautious/balanced bots stay under the army-emissions limit.
    let target = P.army;
    if (w.armyFloodPerUnits > 0 && P !== PERSONALITIES.warlike) target = Math.min(target, w.armyFloodPerUnits - 1);
    const wallsOk = me.protection >= g.flood + 1 || P === PERSONALITIES.warlike;
    if (me.units < target && wallsOk && total(me.materials) >= w.unitCost && fresh(`recruit-${me.units}`)) {
      const action = { type: 'recruit', count: 1, materials: payFromLargest(me, w.unitCost) };
      if (g.stationed) action.tile = frontier(g)[0] || me.homeTile;
      return { key: `recruit-${me.units}`, action };
    }
    // 4. Stationed units: put units where they're useful.
    if (g.stationed) {
      const mv = moveIdea(g, me, P);
      if (mv && fresh(mv.key)) return mv;
    }
    // 5. Overlords give their puppets orders.
    for (const q of me.puppets || []) {
      const want = P === PERSONALITIES.cautious ? 'sustainable' : 'unsustainable';
      const cur = g.players[q].command;
      if ((!cur || cur.action !== want) && fresh(`cmd-${q}`)) return { key: `cmd-${q}`, action: { type: 'setCommand', puppet: q, action: want } };
    }
  }

  // 6. Market: swap a big pile for what the next wall needs.
  if (!me.sanctioned && fresh('market')) {
    const b = g.settings.base;
    const need = MATS.filter((m) => me.materials[m] < cost[m]);
    const spare = MATS.filter((m) => me.materials[m] >= b.marketGive + cost[m]);
    if (need.length && spare.length) return { key: 'market', action: { type: 'market', give: spare[0], get: need[0] } };
  }

  // 6b. Offer a trade to someone who has what we need.
  const offer = tradeOffer(g, me, fresh);
  if (offer) return offer;

  // 7. When the Flood is getting close, careful bots chip in to the seawall.
  if (P.donates && danger <= 4 && g.seawallBonus < g.settings.base.seawallMaxSteps && total(me.materials) > 6 && fresh('donate')) {
    return { key: 'donate', action: { type: 'donate', materials: payFromLargest(me, 2) } };
  }

  // 8. Done.
  if (fresh('ready')) return { key: 'ready', action: { type: 'ready' } };
  return null;
}

/**
 * The protection this bot wants: the Flood it expects at the end of the game
 * (current Flood + the average rise per round so far x rounds left), plus its margin.
 * In the last round that's just "enough to survive right now".
 */
function wallTarget(g, P) {
  const rounds = g.mode === 'base' ? g.settings.base.rounds : g.settings.war.rounds;
  const done = Math.max(1, g.round - (g.phase === 'talk' ? 1 : 0)); // rounds whose Flood we've seen
  const rate = Math.max(0.5, (g.flood - g.settings.general.startingFlood) / done);
  const left = Math.max(0, rounds - g.round + (g.phase === 'talk' ? 1 : 0));
  const expected = g.flood + Math.ceil(rate * left);
  if (left === 0) return g.flood; // last chance: only build what keeps the home dry
  return Math.min(expected + P.wallMargin, g.threshold); // no point beyond the catastrophe line
}

/** My tiles that touch someone else's (or open) land, most exposed first. */
function frontier(g) {
  const land = g.board.tiles.filter((t) => t.kind === 'land');
  return land
    .filter((t) => t.controller === g.you)
    .map((t) => ({ t, threat: land.filter((o) => adjacent(o, t) && o.controller !== g.you).length }))
    .filter((x) => x.threat > 0)
    .sort((a, b) => b.threat - a.threat)
    .map((x) => x.t.id);
}

/** Move one batch of units: fill empty frontier tiles, then push spare units forward. */
function moveIdea(g, me, P) {
  const stand = new Set(g.standTiles || []);
  const mine = g.board.tiles.filter((t) => stand.has(t.id) && t.controller === g.you);
  const front = frontier(g);
  const withUnits = mine.filter((t) => unitsOn(t, g.you) > 0).sort((a, b) => unitsOn(b, g.you) - unitsOn(a, g.you));
  if (!withUnits.length) return null;
  const big = withUnits[0];
  // Cautious and balanced bots make sure no frontier tile is empty.
  if (P !== PERSONALITIES.warlike) {
    const emptyFront = front.find((id) => unitsOn(g.board.tiles.find((t) => t.id === id), g.you) === 0);
    if (emptyFront && unitsOn(big, g.you) >= 2) return { key: `move-${big.id}-${emptyFront}`, action: { type: 'moveUnits', from: big.id, to: emptyFront, count: 1 } };
  }
  // Push spare units from the capital to the most exposed frontier tile.
  const cap = g.board.tiles.find((t) => t.id === me.homeTile);
  const dest = front.find((id) => id !== cap.id);
  const spare = unitsOn(cap, g.you) - (P === PERSONALITIES.warlike ? 0 : 1);
  if (dest && spare > 0) return { key: `move-${cap.id}-${dest}`, action: { type: 'moveUnits', from: cap.id, to: dest, count: spare } };
  return null;
}

// ---------------------------------------------------------------- Choose secretly
function chooseStep(g, me, P, fresh) {
  const danger = g.threshold - g.flood;
  const ideas = g.war ? warIdeas(g, me, P, danger) : baseIdeas(g, me, P, danger);
  for (const idea of ideas) if (fresh(idea.key)) return idea;
  return null;
}

function baseIdeas(g, me, P, danger) {
  const b = g.settings.base;
  const ideas = [];
  const sustainable = { key: 'sus', action: { type: 'choose', action: 'sustainable' } };
  if (me.biome === 'mixed') sustainable.action.mix = pickMix(g, me, b.sustainableCollect);
  if (me.materials.wood >= b.raidCostWood + 1 && chance(P.raid) && !g.limits.noAttacks) {
    const target = g.players
      .filter((p) => p.seat !== g.you && !g.limits.protectedSeats[p.seat] && willHit(g, p.seat, P))
      .sort((a, c) => (c.materialTotal || 0) + grudge(g, c.seat) * 3 - (a.materialTotal || 0) - grudge(g, a.seat) * 3)[0];
    if (target && target.materialTotal >= 3) ideas.push({ key: 'raid', action: { type: 'choose', action: 'raid', target: target.seat } });
  }
  if (danger > (P === PERSONALITIES.cautious ? 5 : 3) && chance(P.unsus) && !g.limits.noUnsustainable) {
    ideas.push({ key: 'unsus', action: { type: 'choose', action: 'unsustainable', mix: pickMix(g, me, b.unsustainableCollect) } });
  }
  ideas.push(sustainable);
  return ideas;
}

function warIdeas(g, me, P, danger) {
  const prod = me.production;
  const dev = (action) => {
    const a = { type: 'choose', action };
    a.mix = action === 'sustainable' ? pickMix(g, me, prod.free, prod.allowed) : pickMix(g, me, prod.unsustainable);
    if (me.aidEligible) a.aid = MATS.reduce((best, m) => (me.materials[m] < me.materials[best] ? m : best), MATS[0]);
    return { key: action, action: a };
  };
  const best = (list) => (list || []).reduce((a, x) => (!a || x.units > a.units ? x : a), null);
  const ideas = [];

  // Puppets: obey, or sometimes revolt.
  if (me.puppetOf != null) {
    const src = g.stationed ? best(g.revoltSources) : null;
    if ((g.stationed ? src : me.units >= 1) && chance(P.revolt) && !g.limits.noAttacks && !g.limits.protectedSeats[me.puppetOf]) {
      ideas.push({ key: 'revolt', action: { type: 'choose', action: 'revolt', ...(src ? { from: src.tile, count: src.units } : {}) } });
    }
    const cmd = me.effectiveCommand;
    if (cmd.action === 'attack') {
      const s = g.stationed ? best(g.attackSources[cmd.target]) : null;
      ideas.push({ key: 'obey', action: { type: 'choose', action: 'attack', target: cmd.target, ...(s ? { from: s.tile, count: s.units } : {}) } });
    } else ideas.push(dev(cmd.action));
    return ideas;
  }

  // Free players: attack a good target if feeling brave and the planet can take it.
  if (danger > (P === PERSONALITIES.warlike ? 2 : 4) && chance(P.attack) && !g.limits.noAttacks) {
    const target = pickTarget(g, me, P);
    if (target) ideas.push(target);
  }
  if (danger > (P === PERSONALITIES.cautious ? 6 : 4) && chance(P.unsus) && !g.limits.noUnsustainable) ideas.push(dev('unsustainable'));
  ideas.push(dev('sustainable'));
  return ideas;
}

/** Score possible attacks; only take ones we expect to win. */
function pickTarget(g, me, P) {
  let bestIdea = null;
  let bestScore = 0;
  for (const id of g.attackTargets) {
    const t = g.board.tiles.find((x) => x.id === id);
    let sent;
    let from = null;
    let defenders;
    if (g.stationed) {
      const srcs = g.attackSources[id] || [];
      if (!srcs.length) continue;
      const s = srcs.reduce((a, x) => (x.units > a.units ? x : a));
      from = s.tile;
      sent = s.units;
      defenders = Object.values(t.units || {}).reduce((a, n) => a + n, 0);
    } else {
      sent = me.units + (me.puppets || []).reduce((a, q) => a + g.players[q].units, 0);
      defenders = t.controller != null ? g.players[t.controller].units : 0;
    }
    if (sent < 1) continue;
    if (t.controller != null && (g.limits.protectedSeats[t.controller] || !willHit(g, t.controller, P))) continue;
    let score;
    if (t.controller == null) score = 2; // open tile: free claim
    else if (t.owner === g.you) score = sent >= defenders ? 5 : 0; // take back our land
    else if (sent > defenders || defenders === 0) score = 3 + (t.role === 'capital' ? 2 : 0);
    else score = P === PERSONALITIES.warlike && sent === defenders ? 1 : 0;
    if (score && t.controller != null) score += grudge(g, t.controller); // pay back those who hit us
    if (score > bestScore) {
      bestScore = score;
      bestIdea = { key: `attack-${id}`, action: { type: 'choose', action: 'attack', target: id, ...(from ? { from, count: sent } : {}) } };
    }
  }
  return bestIdea;
}

// ---------------------------------------------------------------- diplomacy

/** How many times this player has raided/attacked us. */
function grudge(g, seat) {
  return (g.players[g.you].hits || {})[seat] || 0;
}
function pactWith(g, seat) {
  return (g.pacts || []).find((p) => p.status === 'active' && ((p.a === g.you && p.b === seat) || (p.b === g.you && p.a === seat)));
}
/** Would we hit this player? Pact partners only if we decide to betray them. */
function willHit(g, seat, P) {
  return !pactWith(g, seat) || chance(P.betray);
}
/** Do we trust this player? Betrayers and people who hit us are trusted less. */
function trusts(g, seat, P) {
  const p = g.players[seat];
  const doubt = (p.betrayals || 0) * 0.4 + (p.treatyBreaks || 0) * 0.3 + grudge(g, seat) * 0.3;
  return chance(Math.max(0, P.trust - doubt));
}

function diplomacyStep(g, me, P, mem, fresh) {
  const gen = g.settings.general;
  const name = (seat) => g.players[seat].name;

  // Answer pact offers made to us.
  for (const p of (g.pacts || []).filter((x) => x.status === 'proposed' && x.b === g.you)) {
    const key = `pact-${p.id}`;
    if (!fresh(key)) continue;
    // Warlike bots like alliances against someone; everyone prefers people they trust.
    const accept = trusts(g, p.a, P) && !(p.kind === 'alliance' && p.enemy != null && pactWith(g, p.enemy));
    return {
      key,
      action: { type: 'respondPact', id: p.id, accept },
      say: accept ? pick([`Deal, ${name(p.a)}.`, `Agreed — ${p.rounds} round${p.rounds === 1 ? '' : 's'} of peace.`, `Fine by me, ${name(p.a)}.`]) : pick([`No thanks, ${name(p.a)}.`, `I don't trust you, ${name(p.a)}.`]),
    };
  }

  // Answer treaty invitations.
  for (const t of (g.treaties || []).filter((x) => x.invited.includes(g.you) && ![...x.signed, ...x.declined, ...x.broken].includes(g.you))) {
    const key = `treaty-${t.id}`;
    if (!fresh(key)) continue;
    const c = t.clauses;
    let likes = trusts(g, t.by, P);
    if (c.maxUnits != null && (c.maxUnits < Math.min(P.army, 3) || me.units > c.maxUnits)) likes = false;
    if (c.noAttacks && P === PERSONALITIES.warlike) likes = false;
    if (c.noUnsustainable && P === PERSONALITIES.warlike && chance(0.5)) likes = false;
    return {
      key,
      action: { type: likes ? 'signTreaty' : 'declineTreaty', id: t.id },
      say: likes ? pick([`I'll sign "${t.name}".`, `Count me in.`]) : pick([`"${t.name}" isn't for me.`, `I'll pass on that treaty.`]),
    };
  }

  // Warlike bots tear up treaties that stop them building an army.
  if (g.limits.maxUnits && P === PERSONALITIES.warlike && me.units >= g.limits.maxUnits.n && chance(0.3)) {
    const t = (g.treaties || []).find((x) => x.name === g.limits.maxUnits.name && x.signed.includes(g.you));
    if (t && fresh(`break-${t.id}`)) return { key: `break-${t.id}`, action: { type: 'breakTreaty', id: t.id }, say: `"${t.name}" is over for me.` };
  }

  if (me.ready || g.phase !== 'talk') return null;

  // Offer a pact (at most one a round).
  if (gen.pactsEnabled && fresh('offer-pact') && chance(P.pactChance)) {
    mem.tried.add('offer-pact');
    mem.asked = mem.asked || {}; // seat -> round we last offered them a pact
    const others = g.players.filter((p) => p.seat !== g.you && !(mem.asked[p.seat] > g.round - 3) && !pactWith(g, p.seat) && !(g.pacts || []).some((x) => x.status === 'proposed' && (x.a === g.you || x.b === g.you) && (x.a === p.seat || x.b === p.seat)));
    const strength = (p) => (p.units || 0) * 2 + (p.materialTotal || 0);
    if (others.length) {
      if (P === PERSONALITIES.warlike && g.players.length >= 3) {
        // Ally with someone against the strongest player.
        const enemy = g.players.filter((p) => p.seat !== g.you).sort((a, b) => strength(b) - strength(a))[0];
        const ally = others.filter((p) => p.seat !== enemy.seat && grudge(g, p.seat) === 0)[0];
        if (ally) {
          mem.asked[ally.seat] = g.round;
          return {
            key: 'offer-pact',
            action: { type: 'proposePact', to: ally.seat, kind: 'alliance', enemy: enemy.seat, rounds: 2 },
            say: pick([`${ally.name}, join me against ${enemy.name}?`, `${enemy.name} is getting too strong. Alliance, ${ally.name}?`, null]),
          };
        }
      } else {
        // Peace with the most dangerous neighbour we don't hold a grudge against.
        const partner = others.filter((p) => grudge(g, p.seat) === 0).sort((a, b) => strength(b) - strength(a))[0];
        if (partner) {
          mem.asked[partner.seat] = g.round;
          return {
            key: 'offer-pact',
            action: { type: 'proposePact', to: partner.seat, kind: 'peace', rounds: Math.min(2, gen.maxPactRounds) },
            say: pick([`${partner.name}, how about a truce for a couple of rounds?`, `Peace, ${partner.name}? Check your Trade tab.`, `I'd rather build walls than fight you, ${partner.name}.`, null, null]),
          };
        }
      }
    }
  }

  // Cautious bots propose a green treaty when the Flood is getting close (once a game).
  const danger = g.threshold - g.flood;
  if (gen.treatiesEnabled && P === PERSONALITIES.cautious && danger <= 6 && !mem.proposedTreaty && !(g.treaties || []).some((t) => t.signed.includes(g.you))) {
    mem.proposedTreaty = true;
    const invite = g.players.filter((p) => p.seat !== g.you).map((p) => p.seat);
    return {
      key: 'offer-treaty',
      action: { type: 'proposeTreaty', name: 'Green Pledge', note: 'Save the village.', clauses: { noUnsustainable: true }, rounds: 2, invite },
      say: `The Flood is at ${g.flood}. Please sign the Green Pledge — no Unsustainable for 2 rounds.`,
    };
  }
  return null;
}

/** Offer 2 of our most plentiful material for 1 of what the next wall needs. */
function tradeOffer(g, me, fresh) {
  if (me.sanctioned || !fresh('trade-offer') || g.trades.some((t) => t.from === g.you)) return null;
  const cost = wallCost(g);
  const need = MATS.find((m) => me.materials[m] < cost[m]);
  const spare = MATS.filter((m) => m !== need && me.materials[m] >= cost[m] + 2).sort((a, b) => me.materials[b] - me.materials[a])[0];
  if (!need || !spare) return null;
  const partner = g.players
    .filter((p) => p.seat !== g.you && !p.sanctioned && (!p.materials || p.materials[need] >= 1) && grudge(g, p.seat) === 0)
    .sort((a, b) => (b.materials ? b.materials[need] : 0) - (a.materials ? a.materials[need] : 0))[0];
  if (!partner) return null;
  const give = empty();
  const get = empty();
  give[spare] = 2;
  get[need] = 1;
  return { key: 'trade-offer', action: { type: 'proposeTrade', to: partner.seat, give, get }, say: chance(0.5) ? `${partner.name}, I've sent you an offer: 2 ${spare} for 1 ${need}.` : null };
}

// ---------------------------------------------------------------- chat

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Things a bot might say after something happened. Called after every update;
 * returns at most one line, and only for events it hasn't reacted to yet.
 */
function react(g, mem) {
  const me = g.players[g.you];
  const P = PERSONALITIES[mem.personality] || PERSONALITIES.balanced;
  mem.lastHits = mem.lastHits || {};
  mem.lastLogId = mem.lastLogId == null ? (g.log.length ? g.log[g.log.length - 1].id : 0) : mem.lastLogId;
  let line = null;
  // Someone attacked or raided us.
  for (const [seat, n] of Object.entries(me.hits || {})) {
    if (n > (mem.lastHits[seat] || 0) && !line) {
      const who = g.players[seat].name;
      line = P === PERSONALITIES.warlike ? pick([`You'll pay for that, ${who}.`, `Big mistake, ${who}.`]) : pick([`Ouch. I'll remember that, ${who}.`, `Why, ${who}? I thought we were friends.`]);
    }
  }
  mem.lastHits = { ...(me.hits || {}) };
  // A pact with us was broken, or someone broke a treaty.
  for (const e of g.log.filter((x) => x.id > mem.lastLogId)) {
    if (line) break;
    if (e.event === 'pactBroken' && e.victim === g.you) line = `Traitor, ${g.players[e.breaker].name}! Everyone saw that.`;
    else if (e.event === 'treatyBroken' && e.breaker !== g.you && chance(0.4)) line = `So much for treaties, ${g.players[e.breaker].name}.`;
  }
  mem.lastLogId = g.log.length ? g.log[g.log.length - 1].id : mem.lastLogId;
  // The Flood is close to catastrophe (once a round, careful bots only).
  const danger = g.threshold - g.flood;
  if (!line && danger <= 3 && P !== PERSONALITIES.warlike && mem.floodWarned !== g.round && g.phase === 'talk') {
    mem.floodWarned = g.round;
    line = pick([`The Flood is at ${g.flood} — ${danger} from disaster. Everyone go Sustainable this round, please!`, `We're ${danger} away from losing the village. No Unsustainable, please.`]);
  }
  return line;
}

/**
 * Reply to a human's chat message. Returns { say, action } or null.
 * Bots only understand a few keywords — they're not real conversation partners.
 */
function reply(text, from, g, mem, botName) {
  const P = PERSONALITIES[mem.personality] || PERSONALITIES.balanced;
  const t = text.toLowerCase();
  const short = botName.replace(/^bot\s+/i, '').toLowerCase();
  const named = t.includes(short);
  if (!named && !/\b(bots?|everyone|all|anyone|guys)\b/.test(t)) return null;
  const who = g.players[from].name;
  const build = g.phase === 'talk' || g.phase === 'trade';
  if (/\b(peace|truce|pact|ally|alliance|friends?|deal)\b/.test(t)) {
    if (!g.settings.general.pactsEnabled) return { say: 'Pacts are switched off in this game.' };
    if (pactWith(g, from)) return { say: `We already have a pact, ${who}.` };
    if (!trusts(g, from, P)) return { say: pick([`Not with you, ${who}. I remember.`, `No deal, ${who}.`]) };
    if (!build) return { say: `Ask me again in the next Talk & Build, ${who}.` };
    return { say: `Sure, ${who} — I've sent you a pact offer.`, action: { type: 'proposePact', to: from, kind: 'peace', rounds: Math.min(2, g.settings.general.maxPactRounds) } };
  }
  if (/\b(trade|swap|need|spare|give|sell|buy)\b/.test(t)) {
    const me = g.players[g.you];
    const cost = wallCost(g);
    const need = MATS.find((m) => me.materials[m] < cost[m]);
    const spare = MATS.filter((m) => m !== need).sort((a, b) => me.materials[b] - me.materials[a])[0];
    if (!need || !spare || me.materials[spare] < 2) return { say: `I don't have much to spare right now, ${who}.` };
    if (!build || me.sanctioned) return { say: `I could use ${need}. I'd give ${spare} for it.` };
    const give = empty();
    const get = empty();
    give[spare] = 2;
    get[need] = 1;
    return { say: `I need ${need}. Sent you an offer: 2 ${spare} for 1 ${need}.`, action: { type: 'proposeTrade', to: from, give, get } };
  }
  if (/\b(attack|war|raid|fight|invade)\b/.test(t)) {
    return { say: P === PERSONALITIES.warlike ? pick(['Bring it on.', 'War pays — for the winner.']) : pick(['Please, no fighting. The Flood is high enough.', 'Every battle floods us all.']) };
  }
  if (/\b(flood|sustainable|seawall|help|save|wall)\b/.test(t)) {
    return { say: P === PERSONALITIES.warlike ? 'Walls are for the weak. …Fine, I might build one.' : pick(['Agreed. Sustainable from me.', "I'll do my part for the seawall."]) };
  }
  if (/\b(hi|hello|hey|yo|gl|good luck)\b/.test(t)) return { say: pick([`Hi ${who}!`, 'Good luck, everyone.', 'Hello! May the waters stay low.']) };
  return named ? { say: pick(["I'm just a bot — try words like pact, trade, flood or attack.", 'Beep. I understand pact, trade, flood and attack.']) } : null;
}

module.exports = { decide, react, reply, wallTarget, PERSONALITIES, PERSONALITY_ORDER, BOT_NAMES };

