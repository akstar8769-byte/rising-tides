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
