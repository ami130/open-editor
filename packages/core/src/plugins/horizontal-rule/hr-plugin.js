/**
 * hr-plugin.js — click-to-select a horizontal rule and RESTYLE it (advanced
 * color picker, line style, customizable height) via a popover that sits
 * DIRECTLY BELOW the rule. Purely ADDITIVE: HR insertion stays the built-in
 * `insertHorizontalRule` command + toolbar button (untouched); this plugin only
 * enhances existing decorative <hr> elements.
 *
 *   • mousedown on a decorative <hr> selects it (adds `oe-hr--selected`) and
 *     opens the popover ANCHORED TO THE RULE inside the editable (not the outer
 *     widget), tracking editor scroll; clicking elsewhere / caret move / undo /
 *     redo / setHTML deselects + closes.
 *   • The popover (hr-popover.js) offers the shared advanced color picker, a
 *     line-style choice, and a numeric height control. Choices are written as
 *     INLINE `style` on the <hr> (`border-top: <height> <style> <color>`), which
 *     the sanitizer permits on <hr>, so it round-trips through save/load.
 *   • PAGE BREAKS (`hr.oe-page-break`) are IGNORED — a print marker, not
 *     decorative, so its print behaviour can never be broken by a color.
 *
 * Implements { name, install, destroy }. No new editor events (uses the frozen
 * `afterCommand`). Styles: hr-styles.js. Popover UI: hr-popover.js.
 */
import { injectHrStyles } from './hr-styles.js';
import { buildHrPopover } from './hr-popover.js';

const SELECTED = 'oe-hr--selected';

/** An editable, decorative rule = an <hr> that is NOT a page break. */
function isDecorativeHr(node) {
  return !!node && node.tagName === 'HR' && !node.classList.contains('oe-page-break');
}

export function createHorizontalRulePlugin() {
  return {
    name: 'horizontalRule',
    _editor: null,
    _hr: null,
    _popover: null,
    _teardownPopover: null,

    install(editor) {
      this._editor = editor;
      injectHrStyles(editor);
      // Select on click inside the editor (the editor re-emits DOM mousedown).
      this._onMouseDown = (e) => this._onClick(e);
      editor.on('mousedown', this._onMouseDown);

      // CLOSE on an explicit mousedown OUTSIDE the popover + the rule — a
      // document-level listener (same approach the color-picker uses). This is
      // deterministic and does NOT tie the popover's lifetime to selectionChange,
      // which the browser fires unpredictably (the earlier flaky "opens then
      // vanishes" bug came from closing on the click's own selectionChange).
      this._doc = (editor.getEditorElement && editor.getEditorElement()
        && editor.getEditorElement().ownerDocument) || document;
      this._onDocDown = (e) => this._onOutsideDown(e);

      // Content-replacing ops destroy the selected node → drop the popover.
      this._onReset = () => this._deselect();
      editor.on('undo', this._onReset);
      editor.on('redo', this._onReset);
      editor.on('setHTML', this._onReset);
    },

    destroy() {
      const ed = this._editor;
      if (ed) {
        ed.off('mousedown', this._onMouseDown);
        ed.off('undo', this._onReset);
        ed.off('redo', this._onReset);
        ed.off('setHTML', this._onReset);
      }
      this._deselect();
      this._editor = null;
    },

    _onClick(e) {
      const hr = e.target && e.target.closest ? e.target.closest('hr') : null;
      if (!hr || !isDecorativeHr(hr)) return; // click elsewhere in the editor: the
      // document-level outside-listener handles closing; don't double-handle here.
      e.preventDefault(); // an <hr> can't hold a caret; select it instead
      this._select(hr);
    },

    /** A mousedown anywhere: if it's outside the popover AND not on the selected
     *  rule, close. The popover lives in the wrapper (its own mousedown is
     *  preventDefault-ed), so interactions inside it never reach here as "outside". */
    _onOutsideDown(e) {
      if (!this._hr) return;
      const t = e.target;
      if (this._popover && this._popover.contains(t)) return; // inside the popover
      if (t === this._hr || (t && t.closest && t.closest('hr') === this._hr)) return; // on the rule
      this._deselect();
    },

    _select(hr) {
      if (this._hr === hr) return;
      this._deselect();
      this._hr = hr;
      hr.classList.add(SELECTED);
      this._openPopover(hr);
      // Attach the outside-close listener AFTER this click's own event has passed
      // (capture on the NEXT tick), so the very click that opened it can't close
      // it. Deterministic — no reliance on selectionChange timing.
      const win = this._doc.defaultView || window;
      win.setTimeout(() => {
        if (this._hr === hr) this._doc.addEventListener('mousedown', this._onDocDown, true);
      }, 0);
    },

    _deselect() {
      // Detach the outside-close listener (added on select).
      if (this._doc && this._onDocDown) this._doc.removeEventListener('mousedown', this._onDocDown, true);
      if (this._hr) { this._hr.classList.remove(SELECTED); this._hr = null; }
      this._closePopover();
    },

    _openPopover(hr) {
      const ed = this._editor;
      const wrapper = ed && ed._wrapper;
      if (!wrapper) return;
      const doc = wrapper.ownerDocument || document;

      const built = buildHrPopover(doc, this._read(hr), (patch) => this._apply(hr, patch));
      // Anchor to the WRAPPER (position:relative), NOT inside the editable —
      // getHTML() reads the editable's innerHTML, so a popover in the editable
      // would pollute the saved content. The wrapper floats it over the editable
      // (same pattern as the image/media action bars) without touching content.
      wrapper.appendChild(built.el);
      this._popover = built.el;
      this._teardownPopover = built.teardown;

      // The shared picker engine needs activate() AFTER the panel is in the DOM
      // (it measures the gradient canvas) + seeding from the rule's colour.
      const cur = this._read(hr);
      try {
        built.colorEngine.activate();
        if (cur.color) { built.colorEngine.seedOld(cur.color); built.colorEngine.setHex(cur.color); }
      } catch { /* jsdom has no canvas — engine still builds, just no paint */ }

      this._reposition();
      this._onRepos = () => this._reposition();
      const win = doc.defaultView || window;
      win.addEventListener('resize', this._onRepos);
      // Track editor scroll so the popover stays glued under the rule.
      const editable = ed.getEditorElement && ed.getEditorElement();
      if (editable) { this._scrollEl = editable; editable.addEventListener('scroll', this._onRepos); }
    },

    _closePopover() {
      if (this._teardownPopover) { try { this._teardownPopover(); } catch { /* ignore */ } this._teardownPopover = null; }
      if (this._onRepos) {
        const win = (this._popover && this._popover.ownerDocument && this._popover.ownerDocument.defaultView) || window;
        win.removeEventListener('resize', this._onRepos);
        if (this._scrollEl) this._scrollEl.removeEventListener('scroll', this._onRepos);
        this._onRepos = null; this._scrollEl = null;
      }
      if (this._popover && this._popover.parentNode) this._popover.parentNode.removeChild(this._popover);
      this._popover = null;
    },

    /** Position the popover DIRECTLY BELOW the rule (anchored to the wrapper). */
    _reposition() {
      const pop = this._popover; const hr = this._hr;
      const wrapper = this._editor && this._editor._wrapper;
      if (!pop || !hr || !wrapper) return;
      // Compute the rule's position RELATIVE TO THE WRAPPER via rects, so the
      // popover sits right under the rule regardless of toolbar height / scroll.
      let r, wRect;
      try { r = hr.getBoundingClientRect(); wRect = wrapper.getBoundingClientRect(); }
      catch { return; } // jsdom: no layout — leave unpositioned (tests assert DOM, not px)
      const top = (r.bottom - wRect.top) + 6;
      let left = r.left - wRect.left;
      const maxLeft = Math.max(0, wrapper.clientWidth - pop.offsetWidth - 8);
      if (left > maxLeft) left = maxLeft;
      if (left < 0) left = 0;
      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
    },

    /** Apply one border-top property, preserving the others; snapshot + signal. */
    _apply(hr, { color, style, width }) {
      const cur = this._read(hr);
      const next = { color: color || cur.color, style: style || cur.style, width: width || `${cur.widthPx}px` };
      hr.style.borderTop = `${next.width} ${next.style} ${next.color}`;
      hr.style.borderBottom = 'none';
      hr.style.borderLeft = 'none';
      hr.style.borderRight = 'none';
      const ed = this._editor;
      if (ed) {
        ed.history && ed.history.takeSnapshot && ed.history.takeSnapshot();
        ed.emit('afterCommand', { command: 'hrStyle', args: [next] });
      }
      this._reposition(); // a thicker rule shifts the anchor
    },

    /** Read the rule's current border-top into {color, style, widthPx}. */
    _read(hr) {
      const win = (hr.ownerDocument && hr.ownerDocument.defaultView) || window;
      let cs = {};
      try { cs = win.getComputedStyle(hr); } catch { /* jsdom */ }
      const width = hr.style.borderTopWidth || cs.borderTopWidth || '2px';
      const widthPx = Math.max(1, parseInt(width, 10) || 2);
      return {
        color: hr.style.borderTopColor || cs.borderTopColor || '#9ca3af',
        style: (hr.style.borderTopStyle && hr.style.borderTopStyle !== 'none') ? hr.style.borderTopStyle : 'solid',
        widthPx,
      };
    },
  };
}

export const horizontalRulePlugin = createHorizontalRulePlugin();
