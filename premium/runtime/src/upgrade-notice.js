/**
 * 19.3 — the graceful-degrade surface. A single slim, dismissible notice per
 * editor listing every premium feature the current license does not grant.
 * Non-blocking by construction: a normal-flow element appended AFTER the
 * editing surface — it never overlays content, never traps focus, and the
 * editor works identically with it visible, dismissed, or suppressed.
 *
 * Colors come exclusively from the editor's theme variables, so the notice
 * follows light/dark/custom themes like every core surface does.
 */

const STYLE_ID = 'oe-premium-notice-styles';

const NOTICE_CSS = `
.oe-premium-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 7px 10px;
  border: 1px solid var(--oe-border);
  border-radius: 6px;
  background: var(--oe-bg-secondary, var(--oe-bg));
  color: var(--oe-fg-muted);
  font-size: 12.5px;
  line-height: 1.45;
}
.oe-premium-notice__icon { flex-shrink: 0; opacity: 0.75; }
.oe-premium-notice__text { flex: 1; min-width: 0; }
.oe-premium-notice__features { font-weight: 600; color: var(--oe-panel-fg); }
.oe-premium-notice__dismiss {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--oe-fg-muted);
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
}
.oe-premium-notice__dismiss:hover { background: var(--oe-bg-hover); color: var(--oe-panel-fg); }
`;

// Per-editor notice state. WeakMap so a destroyed editor (wrapper GC'd)
// carries its state away with it.
const STATE = new WeakMap();

/**
 * Show (or extend) the upgrade notice for one denied feature. Multiple denials
 * aggregate into the one existing notice; a user dismissal is remembered for
 * the editor's lifetime — later denials stay quiet.
 *
 * @param {object} editor  the editor instance the plugin was installed into
 * @param {object} info    { featureId, title, reason }
 */
export function showUpgradeNotice(editor, info) {
  const wrapper = editor && editor._wrapper;
  if (!wrapper || !wrapper.ownerDocument) return;

  let state = STATE.get(editor);
  if (!state) {
    state = { el: null, titles: new Set(), dismissed: false };
    STATE.set(editor, state);
  }
  if (state.dismissed) return;

  state.titles.add(info.title || info.featureId);

  if (!state.el) {
    injectStyleOnce(wrapper.ownerDocument);
    state.el = buildNotice(wrapper.ownerDocument, () => {
      state.dismissed = true;
      if (state.el && state.el.parentNode) state.el.parentNode.removeChild(state.el);
      state.el = null;
    });
    wrapper.appendChild(state.el);
  }

  const list = state.el.querySelector('.oe-premium-notice__features');
  list.textContent = [...state.titles].join(', ');
}

/**
 * Reset the notice for an editor that re-licenses at runtime (e.g. an SPA
 * applying a fetched license after startup): removes the element and clears
 * the aggregate + dismissed state so post-upgrade denials report freshly.
 */
export function resetUpgradeNotice(editor) {
  const state = editor && STATE.get(editor);
  if (!state) return;
  if (state.el && state.el.parentNode) state.el.parentNode.removeChild(state.el);
  STATE.delete(editor);
}

function buildNotice(doc, onDismiss) {
  const el = doc.createElement('div');
  el.className = 'oe-premium-notice';
  el.setAttribute('data-oe-premium-notice', '');
  el.setAttribute('role', 'status'); // polite announce, never interrupts

  const icon = doc.createElement('span');
  icon.className = 'oe-premium-notice__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔒';

  const text = doc.createElement('span');
  text.className = 'oe-premium-notice__text';
  const features = doc.createElement('span');
  features.className = 'oe-premium-notice__features';
  text.appendChild(features);
  text.appendChild(doc.createTextNode(' — premium feature. An upgraded license unlocks it.'));

  const dismiss = doc.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'oe-premium-notice__dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', onDismiss);

  el.appendChild(icon);
  el.appendChild(text);
  el.appendChild(dismiss);
  return el;
}

function injectStyleOnce(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = NOTICE_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}
