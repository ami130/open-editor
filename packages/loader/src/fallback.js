/**
 * fallback.js — what the visitor sees when the editor cannot load
 * (execution plan §1.5 stage 3, §1.9).
 *
 * ─── THE RULE ───────────────────────────────────────────────────────────────
 * Every failure path ends in something usable or something explained. Never a
 * blank container. Under runtime delivery the editor arrives over the network,
 * so "it didn't load" is a state that WILL happen to real users — on hotel
 * wifi, behind a corporate proxy, mid-deploy — and it must not look like the
 * customer's site is broken.
 *
 * ─── WHY A TEXTAREA, NOT AN ERROR BOX ───────────────────────────────────────
 * The visitor was in the middle of something. An error message alone means
 * their work is impossible; a plain textarea means they can still write, still
 * submit the form, and still get on with their day — just without formatting.
 *
 * That matters most where it is least visible: a support agent replying to a
 * ticket, a customer filling in a description field. Degraded beats blocked.
 *
 * The textarea carries the SAME name/id the host would expect where possible,
 * so an ordinary form submit still works.
 */

/** Marks our fallback so it can be found and replaced on a later retry. */
const FALLBACK_ATTR = 'data-oe-fallback';

/**
 * Render a degraded-but-usable editor into the container.
 *
 * @param {Element} el      the mount target
 * @param {Error}  err      what went wrong
 * @param {object} opts     { message, initialValue, name }
 * @returns {HTMLTextAreaElement|null} the textarea, for tests and for hosts
 */
export function renderFallback(el, err, opts = {}) {
  if (!el || typeof document === 'undefined') return null;

  // Never stack fallbacks: a retry that fails again must replace, not append.
  removeFallback(el);

  const wrap = document.createElement('div');
  wrap.setAttribute(FALLBACK_ATTR, '');

  const note = document.createElement('p');
  // The visitor is not the integrator: they get a plain, non-technical line.
  // The technical reason goes to the console and to onError, where a developer
  // will actually look for it.
  note.textContent = opts.message
    || 'The rich text editor could not load. You can still write below and save as usual.';
  // Inline styles rather than a class: the engine's stylesheet is exactly what
  // failed to arrive, so there is nothing to hook a class onto.
  note.style.cssText = 'margin:0 0 .5rem;font:inherit;opacity:.75;';

  const area = document.createElement('textarea');
  area.value = opts.initialValue || '';
  if (opts.name) area.name = opts.name;
  area.setAttribute('aria-label', opts.ariaLabel || 'Text content');
  area.style.cssText = 'width:100%;min-height:8rem;font:inherit;padding:.5rem;box-sizing:border-box;';

  wrap.append(note, area);
  el.append(wrap);

  // Attached for diagnostics without putting the technical detail on screen.
  wrap.dataset.oeError = String(err?.message || err || 'unknown').slice(0, 200);
  return area;
}

/** Remove a previously rendered fallback, if any. */
export function removeFallback(el) {
  if (!el?.querySelectorAll) return;
  for (const node of el.querySelectorAll(`[${FALLBACK_ATTR}]`)) node.remove();
}

/** Is this container currently showing a fallback? */
export function hasFallback(el) {
  return !!el?.querySelector?.(`[${FALLBACK_ATTR}]`);
}
