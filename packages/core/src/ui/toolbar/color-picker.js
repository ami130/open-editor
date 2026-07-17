/**
 * Advanced color picker (7.10) — toolbar control. The panel ENGINE (gradient,
 * sliders, inputs, swatches, recents) now lives in color-picker-engine.js and
 * is shared with the bookmark dialog; this file is the toolbar wrapper that
 * binds it to the textColor / backgroundColor commands, positions the popup,
 * seeds from the caret's color, and handles keyboard-open focus trapping.
 *
 * Public API (unchanged): createColorControl(editor, item, locale, doc, hooks)
 * Returns { el, update, destroy, item, getTrigger }
 */

import { iconSVG } from './icons.js';
import { t } from './locale.js';
import { createPickerEngine } from './color-picker-engine.js';
import { findColorAtSelection } from './color-picker-seed.js';
import { trapFocus } from '../focus-trap.js';

const KIND_COMMAND = { textColor: 'textColor', bgColor: 'backgroundColor' };

function positionPanel(panel, anchor) {
  try {
    const ar = anchor.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    panel.style.top = ''; panel.style.bottom = '';
    panel.style.left = ar.left + 'px'; panel.style.right = '';
    const pw = panel.offsetWidth || 260;
    const ph = panel.offsetHeight || 400;
    if (ar.left + pw > vw - 4) {
      panel.style.left = 'auto';
      panel.style.right = Math.max(0, vw - ar.right) + 'px';
    }
    const below = vh - ar.bottom;
    if (below >= ph + 4 || below >= vh / 2) panel.style.top = (ar.bottom + 2) + 'px';
    else { panel.style.bottom = Math.max(0, vh - ar.top + 2) + 'px'; panel.style.top = 'auto'; }
  } catch { /* jsdom */ }
}

export function createColorControl(editor, item, locale, doc, hooks) {
  const command = KIND_COMMAND[item.kind] || 'textColor';
  let trapCleanup = null;
  let openedViaKeyboard = false;

  const wrap = doc.createElement('div');
  wrap.className = 'oe-tb__dd oe-tb__color';
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'oe-tb__btn';
  trigger.setAttribute('tabindex', '-1');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', t(locale, item.labelKey || item.name));
  trigger.innerHTML = item.icon ? iconSVG(item.icon) : t(locale, item.labelKey);
  const strip = doc.createElement('span');
  strip.className = 'oe-tb__color-strip';
  trigger.appendChild(strip);
  wrap.appendChild(trigger);

  const restoreSelection = () => {
    const edEl = editor.getEditorElement && editor.getEditorElement();
    if (edEl) edEl.focus({ preventScroll: true });
    if (hooks.savedBookmark && editor.selection) {
      editor.selection.restore(hooks.savedBookmark); hooks.savedBookmark = null;
    }
  };

  const engine = createPickerEngine(doc, {
    recentKey: item.kind,
    onRequestFocus: restoreSelection,
    onApply: (value) => {
      if (editor.commands) editor.commands.execute(command, value);
      close();
      if (hooks.afterAction) hooks.afterAction();
    },
    onClear: () => {
      restoreSelection();
      if (editor.commands)
        editor.commands.execute(command === 'textColor' ? 'removeTextColor' : 'removeBackgroundColor');
      close();
      if (hooks.afterAction) hooks.afterAction();
    },
  });
  const dom = engine.dom;
  dom.panel.setAttribute('aria-label', t(locale, item.labelKey || item.name));
  wrap.appendChild(dom.panel);

  function open() {
    if (dom.panel.parentNode === doc.body) return;
    dom.panel.hidden = false;
    dom.panel.style.position = 'fixed'; dom.panel.style.zIndex = '99999';
    dom.panel.dir = (editor && editor.getDirection) ? editor.getDirection() : 'ltr';
    doc.body.appendChild(dom.panel);
    trigger.setAttribute('aria-expanded', 'true');
    positionPanel(dom.panel, trigger);
    engine.activate(dom.gradWrap.offsetWidth, dom.gradWrap.offsetHeight);
    const seed = findColorAtSelection(editor, command);
    if (seed) { engine.seedOld(seed.hex); engine.setAlpha(Math.round(seed.alpha * 100)); engine.setHex(seed.hex); }
    doc.addEventListener('mousedown', onOutside, true);
    doc.addEventListener('scroll', onViewportChange, true);
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) win.addEventListener('resize', onViewportChange);
    if (openedViaKeyboard) {
      if (dom.swatchEls[0]) dom.swatchEls[0].focus();
      trapCleanup = trapFocus(dom.panel);
    }
    openedViaKeyboard = false;
  }

  function onViewportChange() { if (dom.panel.parentNode === doc.body) close(); }

  function close() {
    engine.deactivate();
    if (trapCleanup) { trapCleanup(); trapCleanup = null; }
    if (dom.panel.parentNode) dom.panel.parentNode.removeChild(dom.panel);
    wrap.appendChild(dom.panel);
    dom.panel.hidden = true;
    dom.panel.style.position = dom.panel.style.zIndex = '';
    dom.panel.style.top = dom.panel.style.left = dom.panel.style.right = dom.panel.style.bottom = '';
    trigger.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('mousedown', onOutside, true);
    doc.removeEventListener('scroll', onViewportChange, true);
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) win.removeEventListener('resize', onViewportChange);
  }

  function onOutside(e) { if (!wrap.contains(e.target) && !dom.panel.contains(e.target)) close(); }

  trigger.addEventListener('mousedown', (e) => {
    e.preventDefault(); if (editor.selection) hooks.savedBookmark = editor.selection.save();
  });
  trigger.addEventListener('click', () => { dom.panel.hidden ? open() : close(); });
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (editor.selection && !hooks.savedBookmark) hooks.savedBookmark = editor.selection.save();
      openedViaKeyboard = true;
      if (dom.panel.hidden) open(); else if (dom.swatchEls[0]) dom.swatchEls[0].focus();
    }
  });

  dom.panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); return; }
    const active = doc.activeElement;
    if (e.key === 'Enter' && active !== dom.hexInput &&
        !active.classList.contains('oe-cp__rgb-input') &&
        !active.classList.contains('oe-cp__hsl-input')) { e.preventDefault(); engine.commit(); return; }
    engine.navigateSwatchGrid(e, active);
  });

  function update() {
    const cmd = editor.commands && editor.commands.get && editor.commands.get(command);
    const raw = (cmd && cmd.getValue) ? cmd.getValue(editor) : '';
    strip.style.backgroundColor = raw || '';
    trigger.classList.toggle('oe-tb__btn--active', !!raw);
  }
  function destroy() {
    engine.deactivate();
    if (trapCleanup) trapCleanup();
    if (dom.panel.parentNode) dom.panel.parentNode.removeChild(dom.panel);
    doc.removeEventListener('mousedown', onOutside, true);
  }

  return { el: wrap, update, destroy, item, getTrigger: () => trigger };
}
