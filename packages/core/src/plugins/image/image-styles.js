import { injectStyleOnce } from '../../utils/inject-style.js';
import { injectResizeOverlayStyles } from '../../ui/resize-overlay-styles.js';
import { injectIslandActionbarStyles } from '../../ui/island-actionbar-styles.js';
/**
 * image-styles.js — CSS for the image plugin injected once per document.
 *
 * Covers: insert dialog, figure islands, resize overlay, drag highlight.
 * Injected by image-plugin.js install().
 */

const STYLE_ID = 'oe-image-styles';

export const IMAGE_CSS = `
/* ── Dialog ────────────────────────────────────────────────────────────────── */
.oe-img-dialog {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.oe-img-dialog__tabs {
  display: flex;
  gap: 4px;
  padding: 0 0 14px;
  border-bottom: 1px solid var(--oe-border);
  margin-bottom: 16px;
}
.oe-img-dialog__tab {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1.5px solid var(--oe-border-strong);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--oe-fg-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  line-height: 1.4;
}
.oe-img-dialog__tab:hover { background: var(--oe-bg-hover); color: var(--oe-panel-fg); }
.oe-img-dialog__tab--active {
  background: var(--oe-primary);
  border-color: var(--oe-primary);
  color: var(--oe-primary-fg);
}
.oe-img-dialog__tab--active:hover { background: var(--oe-primary-hover); border-color: var(--oe-primary-hover); }

.oe-img-dialog__panel { display: flex; flex-direction: column; gap: 12px; }
.oe-img-dialog__panel--hidden { display: none !important; }

/* ── Fields ─────────────────────────────────────────────────────────────────── */
.oe-img-dialog__field { display: flex; flex-direction: column; gap: 5px; }
.oe-img-dialog__label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.oe-img-dialog__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--oe-panel-fg);
  letter-spacing: 0.01em;
}
.oe-img-dialog__char-count {
  font-size: 11px;
  /* 17.10 — was --oe-fg-placeholder, which failed WCAG AA contrast (axe:
     color-contrast, serious) against the dialog background at 11px. */
  color: var(--oe-panel-fg-muted);
  font-variant-numeric: tabular-nums;
}
.oe-img-dialog__char-count--warn { color: var(--oe-c-warning); font-weight: 600; }
.oe-img-dialog__input,
.oe-img-dialog__select {
  padding: 8px 10px;
  border: 1.5px solid var(--oe-border-strong);
  border-radius: 6px;
  font-size: 13px;
  color: var(--oe-panel-fg);
  background: var(--oe-bg);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.oe-img-dialog__input:focus,
.oe-img-dialog__select:focus {
  border-color: var(--oe-primary);
  box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
}

/* ── Alignment icon buttons ─────────────────────────────────────────────────── */
.oe-img-dialog__align-group {
  display: flex;
  gap: 6px;
}
.oe-img-dialog__align-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1.5px solid var(--oe-border-strong);
  background: var(--oe-bg);
  cursor: pointer;
  color: var(--oe-fg-muted);
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  padding: 0;
}
.oe-img-dialog__align-btn:hover { background: var(--oe-bg-hover); color: var(--oe-panel-fg); }
.oe-img-dialog__align-btn--active {
  background: var(--oe-primary-tint);
  border-color: var(--oe-primary);
  color: var(--oe-primary);
}

/* ── Upload dropzone ─────────────────────────────────────────────────────────── */
.oe-img-dialog__dropzone {
  border: 2px dashed var(--oe-border-strong);
  border-radius: 10px;
  padding: 24px 20px 20px;
  text-align: center;
  font-size: 13px;
  color: var(--oe-fg-muted);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.oe-img-dialog__dz-icon {
  width: 32px;
  height: 32px;
  color: var(--oe-fg-placeholder);
  transition: color 0.15s;
  flex-shrink: 0;
}
.oe-img-dialog__dz-text { font-size: 13px; color: var(--oe-panel-fg); }
.oe-img-dialog__dz-hint { font-size: 11px; color: var(--oe-fg-placeholder); letter-spacing: 0.01em; }
.oe-img-dialog__dropzone--over,
.oe-img-dialog__dropzone:focus-within {
  border-color: var(--oe-primary);
  background: var(--oe-primary-tint);
  outline: none;
}
.oe-img-dialog__dropzone--over .oe-img-dialog__dz-icon,
.oe-img-dialog__dropzone:focus-within .oe-img-dialog__dz-icon { color: var(--oe-primary); }
.oe-img-dialog__choose {
  color: var(--oe-primary);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.oe-img-dialog__file-input { display: none; }

/* ── Thumbnail preview ───────────────────────────────────────────────────────── */
.oe-img-dialog__preview {
  width: 100%;
  max-height: 140px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid var(--oe-border);
  background: var(--oe-primary-tint);
  display: block;
}
.oe-img-dialog__preview-dim {
  font-size: 11px;
  color: var(--oe-fg-placeholder);
  text-align: center;
  padding: 3px 0 0;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}
.oe-img-dialog__preview--hidden { display: none !important; }

/* ── Progress ────────────────────────────────────────────────────────────────── */
.oe-img-dialog__progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
.oe-img-dialog__progress-track {
  flex: 1;
  height: 6px;
  background: var(--oe-border);
  border-radius: 99px;
  overflow: hidden;
}
.oe-img-dialog__progress-bar {
  height: 100%;
  background: var(--oe-primary);
  border-radius: 99px;
  width: 0%;
  transition: width 0.1s;
}
.oe-img-dialog__progress-pct {
  font-size: 12px;
  color: var(--oe-fg-muted);
  min-width: 32px;
  text-align: right;
}
.oe-img-dialog__abort {
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid var(--oe-border-strong);
  background: var(--oe-bg);
  font-size: 12px;
  color: var(--oe-fg-muted);
  cursor: pointer;
}
.oe-img-dialog__abort:hover { background: var(--oe-c-danger-100); color: var(--oe-danger); border-color: var(--oe-c-danger-200); }

/* ── Inline error ────────────────────────────────────────────────────────────── */
.oe-img-dialog__error {
  font-size: 12px;
  color: var(--oe-danger);
  background: var(--oe-c-danger-100);
  border: 1px solid var(--oe-c-danger-200);
  border-radius: 6px;
  padding: 8px 10px;
  margin-top: 4px;
}

/* ── Shared field area ───────────────────────────────────────────────────────── */
.oe-img-dialog__shared {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--oe-border);
  margin-top: 4px;
}

/* ── Figure island ───────────────────────────────────────────────────────────── */
.oe-figure {
  display: block;
  margin: 1em 0;
  max-width: 100%;
  position: relative;
  min-height: 40px;
  border-radius: 4px;
  transition: box-shadow 0.15s;
}
.oe-figure img {
  max-width: 100%;
  height: auto;
  display: block;
  background: var(--oe-primary-tint);
  min-height: 40px;
  border-radius: 3px;
}
.oe-figure figcaption {
  font-size: 0.82em;
  color: var(--oe-fg-muted);
  text-align: center;
  padding: 6px 4px 2px;
  min-height: 1.4em;
  line-height: 1.5;
  outline: none;
}
.oe-figure figcaption:empty::before {
  content: 'Add a caption…';
  color: var(--oe-panel-fg-faint);
  pointer-events: none;
}
/* 9.5 — make the caption affordance discoverable: a clearer prompt when the
   image is selected, and a subtle focus underline so users see it's editable. */
.oe-figure--selected figcaption:empty::before { color: var(--oe-primary); opacity: 0.65; }
.oe-figure figcaption:focus {
  box-shadow: inset 0 -1px 0 rgba(37,99,235,0.4);
  color: var(--oe-panel-fg);
}
.oe-figure figcaption:empty:focus::before { content: ''; }
.oe-figure--selected {
  box-shadow: 0 0 0 2px var(--oe-bg), 0 0 0 4px var(--oe-primary);
}
.oe-figure--left   { float: left;  margin-right: 1.25em; }
.oe-figure--right  { float: right; margin-left:  1.25em; }
.oe-figure--center { display: block; margin-left: auto; margin-right: auto; }
.oe-figure--inline { display: inline-block; }

/* ── Resize overlay CSS lives in ui/resize-overlay-styles.js (shared with the
   media plugin) — injected separately by injectImageStyles() below. ── */

/* ── Editor drag-over highlight ──────────────────────────────────────────────── */
.oe-editor--dragover {
  outline: 2px dashed var(--oe-primary);
  outline-offset: -2px;
  background: var(--oe-primary-wash-soft);
}

/* ── 9.4 — floating quick-action bar CSS lives in
   ui/island-actionbar-styles.js (shared with the media plugin) — injected
   separately by injectImageStyles() below. ── */
`;

export function injectImageStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, IMAGE_CSS);
  injectResizeOverlayStyles(doc);
  injectIslandActionbarStyles(doc);
}
