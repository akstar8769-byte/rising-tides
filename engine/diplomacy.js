/**
 * DIPLOMACY: pacts (never enforced) and treaties (enforced, optional)
 * ===================================================================
 * PACTS — like the rulebook says, promises are not binding. A pact is a
 * public promise between two players: "peace" (we won't raid or attack each
 * other) or "alliance" (peace + we name a shared enemy). The game never stops
 * you breaking one — but it announces it to everyone and remembers it.
 *
 * TREATIES — a separate option (setting general.treatiesEnabled, off by
 * default). A treaty is a set of rules the game can check, e.g. "no more than
 * 2 militia". While you're a signatory the game BLOCKS any move that would
 * break it. To get out you must openly break the treaty: you're marked as a
 * treaty-breaker and pay a penalty (general.treatyBreakPenalty materials).
 *
 * Both are created during Talk & Build or Trade & Build phases.
 */
'use strict';

const { fail, MATERIALS, bagTotal, subBag, emptyBag, addLog } = require('./util');

const BUILD = ['talk', 'trade'];
const G = (s) => s.settings.general;

function requireBuild(s) {
  if (!BUILD.includes(s.phase)) fail('Diplomacy happens during a Talk & Build or Trade & Build phase.');
}
function me(s, actor) {
  if (typeof actor !== 'number' || !s.players[actor]) fail('Only seated players can do that.');
  return s.players[actor];
}
function other(s, actor, seat) {
  if (!Number.isInteger(seat) || !s.players[seat]) fail('Pick a valid player.');
  if (seat === actor) fail("You can't make a pact with yourself.");
  return s.players[seat];
}
/** Last round a pact/treaty made now covers: made before choosing counts this round. */
function lastRound(s, rounds) {
  return s.round + rounds - (s.phase === 'talk' ? 1 : 0);
}

// ---------------------------------------------------------------- pacts

function findPact(s, a, b, status) {
  return s.pacts.find((p) => p.status === status && ((p.a === a && p.b === b) || (p.a === b && p.b === a)));
}
function activePact(s, a, b) {
  return findPact(s, a, b, 'active');
}
function pactName(s, p) {
  return p.kind === 'alliance' ? `alliance against ${s.players[p.enemy].name}` : 'non-aggression pact';
}

/** { to, kind: 'peace' | 'alliance', rounds, enemy } */
function proposePact(s, actor, { to, kind = 'peace', rounds = 2, enemy = null } = {}) {
  requireBuild(s);
  if (!G(s).pactsEnabled) fail('Pacts are switched off in this game.');
  const p = me(s, actor);
  const q = other(s, actor, to);
  if (!['peace', 'alliance'].includes(kind)) fail('Pick a non-aggression pact or an alliance.');
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > G(s).maxPactRounds) fail(`A pact lasts 1 to ${G(s).maxPactRounds} rounds.`);
  if (kind === 'alliance') {
    if (!Number.isInteger(enemy) || !s.players[enemy] || enemy === actor || enemy === to) fail('Name a shared enemy for the alliance.');
  } else enemy = null;
  if (activePact(s, actor, to)) fail(`You already have a pact with ${q.name}.`);
  if (findPact(s, actor, to, 'proposed')) fail(`There is already a pact offer between you and ${q.name}.`);
  const pact = { id: s.nextDiploId++, a: actor, b: to, kind, rounds, enemy, status: 'proposed', until: null };
  s.pacts.push(pact);
  addLog(s, `${p.name} offers ${q.name} a ${pactName(s, pact)} for ${rounds} round${rounds === 1 ? '' : 's'}.`, { kind: 'diplo' });
  return pact.id;
}

function respondPact(s, actor, { id, accept } = {}) {
  requireBuild(s);
  const pact = s.pacts.find((x) => x.id === id && x.status === 'proposed');
  if (!pact) fail('That pact offer is no longer open.');
  if (pact.b !== actor) fail('That offer is not for you.');
  const A = s.players[pact.a];
  const B = s.players[pact.b];
  if (!accept) {
    s.pacts = s.pacts.filter((x) => x !== pact);
    addLog(s, `${B.name} declines ${A.name}'s ${pactName(s, pact)}.`, { kind: 'diplo' });
    return;
  }
  pact.status = 'active';
  pact.until = lastRound(s, pact.rounds);
  A.stats.pactsMade += 1;
  B.stats.pactsMade += 1;
  addLog(s, `🤝 ${A.name} and ${B.name} agree a ${pactName(s, pact)} until the end of round ${pact.until}.`, { kind: 'good' });
}

function cancelPact(s, actor, { id } = {}) {
  const pact = s.pacts.find((x) => x.id === id && x.status === 'proposed');
  if (!pact) fail('That pact offer is no longer open.');
  if (pact.a !== actor) fail('That is not your offer.');
  s.pacts = s.pacts.filter((x) => x !== pact);
}

/**
 * Called by the rules when a player raids or attacks another player.
 * Remembers the hit and, if they had a pact, announces that it was broken.
 */
function onHostile(s, attacker, defender) {
  if (attacker == null || defender == null || attacker === defender) return;
  const A = s.players[attacker];
  const D = s.players[defender];
  D.hits[attacker] = (D.hits[attacker] || 0) + 1;
  const pact = activePact(s, attacker, defender);
  if (!pact) return;
  s.pacts = s.pacts.filter((x) => x !== pact);
  A.stats.pactsBroken += 1;
  A.betrayals += 1;
  addLog(s, `⚠ ${A.name} BROKE their ${pactName(s, pact)} with ${D.name}!`, { kind: 'bad', event: 'pactBroken', breaker: attacker, victim: defender });
}

// ---------------------------------------------------------------- treaties

function treatyRules(t, s) {
  const c = t.clauses;
  const out = [];
  if (c.maxUnits != null) out.push(`no more than ${c.maxUnits} militia each`);
  if (c.noUnsustainable) out.push('no Unsustainable development');
  if (c.noAttackSignatories) out.push(s && s.mode === 'base' ? 'no raids on each other' : 'no raids or attacks on each other');
  if (c.noAttacks) out.push(s && s.mode === 'base' ? 'no raids at all' : 'no raids or attacks at all');
  return out;
}

function complies(s, seat, clauses) {
  if (clauses.maxUnits != null && s.players[seat].units > clauses.maxUnits) {
    fail(`You have ${s.players[seat].units} militia; this treaty allows ${clauses.maxUnits}. Disband first by not paying upkeep, or don't sign.`);
  }
}

/**
 * { name, note, clauses: { maxUnits, noUnsustainable, noAttackSignatories, noAttacks }, rounds, invite: [seats] }
 * rounds = 0 means "until the end of the game".
 */
function proposeTreaty(s, actor, { name, note = '', clauses = {}, rounds = 0, invite = [] } = {}) {
  requireBuild(s);
  if (!G(s).treatiesEnabled) fail('Treaties are switched off in this game (the host can turn them on in the lobby).');
  const p = me(s, actor);
  const title = String(name || '').trim().slice(0, 40);
  if (!title) fail('Give the treaty a name.');
  const c = {
    maxUnits: clauses.maxUnits == null || clauses.maxUnits === '' ? null : Number(clauses.maxUnits),
    noUnsustainable: !!clauses.noUnsustainable,
    noAttackSignatories: !!clauses.noAttackSignatories,
    noAttacks: !!clauses.noAttacks,
  };
  if (c.maxUnits != null) {
    if (s.mode === 'base') fail('Militia limits only exist in War modes.');
    if (!Number.isInteger(c.maxUnits) || c.maxUnits < 0 || c.maxUnits > 99) fail('Militia limit must be a whole number from 0 to 99.');
  }
  if (c.maxUnits == null && !c.noUnsustainable && !c.noAttackSignatories && !c.noAttacks) fail('Add at least one rule to the treaty.');
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 50) fail('Invalid treaty length.');
  const invited = [...new Set(invite)].filter((x) => x !== actor);
  if (!invited.length || invited.some((x) => !Number.isInteger(x) || !s.players[x])) fail('Invite at least one other player.');
  complies(s, actor, c);
  const t = {
    id: s.nextDiploId++,
    name: title,
    note: String(note || '').trim().slice(0, 200),
    by: actor,
    clauses: c,
    invited,
    signed: [actor],
    declined: [],
    broken: [],
    until: rounds ? lastRound(s, rounds) : null,
    active: false,
  };
  s.treaties.push(t);
  p.stats.treatiesSigned += 1;
  addLog(
    s,
    `📜 ${p.name} proposes the treaty "${t.name}" (${treatyRules(t, s).join('; ')}${t.until ? `, until the end of round ${t.until}` : ', for the rest of the game'}) to ${invited.map((x) => s.players[x].name).join(', ')}.`,
    { kind: 'diplo' },
  );
  return t.id;
}

function getTreaty(s, id) {
  const t = s.treaties.find((x) => x.id === id);
  if (!t) fail('That treaty no longer exists.');
  return t;
}

function signTreaty(s, actor, { id } = {}) {
  requireBuild(s);
  const p = me(s, actor);
  const t = getTreaty(s, id);
  if (!t.invited.includes(actor)) fail("You weren't invited to that treaty.");
  if (t.signed.includes(actor) || t.declined.includes(actor) || t.broken.includes(actor)) fail('You already answered that treaty.');
  complies(s, actor, t.clauses);
  t.signed.push(actor);
  p.stats.treatiesSigned += 1;
  addLog(s, `📜 ${p.name} signs "${t.name}".`, { kind: 'diplo' });
  if (!t.active && t.signed.length >= 2) {
    t.active = true;
    addLog(s, `📜 The treaty "${t.name}" is now in force between ${t.signed.map((x) => s.players[x].name).join(', ')}.`, { kind: 'good' });
  }
}

function declineTreaty(s, actor, { id } = {}) {
  requireBuild(s);
  const p = me(s, actor);
  const t = getTreaty(s, id);
  if (!t.invited.includes(actor) || t.signed.includes(actor) || t.declined.includes(actor)) fail('You have nothing to decline.');
  t.declined.push(actor);
  addLog(s, `${p.name} declines the treaty "${t.name}".`, { kind: 'diplo' });
  endTreatyIfEmpty(s, t);
}

/** Openly break a treaty you signed: you're free of it, marked, and pay the penalty. */
function breakTreaty(s, actor, { id } = {}) {
  requireBuild(s);
  const p = me(s, actor);
  const t = getTreaty(s, id);
  if (!t.signed.includes(actor)) fail("You haven't signed that treaty.");
  t.signed = t.signed.filter((x) => x !== actor);
  t.broken.push(actor);
  p.stats.treatiesBroken += 1;
  p.treatyBreaks += 1;
  const pay = emptyBag();
  for (let i = 0; i < G(s).treatyBreakPenalty; i++) {
    const m = MATERIALS.reduce((best, x) => (p.materials[x] - pay[x] > p.materials[best] - pay[best] ? x : best), MATERIALS[0]);
    if (p.materials[m] - pay[m] <= 0) break;
    pay[m]++;
  }
  subBag(p.materials, pay);
  addLog(s, `🗡 ${p.name} BREAKS the treaty "${t.name}"${bagTotal(pay) ? ` and forfeits ${bagTotal(pay)} materials` : ''}.`, { kind: 'bad', event: 'treatyBroken', breaker: actor });
  endTreatyIfEmpty(s, t);
}

function endTreatyIfEmpty(s, t) {
  const pending = t.invited.filter((x) => !t.signed.includes(x) && !t.declined.includes(x) && !t.broken.includes(x));
  if (t.signed.length >= 2 || (t.signed.length === 1 && pending.length && !t.active)) return;
  s.treaties = s.treaties.filter((x) => x !== t);
  addLog(s, `📜 The treaty "${t.name}" has ended: not enough signatories.`, { kind: 'diplo' });
}

/** What the treaties you're in forbid you right now. */
function limitsFor(s, seat) {
  const lim = { noUnsustainable: null, maxUnits: null, noAttacks: null, protectedSeats: {} };
  for (const t of s.treaties) {
    if (!t.active || !t.signed.includes(seat)) continue;
    const c = t.clauses;
    if (c.noUnsustainable) lim.noUnsustainable = t.name;
    if (c.noAttacks) lim.noAttacks = t.name;
    if (c.maxUnits != null && (!lim.maxUnits || c.maxUnits < lim.maxUnits.n)) lim.maxUnits = { n: c.maxUnits, name: t.name };
    if (c.noAttackSignatories) for (const x of t.signed) if (x !== seat) lim.protectedSeats[x] = t.name;
  }
  return lim;
}

/**
 * Returns the name of a treaty that forbids this move, or null.
 *   kind: 'unsustainable' | 'attack' (attacks, raids, claims, revolts)
 */
function blockedBy(s, seat, kind, targetSeat = null) {
  const lim = limitsFor(s, seat);
  if (kind === 'unsustainable') return lim.noUnsustainable;
  if (kind === 'attack') return lim.noAttacks || (targetSeat != null && lim.protectedSeats[targetSeat]) || null;
  return null;
}

function checkMove(s, seat, kind, targetSeat = null) {
  const name = blockedBy(s, seat, kind, targetSeat);
  if (!name) return;
  if (kind === 'unsustainable') fail(`You signed the treaty "${name}": no Unsustainable development.`);
  fail(`You signed the treaty "${name}", which forbids that attack. Break the treaty first if you mean it.`);
}

function checkUnits(s, seat, newTotal) {
  const lim = limitsFor(s, seat);
  if (lim.maxUnits && newTotal > lim.maxUnits.n) fail(`You signed the treaty "${lim.maxUnits.name}": no more than ${lim.maxUnits.n} militia.`);
}

// ---------------------------------------------------------------- end of round

/** Pacts and treaties that run out this round end; unanswered pact offers lapse. */
function endOfRound(s) {
  for (const p of [...s.pacts]) {
    if (p.status === 'proposed') {
      s.pacts = s.pacts.filter((x) => x !== p);
    } else if (p.until != null && p.until <= s.round) {
      s.pacts = s.pacts.filter((x) => x !== p);
      s.players[p.a].stats.pactsKept += 1;
      s.players[p.b].stats.pactsKept += 1;
      addLog(s, `🤝 The ${pactName(s, p)} between ${s.players[p.a].name} and ${s.players[p.b].name} ended peacefully.`, { kind: 'good' });
    }
  }
  for (const t of [...s.treaties]) {
    if (t.until != null && t.until <= s.round) {
      s.treaties = s.treaties.filter((x) => x !== t);
      addLog(s, `📜 The treaty "${t.name}" has run its course.`, { kind: 'diplo' });
    }
  }
}

/** Add diplomacy info to one player's view. Pact OFFERS are private to the two players. */
function decorateView(v, s, seat) {
  v.pacts = s.pacts.filter((p) => p.status === 'active' || p.a === seat || p.b === seat);
  v.treaties = s.treaties;
  v.limits = limitsFor(s, seat);
  for (const t of v.treaties) t.rules = treatyRules(t, s);
}

const handlers = { proposePact, respondPact, cancelPact, proposeTreaty, signTreaty, declineTreaty, breakTreaty };

module.exports = { handlers, onHostile, endOfRound, decorateView, blockedBy, checkMove, checkUnits, limitsFor, activePact, treatyRules };
