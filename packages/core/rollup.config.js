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

export default [
  // ESM module tree — for bundlers (webpack, vite, rollup, esbuild).
  // preserveModules keeps per-module granularity so tree-shaking works; each
  // module is individually minified.
  {
    input: 'src/index.js',
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
  {
    input: 'src/index.js',
    output: [
      { file: 'dist/open-editor.esm.min.js', format: 'es', banner, sourcemap: false, ...min },
    ],
  },
  // CJS build — for Node.js and older bundlers.
  // NOTE: must use the `.cjs` extension (not `.cjs.js`). Because package.json
  // sets "type": "module", Node parses any `*.js` file as ESM and a require()
  // of it returns an empty object — the `.cjs` extension opts back into CJS.
  {
    input: 'src/index.js',
    output: [
      { file: 'dist/open-editor.min.cjs', format: 'cjs', banner, sourcemap: false, exports: 'named', ...min },
    ],
  },
  // UMD build — for direct <script> tag usage in browser.
  {
    input: 'src/index.js',
    output: [
      { file: 'dist/open-editor.umd.min.js', format: 'umd', name: 'OpenEditor', banner, sourcemap: false, ...min },
    ],
  },
];
