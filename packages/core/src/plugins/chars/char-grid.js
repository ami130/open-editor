/**
 * char-grid.js — Phase 13.3/13.4: a reusable pick-from-a-grid UI.
 *
 * Pure builder: `buildCharGrid(doc, items, onPick, opts)` returns a DOM Node
 * (never an HTML string — so it goes into ModalManager's Node-body path and
 * never touches the innerHTML sink). Used by BOTH the Special Characters plugin
 * (13.3) and the Emoji plugin (13.4).
 *
 * items: [{ ch, label, keywords? }]  — `ch` is what gets inserted, `label` is
 *   the tooltip, `keywords` (optional) broadens search matching.
 * onPick(ch): called with the chosen character/string.
 * opts.search (default true): render a filter input that narrows the grid.
 * opts.columns (default 10): grid column count.
 * opts.categories: optional [{ id, label }] tabs; when set, each item must have
 *   a `cat` matching a category id (used by Emoji).
 */

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Does an item match the lowercased query? */
function matches(item, q) {
  if (!q) return true;
  if (item.label && item.label.toLowerCase().includes(q)) return true;
  if (item.ch && item.ch.includes(q)) return true;
  if (item.keywords) {
    for (const k of item.keywords) if (k.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function buildCharGrid(doc, items, onPick, opts = {}) {
  const search = opts.search !== false;
  const columns = opts.columns || 10;
  const cats = Array.isArray(opts.categories) ? opts.categories : null;

  const root = el(doc, 'div', 'oe-chargrid');
  let activeCat = cats ? cats[0].id : null;
  let query = '';

  // ── optional category tabs ──────────────────────────────────────────────────
  let tabEls = [];
  if (cats) {
    const tabs = el(doc, 'div', 'oe-chargrid__tabs');
    tabEls = cats.map((c) => {
      const b = el(doc, 'button', 'oe-chargrid__tab', c.label);
      b.type = 'button';
      b.setAttribute('data-cat', c.id);
      b.addEventListener('click', () => { activeCat = c.id; query = ''; if (input) input.value = ''; render(); });
      tabs.appendChild(b);
      return b;
    });
    root.appendChild(tabs);
  }

  // ── optional search input ────────────────────────────────────────────────────
  let input = null;
  if (search) {
    input = el(doc, 'input', 'oe-chargrid__search');
    input.type = 'search';
    input.setAttribute('placeholder', opts.searchPlaceholder || 'Search…');
    input.addEventListener('input', () => { query = input.value.trim().toLowerCase(); render(); });
    root.appendChild(input);
  }

  // ── the grid ─────────────────────────────────────────────────────────────────
  const grid = el(doc, 'div', 'oe-chargrid__grid');
  grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  root.appendChild(grid);

  function render() {
    grid.textContent = '';
    if (cats) {
      tabEls.forEach((t) => t.classList.toggle('oe-chargrid__tab--on', t.getAttribute('data-cat') === activeCat));
    }
    const visible = items.filter((it) =>
      (!cats || query ? true : it.cat === activeCat) && matches(it, query));
    for (const it of visible) {
      const cell = el(doc, 'button', 'oe-chargrid__cell', it.ch);
      cell.type = 'button';
      cell.title = it.label || it.ch;
      cell.setAttribute('aria-label', it.label || it.ch);
      cell.addEventListener('click', () => onPick(it.ch));
      grid.appendChild(cell);
    }
    if (!visible.length) {
      grid.appendChild(el(doc, 'div', 'oe-chargrid__empty', opts.emptyText || 'No matches'));
    }
  }

  render();
  return { node: root, focus: () => { if (input) input.focus(); } };
}
