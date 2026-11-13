// Tutorials: a short guided tour of the game screen for each mode.
// - Shown automatically the FIRST time you play a mode on this device.
// - "Skip" (or finishing it) means it never pops up by itself again for that mode.
// - The ❓ button in the top bar restarts it any time.
// Each step can point at part of the screen (a spotlight) and open a panel first.
// The numbers in the text come from the game's own settings, so they match the lobby.
import { esc } from './ui.js';

const KEY = (mode) => `rising-tides-tutorial-${mode}`;
function seen(mode) {
  try {
    return !!localStorage.getItem(KEY(mode));
  } catch {
    return true; // storage blocked (private window): never nag
  }
}
function remember(mode, how) {
  try {
    localStorage.setItem(KEY(mode), how);
  } catch {
    /* ignore */
  }
}

const MODE_NAME = { base: 'Rising Tides', war: 'War', empire: 'War + Empire', totalwar: 'Total War' };

// ---------------------------------------------------------------- the steps
// { title, text (html), target: selector or (g) => selector, drawer: panel to open first, when: (g) => bool }
function common(g) {
  const b = g.settings.base;
  const rounds = g.mode === 'base' ? b.rounds : g.settings.war.rounds;
  const home = `.board [data-tile="${g.players[g.you].homeTile}"]`;
  return {
    stock: {
      title: 'Your stock',
      target: '.hud-res',
      text: `Your <b>wood</b>, <b>stone</b> and <b>sandbags</b>, then your <b>walls</b> (each gives ${b.wallProtection} protection)${g.war ? ' and your <b>units</b> ⚔' : ''}. <b>safe</b> / <b>at risk</b> tells you whether your home would stay dry at today's Flood.`,
    },
    home: {
      title: 'Your home',
      target: home,
      text: `This is your home${g.war ? ' capital' : ''}. Its land decides what you collect: 🌲 Forest → wood, ⛰️ Quarry → stone, 🌊 Riverbank → sandbags, ✳️ Mixed → any. <b>Tap any tile</b> on the map to see what's there and what you can do with it.`,
    },
    rounds: {
      title: 'How a round goes',
      target: '.hud-phase',
      text: `${rounds} rounds. Each round: <b>Talk &amp; build</b> → <b>Choose secretly</b> → everyone's choice is <b>revealed</b> and collected${g.war ? ' (battles happen here)' : ''} → <b>Trade &amp; build</b> again. The top bar always shows where you are.`,
    },
    rivals: {
      title: 'The other players',
      target: '.rivals',
      text: 'Everyone at the table. A ✓ means they are ready; tap a banner to see their materials, walls and more.',
    },
    trade: {
      title: 'Trade and talk',
      target: '.dock-btn[data-id="trade"]',
      drawer: 'trade',
      text: 'Offer materials to another player, or give a gift. Deals and promises are never enforced by the game — talking, persuading and bluffing are half of Rising Tides.',
    },
    endTurn: {
      title: 'Ending your turn',
      target: '.end-turn',
      text: 'Finished building? Press <b>End turn</b>. When everyone is Ready the game moves on. In the Choose phase this button opens your secret choice.',
    },
    log: {
      title: "That's it!",
      target: '.dock-btns',
      text: 'The dock opens your panels: 🎯 Turn, 🏗️ Build, 🤝 Trade, 🌊 Flood, 📜 Log (everything that happened) and 💬 Chat. Big events pop up as short notes.<br><br>Want this tour again? Press <b>❓</b> in the top bar any time.',
    },
  };
}

function baseSteps(g) {
  const b = g.settings.base;
  const c = common(g);
  const F = !!g.factories;
  return [
    {
      title: 'Welcome to Rising Tides 🌊',
      text: `The sea is rising. Everyone shares one village and one <b>Flood</b>. You build walls to keep your own home dry — but every greedy move raises the water for <b>everybody</b>.<br><br>This quick tour takes about a minute. Skip it any time; the <b>❓</b> button brings it back.`,
    },
    {
      title: 'The Flood',
      target: '.flood-pill',
      text: `The Flood is <b>${g.flood}</b> now. If it ever reaches <b>${g.threshold}</b> (the catastrophe line) the village is lost and <b>everyone loses at once</b>.<br><br>After round ${b.rounds}, your home survives if your wall protection is at least the Flood. Survivors score their <b>spare materials + seawall points</b>; the highest score wins.`,
    },
    c.stock,
    c.home,
    c.rounds,
    {
      title: 'Build',
      target: '.drawer',
      drawer: 'build',
      text: `In the build phases you can:<br>🧱 <b>Build walls</b> (${b.wallCostWood} wood + ${b.wallCostStone} stone + ${b.wallCostSandbag} sandbag each).<br>⚖️ Use the <b>market</b>: ${b.marketGive} of one material → ${b.marketGet} of another.<br>🏘️ <b>Donate to the village seawall</b>: every ${b.seawallPerStep} donated (by anyone) pushes the catastrophe line up by 1 (max +${b.seawallMaxSteps}), and each material you donate scores ${b.seawallPointsPerMaterial} point if your home survives.`,
    },
    F && {
      title: 'Factories',
      target: '.drawer',
      drawer: 'build',
      text: `Factories are how you grow. Build one on your home or an empty tile next to your land.<br>🌿 <b>Sustainable</b> (${b.factorySusWood} wood, ${b.factorySusStone} stone, ${b.factorySusSandbag} sandbag): makes ${b.factorySusMakes} a round, and every ${b.factoryGreenPer} on the board (everyone's together) <b>lower the Flood</b> by ${b.factoryGreenDrop} each round.<br>🏭 <b>Unsustainable</b> (${b.factoryUnsWood} wood, ${b.factoryUnsStone} stone): makes ${b.factoryUnsMakes} a round but <b>raises the Flood</b> ${b.factoryUnsFlood} every round (max ${b.factoryUnsMax} each).`,
    },
    {
      title: 'Choose secretly',
      target: '.dock-btn[data-id="turn"]',
      text: `Each round everyone picks one action in secret, then all are revealed together:<br>🌿 <b>Sustainable</b>: collect ${b.sustainableCollect} of your home material. Flood unchanged.<br>🏭 <b>Unsustainable</b>: collect any ${b.unsustainableCollect}, but the Flood rises ${b.unsustainableFlood}.<br>${F ? `🏴 <b>Claim a factory</b>: pay ${b.claimCostWood} wood and roll a die against its owner (higher wins, ties to the owner) to take it.` : `🗡 <b>Raid</b>: pay ${b.raidCostWood} wood and roll against another player to steal up to ${b.raidMaxLoot} materials.`}`,
    },
    c.trade,
    c.rivals,
    c.endTurn,
    c.log,
  ].filter(Boolean);
}

function warSteps(g) {
  const w = g.settings.war;
  const c = common(g);
  const empire = g.mode === 'empire';
  const stationed = !!g.stationed;
  return [
    {
      title: `Welcome to ${MODE_NAME[g.mode]} ⚔`,
      text: `Rising Tides with armies. You hold a <b>capital</b> and two <b>provinces</b>, recruit militia and can invade your neighbours — but war raises the Flood, and if it reaches the catastrophe line <b>everyone</b> loses.${empire ? ' In Empire, taking a capital makes that player your <b>puppet</b>.' : ''}<br><br>Skip any time; the <b>❓</b> button brings this back.`,
    },
    {
      title: 'The Flood',
      target: '.flood-pill',
      text: `Flood <b>${g.flood}</b>, catastrophe at <b>${g.threshold}</b>. Attacks, occupying land and big armies all push it up. After round ${w.rounds}, homes with protection at least the Flood survive and score spare materials + seawall points.`,
    },
    !g.war.noAccord && {
      title: 'The Climate Accord',
      target: '.accord-pill',
      text: `While the Flood is below the Accord line (${g.war.accordLine}), the world is watching: an attacker is <b>sanctioned</b> for a round (no trading or market), and players who were invaded get international aid. Once the Flood crosses the line, the Accord breaks for good.`,
    },
    c.stock,
    c.home,
    c.rounds,
    {
      title: 'Your army',
      target: '.drawer',
      drawer: 'build',
      text: `Recruit militia in the build phases (${w.unitCost} materials each, any mix)${stationed ? ' and choose the tile they stand on; use <b>Move</b> to shift them between your tiles. Only units on a tile defend it.' : '.'} Armies cost upkeep every round, and every ${w.armyFloodPerUnits} units you own add Flood too.`,
    },
    {
      title: 'Attacking',
      target: '.dock-btn[data-id="turn"]',
      text: `In <b>Choose secretly</b>, pick <b>Attack</b> and a tile next to your land${stationed ? ' (or tap the tile on the map)' : ''}. You roll a die per unit sent (max ${w.maxAttackDice}), the defender up to ${w.maxDefenceDice}; ties go to the defender. Win: you occupy the tile and take up to ${w.maxLoot} materials. Every attack adds +${w.attackFlood} Flood. Or play Sustainable / Unsustainable to collect as in the base game.`,
    },
    empire && {
      title: 'Puppets',
      target: '.rivals',
      text: 'Take a capital and its owner becomes your <b>puppet</b>: they pay you half of what they collect and must follow your command each round — or <b>revolt</b>. Holding puppets costs a garrison every round.',
    },
    c.trade,
    c.rivals,
    c.endTurn,
    c.log,
  ].filter(Boolean);
}

function totalWarSteps(g) {
  const t = g.settings.totalwar;
  const c = common(g);
  const sea = g.board.seaLanes;
  return [
    {
      title: 'Welcome to Total War ⚔',
      text: `The just-for-fun war mode: research, tanks, planes, navies and <b>live battles</b> you command yourself. ${t.rounds} rounds; score points for land, captured capitals and a safe home.<br><br>Skip any time; the <b>❓</b> button brings this back.`,
    },
    {
      title: 'Moving around the map',
      target: '.map-zoom',
      text: `Scroll or pinch to <b>zoom</b>, drag to <b>move around</b>, or use these buttons (⟲ shows the whole map). Tap a tile for what you can do there.${sea ? ' 🐟 sea hexes are fishing grounds: hold them with ships for income.' : ''}`,
    },
    {
      title: 'Truce and Flood',
      target: '.hud-pills',
      text: `Nobody can attack another player during the opening truce (${t.truceRounds} rounds) — claim empty land and build up. The Flood still matters: if it reaches ${g.threshold} everyone loses, and every battle adds to it.`,
    },
    c.stock,
    c.home,
    {
      title: 'Build your army',
      target: '.drawer',
      drawer: 'build',
      text: 'In 🏗️ Build: <b>Recruit</b> troops onto your tiles, <b>Move</b> them, <b>Research</b> new units (tanks, aircraft, ships…) and their <b>levels 1–4</b> (open ▸ levels under a technology), and <b>Upgrade</b> old units by paying the difference.',
    },
    {
      title: 'Attacking',
      target: '.dock-btn[data-id="turn"]',
      text: 'In <b>Choose secretly</b>, pick Attack and a target next to your units (or tap an enemy tile → Attack). Empty land is taken at once; defended land starts a <b>live battle</b>.',
    },
    {
      title: 'Live battles',
      text: 'In a battle, tap your units (or a type button), then tap where to send them. <b>Attackers</b> win by holding the flag ⚑ alone; <b>defenders</b> by holding out. Units cut off from their side of the map surrender — go round the flanks! Formations give bonuses, and 🤖 Auto-battle fights for you.',
    },
    sea && {
      title: 'The navy',
      text: 'Ships sail hex by hex. Troops cross the sea along an <b>unbroken chain of your ships</b> from your coast to theirs. Cruisers and battleships can 💥 <b>bombard</b> coasts next to them and fire on enemy convoys; destroyers escort yours. Enemy ships off your coast ⚓ blockade it (no income).',
    },
    c.trade,
    c.endTurn,
    c.log,
  ].filter(Boolean);
}

function stepsFor(g) {
  if (g.mode === 'totalwar') return totalWarSteps(g);
  if (g.war) return warSteps(g);
  return baseSteps(g);
}

// ---------------------------------------------------------------- running it
let tut = null; // { mode, i, steps }
let hooks = null; // { store, render }
let autoChecked = new Set();

export function initTutorial(store, render) {
  hooks = { store, render };
  addEventListener('resize', () => tut && place());
  document.addEventListener('keydown', (e) => {
    if (!tut) return;
    if (e.key === 'Escape') skip();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') back();
  });
  document.getElementById('tutorial').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tut]');
    if (!b) return;
    if (b.dataset.tut === 'next') next();
    else if (b.dataset.tut === 'back') back();
    else if (b.dataset.tut === 'skip') skip();
  });
}

/** Start the tour for the current game's mode (from the ❓ button, or the first time). */
export function startTutorial() {
  const g = hooks && hooks.store.data && hooks.store.data.game;
  if (!g) return;
  tut = { mode: g.mode, i: 0 };
  show();
}

/** Called after every redraw: start the first-time tour, keep the spotlight in place. */
export function afterRender() {
  const g = hooks && hooks.store.data && hooks.store.data.game;
  if (!g || g.phase === 'ended') {
    // Left the game before finishing the tour: it still counts as not seen.
    if (tut) {
      autoChecked.delete(tut.mode);
      close();
    }
    if (!g) autoChecked.clear();
    return;
  }
  if (!tut && !autoChecked.has(g.mode)) {
    autoChecked.add(g.mode);
    if (!seen(g.mode)) setTimeout(() => !tut && hooks.store.data && hooks.store.data.game && startTutorial(), 900);
  }
  if (tut) place();
}

function current() {
  const g = hooks.store.data.game;
  const steps = stepsFor(g);
  if (tut.i >= steps.length) tut.i = steps.length - 1;
  return { g, steps, step: steps[tut.i] };
}

function show() {
  const { store, render } = hooks;
  const { step } = current();
  store.ui.tileMenu = null;
  store.ui.rival = null;
  if (step.drawer) store.ui.drawer = step.drawer;
  render(); // draws the game, then afterRender() positions the tour
}

function next() {
  const { steps } = current();
  if (tut.i >= steps.length - 1) return finish();
  tut.i++;
  show();
}
function back() {
  if (tut.i > 0) tut.i--;
  show();
}
function finish() {
  remember(tut.mode, 'done');
  close();
}
function skip() {
  remember(tut.mode, 'skipped');
  close();
}
function close() {
  tut = null;
  const el = document.getElementById('tutorial');
  el.hidden = true;
  el.innerHTML = '';
}

/** Draw the spotlight and the card next to the target (or centred when there's none). */
function place() {
  const el = document.getElementById('tutorial');
  const { g, steps, step } = current();
  const sel = typeof step.target === 'function' ? step.target(g) : step.target;
  const target = sel ? [...document.querySelectorAll(sel)].find((x) => x.getClientRects().length) : null;
  const r = target ? target.getBoundingClientRect() : null;
  const pad = 6;
  const last = tut.i === steps.length - 1;
  const card = `<div class="tut-card" role="dialog" aria-label="Tutorial">
      <div class="tut-top"><span class="tut-count">${MODE_NAME[g.mode] || 'Tutorial'} · ${tut.i + 1} / ${steps.length}</span><button class="tut-skip" data-tut="skip">Skip tutorial</button></div>
      <h3>${esc(step.title)}</h3>
      <p>${step.text}</p>
      <div class="tut-dots">${steps.map((_, k) => `<i class="${k === tut.i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tut-btns">${tut.i > 0 ? '<button class="btn" data-tut="back">← Back</button>' : '<span></span>'}<button class="btn primary" data-tut="next">${last ? 'Let’s play!' : 'Next →'}</button></div>
    </div>`;
  el.hidden = false;
  el.innerHTML = r ? `<div class="tut-spot" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>${card}` : `<div class="tut-dim"></div>${card}`;
  const c = el.querySelector('.tut-card');
  const W = innerWidth;
  const H = innerHeight;
  const cw = Math.min(380, W - 24);
  c.style.width = cw + 'px';
  const ch = c.offsetHeight;
  let left;
  let top;
  if (!r) {
    left = (W - cw) / 2;
    top = (H - ch) / 2;
  } else if (r.bottom + 12 + ch < H) {
    top = r.bottom + 12; // below the target
    left = r.left + r.width / 2 - cw / 2;
  } else if (r.top - 12 - ch > 0) {
    top = r.top - 12 - ch; // above it
    left = r.left + r.width / 2 - cw / 2;
  } else if (r.left - 12 - cw > 0) {
    left = r.left - 12 - cw; // to its left (tall things like a side panel)
    top = r.top + 20;
  } else {
    left = (W - cw) / 2;
    top = H - ch - 12;
  }
  c.style.left = Math.max(12, Math.min(left, W - cw - 12)) + 'px';
  c.style.top = Math.max(12, Math.min(top, H - ch - 12)) + 'px';
  el.querySelector('[data-tut="next"]').focus({ preventScroll: true });
}
