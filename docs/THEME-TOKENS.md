# Phase 15 — Theme Token Reference (Stage 0 design lock)

> **Historical note:** this document captures the *original* Phase 15 palette
> derivation (the token **names**, tiers, and override structure are still
> accurate and unchanged). The specific hex **values** quoted below were
> superseded by the later "Modern SaaS" UI redesign (indigo accent, cool
> hue-biased neutrals, larger radii). For the live values, read
> [`theme-css.js`](../packages/core/src/utils/theme-css.js) directly — it is
> always the source of truth. Kept here for the design rationale, not as a
> current color reference.

This is the **design spec** for the theme system. No runtime behavior — it defines
the token names, the three tiers, and the light/dark/minimal override maps that
Stage 2–3 will implement. Grounded in the *actual* colors currently hardcoded in
the 15 style files (measured, not invented).

## Principle: three tiers

1. **Primitive** — the raw palette. Never referenced by components directly.
2. **Semantic** — what components reference (`--oe-bg`, `--oe-primary`, …). A theme
   overrides ONLY this tier.
3. **Component** — every `*-styles.js` file uses semantic tokens; zero literals.

Consolidation from the current mess: the codebase today has ~40 distinct hex
values including 4 near-duplicate blues (`#2563eb` ×31, `#4a90d9` ×10, `#1a5fb4`,
`#1e88e5`) and two overlapping gray families (Tailwind `#f3f4f6…#1f2937` + slate
`#f1f5f9…#1e293b` + shorthand `#fff/#ccc/#ddd/#555/#333`). These collapse to ONE
gray scale + ONE primary scale.

---

## Tier 1 — Primitives (light theme values)

```
/* Neutral scale (merges the Tailwind gray, slate, and #xxx shorthand families) */
--oe-c-white:   #ffffff;   /* was #fff (×41) */
--oe-c-gray-50: #fafafa;   /* toolbar bg, #f5f5f5/#fafafa */
--oe-c-gray-100:#f3f4f6;   /* hover bg, #ececec/#f0f0f0 */
--oe-c-gray-150:#e5e7eb;   /* subtle borders, #e0e0e0/#eee */
--oe-c-gray-200:#d1d5db;   /* borders, #ccc/#ddd/#d0d0d0 */
--oe-c-gray-300:#cbd5e1;   /* stronger borders, #94a3b8-ish */
--oe-c-gray-400:#9ca3af;   /* placeholder, #aaa */
--oe-c-gray-500:#6b7280;   /* muted text, #666 */
--oe-c-gray-700:#374151;   /* secondary text, #555 */
--oe-c-gray-800:#1f2937;   /* strong text, #333/#222 */
--oe-c-gray-900:#111111;   /* near-black */

/* Primary scale (merges #2563eb / #4a90d9 / #1a5fb4 / #1e88e5) */
--oe-c-primary-400:#4a90d9; /* focus ring hue */
--oe-c-primary-500:#2563eb; /* primary action */
--oe-c-primary-600:#1d4ed8; /* primary hover */
--oe-c-primary-700:#1a5fb4; /* link text */

/* Danger scale (#dc2626 / #e5484d / #fecaca / #fef2f2) */
--oe-c-danger-100:#fef2f2;
--oe-c-danger-200:#fecaca;
--oe-c-danger-500:#dc2626;
--oe-c-danger-600:#b91c1c;

/* Accent hues used by blockquote callouts (info/warn/success) — kept as-is */
--oe-c-info:#1e88e5; --oe-c-warning:#f5c518; --oe-c-success:#43a047;
```

## Tier 2 — Semantic tokens (the theme surface)

```
/* Surfaces */
--oe-bg:            var(--oe-c-white);      /* editable + panel background */
--oe-bg-muted:      var(--oe-c-gray-50);    /* toolbar / statusbar bg */
--oe-bg-hover:      var(--oe-c-gray-100);   /* button/option hover */
--oe-bg-active:     #d6e6f7;                /* active toolbar item */

/* Text */
--oe-fg:            var(--oe-c-gray-800);   /* primary text */
--oe-fg-muted:      var(--oe-c-gray-500);   /* secondary text, counts */
--oe-fg-placeholder:var(--oe-c-gray-400);

/* Borders / lines */
--oe-border:        var(--oe-c-gray-150);   /* default border */
--oe-border-strong: var(--oe-c-gray-200);
--oe-divider:       var(--oe-c-gray-200);

/* Brand / intent */
--oe-primary:       var(--oe-c-primary-500);
--oe-primary-hover: var(--oe-c-primary-600);
--oe-primary-fg:    var(--oe-c-white);      /* text on primary */
--oe-link:          var(--oe-c-primary-700);
--oe-danger:        var(--oe-c-danger-500);
--oe-danger-hover:  var(--oe-c-danger-600);
--oe-danger-fg:     var(--oe-c-white);
--oe-focus-ring:    var(--oe-c-primary-400);

/* Overlays (currently rgba literals) */
--oe-overlay:       rgba(0,0,0,0.35);       /* modal backdrop */
--oe-shadow:        0 8px 32px rgba(0,0,0,0.22);
--oe-shadow-sm:     0 1px 3px rgba(0,0,0,0.12);

/* Metrics (the ~491 px literals collapse to a scale) */
--oe-space-1:2px; --oe-space-2:4px; --oe-space-3:8px; --oe-space-4:12px; --oe-space-5:16px;
--oe-radius:4px; --oe-radius-sm:3px; --oe-radius-lg:6px;
--oe-tap-min:44px;                          /* 14.10 mobile tap target */

/* Typography */
--oe-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--oe-font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;
--oe-font-size: 14px;

/* z-index (already exist — keep) */
--oe-z-toolbar:10; --oe-z-bubble:100; --oe-z-menu:950; --oe-z-modal:1000; --oe-z-fullscreen:9999;
```

## Tier 3 — Component usage rule
Every `*-styles.js` references Tier-2 tokens only. Example transform:
`background:#fafafa` → `background:var(--oe-bg-muted)`;
`outline:2px solid #4a90d9` → `outline:var(--oe-space-1) solid var(--oe-focus-ring)`.

**Exempt / preserved as-is:** `--bq-accent` (per-blockquote user color, set at runtime
by the color picker — NOT a theme token); `forced-colors` block (Phase 14, uses
system colors `CanvasText/Highlight` — must stay, wins over tokens in HC mode).

---

## Theme override maps (Tier-2 only)

### Light (default) — values above.

### Dark (`[data-oe-theme="dark"] .oe-wrapper`, or on the wrapper)
```
--oe-bg:            #1e1e1e;
--oe-bg-muted:      #252526;
--oe-bg-hover:      #2d2d30;
--oe-bg-active:     #094771;
--oe-fg:            #e4e4e4;
--oe-fg-muted:      #9ca3af;
--oe-fg-placeholder:#6b7280;
--oe-border:        #3c3c3c;
--oe-border-strong: #4a4a4a;
--oe-divider:       #3c3c3c;
--oe-primary:       #4a90d9;   /* lighter for contrast on dark */
--oe-primary-hover: #6ba4e0;
--oe-link:          #6ba4e0;
--oe-overlay:       rgba(0,0,0,0.6);
/* danger/focus/accent inherit primitives; shadows darken */
--oe-shadow:        0 8px 32px rgba(0,0,0,0.6);
```

### Minimal (`[data-oe-theme="minimal"]`) — embed-friendly, flat
```
--oe-bg-muted:      var(--oe-c-white);   /* toolbar blends into editor */
--oe-border:        var(--oe-c-gray-150);
--oe-shadow:        none;
--oe-shadow-sm:     none;
--oe-radius:        0;  --oe-radius-sm:0; --oe-radius-lg:0;
--oe-bg-active:     var(--oe-c-gray-100);
```

### Read-only (15.8, `.oe-wrapper.oe-readonly`) — DISTINCT from disabled
Disabled today = `opacity:0.5; cursor:not-allowed` (whole thing dimmed).
Read-only should read as "viewable, not editable", NOT broken:
```
--oe-bg:            var(--oe-c-gray-50);  /* faint tint so it reads non-editable */
/* toolbar muted (formatting buttons disabled) but NOT 50%-opacity-dimmed;
   caret hidden; cursor: default over the editable (not not-allowed). */
```

### Auto (15.10)
`theme:'auto'` emits BOTH light defaults and a `@media (prefers-color-scheme: dark)`
block carrying the dark override map, so it follows the OS with no JS.

### Flash guard (15.11)
`data-oe-theme` is stamped on the wrapper element BEFORE the first stylesheet is
adopted (in `_buildDOM`, from `config.theme`), so the first paint is already the
target theme — no light→dark flip.

---

## Open items resolved
- Injection: **Constructable Stylesheets** (`adoptedStyleSheets`) + `<style>` fallback.
- Theme selector mechanism: **`data-oe-theme` attribute on `.oe-wrapper`** (not separate
  stylesheets) → switching is a single attribute change, tokens cascade, zero re-inject,
  inherently flash-free (15.5).
- Scope of "minimal": kept (user opted for full recommended plan).
