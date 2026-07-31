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
- `editor.exportDocx(opts?)` — **async**: fetches remote images, builds the
  `.docx`, and triggers a browser download (`<title>.docx`). Resolves `true`/`false`.
- `editor.buildDocxBytes(opts?)` — **async**: resolves the raw `Uint8Array`
  (server-side / tests)

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

## Links & images

- **Links** are real clickable **`w:hyperlink`** relationships (external
  target, Hyperlink char style). `http(s)`/`mailto`/`tel`/anchor/relative hrefs
  are honored; unsafe schemes (e.g. `javascript:`) fall back to plain text.
- **Images — full embedding, including remote URLs (2026-07-18):** BOTH
  `data:` URIs (decoded in-process) AND remote `http(s)` images (fetched
  concurrently before the export runs) are embedded as real `word/media/`
  parts with a `w:drawing` (dimensions from width/height attrs or style).
  This is the common case — images inserted via the editor's normal upload
  flow are hosted/remote URLs, not `data:` URIs, so this fetch step is what
  makes "export to Word" actually show the pictures. A fetch failure for a
  SPECIFIC image (CORS block, 404, timeout, unsupported format) degrades only
  that image to a labeled placeholder (`[Image: alt]`) — it never aborts the
  whole export. Figure captions are always preserved as their own paragraph
  regardless of whether the image embedded.

Resource wiring (hyperlink/image relationships, media parts, content-types) is
collected by `docx-resources.js` + `image-fetch.js` and assembled in
`docx-parts.js`. `image-fetch.js` is the ONE place in the export path that
touches the network — it runs as a pre-pass (fetch every unique image URL
concurrently) BEFORE the (synchronous) OOXML tree-walk, so `bodyXml()` itself
stays pure; `exportDocx()`/`buildDocxBytes()` are therefore async. A `.docx`
with a real fetched remote image + hyperlinks + colored table is real-file
validated (`unzip -t` + `xmllint`, media part + rels present, confirmed no
`[Image: …]` placeholder text where an image successfully embedded).

## Remaining limitation

- None for image embedding (data: and remote http(s) both embed). The one
  documented gap is elsewhere: links carry their text/style but not (yet) a
  richer relationship-level metadata beyond the URL target itself.

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
