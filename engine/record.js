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
    attacks: null, // War mode (step 4)
    clashes: null,
    revolts: null, // Empire mode (step 5)
    accordBrokeRound: null,
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
  ];
  const lines = [cols.map((c) => c[0]).join(',')];
  for (const p of rec.players) lines.push(cols.map((c) => csvCell(c[1](p))).join(','));
  return lines.join('\n') + '\n';
}

module.exports = { playtestRecord, recordToCsv };
