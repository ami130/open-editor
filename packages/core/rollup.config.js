import { readFileSync } from 'fs';
import terser from '@rollup/plugin-terser';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const banner = `/*!
 * Open Editor Core v${pkg.version}
 * Pure JavaScript rich text editor engine
 * MIT License
 */`;

// 17.12 (production posture, decided 2026-07-14): the package ships
// MINIFIED-ONLY with NO sourcemaps — a source-available-minimum distribution
// (MIT-licensed, but not readable-source). Per-module terser on the ESM tree
// keeps consumer tree-shaking intact (measured: core-only consumers still drop
// all plugin code). Plain/readable builds can be produced locally by flipping
// `min`/sourcemap here; they are deliberately NOT part of the tarball.
const min = { plugins: [terser()] };

// PREMIUM BOUNDARY (do-not-ship): the free core reaches premium plugins ONLY via
// lazy dynamic import() in entitlements/premium-plugins.js. Mark those paths
// EXTERNAL so premium source is NEVER compiled into the published tarball — in
// ANY format. The import()s stay as runtime references; buildBundledPremiumSpecs
// already wraps each load() in try/catch, so on a public (premium-absent) install
// they fail soft (feature simply doesn't load) instead of crashing. In the
// monorepo/playground the source IS present, so the demo keeps premium.
// Premium is imported via the BARE specifier `@openeditor-premium/*` (a package
// name, not a relative path) — so bundlers treat it as a normal external module:
// no dangling relative path in the emitted dist, and on a public install where
// the premium package isn't present the dynamic import() simply rejects (the
// loader's try/catch fail-softs). Match the bare scope (and any stray relative
// premium path, belt-and-suspenders).
const external = (id) => id.startsWith('@openeditor-premium/') || /[\\/]premium[\\/]/.test(id);

export default [
  // ESM module tree — for bundlers (webpack, vite, rollup, esbuild).
  // preserveModules keeps per-module granularity so tree-shaking works; each
  // module is individually minified.
  {
    input: 'src/index.js',
    external,
    output: {
      dir: 'dist/esm',
      format: 'es',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: false,
      ...min,
    },
  },
  // Single-file minified ESM — for direct <script type="module"> / CDN use.
  // inlineDynamicImports: a single `file` output can't emit separate chunks, so
  // the Phase-1b lazy premium import()s are INLINED here (CDN/script consumers
  // have no chunk loader — premium stays eager for this format; that's the
  // honest, unavoidable outcome). Only the ESM-tree output (above) truly splits.
  {
    input: 'src/index.js',
    external,
    output: [
      { file: 'dist/open-editor.esm.min.js', format: 'es', banner, sourcemap: false, inlineDynamicImports: true, ...min },
    ],
  },
  // CJS build — for Node.js and older bundlers.
  // NOTE: must use the `.cjs` extension (not `.cjs.js`). Because package.json
  // sets "type": "module", Node parses any `*.js` file as ESM and a require()
  // of it returns an empty object — the `.cjs` extension opts back into CJS.
  {
    input: 'src/index.js',
    external,
    output: [
      { file: 'dist/open-editor.min.cjs', format: 'cjs', banner, sourcemap: false, exports: 'named', inlineDynamicImports: true, ...min },
    ],
  },
  // UMD build — for direct <script> tag usage in browser.
  {
    input: 'src/index.js',
    external,
    output: [
      { file: 'dist/open-editor.umd.min.js', format: 'umd', name: 'OpenEditor', banner, sourcemap: false, inlineDynamicImports: true, ...min },
    ],
  },
];
