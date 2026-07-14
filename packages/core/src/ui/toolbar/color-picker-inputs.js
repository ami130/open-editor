/**
 * color-picker-inputs.js — wire the hex / RGB / HSL text fields and the mode
 * toggle for the color picker. Extracted from color-picker.js (300-line limit).
 *
 * `api` provides the glue back to the picker's state:
 *   setHsv(hsv) — set state from an {h,s,v} and repaint
 *   syncInputs() — refresh the visible field group
 *   clamp(v,lo,hi)
 *   getMode()/setMode(m)
 */
import { rgbToHsv, hslToHsv } from './color-picker-convert.js';

export function installInputFields(dom, api) {
  dom.rgbWrap.addEventListener('input', (e) => {
    if (!e.target.classList.contains('oe-cp__rgb-input')) return;
    const rgb = {};
    dom.rgbWrap.querySelectorAll('.oe-cp__rgb-input').forEach((i) => {
      rgb[i.dataset.ch] = api.clamp(parseInt(i.value, 10) || 0, 0, 255);
    });
    api.setHsv(rgbToHsv(rgb));
  });

  dom.hslWrap.addEventListener('input', (e) => {
    if (!e.target.classList.contains('oe-cp__hsl-input')) return;
    const hsl = {};
    dom.hslWrap.querySelectorAll('.oe-cp__hsl-input').forEach((i) => {
      hsl[i.dataset.ch] = parseInt(i.value, 10) || 0;
    });
    hsl.s = api.clamp(hsl.s, 0, 100); hsl.l = api.clamp(hsl.l, 0, 100); hsl.h = api.clamp(hsl.h, 0, 360);
    api.setHsv(hslToHsv(hsl));
  });

  dom.modeBtn.addEventListener('click', () => {
    const modes = ['hex', 'rgb', 'hsl'];
    const next = modes[(modes.indexOf(api.getMode()) + 1) % modes.length];
    api.setMode(next);
    dom.hexWrap.classList.toggle('oe-cp__field-group--hidden', next !== 'hex');
    dom.rgbWrap.classList.toggle('oe-cp__field-group--hidden', next !== 'rgb');
    dom.hslWrap.classList.toggle('oe-cp__field-group--hidden', next !== 'hsl');
    api.syncInputs();
  });
}
