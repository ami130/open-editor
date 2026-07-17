/**
 * bookmark-panel.js — the "jump to bookmark" navigator. Contributes a toolbar
 * dropdown listing every bookmark in document order (icon + name); clicking an
 * entry scrolls the marker into view and flashes it. Turns bookmarks from mere
 * link anchors into real long-document navigation. Rendered only when there is
 * at least one bookmark (the button hides itself otherwise).
 */
import { t } from '../../ui/toolbar/locale.js';
import { listBookmarks } from './bookmark-core.js';

const PANEL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/>
  <circle cx="3.5" cy="6" r="1.2"/><circle cx="3.5" cy="12" r="1.2"/><circle cx="3.5" cy="18" r="1.2"/>
</svg>`;

/**
 * Build a toolbar button descriptor that opens the navigator via the shared
 * context-menu system (positioned under the button). Returns null when the
 * editor isn't ready. Clicking an entry jumps to (scrolls + flashes) that
 * marker; editing a marker is done by clicking the marker itself in the doc.
 */
export function buildBookmarkPanelButton(editor, locale) {
  if (!editor) return null;
  return {
    name: 'bookmarkPanel',
    type: 'button',
    icon: PANEL_ICON,
    tooltip: t(locale, 'bookmarksPanel'),
    onClick: (ev) => {
      const marks = listBookmarks(editor);
      const anchorEl = ev && ev.currentTarget;
      const rect = anchorEl && anchorEl.getBoundingClientRect
        ? anchorEl.getBoundingClientRect() : { left: 0, bottom: 0 };
      if (!marks.length) {
        editor.ui.contextMenu.show(rect.left, rect.bottom, [
          { label: t(locale, 'bookmarksEmpty'), disabled: true },
        ]);
        return;
      }
      const items = marks.map((m) => ({
        label: m.id,
        action: () => jumpTo(editor, m),
      }));
      editor.ui.contextMenu.show(rect.left, rect.bottom, items);
    },
  };
}

/** Scroll a marker into view and flash it briefly for orientation. */
function jumpTo(editor, mark) {
  if (!mark || !mark.scrollIntoView) return;
  mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  mark.classList.add('oe-bookmark--flash');
  const win = mark.ownerDocument && mark.ownerDocument.defaultView;
  const timers = win || globalThis;
  timers.setTimeout(() => mark.classList.remove('oe-bookmark--flash'), 1200);
}
