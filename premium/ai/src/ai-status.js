/**
 * ai-status.js — a small, self-contained status surface for the AI features.
 *
 * The AI plumbing (core aiComplete) emits `aiStart` / `aiDone` / `aiError`, but
 * nothing displayed them — so a running request showed no spinner and a FAILED
 * request (no endpoint, bad key, HTTP error, empty reply) failed completely
 * SILENTLY: the button appeared dead. This attaches ONE listener set per editor
 * and renders a slim, dismissible bar in the editor wrapper:
 *   • aiStart → "Working…" (busy)
 *   • aiDone  → clears the busy bar
 *   • aiError → a clear, actionable message (esp. "no-endpoint")
 *
 * Normal-flow element appended after the editing surface (same pattern as the
 * premium upgrade notice) — never overlays content, never traps focus, theme-
 * aware via --oe-* variables. Idempotent: install once; repeated installs (each
 * AI plugin calls it) share the single per-editor surface.
 */

const STYLE_ID = 'oe-ai-status-styles';

const CSS = `
.oe-ai-status {
  display: flex; align-items: center; gap: 8px;
  margin-top: 6px; padding: 7px 10px;
  border: 1px solid var(--oe-border); border-radius: 6px;
  background: var(--oe-bg-secondary, var(--oe-bg));
  font-size: 12.5px; line-height: 1.45;
}
.oe-ai-status--busy { color: var(--oe-fg-muted); }
.oe-ai-status--error { color: var(--oe-callout-danger-fg, #4a0a0a); border-color: var(--oe-c-danger-accent, #e53935); background: color-mix(in srgb, var(--oe-c-danger-accent, #e53935) 8%, var(--oe-bg)); }
.oe-ai-status__spinner {
  flex-shrink: 0; width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--oe-border-strong, #c5c5c5); border-top-color: var(--oe-primary, #3f57df);
  animation: oe-ai-spin 0.7s linear infinite;
}
@keyframes oe-ai-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .oe-ai-status__spinner { animation: none; } }
.oe-ai-status__icon { flex-shrink: 0; }
.oe-ai-status__text { flex: 1; min-width: 0; }
.oe-ai-status__dismiss {
  flex-shrink: 0; border: none; background: transparent; color: inherit;
  font-size: 14px; line-height: 1; padding: 2px 4px; border-radius: 4px; cursor: pointer;
}
.oe-ai-status__dismiss:hover { background: var(--oe-bg-hover); }
`;

// Human-readable, ACTIONABLE messages per aiError reason.
const ERROR_MESSAGES = {
  'no-endpoint': 'AI is not configured. Set an aiEndpoint (your server/proxy to an AI provider) to use this feature.',
  'no-selection': 'Select some text first, then run the AI action.',
  network: 'Could not reach the AI endpoint — check your connection or endpoint URL.',
  http: 'The AI endpoint returned an error. Check the endpoint and any API key on your server.',
  stream: 'The AI response was interrupted. Please try again.',
  empty: 'The AI returned no text. Please try again.',
};

const STATE = new WeakMap();

function injectStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

function removeBar(state) {
  if (state.el && state.el.parentNode) state.el.parentNode.removeChild(state.el);
  state.el = null;
}

function showBar(editor, kind, message, { busy = false } = {}) {
  const wrapper = editor && editor._wrapper;
  if (!wrapper || !wrapper.ownerDocument) return;
  const doc = wrapper.ownerDocument;
  injectStyle(doc);
  let state = STATE.get(editor);
  if (!state) { state = { el: null, listeners: false, timer: null }; STATE.set(editor, state); }
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  removeBar(state);

  const el = doc.createElement('div');
  el.className = `oe-ai-status oe-ai-status--${kind}`;
  el.setAttribute('data-oe-ai-status', kind);
  // Errors are assertive (the user needs to know it failed); busy is polite.
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');

  const lead = doc.createElement('span');
  if (busy) { lead.className = 'oe-ai-status__spinner'; lead.setAttribute('aria-hidden', 'true'); }
  else { lead.className = 'oe-ai-status__icon'; lead.setAttribute('aria-hidden', 'true'); lead.textContent = kind === 'error' ? '⚠️' : ''; }
  el.appendChild(lead);

  const text = doc.createElement('span');
  text.className = 'oe-ai-status__text';
  text.textContent = message;
  el.appendChild(text);

  if (!busy) {
    const dismiss = doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'oe-ai-status__dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => removeBar(state));
    el.appendChild(dismiss);
    // Auto-clear a lingering error/success bar after a while so it isn't sticky.
    state.timer = setTimeout(() => removeBar(state), 8000);
  }

  wrapper.appendChild(el);
  state.el = el;
}

function clearBar(editor) {
  const state = STATE.get(editor);
  if (state) { if (state.timer) { clearTimeout(state.timer); state.timer = null; } removeBar(state); }
}

/**
 * Attach the AI status surface to an editor (idempotent — safe to call from
 * every AI plugin's install()). Wires aiStart/aiDone/aiError once.
 * @param {object} editor
 * @param {object} [opts] { busyText } override the "working" label
 */
export function installAiStatus(editor, opts = {}) {
  if (!editor || !editor.on) return;
  let state = STATE.get(editor);
  if (!state) { state = { el: null, listeners: false, timer: null }; STATE.set(editor, state); }
  if (state.listeners) return; // already wired
  state.listeners = true;
  const busyText = opts.busyText || 'Working with AI…';
  editor.on('aiStart', () => showBar(editor, 'busy', busyText, { busy: true }));
  editor.on('aiDone', () => clearBar(editor));
  editor.on('aiError', (e) => {
    const reason = (e && e.reason) || 'error';
    showBar(editor, 'error', ERROR_MESSAGES[reason] || 'The AI request failed. Please try again.');
  });
}

export { ERROR_MESSAGES };
