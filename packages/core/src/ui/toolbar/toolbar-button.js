/**
 * Toolbar button factory (7.2 / 7.5 / 7.13 / 7.22).
 *
 * Returns { el, update }. `el` is a <button>; `update()` syncs active/disabled
 * state from the editor's command manager. The button:
 *  - shows an inline-SVG icon (built-in name) or raw custom icon markup,
 *  - has aria-label + aria-pressed + aria-describedby (shortcut hint),
 *  - saves the selection on mousedown (before blur) and restores before exec,
 *  - shows a tooltip on hover/focus via the Phase 6 TooltipManager.
 */

import { iconSVG } from './icons.js';
import { t } from './locale.js';

let _hintIdCounter = 0;

/** Find the registered shortcut label for a command, formatted for display. */
function shortcutHintFor(editor, command) {
  if (!editor.shortcuts || !command) return '';
  try {
    for (const [keys, desc] of editor.shortcuts.getAll()) {
      if (desc.command === command) {
        // Prefer the ctrl form for display; prettify "ctrl+b" → "Ctrl+B".
        if (keys.startsWith('meta')) continue;
        return keys.split('+').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('+');
      }
    }
  } catch { /* ignore */ }
  return '';
}

export function createButton(editor, item, locale, doc, hooks = {}) {
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'oe-tb__btn';
  el.setAttribute('data-name', item.name);
  el.setAttribute('tabindex', '-1'); // roving tabindex — manager promotes one to 0

  // 17.11 — locale precedence: a translated bundle key beats a plugin's
  // literal `tooltip` (previously reversed, so 12 plugin buttons leaked
  // English through every translation). The literal stays as the fallback
  // for third-party plugins whose names have no bundle key.
  const key = item.labelKey || item.name;
  const label = (locale && Object.prototype.hasOwnProperty.call(locale, key))
    ? t(locale, key)
    : (item.tooltip || t(locale, key));
  el.setAttribute('aria-label', label);

  // Icon: built-in name resolves via iconSVG; otherwise treat as raw SVG markup
  // (trusted-input contract, like the context-menu icon).
  el.innerHTML = item.icon && item.icon.indexOf('<') === -1 ? iconSVG(item.icon) : (item.icon || '');

  // Shortcut hint → aria-describedby (7.22)
  const hint = shortcutHintFor(editor, item.command);
  if (hint) {
    const hintId = `oe-tb-hint-${++_hintIdCounter}`;
    const hintEl = doc.createElement('span');
    hintEl.id = hintId;
    hintEl.className = 'oe-tb__hint';
    hintEl.textContent = `${label} (${hint})`;
    hintEl.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
    el.appendChild(hintEl);
    el.setAttribute('aria-describedby', hintId);
  }

  // Tooltip on hover/focus (7.2)
  const showTip = () => editor.ui && editor.ui.tooltip && editor.ui.tooltip.show(el, hint ? `${label} (${hint})` : label);
  const hideTip = () => editor.ui && editor.ui.tooltip && editor.ui.tooltip.hide();
  el.addEventListener('mouseenter', showTip);
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('focus', showTip);
  el.addEventListener('blur', hideTip);

  // 7.13 — save selection BEFORE the button takes focus (mousedown precedes blur)
  el.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep focus/selection in the editor
    if (editor.selection) hooks.savedBookmark = editor.selection.save();
  });

  el.addEventListener('click', () => {
    hideTip();
    // A disabled button must not act — some browsers still deliver a click to a
    // .disabled=false-but-visually-disabled control, and command-less (onClick)
    // buttons could otherwise mutate in readonly. Belt-and-suspenders.
    if (el.disabled) return;
    // Restore the pre-click selection, then run the action.
    if (hooks.savedBookmark && editor.selection) {
      editor.selection.restore(hooks.savedBookmark);
      hooks.savedBookmark = null;
    }
    if (typeof item.onClick === 'function') item.onClick(editor, el);
    else if (item.command && editor.commands) editor.commands.execute(item.command);
    if (hooks.afterAction) hooks.afterAction();
  });

  function update() {
    if (!editor.commands) return;
    // Active state (aria-pressed) — ONLY for commands that implement isActive()
    // (i.e. true toggle commands like bold/italic). Action-only commands (undo,
    // redo, insertHR, etc.) have no isActive and must NOT get aria-pressed because
    // that would misrepresent their semantics to screen readers.
    const cmdHasActive = item.command
      && typeof editor.commands.isActive === 'function'
      && editor.commands._commands
      && editor.commands._commands.get(item.command)
      && !!editor.commands._commands.get(item.command).isActive;
    // Custom buttons may supply their own isActive predicate in the item descriptor (7.15).
    const activeFromItem = typeof item.isActive === 'function'
      ? item.isActive(editor)
      : null;
    if (cmdHasActive || activeFromItem !== null) {
      const active = activeFromItem !== null
        ? activeFromItem
        : editor.commands.isActive(item.command);
      el.classList.toggle('oe-tb__btn--active', !!active);
      el.setAttribute('aria-pressed', String(!!active));
    } else {
      // Remove any previously-set aria-pressed so the attribute is absent.
      el.removeAttribute('aria-pressed');
      el.classList.remove('oe-tb__btn--active');
    }
    // Enabled state.
    let enabled = true;
    if (item.command && typeof editor.commands.isEnabled === 'function') {
      enabled = editor.commands.isEnabled(item.command);
    } else if (!item.command) {
      // Command-less (onClick) buttons — e.g. chars, emoji, media, code-block,
      // find/replace, source — mutate content/config, so disable them in
      // readonly. Buttons flagged readOnlyExempt (preview, fullscreen, print,
      // source-view-toggle if made read-safe) stay enabled.
      const ro = editor.isReadOnly && editor.isReadOnly();
      if (ro && !item.readOnlyExempt) enabled = false;
    }
    el.disabled = !enabled;
    el.classList.toggle('oe-tb__btn--disabled', !enabled);
  }

  return { el, update, item };
}
