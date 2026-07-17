/**
 * check-size.mjs — 17.7: the bundle-size CI gate. Fails (exit 1) if either
 * measurement regresses past its budget. Run AFTER `pnpm build`.
 *
 * Two measurements, both min+gzip:
 *   FULL — dist/omi-open-editor.esm.min.js (everything, single file)
 *   CORE — a tree-shaken consumer importing ONLY { OpenEditor } from the
 *          dist/esm module tree, bundled+minified here with rollup+terser
 *          (same toolchain as the build — deterministic, no extra deps).
 *
 * Budgets (2026-07 baseline + ~5% headroom — see README 17.7 for the honest
 * history: the original 30/80KB aspirations predate implementation and are
 * unreachable without feature deletion, which the plan forbids. Measured
 * competitive context, min+gz: Jodit 4 ≈ 90-100KB, CKEditor 5 classic ≈
 * 200KB+. Lowering these budgets is welcome; raising them is a conscious,
 * reviewed act — treat this file like api-contract.test.js.)
 */
import { rollup } from 'rollup';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BUDGETS = {
  // 2026-07-14 — raised for the 17.5 Free-Tier Sweep (a CONSCIOUS act, per the
  // rule below): 12 features (autocorrect, change case, page break, show
  // blocks, Alt+0 dialog, :emoji autocomplete, bookmarks, styles/text-part-
  // language dropdowns, type-around, sanitizer guardrails, getMarkdown) cost
  // ~6KB gz full / ~4KB gz core — measured 123_153 / 65_879. Prior baseline
  // (1.0.0): 111_977 / 62_537 with budgets 118/66K.
  // 2026-07-16 — raised full 130→132K (conscious): advanced bookmarks (icons/
  // colors/panel + shared HSV picker) and the modernized special-characters
  // picker (category tabs, ~24 more chars, live preview) — measured ~129.8K gz
  // full; +2K restores safe headroom. Core budget unchanged (66.3K).
  // 2026-07-16 (later) — raised full 132→134K (conscious): advanced tables
  // (built-in bordered/striped/dotted/borderless styles + header/stripe/cell
  // coloring + dialog seeding) and the robust submenu (on-screen flip, safe
  // corridor, RTL, keyboard focus-restore) — measured ~131.9K gz full, only
  // 65B under the old ceiling. +2K restores safe headroom for future work.
  // 2026-07-17 — raised full 134→135K (conscious): the FREE BYO-endpoint AI
  // streaming hook (19.7 tier-split — editor.aiComplete(), the funnel for the
  // premium AI product). Measured 134,047 gz full, 47B over the old ceiling;
  // +1K restores headroom. Core budget unchanged (67.6K, well under 69K).
  full: 135_000,  // bytes, gz
  core: 69_000,   // bytes, gz
};

const gz = (buf) => gzipSync(buf, { level: 9 }).length;

// FULL — the shipped single-file minified ESM.
const fullBytes = gz(readFileSync(join(ROOT, 'dist', 'open-editor.esm.min.js')));

// CORE — tree-shaken consumer of the module tree, built in-memory.
const VIRTUAL = '\0core-only-entry';
const bundle = await rollup({
  input: VIRTUAL,
  plugins: [
    {
      name: 'virtual-core-only',
      resolveId(id) { return id === VIRTUAL ? VIRTUAL : null; },
      load(id) {
        if (id !== VIRTUAL) return null;
        const entry = join(ROOT, 'dist', 'esm', 'index.js');
        return `import { OpenEditor } from ${JSON.stringify(entry)};\n`
          + `const e = new OpenEditor('#app', {});\ne.setHTML('<p>x</p>');\nconsole.log(e.getHTML());\n`;
      },
    },
    terser(),
  ],
  onwarn(w, warn) { if (w.code !== 'CIRCULAR_DEPENDENCY') warn(w); },
});
const { output } = await bundle.generate({ format: 'es' });
await bundle.close();
const coreBytes = gz(Buffer.from(output[0].code));

let failed = false;
for (const [name, actual] of [['full', fullBytes], ['core', coreBytes]]) {
  const budget = BUDGETS[name];
  const ok = actual <= budget;
  if (!ok) failed = true;
  console.log(`[size-gate] ${name}: ${actual.toLocaleString()} gz bytes (budget ${budget.toLocaleString()}) ${ok ? 'OK' : 'OVER BUDGET'}`);
}
process.exit(failed ? 1 : 0);
