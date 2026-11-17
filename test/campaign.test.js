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

/** Skip to round r; humans answer each decision with option `pick` (0 = usually historical). */
function toRound(s, r, pick = 1) {
  while (s.round < r) {
    s.phase = 'trade';
    for (const p of s.players) p.ready = false;
    for (const p of s.players) {
      if (p.out) continue;
      while ((s.players[p.seat].decisions || []).length) s = act(s, p.seat, 'answerEvent', { key: s.players[p.seat].decisions[0].key, option: pick });
      s = act(s, p.seat, 'ready');
    }
  }
  return s;
}

test('historical events: bots take the historical choice, humans decide for themselves', () => {
  const ger = seat('GER');
  const b = toRound(europe(), 3);
  assert.ok(CAMP.atWar(b, ger, seat('DEN')), 'bot Germany occupies Denmark in round 3');
  // A human Germany is asked instead, and can't end the round before answering.
  let h = europe(['GER']);
  assert.equal((h.players[ger].decisions || []).length, 0, 'nothing to decide in September 1939');
  h = toRound(h, 3);
  const asked = h.players[ger].decisions.map((x) => x.title);
  assert.ok(asked.includes('Iron ore from the north'), asked.join());
  assert.ok(!CAMP.atWar(h, ger, seat('DEN')), 'no war until Germany decides');
  assert.throws(() => act(h, ger, 'ready'), /Answer the news first/);
  const v = engine.viewFor(h, ger).scenario;
  const ore = v.decisions.find((x) => x.title === 'Iron ore from the north');
  assert.equal(ore.options.length, 2);
  assert.match(ore.options[0].summary, /war with Denmark and Norway/);
  assert.equal(engine.viewFor(h, seat('UK')).scenario.decisions.length, 0, 'others never see your decisions');
  h = act(h, ger, 'answerEvent', { key: h.players[ger].decisions.find((x) => x.id === 'weserubung').key, option: 1 });
  assert.ok(!CAMP.atWar(h, ger, seat('DEN')));
  assert.ok(h.log.some((l) => /Germany leaves Scandinavia alone/.test(l.text)));
});

test('answering an event: war and joining a faction, with the right side brought in', () => {
  const ger = seat('GER');
  let s = toRound(europe(['GER']), 3);
  const key = s.players[ger].decisions.find((x) => x.id === 'weserubung').key;
  assert.throws(() => act(s, ger, 'answerEvent', { key: 'nope', option: 0 }), /no such decision/);
  assert.throws(() => act(s, ger, 'answerEvent', { key, option: 5 }), /Pick one/);
  s = act(s, ger, 'answerEvent', { key, option: 0 });
  for (const id of ['DEN', 'NOR']) assert.ok(CAMP.atWar(s, ger, seat(id)), id);
  assert.ok(!s.players[ger].decisions.some((x) => x.id === 'weserubung'));
  // Italy (human) joins the Axis and attacks France in round 4.
  const ita = seat('ITA');
  s = toRound(europe(['ITA']), 4, 0);
  const it = s.players[ita].decisions.find((x) => x.id === 'italyWar');
  assert.ok(it, 'Italy is asked in round 4');
  s = act(s, ita, 'answerEvent', { key: it.key, option: 0 });
  assert.equal(s.players[ita].faction, 'axis');
  assert.ok(CAMP.atWar(s, ita, seat('FRA')) && CAMP.atWar(s, ita, seat('UK')));
});

test('the newspaper: each round prints the headlines since the last edition', () => {
  let s = europe();
  const paper = engine.viewFor(s, 0).scenario.paper;
  assert.equal(paper.date, 'Sep 1939');
  assert.ok(paper.headlines.some((h) => /Germany invades Poland/.test(h)));
  assert.ok(paper.headlines.every((h) => !h.startsWith('📰')));
  s = toRound(s, 2);
  const p2 = engine.viewFor(s, 0).scenario.paper;
  assert.equal(p2.date, 'Dec 1939');
  assert.ok(!p2.headlines.some((h) => /Germany invades Poland/.test(h)), 'old news is not repeated');
  assert.ok(p2.headlines.some((h) => /Winter War/.test(h)));
});

test('America enters the war in round 10: every Allied nation gets supplies; unrest hits unpopular governments', () => {
  let s = europe();
  s.round = 9;
  const uk = seat('UK');
  const before = Object.values(s.players[uk].materials).reduce((a, b) => a + b, 0);
  s.round = 10;
  CAMP.runEvents(s);
  assert.equal(Object.values(s.players[uk].materials).reduce((a, b) => a + b, 0), before + 8);
  // Unrest: a human France whose government has only 35% support must respond.
  const fra = seat('FRA');
  let t = europe(['FRA']);
  t.players[fra].pop = { democracy: 35, fascism: 25, communism: 25, nonaligned: 15 };
  CAMP.runEvents(t);
  assert.equal(t.players[fra].decisions[0].title, 'Unrest at home');
  t = act(t, fra, 'answerEvent', { key: t.players[fra].decisions[0].key, option: 1 });
  assert.equal(t.players[fra].pop.democracy, 39);
  CAMP.runEvents(t);
  assert.equal(t.players[fra].decisions.length, 0, 'not again so soon');
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

test('1941 in an all-bot game: Barbarossa, and the USSR makes peace with Poland and joins the Allies', () => {
  const s = toRound(europe(), 9);
  const ussr = seat('USSR');
  assert.ok(CAMP.atWar(s, seat('GER'), ussr));
  assert.equal(s.players[ussr].faction, 'allies');
  assert.ok(!CAMP.atWar(s, ussr, seat('POL')));
  assert.ok(!s.log.some((l) => /\(Germany\) declares war on/.test(l.text)), 'one headline per event, not one per target');
});

// ---------------------------------------------------------------- war plans & doctrines (Phase 5)
test('war plans: what each bot nation is driving at, by period', () => {
  const s = europe();
  const ger = seat('GER');
  s.round = 3;
  const p3 = CAMP.planFor(s, ger);
  assert.ok(p3.main.includes('Paris') && !p3.main.includes('Copenhagen'), 'the army masses for France, not Denmark');
  assert.ok(p3.attack.includes('Copenhagen'), 'Denmark is still a target');
  s.round = 9;
  assert.ok(CAMP.planFor(s, ger).main.includes('Moscow'));
  assert.ok(CAMP.planFor(s, seat('FRA')).passive, 'France sits behind the Maginot Line');
  s.round = 7;
  assert.ok(CAMP.planFor(s, seat('USSR')).passive, 'the USSR keeps the pact');
  s.round = 15;
  assert.ok(CAMP.planFor(s, seat('USSR')).avoid.includes('Warsaw'));
  // Only bots carry a plan in their view.
  const h = europe(['GER']);
  assert.equal(engine.viewFor(h, ger).scenario.plan, null);
  assert.ok(engine.viewFor(h, seat('UK')).scenario.plan);
});

test('doctrines: Blitzkrieg until autumn 1941, General Winter for the Soviets in winter', () => {
  const s = europe(['GER']);
  const ger = seat('GER');
  const ussr = seat('USSR');
  assert.equal(CAMP.doctrine(s, ger).attack, 130);
  assert.equal(engine.viewFor(s, ger).scenario.doctrine.active[0].name, 'Blitzkrieg', 'humans get it too');
  s.round = 10;
  assert.equal(CAMP.doctrine(s, ger).attack, 100);
  assert.equal(CAMP.doctrine(s, ussr).defence, 125, 'December 1941');
  s.round = 11;
  assert.equal(CAMP.doctrine(s, ussr).defence, 100, 'not in spring');
  assert.equal(CAMP.doctrine(s, seat('UK')).attack, 100);
});

test('a nation that is only its capital (Denmark) can be attacked there', () => {
  const s = europe(['GER']);
  const ger = seat('GER');
  s.campaign.wars.push([ger, seat('DEN')].sort((a, b) => a - b).join('-'));
  assert.ok(engine.viewFor(s, ger).attackTargets.includes(city(s, 'Copenhagen').id));
});

test('bots mass on the war plan: in 1940 German armies march west, towards France', () => {
  const bots = require('../server/bots');
  const ger = seat('GER');
  let s = toRound(europe(), 3);
  const paris = city(s, 'Paris');
  const dist = (t) => (Math.abs(t.q - paris.q) + Math.abs(t.r - paris.r) + Math.abs(t.q + t.r - paris.q - paris.r)) / 2;
  const mem = { personality: 'balanced', tried: new Set(), phaseKey: null, failures: 0 };
  let moved = null;
  for (let i = 0; i < 60 && !moved; i++) {
    const idea = bots.decide(engine.viewFor(s, ger), mem);
    if (!idea) break;
    try {
      s = engine.applyAction(s, ger, idea.action);
    } catch (e) {
      mem.tried.add(idea.key);
      continue;
    }
    if (idea.key.startsWith('plan-')) moved = idea.action;
  }
  assert.ok(moved, 'Germany made a war-plan move');
  const from = s.board.tiles.find((t) => t.id === moved.from);
  const to = s.board.tiles.find((t) => t.id === moved.to);
  assert.ok(dist(to) < dist(from), `${moved.from} -> ${moved.to} heads for Paris`);
});

// ---------------------------------------------------------------- oil
test('oil: machines burn fuel; imports and oil fields pay for it; short of fuel, machines fight weaker', () => {
  const s = europe();
  const ger = seat('GER');
  const need = CAMP.fuelNeed(s, ger);
  assert.ok(need > 0, 'German tanks and planes need fuel');
  assert.equal(CAMP.fuelNeed(s, seat('IRE')), 0, 'an army of infantry needs none');
  assert.ok(CAMP.landOil(s, seat('USSR')) > 0 && CAMP.landOil(s, seat('ROM')) > 0, 'Baku and Ploiești');
  assert.equal(CAMP.landOil(s, seat('GER')), 0);
  // Fully fuelled.
  s.players[ger].materials.stone = need;
  CAMP.payFuel(s);
  assert.equal(s.players[ger].fuelPct, 100);
  assert.equal(CAMP.fuelStrength(s, ger), 100);
  // No oil and no imports: machines fight at half strength.
  for (const p of s.players) p.materials.stone = 0;
  const imp = CAMP.oilImports(s, ger);
  require('../engine/europe39').OIL.imports.GER = 0;
  try {
    CAMP.payFuel(s);
    assert.equal(s.players[ger].fuelPct, 0);
    assert.equal(CAMP.fuelStrength(s, ger), 50);
    assert.ok(s.log.some((l) => /Germany is short of fuel/.test(l.text)));
    assert.equal(engine.viewFor(s, ger).scenario.fuel.strength, 50);
  } finally {
    require('../engine/europe39').OIL.imports.GER = imp;
  }
});

test('oil: bot allies in the same faction send spare oil to a partner who is short', () => {
  const s = europe(['GER']);
  const ger = seat('GER');
  const rom = seat('ROM');
  s.players[rom].faction = 'axis';
  for (const p of s.players) p.materials.stone = 0;
  s.players[rom].materials.stone = 30;
  CAMP.payFuel(s);
  assert.equal(s.players[ger].fuelPct, 100, 'Romanian oil keeps the Wehrmacht moving');
  assert.ok(s.players[rom].materials.stone < 30 + CAMP.oilImports(s, rom));
  assert.ok(s.log.some((l) => /Romania sends \d+ oil to Germany/.test(l.text)));
});

test('Soviet industry beyond the Urals: +6 materials a round from December 1941', () => {
  const s = europe();
  const ussr = seat('USSR');
  s.round = 9;
  assert.ok(!CAMP.doctrine(s, ussr).materials);
  s.round = 10;
  assert.equal(CAMP.doctrine(s, ussr).materials, 6);
});
