// End screen: who survived, scores, winner, and the playtest record downloads.
import { esc, chip } from './ui.js';
import { renderBoard } from './board.js';
import { renderLog, renderChat } from './log.js';

export function renderEnd(store) {
  const d = store.data;
  const g = d.game;
  const o = g.outcome;
  const rec = d.record;

  let headline;
  if (o.catastrophe) headline = `<h1 class="bad">🌊 Catastrophe!</h1><p>The Flood reached ${o.finalFlood}. The whole village was lost — everyone loses.</p>`;
  else if (!o.winners.length) headline = `<h1 class="bad">No home survived</h1><p>Final Flood ${o.finalFlood}. Nobody wins.</p>`;
  else {
    const names = o.winners.map((s) => esc(g.players[s].name)).join(' and ');
    headline = `<h1 class="good">🏆 ${names} ${o.winners.length > 1 ? 'share the win' : 'wins'}!</h1><p>Final Flood ${o.finalFlood}.</p>`;
  }
  const reason = { rounds: 'All rounds played.', storm: 'The storm ended the game.', catastrophe: 'The catastrophe threshold was reached.', host: 'The host ended the game.', conquest: 'One player holds every capital.' }[o.reason];

  const tw = g.mode === 'totalwar';
  const rows = [...o.results]
    .sort((a, b) => b.score - a.score || b.survived - a.survived)
    .map(
      (r) => `<tr class="${o.winners.includes(r.seat) ? 'winner' : ''}">
        <td>${chip(r.seat, r.name)}${o.winners.includes(r.seat) ? ' 🏆' : ''}</td>
        <td>${r.walls} (${r.protection})</td>
        <td>${r.survived ? '<span class="ok">✔ saved</span>' : '<span class="warn">✖ flooded</span>'}</td>
        ${tw ? `<td>${r.tiles}</td><td>${r.capitals}</td><td>${r.spare}</td><td><b>${r.score}</b></td>` : `<td>${r.spare}</td><td>${r.seawallPoints}</td><td><b>${r.survived ? r.score : '—'}</b></td>`}
      </tr>`,
    )
    .join('');

  const war = g.mode !== 'base';
  const empire = g.mode === 'empire';
  const actionHead = war
    ? `<th>Player</th><th>Sust.</th><th>Unsust.</th><th>Attacks</th><th>Won</th><th>Attacked</th><th>Units lost</th><th>Sanctions</th>${empire ? '<th>Revolts</th><th>Captures</th><th>Puppet of</th>' : ''}`
    : '<th>Player</th><th>Sust.</th><th>Unsust.</th><th>Raids</th><th>Raids won</th><th>Raided</th>';
  const actionRows = rec
    ? rec.players
        .map((p) =>
          war
            ? `<tr><td>${esc(p.name)}</td><td>${p.actions.sustainable}</td><td>${p.actions.unsustainable}</td><td>${p.attacks}</td><td>${p.attacksWon}</td><td>${p.timesAttacked}</td><td>${p.unitsLost}</td><td>${p.sanctions}</td>${
                empire ? `<td>${p.revolts}</td><td>${p.captures}</td><td>${esc(p.puppetAtEnd || '—')}</td>` : ''
              }</tr>`
            : `<tr><td>${esc(p.name)}</td><td>${p.actions.sustainable}</td><td>${p.actions.unsustainable}</td><td>${p.actions.raid}</td><td>${p.raidsWon}</td><td>${p.timesRaided}</td></tr>`,
        )
        .join('')
    : '';
  const warLine =
    war && rec
      ? ` Attacks: ${rec.attacks}, clashes: ${rec.clashes}${empire ? `, revolts: ${rec.revolts}` : ''}. Climate Accord: ${rec.accordBrokeRound ? `broke in round ${rec.accordBrokeRound}` : 'held all game'}. Flood from armies: +${rec.floodFromArmies}, from destruction: +${rec.floodFromDestruction}.`
      : '';

  return `<div class="end">
    <section class="card end-head">${headline}<p class="muted">${reason} ${rec ? `${rec.roundsPlayed} round${rec.roundsPlayed === 1 ? '' : 's'}, ${rec.lengthMinutes ?? '?'} minutes, ${rec.homesSaved} home${rec.homesSaved === 1 ? '' : 's'} saved.${warLine}` : ''}</p></section>

    <section class="card">
      <h2>Results</h2>
      <div class="table-wrap"><table class="results">
        <thead><tr><th>Player</th><th>Walls (prot.)</th><th>Home</th>${tw ? '<th>Tiles</th><th>Capitals</th><th>Spare</th><th>Score</th>' : '<th>Spare</th><th>Seawall</th><th>Score</th>'}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="hint">${tw ? `Total War score = ${g.settings.totalwar.scoreTile} per tile held + ${g.settings.totalwar.scoreCapital} per enemy capital + 1 per ${g.settings.totalwar.scoreMaterialsPer} spare materials + ${g.settings.totalwar.scoreHome} for a safe home (protection ≥ Flood ${o.finalFlood}).` : `A home survives if wall protection ≥ final Flood (${o.finalFlood}). Score = spare materials + seawall points.`}</p>
    </section>

    ${
      rec
        ? `<section class="card">
      <h2>Playtest record</h2>
      <div class="table-wrap"><table class="results">
        <thead><tr>${actionHead}</tr></thead>
        <tbody>${actionRows}</tbody>
      </table></div>
      <div class="row wrap">
        <button class="btn primary" data-act="download" data-kind="csv">Download CSV</button>
        <button class="btn" data-act="download" data-kind="json">Download JSON</button>
      </div>
      <p class="hint">CSV opens in Excel / Google Sheets (one row per player). JSON includes every setting used.</p>
    </section>`
        : ''
    }

    <div class="row wrap end-actions">
      ${d.you.isHost ? '<button class="btn primary big" data-act="host" data-op="backToLobby">New game (back to lobby)</button>' : '<p class="waiting">The host can start a new game from the lobby.</p>'}
      <button class="btn" data-act="leave">Leave room</button>
    </div>

    <section class="card"><h2>Final board</h2>${renderBoard(g)}</section>
    <section class="card"><h2>Chat</h2>${renderChat(store)}</section>
    <section class="card"><details><summary>Full event log</summary>${renderLog(g)}</details></section>
  </div>`;
}
