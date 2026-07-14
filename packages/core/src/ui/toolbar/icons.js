/**
 * Inline SVG icon set for the toolbar — zero dependencies, no icon font.
 *
 * Unified icon system (UI redesign): every entry is inner markup on a 24×24
 * viewBox, drawn with a consistent 2px stroke, `currentColor`, and round caps/
 * joins (applied on the wrapper <svg> so each icon inherits them). Icons render
 * at 18px. This replaces the earlier mixed 16-grid set (which blended thin line
 * icons with raw <text> glyphs) with one coherent, modern line-icon family.
 */

export const ICONS = {
  // ── Inline text formatting ──
  bold:          '<path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7zM7 12h7.5a3.5 3.5 0 0 1 0 7H7z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  italic:        '<line x1="13" y1="5" x2="19" y2="5"/><line x1="5" y1="19" x2="11" y2="19"/><line x1="15" y1="5" x2="9" y2="19"/>',
  underline:     '<path d="M7 4v6a5 5 0 0 0 10 0V4"/><line x1="5" y1="20" x2="19" y2="20"/>',
  strikethrough: '<path d="M8 7a4 4 0 0 1 8 0"/><path d="M16 15a4 4 0 0 1-8 0"/><line x1="4" y1="12" x2="20" y2="12"/>',
  superscript:   '<path d="M4 6l8 11M12 6L4 17" stroke-width="1.8"/><path d="M17 5.5a1.8 1.8 0 0 1 3 1.4c0 1-1 1.6-3 3.1h3" stroke-width="1.4"/>',
  subscript:     '<path d="M4 6l8 11M12 6L4 17" stroke-width="1.8"/><path d="M17 14.5a1.8 1.8 0 0 1 3 1.4c0 1-1 1.6-3 3.1h3" stroke-width="1.4"/>',
  inlineCode:    '<polyline points="9,8 5,12 9,16"/><polyline points="15,8 19,12 15,16"/>',
  removeFormat:  '<path d="M6 5h13"/><path d="M11 5l-1.5 9"/><path d="M15 5l-.8 4.8"/><line x1="5" y1="20" x2="14" y2="20"/><path d="M15 14l5 5M20 14l-5 5" stroke-width="1.7"/>',

  // ── Lists / indentation ──
  ul:            '<circle cx="5" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1.3" fill="currentColor" stroke="none"/><line x1="10" y1="7" x2="20" y2="7"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="17" x2="20" y2="17"/>',
  ol:            '<line x1="10" y1="7" x2="20" y2="7"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="17" x2="20" y2="17"/><path d="M4 6h1.5v4M4 10h3" stroke-width="1.5"/><path d="M4 15h2a1 1 0 0 1 0 2H4l2 1.5" stroke-width="1.5"/>',
  indent:        '<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><polyline points="4,8 7,12 4,16"/>',
  outdent:       '<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><polyline points="7,8 4,12 7,16"/>',

  // ── Alignment ──
  alignLeft:     '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="11" x2="14" y2="11"/><line x1="4" y1="16" x2="18" y2="16"/>',
  alignCenter:   '<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="11" x2="17" y2="11"/><line x1="5" y1="16" x2="19" y2="16"/>',
  alignRight:    '<line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="11" x2="20" y2="11"/><line x1="6" y1="16" x2="20" y2="16"/>',
  alignJustify:  '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="11" x2="20" y2="11"/><line x1="4" y1="16" x2="20" y2="16"/>',

  // ── Blocks ──
  blockquote:    '<path d="M9 7H5v5h4V7z"/><path d="M9 12c0 2-1.3 3.5-3.5 4"/><path d="M19 7h-4v5h4V7z"/><path d="M19 12c0 2-1.3 3.5-3.5 4"/>',
  hr:            '<line x1="4" y1="12" x2="20" y2="12" stroke-width="2.2"/>',
  showBlocks:    '<rect x="4" y="4" width="16" height="7" rx="1" stroke-dasharray="3 2"/><rect x="4" y="14" width="16" height="6" rx="1" stroke-dasharray="3 2"/>',
  pageBreak:     '<path d="M6 4h12M6 8h12" stroke-width="2"/><path d="M4 12h2m3 0h2m3 0h2m3 0h2" stroke-width="2"/><path d="M6 16h12M6 20h12" stroke-width="2"/>',

  // ── Color (drawn "A" + swatch bar) ──
  textColor:     '<path d="M6 17L11 6l5 11M8 13h6"/><rect x="5" y="19" width="14" height="2.5" rx="1" fill="currentColor" stroke="none"/>',
  bgColor:       '<path d="M6 15L12 6l6 9"/><rect x="4" y="18" width="16" height="3" rx="1.2" fill="currentColor" stroke="none"/>',

  // ── History ──
  undo:          '<polyline points="9,7 4,12 9,17"/><path d="M4 12h9a5 5 0 0 1 0 10H9"/>',
  redo:          '<polyline points="15,7 20,12 15,17"/><path d="M20 12h-9a5 5 0 0 0 0 10h4"/>',

  // ── View ──
  fullscreen:    '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  print:         '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/><circle cx="16.5" cy="12" r="0.9" fill="currentColor" stroke="none"/>',

  // ── UI affordance ──
  chevron:       '<polyline points="6,9 12,15 18,9"/>',
};

// Fallback glyph for unknown icon names — a rounded square so a button is never
// rendered completely empty (which looks broken and unclickable).
const FALLBACK_ICON = '<rect x="5" y="5" width="14" height="14" rx="3"/>';

/**
 * Wrap inner icon markup in a standard 24×24 SVG element string. The wrapper
 * sets the shared stroke defaults (no fill, round caps/joins, 2px) so every
 * icon is visually consistent; individual icons may override per-shape.
 */
export function iconSVG(name) {
  const inner = ICONS[name] || FALLBACK_ICON;
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}
