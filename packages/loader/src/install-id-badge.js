/**
 * install-id-badge.js — shows this editor's install id so a buyer can paste it
 * at checkout and have THIS editor unlock itself after payment (§2.4).
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The activation flow was built end to end — checkout accepts an install id,
 * fulfilment arms a one-time claim, the next session redeems it — and was still
 * completely unusable, because nothing ever showed the customer their id. A
 * feature nobody can see is not shipped.
 *
 * ─── NOT RENDERED AUTOMATICALLY ─────────────────────────────────────────────
 * Deliberately opt-in (`showInstallId()`), unlike the upgrade prompt. That one
 * interrupts because the customer JUST PAID and is waiting for something to
 * happen. This is the opposite: most people loading an editor are not buying
 * anything, and a permanent "your ID is oe_…" badge on every free editor would
 * be noise on someone else's product.
 *
 * A host puts it behind their own "Upgrade" button, or calls `getInstallId()`
 * and renders it in their own design system.
 *
 * ─── IT IS NOT A SECRET ─────────────────────────────────────────────────────
 * Safe to display: an install id authorises nothing on its own (see
 * install-id.js). A pending activation claim is single-use and expiring, so
 * even a shoulder-surfed id cannot be replayed once the buyer's own editor has
 * used it.
 */
import { getInstallId } from './install-id.js';

/** Marks our badge so it can be found, replaced, and removed. */
const BADGE_ATTR = 'data-oe-install-id';

/**
 * Render the install id with a copy button.
 *
 * @param {Element} el       where to render (usually the editor container)
 * @param {object}  options
 * @param {string}  [options.label]  text above the id
 * @param {string}  [options.hint]   explanatory line under the id
 * @returns {Element|null} the badge, for tests and for hosts
 */
export function showInstallId(el, options = {}) {
  if (!el || typeof document === 'undefined') return null;

  const installId = getInstallId();
  // Storage blocked (private browsing, sandboxed iframe) → there is no id, and
  // activation cannot work for this browser. Say so plainly rather than
  // rendering an empty box the customer would try to copy.
  if (!installId) return showUnavailable(el, options);

  hideInstallId(el);

  const box = document.createElement('div');
  box.setAttribute(BADGE_ATTR, '');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Editor ID for activation');
  // Inline styles rather than a class: under runtime delivery the engine's
  // stylesheet may not have loaded, and this must render regardless.
  box.style.cssText = [
    'display:flex', 'align-items:center', 'gap:8px', 'flex-wrap:wrap',
    'padding:10px 12px', 'margin:8px 0', 'border:1px solid rgba(0,0,0,.15)',
    'border-radius:8px', 'background:rgba(0,0,0,.03)',
    'font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
  ].join(';');

  const label = document.createElement('span');
  label.textContent = options.label || 'Editor ID';
  label.style.cssText = 'font-weight:600';

  // <code> so the id is unambiguous — an install id is hex, and a proportional
  // font makes 0/O and 1/l genuinely hard to transcribe.
  const value = document.createElement('code');
  value.textContent = installId;
  value.style.cssText = [
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
    'font-size:12px', 'user-select:all', 'word-break:break-all',
  ].join(';');

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.style.cssText = [
    'padding:4px 10px', 'border:1px solid rgba(0,0,0,.2)', 'border-radius:6px',
    'background:#fff', 'cursor:pointer', 'font:inherit', 'font-size:12px',
  ].join(';');
  copy.addEventListener('click', () => {
    copyText(installId).then((ok) => {
      // Feedback in the button itself: a toast would need the engine's UI
      // layer, which may not exist yet at this point in the load.
      copy.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      if (!ok) selectText(value);
      setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
    });
  });

  const hint = document.createElement('span');
  hint.textContent = options.hint
    || 'Paste this at checkout and this editor unlocks itself after payment.';
  hint.style.cssText = 'flex-basis:100%;opacity:.7;font-size:12px';

  box.append(label, value, copy, hint);
  el.appendChild(box);
  return box;
}

/** Remove the badge, if present. */
export function hideInstallId(el) {
  if (!el || typeof el.querySelectorAll !== 'function') return;
  el.querySelectorAll(`[${BADGE_ATTR}]`).forEach((n) => n.remove());
}

/** Is the badge currently rendered? */
export function hasInstallId(el) {
  return !!(el && typeof el.querySelector === 'function' && el.querySelector(`[${BADGE_ATTR}]`));
}

/**
 * No install id available — storage is blocked. Told plainly, because the
 * alternative is a customer pasting an empty value at checkout and quietly
 * getting no activation.
 */
function showUnavailable(el, options) {
  hideInstallId(el);
  const box = document.createElement('div');
  box.setAttribute(BADGE_ATTR, '');
  box.setAttribute('role', 'status');
  box.style.cssText = [
    'padding:10px 12px', 'margin:8px 0', 'border:1px solid rgba(0,0,0,.15)',
    'border-radius:8px', 'background:rgba(0,0,0,.03)',
    'font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif', 'opacity:.8',
  ].join(';');
  box.textContent = options.unavailableMessage
    || 'This browser blocks site storage, so instant activation is unavailable. '
     + 'Buy as normal — we will email you a licence key to paste into your setup.';
  el.appendChild(box);
  return box;
}

/** Clipboard with a selection fallback — writeText needs permission + HTTPS. */
function copyText(text) {
  try {
    const clip = globalThis.navigator?.clipboard;
    if (clip?.writeText) return clip.writeText(text).then(() => true, () => false);
  } catch { /* fall through */ }
  return Promise.resolve(false);
}

/** Select the id so Ctrl+C works when the clipboard API is unavailable. */
function selectText(node) {
  try {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = globalThis.getSelection?.();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* best effort */ }
}
