// First screen: type your name, then create a room or join one.
import { esc } from './ui.js';

export function renderLanding(store) {
  const { ui } = store;
  const hasCode = !!ui.code;
  return `
  <div class="landing">
    <header class="hero">
      <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#12395a"/><path d="M14 34 L32 18 L50 34 V48 H14 Z" fill="#f3e9d2"/><path d="M6 46 q7 -6 13 0 t13 0 t13 0 t13 0 V60 H6 Z" fill="#3fa7d6"/></svg>
      <h1>Rising Tides</h1>
      <p>Protect your home. Compete for resources. Don't destroy the village.</p>
    </header>

    <form class="card" data-submit="${hasCode ? 'join' : 'create'}">
      <label for="name-input">Your name</label>
      <input id="name-input" data-model="name" value="${esc(ui.name)}" maxlength="20" autocomplete="nickname" placeholder="e.g. Sunho" required />
      ${
        hasCode
          ? `<label for="code-input">Room code</label>
             <input id="code-input" class="code-input" data-model="code" value="${esc(ui.code)}" maxlength="4" autocapitalize="characters" autocomplete="off" />
             <button class="btn primary big" type="submit" data-act="join">Join room</button>
             <p class="hint">Rejoining after a refresh? Use exactly the same name as before.</p>
             <button class="btn link" type="button" data-act="set" data-path="code" data-value="">Create a new room instead</button>`
          : `<button class="btn primary big" type="submit" data-act="create">Create a room</button>
             <div class="or"><span>or join one</span></div>
             <label for="code-input">Room code</label>
             <div class="row">
               <input id="code-input" class="code-input" data-model="code" value="${esc(ui.code)}" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="ABCD" />
               <button class="btn" type="button" data-act="join">Join</button>
             </div>`
      }
    </form>
    <p class="footnote">A playtest prototype for 3–5 players. No accounts, no installs.</p>
  </div>`;
}
