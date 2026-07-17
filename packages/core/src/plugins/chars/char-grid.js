/**
 * char-grid.js — a compact, well-organized pick-from-a-grid UI (13.3/13.4).
 *
 * Pure builder: `buildCharGrid(doc, items, onPick, opts)` returns a DOM Node
 * (never an HTML string — so it uses ModalManager's Node-body path and never
 * touches innerHTML). Used by BOTH Special Characters (13.3) and Emoji (13.4).
 *
 * Layout (2026-07-16, compact revision): a single top row with a category
 * SELECT + a search field, a tight grid of small cells, and a slim one-line
 * footer showing the focused glyph + its name. Narrow overall — no oversized
 * cells, no wrapping pill row.
 *
 * items: [{ ch, label, keywords?, cat? }] — `ch` inserted, `label` tooltip.
 * onPick(ch): called with the chosen character/string.
 * opts.search (default true): filter input.
 * opts.categories: [{ id, label }] category select; each item then needs `cat`.
 * opts.footer (default true): show the focused-glyph info line.
 * opts.searchPlaceholder / opts.emptyText: strings.
 */

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function matches(item, q) {
  if (!q) return true;
  if (item.label && item.label.toLowerCase().includes(q)) return true;
  if (item.ch && item.ch.includes(q)) return true;
  if (item.keywords) {
    for (const k of item.keywords) if (k.toLowerCase().includes(q)) return true;
  }
  return false;
}

const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

export function buildCharGrid(doc, items, onPick, opts = {}) {
  const search = opts.search !== false;
  const cats = Array.isArray(opts.categories) ? opts.categories : null;
  const showFooter = opts.footer !== false;

  const root = el(doc, 'div', 'oe-chargrid');
  let activeCat = cats ? cats[0].id : null;
  let query = '';

  // ── top toolbar: category <select> + search (one tidy row) ──
  const bar = el(doc, 'div', 'oe-chargrid__bar');
  let select = null;
  if (cats) {
    select = el(doc, 'select', 'oe-chargrid__select');
    select.setAttribute('aria-label', 'Category');
    for (const c of cats) {
      const o = el(doc, 'option', null, c.label);
      o.value = c.id;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      activeCat = select.value; query = ''; if (input) input.value = ''; render();
    });
    bar.appendChild(select);
  }

  let input = null;
  if (search) {
    const wrap = el(doc, 'div', 'oe-chargrid__search-wrap');
    const icon = el(doc, 'span', 'oe-chargrid__search-icon');
    icon.innerHTML = SEARCH_ICON;
    input = el(doc, 'input', 'oe-chargrid__search');
    input.type = 'search';
    input.setAttribute('placeholder', opts.searchPlaceholder || 'Search…');
    input.setAttribute('aria-label', opts.searchPlaceholder || 'Search');
    input.addEventListener('input', () => { query = input.value.trim().toLowerCase(); render(); });
    wrap.appendChild(icon);
    wrap.appendChild(input);
    bar.appendChild(wrap);
  }
  if (cats || search) root.appendChild(bar);

  // ── grid (fixed column track sizing → uniform, compact cells) ──
  // ARIA: role="group", NOT role="grid" — grid demands row→gridcell children
  // and 2D arrow navigation (axe: aria-required-children, critical). This is
  // visually a grid but semantically a labeled group of buttons, each already
  // focusable and aria-labelled.
  const grid = el(doc, 'div', 'oe-chargrid__grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', opts.gridLabel || 'Characters');
  root.appendChild(grid);

  // ── slim footer: focused glyph + name ──
  let footGlyph = null, footName = null;
  if (showFooter) {
    const foot = el(doc, 'div', 'oe-chargrid__foot');
    footGlyph = el(doc, 'span', 'oe-chargrid__foot-glyph');
    footName = el(doc, 'span', 'oe-chargrid__foot-name');
    foot.appendChild(footGlyph);
    foot.appendChild(footName);
    root.appendChild(foot);
  }
  function showItem(it) {
    if (!footGlyph) return;
    footGlyph.textContent = it ? it.ch : '';
    footName.textContent = it ? (it.label || it.ch) : '';
  }

  function render() {
    grid.textContent = '';
    // While searching, ignore the active category and search ALL items.
    const visible = items.filter((it) =>
      (!cats || query ? true : it.cat === activeCat) && matches(it, query));
    for (const it of visible) {
      const cell = el(doc, 'button', 'oe-chargrid__cell', it.ch);
      cell.type = 'button';
      cell.title = it.label || it.ch;
      cell.setAttribute('aria-label', it.label || it.ch);
      cell.addEventListener('click', () => onPick(it.ch));
      cell.addEventListener('mouseenter', () => showItem(it));
      cell.addEventListener('focus', () => showItem(it));
      grid.appendChild(cell);
    }
    if (!visible.length) {
      grid.appendChild(el(doc, 'div', 'oe-chargrid__empty', opts.emptyText || 'No matches'));
      showItem(null);
    } else {
      showItem(visible[0]);
    }
  }

  render();
  return { node: root, focus: () => { if (input) input.focus(); } };
}
