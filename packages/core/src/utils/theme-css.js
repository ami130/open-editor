/**
 * theme-css.js — Phase 15 design tokens (the theme surface).
 *
 * Three tiers (see docs/THEME-TOKENS.md):
 *   1. primitives  — raw palette (--oe-c-*), never referenced by components
 *   2. semantic    — what components use (--oe-bg, --oe-primary, …); a THEME
 *                    overrides ONLY this tier
 *   3. component   — every *-styles.js references semantic tokens, no literals
 *
 * LIGHT is the default and its values are the EXACT colors/metrics the editor
 * shipped with before tokenization, so Stage-2 output is pixel-identical (the
 * snapshot tests enforce this). Dark/minimal (Stage 3) override the semantic tier.
 *
 * Placed on BOTH `:root` and `.oe-wrapper` so tokens cascade to the chrome (host
 * document) AND the editable — including iframe mode, where this same block is
 * embedded in BASE_CSS injected into the iframe document.
 */

// The semantic + primitive light values, as a CSS declaration body (no selector).
export const THEME_TOKENS_LIGHT = `
  /* ── primitives ── */
  /* Neutrals carry a faint cool/indigo bias (not pure gray) — the subtle cue
     that separates a "designed" surface from a default one (Modern-SaaS look). */
  --oe-c-white:#ffffff;
  --oe-c-gray-50:#f8fafc; --oe-c-gray-100:#f1f3f9; --oe-c-gray-150:#e6e9f0;
  --oe-c-gray-200:#d3d8e3; --oe-c-gray-300:#c2c8d6; --oe-c-gray-400:#98a1b3;
  --oe-c-gray-500:#69707f; --oe-c-gray-700:#3a4150; --oe-c-gray-800:#1e2530;
  --oe-c-gray-900:#0f1218;
  /* primary-400/500 tuned to clear WCAG AA (4.5:1 text / 3:1 UI) — checked
     against BOTH white AND the active-pill tint (--oe-active-bg #e8ecfe),
     since --oe-primary renders as text on both. #4560e8 passed on white
     (5.13:1) but only 4.37:1 on the pill tint (fails); #3f57df clears both
     (5.77:1 / 4.91:1). Same indigo hue, just deep enough in every context. */
  --oe-c-primary-400:#5478e0; --oe-c-primary-500:#3f57df;
  /* -600 (hover) re-darkened to stay a visible step below the new -500 (the
     old -600 was nearly the same luminance as the new -500, flattening hover
     feedback to almost nothing). */
  --oe-c-primary-600:#3348c4; --oe-c-primary-700:#3547b8;
  --oe-c-danger-100:#fef2f2; --oe-c-danger-200:#fecaca;
  --oe-c-danger-500:#dc2626; --oe-c-danger-600:#b91c1c; --oe-c-danger-accent:#e53935;
  /* status accents (info/warning/success/danger) are a FIXED semantic palette —
     the same hue in every theme; callout bg/text adapt around them via mix + fg */
  --oe-c-info:#1e88e5; --oe-c-warning:#f5c518; --oe-c-success:#43a047;

  /* ── semantic (theme surface) ── */
  --oe-bg:var(--oe-c-white);
  --oe-bg-muted:var(--oe-c-gray-50);
  --oe-bg-hover:var(--oe-c-gray-100);
  --oe-bg-active:#e8ecfe;
  --oe-fg:var(--oe-c-gray-800);
  --oe-fg-muted:var(--oe-c-gray-500);
  --oe-fg-placeholder:var(--oe-c-gray-400);
  --oe-border:var(--oe-c-gray-150);
  --oe-border-strong:var(--oe-c-gray-200);
  --oe-divider:var(--oe-c-gray-200);
  --oe-primary:var(--oe-c-primary-500);
  --oe-primary-hover:var(--oe-c-primary-600);
  --oe-primary-fg:var(--oe-c-white);
  --oe-link:var(--oe-c-primary-700);
  --oe-danger:var(--oe-c-danger-500);
  --oe-danger-hover:var(--oe-c-danger-600);
  --oe-danger-fg:var(--oe-c-white);
  --oe-focus-ring:var(--oe-c-primary-400);
  --oe-overlay:rgba(15,18,24,0.45);
  /* Soft, layered elevation (Modern-SaaS): a tight ambient shadow + a wider
     diffuse one, both low-opacity, paired with hairline borders on panels. */
  --oe-shadow:0 12px 32px -8px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08);
  --oe-shadow-sm:0 1px 2px rgba(15,23,42,0.08), 0 1px 1px rgba(15,23,42,0.04);
  --oe-shadow-md:0 6px 20px -4px rgba(15,23,42,0.14), 0 2px 6px rgba(15,23,42,0.06);
  --oe-tooltip-bg:var(--oe-c-gray-800);   /* tooltip stays dark across themes */
  --oe-tooltip-fg:var(--oe-c-white);

  /* Exact-value tokens for surfaces whose original literal differs slightly from
     a scale step — light values are IDENTICAL to what shipped (so snapshots stay
     pixel-perfect), but dark/minimal can now override them. */
  --oe-chrome-fg:#3a4150;                 /* toolbar/dropdown text */
  --oe-chrome-border:#e6e9f0;             /* toolbar/statusbar/hr/pre border */
  --oe-chrome-border-2:#e0e4ec;           /* dd-panel border */
  --oe-chrome-border-3:#ccd2e0;           /* custom-input border */
  --oe-chrome-divider:#e0e4ec;            /* split-button chevron divider */
  --oe-chrome-divider-2:#eef0f5;          /* dd-custom top border */
  --oe-chrome-hover:#eef0f6;              /* toolbar/dd hover — soft neutral */
  --oe-active-bg:#e8ecfe;                 /* active toolbar item — soft accent pill */
  --oe-active-border:#c5cffb;             /* active toolbar item border */
  --oe-sep:#e6e9f0;                       /* toolbar separator */
  --oe-input-bg:#f5f7fb;                  /* dd-apply / pre background */
  --oe-code-bg:#eef0f6;                   /* inline code background */
  --oe-editor-fg:#333333;                 /* body text default in content */
  --oe-editor-fg-soft:#555555;            /* h6, blockquote text (#555) */
  --oe-editor-fg-strong:#222222;          /* pull-quote text (#222) */
  --oe-content-placeholder:#aaaaaa;       /* empty-editor placeholder (#aaa) */

  /* Panel tokens — plugin dialogs/popovers use a slate palette slightly distinct
     from the chrome grays; light == the original literal (snapshots stay exact),
     dark values flip so panels reskin. */
  --oe-panel-fg:#334155;                  /* dialog/panel body text (#334155) */
  --oe-panel-fg-muted:#64748b;            /* panel secondary text (#64748b) */
  --oe-panel-fg-faint:#94a3b8;            /* panel faint label (#94a3b8) */
  --oe-panel-border:#e2e8f0;              /* panel/preview border (#e2e8f0) */
  --oe-panel-hover:#f1f5f9;               /* panel row/btn hover + table th bg (#f1f5f9) */
  --oe-primary-tint:#eff6ff;              /* light primary-wash bg (#eff6ff/#f0f4ff) */
  --oe-primary-tint-strong:#dbeafe;       /* stronger primary-wash (#dbeafe/#bfdbfe) */
  --oe-primary-wash:rgba(37,99,235,0.16); /* selected-cell primary wash (light surface) */
  --oe-primary-wash-soft:rgba(37,99,235,0.04); /* faint drag-over wash on the editable */
  --oe-ok-hover:#357abd;                  /* primary confirm-button hover (#357abd) */
  --oe-bq-border:#c5c5c5;                 /* blockquote left border (#c5c5c5) */
  --oe-callout-info-fg:#1a3a5c;           /* callout text — flips legible in dark */
  --oe-callout-warn-fg:#5a3e00;
  --oe-callout-success-fg:#1b3a20;
  --oe-callout-danger-fg:#4a0a0a;

  /* Inverse floating chrome — link popover, image-editor toolbar, tooltip. These
     are DELIBERATELY dark in every theme (a floating surface over content); they
     are tokens (not literals) but are NOT overridden by dark/minimal. */
  --oe-inverse-bg:#1e293b;
  --oe-inverse-fg:#e2e8f0;
  --oe-inverse-fg-dim:#cbd5e1;
  --oe-inverse-hover:rgba(255,255,255,0.14);
  --oe-inverse-active:rgba(255,255,255,0.18);
  --oe-inverse-sep:rgba(255,255,255,0.18);
  --oe-inverse-focus:#60a5fa;
  --oe-inverse-danger-bg:rgba(220,38,38,0.28);
  --oe-inverse-danger-fg:#fecaca;

  /* ── metrics ── */
  --oe-radius:6px; --oe-radius-sm:4px; --oe-radius-lg:10px;
  --oe-tap-min:44px;

  /* ── typography ── */
  --oe-font:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  --oe-font-mono:'SF Mono','Fira Code','Consolas',monospace;
`;

// ── Dark theme (15.3) — overrides ONLY the semantic tier. ──
// A theme is selected by data-oe-theme on the wrapper; light is the default.
export const THEME_TOKENS_DARK = `
  /* Cool blue-black "pro dark" (not flat gray) with the indigo accent. */
  --oe-bg:#14171f;
  --oe-bg-muted:#1a1e28;
  --oe-bg-hover:#232834;
  --oe-bg-active:#2a3358;
  --oe-fg:#e6e9f0;
  --oe-fg-muted:#98a1b3;
  --oe-fg-placeholder:#69707f;
  --oe-border:#2b3140;
  --oe-border-strong:#3a4150;
  --oe-divider:#2b3140;
  --oe-primary:#6b8fef;
  --oe-primary-hover:#8aa5f5;
  --oe-link:#8aa5f5;
  --oe-overlay:rgba(0,0,0,0.62);
  --oe-shadow:0 12px 32px -8px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5);
  --oe-shadow-md:0 6px 20px -4px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.4);
  /* chrome + editable exact-value tokens flip too, so text stays legible */
  --oe-chrome-fg:#e6e9f0; --oe-chrome-border:#2b3140; --oe-chrome-border-2:#2b3140;
  --oe-chrome-border-3:#3a4150; --oe-chrome-divider:#3a4150; --oe-chrome-divider-2:#232834;
  --oe-chrome-hover:#232834; --oe-active-bg:#2a3358; --oe-active-border:#4059c0;
  --oe-sep:#2b3140; --oe-input-bg:#1a1e28; --oe-code-bg:#232834;
  --oe-editor-fg:#e6e9f0; --oe-editor-fg-soft:#b0b6c4; --oe-editor-fg-strong:#f2f4f8;
  --oe-content-placeholder:#69707f;
  /* panel tokens flip so plugin dialogs/popovers reskin dark */
  --oe-panel-fg:#e6e9f0; --oe-panel-fg-muted:#98a1b3; --oe-panel-fg-faint:#69707f;
  --oe-panel-border:#2b3140; --oe-panel-hover:#232834;
  --oe-primary-tint:#1a2544; --oe-primary-tint-strong:#243466; --oe-ok-hover:#8aa5f5;
  --oe-primary-wash:rgba(107,143,239,0.26); --oe-primary-wash-soft:rgba(107,143,239,0.10);
  --oe-bq-border:#3a4150;
  /* callout text lightened for legibility on the dark editable */
  --oe-callout-info-fg:#7fb0e0; --oe-callout-warn-fg:#e0c060;
  --oe-callout-success-fg:#7fd090; --oe-callout-danger-fg:#f0a0a0;
  /* NOTE: --oe-inverse-* are intentionally NOT overridden — floating chrome
     stays dark in every theme (consistent with the tooltip). */
`;

// ── Minimal theme (15.4) — embed-friendly, flat: no shadows/radius, toolbar
// blends into the editor. Light palette, just stripped chrome. ──
export const THEME_TOKENS_MINIMAL = `
  --oe-bg-muted:var(--oe-c-white);
  --oe-shadow:none; --oe-shadow-sm:none; --oe-shadow-md:none;
  --oe-radius:0; --oe-radius-sm:0; --oe-radius-lg:0;
  --oe-bg-active:var(--oe-c-gray-100);
  --oe-active-bg:var(--oe-c-gray-100);
  --oe-active-border:var(--oe-c-gray-200);
`;

// Selector-scoped block for injection into a document (host or iframe).
// Light on :root/.oe-wrapper; themes on the [data-oe-theme] attribute so a
// single attribute change re-cascades every token (flash-free runtime switch).
// 15.10 auto: when data-oe-theme="auto", follow the OS via prefers-color-scheme.
export const THEME_TOKENS_CSS = `
  :root, .oe-wrapper { ${THEME_TOKENS_LIGHT} }
  .oe-wrapper[data-oe-theme="dark"] { ${THEME_TOKENS_DARK} }
  .oe-wrapper[data-oe-theme="minimal"] { ${THEME_TOKENS_MINIMAL} }
  @media (prefers-color-scheme: dark) {
    .oe-wrapper[data-oe-theme="auto"] { ${THEME_TOKENS_DARK} }
  }
`;
