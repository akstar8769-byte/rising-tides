// Diplomacy on the Trade tab: pacts (promises, never enforced) and treaties (enforced).
import { esc, chip, stepper } from './ui.js';

const BUILD = ['talk', 'trade'];

function pactLabel(g, p) {
  return p.kind === 'alliance' ? `alliance against ${esc(g.players[p.enemy].name)}` : 'non-aggression pact';
}

/** Active pact between me and seat, if any. */
export function myPactWith(g, seat) {
  return (g.pacts || []).find((p) => p.status === 'active' && ((p.a === g.you && p.b === seat) || (p.b === g.you && p.a === seat)));
}

/** Small tags for the players list: pacts, betrayals, broken treaties. */
export function diploTags(g, p) {
  const tags = [];
  if (p.seat !== g.you && myPactWith(g, p.seat)) tags.push('<span class="tag ok" title="You have a pact">🤝 pact with you</span>');
  if (p.betrayals) tags.push(`<span class="tag warn" title="Pacts this player has broken">🗡 broke ${p.betrayals} pact${p.betrayals === 1 ? '' : 's'}</span>`);
  if (p.treatyBreaks) tags.push(`<span class="tag warn" title="Treaties this player has broken">📜✖ broke ${p.treatyBreaks} treat${p.treatyBreaks === 1 ? 'y' : 'ies'}</span>`);
  const inTreaty = (g.treaties || []).filter((t) => t.active && t.signed.includes(p.seat));
  if (inTreaty.length) tags.push(`<span class="tag" title="Treaties in force">📜 ${inTreaty.map((t) => esc(t.name)).join(', ')}</span>`);
  return tags.join(' ');
}

/** "📜 Your treaties forbid: …" shown on the choose screen. */
export function limitsNote(g) {
  const L = g.limits;
  if (!L) return '';
  const parts = [];
  if (L.noUnsustainable) parts.push('Unsustainable development');
  if (L.noAttacks) parts.push(g.mode === 'base' ? 'raids' : 'raids and attacks');
  const prot = Object.keys(L.protectedSeats || {}).map((s) => g.players[s].name);
  if (prot.length && !L.noAttacks) parts.push(`attacking ${prot.map(esc).join(', ')}`);
  if (L.maxUnits) parts.push(`more than ${L.maxUnits.n} militia`);
  return parts.length ? `<p class="treaty-note">📜 Your treaties forbid: ${parts.join('; ')}.</p>` : '';
}

export function diplomacyPanel(store) {
  const d = store.data;
  const g = d.game;
  const gen = g.settings.general;
  if (!gen.pactsEnabled && !gen.treatiesEnabled) return '';
  const open = BUILD.includes(g.phase) && !d.paused;
  return `${gen.pactsEnabled ? pactsCard(store, open) : ''}${gen.treatiesEnabled ? treatiesCard(store, open) : ''}`;
}

function pactsCard(store, open) {
  const g = store.data.game;
  const gen = g.settings.general;
  const pd = store.ui.pact;
  const pacts = g.pacts || [];
  const active = pacts.filter((p) => p.status === 'active');
  const incoming = pacts.filter((p) => p.status === 'proposed' && p.b === g.you);
  const outgoing = pacts.filter((p) => p.status === 'proposed' && p.a === g.you);
  const others = g.players.filter((p) => p.seat !== g.you);
  const canOffer = open && pd.to != null && !(pd.kind === 'alliance' && pd.enemy == null);

  return `<div class="card">
    <h2>🤝 Pacts</h2>
    <p class="hint">A pact is a promise: no raids or attacks on each other for a few rounds. The game never stops anyone breaking one — but it tells everyone, and nobody forgets.</p>
    ${
      active.length
        ? `<ul class="offers">${active
            .map((p) => `<li class="offer"><div>${chip(p.a, g.players[p.a].name)} & ${chip(p.b, g.players[p.b].name)}: ${pactLabel(g, p)} until the end of round ${p.until}</div></li>`)
            .join('')}</ul>`
        : '<p class="muted small">No pacts in force.</p>'
    }
    ${incoming
      .map(
        (p) => `<div class="offer incoming"><div>${chip(p.a, g.players[p.a].name)} offers you a ${pactLabel(g, p)} for ${p.rounds} round${p.rounds === 1 ? '' : 's'}.</div>
        <div class="row"><button class="btn primary small" data-act="respondPact" data-id="${p.id}" data-accept="1" ${open ? '' : 'disabled'}>Accept</button>
        <button class="btn small" data-act="respondPact" data-id="${p.id}" data-accept="0" ${open ? '' : 'disabled'}>Decline</button></div></div>`,
      )
      .join('')}
    ${outgoing.map((p) => `<div class="offer"><div>You offered ${chip(p.b, g.players[p.b].name)} a ${pactLabel(g, p)}.</div><div class="row"><button class="btn small" data-act="cancelPact" data-id="${p.id}">Withdraw</button></div></div>`).join('')}
    <h3>Offer a pact</h3>
    <div class="target-list">${others
      .map((p) => `<button class="target ${pd.to === p.seat ? 'selected' : ''}" data-act="set" data-path="pact.to" data-json="${p.seat}" aria-pressed="${pd.to === p.seat}">${chip(p.seat, p.name)}</button>`)
      .join('')}</div>
    <div class="row wrap">
      <button class="btn small ${pd.kind === 'peace' ? 'primary' : ''}" data-act="set" data-path="pact.kind" data-value="peace">Non-aggression</button>
      <button class="btn small ${pd.kind === 'alliance' ? 'primary' : ''}" data-act="set" data-path="pact.kind" data-value="alliance" ${g.players.length < 3 ? 'disabled' : ''}>Alliance against…</button>
      ${stepper('pact.rounds', Math.min(pd.rounds, gen.maxPactRounds), { min: 1, max: gen.maxPactRounds, label: 'Rounds' })}<span class="small muted">rounds</span>
    </div>
    ${
      pd.kind === 'alliance'
        ? `<div class="target-list">${others
            .filter((p) => p.seat !== pd.to)
            .map((p) => `<button class="target ${pd.enemy === p.seat ? 'selected' : ''}" data-act="set" data-path="pact.enemy" data-json="${p.seat}">⚔ ${chip(p.seat, p.name)}</button>`)
            .join('')}</div>`
        : ''
    }
    <button class="btn primary" data-act="proposePact" ${canOffer ? '' : 'disabled'}>Offer pact</button>
  </div>`;
}

function treatiesCard(store, open) {
  const g = store.data.game;
  const gen = g.settings.general;
  const td = store.ui.treaty;
  const others = g.players.filter((p) => p.seat !== g.you);
  const name = (s) => esc(g.players[s].name);

  const list = (g.treaties || [])
    .map((t) => {
      const answered = [...t.signed, ...t.declined, ...t.broken].includes(g.you);
      const invitedMe = t.invited.includes(g.you) && !answered;
      const signedMe = t.signed.includes(g.you);
      return `<li class="offer treaty">
        <div><b>📜 ${esc(t.name)}</b> ${t.active ? '<span class="tag ok">in force</span>' : '<span class="tag">awaiting signatures</span>'}
          <span class="small muted">${t.until ? `until the end of round ${t.until}` : 'for the rest of the game'}</span></div>
        <div class="small">${t.rules.map(esc).join(' · ')}</div>
        ${t.note ? `<div class="small muted">“${esc(t.note)}”</div>` : ''}
        <div class="small">Signed: ${t.signed.map(name).join(', ') || '—'}${t.declined.length ? ` · declined: ${t.declined.map(name).join(', ')}` : ''}${t.broken.length ? ` · <span class="warn">broken by ${t.broken.map(name).join(', ')}</span>` : ''}</div>
        <div class="row wrap">
          ${invitedMe ? `<button class="btn primary small" data-act="signTreaty" data-id="${t.id}" ${open ? '' : 'disabled'}>Sign</button><button class="btn small" data-act="declineTreaty" data-id="${t.id}" ${open ? '' : 'disabled'}>Decline</button>` : ''}
          ${signedMe ? `<button class="btn small danger" data-act="breakTreaty" data-id="${t.id}" data-name="${esc(t.name)}" ${open ? '' : 'disabled'}>Break treaty (−${gen.treatyBreakPenalty} materials)</button>` : ''}
        </div>
      </li>`;
    })
    .join('');

  const toggle = (path, on, label) => `<button class="btn small toggle-btn ${on ? 'primary' : ''}" data-act="set" data-path="${path}" data-json="${!on}" aria-pressed="${on}">${on ? '✔ ' : ''}${label}</button>`;
  const hasRule = td.maxUnitsOn || td.noUnsustainable || td.noAttackSignatories || td.noAttacks;
  const canPropose = open && td.name.trim() && hasRule && td.invite.length;
  return `<div class="card">
    <h2>📜 Treaties</h2>
    <p class="hint">Unlike pacts, treaties are <b>binding</b>: while you're a signatory the game blocks any move that breaks the rules. To get out you must openly break the treaty — everyone sees it and you lose ${gen.treatyBreakPenalty} materials.</p>
    ${list ? `<ul class="offers">${list}</ul>` : '<p class="muted small">No treaties yet.</p>'}
    <details class="tool" ${open ? '' : ''}>
      <summary>Write a treaty</summary>
      <label for="treaty-name">Name</label>
      <input id="treaty-name" data-model="treaty.name" value="${esc(td.name)}" maxlength="40" placeholder="e.g. Peace of the River" />
      <label for="treaty-note">Note (optional, not enforced)</label>
      <input id="treaty-note" data-model="treaty.note" value="${esc(td.note)}" maxlength="200" placeholder="Why we're signing" />
      <h3>Rules everyone who signs must keep</h3>
      <div class="row wrap">
        ${toggle('treaty.noUnsustainable', td.noUnsustainable, 'No Unsustainable development')}
        ${toggle('treaty.noAttackSignatories', td.noAttackSignatories, g.mode === 'base' ? 'No raids on each other' : 'No raids/attacks on each other')}
        ${toggle('treaty.noAttacks', td.noAttacks, g.mode === 'base' ? 'No raids at all' : 'No raids/attacks at all')}
        ${g.war ? toggle('treaty.maxUnitsOn', td.maxUnitsOn, 'Militia limit') : ''}
      </div>
      ${g.war && td.maxUnitsOn ? `<div class="row">No more than ${stepper('treaty.maxUnits', td.maxUnits, { min: 0, max: 20, label: 'Max militia' })} militia each</div>` : ''}
      <div class="row">Lasts ${stepper('treaty.rounds', td.rounds, { min: 0, max: 10, label: 'Rounds' })} <span class="small muted">${td.rounds ? `round${td.rounds === 1 ? '' : 's'}` : '(0 = rest of the game)'}</span></div>
      <h3>Invite</h3>
      <div class="target-list">${others
        .map((p) => `<button class="target ${td.invite.includes(p.seat) ? 'selected' : ''}" data-act="toggleInvite" data-seat="${p.seat}" aria-pressed="${td.invite.includes(p.seat)}">${chip(p.seat, p.name)}</button>`)
        .join('')}</div>
      <button class="btn primary" data-act="proposeTreaty" ${canPropose ? '' : 'disabled'}>Propose treaty (you sign first)</button>
    </details>
  </div>`;
}
