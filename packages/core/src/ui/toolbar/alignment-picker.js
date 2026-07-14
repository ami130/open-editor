/**
 * Alignment split button — main button shows current alignment icon, chevron
 * opens a dropdown with Left / Center / Right / Justify options (Jodit-style).
 *
 * Main button → executes the currently-active alignment command (or alignLeft
 *               when nothing is active yet).
 * Chevron     → opens panel of 4 alignment choices.
 * Option click → executes the chosen alignment and closes the panel.
 */

import { iconSVG } from './icons.js';
import { t } from './locale.js';
import { ALIGNMENT_OPTIONS } from './toolbar-config.js';

// ─── Panel positioning (fixed, escapes overflow:auto toolbar) ─────────────────

function _positionPanel(panel, anchor) {
  try {
    const aRect = anchor.getBoundingClientRect();
    const vw = (typeof window !== 'undefined' && window.innerWidth)  || 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 768;
    panel.style.top = ''; panel.style.bottom = '';
    panel.style.left = aRect.left + 'px'; panel.style.right = '';
    const pW = panel.offsetWidth  || 140;
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
  } catch { /* headless / test env */ }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAlignmentControl(editor, item, locale, doc, hooks) {
  const label = t(locale, item.labelKey || item.name);

  // ── Wrapper ────────────────────────────────────────────────────────────────
  const wrap = doc.createElement('div');
  wrap.className = 'oe-tb__dd oe-tb__alignsplit';

  // ── Main button — shows the active alignment icon ──────────────────────────
  const mainBtn = doc.createElement('button');
  mainBtn.type      = 'button';
  mainBtn.className = 'oe-tb__btn oe-tb__alignsplit-main';
  mainBtn.setAttribute('tabindex', '-1');
  mainBtn.setAttribute('aria-label', label);
  mainBtn.setAttribute('title', label);
  mainBtn.innerHTML = iconSVG('alignLeft'); // default; updated by update()

  mainBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (editor.selection) hooks.savedBookmark = editor.selection.save();
  });
  mainBtn.addEventListener('click', () => {
    if (hooks.savedBookmark && editor.selection) {
      editor.selection.restore(hooks.savedBookmark);
      hooks.savedBookmark = null;
    }
    // Execute the currently-active alignment option (or first = alignLeft)
    const active = _activeOption(editor);
    if (editor.commands) editor.commands.execute(active.command);
    if (hooks.afterAction) hooks.afterAction();
  });
  wrap.appendChild(mainBtn);

  // ── Chevron ────────────────────────────────────────────────────────────────
  const arrowLabel = label + ' — choose alignment';
  const arrow = doc.createElement('button');
  arrow.type      = 'button';
  arrow.className = 'oe-tb__btn oe-tb__alignsplit-arrow';
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

  // ── Panel ──────────────────────────────────────────────────────────────────
  const panel = doc.createElement('div');
  panel.className = 'oe-tb__dd-panel oe-tb__alignsplit-panel';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;
  wrap.appendChild(panel);

  const optionEls = [];
  for (const opt of ALIGNMENT_OPTIONS) {
    const optLabel = t(locale, opt.labelKey);
    const btn = doc.createElement('button');
    btn.type      = 'button';
    btn.className = 'oe-tb__dd-option oe-tb__alignsplit-opt';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('title', optLabel);
    btn.setAttribute('data-command', opt.command);

    // Show icon + label side by side (like Jodit)
    const iconSpan = doc.createElement('span');
    iconSpan.className = 'oe-tb__alignsplit-opt-icon';
    iconSpan.innerHTML = iconSVG(opt.icon);

    const textSpan = doc.createElement('span');
    textSpan.textContent = optLabel;

    btn.appendChild(iconSpan);
    btn.appendChild(textSpan);

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (editor.selection) hooks.savedBookmark = editor.selection.save();
    });
    btn.addEventListener('click', () => {
      if (hooks.savedBookmark && editor.selection) {
        editor.selection.restore(hooks.savedBookmark);
        hooks.savedBookmark = null;
      }
      if (editor.commands) editor.commands.execute(opt.command);
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
    _syncPanelActive();
    if (optionEls[0]) optionEls[0].focus();
  }

  function close() {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    wrap.appendChild(panel);
    panel.hidden         = true;
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

  function onOutside(e) {
    if (!wrap.contains(e.target) && !panel.contains(e.target)) close();
  }

  arrow.addEventListener('click', () => { panel.hidden ? open() : close(); });

  // Keyboard access (MEDIUM fix): the chevron is not a Tab stop in the toolbar's
  // roving-tabindex model — only the main button is. Follow the WAI-ARIA
  // menu-button pattern: ArrowDown/Alt+ArrowDown (and Enter/Space on the chevron
  // itself, reachable via arrow keys once focused) open the panel and move focus
  // into it. Without this the alignment options were keyboard-unreachable.
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

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _activeOption(ed) {
    if (!ed.commands) return ALIGNMENT_OPTIONS[0];
    for (const opt of ALIGNMENT_OPTIONS) {
      if (ed.commands.isActive(opt.command)) return opt;
    }
    return ALIGNMENT_OPTIONS[0]; // default: alignLeft
  }

  function _syncPanelActive() {
    if (!editor.commands) return;
    for (const btn of optionEls) {
      const cmd = btn.getAttribute('data-command');
      const isActive = editor.commands.isActive(cmd);
      btn.classList.toggle('oe-tb__dd-option--active', isActive);
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function update() {
    if (!editor.commands) return;
    const active = _activeOption(editor);
    mainBtn.innerHTML = iconSVG(active.icon);
    // Main button is "active" only when a non-default alignment is set
    const isNonDefault = active.command !== 'alignLeft';
    mainBtn.classList.toggle('oe-tb__btn--active', isNonDefault);
    mainBtn.setAttribute('aria-pressed', String(isNonDefault));
    mainBtn.setAttribute('title', t(locale, active.labelKey));
    mainBtn.setAttribute('aria-label', t(locale, active.labelKey));
    if (!panel.hidden) _syncPanelActive();
  }

  function destroy() {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    doc.removeEventListener('mousedown', onOutside, true);
  }

  function getTrigger() { return mainBtn; }

  return { el: wrap, update, destroy, item, getTrigger };
}
