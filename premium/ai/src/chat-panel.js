/**
 * chat-panel.js — the AI Chat panel body (a DOM Node for editor.ui.modal).
 * A minimal multi-turn surface: a transcript + an input; each send calls the
 * FREE editor.aiComplete() (streaming the reply into the transcript) and offers
 * an "Insert" button to drop the last reply at the caret. Theme-aware via the
 * editor CSS variables.
 *
 * Pure-ish builder: buildChatPanel(doc, { complete }) → { node }, where
 * `complete({ prompt, onToken })` is supplied by the plugin (closing over the
 * live editor). No editor import here.
 */
const STYLE_ID = 'oe-ai-chat-styles';
const CSS = `
.oe-ai-chat { display:flex; flex-direction:column; gap:10px; min-width:340px; max-width:520px; }
.oe-ai-chat__log { display:flex; flex-direction:column; gap:8px; max-height:320px; overflow:auto; }
.oe-ai-chat__msg { padding:7px 10px; border-radius:8px; font-size:13px; line-height:1.45; white-space:pre-wrap; }
.oe-ai-chat__msg--user { background:var(--oe-primary,#2563eb); color:#fff; align-self:flex-end; max-width:85%; }
.oe-ai-chat__msg--ai { background:var(--oe-bg-secondary,var(--oe-bg-hover,#f1f5f9)); color:var(--oe-panel-fg); align-self:flex-start; max-width:85%; border:1px solid var(--oe-border); }
.oe-ai-chat__row { display:flex; gap:8px; }
.oe-ai-chat__input { flex:1; padding:8px 10px; border:1.5px solid var(--oe-border-strong); border-radius:6px; font-size:13px; color:var(--oe-panel-fg); background:var(--oe-bg); }
.oe-ai-chat__input:focus { border-color:var(--oe-primary); outline:none; }
.oe-ai-chat__btn { padding:8px 14px; border:1px solid var(--oe-primary,#2563eb); background:var(--oe-primary,#2563eb); color:#fff; border-radius:6px; cursor:pointer; font-size:13px; }
.oe-ai-chat__btn:disabled { opacity:.5; cursor:default; }
.oe-ai-chat__insert { background:transparent; color:var(--oe-primary,#2563eb); border:1px solid var(--oe-border); border-radius:5px; font-size:11.5px; padding:2px 8px; cursor:pointer; align-self:flex-start; margin-top:2px; }
`;

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function injectStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID; s.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(s);
}

export function buildChatPanel(doc, { complete, onInsert }) {
  injectStyle(doc);
  const root = el(doc, 'div', 'oe-ai-chat');
  root.setAttribute('data-oe-ai-chat', '');
  const log = el(doc, 'div', 'oe-ai-chat__log');
  const row = el(doc, 'div', 'oe-ai-chat__row');
  const input = el(doc, 'input', 'oe-ai-chat__input');
  input.type = 'text';
  input.setAttribute('placeholder', 'Ask the AI to write something…');
  const send = el(doc, 'button', 'oe-ai-chat__btn', 'Send');
  send.type = 'button';
  row.appendChild(input); row.appendChild(send);
  root.appendChild(log); root.appendChild(row);

  let busy = false;

  async function submit() {
    const prompt = input.value.trim();
    if (!prompt || busy) return;
    busy = true; send.disabled = true;
    input.value = '';
    log.appendChild(el(doc, 'div', 'oe-ai-chat__msg oe-ai-chat__msg--user', prompt));

    const aiMsg = el(doc, 'div', 'oe-ai-chat__msg oe-ai-chat__msg--ai', '');
    log.appendChild(aiMsg);
    log.scrollTop = log.scrollHeight;

    let full = '';
    await complete({
      prompt,
      onToken: (_t, acc) => { full = acc; aiMsg.textContent = acc; log.scrollTop = log.scrollHeight; },
    });
    // Offer an insert-at-caret button for the completed reply.
    if (full) {
      const ins = el(doc, 'button', 'oe-ai-chat__insert', 'Insert into document');
      ins.type = 'button';
      ins.addEventListener('click', () => onInsert && onInsert(full));
      aiMsg.appendChild(doc.createElement('br'));
      aiMsg.appendChild(ins);
    }
    busy = false; send.disabled = false;
    input.focus();
  }

  send.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  return { node: root };
}
