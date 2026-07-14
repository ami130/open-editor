/**
 * FILE-LENGTH GUARD — automates the project's standing 300-line rule for all
 * non-CSS-in-JS source files. Added after the 2026-07-14 deep audit found two
 * files (editor-events.js at 321, toolbar-dropdown.js at 325) had silently
 * crossed the limit during the 17.5 sweep: the rule lived only in the README,
 * so nothing failed. Now the build does. `*-styles.js` files are exempt (CSS
 * strings), matching the documented rule.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const LIMIT = 300;

function allSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allSourceFiles(p));
    else if (entry.endsWith('.js') && !entry.endsWith('-styles.js')) out.push(p);
  }
  return out;
}

describe('300-line source limit (README coding standard, automated)', () => {
  it('every non-styles source file is within the limit', () => {
    const offenders = [];
    for (const file of allSourceFiles(SRC)) {
      // Count newline chars (= `wc -l`), not split segments — a trailing
      // newline is not an extra line.
      const lines = (readFileSync(file, 'utf-8').match(/\n/g) || []).length;
      if (lines > LIMIT) offenders.push(`${file.replace(SRC + '/', '')}: ${lines}`);
    }
    expect(offenders, `over the ${LIMIT}-line limit:\n${offenders.join('\n')}`).toEqual([]);
  });
});
