# @openeditor-premium/seo (19.4)

**SEO Analyzer** — read-only content analysis. Gated on the `seo` feature id.
Never mutates the document.

## Usage

```js
import { createPremiumHost } from '@openeditor-premium/runtime';
import { createSeoPlugin } from '@openeditor-premium/seo';

const host = await createPremiumHost({ license, keys });
editor.plugins.install(createSeoPlugin(host, { keyword: 'rich text editor' }));
```

Granted → a **"SEO Analysis"** toolbar button (opens a panel) + a headless
`editor.analyzeSeo(opts?)` returning the report object. Denied → graceful
degrade (no button, no handle, dismissible notice).

## What it reports

- **Overall score** (0–100) from a pass/warn checklist
- **Word count** and **heading structure** (+ outline warnings: no H1,
  multiple H1s, skipped levels)
- **Keyword density** for a focus keyword (whole-word, phrase-aware,
  regex-safe) with a healthy-range assessment (~0.5–2.5%)
- **Readability** — Flesch Reading Ease + a plain-language label
- **Meta description** length assessment (120–158 best practice)
- **Top words** (for keyword suggestions)

### Advanced analysis (2026-07-17)

- **Content depth** — average sentence length, long-sentence %, passive-voice
  estimate, transition-word %
- **Link & image SEO** — internal/external/empty/nofollow link counts, images
  missing alt text
- **Keyword intelligence** — keyword presence in the H1, first paragraph,
  subheadings, and meta; related-phrase (bigram) suggestions
- **Search-result snippet preview** — a Google-style title/URL/description
  preview + a title-length check (30–60 chars)

The panel has live inputs (focus keyword, meta description) that re-run the
analysis against the **current** editor content on each keystroke, updating the
score, checklist, snippet preview, and related-phrase chips.

### Fixes (2026-07-17)

- **Keyword + meta description persist** for the editor's lifetime — reopening
  the panel restores what you typed (they were transient before).
- **Score is stable** when you type a keyword: only the core checks (word count,
  H1, outline, meta, readability) are scored; keyword-placement + advanced
  checks are shown as unscored guidance, so the score no longer lurches.
- **Accented / non-Latin keywords** (café, Москва, CJK) are found — density and
  placement use Unicode word boundaries, not ASCII `\b`.
- **Passive-voice** no longer false-alarms on common copula+adjective phrases
  ("is excited", "is committed").
- **Related phrases** exclude all-stopword bigrams ("and the").
- **Title** falls back to the document's H1 when none is configured.

## Architecture (pure, tested)

- **`readability.js`** — Flesch Reading Ease + heuristic syllable counting.
- **`seo-advanced.js`** — content-depth, link/image, and keyword-intelligence
  metrics (+ n-gram related phrases). Pure.
- **`seo-checks.js`** — turns metrics into checklist rows + the snippet-preview
  model; all thresholds live here.
- **`seo-analyze.js`** — `analyzeSeo(html, opts, doc)` composes the full report.
  Pure; parses a detached copy of the HTML, never touches the live editor.
- **`seo-panel.js`** — renders a report (score, checks, snippet, chips) into a
  DOM Node for the modal body; theme-aware. Takes an `analyze` callback so it
  always scores live content.

47 unit + 7 e2e (×3 engines), including a test that proves the document is
byte-identical before and after analysis (read-only guarantee). Heuristics
(syllable count, passive-voice) are labeled estimates, as every JS SEO tool's.
