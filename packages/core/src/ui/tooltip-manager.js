import { TOOLTIP_CSS } from './ui-styles.js';
import { injectStyleOnce } from '../utils/inject-style.js';

const STYLE_ID = 'oe-tooltip-styles';
const GAP = 8;
let _tipIdCounter = 0;

function injectStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, TOOLTIP_CSS);
}

/**
 * TooltipManager — 6.5, 6.8, 6.9
 *
 * Usage:
 *   editor.ui.tooltip.show(buttonEl, 'Bold (Ctrl+B)');
 *   editor.ui.tooltip.hide();
 */
export class TooltipManager {
  constructor(wrapper, doc) {
    this._wrapper = wrapper;
    this._doc     = doc || (typeof document !== 'undefined' ? document : null);
    this._el      = null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Show a tooltip near targetEl containing text.
   * Positions above/below/left/right, staying within wrapper bounds.
   */
  show(targetEl, text) {
    const doc = this._doc;
    if (!doc || !this._wrapper || !targetEl) return;
    injectStyles(doc);
    this.hide();

    const tip = doc.createElement('div');
    tip.className = 'oe-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    // Render off-screen first to measure
    tip.style.cssText = 'visibility:hidden;position:absolute;top:0;left:0;';
    this._wrapper.appendChild(tip);

    const pos = this._calcPosition(targetEl, tip);
    tip.style.cssText = `position:absolute;top:${pos.top}px;left:${pos.left}px;visibility:visible;`;
    tip.classList.add(`oe-tooltip--${pos.placement}`);

    // aria-describedby on target — APPEND our id to any existing value and
    // remember the prior value so hide() restores it rather than deleting an
    // association the application set itself.
    const id = `oe-tip-${++_tipIdCounter}`;
    tip.id = id;
    const prev = targetEl.getAttribute('aria-describedby');
    this._prevDescribedBy = prev;
    this._tipId = id;
    targetEl.setAttribute('aria-describedby', prev ? `${prev} ${id}` : id);
    this._targetEl = targetEl;

    this._el = tip;
  }

  hide() {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    if (this._targetEl) {
      // Restore the original aria-describedby (remove only our appended id).
      if (this._prevDescribedBy != null && this._prevDescribedBy !== '') {
        this._targetEl.setAttribute('aria-describedby', this._prevDescribedBy);
      } else {
        this._targetEl.removeAttribute('aria-describedby');
      }
      this._targetEl = null;
      this._prevDescribedBy = null;
      this._tipId = null;
    }
    this._el = null;
  }

  destroy() {
    this.hide();
    this._wrapper = null;
    this._doc     = null;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _calcPosition(targetEl, tipEl) {
    const wRect = this._wrapper.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    const tipW  = tipEl.offsetWidth  || 120;
    const tipH  = tipEl.offsetHeight || 28;

    // Target position relative to wrapper
    const relTop    = tRect.top    - wRect.top;
    const relLeft   = tRect.left   - wRect.left;
    const relBottom = tRect.bottom - wRect.top;
    const relRight  = tRect.right  - wRect.left;
    const wW = wRect.width;
    const wH = wRect.height;

    const centreX = relLeft + tRect.width / 2 - tipW / 2;
    const centreY = relTop  + tRect.height / 2 - tipH / 2;

    const fits = {
      above: relTop  - tipH - GAP >= 0,
      below: relBottom + tipH + GAP <= wH,
      left:  relLeft - tipW  - GAP >= 0,
      right: relRight + tipW + GAP <= wW,
    };

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    // M-13: ensure top/left are never negative when wrapper rect is tiny/zero.
    const safeW = Math.max(wW, tipW);
    const safeH = Math.max(wH, tipH);
    if (fits.above) return { top: Math.max(0, relTop - tipH - GAP), left: clamp(centreX, 0, safeW - tipW), placement: 'above' };
    if (fits.below) return { top: Math.max(0, relBottom + GAP),     left: clamp(centreX, 0, safeW - tipW), placement: 'below' };
    if (fits.left)  return { top: clamp(centreY, 0, safeH - tipH), left: Math.max(0, relLeft - tipW - GAP), placement: 'left' };
    if (fits.right) return { top: clamp(centreY, 0, safeH - tipH), left: Math.max(0, relRight + GAP),       placement: 'right' };
    // Default: below, clamped
    return { top: Math.max(0, relBottom + GAP), left: clamp(centreX, 0, safeW - tipW), placement: 'below' };
  }
}
