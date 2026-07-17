/**
 * context-menu-submenu.js — submenu open/close for the ContextMenuManager.
 * Extracted to keep context-menu-manager.js under the 300-line limit. Each
 * function takes the manager instance (`mgr`) and touches only its submenu
 * state: _subMenuEl, _subCloseTimer, _menuEl, _activeMenuEl, _wrapper, and
 * _buildMenu().
 *
 * Fragile-flyout fix (2026-07-16): moving the pointer diagonally from a parent
 * row toward a submenu item crosses SIBLING rows, each firing a close. Real
 * users lost the submenu before they could click it (Playwright's teleporting
 * cursor never reproduced it). Two defenses, the technique CKEditor/OS menus
 * use:
 *   1. an invisible BRIDGE element spanning the gap between the parent row and
 *      the submenu, so the pointer never enters "dead space" that would close;
 *   2. a longer close delay, cancelled whenever the pointer is over the parent
 *      row, the bridge, or the submenu.
 */

const CLOSE_DELAY_MS = 400;

export function scheduleSubClose(mgr) {
  if (!mgr._subMenuEl) return;
  if (mgr._subCloseTimer) clearTimeout(mgr._subCloseTimer);
  mgr._subCloseTimer = setTimeout(() => {
    mgr._subCloseTimer = null;
    closeSubMenu(mgr);
  }, CLOSE_DELAY_MS);
}

function cancelClose(mgr) {
  if (mgr._subCloseTimer) { clearTimeout(mgr._subCloseTimer); mgr._subCloseTimer = null; }
}

export function openSubMenu(mgr, items, parentRow) {
  closeSubMenu(mgr);
  const sub = mgr._buildMenu(items, true);
  // Append to the WRAPPER (not the row) and position with absolute coordinates
  // relative to the wrapper. A CSS `left:100%; top:-4px` child could never
  // escape the parent menu's position — so when the menu opened low on screen
  // the submenu ran off the bottom with no way to flip up (the "goes to the
  // bottom, can't see it" bug). Positioning against the parent-row RECT lets us
  // flip up/left exactly like the root menu does.
  sub.style.position = 'absolute';
  // Must sit ABOVE the root menu (.oe-menu is z-index 950): on a flip, the
  // submenu overlaps the root menu's column, and a lower z-index would let the
  // root menu paint on top and swallow submenu-item clicks. 960 > 950 > bridge.
  sub.style.zIndex = '960';
  mgr._wrapper.appendChild(sub);
  mgr._subMenuEl = sub;
  mgr._subOwnerRow = parentRow; // tracked so closeSubMenu can clear aria-expanded
  parentRow.setAttribute('aria-expanded', 'true');

  const wRect = mgr._wrapper.getBoundingClientRect();
  const pRect = parentRow.getBoundingClientRect();
  const subRect = sub.getBoundingClientRect();
  const subW = subRect.width || 180;
  const subH = subRect.height || 200;

  // Preferred side follows text direction: LTR opens RIGHT, RTL opens LEFT.
  // Then flip to the other side only if the preferred side would overflow.
  const rtl = !!(mgr._editor && mgr._editor.getDirection && mgr._editor.getDirection() === 'rtl');
  const rightX = pRect.right - wRect.left;               // submenu's left when opening right
  const leftX = (pRect.left - wRect.left) - subW;        // submenu's left when opening left
  const fitsRight = pRect.right + subW <= wRect.right;
  const fitsLeft = pRect.left - subW >= wRect.left;
  let openRight;
  if (rtl) openRight = !fitsLeft && fitsRight;            // prefer left; use right only if left won't fit
  else openRight = fitsRight || !fitsLeft;                // prefer right; use left only if right won't fit
  let left = openRight ? rightX : leftX;
  left = Math.max(0, left);

  // Vertical: align to the row's top; if it would overflow the bottom, shift UP
  // so its bottom sits at the wrapper's bottom (clamped so the top stays ≥ 0).
  let top = pRect.top - wRect.top;
  if (pRect.top + subH > wRect.bottom) {
    top = Math.max(0, (wRect.bottom - wRect.top) - subH);
  }

  sub.style.left = `${left}px`;
  sub.style.top = `${top}px`;

  // ── the "safe corridor": an invisible strip bridging ONLY the horizontal gap
  //    between the parent row's edge and the submenu's near edge, covering the
  //    full vertical span the pointer travels. Sits UNDER the submenu (z-index
  //    0) so it never intercepts a submenu-item click, and is no wider than the
  //    real gap (+small overlap) so it can't blanket the root menu column. ──
  const rowRightX = pRect.right - wRect.left;
  const rowLeftX = pRect.left - wRect.left;
  // The gap is between the row edge on the open side and the submenu's near edge.
  const gapStart = openRight ? rowRightX : Math.min(rowLeftX, left + subW);
  const gapEnd = openRight ? Math.max(rowRightX, left) : rowLeftX;
  const bridgeLeft = Math.max(0, Math.min(gapStart, gapEnd) - 6);
  const bridgeWidth = Math.abs(gapEnd - gapStart) + 12;   // gap + a 6px overlap each side
  const bridge = mgr._wrapper.ownerDocument.createElement('div');
  bridge.className = 'oe-menu__bridge';
  bridge.style.position = 'absolute';
  bridge.style.zIndex = '0';
  const corridorTop = Math.min(pRect.top - wRect.top, top);
  const corridorBottom = Math.max(pRect.bottom - wRect.top, top + subH);
  bridge.style.top = `${corridorTop}px`;
  bridge.style.height = `${corridorBottom - corridorTop}px`;
  bridge.style.left = `${bridgeLeft}px`;
  bridge.style.width = `${bridgeWidth}px`;
  mgr._wrapper.appendChild(bridge);
  mgr._subBridgeEl = bridge;

  // Any of these cancels a pending close; leaving them all schedules one.
  // sub + bridge listeners die with the elements (removed on close). The parent
  // row PERSISTS for the menu's life, so attach its keep-open ONCE (guarded by
  // a flag) to avoid stacking a listener on every re-open of the same submenu.
  const keepOpen = () => cancelClose(mgr);
  sub.addEventListener('mouseenter', keepOpen);
  sub.addEventListener('mousemove', keepOpen);
  bridge.addEventListener('mouseenter', keepOpen);
  bridge.addEventListener('mousemove', keepOpen);
  if (!parentRow._oeKeepOpenBound) {
    parentRow.addEventListener('mouseenter', () => cancelClose(mgr));
    parentRow._oeKeepOpenBound = true;
  }
}

export function closeSubMenu(mgr) {
  cancelClose(mgr);
  if (mgr._subBridgeEl) {
    if (mgr._subBridgeEl.parentNode) mgr._subBridgeEl.parentNode.removeChild(mgr._subBridgeEl);
    mgr._subBridgeEl = null;
  }
  if (mgr._subMenuEl) {
    // The submenu is now a child of the WRAPPER (not the parent row), so clear
    // the row's aria-expanded via the tracked owner row, then detach the menu.
    if (mgr._subOwnerRow) { mgr._subOwnerRow.removeAttribute('aria-expanded'); mgr._subOwnerRow = null; }
    if (mgr._subMenuEl.parentNode) mgr._subMenuEl.parentNode.removeChild(mgr._subMenuEl);
    mgr._subMenuEl = null;
  }
  // Keyboard nav reverts to the root menu when the submenu closes.
  mgr._activeMenuEl = mgr._menuEl;
}
