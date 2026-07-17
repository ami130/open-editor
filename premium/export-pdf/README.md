# @openeditor-premium/export-pdf (19.5)

Styled, page-configured **PDF export** via the browser's native print-to-PDF —
zero rendering dependencies. Gated on the `export.pdf` feature id.

Distinct from the free `editor.print()`, which dumps raw unstyled `getHTML()`
to a blank popup. This produces a **designed document**: `@page` setup, a
typographic print stylesheet, and an optional running header/footer.

## Usage

```js
import { createPremiumHost } from '@openeditor-premium/runtime';
import { createExportPdfPlugin } from '@openeditor-premium/export-pdf';

const host = await createPremiumHost({ license, keys });
editor.plugins.install(createExportPdfPlugin(host, {
  pageSize: 'A4',            // A4 | Letter | Legal | A3 | A5
  orientation: 'portrait',  // portrait | landscape
  margin: '20mm',           // any CSS length (brace/semicolon rejected)
  header: 'Acme Corp',      // optional running header (escaped)
  footer: 'Confidential',   // optional running footer (escaped)
  fontFamily: '…',          // optional body font stack (escaped)
  title: 'My Document',     // <title> + PDF name hint
}));
```

Granted → a **"Export to PDF"** toolbar button + an imperative
`editor.exportPdf(overrideOpts?)`. Denied → graceful degrade (no button, no
handle, one dismissible upgrade notice; the free editor is untouched).

Config precedence: per-call override → `editor._config.exportPdf` →
install-time config → built-in defaults.

## Table & color fidelity (2026-07-17)

The print stylesheet replicates the editor's table style-preset **classes**
(`oe-table--bordered/striped/dotted/borderless`) with literal token values, and
resolves the striped fill from the table's `--oe-table-stripe` custom property
(which passes through `getHTML()`). Because inline `style=""` on a cell/table
wins by CSS specificity, any **custom cell/header/border colors** you set in the
editor carry straight into the PDF. Captions and `<col>` percentage widths are
preserved. (This fixed the reported "table color not showing" in PDF.)

## Design notes

- **`buildPrintDocument(html, opts)`** is pure (no window/DOM) — trivially
  unit-tested. The plugin feeds it `getHTML()` (already output-sanitized) and
  hands the result to a browser popup + `window.print()` (same safe mechanism
  as free `editor.print()`; fails gracefully on popup-block / CSP).
- Content HTML is trusted (sanitized upstream) and passes through verbatim;
  **option strings** (title/header/footer/font/margin) are escaped/validated
  here so an integrator value can't inject markup or break out of the CSS.
- Emits `afterCommand:exportPdf` on success, `exportPdfBlocked` on
  popup/CSP failure.
