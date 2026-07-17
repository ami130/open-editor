/**
 * bookmark-plugin.js — named in-text anchors (17.5.7), advanced edition.
 *
 * A bookmark is `<a id="name" class="oe-bookmark" contenteditable="false"
 * [data-oe-icon] [data-oe-color]>` — an EMPTY inline island (zero text
 * footprint) rendered as a small icon via CSS ::before. Sanitizer-round-trip
 * safe. Features: insert/edit dialog with live validation, right-click manage
 * menu, hover tooltip, keyboard access, undo-integrated commands, choosable
 * icon + color (config-gated), and a "jump to bookmark" panel.
 *
 * Files: bookmark-core.js (pure helpers), bookmark-dialog.js (dialog UI),
 * bookmark-config.js (icon/color config + built-ins), bookmark-panel.js
 * (navigator dropdown), bookmark-styles.js (CSS).
 *
 * Implements { name, install, destroy, getToolbarButtons }.
 */
import { injectBookmarkStyles } from './bookmark-styles.js';
import { t, resolveLocale } from '../../ui/toolbar/locale.js';
import { CommandManager } from '../../commands/command-manager.js';
import {
  listBookmarks, createMarker, removeBookmark, repairBookmarks,
  collapseSelectionToStart, restoreInsertCaret, applyPresentation,
} from './bookmark-core.js';
import { openBookmarkDialog } from './bookmark-dialog.js';
import { resolveBookmarkConfig } from './bookmark-config.js';
import { buildBookmarkPanelButton } from './bookmark-panel.js';

// Re-export the core helpers so existing importers (and tests) keep working.
export { listBookmarks, createMarker, removeBookmark, repairBookmarks } from './bookmark-core.js';

const BOOKMARK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
</svg>`;

export function createBookmarkPlugin() {
  return {
    name: 'bookmark',
    _editor: null,

    install(editor) {
      this._editor = editor;
      // Styles into the document the editable lives in (iframe-aware).
      const doc = editor._iframeDoc || ((typeof document !== 'undefined') ? document : null);
      if (doc) injectBookmarkStyles(doc);
      this._locale = resolveLocale(editor._config.locale);
      this._cfg = resolveBookmarkConfig(editor._config);

      // Dynamic marker size (bookmarkIconSize): one CSS variable on the
      // editable — every marker inherits it; unset → 1em (tracks text size).
      if (this._cfg.iconSize) {
        editor.getEditorElement().style.setProperty('--oe-bm-size', this._cfg.iconSize);
      }

      // ── Commands (F5) — go through CommandManager so undo/redo, onChange, and
      //    beforeCommand/afterCommand all work. DOM edits return SKIP_RESTORE. ──
      editor.commands.register('insertBookmark', {
        execute: (ed, args) => { this._doInsert(args || {}); return CommandManager.SKIP_RESTORE; },
      });
      editor.commands.register('removeBookmark', {
        execute: (ed, args) => {
          const mark = (args && args.mark) || null;
          if (mark) removeBookmark(ed, mark);
          return CommandManager.SKIP_RESTORE;
        },
      });

      // ── Left-click a marker → manage dialog. ──
      this._onClick = (e) => {
        const mark = closestMark(e, editor);
        if (mark) { e.preventDefault(); this._openDialog(mark); }
      };
      editor.getEditorElement().addEventListener('click', this._onClick);

      // ── Right-click a marker → context menu (F4). contextmenu on a CE=false
      //    island does not bubble to the editable, so listen on the root. ──
      this._onContextMenu = (e) => {
        const mark = closestMark(e, editor);
        if (!mark) return;
        e.preventDefault();
        this._openContextMenu(mark, e.clientX, e.clientY);
      };
      editor.getEditorElement().addEventListener('contextmenu', this._onContextMenu);

      // ── Hover tooltip + keyboard access (Phase B). ──
      // Track the marker currently hovered so we only fire show()/hide() on a
      // real boundary crossing — mouseover/out bubble on every child and every
      // pixel of movement, which would thrash the tooltip. `_hovered` collapses
      // that to one show per enter, one hide per leave.
      this._hovered = null;
      this._onOver = (e) => {
        const mark = closestMark(e, editor);
        if (mark === this._hovered) return;           // same marker (or same non-marker) → ignore
        this._hovered = mark;
        if (mark && editor.ui && editor.ui.tooltip) editor.ui.tooltip.show(mark, mark.id);
        else if (editor.ui && editor.ui.tooltip) editor.ui.tooltip.hide();
      };
      this._onOut = (e) => {
        // Leaving to somewhere NOT in a marker → clear + hide once.
        const to = e.relatedTarget;
        const stillIn = to && to.closest && to.closest('a.oe-bookmark') && editor.getEditorElement().contains(to);
        if (!stillIn && this._hovered) {
          this._hovered = null;
          if (editor.ui && editor.ui.tooltip) editor.ui.tooltip.hide();
        }
      };
      this._onKeyDown = (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const mark = e.target && e.target.closest && e.target.closest('a.oe-bookmark');
        if (mark && editor.getEditorElement().contains(mark)) { e.preventDefault(); this._openDialog(mark); }
      };
      const el = editor.getEditorElement();
      el.addEventListener('mouseover', this._onOver);
      el.addEventListener('mouseout', this._onOut);
      el.addEventListener('keydown', this._onKeyDown);

      // ── F3 repair on install + every external setHTML. Also make markers
      //    focusable so keyboard users reach them. ──
      this._repair = () => { repairBookmarks(el); this._makeFocusable(); };
      this._repair();
      editor.on('setHTML', this._repair);
    },

    destroy() {
      const editor = this._editor;
      if (editor) {
        const el = editor.getEditorElement();
        el.removeEventListener('click', this._onClick);
        el.removeEventListener('contextmenu', this._onContextMenu);
        el.removeEventListener('mouseover', this._onOver);
        el.removeEventListener('mouseout', this._onOut);
        el.removeEventListener('keydown', this._onKeyDown);
        editor.off('setHTML', this._repair);
        if (editor.commands) {
          editor.commands.unregister('insertBookmark');
          editor.commands.unregister('removeBookmark');
        }
      }
      this._editor = null;
    },

    getToolbarButtons() {
      const insertBtn = {
        name: 'bookmark',
        type: 'button',
        icon: BOOKMARK_ICON,
        tooltip: t(this._locale, 'bookmark'),
        onClick: () => this._openDialog(null),
      };
      // Navigator panel (jump-to dropdown) is config-gated OFF by default —
      // opt in with `bookmarkPanel: true` (useful for long documents).
      if (!this._cfg.panel) return [insertBtn];
      const panelBtn = buildBookmarkPanelButton(this._editor, this._locale);
      return panelBtn ? [insertBtn, panelBtn] : [insertBtn];
    },

    // ── internals ──
    _openDialog(existing) {
      const c = this._cfg;
      return openBookmarkDialog(this._editor, existing, {
        locale: this._locale,
        icons: c.icons, colors: c.colors,
        defaultIcon: c.defaultIcon, defaultColor: c.defaultColor,
      });
    },

    /** The actual insert, invoked via the 'insertBookmark' command. */
    _doInsert({ name, icon, color, saved }) {
      const editor = this._editor;
      const doc = editor.getEditorElement().ownerDocument;
      restoreInsertCaret(editor, saved);
      collapseSelectionToStart(editor);
      const marker = createMarker(doc, name, icon, color);
      editor.selection.insertAtCursor(marker);
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('aria-label', `${t(this._locale, 'bookmark')}: ${name}`);
      if (editor._onChangeFn) editor._onChangeFn();
    },

    _openContextMenu(mark, x, y) {
      const editor = this._editor;
      const loc = this._locale;
      const items = [
        { label: t(loc, 'bookmarkEdit'), action: () => this._openDialog(mark) },
        { label: t(loc, 'bookmarkCopyLink'), action: () => copyLink(mark) },
      ];
      const c = this._cfg;
      if (c.icons && c.icons.length) {
        items.push({ label: t(loc, 'bookmarkIcon'), submenu: c.icons.map((o) => iconMenuItem(editor, mark, o)) });
      }
      if (c.colors && c.colors.length) {
        items.push({ label: t(loc, 'bookmarkColor'), submenu: c.colors.map((o) => colorMenuItem(editor, mark, o)) });
      }
      items.push({ separator: true });
      items.push({ label: t(loc, 'remove'), action: () => editor.commands.execute('removeBookmark', { mark }) });
      editor.ui.contextMenu.show(x, y, items);
    },

    /** Give every marker a tabindex + aria-label so keyboard/AT users reach it. */
    _makeFocusable() {
      const loc = this._locale;
      for (const m of listBookmarks(this._editor)) {
        if (!m.hasAttribute('tabindex')) m.setAttribute('tabindex', '0');
        if (!m.hasAttribute('aria-label')) m.setAttribute('aria-label', `${t(loc, 'bookmark')}: ${m.id}`);
      }
    },
  };
}

// ── small helpers kept local to the orchestrator ──
function closestMark(e, editor) {
  const mark = e.target && e.target.closest && e.target.closest('a.oe-bookmark');
  return mark && editor.getEditorElement().contains(mark) ? mark : null;
}

function copyLink(mark) {
  const link = `#${mark.id}`;
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(link).catch(() => {});
  }
}

function iconMenuItem(editor, mark, opt) {
  const val = typeof opt === 'string' ? opt : opt.value;
  return {
    label: (typeof opt === 'object' && opt.label) || val,
    action: () => { applyPresentation(mark, val, mark.getAttribute('data-oe-color')); if (editor._onChangeFn) editor._onChangeFn(); },
  };
}

function colorMenuItem(editor, mark, opt) {
  const val = typeof opt === 'string' ? opt : opt.value;
  return {
    label: (typeof opt === 'object' && opt.label) || val,
    action: () => { applyPresentation(mark, mark.getAttribute('data-oe-icon'), val); if (editor._onChangeFn) editor._onChangeFn(); },
  };
}

export const bookmarkPlugin = createBookmarkPlugin();
