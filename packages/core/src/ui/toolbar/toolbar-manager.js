/**
 * ToolbarManager (7.1, 7.4, 7.5, 7.11, 7.12, 7.13, 7.14).
 *
 * Renders a toolbar into the editor wrapper from a group config, wires
 * roving-tabindex keyboard navigation, and keeps every control's state in sync
 * with the command manager — throttled via requestAnimationFrame to respect the
 * 16ms frame budget (7.12). Selection preservation on click lives in the Button
 * factory (mousedown-save / click-restore), shared here via a `hooks` object.
 */

import { createButton } from './toolbar-button.js';
import { createDropdown } from './toolbar-dropdown.js';
import { createColorControl } from './color-picker.js';
import { createListStyleControl } from './list-style-picker.js';
import { createAlignmentControl } from './alignment-picker.js';
import { DEFAULT_TOOLBAR } from './toolbar-config.js';
import { injectStyleOnce } from '../../utils/inject-style.js';
import { resolveLocale } from './locale.js';
import { TOOLBAR_CSS } from './toolbar-styles.js';

const STYLE_ID = 'oe-toolbar-styles';

function injectStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, TOOLBAR_CSS);
}

export class ToolbarManager {
  constructor(editor, options = {}) {
    this._editor = editor;
    this._doc = (editor._wrapper && editor._wrapper.ownerDocument) ||
      (typeof document !== 'undefined' ? document : null);
    this._locale = resolveLocale(options.locale != null ? options.locale : editor._config.locale);
    this._config = Array.isArray(options.items) ? options.items : DEFAULT_TOOLBAR;
    this._controls = [];     // [{ el, update, item }]
    this._focusables = [];   // flat list of focusable control elements (roving)
    // H-1 fix: _hooks is now a factory, not a shared object. Each control gets
    // its OWN hooks instance so rapid clicks on different buttons don't clobber
    // each other's savedBookmark.  afterAction is shared (idempotent rAF sync).
    this._afterAction = () => this._scheduleSync();
    this._hooks = null; // unused — kept for reference clarity, see _buildControl
    this._rafId = null;
    this._el = null;
    this._onSync = () => this._scheduleSync();
    this._onKeyNav = (e) => this._handleKeyNav(e);
    this._onReadOnly = (e) => this._applyReadOnly(!!(e && e.readOnly));

    this._build();
    this._bind();
    // Reflect the editor's initial read-only state on the toolbar.
    this._applyReadOnly(!!(editor.isReadOnly && editor.isReadOnly()));
    this._scheduleSync();
  }

  getElement() { return this._el; }

  // ─── Build ────────────────────────────────────────────────────────────────

  _build() {
    const doc = this._doc;
    if (!doc || !this._editor._wrapper) return;
    injectStyles(doc);

    const bar = doc.createElement('div');
    bar.className = 'oe-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Editor toolbar');

    this._config.forEach((group, gi) => {
      if (gi > 0) {
        const sep = doc.createElement('span');
        sep.className = 'oe-toolbar__sep';
        sep.setAttribute('role', 'separator');
        bar.appendChild(sep);
      }
      for (const item of group) {
        const control = this._buildControl(item);
        if (control) {
          this._controls.push(control);
          // Dropdowns and color controls wrap their trigger inside a <div>.
          // Push the actual trigger button (not the wrapper) so roving-tabindex
          // focuses the real interactive element (F3).
          const focusTarget = typeof control.getTrigger === 'function'
            ? control.getTrigger()
            : control.el;
          this._focusables.push(focusTarget);
          bar.appendChild(control.el);
        }
      }
    });

    // Roving tabindex: only the first control is tabbable; arrows move focus.
    if (this._focusables.length) this._focusables[0].setAttribute('tabindex', '0');

    // Mount toolbar at the TOP of the wrapper (before the editor element).
    this._editor._wrapper.insertBefore(bar, this._editor._wrapper.firstChild);
    this._el = bar;
  }

  _buildControl(item) {
    const { _editor: editor, _locale: locale, _doc: doc } = this;
    // H-1 fix: give every control its OWN hooks object so each has an
    // independent savedBookmark slot. Rapid clicks on different buttons no
    // longer clobber each other's pre-click selection bookmark.
    const hooks = { savedBookmark: null, afterAction: this._afterAction };
    if (item.type === 'separator')  return null;
    // 17.5.8 — the styles dropdown only exists when presets are configured.
    if (item.kind === 'styles' && !(Array.isArray(editor._config.styles) && editor._config.styles.length)) return null;
    if (item.kind === 'textPartLanguage' && !(Array.isArray(editor._config.textPartLanguages) && editor._config.textPartLanguages.length)) return null;
    if (item.type === 'dropdown')   return createDropdown(editor, item, locale, doc, hooks);
    if (item.type === 'color')      return createColorControl(editor, item, locale, doc, hooks);
    if (item.type === 'listStyle')  return createListStyleControl(editor, item, locale, doc, hooks);
    if (item.type === 'alignment')  return createAlignmentControl(editor, item, locale, doc, hooks);
    // 'view' action buttons (fullscreen/print) map action → onClick.
    if (item.action === 'fullscreen') {
      return createButton(editor, { ...item, onClick: () => this._editor.toggleFullscreen && this._editor.toggleFullscreen() }, locale, doc, hooks);
    }
    if (item.action === 'print') {
      return createButton(editor, { ...item, onClick: () => this._editor.print && this._editor.print() }, locale, doc, hooks);
    }
    return createButton(editor, item, locale, doc, hooks);
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  _bind() {
    const ed = this._editor;
    ed.on('selectionChange', this._onSync);
    ed.on('afterCommand', this._onSync);
    ed.on('focus', this._onSync);
    ed.on('input', this._onSync);
    ed.on('readOnlyChange', this._onReadOnly);
    if (this._el) this._el.addEventListener('keydown', this._onKeyNav);
  }

  // 2.3 — dim + disable the toolbar when the editor is read-only. Adds the
  // visual class and aria-disabled, and drops every control out of the tab
  // order so a keyboard user can't operate a disabled toolbar.
  _applyReadOnly(ro) {
    if (!this._el) return;
    this._el.classList.toggle('oe-toolbar--disabled', ro);
    this._el.setAttribute('aria-disabled', ro ? 'true' : 'false');
    this._focusables.forEach((b, i) => {
      if (ro) {
        b.setAttribute('tabindex', '-1');
        b.setAttribute('aria-disabled', 'true');
      } else {
        // Restore the roving-tabindex default: only the first control is tabbable.
        b.setAttribute('tabindex', i === 0 ? '0' : '-1');
        b.removeAttribute('aria-disabled');
      }
    });
  }

  _handleKeyNav(e) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const list = this._focusables.filter((b) => !b.disabled);
    if (!list.length) return;
    const current = this._doc.activeElement;
    let idx = list.indexOf(current);
    if (idx === -1) idx = 0;
    e.preventDefault();
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    // Move the single tabbable slot to the focused control.
    this._focusables.forEach((b) => b.setAttribute('tabindex', '-1'));
    list[next].setAttribute('tabindex', '0');
    list[next].focus();
  }

  // ─── State sync (7.12) ──────────────────────────────────────────────────────

  _scheduleSync() {
    if (this._rafId != null) return;
    const raf = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 0);
    this._rafId = raf(() => {
      this._rafId = null;
      this._syncNow();
    });
  }

  _syncNow() {
    if (!this._editor || this._editor.isDestroyed()) return;
    for (const c of this._controls) {
      if (typeof c.update === 'function') c.update();
    }
  }

  // ─── Plugin button API (8.4) ────────────────────────────────────────────────

  /**
   * Add a plugin-contributed button to the toolbar.
   * descriptor follows the same shape as built-in button items (7.15):
   *   { name, type:'button', icon, tooltip, command, onClick?, isActive? }
   */
  addButton(descriptor) {
    if (!this._el || !descriptor || !descriptor.name) return;
    // LOW fix: guard against a duplicate name (two plugins contributing the same
    // button, or a re-install) — otherwise the toolbar grows a second identical
    // button that removeButton() can only ever remove one of.
    if (this._controls.some((c) => c.item && c.item.name === descriptor.name)) {
      this._editor.logger && this._editor.logger.warn(
        `Toolbar.addButton: a button named "${descriptor.name}" already exists — skipping.`
      );
      return;
    }
    const doc = this._doc;
    const hooks = { savedBookmark: null, afterAction: this._afterAction };
    const control = createButton(this._editor, descriptor, this._locale, doc, hooks);
    if (!control) return;
    this._controls.push(control);
    // All plugin buttons share tabindex -1 under roving navigation.
    control.el.setAttribute('tabindex', '-1');
    this._focusables.push(control.el);
    this._el.appendChild(control.el);
    this._scheduleSync();
  }

  /**
   * Remove a plugin-contributed button by its descriptor name.
   */
  removeButton(name) {
    if (!name) return;
    const idx = this._controls.findIndex((c) => c.item && c.item.name === name);
    if (idx === -1) return;
    const control = this._controls[idx];
    this._controls.splice(idx, 1);
    const fi = this._focusables.indexOf(control.el);
    if (fi !== -1) this._focusables.splice(fi, 1);
    if (control.destroy) control.destroy();
    if (control.el && control.el.parentNode) control.el.parentNode.removeChild(control.el);
  }

  // ─── Destroy ────────────────────────────────────────────────────────────────

  destroy() {
    const ed = this._editor;
    if (this._rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    if (ed) {
      ed.off('selectionChange', this._onSync);
      ed.off('afterCommand', this._onSync);
      ed.off('focus', this._onSync);
      ed.off('input', this._onSync);
      ed.off('readOnlyChange', this._onReadOnly);
    }
    if (this._el) {
      this._el.removeEventListener('keydown', this._onKeyNav);
      if (this._el.parentNode) this._el.parentNode.removeChild(this._el);
    }
    for (const c of this._controls) { if (c.destroy) c.destroy(); }
    this._controls = [];
    this._focusables = [];
    this._el = null;
    this._editor = null;
  }
}
