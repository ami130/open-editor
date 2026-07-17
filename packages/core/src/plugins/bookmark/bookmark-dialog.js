/**
 * bookmark-dialog.js — the insert/edit dialog. Modern layout: a name field,
 * an icon grid, and a COLOR section that mounts the editor's REAL advanced
 * HSV color picker (the same engine as the toolbar text-color control) — so
 * bookmark color looks and behaves exactly like text color, any color pickable.
 */
import { t } from '../../ui/toolbar/locale.js';
import { createPickerEngine } from '../../ui/toolbar/color-picker-engine.js';
import {
  listBookmarks, removeBookmark, applyPresentation, readMarkerColor,
  NAME_RE, HEX_COLOR_RE,
} from './bookmark-core.js';

/** Resolve a preset color KEY (e.g. 'amber') or hex to a concrete hex for the picker seed. */
function toHex(value, colors) {
  if (!value) return null;
  if (HEX_COLOR_RE.test(value)) return value.length === 4
    ? '#' + value.slice(1).split('').map((c) => c + c).join('') : value;
  const preset = (colors || []).find((c) => c.value === value);
  if (preset && preset.css && HEX_COLOR_RE.test(preset.css)) return preset.css;
  return null; // a CSS-var preset (e.g. accent) — no concrete hex to seed
}

/**
 * The theme accent (--oe-primary) as a concrete hex, so a NEW bookmark's
 * picker opens showing the color the marker will actually render with.
 * Handles both hex and rgb() computed values; returns null when unresolvable.
 */
function accentHex(editor) {
  try {
    const el = editor.getEditorElement();
    const win = el.ownerDocument.defaultView;
    if (!win) return null;
    const raw = win.getComputedStyle(el).getPropertyValue('--oe-primary').trim();
    if (HEX_COLOR_RE.test(raw)) return raw.length === 4
      ? '#' + raw.slice(1).split('').map((c) => c + c).join('') : raw;
    const m = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      const h = (n) => Number(n).toString(16).padStart(2, '0');
      return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
    }
    return null;
  } catch { return null; }
}

export async function openBookmarkDialog(editor, existing, opts) {
  if (!editor || editor.isReadOnly()) return;
  const doc = editor.getEditorElement().ownerDocument;
  const { locale, icons, colors, defaultIcon, defaultColor } = opts;

  const body = doc.createElement('div');
  body.className = 'oe-bm-dialog';

  // ── name field ──
  const field = doc.createElement('div');
  field.className = 'oe-bm-dialog__field';
  const label = doc.createElement('label');
  label.className = 'oe-bm-dialog__label';
  label.textContent = t(locale, 'bookmarkName');
  const input = doc.createElement('input');
  input.type = 'text';
  input.className = 'oe-bm-dialog__input';
  input.value = existing ? existing.id : '';
  input.placeholder = 'section-1';
  label.appendChild(input);
  field.appendChild(label);
  const err = doc.createElement('div');
  err.className = 'oe-bm-dialog__error';
  field.appendChild(err);
  body.appendChild(field);

  // ── icon grid ──
  let iconState = existing ? (existing.getAttribute('data-oe-icon') || defaultIcon) : defaultIcon;
  if (icons && icons.length) {
    body.appendChild(buildIconGrid(doc, t(locale, 'bookmarkIcon'), icons, iconState,
      (val) => { iconState = val; }));
  }

  // ── color section: the REAL HSV picker, embedded inline ──
  //
  // Color state model (fixed 2026-07-16 — "color not working"): the picker's
  // drag interactions end with a mouseup on `document` (makeDraggable), so
  // event-level tracking on the panel MISSES drags. Instead:
  //   • `colorDirty` flips on ANY interaction with the panel (pointer/key/input,
  //     capture phase — drag STARTS always happen inside the panel);
  //   • at Save time the picker's live hex is read directly via getHex().
  // No event-timing dependency: what the picker shows is what Save stores.
  let colorState = existing ? (readMarkerColor(existing) || defaultColor) : defaultColor;
  let colorDirty = false;
  let colorCleared = false;
  let colorEngine = null;
  if (colors) {
    const section = doc.createElement('div');
    section.className = 'oe-bm-dialog__field';
    const clbl = doc.createElement('div');
    clbl.className = 'oe-bm-dialog__label';
    clbl.textContent = t(locale, 'bookmarkColor');
    section.appendChild(clbl);

    colorEngine = createPickerEngine(doc, {
      recentKey: 'bookmark',
      onApply: (_value, hex) => { colorState = hex; colorDirty = true; colorCleared = false; },
      onClear: () => { colorState = null; colorDirty = false; colorCleared = true; },
    });
    // Embed the panel inline (not a popup): it lives inside the dialog body.
    const panel = colorEngine.dom.panel;
    panel.hidden = false;
    panel.classList.add('oe-bm-dialog__cp');       // dialog-embedded styling
    panel.setAttribute('role', 'group');
    // Any interaction with the picker marks it dirty (capture: sees children).
    const markDirty = () => { colorDirty = true; colorCleared = false; };
    panel.addEventListener('pointerdown', markDirty, true);
    panel.addEventListener('mousedown', markDirty, true);  // older engines
    panel.addEventListener('keydown', markDirty, true);
    panel.addEventListener('input', markDirty, true);
    section.appendChild(panel);
    body.appendChild(section);
  }

  // Save the caret BEFORE the modal steals focus (insert mode needs it).
  const saved = !existing && editor.selection ? editor.selection.save() : null;

  const buttons = existing
    ? [{ label: t(locale, 'remove'), value: 'remove' },
       { label: t(locale, 'save'), value: 'save', variant: 'primary' }]
    : [{ label: t(locale, 'cancel'), value: null },
       { label: t(locale, 'save'), value: 'save', variant: 'primary' }];

  const validate = () => {
    const v = input.value.trim();
    if (!v) { err.textContent = ''; return false; }
    if (!NAME_RE.test(v)) { err.textContent = t(locale, 'bookmarkNameInvalid'); return false; }
    if (listBookmarks(editor).some((b) => b.id === v && b !== existing)) {
      err.textContent = t(locale, 'bookmarkNameTaken'); return false;
    }
    err.textContent = '';
    return true;
  };
  input.addEventListener('input', validate);

  // Activate the embedded picker after the modal is in the DOM (canvas needs
  // layout), and seed it from the marker's ACTUAL current color — or, for a
  // new bookmark, from the theme accent — so what the picker shows on open is
  // exactly what the marker will look like (WYSIWYG, no misleading red).
  const modalPromise = editor.ui.modal.open({ title: t(locale, 'bookmark'), body, buttons });
  if (colorEngine) {
    colorEngine.activate();
    const seedHex = toHex(colorState, colors) || accentHex(editor);
    if (seedHex) { colorEngine.seedOld(seedHex); colorEngine.setHex(seedHex); }
  }

  const choice = await modalPromise;
  if (colorEngine) colorEngine.deactivate();

  if (choice === 'remove' && existing) { removeBookmark(editor, existing); return; }
  if (choice !== 'save') return;

  const name = input.value.trim();
  if (!validate()) return openBookmarkDialog(editor, existing, opts);

  // The fix: read the picker's LIVE color at save time. Interacted → its
  // current hex wins (drags included); Clear → explicit no-color; untouched →
  // whatever the marker already had (colorState) stays.
  const finalColor = colorCleared ? null
    : (colorEngine && colorDirty ? colorEngine.getHex() : colorState);

  if (existing) {
    existing.id = name;
    applyPresentation(existing, iconState, finalColor);
    if (editor._onChangeFn) editor._onChangeFn();
  } else {
    editor.commands.execute('insertBookmark', { name, icon: iconState, color: finalColor, saved });
  }
}

/** A radio-grid of icon swatches; each previews its glyph via data-glyph. */
function buildIconGrid(doc, labelText, options, current, onPick) {
  const wrap = doc.createElement('div');
  wrap.className = 'oe-bm-dialog__field';
  const lbl = doc.createElement('div');
  lbl.className = 'oe-bm-dialog__label';
  lbl.textContent = labelText;
  wrap.appendChild(lbl);

  const grid = doc.createElement('div');
  grid.className = 'oe-bm-dialog__icons';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', labelText);

  for (const opt of options) {
    const val = typeof opt === 'string' ? opt : opt.value;
    const cell = doc.createElement('button');
    cell.type = 'button';
    cell.className = 'oe-bm-dialog__icon';
    cell.setAttribute('role', 'radio');
    cell.setAttribute('data-value', val);
    cell.setAttribute('data-glyph', (typeof opt === 'object' && opt.glyph) || '');
    cell.setAttribute('aria-checked', String(val === current));
    cell.setAttribute('aria-label', (typeof opt === 'object' && opt.label) || val);
    if (val === current) cell.classList.add('is-active');
    cell.addEventListener('click', () => {
      onPick(val);
      for (const c of grid.children) {
        c.classList.toggle('is-active', c === cell);
        c.setAttribute('aria-checked', String(c === cell));
      }
    });
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  return wrap;
}
