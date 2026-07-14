/**
 * Toolbar dropdown factory (7.3, 7.6, 7.7, 7.8, 7.9).
 *
 * Returns { el, update, destroy }. A dropdown is a trigger button + a panel of
 * options. Supports keyboard nav (ArrowUp/Down, Enter, Escape), closes on
 * outside click, and never renders off the wrapper's right edge.
 *
 * kind: 'heading' | 'fontFamily' | 'lineHeight' (extensible).
 */

import { iconSVG } from './icons.js';
import { t } from './locale.js';
import { HEADING_OPTIONS, DEFAULT_FONTS, DEFAULT_FONT_SIZES, DEFAULT_LINE_HEIGHTS } from './toolbar-config.js';

function _positionPanel(panel, anchor) {
  try {
    const aRect = anchor.getBoundingClientRect();
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 768;
    panel.style.top = ''; panel.style.bottom = '';
    panel.style.left = aRect.left + 'px'; panel.style.right = '';
    const pRect = panel.getBoundingClientRect();
    const pW = pRect.width || panel.offsetWidth || 150;
    const pH = pRect.height || panel.offsetHeight || 200;
    if (aRect.left + pW > vw - 4) {
      panel.style.left = 'auto';
      panel.style.right = Math.max(0, vw - aRect.right) + 'px';
    }
    const spaceBelow = vh - aRect.bottom;
    if (spaceBelow >= pH + 4 || spaceBelow >= vh / 2) {
      panel.style.top = (aRect.bottom + 2) + 'px';
    } else {
      panel.style.bottom = Math.max(0, vh - aRect.top + 2) + 'px';
      panel.style.top = 'auto';
    }
  } catch { /* jsdom / test env — positioning is best-effort */ }
}

function optionsFor(kind, locale, editor) {
  if (kind === 'heading') {
    return HEADING_OPTIONS.map((o) => ({ label: t(locale, o.labelKey), command: o.command, tag: o.tag }));
  }
  if (kind === 'fontFamily') {
    return DEFAULT_FONTS.map((f) => ({ label: f, command: 'fontFamily', arg: f }));
  }
  if (kind === 'fontSize') {
    return DEFAULT_FONT_SIZES.map((s) => ({ label: s, command: 'fontSize', arg: s }));
  }
  if (kind === 'lineHeight') {
    return DEFAULT_LINE_HEIGHTS.map((v) => ({ label: v, command: 'lineHeight', arg: v }));
  }
  if (kind === 'styles') {
    // 17.5.8 — options come from config.styles (the control is skipped
    // entirely when none are configured; see toolbar-manager).
    const styles = (editor && Array.isArray(editor._config.styles)) ? editor._config.styles : [];
    return styles.map((s, i) => ({ label: s.label || `Style ${i + 1}`, command: 'applyStyle', arg: i }));
  }
  if (kind === 'textPartLanguage') {
    // 17.5.10 — options from config.textPartLanguages (control skipped when empty).
    const langs = (editor && Array.isArray(editor._config.textPartLanguages)) ? editor._config.textPartLanguages : [];
    return langs.map((l) => ({ label: l.label || l.code, command: 'textPartLanguage', arg: l.code }));
  }
  if (kind === 'changeCase') {
    // 17.5.1 — free here; CKEditor premium / Jodit PRO both charge for this.
    return [
      { label: t(locale, 'caseUpper'), command: 'changeCase', arg: 'upper' },
      { label: t(locale, 'caseLower'), command: 'changeCase', arg: 'lower' },
      { label: t(locale, 'caseTitle'), command: 'changeCase', arg: 'title' },
    ];
  }
  return [];
}

export function createColorPanel() { /* placeholder to keep file cohesion */ }

export function createDropdown(editor, item, locale, doc, hooks) {
  const wrap = doc.createElement('div');
  wrap.className = 'oe-tb__dd';

  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'oe-tb__btn oe-tb__dd-trigger';
  trigger.setAttribute('tabindex', '-1');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  const label = t(locale, item.labelKey || item.name);
  trigger.setAttribute('aria-label', label);
  trigger.innerHTML = `<span class="oe-tb__dd-label">${label}</span>${iconSVG('chevron')}`;
  wrap.appendChild(trigger);

  const panel = doc.createElement('div');
  panel.className = 'oe-tb__dd-panel';
  // 17.10 — fontSize/lineHeight panels also contain a free-text input row, and
  // role="menu" permits ONLY menuitem* children (axe: aria-required-children,
  // critical). Panels with an input are dialogs; pure option lists stay menus.
  const hasCustomInput = item.kind === 'fontSize' || item.kind === 'lineHeight';
  panel.setAttribute('role', hasCustomInput ? 'dialog' : 'menu');
  panel.setAttribute('aria-label', label);
  panel.hidden = true;
  wrap.appendChild(panel);

  const options = optionsFor(item.kind, locale, editor);
  const optionEls = [];
  for (const opt of options) {
    const o = doc.createElement('button');
    o.type = 'button';
    o.className = 'oe-tb__dd-option';
    // menuitem is only valid INSIDE a menu; in dialog panels they are buttons.
    if (!hasCustomInput) o.setAttribute('role', 'menuitem');
    o.setAttribute('tabindex', '-1');
    o.textContent = opt.label;
    o.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (editor.selection) hooks.savedBookmark = editor.selection.save();
    });
    o.addEventListener('click', () => {
      if (hooks.savedBookmark && editor.selection) {
        editor.selection.restore(hooks.savedBookmark);
        hooks.savedBookmark = null;
      }
      if (editor.commands) {
        if (opt.arg !== undefined) editor.commands.execute(opt.command, opt.arg);
        else editor.commands.execute(opt.command);
      }
      close();
      if (hooks.afterAction) hooks.afterAction();
    });
    panel.appendChild(o);
    optionEls.push({ el: o, opt });
  }

  // ── Custom-value input (fontSize / lineHeight) ───────────────────────────────
  // Lets the user type any value Jodit-style instead of being limited to the
  // preset list. fontSize accepts a bare number (→ px) or a full CSS length
  // (18px, 1.2em, 90%). lineHeight accepts a unitless multiplier or CSS length.
  if (item.kind === 'fontSize' || item.kind === 'lineHeight') {
    const customRow = doc.createElement('div');
    customRow.className = 'oe-tb__dd-custom';

    const input = doc.createElement('input');
    input.type = 'text';
    input.className = 'oe-tb__dd-custom-input';
    input.placeholder = item.kind === 'fontSize' ? 'e.g. 18 or 18px' : 'e.g. 1.6';
    input.setAttribute('aria-label',
      item.kind === 'fontSize' ? 'Custom font size' : 'Custom line height');

    const applyBtn = doc.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'oe-tb__dd-custom-apply';
    applyBtn.textContent = 'OK';
    applyBtn.setAttribute('tabindex', '-1');

    // Normalize a typed value into a safe CSS value for the command.
    function normalizeCustom(raw) {
      const v = (raw || '').trim();
      if (!v) return null;
      if (item.kind === 'fontSize') {
        // Bare number → px. Otherwise accept px/em/rem/%/pt lengths.
        if (/^\d+(\.\d+)?$/.test(v)) return `${v}px`;
        if (/^\d+(\.\d+)?(px|em|rem|%|pt)$/i.test(v)) return v.toLowerCase();
        return null;
      }
      // lineHeight: unitless multiplier or a CSS length.
      if (/^\d+(\.\d+)?$/.test(v)) return v;
      if (/^\d+(\.\d+)?(px|em|rem|%)$/i.test(v)) return v.toLowerCase();
      return null;
    }

    function applyCustom() {
      const value = normalizeCustom(input.value);
      if (!value) { input.focus(); return; }
      if (hooks.savedBookmark && editor.selection) {
        editor.selection.restore(hooks.savedBookmark);
        hooks.savedBookmark = null;
      }
      if (editor.commands) {
        editor.commands.execute(item.kind === 'fontSize' ? 'fontSize' : 'lineHeight', value);
      }
      input.value = '';
      close();
      if (hooks.afterAction) hooks.afterAction();
    }

    // Saving the bookmark on mousedown (before focus leaves the editor) mirrors
    // the option buttons. The input keeps focus for typing, so it does NOT
    // preventDefault — but we still snapshot the selection on first interaction.
    input.addEventListener('mousedown', () => {
      if (editor.selection && !hooks.savedBookmark) hooks.savedBookmark = editor.selection.save();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyCustom(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
    });
    applyBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (editor.selection && !hooks.savedBookmark) hooks.savedBookmark = editor.selection.save();
    });
    applyBtn.addEventListener('click', applyCustom);

    customRow.appendChild(input);
    customRow.appendChild(applyBtn);
    panel.appendChild(customRow);
  }

  function open() {
    // Mount panel on body so it escapes any overflow:auto ancestor (toolbar,
    // iframe wrapper, etc.) — same technique Jodit/Quill use.
    panel.hidden = false;
    panel.style.position = 'fixed';
    panel.style.zIndex = '99999';
    // F5 — panel is <body>-appended (outside the [dir] wrapper); mirror editor dir.
    panel.dir = (editor && editor.getDirection) ? editor.getDirection() : 'ltr';
    doc.body.appendChild(panel);
    trigger.setAttribute('aria-expanded', 'true');
    _positionPanel(panel, trigger);
    doc.addEventListener('mousedown', onOutside, true);
    // Close on scroll/resize — the fixed, once-placed panel would otherwise
    // detach from its trigger. Capture-phase catches scroll in any ancestor.
    doc.addEventListener('scroll', onViewportChange, true);
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) win.addEventListener('resize', onViewportChange);
    const first = optionEls[0] && optionEls[0].el;
    if (first) first.focus();
  }
  function close() {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    wrap.appendChild(panel); // return to DOM tree for next open()
    panel.hidden = true;
    panel.style.position = '';
    panel.style.zIndex = '';
    panel.style.top = ''; panel.style.left = ''; panel.style.right = '';
    trigger.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('mousedown', onOutside, true);
    doc.removeEventListener('scroll', onViewportChange, true);
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win) win.removeEventListener('resize', onViewportChange);
  }
  function onViewportChange() { if (!panel.hidden) close(); }
  // The panel is moved to doc.body in open() so it escapes overflow ancestors,
  // which means it is NO LONGER a descendant of `wrap`. An outside-click check
  // must therefore test BOTH `wrap` (the trigger) AND `panel` (the options) —
  // otherwise clicking any option counts as "outside" and closes the panel
  // before the option's own click handler can run the command.
  function onOutside(e) {
    if (!wrap.contains(e.target) && !panel.contains(e.target)) close();
  }

  trigger.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (editor.selection) hooks.savedBookmark = editor.selection.save();
  });
  trigger.addEventListener('click', () => { panel.hidden ? open() : close(); });

  panel.addEventListener('keydown', (e) => {
    const list = optionEls.map((o) => o.el);
    if (!list.length) return;
    // M-2: when idx === -1 (no item currently focused) ArrowDown should go to
    // first item and ArrowUp should go to last item — not wrap to index -1.
    const idx = list.indexOf(doc.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx === -1 ? list[0] : (list[(idx + 1) % list.length] || list[0]);
      next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx === -1 ? list[list.length - 1] : (list[(idx - 1 + list.length) % list.length] || list[0]);
      prev.focus();
    }
  });

  function update() {
    if (!editor.commands) return;
    const span = trigger.querySelector('.oe-tb__dd-label');
    if (!span) return;

    if (item.kind === 'heading') {
      // Show the active block format (Paragraph / H1 / H2 etc.) in the trigger.
      const active = optionEls.find((o) => o.opt.command && editor.commands.isActive(o.opt.command));
      span.textContent = active ? active.opt.label : t(locale, item.labelKey);
      // Highlight the active option in the panel.
      for (const { el, opt } of optionEls) {
        el.classList.toggle('oe-tb__dd-option--active',
          !!(opt.command && editor.commands.isActive(opt.command)));
      }
      return;
    }

    // For fontFamily / fontSize / lineHeight — read the current value at the
    // cursor and match it against the option list to update the trigger label
    // and highlight the matching option.
    if (item.kind === 'fontFamily' || item.kind === 'fontSize' || item.kind === 'lineHeight') {
      const cmd = editor.commands.get &&
        editor.commands.get(item.kind === 'fontFamily' ? 'fontFamily'
                          : item.kind === 'fontSize'   ? 'fontSize'
                                                       : 'lineHeight');
      const rawVal = (cmd && cmd.getValue) ? cmd.getValue(editor) : '';

      // Normalize: strip quotes, lowercase, trim whitespace for comparison.
      const normalize = (v) => (v || '').toLowerCase().replace(/['"]/g, '').trim();
      const norm = normalize(rawVal);

      let matched = null;
      for (const { el, opt } of optionEls) {
        const isMatch = norm && normalize(opt.arg) === norm;
        el.classList.toggle('oe-tb__dd-option--active', isMatch);
        if (isMatch) matched = opt;
      }
      span.textContent = matched ? matched.label : t(locale, item.labelKey);
    }
  }

  function destroy() {
    // close() first — it removes the doc `scroll` + window `resize` listeners that
    // open() added (destroy() alone would leak them if torn down while open).
    close();
    if (panel.parentNode) panel.parentNode.removeChild(panel);
  }

  // Expose inner trigger so ToolbarManager can put the actual focusable button
  // (not the wrapper div) into the roving-tabindex list (F3).
  function getTrigger() { return trigger; }

  return { el: wrap, update, destroy, item, getTrigger };
}
