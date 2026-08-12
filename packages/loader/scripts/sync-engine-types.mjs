/**
 * sync-engine-types.mjs — vendor the engine's public types into the loader.
 *
 * WHY THIS EXISTS: the loader is published as `openeditor-text`, while the
 * ENGINE is private and never published. A published package cannot import
 * types from an unpublished one — a consumer's `tsc` would fail on a module it
 * can never install.
 *
 * So the engine's `index.d.ts` is COPIED in at build time. It is generated, not
 * hand-maintained: hand-copying is how type declarations silently drift from
 * the implementation, and `openeditor-text-engine.d.ts` is checked by
 * `verify:engine-types` so a stale copy fails the build rather than shipping.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'core', 'index.d.ts');
const OUT = join(here, '..', 'openeditor-text-engine.d.ts');

const banner = `/**
 * GENERATED — do not edit. Run \`npm run sync:engine-types\` in packages/loader.
 *
 * The engine's public types, vendored so the published loader is
 * self-contained. The engine package itself is private and never published, so
 * a consumer could not install it to satisfy an import.
 *
 * Source: packages/core/index.d.ts
 */
declare module 'openeditor-text-engine' {
`;

const body = readFileSync(SRC, 'utf-8')
  // Inside a `declare module`, `export` is already module-scoped; `declare`
  // would be a redundant modifier and a TS error.
  .replace(/^export declare /gm, 'export ');

writeFileSync(OUT, `${banner}${body}\n}\n`);
// eslint-disable-next-line no-console
console.log(`synced engine types → ${OUT} (${body.split('\n').length} lines)`);
