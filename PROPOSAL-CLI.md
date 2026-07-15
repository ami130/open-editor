# Proposal — Open Editor CLI & the Editor Family

**Prepared:** 2026-07-15 (updated same day: names now CLAIMED) · **Status:** naming
executed; CLI build awaiting scheduling · **Build cost:** ~2–3 days (CLI only)

---

## 1. Summary

Turn Open Editor from a single product (rich text editor) into an **in-browser editing
suite**: a family of editors (text today, image and more later) that developers install
with **one command**, in **any framework** (React, Vue, Angular, or plain JavaScript).

A small command-line tool (CLI) becomes the front door to the whole family:

```
npx openeditors add text        →  a working rich text editor in one line
npx openeditors add image       →  the image editor, when it ships
```

The text editor is already live on npm (`@open-editor-hq/core@1.1.0`) with official
React, Vue, and Angular wrappers built and tested. **Nothing already built changes** —
the CLI sits on top of it.

---

## 2. The user experience

### Door 1 — zero-install (the modern standard, used by shadcn / Next.js)

```
npx openeditors add text
```

No setup, nothing to install first, always the latest version. The CLI runs once and:

1. Detects the project's framework (React / Vue / Angular / none) from its `package.json`.
2. Detects the package manager (npm / pnpm / yarn).
3. Installs `openeditor-text` **plus the matching framework wrapper**.
4. Prints ready-to-paste starter code for that exact framework.

### Door 2 — global install (gives the exact `openeditor` command)

```
npm i -g openeditors
openeditor add text
openeditor add image
```

After a one-time global install, the terminal command is literally **`openeditor`** —
terminal command names are not reserved on npm, only package names are.

### Direct install (pros & CI systems — always available)

```
npm i openeditor-text openeditor-text-react     # or -vue / -angular
```

---

## 3. Naming reality — and what we now OWN (executed 2026-07-15)

The ideal names `open-editor` / `openeditor` **cannot exist — for anyone, ever**:

- The package `open-editor` has been owned since **2015** by Sindre Sorhus, one of
  the most prominent maintainers on npm (1000+ active packages). He also owns
  `open-editor-cli`. Real, maintained tools — not disputable, not buyable.
- **npm's anti-typosquatting rule** blocks any new name that differs from an existing
  package only by punctuation: `openeditor` ≡ `open-editor`, so npm rejected it at
  publish (verified with a real publish attempt, 2026-07-15).
- The `@openeditor` org/scope belongs to an unrelated active product (verified
  2026-07-15). The `@open-editor` scope is platform-blocked by Sindre's package.

**What we claimed instead — LIVE on npm since 2026-07-15 (v0.0.2 placeholders),
managed under our new `openeditors` npm organization:**

| Package (live) | Purpose |
|---|---|
| `openeditors` | the CLI → `npx openeditors add text` · global command `openeditor` |
| `openeditor-text` | rich text editor engine |
| `openeditor-text-react` / `-vue` / `-angular` | official framework wrappers |
| `openeditor-image` | reserved for the future image editor |

The plural `openeditors` legally clears the similarity rule, matches the suite story
("many editors"), and the marketing brand stays exactly **"Open Editor"**. Owning the
`openeditors` org also locks the `@openeditors` scope away from the competitor.
Placeholders exist purely to hold the names; real code ships over them at the
month-end release, and `@open-editor-hq/core` is then deprecated with a pointer.

---

## 4. Why offer both npx and npm?

Every serious tool does — they are two doors to the same thing, not two products:

| Tool | npx door | npm door |
|---|---|---|
| shadcn/ui | `npx shadcn add …` | manual install documented |
| Angular | `npx @angular/cli new` | `npm i -g @angular/cli` → `ng` |
| Next.js | `npx create-next-app` | `npm i next` |
| **Open Editor** | `npx openeditors add text` | `npm i -g openeditors` → `openeditor` |

**npx** = run once, nothing left behind, always latest — perfect for the installer.
**npm** = install and keep — how the editor itself (a library the app imports) is
delivered. The npx command simply runs the npm installs for the user.

Docs rule: every page leads with ONE canonical form (`npx openeditors add text`);
the other doors are listed below it. One headline command = zero confusion.

---

## 5. Source-code protection (differs from shadcn on purpose)

shadcn's model copies **readable source files** into the user's project. Our policy is
the opposite: **no readable source ships**. Our CLI therefore installs compiled,
minified npm packages only (the same model as Angular's `ng add`). Users get the same
one-line experience; the source stays closed. All packages are already built
minified-only with no sourcemaps, enforced by CI.

---

## 6. Product roadmap fit

- **Now:** names claimed and org in place (done). CLI ships with one editor —
  `add text` (the live rich text editor + wrappers). Detailed per-framework usage
  manuals are already written for all three wrapper packages.
- **Later:** each new editor is a new `openeditor-*` package and a new `add` target.
  The CLI architecture supports the whole family from day one; the image editor
  itself is a separate, full-size product effort to be scheduled.
- **Commercial phases:** the same CLI later gains `openeditors login` and license-key
  activation — the natural delivery point for paid plans. Premium model (decided):
  ONE pasted `licenseKey` in the config activates features offline; keys are
  domain-bound at purchase; localhost/dev domains always work without a key.

---

## 7. Cost, timing, and what is requested

- **Names:** already secured (six packages live as placeholders + `openeditors` org) — zero risk remaining.
- **CLI build:** ~2–3 days including tests (it is a small tool: detect, install, print).
- **Publishing real code:** everything (engine, three wrappers, CLI 1.0) ships over
  the placeholders together at the planned month-end publish — no early release.
- **Requested decision:** approve the roadmap placement of the CLI build
  (scheduled as Phase 25 in the engineering plan).
