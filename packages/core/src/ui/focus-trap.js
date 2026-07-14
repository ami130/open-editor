const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Traps keyboard focus inside `el`. Returns a cleanup function that removes
 * the trap. Call cleanup when the modal closes.
 *
 * @param {HTMLElement} el
 * @returns {() => void} cleanup
 */
export function trapFocus(el) {
  function getFocusable() {
    return Array.from(el.querySelectorAll(FOCUSABLE)).filter(
      (n) => !n.closest('[hidden]') && !n.closest('[aria-hidden="true"]')
    );
  }

  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    // B3 fix: stop propagation so that a lower modal's trap keydown listener
    // does not also fire when a stacked modal is on top.
    e.stopPropagation();
    const nodes = getFocusable();
    if (nodes.length === 0) { e.preventDefault(); return; }
    const first = nodes[0];
    const last  = nodes[nodes.length - 1];
    const ownerDoc = el.ownerDocument || document;
    const active = ownerDoc.activeElement;
    // If focus has escaped the trapped element entirely (e.g. a backdrop/body
    // click moved it out), pull it back in on the next Tab instead of letting
    // it walk further away.
    if (!el.contains(active)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey) {
      if (active === first) { e.preventDefault(); last.focus(); }
    } else {
      if (active === last)  { e.preventDefault(); first.focus(); }
    }
  }

  el.addEventListener('keydown', onKeyDown);

  // L3 fix: only move focus into the modal if focus isn't already inside it.
  // This prevents clobbering focus when the caller places it deliberately.
  const ownerDoc = el.ownerDocument || document;
  if (!el.contains(ownerDoc.activeElement)) {
    const initial = getFocusable()[0] || el;
    initial.focus();
  }

  return function cleanup() {
    el.removeEventListener('keydown', onKeyDown);
  };
}
