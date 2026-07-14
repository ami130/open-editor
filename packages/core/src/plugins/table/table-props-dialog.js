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
  setCellAlign, setCellVAlign,
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
  const border = buildBorderFields(doc);
  form.append(widthF.row, alignF.row,
    el(doc, 'div', 'oe-tprops__sep'), border.width.row, border.style.row, border.color.row);

  editor.ui.modal.open({
    title: 'Table properties',
    body: form,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', value: 'apply', variant: 'primary' }],
  }).then((v) => {
    if (v !== 'apply') return;
    run(() => setTableStyle(table, {
      width: widthF.input.value.trim(),
      align: alignF.input.value,
      border: composeBorder(border.width.input.value, border.style.input.value, border.color.input.value),
    }), 'tableProperties');
  });
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
  const border = buildBorderFields(doc);
  const bgF = field(doc, 'Background', 'color', { value: '#ffffff' });
  const fgF = field(doc, 'Text color', 'color', { value: '#000000' });
  const hAlignF = field(doc, 'Horizontal align', 'select', {
    options: [
      { value: '', label: 'Default' }, { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' },
    ],
  });
  const vAlignF = field(doc, 'Vertical align', 'select', {
    options: [
      { value: '', label: 'Default' }, { value: 'top', label: 'Top' },
      { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' },
    ],
  });
  // Checkboxes let the user opt in to only the fields they want to change, so
  // the color inputs (which always have SOME value) don't clobber unset cells.
  const applyBg = el(doc, 'input'); applyBg.type = 'checkbox';
  const applyFg = el(doc, 'input'); applyFg.type = 'checkbox';
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
