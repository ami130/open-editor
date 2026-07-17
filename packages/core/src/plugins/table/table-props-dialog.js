/**
 * table-props-dialog.js — 16.7.5: the two scoped table-property dialogs.
 *
 * Replaces the old flat one-level "Table format" submenu (which had exactly
 * ONE hardcoded cell-border style, `1px solid #334155`, and no table-wide vs
 * per-cell distinction) with two CKEditor-style popups:
 *
 *   openTablePropertiesDialog(editor, table, run)      — whole-table scope
 *   openCellPropertiesDialog(editor, table, cells, run) — selected-cell scope
 *
 * Both compose a real border shorthand from user-chosen width / style / color
 * fields and reuse the existing pure ops in table-format.js (setTableStyle,
 * setCellBorder, setCellBackground, …) — no new DOM-mutation logic here, only
 * the form UI + value composition. `run(fn, name)` is the shared history-
 * snapshot + onChange wrapper passed in from the context menu.
 */
import {
  setTableStyle, setCellBorder, setCellBackground, setCellTextColor,
  setCellAlign, setCellVAlign, setTableStyleClass, getTableStyleState,
  setHeaderColor, setStripeColor,
} from './table-format.js';

const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'];

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** A labeled field row: returns { row, input }. `type` drives the control. */
function field(doc, labelText, type, opts = {}) {
  const row = el(doc, 'div', 'oe-tprops__field');
  const label = el(doc, 'label', 'oe-tprops__label', labelText);
  let input;
  if (type === 'select') {
    input = el(doc, 'select', 'oe-tprops__input');
    for (const o of opts.options) {
      const opt = el(doc, 'option');
      opt.value = o.value; opt.textContent = o.label;
      input.appendChild(opt);
    }
  } else {
    input = el(doc, 'input', 'oe-tprops__input');
    input.type = type;
  }
  if (opts.value != null) input.value = opts.value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  const id = `oe-tprops-${labelText.replace(/\W+/g, '-').toLowerCase()}`;
  input.id = id; label.setAttribute('for', id);
  row.append(label, input);
  return { row, input };
}

/**
 * Compose a CSS border shorthand from width(px)/style/color, or '' to clear.
 * Exported for unit testing — the full dialog flow (modal Promise) is verified
 * end-to-end via Playwright, but this pure value-composition is the part most
 * worth locking in with a fast test.
 */
export function composeBorder(width, style, color) {
  if (style === 'none' || !width) return '';
  const w = /^\d+$/.test(String(width)) ? `${width}px` : String(width);
  return `${w} ${style} ${color || 'currentColor'}`.trim();
}

function buildBorderFields(doc, defaults = {}) {
  const width = field(doc, 'Border width', 'number', { value: defaults.width ?? 1, placeholder: 'px' });
  width.input.min = '0';
  const style = field(doc, 'Border style', 'select', {
    options: BORDER_STYLES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })),
    value: defaults.style ?? 'solid',
  });
  const color = field(doc, 'Border color', 'color', { value: defaults.color ?? '#334155' });
  return { width, style, color };
}

/**
 * Table-wide properties: width, alignment, and a table-grid border applied to
 * the table AND every cell (via setTableStyle's existing border fan-out).
 */
export function openTablePropertiesDialog(editor, table, run) {
  if (!editor.ui || !editor.ui.modal) return;
  const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;
  const form = el(doc, 'div', 'oe-tprops');

  const widthF = field(doc, 'Table width', 'text', { value: table.style.width || '', placeholder: 'e.g. 80% or 400px' });
  const alignF = field(doc, 'Alignment', 'select', {
    options: [
      { value: '', label: 'Default' }, { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' },
    ],
  });

  // ── Built-in style + coloring (13.T) ──
  const st = getTableStyleState(table);
  const styleF = field(doc, 'Style', 'select', {
    options: [
      { value: 'default', label: 'Default' }, { value: 'bordered', label: 'Bordered' },
      { value: 'borderless', label: 'Borderless' },
    ],
    value: st.bordered ? 'bordered' : st.borderless ? 'borderless' : 'default',
  });
  const stripedF = field(doc, 'Striped rows', 'checkbox', { value: '' });
  stripedF.input.checked = st.striped;
  const stripeColorF = field(doc, 'Stripe color', 'color',
    { value: cssColorToHex(readStripe(table)) || '#f1f5f9' });
  // Seed the header color from the table's current <th> background (bug #3), and
  // pre-check "apply" when one exists so reopening + Apply keeps it.
  const seedHeader = readHeaderColor(table);
  const headerBgF = field(doc, 'Header color', 'color', { value: seedHeader || '#e2e8f0' });
  const applyHeader = el(doc, 'input'); applyHeader.type = 'checkbox'; applyHeader.checked = !!seedHeader;
  headerBgF.row.querySelector('label').prepend(applyHeader);

  const border = buildBorderFields(doc);
  form.append(
    widthF.row, alignF.row,
    el(doc, 'div', 'oe-tprops__sep'),
    styleF.row, stripedF.row, stripeColorF.row, headerBgF.row,
    el(doc, 'div', 'oe-tprops__sep'),
    border.width.row, border.style.row, border.color.row,
  );

  editor.ui.modal.open({
    title: 'Table properties',
    body: form,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', value: 'apply', variant: 'primary' }],
  }).then((v) => {
    if (v !== 'apply') return;
    run(() => {
      setTableStyle(table, {
        width: widthF.input.value.trim(),
        align: alignF.input.value,
        border: composeBorder(border.width.input.value, border.style.input.value, border.color.input.value),
      });
      // Border mode (default/bordered/borderless) is a set, not a toggle here.
      setTableStyleClass(table, 'default');
      if (styleF.input.value === 'bordered') setTableStyleClass(table, 'bordered');
      else if (styleF.input.value === 'borderless') setTableStyleClass(table, 'borderless');
      // Striped is a checkbox → sync to the desired state (toggle if mismatched).
      if (stripedF.input.checked !== getTableStyleState(table).striped) setTableStyleClass(table, 'striped');
      if (stripedF.input.checked) setStripeColor(table, stripeColorF.input.value);
      else setStripeColor(table, '');
      if (applyHeader.checked) setHeaderColor(table, headerBgF.input.value);
    }, 'tableProperties');
  });
}

/** Read the table's current stripe color custom property (or ''). */
function readStripe(table) {
  return (table.style.getPropertyValue('--oe-table-stripe') || '').trim();
}

/**
 * Convert a CSS color (hex or rgb()/rgba()) to a 6-digit #hex for seeding an
 * <input type="color">. Returns null when the value is empty/unparseable, so
 * callers fall back to a sensible default without a misleading swatch.
 */
export function cssColorToHex(value) {
  const v = (value || '').trim();
  if (!v) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return '#' + v.slice(1).split('').map((c) => c + c).join('').toLowerCase();
  const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const h = (n) => Math.min(255, Number(n)).toString(16).padStart(2, '0');
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  return null;
}

/** Read the header (first <th>) background as hex, or null if unset. */
function readHeaderColor(table) {
  const th = table.querySelector('th');
  return th ? cssColorToHex(th.style.backgroundColor) : null;
}

/**
 * Cell properties: per-side-or-all border, background, text color, and content
 * alignment — scoped to the passed-in cells (the drag-selection, or the single
 * right-clicked cell).
 */
export function openCellPropertiesDialog(editor, table, cells, run) {
  if (!editor.ui || !editor.ui.modal) return;
  const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;
  const form = el(doc, 'div', 'oe-tprops');

  const sideF = field(doc, 'Border side', 'select', {
    options: [
      { value: 'all', label: 'All sides' }, { value: 'top', label: 'Top' },
      { value: 'right', label: 'Right' }, { value: 'bottom', label: 'Bottom' },
      { value: 'left', label: 'Left' },
    ],
  });
  // Seed from the FIRST target cell so reopening shows what's applied (bug #3).
  const seed = (cells && cells[0]) || null;
  const seedBg = seed ? cssColorToHex(seed.style.backgroundColor) : null;
  const seedFg = seed ? cssColorToHex(seed.style.color) : null;
  const seedHAlign = seed ? (seed.style.textAlign || '') : '';
  const seedVAlign = seed ? (seed.style.verticalAlign || '') : '';

  const border = buildBorderFields(doc);
  const bgF = field(doc, 'Background', 'color', { value: seedBg || '#ffffff' });
  const fgF = field(doc, 'Text color', 'color', { value: seedFg || '#000000' });
  const hAlignF = field(doc, 'Horizontal align', 'select', {
    options: [
      { value: '', label: 'Default' }, { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' },
    ],
    value: seedHAlign,
  });
  const vAlignF = field(doc, 'Vertical align', 'select', {
    options: [
      { value: '', label: 'Default' }, { value: 'top', label: 'Top' },
      { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' },
    ],
    value: seedVAlign,
  });
  // Checkboxes let the user opt in to only the fields they want to change, so
  // the color inputs (which always have SOME value) don't clobber unset cells.
  // Pre-check them when the cell ALREADY has that color, so reopening + Apply
  // preserves the existing design instead of silently wiping it (bug #3).
  const applyBg = el(doc, 'input'); applyBg.type = 'checkbox'; applyBg.checked = !!seedBg;
  const applyFg = el(doc, 'input'); applyFg.type = 'checkbox'; applyFg.checked = !!seedFg;
  bgF.row.querySelector('label').prepend(applyBg);
  fgF.row.querySelector('label').prepend(applyFg);

  form.append(
    sideF.row, border.width.row, border.style.row, border.color.row,
    el(doc, 'div', 'oe-tprops__sep'), bgF.row, fgF.row,
    el(doc, 'div', 'oe-tprops__sep'), hAlignF.row, vAlignF.row,
  );

  editor.ui.modal.open({
    title: 'Cell properties',
    body: form,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', value: 'apply', variant: 'primary' }],
  }).then((v) => {
    if (v !== 'apply') return;
    run(() => {
      setCellBorder(cells, sideF.input.value,
        composeBorder(border.width.input.value, border.style.input.value, border.color.input.value));
      if (applyBg.checked) setCellBackground(cells, bgF.input.value);
      if (applyFg.checked) setCellTextColor(cells, fgF.input.value);
      if (hAlignF.input.value) setCellAlign(cells, hAlignF.input.value);
      if (vAlignF.input.value) setCellVAlign(cells, vAlignF.input.value);
    }, 'cellProperties');
  });
}
