/**
 * hr-popover.js — builds the restyle popover UI for the horizontal-rule plugin:
 * an ADVANCED color picker (reusing the shared color-picker engine — the same
 * gradient/HSV/hex/swatches panel the toolbar + bookmark dialog use), a line-
 * style choice, and a CUSTOMIZABLE height/thickness control. Split out of
 * hr-plugin.js to keep both files within the 300-line source limit.
 *
 * The popover calls back into the plugin via `apply({color?,style?,width?})`
 * for every change (the plugin writes the inline border-top style + snapshots).
 */
import { createPickerEngine } from '../../ui/toolbar/color-picker-engine.js';

const LINE_STYLES = ['solid', 'dashed', 'dotted', 'double'];
const HEIGHT_PRESETS = [1, 2, 4, 8];
const HEIGHT_MIN = 1;
const HEIGHT_MAX = 24;

/**
 * Build the popover DOM + wire it. Returns { el, colorEngine, teardown } — the
 * plugin mounts `el`, calls colorEngine.activate() after it's visible, and
 * teardown() on close.
 * @param {Document} doc
 * @param {{color:string, style:string, widthPx:number}} current  seed values
 * @param {(patch:{color?:string,style?:string,width?:string})=>void} apply
 */
export function buildHrPopover(doc, current, apply) {
  const pop = doc.createElement('div');
  pop.className = 'oe-hr-popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Horizontal rule style');
  // Interactions inside must not deselect the rule / move the editor caret.
  pop.addEventListener('mousedown', (ev) => ev.preventDefault());

  // ── Advanced color picker (shared engine) ────────────────────────────────
  const colorRow = doc.createElement('div');
  colorRow.className = 'oe-hr-popover__row';
  const colorLabel = doc.createElement('span');
  colorLabel.className = 'oe-hr-popover__label';
  colorLabel.textContent = 'Color';
  colorRow.appendChild(colorLabel);

  const colorEngine = createPickerEngine(doc, {
    recentKey: 'hrColor',
    onApply: (_value, hex) => apply({ color: hex }),
  });
  const panel = colorEngine.dom.panel;
  panel.hidden = false;                 // shown inline inside the popover
  panel.classList.add('oe-hr-popover__picker');
  colorRow.appendChild(panel);
  pop.appendChild(colorRow);

  // ── Line style ────────────────────────────────────────────────────────────
  const styleRow = doc.createElement('div');
  styleRow.className = 'oe-hr-popover__row';
  const styleLabel = doc.createElement('span');
  styleLabel.className = 'oe-hr-popover__label';
  styleLabel.textContent = 'Style';
  styleRow.appendChild(styleLabel);
  for (const s of LINE_STYLES) {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = 'oe-hr-popover__opt';
    b.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    if (s === current.style) b.classList.add('oe-hr-popover__opt--on');
    b.addEventListener('click', () => {
      apply({ style: s });
      styleRow.querySelectorAll('.oe-hr-popover__opt').forEach((n) => n.classList.remove('oe-hr-popover__opt--on'));
      b.classList.add('oe-hr-popover__opt--on');
    });
    styleRow.appendChild(b);
  }
  pop.appendChild(styleRow);

  // ── Customizable height / thickness (presets + numeric input) ─────────────
  const heightRow = doc.createElement('div');
  heightRow.className = 'oe-hr-popover__row';
  const heightLabel = doc.createElement('span');
  heightLabel.className = 'oe-hr-popover__label';
  heightLabel.textContent = 'Height';
  heightRow.appendChild(heightLabel);

  const num = doc.createElement('input');
  num.type = 'number'; num.className = 'oe-hr-popover__num';
  num.min = String(HEIGHT_MIN); num.max = String(HEIGHT_MAX); num.step = '1';
  num.value = String(current.widthPx);
  num.setAttribute('aria-label', 'Height in pixels');
  const commitHeight = () => {
    let px = parseInt(num.value, 10);
    if (!Number.isFinite(px)) px = current.widthPx;
    px = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, px));
    num.value = String(px);
    apply({ width: `${px}px` });
  };
  num.addEventListener('change', commitHeight);
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitHeight(); } });

  for (const px of HEIGHT_PRESETS) {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = 'oe-hr-popover__opt oe-hr-popover__opt--px';
    b.textContent = `${px}px`;
    b.addEventListener('click', () => { num.value = String(px); apply({ width: `${px}px` }); });
    heightRow.appendChild(b);
  }
  const pxUnit = doc.createElement('span');
  pxUnit.className = 'oe-hr-popover__unit'; pxUnit.textContent = 'px';
  heightRow.appendChild(num);
  heightRow.appendChild(pxUnit);
  pop.appendChild(heightRow);

  function teardown() { try { colorEngine.deactivate(); } catch { /* jsdom */ } }

  return { el: pop, colorEngine, teardown };
}
