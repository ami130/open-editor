/**
 * activate.js — "Premium unlocked — activate now" (execution plan §1.7).
 *
 * ─── WHY A RELOAD IS NEEDED AT ALL ──────────────────────────────────────────
 * The PLAN decides which BUNDLE was downloaded. A free visitor is running
 * free.js, which physically contains no premium code — so handing that editor a
 * premium licence verifies happily and unlocks nothing. Proven in three
 * browsers: `runningPlan: "free"`, `premiumCodePresent: false`, and applying a
 * valid premium licence left `export.pdf` denied.
 *
 * That is a fact about bytes on the page, not a policy we chose.
 *
 * ─── WHY NOT SWAP THE ENGINE IN PLACE (Option A) ────────────────────────────
 * Because the customer has content in the editor RIGHT NOW, and this is the
 * moment they just paid. Fetching a different bundle and re-mounting risks the
 * worst possible outcome — "I paid and it deleted my document" (R14) — on the
 * very transaction that turned them into a paying customer.
 *
 * Worth being precise about what is and is not risky: a SAME-PLAN entitlement
 * change is already safe, and measured to be. Content, cursor, undo history and
 * typing all survive it untouched, because the engine only rebuilds chrome. It
 * is specifically the BUNDLE swap that cannot be made safe cheaply.
 *
 * ─── SO: OPTION C ───────────────────────────────────────────────────────────
 * Tell them, and let them choose the moment. One click, near-instant, zero risk
 * to their document. The customer is *expecting* something to happen after
 * paying, so a prompt reads as confirmation rather than friction.
 *
 * The prompt is deliberately: DISMISSIBLE (never traps anyone), NON-BLOCKING
 * (never steals focus from someone mid-sentence), and OPT-OUT (a host with its
 * own design system renders its own).
 */

/** Marks our prompt so it can be found, replaced, and removed. */
const PROMPT_ATTR = 'data-oe-activate';

/**
 * Show the activation prompt.
 *
 * @param {Element} el       the editor's container
 * @param {object}  options
 * @param {string}  [options.message]
 * @param {string}  [options.actionLabel]
 * @param {Function} [options.onActivate] defaults to reloading the page
 * @returns {Element|null} the prompt element, for tests and for hosts
 */
export function showActivatePrompt(el, options = {}) {
  if (!el || typeof document === 'undefined') return null;

  // Never stack prompts: a second upgrade signal must replace, not append.
  dismissActivatePrompt(el);

  const bar = document.createElement('div');
  bar.setAttribute(PROMPT_ATTR, '');
  bar.setAttribute('role', 'status');
  // `polite`, never `assertive`: a screen-reader user mid-sentence must not be
  // interrupted by good news.
  bar.setAttribute('aria-live', 'polite');
  // Inline styles rather than a class — under runtime delivery the engine's
  // stylesheet may not have loaded, and this must render regardless.
  bar.style.cssText = 'display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;'
    + 'padding:.5rem .75rem;margin:0 0 .5rem;font:inherit;font-size:.9375em;'
    + 'border:1px solid currentColor;border-radius:.375rem;opacity:.9;';

  const text = document.createElement('span');
  text.textContent = options.message || 'Premium unlocked — reload to activate it.';
  text.style.cssText = 'flex:1 1 auto;';

  const action = document.createElement('button');
  action.type = 'button';                       // never submit a surrounding form
  action.textContent = options.actionLabel || 'Reload';
  action.style.cssText = 'font:inherit;padding:.25rem .75rem;cursor:pointer;'
    + 'border:1px solid currentColor;border-radius:.25rem;background:transparent;';
  action.addEventListener('click', () => {
    if (typeof options.onActivate === 'function') options.onActivate();
    // Default: do the obvious thing. Most integrators will not wire a handler,
    // and a prompt whose button does nothing is worse than no prompt.
    else if (typeof location !== 'undefined') location.reload();
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  close.style.cssText = 'font:inherit;line-height:1;padding:.25rem .5rem;cursor:pointer;'
    + 'border:0;background:transparent;opacity:.7;';
  close.addEventListener('click', () => dismissActivatePrompt(el));

  bar.append(text, action, close);
  // Prepended so it reads before the editor rather than being missed below the
  // fold of a tall document.
  el.prepend(bar);

  // ⚠️ FOCUS IS DELIBERATELY NOT MOVED. Someone may be mid-word; stealing focus
  // to announce good news would lose their place and drop keystrokes — the
  // exact class of harm §1.7 exists to prevent.
  return bar;
}

/** Remove the prompt, if one is showing. */
export function dismissActivatePrompt(el) {
  if (!el?.querySelectorAll) return;
  for (const node of el.querySelectorAll(`[${PROMPT_ATTR}]`)) node.remove();
}

/** Is a prompt currently showing? */
export function hasActivatePrompt(el) {
  return !!el?.querySelector?.(`[${PROMPT_ATTR}]`);
}
