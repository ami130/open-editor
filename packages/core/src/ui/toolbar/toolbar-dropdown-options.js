/**
 * toolbar-dropdown-options.js — the option lists for each dropdown kind,
 * extracted from toolbar-dropdown.js (300-line limit). Pure data mapping:
 * kind (+ locale, + editor config for the dynamic kinds) → option descriptors
 * { label, command, arg? } consumed by createDropdown.
 */
import { t } from './locale.js';
import { HEADING_OPTIONS, DEFAULT_FONTS, DEFAULT_FONT_SIZES, DEFAULT_LINE_HEIGHTS } from './toolbar-config.js';

export function optionsFor(kind, locale, editor) {
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
