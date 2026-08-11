/**
 * verify-reproducible.mjs — prove the delivery build is byte-reproducible
 * (execution plan §1.1, risk R17).
 *
 * WHY IT MATTERS: three separate things assume that rebuilding a given version
 * produces an identical artifact —
 *
 *   • Integrity verification (§1.4/§1.5): /session tells the loader the expected
 *     content hash. If a rebuild changes the bytes, that hash is wrong and every
 *     client rejects a perfectly good bundle.
 *   • Watermarking (§2.5a): per-licence marks are layered over an immutable base
 *     build. A drifting base makes attribution meaningless.
 *   • Rollback (§2.8): "serve v1.2.0 again" must mean the same v1.2.0.
 *
 * "Reproducible" was asserted in the plan; this measures it. Method: build
 * twice into separate directories, hash every artifact, diff.
 *
 * Run: node scripts/verify-reproducible.mjs   (exits non-zero on drift)
 */
import { execFileSync } from 'child_process';
import { readFileSync, rmSync, renameSync, existsSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist', 'delivery');
const SNAPSHOT = join(ROOT, 'dist', 'delivery-repro-check');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Hash every file in a directory, keyed by filename. */
function hashDir(dir) {
  const out = {};
  for (const f of readdirSync(dir).sort()) out[f] = sha(join(dir, f));
  return out;
}

function build(label) {
  process.stdout.write(`  building (${label})… `);
  execFileSync('npx', ['rollup', '-c', 'rollup.delivery.config.js'], {
    cwd: ROOT, stdio: 'pipe',
  });
  execFileSync('node', ['scripts/build-manifest.mjs'], { cwd: ROOT, stdio: 'pipe' });
  console.log('done');
}

console.log('\n[verify-reproducible] building twice and comparing hashes\n');

// Preserve whatever is currently there, so this check is non-destructive.
const hadExisting = existsSync(DIST);
if (hadExisting) {
  rmSync(SNAPSHOT, { recursive: true, force: true });
  renameSync(DIST, SNAPSHOT);
}

let first;
let second;
try {
  build('pass 1');
  first = hashDir(DIST);
  rmSync(DIST, { recursive: true, force: true });

  build('pass 2');
  second = hashDir(DIST);
} finally {
  // Restore the pre-existing build regardless of outcome.
  if (hadExisting) {
    rmSync(DIST, { recursive: true, force: true });
    renameSync(SNAPSHOT, DIST);
  }
}

const names = [...new Set([...Object.keys(first), ...Object.keys(second)])].sort();
const drifted = [];

console.log('');
for (const name of names) {
  const a = first[name];
  const b = second[name];
  if (a && b && a === b) {
    console.log(`  ✓ ${name.padEnd(16)} ${a.slice(0, 16)}…`);
  } else {
    drifted.push(name);
    console.log(`  ✗ ${name.padEnd(16)} ${a ? a.slice(0, 16) : 'MISSING'}… vs ${b ? b.slice(0, 16) : 'MISSING'}…`);
  }
}

if (drifted.length) {
  console.error('\n  NOT REPRODUCIBLE — these artifacts differ between builds:\n');
  for (const n of drifted) console.error(`    ${n}`);
  console.error('\n  Common causes: a timestamp or build id embedded in output, a');
  console.error('  non-deterministic minifier setting, or module ordering that varies.');
  console.error('  Integrity hashes, watermarking, and rollback all depend on this.\n');
  process.exit(1);
}

console.log(`\n  All ${names.length} artifacts are byte-identical across builds.\n`);
