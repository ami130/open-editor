/**
 * 17.3 — TYPE-DECLARATION CONTRACT. Two guards keeping index.d.ts honest:
 *
 * 1. LOCKSTEP: every frozen name in api-contract.test.js (instance methods,
 *    namespace methods, event names, config keys) must appear in index.d.ts.
 *    The frozen arrays are parsed out of api-contract.test.js TEXT so there is
 *    exactly one source of truth — editing the contract without updating the
 *    declarations (or vice versa) fails here.
 *
 * 2. COMPILE: tests/types/consumer.ts (a realistic strict-mode TypeScript
 *    consumer) must compile against index.d.ts. Signature drift a name-check
 *    can't see (wrong return type, wrong payload shape) fails here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DTS = readFileSync(join(__dirname, '..', 'index.d.ts'), 'utf-8');
const CONTRACT = readFileSync(join(__dirname, 'api-contract.test.js'), 'utf-8');

/** Pull the quoted names out of `const NAME = [ ... ]` in the contract text. */
function frozenArray(constName) {
  const m = CONTRACT.match(new RegExp(`${constName} = \\[([^\\]]*)\\]`, 's'));
  if (!m) throw new Error(`could not find ${constName} in api-contract.test.js`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('17.3 — index.d.ts stays in lockstep with the frozen contract', () => {
  it('every frozen instance method is declared', () => {
    for (const name of frozenArray('INSTANCE_METHODS')) {
      expect(DTS.includes(`${name}(`), `index.d.ts must declare ${name}()`).toBe(true);
    }
  });

  it('every frozen event name is declared in OpenEditorEventMap', () => {
    for (const name of frozenArray('FROZEN_EVENTS')) {
      expect(DTS.includes(`${name}:`), `index.d.ts event map must declare "${name}"`).toBe(true);
    }
  });

  it('every frozen config key is declared in OpenEditorConfig', () => {
    for (const name of frozenArray('FROZEN_CONFIG_KEYS')) {
      expect(DTS.includes(`${name}?:`), `index.d.ts config must declare "${name}?"`).toBe(true);
    }
  });

  it('every namespace method is declared', () => {
    // NAMESPACE_METHODS is an object literal — pull each quoted name.
    const m = CONTRACT.match(/NAMESPACE_METHODS = \{([\s\S]*?)\};/);
    expect(m, 'NAMESPACE_METHODS must exist in api-contract.test.js').toBeTruthy();
    for (const [, name] of m[1].matchAll(/'([^']+)'/g)) {
      expect(DTS.includes(`${name}(`), `index.d.ts must declare namespace method ${name}()`).toBe(true);
    }
  });
});

describe('17.3 — consumer.ts compiles under tsc --strict', () => {
  it('tsc --noEmit passes on the consumer fixture', () => {
    // Uses the workspace-local typescript devDep; ~5s. A compile error throws
    // with tsc's diagnostics in the message.
    const cwd = join(__dirname, 'types');
    try {
      execSync('npx tsc -p tsconfig.json', { cwd, stdio: 'pipe', timeout: 120000 });
    } catch (e) {
      throw new Error(
        `consumer.ts failed to compile against index.d.ts:\n${e.stdout || e.message}`,
        { cause: e }
      );
    }
  }, 130000);
});
