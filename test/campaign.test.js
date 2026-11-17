'use strict';
// Grand campaign: Europe 1939 — many nations, factions, wars, capitulation.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine');
const { cloneDefaults } = require('../config');
const CAMP = require('../engine/campaign');
const war = require('../engine/war');
const { areAdjacent } = require('../engine/board');

const NATIONS = CAMP.nationsOf('europe39');
const seat = (id) => NATIONS.findIndex((n) => n.id === id);
/** A Europe game; `humans` lists nation ids played by humans (everyone else is a bot). */
function europe(humans = []) {
  const settings = cloneDefaults();
  settings.totalwar.scenario = 'europe39';
  return engine.createGame({ mode: 'totalwar', settings, players: NATIONS.map((n) => ({ name: humans.includes(n.id) ? `Human ${n.id}` : n.name, biome: 'forest', bot: !humans.includes(n.id) })), seed: 7 });
}
const act = (s, seatNo, type, extra = {}) => engine.applyAction(s, seatNo, { type, ...extra });
const city = (s, name) => s.board.tiles.find((t) => t.name === name);

test('Europe 1939: 23 nations, ~400 land hexes, every capital held by its nation', () => {
  const s = europe();
  assert.equal(s.players.length, 23);
  assert.ok(s.board.tiles.filter((t) => t.kind === 'land').length > 380);
  for (const n of NATIONS) {
    const p = s.players[seat(n.id)];
    assert.equal(p.nation, n.id);
    assert.equal(city(s, n.capital).controller, seat(n.id), n.capital);
    assert.equal(city(s, n.capital).role, 'capital');
  }
  assert.throws(() => engine.createGame({ mode: 'totalwar', settings: Object.assign(cloneDefaults(), {}), players: [{ name: 'a', biome: 'forest' }] }));
});

test('the war as of September 1939: Germany vs Poland, Britain, France; the USSR invades Poland alone', () => {
  const s = europe();
  const ger = seat('GER');
  assert.deepEqual(CAMP.enemiesOf(s, ger).map((x) => NATIONS[x].id).sort(), ['FRA', 'POL', 'UK']);
  assert.deepEqual(CAMP.enemiesOf(s, seat('USSR')).map((x) => NATIONS[x].id), ['POL'], 'Britain and France are not dragged in');
  // Neutrals can't be attacked; enemies can.
  const v = engine.viewFor(s, ger);
  for (const id of v.attackTargets) {
    const t = s.board.tiles.find((x) => x.id === id);
    assert.ok(t.controller == null || CAMP.atWar(s, ger, t.controller), `${id} belongs to an enemy`);
  }
  assert.ok(v.attackTargets.some((id) => s.board.tiles.find((x) => x.id === id).controller === seat('POL')));
  assert.equal(engine.viewFor(s, seat('SPA')).attackTargets.length, 0, 'neutral Spain has no war');
  assert.equal(v.scenario.date, 'Sep 1939');
  assert.equal(v.scenario.attacksPerRound, 3);
  assert.equal(engine.viewFor(s, seat('POL')).scenario.attacksPerRound, 1);
});

test('declaring war: factions defend their members; you cannot declare on your own faction', () => {
  let s = europe(['ITA']);
  const ita = seat('ITA');
  assert.throws(() => act(s, ita, 'declareWar', { target: ita }));
  s = act(s, ita, 'declareWar', { target: seat('FRA') });
  // France is in the Allies: Italy is now at war with Britain and Poland too.
  for (const id of ['FRA', 'UK', 'POL']) assert.ok(CAMP.atWar(s, ita, seat(id)), id);
  assert.throws(() => act(s, ita, 'declareWar', { target: seat('UK') }), /already at war/);
  assert.throws(() => act(s, seat('UK'), 'declareWar', { target: seat('FRA') }), /own faction/);
});

test('the historical timeline only moves bot nations; humans decide for themselves', () => {
  const human = europe(['GER']);
  const bot = europe();
  const toRound = (s, r) => {
    while (s.round < r) {
      s.phase = 'trade';
      for (const p of s.players) p.ready = false;
      for (const p of s.players) if (!p.out) s = act(s, p.seat, 'ready');
    }
    return s;
  };
  const b = toRound(bot, 3);
  assert.ok(CAMP.atWar(b, seat('GER'), seat('DEN')), 'bot Germany occupies Denmark in round 3');
  const h = toRound(human, 3);
  assert.ok(!CAMP.atWar(h, seat('GER'), seat('DEN')), "human Germany wasn't made to");
});

test('a nation whose capital falls capitulates: its land goes to the conqueror and it stops playing', () => {
  let s = europe();
  const ger = seat('GER');
  const pol = seat('POL');
  const warsaw = city(s, 'Warsaw');
  const from = s.board.tiles.find((t) => t.kind === 'land' && t.controller === ger && areAdjacent(t, warsaw)) ||
    Object.assign(s.board.tiles.find((t) => t.kind === 'land' && t.controller === pol && t !== warsaw && areAdjacent(t, warsaw)), { controller: ger });
  Object.assign(from, { troops: { [ger]: { infantry: 6 } }, units: { [ger]: 6 } });
  Object.assign(warsaw, { troops: {}, units: {} });
  for (const p of s.players) if (!p.out) s = act(s, p.seat, 'ready');
  assert.equal(s.phase, 'choose');
  for (const p of s.players) {
    if (p.seat === ger) s = act(s, ger, 'choose', { action: 'attack', target: warsaw.id, from: from.id, troops: { infantry: 6 } });
    else if (s.phase === 'choose' && !s.players[p.seat].choice) s = act(s, p.seat, 'choose', { action: 'sustainable', mix: { wood: 0, stone: 0, sandbag: 0 } });
  }
  assert.ok(s.players[pol].out, 'Poland is out');
  assert.equal(s.board.tiles.filter((t) => t.kind === 'land' && t.controller === pol).length, 0);
  assert.ok(s.log.some((l) => /Poland capitulates/.test(l.text)));
  // Out nations never hold up a phase.
  assert.ok(!engine.waitingFor(s).includes(pol));
});

test('victory: the faction with the most victory points at the end', () => {
  const s = europe();
  const vp = CAMP.vpHeld(s);
  assert.ok(vp.allies > vp.axis && vp.comintern > 0);
  for (const name of ['London', 'Paris', 'Moscow', 'Leningrad', 'Stalingrad']) city(s, name).controller = seat('GER');
  const o = war.scoreTotalWar(s, 'rounds');
  assert.equal(o.scenario.side, 'axis');
  assert.ok(o.winners.includes(seat('GER')));
});

// ---------------------------------------------------------------- politics (Phase 3)
const rich = (s, n) => { s.players[n].materials = { wood: 30, stone: 30, sandbag: 30 }; return s; };
const pay = { wood: 4, stone: 0, sandbag: 0 };

test('every nation starts with a government and popularity that sums to 100', () => {
  const s = europe();
  assert.equal(s.players[seat('GER')].gov, 'fascism');
  assert.equal(s.players[seat('USSR')].gov, 'communism');
  assert.equal(s.players[seat('UK')].gov, 'democracy');
  for (const p of s.players) assert.equal(Object.values(p.pop).reduce((a, b) => a + b, 0), 100, p.name);
});

test('propaganda: costs materials, raises support, at most twice a round', () => {
  const fra = seat('FRA');
  let s = rich(europe(['FRA']), fra);
  const before = s.players[fra].pop.communism;
  s = act(s, fra, 'propaganda', { ideology: 'communism', materials: pay });
  assert.equal(s.players[fra].pop.communism, before + 5);
  assert.equal(s.players[fra].materials.wood, 26);
  assert.equal(Object.values(s.players[fra].pop).reduce((a, b) => a + b, 0), 100);
  assert.throws(() => act(s, fra, 'propaganda', { ideology: 'communism', materials: { wood: 3, stone: 0, sandbag: 0 } }), /costs 4/);
  s = act(s, fra, 'propaganda', { ideology: 'communism', materials: pay });
  assert.throws(() => act(s, fra, 'propaganda', { ideology: 'communism', materials: pay }), /At most 2/);
  assert.equal(engine.viewFor(s, fra).scenario.politics.usedThisRound, 2);
});

test('changing government: peaceful with 50%+, refused below 30%, and a faction that will not have you drops you', () => {
  const fra = seat('FRA');
  let s = europe(['FRA']);
  assert.throws(() => act(s, fra, 'changeGovernment', { ideology: 'fascism' }), /Not enough support/);
  assert.throws(() => act(s, fra, 'changeGovernment', { ideology: 'democracy' }), /already your government/);
  s.players[fra].pop = { democracy: 30, fascism: 55, communism: 10, nonaligned: 5 };
  s = act(s, fra, 'changeGovernment', { ideology: 'fascism' });
  assert.equal(s.players[fra].gov, 'fascism');
  assert.equal(s.players.length, 23, 'no civil war');
  assert.equal(s.players[fra].faction, null, 'the Allies drop a fascist France');
  // A fascist France can join the Axis only if it isn't at war with them.
  assert.throws(() => act(s, fra, 'joinFaction', { faction: 'axis' }), /at war with/);
  assert.throws(() => act(s, fra, 'joinFaction', { faction: 'comintern' }), /won't accept/);
});

test('civil war: the country splits, the old regime becomes a bot nation at war with you', () => {
  const fra = seat('FRA');
  let s = europe(['FRA']);
  const landBefore = s.board.tiles.filter((t) => t.kind === 'land' && t.controller === fra).length;
  s.players[fra].pop = { democracy: 50, fascism: 10, communism: 35, nonaligned: 5 };
  s = act(s, fra, 'changeGovernment', { ideology: 'communism' });
  assert.equal(s.players.length, 24);
  const rebel = s.players[23];
  assert.equal(rebel.bot, true);
  assert.equal(rebel.gov, 'democracy');
  assert.equal(rebel.faction, 'allies', 'the loyalists stay in the Allies');
  assert.equal(s.players[fra].gov, 'communism');
  const mine = s.board.tiles.filter((t) => t.kind === 'land' && t.controller === fra).length;
  const theirs = s.board.tiles.filter((t) => t.kind === 'land' && t.controller === 23).length;
  assert.equal(mine + theirs, landBefore);
  assert.ok(theirs > 0 && mine > 0);
  assert.equal(city(s, 'Paris').controller, fra, 'you keep the capital');
  assert.ok(rebel.units >= 3, 'the loyalists have an army');
  assert.ok(CAMP.atWar(s, fra, 23));
  assert.ok(CAMP.atWar(s, 23, seat('GER')), "they inherit France's wars");
  const v = engine.viewFor(s, fra);
  assert.equal(v.scenario.nations.length, 24);
  assert.match(v.scenario.nations[23].name, /France \(Democracy\)/);
  assert.ok(s.log.some((l) => /CIVIL WAR in France/.test(l.text)));
});

test('democracies need a reason to declare war; others do not', () => {
  const s = europe(['UK', 'ITA']);
  assert.throws(() => act(s, seat('UK'), 'declareWar', { target: seat('SPA') }), /Democracies need a reason/);
  // Italy (fascist) may attack anyone.
  act(s, seat('ITA'), 'declareWar', { target: seat('GRE') });
  // Germany is already at war with Britain's faction: Britain may declare on Germany's friends-in-arms.
  const s2 = europe(['UK']);
  s2.campaign.wars.push([seat('ITA'), seat('FRA')].sort((a, b) => a - b).join('-'));
  act(s2, seat('UK'), 'declareWar', { target: seat('ITA') });
});
