/**
 * color-picker-engine.js — the command-FREE core of the advanced color picker
 * (gradient canvas, hue/opacity sliders, HEX/RGB/HSL inputs, live preview,
 * recent colors, preset swatches). Extracted from color-picker.js so BOTH the
 * toolbar text/bg-color control AND the bookmark dialog mount the identical
 * panel. Behaviour is unchanged — the toolbar wrapper wires a command-based
 * onApply; other callers (bookmark) wire their own.
 *
 * Zero dependencies — pure DOM + Canvas 2D.
 */
import {
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, hsvToHsl, clamp,
} from './color-picker-convert.js';
import {
  paintGradient, paintHueSlider, paintOpacitySlider,
  svFromXY, xyFromSV, hueFromX, xFromHue, alphaFromX, xFromAlpha, makeDraggable,
} from './color-picker-canvas.js';
import { buildPickerPanel } from './color-picker-dom.js';
import { navigateSwatchGrid, installSliderKeys, syncSliderAria } from './color-picker-keys.js';
import { installInputFields } from './color-picker-inputs.js';

const RECENT_MAX = 10;
const RECENT_KEY = 'oe-recent-colors-';
const SAFE_HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function loadRecent(kind) {
  try {
    const r = localStorage.getItem(RECENT_KEY + kind);
    const list = r ? JSON.parse(r) : [];
    return Array.isArray(list) ? list.filter((c) => SAFE_HEX_RE.test(c)) : [];
  } catch { return []; }
}
export function saveRecent(kind, hex) {
  try {
    let list = loadRecent(kind).filter((c) => c !== hex);
    list.unshift(hex);
    if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY + kind, JSON.stringify(list));
  } catch { /* storage unavailable */ }
}

/**
 * Build the picker engine over a freshly-built panel DOM.
 *
 * @param {Document} doc
 * @param {object}   opts
 *   recentKey  : string  — namespace for recent-colors storage
 *   onApply    : (hex, alpha) => void   — OK / swatch / Enter commits a color
 *   onClear    : () => void             — Clear button (optional)
 *   onRequestFocus : () => void         — called before apply so callers can
 *                                          refocus/restore selection (optional)
 * @returns { dom, open, close, repaintAll, setHex, seed, destroy, getHex }
 */
export function createPickerEngine(doc, opts) {
  const { recentKey = 'default', onApply, onClear, onRequestFocus } = opts;
  const dom = buildPickerPanel(doc);

  let hsv = { h: 0, s: 1, v: 1 };
  let alpha = 100;
  let mode = 'hex';
  let gradCleanup = null, hueCleanup = null, alphaCleanup = null;

  const currentHex = () => rgbToHex(hsvToRgb(hsv));
  const toRgba = (hex, a) => {
    const rgb = hexToRgb(hex);
    return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${a / 100})` : hex;
  };

  function syncInputs() {
    const hex = currentHex();
    if (mode === 'hex') dom.hexInput.value = hex;
    else if (mode === 'rgb') {
      const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
      dom.rgbWrap.querySelectorAll('.oe-cp__rgb-input').forEach((i) => { i.value = rgb[i.dataset.ch]; });
    } else {
      const hsl = hsvToHsl(hsv);
      dom.hslWrap.querySelectorAll('.oe-cp__hsl-input').forEach((i) => { i.value = hsl[i.dataset.ch]; });
    }
  }

  function repaintAll() {
    paintGradient(dom.gradCanvas, hsv.h);
    const { x, y } = xyFromSV(hsv.s, hsv.v, dom.gradCanvas.width, dom.gradCanvas.height);
    dom.gradHandle.style.left = x + 'px'; dom.gradHandle.style.top = y + 'px';
    dom.hueHandle.style.left = xFromHue(hsv.h, dom.hueCanvas.width) + 'px';
    const hex = currentHex();
    paintOpacitySlider(dom.alphaCanvas, hex);
    dom.alphaHandle.style.left = xFromAlpha(alpha, dom.alphaCanvas.width) + 'px';
    dom.previewNew.style.backgroundColor = toRgba(hex, alpha);
    syncInputs();
  }

  function setHex(hex) {
    const rgb = hexToRgb(hex); if (!rgb) return;
    hsv = rgbToHsv(rgb); repaintAll();
  }
  function setAlpha(a) { alpha = a; }
  function seedOld(hex) { dom.previewOld.style.backgroundColor = hex; }

  function commit() {
    if (onRequestFocus) onRequestFocus();
    const hex = currentHex();
    saveRecent(recentKey, hex);
    if (onApply) onApply(alpha < 100 ? toRgba(hex, alpha) : hex, hex, alpha);
  }

  installSliderKeys(dom, () => ({ hsv, alpha }), (next) => {
    hsv = next.hsv; alpha = next.alpha; repaintAll(); syncSliderAria(dom, hsv, alpha);
  });

  dom.hexInput.addEventListener('input', () => {
    const v = dom.hexInput.value.trim();
    if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) setHex(v.startsWith('#') ? v : '#' + v);
  });
  dom.hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
  });
  installInputFields(dom, {
    clamp, syncInputs,
    setHsv: (v) => { hsv = v; repaintAll(); },
    getMode: () => mode, setMode: (m) => { mode = m; },
  });

  dom.swatchEls.forEach((sw) => {
    const color = sw.getAttribute('aria-label');
    sw.addEventListener('mousedown', (e) => e.preventDefault());
    sw.addEventListener('click', () => { setHex(color); commit(); });
  });

  function renderRecent() {
    dom.recentRow.innerHTML = '';
    const list = loadRecent(recentKey);
    dom.recentSection.style.display = list.length ? '' : 'none';
    list.forEach((c) => {
      const sw = doc.createElement('button');
      sw.type = 'button'; sw.className = 'oe-tb__swatch';
      sw.setAttribute('aria-label', c); sw.style.backgroundColor = c;
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', () => { setHex(c); commit(); });
      dom.recentRow.appendChild(sw);
    });
  }

  dom.clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  dom.clearBtn.addEventListener('click', () => { if (onClear) onClear(); });
  dom.okBtn.addEventListener('mousedown', (e) => e.preventDefault());
  dom.okBtn.addEventListener('click', commit);

  /** Wire the drag handlers + paint. Call when the panel becomes visible. */
  function activate(width, height) {
    dom.gradCanvas.width = width || dom.gradWrap.offsetWidth || 220;
    dom.gradCanvas.height = height || dom.gradWrap.offsetHeight || 150;
    paintHueSlider(dom.hueCanvas);
    repaintAll(); renderRecent();
    gradCleanup  = makeDraggable(dom.gradWrap,  (x, y) => { hsv = { h: hsv.h, ...svFromXY(x, y, dom.gradCanvas.width, dom.gradCanvas.height) }; repaintAll(); });
    hueCleanup   = makeDraggable(dom.hueWrap,   (x) => { hsv = { h: hueFromX(x, dom.hueCanvas.width), s: hsv.s, v: hsv.v }; repaintAll(); });
    alphaCleanup = makeDraggable(dom.alphaWrap, (x) => { alpha = alphaFromX(x, dom.alphaCanvas.width); repaintAll(); });
    syncSliderAria(dom, hsv, alpha);
    [dom.gradWrap, dom.hueWrap, dom.alphaWrap].forEach((w) => w && w.setAttribute('tabindex', '0'));
  }

  function deactivate() {
    if (gradCleanup)  { gradCleanup();  gradCleanup  = null; }
    if (hueCleanup)   { hueCleanup();   hueCleanup   = null; }
    if (alphaCleanup) { alphaCleanup(); alphaCleanup = null; }
    [dom.gradWrap, dom.hueWrap, dom.alphaWrap].forEach((w) => w && w.setAttribute('tabindex', '-1'));
  }

  return {
    dom, repaintAll, setHex, setAlpha, seedOld, commit, renderRecent,
    activate, deactivate, getHex: currentHex, getAlpha: () => alpha,
    navigateSwatchGrid: (e, active) => navigateSwatchGrid(e, dom.swatchEls, active),
  };
}
