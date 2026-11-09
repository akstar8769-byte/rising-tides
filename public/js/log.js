// Event log (newest first) and room chat.
import { esc, swatch } from './ui.js';

export function renderLog(game, { limit = 400 } = {}) {
  const entries = game.log.slice(-limit).reverse();
  let lastRound = null;
  const out = [];
  for (const e of entries) {
    if (e.round !== lastRound) {
      out.push(`<li class="log-round">Round ${e.round}</li>`);
      lastRound = e.round;
    }
    out.push(`<li class="log-entry ${e.kind || ''}">${esc(e.text)}</li>`);
  }
  return `<ol class="log" data-keep-scroll="log">${out.join('')}</ol>`;
}

export function renderChat(store) {
  const msgs = store.chat
    .map((m) =>
      m.name === null
        ? `<li class="chat-sys">${esc(m.text)}</li>`
        : `<li>${m.seat != null && store.data?.game ? swatch(m.seat, 14) : ''}<b>${esc(m.name)}:</b> ${esc(m.text)}</li>`,
    )
    .join('');
  // Newest at the bottom; scroll to the bottom after drawing.
  queueMicrotask(() => {
    const el = document.querySelector('.chat-list');
    if (el) el.scrollTop = el.scrollHeight;
  });
  return `<div class="chat">
    <ul class="chat-list">${msgs || '<li class="chat-sys">No messages yet. Say hi!</li>'}</ul>
    <form id="chat-form" class="row">
      <input id="chat-input" data-model="chatDraft" value="${esc(store.ui.chatDraft)}" maxlength="300" placeholder="Message the room…" autocomplete="off" aria-label="Chat message" />
      <button class="btn" type="submit">Send</button>
    </form>
  </div>`;
}
