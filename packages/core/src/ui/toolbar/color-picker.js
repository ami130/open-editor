/**
 * Advanced color picker (7.10) — gradient canvas, hue + opacity sliders,
 * HEX/RGB/HSL inputs, live preview, recent colors, preset swatches.
 * Zero dependencies — pure DOM + Canvas 2D API.
 *
 * Public API (unchanged): createColorControl(editor, item, locale, doc, hooks)
 * Returns { el, update, destroy, item, getTrigger }
 */

import { iconSVG } from './icons.js';
import { t } from './locale.js';
import {
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, hsvToHsl, clamp,
} from './color-picker-convert.js';
import {
  paintGradient, paintHueSlider, paintOpacitySlider,
  svFromXY, xyFromSV, hueFromX, xFromHue, alphaFromX, xFromAlpha, makeDraggable,
} from './color-picker-canvas.js';
import { buildPickerPanel } from './color-picker-dom.js';
import { findColorAtSelection } from './color-picker-seed.js';
import { navigateSwatchGrid, installSliderKeys, syncSliderAria } from './color-picker-keys.js';
import { trapFocus } from '../focus-trap.js';
import { installInputFields } from './color-picker-inputs.js';

const KIND_COMMAND = { textColor: 'textColor', bgColor: 'backgroundColor' };
const RECENT_MAX = 10;
const RECENT_KEY = 'oe-recent-colors-';

function positionPanel(panel, anchor) {
  try {
    const ar = anchor.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    panel.style.top = ''; panel.style.bottom = '';
    panel.style.left = ar.left + 'px'; panel.style.right = '';
    const pw = panel.offsetWidth || 260;
    const ph = panel.offsetHeight || 400;
    if (ar.left + pw > vw - 4) {
      panel.style.left = 'auto';
      panel.style.right = Math.max(0, vw - ar.right) + 'px';
    }
    const below = vh - ar.bottom;
    if (below >= ph + 4 || below >= vh / 2) panel.style.top = (ar.bottom + 2) + 'px';
    else { panel.style.bottom = Math.max(0, vh - ar.top + 2) + 'px'; panel.style.top = 'auto'; }
  } catch { /* jsdom */ }
}

const SAFE_HEX_RE = /^#[0-9a-fA-F]{6}$/;
function loadRecent(kind) {
  try {
    const r = localStorage.getItem(RECENT_KEY + kind);
    const list = r ? JSON.parse(r) : [];
    return Array.isArray(list) ? list.filter((c) => SAFE_HEX_RE.test(c)) : [];
  } catch { return []; }
}
function saveRecent(kind, hex) {
  try {
    let list = loadRecent(kind).filter((c) => c !== hex);
    list.unshift(hex);
    if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY + kind, JSON.stringify(list));
  } catch { /* storage unavailable */ }
}

export function createColorControl(editor, item, locale, doc, hooks) {
  const command = KIND_COMMAND[item.kind] || 'textColor';

  let hsv = { h: 0, s: 1, v: 1 };
  let alpha = 100;
  let mode = 'hex';
  let gradCleanup = null, hueCleanup = null, alphaCleanup = null;
  let trapCleanup = null;        // 14.4/F3 — focus trap while panel is open (keyboard)
  let openedViaKeyboard = false; // 14.4 — only steal focus into the panel for keyboard opens

  const wrap = doc.createElement('div');
  wrap.className = 'oe-tb__dd oe-tb__color';
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'oe-tb__btn';
  trigger.setAttribute('tabindex', '-1');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', t(locale, item.labelKey || item.name));
  trigger.innerHTML = item.icon ? iconSVG(item.icon) : t(locale, item.labelKey);
  const strip = doc.createElement('span');
  strip.className = 'oe-tb__color-strip';
  trigger.appendChild(strip);
  wrap.appendChild(trigger);

  const dom = buildPickerPanel(doc);
  dom.panel.setAttribute('aria-label', t(locale, item.labelKey || item.name));
  wrap.appendChild(dom.panel);

  function currentHex() { return rgbToHex(hsvToRgb(hsv)); }
  function toRgba(hex, a) {
    const rgb = hexToRgb(hex);
    return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${a / 100})` : hex;
  }

  function syncInputs() {
    const hex = currentHex();
    if (mode === 'hex') {
      dom.hexInput.value = hex;
    } else if (mode === 'rgb') {
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

  // 14.4 — arrow-key control of the SV/hue/alpha sliders (same state as drag).
  installSliderKeys(dom, () => ({ hsv, alpha }), (next) => {
    hsv = next.hsv; alpha = next.alpha;
    repaintAll();
    syncSliderAria(dom, hsv, alpha);
  });

  dom.hexInput.addEventListener('input', () => {
    const v = dom.hexInput.value.trim();
    if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v))
      setHex(v.startsWith('#') ? v : '#' + v);
  });
  dom.hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyColor(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
  });
  installInputFields(dom, {
    clamp, syncInputs,
    setHsv: (v) => { hsv = v; repaintAll(); },
    getMode: () => mode, setMode: (m) => { mode = m; },
  });

  dom.swatchEls.forEach((sw) => {
    const color = sw.getAttribute('aria-label');
    // do NOT re-save the bookmark — the valid one was saved on trigger mousedown.
    sw.addEventListener('mousedown', (e) => { e.preventDefault(); });
    sw.addEventListener('click', () => { setHex(color); applyColor(); });
  });

  function renderRecent() {
    dom.recentRow.innerHTML = '';
    const list = loadRecent(item.kind);
    dom.recentSection.style.display = list.length ? '' : 'none';
    list.forEach((c) => {
      const sw = doc.createElement('button');
      sw.type = 'button'; sw.className = 'oe-tb__swatch';
      sw.setAttribute('aria-label', c); sw.style.backgroundColor = c;
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', () => { setHex(c); applyColor(); });
      dom.recentRow.appendChild(sw);
    });
  }

  function applyColor() {
    // Refocus first — restoring into an unfocused contenteditable no-ops in Chrome/Safari.
    const edEl = editor.getEditorElement && editor.getEditorElement();
    if (edEl) edEl.focus({ preventScroll: true });
    if (hooks.savedBookmark && editor.selection) {
      editor.selection.restore(hooks.savedBookmark); hooks.savedBookmark = null;
    }
    const hex = currentHex();
    if (editor.commands) editor.commands.execute(command, alpha < 100 ? toRgba(hex, alpha) : hex);
    saveRecent(item.kind, hex);
    close();
    if (hooks.afterAction) hooks.afterAction();
  }

  dom.clearBtn.addEventListener('mousedown', (e) => { e.preventDefault(); });
  dom.clearBtn.addEventListener('click', () => {
    const edEl = editor.getEditorElement && editor.getEditorElement();
    if (edEl) edEl.focus({ preventScroll: true });
    if (hooks.savedBookmark && editor.selection) {
      editor.selection.restore(hooks.savedBookmark); hooks.savedBookmark = null;
    }
    if (editor.commands)
      editor.commands.execute(command === 'textColor' ? 'removeTextColor' : 'removeBackgroundColor');
    close(); if (hooks.afterAction) hooks.afterAction();
  });
  dom.okBtn.addEventListener('mousedown', (e) => { e.preventDefault(); });
  dom.okBtn.addEventListener('click', applyColor);

  function open() {
    if (dom.panel.parentNode === doc.body) return; // already open — no double-listener
    dom.panel.hidden = false;
    dom.panel.style.position = 'fixed'; dom.panel.style.zIndex = '99999';
    dom.panel.dir = (editor && editor.getDirection) ? editor.getDirection() : 'ltr'; // F5 RTL mirror
    doc.body.appendChild(dom.panel);
    trigger.setAttribute('aria-expanded', 'true');
    positionPanel(dom.panel, trigger);
    dom.gradCanvas.width = dom.gradWrap.offsetWidth || 220;
    dom.gradCanvas.height = dom.gradWrap.offsetHeight || 150;
    paintHueSlider(dom.hueCanvas);
    repaintAll(); renderRecent();
    // Seed the picker from the caret's color (incl. alpha, audit LOW).
    const seed = findColorAtSelection(editor, command);
    if (seed) {
      dom.previewOld.style.backgroundColor = seed.hex;
      alpha = Math.round(seed.alpha * 100);
      setHex(seed.hex);
    }
    gradCleanup  = makeDraggable(dom.gradWrap,  (x, y) => { hsv = { h: hsv.h, ...svFromXY(x, y, dom.gradCanvas.width, dom.gradCanvas.height) }; repaintAll(); });
    hueCleanup   = makeDraggable(dom.hueWrap,   (x)    => { hsv = { h: hueFromX(x, dom.hueCanvas.width), s: hsv.s, v: hsv.v }; repaintAll(); });
    alphaCleanup = makeDraggable(dom.alphaWrap, (x)    => { alpha = alphaFromX(x, dom.alphaCanvas.width); repaintAll(); });
    doc.addEventListener('mousedown', onOutside, true);
    doc.addEventListener('scroll', onViewportChange, true); // close on scroll (audit MEDIUM)
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) win.addEventListener('resize', onViewportChange);
    syncSliderAria(dom, hsv, alpha);
    // Sliders are tab stops only while open (no stray tabbables when closed/RO).
    [dom.gradWrap, dom.hueWrap, dom.alphaWrap].forEach((w) => w && w.setAttribute('tabindex', '0'));
    if (openedViaKeyboard) {
      if (dom.swatchEls[0]) dom.swatchEls[0].focus();
      // F3 — trap Tab within the role=dialog panel so focus can't escape behind it.
      trapCleanup = trapFocus(dom.panel);
    }
    openedViaKeyboard = false;
  }

  function onViewportChange() { if (dom.panel.parentNode === doc.body) close(); }

  function close() {
    if (gradCleanup)  { gradCleanup();  gradCleanup  = null; }
    if (hueCleanup)   { hueCleanup();   hueCleanup   = null; }
    if (alphaCleanup) { alphaCleanup(); alphaCleanup = null; }
    if (trapCleanup)  { trapCleanup();  trapCleanup  = null; }
    [dom.gradWrap, dom.hueWrap, dom.alphaWrap].forEach((w) => w && w.setAttribute('tabindex', '-1'));
    if (dom.panel.parentNode) dom.panel.parentNode.removeChild(dom.panel);
    wrap.appendChild(dom.panel);
    dom.panel.hidden = true;
    dom.panel.style.position = dom.panel.style.zIndex = '';
    dom.panel.style.top = dom.panel.style.left = dom.panel.style.right = dom.panel.style.bottom = '';
    trigger.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('mousedown', onOutside, true);
    doc.removeEventListener('scroll', onViewportChange, true);
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) win.removeEventListener('resize', onViewportChange);
  }

  function onOutside(e) { if (!wrap.contains(e.target) && !dom.panel.contains(e.target)) close(); }

  trigger.addEventListener('mousedown', (e) => {
    e.preventDefault(); if (editor.selection) hooks.savedBookmark = editor.selection.save();
  });
  trigger.addEventListener('click', () => { dom.panel.hidden ? open() : close(); });

  // 14.4 — keyboard open (ArrowDown/Enter/Space): open + focus panel, save bookmark.
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (editor.selection && !hooks.savedBookmark) hooks.savedBookmark = editor.selection.save();
      openedViaKeyboard = true;
      if (dom.panel.hidden) open(); else if (dom.swatchEls[0]) dom.swatchEls[0].focus();
    }
  });

  dom.panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); return; }
    const active = doc.activeElement;
    if (e.key === 'Enter' && active !== dom.hexInput &&
        !active.classList.contains('oe-cp__rgb-input') &&
        !active.classList.contains('oe-cp__hsl-input')) { e.preventDefault(); applyColor(); return; }
    navigateSwatchGrid(e, dom.swatchEls, active);
  });

  function update() {
    const cmd = editor.commands && editor.commands.get && editor.commands.get(command);
    const raw = (cmd && cmd.getValue) ? cmd.getValue(editor) : '';
    strip.style.backgroundColor = raw || '';
    trigger.classList.toggle('oe-tb__btn--active', !!raw);
  }
  function destroy() {
    if (gradCleanup)  gradCleanup();
    if (hueCleanup)   hueCleanup();
    if (alphaCleanup) alphaCleanup();
    if (trapCleanup)  trapCleanup();
    if (dom.panel.parentNode) dom.panel.parentNode.removeChild(dom.panel);
    doc.removeEventListener('mousedown', onOutside, true);
  }

  return { el: wrap, update, destroy, item, getTrigger: () => trigger };
}
