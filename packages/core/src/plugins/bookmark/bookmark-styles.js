import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * bookmark-styles.js — 17.5.7: the in-editor flag marker for named anchors.
 * CSS files are exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-bookmark-styles';

const CSS = `
.oe-editor a.oe-bookmark {
  /* Inline-flex + em sizing: the marker CENTERS its glyph and scales with the
     surrounding text (h1 bookmarks render bigger than body-text ones), and
     vertical-align:middle keeps it on the text's optical center line — this
     replaced an absolute-positioned fixed 14px box that sat off-baseline.
     --oe-bm-size is the DYNAMIC size knob (config: bookmarkIconSize). */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15em;
  height: 1em;
  vertical-align: middle;
  cursor: pointer;
  /* per-marker color, overridable by data-oe-color; defaults to accent */
  --oe-bm-color: var(--oe-primary);
  /* Kill the global link underline (base-css styles ALL <a>) — a marker is an
     icon, not a text link, so an underline dangling under the glyph is wrong. */
  text-decoration: none;
}
.oe-editor a.oe-bookmark::before { text-decoration: none; }
.oe-editor a.oe-bookmark:focus-visible {
  outline: 2px solid var(--oe-primary);
  outline-offset: 1px;
  border-radius: 2px;
}
.oe-editor a.oe-bookmark::before {
  content: '\\2691'; /* default: flag */
  font-size: var(--oe-bm-size, 1em);
  line-height: 1;
  color: var(--oe-bm-color);
  opacity: 0.85;
}
.oe-editor a.oe-bookmark:hover::before { opacity: 1; }

/* Icon variants (12) — glyphs chosen for wide font coverage (no external
   assets, no web fonts). Each is a single Unicode codepoint rendered in the
   marker color via ::before. */
.oe-editor a.oe-bookmark[data-oe-icon="flag"]::before     { content: '\\2691'; }   /* ⚑ flag */
.oe-editor a.oe-bookmark[data-oe-icon="star"]::before     { content: '\\2605'; }   /* ★ star */
.oe-editor a.oe-bookmark[data-oe-icon="pin"]::before      { content: '\\1F4CD'; }  /* 📍 pin */
.oe-editor a.oe-bookmark[data-oe-icon="tag"]::before      { content: '\\1F3F7'; }  /* 🏷 tag */
.oe-editor a.oe-bookmark[data-oe-icon="dot"]::before      { content: '\\25CF'; font-size: calc(var(--oe-bm-size, 1em) * 0.8); } /* ● dot */
.oe-editor a.oe-bookmark[data-oe-icon="bookmark"]::before { content: '\\1F516'; }  /* 🔖 bookmark */
.oe-editor a.oe-bookmark[data-oe-icon="heart"]::before    { content: '\\2665'; }   /* ♥ heart */
.oe-editor a.oe-bookmark[data-oe-icon="diamond"]::before  { content: '\\25C6'; }   /* ◆ diamond */
.oe-editor a.oe-bookmark[data-oe-icon="triangle"]::before { content: '\\25B6'; font-size: calc(var(--oe-bm-size, 1em) * 0.85); } /* ▶ triangle */
.oe-editor a.oe-bookmark[data-oe-icon="check"]::before    { content: '\\2714'; }   /* ✔ check */
.oe-editor a.oe-bookmark[data-oe-icon="arrow"]::before    { content: '\\27A4'; }   /* ➤ arrow */
.oe-editor a.oe-bookmark[data-oe-icon="anchor"]::before   { content: '\\2693'; }   /* ⚓ anchor */
.oe-editor a.oe-bookmark[data-oe-icon="asterisk"]::before { content: '\\2731'; }   /* ✱ asterisk */
.oe-editor a.oe-bookmark[data-oe-icon="square"]::before   { content: '\\25A0'; font-size: calc(var(--oe-bm-size, 1em) * 0.8); } /* ■ square */
.oe-editor a.oe-bookmark[data-oe-icon="lightning"]::before{ content: '\\26A1'; }   /* ⚡ lightning */

/* Color variants — map the data key to the marker color variable. */
.oe-editor a.oe-bookmark[data-oe-color="accent"] { --oe-bm-color: var(--oe-primary); }
.oe-editor a.oe-bookmark[data-oe-color="red"]    { --oe-bm-color: #e5484d; }
.oe-editor a.oe-bookmark[data-oe-color="amber"]  { --oe-bm-color: #f5a623; }
.oe-editor a.oe-bookmark[data-oe-color="green"]  { --oe-bm-color: #30a46c; }
.oe-editor a.oe-bookmark[data-oe-color="blue"]   { --oe-bm-color: #3b82f6; }
.oe-editor a.oe-bookmark[data-oe-color="violet"] { --oe-bm-color: #8b5cf6; }

/* Jump-to flash from the navigator panel. */
.oe-editor a.oe-bookmark--flash::before {
  animation: oe-bm-flash 1.2s ease-out;
}
@keyframes oe-bm-flash {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  20%      { opacity: 1; transform: scale(1.6); }
}
@media (prefers-reduced-motion: reduce) {
  .oe-editor a.oe-bookmark--flash::before { animation: none; }
}
/* Print: markers are editor chrome, not content. */
@media print { .oe-editor a.oe-bookmark::before { content: ''; } }

/* ── Modern dialog layout ─────────────────────────────────────────────────── */
.oe-bm-dialog { display: flex; flex-direction: column; gap: 16px; min-width: 260px; }
.oe-bm-dialog__field { display: flex; flex-direction: column; gap: 7px; }
.oe-bm-dialog__label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--oe-panel-fg-muted);
}
.oe-bm-dialog__input {
  width: 100%; padding: 9px 11px; font: inherit;
  border: 1px solid var(--oe-chrome-border-2); border-radius: var(--oe-radius-md, 8px);
  background: var(--oe-input-bg); color: var(--oe-panel-fg);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.oe-bm-dialog__input:focus {
  outline: none; border-color: var(--oe-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--oe-primary) 22%, transparent);
}
.oe-bm-dialog__error { min-height: 15px; font-size: 11px; color: var(--oe-danger); }

/* Icon grid — auto-fill so it wraps cleanly; large tap targets. */
.oe-bm-dialog__icons {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: 6px;
}
.oe-bm-dialog__icon {
  aspect-ratio: 1; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--oe-chrome-border-2); border-radius: var(--oe-radius-md, 8px);
  background: var(--oe-input-bg); color: var(--oe-panel-fg); cursor: pointer;
  font-size: 19px; line-height: 1;
  transition: border-color 0.12s, background 0.12s, transform 0.06s;
}
.oe-bm-dialog__icon::before { content: attr(data-glyph); }
.oe-bm-dialog__icon:hover { border-color: var(--oe-primary); }
.oe-bm-dialog__icon:active { transform: scale(0.92); }
.oe-bm-dialog__icon.is-active {
  border-color: var(--oe-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--oe-primary) 30%, transparent) inset;
}
.oe-bm-dialog__icon:focus-visible { outline: 2px solid var(--oe-primary); outline-offset: 1px; }

/* The embedded advanced color picker — the SAME panel as text color, sitting
   inline inside the dialog (not a popup): drop its fixed positioning + shadow. */
.oe-bm-dialog__cp {
  position: static !important; display: block; box-shadow: none;
  border: 1px solid var(--oe-chrome-border-2); border-radius: var(--oe-radius-md, 8px);
  padding: 12px; width: auto; max-width: 300px;
}
/* The panel's own OK is redundant (the dialog's Save commits), but Clear must
   stay reachable — it is the only way to say "no color / theme default". */
.oe-bm-dialog__cp .oe-cp__ok-btn { display: none; }
`;

export function injectBookmarkStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
