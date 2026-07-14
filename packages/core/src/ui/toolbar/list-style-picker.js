/**
 * List-style split button (UL / OL).
 *
 * Main button  → toggles the list on/off.
 * Chevron      → opens a panel of list-style-type options.
 * Style option → creates the list (if not active) AND applies the style in
 *                one atomic call via toggleListWithStyle() — avoids the
 *                "stale selection after toggle" bug.
 */

import { iconSVG } from './icons.js';
import { t } from './locale.js';
import { UL_STYLE_OPTIONS, OL_STYLE_OPTIONS } from './toolbar-config.js';
import { toggleListWithStyle } from '../../commands/list-commands.js';

// ─── Panel positioning (fixed, escapes overflow:auto toolbar) ─────────────────

function _positionPanel(panel, anchor) {
  try {
    const aRect = anchor.getBoundingClientRect();
    const vw = (typeof window !== 'undefined' && window.innerWidth)  || 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 768;
    panel.style.top = ''; panel.style.bottom = '';
    panel.style.left = aRect.left + 'px'; panel.style.right = '';
    const pW = panel.offsetWidth  || 160;
    const pH = panel.offsetHeight || 160;
    if (aRect.left + pW > vw - 4) {
      panel.style.left  = 'auto';
      panel.style.right = Math.max(0, vw - aRect.right) + 'px';
    }
    const below = vh - aRect.bottom;
    if (below >= pH + 4 || below >= vh / 2) {
      panel.style.top = (aRect.bottom + 2) + 'px';
    } else {
      panel.style.bottom = Math.max(0, vh - aRect.top + 2) + 'px';
      panel.style.top    = 'auto';
    }
  } catch { /* test / headless env — ignore */ }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createListStyleControl(editor, item, locale, doc, hooks) {
  const isUL    = item.listTag === 'ul';
  const options = isUL ? UL_STYLE_OPTIONS : OL_STYLE_OPTIONS;
  const label   = t(locale, item.labelKey || item.name);

  // ── Wrapper ────────────────────────────────────────────────────────────────
  const wrap = doc.createElement('div');
  wrap.className = 'oe-tb__dd oe-tb__listsplit';

  // ── Main toggle button ─────────────────────────────────────────────────────
  const mainBtn = doc.createElement('button');
  mainBtn.type  = 'button';
  mainBtn.className = 'oe-tb__btn oe-tb__listsplit-main';
  mainBtn.setAttribute('tabindex', '-1');
  mainBtn.setAttribute('aria-label', label);
  mainBtn.setAttribute('title', label);
  mainBtn.innerHTML = iconSVG(item.icon);

  mainBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (editor.selection) hooks.savedBookmark = editor.selection.save();
  });
  mainBtn.addEventListener('click', () => {
    if (hooks.savedBookmark && editor.selection) {
      editor.selection.restore(hooks.savedBookmark);
      hooks.savedBookmark = null;
    }
    if (editor.commands) editor.commands.execute(item.command);
    if (hooks.afterAction) hooks.afterAction();
  });
  wrap.appendChild(mainBtn);

  // ── Chevron / arrow ────────────────────────────────────────────────────────
  const arrowLabel = label + ' — choose style';
  const arrow = doc.createElement('button');
  arrow.type  = 'button';
  arrow.className = 'oe-tb__btn oe-tb__listsplit-arrow';
  arrow.setAttribute('tabindex', '-1');
  arrow.setAttribute('aria-haspopup', 'true');
  arrow.setAttribute('aria-expanded', 'false');
  arrow.setAttribute('aria-label', arrowLabel);
  arrow.setAttribute('title', arrowLabel);
  arrow.innerHTML = iconSVG('chevron');

  arrow.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (editor.selection) hooks.savedBookmark = editor.selection.save();
  });
  wrap.appendChild(arrow);

  // ── Style panel ────────────────────────────────────────────────────────────
  const panel = doc.createElement('div');
  panel.className = 'oe-tb__dd-panel oe-tb__listsplit-panel';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;
  wrap.appendChild(panel);

  const optionEls = [];
  for (const opt of options) {
    const optLabel = t(locale, opt.labelKey);
    const btn = doc.createElement('button');
    btn.type  = 'button';
    btn.className = 'oe-tb__dd-option';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('title', optLabel);
    btn.textContent = optLabel;

    btn.addEventListener('mousedown', (e) => {
      // Save selection BEFORE the panel click steals focus from the editor.
      e.preventDefault();
      if (editor.selection) hooks.savedBookmark = editor.selection.save();
    });
    btn.addEventListener('click', () => {
      // Restore selection first — editor must have focus for DOM ops to land.
      if (hooks.savedBookmark && editor.selection) {
        editor.selection.restore(hooks.savedBookmark);
        hooks.savedBookmark = null;
      }
      // toggleListWithStyle creates the list if not active, then applies style.
      // This is one atomic operation so listStyleType never sees a stale cursor.
      if (editor.selection) {
        toggleListWithStyle(editor, item.listTag, opt.value);
      }
      close();
      if (hooks.afterAction) hooks.afterAction();
    });

    panel.appendChild(btn);
    optionEls.push(btn);
  }

  // ── Panel open / close ─────────────────────────────────────────────────────

  function open() {
    panel.hidden = false;
    panel.style.position = 'fixed';
    panel.style.zIndex   = '99999';
    panel.dir = (editor && editor.getDirection) ? editor.getDirection() : 'ltr'; // F5 — RTL mirror
    doc.body.appendChild(panel);
    arrow.setAttribute('aria-expanded', 'true');
    _positionPanel(panel, arrow);
    doc.addEventListener('mousedown', onOutside, true);
    doc.addEventListener('scroll', onViewportChange, true); // close on scroll (audit MEDIUM)
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) win.addEventListener('resize', onViewportChange);
    if (optionEls[0]) optionEls[0].focus();
  }

  function close() {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    wrap.appendChild(panel);
    panel.hidden       = true;
    panel.style.position = '';
    panel.style.zIndex   = '';
    panel.style.top = ''; panel.style.left = '';
    panel.style.right = ''; panel.style.bottom = '';
    arrow.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('mousedown', onOutside, true);
    doc.removeEventListener('scroll', onViewportChange, true);
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) win.removeEventListener('resize', onViewportChange);
  }
  function onViewportChange() { if (!panel.hidden) close(); }

  function onOutside(e) { if (!wrap.contains(e.target) && !panel.contains(e.target)) close(); }

  arrow.addEventListener('click', () => { panel.hidden ? open() : close(); });

  // Keyboard access (MEDIUM fix): the chevron is not a Tab stop in the toolbar's
  // roving-tabindex model. WAI-ARIA menu-button pattern — ArrowDown on the main
  // button (or Enter/Space/ArrowDown on the chevron) opens the panel and focuses
  // its first option. Without this the list-style options were unreachable.
  function openViaKeyboard() { if (panel.hidden) open(); else if (optionEls[0]) optionEls[0].focus(); }
  mainBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); openViaKeyboard(); }
  });
  arrow.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViaKeyboard(); }
    else if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); close(); }
  });

  panel.addEventListener('keydown', (e) => {
    const idx = optionEls.indexOf(doc.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); arrow.focus(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx < 0 ? optionEls[0] : optionEls[(idx + 1) % optionEls.length];
      if (next) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx < 0
        ? optionEls[optionEls.length - 1]
        : optionEls[(idx - 1 + optionEls.length) % optionEls.length];
      if (prev) prev.focus();
    }
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function update() {
    if (!editor.commands) return;
    const active = editor.commands.isActive(item.command);
    mainBtn.classList.toggle('oe-tb__btn--active', active);
    mainBtn.setAttribute('aria-pressed', String(active));
  }

  function destroy() {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    doc.removeEventListener('mousedown', onOutside, true);
  }

  function getTrigger() { return mainBtn; }

  return { el: wrap, update, destroy, item, getTrigger };
}
