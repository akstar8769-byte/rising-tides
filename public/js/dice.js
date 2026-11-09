// Dice animation. The server rolls the dice; this only SHOWS the result.
// New log entries that carry dice are queued and shown one after another.
import { esc, PLAYER_STYLE } from './ui.js';

let lastSeen = null; // highest log id already handled
const queue = [];
let showing = false;
const overlay = () => document.getElementById('dice-overlay');

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

export function dieSvg(n, cls = '') {
  const pips = PIPS[n] || [];
  const label = PIPS[n] ? '' : `<text x="50" y="62" text-anchor="middle" font-size="40" font-weight="700">${n}</text>`;
  return `<svg class="die ${cls}" viewBox="0 0 100 100" role="img" aria-label="${n}"><rect x="4" y="4" width="92" height="92" rx="18" fill="#fff" stroke="#222" stroke-width="4"/>${pips
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#222"/>`)
    .join('')}${label}</svg>`;
}

/** Called with every new server state. */
export function onState(d) {
  const log = d.game ? d.game.log : [];
  const maxId = log.length ? log[log.length - 1].id : 0;
  if (!d.game) {
    lastSeen = null;
    return;
  }
  if (lastSeen === null || maxId < lastSeen) {
    lastSeen = maxId; // first load or a new game: don't replay old rolls
    return;
  }
  for (const e of log) if (e.id > lastSeen && e.dice) queue.push({ entry: e, players: d.game.players, sides: d.game.settings.general.diceSides });
  lastSeen = maxId;
  pump();
}

function pump() {
  if (showing || !queue.length) return;
  showing = true;
  const { entry, players, sides } = queue.shift();
  const el = overlay();
  const rows = entry.dice.sides
    .map((s, i) => {
      const name = s.seat != null ? players[s.seat].name : s.label;
      const st = s.seat != null ? PLAYER_STYLE[s.seat] : null;
      return `<div class="dice-row" data-row="${i}">
        <span class="dice-name">${st ? `<i class="dot" style="background:${st.color}"></i><b>${st.label}</b> ` : ''}${esc(name)}</span>
        <span class="dice-set">${s.rolls.map(() => dieSvg(1, 'rolling')).join('')}</span>
      </div>`;
    })
    .join('');
  el.innerHTML = `<div class="dice-box" role="dialog" aria-live="assertive">
    <h3>${esc(entry.dice.title)}</h3>${rows}<p class="dice-result" hidden>${esc(entry.text)}</p>
    <button class="btn" data-close>OK</button></div>`;
  el.hidden = false;

  // Spin random faces for a moment, then show the real rolls.
  const sets = [...el.querySelectorAll('.dice-set')];
  const spin = setInterval(() => {
    sets.forEach((set, i) => (set.innerHTML = entry.dice.sides[i].rolls.map(() => dieSvg(1 + Math.floor(Math.random() * Math.min(sides, 6)), 'rolling')).join('')));
  }, 90);
  const finish = setTimeout(() => {
    clearInterval(spin);
    sets.forEach((set, i) => {
      const s = entry.dice.sides[i];
      const win = entry.dice.winner != null && s.seat === entry.dice.winner;
      set.innerHTML = s.rolls.map((r) => dieSvg(r, win ? 'win' : '')).join('');
    });
    el.querySelector('.dice-result').hidden = false;
  }, 1000);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(spin);
    clearTimeout(finish);
    clearTimeout(auto);
    el.hidden = true;
    el.innerHTML = '';
    showing = false;
    pump();
  };
  const auto = setTimeout(close, 4500);
  el.querySelector('[data-close]').addEventListener('click', close);
  el.addEventListener('click', (e) => e.target === el && close(), { once: true });
}
