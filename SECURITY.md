# Security Policy

Open Editor handles untrusted HTML (paste, `setHTML`, drag-drop, autosave
restore), so XSS resistance is a first-class concern.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** — do not open a public
issue for an unpatched flaw. Email the maintainers (or use the repository's
private security-advisory channel) with:

- a description and impact assessment,
- a minimal reproduction (the smallest HTML/config that triggers it),
- affected version(s).

You'll get an acknowledgement, and fixes for confirmed issues are prioritized.

## Security model

**Sanitize by default, on both input and output.** The `sanitize` config option
defaults to `true`. Content is sanitized when it enters the editor *and* again in
`getHTML()` output — because content can reach the DOM through paths the input
sanitizer never saw (drag-drop, IME, programmatic DOM writes).

What the sanitizer blocks (see `packages/core/src/sanitizer/`):

- **Dangerous elements** — `<script>`, `<noscript>`, `<style>`, `<link>`,
  `<meta>`, `<base>`, `<object>`, `<embed>`, `<applet>`, `<iframe>`, `<frame>`,
  `<frameset>` are stripped entirely (subtree included).
- **Event-handler attributes** — every `on*` attribute is removed (input pass +
  a second mXSS re-strip after re-parsing).
- **Dangerous URLs** — `javascript:`, `vbscript:`, `data:`, `blob:`,
  `filesystem:`, and unknown schemes are rejected on `href`/`src`/`action`/
  `cite`/`xlink:href` (control characters are decoded before matching).
- **CSS injection** — `expression()`, `url(javascript:)`, `behavior:`,
  `-moz-binding` in `style` (CSS hex-escapes and comments are decoded first).
- **`srcdoc`** on any iframe is always removed.
- **mXSS** — content is re-parsed and re-sanitized to catch mutation-based
  bypasses, not a single parse-only pass.

**Media embeds** are the one narrow iframe exception: only HTTPS iframes whose
host is on a provider allowlist, carrying a mandatory `sandbox` limited to an
allowed token set, with attributes trimmed and children emptied.

**`target="_blank"` links** get `rel="noopener noreferrer"` enforced by token.

## Opting out

Setting `sanitize: false` disables sanitization entirely — only do this when
**you** fully control every source of content. `imageAllowDataUri: true`
permits `data:` image URIs; leave it off unless you need inline images.

## Runtime hardening

- **CSP-compatible** — no `eval`, no `new Function()`, no dynamically injected
  `<style>` on the modern path (Constructable Stylesheets). Works under
  `script-src 'self'; style-src 'self'`.
- Internal failures surface via the `error` event rather than throwing into your
  app — see [docs/ERROR-REPORTING.md](./docs/ERROR-REPORTING.md).
