# @openeditor-premium/export-docx (19.5)

Export editor content to a real Microsoft Word **`.docx`** — hand-generated
OOXML (WordprocessingML) packaged in a **zero-dependency** STORE-method ZIP.
No JSZip, no `docx` library. Gated on the `export.docx` feature id.

## Usage

```js
import { createPremiumHost } from '@openeditor-premium/runtime';
import { createExportDocxPlugin } from '@openeditor-premium/export-docx';

const host = await createPremiumHost({ license, keys });
editor.plugins.install(createExportDocxPlugin(host, { title: 'Quarterly Report' }));
```

Granted → a **"Export to Word"** toolbar button, plus:
- `editor.exportDocx(opts?)` — build + trigger a browser download (`<title>.docx`)
- `editor.buildDocxBytes(opts?)` — the raw `Uint8Array` (server-side / tests)

Denied → graceful degrade (no button, no handles, one dismissible notice).
Config precedence: per-call → `editor._config.exportDocx` → install → default.

## What converts

Headings (→ Heading1–6 styles), bold/italic/underline/strike/inline-code
runs, **inline text color, highlight, and font-size** (from `<span style>` /
`<mark>`), superscript/subscript, bullet + ordered lists **with nesting**
(numbering.xml ilvl), blockquotes (Quote style), fenced code blocks (CodeBlock
style, one paragraph per line), and horizontal rules. A title paragraph is
prepended.

**Full table fidelity** (2026-07-17): style presets (bordered → thicker
borders, dotted → dotted, borderless → no grid, striped → even-row shading
resolving the editor's `--oe-table-stripe`), per-cell **background shading**
(`w:shd`), **text color**, per-side **borders** (`w:tcBorders`, color + style
from inline CSS), header fill, **column widths** (`<col>` % → `w:gridCol`
twips), vertical alignment, and **captions** (a Caption-styled paragraph before
the table). CSS colors (`#rgb`, `#rrggbb`, `rgb()/rgba()`, named) are parsed to
OOXML hex; a colored table is real-file validated (`unzip -t` + `xmllint`).

## Links & images (2026-07-17)

- **Links** are now real clickable **`w:hyperlink`** relationships (external
  target, Hyperlink char style). `http(s)`/`mailto`/`tel`/anchor/relative hrefs
  are honored; unsafe schemes (e.g. `javascript:`) fall back to plain text.
- **Images**: `data:` URIs are **embedded** as real `word/media/` parts with a
  `w:drawing` (dimensions from width/height attrs or style). Remote `http(s)`
  images can't be fetched synchronously, so they render a labeled placeholder
  (`[Image: alt]`) rather than being silently dropped — figure captions are
  always preserved as their own paragraph.

Resource wiring (hyperlink/image relationships, media parts, content-types) is
collected during the DOM walk by `docx-resources.js` and assembled in
`docx-parts.js`. A `.docx` with an embedded image + hyperlinks is real-file
validated (`unzip -t` + `xmllint`, media part + rels present).

## Remaining limitation

- Remote image **bytes** are not fetched (would require an async pipeline +
  CORS); only `data:` images embed. Placeholder keeps content visible.

## Architecture (three pure, independently-tested layers)

1. **`zip-store.js`** — minimal STORE-method ZIP writer (CRC-32, local +
   central directory + EOCD). Validated against a known-answer CRC and real
   `unzip -t`. Deterministic output (fixed DOS timestamp).
2. **`ooxml-body.js`** — canonical DOM → `<w:body>` inner XML. Same block/inline
   walk as the Markdown/PDF serializers. XML-escaped throughout.
3. **`docx-parts.js`** — the fixed boilerplate parts (`[Content_Types].xml`,
   rels, `styles.xml`, `numbering.xml`) + `buildDocx()` assembly. Every style
   id referenced by the body is defined here (a test enforces the lockstep).

The acceptance test (`docx-roundtrip.test.js`) re-reads the produced ZIP and
parses every XML part, proving a valid package — not just plausible strings.
