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
  full: 118_000,  // bytes, gz — measured 111_977 on 2026-07-13
  core: 66_000,   // bytes, gz — measured 62_537 on 2026-07-13
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
