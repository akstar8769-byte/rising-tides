// Lobby: players, mode, biomes, seats and every setting. Only the host can change things.
import { esc, chip, BIOME } from './ui.js';
import { renderChat } from './log.js';

const MODE_INFO = {
  base: { title: 'Base', text: 'Walls, trading, raids and the shared Flood.' },
  war: { title: 'War', text: 'Territories, militia, invasions and the Climate Accord.' },
  empire: { title: 'War + Empire', text: 'War, plus puppet states, tribute and revolts.' },
};

const GROUP_TITLE = { general: 'General', base: 'Base game', war: 'War mode', empire: 'Empire rules' };

const j = (obj) => esc(JSON.stringify(obj));

export function renderLobby(store) {
  const d = store.data;
  const meta = store.meta;
  if (!meta) return '<p class="boot">Loading…</p>';
  const isHost = d.you.isHost;
  const lobby = d.lobby;
  const n = d.members.length;
  const canStart = n >= meta.minPlayers && n <= meta.maxPlayers;
  const link = `${location.origin}/?room=${d.code}`;

  const players = d.members
    .map((m, i) => {
      const biomePick =
        lobby.biomeMode === 'manual'
          ? isHost
            ? `<select data-biome-seat="${i}" aria-label="Biome for ${esc(m.name)}"><option value="">Biome…</option>${Object.entries(BIOME)
                .map(([k, b]) => `<option value="${k}" ${lobby.manualBiomes[i] === k ? 'selected' : ''}>${b.glyph} ${b.label}</option>`)
                .join('')}</select>`
            : `<span class="muted">${lobby.manualBiomes[i] ? BIOME[lobby.manualBiomes[i]].glyph + ' ' + BIOME[lobby.manualBiomes[i]].label : 'biome not set'}</span>`
          : '';
      const hostButtons = isHost
        ? `<span class="seat-btns">
            <button class="icon-btn" data-act="lobby" data-json="${j({ op: 'moveSeat', seat: i, dir: 'up' })}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
            <button class="icon-btn" data-act="lobby" data-json="${j({ op: 'moveSeat', seat: i, dir: 'down' })}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
            ${m.isHost ? '' : `<button class="icon-btn danger" data-act="lobby" data-json="${j({ op: 'kick', seat: i })}" aria-label="Remove ${esc(m.name)}">✕</button>`}
          </span>`
        : '';
      return `<li class="lobby-player">
        <span class="seatno">${i + 1}</span>
        ${chip(i, m.name)}
        ${m.isHost ? '<span class="tag">host</span>' : ''}
        ${m.connected ? '' : '<span class="tag warn">offline</span>'}
        ${m.name === d.you.name ? '<span class="tag you">you</span>' : ''}
        <span class="grow"></span>
        ${biomePick}
        ${hostButtons}
      </li>`;
    })
    .join('');

  const modes = meta.modes
    .map((mode) => {
      const built = meta.builtModes.includes(mode);
      const selected = lobby.mode === mode;
      return `<button class="mode-card ${selected ? 'selected' : ''}" ${!isHost || !built ? 'disabled' : ''}
        data-act="lobby" data-json="${j({ op: 'setMode', mode })}" aria-pressed="${selected}">
        <b>${MODE_INFO[mode].title}</b><span>${MODE_INFO[mode].text}</span>${built ? '' : '<em>Coming in a later build step</em>'}
      </button>`;
    })
    .join('');

  return `
  <div class="lobby">
    <header class="lobby-head">
      <div>
        <div class="muted small">Room code</div>
        <div class="room-code" aria-label="Room code">${esc(d.code)}</div>
      </div>
      <div class="share">
        <input id="share-link" readonly value="${esc(link)}" aria-label="Invite link" />
        <button class="btn" data-act="copyLink">Share link</button>
      </div>
    </header>

    <section class="card">
      <h2>Players <span class="muted">(${n} of ${meta.maxPlayers}, need ${meta.minPlayers}+)</span></h2>
      <ol class="lobby-players">${players}</ol>
      ${
        isHost
          ? `<div class="row wrap">
              <button class="btn" data-act="lobby" data-json="${j({ op: 'shuffleSeats' })}">Shuffle seats</button>
              <span class="grow"></span>
              <label class="toggle">Biomes:
                <select id="biome-mode" data-biome-mode aria-label="Biome assignment">
                  <option value="random" ${lobby.biomeMode === 'random' ? 'selected' : ''}>Random</option>
                  <option value="manual" ${lobby.biomeMode === 'manual' ? 'selected' : ''}>Host picks</option>
                </select>
              </label>
            </div>
            <p class="hint">Seat 1 is the first starting player; play goes clockwise in seat order. Random biomes: one each of Forest, Quarry and Riverbank, Mixed from 4 players, and a random repeat with 5.</p>`
          : `<p class="hint">Biomes: ${lobby.biomeMode === 'random' ? 'random' : 'picked by the host'}. Seat 1 starts.</p>`
      }
    </section>

    <section class="card">
      <h2>Game mode</h2>
      <div class="modes">${modes}</div>
    </section>

    <section class="card">
      <h2>Settings ${isHost ? '<button class="btn small" data-act="lobby" data-json="' + j({ op: 'resetSettings' }) + '">Reset to defaults</button>' : ''}</h2>
      <p class="hint">${isHost ? 'Change any number before starting. Changes are saved instantly.' : 'Only the host can change these.'}</p>
      ${meta.groupsForMode[lobby.mode].map((g) => settingsGroup(g, lobby.settings, meta, isHost)).join('')}
    </section>

    <section class="card">
      <h2>Chat</h2>
      ${renderChat(store)}
    </section>

    <div class="lobby-actions">
      <button class="btn" data-act="leave">Leave</button>
      ${
        isHost
          ? `<button class="btn primary big" data-act="start" ${canStart ? '' : 'disabled'}>${canStart ? 'Start game' : `Waiting for players (${n}/${meta.minPlayers})`}</button>`
          : `<p class="waiting">Waiting for the host to start…</p>`
      }
    </div>
  </div>`;
}

/** One <details> block of settings, built from config.js defaults + labels. */
function settingsGroup(group, settings, meta, isHost) {
  const rows = [];
  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = `${path}.${k}`;
      if (v && typeof v === 'object') walk(v, p);
      else rows.push(settingRow(p, v, meta, isHost));
    }
  };
  walk(settings[group], group);
  const changed = countChanged(settings[group], meta.defaults[group]);
  return `<details class="settings-group" ${group === 'base' ? 'open' : ''}>
    <summary>${GROUP_TITLE[group]} ${changed ? `<span class="tag">${changed} changed</span>` : ''}</summary>
    <div class="settings-rows">${rows.join('')}</div>
  </details>`;
}

function settingRow(path, value, meta, isHost) {
  const label = meta.labels[path] || path;
  const def = path.split('.').reduce((o, k) => o?.[k], meta.defaults);
  const id = 'set-' + path.replace(/\./g, '-');
  const changed = value !== def ? ' changed' : '';
  let input;
  if (typeof value === 'boolean') {
    input = `<input type="checkbox" id="${id}" data-setting="${path}" ${value ? 'checked' : ''} ${isHost ? '' : 'disabled'} />`;
  } else if (typeof value === 'number') {
    const [min, max] = meta.limits[path] || [0, 999];
    input = `<input type="number" inputmode="numeric" id="${id}" data-setting="${path}" value="${value}" min="${min}" max="${max}" step="1" ${isHost ? '' : 'disabled'} />`;
  } else {
    const opts = meta.options[path] || [value];
    input = `<select id="${id}" data-setting="${path}" ${isHost ? '' : 'disabled'}>${opts.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  return `<label class="setting${changed}" for="${id}"><span>${esc(label)}${changed ? ` <small class="muted">(default ${esc(def)})</small>` : ''}</span>${input}</label>`;
}

function countChanged(obj, def) {
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') n += countChanged(v, def[k]);
    else if (v !== def[k]) n++;
  }
  return n;
}
