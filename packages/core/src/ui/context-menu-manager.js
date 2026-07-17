import { MENU_CSS } from './ui-styles.js';
import { injectStyleOnce } from '../utils/inject-style.js';
import { openSubMenu, closeSubMenu, scheduleSubClose } from './context-menu-submenu.js';

const STYLE_ID = 'oe-menu-styles';

function injectStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, MENU_CSS);
}

/**
 * ContextMenuManager — 6.6, 6.7, 6.8, 6.9
 *
 * Usage:
 *   editor.ui.contextMenu.show(x, y, [
 *     { label: 'Cut',  command: 'cut', shortcut: 'Ctrl+X' },
 *     { separator: true },
 *     { label: 'Paste', command: 'paste', disabled: true },
 *     { label: 'Format', submenu: [{ label: 'Bold', command: 'bold' }] },
 *   ]);
 */
export class ContextMenuManager {
  constructor(wrapper, doc, editor) {
    this._wrapper = wrapper;
    this._doc     = doc || (typeof document !== 'undefined' ? document : null);
    this._editor  = editor;
    this._menuEl  = null;
    this._onClickOutside = null;
    this._onKeyDown = null;
    this._subMenuEl = null;
    this._subBridgeEl = null;  // invisible "safe bridge" over the parent↔submenu gap
    this._subOwnerRow = null;  // the row whose submenu is open (for aria cleanup)
    this._activeMenuEl = null; // menu currently receiving keyboard nav (root or submenu)
    this._rowIdCounter = 0;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  show(x, y, items) {
    const doc = this._doc;
    if (!doc || !this._wrapper || !Array.isArray(items)) return;
    injectStyles(doc);
    this.hide();

    this._menuEl = this._buildMenu(items, false);
    this._activeMenuEl = this._menuEl;
    this._wrapper.appendChild(this._menuEl);
    this._reposition(this._menuEl, x, y);

    // L1 fix: move focus to first focusable item on open
    const focusable = this._menuEl._focusable || [];
    if (focusable.length > 0) this._setFocus(focusable, focusable[0]);
    else this._menuEl.focus();

    this._onClickOutside = (e) => {
      // The submenu is a child of the WRAPPER (not _menuEl) so it can flip
      // freely near screen edges — so "inside" means the root menu OR the open
      // submenu. Without this, clicking a submenu item counted as an outside
      // click and tore the menu down before the item's action ran (the toggle
      // appeared to do nothing).
      const t = e.target;
      const inside = (this._menuEl && this._menuEl.contains(t)) ||
                     (this._subMenuEl && this._subMenuEl.contains(t));
      if (this._menuEl && !inside) this.hide();
    };
    this._onKeyDown = (e) => this._handleRootKeyDown(e);
    doc.addEventListener('mousedown', this._onClickOutside, true);
    doc.addEventListener('keydown',   this._onKeyDown,      true);
  }

  hide() {
    const doc = this._doc;
    if (doc) {
      if (this._onClickOutside) doc.removeEventListener('mousedown', this._onClickOutside, true);
      if (this._onKeyDown)      doc.removeEventListener('keydown',   this._onKeyDown,      true);
    }
    this._closeSubMenu();
    if (this._menuEl && this._menuEl.parentNode) this._menuEl.parentNode.removeChild(this._menuEl);
    this._menuEl = null;
    this._activeMenuEl = null;
    this._onClickOutside = null;
    this._onKeyDown = null;
  }

  destroy() {
    this.hide();
    this._wrapper = null;
    this._doc     = null;
    this._editor  = null;
  }

  // ─── Build menu DOM ──────────────────────────────────────────────────────────

  _buildMenu(items, isSub) {
    const doc = this._doc;
    const menu = doc.createElement('div');
    menu.className = 'oe-menu' + (isSub ? ' oe-menu__submenu' : '');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('tabindex', '-1');

    const focusable = [];

    for (const item of items) {
      if (item.separator) {
        const sep = doc.createElement('div');
        sep.className = 'oe-menu__separator';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        continue;
      }

      const row = doc.createElement('div');
      row.className = 'oe-menu__item';
      row.setAttribute('role', 'menuitem');
      row.setAttribute('tabindex', '-1'); // make row programmatically focusable
      row.id = `oe-menu-item-${++this._rowIdCounter}`;
      if (item.disabled) {
        row.classList.add('oe-menu__item--disabled');
        row.setAttribute('aria-disabled', 'true');
      }
      if (item.submenu) row.setAttribute('aria-haspopup', 'true');

      if (item.icon) {
        const icon = doc.createElement('span');
        icon.className = 'oe-menu__item-icon';
        // SECURITY: item.icon is injected as raw HTML (intended for trusted
        // inline SVG markup defined by the integrator). Do NOT pass
        // user/untrusted content here — treat it as a trusted-input contract.
        icon.innerHTML = item.icon;
        row.appendChild(icon);
      }

      const label = doc.createElement('span');
      label.className = 'oe-menu__item-label';
      label.textContent = item.label || '';
      row.appendChild(label);

      if (item.shortcut) {
        const sc = doc.createElement('span');
        sc.className = 'oe-menu__item-shortcut';
        sc.textContent = item.shortcut;
        row.appendChild(sc);
      }

      if (item.submenu) {
        const arrow = doc.createElement('span');
        arrow.className = 'oe-menu__item-arrow';
        arrow.textContent = '▸';
        row.appendChild(arrow);
      }

      // Store original item on row so keyboard nav can retrieve submenu items (B1 fix)
      row._item = item;

      if (!item.disabled) {
        row.addEventListener('click', () => this._activateItem(item));
        row.addEventListener('mouseenter', () => {
          this._setFocus(focusable, row);
          if (item.submenu) {
            // Cancel any pending close and (re)open this row's submenu.
            if (this._subCloseTimer) { clearTimeout(this._subCloseTimer); this._subCloseTimer = null; }
            this._openSubMenu(item.submenu, row);
          } else {
            // Close on a short delay so brief pointer travel over a sibling row
            // on the way INTO the open submenu doesn't snap it shut. Entering the
            // submenu (or its parent) cancels this via the branch above.
            this._scheduleSubClose();
          }
        });
        focusable.push(row);
      }

      menu.appendChild(row);
    }

    menu._focusable = focusable;
    return menu;
  }

  // ─── Keyboard navigation ────────────────────────────────────────────────────

  _handleRootKeyDown(e) {
    // Operate on whichever menu currently holds keyboard nav (root OR submenu),
    // so arrow/Enter keys reach submenu items once a submenu is open.
    const activeMenu = this._activeMenuEl || this._menuEl;
    if (!activeMenu) return;
    const focusable = activeMenu._focusable || [];
    const focused   = activeMenu.querySelector('.oe-menu__item--focused');
    const idx       = focused ? focusable.indexOf(focused) : -1;

    if (e.key === 'Escape') {
      e.preventDefault();
      // B2 fix: if a submenu is open, close only the submenu; don't destroy the whole menu
      if (this._subMenuEl) { this._closeSubMenu(); return; }
      this.hide();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!focusable.length) return;
      const next = focusable[(idx + 1) % focusable.length];
      if (next) this._setFocus(focusable, next);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!focusable.length) return;
      const prev = focusable[(idx - 1 + focusable.length) % focusable.length];
      if (prev) this._setFocus(focusable, prev);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focused) focused.click();
      return;
    }
    if (e.key === 'ArrowRight' && focused) {
      const item = this._itemForRow(focused);
      if (item && item.submenu) {
        e.preventDefault();
        this._openSubMenu(item.submenu, focused);
        // Move keyboard nav into the freshly-opened submenu.
        const subFocusable = this._subMenuEl ? (this._subMenuEl._focusable || []) : [];
        this._activeMenuEl = this._subMenuEl;
        if (subFocusable.length) this._setFocus(subFocusable, subFocusable[0]);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      // Return focus to the parent row in the root menu, then close the submenu.
      // The submenu is now a child of the WRAPPER (so it can flip past screen
      // edges), so its .parentNode is NOT the parent row — use the tracked
      // owner row captured in openSubMenu(). (Regression fix, 2026-07-16.)
      if (this._subMenuEl) {
        const parentRow = this._subOwnerRow;
        this._closeSubMenu();
        this._activeMenuEl = this._menuEl;
        const rootFocusable = this._menuEl ? (this._menuEl._focusable || []) : [];
        if (parentRow && rootFocusable.includes(parentRow)) this._setFocus(rootFocusable, parentRow);
      }
    }
  }

  _setFocus(focusable, row) {
    for (const f of focusable) f.classList.remove('oe-menu__item--focused');
    row.classList.add('oe-menu__item--focused');
    row.focus && row.focus();
    // Expose the active item to assistive tech via aria-activedescendant on the
    // owning menu (rows are tabindex=-1 so DOM focus alone isn't announced).
    const ownerMenu = row.closest('.oe-menu') || this._activeMenuEl || this._menuEl;
    if (ownerMenu && row.id) ownerMenu.setAttribute('aria-activedescendant', row.id);
  }

  // ─── Sub-menu ───────────────────────────────────────────────────────────────

  _scheduleSubClose() { scheduleSubClose(this); }
  _openSubMenu(items, parentRow) { openSubMenu(this, items, parentRow); }
  _closeSubMenu() { closeSubMenu(this); }

  // ─── Activate ───────────────────────────────────────────────────────────────

  _activateItem(item) {
    if (item.submenu) return;
    this.hide();
    if (item.command && this._editor && this._editor.commands) {
      this._editor.commands.execute(item.command);
    } else if (typeof item.action === 'function') {
      item.action();
    }
  }

  _itemForRow(row) {
    return row._item || null;
  }

  // ─── Reposition ─────────────────────────────────────────────────────────────

  _reposition(menu, x, y) {
    menu.style.top  = `${y}px`;
    menu.style.left = `${x}px`;
    const wRect = this._wrapper.getBoundingClientRect();
    const mRect = menu.getBoundingClientRect();
    // L-08 fix: clamp to 0 so the menu never repositions to negative coordinates
    // when x/y are small and the menu is large.
    if (mRect.right  > wRect.right)  menu.style.left = `${Math.max(0, x - (mRect.right  - wRect.right))}px`;
    if (mRect.bottom > wRect.bottom) menu.style.top  = `${Math.max(0, y - (mRect.bottom - wRect.bottom))}px`;
  }
}
