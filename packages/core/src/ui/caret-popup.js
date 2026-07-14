/**
 * caret-popup.js — Phase 16.6 shared infrastructure: a searchable, keyboard-
 * navigable popup anchored to the TEXT CARET (not a button or a modal).
 *
 * Distinct from toolbar-dropdown.js (anchors to a trigger BUTTON) and
 * char-grid.js (renders inside a centered MODAL as a grid-of-buttons picker).
 * The slash-command palette (16.6.1) and @mentions autocomplete (16.6.3) both
 * need a single-column list that tracks a moving caret position in running
 * text — genuinely new positioning logic, adapted from toolbar-dropdown's
 * arrow-key-nav/viewport-clamp pattern.
 *
 * createCaretPopup(doc, opts) → { el, open(range, items), close, isOpen,
 *   setItems(items), moveActive(delta), pickActive(), destroy }
 * opts.onPick(item): called when an item is chosen (click or Enter).
 * opts.renderItem(item): returns a Node or string for one row (default: label).
 */
export function createCaretPopup(doc, opts = {}) {
  const onPick = typeof opts.onPick === 'function' ? opts.onPick : () => {};
  const renderItem = typeof opts.renderItem === 'function'
    ? opts.renderItem
    : (item) => item.label || String(item);

  const panel = doc.createElement('div');
  panel.className = 'oe-caret-popup';
  panel.setAttribute('role', 'listbox');
  // 17.10 — a listbox is an "ARIA input field": it MUST have an accessible
  // name (axe: aria-input-field-name). Callers pass a purpose-specific label.
  panel.setAttribute('aria-label', opts.ariaLabel || 'Suggestions');
  panel.hidden = true;

  let items = [];
  let activeIndex = -1;
  let optionEls = [];

  function render() {
    panel.innerHTML = '';
    optionEls = items.map((item, i) => {
      // 17.10 — options are BUTTONS (naturally focusable) so the scrollable
      // panel is keyboard-reachable (axe: scrollable-region-focusable). Arrow
      // keys drive the active option while the caret stays in the editor;
      // Tab reaches the options directly, Enter picks — both paths work.
      const row = doc.createElement('button');
      row.type = 'button';
      row.className = 'oe-caret-popup__option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      const content = renderItem(item);
      if (typeof content === 'string') row.textContent = content;
      else if (content) row.appendChild(content);
      row.addEventListener('mousedown', (e) => e.preventDefault()); // keep caret focus
      row.addEventListener('click', () => onPick(item));
      panel.appendChild(row);
      return row;
    });
    // 17.10 — role=listbox REQUIRES option children (axe:
    // aria-required-children, critical). With no matches the panel is a
    // status message, not a listbox — swap the role per state.
    panel.setAttribute('role', items.length ? 'listbox' : 'status');
    if (!items.length) {
      const empty = doc.createElement('div');
      empty.className = 'oe-caret-popup__empty';
      empty.textContent = 'No matches';
      panel.appendChild(empty);
    }
  }

  function setActive(i) {
    activeIndex = items.length ? Math.max(0, Math.min(i, items.length - 1)) : -1;
    for (let k = 0; k < optionEls.length; k++) {
      optionEls[k].classList.toggle('oe-caret-popup__option--active', k === activeIndex);
      optionEls[k].setAttribute('aria-selected', k === activeIndex ? 'true' : 'false');
    }
    if (activeIndex >= 0 && optionEls[activeIndex] && typeof optionEls[activeIndex].scrollIntoView === 'function') {
      optionEls[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // Position the panel just below (or above, if no room) the given Range.
  function positionAt(range) {
    try {
      const rect = range.getBoundingClientRect();
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const vw = (win && win.innerWidth) || 1024;
      const vh = (win && win.innerHeight) || 768;
      panel.style.position = 'fixed';
      panel.style.left = Math.min(rect.left, vw - (panel.offsetWidth || 220) - 4) + 'px';
      const spaceBelow = vh - rect.bottom;
      const pH = panel.offsetHeight || 200;
      if (spaceBelow >= pH + 8 || spaceBelow >= vh / 2) {
        panel.style.top = (rect.bottom + 4) + 'px';
        panel.style.bottom = '';
      } else {
        panel.style.bottom = Math.max(0, vh - rect.top + 4) + 'px';
        panel.style.top = '';
      }
    } catch { /* jsdom / detached range — best-effort, panel still opens at 0,0 */ }
  }

  function open(range, initialItems) {
    if (!panel.parentNode) (doc.body || doc.documentElement).appendChild(panel);
    items = Array.isArray(initialItems) ? initialItems : [];
    panel.hidden = false;
    render();
    setActive(0);
    positionAt(range);
  }

  function setItems(nextItems) {
    items = Array.isArray(nextItems) ? nextItems : [];
    render();
    setActive(0);
  }

  function close() {
    panel.hidden = true;
    items = [];
    activeIndex = -1;
    optionEls = [];
  }

  function moveActive(delta) {
    if (!items.length) return;
    const next = activeIndex === -1
      ? (delta > 0 ? 0 : items.length - 1)
      : (activeIndex + delta + items.length) % items.length;
    setActive(next);
  }

  function pickActive() {
    if (activeIndex >= 0 && items[activeIndex]) onPick(items[activeIndex]);
  }

  function destroy() {
    close();
    if (panel.parentNode) panel.parentNode.removeChild(panel);
  }

  return {
    el: panel,
    open,
    close,
    setItems,
    moveActive,
    pickActive,
    isOpen: () => !panel.hidden,
    destroy,
  };
}
