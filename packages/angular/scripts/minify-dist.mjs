/**
 * Post-process ng-packagr output: terser the FESM bundles in place. Angular
 * libraries must ship partial-Ivy FESM (the platform requirement), but the
 * project's minified-only distribution posture still applies — minified FESM
 * is valid FESM.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { globSync } from 'node:fs';
import { minify } from 'terser';

const files = globSync('dist/fesm*/**/*.mjs');
for (const f of files) {
  const code = readFileSync(f, 'utf-8');
  const out = await minify(code, { module: true, sourceMap: false });
  writeFileSync(f, out.code);
  console.log('[minify]', f, '→', out.code.length, 'bytes');
}
// Minified-only posture: no sourcemaps ship.
for (const m of globSync('dist/fesm*/**/*.map')) {
  unlinkSync(m);
  console.log('[minify] removed', m);
}
