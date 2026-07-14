/**
 * DOM builder for BlockquoteToolbar. Split out of blockquote-toolbar.js to keep
 * it within the 300-line limit. buildBlockquoteToolbar(self, doc) constructs the
 * toolbar element, wires its buttons to the BlockquoteToolbar instance's
 * methods, assigns the instance fields it needs (_el, _styleBtns, _swatchRow,
 * _colorLabel, _hexInput, _colorSection), and appends it to the editor wrapper.
 */

import { iconSVG } from './icons.js';
import { BQ_STYLES, BLOCKQUOTE_BORDER_COLORS } from './blockquote-toolbar-data.js';

export function buildBlockquoteToolbar(self, doc) {
  const bar = doc.createElement('div');
  bar.className = 'oe-bq-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Blockquote style');
  bar.hidden = true;

  // ── Row 1: style pills ──────────────────────────────────────────────────
  const styleRow = doc.createElement('div');
  styleRow.className = 'oe-bq-toolbar__stylerow';

  for (const def of BQ_STYLES) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'oe-bq-toolbar__stylebtn';
    btn.textContent = def.label;
    btn.setAttribute('title', def.label);
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('data-bq-key', def.key);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => self._applyStyle(def.key));
    styleRow.appendChild(btn);
    self._styleBtns.push({ key: def.key, el: btn });
  }
  bar.appendChild(styleRow);

  // ── Row 2: accent color (always visible) ───────────────────────────────
  const colorSection = doc.createElement('div');
  colorSection.className = 'oe-bq-toolbar__colorsection';

  const colorLabel = doc.createElement('span');
  colorLabel.className = 'oe-bq-toolbar__label';
  colorLabel.textContent = 'Border color:';
  colorSection.appendChild(colorLabel);
  self._colorLabel = colorLabel;

  const swatchRow = doc.createElement('div');
  swatchRow.className = 'oe-bq-toolbar__swatches';
  for (const color of BLOCKQUOTE_BORDER_COLORS) {
    const sw = doc.createElement('button');
    sw.type = 'button';
    sw.className = 'oe-bq-toolbar__swatch';
    sw.style.background = color;
    sw.setAttribute('title', color);
    sw.setAttribute('tabindex', '-1');
    sw.addEventListener('mousedown', (e) => e.preventDefault());
    sw.addEventListener('click', () => self._applyAccent(color));
    swatchRow.appendChild(sw);
  }
  colorSection.appendChild(swatchRow);
  self._swatchRow = swatchRow;

  const customWrap = doc.createElement('div');
  customWrap.className = 'oe-bq-toolbar__custom';

  const hexInput = doc.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'oe-bq-toolbar__hex';
  hexInput.placeholder = '#hex';
  hexInput.maxLength = 9;
  hexInput.setAttribute('aria-label', 'Custom accent color');
  hexInput.addEventListener('mousedown', (e) => e.stopPropagation());
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = hexInput.value.trim();
      if (val) self._applyAccent(val);
    }
  });
  self._hexInput = hexInput;

  const applyBtn = doc.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'oe-bq-toolbar__apply';
  applyBtn.textContent = 'Apply';
  applyBtn.setAttribute('tabindex', '-1');
  applyBtn.addEventListener('mousedown', (e) => e.preventDefault());
  applyBtn.addEventListener('click', () => {
    const val = hexInput.value.trim();
    if (val) self._applyAccent(val);
  });

  customWrap.appendChild(hexInput);
  customWrap.appendChild(applyBtn);
  colorSection.appendChild(customWrap);
  bar.appendChild(colorSection);
  self._colorSection = colorSection;

  // ── Row 3: remove button ────────────────────────────────────────────────
  const bottomRow = doc.createElement('div');
  bottomRow.className = 'oe-bq-toolbar__bottomrow';

  const removeBtn = doc.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'oe-tb__btn oe-bq-toolbar__remove';
  removeBtn.setAttribute('title', 'Remove blockquote');
  removeBtn.setAttribute('aria-label', 'Remove blockquote');
  removeBtn.setAttribute('tabindex', '-1');
  removeBtn.innerHTML = iconSVG('blockquote') + '<span>Remove</span>';
  removeBtn.addEventListener('mousedown', (e) => e.preventDefault());
  removeBtn.addEventListener('click', () => {
    if (self._editor && self._editor.commands) self._editor.commands.execute('blockquote');
    self._hide();
  });
  bottomRow.appendChild(removeBtn);
  bar.appendChild(bottomRow);

  if (self._editor._wrapper) self._editor._wrapper.appendChild(bar);
  self._el = bar;
}
