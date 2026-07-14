# Theming Open Editor

Open Editor is fully skinnable through CSS custom properties. You never edit the
editor's source to reskin it — you either pick a built-in theme, override
individual tokens per instance, or write your own theme in your own stylesheet.

This is the **user-facing guide**. For the internal design of the token system
(the three tiers, why light is pixel-identical, the full token list) see
[THEME-TOKENS.md](./THEME-TOKENS.md).

---

## Quick start

```js
import { OpenEditor } from 'omi-open-editor';

// Pick a theme at construction time (no flash — the theme is applied before
// the first paint).
const editor = new OpenEditor('#app', { theme: 'dark' });

// …or switch at runtime.
editor.setTheme('minimal');
editor.getTheme();            // → 'minimal'
```

Valid theme names: **`light`** (default), **`dark`**, **`minimal`**, **`auto`**.
Anything else falls back to `light`.

| Theme | Looks like |
|-------|-----------|
| `light` | The default. Bright chrome, subtle borders and shadows. |
| `dark` | Dark surfaces, light text, dimmed borders — a VS-Code-like palette. |
| `minimal` | Flat and borderless: no shadows, no rounded corners, toolbar blends into the editor. Made for embedding. |
| `auto` | Follows the operating system via `prefers-color-scheme` — dark when the OS is dark, light otherwise. |

---

## How theming works (30-second version)

Every color, border, shadow, radius and font in the editor is a **CSS custom
property** (a token) named `--oe-*`. There are three tiers:

1. **Primitives** — the raw palette (`--oe-c-gray-800`, `--oe-c-primary-500`, …).
   You rarely touch these.
2. **Semantic** — what the UI actually uses: `--oe-bg`, `--oe-fg`, `--oe-primary`,
   `--oe-border`, `--oe-focus-ring`, … **This is the theming surface.**
3. **Component** — the editor's own styles reference the semantic tokens. You
   never touch these.

A theme is just a set of semantic-tier overrides. Selecting a theme sets a
`data-oe-theme` attribute on the editor wrapper (and the editable), and the
whole UI re-cascades in one step — that's why runtime switching is flash-free.

Light's token values are **identical** to the colors the editor shipped with
before theming existed, so turning theming on changes nothing until you pick a
non-light theme.

---

## Per-instance overrides — `setCSSVar`

To tweak a single instance without writing a whole theme, override a semantic
token directly. This wins over the active theme for that editor only.

```js
editor.setCSSVar('--oe-primary', '#e91e63');   // recolor buttons/accents
editor.setCSSVar('oe-radius', '10px');          // the leading -- is optional
editor.getCSSVar('--oe-primary');               // → '#e91e63'
```

**Guarded:** the property name must match `--[a-zA-Z0-9-]+` and the value may not
contain `; { } < >`. An invalid name or a value that looks like a CSS-injection
attempt is silently rejected (the token is left unchanged). This keeps
`setCSSVar` safe to call with untrusted input.

The most useful overrides:

| Token | Controls |
|-------|----------|
| `--oe-primary` / `--oe-primary-hover` | Accent color (active buttons, primary actions) |
| `--oe-bg` / `--oe-fg` | Base surface + text |
| `--oe-border` / `--oe-border-strong` | Chrome borders |
| `--oe-focus-ring` | Keyboard focus outline |
| `--oe-radius` / `--oe-radius-lg` | Corner rounding |
| `--oe-font` / `--oe-font-mono` | UI + code font stacks |

The full list is in [THEME-TOKENS.md](./THEME-TOKENS.md).

### Token families

- **Core semantic** (`--oe-bg`, `--oe-fg`, `--oe-primary`, `--oe-border`, `--oe-focus-ring`, …) — the base surface, used everywhere.
- **Chrome** (`--oe-chrome-fg`, `--oe-chrome-border*`, `--oe-chrome-hover`, …) — toolbar / status bar / menus.
- **Panel** (`--oe-panel-fg`, `--oe-panel-border`, `--oe-panel-hover`, …) — plugin dialogs, the color picker, find bar, char grid, source view.
- **Inverse** (`--oe-inverse-bg`, `--oe-inverse-fg`, …) — floating chrome (link popover, image-editor toolbar, tooltip) that stays dark in **every** theme by design; these are the one family a custom theme should *not* expect to flip.
- **Callout** (`--oe-callout-info-fg`, `--oe-callout-warn-fg`, …) — in-content callout text, flipped for legibility on the dark editable.

Override any of these in your custom-theme block. A `no-color-literals` test in the
build fails if a component style ever hardcodes a color instead of a token, so the
theme surface stays complete — dark mode can't silently regress on a new panel.

---

## Writing your own theme (in your stylesheet)

Because a theme is only a set of semantic overrides scoped by `data-oe-theme`,
you can define your own without touching the editor. Give the wrapper a custom
`data-oe-theme` value, then style that value in your own stylesheet:

```js
// The editor builds a `.oe-wrapper` element inside the container you passed.
const wrapper = editor.getContainer().querySelector('.oe-wrapper');
wrapper.setAttribute('data-oe-theme', 'brand');
```

```css
/* your app's stylesheet */
.oe-wrapper[data-oe-theme="brand"] {
  --oe-bg: #0b1021;
  --oe-fg: #e8ecff;
  --oe-primary: #7c5cff;
  --oe-primary-hover: #9a80ff;
  --oe-border: #232a45;
  --oe-focus-ring: #7c5cff;
  --oe-shadow: 0 8px 32px rgba(0,0,0,0.7);
}
```

Override **only the semantic tier** — never the component styles. If a token
isn't listed, it inherits from light, so a partial theme is fine (override the
handful you care about and leave the rest).

> **iframe mode:** if you construct the editor with `iframe: true`, the editable
> lives in a separate document. `setTheme`/`setCSSVar` propagate the attribute
> and inline tokens into the iframe automatically, but a *custom* theme defined
> in your host stylesheet won't cross the iframe boundary for the editable's
> content area — inject your `[data-oe-theme="brand"]` block into the iframe too,
> or use `setCSSVar` (which sets on both).

---

## CSP compatibility

Open Editor injects its CSS via **Constructable Stylesheets**
(`document.adoptedStyleSheets`) — no dynamically-created `<style>` tags, no
`eval`, no `new Function()`. It runs cleanly under a strict policy:

```
Content-Security-Policy: script-src 'self'; style-src 'self'
```

No `unsafe-inline` or `unsafe-eval` is required. On engines without
Constructable Stylesheet support (Safari < 16.4, jsdom) it falls back to a
single `<style>` element created once — which needs `style-src 'unsafe-inline'`
only on those older engines.

---

## API reference

```js
// Construction
new OpenEditor(el, { theme: 'dark' })   // 'light' | 'dark' | 'minimal' | 'auto'

// Runtime
editor.setTheme('minimal')              // switch theme; emits 'themeChange'
editor.getTheme()                       // → current theme name
editor.setCSSVar('--oe-primary', '#f00')// per-instance token override (guarded)
editor.getCSSVar('--oe-primary')        // → computed value

// Read-only visual treatment (distinct from disabled)
editor.setReadOnly(true)                // legible + selectable content, inert toolbar
```

```js
editor.on('themeChange', ({ theme }) => {
  console.log('theme is now', theme);
});
```

### Read-only vs disabled

Read-only and disabled are visually **distinct** (15.8):

- **Disabled** (`.oe-disabled`) dims the content (`opacity: 0.5`), blocks
  selection, and shows a `not-allowed` cursor.
- **Read-only** (`.oe-readonly`, applied by `setReadOnly(true)`/`disable()`)
  keeps the content fully legible, keeps text **selectable** so users can read
  and copy, uses a neutral cursor, and marks the area with a faint muted tint.
  The toolbar stays muted and out of the tab order.
