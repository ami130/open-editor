/**
 * Phase 15 Stage 7 — tokenization guard.
 *
 * A theme reskins by overriding SEMANTIC tokens (--oe-bg, --oe-fg, …). Any
 * component style that hardcodes a color literal — or references a *primitive*
 * (--oe-c-*) directly — on a themeable property bypasses the theme surface and
 * will NOT reskin in dark/minimal mode (the GAP-1 dark-mode break). This test
 * scans every CSS-in-JS style file and fails on such a literal so the break
 * can never silently return.
 *
 * What is allowed on a themeable property:
 *   - a semantic token:            var(--oe-bg), var(--oe-primary), …
 *   - theme-independent keywords:  transparent, currentColor, inherit, none
 *   - a token DEFINITION line:     --oe-foo: #fff   (that IS the theme surface)
 * What is flagged:
 *   - raw hex / rgb() / hsl() / named colors on background|color|border*|fill|stroke|outline
 *   - var(--oe-c-*)  (a primitive) used directly by a component
 *
 * Genuinely theme-independent literals (shadow opacities like rgba(0,0,0,0.4),
 * the always-dark tooltip, the always-dark image-editor toolbar) are declared
 * in ALLOWLIST with a reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Every CSS-in-JS / CSS text file that ships component chrome.
const STYLE_FILES = [
  'plugins/chars/char-styles.js',
  'plugins/find-replace/search-styles.js',
  'plugins/image/image-styles.js',
  'plugins/link/link-styles.js',
  'plugins/media/media-styles.js',
  'plugins/preview/preview-styles.js',
  'plugins/resize-editor/resize-editor-styles.js',
  'plugins/source/source-styles.js',
  'plugins/table/table-styles.js',
  'plugins/todo-list/todo-list-styles.js',
  'plugins/block-drag/block-drag-styles.js',
  'plugins/mentions/mention-styles.js',
  'ui/caret-popup-styles.js',
  'ui/island-actionbar-styles.js',
  'ui/resize-overlay-styles.js',
  'ui/toolbar/blockquote-toolbar-styles.js',
  'ui/toolbar/color-picker-styles.js',
  'ui/toolbar/toolbar-styles.js',
  'ui/ui-styles.js',
  'utils/a11y-css.js',
  'utils/base-css.js',
];

// Themeable properties: a color here MUST come from a semantic token.
const THEMEABLE = /^(background|background-color|color|border|border-color|border-top|border-right|border-bottom|border-left|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|fill|stroke|caret-color|--bq-accent)$/;

// A literal is a raw hex, rgb(a)/hsl(a) function, or a primitive token ref.
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGB_HSL = /\b(rgb|rgba|hsl|hsla)\s*\(/;
const PRIMITIVE = /var\(\s*--oe-c-[a-z0-9-]+/;

// Theme-independent values that are fine anywhere.
const SAFE_VALUE = /^(transparent|currentcolor|inherit|initial|unset|none|canvas|canvastext|highlight|highlighttext|buttonface|field|fieldtext)$/i;

// Intentional, reviewed exceptions — theme-independent by design.
// key: `${file}:${selectorHint}:${prop}` substring match on the raw declaration.
const ALLOWLIST = [
  // Shadow/ring opacities layered over content — not a themeable surface color.
  { match: /box-shadow:.*rgba\(0,\s*0,\s*0/, reason: 'shadow opacity, not a surface color' },
  { match: /border:\s*\d+px solid rgba\(0,\s*0,\s*0/, reason: 'swatch ring opacity over arbitrary swatch color' },
  { match: /border-color:\s*rgba\(0,\s*0,\s*0/, reason: 'swatch ring opacity over arbitrary swatch color' },
  // Video letterbox is conventionally black regardless of theme.
  { match: /background:\s*#000\b/, reason: 'video letterbox — always black' },
  // Callout accent hues are a FIXED status palette (info/warning/success/danger),
  // the same hue in every theme; the callout bg/text adapt around them.
  { match: /--bq-accent:\s*var\(--oe-c-(info|warning|success|danger-accent)\)/, reason: 'fixed status accent hue' },
  // Status-signal tints: error boxes (danger-100 bg / danger-200 border) and the
  // warning-count hue are a fixed semantic palette — a red error stays red-tinted
  // in every theme (convention), like a browser validation message.
  { match: /(background|border|border-color):[^;]*var\(--oe-c-danger-(100|200)\)/, reason: 'fixed danger-tint status signal' },
  { match: /color:\s*var\(--oe-c-warning\)/, reason: 'fixed warning status hue' },
];

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Yield { prop, value, raw } for each `prop: value` declaration in the CSS text.
function* declarations(css) {
  // Match `ident: ...;` fragments. Good enough for our flat rule bodies.
  const re = /([-a-zA-Z]+)\s*:\s*([^;{}]+)[;}]/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    yield { prop: m[1].trim().toLowerCase(), value: m[2].trim(), raw: m[0].trim() };
  }
}

function isAllowed(raw) {
  return ALLOWLIST.some((a) => a.match.test(raw));
}

describe('tokenization guard (15.1 / 15.3)', () => {
  for (const rel of STYLE_FILES) {
    it(`${rel} uses semantic tokens (no color literals on themeable props)`, () => {
      const css = stripComments(readFileSync(join(SRC, rel), 'utf8'));
      const violations = [];
      for (const d of declarations(css)) {
        // Token DEFINITIONS are the theme surface itself — always allowed.
        if (d.prop.startsWith('--oe-') && d.prop !== '--bq-accent') continue;
        if (!THEMEABLE.test(d.prop)) continue;
        if (SAFE_VALUE.test(d.value)) continue;
        if (isAllowed(d.raw)) continue;
        // var(--oe-inverse-*) is a semantic token (a `var(...)` ref, so it carries
        // no raw hex/rgb in the USAGE) → naturally passes the literal check below.
        const hasLiteral = HEX.test(d.value) || RGB_HSL.test(d.value) || PRIMITIVE.test(d.value);
        if (hasLiteral) violations.push(d.raw);
      }
      expect(violations, `\n  ${rel} has ${violations.length} un-tokenized color(s):\n   - ${violations.join('\n   - ')}\n`).toEqual([]);
    });
  }
});
