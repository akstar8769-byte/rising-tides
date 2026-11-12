// MAIN CLIENT FILE
// Connects to the server, keeps the latest state, and redraws the screen.
// The server is the referee: this page only SENDS requests and SHOWS what the
// server says. Changing this code can't change the rules.

import { renderLanding } from './landing.js';
import { renderLobby } from './lobby.js';
import { renderGame } from './game.js';
import { renderEnd } from './end.js';
import { onState as diceOnState } from './dice.js';
import { payLargest } from './war-ui.js';
import { addShells, refreshBattle, svgPoint, liveBattle, unitAt, selectUnit, startBattleAnimation } from './battle-ui.js';

/* global io */
const socket = io();

// Everything the screen needs. `data` is the latest message from the server;
// `ui` holds things you are typing/choosing that the server doesn't know yet.
export const store = {
  meta: null,
  data: null,
  chat: [],
  unreadChat: 0,
  lootDeadline: null,
  ui: freshUi(),
};

function freshUi() {
  return {
    drawer: 'build', // which side panel is open (null = just the map)
    tileMenu: null, // { id, x, y } — the menu for a tapped tile
    rival: null, // seat whose banner is expanded
    legend: false,
    name: '',
    code: new URLSearchParams(location.search).get('room')?.toUpperCase() || '',
    choice: { action: null, mix: { wood: 0, stone: 0, sandbag: 0 }, target: null },
    market: { give: 'wood', get: 'stone', times: 1 },
    donate: { wood: 0, stone: 0, sandbag: 0 },
    trade: { to: null, give: { wood: 0, stone: 0, sandbag: 0 }, get: { wood: 0, stone: 0, sandbag: 0 } },
    loot: { wood: 0, stone: 0, sandbag: 0 },
    walls: 1,
    factory: { kind: 'sustainable', tile: null, picking: false },
    recruit: { count: 1, mix: { wood: 0, stone: 0, sandbag: 0 }, tile: null, unit: 'infantry' },
    move: { from: null, to: null, count: 1, troops: {} },
    upgrade: { key: null, count: 1 }, // stationed units: the "Move units" form
    battleSel: [], // Total War: dots selected on the battlefield
    watchBattle: null,
    cmdAttackFor: null, // Empire: which puppet we're picking an attack target for
    pact: { to: null, kind: 'peace', rounds: 2, enemy: null },
    treaty: { name: '', note: '', maxUnitsOn: false, maxUnits: 2, noUnsustainable: false, noAttackSignatories: true, noAttacks: false, rounds: 0, invite: [] },
    hostOpen: false,
    chatDraft: '',
  };
}

// ---------------------------------------------------------------- session (for rejoining)
const SESSION_KEY = 'rising-tides-session';
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}
function saveSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: rejoining by name still works */
  }
}

// ---------------------------------------------------------------- talking to the server
/** Send a message; shows the error as a toast if the server says no. */
export function send(event, data = {}) {
  return new Promise((resolve) => {
    socket.emit(event, data, (res) => {
      if (res && res.error) toast(res.error, 'error');
      resolve(res || {});
    });
  });
}
export const act = (action) => send('action', action);

socket.on('meta', (m) => {
  store.meta = m;
  render();
});

socket.on('state', (d) => {
  const prev = store.data;
  store.data = d;
  store.lootDeadline = d.lootSecondsLeft != null ? Date.now() + d.lootSecondsLeft * 1000 : null;
  saveSession({ code: d.code, name: d.you.name, token: d.you.id });
  if (location.search !== `?room=${d.code}`) history.replaceState(null, '', `?room=${d.code}`);
  // Reset per-round drafts when a new choose phase starts
  if (d.game && prev?.game && prev.game.phase !== 'choose' && d.game.phase === 'choose') {
    store.ui.choice = { action: null, mix: { wood: 0, stone: 0, sandbag: 0 }, target: null };
    store.ui.cmdAttackFor = null;
  }
  if (d.game?.phase === 'loot' && prev?.game?.phase !== 'loot') store.ui.loot = { wood: 0, stone: 0, sandbag: 0 };
  if (d.game && !prev?.game && ['choose', 'loot', 'battle'].includes(d.game.phase)) store.ui.drawer = 'turn';
  if (d.game && prev?.game) {
    const g = d.game;
    const p = prev.game;
    // Decisions that need you open the Turn panel by themselves.
    if (g.phase !== p.phase && ['choose', 'loot', 'battle'].includes(g.phase)) store.ui.drawer = 'turn';
    else if (g.phase !== p.phase && ['talk', 'trade'].includes(g.phase) && store.ui.drawer === 'turn' && p.phase !== 'talk' && p.phase !== 'trade') store.ui.drawer = 'build';
    if (g.phase !== p.phase) store.ui.tileMenu = null;
    if (g.round !== p.round) showBanner(`Round ${g.round}`, roundSub(g));
    else if (g.phase !== p.phase && PHASE_BANNER[g.phase]) showBanner(PHASE_BANNER[g.phase][0], PHASE_BANNER[g.phase][1]);
  }
  diceOnState(d);
  announceEvents(d);
  render();
});

// ---------------------------------------------------------------- round banner
const PHASE_BANNER = {
  choose: ['Choose your move', 'Secretly — nobody sees it until everyone has chosen'],
  battle: ['⚔ Battle!', 'Command your troops on the field'],
  trade: ['Trade & build', 'Last chance to build before the round ends'],
};
function roundSub(g) {
  const rounds = g.mode === 'base' ? g.settings.base.rounds : g.settings.war.rounds;
  const left = rounds - g.round;
  const bits = [left > 0 ? `${left} round${left === 1 ? '' : 's'} left` : 'Final round!', `Flood ${g.flood} / ${g.threshold}`];
  if (g.tw && g.tw.truce) bits.push(`🕊 Truce until the end of round ${g.tw.truce}`);
  return bits.join(' · ');
}
let bannerTimer = null;
function showBanner(title, sub = '') {
  const el = document.getElementById('round-banner');
  if (!el) return;
  el.innerHTML = `<div class="rb-inner"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (el.hidden = true), 2600);
}

/** Pop up important events (battles, the Flood, broken pacts…) as short notes; the full story stays in the Log. */
const TOAST_KINDS = { battle: 'battle', bad: 'error', flood: 'flood', good: 'good', notice: 'event' };
const BIG_EVENTS = ['puppetFreed', 'pactBroken', 'treatyBroken'];
let lastAnnounced = null;
function announceEvents(d) {
  const log = d.game ? d.game.log : [];
  const maxId = log.length ? log[log.length - 1].id : 0;
  if (lastAnnounced === null || !d.game || maxId < lastAnnounced) {
    lastAnnounced = maxId; // first load or a new game: don't replay old events
    return;
  }
  const fresh = log.filter((e) => e.id > lastAnnounced && (TOAST_KINDS[e.kind] || BIG_EVENTS.includes(e.event)));
  const show = fresh.slice(-3);
  for (const e of show) toast(e.text, BIG_EVENTS.includes(e.event) ? 'event' : TOAST_KINDS[e.kind], 5000);
  if (fresh.length > show.length) toast(`+${fresh.length - show.length} more in the 📜 Log`, 'info', 5000);
  lastAnnounced = maxId;
}

// Total War: battle positions arrive 5 times a second; redraw just the battlefield.
socket.on('battles', (snaps) => {
  store.battleSnaps = Object.fromEntries(snaps.map((b) => [b.id, b]));
  addShells(snaps); // artillery, anti-air and ships' shells to animate
  refreshBattle(store);
});

socket.on('chatHistory', (msgs) => {
  store.chat = msgs;
  render();
});
socket.on('chat', (msg) => {
  store.chat.push(msg);
  if (store.chat.length > 200) store.chat.shift();
  if (store.ui.drawer !== 'chat') store.unreadChat++;
  render();
});
socket.on('kicked', () => {
  saveSession(null);
  store.data = null;
  toast('The host removed you from the room.', 'error');
  render();
});

socket.on('connect', () => {
  document.getElementById('connection').hidden = true;
  const saved = loadSession();
  const urlCode = store.ui.code;
  if (saved && (!urlCode || urlCode === saved.code)) {
    send('joinRoom', saved).then((res) => {
      if (res.error) {
        saveSession(null);
        store.data = null;
        render();
      }
    });
  }
});
socket.on('disconnect', () => {
  document.getElementById('connection').hidden = false;
});

// ---------------------------------------------------------------- toasts
export function toast(text, kind = 'info', ms = null) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => el.remove(), ms || (kind === 'error' ? 5000 : 3000));
}

// ---------------------------------------------------------------- drawing
const root = document.getElementById('app');

// Every redraw rebuilds the page, which would reset each collapsible panel to its
// default (often "open"). Remember what the player opened or closed by hand and
// put it back after each redraw. Panels are keyed by the plain text of their title.
const panelOpen = new Map();
const panelKey = (det) => {
  const s = det.querySelector(':scope > summary');
  const first = s && [...s.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  return first ? first.textContent.trim() : null;
};
// Only a click on a panel title counts as the player's choice (the click runs
// before the panel flips, so the new state is the opposite of the current one).
root.addEventListener('click', (e) => {
  const summary = e.target.closest('summary');
  const det = summary && summary.parentElement;
  if (!det || det.tagName !== 'DETAILS') return;
  const key = panelKey(det);
  if (key) panelOpen.set(key, !det.open);
});

export function render() {
  // Remember which text box had focus so redrawing doesn't interrupt typing.
  const active = document.activeElement;
  const focus = active && active.id && root.contains(active) ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
  const scrollers = [...root.querySelectorAll('[data-keep-scroll]')].map((el) => [el.dataset.keepScroll, el.scrollTop]);

  const d = store.data;
  if (!d) root.innerHTML = renderLanding(store);
  else if (!d.game) root.innerHTML = renderLobby(store);
  else if (d.game.phase === 'ended') root.innerHTML = renderEnd(store);
  else root.innerHTML = renderGame(store);

  for (const det of root.querySelectorAll('details')) {
    const key = panelKey(det);
    if (key && panelOpen.has(key)) det.open = panelOpen.get(key);
  }

  for (const [key, top] of scrollers) {
    const el = root.querySelector(`[data-keep-scroll="${key}"]`);
    if (el) el.scrollTop = top;
  }
  if (focus) {
    const el = document.getElementById(focus.id);
    if (el) {
      if ('value' in el && focus.value !== undefined) el.value = focus.value;
      el.focus();
      try {
        el.setSelectionRange(focus.start, focus.end);
      } catch {
        /* not a text input */
      }
    }
  }
}

// Loot countdown text updates every half second without a full redraw.
setInterval(() => {
  if (!store.lootDeadline) return;
  const left = Math.max(0, Math.ceil((store.lootDeadline - Date.now()) / 1000));
  document.querySelectorAll('.countdown').forEach((el) => (el.textContent = `${left}s`));
}, 500);

// ---------------------------------------------------------------- helpers for ui paths
function getPath(path) {
  return path.split('.').reduce((o, k) => o[k], store.ui);
}
function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], store.ui)[last] = value;
}
const emptyBag = () => ({ wood: 0, stone: 0, sandbag: 0 });

// ---------------------------------------------------------------- button handlers
// Every clickable thing has data-act="name"; this table says what each one does.
const actions = {
  // UI-only
  step: (ds) => {
    const v = Math.min(+ds.max, Math.max(+ds.min, (Number(getPath(ds.path)) || 0) + +ds.d)); // a count not set yet is 0
    setPath(ds.path, v);
    render();
  },
  drawer: (ds) => {
    const ui = store.ui;
    ui.drawer = ui.drawer === ds.id && !ds.keep ? null : ds.id;
    ui.tileMenu = null;
    if (ui.drawer === 'chat') store.unreadChat = 0;
    render();
  },
  tileMenu: (ds, el) => {
    const r = el.getBoundingClientRect();
    store.ui.tileMenu = store.ui.tileMenu && store.ui.tileMenu.id === ds.tile ? null : { id: ds.tile, x: r.left + r.width / 2, y: r.bottom };
    store.ui.rival = null;
    render();
  },
  closeTileMenu: () => {
    store.ui.tileMenu = null;
    render();
  },
  tileDo: (ds) => {
    const ui = store.ui;
    const g = store.data.game;
    const id = ds.tile;
    const t = g.board.tiles.find((x) => x.id === id);
    ui.tileMenu = null;
    const open = (drawer, warTab) => {
      ui.drawer = drawer;
      if (warTab) ui.warTab = warTab;
      render();
    };
    if (ds.op === 'recruit') {
      ui.recruit.tile = id;
      const unit = g.tw && g.tw.units.find((u) => u.type === ui.recruit.unit);
      if (g.tw && t.kind === 'sea' && (!unit || unit.domain !== 'sea')) ui.recruit.unit = (g.tw.units.find((u) => u.domain === 'sea' && u.unlocked) || {}).type || ui.recruit.unit;
      if (g.tw && t.kind === 'land' && unit && unit.domain === 'sea') ui.recruit.unit = 'infantry';
      return open('build', 'recruit');
    }
    if (ds.op === 'moveFrom') {
      ui.move.from = id;
      return open('build', 'move');
    }
    if (ds.op === 'moveTo') {
      const mine = (x) => (x.units && x.units[g.you]) || 0;
      const sameKind = (x) => (x.kind === 'sea') === (t.kind === 'sea');
      const from = g.board.tiles.find((x) => x.id === ui.move.from);
      if (!from || from.id === id || !mine(from) || !sameKind(from)) {
        const best = g.board.tiles.filter((x) => x.id !== id && mine(x) > 0 && sameKind(x)).sort((a, b) => mine(b) - mine(a))[0];
        if (best) ui.move.from = best.id;
      }
      ui.move.to = id;
      return open('build', 'move');
    }
    if (ds.op === 'upgrade') {
      ui.upgrade.key = null;
      ui.upgrade.tilePref = id;
      return open('build', 'upgrade');
    }
    if (ds.op === 'withdraw') {
      render();
      return act({ type: 'planWithdraw', tile: id });
    }
    if (ds.op === 'factory') {
      ui.factory.tile = id;
      return open('build');
    }
    if (['attack', 'claim', 'raid'].includes(ds.op)) {
      const c = ui.choice;
      if (c.action !== ds.op) {
        c.action = ds.op;
        c.from = null;
        c.count = null;
        c.mix = emptyBag();
      }
      c.target = ds.op === 'raid' ? t.owner : id;
      c.editing = true;
      return open('turn');
    }
  },
  set: (ds) => {
    setPath(ds.path, ds.json !== undefined ? JSON.parse(ds.json) : ds.value);
    render();
  },
  toggleHost: () => {
    store.ui.hostOpen = !store.ui.hostOpen;
    render();
  },

  // Landing
  create: async () => {
    const res = await send('createRoom', { name: store.ui.name });
    if (res.ok) store.ui.code = res.code;
  },
  join: async () => {
    const res = await send('joinRoom', { code: store.ui.code, name: store.ui.name });
    if (res.ok) store.ui.code = res.code;
  },
  leave: async () => {
    await send('leaveRoom');
    saveSession(null);
    store.data = null;
    store.ui = freshUi();
    store.ui.code = '';
    history.replaceState(null, '', '/');
    render();
  },
  copyLink: async () => {
    const link = `${location.origin}/?room=${store.data.code}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Rising Tides', text: `Join my Rising Tides room: ${store.data.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('Link copied!');
      }
    } catch {
      toast(link);
    }
  },

  // Lobby (host)
  lobby: (ds) => send('lobby', JSON.parse(ds.json)),
  start: () => send('startGame'),

  // Game
  ready: () => act({ type: 'ready' }),
  unready: () => act({ type: 'unready' }),
  buildWall: () => act({ type: 'buildWall', count: store.ui.walls }).then((r) => r.ok && (store.ui.walls = 1)),
  market: () => act({ type: 'market', give: store.ui.market.give, get: store.ui.market.get, times: store.ui.market.times }),
  donate: () => act({ type: 'donate', materials: store.ui.donate }).then((r) => r.ok && ((store.ui.donate = emptyBag()), render())),
  proposeTrade: () => {
    const t = store.ui.trade;
    act({ type: 'proposeTrade', to: t.to, give: t.give, get: t.get }).then((r) => {
      if (r.ok) {
        toast('Offer sent.');
        store.ui.trade = { to: t.to, give: emptyBag(), get: emptyBag() };
        render();
      }
    });
  },
  gift: () => {
    const t = store.ui.trade;
    act({ type: 'gift', to: t.to, materials: t.give }).then((r) => {
      if (r.ok) {
        store.ui.trade = { to: t.to, give: emptyBag(), get: emptyBag() };
        render();
      }
    });
  },
  acceptTrade: (ds) => act({ type: 'acceptTrade', id: +ds.id }),
  rejectTrade: (ds) => act({ type: 'rejectTrade', id: +ds.id }),
  cancelTrade: (ds) => act({ type: 'cancelTrade', id: +ds.id }),
  pickAction: (ds) => {
    const c = store.ui.choice;
    c.action = ds.value;
    if (ds.value !== 'raid' && ds.value !== 'claim') c.target = null;
    c.from = null;
    c.count = null;
    c.mix = emptyBag();
    render();
  },
  lockIn: () => {
    const c = store.ui.choice;
    const msg = { type: 'choose', action: c.action };
    if (c.action === 'raid' || c.action === 'attack' || c.action === 'claim') msg.target = c.target;
    else if (c.action !== 'revolt' && c.action !== 'claim') msg.mix = c.mix;
    if (store.data.game.stationed && (c.action === 'attack' || c.action === 'revolt')) Object.assign(msg, { from: c.from, count: c.count });
    if (store.data.game.tw && c.action === 'attack' && c.troops) msg.troops = c.troops;
    if (c.aid) msg.aid = c.aid;
    act(msg).then((r) => {
      if (r.ok) {
        c.editing = false;
        render();
      }
    });
  },
  pickLoot: () => act({ type: 'pickLoot', materials: store.ui.loot }),

  // War / Empire
  recruit: () => {
    const r = store.ui.recruit;
    const msg = { type: 'recruit', count: r.count, materials: r.mix };
    if (store.data.game.tw) msg.unit = r.unit || 'infantry';
    if (store.data.game.stationed) msg.tile = r.tile || store.data.game.players[store.data.game.you].homeTile;
    act(msg).then((res) => {
      if (res.ok) {
        store.ui.recruit = { count: 1, mix: emptyBag(), tile: r.tile, unit: r.unit }; // remember the unit type
        render();
      }
    });
  },
  buildFactory: () => {
    const f = store.ui.factory;
    act({ type: 'buildFactory', tile: f.tile, kind: f.kind }).then((r) => {
      if (r.ok) {
        f.tile = null;
        f.picking = false;
        render();
      }
    });
  },
  demolishFactory: (ds) => {
    if (!confirm(`Demolish your factory on ${ds.tile}? You don't get the materials back.`)) return;
    act({ type: 'demolishFactory', tile: ds.tile });
  },
  factoryPickOnBoard: () => {
    store.ui.factory.picking = true;
    if (matchMedia('(max-width: 760px)').matches) store.ui.drawer = null; // the sheet would hide the map
    render();
  },
  research: (ds) => {
    const g = store.data.game;
    const t = g.tw.techs.find((x) => x.id === ds.tech);
    const pay = payLargest(g.players[g.you].materials, t.cost);
    if (pay) act({ type: 'research', tech: t.id, materials: pay });
  },
  upgradeUnits: () => {
    const g = store.data.game;
    const [tile, from, to] = (store.ui.upgrade.key || '').split('|');
    const each = Math.max(1, g.tw.units.find((u) => u.type === to).cost - g.tw.units.find((u) => u.type === from).cost);
    const count = store.ui.upgrade.count || 1;
    const pay = payLargest(g.players[g.you].materials, each * count);
    if (pay) act({ type: 'upgradeUnits', tile, from, to, count, materials: pay });
  },
  battleFormation: (ds) => act({ type: 'battleFormation', battle: +ds.id, formation: ds.formation === 'none' ? null : ds.formation }),
  pickTile: (ds) => {
    // Tapped an outlined tile on the board.
    const g = store.data.game;
    if (g.factories && store.ui.factory.picking && ['talk', 'trade'].includes(g.phase)) {
      store.ui.factory.tile = ds.tile;
      store.ui.factory.picking = false;
      store.ui.drawer = 'build';
      toast(`Site ${ds.tile} chosen — press Build.`);
      render();
      return;
    }
    if (store.ui.cmdAttackFor != null) {
      actions.setCommand({ puppet: String(store.ui.cmdAttackFor), action: 'attack', target: ds.tile });
      return;
    }
    store.ui.choice.target = ds.tile;
    store.ui.drawer = 'turn';
    render();
  },
  setCommand: (ds) => {
    const msg = { type: 'setCommand', puppet: +ds.puppet, action: ds.action };
    if (ds.target) msg.target = ds.target;
    act(msg).then((r) => {
      if (r.ok) {
        store.ui.cmdAttackFor = null;
        render();
      }
    });
  },
  planWithdraw: (ds) => act({ type: 'planWithdraw', tile: ds.tile }),

  // Total War battles
  watchBattle: (ds) => {
    store.ui.watchBattle = +ds.id;
    store.ui.battleSel = [];
    render();
  },
  battleSelect: (ds) => {
    const svg = document.getElementById('battle-svg');
    const b = svg && liveBattle(store, Number(svg.dataset.battle));
    if (!b) return;
    const g = store.data.game;
    const side = b.attacker === g.you ? 'A' : 'D';
    const mine = b.dots.filter((d) => d.side === side && (ds.type === 'all' || d.type === ds.type));
    store.ui.battleSel = ds.type === 'none' ? [] : mine.map((d) => d.id);
    refreshBattle(store);
  },
  battleAddMode: () => {
    store.ui.battleAdd = !store.ui.battleAdd;
    render();
  },
  battleAuto: (ds) => act({ type: 'battleAuto', battle: +ds.id, on: ds.on === '1' }),

  // Diplomacy
  proposePact: () => {
    const p = store.ui.pact;
    const msg = { type: 'proposePact', to: p.to, kind: p.kind, rounds: p.rounds };
    if (p.kind === 'alliance') msg.enemy = p.enemy;
    act(msg).then((r) => r.ok && toast('Pact offered.'));
  },
  respondPact: (ds) => act({ type: 'respondPact', id: +ds.id, accept: ds.accept === '1' }),
  cancelPact: (ds) => act({ type: 'cancelPact', id: +ds.id }),
  toggleInvite: (ds) => {
    const list = store.ui.treaty.invite;
    const seat = +ds.seat;
    store.ui.treaty.invite = list.includes(seat) ? list.filter((x) => x !== seat) : [...list, seat];
    render();
  },
  proposeTreaty: () => {
    const t = store.ui.treaty;
    act({
      type: 'proposeTreaty',
      name: t.name,
      note: t.note,
      rounds: t.rounds,
      invite: t.invite,
      clauses: { maxUnits: t.maxUnitsOn ? t.maxUnits : null, noUnsustainable: t.noUnsustainable, noAttackSignatories: t.noAttackSignatories, noAttacks: t.noAttacks },
    }).then((r) => {
      if (r.ok) {
        toast('Treaty proposed.');
        store.ui.treaty = { ...store.ui.treaty, name: '', note: '', invite: [] };
        render();
      }
    });
  },
  signTreaty: (ds) => act({ type: 'signTreaty', id: +ds.id }),
  declineTreaty: (ds) => act({ type: 'declineTreaty', id: +ds.id }),
  breakTreaty: (ds) => {
    if (!confirm(`Break the treaty "${ds.name}"? Everyone will see it and you'll lose materials.`)) return;
    act({ type: 'breakTreaty', id: +ds.id });
  },
  moveUnits: () => {
    const mv = store.ui.move;
    const msg = { type: 'moveUnits', from: mv.from, to: mv.to, count: mv.count };
    if (store.data.game.tw) msg.troops = mv.troops;
    act(msg).then((r) => {
      if (r.ok) {
        mv.count = 1;
        mv.troops = {};
        render();
      }
    });
  },
  planRelease: (ds) => act({ type: 'planRelease', puppet: +ds.puppet }),

  // Host controls
  host: (ds) => {
    if (ds.op === 'endGame' && !confirm('End the game now and score at the current Flood?')) return;
    send('host', { op: ds.op, seat: ds.seat !== undefined ? +ds.seat : undefined });
  },

  download: (ds) => {
    const d = store.data;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const isCsv = ds.kind === 'csv';
    const blob = new Blob([isCsv ? d.recordCsv : JSON.stringify(d.record, null, 2)], { type: isCsv ? 'text/csv' : 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rising-tides-${d.code}-${stamp}.${isCsv ? 'csv' : 'json'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

// Battlefield taps use pointerdown: the dots are redrawn every animation frame, so a
// normal click often loses its target between press and release.
document.addEventListener('pointerdown', (e) => {
  const svg = e.target.closest && e.target.closest('#battle-svg');
  if (!svg || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  const b = liveBattle(store, Number(svg.dataset.battle));
  const p = svgPoint(svg, e);
  if (!b || !p) return;
  const unit = unitAt(store, b, p);
  if (unit != null) {
    selectUnit(store, b, unit, store.ui.battleAdd || e.shiftKey || e.ctrlKey || e.metaKey);
    refreshBattle(store);
    return;
  }
  const sel = store.ui.battleSel;
  if (!sel.length) return toast('Tap one of your units first (or use Select all).');
  act({ type: 'battleOrder', battle: b.id, dots: [...sel], x: p.x, y: p.y });
});

document.addEventListener('click', (e) => {
  if (e.target.closest('#battle-svg')) return; // handled on pointerdown
  const el = e.target.closest('[data-act]');
  // A click anywhere else closes the tile menu / rival card.
  const ui = store.ui;
  const keepMenu = e.target.closest('.tile-menu') || (el && el.dataset.act === 'tileMenu');
  const keepRival = e.target.closest('.rival-pop') || (el && el.dataset.path === 'rival');
  if ((ui.tileMenu && !keepMenu) || (ui.rival != null && !keepRival)) {
    if (!keepMenu) ui.tileMenu = null;
    if (!keepRival) ui.rival = null;
    if (!el) return render();
  }
  if (!el || el.disabled) return;
  e.preventDefault();
  const fn = actions[el.dataset.act];
  if (fn) fn(el.dataset, el);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (store.ui.tileMenu || store.ui.rival != null) {
    store.ui.tileMenu = null;
    store.ui.rival = null;
    render();
  }
});
addEventListener('resize', () => {
  if (store.ui.tileMenu) {
    store.ui.tileMenu = null;
    render();
  }
});

// Text boxes and selects: data-model="path" stores what you type in store.ui
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.model) {
    const v = el.type === 'number' ? Number(el.value) : el.value;
    setPath(el.dataset.model, el.dataset.model === 'code' ? String(v).toUpperCase() : v);
  }
});

// Lobby settings: data-setting="base.rounds" sends the new value when changed
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.setting) {
    const value = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : Number(el.value);
    send('lobby', { op: 'setSetting', path: el.dataset.setting, value }).then((r) => r.error && render());
  } else if (el.dataset.botSeat !== undefined) {
    send('lobby', { op: 'setBotPersonality', seat: +el.dataset.botSeat, personality: el.value });
  } else if (el.dataset.biomeMode !== undefined) {
    send('lobby', { op: 'setBiomeMode', biomeMode: el.value });
  } else if (el.dataset.biomeSeat !== undefined) {
    send('lobby', { op: 'setBiome', seat: +el.dataset.biomeSeat, biome: el.value });
  } else if (el.dataset.model && el.tagName === 'SELECT') {
    render();
  }
});

// Forms: Enter key submits (landing and chat)
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'chat-form') {
    const text = store.ui.chatDraft.trim();
    if (text) send('chat', { text });
    store.ui.chatDraft = '';
    const input = document.getElementById('chat-input');
    if (input) input.value = '';
  } else if (form.dataset.submit && actions[form.dataset.submit]) {
    actions[form.dataset.submit]({});
  }
});

render();
startBattleAnimation(store); // smooth battlefield animation (only draws when a battle is on screen)
