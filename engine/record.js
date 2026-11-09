/**
 * Playtest record: a summary of a finished game, as JSON and CSV,
 * so the team can collect results in a spreadsheet.
 */
'use strict';

const { BIOMES } = require('./board');

/**
 * @param state  a finished game state
 * @param meta   { startedAt, endedAt } as millisecond timestamps (from the server)
 */
function playtestRecord(state, meta = {}) {
  const o = state.outcome || { results: [], winners: [] };
  const rounds = state.mode === 'base' ? state.settings.base.rounds : state.settings.war.rounds;
  const war = state.mode !== 'base';
  const minutes = meta.startedAt && meta.endedAt ? Math.round((meta.endedAt - meta.startedAt) / 6000) / 10 : null;
  const players = state.players.map((p) => {
    const r = o.results.find((x) => x.seat === p.seat) || {};
    return {
      seat: p.seat + 1,
      name: p.name,
      biome: BIOMES[p.biome].label,
      walls: p.walls,
      protection: r.protection,
      survived: !!r.survived,
      spareMaterials: r.spare,
      donated: p.donated,
      seawallPoints: r.seawallPoints,
      score: r.score,
      winner: o.winners.includes(p.seat),
      actions: { sustainable: p.stats.sustainable, unsustainable: p.stats.unsustainable, raid: p.stats.raid },
      raidsWon: p.stats.raidsWon,
      raidsLost: p.stats.raidsLost,
      timesRaided: p.stats.timesRaided,
      tokensStolen: p.stats.tokensStolen,
      wallsBuilt: p.stats.wallsBuilt,
      marketTrades: p.stats.marketTrades,
      tradesCompleted: p.stats.tradesCompleted,
      gifts: p.stats.gifts,
      // War / Empire (zero in Base)
      attacks: p.stats.attack,
      attacksWon: p.stats.attacksWon,
      claims: p.stats.claims,
      clashes: p.stats.clashes,
      timesAttacked: p.stats.timesAttacked,
      unitsFinal: p.units,
      unitsRecruited: p.stats.unitsRecruited,
      unitsLost: p.stats.unitsLost,
      unitsDisbanded: p.stats.unitsDisbanded,
      sanctions: p.stats.sanctions,
      aidReceived: p.stats.aidReceived,
      revolts: p.stats.revolt,
      revoltsWon: p.stats.revoltsWon,
      captures: p.stats.captures,
      tributePaid: p.stats.tributePaid,
      tributeReceived: p.stats.tributeReceived,
      puppetAtEnd: p.puppetOf != null ? state.players[p.puppetOf].name : null,
      armyFlood: p.stats.armyFlood,
    };
  });
  return {
    game: 'Rising Tides',
    recordVersion: 1,
    date: meta.startedAt ? new Date(meta.startedAt).toISOString() : null,
    mode: state.mode,
    playerCount: state.players.length,
    roundsPlanned: rounds,
    roundsPlayed: state.round,
    endReason: o.reason || null, // rounds | storm | catastrophe | host
    catastrophe: !!o.catastrophe,
    finalFlood: state.flood,
    catastropheThreshold: o.threshold,
    seawallDonatedTotal: state.seawall,
    homesSaved: players.filter((p) => p.survived).length,
    winners: players.filter((p) => p.winner).map((p) => p.name),
    raids: players.reduce((a, p) => a + p.actions.raid, 0),
    raidsWon: players.reduce((a, p) => a + p.raidsWon, 0),
    attacks: war ? players.reduce((a, p) => a + p.attacks, 0) : null,
    clashes: war ? state.clashCount : null,
    revolts: state.mode === 'empire' ? players.reduce((a, p) => a + p.revolts, 0) : null,
    accordBrokeRound: war ? state.accordBrokeRound : null, // null = the Accord held all game
    floodFromArmies: war ? state.floodFromArmies : null,
    floodFromDestruction: war ? state.floodFromDestruction : null,
    lengthMinutes: minutes,
    settings: state.settings,
    players,
  };
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** One row per player, with the game-level columns repeated on every row. */
function recordToCsv(rec) {
  const cols = [
    ['date', () => rec.date],
    ['mode', () => rec.mode],
    ['player_count', () => rec.playerCount],
    ['rounds_planned', () => rec.roundsPlanned],
    ['rounds_played', () => rec.roundsPlayed],
    ['end_reason', () => rec.endReason],
    ['final_flood', () => rec.finalFlood],
    ['catastrophe_threshold', () => rec.catastropheThreshold],
    ['seawall_total', () => rec.seawallDonatedTotal],
    ['homes_saved', () => rec.homesSaved],
    ['raids_total', () => rec.raids],
    ['attacks_total', () => rec.attacks],
    ['clashes', () => rec.clashes],
    ['revolts', () => rec.revolts],
    ['accord_broke_round', () => rec.accordBrokeRound],
    ['length_minutes', () => rec.lengthMinutes],
    ['flood_from_armies', () => rec.floodFromArmies],
    ['flood_from_destruction', () => rec.floodFromDestruction],
    ['seat', (p) => p.seat],
    ['player', (p) => p.name],
    ['biome', (p) => p.biome],
    ['walls', (p) => p.walls],
    ['protection', (p) => p.protection],
    ['survived', (p) => p.survived],
    ['spare_materials', (p) => p.spareMaterials],
    ['donated', (p) => p.donated],
    ['score', (p) => p.score],
    ['winner', (p) => p.winner],
    ['sustainable', (p) => p.actions.sustainable],
    ['unsustainable', (p) => p.actions.unsustainable],
    ['raid', (p) => p.actions.raid],
    ['raids_won', (p) => p.raidsWon],
    ['times_raided', (p) => p.timesRaided],
    ['walls_built', (p) => p.wallsBuilt],
    ['market_trades', (p) => p.marketTrades],
    ['trades_completed', (p) => p.tradesCompleted],
    ['gifts', (p) => p.gifts],
    ['attacks', (p) => p.attacks],
    ['attacks_won', (p) => p.attacksWon],
    ['claims', (p) => p.claims],
    ['clash_battles', (p) => p.clashes],
    ['times_attacked', (p) => p.timesAttacked],
    ['units_final', (p) => p.unitsFinal],
    ['units_recruited', (p) => p.unitsRecruited],
    ['units_lost', (p) => p.unitsLost],
    ['units_disbanded', (p) => p.unitsDisbanded],
    ['sanctions', (p) => p.sanctions],
    ['aid_received', (p) => p.aidReceived],
    ['revolts', (p) => p.revolts],
    ['revolts_won', (p) => p.revoltsWon],
    ['captures', (p) => p.captures],
    ['tribute_paid', (p) => p.tributePaid],
    ['tribute_received', (p) => p.tributeReceived],
    ['puppet_of_at_end', (p) => p.puppetAtEnd],
    ['army_flood', (p) => p.armyFlood],
  ];
  const lines = [cols.map((c) => c[0]).join(',')];
  for (const p of rec.players) lines.push(cols.map((c) => csvCell(c[1](p))).join(','));
  return lines.join('\n') + '\n';
}

module.exports = { playtestRecord, recordToCsv };
