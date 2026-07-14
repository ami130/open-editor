/**
 * context-menu-submenu.js — submenu open/close/close-delay for the
 * ContextMenuManager. Extracted to keep context-menu-manager.js under the
 * 300-line limit. Each function takes the manager instance (`mgr`) and touches
 * only its submenu state: _subMenuEl, _subCloseTimer, _menuEl, _activeMenuEl,
 * _wrapper, and _buildMenu().
 */

/**
 * Close the open submenu on a short delay, so brief pointer travel over a
 * sibling row on the way INTO the submenu doesn't snap it shut. Entering the
 * submenu (or re-entering its parent) cancels the pending close.
 */
export function scheduleSubClose(mgr) {
  if (!mgr._subMenuEl) return;
  if (mgr._subCloseTimer) clearTimeout(mgr._subCloseTimer);
  mgr._subCloseTimer = setTimeout(() => {
    mgr._subCloseTimer = null;
    closeSubMenu(mgr);
  }, 220);
}

export function openSubMenu(mgr, items, parentRow) {
  closeSubMenu(mgr);
  const sub = mgr._buildMenu(items, true);
  parentRow.appendChild(sub);
  mgr._subMenuEl = sub;
  // Entering the submenu cancels a pending close (pointer arrived safely).
  sub.addEventListener('mouseenter', () => {
    if (mgr._subCloseTimer) { clearTimeout(mgr._subCloseTimer); mgr._subCloseTimer = null; }
  });
  parentRow.setAttribute('aria-expanded', 'true');
  // Flip left if the submenu would overflow the wrapper's right edge (measure
  // the real rendered width — the submenu is already in the DOM).
  const wRect = mgr._wrapper.getBoundingClientRect();
  const pRect = parentRow.getBoundingClientRect();
  const subWidth = sub.getBoundingClientRect().width || 160;
  if (pRect.right + subWidth > wRect.right) {
    sub.style.left = 'auto';
    sub.style.right = '100%';
  }
}

export function closeSubMenu(mgr) {
  if (mgr._subCloseTimer) { clearTimeout(mgr._subCloseTimer); mgr._subCloseTimer = null; }
  if (mgr._subMenuEl) {
    const parent = mgr._subMenuEl.parentNode;
    if (parent) {
      parent.removeAttribute('aria-expanded');
      parent.removeChild(mgr._subMenuEl);
    }
    mgr._subMenuEl = null;
  }
  // Keyboard nav reverts to the root menu when the submenu closes.
  mgr._activeMenuEl = mgr._menuEl;
}
