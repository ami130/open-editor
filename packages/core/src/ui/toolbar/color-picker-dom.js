/**
 * DOM builder for the advanced color picker panel.
 * Called once by createColorControl; returns refs to every interactive element.
 * No event listeners wired here — that lives in color-picker.js.
 */

import { DEFAULT_SWATCHES } from './toolbar-config.js';

export function buildPickerPanel(doc) {
  const panel = doc.createElement('div');
  panel.className = 'oe-tb__dd-panel oe-tb__color-panel oe-cp';
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;

  // ─── Gradient canvas ────────────────────────────────────────────────────
  const gradWrap = doc.createElement('div');
  gradWrap.className = 'oe-cp__grad-wrap';
  // 14.4 — keyboard-operable 2D slider: arrows move saturation/value.
  gradWrap.setAttribute('role', 'slider');
  gradWrap.setAttribute('tabindex', '-1'); // promoted to 0 while the panel is open
  gradWrap.setAttribute('aria-label', 'Saturation and brightness');
  const gradCanvas = doc.createElement('canvas');
  gradCanvas.className = 'oe-cp__grad';
  gradCanvas.width = 220; gradCanvas.height = 150;
  const gradHandle = doc.createElement('div');
  gradHandle.className = 'oe-cp__grad-handle';
  gradWrap.appendChild(gradCanvas);
  gradWrap.appendChild(gradHandle);
  panel.appendChild(gradWrap);

  // ─── Sliders row ────────────────────────────────────────────────────────
  const slidersRow = doc.createElement('div');
  slidersRow.className = 'oe-cp__sliders';
  const preview = doc.createElement('div');
  preview.className = 'oe-cp__preview';
  const previewOld = doc.createElement('div');
  previewOld.className = 'oe-cp__preview-old';
  const previewNew = doc.createElement('div');
  previewNew.className = 'oe-cp__preview-new';
  preview.appendChild(previewOld);
  preview.appendChild(previewNew);

  const sliderCols = doc.createElement('div');
  sliderCols.className = 'oe-cp__slider-cols';

  const hueWrap = doc.createElement('div');
  hueWrap.className = 'oe-cp__slider-wrap';
  hueWrap.setAttribute('role', 'slider');
  hueWrap.setAttribute('tabindex', '-1'); // promoted to 0 while the panel is open
  hueWrap.setAttribute('aria-label', 'Hue');
  hueWrap.setAttribute('aria-valuemin', '0');
  hueWrap.setAttribute('aria-valuemax', '360');
  const hueCanvas = doc.createElement('canvas');
  hueCanvas.className = 'oe-cp__slider-canvas';
  hueCanvas.width = 180; hueCanvas.height = 12;
  const hueHandle = doc.createElement('div');
  hueHandle.className = 'oe-cp__slider-handle';
  hueWrap.appendChild(hueCanvas);
  hueWrap.appendChild(hueHandle);

  const alphaWrap = doc.createElement('div');
  alphaWrap.className = 'oe-cp__slider-wrap';
  alphaWrap.setAttribute('role', 'slider');
  alphaWrap.setAttribute('tabindex', '-1'); // promoted to 0 while the panel is open
  alphaWrap.setAttribute('aria-label', 'Opacity');
  alphaWrap.setAttribute('aria-valuemin', '0');
  alphaWrap.setAttribute('aria-valuemax', '100');
  const alphaCanvas = doc.createElement('canvas');
  alphaCanvas.className = 'oe-cp__slider-canvas';
  alphaCanvas.width = 180; alphaCanvas.height = 12;
  const alphaHandle = doc.createElement('div');
  alphaHandle.className = 'oe-cp__slider-handle';
  alphaWrap.appendChild(alphaCanvas);
  alphaWrap.appendChild(alphaHandle);

  sliderCols.appendChild(hueWrap);
  sliderCols.appendChild(alphaWrap);
  slidersRow.appendChild(preview);
  slidersRow.appendChild(sliderCols);
  panel.appendChild(slidersRow);

  // ─── Input fields ────────────────────────────────────────────────────────
  const inputRow = doc.createElement('div');
  inputRow.className = 'oe-cp__inputs';

  const modeBtn = doc.createElement('button');
  modeBtn.type = 'button';
  modeBtn.className = 'oe-cp__mode-btn';
  modeBtn.setAttribute('aria-label', 'Switch color mode');
  modeBtn.textContent = '⇄';

  const hexWrap = doc.createElement('div');
  hexWrap.className = 'oe-cp__field-group';
  const hexInput = doc.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'oe-cp__hex-input';
  hexInput.setAttribute('aria-label', 'Hex color');
  hexInput.maxLength = 7;
  const hexLbl = doc.createElement('label');
  hexLbl.className = 'oe-cp__field-label';
  hexLbl.textContent = 'HEX';
  hexWrap.appendChild(hexInput);
  hexWrap.appendChild(hexLbl);

  const rgbWrap = doc.createElement('div');
  rgbWrap.className = 'oe-cp__field-group oe-cp__field-group--hidden';
  ['R', 'G', 'B'].forEach((ch) => {
    const inp = doc.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.max = '255';
    inp.className = 'oe-cp__rgb-input';
    inp.setAttribute('aria-label', ch);
    inp.dataset.ch = ch.toLowerCase();
    const lbl = doc.createElement('label');
    lbl.className = 'oe-cp__field-label'; lbl.textContent = ch;
    const fg = doc.createElement('div');
    fg.className = 'oe-cp__field';
    fg.appendChild(inp); fg.appendChild(lbl);
    rgbWrap.appendChild(fg);
  });

  const hslWrap = doc.createElement('div');
  hslWrap.className = 'oe-cp__field-group oe-cp__field-group--hidden';
  [['H', 0, 360], ['S', 0, 100], ['L', 0, 100]].forEach(([ch, mn, mx]) => {
    const inp = doc.createElement('input');
    inp.type = 'number'; inp.min = String(mn); inp.max = String(mx);
    inp.className = 'oe-cp__hsl-input';
    inp.setAttribute('aria-label', ch);
    inp.dataset.ch = ch.toLowerCase();
    const lbl = doc.createElement('label');
    lbl.className = 'oe-cp__field-label'; lbl.textContent = ch;
    const fg = doc.createElement('div');
    fg.className = 'oe-cp__field';
    fg.appendChild(inp); fg.appendChild(lbl);
    hslWrap.appendChild(fg);
  });

  inputRow.appendChild(hexWrap);
  inputRow.appendChild(rgbWrap);
  inputRow.appendChild(hslWrap);
  inputRow.appendChild(modeBtn);
  panel.appendChild(inputRow);

  // ─── Recent colors ───────────────────────────────────────────────────────
  const recentSection = doc.createElement('div');
  recentSection.className = 'oe-cp__section';
  const recentLbl = doc.createElement('div');
  recentLbl.className = 'oe-cp__section-label';
  recentLbl.textContent = 'Recent';
  const recentRow = doc.createElement('div');
  recentRow.className = 'oe-cp__recent-row';
  recentSection.appendChild(recentLbl);
  recentSection.appendChild(recentRow);
  panel.appendChild(recentSection);

  // ─── Preset swatches ─────────────────────────────────────────────────────
  const presetSection = doc.createElement('div');
  presetSection.className = 'oe-cp__section';
  const presetLbl = doc.createElement('div');
  presetLbl.className = 'oe-cp__section-label';
  presetLbl.textContent = 'Colors';
  const grid = doc.createElement('div');
  grid.className = 'oe-tb__color-grid';
  // LOW a11y fix: a color grid is a single-select listbox, not a menu. role=
  // menuitem was invalid inside the role=dialog panel. Use listbox/option.
  grid.setAttribute('role', 'listbox');
  grid.setAttribute('aria-label', 'Preset colors');
  const swatchEls = [];
  for (const color of DEFAULT_SWATCHES) {
    const sw = doc.createElement('button');
    sw.type = 'button';
    sw.className = 'oe-tb__swatch';
    sw.setAttribute('role', 'option');
    sw.setAttribute('tabindex', '-1');
    sw.setAttribute('aria-label', color);
    sw.style.backgroundColor = color;
    grid.appendChild(sw);
    swatchEls.push(sw);
  }
  presetSection.appendChild(presetLbl);
  presetSection.appendChild(grid);
  panel.appendChild(presetSection);

  // ─── Footer ──────────────────────────────────────────────────────────────
  const footer = doc.createElement('div');
  footer.className = 'oe-cp__footer';
  const clearBtn = doc.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'oe-cp__clear-btn';
  clearBtn.textContent = 'Clear';
  const okBtn = doc.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'oe-cp__ok-btn';
  okBtn.textContent = 'OK';
  footer.appendChild(clearBtn);
  footer.appendChild(okBtn);
  panel.appendChild(footer);

  return {
    panel,
    gradWrap, gradCanvas, gradHandle,
    previewOld, previewNew,
    hueWrap, hueCanvas, hueHandle,
    alphaWrap, alphaCanvas, alphaHandle,
    hexWrap, hexInput,
    rgbWrap, hslWrap,
    modeBtn,
    recentSection, recentRow,
    swatchEls,
    clearBtn, okBtn,
  };
}
